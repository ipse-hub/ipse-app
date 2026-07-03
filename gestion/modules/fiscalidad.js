/* ── Helpers fecha ── */
function fiscTrimestre(fechaStr) {
  const m = parseInt(fechaStr.split('-')[1]);
  return Math.ceil(m / 3);
}
function fiscRangoTrim(ejercicio, trim) {
  const ini = `${ejercicio}-${String((trim-1)*3+1).padStart(2,'0')}-01`;
  const lastMonth = String(trim*3).padStart(2,'0');
  const lastDay = new Date(ejercicio, trim*3, 0).getDate();
  return { ini, fin: `${ejercicio}-${lastMonth}-${String(lastDay).padStart(2,'0')}` };
}
function fiscRangoAnual(ejercicio) {
  return { ini: `${ejercicio}-01-01`, fin: `${ejercicio}-12-31` };
}

/* ── Navegación ── */
function fiscTab(name, el) {
  document.querySelectorAll('.fisc-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.fisc-panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('fisc-panel-' + name).classList.add('active');
  // Carga lazy
  if (name === 'resumen') fiscCargarResumen();
  if (name === 'gastos')  fiscCargarGastos();
  if (name === 'ingresos') fiscCargarIngresos();
  if (name === '130') fisc130Render();
  if (name === 'cg') fiscCargarControlGestion();
}

function fiscCambiarEjercicio(val) {
  FISC.ejercicio = parseInt(val);
  FISC.gastos = []; FISC.ingresos = []; FISC.datos130 = {};
  document.getElementById('fisc-ejercicio-label').textContent = FISC.ejercicio;
  // Recargar panel activo
  const tabActiva = document.querySelector('.fisc-tab.active');
  if (tabActiva) tabActiva.click();
}

/* ══════════════════════════════════════════
   PANEL: RESUMEN ANUAL
══════════════════════════════════════════ */
async function fiscCargarResumen() {
  const { ini, fin } = fiscRangoAnual(FISC.ejercicio);
  try {
    const [cobros, gastos, datos130] = await Promise.all([
      sg(`cobros_v2?fecha=gte.${ini}&fecha=lte.${fin}&select=fecha,importe,id_cita&limit=2000`),
      sg(`gastos_reales?ejercicio=eq.${FISC.ejercicio}&es_deducible=eq.Si&order=fecha.asc&limit=2000`),
      sg(`irpf_130?ejercicio=eq.${FISC.ejercicio}&order=trimestre.asc`)
    ]);

    // Enriquecer cobros con modalidad_pago desde citas
    const citaIds = [...new Set(cobros.map(c => c.id_cita).filter(Boolean))];
    let citasMap = {};
    if (citaIds.length) {
      const citasQ = citaIds.map(id => `id=eq.${id}`).join('&');
      // Cargar en lotes de 50 para no exceder URL
      const lotes = [];
      for (let i = 0; i < citaIds.length; i += 50) lotes.push(citaIds.slice(i, i+50));
      for (const lote of lotes) {
        const q = lote.map(id => `id=eq.${encodeURIComponent(id)}`).join(',');
        try {
          const citas = await sg(`citas_v2?id=in.(${lote.map(id => `"${id}"`).join(',')})&select=id,modalidad_pago&limit=50`);
          citas.forEach(c => { citasMap[c.id] = c; });
        } catch { /* no crítico */ }
      }
    }

    FISC.gastos   = gastos;
    FISC.ingresos = cobros.map(c => ({ ...c, modalidad_pago: citasMap[c.id_cita]?.modalidad_pago || '' }));
    datos130.forEach(d => { FISC.datos130[d.trimestre] = d; });

    // KPIs anuales
    const totalIng = cobros.reduce((s, c) => s + (parseFloat(c.importe)||0), 0);
    const totalGas = gastos.reduce((s, g) => s + (parseFloat(g.importe)||0), 0);
    const rdto     = totalIng - totalGas;
    const irpf20   = Math.max(0, rdto * 0.20);

    document.getElementById('fisc-kpi-ing').textContent  = fmtEur(totalIng);
    document.getElementById('fisc-kpi-gas').textContent  = fmtEur(totalGas);
    document.getElementById('fisc-kpi-rdto').textContent = fmtEur(rdto);
    document.getElementById('fisc-kpi-irpf').textContent = fmtEur(irpf20);

    fiscRenderTrimCards(cobros, gastos);

  } catch(e) {
    document.getElementById('fisc-trim-cards').innerHTML =
      `<div class="fisc-trim-card" style="grid-column:1/-1"><div style="color:var(--rojo);font-size:13px">Error cargando datos: ${e.message}</div></div>`;
  }
}

function fiscRenderTrimCards(cobros, gastos) {
  const cards = [];
  for (let t = 1; t <= 4; t++) {
    const { ini, fin } = fiscRangoTrim(FISC.ejercicio, t);
    const ing = cobros.filter(c => c.fecha >= ini && c.fecha <= fin)
                      .reduce((s,c) => s + (parseFloat(c.importe)||0), 0);
    const gas = gastos.filter(g => g.fecha >= ini && g.fecha <= fin)
                      .reduce((s,g) => s + (parseFloat(g.importe)||0), 0);
    const rdto = ing - gas;
    const retAd = cobros.filter(c => c.fecha >= ini && c.fecha <= fin && FISC.ingresos.find(i=>i.id_cita===c.id_cita)?.modalidad_pago === 'ADECCO')
                        .reduce((s,c) => s + (parseFloat(c.importe)||0), 0) * TIPO_RETENCION;
    const irpfCalc = Math.max(0, rdto * 0.20) - retAd;
    const d130 = FISC.datos130[t];
    const irpfDec = d130?.c07_resultado;
    const hoy = new Date().toISOString().split('T')[0];
    const pasado = fin < hoy;

    // Semáforo diferencia
    let diffHtml = '';
    if (irpfDec !== null && irpfDec !== undefined && pasado) {
      const diff = irpfCalc - irpfDec;
      const absDiff = Math.abs(diff);
      if (absDiff < 1) {
        diffHtml = `<div class="fisc-diff ok"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Coincide con lo declarado</div>`;
      } else if (absDiff <= 50) {
        diffHtml = `<div class="fisc-diff amber"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Diferencia menor (${fmtEur(absDiff)})</div>`;
      } else {
        diffHtml = `<div class="fisc-diff warn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>Diferencia de ${fmtEur(absDiff)} — revisar</div>`;
      }
    } else if (!pasado) {
      diffHtml = `<div class="fisc-diff neutral">Trimestre no finalizado</div>`;
    } else {
      diffHtml = `<div class="fisc-diff neutral">Sin datos del gestor — introduce en Modelo 130</div>`;
    }

    const trimLabels = ['','1T · ene–mar','2T · abr–jun','3T · jul–sep','4T · oct–dic'];
    cards.push(`
      <div class="fisc-trim-card">
        <div class="fisc-trim-hdr">
          <div class="fisc-trim-title">${trimLabels[t]}</div>
          ${pasado ? '<span class="fisc-trim-badge badge-ok">Cerrado</span>' : '<span class="fisc-trim-badge badge-info">En curso</span>'}
        </div>
        <div class="fisc-trim-row"><span class="fisc-trim-lbl">Ingresos (IPSE)</span><span class="fisc-trim-val calc">${fmtEur(ing)}</span></div>
        <div class="fisc-trim-row"><span class="fisc-trim-lbl">Gastos deducibles</span><span class="fisc-trim-val">${fmtEur(gas)}</span></div>
        <div class="fisc-trim-row"><span class="fisc-trim-lbl">Rdto. neto</span><span class="fisc-trim-val ${rdto >= 0 ? 'ok' : 'warn'}">${fmtEur(rdto)}</span></div>
        <div class="fisc-trim-row"><span class="fisc-trim-lbl">IRPF calculado</span><span class="fisc-trim-val calc">${fmtEur(irpfCalc)}</span></div>
        <div class="fisc-trim-row"><span class="fisc-trim-lbl">Declarado gestor</span><span class="fisc-trim-val ${irpfDec != null ? '' : 'muted'}">${irpfDec != null ? fmtEur(irpfDec) : 'Sin datos'}</span></div>
        ${diffHtml}
      </div>`);
  }
  document.getElementById('fisc-trim-cards').innerHTML = cards.join('');
}

/* ══════════════════════════════════════════
   PANEL: GASTOS
══════════════════════════════════════════ */
async function fiscCargarGastos() {
  const trim = parseInt(document.getElementById('fisc-gas-trim')?.value || '0');
  let url = `gastos_reales?ejercicio=eq.${FISC.ejercicio}&order=fecha.desc&limit=2000`;
  if (trim > 0) {
    const { ini, fin } = fiscRangoTrim(FISC.ejercicio, trim);
    url += `&fecha=gte.${ini}&fecha=lte.${fin}`;
  }
  const tbody = document.getElementById('fisc-gas-tbody');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px"><span class="spinner"></span></td></tr>`;
  try {
    const data = await sg(url);
    FISC.gastos = data;
    fiscRenderGastos(data);
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--rojo);padding:12px 14px">Error: ${e.message}</td></tr>`;
  }
}

