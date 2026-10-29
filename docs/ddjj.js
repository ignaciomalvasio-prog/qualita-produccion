/* DDJJ de producción de desposte (link /ddjj) · la usa S. Saavedra
   - Los datos del desposte de cerdo (tipo de ciclo 2) los sube la notebook de Igna (C:\InformeQualita\ddjj\dj_sync.ps1)
     a c3sis/dj-AAAA-MM, con renglones:
       TR|fecha|tropa|cabezas|faena|medias|kg   ME|fecha|tipo ciclo|art|nombre|uni|kg (pestaña Menudencias y rendering, ddjj-men.js)   IN|fecha|art|nombre|uni|kg   RE|fecha|art|nombre|contrato|uni|piezas|kg   CO|contrato|nombre|país
   - c3docs/ddjj-equiv: qué artículos del sistema van en cada renglón de la planilla (se edita en la pestaña Equivalencias).
   - c3docs/ddjj-AAAA-MM: lo corregido a mano, por día. Lo del sistema nunca se pisa: cada corrección guarda el valor nuevo
     y la pantalla muestra al lado lo que dice el sistema.
   - Imprimir arma las dos hojas (Ingreso y Producción) con la misma disposición que la planilla de Excel que se usaba,
     para que caigan en el mismo lugar del formulario. Se puede correr la impresión unos milímetros (Equivalencias › Impresión). */
'use strict';

/* ---------- equivalencias por defecto (sacadas de las planillas de oct-2026) ---------- */
/* cant: de dónde sale la "Cantidad de cortes": medias (una por media res), piezas, unid (unidades), est (estimada por kg) */
const EQ_DEF = {
  lineas: [
    { n: 'Bola de lomo', arts: [327] },
    { n: 'Bondiola', arts: [101, 109, 30105], cant: 'medias' },
    { n: 'Cabeza', arts: [431, 705], cant: 'piezas', dest: 'COSTA DE MARFIL' },
    { n: 'Carre con hueso', arts: [271, 281, 307, 308, 30276], cant: 'resto', menos: ['Cinta de lomo', 'Costeleta', 'Carre,pecho y matambre en juego'] },
    { n: 'Carre,pecho y matambre en juego', arts: [203], cant: 'piezas' },
    { n: 'Churrasquito', arts: [241, 243, 245, 248, 30246] },
    { n: 'Cinta de lomo', arts: [289, 292, 297], cant: 'piezas' },
    { n: 'Costeleta', arts: [225], cant: 'piezas' },
    { n: 'Cuadrada', arts: [329] },
    { n: 'Cuadril', arts: [322] },
    { n: 'Cuero', arts: [411, 412, 418, 437] },
    { n: 'Garrón', arts: [401, 404] },
    { n: 'Jamón con hueso', arts: [315, 316, 317, 318], cant: 'piezas' },
    { n: 'Jamón sin hueso', arts: [321, 326, 342, 343, 344, 346, 357], cant: 'est', kgu: 5.5 },
    { n: 'Matambrito', arts: [231, 240, 30236], cant: 'resto', menos: ['Carre,pecho y matambre en juego'] },
    { n: 'Nalga', arts: [319] },
    { n: 'Oreja', arts: [611] },
    { n: 'Paleta con hueso', arts: [131, 132, 136, 137], cant: 'piezas' },
    { n: 'Paleta sin hueso', arts: [134, 139, 141, 147, 159, 377], cant: 'est', kgu: 4.2 },
    { n: 'Patas y manos', arts: [406, 626] },
    { n: 'Peceto', arts: [324] },
    { n: 'Pechito con manta', arts: [211, 215, 221, 305, 30216], cant: 'resto', menos: ['Carre,pecho y matambre en juego'] },
    { n: 'Recorte de carne', arts: [148, 182, 183, 359, 361, 362, 365, 369, 371, 374] },
    { n: 'Recorte de grasa', arts: [156, 336, 479, 481, 482, 484] },
    { n: 'Solomillo', arts: [285, 298, 30287] },
    { n: 'Tocino', arts: [461, 465, 466, 467] },
    { n: 'Tortuga', arts: [381, 386] },
    { n: 'Vacio', arts: [222, 333] }
  ],
  /* lo que sale del desposte y no va en la declaración (hueso, despojo, grasa en rama, reprocesos de recorte congelado…) */
  ignorar: [22, 208, 354, 358, 364, 372, 376, 420, 421, 422, 424, 425, 430, 472, 488],
  /* contratos de exportación: lo que sale con estos contratos va en la columna Exportación (con el destino del renglón) */
  contExp: [8],
  /* cuero que va a rendering: se informa en la observación */
  rendering: [417],
  enteras: [22],    // medias que salen enteras del desposte (1/2 res sin jamón y sin paleta): se descuentan del ingreso
  eqVer: 2,
  restar: true,      // a cada renglón se le resta lo que reingresó al desposte de esos mismos artículos (reproceso)
  merma: 0.98,       // el total de kg de ingreso se declara con 2 % de merma
  ajuste: { arriba: 0, izq: 0 }   // corrimiento de la impresión, en mm
};

/* ---------- estado ---------- */
const S = { tab: 'rend', mes: '', fecha: '', sis: null, hora: '', eq: null, doc: null, abierto: {}, editando: false };
const mesHoy = () => hoyIso().slice(0, 7);

/* ---------- lectura de lo que subió la notebook ---------- */
function parseDJ(txt) {
  const o = { hora: '', dias: {}, co: {}, c3: {}, me: [] };
  const d3 = f => o.c3[f] || (o.c3[f] = { re: [], in: [] });
  const dia = f => o.dias[f] || (o.dias[f] = { tr: [], in: [], re: [], en: [] });
  for (const l of String(txt || '').split(/\r?\n/)) {
    const p = l.replace(/^\uFEFF/, '').split('|'), t = p[0];
    if (t === 'OK') o.hora = p[1];
    else if (t === 'TR') dia(p[1]).tr.push({ tropa: p[2], cab: num(p[3]), faena: p[4], medias: num(p[5]), kg: num(p[6]) });
    else if (t === 'IN') dia(p[1]).in.push({ art: +p[2], den: (p[3] || '').trim(), uni: num(p[4]), kg: num(p[5]) });
    else if (t === 'RE') dia(p[1]).re.push({ art: +p[2], den: (p[3] || '').trim(), cont: +p[4], uni: num(p[5]), pz: num(p[6]), kg: num(p[7]) });
    else if (t === 'C3') d3(p[1]).re.push({ art: +p[2], den: (p[3] || '').trim(), uni: num(p[4]), kg: num(p[5]) });
    else if (t === 'C3I') d3(p[1]).in.push({ art: +p[2], den: (p[3] || '').trim(), uni: num(p[4]), kg: num(p[5]) });
    else if (t === 'EN') { const x = dia(p[1]); (x.en = x.en || []).push({ art: +p[2], tropa: String(p[3] || '').trim(), uni: num(p[4]) }); }
    else if (t === 'ME') o.me.push({ f: p[1], ticd: +p[2], art: +p[3], den: (p[4] || '').trim(), uni: num(p[5]), kg: num(p[6]) });
    else if (t === 'CO') o.co[p[1]] = { den: (p[2] || '').trim(), pais: (p[3] || '').trim() };
  }
  return o;
}

/* ---------- cuentas de un día ---------- */
const eq = () => S.eq || EQ_DEF;
const diaDoc = f => ((S.doc && S.doc.dias) || {})[f] || {};
function lineaDe(art) { return eq().lineas.find(l => (l.arts || []).includes(art)); }
function estadoArt(art) {
  if (lineaDe(art)) return 'linea';
  if ((eq().ignorar || []).includes(art)) return 'ignorar';
  if ((eq().rendering || []).includes(art)) return 'rendering';
  if ((eq().enteras || []).includes(art)) return 'ignorar';
  return 'nuevo';
}

/* La planilla que propone el sistema para el día f (sin lo corregido a mano) */
/* A qué renglón va un artículo del sistema el día f: primero lo movido solo ese día, después las equivalencias.
   Devuelve el nombre del renglón, '#I' (no va), '#R' (cuero a rendering) o null (artículo nuevo sin asignar). */
