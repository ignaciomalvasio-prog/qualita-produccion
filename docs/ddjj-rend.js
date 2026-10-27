/* Rendimiento de desposte · pestaña "Rendimiento" de /ddjj (reemplaza la hoja RENDIMIENTO de RESUMEN PRODUCCIÓN.xlsx)
   - Cortes principales: rendimiento = kg producidos ÷ (medias asignadas × peso promedio de la media del día).
   - Subproductos: rendimiento = kg ÷ kg ingresados del día.
   - Datos: los mismos del desposte (TR, RE, IN de c3sis/dj-AAAA-MM). Grupos y artículos: eq().rend (pestaña Equivalencias).
   - Lo corregido a mano: c3docs/ddjj-AAAA-MM → rend[fecha] = { g: { grupo: {medias, kg, dest} }, por, ts }.
   medias: 'total' (todas las medias del día), 'piezas' (piezas del sistema de esos artículos, menos las que reingresaron, con tope en el total) o 'resto' (total menos las de los grupos de `menos`). */
'use strict';

const REND_DEF = {
  grupos: [
    { n: 'Jamón sin hueso', arts: [319, 321, 322, 324, 326, 327, 329, 342, 343, 344, 346, 357, 359, 374], medias: 'resto', menos: ['Jamón con hueso y cuero', 'Jamón con hueso sin cuero'], destino: true },
    { n: 'Jamón con hueso y cuero', arts: [315, 316], medias: 'piezas' },
    { n: 'Jamón con hueso sin cuero', arts: [317, 318, 418], medias: 'piezas' },
    { n: 'Paleta sin hueso', arts: [134, 139, 141, 147, 148, 159, 182, 183, 377], medias: 'resto', menos: ['Paleta con hueso y cuero', 'Paleta con hueso sin cuero'], destino: true },
    { n: 'Paleta con hueso y cuero', arts: [132, 137], medias: 'piezas' },
    { n: 'Paleta con hueso sin cuero', arts: [131, 136], medias: 'piezas' },
    { n: 'Bondiola', arts: [101, 109, 30105], medias: 'total' },
    { n: 'Carré sin solomillo', arts: [271, 281, 307, 308, 30276], medias: 'piezas' },
    { n: 'Cinta de lomo', arts: [289, 292, 297], medias: 'piezas' },
    { n: 'Matambrito', arts: [231, 240, 30236], medias: 'total' },
    { n: 'Pechito con manta', arts: [211, 215, 221, 305, 30216], medias: 'total' },
    { n: 'Vacío', arts: [222, 333], sub: true },
    { n: 'Churrasquito', arts: [241, 243, 245, 248, 30246], sub: true },
    { n: 'Recorte 80/20', arts: [361, 362, 365], sub: true },
    { n: 'Recorte 50/50', arts: [369], sub: true },
    { n: 'Grasa charqueo', arts: [479], sub: true },
    { n: 'Grasa matambre', arts: [], sub: true },
    { n: 'Tocino', arts: [461, 465, 466, 467], sub: true },
    { n: 'Tapas', arts: [156, 336], sub: true },
    { n: 'Cuero', arts: [411, 412, 437], sub: true },
    { n: 'Garrón', arts: [401, 404], sub: true },
    { n: 'Tortuga', arts: [381, 386], sub: true },
    { n: 'Solomillo', arts: [285, 298, 30287], sub: true }
  ]
};
const eqR = () => (eq().rend || REND_DEF);
const diaR = f => ((S.doc && S.doc.rend) || {})[f] || {};
const pct1 = v => (v == null || !isFinite(v)) ? '' : (v * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';

/* el rendimiento de un día: lo del sistema + lo corregido */
function calcularR(f) {
  const d = (S.sis && S.sis.dias[f]) || { tr: [], in: [], re: [] };
  const medias = d.tr.reduce((a, t) => a + t.medias, 0), kgIng = r2(d.tr.reduce((a, t) => a + t.kg, 0));
  const pp = medias ? kgIng / medias : 0, ov = diaR(f).g || {}, G = {};
  const restar = eq().restar !== false;
  for (const g of eqR().grupos) {
    const re = d.re.filter(r => (g.arts || []).includes(r.art));
    let ing = restar && !g.sub ? d.in.filter(r => (g.arts || []).includes(r.art)) : [];   // en subproductos no se resta el reproceso
    const bruto = re.reduce((a, r) => a + r.kg, 0);
    if (bruto - ing.reduce((a, r) => a + r.kg, 0) < 0) ing = [];
    const kgSis = r2(bruto - ing.reduce((a, r) => a + r.kg, 0));
    const pzSis = Math.max(re.reduce((a, r) => a + (r.pz || r.uni), 0) - ing.reduce((a, r) => a + r.uni, 0), 0);
    G[g.n] = { g, re, ing, kgSis, pzSis };
  }
  const val = (n, k, s) => { const o = ov[n] || {}; return o[k] !== undefined ? o[k] : s; };
  /* medias: primero las fijas (total / piezas), después las que son "el resto" */
  for (const g of eqR().grupos) {
    if (g.sub) continue;
    const x = G[g.n];
    x.mediasSis = g.medias === 'piezas' ? Math.min(x.pzSis, medias) : g.medias === 'total' ? medias : null;
  }
  for (const g of eqR().grupos) {
    if (g.sub || g.medias !== 'resto') continue;
    const otros = (g.menos || []).reduce((a, n) => a + (G[n] ? (Number(val(n, 'medias', G[n].mediasSis)) || 0) : 0), 0);
    G[g.n].mediasSis = Math.max(medias - otros, 0);
  }
  const filas = eqR().grupos.map(g => {
    const x = G[g.n], o = ov[g.n] || {};
    const kgv = val(g.n, 'kg', x.kgSis), mv = g.sub ? null : val(g.n, 'medias', x.mediasSis);
    const asig = g.sub ? null : (Number(mv) || 0) * pp;
    const rend = g.sub ? (kgIng ? (Number(kgv) || 0) / kgIng : null) : (asig ? (Number(kgv) || 0) / asig : null);
    return { n: g.n, g, sub: !!g.sub, medias: mv, mediasSis: x.mediasSis, asig, kg: kgv, kgSis: x.kgSis, rend, dest: o.dest || '', ov: o, re: x.re, ing: x.ing };
  });
  return { medias, kgIng, pp, filas, hay: d.tr.length > 0 };
}

/* vara de comparación: rendimiento del mes anterior completo (si está cargado) para marcar desvíos */
function promedioMes(m) {
  const tot = {};
  for (const f of Object.keys((S.sis && S.sis.dias) || {}).filter(x => x.startsWith(m) && x < hoyIso())) {
    const R = calcularR(f); if (!R.hay) continue;
    for (const r of R.filas) {
      const t = tot[r.n] || (tot[r.n] = { kg: 0, base: 0 });
      t.kg += Number(r.kg) || 0; t.base += r.sub ? R.kgIng : (r.asig || 0);
    }
  }
  const o = {}; for (const n in tot) o[n] = tot[n].base ? tot[n].kg / tot[n].base : null;
  return o;
}

function renderRend() {
  const dias = Object.keys(S.sis.dias).filter(f => S.sis.dias[f].tr.length).sort();
  if (!S.fechaR || !S.sis.dias[S.fechaR]) S.fechaR = dias.filter(f => f < hoyIso()).pop() || dias[dias.length - 1] || '';
  const prom = promedioMes(S.mes);
  const grupos = eqR().grupos;
  /* ---- tabla del mes ---- */
  let h = '<section><div class="dj-top" style="margin-bottom:8px"><div><h2>Rendimiento de desposte · ' + esc(nombreMes(S.mes)) + '</h2><p class="sub" style="margin:0">Cortes: kg producidos ÷ kg de media res asignados. Subproductos: kg ÷ kg ingresados. Tocá un día para ver y corregir el detalle.</p></div>' +
    '<div class="row"><button onclick="excelRend()">⬇ Bajar Excel del mes</button></div></div>';
  h += '<div class="tw"><table class="planilla dj-rm"><thead><tr><th>Día</th><th class="num">Medias</th><th class="num">Kg ingreso</th><th class="num">Peso prom.</th>' +
    grupos.map(g => '<th class="num' + (g.sub ? ' sub' : '') + '" title="' + esc(g.n) + '">' + esc(abrevR(g.n)) + '</th>').join('') + '</tr></thead><tbody>';
  const tot = { medias: 0, kg: 0, g: {} };
  for (const f of dias) {
    const R = calcularR(f), enCurso = f >= hoyIso();
    if (!enCurso) { tot.medias += R.medias; tot.kg += R.kgIng; }
    h += '<tr class="' + (f === S.fechaR ? 'hoy' : '') + '" style="cursor:pointer" onclick="S.fechaR=\'' + f + '\';render()"><td><b>' + DIAS3[diaSem(f)] + ' ' + ddmm(f) + '</b>' + (enCurso ? ' <span class="chip sm mut">en curso</span>' : '') + (diaR(f).por ? ' <span class="chip sm info">corregido</span>' : '') + '</td><td class="num">' + fmt0(R.medias) + '</td><td class="num">' + fmt0(R.kgIng) + '</td><td class="num">' + fmt2(R.pp) + '</td>';
    for (const r of R.filas) {
      const t = tot.g[r.n] || (tot.g[r.n] = { kg: 0, base: 0 });
      if (!enCurso) { t.kg += Number(r.kg) || 0; t.base += r.sub ? R.kgIng : (r.asig || 0); }
      const p = prom[r.n], desv = p && r.rend != null && Number(r.kg) ? (r.rend - p) / p : 0;
      h += '<td class="num' + (enCurso ? ' muted' : Math.abs(desv) > 0.1 ? (desv < 0 ? ' rbaja' : ' ralta') : '') + '">' + (Number(r.kg) ? pct1(r.rend) : '') + '</td>';
    }
    h += '</tr>';
  }
  h += '<tr class="tot"><td>Mes</td><td class="num">' + fmt0(tot.medias) + '</td><td class="num">' + fmt0(tot.kg) + '</td><td class="num">' + fmt2(tot.medias ? tot.kg / tot.medias : null) + '</td>' +
    grupos.map(g => { const t = tot.g[g.n]; return '<td class="num">' + (t && t.base && t.kg ? pct1(t.kg / t.base) : '') + '</td>'; }).join('') + '</tr></tbody></table></div>' +
    '<p class="muted" style="font-size:12.5px;margin-top:6px">En rojo, los días que rindieron más de 10 % por debajo del promedio del mes; en verde, más de 10 % por encima.</p></section>';
  /* ---- detalle del día ---- */
  if (S.fechaR) {
    const f = S.fechaR, R = calcularR(f), x = diaR(f);
    h += '<section><h2>' + esc(fechaLarga(f)) + '</h2><p class="sub">' + fmt0(R.medias) + ' medias · ' + fmt0(R.kgIng) + ' kg ingresados · peso promedio ' + fmt2(R.pp) + ' kg' + (x.por ? ' · último cambio: ' + esc(x.por) + ' ' + esc(horaDe(x.ts)) : '') + '. Tocá un número para corregirlo; tocá el nombre para ver de qué artículos sale.</p>';
    h += '<div class="tw"><table class="planilla dj-tab"><thead><tr><th>Corte</th><th class="num">Medias asignadas</th><th class="num">Kg asignados</th><th class="num">Kg producidos</th><th class="num">Rendimiento</th><th class="num">Prom. del mes</th><th>Destino</th></tr></thead><tbody>';
    let sub = false;
    for (const r of R.filas) {
      if (r.sub && !sub) { sub = true; h += '<tr class="dj-sep"><td colspan="7">Subproductos y recortes (rendimiento sobre los kg ingresados)</td></tr>'; }
      const ab = S.abierto['r|' + r.n];
      h += '<tr><td><a href="#" class="dj-n" onclick="S.abierto[\'r|' + jsq(r.n) + '\']=!S.abierto[\'r|' + jsq(r.n) + '\'];render();return false">' + (ab ? '▾ ' : '▸ ') + esc(r.n) + '</a></td>' +
        (r.sub ? '<td></td><td></td>' : celdaR(r, 'medias', fmt0) + '<td class="num">' + fmt2(r.asig) + '</td>') +
        celdaR(r, 'kg', fmt2) + '<td class="num"><b>' + (Number(r.kg) ? pct1(r.rend) : '') + '</b></td><td class="num muted">' + pct1(prom[r.n]) + '</td>' +
        (r.g.destino ? '<td class="ed" onclick="editarR(\'' + jsq(r.n) + '\',\'dest\')">' + esc(r.dest) + '</td>' : '<td></td>') + '</tr>';
      if (ab) h += '<tr class="dj-det"><td colspan="7">' + detalleR(r) + '</td></tr>';
    }
    h += '</tbody></table></div></section>';
  }
  $('main').innerHTML = h;
}
const ABREV = { 'Jamón sin hueso': 'Jamón s/h', 'Jamón con hueso y cuero': 'Jamón c/h c/c', 'Jamón con hueso sin cuero': 'Jamón c/h s/c', 'Paleta sin hueso': 'Paleta s/h', 'Paleta con hueso y cuero': 'Paleta c/h c/c', 'Paleta con hueso sin cuero': 'Paleta c/h s/c', 'Carré sin solomillo': 'Carré', 'Cinta de lomo': 'Cinta', 'Pechito con manta': 'Pechito', 'Grasa charqueo': 'Gr. charqueo', 'Grasa matambre': 'Gr. matambre' };
const abrevR = n => ABREV[n] || n;
function celdaR(r, k, f) {
  const aj = r.ov[k] !== undefined, sv = k === 'kg' ? r.kgSis : r.mediasSis;
  return '<td class="num ed' + (aj ? ' aj' : '') + '" onclick="editarR(\'' + jsq(r.n) + '\',\'' + k + '\')">' + f(r[k]) + (aj ? '<small class="dj-sis">' + f(sv) + '</small>' : '') + '</td>';
}
function detalleR(r) {
  if (!r.re.length && !r.ing.length) return '<span class="muted">Ese día no hubo artículos de este corte. Los artículos se cambian en Equivalencias.</span>';
  let h = '<table class="dj-mini"><tr><th>Artículo del sistema</th><th class="num">Unid.</th><th class="num">Piezas</th><th class="num">Kg</th></tr>';
  h += r.re.map(x => '<tr><td>' + x.art + ' · ' + esc(x.den) + '</td><td class="num">' + fmt0(x.uni) + '</td><td class="num">' + fmt0(x.pz) + '</td><td class="num">' + fmt2(x.kg) + '</td></tr>').join('');
  h += r.ing.map(x => '<tr class="neg"><td>− reingresó al desposte: ' + x.art + ' · ' + esc(x.den) + '</td><td class="num">' + fmt0(x.uni) + '</td><td></td><td class="num">−' + fmt2(x.kg) + '</td></tr>').join('');
  return h + '</table>';
}
const NOMBRE_R = { medias: 'Medias asignadas', kg: 'Kg producidos', dest: 'Destino' };
function editarR(n, k) {
  const R = calcularR(S.fechaR), r = R.filas.find(z => z.n === n); if (!r) return;
  const esNum = k !== 'dest', sv = k === 'kg' ? r.kgSis : k === 'medias' ? r.mediasSis : '';
  const ayuda = esNum ? 'Según el sistema: <b>' + (k === 'kg' ? fmt2(sv) : fmt0(sv)) + '</b>.' + (r.ov[k] !== undefined ? ' <a href="#" onclick="cerrarDlg();cambiarDiaR(x=>{delete x.g[\'' + jsq(n) + '\'].' + k + '},\'' + jsq(n) + ' vuelve al sistema\');return false">Volver a lo del sistema</a>' : '') : 'A quién se vendió (texto libre).';
  pedir(n + ' · ' + NOMBRE_R[k], r[k] == null ? '' : (esNum ? fmtE(r[k]) : r[k]), ayuda, v => cambiarDiaR(x => {
    const o = x.g[n] = x.g[n] || {};
    o[k] = esNum ? v : String(v).trim().toUpperCase();
  }, n + ' ' + NOMBRE_R[k] + ' = ' + v), esNum ? 'num' : 'txt');
}
async function cambiarDiaR(fn, desc) {
  const f = S.fechaR, m = f.slice(0, 7);
  try {
    S.doc = await cambiarDoc('ddjj-' + m, d => {
      d.rend = d.rend || {}; const x = d.rend[f] = d.rend[f] || {};
      x.g = x.g || {}; fn(x); x.por = quien(); x.ts = new Date().toISOString();
    }, 'Rendimiento ' + ddmm(f) + ': ' + desc);
    render();
  } catch (e) { toast(e.message, true); }
}

/* Equivalencias del rendimiento (se agregan a la pestaña Equivalencias) */
function equivRend() {
  const G = eqR().grupos, nom = {};
  for (const d of Object.values(S.sis.dias)) d.re.forEach(r => { nom[r.art] = r.den; });
  const MED = { total: 'Todas las medias del día', piezas: 'Piezas del sistema', resto: 'El resto' };
  let h = '<section><h2>Equivalencias del rendimiento</h2><p class="sub">Qué artículos del sistema suman en cada corte de la planilla de rendimiento, y de dónde salen las medias asignadas.</p>';
  h += '<div class="tw"><table class="planilla dj-eq"><thead><tr><th>Corte</th><th>Artículos del sistema</th><th>Medias asignadas</th></tr></thead><tbody>';
  G.forEach((g, i) => {
    h += '<tr><td><b>' + esc(g.n) + '</b>' + (g.sub ? ' <span class="muted">(subproducto)</span>' : '') + '</td><td>' + ((g.arts || []).map(a => '<span class="dj-art">' + a + (nom[a] ? ' <small>' + esc(nom[a].toLowerCase()) + '</small>' : '') + '</span>').join(' ') || '<span class="muted">ninguno</span>') +
      ' <button class="small" onclick="eqArtsR(' + i + ')">Cambiar</button></td><td>' + (g.sub ? '—' : MED[g.medias] + (g.medias === 'resto' ? ' (menos ' + esc((g.menos || []).join(' y ').toLowerCase()) + ')' : '')) + '</td></tr>';
  });
  return h + '</tbody></table></div></section>';
}
function eqArtsR(i) {
  const g = eqR().grupos[i];
  pedir(g.n + ' · artículos del sistema', (g.arts || []).join(', '), 'Códigos de artículo separados por coma.', v => cambiarEq(d => {
    d.rend = d.rend || JSON.parse(JSON.stringify(REND_DEF));
    d.rend.grupos[i].arts = listaNum(v);
  }, 'Rendimiento ' + g.n + ' = ' + v), 'txt');
}

/* Excel del mes con las mismas columnas que la hoja RENDIMIENTO */
function excelRend() {
  if (!window.XLSX) { toast('No se pudo cargar el Excel. Revisá internet.', true); return; }
  const dias = Object.keys(S.sis.dias).filter(f => S.sis.dias[f].tr.length).sort(), G = eqR().grupos;
  const h1 = ['INGRESO', '', '', ''], h2 = ['Fecha', 'Medias reses', 'Kg ingreso', 'Peso prom. (kg)'];
  for (const g of G) {
    if (g.sub) { h1.push(g.n.toUpperCase(), ''); h2.push('Kg', 'Rend. s/ ingreso'); }
    else { h1.push(g.n.toUpperCase(), '', '', ''); h2.push('Medias reses', 'Kg asignados', 'Kg producidos', 'Rendimiento'); if (g.destino) { h1.push(''); h2.push('Destino'); } }
  }
  const filas = [h1, h2];
  for (const f of dias) {
    const R = calcularR(f), row = [fechaDe(f), R.medias, R.kgIng, r2(R.pp)];
    for (const r of R.filas) {
      if (r.sub) row.push(Number(r.kg) || 0, r.rend != null ? Math.round(r.rend * 10000) / 10000 : '');
      else { row.push(Number(r.medias) || 0, r2(r.asig), Number(r.kg) || 0, r.rend != null && Number(r.kg) ? Math.round(r.rend * 10000) / 10000 : ''); if (r.g.destino) row.push(r.dest || ''); }
    }
    filas.push(row);
  }
  const ws = XLSX.utils.aoa_to_sheet(filas, { cellDates: true }), wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'RENDIMIENTO');
  XLSX.writeFile(wb, 'Rendimiento desposte ' + S.mes + '.xlsx');
}
