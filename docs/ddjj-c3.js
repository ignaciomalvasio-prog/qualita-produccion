/* DDJJ de producción de Ciclo III (embutidos) · pestaña "Ciclo III" de /ddjj
   - Datos: renglones C3 (lo que sale) y C3I (lo que entra) de c3sis/dj-AAAA-MM: desposte con tipo de ciclo 4.
   - Qué artículo va en cada producto: eq().c3.lineas (códigos fijos y, si un artículo no tiene código asignado,
     se reconoce por el nombre: "BOMBON", "SALCHICHA", etc.).
   - Lo corregido a mano: c3docs/ddjj-AAAA-MM → c3[fecha] = { prod: {producto: {kg, marca, dest, quitar}}, mover: {art: 'L:producto'|'I'}, lote, obs, impreso, por, ts }
   - Imprimir: hoja A4 completa igual al Word que se usaba (encabezado, tabla de 9 renglones, total y firma). */
'use strict';

const C3_DEF = {
  estab: '5036',
  marca: 'QUALITA',
  restar: false,   // a cada producto restarle lo que de ese producto reingresó (reproceso)
  lineas: [
    { n: 'CHORIZO FRESCO DE CERDO', arts: [], pat: 'CHORIZO(?!.*BOMB)' },
    { n: 'CHORIZO FRESCO DE CERDO TIPO BOMBÓN', arts: [], pat: 'CHORIZO.*BOMB' },
    { n: 'MORCILLA', arts: [], pat: 'MORCILLA(?!.*BOMB)' },
    { n: 'MORCILLA TIPO BOMBÓN', arts: [], pat: 'MORCILLA.*BOMB' },
    { n: 'SALCHICHA FRESCA DE CERDO', arts: [], pat: 'SALCHICHA' }
  ],
  ignorar: []
};
const eq3 = () => (eq().c3 || C3_DEF);
const dia3 = f => ((S.doc && S.doc.c3) || {})[f] || {};

/* producto al que va un artículo de Ciclo III el día f ('#I' = no va, null = sin asignar) */
function destino3(art, den, f) {
  const mv = (dia3(f).mover || {})[art];
  if (mv) return mv === 'I' ? '#I' : mv.slice(2);
  const E = eq3();
  if ((E.ignorar || []).includes(art)) return '#I';
  const l = E.lineas.find(z => (z.arts || []).includes(art));
  if (l) return l.n;
  const d = String(den || '').toUpperCase();
  const p = E.lineas.find(z => z.pat && new RegExp(z.pat).test(d));
  return p ? p.n : null;
}

function calcular3(f) {
  const d = (S.sis && S.sis.c3[f]) || { re: [], in: [] };
  const E = eq3(), prod = {};
  const nombres = E.lineas.map(l => l.n);
  for (const v of Object.values(dia3(f).mover || {})) if (v.startsWith('L:') && !nombres.includes(v.slice(2))) nombres.push(v.slice(2));
  for (const n of nombres) {
    const re = d.re.filter(r => destino3(r.art, r.den, f) === n);
    if (!re.length) continue;
    const bruto = re.reduce((a, r) => a + r.kg, 0);
    let ing = E.restar ? d.in.filter(r => destino3(r.art, r.den, f) === n) : [];
    if (bruto - ing.reduce((a, r) => a + r.kg, 0) <= 0) ing = [];
    prod[n] = { n, kg: r2(bruto - ing.reduce((a, r) => a + r.kg, 0)), marca: E.marca || 'QUALITA', dest: 'CONSUMO', re, ing };
  }
  const nuevos = d.re.filter(r => destino3(r.art, r.den, f) === null);
  return { prod, nuevos, d, orden: nombres };
}
function planilla3(f) {
  const c = calcular3(f), x = dia3(f), ov = x.prod || {}, filas = [];
  const nombres = c.orden.concat(Object.keys(ov).filter(n => !c.orden.includes(n)));
  for (const n of nombres) {
    const s = c.prod[n], o = ov[n] || {};
    if (!s && !Object.keys(o).length) continue;
    if (o.quitar) continue;
    const base = s || { n, kg: null, marca: eq3().marca || 'QUALITA', dest: 'CONSUMO', re: [], ing: [] };
    const v = k => (o[k] !== undefined ? o[k] : base[k]);
    filas.push({ n, kg: v('kg'), marca: v('marca'), dest: v('dest'), sis: base, ov: o, manual: !s });
  }
  const tot = r2(filas.reduce((a, r) => a + (Number(r.kg) || 0), 0));
  const lote = x.lote != null ? x.lote : f.slice(8, 10) + f.slice(5, 7) + f.slice(2, 4);
  return { c, filas, tot, lote, x };
}

