/* Centro RRHH · pestaña Reloj: fichadas y novedades del reloj CC-Cloud (Ratronic).
   Cómo llegan los datos:
     CC-Cloud manda todos los días a las 6:00 a rrhhqualita@gmail.com dos Excel del día anterior ("Reporte Cronológico de Fichadas"
     agrupado por sector y "Reporte de Ausencias y Retrasos"). La notebook de Igna (notebook/rrhh/rh_reloj.ps1) lee esa casilla
     por IMAP y sube cada Excel tal cual (base64) a rhdocs/reloj-x-{id}, anotándolo en rhdocs/reloj-entrada { lista: [{ id, archivo, recibido }] }.
     Esta página, al abrirse, lee los Excel que todavía no procesó (rhdocs/reloj-hechos { ids }) y los pasa a un documento por mes:
     rhdocs/reloj-AAAA-MM { txt, dias: { 'AAAA-MM-DD': { F: fichadas, N: novedades } }, nom: { legajo: nombre } }
       F|AAAA-MM-DD|HH:MM|legajo|E o S|reloj|sector de CC-Cloud
       N|AAAA-MM-DD|legajo|novedad (AUSENTE, ENT.TARDE, SAL.ANTES…)|minutos|pago|concepto|observaciones
     rhdocs/reloj-indice { meses: { 'AAAA-MM': { dias, ult } } }
   También se puede subir a mano un Excel bajado de CC-Cloud (sirve para cargar meses viejos): mismo procesamiento.
   El legajo de CC-Cloud es el mismo del sistema de sueldos (LEG). Ausentes, llegadas tarde y salidas antes las calcula CC-Cloud
   con el turno de cada uno; acá solo se cruzan con las vacaciones y licencias cargadas. */
'use strict';
const RJ = {};             // 'AAAA-MM' → { F: [{f, h, leg, es, reloj, sec}], N: [{f, leg, nov, min, pago, con, obs}], dias, nom } (null si no hay)
let RJIDX = null;          // reloj-indice.meses
let RJPROC = null;         // promesa del procesamiento de Excel pendientes
const UIR = { modo: 'dia', dia: '', rango: 'u30', d: '', h: '' };
const NOVS = { 'AUSENTE': 'Faltó', 'ENT.TARDE': 'Llegó tarde', 'SAL.ANTES': 'Se fue antes' };

const minDe = h => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); return m ? +m[1] * 60 + +m[2] : null; };
const hm = m => m == null ? '' : Math.floor(m / 60) + ':' + p2(Math.round(m % 60));
const minTxt = m => !m ? '' : m < 60 ? m + ' min' : hm(m) + ' h';
const DIAS_S = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const diaSem = f => DIAS_S[new Date(dDe(f)).getUTCDay()];
const legCuil = l => LEG[String(l).trim()] || null;
function nomLeg(l) { const c = legCuil(l); if (c && N[c]) return N[c].nombre; for (const m in RJ) if (RJ[m] && RJ[m].nom[l]) return lindo(RJ[m].nom[l]); return 'Legajo ' + l; }
/* sector de CC-Cloud de cada legajo (el último visto); si nunca fichó, el del sistema de sueldos */
const SECCC = {};
function secLeg(l) { if (SECCC[l]) return SECCC[l]; const c = legCuil(l); return c && N[c] && N[c].sector ? limpiarSec(N[c].sector) : 'Sin sector'; }
function limpiarSec(s) { s = String(s || '').trim(); const m = /^\d+\s*-\s*(.+)$/.exec(s); return lindo(m ? m[1] : s).replace(/(\S) (Y|De|Del|La|Las|Los|E|En)\b/g, (a, b, c) => b + ' ' + c.toLowerCase()); }

/* ---------- leer los meses ---------- */
async function relojMes(m) {
  if (RJ[m] !== undefined) return RJ[m];
  const r = await C3API.leerDoc('reloj-' + m);
  RJ[m] = r.d && r.d.txt != null ? armarMes(r.d) : null;
  return RJ[m];
}
function armarMes(d) {
  const x = { F: [], N: [], dias: d.dias || {}, nom: d.nom || {} };
  for (const f of lineas(d.txt)) {
    if (f[0] === 'F') { const o = { f: f[1], h: f[2], leg: f[3], es: f[4], reloj: f[5] || '', sec: limpiarSec(f[6]) }; x.F.push(o); if (o.sec) SECCC[o.leg] = o.sec; }
    else if (f[0] === 'N') x.N.push({ f: f[1], leg: f[2], nov: f[3], min: +f[4] || 0, pago: f[5] || '', con: f[6] || '', obs: f[7] || '' });
  }
  x.F.sort((a, b) => (a.f + a.h < b.f + b.h ? -1 : 1));
  return x;
}
async function relojIndice() {
  if (RJIDX) return RJIDX;
  const r = await C3API.leerDoc('reloj-indice');
  RJIDX = (r.d && r.d.meses) || {};
  return RJIDX;
}
const diasCon = () => { const l = []; for (const m in RJ) if (RJ[m]) for (const f in RJ[m].dias) l.push(f); return l.sort(); };
async function relojRango(a, b) { const ms = []; for (let m = a.slice(0, 7); m <= b.slice(0, 7); m = mesMas(m, 1)) ms.push(m); await Promise.all(ms.map(relojMes)); }

