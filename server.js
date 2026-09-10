const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
require('dotenv').config();

const app = express();

app.set('trust proxy', 1);

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const CAMPUS_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

if (!DATABASE_URL) {
  console.warn('ADVERTENCIA: DATABASE_URL no está configurada. En Render debes crearla como variable de entorno.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: DATABASE_URL ? new pgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }) : undefined,
  secret: process.env.SESSION_SECRET || 'clave-local-solo-para-desarrollo',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

async function initDatabase() {
  if (!DATABASE_URL) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(80) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('alumno', 'admin')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS alumnos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100) NOT NULL,
      dni VARCHAR(30),
      email VARCHAR(150),
      telefono VARCHAR(50),
      carrera VARCHAR(200),
      direccion VARCHAR(250),
      estado VARCHAR(50) DEFAULT 'Alumno regular',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS materias (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(200) NOT NULL,
      codigo VARCHAR(30) UNIQUE NOT NULL,
      progreso INTEGER DEFAULT 0 CHECK (progreso BETWEEN 0 AND 100),
      estado VARCHAR(50) DEFAULT 'Activo'
    );

    CREATE TABLE IF NOT EXISTS inscripciones (
      id SERIAL PRIMARY KEY,
      alumno_id INTEGER REFERENCES alumnos(id) ON DELETE CASCADE,
      materia_id INTEGER REFERENCES materias(id) ON DELETE CASCADE,
      UNIQUE(alumno_id, materia_id)
    );

    CREATE TABLE IF NOT EXISTS calificaciones (
      id SERIAL PRIMARY KEY,
      alumno_id INTEGER REFERENCES alumnos(id) ON DELETE CASCADE,
      materia_id INTEGER REFERENCES materias(id) ON DELETE CASCADE,
      nota NUMERIC(4,2) CHECK (nota >= 0 AND nota <= 10),
      fecha DATE DEFAULT CURRENT_DATE
    );

    CREATE TABLE IF NOT EXISTS eventos_calendario (
      id SERIAL PRIMARY KEY,
      titulo VARCHAR(200) NOT NULL,
      fecha DATE NOT NULL,
      tipo VARCHAR(50) DEFAULT 'Académico',
      descripcion TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const adminHash = await bcrypt.hash('Admin123!', 12);
  const alumnoHash = await bcrypt.hash('Alumno123!', 12);

  await pool.query(`
    INSERT INTO users (username, password_hash, role)
    VALUES ('admin', $1, 'admin')
    ON CONFLICT (username) DO NOTHING;
  `, [adminHash]);

  const alumnoUser = await pool.query(`
    INSERT INTO users (username, password_hash, role)
    VALUES ('alumno', $1, 'alumno')
    ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
    RETURNING id;
  `, [alumnoHash]);

  const alumnoUserId = alumnoUser.rows[0]?.id || (await pool.query("SELECT id FROM users WHERE username='alumno'")).rows[0].id;

  await pool.query(`
    INSERT INTO alumnos (user_id, nombre, apellido, dni, email, telefono, carrera, direccion)
    VALUES ($1, 'Ezequiel', 'Blanco', '12345678', 'alumno@email.com', '1123456789', 'Profesorado de Educación Física', 'Buenos Aires, Argentina')
    ON CONFLICT (user_id) DO NOTHING;
  `, [alumnoUserId]);

  const subjects = [
    ['Anatomía y Fisiología', 'AF1', 82, 'En curso'],
    ['Pedagogía y Didáctica', 'PED1', 68, 'Activo'],
    ['Prácticas Corporales y Deportes', 'PCD1', 74, 'En curso'],
    ['Psicología Educacional', 'PSI1', 61, 'Activo'],
    ['Historia de la Educación Física', 'HEF1', 55, 'Pendiente']
  ];

  const defaultEvents = [
    ['Parcial de Anatomía y Fisiología', '2026-09-10', 'Evaluación', 'Evaluación correspondiente a la primera unidad.'],
    ['Clase práctica de deportes', '2026-09-16', 'Clase práctica', 'Actividad presencial con indumentaria deportiva.'],
    ['Entrega de planificación didáctica', '2026-09-24', 'Entrega', 'Presentar la planificación en el aula virtual.']
  ];

  for (const [titulo, fecha, tipo, descripcion] of defaultEvents) {
    await pool.query(`
      INSERT INTO eventos_calendario (titulo, fecha, tipo, descripcion)
      SELECT $1,$2,$3,$4
      WHERE NOT EXISTS (SELECT 1 FROM eventos_calendario WHERE titulo = $1::varchar AND fecha = $2::date)
    `, [titulo, fecha, tipo, descripcion]);
  }

  for (const [nombre, codigo, progreso, estado] of subjects) {
    await pool.query(`
      INSERT INTO materias (nombre, codigo, progreso, estado)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (codigo) DO NOTHING;
    `, [nombre, codigo, progreso, estado]);
  }

  const alumnoId = (await pool.query('SELECT id FROM alumnos WHERE user_id=$1', [alumnoUserId])).rows[0].id;
  const materias = (await pool.query('SELECT id FROM materias ORDER BY id')).rows;

  for (const materia of materias) {
    await pool.query(`
      INSERT INTO inscripciones (alumno_id, materia_id)
      VALUES ($1,$2)
      ON CONFLICT DO NOTHING;
    `, [alumnoId, materia.id]);
  }
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'No autenticado.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso solo para administradores.' });
  }
  next();
}

