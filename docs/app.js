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
    tab: 'inicio', mv: null, fm: null, sem: null, dia: null, fecha: null, entrega: null,
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
  function mvAct() { return S.editor ? (S.mv || 'semana') : 'dia'; }
  function conMedias(d) { return ((d && d.clientes) || []).filter(function (r) { return +r.cant > 0; }); }
  function fmInicial() { var h = hoy(); return esHabil(h) ? h : habilSiguiente(h); }
  function diaFaena(f) {
    var lunes = lunesDe(f), sem = semDe(lunes), i = Math.round((fecha(f) - fecha(lunes)) / 86400000);
    return sem && sem.dias[i] ? { sem: sem, i: i, d: sem.dias[i] } : null;
  }
  function renderMedias() {
    if (mvAct() === 'semana') return renderSemana();
    var el = $('view-medias');
    if (cargando(el, S.faena)) return;
    if (!S.fm) S.fm = fmInicial();
    var f = S.fm, x = diaFaena(f), cl = x ? conMedias(x.d) : [];
    var h = '<div class="nav"><button class="btn step" data-act="fm" data-d="-1" aria-label="Día anterior">‹</button><span class="tit">' + esc(tituloDe(f)) + '</span><button class="btn step" data-act="fm" data-d="1" aria-label="Día siguiente">›</button>'
      + '<input type="date" id="m-fecha" value="' + esc(f) + '" aria-label="Ir a una fecha">'
      + (cl.length ? '<button class="btn" data-act="imprimir">Imprimir</button>' : '')
      + (S.editor ? '<button class="btn" data-act="m-semana">Volver a la planilla de la semana</button>' : '') + '</div>';
    h += '<div class="panel"><h2>Medias para clientes</h2>';
    if (!cl.length) {
      var con = []; (S.faena || []).forEach(function (sm) { sm.dias.forEach(function (d, k) { if (conMedias(d).length) con.push(mas(sm.id, k)); }); });
      con.sort();
      var ant = con.filter(function (z) { return z < f; }).slice(-1)[0], pos = con.filter(function (z) { return z > f; })[0];
      h += '<p class="state">No hay medias cargadas para clientes este día.</p>';
      if (ant || pos) h += '<div class="acciones" style="justify-content:center">' + [ant, pos].filter(Boolean).map(function (z) { return '<button class="btn" data-act="fm-ir" data-f="' + z + '">Ver el ' + esc(tituloDe(z).toLowerCase()) + '</button>'; }).join('') + '</div>';
    }
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
    h += '<button class="btn" data-act="m-dia">Ver como la ven los demás</button>';
    if (S.editor && sem) h += '<button class="btn' + (edit ? ' pri' : '') + '" data-act="m-editar">' + (edit ? 'Listo' : 'Editar') + '</button><span class="guardado" id="g-medias"></span>';
    h += '</div>';
    if (!sem) {
      h += '<div class="panel"><p class="state">No hay faena cargada para esta semana.</p>' + (S.editor ? cargaHTML('m-nueva', 'Subí la foto de la planilla semanal y se carga entera, con la faena y los clientes de cada día. También sirven pedidos sueltos de medias. "Cargar a mano" abre la semana con la faena de la semana anterior, para corregirla.') : '') + '</div>';
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
  function fechaProdInicial() { var h = hoy(); return esHabil(h) ? h : habilSiguiente(h); }

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
      h += '<div class="panel"><p class="state">No hay orden de producción cargada para este día.</p>' + (S.editor ? cargaHTML('p-armar', 'Subí o pegá los pedidos de este día y la orden se arma sola. También podés pegar la orden entera copiada de Word. "Cargar a mano" arma la orden con lo habitual y la abre para escribir.') : '') + '</div>';
      el.innerHTML = h; pintarMsg('fotos'); return;
      el.innerHTML = h; return;
    }
    if (S.editor && S.msg.fotos) h += '<p class="guardado" id="g-fotos"></p>';
    var colg = (o.cortes || []).filter(function (c) { return c.colgado; }).length;
    if (edit) { var od = S.ep.doc, cg = (od.cortes || []).filter(function (c) { return c.colgado; }).length; h += prodEditHTML(od, cg); el.innerHTML = h; pintarMsg('prod'); pintarMsg('fotos'); crecer($('p-doc')); return; }
    h += '<div class="panel">';
    if (o.estado === 'borrador') h += '<p><span class="badge warn">Borrador</span> <span class="muted">Todavía no está confirmada' + (colg ? ': ' + colg + (colg === 1 ? ' corte sin definir' : ' cortes sin definir') : '') + '.</span></p>';
    h += '<article class="op"><p class="op-f">' + esc(diaDe(f)) + ' ' + esc(fechaCorta(f)) + '</p><p class="op-m">' + esc(o.medias) + '½ ' + esc(o.mercado || '') + '</p>';
    (o.cortes || []).forEach(function (c) {
      var ls = c.lineas.length ? c.lineas : [{ t: '' }];
      h += '<div class="op-c' + (c.colgado && o.estado === 'borrador' ? ' colg' : '') + '">' + ls.map(function (l, i) { return '<p>' + (i === 0 ? '<u>' + esc(c.corte) + '</u>: ' : '') + esc(l.t) + '</p>'; }).join('') + '</div>';
    });
    h += '</article><div class="acciones"><button class="btn" data-act="copiar">Copiar como texto</button><span class="small muted" id="copiado" aria-live="polite"></span></div><textarea id="txt-orden" class="txt" readonly hidden aria-label="Orden en texto">' + esc(textoOrden(o)) + '</textarea></div>';
    el.innerHTML = h; pintarMsg('fotos');
  }
  function docDeOrden(o) {
    var out = [(o.medias || '') + '½ ' + String(o.mercado || '').toUpperCase(), ''];
    (o.cortes || []).forEach(function (c) {
      out.push(String(c.corte || '').toUpperCase() + ':' + (c.lineas.length ? ' ' + String(c.lineas[0].t || '').toUpperCase() : ''));
      c.lineas.slice(1).forEach(function (l) { out.push(String(l.t || '').toUpperCase()); });
      out.push('');
    });
    return out.join('\n').replace(/\n+$/, '');
  }
  var NO_TITULO = ['RESTO', 'TODO', 'IMPORTANTE', 'NOTA', 'OBS', 'OBSERVACION', 'OBSERVACIONES', 'ATENCION', 'OJO', 'URGENTE', 'CLIENTE', 'COD', 'CODIGO', 'DESTINO', 'ENTREGA', 'ACLARACION'];
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
      var t = l.match(/^([^:]{1,32}):\s*(.*)$/), pre = t ? norm(t[1]) : '';
      var esTit = t && (conocidos[pre] || (NO_TITULO.indexOf(pre) < 0 && !/\d/.test(pre) && pre.split(' ').length <= 4));
      if (!esTit && !t && conocidos[norm(l)]) { esTit = true; t = [l, l, '']; }
      if (esTit) { cur = { corte: t[1].trim().toUpperCase(), lineas: [], colgado: false }; cortes.push(cur); if (t[2]) cur.lineas.push({ t: t[2] }); return; }
      if (!cur) { cur = { corte: '', lineas: [], colgado: true }; cortes.push(cur); }
      cur.lineas.push({ t: l });
    });
    var usados = {};
    cortes.forEach(function (c) {
      var k = norm(c.corte), prev = (base.cortes || []).filter(function (x, i) { return norm(x.corte) === k && !usados[i]; })[0];
      if (!prev) { if (!c.lineas.length && c.corte) c.colgado = true; return; }
      usados[base.cortes.indexOf(prev)] = 1;
      var igual = prev.lineas.length === c.lineas.length && prev.lineas.every(function (l, i) { return norm(l.t) === norm(c.lineas[i].t); });
      if (prev.lineas.length === c.lineas.length) c.lineas.forEach(function (l, i) { if (prev.lineas[i].p) l.p = prev.lineas[i].p; });
      else c.lineas.forEach(function (l) { var mm = prev.lineas.filter(function (x) { return x.p && norm(x.t) === norm(l.t); })[0]; if (mm) l.p = mm.p; });
      c.colgado = igual ? !!prev.colgado : false;
    });
    o.cortes = cortes;
    return o;
  }
  function crecer(e) { if (!e) return; e.style.height = 'auto'; e.style.height = (e.scrollHeight + 4) + 'px'; }
  function prodEditHTML(o, colg) {
    var h = '<div class="panel">';
    var st = stockParaFecha(o.fecha);
    if (st != null) h += '<p class="small ' + (st < +o.medias ? 'neg' : 'muted') + '">Hay ' + n(st) + ' medias con un día de frío para este día.</p>';
    h += '<div class="acciones">' + (o.estado === 'borrador'
      ? '<button class="btn pri" data-act="p-estado" data-v="lista">Confirmar orden</button>'
      : '<span class="badge ok">Confirmada</span><button class="btn sm" data-act="p-estado" data-v="borrador">Volver a borrador</button>') + '</div>';
    if (colg) h += '<div class="colgados"><span class="badge warn">' + colg + ' sin definir</span>' + (o.cortes || []).map(function (c, ci) { return c.colgado ? '<span class="chip">' + esc(c.corte || 'Sin nombre') + ' <button class="btn sm" data-act="p-ok" data-c="' + ci + '">Está bien así</button></span>' : ''; }).join('') + '</div>';
    h += '</div>';

    h += '<div class="panel"><p class="small muted">Escribí directo sobre la orden, como en Word. Cada corte empieza con su nombre y dos puntos (JAMON: …); cada renglón de abajo es una línea de ese corte. Se guarda solo.</p>'
      + '<article class="op"><p class="op-f">' + esc(diaDe(o.fecha)) + ' ' + esc(fechaCorta(o.fecha)) + '</p>'
      + '<textarea id="p-doc" class="op-doc" spellcheck="false" autocapitalize="characters" aria-label="Orden de producción">' + esc(docDeOrden(o)) + '</textarea></article>'
      + '<div class="acciones"><button class="btn lnk" data-act="p-rearmar">' + (S._rearmar ? 'Tocá de nuevo para rearmar: se pierden los cambios hechos a mano' : 'Volver a armar desde cero') + '</button>' + botonBorrar('p-borrar', null, 'Borrar la orden') + '</div></div>';

    var sug = habitualesDia(o); S._sug = sug;
    if (sug.length) h += '<div class="panel"><h3>Suele ir los ' + esc(diaDe(o.fecha).toLowerCase()) + '</h3><div class="lista">' + sug.map(function (x, i) {
      return '<div class="item"><div class="cuerpo"><strong>' + esc(x.corte) + '</strong><span style="text-transform:uppercase">' + esc(x.t) + '</span><span class="small muted">' + x.veces + ' de ' + x.total + ' ' + esc(diaDe(o.fecha).toLowerCase()) + ' anteriores</span></div><button class="btn sm" data-act="p-sug" data-i="' + i + '">Agregar</button></div>';
    }).join('') + '</div></div>';
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
    if ((medias > 0 || !(p.cortes || []).some(function (c) { return c.texto; })) && p.entrega) {
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
  function borrarPedido(p) { return borrarPedidos([p]); }
  function borrarPedidos(lista) {
    var ids = {}, tareas = [];
    lista.forEach(function (p) { ids[p.id] = 1; });
    (S.faena || []).slice().forEach(function (s) {
      if (!s.dias.some(function (d) { return d.clientes.some(function (r) { return r.pedido && ids[r.pedido]; }); })) return;
      var x = clone(s); x.dias.forEach(function (d) { d.clientes = d.clientes.filter(function (r) { return !(r.pedido && ids[r.pedido]); }); });
      var xl = limpiarSemana(x); S.faena = poner(S.faena, s.id, xl); tareas.push(store.set('faena', s.id, xl));
    });
    (S.prod || []).slice().forEach(function (o) {
      var usados = {}; o.cortes.forEach(function (c) { c.lineas.forEach(function (l) { if (l.p && ids[l.p]) usados[l.p] = 1; }); });
      if (!Object.keys(usados).length) return;
      var x = clone(o); Object.keys(usados).forEach(function (id) { quitarDeOrden(x, id); });
      var ol = limpiarOrden(x); S.prod = poner(S.prod, o.id, ol); tareas.push(store.set('produccion', o.id, ol));
    });
    lista.forEach(function (p) { tareas.push(store.del('pedidos', p.id)); });
    S.pedidos = (S.pedidos || []).filter(function (x) { return !ids[x.id]; });
    return Promise.all(tareas);
  }
  function aplicarPlanilla(dias) {
    var DN = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'], votos = {}, lunes = null, max = 0;
    dias.forEach(function (d) { if (/^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '') && esHabil(d.fecha)) { var l = lunesDe(d.fecha); votos[l] = (votos[l] || 0) + 1; if (votos[l] > max) { max = votos[l]; lunes = l; } } });
    if (!lunes) lunes = S.sem || lunesDe(esHabil(hoy()) ? hoy() : habilSiguiente(hoy()));
    var sem = clone(semDe(lunes) || semanaNueva(lunes)), nd = 0, nc = 0;
    dias.forEach(function (d) {
      var i = DN.indexOf(norm(d.dia));
      if (i < 0 && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '')) i = Math.round((fecha(d.fecha) - fecha(lunes)) / 86400000);
      if (i < 0 || i > 4) return;
      var dia = sem.dias[i];
      var fa = (d.faena || []).filter(function (r) { return r.origen || +r.propios || +r.usuarios; }).map(function (r) { return { origen: String(r.origen || '').toUpperCase().trim(), propios: +r.propios || 0, usuarios: +r.usuarios || 0 }; });
      var cl = (d.clientes || []).filter(function (r) { return r.cliente || +r.cerdos; }).map(function (r) { return { cliente: String(r.cliente || '').toUpperCase().replace(/\s+/g, ' ').trim(), cant: +r.cerdos || 0 }; });
      if (!fa.length && !cl.length) return;
      if (fa.length) dia.faena = fa;
      (dia.clientes || []).filter(function (v) { return v.pedido; }).forEach(function (v) {
        var m = cl.filter(function (x) { return !x.pedido && x.cliente && norm(x.cliente) === norm(v.cliente); })[0];
        if (m) { m.pedido = v.pedido; if (v.nota) m.nota = v.nota; } else cl.push(v);
      });
      dia.clientes = cl; nd++; nc += cl.length;
    });
    if (!nd) return Promise.resolve(null);
    var sl = limpiarSemana(sem); S.em = null; S.faena = poner(S.faena, lunes, sl);
    return store.set('faena', lunes, sl).then(function () { tocar(); return { lunes: lunes, dias: nd, clientes: nc }; });
  }
  function guardarPropuesta(q, auto) {
    var p = { cliente: String(q.cliente || '').toUpperCase().trim(), entrega: q.entrega || '', medias: +q.medias || 0, peso: q.peso || '', nota: q.nota || '', origen: q.origen || 'manual', creado: ahoraTxt(), dudas: auto ? (q.dudas || []).filter(Boolean) : [],
      cortes: (q.cortes || []).filter(function (c) { return c.texto; }).map(function (c) { return { corte: norm(c.corte), texto: String(c.texto).toUpperCase().replace(/\s+/g, ' ').trim(), orden: !!c.orden }; }) };
    if (!p.cliente) return Promise.reject(new Error('Falta el cliente.'));
    if (!p.entrega) return Promise.reject(new Error('Falta la fecha de entrega.'));
    var previo = q.editaId ? (S.pedidos || []).filter(function (x) { return x.id === q.editaId; })[0] : null;
    S.em = null; S.ep = null;
    return (previo ? borrarPedido(previo) : Promise.resolve()).then(function () {
      var id = 'p' + uid(), doc = clone(p); p.id = id;
      S.pedidos = poner(S.pedidos, id, doc);
      return store.set('pedidos', id, doc).then(function () { return aplicarPedido(p); });
    }).then(function () { tocar(); });
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
      + '2. Planillas de Excel de reparto por zona o por ciudad: cada fila es un cliente; la columna "Medias" es cantidad de medias reses y las demás columnas son cortes, casi siempre en cajas. La fecha del encabezado es la fecha de entrega. Si junto al cliente dice un rango de kilos (ej. "46 a 48 kg"), es el peso pedido para las medias.\n'
      + '3. Planillas por sucursal (ej. DINO): un solo cliente, con los kilos por corte sumados entre sucursales.\n'
      + '4. Lista escrita a mano en una hoja suelta: cada renglón es un cliente seguido de una cantidad con "½" (ej.: "Molina 100 ½" = 100 medias reses para MOLINA). Un título subrayado arriba (ej. "San Juan") es la zona o el destino, no un cliente: ponelo en la nota de cada pedido. Los importes con "$" son precios: no los copies. Una aclaración entre paréntesis como "(grandes)" va en peso. Un número rodeado con un círculo al pie es el total de medias de la hoja: no es un pedido; si la suma de los renglones no coincide con ese total, avisalo en dudas del primer pedido. Marcas como "ok" o rayas no son pedidos.\n'
      + '5. Texto pegado de WhatsApp u otro mensaje: suele empezar con una frase general (ej. "pedido de cerdo para el martes por caja") que da la fecha de entrega y la unidad para todo el mensaje, y sigue con bloques separados por una línea en blanco: la primera línea de cada bloque es el cliente o la sucursal y las siguientes son "cantidad corte". Cada bloque es un pedido. Aplicá la unidad general a cada renglón ("por caja": "2 matambre" = 2 CAJAS). Si no se dice la unidad, escribí la cantidad sola y avisalo en dudas. "Pierna" es el rubro JAMON; conservá abreviaturas como "S/C" tal como vienen. Ignorá saludos y texto que no sea pedido. Si al pedirte la lectura te indican que todo el mensaje es de UN solo cliente y que los bloques son sus sucursales, devolvé un único pedido con ese cliente: un renglón por corte, con la cantidad total sumada entre las sucursales y, entre paréntesis al final, el detalle por sucursal (ej.: "9 CAJAS “CLIENTE” (MENENDEZ PIDAL 2, INTERCANTRI 5, URCA 2)"). Verificá la suma.\n\n'
      + 'QUÉ CARGAR, POR CADA PEDIDO\n'
      + '- cliente: en mayúsculas. Si coincide con uno de la lista de clientes conocidos, usá exactamente ese nombre.\n'
      + '- entrega: en formato AAAA-MM-DD. Resolvé fechas como "lun 05/10" con el año actual. Si solo dice un día de la semana ("para el martes"), es el próximo día con ese nombre contando desde mañana. Si no figura, dejala vacía.\n'
      + '- medias: cantidad de medias reses, número. 0 si no pide medias. Si un cliente figura en la planilla con 0 medias o con la cantidad en blanco, cargalo igual con medias 0: no lo saltees.\n'
      + '- peso: aclaración de peso de las medias (livianas, pesadas, rango de kg), o "".\n'
      + '- cortes: un elemento por cada corte pedido. "corte" es el rubro de la orden de producción, uno de: ' + CORTES_BASE.join(', ') + '. "texto" es la línea tal como se escribe en la orden de producción, en mayúsculas y con el estilo de los ejemplos: cantidad y unidad pegadas al principio (ej. "600KG", "50 UND", "10 CAJAS"), presentación o variante si se aclara (ej. "15 CAJAS PIERNA S/C “URCA”"), código si figura, y el cliente entre comillas al final. Si el cliente pide TODO el corte, la línea va sin cantidad (ej. "FRESCA EN BINES “ARGENCARNES”").\n'
      + '- orden: true si es un corte fresco que hay que producir ese día; false si es mercadería congelada que sale de stock, o productos que no salen del desposte (chorizo, morcilla, salchicha).\n'
      + '- nota: aclaraciones del pedido que no entran en otro campo. No copies precios.\n'
      + '- dudas: todo lo que no se lea bien o sea ambiguo, en una frase corta cada una. Si un número no se lee con seguridad, poné tu mejor lectura y avisá acá. No inventes datos.\n\n'
      + 'CLIENTES CONOCIDOS\n' + Object.keys(clientes).sort().join(', ') + '\n\n'
      + 'EJEMPLOS DE ÓRDENES DE PRODUCCIÓN RECIENTES (para el estilo de las líneas)\n' + ejemplos.join('\n\n');
  }
  function leerImagen(file) {
    if (window.__mock && window.__mock.ia) return Promise.resolve(window.__mock.ia(file.name));
    return achicar(file).then(function (b64) {
      return pedirIA([{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text: 'Leé los pedidos de esta imagen y cargalos.' }]);
    });
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
        type: 'object', additionalProperties: false, required: ['cliente', 'entrega', 'medias', 'peso', 'cortes', 'nota', 'dudas'],
        properties: {
          cliente: { type: 'string' }, entrega: { type: 'string', description: 'AAAA-MM-DD, o vacío si no figura' },
          medias: { type: 'number', description: 'Cantidad de medias reses; 0 si no pide' }, peso: { type: 'string' },
          cortes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['corte', 'texto', 'orden'], properties: { corte: { type: 'string' }, texto: { type: 'string' }, orden: { type: 'boolean' } } } },
          nota: { type: 'string' }, dudas: { type: 'array', items: { type: 'string' } }
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
      return cad.then(function () { return guardarPropuesta(q, auto).then(function () { ok.push(q); S.entrega = q.entrega; S.prop = S.prop.filter(function (x) { return x !== q; }); }, function (err) { q.error = err.message || 'No se pudo guardar.'; }); })
        .then(function () { return new Promise(function (r) { setTimeout(r, 30); }); });
    }, Promise.resolve()).then(function () { return ok; });
  }
  function mismoPedido(a, q) {
    var ca = (a.cortes || []).map(function (c) { return norm(c.corte) + '|' + norm(c.texto); }).sort().join('~');
    var cq = (q.cortes || []).filter(function (c) { return c.texto; }).map(function (c) { return norm(c.corte) + '|' + norm(c.texto); }).sort().join('~');
    return (+a.medias || 0) === (+q.medias || 0) && ca === cq;
  }
  function guardarLeidos(desde, errores, planillas) {
    var nuevos = S.prop.slice(desde), repetidos = 0;
    planillas = planillas || [];
    nuevos = nuevos.filter(function (q) {
      var prev = (S.pedidos || []).filter(function (x) { return x.entrega === q.entrega && norm(x.cliente) === norm(q.cliente) && norm(q.cliente); });
      if (prev.some(function (x) { return mismoPedido(x, q); })) { repetidos++; S.prop = S.prop.filter(function (x) { return x !== q; }); return false; }
      var soloMedias = prev.filter(function (x) { return !(x.cortes || []).length; })[0];
      if (soloMedias && !(q.cortes || []).some(function (c) { return c.texto; })) q.editaId = soloMedias.id;
      return true;
    });
    var txtRep = repetidos ? (repetidos === 1 ? ' 1 pedido ya estaba cargado y no se repitió.' : ' ' + repetidos + ' pedidos ya estaban cargados y no se repitieron.') : '';
    if (!nuevos.length && !planillas.length) { S.msg.fotos = (errores.length ? '!' + errores.join(' ') : repetidos ? txtRep.trim() : '!No se encontraron pedidos para leer.'); renderPedidos(); return Promise.resolve(); }
    S.msg.fotos = 'Guardando…'; pintarMsg('fotos');
    var hechas = [];
    return planillas.reduce(function (cad, pl) { return cad.then(function () { return aplicarPlanilla(pl); }).then(function (r) { if (r) hechas.push(r); }, function () { errores.push('No se pudo guardar la planilla.'); }); }, Promise.resolve()).then(function () {
      var txtPl = hechas.map(function (r) { return 'Planilla de la semana del ' + etiquetaSemana(r.lunes) + ' cargada: ' + r.dias + (r.dias === 1 ? ' día' : ' días') + ', ' + r.clientes + ' clientes.'; }).join(' ');
      if (hechas.length && !nuevos.length && !errores.length) {
        S.sem = hechas[hechas.length - 1].lunes; S.dia = null; S.mv = null; S.msg.fotos = ''; S.msg.medias = txtPl + ' Revisala y tocá Editar para corregir lo que haga falta.';
        irA('medias'); return;
      }
      return guardarVarios(nuevos, true).then(function (ok) { return finLeidos(nuevos, ok, errores, (txtPl ? txtPl + ' ' : ''), txtRep); });
    });
  }
  function finLeidos(nuevos, ok, errores, antes, despues) {
    return Promise.resolve(ok).then(function (ok) {
      var tm = ok.reduce(function (t, q) { return t + (+q.medias || 0); }, 0), fechas = {}, rev = ok.filter(function (q) { return q.dudas && q.dudas.length; }).length, faltan = nuevos.length - ok.length;
      ok.forEach(function (q) { fechas[q.entrega] = 1; });
      var fs = Object.keys(fechas).sort();
      if (fs.length) S.entrega = fs[0];
      if (S.tab === 'produccion' && fs.length) { S.ep = null; S.fecha = fs[0]; S.fechaFija = true; }
      if (S.tab === 'medias' && fs.length) { S.em = null; S.mv = null; S.fm = habilAnterior(fs[0]); S.sem = lunesDe(S.fm); S.dia = Math.round((fecha(S.fm) - fecha(S.sem)) / 86400000); }
      var m = ok.length ? 'Guardado: ' + ok.length + (ok.length === 1 ? ' pedido' : ' pedidos') + (tm ? ' · ' + n(tm) + ' medias' : '') + ' para entregar el ' + fs.map(function (f) { return tituloDe(f).toLowerCase(); }).join(' y el ') + '.' + (rev ? ' ' + rev + (rev === 1 ? ' quedó marcado' : ' quedaron marcados') + ' para revisar.' : '') + (S.tab === 'pedidos' ? ' Para cambiar algo, tocá Editar en el pedido.' : ' Los pedidos se pueden corregir en Pedidos.') : '';
      if (faltan) m = (ok.length ? '' : '!') + (m ? m + ' ' : '') + (faltan === 1 ? 'Quedó 1 pedido sin guardar: completalo acá abajo.' : 'Quedaron ' + faltan + ' pedidos sin guardar: completalos acá abajo.');
      m = (m.charAt(0) === '!' ? '!' : '') + antes + m.replace(/^!/, '') + despues;
      if (errores.length) m = '!' + m.replace(/^!/, '') + ' ' + errores.join(' ');
      S.msg.fotos = m;
      if (faltan && S.tab !== 'pedidos') { irA('pedidos'); return; }
      renderPedidos();
    });
  }
  function agregarLeidos(j, origen, nombre) {
    var porDefecto = S.tab === 'produccion' && S.fecha ? S.fecha : (S.entrega || habilSiguiente(hoy()));
    (j.pedidos || []).forEach(function (p) {
      S.prop.push({ k: uid(), cliente: p.cliente || '', entrega: /^\d{4}-\d{2}-\d{2}$/.test(p.entrega || '') ? p.entrega : porDefecto, medias: +p.medias || '', peso: p.peso || '', nota: p.nota || '', origen: origen, foto: nombre,
        dudas: (p.dudas || []).filter(Boolean), cortes: (p.cortes || []).map(function (c) { return { corte: norm(c.corte), texto: c.texto || '', orden: c.orden !== false }; }) });
    });
    return (j.pedidos || []).length;
  }
  function pareceOrden(txt) {
    var k = 0; String(txt).split('\n').forEach(function (l) { var m = l.match(/^\s*([^:]{1,32}):/); if (m && CORTES_BASE.indexOf(norm(m[1])) >= 0) k++; });
    return k >= 4;
  }
  function leerPegado() {
    var txt = String(S.pegarTxt || '').trim();
    if (!txt) { S.msg.fotos = '!Pegá primero el texto del pedido.'; pintarMsg('fotos'); return; }
    if (S.leyendo) return;
    if (S.tab === 'produccion' && S.fecha && !prodDe(S.fecha) && pareceOrden(txt)) {
      var base = armarOrden(S.fecha); base.cortes = [];
      var doc = parsearOrden(txt, base), dl = limpiarOrden(doc);
      S.pegar = false; S.pegarTxt = ''; S.pegarCli = ''; S.fechaFija = true;
      S.prod = poner(S.prod, S.fecha, dl); S.msg.fotos = 'Orden cargada desde el texto: ' + doc.cortes.length + ' cortes. Revisala y tocá Editar para corregir.';
      store.set('produccion', S.fecha, dl).then(tocar, function () { S.msg.fotos = '!No se pudo guardar la orden.'; render(); });
      render(); return;
    }
    S.leyendo = true; S.msg.fotos = 'Leyendo el texto…'; pintarMsg('fotos');
    var desde = S.prop.length;
    leerTexto(txt, String(S.pegarCli || '').toUpperCase().trim()).then(function (j) {
      var c = agregarLeidos(j, 'texto', '');
      S.leyendo = false;
      var pl = j.planilla && j.planilla.length ? [j.planilla] : [];
      if (!c && !pl.length) { S.msg.fotos = '!No se encontraron pedidos en el texto.'; renderPedidos(); return; }
      S.pegar = false; S.pegarTxt = ''; S.pegarCli = '';
      return guardarLeidos(desde, [], pl);
    }, function (e) { S.leyendo = false; S.msg.fotos = '!' + e.message; renderPedidos(); });
  }
  function subirFotos(files) {
    var lista = Array.prototype.slice.call(files), i = 0, errores = [], desde = S.prop.length, planillas = [];
    function sig() {
      if (i >= lista.length) { guardarLeidos(desde, errores, planillas); return; }
      var f = lista[i++]; S.msg.fotos = 'Leyendo ' + i + ' de ' + lista.length + '…'; pintarMsg('fotos');
      leerImagen(f).then(function (j) { agregarLeidos(j, 'foto', f.name); if (j.planilla && j.planilla.length) planillas.push(j.planilla);
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
      + '<div class="acciones"><button class="btn pri" data-act="q-guardar" data-q="' + i + '">' + (q.editaId ? 'Guardar cambios' : 'Guardar pedido') + '</button><button class="btn" data-act="q-descartar" data-q="' + i + '">' + (q.editaId ? 'Cancelar' : 'Descartar') + '</button>' + (q.editaId ? '<button class="btn rojo" data-act="ped-borrar" data-id="' + esc(q.editaId) + '">Quitar este pedido</button>' : '') + '</div></div>';
    return h;
  }
  // Los tres caminos de carga: fotos, texto pegado o a mano. Se usa en Pedidos y donde todavía no hay nada cargado.
  function cargaHTML(actMano, ayuda) {
    var conIA = !!(S.ia && S.ia.clave) || !!(window.__mock && window.__mock.ia);
    var h = '<div class="acciones"><label class="btn pri" style="display:inline-flex;align-items:center' + (conIA ? '' : ';opacity:.45') + '">Subir fotos o capturas<input type="file" id="fotos" accept="image/*" multiple hidden' + (conIA ? '' : ' disabled') + '></label>'
      + '<button class="btn" data-act="q-pegar"' + (conIA ? '' : ' disabled') + '>Pegar texto</button>'
      + '<button class="btn" data-act="' + actMano + '">Cargar a mano</button><span class="guardado" id="g-fotos"></span></div>';
    if (S.pegar && conIA) h += '<div class="pegar"><label class="campo"><span>Pegá acá el texto: un mensaje con pedidos (WhatsApp, mail)' + (S.tab === 'produccion' ? ' o la orden entera copiada de Word' : '') + '</span><textarea id="pegar-txt" rows="9" placeholder="Hola pedido de cerdo para el martes por caja…">' + esc(S.pegarTxt || '') + '</textarea></label>'
      + '<label class="campo"><span>Cliente, si todo el mensaje es de uno solo con varias sucursales (opcional)</span><input type="text" id="pegar-cli" value="' + esc(S.pegarCli || '') + '" placeholder="Dejalo vacío si cada bloque es un cliente distinto"></label>'
      + '<div class="acciones"><button class="btn pri" data-act="q-leer-texto">Leer</button><button class="btn" data-act="q-pegar">Cancelar</button></div></div>';
    if (conIA && ayuda) h += '<p class="small muted">' + ayuda + '</p>';
    if (!conIA) h += '<p class="small muted">Para leer fotos o texto pegado falta cargar la clave de IA, en Pedidos, abajo, en Configuración. Mientras tanto se puede cargar a mano.</p>';
    return h;
  }
  function renderPedidos() {
    if (S.tab !== 'pedidos') return render();
    var el = $('view-pedidos');
    if (!S.editor) { el.innerHTML = '<div class="panel"><p class="state">Para cargar pedidos hay que ingresar con una cuenta autorizada.</p></div>'; return; }
    if (!S.entrega) S.entrega = habilSiguiente(hoy());
    var h = '<div class="panel"><h2>Cargar pedidos</h2>' + cargaHTML('q-nuevo', 'Sirve para pedidos sueltos, planillas de reparto y también para la planilla semanal de faena y medias: esa se carga entera en Medias.');
    var nuevas = S.prop.filter(function (x) { return !x.editaId; });
    if (nuevas.length) h += S.prop.map(function (q, i) { return q.editaId ? '' : propHTML(q, i); }).join('') + (nuevas.length > 1 ? '<div class="acciones"><button class="btn pri" data-act="q-todos">Guardar todos</button>' + botonBorrar('q-descartar-todos', null, 'Descartar todos', '') + '</div>' : '');
    h += '</div>';

    var lista = (S.pedidos || []).filter(function (p) { return p.entrega === S.entrega; });
    var ent = S.entrega, cuando = ent === mas(hoy(), 1) ? 'mañana' : ent === hoy() ? 'hoy' : 'el ' + tituloDe(ent).toLowerCase();
    var porId = {}; lista.forEach(function (p) { porId[p.id] = p; });
    var editando = function (id) { return S.prop.some(function (x) { return x.editaId === id; }); };
    var btnEd = function (id) { return editando(id) ? '<span class="small muted" style="text-transform:none;font-weight:400">editando</span>' : '<button class="btn sm" data-act="ped-editar" data-id="' + esc(id) + '">Editar</button>'; };

    h += '<div class="nav nav-ped"><button class="btn step" data-act="e-dia" data-d="-1" aria-label="Día anterior">‹</button><span class="tit">Para entregar ' + (cuando === 'mañana' || cuando === 'hoy' ? cuando + ' · ' + esc(tituloDe(ent).toLowerCase()) : esc(cuando)) + '</span><button class="btn step" data-act="e-dia" data-d="1" aria-label="Día siguiente">›</button>'
      + '<input type="date" id="e-fecha" value="' + esc(ent) + '" aria-label="Fecha de entrega"></div>';

    // pedidos que se están editando y los que quedaron para revisar
    S.prop.forEach(function (q, k) { if (q.editaId) h += '<div class="panel"><h3>Editando el pedido de ' + esc(q.cliente || 'cliente sin nombre') + '</h3>' + propHTML(q, k) + '</div>'; });
    var rev = lista.filter(function (p) { return p.dudas && p.dudas.length && !editando(p.id); });
    if (rev.length) h += '<div class="panel"><h3><span class="badge warn">Para revisar</span></h3><div class="lista">' + rev.map(function (p) {
      return '<div class="item"><div class="cuerpo"><strong>' + esc(p.cliente) + '</strong>' + p.dudas.map(function (d) { return '<span class="small aviso">' + esc(d) + '</span>'; }).join('') + '</div><div class="botones">' + btnEd(p.id) + '</div></div>';
    }).join('') + '</div></div>';

    // 1) medias reses: lo mismo que ve el encargado de faena
    var fa = habilAnterior(ent), xf = diaFaena(fa), filas = xf ? (xf.d.clientes || []).filter(function (r) { return r.cliente || +r.cant; }).map(function (r) { return { cliente: r.cliente, medias: (+r.cant || 0) * 2, nota: r.nota, id: r.pedido && porId[r.pedido] ? r.pedido : null }; }) : [];
    lista.forEach(function (p) { if (!(p.cortes || []).length || +p.medias) { if (!filas.some(function (r) { return r.id === p.id; })) filas.push({ cliente: p.cliente, medias: +p.medias || 0, nota: p.peso, id: p.id, fuera: true }); } });
    h += '<div class="panel"><h2>Medias reses para entregar ' + esc(cuando) + '</h2>';
    if (!filas.length) h += '<p class="muted">No hay medias cargadas para entregar ' + esc(cuando) + '.</p>';
    else {
      var tm = filas.reduce(function (t, r) { return t + r.medias; }, 0);
      h += '<table class="pl cl-dia cl-ped"><thead><tr><th>Cliente</th><th>Medias</th><th></th></tr></thead><tbody>' + filas.map(function (r) {
        return '<tr' + (r.medias ? '' : ' class="cero"') + '><td>' + esc(r.cliente || 'Sin nombre') + (r.nota ? ' <span class="small muted" style="text-transform:none;font-weight:400">' + esc(r.nota) + '</span>' : '') + (r.fuera ? ' <span class="small aviso" style="text-transform:none;font-weight:400">no está en la planilla</span>' : '') + '</td><td>' + n(r.medias) + '</td><td class="ac">' + (r.id ? btnEd(r.id) : '') + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><th>Total</th><td>' + n(tm) + '</td><td></td></tr></tfoot></table>'
        + '<p class="small muted">Salen de la faena del ' + esc(tituloDe(fa).toLowerCase()) + '. Los que no tienen "Editar" vienen de la planilla semanal y se cambian ahí.</p>';
    }
    h += '<div class="acciones"><button class="btn sm" data-act="ir-medias">Abrir la planilla de medias</button></div></div>';

    // 2) pedidos de desposte: agrupados por corte, como la orden
    var grupos = {}, fuera = [];
    lista.forEach(function (p) { (p.cortes || []).forEach(function (c) { if (!c.texto) return; if (c.orden === false) { fuera.push({ corte: c.corte, t: c.texto, id: p.id }); return; } var k = norm(c.corte); (grupos[k] = grupos[k] || []).push({ t: c.texto, id: p.id }); }); });
    var claves = Object.keys(grupos).sort(function (a, b) { var ia = CORTES_BASE.indexOf(a), ib = CORTES_BASE.indexOf(b); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || (a < b ? -1 : 1); });
    h += '<div class="panel"><h2>Pedidos de desposte para ' + esc(cuando) + '</h2>';
    if (!claves.length && !fuera.length) h += '<p class="muted">No hay pedidos de cortes cargados para ' + esc(cuando) + '.</p>';
    else {
      h += '<article class="op op-ped">' + claves.map(function (k) {
        return '<div class="op-c">' + grupos[k].map(function (l, i2) { return '<p class="lp"><span>' + (i2 === 0 ? '<u>' + esc(k) + '</u>: ' : '') + esc(l.t) + '</span>' + btnEd(l.id) + '</p>'; }).join('') + '</div>';
      }).join('');
      if (fuera.length) h += '<div class="op-c"><p class="small muted" style="text-transform:none;font-weight:400">No van a la orden de desposte (congelado de stock u otro sector):</p>' + fuera.map(function (l) { return '<p class="lp"><span><u>' + esc(l.corte) + '</u>: ' + esc(l.t) + '</span>' + btnEd(l.id) + '</p>'; }).join('') + '</div>';
      h += '</article>';
    }
    h += '<div class="acciones"><button class="btn sm" data-act="ir-orden">Ver la orden completa de ese día</button></div></div>';

    if ((S.pedidos || []).length) h += '<div class="acciones">' + (lista.length ? botonBorrar('ped-borrar-todos', null, 'Quitar todos los pedidos de este día (' + lista.length + ')') : '')
      + botonBorrar('ped-borrar-total', null, 'Quitar todos los pedidos, de todos los días (' + S.pedidos.length + ')') + '</div>';

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
    var fm = fmInicial(), x = diaFaena(fm), cl = x ? conMedias(x.d) : [];
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
  function alInicio() { if (S.em) guardar('medias', true); if (S.ep) guardar('prod', true); S.em = null; S.ep = null; S.fechaFija = false; S.fecha = null; S.sem = null; S.dia = null; S.entrega = null; S.fm = null; S.mv = null; }

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
    TABS.forEach(function (t) { $('view-' + t).hidden = S.tab !== t; if (S.tab !== t) $('view-' + t).innerHTML = ''; $('tab-' + t).setAttribute('aria-selected', String(S.tab === t)); });
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

  document.querySelector('.top').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (!b) return; e.preventDefault(); if (b.dataset.tab === 'inicio') alInicio(); S.msg.fotos = ''; S.pegar = false; S.pegarTxt = ''; S.pegarCli = ''; irA(b.dataset.tab); });

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
      hoja.textContent = '@page{size:A4 ' + (S.tab === 'medias' && mvAct() === 'semana' ? 'landscape' : 'portrait') + ';margin:10mm}';
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
    else if (a === 'fm-ir') { S.fm = D.f; render(); }
    else if (a === 'fm') { var y = S.fm; do { y = mas(y, +D.d); } while (!esHabil(y)); S.fm = y; render(); }
    else if (a === 'm-semana' || a === 'm-editar-dia') {
      S.mv = 'semana'; S.sem = lunesDe(S.fm); S.dia = Math.round((fecha(S.fm) - fecha(S.sem)) / 86400000);
      if (a === 'm-editar-dia') { var ya = semDe(S.sem); S.em = { lunes: S.sem, doc: ya ? clone(ya) : semanaNueva(S.sem) }; S.msg.medias = ''; if (!ya) guardar('medias', true); }
      render();
    }
    else if (a === 'm-dia') { if (S.em) guardar('medias', true); S.em = null; S.mv = 'dia'; if (S.sem && S.dia != null) S.fm = mas(S.sem, S.dia); render(); }
    else if (a === 'sem') { S.msg.fotos = ''; if (S.em) guardar('medias', true); S.em = null; S.sem = mas(S.sem, +D.d); S.dia = null; render(); }
    else if (a === 'dia') { S.dia = +D.i; var g = document.querySelector('.dias'); if (g) g.dataset.sel = D.i; document.querySelectorAll('.dtabs .btn').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.i === D.i)); }); }
    else if (a === 'm-editar') { if (S.em) { guardar('medias', true); S.em = null; } else { S.em = { lunes: S.sem, doc: clone(semDe(S.sem)) }; S.msg.medias = ''; } render(); }
    else if (a === 'm-nueva') { S.em = { lunes: S.sem, doc: semanaNueva(S.sem) }; guardar('medias', true); render(); }
    else if (a === 'm-agregar') { S.em.doc.dias[+D.i][D.m].push(D.m === 'faena' ? { origen: '', propios: 0, usuarios: 0 } : { cliente: '', cant: 0 }); render(); var ult = S.em.doc.dias[+D.i][D.m].length - 1, foco = $((D.m === 'faena' ? 'f' : 'c') + D.i + '-' + ult + (D.m === 'faena' ? 'o' : 'c')); if (foco) foco.focus(); }
    else if (a === 'm-vaciar') { if (!confirma('m-vaciar' + D.i)) { render(); return; } var dv = S.em.doc.dias[+D.i]; dv.faena = [{ origen: '', propios: 0, usuarios: 0 }]; dv.clientes = []; guardar('medias'); render(); }
    else if (a === 'm-borrar-semana') { if (!confirma('m-borrar-semana')) { render(); return; } clearTimeout(timers.medias); var lb = S.em.lunes; S.em = null; S.faena = (S.faena || []).filter(function (x) { return x.id !== lb; }); store.del('faena', lb).then(tocar, function () {}); render(); }
    else if (a === 'm-quitar') { S.em.doc.dias[+D.i][D.m].splice(+D.r, 1); guardar('medias'); render(); }

    // producción
    else if (a === 'fecha') { S.msg.fotos = ''; S.fechaFija = true; if (S.ep) guardar('prod', true); S.ep = null; var x = S.fecha; do { x = mas(x, +D.d); } while (!esHabil(x)); S.fecha = x; render(); }
    else if (a === 'p-armar') { S.fechaFija = true; S.ep = { fecha: S.fecha, doc: armarOrden(S.fecha) }; S.ep.base = clone(S.ep.doc); guardar('prod', true); render(); }
    else if (a === 'p-editar') { S.fechaFija = true; if (S.ep) { guardar('prod', true); S.ep = null; } else { S.ep = { fecha: S.fecha, doc: clone(prodDe(S.fecha)) }; S.ep.base = clone(S.ep.doc); S.msg.prod = ''; } render(); if (S.ep) { var pd = $('p-doc'); if (pd) { pd.focus(); pd.setSelectionRange(0, 0); window.scrollTo(0, 0); } } }
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
      if (S.ep) S.ep.base = clone(S.ep.doc);
      guardar('prod', a === 'p-estado'); render();
      if (a === 'p-linea') { var fl = $('pl' + D.c + '-' + (c.lineas.length - 1)); if (fl) fl.focus(); }
      if (a === 'p-corte') { var fc = $('pc' + (o.cortes.length - 1)); if (fc) fc.focus(); }
    }

    // pedidos
    else if (a === 'q-pegar') { S.pegar = !S.pegar; if (!S.pegar) { S.pegarTxt = ''; S.pegarCli = ''; } S.msg.fotos = ''; renderPedidos(); var ft = $('pegar-txt'); if (ft) ft.focus(); }
    else if (a === 'q-leer-texto') { leerPegado(); }
    else if (a === 'q-nuevo') { S.prop.push(pedidoVacio()); renderPedidos(); var fq = $('q' + (S.prop.length - 1) + 'cliente'); if (fq) fq.focus(); }
    else if (a === 'q-corte') { S.prop[+D.q].cortes.push({ corte: CORTES_BASE[0], texto: '', orden: true }); renderPedidos(); }
    else if (a === 'q-quitar-corte') { S.prop[+D.q].cortes.splice(+D.j, 1); renderPedidos(); }
    else if (a === 'q-descartar-todos') { if (!confirma('q-descartar-todos')) { renderPedidos(); return; } S.prop = S.prop.filter(function (x) { return x.editaId; }); S.msg.fotos = ''; renderPedidos(); }
    else if (a === 'ped-borrar-todos') {
      if (!confirma('ped-borrar-todos')) { renderPedidos(); return; }
      borrarPedidos((S.pedidos || []).filter(function (x) { return x.entrega === S.entrega; })).then(function () { tocar(); renderPedidos(); }, function () { S.msg.fotos = '!No se pudieron quitar todos.'; renderPedidos(); });
      renderPedidos();
    }
    else if (a === 'ped-borrar-total') {
      if (!confirma('ped-borrar-total')) { renderPedidos(); return; }
      S.prop = [];
      borrarPedidos((S.pedidos || []).slice()).then(function () { tocar(); S.msg.fotos = 'Se quitaron todos los pedidos.'; renderPedidos(); }, function () { S.msg.fotos = '!No se pudieron quitar todos.'; renderPedidos(); });
      renderPedidos();
    }
    else if (a === 'q-descartar') { S.prop.splice(+D.q, 1); renderPedidos(); }
    else if (a === 'q-guardar' || a === 'q-todos') {
      var cuales = a === 'q-todos' ? S.prop.filter(function (x) { return !x.editaId; }) : [S.prop[+D.q]];
      S.msg.fotos = 'Guardando…'; pintarMsg('fotos');
      guardarVarios(cuales, false).then(function () { S.msg.fotos = S.prop.some(function (x) { return x.error; }) ? '!Quedaron pedidos sin guardar: revisalos.' : 'Guardado.'; renderPedidos(); });
    }
    else if (a === 'ped-editar') {
      var pe = (S.pedidos || []).filter(function (x) { return x.id === D.id; })[0];
      if (pe && !S.prop.some(function (x) { return x.editaId === pe.id; })) S.prop.push({ k: uid(), editaId: pe.id, cliente: pe.cliente || '', entrega: pe.entrega || '', medias: pe.medias || '', peso: pe.peso || '', nota: pe.nota || '', origen: pe.origen || 'manual', dudas: (pe.dudas || []).slice(), cortes: clone(pe.cortes || []) });
      S.msg.fotos = ''; renderPedidos(); var fe = $('q' + (S.prop.length - 1) + 'cliente'); if (fe) fe.focus();
    }
    else if (a === 'ped-borrar') { var p = (S.pedidos || []).filter(function (x) { return x.id === D.id; })[0]; S.prop = S.prop.filter(function (x) { return x.editaId !== D.id; }); if (p) borrarPedido(p).then(tocar); renderPedidos(); }
    else if (a === 'e-dia') { var ye = S.entrega; do { ye = mas(ye, +D.d); } while (!esHabil(ye)); S.entrega = ye; renderPedidos(); }
    else if (a === 'ir-medias') { S.em = null; S.mv = null; S.fm = habilAnterior(S.entrega); S.sem = lunesDe(S.fm); S.dia = Math.round((fecha(S.fm) - fecha(S.sem)) / 86400000); irA('medias'); }
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
    if (e.target && e.target.id === 'pegar-cli') { S.pegarCli = e.target.value; return; }
    if (e.target && e.target.id === 'pegar-txt') { S.pegarTxt = e.target.value; if (S.msg.fotos) { S.msg.fotos = ''; pintarMsg('fotos'); } return; }
    var t = e.target, D = t.dataset;
    if (D.m && S.em) { S.em.doc.dias[+D.i][D.m][+D.r][D.k] = t.value; guardar('medias'); pintarSumas(); }
    else if (t.id === 'm-stock' && S.em) { S.em.doc.stockInicial = t.value === '' ? null : t.value; guardar('medias'); pintarSumas(); }
    else if (t.id === 'p-doc' && S.ep) { S.ep.doc = parsearOrden(t.value, S.ep.base || S.ep.doc); crecer(t); guardar('prod'); }
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
            store.sub('privado', function (l) { var c = l.filter(function (x) { return x.id === 'ia'; })[0]; if (c) { var antes = !!(S.ia && S.ia.clave); S.ia = c; if (!antes && !S.prop.length && !S.em && !S.ep && !S.pegar) render(); } });
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
