const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let currentUser = null;
let currentProfile = null;
let calendarEvents = [];

const loginView = $('#loginView');
const appView = $('#appView');
const dashboardView = $('#dashboardView');
const profileView = $('#profileView');
const adminView = $('#adminView');
const calendarAdminView = $('#calendarAdminView');
const sidebar = $('#sidebar');
const overlay = $('#overlay');

// =====================================
// UTILIDADES
// =====================================

function toast(msg) {
const t = $('#toast');
if (!t) return;

t.textContent = msg;
t.classList.add('show');

setTimeout(() => {
t.classList.remove('show');
}, 2600);
}

function closeMenu() {
if (sidebar) sidebar.classList.remove('open');
if (overlay) overlay.classList.remove('show');
}

function setActive(section) {

$$('.nav-item').forEach(x => {
  x.classList.toggle('active', x.dataset.section === section);
});

const pageTitle = $('#pageTitle');
if (!pageTitle) return;

pageTitle.textContent =
  section === 'inicio'
    ? 'Inicio'
    : section === 'perfil'
    ? 'Mi perfil'
    : section === 'admin'
    ? 'Administrar alumnos'
    : section === 'admin-calendario'
    ? 'Editar calendario'
    : section[0].toUpperCase() + section.slice(1);
}

function show(section) {
if (dashboardView) {
  dashboardView.style.display =
    section === 'inicio' ? 'block' : 'none';
}

if (profileView) {
  profileView.style.display =
    section === 'perfil' ? 'block' : 'none';
}

if (adminView) {
  adminView.style.display =
    section === 'admin' ? 'block' : 'none';
}

if (calendarAdminView) {
  calendarAdminView.style.display =
    section === 'admin-calendario' ? 'block' : 'none';
}

setActive(section);
closeMenu();

if (section === 'perfil') loadProfile();
if (section === 'admin') loadAdmin();
if (section === 'admin-calendario') loadCalendarAdmin();
if (section === 'inicio') loadCalendar();

if (!['inicio', 'perfil', 'admin', 'admin-calendario'].includes(section)) {
  toast(`Sección ${section}: lista para ampliar.`);
}
}


// =====================================
// API
// =====================================

async function api(url, opts = {}) {
const r = await fetch(url, {
  ...opts,
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    ...(opts.headers || {})
  }
});

let data = {};

try {
  data = await r.json();
} catch {}

if (!r.ok) {
  throw new Error(
    data.error || 'Ocurrió un error.'
  );
}

return data;
}


// =====================================
// SESIÓN / USUARIO
// =====================================

async function loadMe() {
const d = await api('/api/me');

currentUser = d.user;
currentProfile = d.profile;

updateHeader();

if (currentUser.role === 'admin') {
  $('#adminNav')?.classList.remove('hidden');
  $('#calendarAdminNav')?.classList.remove('hidden');

  $('#welcomeTitle').textContent =
    '¡Hola, administrador! 🛠️';

  $('#welcomeText').textContent =
    'Desde aquí podés administrar alumnos y el calendario académico.';

  $('#profileName').textContent =
    'Administrador';

  $('#profileCareer').textContent =
    'Administración del Campus Virtual';

} else {
  $('#adminNav')?.classList.add('hidden');
  $('#calendarAdminNav')?.classList.add('hidden');

  const full = currentProfile
    ? `${currentProfile.nombre} ${currentProfile.apellido}`
    : 'Estudiante';

  $('#welcomeTitle').textContent =
    `¡Hola, ${currentProfile?.nombre || 'estudiante'}! 👋`;

  $('#welcomeText').textContent =
    'Bienvenido/a a tu campus virtual. Desde aquí podés consultar tu información académica.';

  $('#profileName').textContent = full;
  $('#profileCareer').textContent =
    currentProfile?.carrera || '';
}

$('#miniName').textContent =
  currentUser.role === 'admin'
    ? 'Administrador'
    : `${currentProfile?.nombre || 'Estudiante'} ${currentProfile?.apellido || ''}`;

$('#miniRole').textContent =
  currentUser.role === 'admin'
    ? 'Administrador'
    : 'Alumno';
}

