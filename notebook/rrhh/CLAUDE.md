# Centro RRHH · programa de la notebook que manda la nómina del sistema de sueldos a la web

Pantalla: https://qualita-produccion.web.app/rrhh (código web en `docs/rrhh*`). En la notebook de Igna: `C:\InformeQualita\rrhh` (copia de estos archivos).

- `rh_sync.ps1`: **solo lee** el esquema SUELDOS (sqlplus con `..\ciclo3\c3_config.ps1` y `c3_sql.ps1`) y sube a Firestore `rhdocs/sis-nomina` (`{ json: {txt, act}, ver, por, ts }`) con la cuenta de `..\rendering_config.ps1` (`imalvasio@frigorificoqualita.com.ar`, que tiene que estar en `rhusuarios`).
  - `E|legajo|cuil|apellido|nombre|sexo|nacimiento|alta|baja|motivo baja|obs baja|sector RRHH|categoría|cargo|convenio|convencionado|calle|nro|piso|depto|cp|teléfono|celular|mail|horas por día`
  - Tablas: `SUELDOS.EMPLEADOS` (activos = `EMP_FECHABAJA` nula; bajas desde 2024), `SECTOR_RRHH`, `CATEGORIAS`, `CARGOS` (o `EMP_CARGO`), `SYS_CONVENIOSCOLECTRABAJO`, `MOTIVOBAJA`.
  - No lee datos bancarios (CBU, cuenta), grupo sanguíneo, enfermedades preexistentes, familiares ni el texto de las sanciones. No escribe en la base.
  - Solo sube si cambió (`rh_sync_estado.json`). `-SinSubir` deja el texto en `ultimo\sis-nomina.txt`; `-Forzar` sube igual. Log: `rh_sync_log.txt`.
- También sube (mismo formato `{ json: {txt, act} }`):
  - `rhdocs/sis-liq` `L|AAAAMM|legajo|remunerativo|no remunerativo|asig. familiares|aportes|contribuciones|anticipos|indemnizaciones`: `LIQUIDACIONDET` + `CONCEPTOSLIQ.TIP_CODIGO` (1 haberes, 2 exento sin los auxiliares ≥5000, 3 asignaciones, 4 deducciones: aportes 200-299 y anticipos 301/305, 5 contribuciones <9000) por mes (`FLOOR(PERIODOLIQUIDACION.PERLIQ_PERIODO/10)`; sin las liquidaciones "prueba"), desde pagos 2025. Indemnizaciones y vacaciones no gozadas: conceptos 100, 108, 155, 160.
  - `rhdocs/sis-aus` `A|AAAAMM|legajo|concepto|cantidad` (7 hs enfermedad, 47 días enfermedad, 10 hs accidente, 11 hs injustificadas, 17/24 hs suspensión, 35 hs vacaciones, 30 días vacaciones) y `PR|AAAAMM|legajo|presentismos cobrados|cobra por hora` (liquidaciones normales). La tabla `AUSENCIAS` y `FICHADAS` no se usan desde 2024: las faltas salen de la liquidación.
  - `rhdocs/sis-san` `S|número|fecha|tipo|legajo|motivo|días|desde|hasta|fecha del hecho` (`SANCIONDISCIPLINARIA`, tipos `SYS_TIPOSANCION`: 1 apercibimiento, 2 acta de constatación, 3 suspensión; sin `SDIS_TEXTO`), desde 2024.
  - `rhdocs/sis-vac` `V|número|legajo|período|días|notificación|inicio|fin|reintegro|estado` (`VACACIONESNOTIFICACION`, estados 0 solicitada, 1 confirmada, 2 notificada), período ≥ 2023.
- La web considera "liquidado" un mes cuando tiene sueldos de más de la mitad de la dotación: ahí ausentismo, masa salarial y costo salen del sistema.
- `instalar_rh_sync.ps1`: tarea de Windows "RRHH a la web" (7:05, 13:05 y 19:05, oculta con `..\ciclo3\c3_oculto.vbs`).
- `.ps1` en UTF-8 con BOM y CRLF. Nada de claves en estos archivos.
