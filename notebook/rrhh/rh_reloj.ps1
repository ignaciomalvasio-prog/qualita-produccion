# ============================================================
#  Centro RRHH · RELOJ A LA WEB  (https://qualita-produccion.web.app/rrhh, pestaña Reloj)
#  CC-Cloud (reloj Ratronic) manda todos los días a las 6:00 a rrhhqualita@gmail.com, en Excel y del día anterior:
#    "Reporte Cronológico de Fichadas" (agrupado por sector) y "Reporte de Ausencias y Retrasos".
#  Este programa lee esa casilla por IMAP (solo lee: no borra ni marca nada) y sube cada Excel tal cual a Firestore:
#    rhdocs/reloj-x-{uidvalidity-uid-n} = { archivo, asunto, recibido, b64 }
#    rhdocs/reloj-entrada               = { lista: [{ id, archivo, recibido, kb }] }   (los últimos 200)
#  La página del Centro RRHH, al abrirse, lee esos Excel y arma los datos por mes (rhdocs/reloj-AAAA-MM).
#  La clave de la casilla (contraseña de aplicación de Google) va solo en config_local.ps1 de esta carpeta:
#    $RelojMail = 'rrhhqualita@gmail.com'; $RelojClave = '...'      (lo arma "Configurar reloj.bat")
#  Uso:  rh_reloj.ps1 [-Dias 10] [-Probar]    (-Probar: entra a la casilla y cuenta los Excel, no sube nada)
#  Lo corre la tarea "RRHH reloj a la web" (6:20, 9:20, 13:20 y 18:20). Log: rh_reloj_log.txt
# ============================================================
param([int]$Dias = 10, [switch]$Probar)
$ErrorActionPreference = 'Stop'
$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
$Raiz = Split-Path -Parent $Base
$Proyecto = 'qualita-produccion'
$ApiKey   = 'AIzaSyD9DSR82lLUigI8WeCjlR4nIc5I7xyjmTY'   # clave pública de la app web (no es secreta)
$FsBase   = "https://firestore.googleapis.com/v1/projects/$Proyecto/databases/(default)/documents"
$Log      = Join-Path $Base 'rh_reloj_log.txt'
$Estado   = Join-Path $Base 'rh_reloj_estado.json'
$Cfg      = Join-Path $Base 'config_local.ps1'
$L1       = [Text.Encoding]::GetEncoding(28591)   # bytes 1 a 1 (el mail es ASCII; los adjuntos van en base64)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function LogL([string]$t) {
  $l = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $t
  try { [IO.File]::AppendAllText($Log, $l + "`r`n", [Text.Encoding]::UTF8) } catch {}
  Write-Host $l
}

