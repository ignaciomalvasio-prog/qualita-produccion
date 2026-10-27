/* Centro de control Ciclo III y Qualitá Express · pantalla de Carlos
   Datos del sistema (solo lectura) + lo que se carga a mano (correcciones, caja, línea 2, insumos, fórmulas).
   Toda corrección guarda el valor del sistema, quién la hizo y una nota; se ve en la pestaña Cambios. */
'use strict';

let M = hoyIso().slice(0, 7);            // mes en pantalla
let TAB = 'inicio';
let S = null;                              // lo del sistema para el mes
let AJ = {};                               // correcciones del mes  (ajustes-AAAA-MM)
let LOC = {}, LOCP = {};                   // local del mes y del anterior (caja y línea 2)
let INS = null, FOR = null;                // insumos y fórmulas (documentos generales)
let SINS = null, SINSdesde = '';           // insumos del sistema (lista, compras, producción desde una fecha)
let V = null;                              // datos armados
let SUBINS = 'consumo';

const TIPOS = {
  mp: 'Carne recibida en Ciclo III (remito 1→3)',
  ing: 'Cortes que entran al local (remito 1→5)',
  dev: 'Devolución del local al frigorífico (remito 5→1)',
  emb: 'Embutidos de Ciclo III al local (remito 3→5)',
  prod: 'Producción de Ciclo III',
  v1: 'Venta del local "1" (sistema), kg del mes'
};

/* ================= carga ================= */
function tipoRemito(r) {
  if (r.ori === 1 && r.des === 3) return 'mp';
  if (r.ori === 1 && r.des === 5) return 'ing';
  if (r.ori === 5 && r.des === 1) return 'dev';
  if (r.ori === 3 && r.des === 5) return 'emb';
  return null;
}
async function cargar(forzar) {
  $('st').innerHTML = '<span class="spin"></span> Leyendo…';
  try {
    const [txt, aj, loc, locp] = await Promise.all([
      C3API.sis('mes-' + M),
      leerDoc('ajustes-' + M), leerDoc('local-' + M), leerDoc('local-' + mesAnterior(M))
    ]);
    S = parseSistema(txt ? txt.txt || '' : ''); AJ = aj.d; LOC = loc.d; LOCP = locp.d;
    S.sinDatos = !txt;
    if (!INS || forzar) INS = (await leerDoc('insumos')).d;
    if (!FOR || forzar) { FOR = (await leerDoc('formulas')).d; if (!FOR.recetas) FOR = formulasIniciales(); }
    if (forzar) SINS = null;
    armar();
    const hs = S.hora ? ddmm(S.hora.slice(0, 10)) + ' ' + S.hora.slice(11) : '';
    $('st').innerHTML = (S.sinDatos ? '<span class="dot off"></span>Sin datos del sistema para este mes' : '<span class="dot"></span>Sistema al <b>' + esc(hs) + '</b>') +
      '<br>' + esc(quien()) + ' · <a href="#" onclick="C3API.salir();return false">Salir</a>';
    render();
  } catch (e) {
    $('st').innerHTML = '<span class="dot off"></span>Sin conexión';
    $('main').innerHTML = '<section><div class="alerta bad">No se pudo leer el sistema: ' + esc(e.message) + '</div><button onclick="cargar(true)">Reintentar</button></section>';
  }
}
async function recargarDocs() {
  const [aj, loc] = await Promise.all([leerDoc('ajustes-' + M), leerDoc('local-' + M)]);
  AJ = aj.d; LOC = loc.d; armar(); render();
}
function cambiarMes(m) { if (!/^\d{4}-\d{2}$/.test(m)) return; M = m; $('mes').value = M; SINS = null; cargar(false); }
function moverMes(n) { cambiarMes(n < 0 ? mesAnterior(M) : mesSiguiente(M)); }

/* V[tipo][fecha][art] = { sis, val, den, nros, k, aj, man } */
function armar() {
  V = { mp: {}, ing: {}, dev: {}, emb: {}, prod: {} };
  const put = (t, f, art, den, kgv, nro) => {
    const d = (V[t][f] = V[t][f] || {});
    const c = d[art] = d[art] || { sis: 0, den, nros: [], art };
    c.sis += kgv; if (nro && !c.nros.includes(nro)) c.nros.push(nro);
  };
  for (const r of S.ri) { const t = tipoRemito(r); if (t) put(t, r.f, r.art, r.den, r.kg, r.nro); }
  for (const p of S.pr) put('prod', p.f, p.art, p.den, p.kg);
  for (const [k, a] of Object.entries(AJ)) {
    const [t, f, art] = k.split('|');
    if (!V[t] || !f || f.slice(0, 7) !== M) continue;
    const d = (V[t][f] = V[t][f] || {});
    const c = d[art] = d[art] || { sis: 0, den: a.den || art, nros: [], art, man: true };
    c.aj = a;
  }
  for (const t in V) for (const f in V[t]) for (const art in V[t][f]) {
    const c = V[t][f][art]; c.k = t + '|' + f + '|' + art; c.val = c.aj ? c.aj.kg : c.sis;
  }
}
const celdas = (t, f) => Object.values((V[t] || {})[f] || {});
const totDia = (t, f, filtro) => celdas(t, f).filter(c => !filtro || filtro(c)).reduce((s, c) => s + c.val, 0);
const totMes = (t, filtro) => Object.keys(V[t]).reduce((s, f) => s + totDia(t, f, filtro), 0);
const fechasCon = t => Object.keys(V[t]).filter(f => celdas(t, f).some(c => c.val || c.sis || c.aj)).sort();
function artsDe(t) {
  const m = {};
  for (const f in V[t]) for (const c of celdas(t, f)) { m[c.art] = m[c.art] || { art: c.art, den: c.den, kg: 0 }; m[c.art].kg += c.val; }
  return Object.values(m);
}

/* ================= navegación ================= */
document.getElementById('nav').addEventListener('click', e => {
  const a = e.target.closest('a[data-t]'); if (!a) return;
  e.preventDefault(); TAB = a.dataset.t;
  document.querySelectorAll('#nav a').forEach(x => x.classList.toggle('on', x === a));
  render(); window.scrollTo(0, 0);
});
/* En las planillas con dos renglones de títulos, el segundo queda fijo justo debajo del primero */
function fijarCabeceras() {
  document.querySelectorAll('#main table.planilla thead').forEach(th => {
    const r = th.rows; if (r.length < 2) return;
    const h = r[0].getBoundingClientRect().height;
    for (const c of r[1].cells) c.style.top = h + 'px';
  });
}
new MutationObserver(() => { clearTimeout(window._fc); window._fc = setTimeout(fijarCabeceras, 30); }).observe(document.getElementById('main'), { childList: true, subtree: false });
function render() {
  if (!S) return;
  const f = { inicio: renderInicio, c3: renderC3, insumos: renderInsumos, merc: renderMerc, ventas: renderVentas, caja: renderCaja, cambios: renderCambios, usuarios: renderUsuarios }[TAB];
  f();
}
function cabecera(titulo, sub, botones) {
  return '<div class="row" style="justify-content:space-between;margin-bottom:12px;gap:10px"><div style="min-width:0"><h2 style="font-size:20px">' + titulo +
    ' <span class="muted" style="font-weight:400">· ' + nombreMes(M) + '</span></h2>' + (sub ? '<div class="muted" style="font-size:13.5px">' + sub + '</div>' : '') +
    '</div><div class="row">' + (botones || '') + '<button onclick="descargarExcel()">⬇ Descargar Excel</button></div></div>';
}
function diasPlanilla() {
  const hoy = hoyIso();
  return diasDelMes(M).filter(f => diaSem(f) !== 0 || ['mp', 'prod', 'ing', 'emb', 'dev'].some(t => totDia(t, f) > 0) || f === hoy);
}

/* ================= inicio ================= */
function datosCaja() { return cajaCalc(LOCP, LOC, M); }
function ventasDia() {
  const m = {};
  for (const v of S.vl) { const d = m[v.f] = m[v.f] || { total: 0, neto: 0, kg: 0 }; d.total += v.total; d.neto += v.neto; if (!esOtro(v.art)) d.kg += v.kg; }
  for (const k of Object.keys(AJ)) { const [t, f] = k.split('|'); if ((t === 'vd' || t === 'vdk') && f && f.slice(0, 7) === M && !m[f]) m[f] = { total: 0, neto: 0, kg: 0 }; }
  for (const f in m) { const d = m[f]; d.totalSis = d.total; d.kgSis = d.kg; d.total = ov('vd|' + f, d.total); d.kg = ov('vdk|' + f, d.kg); }
  return m;
}
/* Facturado por Ciclo III, por producto, con correcciones */
function ventasC3() {
  const m = {};
  for (const v of S.vc) { const x = m[v.art] = m[v.art] || { art: v.art, den: v.den, kgSis: 0, netoSis: 0 }; x.kgSis += v.kg; x.netoSis += v.neto; }
  for (const x of Object.values(m)) { x.kg = ov('vck|' + M + '|' + x.art, x.kgSis); x.neto = ov('vcp|' + M + '|' + x.art, x.netoSis); }
  return Object.values(m).sort((a, b) => b.kg - a.kg);
}
function l2Dia(f) {
  const d = (LOC.dias || {})[f] || {};
  const items = d.l2 || [];
  const kgv = items.reduce((s, i) => s + (Number(i.kg) || 0), 0);
  const imp = items.reduce((s, i) => s + (Number(i.imp) || 0), 0);
  const dos = d.caja && d.caja.dos != null ? Number(d.caja.dos) : null;
  return { kg: kgv, imp: dos != null ? dos : imp, impItems: imp, items };
}
function renderInicio() {
  const prod = totMes('prod'), carne = totMes('mp'), emb = totMes('emb');
  const ing = totMes('ing'), dev = totMes('dev');
  const vc = ventasC3().reduce((a, v) => (a.kg += v.kg, a.neto += v.neto, a), { kg: 0, neto: 0 });
  const vd = ventasDia(), v1 = Object.values(vd).reduce((s, d) => s + d.total, 0);
  const dias = diasDelMes(M);
  const v2 = dias.reduce((s, f) => s + l2Dia(f).imp, 0);
  const cj = datosCaja();
  const difCaja = dias.reduce((s, f) => s + (cj[f] && cj[f].cargado ? cj[f].dif : 0), 0);
  const diasProd = fechasCon('prod').length;
  const card = (cls, t, v, s) => '<div class="kcard ' + cls + '"><small>' + t + '</small><b>' + v + '</b>' + (s ? '<span>' + s + '</span>' : '') + '</div>';

  let h = cabecera('Inicio', 'Resumen del mes. Los números salen del sistema, más lo que se cargó a mano.', '');
  h += '<section><h2>Ciclo III</h2><div class="kgrid">' +
    card('c3', 'Producción', kg1(prod) + ' kg', diasProd + ' días · promedio ' + kg1(diasProd ? prod / diasProd : 0) + ' kg') +
    card('c3', 'Carne recibida del frigorífico', kg1(carne) + ' kg', 'remitos 1 → 3') +
    card('c3', 'Rendimiento', pct(carne ? prod / carne : null), 'producción ÷ carne recibida') +
    card('c3', 'Enviado al local', kg1(emb) + ' kg', 'remitos 3 → 5') +
    card('c3', 'Facturado por Ciclo III', pesos(vc.neto) || '$ 0', kg1(vc.kg) + ' kg · neto sin IVA') +
    '</div></section>';
  h += '<section><h2>Qualitá Express (local)</h2><div class="kgrid">' +
    card('lo', 'Ventas "1" (sistema)', pesos(v1) || '$ 0', 'con IVA, igual a la Zeta') +
    card('lo', 'Ventas "2"', pesos(v2) || '$ 0', 'cargado a mano') +
    card('lo', 'Ventas totales', pesos(v1 + v2) || '$ 0', '') +
    card('lo', 'Cortes recibidos', kg1(ing - dev) + ' kg', kg1(ing) + ' entraron − ' + kg1(dev) + ' devueltos') +
    card('lo', 'Embutidos recibidos', kg1(emb) + ' kg', 'de Ciclo III') +
    card('lo', 'Diferencias de caja', (difCaja < 0 ? '−' : '') + (pesos(Math.abs(difCaja)) || '$ 0'), 'suma del mes') +
    '</div></section>';
  h += '<div class="grid2c"><section><h2>Producción diaria de Ciclo III</h2><p class="sub">kg por día, por producto</p>' + graficoProd() +
    '</section><section><h2>Ventas diarias del local</h2><p class="sub">$ con IVA, "1" del sistema y "2" cargado a mano</p>' + graficoVentas(vd) + '</section></div>';
  const notas = diasDelMes(M).filter(f => ((LOC.dias || {})[f] || {}).obs).reverse().slice(0, 8);
  if (notas.length) h += '<section><h2>Notas del local</h2><p class="sub">Lo que escribió el encargado en la planilla de caja. Clic para abrir la planilla del día.</p>' +
    notas.map(f => { const d = LOC.dias[f]; return '<div class="alerta" style="background:var(--bg);cursor:pointer" onclick="abrirPlanilla(\'' + f + '\')">📝 <div><b>' + DIAS[diaSem(f)] + ' ' + ddmm(f) + '</b> · <span class="muted">' + esc(d.por || '') + '</span><br>' + esc(d.obs).replace(/\n/g, '<br>') + '</div></div>'; }).join('') + '</section>';
  h += '<section><h2>Para revisar</h2><div id="alertas">' + alertas(vd, cj).join('') + '<div id="al-ins" class="muted" style="padding:6px 2px"><span class="spin"></span> Revisando insumos…</div></div></section>';
  $('main').innerHTML = h;
  alertasInsumos().then(a => { const x = $('al-ins'); if (x) x.outerHTML = a.join('') || ''; }).catch(() => { const x = $('al-ins'); if (x) x.remove(); });
}
function alertas(vd, cj) {
  const out = [], hoy = hoyIso();
  const lista = fs => fs.map(ddmm).join(', ');
  const sinParte = fechasCon('prod').filter(f => !S.mp.some(m => m.f === f));
  if (sinParte.length) out.push('<div class="alerta warn">⚠ <div>Hay producción cargada pero <b>sin la carne ingresada por sistema en CIII</b>: ' + lista(sinParte) + '. La carne recibida sale de los remitos 1→3, pero en el sistema falta cargar la carne usada.</div></div>');
  const sinCaja = diasDelMes(M).filter(f => f < hoy && vd[f] && vd[f].total > 0 && !(cj[f] && cj[f].cargado));
  if (sinCaja.length) out.push('<div class="alerta warn">⚠ <div><b>Caja del local sin cargar</b>: ' + lista(sinCaja) + '. <a href="#" onclick="irA(\'caja\');return false">Ir a la caja</a></div></div>');
  const zeta = diasDelMes(M).filter(f => cj[f] && cj[f].zeta != null && vd[f] && Math.abs(cj[f].zeta - vd[f].total) > 1);
  if (zeta.length) out.push('<div class="alerta bad">✖ <div><b>La Zeta no coincide con lo facturado en el sistema</b>: ' + zeta.map(f => ddmm(f) + ' (' + pesos(cj[f].zeta - vd[f].total).replace('$ ', '$ ') + ')').join(', ') + '</div></div>');
  const difs = diasDelMes(M).filter(f => cj[f] && cj[f].cargado && Math.abs(cj[f].dif) >= 1000);
  if (difs.length) out.push('<div class="alerta warn">⚠ <div><b>Diferencias de caja de $ 1.000 o más</b>: ' + difs.map(f => ddmm(f) + ' (' + (cj[f].dif < 0 ? '−' : '') + pesos(Math.abs(cj[f].dif)) + ')').join(', ') + '</div></div>');
  const sinProd = fechasCon('mp').filter(f => f < hoy && totDia('prod', f) === 0);
  if (sinProd.length) out.push('<div class="alerta warn">⚠ <div>Entró carne a Ciclo III y <b>no hay producción cargada</b>: ' + lista(sinProd) + '</div></div>');
  if (!out.length) out.push('<div class="alerta ok">✔ Nada pendiente en el mes.</div>');
  return out;
}
async function alertasInsumos() {
  await asegurarInsumos();
  const st = stockInsumos(), out = [];
  const bajos = st.filter(s => s.stock != null && s.min > 0 && s.stock < s.min);
  setTimeout(revisarLimites, 0);
  const neg = st.filter(s => s.stock != null && s.stock < 0);
  const sinContar = st.filter(s => s.usado && !s.conteo);
  if (bajos.length) out.push('<div class="alerta bad">✖ <div><b>Insumos por debajo del límite (hay que pedir)</b>: ' + bajos.map(s => esc(s.nombre) + ' (' + fmtN(s.stock, 1) + ' ' + s.unidad + ')').join(', ') + '. <a href="#" onclick="irA(\'insumos\');return false">Ver insumos</a></div></div>');
  if (neg.length) out.push('<div class="alerta warn">⚠ <div><b>Insumos con stock negativo</b> (falta cargar una compra o contar de nuevo): ' + neg.map(s => esc(s.nombre)).join(', ') + '</div></div>');
  if (sinContar.length) out.push('<div class="alerta warn">⚠ <div><b>Falta contar el stock inicial</b> de ' + sinContar.length + ' insumos que se usan en las fórmulas. <a href="#" onclick="irA(\'insumos\');return false">Contar ahora</a></div></div>');
  return out;
}
function irA(t) { const a = document.querySelector('#nav a[data-t="' + t + '"]'); if (a) a.click(); }

