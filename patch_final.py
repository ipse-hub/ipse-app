import sys, shutil

# ── Restaurar desde el backup más limpio ──────────────────────
# Usar index.html.bak2 que se hizo antes de cualquier modificación
import os
backups = ['gestion\\index.html.bak2', 'gestion\\index.html.bak']
base = None
for b in backups:
    if os.path.exists(b):
        base = b
        break

if not base:
    print("ERROR: no encuentro backup")
    sys.exit(1)

print(f"Usando backup: {base}")
shutil.copy(base, 'gestion\\index.html')

with open('gestion\\index.html', 'r', encoding='utf-8') as f:
    html = f.read()
print(f"Base limpia: {len(html)} chars")

# ── Verificar que es limpia ───────────────────────────────────
for cosa in ['page-facturas', 'cargarFacturas', 'modal-factura']:
    print(f"  {cosa}: {cosa in html}")

errores = []

# ── 1. CDN jsPDF ─────────────────────────────────────────────
CDN_XLSX  = '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>'
CDN_JSPDF = '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>'
if CDN_JSPDF not in html:
    if CDN_XLSX in html:
        html = html.replace(CDN_XLSX, CDN_XLSX + '\n' + CDN_JSPDF)
        print("OK 1. CDN jsPDF")
    else:
        errores.append("No encuentro CDN xlsx")
else:
    print("-- 1. CDN ya estaba")

# ── 2. Nav item ───────────────────────────────────────────────
NAV_ANCHOR = "navigate('servicios')"
if "navigate('facturas')" not in html:
    idx = html.find(NAV_ANCHOR)
    if idx >= 0:
        fin = html.find('</div>', idx) + len('</div>')
        ins = '\n    <div class="nav-item" onclick="navigate(\'facturas\')"><span class="icon">\U0001f9fe</span><span>Facturas</span></div>'
        html = html[:fin] + ins + html[fin:]
        print("OK 2. Nav Facturas")
    else:
        errores.append("No encuentro nav servicios")
else:
    print("-- 2. Nav ya estaba")

# ── 3. Página Facturas ────────────────────────────────────────
page_html = open('fac_page.txt', 'r', encoding='utf-8').read().strip()
if 'id="page-facturas"' not in html:
    # Buscar el anchor exacto: justo antes de </div><!-- /content -->
    anchor = '  </div><!-- /content -->'
    if anchor in html:
        html = html.replace(anchor, page_html + '\n\n  ' + anchor.strip())
        print("OK 3. Página Facturas")
    else:
        errores.append(f"No encuentro anchor /content. Buscando... contexto: {repr(html[html.find('/content')-20:html.find('/content')+20])}")
else:
    print("-- 3. Página ya estaba")

# ── 4. Modal Factura ──────────────────────────────────────────
modal_html = open('fac_modal.txt', 'r', encoding='utf-8').read().strip()
if 'id="modal-factura"' not in html:
    anchor = '<div class="toast" id="toast">'
    if anchor in html:
        html = html.replace(anchor, modal_html + '\n\n' + anchor)
        print("OK 4. Modal Factura")
    else:
        errores.append("No encuentro anchor toast")
else:
    print("-- 4. Modal ya estaba")

# ── 5. navigate() ─────────────────────────────────────────────
if "page==='facturas'" not in html:
    anchor = "if (page==='servicios') cargarServicios();"
    if anchor in html:
        html = html.replace(anchor, anchor + "\n  if (page==='facturas') cargarFacturas();")
        print("OK 5. navigate()")
    else:
        errores.append("No encuentro if servicios en navigate()")
else:
    print("-- 5. navigate ya estaba")

# ── 6. titles ─────────────────────────────────────────────────
if "'Facturas'" not in html:
    anchor = "servicios:'Servicios'}"
    if anchor in html:
        html = html.replace(anchor, "servicios:'Servicios',facturas:'Facturas'}")
        print("OK 6. titles")
    else:
        errores.append("No encuentro titles servicios")
else:
    print("-- 6. titles ya estaba")

# ── 7. JS — INSERTAR ANTES DE "let toastTimer" ───────────────
# Este es el punto clave: DESPUÉS del cierre } de navigate(), ANTES de toastTimer
js_code = open('fac_script.txt', 'r', encoding='utf-8').read().strip()
if 'cargarFacturas' not in html:
    anchor = '\nlet toastTimer;'
    if anchor in html:
        html = html.replace(anchor, '\n\n' + js_code + '\n' + anchor)
        print("OK 7. JS Facturas insertado antes de toastTimer")
    else:
        errores.append("No encuentro 'let toastTimer'")
else:
    print("-- 7. JS ya estaba")

# ── Resultado ─────────────────────────────────────────────────
if errores:
    print("\nERRORES:")
    for e in errores:
        print(" -", e)
    sys.exit(1)

# Verificación final
print("\nVerificación:")
for cosa in ['page-facturas', 'cargarFacturas', 'modal-factura', 'abrirModalFactura', 'let toastTimer']:
    print(f"  {cosa}: {cosa in html}")

with open('gestion\\index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print(f"\nGuardado OK ({len(html)} chars)")
