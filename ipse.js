// ══════════════════════════════════════════
//  ESTADO GLOBAL
// ══════════════════════════════════════════
// ── Utilidad global set() ────────────────────────────────────────
function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

const DATA = {
  terapeutas: [], sesiones: [], cobros: [],
  pacientes: [], bonos: [], becas: [],
  servicios: [], conciliacion: [], rawProduccion: [],
  _historico: null,
};

const today    = new Date();
const todayStr = today.toISOString().split('T')[0];

// ══════════════════════════════════════════
//  FORMATO NUMÉRICO — funciones globales
//  Implementación manual para garantizar formato es-ES
//  en cualquier entorno (incluido WebView de GAS)
// ══════════════════════════════════════════
function _numES(n, decimales) {
  // Formatea un número con separador de miles (.) y decimales (,) estilo es-ES
  const fixed = Math.abs(n).toFixed(decimales);
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const result = decimales > 0 ? parts[0] + ',' + parts[1] : parts[0];
  return (n < 0 ? '-' : '') + result;
}
function fmtKpi(v)      { return _numES(parseFloat(v) || 0, 0) + ' €'; }
function fmtKpiNoEur(v) { return _numES(parseFloat(v) || 0, 0); }
function fmtDet(v)      { return _numES(parseFloat(v) || 0, 2) + ' €'; }
function fmtPct(v) {
  // Pct_Com almacena fracciones: 1 = 100%, 0.6 = 60%
  const n = parseFloat(v) || 0;
  const pct = n <= 1 ? n * 100 : n; // compatibilidad: si ya viene como 60, no multiplicar
  return _numES(pct, pct % 1 === 0 ? 0 : 1) + '%';
}

// ══════════════════════════════════════════
//  API — comunica con google.script.run
// ══════════════════════════════════════════
function api(accion, datos = {}) {
  return new Promise((resolve) => {
    try {
      google.script.run
        .withSuccessHandler(result => {
          if (result && result.ok !== false) resolve(result.data !== undefined ? result.data : result);
          else { console.warn('API warn:', accion, result); resolve(null); }
        })
        .withFailureHandler(err => {
          console.error('API error:', accion, err);
          showToast('⚠️ Error: ' + (err.message || err));
          resolve(null);
        })
        .doPost_proxy(JSON.stringify({ accion, ...datos }));
    } catch(e) {
      console.error('google.script.run no disponible:', e);
      resolve(null);
    }
  });
}

// ══════════════════════════════════════════
//  NAVEGACIÓN
// ══════════════════════════════════════════
const TITLES = {
  dashboard:'Dashboard', agenda:'Agenda', produccion:'Producción',
  cobros:'Cobros', pacientes:'Pacientes', terapeutas:'Terapeutas',
  bonos:'Bonos', becas:'Becas', servicios:'Servicios', conciliacion:'Conciliación'
};

function navigate(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  const navEl = document.querySelector(`[data-page="${id}"]`);
  if (navEl) navEl.classList.add('active');
  document.getElementById('topbar-title').textContent = TITLES[id] || id;
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => navigate(item.dataset.page));
});

// Fecha topbar
document.getElementById('topbar-date').textContent = today.toLocaleDateString('es-ES', {
  weekday:'long', year:'numeric', month:'long', day:'numeric'
});

// ══════════════════════════════════════════
//  CARGA INICIAL
// ══════════════════════════════════════════
async function cargarSesiones(mes, anio) {
  const sesiones = await api('getSesiones', { mes, anio });
  if (!sesiones) return;
  DATA.sesiones = sesiones.map(s => ({
    id:        s.ID_Cita || '',
    fecha:     s.Fecha ? new Date(s.Fecha).toISOString().split('T')[0] : '',
    hora:      s.Hora ? String(s.Hora).substring(0,5) : '',
    paciente:  s.NombrePaciente || s.ID_Paciente || '',
    terapeuta: s.NombreTerapeuta || s.ID_Terapeuta || '',
    servicio:  s.NombreServicio || s.ID_Servicio || '',
    fin:       s.FinanciacionTipo || 'SUELTA',
    estado:    s.Estado || '',
    cobrado:   (s.Cerrada||'').toString().toUpperCase().trim() === 'SÍ' || (s.Cerrada||'').toString().toUpperCase().trim() === 'SI' ? 'Sí' : 'No',
    importe:   s.ImporteDevengado != null ? fmtDet(s.ImporteDevengado) : '',
    notas:     s.Notas || '',
    titulo:    s.titulo || '',
  }));
  aplicarFiltrosSesiones();
  renderSesionesHoy();
  actualizarKPIsProduccion();
  actualizarKPIsRango();
}

async function cargarCobros(mes, anio) {
  const cobros = await api('getCobros', { mes, anio });
  if (!cobros) return;
  DATA.cobros = cobros.map(c => ({
    id:         c.ID_Cobro || '',
    fecha:      c.FechaCobro ? new Date(c.FechaCobro).toLocaleDateString('es-ES') : '',
    fechaRaw:   c.FechaCobro ? new Date(c.FechaCobro).toISOString().split('T')[0] : '',
    paciente:   c.NombrePaciente || c.ID_Paciente || '',
    idPaciente: c.ID_Paciente || '',
    sesion:     c.ID_Sesion  || '',
    importe:    c.Importe != null ? fmtDet(c.Importe) : '',
    importeNum: c.Importe != null ? Number(c.Importe) : '',
    metodo:     c.MetodoPago    || '',
    estado:     c.EstadoCobro   || '',
    obs:        c.Observaciones || '',
  }));
  cargarCobros_local();
  actualizarKPIsCobros();
}

async function cargarDatos() {
  mostrarCargando(true);
  try {
    const hoy  = new Date();
    dashMes  = hoy.getMonth() + 1;
    dashAnio = hoy.getFullYear();
    const mes  = dashMes;
    const anio = dashAnio;
    const MESES_INIT = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    set('dash-nav-label', MESES_INIT[dashMes] + ' ' + dashAnio);
    set('dash-periodo-label', MESES_INIT[dashMes] + ' ' + dashAnio + ' — producción, asistencia y agenda');

  const [terapeutas, pacientes, servicios, bonos, becas, dashboard] = await Promise.all([
    api('getTerapeutas'),
    api('getPacientes'),
    api('getServicios'),
    api('getBonos'),
    api('getBecas'),
    api('getDashboard', { mes, anio }),
  ]);

  if (terapeutas) {
    DATA.terapeutas = terapeutas.map(t => ({
      id:          t.ID_Terapeuta  || t.id         || '',
      nombre:      t.Nombre        || t.nombre      || t.Name || t.NOMBRE || '',
      esp:         t.Especialidad  || t.especialidad || '',
      comisionPct: parseFloat(t['Pct_Com'] ?? t['Pct_com'] ?? 0),
      comision:    0,   // importe € — se rellena al llegar datos del dashboard
      sesiones:    0,
      produccion:  0,
      activa:      t.Activa === 'Sí' || t.Activa === true || t.activa === true,
    })).filter(t => t.id || t.nombre); // descartar filas vacías
    poblarSelects();
  }

  if (pacientes) {
    DATA.pacientes = pacientes.map(p => ({
      id:        p.ID_Paciente,
      nombre:    ((p.Nombre || '') + ' ' + (p.Apellidos || '')).trim(),
      apellidos: p.Apellidos || '',
      tutor:     p.Tutor1 || '',
      tutor2:    p.Tutor2 || '',
      tel:       p.Teléfono || p['Teléfono'] || '',
      tel2:      p.Teléfono2 || '',
      email:     p.Email || '',
      alta:      p.FechaAlta ? new Date(p.FechaAlta).toLocaleDateString('es-ES') : '',
      terapeuta: p.TerapeutaPrincipal || '',
      beca:      p.EsBeca || 'No',
      consent:   p.Consentimiento || 'Pendiente',
      notas:     p.Notas || '',
    }));
    poblarSelects();
  }

  if (servicios) {
    DATA.servicios = servicios.map(s => ({
      id:       s.ID_Servicio,
      tipo:     s.Tipo || '',
      servicio: s.Servicio || '',
      consumo:  s.Tipo_Consumo_Default || '',
      duracion: s.DuraciónMin ? s.DuraciónMin + ' min' : '',
      precio:   s.Precio != null ? fmtDet(s.Precio) : '',
      iva:      s.ExentoIVA || 'Sí',
      activo:   s.Activo || 'Sí',
    }));
    poblarSelects();
  }

  // ── FIX: mapeo de bonos limpio, sin bloque duplicado ────────
  if (bonos) {
    DATA.bonos = bonos.map(b => ({
      id:         b.ID_Bono,
      paciente:   b.NombrePaciente || b.ID_Paciente,
      tipo:       b.TipoBono || '',
      anticipo:   b.ImporteAnticipoBono != null ? fmtDet(b.ImporteAnticipoBono) : '',
      valor:      b.ValorSesion != null ? fmtDet(b.ValorSesion).replace(' €', ' €/ses') : '',
      compra:     b.FechaCompra  ? new Date(b.FechaCompra).toLocaleDateString('es-ES')  : '',
      cad:        b.FechaCaducidad ? new Date(b.FechaCaducidad).toLocaleDateString('es-ES') : '—',
      total:      Number(b.SesionesTotales)   || 0,
      consumidas: Number(b.Bonos_Consumidos)  || 0,
      pendientes: b.Bonos_Pendientes !== undefined && b.Bonos_Pendientes !== ''
                    ? Number(b.Bonos_Pendientes)
                    : Math.max((Number(b.SesionesTotales)||0) - (Number(b.Bonos_Consumidos)||0), 0),
      estado:     b.Estado || 'Activo',
      cobrado:    b.Cobrado || 'No',
    }));
    renderTablaBonos();
  }

  if (becas) {
    DATA.becas = becas.map(mapBeca);
    renderTablaBecas();
  }

  if (dashboard) {
    actualizarKPIs(dashboard.kpis);
    if (dashboard.historico)       actualizarGrafico(dashboard.historico);
    if (dashboard.porTerapeuta)    actualizarRanking(dashboard.porTerapeuta);
    if (dashboard.kpis)            renderDistribucion(dashboard.kpis, dashboard.porFinanciacion, dashboard.porFinanciacionSes);
    if (dashboard.kpis)            renderCobertura(dashboard.kpis);
    renderPendientePorTerapeuta();
  }

    await cargarSesiones(mes, anio);
    await cargarCobros(mes, anio);
    initTablas();
    renderAgenda();
  } catch(err) {
    console.error('cargarDatos error:', err);
    showToast('⚠️ Error al cargar: ' + (err.message || err));
  } finally {
    mostrarCargando(false);
  }
}


function navegarDash(dir) {
  if (dir === 0) { dashMes = new Date().getMonth()+1; dashAnio = new Date().getFullYear(); }
  else {
    dashMes += dir;
    if (dashMes > 12) { dashMes = 1;  dashAnio++; }
    if (dashMes < 1)  { dashMes = 12; dashAnio--; }
  }
  recargarDashboard();
}

async function recargarDashboard() {
  const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  set('dash-nav-label', MESES[dashMes] + ' ' + dashAnio);
  set('dash-periodo-label', MESES[dashMes] + ' ' + dashAnio + ' — producción, asistencia y agenda');

  const dashboard = await api('getDashboard', { mes: dashMes, anio: dashAnio });
  if (!dashboard) return;
  actualizarKPIs(dashboard.kpis);
  if (dashboard.porTerapeuta)    actualizarRanking(dashboard.porTerapeuta);
  if (dashboard.historico)       actualizarGrafico(dashboard.historico);
  if (dashboard.kpis)            renderDistribucion(dashboard.kpis, dashboard.porFinanciacion, dashboard.porFinanciacionSes);
  if (dashboard.kpis)            renderCobertura(dashboard.kpis);
  renderPendientePorTerapeuta();
}

