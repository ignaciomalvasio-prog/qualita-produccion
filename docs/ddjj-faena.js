/* Faena y mortalidad · pestaña de /ddjj (reemplaza las hojas FAENA, MUERTOS, M 2026 y M LQ de RESUMEN PRODUCCIÓN.xlsx)
   - Datos: c3sis/dj-anual (lo sube dj_sync.ps1): FA (faena por mes, propia / usuarios), MU (muertos de la tabla MUERTOS del sistema),
     TQ (tropas y cabezas recibidas por productor y granja/localidad). Año actual y anterior.
   - Muertos que no están en el sistema (algunos de corral): c3docs/ddjj-muertos = { lista: [{id, fecha, tropa, cab, lugar, patente, prod, loc, obs, por, ts}] }.
   - Productores del informe por granja (La Quimera y Consultores Asociados): eq().fm.lq. */
'use strict';

/* solo lectura: la vista /faena (rol "faena") no muestra botones para cambiar nada */
const soloVer = () => window.SOLO_FAENA || (window.C3API && C3API.rol === 'faena');
const FM_DEF = { lq: [5153, 5208], lqNombre: 'La Quimera' };
const eqF = () => (eq().fm || FM_DEF);
const MESES3 = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const z0 = v => v ? fmt0(v) : '';
const pct2 = v => (v == null || !isFinite(v)) ? '' : (v * 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
const titulo = s => String(s || '').toLowerCase().replace(/(^|[\s(])\S/g, c => c.toUpperCase()).replace(/ S\.a\./g, ' S.A.');

function parseAnual(txt) {
  const o = { hora: '', fa: [], mu: [], tq: [], fe: [], fx: null };
  for (const l of String(txt || '').split(/\r?\n/)) {
    const p = l.replace(/^﻿/, '').split('|');
    if (p[0] === 'OK') o.hora = p[1];
    else if (p[0] === 'FA') o.fa.push({ mes: p[1], propia: p[2] === '1', cab: num(p[3]), kg: num(p[4]), dias: num(p[5]) });
    else if (p[0] === 'MU') o.mu.push({ fecha: p[1], tropa: p[2], cab: num(p[3]), lugar: p[4] === 'C' ? 'CORRAL' : 'VIAJE', patente: p[5], cue: +p[6], prod: p[7], loc: p[8], obs: p[9], sis: true });
    else if (p[0] === 'FE') o.fe.push({ fecha: p[1], tropa: String(p[2] || '').trim(), lista: p[3], cab: num(p[4]), nro: p[5], cabTropa: num(p[6]), patente: p[7], cue: +p[8], prod: p[9], loc: p[10] });
    else if (p[0] === 'FX') o.fx = p.slice(1);
    else if (p[0] === 'TQ') o.tq.push({ mes: p[1], cue: +p[2], prod: p[3], loc: p[4], tropas: num(p[5]), cab: num(p[6]) });
  }
  return o;
}

/* Muertos de la playa de emergencia (pedido de Sabi 30/10): en la consulta de faena, un renglón de lista A1 con 1 sola cabeza
   de una tropa de más de un animal es un animal muerto en corrales (si la tropa es solo ese animal, no cuenta). Renglones FE de dj_sync.ps1.
   Si el mismo muerto ya está en la tabla de muertos del sistema o cargado a mano (misma tropa y fecha, en corral), no se repite. */
function muertosA1() {
  if (!S.anual || !S.anual.fe) return [];
  const otros = (S.anual.mu || []).concat((S.muertos && S.muertos.lista) || []);
  const usados = {};
  return S.anual.fe.filter(e => /^A1?$/.test(String(e.lista || '').replace(/\s/g, '').toUpperCase()) && e.cab === 1 && e.cabTropa > 1).filter(e => {
    const k = e.tropa + '|' + e.fecha, ya = otros.filter(m => String(m.tropa) === e.tropa && m.fecha === e.fecha && m.lugar === 'CORRAL').reduce((a, m) => a + (Number(m.cab) || 0), 0);
    usados[k] = (usados[k] || 0) + 1;
    return usados[k] > ya;
  }).map(e => ({ fecha: e.fecha, tropa: e.tropa, cab: 1, lugar: 'CORRAL', patente: e.patente, cue: e.cue, prod: e.prod, loc: e.loc, obs: 'Playa de emergencia (A1' + (e.nro ? ', faena N° ' + e.nro : '') + ')', a1: true }));
}
/* todos los muertos del año (sistema + playa de emergencia A1 + cargados a mano) */
function muertosAnio(a) {
  const man = ((S.muertos && S.muertos.lista) || []).map(m => Object.assign({ man: true }, m));
  return (S.anual ? S.anual.mu : []).concat(muertosA1(), man).filter(m => m.fecha.startsWith(String(a))).sort((x, y) => x.fecha.localeCompare(y.fecha));
}
/* si la notebook no encontró la tabla de la consulta de faena, se avisa con lo que vio (para corregir dj_sync.ps1) */
function avisoA1() {
  const x = S.anual && S.anual.fx;
  if (!x || x[0] === 'ok' || soloVer()) return '';
  return '<br><span class="chip sm bad">Muertos A1: no se pudieron leer</span> <span class="muted" style="font-size:12px">' + esc(x.slice(1).join(' · ').slice(0, 300)) + '</span>';
}
function faenaMes(a, i) {
  const m = a + '-' + pad(i + 1), F = (S.anual ? S.anual.fa : []).filter(x => x.mes === m);
  const prop = F.filter(x => x.propia), usu = F.filter(x => !x.propia), s = (L, k) => L.reduce((t, x) => t + x[k], 0);
  return { cab: s(F, 'cab'), kg: s(F, 'kg'), cabP: s(prop, 'cab'), kgP: s(prop, 'kg'), cabU: s(usu, 'cab'), kgU: s(usu, 'kg'), dias: Math.max(0, ...F.map(x => x.dias)) };
}

function renderFaena() {
  if (!S.anual) { $('main').innerHTML = '<section><div class="alerta warn">Todavía no hay datos de faena y mortalidad. Se suben solos con la tarea de la notebook (7, 11, 15 y 19 h).</div></section>'; return; }
  const A = Number(S.mes.slice(0, 4)), Ant = A - 1, hoyM = hoyIso().slice(0, 7);
  const meses = [...Array(12).keys()];
  const fa = meses.map(i => faenaMes(A, i)), fb = meses.map(i => faenaMes(Ant, i));
  const MU = muertosAnio(A), MUb = muertosAnio(Ant);
  const muMes = (L, i, lugar) => L.filter(m => Number(m.fecha.slice(5, 7)) === i + 1 && (!lugar || m.lugar === lugar)).reduce((t, m) => t + m.cab, 0);
  const sum = (L, k) => L.reduce((t, x) => t + (x[k] || 0), 0);

  /* ---- faena ---- */
  let h = '<section><div class="dj-top"><div><h2>Faena ' + A + '</h2><p class="sub" style="margin:0">Cabezas y kilos faenados por mes, del sistema (romaneo). Frigorífico = faena propia; usuarios = faena de terceros.</p></div><div class="row"><button onclick="excelFaena()">⬇ Bajar Excel</button></div></div>';
  h += grafLineas([{ n: String(Ant), c: '#9aa7b0', v: fb.map(x => x.cab || null) }, { n: String(A), c: '#0b5d75', v: fa.map((x, i) => (A + '-' + pad(i + 1)) <= hoyM && x.cab ? x.cab : null) }], 'cabezas');
  h += '<div class="tw"><table class="planilla dj-rm"><thead><tr><th>Mes</th><th class="num">Cabezas ' + Ant + '</th><th class="num">Cabezas ' + A + '</th><th class="num">Dif.</th><th class="num">Kg</th><th class="num">Frigorífico</th><th class="num">Kg</th><th class="num">Usuarios</th><th class="num">Kg</th><th class="num">Días</th><th class="num">Prom. diario</th></tr></thead><tbody>';
  meses.forEach(i => {
    const x = fa[i], y = fb[i];
    if (!x.cab && !y.cab) return;
    h += '<tr><td><b>' + MESES[i] + '</b></td><td class="num">' + z0(y.cab) + '</td><td class="num">' + z0(x.cab) + '</td><td class="num ' + (x.cab && y.cab ? (x.cab >= y.cab ? 'pos' : 'neg') : '') + '">' + (x.cab && y.cab ? pct1(x.cab / y.cab - 1) : '') + '</td><td class="num">' + z0(x.kg) + '</td><td class="num">' + z0(x.cabP) + '</td><td class="num">' + z0(x.kgP) +
      '</td><td class="num">' + z0(x.cabU) + '</td><td class="num">' + z0(x.kgU) + '</td><td class="num">' + z0(x.dias) + '</td><td class="num">' + (x.dias ? z0(x.cab / x.dias) : '') + '</td></tr>';
  });
  const T = k => sum(fa, k), Tb = k => sum(fb.filter((y, i) => fa[i].cab), k), dias = sum(fa, 'dias');
  h += '<tr class="tot"><td>Total</td><td class="num">' + z0(sum(fb, 'cab')) + '</td><td class="num">' + z0(T('cab')) + '</td><td class="num">' + (Tb('cab') ? pct1(T('cab') / Tb('cab') - 1) : '') + '</td><td class="num">' + z0(T('kg')) + '</td><td class="num">' + z0(T('cabP')) + '</td><td class="num">' + z0(T('kgP')) + '</td><td class="num">' + z0(T('cabU')) + '</td><td class="num">' + z0(T('kgU')) + '</td><td class="num">' + z0(dias) + '</td><td class="num">' + (dias ? z0(T('cab') / dias) : '') + '</td></tr></tbody></table></div>' +
    '<p class="muted" style="font-size:12.5px;margin-top:6px">"Dif." compara contra el mismo mes de ' + Ant + '. El total del año anterior es el año completo; la diferencia del total compara solo los meses con faena de ' + A + '.</p></section>';

  /* ---- mortalidad ---- */
  h += '<section><h2>Mortalidad ' + A + '</h2><p class="sub">Muertos en viaje y en corral sobre las cabezas faenadas. Salen de la tabla de muertos del sistema; los que no estén cargados se agregan abajo (quedan marcados "a mano").</p>';
  h += grafBarras(meses.map(i => ({ n: MESES3[i], a: muMes(MUb, i), b: muMes(MU, i) })), String(Ant), String(A));
  h += '<div class="tw"><table class="planilla dj-rm"><thead><tr><th>Mes</th><th class="num">Muertos ' + Ant + '</th><th class="num">Muertos ' + A + '</th><th class="num">Corral</th><th class="num">Viaje</th><th class="num">Faena</th><th class="num">% mortalidad</th></tr></thead><tbody>';
  meses.forEach(i => {
    const b = muMes(MU, i), a = muMes(MUb, i);
    if (!a && !b && !fa[i].cab) return;
    h += '<tr><td><b>' + MESES[i] + '</b></td><td class="num">' + z0(a) + '</td><td class="num">' + z0(b) + '</td><td class="num">' + z0(muMes(MU, i, 'CORRAL')) + '</td><td class="num">' + z0(muMes(MU, i, 'VIAJE')) + '</td><td class="num">' + z0(fa[i].cab) + '</td><td class="num">' + (fa[i].cab ? pct2(b / fa[i].cab) : '') + '</td></tr>';
  });
  const tm = sum(MU, 'cab');
  h += '<tr class="tot"><td>Total</td><td class="num">' + z0(sum(MUb, 'cab')) + '</td><td class="num">' + z0(tm) + '</td><td class="num">' + z0(sum(MU.filter(m => m.lugar === 'CORRAL'), 'cab')) + '</td><td class="num">' + z0(sum(MU.filter(m => m.lugar === 'VIAJE'), 'cab')) + '</td><td class="num">' + z0(T('cab')) + '</td><td class="num">' + (T('cab') ? pct2(tm / T('cab')) : '') + '</td></tr></tbody></table></div></section>';

  /* ---- informe por granja (La Quimera) ---- */
  const lq = eqF().lq, TQ = (S.anual.tq || []).filter(t => t.mes.startsWith(String(A)) && lq.includes(t.cue)), MQ = MU.filter(m => lq.includes(m.cue) || (m.man && m.lq));
  const granjas = [...new Set(TQ.map(t => t.loc).concat(MQ.map(m => m.loc)).filter(Boolean))].sort();
  const fila = (nom, tq, mq) => {
    const cab = sum(tq, 'cab'), c = sum(mq.filter(m => m.lugar === 'CORRAL'), 'cab'), v = sum(mq.filter(m => m.lugar === 'VIAJE'), 'cab');
    return '<td class="num">' + z0(sum(tq, 'tropas')) + '</td><td class="num">' + z0(cab) + '</td><td class="num">' + z0(c) + '</td><td class="num">' + z0(v) + '</td><td class="num"><b>' + z0(c + v) + '</b></td><td class="num">' + (cab ? pct2(c / cab) : '') + '</td><td class="num">' + (cab ? pct2(v / cab) : '') + '</td><td class="num"><b>' + (cab ? pct2((c + v) / cab) : '') + '</b></td>';
  };
  const cab = '<th class="num">Tropas</th><th class="num">Cabezas</th><th class="num">Corral</th><th class="num">Viaje</th><th class="num">Total muertos</th><th class="num">% corral</th><th class="num">% viaje</th><th class="num">% mortalidad</th>';
  h += '<section><h2>Mortalidad ' + esc(eqF().lqNombre) + ' por granja · ' + A + '</h2><p class="sub">Tropas recibidas de ' + esc(lq.join(', ')) + ' (cuentas del sistema) y sus muertos en corral y en viaje.' + (soloVer() ? '' : ' <a href="#" onclick="cambiarLq();return false">Cambiar productores</a>') + '</p>';
  h += '<div class="tw"><table class="planilla dj-rm"><thead><tr><th>Granja</th>' + cab + '</tr></thead><tbody>' +
    granjas.map(g => '<tr><td><b>' + esc(titulo(g)) + '</b></td>' + fila(g, TQ.filter(t => t.loc === g), MQ.filter(m => m.loc === g)) + '</tr>').join('') +
    '<tr class="tot"><td>Total</td>' + fila('', TQ, MQ) + '</tr></tbody></table></div>';
  h += '<h3 class="dj-h3">Por mes</h3><div class="tw"><table class="planilla dj-rm"><thead><tr><th>Mes</th>' + cab + '</tr></thead><tbody>' +
    meses.filter(i => TQ.some(t => Number(t.mes.slice(5, 7)) === i + 1)).map(i => '<tr><td><b>' + MESES[i] + '</b></td>' + fila('', TQ.filter(t => Number(t.mes.slice(5, 7)) === i + 1), MQ.filter(m => Number(m.fecha.slice(5, 7)) === i + 1)) + '</tr>').join('') + '</tbody></table></div></section>';

  /* ---- listado ---- */
  h += '<section><div class="dj-top"><div><h2>Muertos ' + A + ' (' + z0(tm) + ')</h2><p class="sub" style="margin:0">Del sistema, de la playa de emergencia (renglones A1 de la consulta de faena, marcados) y cargados a mano.' + avisoA1() + '</p></div>' + (soloVer() ? '' : '<button class="primary" onclick="agregarMuerto()">+ Agregar un muerto que no está en el sistema</button>') + '</div>';
  h += '<div class="tw" style="max-height:520px"><table class="planilla dj-rm"><thead><tr><th>Fecha</th><th>Tropa</th><th class="num">Cant.</th><th>Lugar</th><th>Jaula</th><th>Productor</th><th>Granja</th><th>Observación</th><th></th></tr></thead><tbody>' +
    MU.slice().reverse().map(m => '<tr><td>' + ddmm(m.fecha) + '</td><td>' + esc(m.tropa) + '</td><td class="num">' + z0(m.cab) + '</td><td>' + esc(m.lugar) + '</td><td>' + esc(m.patente || '') + '</td><td>' + esc(titulo(m.prod)) + '</td><td>' + esc(titulo(m.loc)) + '</td><td class="muted">' + esc(m.obs || '') + '</td><td>' +
      (m.a1 ? '<span class="chip sm info" title="Renglón A1 de la consulta de faena: animal muerto en corrales que pasó por la playa de emergencia">emergencia A1</span>' : '') +
      (m.man ? '<span class="chip sm warn">a mano</span>' + (soloVer() ? '' : ' <button class="small danger" onclick="borrarMuerto(\'' + esc(m.id) + '\')">✕</button>') : '') + '</td></tr>').join('') + '</tbody></table></div></section>';
  $('main').innerHTML = h;
}

/* ---------- muertos a mano ---------- */
function agregarMuerto() {
  $('dlg-h').textContent = 'Agregar un muerto que no está en el sistema';
  const tropas = [...new Set((S.anual.mu || []).map(m => m.tropa))];
  $('dlg-b').innerHTML = '<div class="campos dj-campos"><label>Fecha<input type="date" id="mu-f" value="' + hoyIso() + '"></label><label>Nº de tropa<input id="mu-t" inputmode="numeric"></label><label>Cantidad<input id="mu-c" value="1" inputmode="numeric"></label>' +
    '<label>Lugar<select id="mu-l"><option>CORRAL</option><option>VIAJE</option></select></label><label>Jaula (patente)<input id="mu-p"></label><label>Productor<input id="mu-pr" value="LA QUIMERA S.A."></label><label>Granja<input id="mu-g" placeholder="Candelaria Sud, El Rodeo…"></label><label>Observación<input id="mu-o"></label></div>' +
    '<p class="sub">Si la tropa ya tiene otros muertos en el sistema, la jaula, el productor y la granja se completan solos.</p>';
  $('dlg-f').innerHTML = '<button onclick="cerrarDlg()">Cancelar</button><button class="primary" id="mu-ok">Agregar</button>';
  $('mu-t').onchange = () => { const x = (S.anual.mu || []).find(m => m.tropa === $('mu-t').value.trim()) || (S.muertos.lista || []).find(m => m.tropa === $('mu-t').value.trim()); if (x) { $('mu-p').value = x.patente || ''; $('mu-pr').value = x.prod || ''; $('mu-g').value = x.loc || ''; } };
  $('mu-ok').onclick = async () => {
    const m = { id: Date.now().toString(36), fecha: $('mu-f').value, tropa: $('mu-t').value.trim(), cab: leerNum($('mu-c').value) || 1, lugar: $('mu-l').value, patente: $('mu-p').value.trim().toUpperCase(), prod: $('mu-pr').value.trim().toUpperCase(), loc: $('mu-g').value.trim().toUpperCase(), obs: $('mu-o').value.trim(), por: quien(), ts: new Date().toISOString() };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.fecha) || !m.tropa) { toast('Falta la fecha o la tropa', true); return; }
    const ref = (S.anual.mu || []).find(x => x.tropa === m.tropa); if (ref) m.cue = ref.cue;
    m.lq = /QUIMERA|CONSULTORES/.test(m.prod);
    cerrarDlg();
    try { S.muertos = await cambiarDoc('ddjj-muertos', d => { d.lista = d.lista || []; d.lista.push(m); }, 'Muerto agregado a mano: tropa ' + m.tropa + ' ' + m.fecha + ' ' + m.lugar); render(); toast('Agregado'); }
    catch (e) { toast(e.message, true); }
  };
  $('dlg').showModal();
}
async function borrarMuerto(id) {
  if (!confirm('¿Borrar este muerto cargado a mano?')) return;
  try { S.muertos = await cambiarDoc('ddjj-muertos', d => { d.lista = (d.lista || []).filter(m => m.id !== id); }, 'Muerto a mano borrado (' + id + ')'); render(); }
  catch (e) { toast(e.message, true); }
}
function cambiarLq() {
  pedir('Productores del informe por granja', eqF().lq.join(', '), 'Números de cuenta del sistema separados por coma (5153 La Quimera, 5208 Consultores Asociados).', v => cambiarEq(d => { d.fm = d.fm || JSON.parse(JSON.stringify(FM_DEF)); d.fm.lq = listaNum(v); }, 'productores informe por granja = ' + v), 'txt');
}

