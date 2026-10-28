/* Menudencias y rendering · pestaña de /ddjj: resumen mensual de kg producidos que pide SENASA a fin de mes.
   - Datos: renglones ME|fecha|tipo de ciclo|art|nombre|unidades|kg de c3sis/dj-AAAA-MM (los sube dj_sync.ps1):
       tipo 3 = menudencias (hígado, corazón, entraña…), tipo 6 = rendering (harina, sebo).
     Más los artículos del desposte de cerdo que son menudencia (cabeza, oreja, recorte de cabeza…): eq().men.desp.
   - El sebo se carga en el sistema recién cuando se vende: producido = cargado + stock a fin de mes − stock al principio.
     El stock se mide en planta y se carga a mano; el del principio toma el del final del mes anterior.
   - Lo corregido: c3docs/ddjj-AAAA-MM → men = { kg: {clave: kg}, stock: {clave: {ini, fin}}, por, ts }.
   - Artículos que no van: eq().men.ignorar (el despojo de faena, 440, es lo que entra al rendering). */
'use strict';

const MEN_DEF = { desp: [431, 436, 441, 446, 451, 455, 456, 458, 485, 487, 488, 489, 503, 611, 705, 727, 631], ignorar: [440] };
const eqM = () => Object.assign({}, MEN_DEF, eq().men || {});
const docM = () => (S.doc && S.doc.men) || {};
const SEC_M = { m: 'Menudencias', r: 'Rendering' };

const TILDES_M = { HIGADO: 'HÍGADO', CORAZON: 'CORAZÓN', RIÑON: 'RIÑÓN', PULMON: 'PULMÓN', CHINCHULIN: 'CHINCHULÍN', LIQUIDO: 'LÍQUIDO', ESTOMAGO: 'ESTÓMAGO' };
/* "CORAZON (CONGELADO)", "Corazón" y "CORAZON" van en el mismo renglón */
function nombreM(den) {
  let t = String(den || '').toUpperCase().replace(/Ñ/g, '#').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/#/g, 'Ñ').replace(/[^A-Z0-9Ñ ]/g, ' ');
  t = t.replace(/\b(CONGELAD[OA]S?|CONG|FRESC[OA]S?|PORCIN[OA]S?|DE CERDO)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^RI ?ON$/.test(t)) t = 'RIÑON';   // la Ñ que llega mal del sistema
  if (/^ENTRA ?A$/.test(t)) t = 'ENTRAÑA';
  if (t === 'RECORTE DE CABEZAS') t = 'RECORTE DE CABEZA';
  if (t === 'OREJAS') t = 'OREJA';
  t = t.split(' ').map(w => TILDES_M[w] || w).join(' ');
  return t ? t.charAt(0) + t.slice(1).toLowerCase() : '?';
}