/* gráficos de barras apiladas simples */
const COLORES = { chorizo: '#0b5d75', chbombon: '#5f9fb3', morcilla: '#7a3b3b', mbombon: '#c08a8a', salchicha: '#9a6512', otros: '#9aa6ad' };
function barras(dias, series, fmt) {
  const W = 640, H = 220, L = 46, B = 26, T = 10, n = dias.length || 1, bw = (W - L - 6) / n;
  const tot = dias.map((_, i) => series.reduce((s, se) => s + (se.vals[i] || 0), 0));
  const max = Math.max(1, ...tot), esc1 = (H - B - T) / max;
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = max * k / 4, y = H - B - v * esc1; g += '<line x1="' + L + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="#eef1f3"/><text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + fmt(v) + '</text>'; }
  dias.forEach((f, i) => {
    let y = H - B; const x = L + i * bw + bw * 0.15, w = bw * 0.7;
    for (const se of series) { const h = (se.vals[i] || 0) * esc1; if (h > 0) { y -= h; g += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + se.color + '"><title>' + ddmm(f) + ' · ' + se.n + ': ' + fmtN(se.vals[i], 0) + '</title></rect>'; } }
    if (n <= 31 && (i % (n > 20 ? 2 : 1) === 0)) g += '<text x="' + (x + w / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + f.slice(8) + '</text>';
  });
  const ley = '<div class="leyenda">' + series.filter(s => s.vals.some(v => v)).map(s => '<span><i style="background:' + s.color + '"></i>' + s.n + '</span>').join('') + '</div>';
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">' + g + '</svg>' + ley;
}
const corto = v => v >= 1e6 ? fmtN(v / 1e6, 1) + ' M' : v >= 1000 ? fmtN(v / 1000, 0) + ' mil' : fmtN(v, 0);
function graficoProd() {
  const dias = diasDelMes(M).filter(f => diaSem(f) !== 0);
  const series = GRUPOS.map(g => ({ n: g.n, color: COLORES[g.id], vals: dias.map(f => totDia('prod', f, c => grupoDe(c.art, c.den) === g.id)) }));
  return barras(dias, series, v => fmtN(v, 0));
}
function graficoVentas(vd) {
  const dias = diasDelMes(M);
  return barras(dias, [
    { n: 'Ventas "1"', color: '#2f7a55', vals: dias.map(f => (vd[f] || {}).total || 0) },
    { n: 'Ventas "2"', color: '#9fcfb3', vals: dias.map(f => l2Dia(f).imp) }
  ], corto);
}

/* ================= celdas editables ================= */
/* Un número del sistema corregido a mano: AJ[clave] = { v, nota, sis, por, ts } */
const ov = (k, sis) => { const a = AJ[k]; return a ? (a.v != null ? a.v : a.kg) : sis; };
/* Debajo de un dato escrito a mano: lo que dice el sistema en la última lectura (en rojo si cambió desde que se corrigió) */
function notaSis(a, ahora, fmt) {
  const antes = a && a.sis != null ? a.sis : null, cambio = antes != null && Math.abs((ahora || 0) - antes) >= 0.5;
  return '<span class="sisn' + (cambio ? ' cambio' : '') + '">' + (cambio ? '⟳ sistema ahora ' : 'sistema ') + (fmt(ahora) || '0') + '</span>';
}
const tipSis = (a, ahora, fmt) => 'Escrito a mano por ' + (a.por || '?') + ' · sistema hoy: ' + (fmt(ahora) || '0') + (a.sis != null && Math.abs((ahora || 0) - a.sis) >= 0.5 ? ' (cuando se corrigió decía ' + (fmt(a.sis) || '0') + ')' : '') + (a.nota ? ' · ' + a.nota : '');
function tdv(k, sis, fmt, titulo, extra) {
  const a = AJ[k], v = ov(k, sis);
  const tip = a ? tipSis(a, sis, fmt) : 'Clic para corregir';
  return '<td class="num ed' + (a ? ' aj' : '') + (extra ? ' ' + extra : '') + '" data-ov="' + esc(k) + '" data-sis="' + sis + '" data-tit="' + esc(titulo) + '" data-v="' + r2(v) + '" title="' + esc(tip) + '">' + fmt(v) + (a ? notaSis(a, sis, fmt) : '') + '</td>';
}
function editarValor(k, sis, titulo) {
  const a = AJ[k];
  abrirDlg('Corregir · ' + esc(titulo),
    '<div class="sis">Según el sistema: <b>' + fmtN(sis, 2) + '</b>. Si el número correcto es otro, escribilo acá; el del sistema queda guardado al lado. Vacío = vuelve al del sistema.</div>' +
    '<div class="campos"><label>Valor correcto</label><input id="ov-v" class="big-num" value="' + (a ? fmtE(ov(k, sis), 2) : '') + '" placeholder="' + fmtN(sis, 2) + '"><label>Nota</label><input id="ov-n" value="' + esc(a ? a.nota || '' : '') + '" placeholder="Motivo (opcional)"></div>',
    [['Cancelar', cerrarDlg], ['Guardar', async () => {
      const n = leerNum($('ov-v').value), nota = $('ov-n').value.trim();
      if (Number.isNaN(n)) { toast('Número inválido', true); return; }
      try {
        AJ = await cambiarDoc('ajustes-' + M, d => { if (n == null) delete d[k]; else d[k] = { v: n, nota, sis, por: quien(), ts: new Date().toISOString() }; },
          titulo + ': ' + (n == null ? 'vuelve al sistema (' + fmtN(sis, 2) + ')' : fmtN(sis, 2) + ' → ' + fmtN(n, 2)) + (nota ? ' (' + nota + ')' : ''));
        cerrarDlg(); armar(); render(); toast('Guardado');
      } catch (e) { toast(e.message, true); }
    }, 'primary']]);
  setTimeout(() => $('ov-v') && $('ov-v').focus(), 50);
}
function td(t, f, art, den, extra) {
  const c = ((V[t] || {})[f] || {})[art];
  const v = c ? c.val : 0;
  const cls = 'num ed' + (c && c.aj ? (c.man ? ' man' : ' aj') : '');
  const tip = c && c.aj ? tipSis(c.aj, c.sis, kg1) : (c && c.nros.length ? 'Remito ' + c.nros.join(', ') : 'Clic para corregir');
  const nota = c && c.aj && !(c.man && !c.sis) ? notaSis(c.aj, c.sis, kg1) : '';
  return '<td class="' + cls + (extra ? ' ' + extra : '') + '" data-k="' + esc(t + '|' + f + '|' + art) + '" data-den="' + esc(den || (c && c.den) || art) + '" data-v="' + r2(v) + '" title="' + esc(tip) + '">' + kg(v) + nota + '</td>';
}
function tdGrupo(t, f, g, extra) {
  const cs = celdas(t, f).filter(c => grupoDe(c.art, c.den) === g);
  const v = cs.reduce((s, c) => s + c.val, 0);
  const aj = cs.some(c => c.aj);
  const ss = cs.reduce((s, c) => s + c.sis, 0), cambio = cs.some(c => c.aj && c.aj.sis != null && Math.abs(c.sis - c.aj.sis) >= 0.5);
  const nota = aj && (ss || cambio) ? '<span class="sisn' + (cambio ? ' cambio' : '') + '">' + (cambio ? '⟳ sistema ahora ' : 'sistema ') + (kg1(ss) || '0') + '</span>' : '';
  return '<td class="num ed' + (aj ? ' aj' : '') + (extra ? ' ' + extra : '') + '" data-g="' + esc(t + '|' + f + '|' + g) + '" data-v="' + r2(v) + '" title="' + esc(cs.map(c => lindo(c.den) + ': ' + kg1(c.val) + (c.aj ? ' (a mano; sistema ' + (kg1(c.sis) || '0') + ')' : '')).join('\n') || 'Clic para cargar') + '">' + kg(v) + nota + '</td>';
}
document.addEventListener('click', e => {
  const c = e.target.closest('td.ed'); if (!c) return;
  if (c.dataset.k) {
    const [t, f, art] = c.dataset.k.split('|');
    const cel = ((V[t] || {})[f] || {})[art] || { k: c.dataset.k, art, den: c.dataset.den, sis: 0, val: 0, nros: [] };
    editarLista(TIPOS[t], t, f, [cel], false);
  } else if (c.dataset.g) {
    const [t, f, g] = c.dataset.g.split('|');
    const cs = celdas(t, f).filter(x => grupoDe(x.art, x.den) === g);
    editarLista(TIPOS[t] + ' · ' + nombreGrupo(g), t, f, cs, true, g);
  } else if (c.dataset.ov) {
    editarValor(c.dataset.ov, Number(c.dataset.sis) || 0, c.dataset.tit || 'Dato');
  }
});

/* Opciones de productos para agregar a mano */
function opcionesArt(t, grupo) {
  const m = {};
  const add = (art, den) => { if (art && !m[art]) m[art] = den; };
  for (const x of artsDe(t)) add(x.art, x.den);
  if (t === 'prod' || t === 'emb') { for (const p of S.pr) add(p.art, p.den); for (const v of S.vc) add(v.art, v.den); }
  if (t === 'mp') for (const r of S.ri) if (r.des === 3) add(r.art, r.den);
  if (t === 'ing' || t === 'dev') { for (const r of S.ri) if (r.des === 5 || r.ori === 5) add(r.art, r.den); for (const v of S.vl) if (!esOtro(v.art)) add(baseLocal(v.art), v.den); }
  let arr = Object.entries(m).map(([art, den]) => ({ art, den }));
  if (grupo) arr = arr.filter(o => grupoDe(o.art, o.den) === grupo);
  return arr.sort((a, b) => Number(a.art) - Number(b.art));
}

/* Diálogo para corregir uno o varios datos de un día */
function editarLista(titulo, t, f, cels, agregar, grupo) {
  const filas = cels.map((c, i) =>
    '<tr><td>' + esc(lindo(c.den)) + ' <small class="muted">' + esc(c.art) + '</small>' + (c.nros && c.nros.length ? '<br><small class="muted">Remito ' + esc(c.nros.join(', ')) + '</small>' : '') + '</td>' +
    '<td class="num">' + (c.man && !c.sis ? '<span class="chip sm info">a mano</span>' : kg1(c.sis)) + '</td>' +
    '<td><input id="ev' + i + '" value="' + (c.aj ? fmtE(c.aj.kg, 2) : '') + '" placeholder="' + fmtN(c.sis, 2) + '"></td>' +
    '<td><input class="txt" id="en' + i + '" value="' + esc(c.aj ? c.aj.nota || '' : '') + '" placeholder="Motivo (opcional)"></td></tr>').join('');
  let add = '';
  if (agregar || !cels.length) {
    const ops = opcionesArt(t, grupo).filter(o => !cels.some(c => c.art === o.art));
    add = '<tr><td colspan="4" style="padding-top:12px"><b>Agregar un producto que no está</b></td></tr><tr><td><select id="ea-art"><option value="">— elegir —</option>' +
      ops.map(o => '<option value="' + esc(o.art) + '" data-den="' + esc(o.den) + '">' + esc(o.art + ' · ' + lindo(o.den)) + '</option>').join('') +
      '<option value="otro">Otro (escribir el código)</option></select><input id="ea-cod" class="txt" placeholder="Código y nombre, ej: 2000 Chorizo" style="display:none;margin-top:4px"></td><td></td><td><input id="ea-kg" placeholder="kg"></td><td><input class="txt" id="ea-nota" placeholder="Motivo"></td></tr>';
  }
  abrirDlg(esc(titulo) + ' · ' + DIAS[diaSem(f)] + ' ' + ddmm(f),
    '<div class="sis">Escribí el valor correcto en la columna <b>Correcto</b>. Si lo dejás vacío vale lo del sistema. El dato del sistema no se toca: queda guardado al lado.</div>' +
    '<table class="lista-ed"><thead><tr><th>Producto</th><th class="num">Sistema (kg)</th><th>Correcto (kg)</th><th>Nota</th></tr></thead><tbody>' + filas + add + '</tbody></table>',
    [['Cancelar', cerrarDlg], ['Guardar', () => guardarLista(t, f, cels), 'primary']]);
  const sel = $('ea-art'); if (sel) sel.onchange = () => { $('ea-cod').style.display = sel.value === 'otro' ? '' : 'none'; };
  setTimeout(() => { const i = $('ev0') || $('ea-kg'); if (i) i.focus(); }, 50);
}
async function guardarLista(t, f, cels) {
  const cambios = [], borrar = [], desc = [];
  try {
    cels.forEach((c, i) => {
      const n = leerNum($('ev' + i).value), nota = $('en' + i).value.trim();
      if (Number.isNaN(n)) throw new Error('Número inválido en ' + lindo(c.den));
      if (n == null) { if (c.aj) { borrar.push(c.k); desc.push(lindo(c.den) + ': vuelve al sistema (' + kg1(c.sis) + ')'); } return; }
      if (c.aj && Math.abs(c.aj.kg - n) < 0.005 && (c.aj.nota || '') === nota) return;
      cambios.push([c.k, { kg: n, den: c.den, nota, sis: c.sis, por: quien(), ts: new Date().toISOString() }]);
      desc.push(lindo(c.den) + ': ' + kg1(c.val) + ' → ' + kg1(n) + (nota ? ' (' + nota + ')' : ''));
    });
    const sel = $('ea-art');
    if (sel && sel.value) {
      let art = sel.value, den = sel.selectedOptions[0].dataset.den || '';
      if (art === 'otro') { const m = $('ea-cod').value.trim().match(/^(\d+)\s*(.*)$/); if (!m) throw new Error('Escribí el código del producto (ej: 2000 Chorizo)'); art = m[1]; den = m[2] || m[1]; }
      const n = leerNum($('ea-kg').value);
      if (n == null || Number.isNaN(n)) throw new Error('Falta el kg del producto agregado');
      const nota = $('ea-nota').value.trim();
      cambios.push([t + '|' + f + '|' + art, { kg: n, den, nota, sis: 0, por: quien(), ts: new Date().toISOString() }]);
      desc.push(lindo(den) + ': agregado ' + kg1(n) + (nota ? ' (' + nota + ')' : ''));
    }
  } catch (e) { toast(e.message, true); return; }
  if (!cambios.length && !borrar.length) { cerrarDlg(); return; }
  try {
    AJ = await cambiarDoc('ajustes-' + M, d => { for (const [k, v] of cambios) d[k] = v; for (const k of borrar) delete d[k]; },
      TIPOS[t] + ' ' + ddmm(f) + ': ' + desc.join('; '));
    cerrarDlg(); armar(); render(); toast('Guardado');
  } catch (e) { toast(e.message, true); }
}
/* Agregar un dato a mano en cualquier día */
function agregarDato(t) {
  const dias = diasDelMes(M);
  abrirDlg('Agregar dato a mano · ' + esc(TIPOS[t]),
    '<div class="campos"><label>Día</label><select id="ad-f">' + dias.map(f => '<option value="' + f + '"' + (f === hoyIso() ? ' selected' : '') + '>' + DIAS[diaSem(f)] + ' ' + ddmm(f) + '</option>').join('') + '</select></div>',
    [['Cancelar', cerrarDlg], ['Seguir', () => { const f = $('ad-f').value; cerrarDlg(); editarLista(TIPOS[t], t, f, celdas(t, f), true); }, 'primary']]);
}

/* ================= diálogo ================= */
function abrirDlg(titulo, cuerpo, botones) {
  $('dlg-h').innerHTML = titulo; $('dlg-b').innerHTML = cuerpo;
  const f = $('dlg-f'); f.innerHTML = '';
  for (const [t, fn, cls] of botones) { const b = document.createElement('button'); b.textContent = t; if (cls) b.className = cls; b.onclick = fn; f.appendChild(b); }
  const d = $('dlg'); if (!d.open) d.showModal();
}
function cerrarDlg() { const d = $('dlg'); if (d.open) d.close(); }
$('dlg').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); const b = $('dlg-f').querySelector('button.primary'); if (b) b.click(); }
});

