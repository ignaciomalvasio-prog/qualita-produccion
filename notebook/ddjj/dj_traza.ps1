# ============================================================
#  Trazabilidad (pestaña "Trazabilidad" del Centro de desposte) · solo consultas al sistema
#  Por TROPA: medias de la tropa, en qué despostes entraron (con qué otras tropas), lo que salió de esos despostes
#  (y de los que reprocesaron esas cajas) y a qué clientes se vendió (remitos), más las medias vendidas enteras.
#  Por CORRELATIVO (número de la etiqueta: correlativo-artículo-kilos; el correlativo es pro_identif, si no aparece se prueba pro_numero): qué es, de qué desposte salió,
#  qué tropas entraron a ese desposte (y al anterior si es un reproceso), y a dónde fue la caja.
#  Lo llama dj_pedido.ps1 cuando alguien consulta desde la web (c3docs/ddjj-traza). Prueba: dj_traza.ps1 -Tipo tropa -Valor 261791 -Probar
#  Renglones:
#    TT|tropa|nroint|fecha ingreso|cabezas|productor|localidad|patente     TM|fecha faena|medias (cabezas del romaneo × 2)|kg de faena
#    DP|desposte|fecha|tipo ciclo|medias de la tropa|total entradas|kg entrada|kg de las medias de la tropa    DT|desposte|otra tropa|medias
#    RP|desposte origen|desposte que reprocesó|fecha|tipo ciclo|cajas|kg
#    SR|desposte|cajas|kg|vendidas|reprocesadas|pasadas a otra sección|kg en stock (cajas sin venta, reproceso ni pase)
#    VE|origen (desposte, 0 = medias enteras)|fecha|remito|cuenta|cliente|artículo|nombre|cajas|kg
#    RI|origen|fecha|remito interno|de|a|cajas|kg
#    PR|correlativo|item|art|nombre|kg|fecha|identif|tropa (si es media)|nroint    TF|tropa|fecha|cabezas|productor|localidad (de la media)
#    D1|desposte (auxiliar)
#    DR|desposte|fecha|tipo ciclo|nivel     TI|nivel|desposte|tropa|productor|fecha faena|medias|kg
# ============================================================
param([string]$Tipo = '', [string]$Valor = '', [switch]$Probar)
$ErrorActionPreference = 'Stop'
$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $Base 'dj_comun.ps1')
function Cl([string]$x) { return "TRIM(TRANSLATE(NVL($x,' '), CHR(9)||'|', '  '))" }
$Cli = Cl 'c.cue_denom'; $Prod = Cl 'c.cue_denom'

# copia de la última consulta (para revisar si da error)
$SqlOrig = ${function:Invoke-Sql}
function Invoke-Sql([string]$body) { try { [IO.File]::WriteAllText((Join-Path $TmpDir 'traza_ultima.sql'), $body, [Text.Encoding]::UTF8) } catch {} ; return (& $SqlOrig $body) }
function Lista($lineas, [string]$tag, [int]$col) {
  $v = @($lineas | Where-Object { $_ -like "$tag|*" } | ForEach-Object { ($_ -split '\|')[$col] } | Where-Object { $_ -match '^\d+$' } | Select-Object -Unique)
  return $v
}
function EnLista($v) { if (-not $v -or $v.Count -eq 0) { return '-1' } ; return (($v | Select-Object -First 900) -join ',') }

