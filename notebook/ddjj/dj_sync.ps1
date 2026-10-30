# ============================================================
#  DDJJ de producción de desposte · ENVÍO A LA WEB
#  Lee del sistema (solo consultas) el desposte de cerdo (tipo de ciclo 2) y lo sube a
#  https://qualita-produccion.web.app/ddjj  (Firestore c3sis/dj-AAAA-MM), donde S. Saavedra
#  revisa, corrige e imprime la declaración jurada de cada día.
#    TR|fecha desposte|tropa|cabezas de la tropa|fecha de faena|medias|kg de las medias   (una tropa faenada en dos días sale en dos renglones)
#    FT|tropa|fecha de faena|cabezas faenadas ese día (romaneo; una tropa faenada en dos días tiene dos renglones = FAENA PARCIAL)
#    IN|fecha|artículo|nombre|unidades|kg        (lo que entra al desposte que no son medias: reprocesos)
#    RE|fecha|artículo|nombre|contrato|unidades|piezas|kg   (lo que sale del desposte)
#    ME|fecha|tipo de ciclo (3 menudencias, 6 rendering)|artículo|nombre|unidades|kg   (resumen mensual de menudencias y rendering para SENASA)
#    CO|contrato|nombre|país
#    EN|fecha|artículo|tropa|unidades   (medias que salen enteras, art. 22: de qué tropa son)
#    C3|fecha|artículo|nombre|unidades|kg  /  C3I|...  (Ciclo III, embutidos: lo que sale / lo que entra; tipo de ciclo 4)
#  Relee completos el mes actual y el anterior; solo sube lo que cambió.
#  Si existe faena_link_clave.txt, publica también config/fp-<clave> para el link de solo lectura /faena?k=<clave> (sin ingresar).
#  Además sube c3sis/dj-anual: faena por mes (propia / usuarios), muertos y tropas por productor y granja del año actual y el anterior.
#  Lo corre la tarea de Windows "DDJJ desposte a la web" (7, 11, 15 y 19 h).
#  Uso:  dj_sync.ps1  |  dj_sync.ps1 -Forzar  |  dj_sync.ps1 -SinSubir (solo lee y guarda dj_ultimo.txt)
#  Conexión a la base y cuenta de la web: dj_comun.ps1 (claves en config_local.ps1 de esta carpeta)
#  Armado por Claude. Log: dj_sync_log.txt
# ============================================================
param([switch]$Forzar, [switch]$SinSubir, [switch]$Revisar)
$ErrorActionPreference = 'Stop'
$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $Base 'dj_comun.ps1')   # conexión a la base, cuenta de la web (config_local.ps1) e Invoke-Sql
$ApiKey = 'AIzaSyD9DSR82lLUigI8WeCjlR4nIc5I7xyjmTY'
if ($Revisar) {   # lo usa "INSTALAR en esta PC.bat": revisa Oracle, la conexión al sistema y la cuenta de la web, sin subir nada
  if (-not $SqlPlus) { Write-Host '  FALTA el cliente de Oracle (sqlplus.exe). Pedile a sistemas que lo instale y volvé a correr la instalación.' -ForegroundColor Red; exit 1 }
  Write-Host ('  Oracle: ' + $SqlPlus)
  try { $r = Invoke-Sql "SELECT 'OK|'||TO_CHAR(SYSDATE,'YYYY-MM-DD') FROM dual;" } catch { $r = @($_.Exception.Message) }
  if (-not ($r | Where-Object { $_ -like 'OK|*' })) { Write-Host ('  No se pudo conectar al sistema (SERVER5): ' + ($r -join ' ')) -ForegroundColor Red; exit 1 }
  Write-Host '  Conexión al sistema: OK' -ForegroundColor Green
  try {
    Invoke-RestMethod -Method Post -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$ApiKey" -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes((@{ email = "$SyncMail".Trim(); password = $SyncPass; returnSecureToken = $true } | ConvertTo-Json))) | Out-Null
    Write-Host '  Cuenta de la web: OK' -ForegroundColor Green
  } catch { Write-Host ('  No se pudo entrar a la web (revisar internet o config_local.ps1): ' + $_.Exception.Message) -ForegroundColor Red; exit 1 }
  exit 0
}
$Proyecto = 'qualita-produccion'
$ApiKey   = 'AIzaSyD9DSR82lLUigI8WeCjlR4nIc5I7xyjmTY'   # clave pública de la app web (no es secreta)
$TicdCerdo = 2                                          # tipo de ciclo de desposte de cerdo
$Log      = Join-Path $Base 'dj_sync_log.txt'
$Estado   = Join-Path $Base 'dj_sync_estado.json'
$FsBase   = "https://firestore.googleapis.com/v1/projects/$Proyecto/databases/(default)/documents"

