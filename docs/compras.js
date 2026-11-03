/* Centro de compras · Frigorífico Qualitá (link /compras)
   Vales de consumo (quién retira qué, de qué sector y motivo) y precios de compra (órdenes de compra), con filtros.
   Datos: los sube la notebook de Igna (C:\InformeQualita\compras\cm_sync.ps1) a /c3sis:
     cm-maestro  : I insumo | F familia | K tipo de costo | S sector | M motivo | A pañol | E estado | P persona
     cm-v-AAAA-MM: V vale|item|fecha|estado|persona|insumo|cant.solic|cant.entregada|precio|sector|motivo|pañol|a facturar|fec.entrega|devolución|obs. renglón|obs. vale
     cm-compras  : OC fecha|oc|proveedor|item|insumo|cantidad|precio|desc|bonif1|bonif2|bonif3|saldo|autorizada|detalle  ·  PV proveedor
   Solo lee: no se carga nada a mano. Entran editores y cuentas de /c3usuarios con rol "compras" o "todo". */
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DESDE_MES = '2026-01';
const HORA_GRABA = '18:30';   // la tarea "Compras: grabar cambios" de la notebook de Igna graba los cambios una vez por día a esta hora
/* Fuera del centro (pedido de Igna 03/11/2026): cajas y bolsas. Familias "Cajas y envases" (21) y "Bolsas" (17),
   más las bolsas cristal sin familia y los octobins de cartón (bin y tapa). */
const FAM_FUERA = new Set(['17', '21']);
const INS_FUERA = new Set(['9025', '9026', '9027', '10009', '10010']);
function fuera(ins) { const i = D.ins[ins]; return INS_FUERA.has(ins) || (i && FAM_FUERA.has(i.fam)); }
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* ---------- formato ---------- */
function n0(v) { v = +v || 0; if (Math.abs(v) < 1 && v !== 0) return v.toLocaleString('es-AR', { maximumFractionDigits: 1 }); return Math.round(v).toLocaleString('es-AR'); }
function cant(v) { v = +v || 0; return Number.isInteger(v) ? v.toLocaleString('es-AR') : v.toLocaleString('es-AR', { maximumFractionDigits: 2 }); }
function pesos(v) { return '$ ' + n0(v); }
function pesos2(v) { return '$ ' + (+v || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pct(v, dec) { if (v == null || !isFinite(v)) return '—'; return (v > 0 ? '+' : '') + v.toLocaleString('es-AR', { maximumFractionDigits: dec == null ? 0 : dec }) + '%'; }
function fec(s) { if (!s) return ''; const p = s.split('-'); return p[2] + '/' + p[1] + '/' + p[0].slice(2); }
function mesTxt(m) { return MESES[+m.slice(5) - 1] + ' ' + m.slice(2, 4); }
function lindo(s) { s = String(s || '').trim().toLowerCase(); return s.replace(/(^|[\s(/.-])([a-záéíóúñü])/g, (a, b, c) => b + c.toUpperCase()); }
function hoyISO() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 2600); }

/* ---------- datos ---------- */
const D = { ins: {}, fam: {}, cos: {}, sec: {}, mot: {}, pan: {}, est: {}, per: {}, prov: {}, vales: [], oc: [], ocPorIns: {}, act: '' };

function lineas(txt) { return String(txt || '').replace(/^\uFEFF/, '').split('\n').map(l => l.replace(/\r$/, '').split('|')); }
function num(s) { const v = parseFloat(s); return isFinite(v) ? v : 0; }

function parseMaestro(txt) {
  for (const p of lineas(txt)) {
    const t = p[0];
    if (t === 'I') D.ins[p[1]] = { cod: p[1], den: p[2], fam: p[3], cos: p[4], lista: num(p[5]), stock: num(p[6]), min: num(p[7]), sis: { fam: p[3], cos: p[4] }, pend: {} };
    else if (t === 'F') D.fam[p[1]] = lindo(p[2]);
    else if (t === 'K') D.cos[p[1]] = p[2];
    else if (t === 'S') D.sec[p[1]] = p[2];
    else if (t === 'M') D.mot[p[1]] = p[2];
    else if (t === 'A') D.pan[p[1]] = lindo(p[2]);
    else if (t === 'E') D.est[p[1]] = p[2];
    else if (t === 'P') D.per[p[1]] = lindo(p[2]);
    else if (t === 'OK') D.act = p[1];
  }
  // cambios cargados en la web que todavía no se grabaron en el sistema
  for (const c of CAMB) if (c.estado === 'pendiente' && c.tipo === 'ins' && D.ins[c.ins]) { D.ins[c.ins][c.campo] = String(c.despues); D.ins[c.ins].pend[c.campo] = c; }
}
function parseCompras(txt) {
  for (const p of lineas(txt)) {
    if (p[0] === 'PV') D.prov[p[1]] = lindo(p[2]);
    else if (p[0] === 'OC') {
      const bruto = num(p[7]);
      const neto = bruto * (1 - num(p[8]) / 100) * (1 - num(p[9]) / 100) * (1 - num(p[10]) / 100) * (1 - num(p[11]) / 100);
      if (fuera(p[5])) continue;
      const o = { fecha: p[1], oc: p[2], prov: p[3], item: p[4], ins: p[5], cant: num(p[6]), precio: neto, saldo: num(p[12]), aut: p[13] === '1', libre: p[14] || '' };
      D.oc.push(o);
      (D.ocPorIns[o.ins] = D.ocPorIns[o.ins] || []).push(o);
    }
  }
  D.oc.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (+a.oc - +b.oc));
  for (const k in D.ocPorIns) D.ocPorIns[k].sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (+a.oc - +b.oc));
  // variación contra la compra anterior del mismo artículo
  for (const k in D.ocPorIns) { let ant = null; for (const o of D.ocPorIns[k]) { o.ant = ant; o.var = ant && ant.precio > 0 && o.precio > 0 ? (o.precio / ant.precio - 1) * 100 : null; if (o.precio > 0) ant = o; } }
}
/* último precio de compra a una fecha (si no hubo antes, la primera compra posterior) */
function precioOC(ins, fecha) {
  const l = D.ocPorIns[ins]; if (!l || !l.length) return null;
  let r = null;
  for (const o of l) { if (o.precio <= 0) continue; if (o.fecha <= fecha) r = o; else { if (!r) r = o; break; } }
  return r;
}
function parseVales(txt) {
  for (const p of lineas(txt)) {
    if (p[0] !== 'V' || fuera(p[6])) continue;
    const ins = D.ins[p[6]] || { cod: p[6], den: 'Artículo ' + p[6], fam: '0', cos: '0', lista: 0 };
    const v = {
      vale: p[1], item: p[2], fecha: p[3], estado: p[4], per: p[5], ins: p[6], den: ins.den, fam: ins.fam, cos: ins.cos,
      solic: num(p[7]), cant: num(p[8]), precio: num(p[9]), sec: p[10], mot: p[11], pan: p[12], afact: p[13] === '1',
      fecent: p[14], dev: p[15] !== '0' && p[15] !== '', obs: [p[16], p[17]].filter(Boolean).join(' · ')
    };
    v.sis = { precio: v.precio, sec: v.sec, mot: v.mot }; v.pend = {};
    for (const c of PEND_V[v.vale + '|' + v.item] || []) { v[c.campo] = c.campo === 'precio' ? num(c.despues) : String(c.despues); v.pend[c.campo] = c; }
    const oc = precioOC(v.ins, v.fecha);
    v.oc = oc;
    if (v.precio > 0) { v.pu = v.precio; v.est = false; }
    else if (oc) { v.pu = oc.precio; v.est = true; }
    else { v.pu = ins.lista || 0; v.est = true; }
    v.imp = v.cant * v.pu;
    v.desv = v.precio > 0 && oc && oc.precio > 0 ? (v.precio / oc.precio - 1) * 100 : null;
    D.vales.push(v);
  }
}
/* ---------- cambios (se cargan en la web y la notebook los graba en el sistema) ---------- */
let CAMB = [], PEND_V = {}, RAW = null;
function indexarCambios() {
  PEND_V = {};
  CAMB.sort((a, b) => a.ts < b.ts ? -1 : 1);
  for (const c of CAMB) if (c.tipo === 'vale' && c.estado === 'pendiente') (PEND_V[c.vale + '|' + c.item] = PEND_V[c.vale + '|' + c.item] || []).push(c);
}
function reconstruir() {
  for (const k of ['ins', 'fam', 'cos', 'sec', 'mot', 'pan', 'est', 'per', 'prov', 'ocPorIns']) D[k] = {};
  D.vales = []; D.oc = [];
  indexarCambios();
  parseMaestro(RAW.ma.txt); if (RAW.co) parseCompras(RAW.co.txt);
  RAW.vs.forEach(x => { if (x) parseVales(x.txt); });
}
const CAMPO_TXT = { precio: 'Precio', sec: 'Sector', mot: 'Motivo', fam: 'Familia', cos: 'Tipo de costo' };
function txtValor(campo, v) { return campo === 'precio' ? (+v ? pesos2(v) : 'sin precio') : campo === 'sec' ? nomSec(v) : campo === 'mot' ? nomMot(v) : campo === 'fam' ? nomFam(v) : campo === 'cos' ? nomCos(v) : String(v); }
function claveC(c) { return c.tipo === 'vale' ? 'v|' + c.vale + '|' + c.item + '|' + c.campo : 'i|' + c.ins + '|' + c.campo; }
async function guardarCambios(nuevos, desc) {
  if (!nuevos.length) { toast('No cambiaste nada'); return; }
  const quien = (C3API.usuario && C3API.usuario.nombre) || 'sin nombre', ts = new Date().toISOString();
  try {
    const d = await C3API.cambiarDoc('cm-cambios', d => {
      d.lista = Array.isArray(d.lista) ? d.lista : (d.lista ? [d.lista] : []);
      for (const n of nuevos) {
        const ya = d.lista.find(c => c.estado === 'pendiente' && claveC(c) === claveC(n));
        if (ya) { if (String(n.despues) === String(ya.antes)) { ya.estado = 'anulado'; ya.msg = 'Se volvió al valor del sistema'; } else { ya.despues = n.despues; ya.ts = ts; ya.por = quien; } }
        else if (String(n.despues) !== String(n.antes)) d.lista.push(Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), por: quien, ts, estado: 'pendiente' }, n));
      }
    }, desc);
    CAMB = (d && d.lista) || []; reconstruir(); refrescar(); cerrarDlg();
    toast('Guardado. Se graba en el sistema hoy a las ' + HORA_GRABA + ' h.');
  } catch (e) { console.error(e); toast('No se pudo guardar: ' + (e.message || e), true); }
}
async function anularCambio(id) {
  try {
    const d = await C3API.cambiarDoc('cm-cambios', d => { for (const c of (d.lista || [])) if (c.id === id && c.estado === 'pendiente') { c.estado = 'anulado'; c.msg = 'Anulado antes de grabarse'; } }, 'Cambio anulado ' + id);
    CAMB = (d && d.lista) || []; reconstruir(); refrescar(); toast('Cambio anulado');
  } catch (e) { toast('No se pudo anular: ' + (e.message || e), true); }
}
window.anularCambio = anularCambio;
function chipPend(o, campo) { const c = o.pend && o.pend[campo]; return c ? ' <span class="chip warn" title="Lo cambió ' + esc(c.por) + '; en el sistema figura ' + esc(txtValor(campo, c.antes)) + '. Se graba en el sistema a las ' + HORA_GRABA + ' h.">por grabar</span>' : ''; }
function selOpc(obj, sel, orden) { const ks = Object.keys(obj).sort(orden || ((a, b) => String(obj[a]).localeCompare(String(obj[b]), 'es'))); return ks.map(k => '<option value="' + esc(k) + '"' + (String(k) === String(sel) ? ' selected' : '') + '>' + esc(obj[k]) + '</option>').join(''); }

