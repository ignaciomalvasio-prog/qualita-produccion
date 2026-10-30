/* Trazabilidad · pestaña de /ddjj: consulta por tropa (hasta los clientes) o por correlativo (número de la etiqueta de la caja, hasta la tropa).
   - La consulta la hace la notebook de Igna en el momento: la web deja el pedido en c3docs/ddjj-traza = { pedido, tipo, valor, por }
     y dj_pedido.ps1 (que revisa cada pocos segundos, de 6:30 a 21:30) corre dj_traza.ps1 y devuelve { hecho, res (texto), error }.
   - Renglones de res: ver el encabezado de C:\InformeQualita\ddjj\dj_traza.ps1. */
'use strict';

const TICD = { 2: 'Desposte cerdo', 3: 'Menudencias', 4: 'Chacinados', 5: 'Tipo 5', 6: 'Rendering' };
const tipoD = t => TICD[t] || 'Tipo ' + t;
let esperandoTraza = null;

function parseTraza(txt) {
  const o = { hora: '', tt: [], tm: [], dp: [], dt: [], rp: [], sr: {}, ve: [], ri: [], pr: [], dr: [], ti: [], tf: [] };
  for (const l of String(txt || '').split(/\r?\n/)) {
    const p = l.replace(/^\uFEFF/, '').split('|'), t = p[0];
    if (t === 'OK') o.hora = p[1];
    else if (t === 'TT') o.tt.push({ tropa: p[1], fecha: p[3], cab: num(p[4]), prod: p[5], loc: p[6], pat: p[7] });
    else if (t === 'TM') o.tm.push({ fecha: p[1], medias: num(p[2]), kg: num(p[3]) });
    else if (t === 'DP') o.dp.push({ desp: p[1], fecha: p[2], ticd: +p[3], mias: num(p[4]), total: num(p[5]), kg: num(p[6]) });
    else if (t === 'DT') o.dt.push({ desp: p[1], tropa: p[2], medias: num(p[3]) });
    else if (t === 'RP') o.rp.push({ orig: p[1], desp: p[2], fecha: p[3], ticd: +p[4], cajas: num(p[5]), kg: num(p[6]) });
    else if (t === 'SR') o.sr[p[1]] = { cajas: num(p[2]), kg: num(p[3]), vend: num(p[4]), repr: num(p[5]), int: num(p[6]) };
    else if (t === 'VE') o.ve.push({ src: p[1], fecha: p[2], rem: p[3], cue: p[4], cli: p[5], art: p[6], den: p[7], cajas: num(p[8]), kg: num(p[9]) });
    else if (t === 'RI') o.ri.push({ src: p[1], fecha: p[2], num: p[3], de: p[4], a: p[5], cajas: num(p[6]), kg: num(p[7]) });
    else if (t === 'PR') o.pr.push({ corr: p[1], item: p[2], art: p[3], den: p[4], kg: num(p[5]), fecha: p[6], ident: p[7], tropa: p[8] });
    else if (t === 'DR') o.dr.push({ desp: p[1], fecha: p[2], ticd: +p[3], nivel: +p[4] });
    else if (t === 'TI') o.ti.push({ nivel: +p[1], desp: p[2], tropa: p[3], prod: p[4], faena: p[5], medias: num(p[6]), kg: num(p[7]) });
    else if (t === 'TF') o.tf.push({ tropa: p[1], fecha: p[2], cab: num(p[3]), prod: p[4], loc: p[5] });
  }
  /* solo desposte cerdo (pedido de Sabi 29 y 30/10): las ventas y pases internos de lo que salió de despostes de rendering, menudencias,
     chacinados, tipo 5, etc. (ej. harina de carne y hueso del 416192) no van */
  const otros = new Set();
  o.rp.concat(o.dp, o.dr).forEach(d => { if (d.ticd && d.ticd !== 2) otros.add(String(d.desp)); });
  o.ve = o.ve.filter(v => !otros.has(String(v.src)));
  o.ri = o.ri.filter(v => !otros.has(String(v.src)));
  return o;
}

async function cargarTraza() {
  try { const d = (await leerDoc('ddjj-traza')).d || {}; S.traza = d; } catch (e) { S.traza = S.traza || {}; }
  if (S.tab === 'traza') render();
}

