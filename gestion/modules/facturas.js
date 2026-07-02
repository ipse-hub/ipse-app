/* ═══════════════════════════════════════════
   FACTURAS — ESTADO
═══════════════════════════════════════════ */
const FACT = {
  facturas:    [],
  filtradas:   [],
  editandoId:  null,
  lineas:      [],
  emisor:      null
};

const LOGO_B64 = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgNDAiPjx0ZXh0IHk9IjMwIiBmb250LXNpemU9IjI4IiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0iIzEwMDY5RiI+SVBTRTwvdGV4dD48L3N2Zz4=';

function fmtEurFact(v) {
  const n = parseFloat(v) || 0;
  const [e, d] = n.toFixed(2).split('.');
  return e + "'" + d + ' €';
}

/* ── Carga inicial ── */
async function factCargar() {
  const anio = document.getElementById('fact-filtro-anio')?.value || '2026';
  try {
    FACT.facturas = await sg(`facturas?fecha=gte.${anio}-01-01&fecha=lte.${anio}-12-31&order=fecha.desc,numero_factura.desc&limit=500&select=*`);
    factFiltrar();
    const n = FACT.facturas.length;
    document.getElementById('fact-count-label').textContent = `${n} factura${n!==1?'s':''} en ${anio}`;
  } catch(e) {
    document.getElementById('fact-tbody').innerHTML =
      `<tr><td colspan="9" style="color:var(--rojo);padding:14px">Error: ${e.message}</td></tr>`;
  }
}

async function factCargarEmisor() {
  if (FACT.emisor) return FACT.emisor;
  try {
    const data = await sg('configuracion_emisor?id=eq.IPSE&limit=1');
    FACT.emisor = data[0] || {};
  } catch { FACT.emisor = {}; }
  return FACT.emisor;
}