/* ---------- Excel de CC-Cloud → renglones ---------- */
const sinA = s => sinAcentos(String(s == null ? '' : s)).trim();
function fechaCelda(v) {
  if (v instanceof Date) return v.getFullYear() + '-' + p2(v.getMonth() + 1) + '-' + p2(v.getDate());
  if (typeof v === 'number' && v > 30000) { const d = XLSX.SSF.parse_date_code(v); return d.y + '-' + p2(d.m) + '-' + p2(d.d); }
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(v || '')); return m ? m[3] + '-' + p2(m[2]) + '-' + p2(m[1]) : '';
}
function horaCelda(v) {
  if (v instanceof Date) return p2(v.getHours()) + ':' + p2(v.getMinutes());
  if (typeof v === 'number' && v < 1) { const t = Math.round(v * 1440); return p2(Math.floor(t / 60)) + ':' + p2(t % 60); }
  const m = /(\d{1,2}):(\d{2})/.exec(String(v || '')); return m ? p2(m[1]) + ':' + m[2] : '';
}
function minCelda(v) {
  if (typeof v === 'number') return v < 1 ? Math.round(v * 1440) : Math.round(v * 60);
  const m = /^(\d+):(\d{2})/.exec(String(v || '').trim()); if (m) return +m[1] * 60 + +m[2];
  const n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) ? Math.round(n * 60) : 0;
}
const limpia = s => String(s == null ? '' : s).replace(/[|\r\n\t]+/g, ' ').trim();
/* devuelve { tipo: 'F'|'N', desde, hasta, lin: [...], nom } o null si no es un reporte conocido */
function leerExcelReloj(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]]; if (!ws) return null;
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  let tipo = null, per = [], hdr = null, col = {}, grupo = '';
  const lin = [], nom = {}, fechas = new Set();
  for (const fila of filas) {
    const no = fila.map(c => c !== '' && c != null).reduce((a, b) => a + b, 0);
    const c0 = String(fila[0] == null ? '' : fila[0]).trim();
    if (!hdr && /cronol.gico de fichadas/i.test(sinA(c0))) tipo = 'F';
    if (!hdr && /ausencias y retrasos/i.test(sinA(c0))) tipo = 'N';
    if (/^per[ií]odo/i.test(c0)) { per = (c0.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || []).map(fechaCelda).sort(); continue; }
    const k = fila.map(sinA);
    if (k.includes('legajo') && (k.includes('e/s') || k.includes('novedad'))) {
      hdr = k; col = {}; k.forEach((n, i) => { if (n && col[n] == null) col[n] = i; });
      if (!tipo) tipo = k.includes('novedad') ? 'N' : 'F';
      continue;
    }
    if (no === 1 && /^\d+\s*-\s*\S/.test(c0)) { grupo = c0; continue; }
    if (!hdr) continue;
    const g = n => fila[col[n]];
    const leg = String(g('legajo') == null ? '' : g('legajo')).trim().replace(/\.0+$/, '');
    if (!/^\d+$/.test(leg)) continue;
    const f = fechaCelda(g('fecha')); if (!f) continue;
    fechas.add(f);
    if (col.empleado != null && g('empleado')) nom[leg] = limpia(g('empleado'));
    else { const m = /^(\d+)\s*-\s*(.+)$/.exec(grupo); if (m && m[1] === leg) nom[leg] = limpia(m[2]); }
    if (tipo === 'F') {
      const est = sinA(g('estado fichada')); if (est && !/acept/.test(est)) continue;
      const h = horaCelda(g('hora')); if (!h) continue;
      const es = /^s/i.test(sinA(g('e/s'))) ? 'S' : 'E';
      lin.push(['F', f, h, leg, es, limpia(g('reloj')), limpia(grupo)].join('|'));
    } else {
      const nov = limpia(g('novedad')).toUpperCase(); if (!nov) continue;
      lin.push(['N', f, leg, nov, minCelda(g('cant.') != null ? g('cant.') : g('cant')), limpia(g('pago')), limpia(g('concepto')), limpia(g('observaciones'))].join('|'));
    }
  }
  if (!tipo || !hdr) return null;
  const fs = [...fechas].sort();
  const desde = per[0] || fs[0], hasta = per[per.length - 1] || fs[fs.length - 1];
  if (!desde) return null;
  return { tipo, desde, hasta, lin, nom };
}
/* mete un reporte en los documentos de cada mes: reemplaza lo de ese tipo en esas fechas */
async function guardarReloj(r, origen) {
  const porMes = {};
  for (let f = r.desde; f <= r.hasta; f = sumDias(f, 1)) (porMes[f.slice(0, 7)] = porMes[f.slice(0, 7)] || { fechas: new Set(), lin: [] }).fechas.add(f);
  for (const l of r.lin) { const f = l.split('|')[1], m = f.slice(0, 7); if (porMes[m] && porMes[m].fechas.has(f)) porMes[m].lin.push(l); }
  const tipoTxt = r.tipo === 'F' ? 'fichadas' : 'ausencias y retrasos';
  for (const m of Object.keys(porMes).sort()) {
    const x = porMes[m], fs = [...x.fechas].sort();
    const d = await C3API.cambiarDoc('reloj-' + m, d => {
      const viejas = String(d.txt || '').split('\n').filter(l => l && !(l[0] === r.tipo && x.fechas.has(l.split('|')[1])));
      d.txt = viejas.concat(x.lin).join('\n');
      d.dias = d.dias || {};
      for (const f of fs) { const o = d.dias[f] = d.dias[f] || {}; o[r.tipo] = x.lin.filter(l => l.split('|')[1] === f).length; }
      d.nom = Object.assign(d.nom || {}, r.nom);
    }, 'Reloj CC-Cloud: ' + tipoTxt + (fs.length > 1 ? ' del ' + fec(fs[0]) + ' al ' + fec(fs[fs.length - 1]) : ' del ' + fec(fs[0])) + ' (' + origen + ')');
    RJ[m] = armarMes(d);
    const dias = Object.keys(d.dias || {}).sort();
    await C3API.cambiarDoc('reloj-indice', i => { i.meses = i.meses || {}; i.meses[m] = { dias: dias.length, ult: dias[dias.length - 1] }; }, 'Reloj: índice ' + mesLargo(m));
    if (RJIDX) RJIDX[m] = { dias: dias.length, ult: dias[dias.length - 1] };
  }
}
const esperarXLSX = () => new Promise((ok, no) => { let n = 0; const t = setInterval(() => { if (window.XLSX) { clearInterval(t); ok(); } else if (++n > 100) { clearInterval(t); no(new Error('no cargó el lector de Excel')); } }, 100); });
/* procesa los Excel que mandó la notebook y todavía no se pasaron a los meses */
function procesarReloj() {
  if (RJPROC) return RJPROC;
  RJPROC = (async () => {
    const [ent, he] = await Promise.all([C3API.leerDoc('reloj-entrada'), C3API.leerDoc('reloj-hechos')]);
    const hechos = new Set((he.d && he.d.ids) || []);
    const pend = ((ent.d && ent.d.lista) || []).filter(x => x && x.id && !hechos.has(x.id)).sort((a, b) => (a.recibido < b.recibido ? -1 : 1));
    if (!pend.length) return 0;
    await esperarXLSX();
    let n = 0;
    for (const p of pend) {
      let res = 'sin datos';
      try {
        const doc = await C3API.leerDoc('reloj-x-' + p.id);
        if (doc.d && doc.d.b64) {
          const r = leerExcelReloj(XLSX.read(doc.d.b64, { type: 'base64', cellDates: true }));
          if (r) { await guardarReloj(r, 'mail ' + (p.archivo || p.id)); res = r.tipo; n++; }
        }
      } catch (e) { console.error('reloj', p.id, e); res = 'error'; }
      if (res === 'error') continue;   // se reintenta la próxima vez
      await C3API.cambiarDoc('reloj-hechos', d => { d.ids = (d.ids || []).concat([p.id]).slice(-600); }, 'Reloj: procesado ' + (p.archivo || p.id) + ' (' + res + ')');
    }
    return n;
  })().catch(e => { console.error(e); RJPROC = null; return 0; });
  return RJPROC;
}
window.procesarReloj = procesarReloj;
async function subirExcelReloj(files) {
  await esperarXLSX();
  let ok = 0;
  for (const fl of files) {
    try {
      const r = leerExcelReloj(XLSX.read(await fl.arrayBuffer(), { type: 'array', cellDates: true }));
      if (!r) { toast(fl.name + ': no es un reporte de fichadas ni de ausencias y retrasos de CC-Cloud', true); continue; }
      await guardarReloj(r, 'subido a mano: ' + fl.name);
      ok++;
      toast((r.tipo === 'F' ? 'Fichadas' : 'Ausencias y retrasos') + ' del ' + fec(r.desde) + (r.hasta !== r.desde ? ' al ' + fec(r.hasta) : '') + ': ' + r.lin.length + ' renglones');
    } catch (e) { console.error(e); toast('No se pudo leer ' + fl.name + ': ' + (e.message || e), true); }
  }
  if (ok) { UIR.dia = ''; refrescar(); }
}

