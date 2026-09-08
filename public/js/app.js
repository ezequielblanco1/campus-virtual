const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
let currentUser=null, currentProfile=null, calendarEvents=[];
const loginView=$('#loginView'), appView=$('#appView'), dashboardView=$('#dashboardView'), profileView=$('#profileView'), adminView=$('#adminView'), calendarAdminView=$('#calendarAdminView'), sidebar=$('#sidebar'), overlay=$('#overlay');
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function closeMenu(){sidebar.classList.remove('open');overlay.classList.remove('show')}
function setActive(section){$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.section===section)); $('#pageTitle').textContent=section==='inicio'?'Inicio':section==='perfil'?'Mi perfil':section==='admin'?'Administrar alumnos':section==='admin-calendario'?'Editar calendario':section[0].toUpperCase()+section.slice(1)}
function show(section){dashboardView.style.display=section==='inicio'?'block':'none';profileView.style.display=section==='perfil'?'block':'none';adminView.style.display=section==='admin'?'block':'none';calendarAdminView.style.display=section==='admin-calendario'?'block':'none';setActive(section);closeMenu();if(section==='perfil')loadProfile();if(section==='admin')loadAdmin();if(section==='admin-calendario')loadCalendarAdmin();if(section==='inicio')loadCalendar();if(!['inicio','perfil','admin','admin-calendario'].includes(section))toast(`Sección ${section}: lista para ampliar.`)}
async function api(url,opts={}){
  const r = await fetch(url,{
    credentials:'include',
    headers:{
      'Content-Type':'application/json',
      ...(opts.headers||{})
    },
    ...opts
  });

  let data={};

  try{
    data=await r.json();
  }catch{}

  if(!r.ok){
    throw new Error(data.error||'Ocurrió un error.');
  }

  return data;
}
async function loadMe(){const d=await api('/api/me');currentUser=d.user;currentProfile=d.profile;updateHeader();if(currentUser.role==='admin'){$('#adminNav').classList.remove('hidden');$('#calendarAdminNav').classList.remove('hidden');$('#welcomeTitle').textContent='¡Hola, administrador! 🛠️';$('#welcomeText').textContent='Desde aquí podés administrar alumnos y el calendario académico.'}else{$('#adminNav').classList.add('hidden');const full=currentProfile?`${currentProfile.nombre} ${currentProfile.apellido}`:'Estudiante';$('#welcomeTitle').textContent=`¡Hola, ${currentProfile?.nombre||'estudiante'}! 👋`;$('#welcomeText').textContent='Bienvenido/a a tu campus virtual. Desde aquí podés consultar tu información académica.';$('#profileName').textContent=full;$('#profileCareer').textContent=currentProfile?.carrera||''}$('#miniName').textContent=currentUser.role==='admin'?'Administrador':`${currentProfile?.nombre||'Estudiante'} ${currentProfile?.apellido||''}`;$('#miniRole').textContent=currentUser.role==='admin'?'Administrador':'Alumno'}
function updateHeader(){const text=currentUser.role==='admin'?'AD':((currentProfile?.nombre?.[0]||'E')+(currentProfile?.apellido?.[0]||'D')).toUpperCase();$('#miniAvatar').textContent=text;$('#profileAvatar').textContent=text}
async function loadCourses(){if(currentUser.role==='admin'){ $('#statMaterias').textContent='3'; return }const rows=await api('/api/materias');$('#statMaterias').textContent=rows.length;const list=$('#courseList');list.innerHTML=rows.map(m=>`<article class="course" data-search="${m.nombre.toLowerCase()}"><div class="course-icon">${m.codigo.substring(0,3)}</div><div><h4>${m.nombre}</h4><small>Código ${m.codigo}</small><div class="progress-wrap"><div class="progress-info"><span>Progreso</span><span>${m.progreso}%</span></div><div class="progress"><div class="progress-bar" style="width:${m.progreso}%"></div></div></div></div><span class="tag ${m.estado==='En curso'?'green':m.estado==='Pendiente'?'yellow':'blue'}">${m.estado}</span></article>`).join('')}
async function loadProfile(){if(currentUser.role==='admin'){toast('Los administradores administran alumnos desde su sección.');show('admin');return}currentProfile=(await api('/api/me')).profile;if(!currentProfile)return;for(const id of ['nombre','apellido','dni','email','telefono','carrera','direccion'])$('#'+id).value=currentProfile[id]||'';$('#profileName').textContent=`${currentProfile.nombre} ${currentProfile.apellido}`;$('#profileCareer').textContent=currentProfile.carrera||'';$('#profileStatus').textContent=currentProfile.estado||'Alumno regular';updateHeader()}
async function saveProfile(){
  if(!currentUser){
    toast('No hay una sesión iniciada.');
    return;
  }

  if(currentUser.role === 'admin'){
    toast('Los administradores no tienen un perfil de alumno.');
    return;
  }

  if(!currentProfile){
    try{
      const d = await api('/api/me');
      currentProfile = d.profile;
    }catch(e){
      toast(e.message);
      return;
    }
  }

  if(!currentProfile){
    toast('No se encontró el perfil del alumno.');
    return;
  }

  const body = {};

  for(const id of [
    'nombre',
    'apellido',
    'dni',
    'email',
    'telefono',
    'carrera',
    'direccion'
  ]){
    body[id] = $('#' + id).value;
  }

  try{
    const d = await api(`/api/alumno/${currentProfile.id}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });

    currentProfile = d.profile;

    await loadMe();

    $('#nombre').value = currentProfile.nombre || '';
    $('#apellido').value = currentProfile.apellido || '';
    $('#dni').value = currentProfile.dni || '';
    $('#email').value = currentProfile.email || '';
    $('#telefono').value = currentProfile.telefono || '';
    $('#carrera').value = currentProfile.carrera || '';
    $('#direccion').value = currentProfile.direccion || '';

    $('#profileName').textContent =
      `${currentProfile.nombre} ${currentProfile.apellido}`;

    $('#profileCareer').textContent =
      currentProfile.carrera || '';

    $('#profileStatus').textContent =
      currentProfile.estado || 'Alumno regular';

    updateHeader();

    toast('Datos guardados correctamente.');
  }catch(e){
    toast(e.message);
  }
}
async function loadAdmin(){const rows=await api('/api/admin/alumnos');const tb=$('#adminTableBody');tb.innerHTML=rows.map(a=>`<tr><td>${a.nombre} ${a.apellido}</td><td>${a.username}</td><td>${a.email||''}</td><td>${a.estado||''}</td><td><button data-edit="${a.id}">Editar</button></td></tr>`).join('');tb.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>adminEdit(Number(b.dataset.edit)))}
async function adminEdit(id){const a=await api('/api/alumno/'+id);const body={nombre:prompt('Nombre',a.nombre),apellido:prompt('Apellido',a.apellido),dni:prompt('DNI',a.dni||''),email:prompt('Email',a.email||''),telefono:prompt('Teléfono',a.telefono||''),carrera:prompt('Carrera',a.carrera||''),direccion:prompt('Dirección',a.direccion||'')};if(Object.values(body).some(v=>v===null))return;await api('/api/admin/alumno/'+id,{method:'PUT',body:JSON.stringify(body)});toast('Alumno actualizado.');loadAdmin()}

async function loadCalendar(){
  try {
    calendarEvents=await api('/api/calendario');
    renderCalendar();
  } catch(e){ toast(e.message); }
}

function renderCalendar(){
  const grid=$('#calendarGrid');
  const title=$('#calendarMonthTitle');
  const eventsBox=$('#calendarEvents');
  if(!grid||!title)return;
  const now=new Date();
  const year=now.getFullYear();
  const month=now.getMonth();
  title.textContent=new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric'}).format(now);
  const first=new Date(year,month,1);
  const days=new Date(year,month+1,0).getDate();
  const mondayIndex=(first.getDay()+6)%7;
  const monthNames=['L','M','X','J','V','S','D'];
  grid.innerHTML=monthNames.map(d=>`<div class="day-name">${d}</div>`).join('');
  for(let i=0;i<mondayIndex;i++) grid.innerHTML+='<div></div>';
  for(let day=1;day<=days;day++){
    const ds=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const has=calendarEvents.some(e=>e.fecha===ds);
    const today=ds===new Date().toISOString().slice(0,10);
    grid.innerHTML+=`<div class="${today?'today ':''}${has?'event':''}">${day}${has?'<sup>•</sup>':''}</div>`;
  }
  const upcoming=calendarEvents.filter(e=>e.fecha>=new Date().toISOString().slice(0,10)).slice(0,4);
  eventsBox.innerHTML=upcoming.length?upcoming.map(e=>`<div class="announcement"><strong>📅 ${e.fecha} · ${e.titulo}</strong><p>${e.tipo}${e.descripcion?' — '+e.descripcion:''}</p></div>`).join(''):'<div class="empty">No hay próximas fechas.</div>';
}

async function loadCalendarAdmin(){
  calendarEvents=await api('/api/calendario');
  const tb=$('#calendarAdminBody');
  tb.innerHTML=calendarEvents.map(e=>`<tr><td>${e.fecha}</td><td>${e.titulo}</td><td>${e.tipo||''}</td><td>${e.descripcion||''}</td><td><button data-edit-cal="${e.id}">Editar</button> <button data-delete-cal="${e.id}" style="background:#fee2e2;color:#991b1b">Eliminar</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">No hay eventos.</td></tr>';
  tb.querySelectorAll('[data-edit-cal]').forEach(b=>b.onclick=()=>editCalendar(Number(b.dataset.editCal)));
  tb.querySelectorAll('[data-delete-cal]').forEach(b=>b.onclick=()=>deleteCalendar(Number(b.dataset.deleteCal)));
}

function editCalendar(id){
  const e=calendarEvents.find(x=>x.id===id); if(!e)return;
  $('#eventoId').value=e.id; $('#eventoTitulo').value=e.titulo; $('#eventoFecha').value=e.fecha; $('#eventoTipo').value=e.tipo||'Académico'; $('#eventoDescripcion').value=e.descripcion||''; $('#calendarSubmit').textContent='Guardar cambios';
  window.scrollTo({top:0,behavior:'smooth'});
}

function resetCalendarForm(){ $('#eventoId').value=''; $('#eventoTitulo').value=''; $('#eventoFecha').value=''; $('#eventoTipo').value='Académico'; $('#eventoDescripcion').value=''; $('#calendarSubmit').textContent='Agregar evento'; }

async function deleteCalendar(id){ if(!confirm('¿Querés eliminar este evento?'))return; try{await api('/api/admin/calendario/'+id,{method:'DELETE'});toast('Evento eliminado.');await loadCalendarAdmin();await loadCalendar();}catch(e){toast(e.message)} }

$('#calendarForm').addEventListener('submit',async e=>{e.preventDefault();const id=$('#eventoId').value;const body={titulo:$('#eventoTitulo').value,fecha:$('#eventoFecha').value,tipo:$('#eventoTipo').value,descripcion:$('#eventoDescripcion').value};try{await api(id?'/api/admin/calendario/'+id:'/api/admin/calendario',{method:id?'PUT':'POST',body:JSON.stringify(body)});toast(id?'Evento actualizado.':'Evento agregado.');resetCalendarForm();await loadCalendarAdmin();await loadCalendar();}catch(err){toast(err.message)}});
$('#calendarCancel').onclick=resetCalendarForm;
$('#refreshCalendar').onclick=loadCalendar;

$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginError').textContent='';try{const d=await api('/api/login',{method:'POST',body:JSON.stringify({username:$('#username').value,password:$('#password').value})});currentUser=d.user;loginView.classList.add('hidden');appView.classList.remove('hidden');await loadMe();await loadCourses()}catch(err){$('#loginError').textContent=err.message}});
$$('.nav-item').forEach(n=>n.addEventListener('click',()=>show(n.dataset.section)));$('#menuToggle').onclick=()=>{sidebar.classList.toggle('open');overlay.classList.toggle('show')};overlay.onclick=closeMenu;$('#logoutBtn').onclick=async()=>{await api('/api/logout',{method:'POST'});location.reload()};$('#profileBtn').onclick=()=>show('perfil');$('#saveProfile').onclick=saveProfile;$('#reloadProfile').onclick=loadProfile;$('#notificationBtn').onclick=()=>toast('Tenés 3 notificaciones nuevas.');$('#viewCourses').onclick=()=>toast('Vista completa de materias disponible para ampliar.');$('#clearActivity').onclick=()=>toast('Actividad actualizada.');$('#searchInput').addEventListener('input',e=>{const q=e.target.value.toLowerCase().trim();$$('.course').forEach(c=>c.style.display=c.dataset.search.includes(q)?'':'none')});
const f=new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'long',year:'numeric'});$('#currentDate').textContent=f.format(new Date());