# ---------- IMAP (Gmail, puerto 993) ----------
$script:ssl = $null; $script:buf = New-Object byte[] 65536; $script:bi = 0; $script:bn = 0; $script:tag = 0
function Llenar { $script:bn = $script:ssl.Read($script:buf, 0, $script:buf.Length); $script:bi = 0; if ($script:bn -le 0) { throw 'Gmail cortó la conexión' } }
function Leer-Linea {
  $ms = New-Object IO.MemoryStream
  while ($true) {
    if ($script:bi -ge $script:bn) { Llenar }
    $i = [Array]::IndexOf($script:buf, [byte]10, $script:bi, $script:bn - $script:bi)
    if ($i -ge 0) { $ms.Write($script:buf, $script:bi, $i - $script:bi + 1); $script:bi = $i + 1; break }
    $ms.Write($script:buf, $script:bi, $script:bn - $script:bi); $script:bi = $script:bn
  }
  return $L1.GetString($ms.ToArray()).TrimEnd("`r", "`n")
}
function Leer-Bytes([int]$n) {
  $ms = New-Object IO.MemoryStream
  while ($n -gt 0) {
    if ($script:bi -ge $script:bn) { Llenar }
    $k = [Math]::Min($n, $script:bn - $script:bi)
    $ms.Write($script:buf, $script:bi, $k); $script:bi += $k; $n -= $k
  }
  return $L1.GetString($ms.ToArray())
}
# manda un comando y devuelve los renglones de la respuesta; un literal {n} viene como un elemento aparte después de su renglón
function Imap([string]$cmd, [string]$nombre) {
  $script:tag++; $t = "A$($script:tag)"
  $b = $L1.GetBytes("$t $cmd`r`n"); $script:ssl.Write($b, 0, $b.Length); $script:ssl.Flush()
  $res = New-Object System.Collections.ArrayList
  while ($true) {
    $l = Leer-Linea
    if ($l -match '\{(\d+)\}$') { [void]$res.Add($l); [void]$res.Add((Leer-Bytes ([int]$Matches[1]))); continue }
    if ($l.StartsWith("$t ")) {
      if ($l -notmatch "^$t OK") { throw ('Gmail no aceptó ' + $(if ($nombre) { $nombre } else { $cmd.Split(' ')[0] }) + ': ' + $l.Substring($t.Length + 1)) }
      break
    }
    [void]$res.Add($l)
  }
  return , $res
}
# adjuntos Excel de un mail crudo (MIME): devuelve { id, archivo, asunto, b64 }
function Adjuntos([string]$raw, [string]$uidv, [string]$uid) {
  $out = @()
  $fin = $raw.IndexOf("`r`n`r`n"); if ($fin -lt 0) { return $out }
  $cab = $raw.Substring(0, $fin) -replace '\r?\n[ \t]+', ' '
  $asunto = ''; if ($cab -match '(?im)^Subject:\s*(.+)$') { $asunto = $Matches[1].Trim() }
  $bs = @([regex]::Matches($raw, '(?i)boundary\s*=\s*"?([^";\r\n]+)"?') | ForEach-Object { $_.Groups[1].Value.Trim() } | Select-Object -Unique)
  if (-not $bs.Count) { return $out }
  $pat = '\r?\n--(?:' + (($bs | ForEach-Object { [regex]::Escape($_) }) -join '|') + ')(?:--)?[ \t]*(?=\r?\n|$)'
  $k = 0
  foreach ($p in [regex]::Split($raw, $pat)) {
    $i = $p.IndexOf("`r`n`r`n"); if ($i -lt 0) { continue }
    $h = $p.Substring(0, $i) -replace '\r?\n[ \t]+', ' '
    if ($h -notmatch '(?i)Content-Transfer-Encoding:\s*base64') { continue }
    $nom = ''
    if ($h -match '(?i)filename\*?\s*=\s*"?([^";\r\n]+)') { $nom = $Matches[1].Trim() } elseif ($h -match '(?i)\bname\*?\s*=\s*"?([^";\r\n]+)') { $nom = $Matches[1].Trim() }
    $nom = $nom -replace "^[A-Za-z0-9-]+''", ''
    if ($nom -match '^=\?') { $nom = 'adjunto.xlsx' }
    if (-not ($nom -match '(?i)\.xlsx?$' -or $h -match '(?i)spreadsheetml|ms-excel')) { continue }
    $b64 = $p.Substring($i + 4) -replace '[^A-Za-z0-9+/=]', ''
    if ($b64.Length -lt 200) { continue }
    $out += [pscustomobject]@{ id = "$uidv-$uid-$k"; archivo = $nom; asunto = $asunto; b64 = $b64 }
    $k++
  }
  return $out
}