function chipDia3(f) {
  const x = dia3(f);
  if (x.impreso) return '<span class="chip ok sm">impresa</span>';
  if (x.por) return '<span class="chip info sm">revisada</span>';
  return '<span class="chip mut sm">sin hacer</span>';
}

function renderC3() {
  const dias = Object.keys(S.sis.c3).sort();
  if (!S.fecha3 || !S.sis.c3[S.fecha3]) {
    const pend = dias.filter(f => f < hoyIso() && !dia3(f).impreso);
    S.fecha3 = pend.length ? pend[pend.length - 1] : (dias[dias.length - 1] || '');
  }
  let h = '<div class="dj-wrap"><aside class="dj-dias"><div class="dj-dias-t">Días con producción</div>';
  if (!dias.length) h += '<p class="muted" style="padding:8px">No hay producción de Ciclo III cargada en ' + esc(nombreMes(S.mes)) + '.</p>';
  h += dias.slice().reverse().map(f => '<a href="#" class="dj-dia' + (f === S.fecha3 ? ' on' : '') + '" onclick="irDia3(\'' + f + '\');return false"><b>' + DIAS3[diaSem(f)] + ' ' + ddmm(f) + '</b>' + chipDia3(f) + '</a>').join('');
  h += '</aside><div class="dj-cont">';
  if (!S.fecha3) { $('main').innerHTML = h + '<section><p class="muted">Elegí un día.</p></section></div></div>'; return; }
  const f = S.fecha3, P = planilla3(f), x = P.x;
  h += '<section class="dj-top"><div><h2>Ciclo III · ' + esc(fechaLarga(f)) + '</h2><p class="sub" style="margin:0">' + fmt2(P.tot) + ' kg producidos · Lote <a href="#" onclick="editarLote();return false"><b>' + esc(P.lote) + '</b></a>' +
    (x.por ? ' · último cambio: ' + esc(x.por) + ' ' + esc(horaDe(x.ts)) : '') + (x.impreso ? ' · impresa ' + esc(horaDe(x.impreso)) : '') + '</p></div>' +
    '<div class="row"><button onclick="verImpresion3()">👁 Ver cómo sale</button><button class="primary big" onclick="imprimir3()">🖨 Imprimir</button></div></section>';
  if (P.c.nuevos.length) {
    h += '<div class="alerta warn"><div><b>Hay productos del sistema que no se reconocen.</b> Decí a qué renglón van (queda guardado):<table class="dj-nuevos">' +
      P.c.nuevos.map(r => '<tr><td>' + r.art + ' · ' + esc(r.den) + '</td><td class="num">' + fmt2(r.kg) + ' kg</td><td>' + selectMover3(r.art, '', true) + '</td></tr>').join('') + '</table></div></div>';
  }
  h += '<section><h2>Producción de chacinados</h2><p class="sub">Tocá un número o un texto para corregirlo. Tocá el nombre del producto para ver de qué artículos del sistema sale y mandar alguno a otro renglón.</p>';
  h += '<div class="tw"><table class="planilla dj-tab"><thead><tr><th>Nombre del producto</th><th>Marca</th><th class="num">Total de kg producidos</th><th>Observaciones / destino</th><th></th></tr></thead><tbody>';
  for (const r of P.filas) {
    const ab = S.abierto['c3|' + r.n];
    h += '<tr><td><a href="#" class="dj-n" onclick="S.abierto[\'c3|' + jsq(r.n) + '\']=!S.abierto[\'c3|' + jsq(r.n) + '\'];render();return false">' + (ab ? '▾ ' : '▸ ') + esc(r.n) + '</a>' + (r.manual ? ' <span class="chip sm info">agregado</span>' : '') + '</td>' +
      celda3(r, 'marca') + celda3(r, 'kg') + celda3(r, 'dest') +
      '<td><button class="small danger" title="Sacar este renglón" onclick="quitar3(\'' + jsq(r.n) + '\')">✕</button></td></tr>';
    if (ab) h += '<tr class="dj-det"><td colspan="5">' + detalle3(r) + '</td></tr>';
  }
  h += '<tr class="tot"><td>Total</td><td></td><td class="num">' + fmt2(P.tot) + ' kg</td><td colspan="2"></td></tr></tbody></table></div>';
  const quitados = Object.keys(x.prod || {}).filter(n => x.prod[n].quitar);
  h += '<div class="row" style="margin-top:10px"><select id="nueva3"><option value="">+ Agregar un renglón…</option>' +
    eq3().lineas.map(l => l.n).filter(n => !P.filas.some(r => r.n === n)).map(n => '<option>' + esc(n) + '</option>').join('') + '<option value="*">Otro (escribir el nombre)</option></select><button class="small" onclick="agregar3()">Agregar</button>' +
    (quitados.length ? '<span class="muted" style="font-size:13px">Sacados: ' + quitados.map(n => esc(n) + ' <a href="#" onclick="cambiarDia3(x=>{delete x.prod[\'' + jsq(n) + '\']},\'vuelve ' + jsq(n) + '\');return false">volver a poner</a>').join(' · ') + '</span>' : '') + '</div>';
  if (P.c.d.in.length) h += '<p class="muted" style="font-size:13px;margin-top:12px">Entró a Ciclo III: ' + P.c.d.in.map(r => esc(r.den) + ' ' + fmt2(r.kg) + ' kg').join(' · ') + '</p>';
  h += '</section></div></div>';
  $('main').innerHTML = h;
}
const NOMBRE3 = { kg: 'Total de kilogramos producidos', marca: 'Marca', dest: 'Observaciones / destino' };
function celda3(r, k) {
  const aj = r.ov[k] !== undefined, sv = r.sis[k], f = k === 'kg' ? fmt2 : esc;
  return '<td class="ed' + (k === 'kg' ? ' num' : '') + (aj ? ' aj' : '') + '" onclick="editar3(\'' + jsq(r.n) + '\',\'' + k + '\')">' + f(r[k] == null ? '' : r[k]) +
    (aj ? '<small class="dj-sis">' + (sv == null || sv === '' ? '—' : f(sv)) + '</small>' : '') + '</td>';
}
function detalle3(r) {
  const s = r.sis;
  if (!s.re.length) return '<span class="muted">Renglón cargado a mano (no sale del sistema).</span>';
  const mv = dia3(S.fecha3).mover || {};
  let h = '<table class="dj-mini"><tr><th>Artículo del sistema</th><th class="num">Unid.</th><th class="num">Kg</th><th>Mandarlo a</th></tr>';
  h += s.re.map(x => '<tr><td>' + x.art + ' · ' + esc(x.den) + (mv[x.art] ? ' <span class="chip sm warn">movido solo este día</span> <a href="#" onclick="desmover3(' + x.art + ');return false">deshacer</a>' : '') +
    '</td><td class="num">' + fmt0(x.uni) + '</td><td class="num">' + fmt2(x.kg) + '</td><td>' + selectMover3(x.art, r.n) + '</td></tr>').join('');
  h += s.ing.map(x => '<tr class="neg"><td>− reingresó: ' + x.art + ' · ' + esc(x.den) + '</td><td class="num">' + fmt0(x.uni) + '</td><td class="num">−' + fmt2(x.kg) + '</td><td></td></tr>').join('');
  return h + '</table>';
}
function selectMover3(art, actual, nuevo) {
  return '<select class="dj-mover" onchange="moverArt3(' + art + ',this.value,\'' + jsq(actual) + '\',' + (nuevo ? 1 : 0) + ')"><option value="">' + (actual ? esc(actual) + ' (está acá)' : 'Elegir…') + '</option>' +
    eq3().lineas.filter(l => l.n !== actual).map(l => '<option value="L:' + esc(l.n) + '">' + esc(l.n) + '</option>').join('') + '<option value="I">No va en la declaración</option></select>';
}

