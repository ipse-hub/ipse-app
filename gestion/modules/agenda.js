/* ═══════════════════════════════════════════
   AGENDA (gestión) — ag2
═══════════════════════════════════════════ */
const AG2 = {
  vista: 'semana',
  lunes: null,
  diaActual: null,
  mesAnio: null,
  citas: [],
  iniciado: false,
  citaModalActual: null,
};
const AG2_H_INI = 8;
const AG2_H_FIN = 21;
const AG2_DIAS_ES    = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const AG2_DIAS_LARGO = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const AG2_MESES_ES   = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// Paleta de colores para profesionales (usa color_agenda si existe, si no esta paleta)
const AG2_PALETTE = ['#10069F','#00B5E2','#DA291C','#97D700','#F59E0B','#8B5CF6','#EC4899'];

function ag2Color(idPro) {
  const p = (G.profesionales || []).find(x => x.id === idPro);
  if (p && p.color_agenda) return p.color_agenda;
  const idx = (G.profesionales || []).findIndex(x => x.id === idPro);
  return AG2_PALETTE[idx >= 0 ? idx % AG2_PALETTE.length : 0];
}

function ag2NomPac(idPac) {
  const p = (G.pacientes || []).find(x => x.id === idPac);
  if (!p) return idPac || '—';
  return p.alias || ((p.nombre || '') + ' ' + (p.apellidos || '')).trim() || idPac;
}

function ag2NomPro(idPro) {
  const p = (G.profesionales || []).find(x => x.id === idPro);
  return p ? p.nombre.split(' ')[0] : (idPro || '—');
}

function ag2FmtISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function ag2LunesDe(d) {
  const r = new Date(d);
  const dow = r.getDay();
  r.setDate(r.getDate() + (dow === 0 ? -6 : 1 - dow));
  r.setHours(0,0,0,0);
  return r;
}

function ag2EstadoLabel(e) {
  return { Programada:'Prog.', Hecha:'Hecha', 'Noshow':'No-show', Reprogramada:'Reprg.', Cancelada:'Canc.' }[e] || e || '';
}

// ── Inicialización ────────────────────────────────────────────
function ag2Init() {
  if (!AG2.iniciado) {
    AG2.iniciado = true;
    const hoy = new Date();
    AG2.lunes      = ag2LunesDe(hoy);
    AG2.diaActual  = new Date(hoy);
    AG2.mesAnio    = { mes: hoy.getMonth(), anio: hoy.getFullYear() };
    // Poblar select de profesionales
    const sel = document.getElementById('ag2-filtro-pro');
    (G.profesionales || []).forEach(p => {
      if (p.id === 'PRO-ADM') return; // admin no tiene agenda
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.nombre;
      sel.appendChild(opt);
    });
    // Estado visual inicial
    ['semana','mes','dia'].forEach(v => {
      document.getElementById('ag2-btn-'+v).classList.toggle('activo', v === 'semana');
      document.getElementById('ag2-'+v).style.display = v === 'semana' ? 'flex' : 'none';
      if (v === 'semana') document.getElementById('ag2-'+v).style.flexDirection = 'column';
    });
  }
  ag2Cargar();
}

// ── Carga de datos ─────────────────────────────────────────────
async function ag2Cargar() {
  const pad = n => String(n).padStart(2,'0');
  let fi, ff;
  if (AG2.vista === 'semana') {
    fi = ag2FmtISO(AG2.lunes);
    const dom = new Date(AG2.lunes); dom.setDate(dom.getDate() + 7);
    ff = ag2FmtISO(dom);
  } else if (AG2.vista === 'mes') {
    const pd = new Date(AG2.mesAnio.anio, AG2.mesAnio.mes, 1);
    const ig = new Date(pd);
    const dow = ig.getDay();
    ig.setDate(ig.getDate() - (dow === 0 ? 6 : dow - 1));
    const fg = new Date(ig); fg.setDate(ig.getDate() + 42);
    fi = ag2FmtISO(ig); ff = ag2FmtISO(fg);
  } else {
    fi = ag2FmtISO(AG2.diaActual);
    const fd = new Date(AG2.diaActual); fd.setDate(fd.getDate() + 1);
    ff = ag2FmtISO(fd);
  }
  try {
    AG2.citas = await sg(`citas_v2?fecha=gte.${fi}&fecha=lt.${ff}&order=fecha.asc,hora.asc&limit=2000`);
  } catch(e) {
    AG2.citas = [];
    toast('Error cargando agenda: ' + e.message, true);
  }
  ag2Render();
  ag2ActualizarKPIs();
}

