import sys

ruta = r"gestion\index.html"
with open(ruta, 'r', encoding='utf-8') as f:
    html = f.read()

if 'id="page-facturas"' in html:
    print("-- Pagina ya estaba, nada que hacer")
    sys.exit(0)

PAGE_HTML = open('fac_page.txt', 'r', encoding='utf-8').read()

# Buscar el anchor exacto: </div><!-- /content -->
# El output anterior mostro: '</div>\n\n  </div><!-- /content -->\n</main>'
anchor = '  </div><!-- /content -->'
if anchor in html:
    html = html.replace(anchor, PAGE_HTML + '\n\n  ' + anchor.strip())
    print("OK anchor v1")
else:
    anchor2 = '</div><!-- /content -->'
    if anchor2 in html:
        html = html.replace(anchor2, PAGE_HTML + '\n\n' + anchor2)
        print("OK anchor v2")
    else:
        print("ERROR: no encuentro el anchor /content")
        idx = html.find('/content')
        print("Contexto:", repr(html[max(0,idx-40):idx+30]))
        sys.exit(1)

with open(ruta, 'w', encoding='utf-8') as f:
    f.write(html)

print(f"Guardado ({len(html)} chars)")
print("page-facturas presente:", 'id="page-facturas"' in html)
