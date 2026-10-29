# Centro de desposte · programas de la PC que manda los datos del sistema a la web

La pantalla está en https://qualita-produccion.web.app/ddjj (código web en `docs/ddjj*` del repositorio `ignaciomalvasio-prog/qualita-produccion`).
Estos programas están en el mismo repositorio, carpeta `notebook/ddjj/`, y en la PC que los corre en `C:\InformeQualita\ddjj`.

## Cómo se cambian (Igna y Sabi, cada uno con su Claude)
1. Se edita el archivo en el repositorio (`notebook/ddjj/`), commit y push a `main`. Si se agrega un archivo nuevo, sumarlo a `archivos.txt`.
2. La PC que corre los programas se actualiza sola: `dj_pedido.ps1` llama a `actualizar.ps1`, que una vez por hora baja de GitHub los archivos de `archivos.txt` que cambiaron. Para forzarlo: `actualizar.ps1 -Ya`. Para frenarlo en una PC: crear `NO_ACTUALIZAR.txt` en la carpeta.
3. Las claves NO van al repositorio (es público): están solo en `config_local.ps1` de cada PC (`$Conn`, `$SyncMail`, `$SyncPass`; opcional `$SqlPlus`). Tampoco se suben `faena_link_clave.txt`, logs ni `dj_ultimo.txt`.

## Qué hay
- `dj_comun.ps1`: carga las claves (`config_local.ps1`; si no está, las de la notebook de Igna: `..\ciclo3\c3_config.ps1` y `..\rendering_config.ps1`), busca `sqlplus.exe` y define `Invoke-Sql`.
- `dj_sync.ps1`: lee del sistema (solo SELECT) el mes actual y el anterior y lo sube a Firestore `c3sis/dj-AAAA-MM` (TR, IN, RE, EN, C3, C3I, ME, CO) y `c3sis/dj-anual` (FA, MU, TQ); publica `config/fp-<clave>` para el link público de faena. Solo sube si cambió (`dj_sync_estado.json`). `-SinSubir` deja lo leído en `dj_ultimo.txt`; `-Forzar` sube igual; `-Revisar` prueba Oracle, la conexión y la cuenta de la web.
- `dj_pedido.ps1` (tarea "DDJJ pedidos de actualizacion", cada 5 min de 6:30 a 21:30): atiende "Traer datos nuevos" (`c3docs/ddjj-pedido`) y, durante cada vuelta, las consultas de Trazabilidad (`c3docs/ddjj-traza`, revisa cada 6 s y corre `dj_traza.ps1`).
- `dj_traza.ps1`: trazabilidad por tropa o por correlativo (el primer número de la etiqueta `correlativo-artículo-kilos` = `PRODUCTOS.pro_identif`). Por pasos, con listas ya resueltas: 1-2 s. Prueba: `dj_traza.ps1 -Tipo tropa -Valor 261791 -Probar`.
- `instalar_dj_sync.ps1` (tarea "DDJJ desposte a la web", 7, 11, 15 y 19 h) e `instalar_dj_pedido.ps1`. Usan `oculto.vbs` para que no se vean ventanas.
- `armar_paquete.bat/.ps1`: arma `C:\InformeQualita\Paquete Centro de desposte.zip` (programas + `config_local.ps1` con las claves) para instalar en otra PC con `INSTALAR en esta PC.bat`. `desactivar_en_esta_pc.bat` apaga las dos tareas en la PC vieja.
- `habilitar_usuario.ps1 -Mail x -Nombre y -Rol ddjj|faena`: da acceso a la web (c3usuarios).

## De dónde sale cada dato
- Tropas (hoja Ingreso): `DESPOSTEING` con artículos 18 (Capón) y 19 (M.E.I) → `PRODUCTOS` (pro_numero, pro_item) → `TROPAS`. Fecha de faena = `MIN(PRODUCTOS.pro_fecha)`; total de tropa = `tro_cabezas`.
- Cortes (hoja Producción): `DESPOSTERES` (kilos, unidades, piezas, contrato, `despr_tropa` para las medias enteras art. 22). Los reprocesos que reingresan se restan del mismo corte.
- Ciclo III: `ticd_codigo = 4`. Menudencias `ticd 3`, rendering `ticd 6` (renglones ME).
- Ventas: `REMITOSDET`/`REMITOS` por (pro_numero, pro_item); remitos internos `REMITOSINT`/`REMITOSINTDET`.
- Qué artículo va en cada renglón: `c3docs/ddjj-equiv` (pestaña Equivalencias). Lo corregido a mano: `c3docs/ddjj-AAAA-MM`.

## Reglas
1. Nunca escribir en la base del sistema (solo SELECT).
2. `.ps1` en UTF-8 con BOM y fin de línea CRLF.
3. Nada de claves en estos archivos.
