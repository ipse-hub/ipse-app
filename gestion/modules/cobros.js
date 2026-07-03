const COB = {
  tabActiva: 'banco',
  // banco
  movimientos: [],       // todos los movimientos_banco
  movFiltrados: [],      // tras aplicar filtros
  movPagina: 1,
  movPorPagina: 20,
  // caja
  cajaMov: [],
  // liquidaciones
  liquidaciones: [],
  liqPendientes: [],
};

function cobInit() {
  cobSwitchTab('banco');
  cobCargarBanco();
  cobCargarCaja();
  cobCargarLiq();
}

/* ── HELPERS ── */
function cobFmt(v) {
  if (v == null) return '—';
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' €';
}
function cobFmtFecha(f) {
  if (!f) return '—';
  const d = new Date(f + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function cobBadge(cat) {
  const map = {
    'Cobro paciente':   ['cob-badge-clin','Cobro paciente'],
    'Pago profesional': ['cob-badge-rev','Pago profesional'],
    'Gasto clinica':    ['cob-badge-pend','Gasto clínica'],
    'Personal':         ['cob-badge-pers','Personal'],
    'Sin clasificar':   ['cob-badge-desc','Sin clasificar'],
  };
  const [cls, lbl] = map[cat] || ['cob-badge-desc', cat || 'Sin clasificar'];
  return `<span class="cob-badge ${cls}">${lbl}</span>`;
}
function cobBadgeEstado(estado) {
  if (estado === 'Conciliado') return `<span class="cob-badge cob-badge-ok">Conciliado</span>`;
  if (estado === 'Clasificado') return `<span class="cob-badge cob-badge-rev">Clasificado</span>`;
  return `<span class="cob-badge cob-badge-desc">Sin clasificar</span>`;
}

/* ── TABS ── */
function cobSwitchTab(tab) {
  COB.tabActiva = tab;
  document.querySelectorAll('.cob-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.cob-tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('cob-tab-' + tab).classList.add('active');
  document.getElementById('cob-panel-' + tab).classList.add('active');
}

/* ══════════════════════════════════════════
   PESTAÑA BANCO
══════════════════════════════════════════ */
async function cobCargarBanco() {
  const res = await sg('movimientos_banco?select=*&order=fecha.desc&limit=2000');
  COB.movimientos = res || [];
  cobActualizarKpisBanco();
  cobPoblarFiltroMes();
  cobFiltrarBanco();
  cobRenderPendientes();
}

function cobActualizarKpisBanco() {
  const hoy = new Date();
  const mesActual = hoy.getMonth();
  const anioActual = hoy.getFullYear();
  const esteMes = COB.movimientos.filter(m => {
    const d = new Date(m.fecha);
    return d.getMonth() === mesActual && d.getFullYear() === anioActual;
  });
  const cobrado = esteMes.filter(m => m.categoria === 'Cobro paciente' && m.importe > 0)
    .reduce((s, m) => s + Number(m.importe), 0);
  const sinConc = COB.movimientos.filter(m => m.categoria === 'Sin clasificar').length;
  const saldo = COB.movimientos.length > 0 ? Number(COB.movimientos[0].saldo) : 0;

  document.getElementById('cob-k-cobrado').textContent = cobFmt(cobrado);
  document.getElementById('cob-k-pendiente').textContent = '—';
  document.getElementById('cob-k-sinconc').textContent = sinConc + ' mov.';
  document.getElementById('cob-k-saldo').textContent = COB.movimientos.length > 0 ? cobFmt(saldo) : '—';
}

function cobPoblarFiltroMes() {
  const meses = [...new Set(COB.movimientos.map(m => m.fecha ? m.fecha.slice(0, 7) : null).filter(Boolean))].sort().reverse();
  const sel = document.getElementById('cob-filtro-mes');
  sel.innerHTML = '<option value="">Todos los meses</option>' +
    meses.map(m => {
      const [y, mo] = m.split('-');
      const label = new Date(y, mo - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      return `<option value="${m}">${label}</option>`;
    }).join('');
}

function cobFiltrarBanco() {
  const q = (document.getElementById('cob-buscador-banco')?.value || '').toLowerCase();
  const cat = document.getElementById('cob-filtro-cat')?.value || '';
  const mes = document.getElementById('cob-filtro-mes')?.value || '';
  COB.movFiltrados = COB.movimientos.filter(m => {
    const concepto = ((m.concepto || '') + ' ' + (m.movimiento || '')).toLowerCase();
    if (q && !concepto.includes(q)) return false;
    if (cat && m.categoria !== cat) return false;
    if (mes && !(m.fecha || '').startsWith(mes)) return false;
    return true;
  });
  COB.movPagina = 1;
  cobRenderTablaBanco();
}

function cobRenderTablaBanco() {
  const tbody = document.getElementById('cob-banco-tbody');
  const total = COB.movFiltrados.length;
  const pages = Math.ceil(total / COB.movPorPagina) || 1;
  COB.movPagina = Math.min(COB.movPagina, pages);
  const slice = COB.movFiltrados.slice((COB.movPagina - 1) * COB.movPorPagina, COB.movPagina * COB.movPorPagina);

  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--ink-muted);padding:24px">Sin movimientos</td></tr>`;
  } else {
    tbody.innerHTML = slice.map(m => {
      const imp = Number(m.importe);
      const impHtml = imp >= 0
        ? `<span class="cob-pos">+${cobFmt(imp)}</span>`
        : `<span class="cob-neg">${cobFmt(imp)}</span>`;
      const cat = m.categoria || 'Sin clasificar';
      const estado = m.id_cobro ? 'Conciliado' : (cat !== 'Sin clasificar' ? 'Clasificado' : 'Sin clasificar');
      return `<tr>
        <td>${cobFmtFecha(m.fecha)}</td>
        <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(m.concepto||'')+' '+(m.movimiento||'')}">${m.concepto || '—'}<br><span style="font-size:11px;color:var(--ink-muted)">${m.movimiento || ''}</span></td>
        <td>${cobBadge(cat)}</td>
        <td style="text-align:right">${impHtml}</td>
        <td style="text-align:right;color:var(--ink-muted)">${m.saldo != null ? cobFmt(m.saldo) : '—'}</td>
        <td>${cobBadgeEstado(estado)}</td>
        <td><button class="btn-icon" onclick="cobEditarMovimiento('${m.id}')" title="Clasificar"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>
      </tr>`;
    }).join('');
  }

  document.getElementById('cob-banco-count').textContent = `${total} movimientos`;
  cobRenderPagBanco(pages);
}

function cobRenderPagBanco(pages) {
  const cont = document.getElementById('cob-banco-pag');
  if (pages <= 1) { cont.innerHTML = ''; return; }
  let h = '';
  for (let i = 1; i <= Math.min(pages, 10); i++) {
    h += `<button onclick="COB.movPagina=${i};cobRenderTablaBanco()" style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:${i===COB.movPagina?'var(--azul)':'var(--white)'};color:${i===COB.movPagina?'#fff':'var(--ink)'};font-size:12px;cursor:pointer">${i}</button>`;
  }
  cont.innerHTML = h;
}

function cobRenderPendientes() {
  const pendientes = COB.movimientos.filter(m => m.categoria === 'Sin clasificar');
  const section = document.getElementById('cob-sin-conciliar-section');
  if (!pendientes.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  document.getElementById('cob-sinconc-count').textContent = pendientes.length + ' movimientos';

  const lista = document.getElementById('cob-conc-lista');
  // Cabecera
  let h = `<div style="display:grid;grid-template-columns:1fr 28px 1fr auto;gap:8px;padding:8px 12px;background:var(--cream);border-bottom:1px solid var(--border)">
    <div style="font-size:11px;font-weight:600;color:var(--ink-muted)">MOVIMIENTO BANCO</div>
    <div></div>
    <div style="font-size:11px;font-weight:600;color:var(--ink-muted)">CLASIFICACIÓN</div>
    <div style="font-size:11px;font-weight:600;color:var(--ink-muted)">ACCIÓN</div>
  </div>`;

  h += pendientes.slice(0, 15).map(m => {
    const imp = Number(m.importe);
    const impHtml = imp >= 0
      ? `<span class="cob-pos">+${cobFmt(imp)}</span>`
      : `<span class="cob-neg">${cobFmt(imp)}</span>`;
    const cats = imp > 0
      ? ['Cobro paciente', 'Personal']
      : ['Gasto clinica', 'Pago profesional', 'Personal'];
    const catBtns = cats.map(c =>
      `<span class="cob-match-cat" onclick="cobClasificar('${m.id}','${c}',this)">${c === 'Gasto clinica' ? 'Gasto clínica' : c}</span>`
    ).join('');
    return `<div class="cob-conc-row" id="cob-conc-${m.id}">
      <div>
        <div class="cob-mov-fecha">${cobFmtFecha(m.fecha)} · ${m.concepto || ''}</div>
        <div class="cob-mov-concepto" style="font-size:12px;color:var(--ink-muted)">${m.movimiento || ''}</div>
        <div class="cob-mov-importe">${impHtml}</div>
      </div>
      <div style="text-align:center;color:var(--ink-muted)">→</div>
      <div class="cob-match-empty">
        <div style="font-size:11px;color:var(--ink-muted);margin-bottom:4px">Selecciona categoría:</div>
        <div class="cob-match-cats">${catBtns}</div>
      </div>
      <div class="cob-conc-actions">
        <button class="btn-sec" style="font-size:12px;padding:4px 10px" onclick="cobGuardarClasificacion('${m.id}')">Guardar</button>
        <button class="btn-icon" onclick="cobIgnorar('${m.id}')" title="Ignorar"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    </div>`;
  }).join('');

  lista.innerHTML = h;
}

async function cobClasificar(id, cat, el) {
  // Marcar visualmente la categoría seleccionada
  el.closest('.cob-match-cats').querySelectorAll('.cob-match-cat').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  // Guardar en el objeto en memoria para el botón Guardar
  const m = COB.movimientos.find(x => x.id === id);
  if (m) m._catPendiente = cat;
}

async function cobGuardarClasificacion(id) {
  const m = COB.movimientos.find(x => x.id === id);
  if (!m || !m._catPendiente) { toast('Selecciona una categoría primero', true); return; }
  const ok = await sp(`movimientos_banco?id=eq.${id}`, { categoria: m._catPendiente }, 'PATCH');
  if (ok !== null) {
    m.categoria = m._catPendiente;
    delete m._catPendiente;
    toast('Movimiento clasificado', false, true);
    cobRenderPendientes();
    cobFiltrarBanco();
    cobActualizarKpisBanco();
  }
}

async function cobIgnorar(id) {
  const m = COB.movimientos.find(x => x.id === id);
  if (!m) return;
  // Marcar como Personal por defecto (queda registrado pero no afecta a clínica)
  await sp(`movimientos_banco?id=eq.${id}`, { categoria: 'Personal' }, 'PATCH');
  m.categoria = 'Personal';
  cobRenderPendientes();
  cobFiltrarBanco();
  cobActualizarKpisBanco();
}

function cobEditarMovimiento(id) {
  const m = COB.movimientos.find(x => x.id === id);
  if (!m) return;
  // Reutilizar el modal de clasificación mostrando el movimiento
  cobAbrirModalClasificar(m);
}

function cobAbrirModalClasificar(m) {
  const imp = Number(m.importe);
  const cats = ['Cobro paciente', 'Pago profesional', 'Gasto clinica', 'Personal', 'Sin clasificar'];
  const catOpts = cats.map(c =>
    `<option value="${c}" ${m.categoria === c ? 'selected' : ''}>${c === 'Gasto clinica' ? 'Gasto clínica' : c}</option>`
  ).join('');
  const html = `<div style="padding:20px">
    <div style="font-size:15px;font-weight:600;margin-bottom:12px">Clasificar movimiento</div>
    <div style="background:var(--cream);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:13px">
      <div style="color:var(--ink-muted);font-size:11px">${cobFmtFecha(m.fecha)}</div>
      <div style="font-weight:600">${m.concepto || ''}</div>
      <div style="color:var(--ink-muted)">${m.movimiento || ''}</div>
      <div style="font-weight:700;margin-top:4px;font-size:15px">${imp >= 0 ? '<span class="cob-pos">+' + cobFmt(imp) + '</span>' : '<span class="cob-neg">' + cobFmt(imp) + '</span>'}</div>
    </div>
    <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">CATEGORÍA</label>
    <select id="cob-modal-cat" style="width:100%;margin-top:4px;margin-bottom:12px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">${catOpts}</select>
    <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">NOTAS (opcional)</label>
    <input id="cob-modal-notas" type="text" value="${m.notas || ''}" style="width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
      <button class="btn-sec" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" onclick="cobGuardarModalClasif('${m.id}')">Guardar</button>
    </div>
  </div>`;
  abrirModal(html);
}

async function cobGuardarModalClasif(id) {
  const cat = document.getElementById('cob-modal-cat').value;
  const notas = document.getElementById('cob-modal-notas').value;
  const ok = await sp(`movimientos_banco?id=eq.${id}`, { categoria: cat, notas }, 'PATCH');
  if (ok !== null) {
    const m = COB.movimientos.find(x => x.id === id);
    if (m) { m.categoria = cat; m.notas = notas; }
    cerrarModal();
    toast('Guardado', false, true);
    cobRenderPendientes();
    cobFiltrarBanco();
    cobActualizarKpisBanco();
  }
}

/* ── IMPORTAR EXTRACTO BBVA ── */
/* ── AUTOCLASIFICACIÓN ── */
function cobAutoClasificar(concepto, movimiento, importe) {
  const c = (concepto + ' ' + movimiento).toLowerCase();
  const imp = Number(importe);

  // Cobros de pacientes — Bizum recibido
  if (c.includes('bizum') && (c.includes('recibido') || imp > 0 && c.includes('bizum'))) {
    if (!c.includes('enviado')) return 'Cobro paciente';
  }
  // Pagos a profesionales — transferencias con keywords de liquidación
  if ((c.includes('pago psico') || c.includes('pago logo') || c.includes('pago logp') ||
       c.includes('pago pedago') || c.includes('pago to ') || c.includes('pago nomina') ||
       c.includes('liquidacion') || c.includes('liquidación'))) {
    return 'Pago profesional';
  }
  // Gastos fijos de clínica
  if (c.includes('seguridad social') || c.includes('tgss') || c.includes('autónomo') ||
      c.includes('autonomo') || c.includes('emasagra') || c.includes('repsol') ||
      c.includes('o2 fibra') || c.includes('o2 movil') || c.includes('telefonica') ||
      c.includes('alquiler') || c.includes('mutua') || c.includes('colegial')) {
    return 'Gasto clinica';
  }
  // Impuestos y modelos — gasto clínica
  if (c.includes('pago de impuestos') || c.includes('nrc.') || c.includes('modelo 130') ||
      c.includes('modelo 303') || c.includes('aeat')) {
    return 'Gasto clinica';
  }
  // Bizum enviado o pago con tarjeta → personal por defecto
  if ((c.includes('bizum') && c.includes('enviado')) || c.includes('pago con tarjeta')) {
    return 'Personal';
  }
  // Traspaso entre cuentas → personal
  if (c.includes('traspaso') || c.includes('de casa a') || c.includes('a casa')) {
    return 'Personal';
  }
  // Apple, Mercadona, Amazon y similares → personal
  if (c.includes('apple') || c.includes('mercadona') || c.includes('amazon') ||
      c.includes('netflix') || c.includes('spotify')) {
    return 'Personal';
  }

  return 'Sin clasificar';
}

async function cobReclasificarTodo() {
  if (!COB.movimientos.length) { toast('No hay movimientos cargados', true); return; }
  const sinClasif = COB.movimientos.filter(m => m.categoria === 'Sin clasificar');
  if (!sinClasif.length) { toast('No hay movimientos sin clasificar', false, true); return; }

  let actualizados = 0;
  for (const m of sinClasif) {
    const cat = cobAutoClasificar(m.concepto || '', m.movimiento || '', m.importe);
    if (cat !== 'Sin clasificar') {
      const ok = await sp(`movimientos_banco?id=eq.${m.id}`, { categoria: cat }, 'PATCH');
      if (ok !== null) { m.categoria = cat; actualizados++; }
    }
  }
  toast(`${actualizados} movimientos clasificados automáticamente`, false, true);
  cobActualizarKpisBanco();
  cobFiltrarBanco();
  cobRenderPendientes();
}

/* ── DRAG & DROP ── */
function cobDragOver(e) { e.preventDefault(); document.getElementById('cob-upload-zone').style.borderColor = 'var(--azul)'; }
function cobDragLeave(e) { document.getElementById('cob-upload-zone').style.borderColor = 'var(--border)'; }
function cobDrop(e) {
  e.preventDefault();
  cobDragLeave(e);
  const file = e.dataTransfer.files[0];
  if (file) cobProcesarExtracto(file);
}
function cobImportarExtracto(input) {
  const file = input.files[0];
  if (file) cobProcesarExtracto(file);
}

async function cobProcesarExtracto(file) {
  toast('Procesando extracto…');
  try {
    const data = await file.arrayBuffer();
    const XLSX = window.XLSX;
    if (!XLSX) { toast('Librería XLSX no disponible', true); return; }
    const wb = XLSX.read(data, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

    // Buscar fila de cabecera
    let headerRow = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map(c => String(c).trim());
      if (row.includes('F.Valor') || row.includes('Fecha') || row.includes('Importe')) {
        headerRow = i;
        break;
      }
    }
    if (headerRow < 0) { toast('No se encontró la cabecera del extracto', true); return; }

    // Mapear columnas por nombre (ignorar columnas vacías)
    const headers = rows[headerRow].map(c => String(c).trim());
    const col = name => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
    const iValor = col('F.Valor');
    const iFecha = col('Fecha');
    const iConc  = col('Concepto');
    const iMov   = col('Movimiento');
    const iImp   = col('Importe');
    const iSaldo = col('Disponible');

    // Helper: parsear fecha DD/MM/YYYY o DD/MM/YY → YYYY-MM-DD
    function parseFecha(raw) {
      if (!raw) return null;
      const s = String(raw).trim();
      const parts = s.split('/');
      if (parts.length === 3) {
        let [d, m, y] = parts;
        if (y.length === 2) y = '20' + y;
        return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
      }
      return null;
    }

    const nuevos = [];
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      const rawImp = row[iImp];
      if (rawImp === '' || rawImp == null) continue;
      // BBVA exporta con punto decimal anglosajón — solo eliminar caracteres no numéricos salvo punto y signo
      const importe = Number(String(rawImp).replace(/[^0-9.-]/g, ''));
      if (isNaN(importe)) continue;

      const rawFecha = row[iFecha] || row[iValor];
      const fecha = parseFecha(rawFecha);
      if (!fecha) continue;

      const saldoRaw = iSaldo >= 0 ? row[iSaldo] : null;
      const saldo = saldoRaw != null && saldoRaw !== ''
        ? Number(String(saldoRaw).replace(/[^0-9.-]/g, ''))
        : null;

      const concepto   = String(row[iConc]  || '').trim();
      const movimiento = String(row[iMov]   || '').trim();

      const id = 'MOV-' + fecha.replace(/-/g,'') + '-' +
        String(nuevos.length + 1).padStart(4,'0') + '-' +
        Math.random().toString(36).slice(2, 6).toUpperCase();

      const categoria = cobAutoClasificar(concepto, movimiento, importe);
      nuevos.push({ id, fecha, concepto, movimiento, importe, saldo, categoria, origen: 'Importado' });
    }

    if (!nuevos.length) { toast('No se encontraron movimientos válidos', true); return; }

    let insertados = 0;
    const CHUNK = 50;
    for (let i = 0; i < nuevos.length; i += CHUNK) {
      const chunk = nuevos.slice(i, i + CHUNK);
      const res = await fetch(`${SUPA_URL}/rest/v1/movimientos_banco`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${G.sesion.access_token}`,
          'Prefer': 'resolution=ignore-duplicates,return=minimal'
        },
        body: JSON.stringify(chunk)
      });
      if (res.ok) insertados += chunk.length;
    }

    document.getElementById('cob-upload-hint').textContent =
      `Último importado: ${new Date().toLocaleDateString('es-ES')} — ${nuevos.length} movimientos procesados`;
    toast(`Extracto importado: ${insertados} movimientos`, false, true);
    await cobCargarBanco();
  } catch(e) {
    console.error(e);
    toast('Error procesando el extracto: ' + e.message, true);
  }
}

/* ══════════════════════════════════════════
   PESTAÑA CAJA
══════════════════════════════════════════ */
async function cobCargarCaja() {
  const res = await sg('movimientos_caja?select=*&order=fecha.desc&limit=2000');
  COB.cajaMov = res || [];
  cobActualizarSaldoCaja();
  cobPoblarFiltroMesCaja();
  cobFiltrarCaja();
}

function cobActualizarSaldoCaja() {
  const saldo = COB.cajaMov.reduce((s, m) => s + Number(m.importe), 0);
  const el = document.getElementById('cob-caja-saldo');
  el.textContent = cobFmt(saldo);
  el.className = 'cob-saldo-val ' + (saldo >= 0 ? 'green' : 'red');
}

function cobPoblarFiltroMesCaja() {
  const meses = [...new Set(COB.cajaMov.map(m => m.fecha ? m.fecha.slice(0,7) : null).filter(Boolean))].sort().reverse();
  const sel = document.getElementById('cob-caja-filtro-mes');
  sel.innerHTML = '<option value="">Todos los meses</option>' +
    meses.map(m => {
      const [y, mo] = m.split('-');
      const label = new Date(y, mo - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      return `<option value="${m}">${label}</option>`;
    }).join('');
}

function cobFiltrarCaja() {
  const cat = document.getElementById('cob-caja-filtro-cat')?.value || '';
  const mes = document.getElementById('cob-caja-filtro-mes')?.value || '';
  const filtrados = COB.cajaMov.filter(m => {
    if (cat && m.categoria !== cat) return false;
    if (mes && !(m.fecha || '').startsWith(mes)) return false;
    return true;
  });
  cobRenderTablaCaja(filtrados);
}

function cobRenderTablaCaja(movs) {
  const tbody = document.getElementById('cob-caja-tbody');
  const empty = document.getElementById('cob-caja-empty');
  if (!movs.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  // Calcular saldo acumulado (orden inverso = más antiguo primero)
  const ordenados = [...movs].reverse();
  let saldoAcum = 0;
  const conSaldo = ordenados.map(m => {
    saldoAcum += Number(m.importe);
    return { ...m, saldoAcum };
  }).reverse();

  tbody.innerHTML = conSaldo.map(m => {
    const imp = Number(m.importe);
    const impHtml = imp >= 0
      ? `<span class="cob-pos">+${cobFmt(imp)}</span>`
      : `<span class="cob-neg">${cobFmt(imp)}</span>`;
    return `<tr>
      <td>${cobFmtFecha(m.fecha)}</td>
      <td>${m.concepto || '—'}</td>
      <td>${cobBadge(m.categoria || 'Sin clasificar')}</td>
      <td style="color:var(--ink-muted);font-size:12px">${m.id_paciente || m.id_profesional || '—'}</td>
      <td style="text-align:right">${impHtml}</td>
      <td style="text-align:right;color:var(--ink-muted)">${cobFmt(m.saldoAcum)}</td>
      <td><button class="btn-icon" onclick="cobEditarCaja('${m.id}')" title="Editar"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>
    </tr>`;
  }).join('');
}

function cobCajaModal(tipo) {
  const esEntrada = tipo === 'entrada';
  const html = `<div style="padding:20px">
    <div style="font-size:15px;font-weight:600;margin-bottom:14px">${esEntrada ? 'Entrada de efectivo' : 'Salida de efectivo'}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">FECHA</label>
        <input type="date" id="cob-caja-fecha" value="${new Date().toISOString().slice(0,10)}" style="width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">IMPORTE (€)</label>
        <input type="number" id="cob-caja-importe" min="0.01" step="0.01" placeholder="0,00" style="width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">
      </div>
    </div>
    <div style="margin-bottom:10px">
      <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">CONCEPTO</label>
      <input type="text" id="cob-caja-concepto" placeholder="Describe el movimiento…" style="width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">
    </div>
    <div style="margin-bottom:14px">
      <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">CATEGORÍA</label>
      <select id="cob-caja-cat" style="width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">
        ${esEntrada
          ? '<option value="Cobro paciente">Cobro paciente</option><option value="Personal">Personal</option>'
          : '<option value="Pago profesional">Pago profesional</option><option value="Personal">Personal</option>'}
      </select>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn-sec" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" onclick="cobGuardarCaja('${tipo}')">Guardar</button>
    </div>
  </div>`;
  abrirModal(html);
}

async function cobGuardarCaja(tipo) {
  const fecha    = document.getElementById('cob-caja-fecha').value;
  const importeV = parseFloat(document.getElementById('cob-caja-importe').value);
  const concepto = document.getElementById('cob-caja-concepto').value.trim();
  const cat      = document.getElementById('cob-caja-cat').value;

  if (!fecha || isNaN(importeV) || importeV <= 0) { toast('Completa fecha e importe', true); return; }

  const importe = tipo === 'salida' ? -Math.abs(importeV) : Math.abs(importeV);
  const id = 'CAJ-' + Date.now().toString(36).toUpperCase();
  const payload = { id, fecha, concepto, importe, categoria: cat };

  const ok = await sp('movimientos_caja', payload, 'POST');
  if (ok !== null) {
    cerrarModal();
    toast('Movimiento registrado', false, true);
    await cobCargarCaja();
  }
}

function cobEditarCaja(id) {
  const m = COB.cajaMov.find(x => x.id === id);
  if (!m) return;
  const imp = Math.abs(Number(m.importe));
  const cats = ['Cobro paciente', 'Pago profesional', 'Personal'];
  const catOpts = cats.map(c => `<option value="${c}" ${m.categoria===c?'selected':''}>${c}</option>`).join('');
  const html = `<div style="padding:20px">
    <div style="font-size:15px;font-weight:600;margin-bottom:14px">Editar movimiento de caja</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">FECHA</label>
        <input type="date" id="cob-edit-fecha" value="${m.fecha}" style="width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">IMPORTE (€)</label>
        <input type="number" id="cob-edit-importe" value="${imp}" min="0.01" step="0.01" style="width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">
      </div>
    </div>
    <div style="margin-bottom:10px">
      <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">CONCEPTO</label>
      <input type="text" id="cob-edit-concepto" value="${m.concepto||''}" style="width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">
    </div>
    <div style="margin-bottom:14px">
      <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">CATEGORÍA</label>
      <select id="cob-edit-cat" style="width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">${catOpts}</select>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn-sec" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" onclick="cobGuardarEditCaja('${id}',${Number(m.importe) < 0 ? '-1' : '1'})">Guardar</button>
    </div>
  </div>`;
  abrirModal(html);
}

async function cobGuardarEditCaja(id, signo) {
  const fecha    = document.getElementById('cob-edit-fecha').value;
  const importeV = parseFloat(document.getElementById('cob-edit-importe').value);
  const concepto = document.getElementById('cob-edit-concepto').value.trim();
  const cat      = document.getElementById('cob-edit-cat').value;
  if (!fecha || isNaN(importeV)) { toast('Datos incompletos', true); return; }
  const importe = signo * Math.abs(importeV);
  const ok = await sp(`movimientos_caja?id=eq.${id}`, { fecha, importe, concepto, categoria: cat }, 'PATCH');
  if (ok !== null) {
    cerrarModal();
    toast('Actualizado', false, true);
    await cobCargarCaja();
  }
}

/* ══════════════════════════════════════════
   PESTAÑA LIQUIDACIONES
══════════════════════════════════════════ */
async function cobCargarLiq() {
  const [liqRes, prosRes] = await Promise.all([
    sg('liquidaciones_profesionales?select=*,profesionales(nombre,apellidos,color_agenda)&order=created_at.desc&limit=500'),
    sg('profesionales?select=id,nombre,apellidos,color_agenda,porcentaje_reparto&activa=eq.Si')
  ]);
  COB.liquidaciones = liqRes || [];
  // Poblar select de profesionales
  const pros = prosRes || [];
  const sel = document.getElementById('cob-liq-filtro-pro');
  if (sel) {
    sel.innerHTML = '<option value="">Todas las profesionales</option>' +
      pros.filter(p => p.id !== 'PRO-ADM').map(p => `<option value="${p.id}">${p.nombre} ${p.apellidos}</option>`).join('');
  }
  cobActualizarKpisLiq();
  cobLiqRenderHistorial();
  cobRenderLiqPendientes();
}

function cobActualizarKpisLiq() {
  const pendTotal = COB.liquidaciones.filter(l => l.estado === 'Pendiente')
    .reduce((s, l) => s + Number(l.importe_calculado), 0);
  const hoy = new Date();
  const pagadoMes = COB.liquidaciones.filter(l => {
    if (l.estado !== 'Pagado' || !l.fecha_pago) return false;
    const d = new Date(l.fecha_pago);
    return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
  }).reduce((s, l) => s + Number(l.importe_acordado || l.importe_calculado), 0);
  const prosConSaldo = new Set(COB.liquidaciones.filter(l => l.estado === 'Pendiente').map(l => l.id_profesional)).size;

  document.getElementById('cob-liq-k-pend').textContent = cobFmt(pendTotal);
  document.getElementById('cob-liq-k-pagado').textContent = cobFmt(pagadoMes);
  document.getElementById('cob-liq-k-pros').textContent = prosConSaldo + ' profesionales';
}

async function cobLiqCalcular() {
  // Modal para seleccionar período
  const hoy = new Date();
  const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);
  const html = `<div style="padding:20px">
    <div style="font-size:15px;font-weight:600;margin-bottom:14px">Calcular liquidaciones</div>
    <p style="font-size:13px;color:var(--ink-muted);margin-bottom:14px">El sistema calculará el 60% de las sesiones realizadas y cobradas de cada profesional en el período seleccionado.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">DESDE</label>
        <input type="date" id="liq-desde" value="${primerDia}" style="width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">HASTA</label>
        <input type="date" id="liq-hasta" value="${ultimoDia}" style="width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn-sec" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" onclick="cobLiqEjecutarCalculo()">Calcular</button>
    </div>
  </div>`;
  abrirModal(html);
}

async function cobLiqEjecutarCalculo() {
  const desde = document.getElementById('liq-desde').value;
  const hasta = document.getElementById('liq-hasta').value;
  if (!desde || !hasta) { toast('Selecciona el período', true); return; }

  cerrarModal();
  toast('Calculando…');

  // Cargar citas realizadas y cobradas en el período
  const citas = await sg(`citas_v2?select=id,id_profesional,precio,estado,metodo_cobro&gte.fecha=${desde}&lte.fecha=${hasta}&eq.estado=Hecha&limit=2000`);
  if (!citas || !citas.length) { toast('No hay sesiones cobradas en ese período', true); return; }

  // Agrupar por profesional
  const porPro = {};
  citas.forEach(c => {
    if (!c.id_profesional || c.id_profesional === 'PRO-ADM') return;
    if (!porPro[c.id_profesional]) porPro[c.id_profesional] = { sesiones: 0, bruto: 0 };
    porPro[c.id_profesional].sesiones++;
    porPro[c.id_profesional].bruto += Number(c.precio || 0);
  });

  // Cargar porcentajes de profesionales
  const pros = await sg('profesionales?select=id,nombre,apellidos,porcentaje_reparto&activa=eq.Si');
  const proMap = {};
  (pros || []).forEach(p => { proMap[p.id] = p; });

  // Crear liquidaciones
  let creadas = 0;
  for (const [idPro, datos] of Object.entries(porPro)) {
    const pro = proMap[idPro];
    const pct = pro?.porcentaje_reparto || 60;
    const calculado = Math.round(datos.bruto * pct) / 100;
    const id = 'LIQ-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
    const payload = {
      id,
      id_profesional: idPro,
      periodo_desde: desde,
      periodo_hasta: hasta,
      importe_calculado: calculado,
      estado: 'Pendiente'
    };
    const ok = await sp('liquidaciones_profesionales', payload, 'POST');
    if (ok !== null) creadas++;
  }

  toast(`${creadas} liquidaciones creadas`, false, true);
  await cobCargarLiq();
  cobRenderLiqPendientes();
}

function cobLiqRenderHistorial() {
  const filtro = document.getElementById('cob-liq-filtro-pro')?.value || '';
  const tbody = document.getElementById('cob-liq-tbody');
  const empty = document.getElementById('cob-liq-empty');
  const hist = COB.liquidaciones.filter(l => l.estado === 'Pagado' && (!filtro || l.id_profesional === filtro));

  if (!hist.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = hist.map(l => {
    const pro = l.profesionales || {};
    const nombre = `${pro.nombre || ''} ${pro.apellidos || ''}`.trim() || l.id_profesional;
    const pagado = cobFmt(l.importe_acordado || l.importe_calculado);
    return `<tr>
      <td>${cobFmtFecha(l.periodo_desde)} – ${cobFmtFecha(l.periodo_hasta)}</td>
      <td>${nombre}</td>
      <td style="text-align:right">${l.sesiones_calculadas || '—'}</td>
      <td style="text-align:right">${cobFmt(l.importe_calculado)}</td>
      <td style="text-align:right">${pagado}</td>
      <td>${l.medio_pago ? cobBadge(l.medio_pago === 'Efectivo' ? 'Cobro paciente' : 'Pago profesional').replace(/>[^<]+</, `>${l.medio_pago}<`) : '—'}</td>
      <td><span class="cob-badge cob-badge-ok">Pagado</span></td>
      <td></td>
    </tr>`;
  }).join('');
}

function cobRenderLiqPendientes() {
  const cont = document.getElementById('cob-liq-pendientes');
  const pend = COB.liquidaciones.filter(l => l.estado === 'Pendiente');
  if (!pend.length) { cont.innerHTML = '<p style="font-size:13px;color:var(--ink-muted);margin-bottom:12px">No hay liquidaciones pendientes.</p>'; return; }

  cont.innerHTML = pend.map(l => {
    const pro = l.profesionales || {};
    const nombre = `${pro.nombre || ''} ${pro.apellidos || ''}`.trim() || l.id_profesional;
    const iniciales = nombre.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    return `<div class="cob-liq-card">
      <div class="cob-liq-header">
        <div class="cob-liq-avatar">${iniciales}</div>
        <div>
          <div class="cob-liq-nombre">${nombre}</div>
          <div class="cob-liq-periodo">${cobFmtFecha(l.periodo_desde)} – ${cobFmtFecha(l.periodo_hasta)}</div>
        </div>
        <div style="margin-left:auto"><span class="cob-badge cob-badge-pend">Pendiente</span></div>
      </div>
      <div class="cob-liq-body">
        <div class="cob-liq-dato">Importe bruto<span>${cobFmt(l.importe_calculado / ((pro.porcentaje_reparto || 60)/100))}</span></div>
        <div class="cob-liq-dato">Porcentaje<span>${pro.porcentaje_reparto || 60}%</span></div>
        <div class="cob-liq-dato">A pagar<span style="color:#b45309">${cobFmt(l.importe_calculado)}</span></div>
      </div>
      <div class="cob-liq-footer">
        <button class="btn-sec" style="font-size:12px" onclick="cobLiqVerDetalle('${l.id}')">
          <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;display:inline;vertical-align:-1px;margin-right:4px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Ver detalle
        </button>
        <button class="btn-primary" style="font-size:12px" onclick="cobLiqRegistrarPago('${l.id}')">
          <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;display:inline;vertical-align:-1px;margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg>Registrar pago
        </button>
      </div>
    </div>`;
  }).join('');
}

function cobLiqRegistrarPago(id) {
  const l = COB.liquidaciones.find(x => x.id === id);
  if (!l) return;
  const html = `<div style="padding:20px">
    <div style="font-size:15px;font-weight:600;margin-bottom:14px">Registrar pago de liquidación</div>
    <div style="background:var(--cream);border-radius:8px;padding:10px 12px;margin-bottom:14px">
      <div style="font-size:12px;color:var(--ink-muted)">Importe a pagar</div>
      <div style="font-size:20px;font-weight:700">${cobFmt(l.importe_calculado)}</div>
    </div>
    <div style="margin-bottom:10px">
      <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">IMPORTE ACORDADO (€)</label>
      <input type="number" id="liq-pago-imp" value="${l.importe_calculado}" step="0.01" style="width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">
      <div style="font-size:11px;color:var(--ink-muted);margin-top:3px">Modifica si hay ajuste pactado</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">MEDIO DE PAGO</label>
        <select id="liq-pago-medio" style="width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">
          <option value="Efectivo">Efectivo</option>
          <option value="Transferencia">Transferencia</option>
        </select>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">FECHA DE PAGO</label>
        <input type="date" id="liq-pago-fecha" value="${new Date().toISOString().slice(0,10)}" style="width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn-sec" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" onclick="cobLiqConfirmarPago('${id}')">Confirmar pago</button>
    </div>
  </div>`;
  abrirModal(html);
}

async function cobLiqConfirmarPago(id) {
  const importe  = parseFloat(document.getElementById('liq-pago-imp').value);
  const medio    = document.getElementById('liq-pago-medio').value;
  const fecha    = document.getElementById('liq-pago-fecha').value;
  if (isNaN(importe) || !fecha) { toast('Datos incompletos', true); return; }

  const payload = {
    estado: 'Pagado',
    importe_acordado: importe,
    medio_pago: medio,
    fecha_pago: fecha
  };
  const ok = await sp(`liquidaciones_profesionales?id=eq.${id}`, payload, 'PATCH');
  if (ok !== null) {
    // Si es efectivo, registrar salida en caja automáticamente
    if (medio === 'Efectivo') {
      const liq = COB.liquidaciones.find(l => l.id === id);
      const pro = liq?.profesionales || {};
      const nombre = `${pro.nombre || ''} ${pro.apellidos || ''}`.trim() || liq?.id_profesional || '';
      const cajaPay = {
        id: 'CAJ-' + Date.now().toString(36).toUpperCase(),
        fecha,
        concepto: `Liquidación ${nombre} — ${cobFmtFecha(liq?.periodo_desde)} a ${cobFmtFecha(liq?.periodo_hasta)}`,
        importe: -Math.abs(importe),
        categoria: 'Pago profesional',
        id_liquidacion: id
      };
      await sp('movimientos_caja', cajaPay, 'POST');
    }
    cerrarModal();
    toast('Pago registrado', false, true);
    await cobCargarLiq();
    await cobCargarCaja();
    cobRenderLiqPendientes();
    cobActualizarKpisLiq();
    cobLiqRenderHistorial();
  }
}

function cobLiqVerDetalle(id) {
  const l = COB.liquidaciones.find(x => x.id === id);
  if (!l) return;
  const pro = l.profesionales || {};
  const nombre = `${pro.nombre || ''} ${pro.apellidos || ''}`.trim() || l.id_profesional;
  const html = `<div style="padding:20px">
    <div style="font-size:15px;font-weight:600;margin-bottom:14px">Detalle de liquidación</div>
    <div style="background:var(--cream);border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-weight:600">${nombre}</div>
      <div style="font-size:12px;color:var(--ink-muted)">${cobFmtFecha(l.periodo_desde)} – ${cobFmtFecha(l.periodo_hasta)}</div>
    </div>
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <tr><td style="padding:5px 0;color:var(--ink-muted)">Importe bruto calculado</td><td style="text-align:right;font-weight:600">${cobFmt(l.importe_calculado / ((pro.porcentaje_reparto||60)/100))}</td></tr>
      <tr><td style="padding:5px 0;color:var(--ink-muted)">Porcentaje aplicado</td><td style="text-align:right">${pro.porcentaje_reparto || 60}%</td></tr>
      <tr style="border-top:1px solid var(--border)"><td style="padding:8px 0 5px;font-weight:600">A pagar</td><td style="text-align:right;font-weight:700;font-size:16px;color:#b45309">${cobFmt(l.importe_calculado)}</td></tr>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-top:16px">
      <button class="btn-sec" onclick="cerrarModal()">Cerrar</button>
    </div>
  </div>`;
  abrirModal(html);
}

/* ═══════════════════════════════════════════
   FISCALIDAD — ESTADO
═══════════════════════════════════════════ */
const FISC = {
  ejercicio: 2026,
  trimActivo130: 1,        // trimestre seleccionado en panel 130
  gastos: [],              // cache gastos_reales cargados
  ingresos: [],            // cache cobros_v2 cargados
  datos130: {},            // cache irpf_130 por trimestre {1:{…}, 2:{…}, …}
  gasEditandoId: null,     // id del gasto en edición (null = nuevo)
  costesFijos: []          // cache costes_fijos activos (partidas presupuestarias)
};

const FISC_CATS = ['Alquiler','Cuota autónomo','Suministros','Material clínico','Seguros','Servicios profesionales','Otros'];

// Retención Adecco
const TIPO_RETENCION = 0.15;

