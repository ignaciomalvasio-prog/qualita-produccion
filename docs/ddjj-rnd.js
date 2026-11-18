/* DDJJ de producción de Rendering · pestaña "Rendering" de /ddjj (pedido de Sabi 18/11: igual a la de chacinados, solo lo producido, Establecimiento 4886)
   - Datos: renglones ME de tipo de ciclo 6 (rendering) de c3sis/dj-AAAA-MM (los mismos del resumen mensual de menudencias y rendering).
   - Qué artículo va en cada producto: eq().rd.lineas (códigos fijos y, si un artículo no tiene código, se reconoce por el nombre: "HARINA", "SEBO"…).
   - Lo corregido a mano: c3docs/ddjj-AAAA-MM → rd[fecha] = { prod: {producto: {kg, marca, dest, quitar}}, mover: {art: 'L:producto'|'I'}, lote, obs, impreso, por, ts }
   - Imprimir: la misma hoja que chacinados (encabezado, tabla de 9 renglones, total y firma) con "Producción Rendering". */
'use strict';

const RD_DEF = {
  estab: '4886',
  marca: 'QUALITA',
  lineas: [
    { n: 'HARINA DE CARNE Y HUESO PORCINA', arts: [], pat: 'HARINA' },
    { n: 'GRASA PORCINA (SEBO)', arts: [], pat: 'SEBO|GRASA' }
  ],
  ignorar: []
};
/* días con producción de rendering, armados de los renglones ME de tipo 6 (se guarda mientras no cambien los datos) */
let _rdCache = null, _rdDe = null;
function sisRd() {
  if (_rdDe === S.sis && _rdCache) return _rdCache;
  const o = {};
  for (const m of (S.sis && S.sis.me) || []) if (m.ticd === 6) (o[m.f] = o[m.f] || { re: [], in: [] }).re.push({ art: m.art, den: m.den, uni: m.uni, kg: m.kg });
  _rdDe = S.sis; _rdCache = o; return o;
}
const eqRd = () => (eq().rd || RD_DEF);
const diaRd = f => ((S.doc && S.doc.rd) || {})[f] || {};

/* producto al que va un artículo de Ciclo III el día f ('#I' = no va, null = sin asignar) */
function destinoRd(art, den, f) {
  const mv = (diaRd(f).mover || {})[art];
  if (mv) return mv === 'I' ? '#I' : mv.slice(2);
  const E = eqRd();
  if ((E.ignorar || []).includes(art)) return '#I';
  const l = E.lineas.find(z => (z.arts || []).includes(art));
  if (l) return l.n;
  const d = String(den || '').toUpperCase();
  const p = E.lineas.find(z => z.pat && new RegExp(z.pat).test(d));
  return p ? p.n : null;
}

function calcularRd(f) {
  const d = (S.sis && sisRd()[f]) || { re: [], in: [] };
  const E = eqRd(), prod = {};
  const nombres = E.lineas.map(l => l.n);
  for (const v of Object.values(diaRd(f).mover || {})) if (v.startsWith('L:') && !nombres.includes(v.slice(2))) nombres.push(v.slice(2));
  for (const n of nombres) {
    const re = d.re.filter(r => destinoRd(r.art, r.den, f) === n);
    if (!re.length) continue;
    const bruto = re.reduce((a, r) => a + r.kg, 0);
    let ing = [];
    if (bruto - ing.reduce((a, r) => a + r.kg, 0) <= 0) ing = [];
    prod[n] = { n, kg: r2(bruto - ing.reduce((a, r) => a + r.kg, 0)), marca: E.marca || 'QUALITA', dest: '', re, ing };
  }
  const nuevos = d.re.filter(r => destinoRd(r.art, r.den, f) === null);
  return { prod, nuevos, d, orden: nombres };
}
function planillaRd(f) {
  const c = calcularRd(f), x = diaRd(f), ov = x.prod || {}, filas = [];
  const nombres = c.orden.concat(Object.keys(ov).filter(n => !c.orden.includes(n)));
  for (const n of nombres) {
    const s = c.prod[n], o = ov[n] || {};
    if (!s && !Object.keys(o).length) continue;
    if (o.quitar) continue;
    const base = s || { n, kg: null, marca: eqRd().marca || 'QUALITA', dest: '', re: [], ing: [] };
    const v = k => (o[k] !== undefined ? o[k] : base[k]);
    filas.push({ n, kg: v('kg'), marca: v('marca'), dest: v('dest'), sis: base, ov: o, manual: !s });
  }
  const tot = r2(filas.reduce((a, r) => a + (Number(r.kg) || 0), 0));
  const lote = x.lote != null ? x.lote : f.slice(8, 10) + f.slice(5, 7) + f.slice(2, 4);
  return { c, filas, tot, lote, x };
}