/* ---------- gráficos (SVG simple) ---------- */
function grafLineas(series, unidad) {
  const W = 760, H = 200, L = 52, B = 24, max = Math.max(1, ...series.flatMap(s => s.v.filter(Boolean))) * 1.08, min = Math.min(...series.flatMap(s => s.v.filter(Boolean))) * 0.92 || 0;
  const x = i => L + i * (W - L - 10) / 11, y = v => 10 + (H - B - 10) * (1 - (v - min) / (max - min));
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Faena por mes">';
  for (let k = 0; k <= 3; k++) { const v = min + (max - min) * k / 3; s += '<line x1="' + L + '" x2="' + (W - 10) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#eef0f2"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + fmt0(v) + '</text>'; }
  MESES3.forEach((m, i) => { s += '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + m + '</text>'; });
  for (const se of series) {
    const pts = se.v.map((v, i) => v ? x(i) + ',' + y(v) : null).filter(Boolean);
    s += '<polyline fill="none" stroke="' + se.c + '" stroke-width="2.2" points="' + pts.join(' ') + '"/>' + se.v.map((v, i) => v ? '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="3" fill="' + se.c + '"><title>' + MESES3[i] + ' ' + se.n + ': ' + fmt0(v) + ' ' + unidad + '</title></circle>' : '').join('');
  }
  return s + '</svg><div class="leyenda">' + series.map(se => '<span><i style="background:' + se.c + '"></i>' + se.n + '</span>').join('') + '</div>';
}
function grafBarras(datos, na, nb) {
  const W = 760, H = 180, L = 30, B = 24, max = Math.max(1, ...datos.map(d => Math.max(d.a, d.b))) * 1.15, bw = (W - L - 10) / 12;
  const y = v => 8 + (H - B - 8) * (1 - v / max);
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Muertos por mes">';
  datos.forEach((d, i) => {
    const x0 = L + i * bw + bw * 0.15, w = bw * 0.33;
    s += '<rect x="' + x0 + '" y="' + y(d.a) + '" width="' + w + '" height="' + (H - B - y(d.a)) + '" fill="#c5ccd1"><title>' + d.n + ' ' + na + ': ' + d.a + '</title></rect>' +
      '<rect x="' + (x0 + w + 2) + '" y="' + y(d.b) + '" width="' + w + '" height="' + (H - B - y(d.b)) + '" fill="#a8302a"><title>' + d.n + ' ' + nb + ': ' + d.b + '</title></rect>' +
      '<text x="' + (L + i * bw + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + d.n + '</text>' + (d.b ? '<text x="' + (x0 + w * 1.5 + 2) + '" y="' + (y(d.b) - 3) + '" text-anchor="middle">' + d.b + '</text>' : '');
  });
  return s + '</svg><div class="leyenda"><span><i style="background:#c5ccd1"></i>' + na + '</span><span><i style="background:#a8302a"></i>' + nb + '</span></div>';
}

/* ---------- Excel ---------- */
function excelFaena() {
  if (!window.XLSX) { toast('No se pudo cargar el Excel. Revisá internet.', true); return; }
  const A = Number(S.mes.slice(0, 4)), wb = XLSX.utils.book_new();
  const f1 = [['MES', 'CABEZAS ' + (A - 1), 'CABEZAS ' + A, 'KG', 'FRIGORÍFICO', 'KG', 'USUARIO', 'KG', 'DÍAS TRABAJADOS', 'PROMEDIO DIARIO']];
  for (let i = 0; i < 12; i++) { const x = faenaMes(A, i), y = faenaMes(A - 1, i); f1.push([MESES[i].toUpperCase(), y.cab || '', x.cab || '', x.kg || '', x.cabP || '', x.kgP || '', x.cabU || '', x.kgU || '', x.dias || '', x.dias ? Math.round(x.cab / x.dias * 10) / 10 : '']); }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(f1), 'FAENA');
  const f2 = [['TROPA', 'FECHA', 'CANTIDAD', 'LUGAR', 'JAULA', 'GRANJA', 'LOCALIDAD', 'ORIGEN', 'OBSERVACIÓN']];
  for (const m of muertosAnio(A)) f2.push([m.tropa, fechaDe(m.fecha), m.cab, m.lugar, m.patente || '', m.prod || '', m.loc || '', m.man ? 'A mano' : m.a1 ? 'Playa de emergencia (A1)' : 'Sistema', m.obs || '']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(f2, { cellDates: true }), 'MUERTOS ' + A);
  XLSX.writeFile(wb, 'Faena y mortalidad ' + A + '.xlsx');
}
