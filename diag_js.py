import sys, re

ruta = r"gestion\index.html"
with open(ruta, 'r', encoding='utf-8') as f:
    html = f.read()

# Buscar dónde está cargarFacturas
idx = html.find('cargarFacturas')
print(f"cargarFacturas en posición: {idx}")

# Ver el contexto alrededor: ¿dentro de <script> o fuera?
# Encontrar el <script> más cercano ANTES de esa posición
last_script_open  = html.rfind('<script', 0, idx)
last_script_close = html.rfind('</script>', 0, idx)
print(f"Último <script antes:  pos {last_script_open}")
print(f"Último </script> antes: pos {last_script_close}")

if last_script_open > last_script_close:
    print("OK: cargarFacturas está DENTRO de un <script>")
    # Pero quizás hay un problema de scoping - ver si está en función anónima
    snippet = html[idx-200:idx+100].replace('\n','↵')
    print(f"Contexto: {snippet}")
else:
    print("ERROR: cargarFacturas está FUERA de un <script> - es texto plano")
    # Necesitamos mover el bloque
    
    # Encontrar dónde empieza el bloque de facturas
    js_start = html.rfind('\n// ═', 0, idx)  # busca el comentario de inicio
    if js_start == -1:
        js_start = html.rfind('// FACTURAS', 0, idx) - 5
    
    # Encontrar el </script> que hay DESPUÉS del bloque
    script_end_after = html.find('</script>', idx)
    print(f"Bloque JS va de {js_start} a {script_end_after}")
    print(f"Primeros 80 chars del bloque: {repr(html[js_start:js_start+80])}")
