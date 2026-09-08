const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();

app.set('trust proxy', 1);

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;

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
    if (!username || !password) return res.status(400).json({ error: 'Completá usuario y contraseña.' });
    const result = await pool.query('SELECT id, username, password_hash, role FROM users WHERE username=$1', [username.trim()]);
    if (!result.rows[0]) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.json({ ok: true, user: req.session.user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    if (req.session.user.role === 'admin') {
      return res.json({ user: req.session.user, profile: null });
    }
    const result = await pool.query(`
      SELECT a.id, a.nombre, a.apellido, a.dni, a.email, a.telefono, a.carrera, a.direccion, a.estado
      FROM alumnos a WHERE a.user_id=$1
    `, [req.session.user.id]);
    res.json({ user: req.session.user, profile: result.rows[0] || null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo cargar el perfil.' });
  }
});

app.get('/api/alumno/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (req.session.user.role !== 'admin') {
      const own = await pool.query('SELECT id FROM alumnos WHERE user_id=$1', [req.session.user.id]);
      if (!own.rows[0] || own.rows[0].id !== id) return res.status(403).json({ error: 'No autorizado.' });
    }
    const result = await pool.query(`
      SELECT id, nombre, apellido, dni, email, telefono, carrera, direccion, estado
      FROM alumnos WHERE id=$1
    `, [id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Alumno no encontrado.' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo cargar el alumno.' });
  }
});

app.put('/api/alumno/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (req.session.user.role !== 'admin') {
      const own = await pool.query('SELECT id FROM alumnos WHERE user_id=$1', [req.session.user.id]);
      if (!own.rows[0] || own.rows[0].id !== id) return res.status(403).json({ error: 'No autorizado.' });
    }

    const { nombre, apellido, dni, email, telefono, carrera, direccion } = req.body;
    if (!nombre || !apellido || !email) return res.status(400).json({ error: 'Nombre, apellido y email son obligatorios.' });

    const result = await pool.query(`
      UPDATE alumnos
      SET nombre=$1, apellido=$2, dni=$3, email=$4, telefono=$5, carrera=$6, direccion=$7
      WHERE id=$8
      RETURNING id, nombre, apellido, dni, email, telefono, carrera, direccion, estado
    `, [nombre.trim(), apellido.trim(), (dni || '').trim(), email.trim(), (telefono || '').trim(), (carrera || '').trim(), (direccion || '').trim(), id]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Alumno no encontrado.' });
    res.json({ ok: true, mensaje: 'Datos actualizados correctamente.', profile: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudieron guardar los cambios.' });
  }
});


app.get('/api/calendario', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, titulo, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, tipo, descripcion
      FROM eventos_calendario
      ORDER BY fecha, id
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo cargar el calendario.' });
  }
});

app.post('/api/admin/calendario', requireAdmin, async (req, res) => {
  try {
    const { titulo, fecha, tipo, descripcion } = req.body;
    if (!titulo || !fecha) return res.status(400).json({ error: 'Título y fecha son obligatorios.' });
    const result = await pool.query(`
      INSERT INTO eventos_calendario (titulo, fecha, tipo, descripcion)
      VALUES ($1,$2,$3,$4)
      RETURNING id, titulo, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, tipo, descripcion
    `, [titulo.trim(), fecha, (tipo || 'Académico').trim(), (descripcion || '').trim()]);
    res.status(201).json({ ok: true, evento: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo crear el evento.' });
  }
});

app.put('/api/admin/calendario/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { titulo, fecha, tipo, descripcion } = req.body;
    if (!titulo || !fecha) return res.status(400).json({ error: 'Título y fecha son obligatorios.' });
    const result = await pool.query(`
      UPDATE eventos_calendario
      SET titulo=$1, fecha=$2, tipo=$3, descripcion=$4
      WHERE id=$5
      RETURNING id, titulo, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, tipo, descripcion
    `, [titulo.trim(), fecha, (tipo || 'Académico').trim(), (descripcion || '').trim(), id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Evento no encontrado.' });
    res.json({ ok: true, evento: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo actualizar el evento.' });
  }
});

app.delete('/api/admin/calendario/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await pool.query('DELETE FROM eventos_calendario WHERE id=$1 RETURNING id', [id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Evento no encontrado.' });
    res.json({ ok: true, mensaje: 'Evento eliminado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo eliminar el evento.' });
  }
});

app.get('/api/materias', requireAuth, async (req, res) => {
  try {
    if (req.session.user.role === 'admin') {
      const result = await pool.query('SELECT id,nombre,codigo,progreso,estado FROM materias ORDER BY id');
      return res.json(result.rows);
    }
    const result = await pool.query(`
      SELECT m.id,m.nombre,m.codigo,m.progreso,m.estado
      FROM materias m
      JOIN inscripciones i ON i.materia_id=m.id
      JOIN alumnos a ON a.id=i.alumno_id
      WHERE a.user_id=$1 ORDER BY m.id
    `, [req.session.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudieron cargar las materias.' });
  }
});

app.get('/api/admin/alumnos', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.nombre, a.apellido, a.dni, a.email, a.telefono, a.carrera, a.estado, u.username
      FROM alumnos a JOIN users u ON u.id=a.user_id ORDER BY a.apellido, a.nombre
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudieron cargar los alumnos.' });
  }
});

app.put('/api/admin/alumno/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nombre, apellido, dni, email, telefono, carrera, direccion } = req.body;
    if (!nombre || !apellido || !email) return res.status(400).json({ error: 'Nombre, apellido y email son obligatorios.' });
    const result = await pool.query(`
      UPDATE alumnos
      SET nombre=$1, apellido=$2, dni=$3, email=$4, telefono=$5, carrera=$6, direccion=$7
      WHERE id=$8
      RETURNING id, nombre, apellido, dni, email, telefono, carrera, direccion, estado
    `, [nombre.trim(), apellido.trim(), (dni || '').trim(), email.trim(), (telefono || '').trim(), (carrera || '').trim(), (direccion || '').trim(), id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Alumno no encontrado.' });
    res.json({ ok: true, mensaje: 'Alumno actualizado correctamente.', profile: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo actualizar el alumno.' });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDatabase()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Campus Virtual ejecutándose en http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.error('No se pudo inicializar la aplicación:', error);
    process.exit(1);
  });