function destino(art, f) {
  const mv = (diaDoc(f).mover || {})[art];
  if (mv) return mv === 'I' ? '#I' : mv === 'R' ? '#R' : mv.slice(2);
  const e = estadoArt(art);
  return e === 'linea' ? lineaDe(art).n : e === 'ignorar' ? '#I' : e === 'rendering' ? '#R' : null;
}
function calcular(f) {
  const d = (S.sis && S.sis.dias[f]) || { tr: [], in: [], re: [] };
  const medias = d.tr.reduce((a, t) => a + t.medias, 0);
  const enteras0 = d.re.filter(r => (eq().enteras || []).includes(r.art)).reduce((a, r) => a + r.uni, 0);
  const prod = {};
  const lineas = eq().lineas.slice();
  for (const v of Object.values(diaDoc(f).mover || {})) if (v.startsWith('L:') && !lineas.some(l => l.n === v.slice(2))) lineas.push({ n: v.slice(2), arts: [] });
  for (const l of lineas) {
    const re = d.re.filter(r => destino(r.art, f) === l.n);
    if (!re.length) continue;   // si de ese corte solo hubo reingreso (sin producción), no va
    const bruto = re.reduce((a, r) => a + r.kg, 0);
    let ing = eq().restar === false ? [] : d.in.filter(r => destino(r.art, f) === l.n);
    if (bruto - ing.reduce((a, r) => a + r.kg, 0) <= 0) ing = [];   // no se resta si daría negativo
    const kgs = bruto - ing.reduce((a, r) => a + r.kg, 0);
    const ce = eq().contExp || [];
    const kgExp = r2(re.filter(r => ce.includes(r.cont)).reduce((a, r) => a + r.kg, 0)), kgCons = r2(kgs - kgExp);
    let cant = null;
    if (l.cant === 'medias' || l.cant === 'resto') cant = medias - enteras0;
    else if (l.cant === 'piezas') cant = re.reduce((a, r) => a + (r.pz || r.uni), 0);
    else if (l.cant === 'unid') cant = re.reduce((a, r) => a + r.uni, 0);
    else if (l.cant === 'est' && l.kgu) cant = Math.round(kgs / l.kgu / 10) * 10;
    prod[l.n] = { n: l.n, cant, exp: kgExp || null, cons: kgExp && !kgCons ? null : kgCons, dest: (kgExp && l.dest) || 'CONSUMO', re, ing, est: l.cant === 'est' };
  }
  /* una tropa faenada en dos días viene en dos renglones: los dos llevan FAENA PARCIAL.
     Si la tropa tuvo muertos (corral o viaje, del sistema o cargados a mano), el total de tropa son las cabezas faenadas
     (cabezas recibidas − muertos) y también va FAENA PARCIAL (pedido de Sabi, 29/10, tropa 261799: 160 − 1 = 159). */
  const veces = {}; d.tr.forEach(t => { veces[t.tropa] = (veces[t.tropa] || 0) + 1; });
  const muertosDe = muertosPorTropa();
  const ingreso = d.tr.slice().sort((a, b) => String(a.tropa).localeCompare(String(b.tropa)) || String(a.faena).localeCompare(String(b.faena))).map(t => {
    const mu = muertosDe[String(t.tropa)] || 0;
    return {
      faena: t.faena, tropa: t.tropa, cab: mu && t.cab ? Math.max(0, t.cab - mu) : t.cab, medias: t.medias, prom: t.medias ? Math.round(t.kg / t.medias) : 0,
      kg: t.medias ? t.medias * Math.round(t.kg / t.medias) : 0, obs: veces[t.tropa] > 1 || mu ? 'FAENA PARCIAL' : (obsAnterior(t.tropa, f) || 'Consumo'),
      muertos: mu
    };
  });
  /* medias que salieron enteras (1/2 res sin jamón y sin paleta): se descuentan de su tropa (el sistema la guarda en el desposte);
     si no se sabe la tropa, de la faenada más tarde (como hace Sabi) */
  const enteras = d.re.filter(r => (eq().enteras || []).includes(r.art)).reduce((a, r) => a + r.uni, 0);
  const descEn = [];
  if (enteras && ingreso.length) {
    let resto = enteras;
    const descontar = (row, n) => { const q = Math.min(n, row.medias); row.medias -= q; row.kg = row.medias * row.prom; resto -= q; if (q) descEn.push(row.tropa + ' (' + q + ')'); };
    for (const e of (d.en || [])) {
      const row = ingreso.filter(r => e.tropa && (String(r.tropa) === e.tropa || e.tropa.endsWith(String(r.tropa)))).sort((a, b) => String(b.faena).localeCompare(String(a.faena)))[0];
      if (row) descontar(row, Math.min(e.uni, resto));
    }
    const porFaena = ingreso.slice().sort((a, b) => String(b.faena).localeCompare(String(a.faena)) || b.medias - a.medias);
    for (const row of porFaena) { if (resto <= 0) break; descontar(row, resto); }
  }
  ingreso.forEach(r => { delete r.prom; });
  const rend = d.re.filter(r => destino(r.art, f) === '#R');
  const nuevos = d.re.filter(r => destino(r.art, f) === null);
  return { medias, enteras, descEn, prod, ingreso, rendKg: r2(rend.reduce((a, r) => a + r.kg, 0)), rend, nuevos, hay: d.tr.length + d.re.length > 0, d };
}

/* Muertos por número de tropa: los del sistema (dj-anual, MU) más los cargados a mano en Faena y mortalidad */
function muertosPorTropa() {
  const o = {};
  const sum = m => { const k = String(m.tropa || '').trim(); if (k) o[k] = (o[k] || 0) + (Number(m.cab) || 0); };
  ((S.anual && S.anual.mu) || []).forEach(sum);
  ((S.muertos && S.muertos.lista) || []).forEach(sum);
  return o;
}

/* Si a una tropa se le puso otra observación un día anterior (ej. "FAENA PARCIAL"), se repite */
function obsAnterior(tropa, f) {
  const dias = (S.doc && S.doc.dias) || {};
  const prev = Object.keys(dias).filter(x => x < f).sort().reverse();
  for (const x of prev) { const r = (dias[x].ing || []).find(z => String(z.tropa) === String(tropa)); if (r && r.obs) return r.obs; }
  return '';
}

/* La planilla final: lo del sistema + lo corregido */
function planilla(f) {
  const c = calcular(f), x = diaDoc(f), ov = x.prod || {};
  const filas = [];
  const nombres = new Set(Object.keys(c.prod).concat(Object.keys(ov)));
  for (const n of nombres) {
    const s = c.prod[n] || { n, cant: null, exp: null, cons: null, dest: 'CONSUMO', re: [], ing: [] }, o = ov[n] || {};
    if (o.quitar) continue;
    const v = k => (o[k] !== undefined ? o[k] : s[k]);
    filas.push({ n, cant: v('cant'), exp: v('exp'), cons: v('cons'), dest: v('dest'), sis: s, ov: o, manual: !c.prod[n] });
  }
  filas.sort((a, b) => a.n.localeCompare(b.n, 'es'));
  const ingreso = x.ing ? x.ing : c.ingreso;
  /* cantidades que salen de las medias: "una por media" = las medias del ingreso; "el resto" = las medias menos los otros cortes
     de esa parte (carré + cinta + costeleta + parrillero = medias; el parrillero también descuenta de pechito y matambrito) */
  const M = ingreso.reduce((a, r) => a + (Number(r.medias) || 0), 0);
  const cantFinal = n => { const r = filas.find(z => z.n === n); return r ? (Number(r.cant) || 0) : 0; };
  for (const r of filas) {
    const l = eq().lineas.find(z => z.n === r.n); if (!l || r.ov.cant !== undefined) continue;
    if (l.cant === 'medias') r.cant = r.sis.cant = M;
    else if (l.cant === 'resto') r.cant = r.sis.cant = Math.max(M - (l.menos || []).reduce((a, n) => a + cantFinal(n), 0), 0);
  }
  const tot = {
    cant: filas.reduce((a, r) => a + (Number(r.cant) || 0), 0),
    exp: r2(filas.reduce((a, r) => a + (Number(r.exp) || 0), 0)),
    cons: r2(filas.reduce((a, r) => a + (Number(r.cons) || 0), 0)),
    medias: ingreso.reduce((a, r) => a + (Number(r.medias) || 0), 0),
    kg: ingreso.reduce((a, r) => a + (Number(r.kg) || 0), 0)
  };
  tot.kgDecl = r2(tot.kg * (eq().merma || 1));
  const cantDe = n => { const r = filas.find(z => z.n === n); return r ? (Number(r.cant) || 0) : 0; };
  const jam = tot.medias - cantDe('Jamón con hueso') - cantDe('Jamón sin hueso');
  const pal = tot.medias - cantDe('Paleta con hueso') - cantDe('Paleta sin hueso');
  const obsAuto = 'Observaciones:  Se procesa como recorte de carne parte del jamón (' + Math.max(jam, 0) + ' unidades) y paleta (' + Math.max(pal, 0) +
    ' unidades) por cuestiones comerciales. Parte del cuero (' + fmtP(c.rendKg) + ' kg) se destina a rendering por el mismo motivo.';
  return { c, filas, ingreso, tot, obs: x.obs != null ? x.obs : obsAuto, obsAuto, x, ingEditado: !!x.ing };
}