function actualizarKPIs(kpis) {
  if (!kpis) return;
  const prod          = kpis.produccion      || 0;
  const cobrado       = kpis.cobrado         || 0;
  const pendiente     = kpis.pendiente       || (prod - cobrado);
  const cobradoBanco  = kpis.cobradoBanco    || 0;
  const margen        = kpis.margen          !== undefined ? kpis.margen : (prod - (kpis.totalComisiones || 0));
  const totalCom      = kpis.totalComisiones || 0;
  const sesReal       = kpis.sesionesRealizadas || 0;
  const pctCobr       = prod > 0 ? Math.round(cobrado / prod * 100) : 0;
  const pctMargen     = prod > 0 ? Math.round(margen / prod * 100) : 0;

  // Fila 1 — Económicos
  set('kpi-produccion',        fmtKpiNoEur(prod));
  set('kpi-produccion-sub',    sesReal + ' sesiones realizadas');
  set('kpi-cobrado',           fmtKpiNoEur(cobrado));
  set('kpi-cobrado-pct',       pctCobr + '% de lo devengado');
  set('kpi-pendiente-big',     fmtKpiNoEur(pendiente));
  set('kpi-pendiente-detalle', (kpis.sesionesProgram||0) + ' ses. programadas pendientes');
  set('kpi-cobrado-banco',     fmtKpiNoEur(cobradoBanco));
  set('kpi-cobrado-banco-sub', 'Bizum + Transferencia');
  set('kpi-margen',            fmtKpiNoEur(margen));
  set('kpi-margen-sub',        pctMargen + '% · Com. ' + fmtKpi(totalCom));

  // Fila 2 — Operativos
  const tasa = kpis.tasaAsistencia;
  set('kpi-tasa-asist',     tasa !== null && tasa !== undefined ? tasa + '%' : '—');
  set('kpi-tasa-asist-sub', sesReal + ' real. de ' + ((kpis.sesionesTotal||0) - (kpis.sesionesProgram||0)) + ' con estado');

  const ocup = kpis.ocupacion;
  set('kpi-ocupacion',     ocup !== null && ocup !== undefined ? ocup + '%' : '—');
  set('kpi-ocupacion-sub', sesReal + ' ses. de ' + (kpis.capacidadMaxima||0) + ' posibles (' + (kpis.diasLaborables||0) + ' días)');

  const perdidas = (kpis.noShows||0) + (kpis.canceladas||0);
  set('kpi-noshow',     perdidas);
  set('kpi-noshow-sub', (kpis.noShows||0) + ' no-shows · ' + (kpis.canceladas||0) + ' canceladas');

  set('kpi-altas',     kpis.altasMes || 0);
  set('kpi-altas-sub', (kpis.pacientesActivos||0) + ' pacientes activos en total');
}

function renderDistribucion(kpis, porFin, porFinSes) {
  if (!porFin) return;

  const totalEur = Object.values(porFin).reduce((s,v) => s+v, 0) || 0;
  const fmt = fmtDet;

  // ── Barras y valores de texto ──────────────────────────────────
  const mapa = {
    SUELTA: { barId: 'bar-suelta', lblId: 'fin-suelta' },
    BONO:   { barId: 'bar-bono',   lblId: 'fin-bono'   },
    BECA:   { barId: 'bar-beca',   lblId: 'fin-beca'   },
    ADECCO: { barId: 'bar-adecco', lblId: 'fin-adecco' },
  };
  Object.entries(mapa).forEach(([key, ids]) => {
    const eur = porFin[key] || 0;
    const pct = totalEur > 0 ? Math.round(eur / totalEur * 100) : 0;
    const barEl = document.getElementById(ids.barId);
    const lblEl = document.getElementById(ids.lblId);
    if (barEl) barEl.style.width = pct + '%';
    if (lblEl) lblEl.textContent = fmt(eur);
  });

  // ── Contadores pie ─────────────────────────────────────────────
  const bcCount = document.getElementById('fin-becas-count');
  const bnCount = document.getElementById('fin-bonos-count');
  const pendEl  = document.getElementById('fin-sesiones-pend');
  if (bcCount) bcCount.textContent = kpis.becasActivas || 0;
  if (bnCount) bnCount.textContent = kpis.bonosActivos || 0;
  if (pendEl)  pendEl.textContent  = kpis.sesPendBonos || 0;

  // ── Donut SVG ──────────────────────────────────────────────────
  const circum = 2 * Math.PI * 48; // ≈ 301.6
  const fuentes = [
    { key: 'SUELTA', id: 'donut-suelta' },
    { key: 'BONO',   id: 'donut-bono'   },
    { key: 'BECA',   id: 'donut-beca'   },
  ];
  let offset = 0;
  fuentes.forEach(f => {
    const eur = porFin[f.key] || 0;
    const arc = totalEur > 0 ? (eur / totalEur) * circum : 0;
    const el  = document.getElementById(f.id);
    if (!el) return;
    el.setAttribute('stroke-dasharray', arc.toFixed(1) + ' ' + circum.toFixed(1));
    el.setAttribute('transform', `rotate(${-90 + offset * 360} 60 60)`);
    offset += totalEur > 0 ? eur / totalEur : 0;
  });
  set('donut-center-value', totalEur > 0 ? fmtKpi(totalEur) : '—');
}

function renderCobertura(kpis) {
  const el = document.getElementById('card-cobertura');
  if (!el) return;

  function barraCobertura(label, usadas, total, color) {
    if (!total) return '';
    const pct = Math.round(usadas / total * 100);
    const pendientes = total - usadas;
    return `<div style="margin-bottom:18px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:13px;font-weight:600;color:var(--ink);">${label}</span>
        <span style="font-size:11px;color:var(--ink-muted);">${usadas} usadas de ${total}</span>
      </div>
      <div style="background:var(--border);border-radius:6px;height:12px;overflow:hidden;margin-bottom:4px;">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:6px;transition:width .4s;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;">
        <span style="color:${color};font-weight:700;">${pct}% consumido</span>
        <span style="color:var(--ink-muted);">${pendientes} sesiones disponibles</span>
      </div>
    </div>`;
  }

  const htmlBonos = barraCobertura('🎫 Bonos activos', kpis.sesUsadasBonos||0, kpis.sesTotalBonos||0, 'var(--cyan)');
  const htmlBecas = barraCobertura('🏛️ Becas activas', kpis.sesUsadasBecas||0, kpis.sesTotalBecas||0, 'var(--blue)');

  if (!htmlBonos && !htmlBecas) {
    el.innerHTML = '<div style="color:var(--ink-muted);font-size:13px;">Sin bonos ni becas activas</div>';
    return;
  }

  el.innerHTML = htmlBonos + htmlBecas + `
    <div style="padding-top:10px;border-top:1px solid var(--border);font-size:12px;color:var(--ink-muted);display:flex;gap:20px;flex-wrap:wrap;">
      <span>Ses. pendientes bonos: <strong style="color:var(--ink);">${kpis.sesPendBonos||0}</strong></span>
      <span>Ses. pendientes becas: <strong style="color:var(--ink);">${kpis.sesPendBecas||0}</strong></span>
    </div>`;
}

function renderDonut(s, b, bc, ad, total, labelCenter) {
  const circumference = 2 * Math.PI * 48; // 301.6
  const C = circumference;
  const pcts = [s, b, bc, ad].map(v => v / total);
  const ids  = ['donut-suelta', 'donut-bono', 'donut-beca'];
  // Solo dibujamos 3 segmentos (suelta, bono, beca — adecco queda como resto)
  let offset = 0;
  [
    { id: 'donut-suelta', val: s },
    { id: 'donut-bono',   val: b },
    { id: 'donut-beca',   val: bc },
  ].forEach(seg => {
    const el = document.getElementById(seg.id);
    if (!el) return;
    const dash = (seg.val / total) * C;
    el.setAttribute('stroke-dasharray', dash + ' ' + C);
    el.setAttribute('stroke-dashoffset', -offset);
    offset += dash;
  });
  set('donut-center-value', labelCenter);
}

function renderPendientePorTerapeuta() {
  const el = document.getElementById('pendiente-por-terapeuta');
  if (!el || !DATA.sesiones.length) return;

  // Agrupar sesiones no cobradas por terapeuta
  const porTer = {};
  DATA.sesiones.forEach(s => {
    if (s.cobrado === 'No' && s.estado === 'Hecha') {
      const key = s.terapeuta || 'Sin asignar';
      if (!porTer[key]) porTer[key] = { importe: 0, sesiones: 0 };
      porTer[key].importe  += parseFloat(s.importe) || 0;
      porTer[key].sesiones += 1;
    }
  });

  const lista = Object.entries(porTer).sort((a,b) => b[1].importe - a[1].importe);
  if (!lista.length) {
    el.innerHTML = '<div style="color:var(--ink-muted);font-size:13px;padding:8px 0">✅ Sin pendientes de cobro</div>';
    return;
  }

  const maxI = Math.max(...lista.map(([,v]) => v.importe), 1);
  el.innerHTML = lista.map(([ter, datos]) => `
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:13px;font-weight:500;">${ter}</span>
        <span style="font-size:13px;font-weight:600;color:var(--terracota);">${fmtDet(datos.importe)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="bar-mini" style="flex:1"><div class="bar-mini-fill" style="width:${Math.round(datos.importe/maxI*100)}%;background:var(--terracota-light)"></div></div>
        <span style="font-size:11px;color:var(--ink-muted);white-space:nowrap;">${datos.sesiones} ses.</span>
      </div>
    </div>`).join('');

  // Total
  const totalPend = lista.reduce((s,[,v]) => s + v.importe, 0);
  el.innerHTML += `<div class="divider"></div>
    <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;">
      <span>Total pendiente</span>
      <span style="color:var(--terracota)">${fmtDet(totalPend)}</span>
    </div>`;
}