function irDia3(f) { S.fecha3 = f; S.abierto = {}; render(); window.scrollTo(0, 0); }
async function cambiarDia3(fn, desc) {
  const f = S.fecha3, m = f.slice(0, 7);
  try {
    S.doc = await cambiarDoc('ddjj-' + m, d => {
      d.c3 = d.c3 || {}; const x = d.c3[f] = d.c3[f] || {};
      x.prod = x.prod || {};
      fn(x); x.por = quien(); x.ts = new Date().toISOString();
    }, 'DDJJ Ciclo III ' + ddmm(f) + ': ' + desc);
    render();
  } catch (e) { toast(e.message, true); }
}
function editar3(n, k) {
  const r = planilla3(S.fecha3).filas.find(z => z.n === n); if (!r) return;
  const esNum = k === 'kg', sv = r.sis[k];
  const ayuda = (r.manual ? '' : 'Según el sistema: <b>' + (sv == null ? 'vacío' : esNum ? fmt2(sv) : esc(sv)) + '</b>.') +
    (r.ov[k] !== undefined ? ' <a href="#" onclick="cerrarDlg();cambiarDia3(x=>{delete x.prod[\'' + jsq(n) + '\'].' + k + '},\'' + jsq(n) + ' vuelve al sistema\');return false">Volver a lo del sistema</a>' : '');
  pedir(n + ' · ' + NOMBRE3[k], r[k] == null ? '' : (esNum ? fmtE(r[k]) : r[k]), ayuda, v => cambiarDia3(x => {
    const o = x.prod[n] = x.prod[n] || {};
    o[k] = esNum ? v : String(v).trim().toUpperCase();
  }, n + ' ' + NOMBRE3[k] + ' = ' + v), esNum ? 'num' : 'txt');
}
function editarLote() {
  const P = planilla3(S.fecha3);
  pedir('Número de lote', P.lote, 'Por defecto es la fecha (ddmmaa).', v => cambiarDia3(x => { x.lote = String(v).trim(); }, 'lote = ' + v), 'txt');
}
function quitar3(n) { cambiarDia3(x => { x.prod[n] = { quitar: true }; }, 'saca ' + n); }
function agregar3() {
  const v = $('nueva3').value; if (!v) return;
  const alta = n => cambiarDia3(x => { x.prod[n] = { kg: 0 }; }, 'agrega ' + n);
  if (v === '*') pedir('Nombre del producto', '', 'Como tiene que salir en la planilla.', n => { n = String(n || '').trim().toUpperCase(); if (n) alta(n); }, 'txt');
  else alta(v);
}
function moverArt3(art, v, actual, nuevo) {
  if (!v) return;
  const nom = v === 'I' ? 'que no vaya en la declaración' : v.slice(2);
  $('dlg-h').textContent = 'Mandar el artículo ' + art + ' a ' + nom;
  $('dlg-b').innerHTML = '<p class="sub">¿Solo para el ' + esc(fechaLarga(S.fecha3)) + ', o para siempre?</p>';
  $('dlg-f').innerHTML = '<button onclick="cerrarDlg();render()">Cancelar</button><button id="mv-dia">Solo este día</button><button class="primary" id="mv-siempre">Siempre</button>';
  $('mv-dia').onclick = () => { cerrarDlg(); cambiarDia3(x => { x.mover = x.mover || {}; x.mover[art] = v; }, 'artículo ' + art + (actual ? ' de ' + actual : '') + ' a ' + nom + ' (solo este día)'); };
  $('mv-siempre').onclick = () => { cerrarDlg(); asignar3(art, v); };
  $('dlg').showModal();
}
function desmover3(art) { cambiarDia3(x => { if (x.mover) delete x.mover[art]; }, 'artículo ' + art + ' vuelve a su renglón'); }
function asignar3(art, v) {
  cambiarEq(d => {
    d.c3 = d.c3 || JSON.parse(JSON.stringify(C3_DEF));
    d.c3.lineas.forEach(l => { l.arts = (l.arts || []).filter(a => a !== art); });
    d.c3.ignorar = (d.c3.ignorar || []).filter(a => a !== art);
    if (v === 'I') d.c3.ignorar.push(art);
    else { const l = d.c3.lineas.find(z => z.n === v.slice(2)); if (l) l.arts.push(art); }
  }, 'Ciclo III artículo ' + art + ' → ' + (v === 'I' ? 'no va' : v.slice(2)));
}

