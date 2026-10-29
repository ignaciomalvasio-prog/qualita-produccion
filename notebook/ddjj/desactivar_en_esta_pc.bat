@echo off
rem Desactiva en ESTA PC las tareas del Centro de desposte (cuando ya quedaron funcionando en otra PC).
schtasks /Change /TN "DDJJ desposte a la web" /DISABLE
schtasks /Change /TN "DDJJ pedidos de actualizacion" /DISABLE
echo.
echo  Tareas del Centro de desposte desactivadas en esta PC.
pause