/* el resumen del mes: lo del sistema + lo corregido */
function calcularM(m) {
  const E = eqM(), ign = new Set(E.ignorar || []), desp = new Set(E.desp || []), filas = {}, fuera = {};
  const sumar = (sec, art, den, kg, origen) => {
    if (ign.has(art)) { const z = fuera[art] || (fuera[art] = { art, den, kg: 0 }); z.kg += kg; return; }
    const n = nombreM(den), k = sec + '|' + n;
    const r = filas[k] || (filas[k] = { k, sec, n, kgSis: 0, arts: {} });
    r.kgSis += kg;
    const a = r.arts[art] || (r.arts[art] = { art, den, kg: 0, origen });
    a.kg += kg;
  };
  for (const x of (S.sis.me || [])) {
    if (x.f.slice(0, 7) !== m) continue;
    if (x.ticd === 3) sumar('m', x.art, x.den, x.kg, 'menudencias');
    else if (x.ticd === 6) sumar('r', x.art, x.den, x.kg, 'rendering');
  }
  for (const [f, d] of Object.entries(S.sis.dias || {})) {
    if (f.slice(0, 7) !== m) continue;
    for (const r of d.re) if (desp.has(r.art)) sumar('m', r.art, r.den, r.kg, 'desposte');
  }
  const D = docM(), ov = D.kg || {}, st = D.stock || {}, prev = (S.menPrev || {})[mesAnterior(m)] || {};
  for (const k of Object.keys(ov)) if (!filas[k]) { const [sec, n] = k.split('|'); filas[k] = { k, sec, n, kgSis: 0, arts: {}, aMano: true }; }
  const out = { m: [], r: [], fuera: Object.values(fuera), tot: { m: 0, r: 0 } }, sinSuma = new Set(E.sinSuma || []);
  for (const r of Object.values(filas)) {
    r.kgSis = r2(r.kgSis);
    r.kg = ov[r.k] != null ? ov[r.k] : r.kgSis;
    if (r.sec === 'r') {
      const s = st[r.k] || {}, sp = ((prev.stock || {})[r.k] || {}).fin;
      r.ini = s.ini != null ? s.ini : sp != null ? sp : null; r.iniPrev = s.ini == null && sp != null;
      r.fin = s.fin != null ? s.fin : null;
      r.sebo = /SEBO/i.test(r.n);
      r.prod = r2((Number(r.kg) || 0) + (Number(r.fin) || 0) - (Number(r.ini) || 0));
    } else r.prod = Number(r.kg) || 0;
    if (r.kg == null && !r.kgSis && !r.aMano) continue;
    r.fuera = sinSuma.has(r.k);
    out[r.sec].push(r); if (!r.fuera) out.tot[r.sec] += r.prod;
  }
  const orden = (a, b) => (a.fuera - b.fuera) || b.prod - a.prod || a.n.localeCompare(b.n, 'es');
  out.m.sort(orden); out.r.sort(orden);
  out.tot.m = r2(out.tot.m); out.tot.r = r2(out.tot.r);
  return out;
}

async function cargarPrevM(m) {
  const p = mesAnterior(m); S.menPrev = S.menPrev || {};
  if (S.menPrev[p] !== undefined) return;
  S.menPrev[p] = {};
  try { const d = await leerDoc('ddjj-' + p); S.menPrev[p] = (d.d && d.d.men) || {}; if (S.tab === 'men') render(); } catch (e) {}
}

function renderMen() {
  cargarPrevM(S.mes);
  const R = calcularM(S.mes), D = docM(), enCurso = S.mes >= mesHoy();
  let h = '<section><div class="dj-top" style="margin-bottom:8px"><div><h2>Menudencias y rendering · ' + esc(nombreMes(S.mes)) +
    (enCurso ? ' <span class="chip sm mut">mes en curso</span>' : '') + '</h2><p class="sub" style="margin:0">Kg producidos en el mes, para el resumen de SENASA. Tocá un número para corregirlo; tocá el nombre para ver de qué artículos sale; destildá un producto para dejarlo afuera de la suma.' +
    (D.por ? ' Último cambio: ' + esc(D.por) + ' ' + esc(horaDe(D.ts)) + '.' : '') + '</p></div>' +
    '<div class="row"><button onclick="verImpresionM()">👁 Ver cómo sale</button><button class="primary" onclick="imprimirM()">🖨 Imprimir</button><button onclick="excelMen()">⬇ Excel</button></div></div>';
  if (!(S.sis.me || []).length) h += '<div class="alerta warn">Todavía no llegaron del sistema los datos de menudencias y rendering de este mes. Tocá «Traer datos nuevos» arriba (tarda hasta 5 minutos).</div>';

  /* menudencias */
  h += '<h3 class="dj-h3">Menudencias</h3><div class="tw"><table class="planilla dj-tab"><thead><tr><th>Producto</th><th class="num">Kg</th></tr></thead><tbody>';
  for (const r of R.m) h += filaM(r, false);
  h += '<tr class="tot"><td>Total menudencias</td><td class="num">' + fmt2(R.tot.m) + '</td></tr></tbody></table></div>' +
    '<div class="row" style="margin-top:6px"><button class="small" onclick="agregarM(\'m\')">+ Agregar producto</button></div>';

  /* rendering */
  h += '<h3 class="dj-h3">Rendering</h3><div class="tw"><table class="planilla dj-tab"><thead><tr><th>Producto</th><th class="num">Cargado en el sistema</th><th class="num">Stock al principio</th><th class="num">Stock al final</th><th class="num">Producido</th></tr></thead><tbody>';
  for (const r of R.r) h += filaM(r, true);
  h += '<tr class="tot"><td>Total rendering</td><td></td><td></td><td></td><td class="num">' + fmt2(R.tot.r) + '</td></tr></tbody></table></div>' +
    '<div class="row" style="margin-top:6px"><button class="small" onclick="agregarM(\'r\')">+ Agregar producto</button></div>' +
    '<p class="muted" style="font-size:12.5px;margin-top:6px">El sebo se carga en el sistema recién cuando se vende. Por eso: <b>producido = cargado en el sistema + stock al final − stock al principio</b>. ' +
    'El stock se mide en planta y se carga acá; el del principio toma solo el del final del mes anterior.</p>';

  /* qué artículos entran */
  const nomD = {}; for (const d of Object.values(S.sis.dias || {})) d.re.forEach(r => { nomD[r.art] = r.den; });
  h += '<h3 class="dj-h3">Qué entra</h3><p class="sub" style="margin:0 0 4px">Entra todo lo que sale de menudencias y de rendering en el sistema, más estos artículos del desposte: ' +
    (eqM().desp || []).filter(a => nomD[a]).map(a => '<span class="dj-art">' + a + ' <small>' + esc(String(nomD[a]).toLowerCase()) + '</small></span>').join(' ') +
    ' <button class="small" onclick="eqDespM()">Cambiar</button></p>';
  if (R.fuera.length) h += '<p class="sub" style="margin:4px 0 0">No van: ' + R.fuera.map(z => '<span class="dj-art">' + z.art + ' <small>' + esc(String(z.den).toLowerCase()) + ' · ' + fmt0(z.kg) + ' kg</small> <a href="#" onclick="ignorarM(' + z.art + ',false);return false" title="Volver a ponerlo">↺</a></span>').join(' ') + '</p>';
  $('main').innerHTML = h + '</section>';
}