/* ---------- armar un día ---------- */
/* entrada con su salida (hasta 16 h después, puede ser al otro día) */
function turnosDe(leg, F) {
  const l = F.filter(x => x.leg === leg), r = [];
  const t = x => dDe(x.f) / 6e4 + minDe(x.h);
  const usadas = new Set();
  l.forEach((x, i) => {
    if (x.es !== 'E') return;
    let s = null;
    for (let j = i + 1; j < l.length; j++) { const y = l[j]; if (t(y) - t(x) > 16 * 60) break; if (y.es === 'E' && t(y) - t(x) > 30) break; if (y.es === 'S') { s = y; usadas.add(j); break; } }
    r.push({ e: x, s, min: s ? t(s) - t(x) : null });
  });
  l.forEach((x, j) => { if (x.es === 'S' && !usadas.has(j)) r.push({ e: null, s: x, min: null }); });
  return r;
}
function dia(f) {
  const F = [], Nv = [];
  for (const m of [mesMas(f.slice(0, 7), -1), f.slice(0, 7), mesMas(f.slice(0, 7), 1)]) if (RJ[m]) { F.push(...RJ[m].F.filter(x => x.f >= sumDias(f, -1) && x.f <= sumDias(f, 1))); Nv.push(...RJ[m].N.filter(x => x.f === f)); }
  const hayAntes = diasCon().includes(sumDias(f, -1)), hayDesp = diasCon().includes(sumDias(f, 1));
  const P = {};
  const per = leg => P[leg] = P[leg] || { leg, c: legCuil(leg), sec: secLeg(leg), ent: null, sal: null, min: 0, turnos: [], nov: [], inc: [] };
  for (const leg of new Set(F.filter(x => x.f === f || x.f === sumDias(f, 1)).map(x => x.leg))) {
    for (const t of turnosDe(leg, F)) {
      if (t.e && t.e.f === f) {
        const p = per(leg); p.turnos.push(t); if (!p.ent || t.e.h < p.ent) p.ent = t.e.h;
        if (t.s) { p.sal = t.s.f === f ? t.s.h : t.s.h + ' (+1)'; p.min += t.min; }
        else if (hayDesp || minDe(t.e.h) + 16 * 60 < 24 * 60 && f < hoyISO()) p.inc.push('Entró ' + t.e.h + ' y no fichó la salida');
        if (t.e.reloj) p.reloj = t.e.reloj;
        if (t.e.sec) p.sec = t.e.sec;
      } else if (!t.e && t.s && t.s.f === f && (hayAntes || minDe(t.s.h) > 16 * 60)) per(leg).inc.push('Salió ' + t.s.h + ' sin fichar la entrada');
    }
  }
  for (const n of Nv) per(n.leg).nov.push(n);
  const L = Object.values(P);
  for (const p of L) {
    p.vino = p.turnos.length > 0;
    p.aus = p.nov.find(n => n.nov === 'AUSENTE');
    p.tarde = p.nov.filter(n => n.nov === 'ENT.TARDE').reduce((s, n) => s + n.min, 0);
    p.antes = p.nov.filter(n => n.nov === 'SAL.ANTES').reduce((s, n) => s + n.min, 0);
    if (p.aus) p.aviso = avisoDe(p, f);
  }
  return { f, L, cargado: RJ[f.slice(0, 7)] && RJ[f.slice(0, 7)].dias[f] || {} };
}
/* ausencia con aviso: concepto cargado en CC-Cloud, vacaciones del sistema o algo cargado en el Centro RRHH */
function avisoDe(p, f) {
  if (p.aus && p.aus.con) return lindo(p.aus.con);
  if (!p.c) return '';
  const v = SVAC.find(x => x.cuil === p.c && x.desde && x.desde <= f && (x.hasta || x.desde) >= f); if (v) return 'Vacaciones';
  const a = ausEn(f, f, p.c)[0]; if (a) return TIPOS[a.tipo] || 'Ausencia cargada';
  const s = SAN.find(x => x.cuil === p.c && x.tipo === 3 && x.desde && x.desde <= f && (x.hasta || x.desde) >= f); if (s) return 'Suspensión';
  return '';
}

