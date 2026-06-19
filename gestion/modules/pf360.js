/* ═══════════════════════════════════════════
   PROFESIONALES 360°
   Ficha de detalle: Resumen / Datos / Histórico
   Depende de: PRO, PRO_PALETA, proColor() (profesionales.js)
               prodCalcPeriod() (produccion.js)
               sg/sp/spatch/toast/fmtEur/fmtFecha/campo() (index.html)
═══════════════════════════════════════════ */
const PF = {
  actual: null,       // profesional abierto
  liqMes: null,       // liquidación oficial del mes en curso (o null si no calculada aún)
  citasMes: [],        // citas Hecha del profesional en el mes en curso
  historico: [],        // liquidaciones pasadas del profesional
};

const PF_ETIQ_MODAL  = {BECA:'Beca',BONO:'Bono',PRIVADO_SU:'Privado',ADECCO:'Adecco',OTROS:'Otros'};
const PF_BADGE_MODAL = {BECA:'prod-badge-beca',BONO:'prod-badge-bono',PRIVADO_SU:'prod-badge-privado',ADECCO:'prod-badge-adecco',OTROS:'prod-badge-otros'};

/* ── Navegación lista / ficha ── */
function pfVolverLista() {
  document.getElementById('pf-lista-view').style.display = '';
  document.getElementById('pf-360-view').style.display = 'none';
  PF.actual = null;
}

async function pfAbrirFicha(idx) {
  const p = PRO.lista[idx];
  if (!p) { toast('Profesional no encontrado', true); return; }
  PF.actual = p;

  document.getElementById('pf-lista-view').style.display = 'none';
  document.getElementById('pf-360-view').style.display = 'flex';

  pfTab('resumen', document.querySelector('#pf-tabs .p360-tab'));
  pfRenderHeader(p, idx);

  document.getElementById('pf-panel-resumen').innerHTML = `<div class="loading-row"><span class="spinner"></span></div>`;
  document.getElementById('pf-panel-historico').innerHTML = `<div class="loading-row"><span class="spinner"></span></div>`;

  pfRenderDatos(p);
  await Promise.all([pfCargarResumen(p), pfCargarHistorico(p)]);
}

function pfTab(name, el) {
  document.querySelectorAll('#pf-tabs .p360-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#pf-360-view .p360-panel').forEach(pn => pn.classList.remove('active'));
  el.classList.add('active');
  const panel = document.getElementById('pf-panel-' + name);
  if (panel) panel.classList.add('active');
}

/* ── Cabecera ── */
function pfRenderHeader(p, idx) {
  const color = proColor(p, idx);
  const ini = ((p.nombre?.[0]||'') + (p.apellidos?.[0]||'')).toUpperCase();
  document.getElementById('pf-avatar').textContent = ini;
  document.getElementById('pf-avatar').style.background = color;
  document.getElementById('pf-nombre').textContent = `${p.nombre} ${p.apellidos||''}`.trim();
  document.getElementById('pf-id').textContent = p.id;

  const rolBadge = p.es_admin === 'Si' ? `<span class="pro-badge-admin">Admin</span>` : `<span class="pro-badge-pro">Profesional</span>`;
  const estadoBadge = p.activa === 'Si' ? `<span class="pro-badge-activa">Activa</span>` : `<span class="pro-badge-inactiva">Inactiva</span>`;

  let certBadge;
  if (!p.pdf_delitos_sexuales) {
    certBadge = `<span class="pro-badge-cert-no">Sin certificado</span>`;
  } else {
    const vence = new Date(p.fecha_pdf_delitos);
    vence.setFullYear(vence.getFullYear() + 5);
    const dias = Math.floor((vence - Date.now()) / 86400000);
    certBadge = dias < 180
      ? `<span class="pro-badge-cert-cauca" title="Vence ${vence.toLocaleDateString('es-ES')}">Caduca pronto</span>`
      : `<span class="pro-badge-cert-ok" title="Vence ${vence.toLocaleDateString('es-ES')}">Vigente</span>`;
  }
  document.getElementById('pf-badges').innerHTML = rolBadge + estadoBadge + certBadge;

  document.getElementById('pf-btn-editar').onclick = function() { proAbrirModal(idx); };
}