/* editar un renglón de vale: precio, sector, motivo */
function dlgRenglon(v) {
  const sug = v.precio > 0 ? v.precio : v.oc ? Math.round(v.oc.precio * 100) / 100 : '';
  const h = '<p class="sub">Vale <b>' + v.vale + '</b> del ' + fec(v.fecha) + ' · ' + esc(nomPer(v.per)) + ' · ' + cant(v.cant) + ' × ' + esc(v.den) + '</p>' +
    '<div class="ed-grid">' +
    '<label>Precio unitario (sin IVA)</label><div><input id="e-precio" type="number" min="0" step="0.01" value="' + sug + '">' +
      '<small class="muted">En el sistema: ' + (v.sis.precio > 0 ? pesos2(v.sis.precio) : '<b>sin precio</b>') + (v.oc ? ' · última compra ' + pesos2(v.oc.precio) + ' (OC ' + v.oc.oc + ', ' + fec(v.oc.fecha) + ')' : '') + '</small></div>' +
    '<label>Sector</label><div><select id="e-sec">' + selOpc(D.sec, v.sec) + '</select><small class="muted">En el sistema: ' + esc(nomSec(v.sis.sec)) + '</small></div>' +
    '<label>Motivo</label><div><select id="e-mot">' + selOpc(D.mot, v.mot) + '</select><small class="muted">En el sistema: ' + esc(nomMot(v.sis.mot)) + '</small></div>' +
    '</div><p class="nota-ed">Al guardar, el cambio queda <b>"por grabar"</b>: se pasa al sistema de gestión <b>una vez por día, a las ' + HORA_GRABA + ' h</b> (lo hace la notebook de Igna). Hasta esa hora se puede anular en la pestaña Cambios. Queda registrado quién lo hizo y el valor anterior.</p>';
  abrirDlg('Editar renglón del vale', h, '<button class="primary" id="e-ok">Guardar</button>');
  $('e-ok').onclick = () => {
    const pr = parseFloat(String($('e-precio').value).replace(',', '.'));
    const base = { tipo: 'vale', vale: v.vale, item: v.item, ins: v.ins, fecha: v.fecha };
    const n = [];
    if (isFinite(pr) && pr >= 0 && Math.abs(pr - v.precio) > 0.0001) n.push(Object.assign({ campo: 'precio', antes: v.sis.precio, despues: Math.round(pr * 100) / 100, desc: 'Vale ' + v.vale + ' · ' + v.den }, base));
    else if (v.pend.precio && Math.abs(pr - v.sis.precio) < 0.0001) n.push(Object.assign({ campo: 'precio', antes: v.sis.precio, despues: v.sis.precio, desc: '' }, base));
    if ($('e-sec').value !== v.sec) n.push(Object.assign({ campo: 'sec', antes: v.sis.sec, despues: $('e-sec').value, desc: 'Vale ' + v.vale + ' · ' + v.den }, base));
    if ($('e-mot').value !== v.mot) n.push(Object.assign({ campo: 'mot', antes: v.sis.mot, despues: $('e-mot').value, desc: 'Vale ' + v.vale + ' · ' + v.den }, base));
    guardarCambios(n, 'Vale ' + v.vale + ' renglón ' + v.item + ': ' + n.map(c => CAMPO_TXT[c.campo] + ' → ' + txtValor(c.campo, c.despues)).join(', '));
  };
}
/* editar un artículo: familia y tipo de costo */
function dlgEditarArticulo(ins) {
  const i = D.ins[ins]; if (!i) return;
  const h = '<p class="sub">' + esc(i.den) + ' · cód. ' + esc(ins) + '</p><div class="ed-grid">' +
    '<label>Familia</label><div><select id="e-fam">' + selOpc(D.fam, i.fam) + '</select><small class="muted">En el sistema: ' + esc(nomFam(i.sis.fam)) + '</small></div>' +
    '<label>Tipo de costo</label><div><select id="e-cos">' + selOpc(D.cos, i.cos, (a, b) => +a - +b) + '</select><small class="muted">En el sistema: ' + esc(nomCos(i.sis.cos)) + '</small></div>' +
    '</div><p class="nota-ed">Cambia el artículo en el sistema (vale para todos sus vales, los de antes y los que vengan). Se graba una vez por día, a las ' + HORA_GRABA + ' h.</p>';
  abrirDlg('Editar artículo', h, '<button class="primary" id="e-ok">Guardar</button>');
  $('e-ok').onclick = () => {
    const n = [], base = { tipo: 'ins', ins, desc: 'Artículo ' + ins + ' · ' + i.den };
    if ($('e-fam').value !== i.fam) n.push(Object.assign({ campo: 'fam', antes: i.sis.fam, despues: $('e-fam').value }, base));
    if ($('e-cos').value !== i.cos) n.push(Object.assign({ campo: 'cos', antes: i.sis.cos, despues: $('e-cos').value }, base));
    guardarCambios(n, 'Artículo ' + ins + ': ' + n.map(c => CAMPO_TXT[c.campo] + ' → ' + txtValor(c.campo, c.despues)).join(', '));
  };
}
/* poner precio a todos los renglones sin precio de un artículo (en el período) */
function ponerPrecioArticulo(ins) {
  const vs = valesFiltrados({ per: 1, art: 1 }).filter(v => v.ins === ins && v.sis.precio <= 0 && !v.pend.precio);
  const pr = parseFloat(String($('e-pa').value).replace(',', '.'));
  if (!vs.length) { toast('No hay renglones sin precio en el período'); return; }
  if (!isFinite(pr) || pr <= 0) { toast('Poné un precio mayor a cero', true); return; }
  guardarCambios(vs.map(v => ({ tipo: 'vale', vale: v.vale, item: v.item, ins: v.ins, fecha: v.fecha, campo: 'precio', antes: 0, despues: Math.round(pr * 100) / 100, desc: 'Vale ' + v.vale + ' · ' + v.den })),
    'Precio ' + pesos(pr) + ' a ' + vs.length + ' renglones sin precio de ' + (D.ins[ins] || {}).den);
}
window.ponerPrecioArticulo = ponerPrecioArticulo;

