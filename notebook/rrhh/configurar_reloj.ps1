# Configura el envío del reloj CC-Cloud al Centro RRHH: guarda la clave de la casilla, prueba que entre,
# instala la tarea "RRHH reloj a la web" (6:20, 9:20, 13:20 y 18:20) y sube lo que haya. Lo abre "Configurar reloj.bat".
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Join-Path $dir 'config_local.ps1'
Write-Host ''
Write-Host 'Reloj CC-Cloud -> Centro RRHH' -ForegroundColor Cyan
Write-Host 'Pegá la contraseña de aplicación de rrhhqualita@gmail.com (las 16 letras que te dio Google) y apretá Enter.'
Write-Host '(Si ya está guardada y no la querés cambiar, apretá Enter sin escribir nada.)'
$c = Read-Host 'Contraseña'
$c = ($c -replace '\s', '')
if ($c) {
  if ($c.Length -ne 16) { Write-Host "Ojo: tiene $($c.Length) letras y las de Google tienen 16." -ForegroundColor Yellow }
  $txt = "# Casilla donde CC-Cloud manda los reportes del reloj (solo en esta PC; nunca al repositorio)`r`n`$RelojMail = 'rrhhqualita@gmail.com'`r`n`$RelojClave = '" + $c.Replace("'", "''") + "'`r`n"
  [IO.File]::WriteAllText($cfg, $txt, (New-Object Text.UTF8Encoding $true))
  Write-Host 'Guardada.'
} elseif (-not (Test-Path $cfg)) { Write-Host 'No hay ninguna guardada todavía. Volvé a abrir y pegala.' -ForegroundColor Red; Read-Host 'Enter para cerrar'; exit 1 }
Write-Host ''
Write-Host 'Probando la casilla...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'rh_reloj.ps1') -Probar
if ($LASTEXITCODE -ne 0) { Write-Host 'No pudo entrar. Revisá la contraseña y volvé a abrir este archivo.' -ForegroundColor Red; Read-Host 'Enter para cerrar'; exit 1 }
$vbs = '"' + (Join-Path (Split-Path -Parent $dir) 'ciclo3\c3_oculto.vbs') + '" '
$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ($vbs + '"' + (Join-Path $dir 'rh_reloj.ps1') + '"')
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
$t = @('06:20', '09:20', '13:20', '18:20' | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ })
Register-ScheduledTask -TaskName 'RRHH reloj a la web' -Action $a -Trigger $t -Settings $s -Description 'Lee en rrhhqualita@gmail.com los Excel que manda CC-Cloud (reloj) y los sube al Centro RRHH (qualita-produccion.web.app/rrhh, pestaña Reloj). Solo lee la casilla. Log: C:\InformeQualita\rrhh\rh_reloj_log.txt' -Force | Out-Null
Write-Host 'Tarea "RRHH reloj a la web" instalada (6:20, 9:20, 13:20 y 18:20).'
Write-Host 'Subiendo lo que haya...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'rh_reloj.ps1')
Get-Content (Join-Path $dir 'rh_reloj_log.txt') -Tail 1
Write-Host ''
Read-Host 'Listo. Enter para cerrar'