function chipDiaRd(f) {
  const x = diaRd(f);
  if (x.impreso) return '<span class="chip ok sm">impresa</span>';
  if (x.por) return '<span class="chip info sm">revisada</span>';
  return '<span class="chip mut sm">sin hacer</span>';
}

function renderRd() {
  const dias = Object.keys(sisRd()).sort();
  if (!S.fechaRd || !sisRd()[S.fechaRd]) {
    const pend = dias.filter(f => f < hoyIso() && !diaRd(f).impreso);
    S.fechaRd = pend.length ? pend[pend.length - 1] : (dias[dias.length - 1] || '');
  }
  let h = '<div class="dj-wrap"><aside class="dj-dias"><div class="dj-dias-t">Días con producción</div>';
  if (!dias.length) h += '<p class="muted" style="padding:8px">No hay producción de rendering cargada en ' + esc(nombreMes(S.mes)) + '.</p>';
  h += dias.slice().reverse().map(f => '<a href="#" class="dj-dia' + (f === S.fechaRd ? ' on' : '') + '" onclick="irDiaRd(\'' + f + '\');return false"><b>' + DIAS3[diaSem(f)] + ' ' + ddmm(f) + '</b>' + chipDiaRd(f) + '</a>').join('');
  h += '</aside><div class="dj-cont">';
  if (!S.fechaRd) { $('main').innerHTML = h + '<section><p class="muted">Elegí un día.</p></section></div></div>'; return; }
  const f = S.fechaRd, P = planillaRd(f), x = P.x;
  h += '<section class="dj-top"><div><h2>Rendering · ' + esc(fechaLarga(f)) + '</h2><p class="sub" style="margin:0">' + fmt2(P.tot) + ' kg producidos · Lote <a href="#" onclick="editarLoteRd();return false"><b>' + esc(P.lote) + '</b></a>' +
    (x.por ? ' · último cambio: ' + esc(x.por) + ' ' + esc(horaDe(x.ts)) : '') + (x.impreso ? ' · impresa ' + esc(horaDe(x.impreso)) : '') + '</p></div>' +
    '<div class="row"><button onclick="verImpresionRd()">👁 Ver cómo sale</button><button onclick="excelRd(false)" title="La DDJJ de este día en Excel">⬇ Excel del día</button><button onclick="excelRd(true)" title="Una hoja por cada día con producción del mes">⬇ Excel del mes</button><button class="primary big" onclick="imprimirRd()">🖨 Imprimir</button></div></section>';
  if (P.c.nuevos.length) {
    h += '<div class="alerta warn"><div><b>Hay productos del sistema que no se reconocen.</b> Decí a qué renglón van (queda guardado):<table class="dj-nuevos">' +
      P.c.nuevos.map(r => '<tr><td>' + r.art + ' · ' + esc(r.den) + '</td><td class="num">' + fmt2(r.kg) + ' kg</td><td>' + selectMoverRd(r.art, '', true) + '</td></tr>').join('') + '</table></div></div>';
  }
  h += '<section><h2>Producción de rendering</h2><p class="sub">Tocá un número o un texto para corregirlo. Tocá el nombre del producto para ver de qué artículos del sistema sale y mandar alguno a otro renglón.</p>';
  h += '<div class="tw"><table class="planilla dj-tab"><thead><tr><th>Nombre del producto</th><th>Marca</th><th class="num">Total de kg producidos</th><th>Observaciones / destino</th><th></th></tr></thead><tbody>';
  for (const r of P.filas) {
    const ab = S.abierto['rd|' + r.n];
    h += '<tr><td><a href="#" class="dj-n" onclick="S.abierto[\'rd|' + jsq(r.n) + '\']=!S.abierto[\'rd|' + jsq(r.n) + '\'];render();return false">' + (ab ? '▾ ' : '▸ ') + esc(r.n) + '</a>' + (r.manual ? ' <span class="chip sm info">agregado</span>' : '') + '</td>' +
      celdaRd(r, 'marca') + celdaRd(r, 'kg') + celdaRd(r, 'dest') +
      '<td><button class="small danger" title="Sacar este renglón" onclick="quitarRd(\'' + jsq(r.n) + '\')">✕</button></td></tr>';
    if (ab) h += '<tr class="dj-det"><td colspan="5">' + detalleRd(r) + '</td></tr>';
  }
  h += '<tr class="tot"><td>Total</td><td></td><td class="num">' + fmt2(P.tot) + ' kg</td><td colspan="2"></td></tr></tbody></table></div>';
  const quitados = Object.keys(x.prod || {}).filter(n => x.prod[n].quitar);
  h += '<div class="row" style="margin-top:10px"><select id="nuevaRd"><option value="">+ Agregar un renglón…</option>' +
    eqRd().lineas.map(l => l.n).filter(n => !P.filas.some(r => r.n === n)).map(n => '<option>' + esc(n) + '</option>').join('') + '<option value="*">Otro (escribir el nombre)</option></select><button class="small" onclick="agregarRd()">Agregar</button>' +
    (quitados.length ? '<span class="muted" style="font-size:13px">Sacados: ' + quitados.map(n => esc(n) + ' <a href="#" onclick="cambiarDiaRd(x=>{delete x.prod[\'' + jsq(n) + '\']},\'vuelve ' + jsq(n) + '\');return false">volver a poner</a>').join(' · ') + '</span>' : '') + '</div>';
  h += '</section></div></div>';
  $('main').innerHTML = h;
}
const NOMBRE_RD = { kg: 'Total de kilogramos producidos', marca: 'Marca', dest: 'Observaciones / destino' };
function celdaRd(r, k) {
  const aj = r.ov[k] !== undefined, sv = r.sis[k], f = k === 'kg' ? fmt2 : esc;
  return '<td class="ed' + (k === 'kg' ? ' num' : '') + (aj ? ' aj' : '') + '" onclick="editarRd(\'' + jsq(r.n) + '\',\'' + k + '\')">' + f(r[k] == null ? '' : r[k]) +
    (aj ? '<small class="dj-sis">' + (sv == null || sv === '' ? '—' : f(sv)) + '</small>' : '') + '</td>';
}
function detalleRd(r) {
  const s = r.sis;
  if (!s.re.length) return '<span class="muted">Renglón cargado a mano (no sale del sistema).</span>';
  const mv = diaRd(S.fechaRd).mover || {};
  let h = '<table class="dj-mini"><tr><th>Artículo del sistema</th><th class="num">Unid.</th><th class="num">Kg</th><th>Mandarlo a</th></tr>';
  h += s.re.map(x => '<tr><td>' + x.art + ' · ' + esc(x.den) + (mv[x.art] ? ' <span class="chip sm warn">movido solo este día</span> <a href="#" onclick="desmoverRd(' + x.art + ');return false">deshacer</a>' : '') +
    '</td><td class="num">' + fmt0(x.uni) + '</td><td class="num">' + fmt2(x.kg) + '</td><td>' + selectMoverRd(x.art, r.n) + '</td></tr>').join('');
  h += s.ing.map(x => '<tr class="neg"><td>− reingresó: ' + x.art + ' · ' + esc(x.den) + '</td><td class="num">' + fmt0(x.uni) + '</td><td class="num">−' + fmt2(x.kg) + '</td><td></td></tr>').join('');
  return h + '</table>';
}
function selectMoverRd(art, actual, nuevo) {
  return '<select class="dj-mover" onchange="moverArtRd(' + art + ',this.value,\'' + jsq(actual) + '\',' + (nuevo ? 1 : 0) + ')"><option value="">' + (actual ? esc(actual) + ' (está acá)' : 'Elegir…') + '</option>' +
    eqRd().lineas.filter(l => l.n !== actual).map(l => '<option value="L:' + esc(l.n) + '">' + esc(l.n) + '</option>').join('') + '<option value="I">No va en la declaración</option></select>';
}

