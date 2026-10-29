@echo off
rem Instala el Centro de desposte en esta PC: copia los programas a C:\InformeQualita\ddjj, revisa Oracle y la conexion,
rem instala las dos tareas (subir el desposte a la web 7, 11, 15 y 19 h; atender "Traer datos nuevos" y Trazabilidad cada 5 minutos) y sube los datos.
echo.
echo  Instalando el Centro de desposte en esta PC...
echo.
if not exist "%~dp0ddjj\dj_sync.ps1" ( echo  No encuentro la carpeta ddjj al lado de este archivo. Descomprimi el paquete entero. & pause & exit /b 1 )
if not exist "C:\InformeQualita\ddjj" mkdir "C:\InformeQualita\ddjj"
xcopy /Y /Q "%~dp0ddjj\*" "C:\InformeQualita\ddjj\" >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\InformeQualita\ddjj\dj_sync.ps1" -Revisar
if errorlevel 1 ( echo. & pause & exit /b 1 )
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\InformeQualita\ddjj\instalar_dj_sync.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\InformeQualita\ddjj\instalar_dj_pedido.ps1"
echo.
echo  Listo. Avisale a Igna para que desactive las tareas en su notebook.
pause