/* ================= Ciclo III ================= */
/* Grupos grandes para los resúmenes del mes (el bombón va con su producto) */
const G3 = [['chorizo', 'Chorizo', ['chorizo', 'chbombon']], ['morcilla', 'Morcilla', ['morcilla', 'mbombon']], ['salchicha', 'Salchicha', ['salchicha']], ['otros', 'Otros', ['otros']]];
const g3De = (art, den) => { const g = grupoDe(art, den); return (G3.find(x => x[2].includes(g)) || G3[3])[0]; };
function toggleGrp(tr) {
  const abierto = tr.classList.toggle('abierto');
  document.querySelectorAll('tr[data-p="' + tr.dataset.g + '"]').forEach(x => x.hidden = !abierto);
}
function renderC3() {
  const dias = diasPlanilla();
  const grupos = GRUPOS.filter(g => g.id !== 'otros' || totMes('prod', c => grupoDe(c.art, c.den) === 'otros') > 0);
  const carnes = artsDe('mp').sort((a, b) => b.kg - a.kg);
  const hoy = hoyIso();
  let h = cabecera('Ciclo III · Producción y carne recibida', 'Producción del parte del sistema y carne de los remitos 1→3. Clic en cualquier número para corregirlo o cargarlo.',
    '<button onclick="agregarDato(\'prod\')">＋ Producción a mano</button><button onclick="agregarDato(\'mp\')">＋ Carne a mano</button>');
  let th = '<tr><th rowspan="2">Día</th><th class="gh sep" colspan="' + (grupos.length + 3) + '">Producción (kg)</th><th class="gh sep" colspan="' + (carnes.length + 1) + '">Carne recibida del frigorífico (kg)</th><th class="gh sep" colspan="2">Control</th></tr><tr>';
  grupos.forEach((g, i) => th += '<th class="num' + (i ? '' : ' sep') + '">' + g.n + '</th>');
  th += '<th class="num">Total día</th><th class="num">Promedio</th><th class="num">Días</th>';
  carnes.forEach((c, i) => th += '<th class="num' + (i ? '' : ' sep') + '">' + esc(lindo(c.den)) + '<br><small class="muted">' + esc(c.art) + '</small></th>');
  th += '<th class="num' + (carnes.length ? '' : ' sep') + '">Total carne</th><th class="sep">Carne ingresada por sistema en CIII</th><th>Remitos</th></tr>';
  let tb = '', acum = 0, nd = 0;
  for (const f of dias) {
    const tp = totDia('prod', f), tc = totDia('mp', f);
    if (tp > 0) { acum += tp; nd++; }
    const enParte = S.mp.filter(m => m.f === f).reduce((s, m) => s + m.kg, 0);
    const nros = [...new Set(celdas('mp', f).flatMap(c => c.nros))];
    tb += '<tr class="' + (diaSem(f) === 0 ? 'dom' : '') + (f === hoy ? ' hoy' : '') + '"><td><b>' + diaCorto(f) + '</b></td>';
    grupos.forEach((g, i) => tb += tdGrupo('prod', f, g.id, i ? '' : 'sep'));
    tb += '<td class="num" data-v="' + r2(tp) + '"><b>' + kg(tp) + '</b></td><td class="num muted" data-v="' + (nd ? r2(acum / nd) : '') + '">' + (tp > 0 ? kg(acum / nd) : '') + '</td><td class="num muted" data-v="' + (tp > 0 ? nd : '') + '">' + (tp > 0 ? nd : '') + '</td>';
    carnes.forEach((c, i) => tb += td('mp', f, c.art, c.den, i ? '' : 'sep'));
    tb += '<td class="num' + (carnes.length ? '' : ' sep') + '" data-v="' + r2(tc) + '"><b>' + kg(tc) + '</b></td>';
    tb += tp > 0 && !enParte && !AJ['parte|' + f] ? '<td class="sep ed" data-ov="parte|' + f + '" data-sis="0" data-tit="Carne ingresada por sistema en CIII ' + ddmm(f) + '"><span class="chip sm warn">falta cargar</span></td>' : tdv('parte|' + f, enParte, kg, 'Carne ingresada por sistema en CIII ' + ddmm(f), 'sep muted');
    tb += '<td class="muted" style="font-size:12.5px">' + esc(nros.join(' / ')) + '</td></tr>';
  }
  const tp = totMes('prod'), tc = totMes('mp');
  let tt = '<tr class="tot"><td>Total</td>';
  grupos.forEach((g, i) => tt += '<td class="num' + (i ? '' : ' sep') + '" data-v="' + r2(totMes('prod', c => grupoDe(c.art, c.den) === g.id)) + '">' + kg(totMes('prod', c => grupoDe(c.art, c.den) === g.id)) + '</td>');
  tt += '<td class="num" data-v="' + r2(tp) + '">' + kg(tp) + '</td><td class="num">' + (nd ? kg(tp / nd) : '') + '</td><td class="num">' + (nd || '') + '</td>';
  carnes.forEach((c, i) => tt += '<td class="num' + (i ? '' : ' sep') + '" data-v="' + r2(c.kg) + '">' + kg(c.kg) + '</td>');
  tt += '<td class="num' + (carnes.length ? '' : ' sep') + '" data-v="' + r2(tc) + '">' + kg(tc) + '</td><td class="sep">' + (tc ? 'Rendimiento del mes: ' + pct(tp / tc) : '') + '</td><td></td></tr>';
  h += '<section><div class="tw"><table class="planilla xl" data-hoja="Produccion-Carne"><thead>' + th + '</thead><tbody>' + tb + tt + '</tbody></table></div>' +
    '<p class="nota">Amarillo = escrito a mano (el punto naranja); debajo dice lo que marca el sistema en la última lectura, en rojo si el sistema cambió después. Verde = cargado a mano, no está en el sistema.</p></section>';

  // Producción y venta del mes: Chorizo / Morcilla / Salchicha, con el detalle desplegable
  const arts = artsDe('prod');
  let hp = '';
  for (const [gid, gn] of G3) {
    const it = arts.filter(a => g3De(a.art, a.den) === gid).sort((a, b) => b.kg - a.kg); if (!it.length) continue;
    const t = it.reduce((x, a) => x + a.kg, 0);
    hp += '<tr class="grp" onclick="toggleGrp(this)" data-g="p-' + gid + '"><td><span class="flecha">▸</span> <b>' + gn + '</b> <small class="muted">' + it.length + (it.length > 1 ? ' productos' : ' producto') + '</small></td><td class="num" data-v="' + r2(t) + '"><b>' + kg1(t) + '</b></td><td class="num muted">' + (tp ? pct(t / tp) : '') + '</td></tr>' +
      it.map(a => '<tr class="hijo" data-p="p-' + gid + '" hidden><td>' + esc(lindo(a.den)) + ' <small class="muted">' + esc(a.art) + '</small></td><td class="num" data-v="' + r2(a.kg) + '">' + kg1(a.kg) + '</td><td class="num muted">' + (tp ? pct(a.kg / tp) : '') + '</td></tr>').join('');
  }
  h += '<div class="grid2c"><section><h2>Producción del mes</h2><p class="sub">Clic en Chorizo, Morcilla o Salchicha para ver cada producto.</p><table class="xl lista" data-hoja="Produccion-producto"><thead><tr><th>Producto</th><th class="num">kg</th><th class="num">%</th></tr></thead><tbody>' + hp +
    '<tr class="tot"><td>Total</td><td class="num" data-v="' + r2(tp) + '">' + kg1(tp) + '</td><td></td></tr></tbody></table></section>';
  const vca = ventasC3();
  const vct = vca.reduce((a, v) => (a.kg += v.kg, a.neto += v.neto, a), { kg: 0, neto: 0 });
  let hv = '';
  for (const [gid, gn] of G3) {
    const it = vca.filter(v => g3De(v.art, v.den) === gid); if (!it.length) continue;
    const t = it.reduce((x, v) => (x.kg += v.kg, x.neto += v.neto, x), { kg: 0, neto: 0 });
    hv += '<tr class="grp" onclick="toggleGrp(this)" data-g="v-' + gid + '"><td><span class="flecha">▸</span> <b>' + gn + '</b> <small class="muted">' + it.length + (it.length > 1 ? ' productos' : ' producto') + '</small></td><td class="num" data-v="' + r2(t.kg) + '"><b>' + kg1(t.kg) + '</b></td><td class="num" data-v="' + r2(t.neto) + '"><b>' + pesos(t.neto) + '</b></td><td class="num">' + (t.kg ? pesos(t.neto / t.kg) : '') + '</td></tr>' +
      it.map(v => '<tr class="hijo" data-p="v-' + gid + '" hidden><td>' + esc(lindo(v.den)) + '</td>' + tdv('vck|' + M + '|' + v.art, v.kgSis, kg1, 'Facturado Ciclo III ' + lindo(v.den) + ' (kg)') + tdv('vcp|' + M + '|' + v.art, v.netoSis, pesos, 'Facturado Ciclo III ' + lindo(v.den) + ' ($ neto)') + '<td class="num">' + (v.kg ? pesos(v.neto / v.kg) : '') + '</td></tr>').join('');
  }
  h += '<section><h2>Venta del mes (facturado por Ciclo III)</h2><p class="sub">Neto sin IVA, sin lo que va al local. Clic en cada grupo para ver el detalle (y corregir).</p><table class="xl lista" data-hoja="Ventas C3"><thead><tr><th>Producto</th><th class="num">kg</th><th class="num">$ neto</th><th class="num">$/kg</th></tr></thead><tbody>' + hv +
    '<tr class="tot"><td>Total</td><td class="num" data-v="' + r2(vct.kg) + '">' + kg1(vct.kg) + '</td><td class="num" data-v="' + r2(vct.neto) + '">' + pesos(vct.neto) + '</td><td class="num">' + (vct.kg ? pesos(vct.neto / vct.kg) : '') + '</td></tr></tbody></table></section></div>';

  // Embutidos enviados al local
  h += '<section><h2>Enviado del Ciclo III al local comercial (remitos 3→5)</h2><p class="sub">Clic en un número para corregir.</p>' + tablaGrupos('emb') + '</section>';
  $('main').innerHTML = h;
}
function tablaGrupos(t) {
  const fs = fechasCon(t);
  if (!fs.length) return '<div class="empty">No hay remitos en el mes. <a href="#" onclick="agregarDato(\'' + t + '\');return false">Agregar a mano</a></div>';
  const gs = GRUPOS.filter(g => totMes(t, c => grupoDe(c.art, c.den) === g.id) > 0 || g.id !== 'otros');
  let h = '<div class="tw"><table class="planilla xl" data-hoja="Embutidos al local"><thead><tr><th>Día</th><th>Remito</th>' + gs.map(g => '<th class="num">' + g.n + '</th>').join('') + '<th class="num">Total</th></tr></thead><tbody>';
  for (const f of fs) {
    const nros = [...new Set(celdas(t, f).flatMap(c => c.nros))];
    h += '<tr><td><b>' + diaCorto(f) + '</b></td><td class="muted">' + esc(nros.join(' / ')) + '</td>' + gs.map(g => tdGrupo(t, f, g.id)).join('') + '<td class="num" data-v="' + r2(totDia(t, f)) + '"><b>' + kg1(totDia(t, f)) + '</b></td></tr>';
  }
  h += '<tr class="tot"><td>Total</td><td></td>' + gs.map(g => { const v = totMes(t, c => grupoDe(c.art, c.den) === g.id); return '<td class="num" data-v="' + r2(v) + '">' + kg1(v) + '</td>'; }).join('') + '<td class="num" data-v="' + r2(totMes(t)) + '">' + kg1(totMes(t)) + '</td></tr></tbody></table></div>' +
    '<div style="margin-top:8px"><button class="small" onclick="agregarDato(\'' + t + '\')">＋ Agregar a mano</button></div>';
  return h;
}

/* ================= Local · Mercadería ================= */
function renderMerc() {
  let h = cabecera('Local · Mercadería', 'Igual que la planilla de Ingreso-Egreso: lo que entra al local por remito, lo que se devuelve y los embutidos. Clic en un número para corregirlo.', '');
  h += '<section><h2>Ingreso de cortes (remitos 1→5)</h2>' + matriz('ing', 'Ingreso de cortes') + '</section>';
  h += '<section><h2>Devolución al frigorífico (remitos 5→1)</h2>' + matriz('dev', 'Devolucion') + '</section>';
  h += '<section><h2>Embutidos · ingreso desde Ciclo III (remitos 3→5)</h2>' + matriz('emb', 'Embutidos') + '</section>';
  $('main').innerHTML = h;
}
function matriz(t, hoja) {
  const fs = fechasCon(t);
  const arts = artsDe(t).sort((a, b) => Number(a.art) - Number(b.art));
  if (!fs.length) return '<div class="empty">No hay remitos en el mes. <a href="#" onclick="agregarDato(\'' + t + '\');return false">Agregar a mano</a></div>';
  let h = '<div class="tw"><table class="planilla xl" data-hoja="' + esc(hoja) + '"><thead><tr><th>Cód. · Artículo</th>';
  for (const f of fs) { const nros = [...new Set(celdas(t, f).flatMap(c => c.nros))]; h += '<th class="num">' + diaCorto(f) + '<br><small class="muted">' + esc(nros.join(' ')) + '</small></th>'; }
  h += '<th class="num sep">Total</th></tr></thead><tbody>';
  for (const a of arts) {
    h += '<tr><td><small class="muted">' + esc(a.art) + '</small> ' + esc(lindo(a.den)) + '</td>' + fs.map(f => td(t, f, a.art, a.den)).join('') + '<td class="num sep" data-v="' + r2(a.kg) + '"><b>' + kg1(a.kg) + '</b></td></tr>';
  }
  h += '<tr class="tot"><td>Total</td>' + fs.map(f => '<td class="num" data-v="' + r2(totDia(t, f)) + '">' + kg1(totDia(t, f)) + '</td>').join('') + '<td class="num sep" data-v="' + r2(totMes(t)) + '">' + kg1(totMes(t)) + '</td></tr></tbody></table></div>' +
    '<div style="margin-top:8px"><button class="small" onclick="agregarDato(\'' + t + '\')">＋ Agregar a mano</button></div>';
  return h;
}

