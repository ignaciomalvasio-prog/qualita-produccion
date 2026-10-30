/* Tropas · pestaña de /ddjj (pedido de Sabi 30/10): tropas que ingresaron en el mes, una por renglón.
   N° de tropa, ingreso, productor, granja, jaula, cabezas recibidas, faenadas (y en qué días), muertos, kg vivos, peso promedio vivo
   y el porcentaje de animales del romaneo en cada rango de peso (rangos editables, se guardan en ddjj-equiv → tropasRangos).
   Datos: renglones TP / FD / FR de c3sis/dj-AAAA-MM (dj_sync.ps1, Get-Tropas). Muertos: sistema + playa de emergencia (A1) + a mano. */
const RANGOS_DEF = [60, 70, 80, 90, 100];
const rangosT = () => ((S.eq && S.eq.tropasRangos) || RANGOS_DEF).slice().sort((a, b) => a - b);
function nombresRangos(L) {
  const n = ['hasta ' + L[0]];
  for (let i = 1; i < L.length; i++) n.push(L[i - 1] + '–' + L[i]);
  n.push('más de ' + L[L.length - 1]);
  return n.map(x => x + ' kg');
}
/* cantidad de animales en cada rango: hasta L0 (incl.), L0 a L1 (incl.), …, más de Ln */
function enRangos(hist, L) {
  const c = new Array(L.length + 1).fill(0);
  for (const [kg, n] of hist || []) { let i = L.findIndex(x => kg < x); if (i < 0) i = L.length; c[i] += n; }
  return c;
}
function filasTropas() {
  const sis = S.sis || {}, mu = typeof muertosPorTropa === 'function' ? muertosPorTropa() : {}, L = rangosT();
  return (sis.tp || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.tropa).localeCompare(String(b.tropa))).map(t => {
    const fd = (sis.fd || {})[t.tropa] || {}, dias = Object.keys(fd).sort(), fae = dias.reduce((a, d) => a + fd[d], 0);
    const r = enRangos((sis.fr || {})[t.tropa], L), tot = r.reduce((a, x) => a + x, 0);
    return Object.assign({}, t, { fae, dias: dias.map(d => [d, fd[d]]), mu: mu[t.tropa] || 0, prom: t.cab && t.kg ? t.kg / t.cab : 0, rangos: r, totR: tot });
  });
}
function renderTropas() {
  const F = filasTropas(), L = rangosT(), NR = nombresRangos(L), pct = (n, t) => t ? (n / t * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %' : '';
  let h = '<section><div class="dj-top"><div><h2>Tropas · ' + esc(nombreMes(S.mes)) + ' (' + F.length + ')</h2><p class="sub" style="margin:0">Tropas que ingresaron en el mes. Faenadas: cabezas del romaneo (y en qué días). Muertos: del sistema, de la playa de emergencia (A1) y cargados a mano. ' +
    'Rangos de peso: porcentaje de los animales faenados de la tropa según el peso del romaneo.' + (soloVer() ? '' : ' <a href="#" onclick="cambiarRangos();return false">Cambiar rangos</a>') + '</p></div>' +
    (F.length ? '<div class="row"><button onclick="excelTropas()">⬇ Bajar Excel</button></div>' : '') + '</div>';
  if (!F.length) {
    h += '<div class="alerta warn">' + ((S.sis && S.sis.tk != null) ? 'No ingresaron tropas en ' + esc(nombreMes(S.mes)) + '.' : 'Todavía no llegaron los datos de las tropas: se suben con el programa de la PC (se actualiza solo dentro de la hora). Después tocá "Traer datos nuevos".') + '</div></section>';
    $('main').innerHTML = h; return;
  }
  const T = k => F.reduce((a, r) => a + (Number(r[k]) || 0), 0), TR = NR.map((_, i) => F.reduce((a, r) => a + r.rangos[i], 0)), TT = TR.reduce((a, x) => a + x, 0);
  h += '<div class="tw" style="max-height:640px"><table class="planilla dj-rm dj-tropas"><thead><tr><th>Tropa</th><th>Ingreso</th><th>Productor</th><th>Granja</th><th>Jaula</th><th class="num">Cabezas</th><th class="num">Faenadas</th><th class="num">Muertos</th><th class="num">Kg vivos</th><th class="num">Prom. vivo</th>' +
    NR.map(n => '<th class="num">' + esc(n) + '</th>').join('') + '</tr></thead><tbody>';
  for (const r of F) {
    const dias = r.dias.length > 1 ? '<div class="muted" style="font-size:11.5px">' + r.dias.map(([d, n]) => ddmm(d) + ': ' + fmt0(n)).join(' · ') + '</div>' : (r.dias.length ? '<div class="muted" style="font-size:11.5px">' + ddmm(r.dias[0][0]) + '</div>' : '');
    h += '<tr><td><b>' + esc(r.tropa) + '</b></td><td>' + ddmm(r.fecha) + '</td><td>' + esc(titulo(r.prod)) + '</td><td>' + esc(titulo(r.loc)) + '</td><td>' + esc(r.jaula) + '</td><td class="num">' + fmt0(r.cab) + '</td>' +
      '<td class="num">' + (r.fae ? fmt0(r.fae) : '<span class="muted">—</span>') + dias + '</td><td class="num">' + (r.mu ? fmt0(r.mu) : '') + '</td><td class="num">' + (r.kg ? fmt0(r.kg) : '') + '</td><td class="num">' + (r.prom ? fmt2(r.prom) : '') + '</td>' +
      r.rangos.map(n => '<td class="num">' + pct(n, r.totR) + '</td>').join('') + '</tr>';
  }
  h += '<tr class="tot"><td colspan="5">Total del mes</td><td class="num">' + fmt0(T('cab')) + '</td><td class="num">' + fmt0(T('fae')) + '</td><td class="num">' + fmt0(T('mu')) + '</td><td class="num">' + fmt0(T('kg')) + '</td><td class="num">' + (T('cab') && T('kg') ? fmt2(T('kg') / T('cab')) : '') + '</td>' +
    TR.map(n => '<td class="num">' + pct(n, TT) + '</td>').join('') + '</tr></tbody></table></div></section>';
  $('main').innerHTML = h;
}
function cambiarRangos() {
  pedir('Rangos de peso del romaneo (kg)', rangosT().join(', '), 'Los límites separados por coma. Ej.: 60, 70, 80, 90, 100 → hasta 60, 60–70, 70–80, 80–90, 90–100 y más de 100 kg.', v => {
    const L = [...new Set(String(v || '').split(/[,;\s]+/).map(x => Number(x.replace(',', '.'))).filter(x => x > 0))].sort((a, b) => a - b);
    if (!L.length) { toast('Poné al menos un límite.', true); return; }
    cambiarEq(d => { d.tropasRangos = L; }, 'Tropas: rangos de peso ' + L.join(', '));
  }, 'txt');
}
function excelTropas() {
  if (!window.XLSX) { toast('No se pudo cargar el Excel. Revisá internet.', true); return; }
  const F = filasTropas(), NR = nombresRangos(rangosT());
  const filas = [['Tropa', 'Ingreso', 'Productor', 'Granja', 'Jaula', 'Cabezas', 'Faenadas', 'Días de faena', 'Muertos', 'Kg vivos', 'Peso prom. vivo'].concat(NR.map(n => '% ' + n))];
  for (const r of F) filas.push([/^\d+$/.test(r.tropa) ? Number(r.tropa) : r.tropa, fechaDe(r.fecha), titulo(r.prod), titulo(r.loc), r.jaula, r.cab, r.fae || '', r.dias.map(([d, n]) => ddmm(d) + ': ' + n).join(' · '), r.mu || '', r.kg || '', r.prom ? Math.round(r.prom * 100) / 100 : '']
    .concat(r.rangos.map(n => r.totR ? Math.round(n / r.totR * 1000) / 1000 : '')));
  const ws = XLSX.utils.aoa_to_sheet(filas, { cellDates: true }), wb = XLSX.utils.book_new();
  ws['!cols'] = [{ wch: 10 }, { wch: 11 }, { wch: 28 }, { wch: 18 }, { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 22 }, { wch: 8 }, { wch: 10 }, { wch: 12 }].concat(NR.map(() => ({ wch: 13 })));
  XLSX.utils.book_append_sheet(wb, ws, 'TROPAS');
  guardarXlsx(wb, 'Tropas ' + S.mes + '.xlsx');
}
