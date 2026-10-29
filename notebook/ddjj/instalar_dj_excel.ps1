# Instala la tarea "DDJJ Excel diario": todos los días a las 7:20 guarda en Escritorio\DDJJ los Excel de la DDJJ de desposte
# (de cada día hasta ayer que falte, y el último de nuevo) y del Rendimiento del mes (dj_excel_diario.ps1). Si la PC estaba apagada, corre apenas se prende.
# La instala sola dj_pedido.ps1 la primera vez (si no existe y no está NO_EXCEL_DIARIO.txt). Después de instalarla la corre una vez.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = '"' + (Join-Path $dir 'oculto.vbs') + '" '
$a   = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ($vbs + '"' + (Join-Path $dir 'dj_excel_diario.ps1') + '"')
$s   = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
$t   = New-ScheduledTaskTrigger -Daily -At '07:20'
Register-ScheduledTask -TaskName 'DDJJ Excel diario' -Action $a -Trigger $t -Settings $s -Description 'Guarda en el Escritorio, carpeta DDJJ, los Excel de la DDJJ de desposte y del Rendimiento (los mismos de https://qualita-produccion.web.app/ddjj). Log: C:\InformeQualita\ddjj\dj_excel_log.txt' -Force | Out-Null
Start-ScheduledTask -TaskName 'DDJJ Excel diario'
'Tarea instalada; próxima vez: ' + ((Get-ScheduledTask -TaskName 'DDJJ Excel diario' | Get-ScheduledTaskInfo).NextRunTime)
