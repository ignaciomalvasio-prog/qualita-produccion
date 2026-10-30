/* Producción Qualitá.
   Dos pantallas de lectura (Producción y Medias) y una de carga (Pedidos).
   Datos en Firestore: todos leen; solo los editores escriben. */
(function () {
  'use strict';

  var FIREBASE = {
    version: '10.14.1',
    config: {
      apiKey: 'AIzaSyD9DSR82lLUigI8WeCjlR4nIc5I7xyjmTY',
      authDomain: 'qualita-produccion.firebaseapp.com',
      projectId: 'qualita-produccion',
      storageBucket: 'qualita-produccion.firebasestorage.app',
      messagingSenderId: '320933123950',
      appId: '1:320933123950:web:e0b62500e1ea43b088d37f'
    }
  };
  var IA_MODELO = 'claude-sonnet-5-5';

  var nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
  var n = function (v) { return v == null || isNaN(v) ? '—' : (v < 0 ? '−' : '') + nf.format(Math.abs(v)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var $ = function (id) { return document.getElementById(id); };
  var norm = function (s) { return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };

  var SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var TABS = ['inicio', 'pedidos', 'produccion', 'ciclo3', 'logistica', 'medias', 'rendering', 'clientes', 'camara'];
  // Artículos que solo se eligen a mano (no los usa la IA al leer pedidos): "CORTES", para casos eventuales (pedido de Renzo).
  var CORTES_A_MANO = ['CORTES'];
  var CORTES_BASE = ['JAMON', 'PALETA', 'PECHO', 'PANCETA CON CUERO', 'PANCETA SIN CUERO', 'CARRE SIN SOLOMILLO', 'CARRE CON SOLOMILLO', 'SOLOMILLO', 'CINTA DE LOMO', 'MATAMBRE', 'VACIO', 'BONDIOLA', 'RECORTE', 'GRASA BUENA', 'GRASA MALA', 'CUERO', 'TAPA DE PALETA', 'TAPA DE JAMON', 'TORTUGA', 'GARRON', 'TOCINO', 'CHURRASCO', 'PAPADA', 'HUESITOS', 'UNTO', 'CABEZA', 'OREJAS', 'PULMON', 'HIGADO', 'PATAS Y MANOS', 'LENGUA', 'CHINCHULIN', 'RIÑON', 'RABO', 'MENUDENCIAS', 'EMBUTIDOS', 'CHORIZO', 'MORCILLA', 'SALCHICHA'];

  var S = {
    faena: null, prod: null, pedidos: null, config: {}, ia: {}, status: 'loading', fuente: '',
    log: {},        // logística publicada, por fecha de entrega
    tab: 'inicio', mv: null, fm: null, sem: null, dia: null, fecha: null, entrega: null, fl: null,
    abierto: {},    // pedidos desplegados en el listado
    ventas: [],     // pedidos que mandan los vendedores externos desde /vendedor
    sel: {},        // pedidos tildados para armar un camión
    ec: null,       // camión que se está editando en Logística
    user: null, editor: false,
    em: null,   // semana en edición: { lunes, doc }
    ep: null,   // planilla de producción en edición: { fecha, doc }
    prop: [],   // pedidos leídos o cargados a mano, todavía sin guardar
    msg: {}
  };
  var store = null;

  /* ---------- fechas ---------- */
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fecha(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function hoy() { return iso(new Date()); }
  function mas(s, dias) { var d = fecha(s); d.setDate(d.getDate() + dias); return iso(d); }
  function diaDe(s) { return SEMANA[fecha(s).getDay()]; }
  function esHabil(s) { var g = fecha(s).getDay(); return g >= 1 && g <= 5; }
  function habilSiguiente(s) { var x = mas(s, 1); while (!esHabil(x)) x = mas(x, 1); return x; }
  function habilAnterior(s) { var x = mas(s, -1); while (!esHabil(x)) x = mas(x, -1); return x; }
  function lunesDe(s) { var g = fecha(s).getDay(); return mas(s, g === 0 ? -6 : 1 - g); }
  function tituloDe(s) { var d = fecha(s); return SEMANA[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }
  function fechaCorta(s) { var p = String(s).split('-'); return p[2] + '-' + p[1] + '-' + p[0].slice(2); }
  function etiquetaSemana(desde) {
    var a = fecha(desde), b = fecha(mas(desde, 4)), ma = MESES[a.getMonth()].slice(0, 3), mb = MESES[b.getMonth()].slice(0, 3);
    return ma === mb ? a.getDate() + ' al ' + b.getDate() + ' de ' + MESES[b.getMonth()] : a.getDate() + ' ' + ma + ' al ' + b.getDate() + ' ' + mb;
  }
  function ahoraTxt() { var d = new Date(); return d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3) + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

  /* ---------- planilla de medias ---------- */
  function semDe(lunes) {
    if (S.em && S.em.lunes === lunes) return S.em.doc;
    return (S.faena || []).filter(function (s) { return s.id === lunes; })[0] || null;
  }
  function prodDe(f) {
    if (S.ep && S.ep.fecha === f) return S.ep.doc;
    return (S.prod || []).filter(function (o) { return o.id === f; })[0] || null;
  }
  function sumas(d) {
    var p = 0, u = 0, c = 0;
    (d.faena || []).forEach(function (r) { p += +r.propios || 0; u += +r.usuarios || 0; });
    (d.clientes || []).forEach(function (r) { c += +r.cant || 0; });
    return { propios: p, usuarios: u, clientes: c, desposte: p - c, medias: (p - c) * 2 };
  }
  function desposteDe(f) { var o = prodDe('op-' + f) || prodDe(f); return o && o.medias !== '' && o.medias != null ? +o.medias || 0 : +S.config.desposteHabitual || 750; }

  // Stock de la semana. El stock inicial es lo que hay en cámara, propio y sin vender, al empezar el lunes.
  // Si no está cargado se deduce de la semana anterior.
  function stockSemana(lunes, nivel) {
    var sem = semDe(lunes); if (!sem) return null;
    var ini = sem.stockInicial !== '' && sem.stockInicial != null ? +sem.stockInicial : null, deducido = null;
    if ((nivel || 0) < 60) { var ant = stockSemana(mas(lunes, -7), (nivel || 0) + 1); if (ant && ant.fin != null) deducido = ant.fin; }
    var disp = ini != null ? ini : deducido, dias = [];
    (sem.dias || []).forEach(function (d, i) {
      var f = mas(lunes, i), s = sumas(d), sale = desposteDe(f);
      var rem = disp == null ? null : disp - sale;
      var sig = rem == null ? null : rem + s.medias;
      dias.push({ disponibleHoy: disp, desposteHoy: sale, remanente: rem, disponibleSig: sig, desposteSig: desposteDe(habilSiguiente(f)), camara: rem == null ? null : rem + (s.propios + s.usuarios) * 2 });
      disp = sig;
    });
    return { inicial: ini, deducido: deducido, dias: dias, fin: disp };
  }
  function semanaNueva(lunes) {
    var ant = semDe(mas(lunes, -7));
    return {
      desde: lunes, stockInicial: null,
      dias: [0, 1, 2, 3, 4].map(function (i) {
        var b = ant && ant.dias[i];
        return { fecha: mas(lunes, i), faena: b && b.faena.length ? clone(b.faena) : [{ origen: '', propios: 0, usuarios: 0 }], clientes: [] };
      })
    };
  }

  function diaHTML(sem, i, st, edit) {
    var d = sem.dias[i], f = mas(sem.desde, i), s = sumas(d), sig = diaDe(habilSiguiente(f)).toLowerCase(), k = st && st.dias[i];
    var h = '<section class="dia' + (f === hoy() ? ' hoy' : '') + '"><h2>' + esc(diaDe(f)) + ' ' + fecha(f).getDate() + '</h2>';
    h += '<table class="pl"><thead><tr><th>Faena</th><th>Propios</th><th>Usuarios</th>' + (edit ? '<th></th>' : '') + '</tr></thead><tbody>';
    (d.faena || []).forEach(function (r, j) {
      h += edit
        ? '<tr><td><input type="text" id="f' + i + '-' + j + 'o" data-m="faena" data-i="' + i + '" data-r="' + j + '" data-k="origen" value="' + esc(r.origen) + '" aria-label="Origen"></td>'
          + '<td><input type="number" inputmode="numeric" class="n" id="f' + i + '-' + j + 'p" data-m="faena" data-i="' + i + '" data-r="' + j + '" data-k="propios" value="' + esc(r.propios || '') + '" aria-label="Propios"></td>'
          + '<td><input type="number" inputmode="numeric" class="n" id="f' + i + '-' + j + 'u" data-m="faena" data-i="' + i + '" data-r="' + j + '" data-k="usuarios" value="' + esc(r.usuarios || '') + '" aria-label="Usuarios"></td>'
          + '<td class="xq"><button class="btn x" data-act="m-quitar" data-m="faena" data-i="' + i + '" data-r="' + j + '" aria-label="Quitar renglón">×</button></td></tr>'
        : '<tr><td>' + esc(r.origen) + '</td><td>' + (r.propios ? n(+r.propios) : '') + '</td><td>' + (r.usuarios ? n(+r.usuarios) : '') + '</td></tr>';
    });
    h += '</tbody><tfoot><tr><th>Total</th><td id="sp' + i + '">' + n(s.propios) + '</td><td id="su' + i + '">' + n(s.usuarios) + '</td>' + (edit ? '<td></td>' : '') + '</tr></tfoot></table>';
    if (edit) h += '<div class="acciones"><button class="btn sm" data-act="m-agregar" data-m="faena" data-i="' + i + '">+ Origen</button></div>';

    h += '<table class="pl"><thead><tr><th>Clientes</th><th>Cerdos</th>' + (edit ? '<th></th>' : '') + '</tr></thead><tbody>';
    if (!(d.clientes || []).length && !edit) h += '<tr><td class="muted" style="text-transform:none;font-weight:400">Sin pedidos de medias</td><td></td></tr>';
    (d.clientes || []).forEach(function (r, j) {
      h += edit
        ? '<tr><td><input type="text" id="c' + i + '-' + j + 'c" data-m="clientes" data-i="' + i + '" data-r="' + j + '" data-k="cliente" value="' + esc(r.cliente) + '" aria-label="Cliente"></td>'
          + '<td><input type="number" inputmode="decimal" step="0.5" class="n" id="c' + i + '-' + j + 'n" data-m="clientes" data-i="' + i + '" data-r="' + j + '" data-k="cant" value="' + esc(r.cant || '') + '" aria-label="Cerdos"></td>'
          + '<td class="xq"><button class="btn x" data-act="m-quitar" data-m="clientes" data-i="' + i + '" data-r="' + j + '" aria-label="Quitar cliente">×</button></td></tr>'
        : '<tr><td>' + esc(r.cliente) + (r.nota ? ' <span class="small muted" style="text-transform:none;font-weight:400">' + esc(r.nota) + '</span>' : '') + '</td><td>' + n(+r.cant || 0) + '</td></tr>';
    });
    h += '</tbody><tfoot><tr><th>Total clientes</th><td id="sc' + i + '">' + n(s.clientes) + '</td>' + (edit ? '<td></td>' : '') + '</tr></tfoot></table>';
    if (edit) h += '<div class="acciones"><button class="btn sm" data-act="m-agregar" data-m="clientes" data-i="' + i + '">+ Cliente</button>' + botonBorrar('m-vaciar', i, 'Vaciar este día') + '</div>';

    h += '<div class="desp" id="sd' + i + '">' + despHTML(s) + '</div>';
    h += '<dl class="stk" id="sk' + i + '">' + stockHTML(k, sig) + '</dl></section>';
    return h;
  }
  function despHTML(s) { return '<span>A desposte</span><span><b class="' + (s.desposte < 0 ? 'neg' : '') + '">' + n(s.desposte) + '</b> cerdos · <b>' + n(s.medias) + '</b> medias</span>'; }
  function stockHTML(k, sig) {
    if (!k || k.remanente == null) return '<dt>Stock</dt><dd class="muted">falta el stock inicial</dd>';
    var cap = +S.config.capacidadCamara || 0, falta = k.disponibleSig - k.desposteSig;
    return '<dt>Remanente del día</dt><dd class="' + (k.remanente < 0 ? 'neg' : '') + '">' + n(k.remanente) + '</dd>'
      + '<dt>Disponible el ' + sig + '</dt><dd>' + n(k.disponibleSig) + '</dd>'
      + '<dt>Desposte del ' + sig + '</dt><dd>' + n(k.desposteSig) + (falta < 0 ? ' <span class="badge crit">faltan ' + n(-falta) + '</span>' : '') + '</dd>'
      + '<dt>Medias en cámara</dt><dd>' + n(k.camara) + (cap && k.camara > cap ? ' <span class="badge crit">+' + n(k.camara - cap) + '</span>' : '') + '</dd>';
  }
  function pintarSumas() {
    var sem = S.em && S.em.doc; if (!sem) return;
    var st = stockSemana(S.em.lunes);
    sem.dias.forEach(function (d, i) {
      var s = sumas(d), f = mas(sem.desde, i);
      var set = function (id, v) { var e = $(id); if (e) e.innerHTML = v; };
      set('sp' + i, n(s.propios)); set('su' + i, n(s.usuarios)); set('sc' + i, n(s.clientes)); set('sd' + i, despHTML(s));
      set('sk' + i, stockHTML(st && st.dias[i], diaDe(habilSiguiente(f)).toLowerCase()));
    });
  }

  // Lo que ve el encargado: solo los clientes del día y cuántas medias lleva cada uno.
  function mvAct() { return S.editor ? (S.mv || 'semana') : 'dia'; }
  function conMedias(d) { return ((d && d.clientes) || []).filter(function (r) { return +r.cant > 0; }); }
  function animales(v) { return n(v) + (v === 1 ? ' animal' : ' animales'); }
  function fmInicial() { var h = hoy(); return esHabil(h) ? h : habilSiguiente(h); }
  function diaFaena(f) {
    var lunes = lunesDe(f), sem = semDe(lunes), i = Math.round((fecha(f) - fecha(lunes)) / 86400000);
    return sem && sem.dias[i] ? { sem: sem, i: i, d: sem.dias[i] } : null;
  }
  function renderMedias() {
    var el = $('view-medias');
    if (mvAct() === 'semana') return renderSemana();
    if (cargando(el, S.faena)) return;
    if (!S.fm) S.fm = fmInicial();
    var f = S.fm, x = diaFaena(f), cl = x ? conMedias(x.d) : [];
    var h = '<div class="nav"><button class="btn step" data-act="fm" data-d="-1" aria-label="Día anterior">‹</button><span class="tit">' + fechaTit(f) + '</span><button class="btn step" data-act="fm" data-d="1" aria-label="Día siguiente">›</button>'
      + '<input type="date" id="m-fecha" value="' + esc(f) + '" aria-label="Ir a una fecha">'
      + (cl.length ? '<button class="btn" data-act="imprimir">Imprimir</button><button class="btn wa" data-act="m-pdf" data-f="' + esc(f) + '">PDF<span class="m-largo"> por WhatsApp</span></button>' : '')
      + (S.editor && !S.solo && cl.length ? '<button class="btn' + (S.mdEdit ? ' pri' : '') + '" data-act="md-editar">' + (S.mdEdit ? 'Listo' : 'Editar') + '</button>' : '')
      + (S.editor && !S.solo ? '<button class="btn" data-act="m-semana"><span class="m-largo">Volver a la planilla de la semana</span><span class="m-corto">Semana</span></button><button class="btn" data-act="link-medias"><span class="m-largo">Copiar link para compartir</span><span class="m-corto">Link</span></button>' : '') + '</div>';
    var lu = lunesDe(f);
    h += '<div class="semtabs" role="group" aria-label="Días de la semana">' + [0, 1, 2, 3, 4].map(function (k) {
      var fk = mas(lu, k), xk = diaFaena(fk), tk = xk ? conMedias(xk.d).reduce(function (t, r) { return t + (+r.cant || 0); }, 0) : 0;
      return '<button class="btn" data-act="fm-ir" data-f="' + fk + '" aria-pressed="' + (fk === f) + '"><b>' + diaDe(fk).slice(0, 3) + ' ' + fecha(fk).getDate() + '</b><span>' + (tk ? n(tk) + '<i class="m-largo">' + (tk === 1 ? ' animal' : ' animales') + '</i>' : '<i class="m-largo">sin ventas</i><i class="m-corto">—</i>') + '</span></button>';
    }).join('') + '</div>';
    h += '<div class="panel"><h2 class="m-faena">Faena</h2><p class="m-sub">Animales para clientes</p>';
    if (!cl.length) {
      var con = []; (S.faena || []).forEach(function (sm) { sm.dias.forEach(function (d, k) { if (conMedias(d).length) con.push(mas(sm.id, k)); }); });
      con.sort();
      var ant = con.filter(function (z) { return z < f; }).slice(-1)[0], pos = con.filter(function (z) { return z > f; })[0];
      h += '<p class="state">No hay ventas a clientes cargadas para este día.</p>';
      if (ant || pos) h += '<div class="acciones" style="justify-content:center">' + [ant, pos].filter(Boolean).map(function (z) { return '<button class="btn" data-act="fm-ir" data-f="' + z + '">Ver el ' + esc(tituloDe(z).toLowerCase()) + '</button>'; }).join('') + '</div>';
    }
    else {
      var tot = cl.reduce(function (t, r) { return t + (+r.cant || 0); }, 0);
      var edM = S.editor && !S.solo && S.mdEdit;
      h += '<table class="pl cl-dia' + (edM ? ' md-ed' : '') + '"><thead><tr><th>Cliente</th>' + (edM ? '<th>Nota</th>' : '') + '<th>Animales</th></tr></thead><tbody>' + cl.map(function (r) {
        var j = x.d.clientes.indexOf(r), at = 'data-md="' + j + '" data-f="' + esc(f) + '"';
        if (edM) return '<tr><td><input type="text" ' + at + ' data-k="cliente" value="' + esc(r.cliente || '') + '" style="text-transform:uppercase" aria-label="Cliente"></td>'
          + '<td><input type="text" ' + at + ' data-k="nota" value="' + esc(r.nota || '') + '" placeholder="Ej.: NO GORDAS" style="text-transform:uppercase" aria-label="Nota de ' + esc(r.cliente || '') + '"></td>'
          + '<td><input type="number" inputmode="decimal" step="0.5" min="0" class="n" ' + at + ' data-k="cant" value="' + esc(r.cant || '') + '" aria-label="Animales de ' + esc(r.cliente || '') + '"></td></tr>';
        return '<tr><td>' + esc(r.cliente || 'Sin nombre') + (r.nota ? ' <span class="small muted" style="text-transform:none;font-weight:400">' + esc(r.nota) + '</span>' : '') + '</td><td>' + n(+r.cant || 0) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><th>Total</th><td>' + n(tot) + '</td></tr></tfoot></table>'
        + '<p class="small muted">Cantidades en animales enteros (un animal son dos medias). Salen de la faena del ' + esc(tituloDe(f).toLowerCase()) + ' y se entregan el ' + esc(tituloDe(habilSiguiente(f)).toLowerCase()) + '.</p>';
    }
    el.innerHTML = h + '</div>';
  }

  /* Faena pegada desde Excel: cada número va a su día (lunes a viernes) con su origen, propios y usuarios, tal cual.
     Acepta la planilla con los días uno al lado del otro (como la semanal) o uno debajo del otro.
     Solo reemplaza la faena de los días que trae; los clientes (que salen de los pedidos) no se tocan. */
  var DIAS_SEM = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];
  function leerFaenaPegada(txt) {
    var filas = String(txt || '').replace(/\r/g, '').split('\n').map(function (r) { return r.split('\t').map(function (c) { return c.replace(/ /g, ' ').trim(); }); });
    filas = filas.filter(function (r) { return r.some(function (c) { return c; }); });
    // Si todo viene corrido a la derecha (columnas vacías a la izquierda), se acomoda.
    var corr = Math.min.apply(null, filas.map(function (r) { var i = 0; while (i < r.length && !r[i]) i++; return i; }).concat([999]));
    if (corr > 0 && corr < 999) filas = filas.map(function (r) { return r.slice(corr); });
    var diaDe = function (c) { var m = norm(c).match(/^(LUNES|MARTES|MIERCOLES|JUEVES|VIERNES)\b/); return m ? DIAS_SEM.indexOf(m[1]) : -1; };
    var esNum = function (c) { return /^-?\d[\d.,]*$/.test(String(c || '').replace(/\s/g, '')); };
    var num = function (c) { c = String(c || '').replace(/\s/g, ''); return esNum(c) ? (c.charAt(0) === '-' ? -numero(c.slice(1)) : numero(c)) : 0; };
    var corta = function (c) { return /^(TOTAL|CLIENTES?|DESPOSTE|CERDOS|STOCK|REMANENTE|DISPONIBLE)\b/.test(norm(c)); };
    var titulo = function (c) { return /^(FAENA|ORIGEN|PROPIOS?|USUARIOS?)$/.test(norm(c)); };
    var res = {}, nums = {};
    var hi = -1; filas.some(function (r, i) { if (r.filter(function (c) { return diaDe(c) >= 0; }).length >= 2) { hi = i; return true; } return false; });
    if (hi >= 0) {
      // Días uno al lado del otro: cada día ocupa sus columnas, hasta donde empieza el siguiente.
      var ini = []; filas[hi].forEach(function (c, j) { var d = diaDe(c); if (d >= 0) { ini.push({ d: d, j: j }); var mn = norm(c).match(/\b(\d{1,2})\b/); if (mn) nums[d] = +mn[1]; } });
      ini.forEach(function (x, k) {
        var ancho = ini.length > 1 ? ini[1].j - ini[0].j : 1e6, fin = k + 1 < ini.length ? ini[k + 1].j : x.j + ancho, po = -1, uo = -1, desde = hi + 1;
        for (var r = hi; r < Math.min(filas.length, hi + 4); r++) for (var j = x.j; j < Math.min(filas[r].length, fin); j++) {
          var nc = norm(filas[r][j]);
          if (/^PROPIO/.test(nc) && po < 0) { po = j; desde = Math.max(desde, r + 1); }
          if (/^USUARI/.test(nc) && uo < 0) { uo = j; desde = Math.max(desde, r + 1); }
        }
        if (po < 0) po = uo > x.j + 1 ? uo - 1 : x.j + 1;
        if (uo < 0) uo = po + 1;
        var oc = po > x.j ? x.j : po - 1, lista = [];
        for (var r2 = desde; r2 < filas.length; r2++) {
          var f = filas[r2], o = f[oc] || '', pr = f[po] || '', us = f[uo] || '';
          if (corta(o) || corta(pr) || diaDe(o) >= 0) break;
          if (titulo(o) || titulo(pr)) continue;
          if (!esNum(pr) && !esNum(us)) continue;
          lista.push({ origen: esNum(o) ? '' : o.toUpperCase().replace(/\s+/g, ' '), propios: num(pr), usuarios: num(us) });
        }
        res[x.d] = lista;
      });
    } else {
      // Días uno debajo del otro: una fila con el día y abajo sus orígenes (o el día al principio de cada fila).
      var cur = -1, parado = false;
      filas.forEach(function (r) {
        var i = 0, d = diaDe(r[0]);
        if (d >= 0) { cur = d; parado = false; res[cur] = res[cur] || []; var mn2 = norm(r[0]).match(/\b(\d{1,2})\b/); if (mn2) nums[d] = +mn2[1]; i = 1; while (i < r.length && !r[i]) i++; if (i >= r.length) return; }
        if (cur < 0 || parado) return;
        var o = r[i] || '';
        if (corta(o)) { parado = true; return; }
        if (titulo(o)) return;
        var pr, us;
        if (esNum(o)) { pr = o; us = r[i + 1]; o = ''; } else { pr = r[i + 1]; us = r[i + 2]; }
        if (!esNum(pr) && !esNum(us)) return;
        res[cur].push({ origen: o.toUpperCase().replace(/\s+/g, ' '), propios: num(pr), usuarios: num(us) });
      });
    }
    Object.keys(res).forEach(function (k) { res[k] = res[k].filter(function (x) { return x.origen || x.propios || x.usuarios; }); });
    Object.defineProperty(res, 'nums', { value: nums, enumerable: false });
    return res;
  }
  // La semana sale de las fechas del encabezado ("Lunes 19"): la más cercana a la que se está mirando que coincida.
  function semanaPegada(res, base) {
    if (res.lunes) return res.lunes;
    var nums = res.nums || {}, ks = Object.keys(nums);
    if (!ks.length) return base;
    var cand = [0, -7, 7, -14, 14, -21, 21, -28, 28].map(function (d) { return mas(base, d); });
    return cand.filter(function (l) { return ks.every(function (k) { return fecha(mas(l, +k)).getDate() === nums[k]; }); })[0] || base;
  }
  function faenaPegadaHTML(res, lunes) {
    var ks = Object.keys(res).filter(function (k) { return res[k].length; });
    var pre = '<p class="small"><b>Va a la semana del ' + esc(etiquetaSemana(lunes)) + '.</b> Revisá que cada día tenga lo que corresponde y tocá Guardar faena.</p>';
    if (!ks.length) return String((S.pf && S.pf.txt) || '').trim() ? '<p class="aviso-pf">No encontré la faena. Copiá las celdas con los nombres de los días (LUNES, MARTES…) y las columnas PROPIOS y USUARIOS.</p>' : '';
    return pre + '<div class="dias pf-dias">' + [0, 1, 2, 3, 4].map(function (i) {
      var l = res[i], f = mas(lunes, i), tp = 0, tu = 0;
      var h = '<section class="dia"><h2>' + esc(diaDe(f)) + ' ' + fecha(f).getDate() + '</h2>';
      if (!l || !l.length) return h + '<p class="small muted">No viene en lo pegado: queda como está.</p></section>';
      h += '<table class="pl"><thead><tr><th>Faena</th><th>Propios</th><th>Usuarios</th></tr></thead><tbody>' + l.map(function (r) { tp += r.propios; tu += r.usuarios; return '<tr><td>' + esc(r.origen) + '</td><td>' + (r.propios ? n(r.propios) : '') + '</td><td>' + (r.usuarios ? n(r.usuarios) : '') + '</td></tr>'; }).join('')
        + '</tbody><tfoot><tr><th>Total</th><td>' + n(tp) + '</td><td>' + n(tu) + '</td></tr></tfoot></table>';
      return h + '</section>';
    }).join('') + '</div>';
  }
  // De una foto o captura de la planilla: la IA la lee y se toma solo la faena (los clientes salen de los pedidos).
  function faenaDeLectura(datos) {
    var res = {}, fechas = [];
    (datos && datos.planilla || []).forEach(function (d) {
      var i = DIAS_SEM.indexOf(norm(d.dia));
      if (i < 0 && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '')) { var g = fecha(d.fecha).getDay(); if (g >= 1 && g <= 5) i = g - 1; }
      if (i < 0) return;
      res[i] = (d.faena || []).map(function (r) { return { origen: String(r.origen || '').toUpperCase().replace(/\s+/g, ' ').trim(), propios: +r.propios || 0, usuarios: +r.usuarios || 0 }; })
        .filter(function (x) { return x.origen || x.propios || x.usuarios; });
      if (/^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '')) fechas.push(d.fecha);
    });
    var lunes = fechas.length ? lunesDe(fechas[0]) : null;
    if (lunes) Object.defineProperty(res, 'lunes', { value: lunes, enumerable: false });
    return res;
  }
  function leerFaenaFoto(file) {
    if (!S.pf) return;
    S.pf.leyendo = true; S.pf.error = ''; S.pf.res = null; render();
    var lectura = window.__mock && window.__mock.ia ? Promise.resolve(window.__mock.ia('faena', file.name)) : achicar(file).then(function (b64) {
      return pedirIA([{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text: 'Esta imagen es la planilla semanal de faena y medias. Cargá "planilla" con cada día, prestando especial atención a la faena: cada fila con su origen y los números de PROPIOS y USUARIOS tal cual figuran. Dejá "pedidos" vacío.' }]);
    });
    lectura.then(function (datos) {
      if (!S.pf) return;
      var res = faenaDeLectura(datos);
      S.pf.leyendo = false;
      if (!Object.keys(res).some(function (k) { return res[k].length; })) S.pf.error = 'No encontré la faena en la imagen. Probá con una captura donde se vean los días y las columnas PROPIOS y USUARIOS.';
      else { S.pf.res = res; S.pf.txt = ''; }
      render();
    }, function (err) { if (!S.pf) return; S.pf.leyendo = false; S.pf.error = (err && err.message) || 'No se pudo leer la imagen.'; render(); });
  }
  function resPegada() { return S.pf && S.pf.res ? S.pf.res : leerFaenaPegada(S.pf && S.pf.txt); }
  function guardarFaenaPegada(res, lunes) {
    var sem = clone(semDe(lunes) || semanaNueva(lunes)), nd = 0;
    Object.keys(res).forEach(function (k) { if (res[k].length && sem.dias[+k]) { sem.dias[+k].faena = clone(res[k]); nd++; } });
    if (!nd) return Promise.resolve(0);
    var sl = limpiarSemana(sem); S.faena = poner(S.faena, lunes, sl);
    return store.set('faena', lunes, sl).then(function () { tocar(); return nd; });
  }
  function pegarFaenaPanelHTML(lunes) {
    var res = resPegada(), hay = !S.pf.leyendo && Object.keys(res).some(function (k) { return res[k].length; });
    lunes = semanaPegada(res, lunes);
    var conIA = !!(S.ia && S.ia.clave) || !!(window.__mock && window.__mock.ia);
    var prev = S.pf.leyendo ? '<p class="state">Leyendo la imagen… tarda unos segundos.</p>' : (S.pf.error ? '<p class="aviso-pf">' + esc(S.pf.error) + '</p>' : '') + faenaPegadaHTML(res, lunes);
    return '<div class="panel pf"><h2>Cargar faena: Excel, captura o foto</h2>'
      + '<p class="small muted">Copiá en el Excel la faena de la semana (con los días arriba y las columnas PROPIOS y USUARIOS) y pegala acá con Ctrl+V. También podés pegar una captura o subir una foto de la planilla. Abajo ves cómo queda cada día antes de guardar. Solo cambia la faena: los clientes siguen saliendo de los pedidos.</p>'
      + '<div class="acciones pf-foto">' + (conIA ? '<label class="btn"><input type="file" id="pf-foto" accept="image/*" hidden>Subir foto o captura</label><span class="small muted">o pegá la captura con Ctrl+V</span>' : '<span class="small muted">Para leer fotos o capturas falta cargar la clave de IA (en Pedidos, abajo, en Configuración).</span>') + '</div>'
      + '<textarea id="pf-txt" rows="7" placeholder="Pegá acá las celdas del Excel o una captura">' + esc(S.pf.txt || '') + '</textarea>'
      + '<div id="pf-prev">' + prev + '</div>'
      + '<div class="acciones"><button class="btn pri" data-act="pf-guardar" id="pf-guardar"' + (hay ? '' : ' disabled') + '>Guardar faena</button><button class="btn" data-act="pf-cancelar">Cancelar</button></div></div>';
  }
  function renderSemana() {
    var el = $('view-medias');
    if (cargando(el, S.faena)) return;
    var lunes = S.sem || lunesDe(esHabil(hoy()) ? hoy() : habilSiguiente(hoy()));
    S.sem = lunes;
    var sem = semDe(lunes), edit = !!(S.em && S.em.lunes === lunes);
    if (S.dia == null) { var g = fecha(hoy()).getDay(); S.dia = lunesDe(hoy()) === lunes && g >= 1 && g <= 5 ? g - 1 : 0; }
    var h = '<div class="nav"><button class="btn step" data-act="sem" data-d="-7" aria-label="Semana anterior">‹</button><span class="tit">Semana del ' + esc(etiquetaSemana(lunes)) + '</span><button class="btn step" data-act="sem" data-d="7" aria-label="Semana siguiente">›</button>';
    if (sem) h += '<button class="btn" data-act="imprimir">Imprimir</button>';
    h += '<button class="btn" data-act="m-dia">Ver como la ven los demás</button>' + (S.editor ? '<button class="btn" data-act="link-medias">Copiar link para compartir</button>' : '');
    if (S.editor && sem) h += '<button class="btn' + (edit ? ' pri' : '') + '" data-act="m-editar">' + (edit ? 'Listo' : 'Editar') + '</button><span class="guardado" id="g-medias"></span>';
    if (S.editor && !edit && !S.pf) h += '<button class="btn" data-act="pf-abrir">Cargar faena (Excel o captura)</button>';
    h += '</div>';
    if (S.editor && S.pf && !edit) h += pegarFaenaPanelHTML(lunes);
    if (!sem) {
      h += '<div class="panel"><p class="state">No hay faena cargada para esta semana.</p>' + (S.editor ? cargaHTML('m-nueva') : '') + '</div>';
      el.innerHTML = h; pintarMsg('fotos'); return;
      el.innerHTML = h; return;
    }
    if (S.editor && S.msg.fotos) h += '<p class="guardado" id="g-fotos"></p>';
    var st = stockSemana(lunes);
    if (edit) {
      h += '<div class="panel"><label class="campo" style="max-width:340px"><span>Medias propias en cámara al empezar el lunes</span><input type="number" inputmode="numeric" id="m-stock" value="' + esc(sem.stockInicial == null ? '' : sem.stockInicial) + '" placeholder="' + (st.deducido != null ? 'Se deduce: ' + n(st.deducido) : 'Sin dato') + '"></label>'
        + '<p class="small muted">Dejalo vacío para que se deduzca de la semana anterior. Cada cambio se guarda solo.</p>'
        + '<div class="acciones">' + botonBorrar('m-borrar-semana', null, 'Borrar toda la semana') + '</div></div>';
    }
    h += '<div class="dtabs" role="group" aria-label="Día">' + sem.dias.map(function (d, i) { var f = mas(lunes, i); return '<button class="btn" data-act="dia" data-i="' + i + '" aria-pressed="' + (S.dia === i) + '">' + diaDe(f).slice(0, 3) + ' ' + fecha(f).getDate() + '</button>'; }).join('') + '</div>';
    h += '<div class="dias" data-sel="' + S.dia + '">' + sem.dias.map(function (d, i) { return diaHTML(sem, i, st, edit); }).join('') + '</div>';
    el.innerHTML = h;
    pintarMsg('medias'); pintarMsg('fotos');
  }

  /* ---------- planilla de producción ----------
     Arranca vacía y se arma sumando cortes desde los pedidos, un renglón por pedido.
     También se puede escribir a mano, como un texto. */
  function esPedido(t) { return /^\s*\d/.test(t || ''); }
  function sinResto(t) { return String(t || '').replace(/^\s*RESTO\s*:?\s*/i, ''); }
  function corteDe(o, nombre) { var k = norm(nombre); return (o.cortes || []).filter(function (c) { return norm(c.corte) === k; })[0] || null; }
  function ordenCorte(nombre) { var x = norm(nombre), i = CORTES_BASE.map(norm).indexOf(x === 'CARRE' ? 'CARRE SIN SOLOMILLO' : x); return i < 0 ? 999 : i; }
  // Achuras y frescos que salen de FAENA (pedido de Renzo): van en una planilla aparte, con su propio título.
  var CORTES_FAENA = ['CABEZA', 'OREJAS', 'PULMON', 'HIGADO', 'PATAS Y MANOS', 'LENGUA', 'CHINCHULIN', 'RIÑON', 'RABO', 'MENUDENCIAS'].map(norm);
  function esFaena(corte) { var x = norm(corte); return CORTES_FAENA.indexOf(x) >= 0 || /^(PATAS?|MANOS?|CABEZAS?|OREJAS?|RIÑON|RINON|RIÑONES|RINONES|LENGUAS?|CHINCHULIN(ES)?|RABOS?)\b/.test(x); }
  // "Pechito con manta" no es manta doble: en la planilla esos renglones van a PECHO (pedido de Renzo).
  // Solo quedan en PECHO MANTA DOBLE los que dicen "DOBLE".
  // Ya no hay rubros "PECHO MANTA DOBLE" ni "PECHO MANTA DOBLE CON CUERO": todo es PECHO (pedido de Renzo).
  // Los pedidos y planillas que todavía los tengan se pasan a PECHO una vez, cuando entra un editor.
  var PECHOS_VIEJOS = ['PECHO MANTA DOBLE', 'PECHO MANTA DOBLE CON CUERO'];
  function esPechoViejo(c) { return PECHOS_VIEJOS.indexOf(norm(c || '')) >= 0; }
  var migrandoPecho = {};
  function migrarPecho() {
    if (!S.editor) return;
    var fechas = {}, t = [];
    (S.pedidos || []).forEach(function (p) {
      if (migrandoPecho['p' + p.id] || !(p.cortes || []).some(function (c) { return esPechoViejo(c.corte); })) return;
      migrandoPecho['p' + p.id] = 1;
      var doc = clone(p), id = doc.id; delete doc.id;
      doc.cortes = doc.cortes.map(function (c) { if (esPechoViejo(c.corte)) c.corte = 'PECHO'; return c; });
      S.pedidos = poner(S.pedidos, id, doc); t.push(store.set('pedidos', id, doc)); if (doc.entrega) fechas[doc.entrega] = 1;
    });
    (S.prod || []).forEach(function (o) {
      if (migrandoPecho['o' + o.id] || !(o.cortes || []).some(function (c) { return esPechoViejo(c.corte); })) return;
      migrandoPecho['o' + o.id] = 1;
      var x = clone(o), id = x.id, pe = x.cortes.filter(function (c) { return norm(c.corte) === 'PECHO'; })[0];
      x.cortes.forEach(function (c) { if (!esPechoViejo(c.corte)) return; if (pe) { pe.lineas = pe.lineas.concat(c.lineas); c.lineas = []; } else { c.corte = 'PECHO'; pe = c; } });
      x.cortes = x.cortes.filter(function (c) { return !esPechoViejo(c.corte) || c.lineas.length; });
      var dl = limpiarOrden(x); S.prod = poner(S.prod, id, dl); t.push(store.set('produccion', id, dl));
    });
    if (!t.length) return;
    Promise.all(t).then(function () { return Promise.all(Object.keys(fechas).filter(function (f) { return logDe(f); }).map(function (f) { return publicarLog(f); })); }).then(function () { tocar(); if (!escribiendo()) render(); }, function () {});
  }
  function unirPecho(o) {
    var md = (o.cortes || []).filter(function (c) { return norm(c.corte) === 'PECHO MANTA DOBLE'; })[0]; if (!md) return o;
    var pasan = md.lineas.filter(function (l) { return !/DOBLE/.test(norm(l.t)); }); if (!pasan.length) return o;
    var x = clone(o), m2 = x.cortes.filter(function (c) { return norm(c.corte) === 'PECHO MANTA DOBLE'; })[0], pe = x.cortes.filter(function (c) { return norm(c.corte) === 'PECHO'; })[0];
    if (!pe) { pe = { corte: 'PECHO', lineas: [] }; x.cortes.splice(x.cortes.indexOf(m2), 0, pe); }
    pe.lineas = pe.lineas.concat(m2.lineas.filter(function (l) { return !/DOBLE/.test(norm(l.t)); }));
    m2.lineas = m2.lineas.filter(function (l) { return /DOBLE/.test(norm(l.t)); });
    if (!m2.lineas.length) x.cortes.splice(x.cortes.indexOf(m2), 1);
    return x;
  }
  function partirFaena(o) { var a = clone(o), b = clone(o); a.cortes = (o.cortes || []).filter(function (c) { return !esFaena(c.corte); }); b.cortes = (o.cortes || []).filter(function (c) { return esFaena(c.corte); }); return { emp: a, fae: b }; }   // "CARRE" solo quedó en pedidos viejos
  /* Los embutidos (chorizo, morcilla, salchicha) se muestran en Producción, aparte, como "Embutidos". Se guardan
     en la misma colección "produccion" con el id "c3-AAAA-MM-DD"; la de desposte sigue con el id "AAAA-MM-DD".
     El link del Ciclo III (/ciclo3) muestra solo los embutidos. */
  function esC3(id) { return /^c3-/.test(String(id || '')); }
  /* Orden de producción completa (como la que se mandaba en Word): todos los cortes con su destino, un documento por día
     (produccion/op-AAAA-MM-DD). Arranca de la orden anterior o de la orden base, y se modifica a mano. Va aparte de la
     planilla de frescos (produccion/AAAA-MM-DD), que se arma desde los pedidos. */
  function esOP(id) { return /^op-/.test(String(id || '')); }
  var OP_BASE = ['JAMON: RESTO: RECORTE DE JAMON CON GRASA 3º (COD 359) FRESCO EN BINES “ARGENCARNES”',
    'PALETA: RESTO: PALETA SIN HUESO SIN CUERO SIN GRASA SIN GARRON CAJAS A CONGELAR (COD 377)',
    'PECHO: CONGELAR EN CAJAS “CARREFOUR” (COD 30216)', 'CARRE: CAJAS A CONGELAR “CARREFOUR” (COD 30276)',
    'SOLOMILLO: CAJAS A CONGELAR INTERFOLIADOS EN ONDAS “CARREFOUR” (COD 30287)', 'MATAMBRE: CAJAS A CONGELAR “SUR” (COD 240)',
    'BONDIOLA: CAJAS A CONGELAR “CARREFOUR” (COD 30105)', 'RECORTE: 1000KG 80/20 FRESCOS EN CANASTOS CICLO 3\nRESTO: 60/40 FRESCO EN BINES “ARGENCARNES”',
    'GRASA: CANASTOS A CONGELAR (COD 479)', 'CUERO: CANASTOS A CONGELAR (COD 412)',
    'TAPA DE PALETA: CAJAS A CONGELAR (COD 156 – CONTRATO 10) “ARGENCARNES”', 'TAPA DE JAMON: BONELES A CONGELAR (COD 336 – CONTRATO 2)',
    'TORTUGA: FRESCA EN BINES “ARGENCARNES”', 'GARRON: FRESCO EN BINES “ARGENCARNES”', 'TOCINO: FRESCO EN BINES “ARGENCARNES”',
    'CHURRASCO: CAJAS A CONGELAR INTERFOLIADOS POR CAPAS “CARREFOUR” (COD 30246)', 'PAPADA: PRODUCIR CHURRASCO “P” (COD 245) ETIQUETAS ADENTRO',
    'OREJAS: CONGELAR EN CAJAS DE 10KG (CONSUMO INTERNO - COD 611)', 'CABEZA: LENGUA - RECORTE DE CABEZA - OREJAS',
    'PULMON: FRESCO “RENDERING – QUALITA”', 'HIGADO: FRESCO ALICAN', 'PATAS Y MANOS: NO SACAR'].join('\n\n');
  function opBaseTxt() { return String((S.config && S.config.opBase) || OP_BASE); }
  function opVacia(f) { return { fecha: f, linea: 'op', medias: +S.config.desposteHabitual || 750, mercado: 'CONSUMO', estado: 'borrador', cortes: [] }; }
  function opAnterior(f) { return (S.prod || []).filter(function (o) { return esOP(o.id) && o.id.slice(3) < f && (o.cortes || []).length; }).sort(function (a, b) { return a.id < b.id ? 1 : -1; })[0] || null; }
  function opNueva(f, desde) {
    var ant = desde === 'ant' ? opAnterior(f) : null, o = opVacia(f);
    if (ant) { o.medias = ant.medias; o.mercado = ant.mercado || 'CONSUMO'; o.cortes = clone(ant.cortes || []); return o; }
    return parsearOrden(opBaseTxt(), o);
  }
  function opTexto(o) { return [diaDe(o.fecha).toUpperCase() + ' ' + fechaCorta(o.fecha), docDeOrden(o)].join('\n\n'); }
  // Un renglón de la orden: la cantidad del principio y los nombres entre comillas, resaltados.
  function opLineaHTML(t) {
    var s = String(t || ''), pre = '', m = s.match(/^\s*RESTO:\s*/i);
    if (m) { pre = '<b class="op-resto">RESTO:</b> '; s = s.slice(m[0].length); }
    var q = s.match(/^\d[\d.,]*\s*(?:KGS?|KILOS?|UND|UNIDADES|CAJAS?|CANASTOS?|BINES?)\b|^\d[\d.,]*(?=\s)/i), cant = '';
    if (q) { cant = '<b class="op-cant">' + esc(q[0]) + '</b>'; s = s.slice(q[0].length); }
    var cuerpo = s.split(/([“"][^”"]+[”"])/).map(function (x, i) { return i % 2 ? '<b class="op-cli">' + esc(x) + '</b>' : esc(x); }).join('');
    return pre + cant + cuerpo;
  }
  function opHTML(o, f) {
    var h = '<div class="panel hoja op-hoja"><header class="hoja-cab"><div><p class="hoja-sup">Orden de producción</p><h2>PRODUCCIÓN · ' + esc(tituloDe(f)) + '</h2></div>'
      + '<div class="hoja-dato"><b>' + n(+o.medias || 0) + '½</b><span>' + esc(o.mercado || 'medias') + '</span></div>'
      + (o.estado === 'borrador' ? '<span class="badge warn">Borrador</span>' : '<span class="badge ok">Confirmada</span>') + '</header>';
    h += '<div class="acciones hoja-acc">' + (S.editor ? '<button class="btn pri" data-act="p-editar" data-id="op-' + f + '">Editar la orden</button>' : '') + '<button class="btn" data-act="copiar" data-t="op">Copiar como texto</button><button class="btn wa" data-act="wa-pdf">PDF por WhatsApp</button><button class="btn" data-act="hoja-pdf">Compartir PDF</button><span class="small muted" id="copiado-op" aria-live="polite"></span></div>';
    h += '<div class="op-lista">' + (o.cortes || []).map(function (c) {
      var ls = c.lineas.length ? c.lineas : [{ t: '' }];
      return '<div class="op-c"><p><u class="op-corte">' + esc(c.corte || '') + '</u>: ' + opLineaHTML(ls[0].t) + '</p>' + ls.slice(1).map(function (l) { return '<p class="op-sig">' + opLineaHTML(l.t) + '</p>'; }).join('') + '</div>';
    }).join('') + '</div>';
    h += '<textarea id="txt-op" class="txt" readonly hidden aria-label="Orden en texto">' + esc(opTexto(o)) + '</textarea></div>';
    return h;
  }
  function diaProd(id) { return String(id || '').replace(/^c3-/, ''); }
  function idActual() { return (S.solo === 'ciclo3' ? 'c3-' : '') + S.fecha; }
  function esEmbutido(c) { var t = norm((c.corte || '') + ' ' + (c.texto || '')); return norm(c.corte) === 'EMBUTIDOS' || /CHORIZ|MORCILL|SALCHICH/.test(t); }
  function idPara(p, c) { return (esEmbutido(c) ? 'c3-' : '') + p.entrega; }
  // En Ciclo III los renglones se agrupan por producto: chorizo, morcilla o salchicha.
  function corteC3(c) { var t = norm((c.texto || '') + ' ' + (c.corte || '')); return /CHORIZ/.test(t) ? 'CHORIZO' : /MORCILL/.test(t) ? 'MORCILLA' : /SALCHICH/.test(t) ? 'SALCHICHA' : 'EMBUTIDOS'; }
  function prodGuardada(f) { return (S.prod || []).filter(function (o) { return o.id === f; })[0] || null; }
  function prodVacia(f) { return esC3(f) ? { fecha: diaProd(f), linea: 'ciclo3', medias: 0, mercado: '', estado: 'borrador', cortes: [] } : { fecha: f, medias: +S.config.desposteHabitual || 750, mercado: '', estado: 'borrador', cortes: [] }; }
  // Un renglón nuevo dentro de su corte. Los que llevan cantidad van arriba de los que no.
  function insertarLinea(o, corte, texto, pid, ck, frio) {
    var c = corteDe(o, corte);
    if (!c) {
      c = { corte: norm(corte) || 'SIN UBICAR', lineas: [] }; o.cortes.push(c);
      o.cortes = o.cortes.map(function (x, i) { return [x, i]; }).sort(function (a, b) { return ordenCorte(a[0].corte) - ordenCorte(b[0].corte) || a[1] - b[1]; }).map(function (x) { return x[0]; });
    }
    var linea = { t: texto }, pos = c.lineas.length; if (pid) linea.p = pid; if (ck) linea.ck = ck; if (frio) linea.f = frio;
    if (esPedido(texto)) for (var i = 0; i < c.lineas.length; i++) if (!esPedido(c.lineas[i].t)) { pos = i; break; }
    c.lineas.splice(pos, 0, linea);
  }
  // Saca los renglones de un pedido (o de un solo corte de ese pedido) y los cortes que quedan sin nada.
  function quitarDeOrden(o, pid, ck, texto) {
    o.cortes.forEach(function (c) {
      var antes = c.lineas.length;
      c.lineas = c.lineas.filter(function (l) {
        if (l.p !== pid) return true;
        if (!ck) return false;
        return !(l.ck === ck || (!l.ck && norm(l.t) === norm(texto)));
      });
      if (c.lineas.length !== antes) c._tocado = true;
    });
    o.cortes = o.cortes.filter(function (c) { var t = c._tocado; delete c._tocado; return c.lineas.length || !t; });
  }
  // Mapa "pedido|corte" → fecha de la planilla donde está sumado.
  function enProduccion() {
    var m = {};
    (S.prod || []).forEach(function (o) { (o.cortes || []).forEach(function (c) { (c.lineas || []).forEach(function (l) { if (l.p) m[l.p + '|' + (l.ck || 't:' + norm(l.t))] = o.id; }); }); });
    return m;
  }
  function fechaProdDe(m, p, c) { return m[p.id + '|' + c.k] || m[p.id + '|t:' + norm(c.texto)] || m[p.id + '|t:' + norm(textoProd(p, c))] || null; }
  function guardarOrden(f, o, borrarSiVacia) {
    var ol = limpiarOrden(o);
    if (borrarSiVacia && !ol.cortes.length) { S.prod = (S.prod || []).filter(function (x) { return x.id !== f; }); return store.del('produccion', f); }
    S.prod = poner(S.prod, f, ol); return store.set('produccion', f, ol);
  }
  // Los cortes van a la planilla de desposte del día; chorizo, morcilla y salchicha, a la de Ciclo III.
  function sumarCortes(p, cuales) {
    var m = enProduccion(), docs = {};
    cuales.forEach(function (c) {
      if (!c.texto || fechaProdDe(m, p, c)) return;
      var id = idPara(p, c), o = docs[id] || (docs[id] = clone(prodGuardada(id) || prodVacia(id)));
      insertarLinea(o, esC3(id) ? corteC3(c) : c.corte, textoProd(p, c), p.id, c.k, c.frio || p.frio);
    });
    return Promise.all(Object.keys(docs).map(function (id) { return guardarOrden(id, docs[id]); })).then(tocar);
  }
  function quitarCorte(p, c) {
    var f = fechaProdDe(enProduccion(), p, c), o = f && prodGuardada(f);
    if (!o) return Promise.resolve();
    var x = clone(o); quitarDeOrden(x, p.id, c.k, c.texto);
    return guardarOrden(f, x, true).then(tocar);
  }
  // Un renglón de la planilla: el cliente en su etiqueta adelante, los kilos bien marcados y después el detalle.
  function lineaHojaHTML(t) {
    var s = String(t || ''), cli = '', m = s.match(/\s*[“"]([^”"]+)[”"]\s*/);
    if (m) { cli = m[1].trim(); s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim(); }
    var q = s.match(/^\s*([\d.,½]+)\s*((?:KGS?|KILOS?|K|CAJAS?|CJS?|UND|UNIDAD(?:ES)?|UNID|U|CANASTOS?|BINES?)\b\.?)?/i), cant = '', desc = s;
    if (q && q[0].trim()) { cant = (q[1] + (q[2] ? ' ' + q[2].toUpperCase().replace(/^KGS?$|^KILOS?$/, 'KG') : '')).trim(); desc = s.slice(q[0].length).trim(); }
    return '<span class="h-cli' + (cli ? '' : ' vacio') + '">' + esc(cli) + '</span><span class="h-txt">' + (cant ? '<b class="h-cant">' + esc(cant) + '</b> ' : '') + esc(desc) + '</span>';
  }
  /* En producción todo se muestra en kilos: una caja o un canasto pesa 20 kg (o lo que diga "CAJAS DE 15KG").
     Lo que va en canastos lo aclara al final. Lo guardado no cambia: es solo cómo se muestra e imprime. */
  function kgCanasto() { return +S.config.kgCanasto || 20; }
  /* Peso de una unidad de cada producto (lo pasó Renzo). Un renglón en unidades ("4 UNIDADES BONDIOLA") se pasa a kilos con esto.
     Se puede cambiar en Logística → Stock de camiones → Editar. El producto se busca en el texto y, si no está, en el corte. */
  // Pesos agregados después: se suman aunque ya haya una lista guardada (si el producto no está en ella).
  var KG_UNIDAD_NUEVOS = [['PECHO MANTA DOBLE CON CUERO', 7.5], ['PECHO MANTA DOBLE', 6.5], ['PANCETA CON CUERO', 6], ['PANCETA SIN CUERO', 5], ['CINTA DE LOMO', 3.5]];
  var KG_UNIDAD_BASE = [['PECHO', 5], ['CARRE', 5], ['BONDIOLA', 2.5], ['MATAMBRE', 1.5], ['JAMON', 12], ['PALETA', 7.5], ['MEDIA', 50]].concat(KG_UNIDAD_NUEVOS);
  function kgUnidades() {
    return kgUnidadesLista().filter(function (x) { return x[0] && x[1] > 0; }).sort(function (a, b) { return b[0].length - a[0].length; });
  }
  function kgUnidadesLista() {
    if (!Array.isArray(S.config && S.config.kgUnidad)) return KG_UNIDAD_BASE;
    var l = S.config.kgUnidad.map(function (x) { return [norm(x.p), +x.kg || 0]; }), hay = {}; l.forEach(function (x) { hay[x[0]] = 1; });
    return l.concat(KG_UNIDAD_NUEVOS.filter(function (x) { return !hay[x[0]]; }));
  }
  function kgUnidadDe(texto, corte) {
    var l = kgUnidades(), busca = function (t) { t = ' ' + norm(t) + ' '; for (var i = 0; i < l.length; i++) { if (new RegExp('[^A-Z]' + l[i][0].replace(/ /g, '\\s+') + '(S|ES)?[^A-Z]').test(t)) return l[i][1]; } return 0; };
    return busca(texto) || (corte ? busca(corte) : 0);
  }
  function enKg(t, corte) {
    var su = String(t || ''), mu = su.match(/^\s*([\d.,]+)\s*(UNIDADES|UNIDAD|UNID|UND|U)\.?(?=\s|$)/i);
    if (mu) {
      var porU = kgUnidadDe(su.slice(mu[0].length), corte);
      if (porU) { var resto0 = su.slice(mu[0].length).trim(); return String(Math.round(numero(mu[1]) * porU * 100) / 100).replace('.', ',') + 'KG' + (resto0 ? ' ' + resto0 : ''); }
      return su;
    }
    var s = su, m = s.match(/^\s*([\d.,]+)\s*(CANASTOS?|CANASTAS?|CAJAS?|CJS?\.?)(?:\s+(?:DE|X)\s*([\d.,]+)\s*(?:KGS?|KILOS?)\.?)?(?=\s|$)/i);
    if (!m) return s;
    var canasto = /^CANAST/i.test(m[2]), por = m[3] ? numero(m[3]) : canasto ? kgCanasto() : kgCaja();
    var kg = Math.round(numero(m[1]) * por * 100) / 100, resto = s.slice(m[0].length).trim();
    return String(kg).replace('.', ',') + 'KG' + (resto ? ' ' + resto : '') + (canasto ? ' — EN CANASTOS' : '');
  }
  // Cantidad de un renglón con su unidad, tal como se pidió, y cuántos kilos son (null si no se sabe el peso).
  function cantRenglon(t, corte) {
    var su = String(t || '').replace(/\s*[“"][^”"]*[”"]\s*/g, ' ').trim();
    var m = su.match(/^([\d.,]+)\s*(KGS?|KILOS?|K|CAJAS?|CJS?|CANASTOS?|CANASTAS?|UND|UNIDAD(?:ES)?|UNID|U|BINES?)\.?(?:\s+(?:DE|X)\s*([\d.,]+)\s*(?:KGS?|KILOS?)\.?)?(?=\s|$)/i);
    if (!m) return null;
    var q = numero(m[1]), w = norm(m[2]), u = /^K/.test(w) ? 'kg' : /^CANAST/.test(w) ? 'canastos' : /^C/.test(w) ? 'cajas' : /^B/.test(w) ? 'bines' : 'und';
    var kg = u === 'kg' ? q : u === 'cajas' ? q * (m[3] ? numero(m[3]) : kgCaja()) : u === 'canastos' ? q * (m[3] ? numero(m[3]) : kgCanasto()) : u === 'und' ? (kgUnidadDe(su.slice(m[0].length), corte) * q || null) : null;
    return { n: q, u: u, kg: kg == null ? null : Math.round(kg * 100) / 100 };
  }
  /* Total de un corte: un solo total en kilos (cajas, canastos y unidades pasados a kilos) y, si se pidió en otras unidades,
     el detalle de lo pedido (ej. "230 kg" · "100 kg · 5 cajas · 2 und"). Lo que no tiene peso conocido va aparte. */
  function totalCorteDet(c) {
    var kg = 0, hayKg = false, d = {}, sin = {}, orden = ['kg', 'cajas', 'canastos', 'und', 'bines'];
    (c.lineas || []).forEach(function (l) {
      var r = cantRenglon(l.t, l.c || c.corte); if (!r) return;
      if (r.kg != null) { kg += r.kg; hayKg = true; d[r.u] = (d[r.u] || 0) + r.n; } else sin[r.u] = (sin[r.u] || 0) + r.n;
    });
    var nom = function (u, v) { return n(v) + ' ' + (v === 1 ? { cajas: 'caja', canastos: 'canasto', bines: 'bin' }[u] || u : u); };
    var tipos = orden.filter(function (u) { return d[u]; });
    return { kg: hayKg ? Math.round(kg * 100) / 100 : null, det: tipos.length > 1 || (tipos.length === 1 && tipos[0] !== 'kg') ? tipos.map(function (u) { return nom(u, d[u]); }).join(' · ') : '', sin: orden.filter(function (u) { return sin[u]; }).map(function (u) { return nom(u, sin[u]) + (u === 'und' ? ' sin peso' : ''); }).join(' · ') };
  }
  function totalCorte(c) {
    var t = totalCorteDet(c), s = t.kg != null ? n(t.kg) + ' kg' : '';
    if (t.det) s += ' (' + t.det + ')';
    if (t.sin) s += (s ? ' + ' : '') + t.sin;
    return s;
  }
  function textoOrden(o, sinFrio) {
    var out = [diaDe(o.fecha).toUpperCase() + ' ' + fechaCorta(o.fecha)].concat(o.linea === 'ciclo3' ? ['EMBUTIDOS · CICLO III'] : [(o.medias || '') + '½ ' + String(o.mercado || '').toUpperCase()]);
    (o.cortes || []).forEach(function (c) {
      (c.lineas.length ? c.lineas : [{ t: '' }]).forEach(function (l, i) { out.push(((i === 0 ? c.corte + ': ' : '') + l.t + (l.f && !sinFrio ? ' (' + l.f + ')' : '')).toUpperCase()); });
      var tot = totalCorte(c), td = totalCorteDet(c); if (tot && (c.lineas.length > 1 || td.det || td.sin)) out.push('TOTAL ' + c.corte + ': ' + tot.toUpperCase());
    });
    return out.join('\n');
  }
  // El día de trabajo: hoy si es hábil; desde las 15 h ya se trabaja para el día hábil siguiente.
  function fechaProdInicial() { var h = hoy(); return esHabil(h) && new Date().getHours() < 15 ? h : habilSiguiente(h); }

  // La planilla de un día, para leer (la de desposte o la de embutidos).
  function hojaHTML(o, f, c3, fae) {
    var nl = (o.cortes || []).reduce(function (t, c) { return t + c.lineas.length; }, 0), k = c3 ? 'c3' : fae ? 'faena' : 'orden';
    var h = '<div class="panel hoja' + (c3 ? ' hoja-c3' : fae ? ' hoja-faena' : '') + '"' + (c3 ? ' id="embutidos"' : fae ? ' id="faena"' : '') + '><header class="hoja-cab"><div><p class="hoja-sup">' + (c3 ? (S.solo ? 'Ciclo III · Embutidos' : 'Ciclo III') : fae ? 'Achuras y frescos de faena' : 'Planilla de empaque') + '</p><h2>' + esc(c3 && !S.solo ? 'Embutidos' : (c3 ? '' : fae ? 'FAENA · ' : 'EMPAQUE · ') + tituloDe(f)) + '</h2></div>'
      + (c3 || fae ? (kgOrden(o) ? '<div class="hoja-dato"><b>' + n(kgOrden(o)) + '</b><span>kg</span></div>' : '') : '<div class="hoja-dato"><b>' + n(+o.medias || 0) + '</b><span>medias' + (o.mercado ? ' · ' + esc(o.mercado) : '') + '</span></div>')
      + (o.estado === 'borrador' ? '<span class="badge warn">Borrador</span>' : '<span class="badge ok">Confirmada</span>') + '</header>';
    var acc = '<div class="acciones hoja-acc">'
      + (S.editor ? '<button class="btn pri" data-act="p-editar" data-id="' + (c3 ? 'c3-' : '') + f + '">' + (c3 ? 'Editar embutidos' : 'Editar') + '</button>' : '')
      + '<button class="btn" data-act="hoja-imprimir">' + (c3 ? 'Imprimir embutidos' : fae ? 'Imprimir faena' : 'Imprimir cortes') + '</button>'
      + '<button class="btn" data-act="copiar" data-t="' + k + '">Copiar como texto</button><button class="btn wa" data-act="wa-pdf">PDF por WhatsApp</button><button class="btn" data-act="hoja-pdf">Compartir PDF</button>'
      + (S.editor && !c3 && !fae ? '<button class="btn" data-act="ir-pedidos" data-f="' + f + '">Sumar cortes desde los pedidos</button>' : '')
      + (S.editor && c3 ? '<button class="btn" data-act="link-c3">Copiar link para el Ciclo III</button>' : '')
      + '<span class="small muted" id="copiado-' + k + '" aria-live="polite"></span></div>';
    h += acc;
    if (!nl) h += '<p class="muted">Todavía no se sumó ningún ' + (c3 ? 'embutido' : 'corte') + '.</p>';
    else h += '<div class="hoja-cortes">' + (o.cortes || []).map(function (c) {
      var td = totalCorteDet(c), tot = td.kg != null ? n(td.kg) + ' kg' : '';
      var det = [td.det, td.sin ? (tot ? '+ ' : '') + td.sin : ''].filter(Boolean).join(' ');
      return '<div class="hoja-corte"><div class="hoja-nom"><h3>' + esc(c.corte || 'Sin corte') + '</h3>' + (tot || det ? '<p class="hoja-tot"><span>Total</span> ' + esc(tot) + (det ? '<small class="hoja-det"> (' + esc(det) + ')</small>' : '') + '</p>' : '') + '</div><ul>' + c.lineas.map(function (l) { return '<li>' + lineaHojaHTML(l.t) + (l.f ? ' ' + frioBadge(l.f) : '') + '</li>'; }).join('') + '</ul></div>';
    }).join('') + '</div>';
    h += '<textarea id="txt-' + k + '" class="txt" readonly hidden aria-label="Planilla en texto">' + esc(fae ? textoOrden(o).replace(/^([^\n]*)\n[^\n]*/, '$1\nFAENA') : textoOrden(o)) + '</textarea></div>';
    return h;
  }
  // PDF de una sola hoja (la orden, la planilla de frescos o la de embutidos), para mandarla por WhatsApp o mail.
  // Se arma con el texto de la hoja (nítido y liviano). En el celular abre "Compartir"; en la compu se descarga.
  // La librería (pdf-lib, en docs/lib) se baja recién la primera vez que se usa.
  function cargarScript(src) {
    return new Promise(function (ok, mal) { if (document.querySelector('script[src="' + src + '"]')) return window.PDFLib ? ok() : setTimeout(function () { window.PDFLib ? ok() : mal(new Error('sin conexión')); }, 1500); var sc = document.createElement('script'); sc.src = src; sc.onload = function () { ok(); }; sc.onerror = function () { sc.remove(); mal(new Error('sin conexión')); }; document.head.appendChild(sc); });
  }
  // Lo que se ve en la hoja, en renglones con trozos de estilo (negrita, subrayado, color del cliente).
  function hojaEnRenglones(hoja) {
    var txt = function (el) { return el ? (el.children.length ? Array.prototype.map.call(el.childNodes, function (k) { return k.textContent; }).join(' ') : el.textContent).replace(/\s+/g, ' ').trim() : ''; };
    var cab = { sup: txt(hoja.querySelector('.hoja-sup')), tit: txt(hoja.querySelector('.hoja-cab h2')), dato: txt(hoja.querySelector('.hoja-dato')), estado: txt(hoja.querySelector('.hoja-cab .badge')) };
    var trozos = function (el) {
      var r = [];
      (function ir(nd) {
        if (nd.nodeType === 3) {
          var t = nd.nodeValue.replace(/\s+/g, ' '); if (!t) return;
          var p = nd.parentElement;
          r.push({ t: t, b: !!p.closest('b,strong,h3,.op-corte,.badge'), u: !!p.closest('u'), azul: !!p.closest('.op-cli,.h-cli'), gris: !!p.closest('.muted,.op-resto,.hoja-tot span') });
          return;
        }
        if (nd.nodeType !== 1 || /^(BUTTON|SELECT|TEXTAREA|SCRIPT)$/.test(nd.tagName) || nd.hidden || nd.classList.contains('solo-print')) return;
        if (nd.classList.contains('h-cli') && !nd.classList.contains('vacio')) { r.push({ t: nd.textContent.trim(), b: true, azul: true }); r.push({ t: '  ' }); return; }
        if (r.length && /^(P|DIV|H3|LI)$/.test(nd.tagName)) r.push({ t: ' ' });
        for (var k = nd.firstChild; k; k = k.nextSibling) ir(k);
      })(el);
      return r;
    };
    var rs = [];
    hoja.querySelectorAll('.op-c > p, .hoja-nom, .hoja-corte li, .hoja > p.muted').forEach(function (el) {
      if (el.matches('.hoja-nom')) rs.push({ tipo: 'tit', trozos: trozos(el) });
      else if (el.matches('li')) rs.push({ tipo: 'li', trozos: trozos(el) });
      else rs.push({ tipo: el.classList.contains('op-sig') ? 'sig' : el.classList.contains('muted') ? 'nota' : 'op', trozos: trozos(el) });
    });
    return { cab: cab, renglones: rs };
  }
  function armarPDF(hojasPDF, opc) {
    var L = window.PDFLib, lista = [].concat(hojasPDF).filter(Boolean); opc = opc || {};
    var tMin = opc.min || 10.5, tMax = opc.max || 13;   // tope 13: más grande quedaba exagerado (pedido de Renzo)
    return L.PDFDocument.create().then(function (doc) {
      return Promise.all([doc.embedFont(L.StandardFonts.Helvetica), doc.embedFont(L.StandardFonts.HelveticaBold)]).then(function (fs) {
        var F = fs[0], FB = fs[1], AN = 595.28, AL = 841.89, M = 40, maxX = AN - M, cache = {};
        var negro = L.rgb(0.07, 0.07, 0.07), azul = L.rgb(0.17, 0.48, 0.59), gris = L.rgb(0.42, 0.45, 0.48), linea = L.rgb(0.8, 0.82, 0.84);
        var REEMPLAZO = { '≈': '~', '✓': 'v', '✗': 'x', '→': '->', '⠿': '', '·': '·', ' ': ' ' };
        var limpio = function (t) { return Array.from(String(t || '')).map(function (ch) { if (cache[ch] != null) return cache[ch]; var v = ch; try { F.encodeText(ch); } catch (e) { v = REEMPLAZO[ch] != null ? REEMPLAZO[ch] : '?'; } cache[ch] = v; return v; }).join(''); };
        // Ancho sin "kerning" (la librería lo descuenta al medir pero no al dibujar, y las palabras quedaban pegadas).
        var anchos = {}, ancho = function (fu, t, tam) { var k = fu === FB ? 'b' : 'r', w = 0; Array.from(t).forEach(function (ch) { var c2 = k + ch; if (anchos[c2] == null) anchos[c2] = fu.widthOfTextAtSize(ch, 1000); w += anchos[c2]; }); return w * tam / 1000; };
        var pag, y, nPag = 0, pags = [], c = null;
        var nueva = function () { pag = doc.addPage([AN, AL]); pags.push(pag); y = AL - M; nPag++; };
        lista.forEach(function (hojaX) {
        var datos = hojaX.nodeType ? hojaEnRenglones(hojaX) : hojaX;
        nueva();
        // Encabezado: qué hoja es, el día y las medias.
        c = c || datos.cab; var cabH = datos.cab;
        pag.drawText(limpio(cabH.sup.toUpperCase()), { x: M, y: y - 9, size: 9, font: FB, color: gris });
        if (cabH.estado) { var ew = ancho(FB, limpio(cabH.estado.toUpperCase()), 8); pag.drawText(limpio(cabH.estado.toUpperCase()), { x: maxX - ew, y: y - 9, size: 8, font: FB, color: gris }); }
        y -= 30; pag.drawText(limpio(cabH.tit.toUpperCase()), { x: M, y: y, size: 19, font: FB, color: negro });
        if (cabH.dato) { var dw = ancho(FB, limpio(cabH.dato.toUpperCase()), 15); pag.drawText(limpio(cabH.dato.toUpperCase()), { x: maxX - dw, y: y, size: 15, font: FB, color: negro }); }
        y -= 10; pag.drawLine({ start: { x: M, y: y }, end: { x: maxX, y: y }, thickness: 1.5, color: negro }); y -= 8;
        // El cuerpo se acomoda a la hoja: se busca la letra más grande que entra entera en una A4 (entre 10,5 y 20)
        // y lo que sobra se reparte entre los cortes. Si ni con la letra chica entra, sigue en otra página.
        var y0 = y, piso = M + 4, disp = y0 - piso;
        var bloques = datos.renglones.filter(function (r) { return r.tipo === 'op' || r.tipo === 'tit' || r.tipo === 'nota' || r.tipo === 'cam'; }).length || 1;
        var cuerpo = function (TAM, extra, dibujar, simular) {
          var sc = TAM / 10.5, paso = TAM * 1.12, yy = y0, hojas = 1, pagina = dibujar || simular;
          var corte = function () { if (dibujar) { nueva(); return y; } hojas++; return AL - M; };
          var salto = function () { yy -= paso; if (pagina && yy < piso) { yy = corte() - paso; } };
          datos.renglones.forEach(function (r, k) {
            var esCab = r.tipo === 'tit' || r.tipo === 'cam', prev = k ? datos.renglones[k - 1].tipo : '';
            var tam = r.tipo === 'cam' ? TAM * 1.32 : r.tipo === 'tit' ? TAM * 1.14 : TAM, sangria = (r.tipo === 'sig' ? 18 : r.tipo === 'li' ? 14 : 0) * sc;
            var antes = (r.tipo === 'cam' ? 13 : r.tipo === 'tit' ? 12 : r.tipo === 'op' || r.tipo === 'nota' ? 7 : 2) * sc + (r.tipo === 'li' || r.tipo === 'sig' ? 0 : k ? extra : 0);
            if (pagina && yy - antes - paso < piso) { yy = corte(); } else yy -= antes;
            if (dibujar && r.tipo === 'op' && k > 0 && prev !== 'cam' && prev !== 'tit' && yy < AL - M - 60) { var yl = yy + (antes - 0.62 * TAM) / 2; pag.drawLine({ start: { x: M, y: yl }, end: { x: maxX, y: yl }, thickness: 0.5, color: linea, dashArray: [2, 2] }); }
            salto(); if (esCab) yy -= TAM * (r.tipo === 'cam' ? 0.3 : 0.14);
            if (dibujar && r.der) { var tdr = limpio(r.der), wdr = ancho(FB, tdr, TAM * 0.92); pag.drawText(tdr, { x: maxX - wdr, y: yy, size: TAM * 0.92, font: FB, color: gris }); }
            var tope = r.der ? maxX - ancho(FB, limpio(r.der), TAM * 0.92) - 12 : maxX;
            var x0 = M + sangria, x = x0;
            if (dibujar && r.tipo === 'li') pag.drawText('•', { x: M + 4 * sc, y: yy, size: tam, font: F, color: gris });
            var subPend = null;
            r.trozos.forEach(function (tr) {
              var fuente = tr.b || esCab ? FB : F, color = tr.azul ? azul : tr.gris ? gris : negro;
              limpio(tr.t).split(/(\s+)/).forEach(function (pal) {
                if (!pal) return;
                if (/^\s+$/.test(pal)) { if (x > x0) { var ws = ancho(fuente, ' ', tam) * Math.min(pal.length, 2); if (dibujar && tr.u) subPend = { x: x, w: ws }; x += ws; } return; }
                var w = ancho(fuente, pal, tam);
                if (x + w > tope && x > x0) { salto(); tope = maxX; x = x0 + (r.tipo === 'op' ? 10 * sc : 0); subPend = null; }
                if (subPend && tr.u && dibujar) pag.drawLine({ start: { x: subPend.x, y: yy - tam * 0.19 }, end: { x: subPend.x + subPend.w, y: yy - tam * 0.19 }, thickness: 0.6 + tam * 0.02, color: color });
                subPend = null;
                if (dibujar) {
                  pag.drawText(pal, { x: x, y: yy, size: tam, font: fuente, color: color });
                  if (tr.u) pag.drawLine({ start: { x: x, y: yy - tam * 0.19 }, end: { x: x + w, y: yy - tam * 0.19 }, thickness: 0.6 + tam * 0.02, color: color });
                }
                x += w;
              });
            });
            if (esCab) { yy -= TAM * 0.48; if (dibujar) pag.drawLine({ start: { x: M, y: yy }, end: { x: maxX, y: yy }, thickness: r.tipo === 'cam' ? 1.6 : 0.8, color: negro }); yy -= TAM * 0.2; }
          });
          return simular ? hojas : y0 - yy;
        };
        var TAM = tMin, extra = 0, buscar = function (a, b, lim) { for (var it = 0; it < 14; it++) { var mid = (a + b) / 2; if (cuerpo(mid, 0, false) <= lim) a = mid; else b = mid; } return Math.floor(a * 4) / 4; };
        if (cuerpo(TAM, 0, false) <= disp) {
          TAM = buscar(tMin, tMax, disp);
          extra = Math.max(0, Math.min((disp - cuerpo(TAM, 0, false)) / bloques, TAM * 0.6));
          if (cuerpo(TAM, extra, false) > disp) extra = 0;
        } else if (opc.dos) {
          // Dos hojas: la segunda no repite el encabezado; se deja un margen por lo que se pierde al pasar de hoja.
          var lo2 = opc.dos, hi2 = tMin;
          if (cuerpo(lo2, 0, false, true) <= 2) { for (var i2 = 0; i2 < 12; i2++) { var m2 = (lo2 + hi2) / 2; if (cuerpo(m2, 0, false, true) <= 2) lo2 = m2; else hi2 = m2; } }
          TAM = Math.floor(lo2 * 4) / 4;
        }
        cuerpo(TAM, extra, true);
        });
        var ahora = new Date(), pie = 'Frigorífico Qualitá · ' + ahora.toLocaleDateString('es-AR') + ' ' + ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        pags.forEach(function (p, i) {
          p.drawText(limpio(pie), { x: M, y: 22, size: 8, font: F, color: gris });
          var pt = (i + 1) + ' / ' + pags.length; p.drawText(pt, { x: maxX - ancho(F, pt, 8), y: 22, size: 8, font: F, color: gris });
        });
        doc.setTitle(limpio(c.sup + ' — ' + c.tit)); doc.setCreator('Producción Qualitá');
        return doc.save();
      });
    });
  }
  function compartirPDF(hoja, btn, wa, nombre0) {
    if (!hoja || (btn && btn.disabled)) return;
    var dia = S.fecha || '';
    var nombre = nombre0 || (hoja.classList.contains('op-hoja') ? 'Orden de produccion' : hoja.classList.contains('hoja-c3') ? 'Embutidos' : hoja.classList.contains('hoja-faena') ? 'Faena' : 'Planilla de frescos') + ' ' + dia.slice(8, 10) + '-' + dia.slice(5, 7) + '.pdf';
    var txt0 = btn ? btn.textContent : ''; if (btn) { btn.disabled = true; btn.textContent = 'Armando el PDF…'; }
    var fin = function (m) { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = txt0; } if (m) avisar(m, m.charAt(0) === '!' ? 7000 : 4000); };
    cargarScript('lib/pdf-lib.min.js').then(function () { return typeof hoja === 'function' ? hoja() : armarPDF(hoja); }).then(function (bytes) {
      var blob = new Blob([bytes], { type: 'application/pdf' }), file = null; try { file = new File([blob], nombre, { type: 'application/pdf' }); } catch (e) {}
      if (window.__mock) window.__mock.ultimoPDF = { nombre: nombre, blob: blob };
      // Celular, y también la compu cuando el navegador lo permite (Chrome 128+ en Mac/Windows): abre "Compartir" del sistema con el PDF,
      // donde aparece WhatsApp y se elige el contacto.
      var puede = false; try { puede = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) {}
      if (window.__mock && window.__mock.compartirArchivos) { window.__mock.compartirArchivos(nombre); return ''; }
      if (puede && (wa || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent))) {
        return navigator.share({ files: [file] }).then(function () { return ''; }, function (e) { if (e && e.name === 'AbortError') return ''; bajar(blob, nombre); return 'PDF descargado: ' + nombre; });
      }
      bajar(blob, nombre);
      // En la compu WhatsApp no deja adjuntar desde una página: se baja el PDF y se abre WhatsApp Web para arrastrarlo al chat.
      if (wa) { if (window.__mock) window.__mock.abrioWA = true; else window.open('https://web.whatsapp.com/', 'qualita-whatsapp'); return 'PDF descargado: ' + nombre + '. Se abrió WhatsApp: elegí el chat y arrastrá el PDF (o tocá el clip y adjuntalo).'; }
      return 'PDF descargado: ' + nombre + '. Adjuntalo en WhatsApp o en el mail.';
    }).then(function (m) { fin(m); }, function () { fin('!No se pudo armar el PDF. Revisá la conexión y probá de nuevo.'); });
  }
  // Logística se imprime como se ve, pero achicada lo justo para usar la menor cantidad de hojas A4:
  // se arma una copia invisible con el estilo de impresión al ancho de la hoja, se mide y se elige el tamaño.
  var A4_ANCHO = 718, A4_ALTO = 1040, ZOOM_MIN = 0.85;
  function medirImpresion() {
    return new Promise(function (ok) {
      var css = Array.prototype.map.call(document.querySelectorAll('style'), function (x) { return x.id === 'hoja-impresion' ? '' : x.textContent; }).join('\n').replace(/@media\s+print/g, '@media all');
      var links = Array.prototype.map.call(document.querySelectorAll('link[rel="stylesheet"]'), function (x) { return x.outerHTML; }).join('');
      var attrs = Array.prototype.map.call(document.documentElement.attributes, function (a) { return a.name + '="' + String(a.value).replace(/"/g, '&quot;') + '"'; }).join(' ');
      var cuerpo = document.body.cloneNode(true); Array.prototype.forEach.call(cuerpo.querySelectorAll('script,iframe'), function (x) { x.remove(); });
      var fr = document.createElement('iframe'); fr.setAttribute('aria-hidden', 'true'); fr.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + A4_ANCHO + 'px;height:' + A4_ALTO + 'px;border:0;visibility:hidden';
      document.body.appendChild(fr);
      var d = fr.contentDocument, listo = false;
      d.open(); d.write('<!doctype html><html ' + attrs + '><head><meta charset="utf-8">' + links + '<style>' + css + '</style></head><body class="' + document.body.className + '">' + cuerpo.innerHTML + '</body></html>'); d.close();
      var medir = function () { if (listo) return; listo = true; var h = 0; try { h = d.documentElement.scrollHeight; } catch (e) {} fr.remove(); ok(h); };
      try { (d.fonts && d.fonts.ready ? d.fonts.ready : Promise.resolve()).then(function () { setTimeout(medir, 60); }); } catch (e) { setTimeout(medir, 300); }
      setTimeout(medir, 1500);
    });
  }
  function zoomPara(h) {
    if (!h) return 1;
    if (h <= A4_ALTO) return 1;
    var hojas = Math.max(1, Math.ceil(h * ZOOM_MIN / A4_ALTO));
    // Con más de una hoja se deja margen por las tarjetas que no se cortan y pasan enteras a la hoja siguiente.
    return Math.max(ZOOM_MIN, Math.min(1, (hojas * A4_ALTO * (hojas > 1 ? 0.93 : 0.99)) / h));
  }
  function imprimirAjustado(despues) {
    var hj = $('hoja-impresion');
    if (!hj) { hj = document.createElement('style'); hj.id = 'hoja-impresion'; document.head.appendChild(hj); }
    hj.textContent = '@page{size:A4 portrait;margin:10mm}';
    medirImpresion().then(function (h) {
      var z = zoomPara(h); if (window.__mock) window.__mock.zoomImpresion = { alto: h, zoom: z };
      hj.textContent = '@page{size:A4 portrait;margin:10mm}' + (z < 1 ? '@media print{body{zoom:' + z.toFixed(3) + '}}' : '');
      setTimeout(function () { window.print(); if (despues) despues(); }, 60);
    });
  }
  // Imprimir las hojas de Producción con el PDF que se adapta a la A4 (la impresión de la pantalla salía chica).
  function imprimirPDF(hojas, btn, opc) {
    var txt0 = btn ? btn.textContent : ''; if (btn) { btn.disabled = true; btn.textContent = 'Preparando…'; }
    var fin = function (m) { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = txt0; } if (m) avisar(m, 7000); };
    cargarScript('lib/pdf-lib.min.js').then(function () { return armarPDF(hojas, opc); }).then(function (bytes) {
      var blob = new Blob([bytes], { type: 'application/pdf' }), u = URL.createObjectURL(blob);
      if (window.__mock) { window.__mock.ultimoPDF = { nombre: 'imprimir', blob: blob }; fin(); return; }
      var fr = $('marco-impresion'); if (fr) fr.remove();
      fr = document.createElement('iframe'); fr.id = 'marco-impresion'; fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
      fr.onload = function () { setTimeout(function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); fin(); } catch (e) { window.open(u, '_blank'); fin('Se abrió el PDF: imprimilo desde ahí.'); } }, 700); };
      fr.src = u; document.body.appendChild(fr);
    }).then(null, function () { fin('!No se pudo preparar la impresión. Probá de nuevo.'); });
  }
  function bajar(blob, nombre) { var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }
  function renderProduccion() {
    var solo3 = S.solo === 'ciclo3', el = $(solo3 ? 'view-ciclo3' : 'view-produccion');
    if (cargando(el, S.prod)) return;
    if (!S.fecha || !S.fechaFija) S.fecha = fechaProdInicial();
    var f = S.fecha, o = solo3 ? null : prodDe(f), o3 = prodDe('c3-' + f), op = solo3 ? null : prodDe('op-' + f), edit = !!(S.ep && (S.ep.fecha === f || S.ep.fecha === 'c3-' + f || S.ep.fecha === 'op-' + f));
    var pv = solo3 ? 'frescos' : (S.pv || (op ? 'op' : 'frescos')); if (edit) pv = esOP(S.ep.fecha) ? 'op' : 'frescos';
    var h = '<div class="nav"><button class="btn step" data-act="fecha" data-d="-1" aria-label="Día anterior">‹</button><span class="tit">' + fechaTit(f) + '</span><button class="btn step" data-act="fecha" data-d="1" aria-label="Día siguiente">›</button>'
      + '<input type="date" id="p-fecha" value="' + esc(f) + '" aria-label="Ir a una fecha">';
    if (pv === 'op' ? op : (o || o3)) h += '<button class="btn" data-act="imprimir">Imprimir</button>';
    if (edit) h += '<button class="btn pri" data-act="p-editar">Listo</button>';
    if (S.editor) h += '<button class="btn" data-act="link-prod">Copiar link para compartir</button><span class="guardado" id="g-prod"></span>';
    h += '</div>';
    if (!solo3) h += '<div class="pv-tabs" role="tablist" aria-label="Qué planilla ver"><button class="btn" role="tab" data-act="pv" data-v="op" aria-selected="' + (pv === 'op') + '">Orden de producción' + (op ? '' : ' <small>(sin armar)</small>') + '</button><button class="btn" role="tab" data-act="pv" data-v="frescos" aria-selected="' + (pv === 'frescos') + '">Planilla de frescos' + (o ? '' : ' <small>(vacía)</small>') + '</button></div>';
    if (edit) { h += prodEditHTML(S.ep.doc); el.innerHTML = h; pintarMsg('prod'); crecer($('p-doc')); return; }
    if (pv === 'op') {
      if (op) h += opHTML(op, f);
      else {
        var ant = opAnterior(f);
        h += '<div class="panel"><p class="state">Todavía no está armada la orden de producción de este día.</p>';
        if (S.editor) h += '<div class="acciones" style="justify-content:center">' + (ant ? '<button class="btn pri" data-act="op-nueva" data-v="ant">Armar desde la orden del ' + esc(diaCorto(ant.id.slice(3)).toLowerCase()) + '</button>' : '') + '<button class="btn' + (ant ? '' : ' pri') + '" data-act="op-nueva" data-v="base">Armar desde la orden base</button></div>';
        h += '</div>';
      }
      el.innerHTML = h; return;
    }
    if (solo3) {
      h += o3 ? hojaHTML(o3, f, true) : '<div class="panel"><p class="state">Todavía no hay embutidos para este día.</p></div>';
      el.innerHTML = h; return;
    }
    if (o) { var pf = partirFaena(unirPecho(o)); h += hojaHTML(pf.emp, f, false); if (pf.fae.cortes.length) h += hojaHTML(pf.fae, f, false, true); }
    else {
      h += '<div class="panel"><p class="state">Todavía no hay nada en producción para este día.</p>';
      if (S.editor) h += '<div class="acciones" style="justify-content:center"><button class="btn pri" data-act="ir-pedidos" data-f="' + f + '">Ir a los pedidos de este día</button><button class="btn" data-act="p-nueva">Escribir a mano</button></div>';
      h += '</div>';
    }
    if (o3) h += hojaHTML(o3, f, true);
    el.innerHTML = h;
  }
  function docDeOrden(o) {
    var out = o.linea === 'ciclo3' ? [] : [(o.medias || '') + '½ ' + String(o.mercado || '').toUpperCase(), ''];
    (o.cortes || []).forEach(function (c) {
      out.push(String(c.corte || '').toUpperCase() + ':' + (c.lineas.length ? ' ' + String(c.lineas[0].t || '').toUpperCase() : ''));
      c.lineas.slice(1).forEach(function (l) { out.push(String(l.t || '').toUpperCase()); });
      out.push('');
    });
    return out.join('\n').replace(/\n+$/, '');
  }
  var NO_TITULO = ['RESTO', 'TODO', 'IMPORTANTE', 'NOTA', 'OBS', 'OBSERVACION', 'OBSERVACIONES', 'ATENCION', 'OJO', 'URGENTE', 'CLIENTE', 'COD', 'CODIGO', 'DESTINO', 'ENTREGA', 'ACLARACION'];
  // Del texto escrito a mano a la planilla. Los renglones que venían de un pedido conservan el vínculo.
  function parsearOrden(texto, base) {
    var o = clone(base), conocidos = {}, cortes = [], cur = null, cab = false;
    CORTES_BASE.forEach(function (x) { conocidos[x] = 1; });
    (base.cortes || []).forEach(function (c) { if (c.corte) conocidos[norm(c.corte)] = 1; });
    String(texto || '').replace(/\r/g, '').split('\n').forEach(function (raw) {
      var l = raw.replace(/\s+/g, ' ').trim();
      if (!l) return;
      if (!cur && !cab) {
        if (/^(LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO)\b/.test(norm(l))) return;
        var m = l.match(/^(\d+(?:[.,]\d+)?)\s*(?:½|1\/2|MEDIAS\b)\s*(.*)$/i);
        if (m) { o.medias = +m[1].replace(',', '.') || 0; o.mercado = m[2].trim(); cab = true; return; }
      }
      if (/^TOTAL\b[^:]*:/.test(norm(l))) return;   // los totales se calculan solos
      var t = l.match(/^([^:]{1,32}):\s*(.*)$/), pre = t ? norm(t[1]) : '';
      var esTit = t && (conocidos[pre] || (NO_TITULO.indexOf(pre) < 0 && !/\d/.test(pre) && pre.split(' ').length <= 4));
      if (!esTit && !t && conocidos[norm(l)]) { esTit = true; t = [l, l, '']; }
      if (esTit) { cur = { corte: t[1].trim().toUpperCase(), lineas: [] }; cortes.push(cur); if (t[2]) cur.lineas.push({ t: t[2] }); return; }
      if (!cur) { cur = { corte: '', lineas: [] }; cortes.push(cur); }
      cur.lineas.push({ t: l });
    });
    var usados = {}, lleva = function (de, a) { if (de.p) a.p = de.p; if (de.ck) a.ck = de.ck; if (de.f) a.f = de.f; };
    cortes.forEach(function (c) {
      var k = norm(c.corte), prev = (base.cortes || []).filter(function (x, i) { return norm(x.corte) === k && !usados[i]; })[0];
      if (!prev) return;
      usados[base.cortes.indexOf(prev)] = 1;
      if (prev.lineas.length === c.lineas.length) c.lineas.forEach(function (l, i) { lleva(prev.lineas[i], l); });
      else { var ya = {}; c.lineas.forEach(function (l) { var mm = prev.lineas.filter(function (x, i) { return x.p && !ya[i] && norm(x.t) === norm(l.t); })[0]; if (mm) { ya[prev.lineas.indexOf(mm)] = 1; lleva(mm, l); } }); }
    });
    o.cortes = cortes;
    return o;
  }
  // Agranda el cuadro de texto a su contenido. Al medir se achica un instante y la página saltaba al final:
  // se guarda dónde estaba la pantalla (y el cuadro mantiene su alto mientras mide) y se vuelve ahí.
  function crecer(e) {
    if (!e) return;
    var y = window.scrollY, x = window.scrollX;
    e.style.height = 'auto';
    var nuevo = e.scrollHeight + 4; e.style.height = nuevo + 'px';
    if (window.scrollY !== y || window.scrollX !== x) window.scrollTo(x, y);
  }
  function prodEditHTML(o) {
    var h = '<div class="panel">';
    var st = o.linea === 'ciclo3' ? null : stockParaFecha(o.fecha);
    if (st != null) h += '<p class="small ' + (st < +o.medias ? 'neg' : 'muted') + '">Hay ' + n(st) + ' medias con un día de frío para este día.</p>';
    h += '<div class="acciones">' + (o.estado === 'borrador'
      ? '<button class="btn pri" data-act="p-estado" data-v="lista">Confirmar planilla</button>'
      : '<span class="badge ok">Confirmada</span><button class="btn sm" data-act="p-estado" data-v="borrador">Volver a borrador</button>')
      + botonBorrar('p-borrar', null, 'Borrar la planilla') + '</div></div>';
    if (o.linea === 'op') h += '<div class="panel"><div class="acciones"><button class="btn" data-act="op-base">Guardar como orden base</button><span class="small muted">La orden base es la que se usa para armar un día nuevo: los destinos de siempre de cada corte.</span></div></div>';
    h += '<div class="panel"><p class="small muted">Cada corte empieza con su nombre y dos puntos (JAMON: …); los renglones de abajo son de ese corte. Se guarda solo.</p>'
      + '<article class="op"><p class="op-f">' + esc(diaDe(o.fecha)) + ' ' + esc(fechaCorta(o.fecha)) + (o.linea === 'ciclo3' ? ' · Embutidos' : '') + '</p>'
      + '<textarea id="p-doc" class="op-doc" spellcheck="false" autocapitalize="characters" aria-label="Planilla de producción">' + esc(docDeOrden(o)) + '</textarea></article></div>';
    return h;
  }
  function stockParaFecha(f) {
    var st = stockSemana(lunesDe(f)); if (!st) return null;
    var i = Math.round((fecha(f) - fecha(lunesDe(f))) / 86400000);
    return st.dias[i] ? st.dias[i].disponibleHoy : null;
  }

  /* ---------- borrar, con confirmación en dos toques ---------- */
  function seguro(k) { return window.confirm('¿Seguro que querés borrar ' + (k === 1 ? 'este pedido' : 'estos ' + k + ' pedidos') + '?\n\nSi fue un error, después lo podés recuperar con "Deshacer" o en "Borrados recientes".'); }
  function confirma(k) { if (S._c2 === k) { S._c2 = null; return true; } S._c2 = k; return false; }
  // Menú chico (⋯ o ▾) para juntar botones que se usan poco (pedido de Renzo: Logística más compacta).
  function menuHTML(k, label, items, titulo) {
    var ab = S.menuAb === k;
    return '<span class="mas-menu"><button class="btn sm mas-btn" data-act="menu" data-k="' + esc(k) + '" aria-expanded="' + ab + '" aria-haspopup="true" title="' + esc(titulo || 'Más opciones') + '" aria-label="' + esc(titulo || 'Más opciones') + '">' + label + '</button>' + (ab ? '<span class="menu-pop" role="menu">' + items + '</span>' : '') + '</span>';
  }
  function cerrarMenus() { S.menuAb = null; document.querySelectorAll('.menu-pop').forEach(function (x) { x.remove(); }); document.querySelectorAll('.mas-btn[aria-expanded="true"]').forEach(function (x) { x.setAttribute('aria-expanded', 'false'); }); }
  function botonBorrar(act, i, texto, cls) {
    var k = act + (i == null ? '' : i);
    return '<button class="btn ' + (cls || 'sm') + ' rojo" data-act="' + act + '"' + (i == null ? '' : ' data-i="' + i + '"') + '>' + (S._c2 === k ? 'Tocá de nuevo para confirmar' : texto) + '</button>';
  }

  /* ---------- guardado ---------- */
  var timers = {};
  function pintarMsg(k) { var e = $('g-' + k); if (!e) return; var m = S.msg[k] || '', err = m.charAt(0) === '!'; e.textContent = err ? m.slice(1) : m; e.className = 'guardado' + (err ? ' err' : ''); }
  function guardar(k, ya) {
    S.msg[k] = 'Guardando…'; pintarMsg(k);
    clearTimeout(timers[k]);
    var em = S.em, ep = S.ep;
    timers[k] = setTimeout(function () {
      var p = k === 'medias' ? (em ? store.set('faena', em.lunes, limpiarSemana(em.doc)) : null) : (ep ? store.set('produccion', ep.fecha, limpiarOrden(ep.doc)) : null);
      if (!p) return;
      p.then(function () { S.msg[k] = 'Guardado ' + ahoraTxt().split(', ')[1]; pintarMsg(k); tocar(); }, function () { S.msg[k] = '!No se pudo guardar. Revisá la conexión.'; pintarMsg(k); });
    }, ya ? 0 : 700);
  }
  function limpiarSemana(d) {
    var x = clone(d); delete x.id;
    x.stockInicial = x.stockInicial === '' || x.stockInicial == null ? null : +x.stockInicial;
    x.dias.forEach(function (dia) {
      dia.faena.forEach(function (r) { r.propios = +r.propios || 0; r.usuarios = +r.usuarios || 0; r.origen = String(r.origen || '').toUpperCase().trim(); });
      dia.clientes.forEach(function (r) { r.cant = +r.cant || 0; r.cliente = String(r.cliente || '').toUpperCase().trim(); });
    });
    return x;
  }
  function limpiarOrden(o) {
    var x = clone(o); delete x.id; x.medias = +x.medias || 0; x.mercado = String(x.mercado || '').toUpperCase().trim();
    x.cortes.forEach(function (c) { c.corte = String(c.corte || '').toUpperCase().trim(); delete c.colgado; c.lineas.forEach(function (l) { l.t = String(l.t || '').toUpperCase().replace(/\s+/g, ' ').trim(); }); });
    x.actualizado = ahoraTxt(); x.por = S.user ? S.user.email : '';
    return x;
  }
  var tTocar = null;
  function tocar() { clearTimeout(tTocar); tTocar = setTimeout(function () { var c = clone(S.config || {}); delete c.id; c.actualizado = ahoraTxt(); store.set('config', 'general', c).catch(function () {}); }, 1500); }

  /* ---------- pedidos ----------
     El listado de pedidos es el centro. De ahí salen la planilla de producción (se suma cada corte
     con un clic), la logística (pedidos agrupados en camiones) y, solas, las medias de la planilla semanal. */
  function pedidoVacio() { return { k: uid(), cliente: '', entrega: cargaDiaActual() || habilSiguiente(hoy()), medias: '', peso: '', frio: '', cortes: [], nota: '', dudas: [], origen: 'manual' }; }
  // Fresco o congelado, si el pedido lo aclara.
  function frioDe(x) { var t = norm(x); return /CONG/.test(t) ? 'CONGELADO' : /FRESC/.test(t) ? 'FRESCO' : ''; }
  function frioBadge(f) { return f ? '<span class="badge ' + (f === 'CONGELADO' ? 'cong' : 'fresco') + '">' + esc(f) + '</span>' : ''; }
  // El texto de un corte no repite el cliente: se le saca el nombre entre comillas si lo trae.
  function sinCliente(t, cli) {
    var c = norm(cli), s = String(t || '');
    if (!c) return s;
    return s.replace(/\s*[“"«]([^“”"«»]*)[”"»]/g, function (todo, dentro) { var d = norm(dentro); return d && (d === c || c.indexOf(d) >= 0 || d.indexOf(c) >= 0) ? '' : todo; }).replace(/\s+/g, ' ').trim();
  }
  // En producción sí va el cliente, porque ahí se juntan renglones de varios pedidos.
  function textoProd(p, c) { return sinCliente(c.texto, p.cliente) + ' “' + String(p.cliente || '').toUpperCase().trim() + '”'; }
  /* ---------- clientes ----------
     Base de clientes con su número de cuenta. Es privada (privado/clientes): la ve y la cambia quien ingresa.
     Cada pedido muestra el número de su cliente; si se escribe otro en el pedido, vale ese. */
  function clientes() { return S.clientes || []; }
  // Nombre sin la forma societaria ("CARNES URCA SOCIEDAD POR ACCIONES S" y "URCA S.A.S." se comparan sin eso).
  function claveCliente(nombre) {
    var t = norm(nombre).replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim(), antes;
    do { antes = t; t = t.replace(/ (S A S|SAS|S R L|SRL|S A C I|SACI|S A|SA|LLC|LTD|SAPEM|SOCIEDAD ANONIMA\w*|SOCIEDAD POR ACCI\w*( S\w*)?|SOCIEDAD DE RESPONSAB\w*( LIMITADA)?|SOCIEDAD SIMPLE|SOCIEDAD COMERCI\w*)$/, '').replace(/[ \-]+$/, ''); } while (t !== antes);
    return t;
  }
  // ¿Son el mismo cliente? Mismo nombre sin la forma societaria, la misma cuenta, o un nombre contenido en el
  // otro ("RECREO" e "INDUSTRIAS FRIGORIFICAS RECREO"). Si los dos tienen cuenta y es distinta, no lo son.
  var GENERICAS = { LA: 1, EL: 1, LOS: 1, LAS: 1, DE: 1, DEL: 1, INDUSTRIAS: 1, INDUSTRIA: 1, FRIGORIFICO: 1, FRIGORIFICOS: 1, FRIGORIFICA: 1, FRIGORIFICAS: 1, CARNES: 1, CARNICERIA: 1, DISTRIBUIDORA: 1, SUPERMERCADO: 1, AUTOSERVICIO: 1 };
  function mismoCliente(a, b) {
    var ka = claveCliente(a), kb = claveCliente(b);
    if (!ka || !kb) return false;
    if (ka === kb) return true;
    var ca = cuentaDe(a), cb = cuentaDe(b);
    if (ca && cb) return ca === cb;
    var wa = palabras(ka).filter(function (w) { return !GENERICAS[w]; }), wb = palabras(kb).filter(function (w) { return !GENERICAS[w]; });
    if (!wa.length || !wb.length) return false;
    var corto = wa.length <= wb.length ? wa : wb, largo = corto === wa ? wb : wa;
    return corto.every(function (w) { return largo.indexOf(w) >= 0; });
  }
  function palabras(clave) { return clave.split(/[^A-Z0-9Ñ]+/).filter(function (w) { return w.length > 1 || /\d/.test(w); }); }
  function indiceClientes() {
    var l = clientes();
    if (S._cliIdx && S._cliIdx.de === l) return S._cliIdx;
    var x = { de: l, lista: l.map(function (c) { var k = claveCliente(c.n), w = {}; palabras(k).forEach(function (p) { w[p] = 1; }); return { n: c.n, c: String(c.c || ''), p: !!c.p, nn: norm(c.n), k: k, w: w, nw: Object.keys(w).length }; }) };
    S._cliIdx = x; return x;
  }
  // Devuelve la cuenta del cliente: la que se eligió para ese nombre, o la que el nombre identifica sin dudas.
  // En "cand" van siempre los clientes parecidos de la base, para poder elegir o cambiar.
  function buscarCuenta(cliente) {
    var nn = norm(cliente), k = claveCliente(cliente), L = indiceClientes().lista, res = { c: '', cand: [] };
    if (!nn || !L.length) return res;
    var cuentas = function (lista) { var v = {}; lista.forEach(function (e) { if (e.c) v[e.c] = 1; }); return Object.keys(v); };
    // 1. El mismo nombre, tal cual está en la base (incluye los nombres cortos ya aprendidos).
    var igual = L.filter(function (e) { return e.nn === nn && e.c; }), ci = cuentas(igual), elegida = igual.filter(function (e) { return e.p; })[0];
    // 2. Todos los clientes de la base que tienen las palabras del nombre ("DIGAR" → DIGAR SA, FRIGORIFICO DIGAR SRL…).
    var pw = palabras(k), parecidos = pw.length ? L.filter(function (e) { return e.c && pw.every(function (w) { return e.w[w]; }); }) : [];
    // 3. El mismo nombre sin la forma societaria, o una sucursal ("DINO ALTA GRACIA" toma el número de "DINO").
    var mismo = k ? L.filter(function (e) { return e.c && e.k === k; }) : [];
    if (!mismo.length) { var pre = L.filter(function (e) { return e.c && e.k && k.indexOf(e.k + ' ') === 0; }), largo = Math.max.apply(null, pre.map(function (e) { return e.k.length; })); mismo = pre.filter(function (e) { return e.k.length === largo; }); }
    var cm = cuentas(mismo), todos = cuentas(igual.concat(mismo, parecidos)), visto = {};
    res.cand = igual.concat(mismo, parecidos).filter(function (e) { if (e.nn === nn && e.p) return false; var key = e.c + '|' + e.nn; if (visto[key]) return false; visto[key] = 1; return true; })
      .sort(function (a, b) { return a.nw - b.nw || (a.c.charAt(0) === '2' ? 0 : 1) - (b.c.charAt(0) === '2' ? 0 : 1) || a.n.localeCompare(b.n) || a.c.localeCompare(b.c); }).slice(0, 15);
    if (elegida) res.c = elegida.c;                                   // la que se eligió para este nombre
    else if (ci.length === 1) res.c = ci[0];                           // el nombre está en la base con una sola cuenta
    else if (!ci.length && cm.length === 1 && todos.length === 1) res.c = cm[0];   // sale sola únicamente si no hay ninguna otra posible
    return res;
  }
  function cuentaDe(cliente) { return buscarCuenta(cliente).c; }
  function clientePorCuenta(c) { c = String(c || '').trim(); if (!c) return ''; var e = clientes().filter(function (x) { return String(x.c || '').trim() === c; })[0]; return e ? String(e.n || '').toUpperCase().trim() : ''; }
  function cuentaPedido(p) { return String(p.cuenta || '').trim() || cuentaDe(p.cliente); }
  function ctaHTML(c, tocar) { return c ? '<span class="cta' + (tocar ? ' toca' : '') + '">N° ' + esc(c) + '</span>' : tocar ? '<span class="cta toca falta">Sin N°</span>' : ''; }
  // La cuenta elegida queda como la de ese cliente: vale para este pedido y para todos los de ese nombre, hasta que se cambie.
  function fijarCuenta(nombre, cta) {
    var l = clone(clientes()), k = norm(nombre), mismos = [];
    cta = String(cta || '').trim(); if (!k || !cta) return Promise.resolve();
    l.forEach(function (x, i) { if (norm(x.n) === k) mismos.push(i); });
    var ya = mismos.filter(function (i) { return l[i].c === cta; })[0], vacio = mismos.filter(function (i) { return !l[i].c; })[0], antes = mismos.filter(function (i) { return l[i].p; })[0], cual;
    if (ya != null) cual = ya;
    else if (vacio != null) { l[vacio].c = cta; cual = vacio; }
    else if (antes != null) { l[antes].c = cta; cual = antes; }           // se cambia la que se había elegido antes
    else { cual = l.length; l.push({ n: String(nombre).toUpperCase().replace(/\s+/g, ' ').trim(), c: cta }); }
    mismos.forEach(function (i) { delete l[i].p; }); l[cual].p = 1;
    return escribirClientes(l);
  }
  function ponerCuenta(id, c) {
    var p = pedidoDe(id); c = String(c || '').trim(); if (!p || !c) return Promise.resolve();
    var antes = Promise.resolve();
    if (p.cuenta) { var doc = clone(p); delete doc.id; doc.cuenta = ''; S.pedidos = poner(S.pedidos, id, doc); antes = store.set('pedidos', id, doc); }
    return antes.then(function () { return fijarCuenta(p.cliente, c); }).then(function () { return publicarLog(p.entrega); });
  }
  // Renglón del número de cuenta en el pedido abierto: siempre se puede elegir otro de la base o escribir uno.
  function elegirCuentaHTML(p) {
    var id = esc(p.id), actual = cuentaPedido(p), cand = buscarCuenta(p.cliente).cand, ops = cand.filter(function (e) { return e.c !== actual; });
    var h = '<p class="lp sin-cta' + (actual ? ' con' : '') + '"><span><b>N° de cuenta</b> ';
    var nombreDe = function (c) { var e = indiceClientes().lista.filter(function (x) { return x.c === c && x.nn !== norm(p.cliente); })[0]; return e ? e.n : ''; };
    h += (actual ? '<strong class="cta-num">' + esc(actual) + '</strong>' + (nombreDe(actual) ? ' <span class="small muted">' + esc(nombreDe(actual)) + '</span>' : '')
      : ops.length ? 'Elegí cuál es: queda para este cliente.' : 'No está en la base: poné el número y queda guardado.') + '</span><span class="lp-der">';
    // Casillero para escribir el número ahí mismo: cuando no hay de dónde elegir, o cuando se pide "otro número".
    if (S.ctaOtro === p.id || (!actual && !ops.length)) return h + '<input type="text" inputmode="numeric" class="cta-in" data-cta-in="' + id + '" placeholder="Número" aria-label="Número de cuenta de ' + esc(p.cliente) + '">'
      + '<button class="btn sm pri" data-act="cta-guardar" data-id="' + id + '">Guardar</button>' + (S.ctaOtro === p.id ? '<button class="btn sm" data-act="cta-cancelar">Cancelar</button>' : '') + '</span></p>';
    if (!ops.length) return h + '<button class="btn sm" data-act="cta-otro" data-id="' + id + '">Cambiar</button></span></p>';
    return h + '<select class="mover" data-cta="' + id + '" aria-label="' + (actual ? 'Cambiar' : 'Elegir') + ' la cuenta de ' + esc(p.cliente) + '"><option value="">' + (actual ? 'Cambiar…' : 'Elegir…') + '</option>'
      + ops.map(function (e) { return '<option value="' + esc(e.c) + '">' + esc(e.c) + ' · ' + esc(e.n) + '</option>'; }).join('') + '<option value="otra">Otro número…</option></select></span></p>';
  }
  function escribirClientes(l) {
    S.clientes = l;
    return store.set('privado', 'clientes', { lista: l, actualizado: ahoraTxt() }).then(function () { conciliarLog(); });
  }
  // Suma o cambia clientes; si el nombre ya estaba, queda lo nuevo. Un número vacío no pisa uno cargado.
  // "varios": carga de una lista, donde un mismo nombre puede tener más de una cuenta.
  function sumarClientes(nuevos, varios) {
    var l = clone(clientes()), pos = {}, altas = 0, cambios = 0;
    l.forEach(function (x, i) { (pos[norm(x.n)] = pos[norm(x.n)] || []).push(i); });
    nuevos.forEach(function (x) {
      var nombre = String(x.n || '').toUpperCase().replace(/\s+/g, ' ').trim(), k = norm(nombre), cta = String(x.c == null ? '' : x.c).trim();
      if (!k) return;
      var mismos = pos[k] || [];
      if (!mismos.length) { pos[k] = [l.length]; l.push({ n: nombre, c: cta }); altas++; return; }
      if (!cta || mismos.some(function (i) { return l[i].c === cta; })) return;
      var vacio = mismos.filter(function (i) { return !l[i].c; })[0];
      if (vacio != null) { l[vacio].c = cta; cambios++; }
      else if (varios) { mismos.push(l.length); l.push({ n: nombre, c: cta }); altas++; }
      else { l[mismos[0]].c = cta; cambios++; }
    });
    return escribirClientes(l).then(function () { return { altas: altas, cambios: cambios }; });
  }
  // Lista pegada: una línea por cliente, con el número y el nombre en cualquier orden (sirve copiar desde Excel).
  function leerListaClientes(txt) {
    var out = [];
    String(txt || '').replace(/\r/g, '').split('\n').forEach(function (raw) {
      var linea = raw.trim(); if (!linea) return;
      var cols = linea.split(/\t|;|\|/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (cols.length < 2) { var m = linea.match(/^(\d[\d.\-\/]*)[\s,]+(.+)$/) || linea.match(/^(.+?)[\s,]+(\d[\d.\-\/]*)$/); if (m) cols = [m[1], m[2]]; }
      var nums = cols.filter(function (x) { return /^\d[\d.\-\/]*$/.test(x); }), letras = cols.filter(function (x) { return /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(x); });
      // Si hay más de un número (por ejemplo el CUIT), el de cuenta es el que no tiene 11 dígitos.
      var num = nums.filter(function (x) { return x.replace(/\D/g, '').length !== 11; })[0] || '';
      var nombre = letras.sort(function (a, b) { return b.length - a.length; })[0] || '';
      if (!nombre) return;
      if (!num && /^(CLIENTES?|NOMBRE|RAZON SOCIAL|CUENTA|CODIGO|NUMERO|NRO)\b/.test(norm(nombre))) return;   // encabezado de la planilla
      out.push({ n: nombre, c: num });
    });
    return out;
  }
  // Nombres que ya aparecen en las planillas de medias y en los pedidos.
  function clientesConocidos() {
    var v = {}, out = [];
    var ver = function (nombre) { var k = norm(nombre); if (k && !v[k]) { v[k] = 1; out.push({ n: nombre, c: '' }); } };
    (S.pedidos || []).forEach(function (p) { ver(p.cliente); });
    (S.faena || []).forEach(function (sem) { sem.dias.forEach(function (d) { d.clientes.forEach(function (r) { ver(r.cliente); }); }); });
    return out;
  }
  function renderClientes() {
    var el = $('view-clientes');
    if (!S.editor) { el.innerHTML = '<div class="panel"><p class="state">Para ver los clientes hay que ingresar con una cuenta autorizada.</p></div>'; return; }
    var l = clientes(), sinNum = l.filter(function (x) { return !x.c; }).length;
    var h = repHTML() + '<div class="panel carga"><h2>Agregar cliente</h2><div class="campos cli-alta">'
      + '<label class="campo"><span>N° de cuenta</span><input type="text" inputmode="numeric" id="cli-c" autocomplete="off"></label>'
      + '<label class="campo"><span>Nombre del cliente</span><input type="text" id="cli-n" autocomplete="off" style="text-transform:uppercase"></label></div>'
      + '<div class="acciones"><button class="btn pri" data-act="cli-agregar">Agregar</button><span class="guardado" id="g-cli"></span></div></div>';
    h += '<div class="panel"><div class="cam-cab"><h2>Clientes</h2><span class="small muted">' + (l.length ? l.length + plural(l.length, ' cliente', ' clientes') + (sinNum ? ' · ' + sinNum + ' sin número' : '') : 'todavía no hay clientes cargados') + '</span></div>';
    if (l.length > 6) h += '<input type="search" id="cli-buscar" placeholder="Buscar por nombre o número…" aria-label="Buscar cliente" value="' + esc(S.cliBuscar || '') + '">';
    if (l.length) h += '<table class="pl cli"><thead><tr><th>N° de cuenta</th><th>Cliente</th><th></th></tr></thead><tbody id="cli-filas"></tbody></table><p class="small muted" id="cli-nota"></p>';
    else h += '<p class="muted">Agregalos de a uno arriba, o varios juntos abajo.</p>';
    h += '</div>';
    var conocidos = clientesConocidos().filter(function (x) { return !l.some(function (y) { return norm(y.n) === norm(x.n); }); }).length;
    h += '<div class="panel"><details' + (S._cliVarios ? ' open' : '') + ' id="det-cli"><summary>Cargar varios juntos</summary>'
      + '<label class="campo"><span>Pegá la lista: una línea por cliente, con el número y el nombre (se puede copiar desde Excel)</span><textarea id="cli-txt" rows="8" placeholder="21588  ALMACOR&#10;21147  JAVIER BRISIGHELLI"></textarea></label>'
      + '<div class="acciones"><button class="btn pri" data-act="cli-pegar">Agregar la lista</button>'
      + '<label class="btn" style="display:inline-flex;align-items:center">Subir un archivo (.txt o .csv)<input type="file" id="cli-archivo" accept=".txt,.csv,.tsv,text/plain,text/csv" hidden></label>'
      + (conocidos ? '<button class="btn" data-act="cli-traer">Traer los ' + conocidos + ' nombres que ya figuran en pedidos y planillas</button>' : '') + '</div>'
      + '<p class="small muted">Los que ya estaban se actualizan; no se borra ninguno.</p></details></div>';
    el.innerHTML = h; pintarMsg('cli'); filtrarClientes();
  }
  /* Reporte de kilos por sucursal (pedido de Renzo para DINO): cada pedido cuyo cliente empieza con el nombre
     elegido es una sucursal; se suman los kilos de las entregas de la semana (lunes a domingo) y se ve cada día aparte. */
  function repDatos(L, pref) {
    var P = norm(pref || ''), fin = mas(L, 6), filas = {}, dias = [];
    if (!P) return { dias: [], filas: [] };
    (S.pedidos || []).forEach(function (p) {
      var c = norm(p.cliente || ''); if (!p.entrega || p.entrega < L || p.entrega > fin || (c !== P && c.indexOf(P + ' ') !== 0)) return;
      var suc = c === P ? '(sin sucursal)' : c.slice(P.length + 1).trim(), k = kgPedido(p);
      var r = filas[suc] || (filas[suc] = { suc: suc, d: {}, tot: 0, aprox: false, falta: false });
      r.d[p.entrega] = (r.d[p.entrega] || 0) + k.kg; r.tot += k.kg; if (!k.manual) r.aprox = true; if (k.falta) r.falta = true;
      r.cortes = r.cortes || {};
      r.grupos = r.grupos || {};
      var suma = function (nom, kg, sinPeso, grupo) { var x = r.cortes[nom] || (r.cortes[nom] = { kg: 0, sin: [] }); x.kg += kg; if (sinPeso) x.sin.push(sinPeso); r.grupos[grupo] = (r.grupos[grupo] || 0) + kg; };
      var enCortes = 0;
      if (+p.medias) { suma('MEDIAS RES (' + n(+p.medias) + ')', +p.medias * kgMedia(), '', 'MEDIAS RES'); enCortes += +p.medias * kgMedia(); }
      (p.cortes || []).forEach(function (c) { if (!c.texto) return; var kc = kgDeTexto(c.texto, c.corte); enCortes += kc.kg; suma(repNomCorte(c.texto), kc.kg, kc.falta ? String(c.texto).trim() : '', norm(c.corte || '') || 'OTROS'); });
      if (k.manual && k.kg - enCortes >= 1) suma('SIN DETALLE (kg cargados a mano)', k.kg - enCortes, '', 'SIN DETALLE');
      if (dias.indexOf(p.entrega) < 0) dias.push(p.entrega);
    });
    dias.sort();
    return { dias: dias, filas: Object.keys(filas).map(function (k) { return filas[k]; }).sort(function (a, b) { return a.suc.localeCompare(b.suc); }) };
  }
  // Nombre del corte sin la cantidad del principio ni el cliente entre comillas: "100KG JAMON 4 MUSC (COD 341)" → "JAMON 4 MUSC (COD 341)".
  function repNomCorte(t) { return norm(String(t || '').replace(/["“”][^"“”]*["“”]\s*$/, '').replace(/^\s*[\d.,½]+\s*(KGS?|KILOS?|K|CAJAS?|CJS?|CANASTOS?|CANASTAS?|UNIDADES|UNIDAD|UNID|UND|U)?\.?\s*(DE\s+|X\s+)?/i, '')) || 'SIN NOMBRE'; }
  function repCortesDe(r) { return Object.keys(r.cortes || {}).map(function (k) { return { n: k, kg: Math.round(r.cortes[k].kg), sin: r.cortes[k].sin }; }).sort(function (a, b) { return b.kg - a.kg || a.n.localeCompare(b.n); }); }
  // Total unificado por corte (JAMON, PECHO, BONDIOLA…, sin importar el código de cada sucursal).
  function repOrdenGrupos(nombres) { return nombres.sort(function (a, b) { var oa = a === 'MEDIAS RES' ? -1 : a === 'SIN DETALLE' ? 1e4 : ordenCorte(a), ob = b === 'MEDIAS RES' ? -1 : b === 'SIN DETALLE' ? 1e4 : ordenCorte(b); return oa - ob || a.localeCompare(b); }); }
  function repMatriz(d) {
    var g = {}; d.filas.forEach(function (r) { Object.keys(r.grupos || {}).forEach(function (k) { g[k] = 1; }); });
    return repOrdenGrupos(Object.keys(g)).map(function (k) { var fila = { corte: k, por: {}, tot: 0 }; d.filas.forEach(function (r) { var v = Math.round((r.grupos || {})[k] || 0); fila.por[r.suc] = v; fila.tot += v; }); return fila; });
  }
  // PDF del cuadro "Total por corte y sucursal": hoja apaisada, la letra se achica para que entren todas las sucursales.
  function repMatrizPDF() {
    var L0 = window.PDFLib, L = S.repSem || lunesDe(hoy()), pref = S.repCli == null ? 'DINO' : S.repCli, d = repDatos(L, pref), mz = repMatriz(d);
    var cols = d.filas.map(function (r) { return r.suc; }).concat(['TOTAL']), filas = mz.map(function (f) { return [f.corte].concat(d.filas.map(function (r) { return f.por[r.suc] ? n(f.por[r.suc]) : '-'; }), [n(f.tot)]); });
    var totF = ['TOTAL'].concat(d.filas.map(function (r) { return n(Math.round(r.tot)); }), [n(mz.reduce(function (a, f) { return a + f.tot; }, 0))]);
    return L0.PDFDocument.create().then(function (doc) {
      return Promise.all([doc.embedFont(L0.StandardFonts.Helvetica), doc.embedFont(L0.StandardFonts.HelveticaBold)]).then(function (fs) {
        var F = fs[0], FB = fs[1], AN = 841.89, AL = 595.28, M = 24, cache = {};
        var negro = L0.rgb(0.1, 0.1, 0.1), gris = L0.rgb(0.42, 0.45, 0.48), linea = L0.rgb(0.82, 0.84, 0.86), fondo = L0.rgb(0.93, 0.95, 0.96);
        var limpio = function (t) { return Array.from(String(t || '')).map(function (ch) { if (cache[ch] != null) return cache[ch]; var v = ch; try { F.encodeText(ch); } catch (e) { v = ch === '–' ? '-' : '?'; } cache[ch] = v; return v; }).join(''); };
        var W = function (fu, t, z) { return fu.widthOfTextAtSize(limpio(t), z); };
        // Encabezado de columna en hasta 2 renglones.
        var partir = function (t, w, z) { var pals = String(t).split(' ').map(function (p) { var q = p; while (q.length > 3 && W(FB, q, z) > w) q = q.slice(0, -2) + '.'; return q; }), a = '', b = ''; pals.forEach(function (p) { if (!b && W(FB, (a ? a + ' ' : '') + p, z) <= w) a = (a ? a + ' ' : '') + p; else b = (b ? b + ' ' : '') + p; }); return b ? [a, b] : [a]; };
        var tam = 11.5, ancho0, anchoC;
        for (; tam > 5; tam -= 0.25) {
          ancho0 = Math.max.apply(null, filas.map(function (f) { return W(FB, f[0], tam); }).concat([W(FB, 'CORTE', tam)])) + 10;
          anchoC = (AN - 2 * M - ancho0) / cols.length;
          var cabe = filas.concat([totF]).every(function (f) { return f.slice(1).every(function (v) { return W(FB, v, tam) + 14 <= anchoC; }); });
          if (cabe && (filas.length + 3) * tam * 1.9 < AL - 2 * M - 70) break;
        }
        // Los nombres de las sucursales pueden ir en letra más chica que los números (en dos renglones si hace falta).
        var tz = Math.min(tam * 0.8, 8); while (tz > 5.5 && !cols.every(function (c) { return partir(c, anchoC - 12, tz).every(function (x) { return W(FB, x, tz) <= anchoC - 12; }) && partir(c, anchoC - 12, tz).length <= 2; })) tz -= 0.25;
        var pag = doc.addPage([AN, AL]), y = AL - M;
        pag.drawText(limpio(norm(pref) + ' · TOTAL POR CORTE Y SUCURSAL'), { x: M, y: y - 14, size: 15, font: FB, color: negro });
        pag.drawText(limpio(repSemTxt(L)), { x: M, y: y - 30, size: 10, font: F, color: gris }); y -= 46;
        var fila = Math.min(tam * 2.6, (y - M - 30 - tz * 2.6) / (filas.length + 1)), xCol = function (i) { return M + ancho0 + i * anchoC; };
        // Encabezados
        var hCab = tz * 2.6;
        pag.drawText('CORTE', { x: M + 4, y: y - hCab + 4, size: tz, font: FB, color: gris });
        cols.forEach(function (c, i) { var ls = partir(c, anchoC - 12, tz); ls.forEach(function (t, k) { var w = W(FB, t, tz); pag.drawText(limpio(t), { x: xCol(i + 1) - 3 - w, y: y - hCab + 4 + (ls.length - 1 - k) * tz * 1.15, size: tz, font: FB, color: i === cols.length - 1 ? negro : gris }); }); });
        y -= hCab; pag.drawLine({ start: { x: M, y: y }, end: { x: AN - M, y: y }, thickness: 1.4, color: negro });
        var dibFila = function (f, total) {
          if (total) pag.drawRectangle({ x: M, y: y - fila, width: AN - 2 * M, height: fila, color: fondo });
          pag.drawText(limpio(f[0]), { x: M + 4, y: y - fila / 2 - tam * 0.35, size: tam, font: FB, color: negro });
          f.slice(1).forEach(function (v, i) { var t = limpio(v), w = W(i === f.length - 2 || total ? FB : F, t, tam); pag.drawText(t, { x: xCol(i + 1) - 3 - w, y: y - fila / 2 - tam * 0.35, size: tam, font: i === f.length - 2 || total ? FB : F, color: v === '-' ? gris : negro }); });
          y -= fila; pag.drawLine({ start: { x: M, y: y }, end: { x: AN - M, y: y }, thickness: total ? 1.4 : 0.5, color: total ? negro : linea });
        };
        filas.forEach(function (f) { if (y - fila < M + fila) { pag = doc.addPage([AN, AL]); y = AL - M; } dibFila(f, false); });
        dibFila(totF, true);
        pag.drawText(limpio('Todo en kilos, según lo pedido (medias a ' + kgMedia() + ' kg, cajas a ' + kgCaja() + ' kg). Cortes unificados por rubro.'), { x: M, y: M - 8, size: 7.5, font: F, color: gris });
        return doc.save();
      });
    });
  }
  var REP_SEMANAS = 4;
  function repSemanas(L, pref) {
    var sems = [], g = {};
    for (var k = REP_SEMANAS - 1; k >= 0; k--) { var Lk = mas(L, -7 * k), dk = repDatos(Lk, pref), tk = {}; dk.filas.forEach(function (r) { Object.keys(r.grupos || {}).forEach(function (q) { tk[q] = (tk[q] || 0) + (r.grupos[q] || 0); g[q] = 1; }); }); sems.push({ L: Lk, t: tk }); }
    return { sems: sems, filas: repOrdenGrupos(Object.keys(g)).map(function (q) { var f = { corte: q, por: {}, tot: 0 }; sems.forEach(function (sm) { var v = Math.round(sm.t[q] || 0); f.por[sm.L] = v; f.tot += v; }); return f; }) };
  }
  function repSemCorta(L) { var a = String(L).split('-'), b = String(mas(L, 6)).split('-'); return (+a[2]) + '/' + (+a[1]) + '–' + (+b[2]) + '/' + (+b[1]); }
  function repSemTxt(L) { return 'Semana del ' + diaCorto(L).replace(/^\S+ /, '') + ' al ' + diaCorto(mas(L, 6)).replace(/^\S+ /, ''); }
  function repHTML() {
    var L = S.repSem || lunesDe(hoy()), pref = S.repCli == null ? 'DINO' : S.repCli, d = repDatos(L, pref);
    var h = '<div class="panel rep-suc"><div class="cam-cab"><h2>Kilos por sucursal</h2><span class="small muted">para el reporte semanal</span></div>'
      + '<div class="rep-barra"><label class="campo"><span>Cliente</span><input type="text" id="rep-cli" value="' + esc(pref) + '" style="text-transform:uppercase" autocomplete="off"></label>'
      + '<span class="rep-sem"><button class="btn step" data-act="rep-sem" data-d="-7" aria-label="Semana anterior">‹</button><b>' + esc(repSemTxt(L)) + '</b><button class="btn step" data-act="rep-sem" data-d="7" aria-label="Semana siguiente">›</button></span></div>';
    if (!d.filas.length) return h + '<p class="muted">No hay pedidos de ' + esc(pref || '…') + ' con entrega esa semana.</p></div>';
    var tot = 0, tDia = {};
    h += '<div class="rep-tabla"><table class="pl"><thead><tr><th>Sucursal</th>' + d.dias.map(function (f) { return '<th class="num">' + esc(diaCorto(f)) + '</th>'; }).join('') + '<th class="num">Total semana</th></tr></thead><tbody>';
    d.filas.forEach(function (r) {
      tot += r.tot; d.dias.forEach(function (f) { tDia[f] = (tDia[f] || 0) + (r.d[f] || 0); });
      h += '<tr><td>' + esc(r.suc) + (r.falta ? ' <span class="small neg" title="Tiene renglones sin peso: no suman">*</span>' : '') + '</td>' + d.dias.map(function (f) { return '<td class="num">' + (r.d[f] ? n(r.d[f]) : '–') + '</td>'; }).join('') + '<td class="num"><b>' + n(r.tot) + '</b></td></tr>';
    });
    h += '</tbody><tfoot><tr><th>Total</th>' + d.dias.map(function (f) { return '<th class="num">' + n(tDia[f] || 0) + '</th>'; }).join('') + '<th class="num">' + n(tot) + ' kg</th></tr></tfoot></table></div>';
    var falta = d.filas.some(function (r) { return r.falta; }), aprox = d.filas.some(function (r) { return r.aprox; });
    h += '<p class="small muted">' + (aprox ? 'Los kilos salen de lo pedido (medias a ' + kgMedia() + ' kg, cajas a ' + kgCaja() + ' kg y lo que viene en kg); si a un pedido le cargaste los kilos a mano, valen esos. ' : '') + (falta ? '* tiene renglones sin peso (unidades u otros) que no suman.' : '') + '</p>';
    h += '<details class="rep-det"' + (S.repDet ? ' open' : '') + '><summary>Cortes de cada sucursal</summary><div class="rep-cortes">' + d.filas.map(function (r) {
      return '<div class="rep-suc-c"><h3>' + esc(r.suc) + ' <small class="muted">' + n(r.tot) + ' kg</small></h3><table class="pl"><tbody>' + repCortesDe(r).map(function (c) { return '<tr><td>' + esc(c.n) + (c.sin.length ? ' <span class="small neg">(' + esc(c.sin.join(', ')) + ')</span>' : '') + '</td><td class="num">' + (c.kg ? n(c.kg) + ' kg' : '–') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }).join('') + '</div></details>';
    // Total unificado: cada corte una fila, cada sucursal una columna.
    var mz = repMatriz(d), totM = 0;
    h += '<h3 class="rep-sub">Total por corte y sucursal <small class="muted">' + esc(repSemTxt(L).toLowerCase()) + '</small> <button class="btn sm wa" data-act="rep-mz-pdf">PDF por WhatsApp</button></h3><div class="rep-tabla"><table class="pl rep-mz"><thead><tr><th>Corte</th>' + d.filas.map(function (r) { return '<th class="num">' + esc(r.suc) + '</th>'; }).join('') + '<th class="num">Total</th></tr></thead><tbody>'
      + mz.map(function (f) { totM += f.tot; return '<tr><td>' + esc(f.corte) + '</td>' + d.filas.map(function (r) { return '<td class="num">' + (f.por[r.suc] ? n(f.por[r.suc]) : '–') + '</td>'; }).join('') + '<td class="num"><b>' + n(f.tot) + '</b></td></tr>'; }).join('')
      + '</tbody><tfoot><tr><th>Total</th>' + d.filas.map(function (r) { return '<th class="num">' + n(Math.round(r.tot)) + '</th>'; }).join('') + '<th class="num">' + n(totM) + ' kg</th></tr></tfoot></table></div>';
    // Y por semanas: las últimas 4 (todas las sucursales juntas).
    var ss = repSemanas(L, pref), totS = 0;
    h += '<h3 class="rep-sub">Total por corte, últimas ' + REP_SEMANAS + ' semanas <small class="muted">todas las sucursales</small></h3><div class="rep-tabla"><table class="pl rep-mz"><thead><tr><th>Corte</th>' + ss.sems.map(function (sm) { return '<th class="num">' + esc(repSemCorta(sm.L)) + '</th>'; }).join('') + '<th class="num">Total</th></tr></thead><tbody>'
      + ss.filas.map(function (f) { totS += f.tot; return '<tr><td>' + esc(f.corte) + '</td>' + ss.sems.map(function (sm) { return '<td class="num">' + (f.por[sm.L] ? n(f.por[sm.L]) : '–') + '</td>'; }).join('') + '<td class="num"><b>' + n(f.tot) + '</b></td></tr>'; }).join('')
      + '</tbody><tfoot><tr><th>Total</th>' + ss.sems.map(function (sm) { return '<th class="num">' + n(ss.filas.reduce(function (a, f) { return a + (f.por[sm.L] || 0); }, 0)) + '</th>'; }).join('') + '<th class="num">' + n(totS) + ' kg</th></tr></tfoot></table></div>';
    return h + '<div class="acciones"><button class="btn" data-act="rep-copiar">Copiar el reporte</button><button class="btn" data-act="rep-excel">Descargar Excel</button><span class="guardado" id="g-rep"></span></div></div>';
  }
  function repTexto(sep) {
    var L = S.repSem || lunesDe(hoy()), pref = S.repCli == null ? 'DINO' : S.repCli, d = repDatos(L, pref), t = [], tot = 0;
    if (sep) {
      t.push([norm(pref) + ' - ' + repSemTxt(L)].join(sep));
      t.push(['Sucursal'].concat(d.dias.map(diaCorto), ['Total semana (kg)']).join(sep));
      d.filas.forEach(function (r) { tot += r.tot; t.push([r.suc].concat(d.dias.map(function (f) { return r.d[f] || 0; }), [r.tot]).join(sep)); });
      t.push(['TOTAL'].concat(d.dias.map(function (f) { return d.filas.reduce(function (a, r) { return a + (r.d[f] || 0); }, 0); }), [tot]).join(sep));
      t.push('', ['Sucursal', 'Corte', 'Kg semana', 'Sin peso'].join(sep));
      d.filas.forEach(function (r) { repCortesDe(r).forEach(function (c) { t.push([r.suc, c.n, c.kg, c.sin.join(' / ')].join(sep)); }); });
      var mz = repMatriz(d);
      t.push('', ['Total por corte'].concat(d.filas.map(function (r) { return r.suc; }), ['Total (kg)']).join(sep));
      mz.forEach(function (f) { t.push([f.corte].concat(d.filas.map(function (r) { return f.por[r.suc] || 0; }), [f.tot]).join(sep)); });
      var ss = repSemanas(L, pref);
      t.push('', ['Por semanas'].concat(ss.sems.map(function (sm) { return repSemCorta(sm.L); }), ['Total (kg)']).join(sep));
      ss.filas.forEach(function (f) { t.push([f.corte].concat(ss.sems.map(function (sm) { return f.por[sm.L] || 0; }), [f.tot]).join(sep)); });
      return t.join('\r\n');
    }
    t.push('*' + norm(pref) + ' · kilos por sucursal*', repSemTxt(L), '');
    d.filas.forEach(function (r) { tot += r.tot; t.push(r.suc + ': *' + n(r.tot) + ' kg*' + (d.dias.length > 1 ? ' (' + d.dias.filter(function (f) { return r.d[f]; }).map(function (f) { return diaCorto(f) + ' ' + n(r.d[f]); }).join(' + ') + ')' : '')); repCortesDe(r).forEach(function (c) { t.push('   • ' + c.n + ': ' + (c.kg ? n(c.kg) + ' kg' : c.sin.join(', '))); }); t.push(''); });
    t.push('*Total: ' + n(tot) + ' kg*', '', '*Total por corte*');
    repMatriz(d).forEach(function (f) { t.push(f.corte + ': ' + n(f.tot) + ' kg'); });
    return t.join('\n');
  }
  function filtrarClientes() {
    var tb = $('cli-filas'); if (!tb) return;
    var q = norm(S.cliBuscar || ''), l = clientes(), MAX = 80;
    var lista = l.map(function (x, i) { return [x, i]; }).filter(function (x) { return !q || (norm(x[0].n) + ' ' + norm(x[0].c)).indexOf(q) >= 0; })
      .sort(function (a, b) { return String(a[0].n).localeCompare(String(b[0].n)) || String(a[0].c).localeCompare(String(b[0].c)); });
    tb.innerHTML = lista.slice(0, MAX).map(function (x) {
      var c = x[0], i = x[1];
      return '<tr><td><input type="text" inputmode="numeric" data-cli="' + i + '" data-k="c" value="' + esc(c.c || '') + '" placeholder="Falta" aria-label="Número de cuenta de ' + esc(c.n) + '"></td>'
        + '<td><input type="text" data-cli="' + i + '" data-k="n" value="' + esc(c.n) + '" style="text-transform:uppercase" aria-label="Nombre del cliente"></td>'
        + '<td><button class="btn x" data-act="cli-quitar" data-i="' + i + '" aria-label="Quitar a ' + esc(c.n) + '">×</button></td></tr>';
    }).join('');
    $('cli-nota').textContent = (lista.length > MAX ? 'Se muestran ' + MAX + ' de ' + n(lista.length) + (q ? ' que coinciden' : '') + ': usá el buscador para encontrar el resto. ' : !lista.length ? 'Ningún cliente coincide con la búsqueda. ' : '') + 'Los cambios se guardan solos al salir de cada casillero.';
  }

  /* Precios y fletes: solo los ven quienes ingresan. El precio de cada corte se guarda en el pedido
     y el costo de cada camión en un documento privado por día; nada de esto se publica. */
  function plata(v, dec) { return '$ ' + (+v || 0).toLocaleString('es-AR', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 }); }
  function precioHTML(id, k, valor, que, iva) {
    var chip = function (v, txt) { return '<button class="btn sm chip" data-act="iva" data-id="' + esc(id) + '" data-k="' + esc(k) + '" data-v="' + v + '" aria-pressed="' + (iva === v) + '" aria-label="Precio de ' + esc(que) + ': ' + txt + '">' + txt + '</button>'; };
    return '<label class="precio"><span>$ / kg</span><input type="number" inputmode="decimal" step="any" min="0" data-precio="' + esc(id) + '" data-k="' + esc(k) + '" value="' + esc(valor === 0 ? 0 : valor || '') + '" aria-label="Precio por kilo de ' + esc(que) + '"></label>'
      + '<span class="chips">' + chip('iva', '+ IVA') + chip('final', 'Final') + '</span>';
  }
  // "+ IVA" o "Final": se toca uno y queda; tocarlo de nuevo lo saca.
  function guardarIva(id, k, v) {
    var p = pedidoDe(id); if (!p) return Promise.resolve();
    var doc = clone(p); delete doc.id;
    if (k === 'm') doc.ivaMedias = doc.ivaMedias === v ? '' : v;
    else doc.cortes = cortesDe(doc).map(function (c) { if (c.k === k) c.iva = c.iva === v ? '' : v; return c; });
    S.pedidos = poner(S.pedidos, id, doc);
    return store.set('pedidos', id, doc).then(function () { return publicarLog(doc.entrega); });
  }
  function guardarPrecioIva(id, k, valor, iva) {
    var p = pedidoDe(id); if (!p) return Promise.resolve();
    var doc = clone(p), v = valor === '' ? '' : +String(valor).replace(',', '.') || 0; delete doc.id;
    if (k === 'm') { doc.precioMedias = v; doc.ivaMedias = v === '' ? '' : iva; }
    else doc.cortes = cortesDe(doc).map(function (c) { if (c.k === k) { c.precio = v; c.iva = v === '' ? '' : iva; } return c; });
    S.pedidos = poner(S.pedidos, id, doc);
    return store.set('pedidos', id, doc).then(function () { return publicarLog(doc.entrega); });
  }
  function guardarPrecio(id, k, valor) {
    var p = pedidoDe(id); if (!p) return Promise.resolve();
    var doc = clone(p), v = valor === '' ? '' : +String(valor).replace(',', '.') || 0; delete doc.id;
    if (k === 'm') doc.precioMedias = v; else doc.cortes = cortesDe(doc).map(function (c) { if (c.k === k) c.precio = v; return c; });
    S.pedidos = poner(S.pedidos, id, doc);
    return store.set('pedidos', id, doc).then(function () { return publicarLog(doc.entrega); });
  }
  /* Unidad de un renglón ("20 JAMON" → sin unidad; "20 KG JAMON" → kg). Se elige en Logística y se escribe en el texto,
     así los kilos, la planilla de producción y los totales la toman igual que si hubiera venido en el pedido. */
  var UNIDADES = [['kg', 'KG'], ['cajas', 'CAJAS'], ['und', 'UNIDADES'], ['bines', 'BINES']];
  var RE_UNI = /^(\s*[\d.,]+)\s*(?:(KGS?|KILOS?|K|CAJAS?|CJS?|UND|UNIDAD(?:ES)?|UNID|U|BINES?)\.?(?:\s+(?:DE|X)\s*[\d.,]+\s*(?:KGS?|KILOS?)\.?)?)?(?=\s|$)/i;
  function unidadDe(t) {
    var m = String(t || '').match(RE_UNI); if (!m) return null;
    var u = (m[2] || '').toUpperCase();
    return !u ? '' : /^K/.test(u) ? 'kg' : /^C/.test(u) ? 'cajas' : /^B/.test(u) ? 'bines' : 'und';
  }
  function conUnidad(t, u) {
    var s = String(t || ''), m = s.match(RE_UNI), uu = UNIDADES.filter(function (x) { return x[0] === u; })[0];
    if (!m || !uu) return s;
    var resto = s.slice(m[0].length).trim();
    return m[1].trim() + ' ' + uu[1] + (resto ? ' ' + resto : '');
  }
  function guardarUnidad(id, k, u) {
    var p = pedidoDe(id); if (!p) return Promise.resolve();
    var antes = clone(p), doc = clone(p); delete doc.id;
    doc.cortes = cortesDe(doc).map(function (c) { if (c.k === k) c.texto = conUnidad(c.texto, u); return c; });
    var nuevo = clone(doc); nuevo.id = id;
    S.pedidos = poner(S.pedidos, id, doc);
    return store.set('pedidos', id, doc).then(function () { return revincularProduccion(nuevo, antes); }).then(function () { return publicarLog(doc.entrega); });
  }
  function unidadSelHTML(pid, c) {
    var u = unidadDe(c.texto);
    if (u === null || !c.k) return '';
    return '<select class="uni' + (u ? '' : ' falta') + '" data-uni="' + esc(pid) + '" data-k="' + esc(c.k) + '" aria-label="Unidad de ' + esc(c.corte) + '">'
      + (u ? '' : '<option value="">¿Unidad?</option>')
      + UNIDADES.map(function (x) { return '<option value="' + x[0] + '"' + (u === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>';
  }
  function fleteDe(f, camId) { var d = (S.fletes || {})[f]; return (d && d.camiones && d.camiones[camId]) || { modo: 'viaje', valor: '' }; }
  function guardarFlete(f, camId, cambio) {
    var d = clone((S.fletes || {})[f] || { fecha: f, camiones: {} }), x = fleteDe(f, camId); delete d.id;
    d.fecha = f; d.camiones = d.camiones || {};
    d.camiones[camId] = { modo: (cambio.modo || x.modo) === 'kg' ? 'kg' : 'viaje', valor: cambio.valor === undefined ? x.valor : (cambio.valor === '' ? '' : +String(cambio.valor).replace(',', '.') || 0) };
    S.fletes = S.fletes || {}; S.fletes[f] = d;
    return store.set('privado', 'fletes-' + f, d);
  }
  // Costo del camión: con precio por viaje, el costo por kg sale de dividirlo por lo que lleva; con precio por kg, el viaje sale de multiplicar.
  function fleteTxt(f, cam, peds) {
    var fl = fleteDe(f, cam.id), v = +fl.valor || 0, suyos = peds.filter(function (p) { return p.camion === cam.id; }), kg = cargaDe(peds, cam.id);
    if (!v) return 'Poné el precio y se calcula el costo por kg llevado.';
    if (!kg) return fl.modo === 'kg' ? 'Todavía no lleva kilos para calcular el viaje.' : plata(v) + ' el viaje. Todavía no lleva kilos para calcular el costo por kg.';
    var falta = suyos.some(function (p) { return p.kgFalta; }), sobre = ' · sobre ≈ ' + n(kg) + ' kg' + (falta ? ' (hay renglones sin peso)' : '');
    return fl.modo === 'kg' ? '<strong>' + plata(v, true) + ' por kg llevado</strong> · viaje ≈ <strong>' + plata(v * kg) + '</strong>' + sobre
      : '<strong>' + plata(v / kg, true) + ' por kg llevado</strong> · viaje ' + plata(v) + sobre;
  }
  function fleteHTML(f, cam, peds) {
    var fl = fleteDe(f, cam.id), id = esc(cam.id);
    return '<div class="cam-flete"><span class="fl-tit">Costo del flete</span>'
      + '<select data-flete="' + id + '" data-k="modo" aria-label="Cómo se paga el flete de ' + esc(nomCam(cam)) + '"><option value="viaje"' + (fl.modo !== 'kg' ? ' selected' : '') + '>Precio por viaje</option><option value="kg"' + (fl.modo === 'kg' ? ' selected' : '') + '>Precio por kg</option></select>'
      + '<label class="precio"><span>$</span><input type="number" inputmode="decimal" step="any" min="0" data-flete="' + id + '" data-k="valor" value="' + esc(fl.valor === 0 ? 0 : fl.valor || '') + '" aria-label="Precio del flete de ' + esc(nomCam(cam)) + '"></label>'
      + '<span class="fl-res" data-flete-res="' + id + '">' + fleteTxt(f, cam, peds) + '</span></div>';
  }
  // Las medias del pedido se muestran como un corte más, arriba de la lista.
  function textoMedias(p) { return +p.medias ? n(+p.medias) + (+p.medias === 1 ? ' MEDIA' : ' MEDIAS') + (p.peso ? ' ' + String(p.peso).toUpperCase() : '') : ''; }
  function pedidoDe(id) { return (S.pedidos || []).filter(function (x) { return x.id === id; })[0] || null; }
  // Cortes del pedido con su clave. Los pedidos viejos no la tenían: se usa la posición.
  function cortesDe(p) { return (p.cortes || []).map(function (c, j) { if (!c.k) c.k = 'i' + j; return c; }); }
  // Las medias del pedido van solas a la planilla semanal, en el día de faena anterior a la entrega.
  /* Día de faena de las medias de un pedido: el día hábil anterior a la entrega, salvo que ya estén faenadas
     (en cámara) de otro día: p.faenaFija. Pasa cuando un cliente no pudo recibir y el pedido se corre de día. */
  function faenaDe(p) { return p.faenaFija && p.faenaFija < p.entrega ? p.faenaFija : habilAnterior(p.entrega); }
  function aplicarMedias(p) {
    var medias = +p.medias || 0, va = !!p.entrega && (medias > 0 || !(p.cortes || []).some(function (c) { return c.texto; }));
    var fa = va ? faenaDe(p) : null, lunes = fa ? lunesDe(fa) : null, i = fa ? Math.round((fecha(fa) - fecha(lunes)) / 86400000) : -1, cambios = {};
    (S.faena || []).forEach(function (s) {
      var fuera = s.dias.some(function (d, k) { return !(s.id === lunes && k === i) && d.clientes.some(function (r) { return r.pedido === p.id; }); });
      if (!fuera) return;
      var x = clone(semDe(s.id)); x.dias.forEach(function (d, k) { if (!(s.id === lunes && k === i)) d.clientes = d.clientes.filter(function (r) { return r.pedido !== p.id; }); });
      cambios[s.id] = x;
    });
    if (va) {
      var sem = cambios[lunes] || clone(semDe(lunes) || semanaNueva(lunes)), filas = sem.dias[i].clientes, nombre = norm(p.cliente);
      var fila = filas.filter(function (r) { return r.pedido === p.id; })[0] || filas.filter(function (r) { return !r.pedido && norm(r.cliente) === nombre; })[0]
        || filas.filter(function (r) { return !r.pedido && r.cliente && mismoCliente(r.cliente, p.cliente); })[0];   // ya cargado en la planilla con otro nombre: no se repite
      if (!fila) { fila = {}; filas.push(fila); }
      fila.cliente = String(p.cliente || '').toUpperCase().trim(); fila.cant = medias / 2; fila.pedido = p.id; fila.nota = p.peso || '';
      cambios[lunes] = sem;
    }
    return Promise.all(Object.keys(cambios).map(function (l) { var sl = limpiarSemana(cambios[l]); S.faena = poner(S.faena, l, sl); return store.set('faena', l, sl); }));
  }
  /* Una vez por sesión, al entrar un editor: en las semanas de ahora en adelante, si un cliente de la planilla
     quedó repetido con el renglón que vino de su pedido (mismo cliente y misma cantidad), se deja solo el del pedido. */
  var mediasConciliadas = false;
  function conciliarMedias() {
    if (mediasConciliadas || !S.editor || !S.faena || !S.pedidos) return;
    mediasConciliadas = true;
    var desde = lunesDe(hoy()), cambios = [];
    S.faena.forEach(function (sem) {
      if (sem.id < desde) return;
      var x = clone(sem), toco = false;
      x.dias.forEach(function (d) {
        var conPedido = d.clientes.filter(function (r) { return r.pedido && pedidoDe(r.pedido); });
        var antes = d.clientes.length;
        d.clientes = d.clientes.filter(function (r) {
          if (r.pedido || !r.cliente || !(+r.cant > 0)) return true;
          return !conPedido.some(function (l) { return +l.cant === +r.cant && mismoCliente(l.cliente, r.cliente); });
        });
        if (d.clientes.length !== antes) toco = true;
      });
      if (toco) { var id = x.id; delete x.id; var sl = limpiarSemana(x); S.faena = poner(S.faena, id, sl); cambios.push(store.set('faena', id, sl)); }
    });
    if (cambios.length) Promise.all(cambios).then(function () { renderDatos(); }, function () {});
  }
  // Al editar un pedido, los cortes que ya estaban en producción siguen estando, con el texto y la fecha nuevos.
  function revincularProduccion(p, previo) {
    var m = enProduccion(), estaban = {}, tocadas = {};
    cortesDe(previo).forEach(function (c) { if (fechaProdDe(m, previo, c)) estaban[c.k] = 1; });
    (S.prod || []).forEach(function (o) {
      if (!(o.cortes || []).some(function (c) { return c.lineas.some(function (l) { return l.p === p.id; }); })) return;
      var x = clone(o); quitarDeOrden(x, p.id); tocadas[o.id] = x;
    });
    (p.cortes || []).forEach(function (c) {
      if (!estaban[c.k] || !c.texto) return;
      var idp = idPara(p, c), x = tocadas[idp] || clone(prodGuardada(idp) || prodVacia(idp));
      insertarLinea(x, esC3(idp) ? corteC3(c) : c.corte, textoProd(p, c), p.id, c.k, c.frio || p.frio); tocadas[idp] = x;
    });
    return Promise.all(Object.keys(tocadas).map(function (f) { return guardarOrden(f, tocadas[f], true); }));
  }
  // Pasa un pedido a otro día: se mueven sus medias y sus cortes en producción, y sale del camión que tenía.
  function moverPedido(p, f) {
    if (!p || !f || f === p.entrega) return Promise.resolve();
    S.prop.forEach(function (x) { if (x.editaId === p.id) x.entrega = f; });
    var fa0 = faenaDe(p), ff = +p.medias > 0 && fa0 < hoy() && fa0 < f ? fa0 : (p.faenaFija || '');   // ya faenadas: quedan en la faena de ese día
    return guardarPropuesta({ editaId: p.id, faenaFija: ff, cliente: p.cliente, entrega: f, medias: p.medias, peso: p.peso, frio: p.frio, cuenta: p.cuenta || '', nota: p.nota, kg: p.kg, origen: p.origen, cortes: clone(cortesDe(p)) });
  }
  function diaCorto(f) { var x = String(f).split('-'); return diaDe(f) + ' ' + (+x[2]) + '/' + (+x[1]); }
  function opcionesDia(p) {
    var f = hoy(), ops = [];
    if (!esHabil(f)) f = habilSiguiente(f);
    while (ops.length < 8) { if (f !== p.entrega) ops.push(f); f = habilSiguiente(f); }
    return '<select class="mover" data-mover="' + esc(p.id) + '" aria-label="Cambiar de día el pedido de ' + esc(p.cliente) + '"><option value="">Cambiar de día…</option>'
      + ops.map(function (x) { return '<option value="' + x + '">' + esc(diaCorto(x)) + (x === hoy() ? ' (hoy)' : x === mas(hoy(), 1) ? ' (mañana)' : '') + '</option>'; }).join('')
      + '<option value="otra">Otra fecha…</option></select>';
  }
  function editarPedido(id, campo) {
    var pe = pedidoDe(id);
    if (pe && !S.prop.some(function (x) { return x.editaId === pe.id; })) S.prop.push({ k: uid(), editaId: pe.id, precioMedias: pe.precioMedias === 0 || pe.precioMedias ? pe.precioMedias : '', ivaMedias: pe.ivaMedias || '', cliente: pe.cliente || '', entrega: pe.entrega || '', medias: pe.medias || '', peso: pe.peso || '', frio: pe.frio || '', cuenta: pe.cuenta || '', nota: pe.nota || '', kg: pe.kg || '', origen: pe.origen || 'manual', dudas: (pe.dudas || []).slice(), cortes: clone(cortesDe(pe)).map(function (c) { c.texto = sinCliente(c.texto, pe.cliente); return c; }) });
    S.msg.fotos = ''; renderPedidos();
    var k = -1; S.prop.forEach(function (x, i) { if (x.editaId === id) k = i; });
    var fe = $('q' + k + (campo || 'cliente')); if (fe) { fe.focus(); if (fe.scrollIntoView) fe.scrollIntoView({ block: 'center' }); }
  }
  /* Duplicar (pedido de Renzo): arma un pedido nuevo igual (cliente, medias, cortes, precios, nota) en "Cargar pedidos",
     para cambiar lo que haga falta (día, cantidades, + Corte) antes de guardarlo. No queda en producción hasta sumarlo. */
  function duplicarPedido(id) {
    var pe = pedidoDe(id); if (!pe) return;
    S.prop.push({ k: uid(), precioMedias: pe.precioMedias === 0 || pe.precioMedias ? pe.precioMedias : '', ivaMedias: pe.ivaMedias || '', cliente: pe.cliente || '', entrega: pe.entrega || cargaDiaActual() || habilSiguiente(hoy()), medias: pe.medias || '', peso: pe.peso || '', frio: pe.frio || '', cuenta: pe.cuenta || '', nota: pe.nota || '', kg: pe.kg || '', origen: 'manual', dudas: [], cortes: clone(cortesDe(pe)).map(function (c, j) { c.texto = sinCliente(c.texto, pe.cliente); c.k = 'i' + j; return c; }) });
    S.msg.fotos = ''; if (S.tab !== 'pedidos' && !S.solo) irA('pedidos'); else renderPedidos();
    var k = S.prop.length - 1, fe = $('q' + k + 'cliente');
    if (fe) { if (fe.scrollIntoView) fe.scrollIntoView({ block: 'center' }); fe.focus(); }
    avisar('Copia lista arriba, en Cargar pedidos: cambiá lo que necesites (día, cantidades, + Corte) y tocá "Guardar pedido".', 7000);
  }
  // El pedido como texto, para pegarlo en WhatsApp o en "Pegar texto".
  function pedidoTexto(pe) {
    var l = [String(pe.cliente || '').toUpperCase() + (cuentaPedido(pe) ? ' (N° ' + cuentaPedido(pe) + ')' : '')];
    if (pe.frio) l.push(pe.frio);
    if (+pe.medias) l.push(textoMedias(pe));
    cortesDe(pe).forEach(function (c) { var t = String(sinCliente(c.texto, pe.cliente) || '').toUpperCase().trim(); if (!t) return; l.push(norm(t).indexOf(norm(c.corte)) >= 0 ? t : c.corte + ': ' + t); });
    if (pe.nota) l.push('Nota: ' + pe.nota);
    return l.join('\n');
  }
  function copiarPedido(id) {
    var pe = pedidoDe(id); if (!pe) return;
    var t = pedidoTexto(pe), ok = function () { if (window.__mock) window.__mock.copiado = t; avisar('Pedido copiado. Pegalo en WhatsApp o en "Pegar texto".', 5000); };
    try { if (window.__mock) return ok(); navigator.clipboard.writeText(t).then(ok, function () { window.prompt('Copiá el pedido:', t); }); } catch (e) { window.prompt('Copiá el pedido:', t); }
  }
  function borrarPedido(p) { return borrarPedidos([p]); }
  /* Papelera: antes de borrar pedidos se guarda una copia (los pedidos y sus renglones en producción) en privado/papelera,
     para poder recuperarlos con "Deshacer" o desde "Borrados recientes". Quedan los últimos 15 borrados. */
  function papelera() { return (S.papelera || []).slice(); }
  function guardarEnPapelera(lista) {
    if (!lista.length) return Promise.resolve(null);
    var ids = {}; lista.forEach(function (p) { ids[p.id] = 1; });
    var lineas = [];
    (S.prod || []).forEach(function (o) { (o.cortes || []).forEach(function (c) { (c.lineas || []).forEach(function (l) { if (l.p && ids[l.p]) lineas.push({ o: o.id, corte: c.corte, t: l.t, p: l.p, ck: l.ck || '', f: l.f || '' }); }); }); });
    var item = { id: 'b' + uid(), cuando: ahoraTxt(), pedidos: lista.map(function (p) { var d = clone(p); var id = d.id; delete d.id; return { id: id, doc: d }; }), lineas: lineas };
    var l = [item].concat(papelera()).slice(0, 15);
    S.papelera = l; S.deshacer = item.id;
    return store.set('privado', 'papelera', { items: l, actualizado: ahoraTxt() }).then(function () { return item; }, function () { return item; });
  }
  function recuperar(bid) {
    var item = papelera().filter(function (x) { return x.id === bid; })[0];
    if (!item) return Promise.reject(new Error('Ya no está en la papelera.'));
    var hay = {}; (S.pedidos || []).forEach(function (p) { hay[p.id] = 1; });
    var vuelven = item.pedidos.filter(function (x) { return !hay[x.id]; }), fechas = {}, tareas = [];
    vuelven.forEach(function (x) { S.pedidos = poner(S.pedidos, x.id, x.doc); if (x.doc.entrega) fechas[x.doc.entrega] = 1; });
    return Promise.all(vuelven.map(function (x) { return store.set('pedidos', x.id, x.doc); }))
      .then(function () { return vuelven.reduce(function (cad, x) { return cad.then(function () { var p = clone(x.doc); p.id = x.id; return aplicarMedias(p); }); }, Promise.resolve()); })
      .then(function () {
        var docs = {}, vuelve = {}; vuelven.forEach(function (x) { vuelve[x.id] = 1; });
        item.lineas.forEach(function (l) {
          if (!vuelve[l.p]) return;
          var o = docs[l.o] || (docs[l.o] = clone(prodGuardada(l.o) || prodVacia(l.o)));
          var ya = (o.cortes || []).some(function (c) { return c.lineas.some(function (y) { return y.p === l.p && (y.ck || '') === l.ck; }); });
          if (!ya) insertarLinea(o, l.corte, l.t, l.p, l.ck, l.f);
        });
        Object.keys(docs).forEach(function (id) { tareas.push(guardarOrden(id, docs[id])); });
        Object.keys(fechas).forEach(function (f) { tareas.push(publicarLog(f)); });
        return Promise.all(tareas);
      })
      .then(function () {
        S.papelera = papelera().filter(function (x) { return x.id !== bid; }); if (S.deshacer === bid) S.deshacer = null;
        return store.set('privado', 'papelera', { items: S.papelera, actualizado: ahoraTxt() });
      })
      .then(function () { tocar(); return vuelven.length; });
  }
  function nombresPapelera(it) { var ns = it.pedidos.map(function (x) { return x.doc.cliente || 'Sin cliente'; }); return ns.slice(0, 6).join(', ') + (ns.length > 6 ? ' y ' + (ns.length - 6) + ' más' : ''); }
  function deshacerHTML() {
    var it = S.deshacer && papelera().filter(function (x) { return x.id === S.deshacer; })[0];
    if (!it) return '';
    var k = it.pedidos.length;
    return '<div class="deshacer"><span>Se ' + (k === 1 ? 'borró 1 pedido' : 'borraron ' + k + ' pedidos') + ': <b>' + esc(nombresPapelera(it)) + '</b></span><button class="btn pri" data-act="pap-recuperar" data-id="' + esc(it.id) + '">↩ Deshacer</button><button class="btn lnk" data-act="pap-cerrar">Cerrar</button></div>';
  }
  function papeleraHTML() {
    var l = papelera();
    if (!l.length) return '';
    return '<div class="panel"><details' + (S._pap ? ' open' : '') + ' id="pap-det"><summary>Borrados recientes (' + l.length + ')</summary><p class="small muted">Lo que se borró por error se puede recuperar acá: vuelve el pedido con sus medias y sus cortes en producción.</p><ul class="pap">'
      + l.map(function (it) {
        var k = it.pedidos.length, dias = {}; it.pedidos.forEach(function (x) { if (x.doc.entrega) dias[diaCorto(x.doc.entrega)] = 1; });
        return '<li><div><b>' + (k === 1 ? '1 pedido' : k + ' pedidos') + '</b> · ' + esc(Object.keys(dias).join(', ')) + ' <span class="small muted">· borrado ' + esc(it.cuando || '') + '</span><br><span class="small">' + esc(nombresPapelera(it)) + '</span></div><button class="btn sm" data-act="pap-recuperar" data-id="' + esc(it.id) + '">Recuperar</button></li>';
      }).join('') + '</ul></details></div>';
  }
  function borrarPedidos(lista) {
    var copia = lista.slice();
    return guardarEnPapelera(copia).then(function () { return borrarPedidosYa(copia); });
  }
  function borrarPedidosYa(lista) {
    var ids = {}, fechas = {}, tareas = [];
    lista.forEach(function (p) { ids[p.id] = 1; if (p.entrega) fechas[p.entrega] = 1; });
    (S.faena || []).slice().forEach(function (s) {
      if (!s.dias.some(function (d) { return d.clientes.some(function (r) { return r.pedido && ids[r.pedido]; }); })) return;
      var x = clone(s); x.dias.forEach(function (d) { d.clientes = d.clientes.filter(function (r) { return !(r.pedido && ids[r.pedido]); }); });
      var xl = limpiarSemana(x); S.faena = poner(S.faena, s.id, xl); tareas.push(store.set('faena', s.id, xl));
    });
    (S.prod || []).slice().forEach(function (o) {
      var usados = {}; (o.cortes || []).forEach(function (c) { c.lineas.forEach(function (l) { if (l.p && ids[l.p]) usados[l.p] = 1; }); });
      if (!Object.keys(usados).length) return;
      var x = clone(o); Object.keys(usados).forEach(function (id) { quitarDeOrden(x, id); });
      tareas.push(guardarOrden(o.id, x, true));
    });
    lista.forEach(function (p) { tareas.push(store.del('pedidos', p.id)); delete S.sel[p.id]; delete S.abierto[p.id]; });
    S.pedidos = (S.pedidos || []).filter(function (x) { return !ids[x.id]; });
    Object.keys(fechas).forEach(function (f) { tareas.push(publicarLog(f)); });
    return Promise.all(tareas);
  }

  /* ---------- logística ----------
     Los pedidos son privados; lo que ven todos es una copia por día de entrega, con los camiones
     y lo que lleva cada uno. Se vuelve a escribir cada vez que cambia un pedido o un camión de ese día. */
  // Kilos: lo que pesa cada pedido se estima para ir descontando de la capacidad del camión.
  function kgMedia() { return +S.config.kgMedia || 47; }
  function kgCaja() { return +S.config.kgCaja || 20; }
  function numero(x) { x = String(x); return /^\d{1,3}(\.\d{3})+$/.test(x) ? +x.replace(/\./g, '') : +x.replace(',', '.') || 0; }
  function kgDeTexto(t, corte) {
    var s = norm(enKg(t, corte)), m = s.match(/^([\d.,]+)\s*(KGS?|KILOS?|K)\b/);
    if (m) return { kg: numero(m[1]) };
    m = s.match(/^([\d.,]+)\s*(CAJAS?|CJS?)\b/);
    if (m) return { kg: numero(m[1]) * kgCaja() };
    return { kg: 0, falta: true };
  }
  // Si el pedido tiene kilos cargados a mano, valen esos. Si no: medias y cajas por su peso habitual, más lo que viene en kg.
  function kgPedido(p) {
    if (+p.kg > 0) return { kg: +p.kg, manual: true };
    var kg = (+p.medias || 0) * kgMedia(), falta = false;
    (p.cortes || []).forEach(function (c) { if (!c.texto) return; var r = kgDeTexto(c.texto, c.corte); kg += r.kg; if (r.falta) falta = true; });
    return { kg: Math.round(kg), falta: falta };
  }
  function kgTxt(k) { return (k.manual ? '' : '≈ ') + n(k.kg) + ' kg' + (k.falta ? ' + renglones sin peso' : ''); }
  function flota() { return (S.config.flota || []).filter(function (c) { return c && c.id; }); }
  function cargaDe(peds, camId) { return peds.filter(function (p) { return p.camion === camId; }).reduce(function (t, p) { return t + (+p.kg || 0); }, 0); }
  // Texto de capacidad de un camión: cargado, capacidad y lo que queda.
  function capTxt(cam, cargado) {
    if (!(+cam.kg > 0)) return cargado ? '≈ ' + n(cargado) + ' kg cargados' : '';
    var libre = +cam.kg - cargado;
    return '≈ ' + n(cargado) + ' de ' + n(+cam.kg) + ' kg · ' + (libre >= 0 ? 'quedan ' + n(libre) + ' kg' : 'se pasa por ' + n(-libre) + ' kg');
  }
  function logDe(f) { return (S.log || {})[f] || (S.logHist || {})[f] || null; }
  function camionesDe(f) { var l = logDe(f); return (l && l.camiones) || []; }
  // El número de camión lo pone Renzo (no se numera solo); sin nombre, el camión se llama por su número.
  // El nombre se muestra tal cual lo puso Renzo, sin la palabra "Camión" adelante.
  function nomLimpio(x) { var s = String(x || '').trim(), r = s.replace(/^cami[oó]n\b[\s:.\-]*/i, '').trim(); return /[A-ZÁÉÍÓÚÑ]/i.test(r) ? r : s; }
  function nomCam(c) { if (!c) return ''; var nm = nomLimpio(c.nombre), nu = nomLimpio(c.num); return nm || (nu ? (/[A-ZÁÉÍÓÚÑ]/i.test(nu) ? nu : 'N° ' + nu) : 'Sin nombre'); }
  // Si la hora de salida quedó escrita en la nota del camión ("02:00HS", "6:30 hs") y no en su lugar, se pasa a la hora.
  function horaDeNota(c) {
    if (!c || String(c.hora || '').trim()) return c;
    var m = String(c.nota || '').trim().match(/^(\d{1,2})\s*[:.]\s*(\d{2})\s*(?:H|HS|HRS|HORAS)?\.?$/i);
    if (m && +m[1] < 24 && +m[2] < 60) { c.hora = (m[1].length < 2 ? '0' : '') + m[1] + ':' + m[2]; c.nota = ''; }
    return c;
  }
  function nombreCamion(f, id) { var c = camionesDe(f).filter(function (x) { return x.id === id; })[0]; return c ? nomCam(c) : ''; }
  function publicarLog(f, camiones) {
    if (!f) return Promise.resolve();
    var cams = (camiones || camionesDe(f)).map(function (c) { c = horaDeNota(clone(c)); return { id: c.id, nombre: nomLimpio(c.nombre), num: String(c.num || '').trim(), hora: String(c.hora || '').trim(), nota: c.nota || '', kg: +c.kg || 0, orden: (c.orden || []).slice() }; }), hay = {};
    cams.forEach(function (c) { hay[c.id] = c; });
    var peds = (S.pedidos || []).filter(function (p) { return p.entrega === f; }).map(function (p) {
      var k = kgPedido(p);
      return { id: p.id, cliente: p.cliente || '', cuenta: cuentaPedido(p), medias: +p.medias || 0, peso: p.peso || '', frio: p.frio || '', nota: p.nota || '', camion: p.camion && hay[p.camion] ? p.camion : '', kg: k.kg, kgFalta: !!k.falta, kgManual: !!k.manual,
        precioMedias: p.precioMedias === 0 || p.precioMedias ? +p.precioMedias : '', ivaMedias: p.ivaMedias || '',
        cortes: (p.cortes || []).filter(function (c) { return c.texto; }).map(function (c) { return { k: c.k, corte: c.corte, texto: sinCliente(c.texto, p.cliente), precio: c.precio === 0 || c.precio ? +c.precio : '', iva: c.iva || '' }; }) };
    });
    // Dentro de cada camión, los pedidos van en el orden que se les dio; los nuevos, al final.
    var lugar = function (x) { var o = x.camion ? hay[x.camion].orden : [], i = o.indexOf(x.id); return i < 0 ? 1e6 : i; };
    peds = peds.map(function (x, i) { return [x, i]; }).sort(function (a, b) { return lugar(a[0]) - lugar(b[0]) || a[1] - b[1]; }).map(function (x) { return x[0]; });
    cams.forEach(function (c) { c.orden = peds.filter(function (x) { return x.camion === c.id; }).map(function (x) { return x.id; }); });
    S.log = S.log || {};
    if (!peds.length && !cams.length) { if (!S.log[f]) return Promise.resolve(); delete S.log[f]; return store.del('config', 'log-' + f); }
    var doc = { fecha: f, camiones: cams, pedidos: peds, actualizado: ahoraTxt() };
    S.log[f] = clone(doc); S.log[f].id = 'log-' + f;
    return store.set('config', 'log-' + f, doc);
  }
  function firmaPrecios(pm, im, cs) { var v = function (x) { return x === 0 || x ? +x : ''; }; return [v(pm), im || ''].concat(cs.map(function (c) { return v(c.precio) + '/' + (c.iva || ''); })).join('|'); }
  // Precio para Logística: "$ 1.234 / kg + IVA" (o "final").
  // IVA: la carne 10,5 %; los embutidos (chorizo, morcilla, salchicha, también E.V.) 21 %. Con un precio y si es "+ IVA" o "final" se saca el otro.
  var IVA = 1.105, IVA_EMB = 1.21;
  function tasaIva(c) { return c && esEmbutido(c) ? IVA_EMB : IVA; }
  function pesos(v) { return '$ ' + new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Math.round(+v * 100) / 100); }
  function preciosDe(v, iva, tasa) {
    if (!(v === 0 || v)) return null;
    tasa = tasa || IVA;
    if (iva === 'iva') return { sin: +v, fin: +v * tasa };
    if (iva === 'final') return { sin: +v / tasa, fin: +v };
    return { solo: +v };
  }
  function precioTxt(v, iva, tasa) {
    var x = preciosDe(v, iva, tasa); if (!x) return '';
    return x.solo != null ? pesos(x.solo) + ' / kg' : pesos(x.sin) + ' + IVA · ' + pesos(x.fin) + ' final';
  }
  // En Logística (solo editores): dos casilleros, sin IVA y final; se escribe uno y el otro se calcula solo.
  function precioLogHTML(id, k, v, iva, que, tasa) {
    tasa = tasa || IVA;
    var x = preciosDe(v, iva, tasa) || {}, r = function (n) { return n == null ? '' : String(Math.round(n * 100) / 100); };
    var sin = x.solo != null ? r(x.solo) : r(x.sin), fin = x.solo != null ? '' : r(x.fin);
    var inp = function (cual, val, txt) { return '<label class="lp-pre"><span>' + txt + '</span><input type="number" inputmode="decimal" step="any" min="0" placeholder="' + (cual === 'iva' ? 'sin IVA' : 'final') + '" data-plog="' + esc(id) + '" data-k="' + esc(k) + '" data-cual="' + cual + '" data-tasa="' + tasa + '" value="' + esc(val) + '" aria-label="Precio por kilo ' + txt + ' de ' + esc(que) + '"></label>'; };
    return '<span class="log-pre-ed">' + inp('iva', sin, '$/kg sin IVA') + inp('final', fin, '$/kg final' + (tasa === IVA_EMB ? ' (IVA 21%)' : '')) + '</span>';
  }
  // Si lo publicado no coincide con los pedidos (por ejemplo, pedidos cargados antes de que existiera Logística), se vuelve a publicar.
  function conciliarLog() {
    if (!S.editor || !S.pedidos || !S.logListo) return;
    var desde = habilAnterior(hoy()), porFecha = {};
    S.pedidos.forEach(function (p) { if (p.entrega && p.entrega >= desde) (porFecha[p.entrega] = porFecha[p.entrega] || []).push(p.id); });
    Object.keys(S.log || {}).forEach(function (f) { if (f >= desde && !porFecha[f]) porFecha[f] = []; });
    Object.keys(porFecha).forEach(function (f) {
      var lg = logDe(f), kgDe = {}; S.pedidos.forEach(function (p) { if (p.entrega === f) kgDe[p.id] = kgPedido(p).kg; });
      var a = porFecha[f].map(function (id) { var pp = pedidoDe(id) || {}; return id + ':' + kgDe[id] + ':' + (pp.frio || '') + ':' + cuentaPedido(pp) + ':' + firmaPrecios(pp.precioMedias, pp.ivaMedias, (pp.cortes || []).filter(function (c) { return c.texto; })); }).sort().join(','), b = ((lg && lg.pedidos) || []).map(function (x) { return x.id + ':' + (+x.kg || 0) + ':' + (x.frio || '') + ':' + (x.cuenta || '') + ':' + firmaPrecios(x.precioMedias, x.ivaMedias, x.cortes || []); }).sort().join(',');
      // Freno: si otra pantalla abierta (por ejemplo, un celular con una versión vieja) calcula distinto, cada una
      // republicaba lo suyo apenas llegaba lo de la otra, sin parar, y la página se colgaba. Ahora, una vez cada 30 s como mucho.
      if (a !== b) { var ya = (S._pubLog = S._pubLog || {})[f], t0 = Date.now(); if (ya && t0 - ya < 30000) return; S._pubLog[f] = t0; publicarLog(f).then(null, function () {}); }
    });
  }
  function avisoCamion(f, camId, cuantos) {
    var cam = camionesDe(f).filter(function (c) { return c.id === camId; })[0], lg = logDe(f), t = cam ? capTxt(cam, cargaDe((lg && lg.pedidos) || [], camId)) : '';
    return cuantos + (cuantos === 1 ? ' pedido' : ' pedidos') + ' en "' + nomCam(cam) + '".' + (t ? ' ' + t.charAt(0).toUpperCase() + t.slice(1) + '.' : '');
  }
  // Pone (o saca, con cam vacío) un grupo de pedidos en un camión de ese día.
  function asignarCamion(f, ids, cam, camiones) {
    var tareas = [];
    ids.forEach(function (id) {
      var p = pedidoDe(id); if (!p || (p.camion || '') === (cam || '')) return;
      var doc = clone(p); delete doc.id; doc.camion = cam || '';
      S.pedidos = poner(S.pedidos, id, doc); tareas.push(store.set('pedidos', id, doc));
    });
    // Los que entran al camión quedan al final de su orden, en el orden en que se tildaron (después se pueden reacomodar).
    var cams = cam ? clone(camiones || camionesDe(f)).map(function (c) { if (c.id === cam) c.orden = (c.orden || []).filter(function (x) { return ids.indexOf(x) < 0; }).concat(ids); return c; }) : camiones;
    return Promise.all(tareas).then(function () { return publicarLog(f, cams); }).then(tocar);
  }
  // Los tildados de un día, en el orden en que se fueron tildando.
  function tildadosDe(f) { return Object.keys(S.sel || {}).filter(function (id) { var p = pedidoDe(id); return S.sel[id] && p && p.entrega === f; }); }
  function crearCamion(f, nombre, nota, ids, kg, idFijo, num) {
    var cams = camionesDe(f).slice(), cam = { id: idFijo || 'c' + uid(), nombre: String(nombre || '').trim(), num: String(num || '').trim(), nota: String(nota || '').trim(), kg: +kg || 0 };
    cams.push(cam);
    return asignarCamion(f, ids || [], cam.id, cams).then(function () { return cam; });
  }
  // Usa ese día un camión del stock: si todavía no estaba en el día, lo agrega con su capacidad.
  function usarDeFlota(f, idFlota, ids) {
    var idDia = 'f' + idFlota, ya = camionesDe(f).filter(function (c) { return c.id === idDia; })[0], fl = flota().filter(function (c) { return c.id === idFlota; })[0];
    if (ya) return asignarCamion(f, ids, idDia).then(function () { return ya; });
    if (!fl) return Promise.reject(new Error('Ese camión ya no está en el stock.'));
    return crearCamion(f, fl.nombre, fl.nota, ids, fl.kg, idDia);
  }
  function cambiarCamion(f, id, nombre, nota, kg, num, hora) {
    var antes = (camionesDe(f).filter(function (c) { return c.id === id; })[0] || {}).hora || '';
    var cams = camionesDe(f).map(function (c) { return c.id === id ? { id: id, nombre: String(nombre || '').trim(), num: String(num == null ? c.num || '' : num).trim(), hora: String(hora == null ? c.hora || '' : hora).trim(), nota: String(nota || '').trim(), kg: +kg || 0, orden: c.orden || [] } : c; });
    if (hora != null && String(hora).trim() !== antes) cams = porHorario(cams);
    return publicarLog(f, cams).then(tocar);
  }
  // Los camiones se ordenan por hora de salida; los que no tienen hora quedan al final, en el orden que tenían.
  function porHorario(cams) {
    return cams.map(function (c, i) { return [c, i]; }).sort(function (a, b) {
      var ha = a[0].hora || '', hb = b[0].hora || '';
      if (ha && hb && ha !== hb) return ha < hb ? -1 : 1;
      if (!!ha !== !!hb) return ha ? -1 : 1;
      return a[1] - b[1];
    }).map(function (x) { return x[0]; });
  }
  // Cambia de lugar un camión en la lista del día (el orden en que se muestran e imprimen).
  function moverCamion(f, id, dir) {
    var cams = clone(camionesDe(f)), i = cams.map(function (c) { return c.id; }).indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= cams.length) return Promise.resolve();
    cams.splice(j, 0, cams.splice(i, 1)[0]);
    return publicarLog(f, cams).then(tocar);
  }
  var tFlota = null;
  function guardarConfig(ya) {
    S.msg.flota = 'Guardando…'; pintarMsg('flota'); clearTimeout(tFlota);
    tFlota = setTimeout(function () {
      var c = clone(S.config || {}); delete c.id; c.actualizado = ahoraTxt();
      store.set('config', 'general', c).then(function () { S.msg.flota = 'Guardado ' + ahoraTxt().split(', ')[1]; pintarMsg('flota'); }, function () { S.msg.flota = '!No se pudo guardar. Revisá la conexión.'; pintarMsg('flota'); });
    }, ya ? 0 : 700);
  }
  // Sube o baja un pedido dentro de su camión.
  // Lleva un pedido a un lugar del camión (0 = primero).
  // Lo que quedó después de arrastrar en Pedidos: cada grupo con su camión ('' = sin camión) y sus pedidos en orden de bajada.
  function reordenarPedidos(f, grupos) {
    var cams = clone(camionesDe(f)), tareas = [];
    grupos.forEach(function (g) {
      g.ids.forEach(function (id) {
        var p = pedidoDe(id); if (!p || (p.camion || '') === g.cam) return;
        var doc = clone(p); delete doc.id; doc.camion = g.cam; S.pedidos = poner(S.pedidos, id, doc); tareas.push(store.set('pedidos', id, doc));
      });
      var c = g.cam && cams.filter(function (x) { return x.id === g.cam; })[0]; if (c) c.orden = g.ids.slice();
    });
    return Promise.all(tareas).then(function () { return publicarLog(f, cams); }).then(tocar);
  }
  function moverEnCamionA(f, camId, pedId, j) {
    var lg = logDe(f), cams = clone(camionesDe(f)), cam = cams.filter(function (c) { return c.id === camId; })[0];
    if (!lg || !cam) return Promise.resolve();
    var ids = (lg.pedidos || []).filter(function (x) { return x.camion === camId; }).map(function (x) { return x.id; }), i = ids.indexOf(pedId);
    if (i < 0 || j < 0 || j >= ids.length || i === j) return Promise.resolve();
    ids.splice(j, 0, ids.splice(i, 1)[0]); cam.orden = ids;
    return publicarLog(f, cams).then(tocar);
  }
  // Hora de salida puesta desde el Resumen del día: no reordena, el orden lo deja quien arma el resumen.
  function ponerHora(f, id, hora) {
    var cams = camionesDe(f).map(function (c) { if (c.id !== id) return c; var x = clone(c); x.hora = String(hora || '').trim(); return x; });
    return publicarLog(f, cams).then(tocar);
  }
  // Deja los camiones del día en el orden dado (lista de ids), por ejemplo después de arrastrarlos.
  function ordenarCamiones(f, ids) {
    var cams = clone(camionesDe(f)), lugar = function (c) { var i = ids.indexOf(c.id); return i < 0 ? 1e6 : i; };
    var nuevo = cams.map(function (c, i) { return [c, i]; }).sort(function (a, b) { return lugar(a[0]) - lugar(b[0]) || a[1] - b[1]; }).map(function (x) { return x[0]; });
    if (nuevo.map(function (c) { return c.id; }).join() === cams.map(function (c) { return c.id; }).join()) return Promise.resolve();
    return publicarLog(f, nuevo).then(tocar);
  }
  function moverCamionA(f, id, j) {
    var cams = clone(camionesDe(f)), i = cams.map(function (c) { return c.id; }).indexOf(id);
    if (i < 0 || j < 0 || j >= cams.length || i === j) return Promise.resolve();
    cams.splice(j, 0, cams.splice(i, 1)[0]);
    return publicarLog(f, cams).then(tocar);
  }
  // Selector de posición: se elige el número y el pedido (o camión) pasa directo a ese lugar.
  function posSelHTML(attr, pos, total, etiqueta, flechas) {
    var o = ''; for (var i = 0; i < total; i++) o += '<option value="' + i + '"' + (i === pos ? ' selected' : '') + '>' + (i + 1) + '</option>';
    var sel = '<select class="pos-sel" ' + attr + ' aria-label="' + esc(etiqueta) + '">' + o + '</select><span class="log-pos solo-print">' + (pos + 1) + '</span>';
    if (!flechas) return sel;
    return '<span class="pos-ctl"><button class="btn sm ord" data-act="' + flechas.act + '-subir" ' + flechas.attr + (pos === 0 ? ' disabled' : '') + ' aria-label="Subir un lugar">↑</button>' + sel
      + '<button class="btn sm ord" data-act="' + flechas.act + '-bajar" ' + flechas.attr + (pos === total - 1 ? ' disabled' : '') + ' aria-label="Bajar un lugar">↓</button></span>';
  }
  function moverEnCamion(f, camId, pedId, dir) {
    var lg = logDe(f), cams = clone(camionesDe(f)), cam = cams.filter(function (c) { return c.id === camId; })[0];
    if (!lg || !cam) return Promise.resolve();
    var ids = (lg.pedidos || []).filter(function (x) { return x.camion === camId; }).map(function (x) { return x.id; }), i = ids.indexOf(pedId), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return Promise.resolve();
    ids.splice(j, 0, ids.splice(i, 1)[0]); cam.orden = ids;
    return publicarLog(f, cams).then(tocar);
  }
  function borrarCamion(f, id) {
    var cams = camionesDe(f).filter(function (c) { return c.id !== id; });
    var ids = (S.pedidos || []).filter(function (p) { return p.entrega === f && p.camion === id; }).map(function (p) { return p.id; });
    return asignarCamion(f, ids, '', cams);
  }
  function semanaLeida(dias) {
    var votos = {}, lunes = null, max = 0;
    dias.forEach(function (d) { if (/^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '') && esHabil(d.fecha)) { var l = lunesDe(d.fecha); votos[l] = (votos[l] || 0) + 1; if (votos[l] > max) { max = votos[l]; lunes = l; } } });
    return lunes;
  }
  function semanaActual() { return lunesDe(esHabil(hoy()) ? hoy() : habilSiguiente(hoy())); }
  // La planilla que se sube reemplaza a la que había en esa semana: faena y clientes de los cinco días.
  // Solo quedan el stock inicial y las medias que vienen de pedidos cargados en la app.
  function aplicarPlanilla(dias, elegida) {
    var DN = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'], leida = semanaLeida(dias);
    var lunes = elegida || leida || S.sem || semanaActual();
    var sem = clone(semDe(lunes) || semanaNueva(lunes)), nd = 0, nc = 0, nuevo = {};
    dias.forEach(function (d) {
      var i = DN.indexOf(norm(d.dia));
      if (i < 0 && leida && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '')) i = Math.round((fecha(d.fecha) - fecha(leida)) / 86400000);
      if (i < 0 || i > 4) return;
      var fa = (d.faena || []).filter(function (r) { return r.origen || +r.propios || +r.usuarios; }).map(function (r) { return { origen: String(r.origen || '').toUpperCase().trim(), propios: +r.propios || 0, usuarios: +r.usuarios || 0 }; });
      var cl = (d.clientes || []).filter(function (r) { return r.cliente || +r.cerdos; }).map(function (r) { return { cliente: String(r.cliente || '').toUpperCase().replace(/\s+/g, ' ').trim(), cant: +r.cerdos || 0 }; });
      if (!fa.length && !cl.length) return;
      nuevo[i] = { fa: fa, cl: cl }; nd++;
    });
    if (!nd) return Promise.resolve(null);
    sem.dias.forEach(function (dia, i) {
      var x = nuevo[i] || { fa: [], cl: [] }, cl = x.cl;
      (dia.clientes || []).filter(function (v) { return v.pedido; }).forEach(function (v) {
        var m = cl.filter(function (y) { return !y.pedido && y.cliente && norm(y.cliente) === norm(v.cliente); })[0];
        if (m) { m.pedido = v.pedido; if (v.nota) m.nota = v.nota; } else cl.push(v);
      });
      dia.faena = x.fa.length ? x.fa : [{ origen: '', propios: 0, usuarios: 0 }];
      dia.clientes = cl; nc += cl.length;
    });
    var sl = limpiarSemana(sem); S.em = null; S.faena = poner(S.faena, lunes, sl);
    return store.set('faena', lunes, sl).then(function () { tocar(); return { lunes: lunes, dias: nd, clientes: nc }; });
  }
  function precioNum(v) { if (v === 0) return 0; var t = String(v == null ? '' : v).trim(); if (!t) return ''; var x = numero(t.replace(/[$\s]/g, '')); return x > 0 ? x : ''; }
  /* Pedidos vacíos (pedido de Renzo): sin medias y sin ningún corte con cantidad (vacío o todo en 0) no se toman:
     no se guardan, no se muestran y no van a Logística ni a Producción. */
  function corteVacio(c) { var t = String((c && c.texto) || '').trim(); if (!t) return true; var ns = t.match(/\d+(?:[.,]\d+)?/g); return !!ns && ns.every(function (x) { return +x.replace(',', '.') === 0; }) && !/½/.test(t); }
  function pedidoVacio2(p) { return !(+p.medias > 0) && !(p.cortes || []).some(function (c) { return !corteVacio(c); }); }
  function guardarPropuesta(q, auto) {
    var previo = q.editaId ? pedidoDe(q.editaId) : null, entrega = q.entrega || '';
    var p = { cliente: String(q.cliente || '').toUpperCase().trim(), entrega: entrega, medias: +q.medias || 0, peso: q.peso || '', frio: frioDe(q.frio), cuenta: String(q.cuenta || '').trim(), nota: q.nota || '', origen: q.origen || 'manual',
      creado: previo && previo.creado ? previo.creado : ahoraTxt(), alta: previo ? (previo.alta || '') : Date.now(), kg: +q.kg > 0 ? +q.kg : '',
      camion: previo && previo.entrega === entrega ? (previo.camion || '') : '',
      cortes: (q.cortes || []).filter(function (c) { return c.texto; }).map(function (c) { return { k: c.k || uid(), corte: norm(c.corte), texto: sinCliente(String(c.texto).toUpperCase().replace(/\s+/g, ' ').trim(), q.cliente), orden: c.orden !== false, precio: precioNum(c.precio), iva: precioNum(c.precio) === '' ? '' : (c.iva || ''), frio: frioDe(c.frio) }; }).filter(function (c) { return c.texto; }) };
    var ff = 'faenaFija' in q ? q.faenaFija : previo && previo.faenaFija; if (ff && +p.medias > 0 && ff < p.entrega) p.faenaFija = ff;
    if ('precioMedias' in q) { p.precioMedias = precioNum(q.precioMedias); p.ivaMedias = p.precioMedias === '' ? '' : (q.ivaMedias || ''); }
    else { if (previo && (previo.precioMedias === 0 || previo.precioMedias)) p.precioMedias = previo.precioMedias; if (previo && previo.ivaMedias) p.ivaMedias = previo.ivaMedias; }
    var vd = q.vendedor || (previo && previo.vendedor); if (vd) { p.vendedor = vd; p.vendedorNombre = q.vendedorNombre || (previo && previo.vendedorNombre) || ''; }
    if (!p.cliente) return Promise.reject(new Error('Falta el cliente.'));
    if (!p.entrega) return Promise.reject(new Error('Falta la fecha de entrega.'));
    if (pedidoVacio2(p)) return Promise.reject(new Error('El pedido está vacío: no tiene medias ni cortes con cantidad. Cargale algo o tocá ' + (previo ? 'Cancelar y después Quitar' : 'Descartar') + '.'));
    if (!auto) { asentarEdicion(); S.em = null; S.ep = null; }
    var id = previo ? previo.id : q.nuevoId || 'p' + uid(), doc = clone(p), antes = previo ? clone(previo) : null; p.id = id;
    S.pedidos = poner(S.pedidos, id, doc);
    return store.set('pedidos', id, doc)
      .then(function () { return aplicarMedias(p); })
      .then(function () { return antes ? revincularProduccion(p, antes) : null; })
      .then(function () { return Promise.all((antes && antes.entrega !== p.entrega ? [antes.entrega, p.entrega] : [p.entrega]).map(function (f) { return publicarLog(f); })); })
      .then(function () {
        // Si en el pedido se escribió un número que la base no tenía, queda aprendido para ese cliente.
        return p.cuenta && cuentaDe(p.cliente) !== p.cuenta ? fijarCuenta(p.cliente, p.cuenta).then(null, function () {}) : null;
      })
      .then(function () { tocar(); });
  }

  /* lectura de fotos con IA */
  function achicar(file) {
    return new Promise(function (ok, no) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1800, k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.88).split(',')[1]);
      };
      img.onerror = function () { URL.revokeObjectURL(url); no(new Error('No se pudo abrir la imagen.')); };
      img.src = url;
    });
  }
  function instrucciones() {
    var clientes = {}, ejemplos = [];
    (S.faena || []).forEach(function (s) { s.dias.forEach(function (d) { d.clientes.forEach(function (r) { if (r.cliente) clientes[r.cliente] = 1; }); }); });
    (S.prod || []).filter(function (o) { return !esC3(o.id) && !esOP(o.id); }).slice(-3).forEach(function (o) { ejemplos.push(textoOrden(o, true)); });
    return 'Sos el asistente de carga de pedidos del Frigorífico Qualitá, un frigorífico de cerdo. Recibís una foto, una captura de pantalla o un texto pegado (por ejemplo de WhatsApp) con uno o varios pedidos de clientes y devolvés los pedidos leídos como datos estructurados, sin texto adicional.\n\n'
      + 'Hoy es ' + diaDe(hoy()) + ' ' + hoy() + '.\n\n'
      + 'PRIMERO MIRÁ SI ES LA PLANILLA SEMANAL\n'
      + 'La planilla semanal de faena y medias es una grilla de Excel con una columna por día ("Lunes 28", "Martes 29", … "Viernes 2"), a veces con "SEMANA" y un número en la esquina. Arriba, en cada día, están las filas de FAENA: un origen (LA COLORADA, CANDELARIA, EL CEBIL, AG…) con columnas PROPIOS, USUARIOS y TOTAL. Debajo, en cada día, la lista de CLIENTES con una cantidad al lado. Al pie hay filas TOTAL y DESPOSTE. Las celdas suelen estar pintadas de verde, rojo o naranja: los colores no importan.\n'
      + 'Si la imagen es esa planilla, NO son pedidos: dejá "pedidos" vacío y cargá "planilla" con un elemento por cada día. En cada día:\n'
      + '- dia: el nombre del día en mayúsculas y sin acento. fecha: la fecha de esa columna en AAAA-MM-DD, tal cual figura (no la corras un día). Los cinco días son consecutivos de lunes a viernes; si la semana cruza de mes (… 30, 1, 2) seguí con el mes siguiente. Si solo hay números de día, elegí la semana más cercana a hoy.\n'
      + '- faena: un renglón por cada fila de faena de ese día, en el mismo orden, repitiendo las filas iguales (cuatro filas "CANDELARIA 160" son cuatro renglones). propios y usuarios son los números de esas columnas (0 si está vacío). Si una fila tiene un número sin nombre, origen "". Respetá los negativos. No copies la columna TOTAL ni la fila TOTAL.\n'
      + '- clientes: un renglón por cada cliente de ese día, en el mismo orden, con la cantidad tal cual figura (no la multipliques ni la dividas). Incluí los que figuran con 0. Si hay una cantidad sin nombre de cliente, cliente "". No copies las filas TOTAL ni DESPOSTE.\n'
      + 'Si un día no tiene nada, devolvelo igual con las listas vacías. Si no es la planilla semanal, dejá "planilla" vacía y cargá "pedidos" como sigue.\n\n'
      + 'CÓMO LLEGAN LOS PEDIDOS\n'
      + '1. Formulario manuscrito "ORDEN DE PEDIDO": el cliente está arriba y hay una "Fecha de entrega". En el renglón "18 CAPÓN" la cantidad seguida de "½" es la cantidad de MEDIAS RESES (ej.: "20 ½" = 20 medias). Los demás renglones son cortes. "Todo" al lado de un corte significa que el cliente se lleva todo lo que salga de ese corte. Puede haber renglones agregados a mano al pie, con código, y notas al margen. Una foto puede traer varios formularios: cada uno es un pedido.\n'
      + '2. Planillas de Excel de reparto por zona o por ciudad: cada fila es un cliente; la columna "Medias" es cantidad de medias reses y las demás columnas son cortes; si el encabezado dice la unidad (cajas, kg), es esa. La fecha del encabezado es la fecha de entrega. Si junto al cliente dice un rango de kilos (ej. "46 a 48 kg"), es el peso pedido para las medias.\n'
      + '3. Planillas por sucursal (ej. DINO): arriba a la izquierda figura el cliente y cada COLUMNA es una sucursal (Rod del Busto, Salsipuedes, Alta Gracia, Ruta 20…); cada fila es un corte, con su código, y el número es lo que pide esa sucursal de ese corte, en kilos cuando la planilla lo dice (por ejemplo con la fila "KG X SUCURSAL" o la columna "TOTAL KG"). Devolvé UN PEDIDO POR CADA SUCURSAL que tenga algo pedido, nunca uno solo con todo sumado: cada sucursal sale en un camión distinto. cliente = el nombre del cliente seguido de la sucursal (ej. "DINO ROD DEL BUSTO"). En cada pedido, un corte por cada fila que tenga cantidad en esa columna, con la cantidad de ESA sucursal. Una sucursal con toda la columna vacía o en cero no se carga. La imagen puede traer más de una tabla del mismo cliente: son más sucursales. No tomes como sucursal la columna TOTAL KG ni como corte la fila "KG X SUCURSAL": sirven para controlar; si la suma de una columna no coincide con su "KG X SUCURSAL", avisalo en dudas de ese pedido. El texto de cada corte lleva la cantidad con su unidad, el nombre del corte como figura y el código entre paréntesis (ej. "100KG JAMON 4 MUSC (COD 341)"); la sucursal no se repite en el texto. Los embutidos (chorizo, morcilla, salchicha) van con orden=false.\n'
      + '4. Lista escrita a mano en una hoja suelta: cada renglón es un cliente seguido de una cantidad con "½" (ej.: "Molina 100 ½" = 100 medias reses para MOLINA). Un título subrayado arriba (ej. "San Juan") es la zona o el destino, no un cliente: ponelo en la nota de cada pedido. Los importes con "$" son precios: cargalos en el precio (ver abajo). Una aclaración entre paréntesis como "(grandes)" va en peso. Un número rodeado con un círculo al pie es el total de medias de la hoja: no es un pedido; si la suma de los renglones no coincide con ese total, avisalo en dudas del primer pedido. Marcas como "ok" o rayas no son pedidos.\n'
      + '5. Texto pegado de WhatsApp u otro mensaje: suele empezar con una frase general (ej. "pedido de cerdo para el martes por caja") que da la fecha de entrega y la unidad para todo el mensaje, y sigue con bloques separados por una línea en blanco: la primera línea de cada bloque es el cliente o la sucursal y las siguientes son "cantidad corte". Cada bloque es un pedido. Aplicá la unidad general a cada renglón ("por caja": "2 matambre" = 2 CAJAS). "Pierna" es el rubro JAMON; conservá abreviaturas como "S/C" tal como vienen. Ignorá saludos y texto que no sea pedido. Si al pedirte la lectura te indican que todo el mensaje es de UN solo cliente y que los bloques son sus sucursales, devolvé igual un pedido por cada sucursal, con cliente = ese cliente seguido de la sucursal (ej. "CLIENTE MENENDEZ PIDAL").\n\n'
      + '6. Hoja de medias en ANIMALES (Excel, celdas pintadas de verde o rojo): solo nombres de clientes con UN número al lado, en una o varias columnas de a pares, sin la palabra "medias", sin "½", sin cortes y sin filas de FAENA, TOTAL ni DESPOSTE. Ese número es de ANIMALES y cada animal son DOS medias: cargá medias = número × 2 (ej. "NOVICERD 50" → medias 100) y anotá en dudas "En la hoja figura N animales: se cargó como 2N medias". Cada par cliente-número es un pedido.\n\n'
      + 'QUÉ CARGAR, POR CADA PEDIDO\n'
      + '- cliente: en mayúsculas. Si coincide con uno de la lista de clientes conocidos, usá exactamente ese nombre.\n'
      + '- entrega: en formato AAAA-MM-DD. Resolvé fechas como "lun 05/10" con el año actual. Si solo dice un día de la semana ("para el martes"), es el próximo día con ese nombre contando desde mañana. Si no figura, dejala vacía.\n'
      + '- medias: cantidad de medias reses, número. 0 si no pide medias. Si un cliente figura en la planilla con 0 medias o con la cantidad en blanco, cargalo igual con medias 0: no lo saltees.\n'
      + '- peso: aclaración de peso de las medias (livianas, pesadas, rango de kg), o "".\n'
      + '- frio: "FRESCO" o "CONGELADO" cuando en cualquier parte de la imagen o del mensaje dice que la mercadería es fresca o congelada: en el título, el encabezado, el nombre de la planilla o de la hoja, una columna, una nota al margen, al lado del cliente o en la frase inicial de un mensaje. También valen las abreviaturas ("CONG.", "CGDO", "FCO", "FRESC."). Si lo dice una sola vez en general, vale para TODOS los pedidos de esa imagen o mensaje: ponelo en cada uno. Si no lo dice en ningún lado, "" (no lo supongas). Si en un mismo pedido hay cortes frescos y cortes congelados, dejá frio en "" y escribí FRESCO o CONGELADO dentro del texto de cada corte.\n'
      + '- cortes: un elemento por cada corte pedido. "corte" es el rubro de la orden de producción, uno de: ' + CORTES_BASE.join(', ') + '. Todo pecho o pechito (con manta, manta doble, con o sin cuero) va en PECHO. "texto" es lo que pide de ese corte, en mayúsculas: primero la cantidad, tal cual figura en el pedido, con su unidad si el pedido la dice (ej. "600KG", "10 CAJAS", "50 UND"), después la presentación o variante si se aclara (ej. "15 CAJAS PIERNA S/C", "107 CAJAS DE 20KG CARRE CON HUESO") y el código si figura (ej. "(ART 276)"). Cargá el pedido como aparece: la unidad (CAJAS, KG, UND, BINES) se escribe solo cuando el pedido la aclara, sea en el renglón, en el encabezado de la columna, en la fila de totales o en la frase general ("por caja", "en kilos", "cj", "x kg"); en ese caso escribila en cada corte al que le corresponde. Si el pedido no aclara si es caja o kg, NO pongas ninguna unidad: dejá la cantidad sola (ej. "2 MATAMBRE"). Nunca la supongas ni la deduzcas por costumbre. NO pongas el nombre del cliente ni de la sucursal en el texto, ni entre comillas ni suelto: ya va en "cliente". Si el cliente pide TODO el corte, la línea va sin cantidad (ej. "TODO FRESCO EN BINES").\n'
      + '- orden: true si es un corte fresco que hay que producir ese día; false si es mercadería congelada que sale de stock, o productos que no salen del desposte (chorizo, morcilla, salchicha).\n'
      + '- precio (en cada corte) y precioMedias (de las medias): el precio por kilo en pesos, solo el número ("$4.200/kg" o "4200 + IVA" → 4200; "$ 2.850,50" → 2850.5). 0 si no figura. Si el precio es por caja, por unidad o por bulto (no por kilo), dejá 0 y anotalo en la nota.\n'
      + '- iva (en cada corte) e ivaMedias: "iva" si el precio es sin IVA (dice + IVA, más IVA, sin IVA, s/IVA, neto); "final" si es con IVA (dice final, con IVA, IVA incluido, c/IVA); "" si no lo aclara o no hay precio. Si una aclaración vale para todo el pedido ("todos los precios + IVA"), ponela en todos.\n'
      + '- nota: aclaraciones del pedido que no entran en otro campo.\n'
      + '- dudas: todo lo que no se lea bien o sea ambiguo, en una frase corta cada una. Si un número no se lee con seguridad, poné tu mejor lectura y avisá acá. No inventes datos.\n\n'
      + 'CLIENTES CONOCIDOS\n' + Object.keys(clientes).sort().join(', ') + '\n\n'
      + 'EJEMPLOS DE ÓRDENES DE PRODUCCIÓN RECIENTES (solo para el vocabulario de cortes y presentaciones; en los pedidos el texto NO lleva el cliente entre comillas)\n' + ejemplos.join('\n\n');
  }
  function leerImagen(file) {
    if (window.__mock && window.__mock.ia) return Promise.resolve(window.__mock.ia(file.name));
    return achicar(file).then(function (b64) {
      return pedirIA([{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text: 'Leé los pedidos de esta imagen y cargalos.' }]);
    });
  }
  function leerB64(b64, extra) {
    if (window.__mock && window.__mock.ia) return Promise.resolve(window.__mock.ia('foto', extra || ''));
    return pedirIA([{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text: 'Leé los pedidos de esta imagen y cargalos.' + (extra ? ' Aclaración que mandó el vendedor junto con la foto: ' + extra : '') }]);
  }
  function leerTexto(txt, cli) {
    if (window.__mock && window.__mock.ia) return Promise.resolve(window.__mock.ia('texto', txt));
    return pedirIA([{ type: 'text', text: 'Este es un mensaje pegado con pedidos. Leelos y cargalos.' + (cli ? ' Todo el mensaje es de un solo cliente: ' + cli + '. Los bloques son sus sucursales.' : '') + '\n\n<mensaje>\n' + txt + '\n</mensaje>' }]);
  }
  function pedirIA(contenido) {
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': S.ia.clave, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: S.ia.modelo || IA_MODELO, max_tokens: 16000, system: instrucciones(),
        output_config: { format: { type: 'json_schema', schema: ESQUEMA_PEDIDOS } },
        messages: [{ role: 'user', content: contenido }] })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(r.status === 401 ? 'La clave de IA no es válida.' : (j && j.error && j.error.message) || ('Error ' + r.status));
        if (j.stop_reason === 'max_tokens') throw new Error('Son demasiados pedidos para leerlos de una vez. Partilo en dos y probá de nuevo.');
        if (j.stop_reason === 'refusal') throw new Error('La IA no pudo leerlo. Cargá el pedido a mano.');
        var texto = (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('').trim();
        var datos = null;
        try { datos = JSON.parse(texto); } catch (e) {
          var a = texto.indexOf('{'), z = texto.lastIndexOf('}');
          if (a >= 0 && z > a) { try { datos = JSON.parse(texto.slice(a, z + 1)); } catch (e2) { datos = null; } }
        }
        if (datos && Array.isArray(datos.pedidos)) return datos;
        throw new Error('No se encontraron pedidos para leer.');
      });
    });
  }
  var ESQUEMA_PEDIDOS = {
    type: 'object', additionalProperties: false, required: ['pedidos', 'planilla'],
    properties: {
      pedidos: { type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['cliente', 'entrega', 'medias', 'peso', 'frio', 'cortes', 'nota', 'dudas', 'precioMedias', 'ivaMedias'],
        properties: {
          cliente: { type: 'string' }, entrega: { type: 'string', description: 'AAAA-MM-DD, o vacío si no figura' },
          medias: { type: 'number', description: 'Cantidad de medias reses; 0 si no pide' }, peso: { type: 'string' }, frio: { type: 'string', enum: ['', 'FRESCO', 'CONGELADO'], description: 'Si el pedido aclara fresco o congelado; vacío si no lo dice' },
          cortes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['corte', 'texto', 'orden', 'precio', 'iva'], properties: { corte: { type: 'string' }, texto: { type: 'string' }, orden: { type: 'boolean' }, precio: { type: 'number', description: 'Precio por kilo en pesos; 0 si no figura' }, iva: { type: 'string', enum: ['', 'iva', 'final'] } } } },
          nota: { type: 'string' }, dudas: { type: 'array', items: { type: 'string' } },
          precioMedias: { type: 'number', description: 'Precio por kilo de las medias en pesos; 0 si no figura' }, ivaMedias: { type: 'string', enum: ['', 'iva', 'final'] }
        } } },
      planilla: { type: 'array', description: 'Solo para la planilla semanal de faena y medias: un elemento por día. En cualquier otro caso, lista vacía.', items: {
        type: 'object', additionalProperties: false, required: ['dia', 'fecha', 'faena', 'clientes'],
        properties: {
          dia: { type: 'string', description: 'LUNES, MARTES, MIERCOLES, JUEVES o VIERNES' },
          fecha: { type: 'string', description: 'Fecha de esa columna, AAAA-MM-DD' },
          faena: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['origen', 'propios', 'usuarios'], properties: { origen: { type: 'string' }, propios: { type: 'number' }, usuarios: { type: 'number' } } } },
          clientes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['cliente', 'cerdos'], properties: { cliente: { type: 'string' }, cerdos: { type: 'number', description: 'La cantidad tal cual figura en la planilla' } } } }
        } } }
    }
  };
  function guardarVarios(cuales, auto) {
    var ok = [];
    return cuales.reduce(function (cad, q) {
      return cad.then(function () { return guardarPropuesta(q, auto).then(function () { ok.push(q); if (!auto) S.entrega = q.entrega; S.prop = S.prop.filter(function (x) { return x !== q; }); }, function (err) { q.error = err.message || 'No se pudo guardar.'; }); })
        .then(function () { return new Promise(function (r) { setTimeout(r, 30); }); });
    }, Promise.resolve()).then(function () { return ok; });
  }
  function mismoPedido(a, q) {
    var ca = (a.cortes || []).map(function (c) { return norm(c.corte) + '|' + norm(sinCliente(c.texto, a.cliente)); }).sort().join('~');
    var cq = (q.cortes || []).filter(function (c) { return c.texto; }).map(function (c) { return norm(c.corte) + '|' + norm(sinCliente(c.texto, q.cliente)); }).sort().join('~');
    return (+a.medias || 0) === (+q.medias || 0) && ca === cq;
  }
  /* ---------- cargas en segundo plano ----------
     Cada carga (fotos o texto) recuerda desde qué pantalla se pidió. Las lecturas pueden correr a la vez;
     el guardado va en fila, de a un lote, para que dos cargas no se pisen. */
  var cargas = { activas: 0, cola: Promise.resolve() }, tAviso = null;
  function avisar(txt, ms) {
    var e = $('toast'); if (!e) return;
    clearTimeout(tAviso);
    if (!txt) { e.hidden = true; return; }
    var err = txt.charAt(0) === '!'; e.textContent = err ? txt.slice(1) : txt; e.className = 'toast' + (err ? ' err' : ''); e.hidden = false;
    if (ms) tAviso = setTimeout(function () { e.hidden = true; }, ms);
  }
  function estadoCarga() {
    if (cargas.activas > 0) avisar('Leyendo ' + (cargas.activas === 1 ? '1 archivo' : cargas.activas + ' archivos') + '… Podés seguir trabajando en otra pantalla.');
  }
  function ctxCarga() {
    // Sin fecha en el pedido: va al día hábil siguiente.
    return { tab: S.tab, porDefecto: habilSiguiente(hoy()), dia: cargaDiaActual(), esperada: S.tab === 'medias' && S.sem ? S.sem : semanaActual() };
  }
  function escribiendo() {
    var a = document.activeElement, t = a && a.tagName;
    return !!(S.ep || S.em) || t === 'TEXTAREA' || t === 'SELECT' || (t === 'INPUT' && a.type !== 'file' && a.type !== 'checkbox');
  }
  // Redibuja sin interrumpir a quien está escribiendo.
  function refrescar() { if (escribiendo()) pintarMsg('fotos'); else render(); }
  function encolar(ctx, leidos, errores) {
    cargas.cola = cargas.cola.then(function () { return procesarLote(ctx, leidos, errores); }).then(null, function () { S.msg.fotos = '!No se pudo guardar lo leído. Revisá la conexión y probá de nuevo.'; avisar(S.msg.fotos, 9000); refrescar(); });
    return cargas.cola;
  }
  // Si hay una edición abierta, primero se guarda tal como está y al final se vuelve a leer,
  // para que lo que entra por una carga no quede pisado por lo que se estaba escribiendo.
  function asentarEdicion() {
    if (S.ep) { var dl = limpiarOrden(S.ep.doc); clearTimeout(timers.prod); S.prod = poner(S.prod, S.ep.fecha, dl); store.set('produccion', S.ep.fecha, dl).then(null, function () {}); }
    if (S.em) { var sl = limpiarSemana(S.em.doc); clearTimeout(timers.medias); S.faena = poner(S.faena, S.em.lunes, sl); store.set('faena', S.em.lunes, sl).then(null, function () {}); }
  }
  function releerEdicion() {
    if (S.ep) {
      var fe = S.ep.fecha, cur = (S.prod || []).filter(function (o) { return o.id === fe; })[0];
      if (cur) { S.ep.doc = clone(cur); S.ep.base = clone(cur); var pd = $('p-doc'); if (pd) { var a = pd.selectionStart, b = pd.selectionEnd; pd.value = docDeOrden(S.ep.doc); try { pd.setSelectionRange(a, b); } catch (err) {} crecer(pd); } }
    }
    if (S.em) { var le = S.em.lunes, cs = (S.faena || []).filter(function (x) { return x.id === le; })[0]; if (cs) { S.em.doc = clone(cs); if (S.tab === 'medias') render(); } }
  }
  function procesarLote(ctx, leidos, errores) {
    var nuevos = [], planillas = [], repetidos = 0, hechas = [];
    asentarEdicion();
    leidos.forEach(function (x) {
      (x.j.pedidos || []).forEach(function (p) {
        nuevos.push({ k: uid(), cliente: p.cliente || '', entrega: ctx.dia || (/^\d{4}-\d{2}-\d{2}$/.test(p.entrega || '') ? p.entrega : ctx.porDefecto), medias: +p.medias || '', peso: p.peso || '', frio: frioDe(p.frio), nota: p.nota || '', origen: x.origen, foto: x.nombre,
          dudas: (p.dudas || []).filter(Boolean), precioMedias: +p.precioMedias > 0 ? +p.precioMedias : '', ivaMedias: +p.precioMedias > 0 && /^(iva|final)$/.test(p.ivaMedias || '') ? p.ivaMedias : '',
          cortes: (p.cortes || []).map(function (c) { var pr = +c.precio > 0 ? +c.precio : ''; return { corte: norm(c.corte), texto: c.texto || '', orden: c.orden !== false, precio: pr, iva: pr && /^(iva|final)$/.test(c.iva || '') ? c.iva : '' }; }) });
      });
      if (x.j.planilla && x.j.planilla.length) planillas.push(x.j.planilla);
    });
    if (ctx.vendedor) nuevos.forEach(function (q) { q.vendedor = ctx.vendedor.email; q.vendedorNombre = ctx.vendedor.nombre; q.origen = 'vendedor'; });
    nuevos = nuevos.filter(function (q) {
      var prev = (S.pedidos || []).filter(function (x) { return x.entrega === q.entrega && norm(x.cliente) === norm(q.cliente) && norm(q.cliente); });
      var igual = prev.filter(function (x) { return mismoPedido(x, q); })[0];
      if (igual) {
        // Mismo pedido que ya estaba: no se repite, pero si ahora trae fresco o congelado se le agrega.
        if (!q.frio || (igual.frio || '') === q.frio) { repetidos++; return false; }
        q.editaId = igual.id; q.cortes = clone(cortesDe(igual)); q.peso = igual.peso || q.peso; q.nota = igual.nota || q.nota; q.kg = igual.kg || ''; q.origen = igual.origen || q.origen; q.cuenta = igual.cuenta || '';
        return true;
      }
      var soloMedias = prev.filter(function (x) { return !(x.cortes || []).length; })[0];
      if (soloMedias && !(q.cortes || []).some(function (c) { return c.texto; })) q.editaId = soloMedias.id;
      return true;
    });
    if (ctx.vendedor) ctx.res = nuevos.map(function (q) { return String(q.cliente || '').toUpperCase().trim(); });
    var txtRep = repetidos ? (repetidos === 1 ? ' 1 pedido ya estaba cargado y no se repitió.' : ' ' + repetidos + ' pedidos ya estaban cargados y no se repitieron.') : '';
    // La planilla va a la semana que dice, sin preguntar. Si las fechas leídas son de una semana ya pasada,
    // es una mala lectura: va a la semana que se está cargando.
    var directas = planillas.map(function (pl) { var leida = semanaLeida(pl); return { dias: pl, lunes: leida && leida >= semanaActual() ? leida : ctx.esperada }; });
    if (!nuevos.length && !planillas.length) {
      S.msg.fotos = errores.length ? '!' + errores.join(' ') : repetidos ? txtRep.trim() : '!No se encontraron pedidos para leer.';
      avisar(S.msg.fotos, 9000); refrescar(); return Promise.resolve();
    }
    return directas.reduce(function (cad, pl) {
      return cad.then(function () { return aplicarPlanilla(pl.dias, pl.lunes); }).then(function (r) { if (r) hechas.push(r); }, function () { errores.push('No se pudo guardar la planilla.'); });
    }, Promise.resolve()).then(function () {
      S.prop = S.prop.concat(nuevos);
      return guardarVarios(nuevos, true);
    }).then(function (ok) {
      var aca = S.tab === ctx.tab && !escribiendo();
      var fechas = {}, faltan = nuevos.length - ok.length;
      ok.forEach(function (q) { fechas[q.entrega] = 1; });
      var fs = Object.keys(fechas).sort(), partes = [];
      hechas.forEach(function (r) { partes.push('Planilla de la semana del ' + etiquetaSemana(r.lunes) + ' cargada: ' + r.dias + (r.dias === 1 ? ' día' : ' días') + ', ' + r.clientes + ' clientes.'); });
      if (ok.length) partes.push('Guardado: ' + ok.length + (ok.length === 1 ? ' pedido.' : ' pedidos.'));
      if (txtRep) partes.push(txtRep.trim());
      if (faltan) partes.push((faltan === 1 ? 'Quedó 1 pedido sin guardar: completalo' : 'Quedaron ' + faltan + ' pedidos sin guardar: completalos') + ' en Pedidos.');
      if (ok.length && fs.length) S.pedDia = fs[0];
      if (errores.length) partes.push(errores.join(' '));
      var m = (errores.length || (faltan && !ok.length) ? '!' : '') + partes.join(' ');
      S.msg.fotos = m; avisar(m, 10000);
      if (aca) {
        if (fs.length) S.entrega = fs[0];
        if (ctx.tab === 'medias' && fs.length) { S.mv = null; S.fm = habilAnterior(fs[0]); S.sem = lunesDe(S.fm); S.dia = Math.round((fecha(S.fm) - fecha(S.sem)) / 86400000); }
        if (faltan && S.tab !== 'pedidos') { irA('pedidos'); return; }
        if (hechas.length && !ok.length && !faltan) { S.sem = hechas[hechas.length - 1].lunes; S.dia = null; S.mv = null; S.msg.medias = partes[0] + ' Revisala y tocá Editar para corregir lo que haga falta.'; S.msg.fotos = ''; irA('medias'); return; }
      }
      releerEdicion();
      refrescar();
    });
  }
  // Hoja de medias copiada de Excel: celdas "CLIENTE <tab> número" (una o varias columnas de a pares). El número es de ANIMALES:
  // cada animal son dos medias, así que el pedido se carga con el doble. Si la hoja trae faena, totales u otra cosa, no es esta.
  function leerAnimales(txt) {
    var t = String(txt || ''); if (t.indexOf('\t') < 0) return null;
    var pares = [], ok = true;
    t.split(/\r?\n/).forEach(function (fila) {
      var cs = fila.split('\t').map(function (c) { return c.trim(); });
      for (var i = 0; i < cs.length; i++) {
        if (!cs[i]) continue;
        var nom = cs[i], num = cs[i + 1];
        if (/\d/.test(nom) || !/[A-ZÁÉÍÓÚÑ]/i.test(nom) || !/^\d+$/.test(num || '')) { ok = false; return; }
        if (/^(TOTAL|DESPOSTE|FAENA|SEMANA|PROPIOS|USUARIOS|MEDIAS|CLIENTES?)\b/i.test(norm(nom))) { ok = false; return; }
        pares.push({ cliente: nom.toUpperCase().replace(/\s+/g, ' '), animales: +num }); i++;
      }
    });
    return ok && pares.length ? pares : null;
  }
  function cargarAnimales(pares, dia) {
    var ctx = ctxCarga();
    var j = { pedidos: pares.map(function (x) { return { cliente: x.cliente, entrega: dia || '', medias: x.animales * 2, peso: '', frio: '', cortes: [], nota: '', precioMedias: 0, ivaMedias: '',
      dudas: ['En la hoja figura ' + animales(x.animales) + ': se cargó como ' + n(x.animales * 2) + ' medias.'] }; }) };
    S.pegar = false; S.pegarTxt = ''; S.pegarCli = ''; S.pegarDia = '';
    S.msg.fotos = 'Hoja en animales: ' + pares.length + (pares.length === 1 ? ' cliente pasado' : ' clientes pasados') + ' a medias (×2).';
    return encolar(ctx, [{ j: j, origen: 'texto', nombre: '' }], []);
  }
  function leerPegado() {
    var txt = String(S.pegarTxt || '').trim();
    if (!txt) { S.msg.fotos = '!Pegá primero el texto del pedido.'; pintarMsg('fotos'); return; }
    if (S.leyendo) return;
    var pa = leerAnimales(S.pegarTxt); if (pa) { cargarAnimales(pa, cargaDiaActual()); return; }
    var ctx = ctxCarga(), cli = String(S.pegarCli || '').toUpperCase().trim(), dia = cargaDiaActual();
    S.leyendo = true; S.pegar = false; S.msg.fotos = 'Leyendo el texto…'; cargas.activas++; estadoCarga(); render();
    leerTexto(txt, cli).then(function (j) {
      S.leyendo = false; cargas.activas--; S.pegarTxt = ''; S.pegarCli = ''; S.pegarDia = '';
      // El día elegido a mano manda sobre el que diga el mensaje.
      if (dia && j && j.pedidos) j.pedidos.forEach(function (q) { q.entrega = dia; });
      return encolar(ctx, [{ j: j, origen: 'texto', nombre: '' }], []);
    }, function (e) {
      // Si falla la lectura, el texto pegado no se pierde.
      S.leyendo = false; cargas.activas--; S.msg.fotos = '!' + e.message; avisar(S.msg.fotos, 9000);
      if (S.tab === ctx.tab && !escribiendo()) { S.pegar = true; render(); } else refrescar();
    });
  }
  function subirFotos(files) {
    var lista = Array.prototype.slice.call(files), ctx = ctxCarga(), leidos = [], errores = [], i = 0;
    if (!lista.length) return;
    cargas.activas += lista.length; estadoCarga();
    S.msg.fotos = 'Leyendo ' + (lista.length === 1 ? 'la foto' : lista.length + ' fotos') + '…'; pintarMsg('fotos');
    (function sig() {
      if (i >= lista.length) { encolar(ctx, leidos, errores); return; }
      var f = lista[i++];
      leerImagen(f).then(function (j) { leidos.push({ j: j, origen: 'foto', nombre: f.name }); }, function (e) { errores.push((f.name ? f.name + ': ' : '') + e.message); })
        .then(function () { cargas.activas--; estadoCarga(); sig(); });
    })();
  }

  var ivaQ = function (pre, val, lab) { return '<select id="' + pre + '" ' + lab + '><option value=""' + (val ? '' : ' selected') + '>¿IVA?</option><option value="iva"' + (val === 'iva' ? ' selected' : '') + '>+ IVA</option><option value="final"' + (val === 'final' ? ' selected' : '') + '>Final</option></select>'; };
  function propHTML(q, i) {
    var listaCortes = CORTES_BASE.concat(CORTES_A_MANO); (q.cortes || []).forEach(function (c) { if (c.corte && listaCortes.indexOf(c.corte) < 0) listaCortes.push(c.corte); });
    var h = '<div class="card">';
    h += '<div class="campos"><label class="campo"><span>Cliente</span><input type="text" id="q' + i + 'cliente" data-q="' + i + '" data-k="cliente" list="dl-clientes" autocomplete="off" value="' + esc(q.cliente) + '" style="text-transform:uppercase"></label>'
      + '<label class="campo"><span>N° de cuenta</span><input type="text" inputmode="numeric" id="q' + i + 'cuenta" data-q="' + i + '" data-k="cuenta" value="' + esc(q.cuenta || '') + '" placeholder="' + esc(cuentaDe(q.cliente) || 'Sin número') + '"></label>'
      + '<label class="campo"><span>Entrega</span><input type="date" id="q' + i + 'entrega" data-q="' + i + '" data-k="entrega" value="' + esc(q.entrega || '') + '"></label>'
      + '<label class="campo"><span>Medias</span><input type="number" inputmode="numeric" id="q' + i + 'medias" data-q="' + i + '" data-k="medias" value="' + esc(q.medias) + '"></label>'
      + '<label class="campo"><span>Peso o aclaración</span><input type="text" id="q' + i + 'peso" data-q="' + i + '" data-k="peso" value="' + esc(q.peso || '') + '"></label>'
      + '<label class="campo"><span>Fresco o congelado</span><select id="q' + i + 'frio" data-q="' + i + '" data-k="frio">' + ['', 'FRESCO', 'CONGELADO'].map(function (x) { return '<option value="' + x + '"' + ((q.frio || '') === x ? ' selected' : '') + '>' + (x ? x.charAt(0) + x.slice(1).toLowerCase() : 'Sin aclarar') + '</option>'; }).join('') + '</select></label>'
      + '<label class="campo"><span>Precio medias $/kg</span><span class="pre-q"><input type="number" inputmode="decimal" step="any" min="0" id="q' + i + 'precioMedias" data-q="' + i + '" data-k="precioMedias" value="' + esc(q.precioMedias === 0 ? 0 : q.precioMedias || '') + '">' + ivaQ('q' + i + 'ivaMedias', q.ivaMedias, 'data-q="' + i + '" data-k="ivaMedias" aria-label="IVA de las medias"') + '</span></label>'
      + '<label class="campo"><span>Kilos (opcional)</span><input type="number" inputmode="numeric" id="q' + i + 'kg" data-q="' + i + '" data-k="kg" value="' + esc(q.kg || '') + '"></label></div>';
    (q.cortes || []).forEach(function (c, j) {
      h += '<div class="cl"><select id="q' + i + 'c' + j + 'corte" data-q="' + i + '" data-j="' + j + '" data-k="corte" aria-label="Corte">' + listaCortes.map(function (x) { return '<option' + (x === c.corte ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>'
        + '<textarea rows="2" id="q' + i + 'c' + j + 'texto" data-q="' + i + '" data-j="' + j + '" data-k="texto" aria-label="Qué pide de este corte" style="text-transform:uppercase">' + esc(c.texto) + '</textarea>'
        + '<span class="pre-q"><input type="number" inputmode="decimal" step="any" min="0" id="q' + i + 'c' + j + 'precio" data-q="' + i + '" data-j="' + j + '" data-k="precio" value="' + esc(c.precio === 0 ? 0 : c.precio || '') + '" placeholder="$/kg" aria-label="Precio por kilo">' + ivaQ('q' + i + 'c' + j + 'iva', c.iva, 'data-q="' + i + '" data-j="' + j + '" data-k="iva" aria-label="IVA"') + '</span>'
        + '<button class="btn x" data-act="q-quitar-corte" data-q="' + i + '" data-j="' + j + '" aria-label="Quitar corte">×</button></div>';
    });
    h += '<div class="acciones"><button class="btn sm" data-act="q-corte" data-q="' + i + '">+ Corte</button></div>'
      + '<label class="campo"><span>Nota</span><input type="text" id="q' + i + 'nota" data-q="' + i + '" data-k="nota" value="' + esc(q.nota || '') + '"></label>'
      + (q.error ? '<p class="small neg">' + esc(q.error) + '</p>' : '')
      + '<div class="acciones"><button class="btn pri" data-act="q-guardar" data-q="' + i + '">' + (q.editaId ? 'Guardar cambios' : 'Guardar pedido') + '</button><button class="btn" data-act="q-descartar" data-q="' + i + '">' + (q.editaId ? 'Cancelar' : 'Descartar') + '</button></div></div>';
    return h;
  }
  // Los tres caminos de carga: fotos, texto pegado o a mano.
  /* ---------- pedidos por voz ----------
     Dictar: el navegador (Chrome) pasa a texto lo que se dice y queda en "Pegar texto" para revisarlo y leerlo como siempre. */
  var reconocedor = null;
  function ponerTextoPegado(txt) { S.pegarTxt = txt; var ta = $('pegar-txt'); if (ta) { ta.value = txt; ta.scrollTop = ta.scrollHeight; } }
  // Al parar queda todo lo que se ve escrito, también lo último que se estaba diciendo.
  function pararDictado() { var ta = $('pegar-txt'); if (ta) S.pegarTxt = ta.value; S.dictando = false; var r = reconocedor; reconocedor = null; if (r) try { r.stop(); } catch (e) {} }
  function dictar() {
    if (S.dictando) { pararDictado(); renderPedidos(); return; }
    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (window.__mock && window.__mock.dictado) Rec = window.__mock.dictado;
    if (!Rec) { avisar('!Este navegador no permite dictar. Probá con Google Chrome (en la compu o en Android).', 7000); return; }
    S.pegar = true; S.msg.fotos = ''; S.dictando = true; renderPedidos();
    var base = String(S.pegarTxt || '').trim(); if (base) base += '\n';
    var r = new Rec(); reconocedor = r;
    r.lang = 'es-AR'; r.continuous = true; r.interimResults = true;
    r.onresult = function (ev) {
      var fin = '', parcial = '';
      for (var i = 0; i < ev.results.length; i++) { var t = ev.results[i][0].transcript; if (ev.results[i].isFinal) fin += t + ' '; else parcial += t; }
      S.pegarTxt = (base + fin).trim(); ponerTextoPegado((base + fin + parcial).trim()); S.pegarTxt = (base + fin).trim();
    };
    r.onerror = function (ev) {
      var e = ev && ev.error;
      if (e === 'not-allowed' || e === 'service-not-allowed') avisar('!No hay permiso para usar el micrófono. Permitilo en el candado de la barra de direcciones.', 8000);
      else if (e && e !== 'no-speech' && e !== 'aborted') avisar('!No se pudo seguir dictando (' + e + ').', 6000);
    };
    r.onend = function () {
      // Chrome corta solo después de un silencio: si no se tocó Detener, sigue escuchando.
      if (S.dictando && reconocedor === r) { try { base = String(S.pegarTxt || '').trim(); if (base) base += '\n'; r.start(); return; } catch (e) {} }
      if (reconocedor === r) { S.dictando = false; renderPedidos(); }
    };
    try { r.start(); } catch (e) { S.dictando = false; avisar('!No se pudo empezar a dictar.', 6000); renderPedidos(); }
  }
  /* Antes de cargar (foto, texto, dictado o a mano) se elige el día de entrega: todo lo que se cargue va a ese día.
     "Según el pedido" deja que mande el día que diga el mensaje (o el próximo día hábil si no dice). */
  // En Pedidos el día de carga es el mismo día que se está viendo (para no confundirse): elegir un día lo muestra abajo,
  // y pasar de día con ‹ › cambia también el día de carga. "Según el pedido" deja que mande el mensaje.
  function cargaDiaActual() { if (S.tab === 'pedidos') return S.cargaSegun ? '' : (S.pd || habilSiguiente(hoy())); return S.cargaDia || ''; }
  function diasCarga() { var l = [], f = hoy(); while (l.length < 6) { f = mas(f, 1); var g = fecha(f).getDay(); if (g >= 1 && g <= 5) l.push(f); } return l; }
  function cargaDiaHTML() {
    var sel = cargaDiaActual(), dias = diasCarga();
    if (sel && dias.indexOf(sel) < 0) dias.push(sel);
    var chip = function (v, txt) { return '<button class="btn sm chip carga-dia' + (v === sel ? ' on' : '') + '" data-act="carga-dia" data-v="' + esc(v) + '" aria-pressed="' + (v === sel) + '">' + txt + '</button>'; };
    return '<div class="carga-dias"><span class="small muted">' + (S.tab === 'pedidos' ? 'Cargar para el' : '¿Para qué día?') + '</span>' + dias.map(function (f) { return chip(f, esc(diaCorto(f))); }).join('') + chip('', 'Según el pedido')
      + '<label class="btn sm chip carga-otro" title="Elegir otra fecha">Otra fecha<input type="date" id="carga-dia-otra" value="' + esc(sel) + '"></label></div>';
  }
  function cargaHTML(actMano) {
    var conIA = !!(S.ia && S.ia.clave) || !!(window.__mock && window.__mock.ia);
    var h = cargaDiaHTML() + '<div class="acciones"><label class="btn pri" style="display:inline-flex;align-items:center' + (conIA ? '' : ';opacity:.45') + '">Subir fotos o capturas<input type="file" id="fotos" accept="image/*" multiple hidden' + (conIA ? '' : ' disabled') + '></label>'
      + '<button class="btn pri' + (S.pegar ? ' activo' : '') + '" data-act="q-pegar"' + (conIA ? '' : ' disabled') + '>Pegar texto</button>'
      + '<button class="btn pri" data-act="' + actMano + '">Cargar a mano</button>'
      + (actMano === 'q-nuevo' ? '<button class="btn pri' + (S.dictando ? ' dictando' : '') + '" data-act="q-dictar"' + (conIA ? '' : ' disabled') + '>' + (S.dictando ? '⏹ Detener dictado' : '🎤 Dictar pedido') + '</button>' : '')
      + (conIA ? '<span class="small muted pega-tip">o pegá una captura con Ctrl+V</span>' : '') + '<span class="guardado" id="g-fotos"></span></div>'
      + (S.dictando ? '<p class="escuchando">● Escuchando… hablá tranquilo; lo que digas se va escribiendo abajo. Cuando termines tocá "Detener dictado" y después "Leer".</p>' : '');
    if (S.pegar && conIA) h += '<div class="pegar"><label class="campo"><span>Mensaje con los pedidos</span><textarea id="pegar-txt" rows="9">' + esc(S.pegarTxt || '') + '</textarea></label>'
      + '<label class="campo"><span>Cliente, si todo el mensaje es de uno solo con varias sucursales (opcional)</span><input type="text" id="pegar-cli" value="' + esc(S.pegarCli || '') + '"></label>'
      + '<div class="acciones"><button class="btn pri" data-act="q-leer-texto">Leer</button><button class="btn" data-act="q-pegar">Cancelar</button></div></div>';
    if (!conIA) h += '<p class="small muted">Para leer fotos o texto falta cargar la clave de IA, en Pedidos, abajo, en Configuración.</p>';
    return h;
  }
  function cuandoEs(f) { return f === mas(hoy(), 1) ? 'mañana' : f === hoy() ? 'hoy' : 'el ' + tituloDe(f).toLowerCase(); }
  // Marca en el listado: cuántos cortes del pedido ya se mandaron a producción.
  function prodBadgeHTML(enP, tot) {
    if (!tot) return '<span class="pr-ic nada" title="Solo medias: no hay cortes para mandar a producción" aria-label="Solo medias">–</span>';
    return enP >= tot ? '<span class="pr-ic si" title="En producción" aria-label="En producción">✓</span>'
      : '<span class="pr-ic no" title="' + (enP ? 'Falta pasar a producción: ' + enP + ' de ' + tot + ' cortes' : 'Sin producción') + '" aria-label="Sin producción">✗</span>';
  }
  // Kilos totales del pedido (medias, cajas y unidades pasadas a kilos, o los que se cargaron a mano).
  function kgPedHTML(p) {
    var k = kgPedido(p); if (!k.kg && !k.falta) return '';
    return '<span class="kg-ped' + (k.falta ? ' falta' : '') + '" title="' + (k.falta ? 'Hay renglones que no se pueden pasar a kilos' : 'Kilos totales del pedido') + '">' + (k.kg ? '<b>' + (k.manual ? '' : '≈ ') + n(k.kg) + ' kg</b>' + (k.falta ? '<small> + sin peso</small>' : '') : '<small>sin peso</small>') + '</span>';
  }
  // Un pedido del listado: cerrado muestra el resumen; abierto, el desglose por corte.
  // Fresco o congelado, elegible desde el renglón del pedido: se toca el cartelito y aparecen las opciones.
  // Las medias siempre van frescas: fresco/congelado es solo para las cajas (cortes). Un pedido de solo medias no lleva cartel.
  function frioPed(p) { return (p && (p.cortes || []).length) ? (p.frio || '') : ''; }
  function frioChipHTML(p) {
    if (!(p.cortes || []).length) return '';
    var f = p.frio || '', cls = f === 'CONGELADO' ? 'cong' : f === 'FRESCO' ? 'fresco' : 'nada';
    return '<span class="frio-chip ' + cls + '" data-act="frio-menu" data-id="' + esc(p.id) + '" role="button" tabindex="0" title="Tocá para elegir fresco o congelado">' + (f || '<span class="chip-lg">¿Fresco o congelado?</span><span class="chip-co">¿Fresco/cong.?</span>') + ' ▾</span>';
  }
  // Camión, elegible desde el renglón del pedido (al lado de fresco/congelado): se toca y aparecen los camiones del día.
  function camChipHTML(p) {
    if (!S.editor || S.solo) return '';
    var cam = nombreCamion(p.entrega, p.camion);
    return '<span class="frio-chip cam-chip' + (cam ? ' con' : ' nada') + '" data-act="camp-menu" data-id="' + esc(p.id) + '" role="button" tabindex="0" title="Tocá para ' + (cam ? 'cambiar de camión' : 'sumarlo a un camión') + '">' + (cam ? '🚚 ' + esc(cam) : '<span class="chip-lg">+ Sumar a camión</span><span class="chip-co">+ Camión</span>') + ' ▾</span>';
  }
  // Si el pedido está tildado, el camión que se elige va para todos los tildados de ese día.
  // Botón directo para sacar del camión (pedido de Renzo), al lado del nombre del camión.
  function sacarCamHTML(p) { return S.editor && !S.solo && p.camion && nombreCamion(p.entrega, p.camion) ? '<span class="cam-sacar" data-act="camp-sacar" data-id="' + esc(p.id) + '" role="button" tabindex="0" title="Sacar del camión" aria-label="Sacar a ' + esc(p.cliente || '') + ' del camión">✕ Sacar</span>' : ''; }
  function camGrupo(p) {
    if (!S.sel || !S.sel[p.id] || S.selDia !== p.entrega) return [p];
    return tildadosDe(p.entrega).map(pedidoDe);
  }
  function camMenuHTML(p) {
    var f = p.entrega, cams = camionesDe(f), lg = logDe(f), pubs = (lg && lg.pedidos) || [], fl = flota();
    var libres = fl.filter(function (c) { return !cams.some(function (d) { return d.id === 'f' + c.id; }); });
    var b = function (v, t, pri) { return '<button class="btn sm' + (pri ? ' pri' : '') + '" data-act="camp-set" data-id="' + esc(p.id) + '" data-v="' + esc(v) + '">' + t + '</button>'; };
    var gr = camGrupo(p);
    return '<div class="frio-menu cam-menu"><span class="small muted">' + (gr.length > 1 ? 'Sumar los <b>' + gr.length + ' tildados</b> a:' : 'Sumar a:') + '</span>'
      + cams.map(function (c) { var t = capTxt(c, cargaDe(pubs, c.id)); return b('d:' + c.id, esc(nomCam(c)) + (t ? ' <small>' + esc(t) + '</small>' : ''), p.camion === c.id); }).join('')
      + libres.map(function (c) { return b('f:' + c.id, esc(nomLimpio(c.nombre)) + (+c.kg ? ' <small>' + n(+c.kg) + ' kg</small>' : '')); }).join('')
      + '<span class="camp-nuevo"><input type="text" id="camp-nombre-' + esc(p.id) + '" data-camp-nuevo="' + esc(p.id) + '" placeholder="Camión nuevo: escribí el nombre" aria-label="Nombre del camión nuevo" autocomplete="off" style="text-transform:uppercase"><button class="btn sm pri" data-act="camp-crear" data-id="' + esc(p.id) + '">Sumar</button></span>'
      + (gr.some(function (x) { return x.camion; }) ? b('', gr.length > 1 ? 'Sacarlos del camión' : 'Sacar del camión') : '')
      + '<button class="btn sm lnk" data-act="camp-menu" data-id="' + esc(p.id) + '">Cerrar</button></div>';
  }
  // Faena de las medias del pedido: normal (día hábil anterior a la entrega) o ya faenadas de otro día (en cámara).
  function mediasFaenaHTML(p) {
    if (!S.editor || S.solo || !(+p.medias > 0)) return '';
    var fa = faenaDe(p), id = esc(p.id);
    if (p.faenaFija) return ' <span class="mf-chip fija" title="Estas medias no se vuelven a faenar: ya están en cámara">Ya en cámara · faenadas el ' + esc(diaCorto(fa).toLowerCase()) + '</span> <button class="btn sm lnk" data-act="mf-set" data-id="' + id + '" data-f="">Faenar de nuevo</button>';
    if (S.mfAbierto !== p.id) return ' <button class="btn sm lnk mf-abrir" data-act="mf-abrir" data-id="' + id + '" title="Si las medias ya están faenadas de otro día (por ejemplo, el cliente no las pudo recibir y se pasó la entrega)">¿Ya están en cámara?</button>';
    var ops = [], d = hoy(); if (!esHabil(d)) d = habilAnterior(d);
    while (ops.length < 6) { if (d < p.entrega) ops.push(d); d = habilAnterior(d); }
    return '<span class="mf-menu"><span class="small muted">Faenadas el:</span>' + ops.map(function (x) { return '<button class="btn sm" data-act="mf-set" data-id="' + id + '" data-f="' + x + '">' + esc(diaCorto(x)) + '</button>'; }).join('') + '<button class="btn sm lnk" data-act="mf-abrir" data-id="' + id + '">Cancelar</button></span>';
  }
  function frioMenuHTML(p) {
    var b = function (v, t) { return '<button class="btn sm' + ((p.frio || '') === v ? ' pri' : '') + '" data-act="frio-set" data-id="' + esc(p.id) + '" data-v="' + v + '">' + t + '</button>'; };
    return '<div class="frio-menu"><span class="small muted">Este pedido es:</span>' + b('FRESCO', 'Fresco') + b('CONGELADO', 'Congelado') + b('', 'Sin aclarar') + '<button class="btn sm lnk" data-act="frio-menu" data-id="' + esc(p.id) + '">Cerrar</button></div>';
  }
  /* Editar un cliente desde Medias (vista del día). Si el renglón viene de un pedido, se cambia el pedido (cliente, nota = peso
     o aclaración, medias = animales × 2), así queda todo igual en Pedidos y Logística; si se cargó a mano, se cambia solo acá. */
  function guardarMediaDia(f, j, k, v) {
    var x = diaFaena(f); if (!x) return Promise.resolve(); var r = x.d.clientes[j]; if (!r) return Promise.resolve();
    v = k === 'cant' ? Math.max(0, +String(v).replace(',', '.') || 0) : String(v || '').toUpperCase().replace(/\s+/g, ' ').trim();
    var p = r.pedido ? pedidoDe(r.pedido) : null;
    if (p) {
      var q = { editaId: p.id, cliente: p.cliente, entrega: p.entrega, medias: p.medias, peso: p.peso, frio: p.frio || '', cuenta: p.cuenta || '', nota: p.nota, kg: p.kg, origen: p.origen,
        precioMedias: p.precioMedias === 0 || p.precioMedias ? p.precioMedias : '', ivaMedias: p.ivaMedias || '', cortes: clone(cortesDe(p)) };
      if (k === 'cliente') q.cliente = v; else if (k === 'nota') q.peso = v; else q.medias = v * 2;
      return guardarPropuesta(q);
    }
    var sem = clone(x.sem), id = sem.id; delete sem.id; sem.dias[x.i].clientes[j][k] = v;
    var sl = limpiarSemana(sem); S.faena = poner(S.faena, id, sl); return store.set('faena', id, sl);
  }
  function cambiarFrio(p, v) {
    return guardarPropuesta({ editaId: p.id, cliente: p.cliente, entrega: p.entrega, medias: p.medias, peso: p.peso, frio: v, cuenta: p.cuenta || '', nota: p.nota, kg: p.kg, origen: p.origen,
      precioMedias: p.precioMedias === 0 || p.precioMedias ? p.precioMedias : '', ivaMedias: p.ivaMedias || '', cortes: clone(cortesDe(p)) });
  }
  function cambiarNota(p, v) {
    return guardarPropuesta({ editaId: p.id, cliente: p.cliente, entrega: p.entrega, medias: p.medias, peso: p.peso, frio: p.frio || '', cuenta: p.cuenta || '', nota: v, kg: p.kg, origen: p.origen,
      precioMedias: p.precioMedias === 0 || p.precioMedias ? p.precioMedias : '', ivaMedias: p.ivaMedias || '', cortes: clone(cortesDe(p)) });
  }
  function pedidoHTML(p, m, mov) {
    var cs = cortesDe(p).filter(function (c) { return c.texto; }), enP = cs.filter(function (c) { return fechaProdDe(m, p, c); }).length;
    var ab = !!S.abierto[p.id], sel = !!S.sel[p.id], cam = nombreCamion(p.entrega, p.camion), res = [], id = esc(p.id);
    if (+p.medias) res.push(n(+p.medias) + (+p.medias === 1 ? ' media' : ' medias') + (p.peso ? ' ' + esc(p.peso) : ''));
    if (cs.length) res.push(cs.length + (cs.length === 1 ? ' corte' : ' cortes'));
    var h = '<div class="ped' + (ab ? ' abierto' : '') + (sel ? ' sel' : '') + '" data-ped="' + id + '"><div class="ped-cab">'
      + (mov ? '<button class="ped-mover" data-parr="' + id + '" aria-label="Arrastrar a ' + esc(p.cliente) + ' para cambiar el orden de bajada (o usar las flechas del teclado)" title="Arrastrar para ordenar">⠿</button>' : '')
      + '<label class="chk"><input type="checkbox" data-sel="' + id + '"' + (sel ? ' checked' : '') + ' aria-label="Tildar el pedido de ' + esc(p.cliente) + ' para un camión"></label>'
      + '<button class="ped-tit" data-act="ped-abrir" data-id="' + id + '" aria-expanded="' + ab + '"><span class="nom">' + esc(p.cliente || 'Sin cliente') + '</span>' + ctaHTML(cuentaPedido(p), true) + '<span class="res">' + res.join(' · ') + ' ' + frioChipHTML(p) + '</span>'
      + (cam || (VENDEDORES && p.vendedor) ? '<span class="marcas">' + (VENDEDORES && p.vendedor ? '<span class="badge vend" title="' + esc(p.vendedor) + '">Vendedor: ' + esc(p.vendedorNombre || p.vendedor.split('@')[0]) + '</span>' : '') + (cam && !(S.editor && !S.solo) ? '<span class="badge cam-ped">' + esc(cam) + '</span>' : '') + '</span>' : '') + (S.editor && !S.solo ? '<span class="col-cam">' + camChipHTML(p) + sacarCamHTML(p) + '</span>' : '') + '<span class="col-kg">' + kgPedHTML(p) + '</span><span class="col-prod">' + prodBadgeHTML(enP, cs.length) + '</span><span class="chev" aria-hidden="true">' + (ab ? '▴' : '▾') + '</span></button></div>';
    if (S.frioMenu === p.id) h += frioMenuHTML(p);
    if (S.camMenu === p.id) h += camMenuHTML(p);
    if (!ab) return h + '</div>';
    h += '<div class="ped-det">' + elegirCuentaHTML(p) + '<div class="op-ped">';
    if (+p.medias) h += '<p class="lp"><span class="lp-izq"><span class="lc-corte">Medias</span><span class="lc-txt">' + cantHTML(textoMedias(p)) + mediasFaenaHTML(p) + '</span></span><span class="lp-der">' + precioHTML(p.id, 'm', p.precioMedias, 'las medias', p.ivaMedias) + '</span></p>';
    cs.forEach(function (c) {
      var f = fechaProdDe(m, p, c);
      h += '<p class="lp"><span class="lp-izq"><span class="lc-corte">' + esc(c.corte) + '</span><span class="lc-txt">' + cantHTML(sinCliente(c.texto, p.cliente), unidadSelHTML(p.id, c)) + (c.frio && c.frio !== p.frio ? ' ' + frioBadge(c.frio) : '') + '</span></span><span class="lp-der">' + precioHTML(p.id, c.k, c.precio, c.corte, c.iva) + (f
        ? '<span class="en"><span class="badge ok">' + (esC3(f) ? 'En producción · embutidos' : 'En producción') + '</span><button class="btn sm" data-act="c-quitar" data-id="' + id + '" data-k="' + esc(c.k) + '">Quitar</button></span>'
        : '<button class="btn sm pri" data-act="c-sumar" data-id="' + id + '" data-k="' + esc(c.k) + '">' + 'Sumar a producción' + '</button>') + '</span></p>';
    });
    h += '</div>';
    // La nota se escribe ahí mismo, igual que en Logística (pedido de Renzo): se guarda sola al salir o con Enter.
    if (S.editor && !S.solo && (p.nota || S.notaAbierta === p.id)) h += '<textarea class="log-nota log-nota-ed" rows="1" data-nota-ped="' + id + '" placeholder="Escribí la nota…" aria-label="Nota de ' + esc(p.cliente) + '">' + esc(p.nota || '') + '</textarea>' + (p.nota ? '<p class="log-nota solo-print">' + esc(p.nota) + '</p>' : '');
    else if (S.editor && !S.solo) h += '<button class="btn lnk sm log-nota-mas" data-act="nota-abrir" data-id="' + id + '">+ Nota</button>';
    else if (p.nota) h += '<p class="log-nota">' + esc(p.nota) + '</p>';
    h += '<div class="acciones">' + (cs.length - enP > 1 ? '<button class="btn sm" data-act="c-todos" data-id="' + id + '">Sumar todos a producción</button>' : '')
      + '<button class="btn sm" data-act="ped-editar" data-id="' + id + '">Editar</button><button class="btn sm" data-act="ped-dup" data-id="' + id + '" title="Hace otro pedido igual, para cambiarlo antes de guardar">Duplicar</button><button class="btn sm" data-act="ped-txt" data-id="' + id + '" title="Copia el pedido como texto para pegarlo en WhatsApp o en Pegar texto">Copiar texto</button>' + opcionesDia(p)
      + '<button class="btn sm rojo" data-act="ped-borrar" data-id="' + id + '" data-i="' + id + '">' + (S._c2 === 'ped-borrar' + p.id ? 'Tocá de nuevo para confirmar' : 'Quitar') + '</button></div>';
    return h + '</div></div>';
  }
  /* ---------- pedidos de vendedores ----------
     Los vendedores externos cargan desde /vendedor; quedan en "ventas" como pendientes hasta que acá
     se aceptan (pasan a ser un pedido más) o se rechazan. El vendedor ve el estado desde su página. */
  // Filtro por vendedor (S.fv): '' todos, '-' los cargados por Qualitá, o el mail del vendedor.
  // Vendedores: por ahora apagado (lo pidió Renzo). Con true vuelve todo: filtro, recuadro "Pedidos de vendedores", aviso en Inicio y marca en cada pedido.
  var VENDEDORES = false;
  function pasaFiltro(mail) { if (!VENDEDORES) return true;
    return pasaFiltro0(mail); }
  function pasaFiltro0(mail) { return !S.fv || (S.fv === '-' ? !mail : mail === S.fv); }
  function vendedoresConocidos() {
    var vs = {};
    (S.ventas || []).forEach(function (v) { if (v.vendedor) vs[v.vendedor] = nombreVend(v); });
    (S.pedidos || []).forEach(function (p) { if (p.vendedor && !vs[p.vendedor]) vs[p.vendedor] = p.vendedorNombre || p.vendedor.split('@')[0]; });
    return vs;
  }
  function filtroVendHTML() {
    if (!VENDEDORES) return '';
    var vs = vendedoresConocidos(), ks = Object.keys(vs).sort(function (a, b) { return vs[a].localeCompare(vs[b]); });
    if (!ks.length) return '';
    if (S.fv && S.fv !== '-' && !vs[S.fv]) S.fv = '';
    var b = function (v, t) { return '<button class="btn sm chip" data-act="fv" data-v="' + esc(v) + '" aria-pressed="' + ((S.fv || '') === v) + '">' + esc(t) + '</button>'; };
    return '<div class="filtro-vend"><span class="small muted">Vendedor:</span>' + b('', 'Todos') + ks.map(function (k) { return b(k, vs[k]); }).join('') + b('-', 'Sin vendedor') + '</div>';
  }
  function ventasPendientes(todas) { return (S.ventas || []).filter(function (v) { return v.estado === 'pendiente' && (todas || pasaFiltro(v.vendedor)); }).sort(function (a, b) { return String(a.entrega).localeCompare(String(b.entrega)) || (a.ts || 0) - (b.ts || 0); }); }
  // Si el vendedor eligió un producto de la lista, va en el texto con su código, como en los pedidos leídos: "10 CAJAS BONDIOLA – CAJAS X 10 UNID. (ART 101)".
  function textoVenta(c) { return [c.texto, c.producto ? c.producto + (c.art ? ' (ART ' + c.art + ')' : '') : ''].filter(Boolean).join(' '); }
  function nombreVend(v) { return v.nombre || String(v.vendedor || '').split('@')[0]; }
  function ventasHTML() {
    if (!VENDEDORES) return '';
    var l = ventasPendientes();
    if (!l.length) return '';
    var h = '<div class="panel ventas" id="ventas"><h2>Pedidos de vendedores <span class="badge vend">' + l.length + ' para revisar</span></h2>'
      + '<p class="small muted">Al aceptarlo pasa a ser un pedido más del día de entrega, y el vendedor lo ve como aceptado.</p>';
    var conIA = !!(S.ia && S.ia.clave) || !!(window.__mock && window.__mock.ia);
    l.forEach(function (v) {
      if (v.tipo === 'archivo') {
        var vid = esc(v.id), nf = (v.fotos || []).length, gr = !!(S.vgrande || {})[v.id];
        h += '<div class="venta"><div class="venta-cab"><span class="badge vend">Vendedor: ' + esc(nombreVend(v)) + '</span><span class="nom">' + (nf ? (nf === 1 ? 'Foto' : nf + ' fotos') + (v.mensaje ? ' y mensaje' : '') : 'Mensaje') + '</span>'
          + '<span class="small muted">' + (v.creado ? 'Enviado el ' + esc(v.creado) : '') + '</span></div>'
          + (nf ? '<div class="v-fotos' + (gr ? ' grande' : '') + '">' + v.fotos.map(function (b, i) { return '<button class="v-foto" data-act="v-ver" data-id="' + vid + '" aria-label="' + (gr ? 'Achicar' : 'Agrandar') + ' la foto ' + (i + 1) + '"><img src="data:image/jpeg;base64,' + b + '" alt="Foto ' + (i + 1) + ' del pedido"></button>'; }).join('') + '</div>' : '')
          + (v.mensaje ? '<p class="small v-msg">' + esc(v.mensaje) + '</p>' : '')
          + '<div class="acciones"><button class="btn sm pri" data-act="v-leer" data-id="' + vid + '"' + (conIA && !(S.vleyendo || {})[v.id] ? '' : ' disabled') + '>' + ((S.vleyendo || {})[v.id] ? 'Leyendo…' : 'Leer con IA y cargar') + '</button>'
          + '<input type="text" id="v-motivo-' + vid + '" class="v-motivo" value="' + esc((S.vmot || {})[v.id] || '') + '" placeholder="Motivo (si lo rechazás)" aria-label="Motivo del rechazo">'
          + '<button class="btn sm rojo" data-act="v-rechazar" data-id="' + vid + '" data-i="' + vid + '">' + (S._c2 === 'v-rechazar' + v.id ? 'Tocá de nuevo para rechazar' : 'Rechazar') + '</button></div>'
          + (conIA ? '' : '<p class="small muted">Para leerlo hace falta la clave de IA (en Configuración, abajo).</p>') + '</div>';
        return;
      }
      var id = esc(v.id), cs = (v.cortes || []).filter(function (c) { return c.texto || c.corte; }), cta = cuentaDe(v.cliente);
      h += '<div class="venta"><div class="venta-cab"><span class="badge vend">Vendedor: ' + esc(nombreVend(v)) + '</span><span class="nom">' + esc(v.cliente) + '</span>' + ctaHTML(cta, false)
        + (v.frio ? ' ' + frioBadge(v.frio) : '') + '<span class="small muted">Entrega ' + esc(diaCorto(v.entrega)) + (v.creado ? ' · cargado el ' + esc(v.creado) : '') + '</span></div><ul class="venta-det">';
      if (+v.medias) h += '<li><b>Medias</b> ' + n(+v.medias) + (v.peso ? ' · ' + esc(v.peso) : '') + '</li>';
      cs.forEach(function (c) { h += '<li><b>' + esc(c.corte || '') + '</b> ' + esc(textoVenta(c)) + (c.frio && c.frio !== v.frio ? ' ' + frioBadge(c.frio) : '') + '</li>'; });
      h += '</ul>' + (v.nota ? '<p class="small">' + esc(v.nota) + '</p>' : '')
        + '<div class="acciones"><button class="btn sm pri" data-act="v-aceptar" data-id="' + id + '">Aceptar</button>'
        + '<input type="text" id="v-motivo-' + id + '" class="v-motivo" value="' + esc((S.vmot || {})[v.id] || '') + '" placeholder="Motivo (si lo rechazás)" aria-label="Motivo del rechazo">'
        + '<button class="btn sm rojo" data-act="v-rechazar" data-id="' + id + '" data-i="' + id + '">' + (S._c2 === 'v-rechazar' + v.id ? 'Tocá de nuevo para rechazar' : 'Rechazar') + '</button></div></div>';
    });
    return h + '<p class="guardado" id="g-ventas"></p></div>';
  }
  function aceptarVenta(v) {
    var q = { cliente: v.cliente, entrega: v.entrega, medias: v.medias, peso: v.peso, frio: v.frio, nota: v.nota, origen: 'vendedor', vendedor: v.vendedor, vendedorNombre: nombreVend(v),
      cuenta: cuentaDe(v.cliente) || '', cortes: (v.cortes || []).filter(function (c) { return c.texto; }).map(function (c) { return { k: uid(), corte: c.corte, texto: textoVenta(c), frio: c.frio || '', orden: true }; }) };
    q.nuevoId = 'p' + uid();
    return guardarPropuesta(q, true).then(function () {
      var x = clone(v); delete x.id; x.estado = 'aceptado'; x.revisado = ahoraTxt(); x.por = S.user ? S.user.email : ''; x.pedido = q.nuevoId;
      S.ventas = poner(S.ventas, v.id, x); return store.set('ventas', v.id, x);
    });
  }
  // Lee las fotos y el mensaje del vendedor con la IA; los pedidos quedan cargados (o para completar) con su nombre.
  function leerVenta(v) {
    var ctx = ctxCarga(), leidos = [], errores = [], fotos = v.fotos || [], msg = String(v.mensaje || '').trim();
    ctx.vendedor = { email: v.vendedor, nombre: nombreVend(v) };
    S.vleyendo = S.vleyendo || {}; S.vleyendo[v.id] = true; cargas.activas++; estadoCarga();
    var tareas = fotos.length ? fotos.map(function (b, i) { return function () { return leerB64(b, msg).then(function (j) { leidos.push({ j: j, origen: 'vendedor', nombre: 'foto ' + (i + 1) }); }, function (e) { errores.push(e.message); }); }; })
      : [function () { return leerTexto(msg).then(function (j) { leidos.push({ j: j, origen: 'vendedor', nombre: '' }); }, function (e) { errores.push(e.message); }); }];
    return tareas.reduce(function (c, t) { return c.then(t); }, Promise.resolve()).then(function () {
      cargas.activas--; delete S.vleyendo[v.id];
      if (!leidos.length) { S.msg.fotos = '!' + (errores.join(' ') || 'No se pudo leer.'); avisar(S.msg.fotos, 9000); refrescar(); return null; }
      return encolar(ctx, leidos, errores).then(function () {
        var cl = ctx.res || [], x = clone(v); delete x.id;
        x.estado = 'aceptado'; x.leidos = cl.length; x.clientes = cl.filter(Boolean).join(', '); x.revisado = ahoraTxt(); x.por = S.user ? S.user.email : '';
        S.ventas = poner(S.ventas, v.id, x); return store.set('ventas', v.id, x);
      });
    });
  }
  function rechazarVenta(v, motivo) {
    var x = clone(v); delete x.id; x.estado = 'rechazado'; x.motivo = String(motivo || '').trim(); x.revisado = ahoraTxt(); x.por = S.user ? S.user.email : '';
    S.ventas = poner(S.ventas, v.id, x); return store.set('ventas', v.id, x);
  }
  // Texto del resumen para WhatsApp: un bloque por camión, cada cliente en su renglón.
  function resumenTexto(f, ids) {
    var x = String(f).split('-'), cams = camionesDe(f).filter(function (c) { return !ids || ids.indexOf(c.id) >= 0; });
    var peds = ((logDe(f) || {}).pedidos) || [];
    var t = [waSaludo(f), '', '*' + diaDe(f).toUpperCase() + ' ' + x[2] + '-' + x[1] + '-' + x[0].slice(2) + '*'];
    cams.forEach(function (c) {
      var tit = (c.num && nomLimpio(c.nombre) ? 'N° ' + c.num + ' · ' : '') + nomCam(c);
      t.push('', '*' + tit.toUpperCase() + '*' + (c.hora ? ' — ' + c.hora + ' hs' : ''));
      var o = c.orden || [], l = peds.filter(function (p) { return p.camion === c.id; }).sort(function (a, b) { var i = o.indexOf(a.id), j = o.indexOf(b.id); return (i < 0 ? 1e6 : i) - (j < 0 ? 1e6 : j); });
      l.forEach(function (p, i) { t.push((i + 1) + '. ' + (p.cliente || 'Sin cliente') + (+p.medias ? ' ' + n(+p.medias) + '½' : '') + ((p.cortes || []).length ? ' + cortes' : '') + (frioPed(p) === 'CONGELADO' ? ' (congelado)' : '')); });
      if (!l.length) t.push('Sin pedidos');
      if (c.nota) t.push('_' + c.nota + '_');
    });
    // Los que todavía no tienen camión (pedido de Renzo, para ir adelantando): solo si se eligieron ("_sin").
    if (ids && ids.indexOf('_sin') >= 0) {
      var sl = peds.filter(function (p) { return !p.camion; });
      t.push('', '*SIN CAMIÓN TODAVÍA*');
      sl.forEach(function (p, i) { t.push((i + 1) + '. ' + (p.cliente || 'Sin cliente') + (+p.medias ? ' ' + n(+p.medias) + '½' : '') + ((p.cortes || []).length ? ' + cortes' : '') + (frioPed(p) === 'CONGELADO' ? ' (congelado)' : '')); });
      if (!sl.length) t.push('Ninguno');
    }
    t.push('', waDespedida());
    return t.join('\n');
  }
  // Saludo de entrada y de salida del mensaje a los choferes: los que se guardaron en "Saludos" o, si no, unos de base.
  function waSaludo(f) {
    var g = String((S.config || {}).waSaludo || '').trim(); if (g) return g;
    var hr = new Date().getHours(), dd = f === hoy() ? 'de hoy' : f === mas(hoy(), 1) ? 'de mañana' : 'del ' + diaCorto(f).toLowerCase();
    return (hr < 13 ? '¡Buen día' : '¡Buenas tardes') + '! Les paso la carga ' + dd + ':';
  }
  // De lunes a jueves "hasta mañana"; viernes (y fin de semana) "buen fin de semana".
  function waDespedida() { var g = String((S.config || {}).waDespedida || '').trim(), d = new Date().getDay(); return g || 'Cualquier duda me avisan. ' + (d >= 1 && d <= 4 ? '¡Gracias y hasta mañana!' : '¡Gracias y buen fin de semana!'); }
  // El Resumen del día en PDF (los camiones elegidos o todos), con el mismo armado que las demás hojas.
  function resumenDatosPDF(f, ids) {
    var x = String(f).split('-'), cams = camionesDe(f).filter(function (c) { return !ids || ids.indexOf(c.id) >= 0; }), peds = ((logDe(f) || {}).pedidos) || [], R = [];
    cams.forEach(function (c) {
      var tit = (c.num && nomLimpio(c.nombre) ? 'N° ' + c.num + ' · ' : '') + nomCam(c);
      R.push({ tipo: 'tit', trozos: [{ t: '# ' + tit.toUpperCase() }], der: c.hora ? c.hora + ' hs' : '' });
      var o = c.orden || [], l = peds.filter(function (p) { return p.camion === c.id; }).sort(function (a, b) { var i = o.indexOf(a.id), j = o.indexOf(b.id); return (i < 0 ? 1e6 : i) - (j < 0 ? 1e6 : j); });
      var tr = [];
      l.forEach(function (p, i) { if (i) tr.push({ t: '  –  ', gris: true }); tr.push({ t: String(p.cliente || 'Sin cliente').toUpperCase() }); var m = (+p.medias ? ' ' + n(+p.medias) + '½' : '') + ((p.cortes || []).length ? ' +C' : ''); if (m) tr.push({ t: m, b: true }); if (frioPed(p) === 'CONGELADO') tr.push({ t: ' cong.', gris: true }); });
      R.push({ tipo: 'op', trozos: tr.length ? tr : [{ t: 'Sin pedidos', gris: true }] });
      if (c.nota) R.push({ tipo: 'nota', trozos: [{ t: c.nota, gris: true }] });
    });
    return { cab: { sup: 'Resumen del día · Logística', tit: diaDe(f) + ' ' + x[2] + '-' + x[1] + '-' + x[0].slice(2), dato: cams.length + (cams.length === 1 ? ' camión' : ' camiones'), estado: '' }, renglones: R };
  }
  /* PDF del Resumen igual a como se ve/imprime (pedido de Renzo): hoja apaisada, el día arriba resaltado en amarillo
     y los camiones en recuadros de a dos columnas, con el nombre y la hora resaltados y los clientes abajo.
     La letra se achica lo justo para que entre todo en una hoja. */
  function resumenPDF(f, ids) {
    var L = window.PDFLib, x = String(f).split('-'), titulo = diaDe(f) + ' ' + x[2] + '-' + x[1] + '-' + x[0].slice(2);
    var peds = ((logDe(f) || {}).pedidos) || [], cams = camionesDe(f).filter(function (c) { return !ids || ids.indexOf(c.id) >= 0; });
    var bloques = cams.map(function (c) {
      var o = c.orden || [], l = peds.filter(function (p) { return p.camion === c.id; }).sort(function (a, b) { var i = o.indexOf(a.id), j = o.indexOf(b.id); return (i < 0 ? 1e6 : i) - (j < 0 ? 1e6 : j); });
      return { tit: '# ' + ((c.num && nomLimpio(c.nombre) ? 'N° ' + c.num + ' · ' : '') + nomCam(c)).toUpperCase(), hora: c.hora || '', peds: l, nota: c.nota || '' };
    });
    var sueltos = ids && ids.indexOf('_sin') < 0 ? [] : peds.filter(function (p) { return !p.camion; });
    if (sueltos.length) bloques.push({ tit: '# Sin camión', hora: '', peds: sueltos, nota: '' });
    return L.PDFDocument.create().then(function (doc) {
      return Promise.all([doc.embedFont(L.StandardFonts.Helvetica), doc.embedFont(L.StandardFonts.HelveticaBold)]).then(function (fs) {
        var F = fs[0], FB = fs[1], AN = 841.89, AL = 595.28, M = 18, cache = {};
        var negro = L.rgb(0.07, 0.07, 0.07), gris = L.rgb(0.45, 0.47, 0.5), amarillo = L.rgb(0.95, 1, 0.38), borde = L.rgb(0.1, 0.1, 0.1);
        var limpio = function (t) { return Array.from(String(t || '')).map(function (ch) { if (cache[ch] != null) return cache[ch]; var v = ch; try { F.encodeText(ch); } catch (e) { v = ch === '–' ? '-' : '?'; } cache[ch] = v; return v; }).join(''); };
        var ancho = function (fu, t, tam) { return fu.widthOfTextAtSize(t, tam); };
        // Los clientes de un camión como trozos: nombre normal, medias y +C en negrita, "cong." en gris.
        var trozosDe = function (b) {
          var tr = [];
          b.peds.forEach(function (p, i) { if (i) tr.push({ t: ' – ' }); tr.push({ t: String(p.cliente || 'Sin cliente').toUpperCase() }); var m = (+p.medias ? ' ' + n(+p.medias) + '½' : '') + ((p.cortes || []).length ? (+p.medias ? '' : ' ') + '+C' : ''); if (m) tr.push({ t: m, b: true }); if (frioPed(p) === 'CONGELADO') tr.push({ t: ' (cong.)', g: true }); });
          if (!b.peds.length) tr.push({ t: 'Sin pedidos', g: true });
          return tr;
        };
        // Arma los renglones de un recuadro con el ancho dado; devuelve los renglones (cada uno, una lista de palabras con su fuente).
        var renglones = function (tr, w, tam) {
          var out = [[]], xx = 0;
          tr.forEach(function (z) { limpio(z.t).split(/(\s+)/).forEach(function (pal) {
            if (!pal) return; var fu = z.b ? FB : F, esp = /^\s+$/.test(pal), pw = ancho(fu, esp ? ' ' : pal, tam);
            if (esp) { if (xx > 0) { out[out.length - 1].push({ t: ' ', f: fu, w: pw, g: z.g }); xx += pw; } return; }
            if (xx + pw > w && xx > 0) { var u = out[out.length - 1]; while (u.length && u[u.length - 1].t === ' ') u.pop(); out.push([]); xx = 0; }
            out[out.length - 1].push({ t: pal, f: fu, w: pw, g: z.g }); xx += pw;
          }); });
          return out;
        };
        var colW = (AN - 2 * M) / 2, pad = 6;
        var medir = function (tam) {
          var hTit = tam * 1.6, alto = 0, filas = [];
          for (var i = 0; i < bloques.length; i += 2) {
            var par = bloques.slice(i, i + 2).map(function (b) { var r = renglones(trozosDe(b), colW - 2 * pad, tam); return { b: b, r: r, h: pad + hTit + 3 + r.length * tam * 1.3 + (b.nota ? tam * 1.25 : 0) + pad }; });
            var hf = Math.max.apply(null, par.map(function (q) { return q.h; })); filas.push({ par: par, h: hf }); alto += hf;
          }
          return { filas: filas, alto: alto, hTit: hTit };
        };
        var tope = AL - M - 40, tam = 12, med = medir(tam);
        while (med.alto > tope && tam > 5.5) { tam -= 0.25; med = medir(tam); }
        var pag = doc.addPage([AN, AL]), y = AL - M;
        // Título del día, centrado y resaltado.
        var tt = limpio(titulo), tw = ancho(FB, tt, 17);
        pag.drawRectangle({ x: AN / 2 - tw / 2 - 5, y: y - 21, width: tw + 10, height: 22, color: amarillo });
        pag.drawText(tt, { x: AN / 2 - tw / 2, y: y - 16, size: 17, font: FB, color: negro }); y -= 32;
        med.filas.forEach(function (fila) {
          if (y - fila.h < M) { pag = doc.addPage([AN, AL]); y = AL - M; }
          fila.par.forEach(function (q, k) {
            var x0 = M + k * colW, yy = y - pad;
            pag.drawRectangle({ x: x0, y: y - fila.h, width: colW, height: fila.h, borderColor: borde, borderWidth: 0.8 });
            var tit = limpio(q.b.tit), th = q.b.hora ? '  ' + limpio(q.b.hora) : '', tW = ancho(FB, tit, tam * 1.1), hW = th ? ancho(FB, th, tam) : 0;
            pag.drawRectangle({ x: x0 + pad - 2, y: yy - med.hTit + 2, width: Math.min(tW + hW + 6, colW - 2 * pad + 4), height: med.hTit - 1, color: amarillo });
            pag.drawText(tit, { x: x0 + pad, y: yy - tam * 1.15, size: tam * 1.1, font: FB, color: negro });
            if (th) pag.drawText(th, { x: x0 + pad + tW, y: yy - tam * 1.15, size: tam, font: FB, color: negro });
            yy -= med.hTit + 3;
            q.r.forEach(function (ren) { yy -= tam * 1.3; var xx = x0 + pad; ren.forEach(function (w) { if (w.t !== ' ') pag.drawText(w.t, { x: xx, y: yy + tam * 0.3, size: tam, font: w.f, color: w.g ? gris : negro }); xx += w.w; }); });
            if (q.b.nota) { yy -= tam * 1.25; pag.drawText(limpio(q.b.nota), { x: x0 + pad, y: yy + tam * 0.3, size: tam * 0.9, font: F, color: gris }); }
          });
          if (fila.par.length === 1) {}
          y -= fila.h;
        });
        return doc.save();
      });
    });
  }
  /* Teléfono de cada chofer (pedido de Renzo): se carga una vez y el botón WhatsApp de su camión abre directo su chat con el
     mensaje escrito; solo falta apretar Enviar. Quedan en privado/choferes (solo editores; nunca en el link público). */
  // El mismo chofer aunque el camión se escriba distinto: "MAXIMO", "MAXIMO (PRIMER VIAJE)", "MAXIMO 1", "MAXIMO 2DO VIAJE" → MAXIMO.
  function choferKey(nombre) {
    var k = norm(String(nombre || '').replace(/\([^)]*\)/g, ' ')).replace(/[°º.\-]/g, ' ').replace(/\s+/g, ' ').trim();
    var sin = k.replace(/\b(\d+(ER|DO|RO|TO|O)?|PRIMER|PRIMERO|SEGUNDO|TERCER|TERCERO|VIAJE|VIAJES)\b/g, ' ').replace(/\s+/g, ' ').trim();
    return sin || k;
  }
  function telChofer(nombre) { var t = ((S.choferes || {}).tel || {})[choferKey(nombre)]; return t ? String(t) : ''; }
  // A formato internacional de Argentina para WhatsApp: 0351 15 1234567 → 5493511234567.
  function telWA(t) {
    var d = String(t || '').replace(/\D/g, ''); if (!d) return '';
    if (/^549\d{10}$/.test(d)) return d;
    if (/^54\d{10}$/.test(d)) return '549' + d.slice(2);
    d = d.replace(/^0/, '');
    if (d.length === 12 && /^\d{2,4}15/.test(d)) { var m = d.match(/^(\d{2,4})15(\d+)$/); if (m && (m[1] + m[2]).length === 10) d = m[1] + m[2]; }
    return d.length === 10 ? '549' + d : d;
  }
  function compartirWhatsApp(txt, tel) {
    // Sin emojis: al compartir desde Windows llegaban como "?" (y rompían la negrita del nombre del camión).
    txt = String(txt || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ');
    var movil = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
    var nro = telWA(tel);
    if (window.__mock) { window.__mock.compartido = txt; window.__mock.waTel = nro; return; }
    // Con el teléfono del chofer: abre directo su chat con el mensaje escrito (se puede corregir antes de apretar Enviar).
    if (nro) {
      if (movil) { location.href = 'https://wa.me/' + nro + '?text=' + encodeURIComponent(txt); return; }
      location.href = 'whatsapp://send?phone=' + nro + '&text=' + encodeURIComponent(txt); return;
    }
    // Celular: "Compartir" del sistema. Compu: la página de WhatsApp con el mensaje para revisarlo y corregirlo antes de mandar
    // (como le gusta a Renzo), pero siempre en la MISMA pestaña: antes se abría una pestaña nueva por cada envío.
    if (movil && navigator.share) { navigator.share({ text: txt }).then(null, function () {}); return; }
    var w = window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(txt), 'qualita-whatsapp');
    try { if (w) w.focus(); } catch (e) {}
  }
  /* Resumen del día, como la hoja que se arma a mano: un recuadro por camión con su número, nombre y hora,
     y los clientes en el orden de carga ("Aledo 12½ + C" = 12 medias y cortes). */
  function resumenDiaHTML(f, cams, peds) {
    var x = String(f).split('-'), titulo = diaDe(f) + ' ' + x[2] + '-' + x[1] + '-' + x[0].slice(2);
    var cli = function (p) {
      var t = esc(p.cliente || 'Sin cliente');
      if (+p.medias) t += ' <b>' + n(+p.medias) + '½</b>';
      if ((p.cortes || []).length) t += (+p.medias ? '' : ' ') + '<b>+C</b>';
      if (frioPed(p) === 'CONGELADO') t += ' <span class="res-cong">cong.</span>';
      return '<span class="res-cli">' + t + '</span>';
    };
    var ed = S.editor && !S.solo;
    var nSel = cams.filter(function (c) { return (S.resSel || {})[f + '|' + c.id]; }).length + ((S.resSel || {})[f + '|_sin'] ? 1 : 0);   // con camiones tildados se mandan todos juntos en un solo mensaje
    var bloque = function (tit, hora, lista, nota, id) {
      var nomT = String(tit || '').replace(/^N° [^·]*· /, '');
      var fijo = id === '_sin';   // "Sin camión": se puede tildar y compartir, pero no tiene hora ni se arrastra
      var hh = ed && id && !fijo ? ' <input type="time" class="res-hora" data-hora="' + esc(id) + '" value="' + esc(hora || '') + '" aria-label="Hora de salida de ' + esc(tit) + '">' + (hora ? '<span class="solo-print">' + esc(hora) + ' hs</span>' : '') : hora ? ' ' + esc(hora) + ' hs' : '';
      return '<div class="res-cam' + (ed && id && !fijo ? ' movible' : '') + '"' + (id && !fijo ? ' data-cam="' + esc(id) + '"' : '') + '><p class="res-tit">' + (ed && id && !fijo ? '<button class="res-mover" data-arr="' + esc(id) + '" aria-label="Arrastrar para cambiar el orden de ' + esc(tit) + ' (o usar las flechas del teclado)" title="Arrastrar para ordenar">⠿</button>' : '') + (id ? '<label class="res-sel" title="Elegir para compartir"><input type="checkbox" data-res-sel="' + esc(id) + '"' + ((S.resSel || {})[f + '|' + id] ? ' checked' : '') + ' aria-label="Elegir ' + esc(tit) + ' para compartir"></label>' : '') + '<mark># ' + esc(tit) + hh + '</mark>' + (id && !nSel ? '<button class="btn sm wa res-wa-uno" data-act="res-wa" data-f="' + esc(f) + '" data-cual="' + esc(id) + '" title="' + (telChofer(nomT) ? 'Abre el chat de ' + esc(choferKey(nomT)) + ' con el mensaje escrito' : 'Mandar solo este camión por WhatsApp') + '">' + (telChofer(nomT) ? 'WhatsApp a ' + esc(choferKey(nomT)) : 'WhatsApp') + '</button>' : '') + '</p>'
        + '<p class="res-lista">' + (lista.length ? lista.map(cli).join(' – ') : '<span class="muted">Sin pedidos</span>') + '</p>'
        + (nota ? '<p class="res-nota">' + esc(nota) + '</p>' : '') + '</div>';
    };
    var comp = cams.length ? '<div class="res-comp"><span class="small muted">Compartir por WhatsApp:</span><button class="btn sm wa" data-act="res-wa" data-f="' + esc(f) + '" data-cual="sel"' + (nSel ? '' : ' disabled') + '>' + (nSel > 1 ? 'Mandar los ' + nSel + ' juntos' : nSel ? 'Mandar el elegido' : 'Los elegidos') + '</button><button class="btn sm wa" data-act="res-wa" data-f="' + esc(f) + '" data-cual="todos">Todos</button><button class="btn sm wa res-pdf" data-act="res-pdf" data-f="' + esc(f) + '">PDF por WhatsApp' + (nSel ? ' (' + nSel + ')' : '') + '</button>' + (nSel ? '<button class="btn sm lnk" data-act="res-sel-nada" data-f="' + esc(f) + '">Destildar</button>' : '') + (ed ? '<button class="btn sm lnk" data-act="res-saludos">' + (S.resSaludos ? 'Cerrar saludos' : '✎ Saludos') + '</button><button class="btn sm lnk" data-act="res-tels">' + (S.resTels ? 'Cerrar teléfonos' : '☎ Teléfonos de choferes') + '</button>' : '') + '<span class="small muted">' + (nSel ? 'Van todos en un solo mensaje, al WhatsApp que elijas.' : 'Tildá ☐ los camiones que quieras mandar juntos al mismo WhatsApp.') + '</span></div>'
      + (ed && S.resSaludos ? '<div class="res-saludos"><label class="campo"><span>Saludo de entrada</span><textarea id="wa-saludo" rows="2" placeholder="' + esc(waSaludo(f)) + '">' + esc((S.config || {}).waSaludo || '') + '</textarea></label><label class="campo"><span>Saludo de salida</span><textarea id="wa-despedida" rows="2" placeholder="' + esc(waDespedida()) + '">' + esc((S.config || {}).waDespedida || '') + '</textarea></label><p class="small muted">Si los dejás vacíos se usan los de base (el de entrada cambia solo según la hora: buen día o buenas tardes; el de salida, hasta mañana o buen fin de semana si es viernes). Se guardan solos.</p></div>' : '') : '';
    if (ed && S.resTels && cams.length) {
      var ks = []; cams.forEach(function (c) { var k = choferKey(nomCam(c)); if (k && ks.indexOf(k) < 0) ks.push(k); });
      comp += '<div class="res-tels"><p class="small muted">Cargá el celular de cada chofer una sola vez (con característica, ej.: 351 1234567). El botón WhatsApp de su camión abre directo su chat con el mensaje escrito: solo apretás Enviar. Se guardan solos y no se ven en el link para compartir.</p><div class="res-tels-l">'
        + ks.map(function (k) { return '<label class="campo"><span>' + esc(k) + '</span><input type="tel" inputmode="tel" data-tel="' + esc(k) + '" value="' + esc(((S.choferes || {}).tel || {})[k] || '') + '" placeholder="Celular" autocomplete="off"></label>'; }).join('') + '</div></div>';
    }
    var h = '<div class="resumen-dia">' + comp + '<h2 class="res-dia"><mark>' + esc(titulo) + '</mark></h2>' + (ed && cams.length > 1 ? '<p class="small muted res-ayuda">Arrastrá cada camión desde ⠿ para ordenarlos (queda igual en "Ver por camión"). La hora se cambia tocándola.</p>' : '') + '<div class="res-grilla">';
    cams.forEach(function (c) {
      var tit = (c.num && nomLimpio(c.nombre) ? 'N° ' + c.num + ' · ' : '') + nomCam(c);
      h += bloque(tit, c.hora, peds.filter(function (p) { return p.camion === c.id; }), c.nota, c.id);
    });
    var sueltos = peds.filter(function (p) { return !p.camion; });
    if (sueltos.length) h += bloque('Sin camión', '', sueltos, '');
    return h + '</div></div>';
  }
  // Cuándo se cargó un pedido (para mostrar arriba los últimos): el campo "alta" o, en los viejos, la hora que va en su id.
  function altaDe(p) { if (+p.alta > 0) return +p.alta; var mm = /^[a-z]([0-9a-z]{8})/.exec(String(p.id || '')), t = mm ? parseInt(mm[1], 36) : 0; return t > 1.6e12 && t < 4e12 ? t : 0; }
  function ultimosArriba(l) { return l.map(function (p, i) { return [p, i]; }).sort(function (a, b) { return altaDe(b[0]) - altaDe(a[0]) || a[1] - b[1]; }).map(function (x) { return x[0]; }); }
  // Pedidos del día agrupados: primero los que no tienen camión (los últimos cargados arriba), después cada camión en su orden.
  function pedidosAgrupadosHTML(f, lista, m) {
    var cams = camionesDe(f), hay = {}; cams.forEach(function (c) { hay[c.id] = c; });
    if (!cams.length) return '<div class="peds">' + ultimosArriba(lista).map(function (p) { return pedidoHTML(p, m); }).join('') + '</div>';
    var grupo = function (tit, extra, l, cls, camId, tot) { return '<div class="grupo-cam' + (cls ? ' ' + cls : '') + '" data-gcam="' + esc(camId || '') + '"><h3 class="grupo-tit">' + tit + ' <span class="small muted">' + esc(extra) + '</span>' + (tot || '') + '</h3><div class="peds">' + l.map(function (p) { return pedidoHTML(p, m, true); }).join('') + '</div></div>'; };
    var h = '', sin = ultimosArriba(lista.filter(function (p) { return !(p.camion && hay[p.camion]); }));
    if (sin.length) h += grupo('Sin camión', resumenLog(sin), sin, 'sin-cam', '');
    cams.forEach(function (c) {
      var o = c.orden || [], l = lista.filter(function (p) { return p.camion === c.id; }).sort(function (a, b) { var i = o.indexOf(a.id), j = o.indexOf(b.id); return (i < 0 ? 1e6 : i) - (j < 0 ? 1e6 : j); });
      var kgT = 0, faltaT = false; l.forEach(function (p) { var k = kgPedido(p); kgT += k.kg; if (k.falta) faltaT = true; });
      var pasa = +c.kg > 0 && kgT > +c.kg;
      var tot = l.length ? '<span class="grupo-kg' + (pasa ? ' pasa' : '') + '" title="Kilos que lleva el camión' + (faltaT ? ' (hay renglones sin peso)' : '') + '">≈ ' + n(Math.round(kgT)) + ' kg' + (+c.kg > 0 ? ' <small>de ' + n(+c.kg) + '</small>' : '') + (faltaT ? ' <small>+ sin peso</small>' : '') + '</span>' : '';
      // El horario se pone o se cambia ahí mismo (se guarda al salir del recuadro o con Enter).
      var horaH = S.editor && !S.solo ? (c.hora || S.horaAbierta === c.id ? ' <input type="time" class="cam-hora cam-hora-in" data-hora-cam="' + esc(c.id) + '" value="' + esc(c.hora || '') + '" aria-label="Horario de salida de ' + esc(nomCam(c)) + '" title="Tocá para cambiar el horario">' : ' <button class="btn sm cam-hora-mas" data-act="hora-abrir" data-id="' + esc(c.id) + '">+ Horario</button>') : (c.hora ? ' <span class="cam-hora">' + esc(c.hora) + ' hs</span>' : '');
      h += grupo('<span class="badge cam-ped">' + esc(nomCam(c)) + '</span>' + horaH, l.length ? resumenLog(l) : 'vacío: arrastrá clientes acá', l, l.length ? '' : 'vacio', c.id, tot);
    });
    return '<p class="small muted arr-tip">Arrastrá cada cliente desde ⠿ para ordenar la bajada de cada camión (el primero baja primero) o para pasarlo a otro camión.</p>' + h;
  }
  // Buscador: en todos los pedidos (desde la semana pasada), por cliente o N° de cuenta.
  function buscarPedidosHTML(q) {
    var t = norm(q).trim(), desde = mas(hoy(), -7);
    var l = (S.pedidos || []).filter(function (p) { return p.entrega >= desde && (norm(p.cliente).indexOf(t) >= 0 || (cuentaPedido(p) && String(cuentaPedido(p)).indexOf(t) === 0)); })
      .sort(function (a, b) { return String(a.entrega).localeCompare(String(b.entrega)) || String(a.cliente).localeCompare(String(b.cliente)); });
    if (!l.length) return '<p class="muted sin">No hay pedidos de "' + esc(q) + '" desde el ' + esc(diaCorto(desde)) + '.</p>';
    return '<p class="small muted">' + l.length + (l.length === 1 ? ' pedido encontrado' : ' pedidos encontrados') + ':</p><div class="busq">' + l.map(function (p) {
      var cam = nombreCamion(p.entrega, p.camion), res = [];
      if (+p.medias) res.push(n(+p.medias) + ' medias'); if ((p.cortes || []).length) res.push(p.cortes.length + ((p.cortes.length === 1) ? ' corte' : ' cortes'));
      return '<div class="busq-f ir" data-act="busq-ver" data-id="' + esc(p.id) + '" role="button" tabindex="0" title="Tocá para ir a ese día"><span class="busq-dia">' + esc(diaCorto(p.entrega)) + '</span><span class="nom">' + esc(p.cliente) + '</span>' + ctaHTML(cuentaPedido(p)) + '<span class="small muted">' + res.join(' · ') + '</span>'
        + (cam ? '<span class="badge cam-ped">' + esc(cam) + '</span>' : '<span class="badge warn">Sin camión</span>')
        + '<span class="busq-ir" aria-hidden="true">›</span></div>';
    }).join('') + '</div>';
  }
  // Buscador de camiones: los camiones que ya tienen clientes (desde la semana pasada), por nombre o N°.
  /* Historial completo para las búsquedas (pedido de Renzo: "todos los viajes desde un principio"). La app escucha solo
     los últimos 45 días; al buscar se leen una sola vez los días más viejos (S.logHist) y se suman. */
  function cargarLogHist() {
    if (S.logHist || S.logHistCargando || !store || !store.rango) return;
    S.logHistCargando = true;
    store.rango('config', 'log-', 'log-' + mas(hoy(), -45)).then(function (l) {
      var o = {}; l.forEach(function (d) { var f = String(d.id).slice(4); if (/^\d{4}-\d{2}-\d{2}$/.test(f)) o[f] = d; });
      S.logHist = o; S.logHistCargando = false; if (!ocupado()) render();
    }, function () { S.logHistCargando = false; S.logHist = {}; });
  }
  function logsTodos() { var o = {}; Object.keys(S.logHist || {}).forEach(function (f) { o[f] = S.logHist[f]; }); Object.keys(S.log || {}).forEach(function (f) { o[f] = S.log[f]; }); return o; }
  function busqPie(n0) { return S.logHistCargando ? '<p class="small muted">Buscando también en los días más viejos…</p>' : ''; }
  // Los viajes de un camión que coincide con lo buscado, de todos los días (lo más nuevo arriba).
  function viajesDeCamion(t, soloConCamion) {
    var todos = logsTodos(), l = [];
    cargarLogHist();
    Object.keys(todos).sort().reverse().forEach(function (f) {
      var lg = todos[f], cams = (lg && lg.camiones) || [], pubs = ((lg && lg.pedidos) || []).filter(function (p) { return !soloConCamion || p.camion; });
      cams.forEach(function (c) {
        if (norm(nomCam(c)).indexOf(t) < 0 && norm(c.nombre || '').indexOf(t) < 0 && String(c.num || '').indexOf(t) !== 0) return;
        var o = c.orden || [], ps = pubs.filter(function (p) { return p.camion === c.id; });
        if (!ps.length && S.editor) ps = (S.pedidos || []).filter(function (p) { return p.entrega === f && p.camion === c.id; });
        ps = ps.slice().sort(function (a, b) { var i = o.indexOf(a.id), j = o.indexOf(b.id); return (i < 0 ? 1e6 : i) - (j < 0 ? 1e6 : j); });
        if (ps.length) l.push({ f: f, c: c, ps: ps });
      });
    });
    return l;
  }
  function buscarCamionesHTML(q) {
    var t = norm(q).trim(), l = viajesDeCamion(t);
    if (!l.length) return '<p class="muted sin">No hay camiones con clientes que se llamen "' + esc(q) + '".</p>' + busqPie();
    return '<p class="small muted">' + l.length + (l.length === 1 ? ' viaje encontrado' : ' viajes encontrados') + ' (del más nuevo al más viejo):</p>' + busqPie() + '<div class="busq">' + l.map(function (x) {
      var kg = x.ps.reduce(function (t, p) { return t + (+p.kg || kgPedido(p).kg || 0); }, 0);
      return '<div class="busq-f busq-cam ir" data-act="busq-cam" data-f="' + esc(x.f) + '" data-cam="' + esc(x.c.id) + '" role="button" tabindex="0" title="Tocá para ir a ese día"><span class="busq-dia">' + esc(diaCorto(x.f)) + '</span><span class="badge cam-ped">' + esc(nomCam(x.c)) + '</span>' + (x.c.hora ? '<span class="cam-hora">' + esc(x.c.hora) + ' hs</span>' : '')
        + '<span class="small muted">' + x.ps.length + (x.ps.length === 1 ? ' cliente' : ' clientes') + (kg ? ' · ≈ ' + n(Math.round(kg)) + ' kg' : '') + '</span>'
        + '<span class="busq-ir" aria-hidden="true">›</span>'
        + '<span class="busq-clis">' + x.ps.map(function (p, i) { return '<span>' + (i + 1) + '. ' + esc(p.cliente) + '</span>'; }).join('') + '</span></div>';
    }).join('') + '</div>';
  }
  // Barra para mandar los pedidos tildados a un camión.
  function barraCamionHTML(f, tild) {
    var cams = camionesDe(f), lg = logDe(f), pubs = (lg && lg.pedidos) || [], fl = flota();
    var pesoT = tild.reduce(function (t, p) { return t + kgPedido(p).kg; }, 0);
    var libres = fl.filter(function (c) { return !cams.some(function (d) { return d.id === 'f' + c.id; }); }), escribir = S.camOtro || (!cams.length && !fl.length);
    var h = '<div class="cam-barra"><strong>' + tild.length + (tild.length === 1 ? ' tildado' : ' tildados') + ' · ≈ ' + n(pesoT) + ' kg</strong>';
    if (cams.length || fl.length) h += '<select id="cam-a" aria-label="Elegir el camión"><option value="">Elegí el camión…</option>'
      + cams.map(function (c) { var t = capTxt(c, cargaDe(pubs, c.id)); return '<option value="d:' + esc(c.id) + '">' + esc(nomCam(c)) + (t ? ' — ' + esc(t) : '') + '</option>'; }).join('')
      + libres.map(function (c) { return '<option value="f:' + esc(c.id) + '">' + esc(nomLimpio(c.nombre)) + (+c.kg ? ' — ' + n(+c.kg) + ' kg libres' : '') + '</option>'; }).join('')
      + '<option value="nuevo">Otro camión…</option></select>';
    // Sin N°: el orden de los camiones lo da la numeración de Logística (1, 2, 3…).
    if (escribir) h += '<input type="text" id="cam-nombre" value="' + esc(S.camNombre || '') + '" placeholder="Nombre del camión" aria-label="Nombre del camión">'
      + '<input type="number" inputmode="numeric" id="cam-kg" class="n" value="' + esc(S.camKg || '') + '" placeholder="Capacidad kg" aria-label="Capacidad en kilos">'
      + '<input type="text" id="cam-nota" value="' + esc(S.camNota || '') + '" placeholder="Nota" aria-label="Nota del camión">'
      + '<button class="btn pri" data-act="cam-crear">Armar camión</button>';
    var ops = [], fd = hoy(); if (!esHabil(fd)) fd = habilSiguiente(fd);
    while (ops.length < 8) { if (fd !== f) ops.push(fd); fd = habilSiguiente(fd); }
    var mover = '<select id="sel-mover" aria-label="Pasar los tildados a otro día"><option value="">Pasar a otro día…</option>'
      + ops.map(function (x) { return '<option value="' + x + '">' + esc(diaCorto(x)) + (x === hoy() ? ' (hoy)' : x === mas(hoy(), 1) ? ' (mañana)' : '') + '</option>'; }).join('')
      + '<option value="otra">Otra fecha…</option></select>' + (S.selOtra ? '<input type="date" id="sel-mover-otra" aria-label="Otra fecha para los tildados">' : '');
    return h + (tild.some(function (p) { return p.camion; }) ? '<button class="btn" data-act="cam-sacar">Sacar del camión</button>' : '')
      + '<span class="barra-sep"></span>' + mover + botonBorrar('sel-borrar', null, 'Borrar tildados', '')
      + '<button class="btn lnk" data-act="sel-nada">Destildar</button></div>';
  }
  function renderPedidos() {
    if (S.tab !== 'pedidos') { if (S.tab === 'logistica' && S.msg.fotos) { avisar(S.msg.fotos, 6000); S.msg.fotos = ''; } return render(); }
    var el = $('view-pedidos');
    if (!S.editor) { el.innerHTML = '<div class="panel"><p class="state">Para cargar pedidos hay que ingresar con una cuenta autorizada.</p></div>'; return; }
    var h = '<datalist id="dl-clientes">' + clientes().map(function (x) { return '<option value="' + esc(String(x.n || '').toUpperCase()) + '">' + esc(x.c ? 'N° ' + x.c : '') + '</option>'; }).join('') + '</datalist>'
      + '<div class="panel carga"><h2>Cargar pedidos</h2>' + cargaHTML('q-nuevo');
    var nuevas = S.prop.filter(function (x) { return !x.editaId; });
    if (nuevas.length) h += S.prop.map(function (q, i) { return q.editaId ? '' : propHTML(q, i); }).join('') + (nuevas.length > 1 ? '<div class="acciones"><button class="btn pri" data-act="q-todos">Guardar todos</button>' + botonBorrar('q-descartar-todos', null, 'Descartar todos', '') + '</div>' : '');
    h += '</div>' + filtroVendHTML() + ventasHTML();

    S.prop.forEach(function (q, k) { if (q.editaId) h += '<div class="panel"><h3>Editando: ' + esc(q.cliente || 'pedido') + '</h3>' + propHTML(q, k) + '</div>'; });

    // Un día por vez: arranca en mañana (el próximo día hábil) y se puede ir a otros con las flechas.
    var hy = hoy(), m = enProduccion();
    if (S.pedDia) { S.pd = S.pedDia; S.pedDia = null; }
    if (!S.pd) S.pd = habilSiguiente(hy);
    var f = S.pd, lista = (S.pedidos || []).filter(function (p) { return p.entrega === f && pasaFiltro(p.vendedor); }), tild = S.selDia === f ? lista.filter(function (p) { return S.sel[p.id]; }) : [];
    h += '<section class="dia-ped" id="dia-' + f + '"><div class="nav nav-ped"><button class="btn step" data-act="pd" data-d="-1" aria-label="Día anterior">‹</button>'
      + '<span class="tit">' + fechaTit(f) + (f === hy ? ' <span class="tag">hoy</span>' : f === mas(hy, 1) ? ' <span class="tag">mañana</span>' : '') + '</span>'
      + '<button class="btn step" data-act="pd" data-d="1" aria-label="Día siguiente">›</button><input type="date" id="pd-fecha" value="' + esc(f) + '" aria-label="Ir a una fecha">'
      + (f !== habilSiguiente(hy) ? '<button class="btn" data-act="pd-ir" data-f="' + habilSiguiente(hy) + '">Volver a mañana</button>' : '')
      + (lista.length ? botonBorrar('ped-borrar-todos', f, 'Eliminar todos los pedidos') : '') + '</div>'
      + '<div class="pd-busca"><input type="search" id="pd-buscar" value="' + esc(S.pdBuscar || '') + '" placeholder="Buscar cliente" aria-label="Buscar un cliente en los pedidos (en todos los días)" autocomplete="off">'
      + '<input type="search" id="pd-cam-buscar" value="' + esc(S.camBuscar || '') + '" placeholder="Buscar camión" aria-label="Buscar un camión en los pedidos" autocomplete="off">'
      + (S.pdBuscar || S.camBuscar ? '<button class="btn sm" data-act="busq-limpiar">Borrar búsqueda</button>' : '') + '</div>';
    if (String(S.pdBuscar || '').trim()) { h += buscarPedidosHTML(S.pdBuscar) + '</section>'; }
    else if (String(S.camBuscar || '').trim()) { h += buscarCamionesHTML(S.camBuscar) + '</section>'; }
    else {
    // Aviso de los otros días que tienen pedidos cargados, para no perderlos de vista.
    var otros = {}; (S.pedidos || []).forEach(function (p) { if (p.entrega && p.entrega !== f && p.entrega >= hy && pasaFiltro(p.vendedor)) otros[p.entrega] = (otros[p.entrega] || 0) + 1; });
    var ko = Object.keys(otros).sort();
    if (ko.length) h += '<p class="otros-dias"><span class="small muted">Otros días con pedidos:</span>' + ko.map(function (d) { return '<button class="btn sm" data-act="pd-ir" data-f="' + d + '">' + esc(diaCorto(d)) + ' <b>' + otros[d] + '</b></button>'; }).join('') + '</p>';
    h += deshacerHTML();
    if (tild.length) h += barraCamionHTML(f, tild);
    h += lista.length ? pedidosAgrupadosHTML(f, lista, m) : '<p class="muted sin">Sin pedidos para este día.</p>';
    h += '</section>';
    }

    h += papeleraHTML();
    h += '<div class="panel"><details' + (S._conf ? ' open' : '') + '><summary>Configuración</summary>'
      + '<div class="imp-cfg">' + (esCelu() ? '' : '<label class="chk"><input type="checkbox" data-act="imp-esta"' + (esImpresora() ? ' checked' : '') + '> <b>Esta compu imprime lo que mande desde el celular</b></label>')
      + (esImpresora() ? ' <label class="campo" style="display:inline-flex;max-width:260px"><span>Nombre de esta compu</span><input type="text" id="imp-nombre" value="' + esc(nombreImpresora()) + '"></label>' : '')
      + '<p class="small"><b>Estado:</b> ' + impEstadoTxt() + '</p>'
      + '<p class="small"><b>PIN de esta compu:</b> ' + (pinGuardado() ? 'puesto. La app se bloquea al abrirla y después de ' + PIN_MIN + ' min sin uso. <button class="btn sm" data-act="pin-bloquear">Bloquear ahora</button> <button class="btn sm lnk" data-act="pin-sacar">Sacar el PIN</button>' : 'sin PIN. <label class="campo" style="display:inline-flex;max-width:200px"><span>Nuevo PIN (4 a 8 números)</span><input type="password" inputmode="numeric" id="pin-nuevo" maxlength="8" autocomplete="new-password"></label> <button class="btn sm" data-act="pin-poner">Poner PIN</button>') + '</p>'
      + '<p class="small muted">Marcalo en la compu que tiene la impresora y dejá la app abierta. En el celular aparece "Imprimir en la compu" al lado de Imprimir. Para que salga sin el cartel de imprimir, abrí Chrome en esa compu con la opción --kiosk-printing.</p></div><div class="campos">'
      + '<label class="campo"><span>Clave de IA (Anthropic)</span><input type="password" id="cfg-clave" autocomplete="off" placeholder="' + (S.ia && S.ia.clave ? 'Cargada. Escribí otra para cambiarla.' : 'sk-ant-…') + '"></label>'
      + '<label class="campo"><span>Desposte habitual (medias por día)</span><input type="number" inputmode="numeric" id="cfg-desposte" value="' + esc(S.config.desposteHabitual || 750) + '"></label>'
      + '<label class="campo"><span>Capacidad de cámaras (medias)</span><input type="number" inputmode="numeric" id="cfg-cap" value="' + esc(S.config.capacidadCamara || '') + '"></label></div>'
      + '<div class="acciones"><button class="btn" data-act="cfg-guardar">Guardar configuración</button><span class="guardado" id="g-cfg"></span>'
      + ((S.pedidos || []).length ? botonBorrar('ped-borrar-total', null, 'Quitar todos los pedidos (' + S.pedidos.length + ')') : '') + '</div></details></div>';
    el.innerHTML = h;
    pintarMsg('fotos'); pintarMsg('cfg'); pintarMsg('ventas');
  }

  /* ---------- logística ---------- */
  // Lista para pasar un pedido a un camión: los del día y los del stock que todavía no se usaron.
  function opcionesCamion(p, cams) {
    var libres = flota().filter(function (c) { return !cams.some(function (d) { return d.id === 'f' + c.id; }); });
    if (!cams.length && !libres.length) return '';
    return '<select data-pasar="' + esc(p.id) + '" aria-label="Pasar ' + esc(p.cliente) + ' a un camión"><option value="">Pasar a un camión…</option>'
      + cams.map(function (c) { return '<option value="d:' + esc(c.id) + '">' + esc(nomCam(c)) + '</option>'; }).join('')
      + libres.map(function (c) { return '<option value="f:' + esc(c.id) + '">' + esc(nomLimpio(c.nombre)) + (+c.kg ? ' (' + n(+c.kg) + ' kg)' : '') + '</option>'; }).join('') + '</select>';
  }
  // Stock de camiones: los disponibles, con su capacidad y cuánto llevan cargado ese día.
  function stockCamionesHTML(f, peds, cams) {
    var fl = flota(), ed = S.editor && S.ef, h = '<div class="panel"><div class="cam-cab"><h2>Stock de camiones</h2><span class="small muted">' + (fl.length ? fl.length + (fl.length === 1 ? ' camión disponible' : ' camiones disponibles') : 'sin camiones cargados') + '</span>'
      + (S.editor ? '<span class="log-acc"><span class="guardado" id="g-flota"></span><button class="btn sm' + (ed ? ' pri' : '') + '" data-act="fl-editar">' + (ed ? 'Listo' : 'Editar') + '</button></span>' : '') + '</div>';
    if (ed) {
      h += '<table class="pl stk-cam"><thead><tr><th>Camión</th><th>Capacidad kg</th><th>Nota</th><th></th></tr></thead><tbody>' + fl.map(function (c, i) {
        return '<tr><td><input type="text" id="fl' + i + 'nombre" data-fl="' + i + '" data-k="nombre" value="' + esc(c.nombre || '') + '" aria-label="Nombre del camión"></td>'
          + '<td><input type="number" inputmode="numeric" class="n" id="fl' + i + 'kg" data-fl="' + i + '" data-k="kg" value="' + esc(c.kg || '') + '" aria-label="Capacidad en kilos"></td>'
          + '<td><input type="text" id="fl' + i + 'nota" data-fl="' + i + '" data-k="nota" value="' + esc(c.nota || '') + '" placeholder="Patente, chofer…" aria-label="Nota"></td>'
          + '<td class="xq"><button class="btn x" data-act="fl-quitar" data-i="' + i + '" aria-label="Quitar camión">×</button></td></tr>';
      }).join('') + '</tbody></table><div class="acciones"><button class="btn sm" data-act="fl-agregar">+ Camión</button></div>'
        + '<div class="campos"><label class="campo"><span>Peso estimado de una media (kg)</span><input type="number" inputmode="numeric" id="cfg-kgmedia" value="' + esc(kgMedia()) + '"></label>'
        + '<label class="campo"><span>Peso estimado de una caja (kg)</span><input type="number" inputmode="numeric" id="cfg-kgcaja" value="' + esc(kgCaja()) + '"></label></div>'
        + '<label class="campo kg-und"><span>Peso por unidad (un producto por renglón: PRODUCTO = KG). Un pedido en unidades se pasa a kilos con esto.</span><textarea id="cfg-kgund" rows="8">' + esc(kgUnidadesLista().map(function (x) { return x[0] + ' = ' + String(x[1]).replace('.', ','); }).join('\n')) + '</textarea></label>'
        ;
      return h + '</div>';
    }
    if (!fl.length) return h + '<p class="muted">Sin camiones cargados.</p></div>';
    h += '<table class="pl stk-cam"><thead><tr><th>Camión</th><th>Capacidad</th><th>Cargado</th><th>Queda</th></tr></thead><tbody>' + fl.map(function (c) {
      var dia = cams.filter(function (d) { return d.id === 'f' + c.id; })[0], cap = dia && +dia.kg ? +dia.kg : +c.kg || 0, car = dia ? cargaDe(peds, dia.id) : 0, libre = cap - car;
      return '<tr><td>' + esc(nomLimpio(c.nombre)) + (c.nota ? ' <span class="small muted" style="text-transform:none;font-weight:400">' + esc(c.nota) + '</span>' : '') + '</td><td>' + (cap ? n(cap) : '—') + '</td><td>' + (car ? n(car) : '') + '</td><td' + (cap && libre < 0 ? ' class="neg"' : '') + '>' + (cap ? n(libre) : '—') + '</td></tr>';
    }).join('') + '</tbody></table>';
    return h + '</div>';
  }
  // Cantidad al principio del renglón ("20 KG", "6 CAJAS", "100 MEDIAS"), para resaltarla. Con selector de unidad, va en su lugar.
  var RE_CANT = /^\s*([\d.,½]+)\s*((?:KGS?|KILOS?|K|CAJAS?|CJS?|UND|UNIDAD(?:ES)?|UNID|U|MEDIAS?|CANASTOS?|CANASTAS?|BINES?)\.?(?:\s+(?:DE|X)\s*[\d.,]+\s*(?:KGS?|KILOS?)\.?)?)?(?=\s|$)/i;
  function cantHTML(t, sel) {
    var s = String(t || ''), m = s.match(RE_CANT); if (!m) return esc(s);
    var resto = s.slice(m[0].length).trim(), pal = (m[2] || '').trim();
    var cant = sel && !/^MEDIA|^CANAST/i.test(pal) ? esc(m[1]) + ' ' + sel + (pal ? '<span class="solo-print">' + esc(pal) + '</span>' : '') : esc(m[1] + (pal ? ' ' + pal : ''));
    return '<b class="lc-cant">' + cant + '</b>' + (resto ? ' ' + esc(resto) : '');
  }
  // Un cliente dentro del camión: su lugar bien grande, el nombre y los cortes en columnas; cada cliente en su recuadro.
  function logPedidoHTML(p, cam, cams, pos, total) {
    var id = esc(p.id), filas = (p.cortes || []).map(function (c) { return { corte: c.corte, texto: sinCliente(c.texto, p.cliente), precio: precioTxt(c.precio, c.iva, tasaIva(c)), uni: S.editor && !S.solo ? unidadSelHTML(p.id, c) : '', k: c.k, v: c.precio, iv: c.iva, tasa: tasaIva(c) }; });
    if (+p.medias) filas.unshift({ corte: 'MEDIAS', texto: textoMedias(p), precio: precioTxt(p.precioMedias, p.ivaMedias), k: 'm', v: p.precioMedias, iv: p.ivaMedias });
    var edPre = S.editor && !S.solo && pedidoDe(p.id);
    var num = cam && pos != null;
    var h = '<div class="log-ped' + (num ? '' : ' sin-num') + '" data-lp="' + id + '">' + (num ? (S.editor && !S.solo && total > 1 ? '<span class="log-num log-num-sel"><select data-pos-ped="' + id + '" data-cam="' + esc(cam.id) + '" aria-label="Lugar de ' + esc(p.cliente) + ' en el camión (elegí el número)">' + (function () { var o = ''; for (var i = 0; i < total; i++) o += '<option value="' + i + '"' + (i === pos ? ' selected' : '') + '>' + (i + 1) + '</option>'; return o; })() + '</select><span class="solo-print">' + (pos + 1) + '</span></span>' : '<span class="log-num" aria-label="Lugar ' + (pos + 1) + '">' + (pos + 1) + '</span>') : '') + '<div class="log-body"><div class="log-cab">'
      + (S.editor && !S.solo && pedidoDe(p.id) ? '<label class="chk log-chk"><input type="checkbox" data-sel="' + id + '"' + (S.sel[p.id] && S.selDia === S.fl ? ' checked' : '') + ' aria-label="Tildar a ' + esc(p.cliente) + ' para un camión"></label>' : '')
      + '<strong>' + esc(p.cliente || 'Sin cliente') + '</strong>' + ctaHTML(p.cuenta) + frioBadge(frioPed(p))
      + '<span class="small muted">' + esc(kgTxt({ kg: +p.kg || 0, falta: p.kgFalta, manual: p.kgManual })) + '</span>';
    var ke = -1; if (S.editor) (S.prop || []).forEach(function (x, i) { if (x.editaId === p.id) ke = i; });
    if (S.editor) h += '<span class="log-acc">' + (cam
      ? menuHTML('lp-' + p.id, '⋯', (total > 1 ? '<button class="btn sm" data-act="cam-subir" data-id="' + id + '" data-cam="' + esc(cam.id) + '"' + (pos === 0 ? ' disabled' : '') + '>↑ Subir un lugar</button><button class="btn sm" data-act="cam-bajar" data-id="' + id + '" data-cam="' + esc(cam.id) + '"' + (pos === total - 1 ? ' disabled' : '') + '>↓ Bajar un lugar</button>' : '')
        + (ke < 0 && pedidoDe(p.id) ? '<button class="btn sm" data-act="log-editar" data-id="' + id + '">Editar pedido</button>' : '') + '<button class="btn sm" data-act="cam-quitar-ped" data-id="' + id + '">Sacar del camión</button>', 'Opciones de ' + (p.cliente || 'este pedido'))
      : (ke < 0 && pedidoDe(p.id) ? '<button class="btn sm" data-act="log-editar" data-id="' + id + '">Editar</button>' : '') + opcionesCamion(p, cams)) + '</span>';
    h += '</div>';
    // Editar el pedido ahí mismo, sin ir a Pedidos.
    if (ke >= 0) return h + '<div class="log-edit">' + propHTML(S.prop[ke], ke) + '</div></div></div>';
    if (filas.length) h += '<div class="log-cortes">' + filas.map(function (c) { return '<p><span class="lc-corte">' + esc(c.corte) + '</span><span class="lc-txt">' + cantHTML(c.texto, c.uni) + (c.precio ? ' <span class="log-precio' + (edPre && c.k ? ' solo-print' : '') + '">' + esc(c.precio) + '</span>' : '') + '</span>' + (edPre && c.k ? precioLogHTML(p.id, c.k, c.v, c.iv, c.corte, c.tasa) : '') + '</p>'; }).join('') + '</div>';
    // La nota se escribe ahí mismo (sin apretar Editar): se guarda sola al salir del recuadro o con Enter.
    if (edPre && (p.nota || S.notaAbierta === p.id)) h += '<textarea class="log-nota log-nota-ed" rows="1" data-nota-ped="' + id + '" placeholder="Escribí la nota…" aria-label="Nota de ' + esc(p.cliente) + '">' + esc(p.nota || '') + '</textarea>' + (p.nota ? '<p class="log-nota solo-print">' + esc(p.nota) + '</p>' : '');
    else if (edPre) h += '<button class="btn lnk sm log-nota-mas" data-act="nota-abrir" data-id="' + id + '">+ Nota</button>';
    else if (p.nota) h += '<p class="log-nota">' + esc(p.nota) + '</p>';
    return h + '</div></div>';
  }
  function resumenLog(lista) {
    var tm = lista.reduce(function (t, p) { return t + (+p.medias || 0); }, 0), tc = kgPedidos(lista);
    return lista.length + (lista.length === 1 ? ' pedido' : ' pedidos') + (tm ? ' · ' + n(tm) + ' medias' : '') + (tc ? ' · ' + n(tc) + ' kg de cortes' : '');
  }
  // Buscadores de Logística (cliente o camión), sobre lo publicado desde la semana pasada. Quien mira sin cuenta ve solo lo que tiene camión.
  function buscarLogHTML(q, camion) {
    var t = norm(q).trim(), desde = mas(hoy(), -7), l = camion ? viajesDeCamion(t, !S.editor) : [];
    if (!camion) Object.keys(S.log || {}).sort().forEach(function (f) {
      if (f < desde) return;
      var lg = logDe(f), cams = (lg && lg.camiones) || [], peds = ((lg && lg.pedidos) || []).filter(function (p) { return S.editor || p.camion; });
      var cam = function (id) { return cams.filter(function (c) { return c.id === id; })[0]; };
      peds.forEach(function (p) { if (norm(p.cliente).indexOf(t) >= 0 || (p.cuenta && String(p.cuenta).indexOf(t) === 0)) l.push({ f: f, p: p, c: cam(p.camion) }); });
    });
    if (!l.length) return '<p class="muted sin">No hay ' + (camion ? 'camiones con clientes que se llamen' : 'clientes') + ' "' + esc(q) + '"' + (camion ? '' : ' desde el ' + esc(diaCorto(desde))) + '.</p>' + (camion ? busqPie() : '');
    var cuantos = l.length + (camion ? (l.length === 1 ? ' viaje encontrado (del más nuevo al más viejo)' : ' viajes encontrados (del más nuevo al más viejo)') : (l.length === 1 ? ' cliente encontrado' : ' clientes encontrados'));
    return '<p class="small muted">' + cuantos + ':</p>' + (camion ? busqPie() : '') + '<div class="busq">' + l.map(function (x) {
      var cb = x.c ? '<span class="badge cam-ped">' + esc(nomCam(x.c)) + '</span>' + (x.c.hora ? '<span class="cam-hora">' + esc(x.c.hora) + ' hs</span>' : '') : '<span class="badge warn">Sin camión</span>';
      if (camion) {
        var kg = x.ps.reduce(function (t, p) { return t + (+p.kg || 0); }, 0);
        return '<div class="busq-f busq-cam ir" data-act="lbusq-ver" data-f="' + esc(x.f) + '" data-cam="' + esc(x.c.id) + '" role="button" tabindex="0" title="Tocá para ir a ese día"><span class="busq-dia">' + esc(diaCorto(x.f)) + '</span>' + cb
          + '<span class="small muted">' + x.ps.length + (x.ps.length === 1 ? ' cliente' : ' clientes') + (kg ? ' · ≈ ' + n(Math.round(kg)) + ' kg' : '') + '</span>'
          + '<span class="busq-ir" aria-hidden="true">›</span>'
          + '<span class="busq-clis">' + x.ps.map(function (p, i) { return '<span>' + (i + 1) + '. ' + esc(p.cliente) + '</span>'; }).join('') + '</span></div>';
      }
      var p = x.p, res = [];
      if (+p.medias) res.push(n(+p.medias) + ' medias'); if ((p.cortes || []).length) res.push(p.cortes.length + (p.cortes.length === 1 ? ' corte' : ' cortes'));
      var lugar = x.c ? (x.c.orden || []).indexOf(p.id) : -1;
      return '<div class="busq-f ir" data-act="lbusq-ver" data-f="' + esc(x.f) + '" data-ped="' + esc(p.id) + '" role="button" tabindex="0" title="Tocá para ir a ese día"><span class="busq-dia">' + esc(diaCorto(x.f)) + '</span><span class="nom">' + esc(p.cliente) + '</span>' + ctaHTML(p.cuenta) + '<span class="small muted">' + res.join(' · ') + '</span>' + cb
        + (lugar >= 0 ? '<span class="small muted">lugar ' + (lugar + 1) + '</span>' : '')
        + '<span class="busq-ir" aria-hidden="true">›</span></div>';
    }).join('') + '</div>';
  }
  function renderLogistica() {
    var el = $('view-logistica');
    if (cargando(el, S.prod || S.faena)) return;
    if (!S.fl) S.fl = fmInicial();
    var f = S.fl, lg = logDe(f), peds = (lg && lg.pedidos) || [], cams = (lg && lg.camiones) || [];
    // Quien mira por el link ve todo, también los que todavía no tienen camión (pedido de Renzo, para ir adelantando); solo lee.
    var h = '<div class="nav"><button class="btn step" data-act="fl" data-d="-1" aria-label="Día anterior">‹</button><span class="tit">' + fechaTit(f) + '</span><button class="btn step" data-act="fl" data-d="1" aria-label="Día siguiente">›</button>'
      + '<input type="date" id="l-fecha" value="' + esc(f) + '" aria-label="Ir a una fecha">'
      + (peds.length ? '<button class="btn" data-act="resumen" aria-pressed="' + !!S.resumen + '">' + (S.resumen ? 'Ver por camión' : 'Resumen del día') + '</button><span class="imp-grupo"><button class="btn" data-act="imprimir">' + (S.resumen ? 'Imprimir resumen' : 'Imprimir') + '</button>' + ((!S.resumen && cams.length > 1) || impEstado() ? menuHTML('log-imp', '▾', (!S.resumen && cams.length > 1 ? '<button class="btn sm" data-act="imprimir-camiones">Cada camión en su hoja</button>' : '') + (impEstado() ? '<button class="btn sm" data-act="imprimir-remoto">🖨 En la compu' + (S.impresora && S.impresora.nombre ? ' (' + esc(S.impresora.nombre) + ')' : '') + (impEstado() === 'off' ? ' · apagada' : '') + '</button>' : ''), 'Más formas de imprimir') : '') + '</span>' : '')
      + (S.editor && cams.filter(function (c) { return c.hora; }).length > 1 ? '<button class="btn" data-act="cam-por-hora" title="Ordenar los camiones por horario">Ordenar x hora</button>' : '')
      + (S.editor ? '<button class="btn" data-act="cam-nuevo" title="Camión para este día">+ Camión</button><button class="btn" data-act="link-log" title="Copiar link para compartir">Copiar link</button><span class="guardado" id="g-log"></span>' : '') + '</div>';
    h += '<div class="pd-busca"><input type="search" id="lg-buscar" value="' + esc(S.lgBuscar || '') + '" placeholder="Buscar cliente" aria-label="Buscar un cliente en Logística (en todos los días)" autocomplete="off">'
      + '<input type="search" id="lg-cam-buscar" value="' + esc(S.lgCamBuscar || '') + '" placeholder="Buscar camión" aria-label="Buscar un camión en Logística" autocomplete="off">'
      + (S.lgBuscar || S.lgCamBuscar ? '<button class="btn sm" data-act="lbusq-limpiar">Borrar búsqueda</button>' : '') + '</div>';
    if (String(S.lgBuscar || '').trim() || String(S.lgCamBuscar || '').trim()) { el.innerHTML = h + buscarLogHTML(String(S.lgBuscar || '').trim() ? S.lgBuscar : S.lgCamBuscar, !String(S.lgBuscar || '').trim()); return; }
    if (!peds.length && !cams.length) {
      h += '<div class="panel"><p class="state">No hay pedidos para entregar este día.</p>' + (S.editor ? '<div class="acciones" style="justify-content:center"><button class="btn pri" data-act="ir-pedidos" data-f="' + f + '">Ir a los pedidos de este día</button></div>' : '') + '</div>';
      if (S.editor || flota().length) h += stockCamionesHTML(f, peds, cams);
      el.innerHTML = h; pintarMsg('log'); pintarMsg('flota'); return;
    }
    if (S.resumen) { el.innerHTML = h + resumenDiaHTML(f, cams, peds); pintarMsg('log'); return; }
    var tildL = S.editor && !S.solo && S.selDia === f ? (S.pedidos || []).filter(function (p) { return S.sel[p.id] && p.entrega === f; }) : [];
    if (tildL.length) h += '<div class="log-barra">' + barraCamionHTML(f, tildL) + '</div>';
    if (S.editor && !S.solo) h += '<p class="small muted log-tip">Tildá clientes (☐ al lado del nombre) para mandarlos juntos a un camión del día, a uno del stock o a uno nuevo.</p>';
    h += '<p class="muted">Para entregar ' + esc(cuandoEs(f)) + ': ' + resumenLog(peds) + (cams.length ? ' · ' + cams.length + (cams.length === 1 ? ' camión' : ' camiones') : '') + '.</p>';
    cams.forEach(function (cam, k) {
      var suyos = peds.filter(function (p) { return p.camion === cam.id; }), ed = S.ec === cam.id;
      var car = cargaDe(peds, cam.id), ct = capTxt(cam, car), pasa = +cam.kg > 0 && car > +cam.kg;
      h += '<section class="cam' + (pasa ? ' pasa' : '') + '" data-cam="' + esc(cam.id) + '"><header class="cam-cab">'
        + '<h2>' + esc(nomCam(cam)) + '</h2>' + (cam.hora ? '<span class="cam-hora">' + esc(cam.hora) + ' hs</span>' : '')
        + (cam.nota && !ed ? '<span class="cam-nota">' + esc(cam.nota) + '</span>' : '')
        + (!ed ? '<span class="log-acc">' + menuHTML('cam-' + cam.id, '⋯', (S.editor && cams.length > 1 ? '<button class="btn sm" data-act="camion-subir" data-id="' + esc(cam.id) + '"' + (k === 0 ? ' disabled' : '') + '>↑ Subir el camión</button><button class="btn sm" data-act="camion-bajar" data-id="' + esc(cam.id) + '"' + (k === cams.length - 1 ? ' disabled' : '') + '>↓ Bajar el camión</button>' : '') + '<button class="btn sm" data-act="cam-imprimir" data-id="' + esc(cam.id) + '">Imprimir este camión</button>'
          + (S.editor ? '<button class="btn sm" data-act="cam-editar" data-id="' + esc(cam.id) + '">Editar camión</button>' + botonBorrar('cam-borrar', cam.id, 'Borrar camión') : ''), 'Opciones del camión ' + nomCam(cam)) + '</span>' : '') + '</header>';
      var tMed = 0, tCaj = 0;
      suyos.forEach(function (p) { tMed += +p.medias || 0; (p.cortes || []).forEach(function (c) { var mc = String(c.texto || '').match(/^\s*([\d.,½]+)\s*(?:CAJAS?|CJS?)\b/i); if (mc) tCaj += numero(mc[1].replace('½', '.5')); }); });
      h += '<div class="cam-datos"><div class="cam-res"><b>' + suyos.length + '</b><span>' + (suyos.length === 1 ? 'pedido' : 'pedidos') + '</span></div>'
        + (tMed ? '<div class="cam-res"><b>' + n(tMed) + '</b><span>' + (tMed === 1 ? 'media' : 'medias') + '</span></div>' : '')
        + (tCaj ? '<div class="cam-res"><b>' + n(tCaj) + '</b><span>' + (tCaj === 1 ? 'caja' : 'cajas') + '</span></div>' : '')
        + (ct ? '<div class="cam-carga"><p class="cam-cap' + (pasa ? ' neg' : '') + '">' + esc(ct) + '</p>' + (+cam.kg > 0 ? '<div class="medidor' + (pasa ? ' pasa' : '') + '" role="img" aria-label="' + esc(ct) + '"><i style="width:' + Math.min(100, Math.round(car / +cam.kg * 100)) + '%"></i></div>' : '') + '</div>' : '') + '</div>';
      // El costo del flete ya no se muestra (lo pidió Renzo para ganar espacio); lo cargado sigue en privado/fletes-*.
      h += '<div class="cam-cuerpo">';
      if (ed) h += '<div class="campos"><label class="campo"><span>Nombre del camión</span><input type="text" id="cam-e-nombre" value="' + esc(S.ecNombre || '') + '" placeholder="Ej. LUCAS HEREDIA"></label><label class="campo"><span>Hora de salida</span><input type="time" id="cam-e-hora" value="' + esc(S.ecHora || '') + '"></label><label class="campo"><span>Capacidad kg</span><input type="number" inputmode="numeric" id="cam-e-kg" value="' + esc(S.ecKg || '') + '"></label><label class="campo"><span>Nota (chofer, hora…)</span><input type="text" id="cam-e-nota" value="' + esc(S.ecNota || '') + '"></label></div>'
        + '<div class="acciones"><button class="btn pri" data-act="cam-guardar">Guardar</button><button class="btn" data-act="cam-cancelar">Cancelar</button></div>';
      h += suyos.length ? '<div class="log-lista">' + suyos.map(function (p, i) { return logPedidoHTML(p, cam, cams, i, suyos.length); }).join('') + '</div>' : '<p class="muted">Sin pedidos.</p>';
      h += '</div></section>';
    });
    var sueltos = peds.filter(function (p) { return !p.camion; });
    if (sueltos.length) h += '<section class="cam suelto"><header class="cam-cab"><h2>' + (cams.length ? 'Sin camión' : 'Pedidos del día') + '</h2><span class="cam-nota">' + esc(resumenLog(sueltos)) + '</span></header>'
      + '<div class="cam-cuerpo"><div class="log-lista">' + sueltos.map(function (p) { return logPedidoHTML(p, null, cams); }).join('') + '</div></div></section>';
    if (S.editor || flota().length) h += stockCamionesHTML(f, peds, cams);
    el.innerHTML = h; pintarMsg('log'); pintarMsg('flota');
  }

  /* ---------- cámara (privada) ----------
     La planilla de faena y desposte de Renzo, con su misma cuenta: por día propios, usuario y venta (animales),
     el desposte del día siguiente (medias), y de ahí el remanente, lo disponible, las medias en cámara y el lugar libre.
     Se guarda por semana en /camara/{lunes} (solo lo que se cargó o corrigió); lo que falta sale de Medias y Producción.
     Remanente(d) = disponible del día hábil anterior − desposte de ese día (o el que se haya escrito a mano). */
  var CAM_SEM_MAS = 3;   // semanas que se ven debajo de la elegida
  var CAM_CAMPOS = ['propios', 'usuario', 'venta', 'despSig', 'rem'];
  // Por decisión de Renzo, los datos van en privado/camara-* (los editores pueden leer esa sección; la app no los muestra).
  // La pestaña la ve solo la cuenta cuya huella SHA-256 del mail figura acá (así el mail no queda escrito en el código público).
  var CAM_CUENTAS = ['e1417b75ad72765061993805221de0f56d6d0bbac14792ef4defa3bb1b628355'];
  function huella(t) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t || '').trim().toLowerCase())).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }); }
  // Lo que ya viene cargado de base (pedido de Renzo): faena fija 680 por día y el viernes 520 + 160 de usuario;
  // venta y desposte con los valores que él usa para proyectar. Lo cargado a mano o lo que haya en Medias/Producción manda.
  var CAM_FIJO = { desde: '2026-09-28', hasta: '2026-12-31', propios: [680, 680, 680, 680, 520], usuario: [0, 0, 0, 0, 160], venta: [317, 329, 154, 272, 306], desp: [750, 750, 750, 750, 720] };
  // Feriados nacionales 2026 (oct–dic) y días no laborables: el día del feriado no hay faena, venta ni desposte.
  var CAM_FERIADOS = { '2026-10-12': 'Diversidad Cultural', '2026-11-23': 'Soberanía Nacional', '2026-12-08': 'Inmaculada Concepción', '2026-12-25': 'Navidad', '2027-01-01': 'Año Nuevo' };
  var CAM_NOLAB = { '2026-12-07': 'Día no laborable' };
  function camFijo(f) {
    if (f < CAM_FIJO.desde || f > CAM_FIJO.hasta) return null;
    var i = fecha(f).getDay() - 1; if (i < 0 || i > 4) return null;
    if (CAM_FERIADOS[f]) return { propios: 0, usuario: 0, venta: 0, desp: 0 };
    return { propios: CAM_FIJO.propios[i], usuario: CAM_FIJO.usuario[i] || null, venta: CAM_FIJO.venta[i], desp: CAM_FIJO.desp[i] };
  }
  function camCap() { var a = (S.cam || {}).ajustes; return a && +a.capacidad > 0 ? +a.capacidad : 2250; }
  function camSemanas() { return Object.keys(S.cam || {}).filter(function (k) { return /^\d{4}-\d{2}-\d{2}$/.test(k); }).sort(); }
  function camGuardado(f) { var l = lunesDe(f), d = (S.cam || {})[l], i = Math.round((fecha(f) - fecha(l)) / 864e5); return d && d.dias && d.dias[i] ? d.dias[i] : {}; }
  function camNum(v) { return v === '' || v == null || isNaN(+v) ? null : +v; }
  // Lo que sale solo de la app para un día: faena y venta de Medias; desposte de Producción.
  function camAuto(f) {
    var sem = semDe(lunesDe(f)), i = Math.round((fecha(f) - fecha(lunesDe(f))) / 864e5), d = sem && sem.dias && sem.dias[i], s = d ? sumas(d) : null;
    var hay = s && (s.propios || s.usuarios || s.clientes);
    var o = prodDe('op-' + f) || prodDe(f);
    return { propios: hay ? s.propios : null, usuario: hay ? (s.usuarios || null) : null, venta: hay ? s.clientes : null, desp: o && o.medias !== '' && o.medias != null ? +o.medias || 0 : null };
  }
  function camCalc(hasta) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta || '')) hasta = mas(hoy(), 21);   // una fecha rota dejaba el cálculo dando vueltas sin fin
    var sem = camSemanas(), r = {};
    var ini = sem.length && sem[0] < CAM_FIJO.desde ? sem[0] : CAM_FIJO.desde, fin = hasta > mas(hoy(), 21) ? hasta : mas(hoy(), 21), d = ini, prev = null, ultimo = null, lista = [];
    while (d <= fin) { if (esHabil(d) || fecha(d).getDay() % 6) lista.push(d); d = mas(d, 1); }
    lista = lista.filter(function (x) { var g = fecha(x).getDay(); return g > 0 && g < 6; });
    lista.forEach(function (f) {
      var g = camGuardado(f), a = camAuto(f), fj = camFijo(f), o = { f: f, src: {}, feriado: CAM_FERIADOS[f] || '', nolab: CAM_NOLAB[f] || '' };
      ['propios', 'usuario', 'venta'].forEach(function (k) { var v = camNum(g[k]); if (v != null) { o[k] = v; o.src[k] = 'dato'; } else if (a[k] != null && !o.feriado) { o[k] = a[k]; o.src[k] = 'auto'; } else if (fj && (fj[k] != null || o.feriado)) { o[k] = fj[k]; o.src[k] = 'fijo'; } else o[k] = null; });
      // Desposte de ESTE día: el que se anotó el día hábil anterior como "desposte del día siguiente".
      var gp = prev ? camGuardado(prev.f) : {}, dp = camNum(gp.despSig);
      o.desp = dp != null ? dp : (o.feriado ? 0 : a.desp != null ? a.desp : fj ? fj.desp : (+S.config.desposteHabitual || 750)); o.srcDesp = dp != null ? 'dato' : (o.feriado ? 'fijo' : a.desp != null ? 'auto' : fj ? 'fijo' : 'habitual');
      var remM = camNum(g.rem);
      o.rem = remM != null ? remM : (prev ? prev.disp - o.desp : 0); o.src.rem = remM != null ? 'dato' : 'calc';
      o.faena = (o.propios || 0) + (o.usuario || 0);
      o.aDesposte = ((o.propios || 0) - (o.venta || 0)) * 2;
      o.disp = o.aDesposte + o.rem;
      o.camara = o.faena * 2 + o.rem;
      o.libre = camCap() - o.camara;
      if (o.src.propios || o.src.venta || camNum(g.despSig) != null || remM != null || fj) ultimo = f;
      if (prev) { prev.sig = o; o.prevF = prev.f; }
      r[f] = o; prev = o;
    });
    // "Desposte del día siguiente" que se muestra en cada día.
    Object.keys(r).forEach(function (f) { var o = r[f], g = camGuardado(f), v = camNum(g.despSig); o.despSig = v != null ? v : (o.sig ? o.sig.desp : null); o.src.despSig = v != null ? 'dato' : (o.sig ? o.sig.srcDesp : 'calc'); });
    return { dias: r, ultimo: ultimo };
  }
  function camDiaRef() { var h = hoy(), g = fecha(h).getDay(); return g > 0 && g < 6 ? h : habilSiguiente(h); }
  function camaraTileHTML() {
    var c = camCalc(mas(hoy(), 14)), f = camDiaRef(), o = c.dias[f];
    var cab = '<span class="t-cab"><span class="t-ico">' + icono('camara') + '</span><b>Cámara</b><span class="badge cam-solo">🔒 Solo vos</span></span>';
    if (!o || !c.ultimo || f > c.ultimo) return '<button class="tile t-camara" data-act="ir" data-tab="camara">' + cab + '<span class="t-dia">' + esc(tituloDe(f)) + '</span><span class="t-vacio">' + (camSemanas().length ? 'Todavía no hay datos de este día.' : 'Cargá tu planilla para empezar.') + '</span><span class="t-ir" aria-hidden="true">Abrir ›</span></button>';
    var cap = camCap(), pct = Math.max(0, Math.min(100, Math.round(o.camara / cap * 100))), vie = c.dias[mas(lunesDe(f), 4)], sig = o.sig;
    var nivel = o.libre < 0 ? 'pasa' : pct >= 90 ? 'alto' : '';
    return '<button class="tile t-camara' + (o.libre < 0 ? ' pasa' : '') + '" data-act="ir" data-tab="camara">' + cab
      + '<span class="t-dia">' + (f === hoy() ? 'Hoy · ' : '') + esc(tituloDe(f)) + '</span>'
      + '<span class="t-nums"><strong class="g">' + n(o.camara) + '</strong><span>medias en cámara</span></span>'
      + '<span class="cam-med ' + nivel + '"><i style="width:' + pct + '%"></i></span><span class="cam-pct">de ' + n(cap) + ' · ' + pct + '% lleno</span>'
      + '<span class="cam-mini"><span>Lugar libre</span><b class="' + (o.libre < 0 ? 'mal' : 'ok') + '">' + n(o.libre) + '</b><span>Remanente</span><b>' + n(o.rem) + '</b>'
      + (sig ? '<span>Desposte ' + esc(diaCorto(sig.f).split(' ')[0].toLowerCase()) + '</span><b>' + n(sig.desp) + '</b>' : '')
      + (vie && vie.f !== f && vie.f <= (c.ultimo || '') ? '<span>Viernes (proyectado)</span><b class="' + (vie.libre < 0 ? 'mal' : 'ok') + '">' + (vie.libre < 0 ? 'se pasa ' + n(-vie.libre) : 'libre ' + n(vie.libre)) + '</b>' : '')
      + '</span><span class="t-ir" aria-hidden="true">Abrir ›</span></button>';
  }
  function camCelda(f, k, v, src, extra) {
    var t = src === 'auto' ? 'Sale solo de ' + (k === 'despSig' ? 'Producción' : 'Medias') + ' · tocá para cambiarlo' : src === 'habitual' ? 'Desposte habitual · tocá para cambiarlo' : src === 'dato' && k === 'rem' ? 'Remanente escrito a mano · borralo para que se calcule solo' : 'Tocá para cambiarlo';
    return '<input class="cam-in ' + (src || '') + (v < 0 ? ' neg' : '') + '" inputmode="numeric" data-cf="' + k + '" data-f="' + f + '" value="' + (v == null ? '' : esc(n(v))) + '" title="' + esc(t) + '" aria-label="' + esc(k + ' ' + diaCorto(f)) + '"' + (extra || '') + '>';
  }
  function renderCamara() {
    var el = $('view-camara');
    if (!S.camaraOk) { el.innerHTML = '<div class="panel"><p class="state">Esta sección es privada.</p></div>'; return; }
    if (!S.editor) { el.innerHTML = !S.editorVisto ? '<div class="panel"><p class="state">Cargando tus datos…</p></div>' : '<div class="panel"><p class="state">Todavía no se cargaron tus datos de Cámara (no se pudo confirmar tu permiso, puede ser la señal).</p><div class="acciones"><button class="btn pri" data-act="recargar">Volver a cargar</button></div></div>'; return; }
    if (!S.camLun) S.camLun = lunesDe(camDiaRef());
    var L = S.camLun, c = camCalc(mas(L, 7 * (CAM_SEM_MAS + 1))), ult = c.ultimo, hy = hoy();
    var vacio = false;
    var h = '<div class="cam-top"><span class="cam-escudo" aria-hidden="true"></span><div><p class="cam-sup">Semana de faena y desposte · <span class="cam-priv">🔒 Privado, solo con tu cuenta</span></p>'
      + '<h2 class="cam-tit">' + esc(etiquetaSemana(L).toUpperCase()) + '</h2></div>'
      + '<span class="cam-acc"><span class="cam-undo"><button class="btn" data-act="cam-deshacer" title="Deshacer el último cambio (Ctrl+Z)" aria-label="Deshacer"' + (camHist.atras.length ? '' : ' disabled') + '>↶</button><button class="btn" data-act="cam-rehacer" title="Rehacer (Ctrl+Y)" aria-label="Rehacer"' + (camHist.adelante.length ? '' : ' disabled') + '>↷</button></span><button class="btn step" data-act="cam-sem" data-d="-7" aria-label="Semana anterior">‹</button>'
      + (L !== lunesDe(camDiaRef()) ? '<button class="btn" data-act="cam-hoy">Esta semana</button>' : '')
      + '<button class="btn step" data-act="cam-sem" data-d="7" aria-label="Semana siguiente">›</button>'
      + (camSheet() ? '' : '<button class="btn" data-act="cam-sheet">Conectar Google Sheet</button>') + '<button class="btn" data-act="cam-pegar">' + (S.camPegar ? 'Cerrar' : 'Pegar desde la planilla') + '</button><button class="btn" data-act="imprimir">Imprimir</button></span></div>';
    if (S.camLink) { var dl = camDesdeLink(S.camLink); S.camLink = null; if (dl && dl.length) { S.camPrev = dl; S.camPegar = true; S.camDeLink = true; } }
    h += camSheetHTML();
    if (S.camPegar || vacio) h += camPegarHTML(vacio);
    /* Una tabla por semana: la elegida y las CAM_SEM_MAS siguientes (pedido de Renzo, para ver dos o tres semanas adelante).
       DESPOSTE muestra el desposte de ESE día (antes era "del día siguiente", como en la planilla); se guarda igual que antes
       (en el día hábil anterior, como "desposte del día siguiente"), así la sincronización con el Google Sheet no cambia. */
    var tablaSem = function (L2, conTit) {
      var dias = [0, 1, 2, 3, 4].map(function (i) { return mas(L2, i); });
      var fila = function (lab, cls, celda, tot) {
        return '<tr class="' + cls + '"><th scope="row">' + lab + '</th>' + dias.map(function (f) { var o = c.dias[f], ver = o && (!ult || f <= ult || o.src.propios === 'dato'); return '<td class="' + (f === hy ? 'hoy' : '') + (CAM_FERIADOS[f] ? ' fer' : '') + '">' + (o ? celda(o, ver) : '') + '</td>'; }).join('') + '<td class="tot">' + (tot || '') + '</td></tr>';
      };
      var sum = function (k) { return dias.reduce(function (t, f) { var o = c.dias[f]; return t + (o && o[k] ? o[k] : 0); }, 0); };
      var nd = dias.filter(function (f) { var o = c.dias[f]; return o && o.faena > 0; }).length || 1;
      var calc = function (k, bold) { return function (o, ver) { return ver ? '<span class="cam-v' + (bold ? ' b' : '') + (o[k] < 0 ? ' neg' : '') + '">' + n(o[k]) + '</span>' : ''; }; };
      var ed = function (k) { return function (o) { return camCelda(o.f, k, o[k], o.src[k]); }; };
      var desp = function (o) { return o.prevF ? camCelda(o.prevF, 'despSig', o.desp, o.srcDesp, ' data-dia="' + o.f + '"') : '<span class="cam-v">' + n(o.desp) + '</span>'; };
      return (conTit ? '<h3 class="cam-sem-tit">' + esc(etiquetaSemana(L2).toUpperCase()) + '</h3>' : '')
        + '<div class="cam-tabla"><table><thead><tr><th></th>' + dias.map(function (f) { return '<th class="' + (f === hy ? 'hoy' : '') + (CAM_FERIADOS[f] ? ' feriado' : CAM_NOLAB[f] ? ' nolab' : '') + '">' + esc(diaDe(f)) + ' ' + fecha(f).getDate() + (f === hy ? ' · HOY' : '') + (CAM_FERIADOS[f] ? '<small>FERIADO · ' + esc(CAM_FERIADOS[f]) + '</small>' : CAM_NOLAB[f] ? '<small>' + esc(CAM_NOLAB[f].toUpperCase()) + '</small>' : '') + '</th>'; }).join('') + '<th>Total</th></tr></thead><tbody>'
        + fila('PROPIOS', 'c-verde', ed('propios'), n(sum('propios')))
        + fila('USUARIO', 'c-naranja', ed('usuario'), n(sum('usuario')))
        + fila('FAENA', 'c-celeste b marca', calc('faena', true), n(sum('faena')) + ' <small>(' + n(Math.round(sum('faena') / nd)) + ' x día)</small>')
        + fila('VENTA (animales)', 'c-verde sep marca venta', ed('venta'), n(sum('venta')))
        + fila('MEDIAS A DESPOSTE', '', calc('aDesposte'), n(sum('aDesposte')))
        + fila('DESPOSTE DEL DÍA', 'c-celeste marca', desp, n(sum('desp')))
        + fila('REMANENTE', 'b marca', function (o, ver) { return ver ? camCelda(o.f, 'rem', o.rem, o.src.rem) + (o.src.rem === 'dato' ? '<small class="cam-dsig">a mano</small>' : '') : ''; }, (function () { var v = c.dias[mas(L2, 7)]; return v && (!ult || v.f <= ult) ? '→ ' + n(v.rem) + ' el lunes' : ''; })())
        + fila('DISPONIBLE', 'marca', calc('disp', true), '')
        + fila('MEDIAS EN CÁMARA', 'c-azul b sep marca', calc('camara', true), (function () { var m = dias.map(function (f) { return c.dias[f] && (!ult || f <= ult) ? c.dias[f].camara : -1e9; }); var mx = Math.max.apply(null, m); return mx > -1e9 ? 'máx. ' + n(mx) : ''; })())
        + fila('LUGAR LIBRE (de ' + n(camCap()) + ')', 'b', function (o, ver) { return ver ? '<span class="cam-v b' + (o.libre < 0 ? ' neg' : '') + '">' + n(o.libre) + '</span>' : ''; }, (function () { var m = dias.filter(function (f) { return c.dias[f] && (!ult || f <= ult); }).map(function (f) { return c.dias[f].libre; }); return m.length ? 'mín. ' + n(Math.min.apply(null, m)) : ''; })())
        + '</tbody></table></div>';
    };
    if (!vacio) {
      h += tablaSem(L, false);
      var nota = ((S.cam || {})[L] || {}).nota || '';
      h += '<label class="campo cam-nota"><span>Nota de la semana</span><input id="cam-nota-sem" value="' + esc(nota) + '" placeholder="Ej.: si carga Recreo faenamos"></label>';
      h += '<div class="cam-ley"><span class="l-dato">Cargado o corregido</span><span class="l-auto">Sale solo de Medias / Producción</span><span class="l-calc">Calculado</span>'
        + '<span class="cam-cap">Capacidad de cámara: <input id="cam-cap" inputmode="numeric" value="' + esc(String(camCap())) + '" aria-label="Capacidad de cámara en medias"> medias</span></div>'
        + '<p class="small muted cam-tip">Hasta fin de año ya viene cargado de base: faena 680 por día (viernes 520 + 160 de usuario), la venta y el desposte habituales, y los feriados en rojo sin faena ni desposte. Tocá cualquier número de propios, usuario, venta, desposte o remanente para cambiarlo; todo lo demás se recalcula solo.</p>';
      h += '<div class="cam-mas"><p class="cam-sup">Semanas siguientes</p>';
      for (var sk = 1; sk <= CAM_SEM_MAS; sk++) h += tablaSem(mas(L, 7 * sk), true);
      h += '</div>';
    }
    el.innerHTML = h;
    camTraer();
  }
  function camPegarHTML(vacio) {
    var prev = S.camPrev;
    if (S.camDeLink && prev && prev.length) return '<div class="panel cam-pegar"><h3>Tu planilla, lista para cargar</h3><p class="cam-prev">Encontré <b>' + prev.length + (prev.length === 1 ? ' semana' : ' semanas') + '</b> en tu link: del ' + esc(diaCorto(prev[0].lunes)) + ' al ' + esc(diaCorto(mas(prev[prev.length - 1].lunes, 4))) + '.</p><div class="acciones"><button class="btn pri" data-act="cam-guardar-pegado">Cargar ' + prev.length + (prev.length === 1 ? ' semana' : ' semanas') + '</button><button class="btn" data-act="cam-pegar">Cancelar</button></div></div>';
    return '<div class="panel cam-pegar">' + (vacio ? '<h3>Cargá tu planilla</h3>' : '<h3>Pegar desde la planilla</h3>')
      + '<ol class="small"><li>Abrí tu planilla (la de Google "FAENA POR DÍA" o el Excel).</li><li>Seleccioná todo (Ctrl+A) y copiá (Ctrl+C).</li><li>Pegalo acá abajo (Ctrl+V).</li></ol>'
      + '<textarea id="cam-txt" rows="5" placeholder="Pegá acá las semanas copiadas de tu planilla"></textarea>'
      + (prev ? (prev.length ? '<p class="cam-prev">Encontré <b>' + prev.length + (prev.length === 1 ? ' semana' : ' semanas') + '</b>: del ' + esc(diaCorto(prev[0].lunes)) + ' al ' + esc(diaCorto(mas(prev[prev.length - 1].lunes, 4))) + '. Las semanas que ya estén cargadas se reemplazan.</p><div class="acciones"><button class="btn pri" data-act="cam-guardar-pegado">Guardar ' + prev.length + (prev.length === 1 ? ' semana' : ' semanas') + '</button><button class="btn" data-act="cam-pegar-borrar">Borrar</button></div>'
        : '<p class="cam-prev neg">No encontré semanas en lo pegado. Copiá las semanas enteras (desde el nombre del mes y "Lunes").</p>') : '')
      + '</div>';
  }
  // Datos del link personal: base64url de [[lunes, [[propios, usuario, venta, despSig, remanente] x5], nota], ...].
  function camDesdeLink(b) {
    try {
      var bin = atob(String(b).replace(/-/g, '+').replace(/_/g, '/')), u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      var a = JSON.parse(new TextDecoder().decode(u8)), nn = function (x) { return x == null || x === '' ? null : +x; };
      return a.filter(function (w) { return /^\d{4}-\d{2}-\d{2}$/.test(w[0]) && Array.isArray(w[1]); }).map(function (w) {
        var o = { lunes: w[0], dias: w[1].slice(0, 5).map(function (d) { return { propios: nn(d[0]), usuario: nn(d[1]), venta: nn(d[2]), despSig: nn(d[3]), remPegado: nn(d[4]) }; }) };
        if (w[2]) o.nota = String(w[2]); return o;
      }).sort(function (x, y) { return x.lunes < y.lunes ? -1 : 1; });
    } catch (e) { return null; }
  }
  // Lee lo copiado de la planilla (Google o Excel): bloques con el mes, "Lunes NN", y las filas PROPIOS, USUARIO, VENTA y REMANENTE.
  var MES_N = { ENERO: 0, FEBRERO: 1, MARZO: 2, ABRIL: 3, MAYO: 4, JUNIO: 5, JULIO: 6, AGOSTO: 7, SEPTIEMBRE: 8, SETIEMBRE: 8, OCTUBRE: 9, NOVIEMBRE: 10, DICIEMBRE: 11 };
  function leerCamaraPegada(txt) {
    var filas = String(txt || '').replace(/\r/g, '').split('\n').map(function (l) { return l.split('\t').map(function (x) { return x.trim(); }); });
    var num = function (x) { x = String(x == null ? '' : x).replace(/\s/g, ''); if (!/\d/.test(x)) return null; var v = numero(x.replace(/,(\d+)$/, '.$1')); return isNaN(v) ? null : v; };
    var hoyD = fecha(hoy()), out = [], prevL = null;
    for (var r = 0; r < filas.length; r++) {
      var m = norm(filas[r][0] || '').match(/^LUNES\s*(\d{1,2})$/);
      if (!m) continue;
      var dia = +m[1], mes = null;
      for (var k = r - 1; k >= Math.max(0, r - 3); k--) { var t = norm(filas[k][0] || ''); if (MES_N[t] != null) { mes = MES_N[t]; break; } }
      var lun = null;
      if (mes != null) {
        var mejor = null;
        for (var y = hoyD.getFullYear() - 4; y <= hoyD.getFullYear() + 1; y++) { var dd = new Date(y, mes, dia); if (dd.getDay() === 1 && dd.getMonth() === mes) { var dif = Math.abs(dd - hoyD); if (!mejor || dif < mejor.dif) mejor = { d: dd, dif: dif }; } }
        if (mejor) lun = mejor.d.getFullYear() + '-' + String(mes + 1).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
      }
      if (!lun && prevL) lun = mas(prevL, 7);
      if (!lun) continue;
      var busca = function (lab) { for (var j = r + 1; j < Math.min(filas.length, r + 10); j++) { var a = norm(filas[j][0] || ''), b2 = norm(filas[j][3] || ''); if (/^LUNES\s*\d/.test(a)) break; if (a.indexOf(lab) === 0 || b2.indexOf(lab) === 0) return filas[j]; } return null; };
      var fp = busca('PROPIOS'), fu = busca('USUARIO'), fv = busca('VENTA'), fr = busca('REMANENTE');
      if (!fp) continue;
      var semana = { lunes: lun, dias: [] };
      for (var i = 0; i < 5; i++) {
        var c0 = i * 3;
        semana.dias.push({ propios: num(fp[c0 + 1]), usuario: fu ? num(fu[c0 + 1]) : null, venta: fv ? num(fv[c0 + 1]) : null, despSig: fr ? num(fr[c0 + 2]) : null, remPegado: fr ? num(fr[c0 + 1]) : null });
      }
      // Nota de la semana: texto suelto a la derecha del bloque.
      for (var j2 = r; j2 < Math.min(filas.length, r + 10); j2++) { var nt = (filas[j2][15] || '').trim(); if (nt && !/\d/.test(nt.charAt(0)) && !/^(PROPIOS|TOTAL|REMANENTE|USUARIO|FAENA)/i.test(nt)) { semana.nota = nt; break; } }
      out.push(semana); prevL = lun;
    }
    var vistos = {}; out = out.filter(function (w) { if (vistos[w.lunes]) return false; vistos[w.lunes] = 1; return true; }).sort(function (a, b) { return a.lunes < b.lunes ? -1 : 1; });
    return out;
  }
  // Guarda lo pegado: los datos de cada día y el remanente solo donde no coincide con la cuenta (o al empezar).
  function guardarCamaraPegada(sem) {
    var prevDisp = null, prevDesp = null, t = [];
    sem.forEach(function (w, wi) {
      var doc = { dias: [] };
      w.dias.forEach(function (d, i) {
        var desp = prevDesp != null ? prevDesp : null;
        var calc = prevDisp != null && desp != null ? prevDisp - desp : null;
        var rem = d.remPegado != null ? d.remPegado : (calc != null ? calc : 0);
        var x = {};
        ['propios', 'usuario', 'venta', 'despSig'].forEach(function (k) { if (d[k] != null) x[k] = d[k]; });
        if (calc == null || Math.abs(calc - rem) > 0.5) x.rem = rem;
        doc.dias.push(x);
        prevDisp = ((d.propios || 0) - (d.venta || 0)) * 2 + rem; prevDesp = d.despSig;
      });
      if (w.nota) doc.nota = w.nota;
      t.push(store.set('privado', 'camara-' + w.lunes, doc));
    });
    return Promise.all(t).then(function (r) { camMandar(camSheet() ? sem.map(function (w) { return w.lunes; }) : []); return r; });
  }
  /* Deshacer / Rehacer en Cámara (pedido de Renzo, como las flechitas del Excel): cada número que se cambia queda anotado
     con lo que tenía antes (o vacío, si salía solo), y se puede volver atrás o adelante, de a uno. */
  var camHist = { atras: [], adelante: [] };
  function camDeshacer(rehacer) {
    var de = rehacer ? camHist.adelante : camHist.atras, a = rehacer ? camHist.atras : camHist.adelante, x = de.pop();
    if (!x) return;
    var antes = camCrudo(x.f, x.k);
    camGuardarCelda(x.f, x.k, x.v == null ? '' : String(x.v), true).then(function () { a.push({ f: x.f, k: x.k, v: antes }); renderCamara(); avisar((rehacer ? 'Rehecho' : 'Deshecho') + ': ' + diaCorto(x.f).toLowerCase() + '.', 2500); }, function () { de.push(x); avisar('!No se pudo guardar. Revisá la conexión.', 6000); });
  }
  function camCrudo(f, k) { var g = camGuardado(f); return g[k] == null ? null : g[k]; }
  function camGuardarCelda(f, k, txt, sinHist) {
    var L = lunesDe(f), i = Math.round((fecha(f) - fecha(L)) / 864e5), doc = clone((S.cam || {})[L] || { dias: [] }); delete doc.id;
    doc.dias = doc.dias || []; while (doc.dias.length < 5) doc.dias.push({});
    var v = String(txt || '').trim() === '' ? null : numero(String(txt).replace(/\s/g, '').replace(/,(\d+)$/, '.$1'));
    if (!sinHist) { var viejo = doc.dias[i][k] == null ? null : doc.dias[i][k], nv = v == null || isNaN(v) ? null : v; if (viejo !== nv) { camHist.atras.push({ f: f, k: k, v: viejo }); if (camHist.atras.length > 100) camHist.atras.shift(); camHist.adelante = []; } }
    if (v == null || isNaN(v)) delete doc.dias[i][k]; else doc.dias[i][k] = v;
    S.cam = S.cam || {}; var nuevo = clone(doc); nuevo.id = L; S.cam[L] = nuevo;
    return store.set('privado', 'camara-' + L, doc).then(function (r) { camMandar(camSheet() ? [L] : []); return r; });
  }

  /* ---------- Cámara ↔ Google Sheet ----------
     Un programita instalado dentro de la planilla "FAENA POR DÍA" (Apps Script, ver camara-sheet.txt) hace de puente.
     Lo que se cambia acá se escribe en la planilla y, cada tanto (y al abrir la pestaña), se trae lo de la planilla. */
  function camSheet() { var a = (S.cam || {}).ajustes; return a && a.sheet && a.sheet.url && a.sheet.k ? a.sheet : null; }
  function camAjustes(cambios) { var a = clone((S.cam || {}).ajustes || {}); delete a.id; Object.keys(cambios).forEach(function (k) { if (cambios[k] == null) delete a[k]; else a[k] = cambios[k]; }); S.cam = S.cam || {}; var n2 = clone(a); n2.id = 'ajustes'; S.cam.ajustes = n2; return store.set('privado', 'camara-ajustes', a); }
  function camPedir(url, cuerpo) {
    if (window.__mock && window.__mock.hoja) return Promise.resolve().then(function () { return JSON.parse(JSON.stringify(window.__mock.hoja(url, cuerpo ? JSON.parse(JSON.stringify(cuerpo)) : null))); });
    var op = cuerpo ? { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo), redirect: 'follow' } : { redirect: 'follow' };
    return fetch(url, op).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  }
  function camDocDeHoja(w) {
    var doc = { dias: (w.dias || []).slice(0, 5).map(function (d) { var x = {}; ['propios', 'usuario', 'venta', 'despSig', 'rem'].forEach(function (k) { var v = camNum(d[k]); if (v != null && !(k === 'usuario' && v === 0)) x[k] = v; }); return x; }) };
    if (w.nota) doc.nota = String(w.nota); return doc;
  }
  function camSinId(d) { var x = clone(d || {}); delete x.id; (x.dias || []).forEach(function (y) { if (y && y.usuario === 0) delete y.usuario; }); return JSON.stringify(x); }
  // Guarda en la app lo que vino de la planilla (solo las semanas que cambiaron).
  function camAplicarHoja(semanas) {
    var t = []; S.cam = S.cam || {};
    (semanas || []).forEach(function (w) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(w.lunes || '')) return;
      var doc = camDocDeHoja(w); if (!doc.dias.some(function (d) { return Object.keys(d).length; })) return;
      if (camSinId(doc) === camSinId(S.cam[w.lunes])) return;
      var n2 = clone(doc); n2.id = w.lunes; S.cam[w.lunes] = n2; t.push(store.set('privado', 'camara-' + w.lunes, doc));
    });
    return Promise.all(t).then(function () { return t.length; });
  }
  // Lo que se manda a la planilla de una semana: los números que se ven en pantalla y el remanente solo si está escrito a mano.
  function camSemanaParaHoja(L, c) {
    c = c || camCalc(mas(L, 7)); var doc = (S.cam || {})[L] || {};
    var w = { lunes: L, dias: [0, 1, 2, 3, 4].map(function (i) { var f = mas(L, i), o = c.dias[f] || {}, g = (doc.dias || [])[i] || {}; return { propios: o.propios == null ? null : o.propios, usuario: o.usuario || null, venta: o.venta == null ? null : o.venta, despSig: o.despSig == null ? null : o.despSig, rem: camNum(g.rem) }; }) };
    w.nota = doc.nota || ''; return w;
  }
  function camHora() { var d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function camEstado(txt, mal) { S.camSyncMsg = { t: txt, mal: !!mal }; var e = document.querySelector('.cam-sync-est'); if (e) { e.textContent = txt; e.classList.toggle('neg', !!mal); } }
  function camTraer(forzar) {
    var sh = camSheet(); if (!sh || S.camEnv || (!forzar && S.camTraido && Date.now() - S.camTraido < 45000)) return Promise.resolve();
    S.camTraido = Date.now(); var gen = S.camGen || 0;
    return camPedir(sh.url + (sh.url.indexOf('?') < 0 ? '?' : '&') + 'k=' + encodeURIComponent(sh.k)).then(function (r) {
      if (!r || !r.ok) { camEstado('No pude leer tu Google Sheet' + (r && r.error ? ' (' + r.error + ')' : '') + '.', true); return; }
      if ((S.camGen || 0) !== gen || S.camEnv) return;   // mientras tanto se cambió algo acá: vale lo de acá
      return camAplicarHoja(r.semanas).then(function (k) { camEstado('Sincronizado con tu Google Sheet · ' + camHora()); if (k && S.tab === 'camara' && !escribiendo() && !S.camPegar) renderCamara(); });
    }, function () { camEstado('No pude conectarme con tu Google Sheet. Revisá internet.', true); });
  }
  // Manda semanas a la planilla (una tanda por vez) y guarda lo que la planilla devuelve.
  function camMandar(lunes) {
    lunes = (lunes || []).filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x || ''); });
    var sh = camSheet(); if (!sh || !lunes.length) return Promise.resolve();
    S.camGen = (S.camGen || 0) + 1; S.camCola = (S.camCola || []).concat(lunes);
    if (S.camEnv) return S.camEnv;
    var paso = function () {
      var l = (S.camCola || []).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort(); S.camCola = [];
      if (!l.length) { S.camEnv = null; return Promise.resolve(); }
      var c = camCalc(mas(l[l.length - 1], 7)), gen = S.camGen;
      camEstado('Guardando en tu Google Sheet…');
      return camPedir(sh.url, { k: sh.k, semanas: l.map(function (L) { return camSemanaParaHoja(L, c); }) }).then(function (r) {
        if (!r || !r.ok) { camEstado('No se pudo escribir en tu Google Sheet' + (r && r.error ? ' (' + r.error + ')' : '') + '.', true); return; }
        S.camTraido = Date.now();
        if (S.camGen === gen && !(S.camCola || []).length) return camAplicarHoja(r.semanas).then(function () { camEstado('Sincronizado con tu Google Sheet · ' + camHora()); });
        camEstado('Sincronizado con tu Google Sheet · ' + camHora());
      }, function () { camEstado('No pude conectarme con tu Google Sheet. El cambio quedó guardado acá.', true); }).then(paso);
    };
    S.camEnv = paso(); return S.camEnv;
  }
  // Conectar: se vincula (la planilla da una clave), se trae la planilla y se completan en ella las semanas que faltan hasta fin de año.
  function camConectar(url) {
    url = String(url || '').trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)) { S.camSheetErr = 'Ese link no parece el de la aplicación web. Tiene que empezar con https://script.google.com/'; renderCamara(); return Promise.resolve(); }
    S.camSheetErr = ''; S.camConectando = true; renderCamara();
    return camPedir(url + (url.indexOf('?') < 0 ? '?' : '&') + 'accion=vincular').then(function (r) {
      if (!r || !r.ok || !r.token) { S.camConectando = false; S.camSheetErr = r && r.error === 'clave incorrecta' ? 'Esa planilla ya estaba conectada. En Apps Script → Configuración del proyecto → Propiedades del script, borrá TOKEN y probá de nuevo.' : 'La planilla no respondió bien. Revisá que hayas pegado el código completo.'; renderCamara(); return; }
      return camAjustes({ sheet: { url: url, k: r.token, desde: hoy() } }).then(function () { return camAplicarHoja(r.semanas); }).then(function () {
        var ult = (r.semanas || []).map(function (w) { return w.lunes; }).sort().pop(), faltan = [];
        if (ult) for (var L = mas(ult, 7); L <= lunesDe(CAM_FIJO.hasta); L = mas(L, 7)) faltan.push(L);
        S.camConectando = false; S.camSheetAbierto = false; S.camTraido = Date.now();
        camEstado('Conectado: ' + (r.semanas || []).length + ' semanas traídas de tu Google Sheet' + (faltan.length ? '; completando ' + faltan.length + ' semanas hasta fin de año…' : '.'));
        renderCamara(); return camMandar(faltan).then(function () { if (S.tab === 'camara' && !escribiendo()) renderCamara(); });
      });
    }, function () { S.camConectando = false; S.camSheetErr = 'No pude conectarme. Revisá que en "Quién tiene acceso" hayas elegido "Cualquier persona".'; renderCamara(); });
  }
  function camSheetHTML() {
    var sh = camSheet(), m = S.camSyncMsg;
    if (!S.camSheetAbierto) return sh ? '<p class="cam-sync"><span class="cam-sync-ico" aria-hidden="true">⇄</span> <span class="cam-sync-est' + (m && m.mal ? ' neg' : '') + '">' + esc(m ? m.t : 'Conectado con tu Google Sheet') + '</span> <button class="btn sm" data-act="cam-sync-ya">Traer ahora</button> <button class="btn sm" data-act="cam-sheet">Opciones</button></p>' : '';
    if (sh) return '<div class="panel cam-pegar cam-sheet"><h3>Google Sheet conectada</h3><p class="small">Lo que cambies acá se escribe en tu planilla "FAENA POR DÍA", y lo que cambies en la planilla aparece acá (al abrir esta pestaña y cada minuto).</p><div class="acciones"><button class="btn" data-act="cam-sync-ya">Traer ahora</button><button class="btn" data-act="cam-sheet-subir">Mandar esta semana a la planilla</button><button class="btn" data-act="cam-sheet-quitar">' + (S._c2 === 'cam-sheet-quitar' ? '¿Seguro? Tocá de nuevo' : 'Desconectar') + '</button><button class="btn" data-act="cam-sheet">Cerrar</button></div></div>';
    return '<div class="panel cam-pegar cam-sheet"><h3>Conectar con tu Google Sheet</h3>'
      + '<p class="small">Se hace una sola vez, desde la compu (unos 5 minutos). Después se sincroniza solo, en los dos sentidos.</p>'
      + '<ol class="small"><li>Tocá <button class="btn sm" data-act="cam-sheet-copiar">Copiar el código</button>' + (S.camCopiado ? ' <b>✓ Copiado</b>' : '') + '</li>'
      + '<li>Abrí tu planilla "FAENA POR DÍA" → menú <b>Extensiones → Apps Script</b>.</li>'
      + '<li>Borrá lo que aparece escrito, pegá el código (Ctrl+V) y tocá el disquete 💾 para guardar.</li>'
      + '<li>Arriba a la derecha: <b>Implementar → Nueva implementación</b>. En el engranaje elegí <b>Aplicación web</b>. "Ejecutar como": <b>Yo</b>. "Quién tiene acceso": <b>Cualquier persona</b>. Tocá <b>Implementar</b>.</li>'
      + '<li>Google te pide permiso: <b>Autorizar acceso</b> → tu cuenta → si dice "Google no verificó esta app", tocá <b>Configuración avanzada → Ir a … (no seguro)</b> → <b>Permitir</b>. Es tu propio programa y solo toca esta planilla.</li>'
      + '<li>Copiá la <b>URL de la aplicación web</b> y pegala acá:</li></ol>'
      + '<input id="cam-sheet-url" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(S.camSheetUrl || '') + '">'
      + (S.camSheetErr ? '<p class="cam-prev neg">' + esc(S.camSheetErr) + '</p>' : '')
      + '<div class="acciones"><button class="btn pri" data-act="cam-sheet-conectar"' + (S.camConectando ? ' disabled' : '') + '>' + (S.camConectando ? 'Conectando…' : 'Conectar') + '</button><button class="btn" data-act="cam-sheet">Cancelar</button></div></div>';
  }

  /* ---------- inicio ---------- */
  /* ---------- inicio ----------
     Una tarjeta por pestaña, todas con el mismo orden: el día, los números del día y qué hay para el día siguiente. */
  // La fecha del día en el título: en rojo si ya pasó, en verde si es hoy; los días que vienen, como siempre.
  function fechaTit(f) { var h = hoy(), c = f < h ? 'pasado' : f === h ? 'hoy' : ''; return c ? '<span class="tit-dia ' + c + '" title="' + (c === 'hoy' ? 'Es hoy' : 'Este día ya pasó') + '">' + esc(tituloDe(f)) + '</span>' : esc(tituloDe(f)); }
  function plural(k, uno, muchos) { return k === 1 ? uno : muchos; }
  /* ---------- inicio ----------
     Arriba, el día con el que se está trabajando y sus números clave; después los avisos de lo que falta
     (solo para quien carga), una tarjeta por sección y, para quien carga, los próximos días. */
  var ICONOS = {
    rendering: '<path d="M6 20h12M8 20V9h8v11"/><path d="M10 9V5h4v4"/><path d="M10 13h4M10 16h4"/>',
    pedidos: '<path d="M9 4h6l1 2h3v14H5V6h3z"/><path d="M9 11h6M9 15h4"/>',
    produccion: '<path d="M4 20V10l5 3V10l5 3V6l6 4v10z"/><path d="M8 17h2M13 17h2"/>',
    ciclo3: '<path d="M6 8c0-2 2-3 3.5-1.5S12 9 14 7s4 0 4 2-2 3-3.5 1.5S12 9 10 11s-4 0-4-3z"/><path d="M6 16c0-2 2-3 3.5-1.5S12 17 14 15s4 0 4 2-2 3-3.5 1.5S12 17 10 19s-4 0-4-3z"/>',
    logistica: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
    medias: '<path d="M7 4h10v4l-2 12H9L7 8z"/><path d="M7 8h10"/>',
    camara: '<path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9"/><path d="M10 4.5l2 1.5 2-1.5M10 19.5l2-1.5 2 1.5"/>',
    clientes: '<circle cx="9" cy="9" r="3"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="8" r="2.4"/><path d="M15.5 13.5c2.6-.4 5.5 1.2 5.5 4"/>'
  };
  function icono(k) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + (ICONOS[k] || '') + '</svg>'; }
  function tarjeta(tab, titulo, dia, datos, vacio, marca, sigue, ico) {
    return '<button class="tile t-' + (ico || tab) + '" data-act="ir" data-tab="' + tab + '"' + (ico === 'ciclo3' ? ' data-ancla="embutidos"' : '') + '><span class="t-cab"><span class="t-ico">' + icono(ico || tab) + '</span><b>' + titulo + '</b>' + (marca || '') + '</span>'
      + '<span class="t-dia">' + esc(dia) + '</span>'
      + (datos.length ? '<span class="t-nums">' + datos.map(function (d, k) { return '<strong' + (k === 0 ? ' class="g"' : '') + '>' + n(d[0]) + '</strong><span>' + esc(d[1]) + '</span>'; }).join('') + '</span>' : '<span class="t-vacio">' + esc(vacio) + '</span>')
      + (sigue ? '<span class="t-sig">' + sigue + '</span>' : '') + '<span class="t-ir" aria-hidden="true">Abrir ›</span></button>';
  }
  // Kilos de una planilla: lo que empieza en kg, cajas o canastos (las cajas y canastos pasados a kg).
  // Kilos de los cortes de unos pedidos (las cajas y canastos pasados a kg).
  function kgPedidos(lista) { return kgOrden({ cortes: [{ lineas: [].concat.apply([], (lista || []).map(function (p) { return (p.cortes || []).map(function (c) { return { t: c.texto, c: c.corte }; }); })) }] }); }
  function kgOrden(o) {
    var t = 0;
    ((o && o.cortes) || []).forEach(function (c) { c.lineas.forEach(function (l) { var m = norm(enKg(l.t, l.c || c.corte)).match(/^([\d.,]+)\s*(KGS?|KILOS?|K)\b/); if (m) t += numero(m[1]); }); });
    return Math.round(t);
  }
  function renderInicio() {
    var el = $('view-inicio');
    if (cargando(el, S.prod && S.faena)) return;
    var h = hoy(), f = fechaProdInicial(), sig = habilSiguiente(f), html = '<div class="dash">';
    var rot = function (d) { return (d === h ? 'Hoy · ' : d === mas(h, 1) ? 'Mañana · ' : '') + tituloDe(d); };
    var neg = function (k, uno, muchos) { return '<strong>' + n(k) + '</strong> ' + plural(k, uno, muchos); };
    var pie = function (txt) { return '<span class="t-dia">' + esc(rot(sig)) + '</span><span>' + txt + '</span>'; };
    var deDia = function (d) { return (S.pedidos || []).filter(function (p) { return p.entrega === d; }); };
    var prodNum = function (id) {
      var o = prodDe(id), ids = {}, nl = 0;
      if (o) (o.cortes || []).forEach(function (c) { c.lineas.forEach(function (l) { nl++; if (l.p) ids[l.p] = 1; }); });
      return { o: o, nl: nl, peds: Object.keys(ids).length, kg: kgOrden(o) };
    };
    var logNum = function (d) { var lg = logDe(d), lp = ((lg && lg.pedidos) || []).filter(function (x) { return S.editor || x.camion; }), lc = (lg && lg.camiones) || []; return { p: lp.length, c: lc.length, s: lp.filter(function (x) { return !x.camion; }).length, kg: lp.reduce(function (t, x) { return t + (+x.kg || 0); }, 0) }; };
    var a = prodNum(f), b = prodNum(sig), a3 = prodNum('c3-' + f), b3 = prodNum('c3-' + sig), la = logNum(f), lb = logNum(sig);

    // Encabezado con los números del día.
    var kpi = function (v, txt, tab, ancla) { return '<button class="kpi" data-act="ir" data-tab="' + tab + '"' + (ancla ? ' data-ancla="' + ancla + '"' : '') + '><b>' + (v === '' ? '—' : n(v)) + '</b><span>' + esc(txt) + '</span></button>'; };
    var ph = deDia(f);
    html += '<section class="dash-hero"><div class="dh-txt"><p class="dh-sup">' + (f === h ? 'Trabajando hoy' : 'Próximo día de trabajo') + '</p><h2>' + esc(tituloDe(f)) + '</h2>'
      + '<p class="dh-sub">Después: ' + esc(tituloDe(sig).toLowerCase()) + '</p></div><div class="kpis">'
      + kpi(a.o ? +a.o.medias || 0 : '', 'medias a despostar', 'produccion')
      + (S.editor ? kpi(ph.length, plural(ph.length, 'pedido', 'pedidos') + ' para entregar', 'pedidos') : kpi(la.p, plural(la.p, 'pedido', 'pedidos') + ' para entregar', 'logistica'))
      + kpi(la.kg || '', 'kg a despachar', 'logistica')
      + kpi(la.c, plural(la.c, 'camión', 'camiones'), 'logistica')
      + kpi(a3.nl ? a3.kg : '', 'kg de embutidos', 'produccion', 'embutidos')
      + '</div></section>';

    // Lo que falta hacer (solo para quien carga).
    if (S.editor) {
      var av = [], aviso = function (num, txt, act, extra) { av.push('<button class="aviso" data-act="' + act + '"' + (extra || '') + '><strong>' + n(num) + '</strong> ' + esc(txt) + ' <span aria-hidden="true">›</span></button>'); };
      var nv = VENDEDORES ? ventasPendientes(true).length : 0; if (nv) aviso(nv, plural(nv, 'pedido de vendedor para revisar', 'pedidos de vendedores para revisar'), 'ir-ventas');
      var m = enProduccion(), sinSumar = 0; ph.forEach(function (p) { cortesDe(p).forEach(function (c) { if (c.texto && !fechaProdDe(m, p, c)) sinSumar++; }); });
      if (sinSumar) aviso(sinSumar, plural(sinSumar, 'corte sin sumar a producción', 'cortes sin sumar a producción') + ' (' + diaCorto(f) + ')', 'ini-dia', ' data-f="' + f + '"');
      if (la.s) aviso(la.s, plural(la.s, 'pedido sin camión', 'pedidos sin camión') + ' (' + diaCorto(f) + ')', 'ir', ' data-tab="logistica"');
      var sinCta = ph.filter(function (p) { return !cuentaPedido(p); }).length; if (sinCta) aviso(sinCta, plural(sinCta, 'cliente sin N° de cuenta', 'clientes sin N° de cuenta') + ' (' + diaCorto(f) + ')', 'ini-dia', ' data-f="' + f + '"');
      html += av.length ? '<div class="avisos">' + av.join('') + '</div>' : (ph.length ? '<p class="todo-ok">✓ Todo al día para el ' + esc(tituloDe(f).toLowerCase()) + '.</p>' : '');
    }

    // Una tarjeta por sección.
    html += '<div class="home">';
    if (S.camaraOk) html += camaraTileHTML();
    if (S.editor) {
      var ps = deDia(sig), mas2 = (S.pedidos || []).filter(function (p) { return p.entrega > sig; }).length;
      var pm = ph.reduce(function (t, p) { return t + (+p.medias || 0); }, 0), pc = kgPedidos(ph);
      var dp = ph.length ? [[ph.length, plural(ph.length, 'pedido', 'pedidos')]] : [];
      if (pm) dp.push([pm, plural(pm, 'media', 'medias')]);
      if (pc) dp.push([pc, 'kg de cortes']);
      html += tarjeta('pedidos', 'Pedidos', rot(f), dp, 'Sin pedidos cargados', '',
        pie(ps.length ? neg(ps.length, 'pedido', 'pedidos') : 'Sin pedidos') + (mas2 ? '<span>Más adelante: ' + neg(mas2, 'pedido', 'pedidos') + '</span>' : ''));
    }
    var da = [];
    if (a.nl) { da.push([a.kg, 'kg']); if (+a.o.medias) da.push([+a.o.medias, 'medias a despostar']); }
    html += tarjeta('produccion', 'Producción', rot(f), da, 'Todavía no hay nada cargado',
      a.nl ? '<span class="badge ' + (a.o.estado === 'borrador' ? 'warn">Borrador' : 'ok">Confirmada') + '</span>' : '',
      pie(b.nl ? neg(b.kg, 'kg', 'kg') + (b.o.estado === 'borrador' ? ' · borrador' : ' · confirmada') : 'Sin cargar'));
    var d3 = [];
    if (a3.nl) { d3.push([a3.kg, 'kg']); if (a3.peds) d3.push([a3.peds, plural(a3.peds, 'pedido', 'pedidos')]); }
    html += tarjeta('produccion', 'Embutidos', rot(f), d3, 'Sin embutidos cargados',
      a3.nl ? '<span class="badge ' + (a3.o.estado === 'borrador' ? 'warn">Borrador' : 'ok">Confirmada') + '</span>' : '',
      pie(b3.nl ? neg(b3.kg, 'kg', 'kg') : 'Sin cargar'), 'ciclo3');
    var dl = [];
    if (la.p) { dl.push([la.p, plural(la.p, 'pedido', 'pedidos')]); dl.push([la.c, plural(la.c, 'camión armado', 'camiones armados')]); if (la.s) dl.push([la.s, 'sin camión']); }
    html += tarjeta('logistica', 'Logística', rot(f), dl, 'Sin pedidos para entregar', '',
      pie(lb.p ? neg(lb.p, 'pedido', 'pedidos') + ' · ' + neg(lb.c, 'camión', 'camiones') : 'Sin pedidos'));
    var medNum = function (d) { var x = diaFaena(d), cl = x ? conMedias(x.d) : []; return { c: cl.length, a: cl.reduce(function (t, r) { return t + (+r.cant || 0); }, 0) }; };
    var ma = medNum(f), mb = medNum(sig);
    html += tarjeta('medias', 'Medias', rot(f), ma.c ? [[ma.c, plural(ma.c, 'cliente', 'clientes')], [ma.a, plural(ma.a, 'animal', 'animales')]] : [], 'Sin ventas cargadas', '',
      pie(mb.c ? neg(mb.c, 'cliente', 'clientes') + ' · ' + neg(mb.a, 'animal', 'animales') : 'Sin ventas cargadas'));
    var rq = rendDia(rendFechaInicial());
    html += tarjeta('rendering', 'Rendering', (rendFechaInicial() === h ? 'Hoy · ' : '') + diaCorto(rendFechaInicial()), rq.tIns ? [[rq.tIns, 'kg de insumos'], [rq.tProd, 'kg producidos']] : [], rq.hoy ? 'Sin faena cargada para estimar' : 'Sin datos cargados', rq.hoy && rq.estim ? '<span class="badge warn">Estimado</span>' : '', '');
    if (S.editor) {
      var lc = clientes(), sn = lc.filter(function (x) { return !x.c; }).length;
      html += tarjeta('clientes', 'Clientes', 'Números de cuenta', lc.length ? [[lc.length, plural(lc.length, 'cliente', 'clientes')]].concat(sn ? [[sn, 'sin número']] : []) : [], 'Todavía no hay clientes cargados', '', '');
    }
    html += '</div>';

    // Próximos días hábiles: cuántos pedidos y medias hay cargados en cada uno.
    if (S.editor) {
      var dias = [f]; while (dias.length < 6) dias.push(habilSiguiente(dias[dias.length - 1]));
      var datos = dias.map(function (d) { var l = deDia(d); return { d: d, p: l.length, m: l.reduce(function (t, p) { return t + (+p.medias || 0); }, 0), c: logNum(d).c }; });
      var mx = Math.max.apply(null, datos.map(function (x) { return x.p; }).concat([1]));
      html += '<section class="panel prox"><h3>Próximos días</h3><div class="prox-dias">' + datos.map(function (x) {
        return '<button class="prox-d' + (x.d === f ? ' hoy' : '') + '" data-act="ini-dia" data-f="' + x.d + '"><span class="pd-dia">' + esc(diaCorto(x.d)) + '</span>'
          + '<span class="pd-barra"><i style="height:' + Math.round(x.p / mx * 100) + '%"></i></span>'
          + '<span class="pd-num"><b>' + n(x.p) + '</b> ' + plural(x.p, 'pedido', 'pedidos') + '</span>'
          + '<span class="pd-det">' + (x.m ? n(x.m) + ' medias' : '—') + (x.c ? ' · ' + x.c + ' ' + plural(x.c, 'camión', 'camiones') : '') + '</span></button>';
      }).join('') + '</div></section>';
    }
    el.innerHTML = html + '</div>';
  }
  // Volver al inicio deja todo parado en el día de hoy.
  function alInicio() { asentarEdicion(); S.em = null; S.ep = null; S.fechaFija = false; S.fecha = null; S.sem = null; S.dia = null; S.entrega = null; S.fm = null; S.mv = null; S.fl = null; S.ec = null; S.ef = false; S.pd = null; }

  /* ---------- estados, sesión y navegación ---------- */
  function cargando(el, data) {
    var msg = S.status === 'loading' && !data ? 'Cargando…' : S.status === 'error' && !data ? 'No se pudieron cargar los datos. Revisá la conexión y volvé a abrir la app.' : '';
    if (msg) { el.innerHTML = '<div class="panel"><p class="state">' + msg + '</p></div>'; return true; }
    return false;
  }
  /* Barra de arriba de cada pantalla: el título a la izquierda, las flechas ‹ › con la fecha juntas en el medio
     y los demás botones a la derecha. Se acomoda sola cada vez que se dibuja una barra. */
  /* Imprimir desde el celular en la compu (pedido de Renzo): una compu marcada como "impresora" (en Configuración) avisa
     cada 2 minutos que está prendida (privado/impresora). El celular manda en privado/imprimir qué pantalla imprimir
     (pestaña y fecha); la compu la abre y aprieta su propio "Imprimir". Con Chrome abierto con --kiosk-printing sale directo. */
  /* PIN de esta compu (pedido de Renzo): para que otro que se siente en la compu no use la app con su cuenta.
     El PIN queda solo en esta compu (localStorage, cifrado). La app se bloquea al abrirla y después de 10 min sin uso;
     lo que manda el celular a imprimir sigue saliendo igual. Si se olvida el PIN: "Salir" y volver a entrar con la cuenta lo borra. */
  var PIN_MIN = 10;
  function pinGuardado() { try { return localStorage.getItem('qualita-pin') || ''; } catch (e) { return ''; } }
  function pinHash(pin) {
    var t = 'qualita|' + String(pin);
    if (window.crypto && crypto.subtle && window.TextEncoder) return crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
    return Promise.resolve(t);
  }
  var pinUso = Date.now();
  function bloquear() {
    if (!pinGuardado() || !S.editor || document.getElementById('pin-lock')) return;
    var v = document.createElement('div'); v.id = 'pin-lock'; v.className = 'pin-lock'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'App bloqueada');
    v.innerHTML = '<div class="pin-caja"><b>App bloqueada</b><p class="small muted">Ingresá tu PIN para usarla.</p><input type="password" inputmode="numeric" id="pin-in" autocomplete="off" maxlength="8" aria-label="PIN"><p class="pin-err small" id="pin-err"></p>'
      + '<div class="acciones"><button class="btn pri" data-act="pin-ok">Entrar</button></div><p class="small muted">Lo que mandes a imprimir desde el celular sale igual. ¿Te olvidaste el PIN? <button class="btn sm lnk" data-act="pin-olvide">Salir y entrar con tu cuenta</button></p></div>';
    document.body.appendChild(v); setTimeout(function () { var i = $('pin-in'); if (i) i.focus(); }, 50);
  }
  function probarPin() {
    var i = $('pin-in'); if (!i) return;
    pinHash(i.value).then(function (h) {
      if (h === pinGuardado()) { var v = $('pin-lock'); if (v) v.remove(); pinUso = Date.now(); }
      else { i.value = ''; var er = $('pin-err'); if (er) er.textContent = 'PIN incorrecto.'; i.focus(); }
    });
  }
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { if (!document.getElementById('pin-lock')) pinUso = Date.now(); }, { passive: true, capture: true }); });
  setInterval(function () { if (pinGuardado() && Date.now() - pinUso > PIN_MIN * 60000) bloquear(); }, 20000);
  var IMP_KEYS = ['tab', 'mv', 'fm', 'sem', 'dia', 'fl', 'resumen', 'fecha', 'pv', 'fr'];
  // Un celular o tablet nunca es "la compu que imprime" (si quedó tildado ahí, el celular escondía el botón de mandar a imprimir).
  function esCelu() { try { return matchMedia('(pointer:coarse)').matches && !matchMedia('(any-pointer:fine)').matches; } catch (e) { return false; } }
  function esImpresora() { if (esCelu()) return false; try { return localStorage.getItem('qualita-imprime') === '1'; } catch (e) { return false; } }
  function nombreImpresora() { try { return localStorage.getItem('qualita-imprime-nombre') || 'Compu'; } catch (e) { return 'Compu'; } }
  function impRemotoOk() { return !!(S.editor && !S.solo && !esImpresora() && S.impresora && S.impresora.visto && Date.now() - S.impresora.visto < 6 * 60000); }
  // '' = no hay compu configurada; 'off' = configurada pero sin la app abierta (el botón igual se ve, para que se entienda qué pasa).
  function impEstado() { if (!(S.editor && !S.solo && !esImpresora() && S.impresora && S.impresora.visto)) return ''; return impRemotoOk() ? 'on' : 'off'; }
  // Para saber qué pasa con la impresora desde cualquier lado (celular o compu).
  function impEstadoTxt() {
    var i = S.impresora;
    if (!i || !i.visto) return 'ninguna compu marcada como impresora todavía.';
    var min = Math.max(0, Math.round((Date.now() - i.visto) / 60000));
    return 'la compu "' + esc(i.nombre || 'Compu') + '" ' + (min < 6 ? 'está prendida con la app abierta (avisó hace ' + (min ? min + ' min' : 'menos de 1 min') + ').' : 'no avisa desde hace ' + (min < 120 ? min + ' min' : Math.round(min / 60) + ' h') + ': está apagada o con la app cerrada.') + (esImpresora() ? ' (Es esta compu.)' : '');
  }
  var latidoImp = null;
  function latirImpresora() {
    clearInterval(latidoImp); latidoImp = null;
    if (!esImpresora() || !S.editor) return;
    var latir = function () { store.set('privado', 'impresora', { nombre: nombreImpresora(), visto: Date.now() }).then(null, function () {}); };
    latir(); latidoImp = setInterval(latir, 2 * 60000);
  }
  // Cartelito en el celular antes de mandar: cuántas copias.
  function abrirHojaImp() {
    var v = document.getElementById('imp-hoja'); if (v) { v.remove(); return; }
    v = document.createElement('div'); v.id = 'imp-hoja'; v.className = 'imp-hoja'; v.setAttribute('role', 'dialog');
    v.innerHTML = '<b>Imprimir en ' + esc((S.impresora && S.impresora.nombre) || 'la compu') + '</b><div class="imp-cop"><span>Copias</span><button class="btn" data-act="imp-menos" aria-label="Una copia menos">−</button><b id="imp-n">1</b><button class="btn" data-act="imp-mas" aria-label="Una copia más">+</button></div>'
      + '<div class="acciones"><button class="btn pri" data-act="imp-mandar">Imprimir</button><button class="btn" data-act="imp-cerrar">Cancelar</button></div>';
    document.body.appendChild(v);
  }
  function mandarAImprimir(copias) {
    var job = { jid: uid(), ts: Date.now(), quien: S.user ? S.user.email : '', copias: Math.max(1, Math.min(20, +copias || 1)) };
    IMP_KEYS.forEach(function (k) { if (S[k] != null) job[k] = S[k]; });
    return store.set('privado', 'imprimir', job).then(function () { S.impEsperando = job.jid; avisar('Mandado a imprimir a la compu' + (S.impresora && S.impresora.nombre ? ' (' + S.impresora.nombre + ')' : '') + '…', 4000); }, function () { avisar('!No se pudo mandar. Revisá la conexión.', 6000); });
  }
  function recibirImpresion(job) {
    if (!job) return;
    if (S.impEsperando && job.jid === S.impEsperando && job.hecho) { S.impEsperando = null; avisar('Listo: se imprimió en ' + (job.por || 'la compu') + '.', 5000); return; }
    if (!esImpresora() || job.hecho || !job.ts || Date.now() - job.ts > 5 * 60000) return;
    var ult = ''; try { ult = localStorage.getItem('qualita-imprime-ult') || ''; } catch (e) {}
    if (ult === job.jid) return;
    try { localStorage.setItem('qualita-imprime-ult', job.jid); } catch (e) {}
    if (S.ep) { asentarEdicion(); S.ep = null; } S.em = null; S.ec = null;
    IMP_KEYS.forEach(function (k) { if (k in job) S[k] = job[k]; });
    if (job.tab === 'produccion') S.fechaFija = true;
    render();
    setTimeout(function () {
      var sel = '#view-' + (job.tab === 'ciclo3' ? 'ciclo3' : job.tab) + ' .nav [data-act="imprimir"]', n = Math.max(1, Math.min(20, +job.copias || 1)), k = 0;
      // Cada copia es una impresión (con Chrome en --kiosk-printing salen solas, una atrás de la otra).
      (function otra() { var b = document.querySelector(sel); if (!b) return; if (b.disabled) { setTimeout(otra, 800); return; } b.click(); if (++k < n) setTimeout(otra, 3500); })();
      var hecho = clone(job); delete hecho.id; hecho.hecho = Date.now(); hecho.por = nombreImpresora();
      store.set('privado', 'imprimir', hecho).then(null, function () {});
    }, 1500);
  }
  function armarNav(nav) {
    if (nav.classList.contains('armada')) return;
    var steps = nav.querySelectorAll(':scope > .btn.step'), tit = nav.querySelector(':scope > .tit');
    if (steps.length < 2 || !tit) return;
    var dia = document.createElement('span'), acc = document.createElement('span');
    dia.className = 'nav-dia'; acc.className = 'nav-acc';
    var sig = steps[1].nextElementSibling, fecha = sig && sig.tagName === 'INPUT' && sig.type === 'date' ? sig : null;
    dia.appendChild(steps[0]); dia.appendChild(steps[1]); if (fecha) dia.appendChild(fecha);
    Array.prototype.slice.call(nav.children).forEach(function (x) { if (x !== tit) acc.appendChild(x); });
    nav.appendChild(dia); nav.appendChild(acc);
    nav.classList.add('armada');
    var bi = acc.querySelector('[data-act="imprimir"]');
    var est = impEstado();
    if (nav.closest('#view-logistica')) est = '';   // en Logística va adentro del menú ▾ de Imprimir
    if (est === 'off' && !esCelu()) est = '';         // en la compu no ocupa lugar si la impresora está apagada
    if (bi && est) { var br = document.createElement('button'); br.className = 'btn imp-remoto' + (est === 'off' ? ' off' : ''); br.dataset.act = 'imprimir-remoto'; br.textContent = '🖨 Imprimir en la compu' + (S.impresora.nombre ? ' (' + S.impresora.nombre + ')' : '') + (est === 'off' ? ' · apagada' : ''); bi.insertAdjacentElement('afterend', br); }
  }
  if (window.MutationObserver) new MutationObserver(function () { document.querySelectorAll('.nav:not(.armada)').forEach(armarNav); }).observe(document.body, { childList: true, subtree: true });
  function render() {
    $('stamp').textContent = (S.config.actualizado ? 'Actualizado: ' + S.config.actualizado : '') + (S.fuente === 'cache' ? ' · sin conexión' : '');
    var ht = $('hoy-txt'); if (ht) ht.textContent = 'Hoy es ' + tituloDe(hoy()).toLowerCase();
    var e = $('sesion');
    if (S.solo) { S.tab = S.solo; S.editor = false; }
    $('tabs').hidden = !!S.solo;
    if (!store || !store.signIn || S.solo) e.innerHTML = '';
    else if (!S.user) e.innerHTML = '<button class="btn sm lnk" data-act="ingresar">Ingresar para cargar</button>';
    else e.innerHTML = '<span>' + esc(S.user.email) + (S.editor ? '' : ' · sin permiso para cargar') + '</span><button class="btn sm lnk" data-act="salir">Salir</button>';
    $('tab-pedidos').hidden = !S.editor; $('tab-clientes').hidden = !S.editor; $('tab-camara').hidden = !S.camaraOk || !!S.solo;
    if (S.tab === 'camara' && (!S.camaraOk || S.solo)) { if (!S.solo) S.volver = 'camara'; S.tab = 'inicio'; }
    $('tabs').classList.toggle('muchas', !!S.editor);
    // Si la página se abrió (o se recargó sola) en Pedidos o Clientes, se vuelve ahí apenas se confirma el permiso.
    if ((S.tab === 'pedidos' || S.tab === 'clientes') && !S.editor) { S.volver = S.tab; S.tab = 'inicio'; }
    TABS.forEach(function (t) { $('view-' + t).hidden = S.tab !== t; if (S.tab !== t) $('view-' + t).innerHTML = ''; var tb = $('tab-' + t); if (tb) tb.setAttribute('aria-selected', String(S.tab === t)); });
    if (S.tab === 'medias') renderMedias(); else if (S.tab === 'pedidos') renderPedidos(); else if (S.tab === 'produccion' || S.tab === 'ciclo3') renderProduccion(); else if (S.tab === 'logistica') renderLogistica(); else if (S.tab === 'rendering') renderRendering(); else if (S.tab === 'clientes') renderClientes(); else if (S.tab === 'camara') renderCamara(); else renderInicio();
  }
  // Cuando llegan datos nuevos no se redibuja la pantalla en la que se está escribiendo.
  function renderDatos() {
    if (S.tab === 'medias' && S.em) return pintarSumas();
    if ((S.tab === 'produccion' || S.tab === 'ciclo3') && S.ep) return;
    if (S.tab === 'pedidos' && (S.prop.length || escribiendo())) return;
    if (S.tab === 'clientes' && escribiendo()) return;
    if (S.tab === 'camara' && (escribiendo() || S.camPegar)) return;
    if (S.tab === 'logistica' && (S.ec || S.ef || (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.flete))) return;
    render();
  }
  function irA(tab) { if (S.solo) tab = S.solo; S.volver = null; S.tab = tab; try { history.replaceState(null, '', '#' + tab); } catch (err) {} render(); window.scrollTo(0, 0); }

  document.querySelector('.top').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (!b) return; e.preventDefault(); if (b.dataset.tab === 'inicio') alInicio(); if (S.ep) { asentarEdicion(); S.ep = null; } S.ec = null; S.msg.fotos = ''; S.msg.log = ''; S.pegar = false; if (!S.leyendo) { S.pegarTxt = ''; S.pegarCli = ''; S.pegarDia = ''; } irA(b.dataset.tab); });

  document.addEventListener('click', function (e) {
    if (S.menuAb && !e.target.closest('.mas-btn')) { var keep = e.target.closest('[data-act="cam-borrar"]'); if (!keep || S._c2 === 'cam-borrar' + keep.dataset.i) cerrarMenus(); }
    var b = e.target.closest('[data-act]'); if (!b) return;
    var a = b.dataset.act, D = b.dataset, o, c;
    if (a === 'menu') { S.menuAb = S.menuAb === D.k ? null : D.k; render(); return; }
    if (S._c2 && S._c2 !== a + (D.i == null ? '' : D.i)) S._c2 = null;

    if (a === 'actualizar') { recargar(); return; }
    if (a === 'link-log' || a === 'link-prod' || a === 'link-c3' || a === 'link-rend' || a === 'link-medias') {
      var pag = a === 'link-medias' ? 'medias' : a === 'link-rend' ? 'rendering' : a === 'link-c3' ? 'ciclo3' : a === 'link-prod' ? 'produccion' : 'logistica', km = a === 'link-log' ? 'log' : a === 'link-rend' ? 'rend' : a === 'link-medias' ? 'medias' : 'prod', nom = a === 'link-medias' ? 'Medias' : a === 'link-rend' ? 'Rendering' : a === 'link-c3' ? 'Ciclo III' : a === 'link-prod' ? 'Producción' : 'Logística';
      var url = location.origin + location.pathname.replace(/[^\/]*$/, '') + pag, listo = function () { S.msg[km] = 'Link copiado: ' + url; pintarMsg(km); avisar('Link de ' + nom + ' copiado. Pegalo donde quieras compartirlo.', 6000); };
      var aMano = function () { S.msg[km] = 'Link para compartir: ' + url; pintarMsg(km); avisar('Link para compartir: ' + url, 15000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(listo, aMano); else aMano();
      return;
    }
    if (a === 'iva') { guardarIva(D.id, D.k, D.v).then(null, function () { avisar('!No se pudo guardar. Revisá la conexión.', 6000); }); renderPedidos(); return; }
    if (a === 'cta-cancelar') { S.ctaOtro = null; renderPedidos(); return; }
    if (a === 'cta-otro') { S.ctaOtro = D.id; renderPedidos(); var co = document.querySelector('[data-cta-in="' + D.id + '"]'); if (co) co.focus(); return; }
    if (a === 'cta-guardar') {
      var vi = (document.querySelector('[data-cta-in="' + D.id + '"]') || {}).value || '', pg = pedidoDe(D.id); vi = vi.replace(/\s+/g, '');
      if (!vi) { avisar('!Escribí el número de cuenta.', 4000); return; }
      S.ctaOtro = null;
      ponerCuenta(D.id, vi).then(function () { avisar('Cuenta ' + vi + ' guardada para ' + (pg ? pg.cliente : 'el cliente') + '.', 5000); renderPedidos(); }, function () { avisar('!No se pudo guardar. Revisá la conexión.', 6000); renderPedidos(); });
      return;
    }
    if (a === 'cli-agregar' || a === 'cli-pegar' || a === 'cli-traer') {
      var nuevos = a === 'cli-agregar' ? [{ n: $('cli-n').value, c: $('cli-c').value }] : a === 'cli-pegar' ? leerListaClientes($('cli-txt').value) : clientesConocidos();
      nuevos = nuevos.filter(function (x) { return norm(x.n); });
      if (!nuevos.length) { S.msg.cli = a === 'cli-agregar' ? '!Falta el nombre del cliente.' : '!No encontré clientes en lo que pegaste.'; pintarMsg('cli'); if (a !== 'cli-agregar') avisar(S.msg.cli, 6000); return; }
      if (a !== 'cli-agregar') S._cliVarios = false;
      sumarClientes(nuevos, a === 'cli-pegar').then(function (r) {
        S.msg.cli = r.altas + plural(r.altas, ' cliente agregado', ' clientes agregados') + (r.cambios ? ' · ' + r.cambios + plural(r.cambios, ' número actualizado', ' números actualizados') : '') + '.';
        avisar(S.msg.cli, 5000); renderClientes(); var fn = $('cli-c'); if (fn && a === 'cli-agregar') fn.focus();
      }, function () { S.msg.cli = '!No se pudo guardar. Revisá la conexión.'; pintarMsg('cli'); });
      return;
    }
    if (a === 'rep-mz-pdf') { var Lz = S.repSem || lunesDe(hoy()), pz = String(Lz).split('-'); compartirPDF(function () { return repMatrizPDF(); }, b, true, norm(S.repCli == null ? 'DINO' : S.repCli) + ' por corte ' + pz[2] + '-' + pz[1] + '.pdf'); return; }
    if (a === 'rep-sem') { S.repSem = mas(S.repSem || lunesDe(hoy()), +D.d); renderClientes(); return; }
    if (a === 'rep-copiar') {
      var txr = repTexto(), okr = function () { var g = $('g-rep'); if (g) g.textContent = 'Copiado: pegalo en WhatsApp o en un mail.'; };
      if (window.__mock) { window.__mock.copiado = txr; okr(); return; }
      try { navigator.clipboard.writeText(txr).then(okr, function () { window.prompt('Copiá el reporte:', txr); }); } catch (err) { window.prompt('Copiá el reporte:', txr); }
      return;
    }
    if (a === 'rep-excel') {
      var csv = '\ufeff' + repTexto(';'), Lr = S.repSem || lunesDe(hoy()), nomr = 'kilos-' + norm(S.repCli == null ? 'DINO' : S.repCli).replace(/\s+/g, '-').toLowerCase() + '-' + Lr + '.csv';
      if (window.__mock) { window.__mock.excel = { nombre: nomr, csv: csv }; return; }
      var ur = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), ar = document.createElement('a'); ar.href = ur; ar.download = nomr; document.body.appendChild(ar); ar.click(); ar.remove(); setTimeout(function () { URL.revokeObjectURL(ur); }, 4000);
      return;
    }
    if (a === 'cli-quitar') {
      var lq = clone(clientes()); lq.splice(+D.i, 1);
      escribirClientes(lq).then(renderClientes, function () { avisar('!No se pudo quitar. Revisá la conexión.', 6000); });
      return;
    }
    if (a === 'ir') { irA(D.tab); if (D.ancla) { var an = $(D.ancla); if (an) an.scrollIntoView(); } }
    else if (a === 'ini-dia') { S.pd = D.f; S.abierto = {}; irA('pedidos'); }
    else if (a === 'imprimir' && S.tab === 'logistica' && !S.resumen) { imprimirAjustado(); }
    else if (a === 'res-wa') {
      var fw = D.f, idsW = D.cual === 'todos' ? null : D.cual !== 'sel' ? [D.cual] : camionesDe(fw).filter(function (c) { return (S.resSel || {})[fw + '|' + c.id]; }).map(function (c) { return c.id; }).concat((S.resSel || {})[fw + '|_sin'] ? ['_sin'] : []);
      if (idsW && !idsW.length) return;
      // Teléfono: el del chofer del camión (o de los tildados, si todos son del mismo chofer).
      var camsW = camionesDe(fw).filter(function (c) { return idsW && idsW.indexOf(c.id) >= 0; }), telsW = camsW.map(function (c) { return telChofer(nomCam(c)); });
      var telW = telsW.length && telsW[0] && telsW.every(function (x) { return telWA(x) === telWA(telsW[0]); }) ? telsW[0] : '';
      compartirWhatsApp(resumenTexto(fw, idsW), telW);
    }
    else if (a === 'res-pdf') {
      var fp = D.f, idsP = D.cual ? [D.cual] : camionesDe(fp).filter(function (c) { return (S.resSel || {})[fp + '|' + c.id]; }).map(function (c) { return c.id; }).concat((S.resSel || {})[fp + '|_sin'] ? ['_sin'] : []);
      var xp = String(fp).split('-');
      compartirPDF(function () { return resumenPDF(fp, idsP.length ? idsP : null); }, b, true, 'Resumen ' + xp[2] + '-' + xp[1] + (idsP.length === 1 ? ' ' + (idsP[0] === '_sin' ? 'Sin camión' : nomCam(camionesDe(fp).filter(function (c) { return c.id === idsP[0]; })[0])) : '') + '.pdf');
    }
    else if (a === 'm-pdf') {
      var fm2 = D.f, xm = diaFaena(fm2), clm = xm ? conMedias(xm.d) : [], totm = clm.reduce(function (t, r) { return t + (+r.cant || 0); }, 0), pm = String(fm2).split('-');
      var datosM = { cab: { sup: 'Medias · Animales para clientes', tit: 'FAENA · ' + diaDe(fm2) + ' ' + pm[2] + '-' + pm[1] + '-' + pm[0].slice(2), dato: animales(totm), estado: '' },
        renglones: clm.map(function (r) { return { tipo: 'op', trozos: [{ t: String(r.cliente || 'Sin nombre').toUpperCase() }].concat(r.nota ? [{ t: '  ' + r.nota, gris: true }] : []), der: n(+r.cant || 0) }; })
          .concat([{ tipo: 'tit', trozos: [{ t: 'TOTAL' }], der: animales(totm) }, { tipo: 'nota', trozos: [{ t: 'Un animal son dos medias. Faena del ' + tituloDe(fm2).toLowerCase() + ', se entregan el ' + tituloDe(habilSiguiente(fm2)).toLowerCase() + '.', gris: true }] }]) };
      compartirPDF(datosM, b, true, 'Medias ' + pm[2] + '-' + pm[1] + '.pdf');
    }
    else if (a === 'imprimir-remoto') { if (impRemotoOk()) abrirHojaImp(); else avisar('!La compu' + (S.impresora && S.impresora.nombre ? ' (' + S.impresora.nombre + ')' : '') + ' no tiene la app abierta. Abrila allá, esperá unos segundos y probá de nuevo.', 7000); }
    else if (a === 'imp-mas' || a === 'imp-menos') { var en = $('imp-n'); if (en) en.textContent = Math.max(1, Math.min(20, +en.textContent + (a === 'imp-mas' ? 1 : -1))); }
    else if (a === 'imp-mandar') { var cn = $('imp-n'), cc = cn ? +cn.textContent : 1, hj = $('imp-hoja'); if (hj) hj.remove(); mandarAImprimir(cc); }
    else if (a === 'imp-cerrar') { var hj2 = $('imp-hoja'); if (hj2) hj2.remove(); }
    else if (a === 'imp-esta') { var on = !esImpresora(); try { localStorage.setItem('qualita-imprime', on ? '1' : '0'); } catch (e) {} latirImpresora(); if (!on) store.set('privado', 'impresora', { nombre: '', visto: 0 }).then(null, function () {}); render(); }
    else if (a === 'md-editar') { S.mdEdit = !S.mdEdit; render(); }
    else if (a === 'res-saludos') { S.resSaludos = !S.resSaludos; render(); }
    else if (a === 'cam-deshacer' || a === 'cam-rehacer') camDeshacer(a === 'cam-rehacer');
    else if (a === 'res-tels') { S.resTels = !S.resTels; render(); }
    else if (a === 'res-sel-nada') { var fn0 = D.f; Object.keys(S.resSel || {}).forEach(function (k) { if (k.indexOf(fn0 + '|') === 0) delete S.resSel[k]; }); render(); }
    else if (a === 'imprimir-camiones') {
      // Todo el día, pero cada camión empieza en una hoja nueva (sin achicar para juntar camiones).
      var vlc = $('view-logistica'); vlc.classList.add('por-camion');
      var hjc = $('hoja-impresion');
      if (!hjc) { hjc = document.createElement('style'); hjc.id = 'hoja-impresion'; document.head.appendChild(hjc); }
      hjc.textContent = '@page{size:A4 portrait;margin:10mm}';
      var limpiarC = function () { vlc.classList.remove('por-camion'); window.removeEventListener('afterprint', limpiarC); };
      window.addEventListener('afterprint', limpiarC);
      setTimeout(function () { window.print(); setTimeout(limpiarC, 60000); }, 60);
    }
    else if (a === 'cam-imprimir') {
      // Solo ese camión: los demás se ocultan mientras dura la impresión.
      var vl = $('view-logistica'), sec = null;
      Array.prototype.forEach.call(vl.querySelectorAll('.cam'), function (x) { x.classList.remove('sale'); if (x.getAttribute('data-cam') === D.id) sec = x; });
      if (!sec) return;
      sec.classList.add('sale'); vl.classList.add('un-camion');
      var hj = $('hoja-impresion');
      if (!hj) { hj = document.createElement('style'); hj.id = 'hoja-impresion'; document.head.appendChild(hj); }
      hj.textContent = '@page{size:A4 portrait;margin:10mm}';
      var limpiar = function () { vl.classList.remove('un-camion'); sec.classList.remove('sale'); window.removeEventListener('afterprint', limpiar); };
      window.addEventListener('afterprint', limpiar);
      imprimirAjustado(function () { setTimeout(limpiar, 60000); });
    }
    else if (a === 'cam-subir' || a === 'cam-bajar') { moverEnCamion(S.fl, D.cam, D.id, a === 'cam-subir' ? -1 : 1).then(render, function () { S.msg.log = '!No se pudo guardar.'; render(); }); }
    else if (a === 'resumen') { S.resumen = !S.resumen; render(); }
    else if (a === 'hoja-pdf') { compartirPDF(b.closest('.hoja'), b); }
    // Una sola planilla (la de cortes o la de embutidos), sin las demás.
    else if (a === 'hoja-imprimir') { var hjx = b.closest('.hoja'); if (hjx) imprimirPDF([hjx], b); }
    else if (a === 'imprimir' && S.tab === 'produccion' && !S.ep && document.querySelector('#view-produccion .hoja')) { imprimirPDF(Array.prototype.slice.call(document.querySelectorAll('#view-produccion .hoja')), b); }
    else if (a === 'imprimir') {
      // Se imprime siempre la vista de lectura, no la de edición.
      if (S.em) { guardar('medias', true); S.em = null; }
      if (S.ep) { guardar('prod', true); S.ep = null; }
      render();
      var hoja = $('hoja-impresion');
      if (!hoja) { hoja = document.createElement('style'); hoja.id = 'hoja-impresion'; document.head.appendChild(hoja); }
      hoja.textContent = '@page{size:A4 ' + (S.tab === 'medias' && mvAct() === 'semana' ? 'landscape' : 'portrait') + ';margin:10mm}';
      setTimeout(function () { window.print(); }, 80);
    }
    else if (a === 'ingresar') { if (window.Acceso && store.entrarMail) window.Acceso.abrir(store); else store.signIn().catch(function () {}); }
    else if (a === 'salir') { try { localStorage.removeItem('qualita-pin'); } catch (er) {} store.signOut(); }
    else if (a === 'pin-ok') probarPin();
    else if (a === 'pin-olvide') { try { localStorage.removeItem('qualita-pin'); } catch (er) {} var vl = $('pin-lock'); if (vl) vl.remove(); store.signOut(); }
    else if (a === 'pin-bloquear') bloquear();
    else if (a === 'pin-sacar') { try { localStorage.removeItem('qualita-pin'); } catch (er) {} avisar('PIN sacado: esta compu ya no se bloquea.', 4000); render(); }
    else if (a === 'pin-poner') { var pn = String(($('pin-nuevo') || {}).value || '').trim(); if (!/^\d{4,8}$/.test(pn)) { avisar('!El PIN tiene que ser de 4 a 8 números.', 5000); return; } pinHash(pn).then(function (h) { try { localStorage.setItem('qualita-pin', h); } catch (er) {} pinUso = Date.now(); avisar('PIN puesto. La app se bloquea al abrirla y después de ' + PIN_MIN + ' min sin uso.', 6000); render(); }); }
    else if (a === 'wa-pdf') { compartirPDF(b.closest('.hoja'), b, true); }
    else if (a === 'copiar') {
      var ta = $('txt-' + (D.t || 'orden')), msg = $('copiado-' + (D.t || 'orden')); ta.hidden = false;
      var ok = function () { msg.textContent = 'Copiado.'; }, no = function () { ta.focus(); ta.select(); msg.textContent = 'Seleccionado: copialo con Ctrl+C o manteniendo apretado.'; };
      try { navigator.clipboard.writeText(ta.value).then(ok, no); } catch (err) { no(); }
    }

    // medias
    else if (a === 'fm-ir') { S.fm = D.f; render(); }
    else if (a === 'm-semana' || a === 'm-editar-dia') {
      S.mv = 'semana'; S.sem = lunesDe(S.fm); S.dia = Math.round((fecha(S.fm) - fecha(S.sem)) / 86400000);
      if (a === 'm-editar-dia') { var ya = semDe(S.sem); S.em = { lunes: S.sem, doc: ya ? clone(ya) : semanaNueva(S.sem) }; S.msg.medias = ''; if (!ya) guardar('medias', true); }
      render();
    }
    else if (a === 'm-dia') { if (S.em) guardar('medias', true); S.em = null; S.mv = 'dia'; if (S.sem && S.dia != null) S.fm = mas(S.sem, S.dia); render(); }
    else if (a === 'sem') { S.msg.fotos = ''; S.msg.medias = ''; S.pf = null; if (S.em) guardar('medias', true); S.em = null; S.sem = mas(S.sem, +D.d); S.dia = null; render(); }
    else if (a === 'dia') { S.dia = +D.i; var g = document.querySelector('.dias'); if (g) g.dataset.sel = D.i; document.querySelectorAll('.dtabs .btn').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.i === D.i)); }); }
    else if (a === 'pf-abrir') { S.pf = { txt: '' }; render(); var pt = $('pf-txt'); if (pt) pt.focus(); }
    else if (a === 'pf-cancelar') { S.pf = null; render(); }
    else if (a === 'pf-guardar') {
      if (S.pf && S.pf.leyendo) return;
      var rp = resPegada(), lp = semanaPegada(rp, S.sem);
      guardarFaenaPegada(rp, lp).then(function (nd) { S.pf = null; S.sem = lp; S.msg.medias = nd ? 'Faena guardada: ' + nd + plural(nd, ' día', ' días') + ' de la semana del ' + etiquetaSemana(lp) + '.' : '!No había faena para guardar.'; render(); }, function () { avisar('!No se pudo guardar. Revisá la conexión.', 6000); });
    }
    else if (a === 'm-editar') { if (S.em) { guardar('medias', true); S.em = null; } else { S.em = { lunes: S.sem, doc: clone(semDe(S.sem)) }; S.msg.medias = ''; } render(); }
    else if (a === 'm-nueva') { S.em = { lunes: S.sem, doc: semanaNueva(S.sem) }; guardar('medias', true); render(); }
    else if (a === 'm-agregar') { S.em.doc.dias[+D.i][D.m].push(D.m === 'faena' ? { origen: '', propios: 0, usuarios: 0 } : { cliente: '', cant: 0 }); render(); var ult = S.em.doc.dias[+D.i][D.m].length - 1, foco = $((D.m === 'faena' ? 'f' : 'c') + D.i + '-' + ult + (D.m === 'faena' ? 'o' : 'c')); if (foco) foco.focus(); }
    else if (a === 'm-vaciar') { if (!confirma('m-vaciar' + D.i)) { render(); return; } var dv = S.em.doc.dias[+D.i]; dv.faena = [{ origen: '', propios: 0, usuarios: 0 }]; dv.clientes = []; guardar('medias'); render(); }
    else if (a === 'm-borrar-semana') { if (!confirma('m-borrar-semana')) { render(); return; } clearTimeout(timers.medias); var lb = S.em.lunes; S.em = null; S.faena = (S.faena || []).filter(function (x) { return x.id !== lb; }); store.del('faena', lb).then(tocar, function () {}); render(); }
    else if (a === 'm-quitar') { S.em.doc.dias[+D.i][D.m].splice(+D.r, 1); guardar('medias'); render(); }

    // producción
    else if (a === 'fr') { var y = S.fr; do { y = mas(y, +D.d); } while (!esHabil(y)); S.fr = y; render(); }
    else if (a === 'fr-hoy') { S.fr = rendFechaInicial(); render(); }
    else if (a === 'fr-ir') { S.fr = D.f; render(); window.scrollTo(0, 0); }
    else if (a === 'fecha') { S.pv = null; S.fechaFija = true; if (S.ep) guardar('prod', true); S.ep = null; var x = S.fecha; do { x = mas(x, +D.d); } while (!esHabil(x)); S.fecha = x; render(); }
    else if (a === 'pv') { if (S.ep) { guardar('prod', true); S.ep = null; } S.pv = D.v; render(); }
    else if (a === 'op-nueva') {
      S.fechaFija = true; var idn = 'op-' + S.fecha, dn = opNueva(S.fecha, D.v);
      S.ep = { fecha: idn, doc: dn }; S.ep.base = clone(dn); S.pv = 'op'; S.msg.prod = ''; guardar('prod', true); render();
      var pn2 = $('p-doc'); if (pn2) { pn2.focus(); pn2.setSelectionRange(0, 0); window.scrollTo(0, 0); }
    }
    else if (a === 'op-base' && S.ep && esOP(S.ep.fecha)) {
      S.config.opBase = docDeOrden(S.ep.doc).replace(/^[^\n]*½[^\n]*\n+/, ''); guardarConfig(); avisar('Guardada como orden base. Los días nuevos van a arrancar con esta orden.', 5000);
    }
    else if (a === 'p-nueva') { S.fechaFija = true; S.ep = { fecha: idActual(), doc: prodVacia(idActual()) }; S.ep.base = clone(S.ep.doc); S.msg.prod = ''; guardar('prod', true); render(); var pn = $('p-doc'); if (pn) { pn.focus(); pn.setSelectionRange(pn.value.length, pn.value.length); } }
    else if (a === 'p-editar') { S.fechaFija = true; if (S.ep) { guardar('prod', true); S.ep = null; } else { var ide = D.id || idActual(); S.ep = { fecha: ide, doc: clone(prodDe(ide)) }; S.ep.base = clone(S.ep.doc); S.msg.prod = ''; } render(); if (S.ep) { var pd = $('p-doc'); if (pd) { pd.focus(); pd.setSelectionRange(0, 0); window.scrollTo(0, 0); } } }
    else if (a === 'p-borrar' && S.ep) { if (!confirma('p-borrar')) { render(); return; } clearTimeout(timers.prod); var fb = S.ep.fecha; S.ep = null; S.prod = (S.prod || []).filter(function (x) { return x.id !== fb; }); store.del('produccion', fb).then(tocar, function () {}); render(); }
    else if (a === 'p-estado' && S.ep) { S.ep.doc.estado = D.v; S.ep.base = clone(S.ep.doc); guardar('prod', true); render(); }

    // pedidos: carga
    else if (a === 'q-pegar') { if (S.dictando) pararDictado(); S.pegar = !S.pegar; if (!S.pegar) { S.pegarTxt = ''; S.pegarCli = ''; S.pegarDia = ''; } S.msg.fotos = ''; renderPedidos(); var ft = $('pegar-txt'); if (ft) ft.focus(); }
    else if (a === 'q-leer-texto') { if (S.dictando) pararDictado(); leerPegado(); }
    else if (a === 'q-dictar') { dictar(); }
    else if (a === 'carga-dia') { if (S.tab === 'pedidos') { if (D.v) { S.pd = D.v; S.cargaSegun = false; S.abierto = {}; } else S.cargaSegun = true; } else S.cargaDia = D.v || ''; render(); }
    else if (a === 'q-nuevo') { S.prop.push(pedidoVacio()); renderPedidos(); var fq = $('q' + (S.prop.length - 1) + 'cliente'); if (fq) fq.focus(); }
    else if (a === 'q-corte') { S.prop[+D.q].cortes.push({ corte: CORTES_BASE[0], texto: '', orden: true }); renderPedidos(); }
    else if (a === 'q-quitar-corte') { S.prop[+D.q].cortes.splice(+D.j, 1); renderPedidos(); }
    else if (a === 'q-descartar-todos') { if (!confirma('q-descartar-todos')) { renderPedidos(); return; } S.prop = S.prop.filter(function (x) { return x.editaId; }); S.msg.fotos = ''; renderPedidos(); }
    else if (a === 'q-descartar') { S.prop.splice(+D.q, 1); renderPedidos(); }
    else if (a === 'q-guardar' || a === 'q-todos') {
      // "Guardar todos": los que quedaron vacíos (sin medias ni cantidades) se descartan solos.
      if (a === 'q-todos') { var nv = S.prop.length; S.prop = S.prop.filter(function (x) { return x.editaId || !pedidoVacio2(x); }); if (S.prop.length < nv) avisar('Descarté ' + (nv - S.prop.length) + (nv - S.prop.length === 1 ? ' pedido vacío' : ' pedidos vacíos') + ' (sin medias ni cantidades).', 5000); }
      var cuales = a === 'q-todos' ? S.prop.filter(function (x) { return !x.editaId; }) : [S.prop[+D.q]];
      S.msg.fotos = 'Guardando…'; pintarMsg('fotos');
      guardarVarios(cuales, false).then(function () { S.msg.fotos = S.prop.some(function (x) { return x.error; }) ? '!Quedaron pedidos sin guardar: revisalos.' : 'Guardado.'; renderPedidos(); });
    }

    // pedidos: listado
    else if (a === 'ped-abrir') {
      var enCta = !!(e.target.closest && e.target.closest('.cta'));
      // Un solo pedido abierto a la vez: al abrir uno se cierra el que estaba.
      var estaba = !!S.abierto[D.id]; S.abierto = {}; S.abierto[D.id] = enCta ? true : !estaba; S.pedDia = null; S.ctaOtro = null; renderPedidos();
      // El pedido que se abre queda a la vista entero, sin mover la pantalla si ya lo está.
      if (S.abierto[D.id] && !enCta) { var cab = document.querySelector('[data-act="ped-abrir"][data-id="' + D.id + '"]'), tar = cab && cab.closest('.ped'); if (tar && tar.scrollIntoView) tar.scrollIntoView({ block: 'nearest' }); }
      if (enCta) { var sc = document.querySelector('select[data-cta="' + D.id + '"], [data-cta-in="' + D.id + '"], [data-act="cta-otro"][data-id="' + D.id + '"]'); if (sc) { sc.focus(); if (sc.scrollIntoView) sc.scrollIntoView({ block: 'center' }); } }
    }
    else if (a === 'c-sumar' || a === 'c-quitar' || a === 'c-todos') {
      var pc = pedidoDe(D.id); if (!pc || S._ocup) return;
      var cc = cortesDe(pc), uno = cc.filter(function (c) { return c.k === D.k; })[0];
      S._ocup = true;
      (a === 'c-quitar' ? quitarCorte(pc, uno) : sumarCortes(pc, a === 'c-todos' ? cc : [uno])).then(function () { S._ocup = false; renderPedidos(); }, function () { S._ocup = false; S.msg.fotos = '!No se pudo guardar. Revisá la conexión.'; renderPedidos(); });
      renderPedidos();
    }
    else if (a === 'ped-editar') editarPedido(D.id);
    else if (a === 'ped-dup') duplicarPedido(D.id);
    else if (a === 'ped-txt') copiarPedido(D.id);
    else if (a === 'log-editar') {
      var pl = pedidoDe(D.id);
      if (pl && !S.prop.some(function (x) { return x.editaId === pl.id; })) S.prop.push({ k: uid(), editaId: pl.id, cliente: pl.cliente || '', entrega: pl.entrega || '', medias: pl.medias || '', peso: pl.peso || '', frio: pl.frio || '', cuenta: pl.cuenta || '', nota: pl.nota || '', kg: pl.kg || '', origen: pl.origen || 'manual', dudas: (pl.dudas || []).slice(), cortes: clone(cortesDe(pl)).map(function (c) { c.texto = sinCliente(c.texto, pl.cliente); return c; }) });
      render(); var kl = -1; S.prop.forEach(function (x, i) { if (x.editaId === D.id) kl = i; }); var fl1 = $('q' + kl + 'c0texto') || $('q' + kl + 'cliente'); if (fl1) fl1.focus();
    }
    else if (a === 'busq-cam') { S.camBuscar = ''; S.pdBuscar = ''; S.pd = D.f; renderPedidos(); var gc = document.querySelector('#view-pedidos .grupo-cam[data-gcam="' + D.cam + '"]'); if (gc) { gc.scrollIntoView({ block: 'start', behavior: 'smooth' }); gc.classList.add('destello'); setTimeout(function () { gc.classList.remove('destello'); }, 2200); } }
    else if (a === 'lbusq-ver') {
      S.lgBuscar = ''; S.lgCamBuscar = ''; S.resumen = false; S.fl = D.f; render();
      var lv = D.ped ? document.querySelector('#view-logistica .log-ped[data-lp="' + D.ped + '"]') : document.querySelector('#view-logistica section.cam[data-cam="' + D.cam + '"]');
      if (lv) { lv.scrollIntoView({ block: D.ped ? 'center' : 'start', behavior: 'smooth' }); lv.classList.add('destello'); setTimeout(function () { lv.classList.remove('destello'); }, 2200); }
    }
    else if (a === 'hora-abrir') { S.horaAbierta = D.id; renderPedidos(); var ha = document.querySelector('input[data-hora-cam="' + D.id + '"]'); if (ha) ha.focus(); }
    else if (a === 'cam-sheet') { S.camSheetAbierto = !S.camSheetAbierto; S.camSheetErr = ''; renderCamara(); var cu = $('cam-sheet-url'); if (cu) cu.focus(); }
    else if (a === 'cam-sheet-copiar') { fetch('camara-sheet.txt', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (t) { return navigator.clipboard.writeText(t); }).then(function () { S.camCopiado = true; renderCamara(); }, function () { window.open('camara-sheet.txt', '_blank'); }); }
    else if (a === 'cam-sheet-conectar') { var cu2 = $('cam-sheet-url'); S.camSheetUrl = cu2 ? cu2.value : ''; camConectar(S.camSheetUrl); }
    else if (a === 'cam-sync-ya') { camEstado('Trayendo tu Google Sheet…'); camTraer(true); }
    else if (a === 'cam-sheet-subir') { camMandar([S.camLun || lunesDe(camDiaRef())]); S.camSheetAbierto = false; renderCamara(); }
    else if (a === 'cam-sheet-quitar') { if (!confirma('cam-sheet-quitar')) { renderCamara(); return; } camAjustes({ sheet: null }).then(function () { S.camSheetAbierto = false; S.camSyncMsg = null; renderCamara(); }); }
    else if (a === 'cam-sem') { S.camLun = mas(S.camLun || lunesDe(camDiaRef()), +D.d); render(); }
    else if (a === 'cam-hoy') { S.camLun = lunesDe(camDiaRef()); render(); }
    else if (a === 'cam-pegar') { S.camPegar = !S.camPegar; S.camPrev = null; S.camDeLink = false; render(); var ct = $('cam-txt'); if (ct) ct.focus(); }
    else if (a === 'cam-pegar-borrar') { S.camPrev = null; render(); var ct2 = $('cam-txt'); if (ct2) ct2.focus(); }
    else if (a === 'cam-guardar-pegado') {
      var sp = S.camPrev || []; if (!sp.length) return;
      b.disabled = true; b.textContent = 'Guardando…';
      guardarCamaraPegada(sp).then(function () { S.camPegar = false; S.camPrev = null; S.camDeLink = false; S.camLun = lunesDe(camDiaRef()) <= sp[sp.length - 1].lunes ? lunesDe(camDiaRef()) : sp[sp.length - 1].lunes; avisar('Listo: ' + sp.length + (sp.length === 1 ? ' semana cargada.' : ' semanas cargadas.'), 4000); render(); },
        function () { b.disabled = false; b.textContent = 'Guardar'; avisar('!No se pudo guardar. ¿Ya está publicada la regla de Cámara en Firebase?', 9000); });
    }
    else if (a === 'nota-abrir') { S.notaAbierta = D.id; render(); var na = document.querySelector('textarea[data-nota-ped="' + D.id + '"]'); if (na) na.focus(); }
    else if (a === 'lbusq-limpiar') { S.lgBuscar = ''; S.lgCamBuscar = ''; render(); var lq = $('lg-buscar'); if (lq) lq.focus(); }
    else if (a === 'busq-limpiar') { S.camBuscar = ''; S.pdBuscar = ''; renderPedidos(); var bq = $('pd-buscar'); if (bq) bq.focus(); }
    else if (a === 'busq-ver') { var pv = pedidoDe(D.id); if (pv) { S.pdBuscar = ''; S.pd = pv.entrega; S.abierto = {}; S.abierto[pv.id] = true; renderPedidos(); var dv = document.querySelector('[data-act="ped-abrir"][data-id="' + pv.id + '"]'); if (dv) dv.scrollIntoView({ block: 'center' }); } }
    else if (a === 'v-ver') { S.vgrande = S.vgrande || {}; S.vgrande[D.id] = !S.vgrande[D.id]; renderPedidos(); }
    else if (a === 'v-leer') {
      var vl = (S.ventas || []).filter(function (x) { return x.id === D.id; })[0];
      if (vl) { leerVenta(vl).then(null, function () { S.msg.fotos = '!No se pudo guardar lo leído.'; avisar(S.msg.fotos, 9000); refrescar(); }); renderPedidos(); }
    }
    else if (a === 'fv') { S.fv = D.v || ''; renderPedidos(); }
    else if (a === 'ir-ventas') { irA('pedidos'); var vs = $('ventas'); if (vs) vs.scrollIntoView(); }
    else if (a === 'v-aceptar' || a === 'v-rechazar') {
      var vv = (S.ventas || []).filter(function (x) { return x.id === D.id; })[0];
      if (!vv) return;
      var mo = $('v-motivo-' + D.id); S.vmot = S.vmot || {}; if (mo) S.vmot[D.id] = mo.value;
      if (a === 'v-rechazar' && !confirma('v-rechazar' + D.id)) { renderPedidos(); return; }
      S.msg.ventas = 'Guardando…'; pintarMsg('ventas');
      (a === 'v-aceptar' ? aceptarVenta(vv) : rechazarVenta(vv, S.vmot[D.id] || ''))
        .then(function () { S.msg.ventas = a === 'v-aceptar' ? 'Aceptado: ' + vv.cliente + ' quedó en los pedidos del ' + diaCorto(vv.entrega) + '.' : 'Rechazado.'; tocar(); refrescar(); },
          function () { S.msg.ventas = '!No se pudo guardar. Revisá la conexión.'; refrescar(); });
      renderPedidos();
    }
    else if (a === 'ped-borrar') {
      if (!confirma('ped-borrar' + D.id)) { renderPedidos(); return; }
      var pb = pedidoDe(D.id); S.prop = S.prop.filter(function (x) { return x.editaId !== D.id; });
      if (pb) borrarPedido(pb).then(function () { tocar(); refrescar(); }, function () { S.msg.fotos = '!No se pudo quitar.'; refrescar(); });
      renderPedidos();
    }
    else if (a === 'ped-borrar-todos') {
      if (!confirma('ped-borrar-todos' + D.i)) { renderPedidos(); return; }
      var delDia = (S.pedidos || []).filter(function (x) { return x.entrega === D.i; });
      if (!seguro(delDia.length)) { renderPedidos(); return; }
      borrarPedidos(delDia).then(function () { tocar(); refrescar(); }, function () { S.msg.fotos = '!No se pudieron eliminar todos.'; refrescar(); });
      renderPedidos();
    }
    else if (a === 'ped-borrar-total') {
      if (!confirma('ped-borrar-total')) { renderPedidos(); return; }
      if (!seguro((S.pedidos || []).length)) { renderPedidos(); return; }
      S.prop = [];
      borrarPedidos((S.pedidos || []).slice()).then(function () { tocar(); S.msg.fotos = 'Se quitaron todos los pedidos.'; renderPedidos(); }, function () { S.msg.fotos = '!No se pudieron quitar todos.'; renderPedidos(); });
      renderPedidos();
    }
    else if (a === 'e-dia') { var ye = S.entrega; do { ye = mas(ye, +D.d); } while (!esHabil(ye)); S.entrega = ye; S.sel = {}; renderPedidos(); }
    else if (a === 'recargar') { location.reload(); }
    else if (a === 'mf-abrir') { e.preventDefault(); e.stopPropagation(); S.mfAbierto = S.mfAbierto === D.id ? null : D.id; renderPedidos(); }
    else if (a === 'mf-set') {
      e.preventDefault(); e.stopPropagation(); var pm2 = pedidoDe(D.id); S.mfAbierto = null; if (!pm2) { renderPedidos(); return; }
      guardarPropuesta({ editaId: pm2.id, faenaFija: D.f || '', cliente: pm2.cliente, entrega: pm2.entrega, medias: pm2.medias, peso: pm2.peso, frio: pm2.frio || '', cuenta: pm2.cuenta || '', nota: pm2.nota, kg: pm2.kg, origen: pm2.origen, cortes: clone(cortesDe(pm2)) }, true)
        .then(function () { avisar(D.f ? pm2.cliente + ': medias ya en cámara (faenadas el ' + diaCorto(D.f).toLowerCase() + '). No se suman a la faena del ' + diaCorto(habilAnterior(pm2.entrega)).toLowerCase() + '.' : pm2.cliente + ': las medias vuelven a la faena del ' + diaCorto(habilAnterior(pm2.entrega)).toLowerCase() + '.', 7000); renderPedidos(); }, function () { avisar('!No se pudo guardar. Revisá la conexión.', 6000); renderPedidos(); });
    }
    else if (a === 'camp-menu') { e.preventDefault(); e.stopPropagation(); S.camMenu = S.camMenu === D.id ? null : D.id; S.frioMenu = null; renderPedidos(); }
    else if (a === 'camp-otro') { e.preventDefault(); e.stopPropagation(); var po = pedidoDe(D.id); S.camMenu = null; if (po) { if (!(S.sel[po.id] && S.selDia === po.entrega)) S.sel = {}; S.sel[po.id] = true; S.selDia = po.entrega; S.camOtro = true; } renderPedidos(); var fco = $('cam-nombre'); if (fco) fco.focus(); }
    else if (a === 'camp-crear') {
      // Camión nuevo con el nombre escrito ahí mismo, y el pedido (o los tildados) adentro.
      e.preventDefault(); e.stopPropagation(); var pn2 = pedidoDe(D.id), inn = $('camp-nombre-' + D.id), nom2 = String((inn && inn.value) || '').trim().toUpperCase();
      if (!pn2) return; if (!nom2) { if (inn) inn.focus(); avisar('!Escribí el nombre del camión.', 3000); return; }
      var gr2 = camGrupo(pn2), ids2 = gr2.map(function (x) { return x.id; }), f2 = pn2.entrega;
      var ya2 = camionesDe(f2).filter(function (c) { return norm(nomCam(c)) === norm(nom2); })[0];
      S.camMenu = null;
      (ya2 ? asignarCamion(f2, ids2, ya2.id).then(function () { return ya2; }) : crearCamion(f2, nom2, '', ids2)).then(function (cam) { if (gr2.length > 1) S.sel = {}; avisar(gr2.length > 1 ? avisoCamion(f2, cam.id, gr2.length) : pn2.cliente + ' va en ' + nomCam(cam) + '.', 4000); renderPedidos(); }, function () { avisar('!No se pudo guardar. Revisá la conexión.', 6000); renderPedidos(); });
    }
    else if (a === 'camp-set') {
      e.preventDefault(); e.stopPropagation(); var pc = pedidoDe(D.id); S.camMenu = null; if (!pc) { renderPedidos(); return; }
      var vc = D.v || '', fc = pc.entrega, gr = camGrupo(pc), idsC = gr.map(function (x) { return x.id; });
      (vc.charAt(0) === 'f' ? usarDeFlota(fc, vc.slice(2), idsC) : asignarCamion(fc, idsC, vc.slice(2)).then(function () { return { id: vc.slice(2) }; }))
        .then(function (cam) { if (gr.length > 1) S.sel = {}; avisar(gr.length > 1 ? (vc ? avisoCamion(fc, cam.id, gr.length) : gr.length + ' pedidos quedaron sin camión.') : vc ? pc.cliente + ' ' + avisoCamion(fc, cam.id, 1).replace(/^1 pedido en /, 'va en ') : pc.cliente + ' quedó sin camión.', 5000); renderPedidos(); }, function (er) { avisar('!' + ((er && er.message) || 'No se pudo guardar. Revisá la conexión.'), 6000); renderPedidos(); });
    }
    else if (a === 'camp-sacar') {
      e.preventDefault(); e.stopPropagation(); var ps = pedidoDe(D.id); S.camMenu = null; if (!ps) return;
      asignarCamion(ps.entrega, [ps.id], '').then(function () { avisar(ps.cliente + ' quedó sin camión.', 3000); renderPedidos(); }, function () { avisar('!No se pudo guardar. Revisá la conexión.', 6000); renderPedidos(); });
    }
    else if (a === 'frio-menu') { S.camMenu = null; e.preventDefault(); e.stopPropagation(); S.frioMenu = S.frioMenu === D.id ? null : D.id; renderPedidos(); }
    else if (a === 'frio-set') {
      var pf = pedidoDe(D.id); S.frioMenu = null; if (!pf) { renderPedidos(); return; }
      cambiarFrio(pf, D.v).then(function () { avisar(D.v ? 'Pedido de ' + pf.cliente + ': ' + D.v.toLowerCase() + '.' : 'Pedido de ' + pf.cliente + ': sin aclarar.', 3000); renderPedidos(); }, function () { avisar('!No se pudo guardar. Revisá la conexión.', 6000); renderPedidos(); });
    }
    else if (a === 'sel-nada') { S.sel = {}; S.selOtra = false; renderPedidos(); }
    else if (a === 'sel-borrar') {
      var tb = (S.pedidos || []).filter(function (x) { return S.sel[x.id]; });
      if (!tb.length) return;
      if (!confirma('sel-borrar')) { renderPedidos(); return; }
      if (!seguro(tb.length)) { renderPedidos(); return; }
      var tbIds = {}; tb.forEach(function (x) { tbIds[x.id] = 1; }); S.prop = S.prop.filter(function (x) { return !tbIds[x.editaId]; });
      borrarPedidos(tb).then(function () { tocar(); S.sel = {}; refrescar(); }, function () { S.msg.fotos = '!No se pudieron borrar. Revisá la conexión.'; refrescar(); });
      renderPedidos();
    }
    else if (a === 'pap-cerrar') { S.deshacer = null; renderPedidos(); }
    else if (a === 'pap-recuperar') {
      if (S._ocup) return; S._ocup = true;
      recuperar(D.id).then(function (k) { S._ocup = false; avisar(k ? (k === 1 ? 'Pedido recuperado.' : k + ' pedidos recuperados.') : 'Esos pedidos ya estaban cargados.', 5000); renderPedidos(); },
        function (e) { S._ocup = false; avisar('!' + ((e && e.message) || 'No se pudo recuperar. Revisá la conexión.'), 6000); renderPedidos(); });
    }

    // camiones
    else if (a === 'cam-crear' || a === 'cam-sacar') {
      var idsT = tildadosDe(S.selDia);
      if (!idsT.length) return;
      var hecho = function () { S.sel = {}; S.camNombre = ''; S.camNota = ''; renderPedidos(); }, mal = function () { S.msg.fotos = '!No se pudo guardar el camión. Revisá la conexión.'; renderPedidos(); };
      if (a === 'cam-crear') crearCamion(S.selDia, S.camNombre, S.camNota, idsT, S.camKg, null, S.camNum).then(function (cam) { S.msg.fotos = avisoCamion(S.selDia, cam.id, idsT.length); S.camKg = ''; S.camNum = ''; S.camOtro = false; hecho(); }, mal);
      else asignarCamion(S.selDia, idsT, '').then(hecho, mal);
    }
    else if (a === 'pd') { var yp = S.pd || habilSiguiente(hoy()); do { yp = mas(yp, +D.d); } while (!esHabil(yp)); S.pd = yp; S.abierto = {}; renderPedidos(); }
    else if (a === 'pd-ir') { S.pd = D.f; S.abierto = {}; renderPedidos(); window.scrollTo(0, 0); }
    else if (a === 'fl') { var yl = S.fl; do { yl = mas(yl, +D.d); } while (!esHabil(yl)); S.fl = yl; S.ec = null; S.msg.log = ''; render(); }
    else if (a === 'cam-nuevo') { crearCamion(S.fl, '', '', []).then(function (cam) { S.ec = cam.id; S.ecNum = ''; S.ecHora = ''; S.ecNombre = ''; S.ecNota = ''; S.ecKg = ''; render(); var fn = $('cam-e-nombre'); if (fn) fn.focus(); }, function () { S.msg.log = '!No se pudo crear el camión.'; pintarMsg('log'); }); }
    else if (a === 'cam-editar') { var ce = camionesDe(S.fl).filter(function (c) { return c.id === D.id; })[0]; if (ce) { S.ec = ce.id; S.ecNum = ce.num || ''; S.ecHora = ce.hora || ''; S.ecNombre = nomLimpio(ce.nombre); if (!S.ecNombre && /[A-ZÁÉÍÓÚÑ]/i.test(ce.num || '')) { S.ecNombre = String(ce.num).trim(); S.ecNum = ''; } S.ecNota = ce.nota || ''; S.ecKg = ce.kg || ''; render(); var fn2 = $('cam-e-nombre'); if (fn2) fn2.focus(); } }
    else if (a === 'cam-cancelar') { S.ec = null; render(); }
    else if (a === 'cam-por-hora') { publicarLog(S.fl, porHorario(clone(camionesDe(S.fl)))).then(function () { tocar(); render(); }, function () { S.msg.log = '!No se pudo guardar.'; render(); }); }
    else if (a === 'camion-subir' || a === 'camion-bajar') { moverCamion(S.fl, D.id, a === 'camion-subir' ? -1 : 1).then(render, function () { S.msg.log = '!No se pudo guardar.'; render(); }); }
    else if (a === 'cam-guardar') { var idc = S.ec; S.ec = null; cambiarCamion(S.fl, idc, S.ecNombre, S.ecNota, S.ecKg, S.ecNum || '', S.ecHora || '').then(render, function () { S.msg.log = '!No se pudo guardar.'; render(); }); render(); }
    else if (a === 'cam-borrar') { if (!confirma('cam-borrar' + D.i)) { render(); return; } S.ec = null; borrarCamion(S.fl, D.i).then(render, function () { S.msg.log = '!No se pudo borrar.'; render(); }); render(); }
    else if (a === 'cam-quitar-ped') { asignarCamion(S.fl, [D.id], '').then(render, function () { S.msg.log = '!No se pudo guardar.'; render(); }); }

    // stock de camiones
    else if (a === 'fl-editar') { if (S.ef) { guardarConfig(true); S.ef = false; } else { S.ef = true; S.msg.flota = ''; if (!flota().length) S.config.flota = [{ id: 'k' + uid(), nombre: '', kg: '', nota: '' }]; } render(); if (S.ef) { var ff = $('fl' + (flota().length - 1) + 'nombre'); if (ff && !ff.value) ff.focus(); } }
    else if (a === 'fl-agregar') { S.config.flota = flota().concat([{ id: 'k' + uid(), nombre: '', kg: '', nota: '' }]); guardarConfig(); render(); var fa2 = $('fl' + (flota().length - 1) + 'nombre'); if (fa2) fa2.focus(); }
    else if (a === 'fl-quitar') { var fq3 = flota(); fq3.splice(+D.i, 1); S.config.flota = fq3; guardarConfig(); render(); }

    // saltos entre pantallas
    else if (a === 'ir-pedidos') { S.pedDia = D.f || null; S.sel = {}; irA('pedidos'); }
    else if (a === 'ir-medias') { S.em = null; S.mv = null; S.fm = habilAnterior(S.entrega); S.sem = lunesDe(S.fm); S.dia = Math.round((fecha(S.fm) - fecha(S.sem)) / 86400000); irA('medias'); }
    else if (a === 'ir-orden') { S.ep = null; S.fechaFija = true; S.fecha = S.entrega; irA('produccion'); }
    else if (a === 'ir-log') { S.fl = S.entrega; S.ec = null; irA('logistica'); }
    else if (a === 'cfg-guardar') {
      S._conf = true;
      var clave = $('cfg-clave').value.trim(), cfg = clone(S.config || {}), tareas = []; delete cfg.id;
      var iaNueva = { clave: clave, modelo: (S.ia && S.ia.modelo) || IA_MODELO };
      cfg.desposteHabitual = +$('cfg-desposte').value || 750; cfg.capacidadCamara = +$('cfg-cap').value || 0; cfg.actualizado = ahoraTxt();
      tareas.push(store.set('config', 'general', cfg));
      if (clave) tareas.push(store.set('privado', 'ia', iaNueva));
      S.msg.cfg = 'Guardando…'; pintarMsg('cfg');
      Promise.all(tareas).then(function () { S.msg.cfg = 'Guardado.'; if (clave) S.ia = iaNueva; renderPedidos(); }, function () { S.msg.cfg = '!No se pudo guardar.'; pintarMsg('cfg'); });
    }
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.menuAb) cerrarMenus(); });
  document.addEventListener('keydown', function (e) { var t = e.target; if ((e.key === 'Enter' || e.key === ' ') && t && t.classList && t.classList.contains('busq-f') && t.dataset.act) { e.preventDefault(); t.click(); } });
  document.addEventListener('keydown', function (e) { var t = e.target; if (e.key === 'Enter' && t && t.dataset && t.dataset.campNuevo) { e.preventDefault(); var bt = document.querySelector('[data-act="camp-crear"][data-id="' + t.dataset.campNuevo + '"]'); if (bt) bt.click(); } });
  // Ctrl+Z / Ctrl+Y en Cámara (cuando no se está escribiendo en una casilla, que tiene su propio deshacer).
  document.addEventListener('keydown', function (e) {
    if (S.tab !== 'camara' || !(e.ctrlKey || e.metaKey) || document.getElementById('pin-lock')) return;
    var t = e.target, escribiendo = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.value !== t.defaultValue;
    if (escribiendo) return;
    var kk = String(e.key || '').toLowerCase();
    if (kk === 'z' && !e.shiftKey) { e.preventDefault(); if (t && t.blur) t.blur(); camDeshacer(false); }
    else if (kk === 'y' || (kk === 'z' && e.shiftKey)) { e.preventDefault(); if (t && t.blur) t.blur(); camDeshacer(true); }
  });
  // Con la app bloqueada, el teclado solo sirve para el PIN.
  document.addEventListener('keydown', function (e) {
    var lk = document.getElementById('pin-lock');
    if (lk && !lk.contains(e.target)) { e.preventDefault(); e.stopPropagation(); var pi = $('pin-in'); if (pi) pi.focus(); return; }
    if (e.key === 'Enter' && e.target && e.target.id === 'pin-in') { e.preventDefault(); probarPin(); }
    if (e.key === 'Enter' && e.target && e.target.id === 'pin-nuevo') { e.preventDefault(); var bp = document.querySelector('[data-act="pin-poner"]'); if (bp) bp.click(); }
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.classList && e.target.classList.contains('cam-in')) { e.preventDefault(); e.target.blur(); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && e.target && e.target.dataset && e.target.dataset.notaPed) { e.preventDefault(); e.target.blur(); } });
  document.addEventListener('focusout', function (e) {
    var t = e.target; if (!t || !t.dataset || !t.dataset.horaCam) return;
    var idh = t.dataset.horaCam, f = S.pd, c = camionesDe(f).filter(function (x) { return x.id === idh; })[0], v = t.value || '';
    if (S.horaAbierta === idh) S.horaAbierta = null;
    if (!c || v === (c.hora || '')) { if (!v) setTimeout(renderPedidos, 0); return; }
    cambiarCamion(f, idh, c.nombre, c.nota, c.kg, null, v).then(function () { avisar(v ? nomCam(c) + ': sale a las ' + v + ' hs.' : nomCam(c) + ': sin horario.', 2500); renderPedidos(); }, function () { avisar('!No se pudo guardar el horario. Revisá la conexión.', 6000); renderPedidos(); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.horaCam) { e.preventDefault(); e.target.blur(); } });
  function guardarResHora(t) {
    var idr = t.dataset.hora, f = S.fl, c = camionesDe(f).filter(function (x) { return x.id === idr; })[0], v = t.value || '';
    if (!c || v === (c.hora || '')) return;
    ponerHora(f, idr, v).then(function () { if (!escribiendo()) render(); }, function () { S.msg.log = '!No se pudo guardar.'; render(); });
  }
  document.addEventListener('focusout', function (e) { var t = e.target; if (t && t.classList && t.classList.contains('res-hora')) guardarResHora(t); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.classList && e.target.classList.contains('res-hora')) { e.preventDefault(); e.target.blur(); } });
  document.addEventListener('focusout', function (e) { var t = e.target; if (t && t.dataset && t.dataset.notaPed && !t.value.trim() && S.notaAbierta === t.dataset.notaPed) { S.notaAbierta = null; setTimeout(render, 0); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.ctaIn) { e.preventDefault(); var bg = document.querySelector('[data-act="cta-guardar"][data-id="' + e.target.dataset.ctaIn + '"]'); if (bg) bg.click(); } });
  document.addEventListener('input', function (e) {
    var t = e.target, D = t.dataset;
    if (t.id === 'cli-buscar') { S.cliBuscar = t.value; filtrarClientes(); return; }
    if (t.id === 'rep-cli') { var sr = t.selectionStart; S.repCli = t.value; var vp = document.querySelector('.rep-suc'); if (vp) { var tmpr = document.createElement('div'); tmpr.innerHTML = repHTML(); vp.replaceWith(tmpr.firstChild); var nr = $('rep-cli'); if (nr) { nr.focus(); try { nr.setSelectionRange(sr, sr); } catch (err) {} } } return; }
    if (t.id === 'lg-buscar' || t.id === 'lg-cam-buscar') { var sl = t.selectionStart, idl = t.id; if (idl === 'lg-buscar') { S.lgBuscar = t.value; S.lgCamBuscar = ''; } else { S.lgCamBuscar = t.value; S.lgBuscar = ''; } render(); var nl = $(idl); if (nl) { nl.focus(); try { nl.setSelectionRange(sl, sl); } catch (err) {} } return; }
    if (t.id === 'cam-txt') { S.camPrev = t.value.trim() ? leerCamaraPegada(t.value) : null; var pv2 = document.querySelector('.cam-pegar'); if (pv2) { var tmp = document.createElement('div'); tmp.innerHTML = camPegarHTML(!camSemanas().length); var val = t.value; pv2.replaceWith(tmp.firstChild); var nt2 = $('cam-txt'); if (nt2) { nt2.value = val; } } return; }
    if (t.id === 'pd-cam-buscar') { var sc = t.selectionStart; S.camBuscar = t.value; S.pdBuscar = ''; renderPedidos(); var nc = $('pd-cam-buscar'); if (nc) { nc.focus(); try { nc.setSelectionRange(sc, sc); } catch (err) {} } return; }
    if (t.id === 'pd-buscar') { var ss = t.selectionStart; S.pdBuscar = t.value; S.camBuscar = ''; renderPedidos(); var nb = $('pd-buscar'); if (nb) { nb.focus(); try { nb.setSelectionRange(ss, ss); } catch (err) {} } return; }
    if (D.cli != null) return;
    if (t.id === 'pf-txt' && S.pf) { S.pf.txt = t.value; S.pf.res = null; S.pf.error = ''; var rs = leerFaenaPegada(t.value), pv = $('pf-prev'), bg = $('pf-guardar'); if (pv) pv.innerHTML = faenaPegadaHTML(rs, semanaPegada(rs, S.sem)); if (bg) bg.disabled = !Object.keys(rs).some(function (k) { return rs[k].length; }); return; }
    if (t.id === 'pegar-cli') { S.pegarCli = t.value; return; }
    if (t.id === 'carga-dia-otra') { if (S.tab === 'pedidos' && t.value) { S.pd = t.value; S.cargaSegun = false; S.abierto = {}; } else S.cargaDia = t.value || ''; setTimeout(render, 0); return; }
    if (t.id === 'pegar-txt') { S.pegarTxt = t.value; if (S.msg.fotos) { S.msg.fotos = ''; pintarMsg('fotos'); } return; }
    if (t.id === 'cam-nombre') { S.camNombre = t.value; return; }
    if (t.id === 'cam-nota') { S.camNota = t.value; return; }
    if (t.id === 'cam-kg') { S.camKg = t.value; return; }
    if (t.id === 'cam-e-kg') { S.ecKg = t.value; return; }
    if (D.fl != null && S.ef) { var ft = flota(); if (ft[+D.fl]) { ft[+D.fl][D.k] = D.k === 'kg' ? (t.value === '' ? '' : +t.value || 0) : t.value; S.config.flota = ft; guardarConfig(); } return; }
    if (D.plog) {
      var otro = document.querySelector('[data-plog="' + D.plog + '"][data-k="' + D.k + '"][data-cual="' + (D.cual === 'iva' ? 'final' : 'iva') + '"]'), vv = +String(t.value).replace(',', '.');
      var ts = +D.tasa || IVA; if (otro) otro.value = t.value === '' ? '' : String(Math.round((D.cual === 'iva' ? vv * ts : vv / ts) * 100) / 100);
      return;
    }
    if (t.id === 'cfg-kgund') { S.config.kgUnidad = t.value.split('\n').map(function (r) { var m = r.match(/^\s*(?:UND\.?\s+|UNIDAD\s+)?(.+?)\s*[=:\-]?\s*([\d.,]+)\s*(?:KGS?|KILOS?)?\s*$/i); return m ? { p: norm(m[1]), kg: numero(m[2]) } : null; }).filter(function (x) { return x && x.p && x.kg > 0; }); guardarConfig(); return; }
    if (t.id === 'cfg-kgmedia' || t.id === 'cfg-kgcaja') { S.config[t.id === 'cfg-kgmedia' ? 'kgMedia' : 'kgCaja'] = +t.value || 0; guardarConfig(); return; }
    if (t.id === 'cam-e-nombre') { S.ecNombre = t.value; return; }
    if (t.id === 'cam-e-num') { S.ecNum = t.value; return; }
    if (t.id === 'cam-e-hora') { S.ecHora = t.value; return; }
    if (t.id === 'cam-num') { S.camNum = t.value; return; }
    if (t.id === 'cam-e-nota') { S.ecNota = t.value; return; }
    if (D.m && S.em) { S.em.doc.dias[+D.i][D.m][+D.r][D.k] = t.value; guardar('medias'); pintarSumas(); }
    else if (t.id === 'm-stock' && S.em) { S.em.doc.stockInicial = t.value === '' ? null : t.value; guardar('medias'); pintarSumas(); }
    else if (t.id === 'p-doc' && S.ep) { S.ep.doc = parsearOrden(t.value, S.ep.base || S.ep.doc); crecer(t); guardar('prod'); }
    else if (D.q != null && S.prop[+D.q]) {
      var q = S.prop[+D.q];
      if (D.j != null) q.cortes[+D.j][D.k] = t.value; else q[D.k] = t.value;
      q.error = '';
      // N° de cuenta ↔ cliente: al escribir uno se completa el otro con la base de clientes,
      // mientras el otro esté vacío o lo haya completado la app (lo escrito a mano no se pisa).
      if (D.j == null && D.k === 'cuenta') {
        var nom = clientePorCuenta(t.value), ec = $('q' + D.q + 'cliente');
        if (nom && (!q.cliente || q._autoCli)) { q.cliente = nom; q._autoCli = true; if (ec) ec.value = nom; }
        else if (!nom && q._autoCli) { q.cliente = ''; if (ec) ec.value = ''; }
        q._autoCta = false;
      }
      if (D.j == null && D.k === 'cliente') {
        q._autoCli = false;
        var cta = cuentaDe(t.value), en = $('q' + D.q + 'cuenta');
        if (!q.cuenta || q._autoCta) { q.cuenta = cta || ''; q._autoCta = !!cta; if (en) en.value = q.cuenta; }
        if (en) en.placeholder = cta || 'Sin número';
      }
    }
  });
  // Configuración queda abierta o cerrada como la dejó quien la usa, aunque se redibuje la pantalla.
  document.addEventListener('toggle', function (e) { var d = e.target; if (d && d.tagName === 'DETAILS') { if (d.id === 'det-cli') S._cliVarios = d.open; else if (d.classList.contains('rep-det')) S.repDet = d.open; else S._conf = d.open; } }, true);
  // Arrastrar camiones en el Resumen del día (con el mouse o con el dedo).
  var arr = null;
  document.addEventListener('pointerdown', function (e) {
    var hd = e.target.closest && e.target.closest('.res-mover'); if (!hd || e.button > 0) return;
    var el = hd.closest('.res-cam'); if (!el) return;
    e.preventDefault(); S._ocup = true;
    arr = { el: el, grilla: el.parentNode, antes: ids() }; el.classList.add('arrastrando');
    try { hd.setPointerCapture(e.pointerId); } catch (err) {}
    function ids() { return Array.prototype.map.call(el.parentNode.querySelectorAll('.res-cam[data-cam]'), function (x) { return x.getAttribute('data-cam'); }); }
    arr.ids = ids;
  });
  document.addEventListener('pointermove', function (e) {
    if (!arr) return; e.preventDefault();
    var bajo = document.elementFromPoint(e.clientX, e.clientY), t = bajo && bajo.closest && bajo.closest('.res-cam[data-cam]');
    if (!t || t === arr.el || t.parentNode !== arr.grilla) return;
    var hijos = Array.prototype.slice.call(arr.grilla.children);
    arr.grilla.insertBefore(arr.el, hijos.indexOf(arr.el) < hijos.indexOf(t) ? t.nextSibling : t);
  });
  function soltar() {
    if (!arr) return; var a = arr; arr = null; a.el.classList.remove('arrastrando'); S._ocup = false;
    var nuevo = a.ids(); if (nuevo.join() === a.antes.join()) return;
    ordenarCamiones(S.fl, nuevo).then(render, function () { S.msg.log = '!No se pudo guardar el orden.'; render(); });
  }
  document.addEventListener('pointerup', soltar); document.addEventListener('pointercancel', soltar);
  document.addEventListener('keydown', function (e) {
    var hd = e.target && e.target.classList && e.target.classList.contains('res-mover') ? e.target : null; if (!hd) return;
    var d = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0; if (!d) return;
    e.preventDefault(); var id = hd.getAttribute('data-arr');
    moverCamion(S.fl, id, d).then(function () { render(); var b = document.querySelector('.res-mover[data-arr="' + id + '"]'); if (b) b.focus(); });
  });
  // Arrastrar clientes en Pedidos (agrupados por camión): cambia el orden de bajada y, si se suelta en otro grupo, el camión.
  var arrP = null, tScroll = null;
  document.addEventListener('pointerdown', function (e) {
    var hd = e.target.closest && e.target.closest('.ped-mover'); if (!hd || e.button > 0) return;
    var el = hd.closest('.ped'), zona = el && el.closest('.dia-ped'); if (!zona) return;
    e.preventDefault(); S._ocup = true;
    var foto = function () { return Array.prototype.map.call(zona.querySelectorAll('.grupo-cam'), function (g) { return { cam: g.getAttribute('data-gcam') || '', ids: Array.prototype.map.call(g.querySelectorAll('.ped[data-ped]'), function (x) { return x.getAttribute('data-ped'); }) }; }); };
    arrP = { el: el, zona: zona, antes: JSON.stringify(foto()), foto: foto, y: e.clientY }; el.classList.add('arrastrando');
    try { hd.setPointerCapture(e.pointerId); } catch (err) {}
    clearInterval(tScroll); tScroll = setInterval(function () { if (!arrP) return; var h = window.innerHeight; if (arrP.y < 60) window.scrollBy(0, -12); else if (arrP.y > h - 60) window.scrollBy(0, 12); }, 30);
  });
  document.addEventListener('pointermove', function (e) {
    if (!arrP) return; e.preventDefault(); arrP.y = e.clientY;
    var bajo = document.elementFromPoint(e.clientX, e.clientY); if (!bajo || !bajo.closest) return;
    var t = bajo.closest('.ped[data-ped]'), g = bajo.closest('.grupo-cam');
    if (t && t !== arrP.el && arrP.zona.contains(t)) {
      var r = t.getBoundingClientRect(), antesDe = e.clientY < r.top + r.height / 2;
      t.parentNode.insertBefore(arrP.el, antesDe ? t : t.nextSibling);
    } else if (g && arrP.zona.contains(g) && !t) { var l = g.querySelector('.peds'); if (l && arrP.el.parentNode !== l) l.appendChild(arrP.el); }
  });
  function soltarP() {
    if (!arrP) return; var a = arrP; arrP = null; clearInterval(tScroll); a.el.classList.remove('arrastrando'); S._ocup = false;
    var nuevo = a.foto(); if (JSON.stringify(nuevo) === a.antes) { renderPedidos(); return; }
    reordenarPedidos(S.pd, nuevo).then(function () { avisar('Orden guardado.', 2500); renderPedidos(); }, function () { avisar('!No se pudo guardar el orden. Revisá la conexión.', 6000); renderPedidos(); });
  }
  document.addEventListener('pointerup', soltarP); document.addEventListener('pointercancel', soltarP);
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.classList && e.target.classList.contains('frio-chip')) { e.preventDefault(); e.stopPropagation(); e.target.click(); return; }
    var hd = e.target && e.target.classList && e.target.classList.contains('ped-mover') ? e.target : null; if (!hd) return;
    var d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0; if (!d) return;
    e.preventDefault(); var id = hd.getAttribute('data-parr'), p = pedidoDe(id); if (!p || !p.camion) return;
    moverEnCamion(S.pd, p.camion, id, d).then(function () { renderPedidos(); var b = document.querySelector('.ped-mover[data-parr="' + id + '"]'); if (b) b.focus(); });
  });
  // Una captura copiada (o varias imágenes) se pega con Ctrl+V donde esté el botón "Subir fotos o capturas", también en el cuadro de texto.
  document.addEventListener('paste', function (e) {
    if ($('rend-rep') && e.clipboardData) {
      var ri = Array.prototype.slice.call(e.clipboardData.items || []).filter(function (it) { return it.kind === 'file' && /^image\//.test(it.type); }).map(function (it) { return it.getAsFile(); }).filter(Boolean);
      if (ri.length) { e.preventDefault(); cargarReporteRend(ri[0]); }
      return;
    }
    if (S.pf && $('pf-txt') && e.clipboardData) {
      var im = Array.prototype.slice.call(e.clipboardData.items || []).filter(function (it) { return it.kind === 'file' && /^image\//.test(it.type); }).map(function (it) { return it.getAsFile(); }).filter(Boolean)[0];
      if (im) { e.preventDefault(); leerFaenaFoto(im); }
      return;
    }
    var inp = $('fotos'); if (!inp || !e.clipboardData) return;
    var txtP = e.clipboardData.getData('text/plain'), pAn = leerAnimales(txtP);
    if (pAn && e.target && e.target.id === 'pegar-txt') return; // queda en el recuadro; se pasa a medias al tocar Leer
    if (pAn && !(e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) { e.preventDefault(); cargarAnimales(pAn, ''); return; }
    if (e.target && e.target.id === 'pegar-txt' && txtP) return; // texto en el recuadro: no tomar la imagen que trae Excel
    if (inp.disabled) return;
    var imgs = Array.prototype.slice.call(e.clipboardData.items || []).filter(function (it) { return it.kind === 'file' && /^image\//.test(it.type); }).map(function (it) { return it.getAsFile(); }).filter(Boolean);
    if (!imgs.length) return;
    e.preventDefault();
    imgs = imgs.map(function (b, i) { try { return new File([b], b.name && b.name !== 'image.png' ? b.name : 'captura' + (imgs.length > 1 ? ' ' + (i + 1) : '') + '.png', { type: b.type }); } catch (err) { return b; } });
    if (S.pegar && !String(S.pegarTxt || '').trim()) { S.pegar = false; renderPedidos(); }
    subirFotos(imgs);
  });
  document.addEventListener('change', function (e) {
    var t = e.target, D = t.dataset;
    if (D.tel != null && t.matches('input[data-tel]')) { var ch = clone(S.choferes || {}); delete ch.id; ch.tel = ch.tel || {}; var tv = String(t.value || '').trim(); if (tv) ch.tel[D.tel] = tv; else delete ch.tel[D.tel]; var ch2 = clone(ch); ch2.id = 'choferes'; S.choferes = ch2; store.set('privado', 'choferes', ch).then(function () { avisar(tv ? 'Guardado el celular de ' + D.tel + '.' : 'Borrado el celular de ' + D.tel + '.', 3000); }, function () { avisar('!No se pudo guardar el celular.', 5000); }); return; }
    if (t.id === 'wa-saludo' || t.id === 'wa-despedida') { S.config = S.config || {}; S.config[t.id === 'wa-saludo' ? 'waSaludo' : 'waDespedida'] = t.value.trim(); guardarConfig(); return; }
    if (D.resSel) { var fr = S.fl, kr = fr + '|' + D.resSel; S.resSel = S.resSel || {}; if (t.checked) S.resSel[kr] = true; else delete S.resSel[kr]; render(); return; }
    if (D.cf && D.f) {
      // Se redibuja después de que el foco pasó a la celda siguiente, y se lo devuelve ahí.
      var redib = function () { var ac = document.activeElement, sel = ac && ac.classList && ac.classList.contains('cam-in') ? '.cam-in[data-cf="' + ac.dataset.cf + '"][data-f="' + ac.dataset.f + '"]' : null; renderCamara(); if (sel) { var x = document.querySelector(sel); if (x) { x.focus(); try { x.select(); } catch (err) {} } } };
      camGuardarCelda(D.f, D.cf, t.value).then(function () { setTimeout(redib, 0); }, function () { avisar('!No se pudo guardar. Revisá la conexión.', 6000); });
      setTimeout(redib, 0);
      return;
    }
    if (t.id === 'cam-cap') { var cv = +String(t.value).replace(/\D/g, ''); if (cv > 0) camAjustes({ capacidad: cv }).then(function () { renderCamara(); }); return; }
    // Ojo: "cam-nota" es la nota del camión (Pedidos/Logística); la de la semana de Cámara es "cam-nota-sem".
    if (t.id === 'cam-nota-sem' && /^\d{4}-\d{2}-\d{2}$/.test(S.camLun || '')) { var Ln = S.camLun, dn = clone((S.cam || {})[Ln] || { dias: [] }); delete dn.id; dn.nota = t.value.trim(); if (!dn.nota) delete dn.nota; S.cam = S.cam || {}; var dn2 = clone(dn); dn2.id = Ln; S.cam[Ln] = dn2; store.set('privado', 'camara-' + Ln, dn).then(function () { camMandar(camSheet() ? [Ln] : []); }); return; }
    if (D.notaPed) {
      var pn = pedidoDe(D.notaPed), vn = t.value.replace(/\s+/g, ' ').trim(); if (S.notaAbierta === D.notaPed) S.notaAbierta = null;
      if (!pn || vn === String(pn.nota || '').trim()) { if (!vn) render(); return; }
      t.blur(); cambiarNota(pn, vn).then(function () { avisar(vn ? 'Nota de ' + pn.cliente + ' guardada.' : 'Nota de ' + pn.cliente + ' borrada.', 2500); render(); }, function () { avisar('!No se pudo guardar la nota. Revisá la conexión.', 6000); render(); });
      return;
    }
    if (t.id === 'r-fecha' && t.value) { S.fr = t.value; render(); return; }
    if (t.id === 'rend-rep' && t.files && t.files[0]) { cargarReporteRend(t.files[0]); try { t.value = ''; } catch (err) {} return; }
    if (D.rend) { var fq = S.fr; S.msg.rend = 'Guardando…'; pintarMsg('rend'); guardarRend(fq, D.rend, t.value).then(function () { S.msg.rend = 'Guardado.'; if (!escribiendo()) render(); else pintarMsg('rend'); }, function () { S.msg.rend = '!No se pudo guardar. Revisá la conexión.'; pintarMsg('rend'); }); return; }
    if (D.rcfg) { S.rcfgAb = true; guardarRendCfg(D.rcfg, D.id, t.value).then(function () { S.msg.rend = 'Guardado.'; render(); }, function () { S.msg.rend = '!No se pudo guardar. Revisá la conexión.'; pintarMsg('rend'); }); return; }
    // La hora del Resumen se guarda al cerrar el selector (focusout): en el iPhone el "change" salta con cada giro de la rueda
    // y al guardar se redibujaba la pantalla y se cerraba el selector.
    if (t.id === 'imp-nombre') { try { localStorage.setItem('qualita-imprime-nombre', String(t.value || '').trim() || 'Compu'); } catch (e) {} latirImpresora(); return; }
    if (D.md != null) { guardarMediaDia(D.f, +D.md, D.k, t.value).then(function () { tocar(); if (!escribiendo()) render(); }, function () { avisar('!No se pudo guardar. Revisá la conexión.', 6000); }); return; }
    if (D.hora != null && t.classList.contains('res-hora')) { if (document.activeElement !== t) guardarResHora(t); return; }
    if (t.id === 'p-fecha' && t.value) { S.pv = null; if (S.ep) guardar('prod', true); S.ep = null; S.fechaFija = true; S.fecha = t.value; render(); }
    else if (t.id === 'm-fecha' && t.value) { S.fm = t.value; render(); }
    else if (t.id === 'e-fecha' && t.value) { S.entrega = t.value; S.sel = {}; renderPedidos(); }
    else if (t.id === 'pd-fecha' && t.value) { S.pd = t.value; S.abierto = {}; renderPedidos(); }
    else if (t.id === 'l-fecha' && t.value) { S.fl = t.value; S.ec = null; render(); }
    else if (t.id === 'cli-archivo' && t.files && t.files.length) {
      var lector = new FileReader();
      lector.onload = function () {
        var nuevos = leerListaClientes(String(lector.result || ''));
        if (!nuevos.length) { S.msg.cli = '!No encontré clientes en ese archivo.'; avisar(S.msg.cli, 6000); pintarMsg('cli'); return; }
        S._cliVarios = false;
        sumarClientes(nuevos, true).then(function (r) {
          S.msg.cli = r.altas + plural(r.altas, ' cliente agregado', ' clientes agregados') + (r.cambios ? ' · ' + r.cambios + plural(r.cambios, ' número actualizado', ' números actualizados') : '') + '.';
          avisar(S.msg.cli, 6000); renderClientes();
        }, function () { S.msg.cli = '!No se pudo guardar. Revisá la conexión.'; pintarMsg('cli'); });
      };
      lector.onerror = function () { avisar('!No se pudo leer el archivo.', 6000); };
      lector.readAsText(t.files[0]);
      try { t.value = ''; } catch (err) {}
    }
    else if (t.id === 'pf-foto' && t.files && t.files.length) { leerFaenaFoto(t.files[0]); try { t.value = ''; } catch (err) {} }
    else if (t.id === 'fotos' && t.files && t.files.length) { subirFotos(t.files); try { t.value = ''; } catch (err) {} }
    else if (D.sel) {
      var ps = pedidoDe(D.sel);
      if (t.checked && ps) { if (S.selDia !== ps.entrega) { S.sel = {}; S.selDia = ps.entrega; S.camOtro = false; } S.sel[D.sel] = true; } else delete S.sel[D.sel];
      renderPedidos();
    }
    else if (D.cli != null && clientes()[+D.cli]) {
      var lc = clone(clientes()), vc = t.value.replace(/\s+/g, ' ').trim();
      if (D.k === 'n' && !vc) { t.value = lc[+D.cli].n; return; }
      lc[+D.cli][D.k] = D.k === 'n' ? vc.toUpperCase() : vc;
      escribirClientes(lc).then(function () { avisar('Guardado.', 2000); }, function () { avisar('!No se pudo guardar. Revisá la conexión.', 6000); });
    }
    else if (D.cta && t.value) {
      if (t.value === 'otra') { S.ctaOtro = D.cta; renderPedidos(); var ci2 = document.querySelector('[data-cta-in="' + D.cta + '"]'); if (ci2) ci2.focus(); return; }
      var pq = pedidoDe(D.cta), nq = t.value;
      ponerCuenta(D.cta, nq).then(function () { avisar('Cuenta ' + nq + ' guardada para ' + (pq ? pq.cliente : 'el cliente') + '.', 5000); renderPedidos(); }, function () { avisar('!No se pudo guardar. Revisá la conexión.', 6000); renderPedidos(); });
    }
    else if (D.uni && t.value) {
      guardarUnidad(D.uni, D.k, t.value).then(function () { avisar('Unidad guardada.', 2500); render(); }, function () { avisar('!No se pudo guardar. Revisá la conexión.', 6000); render(); });
    }
    else if (D.plog) {
      guardarPrecioIva(D.plog, D.k, t.value, D.cual).then(function () { avisar('Precio guardado.', 2500); }, function () { avisar('!No se pudo guardar el precio. Revisá la conexión.', 6000); });
    }
    else if (D.precio) {
      guardarPrecio(D.precio, D.k, t.value).then(function () { avisar('Precio guardado.', 2500); }, function () { avisar('!No se pudo guardar el precio. Revisá la conexión.', 6000); });
    }
    else if (D.flete) {
      var cambio = {}; cambio[D.k] = t.value;
      guardarFlete(S.fl, D.flete, cambio).then(function () { avisar('Costo guardado.', 2500); }, function () { avisar('!No se pudo guardar el costo. Revisá la conexión.', 6000); });
      var lgf = logDe(S.fl), camf = camionesDe(S.fl).filter(function (c) { return c.id === D.flete; })[0], res = document.querySelector('[data-flete-res="' + D.flete + '"]');
      if (camf && res) res.innerHTML = fleteTxt(S.fl, camf, (lgf && lgf.pedidos) || []);
    }
    else if ((t.id === 'sel-mover' || t.id === 'sel-mover-otra') && t.value) {
      if (t.value === 'otra') { S.selOtra = true; renderPedidos(); var so = $('sel-mover-otra'); if (so) so.focus(); return; }
      var fs2 = t.value, tm = (S.pedidos || []).filter(function (x) { return S.sel[x.id] && x.entrega !== fs2; });
      if (!tm.length || S._ocup) return;
      S._ocup = true;
      tm.reduce(function (cad, x) { return cad.then(function () { return moverPedido(x, fs2); }); }, Promise.resolve()).then(function () {
        S._ocup = false; S.sel = {}; S.selOtra = false; avisar((tm.length === 1 ? 'Pedido de ' + tm[0].cliente + ' pasado' : tm.length + ' pedidos pasados') + ' al ' + diaCorto(fs2).toLowerCase() + '.', 6000); renderPedidos();
      }, function () { S._ocup = false; avisar('!No se pudieron pasar todos. Revisá la conexión.', 6000); renderPedidos(); });
    }
    else if (D.mover && t.value) {
      var pm = pedidoDe(D.mover), fm = t.value;
      if (fm === 'otra') { editarPedido(D.mover, 'entrega'); return; }
      if (!pm || S._ocup) return;
      S._ocup = true; delete S.sel[pm.id];
      moverPedido(pm, fm).then(function () { S._ocup = false; var pmn = pedidoDe(pm.id); S.msg.fotos = 'Pedido de ' + pm.cliente + ' pasado al ' + diaCorto(fm).toLowerCase() + '.' + (pmn && pmn.faenaFija ? ' Las medias ya están en cámara: quedan en la faena del ' + diaCorto(pmn.faenaFija).toLowerCase() + ' y no se vuelven a faenar.' : ''); avisar(S.msg.fotos, 6000); renderPedidos(); },
        function () { S._ocup = false; S.msg.fotos = '!No se pudo cambiar de día. Revisá la conexión.'; renderPedidos(); });
    }
    else if (t.id === 'cam-a' && t.value) {
      if (t.value === 'nuevo') { S.camOtro = true; renderPedidos(); var fnn = $('cam-nombre'); if (fnn) fnn.focus(); return; }
      var ids = tildadosDe(S.selDia), v = t.value.slice(2), f = S.selDia;
      (t.value.charAt(0) === 'f' ? usarDeFlota(f, v, ids) : asignarCamion(f, ids, v).then(function () { return { id: v }; }))
        .then(function (cam) { S.msg.fotos = avisoCamion(f, cam.id, ids.length); S.sel = {}; S.camOtro = false; renderPedidos(); }, function (e) { S.msg.fotos = '!' + ((e && e.message) || 'No se pudo guardar. Revisá la conexión.'); renderPedidos(); });
    }
    else if (D.posPed != null && D.cam) { moverEnCamionA(S.fl, D.cam, D.posPed, +t.value).then(render, function () { S.msg.log = '!No se pudo guardar.'; render(); }); }
    else if (D.posCam != null) { moverCamionA(S.fl, D.posCam, +t.value).then(render, function () { S.msg.log = '!No se pudo guardar.'; render(); }); }
    else if (D.pasar && t.value) { (t.value.charAt(0) === 'f' ? usarDeFlota(S.fl, t.value.slice(2), [D.pasar]) : asignarCamion(S.fl, [D.pasar], t.value.slice(2))).then(render, function () { S.msg.log = '!No se pudo guardar.'; render(); }); }
  });

  var h0 = (location.hash || '').slice(1);
  // Link personal para cargar la planilla de Cámara de una vez (#camara?d=...): los datos viajan solo en el link.
  var mcam = h0.match(/^camara\?d=([A-Za-z0-9_-]+)$/); if (mcam) { S.camLink = mcam[1]; h0 = 'camara'; try { history.replaceState(null, '', '#camara'); } catch (err) {} }
  if (TABS.indexOf(h0) >= 0) S.tab = h0 === 'ciclo3' ? 'produccion' : h0;
  // Link para compartir con una sola pestaña: se ve esa sola, sin las demás y sin ingresar.
  // Es la página logistica.html (se arma con tools/paginas.py); el link viejo con ?solo=logistica sigue andando.
  try { var qs = document.documentElement.getAttribute('data-solo') || new URLSearchParams(location.search).get('solo'); if (qs === 'logistica' || qs === 'produccion' || qs === 'ciclo3' || qs === 'rendering' || qs === 'medias') { S.solo = qs; S.tab = qs; } } catch (err) {}
  if (S.solo) {
    var tsolo = S.solo === 'produccion' ? 'Producción' : S.solo === 'ciclo3' ? 'Ciclo III' : S.solo === 'rendering' ? 'Rendering' : S.solo === 'medias' ? 'Medias' : 'Logística';
    document.title = tsolo + ' Qualitá';
    var mf = document.querySelector('link[rel="manifest"]'); if (mf) mf.setAttribute('href', S.solo + '.webmanifest');
    var mn = document.querySelector('.marca-nom'); if (mn) mn.textContent = tsolo;
    document.documentElement.classList.add('solo');
  }

  /* ---------- rendering ----------
     Solo informativo: los kilos que entran a rendering (insumos) y lo que sale (producidos), por día.
     Se estiman solos con la faena (cerdos del día, de la planilla de Medias) y el desposte (medias de la
     planilla de Producción); un editor puede corregir cualquier número del día y los factores del cálculo.
     Se guarda en config/rendering (factores) y config/rend-AAAA-MM-DD (números corregidos a mano). */
  /* Factores de partida sacados de lo real de julio a septiembre de 2026 (traspasos Frigorífico → Rendering,
     compras de afuera, kg producidos y cabezas faenadas del informe mensual): kg por cerdo faenado. Producidos:
     37% de lo que entra, repartido 54% harina y 46% sebo (planillas de venta de harina y sebo). Cuando hay días con
     datos reales cargados, el estimado aprende de esos días (últimos 20 hábiles con dato real). */
  var REND_INS = [
    { id: 'hueso', nom: 'Hueso (incluye cabeza)', def: 9.5 },
    { id: 'dfaena', nom: 'Despojo de faena', def: 11.3 },
    { id: 'ddesposte', nom: 'Despojo de despostada', def: 5.6 },
    { id: 'grasa', nom: 'Grasa en rama', def: 1.5 },
    { id: 'cuero', nom: 'Cuero y recorte de cuero', def: 1.8 },
    { id: 'otros', nom: 'Decomisos y varios', def: 0.2 }
  ];
  var REND_PROD = [
    { id: 'harina', nom: 'Harina de carne y hueso', def: 22.8 },
    { id: 'sebo', nom: 'Sebo', def: 19.4 }
  ];
  function rendFactor(tipo, x) { var c = S.rendCfg || {}, v = (c[tipo] || {})[x.id]; return v === 0 || v ? +v : x.def; }
  function cerdosDe(f) { var sem = semDe(lunesDe(f)), i = Math.round((fecha(f) - fecha(lunesDe(f))) / 86400000), d = sem && sem.dias && sem.dias[i], c = null; if (d) { var t = sumas(d); c = t.propios + t.usuarios || null; } if (!c) { var o = prodDe(f); if (o && +o.medias) c = Math.round(+o.medias / 2); } return c; }
  function mediasDe(f) { var o = prodDe(f); return o && +o.medias ? +o.medias : null; }
  function realDe(f, id) { var v = (((S.rend || {})[f] || {}).v || {})[id]; return v === 0 || v ? +v : null; }
  // Lo aprendido de los días con dato real: kg por cerdo (insumos) o % de lo que entró (producidos).
  function rendAprendido(f) {
    var memo = S._rendAp || (S._rendAp = {}), clave = f + '|' + JSON.stringify(S.rend || {}).length + '|' + (S.faena || []).length;
    if (memo[clave]) return memo[clave];
    var ap = { ins: {}, prod: {}, dias: 0 }, d = f, dias = [];
    for (var i = 0; i < 60 && dias.length < 20; i++) { d = habilAnterior(d); if ((S.rend || {})[d]) dias.push(d); }
    ap.dias = dias.length;
    REND_INS.forEach(function (x) { var k = 0, b = 0, nd = 0; dias.forEach(function (q) { var r = realDe(q, x.id), c = cerdosDe(q); if (r != null && c) { k += r; b += c; nd++; } }); if (nd >= 3 && b) ap.ins[x.id] = { k: k / b, n: nd }; });
    REND_PROD.forEach(function (x) { var k = 0, b = 0, nd = 0; dias.forEach(function (q) { var r = realDe(q, x.id); if (r == null) return; var t = 0, todos = true; REND_INS.forEach(function (y) { var ry = realDe(q, y.id); if (ry != null) t += ry; else todos = false; }); if (todos && t) { k += r; b += t; nd++; } }); if (nd >= 3 && b) ap.prod[x.id] = { k: k / b * 100, n: nd }; });
    memo[clave] = ap; return ap;
  }
  /* Solo el día de hoy se estima (con lo que pasó en días anteriores). Los días pasados muestran únicamente lo
     cargado de los reportes del sistema (o a mano); lo que no se cargó queda sin dato. */
  function rendDia(f) {
    var esHoy = f === hoy(), cer = cerdosDe(f), ap = esHoy ? rendAprendido(f) : { ins: {}, prod: {} };
    var out = { f: f, hoy: esHoy, cerdos: cer, medias: mediasDe(f), ins: [], prod: [], tIns: 0, tProd: 0, manual: 0, estim: 0, faltan: 0 };
    REND_INS.forEach(function (x) {
      var a = ap.ins[x.id], k = a ? a.k : rendFactor('ins', x), est = esHoy && cer ? Math.round(cer * k) : null, m = realDe(f, x.id), v = m != null ? m : est;
      if (m != null) out.manual++; else if (est != null) out.estim++; else out.faltan++;
      out.ins.push({ id: x.id, nom: x.nom, kg: v, est: est, manual: m != null, como: !esHoy ? 'Sin dato cargado' : cer ? n(Math.round(k * 100) / 100) + ' kg × ' + n(cer) + ' cerdos' + (a ? ' (promedio de ' + a.n + ' días reales)' : ' (promedio julio–septiembre)') : 'falta la faena del día para estimar' });
      out.tIns += v || 0;
    });
    REND_PROD.forEach(function (x) {
      var a = ap.prod[x.id], p = a ? a.k : rendFactor('prod', x), est = esHoy && out.tIns ? Math.round(out.tIns * p / 100) : null, m = realDe(f, x.id), v = m != null ? m : est;
      if (m != null) out.manual++; else if (est != null) out.estim++; else out.faltan++;
      out.prod.push({ id: x.id, nom: x.nom, kg: v, est: est, manual: m != null, como: !esHoy ? 'Sin dato cargado' : n(Math.round(p * 10) / 10) + '% de lo que entra' + (a ? ' (promedio de ' + a.n + ' días reales)' : ' (promedio julio–septiembre)') });
      out.tProd += v || 0;
    });
    out.tIns = Math.round(out.tIns); out.tProd = Math.round(out.tProd);
    out.sinSebo = !out.hoy && realDe(f, 'sebo') == null && out.tProd > 0;
    return out;
  }
  /* Lectura del reporte del sistema "Resumen de Insumos" (Producción > Reportes > Ciclo II, tipo Rendering), de un día.
     Cada artículo se suma a su renglón por código (o por nombre si el código no es conocido). */
  var REND_COD = { hueso: [420, 425, 434], dfaena: [440], ddesposte: [430, 443], grasa: [472, 473, 484], cuero: [412, 414, 417] };
  function rendCategoria(cod, nom) {
    var k = Object.keys(REND_COD).filter(function (x) { return REND_COD[x].indexOf(+cod) >= 0; })[0]; if (k) return k;
    var t = norm(nom);
    return /CUERO/.test(t) ? 'cuero' : /HUESO/.test(t) ? 'hueso' : /DESPOJO DE FAENA/.test(t) ? 'dfaena' : /DESPOJO/.test(t) ? 'ddesposte' : /GRASA/.test(t) ? 'grasa' : 'otros';
  }
  function rendProducto(cod, nom) { var t = norm(nom); return +cod === 810 || /HARINA/.test(t) ? 'harina' : /SEBO|GRASA FUNDIDA/.test(t) ? 'sebo' : null; }
  var ESQUEMA_REND = { type: 'object', additionalProperties: false, required: ['es_reporte', 'reporte', 'desde', 'hasta', 'tipo', 'articulos', 'total_kilos', 'dudas'], properties: {
    es_reporte: { type: 'boolean', description: 'true si la imagen es el reporte Resumen de Insumos o Resumen de Produccion' },
    reporte: { type: 'string', enum: ['insumos', 'produccion', 'otro'], description: 'insumos = Resumen de Insumos; produccion = Resumen de Produccion' },
    desde: { type: 'string', description: 'AAAA-MM-DD' }, hasta: { type: 'string', description: 'AAAA-MM-DD' }, tipo: { type: 'string', description: 'lo que dice Tipo Ciclo II' },
    articulos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['codigo', 'nombre', 'unidades', 'kilos'], properties: { codigo: { type: 'integer' }, nombre: { type: 'string' }, unidades: { type: 'number' }, kilos: { type: 'number' } } } },
    total_kilos: { type: 'number' }, dudas: { type: 'array', items: { type: 'string' } } } };
  function leerReporteRend(file) {
    if (window.__mock && window.__mock.iaRep) return Promise.resolve(window.__mock.iaRep(file.name));
    if (!(S.ia && S.ia.clave)) return Promise.reject(new Error('Falta cargar la clave de IA (en Pedidos, abajo, en Configuración).'));
    return achicar(file).then(function (b64) {
      return fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': S.ia.clave, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: S.ia.modelo || IA_MODELO, max_tokens: 4000,
          system: 'Leés capturas del sistema de producción del Frigorífico Qualitá. Los reportes "Resumen de Insumos" (lo que entra) y "Resumen de Produccion" (lo que sale) tienen arriba "Fecha: dd/mm/aa-dd/mm/aa" (desde-hasta) y "Tipo Ciclo II", y una tabla con código, artículo, unidades y kilos, más una fila TOTALES. Copiá cada fila de la tabla tal cual (los kilos usan punto decimal: 2158.96 son dos mil ciento cincuenta y ocho kilos). Las fechas van en AAAA-MM-DD (el año "26" es 2026). No copies la fila TOTALES como artículo: va en total_kilos. Si algo no se lee bien, avisalo en dudas. En "reporte" decí cuál de los dos es, según el título. Si la imagen no es ninguno de esos reportes, es_reporte=false.',
          output_config: { format: { type: 'json_schema', schema: ESQUEMA_REND } },
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text: 'Leé este reporte.' }] }] }) })
        .then(function (r) { return r.json().then(function (j) {
          if (!r.ok) throw new Error(r.status === 401 ? 'La clave de IA no es válida.' : (j && j.error && j.error.message) || ('Error ' + r.status));
          var t = (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
          try { return JSON.parse(t); } catch (e) { throw new Error('No se pudo leer el reporte.'); }
        }); });
    });
  }
  function cargarReporteRend(file) {
    S.msg.rend = 'Leyendo el reporte…'; pintarMsg('rend'); avisar('Leyendo el reporte de insumos…', 4000);
    return leerReporteRend(file).then(function (j) {
      if (!j || !j.es_reporte || j.reporte === 'otro' || !(j.articulos || []).length) throw new Error('No parece el reporte "Resumen de Insumos" ni el "Resumen de Producción". Mandá la captura de uno de esos reportes.');
      var esProd = j.reporte === 'produccion';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(j.desde || '')) throw new Error('No se pudo leer la fecha del reporte.');
      if (j.hasta && j.hasta !== j.desde) throw new Error('El reporte es de varios días (' + diaCorto(j.desde) + ' a ' + diaCorto(j.hasta) + '). Sacalo de un solo día: desde y hasta con la misma fecha.');
      if (j.tipo && !/RENDER/.test(norm(j.tipo))) throw new Error('El reporte es de "' + j.tipo + '", no de Rendering. Elegí Tipo Ciclo II: Rendering.');
      var f = j.desde, v = {}, suma = 0, sinUbicar = [];
      if (!esProd) REND_INS.forEach(function (x) { v[x.id] = 0; });
      j.articulos.forEach(function (a) {
        var k = esProd ? rendProducto(a.codigo, a.nombre) : rendCategoria(a.codigo, a.nombre);
        if (!k) { sinUbicar.push(a.nombre); return; }
        v[k] = Math.round(((v[k] || 0) + (+a.kilos || 0)) * 100) / 100; suma += +a.kilos || 0;
      });
      var doc = clone((S.rend || {})[f] || { fecha: f, v: {} }); delete doc.id; doc.fecha = f; doc.v = doc.v || {};
      Object.keys(v).forEach(function (k) { doc.v[k] = v[k]; });
      doc[esProd ? 'artsProd' : 'arts'] = j.articulos.map(function (a) { return { c: +a.codigo || 0, n: String(a.nombre || ''), u: +a.unidades || 0, kg: +a.kilos || 0 }; });
      doc.actualizado = ahoraTxt();
      var aviso = sinUbicar.length ? ' No se sumó (no es harina ni sebo): ' + sinUbicar.join(', ') + '.' : Math.abs(suma - (+j.total_kilos || suma)) > 1 ? ' Ojo: la suma de los renglones (' + n(Math.round(suma)) + ' kg) no da el total del reporte (' + n(Math.round(+j.total_kilos)) + ' kg); revisalo.' : '';
      if ((j.dudas || []).length) aviso += ' Dudas: ' + j.dudas.join(' ');
      S.rend = S.rend || {}; S.rend[f] = clone(doc); S._rendAp = null;
      return store.set('config', 'rend-' + f, doc).then(function () {
        S.fr = f; S.msg.rend = (aviso ? '!' : '') + 'Cargado el real del ' + diaCorto(f) + ': ' + n(Math.round(suma)) + (esProd ? ' kg producidos' + (v.sebo == null ? ' (el sebo no figura en el reporte: queda sin dato)' : '') : ' kg de insumos') + '.' + aviso;
        avisar(S.msg.rend, aviso ? 12000 : 6000); render();
      });
    }).then(null, function (e) { S.msg.rend = '!' + e.message; avisar(S.msg.rend, 9000); pintarMsg('rend'); });
  }
  function guardarRend(f, id, valor) {
    var doc = clone((S.rend || {})[f] || { fecha: f, v: {} }); delete doc.id; doc.v = doc.v || {};
    if (valor === '' || valor == null) delete doc.v[id]; else doc.v[id] = +String(valor).replace(',', '.') || 0;
    doc.actualizado = ahoraTxt(); S.rend = S.rend || {}; S.rend[f] = clone(doc); S._rendAp = null;
    return Object.keys(doc.v).length ? store.set('config', 'rend-' + f, doc) : (delete S.rend[f], store.del('config', 'rend-' + f));
  }
  function guardarRendCfg(tipo, id, valor) {
    var c = clone(S.rendCfg || {}); delete c.id; c[tipo] = c[tipo] || {};
    if (valor === '' || valor == null) delete c[tipo][id]; else c[tipo][id] = +String(valor).replace(',', '.') || 0;
    c.actualizado = ahoraTxt(); S.rendCfg = clone(c);
    return store.set('config', 'rendering2', c);
  }
  function rendFechaInicial() { var h = hoy(); return esHabil(h) ? h : habilAnterior(h); }
  function renderRendering() {
    var el = $('view-rendering');
    if (cargando(el, S.faena)) return;
    if (!S.fr) S.fr = rendFechaInicial();
    var f = S.fr, r = rendDia(f), ed = S.editor && !S.solo, kg = function (v) { return v == null ? '—' : n(v) + ' kg'; };
    var h = '<div class="nav"><button class="btn step" data-act="fr" data-d="-1" aria-label="Día anterior">‹</button><span class="tit">' + fechaTit(f) + '</span><button class="btn step" data-act="fr" data-d="1" aria-label="Día siguiente">›</button>'
      + '<input type="date" id="r-fecha" value="' + esc(f) + '" aria-label="Ir a una fecha">'
      + (f !== rendFechaInicial() ? '<button class="btn" data-act="fr-hoy">Hoy</button>' : '')
      + '<button class="btn" data-act="imprimir">Imprimir</button>'
      + (ed ? '<label class="btn pri" style="display:inline-flex;align-items:center">Cargar reporte del sistema<input type="file" id="rend-rep" accept="image/*" hidden></label><button class="btn" data-act="link-rend">Copiar link para compartir</button>' : '') + '<span class="guardado" id="g-rend"></span></div>'
      + (ed ? '<p class="small muted rend-ayuda">Lo real se carga solo desde el sistema todos los días a las 7:30 y a las 19:30 (lo de hoy, a la noche). Si hace falta antes, se puede pegar acá con Ctrl+V la captura del Resumen de insumos o de producción.</p>' : '');
    var rinde = r.tIns ? Math.round(r.tProd / r.tIns * 1000) / 10 : null;
    var estado = r.hoy ? (r.manual && !r.estim ? 'real' : r.manual ? 'parcial' : r.estim ? 'estim' : '') : r.manual ? (r.faltan ? 'incompleto' : 'real') : 'vacio';
    h += '<section class="rend-hero"><div><p class="dh-sup">Rendering · ' + esc(cuandoEs(f) === 'hoy' ? 'hoy' : diaCorto(f)) + '</p><h2>' + esc(tituloDe(f)) + ' ' + (estado === 'real' ? '<span class="badge ok">Datos reales</span>' : estado === 'parcial' ? '<span class="badge warn">Parte real, parte estimado</span>' : estado === 'estim' ? '<span class="badge warn">Estimado</span>' : estado === 'incompleto' ? '<span class="badge plain">Datos reales · faltan renglones</span>' : estado === 'vacio' ? '<span class="badge plain">Sin datos cargados</span>' : '') + '</h2>'
      + '<p class="dh-sub">' + (r.cerdos ? n(r.cerdos) + ' cerdos faenados' : 'Sin faena cargada') + (r.medias ? ' · ' + n(r.medias) + ' medias despostadas' : '') + '</p>' + (estado === 'estim' || estado === 'parcial' ? '<p class="small rend-nota">Estimación en base a lo que pasó en días anteriores. Los datos reales se cargan al final del día y reemplazan a la estimación.</p>' : estado === 'vacio' ? '<p class="small rend-nota">Este día no tiene cargados los reportes del sistema. Los días pasados no se estiman: se muestra solo lo real.</p>' : '') + '</div>'
      + '<div class="kpis"><div class="kpi"><b>' + (r.tIns ? n(r.tIns) : '—') + '</b><span>kg de insumos' + (estado === 'estim' ? ' (estimado)' : '') + '</span></div><div class="kpi"><b>' + (r.tProd ? n(r.tProd) : '—') + '</b><span>kg producidos' + (estado === 'estim' ? ' (estimado)' : r.sinSebo ? ' (sin sebo)' : '') + '</span></div><div class="kpi"><b>' + (rinde == null || !r.tProd ? '—' : n(rinde) + '%') + '</b><span>rendimiento' + (r.sinSebo ? ' (solo harina)' : '') + '</span></div></div></section>';
    var tabla = function (tit, filas, tot) {
      return '<div class="panel rend-tabla"><h3>' + tit + '</h3><table class="pl"><thead><tr><th>Producto</th><th class="num">Kg</th></tr></thead><tbody>' + filas.map(function (x) {
        var val = ed ? '<input type="number" inputmode="decimal" step="any" min="0" class="rend-in" data-rend="' + x.id + '" value="' + esc(x.manual ? x.kg : '') + '" placeholder="' + esc(x.est == null ? '' : String(x.est)) + '" aria-label="Kilos de ' + esc(x.nom) + '"><span class="solo-print">' + kg(x.kg) + '</span>' : '<b>' + kg(x.kg) + '</b>';
        return '<tr><td>' + esc(x.nom) + '<span class="rend-como">' + (x.manual ? 'Real' + (x.est != null ? ' · se estimaba ' + n(x.est) + ' kg' : '') : x.est != null ? 'Estimado: ' + esc(x.como) : esc(x.como)) + '</span></td><td class="num">' + val + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td>Total</td><td class="num"><b>' + kg(tot || null) + '</b></td></tr></tfoot></table></div>';
    };
    h += '<div class="rend-grid">' + tabla('Insumos (lo que entra)', r.ins, r.tIns) + tabla('Producidos (lo que sale)', r.prod, r.tProd) + '</div>';
    var rd0 = (S.rend || {})[f];
    [['arts', 'Resumen de insumos'], ['artsProd', 'Resumen de producción']].forEach(function (z) {
      var l = rd0 && rd0[z[0]]; if (!l || !l.length) return;
      h += '<details class="panel rend-det"><summary>' + z[1] + ' del sistema (' + l.length + (l.length === 1 ? ' artículo' : ' artículos') + ' · ' + n(Math.round(l.reduce(function (t, a) { return t + a.kg; }, 0))) + ' kg)</summary><table class="pl"><thead><tr><th>Cód.</th><th>Artículo</th><th class="num">Unid.</th><th class="num">Kg</th></tr></thead><tbody>' + l.map(function (a) { return '<tr><td>' + a.c + '</td><td>' + esc(a.n) + '</td><td class="num">' + n(a.u) + '</td><td class="num">' + n(a.kg) + '</td></tr>'; }).join('') + '</tbody></table></details>';
    });
    if (ed) h += '<p class="small muted rend-ayuda">' + (r.hoy ? 'Los números en gris son la estimación de hoy. ' : '') + 'También se puede escribir el real de un renglón a mano; si lo borrás, queda sin dato' + (r.hoy ? ' (vuelve a la estimación)' : '') + '.</p>';
    // Días anteriores
    var dias = [], x = f; for (var i = 0; i < 10; i++) { dias.push(x); x = habilAnterior(x); }
    h += '<div class="panel"><h3>Días anteriores</h3><table class="pl rend-hist"><thead><tr><th>Día</th><th class="num">Insumos</th><th class="num">Producidos</th><th class="num">Rend.</th></tr></thead><tbody>' + dias.map(function (d) {
      var q = rendDia(d), rr = q.tIns ? Math.round(q.tProd / q.tIns * 1000) / 10 : null;
      return '<tr' + (d === f ? ' class="sel"' : '') + '><td><button class="lnk" data-act="fr-ir" data-f="' + d + '">' + esc(diaCorto(d)) + '</button>' + (q.hoy ? (q.estim ? ' <span class="badge warn">estimado</span>' : q.manual ? ' <span class="badge ok">real</span>' : '') : q.manual ? (q.sinSebo ? ' <span class="badge plain">real · sin sebo</span>' : ' <span class="badge ok">real</span>') : ' <span class="badge plain">sin cargar</span>') + '</td><td class="num">' + (q.tIns ? n(q.tIns) + ' kg' : '—') + '</td><td class="num">' + (q.tProd ? n(q.tProd) + ' kg' : '—') + '</td><td class="num">' + (rr == null ? '—' : n(rr) + '%') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    if (ed) {
      h += '<details class="panel rend-cfg"' + (S.rcfgAb ? ' open' : '') + '><summary>Cómo se calcula la estimación de hoy</summary><p class="small muted">Solo el día de hoy se estima. Valores de partida, sacados de lo real de julio a septiembre. Cuando hay 3 o más días con datos reales en las últimas semanas, la estimación usa el promedio de esos días en vez de estos números.</p><div class="campos">'
        + REND_INS.map(function (y) { return '<label class="campo"><span>' + esc(y.nom) + ' (kg por cerdo)</span><input type="number" inputmode="decimal" step="any" min="0" data-rcfg="ins" data-id="' + y.id + '" value="' + esc(rendFactor('ins', y)) + '"></label>'; }).join('')
        + REND_PROD.map(function (y) { return '<label class="campo"><span>' + esc(y.nom) + ' (% de lo que entra)</span><input type="number" inputmode="decimal" step="any" min="0" data-rcfg="prod" data-id="' + y.id + '" value="' + esc(rendFactor('prod', y)) + '"></label>'; }).join('')
        + '</div></details>';
    }
    el.innerHTML = h; pintarMsg('rend');
  }

  /* ---------- datos ---------- */
  function cache(leer) {
    try {
      if (leer) return JSON.parse(localStorage.getItem('pq-datos-2') || 'null');
      localStorage.setItem('pq-datos-2', JSON.stringify({ faena: S.faena, produccion: S.prod, config: S.config }));
    } catch (err) { return null; }
  }
  function poner(lista, id, doc) { var x = clone(doc); x.id = id; return ordenar((lista || []).filter(function (e) { return e.id !== id; }).concat([x])); }
  function ordenar(l) { return l.slice().sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); }); }
  function aplicar(d, fuente) {
    S.config = d.config || {}; S.faena = ordenar((d.faena || []).map(function (x) { x.desde = x.desde || x.id; return x; }));
    S.prod = ordenar((d.produccion || []).map(function (x) { x.fecha = x.fecha || x.id; return x; })); S.status = 'ready'; S.fuente = fuente;
  }
  function respaldo() { return fetch('datos.json?v=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function importar() {
    return respaldo().then(function (d) {
      var t = [];
      (d.faena || []).forEach(function (s) { var x = clone(s), id = x.id; delete x.id; t.push(store.set('faena', id, x)); });
      (d.produccion || []).forEach(function (o) { var x = clone(o), id = x.id; delete x.id; t.push(store.set('produccion', id, x)); });
      var c = clone(d.config || {}); c.actualizado = ahoraTxt(); t.push(store.set('config', 'general', c));
      return Promise.all(t);
    });
  }

  function mockStore(m) {
    var subs = {}, authCb = null;
    function emit(c) { var docs = Object.keys(m.data[c] || {}).map(function (id) { var o = clone(m.data[c][id]); o.id = id; return o; }); (subs[c] || []).forEach(function (f) { f(docs); }); }
    return {
      sub: function (c, cb) { (subs[c] = subs[c] || []).push(cb); setTimeout(function () { emit(c); }, 0); },
      set: function (c, id, data) { if (m.fallar) return Promise.reject(new Error('x')); m.data[c] = m.data[c] || {}; m.data[c][id] = clone(data); if (m.alGuardar) m.alGuardar(c, id, m.data[c][id]); setTimeout(function () { emit(c); }, 0); return Promise.resolve(); },
      rango: function (c, desde, hasta) { return Promise.resolve(Object.keys(m.data[c] || {}).filter(function (id) { return id >= desde && id < hasta; }).map(function (id) { var o = clone(m.data[c][id]); o.id = id; return o; })); },
      del: function (c, id) { if (m.data[c]) delete m.data[c][id]; setTimeout(function () { emit(c); }, 0); return Promise.resolve(); },
      onAuth: function (cb) { authCb = cb; setTimeout(function () { cb(m.user || null); }, 0); },
      signIn: function () { m.user = { email: m.loginAs }; authCb(m.user); return Promise.resolve(); },
      google: function () { m.user = { email: m.loginAs, emailVerified: true }; authCb(m.user); return Promise.resolve(); },
      entrarMail: function (e) { if (m.malClave) return Promise.reject({ code: 'auth/invalid-credential' }); m.user = { email: e, emailVerified: !!m.verificado }; authCb(m.user); return Promise.resolve(m.user); },
      crearMail: function (e) { m.user = { email: e, emailVerified: false }; m.mails = (m.mails || 0) + 1; authCb(m.user); return Promise.resolve(); },
      olvide: function () { m.reset = (m.reset || 0) + 1; return Promise.resolve(); },
      reenviar: function () { m.mails = (m.mails || 0) + 1; return Promise.resolve(); },
      confirmar: function () { if (!m.verificado) return Promise.resolve(false); m.user.emailVerified = true; authCb(m.user); return Promise.resolve(true); },
      signOut: function () { m.user = null; authCb(null); return Promise.resolve(); },
      esEditor: function (email) { return Promise.resolve((m.editores || []).indexOf(email) >= 0); },
      puedeCamara: function (email) { return Promise.resolve((m.camara || []).indexOf(email) >= 0); }
    };
  }
  function firebaseStore() {
    var base = 'https://www.gstatic.com/firebasejs/' + FIREBASE.version + '/';
    return Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js'), import(base + 'firebase-auth.js')]).then(function (m) {
      var app = m[0].initializeApp(FIREBASE.config), fs = m[1], au = m[2], db = fs.getFirestore(app), auth = au.getAuth(app), authCb = null;
      auth.languageCode = 'es';
      return {
        sub: function (c, cb, err) { return fs.onSnapshot(fs.collection(db, c), function (snap) { cb(snap.docs.map(function (x) { var o = x.data(); o.id = x.id; return o; })); }, err || function () {}); },
        // Escucha solo algunos documentos de una colección (por id exacto o por rango de ids) y avisa con todos juntos.
        // Se usa para config: así no se bajan cada vez todos los log-* y rend-* históricos (cuidar el cupo de lecturas).
        // Lee una sola vez (sin quedarse escuchando) los documentos con id entre desde y hasta.
        rango: function (c, desde, hasta) { return fs.getDocs(fs.query(fs.collection(db, c), fs.where(fs.documentId(), '>=', desde), fs.where(fs.documentId(), '<', hasta))).then(function (s) { return s.docs.map(function (x) { var o = x.data(); o.id = x.id; return o; }); }); },
        subRangos: function (c, rangos, cb, err) {
          var partes = {};
          rangos.forEach(function (r, i) {
            var rango = Array.isArray(r);
            var q = rango ? fs.query(fs.collection(db, c), fs.where(fs.documentId(), '>=', r[0]), fs.where(fs.documentId(), '<', r[1])) : fs.doc(db, c, r);
            fs.onSnapshot(q, function (s) {
              partes[i] = rango ? s.docs.map(function (x) { var o = x.data(); o.id = x.id; return o; }) : (s.exists() ? [Object.assign(s.data(), { id: s.id })] : []);
              if (Object.keys(partes).length < rangos.length) return;
              var todo = []; Object.keys(partes).forEach(function (k) { todo = todo.concat(partes[k]); }); cb(todo);
            }, err || function () {});
          });
        },
        set: function (c, id, data) { return fs.setDoc(fs.doc(db, c, id), clone(data)); },
        del: function (c, id) { return fs.deleteDoc(fs.doc(db, c, id)); },
        onAuth: function (cb) { authCb = cb; return au.onAuthStateChanged(auth, cb); },
        signIn: function () { return au.signInWithPopup(auth, new au.GoogleAuthProvider()); },
        google: function () { var p = new au.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return au.signInWithPopup(auth, p); },
        entrarMail: function (e, p) { return au.signInWithEmailAndPassword(auth, e, p).then(function (c) { return c.user; }); },
        crearMail: function (e, p) { return au.createUserWithEmailAndPassword(auth, e, p).then(function (c) { return au.sendEmailVerification(c.user, { url: location.origin + location.pathname }); }); },
        olvide: function (e) { return au.sendPasswordResetEmail(auth, e); },
        renovar: function () { return auth.currentUser ? auth.currentUser.reload().then(function () { return auth.currentUser.getIdToken(true); }) : Promise.resolve(); },
        reenviar: function () { return auth.currentUser ? au.sendEmailVerification(auth.currentUser, { url: location.origin + location.pathname }) : Promise.resolve(); },
        // Después de tocar el link del mail: se relee la cuenta y se pide un permiso nuevo, que ya dice "verificado".
        confirmar: function () { var u = auth.currentUser; if (!u) return Promise.resolve(false); return u.reload().then(function () { return u.getIdToken(true); }).then(function () { if (u.emailVerified && authCb) authCb(auth.currentUser); return u.emailVerified; }); },
        signOut: function () { return au.signOut(auth); },
        // Si la consulta falla (señal floja en el celu, sesión recién abierta) se reintenta; también se prueba el mail en minúsculas.
        esEditor: function (email) {
          var ids = [email]; if (String(email).toLowerCase() !== email) ids.push(String(email).toLowerCase());
          var prueba = function (vez) {
            return Promise.all(ids.map(function (x) { return fs.getDoc(fs.doc(db, 'editores', x)).then(function (s) { return s.exists(); }); })).then(function (r) { return r.some(Boolean); },
              function (er) { if (vez >= 3) return false; return new Promise(function (ok) { setTimeout(ok, 1500 * (vez + 1)); }).then(function () { return (store.renovar ? store.renovar() : Promise.resolve()).then(null, function () {}); }).then(function () { return prueba(vez + 1); }); });
          };
          return prueba(0);
        },
        // Cámara (privada): solo las cuentas que figuran en /camaraUsuarios.
        puedeCamara: function (email) { return huella(email).then(function (h) { return CAM_CUENTAS.indexOf(h) >= 0; }, function () { return false; }); }
      };
    });
  }

  function conectar(st) {
    store = st;
    var got = {}, vacia = false, suscripto = false, importando = false;
    function traer() { if (importando) return; importando = true; importar().catch(function () { importando = false; }); }
    function llego(k) {
      got[k] = true;
      if (!(got.faena && got.prod)) return;
      S.status = 'ready';
      if (!S.faena.length && !S.prod.length) {
        vacia = true; S.fuente = 'vivo';
        if (S.editor) traer();
        else respaldo().then(function (d) { if (vacia && !S.editor) { aplicar(d, 'respaldo'); render(); } }, function () {});
      } else { vacia = false; S.fuente = 'vivo'; cache(); }
      renderDatos();
    }
    var fallo = function () { if (!got.faena || !got.prod) { var c = cache(true); if (c && c.produccion) aplicar(c, 'cache'); else S.status = 'error'; render(); } };
    store.sub('faena', function (l) { if (S.fuente === 'respaldo' && !l.length) return; S.faena = ordenar(l.map(function (x) { x.desde = x.desde || x.id; return x; })); llego('faena'); conciliarMedias(); }, fallo);
    store.sub('produccion', function (l) { if (S.fuente === 'respaldo' && !l.length) return; S.prod = ordenar(l.map(function (x) { x.fecha = x.fecha || x.id; return x; })); llego('prod'); migrarPecho(); }, fallo);
    // config: 'general', 'rendering2', la logística de los últimos 45 días (y lo que viene) y el rendering de los últimos 150 días.
    var hace = function (n) { var d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
    var rangosConfig = ['general', 'rendering2', ['log-' + hace(45), 'log-~'], ['rend-' + hace(150), 'rend-~']];
    var dentroConfig = function (x) { var k = String(x.id); return k === 'general' || k === 'rendering2' || (k >= rangosConfig[2][0] && k < 'log-~') || (k >= rangosConfig[3][0] && k < 'rend-~'); };
    var subConfig = function (fn) { return store.subRangos ? store.subRangos('config', rangosConfig, fn) : store.sub('config', function (l) { fn(l.filter(dentroConfig)); }); };
    subConfig(function (l) {
      var c = l.filter(function (x) { return x.id === 'general'; })[0], lg = {};
      var rd = {}, rc = null;
      l.forEach(function (x) { var k = String(x.id); if (k.indexOf('log-') === 0) { (x.camiones || []).forEach(horaDeNota); lg[x.id.slice(4)] = x; } else if (k.indexOf('rend-') === 0) rd[k.slice(5)] = x; else if (k === 'rendering2') rc = x; });
      S.rend = rd; S.rendCfg = rc; S._rendAp = null;
      // Mientras se edita el stock de camiones, lo que se está escribiendo no se pisa con lo que llega.
      if (c && S.ef) { c.flota = S.config.flota; c.kgMedia = S.config.kgMedia; c.kgCaja = S.config.kgCaja; }
      S.log = lg; S.logListo = true; if (c) S.config = c;
      conciliarLog(); renderDatos();
    });
    store.onAuth(function (u) {
      S.user = u ? { email: u.email } : null; S.editor = false; S.editorVisto = false;
      if (S.solo) { S.user = null; render(); return; }   // el link para compartir es siempre de solo lectura
      // Quien entró con mail y todavía no lo confirmó no puede leer nada: se le pide que lo confirme.
      if (u && u.emailVerified === false) { S.user = null; render(); if (window.Acceso) window.Acceso.verificar(store, u.email); return; }
      if (!u) { S.em = null; S.ep = null; S.prop = []; S.camaraOk = false; S.cam = {}; render(); return; }
      if (store.puedeCamara) store.puedeCamara(u.email).then(function (c) {
        S.camaraOk = !!c;
        if (c && S.volver === 'camara') { S.tab = 'camara'; S.volver = null; }
        render();
      });
      (store.renovar ? store.renovar() : Promise.resolve()).then(null, function () {}).then(function () { return store.esEditor(u.email); }).then(function (ok) {
        S.editor = ok; S.editorVisto = true; latirImpresora(); if (ok && pinGuardado()) bloquear();
        if (ok && S.volver && S.tab === 'inicio') { S.tab = S.volver; S.volver = null; }
        if (ok) {
          if (S.fuente === 'respaldo' || vacia) traer();
          if (!suscripto) {
            suscripto = true;
            store.sub('pedidos', function (l) { S.pedidos = ordenar(l.filter(function (x) { return !pedidoVacio2(x); })); conciliarLog(); renderDatos(); conciliarMedias(); migrarPecho(); });
            store.sub('ventas', function (l) { var antes = ventasPendientes(true).length; S.ventas = l; if (antes !== ventasPendientes(true).length && (S.tab === 'pedidos' || S.tab === 'inicio')) renderDatos(); });
            store.sub('privado', function (l) {
              var fl = {}, antesF = JSON.stringify(S.fletes || {});
              l.forEach(function (x) { if (String(x.id).indexOf('fletes-') === 0) fl[x.id.slice(7)] = x; });
              S.fletes = fl; if (JSON.stringify(fl) !== antesF && S.tab === 'logistica') renderDatos();
              var cm = {}, antesCm = JSON.stringify(S.cam || {});
              l.forEach(function (x) { var k = String(x.id); if (k.indexOf('camara-') === 0) { var o = clone(x); o.id = k.slice(7); cm[o.id] = o; } });
              S.cam = cm; S.camListo = true; if (JSON.stringify(cm) !== antesCm && S.camaraOk && (S.tab === 'camara' || S.tab === 'inicio') && !escribiendo() && !S.camPegar) render();
              var cl = l.filter(function (x) { return x.id === 'clientes'; })[0], antesC = JSON.stringify(clientes());
              S.clientes = (cl && cl.lista) || [];
              if (JSON.stringify(S.clientes) !== antesC) { conciliarLog(); renderDatos(); }
              var pap = l.filter(function (x) { return x.id === 'papelera'; })[0], antesP = JSON.stringify(S.papelera || []); S.papelera = (pap && pap.items) || [];
              if (JSON.stringify(S.papelera) !== antesP && S.tab === 'pedidos' && !ocupado()) renderPedidos();
              var chf = l.filter(function (x) { return x.id === 'choferes'; })[0], antesCh = JSON.stringify(S.choferes || null); S.choferes = chf || null;
              if (JSON.stringify(S.choferes || null) !== antesCh && S.tab === 'logistica' && S.resumen && !ocupado()) render();
              var imp = l.filter(function (x) { return x.id === 'impresora'; })[0], antesI = impEstado(); S.impresora = imp || null;
              if (impEstado() !== antesI && !ocupado()) render();
              var job = l.filter(function (x) { return x.id === 'imprimir'; })[0]; if (job) recibirImpresion(clone(job));
              var c = l.filter(function (x) { return x.id === 'ia'; })[0]; if (c) { var antes = !!(S.ia && S.ia.clave); S.ia = c; if (!antes && !S.prop.length && !S.em && !S.ep && !S.pegar) render(); } });
          }
        }
        render();
      });
    });
  }

  /* ---------- versión nueva ----------
     Quien deja la app abierta no se queda con la versión vieja: se revisa cada tanto y se recarga sola
     cuando no hay nada a medio escribir. Si lo hay, aparece un aviso con el botón para actualizar. */
  var verCargada = null, verNueva = false;
  function leerVersion() {
    if (window.__mock) return Promise.resolve(window.__mock.version ? window.__mock.version() : null);
    return fetch('sw.js?v=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) { var m = t.match(/produccion-qualita-v(\d+)/); return m ? m[1] : null; }, function () { return null; });
  }
  function recargar() { if (window.__mock) { if (window.__mock.recargar) window.__mock.recargar(); return; } location.reload(); }
  function ocupado() { return !!(S.em || S.ep || S.ef || S.ec || S.pegar || S.pf || (S.prop && S.prop.length) || cargas.activas || S._ocup) || escribiendo(); }
  function aplicarVersion() {
    if (!verNueva) return;
    if (!ocupado()) { recargar(); return; }
    if ($('nueva')) return;
    var b = document.createElement('div'); b.id = 'nueva'; b.className = 'nueva'; b.setAttribute('role', 'status');
    b.innerHTML = '<span>Hay una versión nueva de la app.</span><button class="btn sm" data-act="actualizar">Actualizar</button>';
    document.body.appendChild(b);
  }
  function revisarVersion() {
    leerVersion().then(function (v) {
      if (!v) return;
      if (!verCargada) { verCargada = v; return; }
      if (v !== verCargada) { verNueva = true; aplicarVersion(); }
    });
  }
  function vigilarVersion() {
    revisarVersion();
    setInterval(revisarVersion, 5 * 60 * 1000);
    setInterval(aplicarVersion, 20 * 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) revisarVersion(); });
    setInterval(function () { if (S.tab === 'camara' && S.camaraOk && !document.hidden && !escribiendo()) camTraer(); }, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && S.tab === 'camara' && S.camaraOk) camTraer(); });
  }

  function boot() {
    var c = cache(true);
    if (c && c.produccion && !window.__mock) aplicar(c, 'cache');
    render();
    if (window.__mock) { conectar(mockStore(window.__mock)); return; }
    firebaseStore().then(conectar, function () {
      if (S.status !== 'ready') respaldo().then(function (d) { aplicar(d, 'respaldo'); render(); }, function () { S.status = 'error'; render(); });
    });
  }
  if ('serviceWorker' in navigator && !window.__mock) navigator.serviceWorker.register('sw.js').catch(function () {});
  boot();
  vigilarVersion();
})();
