#!/usr/bin/env python3
"""Arma las páginas para compartir a partir de docs/index.html: docs/logistica.html, docs/produccion.html, docs/ciclo3.html y docs/rendering.html.

Son la misma app, pero abren solo en esa pestaña (de solo lectura) y tienen su propio título, para que
al compartir el link diga "Logística Qualitá" o "Producción Qualitá". Hay que correrlo cada vez que
cambia index.html (la publicación en Firebase lo corre sola):

    python3 tools/paginas.py
"""
import pathlib, sys

raiz = pathlib.Path(__file__).resolve().parent.parent / "docs"
base = (raiz / "index.html").read_text(encoding="utf-8")

PAGINAS = {
    "logistica": ("Logística", "Camiones y pedidos para entregar del Frigorífico Qualitá."),
    "produccion": ("Producción", "Orden de producción del día del Frigorífico Qualitá."),
    "ciclo3": ("Ciclo III", "Embutidos del día (chorizo, morcilla, salchicha) del Frigorífico Qualitá."),
    "rendering": ("Rendering", "Kilos de insumos y producidos de rendering, por día, del Frigorífico Qualitá."),
}

mal = []
for nombre, (titulo, desc) in PAGINAS.items():
    s = base
    cambios = [
        ('<html lang="es">', '<html lang="es" data-solo="%s">' % nombre),
        ('<meta name="apple-mobile-web-app-title" content="Producción">', '<meta name="apple-mobile-web-app-title" content="%s">' % titulo),
        ('<meta property="og:title" content="Producción y Logística Qualitá">', '<meta property="og:title" content="%s Qualitá">' % titulo),
        ('<meta property="og:description" content="Pedidos, producción, logística y medias del Frigorífico Qualitá.">', '<meta property="og:description" content="%s">' % desc),
        ('<link rel="manifest" href="manifest.webmanifest">', '<link rel="manifest" href="%s.webmanifest">' % nombre),
        ('<title>Producción y Logística Qualitá</title>', '<title>%s Qualitá</title>' % titulo),
        ('<span class="marca-nom">Producción y logística</span>', '<span class="marca-nom">%s</span>' % titulo),
    ]
    for viejo, nuevo in cambios:
        if s.count(viejo) != 1:
            sys.exit("No encontré una sola vez en index.html: " + viejo)
        s = s.replace(viejo, nuevo)
    destino = raiz / (nombre + ".html")
    if "--revisar" in sys.argv:
        if not destino.exists() or destino.read_text(encoding="utf-8") != s:
            mal.append(str(destino))
        continue
    destino.write_text(s, encoding="utf-8")
    print("docs/%s.html actualizado" % nombre)
if mal:
    sys.exit("Desactualizado: " + ", ".join(mal) + ". Corré python3 tools/paginas.py")
