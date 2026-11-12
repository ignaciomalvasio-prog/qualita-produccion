# ============================================================
#  Centro RRHH · ENVÍO A LA WEB  (https://qualita-produccion.web.app/rrhh)
#  Lee el sistema de sueldos (esquema SUELDOS, solo consultas SELECT) y sube a Firestore:
#    rhdocs/sis-nomina : empleados activos y los dados de baja desde 2024 (un renglón E por persona)
#      E|legajo|cuil|apellido|nombre|sexo|nacimiento|alta|baja|motivo baja|obs. baja|sector RRHH|categoría|cargo|convenio|convencionado|calle|nro|piso|depto|cód. postal|teléfono|celular|mail|horas por día
#  No lee datos bancarios (CBU, cuenta) ni de salud. Solo sube si algo cambió (rh_sync_estado.json).
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
$Paso = ''
try {
  if (-not (Test-Path $SqlPlus)) { throw "No encuentro sqlplus en $SqlPlus" }
  $prev = @{}
  if ((Test-Path $Estado) -and -not $Forzar -and -not $SinSubir) { (Get-Content $Estado -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $prev[$_.Name] = $_.Value } }
  $ahora = Get-Date -Format 'yyyy-MM-dd HH:mm'
  $Paso = 'leer la nómina'
  $lin = Get-Nomina
  $txt = ($lin | Where-Object { $_ -ne '' }) -join "`n"
  $n = @($lin | Where-Object { $_ -like 'E|*' }).Count
  if ($n -lt 10) { throw "El sistema devolvió solo $n empleados: no subo nada" }
  if ($SinSubir) {
    New-Item -ItemType Directory -Force -Path (Join-Path $Base 'ultimo') | Out-Null
    [IO.File]::WriteAllText((Join-Path $Base 'ultimo\sis-nomina.txt'), $txt, [Text.Encoding]::UTF8)
    LogL "OK (sin subir): $n empleados en ultimo\sis-nomina.txt"; exit 0
  }
  $h = Hash ($txt -replace '^OK\|[^\n]*\n?', '')
  if ($prev['sis-nomina'] -eq $h) { LogL "OK: $n empleados, sin cambios."; exit 0 }
  . (Join-Path $Raiz 'rendering_config.ps1')   # $SyncMail y $SyncPass
  $Paso = 'ingresar con la cuenta de la app'
  $auth = Invoke-RestMethod -Method Post -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$ApiKey" -ContentType 'application/json; charset=utf-8' `
    -Body ([Text.Encoding]::UTF8.GetBytes((@{ email = $SyncMail.Trim(); password = $SyncPass; returnSecureToken = $true } | ConvertTo-Json)))
  $Hdr = @{ Authorization = "Bearer $($auth.idToken)" }
  $Paso = 'subir sis-nomina'
  # mismo formato que lo que guarda la web (rhdocs/{nombre} = { json, ver, por, ts }) para que C3API.leerDoc lo lea igual
  $json = @{ txt = $txt; act = $ahora } | ConvertTo-Json -Compress
  $body = @{ fields = @{ json = @{ stringValue = $json }; ver = @{ integerValue = [string][int64]((Get-Date) - [datetime]'2026-01-01').TotalMinutes }; por = @{ stringValue = 'Sistema de sueldos' }; ts = @{ stringValue = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') } } } | ConvertTo-Json -Depth 5 -Compress
  Invoke-RestMethod -Method Patch -Uri "$FsBase/rhdocs/sis-nomina" -Headers $Hdr -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
  $prev['sis-nomina'] = $h
  ($prev | ConvertTo-Json -Depth 3) | Set-Content -Path $Estado -Encoding UTF8
  LogL "OK: $n empleados subidos."
} catch {
  $det = ''
  try { if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $det = ' | ' + ($_.ErrorDetails.Message -replace '\s+', ' ') } } catch {}
  LogL ("ERROR" + $(if ($Paso) { " al $Paso" } else { '' }) + ": " + $_.Exception.Message + $det)
  exit 1
}