app.get('/api/health', async (_req, res) => {
  try {
    if (!DATABASE_URL) return res.json({ ok: true, database: 'not-configured' });
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    res.status(500).json({ ok: false, database: 'error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: 'Completá usuario y contraseña.'
      });
    }

    const result = await pool.query(
      'SELECT id, username, password_hash, role FROM users WHERE username=$1',
      [username.trim()]
    );

    if (!result.rows[0]) {
      return res.status(401).json({
        error: 'Usuario o contraseña incorrectos.'
      });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!valid) {
      return res.status(401).json({
        error: 'Usuario o contraseña incorrectos.'
      });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    res.json({
      ok: true,
      user: req.session.user
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Error interno del servidor.'
    });
  }
});


// =====================================
// REGISTRO DE NUEVOS ALUMNOS
// =====================================

app.post('/api/registro', async (req, res) => {
  try {
    const {
      username,
      password,
      nombre,
      apellido,
      dni,
      email,
      telefono,
      carrera,
      direccion
    } = req.body;

    if (!username || !password || !nombre || !apellido || !email) {
      return res.status(400).json({
        error: 'Usuario, contraseña, nombre, apellido y email son obligatorios.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'La contraseña debe tener al menos 6 caracteres.'
      });
    }

    const usernameLimpio = username.trim().toLowerCase();
    const emailLimpio = email.trim();

    const existente = await pool.query(
      'SELECT id FROM users WHERE username=$1',
      [usernameLimpio]
    );

    if (existente.rows[0]) {
      return res.status(409).json({
        error: 'Ese usuario ya existe.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const userResult = await pool.query(`
      INSERT INTO users (username, password_hash, role)
      VALUES ($1, $2, 'alumno')
      RETURNING id, username, role
    `, [
      usernameLimpio,
      passwordHash
    ]);

    const user = userResult.rows[0];

    const alumnoResult = await pool.query(`
      INSERT INTO alumnos (
        user_id,
        nombre,
        apellido,
        dni,
        email,
        telefono,
        carrera,
        direccion
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING
        id,
        nombre,
        apellido,
        dni,
        email,
        telefono,
        carrera,
        direccion,
        estado
    `, [
      user.id,
      nombre.trim(),
      apellido.trim(),
      (dni || '').trim(),
      emailLimpio,
      (telefono || '').trim(),
      (carrera || '').trim(),
      (direccion || '').trim()
    ]);

    res.status(201).json({
      ok: true,
      mensaje: 'Cuenta creada correctamente.',
      user,
      profile: alumnoResult.rows[0]
    });

  } catch (error) {
    console.error('Error en registro:', error);

    res.status(500).json({
      error: 'No se pudo crear la cuenta.'
    });
  }
});


app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// =====================================
// SESIÓN / PERFIL PROPIO
// =====================================

// Usuario logueado y, si es alumno, su perfil (usado por app.js: loadMe/loadProfile)
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;

    if (user.role === 'admin') {
      return res.json({ user, profile: null });
    }

    const result = await pool.query(
      'SELECT id, nombre, apellido, dni, email, telefono, carrera, direccion, estado FROM alumnos WHERE user_id=$1',
      [user.id]
    );

    res.json({ user, profile: result.rows[0] || null });
  } catch (error) {
    console.error('Error al obtener sesión:', error);
    res.status(500).json({ error: 'No se pudo obtener la información de la sesión.' });
  }
});

// Un alumno edita sus propios datos (usado por saveProfile en app.js)
app.put('/api/alumno/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, dni, email, telefono, carrera, direccion } = req.body;

    const propio = await pool.query('SELECT id FROM alumnos WHERE id=$1 AND user_id=$2', [id, req.session.user.id]);

    if (!propio.rows[0]) {
      return res.status(403).json({ error: 'No podés editar este perfil.' });
    }

    const result = await pool.query(`
      UPDATE alumnos
      SET nombre = COALESCE($1, nombre),
          apellido = COALESCE($2, apellido),
          dni = COALESCE($3, dni),
          email = COALESCE($4, email),
          telefono = COALESCE($5, telefono),
          carrera = COALESCE($6, carrera),
          direccion = COALESCE($7, direccion)
      WHERE id = $8
      RETURNING id, nombre, apellido, dni, email, telefono, carrera, direccion, estado
    `, [nombre, apellido, dni, email, telefono, carrera, direccion, id]);

    res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({ error: 'No se pudo actualizar el perfil.' });
  }
});

// =====================================
// MATERIAS
// =====================================

// app.js espera un array directo (rows.length, rows.map)
app.get('/api/materias', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre, codigo, progreso, estado FROM materias ORDER BY nombre');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al listar materias:', error);
    res.status(500).json({ error: 'No se pudieron obtener las materias.' });
  }
});

// =====================================
// ADMINISTRACIÓN DE ALUMNOS
// =====================================

// Listado completo de alumnos (usado por loadAdmin en app.js; array directo)
app.get('/api/admin/alumnos', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.nombre, a.apellido, a.dni, a.email, a.telefono,
             a.carrera, a.direccion, a.estado, u.username
      FROM alumnos a
      JOIN users u ON u.id = a.user_id
      ORDER BY a.apellido, a.nombre
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al listar alumnos:', error);
    res.status(500).json({ error: 'No se pudo obtener el listado de alumnos.' });
  }
});

// Un admin consulta los datos de un alumno puntual (usado por adminEdit)
app.get('/api/alumno/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombre, apellido, dni, email, telefono, carrera, direccion, estado FROM alumnos WHERE id=$1',
      [req.params.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Alumno no encontrado.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al obtener alumno:', error);
    res.status(500).json({ error: 'No se pudo obtener el alumno.' });
  }
});

// Un admin edita los datos de cualquier alumno (usado por adminEdit)
app.put('/api/admin/alumno/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, dni, email, telefono, carrera, direccion } = req.body;

    const result = await pool.query(`
      UPDATE alumnos
      SET nombre = COALESCE($1, nombre),
          apellido = COALESCE($2, apellido),
          dni = COALESCE($3, dni),
          email = COALESCE($4, email),
          telefono = COALESCE($5, telefono),
          carrera = COALESCE($6, carrera),
          direccion = COALESCE($7, direccion)
      WHERE id = $8
      RETURNING id, nombre, apellido, dni, email, telefono, carrera, direccion, estado
    `, [nombre, apellido, dni, email, telefono, carrera, direccion, id]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Alumno no encontrado.' });
    }

    res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar alumno:', error);
    res.status(500).json({ error: 'No se pudo actualizar el alumno.' });
  }
});

// =====================================
// CERTIFICADO DE ALUMNO REGULAR (PDF + QR)
// =====================================

// El propio alumno descarga el suyo, o el admin lo genera para cualquier alumno
app.get('/api/alumno/:id/certificado', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (req.session.user.role !== 'admin') {
      const propio = await pool.query('SELECT id FROM alumnos WHERE id=$1 AND user_id=$2', [id, req.session.user.id]);
      if (!propio.rows[0]) {
        return res.status(403).json({ error: 'No podés descargar este certificado.' });
      }
    }

    const result = await pool.query(
      'SELECT nombre, apellido, dni, carrera, estado FROM alumnos WHERE id=$1',
      [id]
    );

    const alumno = result.rows[0];

    if (!alumno) {
      return res.status(404).json({ error: 'Alumno no encontrado.' });
    }

    const qrDataUrl = await QRCode.toDataURL(CAMPUS_URL, { margin: 1, width: 200 });
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

    const fecha = new Intl.DateTimeFormat('es-AR', {
      day: '2-digit', month: 'long', year: 'numeric'
    }).format(new Date());

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificado-${alumno.apellido}-${alumno.nombre}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    // Recuadro general de la constancia
    doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).stroke('#172033');

    // Encabezado institucional
    doc.font('Helvetica-Bold').fontSize(16).text('CAMPUS VIRTUAL', 50, 55, { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor('#667085')
      .text('Plataforma académica · Documento generado digitalmente', { align: 'center' });
    doc.fillColor('black');
    doc.moveDown(1.5);

    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke('#e5e7eb');
    doc.moveDown(1.2);

    doc.font('Times-Bold').fontSize(15).text('CONSTANCIA DE ALUMNO REGULAR', { align: 'center', underline: true });
    doc.moveDown(2);

    // Texto de la constancia
    doc.font('Times-Roman').fontSize(12).text(
      `Se deja constancia de que, a la fecha, ${alumno.nombre} ${alumno.apellido}, ` +
      `DNI N° ${alumno.dni || 'no registrado'}, reviste la condición de "${alumno.estado || 'Alumno regular'}" ` +
      `en la carrera de ${alumno.carrera || 'no registrada'}, dictada en Campus Virtual.`,
      { align: 'justify', lineGap: 5 }
    );
    doc.moveDown(1.5);

    doc.text(
      'A pedido del/la interesado/a y para ser presentada ante quien corresponda, ' +
      `se extiende la presente en formato digital, con fecha ${fecha}.`,
      { align: 'justify', lineGap: 5 }
    );
    doc.moveDown(4);

    // Firma
    const firmaY = doc.y;
    doc.moveTo(80, firmaY).lineTo(280, firmaY).stroke('#172033');
    doc.font('Helvetica').fontSize(9)
      .text('Firma y sello de Campus Virtual', 80, firmaY + 5, { width: 200, align: 'center' });

    // QR de verificación / acceso
    const qrX = doc.page.width - 50 - 110;
    doc.image(qrBuffer, qrX, firmaY - 55, { width: 110 });
    doc.fontSize(8).fillColor('#667085')
      .text('Escaneá para acceder al Campus Virtual', qrX - 15, firmaY + 58, { width: 140, align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error al generar certificado:', error);
    res.status(500).json({ error: 'No se pudo generar el certificado.' });
  }
});


// =====================================
// CALENDARIO
// =====================================

function formatFecha(row) {
  return {
    ...row,
    fecha: row.fecha instanceof Date ? row.fecha.toISOString().slice(0, 10) : row.fecha
  };
}

// app.js espera un array directo (calendarEvents.filter/.some)
app.get('/api/calendario', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, titulo, fecha, tipo, descripcion FROM eventos_calendario ORDER BY fecha ASC'
    );
    res.json(result.rows.map(formatFecha));
  } catch (error) {
    console.error('Error al listar eventos:', error);
    res.status(500).json({ error: 'No se pudieron obtener los eventos.' });
  }
});

// Crear un nuevo evento (solo admin)
app.post('/api/admin/calendario', requireAdmin, async (req, res) => {
  try {
    const { titulo, fecha, tipo, descripcion } = req.body;

    if (!titulo || !fecha) {
      return res.status(400).json({ error: 'Título y fecha son obligatorios.' });
    }

    const result = await pool.query(`
      INSERT INTO eventos_calendario (titulo, fecha, tipo, descripcion)
      VALUES ($1, $2, COALESCE($3, 'Académico'), COALESCE($4, ''))
      RETURNING id, titulo, fecha, tipo, descripcion
    `, [titulo, fecha, tipo, descripcion]);

    res.status(201).json(formatFecha(result.rows[0]));
  } catch (error) {
    console.error('Error al crear evento:', error);
    res.status(500).json({ error: 'No se pudo crear el evento.' });
  }
});

// Editar un evento existente (solo admin)
app.put('/api/admin/calendario/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, fecha, tipo, descripcion } = req.body;

    const result = await pool.query(`
      UPDATE eventos_calendario
      SET titulo = COALESCE($1, titulo),
          fecha = COALESCE($2, fecha),
          tipo = COALESCE($3, tipo),
          descripcion = COALESCE($4, descripcion)
      WHERE id = $5
      RETURNING id, titulo, fecha, tipo, descripcion
    `, [titulo, fecha, tipo, descripcion, id]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Evento no encontrado.' });
    }

    res.json(formatFecha(result.rows[0]));
  } catch (error) {
    console.error('Error al actualizar evento:', error);
    res.status(500).json({ error: 'No se pudo actualizar el evento.' });
  }
});

// Eliminar un evento (solo admin)
app.delete('/api/admin/calendario/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM eventos_calendario WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al eliminar evento:', error);
    res.status(500).json({ error: 'No se pudo eliminar el evento.' });
  }
});

// =====================================
// INICIO DEL SERVIDOR
// =====================================

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor escuchando en el puerto ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Error al inicializar la base de datos:', error);
    process.exit(1);
  });