function fiscRenderGastos(gastos) {
  const tbody = document.getElementById('fisc-gas-tbody');
  const footer = document.getElementById('fisc-gas-footer');
  if (!gastos.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state" style="padding:32px;text-align:center;color:var(--ink-muted)">Sin gastos registrados</td></tr>`;
    footer.textContent = '0 gastos · 0,00 €';
    return;
  }
  const totalDeducible = gastos.filter(g => g.es_deducible !== 'No').reduce((s,g) => s + (parseFloat(g.importe)||0), 0);
  const totalNoDeducible = gastos.filter(g => g.es_deducible === 'No').reduce((s,g) => s + (parseFloat(g.importe)||0), 0);
  tbody.innerHTML = gastos.map(g => `
    <tr>
      <td class="mono">${fmtFecha(g.fecha)}</td>
      <td class="strong">${g.descripcion}</td>
      <td><span class="badge badge-info">${g.categoria}</span></td>
      <td>${g.es_deducible === 'No' ? '<span class="badge badge-muted">No deducible</span>' : '<span class="badge badge-ok">Deducible</span>'}</td>
      <td class="muted">${g.proveedor || '—'}</td>
      <td class="muted">Q${fiscTrimestre(g.fecha)}</td>
      <td style="text-align:right;font-family:'DM Mono',monospace;font-weight:600;color:var(--verde-dark)">${fmtEur(parseFloat(g.importe)||0)}</td>
      <td style="text-align:right">
        <button onclick="fiscEditarGasto('${g.id}')" style="background:none;border:1px solid var(--border);border-radius:5px;padding:3px 8px;font-size:11px;color:var(--ink-muted);cursor:pointer;font-family:inherit" onmouseover="this.style.color='var(--azul)'" onmouseout="this.style.color='var(--ink-muted)'">Editar</button>
      </td>
    </tr>`).join('');
  footer.textContent = `${gastos.length} gasto${gastos.length!==1?'s':''} · Deducible: ${fmtEur(totalDeducible)}` +
    (totalNoDeducible > 0 ? ` · No deducible: ${fmtEur(totalNoDeducible)}` : '');
}