/* ── Filtro y render tabla ── */
function factFiltrar() {
  const q   = (document.getElementById('fact-search')?.value || '').toLowerCase();
  const est = document.getElementById('fact-filtro-estado')?.value || '';
  FACT.filtradas = FACT.facturas.filter(f => {
    if (est && f.estado !== est) return false;
    if (q) {
      const txt = `${f.numero_factura||''} ${f.receptor_nombre||''} ${f.id_paciente_v2||''}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  });
  factRenderTabla();
}

function factRenderTabla() {
  const tbody = document.getElementById('fact-tbody');
  const n = FACT.filtradas.length;
  document.getElementById('fact-footer').textContent =
    `${n} factura${n!==1?'s':''} · Total: ${fmtEur(FACT.filtradas.reduce((s,f)=>s+(parseFloat(f.total)||0),0))}`;

  if (!n) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state" style="text-align:center;padding:36px;color:var(--ink-muted)">Sin facturas</td></tr>`;
    return;
  }

  const estadoBadge = e => {
    if (e === 'Pagada')  return `<span class="fact-estado-pill pagada">Pagada</span>`;
    if (e === 'Anulada') return `<span class="fact-estado-pill anulada">Anulada</span>`;
    return `<span class="fact-estado-pill emitida">Emitida</span>`;
  };

  tbody.innerHTML = FACT.filtradas.map(f => {
    const pac = G.pacientes.find(p => p.id === f.id_paciente_v2);
    const pacNom = pac ? `${pac.nombre} ${pac.apellidos||''}`.trim() : (f.id_paciente_v2 || '—');
    const lineas = Array.isArray(f.lineas) ? f.lineas : (typeof f.lineas === 'string' ? JSON.parse(f.lineas) : []);
    const concepto = lineas[0]?.concepto || '—';
    return `<tr onclick="factEditarFactura('${f.id_factura}')">
      <td class="mono" style="font-weight:600;color:var(--azul)">${f.numero_factura || '—'}</td>
      <td class="muted">${fmtFecha(f.fecha)}</td>
      <td class="strong">${f.receptor_nombre || '—'}</td>
      <td class="muted">${pacNom}</td>
      <td class="muted" style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${concepto}</td>
      <td style="text-align:right;font-family:'DM Mono',monospace;font-size:12px">${fmtEur(f.base_imponible)}</td>
      <td style="text-align:right;font-family:'DM Mono',monospace;font-weight:600;color:var(--verde-dark)">${fmtEur(f.total)}</td>
      <td>${estadoBadge(f.estado)}</td>
      <td style="text-align:right">
        <button onclick="event.stopPropagation();factDescargarPDF('${f.id_factura}')"
          style="background:none;border:1px solid var(--border);border-radius:5px;padding:3px 8px;font-size:11px;color:var(--ink-muted);cursor:pointer;font-family:inherit"
          onmouseover="this.style.color='var(--azul)'" onmouseout="this.style.color='var(--ink-muted)'">PDF</button>
      </td>
    </tr>`;
  }).join('');
}

/* ── Modal nueva factura ── */
async function factNuevaFactura(prefill) {
  FACT.editandoId = null;
  FACT.lineas = [{ concepto: '', horas: 1, precio: 45, total: 45 }];
  document.getElementById('fact-modal-title').textContent = 'Nueva factura';

  // Generar número siguiente
  try {
    const last = await sg('facturas?order=numero_factura.desc&limit=5&select=numero_factura');
    const anio = new Date().getFullYear();
    let nextNum = 1;
    const thisYear = last.filter(f => (f.numero_factura||'').includes(String(anio)));
    if (thisYear.length) {
      const nums = thisYear.map(f => parseInt((f.numero_factura||'').split('/')[0])).filter(n => !isNaN(n));
      if (nums.length) nextNum = Math.max(...nums) + 1;
    }
    document.getElementById('fact-numero').value = `${String(nextNum).padStart(3,'0')}/${anio}`;
  } catch { document.getElementById('fact-numero').value = ''; }

  document.getElementById('fact-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('fact-estado').value = 'Emitida';
  document.getElementById('fact-irpf-pct').value = '0';
  document.getElementById('fact-pac-search').value = '';
  document.getElementById('fact-pac-id').value = '';
  document.getElementById('fact-rec-nombre').value = '';
  document.getElementById('fact-rec-dni').value = '';
  document.getElementById('fact-rec-dir').value = '';
  document.getElementById('fact-rec-cp').value = '';
  document.getElementById('fact-rec-municipio').value = '';

  // Nota por defecto del emisor
  await factCargarEmisor();
  document.getElementById('fact-notas').value = FACT.emisor?.texto_exencion || '';

  // Aplicar prefill si viene de Bonos/Becas
  if (prefill) {
    if (prefill.id_paciente_v2) {
      document.getElementById('fact-pac-id').value = prefill.id_paciente_v2;
      // Nombre visible en el buscador
      const pac = (G.pacientes||[]).find(p => p.id === prefill.id_paciente_v2);
      if (pac) document.getElementById('fact-pac-search').value = ((pac.nombre||'')+' '+(pac.apellidos||'')).trim();
    }
    if (prefill.receptor_nombre)    document.getElementById('fact-rec-nombre').value    = prefill.receptor_nombre;
    if (prefill.receptor_dni)       document.getElementById('fact-rec-dni').value       = prefill.receptor_dni;
    if (prefill.receptor_direccion) document.getElementById('fact-rec-dir').value       = prefill.receptor_direccion;
    if (prefill.receptor_cp)        document.getElementById('fact-rec-cp').value        = prefill.receptor_cp;
    if (prefill.receptor_municipio) document.getElementById('fact-rec-municipio').value = prefill.receptor_municipio;
    if (prefill.lineas) {
      FACT.lineas = prefill.lineas;
    }
    if (prefill._beca_meta) {
      // Guardar meta para el PDF
      FACT._beca_meta = prefill._beca_meta;
    }
    // Guardar campos de vínculo para persistirlos al guardar
    FACT._vinculo = {
      tipo_factura:    prefill.tipo_factura    || null,
      curso_academico: prefill.curso_academico || null,
      id_bono:         prefill.id_bono         || null,
      id_cita:         prefill.id_cita         || null,
    };
  } else {
    FACT._vinculo = null;
  }
  factRenderLineas();
  factRecalcular();
  document.getElementById('overlay-factura').classList.add('open');
}

async function factEditarFactura(id) {
  const f = FACT.facturas.find(x => x.id_factura === id);
  if (!f) return;
  FACT.editandoId = id;
  FACT.lineas = Array.isArray(f.lineas) ? [...f.lineas] : (typeof f.lineas === 'string' ? JSON.parse(f.lineas) : []);

  document.getElementById('fact-modal-title').textContent = `Factura ${f.numero_factura || id}`;
  document.getElementById('fact-numero').value  = f.numero_factura || '';
  document.getElementById('fact-fecha').value   = f.fecha || '';
  document.getElementById('fact-estado').value  = f.estado || 'Emitida';
  document.getElementById('fact-irpf-pct').value = String(f.irpf_pct || 0);
  document.getElementById('fact-rec-nombre').value   = f.receptor_nombre || '';
  document.getElementById('fact-rec-dni').value      = f.receptor_dni || '';
  document.getElementById('fact-rec-dir').value      = f.receptor_direccion || '';
  document.getElementById('fact-rec-cp').value       = f.receptor_cp || '';
  document.getElementById('fact-rec-municipio').value = f.receptor_municipio || '';
  document.getElementById('fact-notas').value        = f.notas || '';
  document.getElementById('fact-pac-id').value       = f.id_paciente_v2 || '';

  const pac = G.pacientes.find(p => p.id === f.id_paciente_v2);
  document.getElementById('fact-pac-search').value = pac
    ? `${pac.nombre} ${pac.apellidos||''}`.trim() + ` (${pac.id})`
    : (f.id_paciente_v2 || '');

  factRenderLineas();
  factRecalcular();
  document.getElementById('overlay-factura').classList.add('open');
}

function factCerrarModal() {
  FACT._beca_meta = null;
  document.getElementById('overlay-factura').classList.remove('open');
  document.getElementById('fact-pac-drop').style.display = 'none';
}

/* ── Búsqueda paciente en modal ── */
function factBuscarPaciente() {
  const q = document.getElementById('fact-pac-search').value.trim().toLowerCase();
  const drop = document.getElementById('fact-pac-drop');
  if (!q) { drop.style.display = 'none'; return; }
  const res = G.pacientes.filter(p => {
    const txt = `${p.nombre||''} ${p.apellidos||''} ${p.id||''}`.toLowerCase();
    return txt.includes(q);
  }).slice(0, 8);
  if (!res.length) { drop.style.display = 'none'; return; }
  drop.innerHTML = res.map(p => `
    <div onclick="factSelPaciente('${p.id}')"
      style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border)"
      onmouseover="this.style.background='var(--cream)'" onmouseout="this.style.background=''">
      <span style="font-weight:600">${p.nombre} ${p.apellidos||''}</span>
      <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--azul);margin-left:6px">${p.id}</span>
    </div>`).join('');
  drop.style.display = 'block';
}

function factSelPaciente(id) {
  const p = G.pacientes.find(x => x.id === id);
  if (!p) return;
  document.getElementById('fact-pac-id').value = id;
  document.getElementById('fact-pac-search').value = `${p.nombre} ${p.apellidos||''}`.trim() + ` (${id})`;
  document.getElementById('fact-pac-drop').style.display = 'none';

  // Autorellenar receptor con datos del tutor si existen
  if (!document.getElementById('fact-rec-nombre').value) {
    const nombre = p.nombre_tutor1 || `${p.nombre} ${p.apellidos||''}`.trim();
    document.getElementById('fact-rec-nombre').value = nombre;
    if (p.dni_tutor1) document.getElementById('fact-rec-dni').value = p.dni_tutor1;
    if (p.direccion_tutor1) document.getElementById('fact-rec-dir').value = p.direccion_tutor1;
    if (p.codigo_postal)    document.getElementById('fact-rec-cp').value = p.codigo_postal;
    if (p.municipio)        document.getElementById('fact-rec-municipio').value = p.municipio;
  }
}

/* ── Líneas ── */
function factRenderLineas() {
  const wrap = document.getElementById('fact-lineas-wrap');
  wrap.innerHTML = FACT.lineas.map((l, i) => `
    <div class="fact-linea" id="fact-linea-${i}">
      <input type="text" value="${escHtml(l.concepto||'')}" placeholder="Descripción del servicio"
        oninput="FACT.lineas[${i}].concepto=this.value">
      <input type="number" value="${l.horas||1}" min="0" step="0.5"
        oninput="FACT.lineas[${i}].horas=parseFloat(this.value)||0;factRecalcularLinea(${i})">
      <input type="number" value="${l.precio||45}" min="0" step="0.01"
        oninput="FACT.lineas[${i}].precio=parseFloat(this.value)||0;factRecalcularLinea(${i})">
      <input type="number" value="${l.total||0}" min="0" step="0.01" readonly
        style="background:var(--cream);color:var(--azul);font-weight:600">
      <button class="fact-linea-del" onclick="factDelLinea(${i})">×</button>
    </div>`).join('');
}

function factRecalcularLinea(i) {
  FACT.lineas[i].total = Math.round(FACT.lineas[i].horas * FACT.lineas[i].precio * 100) / 100;
  factRenderLineas();
  factRecalcular();
}

function factAddLinea() {
  FACT.lineas.push({ concepto: '', horas: 1, precio: 45, total: 45 });
  factRenderLineas();
  factRecalcular();
}

function factDelLinea(i) {
  if (FACT.lineas.length === 1) { toast('Debe haber al menos una línea', true); return; }
  FACT.lineas.splice(i, 1);
  factRenderLineas();
  factRecalcular();
}

function factRecalcular() {
  const base  = FACT.lineas.reduce((s, l) => s + (parseFloat(l.total)||0), 0);
  const irpfPct = parseFloat(document.getElementById('fact-irpf-pct')?.value || 0);
  const irpf  = Math.round(base * irpfPct / 100 * 100) / 100;
  const total = Math.round((base - irpf) * 100) / 100;
  document.getElementById('fact-tot-base').textContent    = fmtEurFact(base);
  document.getElementById('fact-tot-irpf-pct').textContent = irpfPct;
  document.getElementById('fact-tot-irpf').textContent    = fmtEurFact(irpf);
  document.getElementById('fact-tot-total').textContent   = fmtEurFact(total);
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ── Guardar ── */
function factRecogerDatos() {
  const base     = FACT.lineas.reduce((s, l) => s + (parseFloat(l.total)||0), 0);
  const irpfPct  = parseFloat(document.getElementById('fact-irpf-pct').value) || 0;
  const irpfImp  = Math.round(base * irpfPct / 100 * 100) / 100;
  const total    = Math.round((base - irpfImp) * 100) / 100;
  return {
    numero_factura:     document.getElementById('fact-numero').value.trim(),
    fecha:              document.getElementById('fact-fecha').value,
    estado:             document.getElementById('fact-estado').value,
    id_paciente_v2:     document.getElementById('fact-pac-id').value || null,
    receptor_nombre:    document.getElementById('fact-rec-nombre').value.trim() || null,
    receptor_dni:       document.getElementById('fact-rec-dni').value.trim() || null,
    receptor_direccion: document.getElementById('fact-rec-dir').value.trim() || null,
    receptor_cp:        document.getElementById('fact-rec-cp').value.trim() || null,
    receptor_municipio: document.getElementById('fact-rec-municipio').value.trim() || null,
    lineas:             FACT.lineas,
    base_imponible:     base,
    iva_pct:            0,
    iva_importe:        0,
    irpf_pct:           irpfPct,
    irpf_importe:       irpfImp,
    total,
    notas:              document.getElementById('fact-notas').value.trim() || null,
  };
}

async function factGuardar(yDescargar = false) {
  const datos = { ...factRecogerDatos(), ...(FACT._vinculo || {}) };
  if (!datos.numero_factura) { toast('El número de factura es obligatorio', true); return; }
  if (!datos.fecha)          { toast('La fecha es obligatoria', true); return; }
  if (!datos.receptor_nombre){ toast('El receptor es obligatorio', true); return; }

  const btnG = document.getElementById('btn-fact-guardar');
  const btnP = document.getElementById('btn-fact-pdf');
  btnG.disabled = btnP.disabled = true;
  btnG.innerHTML = '<span class="spinner"></span> Guardando…';

  try {
    let factura;
    if (FACT.editandoId) {
      const res = await spatch('facturas', FACT.editandoId, datos);
      factura = Array.isArray(res) ? res[0] : res;
      const idx = FACT.facturas.findIndex(f => f.id_factura === FACT.editandoId);
      if (idx >= 0) FACT.facturas[idx] = { ...FACT.facturas[idx], ...datos };
    } else {
      // Generar ID
      let nextNum = 1;
      try {
        const last = await sg('facturas?order=id_factura.desc&limit=1&select=id_factura');
        if (last.length) nextNum = parseInt(last[0].id_factura.replace(/\D/g,'')) + 1;
      } catch { /* primera */ }
      datos.id_factura = 'FAC-' + String(nextNum).padStart(4,'0');
      const res = await sp('facturas', datos);
      factura = Array.isArray(res) ? res[0] : res;
      FACT.facturas.unshift({ ...datos });
    }
    factFiltrar();
    toast(FACT.editandoId ? 'Factura actualizada' : 'Factura guardada', false, true);
    if (yDescargar && factura) {
      await factCargarEmisor();
      const meta = FACT._beca_meta || null;
      const pdfDatos = { ...datos, id_factura: datos.id_factura || FACT.editandoId };
      if (meta) { pdfDatos._pac_nombre = meta.pac_nombre; pdfDatos._especialidad = meta.especialidad; pdfDatos._anio_escolar = meta.anio_escolar; }
      factGenerarPDF(pdfDatos, true);
      FACT._beca_meta = null;
    } else {
      factCerrarModal();
    }
  } catch(e) {
    toast('Error al guardar: ' + e.message, true);
  } finally {
    btnG.disabled = btnP.disabled = false;
    btnG.textContent = 'Guardar factura';
    btnP.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Guardar y descargar PDF`;
  }
}

async function factGuardarYDescargar() { await factGuardar(true); }

async function factDescargarPDF(id) {
  const f = FACT.facturas.find(x => x.id_factura === id);
  if (!f) return;
  await factCargarEmisor();
  factGenerarPDF(f, true);
}

async function factPrevisualizar() {
  await factCargarEmisor();
  const datos = factRecogerDatos();
  datos.id_factura = FACT.editandoId || 'BORRADOR';
  factGenerarPDF(datos, false);
}

/* ── Generador PDF ── */
function factGenerarPDF(f, descargar = true) {
  if (typeof window.jspdf === 'undefined') { toast('jsPDF no está cargado', true); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W=210,M=18,RED=[206,101,25],DARK=[30,30,30],MUTED=[100,100,100],BORDR=[200,200,200],CREAM=[245,245,245];
  const fmtI = v => { const n=parseFloat(v)||0; const [e,d]=n.toFixed(2).split('.'); return e+","+d; };
  const MC=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const em=FACT.emisor||{};
  const lugar=em.municipio||'Híjar-Las Gabias';
  const lugarCorto=lugar.split('-')[0].trim();
  const fechaStr=(()=>{if(!f.fecha)return'—';const d=new Date(f.fecha+'T12:00:00');return lugarCorto+', '+d.getDate()+' de '+MC[d.getMonth()]+' '+d.getFullYear();})();
  try{doc.addImage('data:image/png;base64,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1MvMgloyGtaAMnl4jmuu4tUltqZdGXW8bhBO5kdbNvcB3ZDXHp06uORzVB2s5zHljR3a55UTXTJaW7Da18bZHHvXlWdht5Zm9VJtXd+41BRWn0Gqk9KjfJ6QxmYo9vg4+BK2YkZtJ3twOpz0UeXUQs4raSZSuzTi3yiMh2QWhp2/LyXC6rt9ztOprxo2hEpj1BVQTQOAOAwucXfQCcH2NVku0Xw7xLbF1/5BHLmclTBspk5a0P3SW72fTeIJ15DOlPrpGNbuc9ob5k8llrmuGWkEeYUWcR6Sgj1Fpe0XyV8Omo4XMc7eWMdI1oDQ9w6cgPrK+/Ap9YDf6Zjp32SKqAtj5MkFu5+dpPUYDD9KubjycRwS3w18L0rTkCqH7NAwn2gO8dMqJI1vXmRWik1ERdFcpERERERERERERERERERERYIB6ptCyiIsbQm0LKIixtHkm0LKIixtGMJtCyiIsbQm0LKIiLAACyiIsEA9U2hZREWNoQtCyiIsbRlNoWURFjaE2hZREWNoTaFlERY2hC0HqsoiLG0JtCyiIsbQgAHRZREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREX/9k=','PNG',M,8,42,22);}catch(e){doc.setFont('helvetica','bold');doc.setFontSize(24);doc.setTextColor(139,0,0);doc.text('IPSE',M,20);}
  // Encabezado emisor — alineado a la izquierda del bloque derecho
  const exl=W/2+10;
  const profRaw=em.profesional||'Inés Ferreira Reyes. Psicóloga Sanitaria. Máster en Psicología Infanto-Juvenil.';
  const profIdx=profRaw.indexOf('ster en');
  const profL1=profIdx>0?profRaw.slice(0,profIdx-2).trim():profRaw;
  const profL2=profIdx>0?profRaw.slice(profIdx-2).trim():'';
  const emLineas=[
    [em.nombre_clinica||'IPSE. Instituto Psicoeducativo.',true],
    [em.nica?'N.I.C.A.: '+em.nica:'N.I.C.A.: 60.178',true],
    profL1?[profL1,true]:null,
    profL2?[profL2,true]:null,
    [em.num_colegiado?'NºCol. '+em.num_colegiado:'NºCol. AO07537',true],
    [em.nif?'N.I.F.- '+em.nif:'N.I.F.- 26.036.593-H',true],
    [em.direccion||'C/ Paseo de Carlos Cano, 51, 1ºB',false],
    [(em.cp?'C.P./ '+em.cp+' ':'C.P./ 18110 ')+(em.municipio||'Híjar-Las Gabias'),false],
    ['Granada',false],
    ['Tlf./ '+(em.telefono||'658 609 996'),false],
    [em.email||'inesferrei@cop.es',false]
  ].filter(Boolean);
  emLineas.forEach(([txt,bold],i)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(7.8);doc.setTextColor(...DARK);doc.text(txt,exl,10+i*3.8);});
  // PAGADO como imagen (sello real) — rect blanco previo para igualar fondo
  doc.setFillColor(255,255,255);doc.rect(M-1,55,48,20,'F');
  try{doc.addImage('data:image/jpeg;base64,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','JPEG',M,58,44,14);}catch(e){}
  // FECHA y Nº FACTURA — alineados con el encabezado
  doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(...DARK);doc.text('FECHA:',exl,68);
  doc.setFont('helvetica','normal');doc.text('  '+fechaStr,exl+16,68);
  doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('Nº FACTURA:',exl,78);
  doc.setFontSize(12);doc.text('  '+(f.numero_factura||'—'),exl+30,78);
  let y=88;
  doc.setFillColor(...RED);doc.rect(M,y,W-M*2,7,'F');doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(255,255,255);doc.text('CLIENTE',M+3,y+5);y+=7;
  const esBeca=!!(f._pac_nombre&&f._especialidad);
  if(esBeca){
    const pN=(f._pac_nombre||'').toUpperCase(),tN=(f.receptor_nombre||'').toUpperCase();
    const cls=[{txt:'BENEFICIARIO/A BECA NEAE CURSO '+(f._anio_escolar||'')+': '+pN,b:true,i:true},{txt:'PADRE/MADRE O TUTOR/A LEGAL: '+tN,b:true,i:true},{txt:f.receptor_dni?'D.N.I.:'+f.receptor_dni:'',b:false,i:true},{txt:f.receptor_direccion||'',b:false,i:false},{txt:f.receptor_cp?'C.P./'+f.receptor_cp:'',b:false,i:false},{txt:f.receptor_municipio||'',b:false,i:false}].filter(l=>l.txt);
    const ch=Math.max(28,cls.length*5.2+8);doc.setDrawColor(...BORDR);doc.setLineWidth(0.3);doc.rect(M,y,W-M*2,ch);
    let cy=y+7;cls.forEach(l=>{doc.setFont('helvetica',l.b?(l.i?'bolditalic':'bold'):(l.i?'italic':'normal'));doc.setFontSize(9);doc.setTextColor(...DARK);doc.splitTextToSize(l.txt,W-M*2-8).forEach(ln=>{doc.text(ln,M+4,cy);cy+=5;});});y+=ch+4;
  }else{
    doc.setDrawColor(...BORDR);doc.setLineWidth(0.3);doc.rect(M,y,W-M*2,28);doc.setFont('helvetica','bold');doc.setFontSize(9.5);doc.setTextColor(...DARK);doc.text((f.receptor_nombre||'').toUpperCase(),M+4,y+7);doc.setFont('helvetica','normal');doc.setFontSize(9);[f.receptor_dni?'D.N.I.: '+f.receptor_dni:'',f.receptor_direccion||'',[f.receptor_cp?'C.P./'+f.receptor_cp:'',f.receptor_municipio||''].filter(Boolean).join('  ')].filter(Boolean).forEach((l,i)=>doc.text(l,M+4,y+13+i*5));y+=34;
  }
  y+=4;doc.setFillColor(...RED);doc.rect(M,y,W-M*2,8,'F');doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.setTextColor(255,255,255);
  const C1=M+3,C2=128,C3=153,C4=W-M-3;
  doc.text('CONCEPTO',C1,y+3);doc.text('Nº DE HORAS',C2,y+3,{align:'center'});doc.text('TOTALES',C2,y+7,{align:'center'});doc.text('PRECIO HORA',C3,y+5.5,{align:'center'});doc.text('PRECIO TOTAL',C4,y+5.5,{align:'right'});y+=8;
  const lineas=Array.isArray(f.lineas)?f.lineas:(typeof f.lineas==='string'?JSON.parse(f.lineas||'[]'):[]);
  if(esBeca){
    lineas.forEach((l,i)=>{
      const subs=(l.concepto||'').split('\n').filter(Boolean);let tl=0;subs.forEach(s=>{tl+=doc.splitTextToSize(s,C2-C1-4).length;});
      const rh=Math.max(22,tl*4.5+10);
      doc.setFillColor(i%2===0?255:248,i%2===0?255:248,i%2===0?255:248);doc.rect(M,y,W-M*2,rh,'F');doc.setDrawColor(...BORDR);doc.setLineWidth(0.2);doc.rect(M,y,W-M*2,rh);
      let cy=y+6;subs.forEach((s,si)=>{doc.setFont('helvetica',si===0?'bolditalic':'normal');doc.setFontSize(8.5);doc.setTextColor(...DARK);doc.splitTextToSize(s,C2-C1-4).forEach(ln=>{doc.text(ln,C1,cy);cy+=4.5;});});
      const midY=y+rh/2+1.5;doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(...MUTED);
      if(l.horas)doc.text(String(l.horas)+' h',C2,midY,{align:'center'});
      doc.text(fmtI(l.precio)+(l.horas?' €/h':' €'),C3,midY,{align:'center'});
      doc.setFont('helvetica','bold');doc.setTextColor(...DARK);doc.text(fmtI(l.total)+' €',C4,midY,{align:'right'});y+=rh;
    });
  }else{
    lineas.forEach((l,i)=>{
      const rh=24;doc.setFillColor(i%2===0?255:248,i%2===0?255:248,i%2===0?255:248);doc.rect(M,y,W-M*2,rh,'F');doc.setDrawColor(...BORDR);doc.setLineWidth(0.2);doc.rect(M,y,W-M*2,rh);
      doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...DARK);doc.text((l.concepto||'').split('\n')[0].toUpperCase(),C1,y+7);
      const det=(l.concepto||'').split('\n').slice(1).join(' ').trim();if(det){doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.splitTextToSize('* '+det,C2-C1-4).forEach((ln,li)=>doc.text(ln,C1,y+13+li*4));}
      doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(...MUTED);doc.text(String(l.horas||0)+' h',C2,y+10,{align:'center'});doc.text(fmtI(l.precio||l.precio_hora||0)+' €/h',C3,y+10,{align:'center'});doc.setFont('helvetica','bold');doc.setTextColor(...DARK);doc.text(fmtI(l.total||l.importe||0)+' €',C4,y+10,{align:'right'});y+=rh;
    });
  }
  doc.setFillColor(...CREAM);doc.rect(M,y,W-M*2,8,'F');doc.setFont('helvetica','bold');doc.setFontSize(9.5);doc.setTextColor(...DARK);doc.text('TOTAL',C4-25,y+5.5,{align:'right'});doc.text(fmtI(f.base_imponible)+' €',C4,y+5.5,{align:'right'});y+=14;
  doc.setFillColor(...RED);doc.rect(M,y,W-M*2,7,'F');doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(255,255,255);doc.text('IMPORTE',M+3,y+5);y+=7;
  [['Base imponible',fmtI(f.base_imponible)+' €',false],['I.V.A.',fmtI(f.iva_importe||0)+' €',true],['Retención Aplicable I.R.P.F',fmtI(f.irpf_importe||0)+' €',true]].forEach(([label,val,italic],i)=>{const rh=8;doc.setFillColor(i%2===0?255:248,i%2===0?255:248,i%2===0?255:248);doc.rect(M,y,W-M*2,rh,'F');doc.setDrawColor(...BORDR);doc.setLineWidth(0.2);doc.line(M,y+rh,W-M,y+rh);doc.setFont('helvetica',italic?'bolditalic':'bold');doc.setFontSize(9);doc.setTextColor(...DARK);doc.text(label,M+4,y+5.5);doc.setFont('helvetica',italic?'italic':'normal');doc.text(val,W-M-4,y+5.5,{align:'right'});y+=rh;});
  doc.setFillColor(255,255,255);doc.rect(M,y,W-M*2,9,'F');doc.setDrawColor(...BORDR);doc.rect(M,y,W-M*2,9);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(...DARK);doc.text('TOTAL FACTURA',M+4,y+6.2);doc.text(fmtI(f.total)+' €',W-M-4,y+6.2,{align:'right'});y+=14;
  const iban=em.iban||'ES65 0182 1294 1002 0192 9436';const nota=f.notas||em.texto_exencion||'Factura exenta de IVA según Artículo 20.1.3 Ley 37/1992 de 28 de Diciembre.';
  doc.setFillColor(...CREAM);doc.rect(M,y,W-M*2,14,'F');doc.setDrawColor(...BORDR);doc.rect(M,y,W-M*2,14);doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(...DARK);doc.text('Nº Cuenta: '+iban,W/2,y+5,{align:'center'});if(nota){doc.setFontSize(7.8);doc.setTextColor(...MUTED);doc.text(doc.splitTextToSize('* '+nota,W-M*2-8),W/2,y+10,{align:'center'});}y+=20;
  try{doc.addImage('data:image/png;base64,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','PNG',W/2-25,y,50,22);}catch(e){}
  const fn='IPSE_Factura_'+(f.numero_factura||f.id_factura||'nueva').replace(/\//g,'-')+'.pdf';
  if(descargar){doc.save(fn);toast('PDF descargado',false,true);}else{window.open(URL.createObjectURL(doc.output('blob')),'_blank');}
}

/* ── Emisión en bloque — Becas ── */
const BLOQUE = { candidatos: [] };

function factBloqueToggle() {
  const panel = document.getElementById('fact-bloque-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    const hoy = new Date(), ult = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    document.getElementById('blq-fecha').value = ult.getFullYear() + '-' + String(ult.getMonth() + 1).padStart(2, '0') + '-' + String(ult.getDate()).padStart(2, '0');
    factBloqueCargar();
  }
}

async function factBloqueCargar() {
  const anioEscolar = document.getElementById('blq-anio-escolar').value;
  const especialidad = document.getElementById('blq-especialidad').value;
  const wrap = document.getElementById('fact-bloque-lista-wrap');
  const btn = document.getElementById('btn-blq-emitir');
  document.getElementById('blq-info-txt').textContent = ''; btn.disabled = true;
  wrap.innerHTML = '<div style="color:var(--ink-muted);font-size:13px;padding:10px 0"><span class="spinner"></span> Cargando…</div>';
  try {
    const becas = await sg(`bonos_becas?tipo=eq.BECA&anio_escolar=eq.${encodeURIComponent(anioEscolar)}&select=*`);
    const bf = especialidad ? becas.filter(b => b.especialidad === especialidad) : becas;
    let fexi = [];
    try { fexi = await sg(`facturas?tipo_factura=eq.beca&curso_academico=eq.${encodeURIComponent(anioEscolar)}&estado=neq.Anulada&select=id_paciente_v2`); } catch { }
    const yafact = new Set(fexi.map(f => f.id_paciente_v2).filter(Boolean));
    const pm = {}; (G.pacientes || []).forEach(p => { pm[p.id] = p; });
    BLOQUE.candidatos = bf.map(b => {
      const pac = pm[b.id_paciente] || {};
      const lista = !yafact.has(b.id_paciente) && !!(pac.nombre_tutor1) && !!(pac.dni_tutor1);
      return { ...b, pac, yaFacturado: yafact.has(b.id_paciente), tieneTutor: !!(pac.nombre_tutor1), tieneDNI: !!(pac.dni_tutor1), seleccionado: lista };
    });
    const pend = BLOQUE.candidatos.filter(c => !c.yaFacturado);
    const sinD = pend.filter(c => !c.tieneTutor || !c.tieneDNI);
    const list = pend.filter(c => c.tieneTutor && c.tieneDNI);
    if (!BLOQUE.candidatos.length) { wrap.innerHTML = '<div style="color:var(--ink-muted);font-size:13px;padding:10px 0">Sin becas para estos filtros.</div>'; return; }
    let html = '<table><thead><tr><th style="width:32px"></th><th>Paciente</th><th>Especialidad</th><th>Tutor</th><th>DNI</th><th>Estado</th></tr></thead><tbody>';
    BLOQUE.candidatos.forEach((c, i) => {
      const nom = ((c.pac.nombre || '') + ' ' + (c.pac.apellidos || '')).trim() || c.id_paciente;
      const badge = c.yaFacturado ? '<span class="fact-bloque-badge-ok">Ya facturada</span>' : (!c.tieneTutor || !c.tieneDNI ? '<span class="fact-bloque-badge-warn">Datos incompletos</span>' : '<span class="fact-bloque-badge-ok">Lista para emitir</span>');
      const chk = (c.tieneTutor && c.tieneDNI && !c.yaFacturado)
        ? `<input type="checkbox" ${c.seleccionado ? 'checked' : ''} onchange="factBloqueToggleCandidato(${i},this.checked)" style="cursor:pointer;width:15px;height:15px">`
        : '';
      html += `<tr style="${c.yaFacturado ? 'opacity:.45' : ''}"><td style="text-align:center">${chk}</td><td><strong>${nom}</strong><br><span style="color:var(--ink-muted);font-size:11px">${c.id_paciente}</span></td><td>${c.especialidad || '—'}</td><td>${c.pac.nombre_tutor1 || '—'}</td><td>${c.pac.dni_tutor1 || '—'}</td><td>${badge}</td></tr>`;
    });
    html += '</tbody></table>'; wrap.innerHTML = html;
    const campoNum = document.getElementById('blq-num-inicio');
    if (!campoNum.value) {
      try {
        const last = await sg('facturas?order=numero_factura.desc&limit=5&select=numero_factura');
        const anio = new Date(document.getElementById('blq-fecha').value || Date.now()).getFullYear();
        const ty = last.filter(f => (f.numero_factura || '').includes(String(anio)));
        let nx = 1; if (ty.length) { const ns = ty.map(f => parseInt((f.numero_factura || '').split('/')[0])).filter(n => !isNaN(n)); if (ns.length) nx = Math.max(...ns) + 1; }
        campoNum.value = String(nx).padStart(3, '0') + '/' + anio;
      } catch { }
    }
    factBloqueActualizarContador();
  } catch (e) { wrap.innerHTML = `<div style="color:var(--rojo);font-size:13px;padding:10px 0">Error: ${e.message}</div>`; }
}

function factBloqueToggleCandidato(i, checked) {
  if (BLOQUE.candidatos[i]) BLOQUE.candidatos[i].seleccionado = checked;
  factBloqueActualizarContador();
}

function factBloqueActualizarContador() {
  const pend = BLOQUE.candidatos.filter(c => !c.yaFacturado);
  const sinD = pend.filter(c => !c.tieneTutor || !c.tieneDNI);
  const sel = BLOQUE.candidatos.filter(c => c.seleccionado);
  let info = `${pend.length} facturas pendientes`; if (sinD.length) info += ` · ${sinD.length} con datos incompletos`; if (sel.length) info += ` · ${sel.length} seleccionadas`;
  const btn = document.getElementById('btn-blq-emitir');
  document.getElementById('blq-info-txt').textContent = info;
  btn.disabled = sel.length === 0;
  btn.textContent = sel.length > 0 ? `Emitir ${sel.length} facturas` : 'Emitir todas las facturas';
}

async function factBloqueEmitir() {
  const list = BLOQUE.candidatos.filter(c => c.seleccionado);
  if (!list.length) return;
  const fecha = document.getElementById('blq-fecha').value;
  if (!fecha) { toast('Selecciona una fecha', true); return; }
  const numRaw = document.getElementById('blq-num-inicio').value.trim();
  const anioF = new Date(fecha).getFullYear();
  let nextNum = 1;
  if (numRaw) {
    const m = numRaw.match(/^(\d+)\/(\d{4})$/);
    if (!m) { toast('Formato incorrecto. Usa NNN/AAAA', true); return; }
    nextNum = parseInt(m[1]);
  } else {
    try {
      const last = await sg('facturas?order=numero_factura.desc&limit=5&select=numero_factura');
      const ty = last.filter(f => (f.numero_factura || '').includes(String(anioF)));
      if (ty.length) { const ns = ty.map(f => parseInt((f.numero_factura || '').split('/')[0])).filter(n => !isNaN(n)); if (ns.length) nextNum = Math.max(...ns) + 1; }
    } catch { }
  }
  const anioEscolar = document.getElementById('blq-anio-escolar').value;
  const anioFin = parseInt((anioEscolar || '2025/2026').split('/')[1] || '2026');

  // Previsualización para confirmar concepto y numeración
  const previews = list.map((c, i) => {
    const esp = c.especialidad || 'PSI';
    const tit = '"BECA DE ' + (esp === 'LOG' ? 'REEDUCACIÓN DEL LENGUAJE' : 'REEDUCACIÓN PSICOPEDAGÓGICA') + '. CURSO ' + anioEscolar + '"';
    const nf = String(nextNum + i).padStart(3, '0') + '/' + anioF;
    const nom = ((c.pac.nombre || '') + ' ' + (c.pac.apellidos || '')).trim();
    return { nf, nom, tit, esp };
  });

  const preHtml = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center" id="blq-confirm-overlay">
      <div style="background:#fff;border-radius:14px;padding:28px 32px;max-width:700px;width:95%;max-height:82vh;display:flex;flex-direction:column;gap:16px;box-shadow:0 8px 32px rgba(0,0,0,.18)">
        <div style="font-size:16px;font-weight:700;color:var(--azul)">Confirmar emisión — ${list.length} factura${list.length > 1 ? 's' : ''}</div>
        <div style="font-size:12px;color:var(--ink-muted)">Numeración desde <strong>${String(nextNum).padStart(3,'0')}/${anioF}</strong>. Revisa el concepto antes de emitir.</div>
        <div style="overflow-y:auto;flex:1;border:1.5px solid var(--border);border-radius:8px">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="background:var(--azul);color:#fff;position:sticky;top:0">
              <th style="padding:7px 10px;text-align:left">Nº</th>
              <th style="padding:7px 10px;text-align:left">Paciente</th>
              <th style="padding:7px 10px;text-align:left">Concepto principal</th>
              <th style="padding:7px 10px;text-align:right">Total</th>
            </tr></thead>
            <tbody>${previews.map((p, i) => `
              <tr style="background:${i % 2 === 0 ? '#fff' : '#f8f9ff'};border-bottom:1px solid var(--border)">
                <td style="padding:6px 10px;font-family:'DM Mono',monospace;font-weight:600;color:var(--azul);white-space:nowrap">${p.nf}</td>
                <td style="padding:6px 10px;white-space:nowrap">${p.nom}</td>
                <td style="padding:6px 10px;color:var(--ink-muted);font-size:11px">${p.tit}</td>
                <td style="padding:6px 10px;text-align:right;font-weight:600;white-space:nowrap">913,00 €</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;padding-top:4px">
          <button onclick="document.getElementById('blq-confirm-overlay').remove()" style="padding:8px 20px;border-radius:8px;border:1.5px solid var(--border);background:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Cancelar</button>
          <button onclick="document.getElementById('blq-confirm-overlay').remove();factBloqueEjecutar(${nextNum})" style="padding:8px 22px;border-radius:8px;background:var(--azul);color:#fff;border:none;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Emitir ${list.length} factura${list.length > 1 ? 's' : ''}</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', preHtml);
}

async function factBloqueEjecutar(nextNum) {
  const list = BLOQUE.candidatos.filter(c => c.seleccionado);
  const fecha = document.getElementById('blq-fecha').value;
  const anioF = new Date(fecha).getFullYear();
  const anioEscolar = document.getElementById('blq-anio-escolar').value;
  const anioFin = parseInt((anioEscolar || '2025/2026').split('/')[1] || '2026');
  const btn = document.getElementById('btn-blq-emitir'), pe = document.getElementById('blq-progress'), fe = document.getElementById('blq-progress-fill'), te = document.getElementById('blq-progress-txt');
  btn.disabled = true; pe.style.display = 'block'; await factCargarEmisor();
  let emitidas = 0, errores = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i]; fe.style.width = Math.round((i / list.length) * 100) + '%'; te.textContent = `Emitiendo ${i + 1}/${list.length}: ${((c.pac.nombre || '') + ' ' + (c.pac.apellidos || '')).trim()}…`;
    try {
      const nf = String(nextNum).padStart(3, '0') + '/' + anioF; nextNum++;
      const esp = c.especialidad || 'PSI', tt = esp === 'LOG' ? 'reeducación del lenguaje' : 'reeducación psicopedagógica';
      const tit = '"BECA DE ' + (esp === 'LOG' ? 'REEDUCACIÓN DEL LENGUAJE' : 'REEDUCACIÓN PSICOPEDAGÓGICA') + '. CURSO ' + anioEscolar + '"';
      const lineas = [{ concepto: tit + '\n* 20 Sesiones de ' + tt + ' de Enero a Junio de ' + anioFin + '.', horas: 20, precio: 45, total: 900 }, { concepto: '* Una sesión de repaso' + (esp === 'LOG' ? ' extra' : '') + ' en Junio', horas: 1, precio: 13, total: 13 }];
      const pac = c.pac;
      const datos = { id_factura: 'FAC-' + String(Date.now()).slice(-6) + String(i).padStart(2, '0'), numero_factura: nf, fecha, estado: 'Emitida', tipo_factura: 'beca', curso_academico: anioEscolar, id_paciente_v2: c.id_paciente, receptor_nombre: pac.nombre_tutor1, receptor_dni: pac.dni_tutor1, receptor_direccion: pac.direccion_tutor1 || pac.direccion || null, receptor_cp: null, receptor_municipio: pac.municipio || 'Las Gabias', lineas, base_imponible: 913, iva_pct: 0, iva_importe: 0, irpf_pct: 0, irpf_importe: 0, total: 913, notas: FACT.emisor?.texto_exencion || null };
      await sp('facturas', datos); FACT.facturas.unshift({ ...datos });
      factGenerarPDF({ ...datos, _pac_nombre: ((pac.nombre || '') + ' ' + (pac.apellidos || '')).trim(), _especialidad: esp, _anio_escolar: anioEscolar }, true);
      emitidas++; await new Promise(r => setTimeout(r, 300));
    } catch (e) { console.error('Error', c.id_paciente, e); errores++; }
  }
  fe.style.width = '100%'; te.textContent = `✓ ${emitidas} emitidas${errores ? ` · ${errores} errores` : ''}`;
  factFiltrar(); toast(`${emitidas} facturas emitidas${errores ? ` (${errores} errores)` : ''}`, errores > 0, true);
  setTimeout(() => factBloqueCargar(), 800);
}

/* ── navTo extension para facturas ── */