# Se consulta por pasos, con las listas de números ya resueltas (así la base usa los índices y tarda segundos).
function Get-Traza([string]$tipo, [string]$valor) {
  if ($valor -notmatch '^\d{1,12}$') { throw 'El número tiene que ser solo dígitos' }
  $V = $valor; $out = @()
  $ventas = {
    param([string]$fuente)   # fuente: SELECT src, pro_numero, pro_item
    # cada caja (pro_numero, pro_item) cuenta una sola vez aunque figure en dos despostes (va al de número menor, donde se produjo primero):
    # si no, la misma venta salía repetida y se "vendía" más de lo producido (Sabi 30/10, remito R 0011-00044749 en 416192 y 416200)
    return "`r`n" + @"
SELECT 'VE|'||x.src||'|'||TO_CHAR(rm.rem_fecha,'YYYY-MM-DD')||'|'||rm.rem_letra||' '||LPAD(rm.pue_codigo,4,'0')||'-'||LPAD(rm.rem_numero,8,'0')||'|'||rm.cue_codigo||'|'||$Cli||'|'||rd.art_codigo||'|'||$Den||'|'||COUNT(*)||'|'||TO_CHAR(ROUND(SUM(rd.red_kilos),2))
  FROM (SELECT MIN(src) src, pro_numero, pro_item FROM ($fuente) GROUP BY pro_numero, pro_item) x JOIN remitosdet rd ON rd.pro_numero=x.pro_numero AND rd.pro_item=x.pro_item
  JOIN remitos rm ON rm.rem_letra=rd.rem_letra AND rm.pue_codigo=rd.pue_codigo AND rm.rem_numero=rd.rem_numero
  LEFT JOIN cuentas c ON c.cue_codigo=rm.cue_codigo LEFT JOIN articulos a ON a.art_codigo=rd.art_codigo
 GROUP BY x.src, rm.rem_fecha, rm.rem_letra, rm.pue_codigo, rm.rem_numero, rm.cue_codigo, c.cue_denom, rd.art_codigo, a.art_denom;
SELECT 'RI|'||x.src||'|'||TO_CHAR(ri.reint_fecha,'YYYY-MM-DD')||'|'||ri.reint_numero||'|'||$(Cl 'f1.fri_denom')||'|'||$(Cl 'f2.fri_denom')||'|'||COUNT(*)||'|'||TO_CHAR(ROUND(SUM(d.reintd_kilos),2))
  FROM (SELECT MIN(src) src, pro_numero, pro_item FROM ($fuente) GROUP BY pro_numero, pro_item) x JOIN remitosintdet d ON d.pro_numero=x.pro_numero AND d.pro_item=x.pro_item
  JOIN remitosint ri ON ri.reint_letra=d.reint_letra AND ri.pue_codigo=d.pue_codigo AND ri.reint_numero=d.reint_numero
  LEFT JOIN frigorificos f1 ON f1.fri_codigo=ri.ori_fri_codigo LEFT JOIN frigorificos f2 ON f2.fri_codigo=ri.des_fri_codigo
 GROUP BY x.src, ri.reint_fecha, ri.reint_numero, f1.fri_denom, f2.fri_denom;
"@
  }
  if ($tipo -eq 'tropa') {
    $a = Invoke-Sql @"
SELECT 'OK|'||TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI') FROM dual;
SELECT 'TT|'||t.tro_numero||'|'||t.tro_nroint||'|'||TO_CHAR(t.tro_fecha,'YYYY-MM-DD')||'|'||t.tro_cabezas||'|'||$Prod||'|'||$(Cl 'l.loc_denom')||'|'||$(Cl 't.tro_patente')
  FROM tropas t LEFT JOIN cuentas c ON c.cue_codigo=t.cue_codigo LEFT JOIN localidades l ON l.loc_codigo=t.loc_codigo WHERE t.tro_numero=$V;
"@
    $out += $a; $NI = EnLista (Lista $a 'TT' 2)
    if ($NI -eq '-1') { return $out }
    $M = "SELECT 0 src, p.pro_numero, p.pro_item FROM productos p WHERE p.tro_nroint IN ($NI) AND p.art_codigo IN (18,19)"
    $b = Invoke-Sql (@"
SELECT 'TM|'||TO_CHAR(TRUNC(p.pro_fecha),'YYYY-MM-DD')||'|'||(COUNT(*)*2)||'|'||TO_CHAR(ROUND(SUM(r.rom_kilos),2))
  FROM romaneos r JOIN productos p ON p.pro_numero=r.pro_numero AND p.pro_item=r.pro_item WHERE p.tro_nroint IN ($NI) GROUP BY TRUNC(p.pro_fecha);
SELECT DISTINCT 'D1|'||i.desp_numero FROM desposteing i JOIN productos p ON p.pro_numero=i.pro_numero AND p.pro_item=i.pro_item WHERE p.tro_nroint IN ($NI);
"@ + (& $ventas $M))
    $out += $b; $D1 = EnLista (Lista $b 'D1' 1)
    if ($D1 -eq '-1') { return $out }
    $c = Invoke-Sql @"
SELECT 'DP|'||d.desp_numero||'|'||TO_CHAR(d.desp_fecha,'YYYY-MM-DD')||'|'||d.ticd_codigo||'|'||SUM(CASE WHEN p.tro_nroint IN ($NI) THEN 1 ELSE 0 END)||'|'||COUNT(*)||'|'||TO_CHAR(ROUND(SUM(i.despi_kilos),2))||'|'||TO_CHAR(ROUND(SUM(CASE WHEN p.tro_nroint IN ($NI) THEN i.despi_kilos ELSE 0 END),2))
  FROM desposte d JOIN desposteing i ON i.desp_numero=d.desp_numero LEFT JOIN productos p ON p.pro_numero=i.pro_numero AND p.pro_item=i.pro_item
 WHERE d.desp_numero IN ($D1) GROUP BY d.desp_numero, d.desp_fecha, d.ticd_codigo;
SELECT 'DT|'||i.desp_numero||'|'||t.tro_numero||'|'||COUNT(*)
  FROM desposteing i JOIN productos p ON p.pro_numero=i.pro_numero AND p.pro_item=i.pro_item JOIN tropas t ON t.tro_nroint=p.tro_nroint
 WHERE i.desp_numero IN ($D1) AND p.tro_nroint NOT IN ($NI) GROUP BY i.desp_numero, t.tro_numero;
SELECT 'RP|'||r.desp_numero||'|'||d.desp_numero||'|'||TO_CHAR(d.desp_fecha,'YYYY-MM-DD')||'|'||d.ticd_codigo||'|'||COUNT(*)||'|'||TO_CHAR(ROUND(SUM(i.despi_kilos),2))
  FROM desposteres r JOIN desposteing i ON i.pro_numero=r.pro_numero AND i.pro_item=r.pro_item JOIN desposte d ON d.desp_numero=i.desp_numero
 WHERE r.desp_numero IN ($D1) GROUP BY r.desp_numero, d.desp_numero, d.desp_fecha, d.ticd_codigo;
"@
    $out += $c
    $D = EnLista (@((Lista $b 'D1' 1)) + @((Lista $c 'RP' 2)) | Select-Object -Unique)
    $X = "SELECT r.desp_numero src, r.pro_numero, r.pro_item FROM desposteres r WHERE r.desp_numero IN ($D)"
    $out += Invoke-Sql (@"
SELECT 'SR|'||r.desp_numero||'|'||COUNT(*)||'|'||TO_CHAR(ROUND(SUM(r.despr_kilos),2))||'|'||
  SUM(CASE WHEN EXISTS(SELECT 1 FROM remitosdet rd WHERE rd.pro_numero=r.pro_numero AND rd.pro_item=r.pro_item) THEN 1 ELSE 0 END)||'|'||
  SUM(CASE WHEN EXISTS(SELECT 1 FROM desposteing i WHERE i.pro_numero=r.pro_numero AND i.pro_item=r.pro_item) THEN 1 ELSE 0 END)||'|'||
  SUM(CASE WHEN EXISTS(SELECT 1 FROM remitosintdet x WHERE x.pro_numero=r.pro_numero AND x.pro_item=r.pro_item) THEN 1 ELSE 0 END)||'|'||
  TO_CHAR(ROUND(SUM(CASE WHEN NOT EXISTS(SELECT 1 FROM remitosdet rd WHERE rd.pro_numero=r.pro_numero AND rd.pro_item=r.pro_item)
                          AND NOT EXISTS(SELECT 1 FROM desposteing i WHERE i.pro_numero=r.pro_numero AND i.pro_item=r.pro_item)
                          AND NOT EXISTS(SELECT 1 FROM remitosintdet x WHERE x.pro_numero=r.pro_numero AND x.pro_item=r.pro_item) THEN r.despr_kilos ELSE 0 END),2))
  FROM desposteres r WHERE r.desp_numero IN ($D) GROUP BY r.desp_numero;
"@ + (& $ventas $X))
  } elseif ($tipo -eq 'correlativo') {
    $prQ = { param($w) return "SELECT 'PR|'||p.pro_numero||'|'||p.pro_item||'|'||p.art_codigo||'|'||$Den||'|'||TO_CHAR(ROUND(p.pro_kilos,2))||'|'||TO_CHAR(p.pro_fecha,'YYYY-MM-DD')||'|'||p.pro_identif||'|'||NVL(t.tro_numero,0)||'|'||NVL(t.tro_nroint,0) FROM productos p LEFT JOIN articulos a ON a.art_codigo=p.art_codigo LEFT JOIN tropas t ON t.tro_nroint=p.tro_nroint WHERE $w;" }
    # el correlativo de la etiqueta (correlativo-artículo-kilos) es pro_identif; si no aparece, se prueba con el número interno
    $a = Invoke-Sql ("SELECT 'OK|'||TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI') FROM dual;`r`n" + (& $prQ "p.pro_identif=$V"))
    if (-not ($a | Where-Object { $_ -like 'PR|*' })) { $a += Invoke-Sql (& $prQ "p.pro_numero=$V") }
    $out += $a
    $prs = @($a | Where-Object { $_ -like 'PR|*' } | ForEach-Object { $x = $_ -split '\|'; "($($x[1]),$($x[2]))" })
    if (-not $prs.Count) { return $out }
    $K = ($prs -join ','); $NT = EnLista (Lista $a 'PR' 10 | Where-Object { $_ -ne '0' })
    $P = "SELECT 0 src, pro_numero, pro_item FROM productos WHERE (pro_numero, pro_item) IN ($K)"
    $b = Invoke-Sql (@"
SELECT 'DR|'||d.desp_numero||'|'||TO_CHAR(d.desp_fecha,'YYYY-MM-DD')||'|'||d.ticd_codigo||'|0' FROM desposte d WHERE d.desp_numero IN (SELECT r.desp_numero FROM desposteres r WHERE (r.pro_numero, r.pro_item) IN ($K));
SELECT 'RP|0|'||d.desp_numero||'|'||TO_CHAR(d.desp_fecha,'YYYY-MM-DD')||'|'||d.ticd_codigo||'|'||COUNT(*)||'|'||TO_CHAR(ROUND(SUM(i.despi_kilos),2))
  FROM desposteing i JOIN desposte d ON d.desp_numero=i.desp_numero WHERE (i.pro_numero, i.pro_item) IN ($K) GROUP BY d.desp_numero, d.desp_fecha, d.ticd_codigo;
SELECT 'TF|'||t.tro_numero||'|'||TO_CHAR(t.tro_fecha,'YYYY-MM-DD')||'|'||t.tro_cabezas||'|'||$Prod||'|'||$(Cl 'l.loc_denom')
  FROM tropas t LEFT JOIN cuentas c ON c.cue_codigo=t.cue_codigo LEFT JOIN localidades l ON l.loc_codigo=t.loc_codigo WHERE t.tro_nroint IN ($NT);
"@ + (& $ventas $P))
    $out += $b; $D0 = EnLista (Lista $b 'DR' 1)
    if ($D0 -ne '-1') {
      $c = Invoke-Sql @"
SELECT 'TI|0|'||i.desp_numero||'|'||t.tro_numero||'|'||$Prod||'|'||TO_CHAR(TRUNC(MIN(p.pro_fecha)),'YYYY-MM-DD')||'|'||COUNT(*)||'|'||TO_CHAR(ROUND(SUM(i.despi_kilos),2))
  FROM desposteing i JOIN productos p ON p.pro_numero=i.pro_numero AND p.pro_item=i.pro_item JOIN tropas t ON t.tro_nroint=p.tro_nroint LEFT JOIN cuentas c ON c.cue_codigo=t.cue_codigo
 WHERE i.desp_numero IN ($D0) GROUP BY i.desp_numero, t.tro_numero, c.cue_denom;
SELECT DISTINCT 'D1|'||r.desp_numero FROM desposteing i JOIN desposteres r ON r.pro_numero=i.pro_numero AND r.pro_item=i.pro_item WHERE i.desp_numero IN ($D0);
"@
      $out += $c; $D1 = EnLista (Lista $c 'D1' 1)
      if ($D1 -ne '-1') {
        $out += Invoke-Sql @"
SELECT 'DR|'||d.desp_numero||'|'||TO_CHAR(d.desp_fecha,'YYYY-MM-DD')||'|'||d.ticd_codigo||'|1' FROM desposte d WHERE d.desp_numero IN ($D1);
SELECT 'TI|1|'||i.desp_numero||'|'||t.tro_numero||'|'||$Prod||'|'||TO_CHAR(TRUNC(MIN(p.pro_fecha)),'YYYY-MM-DD')||'|'||COUNT(*)||'|'||TO_CHAR(ROUND(SUM(i.despi_kilos),2))
  FROM desposteing i JOIN productos p ON p.pro_numero=i.pro_numero AND p.pro_item=i.pro_item JOIN tropas t ON t.tro_nroint=p.tro_nroint LEFT JOIN cuentas c ON c.cue_codigo=t.cue_codigo
 WHERE i.desp_numero IN ($D1) GROUP BY i.desp_numero, t.tro_numero, c.cue_denom;
"@
      }
    }
  } else { throw 'Tipo de consulta desconocido' }
  return @($out | Where-Object { "$_".Trim() -ne '' })
}

if ($Probar) {
  $t0 = Get-Date
  $r = Get-Traza $Tipo $Valor
  $out = Join-Path $Base ('traza_prueba_' + $Tipo + '.txt')
  [IO.File]::WriteAllText($out, (($r -join "`r`n") + "`r`n# segundos: " + [int]((Get-Date) - $t0).TotalSeconds), [Text.Encoding]::UTF8)
}
