# Producción Qualitá

Web app del Frigorífico Qualitá. El centro es el **listado de pedidos**; de ahí salen la planilla de producción, la logística y la planilla de medias.

Pantallas que ve cualquiera que tenga la dirección, sin identificarse:

- **Producción:** la planilla de desposte del día, escrita como el Word de siempre. Arranca vacía y trae un renglón por cada corte que se suma desde un pedido.
- **Logística:** los pedidos del día de entrega agrupados por camión (nombre y nota), con lo que lleva cada uno, y los que todavía no tienen camión.
- **Medias:** por día, los clientes y cuántos animales lleva cada uno (un animal son dos medias), con el total y una pestaña por día de la semana.

Quien carga ingresa con su cuenta de Google, tiene que estar en la lista de editores y ve además:

- **Pedidos:** donde se sube todo lo que llega (fotos, capturas, mensajes pegados, o a mano). Queda un listado por fecha de entrega: los pedidos que aclaran fecha van a esa fecha y los que no, al día hábil siguiente.
  - Al tocar un pedido se abre el desglose por corte, con un botón para sumar cada corte a la planilla de producción del día de entrega (y para quitarlo).
  - Tildando varios pedidos se arma un camión, o se agregan a uno que ya existe.
  - Las medias del pedido van solas a la planilla semanal de medias.
- En **Medias**, la planilla de la semana completa (faena por origen, clientes, desposte y stock), editable.
- En **Producción**, la planilla se puede escribir a mano como un texto; los renglones que vienen de un pedido conservan el vínculo.
- En **Logística**, crear, renombrar y borrar camiones, y pasar pedidos de uno a otro.

Otros comportamientos:

- La foto de la planilla semanal de faena y medias (Excel) no se lee como pedidos: reemplaza la faena y los clientes de esa semana. Si sus fechas no son las de la semana que se está cargando, la app pregunta dónde ponerla.
- Las lecturas corren en segundo plano y un cartel avisa qué se está leyendo y qué se guardó.
- Un pedido leído que ya estaba cargado igual no se repite.
- Al editar un pedido, los cortes que ya estaban en producción siguen ahí con el texto nuevo; al borrarlo salen de producción, de logística y de la planilla de medias.
- Producción, Logística y Medias abren en el día de hoy (sábado y domingo, en el lunes). Pedidos abre en lo que se entrega mañana.

Dirección: https://qualita-produccion.web.app

## Cómo está armado

- `docs/index.html`, `docs/app.js`: la página y su lógica. Sin dependencias fuera del SDK de Firebase.
- Firestore (proyecto `qualita-produccion`):
  - `faena/{lunes}`: una semana. `stockInicial` (medias propias sin vender en cámara al empezar el lunes; `null` = se deduce) y `dias[5]`, cada uno con `faena[] {origen, propios, usuarios}` y `clientes[] {cliente, cant}` en cerdos.
  - `produccion/{fecha}`: una planilla de producción. `medias`, `mercado`, `estado` (`borrador` o `lista`) y `cortes[] {corte, lineas[] {t, p, ck}}`; `p` y `ck` son el pedido y el corte de donde vino el renglón.
  - `pedidos/{id}`: pedidos cargados (solo editores). `cliente`, `entrega`, `medias`, `peso`, `nota`, `camion` y `cortes[] {k, corte, texto}`.
  - `config/log-{fecha}`: la logística de ese día de entrega, en una copia que pueden leer todos: `camiones[] {id, nombre, nota}` y `pedidos[]` con su camión. Se reescribe cada vez que cambia un pedido o un camión de ese día.
  - `privado/ia`: clave de la API de Anthropic para leer fotos (solo editores).
  - `config/general`: desposte habitual y capacidad de cámaras.
  - `editores/{mail}`: lista de cuentas que pueden cargar. Se administra desde la consola de Firebase.
- `firestore.rules`: copia de las reglas de seguridad cargadas en Firebase.
- `docs/datos.json`: datos iniciales (semana del 28/9 y órdenes de septiembre). Se muestran mientras la base está vacía y se importan solos la primera vez que ingresa un editor.

Cuentas del stock, por día de faena:

- queda para desposte = (propios − clientes) × 2 medias
- remanente = disponible del día − medias de la planilla de producción de ese día (el desposte habitual si todavía no hay planilla)
- disponible del día siguiente = remanente + queda para desposte
- medias en cámara = remanente + (propios + usuarios) × 2

Lo faenado un día recién se entrega o se desposta al día siguiente.

## Publicación

Cada cambio en `main` se publica solo en Firebase Hosting (`.github/workflows/firebase-hosting.yml`, con el secreto `FIREBASE_SERVICE_ACCOUNT`) y en GitHub Pages (carpeta `docs/`).