function vCambios() {
  const l = CAMB.slice().reverse();
  const pend = l.filter(c => c.estado === 'pendiente').length;
  const est = c => c.estado === 'pendiente' ? '<span class="chip warn">por grabar</span>' : c.estado === 'aplicado' ? '<span class="chip ok">grabado</span>' : c.estado === 'error' ? '<span class="chip bad" title="' + esc(c.msg || '') + '">no se grabó</span>' : '<span class="chip mut">anulado</span>';
  return cab('Cambios', 'Lo que se cambió desde el centro. Los cambios "por grabar" se pasan al sistema <b>una vez por día, a las ' + HORA_GRABA + ' h</b> (lo hace la notebook de Igna, tiene que estar prendida); hasta ese momento se pueden anular.', botonXl('camb', 'Cambios')) +
    (pend ? '<div class="ok-box" style="background:var(--warn-soft);color:var(--warn)">' + pend + ' cambio' + (pend > 1 ? 's' : '') + ' por grabar en el sistema.</div>' : '') +
    '<section>' + tabla('camb', [
      { t: 'Cuándo', v: c => c.ts, f: t => t ? fec(t.slice(0, 10)) + ' ' + new Date(t).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '' },
      { t: 'Quién', v: c => c.por },
      { t: 'Qué', v: c => c.desc || '' },
      { t: 'Campo', v: c => CAMPO_TXT[c.campo] || c.campo },
      { t: 'Antes', v: c => txtValor(c.campo, c.antes) },
      { t: 'Después', v: c => txtValor(c.campo, c.despues), h: c => '<b>' + esc(txtValor(c.campo, c.despues)) + '</b>' },
      { t: 'Estado', v: c => c.estado, h: c => est(c) + (c.estado === 'error' && c.msg ? '<br><small class="muted">' + esc(c.msg) + '</small>' : '') },
      { t: '', h: c => c.estado === 'pendiente' ? '<button class="small danger" onclick="event.stopPropagation();anularCambio(\'' + esc(c.id) + '\')">Anular</button>' : '', x: () => '' }
    ], l, { orden: 0, limite: 100, clase: 'compacta' }) + '</section>';
}

const nomPer = c => c === '0' || !c ? 'Sin persona' : (D.per[c] || 'Cuenta ' + c);
const nomSec = c => D.sec[c] || 'Sector ' + c;
const nomMot = c => D.mot[c] || 'Motivo ' + c;
const nomFam = c => D.fam[c] || 'Familia ' + c;
const nomPan = c => D.pan[c] || 'Pañol ' + c;
const nomProv = c => D.prov[c] || 'Proveedor ' + c;
const nomCos = c => ({ '1': 'Productivo', '2': 'No productivo' })[c] || 'No definido';

/* ---------- filtros ---------- */
const F = { desde: '2026-01-01', hasta: hoyISO(), per: '', art: '', fam: '', sec: '', mot: '', pan: '', cos: '', prov: '', afact: false, umbral: 10 };
let TAB = 'resumen';
function guardarFiltros() { try { localStorage.setItem('cm-filtros', JSON.stringify({ F, TAB })); } catch (e) {} }
function leerFiltros() { try { const x = JSON.parse(localStorage.getItem('cm-filtros') || 'null'); if (x && x.F) { Object.assign(F, x.F); F.hasta = F.hasta > hoyISO() ? hoyISO() : F.hasta; } if (x && x.TAB) TAB = x.TAB; } catch (e) {} }

function coincideArt(cod, den) {
  if (!F.art) return true;
  const q = F.art.toLowerCase().trim();
  if (/^\d+$/.test(q)) return cod === q;
  return q.split(/\s+/).every(w => den.toLowerCase().includes(w));
}
function valesFiltrados(ignorar) {
  ignorar = ignorar || {};
  return D.vales.filter(v => v.fecha >= F.desde && v.fecha <= F.hasta
    && (ignorar.per || !F.per || v.per === F.per)
    && (ignorar.art || coincideArt(v.ins, v.den))
    && (!F.fam || v.fam === F.fam) && (!F.sec || v.sec === F.sec) && (!F.mot || v.mot === F.mot)
    && (!F.pan || v.pan === F.pan) && (!F.cos || v.cos === F.cos) && (!F.afact || v.afact));
}
function ocFiltradas() {
  return D.oc.filter(o => {
    if (o.fecha < F.desde || o.fecha > F.hasta) return false;
    const ins = D.ins[o.ins] || { den: o.libre || ('Artículo ' + o.ins), fam: '0', cos: '0' };
    return coincideArt(o.ins, ins.den) && (!F.fam || ins.fam === F.fam) && (!F.cos || ins.cos === F.cos) && (!F.prov || o.prov === F.prov);
  });
}
function denIns(c, libre) { return D.ins[c] ? D.ins[c].den : (libre || 'Artículo ' + c); }

function opciones(obj, sel, todos, orden) {
  const ks = Object.keys(obj).sort(orden || ((a, b) => String(obj[a]).localeCompare(String(obj[b]), 'es')));
  return '<option value="">' + todos + '</option>' + ks.map(k => '<option value="' + esc(k) + '"' + (k === sel ? ' selected' : '') + '>' + esc(obj[k]) + '</option>').join('');
}
function barraFiltros() {
  const usados = k => { const s = new Set(D.vales.map(v => v[k])); return s; };
  const pick = (obj, k) => { const u = usados(k), o = {}; for (const c of u) o[c] = obj(c); return o; };
  const per = pick(nomPer, 'per'), sec = pick(nomSec, 'sec'), mot = pick(nomMot, 'mot'), pan = pick(nomPan, 'pan');
  const famU = new Set(D.vales.map(v => v.fam).concat(D.oc.map(o => (D.ins[o.ins] || {}).fam).filter(Boolean)));
  const fam = {}; for (const c of famU) fam[c] = nomFam(c);
  const prov = {}; for (const o of D.oc) prov[o.prov] = nomProv(o.prov);
  const artList = {}; for (const v of D.vales) artList[v.ins] = v.den; for (const o of D.oc) if (!artList[o.ins]) artList[o.ins] = denIns(o.ins, o.libre);
  const activos = ['per', 'art', 'fam', 'sec', 'mot', 'pan', 'cos', 'prov'].filter(k => F[k]).length + (F.afact ? 1 : 0);
  $('filtros').innerHTML =
    '<div class="fl-per"><label>Período</label><div class="row nw"><input type="date" id="f-desde" value="' + F.desde + '"><span class="muted">a</span><input type="date" id="f-hasta" value="' + F.hasta + '"></div>' +
    '<div class="rap"><a href="#" data-r="mes">Este mes</a><a href="#" data-r="ant">Mes anterior</a><a href="#" data-r="3m">Últimos 3 meses</a><a href="#" data-r="anio">Todo el año</a></div></div>' +
    '<div><label>Persona que retira</label><select id="f-per">' + opciones(per, F.per, 'Todas') + '</select></div>' +
    '<div><label>Artículo</label><input id="f-art" list="dl-art" placeholder="Nombre o código" value="' + esc(F.art) + '"><datalist id="dl-art">' + Object.keys(artList).map(k => '<option value="' + esc(k) + '">' + esc(artList[k]) + '</option>').join('') + '</datalist></div>' +
    '<div><label>Familia</label><select id="f-fam">' + opciones(fam, F.fam, 'Todas') + '</select></div>' +
    '<div><label>Sector</label><select id="f-sec">' + opciones(sec, F.sec, 'Todos') + '</select></div>' +
    '<div><label>Motivo</label><select id="f-mot">' + opciones(mot, F.mot, 'Todos') + '</select></div>' +
    '<div><label>Pañol</label><select id="f-pan">' + opciones(pan, F.pan, 'Todos') + '</select></div>' +
    '<div><label>Tipo de costo</label><select id="f-cos"><option value="">Todos</option><option value="1"' + (F.cos === '1' ? ' selected' : '') + '>Productivo</option><option value="2"' + (F.cos === '2' ? ' selected' : '') + '>No productivo</option><option value="0"' + (F.cos === '0' ? ' selected' : '') + '>No definido</option></select></div>' +
    '<div><label>Proveedor <small class="muted">(compras)</small></label><select id="f-prov">' + opciones(prov, F.prov, 'Todos') + '</select></div>' +
    '<div class="fl-fin"><label class="chk"><input type="checkbox" id="f-afact"' + (F.afact ? ' checked' : '') + '> Solo "a facturar"</label>' +
    (activos ? '<button class="small" id="f-limpiar">Limpiar filtros (' + activos + ')</button>' : '') + '</div>';
  const ch = (id, k) => { const el = $(id); el.onchange = () => { F[k] = el.type === 'checkbox' ? el.checked : el.value; refrescar(); }; };
  ch('f-desde', 'desde'); ch('f-hasta', 'hasta'); ch('f-per', 'per'); ch('f-fam', 'fam'); ch('f-sec', 'sec'); ch('f-mot', 'mot'); ch('f-pan', 'pan'); ch('f-cos', 'cos'); ch('f-prov', 'prov'); ch('f-afact', 'afact');
  $('f-art').onchange = e => { F.art = e.target.value.trim(); refrescar(); };
  if ($('f-limpiar')) $('f-limpiar').onclick = () => { Object.assign(F, { per: '', art: '', fam: '', sec: '', mot: '', pan: '', cos: '', prov: '', afact: false }); refrescar(); };
  document.querySelectorAll('#filtros .rap a').forEach(a => a.onclick = e => { e.preventDefault(); rapido(a.dataset.r); });
}
function rapido(r) {
  const h = hoyISO(), y = +h.slice(0, 4), m = +h.slice(5, 7);
  const ini = (yy, mm) => { while (mm < 1) { mm += 12; yy--; } return yy + '-' + String(mm).padStart(2, '0') + '-01'; };
  const fin = (yy, mm) => { const d = new Date(Date.UTC(yy, mm, 0)); return d.toISOString().slice(0, 10); };
  if (r === 'mes') { F.desde = ini(y, m); F.hasta = h; }
  else if (r === 'ant') { let yy = y, mm = m - 1; if (mm < 1) { mm = 12; yy--; } F.desde = ini(yy, mm); F.hasta = fin(yy, mm); }
  else if (r === '3m') { F.desde = ini(y, m - 2); F.hasta = h; }
  else { F.desde = y + '-01-01'; F.hasta = h; }
  refrescar();
}
function irA(tab, filtro) { if (filtro) Object.assign(F, filtro); TAB = tab; cerrarDlg(); refrescar(); window.scrollTo(0, 0); }