/* ---------- formato ---------- */
const fmt2 = v => (v == null || v === '' || isNaN(v)) ? '' : Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = v => (v == null || v === '' || isNaN(v)) ? '' : Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 });
/* como salía en la planilla impresa: punto decimal, sin separador de miles */
const fmtP = v => (v == null || v === '' || isNaN(v)) ? '' : (Math.round(Number(v) * 100) / 100).toFixed(2).replace(/\.00$/, '.00');
const fmtPI = v => (v == null || v === '' || isNaN(v)) ? '' : String(Math.round(Number(v)));
const fechaLarga = iso => DIAS[diaSem(iso)] + ' ' + Number(iso.slice(8, 10)) + ' de ' + MESES[Number(iso.slice(5, 7)) - 1].toLowerCase();
const ddmmaaaa = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';

/* ---------- carga ---------- */
async function cargar(forzar) {
  if (!S.mes) S.mes = mesHoy();
  $('mes').value = S.mes;
  $('main').innerHTML = '<div class="cargando"><span class="spin"></span> Leyendo…</div>';
  if (window.FAENA_PUB) return cargarPublico();
  try {
    const [txt, e, doc, anual, mu] = await Promise.all([sisTexto('dj-' + S.mes), leerDoc('ddjj-equiv'), leerDoc('ddjj-' + S.mes), sisTexto('dj-anual'), leerDoc('ddjj-muertos')]);
    S.sis = parseDJ(txt); S.hora = S.sis.hora;
    S.anual = anual ? parseAnual(anual) : null; S.muertos = mu.d || {};
    S.eq = e.d && e.d.lineas ? e.d : JSON.parse(JSON.stringify(EQ_DEF));
    if ((S.eq.eqVer || 1) < 2) {   // pedido de Sabi (28/10): medias enteras (art. 22) y cantidades que suman las medias
      S.eq.enteras = S.eq.enteras || [22]; S.eq.eqVer = 2;
      const L = n => S.eq.lineas.find(l => l.n === n);
      if (L('Carre con hueso')) Object.assign(L('Carre con hueso'), { cant: 'resto', menos: ['Cinta de lomo', 'Costeleta', 'Carre,pecho y matambre en juego'] });
      ['Matambrito', 'Pechito con manta'].forEach(n => { if (L(n)) Object.assign(L(n), { cant: 'resto', menos: ['Carre,pecho y matambre en juego'] }); });
      S.eq.ignorar = (S.eq.ignorar || []).filter(a => !S.eq.enteras.includes(a));
    }
    if (!S.eq.contExp) {   // equivalencias guardadas antes de que la exportación se tomara por contrato
      S.eq.contExp = [8]; S.eq.ignorar = (S.eq.ignorar || []).filter(a => a !== 431);
      const cab = S.eq.lineas.find(l => l.n === 'Cabeza'); if (cab && !cab.arts.includes(431)) cab.arts.unshift(431);
    }
    S.doc = doc.d || {};
    const dias = Object.keys(S.sis.dias).sort();
    if (!S.fecha || S.fecha.slice(0, 7) !== S.mes || !S.sis.dias[S.fecha]) S.fecha = proximoSinHacer(dias) || dias[dias.length - 1] || '';
    if (forzar) toast('Datos actualizados');
  } catch (err) {
    $('main').innerHTML = '<section><div class="alerta bad">No se pudieron leer los datos: ' + esc(err.message || err) + '</div></section>';
    if (window.__auto) { window.__auto.hecho = true; document.title = 'AUTO-ERROR'; }
    return;
  }
  cabecera(); render();
  if (window.__auto) correrAuto();
}
/* el último día anterior a hoy que no se imprimió (normalmente el de ayer: hoy todavía se está despostando) */
function proximoSinHacer(dias) {
  const pend = dias.filter(f => f < hoyIso() && !diaDoc(f).impreso);
  return pend.length ? pend[pend.length - 1] : null;
}
/* link público /faena?k=…: lee config/fp-<clave> (lo publica dj_sync.ps1 de la notebook) sin ingresar */
async function cargarPublico() {
  try {
    let d = window.__mockPub;
    if (!d) {
      const r = await fetch('https://firestore.googleapis.com/v1/projects/qualita-produccion/databases/(default)/documents/config/fp-' + encodeURIComponent(window.FAENA_PUB) + '?key=AIzaSyD9DSR82lLUigI8WeCjlR4nIc5I7xyjmTY');
      if (!r.ok) throw new Error('link no válido');
      const j = await r.json(), f = j.fields || {};
      d = { txt: (f.txt || {}).stringValue || '', muertos: (f.muertos || {}).stringValue || '{}' };
    }
    S.sis = parseDJ(''); S.anual = parseAnual(d.txt); S.hora = S.anual.hora; S.eq = JSON.parse(JSON.stringify(EQ_DEF)); S.doc = {};
    try { S.muertos = JSON.parse(d.muertos || '{}'); } catch (e) { S.muertos = {}; }
    S.tab = 'faena';
  } catch (e) {
    $('main').innerHTML = '<section style="max-width:560px;margin:40px auto;text-align:center"><h2 style="justify-content:center">Este link no funciona</h2><p class="sub">Pedile a Igna que te pase el link de nuevo.</p></section>'; return;
  }
  cabecera(); render();
}
function cabecera() {
  $('st').innerHTML = (S.hora ? '<span class="dot"></span>Sistema al ' + esc(ddmm(S.hora.slice(0, 10)) + ' ' + S.hora.slice(11)) : '<span class="dot off"></span>Sin datos del sistema para este mes') +
    (window.FAENA_PUB ? '' : '<br>' + esc(quien()) + ' · <a href="#" onclick="C3API.salir();return false">Salir</a>');
}
/* "Traer datos nuevos del sistema": deja un pedido en c3docs/ddjj-pedido; la notebook de Igna lo revisa cada 5 minutos
   (dj_pedido.ps1, de 6:30 a 21:30), lee el sistema, sube los datos y marca el pedido como hecho. Acá se espera y se recarga sola. */
let esperandoPedido = null;
async function pedirActualizacion() {
  if (window.FAENA_PUB || window.SOLO_FAENA) { cargar(true); return; }
  if (esperandoPedido) { toast('Ya está pedido: en unos minutos se actualiza solo.'); return; }
  const pedido = new Date().toISOString();
  try { await cambiarDoc('ddjj-pedido', d => { d.pedido = pedido; d.por = quien(); }, 'Pide datos nuevos del sistema'); }
  catch (e) { toast(e.message, true); return; }
  const btn = $('btn-act'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Pidiendo datos al sistema…'; }
  toast('Listo, se pidieron los datos. Tarda hasta 5 minutos (la notebook de Igna tiene que estar prendida).');
  const inicio = Date.now();
  esperandoPedido = setInterval(async () => {
    let d = {}; try { d = (await leerDoc('ddjj-pedido')).d || {}; } catch (e) {}
    const listo = d.hecho && d.hecho >= pedido, vencido = Date.now() - inicio > 8 * 60000;
    if (!listo && !vencido) return;
    clearInterval(esperandoPedido); esperandoPedido = null;
    if (btn) { btn.disabled = false; btn.textContent = '⟳ Traer datos nuevos'; }
    if (listo) { await cargar(false); toast('Datos actualizados del sistema'); }
    else toast('La notebook no respondió (puede estar apagada). Los datos se actualizan solos a las 7, 11, 15 y 19 h.', true);
  }, 20000);
}
function cambiarMes(m) { if (!m) return; S.mes = m; S.fecha = ''; cargar(false); }
function moverMes(n) { cambiarMes(n < 0 ? mesAnterior(S.mes) : mesSiguiente(S.mes)); }

/* ---------- pantalla ---------- */
function render() {
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.t === S.tab));
  if (S.tab === 'equiv') return renderEquiv();
  if (S.tab === 'c3') return renderC3();
  if (S.tab === 'rend') return renderRend();
  if (S.tab === 'faena') return renderFaena();
  if (S.tab === 'men') return renderMen();
  if (S.tab === 'traza') return renderTraza();
  renderDia();
}

function chipDia(f) {
  const x = diaDoc(f);
  if (x.impreso) return '<span class="chip ok sm">impresa</span>';
  if (x.por) return '<span class="chip info sm">revisada</span>';
  return '<span class="chip mut sm">sin hacer</span>';
}

