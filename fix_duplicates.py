import sys

ruta = r"gestion\index.html"
with open(ruta, 'r', encoding='utf-8') as f:
    html = f.read()

PAGE_ID = 'id="page-facturas"'
count = html.count(PAGE_ID)
print(f"Bloques page-facturas encontrados: {count}")

if count <= 1:
    print("Nada que corregir")
    sys.exit(0)

# Encontrar el primer bloque y eliminar los siguientes
first = html.find(PAGE_ID)

# Buscar todos los inicios del div page-facturas
OPEN = '<div class="page" id="page-facturas">'
positions = []
pos = 0
while True:
    idx = html.find(OPEN, pos)
    if idx == -1:
        break
    positions.append(idx)
    pos = idx + 1

print(f"Posiciones encontradas: {positions}")

# Quedarnos solo con el primero: reconstruir el HTML
# desde el inicio hasta el fin del primer bloque, luego saltar los duplicados

def find_block_end(h, start):
    """Encuentra el </div> de cierre del bloque que empieza en start"""
    depth = 0
    pos = start
    while pos < len(h):
        if h[pos:pos+4] == '<div':
            depth += 1
        elif h[pos:pos+6] == '</div>':
            depth -= 1
            if depth == 0:
                return pos + 6
        pos += 1
    return -1

# Calcular fin de cada bloque duplicado
ends = [find_block_end(html, p) for p in positions]
print(f"Fins de bloque: {ends}")

# Reconstruir: mantener el primero, eliminar el resto
new_html = html[:ends[0]]
# Saltar duplicados 2 y 3, continuar desde el fin del último
new_html += html[ends[-1]:]

remaining = new_html.count(PAGE_ID)
print(f"Bloques tras corrección: {remaining}")

with open(ruta, 'w', encoding='utf-8') as f:
    f.write(new_html)

print(f"Guardado ({len(new_html)} chars)")