/* ================= Local · Ventas ================= */
function controlLocal() {
  const m = {};
  const row = (base, den) => (m[base] = m[base] || { art: base, den, ing: 0, dev: 0, v1: 0, v1sis: 0, imp1: 0, imp1sis: 0, v2: 0, imp2: 0, st: 0, stSis: 0 });
  for (const t of ['ing', 'emb']) for (const a of artsDe(t)) row(EQUIV[a.art] || a.art, a.den).ing += a.kg;
  for (const a of artsDe('dev')) row(EQUIV[a.art] || a.art, a.den).dev += a.kg;
  for (const v of S.vl) { if (esOtro(v.art)) continue; const r = row(baseLocal(v.art), v.den); r.v1sis += v.kg; r.imp1sis += v.total; }
  for (const f of diasDelMes(M)) for (const i of l2Dia(f).items) { if (!i.art) continue; const r = row(baseLocal(i.art), i.den || i.art); r.v2 += Number(i.kg) || 0; r.imp2 += Number(i.imp) || 0; }
  for (const s of S.st) if (s.fri === 5) { const b = EQUIV[s.art] || s.art; if (m[b]) m[b].stSis += ov('st5|' + s.art, s.kg); }
  for (const r of Object.values(m)) { r.v1 = ov('v1|' + M + '|' + r.art, r.v1sis); r.imp1 = ov('imp1|' + M + '|' + r.art, r.imp1sis); r.st = ov('stc|' + r.art, r.stSis); }
  return Object.values(m).filter(r => r.ing || r.dev || r.v1 || r.v2).sort((a, b) => Number(a.art) - Number(b.art));
}
function renderVentas() {
  const rows = controlLocal();
  const vd = ventasDia(), cj = datosCaja();
  let h = cabecera('Local · Ventas', 'Ventas "1" del sistema y "2" cargadas a mano, comparadas con lo que entró al local.', '<button class="primary" onclick="editarL2(hoyIso())">＋ Cargar venta "2"</button>');
  const T = rows.reduce((a, r) => { for (const k of ['ing', 'dev', 'v1', 'v2', 'imp1', 'imp2']) a[k] += r[k]; return a; }, { ing: 0, dev: 0, v1: 0, v2: 0, imp1: 0, imp2: 0 });
  h += '<section><h2>Control del mes por producto (kg)</h2><p class="sub">Entró (cortes + embutidos) − devuelto = lo que quedó para vender. Vendido "1" + "2" = lo que salió. La diferencia es lo que quedó en la cámara, merma o algo sin cargar.</p><div class="tw"><table class="planilla xl" data-hoja="Control por producto"><thead><tr><th>Producto</th><th class="num">Entró</th><th class="num">Devuelto</th><th class="num">Para vender</th><th class="num sep">Vendido "1"</th><th class="num">Vendido "2"</th><th class="num">Total vendido</th><th class="num sep">Diferencia</th><th class="num sep">$ "1"</th><th class="num">$ "2"</th></tr></thead><tbody>';
  for (const r of rows) {
    const neto = r.ing - r.dev, tv = r.v1 + r.v2, dif = neto - tv;
    h += '<tr><td><small class="muted">' + esc(r.art) + '</small> ' + esc(lindo(r.den)) + '</td><td class="num" data-v="' + r2(r.ing) + '">' + kg1(r.ing) + '</td><td class="num" data-v="' + r2(r.dev) + '">' + kg1(r.dev) + '</td><td class="num" data-v="' + r2(neto) + '">' + kg1(neto) + '</td>' +
      tdv('v1|' + M + '|' + r.art, r.v1sis, kg1, 'Vendido "1" en el mes · ' + lindo(r.den) + ' (kg)', 'sep') +
      '<td class="num" data-v="' + r2(r.v2) + '">' + kg1(r.v2) + '</td><td class="num" data-v="' + r2(tv) + '"><b>' + kg1(tv) + '</b></td>' +
      '<td class="num sep' + (dif < -0.5 ? ' neg' : '') + '" data-v="' + r2(dif) + '">' + kg1(dif) + '</td>' + tdv('imp1|' + M + '|' + r.art, r.imp1sis, pesos, 'Vendido "1" en el mes · ' + lindo(r.den) + ' ($)', 'sep') + '<td class="num" data-v="' + r2(r.imp2) + '">' + pesos(r.imp2) + '</td></tr>';
  }
  h += '<tr class="tot"><td>Total</td><td class="num">' + kg1(T.ing) + '</td><td class="num">' + kg1(T.dev) + '</td><td class="num">' + kg1(T.ing - T.dev) + '</td><td class="num sep">' + kg1(T.v1) + '</td><td class="num">' + kg1(T.v2) + '</td><td class="num">' + kg1(T.v1 + T.v2) + '</td><td class="num sep">' + kg1(T.ing - T.dev - T.v1 - T.v2) + '</td><td class="num sep">' + pesos(T.imp1) + '</td><td class="num">' + pesos(T.imp2) + '</td></tr></tbody></table></div></section>';

  // Ventas por día
  const mes = LOC.mes || {};
  h += '<section><h2>Ventas por día</h2><p class="sub">"1" sale del sistema (debe ser igual a la Zeta). "2" se carga acá o desde la pantalla del encargado. Clic en un día para cargar o corregir la venta "2".</p><div class="tw"><table class="planilla xl" data-hoja="Ventas por dia"><thead><tr><th>Día</th><th class="num">"1" sistema</th><th class="num">Zeta (caja)</th><th class="num sep">"2"</th><th class="num">Total</th><th class="num sep">kg "1"</th><th class="num">kg "2"</th><th>Cargó</th></tr></thead><tbody>';
  let t1 = 0, t2 = 0, k1 = 0, k2 = 0;
  for (const f of diasDelMes(M)) {
    const v = vd[f] || { total: 0, kg: 0 }, l = l2Dia(f), z = cj[f] ? cj[f].zeta : null, d = (LOC.dias || {})[f] || {};
    if (!v.total && !l.imp && !l.kg && z == null && f > hoyIso()) continue;
    t1 += v.total; t2 += l.imp; k1 += v.kg; k2 += l.kg;
    const zd = z != null && Math.abs(z - v.total) > 1;
    h += '<tr class="' + (diaSem(f) === 0 ? 'dom' : '') + '"><td><b>' + diaCorto(f) + '</b></td>' + tdv('vd|' + f, v.totalSis || 0, pesos, 'Venta "1" del ' + ddmm(f) + ' ($)') + '<td class="num' + (zd ? ' neg' : '') + '" data-v="' + (z == null ? '' : r2(z)) + '">' + (z == null ? '' : pesos(z)) + '</td>' +
      '<td class="num sep ed" onclick="editarL2(\'' + f + '\')" data-v="' + r2(l.imp) + '">' + pesos(l.imp) + '</td><td class="num" data-v="' + r2(v.total + l.imp) + '"><b>' + pesos(v.total + l.imp) + '</b></td>' +
      tdv('vdk|' + f, v.kgSis || 0, kg1, 'Venta "1" del ' + ddmm(f) + ' (kg)', 'sep') + '<td class="num ed" onclick="editarL2(\'' + f + '\')" data-v="' + r2(l.kg) + '">' + kg1(l.kg) + '</td><td class="muted" style="font-size:12.5px">' + esc(d.por || '') + '</td></tr>';
  }
  h += '<tr class="tot"><td>Total</td><td class="num">' + pesos(t1) + '</td><td></td><td class="num sep">' + pesos(t2) + '</td><td class="num">' + pesos(t1 + t2) + '</td><td class="num sep">' + kg1(k1) + '</td><td class="num">' + kg1(k2) + '</td><td></td></tr></tbody></table></div>' +
    '<div class="row" style="margin-top:14px"><b>Donación del mes:</b> <input id="don-kg" style="width:110px" value="' + (mes.donKg != null ? fmtE(mes.donKg, 2) : '') + '" placeholder="kg"> kg <input id="don-imp" style="width:140px" value="' + (mes.donImp != null ? fmtE(mes.donImp, 0) : '') + '" placeholder="$"> $ <button class="small" onclick="guardarDonacion()">Guardar</button></div></section>';

  // Otros productos
  const ot = {};
  for (const v of S.vl) if (esOtro(v.art)) { const x = ot[v.art + v.den] = ot[v.art + v.den] || { art: v.art, den: v.den, cant: 0, total: 0 }; x.cant += v.kg || v.cant; x.total += v.total; }
  const ota = Object.values(ot).sort((a, b) => b.total - a.total);
  if (ota.length) h += '<section><h2>Otros productos (bebidas, carbón, etc.)</h2><table class="xl" data-hoja="Otros productos" style="max-width:760px"><thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">$ con IVA</th></tr></thead><tbody>' +
    ota.map(o => { const k = o.art + '~' + o.den.replace(/[^A-Za-z0-9]/g, '').slice(0, 24); return '<tr><td>' + esc(lindo(o.den)) + ' <small class="muted">' + esc(o.art) + '</small></td>' + tdv('vok|' + M + '|' + k, o.cant, v => fmtN(v, 0), lindo(o.den) + ' (cantidad del mes)') + tdv('vop|' + M + '|' + k, o.total, pesos, lindo(o.den) + ' ($ del mes)') + '</tr>'; }).join('') + '</tbody></table></section>';
  $('main').innerHTML = h;
}
async function guardarDonacion() {
  const k = leerNum($('don-kg').value), i = leerNum($('don-imp').value);
  if (Number.isNaN(k) || Number.isNaN(i)) { toast('Número inválido', true); return; }
  try {
    LOC = await cambiarDoc('local-' + M, d => { d.mes = d.mes || {}; d.mes.donKg = k; d.mes.donImp = i; }, 'Donación ' + nombreMes(M) + ': ' + kg1(k) + ' kg ' + pesos(i));
    toast('Guardado');
  } catch (e) { toast(e.message, true); }
}

function editarL2(f) {
  const dia = ((LOC.dias || {})[f]) || {};
  const items = (dia.l2 || []).map(i => ({ ...i }));
  if (!items.length) items.push({ art: '', kg: '', imp: '' });
  const prods = productosLocal(S);
  const fila = (i, it) => '<tr><td><select id="l2a' + i + '"><option value="">— producto —</option>' + prods.map(p => '<option value="' + p.art + '"' + (String(it.art) === p.art ? ' selected' : '') + '>' + esc(p.den) + '</option>').join('') + '</select></td>' +
    '<td><input id="l2k' + i + '" value="' + (it.kg !== '' && it.kg != null ? fmtE(it.kg, 2) : '') + '" placeholder="kg"></td><td><input id="l2i' + i + '" value="' + (it.imp !== '' && it.imp != null ? fmtE(it.imp, 2) : '') + '" placeholder="$"></td></tr>';
  let n = items.length;
  const body = () => '<div class="campos" style="margin-bottom:12px"><label>Día</label><input type="date" id="l2f" value="' + f + '" style="max-width:180px"><label>Total venta "2" del día ($)</label><input id="l2dos" class="big-num" value="' + (dia.caja && dia.caja.dos != null ? fmtE(dia.caja.dos, 0) : '') + '" placeholder="si se deja vacío, es la suma de abajo"></div>' +
    '<p class="sub" style="margin:0 0 6px">Detalle por producto (kg y, si se sabe, el $):</p><table class="lista-ed"><thead><tr><th>Producto</th><th>kg</th><th>$</th></tr></thead><tbody id="l2b">' + items.map((it, i) => fila(i, it)).join('') + '</tbody></table>' +
    '<button class="small" id="l2mas" style="margin-top:8px">＋ Otro producto</button>';
  abrirDlg('Venta "2" del local', body(), [['Cancelar', cerrarDlg], ['Guardar', () => guardarL2(f, n), 'primary']]);
  $('l2mas').onclick = () => { $('l2b').insertAdjacentHTML('beforeend', fila(n, { art: '', kg: '', imp: '' })); n++; };
}
async function guardarL2(f0, n) {
  const f = $('l2f').value || f0;
  if (f.slice(0, 7) !== M) { toast('Elegí un día de ' + nombreMes(M) + ' (o cambiá de mes arriba)', true); return; }
  const items = [];
  for (let i = 0; i < n; i++) {
    const a = $('l2a' + i); if (!a || !a.value) continue;
    const k = leerNum($('l2k' + i).value), im = leerNum($('l2i' + i).value);
    if (Number.isNaN(k) || Number.isNaN(im)) { toast('Número inválido en ' + a.selectedOptions[0].text, true); return; }
    if (k == null && im == null) continue;
    items.push({ art: a.value, den: a.selectedOptions[0].text, kg: k, imp: im });
  }
  const dos = leerNum($('l2dos').value);
  if (Number.isNaN(dos)) { toast('Total inválido', true); return; }
  try {
    LOC = await cambiarDoc('local-' + M, d => {
      d.dias = d.dias || {}; const x = d.dias[f] = d.dias[f] || {};
      x.l2 = items; x.caja = x.caja || {};
      x.caja.dos = dos != null ? dos : (items.some(i => i.imp != null) ? items.reduce((s, i) => s + (i.imp || 0), 0) : null);
      x.por = quien(); x.ts = new Date().toISOString();
    }, 'Venta "2" ' + ddmm(f) + ': ' + items.map(i => i.den + ' ' + kg1(i.kg) + ' kg').join(', ') + (dos != null ? ' · total ' + pesos(dos) : ''));
    cerrarDlg(); render(); toast('Guardado');
  } catch (e) { toast(e.message, true); }
}

/* ================= Local · Caja ================= */
/* Columnas de la planilla de caja de Carlos (las mismas casillas que la planilla de papel del local) */
const CAJA_COLS = [
  ['sa', 'Saldo ant.', 'i'], ['zeta', 'Zeta', 'i'], ['dos', '"2"', 'i'], ['p1', 'Cta Cte "1"', 'i'], ['p2', 'Cta Cte "2"', 'i'], ['acta', 'A cta', 'i'],
  ['emp', 'Empleados', 'e'], ['ctad', 'Cta Cte "1"', 'e'], ['ctad2', 'Cta Cte "2"', 'e'],
  ['contado', 'Caja (lo que hay)', 'c'], ['dif', 'Diferencia', 'c'], ['ent', 'Entrega', 'c']
];
const etiquetaCaja = k => ({ sa: 'Saldo anterior', zeta: 'Zeta', dos: '"2"', p1: 'Cta Cte "1" (cobrado)', p2: 'Cta Cte "2" (cobrado)', acta: 'A cta', emp: 'Empleados', ctad: 'Cta Cte "1" (fiado)', ctad2: 'Cta Cte "2" (fiado)', contado: 'Caja (lo que hay)', dif: 'Diferencia', ent: 'Entrega', scaja: 'Saldo caja' }[k] || k);
const lunesDe = f => { const d = fechaDe(f), l = new Date(d); l.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDe(l); };
function renderCaja() {
  const cj = datosCaja(), vd = ventasDia(), dias = diasDelMes(M), hoy = hoyIso();
  let h = cabecera('Local · Caja diaria', 'Las mismas casillas que la planilla de caja del local. Se escribe directo y se guarda solo. Los egresos van en positivo. "Planilla" abre la hoja completa del día (detalle de la caja, cuentas pagas y notas del encargado).',
    '<button onclick="completarZetas()">Completar Zetas vacías con el sistema</button>');
  h += '<section style="padding:10px 12px"><div class="tw caja-tw"><table class="planilla caja"><thead>' +
    '<tr><th rowspan="2">Día</th><th class="gh sep" colspan="7">Ingresos</th><th class="gh sep" colspan="4">Egresos</th><th class="gh sep" colspan="5">Caja</th><th rowspan="2" class="sep">Planilla</th></tr><tr>' +
    '<th class="num sep">Saldo ant.</th><th class="num">Zeta</th><th class="num">"2"</th><th class="num">Cta Cte "1"</th><th class="num">Cta Cte "2"</th><th class="num">A cta</th><th class="num">Total (1)</th>' +
    '<th class="num sep">Empleados</th><th class="num">Cta Cte "1"</th><th class="num">Cta Cte "2"</th><th class="num">Total (2)</th>' +
    '<th class="num sep">Total "1"−"2"</th><th class="num">Caja (lo que hay)</th><th class="num">Diferencia</th><th class="num">Entrega</th><th class="num">Saldo</th></tr></thead><tbody>';
  let semana = null;
  for (const f of dias) {
    const sem = lunesDe(f);
    if (sem !== semana) { if (semana) h += filaTotSemana(semana, cj); semana = sem; h += '<tr class="semana"><td colspan="18">Semana del ' + ddmm(sem) + '</td></tr>'; }
    const d = ((LOC.dias || {})[f] || {}), c = d.caja || {}, x = cj[f];
    const inp = (k, ph) => '<input class="chico" data-f="' + f + '" data-c="' + k + '" value="' + (nv(c[k]) != null ? fmtE(['sa', 'dif'].includes(k) ? nv(c[k]) : Math.abs(nv(c[k])), 2) : '') + '"' + (ph ? ' placeholder="' + ph + '"' : '') + '>';
    const sis = vd[f] ? vd[f].total : null;
    const zetaHint = sis != null ? (x.zeta == null ? '<span class="hint">sistema ' + pesos(sis) + '</span>' : (Math.abs(x.zeta - sis) > 1 ? '<span class="hint dif">sistema ' + pesos(sis) + '</span>' : '')) : '';
    const calc = (v, id) => '<td class="calc"' + (id ? ' id="' + id + '"' : '') + '>' + (x.cargado ? fmtN(v, 2) : '') + '</td>';
    const enc = d.por && d.por !== quien();
    h += '<tr class="' + (diaSem(f) === 0 ? 'dom' : '') + (f === hoy ? ' hoy' : '') + (enc ? ' enc' : '') + '"><td><b>' + DIAS[diaSem(f)].slice(0, 3) + ' ' + ddmm(f) + '</b>' + (d.por ? '<br><small class="muted">' + esc(d.por) + '</small>' : '') + '</td>' +
      '<td class="sep">' + inp('sa', (x.cargado || f <= hoy) && x.sa ? fmtN(x.sa, 2) : '') + '</td><td>' + inp('zeta') + zetaHint + '</td><td>' + inp('dos') + '</td><td>' + inp('p1') + '</td><td>' + inp('p2') + '</td><td>' + inp('acta') + '</td>' + calc(x.t1) +
      '<td class="sep">' + inp('emp') + '</td><td>' + inp('ctad') + '</td><td>' + inp('ctad2') + '</td>' + calc(x.t2) +
      '<td class="calc sep">' + (x.cargado ? fmtN(x.neto, 2) : '') + '</td>' +
      '<td>' + (x.conDetalle ? '<div class="calc" style="text-align:right"><a href="#" onclick="abrirPlanilla(\'' + f + '\');return false" title="Suma del detalle de la caja">' + fmtN(x.contado, 2) + '</a></div>' : inp('contado')) + '</td>' +
      '<td>' + (x.contado != null ? '<div class="calc" style="text-align:right' + (Math.abs(x.dif) >= 1000 ? ';color:var(--bad)' : '') + '">' + fmtN(x.dif, 2) + '</div>' : inp('dif')) + '</td>' +
      '<td>' + inp('ent') + '</td>' + calc(x.saldo) +
      '<td class="sep" style="white-space:nowrap"><button class="small" onclick="abrirPlanilla(\'' + f + '\')">Planilla</button>' + (d.obs ? ' <span title="' + esc(d.obs) + '" style="cursor:help">📝</span>' : '') + '</td></tr>';
  }
  if (semana) h += filaTotSemana(semana, cj);
  h += '</tbody></table></div><p class="nota">Total (1) = saldo anterior + Zeta + "2" + Cta Cte "1" + Cta Cte "2" + A cta. Total (2) = Empleados + Cta Cte "1" + Cta Cte "2". Diferencia = lo que hay en la caja − (Total "1" − "2"). Saldo = Total "1" − "2" − Entrega. El día siguiente arranca con el saldo más la diferencia (el saldo anterior se puede escribir a mano). Borde verde = lo cargó el encargado. 📝 = tiene notas.</p></section>';
  $('main').innerHTML = h;
  document.querySelectorAll('.caja input[data-f]').forEach(i => i.addEventListener('change', () => guardarCampoCaja(i)));
}
function abrirPlanilla(f) { window.open('/caja?f=' + f, '_blank'); }
function filaTotSemana(lunes, cj) {
  const fs = diasDelMes(M).filter(f => lunesDe(f) === lunes);
  const sum = k => fs.reduce((s, f) => s + Math.abs(nv((((LOC.dias || {})[f] || {}).caja || {})[k]) || 0), 0);
  const sc = k => fs.reduce((s, f) => s + (cj[f].cargado ? cj[f][k] || 0 : 0), 0);
  const n = v => '<td class="num">' + fmtN(v, 2) + '</td>';
  return '<tr class="tot"><td>Totales</td><td class="sep"></td>' + ['zeta', 'dos', 'p1', 'p2', 'acta'].map(k => n(sum(k))).join('') + '<td></td>' +
    '<td class="num sep">' + fmtN(sum('emp'), 2) + '</td>' + n(sum('ctad')) + n(sum('ctad2')) + '<td></td><td class="sep"></td><td></td>' + n(sc('dif')) + n(sum('ent')) + '<td></td><td class="sep"></td></tr>';
}
async function guardarCampoCaja(inp) {
  const f = inp.dataset.f, k = inp.dataset.c;
  let n = leerNum(inp.value);
  if (Number.isNaN(n)) { inp.classList.add('bad'); toast('Número inválido', true); return; }
  inp.classList.remove('bad'); inp.classList.add('guardando');
  if (n != null && !['sa', 'dif'].includes(k)) n = Math.abs(n);
  try {
    LOC = await cambiarDoc('local-' + M, d => {
      d.dias = d.dias || {}; const x = d.dias[f] = d.dias[f] || {}; x.caja = x.caja || {};
      if (n == null) delete x.caja[k]; else x.caja[k] = n;
      if (k === 'contado' && n != null) delete x.caja.dif;
      x.por = x.por || quien(); x.ts = new Date().toISOString();
    }, 'Caja ' + ddmm(f) + ' ' + etiquetaCaja(k) + ': ' + (n == null ? 'borrado' : fmtN(n, 2)));
    // se vuelve a dibujar con los saldos nuevos y el cursor queda donde estaba
    const act = document.activeElement, af = act && act.dataset ? act.dataset.f : null, ac = act && act.dataset ? act.dataset.c : null;
    const y = window.scrollY, tw = document.querySelector('.caja') && document.querySelector('.caja').closest('.tw'), x = tw ? tw.scrollLeft : 0;
    renderCaja(); window.scrollTo(0, y);
    const tw2 = document.querySelector('.caja').closest('.tw'); if (tw2) tw2.scrollLeft = x;
    const ok = document.querySelector('.caja input[data-f="' + f + '"][data-c="' + k + '"]'); if (ok) ok.classList.add('ok');
    if (af && ac) {
      const nx = document.querySelector('.caja input[data-f="' + af + '"][data-c="' + ac + '"]');
      if (nx) { if (act.value !== nx.value) { nx.value = act.value; } nx.focus(); try { nx.setSelectionRange(nx.value.length, nx.value.length); } catch (e) {} }
    }
  } catch (e) { inp.classList.remove('guardando'); inp.classList.add('bad'); toast(e.message, true); }
}
async function completarZetas() {
  const vd = ventasDia(), hoy = hoyIso();
  const fs = diasDelMes(M).filter(f => f < hoy && vd[f] && vd[f].total && nv(((((LOC.dias || {})[f]) || {}).caja || {}).zeta) == null);
  if (!fs.length) { toast('No hay Zetas vacías con ventas en el sistema'); return; }
  if (!confirm('Se completan ' + fs.length + ' Zetas con lo facturado en el sistema (' + fs.map(ddmm).join(', ') + '). ¿Seguir?')) return;
  try {
    LOC = await cambiarDoc('local-' + M, d => { d.dias = d.dias || {}; for (const f of fs) { const x = d.dias[f] = d.dias[f] || {}; x.caja = x.caja || {}; x.caja.zeta = r2(vd[f].total); } },
      'Caja: Zetas completadas con el sistema ' + fs.map(ddmm).join(', '));
    renderCaja(); toast('Listo');
  } catch (e) { toast(e.message, true); }
}