function renderDia() {
  const dias = Object.keys(S.sis.dias).sort();
  let h = '<div class="dj-wrap"><aside class="dj-dias"><div class="dj-dias-t">Días con desposte</div>';
  if (!dias.length) h += '<p class="muted" style="padding:8px">No hay desposte cargado en ' + esc(nombreMes(S.mes)) + '.</p>';
  h += dias.slice().reverse().map(f => '<a href="#" class="dj-dia' + (f === S.fecha ? ' on' : '') + '" onclick="irDia(\'' + f + '\');return false"><b>' + DIAS3[diaSem(f)] + ' ' + ddmm(f) + '</b>' + chipDia(f) + '</a>').join('');
  h += '</aside><div class="dj-cont">';
  if (!S.fecha) { $('main').innerHTML = h + '<section><p class="muted">Elegí un día.</p></section></div></div>'; return; }

  const P = planilla(S.fecha), x = P.x;
  h += '<section class="dj-top"><div><h2>' + esc(fechaLarga(S.fecha)) + '</h2><p class="sub" style="margin:0">' +
    fmt0(P.tot.medias) + ' medias reses · ' + fmt2(P.tot.cons + P.tot.exp) + ' kg producidos' +
    (x.por ? ' · último cambio: ' + esc(x.por) + ' ' + esc(horaDe(x.ts)) : '') + (x.impreso ? ' · impresa ' + esc(horaDe(x.impreso)) : '') + '</p></div>' +
    '<div class="row"><button onclick="verImpresion()">👁 Ver cómo sale</button><button onclick="excelDJ(false)" title="La planilla de este día (ingreso y producción) en Excel">⬇ Excel del día</button><button onclick="excelDJ(true)" title="Una hoja por cada día con desposte del mes">⬇ Excel del mes</button><button class="primary big" onclick="imprimir()">🖨 Imprimir</button></div></section>';

  if (P.c.nuevos.length) {
    h += '<div class="alerta warn"><div><b>Hay artículos nuevos que todavía no están asignados a ningún renglón.</b> Decí a qué renglón van (queda guardado para los próximos días):<table class="dj-nuevos">' +
      P.c.nuevos.map(r => '<tr><td>' + r.art + ' · ' + esc(r.den) + '</td><td class="num">' + fmt2(r.kg) + ' kg</td><td>' + selectLinea(r.art) + '</td></tr>').join('') + '</table></div></div>';
  }

  /* ---- producción ---- */
  h += '<section><h2>Producción</h2><p class="sub">Tocá un número para corregirlo (queda en amarillo y se ve al lado lo que dice el sistema). Tocá el nombre de un corte para ver de qué artículos del sistema sale.</p>';
  h += '<div class="tw"><table class="planilla dj-tab"><thead><tr><th>Nombre del corte</th><th class="num">Cantidad de cortes</th><th class="num">Kg exportación</th><th class="num">Kg consumo</th><th>Destino</th><th></th></tr></thead><tbody>';
  for (const r of P.filas) {
    const ab = S.abierto[r.n];
    h += '<tr><td><a href="#" class="dj-n" onclick="abrir(\'' + jsq(r.n) + '\');return false">' + (ab ? '▾ ' : '▸ ') + esc(r.n) + '</a>' + (r.manual ? ' <span class="chip sm info">agregado</span>' : '') + '</td>' +
      celda(r, 'cant', fmt0) + celda(r, 'exp', fmt2) + celda(r, 'cons', fmt2) +
      '<td class="ed' + (r.ov.dest !== undefined ? ' aj' : '') + '" onclick="editar(\'' + jsq(r.n) + '\',\'dest\')">' + esc(r.dest || '') + '</td>' +
      '<td><button class="small danger" title="Sacar este renglón de la planilla" onclick="quitar(\'' + jsq(r.n) + '\')">✕</button></td></tr>';
    if (ab) h += '<tr class="dj-det"><td colspan="6">' + detalle(r) + '</td></tr>';
  }
  h += '<tr class="tot"><td>Totales</td><td class="num">' + fmt0(P.tot.cant) + '</td><td class="num">' + fmt2(P.tot.exp) + '</td><td class="num">' + fmt2(P.tot.cons) + '</td><td colspan="2"></td></tr>';
  h += '</tbody></table></div>';
  const quitados = Object.keys(x.prod || {}).filter(n => x.prod[n].quitar);
  h += '<div class="row" style="margin-top:10px"><select id="nueva-l"><option value="">+ Agregar un renglón…</option>' +
    eq().lineas.map(l => l.n).filter(n => !P.filas.some(r => r.n === n)).map(n => '<option>' + esc(n) + '</option>').join('') + '<option value="*">Otro (escribir el nombre)</option></select>' +
    '<button class="small" onclick="agregar()">Agregar</button>' +
    (quitados.length ? '<span class="muted" style="font-size:13px">Sacados: ' + quitados.map(n => esc(n) + ' <a href="#" onclick="volver(\'' + jsq(n) + '\');return false">volver a poner</a>').join(' · ') + '</span>' : '') + '</div>';
  h += '<h3 class="dj-h3">Observaciones</h3><textarea id="obs" rows="3" onchange="guardarObs(this.value)">' + esc(P.obs) + '</textarea>' +
    '<div class="row" style="margin-top:6px"><span class="muted" style="font-size:13px">Las unidades de jamón y paleta salen de las medias menos lo declarado con y sin hueso. El cuero a rendering: ' +
    (P.c.rend.map(r => esc(r.den) + ' ' + fmt2(r.kg) + ' kg').join(', ') || 'no hubo') + '.</span>' +
    (x.obs != null ? '<button class="small" onclick="guardarObs(null)">Volver al texto automático</button>' : '') + '</div></section>';

  /* ---- ingreso ---- */
  h += '<section><h2>Ingreso</h2><p class="sub">Tropas que entraron al desposte este día. Los kilos son medias × el peso promedio por media (redondeado), como en la planilla. El total se declara con ' +
    Math.round((1 - (eq().merma || 1)) * 100) + ' % de merma.' + (P.ingEditado ? ' <b>Esta parte está corregida a mano.</b> <a href="#" onclick="ingSistema();return false">Volver a lo del sistema</a>' : '') + '</p>' +
    (P.c.enteras && !P.ingEditado ? '<div class="alerta warn">Se descontaron <b>' + fmt0(P.c.enteras) + ' medias</b> que salieron enteras como 1/2 res sin jamón y sin paleta, de la tropa ' + esc(P.c.descEn.join(', ')) + '. Si iban de otra tropa, corregilo tocando las medias.</div>' : '') +
    (!P.ingEditado && P.ingreso.some(t => t.muertos) ? '<div class="alerta warn">Tropas con muertos (Faena y mortalidad): ' + P.ingreso.filter(t => t.muertos).map(t => '<b>' + esc(t.tropa) + '</b> ' + fmt0(t.cab + t.muertos) + ' − ' + fmt0(t.muertos) + ' = ' + fmt0(t.cab) + ' faenados').join(' · ') + '. El total de tropa va con las faenadas y como FAENA PARCIAL.</div>' : '');
  h += '<div class="tw"><table class="planilla dj-tab"><thead><tr><th>Fecha de faena</th><th>Nº de tropa</th><th class="num">Total de tropa</th><th class="num">Medias reses</th><th class="num">Kg de ingreso</th><th>Observaciones</th><th></th></tr></thead><tbody>';
  P.ingreso.forEach((t, i) => {
    h += '<tr>' + celdaIng(i, 'faena', ddmmaaaa(t.faena)) + celdaIng(i, 'tropa', esc(t.tropa)) + celdaIng(i, 'cab', fmt0(t.cab), 1) + celdaIng(i, 'medias', fmt0(t.medias), 1) +
      celdaIng(i, 'kg', fmt0(t.kg), 1) + celdaIng(i, 'obs', esc(t.obs || '')) + '<td><button class="small danger" title="Sacar" onclick="ingQuitar(' + i + ')">✕</button></td></tr>';
  });
  h += '<tr class="tot"><td colspan="3">Total</td><td class="num">' + fmt0(P.tot.medias) + '</td><td class="num">' + fmt0(P.tot.kgDecl) + '</td><td colspan="2" class="muted">(' + fmt0(P.tot.kg) + ' − merma)</td></tr></tbody></table></div>';
  h += '<div class="row" style="margin-top:10px"><button class="small" onclick="ingAgregar()">+ Agregar una tropa</button></div>';
  const reproc = P.c.d.in;
  if (reproc.length) h += '<p class="muted" style="font-size:13px;margin-top:10px">También entraron al desposte (reproceso, no va en el ingreso): ' + reproc.map(r => esc(r.den) + ' ' + fmt2(r.kg) + ' kg').join(' · ') + '</p>';
  h += '</section></div></div>';
  $('main').innerHTML = h;
}
const jsq = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const horaDe = ts => { if (!ts) return ''; const d = new Date(ts); return isNaN(d) ? '' : ddmm(isoDe(d)) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };

