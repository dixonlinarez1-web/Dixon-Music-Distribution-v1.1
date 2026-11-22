require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.includes("CAMBIA-")) {
  console.error("ERROR: configura SESSION_SECRET en .env antes de iniciar.");
  process.exit(1);
}
const db = new Database(path.join(DATA_DIR, "dixon.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS artists (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 account_type TEXT NOT NULL, full_name TEXT NOT NULL, artist_name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE, country TEXT NOT NULL, genre TEXT NOT NULL,
 password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS releases (
 id INTEGER PRIMARY KEY AUTOINCREMENT, artist_id INTEGER NOT NULL,
 artist_name TEXT NOT NULL, title TEXT NOT NULL, release_type TEXT NOT NULL,
 desired_date TEXT NOT NULL, audio_file TEXT NOT NULL, cover_file TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'Recibido - pendiente de revisión',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(artist_id) REFERENCES artists(id)
);
`);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false, limit: "30kb" }));
app.use(express.json({ limit: "30kb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET,
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000*60*60*8 }
}));
app.use(express.static(path.join(__dirname, "public")));
const limiter = rateLimit({ windowMs: 15*60*1000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use("/api/", limiter);

const allowedAudio = new Set(["audio/wav","audio/x-wav","audio/mpeg","audio/flac","audio/mp4"]);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase())
});
const upload = multer({
  storage, limits: { fileSize: 100 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "audio" && allowedAudio.has(file.mimetype)) return cb(null, true);
    if (file.fieldname === "cover" && ["image/jpeg","image/png"].includes(file.mimetype)) return cb(null, true);
    cb(new Error("Formato no permitido. Audio: WAV/MP3/FLAC. Portada: JPG/PNG."));
  }
});
const clean = v => String(v || "").trim();
const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const requireAuth = (req,res,next) => req.session.artistId ? next() : res.status(401).json({error:"Inicia sesión para continuar."});
const requireAdmin = (req,res,next) => req.session.isAdmin === true ? next() : res.status(401).json({error:"Acceso administrativo no autorizado."});

app.post("/api/register", async (req,res) => {
  const {accountType,fullName,artistName,email,country,genre,password} = req.body || {};
  if (![accountType,fullName,artistName,email,country,genre,password].every(x=>clean(x))) return res.status(400).json({error:"Completa todos los campos."});
  if (!validEmail(clean(email))) return res.status(400).json({error:"Correo electrónico no válido."});
  if (String(password).length < 12) return res.status(400).json({error:"La contraseña debe tener al menos 12 caracteres."});
  if (String(fullName).length>120 || String(artistName).length>120) return res.status(400).json({error:"Nombre demasiado largo."});
  try {
    const hash = await bcrypt.hash(String(password), 12);
    const info = db.prepare(`INSERT INTO artists(account_type,full_name,artist_name,email,country,genre,password_hash) VALUES(?,?,?,?,?,?,?)`)
      .run(clean(accountType),clean(fullName),clean(artistName),clean(email).toLowerCase(),clean(country),clean(genre),hash);
    req.session.artistId = Number(info.lastInsertRowid);
    req.session.email = clean(email).toLowerCase();
    res.json({ok:true,message:"Cuenta creada. Bienvenido a Dixon Music Distribution."});
  } catch(e) {
    if (String(e).includes("UNIQUE")) return res.status(409).json({error:"Ese correo ya tiene una cuenta."});
    res.status(500).json({error:"No se pudo crear la cuenta."});
  }
});
app.post("/api/login", async (req,res) => {
  const email=clean(req.body.email).toLowerCase(), password=String(req.body.password||"");
  const user=db.prepare("SELECT id,email,password_hash FROM artists WHERE email=?").get(email);
  if (!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:"Correo o contraseña incorrectos."});
  req.session.artistId=user.id; req.session.email=user.email;
  res.json({ok:true});
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",requireAuth,(req,res)=>{
 const a=db.prepare("SELECT id,account_type,full_name,artist_name,email,country,genre,created_at FROM artists WHERE id=?").get(req.session.artistId);
 const releases=db.prepare("SELECT id,title,release_type,desired_date,status,created_at FROM releases WHERE artist_id=? ORDER BY id DESC").all(req.session.artistId);
 res.json({artist:a,releases,commission:{artist:85,dixon:15,currency:"EUR"}});
});
app.post("/api/releases",requireAuth,(req,res)=>{
 upload.fields([{name:"audio",maxCount:1},{name:"cover",maxCount:1}])(req,res,err=>{
  if(err) return res.status(400).json({error:err.message});
  const audio=req.files?.audio?.[0], cover=req.files?.cover?.[0];
  const {artistName,title,releaseType,desiredDate,rightsConfirmed}=req.body;
  if(!audio || !cover || ![artistName,title,releaseType,desiredDate].every(x=>clean(x)) || rightsConfirmed!=="yes") {
    [audio,cover].filter(Boolean).forEach(f=>fs.unlink(f.path,()=>{}));
    return res.status(400).json({error:"Faltan datos, archivos o confirmación de derechos."});
  }
  const info=db.prepare(`INSERT INTO releases(artist_id,artist_name,title,release_type,desired_date,audio_file,cover_file) VALUES(?,?,?,?,?,?,?)`)
    .run(req.session.artistId,clean(artistName),clean(title),clean(releaseType),clean(desiredDate),audio.filename,cover.filename);
  res.json({ok:true,id:Number(info.lastInsertRowid),message:"Lanzamiento recibido y pendiente de revisión."});
 });
});

app.post("/api/admin/login", async (req,res) => {
  const email = clean(req.body.email).toLowerCase();
  const password = String(req.body.password || "");
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD_HASH) {
    return res.status(503).json({error:"El acceso de administrador aún no está configurado en el servidor."});
  }
  if (email !== process.env.ADMIN_EMAIL.toLowerCase() ||
      !(await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH))) {
    return res.status(401).json({error:"Credenciales administrativas incorrectas."});
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({error:"No se pudo iniciar la sesión."});
    req.session.isAdmin = true;
    req.session.email = email;
    res.json({ok:true});
  });
});
app.get("/api/admin/me", requireAdmin, (_req,res) => res.json({ok:true}));
app.post("/api/admin/logout", requireAdmin, (req,res) => req.session.destroy(() => res.json({ok:true})));

app.get("/api/admin/summary",requireAdmin,(req,res)=>{
 const artists=db.prepare("SELECT id,artist_name,email,country,genre,created_at FROM artists ORDER BY id DESC").all();
 const releases=db.prepare(`SELECT r.id,r.artist_name,r.title,r.release_type,r.desired_date,r.status,r.created_at,a.email
 FROM releases r JOIN artists a ON a.id=r.artist_id ORDER BY r.id DESC`).all();
 res.json({artists,releases});
});
app.patch("/api/admin/releases/:id/status", requireAdmin, (req,res) => {
 const allowed = new Set(["Recibido - pendiente de revisión","En revisión","Necesita correcciones","Aprobado para envío al distribuidor","Enviado al distribuidor","Rechazado"]);
 const status = clean(req.body.status);
 if (!allowed.has(status)) return res.status(400).json({error:"Estado no permitido."});
 const result = db.prepare("UPDATE releases SET status=? WHERE id=?").run(status, Number(req.params.id));
 if (!result.changes) return res.status(404).json({error:"Lanzamiento no encontrado."});
 res.json({ok:true});
});
app.get("/api/admin/files/:id/:kind",requireAdmin,(req,res)=>{
 const kind=req.params.kind;
 if(!["audio","cover"].includes(kind)) return res.status(404).end();
 const row=db.prepare(`SELECT ${kind}_file AS file FROM releases WHERE id=?`).get(Number(req.params.id));
 if(!row) return res.status(404).end();
 res.download(path.join(UPLOAD_DIR,row.file));
});
app.use((err,_req,res,_next)=>{ console.error(err); res.status(500).json({error:"Error interno."}); });
app.listen(PORT,()=>console.log(`Dixon Music Distribution listo en http://localhost:${PORT}`));
