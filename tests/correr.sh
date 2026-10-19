#!/usr/bin/env bash
# Corre las pruebas de la app con Playwright (Chromium) contra un servidor local de docs/.
# Uso: bash tests/correr.sh            (todas)
#      bash tests/correr.sh 55 56      (solo esas)
# Las capturas de pantalla quedan en tests/salida/ (no se suben al repositorio).
cd "$(dirname "$0")/.." || exit 1
python3 tools/paginas.py >/dev/null
mkdir -p tests/salida
if ! curl -s -o /dev/null http://127.0.0.1:8765/index.html; then
  (cd docs && nohup python3 -m http.server 8765 >/dev/null 2>&1 &)
  sleep 1
fi
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
lista=("$@")
if [ ${#lista[@]} -eq 0 ]; then lista=($(ls tests/prueba*.js | sed 's/[^0-9]//g' | sort -n)); fi
for t in "${lista[@]}"; do
  echo "== prueba$t"
  timeout 240 node "tests/prueba$t.js" "$PWD/tests/salida" 2>&1 | grep -iE "errores|error|desborde" | sort -u | head -4
done
