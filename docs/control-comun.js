/* Centro de control Ciclo III y Qualitá Express · funciones comunes (pantalla de Carlos y del encargado) */
'use strict';

/* ---------- formato ---------- */
/* Se muestra todo en números redondos (sin decimales). Solo lo menor a 1 lleva un decimal, para que no parezca 0. */
const fmtN = (v, d = 0) => { if (v == null || isNaN(v)) return ''; v = Number(v); const n = Math.abs(v) < 0.95 && Math.abs(v) >= 0.05 ? 1 : 0; return v.toLocaleString('es-AR', { minimumFractionDigits: n, maximumFractionDigits: n }); };
/* Valor exacto (hasta d decimales) para las casillas que se escriben, así al guardar no se redondea nada */
const fmtE = (v, d = 2) => (v == null || isNaN(v)) ? '' : Number(v).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: Math.max(d, 2) });
const kg = v => (!v || Math.abs(v) < 0.05) ? '' : fmtN(v);
const kg1 = v => (v == null || isNaN(v)) ? '' : fmtN(v);
const pesos = v => (v == null || isNaN(v) || Math.abs(v) < 0.5) ? '' : '$ ' + fmtN(v, 0);
const pct = v => (v == null || !isFinite(v)) ? '' : fmtN(v * 100) + ' %';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);
const r2 = v => Math.round((v || 0) * 100) / 100;
/* número escrito a mano: acepta "1.234,5", "1234.5", "1234,5" y "-" */
function leerNum(s) {
  if (s == null) return null;
  let t = String(s).trim().replace(/\s|\$/g, '');
  if (t === '' || t === '-') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  const n = Number(t);
  return isFinite(n) ? n : NaN;
}