/* ================= Insumos ================= */
const UM = { '0': 'unid.', '1': 'kg', '2': 'unid.', '3': 'litro' };
function formulasIniciales() {
  const L = (nombre, cant, ins, tipo) => ({ nombre, cant, ins: ins || '', tipo: tipo || 'insumo' });
  const chorizo = [L('Recorte', 100, '', 'carne'), L('Pimienta', 0.2, '20016'), L('Nuez moscada', 0.1, '20013'), L('Sal', 2, '20018'), L('Naturfresh', 0.45, '20039'), L('Fosfato', 0.1, '20009'), L('Colorante', 0, '20022'), L('Preservar', 1, '20023'), L('Vino', 3, '20021'), L('Agua', 0, '', 'insumo')];
  return {
    recetas: [
      { id: 'chorizo', nombre: 'Chorizo Qualitá', lineas: [...chorizo, L('Tripa chinesca 38/40 (madejas)', 0, '20036', 'envase')] },
      { id: 'salchicha', nombre: 'Salchicha Qualitá', lineas: chorizo.map(l => l.nombre === 'Naturfresh' ? L('Antioxidante', 0.45, '20039') : { ...l }).concat([L('Tripa (madejas)', 0, '', 'envase')]) },
      { id: 'morcilla', nombre: 'Morcilla de cerdo', lineas: [L('Carne cabezas', 33.3, '', 'carne'), L('Cuero', 66.7, '', 'carne'), L('Fosfato', 0.1, '20009'), L('Cebolla', 4, '20026'), L('Sal', 2.7, '20018'), L('Pimienta', 0.2, '20016'), L('Orégano', 0.5, '20014'), L('Ají', 0.1, '20011'), L('Nuez', 0.133, '20013'), L('Comino', 0.1, '20012'), L('Sangre', 20, '', 'carne'), L('Tripa orilla 46 (madejas)', 0, '20033', 'envase')] },
      { id: 'roquefort', nombre: 'Chorizo con Roquefort', lineas: [...chorizo.map(l => ({ ...l })), L('Roquefort', 10, 'x-roquefort')] },
      { id: 'parmesano', nombre: 'Chorizo con Parmesano y Morrón', lineas: [...chorizo.map(l => ({ ...l })), L('Parmesano', 10, 'x-parmesano'), L('Morrón', 5, 'x-morron')] }
    ],
    asignacion: { chorizo: 'chorizo', chbombon: 'chorizo', morcilla: 'morcilla', mbombon: 'morcilla', salchicha: 'salchicha', otros: '' },
    inicial: true
  };
}
const recetaDe = grupo => (FOR.recetas || []).find(r => r.id === (FOR.asignacion || {})[grupo]);
const baseReceta = r => r.lineas.filter(l => l.tipo !== 'envase').reduce((s, l) => s + (Number(l.cant) || 0), 0);