/* ── RESUMEN (mes en curso) ── */
async function pfCargarResumen(p) {
  const {desde, hasta} = prodCalcPeriod('mes');
  const hoy = new Date();
  const etiquetaMes = `${['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][hoy.getMonth()]} ${hoy.getFullYear()}`;

  try {
    const [citas, liqRows] = await Promise.all([
      sg(`citas_v2?id_profesional=eq.${p.id}&fecha=gte.${desde}&fecha=lte.${hasta}&estado=eq.Hecha&select=id,modalidad_pago,precio,fecha&limit=500`),
      sg(`liquidaciones_profesionales?id_profesional=eq.${p.id}&periodo_desde=eq.${desde}&periodo_hasta=eq.${hasta}&select=*&limit=1`)
    ]);
    PF.citasMes = citas || [];
    PF.liqMes = (liqRows && liqRows[0]) || null;

    // Desglose por modalidad
    const porModal = {};
    citas.forEach(c => { porModal[c.modalidad_pago] = (porModal[c.modalidad_pago]||0) + 1; });
    const pillsHtml = Object.keys(PF_ETIQ_MODAL).filter(m => porModal[m]).map(m =>
      `<span class="prod-badge ${PF_BADGE_MODAL[m]}">${PF_ETIQ_MODAL[m]} ${porModal[m]}</span>`
    ).join(' ') || `<span style="font-size:12px;color:var(--ink-muted)">Sin sesiones realizadas este mes</span>`;

    // Cobrado efectivo vs banco — solo sesiones no-Beca, vía cobros_v2 ligado a la cita
    const idsCitasNoBeca = citas.filter(c => c.modalidad_pago !== 'BECA').map(c => c.id);
    let efectivo = 0, banco = 0;
    if (idsCitasNoBeca.length) {
      const cobros = await sg(`cobros_v2?id_cita=in.(${idsCitasNoBeca.join(',')})&select=importe,metodo&limit=500`);
      cobros.forEach(c => {
        const imp = Number(c.importe) || 0;
        if (c.metodo === 'Efectivo') efectivo += imp; else banco += imp;
      });
    }

    // Calculado en vivo (mismo cálculo que Cobros > Liquidaciones)
    const bruto = citas.reduce((s,c) => s + Number(c.precio||0), 0);
    const pct = Number(p.porcentaje_reparto) || 60;
    const calculadoVivo = Math.round(bruto * pct) / 100;

    document.getElementById('pf-panel-resumen').innerHTML = pfPlantillaResumen({
      etiquetaMes, pillsHtml, sesiones: citas.length, efectivo, banco,
      calculado: PF.liqMes ? Number(PF.liqMes.importe_calculado) : calculadoVivo,
      esOficial: !!PF.liqMes,
    });
  } catch(e) {
    document.getElementById('pf-panel-resumen').innerHTML =
      `<div class="empty-state" style="color:var(--rojo)">Error al cargar el resumen: ${e.message}</div>`;
  }
}

