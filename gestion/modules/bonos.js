/* ═══════════════════════════════════════════
   BONOS / BECAS
═══════════════════════════════════════════ */
const BB = {
  tipo: 'BECA',          // pestaña activa
  todos: [],             // todos los registros cargados
  filtrados: [],         // tras aplicar filtros
  citas: {},             // citas por id_bono_beca
  pagina: 1,
  porPagina: 10,
  seleccionado: null,    // id del registro abierto en panel
  modalModo: 'nuevo'
};

/* ── Helpers ── */
function bbFecha(d) {
  if (!d) return '—';
  const [y, m, dia] = d.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(dia)} ${meses[parseInt(m)-1]} ${y}`;
}
function bbFechaCorta(d) {
  if (!d) return '—';
  const [y, m, dia] = d.split('-');
  return `${parseInt(dia)}/${m}/${y.slice(2)}`;
}
function bbEur(n) {
  return Number(n).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €';
}
function bbEstado(r) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const venc = new Date(r.fecha_vencimiento);
  const restantes = r.sesiones_total - r.sesiones_consumidas;
  if (restantes <= 0) return 'agotado';
  if (venc < hoy) return 'caducado';
  const diff = (venc - hoy) / 86400000;
  if (diff <= 30) return 'proximo';
  return 'vigente';
}
function bbEstadoLabel(e) {
  const m = {vigente:'Vigente',proximo:'Próximo a vencer',caducado:'Caducado',agotado:'Agotado'};
  return m[e] || e;
}
function bbNombrePaciente(id) {
  const p = (G.pacientes||[]).find(x => x.id === id);
  if (!p) return id;
  return `${p.nombre || ''} ${p.apellidos || ''}`.trim();
}

function bbPoblarAnios() {
  const sel = document.getElementById('bb-f-anio');
  if (!sel) return;
  const anioActual = new Date().getFullYear();
  const opciones = [['', '— Sin especificar —']];
  for (let y = 2024; y <= anioActual + 1; y++) opciones.push([`${y}/${y+1}`, `${y}/${y+1}`]);
  sel.innerHTML = opciones.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
}

/* ── Init ── */
async function bbInit() {
  document.getElementById('bb-subtitulo').textContent = 'Cargando...';
  // Mostrar/ocultar columna importe según rol
  const esAdmin = G.profesional?.es_admin === 'Si';
  document.getElementById('bb-th-importe').style.display = esAdmin ? '' : 'none';

  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/bonos_becas?select=*&order=fecha_inicio.desc&limit=2000`,
      { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${G.sesion.access_token}` } }
    );
    BB.todos = await res.json();

    // Poblar select años escolares (becas)
    const anios = [...new Set(BB.todos.filter(r => r.anio_escolar).map(r => r.anio_escolar))].sort().reverse();
    const selAnio = document.getElementById('bb-fil-anio');
    selAnio.innerHTML = '<option value="">Todos los años</option>' +
      anios.map(a => `<option value="${a}">${a}</option>`).join('');

    // Cargar citas asociadas
    const ids = BB.todos.map(r => r.id);
    if (ids.length > 0) {
      const resCitas = await fetch(
        `${SUPA_URL}/rest/v1/citas_v2?id_bono_beca=in.(${ids.join(',')})&select=id,id_bono_beca,id_paciente,fecha,estado,precio&limit=2000`,
        { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${G.sesion.access_token}` } }
      );
      const citas = await resCitas.json();
      BB.citas = {};
      citas.forEach(c => {
        if (!BB.citas[c.id_bono_beca]) BB.citas[c.id_bono_beca] = [];
        BB.citas[c.id_bono_beca].push(c);
      });
    }

    bbAplicarFiltros();
  } catch(e) {
    document.getElementById('bb-subtitulo').textContent = 'Error al cargar';
    console.error(e);
  }
}

/* ── Cambiar pestaña ── */
function bbCambiarTipo(tipo) {
  BB.tipo = tipo;
  BB.pagina = 1;
  BB.seleccionado = null;
  document.getElementById('bb-panel-overlay').classList.remove('open');
  document.getElementById('bb-tab-beca').classList.toggle('active', tipo === 'BECA');
  document.getElementById('bb-tab-bono').classList.toggle('active', tipo === 'BONO');
  // Mostrar/ocultar filtro año (relevante sobre todo en becas)
  document.getElementById('bb-fil-anio').style.display = tipo === 'BECA' ? '' : 'none';
  bbAplicarFiltros();
}