function updateHeader() {
if (!currentUser) return;

const text =
  currentUser.role === 'admin'
    ? 'AD'
    : (
        (currentProfile?.nombre?.[0] || 'E') +
        (currentProfile?.apellido?.[0] || 'D')
      ).toUpperCase();

$('#miniAvatar').textContent = text;
$('#profileAvatar').textContent = text;
}


// =====================================
// MATERIAS
// =====================================

async function loadCourses() {
if (!currentUser) return;

if (currentUser.role === 'admin') {
  $('#statMaterias').textContent = '3';
  return;
}

const rows = await api('/api/materias');

$('#statMaterias').textContent = rows.length;

const list = $('#courseList');
if (!list) return;

list.innerHTML = rows.map(m => `
  <article
    class="course"
    data-search="${m.nombre.toLowerCase()}"
  >
    <div class="course-icon">
      ${m.codigo.substring(0, 3)}
    </div>

    <div>
      <h4>${m.nombre}</h4>

      <small>
        Código ${m.codigo}
      </small>

      <div class="progress-wrap">
        <div class="progress-info">
          <span>Progreso</span>
          <span>${m.progreso}%</span>
        </div>

        <div class="progress">
          <div
            class="progress-bar"
            style="width:${m.progreso}%"
          ></div>
        </div>
      </div>
    </div>

    <span class="tag ${
      m.estado === 'En curso'
        ? 'green'
        : m.estado === 'Pendiente'
        ? 'yellow'
        : 'blue'
    }">
      ${m.estado}
    </span>
  </article>
`).join('');
}


// =====================================
// PERFIL
// =====================================

async function loadProfile() {
if (!currentUser) {
  toast('No hay una sesión iniciada.');
  return;
}

if (currentUser.role === 'admin') {
  toast(
    'Los administradores administran alumnos desde su sección.'
  );
  show('admin');
  return;
}

try {
  const d = await api('/api/me');

  currentProfile = d.profile;

  if (!currentProfile) {
    toast('No se encontró el perfil del alumno.');
    return;
  }

  for (const id of [
    'nombre',
    'apellido',
    'dni',
    'email',
    'telefono',
    'carrera',
    'direccion'
  ]) {
    const element = $('#' + id);

    if (element) {
      element.value = currentProfile[id] || '';
    }
  }

  $('#profileName').textContent =
    `${currentProfile.nombre} ${currentProfile.apellido}`;

  $('#profileCareer').textContent =
    currentProfile.carrera || '';

  $('#profileStatus').textContent =
    currentProfile.estado || 'Alumno regular';

  updateHeader();

} catch (e) {
  toast(e.message);
}
}

async function saveProfile() {
if (!currentUser) {
  toast('No hay una sesión iniciada.');
  return;
}

if (currentUser.role === 'admin') {
  toast(
    'Los administradores no tienen un perfil de alumno.'
  );
  return;
}

if (!currentProfile) {
  try {
    const d = await api('/api/me');
    currentProfile = d.profile;
  } catch (e) {
    toast(e.message);
    return;
  }
}

if (!currentProfile) {
  toast('No se encontró el perfil del alumno.');
  return;
}

const body = {};

for (const id of [
  'nombre',
  'apellido',
  'dni',
  'email',
  'telefono',
  'carrera',
  'direccion'
]) {
  const element = $('#' + id);
  body[id] = element ? element.value : '';
}

try {
  const d = await api(
    `/api/alumno/${currentProfile.id}`,
    {
      method: 'PUT',
      body: JSON.stringify(body)
    }
  );

  currentProfile = d.profile;

  await loadMe();

  for (const id of [
    'nombre',
    'apellido',
    'dni',
    'email',
    'telefono',
    'carrera',
    'direccion'
  ]) {
    const element = $('#' + id);

    if (element) {
      element.value = currentProfile[id] || '';
    }
  }

  $('#profileName').textContent =
    `${currentProfile.nombre} ${currentProfile.apellido}`;

  $('#profileCareer').textContent =
    currentProfile.carrera || '';

  $('#profileStatus').textContent =
    currentProfile.estado || 'Alumno regular';

  updateHeader();

  toast('Datos guardados correctamente.');

} catch (e) {
  toast(e.message);
}
}


function descargarCertificado(id) {
  window.open(`/api/alumno/${id}/certificado`, '_blank');
}