/* ---------- pantalla ---------- */
const cPer = { t: 'Persona', v: p => nomLeg(p.leg) };
const cLeg = { t: 'Legajo', num: 1, v: p => +p.leg };
const cSec = { t: 'Sector', v: p => p.sec };
const abrirLeg = p => { if (p.c && N[p.c]) ficha(p.c, 'reloj'); else toast('El legajo ' + p.leg + ' no está en la nómina del sistema de sueldos', true); };
async function vReloj() {
  await Promise.all([relojIndice(), procesarReloj()]);
  const idx = RJIDX || {}, meses = Object.keys(idx).sort(), hoy = hoyISO();
  setTimeout(enganchesReloj, 0);
  const subir = '<label class="btn small" style="cursor:pointer">⬆ Subir Excel de CC-Cloud<input type="file" id="rj-up" accept=".xlsx,.xls" multiple style="display:none"></label>';
  if (!meses.length) return cab('Reloj', 'Fichadas del reloj CC-Cloud, ausentes y llegadas tarde.', subir) +
    '<section class="empty">Todavía no llegó ningún reporte del reloj. CC-Cloud los manda todos los días a las 6 de la mañana a rrhhqualita@gmail.com y la notebook los sube solos.<br><br>Para ver días anteriores, bajá de CC-Cloud (Reportes) el <b>Reporte Cronológico de Fichadas</b> y el <b>Reporte de Ausencias y Retrasos</b> en Excel, del período que quieras, y subilos con el botón de arriba.</section>';
  const modo = '<span class="seg"><button class="small' + (UIR.modo === 'dia' ? ' on' : '') + '" id="rj-m-dia">Un día</button><button class="small' + (UIR.modo === 'per' ? ' on' : '') + '" id="rj-m-per">Período</button></span>';
  return UIR.modo === 'per' ? vRelojPer(meses, modo, subir) : vRelojDia(meses, modo, subir);
}
async function vRelojDia(meses, modo, subir) {
  const ult = meses.map(m => RJIDX[m].ult).filter(Boolean).sort().pop();
  let f = UIR.dia || ult;
  await relojRango(sumDias(f, -1), sumDias(f, 1));
  const D = dia(f), L = D.L;
  const vin = L.filter(p => p.vino), aus = L.filter(p => p.aus), sinAv = aus.filter(p => !p.aviso), tar = L.filter(p => p.tarde), ant = L.filter(p => p.antes), inc = L.filter(p => p.inc.length);
  const otras = L.filter(p => p.nov.some(n => !NOVS[n.nov]));
  const totT = tar.reduce((s, p) => s + p.tarde, 0);
  const falta = !D.cargado.F ? 'fichadas' : !D.cargado.N ? 'ausencias y retrasos' : '';
  const secs = {};
  for (const p of L) { const s = secs[p.sec] = secs[p.sec] || { sec: p.sec, vin: 0, aus: 0, sin: 0, tar: 0, ant: 0, inc: 0, min: 0 }; if (p.vino) { s.vin++; s.min += p.min; } if (p.aus) { s.aus++; if (!p.aviso) s.sin++; } if (p.tarde) s.tar++; if (p.antes) s.ant++; if (p.inc.length) s.inc++; }
  const S = Object.values(secs), T = S.reduce((t, s) => { for (const k in t) t[k] += s[k]; return t; }, { vin: 0, aus: 0, sin: 0, tar: 0, ant: 0, inc: 0, min: 0 });
  const nav = '<button class="small" id="rj-ant" title="Día anterior">◀</button><input type="date" id="rj-dia" value="' + f + '"><button class="small" id="rj-sig" title="Día siguiente">▶</button>';
  const vacio = D.cargado.F == null && D.cargado.N == null;
  return cab('Reloj · ' + ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][new Date(dDe(f)).getUTCDay()] + ' ' + fec(f),
    'Del reloj CC-Cloud. Ausentes, llegadas tarde y salidas antes las calcula CC-Cloud con el turno de cada uno. Los turnos de noche cuentan el día que entraron. Clic en una persona para ver su historial.',
    modo + nav + subir + botonXl('rj-sec,rj-aus,rj-tar,rj-ant,rj-inc,rj-tod', 'Reloj ' + f)) +
    (vacio ? '<div class="aviso">No hay datos del reloj de este día. El último cargado es el ' + fec(ult) + '.</div>' : falta ? '<div class="aviso">Del ' + fec(f) + ' falta el reporte de <b>' + falta + '</b>' + (falta === 'fichadas' ? ': no se puede ver quién vino ni a qué hora.' : ': no se sabe quién faltó ni quién llegó tarde.') + '</div>' : '') +
    '<div class="kpis">' + kpi('Vinieron', n0(vin.length), D.cargado.F ? (vin.some(p => p.min) ? hm(Math.round(T.min / vin.filter(p => p.min).length)) + ' h trabajadas en promedio' : 'todavía sin salidas') : 'sin fichadas') +
    kpi('Faltaron', n0(aus.length), aus.length ? sinAv.length + ' sin aviso ni licencia cargada' : '', { warn: sinAv.length > 0 }) +
    kpi('Llegaron tarde', n0(tar.length), tar.length ? minTxt(totT) + ' en total' : '', { warn: tar.length > 0 }) +
    kpi('Se fueron antes', n0(ant.length), ant.length ? minTxt(ant.reduce((s, p) => s + p.antes, 0)) + ' en total' : '') +
    kpi('Fichadas incompletas', n0(inc.length), 'entrada o salida sin fichar', { warn: inc.length > 0 }) + '</div>' +
    '<section><h2>Por sector</h2>' + tabla('rj-sec', [
      { t: 'Sector', v: s => s.sec }, { t: 'Vinieron', num: 1, v: s => s.vin }, { t: 'Faltaron', num: 1, v: s => s.aus, f: v => v || '' },
      { t: 'Sin aviso', num: 1, v: s => s.sin, h: s => s.sin ? '<b class="neg">' + s.sin + '</b>' : '' }, { t: 'Llegaron tarde', num: 1, v: s => s.tar, f: v => v || '' },
      { t: 'Se fueron antes', num: 1, v: s => s.ant, f: v => v || '' }, { t: 'Incompletas', num: 1, v: s => s.inc, f: v => v || '' }, { t: 'Horas trabajadas', num: 1, v: s => Math.round(s.min / 6) / 10, f: v => v ? v.toLocaleString('es-AR') : '' }
    ], S, { orden: 1, clase: 'compacta', hoja: 'Por sector', total: ['Total', T.vin, T.aus, T.sin, T.tar, T.ant, T.inc, (Math.round(T.min / 6) / 10).toLocaleString('es-AR')], vacio: 'Sin datos.' }) + '</section>' +
    '<div class="g2"><section><h2>Faltaron (' + aus.length + ')</h2>' + tabla('rj-aus', [cLeg, cPer, cSec,
      { t: 'Horas', num: 1, v: p => p.aus.min, f: v => hm(v) }, { t: 'Aviso o licencia', v: p => p.aviso || '', h: p => p.aviso ? '<span class="chip ok">' + esc(p.aviso) + '</span>' : '<span class="chip bad">Sin aviso</span>' }
    ], aus, { orden: 4, dir: 1, clase: 'compacta', click: abrirLeg, hoja: 'Faltaron', vacio: D.cargado.N ? 'No faltó nadie.' : 'Falta el reporte de ausencias.' }) + '</section>' +
    '<section><h2>Llegaron tarde (' + tar.length + ')</h2>' + tabla('rj-tar', [cLeg, cPer, cSec, { t: 'Entró', v: p => p.ent || '' }, { t: 'Tarde', num: 1, v: p => p.tarde, f: minTxt }],
      tar, { orden: 4, clase: 'compacta', click: abrirLeg, hoja: 'Llegaron tarde', vacio: D.cargado.N ? 'Nadie llegó tarde.' : 'Falta el reporte de ausencias y retrasos.' }) + '</section></div>' +
    '<div class="g2"><section><h2>Se fueron antes (' + ant.length + ')</h2>' + tabla('rj-ant', [cLeg, cPer, cSec, { t: 'Salió', v: p => p.sal || '' }, { t: 'Antes', num: 1, v: p => p.antes, f: minTxt }],
      ant, { orden: 4, clase: 'compacta', click: abrirLeg, hoja: 'Se fueron antes', limite: 15, vacio: 'Nadie.' }) + '</section>' +
    '<section><h2>Fichadas incompletas (' + inc.length + ')</h2>' + tabla('rj-inc', [cLeg, cPer, cSec, { t: 'Qué pasó', v: p => p.inc.join(' · ') }],
      inc, { orden: 2, dir: 1, clase: 'compacta', click: abrirLeg, hoja: 'Incompletas', vacio: 'Todas las entradas tienen su salida.' }) + '</section></div>' +
    (otras.length ? '<section><h2>Otras novedades</h2>' + tabla('rj-otr', [cLeg, cPer, cSec, { t: 'Novedad', v: p => p.nov.filter(n => !NOVS[n.nov]).map(n => n.nov + (n.min ? ' ' + hm(n.min) : '') + (n.con ? ' (' + n.con + ')' : '')).join(' · ') }], otras, { orden: 2, dir: 1, clase: 'compacta', click: abrirLeg, hoja: 'Otras' }) + '</section>' : '') +
    '<section><h2>Todos los que vinieron (' + vin.length + ')</h2>' + tabla('rj-tod', [cLeg, cPer, cSec, { t: 'Entrada', v: p => p.ent || '' }, { t: 'Salida', v: p => p.sal || '' },
      { t: 'Horas', num: 1, v: p => p.min, f: v => v ? hm(v) : '' }, { t: 'Reloj', v: p => p.reloj || '' },
      { t: 'Novedad', v: p => p.nov.map(n => (NOVS[n.nov] || n.nov) + (n.min ? ' ' + minTxt(n.min) : '')).join(' · ') }
    ], vin, { orden: 3, dir: 1, clase: 'compacta', click: abrirLeg, hoja: 'Vinieron', limite: 40, vacio: D.cargado.F ? 'Nadie fichó.' : 'Falta el reporte de fichadas.' }) + '</section>';
}
function rangoReloj(ult) {
  const r = UIR.rango, fin = ult || hoyISO();
  if (r === 'u7') return [sumDias(fin, -6), fin];
  if (r === 'u30') return [sumDias(fin, -29), fin];
  if (r === 'mes') return [iniMes(fin.slice(0, 7)), fin];
  if (r === 'mant') { const m = mesMas(fin.slice(0, 7), -1); return [iniMes(m), finMes(m)]; }
  if (r === 'u3') return [iniMes(mesMas(fin.slice(0, 7), -2)), fin];
  if (r === 'u12') return [iniMes(mesMas(fin.slice(0, 7), -11)), fin];
  if (r === 'otro' && UIR.d && UIR.h) return UIR.d <= UIR.h ? [UIR.d, UIR.h] : [UIR.h, UIR.d];
  return [sumDias(fin, -29), fin];
}
async function vRelojPer(meses, modo, subir) {
  const ult = meses.map(m => RJIDX[m].ult).filter(Boolean).sort().pop();
  const [a, b] = rangoReloj(ult);
  await relojRango(sumDias(a, -1), sumDias(b, 1));
  const fs = diasCon().filter(f => f >= a && f <= b);
  const P = {}, porDia = [];
  for (const f of fs) {
    const D = dia(f); let au = 0, ta = 0, vi = 0;
    for (const p of D.L) {
      const r = P[p.leg] = P[p.leg] || { leg: p.leg, c: p.c, sec: p.sec, dias: 0, min: 0, aus: 0, sin: 0, tar: 0, mtar: 0, ant: 0, mant: 0, inc: 0 };
      if (p.vino) { r.dias++; r.min += p.min; r.sec = p.sec; vi++; }
      if (p.aus) { r.aus++; au++; if (!p.aviso) r.sin++; }
      if (p.tarde) { r.tar++; r.mtar += p.tarde; ta++; }
      if (p.antes) { r.ant++; r.mant += p.antes; }
      if (p.inc.length) r.inc++;
    }
    porDia.push({ f, vi, au, ta });
  }
  const L = Object.values(P), T = L.reduce((t, r) => { for (const k in t) t[k] += r[k]; return t; }, { dias: 0, min: 0, aus: 0, sin: 0, tar: 0, mtar: 0, ant: 0, mant: 0, inc: 0 });
  const secs = {};
  for (const r of L) { const s = secs[r.sec] = secs[r.sec] || { sec: r.sec, per: 0, dias: 0, aus: 0, sin: 0, tar: 0, mtar: 0, ant: 0 }; s.per++; for (const k of ['dias', 'aus', 'sin', 'tar', 'mtar', 'ant']) s[k] += r[k]; }
  const op = [['u7', 'Últimos 7 días'], ['u30', 'Últimos 30 días'], ['mes', 'Este mes'], ['mant', 'Mes anterior'], ['u3', 'Últimos 3 meses'], ['u12', 'Últimos 12 meses'], ['otro', 'Desde / hasta…']];
  const sel = '<select id="rj-rango">' + op.map(o => '<option value="' + o[0] + '"' + (UIR.rango === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
    '<span id="rj-otro" style="display:' + (UIR.rango === 'otro' ? 'inline-flex' : 'none') + ';gap:6px;align-items:center"><input type="date" id="rj-d" value="' + (UIR.d || a) + '"> a <input type="date" id="rj-h" value="' + (UIR.h || b) + '"><button class="small" id="rj-ok">Ver</button></span>';
  const prom = v => fs.length ? (Math.round(v / fs.length * 10) / 10).toLocaleString('es-AR') : '0';
  return cab('Reloj · ' + fec(a) + ' al ' + fec(b), 'Suma de los ' + fs.length + ' días con datos del reloj en el período (hay desde el ' + fec(diasCon()[0] || a) + '). Clic en una persona para ver su historial día por día.', modo + sel + subir + botonXl('rj-pp,rj-ps,rj-pd', 'Reloj ' + a + ' a ' + b)) +
    '<div class="kpis">' + kpi('Días con datos', n0(fs.length), fec(a) + ' al ' + fec(b)) + kpi('Faltas', n0(T.aus), prom(T.aus) + ' por día · ' + T.sin + ' sin aviso', { warn: T.sin > 0 }) +
    kpi('Llegadas tarde', n0(T.tar), minTxt(T.mtar) + ' en total', { warn: T.tar > 0 }) + kpi('Salidas antes', n0(T.ant), minTxt(T.mant) + ' en total') + kpi('Fichadas incompletas', n0(T.inc)) + kpi('Horas trabajadas', n0(T.min / 60), n0(T.dias) + ' jornadas') + '</div>' +
    (porDia.length > 1 ? '<section><p class="graf-t">Faltas por día</p>' + graf(porDia.map(d => ({ k: d.f.slice(8) + '/' + d.f.slice(5, 7), v: d.au })), v => n0(v)) + '</section>' : '') +
    '<section><h2>Por persona</h2><p class="sub">Ordenado por faltas sin aviso. Las faltas con aviso son las que tienen concepto en CC-Cloud o vacaciones, licencia o suspensión cargadas.</p>' + tabla('rj-pp', [cLeg, cPer, cSec,
      { t: 'Días que vino', num: 1, v: r => r.dias }, { t: 'Faltas', num: 1, v: r => r.aus, f: v => v || '' }, { t: 'Sin aviso', num: 1, v: r => r.sin, h: r => r.sin ? '<b class="neg">' + r.sin + '</b>' : '' },
      { t: 'Llegadas tarde', num: 1, v: r => r.tar, f: v => v || '' }, { t: 'Tiempo tarde', num: 1, v: r => r.mtar, f: minTxt },
      { t: 'Salidas antes', num: 1, v: r => r.ant, f: v => v || '' }, { t: 'Tiempo antes', num: 1, v: r => r.mant, f: minTxt },
      { t: 'Incompletas', num: 1, v: r => r.inc, f: v => v || '' }, { t: 'Horas trabajadas', num: 1, v: r => Math.round(r.min / 6) / 10, f: v => v ? v.toLocaleString('es-AR') : '' }
    ], L, { orden: 5, limite: 60, clase: 'compacta', click: abrirLeg, hoja: 'Por persona', total: ['', 'Total', '', n0(T.dias), n0(T.aus), n0(T.sin), n0(T.tar), minTxt(T.mtar), n0(T.ant), minTxt(T.mant), n0(T.inc), n0(T.min / 60)], vacio: 'Sin datos en el período.' }) + '</section>' +
    '<div class="g2"><section><h2>Por sector</h2>' + tabla('rj-ps', [{ t: 'Sector', v: s => s.sec }, { t: 'Personas', num: 1, v: s => s.per }, { t: 'Jornadas', num: 1, v: s => s.dias },
      { t: 'Faltas', num: 1, v: s => s.aus }, { t: 'Sin aviso', num: 1, v: s => s.sin }, { t: 'Llegadas tarde', num: 1, v: s => s.tar }, { t: 'Tiempo tarde', num: 1, v: s => s.mtar, f: minTxt }, { t: 'Salidas antes', num: 1, v: s => s.ant }
    ], Object.values(secs), { orden: 3, clase: 'compacta', hoja: 'Por sector' }) + '</section>' +
    '<section><h2>Día por día</h2>' + tabla('rj-pd', [{ t: 'Fecha', v: d => d.f, f: v => diaSem(v) + ' ' + fec(v) }, { t: 'Vinieron', num: 1, v: d => d.vi }, { t: 'Faltaron', num: 1, v: d => d.au }, { t: 'Llegaron tarde', num: 1, v: d => d.ta }],
      porDia, { orden: 0, dir: -1, clase: 'compacta', click: d => { UIR.modo = 'dia'; UIR.dia = d.f; refrescar(); window.scrollTo(0, 0); }, hoja: 'Día por día' }) + '</section></div>';
}
function enganchesReloj() {
  const on = (id, ev, fn) => { const e = $(id); if (e) e[ev] = fn; };
  on('rj-up', 'onchange', e => { const fl = [...e.target.files]; e.target.value = ''; if (fl.length) subirExcelReloj(fl); });
  on('rj-m-dia', 'onclick', () => { UIR.modo = 'dia'; refrescar(); });
  on('rj-m-per', 'onclick', () => { UIR.modo = 'per'; refrescar(); });
  on('rj-dia', 'onchange', e => { if (e.target.value) { UIR.dia = e.target.value; refrescar(); } });
  const mover = n => { const l = diasCon(), f = $('rj-dia').value; const x = n < 0 ? l.filter(d => d < f).pop() : l.find(d => d > f); UIR.dia = x || sumDias(f, n); refrescar(); };
  on('rj-ant', 'onclick', () => mover(-1));
  on('rj-sig', 'onclick', () => mover(1));
  on('rj-rango', 'onchange', e => { if (e.target.value === 'otro') { $('rj-otro').style.display = 'inline-flex'; return; } UIR.rango = e.target.value; refrescar(); });
  on('rj-ok', 'onclick', () => { UIR.d = $('rj-d').value; UIR.h = $('rj-h').value; if (!UIR.d || !UIR.h) { toast('Elegí desde y hasta', true); return; } UIR.rango = 'otro'; refrescar(); });
}

/* ---------- ficha › Reloj: últimos 60 días de la persona ---------- */
async function fichaReloj(p) {
  const leg = String(p.legajo || '').trim();
  if (!leg) return '<p class="muted">Esta persona no tiene legajo: no se puede cruzar con el reloj.</p>';
  await relojIndice();
  const ult = Object.values(RJIDX || {}).map(x => x.ult).filter(Boolean).sort().pop();
  if (!ult) return '<p class="muted">Todavía no hay datos del reloj.</p>';
  const a = sumDias(ult, -59);
  await relojRango(sumDias(a, -1), sumDias(ult, 1));
  const fs = diasCon().filter(f => f >= a && f <= ult).reverse();
  const l = fs.map(f => ({ f, p: dia(f).L.find(x => x.leg === leg) }));
  const c = k => l.filter(x => x.p && k(x.p));
  const tard = c(x => x.tarde), aus = c(x => x.aus);
  return '<div class="kpis sm">' + kpi('Días que vino', c(x => x.vino).length, 'de ' + fs.length + ' con datos') + kpi('Faltas', aus.length, aus.filter(x => !x.p.aviso).length + ' sin aviso', { warn: aus.some(x => !x.p.aviso) }) +
    kpi('Llegadas tarde', tard.length, minTxt(tard.reduce((s, x) => s + x.p.tarde, 0)), { warn: tard.length > 0 }) + kpi('Salidas antes', c(x => x.antes).length) + kpi('Incompletas', c(x => x.inc.length).length) + '</div>' +
    '<table class="tb compacta"><thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th class="num">Horas</th><th>Novedad</th></tr></thead><tbody>' +
    l.map(({ f, p: x }) => '<tr><td>' + diaSem(f) + ' ' + fec(f) + '</td><td>' + (x && x.ent || '') + '</td><td>' + (x && x.sal || '') + '</td><td class="num">' + (x && x.min ? hm(x.min) : '') + '</td><td>' +
      (!x ? '<span class="muted">—</span>' : [x.aus ? (x.aviso ? '<span class="chip ok">Faltó · ' + esc(x.aviso) + '</span>' : '<span class="chip bad">Faltó sin aviso</span>') : '', x.tarde ? '<span class="chip warn">Tarde ' + minTxt(x.tarde) + '</span>' : '', x.antes ? '<span class="chip mut">Se fue ' + minTxt(x.antes) + ' antes</span>' : '', x.inc.length ? '<span class="chip warn">' + esc(x.inc.join(' · ')) + '</span>' : ''].filter(Boolean).join(' ')) +
      '</td></tr>').join('') + '</tbody></table><p class="mini muted">Últimos 60 días con datos del reloj CC-Cloud (legajo ' + esc(leg) + '). Un día sin renglón de esa persona es un franco o un día sin datos.</p>';
}
