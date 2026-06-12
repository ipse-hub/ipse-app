   PROFESIONALES
═══════════════════════════════════════════ */
const PRO = {
  lista: [],       // todos los profesionales cargados
  editando: null,  // objeto profesional en edición, null si es alta
};

const PRO_PALETA = ['#10069F','#00B5E2','#97D700','#DA291C','#F59E0B','#6366f1','#ec4899'];

function proColor(p, idx) {
  return p.color_agenda || PRO_PALETA[idx % PRO_PALETA.length];
}

async function proInit() {
  try {
    PRO.lista = await sg(`profesionales?select=id,nombre,apellidos,email,especialidades,color_agenda,es_admin,activa,pdf_delitos_sexuales,fecha_pdf_delitos&order=nombre.asc&limit=50`);
    proRenderTabla();
    document.getElementById('pro-subtitulo').textContent =
      `${PRO.lista.length} profesional${PRO.lista.length !== 1 ? 'es' : ''} en el sistema`;
  } catch(e) {
    document.getElementById('pro-tbody').innerHTML =
      `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--rojo)">Error al cargar: ${e.message}</td></tr>`;
  }
}

function proRenderTabla() {
  const tbody = document.getElementById('pro-tbody');
  if (!PRO.lista.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--ink-muted)">Sin profesionales</td></tr>`;
    return;
  }
  tbody.innerHTML = PRO.lista.map((p, i) => {
    const color = proColor(p, i);
    const ini = ((p.nombre?.[0]||'') + (p.apellidos?.[0]||'')).toUpperCase();
    const esps = (p.especialidades || []).map(e => `<span class="pro-pill">${e}</span>`).join('') || '<span style="color:var(--ink-muted);font-size:12px">—</span>';
    const rolBadge = p.es_admin === 'Si'
      ? `<span class="pro-badge-admin">Admin</span>`
      : `<span class="pro-badge-pro">Profesional</span>`;
    const estadoBadge = p.activa === 'Si'
      ? `<span class="pro-badge-activa">Activa</span>`
      : `<span class="pro-badge-inactiva">Inactiva</span>`;

    let certBadge;
    if (!p.pdf_delitos_sexuales) {
      certBadge = `<span class="pro-badge-cert-no">Sin certificado</span>`;
    } else {
      // Avisar si vence en < 365 días
      const vence = new Date(p.fecha_pdf_delitos);
      vence.setFullYear(vence.getFullYear() + 5); // cert. válido 5 años
      const diasRestantes = Math.floor((vence - Date.now()) / 86400000);
      if (diasRestantes < 180) {
        certBadge = `<span class="pro-badge-cert-cauca" title="Vence ${vence.toLocaleDateString('es-ES')}">Caduca pronto</span>`;
      } else {
        certBadge = `<span class="pro-badge-cert-ok" title="Vence ${vence.toLocaleDateString('es-ES')}">Vigente</span>`;
      }
    }

    return `<tr>
      <td>
        <div class="pro-nombre-bloque">
          <div class="pro-avatar" style="background:${color}">${ini}</div>
          <div>
            <div class="pro-nombre">${p.nombre} ${p.apellidos||''}</div>
            <div class="pro-email">${p.email||'—'}</div>
          </div>
        </div>
      </td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul)">${p.id}</td>
      <td>${esps}</td>
      <td><span class="pro-color-muestra" style="background:${color}" title="${color}"></span></td>
      <td>${rolBadge}</td>
      <td>${estadoBadge}</td>
      <td>${certBadge}</td>
      <td><button class="pro-btn-editar" onclick="proAbrirModal(${i})">Editar</button></td>
    </tr>`;
  }).join('');
}

function proAbrirModal(idx) {
  const esAlta = idx === null;
  PRO.editando = esAlta ? null : PRO.lista[idx];
  const p = PRO.editando || {};

  document.getElementById('pro-modal-tit').textContent = esAlta ? 'Nuevo profesional' : `Editar — ${p.nombre} ${p.apellidos||''}`;

  // Campos identidad
  document.getElementById('pro-f-nombre').value    = p.nombre    || '';
  document.getElementById('pro-f-apellidos').value = p.apellidos || '';
  document.getElementById('pro-f-email').value     = p.email     || '';
  document.getElementById('pro-f-id').value        = p.id        || '';
  document.getElementById('pro-f-id').readOnly     = !esAlta;
  document.getElementById('pro-f-esadmin').value   = p.es_admin  || 'No';
  document.getElementById('pro-f-activa').value    = p.activa    || 'Si';

  // Especialidades
  ['PSI','LOG','TO','PDG'].forEach(e => {
    document.getElementById(`pro-esp-${e}`).checked = (p.especialidades || []).includes(e);
  });

  // Color
  document.getElementById('pro-f-color').value = p.color_agenda || '#10069F';

  // Cert delitos
  PRO._certRuta = p.pdf_delitos_sexuales || null; // ruta en Storage o null
  PRO._certArchivo = null; // archivo nuevo pendiente de subir
  document.getElementById('pro-f-fechapdf').value = p.fecha_pdf_delitos || '';
  proRenderCertZona();

  // Aviso de invite (solo en alta)
  document.getElementById('pro-aviso-invite').style.display = esAlta ? 'block' : 'none';

  document.getElementById('pro-modal-overlay').classList.add('open');
}

function proCerrarModal() {
  document.getElementById('pro-modal-overlay').classList.remove('open');
  PRO.editando = null;
}

