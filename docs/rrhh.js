/* Centro RRHH · Frigorífico Qualitá (link /rrhh). Lo usan Gabi (gerente de RRHH) e Igna.
   Entran solo las cuentas de /rhusuarios (admin: true maneja los usuarios). Ni los editores de producción ni los usuarios
   de los otros centros (control-base.js con window.C3_COL = 'rhdocs').
   Datos en /rhdocs/{nombre} = { json, ver, por, ts } (cada cambio deja un renglón en /rhcambios):
     nomina       : { personas: { CUIL: { cuil, legajo, nombre, dni, nac, sexo, ingreso, egreso, motivo, obsBaja, sector, puesto,
                      categoria, convenio, jornada, basico, domicilio, tel, mail, obs, historial: [{ingreso, egreso, motivo}] } } }
     aus-AAAA     : { lista: [{ id, cuil, tipo, desde, hasta, periodo (vacaciones: año al que corresponden), cert, obs, por, ts }] }
                    (cada ausencia va en el año en que empieza)
     liq-AAAA-MM  : { mes, archivo, por, ts, filas: { CUIL: { nombre, legajo, rem, noRem, bruto, neto, aportes, contrib } } }
     liq-indice   : { meses: { 'AAAA-MM': { n, bruto, neto, contrib, archivo, por, ts } } }
     sis-nomina   : { txt, act } lo sube la notebook de Igna desde el sistema de sueldos (C:\InformeQualita\rrhh\rh_sync.ps1, tarea
                    "RRHH a la web" 7, 13 y 19 h; SUELDOS.EMPLEADOS, activos y bajas desde 2024). Renglones
                    E|legajo|cuil|apellido|nombre|sexo|nac|alta|baja|motivo baja|obs baja|sector|categoría|cargo|convenio|convencionado|calle|nro|piso|depto|cp|tel|cel|mail|horas
                    La nómina = lo del sistema (manda, no se edita acá) + lo cargado en la web para lo que el sistema no tiene.
   También se puede importar (Excel, CSV o TXT del sistema de sueldos o del F.931), uniendo por CUIL. */
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const TIPOS = {
  enf: 'Enfermedad', art: 'Accidente / ART', vac: 'Vacaciones', lic: 'Licencia especial', exa: 'Examen', mat: 'Maternidad / paternidad',
  per: 'Permiso con aviso', inj: 'Falta sin aviso', sus: 'Suspensión', otr: 'Otra'
};
const MOTIVOS_BAJA = ['Renuncia', 'Despido sin causa', 'Despido con causa', 'Período de prueba', 'Fin de contrato', 'Mutuo acuerdo', 'Jubilación', 'Abandono de trabajo', 'Fallecimiento', 'Otro'];
/* datos que tiene que tener cada legajo para estar completo */
const OBLIG = [['nombre', 'nombre'], ['cuil', 'CUIL'], ['nac', 'nacimiento'], ['ingreso', 'ingreso'], ['sector', 'sector'], ['puesto', 'puesto o categoría'], ['domicilio', 'domicilio'], ['tel', 'teléfono']];