/* ── Filtrar ── */
function bbAplicarFiltros() {
  const estado = document.getElementById('bb-fil-estado').value;
  const anio   = document.getElementById('bb-fil-anio').value;
  const esp    = document.getElementById('bb-fil-esp').value;
  const antic  = document.getElementById('bb-fil-anticipo').value;
  const q      = (document.getElementById('bb-fil-buscar')?.value||'').trim().toLowerCase();

  BB.filtrados = BB.todos.filter(r => {
    if (r.tipo !== BB.tipo) return false;
    if (estado && bbEstado(r) !== estado) return false;
    if (anio   && r.anio_escolar !== anio) return false;
    if (esp    && r.especialidad !== esp) return false;
    if (antic  && r.anticipo_recibido !== antic) return false;
    if (q) {
      const pac = (G.pacientes||[]).find(p => p.id === r.id_paciente);
      const texto = `${pac?.nombre||''} ${pac?.apellidos||''} ${r.id_paciente}`.toLowerCase();
      if (!texto.includes(q)) return false;
    }
    return true;
  });

  BB.pagina = 1;
  bbActualizarKPIs();
  bbRenderTabla();
}

/* ── KPIs ── */
function bbActualizarKPIs() {
  const esAdmin = G.profesional?.es_admin === 'Si';
  const lista = BB.filtrados;
  const vigentes = lista.filter(r => bbEstado(r) === 'vigente' || bbEstado(r) === 'proximo').length;
  const sesRest  = lista.reduce((s,r) => s + Math.max(0, r.sesiones_total - r.sesiones_consumidas), 0);
  const sinAntic = lista.filter(r => r.anticipo_recibido === 'No').length;
  const totalImporte = lista.reduce((s,r) => s + (Number(r.importe_total)||0), 0);

  const label = BB.tipo === 'BECA' ? 'becas' : 'bonos';
  let html = `
    <div class="bb-kpi"><div class="bb-kpi-val">${lista.length}</div><div class="bb-kpi-lbl">Total ${label}</div></div>
    <div class="bb-kpi"><div class="bb-kpi-val">${vigentes}</div><div class="bb-kpi-lbl">Vigentes</div></div>
    <div class="bb-kpi"><div class="bb-kpi-val">${sesRest}</div><div class="bb-kpi-lbl">Sesiones pendientes</div></div>
    <div class="bb-kpi"><div class="bb-kpi-val">${sinAntic}</div><div class="bb-kpi-lbl">Sin anticipo</div></div>`;
  if (esAdmin) {
    html = `
    <div class="bb-kpi"><div class="bb-kpi-val">${lista.length}</div><div class="bb-kpi-lbl">Total ${label}</div></div>
    <div class="bb-kpi"><div class="bb-kpi-val">${vigentes}</div><div class="bb-kpi-lbl">Vigentes</div></div>
    <div class="bb-kpi"><div class="bb-kpi-val">${sesRest}</div><div class="bb-kpi-lbl">Sesiones pendientes</div></div>
    <div class="bb-kpi"><div class="bb-kpi-val" style="font-size:16px">${bbEur(totalImporte)}</div><div class="bb-kpi-lbl">Importe total</div></div>`;
  }
  document.getElementById('bb-kpis').innerHTML = html;
  document.getElementById('bb-subtitulo').textContent =
    `${lista.length} ${label} · ${sesRest} sesiones pendientes`;
}