/* ---------- fechas ---------- */
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS3 = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const pad = n => String(n).padStart(2, '0');
const isoDe = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const hoyIso = () => isoDe(new Date());
const fechaDe = iso => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); };
const diaSem = iso => fechaDe(iso).getDay();
const ddmm = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';
const diaCorto = iso => DIAS3[diaSem(iso)] + ' ' + iso.slice(8, 10);
const nombreMes = m => MESES[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4);
function diasDelMes(m) {
  const [a, mm] = m.split('-').map(Number), n = new Date(a, mm, 0).getDate(), out = [];
  for (let i = 1; i <= n; i++) out.push(m + '-' + pad(i));
  return out;
}
const mesAnterior = m => { const [a, mm] = m.split('-').map(Number); const d = new Date(a, mm - 2, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const mesSiguiente = m => { const [a, mm] = m.split('-').map(Number); const d = new Date(a, mm, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };

/* ---------- quién está usando la pantalla: el nombre de la cuenta con la que ingresó ---------- */
function quien() { return (window.C3API && C3API.usuario && C3API.usuario.nombre) || 'sin nombre'; }

/* ---------- avisos ---------- */
let _toastT;
function toast(msg, err) {
  const t = $('toast'); if (!t) { if (err) alert(msg); return; }
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.style.display = 'block';
  clearTimeout(_toastT); _toastT = setTimeout(() => t.style.display = 'none', err ? 6000 : 2600);
}

/* ---------- datos (Firebase, ver control-base.js) ---------- */
/* Lo que subió la notebook desde el sistema: "mes-AAAA-MM" o "ins". Devuelve el texto (renglones TIPO|...) */
async function sisTexto(id) {
  const x = await C3API.sis(id);
  return x ? (x.txt || '') : '';
}
/* Documento guardado: se lee entero con su versión */
async function leerDoc(n) { return C3API.leerDoc(n); }
/* Cambia un documento: lee lo último, aplica el cambio y guarda (en una transacción) */
async function cambiarDoc(n, cambio, descripcion) {
  try { return await C3API.cambiarDoc(n, cambio, descripcion); }
  catch (e) { throw new Error(/permission|insufficient/i.test(e && (e.code || e.message) || '') ? 'Tu cuenta no tiene permiso para guardar. Avisale a Igna.' : 'No se pudo guardar. Revisá internet y probá de nuevo.'); }
}

/* ---------- lectura de lo que devuelve el sistema ---------- */
const num = s => { const n = parseFloat(s); return isFinite(n) ? n : 0; };
function parseSistema(txt) {
  const o = { hora: '', ri: [], pr: [], mp: [], vl: [], vc: [], st: [], il: [], ci: [] };
  for (const l of txt.split(/\r?\n/)) {
    const p = l.split('|'), t = p[0];
    if (t === 'OK') o.hora = p[1];
    else if (t === 'RI') o.ri.push({ ori: +p[1], des: +p[2], f: p[3], nro: p[4], art: p[5], den: p[6], kg: num(p[7]), uni: num(p[8]) });
    else if (t === 'PR') o.pr.push({ f: p[1], art: p[2], den: p[3], kg: num(p[4]), uni: num(p[5]) });
    else if (t === 'MP') o.mp.push({ f: p[1], art: p[2], den: p[3], kg: num(p[4]) });
    else if (t === 'VL') o.vl.push({ f: p[1], art: p[2], den: p[3], kg: num(p[4]), cant: num(p[5]), neto: num(p[6]), total: num(p[7]) });
    else if (t === 'VC') o.vc.push({ f: p[1], art: p[2], den: p[3], kg: num(p[4]), neto: num(p[5]) });
    else if (t === 'ST') o.st.push({ fri: +p[1], art: p[2], den: p[3], kg: num(p[4]) });
    else if (t === 'IL') o.il.push({ id: p[1], den: p[2], um: p[3], precio: num(p[4]) });
    else if (t === 'CI') o.ci.push({ f: p[1], id: p[2], cant: num(p[3]), nro: p[4] });
  }
  return o;
}

/* ---------- productos ---------- */
/* Grupos de Ciclo III (columnas de la planilla de producción). Lo que no está en la lista se ubica por el nombre. */
const GRUPOS = [
  { id: 'chorizo', n: 'Chorizo', arts: ['2000', '2005', '2007'] },
  { id: 'chbombon', n: 'Chorizo bombón', arts: ['2003', '2006', '2101'] },
  { id: 'morcilla', n: 'Morcilla', arts: ['2001', '2009', '2011'] },
  { id: 'mbombon', n: 'Morcilla bombón', arts: ['2004'] },
  { id: 'salchicha', n: 'Salchicha', arts: ['2002', '2110', '2112'] },
  { id: 'otros', n: 'Otros', arts: [] }
];
function grupoDe(art, den) {
  for (const g of GRUPOS) if (g.arts.includes(String(art))) return g.id;
  const d = String(den || '').toUpperCase();
  const bb = d.includes('BOMBON') || d.includes('BOMBÓN');
  if (d.includes('CHORI')) return bb ? 'chbombon' : 'chorizo';
  if (d.includes('MORCI')) return bb ? 'mbombon' : 'morcilla';
  if (d.includes('SALCH')) return 'salchicha';
  return 'otros';
}
const nombreGrupo = id => (GRUPOS.find(g => g.id === id) || { n: id }).n;
/* En el local los artículos de venta son "5" + el código del frigorífico (5101 = 101 Bondiola, 50225 = 225, 52000 = 2000) */
function artBase(art) {
  const s = String(art);
  if (s.length >= 4 && s[0] === '5') return String(Number(s.slice(1)));
  return s;
}
/* Nombre prolijo: "BONDIOLA  FRESCA" → "Bondiola fresca" */
function lindo(den) {
  const s = String(den || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s !== s.toUpperCase()) return s;
  return s.charAt(0) + s.slice(1).toLowerCase();
}

/* Mismo corte con otro código en el local (el remito usa un código y la venta otro) */
// (el local factura Nalga 5320, Cuadril 5323, Peceto 5325, Bola de lomo 5328 y Cuadrada 5330; el frigorífico los manda como 319, 322, 324, 327 y 329)
const EQUIV = { '344': '341', '362': '361', '319': '320', '322': '323', '324': '325', '327': '328', '329': '330' };
const baseLocal = a => { const b = artBase(a); return EQUIV[b] || b; };
/* Bebidas, carbón, vinos, etc. del local (no son carne) */
const esOtro = art => { const b = Number(artBase(art)); return b >= 700 && b < 2000; };
/* Productos para la venta "2": los del local en el mes + los de siempre */
const L2_BASE = [['2000', 'Chorizo'], ['2001', 'Morcilla'], ['341', 'Jamón 5 músculos'], ['285', 'Solomillo'], ['241', 'Churrasquito'], ['231', 'Matambrito'], ['281', 'Carré c/solomillo'], ['271', 'Carré s/solomillo'], ['211', 'Pechito con manta'], ['101', 'Bondiola'], ['315', 'Jamón c/hueso c/cuero'], ['141', 'Paleta al rojo'], ['131', 'Paleta c/cuero c/hueso'], ['328', 'Bola de lomo'], ['361', 'Recorte'], ['422', 'Punta de falda'], ['421', 'Hueso'], ['461', 'Tocino'], ['330', 'Cuadrada'], ['208', 'Costilla / pecho en tiras'], ['289', 'Cinta de lomo'], ['333', 'Vacío'], ['323', 'Cuadril'], ['325', 'Peceto'], ['320', 'Nalga'], ['243', 'Bife de churrasco'], ['225', 'Costeleta'], ['308', 'Entrecot']];
function productosLocal(S) {
  const m = {};
  for (const [a, d] of L2_BASE) m[a] = d;
  if (S) {
    for (const v of S.vl) if (!esOtro(v.art)) { const b = baseLocal(v.art); if (!m[b]) m[b] = lindo(v.den); }
    for (const r of S.ri) if (r.des === 5) { const b = EQUIV[r.art] || r.art; if (!m[b]) m[b] = lindo(r.den); }
  }
  const vistos = new Set();
  return Object.entries(m).map(([art, den]) => ({ art, den })).sort((a, b) => a.den.localeCompare(b.den, 'es'))
    .filter(p => { const k = p.den.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

/* ---------- caja del local (planilla de caja de papel) ----------
   Ingresos: Zeta, "2", cobros de cuenta corriente "1" y "2", A cuenta  → Total (1)
   Egresos: Empleados, ventas a cuenta corriente "1" y "2"              → Total (2)
   Total "1" − "2" es lo que tiene que haber en la caja; el detalle de la caja (efectivo, ticket, débito,
   cheques, transferencias…) es lo que hay; la diferencia es lo que hay menos lo que tiene que haber.
   Después se hace la entrega. Saldo = Total "1" − "2" − Entrega; el día siguiente arranca con saldo + diferencia. */
const CAJA_ING = [['zeta', 'Zeta'], ['dos', '"2"'], ['p1', 'Cta Cte "1"'], ['p2', 'Cta Cte "2"'], ['acta', 'A cta']];
const CAJA_EGR = [['emp', 'Empleados'], ['ctad', 'Cta Cte "1"'], ['ctad2', 'Cta Cte "2"']];
const CAJA_DET = ['Efectivo cambio', 'Efectivo caja', 'Efectivo a rendir', 'Ticket', 'Ticket', 'Factura cambio', 'Factura', 'Débito', 'Cheque', 'Cheque', 'Transferencia'];
const nv = v => (v == null || v === '' || isNaN(v)) ? null : Number(v);
const sumaDet = det => (det || []).reduce((s, x) => s + (nv(x.imp) || 0), 0);
const hayDet = det => (det || []).some(x => nv(x.imp) != null);
function cajaCalc(docAnt, doc, mes) {
  const out = {};
  let arrastre = null;
  const ant = docAnt && docAnt.dias ? docAnt : null;
  if (ant) {
    const c = cajaCalc(null, ant, mesAnterior(mes)), fs = Object.keys(c).filter(f => c[f].cargado).sort();
    if (fs.length) arrastre = c[fs[fs.length - 1]].cierre;
  }
  for (const f of diasDelMes(mes)) {
    const dia = (doc.dias || {})[f] || {}, d = dia.caja || {};
    const cargado = ['zeta', 'dos', 'p1', 'p2', 'acta', 'emp', 'ctad', 'ctad2', 'ent', 'contado', 'dif', 'sa'].some(k => nv(d[k]) != null) || hayDet(dia.det);
    const sa = nv(d.sa) != null ? nv(d.sa) : (arrastre || 0);
    const t1 = sa + CAJA_ING.reduce((s, [k]) => s + (nv(d[k]) || 0), 0);
    const t2 = CAJA_EGR.reduce((s, [k]) => s + Math.abs(nv(d[k]) || 0), 0);
    const neto = t1 - t2, ent = Math.abs(nv(d.ent) || 0);
    const saldo = neto - ent;
    const contado = hayDet(dia.det) ? sumaDet(dia.det) : nv(d.contado);
    const dif = contado != null ? contado - neto : (nv(d.dif) || 0);
    const cierre = saldo + dif;
    out[f] = { cargado, sa, saOverride: nv(d.sa) != null, t1, t2, neto, ent, saldo, contado, conDetalle: hayDet(dia.det), dif, cierre, zeta: nv(d.zeta), scaja: nv(d.scaja) };
    if (cargado) arrastre = cierre;
  }
  return out;
}