function irDiaRd(f) { S.fechaRd = f; S.abierto = {}; render(); window.scrollTo(0, 0); }
async function cambiarDiaRd(fn, desc) {
  const f = S.fechaRd, m = f.slice(0, 7);
  try {
    S.doc = await cambiarDoc('ddjj-' + m, d => {
      d.rd = d.rd || {}; const x = d.rd[f] = d.rd[f] || {};
      x.prod = x.prod || {};
      fn(x); x.por = quien(); x.ts = new Date().toISOString();
    }, 'DDJJ Rendering ' + ddmm(f) + ': ' + desc);
    render();
  } catch (e) { toast(e.message, true); }
}
function editarRd(n, k) {
  const r = planillaRd(S.fechaRd).filas.find(z => z.n === n); if (!r) return;
  const esNum = k === 'kg', sv = r.sis[k];
  const ayuda = (r.manual ? '' : 'Según el sistema: <b>' + (sv == null ? 'vacío' : esNum ? fmt2(sv) : esc(sv)) + '</b>.') +
    (r.ov[k] !== undefined ? ' <a href="#" onclick="cerrarDlg();cambiarDiaRd(x=>{delete x.prod[\'' + jsq(n) + '\'].' + k + '},\'' + jsq(n) + ' vuelve al sistema\');return false">Volver a lo del sistema</a>' : '');
  pedir(n + ' · ' + NOMBRE_RD[k], r[k] == null ? '' : (esNum ? fmtE(r[k]) : r[k]), ayuda, v => cambiarDiaRd(x => {
    const o = x.prod[n] = x.prod[n] || {};
    o[k] = esNum ? v : String(v).trim().toUpperCase();
  }, n + ' ' + NOMBRE_RD[k] + ' = ' + v), esNum ? 'num' : 'txt');
}
function editarLoteRd() {
  const P = planillaRd(S.fechaRd);
  pedir('Número de lote', P.lote, 'Por defecto es la fecha (ddmmaa).', v => cambiarDiaRd(x => { x.lote = String(v).trim(); }, 'lote = ' + v), 'txt');
}
function quitarRd(n) { cambiarDiaRd(x => { x.prod[n] = { quitar: true }; }, 'saca ' + n); }
function agregarRd() {
  const v = $('nuevaRd').value; if (!v) return;
  const alta = n => cambiarDiaRd(x => { x.prod[n] = { kg: 0 }; }, 'agrega ' + n);
  if (v === '*') pedir('Nombre del producto', '', 'Como tiene que salir en la planilla.', n => { n = String(n || '').trim().toUpperCase(); if (n) alta(n); }, 'txt');
  else alta(v);
}
function moverArtRd(art, v, actual, nuevo) {
  if (!v) return;
  const nom = v === 'I' ? 'que no vaya en la declaración' : v.slice(2);
  $('dlg-h').textContent = 'Mandar el artículo ' + art + ' a ' + nom;
  $('dlg-b').innerHTML = '<p class="sub">¿Solo para el ' + esc(fechaLarga(S.fechaRd)) + ', o para siempre?</p>';
  $('dlg-f').innerHTML = '<button onclick="cerrarDlg();render()">Cancelar</button><button id="mv-dia">Solo este día</button><button class="primary" id="mv-siempre">Siempre</button>';
  $('mv-dia').onclick = () => { cerrarDlg(); cambiarDiaRd(x => { x.mover = x.mover || {}; x.mover[art] = v; }, 'artículo ' + art + (actual ? ' de ' + actual : '') + ' a ' + nom + ' (solo este día)'); };
  $('mv-siempre').onclick = () => { cerrarDlg(); asignarRd(art, v); };
  $('dlg').showModal();
}
function desmoverRd(art) { cambiarDiaRd(x => { if (x.mover) delete x.mover[art]; }, 'artículo ' + art + ' vuelve a su renglón'); }
function asignarRd(art, v) {
  cambiarEq(d => {
    d.rd = d.rd || JSON.parse(JSON.stringify(RD_DEF));
    d.rd.lineas.forEach(l => { l.arts = (l.arts || []).filter(a => a !== art); });
    d.rd.ignorar = (d.rd.ignorar || []).filter(a => a !== art);
    if (v === 'I') d.rd.ignorar.push(art);
    else { const l = d.rd.lineas.find(z => z.n === v.slice(2)); if (l) l.arts.push(art); }
  }, 'Rendering artículo ' + art + ' → ' + (v === 'I' ? 'no va' : v.slice(2)));
}