// ── Navegación y cambio de vista ───────────────────────────────
function ag2Vista(v) {
  AG2.vista = v;
  ['semana','mes','dia'].forEach(x => {
    document.getElementById('ag2-btn-'+x).classList.toggle('activo', x === v);
    const el = document.getElementById('ag2-'+x);
    el.style.display = x === v ? 'flex' : 'none';
    if (x === v) el.style.flexDirection = 'column';
  });
  ag2ActualizarLabel();
  ag2Cargar();
}

function ag2Nav(dir) {
  if (AG2.vista === 'semana') {
    AG2.lunes.setDate(AG2.lunes.getDate() + dir * 7);
  } else if (AG2.vista === 'mes') {
    AG2.mesAnio.mes += dir;
    if (AG2.mesAnio.mes > 11) { AG2.mesAnio.mes = 0; AG2.mesAnio.anio++; }
    if (AG2.mesAnio.mes < 0)  { AG2.mesAnio.mes = 11; AG2.mesAnio.anio--; }
  } else {
    AG2.diaActual.setDate(AG2.diaActual.getDate() + dir);
  }
  ag2ActualizarLabel();
  ag2Cargar();
}

function ag2NavHoy() {
  const hoy = new Date();
  AG2.lunes     = ag2LunesDe(hoy);
  AG2.diaActual = new Date(hoy);
  AG2.mesAnio   = { mes: hoy.getMonth(), anio: hoy.getFullYear() };
  ag2ActualizarLabel();
  ag2Cargar();
}

function ag2ActualizarLabel() {
  const el = document.getElementById('ag2-label');
  if (!el) return;
  if (AG2.vista === 'semana') {
    const dom = new Date(AG2.lunes); dom.setDate(dom.getDate() + 6);
    const fmt = d => `${d.getDate()} ${AG2_MESES_ES[d.getMonth()].slice(0,3)}`;
    el.textContent = fmt(AG2.lunes) + ' – ' + fmt(dom) + ' ' + dom.getFullYear();
  } else if (AG2.vista === 'mes') {
    const m = AG2_MESES_ES[AG2.mesAnio.mes];
    el.textContent = m.charAt(0).toUpperCase() + m.slice(1) + ' ' + AG2.mesAnio.anio;
  } else {
    const d = AG2.diaActual;
    el.textContent = AG2_DIAS_LARGO[d.getDay()] + ' ' + d.getDate() + ' de ' + AG2_MESES_ES[d.getMonth()] + ' ' + d.getFullYear();
  }
}

// ── Filtrado ───────────────────────────────────────────────────
function ag2CitasFiltradas() {
  const ter = document.getElementById('ag2-filtro-pro')?.value || '';
  return ter ? AG2.citas.filter(c => c.id_profesional === ter) : AG2.citas;
}

// ── Render principal ───────────────────────────────────────────
function ag2Render() {
  ag2ActualizarLabel();
  if (AG2.vista === 'semana') ag2RenderSemana();
  else if (AG2.vista === 'mes') ag2RenderMes();
  else ag2RenderDia();
}