function celda(r, k, f) {
  const aj = r.ov[k] !== undefined, sv = r.sis[k];
  const tip = aj ? ' title="Sistema: ' + (sv == null ? 'vacío' : f(sv)) + '"' : (k === 'cant' && r.sis.est ? ' title="Estimada por los kilos: revisala"' : '');
  return '<td class="num ed' + (aj ? ' aj' : '') + (k === 'cant' && r.sis.est && !aj ? ' dj-est' : '') + '"' + tip + ' onclick="editar(\'' + jsq(r.n) + '\',\'' + k + '\')">' + f(r[k]) +
    (aj ? '<small class="dj-sis">' + (sv == null ? '—' : f(sv)) + '</small>' : '') + '</td>';
}
function celdaIng(i, k, txt, n) {
  return '<td class="ed' + (n ? ' num' : '') + '" onclick="editarIng(' + i + ',\'' + k + '\')">' + txt + '</td>';
}
function detalle(r) {
  const s = r.sis;
  if (!s.re.length && !s.ing.length) return '<span class="muted">Renglón cargado a mano (no sale del sistema).</span>';
  const mv = diaDoc(S.fecha).mover || {}, vistos = new Set();
  let h = '<table class="dj-mini"><tr><th>Artículo del sistema</th><th class="num">Unid.</th><th class="num">Piezas</th><th class="num">Kg</th><th>Mandarlo a</th></tr>';
  h += s.re.map(x => {
    const sel = vistos.has(x.art) ? '' : selectMover(x.art, r.n); vistos.add(x.art);
    return '<tr><td>' + x.art + ' · ' + esc(x.den) + (x.cont > 1 ? ' <span class="muted">(contrato ' + x.cont + (S.sis.co[x.cont] && S.sis.co[x.cont].den ? ' ' + esc(S.sis.co[x.cont].den) : '') + ')</span>' : '') +
      (mv[x.art] ? ' <span class="chip sm warn">movido solo este día</span> <a href="#" onclick="desmover(' + x.art + ');return false">deshacer</a>' : '') +
      '</td><td class="num">' + fmt0(x.uni) + '</td><td class="num">' + fmt0(x.pz) + '</td><td class="num">' + fmt2(x.kg) + '</td><td>' + sel + '</td></tr>';
  }).join('');
  h += s.ing.map(x => '<tr class="neg"><td>− reingresó al desposte: ' + x.art + ' · ' + esc(x.den) + '</td><td class="num">' + fmt0(x.uni) + '</td><td></td><td class="num">−' + fmt2(x.kg) + '</td><td></td></tr>').join('');
  h += '</table>';
  return h;
}
/* renglones agregados a mano este día ("Otro (escribir el nombre)") que todavía no son renglones fijos de Equivalencias */
function agregadosDia() { return Object.keys(diaDoc(S.fecha).prod || {}).filter(n => !diaDoc(S.fecha).prod[n].quitar && !eq().lineas.some(l => l.n === n)); }
function optAgregados(excepto) {
  const a = agregadosDia().filter(n => n !== excepto);
  return a.length ? '<optgroup label="Agregados en este día">' + a.map(n => '<option value="N:' + esc(n) + '">' + esc(n) + '</option>').join('') + '</optgroup>' : '';
}
function selectLinea(art) {
  return '<select onchange="asignar(' + art + ',this.value)"><option value="">Elegir…</option><optgroup label="Renglón de la planilla">' +
    eq().lineas.map(l => '<option value="L:' + esc(l.n) + '">' + esc(l.n) + '</option>').join('') + '</optgroup>' + optAgregados() +
    '<option value="I">No va en la declaración</option><option value="R">Cuero a rendering (va en la observación)</option></select>';
}
/* mandar un artículo a un renglón agregado a mano: solo este día, o para siempre (pasa a ser un renglón fijo de Equivalencias).
   Lo cargado a mano en ese renglón (cantidad y kilos) se reemplaza por lo del sistema; el destino se mantiene. */
function asignarAgregado(art, n) {
  const limpiar = x => { const o = (x.prod || {})[n]; if (!o) return; delete o.cant; delete o.exp; delete o.cons; if (!o.dest || o.dest === 'CONSUMO') delete x.prod[n]; };
  $('dlg-h').textContent = 'Mandar el artículo ' + art + ' a ' + n;
  $('dlg-b').innerHTML = '<p class="sub">¿Solo para el ' + esc(fechaLarga(S.fecha)) + ', o para siempre? "Siempre" deja <b>' + esc(n) + '</b> como renglón fijo (se ve en Equivalencias) y el artículo va ahí todos los días.</p>' +
    '<p class="sub">Los números que hayas escrito a mano en ese renglón se reemplazan por los del sistema.</p>';
  $('dlg-f').innerHTML = '<button onclick="cerrarDlg();render()">Cancelar</button><button id="mv-dia">Solo este día</button><button class="primary" id="mv-siempre">Siempre</button>';
  $('mv-dia').onclick = () => { cerrarDlg(); cambiarDia(x => { x.mover = x.mover || {}; x.mover[art] = 'L:' + n; limpiar(x); }, 'artículo ' + art + ' al renglón agregado ' + n + ' (solo este día)'); };
  $('mv-siempre').onclick = async () => {
    cerrarDlg();
    await cambiarEq(d => { sacarArt(d, art); const l = d.lineas.find(z => z.n === n); if (l) l.arts.push(art); else d.lineas.push({ n, arts: [art] }); }, 'artículo ' + art + ' → renglón nuevo ' + n);
    cambiarDia(x => { limpiar(x); }, 'renglón ' + n + ' pasa a salir del sistema');
  };
  $('dlg').showModal();
}

/* "Mandarlo a": pasar un artículo del sistema a otro renglón (solo ese día o siempre) */
function selectMover(art, actual) {
  return '<select class="dj-mover" onchange="moverArt(' + art + ',this.value,\'' + jsq(actual) + '\')"><option value="">' + esc(actual) + ' (está acá)</option>' +
    eq().lineas.filter(l => l.n !== actual).map(l => '<option value="L:' + esc(l.n) + '">' + esc(l.n) + '</option>').join('') + optAgregados(actual) +
    '<option value="I">No va en la declaración</option><option value="R">Cuero a rendering</option></select>';
}
function moverArt(art, v, actual) {
  if (!v) return;
  if (v.startsWith('N:')) return asignarAgregado(art, v.slice(2));
  const nom = v === 'I' ? 'que no vaya en la declaración' : v === 'R' ? 'cuero a rendering' : v.slice(2);
  $('dlg-h').textContent = 'Mandar el artículo ' + art + ' a ' + nom;
  $('dlg-b').innerHTML = '<p class="sub">¿Solo para el ' + esc(fechaLarga(S.fecha)) + ', o para siempre (todos los días)?</p>';
  $('dlg-f').innerHTML = '<button onclick="cerrarDlg();render()">Cancelar</button><button id="mv-dia">Solo este día</button><button class="primary" id="mv-siempre">Siempre</button>';
  $('mv-dia').onclick = () => { cerrarDlg(); cambiarDia(x => { x.mover = x.mover || {}; x.mover[art] = v; }, 'artículo ' + art + ' de ' + actual + ' a ' + nom + ' (solo este día)'); };
  $('mv-siempre').onclick = () => { cerrarDlg(); asignar(art, v); };
  $('dlg').showModal();
}
function desmover(art) { cambiarDia(x => { if (x.mover) { delete x.mover[art]; if (!Object.keys(x.mover).length) delete x.mover; } }, 'artículo ' + art + ' vuelve a su renglón'); }

/* ---------- acciones del día ---------- */
function irDia(f) { S.fecha = f; S.abierto = {}; render(); window.scrollTo(0, 0); }
function abrir(n) { S.abierto[n] = !S.abierto[n]; render(); }

async function cambiarDia(fn, desc) {
  const f = S.fecha, m = f.slice(0, 7);
  try {
    S.doc = await cambiarDoc('ddjj-' + m, d => {
      d.dias = d.dias || {}; const x = d.dias[f] = d.dias[f] || {};
      fn(x); x.por = quien(); x.ts = new Date().toISOString();
    }, 'DDJJ ' + ddmm(f) + ': ' + desc);
    render();
  } catch (e) { toast(e.message, true); }
}

