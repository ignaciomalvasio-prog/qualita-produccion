# Instala la tarea "RRHH a la web": sube a https://qualita-produccion.web.app/rrhh la nómina del sistema de sueldos
# (rh_sync.ps1) todos los días a las 7, 13 y 19 h. Si la notebook estaba apagada, corre apenas se prende. Sin ventana.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = '"' + (Join-Path (Split-Path -Parent $dir) 'ciclo3\c3_oculto.vbs') + '" '
$a   = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ($vbs + '"' + (Join-Path $dir 'rh_sync.ps1') + '"')
$s   = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
$t   = @((New-ScheduledTaskTrigger -Daily -At 07:05), (New-ScheduledTaskTrigger -Daily -At 13:05), (New-ScheduledTaskTrigger -Daily -At 19:05))
Register-ScheduledTask -TaskName 'RRHH a la web' -Action $a -Trigger $t -Settings $s -Description 'A las 7, 13 y 19: sube al Centro RRHH (qualita-produccion.web.app/rrhh) la nómina del sistema de sueldos. Solo lee la base. Log: C:\InformeQualita\rrhh\rh_sync_log.txt' -Force | Out-Null
Write-Host 'Tarea "RRHH a la web" instalada (7, 13 y 19 h).'
Write-Host 'Subiendo por primera vez...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'rh_sync.ps1') -Forzar
Get-Content (Join-Path $dir 'rh_sync_log.txt') -Tail 2
schtasks /Query /TN "RRHH a la web" /FO LIST | Select-String 'Próxima|Next|Estado|Status'