/* ── Modal gasto ── */
async function fiscCargarCostesFijosSelect() {
  if (!FISC.costesFijos.length) {
    try {
      FISC.costesFijos = await sg('costes_fijos?activo=eq.true&order=concepto.asc&select=id,concepto,categoria');
    } catch { FISC.costesFijos = []; }
  }
  const sel = document.getElementById('gas-coste-fijo');
  sel.innerHTML = '<option value="">Sin partida asignada</option>' +
    FISC.costesFijos.map(c => `<option value="${c.id}">${c.concepto}</option>`).join('');
}

function fiscAbrirNuevoGasto() {
  FISC.gasEditandoId = null;
  document.getElementById('nuevo-gasto-title').textContent = 'Nuevo gasto';
  document.getElementById('gas-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('gas-importe').value = '';
  document.getElementById('gas-descripcion').value = '';
  document.getElementById('gas-categoria').value = '';
  document.getElementById('gas-proveedor').value = '';
  document.getElementById('gas-num-factura').value = '';
  document.getElementById('gas-notas').value = '';
  document.getElementById('gas-deducible').value = 'Si';
  fiscCargarCostesFijosSelect().then(() => { document.getElementById('gas-coste-fijo').value = ''; });
  document.getElementById('overlay-nuevo-gasto').classList.add('open');
}

function fiscEditarGasto(id) {
  const g = FISC.gastos.find(x => x.id === id);
  if (!g) return;
  FISC.gasEditandoId = id;
  document.getElementById('nuevo-gasto-title').textContent = 'Editar gasto';
  document.getElementById('gas-fecha').value = g.fecha;
  document.getElementById('gas-importe').value = g.importe;
  document.getElementById('gas-descripcion').value = g.descripcion;
  document.getElementById('gas-categoria').value = g.categoria;
  document.getElementById('gas-proveedor').value = g.proveedor || '';
  document.getElementById('gas-num-factura').value = g.num_factura || '';
  document.getElementById('gas-notas').value = g.notas || '';
  document.getElementById('gas-deducible').value = g.es_deducible || 'Si';
  fiscCargarCostesFijosSelect().then(() => { document.getElementById('gas-coste-fijo').value = g.id_coste_fijo || ''; });
  document.getElementById('overlay-nuevo-gasto').classList.add('open');
}

function fiscCerrarNuevoGasto() {
  document.getElementById('overlay-nuevo-gasto').classList.remove('open');
}

async function fiscGuardarGasto() {
  const fecha       = document.getElementById('gas-fecha').value;
  const importe     = parseFloat(document.getElementById('gas-importe').value);
  const descripcion = document.getElementById('gas-descripcion').value.trim();
  const categoria   = document.getElementById('gas-categoria').value;

  if (!fecha || !descripcion || !categoria || isNaN(importe) || importe <= 0) {
    toast('Fecha, descripción, categoría e importe son obligatorios', true);
    return;
  }

  const btn = document.getElementById('btn-guardar-gasto');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Guardando…';

  const body = {
    ejercicio: FISC.ejercicio, fecha, descripcion, categoria, importe,
    proveedor:    document.getElementById('gas-proveedor').value.trim() || null,
    num_factura:  document.getElementById('gas-num-factura').value.trim() || null,
    notas:        document.getElementById('gas-notas').value.trim() || null,
    es_deducible: document.getElementById('gas-deducible').value,
    id_coste_fijo: document.getElementById('gas-coste-fijo').value ? parseInt(document.getElementById('gas-coste-fijo').value) : null,
  };
  if (!FISC.gasEditandoId) body.origen = 'Manual';

  try {
    if (FISC.gasEditandoId) {
      await spatch('gastos_reales', FISC.gasEditandoId, body);
    } else {
      // Generar ID secuencial GAS-NNN
      let nextNum = 1;
      try {
        const last = await sg('gastos_reales?order=id.desc&limit=1&select=id');
        if (last.length) nextNum = parseInt(last[0].id.replace(/\D/g,'')) + 1;
      } catch { /* primera vez */ }
      body.id = 'GAS-' + String(nextNum).padStart(3,'0');
      await sp('gastos_reales', body);
    }
    fiscCerrarNuevoGasto();
    await fiscCargarGastos();
    // Refrescar resumen si estaba cargado
    if (document.getElementById('fisc-panel-resumen').classList.contains('active')) fiscCargarResumen();
    toast(FISC.gasEditandoId ? 'Gasto actualizado' : 'Gasto añadido', false, true);
  } catch(e) {
    toast('Error al guardar: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar gasto';
  }
}

/* ══════════════════════════════════════════
   PANEL: INGRESOS
══════════════════════════════════════════ */
async function fiscCargarIngresos() {
  const trim = parseInt(document.getElementById('fisc-ing-trim')?.value || '0');
  const { ini: iniA, fin: finA } = fiscRangoAnual(FISC.ejercicio);
  let iniQ = iniA, finQ = finA;
  if (trim > 0) { const r = fiscRangoTrim(FISC.ejercicio, trim); iniQ = r.ini; finQ = r.fin; }

  const tbody = document.getElementById('fisc-ing-tbody');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px"><span class="spinner"></span></td></tr>`;

  try {
    const cobros = await sg(`cobros_v2?fecha=gte.${iniQ}&fecha=lte.${finQ}&order=fecha.desc&limit=2000&select=*`);
    // Enriquecer con modalidad de cita y nombre de paciente
    const pacIds  = [...new Set(cobros.map(c => c.id_paciente).filter(Boolean))];
    const citaIds = [...new Set(cobros.map(c => c.id_cita).filter(Boolean))];
    const pacMap  = {};
    G.pacientes.forEach(p => { pacMap[p.id] = p; });
    let citaModMap = {};
    if (citaIds.length) {
      const lotes = [];
      for (let i = 0; i < citaIds.length; i += 50) lotes.push(citaIds.slice(i, i+50));
      for (const lote of lotes) {
        try {
          const citas = await sg(`citas_v2?id=in.(${lote.map(id => `"${id}"`).join(',')})&select=id,modalidad_pago&limit=50`);
          citas.forEach(c => { citaModMap[c.id] = c.modalidad_pago; });
        } catch { /* no crítico */ }
      }
    }

    const total = cobros.reduce((s,c) => s + (parseFloat(c.importe)||0), 0);
    const retTotal = cobros.filter(c => citaModMap[c.id_cita] === 'ADECCO')
                           .reduce((s,c) => s + (parseFloat(c.importe)||0) * TIPO_RETENCION, 0);

    tbody.innerHTML = cobros.length ? cobros.map(c => {
      const pac = pacMap[c.id_paciente];
      const pacNom = pac ? `${pac.apellidos||''}, ${pac.nombre||''}`.replace(/^,\s*|,\s*$/g,'') : c.id_paciente || '—';
      const mod = citaModMap[c.id_cita] || '—';
      const esAdecco = mod === 'ADECCO';
      return `<tr>
        <td class="mono">${fmtFecha(c.fecha)}</td>
        <td class="strong">${pacNom}</td>
        <td class="muted">${c.concepto || '—'}</td>
        <td>${esAdecco ? '<span class="badge badge-warn">ADECCO</span>' : `<span class="badge badge-muted">${mod}</span>`}</td>
        <td class="muted">${c.metodo || '—'}</td>
        <td class="muted">Q${fiscTrimestre(c.fecha)}</td>
        <td style="text-align:right;font-family:'DM Mono',monospace;font-weight:600;color:var(--verde-dark)">${fmtEur(parseFloat(c.importe)||0)}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" class="empty-state" style="padding:32px;text-align:center;color:var(--ink-muted)">Sin cobros en este período</td></tr>`;

    document.getElementById('fisc-ing-footer').textContent =
      `${cobros.length} cobro${cobros.length!==1?'s':''} · Total bruto: ${fmtEur(total)}` +
      (retTotal > 0 ? ` · Retenciones Adecco est.: ${fmtEur(retTotal)}` : '');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--rojo);padding:12px 14px">Error: ${e.message}</td></tr>`;
  }
}

/* ══════════════════════════════════════════
   PANEL: MODELO 130
══════════════════════════════════════════ */
function fisc130SelTrim(t, el) {
  document.querySelectorAll('.fisc-trim-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  FISC.trimActivo130 = t;
  fisc130Render();
}

async function fisc130Render() {
  const t = FISC.trimActivo130;
  const contenido = document.getElementById('fisc-130-contenido');
  contenido.innerHTML = `<div class="loading-row"><span class="spinner"></span></div>`;

  try {
    // Acumulados enero → fin del trimestre seleccionado
    const { fin } = fiscRangoTrim(FISC.ejercicio, t);
    const ini = `${FISC.ejercicio}-01-01`;

    const [cobros, gastos, datos130arr] = await Promise.all([
      sg(`cobros_v2?fecha=gte.${ini}&fecha=lte.${fin}&select=fecha,importe,id_cita&limit=2000`),
      sg(`gastos_reales?ejercicio=eq.${FISC.ejercicio}&es_deducible=eq.Si&fecha=lte.${fin}&order=fecha.asc&limit=2000`),
      sg(`irpf_130?ejercicio=eq.${FISC.ejercicio}&trimestre=eq.${t}&limit=1`)
    ]);

    // Retenciones Adecco acumuladas
    const citaIds = [...new Set(cobros.map(c => c.id_cita).filter(Boolean))];
    let adeccoImporte = 0;
    if (citaIds.length) {
      const lotes = [];
      for (let i = 0; i < citaIds.length; i += 50) lotes.push(citaIds.slice(i, i+50));
      for (const lote of lotes) {
        try {
          const citas = await sg(`citas_v2?id=in.(${lote.map(id => `"${id}"`).join(',')})&modalidad_pago=eq.ADECCO&select=id&limit=50`);
          const adeccoCobros = cobros.filter(c => citas.find(ci => ci.id === c.id_cita));
          adeccoImporte += adeccoCobros.reduce((s,c) => s + (parseFloat(c.importe)||0), 0);
        } catch { /* no crítico */ }
      }
    }

    const d = datos130arr[0] || {};
    FISC.datos130[t] = d;

    const c01 = cobros.reduce((s,c) => s + (parseFloat(c.importe)||0), 0);
    const c02 = gastos.reduce((s,g) => s + (parseFloat(g.importe)||0), 0);
    const c03 = c01 - c02;
    const c04 = Math.max(0, c03 * 0.20);
    const c06 = adeccoImporte * TIPO_RETENCION;

    // Pagos fraccionados de trimestres anteriores (suma de c07 > 0)
    let c05 = 0;
    if (t > 1) {
      const prevs = await sg(`irpf_130?ejercicio=eq.${FISC.ejercicio}&trimestre=lt.${t}&select=c07_resultado`);
      c05 = prevs.filter(p => (parseFloat(p.c07_resultado)||0) > 0)
                 .reduce((s,p) => s + (parseFloat(p.c07_resultado)||0), 0);
    }
    const c07_calc = c04 - c05 - c06;

    // Valores declarados por el gestor (si existen)
    const dec = {
      c01: d.c01_ingresos,
      c02: d.c02_gastos,
      c07: d.c07_resultado
    };

    // Semáforo principal
    let semaforo = '';
    if (dec.c07 !== null && dec.c07 !== undefined) {
      const diff = Math.abs(c07_calc - dec.c07);
      if (diff < 1) {
        semaforo = `<div class="fisc-semaforo ok"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>El resultado del gestor coincide con el cálculo de IPSE (${fmtEur(dec.c07)})</div>`;
      } else if (diff <= 50) {
        semaforo = `<div class="fisc-semaforo amber"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Diferencia pequeña (${fmtEur(diff)}) — puede ser un gasto no registrado</div>`;
      } else {
        semaforo = `<div class="fisc-semaforo warn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Diferencia significativa (${fmtEur(diff)}) — hablar con el gestor</div>`;
      }
    } else {
      semaforo = `<div class="fisc-semaforo neutral">Introduce el resultado del gestor para ver la comparativa</div>`;
    }

    const trimLabels = ['','1T · ene–mar','2T · abr–jun','3T · jul–sep','4T · oct–dic'];

    contenido.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:12px">
        ${trimLabels[t]} · Acumulado enero → fin trimestre
      </div>
      ${semaforo}
      <div class="fisc-130-grid" style="margin-top:14px">
        <!-- Columna izquierda: cálculo IPSE -->
        <div class="fisc-130-col">
          <div class="fisc-130-col-title">Cálculo IPSE</div>
          <div class="fisc-casilla">
            <span class="fisc-cas-num">01</span>
            <span class="fisc-cas-lbl">Ingresos computables</span>
            <span class="fisc-cas-val calc">${fmtEur(c01)}</span>
          </div>
          <div class="fisc-casilla">
            <span class="fisc-cas-num">02</span>
            <span class="fisc-cas-lbl">Gastos deducibles</span>
            <span class="fisc-cas-val">${fmtEur(c02)}</span>
          </div>
          <div class="fisc-casilla">
            <span class="fisc-cas-num">03</span>
            <span class="fisc-cas-lbl">Rendimiento neto (01−02)</span>
            <span class="fisc-cas-val ${c03>=0?'ok':'warn'}">${fmtEur(c03)}</span>
          </div>
          <div class="fisc-casilla">
            <span class="fisc-cas-num">04</span>
            <span class="fisc-cas-lbl">20% del rendimiento</span>
            <span class="fisc-cas-val calc">${fmtEur(c04)}</span>
          </div>
          <div class="fisc-casilla">
            <span class="fisc-cas-num">05</span>
            <span class="fisc-cas-lbl">Pagos fraccionados anteriores</span>
            <span class="fisc-cas-val">${fmtEur(c05)}</span>
          </div>
          <div class="fisc-casilla">
            <span class="fisc-cas-num">06</span>
            <span class="fisc-cas-lbl">Retenciones soportadas (Adecco)</span>
            <span class="fisc-cas-val">${fmtEur(c06)}</span>
          </div>
          <div class="fisc-casilla" style="border-top:2px solid var(--azul);margin-top:4px;padding-top:10px">
            <span class="fisc-cas-num" style="background:var(--azul);color:#fff">07</span>
            <span class="fisc-cas-lbl" style="font-weight:600;color:var(--ink)">Resultado calculado (04−05−06)</span>
            <span class="fisc-cas-val result ${c07_calc<0?'neg':''}">${fmtEur(c07_calc)}</span>
          </div>
        </div>

        <!-- Columna derecha: datos del gestor -->
        <div class="fisc-130-col">
          <div class="fisc-130-col-title">Declarado por el gestor</div>
          <div class="fisc-casilla">
            <span class="fisc-cas-num">01</span>
            <span class="fisc-cas-lbl">Ingresos declarados</span>
            <input class="fisc-cas-input" id="fisc-dec-c01" type="number" step="0.01"
              value="${dec.c01 != null ? dec.c01 : ''}" placeholder="—">
          </div>
          <div class="fisc-casilla">
            <span class="fisc-cas-num">02</span>
            <span class="fisc-cas-lbl">Gastos declarados</span>
            <input class="fisc-cas-input" id="fisc-dec-c02" type="number" step="0.01"
              value="${dec.c02 != null ? dec.c02 : ''}" placeholder="—">
          </div>
          <div class="fisc-casilla" style="border-top:2px solid var(--border);margin-top:4px;padding-top:10px">
            <span class="fisc-cas-num" style="background:var(--ink);color:#fff">07</span>
            <span class="fisc-cas-lbl" style="font-weight:600;color:var(--ink)">Resultado declarado</span>
            <input class="fisc-cas-input" id="fisc-dec-c07" type="number" step="0.01"
              value="${dec.c07 != null ? dec.c07 : ''}" placeholder="—"
              style="font-weight:700;font-size:14px;border-color:var(--ink)">
          </div>
          <div style="margin-top:10px">
            <div class="form-group" style="margin-bottom:10px">
              <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-muted);display:block;margin-bottom:4px">Fecha de presentación</label>
              <input class="form-input" id="fisc-dec-fecha" type="date"
                value="${d.fecha_presentacion || ''}" style="width:100%">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-muted);display:block;margin-bottom:4px">Notas</label>
              <textarea class="form-input" id="fisc-dec-notas" rows="2" style="resize:vertical;width:100%">${d.notas || ''}</textarea>
            </div>
          </div>
          <button class="btn-guardar-130" onclick="fisc130Guardar(${t})" id="btn-guardar-130">
            Guardar datos del gestor
          </button>
        </div>
      </div>`;
  } catch(e) {
    contenido.innerHTML = `<div style="color:var(--rojo);font-size:13px;padding:12px 0">Error: ${e.message}</div>`;
  }
}

async function fisc130Guardar(t) {
  const btn = document.getElementById('btn-guardar-130');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Guardando…';

  const c01 = document.getElementById('fisc-dec-c01').value;
  const c02 = document.getElementById('fisc-dec-c02').value;
  const c07 = document.getElementById('fisc-dec-c07').value;
  const fecha = document.getElementById('fisc-dec-fecha').value;
  const notas = document.getElementById('fisc-dec-notas').value.trim();

  const body = {
    c01_ingresos:       c01 !== '' ? parseFloat(c01) : null,
    c02_gastos:         c02 !== '' ? parseFloat(c02) : null,
    c07_resultado:      c07 !== '' ? parseFloat(c07) : null,
    fecha_presentacion: fecha || null,
    notas:              notas || null,
  };
  // Calcular casillas intermedias
  if (body.c01_ingresos != null && body.c02_gastos != null) {
    body.c03_rdto_neto = body.c01_ingresos - body.c02_gastos;
    body.c04_20pct = Math.max(0, body.c03_rdto_neto * 0.20);
  }

  try {
    const id = `130-${FISC.ejercicio}-${t}T`;
    await spatch('irpf_130', id, body);
    FISC.datos130[t] = { ...FISC.datos130[t], ...body };
    toast('Datos del gestor guardados', false, true);
    // Actualizar semáforo sin recargar todo
    await fisc130Render();
  } catch(e) {
    toast('Error al guardar: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar datos del gestor';
  }
}

/* ══════════════════════════════════════════
   PANEL: CONTROL DE GESTIÓN
   Presupuesto (costes_fijos) vs. real (gastos_reales), por partida
══════════════════════════════════════════ */
async function fiscCargarControlGestion() {
  const trim = parseInt(document.getElementById('fisc-cg-trim')?.value || '0');
  const tbody = document.getElementById('fisc-cg-tbody');
  const footer = document.getElementById('fisc-cg-footer');
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px"><span class="spinner"></span></td></tr>`;

  try {
    let iniQ, finQ, nMeses;
    if (trim > 0) {
      const r = fiscRangoTrim(FISC.ejercicio, trim);
      iniQ = r.ini; finQ = r.fin; nMeses = 3;
    } else {
      const r = fiscRangoAnual(FISC.ejercicio);
      iniQ = r.ini; finQ = r.fin; nMeses = 12;
    }

    const [costesFijos, gastos] = await Promise.all([
      sg('costes_fijos?activo=eq.true&order=concepto.asc&select=id,concepto,categoria,importe_mensual'),
      sg(`gastos_reales?ejercicio=eq.${FISC.ejercicio}&fecha=gte.${iniQ}&fecha=lte.${finQ}&limit=2000`)
    ]);
    FISC.costesFijos = costesFijos;

    // Agrupar real por partida
    const realPorPartida = {};
    let realSinPartida = 0;
    gastos.forEach(g => {
      const importe = parseFloat(g.importe) || 0;
      if (g.id_coste_fijo) realPorPartida[g.id_coste_fijo] = (realPorPartida[g.id_coste_fijo] || 0) + importe;
      else realSinPartida += importe;
    });

    let totalPresupuestado = 0, totalReal = 0;
    const filas = costesFijos.map(c => {
      const presupuestado = (parseFloat(c.importe_mensual) || 0) * nMeses;
      const real = realPorPartida[c.id] || 0;
      const diff = presupuestado - real;
      totalPresupuestado += presupuestado;
      totalReal += real;
      return { concepto: c.concepto, presupuestado, real, diff };
    });

    if (realSinPartida > 0) {
      totalReal += realSinPartida;
      filas.push({ concepto: 'Sin partida asignada', presupuestado: null, real: realSinPartida, diff: null });
    }

    if (!filas.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state" style="padding:32px;text-align:center;color:var(--ink-muted)">Sin partidas presupuestarias activas</td></tr>`;
      footer.textContent = '—';
      return;
    }

    tbody.innerHTML = filas.map(f => {
      const diffColor = f.diff == null ? 'var(--ink-muted)' : f.diff >= 0 ? 'var(--verde-dark)' : 'var(--rojo)';
      const diffTxt = f.diff == null ? '—' : (f.diff >= 0 ? '+' : '') + fmtEur(f.diff);
      return `<tr>
        <td class="strong">${f.concepto}</td>
        <td style="text-align:right;font-family:'DM Mono',monospace">${f.presupuestado == null ? '—' : fmtEur(f.presupuestado)}</td>
        <td style="text-align:right;font-family:'DM Mono',monospace">${fmtEur(f.real)}</td>
        <td style="text-align:right;font-family:'DM Mono',monospace;font-weight:600;color:${diffColor}">${diffTxt}</td>
      </tr>`;
    }).join('');

    const diffTotal = totalPresupuestado - totalReal;
    footer.textContent = `Presupuestado: ${fmtEur(totalPresupuestado)} · Real: ${fmtEur(totalReal)} · Diferencia: ${diffTotal >= 0 ? '+' : ''}${fmtEur(diffTotal)}`;
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--rojo);padding:12px 14px">Error: ${e.message}</td></tr>`;
  }
}