function pedir(titulo, valor, ayuda, onOk, tipo) {
  $('dlg-h').textContent = titulo;
  $('dlg-b').innerHTML = (ayuda ? '<p class="sub">' + ayuda + '</p>' : '') + '<input id="dlg-v" ' + (tipo === 'num' ? 'inputmode="decimal" style="text-align:right;font-size:18px"' : 'style="font-size:16px"') + ' value="' + esc(valor) + '">';
  $('dlg-f').innerHTML = '<button onclick="cerrarDlg()">Cancelar</button><button class="primary" id="dlg-ok">Guardar</button>';
  const ok = () => {
    const raw = $('dlg-v').value;
    let v = raw;
    if (tipo === 'num') { v = leerNum(raw); if (Number.isNaN(v)) { $('dlg-v').classList.add('bad'); return; } }
    cerrarDlg(); onOk(v);
  };
  $('dlg-ok').onclick = ok;
  $('dlg-v').onkeydown = e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') cerrarDlg(); };
  $('dlg').showModal(); setTimeout(() => { $('dlg-v').focus(); $('dlg-v').select(); }, 30);
}
function cerrarDlg() { const d = $('dlg'); if (d.open) d.close(); }

const NOMBRE_K = { cant: 'Cantidad de cortes', exp: 'Kg para exportación', cons: 'Kg para consumo', dest: 'Destino' };
function editar(n, k) {
  const r = planilla(S.fecha).filas.find(z => z.n === n); if (!r) return;
  const sv = r.sis[k], esNum = k !== 'dest';
  const ayuda = (esNum ? 'Dejalo vacío para que no figure. ' : '') + (r.manual ? '' : 'Según el sistema: <b>' + (sv == null || sv === '' ? 'vacío' : (k === 'cant' ? fmt0(sv) : k === 'dest' ? esc(sv) : fmt2(sv))) + '</b>.') +
    (r.ov[k] !== undefined ? ' <a href="#" onclick="cerrarDlg();volverSis(\'' + jsq(n) + '\',\'' + k + '\');return false">Volver a lo del sistema</a>' : '');
  const cur = r[k] == null ? '' : (esNum ? fmtE(r[k]) : r[k]);
  pedir(n + ' · ' + NOMBRE_K[k], cur, ayuda, v => cambiarDia(x => {
    x.prod = x.prod || {}; const o = x.prod[n] = x.prod[n] || {};
    o[k] = (esNum && v == null) ? null : (esNum ? v : String(v).trim().toUpperCase());
  }, n + ' ' + NOMBRE_K[k] + ' = ' + (v == null ? 'vacío' : v)), esNum ? 'num' : 'txt');
}
function volverSis(n, k) { cambiarDia(x => { const o = (x.prod || {})[n]; if (o) { delete o[k]; if (!Object.keys(o).length) delete x.prod[n]; } }, n + ' ' + NOMBRE_K[k] + ' vuelve a lo del sistema'); }
function quitar(n) { cambiarDia(x => { x.prod = x.prod || {}; x.prod[n] = { quitar: true }; }, 'saca el renglón ' + n); }
function volver(n) { cambiarDia(x => { if (x.prod) delete x.prod[n]; }, 'vuelve a poner el renglón ' + n); }
function agregar() {
  const v = $('nueva-l').value; if (!v) return;
  const alta = n => cambiarDia(x => { x.prod = x.prod || {}; x.prod[n] = Object.assign({}, x.prod[n] || {}, { quitar: undefined, cant: null, exp: null, cons: 0, dest: 'CONSUMO' }); delete x.prod[n].quitar; S.abierto = {}; }, 'agrega el renglón ' + n);
  if (v === '*') pedir('Nombre del corte nuevo', '', 'Escribilo como tiene que salir en la planilla.', n => { n = String(n || '').trim(); if (n) alta(n); }, 'txt');
  else alta(v);
}
function guardarObs(v) { cambiarDia(x => { if (v == null) delete x.obs; else x.obs = v; }, v == null ? 'observación automática' : 'observación'); }

/* ingreso: la primera corrección copia la lista del sistema y desde ahí queda a mano */
function ingBase(x) { if (!x.ing) x.ing = JSON.parse(JSON.stringify(calcular(S.fecha).ingreso)); return x.ing; }
const NOMBRE_I = { faena: 'Fecha de faena', tropa: 'Nº de tropa', cab: 'Total de tropa', medias: 'Medias reses', kg: 'Kg de ingreso', obs: 'Observaciones' };
function editarIng(i, k) {
  const t = planilla(S.fecha).ingreso[i]; if (!t) return;
  const num_ = ['cab', 'medias', 'kg'].includes(k);
  const cur = k === 'faena' ? ddmmaaaa(t.faena) : (num_ ? fmtE(t[k]) : (t[k] || ''));
  const ayuda = k === 'faena' ? 'Escribila como dd/mm/aaaa.' : (k === 'medias' ? 'Si cambiás las medias, los kilos se recalculan con el mismo promedio por media.' : '');
  pedir('Tropa ' + t.tropa + ' · ' + NOMBRE_I[k], cur, ayuda, v => {
    if (k === 'faena') { const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (!m) { toast('La fecha tiene que ser dd/mm/aaaa', true); return; } v = m[3] + '-' + pad(m[2]) + '-' + pad(m[1]); }
    cambiarDia(x => {
      const L = ingBase(x), r = L[i]; if (!r) return;
      if (k === 'medias' && r.medias && v != null) { const prom = r.kg / r.medias; r.kg = Math.round(prom * v); }
      r[k] = num_ ? (v == null ? 0 : v) : String(v).trim();
    }, 'ingreso tropa ' + t.tropa + ' ' + NOMBRE_I[k] + ' = ' + v);
  }, num_ ? 'num' : 'txt');
}
function ingQuitar(i) { const t = planilla(S.fecha).ingreso[i]; cambiarDia(x => { ingBase(x).splice(i, 1); }, 'saca la tropa ' + (t && t.tropa)); }
function ingAgregar() {
  pedir('Agregar una tropa · Nº de tropa', '', 'Después completás el resto tocando cada casilla.', v => {
    v = String(v || '').trim(); if (!v) return;
    cambiarDia(x => { ingBase(x).push({ faena: S.fecha, tropa: v, cab: 0, medias: 0, kg: 0, obs: 'Consumo' }); }, 'agrega la tropa ' + v);
  }, 'txt');
}
function ingSistema() { cambiarDia(x => { delete x.ing; }, 'ingreso vuelve a lo del sistema'); }

/* ---------- equivalencias ---------- */
async function cambiarEq(fn, desc) {
  try {
    const d = await cambiarDoc('ddjj-equiv', d => { if (!d.lineas) Object.assign(d, JSON.parse(JSON.stringify(EQ_DEF))); fn(d); }, 'DDJJ equivalencias: ' + desc);
    S.eq = d; render();
  } catch (e) { toast(e.message, true); }
}
function sacarArt(d, art) {
  d.lineas.forEach(l => { l.arts = (l.arts || []).filter(a => a !== art); });
  d.ignorar = (d.ignorar || []).filter(a => a !== art);
  d.rendering = (d.rendering || []).filter(a => a !== art);
}
function asignar(art, v) {
  if (!v) return;
  if (v.startsWith('N:')) return asignarAgregado(art, v.slice(2));
  cambiarEq(d => {
    sacarArt(d, art);
    if (v === 'I') d.ignorar.push(art);
    else if (v === 'R') d.rendering.push(art);
    else { const l = d.lineas.find(z => z.n === v.slice(2)); if (l) l.arts.push(art); }
  }, 'artículo ' + art + ' → ' + (v === 'I' ? 'no va' : v === 'R' ? 'rendering' : v.slice(2)));
}