// ── Vista semana (lun-dom, 7 columnas) ─────────────────────────
function ag2RenderSemana() {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const citas = ag2CitasFiltradas();
  const header = document.getElementById('ag2-week-header');
  header.style.gridTemplateColumns = '52px repeat(7,1fr)';
  let hHtml = '<div style="border-right:1px solid rgba(255,255,255,.1)"></div>';
  for (let i = 0; i < 7; i++) {
    const d = new Date(AG2.lunes); d.setDate(d.getDate() + i);
    const esHoy = d.getTime() === hoy.getTime();
    hHtml += `<div class="ag2-week-hcell${esHoy?' hoy':''}">
      <span class="dn">${AG2_DIAS_ES[d.getDay()]}</span>
      <span class="dd">${d.getDate()}</span>
    </div>`;
  }
  header.innerHTML = hHtml;

  const body = document.getElementById('ag2-week-body');
  body.style.gridTemplateColumns = '52px repeat(7,1fr)';
  body.innerHTML = '';
  const totalSlots = (AG2_H_FIN - AG2_H_INI) * 2;

  // Columna horas
  const timeCol = document.createElement('div');
  timeCol.className = 'ag2-time-col';
  for (let s = 0; s < totalSlots; s++) {
    const h = AG2_H_INI + Math.floor(s/2), m = s%2 === 0 ? '00' : '30';
    const slot = document.createElement('div');
    slot.className = 'ag2-time-slot';
    slot.textContent = s%2 === 0 ? `${h}:${m}` : '';
    timeCol.appendChild(slot);
  }
  body.appendChild(timeCol);

  // 7 columnas de días
  for (let i = 0; i < 7; i++) {
    const d = new Date(AG2.lunes); d.setDate(d.getDate() + i);
    const fechaStr = ag2FmtISO(d);
    const esHoy = d.getTime() === hoy.getTime();
    const col = document.createElement('div');
    col.className = 'ag2-day-col' + (esHoy ? ' hoy' : '');
    col.style.cssText = 'position:relative;min-height:' + (totalSlots * 48) + 'px';
    for (let s = 0; s < totalSlots; s++) {
      const slot = document.createElement('div'); slot.className = 'ag2-slot'; col.appendChild(slot);
    }
    // Gestión de solapamientos
    const citasDia = citas.filter(c => c.fecha === fechaStr);
    if (citasDia.length) {
      const DUR = 60;
      const asign = new Map();
      const ordenadas = [...citasDia].sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
      ordenadas.forEach(c => {
        const [hh,mm] = (c.hora||'00:00').split(':').map(Number);
        const ini = hh*60 + mm, fin = ini + (c.duracion_min||DUR);
        const grupo = ordenadas.filter(c2 => {
          const [h2,m2] = (c2.hora||'00:00').split(':').map(Number);
          const i2 = h2*60+m2, f2 = i2+(c2.duracion_min||DUR);
          return ini < f2 && fin > i2;
        });
        grupo.sort((a,b) => (a.id||'').localeCompare(b.id||''));
        if (!asign.has(c)) asign.set(c, { col: grupo.indexOf(c), total: grupo.length });
      });
      asign.forEach((pos,c) => {
        const el = ag2CitaEl(c, pos.col, pos.total);
        if (el) col.appendChild(el);
      });
    }
    body.appendChild(col);
  }
}

function ag2CitaEl(c, subCol, totalCols) {
  const [hh, mm] = (c.hora||'').split(':').map(Number);
  if (isNaN(hh)) return null;
  const dur = c.duracion_min || 60;
  const topPx    = ((hh - AG2_H_INI) * 2 + mm/30) * 48;
  const heightPx = Math.max(24, (dur/30) * 48 - 2);
  const color    = ag2Color(c.id_profesional);
  const nombre   = ag2NomPac(c.id_paciente);
  const proNom   = ag2NomPro(c.id_profesional);
  const pct = 100 / totalCols;
  const el = document.createElement('div');
  el.className = 'ag2-cita';
  el.style.cssText = `top:${topPx}px;height:${heightPx}px;left:calc(2px + ${subCol*pct}%);right:calc(2px + ${(totalCols-subCol-1)*pct}%);background:${color}22;border-left-color:${color};color:${color}`;
  el.innerHTML = `<div class="ag2-cita-nom">${nombre}</div>
    ${heightPx > 36 ? `<div class="ag2-cita-sub">${proNom} · ${(c.hora||'').slice(0,5)}</div>` : ''}
    ${heightPx > 52 ? `<div class="ag2-cita-estado">${ag2EstadoLabel(c.estado)}</div>` : ''}`;
  el.onclick = () => ag2AbrirModal(c);
  return el;
}