$('#downloadCert')?.addEventListener(
'click',
() => {
  if (!currentProfile?.id) {
    toast('No se encontró tu perfil de alumno.');
    return;
  }
  descargarCertificado(currentProfile.id);
}
);


// =====================================
// ADMINISTRACIÓN DE ALUMNOS
// =====================================

async function loadAdmin() {
try {
  const rows = await api('/api/admin/alumnos');
  const tb = $('#adminTableBody');

  if (!tb) return;

  tb.innerHTML = rows.map(a => `
    <tr>
      <td>${a.nombre} ${a.apellido}</td>
      <td>${a.username}</td>
      <td>${a.email || ''}</td>
      <td>${a.estado || ''}</td>
      <td>
        <button data-edit="${a.id}">
          Editar
        </button>
        <button data-cert="${a.id}">
          Certificado
        </button>
      </td>
    </tr>
  `).join('');

  tb.querySelectorAll('[data-edit]')
    .forEach(b => {
      b.onclick = () =>
        adminEdit(Number(b.dataset.edit));
    });

  tb.querySelectorAll('[data-cert]')
    .forEach(b => {
      b.onclick = () =>
        descargarCertificado(Number(b.dataset.cert));
    });

} catch (e) {
  toast(e.message);
}
}

async function adminEdit(id) {
try {
  const a = await api('/api/alumno/' + id);

  const body = {
    nombre:
      prompt('Nombre', a.nombre),

    apellido:
      prompt('Apellido', a.apellido),

    dni:
      prompt('DNI', a.dni || ''),

    email:
      prompt('Email', a.email || ''),

    telefono:
      prompt('Teléfono', a.telefono || ''),

    carrera:
      prompt('Carrera', a.carrera || ''),

    direccion:
      prompt('Dirección', a.direccion || '')
  };

  if (
    Object.values(body)
      .some(v => v === null)
  ) {
    return;
  }

  await api(
    '/api/admin/alumno/' + id,
    {
      method: 'PUT',
      body: JSON.stringify(body)
    }
  );

  toast('Alumno actualizado.');

  await loadAdmin();

} catch (e) {
  toast(e.message);
}
}


// =====================================
// CALENDARIO
// =====================================

async function loadCalendar() {
try {
  calendarEvents =
    await api('/api/calendario');

  renderCalendar();

} catch (e) {
  toast(e.message);
}
}

function renderCalendar() {
const grid = $('#calendarGrid');
const title = $('#calendarMonthTitle');
const eventsBox = $('#calendarEvents');

if (!grid || !title) return;

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth();

title.textContent =
  new Intl.DateTimeFormat(
    'es-AR',
    {
      month: 'long',
      year: 'numeric'
    }
  ).format(now);

const first = new Date(year, month, 1);

const days =
  new Date(
    year,
    month + 1,
    0
  ).getDate();

const mondayIndex =
  (first.getDay() + 6) % 7;

const monthNames =
  ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

grid.innerHTML =
  monthNames
    .map(d =>
      `<div class="day-name">${d}</div>`
    )
    .join('');

for (
  let i = 0;
  i < mondayIndex;
  i++
) {
  grid.innerHTML += '<div></div>';
}

const today =
  new Date()
    .toISOString()
    .slice(0, 10);

for (
  let day = 1;
  day <= days;
  day++
) {
  const ds =
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const has =
    calendarEvents.some(
      e => e.fecha === ds
    );

  const isToday =
    ds === today;

  grid.innerHTML += `
    <div class="${
      isToday ? 'today ' : ''
    }${
      has ? 'event' : ''
    }">
      ${day}
      ${
        has
          ? '<sup>•</sup>'
          : ''
      }
    </div>
  `;
}

if (!eventsBox) return;

const upcoming =
  calendarEvents
    .filter(e => e.fecha >= today)
    .slice(0, 4);

eventsBox.innerHTML =
  upcoming.length
    ? upcoming.map(e => `
        <div class="announcement">
          <strong>
            📅 ${e.fecha} · ${e.titulo}
          </strong>

          <p>
            ${e.tipo || ''}
            ${
              e.descripcion
                ? ' — ' + e.descripcion
                : ''
            }
          </p>
        </div>
      `).join('')
    : `
        <div class="empty">
          No hay próximas fechas.
        </div>
      `;
}


// =====================================
// ADMINISTRACIÓN DEL CALENDARIO
// =====================================