function pfPlantillaResumen({etiquetaMes, pillsHtml, sesiones, efectivo, banco, calculado, esOficial}) {
  const liq = PF.liqMes;
  const facturado = liq?.importe_facturado != null ? Number(liq.importe_facturado) : null;
  const diferencia = facturado != null ? Math.round((calculado - facturado) * 100) / 100 : null;
  const hayDiscrepancia = diferencia !== null && Math.abs(diferencia) > 0.01;

  let discrepanciaBox = '';
  if (esOficial && facturado != null) {
    discrepanciaBox = hayDiscrepancia
      ? `<div class="card" style="border-color:#FAC775;margin-bottom:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div>
              <div style="font-size:12px;color:var(--ink-muted);margin-bottom:4px"><i class="ti ti-alert-triangle" style="color:#854F0B;vertical-align:-2px;margin-right:4px"></i>Discrepancia con la factura presentada</div>
              <div style="font-size:13px">Calculado por sistema <strong>${fmtEur(calculado)}</strong> · facturado por la profesional <strong>${fmtEur(facturado)}</strong></div>
            </div>
            <span style="font-size:13px;font-weight:700;color:#854F0B">${diferencia > 0 ? '+' : ''}${fmtEur(diferencia)}</span>
          </div>
        </div>`
      : `<div class="card" style="margin-bottom:10px">
          <div style="font-size:12px;color:var(--ink-muted)"><i class="ti ti-check" style="color:#3B6D11;vertical-align:-2px;margin-right:4px"></i>Calculado y facturado coinciden — ${fmtEur(calculado)}</div>
        </div>`;
  }

  const estadoBadge = !esOficial
    ? `<span class="pro-badge-pro">Sin calcular aún</span>`
    : liq.estado === 'Pagado'
      ? `<span class="pro-badge-activa">Pagado</span>`
      : `<span class="pro-badge-cert-cauca">Pendiente</span>`;

  const avisoNoOficial = !esOficial
    ? `<div style="font-size:12px;color:var(--ink-muted);margin-bottom:10px">Cifra de producción estimada — la liquidación oficial de este mes aún no se ha calculado en Cobros &gt; Liquidaciones.</div>`
    : '';

  const certUploadHtml = pfBloqueFactura(liq, facturado);

  return `
    <p style="font-size:13px;color:var(--ink-muted);margin:0 0 12px;text-transform:capitalize">${etiquetaMes} · se actualiza automáticamente con cada sesión</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${pillsHtml}</div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-l">Sesiones</div><div class="kpi-v">${sesiones}</div></div>
      <div class="kpi"><div class="kpi-l">Cobrado efectivo</div><div class="kpi-v" style="font-size:18px">${fmtEur(efectivo)}</div></div>
      <div class="kpi"><div class="kpi-l">Cobrado banco</div><div class="kpi-v" style="font-size:18px">${fmtEur(banco)}</div></div>
      <div class="kpi blue"><div class="kpi-l">A liquidar</div><div class="kpi-v" style="font-size:18px">${fmtEur(calculado)}</div></div>
    </div>
    ${avisoNoOficial}
    ${discrepanciaBox}
    <div class="card">
      <div class="card-title">Liquidación de ${etiquetaMes} ${estadoBadge}</div>
      ${certUploadHtml}
    </div>
  `;
}

function pfBloqueFactura(liq, facturado) {
  if (!liq) {
    return `<div style="font-size:12px;color:var(--ink-muted)">Disponible en cuanto se calcule la liquidación del mes desde Cobros &gt; Liquidaciones.</div>`;
  }
  const tienePdf = !!liq.pdf_factura;
  const yaPagado = liq.estado === 'Pagado';

  return `
    <div id="pf-factura-zona">
      ${tienePdf ? `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <i class="ti ti-file-check" style="color:var(--azul);font-size:18px"></i>
          <span style="font-size:13px;color:var(--azul);font-weight:600">Factura registrada · ${fmtEur(facturado)}</span>
          <button class="btn btn-sec" style="padding:4px 10px;font-size:11px" onclick="pfVerFactura()">Ver PDF</button>
        </div>
      ` : `
        <label class="pro-cert-drop" id="pf-factura-drop" style="display:block;margin-bottom:10px">
          <input type="file" id="pf-factura-input" accept="application/pdf" style="display:none" onchange="pfArchivoFacturaCambiado(this)">
          <i class="ti ti-upload" style="font-size:18px"></i>
          <span>Arrastra el PDF de la factura o <strong>haz clic para seleccionar</strong></span>
        </label>
        <div id="pf-factura-importe-row" style="display:none;align-items:center;gap:8px;margin-bottom:10px">
          <label style="font-size:12px;color:var(--ink-muted)">Importe facturado</label>
          <input type="number" id="pf-factura-importe" step="0.01" style="width:110px" placeholder="0,00">
          <button class="btn btn-pri" style="padding:5px 12px;font-size:12px" onclick="pfGuardarFactura('${liq.id}')">Guardar</button>
        </div>
      `}
      <button class="btn ${yaPagado ? 'btn-sec' : 'btn-pri'}" ${(!tienePdf || yaPagado) ? 'disabled' : ''}
        title="${!tienePdf ? 'Sube primero la factura de este periodo' : ''}"
        onclick="pfRegistrarPago('${liq.id}')">
        <i class="ti ti-check" style="font-size:14px"></i> ${yaPagado ? 'Pagado el ' + fmtFecha(liq.fecha_pago) : 'Registrar pago'}
      </button>
    </div>
  `;
}

let PF_archivoFactura = null;
function pfArchivoFacturaCambiado(input) {
  if (!input.files?.length) return;
  const f = input.files[0];
  if (f.type !== 'application/pdf') { toast('Solo se aceptan archivos PDF', true); return; }
  if (f.size > 10 * 1024 * 1024) { toast('El archivo supera 10 MB', true); return; }
  PF_archivoFactura = f;
  document.getElementById('pf-factura-drop').querySelector('span').innerHTML = `<strong>${f.name}</strong> seleccionado`;
  document.getElementById('pf-factura-importe-row').style.display = 'flex';
}