/* ── Render tabla ── */
function bbRenderTabla() {
  const esAdmin = G.profesional?.es_admin === 'Si';
  const tbody = document.getElementById('bb-tbody');
  const total = BB.filtrados.length;
  const inicio = (BB.pagina - 1) * BB.porPagina;
  const pagina = BB.filtrados.slice(inicio, inicio + BB.porPagina);

  if (total === 0) {
    const label = BB.tipo === 'BECA' ? 'becas' : 'bonos';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--ink-muted)">
      No hay ${label} con los filtros actuales</td></tr>`;
    document.getElementById('bb-contador').textContent = '';
    document.getElementById('bb-paginacion').innerHTML = '';
    return;
  }

  tbody.innerHTML = pagina.map(r => {
    const estado = bbEstado(r);
    const restantes = r.sesiones_total - r.sesiones_consumidas;
    const pct = r.sesiones_total > 0 ? Math.round((r.sesiones_consumidas / r.sesiones_total) * 100) : 0;
    const barClass = restantes <= 0 ? 'done' : pct >= 70 ? 'warn' : 'ok';
    const restoClass = restantes <= 0 ? 'done' : restantes <= 4 ? 'warn' : 'ok';
    const espLow = (r.especialidad||'psi').toLowerCase();
    const nombrePac = bbNombrePaciente(r.id_paciente);
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const venc = new Date(r.fecha_vencimiento);
    const diffDias = Math.ceil((venc - hoy) / 86400000);
    const vencStr = estado === 'caducado'
      ? `<span style="color:var(--rojo)">${bbFechaCorta(r.fecha_vencimiento)}</span>`
      : diffDias <= 30
        ? `<span style="color:#92400E">${bbFechaCorta(r.fecha_vencimiento)}</span>`
        : bbFechaCorta(r.fecha_vencimiento);

    let importeTd = '';
    if (esAdmin) {
      const producido = (r.sesiones_consumidas || 0) * 45;
      const pendiente = (restantes > 0 ? restantes : 0) * 45;
      importeTd = `<td style="display:''">
        <span class="mono" style="font-size:12px;font-family:'DM Mono',monospace">${bbEur(r.importe_total)}</span>
        ${pendiente > 0 ? `<br><span style="font-size:11px;color:var(--ink-muted)">Pdte. producir: ${bbEur(pendiente)}</span>` : ''}
      </td>`;
    }

    return `<tr class="bb-row${BB.seleccionado===r.id?' selected':''}" onclick="bbSeleccionar('${r.id}')">
      <td>
        <div style="font-weight:600;font-size:13px">${nombrePac}</div>
        <div style="font-size:11px;color:var(--ink-muted);font-family:'DM Mono',monospace">${r.id_paciente}</div>
      </td>
      <td><span class="bb-badge ${espLow}">${r.especialidad||'—'}</span></td>
      <td>
        <div class="bb-progreso">
          <div class="bb-bar-wrap"><div class="bb-bar-fill ${barClass}" style="width:${pct}%"></div></div>
          <span class="bb-ses-resto ${restoClass}">${restantes}</span>
        </div>
        <div style="font-size:11px;color:var(--ink-muted);margin-top:2px">${r.sesiones_consumidas}/${r.sesiones_total} consumidas</div>
      </td>
      <td style="font-size:12px">${vencStr}</td>
      <td style="font-size:12px">${(() => {
        if (r.tipo === 'BONO') {
          if (r.forma_cobro_bono) return `<span style="color:var(--verde-dark)">✓ ${r.forma_cobro_bono}</span>`;
          return `<span style="color:var(--rojo);font-weight:600">⚠ Pendiente</span>`;
        } else {
          return r.anticipo_recibido === 'Si'
            ? '<span style="color:var(--verde-dark)">✓ Anticipado</span>'
            : '<span style="color:var(--ink-muted)">No anticipado</span>';
        }
      })()}</td>
      ${importeTd}
      <td><span class="bb-badge ${estado}">${bbEstadoLabel(estado)}</span></td>
    </tr>`;
  }).join('');

  // Contador y paginación
  const totalPags = Math.ceil(total / BB.porPagina);
  document.getElementById('bb-contador').textContent =
    `${inicio+1}–${Math.min(inicio+BB.porPagina,total)} de ${total}`;
  let pags = '';
  for (let i=1; i<=totalPags; i++) {
    if (totalPags <= 7 || i===1 || i===totalPags || Math.abs(i-BB.pagina)<=1) {
      pags += `<button onclick="bbIrPagina(${i})" style="padding:4px 9px;border-radius:6px;border:1px solid var(--border);background:${i===BB.pagina?'var(--azul)':'var(--white)'};color:${i===BB.pagina?'#fff':'var(--ink)'};font-size:12px;cursor:pointer">${i}</button>`;
    } else if (Math.abs(i-BB.pagina)===2) {
      pags += `<span style="color:var(--ink-muted);padding:0 2px">…</span>`;
    }
  }
  document.getElementById('bb-paginacion').innerHTML = pags;
}

function bbIrPagina(n) { BB.pagina = n; bbRenderTabla(); }

/* ── Seleccionar fila → panel detalle ── */
async function bbSeleccionar(id) {
  BB.seleccionado = id;
  const r = BB.todos.find(x => x.id === id);
  if (!r) return;

  // Actualizar selección visual
  document.querySelectorAll('.bb-row').forEach(tr => tr.classList.remove('selected'));
  event.currentTarget?.classList.add('selected');

  document.getElementById('bb-panel-overlay').classList.add('open');

  const nombrePac = bbNombrePaciente(r.id_paciente);
  document.getElementById('bb-panel-nombre').textContent = nombrePac;
  document.getElementById('bb-panel-sub').textContent =
    `${r.tipo} · ${r.especialidad} · ${r.id}`;

  // Progreso grande
  const restantes = r.sesiones_total - r.sesiones_consumidas;
  const pct = r.sesiones_total > 0 ? Math.round((r.sesiones_consumidas / r.sesiones_total) * 100) : 0;
  const barClass = restantes <= 0 ? 'done' : pct >= 70 ? 'warn' : 'ok';
  document.getElementById('bb-panel-progreso').innerHTML = `
    <div class="bb-panel-prog-nums">
      <span class="bb-panel-prog-main">${restantes}</span>
      <span class="bb-panel-prog-total">sesiones restantes de ${r.sesiones_total}</span>
    </div>
    <div class="bb-panel-prog-bar">
      <div class="bb-panel-prog-fill ${barClass}" style="width:${pct}%"></div>
    </div>
    <div style="font-size:11px;color:var(--ink-muted);margin-top:6px">${r.sesiones_consumidas} consumidas · ${pct}%</div>`;

  // KPIs del panel
  const esAdmin = G.profesional?.es_admin === 'Si';
  let kpisHtml = `
    <div class="bb-panel-kpi">
      <div class="bb-panel-kpi-val">${bbFechaCorta(r.fecha_inicio)}</div>
      <div class="bb-panel-kpi-lbl">Inicio</div>
    </div>
    <div class="bb-panel-kpi">
      <div class="bb-panel-kpi-val">${bbFechaCorta(r.fecha_vencimiento)}</div>
      <div class="bb-panel-kpi-lbl">Vencimiento</div>
    </div>`;
  if (esAdmin) {
    const pendienteProd = Math.max(0, restantes) * 45;
    kpisHtml += `
    <div class="bb-panel-kpi">
      <div class="bb-panel-kpi-val" style="font-size:14px">${bbEur(r.importe_total)}</div>
      <div class="bb-panel-kpi-lbl">Importe total</div>
    </div>
    <div class="bb-panel-kpi">
      <div class="bb-panel-kpi-val" style="font-size:14px;color:${pendienteProd>0?'var(--amber)':'var(--verde-dark)'}">${bbEur(pendienteProd)}</div>
      <div class="bb-panel-kpi-lbl">Pendiente producir</div>
    </div>`;
  }
  document.getElementById('bb-panel-kpis').innerHTML = kpisHtml;

  // Datos
  const estado = bbEstado(r);
  const cobroHtml = r.tipo === 'BONO'
    ? '<div class="bb-panel-field"><span class="bb-panel-field-lbl">Cobro del bono</span><span class="bb-panel-field-val">' +
      (r.forma_cobro_bono
        ? '<span style="color:var(--verde-dark)">✓ ' + r.forma_cobro_bono + '</span>'
        : '<span style="color:var(--rojo);font-weight:600">⚠ Pendiente de cobro</span>') +
      '</span></div>'
    : '<div class="bb-panel-field"><span class="bb-panel-field-lbl">Anticipo recibido</span><span class="bb-panel-field-val">' +
      (r.anticipo_recibido === 'Si' ? '<span style="color:var(--verde-dark)">Sí</span>' : '<span style="color:var(--rojo)">No</span>') +
      '</span></div>';

  document.getElementById('bb-panel-datos').innerHTML = `
    <div class="bb-panel-field"><span class="bb-panel-field-lbl">Paciente</span><span class="bb-panel-field-val">${r.id_paciente}</span></div>
    <div class="bb-panel-field"><span class="bb-panel-field-lbl">Estado</span><span class="bb-panel-field-val"><span class="bb-badge ${estado}">${bbEstadoLabel(estado)}</span></span></div>
    ${cobroHtml}
    ${r.anio_escolar ? '<div class="bb-panel-field"><span class="bb-panel-field-lbl">Año escolar</span><span class="bb-panel-field-val">' + r.anio_escolar + '</span></div>' : ''}
    ${r.notas ? '<div class="bb-panel-field"><span class="bb-panel-field-lbl">Notas</span><span class="bb-panel-field-val" style="max-width:200px;text-align:right;font-size:12px">' + r.notas + '</span></div>' : ''}`;

  // Citas consumidas
  const citas = (BB.citas[id] || []).sort((a,b) => a.fecha > b.fecha ? 1 : -1);
  if (citas.length === 0) {
    document.getElementById('bb-panel-citas').innerHTML =
      '<div style="font-size:12px;color:var(--ink-muted);padding:8px 0">Sin sesiones registradas aún</div>';
  } else {
    document.getElementById('bb-panel-citas').innerHTML = citas.map(c => {
      const estadoColor = c.estado==='Hecha'?'var(--verde-dark)':c.estado==='Noshow'?'var(--rojo)':'var(--ink-muted)';
      return `<div class="bb-cita-row">
        <span class="bb-cita-fecha">${bbFechaCorta(c.fecha)}</span>
        <span class="bb-cita-pac">${bbNombrePaciente(c.id_paciente)}</span>
        <span class="bb-cita-estado"><span style="font-size:11px;color:${estadoColor}">${c.estado||'—'}</span></span>
        ${esAdmin?`<span class="bb-cita-precio">${bbEur(c.precio||45)}</span>`:''}
      </div>`;
    }).join('');
  }

  // Botones de acción
  const esAdminBtn = G.profesional?.es_admin === 'Si';
  let acciones = `<button class="bb-panel-btn" onclick="bbAbrirModal('editar','${r.id}')">
    <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    Editar
  </button>`;
  if (esAdminBtn && r.tipo === 'BECA') {
    acciones += `<button class="bb-panel-btn primary" onclick="bbGenerarFactura('${r.id}')">
      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>
      Generar factura
    </button>`;
    acciones += `<button class="bb-panel-btn" onclick="bbAbrirModalParcial('${r.id}')">
      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="12" y2="15"/></svg>
      Factura parcial (beca no completada)
    </button>`;
  }
  if (esAdminBtn && r.tipo === 'BONO' && r.anticipo_recibido === 'Si') {
    // Verificar si el cobro fue bancario — necesitaríamos cobros, por ahora mostramos siempre para bonos con anticipo
    acciones += `<button class="bb-panel-btn" onclick="bbGenerarFactura('${r.id}')">
      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      Generar factura
    </button>`;
  }
  document.getElementById('bb-panel-actions').innerHTML = acciones;
}

function bbCerrarPanel() {
  BB.seleccionado = null;
  document.querySelectorAll('.bb-row').forEach(tr => tr.classList.remove('selected'));
  document.getElementById('bb-panel-overlay').classList.remove('open');
}

/* ── Modal alta/edición ── */
function bbAbrirModal(modo, id) {
  BB.modalModo = modo;
  const overlay = document.getElementById('bb-modal-overlay');
  overlay.classList.add('open');
  bbPoblarAnios();

  const hoy = new Date().toISOString().split('T')[0];
  const fin2025 = new Date().getFullYear() + '-12-31';
  const mas2m = new Date(); mas2m.setMonth(mas2m.getMonth()+2);
  const fin2m = mas2m.toISOString().split('T')[0];

  if (modo === 'nuevo') {
    document.getElementById('bb-modal-titulo').textContent =
      BB.tipo === 'BECA' ? 'Nueva beca' : 'Nuevo bono';
    document.getElementById('bb-edit-id').value = '';
    document.getElementById('bb-tipo-row').style.display = '';
    document.querySelectorAll('[name="bb-tipo"]').forEach(r => r.checked = r.value === BB.tipo);
    document.getElementById('bb-pac-search').value = '';
    document.getElementById('bb-pac-id').value = '';
    document.getElementById('bb-pac-seleccionado').style.display = 'none';
    document.getElementById('bb-pac-search').style.display = '';
    document.getElementById('bb-f-esp').value = 'PSI';
    document.getElementById('bb-f-anticipo').value = 'Si';
    document.getElementById('bb-f-notas').value = '';
    document.getElementById('bb-row-consumidas').style.display = 'none';
    if (BB.tipo === 'BECA') {
      document.getElementById('bb-f-sesiones').value = '20';
      document.getElementById('bb-f-importe').value = '913';
      document.getElementById('bb-f-inicio').value = hoy;
      document.getElementById('bb-f-vencimiento').value = fin2025;
      document.getElementById('bb-f-anio').value = `${new Date().getFullYear()-1}/${new Date().getFullYear()}`;
      document.getElementById('bb-campos-beca').style.display = '';
    } else {
      document.getElementById('bb-f-sesiones').value = '4';
      document.getElementById('bb-f-importe').value = '180';
      document.getElementById('bb-f-inicio').value = hoy;
      document.getElementById('bb-f-vencimiento').value = fin2m;
      document.getElementById('bb-campos-beca').style.display = 'none';
    }
  } else {
    // Editar
    const r = BB.todos.find(x => x.id === id);
    if (!r) return;
    document.getElementById('bb-modal-titulo').textContent = `Editar ${r.tipo.toLowerCase()}`;
    document.getElementById('bb-edit-id').value = r.id;
    document.getElementById('bb-tipo-row').style.display = 'none';
    document.getElementById('bb-pac-search').style.display = 'none';
    document.getElementById('bb-pac-id').value = r.id_paciente;
    document.getElementById('bb-pac-seleccionado').style.display = '';
    document.getElementById('bb-pac-seleccionado').textContent =
      `${bbNombrePaciente(r.id_paciente)} · ${r.id_paciente}`;
    document.getElementById('bb-f-esp').value = r.especialidad || 'PSI';
    document.getElementById('bb-f-sesiones').value = r.sesiones_total;
    document.getElementById('bb-f-importe').value = r.importe_total;
    document.getElementById('bb-f-anticipo').value = r.anticipo_recibido || 'Si';
    document.getElementById('bb-f-inicio').value = r.fecha_inicio;
    document.getElementById('bb-f-vencimiento').value = r.fecha_vencimiento;
    document.getElementById('bb-f-anio').value = r.anio_escolar || '';
    document.getElementById('bb-f-notas').value = r.notas || '';
    document.getElementById('bb-row-consumidas').style.display = '';
    document.getElementById('bb-f-consumidas').value = r.sesiones_consumidas || 0;
    document.getElementById('bb-campos-beca').style.display = r.tipo === 'BECA' ? '' : 'none';
  }
}

function bbTipoCambiado() {
  const tipo = document.querySelector('[name="bb-tipo"]:checked').value;
  document.getElementById('bb-campos-beca').style.display = tipo === 'BECA' ? '' : 'none';
  const fin2025 = new Date().getFullYear() + '-12-31';
  const mas2m = new Date(); mas2m.setMonth(mas2m.getMonth()+2);
  if (tipo === 'BECA') {
    document.getElementById('bb-f-sesiones').value = '20';
    document.getElementById('bb-f-importe').value = '913';
    document.getElementById('bb-f-vencimiento').value = fin2025;
  } else {
    document.getElementById('bb-f-sesiones').value = '4';
    document.getElementById('bb-f-importe').value = '180';
    document.getElementById('bb-f-vencimiento').value = mas2m.toISOString().split('T')[0];
  }
}

function bbCerrarModal() {
  document.getElementById('bb-modal-overlay').classList.remove('open');
  document.getElementById('bb-pac-dropdown').style.display = 'none';
}

/* ── Buscador paciente en modal ── */
function bbBuscarPaciente() {
  const q = document.getElementById('bb-pac-search').value.trim().toLowerCase();
  const dropdown = document.getElementById('bb-pac-dropdown');
  const lista = document.getElementById('bb-pac-lista');
  if (q.length < 2) { dropdown.style.display = 'none'; return; }
  const res = (G.pacientes||[]).filter(p => {
    const texto = `${p.nombre} ${p.apellidos||''} ${p.id}`.toLowerCase();
    return texto.includes(q);
  }).slice(0, 8);
  if (res.length === 0) { dropdown.style.display = 'none'; return; }
  lista.innerHTML = res.map(p => `
    <div onclick="bbSeleccionarPaciente('${p.id}')"
      style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border)"
      onmouseover="this.style.background='var(--cream)'" onmouseout="this.style.background=''">
      <strong>${p.nombre} ${p.apellidos||''}</strong>
      <span style="font-size:11px;color:var(--ink-muted);font-family:'DM Mono',monospace;margin-left:8px">${p.id}</span>
    </div>`).join('');
  dropdown.style.display = '';
}

function bbSeleccionarPaciente(id) {
  document.getElementById('bb-pac-id').value = id;
  document.getElementById('bb-pac-dropdown').style.display = 'none';
  document.getElementById('bb-pac-search').value = '';
  const p = (G.pacientes||[]).find(x => x.id === id);
  const sel = document.getElementById('bb-pac-seleccionado');
  sel.textContent = p ? `${p.nombre} ${p.apellidos||''} · ${id}` : id;
  sel.style.display = '';
}

/* ── Guardar ── */
async function bbGuardar() {
  const btn = document.getElementById('bb-btn-save');
  btn.disabled = true; btn.textContent = 'Guardando...';

  const editId = document.getElementById('bb-edit-id').value;
  const esEdicion = !!editId;
  const tipo = esEdicion
    ? BB.todos.find(x => x.id === editId)?.tipo
    : document.querySelector('[name="bb-tipo"]:checked').value;
  const idPaciente = document.getElementById('bb-pac-id').value;

  if (!esEdicion && !idPaciente) {
    bbToast('Selecciona un paciente', 'error');
    btn.disabled = false; btn.textContent = 'Guardar'; return;
  }

  const payload = {
    id_paciente:        esEdicion ? undefined : idPaciente,
    tipo:               esEdicion ? undefined : tipo,
    especialidad:       document.getElementById('bb-f-esp').value,
    sesiones_total:     parseInt(document.getElementById('bb-f-sesiones').value),
    sesiones_consumidas: esEdicion ? parseInt(document.getElementById('bb-f-consumidas').value) : undefined,
    importe_total:      parseFloat(document.getElementById('bb-f-importe').value),
    anticipo_recibido:  document.getElementById('bb-f-anticipo').value,
    fecha_inicio:       document.getElementById('bb-f-inicio').value,
    fecha_vencimiento:  document.getElementById('bb-f-vencimiento').value,
    anio_escolar:       document.getElementById('bb-f-anio').value || null,
    notas:              document.getElementById('bb-f-notas').value || null,
  };
  // Limpiar undefined
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  try {
    if (esEdicion) {
      const res = await fetch(`${SUPA_URL}/rest/v1/bonos_becas?id=eq.${editId}`, {
        method: 'PATCH',
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${G.sesion.access_token}`,
          'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      const actualizado = (await res.json())[0];
      const idx = BB.todos.findIndex(x => x.id === editId);
      if (idx >= 0) BB.todos[idx] = actualizado;
    } else {
      // Generar nuevo ID BB-NNN
      const resUlt = await fetch(
        `${SUPA_URL}/rest/v1/bonos_becas?select=id&order=id.desc&limit=1`,
        { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${G.sesion.access_token}` } }
      );
      const ult = await resUlt.json();
      const num = ult.length > 0 ? parseInt(ult[0].id.replace(/\D/g,'')) + 1 : 1;
      payload.id = 'BB-' + String(num).padStart(3,'0');

      const res = await fetch(`${SUPA_URL}/rest/v1/bonos_becas`, {
        method: 'POST',
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${G.sesion.access_token}`,
          'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      BB.todos.unshift((await res.json())[0]);
    }

    bbCerrarModal();
    bbAplicarFiltros();
    bbToast(esEdicion ? 'Cambios guardados' : 'Bono/beca creado', 'ok');
  } catch(e) {
    bbToast('Error al guardar: ' + e.message, 'error');
    console.error(e);
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar';
  }
}