function LogL([string]$t) {
  $l = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $t
  try { [IO.File]::AppendAllText($Log, $l + "`r`n", [Text.Encoding]::UTF8) } catch {}
  Write-Host $l
}
function Hash([string]$t) {
  $sha = [Security.Cryptography.SHA1]::Create()
  return [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($t))).Replace('-', '')
}

function Get-DJ([string]$m) {
  $d0 = "DATE '$m-01'"; $d1 = "ADD_MONTHS($d0,1)"
  $sql = @"
SELECT 'OK|'||TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI') FROM dual;
SELECT 'TR|'||TO_CHAR(d.desp_fecha,'YYYY-MM-DD')||'|'||NVL(tr.tro_numero,0)||'|'||NVL(tr.tro_cabezas,0)||'|'||TO_CHAR(TRUNC(p.pro_fecha),'YYYY-MM-DD')||'|'||COUNT(*)||'|'||TO_CHAR(ROUND(SUM(i.despi_kilos),2))
  FROM desposte d JOIN desposteing i ON i.desp_numero=d.desp_numero
  LEFT JOIN productos p ON p.pro_numero=i.pro_numero AND p.pro_item=i.pro_item
  LEFT JOIN tropas tr ON tr.tro_nroint=p.tro_nroint
 WHERE d.ticd_codigo=$TicdCerdo AND d.desp_fecha>=$d0 AND d.desp_fecha<$d1 AND i.art_codigo IN (18,19)
 GROUP BY d.desp_fecha, tr.tro_numero, tr.tro_cabezas, TRUNC(p.pro_fecha);
SELECT 'FT|'||t.tro_numero||'|'||TO_CHAR(TRUNC(p.pro_fecha),'YYYY-MM-DD')||'|'||COUNT(*)
  FROM romaneos r JOIN productos p ON p.pro_numero=r.pro_numero AND p.pro_item=r.pro_item JOIN tropas t ON t.tro_nroint=p.tro_nroint
 WHERE NVL(r.rom_kilos,0) > 0 AND p.tro_nroint IN (SELECT DISTINCT p2.tro_nroint FROM desposte d JOIN desposteing i ON i.desp_numero=d.desp_numero
                         JOIN productos p2 ON p2.pro_numero=i.pro_numero AND p2.pro_item=i.pro_item
                        WHERE d.ticd_codigo=$TicdCerdo AND d.desp_fecha>=$d0 AND d.desp_fecha<$d1 AND i.art_codigo IN (18,19))
 GROUP BY t.tro_numero, TRUNC(p.pro_fecha);
SELECT 'IN|'||TO_CHAR(d.desp_fecha,'YYYY-MM-DD')||'|'||i.art_codigo||'|'||$Den||'|'||SUM(NVL(i.despi_canuni,0))||'|'||TO_CHAR(ROUND(SUM(i.despi_kilos),2))
  FROM desposte d JOIN desposteing i ON i.desp_numero=d.desp_numero LEFT JOIN articulos a ON a.art_codigo=i.art_codigo
 WHERE d.ticd_codigo=$TicdCerdo AND d.desp_fecha>=$d0 AND d.desp_fecha<$d1 AND i.art_codigo NOT IN (18,19)
 GROUP BY d.desp_fecha, i.art_codigo, a.art_denom;
SELECT 'RE|'||TO_CHAR(d.desp_fecha,'YYYY-MM-DD')||'|'||r.art_codigo||'|'||$Den||'|'||NVL(r.cont_numero,0)||'|'||SUM(NVL(r.despr_canuni,0))||'|'||SUM(NVL(r.despr_piezas,0))||'|'||TO_CHAR(ROUND(SUM(r.despr_kilos),2))
  FROM desposte d JOIN desposteres r ON r.desp_numero=d.desp_numero LEFT JOIN articulos a ON a.art_codigo=r.art_codigo
 WHERE d.ticd_codigo=$TicdCerdo AND d.desp_fecha>=$d0 AND d.desp_fecha<$d1
 GROUP BY d.desp_fecha, r.art_codigo, a.art_denom, r.cont_numero;
SELECT 'EN|'||TO_CHAR(d.desp_fecha,'YYYY-MM-DD')||'|'||r.art_codigo||'|'||TRIM(NVL(r.despr_tropa,'?'))||'|'||SUM(NVL(r.despr_canuni,0))
  FROM desposte d JOIN desposteres r ON r.desp_numero=d.desp_numero
 WHERE d.ticd_codigo=$TicdCerdo AND d.desp_fecha>=$d0 AND d.desp_fecha<$d1 AND r.art_codigo IN (22)
 GROUP BY d.desp_fecha, r.art_codigo, r.despr_tropa;
SELECT 'C3|'||TO_CHAR(d.desp_fecha,'YYYY-MM-DD')||'|'||r.art_codigo||'|'||$Den||'|'||SUM(NVL(r.despr_canuni,0))||'|'||TO_CHAR(ROUND(SUM(r.despr_kilos),2))
  FROM desposte d JOIN desposteres r ON r.desp_numero=d.desp_numero LEFT JOIN articulos a ON a.art_codigo=r.art_codigo
 WHERE d.ticd_codigo=$TicdC3 AND d.desp_fecha>=$d0 AND d.desp_fecha<$d1
 GROUP BY d.desp_fecha, r.art_codigo, a.art_denom;
SELECT 'C3I|'||TO_CHAR(d.desp_fecha,'YYYY-MM-DD')||'|'||i.art_codigo||'|'||$Den||'|'||SUM(NVL(i.despi_canuni,0))||'|'||TO_CHAR(ROUND(SUM(i.despi_kilos),2))
  FROM desposte d JOIN desposteing i ON i.desp_numero=d.desp_numero LEFT JOIN articulos a ON a.art_codigo=i.art_codigo
 WHERE d.ticd_codigo=$TicdC3 AND d.desp_fecha>=$d0 AND d.desp_fecha<$d1
 GROUP BY d.desp_fecha, i.art_codigo, a.art_denom;
SELECT 'ME|'||TO_CHAR(d.desp_fecha,'YYYY-MM-DD')||'|'||d.ticd_codigo||'|'||r.art_codigo||'|'||$Den||'|'||SUM(NVL(r.despr_canuni,0))||'|'||TO_CHAR(ROUND(SUM(r.despr_kilos),2))
  FROM desposte d JOIN desposteres r ON r.desp_numero=d.desp_numero LEFT JOIN articulos a ON a.art_codigo=r.art_codigo
 WHERE d.ticd_codigo IN (3,6) AND d.desp_fecha>=$d0 AND d.desp_fecha<$d1
 GROUP BY d.desp_fecha, d.ticd_codigo, r.art_codigo, a.art_denom;
SELECT 'CO|'||c.cont_numero||'|'||TRIM(TRANSLATE(NVL(c.cont_denom,' '), CHR(9)||'|', '  '))||'|'||TRIM(NVL(pa.pais_denom,' '))
  FROM contratos c LEFT JOIN paises pa ON pa.pais_codigo=c.pais_codigo
 WHERE c.cont_numero IN (SELECT DISTINCT r.cont_numero FROM desposte d JOIN desposteres r ON r.desp_numero=d.desp_numero
                          WHERE d.ticd_codigo=$TicdCerdo AND d.desp_fecha>=$d0 AND d.desp_fecha<$d1);
"@
  return Invoke-Sql $sql
}


