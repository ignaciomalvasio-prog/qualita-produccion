# Instala la tarea "DDJJ desposte a la web": sube el desposte del sistema a https://qualita-produccion.web.app/ddjj
# todos los días a las 7, 11, 15 y 19 h (relee el mes actual y el anterior; solo sube lo que cambió). Si la notebook estaba apagada, corre apenas se prende.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = '"' + (Join-Path $dir 'oculto.vbs') + '" '
$a   = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ($vbs + '"' + (Join-Path $dir 'dj_sync.ps1') + '"')
$s   = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
$t   = @('07:00','11:00','15:00','19:00') | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
Register-ScheduledTask -TaskName 'DDJJ desposte a la web' -Action $a -Trigger $t -Settings $s -Description 'Sube a https://qualita-produccion.web.app/ddjj el desposte de cerdo del sistema (mes actual y anterior). Log: C:\InformeQualita\ddjj\dj_sync_log.txt' -Force | Out-Null
'Tarea instalada: ' + ((Get-ScheduledTask -TaskName 'DDJJ desposte a la web' | Get-ScheduledTaskInfo).NextRunTime)
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'dj_sync.ps1')