function proRenderCertZona() {
  const actual  = document.getElementById('pro-cert-actual');
  const upload  = document.getElementById('pro-cert-upload');
  const nombre  = document.getElementById('pro-cert-nombre');

  if (PRO._certArchivo) {
    // Archivo nuevo seleccionado, pendiente de guardar
    actual.style.display = 'block';
    upload.style.display = 'none';
    nombre.textContent = PRO._certArchivo.name;
  } else if (PRO._certRuta) {
    // Archivo ya guardado en Storage
    actual.style.display = 'block';
    upload.style.display = 'none';
    nombre.textContent = PRO._certRuta.split('/').pop();
  } else {
    actual.style.display = 'none';
    upload.style.display = 'block';
  }
}

function proArchivoCambiado(input) {
  if (!input.files?.length) return;
  const f = input.files[0];
  if (f.type !== 'application/pdf') { toast('Solo se aceptan archivos PDF', true); return; }
  if (f.size > 10 * 1024 * 1024) { toast('El archivo supera 10 MB', true); return; }
  PRO._certArchivo = f;
  proRenderCertZona();
}

function proQuitarCert() {
  PRO._certArchivo = null;
  PRO._certRuta    = null;
  document.getElementById('pro-f-pdf-file').value = '';
  proRenderCertZona();
}

async function proVerCert() {
  if (!PRO._certRuta) return;
  try {
    // Generar URL firmada (válida 60 segundos)
    const res = await fetch(
      `${SUPA_URL}/storage/v1/object/sign/certificados/${PRO._certRuta}`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${G.sesion.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expiresIn: 60 })
      }
    );
    if (!res.ok) throw new Error('No se pudo generar la URL');
    const data = await res.json();
    const url = `${SUPA_URL}/storage/v1${data.signedURL}`;
    window.open(url, '_blank');
  } catch(e) {
    toast('Error al abrir el certificado: ' + e.message, true);
  }
}

async function proGuardar() {
  const esAlta = PRO.editando === null;
  const nombre    = document.getElementById('pro-f-nombre').value.trim();
  const apellidos = document.getElementById('pro-f-apellidos').value.trim();
  const email     = document.getElementById('pro-f-email').value.trim().toLowerCase();
  const id        = document.getElementById('pro-f-id').value.trim().toUpperCase();
  const esAdmin   = document.getElementById('pro-f-esadmin').value;
  const activa    = document.getElementById('pro-f-activa').value;
  const color     = document.getElementById('pro-f-color').value;
  const fechaPdf       = document.getElementById('pro-f-fechapdf').value || null;
  const especialidades = ['PSI','LOG','TO','PDG'].filter(e =>
    document.getElementById(`pro-esp-${e}`).checked
  );

  if (!nombre || !email) { toast('Nombre y email son obligatorios', true); return; }
  if (esAlta && !id) { toast('El ID es obligatorio', true); return; }

  // Gestión del certificado PDF
  let pdfRuta = PRO._certRuta; // mantener ruta existente por defecto
  if (PRO._certArchivo) {
    // Hay archivo nuevo — subirlo a Storage
    const idPro = esAlta ? id : PRO.editando.id;
    const ext = PRO._certArchivo.name.split('.').pop();
    const rutaStorage = `${idPro}/delitos_sexuales.${ext}`;
    const uploadRes = await fetch(
      `${SUPA_URL}/storage/v1/object/certificados/${rutaStorage}`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${G.sesion.access_token}`,
          'Content-Type': PRO._certArchivo.type,
          'x-upsert': 'true'
        },
        body: PRO._certArchivo
      }
    );
    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      throw new Error('Error subiendo el certificado: ' + (err.message || uploadRes.status));
    }
    pdfRuta = rutaStorage;
  }

  const payload = {
    nombre, apellidos, email,
    especialidades,
    color_agenda: color,
    es_admin: esAdmin,
    activa,
    pdf_delitos_sexuales: pdfRuta,
    fecha_pdf_delitos: fechaPdf,
  };

  try {
    if (esAlta) {
      // 1. Verificar que el ID no existe ya
      const existe = await sg(`profesionales?id=eq.${encodeURIComponent(id)}&select=id&limit=1`);
      if (existe.length) { toast('Ese ID ya existe', true); return; }

      // 2. Invitar via Supabase Auth (el usuario recibirá email para activar)
      const inviteRes = await fetch(`${SUPA_URL}/auth/v1/invite`, {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${G.sesion.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });
      if (!inviteRes.ok) {
        const err = await inviteRes.json().catch(() => ({}));
        // Si ya existe en Auth, continuamos igualmente (puede que ya tuviera cuenta)
        if (!err.msg?.includes('already registered') && inviteRes.status !== 422) {
          throw new Error(err.msg || `Error en invite: ${inviteRes.status}`);
        }
      }

      // 3. Insertar en profesionales (auth_user_id queda null hasta primer login)
      await sp('profesionales', { id, auth_user_id: null, ...payload });
      toast(`Profesional creado. Se ha enviado invitación a ${email}`);
    } else {
      // Edición
      await fetch(`${SUPA_URL}/rest/v1/profesionales?id=eq.${encodeURIComponent(PRO.editando.id)}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${G.sesion.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });
      toast('Profesional actualizado');
    }
    proCerrarModal();
    await proInit();
    // Refrescar la lista global de G.profesionales usada por el resto de módulos
    G.profesionales = await sg(`profesionales?activa=eq.Si&select=id,nombre,apellidos,color_agenda&order=nombre.asc&limit=50`);
  } catch(e) {
    toast('Error: ' + e.message, true);
  }
}