function renderTraza() {
  if (S.traza === undefined) { S.traza = null; cargarTraza(); }
  const T = S.traza || {}, pend = !!(T.pedido && !(T.hecho && T.hecho >= T.pedido));
  const tipo = S.trazaTipo || T.tipo || 'tropa';
  let h = '<section><h2>Trazabilidad</h2><p class="sub">Poné un número de tropa para ver en qué despostes entró y a qué clientes se vendió, o el correlativo de una caja (el primer número de la etiqueta, por ejemplo 4905612 de «4905612-30276-17.68»; se puede pegar entero) para ver de qué desposte y de qué tropas salió.</p>' +
    '<form class="row tz-form" onsubmit="consultarTraza();return false">' +
    '<div class="tz-tipo"><label><input type="radio" name="tz-t" value="tropa"' + (tipo === 'tropa' ? ' checked' : '') + ' onchange="S.trazaTipo=this.value"> Tropa</label>' +
    '<label><input type="radio" name="tz-t" value="correlativo"' + (tipo === 'correlativo' ? ' checked' : '') + ' onchange="S.trazaTipo=this.value"> Correlativo</label></div>' +
    '<input id="tz-v" autocomplete="off" placeholder="Número" value="' + esc(S.trazaValor || '') + '">' +
    '<button class="primary" type="submit"' + (esperandoTraza ? ' disabled' : '') + '>' + (esperandoTraza ? '⏳ Consultando…' : 'Buscar') + '</button></form>';
  if (esperandoTraza) h += '<div class="alerta info" style="margin-top:12px"><span class="spin"></span> Consultando el sistema… tarda unos segundos (la notebook de Igna tiene que estar prendida).</div>';
  h += '</section>';
  if (T.error && !pend) h += '<section><div class="alerta bad">' + esc(T.error) + '</div></section>';
  else if (T.res && !pend) h += T.tipo === 'tropa' ? trazaTropa(parseTraza(T.res), T) : trazaCorr(parseTraza(T.res), T);
  else if (pend && !esperandoTraza) h += '<section><div class="alerta warn">Hay una consulta de ' + esc(T.tipo) + ' ' + esc(T.valor) + ' esperando a la notebook (pedida por ' + esc(T.por || '') + ').</div></section>';
  $('main').innerHTML = h;
}

async function consultarTraza(tipo, valor) {
  tipo = tipo || (document.querySelector('input[name="tz-t"]:checked') || {}).value || 'tropa';
  /* de la etiqueta "4905612-30276-17.68" (correlativo-artículo-kilos) vale el primer número */
  valor = (String(valor != null ? valor : ($('tz-v') || {}).value || '').match(/\d+/) || [''])[0];
  if (!valor) { toast('Poné el número', true); return; }
  if (esperandoTraza) return;
  S.trazaTipo = tipo; S.trazaValor = valor;
  const pedido = new Date().toISOString();
  try { S.traza = (await cambiarDoc('ddjj-traza', d => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, { pedido, tipo, valor, por: quien() }); }, 'Trazabilidad: ' + tipo + ' ' + valor)); }
  catch (e) { toast(e.message, true); return; }
  const inicio = Date.now();
  esperandoTraza = setInterval(async () => {
    let d = {}; try { d = (await leerDoc('ddjj-traza')).d || {}; } catch (e) {}
    const listo = d.pedido === pedido && d.hecho && d.hecho >= pedido, vencido = Date.now() - inicio > 120000;
    if (!listo && !vencido && d.pedido === pedido) return;
    clearInterval(esperandoTraza); esperandoTraza = null; S.traza = d;
    if (!listo && d.pedido === pedido) toast('La notebook no respondió (puede estar apagada o fuera de horario, 6:30 a 21:30).', true);
    if (S.tab === 'traza') render();
  }, 3000);
  render();
}
function irTropa(n) { S.tab = 'traza'; consultarTraza('tropa', n); window.scrollTo(0, 0); }
function irCorr(n) { S.tab = 'traza'; consultarTraza('correlativo', n); window.scrollTo(0, 0); }
const lnkT = n => '<a href="#" onclick="irTropa(\'' + esc(n) + '\');return false">' + esc(n) + '</a>';
const ddmmaa = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(2, 4) : '';
const pie = (T, R) => '<p class="muted" style="font-size:12.5px">Sistema al ' + esc(ddmmaa(R.hora.slice(0, 10)) + ' ' + R.hora.slice(11)) + ' · consultó ' + esc(T.por || '') + '</p>';