function filaM(r, rend) {
  const ab = S.abierto['m|' + r.k], ov = (docM().kg || {})[r.k] != null;
  const nombre = '<input type="checkbox" class="dj-chk" title="Destildá para dejarlo afuera de la suma"' + (r.fuera ? '' : ' checked') + ' onchange="tildarM(\'' + jsq(r.k) + '\',this.checked)"> <a href="#" class="dj-n" onclick="S.abierto[\'m|' + jsq(r.k) + '\']=!S.abierto[\'m|' + jsq(r.k) + '\'];render();return false">' + (ab ? '▾ ' : '▸ ') + esc(r.n) + '</a>' + (r.aMano ? ' <span class="chip sm info">a mano</span>' : '');
  const ckg = '<td class="num ed' + (ov ? ' aj' : '') + '" onclick="editarM(\'' + jsq(r.k) + '\')">' + fmt2(r.kg) + (ov && !r.aMano ? '<span class="dj-sis">' + fmt2(r.kgSis) + '</span>' : '') + '</td>';
  let h = '<tr' + (r.fuera ? ' class="dj-off" title="Afuera de la suma"' : '') + '><td>' + nombre + '</td>' + ckg;
  if (rend) {
    h += '<td class="num ed" onclick="editarStockM(\'' + jsq(r.k) + '\',\'ini\')">' + (r.ini == null ? '<span class="muted">' + (r.sebo ? 'cargar' : '—') + '</span>' : fmt2(r.ini) + (r.iniPrev ? '<span class="dj-sis" style="text-decoration:none">del mes anterior</span>' : '')) + '</td>' +
      '<td class="num ed" onclick="editarStockM(\'' + jsq(r.k) + '\',\'fin\')">' + (r.fin == null ? '<span class="muted">' + (r.sebo ? 'cargar' : '—') + '</span>' : fmt2(r.fin)) + '</td>' +
      '<td class="num"><b>' + fmt2(r.prod) + '</b></td>';
  }
  h += '</tr>';
  if (ab) {
    const arts = Object.values(r.arts);
    h += '<tr class="dj-det"><td colspan="' + (rend ? 5 : 2) + '">' + (arts.length ? '<table class="dj-mini"><tbody>' + arts.map(a =>
      '<tr><td>' + a.art + ' · ' + esc(a.den) + '</td><td class="muted">' + a.origen + '</td><td class="num">' + fmt2(a.kg) + ' kg</td><td><button class="small" onclick="ignorarM(' + a.art + ',true)">No va</button></td></tr>').join('') + '</tbody></table>'
      : '<span class="muted">Cargado a mano.</span> <button class="small" onclick="quitarM(\'' + jsq(r.k) + '\')">Sacar</button>') + '</td></tr>';
  }
  return h;
}