/* Equivalencias de Ciclo III (se agregan al final de la pestaña Equivalencias) */
function equivRd() {
  const E = eqRd(), nom = {};
  for (const d of Object.values(sisRd())) d.re.forEach(r => { nom[r.art] = r.den; });
  const autom = n => Object.keys(nom).map(Number).filter(a => !(E.lineas.some(l => (l.arts || []).includes(a))) && !(E.ignorar || []).includes(a) && destinoRd(a, nom[a], '0000-00-00') === n);
  const chip = (a, extra) => '<span class="dj-art">' + a + (nom[a] ? ' <small>' + esc(nom[a].toLowerCase()) + '</small>' : '') + (extra || '') + '</span>';
  let h = '<section><h2>Equivalencias de rendering</h2><p class="sub">Qué artículos del sistema van en cada producto de la DDJJ de rendering. Los que no tienen código asignado se reconocen por el nombre (los marcados "por nombre").</p>';
  h += '<div class="tw"><table class="planilla dj-eq"><thead><tr><th>Producto</th><th>Artículos del sistema</th><th></th></tr></thead><tbody>';
  E.lineas.forEach((l, i) => {
    h += '<tr><td><b>' + esc(l.n) + '</b></td><td>' + (l.arts || []).map(a => chip(a)).join(' ') + autom(l.n).map(a => chip(a, ' <small>(por nombre)</small>')).join(' ') +
      ' <button class="small" onclick="eqArtsRd(' + i + ')">Cambiar</button></td><td><button class="small danger" onclick="if(confirm(\'¿Sacar ' + jsq(l.n) + '?\'))cambiarEq(d=>{d.rd=d.rd||JSON.parse(JSON.stringify(RD_DEF));d.rd.lineas.splice(' + i + ',1)},\'Rendering saca ' + jsq(l.n) + '\')">✕</button></td></tr>';
  });
  h += '<tr><td colspan="3"><button class="small" onclick="eqNuevaRd()">+ Producto nuevo</button></td></tr></tbody></table></div>';
  h += '<h3 class="dj-h3">No van en la declaración</h3><p>' + ((E.ignorar || []).map(a => chip(a)).join(' ') || '<span class="muted">ninguno</span>') + '</p>';
  h += '<p>Establecimiento N.º Oficial: <input class="w-cp" value="' + esc(E.estab || '') + '" onchange="cambiarEq(d=>{d.rd=d.rd||JSON.parse(JSON.stringify(RD_DEF));d.rd.estab=this.value.trim()},\'Rendering establecimiento\')"></p></section>';
  return h;
}
function eqArtsRd(i) {
  const l = eqRd().lineas[i];
  pedir(l.n + ' · artículos del sistema', (l.arts || []).join(', '), 'Códigos de artículo separados por coma (además se suman los que se reconocen por el nombre).', v => cambiarEq(d => {
    d.rd = d.rd || JSON.parse(JSON.stringify(RD_DEF));
    const arts = listaNum(v);
    d.rd.lineas.forEach(z => { z.arts = (z.arts || []).filter(a => !arts.includes(a)); });
    d.rd.ignorar = (d.rd.ignorar || []).filter(a => !arts.includes(a));
    d.rd.lineas[i].arts = arts;
  }, 'Rendering ' + l.n + ' = ' + v), 'txt');
}
function eqNuevaRd() { pedir('Producto nuevo', '', 'Nombre como tiene que salir en la planilla.', v => { v = String(v || '').trim().toUpperCase(); if (v) cambiarEq(d => { d.rd = d.rd || JSON.parse(JSON.stringify(RD_DEF)); d.rd.lineas.push({ n: v, arts: [] }); }, 'Rendering producto nuevo ' + v); }, 'txt'); }