// ── Vista mes ─────────────────────────────────────────────────
function ag2RenderMes() {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const citas = ag2CitasFiltradas();
  const { mes, anio } = AG2.mesAnio;

  const header = document.getElementById('ag2-month-header');
  header.innerHTML = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
    .map(d => `<div style="padding:8px 0;text-align:center;font-size:11px;font-weight:700;color:rgba(255,255,255,.85);text-transform:uppercase;letter-spacing:.05em">${d}</div>`)
    .join('');

  const body = document.getElementById('ag2-month-body');
  body.style.overflowY = 'auto';
  body.innerHTML = '';

  const primerDia = new Date(anio, mes, 1);
  const inicioGrid = new Date(primerDia);
  const dow0 = inicioGrid.getDay();
  inicioGrid.setDate(inicioGrid.getDate() - (dow0 === 0 ? 6 : dow0 - 1));

  for (let i = 0; i < 42; i++) {
    const d = new Date(inicioGrid); d.setDate(d.getDate() + i);
    const esEsteMes = d.getMonth() === mes;
    const esHoy     = d.getTime() === hoy.getTime();
    const fechaStr  = ag2FmtISO(d);
    const citasDia  = citas.filter(c => c.fecha === fechaStr);

    const cell = document.createElement('div');
    cell.className = 'ag2-month-day' + (!esEsteMes ? ' otro-mes' : '') + (esHoy ? ' es-hoy' : '');
    let html = `<div class="ag2-day-num">${d.getDate()}</div>`;
    citasDia.slice(0,3).forEach(c => {
      const color  = ag2Color(c.id_profesional);
      const nombre = ag2NomPac(c.id_paciente);
      html += `<div class="ag2-month-pill" style="background:${color}" onclick="event.stopPropagation();ag2AbrirModal(${JSON.stringify(c).replace(/"/g,'&quot;')})">
        <span style="font-size:10px;opacity:.85;flex-shrink:0">${(c.hora||'').slice(0,5)}</span>
        <span style="overflow:hidden;text-overflow:ellipsis">${nombre}</span>
      </div>`;
    });
    if (citasDia.length > 3) html += `<div class="ag2-month-mas">+${citasDia.length - 3} más</div>`;
    cell.innerHTML = html;
    if (esEsteMes) cell.onclick = () => { AG2.diaActual = new Date(d); ag2Vista('dia'); };
    body.appendChild(cell);
  }
}

// ── Vista día ─────────────────────────────────────────────────
function ag2RenderDia() {
  const citas = ag2CitasFiltradas().filter(c => c.fecha === ag2FmtISO(AG2.diaActual));
  const d = AG2.diaActual;
  document.getElementById('ag2-day-header').textContent =
    AG2_DIAS_LARGO[d.getDay()] + ' ' + d.getDate() + ' de ' + AG2_MESES_ES[d.getMonth()] + ' ' + d.getFullYear();

  const body = document.getElementById('ag2-day-body');
  body.style.gridTemplateColumns = '52px 1fr';
  body.innerHTML = '';
  const totalSlots = (AG2_H_FIN - AG2_H_INI) * 2;

  const timeCol = document.createElement('div');
  timeCol.className = 'ag2-time-col';
  for (let s = 0; s < totalSlots; s++) {
    const h = AG2_H_INI + Math.floor(s/2), m = s%2===0?'00':'30';
    const slot = document.createElement('div');
    slot.className = 'ag2-time-slot';
    slot.textContent = s%2===0 ? `${h}:${m}` : '';
    timeCol.appendChild(slot);
  }
  body.appendChild(timeCol);

  const col = document.createElement('div');
  col.className = 'ag2-day-col';
  col.style.cssText = 'position:relative;min-height:' + (totalSlots * 48) + 'px';
  for (let s = 0; s < totalSlots; s++) {
    const slot = document.createElement('div'); slot.className = 'ag2-slot'; col.appendChild(slot);
  }
  citas.forEach(c => { const el = ag2CitaEl(c, 0, 1); if (el) col.appendChild(el); });
  body.appendChild(col);
}

