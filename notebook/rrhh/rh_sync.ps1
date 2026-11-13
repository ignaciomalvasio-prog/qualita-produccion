# ============================================================
#  Centro RRHH · ENVÍO A LA WEB  (https://qualita-produccion.web.app/rrhh)
#  Lee el sistema de sueldos (esquema SUELDOS, solo consultas SELECT) y sube a Firestore:
#    rhdocs/sis-nomina : empleados activos y los dados de baja desde 2024 (un renglón E por persona)
#      E|legajo|cuil|apellido|nombre|sexo|nacimiento|alta|baja|motivo baja|obs. baja|sector RRHH|categoría|cargo|convenio|convencionado|calle|nro|piso|depto|cód. postal|teléfono|celular|mail|horas por día
#    rhdocs/sis-liq : sueldos por mes y legajo desde 2025 (suma de todas las liquidaciones del mes: mensual, vacaciones, final)
#      L|AAAAMM|legajo|remunerativo (tipo 1)|no remunerativo (tipo 2 sin indemnizaciones)|asig. familiares (tipo 3)|aportes (200-299)|contribuciones (tipo 5)|anticipos y adelantos (301, 305)|indemnizaciones y vac. no gozadas (100, 108, 155, 160)
#    rhdocs/sis-aus : ausencias liquidadas por mes y legajo desde 2025 (conceptos en horas o días)
#      A|AAAAMM|legajo|concepto|cantidad   (7 hs enfermedad, 47 días enfermedad, 10 hs accidente, 11 hs injustificadas, 17/24 hs suspensión, 35 hs vacaciones, 30 días vacaciones)
#      PR|AAAAMM|legajo|presentismos cobrados|tiene horas normales (1/0)   (de las liquidaciones normales)
#    rhdocs/sis-san : sanciones disciplinarias desde 2024 (sin el texto de la nota)
#      S|número|fecha|tipo (1 apercibimiento, 2 acta de constatación, 3 suspensión)|legajo|motivo|días|desde|hasta|fecha del hecho
#    rhdocs/sis-vac : vacaciones notificadas desde el período 2023
#      V|número|legajo|período|días|notificación|inicio|fin|reintegro|estado (0 solicitada, 1 confirmada, 2 notificada)
#  No lee datos bancarios (CBU, cuenta), de salud, familiares ni el texto de las sanciones. Solo sube lo que cambió (rh_sync_estado.json).
#  Lo corre la tarea de Windows "RRHH a la web" (7, 13 y 19 h). La web arma la nómina con esto
#  (lo del sistema manda; lo cargado a mano en la web queda para los datos que el sistema no tiene).
#  Uso:  rh_sync.ps1 [-Forzar] [-SinSubir]   (-SinSubir deja el texto en rrhh\ultimo\ y no sube nada)
#  Log: rh_sync_log.txt
# ============================================================
param([switch]$Forzar, [switch]$SinSubir)
$ErrorActionPreference = 'Stop'
$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
$Raiz = Split-Path -Parent $Base
$TmpDir = Join-Path $Base 'tmp'
. (Join-Path $Raiz 'ciclo3\c3_config.ps1')   # $SqlPlus y $Conn
. (Join-Path $Raiz 'ciclo3\c3_sql.ps1')      # Invoke-Sql (solo lectura)
$Proyecto = 'qualita-produccion'
$ApiKey   = 'AIzaSyD9DSR82lLUigI8WeCjlR4nIc5I7xyjmTY'   # clave pública de la app web (no es secreta)
$BajasDesde = '2024-01-01'
$LiqDesde   = '2025-01-01'   # fecha de pago de las liquidaciones a subir
$SanDesde   = '2024-01-01'
$Log      = Join-Path $Base 'rh_sync_log.txt'
$Estado   = Join-Path $Base 'rh_sync_estado.json'
$FsBase   = "https://firestore.googleapis.com/v1/projects/$Proyecto/databases/(default)/documents"
function LogL([string]$t) {
  $l = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $t
  try { [IO.File]::AppendAllText($Log, $l + "`r`n", [Text.Encoding]::UTF8) } catch {}
  Write-Host $l
}
function Hash([string]$t) {
  $sha = [Security.Cryptography.SHA1]::Create()
  return [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($t))).Replace('-', '')
}
function L([string]$c) { return "TRIM(TRANSLATE(NVL(TO_CHAR($c),' '), CHR(9)||CHR(10)||CHR(13)||'|', '    '))" }
function F([string]$c) { return "TO_CHAR($c,'YYYY-MM-DD')" }
function Get-Nomina {
  $sql = @"
SELECT 'OK|'||TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI') FROM dual;
SELECT 'E|'||e.emp_codigo||'|'||$(L 'e.emp_cuit')||'|'||$(L 'e.emp_apellido')||'|'||$(L 'e.emp_nombre')||'|'||$(L 'e.emp_sexo')||'|'||$(F 'e.emp_fechanacimiento')||'|'||$(F 'e.emp_fechaalta')||'|'||$(F 'e.emp_fechabaja')||'|'||$(L 'mb.mba_denom')||'|'||$(L 'e.emp_observbaja')||'|'||$(L 'sr.srrhh_denom')||'|'||$(L 'ca.cat_denom')||'|'||$(L 'NVL(cr.car_denom,e.emp_cargo)')||'|'||$(L 'cc.cct_denom')||'|'||NVL(e.emp_convencionado,0)||'|'||$(L 'e.emp_calle')||'|'||$(L 'e.emp_dir_nro')||'|'||$(L 'e.emp_dir_piso')||'|'||$(L 'e.emp_dir_departamento')||'|'||$(L 'e.emp_codigopostal')||'|'||$(L 'e.emp_telefono')||'|'||$(L 'e.emp_celular')||'|'||$(L 'e.emp_email')||'|'||$(L 'e.emp_horasdia')
  FROM sueldos.empleados e
  LEFT JOIN sueldos.sector_rrhh sr ON sr.srrhh_codigo = e.srrhh_codigo
  LEFT JOIN sueldos.categorias ca ON ca.cat_codigo = e.cat_codigo
  LEFT JOIN sueldos.cargos cr ON cr.car_codigo = e.car_codigo
  LEFT JOIN sueldos.sys_convenioscolectrabajo cc ON cc.cct_codigo = e.cct_codigo
  LEFT JOIN sueldos.motivobaja mb ON mb.mba_codigo = e.mba_codigo
 WHERE e.emp_fechabaja IS NULL OR e.emp_fechabaja >= DATE '$BajasDesde'
 ORDER BY e.emp_codigo;
"@
  return Invoke-Sql $sql
}
function N([string]$c) { return "TO_CHAR(ROUND(NVL($c,0),2),'TM9','NLS_NUMERIC_CHARACTERS=''.,''')" }
function Get-Liq {
  $sql = @"
SELECT 'OK|'||TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI') FROM dual;
SELECT 'L|'||FLOOR(p.perliq_periodo/10)||'|'||d.emp_codigo
  ||'|'||$(N 'SUM(CASE WHEN c.tip_codigo=1 THEN d.liqdet_importe END)')
  ||'|'||$(N 'SUM(CASE WHEN c.tip_codigo=2 AND d.conl_codigo < 5000 AND d.conl_codigo NOT IN (100,108,155,160) THEN d.liqdet_importe END)')
  ||'|'||$(N 'SUM(CASE WHEN c.tip_codigo=3 THEN d.liqdet_importe END)')
  ||'|'||$(N '-SUM(CASE WHEN c.tip_codigo=4 AND d.conl_codigo BETWEEN 200 AND 299 THEN d.liqdet_importe END)')
  ||'|'||$(N 'SUM(CASE WHEN c.tip_codigo=5 AND d.conl_codigo < 9000 THEN d.liqdet_importe END)')
  ||'|'||$(N '-SUM(CASE WHEN d.conl_codigo IN (301,305) THEN d.liqdet_importe END)')
  ||'|'||$(N 'SUM(CASE WHEN d.conl_codigo IN (100,108,155,160) THEN d.liqdet_importe END)')
  FROM sueldos.liquidaciondet d
  JOIN sueldos.conceptosliq c ON c.conl_codigo = d.conl_codigo AND c.empr_codigo = d.empr_codigo
  JOIN sueldos.periodoliquidacion p ON p.perliq_numero = d.perliq_numero
 WHERE p.perliq_fecpago >= DATE '$LiqDesde' AND LOWER(p.perliq_denom) NOT LIKE '%prueba%'
 GROUP BY FLOOR(p.perliq_periodo/10), d.emp_codigo
 ORDER BY 1;
"@
  return Invoke-Sql $sql
}
function Get-Aus {
  $sql = @"
SELECT 'OK|'||TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI') FROM dual;
SELECT 'A|'||FLOOR(p.perliq_periodo/10)||'|'||d.emp_codigo||'|'||d.conl_codigo||'|'||$(N 'SUM(d.liqdet_cantidad)')
  FROM sueldos.liquidaciondet d JOIN sueldos.periodoliquidacion p ON p.perliq_numero = d.perliq_numero
 WHERE p.perliq_fecpago >= DATE '$LiqDesde' AND LOWER(p.perliq_denom) NOT LIKE '%prueba%' AND d.conl_codigo IN (7,47,10,11,17,24,35,30)
 GROUP BY FLOOR(p.perliq_periodo/10), d.emp_codigo, d.conl_codigo
HAVING SUM(d.liqdet_cantidad) <> 0
 ORDER BY 1;
SELECT 'PR|'||FLOOR(p.perliq_periodo/10)||'|'||d.emp_codigo||'|'||SUM(CASE WHEN d.conl_codigo IN (164,165,83,84,85,134) THEN 1 ELSE 0 END)||'|'||MAX(CASE WHEN d.conl_codigo = 2 THEN 1 ELSE 0 END)
  FROM sueldos.liquidaciondet d JOIN sueldos.periodoliquidacion p ON p.perliq_numero = d.perliq_numero
 WHERE p.perliq_fecpago >= DATE '$LiqDesde' AND MOD(p.perliq_periodo,10) = 2 AND p.til_codigo = 1 AND LOWER(p.perliq_denom) NOT LIKE '%prueba%'
 GROUP BY FLOOR(p.perliq_periodo/10), d.emp_codigo
 ORDER BY 1;
"@
  return Invoke-Sql $sql
}
function Get-San {
  $sql = @"
SELECT 'OK|'||TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI') FROM dual;
SELECT 'S|'||s.sdis_numero||'|'||$(F 's.sdis_fecha')||'|'||s.tsa_codigo||'|'||s.emp_codigo||'|'||$(L 'SUBSTR(s.sdis_denominacion,1,120)')||'|'||NVL(s.sdis_cantidaddias,0)||'|'||$(F 's.sdis_fechadesde')||'|'||$(F 's.sdis_fechahasta')||'|'||$(F 's.sdis_fechaocurrencia')
  FROM sueldos.sanciondisciplinaria s
 WHERE s.sdis_fecha >= DATE '$SanDesde'
 ORDER BY s.sdis_fecha, s.sdis_numero;
"@
  return Invoke-Sql $sql
}
function Get-Vac {
  $sql = @"
SELECT 'OK|'||TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI') FROM dual;
SELECT 'V|'||v.vacn_numero||'|'||v.emp_codigo||'|'||v.vacn_periodo||'|'||NVL(v.vacn_diasvacaciones,0)||'|'||$(F 'v.vacn_fechanotificacion')||'|'||$(F 'v.vacn_fechainicio')||'|'||$(F 'v.vacn_fechafin')||'|'||$(F 'v.vacn_fechareintegro')||'|'||NVL(v.evac_codigo,0)
  FROM sueldos.vacacionesnotificacion v
 WHERE v.vacn_periodo >= 2023
 ORDER BY v.vacn_periodo, v.vacn_fechainicio;
"@
  return Invoke-Sql $sql
}
$Paso = ''
try {
  if (-not (Test-Path $SqlPlus)) { throw "No encuentro sqlplus en $SqlPlus" }
  $prev = @{}
  if ((Test-Path $Estado) -and -not $Forzar -and -not $SinSubir) { (Get-Content $Estado -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $prev[$_.Name] = $_.Value } }
  $ahora = Get-Date -Format 'yyyy-MM-dd HH:mm'
  $Hdr = $null; $subidos = 0; $res = @()
  foreach ($id in @('sis-nomina', 'sis-liq', 'sis-aus', 'sis-san', 'sis-vac')) {
    $Paso = "leer $id"
    $lin = switch ($id) { 'sis-nomina' { Get-Nomina } 'sis-liq' { Get-Liq } 'sis-aus' { Get-Aus } 'sis-san' { Get-San } 'sis-vac' { Get-Vac } }
    $txt = ($lin | Where-Object { $_ -ne '' }) -join "`n"
    $n = @($lin | Where-Object { $_ -match '^[A-Z]+\|' -and $_ -notlike 'OK|*' }).Count
    if ($id -eq 'sis-nomina' -and $n -lt 10) { throw "El sistema devolvió solo $n empleados: no subo nada" }
    $res += "$id $n"
    if ($SinSubir) {
      New-Item -ItemType Directory -Force -Path (Join-Path $Base 'ultimo') | Out-Null
      [IO.File]::WriteAllText((Join-Path $Base "ultimo\$id.txt"), $txt, [Text.Encoding]::UTF8); continue
    }
    $h = Hash ($txt -replace '^OK\|[^\n]*\n?', '')
    if ($prev[$id] -eq $h) { continue }
    if (-not $Hdr) {
      . (Join-Path $Raiz 'rendering_config.ps1')   # $SyncMail y $SyncPass
      $Paso = 'ingresar con la cuenta de la app'
      $auth = Invoke-RestMethod -Method Post -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$ApiKey" -ContentType 'application/json; charset=utf-8' `
        -Body ([Text.Encoding]::UTF8.GetBytes((@{ email = $SyncMail.Trim(); password = $SyncPass; returnSecureToken = $true } | ConvertTo-Json)))
      $Hdr = @{ Authorization = "Bearer $($auth.idToken)" }
    }
    $Paso = "subir $id"
    # mismo formato que lo que guarda la web (rhdocs/{nombre} = { json, ver, por, ts }) para que C3API.leerDoc lo lea igual
    $json = @{ txt = $txt; act = $ahora } | ConvertTo-Json -Compress
    $body = @{ fields = @{ json = @{ stringValue = $json }; ver = @{ integerValue = [string][int64]((Get-Date) - [datetime]'2026-01-01').TotalMinutes }; por = @{ stringValue = 'Sistema de sueldos' }; ts = @{ stringValue = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') } } } | ConvertTo-Json -Depth 5 -Compress
    Invoke-RestMethod -Method Patch -Uri "$FsBase/rhdocs/$id" -Headers $Hdr -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
    $prev[$id] = $h; $subidos++
  }
  if (-not $SinSubir) { ($prev | ConvertTo-Json -Depth 3) | Set-Content -Path $Estado -Encoding UTF8 }
  LogL ("OK" + $(if ($SinSubir) { ' (sin subir, en ultimo\)' } else { ", $subidos subidos" }) + ': ' + ($res -join ', '))

} catch {
  $det = ''
  try { if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $det = ' | ' + ($_.ErrorDetails.Message -replace '\s+', ' ') } } catch {}
  LogL ("ERROR" + $(if ($Paso) { " al $Paso" } else { '' }) + ": " + $_.Exception.Message + $det)
  exit 1
}
