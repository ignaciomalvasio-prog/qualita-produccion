/* Excel con formato, armado a mano (sin librerías): la librería de Excel de la página (SheetJS) no guarda letras, bordes ni
   medidas. Se usa para la DDJJ de desposte con el formato de la planilla de Sabi (29.10.2026.xls, pedido del 30/10):
   hoja INGRESO (tabla desde la fila 18) y hoja PROD (tabla desde la fila 32), A4, para el formulario preimpreso.
   XL.libro() → l.hoja(nombre, opciones) → h.set('B19', valor, estilo), h.merge('E18:F18') → l.bytes() (Uint8Array del .xlsx). */
const XL = (() => {
  const enc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colNum = c => { let n = 0; for (const ch of c) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const ref = r => { const m = /^([A-Z]+)(\d+)$/.exec(r); return { c: colNum(m[1]), r: +m[2] }; };
  const FMT = { '0': 1, '0.00': 2 };   // formatos que Excel ya trae; los demás van con número propio desde 164

  function libro() {
    const fonts = ['10|0'], borders = ['||||'], fmts = [], xfs = ['0|0|0|||0|'], hojas = [];
    const idx = (arr, k) => { let i = arr.indexOf(k); if (i < 0) { arr.push(k); i = arr.length - 1; } return i; };
    /* estilo: { sz, b, h, v, wrap, fmt, bd: { l, r, t, b } } (bordes 'thin' o 'medium') */
    function xf(e) {
      if (!e) return 0;
      const f = idx(fonts, (e.sz || 10) + '|' + (e.b ? 1 : 0));
      const bd = e.bd || {}, b = idx(borders, [bd.l || '', bd.r || '', bd.t || '', bd.b || ''].join('|') + '|');
      let n = 0;
      if (e.fmt) n = FMT[e.fmt] || (164 + idx(fmts, e.fmt));
      return idx(xfs, [f, b, n, e.h || '', e.v || '', e.wrap ? 1 : 0, ''].join('|'));
    }
    function hoja(nombre, op) {
      const celdas = {}, merges = [];
      const h = {
        nombre: String(nombre).replace(/[\\/?*[\]:]/g, '-').slice(0, 31), op: op || {},
        set(r, v, e) { celdas[r] = { v, s: xf(e) }; return h; },
        estilo(r, e) { if (!celdas[r]) celdas[r] = { v: null, s: xf(e) }; return h; },   // celda vacía con borde (parte de una combinada)
        merge(rango) { merges.push(rango); return h; },
        xml() {
          const o = h.op, filas = {};
          for (const k of Object.keys(celdas)) { const p = ref(k); (filas[p.r] = filas[p.r] || []).push({ k, c: p.c, x: celdas[k] }); }
          const altos = o.altos || {};
          const nums = [...new Set(Object.keys(filas).concat(Object.keys(altos)).map(Number))].sort((a, b) => a - b);
          let s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
          s += '<sheetPr><pageSetUpPr fitToPage="' + (o.ajustar ? 1 : 0) + '"/></sheetPr><sheetViews><sheetView workbookViewId="0" zoomScale="' + (o.zoom || 70) + '"/></sheetViews><sheetFormatPr defaultRowHeight="12.75"/>';
          const anchos = o.anchos || {};
          if (Object.keys(anchos).length) s += '<cols>' + Object.keys(anchos).map(c => colNum(c)).sort((a, b) => a - b).map(n => { const c = Object.keys(anchos).find(k => colNum(k) === n); return '<col min="' + n + '" max="' + n + '" width="' + anchos[c] + '" customWidth="1"/>'; }).join('') + '</cols>';
          s += '<sheetData>';
          for (const r of nums) {
            s += '<row r="' + r + '"' + (altos[r] ? ' ht="' + altos[r] + '" customHeight="1"' : '') + '>';
            for (const c of (filas[r] || []).sort((a, b) => a.c - b.c)) {
              const v = c.x.v, st = c.x.s ? ' s="' + c.x.s + '"' : '';
              if (v == null || v === '') s += '<c r="' + c.k + '"' + st + '/>';
              else if (typeof v === 'number') s += '<c r="' + c.k + '"' + st + '><v>' + v + '</v></c>';
              else if (v instanceof Date) s += '<c r="' + c.k + '"' + st + '><v>' + ((Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()) - Date.UTC(1899, 11, 30)) / 864e5) + '</v></c>';
              else if (typeof v === 'object' && v.f) s += '<c r="' + c.k + '"' + st + '><f>' + enc(v.f) + '</f>' + (v.v != null ? '<v>' + v.v + '</v>' : '') + '</c>';
              else s += '<c r="' + c.k + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + enc(v) + '</t></is></c>';
            }
            s += '</row>';
          }
          s += '</sheetData>';
          if (merges.length) s += '<mergeCells count="' + merges.length + '">' + merges.map(m => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>';
          const mg = o.margenes || { l: 0.7, r: 0.7, t: 0.75, b: 0.75 };
          s += '<pageMargins left="' + mg.l + '" right="' + mg.r + '" top="' + mg.t + '" bottom="' + mg.b + '" header="0.3" footer="0.3"/>';
          s += '<pageSetup paperSize="9" orientation="portrait"' + (o.ajustar ? ' fitToWidth="1" fitToHeight="1"' : ' scale="' + (o.escala || 100) + '"') + '/>';
          return s + '</worksheet>';
        }
      };
      hojas.push(h); return h;
    }
    function stylesXml() {
      let s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
      if (fmts.length) s += '<numFmts count="' + fmts.length + '">' + fmts.map((f, i) => '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + enc(f) + '"/>').join('') + '</numFmts>';
      s += '<fonts count="' + fonts.length + '">' + fonts.map(k => { const [sz, b] = k.split('|'); return '<font>' + (b === '1' ? '<b/>' : '') + '<sz val="' + sz + '"/><name val="Arial"/><family val="2"/></font>'; }).join('') + '</fonts>';
      s += '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>';
      s += '<borders count="' + borders.length + '">' + borders.map(k => { const [l, r, t, b] = k.split('|'); const one = (n, st) => st ? '<' + n + ' style="' + st + '"><color auto="1"/></' + n + '>' : '<' + n + '/>'; return '<border>' + one('left', l) + one('right', r) + one('top', t) + one('bottom', b) + '<diagonal/></border>'; }).join('') + '</borders>';
      s += '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>';
      s += '<cellXfs count="' + xfs.length + '">' + xfs.map(k => {
        const [f, b, n, h, v, w] = k.split('|');
        const al = h || v || w === '1' ? '<alignment' + (h ? ' horizontal="' + h + '"' : '') + (v ? ' vertical="' + v + '"' : '') + (w === '1' ? ' wrapText="1"' : '') + '/>' : '';
        return '<xf numFmtId="' + n + '" fontId="' + f + '" fillId="0" borderId="' + b + '" xfId="0"' + (n !== '0' ? ' applyNumberFormat="1"' : '') + ' applyFont="1" applyBorder="1"' + (al ? ' applyAlignment="1">' + al + '</xf>' : '/>');
      }).join('') + '</cellXfs>';
      return s + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    }
    function bytes() {
      const ws = hojas.map(h => h.xml()), te = new TextEncoder(), files = [];
      const add = (n, t) => files.push({ n, d: te.encode(t) });
      add('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        ws.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>');
      add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
      add('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        hojas.map((h, i) => '<sheet name="' + enc(h.nombre) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
      add('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        hojas.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
        '<Relationship Id="rId' + (hojas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
      add('xl/styles.xml', stylesXml());
      ws.forEach((x, i) => add('xl/worksheets/sheet' + (i + 1) + '.xml', x));
      return zip(files);
    }
    return { hoja, bytes };
  }

  /* .zip sin comprimir (alcanza para Excel) */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const te = new TextEncoder(), partes = [], central = []; let off = 0;
    const u16 = v => [v & 255, (v >>> 8) & 255], u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    const FECHA = [0, 0, 0x21, 0x5D];   // hora 00:00, fecha 01/01/2026
    for (const f of files) {
      const nb = te.encode(f.n), c = crc32(f.d);
      const loc = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), FECHA, u32(c), u32(f.d.length), u32(f.d.length), u16(nb.length), u16(0));
      partes.push(Uint8Array.from(loc), nb, f.d);
      central.push(Uint8Array.from([].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), FECHA, u32(c), u32(f.d.length), u32(f.d.length), u16(nb.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off))), nb);
      off += loc.length + nb.length + f.d.length;
    }
    const tamC = central.reduce((a, x) => a + x.length, 0);
    const fin = Uint8Array.from([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(tamC), u32(off), u16(0)));
    const todo = partes.concat(central, [fin]), out = new Uint8Array(todo.reduce((a, x) => a + x.length, 0));
    let p = 0; for (const x of todo) { out.set(x, p); p += x.length; }
    return out;
  }
  return { libro };
})();

