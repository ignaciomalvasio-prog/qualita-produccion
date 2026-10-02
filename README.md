# Producción Qualitá

Web app del Frigorífico Qualitá: stock de medias en cámara, órdenes de desposte y destino habitual de cada corte. Cualquiera que tenga la dirección puede verla sin identificarse. Quien carga los pedidos y el plan de faena ingresa con su cuenta de Google y tiene que estar en la lista de editores.

## Cómo está armado

- `docs/index.html` y `docs/app.js`: la página y su lógica.
- Los datos viven en Firestore (proyecto de Firebase `qualita-produccion`), en las colecciones `semanas`, `ordenes` y `config`. Todas las pantallas abiertas se actualizan solas.
- `docs/datos.json`: copia inicial de los datos. Se muestra mientras la base está vacía y sirve para importarla la primera vez.
- `firestore.rules`: reglas de seguridad cargadas en Firebase. Todos leen; solo escriben las cuentas cuyo mail figura como documento en la colección `editores`, que se administra desde la consola de Firebase.
- `docs/manifest.webmanifest`, `docs/sw.js`, `docs/icon-*.png`: lo que la hace instalable como app en el celular o la computadora. Con conexión siempre trae los datos nuevos; sin conexión muestra lo último que se vio.
- `herramientas/leer-ordenes-word.js`: convierte a datos las órdenes de producción escritas en Word (pasadas antes a texto con pandoc).

## Publicación

Cada cambio en la rama `main` se publica solo en dos lugares:

- Firebase Hosting, la dirección principal: https://qualita-produccion.web.app (workflow `.github/workflows/firebase-hosting.yml`, que usa el secreto `FIREBASE_SERVICE_ACCOUNT` del repositorio).
- GitHub Pages, que sirve la carpeta `docs/`: https://ignaciomalvasio-prog.github.io/qualita-produccion/

## Cómo se arma una orden

En la pestaña Cargar pedidos el editor elige la fecha, agrega los pedidos (la app le propone los habituales de ese día de la semana) y la orden se arma sola: primero los pedidos con cantidad y el resto de cada corte al destino habitual. Un destino se toma como habitual cuando las últimas cinco órdenes confirmadas coinciden; si no, el corte queda marcado para que el editor elija entre las opciones ya usadas. Cada orden confirmada se suma a lo aprendido.

## Datos

- `config`: `capacidadCamara` (medias), `actualizado` (texto que se muestra arriba).
- `semanas[]`: una por semana. `remanenteInicial` (medias) y `dias[]` con `propios`, `usuarios` y `venta` en cerdos, y `desposteSig`, las medias que salen a desposte al día siguiente. El resto se calcula en la página:
  - queda para desposte = (propios − venta) × 2
  - disponible = queda para desposte + remanente del día anterior
  - remanente = disponible − desposteSig
  - medias en cámara = (propios + usuarios) × 2 + remanente del día anterior
- `ordenes[]`: una por día de desposte. `estado: "borrador"` mientras falten definiciones; cada corte puede llevar `revisar` (`confirmar` o `definir`), `motivo` y `opciones`.

Regla de frío: lo faenado un día recién se entrega o se desposta al día siguiente.