async function cambiarMen(fn, desc) {
  const m = S.mes;
  try {
    S.doc = await cambiarDoc('ddjj-' + m, d => {
      const x = d.men = d.men || {}; x.kg = x.kg || {}; x.stock = x.stock || {};
      fn(x); x.por = quien(); x.ts = new Date().toISOString();
    }, 'Menudencias y rendering ' + m + ': ' + desc);
    render();
  } catch (e) { toast(e.message, true); }
}
function filaDeM(k) { const R = calcularM(S.mes); return R.m.concat(R.r).find(r => r.k === k); }
function editarM(k) {
  const r = filaDeM(k); if (!r) return;
  const ov = (docM().kg || {})[k] != null;
  const ayuda = r.aMano ? 'Producto cargado a mano.' : 'Según el sistema: <b>' + fmt2(r.kgSis) + ' kg</b>.' + (ov ? ' <a href="#" onclick="cerrarDlg();cambiarMen(x=>{delete x.kg[\'' + jsq(k) + '\']},\'' + jsq(r.n) + ' vuelve al sistema\');return false">Volver a lo del sistema</a>' : '');
  pedir(r.n + ' · kg', r.kg == null ? '' : fmtE(r.kg), ayuda, v => cambiarMen(x => { x.kg[k] = v; }, r.n + ' = ' + v + ' kg'), 'num');
}
function editarStockM(k, q) {
  const r = filaDeM(k); if (!r) return;
  const s = (docM().stock || {})[k] || {}, cur = q === 'ini' ? r.ini : r.fin;
  const ayuda = (q === 'ini' ? 'Kg en stock el primer día del mes.' + (r.iniPrev ? ' Ahora toma el stock al final del mes anterior.' : '') : 'Kg en stock el último día del mes (medido en planta).') +
    (s[q] != null ? ' <a href="#" onclick="cerrarDlg();cambiarMen(x=>{const o=x.stock[\'' + jsq(k) + '\'];if(o)delete o.' + q + '},\'' + jsq(r.n) + ' stock borrado\');return false">Borrar</a>' : '');
  pedir(r.n + ' · stock ' + (q === 'ini' ? 'al principio' : 'al final'), cur == null ? '' : fmtE(cur), ayuda,
    v => cambiarMen(x => { (x.stock[k] = x.stock[k] || {})[q] = v; }, r.n + ' stock ' + (q === 'ini' ? 'al principio' : 'al final') + ' = ' + v), 'num');
}
function agregarM(sec) {
  pedir('Producto nuevo · ' + SEC_M[sec], '', 'Nombre del producto. Después tocá los kg para cargarlos.', v => {
    v = String(v || '').trim(); if (!v) return;
    const n = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
    cambiarMen(x => { x.kg[sec + '|' + n] = 0; }, 'agrega ' + n);
  }, 'txt');
}
function quitarM(k) { cambiarMen(x => { delete x.kg[k]; if (x.stock) delete x.stock[k]; }, 'saca ' + k.split('|')[1]); }
/* tildado = suma; destildado = queda afuera de la suma (y de la hoja impresa) en todos los meses, hasta que se vuelva a tildar */
function tildarM(k, si) {
  cambiarEq(d => {
    d.men = d.men || JSON.parse(JSON.stringify(MEN_DEF));
    const l = new Set(d.men.sinSuma || []); si ? l.delete(k) : l.add(k); d.men.sinSuma = [...l];
  }, 'menudencias/rendering: ' + k.split('|')[1] + (si ? ' vuelve a la suma' : ' afuera de la suma'));
}
function ignorarM(art, si) {
  cambiarEq(d => {
    d.men = d.men || JSON.parse(JSON.stringify(MEN_DEF));
    const l = new Set(d.men.ignorar || []); si ? l.add(art) : l.delete(art); d.men.ignorar = [...l];
  }, 'menudencias/rendering: artículo ' + art + (si ? ' no va' : ' vuelve a ir'));
}
function eqDespM() {
  pedir('Artículos del desposte que son menudencia', (eqM().desp || []).join(', '), 'Códigos de artículo separados por coma (cabeza, oreja, recorte de cabeza…).',
    v => cambiarEq(d => { d.men = d.men || JSON.parse(JSON.stringify(MEN_DEF)); d.men.desp = listaNum(v); }, 'menudencias del desposte = ' + v), 'txt');
}