/* ---------- impresión: la hoja completa, igual al Word ---------- */
function hojaRd(f) {
  const P = planillaRd(f), E = eqRd(), filas = P.filas.slice();
  const N = Math.max(9, filas.length);
  let h = '<div class="hoja h3"><div class="h3-cab"><img src="/logo.png" alt=""><div><div class="h3-t">Frigorífico Qualita S.A</div><div class="h3-s">Ruta Nacional N.º 9 Norte / Km. 745 Colonia Caroya / Córdoba / Argentina</div><div class="h3-s">&nbsp;Establecimiento N.º Oficial ' + esc(E.estab || '') + '</div></div></div>' +
    '<div class="h3-c b">Producción Rendering FRIGORIFICO QUALITA S.A.</div><div class="h3-c">DECLARACIÓN JURADA</div>' +
    '<div class="h3-leg">La presente planilla reviste el carácter de <b>Declaración Jurada</b> y está sujeta al Artículo 293 Primera Parte del Código Penal.</div>' +
    '<div class="h3-f"><span>Fecha:' + f.slice(8, 10) + '.' + f.slice(5, 7) + '.' + f.slice(0, 4) + '</span><span>N.º de Lote: ' + esc(P.lote) + '</span></div>' +
    '<table class="h3-tab"><colgroup><col style="width:25.4%"><col style="width:19.8%"><col style="width:25.6%"><col style="width:29.2%"></colgroup>' +
    '<tr class="th"><td>NOMBRE DEL PRODUCTO</td><td>MARCA</td><td>TOTAL DE KILOGRAMOS PRODUCIDOS</td><td>OBSERVACIONES/ DESTINO</td></tr>';
  for (let i = 0; i < N; i++) {
    const r = filas[i];
    h += '<tr class="fi">' + (r ? '<td>' + esc(r.n) + '</td><td>' + esc(r.marca || '') + '</td><td>' + (r.kg != null ? fmtP(r.kg) : '') + '</td><td>' + esc(r.dest || '') + '</td>' : '<td></td><td></td><td></td><td></td>') + '</tr>';
  }
  h += '<tr class="tt"><td>TOTAL</td><td></td><td>' + fmtP(P.tot) + ' Kg</td><td></td></tr></table>' +
    '<div class="h3-firma">..........................................................................................................<br>Firma del responsable de la Empresa</div></div>';
  return h;
}
function imprimirRd() {
  const f = S.fechaRd; if (!f) return;
  $('impresion').innerHTML = hojaRd(f);
  window.print();
  cambiarDiaRd(x => { x.impreso = new Date().toISOString(); }, 'impresa');
}
function verImpresionRd() {
  const w = window.open('', '_blank');
  if (!w) { toast('El navegador bloqueó la ventana. Usá Imprimir directamente.', true); return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>DDJJ Rendering ' + ddmm(S.fechaRd) + '</title><base href="' + location.origin + '/"><link rel="stylesheet" href="' + location.origin + '/ddjj.css"></head><body class="vista">' +
    '<div class="vista-bar">Así sale impresa la DDJJ de rendering del ' + esc(fechaLarga(S.fechaRd)) + '.</div>' + hojaRd(S.fechaRd) + '</body></html>');
  w.document.close();
}