/* ---------- tablas (ordenables y para Excel) ---------- */
const TABLAS = {};
function tabla(id, cols, rows, opt) {
  opt = opt || {};
  const t = TABLAS[id] = TABLAS[id] || { orden: opt.orden || null, dir: opt.dir || -1 };
  t.cols = cols; t.rows = rows; t.opt = opt;
  return '<div class="tw" id="tw-' + id + '">' + cuerpoTabla(id) + '</div>';
}
function cuerpoTabla(id) {
  const t = TABLAS[id], cols = t.cols;
  let rows = t.rows.slice();
  if (t.orden != null) { const c = cols[t.orden]; const val = r => c.v ? c.v(r) : r[c.k]; rows.sort((a, b) => { const x = val(a), y = val(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es')) * t.dir; }); }
  const lim = t.opt.limite && !t.todo ? t.opt.limite : Infinity;
  const vis = rows.slice(0, lim);
  let h = '<table class="tb' + (t.opt.clase ? ' ' + t.opt.clase : '') + '"><thead><tr>' + cols.map((c, i) => '<th class="' + (c.num ? 'num' : '') + (i === t.orden ? ' ord' : '') + '" data-tb="' + id + '" data-col="' + i + '" title="Ordenar">' + c.t + (i === t.orden ? (t.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>').join('') + '</tr></thead><tbody>';
  if (!vis.length) h += '<tr><td colspan="' + cols.length + '" class="muted" style="text-align:center;padding:20px">No hay datos con estos filtros.</td></tr>';
  vis.forEach((r, i) => {
    h += '<tr' + (t.opt.click ? ' class="clic" data-tb="' + id + '" data-row="' + rows.indexOf(r) + '"' : '') + (t.opt.marca && t.opt.marca(r) ? ' data-m="' + t.opt.marca(r) + '"' : '') + '>' +
      cols.map(c => '<td class="' + (c.num ? 'num' : '') + (c.cls ? ' ' + (typeof c.cls === 'function' ? c.cls(r) : c.cls) : '') + '">' + (c.h ? c.h(r) : c.f ? c.f(c.v ? c.v(r) : r[c.k]) : esc(c.v ? c.v(r) : r[c.k])) + '</td>').join('') + '</tr>';
  });
  if (t.opt.total) h += '<tr class="tot">' + cols.map((c, i) => '<td class="' + (c.num ? 'num' : '') + '">' + (t.opt.total[i] != null ? t.opt.total[i] : '') + '</td>').join('') + '</tr>';
  h += '</tbody></table>';
  if (rows.length > lim) h += '<div class="mas"><button class="small" data-mas="' + id + '">Ver los ' + rows.length + ' renglones</button></div>';
  t.vistos = rows;
  return h;
}
function excel(id, nombre) {
  const t = TABLAS[id]; if (!t || !window.XLSX) { toast('No se pudo armar el Excel', true); return; }
  const aoa = [t.cols.map(c => c.t.replace(/<[^>]+>/g, ''))];
  for (const r of t.vistos || t.rows) aoa.push(t.cols.map(c => { const v = c.x ? c.x(r) : c.v ? c.v(r) : r[c.k]; return v == null ? '' : v; }));
  const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = t.cols.map(c => ({ wch: c.num ? 14 : 30 }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, (nombre || 'Datos').slice(0, 30));
  XLSX.writeFile(wb, (nombre || 'Compras') + ' ' + F.desde + ' a ' + F.hasta + '.xlsx');
}
document.addEventListener('click', e => {
  const th = e.target.closest('th[data-tb]');
  if (th) { const t = TABLAS[th.dataset.tb], c = +th.dataset.col; if (t.orden === c) t.dir = -t.dir; else { t.orden = c; t.dir = t.cols[c].num ? -1 : 1; } $('tw-' + th.dataset.tb).innerHTML = cuerpoTabla(th.dataset.tb); return; }
  const mas = e.target.closest('[data-mas]');
  if (mas) { TABLAS[mas.dataset.mas].todo = true; $('tw-' + mas.dataset.mas).innerHTML = cuerpoTabla(mas.dataset.mas); return; }
  const xl = e.target.closest('[data-xl]');
  if (xl) { excel(xl.dataset.xl, xl.dataset.nom); return; }
  const tr = e.target.closest('tr.clic');
  if (tr) { const t = TABLAS[tr.dataset.tb]; t.opt.click(t.vistos[+tr.dataset.row]); return; }
  const ir = e.target.closest('[data-ir]');
  if (ir) { e.preventDefault(); const x = JSON.parse(ir.dataset.f || '{}'); irA(ir.dataset.ir, x); }
});
function botonXl(id, nom) { return '<button class="small" data-xl="' + id + '" data-nom="' + esc(nom) + '">⬇ Excel</button>'; }
function cab(t, sub, extra) { return '<div class="cab"><div><h2>' + t + '</h2>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div><div class="row">' + (extra || '') + '</div></div>'; }
function barra(v, max) { const w = max > 0 ? Math.max(1, Math.round(v / max * 100)) : 0; return '<span class="bar"><i style="width:' + w + '%"></i></span>'; }

/* ---------- agrupar ---------- */
function agrupar(vs, key) {
  const m = new Map();
  for (const v of vs) {
    const k = key(v); let g = m.get(k);
    if (!g) { g = { k, imp: 0, cant: 0, ren: 0, vales: new Set(), pers: new Set(), arts: new Set(), sinP: 0, ult: '', items: [] }; m.set(k, g); }
    g.imp += v.imp; g.cant += v.cant; g.ren++; g.vales.add(v.vale); g.pers.add(v.per); g.arts.add(v.ins); if (v.est) g.sinP++; if (v.fecha > g.ult) g.ult = v.fecha; g.items.push(v);
  }
  return [...m.values()];
}
function porMes(vs) { const m = {}; for (const v of vs) { const k = v.fecha.slice(0, 7); m[k] = (m[k] || 0) + v.imp; } return m; }
function mesesRango() { const r = []; let y = +F.desde.slice(0, 4), m = +F.desde.slice(5, 7); const fy = +F.hasta.slice(0, 4), fm = +F.hasta.slice(5, 7); while (y < fy || (y === fy && m <= fm)) { r.push(y + '-' + String(m).padStart(2, '0')); m++; if (m > 12) { m = 1; y++; } if (r.length > 36) break; } return r; }

/* gráfico de columnas por mes (SVG) */
function graficoMeses(vals, meses, fmt) {
  fmt = fmt || pesos;
  const W = Math.max(320, meses.length * 64), H = 190, pt = 22, pb = 26, max = Math.max(1, ...meses.map(m => vals[m] || 0));
  const bw = Math.min(40, (W / meses.length) * 0.6);
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="graf" role="img" aria-label="Importe por mes" preserveAspectRatio="xMinYMid meet">';
  s += '<line x1="0" x2="' + W + '" y1="' + (H - pb) + '" y2="' + (H - pb) + '" class="ax"/>';
  meses.forEach((m, i) => {
    const v = vals[m] || 0, h = (H - pt - pb) * v / max, x = (i + 0.5) * W / meses.length;
    s += '<g><title>' + mesTxt(m) + ': ' + fmt(v) + '</title><rect x="' + (x - bw / 2) + '" y="' + (H - pb - h) + '" width="' + bw + '" height="' + Math.max(0, h) + '" rx="3" class="col"/>';
    s += '<text x="' + x + '" y="' + (H - 8) + '" class="lb">' + mesTxt(m) + '</text>';
    if (v) s += '<text x="' + x + '" y="' + (H - pb - h - 6) + '" class="vl">' + abrev(v) + '</text>';
    s += '</g>';
  });
  return s + '</svg>';
}
function abrev(v) { if (v >= 1e6) return (v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M'; if (v >= 1e3) return Math.round(v / 1e3).toLocaleString('es-AR') + ' mil'; return n0(v); }
/* línea de precios (SVG) */
function graficoPrecios(l) {
  const pts = l.filter(o => o.precio > 0); if (pts.length < 2) return '';
  const W = 640, H = 200, pl = 70, pr = 16, pt = 16, pb = 28;
  const t0 = Date.parse(pts[0].fecha), t1 = Date.parse(pts[pts.length - 1].fecha) || t0 + 1;
  const mx = Math.max(...pts.map(o => o.precio)), mn = Math.min(...pts.map(o => o.precio)), lo = mn * 0.95, hi = mx * 1.05;
  const X = t => pl + (W - pl - pr) * (t1 === t0 ? 0.5 : (Date.parse(t) - t0) / (t1 - t0)), Y = p => pt + (H - pt - pb) * (1 - (p - lo) / (hi - lo || 1));
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="graf" role="img" aria-label="Precio de compra en el tiempo">';
  [lo, (lo + hi) / 2, hi].forEach(v => { s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" class="gr"/><text x="' + (pl - 6) + '" y="' + (Y(v) + 4) + '" class="yl">' + pesos(v) + '</text>'; });
  s += '<polyline class="ln" points="' + pts.map(o => X(o.fecha) + ',' + Y(o.precio)).join(' ') + '"/>';
  pts.forEach(o => { s += '<circle cx="' + X(o.fecha) + '" cy="' + Y(o.precio) + '" r="3.5" class="pt"><title>' + fec(o.fecha) + ' · ' + nomProv(o.prov) + ': ' + pesos(o.precio) + '</title></circle>'; });
  s += '<text x="' + pl + '" y="' + (H - 6) + '" class="lb" text-anchor="start">' + fec(pts[0].fecha) + '</text><text x="' + (W - pr) + '" y="' + (H - 6) + '" class="lb" text-anchor="end">' + fec(pts[pts.length - 1].fecha) + '</text>';
  return s + '</svg>';
}

/* ---------- pestañas ---------- */
function refrescar() {
  if (F.desde > F.hasta) { const x = F.desde; F.desde = F.hasta; F.hasta = x; }
  guardarFiltros(); barraFiltros();
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.t === TAB));
  const fn = { resumen: vResumen, personas: vPersonas, articulos: vArticulos, sectores: vSectores, precios: vPrecios, compras: vCompras, vales: vVales, cambios: vCambios }[TAB] || vResumen;
  const np = CAMB.filter(c => c.estado === 'pendiente').length;
  $('main').innerHTML = (np && TAB !== 'cambios' ? '<div class="aviso-graba">✎ Hay <b>' + np + ' cambio' + (np > 1 ? 's' : '') + ' por grabar</b>. Los cambios se pasan al sistema <b>una vez por día, a las ' + HORA_GRABA + ' h</b>; hasta entonces se ven marcados "por grabar" y se pueden anular en <a href="#" data-ir="cambios">Cambios</a>.</div>' : '') + fn();
}

function vResumen() {
  const vs = valesFiltrados(), tot = vs.reduce((a, v) => a + v.imp, 0), sinP = vs.filter(v => v.est);
  const meses = mesesRango(), pm = porMes(vs);
  const top = (key, nom, n, filtro, tab) => {
    const g = agrupar(vs, key).sort((a, b) => b.imp - a.imp), max = g.length ? g[0].imp : 0;
    return '<table class="tb top">' + g.slice(0, n).map(x => '<tr><td><a href="#" data-ir="' + tab + '" data-f=\'' + esc(JSON.stringify(filtro(x.k))) + '\'>' + esc(nom(x.k)) + '</a></td><td class="num">' + pesos(x.imp) + '</td><td class="num muted">' + (tot ? Math.round(x.imp / tot * 100) : 0) + '%</td><td class="bc">' + barra(x.imp, max) + '</td></tr>').join('') + '</table>' + (g.length > n ? '<p class="mini muted">y ' + (g.length - n) + ' más</p>' : '');
  };
  // retiros repetidos: misma persona y mismo artículo 3 o más veces
  const rep = agrupar(vs.filter(v => v.per !== '0'), v => v.per + '|' + v.ins).filter(g => g.vales.size >= 3).sort((a, b) => b.vales.size - a.vales.size || b.imp - a.imp);
  let h = cab('Resumen', 'Consumo de los vales en el período elegido. Hacé clic en cualquier nombre para ver el detalle.');
  h += '<div class="kpis">' +
    '<div class="kpi"><span>Consumo valorizado</span><b>' + pesos(tot) + '</b><small>' + vs.length.toLocaleString('es-AR') + ' renglones</small></div>' +
    '<div class="kpi"><span>Vales</span><b>' + new Set(vs.map(v => v.vale)).size.toLocaleString('es-AR') + '</b><small>' + (vs.length ? 'del ' + fec(vs.reduce((a, v) => v.fecha < a ? v.fecha : a, '9')) + ' al ' + fec(vs.reduce((a, v) => v.fecha > a ? v.fecha : a, '0')) : '—') + '</small></div>' +
    '<div class="kpi"><span>Personas</span><b>' + new Set(vs.map(v => v.per)).size + '</b><small>retiraron algo</small></div>' +
    '<div class="kpi"><span>Artículos distintos</span><b>' + new Set(vs.map(v => v.ins)).size + '</b><small>de ' + new Set(vs.map(v => v.fam)).size + ' familias</small></div>' +
    '<div class="kpi' + (sinP.length ? ' warn' : '') + '"><span>Renglones sin precio en el vale</span><b>' + sinP.length.toLocaleString('es-AR') + '</b><small>' + (sinP.length ? 'valorizados en ' + pesos(sinP.reduce((a, v) => a + v.imp, 0)) + ' con la última compra' : 'todos con precio') + '</small></div>' +
    '</div>';
  h += '<section><h2>Consumo por mes</h2><p class="sub">Importe de lo retirado con vale, a precio del vale (o de la última orden de compra si el vale no tiene precio).</p><div class="gw">' + graficoMeses(pm, meses) + '</div></section>';
  h += '<div class="g2"><section><h2>Por familia</h2>' + top(v => v.fam, nomFam, 10, k => ({ fam: k }), 'articulos') + '</section>' +
    '<section><h2>Por sector</h2>' + top(v => v.sec, nomSec, 10, k => ({ sec: k }), 'personas') + '</section>' +
    '<section><h2>Personas que más consumen</h2>' + top(v => v.per, nomPer, 10, k => ({ per: k }), 'vales') + '</section>' +
    '<section><h2>Artículos de mayor consumo</h2>' + top(v => v.ins, c => denIns(c), 10, k => ({ art: k }), 'articulos') + '</section></div>';
  h += '<section><div class="cab"><div><h2>Retiros repetidos</h2><p class="sub">La misma persona retiró el mismo artículo 3 veces o más en el período. Sirve para ver reposiciones de ropa, guantes o herramientas fuera de lo normal.</p></div>' + botonXl('rep', 'Retiros repetidos') + '</div>' +
    tabla('rep', [
      { t: 'Persona', v: g => nomPer(g.items[0].per) },
      { t: 'Artículo', v: g => g.items[0].den },
      { t: 'Familia', v: g => nomFam(g.items[0].fam) },
      { t: 'Veces', num: 1, v: g => g.vales.size },
      { t: 'Cantidad', num: 1, v: g => g.cant, f: cant },
      { t: 'Importe', num: 1, v: g => g.imp, f: pesos },
      { t: 'Último', v: g => g.ult, f: fec }
    ], rep, { limite: 15, orden: 3, click: g => dlgPersona(g.items[0].per, g.items[0].ins) }) + '</section>';
  return h;
}

function vPersonas() {
  const vs = valesFiltrados(), tot = vs.reduce((a, v) => a + v.imp, 0);
  const g = agrupar(vs, v => v.per), max = Math.max(0, ...g.map(x => x.imp));
  return cab('Por persona', 'Lo que retiró cada persona en el período. Clic en una fila para ver qué artículos y cuántas veces.', botonXl('per', 'Consumo por persona')) +
    '<section>' + tabla('per', [
      { t: 'Persona', v: x => nomPer(x.k) },
      { t: 'Sector principal', v: x => nomSec(principal(x.items, 'sec')) },
      { t: 'Vales', num: 1, v: x => x.vales.size },
      { t: 'Artículos', num: 1, v: x => x.arts.size },
      { t: 'Importe', num: 1, v: x => x.imp, f: pesos },
      { t: '% del total', num: 1, v: x => tot ? x.imp / tot * 100 : 0, f: v => Math.round(v) + '%' },
      { t: '', h: x => barra(x.imp, max), cls: 'bc', x: () => '' },
      { t: 'Último retiro', v: x => x.ult, f: fec }
    ], g, { orden: 4, click: x => dlgPersona(x.k), total: ['Total: ' + g.length + ' personas', '', new Set(vs.map(v => v.vale)).size.toLocaleString('es-AR'), '', pesos(tot), '100%', '', ''] }) + '</section>';
}
function principal(items, k) { const c = {}; for (const v of items) c[v[k]] = (c[v[k]] || 0) + v.imp; return Object.keys(c).sort((a, b) => c[b] - c[a])[0]; }

function vArticulos() {
  const vs = valesFiltrados(), tot = vs.reduce((a, v) => a + v.imp, 0);
  const g = agrupar(vs, v => v.ins);
  g.forEach(x => {
    const con = x.items.filter(v => v.precio > 0).map(v => v.precio);
    x.pmin = con.length ? Math.min(...con) : null; x.pmax = con.length ? Math.max(...con) : null;
    const u = precioOC(x.k, F.hasta); x.uoc = u ? u.precio : null; x.uocF = u ? u.fecha : '';
    const i = D.ins[x.k] || {}; x.stock = i.stock; x.min = i.min;
  });
  const max = Math.max(0, ...g.map(x => x.imp));
  return cab('Por artículo', 'Cuánto se consumió de cada artículo, cuántas personas lo retiraron y a qué precio. Clic en una fila para ver quiénes y la evolución del precio.', botonXl('art', 'Consumo por artículo')) +
    '<section>' + tabla('art', [
      { t: 'Cód.', k: 'k', num: 1, v: x => +x.k },
      { t: 'Artículo', v: x => x.items[0].den },
      { t: 'Familia', v: x => nomFam(x.items[0].fam), h: x => esc(nomFam(x.items[0].fam)) + chipPend(D.ins[x.k] || {}, 'fam') },
      { t: 'Cantidad', num: 1, v: x => x.cant, f: cant },
      { t: 'Vales', num: 1, v: x => x.vales.size },
      { t: 'Personas', num: 1, v: x => x.pers.size },
      { t: 'Importe', num: 1, v: x => x.imp, f: pesos },
      { t: '', h: x => barra(x.imp, max), cls: 'bc', x: () => '' },
      { t: 'Precio en vales', num: 1, v: x => x.pmax, h: x => x.pmin == null ? '<span class="muted">sin precio</span>' : x.pmin === x.pmax ? pesos(x.pmin) : '<span class="chip warn" title="Se usaron distintos precios en el período">' + pesos(x.pmin) + ' a ' + pesos(x.pmax) + '</span>' },
      { t: 'Última compra', num: 1, v: x => x.uoc, h: x => x.uoc == null ? '<span class="muted">—</span>' : pesos(x.uoc) + '<br><small class="muted">' + fec(x.uocF) + '</small>' },
      { t: 'Stock', num: 1, v: x => x.stock, h: x => x.stock == null ? '' : (x.min > 0 && x.stock <= x.min ? '<span class="chip bad" title="Por debajo del mínimo (' + cant(x.min) + ')">' + cant(x.stock) + '</span>' : cant(x.stock)) }
    ], g, { orden: 6, click: x => dlgArticulo(x.k), total: ['', g.length + ' artículos', '', '', '', '', pesos(tot), '', '', '', ''] }) + '</section>';
}

function vSectores() {
  const vs = valesFiltrados(), tot = vs.reduce((a, v) => a + v.imp, 0);
  const g = agrupar(vs, v => v.sec), max = Math.max(0, ...g.map(x => x.imp));
  const gm = agrupar(vs, v => v.mot), maxm = Math.max(0, ...gm.map(x => x.imp));
  const gc = agrupar(vs, v => v.cos);
  const meses = mesesRango();
  // matriz sector x mes
  const mat = g.map(x => { const r = { k: x.k, imp: x.imp }; const pm = porMes(x.items); meses.forEach(m => r[m] = pm[m] || 0); return r; });
  return cab('Por sector y motivo', 'A qué sector se cargó cada consumo y por qué motivo.', '') +
    '<div class="g2"><section><div class="cab"><h2>Sectores</h2>' + botonXl('sec', 'Consumo por sector') + '</div>' + tabla('sec', [
      { t: 'Sector', v: x => nomSec(x.k) }, { t: 'Personas', num: 1, v: x => x.pers.size }, { t: 'Vales', num: 1, v: x => x.vales.size },
      { t: 'Importe', num: 1, v: x => x.imp, f: pesos }, { t: '%', num: 1, v: x => tot ? x.imp / tot * 100 : 0, f: v => Math.round(v) + '%' }, { t: '', h: x => barra(x.imp, max), cls: 'bc', x: () => '' }
    ], g, { orden: 3, click: x => irA('articulos', { sec: x.k }), total: ['Total', '', '', pesos(tot), '100%', ''] }) + '</section>' +
    '<section><div class="cab"><h2>Motivos</h2>' + botonXl('mot', 'Consumo por motivo') + '</div>' + tabla('mot', [
      { t: 'Motivo', v: x => nomMot(x.k) }, { t: 'Vales', num: 1, v: x => x.vales.size },
      { t: 'Importe', num: 1, v: x => x.imp, f: pesos }, { t: '%', num: 1, v: x => tot ? x.imp / tot * 100 : 0, f: v => Math.round(v) + '%' }, { t: '', h: x => barra(x.imp, maxm), cls: 'bc', x: () => '' }
    ], gm, { orden: 2, click: x => irA('articulos', { mot: x.k }) }) +
    '<h2 style="margin-top:18px">Tipo de costo</h2><table class="tb top">' + gc.sort((a, b) => b.imp - a.imp).map(x => '<tr><td>' + nomCos(x.k) + '</td><td class="num">' + pesos(x.imp) + '</td><td class="num muted">' + (tot ? Math.round(x.imp / tot * 100) : 0) + '%</td></tr>').join('') + '</table></section></div>' +
    '<section><div class="cab"><div><h2>Sector por mes</h2><p class="sub">Para ver si algún sector se disparó un mes.</p></div>' + botonXl('secmes', 'Sector por mes') + '</div>' + tabla('secmes',
      [{ t: 'Sector', v: r => nomSec(r.k) }].concat(meses.map(m => ({ t: mesTxt(m), num: 1, v: r => r[m], f: v => v ? abrev(v) : '<span class="muted">·</span>', x: r => Math.round(r[m]) }))).concat([{ t: 'Total', num: 1, v: r => r.imp, f: pesos }]),
      mat, { orden: meses.length + 1, clase: 'compacta' }) + '</section>';
}

function vPrecios() {
  const u = +F.umbral || 0;
  const vs = valesFiltrados();
  // 1) vales con precio distinto a la última compra
  const dif = agrupar(vs.filter(v => v.desv != null && Math.abs(v.desv) >= u), v => v.ins + '|' + v.precio).map(g => { const v = g.items[0]; return { g, v, efecto: g.items.reduce((a, x) => a + x.cant * (x.precio - x.oc.precio), 0) }; });
  // 2) aumentos en órdenes de compra del período
  const ocs = ocFiltradas();
  const porIns = {}; for (const o of ocs) if (o.precio > 0) (porIns[o.ins] = porIns[o.ins] || []).push(o);
  const aum = [];
  for (const k in porIns) {
    const l = porIns[k]; const prim = l[0].ant || l[0], ult = l[l.length - 1];
    if (prim === ult) continue;
    const dias = (Date.parse(ult.fecha) - Date.parse(prim.fecha)) / 864e5;
    const varT = (ult.precio / prim.precio - 1) * 100;
    const meses = dias / 30.4;
    const mens = meses >= 0.5 ? (Math.pow(ult.precio / prim.precio, 1 / meses) - 1) * 100 : null;
    const saltos = l.filter(o => o.var != null && Math.abs(o.var) >= u);
    aum.push({ k, prim, ult, varT, mens, n: l.length, saltos, provs: new Set(l.map(o => o.prov)).size });
  }
  // 3) mismo artículo, distinto proveedor (en el período)
  const multi = [];
  for (const k in porIns) {
    const pv = {}; for (const o of porIns[k]) pv[o.prov] = o;   // último precio de cada proveedor
    const ks = Object.keys(pv); if (ks.length < 2) continue;
    const arr = ks.map(p => pv[p]).sort((a, b) => a.precio - b.precio);
    multi.push({ k, barato: arr[0], caro: arr[arr.length - 1], dif: (arr[arr.length - 1].precio / arr[0].precio - 1) * 100, n: ks.length });
  }
  // 4) sin precio en el vale
  const sinP = agrupar(vs.filter(v => v.sis.precio <= 0 && !v.pend.precio), v => v.ins);
  let h = cab('Precios', 'Dónde hay diferencias de precio que conviene mirar. Las comparaciones usan el precio de las órdenes de compra (sin IVA, igual que el vale).',
    '<label class="umb">Marcar diferencias desde <input type="number" id="umbral" min="0" max="500" value="' + u + '"> %</label>');
  h += '<section><div class="cab"><div><h2>Aumentos en las compras</h2><p class="sub">Artículos comprados en el período: precio de la compra anterior al período contra la última. <b>Por mes</b> es el aumento promedio mensual, para comparar con la inflación. Los saltos marcados son compras que subieron o bajaron ' + u + '% o más contra la anterior. Clic para ver la historia del precio.</p></div>' + botonXl('aum', 'Aumentos en compras') + '</div>' +
    tabla('aum', [
      { t: 'Artículo', v: x => denIns(x.k, x.ult.libre) },
      { t: 'Familia', v: x => nomFam((D.ins[x.k] || {}).fam) },
      { t: 'Antes', num: 1, v: x => x.prim.precio, h: x => pesos(x.prim.precio) + '<br><small class="muted">' + fec(x.prim.fecha) + '</small>', x: x => x.prim.precio },
      { t: 'Ahora', num: 1, v: x => x.ult.precio, h: x => pesos(x.ult.precio) + '<br><small class="muted">' + fec(x.ult.fecha) + ' · ' + esc(nomProv(x.ult.prov)) + '</small>', x: x => x.ult.precio },
      { t: 'Variación', num: 1, v: x => x.varT, h: x => '<span class="' + (x.varT >= u ? 'neg b' : x.varT <= -u ? 'pos b' : '') + '">' + pct(x.varT) + '</span>', x: x => Math.round(x.varT * 10) / 10 },
      { t: 'Por mes', num: 1, v: x => x.mens, f: v => pct(v, 1), x: x => x.mens == null ? '' : Math.round(x.mens * 10) / 10 },
      { t: 'Compras', num: 1, v: x => x.n },
      { t: 'Saltos', num: 1, v: x => x.saltos.length, h: x => x.saltos.length ? '<span class="chip warn">' + x.saltos.length + '</span>' : '<span class="muted">—</span>' },
      { t: 'Prov.', num: 1, v: x => x.provs }
    ], aum, { orden: 4, limite: 25, click: x => dlgArticulo(x.k), marca: x => Math.abs(x.varT) >= u ? 'w' : '' }) + '</section>';
  h += '<section><div class="cab"><div><h2>Mismo artículo, distinto proveedor</h2><p class="sub">Artículos que en el período se compraron a más de un proveedor: el último precio de cada uno.</p></div>' + botonXl('multi', 'Comparación de proveedores') + '</div>' +
    tabla('multi', [
      { t: 'Artículo', v: x => denIns(x.k, x.caro.libre) },
      { t: 'Más barato', v: x => nomProv(x.barato.prov), h: x => esc(nomProv(x.barato.prov)) + ' · <b>' + pesos(x.barato.precio) + '</b><br><small class="muted">' + fec(x.barato.fecha) + '</small>' },
      { t: 'Más caro', v: x => nomProv(x.caro.prov), h: x => esc(nomProv(x.caro.prov)) + ' · <b>' + pesos(x.caro.precio) + '</b><br><small class="muted">' + fec(x.caro.fecha) + '</small>' },
      { t: 'Diferencia', num: 1, v: x => x.dif, h: x => '<span class="' + (x.dif >= u ? 'neg b' : '') + '">' + pct(x.dif) + '</span>', x: x => Math.round(x.dif * 10) / 10 },
      { t: 'Proveedores', num: 1, v: x => x.n }
    ], multi, { orden: 3, limite: 20, click: x => dlgArticulo(x.k) }) + '</section>';
  h += '<section><div class="cab"><div><h2>Vales con precio distinto a la última compra</h2><p class="sub">El precio del vale difiere ' + u + '% o más del de la última orden de compra a esa fecha. <b>Efecto</b> = cuánto más (o menos) se cargó por usar ese precio.</p></div>' + botonXl('dif', 'Vales con otro precio') + '</div>' +
    tabla('dif', [
      { t: 'Artículo', v: x => x.v.den },
      { t: 'Precio en vale', num: 1, v: x => x.v.precio, f: pesos },
      { t: 'Última compra', num: 1, v: x => x.v.oc.precio, h: x => pesos(x.v.oc.precio) + '<br><small class="muted">OC ' + x.v.oc.oc + ' · ' + fec(x.v.oc.fecha) + '</small>', x: x => x.v.oc.precio },
      { t: 'Diferencia', num: 1, v: x => x.v.desv, h: x => '<span class="' + (x.v.desv > 0 ? 'neg' : 'pos') + ' b">' + pct(x.v.desv) + '</span>', x: x => Math.round(x.v.desv * 10) / 10 },
      { t: 'Renglones', num: 1, v: x => x.g.ren },
      { t: 'Cantidad', num: 1, v: x => x.g.cant, f: cant },
      { t: 'Efecto', num: 1, v: x => x.efecto, f: pesos },
      { t: 'Período', v: x => x.g.items[0].fecha, h: x => fec(x.g.items.reduce((a, v) => v.fecha < a ? v.fecha : a, '9')) + ' a ' + fec(x.g.ult) }
    ], dif, { orden: 6, limite: 20, click: x => dlgArticulo(x.v.ins) }) + '</section>';
  h += '<section><div class="cab"><div><h2>Renglones sin precio en el vale</h2><p class="sub">Se valorizaron con la última orden de compra (o el precio de lista si nunca se compró). <b>Clic en un artículo para ponerle precio</b> en el sistema a todos sus renglones sin precio.</p></div>' + botonXl('sinp', 'Sin precio en el vale') + '</div>' +
    tabla('sinp', [
      { t: 'Artículo', v: x => x.items[0].den }, { t: 'Familia', v: x => nomFam(x.items[0].fam) },
      { t: 'Renglones', num: 1, v: x => x.ren }, { t: 'Cantidad', num: 1, v: x => x.cant, f: cant },
      { t: 'Valorizado en', num: 1, v: x => x.imp, f: pesos },
      { t: 'Con precio de', v: x => x.items[0].oc ? 'última compra' : (D.ins[x.k] || {}).lista ? 'lista' : 'sin precio' }
    ], sinP, { orden: 2, limite: 15, click: x => dlgArticulo(x.k) }) + '</section>';
  setTimeout(() => { const el = $('umbral'); if (el) el.onchange = () => { F.umbral = Math.max(0, +el.value || 0); refrescar(); }; }, 0);
  return h;
}

function vCompras() {
  const ocs = ocFiltradas();
  const imp = o => o.cant * o.precio;
  const tot = ocs.reduce((a, o) => a + imp(o), 0);
  const gp = {}; for (const o of ocs) { const g = gp[o.prov] = gp[o.prov] || { k: o.prov, imp: 0, ocs: new Set(), arts: new Set(), ult: '' }; g.imp += imp(o); g.ocs.add(o.oc); g.arts.add(o.ins); if (o.fecha > g.ult) g.ult = o.fecha; }
  const provs = Object.values(gp), max = Math.max(0, ...provs.map(x => x.imp));
  const pend = ocs.filter(o => o.saldo > 0);
  const u = +F.umbral || 0;
  return cab('Órdenes de compra', 'Lo comprado en el período según las órdenes de compra del sistema. Acá cuentan los filtros de artículo, familia, tipo de costo y proveedor (no los de persona, sector o pañol).', '') +
    '<div class="kpis"><div class="kpi"><span>Comprado (sin IVA)</span><b>' + pesos(tot) + '</b><small>' + ocs.length + ' renglones</small></div>' +
    '<div class="kpi"><span>Órdenes de compra</span><b>' + new Set(ocs.map(o => o.oc)).size + '</b><small>' + provs.length + ' proveedores</small></div>' +
    '<div class="kpi' + (pend.length ? ' warn' : '') + '"><span>Pendiente de recibir</span><b>' + pesos(pend.reduce((a, o) => a + o.saldo * o.precio, 0)) + '</b><small>' + pend.length + ' renglones con saldo</small></div></div>' +
    '<section><div class="cab"><h2>Por proveedor</h2>' + botonXl('prov', 'Compras por proveedor') + '</div>' + tabla('prov', [
      { t: 'Proveedor', v: x => nomProv(x.k) }, { t: 'OC', num: 1, v: x => x.ocs.size }, { t: 'Artículos', num: 1, v: x => x.arts.size },
      { t: 'Importe', num: 1, v: x => x.imp, f: pesos }, { t: '%', num: 1, v: x => tot ? x.imp / tot * 100 : 0, f: v => Math.round(v) + '%' }, { t: '', h: x => barra(x.imp, max), cls: 'bc', x: () => '' },
      { t: 'Última', v: x => x.ult, f: fec }
    ], provs, { orden: 3, limite: 12, click: x => irA('compras', { prov: x.k }), total: ['Total', '', '', pesos(tot), '100%', '', ''] }) + '</section>' +
    '<section><div class="cab"><div><h2>Detalle de las órdenes</h2><p class="sub"><b>Vs. anterior</b>: cuánto cambió el precio contra la compra anterior del mismo artículo (marcado desde ' + u + '%).</p></div>' + botonXl('oc', 'Órdenes de compra') + '</div>' + tabla('oc', [
      { t: 'Fecha', v: o => o.fecha, f: fec }, { t: 'OC', num: 1, v: o => +o.oc },
      { t: 'Proveedor', v: o => nomProv(o.prov) }, { t: 'Artículo', v: o => denIns(o.ins, o.libre) },
      { t: 'Cantidad', num: 1, v: o => o.cant, f: cant }, { t: 'Precio', num: 1, v: o => o.precio, f: pesos },
      { t: 'Importe', num: 1, v: o => imp(o), f: pesos },
      { t: 'Vs. anterior', num: 1, v: o => o.var, h: o => o.var == null ? '<span class="muted">—</span>' : '<span class="' + (o.var >= u ? 'neg b' : o.var <= -u ? 'pos b' : '') + '" title="Antes: ' + pesos(o.ant.precio) + ' el ' + fec(o.ant.fecha) + ' (' + esc(nomProv(o.ant.prov)) + ')">' + pct(o.var) + '</span>', x: o => o.var == null ? '' : Math.round(o.var * 10) / 10 },
      { t: 'A recibir', num: 1, v: o => o.saldo, h: o => o.saldo > 0 ? '<span class="chip warn">' + cant(o.saldo) + '</span>' : '' }
    ], ocs, { orden: 0, limite: 60, click: o => dlgArticulo(o.ins) }) + '</section>';
}

function vVales() {
  const vs = valesFiltrados();
  const tot = vs.reduce((a, v) => a + v.imp, 0);
  return cab('Vales', 'Todos los renglones de los vales con los filtros elegidos. Clic en los títulos para ordenar; <b>clic en un renglón para cambiar precio, sector o motivo</b>.', botonXl('val', 'Vales de consumo')) +
    '<section>' + tabla('val', [
      { t: 'Vale', num: 1, v: v => +v.vale }, { t: 'Fecha', v: v => v.fecha, f: fec },
      { t: 'Persona', v: v => nomPer(v.per) }, { t: 'Cód.', num: 1, v: v => +v.ins }, { t: 'Artículo', v: v => v.den },
      { t: 'Sector', v: v => nomSec(v.sec), h: v => esc(nomSec(v.sec)) + chipPend(v, 'sec') }, { t: 'Motivo', v: v => nomMot(v.mot), h: v => esc(nomMot(v.mot)) + chipPend(v, 'mot') },
      { t: 'Pedido', num: 1, v: v => v.solic, f: cant },
      { t: 'Entregado', num: 1, v: v => v.cant, h: v => v.cant !== v.solic ? '<span class="chip warn" title="Se pidió ' + cant(v.solic) + '">' + cant(v.cant) + '</span>' : cant(v.cant), x: v => v.cant },
      { t: 'Precio', num: 1, v: v => v.pu, h: v => (v.est ? '<span class="muted" title="El vale no tiene precio: se usa la última compra">' + pesos(v.pu) + ' *</span>' : pesos(v.pu)) + chipPend(v, 'precio'), x: v => Math.round(v.pu * 100) / 100 },
      { t: 'Importe', num: 1, v: v => v.imp, f: pesos },
      { t: 'Pañol', v: v => nomPan(v.pan) },
      { t: 'Obs.', v: v => v.obs + (v.afact ? ' [a facturar]' : ''), h: v => (v.afact ? '<span class="chip info">a facturar</span> ' : '') + esc(v.obs) }
    ], vs, { orden: 0, limite: 200, clase: 'compacta', click: v => dlgRenglon(v), total: ['', '', vs.length + ' renglones', '', '', '', '', '', '', '', pesos(tot), '', ''] }) +
    '<p class="mini muted">* El vale no tiene precio cargado: se valoriza con la última orden de compra.</p></section>';
}

/* ---------- diálogos ---------- */
function abrirDlg(tit, cuerpo, pie) { $('dlg-h').innerHTML = tit; $('dlg-b').innerHTML = cuerpo; $('dlg-f').innerHTML = (pie || '') + '<button onclick="cerrarDlg()">Cerrar</button>'; const d = $('dlg'); if (!d.open) d.showModal(); d.querySelector('.dlg-b').scrollTop = 0; }
function cerrarDlg() { const d = $('dlg'); if (d.open) d.close(); }
window.cerrarDlg = cerrarDlg;
window.dlgEditarArticulo = dlgEditarArticulo;

function dlgPersona(per, ins) {
  const vs = valesFiltrados({ per: 1, art: 1 }).filter(v => v.per === per);
  const g = agrupar(vs, v => v.ins).sort((a, b) => b.imp - a.imp), tot = vs.reduce((a, v) => a + v.imp, 0);
  let h = '<div class="kpis sm"><div class="kpi"><span>Consumo</span><b>' + pesos(tot) + '</b></div><div class="kpi"><span>Vales</span><b>' + new Set(vs.map(v => v.vale)).size + '</b></div><div class="kpi"><span>Sector</span><b class="t">' + esc(nomSec(principal(vs, 'sec'))) + '</b></div></div>';
  h += '<table class="tb"><thead><tr><th>Artículo</th><th class="num">Veces</th><th class="num">Cantidad</th><th class="num">Importe</th><th>Fechas</th></tr></thead><tbody>' +
    g.map(x => '<tr' + (x.k === ins ? ' class="sel"' : '') + '><td>' + esc(x.items[0].den) + '</td><td class="num">' + x.vales.size + '</td><td class="num">' + cant(x.cant) + '</td><td class="num">' + pesos(x.imp) + '</td><td class="fechas">' + [...new Set(x.items.map(v => v.fecha))].sort().map(fec).join(', ') + '</td></tr>').join('') + '</tbody></table>';
  abrirDlg(esc(nomPer(per)) + ' <small class="muted">· ' + fec(F.desde) + ' a ' + fec(F.hasta) + '</small>', h,
    '<button class="primary" data-ir="vales" data-f=\'' + esc(JSON.stringify({ per, art: '' })) + '\'>Ver sus vales</button>');
}

function dlgArticulo(ins) {
  const i = D.ins[ins] || { den: denIns(ins), fam: '0' };
  const vs = valesFiltrados({ per: 1, art: 1 }).filter(v => v.ins === ins);
  const tot = vs.reduce((a, v) => a + v.imp, 0);
  const gp = agrupar(vs, v => v.per).sort((a, b) => b.cant - a.cant);
  const l = (D.ocPorIns[ins] || []);
  const meses = mesesRango(), pmC = {}; for (const v of vs) { const k = v.fecha.slice(0, 7); pmC[k] = (pmC[k] || 0) + v.cant; }
  let h = '<div class="kpis sm"><div class="kpi"><span>Consumido</span><b>' + cant(vs.reduce((a, v) => a + v.cant, 0)) + '</b><small>' + pesos(tot) + '</small></div>' +
    '<div class="kpi"><span>Personas</span><b>' + gp.length + '</b></div>' +
    '<div class="kpi"><span>Stock</span><b>' + (i.stock != null ? cant(i.stock) : '—') + '</b>' + (i.min > 0 ? '<small>mínimo ' + cant(i.min) + '</small>' : '') + '</div>' +
    '<div class="kpi"><span>Familia</span><b class="t">' + esc(nomFam(i.fam)) + '</b><small>' + nomCos(i.cos) + '</small></div></div>';
  if (vs.length) h += '<h3>Consumo por mes (cantidad)</h3><div class="gw">' + graficoMeses(pmC, meses, cant) + '</div>';
  if (l.length) {
    h += '<h3>Precio de compra (órdenes de compra desde ene-25)</h3>' + (graficoPrecios(l) ? '<div class="gw">' + graficoPrecios(l) + '</div>' : '') +
      '<table class="tb"><thead><tr><th>Fecha</th><th class="num">OC</th><th>Proveedor</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Vs. anterior</th></tr></thead><tbody>' +
      l.slice().reverse().map(o => '<tr><td>' + fec(o.fecha) + '</td><td class="num">' + o.oc + '</td><td>' + esc(nomProv(o.prov)) + '</td><td class="num">' + cant(o.cant) + '</td><td class="num">' + pesos(o.precio) + '</td><td class="num">' + (o.var == null ? '<span class="muted">—</span>' : '<span class="' + (o.var >= F.umbral ? 'neg b' : o.var <= -F.umbral ? 'pos b' : '') + '">' + pct(o.var) + '</span>') + '</td></tr>').join('') + '</tbody></table>';
  } else h += '<p class="muted">No hay órdenes de compra de este artículo desde enero de 2025.</p>';
  if (gp.length) h += '<h3>Quiénes lo retiraron</h3><table class="tb"><thead><tr><th>Persona</th><th class="num">Veces</th><th class="num">Cantidad</th><th class="num">Importe</th><th>Último</th></tr></thead><tbody>' +
    gp.map(x => '<tr><td>' + esc(nomPer(x.k)) + '</td><td class="num">' + x.vales.size + '</td><td class="num">' + cant(x.cant) + '</td><td class="num">' + pesos(x.imp) + '</td><td>' + fec(x.ult) + '</td></tr>').join('') + '</tbody></table>';
  const sinP = vs.filter(v => v.sis.precio <= 0 && !v.pend.precio), ult = precioOC(ins, F.hasta);
  if (sinP.length) h = '<div class="ponerp"><b>' + sinP.length + ' renglones sin precio</b> en el período (' + cant(sinP.reduce((a, v) => a + v.cant, 0)) + ' unidades). Ponerles precio: ' +
    '<input id="e-pa" type="number" min="0" step="0.01" value="' + (ult ? Math.round(ult.precio * 100) / 100 : '') + '"> <button class="small primary" onclick="ponerPrecioArticulo(\'' + esc(ins) + '\')">Poner precio</button>' +
    (ult ? '<br><small class="muted">Propuesto: última compra (OC ' + ult.oc + ', ' + fec(ult.fecha) + '). Se graba en el sistema a las ' + HORA_GRABA + ' h.</small>' : '') + '</div>' + h;
  abrirDlg(esc(i.den) + ' <small class="muted">· cód. ' + esc(ins) + '</small>' + chipPend(i, 'fam') + chipPend(i, 'cos'), h,
    (D.ins[ins] ? '<button onclick="dlgEditarArticulo(\'' + esc(ins) + '\')">✎ Familia / tipo de costo</button>' : '') +
    '<button class="primary" data-ir="vales" data-f=\'' + esc(JSON.stringify({ art: ins, per: '' })) + '\'>Ver los vales</button>');
}

/* ---------- arranque ---------- */
async function cargar() {
  $('main').innerHTML = '<div class="cargando"><span class="spin"></span> Trayendo los vales…</div>';
  const hoy = hoyISO().slice(0, 7), ids = [];
  let y = +DESDE_MES.slice(0, 4), m = +DESDE_MES.slice(5);
  while (true) { const k = y + '-' + String(m).padStart(2, '0'); if (k > hoy) break; ids.push(k); m++; if (m > 12) { m = 1; y++; } }
  try {
    const [cb, ma, co, ...vs] = await Promise.all([C3API.leerDoc('cm-cambios'), C3API.sis('cm-maestro'), C3API.sis('cm-compras')].concat(ids.map(k => C3API.sis('cm-v-' + k))));
    if (!ma) { $('main').innerHTML = '<section class="empty">Todavía no llegaron los datos del sistema. Los sube la notebook de Igna todos los días.</section>'; return; }
    CAMB = Array.isArray(cb.d.lista) ? cb.d.lista : (cb.d.lista ? [cb.d.lista] : []);
    RAW = { ma, co, vs }; reconstruir();
    const act = [ma, co].concat(vs).filter(Boolean).map(x => x.actualizado || x.hora || '').sort().pop();
    $('st').innerHTML = '<span class="dot"></span>Datos del sistema al <b>' + esc(act ? (/^\d{4}-\d{2}-\d{2}/.test(act) ? fec(act.slice(0, 10)) + ' ' + act.slice(11, 16) : act) : '—') + '</b><br><span id="st-user"></span>';
    if (C3API.usuario) $('st-user').innerHTML = esc(C3API.usuario.nombre) + ' · <a href="#" onclick="C3API.salir();return false">Salir</a>';
    leerFiltros(); refrescar();
  } catch (e) {
    console.error(e);
    $('main').innerHTML = '<section class="empty">No se pudieron leer los datos (' + esc(e.message || e) + '). Recargá la página.</section>';
  }
}
document.querySelectorAll('#nav a').forEach(a => a.onclick = e => { e.preventDefault(); TAB = a.dataset.t; refrescar(); window.scrollTo(0, 0); });
C3API.listo.then(api => {
  if (!api.editor && !['todo', 'compras'].includes(api.rol)) { $('main').innerHTML = '<section class="empty">Tu cuenta no tiene acceso al Centro de compras. Pedile a Igna que te lo habilite.</section>'; return; }
  cargar();
});