function renderAlertas() {
  const el = document.getElementById('panel-alertas');
  if (!el) return;
  const alertas = [];

  // Bonos casi agotados (1-2 sesiones)
  DATA.bonos.forEach(b => {
    const pend = parseInt(b.pendientes) || 0;
    if (b.estado === 'Activo' && pend <= 2 && pend > 0) {
      alertas.push({ tipo: 'gold', icon: '🎫', msg: `Bono de <strong>${b.paciente}</strong>: solo ${pend} sesión${pend>1?'es':''} pendiente${pend>1?'s':''}` });
    }
    if (b.estado === 'Agotado') {
      alertas.push({ tipo: 'terracota', icon: '⚠️', msg: `Bono de <strong>${b.paciente}</strong> agotado — renovar` });
    }
  });

  // Sesiones con cobro pendiente antiguo (si tenemos fechas)
  const haceUnMes = new Date();
  haceUnMes.setDate(haceUnMes.getDate() - 30);
  const haceUnMesStr = haceUnMes.toISOString().split('T')[0];
  const viejas = DATA.sesiones.filter(s => s.cobrado === 'No' && s.estado === 'Hecha' && s.fecha < haceUnMesStr);
  if (viejas.length > 0) {
    alertas.push({ tipo: 'terracota', icon: '💶', msg: `${viejas.length} sesión${viejas.length>1?'es':''} sin cobrar con más de 30 días de antigüedad` });
  }

  if (!alertas.length) {
    el.innerHTML = '<div style="color:var(--sage);font-size:13px;padding:8px 0">✅ Todo en orden, sin alertas</div>';
    return;
  }

  el.innerHTML = alertas.map(a => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:18px;line-height:1;">${a.icon}</span>
      <span style="font-size:13px;color:var(--ink-light);line-height:1.4;">${a.msg}</span>
    </div>`).join('');
}

function actualizarKPIsCobros() {
  const total    = DATA.cobros.reduce((s,c) => s + (parseFloat(c.importe) || 0), 0);
  const pendiente= DATA.sesiones.filter(s => s.cobrado === 'No')
                                .reduce((s, ses) => s + (parseFloat(ses.importe) || 0), 0);
  set('cobros-total-kpi',    fmtKpi(total));
  set('cobros-pendiente-kpi',fmtKpi(pendiente));
  set('cobros-count-kpi',    DATA.cobros.length);
}

function actualizarKPIsProduccion() {
  // Hoy
  const sesHoy  = DATA.sesiones.filter(s => s.fecha === todayStr && s.estado === 'Hecha');
  const prodHoy = sesHoy.reduce((sum,s) => sum + (parseFloat(s.importe)||0), 0);
  set('prod-hoy-valor',    fmtKpi(prodHoy));
  set('prod-hoy-sesiones', sesHoy.length + ' sesiones realizadas');

  // Semana (lunes a hoy)
  const lunes = new Date(today);
  lunes.setDate(today.getDate() - today.getDay() + 1);
  const lunesStr = lunes.toISOString().split('T')[0];
  const sesSemana  = DATA.sesiones.filter(s => s.fecha >= lunesStr && s.fecha <= todayStr && s.estado === 'Hecha');
  const prodSemana = sesSemana.reduce((sum,s) => sum + (parseFloat(s.importe)||0), 0);
  set('prod-semana-valor',    fmtKpi(prodSemana));
  set('prod-semana-sesiones', sesSemana.length + ' sesiones');

  // Mes completo
  const sesMes  = DATA.sesiones.filter(s => s.estado === 'Hecha');
  const prodMes = sesMes.reduce((sum,s) => sum + (parseFloat(s.importe)||0), 0);
  set('prod-mes-valor',    fmtKpi(prodMes));
  set('prod-mes-sesiones', sesMes.length + ' sesiones');
}

// ══════════════════════════════════════════
//  POBLAR SELECTS
// ══════════════════════════════════════════
function poblarSelects() {
  // Pacientes
  const opsPac = DATA.pacientes.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  document.querySelectorAll('[data-select="paciente"]').forEach(s => {
    s.innerHTML = '<option value="">— Selecciona paciente —</option>' + opsPac;
  });
  // Terapeutas
  const opsTer = DATA.terapeutas.map(t => `<option value="${t.id}">${t.id} – ${t.nombre}</option>`).join('');
  document.querySelectorAll('[data-select="terapeuta"]').forEach(s => {
    s.innerHTML = '<option value="">— Selecciona terapeuta —</option>' + opsTer;
  });
  // Servicios
  const opsSrv = DATA.servicios.map(s => `<option value="${s.id}">${s.servicio} (${s.precio})</option>`).join('');
  document.querySelectorAll('[data-select="servicio"]').forEach(s => {
    s.innerHTML = '<option value="">— Selecciona servicio —</option>' + opsSrv;
  });
  makeAllSearchable();
}

// ══════════════════════════════════════════
//  GRÁFICO
// ══════════════════════════════════════════
function actualizarGrafico(historico) {
  DATA._historico = historico;
  renderChart();
}

function renderChart() {
  const historico = DATA._historico;
  if (!historico || !historico.length) return;
  const maxV = Math.max(...historico.map(h => h.produccion), 1);
  const el   = document.getElementById('chart-produccion');
  if (!el) return;
  el.innerHTML = '';
  historico.forEach(h => {
    const prod     = h.produccion || 0;
    const cobrado  = h.cobrado    || 0;
    const pendiente= Math.max(prod - cobrado, 0);
    const hP = Math.round((prod     / maxV) * 150);
    const hC = Math.round((cobrado  / maxV) * 150);
    const hPend = Math.round((pendiente / maxV) * 150);
    const fmt = fmtKpi;
    el.innerHTML += `
      <div class="chart-bar-wrap">
        <div style="display:flex;gap:2px;height:${Math.max(hP,4)}px;align-items:flex-end;">
          <div class="chart-bar produccion" style="height:${Math.max(hP,2)}px;flex:1;border-radius:3px 3px 0 0;"
               title="Producción: ${fmt(prod)}"></div>
          <div class="chart-bar cobros" style="height:${Math.max(hC,2)}px;flex:1;border-radius:3px 3px 0 0;"
               title="Cobrado: ${fmt(cobrado)}"></div>
          <div style="height:${Math.max(hPend,2)}px;flex:1;border-radius:3px 3px 0 0;background:var(--terracota-light);opacity:.5;"
               title="Pendiente: ${fmt(pendiente)}"></div>
        </div>
        <div class="chart-label">${h.label}</div>
      </div>`;
  });
}

// ══════════════════════════════════════════
//  SESIONES HOY — FIX: usa todayStr dinámico
// ══════════════════════════════════════════
function renderSesionesHoy() {
  const el  = document.getElementById('sesiones-hoy');
  const hoy = DATA.sesiones.filter(s => s.fecha === todayStr);
  if (!hoy.length) {
    el.innerHTML = '<div style="color:var(--ink-muted);font-size:13px;padding:8px 0">Sin sesiones registradas hoy</div>';
    return;
  }
  el.innerHTML = hoy.map(s => `
    <div class="sesion-row">
      <div class="sesion-time">${s.hora || '—'}</div>
      <div class="sesion-info">
        <div class="sesion-paciente">${s.paciente}</div>
        <div class="sesion-terapeuta">${s.terapeuta} · ${s.servicio}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        ${s.fin !== 'SUELTA' ? `<span class="badge ${s.fin.toLowerCase()}">${s.fin}</span>` : ''}
        <span class="badge ${(s.estado||'').toLowerCase().replace('-','').replace(' ','')}">${s.estado}</span>
      </div>
    </div>`).join('');
}

// ══════════════════════════════════════════
//  RANKING TERAPEUTAS
// ══════════════════════════════════════════
function actualizarRanking(porTerapeuta) {
  if (!porTerapeuta || !porTerapeuta.length) return;
  const el = document.getElementById('ranking-terapeutas');
  if (!el) return;
  const maxProd = Math.max(...porTerapeuta.map(t => t.produccion), 1);
  const fmt = fmtDet;

  el.innerHTML = porTerapeuta.map(t => {
    const pct     = Math.round(t.produccion / maxProd * 100);
    const tasa    = t.tasaAsist !== null && t.tasaAsist !== undefined ? t.tasaAsist + '%' : '—';
    const tasaCol = t.tasaAsist >= 80 ? 'var(--green-dark)' : t.tasaAsist >= 60 ? '#B8640A' : 'var(--red)';
    return `<div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0;">${(t.nombre||'?')[0]}</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--ink);">${t.nombre||'—'}</div>
            <div style="font-size:11px;color:var(--ink-muted);">${t.especialidad||''}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:14px;font-weight:700;color:var(--blue);">${fmt(t.produccion)}</div>
          <div style="font-size:11px;color:var(--ink-muted);">${t.sesiones} ses.</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="bar-mini" style="flex:1;height:6px;border-radius:3px;">
          <div class="bar-mini-fill" style="width:${pct}%;background:var(--blue);opacity:.7;height:100%;border-radius:3px;"></div>
        </div>
        <span style="font-size:11px;font-weight:700;color:${tasaCol};min-width:60px;text-align:right;">Asist: ${tasa}</span>
      </div>
      <div style="margin-top:4px;font-size:11px;color:var(--ink-muted);">Comisión: <strong>${fmtPct(t.comisionPct)}</strong> · ${fmtDet(t.comision)}</div>
      ${t.pendiente > 0 ? `<div style="margin-top:3px;font-size:11px;color:var(--red);">⚠ ${fmt(t.pendiente)} pendiente</div>` : ''}
    </div>`;
  }).join('');

  // Sincronizar también la vista de terapeutas
  DATA.terapeutas = porTerapeuta.map(pt => ({
    id: pt.id, nombre: pt.nombre, esp: pt.especialidad || '',
    sesiones: pt.sesiones, produccion: pt.produccion, pendiente: pt.pendiente,
    comision: pt.comision || 0,         // importe € de comisión
    comisionPct: pt.comisionPct || 0,   // % del sheet
    activa: true,
  }));
}


function renderRanking() {
  const el    = document.getElementById('ranking-terapeutas');
  if (!el) return;
  // Filtrar terapeutas con datos válidos
  const lista  = DATA.terapeutas.filter(t => t && t.nombre);
  if (!lista.length) { el.innerHTML = '<div class="text-muted" style="padding:12px 0">Sin datos de terapeutas</div>'; return; }
  const maxP  = Math.max(...lista.map(t => t.produccion || 0), 1);
  const colors= ['#C4614A','#6B8F71','#C9963A','#5A5AA0','#3A8A6A'];
  el.innerHTML = lista.map((t,i) => {
    const nombre  = String(t.nombre || t.id || '?');
    const iniciales = nombre.split(' ').map(x => x[0] || '').join('').slice(0,2).toUpperCase() || '??';
    const produccion = t.produccion || 0;
    return `
    <div class="terapeuta-row">
      <div class="terapeuta-avatar" style="background:${colors[i % colors.length]}">${iniciales}</div>
      <div class="terapeuta-info">
        <div class="terapeuta-name">${nombre}</div>
        <div class="terapeuta-esp">${t.esp || ''}</div>
        <div class="bar-mini"><div class="bar-mini-fill" style="width:${Math.round(produccion/maxP*100)}%;background:${colors[i % colors.length]}"></div></div>
      </div>
      <div class="terapeuta-stats">
        <div class="terapeuta-amount">${fmtKpi(produccion)}</div>
        <div class="terapeuta-sessions">${t.sesiones || 0} sesiones</div>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
//  TABLAS GENÉRICAS
// ══════════════════════════════════════════
function badgeEstado(e) {
  const str = String(e || '').toLowerCase().replace(/[- ]/g,'');
  const cls = { hecha:'hecha', programada:'programada', cancelada:'cancelada',
    noshow:'noshow', suelta:'', bono:'bono', beca:'beca',
    confirmado:'confirmado', pendiente:'pendiente',
    activo:'activo', agotado:'agotado',
    firmado:'firmado', cobrado:'hecha',
    si:'hecha', no:'cancelada' };
  return `<span class="badge ${cls[str]||''}">${e}</span>`;
}

function renderTabla(tbodyId, rows, cols) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return;
  tb.innerHTML = rows.map(r => `<tr>${cols.map(c => {
    const v = r[c.key] != null ? r[c.key] : '';
    if (c.badge)  return `<td>${badgeEstado(v)}</td>`;
    if (c.strong) return `<td class="strong">${v}</td>`;
    if (c.muted)  return `<td class="muted">${v}</td>`;
    return `<td>${v}</td>`;
  }).join('')}<td><button class="btn btn-secondary btn-sm btn-icon" title="Editar">✏️</button></td></tr>`).join('');
}

// ── Bonos con barra de progreso visual ───────────────────────
function renderTablaBonos() {
  const tb = document.getElementById('tbody-bonos');
  if (!tb) return;
  tb.innerHTML = DATA.bonos.map(b => {
    const total      = Number(b.total)      || 0;
    const consumidas = Number(b.consumidas) || 0;
    const pendientes = Number(b.pendientes) || 0;
    const pct        = total > 0 ? Math.min(Math.round(consumidas / total * 100), 100) : 0;
    const barColor   = pct >= 100 ? 'var(--terracota)' : pct >= 75 ? 'var(--gold)' : 'var(--sage)';
    const estadoClass= b.estado === 'Activo' ? 'activo' : b.estado === 'Agotado' ? 'agotado' : 'programada';
    return `<tr>
      <td class="strong">${b.id}</td>
      <td class="strong">${b.paciente}</td>
      <td>${b.tipo}</td>
      <td class="strong">${b.anticipo}</td>
      <td>${b.valor}</td>
      <td>${b.compra}</td>
      <td>${b.cad}</td>
      <td style="text-align:center">${total}</td>
      <td style="text-align:center">${consumidas}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <strong style="color:${pendientes===0?'var(--terracota)':'var(--ink)'}">${pendientes}</strong>
          <div style="flex:1;height:6px;background:var(--border);border-radius:3px;min-width:60px;">
            <div style="width:${pct}%;height:100%;background:${barColor};border-radius:3px;"></div>
          </div>
          <span style="font-size:10px;color:var(--ink-muted)">${pct}%</span>
        </div>
      </td>
      <td><span class="badge ${['SI','SÍ'].includes((b.cobrado||'').toUpperCase().trim())?'activo':'cancelada'}">${['SI','SÍ'].includes((b.cobrado||'').toUpperCase().trim())?'Sí':'No'}</span></td>
      <td><span class="badge ${estadoClass}">${b.estado}</span></td>
      <td><button class="btn btn-secondary btn-sm btn-icon" title="Editar" onclick="editarBono('${b.id}')">✏️</button></td>
    </tr>`;
  }).join('');
}

// ── Becas ─────────────────────────────────────────────────────
function renderTablaBecas() {
  const tbBecas = document.getElementById('tbody-becas');
  if (tbBecas) {
    tbBecas.innerHTML = DATA.becas.map(b => {
      const cobVal = (b.cobrado||'').toString().toUpperCase().trim();
      const cobBadge = (cobVal === 'SI' || cobVal === 'SÍ')
        ? '<span style="color:var(--sage);font-weight:600">✓ Sí</span>'
        : '<span style="color:var(--terracota)">No</span>';
      return `<tr>
        <td class="strong">${b.id||''}</td>
        <td>${b.año||''}</td>
        <td class="strong">${b.paciente||''}</td>
        <td>${b.bruto||''}</td>
        <td>${b.fee||''}</td>
        <td class="strong">${b.neto||''}</td>
        <td style="text-align:center">${b.sesiones||''}</td>
        <td style="text-align:center">${b.consumidas||''}</td>
        <td style="text-align:center;font-weight:600">${b.pendientes||''}</td>
        <td><span class="badge ${b.estado==='Activo'?'activo':'agotado'}">${b.estado||''}</span></td>
        <td>${cobBadge}</td>
        <td>${b.cobro||'—'}</td>
        <td><button class="btn btn-secondary btn-sm btn-icon" title="Editar beca" onclick="editarBeca('${b.id}')">✏️</button></td>
      </tr>`;
    }).join('');
  }
  // KPIs becas
  const activas  = DATA.becas.filter(b => b.estado === 'Activo').length;
  const sesPend  = DATA.becas.filter(b => b.estado === 'Activo')
                             .reduce((s,b) => s + (Number(b.pendientes)||0), 0);
  const impPend  = DATA.becas
                             .filter(b => {
                               const cob = (b.cobrado||'').toString().toUpperCase().trim();
                               return cob !== 'SI' && cob !== 'SÍ';
                             })
                             .reduce((s,b) => s + (parseFloat(b.neto)||0), 0);
  set('becas-activas-count', activas);
  set('becas-sesiones-pend', sesPend);
  set('becas-importe-pend',  fmtKpi(impPend));
}

function initTablas() {
  const tbPac = document.getElementById('tbody-pacientes');
  if (tbPac) tbPac.innerHTML = DATA.pacientes.map(p => `<tr>
    <td class="muted">${p.id||''}</td>
    <td class="strong">${p.nombre||''}</td>
    <td>${p.tutor||''}</td>
    <td>${p.tel||''}</td>
    <td class="muted">${p.alta||''}</td>
    <td>${p.terapeuta||''}</td>
    <td>${p.beca||''}</td>
    <td><span class="badge ${p.consent==='Firmado'?'activo':'cancelada'}">${p.consent||''}</span></td>
    <td><button class="btn btn-secondary btn-sm btn-icon" title="Editar paciente" onclick="editarPaciente('${p.id}')">✏️</button></td>
  </tr>`).join('');
  document.getElementById('pacientes-count').textContent = DATA.pacientes.length + ' pacientes';

  renderTabla('tbody-terapeutas', DATA.terapeutas.map(t=>({
    ...t,
    activa:     t.activa ? '✅ Sí' : '❌ No',
    produccion: fmtKpi(t.produccion),
    comision:   fmtPct(t.comisionPct ?? t['%Comisión'] ?? 0),
  })), [
    {key:'id',muted:true},{key:'nombre',strong:true},{key:'esp'},
    {key:'comision'},{key:'sesiones'},{key:'produccion',strong:true},{key:'activa'}
  ]);

  renderTablaBonos();
  renderTablaBecas();

  renderTabla('tbody-servicios', DATA.servicios, [
    {key:'id',muted:true},{key:'tipo'},{key:'servicio',strong:true},
    {key:'consumo'},{key:'duracion'},{key:'precio',strong:true},
    {key:'iva'},{key:'activo'}
  ]);
  renderTabla('tbody-conciliacion', DATA.conciliacion, [
    {key:'fecha'},{key:'concepto'},{key:'importe',strong:true},
    {key:'cobro'},{key:'paciente'},{key:'estado',badge:true}
  ]);
}

// ══════════════════════════════════════════
//  BÚSQUEDA
// ══════════════════════════════════════════
function filtrarTabla(input, tblId) {
  const q = input.value.toLowerCase();
  document.getElementById(tblId).querySelectorAll('tbody tr').forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ══════════════════════════════════════════
//  PRODUCCIÓN — FILTROS Y PAGINACIÓN
// ══════════════════════════════════════════
const PROD_PAGE_SIZE = 25;
let   prodPaginaActual = 1;
let   prodSesionesFiltradas = [];

function inicializarFiltrosTerapeutas() {
  // Terapeutas
  const selT = document.getElementById('filtro-terapeuta-prod');
  if (selT) {
    const actualT = selT.value;
    selT.innerHTML = '<option value="">Todos los terapeutas</option>';
    const nombres = [...new Set(DATA.sesiones.map(s => s.terapeuta).filter(Boolean))].sort();
    nombres.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n; opt.textContent = n;
      selT.appendChild(opt);
    });
    selT.value = actualT;
    // Reinicializar widget searchable con las nuevas opciones
    delete selT.dataset.searchable;
    selT.style.display = '';
    const oldWrap = selT.closest('.ss-wrap');
    if (oldWrap) { oldWrap.parentNode.insertBefore(selT, oldWrap); oldWrap.remove(); }
    makeSearchable('filtro-terapeuta-prod', 'Todos los terapeutas');
  }
  // Servicios
  const selS = document.getElementById('filtro-servicio-prod');
  if (selS) {
    const actualS = selS.value;
    selS.innerHTML = '<option value="">Todos los servicios</option>';
    const servicios = [...new Set(DATA.sesiones.map(s => s.servicio).filter(Boolean))].sort();
    servicios.forEach(sv => {
      const opt = document.createElement('option');
      opt.value = sv; opt.textContent = sv;
      selS.appendChild(opt);
    });
    selS.value = actualS;
    // Reinicializar widget searchable con las nuevas opciones
    delete selS.dataset.searchable;
    selS.style.display = '';
    const oldWrap2 = selS.closest('.ss-wrap');
    if (oldWrap2) { oldWrap2.parentNode.insertBefore(selS, oldWrap2); oldWrap2.remove(); }
    makeSearchable('filtro-servicio-prod', 'Todos los servicios');
  }
}

