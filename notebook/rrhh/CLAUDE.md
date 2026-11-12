# Centro RRHH · programa de la notebook que manda la nómina del sistema de sueldos a la web

Pantalla: https://qualita-produccion.web.app/rrhh (código web en `docs/rrhh*`). En la notebook de Igna: `C:\InformeQualita\rrhh` (copia de estos archivos).

- `rh_sync.ps1`: **solo lee** el esquema SUELDOS (sqlplus con `..\ciclo3\c3_config.ps1` y `c3_sql.ps1`) y sube a Firestore `rhdocs/sis-nomina` (`{ json: {txt, act}, ver, por, ts }`) con la cuenta de `..\rendering_config.ps1` (`imalvasio@frigorificoqualita.com.ar`, que tiene que estar en `rhusuarios`).
  - `E|legajo|cuil|apellido|nombre|sexo|nacimiento|alta|baja|motivo baja|obs baja|sector RRHH|categoría|cargo|convenio|convencionado|calle|nro|piso|depto|cp|teléfono|celular|mail|horas por día`
  - Tablas: `SUELDOS.EMPLEADOS` (activos = `EMP_FECHABAJA` nula; bajas desde 2024), `SECTOR_RRHH`, `CATEGORIAS`, `CARGOS` (o `EMP_CARGO`), `SYS_CONVENIOSCOLECTRABAJO`, `MOTIVOBAJA`.
  - No lee datos bancarios (CBU, cuenta), grupo sanguíneo ni enfermedades preexistentes. No escribe en la base.
  - Solo sube si cambió (`rh_sync_estado.json`). `-SinSubir` deja el texto en `ultimo\sis-nomina.txt`; `-Forzar` sube igual. Log: `rh_sync_log.txt`.
- `instalar_rh_sync.ps1`: tarea de Windows "RRHH a la web" (7:05, 13:05 y 19:05, oculta con `..\ciclo3\c3_oculto.vbs`).
- Pendiente: sueldos del mes desde `SUELDOS.LIQUIDACION` / `LIQUIDACIONDET` / `PERIODOLIQUIDACION` / `CONCEPTOSLIQ` (hoy se importan a mano en la web).
- `.ps1` en UTF-8 con BOM y CRLF. Nada de claves en estos archivos.
