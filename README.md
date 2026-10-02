# Producción Qualitá

Web app de consulta para el Frigorífico Qualitá: stock de medias en cámara, órdenes de desposte y destino habitual de cada corte. Es una página estática: no pide usuario ni contraseña y cualquiera que tenga la dirección puede verla.

## Cómo está armado

- `docs/index.html`: la página. No se toca para cargar datos.
- `docs/datos.json`: todos los datos. Cada actualización es un cambio en este archivo.
- `docs/manifest.webmanifest`, `docs/sw.js`, `docs/icon-*.png`: lo que la hace instalable como app en el celular o la computadora. Con conexión siempre trae los datos nuevos; sin conexión muestra lo último que se vio.
- `herramientas/leer-ordenes-word.js`: convierte a datos las órdenes de producción escritas en Word (pasadas antes a texto con pandoc).

## Publicación

Se publica sola con cada cambio en la rama `main`: GitHub Pages sirve la carpeta `docs/` (Settings → Pages → Deploy from a branch → `main` → `/docs`).

## Datos (`docs/datos.json`)

- `config`: `capacidadCamara` (medias), `actualizado` (texto que se muestra arriba).
- `semanas[]`: una por semana. `remanenteInicial` (medias) y `dias[]` con `propios`, `usuarios` y `venta` en cerdos, y `desposteSig`, las medias que salen a desposte al día siguiente. El resto se calcula en la página:
  - queda para desposte = (propios − venta) × 2
  - disponible = queda para desposte + remanente del día anterior
  - remanente = disponible − desposteSig
  - medias en cámara = (propios + usuarios) × 2 + remanente del día anterior
- `ordenes[]`: una por día de desposte. `estado: "borrador"` mientras falten definiciones; cada corte puede llevar `revisar` (`confirmar` o `definir`), `motivo` y `opciones`.

Regla de frío: lo faenado un día recién se entrega o se desposta al día siguiente.