// ── KPIs por profesional ──────────────────────────────────────
function ag2ActualizarKPIs() {
  const bar = document.getElementById('ag2-kpis-bar');
  if (!bar) return;
  const citas = ag2CitasFiltradas();
  const pros = (G.profesionales || []).filter(p => p.id !== 'PRO-ADM' && p.activa === 'Si');

  // Si hay filtro activo, mostrar solo esa profesional
  const filtroId = document.getElementById('ag2-filtro-pro')?.value || '';
  const lista = filtroId ? pros.filter(p => p.id === filtroId) : pros;

  bar.innerHTML = lista.map(p => {
    const citasPro = citas.filter(c => c.id_profesional === p.id);
    const total    = citasPro.length;
    const hechas   = citasPro.filter(c => c.estado === 'Hecha').length;
    const noshows  = citasPro.filter(c => c.estado === 'Noshow').length;
    const prod     = citasPro.filter(c => c.estado === 'Hecha').reduce((s,c) => s + (parseFloat(c.precio)||0), 0);
    const color    = ag2Color(p.id);
    const prodStr  = G.esAdmin ? ` · <b>${prod.toLocaleString('es-ES',{minimumFractionDigits:0})} €</b>` : '';
    return `<div class="ag2-kpi-pro">
      <div class="ag2-kpi-dot" style="background:${color}"></div>
      <div>
        <div class="ag2-kpi-nombre">${p.nombre.split(' ')[0]}</div>
        <div class="ag2-kpi-stats"><b>${total}</b> citas · <b>${hechas}</b> hechas${noshows ? ` · <b style="color:var(--rojo)">${noshows}</b> ns` : ''}${prodStr}</div>
      </div>
    </div>`;
  }).join('');

  if (!lista.length) {
    bar.innerHTML = '<div style="font-size:12px;color:var(--ink-muted);padding:4px 0">Sin profesionales activas en el período</div>';
  }
}

// ── Modal cita (solo lectura) ─────────────────────────────────
function ag2AbrirModal(cita) {
  AG2.citaModalActual = cita;
  const pac = (G.pacientes||[]).find(p => p.id === cita.id_paciente);
  const pro = (G.profesionales||[]).find(p => p.id === cita.id_profesional);
  const nomPac = pac ? ((pac.nombre||'') + ' ' + (pac.apellidos||'')).trim() : (cita.id_paciente||'—');
  const nomPro = pro ? pro.nombre : (cita.id_profesional||'—');
  const color  = ag2Color(cita.id_profesional);

  document.getElementById('ag2-modal-tit').textContent = nomPac;
  document.getElementById('ag2-modal-sub').textContent =
    `${nomPro} · ${(cita.hora||'').slice(0,5)} · ${cita.fecha ? cita.fecha.split('T')[0].split('-').reverse().join('/') : '—'}`;
  document.getElementById('ag2-modal').style.borderTop = `4px solid ${color}`;

  const estadoColors = { Programada:'var(--azul)', Hecha:'var(--verde-dark)', Noshow:'var(--rojo)', Reprogramada:'#92400E', Cancelada:'var(--ink-muted)' };
  const estadoColor  = estadoColors[cita.estado] || 'var(--ink)';

  const row = (lbl, val) => `<div class="ag2-modal-row"><span class="ag2-modal-lbl">${lbl}</span><span class="ag2-modal-val">${val}</span></div>`;
  const modalLabels = { PSI:'Psicología', LOG:'Logopedia', TO:'T. Ocupacional', PDG:'Pedagogía' };
  const modalPago   = { BECA:'Beca', BONO:'Bono', PRIVADO_SU:'Privado S/U', ADECCO:'Adecco', OTROS:'Otros' };

  let bodyHtml = '';
  bodyHtml += row('Profesional', nomPro);
  bodyHtml += row('Especialidad', modalLabels[cita.especialidad] || cita.especialidad || '—');
  bodyHtml += row('Modalidad', modalPago[cita.modalidad_pago] || cita.modalidad_pago || '—');
  if (G.esAdmin && cita.precio != null) bodyHtml += row('Precio', `${parseFloat(cita.precio).toLocaleString('es-ES',{minimumFractionDigits:2})} €`);
  bodyHtml += row('Estado', `<span style="color:${estadoColor};font-weight:600">${cita.estado||'—'}</span>`);
  if (cita.notas) bodyHtml += row('Notas', cita.notas);
  bodyHtml += row('ID cita', `<span style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul)">${cita.id||'—'}</span>`);

  document.getElementById('ag2-modal-body').innerHTML = bodyHtml;
  document.getElementById('ag2-modal-overlay').classList.add('open');
}

function ag2CerrarModal() {
  document.getElementById('ag2-modal-overlay').classList.remove('open');
  AG2.citaModalActual = null;
}

function ag2VerPaciente() {
  if (!AG2.citaModalActual) return;
  const idPac = AG2.citaModalActual.id_paciente;
  ag2CerrarModal();
  navTo('pacientes');
  setTimeout(() => {
    const pac = (G.pacientes||[]).find(p => p.id === idPac);
    if (pac) abrirFicha(pac);
  }, 150);
}