/* ---------- resultado por tropa ---------- */
function trazaTropa(R, T) {
  if (!R.tt.length) return '<section><div class="alerta warn">No existe la tropa ' + esc(T.valor) + ' en el sistema.</div></section>';
  let h = '<section><div class="dj-top"><div><h2>Tropa ' + esc(T.valor) + '</h2>';
  for (const t of R.tt) h += '<p class="sub" style="margin:0">' + esc(t.prod) + (t.loc ? ' · ' + esc(t.loc) : '') + ' · ingresó el ' + ddmmaa(t.fecha) + ' · ' + fmt0(t.cab) + ' cabezas' + (t.pat ? ' · patente ' + esc(t.pat) : '') + '</p>';
  h += '</div>' + (R.ve.length ? '<div class="row"><button onclick="excelTraza()">⬇ Excel de clientes</button></div>' : '') + '</div>';
  const med = R.tm.reduce((a, x) => a + x.medias, 0), kgm = R.tm.reduce((a, x) => a + x.kg, 0);
  h += '<p style="margin:10px 0 0"><b>' + fmt0(med) + ' medias</b> (' + fmt0(kgm) + ' kg) · faena ' + R.tm.sort((a, b) => a.fecha.localeCompare(b.fecha)).map(x => ddmmaa(x.fecha) + ' (' + fmt0(x.medias) + ')').join(', ') + '</p></section>';

  /* despostes */
  const otras = d => R.dt.filter(x => x.desp === d).sort((a, b) => b.medias - a.medias);
  /* solo los despostes de cerdo (pedido de Sabi 29/10): rendering, chacinados, tipo 5, etc. no se muestran */
  const dpC = R.dp.filter(d => d.ticd === 2);
  if (dpC.length) {
    h += '<section><h3 class="dj-h3" style="margin-top:0">1 · Despostes donde entró</h3><div class="tw"><table class="planilla dj-tab"><thead><tr><th>Desposte</th><th>Fecha</th><th class="num">Medias de esta tropa</th><th>Otras tropas en el mismo desposte</th><th class="num">Cajas</th><th class="num">Vendidas</th><th class="num">Reprocesadas</th></tr></thead><tbody>';
    for (const d of dpC.sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      const s = R.sr[d.desp] || {};
      h += '<tr><td>N° ' + esc(d.desp) + (d.ticd !== 2 ? ' <span class="muted">' + esc(tipoD(d.ticd)) + '</span>' : '') + '</td><td>' + ddmmaa(d.fecha) + '</td><td class="num">' + fmt0(d.mias) + ' de ' + fmt0(d.total) + '</td><td>' +
        (otras(d.desp).map(x => lnkT(x.tropa) + ' <span class="muted">(' + fmt0(x.medias) + ')</span>').join(', ') || '<span class="muted">ninguna</span>') + '</td><td class="num">' + fmt0(s.cajas) + '</td><td class="num">' + fmt0(s.vend) + '</td><td class="num">' + fmt0(s.repr) + '</td></tr>';
    }
    h += '</tbody></table></div>';
    const rp = R.rp.filter(x => x.orig !== x.desp && x.ticd === 2);
    if (rp.length) {
      h += '<h3 class="dj-h3">Cajas de esos despostes que se volvieron a procesar</h3><div class="tw"><table class="planilla dj-tab"><thead><tr><th>De</th><th>Pasaron al desposte</th><th>Fecha</th><th class="num">Cajas</th><th class="num">Kg</th></tr></thead><tbody>' +
        rp.sort((a, b) => a.fecha.localeCompare(b.fecha)).map(x => '<tr><td>N° ' + esc(x.orig) + '</td><td>N° ' + esc(x.desp) + ' <span class="muted">' + esc(tipoD(x.ticd)) + '</span></td><td>' + ddmmaa(x.fecha) + '</td><td class="num">' + fmt0(x.cajas) + '</td><td class="num">' + fmt2(x.kg) + '</td></tr>').join('') + '</tbody></table></div>';
    }
    h += '<p class="muted" style="font-size:12.5px;margin-top:6px">Las cajas de un desposte no se separan por tropa: todo lo que salió de un desposte donde entró esta tropa puede tener carne de ella.</p></section>';
  }

  /* clientes */
  h += '<section><h3 class="dj-h3" style="margin-top:0">2 · A quién se vendió</h3>';
  if (!R.ve.length) h += '<p class="muted">Todavía no hay ventas registradas con estas medias o cajas.</p>';
  else {
    const cl = {};
    for (const v of R.ve) { const c = cl[v.cue] || (cl[v.cue] = { cli: v.cli, cue: v.cue, cajas: 0, kg: 0, rem: new Set(), ven: [] }); c.cajas += v.cajas; c.kg += v.kg; c.rem.add(v.rem); c.ven.push(v); }
    const lista = Object.values(cl).sort((a, b) => b.kg - a.kg);
    h += '<p class="sub" style="margin:0 0 6px">' + lista.length + ' clientes · ' + fmt0(R.ve.reduce((a, v) => a + v.cajas, 0)) + ' cajas o piezas · ' + fmt0(R.ve.reduce((a, v) => a + v.kg, 0)) + ' kg. Tocá un cliente para ver los remitos.</p>';
    h += '<div class="tw"><table class="planilla dj-tab"><thead><tr><th>Cliente</th><th class="num">Remitos</th><th class="num">Cajas</th><th class="num">Kg</th></tr></thead><tbody>';
    for (const c of lista) {
      const ab = S.abierto['tz|' + c.cue];
      h += '<tr><td><a href="#" class="dj-n" onclick="S.abierto[\'tz|' + c.cue + '\']=!S.abierto[\'tz|' + c.cue + '\'];render();return false">' + (ab ? '▾ ' : '▸ ') + esc(c.cli) + '</a></td><td class="num">' + c.rem.size + '</td><td class="num">' + fmt0(c.cajas) + '</td><td class="num">' + fmt2(c.kg) + '</td></tr>';
      if (ab) h += '<tr class="dj-det"><td colspan="4"><table class="dj-mini"><tbody>' + c.ven.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.rem.localeCompare(b.rem)).map(v =>
        '<tr><td>' + ddmmaa(v.fecha) + '</td><td>Remito ' + esc(v.rem) + '</td><td>' + esc(v.den) + '</td><td class="num">' + fmt0(v.cajas) + '</td><td class="num">' + fmt2(v.kg) + ' kg</td><td class="muted">' + (v.src === '0' ? 'media entera' : 'desposte ' + esc(v.src)) + '</td></tr>').join('') + '</tbody></table></td></tr>';
    }
    h += '</tbody></table></div>';
  }
  if (R.ri.length) {
    const ri = {}; for (const x of R.ri) { const k = x.de + ' → ' + x.a; const z = ri[k] || (ri[k] = { cajas: 0, kg: 0 }); z.cajas += x.cajas; z.kg += x.kg; }
    h += '<p class="sub" style="margin-top:10px">Pasaron a otra sección (remito interno): ' + Object.entries(ri).map(([k, z]) => esc(k.toLowerCase()) + ' ' + fmt0(z.cajas) + ' cajas, ' + fmt0(z.kg) + ' kg').join(' · ') + '. Si después se vendieron, ya figuran arriba.</p>';
  }
  return h + pie(T, R) + '</section>';
}

