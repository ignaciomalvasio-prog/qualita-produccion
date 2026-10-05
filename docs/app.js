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
  var TABS = ['inicio', 'produccion', 'medias', 'pedidos'];
  var CORTES_BASE = ['JAMON', 'PALETA', 'PECHO', 'CARRE', 'SOLOMILLO', 'MATAMBRE', 'BONDIOLA', 'RECORTE', 'GRASA BUENA', 'GRASA MALA', 'CUERO', 'TAPA DE PALETA', 'TAPA DE JAMON', 'TORTUGA', 'GARRON', 'TOCINO', 'CHURRASCO', 'PAPADA', 'OREJAS', 'CABEZA', 'PULMON', 'HIGADO', 'PATAS Y MANOS'];

  var S = {
    faena: null, prod: null, pedidos: null, config: {}, ia: {}, status: 'loading', fuente: '',
    tab: 'inicio', mv: 'dia', fm: null, sem: null, dia: null, fecha: null, entrega: null,
    user: null, editor: false,
    em: null,   // semana en edición: { lunes, doc }
    ep: null,   // orden en edición: { fecha, doc }
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
  function desposteDe(f) { var o = prodDe(f); return o && o.medias !== '' && o.medias != null ? +o.medias || 0 : +S.config.desposteHabitual || 750; }

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
  function fmInicial() { var h = hoy(); return esHabil(h) ? h : habilSiguiente(h); }
  function diaFaena(f) {
    var lunes = lunesDe(f), sem = semDe(lunes), i = Math.round((fecha(f) - fecha(lunes)) / 86400000);
    return sem && sem.dias[i] ? { sem: sem, i: i, d: sem.dias[i] } : null;
  }
  function renderMedias() {
    if (S.mv === 'semana' && S.editor) return renderSemana();
    S.mv = 'dia';
    var el = $('view-medias');
    if (cargando(el, S.faena)) return;
    if (!S.fm) S.fm = fmInicial();
    var f = S.fm, x = diaFaena(f), cl = x ? (x.d.clientes || []).filter(function (r) { return r.cliente || +r.cant; }) : [];
    var h = '<div class="nav"><button class="btn step" data-act="fm" data-d="-1" aria-label="Día anterior">‹</button><span class="tit">' + esc(tituloDe(f)) + '</span><button class="btn step" data-act="fm" data-d="1" aria-label="Día siguiente">›</button>'
      + '<input type="date" id="m-fecha" value="' + esc(f) + '" aria-label="Ir a una fecha">'
      + (cl.length ? '<button class="btn" data-act="imprimir">Imprimir</button>' : '')
      + (S.editor ? '<button class="btn" data-act="m-editar-dia">Editar</button><button class="btn" data-act="m-semana">Planilla de la semana</button>' : '') + '</div>';
    h += '<div class="panel"><h2>Medias para clientes</h2>';
    if (!cl.length) h += '<p class="state">No hay medias cargadas para clientes este día.</p>';
    else {
      var tot = cl.reduce(function (t, r) { return t + (+r.cant || 0) * 2; }, 0);
      h += '<table class="pl cl-dia"><thead><tr><th>Cliente</th><th>Medias</th></tr></thead><tbody>' + cl.map(function (r) {
        return '<tr><td>' + esc(r.cliente || 'Sin nombre') + (r.nota ? ' <span class="small muted" style="text-transform:none;font-weight:400">' + esc(r.nota) + '</span>' : '') + '</td><td>' + n((+r.cant || 0) * 2) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><th>Total</th><td>' + n(tot) + '</td></tr></tfoot></table>'
        + '<p class="small muted">Salen de la faena del ' + esc(tituloDe(f).toLowerCase()) + ' y se entregan el ' + esc(tituloDe(habilSiguiente(f)).toLowerCase()) + '.</p>';
    }
    el.innerHTML = h + '</div>';
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
    h += '<button class="btn" data-act="m-dia">Ver por día</button>';
    if (S.editor && sem) h += '<button class="btn' + (edit ? ' pri' : '') + '" data-act="m-editar">' + (edit ? 'Listo' : 'Editar') + '</button><span class="guardado" id="g-medias"></span>';
    h += '</div>';
    if (!sem) {
      h += '<div class="panel"><p class="state">No hay faena cargada para esta semana.</p>' + (S.editor ? '<div class="acciones" style="justify-content:center"><button class="btn pri" data-act="m-nueva">Cargar la faena de esta semana</button></div>' : '') + '</div>';
      el.innerHTML = h; return;
    }
    var st = stockSemana(lunes);
    if (edit) {
      h += '<div class="panel"><label class="campo" style="max-width:340px"><span>Medias propias en cámara al empezar el lunes</span><input type="number" inputmode="numeric" id="m-stock" value="' + esc(sem.stockInicial == null ? '' : sem.stockInicial) + '" placeholder="' + (st.deducido != null ? 'Se deduce: ' + n(st.deducido) : 'Sin dato') + '"></label>'
        + '<p class="small muted">Dejalo vacío para que se deduzca de la semana anterior. Cada cambio se guarda solo.</p>'
        + '<div class="acciones">' + botonBorrar('m-borrar-semana', null, 'Borrar toda la semana') + '</div></div>';
    }
    h += '<div class="dtabs" role="group" aria-label="Día">' + sem.dias.map(function (d, i) { var f = mas(lunes, i); return '<button class="btn" data-act="dia" data-i="' + i + '" aria-pressed="' + (S.dia === i) + '">' + diaDe(f).slice(0, 3) + ' ' + fecha(f).getDate() + '</button>'; }).join('') + '</div>';
    h += '<div class="dias" data-sel="' + S.dia + '">' + sem.dias.map(function (d, i) { return diaHTML(sem, i, st, edit); }).join('') + '</div>';
    el.innerHTML = h;
    pintarMsg('medias');
  }

  /* ---------- orden de producción ---------- */
  var DEST = [[/GRION/, 'GRION'], [/A?RGENCARNES/, 'ARGENCARNES'], [/CARREFOUR/, 'CARREFOUR'], [/ROVER/, 'ROVER'], [/CICLO (3|III)/, 'CICLO 3'], [/ABASTECIMIENTO/, 'ABASTECIMIENTO'], [/SERVICIOS DE ALIMENTOS/, 'SERVICIOS'], [/SERAFINI/, 'SERAFINI'], [/SWIFT/, 'SWIFT'], [/MAFER/, 'MAFER'], [/RENDERING/, 'RENDERING'], [/ALICAN/, 'ALICAN'], [/BOCANTINO/, 'BOCANTINO'], [/SCURTIS/, 'SCURTIS'], [/LLUGDAR/, 'LLUGDAR'], [/CONSUMO INTERNO/, 'INTERNO']];
  var PRODS = {
    JAMON: [[/5 MUSCULOS/, '5M'], [/RECORTE DE JAMON/, 'REC'], [/CON HUESO SIN CUERO CON TAPA/, 'CHSCT'], [/CON HUESO SIN CUERO/, 'CHSC']],
    PALETA: [[/S\/H Y C\/CUERO|SIN HUESO CON CUERO/, 'SHCC'], [/RECORTE DE PALETA/, 'REC'], [/CON HUESO SIN CUERO/, 'CHSC'], [/CON HUESO CON CUERO/, 'CHCC'], [/INDUSTRIAL/, 'IND']],
    RECORTE: [[/80\/20 BUENO/, '8020B'], [/80\/20/, '8020'], [/70\/30/, '7030'], [/60\/40/, '6040'], [/50\/50/, '5050']]
  };
  function esPedido(t) { return /^\s*\d/.test(t || ''); }
  function sinResto(t) { return String(t || '').replace(/^\s*RESTO\s*:?\s*/i, ''); }
  // Clave que identifica "a dónde va" una línea, sin importar cómo esté redactada.
  function claveLinea(corte, t) {
    var s = norm(sinResto(t));
    if (/NO SACAR/.test(s)) return 'NOSALE';
    var dest = '', i;
    for (i = 0; i < DEST.length; i++) if (DEST[i][0].test(s)) { dest = DEST[i][1]; break; }
    if (!dest) { var q = String(t).match(/[“"]([^”"]+)[”"]/); if (q) dest = norm(q[1]); }
    var est = /CONGEL/.test(s) ? 'C' : /FRESC/.test(s) ? 'F' : '', prod = '', R = PRODS[norm(corte)] || [];
    for (i = 0; i < R.length; i++) if (R[i][0].test(s)) { prod = R[i][1]; break; }
    return [prod, est, dest].join('|');
  }
  function corteDe(o, nombre) { var k = norm(nombre); return (o.cortes || []).filter(function (c) { return norm(c.corte) === k; })[0] || null; }
  function fijoDe(o, nombre) {
    var c = corteDe(o, nombre); if (!c) return null;
    var l = c.lineas.filter(function (x) { return !esPedido(x.t); }).slice(-1)[0];
    return l ? { t: sinResto(l.t), key: claveLinea(nombre, l.t) } : null;
  }
  function historial(antesDe) { return (S.prod || []).filter(function (o) { return o.id < antesDe && (o.cortes || []).length; }).sort(function (a, b) { return a.id.localeCompare(b.id); }); }

  function insertarLinea(o, corte, texto, pid) {
    var c = corteDe(o, corte);
    if (!c) { c = { corte: norm(corte) || 'SIN UBICAR', lineas: [], colgado: true }; o.cortes.push(c); }
    var linea = { t: texto }; if (pid) linea.p = pid;
    if (esPedido(texto)) {
      var pos = c.lineas.length;
      for (var i = 0; i < c.lineas.length; i++) if (!esPedido(c.lineas[i].t)) { pos = i; break; }
      c.lineas.splice(pos, 0, linea);
      c.lineas.forEach(function (x) { if (!esPedido(x.t) && !/^\s*RESTO/i.test(x.t) && !/NO SACAR/i.test(x.t)) x.t = 'RESTO: ' + x.t; });
    } else {
      // "Todo" para un cliente: reemplaza el destino del resto.
      var hayPed = c.lineas.some(function (x) { return esPedido(x.t); });
      c.lineas = c.lineas.filter(function (x) { return esPedido(x.t); });
      linea.t = (hayPed ? 'RESTO: ' : '') + sinResto(texto);
      c.lineas.push(linea); c.colgado = false;
    }
  }
  function armarOrden(f) {
    var hist = historial(f), prev = hist[hist.length - 1], dia = diaDe(f);
    var mismo = hist.filter(function (o) { return diaDe(o.id) === dia; }).slice(-1)[0];
    var o = { fecha: f, medias: mismo ? mismo.medias : prev ? prev.medias : (+S.config.desposteHabitual || 750), mercado: prev ? prev.mercado : 'CONSUMO', estado: 'borrador', cortes: [] };
    var nombres = prev ? prev.cortes.map(function (c) { return c.corte; }) : CORTES_BASE;
    var ult = hist.slice(-5);
    o.cortes = nombres.map(function (nombre) {
      var fs = ult.map(function (x) { return fijoDe(x, nombre); }), fijo = null;
      for (var i = fs.length - 1; i >= 0 && !fijo; i--) fijo = fs[i];
      var estable = fs.length > 0 && fs.every(function (x) { return x && x.key === fs[0].key; });
      return { corte: nombre, lineas: fijo ? [{ t: fijo.t }] : [], colgado: !estable };
    });
    (S.pedidos || []).filter(function (p) { return p.entrega === f; }).forEach(function (p) {
      (p.cortes || []).forEach(function (c) { if (c.orden && c.texto) insertarLinea(o, c.corte, c.texto, p.id); });
    });
    return o;
  }
  // Pedidos con cantidad que se repiten ese día de la semana y todavía no están en la orden.
  function habitualesDia(o) {
    var dia = diaDe(o.fecha), ords = historial(o.fecha).filter(function (x) { return diaDe(x.id) === dia; }), g = {}, out = [];
    if (!ords.length) return out;
    ords.forEach(function (x) { (x.cortes || []).forEach(function (c) { var visto = {}; c.lineas.forEach(function (l) {
      if (!esPedido(l.t)) return; var k = norm(c.corte) + '~' + claveLinea(c.corte, l.t); if (visto[k]) return; visto[k] = 1;
      g[k] = g[k] || { corte: c.corte, veces: 0 }; g[k].veces++; g[k].t = l.t;
    }); }); });
    Object.keys(g).forEach(function (k) {
      var x = g[k], c = corteDe(o, x.corte);
      var ya = c && c.lineas.some(function (l) { return esPedido(l.t) && norm(c.corte) + '~' + claveLinea(c.corte, l.t) === k; });
      if (!ya && x.veces / ords.length >= 0.5) out.push({ corte: x.corte, t: x.t, veces: x.veces, total: ords.length });
    });
    return out;
  }
  function textoOrden(o) {
    var out = [diaDe(o.fecha).toUpperCase() + ' ' + fechaCorta(o.fecha), (o.medias || '') + '½ ' + String(o.mercado || '').toUpperCase()];
    (o.cortes || []).forEach(function (c) { (c.lineas.length ? c.lineas : [{ t: '' }]).forEach(function (l, i) { out.push(((i === 0 ? c.corte + ': ' : '') + l.t).toUpperCase()); }); });
    return out.join('\n');
  }
  function fechaProdInicial() {
    var h = hoy(), ids = (S.prod || []).map(function (o) { return o.id; });
    if (ids.indexOf(h) >= 0) return h;
    var sig = habilSiguiente(h); if (ids.indexOf(sig) >= 0) return sig;
    var prev = ids.filter(function (x) { return x <= h; }).sort().slice(-1)[0];
    return prev || (esHabil(h) ? h : sig);
  }

  function renderProduccion() {
    var el = $('view-produccion');
    if (cargando(el, S.prod)) return;
    if (!S.fecha || !S.fechaFija) S.fecha = fechaProdInicial();
    var f = S.fecha, o = prodDe(f), edit = !!(S.ep && S.ep.fecha === f);
    var h = '<div class="nav"><button class="btn step" data-act="fecha" data-d="-1" aria-label="Día anterior">‹</button><span class="tit">' + esc(tituloDe(f)) + '</span><button class="btn step" data-act="fecha" data-d="1" aria-label="Día siguiente">›</button>'
      + '<input type="date" id="p-fecha" value="' + esc(f) + '" aria-label="Ir a una fecha">';
    if (o) h += '<button class="btn" data-act="imprimir">Imprimir</button>';
    if (S.editor && o) h += '<button class="btn' + (edit ? ' pri' : '') + '" data-act="p-editar">' + (edit ? 'Listo' : 'Editar') + '</button><span class="guardado" id="g-prod"></span>';
    h += '</div>';
    if (!o) {
      h += '<div class="panel"><p class="state">No hay orden de producción cargada para este día.</p>' + (S.editor ? '<div class="acciones" style="justify-content:center"><button class="btn pri" data-act="p-armar">Armar la orden</button></div>' : '') + '</div>';
      el.innerHTML = h; return;
    }
    var colg = (o.cortes || []).filter(function (c) { return c.colgado; }).length;
    if (edit) { h += prodEditHTML(o, colg); el.innerHTML = h; pintarMsg('prod'); return; }
    h += '<div class="panel">';
    if (o.estado === 'borrador') h += '<p><span class="badge warn">Borrador</span> <span class="muted">Todavía no está confirmada' + (colg ? ': ' + colg + (colg === 1 ? ' corte sin definir' : ' cortes sin definir') : '') + '.</span></p>';
    h += '<article class="op"><p class="op-f">' + esc(diaDe(f)) + ' ' + esc(fechaCorta(f)) + '</p><p class="op-m">' + esc(o.medias) + '½ ' + esc(o.mercado || '') + '</p>';
    (o.cortes || []).forEach(function (c) {
      var ls = c.lineas.length ? c.lineas : [{ t: '' }];
      h += '<div class="op-c' + (c.colgado && o.estado === 'borrador' ? ' colg' : '') + '">' + ls.map(function (l, i) { return '<p>' + (i === 0 ? '<u>' + esc(c.corte) + '</u>: ' : '') + esc(l.t) + '</p>'; }).join('') + '</div>';
    });
    h += '</article><div class="acciones"><button class="btn" data-act="copiar">Copiar como texto</button><span class="small muted" id="copiado" aria-live="polite"></span></div><textarea id="txt-orden" class="txt" readonly hidden aria-label="Orden en texto">' + esc(textoOrden(o)) + '</textarea></div>';
    el.innerHTML = h;
  }
  function prodEditHTML(o, colg) {
    var h = '<div class="panel"><div class="campos"><label class="campo"><span>Medias</span><input type="number" inputmode="numeric" class="n" id="p-medias" data-p="medias" value="' + esc(o.medias) + '"></label>'
      + '<label class="campo"><span>Mercado</span><input type="text" id="p-mercado" data-p="mercado" value="' + esc(o.mercado || '') + '"></label></div>';
    var st = stockParaFecha(o.fecha);
    if (st != null) h += '<p class="small ' + (st < +o.medias ? 'neg' : 'muted') + '">Hay ' + n(st) + ' medias con un día de frío para este día.</p>';
    h += '<div class="acciones">' + (o.estado === 'borrador'
      ? '<button class="btn pri" data-act="p-estado" data-v="lista">Confirmar orden</button>' + (colg ? '<span class="small"><span class="badge warn">' + colg + ' sin definir</span></span>' : '')
      : '<span class="badge ok">Confirmada</span><button class="btn sm" data-act="p-estado" data-v="borrador">Volver a borrador</button>') + '</div></div>';

    var sug = habitualesDia(o); S._sug = sug;
    if (sug.length) h += '<div class="panel"><h3>Suele ir los ' + esc(diaDe(o.fecha).toLowerCase()) + '</h3><div class="lista">' + sug.map(function (x, i) {
      return '<div class="item"><div class="cuerpo"><strong>' + esc(x.corte) + '</strong><span style="text-transform:uppercase">' + esc(x.t) + '</span><span class="small muted">' + x.veces + ' de ' + x.total + ' ' + esc(diaDe(o.fecha).toLowerCase()) + ' anteriores</span></div><button class="btn sm" data-act="p-sug" data-i="' + i + '">Agregar</button></div>';
    }).join('') + '</div></div>';

    h += '<div class="panel">';
    (o.cortes || []).forEach(function (c, ci) {
      h += '<div class="ed-corte' + (c.colgado ? ' colg' : '') + '"><div class="cab"><input type="text" id="pc' + ci + '" data-p="corte" data-c="' + ci + '" value="' + esc(c.corte) + '" aria-label="Corte">'
        + (c.colgado ? '<span class="badge warn">Sin definir</span><button class="btn sm" data-act="p-ok" data-c="' + ci + '">Está bien así</button>' : '')
        + '<button class="btn x" data-act="p-quitar-corte" data-c="' + ci + '" aria-label="Quitar corte">×</button></div>';
      c.lineas.forEach(function (l, li) {
        h += '<div class="ed-linea"><textarea rows="2" id="pl' + ci + '-' + li + '" data-p="linea" data-c="' + ci + '" data-l="' + li + '" aria-label="Línea de ' + esc(c.corte) + '">' + esc(l.t) + '</textarea><button class="btn x" data-act="p-quitar-linea" data-c="' + ci + '" data-l="' + li + '" aria-label="Quitar línea">×</button></div>';
      });
      h += '<div class="acciones"><button class="btn sm" data-act="p-linea" data-c="' + ci + '">+ Línea</button></div></div>';
    });
    h += '<div class="acciones"><button class="btn" data-act="p-corte">+ Corte</button><button class="btn lnk" data-act="p-rearmar">' + (S._rearmar ? 'Tocá de nuevo para rearmar: se pierden los cambios hechos a mano' : 'Volver a armar desde cero') + '</button>' + botonBorrar('p-borrar', null, 'Borrar la orden') + '</div></div>';
    return h;
  }
  function stockParaFecha(f) {
    var st = stockSemana(lunesDe(f)); if (!st) return null;
    var i = Math.round((fecha(f) - fecha(lunesDe(f))) / 86400000);
    return st.dias[i] ? st.dias[i].disponibleHoy : null;
  }

  /* ---------- borrar, con confirmación en dos toques ---------- */
  function confirma(k) { if (S._c2 === k) { S._c2 = null; return true; } S._c2 = k; return false; }
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
    x.cortes.forEach(function (c) { c.corte = String(c.corte || '').toUpperCase().trim(); c.colgado = !!c.colgado; c.lineas.forEach(function (l) { l.t = String(l.t || '').toUpperCase().replace(/\s+/g, ' ').trim(); }); });
    x.actualizado = ahoraTxt(); x.por = S.user ? S.user.email : '';
    return x;
  }
  var tTocar = null;
  function tocar() { clearTimeout(tTocar); tTocar = setTimeout(function () { var c = clone(S.config || {}); delete c.id; c.actualizado = ahoraTxt(); store.set('config', 'general', c).catch(function () {}); }, 1500); }

  /* ---------- pedidos ---------- */
  function pedidoVacio() { return { k: uid(), cliente: '', entrega: S.entrega || habilSiguiente(hoy()), medias: '', peso: '', cortes: [], nota: '', dudas: [], origen: 'manual' }; }
  function aplicarPedido(p) {
    var tareas = [], medias = +p.medias || 0;
    if (medias > 0 && p.entrega) {
      var fa = habilAnterior(p.entrega), lunes = lunesDe(fa), i = Math.round((fecha(fa) - fecha(lunes)) / 86400000);
      var sem = clone(semDe(lunes) || semanaNueva(lunes)), filas = sem.dias[i].clientes, nombre = norm(p.cliente);
      var fila = filas.filter(function (r) { return r.pedido === p.id; })[0] || filas.filter(function (r) { return !r.pedido && norm(r.cliente) === nombre; })[0];
      if (!fila) { fila = {}; filas.push(fila); }
      fila.cliente = String(p.cliente || '').toUpperCase().trim(); fila.cant = medias / 2; fila.pedido = p.id; fila.nota = p.peso || '';
      var semL = limpiarSemana(sem); S.faena = poner(S.faena, lunes, semL); tareas.push(store.set('faena', lunes, semL));
    }
    var paraOrden = (p.cortes || []).filter(function (c) { return c.orden && c.texto; });
    if (paraOrden.length && p.entrega) {
      var o = prodDe(p.entrega);
      if (!o) { var antes = S.pedidos; S.pedidos = (S.pedidos || []).filter(function (x) { return x.id !== p.id; }).concat([p]); o = armarOrden(p.entrega); S.pedidos = antes; }
      else { o = clone(o); quitarDeOrden(o, p.id); paraOrden.forEach(function (c) { insertarLinea(o, c.corte, c.texto, p.id); }); }
      var oL = limpiarOrden(o); S.prod = poner(S.prod, p.entrega, oL); tareas.push(store.set('produccion', p.entrega, oL));
    }
    return Promise.all(tareas);
  }
  function quitarDeOrden(o, pid) {
    o.cortes.forEach(function (c) {
      var antes = c.lineas.length;
      c.lineas = c.lineas.filter(function (l) { return l.p !== pid; });
      if (c.lineas.length !== antes) {
        if (!c.lineas.some(function (l) { return esPedido(l.t); })) c.lineas.forEach(function (l) { l.t = sinResto(l.t); });
        if (!c.lineas.some(function (l) { return !esPedido(l.t); })) c.colgado = true;
      }
    });
    o.cortes = o.cortes.filter(function (c) { return c.lineas.length || CORTES_BASE.indexOf(norm(c.corte)) >= 0 || norm(c.corte).indexOf('GRASA') === 0; });
  }
  function borrarPedido(p) {
    var tareas = [store.del('pedidos', p.id)];
    (S.faena || []).forEach(function (s) {
      if (!s.dias.some(function (d) { return d.clientes.some(function (r) { return r.pedido === p.id; }); })) return;
      var x = clone(s); x.dias.forEach(function (d) { d.clientes = d.clientes.filter(function (r) { return r.pedido !== p.id; }); });
      tareas.push(store.set('faena', s.id, limpiarSemana(x)));
    });
    (S.prod || []).forEach(function (o) {
      if (!o.cortes.some(function (c) { return c.lineas.some(function (l) { return l.p === p.id; }); })) return;
      var x = clone(o); quitarDeOrden(x, p.id); tareas.push(store.set('produccion', o.id, limpiarOrden(x)));
    });
    return Promise.all(tareas);
  }
  function guardarPropuesta(q) {
    var p = { cliente: String(q.cliente || '').toUpperCase().trim(), entrega: q.entrega || '', medias: +q.medias || 0, peso: q.peso || '', nota: q.nota || '', origen: q.origen || 'manual', creado: ahoraTxt(),
      cortes: (q.cortes || []).filter(function (c) { return c.texto; }).map(function (c) { return { corte: norm(c.corte), texto: String(c.texto).toUpperCase().replace(/\s+/g, ' ').trim(), orden: !!c.orden }; }) };
    if (!p.cliente) return Promise.reject(new Error('Falta el cliente.'));
    if (!p.entrega) return Promise.reject(new Error('Falta la fecha de entrega.'));
    if (!p.medias && !p.cortes.length) return Promise.reject(new Error('El pedido no tiene medias ni cortes.'));
    var id = 'p' + uid(), doc = clone(p); p.id = id;
    S.em = null; S.ep = null;
    S.pedidos = poner(S.pedidos, id, doc);
    return store.set('pedidos', id, doc).then(function () { return aplicarPedido(p); }).then(function () { tocar(); });
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
    (S.prod || []).slice(-3).forEach(function (o) { ejemplos.push(textoOrden(o)); });
    return 'Sos el asistente de carga de pedidos del Frigorífico Qualitá, un frigorífico de cerdo. Recibís una foto o una captura de pantalla con uno o varios pedidos de clientes y devolvés los pedidos leídos como datos estructurados, sin texto adicional.\n\n'
      + 'Hoy es ' + diaDe(hoy()) + ' ' + hoy() + '.\n\n'
      + 'TIPOS DE IMAGEN\n'
      + '1. Formulario manuscrito "ORDEN DE PEDIDO": el cliente está arriba y hay una "Fecha de entrega". En el renglón "18 CAPÓN" la cantidad seguida de "½" es la cantidad de MEDIAS RESES (ej.: "20 ½" = 20 medias). Los demás renglones son cortes. "Todo" al lado de un corte significa que el cliente se lleva todo lo que salga de ese corte. Puede haber renglones agregados a mano al pie, con código, y notas al margen. Una foto puede traer varios formularios: cada uno es un pedido.\n'
      + '2. Planillas de Excel de reparto por zona o por ciudad: cada fila es un cliente; la columna "Medias" es cantidad de medias reses y las demás columnas son cortes, casi siempre en cajas. La fecha del encabezado es la fecha de entrega. Si junto al cliente dice un rango de kilos (ej. "46 a 48 kg"), es el peso pedido para las medias.\n'
      + '3. Planillas por sucursal (ej. DINO): un solo cliente, con los kilos por corte sumados entre sucursales.\n\n'
      + 'QUÉ CARGAR, POR CADA PEDIDO\n'
      + '- cliente: en mayúsculas. Si coincide con uno de la lista de clientes conocidos, usá exactamente ese nombre.\n'
      + '- entrega: en formato AAAA-MM-DD. Resolvé fechas como "lun 05/10" con el año actual. Si no figura, dejala vacía.\n'
      + '- medias: cantidad de medias reses, número. 0 si no pide medias.\n'
      + '- peso: aclaración de peso de las medias (livianas, pesadas, rango de kg), o "".\n'
      + '- cortes: un elemento por cada corte pedido. "corte" es el rubro de la orden de producción, uno de: ' + CORTES_BASE.join(', ') + '. "texto" es la línea tal como se escribe en la orden de producción, en mayúsculas y con el estilo de los ejemplos: cantidad y unidad pegadas al principio (ej. "600KG", "50 UND", "10 CAJAS"), presentación, código si figura, y el cliente entre comillas al final. Si el cliente pide TODO el corte, la línea va sin cantidad (ej. "FRESCA EN BINES “ARGENCARNES”").\n'
      + '- orden: true si es un corte fresco que hay que producir ese día; false si es mercadería congelada que sale de stock, o productos que no salen del desposte (chorizo, morcilla, salchicha).\n'
      + '- nota: aclaraciones del pedido que no entran en otro campo. No copies precios.\n'
      + '- dudas: todo lo que no se lea bien o sea ambiguo, en una frase corta cada una. Si un número no se lee con seguridad, poné tu mejor lectura y avisá acá. No inventes datos.\n\n'
      + 'CLIENTES CONOCIDOS\n' + Object.keys(clientes).sort().join(', ') + '\n\n'
      + 'EJEMPLOS DE ÓRDENES DE PRODUCCIÓN RECIENTES (para el estilo de las líneas)\n' + ejemplos.join('\n\n');
  }
  function leerImagen(file) {
    if (window.__mock && window.__mock.ia) return Promise.resolve(window.__mock.ia(file.name));
    return achicar(file).then(function (b64) {
      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': S.ia.clave, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: S.ia.modelo || IA_MODELO, max_tokens: 16000, system: instrucciones(),
          output_config: { format: { type: 'json_schema', schema: ESQUEMA_PEDIDOS } },
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text: 'Leé los pedidos de esta imagen y cargalos.' }] }] })
      });
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(r.status === 401 ? 'La clave de IA no es válida.' : (j && j.error && j.error.message) || ('Error ' + r.status));
        if (j.stop_reason === 'max_tokens') throw new Error('La imagen tiene demasiados pedidos para leerla de una vez. Recortala en dos y subila de nuevo.');
        if (j.stop_reason === 'refusal') throw new Error('La IA no pudo leer esta imagen. Cargá el pedido a mano.');
        var texto = (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('').trim();
        var datos = null;
        try { datos = JSON.parse(texto); } catch (e) {
          var a = texto.indexOf('{'), z = texto.lastIndexOf('}');
          if (a >= 0 && z > a) { try { datos = JSON.parse(texto.slice(a, z + 1)); } catch (e2) { datos = null; } }
        }
        if (datos && Array.isArray(datos.pedidos)) return datos;
        throw new Error('No se pudieron leer pedidos en la imagen.');
      });
    });
  }
  var ESQUEMA_PEDIDOS = {
    type: 'object', additionalProperties: false, required: ['pedidos'],
    properties: { pedidos: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['cliente', 'entrega', 'medias', 'peso', 'cortes', 'nota', 'dudas'],
      properties: {
        cliente: { type: 'string' }, entrega: { type: 'string', description: 'AAAA-MM-DD, o vacío si no figura' },
        medias: { type: 'number', description: 'Cantidad de medias reses; 0 si no pide' }, peso: { type: 'string' },
        cortes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['corte', 'texto', 'orden'], properties: { corte: { type: 'string' }, texto: { type: 'string' }, orden: { type: 'boolean' } } } },
        nota: { type: 'string' }, dudas: { type: 'array', items: { type: 'string' } }
      } } } }
  };
  function subirFotos(files) {
    var lista = Array.prototype.slice.call(files), i = 0, errores = [];
    function sig() {
      if (i >= lista.length) { S.msg.fotos = errores.length ? '!' + errores.join(' ') : 'Listo. Revisá los pedidos leídos antes de guardarlos.'; renderPedidos(); return; }
      var f = lista[i++]; S.msg.fotos = 'Leyendo ' + i + ' de ' + lista.length + '…'; pintarMsg('fotos');
      leerImagen(f).then(function (j) {
        (j.pedidos || []).forEach(function (p) {
          S.prop.push({ k: uid(), cliente: p.cliente || '', entrega: /^\d{4}-\d{2}-\d{2}$/.test(p.entrega || '') ? p.entrega : (S.entrega || habilSiguiente(hoy())), medias: +p.medias || '', peso: p.peso || '', nota: p.nota || '', origen: 'foto', foto: f.name,
            dudas: (p.dudas || []).filter(Boolean), cortes: (p.cortes || []).map(function (c) { return { corte: norm(c.corte), texto: c.texto || '', orden: c.orden !== false }; }) });
        });
      }, function (e) { errores.push((f.name ? f.name + ': ' : '') + e.message); }).then(sig);
    }
    sig();
  }

  function propHTML(q, i) {
    var listaCortes = CORTES_BASE.slice(); (q.cortes || []).forEach(function (c) { if (c.corte && listaCortes.indexOf(c.corte) < 0) listaCortes.push(c.corte); });
    var h = '<div class="card' + (q.dudas && q.dudas.length ? ' duda' : '') + '">';
    if (q.dudas && q.dudas.length) h += '<div><span class="badge warn">Para revisar</span><ul class="small" style="margin:6px 0 0;padding-left:18px">' + q.dudas.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul></div>';
    h += '<div class="campos"><label class="campo"><span>Cliente</span><input type="text" id="q' + i + 'cliente" data-q="' + i + '" data-k="cliente" value="' + esc(q.cliente) + '" style="text-transform:uppercase"></label>'
      + '<label class="campo"><span>Entrega</span><input type="date" id="q' + i + 'entrega" data-q="' + i + '" data-k="entrega" value="' + esc(q.entrega || '') + '"></label>'
      + '<label class="campo"><span>Medias</span><input type="number" inputmode="numeric" id="q' + i + 'medias" data-q="' + i + '" data-k="medias" value="' + esc(q.medias) + '"></label>'
      + '<label class="campo"><span>Peso o aclaración</span><input type="text" id="q' + i + 'peso" data-q="' + i + '" data-k="peso" value="' + esc(q.peso || '') + '"></label></div>';
    if (+q.medias > 0 && q.entrega) h += '<p class="small muted">' + n(+q.medias / 2) + ' cerdos en la planilla del ' + esc(tituloDe(habilAnterior(q.entrega)).toLowerCase()) + ', que es la faena anterior a la entrega.</p>';
    (q.cortes || []).forEach(function (c, j) {
      h += '<div class="cl"><select id="q' + i + 'c' + j + 'corte" data-q="' + i + '" data-j="' + j + '" data-k="corte" aria-label="Corte">' + listaCortes.map(function (x) { return '<option' + (x === c.corte ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>'
        + '<textarea rows="2" id="q' + i + 'c' + j + 'texto" data-q="' + i + '" data-j="' + j + '" data-k="texto" aria-label="Línea para la orden" style="text-transform:uppercase">' + esc(c.texto) + '</textarea>'
        + '<label><input type="checkbox" id="q' + i + 'c' + j + 'orden" data-q="' + i + '" data-j="' + j + '" data-k="orden"' + (c.orden ? ' checked' : '') + '> A la orden</label>'
        + '<button class="btn x" data-act="q-quitar-corte" data-q="' + i + '" data-j="' + j + '" aria-label="Quitar corte">×</button></div>';
    });
    h += '<div class="acciones"><button class="btn sm" data-act="q-corte" data-q="' + i + '">+ Corte</button></div>'
      + '<label class="campo"><span>Nota</span><input type="text" id="q' + i + 'nota" data-q="' + i + '" data-k="nota" value="' + esc(q.nota || '') + '"></label>'
      + (q.error ? '<p class="small neg">' + esc(q.error) + '</p>' : '')
      + '<div class="acciones"><button class="btn pri" data-act="q-guardar" data-q="' + i + '">Guardar pedido</button><button class="btn" data-act="q-descartar" data-q="' + i + '">Descartar</button></div></div>';
    return h;
  }
  function renderPedidos() {
    var el = $('view-pedidos');
    if (!S.editor) { el.innerHTML = '<div class="panel"><p class="state">Para cargar pedidos hay que ingresar con una cuenta autorizada.</p></div>'; return; }
    if (!S.entrega) S.entrega = habilSiguiente(hoy());
    var conIA = !!(S.ia && S.ia.clave) || !!(window.__mock && window.__mock.ia);
    var h = '<div class="panel"><h2>Cargar pedidos</h2>';
    h += '<div class="acciones"><label class="btn pri" style="display:inline-flex;align-items:center' + (conIA ? '' : ';opacity:.45') + '">Subir fotos o capturas<input type="file" id="fotos" accept="image/*" multiple hidden' + (conIA ? '' : ' disabled') + '></label>'
      + '<button class="btn" data-act="q-nuevo">Cargar a mano</button><span class="guardado" id="g-fotos"></span></div>';
    if (!conIA) h += '<p class="small muted">Para leer fotos falta cargar la clave de IA, más abajo en Configuración. Mientras tanto se puede cargar a mano.</p>';
    if (S.prop.length) h += S.prop.map(propHTML).join('') + (S.prop.length > 1 ? '<div class="acciones"><button class="btn pri" data-act="q-todos">Guardar todos</button>' + botonBorrar('q-descartar-todos', null, 'Descartar todos', '') + '</div>' : '');
    h += '</div>';

    var lista = (S.pedidos || []).filter(function (p) { return p.entrega === S.entrega; });
    h += '<div class="panel"><div class="nav"><h2 style="flex:1 1 auto">Pedidos para entregar</h2><input type="date" id="e-fecha" value="' + esc(S.entrega) + '" aria-label="Fecha de entrega"></div>';
    if (!lista.length) h += '<p class="muted">No hay pedidos cargados para el ' + esc(tituloDe(S.entrega).toLowerCase()) + '.</p>';
    else {
      var tm = lista.reduce(function (t, p) { return t + (+p.medias || 0); }, 0);
      h += '<p class="small muted">' + lista.length + ' pedidos · ' + n(tm) + ' medias (' + n(tm / 2) + ' cerdos)</p><div class="lista">' + lista.map(function (p) {
        return '<div class="item"><div class="cuerpo"><strong>' + esc(p.cliente) + '</strong>'
          + (p.medias ? '<span>' + n(p.medias) + ' medias' + (p.peso ? ' · ' + esc(p.peso) : '') + '</span>' : '')
          + (p.cortes || []).map(function (c) { return '<span class="small">' + esc(c.corte) + ': ' + esc(c.texto) + (c.orden ? '' : ' <span class="muted">(no va a la orden)</span>') + '</span>'; }).join('')
          + (p.nota ? '<span class="small muted">' + esc(p.nota) + '</span>' : '') + '</div><button class="btn sm" data-act="ped-borrar" data-id="' + esc(p.id) + '">Quitar</button></div>';
      }).join('') + '</div>';
    }
    h += '<div class="acciones"><button class="btn sm" data-act="ir-medias">Ver la planilla de medias</button><button class="btn sm" data-act="ir-orden">Ver la orden de ese día</button>' + (lista.length ? botonBorrar('ped-borrar-todos', null, 'Quitar todos los de este día') : '') + '</div></div>';

    h += '<div class="panel"><details' + (S._conf ? ' open' : '') + '><summary>Configuración</summary><div class="campos">'
      + '<label class="campo"><span>Clave de IA (Anthropic)</span><input type="password" id="cfg-clave" autocomplete="off" placeholder="' + (S.ia && S.ia.clave ? 'Cargada. Escribí otra para cambiarla.' : 'sk-ant-…') + '"></label>'
      + '<label class="campo"><span>Desposte habitual (medias por día)</span><input type="number" inputmode="numeric" id="cfg-desposte" value="' + esc(S.config.desposteHabitual || 750) + '"></label>'
      + '<label class="campo"><span>Capacidad de cámaras (medias)</span><input type="number" inputmode="numeric" id="cfg-cap" value="' + esc(S.config.capacidadCamara || '') + '"></label></div>'
      + '<div class="acciones"><button class="btn" data-act="cfg-guardar">Guardar configuración</button><span class="guardado" id="g-cfg"></span></div>'
      + '<p class="small muted">La clave queda guardada en la base y solo la pueden leer las cuentas editoras. Las fotos se mandan a Anthropic para leerlas y no se guardan.</p></details></div>';
    el.innerHTML = h;
    pintarMsg('fotos'); pintarMsg('cfg');
  }

  /* ---------- inicio ---------- */
  function renderInicio() {
    var el = $('view-inicio');
    if (cargando(el, S.prod && S.faena)) return;
    var f = fechaProdInicial(), o = prodDe(f), h = hoy();
    var dp = o ? esc(o.medias) + ' medias · ' + (o.estado === 'borrador' ? 'borrador, todavía sin confirmar' : 'confirmada') : 'Todavía no hay orden cargada';
    var fm = fmInicial(), x = diaFaena(fm), cl = x ? (x.d.clientes || []).filter(function (r) { return r.cliente || +r.cant; }) : [];
    var dm = cl.length ? cl.length + (cl.length === 1 ? ' cliente · ' : ' clientes · ') + n(cl.reduce(function (t, r) { return t + (+r.cant || 0) * 2; }, 0)) + ' medias' : 'Todavía no hay medias cargadas';
    var html = '<div class="home">'
      + '<button class="tile" data-act="ir" data-tab="produccion"><b>Producción</b><span>Orden del ' + esc(tituloDe(f).toLowerCase()) + '</span><span class="dato">' + dp + '</span></button>'
      + '<button class="tile" data-act="ir" data-tab="medias"><b>Medias</b><span>Clientes del ' + esc(tituloDe(fm).toLowerCase()) + '</span><span class="dato">' + esc(dm) + '</span></button>';
    if (S.editor) {
      var sig = habilSiguiente(h), np = (S.pedidos || []).filter(function (p) { return p.entrega === sig; }).length;
      html += '<button class="tile" data-act="ir" data-tab="pedidos"><b>Pedidos</b><span>Subir fotos o cargar a mano</span><span class="dato">' + np + (np === 1 ? ' pedido cargado' : ' pedidos cargados') + ' para el ' + esc(tituloDe(sig).toLowerCase()) + '</span></button>';
    }
    el.innerHTML = html + '</div>';
  }
  // Volver al inicio deja todo parado en el día de hoy.
  function alInicio() { if (S.em) guardar('medias', true); if (S.ep) guardar('prod', true); S.em = null; S.ep = null; S.fechaFija = false; S.fecha = null; S.sem = null; S.dia = null; S.entrega = null; S.fm = null; S.mv = 'dia'; }

  /* ---------- estados, sesión y navegación ---------- */
  function cargando(el, data) {
    var msg = S.status === 'loading' && !data ? 'Cargando…' : S.status === 'error' && !data ? 'No se pudieron cargar los datos. Revisá la conexión y volvé a abrir la app.' : '';
    if (msg) { el.innerHTML = '<div class="panel"><p class="state">' + msg + '</p></div>'; return true; }
    return false;
  }
  function render() {
    $('stamp').textContent = (S.config.actualizado ? 'Actualizado: ' + S.config.actualizado : '') + (S.fuente === 'cache' ? ' · sin conexión' : '');
    var e = $('sesion');
    if (!store || !store.signIn) e.innerHTML = '';
    else if (!S.user) e.innerHTML = '<button class="btn sm lnk" data-act="ingresar">Ingresar para cargar</button>';
    else e.innerHTML = '<span>' + esc(S.user.email) + (S.editor ? '' : ' · sin permiso para cargar') + '</span><button class="btn sm lnk" data-act="salir">Salir</button>';
    $('tab-pedidos').hidden = !S.editor;
    if (S.tab === 'pedidos' && !S.editor) S.tab = 'inicio';
    TABS.forEach(function (t) { $('view-' + t).hidden = S.tab !== t; $('tab-' + t).setAttribute('aria-selected', String(S.tab === t)); });
    if (S.tab === 'medias') renderMedias(); else if (S.tab === 'pedidos') renderPedidos(); else if (S.tab === 'produccion') renderProduccion(); else renderInicio();
  }
  // Cuando llegan datos nuevos no se redibuja la pantalla en la que se está escribiendo.
  function renderDatos() {
    if (S.tab === 'medias' && S.em) return pintarSumas();
    if (S.tab === 'produccion' && S.ep) return;
    if (S.tab === 'pedidos' && S.prop.length) return;
    render();
  }
  function irA(tab) { S.tab = tab; try { history.replaceState(null, '', '#' + tab); } catch (err) {} render(); window.scrollTo(0, 0); }

  document.querySelector('.top').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (!b) return; e.preventDefault(); if (b.dataset.tab === 'inicio') alInicio(); irA(b.dataset.tab); });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var a = b.dataset.act, D = b.dataset, o, c;
    if (a !== 'p-rearmar') S._rearmar = false;
    if (S._c2 && S._c2 !== a + (D.i == null ? '' : D.i)) S._c2 = null;

    if (a === 'ir') irA(D.tab);
    else if (a === 'imprimir') {
      // Se imprime siempre la vista de lectura, no la de edición.
      if (S.em) { guardar('medias', true); S.em = null; }
      if (S.ep) { guardar('prod', true); S.ep = null; }
      render();
      var hoja = $('hoja-impresion');
      if (!hoja) { hoja = document.createElement('style'); hoja.id = 'hoja-impresion'; document.head.appendChild(hoja); }
      hoja.textContent = '@page{size:A4 ' + (S.tab === 'medias' && S.mv === 'semana' ? 'landscape' : 'portrait') + ';margin:10mm}';
      setTimeout(function () { window.print(); }, 80);
    }
    else if (a === 'ingresar') store.signIn().catch(function () {});
    else if (a === 'salir') store.signOut();
    else if (a === 'copiar') {
      var ta = $('txt-orden'), msg = $('copiado'); ta.hidden = false;
      var ok = function () { msg.textContent = 'Copiado.'; }, no = function () { ta.focus(); ta.select(); msg.textContent = 'Seleccionado: copialo con Ctrl+C o manteniendo apretado.'; };
      try { navigator.clipboard.writeText(ta.value).then(ok, no); } catch (err) { no(); }
    }

    // medias
    else if (a === 'fm') { var y = S.fm; do { y = mas(y, +D.d); } while (!esHabil(y)); S.fm = y; render(); }
    else if (a === 'm-semana' || a === 'm-editar-dia') {
      S.mv = 'semana'; S.sem = lunesDe(S.fm); S.dia = Math.round((fecha(S.fm) - fecha(S.sem)) / 86400000);
      if (a === 'm-editar-dia') { var ya = semDe(S.sem); S.em = { lunes: S.sem, doc: ya ? clone(ya) : semanaNueva(S.sem) }; S.msg.medias = ''; if (!ya) guardar('medias', true); }
      render();
    }
    else if (a === 'm-dia') { if (S.em) guardar('medias', true); S.em = null; S.mv = 'dia'; if (S.sem && S.dia != null) S.fm = mas(S.sem, S.dia); render(); }
    else if (a === 'sem') { if (S.em) guardar('medias', true); S.em = null; S.sem = mas(S.sem, +D.d); S.dia = null; render(); }
    else if (a === 'dia') { S.dia = +D.i; var g = document.querySelector('.dias'); if (g) g.dataset.sel = D.i; document.querySelectorAll('.dtabs .btn').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.i === D.i)); }); }
    else if (a === 'm-editar') { if (S.em) { guardar('medias', true); S.em = null; } else { S.em = { lunes: S.sem, doc: clone(semDe(S.sem)) }; S.msg.medias = ''; } render(); }
    else if (a === 'm-nueva') { S.em = { lunes: S.sem, doc: semanaNueva(S.sem) }; guardar('medias', true); render(); }
    else if (a === 'm-agregar') { S.em.doc.dias[+D.i][D.m].push(D.m === 'faena' ? { origen: '', propios: 0, usuarios: 0 } : { cliente: '', cant: 0 }); render(); var ult = S.em.doc.dias[+D.i][D.m].length - 1, foco = $((D.m === 'faena' ? 'f' : 'c') + D.i + '-' + ult + (D.m === 'faena' ? 'o' : 'c')); if (foco) foco.focus(); }
    else if (a === 'm-vaciar') { if (!confirma('m-vaciar' + D.i)) { render(); return; } var dv = S.em.doc.dias[+D.i]; dv.faena = [{ origen: '', propios: 0, usuarios: 0 }]; dv.clientes = []; guardar('medias'); render(); }
    else if (a === 'm-borrar-semana') { if (!confirma('m-borrar-semana')) { render(); return; } clearTimeout(timers.medias); var lb = S.em.lunes; S.em = null; S.faena = (S.faena || []).filter(function (x) { return x.id !== lb; }); store.del('faena', lb).then(tocar, function () {}); render(); }
    else if (a === 'm-quitar') { S.em.doc.dias[+D.i][D.m].splice(+D.r, 1); guardar('medias'); render(); }

    // producción
    else if (a === 'fecha') { S.fechaFija = true; if (S.ep) guardar('prod', true); S.ep = null; var x = S.fecha; do { x = mas(x, +D.d); } while (!esHabil(x)); S.fecha = x; render(); }
    else if (a === 'p-armar') { S.fechaFija = true; S.ep = { fecha: S.fecha, doc: armarOrden(S.fecha) }; guardar('prod', true); render(); }
    else if (a === 'p-editar') { S.fechaFija = true; if (S.ep) { guardar('prod', true); S.ep = null; } else { S.ep = { fecha: S.fecha, doc: clone(prodDe(S.fecha)) }; S.msg.prod = ''; } render(); }
    else if (a === 'p-borrar' && S.ep) { if (!confirma('p-borrar')) { render(); return; } clearTimeout(timers.prod); var fb = S.ep.fecha; S.ep = null; S.prod = (S.prod || []).filter(function (x) { return x.id !== fb; }); store.del('produccion', fb).then(tocar, function () {}); render(); }
    else if (S.ep && a.indexOf('p-') === 0) {
      o = S.ep.doc; c = D.c != null ? o.cortes[+D.c] : null;
      if (a === 'p-estado') { o.estado = D.v; if (D.v === 'lista') o.cortes.forEach(function (x) { x.colgado = false; }); }
      else if (a === 'p-ok') c.colgado = false;
      else if (a === 'p-linea') c.lineas.push({ t: '' });
      else if (a === 'p-quitar-linea') c.lineas.splice(+D.l, 1);
      else if (a === 'p-quitar-corte') o.cortes.splice(+D.c, 1);
      else if (a === 'p-corte') o.cortes.push({ corte: '', lineas: [{ t: '' }], colgado: false });
      else if (a === 'p-sug') { var s = S._sug[+D.i]; insertarLinea(o, s.corte, s.t); }
      else if (a === 'p-rearmar') { if (!S._rearmar) { S._rearmar = true; render(); return; } S._rearmar = false; var ant = S.ep; S.ep = null; var nueva = armarOrden(S.fecha); S.ep = { fecha: ant.fecha, doc: nueva }; }
      guardar('prod', a === 'p-estado'); render();
      if (a === 'p-linea') { var fl = $('pl' + D.c + '-' + (c.lineas.length - 1)); if (fl) fl.focus(); }
      if (a === 'p-corte') { var fc = $('pc' + (o.cortes.length - 1)); if (fc) fc.focus(); }
    }

    // pedidos
    else if (a === 'q-nuevo') { S.prop.push(pedidoVacio()); renderPedidos(); var fq = $('q' + (S.prop.length - 1) + 'cliente'); if (fq) fq.focus(); }
    else if (a === 'q-corte') { S.prop[+D.q].cortes.push({ corte: CORTES_BASE[0], texto: '', orden: true }); renderPedidos(); }
    else if (a === 'q-quitar-corte') { S.prop[+D.q].cortes.splice(+D.j, 1); renderPedidos(); }
    else if (a === 'q-descartar-todos') { if (!confirma('q-descartar-todos')) { renderPedidos(); return; } S.prop = []; S.msg.fotos = ''; renderPedidos(); }
    else if (a === 'ped-borrar-todos') {
      if (!confirma('ped-borrar-todos')) { renderPedidos(); return; }
      (S.pedidos || []).filter(function (x) { return x.entrega === S.entrega; }).reduce(function (cad, x) {
        return cad.then(function () { return borrarPedido(x); }).then(function () { return new Promise(function (r) { setTimeout(r, 40); }); });
      }, Promise.resolve()).then(tocar);
    }
    else if (a === 'q-descartar') { S.prop.splice(+D.q, 1); renderPedidos(); }
    else if (a === 'q-guardar' || a === 'q-todos') {
      var cuales = a === 'q-todos' ? S.prop.slice() : [S.prop[+D.q]];
      S.msg.fotos = 'Guardando…'; pintarMsg('fotos');
      cuales.reduce(function (cad, q) {
        return cad.then(function () { return guardarPropuesta(q).then(function () { S.entrega = q.entrega; S.prop = S.prop.filter(function (x) { return x !== q; }); }, function (err) { q.error = err.message || 'No se pudo guardar.'; }); })
          .then(function () { return new Promise(function (r) { setTimeout(r, 30); }); });
      }, Promise.resolve()).then(function () { S.msg.fotos = S.prop.length ? '!Quedaron pedidos sin guardar: revisalos.' : 'Guardado.'; renderPedidos(); });
    }
    else if (a === 'ped-borrar') { var p = (S.pedidos || []).filter(function (x) { return x.id === D.id; })[0]; if (p) borrarPedido(p).then(tocar); }
    else if (a === 'ir-medias') { S.em = null; S.mv = 'dia'; S.fm = habilAnterior(S.entrega); irA('medias'); }
    else if (a === 'ir-orden') { S.ep = null; S.fechaFija = true; S.fecha = S.entrega; irA('produccion'); }
    else if (a === 'cfg-guardar') {
      S._conf = true;
      var clave = $('cfg-clave').value.trim(), cfg = clone(S.config || {}), tareas = []; delete cfg.id;
      cfg.desposteHabitual = +$('cfg-desposte').value || 750; cfg.capacidadCamara = +$('cfg-cap').value || 0; cfg.actualizado = ahoraTxt();
      tareas.push(store.set('config', 'general', cfg));
      if (clave) tareas.push(store.set('privado', 'ia', { clave: clave, modelo: (S.ia && S.ia.modelo) || IA_MODELO }));
      S.msg.cfg = 'Guardando…'; pintarMsg('cfg');
      Promise.all(tareas).then(function () { S.msg.cfg = 'Guardado.'; if (clave) S.ia = { clave: clave, modelo: (S.ia && S.ia.modelo) || IA_MODELO }; renderPedidos(); }, function () { S.msg.cfg = '!No se pudo guardar.'; pintarMsg('cfg'); });
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target, D = t.dataset;
    if (D.m && S.em) { S.em.doc.dias[+D.i][D.m][+D.r][D.k] = t.value; guardar('medias'); pintarSumas(); }
    else if (t.id === 'm-stock' && S.em) { S.em.doc.stockInicial = t.value === '' ? null : t.value; guardar('medias'); pintarSumas(); }
    else if (D.p && S.ep) {
      var o = S.ep.doc;
      if (D.p === 'medias' || D.p === 'mercado') o[D.p] = t.value;
      else if (D.p === 'corte') o.cortes[+D.c].corte = t.value;
      else if (D.p === 'linea') o.cortes[+D.c].lineas[+D.l].t = t.value;
      guardar('prod');
    }
    else if (D.q != null && S.prop[+D.q]) {
      var q = S.prop[+D.q];
      if (D.j != null) q.cortes[+D.j][D.k] = D.k === 'orden' ? t.checked : t.value; else q[D.k] = t.value;
      q.error = '';
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'p-fecha' && t.value) { if (S.ep) guardar('prod', true); S.ep = null; S.fechaFija = true; S.fecha = t.value; render(); }
    else if (t.id === 'm-fecha' && t.value) { S.fm = t.value; render(); }
    else if (t.id === 'e-fecha' && t.value) { S.entrega = t.value; renderPedidos(); }
    else if (t.id === 'fotos' && t.files && t.files.length) { subirFotos(t.files); }
  });

  var h0 = (location.hash || '').slice(1); if (TABS.indexOf(h0) >= 0) S.tab = h0;

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
      set: function (c, id, data) { if (m.fallar) return Promise.reject(new Error('x')); m.data[c] = m.data[c] || {}; m.data[c][id] = clone(data); setTimeout(function () { emit(c); }, 0); return Promise.resolve(); },
      del: function (c, id) { if (m.data[c]) delete m.data[c][id]; setTimeout(function () { emit(c); }, 0); return Promise.resolve(); },
      onAuth: function (cb) { authCb = cb; setTimeout(function () { cb(m.user || null); }, 0); },
      signIn: function () { m.user = { email: m.loginAs }; authCb(m.user); return Promise.resolve(); },
      signOut: function () { m.user = null; authCb(null); return Promise.resolve(); },
      esEditor: function (email) { return Promise.resolve((m.editores || []).indexOf(email) >= 0); }
    };
  }
  function firebaseStore() {
    var base = 'https://www.gstatic.com/firebasejs/' + FIREBASE.version + '/';
    return Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js'), import(base + 'firebase-auth.js')]).then(function (m) {
      var app = m[0].initializeApp(FIREBASE.config), fs = m[1], au = m[2], db = fs.getFirestore(app), auth = au.getAuth(app);
      return {
        sub: function (c, cb, err) { return fs.onSnapshot(fs.collection(db, c), function (snap) { cb(snap.docs.map(function (x) { var o = x.data(); o.id = x.id; return o; })); }, err || function () {}); },
        set: function (c, id, data) { return fs.setDoc(fs.doc(db, c, id), clone(data)); },
        del: function (c, id) { return fs.deleteDoc(fs.doc(db, c, id)); },
        onAuth: function (cb) { return au.onAuthStateChanged(auth, cb); },
        signIn: function () { return au.signInWithPopup(auth, new au.GoogleAuthProvider()); },
        signOut: function () { return au.signOut(auth); },
        esEditor: function (email) { return fs.getDoc(fs.doc(db, 'editores', email)).then(function (s) { return s.exists(); }, function () { return false; }); }
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
    store.sub('faena', function (l) { if (S.fuente === 'respaldo' && !l.length) return; S.faena = ordenar(l.map(function (x) { x.desde = x.desde || x.id; return x; })); llego('faena'); }, fallo);
    store.sub('produccion', function (l) { if (S.fuente === 'respaldo' && !l.length) return; S.prod = ordenar(l.map(function (x) { x.fecha = x.fecha || x.id; return x; })); llego('prod'); }, fallo);
    store.sub('config', function (l) { var c = l.filter(function (x) { return x.id === 'general'; })[0]; if (c) { S.config = c; renderDatos(); } });
    store.onAuth(function (u) {
      S.user = u ? { email: u.email } : null; S.editor = false;
      if (!u) { S.em = null; S.ep = null; S.prop = []; render(); return; }
      store.esEditor(u.email).then(function (ok) {
        S.editor = ok;
        if (ok) {
          if (S.fuente === 'respaldo' || vacia) traer();
          if (!suscripto) {
            suscripto = true;
            store.sub('pedidos', function (l) { S.pedidos = ordenar(l); renderDatos(); });
            store.sub('privado', function (l) { var c = l.filter(function (x) { return x.id === 'ia'; })[0]; if (c) { S.ia = c; if (S.tab === 'pedidos' && !S.prop.length) render(); } });
          }
        }
        render();
      });
    });
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
})();