# Faena y mortalidad del año actual y el anterior (pestaña "Faena y mortalidad")
#    FA|AAAA-MM|faena propia (1) o usuario (0)|cabezas|kg|días   MU|fecha|tropa|cabezas|lugar (V/C)|patente|cuenta|productor|localidad|observ
#    TQ|AAAA-MM|cuenta|productor|localidad|tropas|cabezas   (tropas recibidas por productor y granja)
function Get-Anual {
  $d0 = "DATE '$((Get-Date).Year - 1)-01-01'"
  $sql = @"
SELECT 'OK|'||TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI') FROM dual;
SELECT 'FA|'||TO_CHAR(p.pro_fecha,'YYYY-MM')||'|'||NVL(u.usu_faenapropia,1)||'|'||COUNT(*)||'|'||TO_CHAR(ROUND(SUM(r.rom_kilos),2))||'|'||COUNT(DISTINCT TRUNC(p.pro_fecha))
  FROM romaneos r JOIN productos p ON p.pro_numero=r.pro_numero AND p.pro_item=r.pro_item
  JOIN tropas t ON t.tro_nroint=p.tro_nroint LEFT JOIN usuarios u ON u.usu_codigo=t.usu_codigo
 WHERE p.pro_fecha >= $d0 GROUP BY TO_CHAR(p.pro_fecha,'YYYY-MM'), u.usu_faenapropia;
SELECT 'MU|'||TO_CHAR(m.mue_fecha,'YYYY-MM-DD')||'|'||t.tro_numero||'|'||m.mue_cabezas||'|'||m.mue_lugar||'|'||TRIM(t.tro_patente)||'|'||t.cue_codigo||'|'||TRIM(TRANSLATE(NVL(c.cue_denom,' '),CHR(9)||'|','  '))||'|'||TRIM(NVL(l.loc_denom,' '))||'|'||TRIM(TRANSLATE(NVL(m.mue_observ,' '),CHR(9)||'|','  '))
  FROM muertos m JOIN tropas t ON t.tro_nroint=m.tro_nroint LEFT JOIN cuentas c ON c.cue_codigo=t.cue_codigo LEFT JOIN localidades l ON l.loc_codigo=t.loc_codigo
 WHERE m.mue_fecha >= $d0;
SELECT 'TQ|'||TO_CHAR(t.tro_fecha,'YYYY-MM')||'|'||t.cue_codigo||'|'||TRIM(TRANSLATE(NVL(c.cue_denom,' '),CHR(9)||'|','  '))||'|'||TRIM(NVL(l.loc_denom,' '))||'|'||COUNT(*)||'|'||SUM(t.tro_cabezas)
  FROM tropas t LEFT JOIN cuentas c ON c.cue_codigo=t.cue_codigo LEFT JOIN localidades l ON l.loc_codigo=t.loc_codigo
 WHERE t.tro_fecha >= $d0 GROUP BY TO_CHAR(t.tro_fecha,'YYYY-MM'), t.cue_codigo, c.cue_denom, l.loc_denom;
"@
  return Invoke-Sql $sql
}

