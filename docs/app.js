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
  var TABS = ['inicio', 'pedidos', 'produccion', 'logistica', 'medias'];
  var CORTES_BASE = ['JAMON', 'PALETA', 'PECHO', 'CARRE', 'SOLOMILLO', 'MATAMBRE', 'BONDIOLA', 'RECORTE', 'GRASA BUENA', 'GRASA MALA', 'CUERO', 'TAPA DE PALETA', 'TAPA DE JAMON', 'TORTUGA', 'GARRON', 'TOCINO', 'CHURRASCO', 'PAPADA', 'OREJAS', 'CABEZA', 'PULMON', 'HIGADO', 'PATAS Y MANOS'];

  var S = {
    faena: null, prod: null, pedidos: null, config: {}, ia: {}, status: 'loading', fuente: '',
    log: {},        // logística publicada, por fecha de entrega
    tab: 'inicio', mv: null, fm: null, sem: null, dia: null, fecha: null, entrega: null, fl: null,
    abierto: {},    // pedidos desplegados en el listado
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
  function animales(v) { return n(v) + (v === 1 ? ' animal' : ' animales'); }
  function fmInicial() { var h = hoy(); return esHabil(h) ? h : habilSiguiente(h); }
  function diaFaena(f) {
    var lunes = lunesDe(f), sem = semDe(lunes), i = Math.round((fecha(f) - fecha(lunes)) / 86400000);
    return sem && sem.dias[i] ? { sem: sem, i: i, d: sem.dias[i] } : null;
  }
  function elegirSemanaHTML(pp) {
    var nd = pp.dias.filter(function (d) { return (d.faena || []).length || (d.clientes || []).length; }).length, nc = pp.dias.reduce(function (t, d) { return t + (d.clientes || []).length; }, 0);
    var ops = [pp.esperada]; if (ops.indexOf(semanaActual()) < 0) ops.push(semanaActual());
    return '<div class="panel"><h2>¿En qué semana cargo la planilla?</h2>'
      + '<p>La planilla que subiste (' + nd + ' días, ' + nc + ' clientes) tiene fechas de la <strong>semana del ' + esc(etiquetaSemana(pp.leida)) + '</strong>, que no es la que estás cargando.</p>'
      + '<div class="acciones">' + ops.map(function (l, k) { return '<button class="btn' + (k === 0 ? ' pri' : '') + '" data-act="pl-elegir" data-l="' + l + '">' + (l === semanaActual() ? 'En esta semana · ' : 'En la semana del ') + esc(etiquetaSemana(l)) + '</button>'; }).join('')
      + '<button class="btn" data-act="pl-elegir" data-l="' + pp.leida + '">En la que dice la planilla · ' + esc(etiquetaSemana(pp.leida)) + '</button>'
      + '<button class="btn lnk" data-act="pl-cancelar">No cargarla</button><span class="guardado" id="g-medias"></span></div>'
      + '<p class="small muted">Se reemplazan la faena y los clientes de la semana que elijas. Lo demás no se toca.</p></div>';
  }
  function renderMedias() {
    var el = $('view-medias');
    if (S.editor && S.planPend && S.planPend.length) { el.innerHTML = elegirSemanaHTML(S.planPend[0]); pintarMsg('medias'); return; }
    if (mvAct() === 'semana') return renderSemana();
    if (cargando(el, S.faena)) return;
    if (!S.fm) S.fm = fmInicial();
    var f = S.fm, x = diaFaena(f), cl = x ? conMedias(x.d) : [];
    var h = '<div class="nav"><button class="btn step" data-act="fm" data-d="-1" aria-label="Día anterior">‹</button><span class="tit">' + esc(tituloDe(f)) + '</span><button class="btn step" data-act="fm" data-d="1" aria-label="Día siguiente">›</button>'
      + '<input type="date" id="m-fecha" value="' + esc(f) + '" aria-label="Ir a una fecha">'
      + (cl.length ? '<button class="btn" data-act="imprimir">Imprimir</button>' : '')
      + (S.editor ? '<button class="btn" data-act="m-semana">Volver a la planilla de la semana</button>' : '') + '</div>';
    var lu = lunesDe(f);
    h += '<div class="semtabs" role="group" aria-label="Días de la semana">' + [0, 1, 2, 3, 4].map(function (k) {
      var fk = mas(lu, k), xk = diaFaena(fk), tk = xk ? conMedias(xk.d).reduce(function (t, r) { return t + (+r.cant || 0); }, 0) : 0;
      return '<button class="btn" data-act="fm-ir" data-f="' + fk + '" aria-pressed="' + (fk === f) + '"><b>' + diaDe(fk).slice(0, 3) + ' ' + fecha(fk).getDate() + '</b><span>' + (tk ? animales(tk) : 'sin ventas') + '</span></button>';
    }).join('') + '</div>';
    h += '<div class="panel"><h2>Animales para clientes</h2>';
    if (!cl.length) {
      var con = []; (S.faena || []).forEach(function (sm) { sm.dias.forEach(function (d, k) { if (conMedias(d).length) con.push(mas(sm.id, k)); }); });
      con.sort();
      var ant = con.filter(function (z) { return z < f; }).slice(-1)[0], pos = con.filter(function (z) { return z > f; })[0];
      h += '<p class="state">No hay ventas a clientes cargadas para este día.</p>';
      if (ant || pos) h += '<div class="acciones" style="justify-content:center">' + [ant, pos].filter(Boolean).map(function (z) { return '<button class="btn" data-act="fm-ir" data-f="' + z + '">Ver el ' + esc(tituloDe(z).toLowerCase()) + '</button>'; }).join('') + '</div>';
    }
    else {
      var tot = cl.reduce(function (t, r) { return t + (+r.cant || 0); }, 0);
      h += '<table class="pl cl-dia"><thead><tr><th>Cliente</th><th>Animales</th></tr></thead><tbody>' + cl.map(function (r) {
        return '<tr><td>' + esc(r.cliente || 'Sin nombre') + (r.nota ? ' <span class="small muted" style="text-transform:none;font-weight:400">' + esc(r.nota) + '</span>' : '') + '</td><td>' + n(+r.cant || 0) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><th>Total</th><td>' + n(tot) + '</td></tr></tfoot></table>'
        + '<p class="small muted">Cantidades en animales enteros (un animal son dos medias). Salen de la faena del ' + esc(tituloDe(f).toLowerCase()) + ' y se entregan el ' + esc(tituloDe(habilSiguiente(f)).toLowerCase()) + '.</p>';
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
  function ordenCorte(nombre) { var i = CORTES_BASE.indexOf(norm(nombre)); return i < 0 ? 999 : i; }
  function prodGuardada(f) { return (S.prod || []).filter(function (o) { return o.id === f; })[0] || null; }
  function prodVacia(f) { return { fecha: f, medias: +S.config.desposteHabitual || 750, mercado: '', estado: 'borrador', cortes: [] }; }
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
  function fechaProdDe(m, p, c) { return m[p.id + '|' + c.k] || m[p.id + '|t:' + norm(c.texto)] || null; }
  function guardarOrden(f, o, borrarSiVacia) {
    var ol = limpiarOrden(o);
    if (borrarSiVacia && !ol.cortes.length) { S.prod = (S.prod || []).filter(function (x) { return x.id !== f; }); return store.del('produccion', f); }
    S.prod = poner(S.prod, f, ol); return store.set('produccion', f, ol);
  }
  function sumarCortes(p, cuales) {
    var f = p.entrega, o = clone(prodGuardada(f) || prodVacia(f)), m = enProduccion();
    cuales.forEach(function (c) { if (c.texto && !fechaProdDe(m, p, c)) insertarLinea(o, c.corte, c.texto, p.id, c.k, p.frio); });
    return guardarOrden(f, o).then(tocar);
  }
  function quitarCorte(p, c) {
    var f = fechaProdDe(enProduccion(), p, c), o = f && prodGuardada(f);
    if (!o) return Promise.resolve();
    var x = clone(o); quitarDeOrden(x, p.id, c.k, c.texto);
    return guardarOrden(f, x, true).then(tocar);
  }
  // Total de un corte, sumando la cantidad con la que empieza cada renglón, por unidad.
  function totalCorte(c) {
    var t = {}, orden = ['kg', 'cajas', 'und', 'bines'];
    (c.lineas || []).forEach(function (l) {
      var m = norm(l.t).match(/^([\d.,]+)\s*(KGS?|KILOS?|K|CAJAS?|CJS?|UND|UNIDAD(?:ES)?|UNID|U|BINES?)\b/);
      if (!m) return;
      var u = /^K/.test(m[2]) ? 'kg' : /^C/.test(m[2]) ? 'cajas' : /^B/.test(m[2]) ? 'bines' : 'und';
      t[u] = (t[u] || 0) + numero(m[1]);
    });
    return orden.filter(function (u) { return t[u]; }).map(function (u) { return n(t[u]) + ' ' + (u === 'cajas' && t[u] === 1 ? 'caja' : u === 'bines' && t[u] === 1 ? 'bin' : u); }).join(' · ');
  }
  function textoOrden(o, sinFrio) {
    var out = [diaDe(o.fecha).toUpperCase() + ' ' + fechaCorta(o.fecha), (o.medias || '') + '½ ' + String(o.mercado || '').toUpperCase()];
    (o.cortes || []).forEach(function (c) {
      (c.lineas.length ? c.lineas : [{ t: '' }]).forEach(function (l, i) { out.push(((i === 0 ? c.corte + ': ' : '') + l.t + (l.f && !sinFrio ? ' (' + l.f + ')' : '')).toUpperCase()); });
      var tot = totalCorte(c); if (tot && c.lineas.length > 1) out.push('TOTAL ' + c.corte + ': ' + tot.toUpperCase());
    });
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
      h += '<div class="panel"><p class="state">Todavía no hay nada en producción para este día.</p>';
      if (S.editor) h += '<div class="acciones" style="justify-content:center"><button class="btn pri" data-act="ir-pedidos" data-f="' + f + '">Ir a los pedidos de este día</button><button class="btn" data-act="p-nueva">Escribir a mano</button></div>';
      el.innerHTML = h + '</div>'; return;
    }
    if (edit) { h += prodEditHTML(S.ep.doc); el.innerHTML = h; pintarMsg('prod'); crecer($('p-doc')); return; }
    var nl = (o.cortes || []).reduce(function (t, c) { return t + c.lineas.length; }, 0);
    h += '<div class="panel hoja"><header class="hoja-cab"><div><p class="hoja-sup">Planilla de producción</p><h2>' + esc(tituloDe(f)) + '</h2></div>'
      + '<div class="hoja-dato"><b>' + n(+o.medias || 0) + '</b><span>medias' + (o.mercado ? ' · ' + esc(o.mercado) : '') + '</span></div>'
      + (o.estado === 'borrador' ? '<span class="badge warn">Borrador</span>' : '<span class="badge ok">Confirmada</span>') + '</header>';
    if (!nl) h += '<p class="muted">Todavía no se sumó ningún corte.</p>';
    else h += '<div class="hoja-cortes">' + (o.cortes || []).map(function (c) {
      var tot = totalCorte(c);
      return '<div class="hoja-corte"><div class="hoja-nom"><h3>' + esc(c.corte || 'Sin corte') + '</h3>' + (tot ? '<p class="hoja-tot"><span>Total</span> ' + esc(tot) + '</p>' : '') + '</div><ul>' + c.lineas.map(function (l) { return '<li>' + esc(l.t) + (l.f ? ' ' + frioBadge(l.f) : '') + '</li>'; }).join('') + '</ul></div>';
    }).join('') + '</div>';
    h += '<div class="acciones"><button class="btn" data-act="copiar">Copiar como texto</button>' + (S.editor ? '<button class="btn" data-act="ir-pedidos" data-f="' + f + '">Sumar cortes desde los pedidos</button>' : '') + '<span class="small muted" id="copiado" aria-live="polite"></span></div><textarea id="txt-orden" class="txt" readonly hidden aria-label="Planilla en texto">' + esc(textoOrden(o)) + '</textarea></div>';
    el.innerHTML = h;
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
  function crecer(e) { if (!e) return; e.style.height = 'auto'; e.style.height = (e.scrollHeight + 4) + 'px'; }
  function prodEditHTML(o) {
    var h = '<div class="panel">';
    var st = stockParaFecha(o.fecha);
    if (st != null) h += '<p class="small ' + (st < +o.medias ? 'neg' : 'muted') + '">Hay ' + n(st) + ' medias con un día de frío para este día.</p>';
    h += '<div class="acciones">' + (o.estado === 'borrador'
      ? '<button class="btn pri" data-act="p-estado" data-v="lista">Confirmar planilla</button>'
      : '<span class="badge ok">Confirmada</span><button class="btn sm" data-act="p-estado" data-v="borrador">Volver a borrador</button>')
      + botonBorrar('p-borrar', null, 'Borrar la planilla') + '</div></div>';
    h += '<div class="panel"><p class="small muted">Cada corte empieza con su nombre y dos puntos (JAMON: …); los renglones de abajo son de ese corte. Se guarda solo.</p>'
      + '<article class="op"><p class="op-f">' + esc(diaDe(o.fecha)) + ' ' + esc(fechaCorta(o.fecha)) + '</p>'
      + '<textarea id="p-doc" class="op-doc" spellcheck="false" autocapitalize="characters" aria-label="Planilla de producción">' + esc(docDeOrden(o)) + '</textarea></article></div>';
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
    x.cortes.forEach(function (c) { c.corte = String(c.corte || '').toUpperCase().trim(); delete c.colgado; c.lineas.forEach(function (l) { l.t = String(l.t || '').toUpperCase().replace(/\s+/g, ' ').trim(); }); });
    x.actualizado = ahoraTxt(); x.por = S.user ? S.user.email : '';
    return x;
  }
  var tTocar = null;
  function tocar() { clearTimeout(tTocar); tTocar = setTimeout(function () { var c = clone(S.config || {}); delete c.id; c.actualizado = ahoraTxt(); store.set('config', 'general', c).catch(function () {}); }, 1500); }

  /* ---------- pedidos ----------
     El listado de pedidos es el centro. De ahí salen la planilla de producción (se suma cada corte
     con un clic), la logística (pedidos agrupados en camiones) y, solas, las medias de la planilla semanal. */
  function pedidoVacio() { return { k: uid(), cliente: '', entrega: habilSiguiente(hoy()), medias: '', peso: '', frio: '', cortes: [], nota: '', dudas: [], origen: 'manual' }; }
  // Fresco o congelado, si el pedido lo aclara.
  function frioDe(x) { var t = norm(x); return /CONG/.test(t) ? 'CONGELADO' : /FRESC/.test(t) ? 'FRESCO' : ''; }
  function frioBadge(f) { return f ? '<span class="badge ' + (f === 'CONGELADO' ? 'cong' : 'fresco') + '">' + esc(f) + '</span>' : ''; }
  function pedidoDe(id) { return (S.pedidos || []).filter(function (x) { return x.id === id; })[0] || null; }
  // Cortes del pedido con su clave. Los pedidos viejos no la tenían: se usa la posición.
  function cortesDe(p) { return (p.cortes || []).map(function (c, j) { if (!c.k) c.k = 'i' + j; return c; }); }
  // Las medias del pedido van solas a la planilla semanal, en el día de faena anterior a la entrega.
  function aplicarMedias(p) {
    var medias = +p.medias || 0, va = !!p.entrega && (medias > 0 || !(p.cortes || []).some(function (c) { return c.texto; }));
    var fa = va ? habilAnterior(p.entrega) : null, lunes = fa ? lunesDe(fa) : null, i = fa ? Math.round((fecha(fa) - fecha(lunes)) / 86400000) : -1, cambios = {};
    (S.faena || []).forEach(function (s) {
      var fuera = s.dias.some(function (d, k) { return !(s.id === lunes && k === i) && d.clientes.some(function (r) { return r.pedido === p.id; }); });
      if (!fuera) return;
      var x = clone(semDe(s.id)); x.dias.forEach(function (d, k) { if (!(s.id === lunes && k === i)) d.clientes = d.clientes.filter(function (r) { return r.pedido !== p.id; }); });
      cambios[s.id] = x;
    });
    if (va) {
      var sem = cambios[lunes] || clone(semDe(lunes) || semanaNueva(lunes)), filas = sem.dias[i].clientes, nombre = norm(p.cliente);
      var fila = filas.filter(function (r) { return r.pedido === p.id; })[0] || filas.filter(function (r) { return !r.pedido && norm(r.cliente) === nombre; })[0];
      if (!fila) { fila = {}; filas.push(fila); }
      fila.cliente = String(p.cliente || '').toUpperCase().trim(); fila.cant = medias / 2; fila.pedido = p.id; fila.nota = [p.peso, p.frio].filter(Boolean).join(' · ');
      cambios[lunes] = sem;
    }
    return Promise.all(Object.keys(cambios).map(function (l) { var sl = limpiarSemana(cambios[l]); S.faena = poner(S.faena, l, sl); return store.set('faena', l, sl); }));
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
      var x = tocadas[p.entrega] || clone(prodGuardada(p.entrega) || prodVacia(p.entrega));
      insertarLinea(x, c.corte, c.texto, p.id, c.k, p.frio); tocadas[p.entrega] = x;
    });
    return Promise.all(Object.keys(tocadas).map(function (f) { return guardarOrden(f, tocadas[f], true); }));
  }
  function borrarPedido(p) { return borrarPedidos([p]); }
  function borrarPedidos(lista) {
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
  function kgDeTexto(t) {
    var s = norm(t), m = s.match(/^([\d.,]+)\s*(KGS?|KILOS?|K)\b/);
    if (m) return { kg: numero(m[1]) };
    m = s.match(/^([\d.,]+)\s*(CAJAS?|CJS?)\b/);
    if (m) return { kg: numero(m[1]) * kgCaja() };
    return { kg: 0, falta: true };
  }
  // Si el pedido tiene kilos cargados a mano, valen esos. Si no: medias y cajas por su peso habitual, más lo que viene en kg.
  function kgPedido(p) {
    if (+p.kg > 0) return { kg: +p.kg, manual: true };
    var kg = (+p.medias || 0) * kgMedia(), falta = false;
    (p.cortes || []).forEach(function (c) { if (!c.texto) return; var r = kgDeTexto(c.texto); kg += r.kg; if (r.falta) falta = true; });
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
  function logDe(f) { return (S.log || {})[f] || null; }
  function camionesDe(f) { var l = logDe(f); return (l && l.camiones) || []; }
  function nombreCamion(f, id) { var c = camionesDe(f).filter(function (x) { return x.id === id; })[0]; return c ? c.nombre : ''; }
  function publicarLog(f, camiones) {
    if (!f) return Promise.resolve();
    var cams = (camiones || camionesDe(f)).map(function (c) { return { id: c.id, nombre: c.nombre || '', nota: c.nota || '', kg: +c.kg || 0 }; }), hay = {};
    cams.forEach(function (c) { hay[c.id] = 1; });
    var peds = (S.pedidos || []).filter(function (p) { return p.entrega === f; }).map(function (p) {
      var k = kgPedido(p);
      return { id: p.id, cliente: p.cliente || '', medias: +p.medias || 0, peso: p.peso || '', frio: p.frio || '', nota: p.nota || '', camion: p.camion && hay[p.camion] ? p.camion : '', kg: k.kg, kgFalta: !!k.falta, kgManual: !!k.manual,
        cortes: (p.cortes || []).filter(function (c) { return c.texto; }).map(function (c) { return { corte: c.corte, texto: c.texto }; }) };
    });
    S.log = S.log || {};
    if (!peds.length && !cams.length) { if (!S.log[f]) return Promise.resolve(); delete S.log[f]; return store.del('config', 'log-' + f); }
    var doc = { fecha: f, camiones: cams, pedidos: peds, actualizado: ahoraTxt() };
    S.log[f] = clone(doc); S.log[f].id = 'log-' + f;
    return store.set('config', 'log-' + f, doc);
  }
  // Si lo publicado no coincide con los pedidos (por ejemplo, pedidos cargados antes de que existiera Logística), se vuelve a publicar.
  function conciliarLog() {
    if (!S.editor || !S.pedidos || !S.logListo) return;
    var desde = habilAnterior(hoy()), porFecha = {};
    S.pedidos.forEach(function (p) { if (p.entrega && p.entrega >= desde) (porFecha[p.entrega] = porFecha[p.entrega] || []).push(p.id); });
    Object.keys(S.log || {}).forEach(function (f) { if (f >= desde && !porFecha[f]) porFecha[f] = []; });
    Object.keys(porFecha).forEach(function (f) {
      var lg = logDe(f), kgDe = {}; S.pedidos.forEach(function (p) { if (p.entrega === f) kgDe[p.id] = kgPedido(p).kg; });
      var a = porFecha[f].slice().sort().map(function (id) { return id + ':' + kgDe[id] + ':' + ((pedidoDe(id) || {}).frio || ''); }).join(','), b = ((lg && lg.pedidos) || []).map(function (x) { return x.id + ':' + (+x.kg || 0) + ':' + (x.frio || ''); }).sort().join(',');
      if (a !== b) publicarLog(f).then(null, function () {});
    });
  }
  function avisoCamion(f, camId, cuantos) {
    var cam = camionesDe(f).filter(function (c) { return c.id === camId; })[0], lg = logDe(f), t = cam ? capTxt(cam, cargaDe((lg && lg.pedidos) || [], camId)) : '';
    return cuantos + (cuantos === 1 ? ' pedido' : ' pedidos') + ' en "' + (cam ? cam.nombre : '') + '".' + (t ? ' ' + t.charAt(0).toUpperCase() + t.slice(1) + '.' : '');
  }
  // Pone (o saca, con cam vacío) un grupo de pedidos en un camión de ese día.
  function asignarCamion(f, ids, cam, camiones) {
    var tareas = [];
    ids.forEach(function (id) {
      var p = pedidoDe(id); if (!p || (p.camion || '') === (cam || '')) return;
      var doc = clone(p); delete doc.id; doc.camion = cam || '';
      S.pedidos = poner(S.pedidos, id, doc); tareas.push(store.set('pedidos', id, doc));
    });
    return Promise.all(tareas).then(function () { return publicarLog(f, camiones); }).then(tocar);
  }
  function crearCamion(f, nombre, nota, ids, kg, idFijo) {
    var cams = camionesDe(f).slice(), cam = { id: idFijo || 'c' + uid(), nombre: String(nombre || '').trim() || 'Camión ' + (cams.length + 1), nota: String(nota || '').trim(), kg: +kg || 0 };
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
  function cambiarCamion(f, id, nombre, nota, kg) {
    var cams = camionesDe(f).map(function (c) { return c.id === id ? { id: id, nombre: String(nombre || '').trim() || c.nombre, nota: String(nota || '').trim(), kg: +kg || 0 } : c; });
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
  function aplicarPlanilla(dias, elegida) {
    var DN = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'], leida = semanaLeida(dias);
    var lunes = elegida || leida || S.sem || semanaActual();
    var sem = clone(semDe(lunes) || semanaNueva(lunes)), nd = 0, nc = 0;
    dias.forEach(function (d) {
      var i = DN.indexOf(norm(d.dia));
      if (i < 0 && leida && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '')) i = Math.round((fecha(d.fecha) - fecha(leida)) / 86400000);
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
    var previo = q.editaId ? pedidoDe(q.editaId) : null, entrega = q.entrega || '';
    var p = { cliente: String(q.cliente || '').toUpperCase().trim(), entrega: entrega, medias: +q.medias || 0, peso: q.peso || '', frio: frioDe(q.frio), nota: q.nota || '', origen: q.origen || 'manual',
      creado: previo && previo.creado ? previo.creado : ahoraTxt(), kg: +q.kg > 0 ? +q.kg : '',
      camion: previo && previo.entrega === entrega ? (previo.camion || '') : '',
      cortes: (q.cortes || []).filter(function (c) { return c.texto; }).map(function (c) { return { k: c.k || uid(), corte: norm(c.corte), texto: String(c.texto).toUpperCase().replace(/\s+/g, ' ').trim(), orden: c.orden !== false }; }) };
    if (!p.cliente) return Promise.reject(new Error('Falta el cliente.'));
    if (!p.entrega) return Promise.reject(new Error('Falta la fecha de entrega.'));
    if (!auto) { asentarEdicion(); S.em = null; S.ep = null; }
    var id = previo ? previo.id : 'p' + uid(), doc = clone(p), antes = previo ? clone(previo) : null; p.id = id;
    S.pedidos = poner(S.pedidos, id, doc);
    return store.set('pedidos', id, doc)
      .then(function () { return aplicarMedias(p); })
      .then(function () { return antes ? revincularProduccion(p, antes) : null; })
      .then(function () { return Promise.all((antes && antes.entrega !== p.entrega ? [antes.entrega, p.entrega] : [p.entrega]).map(function (f) { return publicarLog(f); })); })
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
    (S.prod || []).slice(-3).forEach(function (o) { ejemplos.push(textoOrden(o, true)); });
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
      + '3. Planillas por sucursal (ej. DINO): arriba a la izquierda figura el cliente y cada COLUMNA es una sucursal (Rod del Busto, Salsipuedes, Alta Gracia, Ruta 20…); cada fila es un corte, con su código, y el número es lo que pide esa sucursal de ese corte, casi siempre en kilos. Devolvé UN PEDIDO POR CADA SUCURSAL que tenga algo pedido, nunca uno solo con todo sumado: cada sucursal sale en un camión distinto. cliente = el nombre del cliente seguido de la sucursal (ej. "DINO ROD DEL BUSTO"). En cada pedido, un corte por cada fila que tenga cantidad en esa columna, con la cantidad de ESA sucursal. Una sucursal con toda la columna vacía o en cero no se carga. La imagen puede traer más de una tabla del mismo cliente: son más sucursales. No tomes como sucursal la columna TOTAL KG ni como corte la fila "KG X SUCURSAL": sirven para controlar; si la suma de una columna no coincide con su "KG X SUCURSAL", avisalo en dudas de ese pedido. El texto de cada corte lleva la cantidad, el nombre del corte como figura, el código entre paréntesis y la sucursal entre comillas (ej. "100KG JAMON 4 MUSC (COD 341) “DINO ROD DEL BUSTO”"). Los embutidos (chorizo, morcilla, salchicha) van con orden=false.\n'
      + '4. Lista escrita a mano en una hoja suelta: cada renglón es un cliente seguido de una cantidad con "½" (ej.: "Molina 100 ½" = 100 medias reses para MOLINA). Un título subrayado arriba (ej. "San Juan") es la zona o el destino, no un cliente: ponelo en la nota de cada pedido. Los importes con "$" son precios: no los copies. Una aclaración entre paréntesis como "(grandes)" va en peso. Un número rodeado con un círculo al pie es el total de medias de la hoja: no es un pedido; si la suma de los renglones no coincide con ese total, avisalo en dudas del primer pedido. Marcas como "ok" o rayas no son pedidos.\n'
      + '5. Texto pegado de WhatsApp u otro mensaje: suele empezar con una frase general (ej. "pedido de cerdo para el martes por caja") que da la fecha de entrega y la unidad para todo el mensaje, y sigue con bloques separados por una línea en blanco: la primera línea de cada bloque es el cliente o la sucursal y las siguientes son "cantidad corte". Cada bloque es un pedido. Aplicá la unidad general a cada renglón ("por caja": "2 matambre" = 2 CAJAS). Si no se dice la unidad, escribí la cantidad sola y avisalo en dudas. "Pierna" es el rubro JAMON; conservá abreviaturas como "S/C" tal como vienen. Ignorá saludos y texto que no sea pedido. Si al pedirte la lectura te indican que todo el mensaje es de UN solo cliente y que los bloques son sus sucursales, devolvé igual un pedido por cada sucursal, con cliente = ese cliente seguido de la sucursal (ej. "CLIENTE MENENDEZ PIDAL") y ese mismo nombre entre comillas en cada renglón.\n\n'
      + 'QUÉ CARGAR, POR CADA PEDIDO\n'
      + '- cliente: en mayúsculas. Si coincide con uno de la lista de clientes conocidos, usá exactamente ese nombre.\n'
      + '- entrega: en formato AAAA-MM-DD. Resolvé fechas como "lun 05/10" con el año actual. Si solo dice un día de la semana ("para el martes"), es el próximo día con ese nombre contando desde mañana. Si no figura, dejala vacía.\n'
      + '- medias: cantidad de medias reses, número. 0 si no pide medias. Si un cliente figura en la planilla con 0 medias o con la cantidad en blanco, cargalo igual con medias 0: no lo saltees.\n'
      + '- peso: aclaración de peso de las medias (livianas, pesadas, rango de kg), o "".\n'
      + '- frio: "FRESCO" o "CONGELADO" cuando en cualquier parte de la imagen o del mensaje dice que la mercadería es fresca o congelada: en el título, el encabezado, el nombre de la planilla o de la hoja, una columna, una nota al margen, al lado del cliente o en la frase inicial de un mensaje. También valen las abreviaturas ("CONG.", "CGDO", "FCO", "FRESC."). Si lo dice una sola vez en general, vale para TODOS los pedidos de esa imagen o mensaje: ponelo en cada uno. Si no lo dice en ningún lado, "" (no lo supongas). Si en un mismo pedido hay cortes frescos y cortes congelados, dejá frio en "" y escribí FRESCO o CONGELADO dentro del texto de cada corte.\n'
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
        type: 'object', additionalProperties: false, required: ['cliente', 'entrega', 'medias', 'peso', 'frio', 'cortes', 'nota', 'dudas'],
        properties: {
          cliente: { type: 'string' }, entrega: { type: 'string', description: 'AAAA-MM-DD, o vacío si no figura' },
          medias: { type: 'number', description: 'Cantidad de medias reses; 0 si no pide' }, peso: { type: 'string' }, frio: { type: 'string', enum: ['', 'FRESCO', 'CONGELADO'], description: 'Si el pedido aclara fresco o congelado; vacío si no lo dice' },
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
      return cad.then(function () { return guardarPropuesta(q, auto).then(function () { ok.push(q); if (!auto) S.entrega = q.entrega; S.prop = S.prop.filter(function (x) { return x !== q; }); }, function (err) { q.error = err.message || 'No se pudo guardar.'; }); })
        .then(function () { return new Promise(function (r) { setTimeout(r, 30); }); });
    }, Promise.resolve()).then(function () { return ok; });
  }
  function mismoPedido(a, q) {
    var ca = (a.cortes || []).map(function (c) { return norm(c.corte) + '|' + norm(c.texto); }).sort().join('~');
    var cq = (q.cortes || []).filter(function (c) { return c.texto; }).map(function (c) { return norm(c.corte) + '|' + norm(c.texto); }).sort().join('~');
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
    return { tab: S.tab, porDefecto: habilSiguiente(hoy()), esperada: S.tab === 'medias' && S.sem ? S.sem : semanaActual() };
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
        nuevos.push({ k: uid(), cliente: p.cliente || '', entrega: /^\d{4}-\d{2}-\d{2}$/.test(p.entrega || '') ? p.entrega : ctx.porDefecto, medias: +p.medias || '', peso: p.peso || '', frio: frioDe(p.frio), nota: p.nota || '', origen: x.origen, foto: x.nombre,
          dudas: (p.dudas || []).filter(Boolean), cortes: (p.cortes || []).map(function (c) { return { corte: norm(c.corte), texto: c.texto || '', orden: c.orden !== false }; }) });
      });
      if (x.j.planilla && x.j.planilla.length) planillas.push(x.j.planilla);
    });
    nuevos = nuevos.filter(function (q) {
      var prev = (S.pedidos || []).filter(function (x) { return x.entrega === q.entrega && norm(x.cliente) === norm(q.cliente) && norm(q.cliente); });
      var igual = prev.filter(function (x) { return mismoPedido(x, q); })[0];
      if (igual) {
        // Mismo pedido que ya estaba: no se repite, pero si ahora trae fresco o congelado se le agrega.
        if (!q.frio || (igual.frio || '') === q.frio) { repetidos++; return false; }
        q.editaId = igual.id; q.cortes = clone(cortesDe(igual)); q.peso = igual.peso || q.peso; q.nota = igual.nota || q.nota; q.kg = igual.kg || ''; q.origen = igual.origen || q.origen;
        return true;
      }
      var soloMedias = prev.filter(function (x) { return !(x.cortes || []).length; })[0];
      if (soloMedias && !(q.cortes || []).some(function (c) { return c.texto; })) q.editaId = soloMedias.id;
      return true;
    });
    var txtRep = repetidos ? (repetidos === 1 ? ' 1 pedido ya estaba cargado y no se repitió.' : ' ' + repetidos + ' pedidos ya estaban cargados y no se repitieron.') : '';
    var directas = [], preguntar = 0;
    planillas.forEach(function (pl) {
      var leida = semanaLeida(pl);
      if (!leida || leida === ctx.esperada) directas.push(pl);
      else { (S.planPend = S.planPend || []).push({ dias: pl, leida: leida, esperada: ctx.esperada }); preguntar++; }
    });
    if (!nuevos.length && !planillas.length) {
      S.msg.fotos = errores.length ? '!' + errores.join(' ') : repetidos ? txtRep.trim() : '!No se encontraron pedidos para leer.';
      avisar(S.msg.fotos, 9000); refrescar(); return Promise.resolve();
    }
    return directas.reduce(function (cad, pl) {
      return cad.then(function () { return aplicarPlanilla(pl, ctx.esperada); }).then(function (r) { if (r) hechas.push(r); }, function () { errores.push('No se pudo guardar la planilla.'); });
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
      if (preguntar) partes.push('Falta elegir en qué semana va la planilla: está en Medias.');
      if (errores.length) partes.push(errores.join(' '));
      var m = (errores.length || (faltan && !ok.length) ? '!' : '') + partes.join(' ');
      S.msg.fotos = m; avisar(m, 10000);
      if (aca) {
        if (fs.length) S.entrega = fs[0];
        if (ctx.tab === 'medias' && fs.length) { S.mv = null; S.fm = habilAnterior(fs[0]); S.sem = lunesDe(S.fm); S.dia = Math.round((fecha(S.fm) - fecha(S.sem)) / 86400000); }
        if (preguntar) { irA('medias'); return; }
        if (faltan && S.tab !== 'pedidos') { irA('pedidos'); return; }
        if (hechas.length && !ok.length && !faltan) { S.sem = hechas[hechas.length - 1].lunes; S.dia = null; S.mv = null; S.msg.medias = partes[0] + ' Revisala y tocá Editar para corregir lo que haga falta.'; S.msg.fotos = ''; irA('medias'); return; }
      }
      releerEdicion();
      refrescar();
    });
  }
  function leerPegado() {
    var txt = String(S.pegarTxt || '').trim();
    if (!txt) { S.msg.fotos = '!Pegá primero el texto del pedido.'; pintarMsg('fotos'); return; }
    if (S.leyendo) return;
    var ctx = ctxCarga(), cli = String(S.pegarCli || '').toUpperCase().trim();
    S.leyendo = true; S.pegar = false; S.msg.fotos = 'Leyendo el texto…'; cargas.activas++; estadoCarga(); render();
    leerTexto(txt, cli).then(function (j) {
      S.leyendo = false; cargas.activas--; S.pegarTxt = ''; S.pegarCli = '';
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

  function propHTML(q, i) {
    var listaCortes = CORTES_BASE.slice(); (q.cortes || []).forEach(function (c) { if (c.corte && listaCortes.indexOf(c.corte) < 0) listaCortes.push(c.corte); });
    var h = '<div class="card">';
    h += '<div class="campos"><label class="campo"><span>Cliente</span><input type="text" id="q' + i + 'cliente" data-q="' + i + '" data-k="cliente" value="' + esc(q.cliente) + '" style="text-transform:uppercase"></label>'
      + '<label class="campo"><span>Entrega</span><input type="date" id="q' + i + 'entrega" data-q="' + i + '" data-k="entrega" value="' + esc(q.entrega || '') + '"></label>'
      + '<label class="campo"><span>Medias</span><input type="number" inputmode="numeric" id="q' + i + 'medias" data-q="' + i + '" data-k="medias" value="' + esc(q.medias) + '"></label>'
      + '<label class="campo"><span>Peso o aclaración</span><input type="text" id="q' + i + 'peso" data-q="' + i + '" data-k="peso" value="' + esc(q.peso || '') + '"></label>'
      + '<label class="campo"><span>Fresco o congelado</span><select id="q' + i + 'frio" data-q="' + i + '" data-k="frio">' + ['', 'FRESCO', 'CONGELADO'].map(function (x) { return '<option value="' + x + '"' + ((q.frio || '') === x ? ' selected' : '') + '>' + (x ? x.charAt(0) + x.slice(1).toLowerCase() : 'Sin aclarar') + '</option>'; }).join('') + '</select></label>'
      + '<label class="campo"><span>Kilos (opcional)</span><input type="number" inputmode="numeric" id="q' + i + 'kg" data-q="' + i + '" data-k="kg" value="' + esc(q.kg || '') + '"></label></div>';
    (q.cortes || []).forEach(function (c, j) {
      h += '<div class="cl"><select id="q' + i + 'c' + j + 'corte" data-q="' + i + '" data-j="' + j + '" data-k="corte" aria-label="Corte">' + listaCortes.map(function (x) { return '<option' + (x === c.corte ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>'
        + '<textarea rows="2" id="q' + i + 'c' + j + 'texto" data-q="' + i + '" data-j="' + j + '" data-k="texto" aria-label="Qué pide de este corte" style="text-transform:uppercase">' + esc(c.texto) + '</textarea>'
        + '<button class="btn x" data-act="q-quitar-corte" data-q="' + i + '" data-j="' + j + '" aria-label="Quitar corte">×</button></div>';
    });
    h += '<div class="acciones"><button class="btn sm" data-act="q-corte" data-q="' + i + '">+ Corte</button></div>'
      + '<label class="campo"><span>Nota</span><input type="text" id="q' + i + 'nota" data-q="' + i + '" data-k="nota" value="' + esc(q.nota || '') + '"></label>'
      + (q.error ? '<p class="small neg">' + esc(q.error) + '</p>' : '')
      + '<div class="acciones"><button class="btn pri" data-act="q-guardar" data-q="' + i + '">' + (q.editaId ? 'Guardar cambios' : 'Guardar pedido') + '</button><button class="btn" data-act="q-descartar" data-q="' + i + '">' + (q.editaId ? 'Cancelar' : 'Descartar') + '</button></div></div>';
    return h;
  }
  // Los tres caminos de carga: fotos, texto pegado o a mano.
  function cargaHTML(actMano) {
    var conIA = !!(S.ia && S.ia.clave) || !!(window.__mock && window.__mock.ia);
    var h = '<div class="acciones"><label class="btn pri" style="display:inline-flex;align-items:center' + (conIA ? '' : ';opacity:.45') + '">Subir fotos o capturas<input type="file" id="fotos" accept="image/*" multiple hidden' + (conIA ? '' : ' disabled') + '></label>'
      + '<button class="btn" data-act="q-pegar"' + (conIA ? '' : ' disabled') + '>Pegar texto</button>'
      + '<button class="btn" data-act="' + actMano + '">Cargar a mano</button><span class="guardado" id="g-fotos"></span></div>';
    if (S.pegar && conIA) h += '<div class="pegar"><label class="campo"><span>Mensaje con los pedidos</span><textarea id="pegar-txt" rows="9">' + esc(S.pegarTxt || '') + '</textarea></label>'
      + '<label class="campo"><span>Cliente, si todo el mensaje es de uno solo con varias sucursales (opcional)</span><input type="text" id="pegar-cli" value="' + esc(S.pegarCli || '') + '"></label>'
      + '<div class="acciones"><button class="btn pri" data-act="q-leer-texto">Leer</button><button class="btn" data-act="q-pegar">Cancelar</button></div></div>';
    if (!conIA) h += '<p class="small muted">Para leer fotos o texto falta cargar la clave de IA, en Pedidos, abajo, en Configuración.</p>';
    return h;
  }
  function cuandoEs(f) { return f === mas(hoy(), 1) ? 'mañana' : f === hoy() ? 'hoy' : 'el ' + tituloDe(f).toLowerCase(); }
  // Un pedido del listado: cerrado muestra el resumen; abierto, el desglose por corte.
  function pedidoHTML(p, m) {
    var cs = cortesDe(p).filter(function (c) { return c.texto; }), enP = cs.filter(function (c) { return fechaProdDe(m, p, c); }).length;
    var ab = !!S.abierto[p.id], sel = !!S.sel[p.id], cam = nombreCamion(p.entrega, p.camion), res = [], id = esc(p.id);
    if (+p.medias) res.push(n(+p.medias) + (+p.medias === 1 ? ' media' : ' medias') + (p.peso ? ' ' + esc(p.peso) : ''));
    if (cs.length) res.push(cs.length + (cs.length === 1 ? ' corte' : ' cortes'));
    var h = '<div class="ped' + (ab ? ' abierto' : '') + (sel ? ' sel' : '') + '"><div class="ped-cab">'
      + '<label class="chk"><input type="checkbox" data-sel="' + id + '"' + (sel ? ' checked' : '') + ' aria-label="Tildar el pedido de ' + esc(p.cliente) + ' para un camión"></label>'
      + '<button class="ped-tit" data-act="ped-abrir" data-id="' + id + '" aria-expanded="' + ab + '"><span class="nom">' + esc(p.cliente || 'Sin cliente') + '</span><span class="res">' + res.join(' · ') + (p.frio ? ' ' + frioBadge(p.frio) : '') + '</span>'
      + (cam ? '<span class="marcas"><span class="badge plain">' + esc(cam) + '</span></span>' : '') + '<span class="chev" aria-hidden="true">' + (ab ? '▴' : '▾') + '</span></button></div>';
    if (!ab) return h + '</div>';
    h += '<div class="ped-det"><div class="op-ped">';
    if (+p.medias) h += '<p class="lp"><span><b>Medias</b> ' + n(+p.medias) + (p.peso ? ' ' + esc(p.peso) : '') + '</span></p>';
    cs.forEach(function (c) {
      var f = fechaProdDe(m, p, c);
      h += '<p class="lp"><span><b>' + esc(c.corte) + '</b> ' + esc(c.texto) + '</span>' + (f
        ? '<span class="en"><span class="badge ok">En producción</span><button class="btn sm" data-act="c-quitar" data-id="' + id + '" data-k="' + esc(c.k) + '">Quitar</button></span>'
        : '<button class="btn sm pri" data-act="c-sumar" data-id="' + id + '" data-k="' + esc(c.k) + '">Sumar a producción</button>') + '</p>';
    });
    h += '</div>';
    if (p.nota) h += '<p class="small muted">' + esc(p.nota) + '</p>';
    h += '<div class="acciones">' + (cs.length - enP > 1 ? '<button class="btn sm" data-act="c-todos" data-id="' + id + '">Sumar todos a producción</button>' : '')
      + '<button class="btn sm" data-act="ped-editar" data-id="' + id + '">Editar</button>'
      + '<button class="btn sm rojo" data-act="ped-borrar" data-id="' + id + '" data-i="' + id + '">' + (S._c2 === 'ped-borrar' + p.id ? 'Tocá de nuevo para confirmar' : 'Quitar') + '</button></div>';
    return h + '</div></div>';
  }
  // Barra para mandar los pedidos tildados a un camión.
  function barraCamionHTML(f, tild) {
    var cams = camionesDe(f), lg = logDe(f), pubs = (lg && lg.pedidos) || [], fl = flota();
    var pesoT = tild.reduce(function (t, p) { return t + kgPedido(p).kg; }, 0);
    var libres = fl.filter(function (c) { return !cams.some(function (d) { return d.id === 'f' + c.id; }); }), escribir = S.camOtro || (!cams.length && !fl.length);
    var h = '<div class="cam-barra"><strong>' + tild.length + (tild.length === 1 ? ' tildado' : ' tildados') + ' · ≈ ' + n(pesoT) + ' kg</strong>';
    if (cams.length || fl.length) h += '<select id="cam-a" aria-label="Elegir el camión"><option value="">Elegí el camión…</option>'
      + cams.map(function (c) { var t = capTxt(c, cargaDe(pubs, c.id)); return '<option value="d:' + esc(c.id) + '">' + esc(c.nombre) + (t ? ' — ' + esc(t) : '') + '</option>'; }).join('')
      + libres.map(function (c) { return '<option value="f:' + esc(c.id) + '">' + esc(c.nombre) + (+c.kg ? ' — ' + n(+c.kg) + ' kg libres' : '') + '</option>'; }).join('')
      + '<option value="nuevo">Otro camión…</option></select>';
    if (escribir) h += '<input type="text" id="cam-nombre" value="' + esc(S.camNombre || '') + '" placeholder="Nombre del camión" aria-label="Nombre del camión">'
      + '<input type="number" inputmode="numeric" id="cam-kg" class="n" value="' + esc(S.camKg || '') + '" placeholder="Capacidad kg" aria-label="Capacidad en kilos">'
      + '<input type="text" id="cam-nota" value="' + esc(S.camNota || '') + '" placeholder="Nota" aria-label="Nota del camión">'
      + '<button class="btn pri" data-act="cam-crear">Armar camión</button>';
    return h + (tild.some(function (p) { return p.camion; }) ? '<button class="btn" data-act="cam-sacar">Sacar del camión</button>' : '')
      + '<button class="btn lnk" data-act="sel-nada">Destildar</button></div>';
  }
  function renderPedidos() {
    if (S.tab !== 'pedidos') return render();
    var el = $('view-pedidos');
    if (!S.editor) { el.innerHTML = '<div class="panel"><p class="state">Para cargar pedidos hay que ingresar con una cuenta autorizada.</p></div>'; return; }
    var h = '<div class="panel carga"><h2>Cargar pedidos</h2>' + cargaHTML('q-nuevo');
    var nuevas = S.prop.filter(function (x) { return !x.editaId; });
    if (nuevas.length) h += S.prop.map(function (q, i) { return q.editaId ? '' : propHTML(q, i); }).join('') + (nuevas.length > 1 ? '<div class="acciones"><button class="btn pri" data-act="q-todos">Guardar todos</button>' + botonBorrar('q-descartar-todos', null, 'Descartar todos', '') + '</div>' : '');
    h += '</div>';

    S.prop.forEach(function (q, k) { if (q.editaId) h += '<div class="panel"><h3>Editando: ' + esc(q.cliente || 'pedido') + '</h3>' + propHTML(q, k) + '</div>'; });

    // Un día debajo del otro, desde hoy.
    var hy = hoy(), dias = {}, m = enProduccion();
    if (esHabil(hy)) dias[hy] = 1;
    dias[habilSiguiente(hy)] = 1;
    (S.pedidos || []).forEach(function (p) { if (p.entrega && p.entrega >= hy) dias[p.entrega] = 1; });
    if (S.pedDia) dias[S.pedDia] = 1;
    Object.keys(dias).sort().forEach(function (f) {
      var lista = (S.pedidos || []).filter(function (p) { return p.entrega === f; }), tild = S.selDia === f ? lista.filter(function (p) { return S.sel[p.id]; }) : [];
      h += '<section class="dia-ped" id="dia-' + f + '"><div class="dia-cab"><h2 class="dia-tit">' + esc(tituloDe(f)) + (f === hy ? ' <span class="tag">hoy</span>' : f === mas(hy, 1) ? ' <span class="tag">mañana</span>' : '') + '</h2>'
        + (lista.length ? botonBorrar('ped-borrar-todos', f, 'Eliminar todos los pedidos') : '') + '</div>';
      if (tild.length) h += barraCamionHTML(f, tild);
      h += lista.length ? '<div class="peds">' + lista.map(function (p) { return pedidoHTML(p, m); }).join('') + '</div>' : '<p class="muted sin">Sin pedidos.</p>';
      h += '</section>';
    });

    h += '<div class="panel"><details' + (S._conf ? ' open' : '') + '><summary>Configuración</summary><div class="campos">'
      + '<label class="campo"><span>Clave de IA (Anthropic)</span><input type="password" id="cfg-clave" autocomplete="off" placeholder="' + (S.ia && S.ia.clave ? 'Cargada. Escribí otra para cambiarla.' : 'sk-ant-…') + '"></label>'
      + '<label class="campo"><span>Desposte habitual (medias por día)</span><input type="number" inputmode="numeric" id="cfg-desposte" value="' + esc(S.config.desposteHabitual || 750) + '"></label>'
      + '<label class="campo"><span>Capacidad de cámaras (medias)</span><input type="number" inputmode="numeric" id="cfg-cap" value="' + esc(S.config.capacidadCamara || '') + '"></label></div>'
      + '<div class="acciones"><button class="btn" data-act="cfg-guardar">Guardar configuración</button><span class="guardado" id="g-cfg"></span>'
      + ((S.pedidos || []).length ? botonBorrar('ped-borrar-total', null, 'Quitar todos los pedidos (' + S.pedidos.length + ')') : '') + '</div></details></div>';
    el.innerHTML = h;
    pintarMsg('fotos'); pintarMsg('cfg');
    if (S.pedDia) { var d = $('dia-' + S.pedDia); S.pedDia = null; if (d && d.scrollIntoView) d.scrollIntoView(); }
  }

  /* ---------- logística ---------- */
  // Lista para pasar un pedido a un camión: los del día y los del stock que todavía no se usaron.
  function opcionesCamion(p, cams) {
    var libres = flota().filter(function (c) { return !cams.some(function (d) { return d.id === 'f' + c.id; }); });
    if (!cams.length && !libres.length) return '';
    return '<select data-pasar="' + esc(p.id) + '" aria-label="Pasar ' + esc(p.cliente) + ' a un camión"><option value="">Pasar a un camión…</option>'
      + cams.map(function (c) { return '<option value="d:' + esc(c.id) + '">' + esc(c.nombre) + '</option>'; }).join('')
      + libres.map(function (c) { return '<option value="f:' + esc(c.id) + '">' + esc(c.nombre) + (+c.kg ? ' (' + n(+c.kg) + ' kg)' : '') + '</option>'; }).join('') + '</select>';
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
        ;
      return h + '</div>';
    }
    if (!fl.length) return h + '<p class="muted">Sin camiones cargados.</p></div>';
    h += '<table class="pl stk-cam"><thead><tr><th>Camión</th><th>Capacidad</th><th>Cargado</th><th>Queda</th></tr></thead><tbody>' + fl.map(function (c) {
      var dia = cams.filter(function (d) { return d.id === 'f' + c.id; })[0], cap = dia && +dia.kg ? +dia.kg : +c.kg || 0, car = dia ? cargaDe(peds, dia.id) : 0, libre = cap - car;
      return '<tr><td>' + esc(c.nombre) + (c.nota ? ' <span class="small muted" style="text-transform:none;font-weight:400">' + esc(c.nota) + '</span>' : '') + '</td><td>' + (cap ? n(cap) : '—') + '</td><td>' + (car ? n(car) : '') + '</td><td' + (cap && libre < 0 ? ' class="neg"' : '') + '>' + (cap ? n(libre) : '—') + '</td></tr>';
    }).join('') + '</tbody></table>';
    return h + '</div>';
  }
  function logPedidoHTML(p, cam, cams) {
    var h = '<div class="log-ped"><div class="log-cab"><strong>' + esc(p.cliente || 'Sin cliente') + '</strong>'
      + (+p.medias ? '<span class="med">' + n(+p.medias) + (+p.medias === 1 ? ' media' : ' medias') + (p.peso ? ' <span class="small muted">' + esc(p.peso) + '</span>' : '') + '</span>' : '')
      + frioBadge(p.frio)
      + '<span class="small muted">' + esc(kgTxt({ kg: +p.kg || 0, falta: p.kgFalta, manual: p.kgManual })) + '</span>';
    if (S.editor) h += '<span class="log-acc">' + (cam
      ? '<button class="btn sm" data-act="cam-quitar-ped" data-id="' + esc(p.id) + '">Sacar</button>'
      : opcionesCamion(p, cams)) + '</span>';
    h += '</div>';
    if ((p.cortes || []).length) h += '<div class="log-cortes">' + p.cortes.map(function (c) { return '<p><u>' + esc(c.corte) + '</u>: ' + esc(c.texto) + '</p>'; }).join('') + '</div>';
    if (p.nota) h += '<p class="small muted">' + esc(p.nota) + '</p>';
    return h + '</div>';
  }
  function resumenLog(lista) {
    var tm = lista.reduce(function (t, p) { return t + (+p.medias || 0); }, 0), tc = lista.reduce(function (t, p) { return t + (p.cortes || []).length; }, 0);
    return lista.length + (lista.length === 1 ? ' pedido' : ' pedidos') + (tm ? ' · ' + n(tm) + ' medias' : '') + (tc ? ' · ' + tc + (tc === 1 ? ' renglón de cortes' : ' renglones de cortes') : '');
  }
  function renderLogistica() {
    var el = $('view-logistica');
    if (cargando(el, S.prod || S.faena)) return;
    if (!S.fl) S.fl = fmInicial();
    var f = S.fl, lg = logDe(f), peds = (lg && lg.pedidos) || [], cams = (lg && lg.camiones) || [];
    var h = '<div class="nav"><button class="btn step" data-act="fl" data-d="-1" aria-label="Día anterior">‹</button><span class="tit">' + esc(tituloDe(f)) + '</span><button class="btn step" data-act="fl" data-d="1" aria-label="Día siguiente">›</button>'
      + '<input type="date" id="l-fecha" value="' + esc(f) + '" aria-label="Ir a una fecha">'
      + (peds.length ? '<button class="btn" data-act="imprimir">Imprimir</button>' : '')
      + (S.editor ? '<button class="btn" data-act="cam-nuevo">+ Camión para este día</button><span class="guardado" id="g-log"></span>' : '') + '</div>';
    if (!peds.length && !cams.length) {
      h += '<div class="panel"><p class="state">No hay pedidos para entregar este día.</p>' + (S.editor ? '<div class="acciones" style="justify-content:center"><button class="btn pri" data-act="ir-pedidos" data-f="' + f + '">Ir a los pedidos de este día</button></div>' : '') + '</div>';
      if (S.editor || flota().length) h += stockCamionesHTML(f, peds, cams);
      el.innerHTML = h; pintarMsg('log'); pintarMsg('flota'); return;
    }
    h += '<p class="muted">Para entregar ' + esc(cuandoEs(f)) + ': ' + resumenLog(peds) + (cams.length ? ' · ' + cams.length + (cams.length === 1 ? ' camión' : ' camiones') : '') + '.</p>';
    cams.forEach(function (cam, k) {
      var suyos = peds.filter(function (p) { return p.camion === cam.id; }), ed = S.ec === cam.id;
      var car = cargaDe(peds, cam.id), ct = capTxt(cam, car), pasa = +cam.kg > 0 && car > +cam.kg;
      h += '<section class="cam' + (pasa ? ' pasa' : '') + '"><header class="cam-cab"><span class="cam-num">Camión ' + (k + 1) + '</span><h2>' + esc(cam.nombre) + '</h2>'
        + (cam.nota && !ed ? '<span class="cam-nota">' + esc(cam.nota) + '</span>' : '')
        + (S.editor && !ed ? '<span class="log-acc"><button class="btn sm" data-act="cam-editar" data-id="' + esc(cam.id) + '">Editar</button>' + botonBorrar('cam-borrar', cam.id, 'Borrar camión') + '</span>' : '') + '</header>';
      h += '<div class="cam-datos"><div class="cam-res"><b>' + suyos.length + '</b><span>' + (suyos.length === 1 ? 'pedido' : 'pedidos') + '</span></div>'
        + (ct ? '<div class="cam-carga"><p class="cam-cap' + (pasa ? ' neg' : '') + '">' + esc(ct) + '</p>' + (+cam.kg > 0 ? '<div class="medidor' + (pasa ? ' pasa' : '') + '" role="img" aria-label="' + esc(ct) + '"><i style="width:' + Math.min(100, Math.round(car / +cam.kg * 100)) + '%"></i></div>' : '') + '</div>' : '') + '</div>';
      h += '<div class="cam-cuerpo">';
      if (ed) h += '<div class="campos"><label class="campo"><span>Nombre</span><input type="text" id="cam-e-nombre" value="' + esc(S.ecNombre || '') + '"></label><label class="campo"><span>Capacidad kg</span><input type="number" inputmode="numeric" id="cam-e-kg" value="' + esc(S.ecKg || '') + '"></label><label class="campo"><span>Nota (chofer, hora…)</span><input type="text" id="cam-e-nota" value="' + esc(S.ecNota || '') + '"></label></div>'
        + '<div class="acciones"><button class="btn pri" data-act="cam-guardar">Guardar</button><button class="btn" data-act="cam-cancelar">Cancelar</button></div>';
      h += suyos.length ? '<div class="log-lista">' + suyos.map(function (p) { return logPedidoHTML(p, cam, cams); }).join('') + '</div>' : '<p class="muted">Sin pedidos.</p>';
      h += '</div></section>';
    });
    var sueltos = peds.filter(function (p) { return !p.camion; });
    if (sueltos.length) h += '<section class="cam suelto"><header class="cam-cab"><h2>' + (cams.length ? 'Sin camión' : 'Pedidos del día') + '</h2><span class="cam-nota">' + esc(resumenLog(sueltos)) + '</span></header>'
      + '<div class="cam-cuerpo"><div class="log-lista">' + sueltos.map(function (p) { return logPedidoHTML(p, null, cams); }).join('') + '</div></div></section>';
    if (S.editor || flota().length) h += stockCamionesHTML(f, peds, cams);
    el.innerHTML = h; pintarMsg('log'); pintarMsg('flota');
  }

  /* ---------- inicio ---------- */
  function renderInicio() {
    var el = $('view-inicio');
    if (cargando(el, S.prod && S.faena)) return;
    var h = hoy(), f = fechaProdInicial(), o = prodDe(f), sig = habilSiguiente(h), html = '<div class="home">';
    if (S.editor) {
      var np = (S.pedidos || []).filter(function (p) { return p.entrega === sig; }).length;
      html += '<button class="tile" data-act="ir" data-tab="pedidos"><b>Pedidos</b><span>Cargar pedidos, sumar cortes y armar camiones</span><span class="dato">' + np + (np === 1 ? ' pedido' : ' pedidos') + ' para el ' + esc(tituloDe(sig).toLowerCase()) + '</span></button>';
    }
    var nl = o ? (o.cortes || []).reduce(function (t, c) { return t + c.lineas.length; }, 0) : 0;
    var dp = o ? (nl ? nl + (nl === 1 ? ' renglón' : ' renglones') + ' · ' : '') + (o.estado === 'borrador' ? 'borrador, todavía sin confirmar' : 'confirmada') : 'Todavía no hay nada cargado';
    html += '<button class="tile" data-act="ir" data-tab="produccion"><b>Producción</b><span>Planilla del ' + esc(tituloDe(f).toLowerCase()) + '</span><span class="dato">' + esc(dp) + '</span></button>';
    var lg = logDe(f), lp = (lg && lg.pedidos) || [], lc = (lg && lg.camiones) || [];
    var dl = lp.length ? lp.length + (lp.length === 1 ? ' pedido' : ' pedidos') + (lc.length ? ' en ' + lc.length + (lc.length === 1 ? ' camión' : ' camiones') : ', sin camiones armados') : 'Todavía no hay pedidos para entregar';
    html += '<button class="tile" data-act="ir" data-tab="logistica"><b>Logística</b><span>Camiones del ' + esc(tituloDe(f).toLowerCase()) + '</span><span class="dato">' + esc(dl) + '</span></button>';
    var fm = fmInicial(), x = diaFaena(fm), cl = x ? conMedias(x.d) : [];
    var dm = cl.length ? cl.length + (cl.length === 1 ? ' cliente · ' : ' clientes · ') + animales(cl.reduce(function (t, r) { return t + (+r.cant || 0); }, 0)) : 'Todavía no hay ventas cargadas';
    html += '<button class="tile" data-act="ir" data-tab="medias"><b>Medias</b><span>Clientes del ' + esc(tituloDe(fm).toLowerCase()) + '</span><span class="dato">' + esc(dm) + '</span></button>';
    el.innerHTML = html + '</div>';
  }
  // Volver al inicio deja todo parado en el día de hoy.
  function alInicio() { asentarEdicion(); S.em = null; S.ep = null; S.fechaFija = false; S.fecha = null; S.sem = null; S.dia = null; S.entrega = null; S.fm = null; S.mv = null; S.fl = null; S.ec = null; S.ef = false; }

  /* ---------- estados, sesión y navegación ---------- */
  function cargando(el, data) {
    var msg = S.status === 'loading' && !data ? 'Cargando…' : S.status === 'error' && !data ? 'No se pudieron cargar los datos. Revisá la conexión y volvé a abrir la app.' : '';
    if (msg) { el.innerHTML = '<div class="panel"><p class="state">' + msg + '</p></div>'; return true; }
    return false;
  }
  function render() {
    $('stamp').textContent = (S.config.actualizado ? 'Actualizado: ' + S.config.actualizado : '') + (S.fuente === 'cache' ? ' · sin conexión' : '');
    var ht = $('hoy-txt'); if (ht) ht.textContent = 'Hoy es ' + tituloDe(hoy()).toLowerCase();
    var e = $('sesion');
    if (!store || !store.signIn) e.innerHTML = '';
    else if (!S.user) e.innerHTML = '<button class="btn sm lnk" data-act="ingresar">Ingresar para cargar</button>';
    else e.innerHTML = '<span>' + esc(S.user.email) + (S.editor ? '' : ' · sin permiso para cargar') + '</span><button class="btn sm lnk" data-act="salir">Salir</button>';
    $('tab-pedidos').hidden = !S.editor;
    if (S.tab === 'pedidos' && !S.editor) S.tab = 'inicio';
    TABS.forEach(function (t) { $('view-' + t).hidden = S.tab !== t; if (S.tab !== t) $('view-' + t).innerHTML = ''; $('tab-' + t).setAttribute('aria-selected', String(S.tab === t)); });
    if (S.tab === 'medias') renderMedias(); else if (S.tab === 'pedidos') renderPedidos(); else if (S.tab === 'produccion') renderProduccion(); else if (S.tab === 'logistica') renderLogistica(); else renderInicio();
  }
  // Cuando llegan datos nuevos no se redibuja la pantalla en la que se está escribiendo.
  function renderDatos() {
    if (S.tab === 'medias' && S.em) return pintarSumas();
    if (S.tab === 'produccion' && S.ep) return;
    if (S.tab === 'pedidos' && (S.prop.length || escribiendo())) return;
    if (S.tab === 'logistica' && (S.ec || S.ef)) return;
    render();
  }
  function irA(tab) { S.tab = tab; try { history.replaceState(null, '', '#' + tab); } catch (err) {} render(); window.scrollTo(0, 0); }

  document.querySelector('.top').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (!b) return; e.preventDefault(); if (b.dataset.tab === 'inicio') alInicio(); if (S.ep) { asentarEdicion(); S.ep = null; } S.ec = null; S.msg.fotos = ''; S.msg.log = ''; S.pegar = false; if (!S.leyendo) { S.pegarTxt = ''; S.pegarCli = ''; } irA(b.dataset.tab); });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var a = b.dataset.act, D = b.dataset, o, c;
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
    else if (a === 'pl-cancelar') { S.planPend.shift(); S.msg.medias = ''; render(); }
    else if (a === 'pl-elegir') {
      var pp = S.planPend[0]; if (!pp || S._plOcupado) return;
      S._plOcupado = true; S.msg.medias = 'Guardando…'; pintarMsg('medias');
      aplicarPlanilla(pp.dias, D.l).then(function (r) {
        S._plOcupado = false; S.planPend.shift();
        if (r) { S.sem = r.lunes; S.dia = null; S.mv = null; S.msg.medias = 'Planilla cargada en la semana del ' + etiquetaSemana(r.lunes) + ': ' + r.dias + (r.dias === 1 ? ' día' : ' días') + ', ' + r.clientes + ' clientes. Revisala y tocá Editar para corregir lo que haga falta.'; }
        else S.msg.medias = '!La planilla no traía datos para cargar.';
        render();
      }, function () { S._plOcupado = false; S.msg.medias = '!No se pudo guardar la planilla. Revisá la conexión.'; pintarMsg('medias'); });
    }
    else if (a === 'fm') { var y = S.fm; do { y = mas(y, +D.d); } while (!esHabil(y)); S.fm = y; render(); }
    else if (a === 'm-semana' || a === 'm-editar-dia') {
      S.mv = 'semana'; S.sem = lunesDe(S.fm); S.dia = Math.round((fecha(S.fm) - fecha(S.sem)) / 86400000);
      if (a === 'm-editar-dia') { var ya = semDe(S.sem); S.em = { lunes: S.sem, doc: ya ? clone(ya) : semanaNueva(S.sem) }; S.msg.medias = ''; if (!ya) guardar('medias', true); }
      render();
    }
    else if (a === 'm-dia') { if (S.em) guardar('medias', true); S.em = null; S.mv = 'dia'; if (S.sem && S.dia != null) S.fm = mas(S.sem, S.dia); render(); }
    else if (a === 'sem') { S.msg.fotos = ''; S.msg.medias = ''; if (S.em) guardar('medias', true); S.em = null; S.sem = mas(S.sem, +D.d); S.dia = null; render(); }
    else if (a === 'dia') { S.dia = +D.i; var g = document.querySelector('.dias'); if (g) g.dataset.sel = D.i; document.querySelectorAll('.dtabs .btn').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.i === D.i)); }); }
    else if (a === 'm-editar') { if (S.em) { guardar('medias', true); S.em = null; } else { S.em = { lunes: S.sem, doc: clone(semDe(S.sem)) }; S.msg.medias = ''; } render(); }
    else if (a === 'm-nueva') { S.em = { lunes: S.sem, doc: semanaNueva(S.sem) }; guardar('medias', true); render(); }
    else if (a === 'm-agregar') { S.em.doc.dias[+D.i][D.m].push(D.m === 'faena' ? { origen: '', propios: 0, usuarios: 0 } : { cliente: '', cant: 0 }); render(); var ult = S.em.doc.dias[+D.i][D.m].length - 1, foco = $((D.m === 'faena' ? 'f' : 'c') + D.i + '-' + ult + (D.m === 'faena' ? 'o' : 'c')); if (foco) foco.focus(); }
    else if (a === 'm-vaciar') { if (!confirma('m-vaciar' + D.i)) { render(); return; } var dv = S.em.doc.dias[+D.i]; dv.faena = [{ origen: '', propios: 0, usuarios: 0 }]; dv.clientes = []; guardar('medias'); render(); }
    else if (a === 'm-borrar-semana') { if (!confirma('m-borrar-semana')) { render(); return; } clearTimeout(timers.medias); var lb = S.em.lunes; S.em = null; S.faena = (S.faena || []).filter(function (x) { return x.id !== lb; }); store.del('faena', lb).then(tocar, function () {}); render(); }
    else if (a === 'm-quitar') { S.em.doc.dias[+D.i][D.m].splice(+D.r, 1); guardar('medias'); render(); }

    // producción
    else if (a === 'fecha') { S.fechaFija = true; if (S.ep) guardar('prod', true); S.ep = null; var x = S.fecha; do { x = mas(x, +D.d); } while (!esHabil(x)); S.fecha = x; render(); }
    else if (a === 'p-nueva') { S.fechaFija = true; S.ep = { fecha: S.fecha, doc: prodVacia(S.fecha) }; S.ep.base = clone(S.ep.doc); S.msg.prod = ''; guardar('prod', true); render(); var pn = $('p-doc'); if (pn) { pn.focus(); pn.setSelectionRange(pn.value.length, pn.value.length); } }
    else if (a === 'p-editar') { S.fechaFija = true; if (S.ep) { guardar('prod', true); S.ep = null; } else { S.ep = { fecha: S.fecha, doc: clone(prodDe(S.fecha)) }; S.ep.base = clone(S.ep.doc); S.msg.prod = ''; } render(); if (S.ep) { var pd = $('p-doc'); if (pd) { pd.focus(); pd.setSelectionRange(0, 0); window.scrollTo(0, 0); } } }
    else if (a === 'p-borrar' && S.ep) { if (!confirma('p-borrar')) { render(); return; } clearTimeout(timers.prod); var fb = S.ep.fecha; S.ep = null; S.prod = (S.prod || []).filter(function (x) { return x.id !== fb; }); store.del('produccion', fb).then(tocar, function () {}); render(); }
    else if (a === 'p-estado' && S.ep) { S.ep.doc.estado = D.v; S.ep.base = clone(S.ep.doc); guardar('prod', true); render(); }

    // pedidos: carga
    else if (a === 'q-pegar') { S.pegar = !S.pegar; if (!S.pegar) { S.pegarTxt = ''; S.pegarCli = ''; } S.msg.fotos = ''; renderPedidos(); var ft = $('pegar-txt'); if (ft) ft.focus(); }
    else if (a === 'q-leer-texto') { leerPegado(); }
    else if (a === 'q-nuevo') { S.prop.push(pedidoVacio()); renderPedidos(); var fq = $('q' + (S.prop.length - 1) + 'cliente'); if (fq) fq.focus(); }
    else if (a === 'q-corte') { S.prop[+D.q].cortes.push({ corte: CORTES_BASE[0], texto: '', orden: true }); renderPedidos(); }
    else if (a === 'q-quitar-corte') { S.prop[+D.q].cortes.splice(+D.j, 1); renderPedidos(); }
    else if (a === 'q-descartar-todos') { if (!confirma('q-descartar-todos')) { renderPedidos(); return; } S.prop = S.prop.filter(function (x) { return x.editaId; }); S.msg.fotos = ''; renderPedidos(); }
    else if (a === 'q-descartar') { S.prop.splice(+D.q, 1); renderPedidos(); }
    else if (a === 'q-guardar' || a === 'q-todos') {
      var cuales = a === 'q-todos' ? S.prop.filter(function (x) { return !x.editaId; }) : [S.prop[+D.q]];
      S.msg.fotos = 'Guardando…'; pintarMsg('fotos');
      guardarVarios(cuales, false).then(function () { S.msg.fotos = S.prop.some(function (x) { return x.error; }) ? '!Quedaron pedidos sin guardar: revisalos.' : 'Guardado.'; renderPedidos(); });
    }

    // pedidos: listado
    else if (a === 'ped-abrir') { S.abierto[D.id] = !S.abierto[D.id]; S.pedDia = null; renderPedidos(); }
    else if (a === 'c-sumar' || a === 'c-quitar' || a === 'c-todos') {
      var pc = pedidoDe(D.id); if (!pc || S._ocup) return;
      var cc = cortesDe(pc), uno = cc.filter(function (c) { return c.k === D.k; })[0];
      S._ocup = true;
      (a === 'c-quitar' ? quitarCorte(pc, uno) : sumarCortes(pc, a === 'c-todos' ? cc : [uno])).then(function () { S._ocup = false; renderPedidos(); }, function () { S._ocup = false; S.msg.fotos = '!No se pudo guardar. Revisá la conexión.'; renderPedidos(); });
      renderPedidos();
    }
    else if (a === 'ped-editar') {
      var pe = pedidoDe(D.id);
      if (pe && !S.prop.some(function (x) { return x.editaId === pe.id; })) S.prop.push({ k: uid(), editaId: pe.id, cliente: pe.cliente || '', entrega: pe.entrega || '', medias: pe.medias || '', peso: pe.peso || '', frio: pe.frio || '', nota: pe.nota || '', kg: pe.kg || '', origen: pe.origen || 'manual', dudas: (pe.dudas || []).slice(), cortes: clone(cortesDe(pe)) });
      S.msg.fotos = ''; renderPedidos(); var fe = $('q' + (S.prop.length - 1) + 'cliente'); if (fe) fe.focus();
    }
    else if (a === 'ped-borrar') {
      if (!confirma('ped-borrar' + D.id)) { renderPedidos(); return; }
      var pb = pedidoDe(D.id); S.prop = S.prop.filter(function (x) { return x.editaId !== D.id; });
      if (pb) borrarPedido(pb).then(function () { tocar(); refrescar(); }, function () { S.msg.fotos = '!No se pudo quitar.'; refrescar(); });
      renderPedidos();
    }
    else if (a === 'ped-borrar-todos') {
      if (!confirma('ped-borrar-todos' + D.i)) { renderPedidos(); return; }
      borrarPedidos((S.pedidos || []).filter(function (x) { return x.entrega === D.i; })).then(function () { tocar(); refrescar(); }, function () { S.msg.fotos = '!No se pudieron eliminar todos.'; refrescar(); });
      renderPedidos();
    }
    else if (a === 'ped-borrar-total') {
      if (!confirma('ped-borrar-total')) { renderPedidos(); return; }
      S.prop = [];
      borrarPedidos((S.pedidos || []).slice()).then(function () { tocar(); S.msg.fotos = 'Se quitaron todos los pedidos.'; renderPedidos(); }, function () { S.msg.fotos = '!No se pudieron quitar todos.'; renderPedidos(); });
      renderPedidos();
    }
    else if (a === 'e-dia') { var ye = S.entrega; do { ye = mas(ye, +D.d); } while (!esHabil(ye)); S.entrega = ye; S.sel = {}; renderPedidos(); }
    else if (a === 'sel-nada') { S.sel = {}; renderPedidos(); }

    // camiones
    else if (a === 'cam-crear' || a === 'cam-sacar') {
      var idsT = (S.pedidos || []).filter(function (p) { return p.entrega === S.selDia && S.sel[p.id]; }).map(function (p) { return p.id; });
      if (!idsT.length) return;
      var hecho = function () { S.sel = {}; S.camNombre = ''; S.camNota = ''; renderPedidos(); }, mal = function () { S.msg.fotos = '!No se pudo guardar el camión. Revisá la conexión.'; renderPedidos(); };
      if (a === 'cam-crear') crearCamion(S.selDia, S.camNombre, S.camNota, idsT, S.camKg).then(function (cam) { S.msg.fotos = avisoCamion(S.selDia, cam.id, idsT.length); S.camKg = ''; S.camOtro = false; hecho(); }, mal);
      else asignarCamion(S.selDia, idsT, '').then(hecho, mal);
    }
    else if (a === 'fl') { var yl = S.fl; do { yl = mas(yl, +D.d); } while (!esHabil(yl)); S.fl = yl; S.ec = null; S.msg.log = ''; render(); }
    else if (a === 'cam-nuevo') { crearCamion(S.fl, '', '', []).then(function (cam) { S.ec = cam.id; S.ecNombre = cam.nombre; S.ecNota = ''; S.ecKg = ''; render(); var fn = $('cam-e-nombre'); if (fn) { fn.focus(); fn.select(); } }, function () { S.msg.log = '!No se pudo crear el camión.'; pintarMsg('log'); }); }
    else if (a === 'cam-editar') { var ce = camionesDe(S.fl).filter(function (c) { return c.id === D.id; })[0]; if (ce) { S.ec = ce.id; S.ecNombre = ce.nombre; S.ecNota = ce.nota || ''; S.ecKg = ce.kg || ''; render(); var fn2 = $('cam-e-nombre'); if (fn2) fn2.focus(); } }
    else if (a === 'cam-cancelar') { S.ec = null; render(); }
    else if (a === 'cam-guardar') { var idc = S.ec; S.ec = null; cambiarCamion(S.fl, idc, S.ecNombre, S.ecNota, S.ecKg).then(render, function () { S.msg.log = '!No se pudo guardar.'; render(); }); render(); }
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
      cfg.desposteHabitual = +$('cfg-desposte').value || 750; cfg.capacidadCamara = +$('cfg-cap').value || 0; cfg.actualizado = ahoraTxt();
      tareas.push(store.set('config', 'general', cfg));
      if (clave) tareas.push(store.set('privado', 'ia', { clave: clave, modelo: (S.ia && S.ia.modelo) || IA_MODELO }));
      S.msg.cfg = 'Guardando…'; pintarMsg('cfg');
      Promise.all(tareas).then(function () { S.msg.cfg = 'Guardado.'; if (clave) S.ia = { clave: clave, modelo: (S.ia && S.ia.modelo) || IA_MODELO }; renderPedidos(); }, function () { S.msg.cfg = '!No se pudo guardar.'; pintarMsg('cfg'); });
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target, D = t.dataset;
    if (t.id === 'pegar-cli') { S.pegarCli = t.value; return; }
    if (t.id === 'pegar-txt') { S.pegarTxt = t.value; if (S.msg.fotos) { S.msg.fotos = ''; pintarMsg('fotos'); } return; }
    if (t.id === 'cam-nombre') { S.camNombre = t.value; return; }
    if (t.id === 'cam-nota') { S.camNota = t.value; return; }
    if (t.id === 'cam-kg') { S.camKg = t.value; return; }
    if (t.id === 'cam-e-kg') { S.ecKg = t.value; return; }
    if (D.fl != null && S.ef) { var ft = flota(); if (ft[+D.fl]) { ft[+D.fl][D.k] = D.k === 'kg' ? (t.value === '' ? '' : +t.value || 0) : t.value; S.config.flota = ft; guardarConfig(); } return; }
    if (t.id === 'cfg-kgmedia' || t.id === 'cfg-kgcaja') { S.config[t.id === 'cfg-kgmedia' ? 'kgMedia' : 'kgCaja'] = +t.value || 0; guardarConfig(); return; }
    if (t.id === 'cam-e-nombre') { S.ecNombre = t.value; return; }
    if (t.id === 'cam-e-nota') { S.ecNota = t.value; return; }
    if (D.m && S.em) { S.em.doc.dias[+D.i][D.m][+D.r][D.k] = t.value; guardar('medias'); pintarSumas(); }
    else if (t.id === 'm-stock' && S.em) { S.em.doc.stockInicial = t.value === '' ? null : t.value; guardar('medias'); pintarSumas(); }
    else if (t.id === 'p-doc' && S.ep) { S.ep.doc = parsearOrden(t.value, S.ep.base || S.ep.doc); crecer(t); guardar('prod'); }
    else if (D.q != null && S.prop[+D.q]) {
      var q = S.prop[+D.q];
      if (D.j != null) q.cortes[+D.j][D.k] = t.value; else q[D.k] = t.value;
      q.error = '';
    }
  });
  // Configuración queda abierta o cerrada como la dejó quien la usa, aunque se redibuje la pantalla.
  document.addEventListener('toggle', function (e) { if (e.target && e.target.tagName === 'DETAILS') S._conf = e.target.open; }, true);
  document.addEventListener('change', function (e) {
    var t = e.target, D = t.dataset;
    if (t.id === 'p-fecha' && t.value) { if (S.ep) guardar('prod', true); S.ep = null; S.fechaFija = true; S.fecha = t.value; render(); }
    else if (t.id === 'm-fecha' && t.value) { S.fm = t.value; render(); }
    else if (t.id === 'e-fecha' && t.value) { S.entrega = t.value; S.sel = {}; renderPedidos(); }
    else if (t.id === 'l-fecha' && t.value) { S.fl = t.value; S.ec = null; render(); }
    else if (t.id === 'fotos' && t.files && t.files.length) { subirFotos(t.files); try { t.value = ''; } catch (err) {} }
    else if (D.sel) {
      var ps = pedidoDe(D.sel);
      if (t.checked && ps) { if (S.selDia !== ps.entrega) { S.sel = {}; S.selDia = ps.entrega; S.camOtro = false; } S.sel[D.sel] = true; } else delete S.sel[D.sel];
      renderPedidos();
    }
    else if (t.id === 'cam-a' && t.value) {
      if (t.value === 'nuevo') { S.camOtro = true; renderPedidos(); var fnn = $('cam-nombre'); if (fnn) fnn.focus(); return; }
      var ids = (S.pedidos || []).filter(function (p) { return p.entrega === S.selDia && S.sel[p.id]; }).map(function (p) { return p.id; }), v = t.value.slice(2), f = S.selDia;
      (t.value.charAt(0) === 'f' ? usarDeFlota(f, v, ids) : asignarCamion(f, ids, v).then(function () { return { id: v }; }))
        .then(function (cam) { S.msg.fotos = avisoCamion(f, cam.id, ids.length); S.sel = {}; S.camOtro = false; renderPedidos(); }, function (e) { S.msg.fotos = '!' + ((e && e.message) || 'No se pudo guardar. Revisá la conexión.'); renderPedidos(); });
    }
    else if (D.pasar && t.value) { (t.value.charAt(0) === 'f' ? usarDeFlota(S.fl, t.value.slice(2), [D.pasar]) : asignarCamion(S.fl, [D.pasar], t.value.slice(2))).then(render, function () { S.msg.log = '!No se pudo guardar.'; render(); }); }
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
    store.sub('config', function (l) {
      var c = l.filter(function (x) { return x.id === 'general'; })[0], lg = {};
      l.forEach(function (x) { if (String(x.id).indexOf('log-') === 0) lg[x.id.slice(4)] = x; });
      // Mientras se edita el stock de camiones, lo que se está escribiendo no se pisa con lo que llega.
      if (c && S.ef) { c.flota = S.config.flota; c.kgMedia = S.config.kgMedia; c.kgCaja = S.config.kgCaja; }
      S.log = lg; S.logListo = true; if (c) S.config = c;
      conciliarLog(); renderDatos();
    });
    store.onAuth(function (u) {
      S.user = u ? { email: u.email } : null; S.editor = false;
      if (!u) { S.em = null; S.ep = null; S.prop = []; render(); return; }
      store.esEditor(u.email).then(function (ok) {
        S.editor = ok;
        if (ok) {
          if (S.fuente === 'respaldo' || vacia) traer();
          if (!suscripto) {
            suscripto = true;
            store.sub('pedidos', function (l) { S.pedidos = ordenar(l); conciliarLog(); renderDatos(); });
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
