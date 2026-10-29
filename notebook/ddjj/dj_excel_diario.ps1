# ============================================================
#  Centro de desposte · guarda solo, todos los días, los Excel de la DDJJ de desposte y del Rendimiento en el Escritorio
#  (pedido de Sabi, 29/10/2026). Lo corre la tarea "DDJJ Excel diario" a las 7:20 (después de que dj_sync.ps1 sube los datos de las 7).
#
#  Qué guarda, en Escritorio\DDJJ\AAAA-MM Mes\ :
#    - "DDJJ desposte dd-mm-aaaa.xlsx" de cada día con desposte del mes hasta ayer que todavía no tenga archivo,
#      y el último día siempre de nuevo (para que tenga lo corregido a mano en la página).
#    - "Rendimiento desposte AAAA-MM.xlsx" del mes (se pisa todos los días).
#  Los Excel son los mismos que los botones de la página: no se calculan acá. Este programa lee los datos de la web
#  (lo del sistema + equivalencias + lo corregido a mano), arma una copia de la página /ddjj con esos datos adentro
#  (window.__mock) y la abre con Edge sin ventana en modo automático (window.__auto); la página arma los Excel y
#  este programa los guarda.
#
#  A mano:  dj_excel_diario.ps1                  (lo de ayer)
#           dj_excel_diario.ps1 -Hasta 2026-10-28  (otro día; también arma lo que falte de ese mes)
#  Log: dj_excel_log.txt. Para que no corra más en esta PC: crear NO_EXCEL_DIARIO.txt en esta carpeta.
# ============================================================
param([string]$Hasta = '')
$ErrorActionPreference = 'Stop'
$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
$Log  = Join-Path $Base 'dj_excel_log.txt'
$ApiKey = 'AIzaSyD9DSR82lLUigI8WeCjlR4nIc5I7xyjmTY'
$FsBase = 'https://firestore.googleapis.com/v1/projects/qualita-produccion/databases/(default)/documents'
$Web    = 'https://qualita-produccion.web.app/'
function LogL([string]$t) { try { [IO.File]::AppendAllText($Log, (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $t + "`r`n", [Text.Encoding]::UTF8) } catch {} ; $t }
if (Test-Path (Join-Path $Base 'NO_EXCEL_DIARIO.txt')) { return }

try {
  . (Join-Path $Base 'dj_comun.ps1')
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  # ---- qué día y dónde ----
  if ($Hasta) { $dia = [datetime]::ParseExact($Hasta, 'yyyy-MM-dd', $null) } else { $dia = (Get-Date).Date.AddDays(-1) }
  $hastaIso = $dia.ToString('yyyy-MM-dd'); $mes = $dia.ToString('yyyy-MM')
  $nombresMes = @('Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre')
  $carpeta = Join-Path (Join-Path ([Environment]::GetFolderPath('Desktop')) 'DDJJ') ($mes + ' ' + $nombresMes[$dia.Month - 1])
  New-Item -ItemType Directory -Force -Path $carpeta | Out-Null
  $tener = @(Get-ChildItem -Path $carpeta -Filter 'DDJJ desposte *.xlsx' -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.BaseName -match '(\d{2})-(\d{2})-(\d{4})$') { $Matches[3] + '-' + $Matches[2] + '-' + $Matches[1] } })

  # ---- datos de la web (con la cuenta de la PC) ----
  $auth = Invoke-RestMethod -Method Post -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$ApiKey" -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes((@{ email = "$SyncMail".Trim(); password = $SyncPass; returnSecureToken = $true } | ConvertTo-Json)))
  $Hdr = @{ Authorization = "Bearer $($auth.idToken)" }
  function Leer([string]$col, [string]$id, [string]$campo) {
    try { $r = Invoke-RestMethod -Method Get -Uri "$FsBase/$col/$id" -Headers $Hdr } catch { return $null }
    $v = $r.fields.$campo.stringValue
    if ($v) { return [string]$v } else { return $null }
  }
  $txt = Leer 'c3sis' ('dj-' + $mes) 'txt'
  if (-not $txt) { LogL ("No hay datos del sistema para $mes en la web (¿corrió dj_sync.ps1?)") | Out-Null; return }
  $sis = '"dj-' + $mes + '":' + (ConvertTo-Json $txt -Compress)
  $anual = Leer 'c3sis' 'dj-anual' 'txt'
  if ($anual) { $sis += ',"dj-anual":' + (ConvertTo-Json $anual -Compress) }
  $docs = @()
  foreach ($n in @('ddjj-equiv', ('ddjj-' + $mes), 'ddjj-muertos')) {
    $j = Leer 'c3docs' $n 'json'
    if ($j) { $null = $j | ConvertFrom-Json; $docs += ('"' + $n + '":' + $j) }   # ConvertFrom-Json: controla que sea JSON válido
  }

  # ---- copia de la página con los datos adentro ----
  $wc = New-Object Net.WebClient; $wc.Headers['Cache-Control'] = 'no-cache'
  $html = [Text.Encoding]::UTF8.GetString($wc.DownloadData($Web + 'ddjj.html?t=' + [DateTime]::UtcNow.Ticks))
  $tenerJs = if ($tener.Count) { '["' + ($tener -join '","') + '"]' } else { '[]' }
  $js = 'window.__mock={"user":{"email":' + (ConvertTo-Json ("$SyncMail".Trim()) -Compress) + ',"displayName":"Descarga automática","emailVerified":true},"rol":"ddjj",' +
        '"sis":{' + $sis + '},"docs":{' + ($docs -join ',') + '}};window.__auto={"hasta":"' + $hastaIso + '","tener":' + $tenerJs + '};'
  $js = $js.Replace('</', '<\/')
  $html = ([regex]'(?i)<head>').Replace($html, '<head><base href="' + $Web + '"><script>' + $js.Replace('$', '$$') + '</script>', 1)
  $pagina = Join-Path $TmpDir 'excel_diario.html'
  [IO.File]::WriteAllText($pagina, $html, (New-Object Text.UTF8Encoding $false))

  # ---- Edge (o Chrome) sin ventana: abre la página y devuelve lo que armó ----
  $nav = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
           "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
           "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $nav) { throw 'No encuentro Microsoft Edge ni Google Chrome en esta PC' }
  $perfil = Join-Path $TmpDir 'navegador_excel'
  $url = 'file:///' + ($pagina -replace '\\', '/')
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $nav
  $psi.Arguments = '--headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-extensions --disable-sync ' +
                   '--user-data-dir="' + $perfil + '" --virtual-time-budget=60000 --dump-dom "' + $url + '"'
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = [Text.Encoding]::UTF8
  $p = [Diagnostics.Process]::Start($psi)
  $leerOut = $p.StandardOutput.ReadToEndAsync(); $leerErr = $p.StandardError.ReadToEndAsync()   # leer mientras corre (si no, se traba con mucha salida)
  if (-not $p.WaitForExit(180000)) { try { $p.Kill() } catch {} ; throw 'El navegador tardó más de 3 minutos' }
  $dom = $leerOut.Result; $null = $leerErr.Result
  $m = [regex]::Match($dom, '<pre id="auto-out">(.*?)</pre>', 'Singleline')
  if (-not $m.Success) {
    $tit = [regex]::Match($dom, '<title>(.*?)</title>').Groups[1].Value
    throw ('La página no terminó de armar los Excel (título: "' + $tit + '", ' + $dom.Length + ' caracteres). Revisar internet.')
  }
  $res = [Net.WebUtility]::HtmlDecode($m.Groups[1].Value) | ConvertFrom-Json
  if ($res.error) { throw ('La página avisó: ' + $res.error) }

  # ---- guardar ----
  $guardados = @()
  foreach ($a in @($res.archivos)) {
    if (-not $a) { continue }
    $dest = Join-Path $carpeta $a.nombre
    $bytes = [Convert]::FromBase64String($a.b64)
    try { [IO.File]::WriteAllBytes($dest, $bytes) }
    catch {   # abierto en Excel: se guarda al lado
      $dest = Join-Path $carpeta ([IO.Path]::GetFileNameWithoutExtension($a.nombre) + ' (nuevo).xlsx')
      [IO.File]::WriteAllBytes($dest, $bytes)
    }
    $guardados += (Split-Path -Leaf $dest)
  }
  Remove-Item $pagina -Force -ErrorAction SilentlyContinue
  if ($guardados.Count) { LogL ('Guardados en ' + $carpeta + ': ' + ($guardados -join ', ')) } else { LogL ("Nada para guardar hasta $hastaIso (sin desposte en $mes)") }
}
catch {
  LogL ('ERROR: ' + $_.Exception.Message)
  exit 1
}
