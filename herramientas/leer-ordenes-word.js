const fs = require('fs');
const files = fs.readdirSync('op').filter(f => f.endsWith('.txt'));
const CORTES = [['PATAS Y MANOS','Patas y manos'],['TAPA DE PALETA','Tapa de paleta'],['TAPA DE JAMON','Tapa de jamón'],['GRASA BUENA','Grasa buena'],['GRASA MALA','Grasa mala'],['GRASA','Grasa (sin separar)'],['JAMON','Jamón'],['PALETA','Paleta'],['PECHO','Pecho'],['CARRE','Carré'],['SOLOMILLO','Solomillo'],['MATAMBRE','Matambre'],['BONDIOLA','Bondiola'],['RECORTE','Recorte'],['CUERO','Cuero'],['TORTUGA','Tortuga'],['GARRON','Garrón'],['TOCINO','Tocino'],['CHURRASCO','Churrasco'],['PAPADA','Papada'],['OREJAS','Orejas'],['CABEZAS','Cabeza'],['CABEZA','Cabeza'],['PULMON','Pulmón'],['HIGADO','Hígado']];
const ORDEN_CORTES = ['Jamón','Paleta','Pecho','Carré','Solomillo','Matambre','Bondiola','Recorte','Grasa buena','Grasa mala','Grasa (sin separar)','Cuero','Tapa de paleta','Tapa de jamón','Tortuga','Garrón','Tocino','Churrasco','Papada','Orejas','Cabeza','Pulmón','Hígado','Patas y manos'];
const DEST = [[/GRION/,'Grion'],[/A?RGENCARNES/,'Argencarnes'],[/CARREFOUR/,'Carrefour'],[/ROVER/,'Rover'],[/CICLO 3/,'Ciclo 3'],[/GRAL\. DE ABASTECIMIENTO/,'Gral. de Abastecimiento'],[/SERVICIOS DE ALIMENTOS/,'Servicios de Alimentos'],[/SERAFINI/,'Serafini José'],[/SWIFT/,'Swift'],[/[“"]SUR[”"]/,'Sur'],[/MAFER/,'Mafer'],[/RENDERING/,'Rendering Qualitá'],[/ALICAN/,'Alican'],[/BOCANTINO/,'Bocantino'],[/SCURTIS/,'Scurtis'],[/LLUGDAR/,'Llugdar'],[/CONSUMO INTERNO/,'Consumo interno']];
const PROD = {
 'Jamón': [[/5 M[UÚ]SCULOS/,'5 músculos'],[/RECORTE DE JAMON CON GRASA/,'Recorte de jamón con grasa 3º'],[/CON HUESO SIN CUERO CON TAPA/,'Con hueso, sin cuero, con tapa'],[/CON HUESO SIN CUERO/,'Con hueso, sin cuero']],
 'Paleta': [[/S\/H Y C\/CUERO|SIN HUESO CON CUERO/,'Sin hueso, con cuero'],[/RECORTE DE PALETA INDUSTRIAL/,'Recorte de paleta industrial 3º'],[/CON HUESO SIN CUERO/,'Con hueso, sin cuero'],[/CON HUESO CON CUERO/,'Con hueso, con cuero'],[/INDUSTRIAL/,'Industrial']],
 'Recorte': [[/80\/20 BUENO/,'80/20 bueno'],[/80\/20/,'80/20'],[/70\/30/,'70/30'],[/60\/40/,'60/40'],[/50\/50/,'50/50']],
 'Papada': [[/CHURRASCO/,'Churrasco "P"']],
 'Cabeza': [[/LENGUA/,'Lengua, recorte de cabeza y orejas']],
};
const NOTAS = [[/DEJAR TODA LA TAPA DE JAMON Y REDONDEARLO/,'Dejar toda la tapa de jamón y redondearlo un poco; quitar el hueso de cadera como la muestra.'],[/MUY IMPORTANTE - DEJAR TODA LA TAPA/,'Muy importante: dejar toda la tapa del jamón.'],[/PRIMERA HORA/,'Primera hora.'],[/SALEN EL LUNES DEJAR A MANO/,'Salen el lunes, dejar a mano.'],[/SALE (LUNES|MARTES|MIERCOLES|JUEVES|VIERNES)/,m=>'Sale '+m[1].toLowerCase().replace('miercoles','miércoles')+'.'],[/SE CARGAN (EL LUNES|HOY)/,m=>'Se cargan '+m[1].toLowerCase()+'.'],[/GUARDAR EN T[UÚ]NEL CONTENEDOR/,'Guardar en túnel contenedor.'],[/OJO CON LA GRASA/,'Ojo con la grasa.'],[/ETIQUETAS ADENTRO/,'Etiquetas adentro.'],[/TIPO PANCETA/,'Tipo panceta.']];
const EXTRA = [[/INTERFOLIADOS EN ONDAS/,'interfoliados en ondas'],[/INTERFOLIADOS POR CAPAS/,'interfoliados por capas'],[/BOLSAS? (DE )?100 ?MIC/,'bolsa de 100 mic'],[/BOLSAS Y ETQ INDIVIDUAL/,'bolsas y etiqueta individual'],[/DE 10KG/,'de 10 kg'],[/DE 2\.3 A 2\.5KG/,'de 2,3 a 2,5 kg c/u']];
const UNI = {KG:'kg',UND:'unidades',CAJAS:'cajas',BONELES:'boneles'};
function parseLine(corte, t) {
  let s = t.trim(); const orig = s;
  let resto = false;
  if (/^RESTO:?\s*/.test(s)) { resto = true; s = s.replace(/^RESTO:?\s*/, ''); }
  if (/NO SACAR/.test(s)) return { tipo:'nosale', cant:'No sacar', cantNum:null, unidad:'', prod:'', envase:'', estado:'', cod:'', contrato:'', destino:'', nota:'', orig };
  let cantNum = null, unidad = '';
  const q = s.match(/^(\d+)\s*(KG|UND|CAJAS|BONELES)\b/);
  if (q) { cantNum = +q[1]; unidad = UNI[q[2]]; if (q[2]==='KG' ) s = s.slice(q[0].length); }
  const cod = (s.match(/C[O0]D\.?\s*(\d+)/) || s.match(/\((\d{3,5})\)/) || [])[1] || '';
  const contrato = (s.match(/CONTRATO\s*(\d+)/) || [])[1] || '';
  let destino = ''; for (const [re, n] of DEST) if (re.test(s)) { destino = n; break; }
  const estado = /CONGEL/.test(s) ? 'congelado' : /FRESC|RESCAS/.test(s) ? 'fresco' : '';
  let envase = /BONELES/.test(s) ? 'boneles' : /CANASTOS/.test(s) ? 'canastos' : /BINES/.test(s) ? 'bines' : /CAJAS/.test(s) ? 'cajas' : '';
  const extras = EXTRA.filter(([re]) => re.test(s)).map(e => e[1]);
  let prod = ''; for (const [re, n] of (PROD[corte] || [])) if (re.test(s)) { prod = n; break; }
  const notas = []; for (const [re, n] of NOTAS) { const m = s.match(re); if (m) notas.push(typeof n === 'function' ? n(m) : n); }
  const tipo = cantNum != null ? 'pedido' : resto ? 'resto' : 'todo';
  const cant = cantNum != null ? cantNum.toLocaleString('es-AR') + ' ' + unidad : resto ? 'Resto' : 'Todo';
  return { tipo, cant, cantNum, unidad, prod, envase, extra: extras.join(', '), estado, cod, contrato, destino, nota: notas.join(' '), orig };
}
const DIAS = {LUNES:'Lunes',MARTES:'Martes',MIERCOLES:'Miércoles',JUEVES:'Jueves',VIERNES:'Viernes'};
const MES = ['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const byDate = {};
for (const f of files) {
  const lines = fs.readFileSync('op/' + f, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
  const h = lines[0].match(/^(\w+)\s+(\d\d)-+(\d\d)-(\d\d)/);
  const fecha = `20${h[4]}-${h[3]}-${h[2]}`;
  const m = lines[1].match(/^(\d+)½\s*(\w+)/);
  const o = { fecha, dia: DIAS[h[1]], titulo: `${DIAS[h[1]]} ${+h[2]} de ${MES[+h[3]]}`, medias: +m[1], mercado: m[2][0] + m[2].slice(1).toLowerCase(), fuente: f.replace(/^[0-9a-f]+__/, '').replace(/\.txt$/, ''), cortes: [] };
  let cur = null;
  for (const l of lines.slice(2)) {
    let rest = l, found = null;
    for (const [lab, name] of CORTES) { if (l.startsWith(lab + ':')) { found = name; rest = l.slice(lab.length + 1).trim(); break; } }
    if (found) { cur = { corte: found, lineas: [] }; o.cortes.push(cur); }
    const parts = cur.corte === 'Hígado' ? rest.split(/\s+\/+\s+/) : [rest];
    for (const p of parts) {
      let pp = p; if (cur.corte === 'Hígado' && /^RESTO\b/.test(pp) && !/^RESTO:/.test(pp)) pp = pp.replace(/^RESTO\s*/, parts.length > 1 ? 'RESTO: ' : '');
      if (pp) cur.lineas.push(parseLine(cur.corte, pp));
    }
  }
  o.cortes.sort((a, b) => ORDEN_CORTES.indexOf(a.corte) - ORDEN_CORTES.indexOf(b.corte));
  if (byDate[fecha]) { if (JSON.stringify(byDate[fecha].cortes) !== JSON.stringify(o.cortes)) console.log('DUPLICADO DISTINTO', fecha); continue; }
  byDate[fecha] = o;
}
const ordenes = Object.values(byDate).sort((a, b) => a.fecha.localeCompare(b.fecha));
fs.writeFileSync('ordenes.json', JSON.stringify(ordenes, null, 1));
console.log(ordenes.length, 'órdenes:', ordenes.map(o => o.fecha.slice(5) + '=' + o.medias).join(' '));
// resumen de variantes
const g = {};
for (const o of ordenes) for (const c of o.cortes) for (const l of c.lineas) {
  const k = [c.corte, l.prod, l.estado, l.destino].join(' | ');
  (g[k] = g[k] || { n: 0, tipos: {}, cods: new Set(), env: new Set(), cants: [], dias: {} });
  g[k].n++; g[k].tipos[l.tipo] = (g[k].tipos[l.tipo] || 0) + 1; if (l.cod) g[k].cods.add(l.cod); g[k].env.add(l.envase); if (l.cantNum) g[k].cants.push(l.cantNum + l.unidad[0]); g[k].dias[o.dia.slice(0, 2)] = (g[k].dias[o.dia.slice(0, 2)] || 0) + 1;
}
for (const c of ORDEN_CORTES) for (const k of Object.keys(g).filter(k => k.startsWith(c + ' | ')).sort((a, b) => g[b].n - g[a].n))
  console.log(String(g[k].n).padStart(3), k, '·', JSON.stringify(g[k].tipos), 'cod:', [...g[k].cods].join(','), 'env:', [...g[k].env].join(','), g[k].cants.join(' '), JSON.stringify(g[k].dias));