async function pfGuardarFactura(idLiq) {
  if (!PF_archivoFactura) { toast('Selecciona primero el PDF', true); return; }
  const importe = parseFloat(document.getElementById('pf-factura-importe').value);
  if (isNaN(importe) || importe <= 0) { toast('Indica el importe facturado', true); return; }

  try {
    const ext = PF_archivoFactura.name.split('.').pop();
    const ruta = `${PF.actual.id}/${idLiq}.${ext}`;
    const up = await fetch(`${SUPA_URL}/storage/v1/object/facturas_profesionales/${ruta}`, {
      method: 'POST',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${G.sesion.access_token}`,
        'Content-Type': PF_archivoFactura.type,
        'x-upsert': 'true'
      },
      body: PF_archivoFactura
    });
    if (!up.ok) { const err = await up.json().catch(()=>({})); throw new Error(err.message || up.status); }

    await spatch('liquidaciones_profesionales', idLiq, { importe_facturado: importe, pdf_factura: ruta });
    toast('Factura registrada');
    PF_archivoFactura = null;
    await pfCargarResumen(PF.actual);
  } catch(e) {
    toast('Error al subir la factura: ' + e.message, true);
  }
}

async function pfVerFactura() {
  if (!PF.liqMes?.pdf_factura) return;
  try {
    const res = await fetch(`${SUPA_URL}/storage/v1/object/sign/facturas_profesionales/${PF.liqMes.pdf_factura}`, {
      method: 'POST',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${G.sesion.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 60 })
    });
    if (!res.ok) throw new Error('No se pudo generar la URL');
    const data = await res.json();
    window.open(`${SUPA_URL}/storage/v1${data.signedURL}`, '_blank');
  } catch(e) {
    toast('Error al abrir la factura: ' + e.message, true);
  }
}

async function pfRegistrarPago(idLiq) {
  const liq = PF.liqMes;
  if (!liq || !liq.pdf_factura) return;
  const importeSugerido = liq.importe_facturado ?? liq.importe_calculado;
  const medio = confirm(`Registrar pago de ${fmtEur(importeSugerido)} a ${PF.actual.nombre}.\n\nAceptar = pagado por banco. Cancelar = pagado en efectivo.`);
  const hoy = new Date().toISOString().slice(0,10);
  try {
    await spatch('liquidaciones_profesionales', idLiq, {
      estado: 'Pagado',
      importe_acordado: importeSugerido,
      medio_pago: medio ? 'Transferencia' : 'Efectivo',
      fecha_pago: hoy
    });
    if (!medio) {
      // Pago en efectivo → registrar salida en caja
      await sp('movimientos_caja', {
        id: 'CAJ-' + Date.now().toString(36).toUpperCase(),
        fecha: hoy,
        concepto: `Liquidación ${PF.actual.nombre} ${PF.actual.apellidos||''}`.trim(),
        importe: -Math.abs(importeSugerido),
        categoria: 'Pago profesional',
        id_liquidacion: idLiq
      });
    }
    toast('Pago registrado');
    await pfCargarResumen(PF.actual);
  } catch(e) {
    toast('Error al registrar el pago: ' + e.message, true);
  }
}

/* ── DATOS (lectura) ── */
function pfRenderDatos(p) {
  document.getElementById('pf-datos-identidad').innerHTML = [
    campo('Nombre completo', `${p.nombre||''} ${p.apellidos||''}`.trim()),
    campo('Email', p.email),
    campo('ID', p.id),
    campo('Rol', p.es_admin === 'Si' ? 'Admin' : 'Profesional'),
    campo('Estado', p.activa === 'Si' ? 'Activa' : 'Inactiva'),
  ].join('');

  document.getElementById('pf-datos-clinica').innerHTML = [
    campo('Especialidades', (p.especialidades||[]).join(', ')),
    campo('% de reparto', p.porcentaje_reparto != null ? `${p.porcentaje_reparto}%` : '60% (por defecto)'),
    campo('Color en agenda', p.color_agenda),
  ].join('');

  const certTxt = !p.pdf_delitos_sexuales
    ? 'Sin certificado registrado'
    : `Registrado el ${fmtFecha(p.fecha_pdf_delitos)}`;
  document.getElementById('pf-datos-cert').innerHTML = campo('Certificado de delitos sexuales', certTxt);
}

/* ── HISTÓRICO ── */
async function pfCargarHistorico(p) {
  try {
    const liqs = await sg(`liquidaciones_profesionales?id_profesional=eq.${p.id}&order=periodo_desde.desc&select=*&limit=100`);
    PF.historico = liqs || [];
    if (!liqs.length) {
      document.getElementById('pf-panel-historico').innerHTML =
        `<div class="empty-state">Aún no hay liquidaciones registradas para ${p.nombre}</div>`;
      return;
    }

    // Sesiones por periodo: una sola query que cubre todo el rango histórico
    const minDesde = liqs.reduce((m,l) => l.periodo_desde < m ? l.periodo_desde : m, liqs[0].periodo_desde);
    const maxHasta = liqs.reduce((m,l) => l.periodo_hasta > m ? l.periodo_hasta : m, liqs[0].periodo_hasta);
    const citas = await sg(`citas_v2?id_profesional=eq.${p.id}&fecha=gte.${minDesde}&fecha=lte.${maxHasta}&estado=eq.Hecha&select=id,fecha&limit=3000`);

    const filas = liqs.map(l => {
      const sesiones = citas.filter(c => c.fecha >= l.periodo_desde && c.fecha <= l.periodo_hasta).length;
      const facturado = l.importe_facturado != null ? Number(l.importe_facturado) : null;
      const diferencia = facturado != null ? Math.round((Number(l.importe_calculado) - facturado) * 100) / 100 : null;
      const periodoTxt = fmtFecha(l.periodo_desde) === fmtFecha(l.periodo_hasta)
        ? fmtFecha(l.periodo_desde)
        : `${fmtFecha(l.periodo_desde)} – ${fmtFecha(l.periodo_hasta)}`;
      const estadoBadge = l.estado === 'Pagado'
        ? `<span class="pro-badge-activa">Pagado</span>`
        : `<span class="pro-badge-cert-cauca">Pendiente</span>`;
      return `<tr class="pf-hist-row" onclick="pfVerEnProduccion('${l.periodo_desde}','${l.periodo_hasta}','${p.id}')">
        <td>${periodoTxt}</td>
        <td style="text-align:right">${sesiones}</td>
        <td style="text-align:right">${fmtEur(l.importe_calculado)}</td>
        <td style="text-align:right">${facturado != null ? fmtEur(facturado) : '<span style="color:var(--ink-muted)">—</span>'}</td>
        <td style="text-align:right${diferencia && Math.abs(diferencia)>0.01 ? ';color:#854F0B;font-weight:600' : ';color:var(--ink-muted)'}">${diferencia != null ? fmtEur(diferencia) : '—'}</td>
        <td>${estadoBadge}</td>
        <td style="text-align:right"><i class="ti ti-arrow-right" style="font-size:14px;color:var(--ink-muted)"></i></td>
      </tr>`;
    }).join('');

    document.getElementById('pf-panel-historico').innerHTML = `
      <div class="table-wrap">
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr>
              <th>Periodo</th><th style="text-align:right">Sesiones</th><th style="text-align:right">Calculado</th>
              <th style="text-align:right">Facturado</th><th style="text-align:right">Dif.</th><th>Estado</th><th></th>
            </tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
      </div>
      <p style="font-size:12px;color:var(--ink-muted);margin-top:10px">Cada fila abre el detalle de sesiones en Producción 360°, filtrado por esta profesional y ese periodo.</p>
    `;
  } catch(e) {
    document.getElementById('pf-panel-historico').innerHTML =
      `<div class="empty-state" style="color:var(--rojo)">Error al cargar el histórico: ${e.message}</div>`;
  }
}

function pfVerEnProduccion(desde, hasta, idProfesional) {
  navTo('produccion');
  document.querySelectorAll('#prod-period-pills .prod-pill').forEach(el => el.classList.remove('prod-pill-active'));
  PROD.desde = desde; PROD.hasta = hasta;
  const fDesde = document.getElementById('prod-fecha-desde');
  const fHasta = document.getElementById('prod-fecha-hasta');
  if (fDesde) fDesde.value = desde;
  if (fHasta) fHasta.value = hasta;
  prodCargar().then(() => {
    const sel = document.getElementById('prod-sel-profesional');
    if (sel) { sel.value = idProfesional; prodAplicarFiltros(); }
  });
}
