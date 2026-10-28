# Producción Qualitá — guía para trabajar en el código

Web app del Frigorífico Qualitá: pedidos → producción, logística, medias, clientes y portal de vendedores.
En vivo: https://qualita-produccion.web.app (links para compartir: `/logistica`, `/produccion`, `/ciclo3`, `/rendering`, `/medias`; vendedores: `/vendedor`).
`README.md` describe con detalle qué hace cada pantalla; cada cambio nuevo suma un renglón al final.

## Quién pide y cómo responder
- Los cambios los piden Igna (dueño) y Renzo (coordinador de logística). Responder en español rioplatense, corto y en palabras simples: qué cambió y cómo se usa, sin jerga técnica.
- Si un pedido es ambiguo y cambia lo que se construye (por ejemplo, quién puede ver algo), preguntar antes.

## Estructura
- `docs/` es todo el sitio (HTML/JS sin frameworks ni build):
  - `app.js` (la app principal, un solo archivo), `index.html` (HTML + todo el CSS), `sw.js` (service worker / caché), `acceso.js` (ingreso con Google o mail).
  - `vendedor.html` / `vendedor.js`: portal de vendedores.
  - `control.html` / `caja.html` + `control-base.js` (Firebase e ingreso), `control-comun.js`, `control.js`, `control.css`, `control-estilo.css`: Centro de control Ciclo III y Q Express (privado, con ingreso). No usan `app.js` ni `paginas.py`. Colecciones `c3usuarios`, `c3sis`, `c3docs`, `c3cambios`, `c3mail` (mails de la planilla de caja que manda la notebook). Modo de prueba: `window.__mock = { user, rol, sis, docs }`. El programa de la notebook que les sube datos está en `C:\InformeQualita\ciclo3` (ver su CLAUDE.md).
  - `ddjj.html` / `ddjj.js` / `ddjj-c3.js` / `ddjj-rend.js` / `ddjj-faena.js` / `ddjj.css`: DDJJ de producción de desposte y de Ciclo III (chacinados, en `ddjj-c3.js`; datos `C3`/`C3I` del mismo `c3sis/dj-AAAA-MM`; lo corregido en `c3docs/ddjj-AAAA-MM` → `c3`) (S. Saavedra); menudencias y rendering para SENASA en `ddjj-men.js` (lo corregido en `men`); rendimiento de desposte en `ddjj-rend.js` (lo corregido en `rend`); faena y mortalidad en `ddjj-faena.js` (`c3sis/dj-anual`, muertos a mano en `c3docs/ddjj-muertos`). Usa el mismo ingreso y colecciones que el Centro de control (`c3usuarios` con rol `ddjj`, `c3sis/dj-AAAA-MM`, `c3docs/ddjj-equiv` y `c3docs/ddjj-AAAA-MM`). La impresión replica las medidas de la planilla de Excel (formulario preimpreso: la tabla arranca a media hoja). Programa de la notebook: `C:\InformeQualita\ddjj` (ver su CLAUDE.md). Prueba: `tests/prueba113.js`.
  - `logistica.html`, `produccion.html`, `ciclo3.html`: **se generan** desde `index.html` con `python3 tools/paginas.py`. No editarlos a mano.
- `firestore.rules`: reglas de la base. Colecciones: `faena`, `produccion` (los embutidos van con id `c3-AAAA-MM-DD`), `config` (incluye `log-AAAA-MM-DD`, público) — lectura pública, escritura de editores; `pedidos` y `privado` solo editores; la pestaña Cámara (planilla de faena y desposte de Renzo) guarda en `privado/camara-*` y solo se muestra a la cuenta cuya huella SHA-256 del mail está en `CAM_CUENTAS` (app.js); `editores/{mail}` y `vendedores/{mail}` dan permiso; `ventas` = pedidos de vendedores.
- `.github/workflows/firebase-hosting.yml`: cada push a `main` corre `tools/paginas.py` y publica en Firebase Hosting (tarda ~1–2 min).