function aplicarFiltrosSesiones() {
  const busqueda = (document.querySelector('#tab-sesiones .search-input') || {value:''}).value.toLowerCase();
  const desde    = document.getElementById('filtro-fecha-desde')?.value || '';
  const hasta    = document.getElementById('filtro-fecha-hasta')?.value || '';
  const terapeuta= document.getElementById('filtro-terapeuta-prod')?.value || '';
  const estado   = document.getElementById('filtro-estado-sesion')?.value || '';
  const servicio = document.getElementById('filtro-servicio-prod')?.value || '';
  const cobrado  = document.getElementById('filtro-cobrado-prod')?.value || '';

  prodSesionesFiltradas = DATA.sesiones.filter(s => {
    if (busqueda && !`${s.paciente} ${s.terapeuta} ${s.servicio}`.toLowerCase().includes(busqueda)) return false;
    if (desde    && s.fecha < desde)              return false;
    if (hasta    && s.fecha > hasta)              return false;
    if (terapeuta && s.terapeuta !== terapeuta)   return false;
    if (estado   && s.estado !== estado)          return false;
    if (servicio && s.servicio !== servicio)       return false;
    if (cobrado  && s.cobrado !== cobrado)         return false;
    return true;
  });

  prodPaginaActual = 1;
  renderSesionesFiltradas();
  actualizarKPIsRango();
}