/* ---------- formato ---------- */
const p2 = n => String(n).padStart(2, '0');
function n0(v) { return Math.round(+v || 0).toLocaleString('es-AR'); }
function pesos(v) { return '$ ' + n0(v); }
function pct(v, dec) { if (v == null || !isFinite(v)) return '—'; return v.toLocaleString('es-AR', { minimumFractionDigits: dec == null ? 1 : dec, maximumFractionDigits: dec == null ? 1 : dec }) + '%'; }
function fec(s) { if (!s) return ''; const p = String(s).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0].slice(2); }
function mesTxt(m) { return MESES[+m.slice(5, 7) - 1] + ' ' + m.slice(2, 4); }
function mesLargo(m) { return MESES_L[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4); }
function hoyISO() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 2800); }
function lindo(s) { s = String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); return s.replace(/(^|[\s(/.,'-])([a-záéíóúñü])/g, (a, b, c) => b + c.toUpperCase()).replace(/\b(Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii)\b/g, x => x.toUpperCase()); }
function abrev(v) { v = +v || 0; if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M'; if (Math.abs(v) >= 1e3) return Math.round(v / 1e3).toLocaleString('es-AR') + ' mil'; return n0(v); }
function sinAcentos(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

/* ---------- fechas (AAAA-MM-DD, en UTC para no tener corrimientos) ---------- */
function dDe(s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
function dISO(t) { const d = new Date(t); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); }
function sumDias(s, n) { return dISO(dDe(s) + n * 864e5); }
function corridos(a, b) { return a > b ? 0 : Math.round((dDe(b) - dDe(a)) / 864e5) + 1; }
/* días hábiles (lunes a viernes) entre a y b, ambos incluidos */
function habiles(a, b) {
  if (!a || !b || a > b) return 0;
  const n = corridos(a, b), w0 = new Date(dDe(a)).getUTCDay();
  let r = Math.floor(n / 7) * 5;
  for (let i = 0; i < n % 7; i++) { const w = (w0 + i) % 7; if (w !== 0 && w !== 6) r++; }
  return r;
}
function iniMes(m) { return m + '-01'; }
function finMes(m) { return dISO(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)); }
function mesMas(m, n) { let y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + n; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return y + '-' + p2(mo + 1); }
function aniosCompletos(a, b) { if (!a || !b || a > b) return 0; let y = +b.slice(0, 4) - +a.slice(0, 4); if (b.slice(5) < a.slice(5)) y--; return Math.max(0, y); }
function antigTxt(a, b) {
  if (!a || !b || a > b) return '—';
  let m = (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); if (+b.slice(8) < +a.slice(8)) m--;
  m = Math.max(0, m); const y = Math.floor(m / 12), r = m % 12;
  return y ? y + ' año' + (y > 1 ? 's' : '') + (r ? ' ' + r + ' m' : '') : r + ' mes' + (r !== 1 ? 'es' : '');
}
const maxF = (a, b) => (a > b ? a : b), minF = (a, b) => (a < b ? a : b);

/* ---------- CUIL ---------- */
function normCuil(s) { const d = String(s == null ? '' : s).replace(/\D/g, ''); return d.length === 11 ? d : ''; }
function cuilOk(c) {
  if (!/^\d{11}$/.test(c)) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < 10; i++) s += w[i] * +c[i];
  let v = 11 - (s % 11); if (v === 11) v = 0;
  return v !== 10 && v === +c[10];   // si da 10, ANSES cambia el prefijo a 23 y el CUIL que existe es otro
}
function fmtCuil(c) { return c && c.length === 11 ? c.slice(0, 2) + '-' + c.slice(2, 10) + '-' + c[10] : (c || ''); }

/* ---------- datos ---------- */
const N = {};            // nómina: CUIL → persona (lo del sistema + lo de la web)
let NOM_WEB = {};        // rhdocs/nomina.personas (lo cargado en la web)
let SIS = null;          // { act, n } datos del sistema de sueldos
/* une lo cargado en la web con lo del sistema de sueldos: lo del sistema manda (si trae el dato) */
function armarNomina(sisTxt) {
  for (const k in N) delete N[k];
  for (const c in NOM_WEB) N[c] = Object.assign({}, NOM_WEB[c], { sisK: null });
  if (sisTxt == null) return;
  const filas = [];
  let act = '';
  for (const l of String(sisTxt).replace(/^\uFEFF/, '').split('\n')) {
    const f = l.replace(/\r$/, '').split('|');
    if (f[0] === 'OK') act = f[1] || '';
    if (f[0] !== 'E') continue;
    const cuil = normCuil(f[2]); if (!cuil) continue;
    const t = s => String(s || '').trim();
    const dom = [t(f[16]), t(f[17]) && t(f[17]) !== '0' ? t(f[17]) : '', t(f[18]) && t(f[18]) !== '0' ? 'piso ' + t(f[18]) : '', t(f[19]) ? 'dto. ' + t(f[19]) : ''].filter(Boolean).join(' ') + (t(f[20]) ? ' (CP ' + t(f[20]) + ')' : '');
    filas.push({ cuil, legajo: t(f[1]), nombre: [t(f[3]), t(f[4])].filter(Boolean).join(', '), sexo: t(f[5]), nac: t(f[6]), ingreso: t(f[7]), egreso: t(f[8]),
      motivo: t(f[9]), obsBaja: t(f[10]), sector: t(f[11]), categoria: t(f[12]), puesto: t(f[13]), convenio: t(f[14]) + (f[15] === '0' && t(f[14]) ? ' (fuera de convenio)' : ''),
      domicilio: dom.trim(), tel: t(f[22]) || t(f[21]), mail: t(f[23]), jornada: +f[24] ? t(f[24]) + ' h por día' : '' });
  }
  /* un mismo CUIL dos veces (reingreso): vale el legajo activo o el de alta más nueva; el otro va a períodos anteriores */
  const porC = {};
  for (const x of filas) (porC[x.cuil] = porC[x.cuil] || []).push(x);
  for (const c in porC) {
    const l = porC[c].sort((a, b) => (!a.egreso) - (!b.egreso) || (a.ingreso < b.ingreso ? -1 : 1));
    const x = l[l.length - 1], p = N[c] = Object.assign({}, N[c] || {}, { cuil: c });
    const k = [];
    for (const campo of ['legajo', 'nombre', 'sexo', 'nac', 'ingreso', 'sector', 'categoria', 'puesto', 'convenio', 'domicilio', 'tel', 'mail', 'jornada']) if (x[campo]) { p[campo] = x[campo]; k.push(campo); }
    p.egreso = x.egreso; p.motivo = x.egreso ? (x.motivo || 'Según el sistema de sueldos') : ''; p.obsBaja = x.egreso ? x.obsBaja : '';
    if (!p.dni) p.dni = String(+c.slice(2, 10));
    p.historial = l.slice(0, -1).map(y => ({ ingreso: y.ingreso, egreso: y.egreso, motivo: y.motivo })).concat((p.historial || []).filter(h => !l.some(y => y.ingreso === h.ingreso)));
    p.sisK = new Set(k.concat(['cuil', 'dni']));
  }
  SIS = { act, n: filas.length, txt: sisTxt };
}
const AUS = {};          // año → lista de ausencias (null mientras no se leyó)
const LIQ = {};          // 'AAAA-MM' → documento de sueldos del mes
let IDX = {};            // liq-indice.meses
let TAB = 'resumen';
let fichaAbierta = null;   // CUIL de la ficha abierta (para las solapas del diálogo)
const UI = { buscar: '', sector: '', estado: 'act', mesAus: '', anioVac: '', finInd: '', ficha: 'datos' };
function guardarUI() { try { localStorage.setItem('rh-ui', JSON.stringify({ TAB, sector: UI.sector, estado: UI.estado })); } catch (e) {} }
function leerUI() { try { const x = JSON.parse(localStorage.getItem('rh-ui') || 'null'); if (x) { if (x.TAB) TAB = x.TAB; UI.sector = x.sector || ''; UI.estado = x.estado || 'act'; } } catch (e) {} }

const personas = () => Object.values(N);
const activo = (p, d) => !!p.ingreso && p.ingreso <= d && (!p.egreso || p.egreso > d);
const activos = d => personas().filter(p => activo(p, d || hoyISO()));
const nomDe = c => (N[c] && N[c].nombre) || fmtCuil(c);
const secDe = c => (N[c] && N[c].sector) || 'Sin sector';
const esAdmin = () => !!(C3API.rh && C3API.rh.admin);
function faltan(p) { return OBLIG.filter(([k]) => k === 'puesto' ? !(p.puesto || p.categoria) : k === 'cuil' ? !cuilOk(p.cuil) : !p[k]).map(x => x[1]); }
function sectores() { return [...new Set(personas().map(p => p.sector || 'Sin sector'))].sort((a, b) => a.localeCompare(b, 'es')); }
/* días hábiles en que la persona estuvo en la empresa dentro de [a, b] */
function habPersona(p, a, b) { if (!p.ingreso) return 0; const e = p.egreso ? p.egreso : b; return habiles(maxF(a, p.ingreso), minF(b, e)); }

async function leerAus(y) {
  y = String(y);
  if (AUS[y]) return AUS[y];
  const r = await C3API.leerDoc('aus-' + y);
  AUS[y] = Array.isArray(r.d.lista) ? r.d.lista : [];
  return AUS[y];
}
async function leerLiq(m) {
  if (LIQ[m] !== undefined) return LIQ[m];
  if (!IDX[m]) { LIQ[m] = null; return null; }
  const r = await C3API.leerDoc('liq-' + m);
  LIQ[m] = r.d && r.d.filas ? r.d : null;
  return LIQ[m];
}
/* todas las ausencias leídas que tocan el rango [a, b] */
function ausEn(a, b, cuil) {
  const r = [];
  for (const y in AUS) for (const x of AUS[y] || []) if (x.desde <= b && x.hasta >= a && (!cuil || x.cuil === cuil)) r.push(x);
  return r;
}
/* ausentismo: días hábiles de ausencia (sin vacaciones) sobre días hábiles de la dotación */
function ausentismo(a, b, filtro) {
  let perd = 0, disp = 0;
  const ps = personas().filter(p => !filtro || filtro(p));
  const set = new Set(ps.map(p => p.cuil));
  for (const p of ps) disp += habPersona(p, a, b);
  for (const x of ausEn(a, b)) if (x.tipo !== 'vac' && set.has(x.cuil)) perd += habiles(maxF(a, x.desde), minF(b, x.hasta));
  return { perd, disp, pct: disp ? perd / disp * 100 : null };
}

/* ---------- vacaciones (LCT art. 150, 151 y 153) ---------- */
function vacCorresponden(p, y) {
  const fin = y + '-12-31', ini = y + '-01-01';
  if (!p.ingreso || p.ingreso > fin) return { dias: 0, regla: 'Ingresó después del 31/12' };
  if (p.egreso && p.egreso < fin) return { dias: 0, regla: 'De baja antes del 31/12' };
  const trab = habiles(maxF(ini, p.ingreso), fin), mitad = habiles(ini, fin) / 2;
  if (trab < mitad) { const d = Math.floor(trab / 20); return { dias: d, regla: '1 día cada 20 trabajados (art. 153)' }; }
  const a = aniosCompletos(p.ingreso, fin);
  const d = a < 5 ? 14 : a < 10 ? 21 : a < 20 ? 28 : 35;
  return { dias: d, regla: d + ' días corridos (art. 150, ' + a + ' año' + (a !== 1 ? 's' : '') + ' de antigüedad)' };
}
function vacTomadas(cuil, y) {
  const r = [];
  for (const k in AUS) for (const x of AUS[k] || []) if (x.cuil === cuil && x.tipo === 'vac' && String(x.periodo || x.desde.slice(0, 4)) === String(y)) r.push(x);
  return r.sort((a, b) => a.desde < b.desde ? -1 : 1);
}

/* ---------- tablas (ordenables y para Excel) ---------- */
const TABLAS = {};
function tabla(id, cols, rows, opt) {
  opt = opt || {};
  const t = TABLAS[id] = TABLAS[id] || { orden: opt.orden != null ? opt.orden : null, dir: opt.dir || -1 };
  t.cols = cols; t.rows = rows; t.opt = opt;
  return '<div class="tw" id="tw-' + id + '">' + cuerpoTabla(id) + '</div>';
}
function cuerpoTabla(id) {
  const t = TABLAS[id], cols = t.cols;
  let rows = t.rows.slice();
  if (t.orden != null) { const c = cols[t.orden]; const val = r => c.v(r); rows.sort((a, b) => { const x = val(a), y = val(b); if ((x == null || x === '') && (y == null || y === '')) return 0; if (x == null || x === '') return 1; if (y == null || y === '') return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es')) * t.dir; }); }
  const lim = t.opt.limite && !t.todo ? t.opt.limite : Infinity, vis = rows.slice(0, lim);
  let h = '<table class="tb' + (t.opt.clase ? ' ' + t.opt.clase : '') + '"><thead><tr>' + cols.map((c, i) => '<th class="' + (c.num ? 'num' : '') + (i === t.orden ? ' ord' : '') + '" data-tb="' + id + '" data-col="' + i + '" title="Ordenar">' + c.t + (i === t.orden ? (t.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>').join('') + '</tr></thead><tbody>';
  if (!vis.length) h += '<tr><td colspan="' + cols.length + '" class="muted" style="text-align:center;padding:20px">' + (t.opt.vacio || 'No hay datos.') + '</td></tr>';
  vis.forEach(r => {
    const cl = [t.opt.click ? 'clic' : '', t.opt.fila ? t.opt.fila(r) : ''].filter(Boolean).join(' ');
    h += '<tr' + (cl ? ' class="' + cl + '"' : '') + (t.opt.click ? ' data-tb="' + id + '" data-row="' + rows.indexOf(r) + '"' : '') + '>' +
      cols.map(c => '<td class="' + (c.num ? 'num' : '') + (c.cls ? ' ' + c.cls : '') + '">' + (c.h ? c.h(r) : c.f ? c.f(c.v(r)) : esc(c.v(r))) + '</td>').join('') + '</tr>';
  });
  if (t.opt.total) h += '<tr class="tot">' + cols.map((c, i) => '<td class="' + (c.num ? 'num' : '') + '">' + (t.opt.total[i] != null ? t.opt.total[i] : '') + '</td>').join('') + '</tr>';
  h += '</tbody></table>';
  if (rows.length > lim) h += '<div class="mas"><button class="small" data-mas="' + id + '">Ver los ' + rows.length + ' renglones</button></div>';
  t.vistos = rows;
  return h;
}
function hojaDe(id) {
  const t = TABLAS[id]; const aoa = [t.cols.filter(c => c.t).map(c => c.t.replace(/<[^>]+>/g, ''))];
  for (const r of t.vistos || t.rows) aoa.push(t.cols.filter(c => c.t).map(c => { const v = c.x ? c.x(r) : c.v(r); return v == null ? '' : v; }));
  const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = t.cols.filter(c => c.t).map(c => ({ wch: c.num ? 14 : 28 }));
  return ws;
}
function excel(ids, nombre) {
  ids = String(ids).split(',');
  if (!window.XLSX || ids.some(i => !TABLAS[i])) { toast('No se pudo armar el Excel', true); return; }
  const wb = XLSX.utils.book_new();
  ids.forEach(i => XLSX.utils.book_append_sheet(wb, hojaDe(i), (TABLAS[i].opt.hoja || nombre || 'Datos').slice(0, 30)));
  XLSX.writeFile(wb, (nombre || 'RRHH') + ' ' + hoyISO() + '.xlsx');
}
function botonXl(ids, nom, txt) { return '<button class="small" data-xl="' + ids + '" data-nom="' + esc(nom) + '">⬇ ' + (txt || 'Excel') + '</button>'; }
function cab(t, sub, extra) { return '<div class="cab"><div><h2>' + t + '</h2>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div><div class="row">' + (extra || '') + '</div></div>'; }
function barra(v, max) { const w = max > 0 ? Math.max(1, Math.round(v / max * 100)) : 0; return '<span class="bar"><i style="width:' + w + '%"></i></span>'; }
function kpi(t, v, sub, opt) { opt = opt || {}; return '<div class="kpi' + (opt.warn ? ' warn' : '') + (opt.ir ? ' clic" data-ir="' + opt.ir : '') + '"><span>' + t + '</span><b>' + v + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }
/* gráfico de columnas simple: vals = [{k, v}] */
function graf(vals, fmt) {
  const W = 640, H = 190, pad = 22, n = vals.length || 1, bw = (W - 10) / n, max = Math.max(0, ...vals.map(x => +x.v || 0)) || 1;
  let s = '<svg class="graf" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><line class="ax" x1="0" x2="' + W + '" y1="' + (H - pad) + '" y2="' + (H - pad) + '"/>';
  vals.forEach((x, i) => {
    const v = +x.v || 0, h = Math.round(v / max * (H - pad - 20)), X = 5 + i * bw;
    s += '<g><title>' + esc(x.k + ': ' + fmt(v)) + '</title><rect class="col" x="' + (X + bw * .18) + '" y="' + (H - pad - h) + '" width="' + (bw * .64) + '" height="' + h + '" rx="2"/>' +
      (x.v != null ? '<text class="vl" x="' + (X + bw / 2) + '" y="' + (H - pad - h - 4) + '">' + esc(fmt(v)) + '</text>' : '') +
      '<text class="lb" x="' + (X + bw / 2) + '" y="' + (H - 6) + '">' + esc(x.k) + '</text></g>';
  });
  return '<div class="gw">' + s + '</svg></div>';
}

/* ---------- pantalla ---------- */
function refrescar() {
  guardarUI();
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.t === TAB));
  const f = { resumen: vResumen, nomina: vNomina, ausencias: vAusencias, vacaciones: vVacaciones, indicadores: vIndicadores, importar: vImportar, cambios: vCambios, usuarios: vUsuarios }[TAB] || vResumen;
  const r = f();
  if (r && r.then) { $('main').innerHTML = '<div class="cargando"><span class="spin"></span> Cargando…</div>'; r.then(h => { if (h != null) $('main').innerHTML = h; }, e => { console.error(e); $('main').innerHTML = '<section class="empty">No se pudo cargar (' + esc(e.message || e) + ').</section>'; }); }
  else $('main').innerHTML = r;
}
function irA(tab, ui) { if (ui) Object.assign(UI, ui); TAB = tab; cerrarDlg(); refrescar(); window.scrollTo(0, 0); }

/* ---------- Resumen ---------- */
function vResumen() {
  const hoy = hoyISO(), mes = hoy.slice(0, 7), act = activos(hoy);
  if (!personas().length) return cab('Resumen', '') + '<section class="empty">Todavía no hay personal cargado. Empezá por <a href="#" data-ir="importar">Importar</a> el Excel del sistema de sueldos o del F.931, o cargá a mano en <a href="#" data-ir="nomina">Nómina</a>.</section>';
  const altas = personas().filter(p => p.ingreso && p.ingreso.slice(0, 7) === mes), bajas = personas().filter(p => p.egreso && p.egreso.slice(0, 7) === mes);
  const ausHoy = ausEn(hoy, hoy).filter(x => N[x.cuil]), aMes = ausentismo(iniMes(mes), hoy);
  const ult = Object.keys(IDX).sort().pop(), li = ult ? IDX[ult] : null;
  const inc = act.filter(p => faltan(p).length);
  const porSec = {}; act.forEach(p => { const s = p.sector || 'Sin sector'; porSec[s] = (porSec[s] || 0) + 1; });
  const secs = Object.keys(porSec).map(k => ({ k, n: porSec[k] })), maxS = Math.max(0, ...secs.map(x => x.n));
  const cumple = act.filter(p => p.nac && p.nac.slice(5, 7) === hoy.slice(5, 7)).sort((a, b) => a.nac.slice(8) < b.nac.slice(8) ? -1 : 1);
  let h = cab('Resumen', 'Cómo está el personal hoy, ' + fec(hoy) + '.') +
    '<div class="kpis">' +
    kpi('Personal activo', n0(act.length), Object.keys(porSec).length + ' sectores', { ir: 'nomina' }) +
    kpi('Altas y bajas de ' + MESES_L[+mes.slice(5) - 1], '+' + altas.length + ' / −' + bajas.length, altas.length + ' ingresaron · ' + bajas.length + ' salieron') +
    kpi('Ausentes hoy', n0(ausHoy.length), ausHoy.filter(x => x.tipo === 'vac').length + ' de vacaciones', { warn: ausHoy.filter(x => x.tipo !== 'vac').length > 0, ir: 'ausencias' }) +
    kpi('Ausentismo del mes', pct(aMes.pct), aMes.perd + ' días hábiles perdidos (sin vacaciones)', { warn: aMes.pct > 5, ir: 'ausencias' }) +
    kpi('Masa salarial', li ? pesos(li.bruto) : '—', li ? mesLargo(ult) + (li.contrib ? ' · costo ' + pesos(li.bruto + li.contrib) : '') : 'sin sueldos importados', { ir: li ? 'indicadores' : 'importar' }) +
    kpi('Legajos incompletos', n0(inc.length), 'de ' + act.length + ' activos', { warn: inc.length > 0 }) +
    '</div><div class="g2">';
  h += '<section><h2>Ausentes hoy</h2>' + tabla('r-aus', [
    { t: 'Persona', v: x => nomDe(x.cuil) }, { t: 'Sector', v: x => secDe(x.cuil) }, { t: 'Motivo', v: x => TIPOS[x.tipo] || x.tipo },
    { t: 'Hasta', v: x => x.hasta, f: fec }
  ], ausHoy, { orden: 0, dir: 1, click: x => ficha(x.cuil, 'ausencias'), vacio: 'Hoy no falta nadie.' }) + '</section>';
  h += '<section><h2>Personal por sector</h2>' + tabla('r-sec', [
    { t: 'Sector', v: x => x.k }, { t: 'Personas', num: 1, v: x => x.n }, { t: '%', num: 1, v: x => act.length ? x.n / act.length * 100 : 0, f: v => pct(v, 0) },
    { t: '', v: x => x.n, h: x => barra(x.n, maxS), cls: 'bc', x: () => '' }
  ], secs, { orden: 1, click: x => irA('nomina', { sector: x.k, estado: 'act', buscar: '' }), total: ['Total', n0(act.length), '100%', ''] }) + '</section>';
  h += '<section><h2>Cumpleaños de ' + MESES_L[+mes.slice(5) - 1] + '</h2>' + tabla('r-cum', [
    { t: 'Día', v: p => +p.nac.slice(8), h: p => p.nac.slice(5) === hoy.slice(5) ? '<b>Hoy 🎂</b>' : fec(hoy.slice(0, 4) + p.nac.slice(4)).slice(0, 5) }, { t: 'Persona', v: p => p.nombre },
    { t: 'Sector', v: p => p.sector || '' }, { t: 'Cumple', num: 1, v: p => aniosCompletos(p.nac, hoy.slice(0, 4) + '-12-31') }
  ], cumple, { orden: 0, dir: 1, click: p => ficha(p.cuil), fila: p => p.nac.slice(5) === hoy.slice(5) ? 'hoy' : '', vacio: 'Nadie cumple este mes (o falta la fecha de nacimiento).' }) + '</section>';
  h += '<section><h2>Altas y bajas del mes</h2>' + tabla('r-ab', [
    { t: 'Persona', v: p => p.nombre }, { t: 'Sector', v: p => p.sector || '' },
    { t: 'Movimiento', v: p => p.egreso && p.egreso.slice(0, 7) === mes ? 'Baja' : 'Alta', h: p => p.egreso && p.egreso.slice(0, 7) === mes ? '<span class="chip bad">Baja</span> <small class="muted">' + esc(p.motivo || '') + '</small>' : '<span class="chip ok">Alta</span>' },
    { t: 'Fecha', v: p => p.egreso && p.egreso.slice(0, 7) === mes ? p.egreso : p.ingreso, f: fec }
  ], altas.concat(bajas.filter(p => altas.indexOf(p) < 0)), { orden: 3, click: p => ficha(p.cuil), vacio: 'Sin altas ni bajas este mes.' }) + '</section>';
  h += '</div><section><div class="cab"><div><h2>Legajos incompletos</h2><p class="sub">Personal activo al que le falta algún dato. Clic para completarlo.</p></div>' + botonXl('r-inc', 'Legajos incompletos') + '</div>' + tabla('r-inc', [
    { t: 'Legajo', v: p => p.legajo || '' }, { t: 'Persona', v: p => p.nombre || fmtCuil(p.cuil) }, { t: 'Sector', v: p => p.sector || '' },
    { t: 'Falta', v: p => faltan(p).join(', '), h: p => '<span class="falta">' + esc(faltan(p).join(', ')) + '</span>' }, { t: 'Datos que faltan', num: 1, v: p => faltan(p).length }
  ], inc, { orden: 4, limite: 15, click: p => ficha(p.cuil), hoja: 'Incompletos', vacio: 'Todos los legajos están completos.' }) + '</section>';
  return h;
}

/* ---------- Nómina ---------- */
function filtrarNomina() {
  const hoy = hoyISO(), b = sinAcentos(UI.buscar).trim();
  return personas().filter(p => {
    if (UI.estado === 'act' && !activo(p, hoy)) return false;
    if (UI.estado === 'baja' && activo(p, hoy)) return false;
    if (UI.sector && (p.sector || 'Sin sector') !== UI.sector) return false;
    if (b && !(sinAcentos(p.nombre).includes(b) || String(p.cuil).includes(b.replace(/\D/g, '') || '¬') || sinAcentos(p.legajo) === b || sinAcentos(p.puesto + ' ' + p.categoria).includes(b))) return false;
    return true;
  });
}
function vNomina() {
  const hoy = hoyISO(), l = filtrarNomina();
  setTimeout(() => {
    const bu = $('f-bus'); if (bu) bu.oninput = () => { UI.buscar = bu.value; $('tw-nom').outerHTML = tablaNomina(filtrarNomina()); const n = $('n-cant'); if (n) n.textContent = TABLAS.nom.rows.length; };
    const se = $('f-sec'); if (se) se.onchange = () => { UI.sector = se.value; refrescar(); };
    const es = $('f-est'); if (es) es.onchange = () => { UI.estado = es.value; refrescar(); };
  }, 0);
  return cab('Nómina', 'Todo el personal. Clic en una persona para ver su ficha (datos, ausencias, vacaciones y sueldos) o darla de baja.', '<button class="small primary" onclick="nuevaPersona()">+ Nueva persona</button>' + botonXl('nom', 'Nómina')) +
    '<div class="filt"><div><label>Buscar</label><input id="f-bus" class="bus" placeholder="Nombre, CUIL, legajo o puesto" value="' + esc(UI.buscar) + '"></div>' +
    '<div><label>Sector</label><select id="f-sec"><option value="">Todos</option>' + sectores().map(s => '<option' + (s === UI.sector ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select></div>' +
    '<div><label>Estado</label><select id="f-est"><option value="act"' + (UI.estado === 'act' ? ' selected' : '') + '>Activos</option><option value="baja"' + (UI.estado === 'baja' ? ' selected' : '') + '>De baja</option><option value="todos"' + (UI.estado === 'todos' ? ' selected' : '') + '>Todos</option></select></div>' +
    '<div class="muted" style="padding-bottom:6px"><b id="n-cant">' + l.length + '</b> personas</div></div>' +
    '<section>' + tablaNomina(l) + '</section>';
}
function tablaNomina(l) {
  const hoy = hoyISO();
  return tabla('nom', [
    { t: 'Legajo', num: 1, v: p => +p.legajo || p.legajo || '', x: p => p.legajo || '' }, { t: 'Apellido y nombre', v: p => p.nombre || '' },
    { t: 'CUIL', v: p => p.cuil, f: fmtCuil }, { t: 'Sector', v: p => p.sector || '' }, { t: 'Puesto / categoría', v: p => [p.puesto, p.categoria].filter(Boolean).join(' · ') },
    { t: 'Ingreso', v: p => p.ingreso || '', f: fec }, { t: 'Antigüedad', num: 1, v: p => p.ingreso ? corridos(p.ingreso, p.egreso && p.egreso < hoy ? p.egreso : hoy) : null, h: p => antigTxt(p.ingreso, p.egreso && p.egreso < hoy ? p.egreso : hoy), x: p => p.ingreso ? aniosCompletos(p.ingreso, hoy) : '' },
    { t: 'Edad', num: 1, v: p => p.nac ? aniosCompletos(p.nac, hoy) : null, f: v => v == null ? '' : v },
    { t: 'Básico', num: 1, v: p => +p.basico || null, f: v => v ? pesos(v) : '' },
    { t: 'Estado', v: p => activo(p, hoy) ? 'Activo' : 'Baja ' + fec(p.egreso), h: p => (activo(p, hoy) ? (p.ingreso > hoy ? '<span class="chip info">Ingresa ' + fec(p.ingreso) + '</span>' : '<span class="chip ok">Activo</span>') : '<span class="chip mut" title="' + esc(p.motivo || '') + '">Baja ' + fec(p.egreso) + '</span>') + (faltan(p).length ? ' <span class="chip warn" title="Falta: ' + esc(faltan(p).join(', ')) + '">incompleto</span>' : '') },
    { t: 'Motivo de baja', v: p => p.egreso ? p.motivo || '' : '', h: p => p.egreso ? '<small>' + esc(p.motivo || '') + '</small>' : '' }
  ], l, { orden: 1, dir: 1, limite: 300, clase: 'compacta', click: p => ficha(p.cuil), fila: p => activo(p, hoy) ? '' : 'baja', hoja: 'Nómina', vacio: 'No hay personas con estos filtros.' });
}

/* ---------- ficha de una persona ---------- */
const CAMPOS_FICHA = [
  ['nombre', 'Apellido y nombre', 'text'], ['cuil', 'CUIL', 'text'], ['legajo', 'Legajo', 'text'], ['dni', 'DNI', 'text'],
  ['nac', 'Fecha de nacimiento', 'date'], ['sexo', 'Sexo', 'sel:,F,M,X'], ['ingreso', 'Fecha de ingreso', 'date'], ['sector', 'Sector', 'list'],
  ['puesto', 'Puesto / tarea', 'text'], ['categoria', 'Categoría', 'text'], ['convenio', 'Convenio', 'text'], ['jornada', 'Jornada', 'text'],
  ['basico', 'Sueldo básico', 'number'], ['tel', 'Teléfono', 'text'], ['mail', 'Mail', 'text'], ['domicilio', 'Domicilio', 'text'],
  ['obs', 'Observaciones', 'area']
];
function inputCampo(k, tipo, v, bloq) {
  v = v == null ? '' : v;
  if (bloq) return '<input id="p-' + k + '" value="' + esc(tipo === 'date' ? fec(v) : tipo === 'number' ? pesos(v) : v) + '" disabled>';
  if (tipo === 'area') return '<textarea id="p-' + k + '" rows="2">' + esc(v) + '</textarea>';
  if (tipo.startsWith('sel:')) return '<select id="p-' + k + '">' + tipo.slice(4).split(',').map(o => '<option value="' + o + '"' + (o === v ? ' selected' : '') + '>' + (o || '—') + '</option>').join('') + '</select>';
  if (tipo === 'list') return '<input id="p-' + k + '" list="dl-sec" value="' + esc(v) + '"><datalist id="dl-sec">' + sectores().filter(s => s !== 'Sin sector').map(s => '<option value="' + esc(s) + '">').join('') + '</datalist>';
  return '<input id="p-' + k + '" type="' + tipo + '"' + (tipo === 'number' ? ' min="0" step="0.01"' : '') + ' value="' + esc(v) + '">';
}
function nuevaPersona() { UI.ficha = 'datos'; fichaDatos(null); }
window.nuevaPersona = nuevaPersona;
function ficha(cuil, sub) {
  const p = N[cuil]; if (!p) return;
  fichaAbierta = cuil; UI.ficha = sub || 'datos';
  const hoy = hoyISO();
  const tabs = [['datos', 'Datos'], ['ausencias', 'Ausencias'], ['vacaciones', 'Vacaciones'], ['sueldos', 'Sueldos']];
  const head = esc(p.nombre || fmtCuil(cuil)) + ' <small class="muted">· ' + fmtCuil(cuil) + (p.legajo ? ' · legajo ' + esc(p.legajo) : '') + '</small> ' + (activo(p, hoy) ? '<span class="chip ok">Activo</span>' : p.egreso ? '<span class="chip mut">Baja ' + fec(p.egreso) + '</span>' : '');
  const sub_ = '<div class="subt">' + tabs.map(t => '<button data-fi="' + t[0] + '" class="' + (t[0] === UI.ficha ? 'on' : '') + '">' + t[1] + '</button>').join('') + '</div>';
  if (UI.ficha === 'datos') return fichaDatos(p, head, sub_);
  const pie = UI.ficha === 'ausencias' ? '<button class="primary" onclick="dlgAusencia(null,\'' + cuil + '\')">+ Cargar ausencia</button>' : UI.ficha === 'vacaciones' ? '<button class="primary" onclick="dlgAusencia(null,\'' + cuil + '\',\'vac\')">+ Cargar vacaciones</button>' : '';
  abrirDlg(head, sub_ + '<div id="fi-b"><div class="cargando"><span class="spin"></span></div></div>', pie);
  const cuerpo = { ausencias: fichaAus, vacaciones: fichaVac, sueldos: fichaSueldos }[UI.ficha];
  Promise.resolve(cuerpo(p)).then(h => { const b = $('fi-b'); if (b) b.innerHTML = h; }, e => { const b = $('fi-b'); if (b) b.innerHTML = '<p class="muted">No se pudo cargar (' + esc(e.message || e) + ').</p>'; });
}
window.ficha = ficha;
function fichaDatos(p, head, sub_) {
  const nuevo = !p, x = p || {}, hoy = hoyISO();
  let h = (sub_ || '') + (nuevo ? '<p class="sub">Cargá los datos de la persona. El CUIL es obligatorio: con él se unen las ausencias y los sueldos que se importen.</p>' : '') +
    (!nuevo && faltan(x).length ? '<div class="aviso">Falta: <b>' + esc(faltan(x).join(', ')) + '</b>.</div>' : '') +
    (x.sisK ? '<p class="nota-ed" style="margin:0 0 10px">Los datos en gris vienen del <b>sistema de sueldos</b> (se actualizan solos a las 7, 13 y 19 h); se cambian allá. Acá se completa lo que el sistema no tiene.</p>' : '') +
    '<div class="ed-grid">' + CAMPOS_FICHA.map(([k, t, tipo]) => '<div class="' + (tipo === 'area' || k === 'domicilio' ? 'full' : '') + '"><label>' + t + (x.sisK && x.sisK.has(k) ? ' <small class="muted">· sistema</small>' : '') + '</label>' + inputCampo(k, tipo, k === 'cuil' ? fmtCuil(x.cuil) : x[k], x.sisK && x.sisK.has(k)) + '</div>').join('') + '</div>';
  if (!nuevo) {
    if (x.sisK) { if (x.egreso) h += '<div class="caja-baja"><b>De baja desde el ' + fec(x.egreso) + '</b> · ' + esc(x.motivo || '') + (x.obsBaja ? ' · ' + esc(x.obsBaja) : '') + ' <small class="muted">(según el sistema de sueldos)</small></div>'; }
    else if (activo(x, hoy) || (x.ingreso > hoy && !x.egreso)) h += '<div class="caja-baja"><b>Dar de baja</b><div class="row" style="margin-top:6px"><div><label>Fecha de egreso</label><input id="b-fec" type="date" value="' + hoy + '"></div><div><label>Motivo</label><select id="b-mot">' + MOTIVOS_BAJA.map(m => '<option>' + m + '</option>').join('') + '</select></div><div style="flex:1;min-width:160px"><label>Comentario</label><input id="b-obs" placeholder="Opcional"></div><button class="danger" onclick="darBaja(\'' + x.cuil + '\')">Dar de baja</button></div></div>';
    else if (x.egreso) h += '<div class="caja-baja"><b>De baja desde el ' + fec(x.egreso) + '</b> · ' + esc(x.motivo || 'sin motivo') + (x.obsBaja ? ' · ' + esc(x.obsBaja) : '') + '<div class="row" style="margin-top:6px"><div><label>Reingresa el</label><input id="r-fec" type="date" value="' + hoy + '"></div><button onclick="reincorporar(\'' + x.cuil + '\')">Reincorporar</button></div></div>';
    if ((x.historial || []).length) h += '<h3>Períodos anteriores</h3><table class="tb compacta"><thead><tr><th>Ingreso</th><th>Egreso</th><th>Motivo</th></tr></thead><tbody>' + x.historial.map(r => '<tr><td>' + fec(r.ingreso) + '</td><td>' + fec(r.egreso) + '</td><td>' + esc(r.motivo || '') + '</td></tr>').join('') + '</tbody></table>';
  }
  abrirDlg(head || 'Nueva persona', h, '<button class="primary" id="p-ok">' + (nuevo ? 'Agregar' : 'Guardar') + '</button>');
  $('p-ok').onclick = () => guardarPersona(p);
}
async function guardarPersona(p) {
  const v = {}; for (const [k, , tipo] of CAMPOS_FICHA) { const el = $('p-' + k); v[k] = el ? String(el.value).trim() : ''; if (tipo === 'number') v[k] = v[k] === '' ? '' : Math.round(parseFloat(v[k].replace(',', '.')) * 100) / 100 || 0; }
  const cuil = p && p.sisK ? p.cuil : normCuil(v.cuil);
  if (p && p.sisK) v.cuil = cuil;
  if (!v.nombre && !(p && p.sisK)) { toast('Falta el nombre', true); return; }
  if (!cuil) { toast('El CUIL tiene que tener 11 números', true); return; }
  if (!cuilOk(cuil) && !confirm('El CUIL ' + fmtCuil(cuil) + ' no da el dígito verificador. ¿Guardarlo igual?')) return;
  if ((!p || p.cuil !== cuil) && N[cuil]) { toast('Ya hay una persona con ese CUIL: ' + N[cuil].nombre, true); return; }
  v.cuil = cuil; if (!v.dni) v.dni = String(+cuil.slice(2, 10));
  const viejo = p ? p.cuil : null;
  if (p && p.sisK) for (const k of p.sisK) if (k !== 'cuil') delete v[k];
  const cambios = p ? CAMPOS_FICHA.filter(([k]) => k in v && k !== 'cuil' && String(p[k] == null ? '' : p[k]) !== String(v[k])).map(x => x[1]) : [];
  if (p && !cambios.length) { toast('No cambiaste nada'); return; }
  await guardarNomina(d => {
    const ant = viejo ? d.personas[viejo] || {} : {};
    if (viejo && viejo !== cuil) delete d.personas[viejo];
    d.personas[cuil] = Object.assign({}, ant, v, { act: new Date().toISOString(), por: C3API.usuario.nombre });
  }, p ? 'Ficha de ' + (v.nombre || p.nombre) + ': ' + cambios.join(', ') : 'Alta de ' + v.nombre + ' (' + fmtCuil(cuil) + ')' + (v.ingreso ? ', ingreso ' + fec(v.ingreso) : ''));
  if (viejo && viejo !== cuil) await moverCuil(viejo, cuil);
  toast(p ? 'Ficha guardada' : 'Persona agregada');
  ficha(cuil);
}
/* si se corrige el CUIL, las ausencias cargadas pasan al nuevo */
async function moverCuil(a, b) {
  for (const y in AUS) if ((AUS[y] || []).some(x => x.cuil === a)) await guardarAus(y, d => { d.lista.forEach(x => { if (x.cuil === a) x.cuil = b; }); }, 'CUIL corregido ' + fmtCuil(a) + ' → ' + fmtCuil(b));
}
async function guardarNomina(fn, desc) {
  try {
    const d = await C3API.cambiarDoc('nomina', d => { d.personas = d.personas || {}; fn(d); }, desc);
    NOM_WEB = (d && d.personas) || {}; armarNomina(SIS ? SIS.txt : null);
    if (TAB !== 'importar') refrescar();
    return d;
  } catch (e) { console.error(e); toast('No se pudo guardar: ' + (e.message || e), true); throw e; }
}
async function darBaja(cuil) {
  const f = $('b-fec').value, m = $('b-mot').value, o = $('b-obs').value.trim(), p = N[cuil];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) { toast('Poné la fecha de egreso', true); return; }
  if (p.ingreso && f < p.ingreso) { toast('La fecha de egreso es anterior al ingreso', true); return; }
  if (!confirm('¿Dar de baja a ' + p.nombre + ' el ' + fec(f) + ' (' + m + ')?')) return;
  await guardarNomina(d => { const x = d.personas[cuil]; x.egreso = f; x.motivo = m; x.obsBaja = o; x.act = new Date().toISOString(); x.por = C3API.usuario.nombre; }, 'Baja de ' + p.nombre + ' el ' + fec(f) + ': ' + m + (o ? ' (' + o + ')' : ''));
  toast('Baja registrada'); ficha(cuil);
}
async function reincorporar(cuil) {
  const f = $('r-fec').value, p = N[cuil];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || f <= p.egreso) { toast('La fecha de reingreso tiene que ser posterior al egreso', true); return; }
  await guardarNomina(d => { const x = d.personas[cuil]; x.historial = (x.historial || []).concat([{ ingreso: x.ingreso, egreso: x.egreso, motivo: x.motivo }]); x.ingreso = f; x.egreso = ''; x.motivo = ''; x.obsBaja = ''; }, 'Reingreso de ' + p.nombre + ' el ' + fec(f));
  toast('Reincorporado'); ficha(cuil);
}
window.darBaja = darBaja; window.reincorporar = reincorporar;

async function fichaAus(p) {
  const hoy = hoyISO(), y = +hoy.slice(0, 4);
  await Promise.all([leerAus(y), leerAus(y - 1)]);
  const l = ausEn('0000-01-01', '9999-12-31', p.cuil).sort((a, b) => a.desde < b.desde ? 1 : -1);
  const del = {}; for (const x of l) if (x.desde.slice(0, 4) === String(y)) { del[x.tipo] = (del[x.tipo] || 0) + corridos(x.desde, x.hasta); }
  const a12 = ausentismo(iniMes(mesMas(hoy.slice(0, 7), -11)), hoy, q => q.cuil === p.cuil);
  return '<div class="kpis sm">' + kpi('Ausentismo 12 meses', pct(a12.pct), a12.perd + ' días hábiles') + Object.keys(del).map(t => kpi(TIPOS[t] + ' ' + y, del[t] + ' días')).join('') + '</div>' +
    (l.length ? '<table class="tb compacta"><thead><tr><th>Motivo</th><th>Desde</th><th>Hasta</th><th class="num">Días</th><th class="num">Hábiles</th><th>Obs.</th><th></th></tr></thead><tbody>' +
      l.map(x => '<tr><td>' + esc(TIPOS[x.tipo] || x.tipo) + (x.tipo === 'vac' ? ' <small class="muted">(' + (x.periodo || x.desde.slice(0, 4)) + ')</small>' : '') + (x.cert ? ' <span class="chip info">certificado</span>' : '') + '</td><td>' + fec(x.desde) + '</td><td>' + fec(x.hasta) + '</td><td class="num">' + corridos(x.desde, x.hasta) + '</td><td class="num">' + habiles(x.desde, x.hasta) + '</td><td>' + esc(x.obs || '') + '</td><td><button class="small" onclick="dlgAusencia(\'' + x.id + '\')">Editar</button></td></tr>').join('') + '</tbody></table>'
      : '<p class="muted">No tiene ausencias cargadas en ' + (y - 1) + ' ni ' + y + '.</p>');
}
async function fichaVac(p) {
  const y = +hoyISO().slice(0, 4);
  await Promise.all([leerAus(y - 1), leerAus(y), leerAus(y + 1)]);
  return [y, y - 1].map(a => {
    const c = vacCorresponden(p, a), t = vacTomadas(p.cuil, a), tom = t.reduce((s, x) => s + corridos(x.desde, x.hasta), 0);
    return '<h3>Vacaciones ' + a + '</h3><div class="kpis sm">' + kpi('Corresponden', c.dias + ' días', esc(c.regla)) + kpi('Tomadas', tom + ' días') + kpi('Pendientes', (c.dias - tom) + ' días', '', { warn: c.dias - tom > 0 }) + '</div>' +
      (t.length ? '<table class="tb compacta"><tbody>' + t.map(x => '<tr><td>' + fec(x.desde) + ' a ' + fec(x.hasta) + '</td><td class="num">' + corridos(x.desde, x.hasta) + ' días</td><td>' + esc(x.obs || '') + '</td><td><button class="small" onclick="dlgAusencia(\'' + x.id + '\')">Editar</button></td></tr>').join('') + '</tbody></table>' : '');
  }).join('') + '<p class="nota-ed">Se cuentan en días corridos. Las vacaciones de cada año se toman entre el 1 de octubre y el 30 de abril siguiente (art. 154 LCT).</p>';
}
async function fichaSueldos(p) {
  const meses = Object.keys(IDX).sort().reverse().slice(0, 24);
  await Promise.all(meses.map(leerLiq));
  const l = meses.map(m => ({ m, f: LIQ[m] && LIQ[m].filas[p.cuil] })).filter(x => x.f);
  return '<div class="kpis sm">' + kpi('Sueldo básico (ficha)', p.basico ? pesos(p.basico) : '—') + (l[0] ? kpi('Último bruto', pesos(l[0].f.bruto), mesLargo(l[0].m)) + kpi('Último neto', l[0].f.neto ? pesos(l[0].f.neto) : '—') : '') + '</div>' +
    (l.length ? '<table class="tb compacta"><thead><tr><th>Mes</th><th class="num">Remunerativo</th><th class="num">No remun.</th><th class="num">Bruto</th><th class="num">Aportes</th><th class="num">Neto</th><th class="num">Contribuciones</th><th class="num">Costo</th></tr></thead><tbody>' +
      l.map(({ m, f }) => '<tr><td>' + mesLargo(m) + '</td><td class="num">' + (f.rem ? pesos(f.rem) : '') + '</td><td class="num">' + (f.noRem ? pesos(f.noRem) : '') + '</td><td class="num"><b>' + pesos(f.bruto) + '</b></td><td class="num">' + (f.aportes ? pesos(f.aportes) : '') + '</td><td class="num">' + (f.neto ? pesos(f.neto) : '') + '</td><td class="num">' + (f.contrib ? pesos(f.contrib) : '') + '</td><td class="num">' + pesos(f.bruto + (f.contrib || 0)) + '</td></tr>').join('') + '</tbody></table>'
      : '<p class="muted">No hay sueldos importados de esta persona. Se cargan desde la pestaña Importar.</p>');
}

/* ---------- Ausencias ---------- */
async function guardarAus(y, fn, desc) {
  y = String(y);
  try {
    const d = await C3API.cambiarDoc('aus-' + y, d => { d.lista = Array.isArray(d.lista) ? d.lista : []; fn(d); }, desc);
    AUS[y] = (d && d.lista) || [];
    return d;
  } catch (e) { console.error(e); toast('No se pudo guardar: ' + (e.message || e), true); throw e; }
}
function buscarAus(id) { for (const y in AUS) { const x = (AUS[y] || []).find(a => a.id === id); if (x) return x; } return null; }
function opcPersonas(sel) {
  const hoy = hoyISO();
  return '<option value="">Elegí…</option>' + personas().filter(p => activo(p, hoy) || p.cuil === sel || (p.egreso && p.egreso >= sumDias(hoy, -400)))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
    .map(p => '<option value="' + p.cuil + '"' + (p.cuil === sel ? ' selected' : '') + '>' + esc(p.nombre) + (activo(p, hoy) ? '' : ' (baja)') + '</option>').join('');
}
async function dlgAusencia(id, cuil, tipo) {
  const x = id ? buscarAus(id) : null, hoy = hoyISO();
  const v = x || { cuil: cuil || '', tipo: tipo || 'enf', desde: hoy, hasta: hoy, periodo: tipo === 'vac' ? (+hoy.slice(5, 7) <= 4 ? +hoy.slice(0, 4) - 1 : +hoy.slice(0, 4)) : '', obs: '', cert: false };
  const ys = [...new Set([+hoy.slice(0, 4) - 1, +hoy.slice(0, 4), +hoy.slice(0, 4) + 1, +(v.periodo || 0)])].filter(Boolean).sort();
  const h = '<div class="ed-grid">' +
    '<div class="full"><label>Persona</label><select id="a-cuil">' + opcPersonas(v.cuil) + '</select></div>' +
    '<div><label>Motivo</label><select id="a-tipo">' + Object.keys(TIPOS).map(k => '<option value="' + k + '"' + (k === v.tipo ? ' selected' : '') + '>' + TIPOS[k] + '</option>').join('') + '</select></div>' +
    '<div id="a-per-w"><label>Vacaciones del año</label><select id="a-per">' + ys.map(a => '<option' + (+a === +v.periodo ? ' selected' : '') + '>' + a + '</option>').join('') + '</select></div>' +
    '<div><label>Desde</label><input id="a-desde" type="date" value="' + v.desde + '"></div>' +
    '<div><label>Hasta (inclusive)</label><input id="a-hasta" type="date" value="' + v.hasta + '"></div>' +
    '<div><label>&nbsp;</label><label style="display:flex;gap:6px;align-items:center;text-transform:none;font-size:13.5px;color:var(--ink-2)"><input id="a-cert" type="checkbox"' + (v.cert ? ' checked' : '') + '> Presentó certificado</label></div>' +
    '<div><label>Días</label><div id="a-dias" style="padding-top:6px"></div></div>' +
    '<div class="full"><label>Observaciones</label><input id="a-obs" value="' + esc(v.obs || '') + '" placeholder="Diagnóstico, número de siniestro, etc."></div></div>';
  abrirDlg(x ? 'Editar ausencia' : (v.tipo === 'vac' ? 'Cargar vacaciones' : 'Cargar ausencia'), h,
    (x ? '<button class="danger" id="a-del">Borrar</button>' : '') + '<button class="primary" id="a-ok">Guardar</button>');
  const upd = () => {
    const d = $('a-desde').value, hh = $('a-hasta').value;
    $('a-per-w').style.visibility = $('a-tipo').value === 'vac' ? 'visible' : 'hidden';
    $('a-dias').innerHTML = d && hh && d <= hh ? '<b>' + corridos(d, hh) + '</b> corridos · ' + habiles(d, hh) + ' hábiles' : '<span class="neg">revisá las fechas</span>';
  };
  ['a-desde', 'a-hasta', 'a-tipo'].forEach(k => { $(k).onchange = upd; $(k).oninput = upd; }); upd();
  $('a-ok').onclick = async () => {
    const n = { cuil: $('a-cuil').value, tipo: $('a-tipo').value, desde: $('a-desde').value, hasta: $('a-hasta').value, cert: $('a-cert').checked, obs: $('a-obs').value.trim() };
    if (!n.cuil) { toast('Elegí la persona', true); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.desde) || !/^\d{4}-\d{2}-\d{2}$/.test(n.hasta) || n.hasta < n.desde) { toast('Revisá las fechas', true); return; }
    if (n.tipo === 'vac') n.periodo = +$('a-per').value;
    const sup = ausEn(n.desde, n.hasta, n.cuil).filter(a => !x || a.id !== x.id);
    if (sup.length && !confirm('Ya tiene cargado ' + (TIPOS[sup[0].tipo] || '') + ' del ' + fec(sup[0].desde) + ' al ' + fec(sup[0].hasta) + ' que se superpone. ¿Guardar igual?')) return;
    const yN = n.desde.slice(0, 4), yV = x ? x.desde.slice(0, 4) : null, quien = C3API.usuario.nombre, ts = new Date().toISOString();
    const desc = (x ? 'Ausencia cambiada: ' : 'Ausencia: ') + nomDe(n.cuil) + ' · ' + TIPOS[n.tipo] + (n.periodo ? ' ' + n.periodo : '') + ' del ' + fec(n.desde) + ' al ' + fec(n.hasta);
    await leerAus(yN);
    if (x && yV !== yN) await guardarAus(yV, d => { d.lista = d.lista.filter(a => a.id !== x.id); }, desc);
    await guardarAus(yN, d => {
      const i = x ? d.lista.findIndex(a => a.id === x.id) : -1;
      const o = Object.assign({ id: x ? x.id : Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, n, { por: quien, ts });
      if (n.tipo !== 'vac') delete o.periodo;
      if (i >= 0) d.lista[i] = o; else d.lista.push(o);
    }, desc);
    toast('Guardado'); cerrarDlg(); refrescar();
  };
  if (x) $('a-del').onclick = async () => {
    if (!confirm('¿Borrar esta ausencia?')) return;
    await guardarAus(x.desde.slice(0, 4), d => { d.lista = d.lista.filter(a => a.id !== x.id); }, 'Ausencia borrada: ' + nomDe(x.cuil) + ' · ' + TIPOS[x.tipo] + ' del ' + fec(x.desde) + ' al ' + fec(x.hasta));
    toast('Borrada'); cerrarDlg(); refrescar();
  };
}
window.dlgAusencia = dlgAusencia;

async function vAusencias() {
  const hoy = hoyISO(), m = UI.mesAus || hoy.slice(0, 7), y = +m.slice(0, 4);
  await Promise.all([leerAus(y), leerAus(y - 1)]);
  const a = iniMes(m), b = minF(finMes(m), m === hoy.slice(0, 7) ? hoy : finMes(m)), bF = finMes(m);
  const l = ausEn(a, bF).filter(x => N[x.cuil]);
  const as = ausentismo(a, b);
  const porT = {}; for (const x of l) { const t = porT[x.tipo] = porT[x.tipo] || { k: x.tipo, n: 0, cor: 0, hab: 0, pers: new Set() }; t.n++; t.cor += corridos(maxF(a, x.desde), minF(bF, x.hasta)); t.hab += habiles(maxF(a, x.desde), minF(bF, x.hasta)); t.pers.add(x.cuil); }
  const porS = {}; for (const s of sectores()) { const r = ausentismo(a, b, p => (p.sector || 'Sin sector') === s); if (r.disp) porS[s] = Object.assign({ k: s }, r); }
  setTimeout(() => { const el = $('f-mes'); if (el) el.onchange = () => { if (el.value) { UI.mesAus = el.value; refrescar(); } }; }, 0);
  return cab('Ausencias de ' + mesLargo(m), 'Faltas, licencias y vacaciones del mes. El <b>ausentismo</b> son los días hábiles (lunes a viernes) perdidos sin contar vacaciones, sobre los días hábiles de toda la dotación' + (m === hoy.slice(0, 7) ? ' hasta hoy' : '') + '.',
    '<input id="f-mes" type="month" value="' + m + '"><button class="small primary" onclick="dlgAusencia()">+ Cargar ausencia</button>' + botonXl('aus,aus-t,aus-s', 'Ausencias ' + m)) +
    '<div class="kpis">' + kpi('Ausentismo', pct(as.pct), as.perd + ' de ' + n0(as.disp) + ' días hábiles', { warn: as.pct > 5 }) +
    kpi('Personas con ausencias', new Set(l.filter(x => x.tipo !== 'vac').map(x => x.cuil)).size) +
    kpi('Enfermedad y ART', (porT.enf ? porT.enf.hab : 0) + (porT.art ? porT.art.hab : 0) + ' días', 'hábiles') +
    kpi('Faltas sin aviso', porT.inj ? porT.inj.hab + ' días' : '0', porT.inj ? porT.inj.pers.size + ' personas' : '', { warn: !!porT.inj }) +
    kpi('Vacaciones', porT.vac ? porT.vac.cor + ' días' : '0', porT.vac ? porT.vac.pers.size + ' personas' : '') + '</div>' +
    '<section>' + tabla('aus', [
      { t: 'Persona', v: x => nomDe(x.cuil) }, { t: 'Sector', v: x => secDe(x.cuil) },
      { t: 'Motivo', v: x => TIPOS[x.tipo] || x.tipo, h: x => esc(TIPOS[x.tipo] || x.tipo) + (x.cert ? ' <span class="chip info">cert.</span>' : '') },
      { t: 'Desde', v: x => x.desde, f: fec }, { t: 'Hasta', v: x => x.hasta, f: fec },
      { t: 'Días', num: 1, v: x => corridos(x.desde, x.hasta) }, { t: 'Hábiles en el mes', num: 1, v: x => habiles(maxF(a, x.desde), minF(bF, x.hasta)) },
      { t: 'Obs.', v: x => x.obs || '' }, { t: 'Cargó', v: x => x.por || '' }
    ], l, { orden: 3, clase: 'compacta', click: x => dlgAusencia(x.id), hoja: 'Ausencias', vacio: 'No hay ausencias cargadas en el mes.' }) + '</section>' +
    '<div class="g2"><section><h2>Por motivo</h2>' + tabla('aus-t', [
      { t: 'Motivo', v: x => TIPOS[x.k] || x.k }, { t: 'Casos', num: 1, v: x => x.n }, { t: 'Personas', num: 1, v: x => x.pers.size },
      { t: 'Días', num: 1, v: x => x.cor }, { t: 'Hábiles', num: 1, v: x => x.hab }
    ], Object.values(porT), { orden: 4, hoja: 'Por motivo' }) + '</section>' +
    '<section><h2>Ausentismo por sector</h2>' + tabla('aus-s', [
      { t: 'Sector', v: x => x.k }, { t: 'Días perdidos', num: 1, v: x => x.perd }, { t: 'Ausentismo', num: 1, v: x => x.pct, f: v => pct(v) },
      { t: '', v: x => x.pct, h: x => barra(x.pct || 0, Math.max(...Object.values(porS).map(s => s.pct || 0))), cls: 'bc', x: () => '' }
    ], Object.values(porS), { orden: 2, hoja: 'Por sector' }) + '</section></div>';
}

/* ---------- Vacaciones ---------- */
async function vVacaciones() {
  const hoy = hoyISO(), y = +(UI.anioVac || (+hoy.slice(5, 7) <= 4 ? +hoy.slice(0, 4) - 1 : +hoy.slice(0, 4)));
  await Promise.all([leerAus(y), leerAus(y + 1)]);
  const l = personas().filter(p => p.ingreso && p.ingreso <= y + '-12-31' && (!p.egreso || p.egreso >= y + '-12-31')).map(p => {
    const c = vacCorresponden(p, y), t = vacTomadas(p.cuil, y), tom = t.reduce((s, x) => s + corridos(x.desde, x.hasta), 0);
    return { p, c, t, tom, pend: c.dias - tom };
  });
  const tot = l.reduce((s, x) => ({ c: s.c + x.c.dias, t: s.t + x.tom, pe: s.pe + Math.max(0, x.pend) }), { c: 0, t: 0, pe: 0 });
  const anios = []; for (let a = +hoy.slice(0, 4) + 1; a >= +hoy.slice(0, 4) - 3; a--) anios.push(a);
  setTimeout(() => { const el = $('f-anio'); if (el) el.onchange = () => { UI.anioVac = el.value; refrescar(); }; }, 0);
  return cab('Vacaciones ' + y, 'Lo que corresponde a cada uno según la <b>antigüedad al 31/12/' + y + '</b> (art. 150 LCT: hasta 5 años 14 días, de 5 a 10 años 21, de 10 a 20 años 28 y más de 20 años 35, en días corridos). Quien no trabajó la mitad de los días hábiles del año tiene 1 día cada 20 trabajados (art. 153). Se toman entre el 1/10/' + y + ' y el 30/4/' + (y + 1) + '. Clic en una persona para cargarle vacaciones.',
    '<select id="f-anio">' + anios.map(a => '<option' + (a === y ? ' selected' : '') + '>' + a + '</option>').join('') + '</select>' + botonXl('vac', 'Vacaciones ' + y)) +
    '<div class="kpis">' + kpi('Personas', n0(l.length)) + kpi('Días que corresponden', n0(tot.c)) + kpi('Días tomados', n0(tot.t), tot.c ? pct(tot.t / tot.c * 100, 0) + ' del total' : '') +
    kpi('Días pendientes', n0(tot.pe), l.filter(x => x.pend > 0).length + ' personas con días por tomar', { warn: tot.pe > 0 }) + '</div>' +
    '<section>' + tabla('vac', [
      { t: 'Legajo', num: 1, v: x => +x.p.legajo || x.p.legajo || '', x: x => x.p.legajo || '' }, { t: 'Persona', v: x => x.p.nombre }, { t: 'Sector', v: x => x.p.sector || '' },
      { t: 'Ingreso', v: x => x.p.ingreso, f: fec }, { t: 'Antigüedad al 31/12', num: 1, v: x => aniosCompletos(x.p.ingreso, y + '-12-31'), f: v => v + ' años' },
      { t: 'Corresponden', num: 1, v: x => x.c.dias, h: x => '<span title="' + esc(x.c.regla) + '">' + x.c.dias + '</span>' },
      { t: 'Tomadas', num: 1, v: x => x.tom }, { t: 'Pendientes', num: 1, v: x => x.pend, h: x => x.pend > 0 ? '<span class="chip warn">' + x.pend + '</span>' : x.pend < 0 ? '<span class="chip bad" title="Tomó más de lo que corresponde">' + x.pend + '</span>' : '<span class="chip ok">0</span>' },
      { t: 'Fechas', v: x => x.t.map(a => fec(a.desde) + ' a ' + fec(a.hasta)).join(', '), h: x => '<small>' + x.t.map(a => fec(a.desde) + '–' + fec(a.hasta)).join(', ') + '</small>' }
    ], l, { orden: 1, dir: 1, clase: 'compacta', click: x => vacPersona(x.p.cuil, y), hoja: 'Vacaciones ' + y, vacio: 'No hay personal para ese año.' }) + '</section>';
}
function vacPersona(cuil, y) { dlgAusencia(null, cuil, 'vac').then(() => { const s = $('a-per'); if (s) { if (![...s.options].some(o => +o.value === y)) s.add(new Option(y, y)); s.value = String(y); } }); }

/* ---------- Indicadores ---------- */
async function vIndicadores() {
  const hoy = hoyISO(), fin = UI.finInd || hoy.slice(0, 7), y = +fin.slice(0, 4);
  await Promise.all([leerAus(y), leerAus(y - 1)]);
  const meses = []; for (let i = 11; i >= 0; i--) meses.push(mesMas(fin, -i));
  const ps = personas();
  const filas = meses.map(m => {
    const a = iniMes(m), b = m === hoy.slice(0, 7) ? hoy : finMes(m), bF = finMes(m);
    const dot = ps.filter(p => activo(p, b)).length, dotIni = ps.filter(p => activo(p, sumDias(a, -1))).length;
    const altas = ps.filter(p => p.ingreso && p.ingreso.slice(0, 7) === m).length + ps.reduce((s, p) => s + (p.historial || []).filter(r => r.ingreso && r.ingreso.slice(0, 7) === m).length, 0);
    const bajas = ps.filter(p => p.egreso && p.egreso.slice(0, 7) === m).length + ps.reduce((s, p) => s + (p.historial || []).filter(r => r.egreso && r.egreso.slice(0, 7) === m).length, 0);
    const prom = (dot + dotIni) / 2, au = b >= a ? ausentismo(a, b) : { pct: null }, li = IDX[m];
    return { m, dot, prom, altas, bajas, rot: prom ? bajas / prom * 100 : null, aus: au.pct, masa: li ? li.bruto : null, costo: li ? li.bruto + (li.contrib || 0) : null, conContrib: !!(li && li.contrib), porEmp: li && dot ? (li.bruto + (li.contrib || 0)) / dot : null, futuro: a > hoy };
  }).filter(f => !f.futuro);
  const ult = filas[filas.length - 1] || {}, ini12 = iniMes(meses[0]), fin12 = minF(finMes(fin), hoy);
  const bajas12 = filas.reduce((s, f) => s + f.bajas, 0), prom12 = filas.reduce((s, f) => s + f.prom, 0) / (filas.length || 1);
  const act = activos(fin12);
  const rango = (v, lim, txt) => { for (let i = 0; i < lim.length; i++) if (v < lim[i]) return txt[i]; return txt[txt.length - 1]; };
  const corte = (key, orden) => {
    const g = {};
    for (const p of act) { const k = key(p); if (k == null) continue; const x = g[k] = g[k] || { k, n: 0, ant: 0, edad: 0, nEd: 0, bajas: 0, ps: [] }; x.n++; x.ant += corridos(p.ingreso, fin12) / 365.25; if (p.nac) { x.edad += aniosCompletos(p.nac, fin12); x.nEd++; } x.ps.push(p); }
    for (const p of ps) if (p.egreso && p.egreso >= ini12 && p.egreso <= fin12) { const k = key(Object.assign({}, p, { _baja: 1 })); if (k == null) continue; const x = g[k] = g[k] || { k, n: 0, ant: 0, edad: 0, nEd: 0, bajas: 0, ps: [] }; x.bajas++; }
    const l = Object.values(g); l.forEach(x => { x.antP = x.n ? x.ant / x.n : null; x.edadP = x.nEd ? x.edad / x.nEd : null; }); return orden ? l.sort(orden) : l;
  };
  const ANT_L = [1, 5, 10, 20], ANT_T = ['Menos de 1 año', '1 a 5 años', '5 a 10 años', '10 a 20 años', 'Más de 20 años'];
  const ED_L = [25, 35, 45, 55], ED_T = ['Menos de 25', '25 a 34', '35 a 44', '45 a 54', '55 o más'];
  const porSec = corte(p => p.sector || 'Sin sector');
  porSec.forEach(x => { const r = ausentismo(ini12, fin12, p => (p.sector || 'Sin sector') === x.k); x.aus = r.pct; x.rot = x.n ? x.bajas / x.n * 100 : null; });
  const porAnt = corte(p => rango(corridos(p.ingreso, p._baja ? p.egreso : fin12) / 365.25, ANT_L, ANT_T), (a, b) => ANT_T.indexOf(a.k) - ANT_T.indexOf(b.k));
  const porEd = corte(p => p.nac ? rango(aniosCompletos(p.nac, p._baja ? p.egreso : fin12), ED_L, ED_T) : 'Sin fecha de nacimiento', (a, b) => (ED_T.indexOf(a.k) + 99) % 99 - (ED_T.indexOf(b.k) + 99) % 99);
  const maxN = Math.max(0, ...act.length ? [act.length] : [0]);
  const ultLiq = Object.keys(IDX).filter(m => m <= fin).sort().pop();
  if (ultLiq) await leerLiq(ultLiq);
  const masaSec = {}; if (ultLiq && LIQ[ultLiq]) for (const c in LIQ[ultLiq].filas) { const s = secDe(c); masaSec[s] = (masaSec[s] || 0) + (LIQ[ultLiq].filas[c].bruto || 0); }
  porSec.forEach(x => { x.masa = masaSec[x.k] || null; });
  setTimeout(() => { const el = $('f-fin'); if (el) el.onchange = () => { if (el.value) { UI.finInd = el.value; refrescar(); } }; }, 0);
  const sinC = filas.some(f => f.masa != null && !f.conContrib);
  return cab('Indicadores', 'Los últimos 12 meses hasta ' + mesLargo(fin) + '. <b>Rotación</b>: bajas del mes sobre la dotación promedio. <b>Ausentismo</b>: días hábiles perdidos sin vacaciones. <b>Masa salarial</b>: bruto total de los sueldos importados; <b>costo laboral</b>: bruto + contribuciones patronales.',
    '<input id="f-fin" type="month" value="' + fin + '">' + botonXl('ind,ind-sec,ind-ant,ind-ed', 'Indicadores RRHH ' + fin, 'Excel con todo')) +
    '<div class="kpis">' + kpi('Dotación', n0(ult.dot), 'al cierre de ' + mesTxt(fin)) + kpi('Altas / bajas 12 meses', '+' + filas.reduce((s, f) => s + f.altas, 0) + ' / −' + bajas12) +
    kpi('Rotación anual', pct(prom12 ? bajas12 / prom12 * 100 : null), 'bajas 12 meses / dotación promedio') +
    kpi('Ausentismo 12 meses', pct(ausentismo(ini12, fin12).pct)) +
    kpi('Masa salarial', ult.masa != null ? pesos(ult.masa) : '—', ult.masa != null ? mesTxt(fin) : 'sin sueldos de ' + mesTxt(fin)) +
    kpi('Costo por empleado', ult.porEmp != null ? pesos(ult.porEmp) : '—', ult.porEmp != null ? (ult.conContrib ? 'bruto + contribuciones' : 'solo bruto (sin contribuciones)') : '') + '</div>' +
    (sinC ? '<div class="aviso">Hay meses sin contribuciones patronales: ahí el costo laboral es solo el bruto. Se completan importando el F.931 con la columna de contribuciones.</div>' : '') +
    '<div class="g2"><section><p class="graf-t">Dotación al cierre</p>' + graf(filas.map(f => ({ k: mesTxt(f.m), v: f.dot })), n0) + '</section>' +
    '<section><p class="graf-t">Ausentismo (%)</p>' + graf(filas.map(f => ({ k: mesTxt(f.m), v: f.aus == null ? null : Math.round(f.aus * 10) / 10 })), v => pct(v)) + '</section>' +
    '<section><p class="graf-t">Rotación (%)</p>' + graf(filas.map(f => ({ k: mesTxt(f.m), v: f.rot == null ? null : Math.round(f.rot * 10) / 10 })), v => pct(v)) + '</section>' +
    '<section><p class="graf-t">Masa salarial</p>' + graf(filas.map(f => ({ k: mesTxt(f.m), v: f.masa })), abrev) + '</section></div>' +
    '<section><h2>Mes a mes</h2>' + tabla('ind', [
      { t: 'Mes', v: f => f.m, f: mesTxt }, { t: 'Dotación', num: 1, v: f => f.dot }, { t: 'Altas', num: 1, v: f => f.altas }, { t: 'Bajas', num: 1, v: f => f.bajas },
      { t: 'Rotación', num: 1, v: f => f.rot, f: v => pct(v), x: f => f.rot == null ? '' : Math.round(f.rot * 100) / 100 },
      { t: 'Ausentismo', num: 1, v: f => f.aus, f: v => pct(v), x: f => f.aus == null ? '' : Math.round(f.aus * 100) / 100 },
      { t: 'Masa salarial', num: 1, v: f => f.masa, f: v => v == null ? '—' : pesos(v) }, { t: 'Costo laboral', num: 1, v: f => f.costo, h: f => f.costo == null ? '—' : pesos(f.costo) + (f.conContrib ? '' : ' <small class="muted">*</small>'), x: f => f.costo == null ? '' : Math.round(f.costo) },
      { t: 'Costo por empleado', num: 1, v: f => f.porEmp, f: v => v == null ? '—' : pesos(v) }
    ], filas, { orden: 0, dir: 1, hoja: 'Mes a mes' }) + (sinC ? '<p class="mini muted">* Sin contribuciones patronales: solo el bruto.</p>' : '') + '</section>' +
    '<section><h2>Por sector</h2><p class="sub">Personal activo al ' + fec(fin12) + '; bajas, rotación y ausentismo de los últimos 12 meses; masa salarial de ' + (ultLiq ? mesLargo(ultLiq) : '—') + '.</p>' + tabla('ind-sec', [
      { t: 'Sector', v: x => x.k }, { t: 'Personas', num: 1, v: x => x.n }, { t: '%', num: 1, v: x => act.length ? x.n / act.length * 100 : 0, f: v => pct(v, 0) },
      { t: 'Antigüedad prom.', num: 1, v: x => x.antP, f: v => v == null ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' años' },
      { t: 'Edad prom.', num: 1, v: x => x.edadP, f: v => v == null ? '—' : Math.round(v) + ' años' },
      { t: 'Bajas 12 m', num: 1, v: x => x.bajas }, { t: 'Rotación', num: 1, v: x => x.rot, f: v => pct(v) }, { t: 'Ausentismo', num: 1, v: x => x.aus, f: v => pct(v) },
      { t: 'Masa salarial', num: 1, v: x => x.masa, f: v => v == null ? '—' : pesos(v) }
    ], porSec, { orden: 1, click: x => irA('nomina', { sector: x.k, estado: 'act', buscar: '' }), hoja: 'Por sector', total: ['Total', n0(act.length), '100%', '', '', String(porSec.reduce((s, x) => s + x.bajas, 0)), '', '', ''] }) + '</section>' +
    '<div class="g2"><section><h2>Por antigüedad</h2>' + tabla('ind-ant', [
      { t: 'Antigüedad', v: x => x.k }, { t: 'Personas', num: 1, v: x => x.n }, { t: '%', num: 1, v: x => act.length ? x.n / act.length * 100 : 0, f: v => pct(v, 0) },
      { t: '', v: x => x.n, h: x => barra(x.n, maxN), cls: 'bc', x: () => '' }, { t: 'Bajas 12 m', num: 1, v: x => x.bajas }
    ], porAnt, { hoja: 'Por antigüedad' }) + '<p class="mini muted">Las bajas se cuentan por la antigüedad que tenían al irse.</p></section>' +
    '<section><h2>Por edad</h2>' + tabla('ind-ed', [
      { t: 'Edad', v: x => x.k }, { t: 'Personas', num: 1, v: x => x.n }, { t: '%', num: 1, v: x => act.length ? x.n / act.length * 100 : 0, f: v => pct(v, 0) },
      { t: '', v: x => x.n, h: x => barra(x.n, maxN), cls: 'bc', x: () => '' }, { t: 'Bajas 12 m', num: 1, v: x => x.bajas }
    ], porEd, { hoja: 'Por edad' }) + '</section></div>';
}

/* ---------- Importar (Excel, CSV o TXT del sistema de sueldos o del F.931) ---------- */
const CAMPOS_IMP = [
  { k: 'cuil', t: 'CUIL', re: /cuil|cuit/ },
  { k: 'legajo', t: 'Legajo', re: /legajo|^leg\.?$|nro\.? ?(de )?emp|^n.? ?empleado/ },
  { k: 'apellido', t: 'Apellido (si viene aparte)', re: /^apellidos?$/ },
  { k: 'nombre', t: 'Apellido y nombre', re: /apellido.*nombre|nombre.*apellido|^nombres?$|empleado|agente|^razon social/ },
  { k: 'nac', t: 'Fecha de nacimiento', re: /nacim|^f\.? ?nac|fecha nac/ },
  { k: 'ingreso', t: 'Fecha de ingreso', re: /ingreso|fecha (de )?alta|^alta$|antiguedad/ },
  { k: 'egreso', t: 'Fecha de egreso', re: /egreso|fecha (de )?baja|^baja$/ },
  { k: 'sector', t: 'Sector', re: /sector|seccion|depto|departamento|^area|centro de costo/ },
  { k: 'puesto', t: 'Puesto / tarea', re: /puesto|tarea|funcion|ocupacion/ },
  { k: 'categoria', t: 'Categoría', re: /categ/ },
  { k: 'convenio', t: 'Convenio', re: /convenio|cct/ },
  { k: 'basico', t: 'Sueldo básico', re: /basico/, num: 1 },
  { k: 'sexo', t: 'Sexo', re: /^sexo|genero/ },
  { k: 'domicilio', t: 'Domicilio', re: /domicilio|direccion|calle/ },
  { k: 'tel', t: 'Teléfono', re: /telefono|^tel\.?$|celular|movil/ },
  { k: 'mail', t: 'Mail', re: /mail|correo/ },
  { k: 'noRem', t: 'No remunerativo', re: /no ?remun|no ?rem\.?$/, imp: 1 },
  { k: 'rem', t: 'Remunerativo', re: /^(total )?remun|rem\.? ?total|total rem|remuneracion/, imp: 1 },
  { k: 'bruto', t: 'Bruto (total haberes)', re: /bruto|total haberes|^haberes/, imp: 1 },
  { k: 'aportes', t: 'Aportes del empleado', re: /aporte|retencion|descuento|deduccion/, imp: 1 },
  { k: 'neto', t: 'Neto a cobrar', re: /neto|a cobrar|liquido/, imp: 1 },
  { k: 'contrib', t: 'Contribuciones patronales', re: /contrib|patronal|cargas soc/, imp: 1 }
];
const CAMPO = Object.fromEntries(CAMPOS_IMP.map(c => [c.k, c]));
const FECHAS = new Set(['nac', 'ingreso', 'egreso']);
let IMP = null;

function parseImporte(v) {
  if (typeof v === 'number') return v;
  let s = String(v == null ? '' : v).replace(/[$\s]/g, ''); if (!s) return 0;
  let neg = /^-|-$|^\(.*\)$/.test(s); s = s.replace(/[()-]/g, '');
  const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
  if (c >= 0 && d >= 0) s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (c >= 0) s = /,\d{1,2}$/.test(s) && s.split(',').length === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  else if (d >= 0 && (s.split('.').length > 2 || /\.\d{3}$/.test(s) && !/^0\d/.test(s))) s = s.replace(/\./g, '');
  const n = parseFloat(s); return isFinite(n) ? (neg ? -n : n) : 0;
}
function parseFecha(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v)) { const t = v.getTime() - v.getTimezoneOffset() * 6e4; return dISO(Math.round(t / 864e5) * 864e5); }
  if (typeof v === 'number') { if (v > 59 && v < 80000) return dISO(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); v = String(v); }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return m[1] + '-' + p2(m[2]) + '-' + p2(m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += y > 40 ? 1900 : 2000; return y + '-' + p2(m[2]) + '-' + p2(m[1]); }
  m = s.match(/^(\d{2})(\d{2})(\d{4})$/); if (m) return m[3] + '-' + m[2] + '-' + m[1];
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  return '';
}
function celdaTxt(v) { return v instanceof Date ? fec(parseFecha(v)) : String(v == null ? '' : v).trim(); }
/* CSV con comillas */
function partirLinea(l, sep) {
  if (sep !== ',' && l.indexOf('"') < 0) return l.split(sep);
  const r = []; let cur = '', q = false;
  for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === sep) { r.push(cur); cur = ''; } else cur += ch; }
  r.push(cur); return r;
}
function partirTexto(txt) {
  const ls = txt.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const muestra = ls.slice(0, 40);
  /* ancho fijo: casi todos los renglones del mismo largo y con columnas rellenas de espacios */
  const largos = {}; muestra.forEach(l => { largos[l.length] = (largos[l.length] || 0) + 1; });
  const fijo = Math.max(...Object.values(largos)) >= muestra.length * 0.8 && muestra[0].length >= 50 && muestra.filter(l => / {3,}/.test(l)).length >= muestra.length * 0.8;
  let mejor = null;
  for (const sep of [';', '\t', '|', ',']) {
    const cs = muestra.map(l => partirLinea(l, sep).length); const moda = {}; cs.forEach(c => { moda[c] = (moda[c] || 0) + 1; });
    const k = Object.keys(moda).sort((a, b) => moda[b] - moda[a])[0];
    /* la coma de los decimales no es separador: quedan pedazos como "50 000000060000" */
    if (sep === ',' && muestra.some(l => partirLinea(l, ',').slice(1).some(x => /^\d{2}(\s|$)/.test(x)))) continue;
    if (fijo && sep !== ';' && sep !== '\t') continue;
    if (+k >= 3 && moda[k] >= muestra.length * 0.7 && (!mejor || +k > mejor.n)) mejor = { sep, n: +k };
  }
  if (mejor) return { filas: ls.map(l => partirLinea(l, mejor.sep).map(c => c.trim())), fijo: false };
  return { filas: parseFijo(ls), fijo: true };
}
/* TXT de ancho fijo (F.931 / SICOSS): se toma seguro el CUIL y el nombre; los importes son los números con decimales que siguen */
function parseFijo(ls) {
  const r = []; let maxI = 0;
  for (const l of ls) {
    const re = /(^|\D)(\d{2})[- ]?(\d{8})[- ]?(\d)(?!\d)/g; let m, cu = null, pos = -1, fin = -1;
    while ((m = re.exec(l))) { const c = m[2] + m[3] + m[4]; if (cuilOk(c) || !cu) { cu = c; pos = m.index + m[1].length; fin = re.lastIndex; if (cuilOk(c)) break; } }
    if (!cu) continue;
    const resto = l.slice(fin);
    const nm = resto.match(/^[\s\d]{0,6}([A-Za-zÁÉÍÓÚÑÜáéíóúñü][A-Za-zÁÉÍÓÚÑÜáéíóúñü .,'´`-]*?)(?=\s{2,}|\d|$)/) || l.slice(0, pos).match(/([A-Za-zÁÉÍÓÚÑÜáéíóúñü][A-Za-zÁÉÍÓÚÑÜáéíóúñü .,'´`-]{3,}?)\s*$/);
    const nombre = nm ? nm[1].trim().replace(/\s+/g, ' ') : '';
    const desde = nm && resto.indexOf(nm[1]) >= 0 ? resto.indexOf(nm[1]) + nm[1].length : 0;
    const imps = (resto.slice(desde).match(/-?\d[\d.]*[.,]\d{2}(?!\d)/g) || []).map(parseImporte);
    maxI = Math.max(maxI, imps.length);
    r.push([fmtCuil(cu), nombre].concat(imps));
  }
  const cab = ['CUIL', 'Apellido y nombre']; for (let i = 1; i <= maxI; i++) cab.push('Importe ' + i);
  return [cab].concat(r);
}
function filasHoja(wb, h) {
  const ws = wb.Sheets[h];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).filter(f => f.some(c => String(c).trim() !== ''));
}
function armarImp(nombre, filas, opt) {
  const norm = s => sinAcentos(celdaTxt(s)).replace(/\s+/g, ' ').trim();
  let hi = -1, best = 1;
  if (opt.fijo) hi = 0;
  else filas.slice(0, 15).forEach((f, i) => { const sc = f.filter(c => typeof c === 'string' && CAMPOS_IMP.some(x => x.re.test(norm(c)))).length; if (sc > best) { best = sc; hi = i; } });
  const ncol = Math.max(0, ...filas.map(f => f.length));
  const cab = []; for (let i = 0; i < ncol; i++) cab.push(hi >= 0 && celdaTxt(filas[hi][i]) ? celdaTxt(filas[hi][i]) : 'Columna ' + (i + 1));
  const datos = filas.slice(hi + 1);
  const map = {}, usada = new Set();
  for (const c of CAMPOS_IMP) { const i = cab.findIndex((h, j) => !usada.has(j) && hi >= 0 && c.re.test(norm(h))); map[c.k] = i; if (i >= 0) usada.add(i); }
  const muestra = datos.slice(0, 40);
  if (map.cuil < 0) map.cuil = cab.findIndex((h, j) => !usada.has(j) && muestra.filter(f => normCuil(f[j])).length >= muestra.length * 0.5);
  if (map.nombre < 0) map.nombre = cab.findIndex((h, j) => !usada.has(j) && j !== map.cuil && muestra.filter(f => /^[A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ ,.'-]{4,}$/.test(celdaTxt(f[j]))).length >= muestra.length * 0.5);
  if (opt.fijo && cab.length > 2 && map.bruto < 0) map.bruto = 2;
  const mesN = (nombre.match(/(20\d{2})[-_ .]?(0[1-9]|1[0-2])(?!\d)/) || []), mesN2 = (nombre.match(/(?:^|\D)(0[1-9]|1[0-2])[-_ .]?(20\d{2})/) || []);
  const mes = mesN[1] ? mesN[1] + '-' + mesN[2] : mesN2[2] ? mesN2[2] + '-' + mesN2[1] : mesMas(hoyISO().slice(0, 7), -1);
  IMP = Object.assign({ archivo: nombre, cab, datos, map, mes, fijo: !!opt.fijo, hojas: opt.hojas || null, hoja: opt.hoja || '', wb: opt.wb || null, hi }, IMP && IMP.archivo === nombre ? { destNom: IMP.destNom, destLiq: IMP.destLiq } : {});
  const hayPers = CAMPOS_IMP.some(c => !c.imp && !['cuil', 'nombre', 'apellido', 'legajo'].includes(c.k) && map[c.k] >= 0);
  const hayImp = CAMPOS_IMP.some(c => c.imp && map[c.k] >= 0);
  if (IMP.destNom == null) IMP.destNom = hayPers || !personas().length;
  if (IMP.destLiq == null) IMP.destLiq = hayImp;
  IMP.altas = true; IMP.res = null;
}
async function leerArchivo(f) {
  const ext = f.name.split('.').pop().toLowerCase();
  $('main').innerHTML = '<div class="cargando"><span class="spin"></span> Leyendo ' + esc(f.name) + '…</div>';
  try {
    if (['txt', 'csv', 'prn', 'dat'].includes(ext)) {
      const buf = await f.arrayBuffer(); let txt = new TextDecoder('utf-8').decode(buf);
      if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf);
      const r = partirTexto(txt); IMP = null; armarImp(f.name, r.filas, { fijo: r.fijo });
    } else {
      if (!window.XLSX) throw new Error('no se pudo cargar el lector de Excel (revisá internet)');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
      IMP = null; armarImp(f.name, filasHoja(wb, wb.SheetNames[0]), { hojas: wb.SheetNames, hoja: wb.SheetNames[0], wb });
    }
  } catch (e) { console.error(e); toast('No se pudo leer el archivo: ' + (e.message || e), true); IMP = null; }
  refrescar();
}
function filaImp(f) {
  const m = IMP.map, g = k => (m[k] >= 0 ? f[m[k]] : '');
  const o = { cuil: normCuil(g('cuil')) };
  for (const c of CAMPOS_IMP) {
    if (c.k === 'cuil' || m[c.k] < 0) continue;
    const v = g(c.k);
    if (FECHAS.has(c.k)) o[c.k] = parseFecha(v);
    else if (c.imp || c.num) o[c.k] = Math.round(parseImporte(v) * 100) / 100;
    else o[c.k] = celdaTxt(v).replace(/\s+/g, ' ');
  }
  if (o.apellido) { o.nombre = o.nombre ? o.apellido + ', ' + o.nombre : o.apellido; delete o.apellido; }
  if (o.sexo) o.sexo = /^f|^mujer/i.test(o.sexo) ? 'F' : /^m|^var|^hom/i.test(o.sexo) ? 'M' : o.sexo.slice(0, 1).toUpperCase();
  if (o.sector) o.sector = lindo(o.sector);
  return o;
}
function vImportar() {
  setTimeout(enganchesImp, 0);
  let h = cab('Importar', 'Subí el Excel, CSV o TXT del sistema de sueldos o del F.931. La página reconoce las columnas solas; si alguna quedó mal, corregila abajo antes de importar. Todo se une por <b>CUIL</b>.', IMP ? '<button class="small" id="imp-otro">Elegir otro archivo</button>' : '');
  if (!IMP) return h + '<section><label class="drop" id="imp-drop"><input type="file" id="imp-file" accept=".xlsx,.xls,.csv,.txt,.prn,.dat" style="display:none"><b>Tocá para elegir el archivo</b> o arrastralo acá<br><small>Excel (.xlsx, .xls), CSV o TXT</small></label>' +
    '<p class="nota-ed">Con el archivo se puede: <b>actualizar la nómina</b> (alta de los que no están y los datos que traiga: legajo, fechas, sector, categoría, básico, etc.) y/o <b>cargar los sueldos de un mes</b> (remunerativo, no remunerativo, bruto, neto, aportes y contribuciones) para la masa salarial y el costo laboral. No se borra a nadie: las bajas se dan desde la ficha o si el archivo trae la fecha de egreso.</p></section>';
  const m = IMP.map, filas = IMP.datos.map(filaImp), valid = filas.filter(o => o.cuil);
  const nuevos = valid.filter(o => !N[o.cuil]), dud = valid.filter(o => !cuilOk(o.cuil)), sinC = filas.length - valid.length;
  const opc = sel => '<option value="-1">— no viene —</option>' + IMP.cab.map((c, i) => '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
  const usados = CAMPOS_IMP.filter(c => m[c.k] >= 0 && c.k !== 'apellido');
  h += '<section><h2>' + esc(IMP.archivo) + '</h2><p class="sub">' + n0(IMP.datos.length) + ' renglones · ' + n0(valid.length) + ' con CUIL (' + nuevos.length + ' no están en la nómina)' + (sinC ? ' · <span class="neg">' + sinC + ' sin CUIL (no se importan)</span>' : '') + (dud.length ? ' · <span class="neg">' + dud.length + ' CUIL que no dan el dígito verificador</span>' : '') + '</p>' +
    (IMP.hojas && IMP.hojas.length > 1 ? '<p>Hoja: <select id="imp-hoja">' + IMP.hojas.map(x => '<option' + (x === IMP.hoja ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></p>' : '') +
    (IMP.fijo ? '<div class="aviso">TXT de <b>ancho fijo</b>: se toma seguro el CUIL y el nombre. Los importes son los números con decimales de cada renglón (Importe 1, 2, …): <b>revisá cuál es cuál</b> mirando la vista previa antes de cargar sueldos.</div>' : '') +
    '<h3>Columnas</h3><div class="imp-map">' + CAMPOS_IMP.map(c => '<div class="' + (c.imp ? 'imp' : '') + '"><label>' + c.t + (c.imp ? ' <small>(sueldos)</small>' : '') + '</label><select data-map="' + c.k + '">' + opc(m[c.k]) + '</select></div>').join('') + '</div>' +
    '<h3>Qué hacer</h3><div class="imp-dest">' +
    '<label><input type="checkbox" id="imp-nom"' + (IMP.destNom ? ' checked' : '') + '> Actualizar la nómina con los datos del archivo (no pisa con vacíos)</label>' +
    '<label><input type="checkbox" id="imp-altas"' + (IMP.altas ? ' checked' : '') + '> Dar de alta a quienes no están en la nómina (' + nuevos.length + ')</label>' +
    '<label><input type="checkbox" id="imp-liq"' + (IMP.destLiq ? ' checked' : '') + (usados.some(c => c.imp) ? '' : ' disabled') + '> Cargar como sueldos de <input type="month" id="imp-mes" value="' + IMP.mes + '"> ' + (IDX[IMP.mes] ? '<span class="chip warn">ese mes ya tiene ' + IDX[IMP.mes].n + ' sueldos: se reemplazan</span>' : '') + (usados.some(c => c.imp) ? '' : '<small class="muted">(elegí al menos una columna de sueldos)</small>') + '</label>' +
    '</div><div class="row"><button class="primary" id="imp-ok">Importar</button></div></section>';
  if (IMP.res) h += '<div class="ok-box">' + IMP.res + '</div>';
  const cols = [{ t: 'Estado', v: o => !o.cuil ? 'Sin CUIL' : N[o.cuil] ? 'Ya está' : 'Nuevo', h: o => !o.cuil ? '<span class="chip bad">sin CUIL</span>' : (N[o.cuil] ? '<span class="chip mut">ya está</span>' : '<span class="chip ok">nuevo</span>') + (cuilOk(o.cuil) ? '' : ' <span class="chip warn">CUIL?</span>') },
    { t: 'CUIL', v: o => fmtCuil(o.cuil) }].concat(usados.filter(c => c.k !== 'cuil').map(c => ({ t: c.t, num: c.imp || c.num, v: o => o[c.k], f: v => FECHAS.has(c.k) ? fec(v) : (c.imp || c.num) ? (v ? pesos(v) : '') : esc(v) })));
  h += '<section><h2>Vista previa</h2>' + tabla('imp', cols, filas, { limite: 25, clase: 'compacta prev', hoja: 'Importación' }) + '</section>';
  return h;
}
function enganchesImp() {
  const fi = $('imp-file'), dr = $('imp-drop');
  if (fi) fi.onchange = () => { if (fi.files[0]) leerArchivo(fi.files[0]); };
  if (dr) { dr.ondragover = e => { e.preventDefault(); dr.classList.add('over'); }; dr.ondragleave = () => dr.classList.remove('over'); dr.ondrop = e => { e.preventDefault(); dr.classList.remove('over'); if (e.dataTransfer.files[0]) leerArchivo(e.dataTransfer.files[0]); }; }
  const ot = $('imp-otro'); if (ot) ot.onclick = () => { IMP = null; refrescar(); };
  document.querySelectorAll('[data-map]').forEach(s => s.onchange = () => { const k = s.dataset.map, v = +s.value; if (v >= 0) for (const c in IMP.map) if (IMP.map[c] === v) IMP.map[c] = -1; IMP.map[k] = v; refrescar(); });
  const hj = $('imp-hoja'); if (hj) hj.onchange = () => { const wb = IMP.wb, n = IMP.archivo; IMP = null; armarImp(n, filasHoja(wb, hj.value), { hojas: wb.SheetNames, hoja: hj.value, wb }); refrescar(); };
  const sync = () => { if (!IMP) return; IMP.destNom = $('imp-nom').checked; IMP.altas = $('imp-altas').checked; IMP.destLiq = $('imp-liq').checked; IMP.mes = $('imp-mes').value || IMP.mes; };
  ['imp-nom', 'imp-altas', 'imp-liq'].forEach(k => { const el = $(k); if (el) el.onchange = sync; });
  const me = $('imp-mes'); if (me) me.onchange = () => { sync(); refrescar(); };
  const ok = $('imp-ok'); if (ok) ok.onclick = () => { sync(); importar(); };
}
async function importar() {
  const filas = IMP.datos.map(filaImp).filter(o => o.cuil), mes = IMP.mes;
  if (!filas.length) { toast('No hay renglones con CUIL', true); return; }
  if (!IMP.destNom && !IMP.destLiq && !IMP.altas) { toast('Elegí qué hacer con el archivo', true); return; }
  if (IMP.destLiq && !/^\d{4}-\d{2}$/.test(mes)) { toast('Elegí el mes de los sueldos', true); return; }
  if (IMP.destLiq && IDX[mes] && !confirm('Los sueldos de ' + mesLargo(mes) + ' ya están cargados (' + IDX[mes].n + ' personas). ¿Reemplazarlos con este archivo?')) return;
  const btn = $('imp-ok'); if (btn) { btn.disabled = true; btn.textContent = 'Importando…'; }
  const quien = C3API.usuario.nombre, ts = new Date().toISOString(), res = [];
  try {
    const DATOS = CAMPOS_IMP.filter(c => !c.imp && c.k !== 'cuil' && c.k !== 'apellido').map(c => c.k);
    let nAct = 0, nNue = 0, nBaj = 0;
    if (IMP.destNom || IMP.altas) {
      await guardarNomina(d => {
        for (const o of filas) {
          let p = d.personas[o.cuil];
          if (!p) {
            if (!IMP.altas) continue;
            p = d.personas[o.cuil] = { cuil: o.cuil, dni: String(+o.cuil.slice(2, 10)), nombre: o.nombre || fmtCuil(o.cuil), origen: 'importado', act: ts, por: quien };
            for (const k of DATOS) if (o[k] != null && o[k] !== '' && k !== 'egreso') p[k] = o[k];
            if (o.egreso && (!p.ingreso || o.egreso >= p.ingreso)) { p.egreso = o.egreso; p.motivo = 'Según el sistema de sueldos'; }
            nNue++; continue;
          }
          if (!IMP.destNom) continue;
          let cambio = false;
          for (const k of DATOS) {
            if (k === 'egreso') continue;
            if (o[k] == null || o[k] === '' || (typeof o[k] === 'number' && !o[k])) continue;
            if (String(p[k] == null ? '' : p[k]) !== String(o[k])) { p[k] = o[k]; cambio = true; }
          }
          if (o.egreso && !p.egreso && (!p.ingreso || o.egreso >= p.ingreso)) { p.egreso = o.egreso; p.motivo = 'Según el sistema de sueldos'; nBaj++; cambio = true; }
          if (cambio) { p.act = ts; p.por = quien; nAct++; }
        }
      }, 'Importación de ' + IMP.archivo + ': nómina');
      res.push(nNue + ' altas nuevas', nAct + ' personas actualizadas' + (nBaj ? ' (' + nBaj + ' bajas según el archivo)' : ''));
    }
    if (IMP.destLiq) {
      const F = {};
      const hayBruto = IMP.map.bruto >= 0;
      for (const o of filas) {
        const x = F[o.cuil] = F[o.cuil] || { nombre: o.nombre || nomDe(o.cuil), legajo: o.legajo || (N[o.cuil] || {}).legajo || '', rem: 0, noRem: 0, bruto: 0, neto: 0, aportes: 0, contrib: 0 };
        for (const k of ['rem', 'noRem', 'bruto', 'neto', 'aportes', 'contrib']) x[k] += +o[k] || 0;
      }
      for (const c in F) { const x = F[c]; if (!hayBruto) x.bruto = x.rem + x.noRem; for (const k in x) if (typeof x[k] === 'number') x[k] = Math.round(x[k] * 100) / 100; }
      const tot = Object.values(F).reduce((s, x) => ({ bruto: s.bruto + x.bruto, neto: s.neto + x.neto, contrib: s.contrib + x.contrib }), { bruto: 0, neto: 0, contrib: 0 });
      const n = Object.keys(F).length;
      await C3API.cambiarDoc('liq-' + mes, d => { for (const k in d) delete d[k]; Object.assign(d, { mes, archivo: IMP.archivo, por: quien, ts, filas: F }); }, 'Sueldos de ' + mesLargo(mes) + ' desde ' + IMP.archivo + ': ' + n + ' personas, bruto ' + pesos(tot.bruto));
      const ix = await C3API.cambiarDoc('liq-indice', d => { d.meses = d.meses || {}; d.meses[mes] = { n, bruto: Math.round(tot.bruto), neto: Math.round(tot.neto), contrib: Math.round(tot.contrib), archivo: IMP.archivo, por: quien, ts }; }, 'Índice de sueldos: ' + mesLargo(mes));
      IDX = (ix && ix.meses) || IDX; LIQ[mes] = { mes, filas: F };
      res.push('sueldos de ' + mesLargo(mes) + ': ' + n + ' personas, bruto ' + pesos(tot.bruto) + (tot.contrib ? ', contribuciones ' + pesos(tot.contrib) : ''));
    }
    const enArch = new Set(filas.map(o => o.cuil)), faltan_ = activos().filter(p => !enArch.has(p.cuil));
    IMP.res = '<b>Listo.</b> ' + res.join(' · ') + '.' + (faltan_.length && filas.length > 5 ? '<br><small>' + faltan_.length + ' personas activas de la nómina no vinieron en este archivo: ' + esc(faltan_.slice(0, 8).map(p => p.nombre).join(', ')) + (faltan_.length > 8 ? '…' : '') + '. Si ya no trabajan, dales la baja desde su ficha.</small>' : '');
    toast('Importado');
  } catch (e) { console.error(e); toast('No se pudo importar: ' + (e.message || e), true); }
  refrescar();
}

/* ---------- Cambios ---------- */
async function vCambios() {
  const l = await C3API.cambios();
  return cab('Cambios', 'Todo lo que se cargó o cambió en el Centro RRHH, quién y cuándo (los últimos 400).', botonXl('camb', 'Cambios RRHH')) + '<section>' + tabla('camb', [
    { t: 'Cuándo', v: c => c.ts, f: t => t ? fec(t.slice(0, 10)) + ' ' + new Date(t).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '' },
    { t: 'Quién', v: c => c.quien || '' }, { t: 'Qué', v: c => c.cambio || '' }
  ], l, { orden: 0, limite: 150, clase: 'compacta', hoja: 'Cambios', vacio: 'Todavía no hay cambios.' }) + '</section>';
}

/* ---------- Usuarios (solo admin) ---------- */
async function vUsuarios() {
  if (!esAdmin()) return '<section class="empty">Solo un administrador del Centro RRHH maneja los usuarios.</section>';
  const us = (await C3API.rhUsuarios()).sort((a, b) => String(a.email).localeCompare(String(b.email)));
  const yo = C3API.usuario.email;
  return cab('Usuarios', 'Quién puede entrar al Centro RRHH. Solo entran estas cuentas: ni los editores de la app de producción ni los usuarios de los otros centros. <b>Administrador</b>: además agrega y saca usuarios. Link para pasar: <b>qualita-produccion.web.app/rrhh</b>') +
    '<section><div class="tw"><table class="tb"><thead><tr><th>Mail</th><th>Nombre</th><th>Permiso</th><th></th></tr></thead><tbody>' +
    us.map(u => '<tr><td>' + esc(u.email) + (u.email === yo ? ' <span class="chip info">vos</span>' : '') + '</td><td>' + esc(u.nombre || '') + '</td><td>' + (u.admin ? '<span class="chip ok">Administrador</span>' : 'Ve y carga todo') + '</td><td>' +
      (u.email === yo ? '' : '<button class="small" onclick="rhAdmin(\'' + esc(u.email) + '\',' + !u.admin + ')">' + (u.admin ? 'Quitar admin' : 'Hacer admin') + '</button> <button class="small danger" onclick="rhSacar(\'' + esc(u.email) + '\')">Sacar</button>') + '</td></tr>').join('') +
    '<tr><td><input id="nu-mail" placeholder="mail con el que ingresa"></td><td><input id="nu-nom" placeholder="Nombre (ej: Gabi)"></td><td><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="nu-adm"> Administrador</label></td><td><button class="small primary" onclick="rhAgregar()">Agregar</button></td></tr></tbody></table></div></section>';
}
async function rhAgregar() {
  const mail = $('nu-mail').value.trim().toLowerCase(), nombre = $('nu-nom').value.trim(), admin = $('nu-adm').checked;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { toast('Poné un mail válido', true); return; }
  try {
    await C3API.ponerRh(mail, { nombre, admin, por: C3API.usuario.nombre, ts: new Date().toISOString() });
    await C3API.cambiarDoc('usuarios-log', d => { d.n = (d.n || 0) + 1; }, 'Usuario agregado: ' + mail + (admin ? ' (administrador)' : ''));
    toast('Agregado. Pasale el link qualita-produccion.web.app/rrhh'); refrescar();
  } catch (e) { toast('No se pudo agregar: ' + (e.message || e), true); }
}
async function rhAdmin(mail, admin) {
  try {
    const u = (await C3API.rhUsuarios()).find(x => x.email === mail) || {};
    delete u.email; u.admin = admin;
    await C3API.ponerRh(mail, u);
    await C3API.cambiarDoc('usuarios-log', d => { d.n = (d.n || 0) + 1; }, (admin ? 'Ahora es administrador: ' : 'Ya no es administrador: ') + mail);
    refrescar();
  } catch (e) { toast('No se pudo cambiar: ' + (e.message || e), true); }
}
async function rhSacar(mail) {
  if (!confirm('¿Sacarle el acceso al Centro RRHH a ' + mail + '?')) return;
  try {
    await C3API.sacarRh(mail);
    await C3API.cambiarDoc('usuarios-log', d => { d.n = (d.n || 0) + 1; }, 'Usuario sacado: ' + mail);
    toast('Sacado'); refrescar();
  } catch (e) { toast('No se pudo sacar: ' + (e.message || e), true); }
}
window.rhAgregar = rhAgregar; window.rhAdmin = rhAdmin; window.rhSacar = rhSacar;

/* ---------- diálogos y clics ---------- */
function abrirDlg(tit, cuerpo, pie) { $('dlg-h').innerHTML = tit; $('dlg-b').innerHTML = cuerpo; $('dlg-f').innerHTML = (pie || '') + '<button onclick="cerrarDlg()">Cerrar</button>'; const d = $('dlg'); if (!d.open) d.showModal(); d.querySelector('.dlg-b').scrollTop = 0; }
function cerrarDlg() { const d = $('dlg'); if (d.open) d.close(); }
window.cerrarDlg = cerrarDlg;
document.addEventListener('click', e => {
  const th = e.target.closest('th[data-tb]');
  if (th) { const t = TABLAS[th.dataset.tb], c = +th.dataset.col; if (t.orden === c) t.dir = -t.dir; else { t.orden = c; t.dir = t.cols[c].num ? -1 : 1; } $('tw-' + th.dataset.tb).innerHTML = cuerpoTabla(th.dataset.tb); return; }
  const mas = e.target.closest('[data-mas]');
  if (mas) { TABLAS[mas.dataset.mas].todo = true; $('tw-' + mas.dataset.mas).innerHTML = cuerpoTabla(mas.dataset.mas); return; }
  const xl = e.target.closest('[data-xl]');
  if (xl) { excel(xl.dataset.xl, xl.dataset.nom); return; }
  const fi = e.target.closest('[data-fi]');
  if (fi && fichaAbierta) { ficha(fichaAbierta, fi.dataset.fi); return; }
  const tr = e.target.closest('tr.clic');
  if (tr) { const t = TABLAS[tr.dataset.tb]; t.opt.click(t.vistos[+tr.dataset.row]); return; }
  const ir = e.target.closest('[data-ir]');
  if (ir) { e.preventDefault(); irA(ir.dataset.ir); }
});

/* ---------- arranque ---------- */
async function cargar() {
  $('main').innerHTML = '<div class="cargando"><span class="spin"></span> Trayendo el personal…</div>';
  try {
    const y = +hoyISO().slice(0, 4);
    const [nom, idx, sis] = await Promise.all([C3API.leerDoc('nomina'), C3API.leerDoc('liq-indice'), C3API.leerDoc('sis-nomina'), leerAus(y), leerAus(y - 1)]);
    NOM_WEB = (nom.d && nom.d.personas) || {}; IDX = (idx.d && idx.d.meses) || {};
    armarNomina(sis.d && sis.d.txt ? sis.d.txt : null);
    $('st').innerHTML = '<span class="dot' + (SIS ? '' : ' off') + '"></span><b>' + n0(activos().length) + '</b> activos · ' + (SIS ? 'sistema de sueldos al <b>' + esc(SIS.act ? fec(SIS.act.slice(0, 10)) + ' ' + SIS.act.slice(11, 16) : '—') + '</b>' : 'sin datos del sistema') + '<br><span id="st-user">' + esc(C3API.usuario.nombre) + ' · <a href="#" onclick="C3API.salir();return false">Salir</a></span>';
    leerUI(); if (TAB === 'usuarios' && !esAdmin()) TAB = 'resumen';
    refrescar();
  } catch (e) {
    console.error(e);
    $('main').innerHTML = '<section class="empty">No se pudieron leer los datos (' + esc(e.message || e) + '). Recargá la página.</section>';
  }
}
document.querySelectorAll('#nav a').forEach(a => a.onclick = e => { e.preventDefault(); TAB = a.dataset.t; refrescar(); window.scrollTo(0, 0); });
C3API.listo.then(api => {
  if (!api.rh) { $('main').innerHTML = '<section class="empty">Tu cuenta no tiene acceso al Centro RRHH.</section>'; return; }
  if (esAdmin()) $('nav-usr').style.display = '';
  cargar();
});
