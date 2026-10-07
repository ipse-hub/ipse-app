const COB = {
  tabActiva: 'banco',
  // banco
  movimientos: [],       // todos los movimientos_banco
  movFiltrados: [],      // tras aplicar filtros
  movPagina: 1,
  movPorPagina: 25,
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
    'Traspaso efectivo':['cob-badge-tras','Traspaso efectivo'],
    'Arqueo':           ['cob-badge-ok','Arqueo'],
  };
  const [cls, lbl] = map[cat] || ['cob-badge-desc', cat || 'Sin clasificar'];
  return `<span class="cob-badge ${cls}">${lbl}</span>`;
}
/* PATCH real (sp() es solo POST). Devuelve true si OK, null si falla. */
async function cobPatch(path, body) {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${G.sesion.access_token}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      toast('Error al guardar: ' + (t || res.status), true);
      return null;
    }
    const rows = await res.json().catch(() => []);
    if (Array.isArray(rows) && rows.length === 0) {
      toast('No se actualizó ninguna fila (¿permisos?)', true);
      return null;
    }
    return true;
  } catch (e) {
    toast('Error de red al guardar', true);
    return null;
  }
}

/* ── Modal propio de Cobros (index.html no define abrirModal/cerrarModal) ── */
function cobAbrirModal(html) {
  let ov = document.getElementById('cob-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'cob-overlay';
    ov.className = 'overlay';
    ov.onclick = e => { if (e.target === ov) cobCerrarModal(); };
    ov.innerHTML = '<div class="modal" id="cob-modal" style="width:480px"></div>';
    document.body.appendChild(ov);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cobCerrarModal(); });
  }
  document.getElementById('cob-modal').innerHTML = html;
  ov.classList.add('open');
}
function cobCerrarModal() {
  const ov = document.getElementById('cob-overlay');
  if (ov) ov.classList.remove('open');
}

const COB_CAT_META = {
  'Cobro paciente':    { lbl: 'Cobro paciente',    color: '#5b21b6' },
  'Pago profesional':  { lbl: 'Pago profesional',  color: '#1e40af' },
  'Gasto clinica':     { lbl: 'Gasto clínica',     color: '#b45309' },
  'Personal':          { lbl: 'Personal',          color: '#9d174d' },
  'Traspaso efectivo': { lbl: 'Traspaso efectivo', color: '#0f766e' },
  'Sin clasificar':    { lbl: 'Sin clasificar',    color: '#6B7490' },
};
function cobEsc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/* orden estable de movimientos: fecha desc y, dentro del día, el orden del extracto (más reciente primero) */
function cobSeq(m) { const r = /-(\d{4})-/.exec(m.id || ''); return r ? Number(r[1]) : 0; }
function cobOrdenBanco(a, b) {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
  return cobSeq(a) - cobSeq(b);
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
  if (tab === 'caja' && typeof cobRenderPanelCaja === 'function') cobRenderPanelCaja();
}

/* ══════════════════════════════════════════
   PESTAÑA BANCO
══════════════════════════════════════════ */
async function cobCargarBanco() {
  const res = await sg('movimientos_banco?select=*&order=fecha.desc&limit=2000');
  COB.movimientos = (res || []).sort(cobOrdenBanco);
  cobPoblarFiltroMes();
  cobRefrescarBanco();
}

/* Repinta todo lo que depende de los movimientos de banco */
function cobRefrescarBanco() {
  cobActualizarKpisBanco();
  cobRenderChipsBanco();
  cobFiltrarBanco();
  cobRenderPendientes();
  if (typeof cobRenderPanelCaja === 'function') cobRenderPanelCaja();
}