/* ── Generar factura (conecta con módulo Facturas) ── */
async function bbGenerarFactura(idBonoBeca) {
  const r = BB.todos.find(x => x.id === idBonoBeca);
  if (!r) return;

  const pac = (G.pacientes||[]).find(p => p.id === r.id_paciente) || {};
  let prefill;

  if (r.tipo === 'BECA') {
    const esp = r.especialidad || 'PSI';
    const anioEscolar = r.anio_escolar || '';
    const anioFin = parseInt((anioEscolar||'2025/2026').split('/')[1]||'2026');

    // Guard: comprobar si ya existe factura activa para ESTA beca en concreto (id_bono es único
    // por especialidad — antes se comprobaba solo por paciente+curso, lo que bloqueaba
    // erróneamente la segunda beca de un paciente con PSI y LOG el mismo curso).
    try {
      const existe = await sg(`facturas?tipo_factura=eq.beca&id_bono=eq.${encodeURIComponent(r.id)}&estado=neq.Anulada&select=numero_factura&limit=1`);
      if (existe && existe.length > 0) {
        bbToast(`Ya existe la factura ${existe[0].numero_factura} para esta beca. Anúlala primero si necesitas volver a facturar.`, 'error');
        return;
      }
    } catch(e) { console.warn('Guard beca:', e); }

    const tipoTexto = esp==='LOG' ? 'reeducación del lenguaje' : 'reeducación psicopedagógica';
    const titulo = '"BECA DE '+(esp==='LOG'?'REEDUCACIÓN DEL LENGUAJE':'REEDUCACIÓN PSICOPEDAGÓGICA')+'. CURSO '+anioEscolar+'"';
    prefill = {
      id_paciente_v2:     r.id_paciente,
      tipo_factura:       'beca',
      curso_academico:    anioEscolar,
      id_bono:            r.id,
      receptor_nombre:    pac.nombre_tutor1 || null,
      receptor_dni:       pac.dni_tutor1 || null,
      receptor_direccion: pac.direccion_tutor1 || pac.direccion || null,
      receptor_cp:        null,
      receptor_municipio: pac.municipio || null,
      lineas: [
        { concepto: titulo+'\n* 20 Sesiones de '+tipoTexto+' de Enero a Junio de '+anioFin+'.', horas:20, precio:45, total:900 },
        { concepto: '* Una sesión de repaso'+(esp==='LOG'?' extra':'')+' en Junio', horas:1, precio:13, total:13 },
      ],
      _beca_meta: {
        pac_nombre: ((pac.nombre||'')+' '+(pac.apellidos||'')).trim(),
        especialidad: esp,
        anio_escolar: anioEscolar,
      }
    };
  } else {
    // Bono privado — receptor: tutor si menor, paciente si mayor
    const esMenor = pac.tiene_tutor === 'Si';
    prefill = {
      id_paciente_v2:     r.id_paciente,
      tipo_factura:       'bono',
      id_bono:            r.id,
      receptor_nombre:    esMenor ? (pac.nombre_tutor1||null) : ((pac.nombre||'')+' '+(pac.apellidos||'')).trim()||null,
      receptor_dni:       esMenor ? (pac.dni_tutor1||null) : (pac.dni||null),
      receptor_direccion: esMenor ? (pac.direccion_tutor1||null) : (pac.direccion||null),
      receptor_cp:        pac.codigo_postal || null,
      receptor_municipio: pac.municipio || null,
      lineas: [
        { concepto: 'Sesiones de tratamiento - Bono '+r.especialidad, horas: r.sesiones_total||4, precio:45, total:(r.importe_total||180) }
      ],
    };
  }

  // Navegar y abrir modal con datos ya cargados
  navTo('facturas');
  await new Promise(r => setTimeout(r, 350));
  factNuevaFactura(prefill);
}