# Muertos de la playa de emergencia (pedido de Sabi 30/10): en la consulta de faena, un renglón de lista A1 con 1 sola cabeza,
# de una tropa que tiene más animales, es un animal muerto en corrales que pasó por la playa de emergencia.
# La tabla de la consulta de faena se busca sola en el diccionario de Oracle (la que tiene una columna LISTA y TRO_NROINT).
#    FE|fecha|tropa|lista|cabezas|número de faena|cabezas de la tropa|patente|cuenta|productor|localidad   (renglones A con 1 cabeza)
#    FX|ok|tabla|col. lista|col. cabezas|col. fecha|col. número|listas vistas en 60 días   ó   FX|no|lo que se encontró
function Get-A1 {
  $d0 = "DATE '$((Get-Date).Year - 1)-01-01'"
  $dx = Invoke-Sql @"
SELECT 'DX|'||c.table_name||'|'||c.column_name||'|'||c.data_type FROM all_tab_columns c
 WHERE c.owner='FRIGO' AND c.table_name IN (SELECT table_name FROM all_tab_columns WHERE owner='FRIGO' AND column_name LIKE '%LISTA%')
   AND c.table_name IN (SELECT table_name FROM all_tab_columns WHERE owner='FRIGO' AND column_name='TRO_NROINT')
 ORDER BY c.table_name, c.column_id;
"@
  $cols = @($dx | Where-Object { $_ -like 'DX|*' } | ForEach-Object { $p = $_.Split('|'); [pscustomobject]@{ t = $p[1].Trim(); c = $p[2].Trim(); ty = $p[3].Trim() } })
  if (-not $cols.Count) { return @('FX|no|ninguna tabla con columnas LISTA y TRO_NROINT') }
  $mejor = $null; $pmax = -1
  foreach ($g in ($cols | Group-Object t)) {
    $n = $g.Name; $cs = $g.Group; $pt = 0
    if ($n -like '*FAE*') { $pt += 3 }
    if ($cs | Where-Object { $_.c -like '*GARR*' }) { $pt += 2 }
    if ($cs | Where-Object { $_.c -like '*CAB*' }) { $pt += 1 }
    if ($cs | Where-Object { $_.ty -eq 'DATE' }) { $pt += 1 }
    if ($pt -gt $pmax) { $pmax = $pt; $mejor = $g }
  }
  $T = $mejor.Name; $cs = $mejor.Group
  # Lista: en pantalla se ve "P 0" / "A 1" (letra y número). Se juntan las columnas de lista que no son el orden ni la "Lista Dism."
  # (V_FAENA: FAE_ORDENLISTA es el orden dentro de la lista, no sirve). Cabezas: las del renglón, nunca TRO_CABEZAS (son las de la tropa).
  $cLs = @($cs | Where-Object { $_.c -like '*LISTA*' -and $_.c -notlike '*ORDEN*' -and $_.c -notlike '*DIS*' })
  $cL = ($cLs | ForEach-Object { $_.c }) -join '+'
  $cC = ($cs | Where-Object { $_.c -like '*CAB*' -and $_.c -notlike 'TRO_*' -and $_.c -notlike '*FAE*FAE*' } | Select-Object -First 1).c
  if (-not $cC) { $cC = ($cs | Where-Object { $_.c -like '*CAB*' -and $_.c -notlike 'TRO_*' } | Select-Object -First 1).c }
  $cF = ($cs | Where-Object { $_.ty -eq 'DATE' -and $_.c -like '*FEC*' } | Select-Object -First 1).c
  if (-not $cF) { $cF = ($cs | Where-Object { $_.ty -eq 'DATE' } | Select-Object -First 1).c }
  $cN = ($cs | Where-Object { $_.c -like '*NUM*' -and $_.c -ne 'TRO_NROINT' -and $_.c -notlike 'TRO_*' } | Select-Object -First 1).c
  $todas = ($cs | ForEach-Object { $_.c }) -join ','
  if (-not ($cLs.Count -and $cC -and $cF)) { return @("FX|no|$T|lista=$cL cabezas=$cC fecha=$cF|$todas") }
  $num = if ($cN) { "f.$cN" } else { "''" }
  $lis = "UPPER(REPLACE(" + (($cLs | ForEach-Object { "TRIM(TO_CHAR(f." + $_.c + "))" }) -join "||") + ",' ',''))"
  $r = Invoke-Sql @"
SELECT 'FE|'||TO_CHAR(TRUNC(f.$cF),'YYYY-MM-DD')||'|'||t.tro_numero||'|'||$lis||'|'||f.$cC||'|'||$num||'|'||NVL(t.tro_cabezas,0)||'|'||TRIM(t.tro_patente)||'|'||t.cue_codigo||'|'||TRIM(TRANSLATE(NVL(c.cue_denom,' '),CHR(9)||'|','  '))||'|'||TRIM(NVL(l.loc_denom,' '))
  FROM $T f JOIN tropas t ON t.tro_nroint=f.tro_nroint LEFT JOIN cuentas c ON c.cue_codigo=t.cue_codigo LEFT JOIN localidades l ON l.loc_codigo=t.loc_codigo
 WHERE f.$cF >= $d0 AND f.$cC = 1 AND INSTR($lis,'A') > 0;
SELECT DISTINCT 'FV|'||$lis FROM $T f WHERE f.$cF >= SYSDATE-60;
"@
  $vistas = (@($r | Where-Object { $_ -like 'FV|*' } | ForEach-Object { $_.Substring(3) }) | Select-Object -First 12) -join ' '
  return @("FX|ok|$T|$cL|$cC|$cF|$cN|$vistas|$todas") + @($r | Where-Object { $_ -like 'FE|*' })
}

