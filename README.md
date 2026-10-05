# Producción Qualitá

Web app del Frigorífico Qualitá. Muestra lo mismo que hoy circula por WhatsApp, en dos pantallas de lectura:

- **Producción:** la orden de desposte del día, con el mismo texto que el Word. Al editar es un solo texto, como en Word: cada corte empieza con su nombre y dos puntos, y los renglones de abajo son sus líneas. Se puede pegar una orden entera.
- **Medias:** por día, solo los clientes y cuántas medias reses lleva cada uno, con el total. Arriba hay una pestaña por cada día de la semana, con las medias de ese día, para pasar de uno a otro. Es lo que necesita el encargado de faena. Quien edita ve en cambio la planilla de la semana completa (faena, clientes, desposte y stock), editable. Los clientes cargados con 0 solo aparecen en la planilla semanal.
- La foto de la planilla semanal de faena y medias (Excel) no se lee como pedidos: reemplaza la faena y los clientes de esa semana, en cerdos y por día de faena, tal cual figura. Volver a subirla no duplica. Si las fechas de la planilla no son las de la semana que se está cargando, la app pregunta en qué semana ponerla antes de tocar nada.
- Las lecturas corren en segundo plano: se puede subir una foto en una pantalla y seguir trabajando o subir otra en otra. Un cartel abajo avisa qué se está leyendo y qué se guardó. Si hay una edición abierta, lo que entra no pisa lo que se está escribiendo.
- Al editar una orden hay un bloque "Agregar pedido" con las tres formas de carga; lo leído entra solo en esa orden.
- Un pedido leído que ya estaba cargado igual (mismo cliente, entrega, medias y cortes) no se repite.
- Cuando no hay orden para un día o no hay faena para una semana, quien edita ve ahí mismo las tres formas de cargar: subir fotos, pegar texto o cargar a mano. En Producción, si el texto pegado es una orden entera (copiada de Word), se carga tal cual.
- Producción y Medias abren siempre en el día de hoy (sábado y domingo, en el lunes), haya o no algo cargado. Pedidos abre en lo que se entrega mañana.

Quien edita ve además la planilla de la semana, igual al Excel: faena por origen (propios y usuarios), clientes, total de clientes y lo que queda para desposte, más el stock de medias deducido.

Cualquiera que tenga la dirección puede verla sin identificarse. Quien carga ingresa con su cuenta de Google, tiene que estar en la lista de editores y ve una tercera pantalla, **Pedidos**. Todo lo cargado se puede editar.

Dirección: https://qualita-produccion.web.app

## Cómo se usa

1. **Lunes:** en Medias se carga la faena de la semana. La primera vez también el stock de medias en cámara; después se deduce solo de la semana anterior, y siempre se puede corregir.
2. **Cada día:** en Pedidos se suben fotos o capturas de los pedidos, se pega el texto de un mensaje (WhatsApp) o se cargan a mano. Lo que se lee de una foto o de un texto se guarda solo y entra en la planilla de medias y en la orden; cada pedido guardado tiene Editar y Quitar. Los que no se pudieron leer bien quedan marcados para revisar.
   - Las medias van a la planilla, en el día de faena anterior a la entrega, convertidas a cerdos (20 medias = 10 cerdos).
   - Los cortes van a la orden de producción del día de entrega.
3. **Orden de producción:** si no existe, se arma sola: los pedidos del día y, para el resto de cada corte, el destino de las últimas órdenes. Si las últimas cinco no coinciden, el corte queda marcado "sin definir" para que el editor lo resuelva. También propone los pedidos que suelen repetirse ese día de la semana.

## Cómo está armado

- `docs/index.html`, `docs/app.js`: la página y su lógica. Sin dependencias fuera del SDK de Firebase.
- Firestore (proyecto `qualita-produccion`):
  - `faena/{lunes}`: una semana. `stockInicial` (medias propias sin vender en cámara al empezar el lunes; `null` = se deduce) y `dias[5]`, cada uno con `faena[] {origen, propios, usuarios}` y `clientes[] {cliente, cant}` en cerdos.
  - `produccion/{fecha}`: una orden. `medias`, `mercado`, `estado` (`borrador` o `lista`) y `cortes[] {corte, lineas[] {t}, colgado}`.
  - `pedidos/{id}`: pedidos cargados (solo editores).
  - `privado/ia`: clave de la API de Anthropic para leer fotos (solo editores).
  - `config/general`: desposte habitual y capacidad de cámaras.
  - `editores/{mail}`: lista de cuentas que pueden cargar. Se administra desde la consola de Firebase.
- `firestore.rules`: copia de las reglas de seguridad cargadas en Firebase.
- `docs/datos.json`: datos iniciales (semana del 28/9 y órdenes de septiembre). Se muestran mientras la base está vacía y se importan solos la primera vez que ingresa un editor.

Cuentas del stock, por día de faena:

- queda para desposte = (propios − clientes) × 2 medias
- remanente = disponible del día − medias de la orden de producción de ese día
- disponible del día siguiente = remanente + queda para desposte
- medias en cámara = remanente + (propios + usuarios) × 2

Lo faenado un día recién se entrega o se desposta al día siguiente.

## Publicación

Cada cambio en `main` se publica solo en Firebase Hosting (`.github/workflows/firebase-hosting.yml`, con el secreto `FIREBASE_SERVICE_ACCOUNT`) y en GitHub Pages (carpeta `docs/`).