/* ── Factura parcial (beca no completada) ──
   Caso: la beca no llega a las 20 sesiones (baja, fin de curso anticipado, etc.).
   Abraham introduce directamente el nº de sesiones reales y el precio/sesión;
   el resto (emisor, receptor, formato, PDF) se genera igual que una factura de beca normal. */
let BB_PARCIAL = null;

function bbParcialTextoDefecto(esp, anioEscolar, sesiones) {
  const tipoTexto = esp === 'LOG' ? 'reeducación del lenguaje' : 'reeducación psicopedagógica';
  const titulo = '"BECA DE '+(esp==='LOG'?'REEDUCACIÓN DEL LENGUAJE':'REEDUCACIÓN PSICOPEDAGÓGICA')+'. CURSO '+(anioEscolar||'')+'"';
  return titulo+'\n* '+sesiones+' sesiones de '+tipoTexto+' realizadas durante el curso '+(anioEscolar||'')+' (beca no completada).';
}

function bbAbrirModalParcial(idBonoBeca) {
  const r = BB.todos.find(x => x.id === idBonoBeca);
  if (!r) return;
  BB_PARCIAL = r;
  document.getElementById('bb-parcial-info').textContent =
    `${bbNombrePaciente(r.id_paciente)} · ${r.especialidad||'PSI'} · ${r.anio_escolar||'—'}`;
  const sesionesDefecto = r.sesiones_consumidas > 0 ? r.sesiones_consumidas : '';
  document.getElementById('bb-parcial-sesiones').value = sesionesDefecto;
  document.getElementById('bb-parcial-precio').value = '45';
  document.getElementById('bb-parcial-concepto').value =
    bbParcialTextoDefecto(r.especialidad||'PSI', r.anio_escolar||'', sesionesDefecto || 'N');
  bbParcialRecalcular();
  document.getElementById('bb-parcial-overlay').classList.add('open');
}