## Rutina para publicar un cambio
1. Hacer el cambio en `docs/`.
2. Subir la versión del caché en `docs/sw.js` (`produccion-qualita-vNN` → `vNN+1`), si no los celulares siguen viendo la versión vieja.
3. `python3 tools/paginas.py` (regenera las páginas para compartir; `--revisar` controla que estén al día).
4. Probar (abajo). Revisar que no haya errores de consola ni desborde horizontal en celular (400 px).
5. Agregar un renglón en `README.md` describiendo el cambio.
6. Commit y push a `main`. Verificar: `gh api repos/ignaciomalvasio-prog/qualita-produccion/actions/runs --jq '.workflow_runs[0]|.status+" "+.conclusion'` y que `curl -s https://qualita-produccion.web.app/sw.js` muestre la versión nueva.

## Pruebas
- Playwright + Chromium. La app tiene un modo de prueba: si existe `window.__mock` (datos, usuario, editores, `ia` falsa) no usa Firebase ni la IA real. Ver los ejemplos en `tests/`.
- `bash tests/correr.sh` corre todas; `bash tests/correr.sh 55 56` solo esas. Necesita `npm i -g playwright` y Chromium instalado.
- Para una prueba nueva, copiar una parecida (`tests/prueba58.js` es un buen modelo) y usar el reloj fijo (`page.clock.install`).

## Reglas que no se rompen
- El repositorio y el sitio son públicos: **nunca** subir la lista de clientes (nombres + N° de cuenta), claves de IA, ni el JSON de la cuenta de servicio de Firebase. La clave de IA la carga un editor desde la app (queda en `privado`).
- Quien mira sin cuenta (o por un link para compartir) solo lee; solo los editores cargan.
- Precios: se ven en Pedidos (editores) y, por decisión de Igna, también en Logística (incluido el link público). Los costos de flete siguen privados (`privado/fletes-*`). El portal de vendedores no muestra precios.
- Las reglas de Firestore (`firestore.rules`) las publica una persona a mano en la consola de Firebase; avisar cuando un cambio las necesita y pasar el texto.
- Editores y vendedores se agregan creando el documento `editores/{mail}` o `vendedores/{mail}` en Firestore (consola de Firebase).
- No borrar datos de producción para probar: usar `window.__mock`.

## Detalles útiles del código
- Estado global `S`; `render()` dibuja la pestaña actual; acciones por `data-act` en un solo listener de clicks; `store` abstrae Firebase / mock.
- `ocupado()` frena el redibujo mientras alguien edita (para no pisar lo que escribe).
- Producción (planilla de frescos) muestra cada renglón en la unidad en que se pidió (kg, cajas, canastos, unidades); el total de cada corte es un solo número en kg (caja y canasto = 20 kg, unidades según el peso por unidad) con el detalle de lo pedido abajo. Lo guardado no cambia.
- Logística se publica en `config/log-{fecha}` con `publicarLog(f)`: cualquier cambio de pedidos, camiones o precios tiene que volver a publicarlo.
- Después de las 15 h la app arranca en el próximo día hábil (`fechaProdInicial`).
- Lecturas de la base (cupo): la app escucha `config` por rangos (`subRangos`: general, rendering2, log-* de los últimos 45 días, rend-* de los últimos 150). No volver a suscribirse a colecciones enteras que crecen todos los días; cada apertura de la app (incluidos los links públicos y las recargas automáticas después de cada publicación) las vuelve a leer completas. El proyecto está en plan Blaze desde el 27/10/2026.

## Pedidos para más adelante (todavía no se hacen)
- (Renzo, 25/10/2026) Ir agrupando pedidos y clientes según cómo salen todas las semanas (qué clientes van juntos, qué día, en qué camión), para armar las cargas más rápido. Antes de construirlo, preguntarle bien qué agrupación quiere.
