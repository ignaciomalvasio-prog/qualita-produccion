# Instala la tarea "DDJJ pedidos de actualizacion": cada 5 minutos, de 6:30 a 21:30, revisa si alguien pidió datos nuevos desde el Centro de desposte.
# Después lee el sistema una vez (para revisar) y sube los datos.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = '"' + (Join-Path $dir 'oculto.vbs') + '" '
$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ($vbs + '"' + (Join-Path $dir 'dj_pedido.ps1') + '"')
$t = New-ScheduledTaskTrigger -Daily -At 06:30
$t.Repetition = (New-ScheduledTaskTrigger -Once -At 06:30 -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Hours 15)).Repetition
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'DDJJ pedidos de actualizacion' -Action $a -Trigger $t -Settings $s -Description 'Cada 5 minutos revisa si alguien tocó "Traer datos nuevos del sistema" en https://qualita-produccion.web.app/ddjj y, si hay pedido, corre dj_sync.ps1. Log: C:\InformeQualita\ddjj\dj_pedido_log.txt' -Force | Out-Null
'Tarea instalada: DDJJ pedidos de actualizacion'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'dj_sync.ps1') -SinSubir
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'dj_sync.ps1') -Forzar
'Datos subidos.'