async function asegurarInsumos() {
  const conteos = (INS.conteos || []);
  let desde = M + '-01';
  const ult = ultimosConteos();
  for (const id in ult) if (ult[id].fecha < desde) desde = ult[id].fecha;
  if (SINS && SINSdesde <= desde) return;
  const x = parseSistema(await sisTexto('ins'));
  x.ci = x.ci.filter(c => c.f >= desde); x.pr = x.pr.filter(c => c.f >= desde);
  SINS = x; SINSdesde = desde;
}
function ultimosConteos() {
  const u = {};
  for (const c of (INS.conteos || [])) if (!u[c.id] || c.fecha > u[c.id].fecha || (c.fecha === u[c.id].fecha && c.ts > u[c.id].ts)) u[c.id] = c;
  return u;
}
function listaInsumos() {
  const m = {};
  for (const r of FOR.recetas || []) for (const l of r.lineas) if (l.ins && !m[l.ins]) m[l.ins] = { id: l.ins, nombre: l.nombre, unidad: 'kg', sistema: false };
  for (const i of SINS.il) m[i.id] = { id: i.id, nombre: lindo(i.den), unidad: UM[i.um] || 'kg', sistema: true, precioSis: i.precio };
  for (const [id, x] of Object.entries(INS.lista || {})) {
    const y = m[id] = m[id] || { id, sistema: false, unidad: 'kg', nombre: id };
    if (x.nombre) y.nombre = x.nombre; if (x.unidad) y.unidad = x.unidad;
  }
  for (const y of Object.values(m)) { const x = (INS.lista || {})[y.id] || {}; y.precio = x.precio != null ? x.precio : (y.precioSis || 0); y.precioAMano = x.precio != null; }
  return Object.values(m);
}
/* producción por día y artículo (sistema; en el mes en pantalla, con las correcciones) */
function produccionDesde(desde) {
  const out = {};
  for (const p of SINS.pr) { if (p.f < desde || p.f.slice(0, 7) === M) continue; (out[p.f] = out[p.f] || []).push({ art: p.art, den: p.den, kg: p.kg }); }
  for (const f in V.prod) if (f >= desde) out[f] = celdas('prod', f).map(c => ({ art: c.art, den: c.den, kg: c.val }));
  return out;
}
/* consumo teórico de cada insumo por día */
function consumos(desde, sinCorrecciones) {
  const prod = produccionDesde(desde), out = {};
  for (const f in prod) for (const p of prod[f]) {
    const r = recetaDe(grupoDe(p.art, p.den)); if (!r) continue;
    const b = baseReceta(r); if (!b) continue;
    for (const l of r.lineas) {
      if (!l.ins || l.tipo === 'carne' || !Number(l.cant)) continue;
      const q = p.kg * Number(l.cant) / b;
      const x = out[l.ins] = out[l.ins] || {}; x[f] = (x[f] || 0) + q;
    }
  }
  if (!sinCorrecciones) for (const [k, a] of Object.entries(INS.usoAj || {})) {
    const [id, f] = k.split('|'); if (!f || f < desde) continue;
    (out[id] = out[id] || {})[f] = Number(a.cant) || 0;
  }
  return out;
}
function comprasDe(id) {
  const anul = INS.anuladas || {};
  const s = SINS.ci.filter(c => c.id === id).map(c => ({ fecha: c.f, cant: c.cant, nro: c.nro, sistema: true, anulada: !!anul[c.nro + '|' + id] }));
  const m = (INS.compras || []).filter(c => c.id === id).map(c => ({ ...c, sistema: false }));
  return s.concat(m).sort((a, b) => a.fecha < b.fecha ? -1 : 1);
}
function stockInsumos() {
  const lista = listaInsumos(), ult = ultimosConteos();
  const usados = new Set();
  for (const g of GRUPOS) { const r = recetaDe(g.id); if (r) for (const l of r.lineas) if (l.ins && l.tipo !== 'carne' && Number(l.cant)) usados.add(l.ins); }
  const desdeMin = SINSdesde;
  const cons = consumos(desdeMin);
  // nombre y orden como en la planilla de fórmulas de Carlos, y en qué fórmulas se usa
  const info = {}; let orden = 0;
  for (const r of FOR.recetas || []) for (const l of r.lineas) {
    if (!l.ins || l.tipo === 'carne') continue;
    const x = info[l.ins] = info[l.ins] || { carlos: l.nombre, orden: orden++, usos: [] };
    if (Number(l.cant) && !x.usos.includes(r.nombre)) x.usos.push(r.nombre);
  }
  return lista.filter(i => !(INS.lista && INS.lista[i.id] && INS.lista[i.id].oculto)).map(i => {
    const c = ult[i.id];
    const desde = c ? c.fecha : M + '-01';
    const compras = comprasDe(i.id).filter(x => !x.anulada && (c ? x.fecha > c.fecha : x.fecha >= desde)).reduce((s, x) => s + x.cant, 0);
    const consumo = Object.entries(cons[i.id] || {}).filter(([f]) => c ? f > c.fecha : f >= desde).reduce((s, [, q]) => s + q, 0);
    const stock = c ? c.cant + compras - consumo : null;
    const inf = info[i.id] || {};
    return { ...i, conteo: c, compras, consumo, stock, min: Number((INS.lista && INS.lista[i.id] && INS.lista[i.id].min) || 0), usado: usados.has(i.id) || !!(inf.usos && inf.usos.length), descuenta: usados.has(i.id), carlos: inf.carlos || '', orden: inf.orden == null ? 999 : inf.orden, usos: inf.usos || [] };
  }).sort((a, b) => (b.usado - a.usado) || (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, 'es'));
}
async function renderInsumos() {
  $('main').innerHTML = cabecera('Insumos de Ciclo III', 'Stock estimado = último conteo + compras − lo que se usó según la producción y las fórmulas.', '') + '<div class="cargando"><span class="spin"></span> Leyendo insumos…</div>';
  try { await asegurarInsumos(); } catch (e) { $('main').innerHTML += '<div class="alerta bad">' + esc(e.message) + '</div>'; return; }
  if (TAB !== 'insumos') return;
  let h = cabecera('Insumos de Ciclo III', 'Stock estimado = último conteo + compras − lo que se usó según la producción y las fórmulas.', '');
  h += '<div class="tabs2">' + [['consumo', 'Movimiento del mes'], ['stock', 'Stock'], ['formulas', 'Fórmulas']].map(([k, n]) => '<button class="' + (SUBINS === k ? 'on' : '') + '" onclick="SUBINS=\'' + k + '\';renderInsumos()">' + n + '</button>').join('') + '</div>';
  setTimeout(revisarLimites, 0);
  if (SUBINS === 'stock') h += htmlStock();
  else if (SUBINS === 'formulas') h += htmlFormulas();
  else h += htmlConsumo();
  $('main').innerHTML = h;
}
function htmlStock() {
  const st = stockInsumos();
  const fila = s => {
    const est = s.stock == null ? '<span class="est-sin">' + (s.usado ? 'falta contar' : '—') + '</span>' : (s.min > 0 && s.stock < s.min ? '<span class="est-bajo">Bajo el límite</span>' : (s.stock < 0 ? '<span class="est-bajo">Negativo</span>' : '<span class="est-ok">OK</span>'));
    const nom = s.carlos && s.carlos.toLowerCase() !== s.nombre.toLowerCase() ? '<b>' + esc(s.carlos) + '</b><br><small class="muted">' + esc(s.nombre) + ' · ' + esc(s.id) + '</small>' : '<b>' + esc(s.nombre) + '</b> <small class="muted">' + esc(s.id) + '</small>';
    const valor = s.stock != null && s.precio ? s.stock * s.precio : null;
    return '<tr><td>' + nom + '</td><td style="font-size:12.5px">' + (s.usos.length ? esc(s.usos.join(', ')) : '<span class="muted">—</span>') + (s.usado && !s.descuenta ? '<br><span class="chip sm mut">no descuenta (fórmula sin producción asignada)</span>' : '') + '</td><td>' + esc(s.unidad) + '</td>' +
      '<td class="num ed" onclick="verConteo(\'' + esc(s.id) + '\')" title="Clic para cambiar o borrar el último conteo" data-v="' + (s.conteo ? r2(s.conteo.cant) : '') + '">' + (s.conteo ? fmtN(s.conteo.cant, 2) + '<br><small class="muted">' + ddmm(s.conteo.fecha) + '</small>' : '') + '</td>' +
      '<td class="num" data-v="' + r2(s.compras) + '">' + (s.compras ? fmtN(s.compras, 2) : '') + '</td><td class="num" data-v="' + r2(s.consumo) + '">' + (s.consumo ? fmtN(s.consumo, 2) : '') + '</td>' +
      '<td class="num sep" data-v="' + (s.stock == null ? '' : r2(s.stock)) + '"><b style="font-size:16px">' + (s.stock == null ? '' : fmtN(s.stock, 2)) + '</b></td><td class="num ed" onclick="editarLimite(\'' + esc(s.id) + '\')" data-v="' + r2(s.min) + '" title="Clic para cambiar el límite">' + (s.min ? fmtN(s.min, 2) : '<span class="muted">poner</span>') + '</td><td>' + est + '</td>' +
      '<td class="num ed' + (s.precioAMano ? ' aj' : '') + '" onclick="editarPrecio(\'' + esc(s.id) + '\')" data-v="' + r2(s.precio) + '" title="' + (s.precioAMano ? 'Precio escrito a mano · sistema: ' + pesos(s.precioSis || 0) : 'Precio del sistema · clic para cambiarlo') + '">' + (s.precio ? pesos(s.precio) : '') + '</td><td class="num" data-v="' + (valor == null ? '' : r2(valor)) + '">' + (valor == null ? '' : pesos(valor)) + '</td>' +
      '<td style="white-space:nowrap"><button class="small" onclick="contarInsumo(\'' + esc(s.id) + '\')">Contar</button> <button class="small" onclick="compraInsumo(\'' + esc(s.id) + '\')">+ Compra</button> <button class="small" onclick="detalleInsumo(\'' + esc(s.id) + '\')">Detalle</button></td></tr>';
  };
  const cab = '<thead><tr><th>Insumo</th><th>Se usa en</th><th>Unidad</th><th class="num">Último conteo</th><th class="num">+ Compras</th><th class="num">− Usado (fórmula)</th><th class="num sep">Stock estimado</th><th class="num">Límite</th><th>Estado</th><th class="num">Precio</th><th class="num">Valor stock</th><th></th></tr></thead>';
  const usados = st.filter(s => s.usado), otros = st.filter(s => !s.usado);
  const valorTot = usados.reduce((t, s) => t + (s.stock != null && s.precio ? s.stock * s.precio : 0), 0);
  let h = '<section><h2>Stock de insumos de las fórmulas</h2><p class="sub">Los mismos ingredientes y en el mismo orden que la planilla de fórmulas de Carlos (chorizo, salchicha, morcilla y los especiales). Las compras salen solas de los remitos de compra del sistema y también se pueden cargar a mano. Para arrancar, contá lo que hay y cargalo con "Contar": desde ese día el stock baja solo con la producción.</p>' +
    '<div class="tw" style="max-height:none"><table class="planilla xl" data-hoja="Stock insumos">' + cab + '<tbody>' + usados.map(fila).join('') +
    '<tr class="tot"><td>Total</td><td></td><td></td><td></td><td></td><td></td><td class="sep"></td><td></td><td></td><td></td><td class="num">' + (valorTot ? pesos(valorTot) : '') + '</td><td></td></tr></tbody></table></div>' +
    '<div class="row" style="margin-top:10px"><button class="small" onclick="nuevoInsumo()">＋ Insumo que no está en el sistema</button></div></section>';
  if (otros.length) h += '<section><details><summary style="font-size:15px">Otros insumos de Ciclo III en el sistema (' + otros.length + ') — bolsas, film, hilo, bandejas…</summary><p class="sub" style="margin-top:8px">No están en ninguna fórmula, así que no bajan solos. Para que bajen con la producción, agregalos como "Envase" en la fórmula que corresponda.</p>' +
    '<div class="tw" style="max-height:none"><table class="planilla xl" data-hoja="Otros insumos">' + cab + '<tbody>' + otros.map(fila).join('') + '</tbody></table></div></details></section>';
  h += '<p class="nota">"Usado" = kilos producidos de cada producto × su fórmula (pestaña Fórmulas). El precio sale del sistema; si no está o está viejo, clic en el precio para cambiarlo. Si el stock real no coincide, contá de nuevo: el conteo manda.</p>';
  return h;
}
function editarPrecio(id) {
  const s = listaInsumos().find(x => x.id === id);
  abrirDlg('Precio · ' + esc(s.nombre),
    '<div class="sis">Precio en el sistema: <b>' + (s.precioSis ? pesos(s.precioSis) : 'sin precio') + '</b> por ' + esc(s.unidad) + '. Se usa para el costo de las fórmulas y el valor del stock. Vacío = el del sistema.</div>' +
    '<div class="campos"><label>Precio por ' + esc(s.unidad) + '</label><input id="pr-v" class="big-num" value="' + (s.precioAMano ? fmtE(s.precio, 2) : '') + '" placeholder="' + fmtN(s.precioSis || 0, 2) + '"></div>',
    [['Cancelar', cerrarDlg], ['Guardar', async () => {
      const n = leerNum($('pr-v').value); if (Number.isNaN(n)) { toast('Número inválido', true); return; }
      try {
        INS = await cambiarDoc('insumos', d => { d.lista = d.lista || {}; d.lista[id] = d.lista[id] || {}; if (n == null) delete d.lista[id].precio; else d.lista[id].precio = n; },
          'Precio ' + s.nombre + ': ' + (n == null ? 'el del sistema' : pesos(n)));
        cerrarDlg(); renderInsumos(); toast('Guardado');
      } catch (e) { toast(e.message, true); }
    }, 'primary']]);
}
function contarInsumo(id) {
  const s = stockInsumos().find(x => x.id === id);
  abrirDlg('Contar stock · ' + esc(s.nombre),
    '<div class="sis">' + (s.stock != null ? 'Según el cálculo debería haber <b>' + fmtN(s.stock, 2) + ' ' + esc(s.unidad) + '</b>.' : 'Todavía no se contó este insumo.') + ' Escribí lo que hay realmente.</div>' +
    '<div class="campos"><label>Fecha del conteo</label><input type="date" id="ci-f" value="' + hoyIso() + '" style="max-width:180px"><label>Cantidad (' + esc(s.unidad) + ')</label><input id="ci-c" class="big-num"><label>Unidad</label><select id="ci-u" style="max-width:160px">' + ['kg', 'litro', 'unid.', 'madeja', 'metro'].map(u => '<option' + (u === s.unidad ? ' selected' : '') + '>' + u + '</option>').join('') + '</select><label>Límite (avisa cuando queda menos)</label><input id="ci-m" value="' + (s.min ? fmtE(s.min, 2) : '') + '" style="max-width:160px"><label>Nota</label><input id="ci-n"></div>' +
    '<p class="nota">El conteo cuenta al final del día: lo producido ese mismo día ya está descontado.</p>',
    [['Cancelar', cerrarDlg], ['Guardar', async () => {
      const c = leerNum($('ci-c').value), mi = leerNum($('ci-m').value), f = $('ci-f').value;
      if (c == null || Number.isNaN(c) || Number.isNaN(mi) || !f) { toast('Falta la cantidad o la fecha', true); return; }
      try {
        INS = await cambiarDoc('insumos', d => {
          d.conteos = d.conteos || []; d.conteos.push({ id, fecha: f, cant: c, nota: $('ci-n').value.trim(), por: quien(), ts: new Date().toISOString() });
          d.lista = d.lista || {}; d.lista[id] = Object.assign(d.lista[id] || {}, { min: mi || 0, unidad: $('ci-u').value });
        }, 'Conteo ' + s.nombre + ' ' + ddmm(f) + ': ' + fmtN(c, 2) + ' ' + s.unidad + (s.stock != null ? ' (calculado ' + fmtN(s.stock, 2) + ')' : ''));
        SINS = null; cerrarDlg(); renderInsumos(); toast('Guardado');
      } catch (e) { toast(e.message, true); }
    }, 'primary']]);
}
function compraInsumo(id) {
  const s = listaInsumos().find(x => x.id === id);
  abrirDlg('Compra a mano · ' + esc(s.nombre),
    '<div class="sis">Solo si la compra <b>no</b> se cargó en el sistema (las del sistema ya se suman solas).</div><div class="campos"><label>Fecha</label><input type="date" id="cp-f" value="' + hoyIso() + '" style="max-width:180px"><label>Cantidad (' + esc(s.unidad) + ')</label><input id="cp-c" class="big-num"><label>Nota</label><input id="cp-n" placeholder="Proveedor, remito…"></div>',
    [['Cancelar', cerrarDlg], ['Guardar', async () => {
      const c = leerNum($('cp-c').value), f = $('cp-f').value;
      if (c == null || Number.isNaN(c) || !f) { toast('Falta la cantidad o la fecha', true); return; }
      try {
        INS = await cambiarDoc('insumos', d => { d.compras = d.compras || []; d.compras.push({ id, fecha: f, cant: c, nota: $('cp-n').value.trim(), por: quien(), ts: new Date().toISOString() }); },
          'Compra a mano ' + s.nombre + ' ' + ddmm(f) + ': ' + fmtN(c, 2));
        cerrarDlg(); renderInsumos(); toast('Guardado');
      } catch (e) { toast(e.message, true); }
    }, 'primary']]);
}
/* Último conteo de un insumo: clic en la casilla para borrarlo o cargar otro */
function verConteo(id) {
  const s = stockInsumos().find(x => x.id === id);
  if (!s.conteo) { contarInsumo(id); return; }
  const c = s.conteo;
  abrirDlg('Último conteo · ' + esc(s.carlos || s.nombre),
    '<div class="sis">Conteo del <b>' + ddmm(c.fecha) + '</b>: <b>' + fmtN(c.cant) + ' ' + esc(s.unidad) + '</b>' + (c.por ? ' · cargó ' + esc(c.por) : '') + (c.nota ? '<br>' + esc(c.nota) : '') + '</div>' +
    '<p>Si lo borrás, el stock se vuelve a calcular desde el conteo anterior (si hay).</p>',
    [['Cancelar', cerrarDlg], ['Cargar otro conteo', () => { cerrarDlg(); contarInsumo(id); }], ['Borrar este conteo', async () => {
      try {
        INS = await cambiarDoc('insumos', d => { d.conteos = (d.conteos || []).filter(x => !(x.id === id && x.fecha === c.fecha && x.ts === c.ts)); }, 'Borrado conteo ' + (s.carlos || s.nombre) + ' ' + ddmm(c.fecha) + ' (' + fmtN(c.cant) + ' ' + s.unidad + ')');
        cerrarDlg(); const y = window.scrollY; await renderInsumos(); window.scrollTo(0, y); toast('Conteo borrado');
      } catch (e) { toast(e.message, true); }
    }, 'danger']]);
}
function detalleInsumo(id) {
  const s = stockInsumos().find(x => x.id === id);
  const mov = [];
  for (const c of (INS.conteos || []).filter(c => c.id === id)) mov.push({ f: c.fecha, t: 'Conteo', q: c.cant, n: (c.nota || '') + ' · ' + (c.por || ''), conteo: c });
  for (const c of comprasDe(id)) mov.push({ f: c.fecha, t: c.sistema ? 'Compra (sistema, remito ' + c.nro + ')' : 'Compra a mano', q: c.cant, n: c.nota || '', compra: c });
  const cons = consumos(SINSdesde)[id] || {};
  for (const [f, q] of Object.entries(cons)) mov.push({ f, t: 'Usado según producción', q: -q, n: '' });
  mov.sort((a, b) => a.f < b.f ? 1 : -1);
  abrirDlg('Movimientos · ' + esc(s.nombre),
    '<table class="lista-ed"><thead><tr><th>Día</th><th>Movimiento</th><th class="num">Cantidad</th><th>Nota</th><th></th></tr></thead><tbody>' +
    mov.map((m, i) => '<tr' + (m.compra && m.compra.anulada ? ' style="text-decoration:line-through;color:#999"' : '') + '><td>' + ddmm(m.f) + '</td><td>' + esc(m.t) + '</td><td class="num">' + fmtN(m.q, 2) + '</td><td class="muted">' + esc(m.n) + '</td><td>' +
      (m.compra && m.compra.sistema ? '<button class="small" data-i="' + i + '" data-acc="anular">' + (m.compra.anulada ? 'Volver a contar' : 'No contar') + '</button>' : '') +
      (m.compra && !m.compra.sistema ? '<button class="small danger" data-i="' + i + '" data-acc="borrar">Borrar</button>' : '') +
      (m.conteo ? '<button class="small danger" data-i="' + i + '" data-acc="borrarc">Borrar</button>' : '') + '</td></tr>').join('') +
    '</tbody></table>' + (mov.length ? '' : '<div class="empty">Sin movimientos</div>'),
    [['Cerrar', cerrarDlg]]);
  $('dlg-b').onclick = async e => {
    const b = e.target.closest('button[data-acc]'); if (!b) return;
    const m = mov[+b.dataset.i];
    try {
      if (b.dataset.acc === 'anular') {
        const k = m.compra.nro + '|' + id;
        INS = await cambiarDoc('insumos', d => { d.anuladas = d.anuladas || {}; if (d.anuladas[k]) delete d.anuladas[k]; else d.anuladas[k] = { por: quien(), ts: new Date().toISOString() }; },
          'Compra del sistema ' + s.nombre + ' remito ' + m.compra.nro + ': ' + (m.compra.anulada ? 'se vuelve a contar' : 'no se cuenta'));
      } else if (b.dataset.acc === 'borrar') {
        INS = await cambiarDoc('insumos', d => { d.compras = (d.compras || []).filter(c => !(c.id === id && c.ts === m.compra.ts)); }, 'Borrada compra a mano ' + s.nombre + ' ' + ddmm(m.f) + ' ' + fmtN(m.q, 2));
      } else if (b.dataset.acc === 'borrarc') {
        if (!b.dataset.seguro) { b.dataset.seguro = '1'; b.textContent = '¿Seguro? Borrar'; return; }
        INS = await cambiarDoc('insumos', d => { d.conteos = (d.conteos || []).filter(c => !(c.id === id && c.ts === m.conteo.ts)); }, 'Borrado conteo ' + s.nombre + ' ' + ddmm(m.f));
        SINS = null; await asegurarInsumos();
      }
      detalleInsumo(id); renderInsumosSilencioso();
    } catch (err) { toast(err.message, true); }
  };
}
function renderInsumosSilencioso() { if (TAB === 'insumos' && SUBINS === 'stock') { const d = $('dlg').open; renderInsumos().then(() => {}); } }
function nuevoInsumo() {
  abrirDlg('Insumo que no está en el sistema',
    '<div class="campos"><label>Nombre</label><input id="ni-n" placeholder="Ej: Queso Roquefort"><label>Unidad</label><select id="ni-u" style="max-width:160px"><option>kg</option><option>litro</option><option>unid.</option></select></div>',
    [['Cancelar', cerrarDlg], ['Guardar', async () => {
      const n = $('ni-n').value.trim(); if (!n) { toast('Falta el nombre', true); return; }
      const id = 'x-' + n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
      try {
        INS = await cambiarDoc('insumos', d => { d.lista = d.lista || {}; d.lista[id] = Object.assign(d.lista[id] || {}, { nombre: n, unidad: $('ni-u').value }); }, 'Nuevo insumo ' + n);
        cerrarDlg(); renderInsumos(); toast('Guardado');
      } catch (e) { toast(e.message, true); }
    }, 'primary']]);
}
/* Movimiento del mes por insumo: saldo inicial (a mano) + compras (resaltadas en el día) − lo usado según la fórmula = saldo final */
const finMesAnterior = () => { const d = fechaDe(M + '-01'); d.setDate(0); return isoDe(d); };
function stockAl(id, fecha, cons) {
  const cs = (INS.conteos || []).filter(c => c.id === id && c.fecha <= fecha).sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.ts < b.ts ? -1 : 1));
  const c = cs[cs.length - 1]; if (!c) return null;
  const compras = comprasDe(id).filter(x => !x.anulada && x.fecha > c.fecha && x.fecha <= fecha).reduce((t, x) => t + x.cant, 0);
  const uso = Object.entries(cons[id] || {}).filter(([f]) => f > c.fecha && f <= fecha).reduce((t, [, q]) => t + q, 0);
  return c.cant + compras - uso;
}
function htmlConsumo() {
  const cons = consumos(SINSdesde), fin0 = finMesAnterior();
  const st = stockInsumos();
  const comprasMes = id => comprasDe(id).filter(x => !x.anulada && x.fecha.slice(0, 7) === M);
  const filas = st.filter(x => x.usado || comprasMes(x.id).length || Object.keys(cons[x.id] || {}).some(f => f.slice(0, 7) === M));
  const dias = diasDelMes(M).filter(f => totDia('prod', f) > 0 || filas.some(x => (cons[x.id] || {})[f] || comprasMes(x.id).some(c => c.fecha === f)));
  const gruposMes = GRUPOS.filter(g => totMes('prod', c => grupoDe(c.art, c.den) === g.id) > 0);
  let h = '<section><h2>Movimiento de insumos del mes</h2><p class="sub">Escribí el <b>saldo inicial</b> de cada insumo (lo que había al empezar el mes). Cada día se descuenta lo usado según la producción y la fórmula. Arriba está la <b>producción de cada día</b>. Haciendo clic en el día de un insumo se carga una <b>compra</b> (queda en verde en esa fila) o se <b>corrige lo usado</b> si no fue lo de la fórmula (queda en naranja). Las compras cargadas en el sistema aparecen solas.</p>' +
    '<div class="tw"><table class="planilla xl mov" data-hoja="Movimiento insumos"><thead><tr><th>Insumo</th><th class="num sep">Saldo inicial</th>' + dias.map(f => '<th class="num">' + diaCorto(f) + '</th>').join('') +
    '<th class="num sep">Compras</th><th class="num">Usado</th><th class="num sep">Saldo final</th></tr></thead><tbody>';
  // producción del día (de la planilla de Ciclo III): con esto se calcula lo usado
  gruposMes.forEach((g, i) => {
    const t = totMes('prod', c => grupoDe(c.art, c.den) === g.id);
    const rec = recetaDe(g.id);
    h += '<tr class="prodrow' + (i === 0 ? ' prim' : '') + '"><td>' + (i === 0 ? '<small class="pt">PRODUCCIÓN DEL DÍA (kg)</small>' : '') + '<b>' + g.n + '</b><br><small class="muted">' + (rec ? 'fórmula ' + esc(rec.nombre) : 'sin fórmula: no descuenta') + '</small></td><td class="sep"></td>' +
      dias.map(f => { const v = totDia('prod', f, c => grupoDe(c.art, c.den) === g.id); return '<td class="num" data-v="' + r2(v) + '">' + (v ? fmtN(v, 0) : '') + '</td>'; }).join('') +
      '<td class="sep"></td><td class="num" data-v="' + r2(t) + '"><b>' + fmtN(t, 0) + '</b></td><td class="sep"></td></tr>';
  });
  if (gruposMes.length > 1) {
    const T = totMes('prod');
    h += '<tr class="prodrow tot2"><td><b>Total producido</b></td><td class="sep"></td>' + dias.map(f => { const v = totDia('prod', f); return '<td class="num" data-v="' + r2(v) + '"><b>' + (v ? fmtN(v, 0) : '') + '</b></td>'; }).join('') + '<td class="sep"></td><td class="num" data-v="' + r2(T) + '"><b>' + fmtN(T, 0) + '</b></td><td class="sep"></td></tr>';
  }
  h += '<tr class="sepins"><td colspan="' + (dias.length + 5) + '"><small class="pt">INSUMOS</small></td></tr>';
  for (const x of filas) {
    const ini = (INS.conteos || []).filter(c => c.id === x.id && c.fecha === fin0).sort((a, b) => a.ts < b.ts ? -1 : 1).pop();
    const calc = ini ? null : stockAl(x.id, fin0, cons);
    const base = ini ? ini.cant : calc;
    const cm = comprasMes(x.id);
    let tc = 0, tu = 0;
    let celdasDia = '';
    for (const f of dias) {
      const u = (cons[x.id] || {})[f] || 0, cs = cm.filter(c => c.fecha === f), q = cs.reduce((t, c) => t + c.cant, 0);
      tu += u; tc += q;
      const aj = (INS.usoAj || {})[x.id + '|' + f];
      celdasDia += '<td class="num ed' + (q ? ' compra' : '') + '" onclick="compraDia(\'' + esc(x.id) + '\',\'' + f + '\')" data-v="' + r2(q - u) + '" title="' + (q ? 'Compra: ' + cs.map(c => fmtN(c.cant, 2) + (c.sistema ? ' (remito ' + c.nro + ')' : ' (a mano)')).join(', ') + '\n' : '') + 'Usado: ' + fmtN(u, 2) + (aj ? ' (corregido por ' + (aj.por || '?') + '; fórmula ' + fmtN(aj.formula || 0, 2) + ')' : '') + '\nClic para cargar una compra o corregir lo usado">' +
        (q ? '<span class="cq">+' + fmtN(q, 2) + '</span>' : '') + (u || aj ? '<span class="cu' + (aj ? ' cuaj' : '') + '">' + fmtN(u, 2) + '</span>' : '') + '</td>';
    }
    const fin = base == null ? null : base + tc - tu;
    const nom = x.carlos ? '<b>' + esc(x.carlos) + '</b> <small class="muted">' + esc(x.unidad) + '</small><br><small class="muted">' + esc(x.nombre) + '</small>' : '<b>' + esc(x.nombre) + '</b> <small class="muted">' + esc(x.unidad) + '</small>';
    const bajo = x.min > 0 && x.stock != null && x.stock < x.min;
    h += '<tr class="ins' + (bajo ? ' bajo' : '') + '"><td class="ed nom" onclick="editarLimite(\'' + esc(x.id) + '\')" title="Clic para poner el límite (avisa cuando queda poco)">' + nom +
      (x.min > 0 ? '<br><span class="lim">' + (bajo ? '⚠ ' : '') + 'Límite ' + fmtN(x.min, 2) + (bajo ? ' · stock ' + fmtN(x.stock, 2) : '') + '</span>' : '<br><span class="lim muted">poner límite</span>') + '</td><td class="sep"><input class="ini" data-id="' + esc(x.id) + '" value="' + (ini ? fmtE(ini.cant, 2) : '') + '" placeholder="' + (calc != null ? fmtN(calc, 2) : 'escribir') + '" title="' + (calc != null ? 'Calculado desde el último conteo. Escribilo para fijarlo.' : 'Lo que había al empezar el mes') + '"></td>' + celdasDia +
      '<td class="num sep" data-v="' + r2(tc) + '">' + (tc ? '<b style="color:var(--ok)">+' + fmtN(tc, 2) + '</b>' : '') + '</td><td class="num" data-v="' + r2(tu) + '">' + (tu ? fmtN(tu, 2) : '') + '</td>' +
      '<td class="num sep" data-v="' + (fin == null ? '' : r2(fin)) + '"><b style="font-size:16px' + (fin != null && (fin < 0 || (x.min && fin < x.min) || bajo) ? ';color:var(--bad)' : '') + '">' + (fin == null ? '' : fmtN(fin, 2)) + '</b></td></tr>';
  }
  h += '</tbody></table></div><p class="nota">En cada día: <span style="color:var(--ok);font-weight:600">+ verde</span> = compra · número gris = usado según la fórmula. Saldo final = saldo inicial + compras − usado. Si el saldo inicial aparece en gris es calculado desde un conteo anterior; escribilo para fijarlo.</p></section>';
  return h;
}
/* Límite de cada insumo: cuando el stock estimado baja de ahí se pone en rojo y sale un mail a Carlos para pedir más */
function editarLimite(id) {
  const s = stockInsumos().find(x => x.id === id) || listaInsumos().find(x => x.id === id);
  abrirDlg('Límite · ' + esc(s.carlos || s.nombre),
    '<div class="sis">Stock estimado hoy: <b>' + (s.stock != null ? fmtN(s.stock, 2) + ' ' + esc(s.unidad) : 'falta el saldo inicial o un conteo') + '</b>.<br>Cuando quede menos que el límite, el insumo se pone en <b style="color:var(--bad)">rojo</b> y se manda un mail a Carlos para pedir más.</div>' +
    '<div class="campos"><label>Límite (' + esc(s.unidad) + ')</label><input id="li-v" class="big-num" value="' + (s.min ? fmtE(s.min, 2) : '') + '" placeholder="ej: 10"></div><p class="nota">Vacío o 0 = sin aviso.</p>',
    [['Cancelar', cerrarDlg], ['Guardar', async () => {
      const n = leerNum($('li-v').value); if (Number.isNaN(n)) { toast('Número inválido', true); return; }
      try {
        INS = await cambiarDoc('insumos', d => { d.lista = d.lista || {}; d.lista[id] = Object.assign(d.lista[id] || {}, { min: n || 0 }); }, 'Límite ' + (s.carlos || s.nombre) + ': ' + (n ? fmtN(n, 2) + ' ' + s.unidad : 'sin aviso'));
        if (FOR && FOR.inicial) { const f = JSON.parse(JSON.stringify(FOR)); delete f.inicial; FOR = await cambiarDoc('formulas', d => { Object.assign(d, f); }, 'Fórmulas guardadas (las de la planilla de Carlos)'); }
        cerrarDlg(); const y = window.scrollY; await renderInsumos(); window.scrollTo(0, y); toast('Límite guardado');
        revisarLimites();
      } catch (e) { toast(e.message, true); }
    }, 'primary']]);
  setTimeout(() => $('li-v') && $('li-v').focus(), 50);
}
/* Revisa los límites: si un insumo bajó del límite y todavía no se avisó, deja el mail listo (lo manda la notebook) */
let _revisando = false;
async function revisarLimites() {
  if (_revisando || !SINS || !(window.C3API && C3API.encolarMail)) return;
  _revisando = true;
  try {
    const st = stockInsumos().filter(s => s.min > 0 && s.stock != null);
    const { d: av } = await leerDoc('alertas-insumos');
    const nuevos = st.filter(s => s.stock < s.min && !av[s.id]), volvio = st.filter(s => s.stock >= s.min && av[s.id]);
    if (!nuevos.length && !volvio.length) return;
    for (const s of nuevos) {
      const nom = s.carlos || s.nombre;
      await C3API.encolarMail({
        tipo: 'insumo-bajo', estado: 'pendiente', ts: new Date().toISOString(), por: quien(),
        asunto: 'Ciclo III: queda poco de ' + nom + ' (' + fmtN(s.stock, 2) + ' ' + s.unidad + ')',
        html: '<div style="font:15px Segoe UI,Arial,sans-serif;color:#1d262c"><h2 style="margin:0 0 8px">Ciclo III · hay que pedir ' + esc(nom) + '</h2>' +
          '<p>Según la producción y las fórmulas quedan <b style="color:#a8302a">' + fmtN(s.stock, 2) + ' ' + esc(s.unidad) + '</b> de <b>' + esc(s.nombre) + '</b>, por debajo del límite de ' + fmtN(s.min, 2) + ' ' + esc(s.unidad) + '.</p>' +
          '<p style="color:#76838c">Último conteo: ' + (s.conteo ? ddmm(s.conteo.fecha) + ' (' + fmtN(s.conteo.cant, 2) + ')' : '—') + ' · compras desde entonces ' + fmtN(s.compras, 2) + ' · usado ' + fmtN(s.consumo, 2) + '</p>' +
          '<p><a href="https://qualita-produccion.web.app/control">Abrir el Centro de control</a></p></div>'
      });
    }
    await cambiarDoc('alertas-insumos', d => {
      for (const s of nuevos) d[s.id] = { fecha: hoyIso(), stock: r2(s.stock), limite: s.min };
      for (const s of volvio) delete d[s.id];
    }, (nuevos.length ? 'Aviso por mail de insumos bajos: ' + nuevos.map(s => s.carlos || s.nombre).join(', ') : '') + (volvio.length ? (nuevos.length ? ' · ' : '') + 'Volvieron a tener stock: ' + volvio.map(s => s.carlos || s.nombre).join(', ') : ''));
  } catch (e) { /* si falla se vuelve a intentar la próxima vez */ } finally { _revisando = false; }
}
async function guardarSaldoInicial(inp) {
  const id = inp.dataset.id, fin0 = finMesAnterior();
  const n = leerNum(inp.value);
  if (Number.isNaN(n)) { inp.classList.add('bad'); toast('Número inválido', true); return; }
  const nombre = (listaInsumos().find(i => i.id === id) || { nombre: id }).nombre;
  try {
    INS = await cambiarDoc('insumos', d => {
      d.conteos = (d.conteos || []).filter(c => !(c.id === id && c.fecha === fin0));
      if (n != null) d.conteos.push({ id, fecha: fin0, cant: n, nota: 'Saldo inicial de ' + nombreMes(M), por: quien(), ts: new Date().toISOString() });
    }, 'Saldo inicial ' + nombreMes(M) + ' ' + nombre + ': ' + (n == null ? 'borrado' : fmtN(n, 2)));
    SINS = null; await asegurarInsumos();
    const y = window.scrollY; await renderInsumos(); window.scrollTo(0, y);
    const nx = document.querySelector('input.ini[data-id="' + id + '"]'); if (nx) nx.classList.add('ok');
  } catch (e) { toast(e.message, true); }
}
document.addEventListener('change', e => { if (e.target.matches && e.target.matches('input.ini')) guardarSaldoInicial(e.target); });
function compraDia(id, f) {
  const s = listaInsumos().find(x => x.id === id), cs = comprasDe(id).filter(c => c.fecha === f);
  const formula = ((consumos(f, true)[id] || {})[f]) || 0;
  const aj = (INS.usoAj || {})[id + '|' + f];
  const prodDia = GRUPOS.map(g => [g.n, totDia('prod', f, c => grupoDe(c.art, c.den) === g.id)]).filter(x => x[1] > 0);
  const lista = cs.length ? '<table class="lista-ed" style="margin-bottom:12px"><thead><tr><th>Compras de ese día</th><th class="num">Cantidad</th><th></th></tr></thead><tbody>' +
    cs.map((c, i) => '<tr' + (c.anulada ? ' style="text-decoration:line-through;color:#999"' : '') + '><td>' + (c.sistema ? 'Sistema, remito ' + esc(c.nro) : 'A mano' + (c.nota ? ' · ' + esc(c.nota) : '') + ' · ' + esc(c.por || '')) + '</td><td class="num">' + fmtN(c.cant, 2) + '</td><td>' +
      (c.sistema ? '<button class="small" data-i="' + i + '">' + (c.anulada ? 'Volver a contar' : 'No contar') + '</button>' : '<button class="small danger" data-i="' + i + '">Borrar</button>') + '</td></tr>').join('') + '</tbody></table>' : '';
  abrirDlg(esc(s.nombre) + ' · ' + DIAS[diaSem(f)] + ' ' + ddmm(f),
    '<div class="sis">Producción del día: ' + (prodDia.length ? prodDia.map(x => '<b>' + x[0] + '</b> ' + fmtN(x[1], 0) + ' kg').join(' · ') : 'sin producción') + '.<br>Según la fórmula se usaron <b>' + fmtN(formula, 2) + ' ' + esc(s.unidad) + '</b>.</div>' +
    '<h3 style="font-size:15px;margin:4px 0 8px">Lo usado ese día</h3>' +
    '<div class="campos"><label>Usado de verdad (' + esc(s.unidad) + ')</label><input id="cd-u" class="big-num" value="' + (aj ? fmtE(aj.cant, 2) : '') + '" placeholder="' + fmtN(formula, 2) + '"><label>Motivo</label><input id="cd-un" value="' + esc(aj ? aj.nota || '' : '') + '" placeholder="Opcional"></div>' +
    '<p class="nota" style="margin-top:4px">Vacío = lo de la fórmula. Si escribís otro número, ese día descuenta eso.</p>' +
    '<h3 style="font-size:15px;margin:16px 0 8px">Compras</h3>' + lista +
    '<div class="campos"><label>Cantidad comprada (' + esc(s.unidad) + ')</label><input id="cd-c" class="big-num"><label>Nota</label><input id="cd-n" placeholder="Proveedor, remito…"></div>' +
    '<p class="nota">Las compras cargadas en el sistema ya aparecen solas: cargá acá solo las que no estén.</p>',
    [['Cerrar', cerrarDlg], ['Guardar', async () => {
      const u = leerNum($('cd-u').value), c = leerNum($('cd-c').value), un = $('cd-un').value.trim();
      if (Number.isNaN(u) || Number.isNaN(c)) { toast('Número inválido', true); return; }
      const cambiaUso = (u == null) !== !aj || (u != null && aj && (Math.abs(aj.cant - u) > 0.0005 || (aj.nota || '') !== un));
      if (!cambiaUso && c == null) { cerrarDlg(); return; }
      const desc = [];
      if (cambiaUso) desc.push('usado ' + (u == null ? 'vuelve a la fórmula (' + fmtN(formula, 2) + ')' : fmtN(formula, 2) + ' → ' + fmtN(u, 2)) + (un ? ' (' + un + ')' : ''));
      if (c != null) desc.push('compra ' + fmtN(c, 2) + ' ' + s.unidad);
      try {
        INS = await cambiarDoc('insumos', d => {
          if (cambiaUso) { d.usoAj = d.usoAj || {}; const k = id + '|' + f; if (u == null) delete d.usoAj[k]; else d.usoAj[k] = { cant: u, formula: r2(formula), nota: un, por: quien(), ts: new Date().toISOString() }; }
          if (c != null) { d.compras = d.compras || []; d.compras.push({ id, fecha: f, cant: c, nota: $('cd-n').value.trim(), por: quien(), ts: new Date().toISOString() }); }
        }, s.nombre + ' ' + ddmm(f) + ': ' + desc.join(' · '));
        cerrarDlg(); const y = window.scrollY; await renderInsumos(); window.scrollTo(0, y); toast('Guardado');
      } catch (e) { toast(e.message, true); }
    }, 'primary']]);
  $('dlg-b').onclick = async e => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    const c = cs[+b.dataset.i];
    try {
      if (c.sistema) {
        const k = c.nro + '|' + id;
        INS = await cambiarDoc('insumos', d => { d.anuladas = d.anuladas || {}; if (d.anuladas[k]) delete d.anuladas[k]; else d.anuladas[k] = { por: quien(), ts: new Date().toISOString() }; },
          'Compra del sistema ' + s.nombre + ' remito ' + c.nro + ': ' + (c.anulada ? 'se vuelve a contar' : 'no se cuenta'));
      } else {
        INS = await cambiarDoc('insumos', d => { d.compras = (d.compras || []).filter(x => !(x.id === id && x.ts === c.ts)); }, 'Borrada compra ' + s.nombre + ' ' + ddmm(f) + ' ' + fmtN(c.cant, 2));
      }
      cerrarDlg(); await renderInsumos(); compraDia(id, f);
    } catch (err) { toast(err.message, true); }
  };
  setTimeout(() => $('cd-u') && $('cd-u').focus(), 50);
}