/* ---------- resultado por correlativo ---------- */
function trazaCorr(R, T) {
  if (!R.pr.length) return '<section><div class="alerta warn">No existe el correlativo ' + esc(T.valor) + ' en el sistema.</div></section>';
  let h = '';
  for (const p of R.pr) {
    h += '<section><h2>Correlativo ' + esc(p.ident || p.corr) + '</h2><p class="sub" style="margin:0">' + esc(p.den) + ' · ' + fmt2(p.kg) + ' kg · ' + ddmmaa(p.fecha) + ' · etiqueta ' + esc((p.ident || p.corr) + '-' + p.art + '-' + p.kg) + ' · n° interno ' + esc(p.corr + (p.item !== '0' ? '/' + p.item : '')) + '</p></section>';
  }
  /* origen */
  h += '<section><h3 class="dj-h3" style="margin-top:0">1 · De dónde salió</h3>';
  const d0 = R.dr.filter(d => d.nivel === 0);
  if (R.tf.length) h += R.tf.map(t => '<p>Es una media de la tropa <b>' + lnkT(t.tropa) + '</b> · ' + esc(t.prod) + (t.loc ? ' · ' + esc(t.loc) : '') + ' · ingresó el ' + ddmmaa(t.fecha) + '</p>').join('');
  for (const d of d0) {
    h += '<p>Salió del <b>desposte N° ' + esc(d.desp) + '</b> del ' + ddmmaa(d.fecha) + (d.ticd !== 2 ? ' (' + esc(tipoD(d.ticd)) + ')' : '') + '. Medias que entraron a ese desposte:</p>';
    h += tablaTI(R.ti.filter(x => x.nivel === 0 && x.desp === d.desp));
    const prev = R.dr.filter(x => x.nivel === 1 && x.desp !== d.desp), ti1 = R.ti.filter(x => x.nivel === 1 && x.desp !== d.desp);
    if (prev.length) {
      h += '<p style="margin-top:12px">A ese desposte también entraron cajas reprocesadas de otros despostes (' + prev.map(x => 'N° ' + esc(x.desp) + ' del ' + ddmmaa(x.fecha)).join(', ') + '), que venían de estas tropas:</p>' + tablaTI(ti1, true);
    }
  }
  if (!d0.length && !R.tf.length) h += '<p class="muted">El sistema no tiene registrado de dónde salió.</p>';
  h += '</section>';
  /* destino */
  h += '<section><h3 class="dj-h3" style="margin-top:0">2 · A dónde fue</h3>';
  const dest = [];
  R.ve.forEach(v => dest.push('<li>Vendida a <b>' + esc(v.cli) + '</b> el ' + ddmmaa(v.fecha) + ', remito ' + esc(v.rem) + '</li>'));
  R.ri.forEach(x => dest.push('<li>Pasó de ' + esc(x.de.toLowerCase()) + ' a ' + esc(x.a.toLowerCase()) + ' el ' + ddmmaa(x.fecha) + ' (remito interno ' + esc(x.num) + ')</li>'));
  R.rp.filter(x => x.ticd === 2).forEach(x => dest.push('<li>Se volvió a procesar en el desposte N° ' + esc(x.desp) + ' del ' + ddmmaa(x.fecha) + ' (' + esc(tipoD(x.ticd)) + ')</li>'));
  h += dest.length ? '<ul class="tz-dest">' + dest.join('') + '</ul>' : '<p class="muted">Todavía no tiene venta ni movimiento registrado (debería estar en cámara).</p>';
  return h + pie(T, R) + '</section>';
}
function tablaTI(l, conDesp) {
  if (!l.length) return '<p class="muted">Sin medias registradas.</p>';
  return '<div class="tw"><table class="planilla dj-tab"><thead><tr><th>Tropa</th><th>Productor</th><th>Faena</th>' + (conDesp ? '<th>Desposte</th>' : '') + '<th class="num">Medias</th><th class="num">Kg</th></tr></thead><tbody>' +
    l.sort((a, b) => b.medias - a.medias).map(x => '<tr><td>' + lnkT(x.tropa) + '</td><td>' + esc(x.prod) + '</td><td>' + ddmmaa(x.faena) + '</td>' + (conDesp ? '<td>N° ' + esc(x.desp) + '</td>' : '') + '<td class="num">' + fmt0(x.medias) + '</td><td class="num">' + fmt2(x.kg) + '</td></tr>').join('') + '</tbody></table></div>';
}

function excelTraza() {
  if (!window.XLSX) { toast('No se pudo cargar el Excel. Revisá internet.', true); return; }
  const T = S.traza || {}, R = parseTraza(T.res), filas = [['Trazabilidad de la tropa ' + T.valor + (R.tt[0] ? ' · ' + R.tt[0].prod : '')], [], ['Fecha', 'Remito', 'Cliente', 'Producto', 'Cajas', 'Kg', 'Origen']];
  R.ve.sort((a, b) => a.cli.localeCompare(b.cli) || a.fecha.localeCompare(b.fecha)).forEach(v => filas.push([fechaDe(v.fecha), v.rem, v.cli, v.den, v.cajas, v.kg, v.src === '0' ? 'Media entera' : 'Desposte ' + v.src]));
  const ws = XLSX.utils.aoa_to_sheet(filas, { cellDates: true }), wb = XLSX.utils.book_new();
  ws['!cols'] = [{ wch: 11 }, { wch: 17 }, { wch: 38 }, { wch: 34 }, { wch: 7 }, { wch: 10 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
  XLSX.writeFile(wb, 'Trazabilidad tropa ' + T.valor + '.xlsx');
}