function limpiarFiltrosSesiones() {
  const ids = ['filtro-fecha-desde','filtro-fecha-hasta','filtro-terapeuta-prod','filtro-estado-sesion','filtro-servicio-prod','filtro-cobrado-prod'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const si = document.querySelector('#tab-sesiones .search-input');
  if (si) si.value = '';
  aplicarFiltrosSesiones();
}

function renderSesionesFiltradas() {
  const total  = prodSesionesFiltradas.length;
  const paginas= Math.ceil(total / PROD_PAGE_SIZE) || 1;
  const inicio = (prodPaginaActual - 1) * PROD_PAGE_SIZE;
  const pagina = prodSesionesFiltradas.slice(inicio, inicio + PROD_PAGE_SIZE);

  const tb = document.getElementById('tbody-sesiones');
  if (tb) {
    tb.innerHTML = pagina.map(s => {
      const finClass = s.fin === 'BONO' ? 'bono' : s.fin === 'BECA' ? 'beca' : s.fin === 'ADECCO' ? 'adecco' : 'suelta';
      const estClass = s.estado === 'Hecha' ? 'activo' : s.estado === 'Cancelada' ? 'cancelada' : s.estado === 'No-show' ? 'noshow' : 'programada';
      const cobBadge = s.cobrado === 'Sí'
        ? '<span style="color:var(--sage);font-weight:600">✓ Sí</span>'
        : '<span style="color:var(--terracota)">No</span>';
      return `<tr>
        <td class="strong">${s.id||''}</td>
        <td>${s.fecha||''}</td>
        <td>${s.hora||''}</td>
        <td class="strong">${s.paciente||''}</td>
        <td>${s.terapeuta||''}</td>
        <td>${s.servicio||''}</td>
        <td><span class="badge ${finClass}">${s.fin||''}</span></td>
        <td><span class="badge ${estClass}">${s.estado||''}</span></td>
        <td>${s.importe||''}</td>
        <td>${cobBadge}</td>
        <td><button class="btn btn-secondary btn-sm btn-icon" title="Editar sesión" onclick="editarSesion('${s.id}')">✏️</button></td>
      </tr>`;
    }).join('');
  }

  // Contador
  const countEl = document.getElementById('sesiones-count');
  if (countEl) countEl.textContent = total + ' sesiones' + (total !== DATA.sesiones.length ? ' (filtradas de ' + DATA.sesiones.length + ')' : '');

  // Paginación
  const pagEl = document.getElementById('paginacion-sesiones');
  if (!pagEl) return;
  if (paginas <= 1) { pagEl.innerHTML = ''; return; }
  let html = '';
  if (prodPaginaActual > 1) html += `<button class="btn btn-secondary btn-sm" onclick="irPagina(${prodPaginaActual-1})">‹</button>`;
  const desde = Math.max(1, prodPaginaActual - 2);
  const hasta = Math.min(paginas, prodPaginaActual + 2);
  for (let i = desde; i <= hasta; i++) {
    const active = i === prodPaginaActual ? 'btn-primary' : 'btn-secondary';
    html += `<button class="btn ${active} btn-sm" onclick="irPagina(${i})">${i}</button>`;
  }
  if (prodPaginaActual < paginas) html += `<button class="btn btn-secondary btn-sm" onclick="irPagina(${prodPaginaActual+1})">›</button>`;
  pagEl.innerHTML = html;
}

function irPagina(n) {
  prodPaginaActual = n;
  renderSesionesFiltradas();
}

function actualizarKPIsRango() {
  const ses = prodSesionesFiltradas;
  const hechas = ses.filter(s => s.estado === 'Hecha');
  const prod   = hechas.reduce((sum,s) => sum + (parseFloat(s.importe) || 0), 0);
  const cobrado= hechas.filter(s => s.cobrado === 'Sí').reduce((sum,s) => sum + (parseFloat(s.importe) || 0), 0);
  const pend   = prod - cobrado;
  const ticket = hechas.length > 0 ? prod / hechas.length : 0;
  const noshow = ses.filter(s => s.estado === 'No-show').length;
  const cancel = ses.filter(s => s.estado === 'Cancelada').length;
  const ters   = new Set(ses.map(s => s.terapeuta).filter(Boolean)).size;
  const pct    = prod > 0 ? Math.round(cobrado/prod*100) : 0;
  const fmt    = fmtDet;

  set('prod-rango-valor',     fmt(prod));
  set('prod-rango-sesiones',  hechas.length + ' sesiones realizadas');
  set('prod-rango-cobrado',   fmt(cobrado));
  set('prod-rango-cobrado-pct', pct + '% cobrado');
  set('prod-rango-pendiente', fmt(pend));
  set('prod-rango-noshow',    'No-shows: ' + noshow + ' · Canceladas: ' + cancel);
  set('prod-rango-ticket',    fmt(ticket));
  set('prod-rango-terapeutas', ters + ' terapeuta' + (ters !== 1 ? 's' : ''));
}

// Raw tab
let rawCargado = false;
async function cargarRaw() {
  if (rawCargado) return;
  const raw = await api('getRawProduccion');
  if (!raw) return;
  rawCargado = true;
  set('raw-count', raw.length);
  const tbody = document.getElementById('tbody-raw');
  if (!tbody) return;
  tbody.innerHTML = raw.map(r => `<tr>
    <td style="font-size:11px;color:var(--ink-muted)">${r.Timestamp ? new Date(r.Timestamp).toLocaleString('es-ES') : '—'}</td>
    <td>${r.Fecha ? new Date(r.Fecha).toLocaleDateString('es-ES') : '—'}</td>
    <td>${r.Hora || '—'}</td>
    <td><strong>${r.Terapeuta || '—'}</strong></td>
    <td>${r.Paciente || r.NombrePaciente || '—'}</td>
    <td>${r.Servicio || '—'}</td>
    <td>${r.Estado || '—'}</td>
    <td>${r.CobradoHoy || r.Cobrado_Hoy || '—'}</td>
    <td>${r.MedioPago || r.Medio_Pago || '—'}</td>
    <td style="font-size:11px;color:var(--ink-muted)">${r.Notas || ''}</td>
  </tr>`).join('');
}

function editarPaciente(idPaciente) {
  const p = DATA.pacientes.find(x => x.id === idPaciente);
  if (!p) { showToast('❌ Paciente no encontrado'); return; }

  document.getElementById('p-id-paciente').value               = idPaciente;
  document.getElementById('modal-paciente-titulo').textContent = 'Editar paciente ' + idPaciente;
  document.getElementById('btn-guardar-paciente').textContent  = 'Guardar cambios';
  document.getElementById('p-nombre').value    = p.nombre    || '';
  document.getElementById('p-apellidos').value = p.apellidos || '';
  document.getElementById('p-tutor1').value    = p.tutor     || '';
  document.getElementById('p-tel').value       = p.tel       || '';
  document.getElementById('p-tutor2').value    = p.tutor2    || '';
  document.getElementById('p-tel2').value      = p.tel2      || '';
  document.getElementById('p-email').value     = p.email     || '';
  document.getElementById('p-beca').value      = p.beca      || 'No';
  document.getElementById('p-consent').value   = p.consent   || 'Pendiente';
  document.getElementById('p-notas').value     = p.notas     || '';

  // Terapeuta
  const selTer = document.getElementById('p-terapeuta');
  [...(selTer?.options||[])].forEach(o => {
    if (o.text.toLowerCase().includes((p.terapeuta||'').toLowerCase())) selTer.value = o.value;
  });

  document.getElementById('modal-paciente').classList.add('open');
}

function editarCobro(idCobro) {
  const c = DATA.cobros.find(x => x.id === idCobro);
  if (!c) { showToast('❌ Cobro no encontrado'); return; }

  document.getElementById('c-id-cobro').value               = idCobro;
  document.getElementById('modal-cobro-titulo').textContent = 'Editar cobro ' + idCobro;
  document.getElementById('btn-guardar-cobro').textContent  = 'Guardar cambios';
  document.getElementById('c-fecha').value    = c.fechaRaw  || c.fecha || '';
  document.getElementById('c-importe').value  = c.importeNum|| '';
  document.getElementById('c-metodo').value   = c.metodo    || 'Efectivo';
  document.getElementById('c-estado').value   = c.estado    || 'Confirmado';
  document.getElementById('c-sesion').value   = c.sesion    || '';
  document.getElementById('c-obs').value      = c.obs       || '';

  // Paciente
  const selPac = document.getElementById('c-paciente');
  [...(selPac?.options||[])].forEach(o => {
    if (o.text.toLowerCase().includes((c.paciente||'').toLowerCase())) selPac.value = o.value;
  });

  document.getElementById('modal-cobro').classList.add('open');
}

function mapBeca(b) {
  return {
    id:         b.ID_Beca,
    año:        b.Año,
    paciente:   b.NombrePaciente || b.ID_Paciente,
    bruto:      b.ImporteBrutoBeca != null ? fmtDet(b.ImporteBrutoBeca) : '',
    fee:        b.FeeGestionBeca  != null ? fmtDet(b.FeeGestionBeca)  : '',
    neto:       b.ImporteNeto     != null ? fmtDet(b.ImporteNeto)     : '',
    brutoNum:   b.ImporteBrutoBeca || '',
    feeNum:     b.FeeGestionBeca   || '',
    netoNum:    b.ImporteNeto      || '',
    sesiones:   b.SesionesObjetivoAño || 0,
    consumidas: b.Becas_Consumidas    || 0,
    pendientes: b.Becas_Pendientes    || 0,
    estado:     b.Estado_Beca || b.Estado || 'Activo',
    cobrado:    b.Cobrado || '',
    cobro:      b.FechaCobro ? new Date(b.FechaCobro).toLocaleDateString('es-ES') : '—',
    notas:      b.Notas || '',
  };
}

function filtrarSesionesPor() { aplicarFiltrosSesiones(); }

async function recalcularCobrosBono() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = '⏳ Recalculando...';
  try {
    const res = await api('recalcularCobrosBono');
    if (res && res.sesionesActualizadas !== undefined) {
      showToast(`✓ ${res.sesionesActualizadas} sesiones actualizadas`);
      await cargarBonos();
      await cargarSesiones(new Date().getMonth()+1, new Date().getFullYear());
    } else {
      showToast('Error al recalcular');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Recalcular cobros';
  }
}

// ══════════════════════════════════════════
//  AGENDA
// ══════════════════════════════════════════
let semanaOffset = 0;
const HORAS = ['09:00','10:00','11:00','12:00','13:00','14:00','16:00','17:00','18:00','19:00','20:00'];

function offsetSemana(dir) {
  semanaOffset = dir === 0 ? 0 : semanaOffset + dir;
  renderAgenda();
}

// Mapa de colores Google Calendar → CSS color
const CAL_COLORS = {
  '1':'#a4bdfc','2':'#7ae7bf','3':'#dbadff','4':'#ff887c',
  '5':'#fbd75b','6':'#ffb878','7':'#46d6db','8':'#e1e1e1',
  '9':'#5484ed','10':'#51b749','11':'#dc2127',
};

async function renderAgenda() {
  const grid  = document.getElementById('agenda-grid');
  const lunes = new Date(today);
  lunes.setDate(today.getDate() - today.getDay() + 1 + semanaOffset * 7);

  // Lunes → Sábado (6 días)
  const dias   = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const fechas = dias.map((_,i) => { const d = new Date(lunes); d.setDate(lunes.getDate()+i); return d; });

  document.getElementById('agenda-week-label').textContent =
    `Semana del ${fechas[0].toLocaleDateString('es-ES',{day:'numeric',month:'long'})} al ${fechas[5].toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'})}`;

  const fechaInicio = lunes.toISOString().split('T')[0];
  const agendaData  = await api('getAgenda', { fechaInicio });
  const citas       = agendaData ? (agendaData.agenda  || []) : [];
  const calEvents   = agendaData ? (agendaData.calendar || []) : [];

  const eventos = citas.map(c => {
    const fecha  = c.Fecha ? new Date(c.Fecha).toISOString().split('T')[0] : '';
    const diaIdx = fechas.findIndex(f => f.toISOString().split('T')[0] === fecha);
    if (diaIdx < 0) return null;
    return {
      diaIdx,
      hora:     c.Hora ? String(c.Hora).substring(0,5) : '',
      nombre:   c.titulo || c.ID_Paciente || '—',
      servicio: c.ID_Servicio || '',
      estado:   (c.Estado || 'programada').toLowerCase().replace(/[- ]/g,''),
      color:    null,
      terapeuta: c.Terapeuta || '',
    };
  }).filter(Boolean);

  // Eventos de Google Calendar con su color real
  calEvents.forEach(ev => {
    const fecha  = ev.inicio ? new Date(ev.inicio).toISOString().split('T')[0] : '';
    const diaIdx = fechas.findIndex(f => f.toISOString().split('T')[0] === fecha);
    if (diaIdx < 0) return;
    const color = ev.color ? (CAL_COLORS[ev.color] || ev.color) : null;
    eventos.push({
      diaIdx,
      hora:      ev.inicio ? new Date(ev.inicio).toTimeString().substring(0,5) : '',
      nombre:    ev.titulo,
      servicio:  ev.terapeuta || '',
      estado:    'programada',
      color,
      terapeuta: ev.terapeuta || '',
    });
  });

  // Cabeceras
  let html = `<div class="agenda-col-header time-col">Hora</div>`;
  dias.forEach((dia, i) => {
    const isToday  = fechas[i].toDateString() === today.toDateString();
    const isSabado = i === 5;
    const style    = isToday
      ? 'color:var(--terracota);border-bottom-color:var(--terracota)'
      : isSabado ? '' : '';
    html += `<div class="agenda-col-header ${isSabado?'sabado':''}" style="${style}">
      ${dia}<br>
      <small style="font-weight:400;font-size:11px;">${fechas[i].toLocaleDateString('es-ES',{day:'numeric',month:'short'})}</small>
    </div>`;
  });

  // Filas de horas
  HORAS.forEach(h => {
    html += `<div class="agenda-hour">${h}</div>`;
    dias.forEach((_,di) => {
      const isSabado = di === 5;
      const evs = eventos.filter(e => e.diaIdx === di && e.hora === h);
      html += `<div class="agenda-cell ${isSabado?'sabado':''}" onclick="abrirModalSesion()">`;
      evs.forEach(ev => {
        if (ev.color) {
          // Color real del Calendar
          html += `<div class="agenda-event" style="background:${ev.color}22;border-left:3px solid ${ev.color};cursor:pointer" onclick="event.stopPropagation()">
            <div class="ev-name">${ev.nombre}</div>
            <div class="ev-detail" style="color:#555">${ev.servicio}</div>
          </div>`;
        } else {
          html += `<div class="agenda-event ${ev.estado}" onclick="event.stopPropagation()">
            <div class="ev-name">${ev.nombre}</div>
            <div class="ev-detail">${ev.servicio}</div>
          </div>`;
        }
      });
      html += `</div>`;
    });
  });

  grid.innerHTML = html;
}

// ══════════════════════════════════════════
//  TABS
// ══════════════════════════════════════════
function switchTab(el, tabId) {
  el.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tab-sesiones').style.display = 'none';
  document.getElementById('tab-raw').style.display      = 'none';
  document.getElementById(tabId).style.display          = 'block';
}

// ══════════════════════════════════════════
//  MODALES
// ══════════════════════════════════════════
function abrirModalSesion() {
  document.getElementById('s-fecha').value     = todayStr;
  document.getElementById('s-id-sesion').value = '';
  document.getElementById('modal-sesion-titulo').textContent = 'Registrar sesión';
  document.getElementById('modal-sesion').classList.add('open');
}

function editarSesion(idSesion) {
  const s = DATA.sesiones.find(x => x.id === idSesion);
  if (!s) { showToast('❌ Sesión no encontrada'); return; }

  document.getElementById('s-id-sesion').value            = idSesion;
  document.getElementById('modal-sesion-titulo').textContent = 'Editar sesión ' + idSesion;
  document.getElementById('s-fecha').value                 = s.fecha || '';
  document.getElementById('s-hora').value                  = s.hora  || '';
  document.getElementById('s-estado').value                = s.estado || 'Hecha';
  document.getElementById('s-cobrado').value               = s.cobrado === 'Sí' ? 'Sí' : 'No';
  document.getElementById('s-notas').value                 = s.notas || '';
  document.getElementById('s-fin').value                   = s.fin || 'SUELTA';
  toggleFinanciacion(s.fin || 'SUELTA');

  // Seleccionar paciente y terapeuta por nombre
  const selPac = document.getElementById('s-paciente');
  const selTer = document.getElementById('s-terapeuta');
  const selSrv = document.getElementById('s-servicio');
  [...selPac.options].forEach(o => { if (o.text.toLowerCase().includes((s.paciente||'').toLowerCase())) selPac.value = o.value; });
  [...selTer.options].forEach(o => { if (o.text.toLowerCase().includes((s.terapeuta||'').toLowerCase())) selTer.value = o.value; });
  [...selSrv.options].forEach(o => { if (o.text.toLowerCase().includes((s.servicio||'').toLowerCase())) selSrv.value = o.value; });

  document.getElementById('modal-sesion').classList.add('open');
}
function abrirModalCobro() {
  document.getElementById('c-fecha').value = todayStr;
  document.getElementById('modal-cobro').classList.add('open');
}
function abrirModalPaciente()  { document.getElementById('modal-paciente').classList.add('open'); }
function abrirModalTerapeuta() { document.getElementById('modal-terapeuta').classList.add('open'); }
function abrirModalServicio()  { document.getElementById('modal-servicio').classList.add('open'); }

function abrirModalBono() {
  document.getElementById('bn-fecha-compra').value          = todayStr;
  document.getElementById('bono-preview').style.display     = 'none';
  document.getElementById('bono-resumen').style.display     = 'none';
  document.getElementById('btn-guardar-bono').disabled      = true;
  document.getElementById('btn-guardar-bono').textContent   = 'Crear bono';
  document.getElementById('btn-guardar-bono').onclick       = guardarBono;
  document.getElementById('modal-bono-titulo').textContent  = 'Nuevo bono (pack de sesiones)';
  document.getElementById('modal-bono').classList.add('open');
}

function abrirModalBeca() {
  ['bc-bruto','bc-fee','bc-sesiones','bc-neto','bc-notas','bc-fecha-cobro'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  document.getElementById('bc-paciente').value     = '';
  document.getElementById('bc-anio').value         = String(new Date().getFullYear());
  document.getElementById('bc-estado-cobro').value = 'Pendiente_cobro';
  toggleFechaCobro();
  document.getElementById('beca-preview').style.display = 'none';
  document.getElementById('beca-resumen').style.display = 'none';
  document.getElementById('btn-guardar-beca').disabled  = true;
  document.getElementById('modal-beca').classList.add('open');
}

function cerrarModal(id) {
  document.getElementById(id).classList.remove('open');
  // Limpiar id de edición al cerrar modal-sesion
  if (id === 'modal-sesion') {
    const hiddenId = document.getElementById('s-id-sesion');
    if (hiddenId) hiddenId.value = '';
    const titulo = document.getElementById('modal-sesion-titulo');
    if (titulo) titulo.textContent = 'Registrar sesión';
  }
  if (id === 'modal-beca') {
    const btn = document.getElementById('btn-guardar-beca');
    if (btn) { btn.textContent = 'Crear beca'; btn.onclick = guardarBeca; btn.disabled = true; }
    const titulo = document.querySelector('#modal-beca .modal-title');
    if (titulo) titulo.textContent = 'Nueva beca Junta de Andalucía';
  }
  if (id === 'modal-paciente') {
    document.getElementById('p-id-paciente').value               = '';
    document.getElementById('modal-paciente-titulo').textContent = 'Nuevo paciente';
    document.getElementById('btn-guardar-paciente').textContent  = 'Crear paciente';
  }
  if (id === 'modal-cobro') {
    document.getElementById('c-id-cobro').value               = '';
    document.getElementById('modal-cobro-titulo').textContent = 'Registrar cobro';
    document.getElementById('btn-guardar-cobro').textContent  = 'Guardar cobro';
  }
}

document.querySelectorAll('.modal-overlay').forEach(mo => {
  mo.addEventListener('click', e => { if (e.target === mo) cerrarModal(mo.id); });
});

function toggleFinanciacion(val) {
  const wrap = document.getElementById('s-fin-id-wrap');
  const lbl  = document.getElementById('s-fin-label');
  if (val === 'SUELTA') { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  lbl.textContent    = val === 'BONO' ? 'Selecciona bono' : 'Selecciona beca';
  // Poblar opciones según tipo
  const select = document.getElementById('s-fin-id');
  if (val === 'BONO') {
    const activos = DATA.bonos.filter(b => b.estado === 'Activo');
    select.innerHTML = '<option value="">— Selecciona —</option>' +
      activos.map(b => `<option value="${b.id}">${b.id} – ${b.paciente} (Pend: ${b.pendientes})</option>`).join('');
  } else {
    const activas = DATA.becas.filter(b => b.estado === 'Activo');
    select.innerHTML = '<option value="">— Selecciona —</option>' +
      activas.map(b => `<option value="${b.id}">${b.id} – ${b.paciente} (${b.año})</option>`).join('');
  }
}

// ══════════════════════════════════════════
//  GUARDAR SESIÓN
// ══════════════════════════════════════════
async function guardarSesion() {
  const idSesion = document.getElementById('s-id-sesion').value;
  const pac      = document.getElementById('s-paciente').value;
  const esEdicion = !!idSesion;

  if (!pac && !esEdicion) { showToast('❌ Selecciona un paciente'); return; }

  const datos = {
    idSesion:     idSesion || undefined,
    fecha:        document.getElementById('s-fecha').value,
    hora:         document.getElementById('s-hora').value,
    idPaciente:   pac,
    idTerapeuta:  document.getElementById('s-terapeuta').value,
    idServicio:   document.getElementById('s-servicio').value,
    tipoFin:      document.getElementById('s-fin').value,
    idFin:        document.getElementById('s-fin-id').value || '',
    estado:       document.getElementById('s-estado').value,
    cobrado:      document.getElementById('s-cobrado').value,
    notas:        document.getElementById('s-notas').value,
  };

  showToast('⏳ Guardando sesión…');
  const accion = esEdicion ? 'actualizarSesion' : 'crearSesion';
  const res = await api(accion, { datos });
  if (res && res.ok) {
    cerrarModal('modal-sesion');
    showToast(esEdicion ? '✅ Sesión actualizada' : '✅ Sesión registrada — ' + res.idSesion);

    if (esEdicion) {
      // Actualizar la sesión directamente en DATA sin recargar todo
      const idx = DATA.sesiones.findIndex(x => x.id === idSesion);
      if (idx !== -1) {
        const cobradoNorm = (datos.cobrado === 'Sí' || (datos.cobrado||'').toUpperCase() === 'SI') ? 'Sí' : 'No';
        DATA.sesiones[idx] = {
          ...DATA.sesiones[idx],
          estado:  datos.estado  || DATA.sesiones[idx].estado,
          fecha:   datos.fecha   || DATA.sesiones[idx].fecha,
          hora:    datos.hora    || DATA.sesiones[idx].hora,
          notas:   datos.notas  !== undefined ? datos.notas : DATA.sesiones[idx].notas,
          cobrado: cobradoNorm,
        };
        aplicarFiltrosSesiones(); // re-renderiza con datos actualizados
      }
    } else {
      const hoy = new Date();
      await cargarSesiones(hoy.getMonth()+1, hoy.getFullYear());
    }

    if (datos.tipoFin === 'BONO') {
      const bonos = await api('getBonos');
      if (bonos) { DATA.bonos = bonos.map(mapBono); renderTablaBonos(); }
    }
  }
}

// ══════════════════════════════════════════
//  GUARDAR COBRO — FIX: usa ids correctos
// ══════════════════════════════════════════
async function guardarCobro() {
  const idCobro  = document.getElementById('c-id-cobro').value;
  const esEdicion = !!idCobro;
  const importe = document.getElementById('c-importe').value;
  if (!importe) { showToast('❌ El importe es obligatorio'); return; }

  const datos = {
    idCobro:       idCobro || undefined,
    fecha:         document.getElementById('c-fecha').value   || todayStr,
    idPaciente:    document.getElementById('c-paciente').value || '',
    idSesion:      document.getElementById('c-sesion').value   || '',
    importe:       parseFloat(importe),
    metodoPago:    document.getElementById('c-metodo').value,
    estado:        document.getElementById('c-estado').value,
    observaciones: document.getElementById('c-obs').value     || '',
  };

  showToast('⏳ Guardando cobro…');
  const accion = esEdicion ? 'actualizarCobro' : 'crearCobro';
  const res = await api(accion, { datos });
  if (res && res.ok) {
    cerrarModal('modal-cobro');
    showToast(esEdicion ? '✅ Cobro actualizado' : '✅ Cobro registrado — ' + res.idCobro);

    if (esEdicion) {
      const idx = DATA.cobros.findIndex(x => x.id === idCobro);
      if (idx !== -1) {
        DATA.cobros[idx] = {
          ...DATA.cobros[idx],
          fecha:      new Date(datos.fecha).toLocaleDateString('es-ES'),
          fechaRaw:   datos.fecha,
          importeNum: datos.importe,
          importe:    fmtDet(datos.importe),
          metodo:     datos.metodoPago,
          estado:     datos.estado,
          obs:        datos.observaciones,
        };
        cargarCobros_local();
      }
    } else {
      const hoy = new Date();
      await cargarCobros(hoy.getMonth()+1, hoy.getFullYear());
    }
  }
}

function cargarCobros_local() {
  const tbCob = document.getElementById('tbody-cobros');
  if (tbCob) tbCob.innerHTML = DATA.cobros.map(c => `<tr>
    <td class="strong">${c.id||''}</td>
    <td>${c.fecha||''}</td>
    <td class="strong">${c.paciente||''}</td>
    <td class="muted">${c.sesion||''}</td>
    <td class="strong">${c.importe||''}</td>
    <td>${c.metodo||''}</td>
    <td><span class="badge ${c.estado==='Confirmado'?'activo':'cancelada'}">${c.estado||''}</span></td>
    <td class="muted">${c.obs||''}</td>
    <td><button class="btn btn-secondary btn-sm btn-icon" title="Editar cobro" onclick="editarCobro('${c.id}')">✏️</button></td>
  </tr>`).join('');
  actualizarKPIsCobros();
}

// ══════════════════════════════════════════
//  GUARDAR PACIENTE
// ══════════════════════════════════════════
async function guardarPaciente() {
  const idPaciente = document.getElementById('p-id-paciente').value;
  const esEdicion  = !!idPaciente;
  const nombre = document.getElementById('p-nombre').value;
  if (!nombre && !esEdicion) { showToast('❌ El nombre es obligatorio'); return; }

  const datos = {
    idPaciente:         idPaciente || undefined,
    nombre,
    apellidos:          document.getElementById('p-apellidos').value,
    tutor1:             document.getElementById('p-tutor1').value,
    telefono:           document.getElementById('p-tel').value,
    tutor2:             document.getElementById('p-tutor2').value,
    telefono2:          document.getElementById('p-tel2').value,
    email:              document.getElementById('p-email').value,
    terapeutaPrincipal: document.getElementById('p-terapeuta').value,
    esBeca:             document.getElementById('p-beca').value,
    consentimiento:     document.getElementById('p-consent').value,
    notas:              document.getElementById('p-notas').value,
  };

  showToast('⏳ Guardando…');
  const accion = esEdicion ? 'actualizarPaciente' : 'crearPaciente';
  const res = await api(accion, { datos });
  if (res && res.ok) {
    cerrarModal('modal-paciente');
    showToast(esEdicion ? '✅ Paciente actualizado' : '✅ Paciente creado — ' + res.idPaciente);

    if (esEdicion) {
      // Actualizar directamente en DATA
      const idx = DATA.pacientes.findIndex(x => x.id === idPaciente);
      if (idx !== -1) {
        DATA.pacientes[idx] = {
          ...DATA.pacientes[idx],
          nombre:    (datos.nombre + ' ' + datos.apellidos).trim(),
          apellidos: datos.apellidos,
          tutor:     datos.tutor1,
          tutor2:    datos.tutor2,
          tel:       datos.telefono,
          tel2:      datos.telefono2,
          email:     datos.email,
          terapeuta: datos.terapeutaPrincipal,
          beca:      datos.esBeca,
          consent:   datos.consentimiento,
          notas:     datos.notas,
        };
        initTablas();
      }
    } else {
      const pacientes = await api('getPacientes');
      if (pacientes) {
        DATA.pacientes = pacientes.map(p => ({
          id:        p.ID_Paciente,
          nombre:    ((p.Nombre||'') + ' ' + (p.Apellidos||'')).trim(),
          apellidos: p.Apellidos || '',
          tutor:     p.Tutor1 || '',
          tutor2:    p.Tutor2 || '',
          tel:       p.Teléfono || '',
          tel2:      p.Teléfono2 || '',
          email:     p.Email || '',
          alta:      p.FechaAlta ? new Date(p.FechaAlta).toLocaleDateString('es-ES') : '',
          terapeuta: p.TerapeutaPrincipal || '',
          beca:      p.EsBeca || 'No',
          consent:   p.Consentimiento || 'Pendiente',
          notas:     p.Notas || '',
        }));
        poblarSelects();
        initTablas();
      }
    }
  }
}

// ══════════════════════════════════════════
//  BONOS — calcular y guardar
// ══════════════════════════════════════════
function calcularBono() {
  const anticipo = parseFloat(document.getElementById('bn-anticipo').value) || 0;
  const sesiones = parseInt(document.getElementById('bn-sesiones').value)   || 0;
  const fechaComp= document.getElementById('bn-fecha-compra').value;
  if (anticipo > 0 && sesiones > 0) {
    const valor = anticipo / sesiones;
    document.getElementById('bono-preview').style.display = '';
    document.getElementById('bono-valor-sesion').textContent = fmtDet(valor);
    if (fechaComp) {
      const cad = new Date(fechaComp);
      cad.setFullYear(cad.getFullYear() + 1);
      document.getElementById('bono-fecha-cad-calc').textContent =
        cad.toLocaleDateString('es-ES', {day:'2-digit',month:'long',year:'numeric'});
    }
    document.getElementById('bono-resumen').style.display = '';
    document.getElementById('res-sesiones').textContent = sesiones;
    document.getElementById('res-valor').textContent    = fmtDet(valor);
    document.getElementById('res-total').textContent    = fmtDet(anticipo);
    validarBono();
  } else {
    document.getElementById('bono-preview').style.display = 'none';
    document.getElementById('bono-resumen').style.display = 'none';
    document.getElementById('btn-guardar-bono').disabled  = true;
  }
}

function validarBono() {
  const ok = document.getElementById('bn-paciente').value
    && (parseFloat(document.getElementById('bn-anticipo').value) || 0) > 0
    && (parseInt(document.getElementById('bn-sesiones').value)   || 0) > 0
    && document.getElementById('bn-fecha-compra').value;
  document.getElementById('btn-guardar-bono').disabled = !ok;
}

function mapBono(b) {
  return {
    id:         b.ID_Bono,
    paciente:   b.NombrePaciente || b.ID_Paciente,
    tipo:       b.TipoBono || '',
    anticipo:   b.ImporteAnticipoBono != null ? fmtDet(b.ImporteAnticipoBono) : '',
    valor:      b.ValorSesion != null ? fmtDet(b.ValorSesion).replace(' €', ' €/ses') : '',
    compra:     b.FechaCompra    ? new Date(b.FechaCompra).toLocaleDateString('es-ES')    : '',
    cad:        b.FechaCaducidad ? new Date(b.FechaCaducidad).toLocaleDateString('es-ES') : '—',
    total:      Number(b.SesionesTotales)  || 0,
    consumidas: Number(b.Bonos_Consumidos) || 0,
    pendientes: b.Bonos_Pendientes !== undefined && b.Bonos_Pendientes !== ''
                  ? Number(b.Bonos_Pendientes)
                  : Math.max((Number(b.SesionesTotales)||0)-(Number(b.Bonos_Consumidos)||0), 0),
    estado:     b.Estado || 'Activo',
  };
}

async function guardarBono() {
  const btn = document.getElementById('btn-guardar-bono');
  btn.disabled = true; btn.textContent = 'Guardando…';
  const datos = {
    idPaciente:      document.getElementById('bn-paciente').value,
    tipoBono:        document.getElementById('bn-tipo').value,
    sesionesTotales: document.getElementById('bn-sesiones').value,
    importeAnticipo: document.getElementById('bn-anticipo').value,
    fechaCompra:     document.getElementById('bn-fecha-compra').value,
    fechaCaducidad:  document.getElementById('bn-fecha-cad').value || null,
    notas:           document.getElementById('bn-notas').value,
  };
  showToast('⏳ Creando bono…');
  const res = await api('crearBono', { datos });
  btn.textContent = 'Crear bono';
  if (res && res.ok) {
    cerrarModal('modal-bono');
    showToast(`✅ Bono creado — ${res.idBono} · ${res.valorSesion} €/sesión`);
    const bonos = await api('getBonos');
    if (bonos) { DATA.bonos = bonos.map(mapBono); renderTablaBonos(); }
  } else {
    showToast('❌ ' + (res?.error || 'Error al crear el bono'));
    btn.disabled = false;
  }
}

// ── Editar bono ───────────────────────────────────────────────
function editarBono(idBono) {
  const b = DATA.bonos.find(x => x.id === idBono);
  if (!b) return;
  document.getElementById('bn-tipo').value           = b.tipo;
  document.getElementById('bn-sesiones').value       = b.total;
  document.getElementById('bn-anticipo').value       = parseFloat(b.anticipo) || '';
  document.getElementById('bn-notas').value          = '';
  document.getElementById('bn-paciente').value       = '';
  document.getElementById('modal-bono-titulo').textContent = `Editar bono ${idBono}`;
  const btn = document.getElementById('btn-guardar-bono');
  btn.textContent = 'Guardar cambios'; btn.disabled = false;
  btn.onclick = () => guardarEdicionBono(idBono);
  document.getElementById('bono-resumen').style.display = '';
  document.getElementById('res-sesiones').textContent   = b.total;
  document.getElementById('res-valor').textContent      = parseFloat(b.valor)   || '—';
  document.getElementById('res-total').textContent      = parseFloat(b.anticipo)|| '—';
  document.getElementById('modal-bono').classList.add('open');
}

async function guardarEdicionBono(idBono) {
  const btn = document.getElementById('btn-guardar-bono');
  btn.disabled = true; btn.textContent = 'Guardando…';
  const datos = {
    idBono,
    tipoBono:        document.getElementById('bn-tipo').value,
    sesionesTotales: document.getElementById('bn-sesiones').value,
    importeAnticipo: document.getElementById('bn-anticipo').value,
    notas:           document.getElementById('bn-notas').value,
  };
  showToast('⏳ Actualizando bono…');
  const res = await api('actualizarBono', { datos });
  btn.textContent = 'Guardar cambios';
  if (res && res.ok) {
    cerrarModal('modal-bono');
    showToast(`✅ Bono ${idBono} actualizado`);
    const bonos = await api('getBonos');
    if (bonos) { DATA.bonos = bonos.map(mapBono); renderTablaBonos(); }
  } else {
    showToast('❌ ' + (res?.error || 'Error'));
    btn.disabled = false;
  }
}

// ══════════════════════════════════════════
//  BECAS — calcular y guardar
// ══════════════════════════════════════════
function calcularBeca() {
  const bruto    = parseFloat(document.getElementById('bc-bruto').value)   || 0;
  const fee      = parseFloat(document.getElementById('bc-fee').value)     || 0;
  const sesiones = parseInt(document.getElementById('bc-sesiones').value)  || 0;
  if (bruto > 0 && sesiones > 0) {
    const neto    = bruto - fee;
    const valor   = neto / sesiones;
    const mensual = neto / 12;
    document.getElementById('bc-neto').value = neto.toFixed(2);
    document.getElementById('beca-preview').style.display = '';
    document.getElementById('beca-valor-sesion').textContent  = fmtDet(valor);
    document.getElementById('beca-plan-mensual').textContent  = fmtDet(mensual).replace(' €', ' € / mes');
    document.getElementById('beca-resumen').style.display = '';
    document.getElementById('bres-bruto').textContent   = fmtDet(bruto);
    document.getElementById('bres-neto').textContent    = fmtDet(neto);
    document.getElementById('bres-valor').textContent   = fmtDet(valor);
    document.getElementById('bres-mensual').textContent = fmtDet(mensual);
    validarBeca();
  } else {
    document.getElementById('bc-neto').value = '';
    document.getElementById('beca-preview').style.display = 'none';
    document.getElementById('beca-resumen').style.display = 'none';
    document.getElementById('btn-guardar-beca').disabled  = true;
  }
}

function validarBeca() {
  const ok = document.getElementById('bc-paciente').value
    && document.getElementById('bc-anio').value
    && (parseFloat(document.getElementById('bc-bruto').value)  || 0) > 0
    && (parseInt(document.getElementById('bc-sesiones').value) || 0) > 0;
  document.getElementById('btn-guardar-beca').disabled = !ok;
}

function toggleFechaCobro() {
  const estado = document.getElementById('bc-estado-cobro').value;
  const wrap   = document.getElementById('bc-fecha-cobro-wrap');
  if (estado === 'Cobrado') {
    wrap.style.display = '';
    const fd = document.getElementById('bc-fecha-cobro');
    if (fd && !fd.value) fd.value = todayStr;
  } else {
    wrap.style.display = 'none';
  }
}

function editarBeca(idBeca) {
  const b = DATA.becas.find(x => x.id === idBeca);
  if (!b) { showToast('❌ Beca no encontrada'); return; }

  document.getElementById('modal-beca').querySelector('.modal-title').textContent = 'Editar beca ' + idBeca;
  document.getElementById('btn-guardar-beca').textContent = 'Guardar cambios';
  document.getElementById('btn-guardar-beca').disabled    = false;
  document.getElementById('btn-guardar-beca').onclick     = () => guardarBecaEdicion(idBeca);

  // Seleccionar paciente
  const selPac = document.getElementById('bc-paciente');
  [...selPac.options].forEach(o => {
    if (o.text.toLowerCase().includes((b.paciente||'').toLowerCase())) selPac.value = o.value;
  });

  // Año
  document.getElementById('bc-anio').value = b.año || new Date().getFullYear();

  // Cobrado — normalizar SI→Cobrado
  const cobVal = (b.cobrado||'').toString().toUpperCase().trim();
  document.getElementById('bc-estado-cobro').value = (cobVal === 'SI' || cobVal === 'SÍ') ? 'Cobrado' : 'Pendiente_cobro';
  toggleFechaCobro();
  if (b.cobro && b.cobro !== '—') document.getElementById('bc-fecha-cobro').value = b.cobro;

  document.getElementById('bc-bruto').value    = b.brutoNum    || '';
  document.getElementById('bc-fee').value      = b.feeNum      || '';
  document.getElementById('bc-sesiones').value = b.sesiones    || '';
  document.getElementById('bc-neto').value     = b.netoNum     || '';
  document.getElementById('bc-notas').value    = b.notas       || '';

  document.getElementById('beca-preview').style.display = 'none';
  document.getElementById('beca-resumen').style.display = 'none';
  document.getElementById('modal-beca').classList.add('open');
}

async function guardarBecaEdicion(idBeca) {
  const estadoCobro = document.getElementById('bc-estado-cobro').value;
  const datos = {
    idBeca,
    cobrado:    estadoCobro === 'Cobrado' ? 'SI' : 'NO',
    fechaCobro: estadoCobro === 'Cobrado' ? document.getElementById('bc-fecha-cobro').value : '',
    notas:      document.getElementById('bc-notas').value,
  };
  showToast('⏳ Guardando…');
  const res = await api('actualizarBecaDesdeApp', { datos });
  if (res && res.ok) {
    cerrarModal('modal-beca');
    showToast('✅ Beca actualizada');
    const becas = await api('getBecas');
    if (becas) { DATA.becas = becas.map(mapBeca); renderTablaBecas(); }
  } else {
    showToast('❌ Error al guardar');
  }
}

async function guardarBeca() {
  const btn = document.getElementById('btn-guardar-beca');
  btn.disabled = true; btn.textContent = 'Guardando…';
  const estadoCobro = document.getElementById('bc-estado-cobro').value;
  const datos = {
    idPaciente:   document.getElementById('bc-paciente').value,
    anio:         document.getElementById('bc-anio').value,
    importeBruto: document.getElementById('bc-bruto').value,
    feeGestion:   document.getElementById('bc-fee').value || '0',
    sesionesAnio: document.getElementById('bc-sesiones').value,
    estadoCobro,
    fechaCobro:   estadoCobro === 'Cobrado' ? document.getElementById('bc-fecha-cobro').value : null,
    notas:        document.getElementById('bc-notas').value,
  };
  showToast('⏳ Creando beca…');
  const res = await api('crearBeca', { datos });
  btn.textContent = 'Crear beca';
  if (res && res.ok) {
    cerrarModal('modal-beca');
    showToast(`✅ Beca creada — ${res.idBeca} · ${res.valorSesion} €/sesión`);
    const becas = await api('getBecas');
    if (becas) {
      DATA.becas = becas.map(mapBeca);
      renderTablaBecas();
    }
  } else {
    showToast('❌ ' + (res?.error || 'Error al crear la beca'));
    btn.disabled = false;
  }
}

// ══════════════════════════════════════════
//  SERVICIOS
// ══════════════════════════════════════════
async function guardarServicio() {
  const nombre = document.getElementById('sv-nombre').value;
  const precio = document.getElementById('sv-precio').value;
  if (!nombre) { showToast('❌ El nombre del servicio es obligatorio'); return; }
  if (!precio) { showToast('❌ El precio es obligatorio'); return; }
  const datos = {
    tipo:       document.getElementById('sv-tipo').value,
    servicio:   nombre,
    duracion:   document.getElementById('sv-duracion').value,
    precio:     parseFloat(precio),
    tipoConsumo:document.getElementById('sv-consumo').value,
    exentoIVA:  document.getElementById('sv-iva').value,
    notas:      document.getElementById('sv-notas').value,
  };
  showToast('⏳ Creando servicio…');
  const res = await api('crearServicio', { datos });
  if (res && res.ok) {
    cerrarModal('modal-servicio');
    showToast(`✅ Servicio creado — ${res.idServicio}`);
    ['sv-nombre','sv-duracion','sv-precio','sv-notas'].forEach(id => { document.getElementById(id).value=''; });
    const servicios = await api('getServicios');
    if (servicios) {
      DATA.servicios = servicios.map(s => ({
        id:s.ID_Servicio, tipo:s.Tipo||'', servicio:s.Servicio||'',
        consumo:s.Tipo_Consumo_Default||'', duracion:s.DuraciónMin?s.DuraciónMin+' min':'',
        precio:s.Precio!=null?fmtDet(s.Precio):'',
        iva:s.ExentoIVA||'Sí', activo:s.Activo||'Sí',
      }));
      poblarSelects();
      renderTabla('tbody-servicios', DATA.servicios, [
        {key:'id',muted:true},{key:'tipo'},{key:'servicio',strong:true},
        {key:'consumo'},{key:'duracion'},{key:'precio',strong:true},{key:'iva'},{key:'activo'}
      ]);
    }
  } else { showToast('❌ ' + (res?.error || 'Error al crear el servicio')); }
}

// ══════════════════════════════════════════
//  TERAPEUTAS
// ══════════════════════════════════════════
async function guardarTerapeuta() {
  const nombre = document.getElementById('tr-nombre').value;
  if (!nombre) { showToast('❌ El nombre es obligatorio'); return; }
  const datos = {
    nombre,
    apellidos:    document.getElementById('tr-apellidos').value,
    especialidad: document.getElementById('tr-especialidad').value,
    comision:     document.getElementById('tr-comision').value || '0',
    telefono:     document.getElementById('tr-tel').value,
    email:        document.getElementById('tr-email').value,
    activa:       document.getElementById('tr-activa').value,
    notas:        document.getElementById('tr-notas').value,
  };
  showToast('⏳ Creando terapeuta…');
  const res = await api('crearTerapeuta', { datos });
  if (res && res.ok) {
    cerrarModal('modal-terapeuta');
    showToast(`✅ Terapeuta creada — ${res.idTerapeuta}`);
    ['tr-nombre','tr-apellidos','tr-especialidad','tr-comision','tr-tel','tr-email','tr-notas'].forEach(id => { document.getElementById(id).value=''; });
    const terapeutas = await api('getTerapeutas');
    if (terapeutas) {
      DATA.terapeutas = terapeutas.map(t => ({
        id: t.ID_Terapeuta, nombre: t.Nombre, esp: t.Especialidad||'',
        comisionPct: parseFloat(t['Pct_Com'] ?? t['Pct_com'] ?? 0),
        comision: 0, sesiones: 0, produccion: 0,
        activa: t.Activa==='Sí'||t.Activa===true,
      }));
      poblarSelects();
      renderTabla('tbody-terapeutas', DATA.terapeutas.map(t=>({
        ...t, activa: t.activa ? '✅ Sí' : '❌ No',
        produccion: fmtKpi(t.produccion),
        comision:   fmtPct(t.comisionPct),
      })), [
        {key:'id',muted:true},{key:'nombre',strong:true},{key:'esp'},
        {key:'comision'},{key:'sesiones'},{key:'produccion',strong:true},{key:'activa'}
      ]);
    }
  } else { showToast('❌ ' + (res?.error || 'Error al crear la terapeuta')); }
}

// ══════════════════════════════════════════
//  LOADING / TOAST / EXPORT
// ══════════════════════════════════════════
function mostrarCargando(show) {
  let el = document.getElementById('loading-overlay');
  if (!el && show) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(250,247,242,.9);display:flex;align-items:center;justify-content:center;z-index:9999;font-family:"DM Sans",sans-serif;';
    el.innerHTML = '<div style="text-align:center"><div style="font-size:36px;margin-bottom:12px;animation:spin 1.5s linear infinite">⏳</div><div style="color:#4A403A;font-size:14px;font-weight:500">Cargando datos de IPSE…</div></div>';
    document.body.appendChild(el);
  }
  if (el) el.style.display = show ? 'flex' : 'none';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

function exportarInforme() {
  const rows = [
    ['ID','Fecha','Hora','Paciente','Terapeuta','Servicio','Financiación','Estado','Importe','Cobrado'],
    ...DATA.sesiones.map(s => [s.id,s.fecha,s.hora,s.paciente,s.terapeuta,s.servicio,s.fin,s.estado,s.importe,s.cobrado])
  ];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a   = document.createElement('a');
  a.href    = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download= 'sesiones_ipse_' + todayStr + '.csv';
  a.click();
  showToast('⬇ CSV exportado');
}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
renderChart();
renderSesionesHoy();
renderRanking();
initTablas();
cargarDatos();

// ══════════════════════════════════════════════════════════════
//  SEARCHABLE SELECT — reemplaza <select> con búsqueda inline
//  Uso: makeSearchable('id-del-select', 'Texto placeholder')
// ══════════════════════════════════════════════════════════════
function makeSearchable(selectId, placeholder) {
  const sel = document.getElementById(selectId);
  if (!sel || sel.dataset.searchable) return;
  sel.dataset.searchable = '1';
  sel.style.display = 'none';

  const wrap = document.createElement('div');
  wrap.className = 'ss-wrap';
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ss-input';
  input.placeholder = placeholder || 'Buscar…';
  wrap.insertBefore(input, sel);

  const list = document.createElement('div');
  list.className = 'ss-list';
  wrap.appendChild(list);

  function buildList(filter) {
    list.innerHTML = '';
    const opts = [...sel.options].filter(o => o.value !== '');
    const term = (filter || '').toLowerCase();
    let shown = 0;
    opts.forEach(o => {
      if (term && !o.text.toLowerCase().includes(term)) return;
      const div = document.createElement('div');
      div.className = 'ss-option' + (o.value === sel.value ? ' selected' : '');
      div.textContent = o.text;
      div.dataset.value = o.value;
      div.addEventListener('mousedown', e => {
        e.preventDefault();
        sel.value = o.value;
        sel.dispatchEvent(new Event('change', {bubbles:true}));
        input.value = o.text;
        list.classList.remove('open');
      });
      list.appendChild(div);
      shown++;
    });
    if (shown === 0) {
      const empty = document.createElement('div');
      empty.className = 'ss-empty';
      empty.textContent = 'Sin resultados';
      list.appendChild(empty);
    }
  }

  input.addEventListener('focus', () => { buildList(input.value); list.classList.add('open'); });
  input.addEventListener('blur',  () => setTimeout(() => list.classList.remove('open'), 150));
  input.addEventListener('input', () => buildList(input.value));

  // Sincronizar cuando se setea sel.value externamente
  const origDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(sel, 'value', {
    get: () => origDesc.get.call(sel),
    set: v => {
      origDesc.set.call(sel, v);
      const found = [...sel.options].find(o => o.value === v);
      input.value = found ? found.text : '';
    }
  });

  // Valor inicial
  const initOpt = [...sel.options].find(o => o.value === sel.value);
  if (initOpt && initOpt.value) input.value = initOpt.text;
}

function makeAllSearchable() {
  // Todos los selects grandes de paciente/beca/bono en modales
  [
    ['s-paciente',           'Buscar paciente…'],
    ['s-terapeuta',          'Buscar terapeuta…'],
    ['s-fin-id',             'Buscar bono/beca…'],
    ['c-paciente',           'Buscar paciente…'],
    ['bn-paciente',          'Buscar paciente…'],
    ['bc-paciente',          'Buscar paciente…'],
    ['p-terapeuta',          'Buscar terapeuta…'],
    ['filtro-terapeuta-prod','Todos los terapeutas'],
    ['filtro-servicio-prod', 'Todos los servicios'],
  ].forEach(([id, ph]) => makeSearchable(id, ph));
}