/* Equivalencias de Ciclo III (se agregan al final de la pestaña Equivalencias) */
function equivC3() {
  const E = eq3(), nom = {};
  for (const d of Object.values(S.sis.c3)) d.re.forEach(r => { nom[r.art] = r.den; });
  const autom = n => Object.keys(nom).map(Number).filter(a => !(E.lineas.some(l => (l.arts || []).includes(a))) && !(E.ignorar || []).includes(a) && destino3(a, nom[a], '0000-00-00') === n);
  const chip = (a, extra) => '<span class="dj-art">' + a + (nom[a] ? ' <small>' + esc(nom[a].toLowerCase()) + '</small>' : '') + (extra || '') + '</span>';
  let h = '<section><h2>Equivalencias de Ciclo III</h2><p class="sub">Qué artículos del sistema van en cada producto de la DDJJ de chacinados. Los que no tienen código asignado se reconocen por el nombre (los marcados "por nombre").</p>';
  h += '<div class="tw"><table class="planilla dj-eq"><thead><tr><th>Producto</th><th>Artículos del sistema</th><th></th></tr></thead><tbody>';
  E.lineas.forEach((l, i) => {
    h += '<tr><td><b>' + esc(l.n) + '</b></td><td>' + (l.arts || []).map(a => chip(a)).join(' ') + autom(l.n).map(a => chip(a, ' <small>(por nombre)</small>')).join(' ') +
      ' <button class="small" onclick="eqArts3(' + i + ')">Cambiar</button></td><td><button class="small danger" onclick="if(confirm(\'¿Sacar ' + jsq(l.n) + '?\'))cambiarEq(d=>{d.c3=d.c3||JSON.parse(JSON.stringify(C3_DEF));d.c3.lineas.splice(' + i + ',1)},\'Ciclo III saca ' + jsq(l.n) + '\')">✕</button></td></tr>';
  });
  h += '<tr><td colspan="3"><button class="small" onclick="eqNueva3()">+ Producto nuevo</button></td></tr></tbody></table></div>';
  h += '<h3 class="dj-h3">No van en la declaración</h3><p>' + ((E.ignorar || []).map(a => chip(a)).join(' ') || '<span class="muted">ninguno</span>') + '</p>';
  h += '<p><label><input type="checkbox"' + (E.restar ? ' checked' : '') + ' onchange="cambiarEq(d=>{d.c3=d.c3||JSON.parse(JSON.stringify(C3_DEF));d.c3.restar=this.checked},\'Ciclo III restar reproceso \'+this.checked)"> A cada producto restarle lo que de ese mismo producto reingresó (reproceso)</label></p>';
  h += '<p>Establecimiento N.º Oficial: <input class="w-cp" value="' + esc(E.estab || '') + '" onchange="cambiarEq(d=>{d.c3=d.c3||JSON.parse(JSON.stringify(C3_DEF));d.c3.estab=this.value.trim()},\'Ciclo III establecimiento\')"></p></section>';
  return h;
}
function eqArts3(i) {
  const l = eq3().lineas[i];
  pedir(l.n + ' · artículos del sistema', (l.arts || []).join(', '), 'Códigos de artículo separados por coma (además se suman los que se reconocen por el nombre).', v => cambiarEq(d => {
    d.c3 = d.c3 || JSON.parse(JSON.stringify(C3_DEF));
    const arts = listaNum(v);
    d.c3.lineas.forEach(z => { z.arts = (z.arts || []).filter(a => !arts.includes(a)); });
    d.c3.ignorar = (d.c3.ignorar || []).filter(a => !arts.includes(a));
    d.c3.lineas[i].arts = arts;
  }, 'Ciclo III ' + l.n + ' = ' + v), 'txt');
}
function eqNueva3() { pedir('Producto nuevo', '', 'Nombre como tiene que salir en la planilla.', v => { v = String(v || '').trim().toUpperCase(); if (v) cambiarEq(d => { d.c3 = d.c3 || JSON.parse(JSON.stringify(C3_DEF)); d.c3.lineas.push({ n: v, arts: [] }); }, 'Ciclo III producto nuevo ' + v); }, 'txt'); }