const CANT_TXT = { '': '—', medias: 'Una por media res', resto: 'Medias menos otros cortes', piezas: 'Piezas del sistema', unid: 'Unidades del sistema', est: 'Estimada por kg' };
function renderEquiv() {
  const E = eq();
  /* nombres de artículos vistos en el mes, para mostrar al lado del código */
  const nom = {};
  for (const d of Object.values(S.sis.dias)) { d.re.forEach(r => { nom[r.art] = r.den; }); d.in.forEach(r => { nom[r.art] = nom[r.art] || r.den; }); }
  const artTxt = a => '<span class="dj-art" title="' + esc(nom[a] || '') + '">' + a + (nom[a] ? ' <small>' + esc(nom[a].toLowerCase()) + '</small>' : '') + '</span>';
  let h = '<section><h2>Equivalencias</h2><p class="sub">Qué artículos del sistema se suman en cada renglón de la planilla. Lo que cambies acá vale para todos los días que no tengan esa casilla corregida a mano.</p>';
  h += '<div class="tw"><table class="planilla dj-eq"><thead><tr><th>Renglón</th><th>Artículos del sistema</th><th>Cantidad de cortes</th><th>Destino si sale con contrato de exportación</th><th></th></tr></thead><tbody>';
  E.lineas.forEach((l, i) => {
    h += '<tr><td><b>' + esc(l.n) + '</b></td><td>' + ((l.arts || []).map(artTxt).join(' ') || '<span class="muted">ninguno</span>') + ' <button class="small" onclick="eqArts(' + i + ')">Cambiar</button></td>' +
      '<td><select onchange="eqCant(' + i + ',this.value)">' + Object.keys(CANT_TXT).map(k => '<option value="' + k + '"' + ((l.cant || '') === k ? ' selected' : '') + '>' + CANT_TXT[k] + '</option>').join('') + '</select>' +
      (l.cant === 'est' ? ' <input class="w-cp" value="' + fmtE(l.kgu) + '" onchange="eqKgu(' + i + ',this.value)" title="kg por unidad"> kg c/u' : '') + '</td>' +
      '<td><input style="width:170px" value="' + esc(l.dest || '') + '" onchange="eqDest(' + i + ',this.value)" placeholder="—"></td>' +
      '<td><button class="small danger" onclick="eqQuitar(' + i + ')">✕</button></td></tr>';
  });
  h += '<tr><td colspan="5"><button class="small" onclick="eqNueva()">+ Renglón nuevo</button></td></tr></tbody></table></div>';
  h += '<h3 class="dj-h3">No van en la declaración</h3><p>' + (E.ignorar || []).map(artTxt).join(' ') + ' <button class="small" onclick="eqLista(\'ignorar\')">Cambiar</button></p>';
  h += '<h3 class="dj-h3">Cuero a rendering (va en la observación)</h3><p>' + (E.rendering || []).map(artTxt).join(' ') + ' <button class="small" onclick="eqLista(\'rendering\')">Cambiar</button></p>';
  h += '<h3 class="dj-h3">Contratos de exportación</h3><p>' + (E.contExp || []).map(c => '<span class="dj-art">' + c + (S.sis.co[c] && S.sis.co[c].den ? ' <small>' + esc(S.sis.co[c].den) + '</small>' : '') + '</span>').join(' ') + ' <button class="small" onclick="eqContExp()">Cambiar</button></p>';
  h += '<h3 class="dj-h3">Cuentas</h3><p><label><input type="checkbox"' + (E.restar !== false ? ' checked' : '') + ' onchange="cambiarEq(d=>{d.restar=this.checked},\'restar reproceso \'+this.checked)"> A cada corte restarle lo que de ese mismo corte reingresó al desposte (reproceso)</label></p>';
  h += '<p>Merma del ingreso: <input class="w-cp" value="' + fmtE(r2((1 - (E.merma || 1)) * 100)) + '" onchange="eqMerma(this.value)"> %</p></section>';
  h += equivC3();
  h += equivRend();
  const aj = E.ajuste || { arriba: 0, izq: 0 };
  h += '<section><h2>Impresión</h2><p class="sub">Si al imprimir sobre el formulario la planilla queda corrida, corregilo acá en milímetros (positivo = más abajo / más a la derecha) y volvé a imprimir.</p>' +
    '<div class="row">Más abajo <input class="w-cp" value="' + fmtE(aj.arriba) + '" onchange="eqAjuste(\'arriba\',this.value)"> mm · Más a la derecha <input class="w-cp" value="' + fmtE(aj.izq) + '" onchange="eqAjuste(\'izq\',this.value)"> mm</div></section>';
  $('main').innerHTML = h;
}
function listaNum(s) { return String(s || '').split(/[^0-9]+/).filter(Boolean).map(Number); }
function eqArts(i) {
  const l = eq().lineas[i];
  pedir(l.n + ' · artículos del sistema', (l.arts || []).join(', '), 'Códigos de artículo separados por coma. Si un código estaba en otro renglón, pasa a este.', v => cambiarEq(d => {
    const arts = listaNum(v); arts.forEach(a => sacarArt(d, a)); d.lineas[i].arts = arts;
  }, l.n + ' = ' + v), 'txt');
}
function eqLista(k) {
  pedir(k === 'ignorar' ? 'No van en la declaración' : 'Cuero a rendering', (eq()[k] || []).join(', '), 'Códigos de artículo separados por coma.', v => cambiarEq(d => {
    const arts = listaNum(v); arts.forEach(a => sacarArt(d, a)); d[k] = arts;
  }, k + ' = ' + v), 'txt');
}
function eqCant(i, v) { cambiarEq(d => { d.lineas[i].cant = v || undefined; if (v === 'est' && !d.lineas[i].kgu) d.lineas[i].kgu = 5; if (!v) delete d.lineas[i].cant; }, d0n(i) + ' cantidad = ' + (v || 'nada')); }
function eqKgu(i, v) { const n = leerNum(v); if (!n) return; cambiarEq(d => { d.lineas[i].kgu = n; }, d0n(i) + ' kg por unidad = ' + n); }
function eqContExp() { pedir('Contratos de exportación', (eq().contExp || []).join(', '), 'Números de contrato separados por coma. Lo que sale del desposte con estos contratos va en la columna Exportación.', v => cambiarEq(d => { d.contExp = listaNum(v); }, 'contratos de exportación = ' + v), 'txt'); }
function eqDest(i, v) { cambiarEq(d => { d.lineas[i].dest = String(v).trim().toUpperCase(); }, d0n(i) + ' destino = ' + v); }
function eqQuitar(i) { if (!confirm('¿Sacar el renglón ' + d0n(i) + ' de las equivalencias?')) return; cambiarEq(d => { d.lineas.splice(i, 1); }, 'saca ' + d0n(i)); }
function eqNueva() { pedir('Renglón nuevo', '', 'Nombre como tiene que salir en la planilla.', v => { v = String(v || '').trim(); if (v) cambiarEq(d => { d.lineas.push({ n: v, arts: [] }); d.lineas.sort((a, b) => a.n.localeCompare(b.n, 'es')); }, 'renglón nuevo ' + v); }, 'txt'); }
function eqMerma(v) { const n = leerNum(v); if (n == null || isNaN(n)) return; cambiarEq(d => { d.merma = r2(1 - n / 100); }, 'merma ' + n + ' %'); }
function eqAjuste(k, v) { const n = leerNum(v) || 0; cambiarEq(d => { d.ajuste = d.ajuste || { arriba: 0, izq: 0 }; d.ajuste[k] = n; }, 'ajuste impresión ' + k + ' = ' + n); }
const d0n = i => eq().lineas[i] ? eq().lineas[i].n : '';

/* ---------- impresión ---------- */
/* Excel de la DDJJ de desposte: lo mismo que la hoja impresa (ingreso + producción, con lo corregido a mano).
   Del día: una hoja; del mes: una hoja por cada día con desposte. */
/* Descarga el Excel; en el modo automático de la PC (window.__auto, dj_excel_diario.ps1) lo deja para que lo guarde el programa */
function guardarXlsx(wb, nombre) {
  if (window.__auto) { (window.__autoOut = window.__autoOut || []).push({ nombre, b64: XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) }); return; }
  XLSX.writeFile(wb, nombre);
}
/* Modo automático (lo usa dj_excel_diario.ps1 todos los días con Edge sin ventana y los datos en window.__mock):
   __auto = { hasta: 'AAAA-MM-DD', tener: [días que ya tienen archivo] } → Excel de cada día con desposte hasta "hasta" que falte,
   el último siempre de nuevo (con lo corregido), y el Rendimiento del mes. Deja el resultado en <pre id="auto-out"> (JSON). */
