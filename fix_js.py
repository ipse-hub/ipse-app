import sys

ruta = r"gestion\index.html"
with open(ruta, 'r', encoding='utf-8') as f:
    html = f.read()

js_code = open('fac_script.txt', 'r', encoding='utf-8').read().strip()

if 'cargarFacturas' in html:
    print("-- JS ya estaba")
    sys.exit(0)

# Insertar justo antes del cierre </script>
ANCHOR = '</script>\n</body>'
if ANCHOR not in html:
    # Intentar variantes
    ANCHOR = '</script>\r\n</body>'
    if ANCHOR not in html:
        ANCHOR = '</script></body>'

if ANCHOR in html:
    html = html.replace(ANCHOR, '\n\n' + js_code + '\n\n' + ANCHOR)
    print("OK JS insertado antes de </script>")
else:
    # Buscar el ultimo </script>
    idx = html.rfind('</script>')
    if idx == -1:
        print("ERROR: no encuentro </script>")
        sys.exit(1)
    html = html[:idx] + '\n\n' + js_code + '\n\n' + html[idx:]
    print("OK JS insertado (rfind)")

with open(ruta, 'w', encoding='utf-8') as f:
    f.write(html)

print(f"Guardado ({len(html)} chars)")
print("cargarFacturas presente:", 'cargarFacturas' in html)
