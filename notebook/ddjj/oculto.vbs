' Corre un .ps1 sin mostrar ninguna ventana (lo usan las tareas del Centro de desposte)
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & WScript.Arguments(0) & """", 0, True