/* Cabecera: saldo + evolución + resumen del mes */
function cobActualizarKpisBanco() {
  const hero = document.getElementById('cob-hero');
  const mesCard = document.getElementById('cob-mes-card');
  if (!hero || !mesCard) return;
  const movs = [...COB.movimientos].sort(cobOrdenBanco);
  if (!movs.length) {
    hero.innerHTML = '<div class="cobx-empty">Importa un extracto para ver el saldo y su evolución.</div>';
    mesCard.innerHTML = '';
    return;
  }
  const ult = movs[0];
  const saldo = Number(ult.saldo);

  // cierre diario: el primer movimiento de cada día (orden desc) lleva el saldo de cierre
  const cierre = {};
  movs.forEach(m => { if (m.saldo != null && !(m.fecha in cierre)) cierre[m.fecha] = Number(m.saldo); });
  const dias = Object.keys(cierre).sort().slice(-45);
  const pts = dias.map(d => ({ d, v: cierre[d] }));

  let spark = '';
  let delta = '';
  if (pts.length >= 2) {
    const t0 = new Date(pts[0].d + 'T00:00:00').getTime();
    const t1 = new Date(pts[pts.length - 1].d + 'T00:00:00').getTime();
    const vals = pts.map(p => p.v);
    const vmin = Math.min(...vals), vmax = Math.max(...vals);
    const W = 600, H = 72, pad = 6;
    const X = p => (t1 === t0 ? 0 : ((new Date(p.d + 'T00:00:00').getTime() - t0) / (t1 - t0)) * W);
    const Y = v => (vmax === vmin ? H / 2 : H - pad - ((v - vmin) / (vmax - vmin)) * (H - 2 * pad));
    // línea en escalón: el saldo se mantiene hasta el siguiente movimiento
    let path = `M${X(pts[0]).toFixed(1)},${Y(pts[0].v).toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      path += ` L${X(pts[i]).toFixed(1)},${Y(pts[i - 1].v).toFixed(1)} L${X(pts[i]).toFixed(1)},${Y(pts[i].v).toFixed(1)}`;
    }
    const area = path + ` L${W},${H} L0,${H} Z`;
    const rects = pts.map((p, i) => {
      const x0 = i === 0 ? 0 : (X(pts[i - 1]) + X(p)) / 2;
      const x1 = i === pts.length - 1 ? W : (X(p) + X(pts[i + 1])) / 2;
      return `<rect x="${x0.toFixed(1)}" y="0" width="${Math.max(x1 - x0, 1).toFixed(1)}" height="${H}" fill="transparent"><title>${cobFmtFecha(p.d)}: ${cobFmt(p.v)}</title></rect>`;
    }).join('');
    spark = `<div class="cobx-spark"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Evolución del saldo">
      <path d="${area}" fill="var(--azul)" opacity=".08"/>
      <path d="${path}" fill="none" stroke="var(--azul)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      ${rects}</svg>
      <div class="cobx-spark-x"><span>${cobFmtFecha(pts[0].d)}</span><span>${cobFmtFecha(pts[pts.length - 1].d)}</span></div></div>`;
    const d = saldo - pts[0].v;
    delta = `<div class="cobx-delta ${d >= 0 ? 'pos' : 'neg'}">${d >= 0 ? '▲ +' : '▼ '}${cobFmt(d)} desde el ${cobFmtFecha(pts[0].d)}</div>`;
  }

  const mes = ult.fecha.slice(0, 7);
  const delMes = movs.filter(m => (m.fecha || '').startsWith(mes));
  const cobrado = delMes.filter(m => m.categoria === 'Cobro paciente' && Number(m.importe) > 0)
    .reduce((s, m) => s + Number(m.importe), 0);
  const sinClas = movs.filter(m => (m.categoria || 'Sin clasificar') === 'Sin clasificar').length;

  hero.innerHTML = `<div class="cobx-hero-row">
      <div><div class="cobx-lbl">Saldo cuenta</div><div class="cobx-saldo">${cobFmt(saldo)}</div>${delta}</div>
      <div class="cobx-kpis">
        <div>Cobrado en el mes<b class="pos">${cobFmt(cobrado)}</b></div>
        <div>Sin clasificar<b ${sinClas ? 'style="color:#b45309"' : ''}>${sinClas}</b></div>
        <div>Último movimiento<b>${cobFmtFecha(ult.fecha)}</b></div>
      </div></div>${spark}`;

  // resumen del mes (mes del último movimiento): actividad de la clínica separada de personal/traspasos
  const NO_CLINICA = ['Personal', 'Traspaso efectivo'];
  const porCat = (signo, filtro) => {
    const acc = {};
    delMes.filter(m => Math.sign(Number(m.importe)) === signo && filtro(m.categoria || 'Sin clasificar')).forEach(m => {
      const c = m.categoria || 'Sin clasificar';
      acc[c] = (acc[c] || 0) + Math.abs(Number(m.importe));
    });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  };
  const suma = l => l.reduce((s, [, v]) => s + v, 0);
  const bloque = (titulo, lista, clsTotal) => {
    const total = suma(lista);
    if (!total) return `<div class="cobx-mes-row"><div class="t"><span>${titulo}</span><b>${cobFmt(0)}</b></div><div class="cobx-bar"></div></div>`;
    const meta = c => COB_CAT_META[c] || COB_CAT_META['Sin clasificar'];
    const bar = lista.map(([c, v]) => `<i style="width:${(v / total * 100).toFixed(1)}%;background:${meta(c).color}" title="${meta(c).lbl}: ${cobFmt(v)}"></i>`).join('');
    const leg = lista.map(([c, v]) => `<span><em style="background:${meta(c).color}"></em>${meta(c).lbl} ${cobFmt(v)}</span>`).join('');
    return `<div class="cobx-mes-row"><div class="t"><span>${titulo}</span><b class="${clsTotal}">${cobFmt(total)}</b></div><div class="cobx-bar">${bar}</div><div class="cobx-leg">${leg}</div></div>`;
  };
  const esClinica = c => !NO_CLINICA.includes(c);
  const ent = porCat(1, esClinica), sal = porCat(-1, esClinica);
  const neto = suma(ent) - suma(sal);
  const persEnt = suma(porCat(1, c => NO_CLINICA.includes(c)));
  const persSal = suma(porCat(-1, c => NO_CLINICA.includes(c)));
  const [y, mo] = mes.split('-');
  const etiqueta = new Date(y, mo - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  mesCard.innerHTML = `<div class="cobx-mes-head"><span class="cobx-lbl">Clínica · ${etiqueta}</span><span style="font-size:11px;color:var(--ink-muted)">${delMes.length} mov.</span></div>
    ${bloque('Entradas', ent, 'cob-pos')}${bloque('Salidas', sal, 'cob-neg')}
    <div class="cobx-neto"><span>Neto clínica</span><b class="${neto >= 0 ? 'cob-pos' : 'cob-neg'}">${neto >= 0 ? '+' : ''}${cobFmt(neto)}</b></div>
    <div style="font-size:11px;color:var(--ink-muted);margin-top:6px">Personal y traspasos (fuera de la clínica): +${cobFmt(persEnt)} / −${cobFmt(persSal)}</div>`;

  const hint = document.getElementById('cob-upload-hint');
  if (hint) hint.textContent = (COB._ultImport ? COB._ultImport + ' · ' : '') + `${movs.length} movimientos · hasta ${cobFmtFecha(ult.fecha)}`;
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

function cobRenderChipsBanco() {
  const cont = document.getElementById('cob-fchips');
  if (!cont) return;
  const sel = document.getElementById('cob-filtro-cat');
  const activa = sel ? sel.value : '';
  const defs = [['', 'Todos'], ['Cobro paciente', 'Cobros'], ['Gasto clinica', 'Gasto clínica'],
                ['Pago profesional', 'Profesionales'], ['Personal', 'Personal'],
                ['Traspaso efectivo', 'Traspasos'], ['Sin clasificar', 'Sin clasificar']];
  cont.innerHTML = defs.map(([v, lbl]) => {
    const n = v ? COB.movimientos.filter(m => (m.categoria || 'Sin clasificar') === v).length : COB.movimientos.length;
    if (v && !n && v !== activa) return '';
    return `<button class="cobx-fc ${v === activa ? 'on' : ''}" onclick="cobSetCatBanco('${v}')">${lbl}<small>${n}</small></button>`;
  }).join('');
}
function cobSetCatBanco(v) {
  const sel = document.getElementById('cob-filtro-cat');
  if (sel) sel.value = v;
  cobFiltrarBanco();
  cobRenderChipsBanco();
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
        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${cobEsc((m.concepto||'')+' '+(m.movimiento||''))}">${cobEsc(m.concepto) || '—'}<br><span style="font-size:11px;color:var(--ink-muted)">${cobEsc(m.movimiento)}</span></td>
        <td class="cobx-row-click" onclick="cobEditarMovimiento('${m.id}')" title="Cambiar categoría">${cobBadge(cat)}</td>
        <td style="text-align:right">${impHtml}</td>
        <td style="text-align:right;color:var(--ink-muted)">${m.saldo != null ? cobFmt(m.saldo) : '—'}</td>
        <td>${cobBadgeEstado(estado)}</td>
        <td><button class="cobx-ico" onclick="cobEditarMovimiento('${m.id}')" title="Clasificar"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>
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

function cobPendientesBanco() {
  return COB.movimientos.filter(m => (m.categoria || 'Sin clasificar') === 'Sin clasificar').sort(cobOrdenBanco);
}

function cobRenderPendientes() {
  const section = document.getElementById('cob-sin-conciliar-section');
  const lista = document.getElementById('cob-conc-lista');
  if (!section || !lista) return;
  const pend = cobPendientesBanco();

  if (!pend.length) {
    COB._triTotal = 0;
    COB.triIdx = 0;
    if (!COB.movimientos.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    document.getElementById('cob-sinconc-count').textContent = '';
    lista.innerHTML = `<div class="cobx-ok">✓ Todo clasificado${COB._ultimo ? ` <button class="cobx-undo" onclick="cobTriDeshacer()">Deshacer el último</button>` : ''}</div>`;
    return;
  }

  COB._triTotal = Math.max(COB._triTotal || 0, pend.length);
  COB.triIdx = Math.min(Math.max(COB.triIdx || 0, 0), pend.length - 1);
  const m = pend[COB.triIdx];
  const imp = Number(m.importe);
  const cats = imp > 0
    ? ['Cobro paciente', 'Personal', 'Traspaso efectivo']
    : ['Gasto clinica', 'Pago profesional', 'Personal', 'Traspaso efectivo'];
  const chips = cats.map((c, i) =>
    `<button class="cobx-chip" style="--c:${COB_CAT_META[c].color}" onclick="cobTriClasificar('${m.id}','${c}')"><kbd>${i + 1}</kbd>${COB_CAT_META[c].lbl}</button>`
  ).join('');
  const hechos = COB._triTotal - pend.length;
  const undo = COB._ultimo
    ? `<span>Último: ${cobEsc(COB._ultimo.lbl)} <button class="cobx-undo" onclick="cobTriDeshacer()">Deshacer</button></span>` : '';

  section.style.display = 'block';
  document.getElementById('cob-sinconc-count').textContent = `${COB.triIdx + 1} de ${pend.length}`;
  lista.innerHTML = `<div class="cobx-tri-body">
      <div>
        <div class="cobx-tri-fecha">${cobFmtFecha(m.fecha)}</div>
        <div class="cobx-tri-text">${cobEsc(m.movimiento) || cobEsc(m.concepto)}</div>
        <div class="cobx-tri-sub">${cobEsc(m.concepto)}</div>
      </div>
      <div class="cobx-tri-imp ${imp >= 0 ? 'pos' : 'neg'}">${imp >= 0 ? '+' : ''}${cobFmt(imp)}</div>
    </div>
    <div class="cobx-chips">${chips}</div>
    <div class="cobx-tri-foot"><div class="cobx-prog"><i style="width:${(hechos / COB._triTotal * 100).toFixed(0)}%"></i></div><span>Atajos: teclas 1–${cats.length}</span>${undo}</div>`;
}

function cobTriNav(d) {
  const n = cobPendientesBanco().length;
  if (!n) return;
  COB.triIdx = ((COB.triIdx || 0) + d + n) % n;
  cobRenderPendientes();
}

async function cobTriClasificar(id, cat) {
  if (COB._triBusy) return;
  const m = COB.movimientos.find(x => x.id === id);
  if (!m) return;
  COB._triBusy = true;
  try {
    const prev = m.categoria || 'Sin clasificar';
    const ok = await cobPatch(`movimientos_banco?id=eq.${id}`, { categoria: cat });
    if (ok !== null) {
      m.categoria = cat;
      COB._ultimo = { id, prev, lbl: `${(m.movimiento || m.concepto || '').slice(0, 28)} → ${COB_CAT_META[cat].lbl}` };
      cobRefrescarBanco();
    }
  } finally { COB._triBusy = false; }
}

async function cobTriDeshacer() {
  const u = COB._ultimo;
  if (!u) return;
  const m = COB.movimientos.find(x => x.id === u.id);
  if (!m) return;
  const ok = await cobPatch(`movimientos_banco?id=eq.${u.id}`, { categoria: u.prev });
  if (ok !== null) {
    m.categoria = u.prev;
    COB._ultimo = null;
    // volver a mostrar justo ese movimiento
    const i = cobPendientesBanco().findIndex(x => x.id === u.id);
    if (i >= 0) COB.triIdx = i;
    cobRefrescarBanco();
  }
}

/* Atajos de teclado 1–4 para clasificar el pendiente visible */
if (!window._cobKeys) {
  window._cobKeys = true;
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
    const ov = document.getElementById('cob-overlay');
    if (ov && ov.classList.contains('open')) return;
    const lista = document.getElementById('cob-conc-lista');
    if (!lista || lista.offsetParent === null) return;
    const n = parseInt(e.key, 10);
    if (!(n >= 1 && n <= 9)) return;
    const btn = lista.querySelectorAll('.cobx-chip')[n - 1];
    if (btn) { e.preventDefault(); btn.click(); }
  });
}

function cobEditarMovimiento(id) {
  const m = COB.movimientos.find(x => x.id === id);
  if (!m) return;
  // Reutilizar el modal de clasificación mostrando el movimiento
  cobAbrirModalClasificar(m);
}

function cobAbrirModalClasificar(m) {
  const imp = Number(m.importe);
  const cats = ['Cobro paciente', 'Pago profesional', 'Gasto clinica', 'Traspaso efectivo', 'Personal', 'Sin clasificar'];
  const catOpts = cats.map(c =>
    `<option value="${c}" ${m.categoria === c ? 'selected' : ''}>${c === 'Gasto clinica' ? 'Gasto clínica' : c}</option>`
  ).join('');
  const html = `<div style="padding:20px">
    <div style="font-size:15px;font-weight:600;margin-bottom:12px">Clasificar movimiento</div>
    <div style="background:var(--cream);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:13px">
      <div style="color:var(--ink-muted);font-size:11px">${cobFmtFecha(m.fecha)}</div>
      <div style="font-weight:600">${cobEsc(m.concepto)}</div>
      <div style="color:var(--ink-muted)">${cobEsc(m.movimiento)}</div>
      <div style="font-weight:700;margin-top:4px;font-size:15px">${imp >= 0 ? '<span class="cob-pos">+' + cobFmt(imp) + '</span>' : '<span class="cob-neg">' + cobFmt(imp) + '</span>'}</div>
    </div>
    <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">CATEGORÍA</label>
    <select id="cob-modal-cat" style="width:100%;margin-top:4px;margin-bottom:12px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">${catOpts}</select>
    <label style="font-size:12px;font-weight:600;color:var(--ink-muted)">NOTAS (opcional)</label>
    <input id="cob-modal-notas" type="text" value="${cobEsc(m.notas)}" style="width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px">
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
      <button class="btn btn-sec" onclick="cobCerrarModal()">Cancelar</button>
      <button class="btn btn-pri" onclick="cobGuardarModalClasif('${m.id}')">Guardar</button>
    </div>
  </div>`;
  cobAbrirModal(html);
}

async function cobGuardarModalClasif(id) {
  const cat = document.getElementById('cob-modal-cat').value;
  const notas = document.getElementById('cob-modal-notas').value;
  const ok = await cobPatch(`movimientos_banco?id=eq.${id}`, { categoria: cat, notas });
  if (ok !== null) {
    const m = COB.movimientos.find(x => x.id === id);
    if (m) { m.categoria = cat; m.notas = notas; }
    cobCerrarModal();
    toast('Guardado', false, true);
    cobRefrescarBanco();
  }
}

/* ── IMPORTAR EXTRACTO BBVA ── */
/* ── AUTOCLASIFICACIÓN ── */
function cobAutoClasificar(concepto, movimiento, importe) {
  const c = (concepto + ' ' + movimiento).toLowerCase();
  const imp = Number(importe);

  // Efectivo ↔ banco (cajero / ingreso en ventanilla): no es ingreso ni gasto, es traspaso con la caja
  if (c.includes('ret. efectivo') || c.includes('reintegro') && c.includes('cajero') ||
      c.includes('ingreso en efectivo') || c.includes('ingreso efectivo') || c.includes('ing. efectivo') ||
      c.includes('ingreso cajero')) {
    return 'Traspaso efectivo';
  }
  // Bizum recibido que NO es de paciente (casting, matrícula…) → personal
  if (c.includes('bizum') && imp > 0 && (c.includes('casting') || c.includes('matricula') || c.includes('matrícula'))) {
    return 'Personal';
  }
  // Cobros de pacientes — Bizum recibido
  if (c.includes('bizum') && (c.includes('recibido') || imp > 0)) {
    if (!c.includes('enviado')) return 'Cobro paciente';
  }
  // Transferencia recibida citando nº de factura (061/2026, 062 2026…) → cobro de factura
  if (imp > 0 && c.includes('transferencia recibida') && /\b\d{3}\s*\/?\s*20\d{2}\b/.test(c)) {
    return 'Cobro paciente';
  }
  // Pagos a profesionales — keywords de liquidación y traspasos a cuenta "Bono …"
  if ((c.includes('pago psico') || c.includes('pago logo') || c.includes('pago logp') ||
       c.includes('pago pedago') || c.includes('pago to ') || c.includes('pago nomina') ||
       c.includes('liquidacion') || c.includes('liquidación') ||
       c.includes('pago mensualidad') && (c.includes('psicolog') || c.includes('pedagog') || c.includes('logoped') || c.includes('terapia')))) {
    return 'Pago profesional';
  }
  if (imp < 0 && c.includes('traspaso a cuenta') && /\bbonos?\b/.test(c)) {
    return 'Pago profesional';
  }
  // Gastos de clínica
  if (c.includes('seguridad social') || c.includes('tgss') || c.includes('autónomo') ||
      c.includes('autonomo') || c.includes('emasagra') || c.includes('repsol') ||
      c.includes('o2 fibra') || c.includes('o2 movil') || c.includes('telefonica') ||
      c.includes('alquiler') || c.includes('mutua') || c.includes('colegial') ||
      c.includes('securitas') || c.includes('neuronup') || c.includes('proteccion de datos') ||
      c.includes('protección de datos') || c.includes('prestamo clinica') || c.includes('préstamo clínica')) {
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
  // Traspasos desde/hacia la cuenta personal → personal
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
      const ok = await cobPatch(`movimientos_banco?id=eq.${m.id}`, { categoria: cat });
      if (ok !== null) { m.categoria = cat; actualizados++; }
    }
  }
  toast(`${actualizados} movimientos clasificados automáticamente`, false, true);
  cobRefrescarBanco();
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

      // Clave determinista: evita duplicados al reimportar extractos solapados
      const clave = [fecha, importe.toFixed(2), saldo != null && !isNaN(saldo) ? saldo.toFixed(2) : '',
                     movimiento.toLowerCase()].join('|');

      const categoria = cobAutoClasificar(concepto, movimiento, importe);
      nuevos.push({ id, fecha, concepto, movimiento, importe, saldo, categoria, origen: 'Importado', clave });
    }

    if (!nuevos.length) { toast('No se encontraron movimientos válidos', true); return; }

    let insertados = 0, fallidos = 0;
    const CHUNK = 50;
    for (let i = 0; i < nuevos.length; i += CHUNK) {
      const chunk = nuevos.slice(i, i + CHUNK);
      const res = await fetch(`${SUPA_URL}/rest/v1/movimientos_banco?on_conflict=clave&select=id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${G.sesion.access_token}`,
          // ignore-duplicates + representation: devuelve solo las filas realmente insertadas
          'Prefer': 'resolution=ignore-duplicates,return=representation'
        },
        body: JSON.stringify(chunk)
      });
      if (res.ok) {
        const ins = await res.json().catch(() => []);
        insertados += Array.isArray(ins) ? ins.length : 0;
      } else {
        fallidos += chunk.length;
      }
    }
    const duplicados = nuevos.length - insertados - fallidos;

    COB._ultImport = `Importado ${new Date().toLocaleDateString('es-ES')}: ${insertados} nuevos, ${duplicados} ya existentes` +
      (fallidos ? `, ${fallidos} con error` : '');
    toast(`Extracto: ${insertados} nuevos, ${duplicados} duplicados omitidos` + (fallidos ? `, ${fallidos} con error` : ''),
          fallidos > 0, fallidos === 0);
    await cobCargarBanco();
  } catch(e) {
    console.error(e);
    toast('Error procesando el extracto: ' + e.message, true);
  }
}

/* ══════════════════════════════════════════
   PESTAÑA CAJA
══════════════════════════════════════════ */
/* Utilidades caja */
function cobHoy() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function cobEsc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function cobIdCaja() {
  return 'CAJ-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
}
const COB_CAJA_CATS = ['Cobro paciente', 'Pago profesional', 'Gasto clinica', 'Traspaso efectivo', 'Arqueo', 'Personal', 'Sin clasificar'];
const COB_CAJA_INPUT = 'width:100%;margin-top:4px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px';
const COB_CAJA_LBL = 'font-size:12px;font-weight:600;color:var(--ink-muted)';

function cobCajaOrdenKey(m) { return (m.fecha || '') + '|' + (m.created_at || '') + '|' + (m.id || ''); }

async function cobCargarCaja() {
  const res = await sg('movimientos_caja?select=*&order=fecha.desc&limit=2000');
  COB.cajaMov = res || [];
  cobActualizarSaldoCaja();
  cobPoblarFiltroMesCaja();
  cobPoblarFiltroCatCaja();
  cobFiltrarCaja();
  cobRenderPanelCaja();
}

function cobSaldoCajaA(fechaMax) {
  return COB.cajaMov
    .filter(m => !fechaMax || (m.fecha || '') <= fechaMax)
    .reduce((s, m) => s + Number(m.importe), 0);
}

function cobActualizarSaldoCaja() {
  const saldo = COB.cajaMov.reduce((s, m) => s + Number(m.importe), 0);
  const el = document.getElementById('cob-caja-saldo');
  if (!el) return;
  el.textContent = cobFmt(saldo);
  el.className = 'cob-saldo-val ' + (saldo >= -0.005 ? 'green' : 'red');
}

function cobPoblarFiltroMesCaja() {
  const meses = [...new Set(COB.cajaMov.map(m => m.fecha ? m.fecha.slice(0,7) : null).filter(Boolean))].sort().reverse();
  const sel = document.getElementById('cob-caja-filtro-mes');
  if (!sel) return;
  const actual = sel.value;
  sel.innerHTML = '<option value="">Todos los meses</option>' +
    meses.map(m => {
      const [y, mo] = m.split('-');
      const label = new Date(y, mo - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      return `<option value="${m}">${label}</option>`;
    }).join('');
  if (actual) sel.value = actual;
}

function cobPoblarFiltroCatCaja() {
  const sel = document.getElementById('cob-caja-filtro-cat');
  if (!sel) return;
  const actual = sel.value;
  sel.innerHTML = '<option value="">Todas las categorías</option>' +
    COB_CAJA_CATS.map(c => `<option value="${c}">${c === 'Gasto clinica' ? 'Gasto clínica' : c}</option>`).join('');
  if (actual) sel.value = actual;
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
  if (!tbody || !empty) return;
  if (!movs.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  // Saldo acumulado sobre TODOS los movimientos (no solo los filtrados)
  const asc = [...COB.cajaMov].sort((a, b) => cobCajaOrdenKey(a).localeCompare(cobCajaOrdenKey(b)));
  const saldoPorId = {};
  let acum = 0;
  asc.forEach(m => { acum += Number(m.importe); saldoPorId[m.id] = acum; });
  const ordenados = [...movs].sort((a, b) => cobCajaOrdenKey(b).localeCompare(cobCajaOrdenKey(a)));

  tbody.innerHTML = ordenados.map(m => {
    const imp = Number(m.importe);
    const impHtml = imp >= 0
      ? `<span class="cob-pos">+${cobFmt(imp)}</span>`
      : `<span class="cob-neg">${cobFmt(imp)}</span>`;
    const ref = m.id_cobro || m.id_liquidacion || '—';
    return `<tr>
      <td>${cobFmtFecha(m.fecha)}</td>
      <td>${cobEsc(m.concepto) || '—'}</td>
      <td>${cobBadge(m.categoria || 'Sin clasificar')}</td>
      <td style="color:var(--ink-muted);font-size:12px">${cobEsc(ref)}</td>
      <td style="text-align:right">${impHtml}</td>
      <td style="text-align:right;color:var(--ink-muted)">${cobFmt(saldoPorId[m.id])}</td>
      <td><button class="cobx-ico" onclick="cobEditarCaja('${m.id}')" title="Editar"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>
    </tr>`;
  }).join('');
}

/* ── Panel de control de caja: saldo, arqueo, alertas, acciones ── */
function cobRenderPanelCaja() {
  const sub = document.getElementById('cob-caja-sub');
  const box = document.getElementById('cob-caja-alertas');
  if (!sub || !box) return;

  const saldo = cobSaldoCajaA(null);
  const arqueos = COB.cajaMov.filter(m => m.categoria === 'Arqueo').map(m => m.fecha).sort();
  const ultArq = arqueos.length ? arqueos[arqueos.length - 1] : null;
  const dias = ultArq ? Math.floor((new Date(cobHoy() + 'T00:00:00') - new Date(ultArq + 'T00:00:00')) / 86400000) : null;
  sub.textContent = ultArq ? `Último arqueo: ${cobFmtFecha(ultArq)} (hace ${dias} d)` : 'Sin arqueos todavía';

  const alertas = [];
  if (saldo < -0.005) alertas.push(['err', `Saldo teórico negativo (${cobFmt(saldo)}): falta registrar una entrada (retirada de banco, cobro) o hay una salida errónea.`]);
  if (ultArq == null) alertas.push(['warn', 'Todavía no hay ningún arqueo. Cuenta el efectivo y regístralo para fijar el saldo real.']);
  else if (dias > 7) alertas.push(['warn', `Último arqueo hace ${dias} días (${cobFmtFecha(ultArq)}). El control es semanal.`]);
  const sinClas = COB.cajaMov.filter(m => (m.categoria || 'Sin clasificar') === 'Sin clasificar').length;
  if (sinClas) alertas.push(['warn', `${sinClas} movimiento(s) de caja sin clasificar.`]);
  const cajaTrasSinBanco = COB.cajaMov.filter(m => m.categoria === 'Traspaso efectivo' && !/Banco:\s*MOV-/.test(m.notas || ''));
  if (cajaTrasSinBanco.length) alertas.push(['info', `${cajaTrasSinBanco.length} traspaso(s) en caja aún sin movimiento de banco vinculado (¿extracto pendiente de importar?).`]);
  const bancoTrasSinCaja = (COB.movimientos || []).filter(m => m.categoria === 'Traspaso efectivo' && !/Caja:\s*CAJ-/.test(m.notas || ''));
  if (bancoTrasSinCaja.length) {
    const tot = bancoTrasSinCaja.map(m => `${cobFmtFecha(m.fecha)} ${cobFmt(m.importe)}`).join(' · ');
    alertas.push(['err', `${bancoTrasSinCaja.length} movimiento(s) de banco de efectivo sin registrar en caja: ${tot}. Regístralos con «Retirada de banco» / «Ingreso en banco».`]);
  }
  box.innerHTML = alertas.map(([t, msg]) => `<div class="cobx-al ${t}"><span>${t === 'info' ? 'ℹ' : '⚠'}</span><span>${cobEsc(msg)}</span></div>`).join('');
}

/* ── Entrada / salida manual ── */
function cobCajaModal(tipo) {
  const esEntrada = tipo === 'entrada';
  const opts = esEntrada
    ? ['Personal']
    : ['Pago profesional', 'Gasto clinica', 'Personal'];
  const html = `<div style="padding:20px">
    <div style="font-size:15px;font-weight:600;margin-bottom:6px">${esEntrada ? 'Entrada de efectivo' : 'Salida de efectivo'}</div>
    <div style="font-size:12px;color:var(--ink-muted);margin-bottom:12px">${esEntrada
      ? 'Los cobros a pacientes en efectivo entran solos al registrarlos en Cobros. Las retiradas de banco y los arqueos tienen su botón propio.'
      : 'Los pagos de liquidaciones en efectivo salen solos al confirmarlos. Ingresos en banco y arqueos tienen su botón propio.'}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div>
        <label style="${COB_CAJA_LBL}">FECHA</label>
        <input type="date" id="cob-caja-fecha" value="${cobHoy()}" style="${COB_CAJA_INPUT}">
      </div>
      <div>
        <label style="${COB_CAJA_LBL}">IMPORTE (€)</label>
        <input type="number" id="cob-caja-importe" min="0.01" step="0.01" placeholder="0,00" style="${COB_CAJA_INPUT}">
      </div>
    </div>
    <div style="margin-bottom:10px">
      <label style="${COB_CAJA_LBL}">CONCEPTO</label>
      <input type="text" id="cob-caja-concepto" placeholder="Describe el movimiento…" style="${COB_CAJA_INPUT}">
    </div>
    <div style="margin-bottom:14px">
      <label style="${COB_CAJA_LBL}">CATEGORÍA (obligatoria)</label>
      <select id="cob-caja-cat" style="${COB_CAJA_INPUT}">
        <option value="">Elige categoría…</option>
        ${opts.map(c => `<option value="${c}">${c === 'Gasto clinica' ? 'Gasto clínica' : c}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn btn-sec" onclick="cobCerrarModal()">Cancelar</button>
      <button class="btn btn-pri" onclick="cobGuardarCaja('${tipo}')">Guardar</button>
    </div>
  </div>`;
  cobAbrirModal(html);
}

async function cobGuardarCaja(tipo) {
  const fecha    = document.getElementById('cob-caja-fecha').value;
  const importeV = parseFloat(document.getElementById('cob-caja-importe').value);
  const concepto = document.getElementById('cob-caja-concepto').value.trim();
  const cat      = document.getElementById('cob-caja-cat').value;

  if (!fecha || isNaN(importeV) || importeV <= 0) { toast('Completa fecha e importe', true); return; }
  if (!cat) { toast('Elige una categoría', true); return; }
  if (!concepto) { toast('Indica un concepto', true); return; }

  const importe = tipo === 'salida' ? -Math.abs(importeV) : Math.abs(importeV);
  const payload = { id: cobIdCaja(), fecha, concepto, importe, categoria: cat };

  const ok = await sp('movimientos_caja', payload, 'POST');
  if (ok !== null) {
    cobCerrarModal();
    toast('Movimiento registrado', false, true);
    await cobCargarCaja();
  }
}

/* ── Traspaso efectivo ↔ banco ── */
function cobTraspasoCandidatos(tipo) {
  // retirada: el banco muestra una salida (importe < 0); ingreso: una entrada (importe > 0)
  return (COB.movimientos || []).filter(m => {
    if (/Caja:\s*CAJ-/.test(m.notas || '')) return false;
    const imp = Number(m.importe);
    if (tipo === 'retirada' ? imp >= 0 : imp <= 0) return false;
    return m.categoria === 'Traspaso efectivo' || m.categoria === 'Sin clasificar';
  }).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

function cobTraspasoModal(tipo) {
  const esRet = tipo === 'retirada';
  const cands = cobTraspasoCandidatos(tipo);
  const optsMov = cands.map(m =>
    `<option value="${m.id}">${cobFmtFecha(m.fecha)} · ${cobFmt(m.importe)} · ${cobEsc((m.concepto || '').slice(0, 45))}</option>`).join('');
  const html = `<div style="padding:20px">
    <div style="font-size:15px;font-weight:600;margin-bottom:6px">${esRet ? 'Retirada de banco (cajero → caja)' : 'Ingreso en banco (caja → banco)'}</div>
    <div style="font-size:12px;color:var(--ink-muted);margin-bottom:12px">${esRet ? 'El efectivo entra en la caja.' : 'El efectivo sale de la caja.'} Vincúlalo al movimiento del extracto para que ambos lados cuadren.</div>
    <div style="margin-bottom:10px">
      <label style="${COB_CAJA_LBL}">MOVIMIENTO DEL EXTRACTO</label>
      <select id="cob-tras-mov" onchange="cobTraspasoElegir()" style="${COB_CAJA_INPUT}">
        <option value="">Sin vincular (el extracto aún no está importado)</option>${optsMov}
      </select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div>
        <label style="${COB_CAJA_LBL}">FECHA</label>
        <input type="date" id="cob-tras-fecha" value="${cobHoy()}" style="${COB_CAJA_INPUT}">
      </div>
      <div>
        <label style="${COB_CAJA_LBL}">IMPORTE (€)</label>
        <input type="number" id="cob-tras-importe" min="0.01" step="0.01" placeholder="0,00" style="${COB_CAJA_INPUT}">
      </div>
    </div>
    <div style="margin-bottom:14px">
      <label style="${COB_CAJA_LBL}">CONCEPTO</label>
      <input type="text" id="cob-tras-concepto" value="${esRet ? 'Retirada de efectivo en cajero' : 'Ingreso de efectivo en banco'}" style="${COB_CAJA_INPUT}">
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn btn-sec" onclick="cobCerrarModal()">Cancelar</button>
      <button class="btn btn-pri" onclick="cobGuardarTraspaso('${tipo}')">Guardar</button>
    </div>
  </div>`;
  cobAbrirModal(html);
}

function cobTraspasoElegir() {
  const id = document.getElementById('cob-tras-mov').value;
  const m = (COB.movimientos || []).find(x => x.id === id);
  if (!m) return;
  document.getElementById('cob-tras-fecha').value = m.fecha;
  document.getElementById('cob-tras-importe').value = Math.abs(Number(m.importe)).toFixed(2);
}

async function cobGuardarTraspaso(tipo) {
  const idMov    = document.getElementById('cob-tras-mov').value;
  const fecha    = document.getElementById('cob-tras-fecha').value;
  const importeV = parseFloat(document.getElementById('cob-tras-importe').value);
  const concepto = document.getElementById('cob-tras-concepto').value.trim() || 'Traspaso de efectivo';
  if (!fecha || isNaN(importeV) || importeV <= 0) { toast('Completa fecha e importe', true); return; }

  const mov = idMov ? (COB.movimientos || []).find(x => x.id === idMov) : null;
  if (mov && Math.abs(Math.abs(Number(mov.importe)) - importeV) > 0.005) {
    toast('El importe no coincide con el movimiento del extracto', true); return;
  }
  const id = cobIdCaja();
  const importe = tipo === 'retirada' ? Math.abs(importeV) : -Math.abs(importeV);
  const payload = { id, fecha, concepto, importe, categoria: 'Traspaso efectivo', notas: mov ? `Banco: ${mov.id}` : null };

  const ok = await sp('movimientos_caja', payload, 'POST');
  if (ok === null) return;
  if (mov) {
    const prev = mov.notas ? mov.notas + ' · ' : '';
    const ok2 = await cobPatch(`movimientos_banco?id=eq.${mov.id}`, { categoria: 'Traspaso efectivo', notas: `${prev}Caja: ${id}` });
    if (ok2 === null) toast('Caja registrada, pero no se pudo vincular el movimiento de banco', true);
    else { mov.categoria = 'Traspaso efectivo'; mov.notas = `${prev}Caja: ${id}`; }
  }
  cobCerrarModal();
  toast('Traspaso registrado', false, true);
  await cobCargarCaja();
  if (typeof cobRefrescarBanco === 'function') cobRefrescarBanco();
}

/* ── Arqueo semanal ── */
function cobArqueoModal() {
  const hoy = cobHoy();
  const html = `<div style="padding:20px">
    <div style="font-size:15px;font-weight:600;margin-bottom:6px">Arqueo de caja</div>
    <div style="font-size:12px;color:var(--ink-muted);margin-bottom:12px">Cuenta el efectivo físico. Si no coincide con el saldo teórico, se registra el ajuste con su motivo.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div>
        <label style="${COB_CAJA_LBL}">FECHA DEL RECUENTO</label>
        <input type="date" id="cob-arq-fecha" value="${hoy}" oninput="cobArqueoCalc()" style="${COB_CAJA_INPUT}">
      </div>
      <div>
        <label style="${COB_CAJA_LBL}">EFECTIVO CONTADO (€)</label>
        <input type="number" id="cob-arq-contado" min="0" step="0.01" placeholder="0,00" oninput="cobArqueoCalc()" style="${COB_CAJA_INPUT}">
      </div>
    </div>
    <div id="cob-arq-resumen" style="background:var(--cream);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:13px"></div>
    <div style="margin-bottom:14px">
      <label style="${COB_CAJA_LBL}">MOTIVO DE LA DIFERENCIA (obligatorio si no cuadra)</label>
      <input type="text" id="cob-arq-motivo" placeholder="Ej.: cambio devuelto, pago no apuntado…" style="${COB_CAJA_INPUT}">
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn btn-sec" onclick="cobCerrarModal()">Cancelar</button>
      <button class="btn btn-pri" onclick="cobGuardarArqueo()">Registrar arqueo</button>
    </div>
  </div>`;
  cobAbrirModal(html);
  cobArqueoCalc();
}

function cobArqueoCalc() {
  const fecha = document.getElementById('cob-arq-fecha')?.value;
  const contado = parseFloat(document.getElementById('cob-arq-contado')?.value);
  const el = document.getElementById('cob-arq-resumen');
  if (!el) return;
  const teorico = cobSaldoCajaA(fecha || null);
  let dif = '';
  if (!isNaN(contado)) {
    const d = Math.round((contado - teorico) * 100) / 100;
    dif = `<div>Diferencia: <b style="color:${Math.abs(d) < 0.005 ? '#1e7e34' : '#b3261e'}">${d > 0 ? '+' : ''}${cobFmt(d)}</b></div>`;
  }
  el.innerHTML = `<div>Saldo teórico a ${cobFmtFecha(fecha)}: <b>${cobFmt(teorico)}</b></div>${dif}`;
}

async function cobGuardarArqueo() {
  const fecha = document.getElementById('cob-arq-fecha').value;
  const contado = parseFloat(document.getElementById('cob-arq-contado').value);
  const motivo = document.getElementById('cob-arq-motivo').value.trim();
  if (!fecha || isNaN(contado) || contado < 0) { toast('Indica fecha y efectivo contado', true); return; }
  const teorico = cobSaldoCajaA(fecha);
  const dif = Math.round((contado - teorico) * 100) / 100;
  if (Math.abs(dif) >= 0.005 && !motivo) { toast('Indica el motivo de la diferencia', true); return; }

  const concepto = `Arqueo ${cobFmtFecha(fecha)}: contado ${cobFmt(contado)} · teórico ${cobFmt(teorico)}` + (motivo ? ` · ${motivo}` : '');
  const payload = { id: cobIdCaja(), fecha, concepto, importe: dif, categoria: 'Arqueo' };
  const ok = await sp('movimientos_caja', payload, 'POST');
  if (ok !== null) {
    cobCerrarModal();
    toast(Math.abs(dif) < 0.005 ? 'Arqueo registrado: cuadra' : `Arqueo registrado con ajuste de ${cobFmt(dif)}`, false, true);
    await cobCargarCaja();
  }
}

/* ── Edición ── */
function cobEditarCaja(id) {
  const m = COB.cajaMov.find(x => x.id === id);
  if (!m) return;
  if (m.categoria === 'Arqueo') { toast('Los arqueos no se editan: registra un nuevo arqueo', true); return; }
  const bloqueado = !!m.id_cobro;   // viene de un cobro: fecha e importe se editan en el cobro
  const imp = Math.abs(Number(m.importe));
  const cats = bloqueado ? [m.categoria] : ['Pago profesional', 'Gasto clinica', 'Traspaso efectivo', 'Personal'];
  if (!cats.includes(m.categoria)) cats.unshift(m.categoria);
  const catOpts = cats.map(c => `<option value="${c}" ${m.categoria===c?'selected':''}>${c === 'Gasto clinica' ? 'Gasto clínica' : c}</option>`).join('');
  const dis = bloqueado ? 'disabled' : '';
  const html = `<div style="padding:20px">
    <div style="font-size:15px;font-weight:600;margin-bottom:6px">Editar movimiento de caja</div>
    ${bloqueado ? `<div style="font-size:12px;color:var(--ink-muted);margin-bottom:10px">Generado desde el cobro ${cobEsc(m.id_cobro)}: fecha, importe y categoría se cambian en el cobro.</div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div>
        <label style="${COB_CAJA_LBL}">FECHA</label>
        <input type="date" id="cob-edit-fecha" value="${m.fecha}" ${dis} style="${COB_CAJA_INPUT}">
      </div>
      <div>
        <label style="${COB_CAJA_LBL}">IMPORTE (€)</label>
        <input type="number" id="cob-edit-importe" value="${imp}" min="0.01" step="0.01" ${dis} style="${COB_CAJA_INPUT}">
      </div>
    </div>
    <div style="margin-bottom:10px">
      <label style="${COB_CAJA_LBL}">CONCEPTO</label>
      <input type="text" id="cob-edit-concepto" value="${cobEsc(m.concepto)}" style="${COB_CAJA_INPUT}">
    </div>
    <div style="margin-bottom:14px">
      <label style="${COB_CAJA_LBL}">CATEGORÍA</label>
      <select id="cob-edit-cat" ${dis} style="${COB_CAJA_INPUT}">${catOpts}</select>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn btn-sec" onclick="cobCerrarModal()">Cancelar</button>
      <button class="btn btn-pri" onclick="cobGuardarEditCaja('${id}',${Number(m.importe) < 0 ? '-1' : '1'})">Guardar</button>
    </div>
  </div>`;
  cobAbrirModal(html);
}

async function cobGuardarEditCaja(id, signo) {
  const m = COB.cajaMov.find(x => x.id === id);
  if (!m) return;
  const concepto = document.getElementById('cob-edit-concepto').value.trim();
  let patch;
  if (m.id_cobro) {
    patch = { concepto };   // fecha/importe/categoría los gobierna el cobro
  } else {
    const fecha    = document.getElementById('cob-edit-fecha').value;
    const importeV = parseFloat(document.getElementById('cob-edit-importe').value);
    const cat      = document.getElementById('cob-edit-cat').value;
    if (!fecha || isNaN(importeV) || importeV <= 0) { toast('Datos incompletos', true); return; }
    patch = { fecha, importe: signo * Math.abs(importeV), concepto, categoria: cat };
  }
  const ok = await cobPatch(`movimientos_caja?id=eq.${id}`, patch);
  if (ok !== null) {
    cobCerrarModal();
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
      <button class="btn btn-sec" onclick="cobCerrarModal()">Cancelar</button>
      <button class="btn btn-pri" onclick="cobLiqEjecutarCalculo()">Calcular</button>
    </div>
  </div>`;
  cobAbrirModal(html);
}

async function cobLiqEjecutarCalculo() {
  const desde = document.getElementById('liq-desde').value;
  const hasta = document.getElementById('liq-hasta').value;
  if (!desde || !hasta) { toast('Selecciona el período', true); return; }

  cobCerrarModal();
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
        <button class="btn btn-sec" style="font-size:12px" onclick="cobLiqVerDetalle('${l.id}')">
          <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;display:inline;vertical-align:-1px;margin-right:4px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Ver detalle
        </button>
        <button class="btn btn-pri" style="font-size:12px" onclick="cobLiqRegistrarPago('${l.id}')">
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
      <button class="btn btn-sec" onclick="cobCerrarModal()">Cancelar</button>
      <button class="btn btn-pri" onclick="cobLiqConfirmarPago('${id}')">Confirmar pago</button>
    </div>
  </div>`;
  cobAbrirModal(html);
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
  const ok = await cobPatch(`liquidaciones_profesionales?id=eq.${id}`, payload);
  if (ok !== null) {
    // Si es efectivo, registrar salida en caja automáticamente
    if (medio === 'Efectivo' && !COB.cajaMov.some(m => m.id_liquidacion === id)) {
      const liq = COB.liquidaciones.find(l => l.id === id);
      const pro = liq?.profesionales || {};
      const nombre = `${pro.nombre || ''} ${pro.apellidos || ''}`.trim() || liq?.id_profesional || '';
      const cajaPay = {
        id: cobIdCaja(),
        fecha,
        concepto: `Liquidación ${nombre} — ${cobFmtFecha(liq?.periodo_desde)} a ${cobFmtFecha(liq?.periodo_hasta)}`,
        importe: -Math.abs(importe),
        categoria: 'Pago profesional',
        id_liquidacion: id
      };
      await sp('movimientos_caja', cajaPay, 'POST');
    }
    cobCerrarModal();
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
      <button class="btn btn-sec" onclick="cobCerrarModal()">Cerrar</button>
    </div>
  </div>`;
  cobAbrirModal(html);
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