/* ---------- impresión (una hoja A4) y Excel ---------- */
function hojaM() {
  const R = calcularM(S.mes), fin = diasDelMes(S.mes).pop();
  let h = '<div class="hoja hm"><div class="h3-cab"><img src="/logo.png" alt=""><div><div class="h3-t">FRIGORÍFICO QUALITÁ S.A.</div><div class="h3-s">Colonia Caroya · Córdoba</div></div></div>' +
    '<div class="h3-c b">RESUMEN MENSUAL DE PRODUCCIÓN DE MENUDENCIAS Y RENDERING</div><div class="h3-c">Período: ' + esc(nombreMes(S.mes)) + ' (del 01/' + S.mes.slice(5, 7) + ' al ' + ddmmaaaa(fin) + ')</div>';
  h += '<table class="hm-tab"><tr class="th"><td>MENUDENCIAS</td><td>KG</td></tr>' + R.m.filter(r => !r.fuera).map(r => '<tr><td class="n">' + esc(r.n) + '</td><td>' + fmt2(r.prod) + '</td></tr>').join('') +
    '<tr class="tt"><td class="n">TOTAL MENUDENCIAS</td><td>' + fmt2(R.tot.m) + '</td></tr></table>';
  h += '<table class="hm-tab"><tr class="th"><td>RENDERING</td><td>KG</td></tr>' + R.r.filter(r => !r.fuera).map(r => '<tr><td class="n">' + esc(r.n) + '</td><td>' + fmt2(r.prod) + '</td></tr>').join('') +
    '<tr class="tt"><td class="n">TOTAL RENDERING</td><td>' + fmt2(R.tot.r) + '</td></tr></table>';
  h += '<div class="h3-firma" style="margin-top:70pt">……………………………………………<br>Firma y aclaración</div></div>';
  return h;
}
function imprimirM() { $('impresion').innerHTML = hojaM(); window.print(); }
function verImpresionM() {
  const w = window.open('', '_blank');
  if (!w) { toast('El navegador bloqueó la ventana. Usá Imprimir directamente.', true); return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Menudencias y rendering ' + S.mes + '</title><link rel="stylesheet" href="' + location.origin + '/ddjj.css"></head><body class="vista vista-m">' + hojaM() + '</body></html>');
  w.document.close();
}
function excelMen() {
  if (!window.XLSX) { toast('No se pudo cargar el Excel. Revisá internet.', true); return; }
  const R = calcularM(S.mes), filas = [['Resumen de menudencias y rendering · ' + nombreMes(S.mes)], [], ['MENUDENCIAS', 'Kg']];
  R.m.filter(r => !r.fuera).forEach(r => filas.push([r.n, r.prod])); filas.push(['Total menudencias', R.tot.m], [], ['RENDERING', 'Cargado en el sistema', 'Stock al principio', 'Stock al final', 'Producido']);
  R.r.filter(r => !r.fuera).forEach(r => filas.push([r.n, Number(r.kg) || 0, r.ini == null ? '' : r.ini, r.fin == null ? '' : r.fin, r.prod])); filas.push(['Total rendering', '', '', '', R.tot.r]);
  const ws = XLSX.utils.aoa_to_sheet(filas), wb = XLSX.utils.book_new();
  ws['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'SENASA');
  XLSX.writeFile(wb, 'Menudencias y rendering ' + S.mes + '.xlsx');
}