/* ---------- fórmulas ---------- */
let FORED = null;   // copia en edición
function htmlFormulas() {
  if (!FORED) FORED = JSON.parse(JSON.stringify(FOR));
  const lista = listaInsumos().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const precios = {}; for (const i of lista) precios[i.id] = i.precio || 0;
  const opIns = sel => '<option value="">— ninguno —</option>' + lista.map(i => '<option value="' + esc(i.id) + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.nombre) + ' (' + esc(i.unidad) + ')</option>').join('');
  let h = '<section><h2>Qué fórmula usa cada producto</h2><p class="sub">Los kilos producidos de cada grupo se multiplican por esta fórmula para descontar los insumos.</p><div class="campos" style="grid-template-columns:200px 320px">';
  for (const g of GRUPOS) h += '<label>' + g.n + '</label><select onchange="FORED.asignacion[\'' + g.id + '\']=this.value"><option value="">— no descuenta —</option>' + FORED.recetas.map(r => '<option value="' + esc(r.id) + '"' + ((FORED.asignacion || {})[g.id] === r.id ? ' selected' : '') + '>' + esc(r.nombre) + '</option>').join('') + '</select>';
  h += '</div></section><section><h2>Fórmulas</h2><p class="sub">Cantidades por pastón (como la planilla: cada 100 kg de carne). <b>Carne</b> no descuenta stock; <b>Insumo</b> descuenta y suma al peso; <b>Envase</b> (tripas, bolsas) descuenta pero no suma al peso.</p>';
  FORED.recetas.forEach((r, ri) => {
    const b = baseReceta(r);
    h += '<div class="receta"><h3><input value="' + esc(r.nombre) + '" onchange="FORED.recetas[' + ri + '].nombre=this.value" style="max-width:340px;font-weight:600"> <span class="muted" style="font-weight:400;font-size:13px">pastón de ' + fmtN(b, 2) + ' kg</span> <button class="small danger" style="margin-left:auto" onclick="if(confirm(\'¿Borrar la fórmula?\')){FORED.recetas.splice(' + ri + ',1);renderInsumos()}">Borrar fórmula</button></h3>' +
      '<table><thead><tr><th>Ingrediente</th><th class="num">Cantidad</th><th>Tipo</th><th>Insumo que descuenta</th><th class="num">por kg producido</th><th class="num">Precio</th><th class="num">Costo</th><th></th></tr></thead><tbody>';
    r.lineas.forEach((l, li) => {
      h += '<tr><td><input value="' + esc(l.nombre) + '" onchange="FORED.recetas[' + ri + '].lineas[' + li + '].nombre=this.value"></td>' +
        '<td><input class="n" value="' + fmtE(l.cant, 3) + '" onchange="setCant(' + ri + ',' + li + ',this)"></td>' +
        '<td><select onchange="FORED.recetas[' + ri + '].lineas[' + li + '].tipo=this.value;renderInsumos()">' + [['carne', 'Carne'], ['insumo', 'Insumo'], ['envase', 'Envase']].map(([k, n]) => '<option value="' + k + '"' + (l.tipo === k ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></td>' +
        '<td>' + (l.tipo === 'carne' ? '<span class="muted">—</span>' : '<select onchange="FORED.recetas[' + ri + '].lineas[' + li + '].ins=this.value">' + opIns(l.ins) + '</select>') + '</td>' +
        '<td class="num muted">' + (b && l.tipo !== 'carne' && Number(l.cant) ? fmtN(Number(l.cant) / b, 4) : '') + '</td>' +
        (() => { const pi = l.ins ? precios[l.ins] : null; return '<td class="num' + (l.ins ? ' ed" onclick="editarPrecio(\'' + esc(l.ins) + '\')' : '') + '">' + (pi ? pesos(pi) : '') + '</td><td class="num">' + (pi && Number(l.cant) ? pesos(pi * Number(l.cant)) : '') + '</td>'; })() +
        '<td><button class="small danger" onclick="FORED.recetas[' + ri + '].lineas.splice(' + li + ',1);renderInsumos()">✕</button></td></tr>';
    });
    const costo = r.lineas.reduce((t, l) => t + (l.ins && precios[l.ins] ? precios[l.ins] * (Number(l.cant) || 0) : 0), 0);
    h += '<tr class="tot"><td>Total pastón</td><td class="num">' + fmtN(b, 2) + '</td><td colspan="4"></td><td class="num">' + (costo ? pesos(costo) : '') + '</td><td></td></tr>' +
      (costo && b ? '<tr><td colspan="6" class="muted" style="text-align:right">Costo de insumos por kg producido (sin la carne)</td><td class="num"><b>' + pesos(costo / b) + '</b></td><td></td></tr>' : '');
    h += '</tbody></table><button class="small" style="margin-top:6px" onclick="FORED.recetas[' + ri + '].lineas.push({nombre:\'\',cant:0,ins:\'\',tipo:\'insumo\'});renderInsumos()">＋ Ingrediente</button></div>';
  });
  h += '<div class="row"><button onclick="nuevaReceta()">＋ Nueva fórmula</button><span style="flex:1"></span><button onclick="FORED=null;renderInsumos()">Descartar cambios</button><button class="primary big" onclick="guardarFormulas()">Guardar fórmulas</button></div></section>';
  return h;
}
function setCant(ri, li, inp) {
  const n = leerNum(inp.value);
  if (n == null || Number.isNaN(n)) { inp.classList.add('bad'); return; }
  inp.classList.remove('bad'); FORED.recetas[ri].lineas[li].cant = n; renderInsumos();
}
function nuevaReceta() {
  FORED.recetas.push({ id: 'r' + Date.now().toString(36), nombre: 'Fórmula nueva', lineas: [{ nombre: 'Carne', cant: 100, ins: '', tipo: 'carne' }] });
  renderInsumos();
}
async function guardarFormulas() {
  const nuevo = JSON.parse(JSON.stringify(FORED)); delete nuevo.inicial;
  try {
    FOR = await cambiarDoc('formulas', d => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, nuevo); }, 'Fórmulas guardadas (' + nuevo.recetas.map(r => r.nombre).join(', ') + ')');
    FORED = null; renderInsumos(); toast('Fórmulas guardadas');
  } catch (e) { toast(e.message, true); }
}