async function loadCalendarAdmin() {
try {
  calendarEvents =
    await api('/api/calendario');

  const tb =
    $('#calendarAdminBody');

  if (!tb) return;

  tb.innerHTML =
    calendarEvents.map(e => `
      <tr>
        <td>${e.fecha}</td>
        <td>${e.titulo}</td>
        <td>${e.tipo || ''}</td>
        <td>${e.descripcion || ''}</td>

        <td>
          <button data-edit-cal="${e.id}">
            Editar
          </button>

          <button
            data-delete-cal="${e.id}"
            style="background:#fee2e2;color:#991b1b"
          >
            Eliminar
          </button>
        </td>
      </tr>
    `).join('')
    ||
    `
      <tr>
        <td colspan="5" class="empty">
          No hay eventos.
        </td>
      </tr>
    `;

  tb.querySelectorAll('[data-edit-cal]')
    .forEach(b => {
      b.onclick = () =>
        editCalendar(
          Number(b.dataset.editCal)
        );
    });

  tb.querySelectorAll('[data-delete-cal]')
    .forEach(b => {
      b.onclick = () =>
        deleteCalendar(
          Number(b.dataset.deleteCal)
        );
    });

} catch (e) {
  toast(e.message);
}
}

function editCalendar(id) {
const e =
  calendarEvents.find(
    x => x.id === id
  );

if (!e) return;

$('#eventoId').value = e.id;
$('#eventoTitulo').value = e.titulo;
$('#eventoFecha').value = e.fecha;
$('#eventoTipo').value =
  e.tipo || 'Académico';
$('#eventoDescripcion').value =
  e.descripcion || '';

$('#calendarSubmit').textContent =
  'Guardar cambios';

window.scrollTo({
  top: 0,
  behavior: 'smooth'
});
}

function resetCalendarForm() {
$('#eventoId').value = '';
$('#eventoTitulo').value = '';
$('#eventoFecha').value = '';
$('#eventoTipo').value = 'Académico';
$('#eventoDescripcion').value = '';
$('#calendarSubmit').textContent =
  'Agregar evento';
}

async function deleteCalendar(id) {
if (
  !confirm(
    '¿Querés eliminar este evento?'
  )
) {
  return;
}

try {
  await api(
    '/api/admin/calendario/' + id,
    {
      method: 'DELETE'
    }
  );

  toast('Evento eliminado.');

  await loadCalendarAdmin();
  await loadCalendar();

} catch (e) {
  toast(e.message);
}
}


// =====================================
// FORMULARIO CALENDARIO
// =====================================

$('#calendarForm')?.addEventListener(
'submit',
async e => {
  e.preventDefault();

  const id =
    $('#eventoId').value;

  const body = {
    titulo:
      $('#eventoTitulo').value,

    fecha:
      $('#eventoFecha').value,

    tipo:
      $('#eventoTipo').value,

    descripcion:
      $('#eventoDescripcion').value
  };

  try {
    await api(
      id
        ? '/api/admin/calendario/' + id
        : '/api/admin/calendario',
      {
        method: id
          ? 'PUT'
          : 'POST',

        body:
          JSON.stringify(body)
      }
    );

    toast(
      id
        ? 'Evento actualizado.'
        : 'Evento agregado.'
    );

    resetCalendarForm();

    await loadCalendarAdmin();
    await loadCalendar();

  } catch (err) {
    toast(err.message);
  }
}
);

$('#calendarCancel')?.addEventListener(
'click',
resetCalendarForm
);

$('#refreshCalendar')?.addEventListener(
'click',
loadCalendar
);


// =====================================
// LOGIN
// =====================================

$('#loginForm')?.addEventListener(
'submit',
async e => {
  e.preventDefault();

  $('#loginError').textContent = '';

  try {
    const d =
      await api(
        '/api/login',
        {
          method: 'POST',
          body: JSON.stringify({
            username:
              $('#username').value,

            password:
              $('#password').value
          })
        }
      );

    currentUser = d.user;

    loginView.classList.add('hidden');
    appView.classList.remove('hidden');

    await loadMe();
    await loadCourses();

  } catch (err) {
    $('#loginError').textContent =
      err.message;
  }
}
);


// =====================================
// NAVEGACIÓN
// =====================================

