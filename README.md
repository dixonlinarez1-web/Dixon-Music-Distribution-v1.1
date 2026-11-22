# Dixon Music Distribution — aplicación inicial

## Qué incluye
- Registro gratuito de artistas, agrupaciones y sellos.
- Inicio y cierre de sesión con contraseñas cifradas mediante bcrypt.
- Panel privado básico para cada artista.
- Recepción de solicitudes de lanzamiento con audio y portada.
- Estado inicial de cada lanzamiento: pendiente de revisión.
- Base de datos SQLite y almacenamiento local de archivos.
- Modelo comercial configurable como propuesta: 85% artista / 15% Dixon, sobre regalías netas distribuibles, expresadas en EUR.

## Requisitos
Node.js 20 o superior.

## Ejecutar en tu computador
1. Descomprime el ZIP.
2. Abre una terminal dentro de la carpeta.
3. Ejecuta `npm install`.
4. Copia `.env.example` a `.env`.
5. Genera una clave aleatoria larga para `SESSION_SECRET` y colócala en `.env`.
6. Ejecuta `npm start`.
7. Abre `http://localhost:3000`.

## Antes de publicarla en internet
Esta es una primera aplicación funcional para pruebas, no una plataforma comercial lista para recibir artistas reales. Antes de producción:
- Usa hosting con HTTPS, disco persistente y copias de seguridad.
- Cambia la sesión y almacenamiento por infraestructura gestionada si el hosting es efímero.
- Configura `NODE_ENV=production`, secretos fuertes y cookies seguras.
- Añade verificación de correo, recuperación de contraseña, protección CSRF, antivirus/validación real de archivos y límites por usuario.
- Añade panel administrativo protegido, moderación, contratos, términos, privacidad y proceso de reclamación de derechos.
- Revisa obligaciones de protección de datos, impuestos, KYC/AML y pagos internacionales con asesoría profesional.
- No guardes datos bancarios sensibles en esta app.

## Distribución y pagos: todavía no conectados
La aplicación NO envía música a Spotify, Apple Music, YouTube Music ni otras tiendas. Tampoco calcula regalías reales ni efectúa pagos. Para activar esas funciones Dixon necesita firmar un acuerdo con un distribuidor mayorista que autorice distribución de terceros/API y conectar un proveedor de pagos compatible con EUR. Los informes de regalías deben proceder del socio y conciliarse antes de mostrar saldos pagaderos.

## Plazo de 3 días
Comunica únicamente un objetivo de revisión y entrega de materiales completos al socio en tres días hábiles. La fecha de publicación depende de la aceptación del socio y de los tiempos y reglas de cada tienda. No prometas publicación garantizada en 3 días.


## Panel administrativo (añadido en v1.1)
- Abre `http://localhost:3000/admin.html`.
- Configura `ADMIN_EMAIL` y `ADMIN_PASSWORD_HASH` en `.env`.
- Para generar el hash bcrypt de la contraseña administrativa:
  `node -e "require('bcryptjs').hash(process.argv[1],12).then(console.log)" "TU_CLAVE_LARGA"`
- Copia el hash resultante en `ADMIN_PASSWORD_HASH`. No pongas la contraseña en el código ni la compartas por chat.
- El administrador puede listar artistas y lanzamientos, descargar los archivos recibidos y cambiar el estado de revisión.
- Estados administrativos no equivalen a aceptación por tiendas ni a entrega al distribuidor: el envío real aún no está integrado.
