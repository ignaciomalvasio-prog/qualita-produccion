# Atiende lo que se pide desde el Centro de desposte (lo corre la tarea "DDJJ pedidos de actualizacion" cada 5 minutos, de 6:30 a 21:30):
#  - "Traer datos nuevos del sistema" (c3docs/ddjj-pedido): corre dj_sync.ps1 y marca el pedido como hecho.
#  - Trazabilidad (c3docs/ddjj-traza): durante los 5 minutos revisa cada 6 segundos si alguien consultó una tropa o un correlativo,
#    corre la consulta (dj_traza.ps1, solo lectura) y devuelve el resultado.
# Log: dj_pedido_log.txt (solo cuando hay pedido).
$ErrorActionPreference = 'Stop'
$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
$Raiz = Split-Path -Parent $Base
$Log  = Join-Path $Base 'dj_pedido_log.txt'
$ApiKey = 'AIzaSyD9DSR82lLUigI8WeCjlR4nIc5I7xyjmTY'
$FsBase = 'https://firestore.googleapis.com/v1/projects/qualita-produccion/databases/(default)/documents'
$Inicio = Get-Date
function LogL([string]$t) { try { [IO.File]::AppendAllText($Log, (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $t + "`r`n", [Text.Encoding]::UTF8) } catch {} }
function LeerDoc([string]$n) {
  try { $r = Invoke-RestMethod -Method Get -Uri "$FsBase/c3docs/$n" -Headers $script:Hdr } catch { return $null }
  $d = '{}'; if ($r.fields.json.stringValue) { $d = $r.fields.json.stringValue }
  $v = 0; if ($r.fields.ver.integerValue) { $v = [int]$r.fields.ver.integerValue }
  return @{ d = ($d | ConvertFrom-Json); ver = $v }
}
function GuardarDoc([string]$n, $obj, [int]$ver) {
  $json = $obj | ConvertTo-Json -Compress -Depth 5
  $body = @{ fields = @{ json = @{ stringValue = $json }; ver = @{ integerValue = [string]($ver + 1) }; por = @{ stringValue = 'Notebook' }; ts = @{ stringValue = (Get-Date).ToUniversalTime().ToString('o') } } } | ConvertTo-Json -Depth 5 -Compress
  Invoke-RestMethod -Method Patch -Uri "$FsBase/c3docs/$n" -Headers $script:Hdr -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
}
function Marcar($p, [hashtable]$extra) {
  $p | Add-Member -NotePropertyName hecho -NotePropertyValue $p.pedido -Force
  $p | Add-Member -NotePropertyName hechoTs -NotePropertyValue ((Get-Date).ToUniversalTime().ToString('o')) -Force
  foreach ($k in $extra.Keys) { $p | Add-Member -NotePropertyName $k -NotePropertyValue $extra[$k] -Force }
  return $p
}
try {
  . (Join-Path $Base 'dj_comun.ps1')
  if ((Test-Path (Join-Path $Base 'actualizar.ps1')) -and -not (Test-Path (Join-Path $Base 'NO_ACTUALIZAR.txt'))) {   # baja de GitHub la última versión de estos programas (una vez por hora)
    try { & (Join-Path $Base 'actualizar.ps1') } catch { LogL ('No se pudo actualizar: ' + $_.Exception.Message) }
  }
  $auth = Invoke-RestMethod -Method Post -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$ApiKey" -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes((@{ email = $SyncMail.Trim(); password = $SyncPass; returnSecureToken = $true } | ConvertTo-Json)))
  $script:Hdr = @{ Authorization = "Bearer $($auth.idToken)" }

  # 1) pedido de datos nuevos
  $x = LeerDoc 'ddjj-pedido'
  if ($x -and $x.d.pedido -and -not ($x.d.hecho -and $x.d.hecho -ge $x.d.pedido)) {
    LogL ("Pedido de " + $x.d.por + " (" + $x.d.pedido + "): actualizando")
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Base 'dj_sync.ps1') | Out-Null
    $x = LeerDoc 'ddjj-pedido'
    GuardarDoc 'ddjj-pedido' (Marcar $x.d @{}) $x.ver
    LogL 'Listo'
  }

  # 2) consultas de trazabilidad, hasta que falten unos segundos para la próxima vuelta de la tarea
  $trazaCargada = $false
  while (((Get-Date) - $Inicio).TotalSeconds -lt 280) {
    $t = LeerDoc 'ddjj-traza'
    if ($t -and $t.d.pedido -and -not ($t.d.hecho -and $t.d.hecho -ge $t.d.pedido)) {
      LogL ("Trazabilidad " + $t.d.tipo + " " + $t.d.valor + " (" + $t.d.por + ")")
      $extra = @{}
      try {
        if (-not $trazaCargada) { . (Join-Path $Base 'dj_traza.ps1'); $trazaCargada = $true }
        $extra.res = ((Get-Traza ([string]$t.d.tipo) ([string]$t.d.valor)) -join "`n")
      } catch { $extra.error = 'No se pudo consultar el sistema: ' + $_.Exception.Message; LogL ('ERROR traza: ' + $_.Exception.Message) }
      $t2 = LeerDoc 'ddjj-traza'
      if ($t2.d.pedido -eq $t.d.pedido) { GuardarDoc 'ddjj-traza' (Marcar $t2.d $extra) $t2.ver }   # si mientras tanto pidieron otra, se atiende en la próxima vuelta
      continue
    }
    Start-Sleep -Seconds 6
  }
} catch { LogL ('ERROR: ' + $_.Exception.Message) }