$$('.nav-item').forEach(n => {
n.addEventListener(
  'click',
  () => show(n.dataset.section)
);
});

$('#menuToggle')?.addEventListener(
'click',
() => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
}
);

overlay?.addEventListener(
'click',
closeMenu
);


// =====================================
// CERRAR SESIÓN
// =====================================

$('#logoutBtn')?.addEventListener(
'click',
async () => {

  try {
    await api(
      '/api/logout',
      {
        method: 'POST'
      }
    );
  } catch (e) {
    console.error(e);
  }

  location.reload();
}
);


// =====================================
// BOTONES DE PERFIL
// =====================================

$('#profileBtn')?.addEventListener(
'click',
() => show('perfil')
);

$('#saveProfile')?.addEventListener(
'click',
saveProfile
);

$('#reloadProfile')?.addEventListener(
'click',
loadProfile
);

$('#notificationBtn')?.addEventListener(
'click',
() =>
  toast(
    'Tenés 3 notificaciones nuevas.'
  )
);

$('#viewCourses')?.addEventListener(
'click',
() =>
  toast(
    'Vista completa de materias disponible para ampliar.'
  )
);

$('#clearActivity')?.addEventListener(
'click',
() =>
  toast(
    'Actividad actualizada.'
  )
);


// =====================================
// BUSCAR MATERIAS
// =====================================

$('#searchInput')?.addEventListener(
'input',
e => {

  const q =
    e.target.value
      .toLowerCase()
      .trim();

  $$('.course').forEach(c => {
    c.style.display =
      c.dataset.search.includes(q)
        ? ''
        : 'none';
  });
}
);


// =====================================
// FECHA ACTUAL
// =====================================

const f =
new Intl.DateTimeFormat(
  'es-AR',
  {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }
);

if ($('#currentDate')) {
$('#currentDate').textContent =
  f.format(new Date());
}


// =====================================
// REGISTRO DE NUEVOS ALUMNOS
// =====================================

const showRegister =
$('#showRegister');

const showLogin =
$('#showLogin');

const registerBox =
$('#registerBox');

const registerForm =
$('#registerForm');


showRegister?.addEventListener(
'click',
() => {

  $('#loginForm')
    .classList
    .add('hidden');

  registerBox
    ?.classList
    .remove('hidden');

  $('#registerError').textContent = '';
}
);


showLogin?.addEventListener(
'click',
() => {

  registerBox
    ?.classList
    .add('hidden');

  $('#loginForm')
    .classList
    .remove('hidden');

  $('#registerError').textContent = '';
}
);


registerForm?.addEventListener(
'submit',
async e => {

  e.preventDefault();

  $('#registerError').textContent = '';

  const username =
    $('#regUsername')
      .value
      .trim();

  const password =
    $('#regPassword')
      .value;

  const password2 =
    $('#regPassword2')
      .value;

  const nombre =
    $('#regNombre')
      .value
      .trim();

  const apellido =
    $('#regApellido')
      .value
      .trim();

  const dni =
    $('#regDni')
      .value
      .trim();

  const email =
    $('#regEmail')
      .value
      .trim();

  const telefono =
    $('#regTelefono')
      .value
      .trim();

  const carrera =
    $('#regCarrera')
      .value
      .trim();

  const direccion =
    $('#regDireccion')
      .value
      .trim();


  if (password !== password2) {
    $('#registerError').textContent =
      'Las contraseñas no coinciden.';
    return;
  }


  if (password.length < 6) {
    $('#registerError').textContent =
      'La contraseña debe tener al menos 6 caracteres.';
    return;
  }


  if (!username) {
    $('#registerError').textContent =
      'El usuario es obligatorio.';
    return;
  }


  try {

    await api(
      '/api/registro',
      {
        method: 'POST',

        body: JSON.stringify({
          username,
          password,
          nombre,
          apellido,
          dni,
          email,
          telefono,
          carrera,
          direccion
        })
      }
    );


    toast(
      'Cuenta creada correctamente.'
    );


    registerForm.reset();


    registerBox
      .classList
      .add('hidden');

    $('#loginForm')
      .classList
      .remove('hidden');


    $('#username').value =
      username;

    $('#password').value =
      '';


  } catch (error) {

    $('#registerError').textContent =
      error.message;

  }
}
);