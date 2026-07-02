/* ═══════════════════════════════════════════
   INDICADORES 360°
   Salud del negocio: pocos números, cada uno
   respondiendo a una pregunta concreta.
═══════════════════════════════════════════ */

const IND = {
  hoy: null,
  citas: [],
  cobrosPorCita: {},
  bancoMov: [],
  cajaMov: [],
  costesFijos: [],
  semaforos: {}
};

const IND_MODAL_LABEL = { BECA: 'Beca', BONO: 'Bono', PRIVADO_SU: 'Privado', ADECCO: 'Adecco', OTROS: 'Otros' };
const IND_MODAL_COLOR = { BECA: '#97D700', BONO: '#00B5E2', ADECCO: '#10069F', PRIVADO_SU: '#F59E0B', OTROS: '#6B7490' };
const IND_MODAL_ORDEN = ['BECA', 'BONO', 'ADECCO', 'PRIVADO_SU', 'OTROS'];

async function indInit() {
  document.getElementById('ind-loading').style.display = 'block';
  document.getElementById('ind-loading').textContent = 'Cargando indicadores…';
  document.getElementById('ind-content').style.display = 'none';
  document.getElementById('ind-pill').style.display = 'none';
  try {
    await indCargar();
    indRenderTodo();
    document.getElementById('ind-loading').style.display = 'none';
    document.getElementById('ind-content').style.display = 'block';
  } catch (e) {
    document.getElementById('ind-loading').innerHTML =
      `<i class="ti ti-alert-circle" style="font-size:20px;margin-bottom:8px;display:block;color:#DA291C"></i>Error al cargar: ${e.message}`;
  }
}

async function indCargar() {
  const hoy = new Date().toISOString().split('T')[0];
  const desde = sumarDias(hoy, -120);   // cubre baseline de 90d + aging de pendientes
  const hasta = sumarDias(hoy, 30);     // cubre cobertura de agenda a 30 días

  const [citas, cobros, banco, caja, costes] = await Promise.all([
    sg(`citas_v2?fecha=gte.${desde}&fecha=lte.${hasta}&select=id,fecha,estado,precio,modalidad_pago,id_paciente&limit=3000`),
    sg(`cobros_v2?fecha=gte.${desde}&fecha=lte.${hoy}&select=id_cita,importe,conciliado,fecha&limit=3000`),
    sg(`movimientos_banco?select=fecha,saldo&order=fecha.desc&limit=500`),
    sg(`movimientos_caja?select=fecha,importe&order=fecha.desc&limit=1000`),
    sg(`costes_fijos?activo=eq.true&select=concepto,importe_mensual`)
  ]);

  IND.hoy = hoy;
  IND.citas = citas;
  IND.cobrosPorCita = {};
  cobros.forEach(cb => { if (cb.id_cita) IND.cobrosPorCita[cb.id_cita] = cb; });
  IND.bancoMov = banco;
  IND.cajaMov = caja;
  IND.costesFijos = costes;
  IND.semaforos = {};
}

function indRenderTodo() {
  indRenderAgenda();
  indRenderNoshow();
  indRenderPendiente();
  indRenderLiquidez();
  indRenderMargen();
  indRenderCartera();
  indRenderPill();
}

