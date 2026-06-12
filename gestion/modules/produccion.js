/* ═══════════════════════════════════════════
   PRODUCCIÓN 360°
═══════════════════════════════════════════ */
const PROD = {
  citas: [], cobros: {}, filtradas: [],
  desde: null, hasta: null, estado: 'todas',
  ordenCampo: 'fecha', ordenDir: 'asc',
  pagina: 1, porPagina: 20
};

function prodFmtFecha(d) {
  if (!d) return '—';
  const [y, m, dia] = d.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(dia)} ${meses[parseInt(m)-1]}`;
}

function prodFmtEur(n) {
  return Number(n).toLocaleString('es-ES',{minimumFractionDigits:0,maximumFractionDigits:0}) + ' €';
}

function prodNombreCorto(id) {
  const p = G.profesionales && G.profesionales.find(x => x.id === id);
  if (!p) return id;
  return p.nombre.split(' ')[0] + ' ' + (p.apellidos||'').split(' ')[0].charAt(0) + '.';
}

function prodNombrePaciente(id) {
  const p = G.pacientes && G.pacientes.find(x => x.id === id);
  if (!p) return id;
  const ap = (p.apellidos||'').split(' ');
  return `${p.nombre} ${ap[0]||''}`.trim();
}

function prodCalcPeriod(tipo) {
  const hoy = new Date();
  const y = hoy.getFullYear(), m = hoy.getMonth(), d = hoy.getDate();
  let desde, hasta;
  if (tipo === 'hoy') {
    desde = hasta = hoy.toISOString().slice(0,10);
  } else if (tipo === 'semana') {
    const lun = new Date(hoy); lun.setDate(d - ((hoy.getDay()||7)-1));
    const dom = new Date(lun); dom.setDate(lun.getDate()+6);
    desde = lun.toISOString().slice(0,10); hasta = dom.toISOString().slice(0,10);
  } else if (tipo === 'mes') {
    desde = `${y}-${String(m+1).padStart(2,'0')}-01`;
    hasta = new Date(y, m+1, 0).toISOString().slice(0,10);
  } else if (tipo === 'mes_ant') {
    const ma = new Date(y, m, 0);
    desde = `${ma.getFullYear()}-${String(ma.getMonth()+1).padStart(2,'0')}-01`;
    hasta = ma.toISOString().slice(0,10);
  } else if (tipo === 'trimestre') {
    const qt = Math.floor(m/3);
    desde = `${y}-${String(qt*3+1).padStart(2,'0')}-01`;
    hasta = new Date(y, qt*3+3, 0).toISOString().slice(0,10);
  } else if (tipo === 'anio') {
    desde = `${y}-01-01`; hasta = `${y}-12-31`;
  }
  return {desde, hasta};
}

function prodSetPeriod(el) {
  document.querySelectorAll('#prod-period-pills .prod-pill').forEach(p => p.classList.remove('prod-pill-active'));
  el.classList.add('prod-pill-active');
  const {desde, hasta} = prodCalcPeriod(el.dataset.period);
  PROD.desde = desde; PROD.hasta = hasta;
  document.getElementById('prod-fecha-desde').value = desde;
  document.getElementById('prod-fecha-hasta').value = hasta;
  PROD.pagina = 1;
  prodCargar();
}

function prodSetCustomRange() {
  const desde = document.getElementById('prod-fecha-desde').value;
  const hasta = document.getElementById('prod-fecha-hasta').value;
  if (!desde || !hasta) return;
  PROD.desde = desde; PROD.hasta = hasta;
  document.querySelectorAll('#prod-period-pills .prod-pill').forEach(p => p.classList.remove('prod-pill-active'));
  PROD.pagina = 1;
  prodCargar();
}

function prodSetEstado(el) {
  document.querySelectorAll('#prod-estado-pills .prod-pill').forEach(p => p.classList.remove('prod-pill-active'));
  el.classList.add('prod-pill-active');
  PROD.estado = el.dataset.estado;
  PROD.pagina = 1;
  prodAplicarFiltros();
}

function prodToggleExtra() {
  const panel = document.getElementById('prod-extra-filters');
  const chev = document.getElementById('prod-chevron-extra');
  const open = panel.style.display === 'flex';
  panel.style.display = open ? 'none' : 'flex';
  chev.style.transform = open ? '' : 'rotate(180deg)';
}

function prodOrdenar(campo) {
  if (PROD.ordenCampo === campo) {
    PROD.ordenDir = PROD.ordenDir === 'asc' ? 'desc' : 'asc';
  } else {
    PROD.ordenCampo = campo; PROD.ordenDir = 'asc';
  }
  prodRenderTabla();
}

async function prodCargar() {
  if (!PROD.desde || !PROD.hasta) return;
  document.getElementById('prod-loading').style.display = 'block';
  document.getElementById('prod-tabla').style.display = 'none';
  document.getElementById('prod-empty').style.display = 'none';
  document.getElementById('prod-footer').style.display = 'none';
  try {
    const citas = await sg(`citas_v2?fecha=gte.${PROD.desde}&fecha=lte.${PROD.hasta}&order=fecha.asc,hora.asc&limit=2000`);
    PROD.citas = citas;
    if (citas.length > 0) {
      const ids = citas.map(c => c.id).join(',');
      const cobros = await sg(`cobros_v2?id_cita=in.(${ids})&limit=2000`);
      PROD.cobros = {};
      cobros.forEach(cb => { PROD.cobros[cb.id_cita] = cb; });
    } else {
      PROD.cobros = {};
    }
    prodPoblarSelectProfesional();
    prodAplicarFiltros();
  } catch(e) {
    document.getElementById('prod-loading').innerHTML =
      `<i class="ti ti-alert-circle" style="font-size:20px;margin-bottom:8px;display:block;color:#DA291C"></i>Error al cargar: ${e.message}`;
  }
}

function prodPoblarSelectProfesional() {
  const sel = document.getElementById('prod-sel-profesional');
  const val = sel.value;
  sel.innerHTML = '<option value="">Todas</option>';
  const ids = [...new Set(PROD.citas.map(c => c.id_profesional).filter(Boolean))];
  ids.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = prodNombreCorto(id);
    sel.appendChild(opt);
  });
  if (val) sel.value = val;
}

function prodAplicarFiltros() {
  const prof    = document.getElementById('prod-sel-profesional').value;
  const espec   = document.getElementById('prod-sel-especialidad').value;
  const modal   = document.getElementById('prod-sel-modalidad').value;
  const cobrado = document.getElementById('prod-sel-cobrado').value;
  const concil  = document.getElementById('prod-sel-conciliado').value;
  const busq    = (document.getElementById('prod-busq-paciente').value||'').toLowerCase().trim();

  PROD.filtradas = PROD.citas.filter(c => {
    if (PROD.estado !== 'todas' && c.estado !== PROD.estado) return false;
    if (prof && c.id_profesional !== prof) return false;
    if (espec && c.especialidad !== espec) return false;
    if (modal && c.modalidad_pago !== modal) return false;
    if (cobrado) {
      const tieneCobro = !!PROD.cobros[c.id];
      if (cobrado === 'si' && !tieneCobro) return false;
      if (cobrado === 'no' && tieneCobro) return false;
    }
    if (concil) {
      const cb = PROD.cobros[c.id];
      const esConcil = cb && cb.conciliado === 'Si';
      if (concil === 'si' && !esConcil) return false;
      if (concil === 'no' && esConcil) return false;
    }
    if (busq) {
      const pac = G.pacientes && G.pacientes.find(x => x.id === c.id_paciente);
      const txt = pac ? `${pac.nombre} ${pac.apellidos||''} ${c.id_paciente}`.toLowerCase() : c.id_paciente.toLowerCase();
      if (!txt.includes(busq)) return false;
    }
    return true;
  });

  PROD.pagina = 1;
  prodActualizarKPIs();
  prodRenderTabla();
}

function prodActualizarKPIs() {
  const f = PROD.filtradas;
  const hechas  = f.filter(c => c.estado === 'Hecha').length;
  const noshows = f.filter(c => c.estado === 'Noshow').length;
  const conCita = hechas + noshows;
  const tasa    = conCita > 0 ? Math.round(hechas / conCita * 100) : null;
  const produccion = f.reduce((s, c) => s + (parseFloat(c.precio)||0), 0);
  const cobrado    = f.reduce((s, c) => { const cb = PROD.cobros[c.id]; return s + (cb ? parseFloat(cb.importe)||0 : 0); }, 0);
  const pendiente  = produccion - cobrado;

  document.getElementById('prod-kpi-sesiones').textContent = f.length;
  document.getElementById('prod-kpi-sesiones-sub').textContent = noshows > 0 ? `${noshows} no show${noshows>1?'s':''}` : '';
  document.getElementById('prod-kpi-produccion').textContent = prodFmtEur(produccion);
  document.getElementById('prod-kpi-produccion-sub').textContent = f.length > 0 ? prodFmtEur(Math.round(produccion/f.length)) + ' / sesión media' : '';
  document.querySelectorAll('.prod-kpi-admin').forEach(el => el.style.display = G.esAdmin ? '' : 'none');
  document.getElementById('prod-kpi-cobrado').textContent = prodFmtEur(cobrado);
  document.getElementById('prod-kpi-cobrado-sub').textContent = pendiente > 0 ? prodFmtEur(Math.round(pendiente)) + ' pendiente' : 'todo cobrado';
  document.getElementById('prod-kpi-asistencia').textContent = tasa !== null ? tasa + ' %' : '—';

  document.getElementById('prod-foot-total').textContent = f.length;
  document.getElementById('prod-foot-produccion').textContent = prodFmtEur(produccion);
  document.getElementById('prod-foot-cobrado').textContent = prodFmtEur(cobrado);
  document.getElementById('prod-foot-pendiente').textContent = prodFmtEur(Math.round(pendiente));
  document.querySelectorAll('.prod-footer-admin').forEach(el => el.style.display = G.esAdmin ? '' : 'none');

  const mesesN = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  let periodoText = '';
  if (PROD.desde && PROD.hasta) {
    periodoText = PROD.desde === PROD.hasta ? prodFmtFecha(PROD.desde) : `${prodFmtFecha(PROD.desde)} – ${prodFmtFecha(PROD.hasta)}`;
  }
  document.getElementById('prod-subtitulo').textContent = `${periodoText} · ${f.length} resultado${f.length!==1?'s':''}`;
}

function prodRenderTabla() {
  const tbody   = document.getElementById('prod-tbody');
  const tabla   = document.getElementById('prod-tabla');
  const empty   = document.getElementById('prod-empty');
  const footer  = document.getElementById('prod-footer');
  const loading = document.getElementById('prod-loading');
  loading.style.display = 'none';

  if (PROD.filtradas.length === 0) {
    tabla.style.display = 'none'; empty.style.display = 'block'; footer.style.display = 'none'; return;
  }

  const dir = PROD.ordenDir === 'asc' ? 1 : -1;
  const sorted = [...PROD.filtradas].sort((a, b) => {
    const va = a[PROD.ordenCampo]||'', vb = b[PROD.ordenCampo]||'';
    return va < vb ? -dir : va > vb ? dir : 0;
  });

  const inicio = (PROD.pagina - 1) * PROD.porPagina;
  const pagina = sorted.slice(inicio, inicio + PROD.porPagina);

  const badgeEstado = {Hecha:'prod-badge-hecha',Noshow:'prod-badge-noshow',Cancelada:'prod-badge-cancelada',Programada:'prod-badge-programada',Reprogramada:'prod-badge-reprogramada'};
  const etiqEstado  = {Hecha:'Hecha',Noshow:'No show',Cancelada:'Cancelada',Programada:'Programada',Reprogramada:'Reprogramada'};
  const badgeModal  = {BECA:'prod-badge-beca',BONO:'prod-badge-bono',PRIVADO_SU:'prod-badge-privado',ADECCO:'prod-badge-adecco',OTROS:'prod-badge-otros'};
  const etiqModal   = {BECA:'BECA',BONO:'BONO',PRIVADO_SU:'PRIVADO',ADECCO:'ADECCO',OTROS:'OTROS'};

  tbody.innerHTML = pagina.map(c => {
    const cobrado = !!PROD.cobros[c.id];
    const cobroHtml = cobrado
      ? `<i class="ti ti-circle-check prod-cobro-check" title="Cobrada"></i>`
      : `<i class="ti ti-circle prod-cobro-vacio" title="Sin cobro"></i>`;
    return `<tr onclick="prodVerPaciente('${c.id_paciente}')">
      <td>${prodFmtFecha(c.fecha)}</td>
      <td>${c.hora ? c.hora.slice(0,5) : '—'}</td>
      <td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${prodNombrePaciente(c.id_paciente)}</td>
      <td style="color:var(--ink-muted)">${prodNombreCorto(c.id_profesional)}</td>
      <td>${c.especialidad||'—'}</td>
      <td><span class="prod-badge ${badgeModal[c.modalidad_pago]||'prod-badge-otros'}">${etiqModal[c.modalidad_pago]||c.modalidad_pago||'—'}</span></td>
      <td style="text-align:right">${c.precio != null ? prodFmtEur(c.precio) : '—'}</td>
      <td style="text-align:center">${cobroHtml}</td>
      <td><span class="prod-badge ${badgeEstado[c.estado]||''}">${etiqEstado[c.estado]||c.estado||'—'}</span></td>
      <td style="text-align:center"><i class="ti ti-arrow-right" style="font-size:13px;color:var(--ink-muted)"></i></td>
    </tr>`;
  }).join('');

  tabla.style.display = 'table'; empty.style.display = 'none'; footer.style.display = 'flex';

  const total = PROD.filtradas.length;
  const totalPags = Math.ceil(total / PROD.porPagina);
  const desde = inicio + 1;
  const hasta = Math.min(inicio + PROD.porPagina, total);
  let pagHtml = `${desde}–${hasta} de ${total}`;
  if (totalPags > 1) {
    pagHtml += ` &nbsp;<button onclick="event.stopPropagation();prodPagina(${PROD.pagina-1})" ${PROD.pagina===1?'disabled':''} style="padding:2px 8px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--white);cursor:pointer">‹</button>`;
    pagHtml += ` <button onclick="event.stopPropagation();prodPagina(${PROD.pagina+1})" ${PROD.pagina===totalPags?'disabled':''} style="padding:2px 8px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--white);cursor:pointer">›</button>`;
  }
  document.getElementById('prod-foot-pag').innerHTML = pagHtml;
}

function prodPagina(n) {
  const total = Math.ceil(PROD.filtradas.length / PROD.porPagina);
  if (n < 1 || n > total) return;
  PROD.pagina = n;
  prodRenderTabla();
}

function prodVerPaciente(idPaciente) {
  navTo('pacientes');
  setTimeout(() => {
    const input = document.getElementById('pac-busqueda');
    if (input) { input.value = idPaciente; input.dispatchEvent(new Event('input')); }
    if (typeof abrirFichaPaciente === 'function') abrirFichaPaciente(idPaciente);
  }, 150);
}

function prodInit() {
  if (PROD.desde) { prodCargar(); return; }
  const {desde, hasta} = prodCalcPeriod('mes');
  PROD.desde = desde; PROD.hasta = hasta;
  document.getElementById('prod-fecha-desde').value = desde;
  document.getElementById('prod-fecha-hasta').value = hasta;
  prodCargar();
}