/* ---------- DDJJ de desposte con el formato de la planilla (hojas INGRESO y PROD) ---------- */
function libroDJ(dias) {
  const L = XL.libro(), varios = dias.length > 1;
  const T = 'thin', M = 'medium';
  for (const f of dias) {
    const P = planilla(f), suf = varios ? ' ' + ddmm(f).replace('/', '-') : '';
    /* INGRESO: tabla desde la fila 18, 28 renglones (o más si hay más tropas), total con la merma */
    const hi = L.hoja('INGRESO' + suf, {
      anchos: { A: 12.56, B: 22.14, C: 20.41, D: 22.56, E: 10.71, F: 15.13, G: 11.28, H: 18.28, I: 30.13 },
      altos: { 1: 18.75, 2: 18.75, 3: 18.75, 4: 18.75, 5: 18.75, 6: 18.75, 7: 18.75, 8: 18.75, 9: 18.75, 10: 38.25, 11: 38.25, 12: 38.25, 13: 32.25, 14: 32.25, 15: 32.25, 16: 33, 17: 13.5, 18: 72 },
      ajustar: true, margenes: { l: 0.25, r: 0.25, t: 0.75, b: 0.75 }
    });
    const ei = (h, extra) => Object.assign({ sz: 14, b: 1, h: h || 'center', v: 'center', bd: { l: T, r: T, t: T, b: T } }, extra || {});
    const cabI = [['B', 'Fecha de Faena'], ['C', 'Nº de Tropa'], ['D', 'Total de tropa'], ['E', 'Cantidad de1/2 Reses Solicitadas'], ['G', 'Kilogramos de ingreso'], ['I', 'Observaciones']];
    cabI.forEach(([c, t]) => hi.set(c + '18', t, ei('center', { wrap: 1, bd: { l: c === 'B' ? M : T, r: T, t: T, b: T } })));
    hi.estilo('F18', ei()).estilo('H18', ei()).merge('E18:F18').merge('G18:H18');
    const n = Math.max(28, P.ingreso.length), ult = 18 + n;
    for (let i = 0; i < n; i++) {
      const r = 19 + i, t = P.ingreso[i];
      hi.op.altos[r] = 26.25;
      const fe = t && /^\d{4}-\d{2}-\d{2}$/.test(String(t.faena || '')) ? new Date(+t.faena.slice(0, 4), +t.faena.slice(5, 7) - 1, +t.faena.slice(8, 10)) : (t ? t.faena : null);
      const tro = t ? (/^\d+$/.test(String(t.tropa)) ? Number(t.tropa) : t.tropa) : null;
      const nn = v => (v == null || v === '' || isNaN(v)) ? null : Number(v);
      hi.set('B' + r, fe, ei('center', { fmt: 'dd/mm/yyyy', bd: { l: M, r: T, t: T, b: T } }));
      hi.set('C' + r, tro, ei()); hi.set('D' + r, t ? nn(t.cab) : null, ei());
      hi.set('E' + r, t ? nn(t.medias) : null, ei('center', { fmt: '0' })).estilo('F' + r, ei());
      hi.set('G' + r, t ? nn(t.kg) : null, ei('center', { fmt: '0' })).estilo('H' + r, ei());
      hi.set('I' + r, t ? (t.obs || '') : null, ei('center', { wrap: 1 }));
      hi.merge('E' + r + ':F' + r).merge('G' + r + ':H' + r);
    }
    const rt = ult + 1, merma = eq().merma || 1, tm = { l: M, r: M, t: M, b: M };
    hi.op.altos[rt] = 51;
    hi.set('E' + rt, 'TOTAL', ei('left', { v: 'bottom', bd: tm })).set('F' + rt, { f: 'SUM(E19:E' + ult + ')', v: P.tot.medias }, ei('center', { v: 'bottom', fmt: '0', bd: tm }));
    hi.set('G' + rt, 'TOTAL', ei('left', { v: 'bottom', bd: tm })).set('H' + rt, { f: 'SUM(G19:G' + ult + ')*' + merma, v: P.tot.kgDecl }, ei('center', { v: 'bottom', fmt: '0', bd: tm }));

    /* PROD: tabla desde la fila 32, escala 45 % como la planilla */
    const altos = {}; for (let r = 1; r <= 29; r++) altos[r] = 18.75; Object.assign(altos, { 26: 20.25, 30: 28.5, 31: 13.5, 32: 107.25 });
    const hp = L.hoja('PROD' + suf, { anchos: { A: 3.28, B: 13, C: 38.14, D: 22.14, E: 37.56, F: 37.85, G: 8.7, H: 31.56 }, altos, escala: 45, margenes: { l: 0.708, r: 0.708, t: 0.748, b: 0.394 } });
    const ep = (extra) => Object.assign({ sz: 18, h: 'center', v: 'center', bd: { l: T, r: T, t: T, b: T } }, extra || {});
    hp.set('B32', 'Nombre del corte', ep({ b: 1, wrap: 1, bd: { l: M, r: T, t: T, b: T } })).estilo('C32', ep()).merge('B32:C32');
    hp.set('D32', 'Cantidad de Cortes ', ep({ b: 1, wrap: 1 })).set('E32', 'Total de Kilogramos Producidos para Exportación', ep({ b: 1, wrap: 1 }))
      .set('F32', 'Total de Kilogramos Producidos Consumo', ep({ b: 1, wrap: 1 })).set('G32', 'Observaciones/Destino', ep({ b: 1, wrap: 1 })).estilo('H32', ep()).merge('G32:H32');
    const filas = P.filas, ini = 33, fin = ini + Math.max(filas.length, 1) - 1;
    filas.forEach((x, i) => {
      const r = ini + i; hp.op.altos[r] = 36;
      hp.set('B' + r, x.n, ep({ h: 'left', bd: { l: M, r: T, t: T, b: T } })).estilo('C' + r, ep()).merge('B' + r + ':C' + r);
      hp.set('D' + r, x.cant ? Number(x.cant) : null, ep());
      hp.set('E' + r, x.exp ? Number(x.exp) : null, ep({ fmt: '0.00' }));
      hp.set('F' + r, x.cons || x.exp ? Number(x.cons || 0) : null, ep({ fmt: '0.00' }));
      hp.set('G' + r, x.dest || '', ep({ b: 1 })).estilo('H' + r, ep()).merge('G' + r + ':H' + r);
    });
    const rT = fin + 1, rO = fin + 2, et = (h, extra) => Object.assign({ sz: 14, b: 1, h, v: 'center', bd: { l: T, r: T, t: T, b: T } }, extra || {});
    hp.op.altos[rT] = 36;
    hp.set('B' + rT, 'Totales', et('left', { bd: { l: M, r: T, t: T, b: T } })).estilo('C' + rT, et('left')).merge('B' + rT + ':C' + rT);
    hp.set('D' + rT, { f: 'SUM(D' + ini + ':D' + fin + ')', v: P.tot.cant }, et('center'));
    hp.set('E' + rT, { f: 'SUM(E' + ini + ':E' + fin + ')', v: P.tot.exp }, et('center', { fmt: '0.00' }));
    hp.set('F' + rT, { f: 'SUM(F' + ini + ':F' + fin + ')', v: P.tot.cons }, et('center', { fmt: '0.00' }));
    hp.estilo('G' + rT, et('center')).estilo('H' + rT, et('center')).merge('G' + rT + ':H' + rT);
    const obs = ' Observaciones:  ' + (P.obs || '');
    hp.op.altos[rO] = Math.max(36, Math.ceil(obs.length / 150) * 20 + 8);
    hp.set('B' + rO, obs, et('left', { v: 'top', wrap: 1, bd: { l: M, r: M, t: M, b: M } }));
    ['C', 'D', 'E', 'F', 'G', 'H'].forEach(c => hp.estilo(c + rO, et('left', { bd: { l: M, r: M, t: M, b: M } })));
    hp.merge('B' + rO + ':H' + rO);
  }
  return L.bytes();
}