/* ---------- impresión: la hoja completa, igual al Word ---------- */
function hoja3(f) {
  const P = planilla3(f), E = eq3(), filas = P.filas.slice();
  const N = Math.max(9, filas.length);
  let h = '<div class="hoja h3"><div class="h3-cab"><img src="/logo.png" alt=""><div><div class="h3-t">Frigorífico Qualita S.A</div><div class="h3-s">Ruta Nacional N.º 9 Norte / Km. 748 Colonia Caroya / Córdoba / Argentina</div><div class="h3-s">&nbsp;Establecimiento N.º Oficial ' + esc(E.estab || '') + '</div></div></div>' +
    '<div class="h3-c b">Producción Fábrica de Chacinados Qualita S.A</div><div class="h3-c">DECLARACIÓN JURADA</div>' +
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
function imprimir3() {
  const f = S.fecha3; if (!f) return;
  $('impresion').innerHTML = hoja3(f);
  window.print();
  cambiarDia3(x => { x.impreso = new Date().toISOString(); }, 'impresa');
}
function verImpresion3() {
  const w = window.open('', '_blank');
  if (!w) { toast('El navegador bloqueó la ventana. Usá Imprimir directamente.', true); return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>DDJJ Ciclo III ' + ddmm(S.fecha3) + '</title><base href="' + location.origin + '/"><link rel="stylesheet" href="' + location.origin + '/ddjj.css"></head><body class="vista">' +
    '<div class="vista-bar">Así sale impresa la DDJJ de Ciclo III del ' + esc(fechaLarga(S.fecha3)) + '.</div>' + hoja3(S.fecha3) + '</body></html>');
  w.document.close();
}
