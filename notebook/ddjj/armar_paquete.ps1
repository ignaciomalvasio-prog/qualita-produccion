# ============================================================
#  Arma el paquete para pasar el Centro de desposte a otra PC (la de Sabi). Se corre en la notebook de Igna (armar_paquete.bat).
#  Deja C:\InformeQualita\Paquete Centro de desposte.zip con los programas, la clave del link de faena y config_local.ps1
#  con las claves de esta notebook (conexión a la base y cuenta de la web). Pasarlo por pendrive: NO por mail ni WhatsApp.
# ============================================================
$ErrorActionPreference = 'Stop'
$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
$Raiz = Split-Path -Parent $Base
# claves: se copian tal cual los renglones de los archivos de configuración de esta notebook
$lin = @()
foreach ($f in @((Join-Path $Base 'config_local.ps1'), (Join-Path $Raiz 'echeqs\config_local.ps1'), (Join-Path $Raiz 'ciclo3\config_local.ps1'))) {
  if (Test-Path $f) { $m = Select-String -Path $f -Pattern '^\s*\$Conn\s*=' | Select-Object -First 1; if ($m) { $lin += $m.Line.Trim(); break } }
}
foreach ($v in @('SyncMail', 'SyncPass')) {
  foreach ($f in @((Join-Path $Base 'config_local.ps1'), (Join-Path $Raiz 'rendering_config.ps1'))) {
    if (Test-Path $f) { $m = Select-String -Path $f -Pattern ('^\s*\$' + $v + '\s*=') | Select-Object -First 1; if ($m) { $lin += $m.Line.Trim(); break } }
  }
}
if ($lin.Count -lt 3) { throw 'No encuentro las claves de esta notebook (conexión a la base o cuenta de la web)' }
$tmp = Join-Path $env:TEMP ('paq_ddjj_' + [guid]::NewGuid().ToString('N').Substring(0, 6)); $dst = Join-Path $tmp 'ddjj'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
$archivos = Get-Content (Join-Path $Base 'archivos.txt') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
foreach ($n in $archivos + @('faena_link_clave.txt')) { if (Test-Path (Join-Path $Base $n)) { Copy-Item (Join-Path $Base $n) $dst } }
$cfg = "# Claves de esta PC (no compartir, no subir a GitHub). Las usa dj_comun.ps1.`r`n" + ($lin -join "`r`n") + "`r`n"
[IO.File]::WriteAllText((Join-Path $dst 'config_local.ps1'), $cfg, (New-Object Text.UTF8Encoding $true))
Move-Item (Join-Path $dst 'INSTALAR en esta PC.bat') $tmp
$zip = Join-Path $Raiz 'Paquete Centro de desposte.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath $zip
Remove-Item $tmp -Recurse -Force
"Listo: $zip"