/* ================= cambios y usuarios ================= */
async function renderCambios() {
  const sub = 'Todo lo que se cargó o corrigió a mano, con quién y cuándo (los últimos 400).';
  $('main').innerHTML = cabecera('Cambios', sub, '') + '<div class="cargando"><span class="spin"></span></div>';
  let filas = [];
  try { filas = await C3API.cambios(); } catch (e) { toast('No se pudo leer el historial', true); }
  let h = cabecera('Cambios', sub, '') +
    '<section>' + (filas.length ? '<div class="tw" style="max-height:none"><table class="xl" data-hoja="Cambios"><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th></tr></thead><tbody>' +
      filas.map(f => '<tr><td style="white-space:nowrap">' + esc(new Date(f.ts).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })) + '</td><td>' + esc(f.quien) + '</td><td>' + esc(f.cambio || f.doc) + '</td></tr>').join('') +
      '</tbody></table></div>' : '<div class="empty">Todavía no hay cambios.</div>') + '</section>';
  if (C3API.editor) h += '<p class="nota">Para habilitar a alguien (Carlos, Gastón) andá a la pestaña <a href="#" onclick="irA(\'usuarios\');return false">Usuarios</a>.</p>';
  $('main').innerHTML = h;
}
/* Usuarios: quién puede entrar al Centro de control y a la planilla de caja (solo lo ven los editores) */
function renderUsuarios() {
  if (!C3API.editor) { $('main').innerHTML = cabecera('Usuarios', '', '') + '<div class="empty">Solo Igna puede habilitar usuarios.</div>'; return; }
  $('main').innerHTML = cabecera('Usuarios', 'Agregá el mail de la persona, su nombre y qué puede ver, y tocá Agregar. Después le pasás el link y entra con ese mail.', '') + '<section id="sec-usr"><h2>Usuarios</h2><p class="sub">Quién puede entrar. <b>Todo</b>: tablero completo (Carlos). <b>Solo caja</b>: la planilla de caja del local (Gastón). <b>Solo Centro de desposte</b>: rendimiento, faena y DDJJ (S. Saavedra). Los editores de la app de producción entran siempre.</p><div id="usr" class="cargando"><span class="spin"></span></div><p class="nota" style="font-size:14px">Links para pasar: <b>qualita-produccion.web.app/control</b> (tablero, Carlos) · <b>qualita-produccion.web.app/caja</b> (planilla de caja, Gastón) · <b>qualita-produccion.web.app/ddjj</b> (Centro de desposte) · <b>qualita-produccion.web.app/faena</b> (faena y mortalidad, solo lectura).</p></section>';
  dibujarUsuarios();
}
C3API.listo.then(a => { if (a.editor) $('nav-usr').style.display = ''; });
async function dibujarUsuarios() {
  let us = [];
  try { us = await C3API.usuarios(); } catch (e) { $('usr').innerHTML = '<div class="alerta bad">No se pudo leer la lista (¿están publicadas las reglas nuevas de Firestore?)</div>'; return; }
  us.sort((a, b) => a.email.localeCompare(b.email));
  $('usr').className = '';
  $('usr').innerHTML = '<div style="overflow-x:auto"><table style="max-width:820px;min-width:560px"><thead><tr><th>Mail</th><th>Nombre</th><th>Puede ver</th><th></th></tr></thead><tbody>' +
    us.map(u => '<tr><td>' + esc(u.email) + '</td><td>' + esc(u.nombre || '') + '</td><td>' + (u.rol === 'caja' ? 'Solo caja' : u.rol === 'ddjj' ? 'Solo Centro de desposte' : u.rol === 'faena' ? 'Solo ver faena y mortalidad' : 'Todo') + '</td><td><button class="small danger" onclick="sacarUsuario(\'' + esc(u.email) + '\')">Sacar</button></td></tr>').join('') +
    '<tr><td><input id="nu-mail" placeholder="mail con el que ingresa (Google o el que use)"></td><td><input id="nu-nom" placeholder="Nombre (ej: Carlos)"></td><td><select id="nu-rol"><option value="todo">Todo</option><option value="caja">Solo caja</option><option value="ddjj">Solo Centro de desposte</option><option value="faena">Solo ver faena y mortalidad</option></select></td><td><button class="small primary" onclick="agregarUsuario()">Agregar</button></td></tr></tbody></table></div>';
}
async function agregarUsuario() {
  const mail = $('nu-mail').value.trim().toLowerCase(), nombre = $('nu-nom').value.trim(), rol = $('nu-rol').value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { toast('Revisá el mail', true); return; }
  try {
    await C3API.ponerUsuario(mail, { nombre, rol, por: quien(), ts: new Date().toISOString() });
    await C3API.cambiarDoc('usuarios-log', d => { d.n = (d.n || 0) + 1; }, 'Usuario agregado: ' + mail + ' (' + (rol === 'caja' ? 'solo caja' : rol === 'ddjj' ? 'solo Centro de desposte' : rol === 'faena' ? 'solo ver faena y mortalidad' : 'todo') + ')');
    toast('Listo: ' + mail + ' ya puede entrar'); dibujarUsuarios();
  } catch (e) { toast('No se pudo agregar: ' + (e.message || e), true); }
}
async function sacarUsuario(mail) {
  if (!confirm('¿Sacarle el acceso a ' + mail + '?')) return;
  try {
    await C3API.sacarUsuario(mail);
    await C3API.cambiarDoc('usuarios-log', d => { d.n = (d.n || 0) + 1; }, 'Usuario sacado: ' + mail);
    dibujarUsuarios();
  } catch (e) { toast('No se pudo sacar: ' + (e.message || e), true); }
}

/* ================= Excel ================= */
function tablaAoa(t) {
  const aoa = [];
  for (const tr of t.querySelectorAll('tr')) {
    const row = [];
    for (const c of tr.children) {
      let v;
      if (c.dataset.v !== undefined && c.dataset.v !== '') v = Number(c.dataset.v);
      else v = c.innerText.replace(/\s+/g, ' ').trim();
      row.push(v);
      const cs = Number(c.getAttribute('colspan') || 1); for (let i = 1; i < cs; i++) row.push('');
    }
    aoa.push(row);
  }
  return aoa;
}
function descargarExcel() {
  if (!window.XLSX) { toast('No se pudo cargar el componente de Excel (falta internet)', true); return; }
  const wb = XLSX.utils.book_new();
  if (TAB === 'caja') XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaCaja()), 'Caja');
  else {
    const usados = {};
    document.querySelectorAll('#main table.xl').forEach((t, i) => {
      let n = (t.dataset.hoja || 'Hoja ' + (i + 1)).slice(0, 28); if (usados[n]) n = n.slice(0, 25) + ' ' + (i + 1); usados[n] = 1;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tablaAoa(t)), n);
    });
    if (TAB === 'ventas') XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaVentasMensual()), 'Ventas mensuales 1 y 2');
  }
  if (!wb.SheetNames.length) { toast('No hay tablas para descargar en esta pestaña', true); return; }
  const nombres = { inicio: 'Inicio', c3: 'Ciclo III', insumos: 'Insumos', merc: 'Local Mercaderia', ventas: 'Local Ventas', caja: 'Local Caja', cambios: 'Cambios' };
  XLSX.writeFile(wb, 'Qualita Express - ' + nombres[TAB] + ' ' + nombreMes(M) + '.xlsx');
}
/* Caja con el formato de la planilla de Carlos: un bloque por semana */
function aoaCaja() {
  const cj = datosCaja(), aoa = [];
  const enc = ['Día', 'Saldo ant', 'Zeta', '"2"', 'Cta Cte P (1)', 'Cta Cte P (2)', 'A cta', 'Empleados', 'Cta Cte D', 'Entrega', 'Saldo', 'Existencia', 'Diferencia', 'Notas'];
  let semana = null, filas = [];
  const cerrar = () => {
    if (!filas.length) return;
    aoa.push(enc); filas.forEach(r => aoa.push(r));
    const tot = ['Totales', '']; for (let i = 2; i <= 9; i++) tot.push(r2(filas.reduce((s, r) => s + (Number(r[i]) || 0), 0)));
    tot.push('', '', r2(filas.reduce((s, r) => s + (Number(r[12]) || 0), 0))); aoa.push(tot, []); filas = [];
  };
  for (const f of diasDelMes(M)) {
    const s = lunesDe(f);
    if (s !== semana) { cerrar(); semana = s; }
    const dia = (LOC.dias || {})[f] || {}, c = dia.caja || {}, x = cj[f];
    const g = k => nv(c[k]) == null ? '' : nv(c[k]);
    const ng = k => nv(c[k]) == null ? '' : -Math.abs(nv(c[k]));
    const ctaD = nv(c.ctad) == null && nv(c.ctad2) == null ? '' : -(Math.abs(nv(c.ctad) || 0) + Math.abs(nv(c.ctad2) || 0));
    filas.push([DIAS[diaSem(f)] + ' ' + ddmm(f), x.cargado ? r2(x.sa) : '', g('zeta'), g('dos'), g('p1'), g('p2'), g('acta'), ng('emp'), ctaD, ng('ent'),
      x.cargado ? r2(x.saldo) : '', x.contado == null ? '' : r2(x.contado), x.cargado ? r2(x.dif) : '', dia.obs || '']);
  }
  cerrar();
  return aoa;
}
/* Ventas mensuales como la planilla de Carlos: producto, "1", "2", total */
function aoaVentasMensual() {
  const rows = controlLocal();
  const aoa = [[nombreMes(M).toUpperCase()], ['Cód.', 'Cortes', '"1"', '"2"', 'Total']];
  for (const r of rows) aoa.push([r.art, lindo(r.den), r2(r.v1), r2(r.v2), r2(r.v1 + r.v2)]);
  aoa.push(['', 'Total', r2(rows.reduce((s, r) => s + r.v1, 0)), r2(rows.reduce((s, r) => s + r.v2, 0)), r2(rows.reduce((s, r) => s + r.v1 + r.v2, 0))]);
  const mes = LOC.mes || {};
  if (mes.donKg != null || mes.donImp != null) aoa.push([], ['', 'Donación', mes.donKg != null ? -Math.abs(mes.donKg) : '', '', mes.donImp != null ? -Math.abs(mes.donImp) : '']);
  return aoa;
}

/* ================= inicio ================= */
$('mes').value = M;
C3API.listo.then(api => { if (api.rol === 'caja') location.replace('/caja'); else if (api.rol === 'ddjj') location.replace('/ddjj'); else if (api.rol === 'faena') location.replace('/faena'); else cargar(false); });
