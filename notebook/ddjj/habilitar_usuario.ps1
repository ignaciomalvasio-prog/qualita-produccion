# Habilita a una persona en el Centro de desposte (https://qualita-produccion.web.app/ddjj): crea c3usuarios/{mail} con rol "ddjj".
# Es lo mismo que agregarla en Centro de control > Usuarios con "Solo Centro de desposte". No toca el sistema de gestion.
param([Parameter(Mandatory = $true)][string]$Mail, [string]$Nombre = '', [string]$Rol = 'ddjj')
$ErrorActionPreference = 'Stop'
$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $Base 'dj_comun.ps1')
$ApiKey = 'AIzaSyD9DSR82lLUigI8WeCjlR4nIc5I7xyjmTY'
try {
  $auth = Invoke-RestMethod -Method Post -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$ApiKey" -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes((@{ email = $SyncMail.Trim(); password = $SyncPass; returnSecureToken = $true } | ConvertTo-Json)))
  $body = @{ fields = @{ nombre = @{ stringValue = $Nombre }; rol = @{ stringValue = $Rol }; por = @{ stringValue = 'Igna' }; ts = @{ stringValue = (Get-Date).ToUniversalTime().ToString('o') } } } | ConvertTo-Json -Depth 5 -Compress
  Invoke-RestMethod -Method Patch -Uri ("https://firestore.googleapis.com/v1/projects/qualita-produccion/databases/(default)/documents/c3usuarios/" + $Mail.ToLower()) -Headers @{ Authorization = "Bearer $($auth.idToken)" } -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
  "OK: $Mail habilitado/a (permiso $Rol)"
} catch { "ERROR: " + $_.Exception.Message + ' ' + $_.ErrorDetails.Message }