# ---------- Firestore (mismo formato que la web: { json, ver, por, ts }) ----------
function Ingresar {
  . (Join-Path $Raiz 'rendering_config.ps1')   # $SyncMail y $SyncPass (cuenta que tiene que estar en rhusuarios)
  $auth = Invoke-RestMethod -Method Post -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$ApiKey" -ContentType 'application/json; charset=utf-8' `
    -Body ([Text.Encoding]::UTF8.GetBytes((@{ email = $SyncMail.Trim(); password = $SyncPass; returnSecureToken = $true } | ConvertTo-Json)))
  return @{ Authorization = "Bearer $($auth.idToken)" }
}
function Subir([string]$id, $obj, $Hdr) {
  $json = $obj | ConvertTo-Json -Compress -Depth 6
  $body = @{ fields = @{ json = @{ stringValue = $json }; ver = @{ integerValue = [string][int64]((Get-Date) - [datetime]'2026-01-01').TotalMinutes }; por = @{ stringValue = 'Reloj CC-Cloud (mail)' }; ts = @{ stringValue = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') } } } | ConvertTo-Json -Depth 6 -Compress
  Invoke-RestMethod -Method Patch -Uri "$FsBase/rhdocs/$id" -Headers $Hdr -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
}
function Leer([string]$id, $Hdr) {
  try { $d = Invoke-RestMethod -Method Get -Uri "$FsBase/rhdocs/$id" -Headers $Hdr }
  catch { if (("$($_.Exception.Message) $($_.ErrorDetails.Message)") -match '404|NOT_FOUND') { return $null }; throw }
  $s = $d.fields.json.stringValue; if (-not $s) { return $null }
  return ($s | ConvertFrom-Json)
}

$Paso = ''
try {
  if (-not (Test-Path $Cfg)) { throw "Falta $Cfg con la clave de la casilla (correr 'Configurar reloj.bat')" }
  . $Cfg   # $RelojMail y $RelojClave
  if (-not $RelojMail -or -not $RelojClave) { throw "En $Cfg faltan `$RelojMail o `$RelojClave" }
  $prevV = ''; $prevU = @()
  if (Test-Path $Estado) { $j = Get-Content $Estado -Raw | ConvertFrom-Json; $prevV = [string]$j.uidv; $prevU = @($j.uids | ForEach-Object { [string]$_ }) }

  $Paso = 'conectar con Gmail'
  $tcp = New-Object Net.Sockets.TcpClient('imap.gmail.com', 993)
  $script:ssl = New-Object Net.Security.SslStream($tcp.GetStream(), $false)
  $script:ssl.AuthenticateAsClient('imap.gmail.com', $null, [Security.Authentication.SslProtocols]::Tls12, $true)
  $script:ssl.ReadTimeout = 120000
  [void](Leer-Linea)
  $Paso = 'entrar a la casilla'
  [void](Imap ('LOGIN "' + $RelojMail.Trim() + '" "' + ($RelojClave -replace '\s', '') + '"') 'la clave (revisá la contraseña de aplicación en config_local.ps1)')
  $Paso = 'abrir la bandeja de entrada'
  $r = Imap 'EXAMINE INBOX'   # solo lectura
  $uidv = ''; foreach ($l in $r) { if ($l -match 'UIDVALIDITY (\d+)') { $uidv = $Matches[1] } }
  if ($uidv -ne $prevV) { $prevU = @() }
  $desde = (Get-Date).AddDays(-$Dias).ToString('dd-MMM-yyyy', [Globalization.CultureInfo]::InvariantCulture)
  $Paso = 'buscar los mails'
  $r = Imap "UID SEARCH SINCE $desde"
  $uids = @(); foreach ($l in $r) { if ($l -match '^\* SEARCH(.*)$') { $uids += @($Matches[1].Trim() -split '\s+' | Where-Object { $_ }) } }
  $ya = @{}; foreach ($u in $prevU) { $ya[$u] = 1 }
  $nuevos = @($uids | Where-Object { -not $ya[[string]$_] })
  $adj = @(); $leidos = @()
  foreach ($u in $nuevos) {
    $Paso = "leer el mail $u"
    $r = Imap "UID FETCH $u (BODY.PEEK[])"
    $raw = $null
    for ($i = 0; $i -lt $r.Count - 1; $i++) { if ($r[$i] -match 'BODY\[\] \{\d+\}$') { $raw = $r[$i + 1]; break } }
    if ($raw) { $adj += @(Adjuntos $raw $uidv ([string]$u)) }
    $leidos += [string]$u
  }
  try { [void](Imap 'LOGOUT') } catch {}
  try { $tcp.Close() } catch {}

  $grandes = @($adj | Where-Object { $_.b64.Length -gt 900000 })
  foreach ($g in $grandes) { LogL "AVISO: $($g.archivo) es muy grande para subir ($([int]($g.b64.Length * 3 / 4 / 1024)) KB): pedí a CC-Cloud un período más corto" }
  $adj = @($adj | Where-Object { $_.b64.Length -le 900000 })
  if ($Probar) { LogL ("PRUEBA OK: entré a $RelojMail · $($uids.Count) mails de los últimos $Dias días, $($nuevos.Count) sin leer por este programa, $($adj.Count) Excel: " + (($adj | ForEach-Object { $_.archivo }) -join ', ')); exit 0 }

  if ($adj.Count) {
    $Paso = 'ingresar con la cuenta de la app'
    $Hdr = Ingresar
    $ahora = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')
    $Paso = 'leer la lista de Excel recibidos'
    $e = Leer 'reloj-entrada' $Hdr
    $lista = @(); if ($e -and $e.lista) { $lista = @($e.lista) }
    $n = 0
    foreach ($a in $adj) {
      $Paso = "subir $($a.archivo)"
      if (@($lista | Where-Object { $_.id -eq $a.id }).Count) { continue }
      Subir "reloj-x-$($a.id)" @{ archivo = $a.archivo; asunto = $a.asunto; recibido = $ahora; b64 = $a.b64 } $Hdr
      $lista += [pscustomobject]@{ id = $a.id; archivo = $a.archivo; recibido = $ahora + '.' + $n; kb = [int]($a.b64.Length * 3 / 4 / 1024) }
      $n++
    }
    $Paso = 'anotar los Excel recibidos'
    $lista = @($lista | Select-Object -Last 200)
    Subir 'reloj-entrada' @{ lista = $lista } $Hdr
  }
  $todo = @($prevU + $leidos | Select-Object -Last 800)
  (@{ uidv = $uidv; uids = $todo } | ConvertTo-Json -Depth 3) | Set-Content -Path $Estado -Encoding UTF8
  LogL ("OK: $($nuevos.Count) mails nuevos, $($adj.Count) Excel subidos" + $(if ($adj.Count) { ': ' + (($adj | ForEach-Object { $_.archivo }) -join ', ') } else { '' }))
} catch {
  $det = ''
  try { if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $det = ' | ' + ($_.ErrorDetails.Message -replace '\s+', ' ') } } catch {}
  LogL ("ERROR" + $(if ($Paso) { " al $Paso" } else { '' }) + ": " + $_.Exception.Message + $det)
  exit 1
}