function correrAuto(espera) {
  const A = window.__auto; if (!A || A.hecho) return;
  if (!window.XLSX && (espera || 0) < 60) { setTimeout(() => correrAuto((espera || 0) + 1), 500); return; }   // la librería de Excel se carga aparte
  A.hecho = true;
  const fin = (o, err) => { const pre = document.createElement('pre'); pre.id = 'auto-out'; pre.textContent = JSON.stringify(err ? { error: err } : o); document.body.appendChild(pre); document.title = err ? 'AUTO-ERROR' : 'AUTO-OK'; };
  try {
    if (!window.XLSX) return fin(null, 'No se pudo cargar la librería de Excel (internet)');
    const dias = Object.keys(S.sis.dias).sort().filter(f => f <= A.hasta && calcular(f).hay), tener = A.tener || [];
    const hacer = dias.filter((f, i) => i === dias.length - 1 || !tener.includes(f));
    for (const f of hacer) { S.fecha = f; excelDJ(false); }
    if (dias.length && typeof excelRend === 'function') excelRend();
    fin({ dias: hacer, archivos: window.__autoOut || [] });
  } catch (e) { fin(null, String(e && e.message || e)); }
}
function filasDJ(f) {
  const P = planilla(f), n = v => (v == null || v === '' || isNaN(v)) ? '' : Number(v);
  const filas = [['DDJJ de producción de desposte · ' + ddmmaaaa(f)], [], ['INGRESO'],
    ['Fecha de faena', 'Nº de tropa', 'Total de tropa', 'Medias reses', 'Kg de ingreso', 'Observaciones']];
  P.ingreso.forEach(t => filas.push([ddmmaaaa(t.faena), String(t.tropa), n(t.cab), n(t.medias), n(t.kg), t.obs || '']));
  filas.push(['Total', '', '', n(P.tot.medias), n(P.tot.kgDecl), 'Kg con ' + Math.round((1 - (eq().merma || 1)) * 100) + ' % de merma (sin merma: ' + fmt0(P.tot.kg) + ')']);
  filas.push([], ['PRODUCCIÓN'], ['Nombre del corte', 'Cantidad de cortes', 'Kg producidos exportación', 'Kg producidos consumo', 'Observaciones / destino']);
  P.filas.forEach(r => filas.push([r.n, r.cant ? n(r.cant) : '', r.exp ? n(r.exp) : '', r.cons || r.exp ? n(r.cons || 0) : '', r.dest || '']));
  filas.push(['Totales', n(P.tot.cant), n(P.tot.exp), n(P.tot.cons), '']);
  if (P.obs) filas.push([], ['Observaciones'], [P.obs]);
  return filas;
}
function excelDJ(mes) {
  if (!window.XLSX) { toast('No se pudo cargar el Excel. Revisá internet.', true); return; }
  const dias = mes ? Object.keys((S.sis && S.sis.dias) || {}).sort().filter(f => calcular(f).hay) : [S.fecha];
  if (!dias.length || !dias[0]) { toast('No hay días con desposte.', true); return; }
  const wb = XLSX.utils.book_new();
  for (const f of dias) {
    const ws = XLSX.utils.aoa_to_sheet(filasDJ(f));
    ws['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 24 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws, ddmm(f).replace('/', '-'));
  }
  guardarXlsx(wb, mes ? 'DDJJ desposte ' + nombreMes(S.mes) + '.xlsx' : 'DDJJ desposte ' + ddmmaaaa(S.fecha).replace(/\//g, '-') + '.xlsx');
}

/* Las medidas (en puntos, hoja A4 de 595 × 842) son las de la planilla de Excel impresa: el formulario
   ya trae el encabezado arriba, por eso la tabla arranca a media hoja. */
function hojas(f) {
  const P = planilla(f), aj = eq().ajuste || {}, mv = 'transform:translate(' + (Number(aj.izq) || 0) + 'mm,' + (Number(aj.arriba) || 0) + 'mm)';
  /* hoja 1: ingreso */
  const X1 = [57, 125.8, 189.2, 259.3, 339.6, 431.4, 525.1], Y1 = 292.8, H1 = 40.3, R1 = 14.7, N1 = 30;
  const filas1 = P.ingreso.slice(0, N1);
  let a = '<div class="hoja" style="' + mv + '"><table class="imp imp1" style="left:' + X1[0] + 'pt;top:' + Y1 + 'pt;width:' + (X1[6] - X1[0]).toFixed(1) + 'pt"><colgroup>' + X1.slice(1).map((x, i) => '<col style="width:' + (x - X1[i]).toFixed(1) + 'pt">').join('') + '</colgroup>';
  a += '<tr style="height:' + H1 + 'pt" class="th"><td>Fecha de Faena</td><td>Nº de Tropa</td><td>Total de tropa</td><td>Cantidad de1/2 Reses Solicitadas</td><td>Kilogramos de ingreso</td><td>Observaciones</td></tr>';
  for (let i = 0; i < N1; i++) {
    const t = filas1[i];
    a += '<tr style="height:' + R1 + 'pt">' + (t ? '<td>' + ddmmaaaa(t.faena) + '</td><td>' + esc(t.tropa) + '</td><td>' + fmtPI(t.cab) + '</td><td>' + fmtPI(t.medias) + '</td><td>' + fmtPI(t.kg) + '</td><td>' + esc(t.obs || '') + '</td>' : '<td></td><td></td><td></td><td></td><td></td><td></td>') + '</tr>';
  }
  a += '</table>';
  a += '<table class="imp imp1t" style="left:259.3pt;top:' + (Y1 + H1 + R1 * N1 + 6) + 'pt;width:172.1pt"><tr><td style="width:33.2pt">TOTAL</td><td style="width:47.1pt">' + fmtPI(P.tot.medias) + '</td><td style="width:35pt">TOTAL</td><td style="width:56.8pt">' + fmtPI(P.tot.kgDecl) + '</td></tr></table></div>';
  /* hoja 2: producción (la tabla ocupa siempre el mismo recuadro: con más renglones, renglones más bajos) */
  const X2 = [59.1, 182.0, 237.3, 331.1, 425.6, 526.1], Y2 = 317.9, H2 = 48.3, AREA = 360.6;
  const n2 = Math.max(P.filas.length, 1), R2 = Math.min(22.5, AREA / n2), fs = R2 < 17 ? 6.6 : 8.1;
  let b = '<div class="hoja" style="' + mv + '"><table class="imp imp2" style="left:' + X2[0] + 'pt;top:' + Y2 + 'pt;width:' + (X2[5] - X2[0]).toFixed(1) + 'pt;font-size:' + fs + 'pt"><colgroup>' + X2.slice(1).map((x, i) => '<col style="width:' + (x - X2[i]).toFixed(1) + 'pt">').join('') + '</colgroup>';
  b += '<tr style="height:' + H2 + 'pt" class="th"><td>Nombre del corte</td><td>Cantidad de Cortes</td><td>Total de Kilogramos Producidos para Exportación</td><td>Total de Kilogramos Producidos Consumo</td><td>Observaciones/Destino</td></tr>';
  for (const r of P.filas) {
    b += '<tr style="height:' + R2.toFixed(2) + 'pt"><td class="n">' + esc(r.n) + '</td><td>' + (r.cant ? fmtPI(r.cant) : '') + '</td><td>' + (r.exp ? fmtP(r.exp) : '') + '</td><td>' + (r.cons || r.exp ? fmtP(r.cons || 0) : '') + '</td><td class="d">' + esc(r.dest || '') + '</td></tr>';
  }
  b += '<tr class="tot" style="height:16.2pt"><td class="n">Totales</td><td>' + fmtPI(P.tot.cant) + '</td><td>' + fmtP(P.tot.exp) + '</td><td>' + fmtP(P.tot.cons) + '</td><td></td></tr>';
  b += '<tr class="obs"><td colspan="5">' + esc(P.obs) + '</td></tr></table></div>';
  return a + b;
}
async function imprimir() {
  const f = S.fecha; if (!f) return;
  $('impresion').innerHTML = hojas(f);
  window.print();
  cambiarDia(x => { x.impreso = new Date().toISOString(); }, 'impresa');
}
function verImpresion() {
  const w = window.open('', '_blank');
  if (!w) { toast('El navegador bloqueó la ventana. Usá Imprimir directamente.', true); return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>DDJJ ' + ddmm(S.fecha) + '</title><link rel="stylesheet" href="' + location.origin + '/ddjj.css"></head><body class="vista">' +
    '<div class="vista-bar">Así sale impresa la DDJJ del ' + esc(fechaLarga(S.fecha)) + ' (el encabezado lo trae el formulario).</div>' + hojas(S.fecha) + '</body></html>');
  w.document.close();
}

/* ---------- arranque ---------- */
document.getElementById('nav').addEventListener('click', e => {
  const a = e.target.closest('a[data-t]'); if (!a) return; e.preventDefault();
  if (window.SOLO_FAENA && a.dataset.t !== 'faena') return;
  S.tab = a.dataset.t; render(); window.scrollTo(0, 0);
});
C3API.listo.then(() => {
  /* vista solo de Faena y mortalidad (link /faena o usuarios con rol "faena") */
  if (window.SOLO_FAENA || C3API.rol === 'faena') {
    window.SOLO_FAENA = true; S.tab = 'faena';
    document.querySelectorAll('#nav > *').forEach(x => { if (!(x.dataset && x.dataset.t === 'faena')) x.style.display = 'none'; });
    const st = document.querySelector('header .brand .s'); if (st) st.textContent = 'Faena y mortalidad';
    const mes = document.querySelector('header .mes'); if (mes) mes.title = 'El año se toma del mes elegido';
  }
  if (window.__auto && /^\d{4}-\d{2}-\d{2}$/.test(window.__auto.hasta || '')) S.mes = window.__auto.hasta.slice(0, 7);
  const q = new URLSearchParams(location.search).get('f');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) { S.mes = q.slice(0, 7); S.fecha = q; S.tab = 'dia'; }
  const q3 = new URLSearchParams(location.search).get('c3');
  if (q3 && /^\d{4}-\d{2}-\d{2}$/.test(q3)) { S.mes = q3.slice(0, 7); S.fecha3 = q3; S.tab = 'c3'; }
  cargar(false);
});
