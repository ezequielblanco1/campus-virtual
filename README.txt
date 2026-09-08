CAMPUS VIRTUAL ONLINE
=====================

Incluye:
- Frontend responsive HTML/CSS/JS
- Backend Node.js + Express
- Login con roles alumno/administrador
- Sesiones
- Contraseñas con hash bcrypt
- PostgreSQL
- Edición real de datos de alumnos
- Panel de administración
- Preparado para Render

1) REQUISITOS
- Node.js 20 o superior
- PostgreSQL local para ejecutar el proyecto completo en tu PC

2) INSTALAR
En esta carpeta:
    npm install

3) CONFIGURAR
Copiá .env.example como .env y completá:
    DATABASE_URL=postgresql://usuario:password@localhost:5432/campus_virtual
    SESSION_SECRET=una-clave-larga-y-segura

4) EJECUTAR
    npm start
Luego abrir:
    http://localhost:3000

5) USUARIOS DE PRUEBA
Alumno:
    usuario: alumno
    contraseña: Alumno123!

Administrador:
    usuario: admin
    contraseña: Admin123!

La primera ejecución crea las tablas y los datos de ejemplo automáticamente.

6) PUBLICAR EN RENDER
- Subí esta carpeta a un repositorio de GitHub.
- En Render: New > PostgreSQL y creá la base.
- En Render: New > Web Service y conectá el repositorio.
- Build Command: npm install
- Start Command: npm start
- Variables de entorno:
    NODE_ENV=production
    DATABASE_URL=(la Internal Database URL de tu Postgres)
    SESSION_SECRET=(clave larga y aleatoria)
- Render publicará el servicio en un subdominio onrender.com.

IMPORTANTE
Las credenciales de ejemplo sirven para demostración. Para un campus real deben cambiarse y conviene agregar recuperación de contraseña, 2FA, auditoría, validaciones más estrictas y políticas de seguridad.


CALENDARIO
- El administrador tiene una nueva sección 'Editar calendario'.
- Puede agregar, editar y eliminar eventos.
- Los alumnos pueden ver las próximas fechas en el panel de inicio.