function bbParcialRecalcular() {
  const sesiones = parseFloat(document.getElementById('bb-parcial-sesiones').value) || 0;
  const precio   = parseFloat(document.getElementById('bb-parcial-precio').value) || 0;
  const total = Math.round(sesiones * precio * 100) / 100;
  document.getElementById('bb-parcial-total').textContent = bbEur(total);
}

function bbCerrarModalParcial() {
  BB_PARCIAL = null;
  document.getElementById('bb-parcial-overlay').classList.remove('open');
}

async function bbConfirmarFacturaParcial() {
  const r = BB_PARCIAL;
  if (!r) return;
  const sesiones = parseFloat(document.getElementById('bb-parcial-sesiones').value);
  const precio   = parseFloat(document.getElementById('bb-parcial-precio').value);
  const concepto = document.getElementById('bb-parcial-concepto').value.trim();

  if (!sesiones || sesiones <= 0) { bbToast('Indica un número de sesiones válido', 'error'); return; }
  if (!precio || precio <= 0)     { bbToast('Indica un precio por sesión válido', 'error'); return; }
  if (!concepto)                  { bbToast('El concepto no puede estar vacío', 'error'); return; }

  const pac = (G.pacientes||[]).find(p => p.id === r.id_paciente) || {};
  const anioEscolar = r.anio_escolar || '';
  const total = Math.round(sesiones * precio * 100) / 100;

  // Mismo guard que la factura completa: una única factura de beca activa por id_bono
  // (id_bono identifica la beca concreta, así que PSI y LOG del mismo paciente/curso no chocan)
  try {
    const existe = await sg(`facturas?tipo_factura=eq.beca&id_bono=eq.${encodeURIComponent(r.id)}&estado=neq.Anulada&select=numero_factura&limit=1`);
    if (existe && existe.length > 0) {
      bbToast(`Ya existe la factura ${existe[0].numero_factura} para esta beca. Anúlala primero si necesitas volver a facturar.`, 'error');
      return;
    }
  } catch(e) { console.warn('Guard beca parcial:', e); }

  const prefill = {
    id_paciente_v2:     r.id_paciente,
    tipo_factura:       'beca',
    curso_academico:    anioEscolar,
    id_bono:            r.id,
    receptor_nombre:    pac.nombre_tutor1 || null,
    receptor_dni:       pac.dni_tutor1 || null,
    receptor_direccion: pac.direccion_tutor1 || pac.direccion || null,
    receptor_cp:        null,
    receptor_municipio: pac.municipio || null,
    lineas: [
      { concepto, horas: sesiones, precio, total }
    ],
    _beca_meta: {
      pac_nombre: ((pac.nombre||'')+' '+(pac.apellidos||'')).trim(),
      especialidad: r.especialidad || 'PSI',
      anio_escolar: anioEscolar,
    }
  };

  bbCerrarModalParcial();
  navTo('facturas');
  await new Promise(res => setTimeout(res, 350));
  factNuevaFactura(prefill);
  bbToast('Factura precargada. Revisa y guarda en el módulo de Facturas — luego actualiza sesiones_consumidas/notas de esta beca en Bonos y Becas.', 'ok');
}

/* ── Toast ── */
function bbToast(msg, tipo) {
  // Reutilizar toast del sistema si existe, si no crear uno temporal
  if (typeof mostrarToast === 'function') { mostrarToast(msg, tipo === 'ok'); return; }
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;color:#fff;background:${tipo==='ok'?'#16a34a':'#dc2626'}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
