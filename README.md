# Producción Qualitá

Web app del Frigorífico Qualitá. El centro es el **listado de pedidos**; de ahí salen la planilla de producción, la logística y la planilla de medias.

Pantallas que ve cualquiera que tenga la dirección, sin identificarse:

- **Producción:** la planilla de desposte del día, ordenada por corte. Arranca vacía y trae un renglón por cada corte que se suma desde un pedido. Nada entra solo.
- **Logística:** los pedidos del día de entrega agrupados por camión, con lo que lleva cada uno, los kilos cargados contra la capacidad y los que todavía no tienen camión. Abajo, el **stock de camiones**: los disponibles, su capacidad y cuánto les queda ese día.
- **Medias:** por día, los clientes y cuántos animales lleva cada uno (un animal son dos medias), con el total y una pestaña por día de la semana.

Quien carga ingresa con su cuenta de Google, tiene que estar en la lista de editores y ve además:

- **Pedidos:** arriba, un bloque aparte para cargar todo lo que llega (fotos, capturas, mensajes pegados, o a mano). Abajo, los días uno debajo del otro desde hoy, cada uno con sus pedidos: los que aclaran fecha van a esa fecha y los que no, al día hábil siguiente.
  - Al tocar un pedido se abre el desglose por corte, con un botón para sumar cada corte a la planilla de producción del día de entrega (y para quitarlo).
  - Tildando varios pedidos de un día se mandan a un camión: se elige de la lista (los del día y los del stock) y se ve cuánto le queda.
  - Las medias del pedido van solas a la planilla semanal de medias.
- En **Medias**, la planilla de la semana completa (faena por origen, clientes, desposte y stock), editable.
- En **Producción**, la planilla se puede escribir a mano como un texto; los renglones que vienen de un pedido conservan el vínculo.
- En **Logística**, editar el stock de camiones (nombre, capacidad en kilos, nota), crear y borrar camiones del día y pasar pedidos de uno a otro.

Los kilos de cada pedido se estiman: medias y cajas por un peso habitual que se configura en el stock de camiones (47 y 20 kg si no se cambia), más lo que viene escrito en kilos. Las unidades no se pueden estimar; si hace falta, se cargan los kilos a mano en el pedido.

Otros comportamientos:

- La foto de la planilla semanal de faena y medias (Excel) no se lee como pedidos: reemplaza entera a la que había en esa semana (faena y clientes de los cinco días; quedan el stock inicial y las medias de pedidos cargados en la app). Va a la semana que dice la planilla, sin preguntar; si las fechas leídas son de una semana ya pasada, va a la semana que se está cargando.
- Pedidos muestra un día por vez: arranca en mañana (el próximo día hábil), con flechas y fecha para ir a otros días y botones con los otros días que tienen pedidos.
- Un pedido se cambia de día desde el listado: abrirlo y elegir en "Cambiar de día…". Se mueven sus medias y sus cortes en producción, y sale del camión que tenía.
- El texto de cada corte se carga tal cual figura en el pedido (con la unidad solo si el pedido la aclara) y no repite el cliente; el cliente se agrega solo al sumar el corte a producción. Las medias del pedido se muestran como un renglón más de la lista.
- Precios y costos (solo los ve quien ingresa; no se publican): en Pedidos cada corte tiene un casillero de precio por kg y dos cartelitos para marcar si es "+ IVA" o "Final", guardados en el pedido; en Logística cada camión tiene el costo del flete, por viaje o por kg, y la app calcula el costo por kg llevado. Los fletes se guardan en `privado/fletes-{fecha}`.
- Pestaña Clientes (solo para quien ingresa): base de clientes con su número de cuenta, guardada en `privado/clientes`. Se cargan de a uno, pegando una lista, o trayendo los nombres que ya figuran en pedidos y planillas. Cada pedido muestra el número de su cliente cuando el nombre lo identifica sin dudas (mismo nombre, mismo nombre sin la forma societaria, o sucursal de un cliente); si hay varios clientes parecidos, el pedido los propone para elegir. La cuenta que se elige (o se escribe) en un pedido queda como la de ese cliente (marca `p` en la base) y se puede cambiar siempre tocando el número. El número del pedido sale también en Logística. La lista de clientes es un dato de la empresa: no va en el repositorio.
- Ingreso (`docs/acceso.js`, en la app y en el portal): con Google o con cualquier mail y contraseña (por ejemplo @frigorificoqualita.com.ar). Quien crea cuenta con mail recibe un link para confirmarlo y hasta entonces no ve ni carga nada (las reglas piden mail verificado). También hay "Me olvidé la contraseña". Requiere tener activado el proveedor "Correo electrónico/contraseña" en Firebase → Authentication → Método de acceso. Los permisos siguen saliendo de /editores y /vendedores.
- Portal de vendedores: `https://qualita-produccion.web.app/vendedor` (`docs/vendedor.html` + `docs/vendedor.js`). El vendedor entra con su cuenta de Google y carga cliente, fecha de entrega, medias (siempre frescas), productos de la lista de precios (código, nombre y rubro en `PRODUCTOS` de `vendedor.js`, sin precios; también se puede escribir uno que no esté) con fresco o congelado en cada uno, y nota. Al aceptarlo, cada producto pasa al rubro de producción con su nombre y código en el texto. Si todos los cortes van igual, el pedido lleva ese cartelito; si se mezclan, va en cada corte (y así pasa a producción). Cada pedido queda en la colección `ventas` como pendiente; mientras está pendiente lo puede editar o borrar. En la app principal aparece un aviso en Inicio y un recuadro "Pedidos de vendedores" arriba de todo en Pedidos: **Aceptar** lo convierte en un pedido más (con el N° de cuenta de la base, las medias a la planilla y la marca "Vendedor: …"), **Rechazar** lo devuelve con un motivo. Arriba de ese recuadro hay un filtro por vendedor (Todos / cada uno / Sin vendedor) que filtra también los pedidos del día. El vendedor también puede mandar hasta 4 fotos y/o un mensaje pegado (se achican en el navegador y se guardan en el mismo documento de `ventas`, tipo `archivo`, máximo ~1 MB); en Pedidos aparecen con "Leer con IA y cargar", que usa la misma lectura que la carga de fotos de Renzo y deja los pedidos marcados con el vendedor. El vendedor ve el estado (pendiente / aceptado / rechazado) y nunca ve precios, camiones ni otros pedidos. Para habilitar un vendedor: en la consola de Firebase, Firestore, colección `vendedores`, documento con su mail como ID (y si querés un campo `nombre`, texto). Las reglas (`firestore.rules`) solo le dejan leer y escribir sus propios pedidos pendientes, con campos fijos.
- Link para compartir solo Logística: `https://qualita-produccion.web.app/logistica`. Es `docs/logistica.html`, una copia de `index.html` con su propio título (para que al compartirlo diga "Logística Qualitá"); se arma con `python3 tools/paginas.py` y hay que volver a correrlo cada vez que cambia `index.html` (la publicación en Firebase lo corre sola). El link viejo `?solo=logistica` sigue andando. Muestra esa pestaña sola, sin las demás y siempre de solo lectura (aunque quien lo abra tenga sesión de editor). Quien no es editor ve en Logística solo los pedidos que ya tienen camión. Es una vista recortada, no un control de acceso: el sitio principal sigue abierto para quien tenga ese otro link.
- En Logística cada camión se puede imprimir por separado y sus pedidos se ordenan con las flechas; el orden queda guardado en el camión.
- Las planillas por sucursal (por ejemplo DINO) y los mensajes de un cliente con varias sucursales se cargan como un pedido por sucursal, no como uno solo sumado, porque cada sucursal puede ir en un camión distinto.
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
  - `config/log-{fecha}`: la logística de ese día de entrega, en una copia que pueden leer todos: `camiones[] {id, nombre, nota, kg}` y `pedidos[]` con su camión y sus kilos estimados. Se reescribe cada vez que cambia un pedido o un camión de ese día.
  - `privado/ia`: clave de la API de Anthropic para leer fotos (solo editores).
  - `config/general`: desposte habitual, capacidad de cámaras, stock de camiones (`flota[] {id, nombre, kg, nota}`) y pesos estimados (`kgMedia`, `kgCaja`).
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
