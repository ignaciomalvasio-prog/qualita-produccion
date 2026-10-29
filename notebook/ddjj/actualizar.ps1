# ============================================================
#  Baja de GitHub la última versión de los programas del Centro de desposte (carpeta notebook/ddjj del repositorio
#  ignaciomalvasio-prog/qualita-produccion) y reemplaza los que cambiaron. Las claves (config_local.ps1) no se tocan.
#  Lo llama dj_pedido.ps1 (como mucho una vez por hora). A mano: actualizar.ps1 -Ya
#  Para que una PC no se actualice sola (por ejemplo mientras se prueba algo): crear NO_ACTUALIZAR.txt en esta carpeta.
# ============================================================
param([switch]$Ya)
$ErrorActionPreference = 'Stop'
$Base  = Split-Path -Parent $MyInvocation.MyCommand.Path
$Marca = Join-Path $Base 'tmp\ultima_actualizacion.txt'
$Url   = 'https://raw.githubusercontent.com/ignaciomalvasio-prog/qualita-produccion/main/notebook/ddjj/'
$LogA  = Join-Path $Base 'actualizar_log.txt'
if (-not $Ya -and (Test-Path $Marca) -and ((Get-Date) - (Get-Item $Marca).LastWriteTime).TotalMinutes -lt 60) { return }
New-Item -ItemType Directory -Force -Path (Join-Path $Base 'tmp') | Out-Null
[IO.File]::WriteAllText($Marca, (Get-Date).ToString('o'))
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$h = @{ 'Cache-Control' = 'no-cache' }
function Bajar([string]$n) { return (Invoke-WebRequest -UseBasicParsing -Headers $h -Uri ($Url + [Uri]::EscapeDataString($n) + '?t=' + [DateTime]::UtcNow.Ticks)).RawContentStream.ToArray() }
$lista = [Text.Encoding]::UTF8.GetString((Bajar 'archivos.txt')) -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^[\w .-]+$' }
if (-not ($lista -contains 'dj_sync.ps1')) { throw 'La lista de archivos de GitHub vino vacía o rota' }
$cambiados = @()
foreach ($n in $lista) {
  $bytes = Bajar $n
  if ($bytes.Length -lt 20) { continue }
  $dest = Join-Path $Base $n
  $igual = $false
  if (Test-Path $dest) { $igual = [Convert]::ToBase64String([IO.File]::ReadAllBytes($dest)) -eq [Convert]::ToBase64String($bytes) }
  if (-not $igual) { [IO.File]::WriteAllBytes($dest + '.nuevo', $bytes); Move-Item ($dest + '.nuevo') $dest -Force; $cambiados += $n }
}
if ($cambiados.Count) { try { [IO.File]::AppendAllText($LogA, (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  actualizados: ' + ($cambiados -join ', ') + "`r`n", [Text.Encoding]::UTF8) } catch {} }
if ($Ya) { if ($cambiados.Count) { 'Actualizados: ' + ($cambiados -join ', ') } else { 'Ya estaba todo al día.' } }
