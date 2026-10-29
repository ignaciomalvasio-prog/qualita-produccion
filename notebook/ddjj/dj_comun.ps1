# ============================================================
#  Centro de desposte · lo común a los programas de esta carpeta (conexión a la base, cuenta de la web y consultas)
#  Las claves NO están en el código: van en config_local.ps1 de esta misma carpeta (propio de cada PC, no se sube a GitHub):
#     $Conn     = 'usuario/clave@//SERVER5:1521/QUALITA'
#     $SyncMail = 'mail de la cuenta de la web'   ;   $SyncPass = 'su contraseña'
#     (opcional) $SqlPlus = 'ruta a sqlplus.exe'  — si no está, se busca solo
#  Si no hay config_local.ps1 (notebook de Igna) usa las de ..\ciclo3\c3_config.ps1 y ..\rendering_config.ps1.
#  Lo cargan dj_sync.ps1, dj_traza.ps1, dj_pedido.ps1 y habilitar_usuario.ps1 con:  . (Join-Path $Base 'dj_comun.ps1')
# ============================================================
if (-not $Base) { $Base = $PSScriptRoot }
$Raiz = Split-Path -Parent $Base
$TicdC3 = 4                                             # tipo de ciclo de desposte de Ciclo III
$__cfg = Join-Path $Base 'config_local.ps1'
if (Test-Path $__cfg) { . $__cfg }
else {
  if (Test-Path (Join-Path $Raiz 'ciclo3\c3_config.ps1')) { . (Join-Path $Raiz 'ciclo3\c3_config.ps1') }
  if (Test-Path (Join-Path $Raiz 'rendering_config.ps1')) { . (Join-Path $Raiz 'rendering_config.ps1') }
}
if (-not $SqlPlus -or -not (Test-Path $SqlPlus)) {
  $SqlPlus = $null
  $c = Get-Command sqlplus.exe -ErrorAction SilentlyContinue
  if ($c) { $SqlPlus = $c.Source }
  else {
    foreach ($pat in @('C:\app\*\product\*\*\bin\sqlplus.exe', 'C:\app\product\*\*\bin\sqlplus.exe', 'C:\oracle*\*\bin\sqlplus.exe', 'C:\oracle*\product\*\*\bin\sqlplus.exe', 'C:\Program Files*\Oracle*\*\bin\sqlplus.exe', 'C:\instantclient*\sqlplus.exe', 'C:\oracle\instantclient*\sqlplus.exe')) {
      $f = Get-ChildItem $pat -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($f) { $SqlPlus = $f.FullName; break }
    }
  }
}
# La conexión va con la dirección completa del servidor (no depende de la configuración de nombres de Oracle de la PC)
if ("$Conn" -match '^([^/]+)/([^@]+)@//([^:/]+):(\d+)/(.+)$') {
  $Conn = $Matches[1] + '/' + $Matches[2] + '@(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=' + $Matches[3] + ')(PORT=' + $Matches[4] + '))(CONNECT_DATA=(SERVICE_NAME=' + $Matches[5] + ')))'
}

$TmpDir = Join-Path $Base 'tmp'
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null
$Enc1252 = [System.Text.Encoding]::GetEncoding(1252)

# ---------- ejecutar SQL con sqlplus (solo lectura) ----------
function Invoke-Sql([string]$body) {
  if (-not $SqlPlus) { throw 'No encuentro sqlplus.exe (el cliente de Oracle) en esta PC' }
  $id = [guid]::NewGuid().ToString('N').Substring(0, 10)
  $f  = Join-Path $TmpDir "s_$id.sql"
  $o  = Join-Path $TmpDir "s_$id.out"
  $hdr = @"
SET HEADING OFF
SET FEEDBACK OFF
SET PAGESIZE 0
SET LINESIZE 4000
SET TRIMSPOOL ON
SET TRIMOUT ON
SET VERIFY OFF
SET DEFINE OFF
ALTER SESSION SET NLS_NUMERIC_CHARACTERS='.,';
ALTER SESSION SET CURRENT_SCHEMA=FRIGO;
SPOOL "$o"
"@
  [IO.File]::WriteAllText($f, $hdr + "`r`n" + $body + "`r`nSPOOL OFF`r`nEXIT;`r`n", $Enc1252)
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $SqlPlus -S -L $Conn "@$f" *> $null } finally { $ErrorActionPreference = $prev }
  $lines = @()
  if (Test-Path $o) { $lines = [IO.File]::ReadAllLines($o, $Enc1252) }
  Remove-Item $f, $o -ErrorAction SilentlyContinue
  $err = $lines | Where-Object { $_ -match '^(ORA|SP2|PLS)-\d+' } | Select-Object -First 3
  if ($err) { throw ('Error de base: ' + ($err -join ' / ')) }
  return ,$lines
}
# Nombre de artículo sin caracteres que rompan el formato (tab y |)
$Den = "TRIM(TRANSLATE(NVL(a.art_denom,'?'), CHR(9)||'|', '  '))"