/* ── HELPERS ── */
function indFmt(v) {
  if (v == null || isNaN(v)) return '—';
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(v));
}
function indFmtFecha(f) {
  if (!f) return '—';
  return new Date(f + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function indColorSemaforo(estado) {
  return estado === 1 ? 'var(--verde)' : estado === 0 ? 'var(--amber)' : estado === -1 ? 'var(--rojo)' : 'var(--ink-muted)';
}

/* ── 1. AGENDA PRÓXIMOS 30 DÍAS + COMPOSICIÓN POR MODALIDAD ── */
function indRenderAgenda() {
  const hoy = IND.hoy;
  const hasta30 = sumarDias(hoy, 30);
  const desde90 = sumarDias(hoy, -90);

  const programadas = IND.citas.filter(c => c.estado === 'Programada' && c.fecha >= hoy && c.fecha <= hasta30);
  const hechasBase = IND.citas.filter(c => c.estado === 'Hecha' && c.fecha >= desde90 && c.fecha < hoy);
  const ritmoMensual = hechasBase.length / 3; // media de sesiones hechas por cada 30 días, últimos 90 días

  const cobertura = ritmoMensual > 0 ? Math.round(programadas.length / ritmoMensual * 100) : null;
  let estado = null;
  if (cobertura !== null) estado = cobertura >= 90 ? 1 : cobertura >= 70 ? 0 : -1;
  IND.semaforos.cobertura = estado;

  document.getElementById('ind-k-cobertura').textContent = cobertura === null ? '—' : cobertura + '%';
  document.getElementById('ind-k-cobertura-sub').textContent = cobertura === null
    ? 'Sin histórico suficiente para comparar aún'
    : `${programadas.length} sesiones agendadas · ritmo habitual ${Math.round(ritmoMensual)}/mes`;
  document.getElementById('ind-dot-cobertura').style.background = indColorSemaforo(estado);

  const grupos = {};
  programadas.forEach(c => {
    const m = c.modalidad_pago || 'OTROS';
    grupos[m] = (grupos[m] || 0) + (parseFloat(c.precio) || 0);
  });
  const total = Object.values(grupos).reduce((s, v) => s + v, 0);
  const barEl = document.getElementById('ind-modal-bar');
  const legEl = document.getElementById('ind-modal-legend');

  if (total === 0) {
    barEl.innerHTML = '';
    legEl.innerHTML = 'Sin sesiones agendadas en los próximos 30 días';
  } else {
    const activas = IND_MODAL_ORDEN.filter(m => grupos[m] > 0);
    barEl.innerHTML = activas.map(m =>
      `<div style="width:${(grupos[m] / total * 100).toFixed(1)}%;background:${IND_MODAL_COLOR[m]}"></div>`
    ).join('');
    legEl.innerHTML = activas.map(m =>
      `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px">
        <span style="width:7px;height:7px;border-radius:50%;background:${IND_MODAL_COLOR[m]};display:inline-block"></span>
        ${IND_MODAL_LABEL[m]} ${Math.round(grupos[m] / total * 100)}%
      </span>`
    ).join('');
  }
}

/* ── 2. TASA DE NO-SHOWS (mes en curso) ── */
function indRenderNoshow() {
  const hoy = IND.hoy;
  const inicioMes = hoy.slice(0, 8) + '01';
  const delMes = IND.citas.filter(c => c.fecha >= inicioMes && c.fecha <= hoy);
  const hechas = delMes.filter(c => c.estado === 'Hecha').length;
  const noshow = delMes.filter(c => c.estado === 'Noshow').length;
  const base = hechas + noshow;
  const tasa = base > 0 ? Math.round(noshow / base * 1000) / 10 : null;

  let estado = null;
  if (tasa !== null) estado = tasa < 5 ? 1 : tasa <= 10 ? 0 : -1;
  IND.semaforos.noshow = estado;

  document.getElementById('ind-k-noshow').textContent = tasa === null ? '—' : tasa.toLocaleString('es-ES') + '%';
  document.getElementById('ind-k-noshow-sub').textContent = tasa === null
    ? 'Sin sesiones registradas este mes'
    : `${noshow} de ${base} sesiones este mes`;
  document.getElementById('ind-dot-noshow').style.background = indColorSemaforo(estado);
}

/* ── 3. PENDIENTE DE COBRO CON ANTIGÜEDAD ── */
function indRenderPendiente() {
  const hoy = IND.hoy;
  const hechas = IND.citas.filter(c => c.estado === 'Hecha' && c.fecha <= hoy);
  let total = 0, b15 = 0, b30 = 0, bMas = 0;

  hechas.forEach(c => {
    const cobro = IND.cobrosPorCita[c.id];
    const cobrado = cobro ? (parseFloat(cobro.importe) || 0) : 0;
    const pend = (parseFloat(c.precio) || 0) - cobrado;
    if (pend <= 0.01) return;
    total += pend;
    const dias = Math.round((new Date(hoy) - new Date(c.fecha)) / 86400000);
    if (dias <= 15) b15 += pend; else if (dias <= 30) b30 += pend; else bMas += pend;
  });

  const shareGrande = total > 0 ? bMas / total * 100 : 0;
  const estado = total === 0 ? 1 : (shareGrande < 10 ? 1 : shareGrande <= 25 ? 0 : -1);
  IND.semaforos.pendiente = estado;

  document.getElementById('ind-k-pendiente').textContent = indFmt(total);
  document.getElementById('ind-k-pendiente-sub').textContent =
    total === 0 ? 'Todo cobrado' : `${Math.round(shareGrande)}% lleva más de 30 días`;
  document.getElementById('ind-dot-pendiente').style.background = indColorSemaforo(estado);

  const barEl = document.getElementById('ind-aging-bar');
  barEl.innerHTML = total === 0
    ? `<div style="width:100%;background:var(--verde)"></div>`
    : `<div style="width:${(b15 / total * 100).toFixed(1)}%;background:var(--verde)"></div>
       <div style="width:${(b30 / total * 100).toFixed(1)}%;background:var(--amber)"></div>
       <div style="width:${(bMas / total * 100).toFixed(1)}%;background:var(--rojo)"></div>`;
}

/* ── 4. LIQUIDEZ (BANCO + CAJA), SIN SEMÁFORO ── */
function indRenderLiquidez() {
  const hoy = IND.hoy;
  const hace4sem = sumarDias(hoy, -28);

  const saldoBancoActual = IND.bancoMov.length > 0 ? Number(IND.bancoMov[0].saldo) : 0;
  const cajaActual = IND.cajaMov.reduce((s, m) => s + Number(m.importe), 0);
  const liquidezActual = saldoBancoActual + cajaActual;

  // bancoMov viene ordenado desc por fecha: el primero con fecha <= hace4sem
  // es el saldo "a fecha" de hace 4 semanas
  const movAntiguo = IND.bancoMov.find(m => m.fecha <= hace4sem);
  const cajaAntigua = IND.cajaMov.filter(m => m.fecha <= hace4sem).reduce((s, m) => s + Number(m.importe), 0);
  const liquidezAntigua = movAntiguo ? Number(movAntiguo.saldo) + cajaAntigua : null;

  document.getElementById('ind-k-liquidez').textContent = indFmt(liquidezActual);
  const subEl = document.getElementById('ind-k-liquidez-sub');
  if (liquidezAntigua !== null) {
    const delta = liquidezActual - liquidezAntigua;
    const icono = delta >= 0 ? 'up' : 'down';
    subEl.innerHTML = `<i class="ti ti-arrow-${icono}-right" style="font-size:13px;vertical-align:-2px"></i> ${indFmt(Math.abs(delta))} vs hace 4 semanas`;
    subEl.style.color = delta >= 0 ? '#1a7a4a' : 'var(--rojo)';
  } else {
    subEl.textContent = 'Sin histórico de hace 4 semanas todavía';
    subEl.style.color = 'var(--ink-muted)';
  }
}

/* ── 5. MARGEN OPERATIVO (excluye IRPF, que es tesorería, no operativa) ── */
function indRenderMargen() {
  const hoy = IND.hoy;
  const diaHoy = parseInt(hoy.slice(8, 10), 10);
  const inicioMes = hoy.slice(0, 8) + '01';
  const inicioMesAnt = sumarDias(inicioMes, -1).slice(0, 8) + '01';
  const finMesAntComparable = sumarDias(inicioMesAnt, diaHoy - 1); // mismo nº de días que llevamos este mes

  const costesFiltrados = IND.costesFijos.filter(c => !(c.concepto || '').toLowerCase().includes('irpf'));
  const costesOperativos = costesFiltrados.reduce((s, c) => s + (parseFloat(c.importe_mensual) || 0), 0);

  const producir = (desde, hasta) => IND.citas
    .filter(c => c.estado === 'Hecha' && c.fecha >= desde && c.fecha <= hasta)
    .reduce((s, c) => s + (parseFloat(c.precio) || 0), 0);

  const sesionesMes = IND.citas.filter(c => c.estado === 'Hecha' && c.fecha >= inicioMes && c.fecha <= hoy);
  const prodMes = sesionesMes.reduce((s, c) => s + (parseFloat(c.precio) || 0), 0);
  const prodMesAntComparable = producir(inicioMesAnt, finMesAntComparable);

  const margenMes = prodMes * 0.4 - costesOperativos;
  const margenMesAntComparable = prodMesAntComparable * 0.4 - costesOperativos;

  IND.margenDetalle = { costes: costesFiltrados, sesiones: sesionesMes, prodMes, costesOperativos, margenMes };

  let estado;
  if (margenMes < 0) estado = -1;
  else if (margenMes >= margenMesAntComparable) estado = 1;
  else estado = 0;
  IND.semaforos.margen = estado;

  document.getElementById('ind-k-margen').textContent = indFmt(margenMes);
  document.getElementById('ind-k-margen-sub').textContent =
    `${indFmt(prodMes)} producción − ${indFmt(prodMes * 0.6)} reparto − ${indFmt(costesOperativos)} costes fijos`;
  document.getElementById('ind-dot-margen').style.background = indColorSemaforo(estado);
}

/* ── 6. CARTERA DE PACIENTES ACTIVOS ── */
function indRenderCartera() {
  const hoy = IND.hoy;
  const desde45 = sumarDias(hoy, -45);
  const activos = new Set(
    IND.citas.filter(c => c.estado === 'Hecha' && c.fecha >= desde45 && c.fecha <= hoy).map(c => c.id_paciente)
  );

  const inicioMes = hoy.slice(0, 8) + '01';
  const altas = (G.pacientes || []).filter(p => p.fecha_alta && p.fecha_alta >= inicioMes && p.fecha_alta <= hoy).length;

  document.getElementById('ind-k-cartera').textContent = activos.size;
  document.getElementById('ind-k-cartera-sub').textContent =
    altas > 0 ? `+${altas} alta${altas > 1 ? 's' : ''} este mes` : 'Sin altas nuevas este mes';
}

/* ── PÍLDORA RESUMEN ── */
function indRenderPill() {
  const vals = Object.values(IND.semaforos).filter(v => v !== null);
  const el = document.getElementById('ind-pill');
  if (vals.length === 0) { el.style.display = 'none'; return; }

  const verdes = vals.filter(v => v === 1).length;
  const rojos = vals.filter(v => v === -1).length;

  el.style.display = 'flex';
  el.querySelector('span').textContent = `${verdes} de ${vals.length} en verde`;
  el.style.background = rojos > 0 ? 'var(--rojo-pale)' : verdes === vals.length ? 'var(--verde-pale)' : 'var(--amber-pale)';
  const icon = el.querySelector('i');
  icon.className = rojos > 0 ? 'ti ti-alert-triangle' : verdes === vals.length ? 'ti ti-check' : 'ti ti-minus';
  icon.style.color = rojos > 0 ? 'var(--rojo)' : verdes === vals.length ? '#1a7a4a' : '#92400E';
  el.style.color = rojos > 0 ? 'var(--rojo)' : verdes === vals.length ? '#1a7a4a' : '#92400E';
}

/* ── MODAL DE DETALLE (genérico, reutilizable por otras tarjetas) ── */
function indAbrirModal(titulo, html) {
  document.getElementById('ind-modal-title').textContent = titulo;
  document.getElementById('ind-modal-body').innerHTML = html;
  document.getElementById('ind-modal-overlay').style.display = 'flex';
}
function indCerrarModal() {
  document.getElementById('ind-modal-overlay').style.display = 'none';
}

function indVerDetalleMargen() {
  const d = IND.margenDetalle;
  if (!d) return;

  const filaCoste = c => `<tr><td style="padding:4px 0;color:var(--ink-light)">${c.concepto}</td>
    <td style="padding:4px 0;text-align:right;font-family:'DM Mono',monospace">${indFmt(c.importe_mensual)}</td></tr>`;
  const filaSesion = s => `<tr><td style="padding:4px 0;color:var(--ink-light)">${indFmtFecha(s.fecha)} · ${s.id_paciente}</td>
    <td style="padding:4px 0;text-align:right;font-family:'DM Mono',monospace">${indFmt(s.precio)}</td></tr>`;

  const html = `
    <p style="font-size:13px;color:var(--ink-light);line-height:1.6;margin-bottom:16px">
      Margen = Producción del mes × 40% − Costes fijos operativos<br>
      ${indFmt(d.prodMes)} × 40% − ${indFmt(d.costesOperativos)} = <strong style="color:var(--ink)">${indFmt(d.margenMes)}</strong>
    </p>

    <p style="font-size:12px;font-weight:600;color:var(--ink);margin-bottom:6px">Costes fijos incluidos (${d.costes.length}) — excluye IRPF, que es tesorería</p>
    <table style="width:100%;font-size:12px;border-collapse:collapse;margin-bottom:18px">
      ${d.costes.map(filaCoste).join('')}
      <tr style="border-top:1px solid var(--border)">
        <td style="padding:6px 0;font-weight:600">Total costes fijos</td>
        <td style="padding:6px 0;text-align:right;font-weight:600;font-family:'DM Mono',monospace">${indFmt(d.costesOperativos)}</td>
      </tr>
    </table>

    <p style="font-size:12px;font-weight:600;color:var(--ink);margin-bottom:6px">Sesiones "Hecha" contabilizadas este mes (${d.sesiones.length})</p>
    ${d.sesiones.length === 0
      ? `<p style="font-size:12px;color:var(--ink-muted);line-height:1.5">Ninguna sesión marcada como Hecha en lo que va de mes — por eso el margen sale negativo: los costes fijos corren igual aunque todavía no haya producción registrada.</p>`
      : `<div style="max-height:220px;overflow-y:auto"><table style="width:100%;font-size:12px;border-collapse:collapse">
          ${d.sesiones.map(filaSesion).join('')}
        </table></div>`
    }
  `;
  indAbrirModal('Margen operativo — cómo se calcula', html);
}
