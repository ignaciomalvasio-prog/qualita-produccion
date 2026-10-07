#!/usr/bin/env python3
"""Arma docs/logistica.html a partir de docs/index.html.

Es la misma app, pero abre solo en Logística (de solo lectura) y tiene su propio título, para que
al compartir el link diga "Logística Qualitá". Hay que correrlo cada vez que cambia index.html:

    python3 tools/paginas.py
"""
import pathlib, sys

raiz = pathlib.Path(__file__).resolve().parent.parent / "docs"
s = (raiz / "index.html").read_text(encoding="utf-8")

cambios = [
    ('<html lang="es">', '<html lang="es" data-solo="logistica">'),
    ('<meta name="apple-mobile-web-app-title" content="Producción">', '<meta name="apple-mobile-web-app-title" content="Logística">'),
    ('<meta property="og:title" content="Producción y Logística Qualitá">', '<meta property="og:title" content="Logística Qualitá">'),
    ('<meta property="og:description" content="Pedidos, producción, logística y medias del Frigorífico Qualitá.">', '<meta property="og:description" content="Camiones y pedidos para entregar del Frigorífico Qualitá.">'),
    ('<link rel="manifest" href="manifest.webmanifest">', '<link rel="manifest" href="logistica.webmanifest">'),
    ('<title>Producción y Logística Qualitá</title>', '<title>Logística Qualitá</title>'),
    ('<span class="marca-nom">Producción y logística</span>', '<span class="marca-nom">Logística</span>'),
]
for viejo, nuevo in cambios:
    if s.count(viejo) != 1:
        sys.exit("No encontré una sola vez en index.html: " + viejo)
    s = s.replace(viejo, nuevo)

destino = raiz / "logistica.html"
if "--revisar" in sys.argv:
    sys.exit(0 if destino.exists() and destino.read_text(encoding="utf-8") == s else "docs/logistica.html está desactualizado: corré python3 tools/paginas.py")
destino.write_text(s, encoding="utf-8")
print("docs/logistica.html actualizado")