/* ---------- Excel (con formato, como la hoja impresa; ddjj-xlsx.js) — del día o del mes (una hoja por día) ----------
   Lo usan Rendering y Chacinados (Sabi 18/11). o = { dias, planilla(f), estab, km, titulo, hoja, nombre } */
function excelHojaDJ(o) {
  if (!o.dias.length || !o.dias[0]) { toast('No hay días con producción.', true); return; }
  const L = XL.libro(), T = 'thin', bd = { l: T, r: T, t: T, b: T };
  const tit = { sz: 14, b: 1, h: 'center', v: 'center' }, cab = { sz: 11, b: 1, h: 'center', v: 'center', wrap: 1, bd }, cel = { sz: 11, v: 'center', bd };
  for (const f of o.dias) {
    const P = o.planilla(f), h = L.hoja(o.dias.length > 1 ? ddmm(f).replace('/', '-') : o.hoja, {
      anchos: { A: 2, B: 38, C: 16, D: 22, E: 34 }, altos: { 1: 20, 2: 14, 3: 14, 5: 20, 6: 18, 7: 30, 9: 16, 11: 36 }, ajustar: true, margenes: { l: 0.6, r: 0.6, t: 0.7, b: 0.7 } });
    h.set('B1', 'Frigorífico Qualita S.A', { sz: 16, b: 1 }).set('B2', 'Ruta Nacional N.º 9 Norte / Km. ' + o.km + ' Colonia Caroya / Córdoba / Argentina', { sz: 9 }).set('B3', 'Establecimiento N.º Oficial ' + (o.estab || ''), { sz: 9 });
    h.set('B5', o.titulo, tit).merge('B5:E5').set('B6', 'DECLARACIÓN JURADA', tit).merge('B6:E6');
    h.set('B7', 'La presente planilla reviste el carácter de Declaración Jurada y está sujeta al Artículo 293 Primera Parte del Código Penal.', { sz: 9, h: 'center', v: 'center', wrap: 1 }).merge('B7:E7');
    h.set('B9', 'Fecha: ' + f.slice(8, 10) + '.' + f.slice(5, 7) + '.' + f.slice(0, 4), { sz: 11, b: 1 }).set('E9', 'N.º de Lote: ' + P.lote, { sz: 11, b: 1, h: 'right' });
    ['NOMBRE DEL PRODUCTO', 'MARCA', 'TOTAL DE KILOGRAMOS PRODUCIDOS', 'OBSERVACIONES / DESTINO'].forEach((t, i) => h.set('BCDE'[i] + '11', t, cab));
    const N = Math.max(9, P.filas.length);
    for (let i = 0; i < N; i++) {
      const r = P.filas[i], fila = 12 + i; h.op.altos[fila] = 22;
      h.set('B' + fila, r ? r.n : null, cel).set('C' + fila, r ? (r.marca || '') : null, Object.assign({ h: 'center' }, cel))
        .set('D' + fila, r && r.kg != null && r.kg !== '' ? Number(r.kg) : null, Object.assign({ h: 'center', fmt: '0.00' }, cel)).set('E' + fila, r ? (r.dest || '') : null, Object.assign({ h: 'center' }, cel));
    }
    const ft = 12 + N; h.op.altos[ft] = 24;
    h.set('B' + ft, 'TOTAL', Object.assign({ b: 1 }, cel)).set('C' + ft, null, cel).set('D' + ft, { f: 'SUM(D12:D' + (ft - 1) + ')', v: P.tot }, Object.assign({ b: 1, h: 'center', fmt: '0.00' }, cel)).set('E' + ft, null, cel);
    h.set('B' + (ft + 5), '.......................................................................', { sz: 11, h: 'center' }).merge('B' + (ft + 5) + ':E' + (ft + 5));
    h.set('B' + (ft + 6), 'Firma del responsable de la Empresa', { sz: 11, h: 'center' }).merge('B' + (ft + 6) + ':E' + (ft + 6));
  }
  guardarBytes(L.bytes(), o.nombre);
}
function excelRd(mes) {
  const dias = mes ? Object.keys(sisRd()).filter(f => f.slice(0, 7) === S.mes).sort() : [S.fechaRd];
  excelHojaDJ({ dias, planilla: planillaRd, estab: eqRd().estab, km: '745', titulo: 'Producción Rendering FRIGORIFICO QUALITA S.A.', hoja: 'RENDERING',
    nombre: mes ? 'DDJJ rendering ' + nombreMes(S.mes) + '.xlsx' : 'DDJJ rendering ' + ddmmaaaa(S.fechaRd).replace(/\//g, '-') + '.xlsx' });
}
function excel3(mes) {
  const dias = mes ? Object.keys(S.sis.c3).filter(f => f.slice(0, 7) === S.mes).sort() : [S.fecha3];
  excelHojaDJ({ dias, planilla: planilla3, estab: eq3().estab, km: '748', titulo: 'Producción Fábrica de Chacinados FRIGORIFICO QUALITA S.A.', hoja: 'CHACINADOS',
    nombre: mes ? 'DDJJ chacinados ' + nombreMes(S.mes) + '.xlsx' : 'DDJJ chacinados ' + ddmmaaaa(S.fecha3).replace(/\//g, '-') + '.xlsx' });
}
