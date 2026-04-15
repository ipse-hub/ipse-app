import sys

ruta = r"gestion\index.html"
with open(ruta, 'r', encoding='utf-8') as f:
    html = f.read()

js_code = open('fac_script.txt', 'r', encoding='utf-8').read().strip()

# El problema: el JS se insertó ANTES del } de cierre de navigate()
# Necesitamos:
# 1. Eliminar el bloque de facturas de donde está
# 2. Reinsertarlo en el sitio correcto: antes de "let toastTimer"

# Paso 1: localizar y extraer el bloque de facturas del HTML
MARCA_INICIO = '// ═══════════════════════════════════════════════════════\n//  FACTURAS'
MARCA_FIN    = 'function exportarFacturasXLSX()'

idx_ini = html.find(MARCA_INICIO)
if idx_ini == -1:
    # Intentar con la marca del fac_script.txt real
    MARCA_INICIO = '// ═══════════════════════════════════════════════════════\n//  FACTURAS\n// ═══'
    idx_ini = html.find('//  FACTURAS\n// ═')
    if idx_ini == -1:
        idx_ini = html.find('G.facturas = rows;')
        if idx_ini != -1:
            # Retroceder para encontrar el inicio del bloque
            idx_ini = html.rfind('\n\n', 0, idx_ini) 

if idx_ini == -1:
    print("ERROR: no encuentro inicio del bloque de facturas")
    # Buscar por cargarFacturas directamente
    idx_ini = html.find('async function cargarFacturas()')
    if idx_ini == -1:
        print("FATAL: tampoco encuentro cargarFacturas como función")
        sys.exit(1)
    # Retroceder al inicio del bloque de comentarios
    idx_ini = html.rfind('\n\n', 0, idx_ini)

print(f"Inicio bloque facturas: {idx_ini}")
print(f"Contexto inicio: {repr(html[idx_ini:idx_ini+80])}")

# Encontrar el fin del bloque: la última función de facturas es exportarFacturasXLSX
idx_fin_func = html.find('exportarFacturasXLSX()', idx_ini)
if idx_fin_func == -1:
    print("ERROR: no encuentro exportarFacturasXLSX")
    sys.exit(1)

# Avanzar hasta el } de cierre de esa función
depth = 0
pos = idx_fin_func
started = False
while pos < len(html):
    c = html[pos]
    if c == '{':
        depth += 1
        started = True
    elif c == '}':
        depth -= 1
        if started and depth == 0:
            idx_fin = pos + 1
            break
    pos += 1

print(f"Fin bloque facturas: {idx_fin}")
print(f"Contexto fin: {repr(html[idx_fin:idx_fin+60])}")

# Extraer el bloque
bloque_facturas = html[idx_ini:idx_fin].strip()
print(f"Bloque extraído: {len(bloque_facturas)} chars")

# Paso 2: eliminar el bloque de donde está
html_sin_bloque = html[:idx_ini] + html[idx_fin:]
print(f"HTML sin bloque: {len(html_sin_bloque)} chars")
print(f"cargarFacturas en HTML sin bloque: {'cargarFacturas' in html_sin_bloque}")

# Paso 3: insertar en el lugar correcto — antes de "let toastTimer"
ANCHOR = 'let toastTimer;'
if ANCHOR not in html_sin_bloque:
    print("ERROR: no encuentro 'let toastTimer'")
    sys.exit(1)

html_final = html_sin_bloque.replace(
    ANCHOR,
    bloque_facturas + '\n\n' + ANCHOR
)

print(f"HTML final: {len(html_final)} chars")
print(f"cargarFacturas en HTML final: {'cargarFacturas' in html_final}")

# Verificar que navigate() no está roto
nav_idx = html_final.find("if (page==='facturas') cargarFacturas()")
print(f"navigate facturas en posición: {nav_idx}")
# Ver contexto alrededor
print(f"Contexto navigate: {repr(html_final[nav_idx-50:nav_idx+60])}")

with open(ruta, 'w', encoding='utf-8') as f:
    f.write(html_final)

print(f"\nGuardado OK")
