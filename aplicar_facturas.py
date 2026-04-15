import sys, os

# Ejecutar desde: C:\Users\Abraham\Documents\Plantillas personalizadas de Office\ipse-app
ruta = r"gestion\index.html"

if not os.path.exists(ruta):
    print(f"ERROR: No encuentro {ruta}")
    print("Asegurate de ejecutar este script desde la carpeta ipse-app")
    sys.exit(1)

with open(ruta, 'r', encoding='utf-8') as f:
    html = f.read()

print(f"Leido: {len(html)} chars")
errores = []

# ── 1. CDN jsPDF ────────────────────────────────────────────────
CDN_XLSX  = '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>'
CDN_JSPDF = '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>'
if CDN_JSPDF not in html:
    if CDN_XLSX in html:
        html = html.replace(CDN_XLSX, CDN_XLSX + '\n' + CDN_JSPDF)
        print("OK CDN jsPDF anadido")
    else:
        errores.append("No encontre el CDN de xlsx en <head>")
else:
    print("-- CDN jsPDF ya estaba")

# ── 2. Nav item ─────────────────────────────────────────────────
SERVICIOS_NAV = "navigate('servicios')"
FACTURAS_NAV  = "navigate('facturas')"
if FACTURAS_NAV not in html:
    # Buscar el cierre del nav tras servicios
    idx = html.find(SERVICIOS_NAV)
    if idx >= 0:
        fin_div = html.find('</div>', idx)
        fin_pos = fin_div + len('</div>')
        insertar = '\n    <div class="nav-item" onclick="navigate(\'facturas\')"><span class="icon">\U0001f9fe</span><span>Facturas</span></div>'
        html = html[:fin_pos] + insertar + html[fin_pos:]
        print("OK Nav Facturas anadido")
    else:
        errores.append("No encontre nav item servicios")
else:
    print("-- Nav Facturas ya estaba")

# ── 3. Pagina Facturas ──────────────────────────────────────────
PAGE_ANCHOR = '</div><!-- /content -->'
if 'id="page-facturas"' not in html:
    if PAGE_ANCHOR in html:
        page_html = open('fac_page.txt', 'r', encoding='utf-8').read().strip()
        html = html.replace(PAGE_ANCHOR, '\n\n    ' + page_html + '\n\n  ' + PAGE_ANCHOR)
        print("OK Pagina Facturas anadida")
    else:
        errores.append("No encontre /content anchor")
else:
    print("-- Pagina Facturas ya estaba")

# ── 4. Modal Factura ────────────────────────────────────────────
TOAST_ANCHOR = '<div class="toast" id="toast">'
if 'id="modal-factura"' not in html:
    if TOAST_ANCHOR in html:
        modal_html = open('fac_modal.txt', 'r', encoding='utf-8').read().strip()
        html = html.replace(TOAST_ANCHOR, modal_html + '\n\n' + TOAST_ANCHOR)
        print("OK Modal Factura anadido")
    else:
        errores.append("No encontre toast anchor")
else:
    print("-- Modal Factura ya estaba")

# ── 5. navigate() if ───────────────────────────────────────────
NAV_SRV_IF = "if (page==='servicios') cargarServicios();"
if "page==='facturas'" not in html:
    if NAV_SRV_IF in html:
        html = html.replace(
            NAV_SRV_IF,
            NAV_SRV_IF + "\n  if (page==='facturas') cargarFacturas();"
        )
        print("OK navigate() facturas anadido")
    else:
        errores.append("No encontre if servicios en navigate()")
else:
    print("-- navigate facturas ya estaba")

# ── 6. Titles object ────────────────────────────────────────────
TITLES_OLD = "servicios:'Servicios'}"
TITLES_NEW = "servicios:'Servicios',facturas:'Facturas'}"
if "'Facturas'" not in html:
    if TITLES_OLD in html:
        html = html.replace(TITLES_OLD, TITLES_NEW)
        print("OK titles facturas anadido")
    else:
        errores.append("No encontre titles servicios en navigate()")
else:
    print("-- titles facturas ya estaba")

# ── 7. Bloque JS ────────────────────────────────────────────────
JS_ANCHOR = 'let toastTimer;'
if 'cargarFacturas' not in html:
    if JS_ANCHOR in html:
        js_code = open('fac_script.txt', 'r', encoding='utf-8').read().strip()
        html = html.replace(JS_ANCHOR, js_code + '\n\n' + JS_ANCHOR)
        print("OK JS Facturas anadido")
    else:
        errores.append("No encontre toastTimer anchor en el script")
else:
    print("-- JS Facturas ya estaba")

# ── Guardar ─────────────────────────────────────────────────────
if errores:
    print("\nERRORES encontrados:")
    for e in errores:
        print("  -", e)
    print("\nEl archivo NO ha sido modificado.")
    sys.exit(1)
else:
    with open(ruta, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"\nOK gestion\\index.html actualizado ({len(html)} chars)")
    print("Puedes hacer git add + commit cuando lo compruebes en el navegador.")