$Paso = ''
try {
  if (-not $SqlPlus) { throw 'No encuentro sqlplus.exe (el cliente de Oracle) en esta PC' }
  if (-not "$Conn".Trim()) { throw 'Falta la conexión a la base (config_local.ps1)' }
  $hoy = (Get-Date).Date
  $meses = @($hoy.AddMonths(-1).ToString('yyyy-MM'), $hoy.ToString('yyyy-MM'))
  $datos = @{}
  foreach ($m in $meses) { $Paso = "leer el mes $m"; $datos[$m] = ((Get-DJ $m) | Where-Object { "$_".Trim() -ne '' }) -join "`n" }
  $Paso = 'leer faena y mortalidad'; $anual = ((Get-Anual) | Where-Object { "$_".Trim() -ne '' }) -join "`n"
  $Paso = 'buscar muertos de la playa de emergencia (A1)'
  try { $anual += "`n" + (((Get-A1) | Where-Object { "$_".Trim() -ne '' }) -join "`n") }
  catch { $m1 = ($_.Exception.Message -replace '[\r\n|]+', ' '); $anual += "`nFX|no|error: " + $m1.Substring(0, [Math]::Min(200, $m1.Length)) }
  # Si el sistema no devolvió nada (ni siquiera la hora), no se sube nada: así nunca se pisan los datos de la web con vacío.
  foreach ($x in @($datos.Values) + @($anual)) {
    if ("$x" -notmatch '(^|\n)OK\|') {
      $diag = ''
      try { $diag = ((& $SqlPlus -S -L $Conn '@NUL' 2>&1) | Out-String).Trim() } catch { $diag = $_.Exception.Message }
      $Paso = ''; throw ('El sistema no devolvió datos (no se subió nada). sqlplus: ' + ($diag -replace '\s+', ' ').Substring(0, [Math]::Min(300, ($diag -replace '\s+', ' ').Length)))
    }
  }

  # copia de lo leído (para revisar sin tocar la web)
  $todo = (($meses | ForEach-Object { $datos[$_] }) + @($anual)) -join "`n"
  [IO.File]::WriteAllText((Join-Path $Base 'dj_ultimo.txt'), $todo, [Text.Encoding]::UTF8)
  if ($SinSubir) {
    LogL ("Leído sin subir: {0} renglones (dj_ultimo.txt)." -f ($todo -split "`n").Count); exit 0
  }

  $Paso = 'ingresar con la cuenta de la app'
  $auth = Invoke-RestMethod -Method Post -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$ApiKey" -ContentType 'application/json; charset=utf-8' `
    -Body ([Text.Encoding]::UTF8.GetBytes((@{ email = $SyncMail.Trim(); password = $SyncPass; returnSecureToken = $true } | ConvertTo-Json)))
  $Hdr = @{ Authorization = "Bearer $($auth.idToken)" }

  $prev = @{}
  if ((Test-Path $Estado) -and -not $Forzar) { (Get-Content $Estado -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $prev[$_.Name] = $_.Value } }
  $ahora = Get-Date -Format 'yyyy-MM-dd HH:mm'
  $subidos = 0
  foreach ($m in $meses) {
    $txt = $datos[$m]
    $h = Hash ($txt -replace '^OK\|[^\n]*\n?', '')
    if ($prev["dj-$m"] -eq $h) { continue }
    $Paso = "subir el mes $m"
    $body = @{ fields = @{ txt = @{ stringValue = $txt }; mes = @{ stringValue = $m }; actualizado = @{ stringValue = $ahora } } } | ConvertTo-Json -Depth 5 -Compress
    Invoke-RestMethod -Method Patch -Uri "$FsBase/c3sis/dj-$m" -Headers $Hdr -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
    $prev["dj-$m"] = $h; $subidos++
  }
  $h = Hash ($anual -replace '^OK\|[^\n]*\n?', '')
  if ($prev['dj-anual'] -ne $h) {
    $Paso = 'subir faena y mortalidad'
    $body = @{ fields = @{ txt = @{ stringValue = $anual }; actualizado = @{ stringValue = $ahora } } } | ConvertTo-Json -Depth 5 -Compress
    Invoke-RestMethod -Method Patch -Uri "$FsBase/c3sis/dj-anual" -Headers $Hdr -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
    $prev['dj-anual'] = $h; $subidos++
  }
  # ---- link público de solo lectura para ver faena y mortalidad (https://qualita-produccion.web.app/faena?k=<clave>) ----
  $ClaveF = Join-Path $Base 'faena_link_clave.txt'
  if (Test-Path $ClaveF) {
    $k = (Get-Content $ClaveF -Raw).Trim()
    $Paso = 'leer los muertos cargados a mano'
    $mu = '{}'
    try { $r = Invoke-RestMethod -Method Get -Uri "$FsBase/c3docs/ddjj-muertos" -Headers $Hdr; if ($r.fields.json.stringValue) { $mu = $r.fields.json.stringValue } } catch {}
    $h = Hash (($anual -replace '^OK\|[^\n]*\n?', '') + $mu + $k)
    if ($prev['faena-pub'] -ne $h) {
      $Paso = 'publicar el link de faena'
      $body = @{ fields = @{ txt = @{ stringValue = $anual }; muertos = @{ stringValue = $mu }; actualizado = @{ stringValue = $ahora } } } | ConvertTo-Json -Depth 5 -Compress
      Invoke-RestMethod -Method Patch -Uri "$FsBase/config/fp-$k" -Headers $Hdr -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
      $prev['faena-pub'] = $h; $subidos++
    }
  }
  ($prev | ConvertTo-Json -Depth 3) | Set-Content -Path $Estado -Encoding UTF8
  LogL ("OK: {0} meses revisados, {1} subidos." -f $meses.Count, $subidos)
} catch {
  $det = ''
  try { if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $det = ' | ' + ($_.ErrorDetails.Message -replace '\s+', ' ') } } catch {}
  if ($det -match 'INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND') { $det += ' -> revisar la contraseña de config_local.ps1 (o rendering_config.ps1)' }
  LogL ("ERROR" + $(if ($Paso) { " al $Paso" } else { '' }) + ": " + $_.Exception.Message + $det)
  exit 1
}
