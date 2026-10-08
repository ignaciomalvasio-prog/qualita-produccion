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
  var TABS = ['inicio', 'pedidos', 'produccion', 'logistica', 'medias', 'clientes'];
  var CORTES_BASE = ['JAMON', 'PALETA', 'PECHO', 'CARRE', 'SOLOMILLO', 'MATAMBRE', 'BONDIOLA', 'RECORTE', 'GRASA BUENA', 'GRASA MALA', 'CUERO', 'TAPA DE PALETA', 'TAPA DE JAMON', 'TORTUGA', 'GARRON', 'TOCINO', 'CHURRASCO', 'PAPADA', 'OREJAS', 'CABEZA', 'PULMON', 'HIGADO', 'PATAS Y MANOS', 'HUESITOS', 'UNTO', 'MENUDENCIAS', 'EMBUTIDOS'];

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
  function renderMedias() {
    var el = $('view-medias');
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
  function fechaProdDe(m, p, c) { return m[p.id + '|' + c.k] || m[p.id + '|t:' + norm(c.texto)] || m[p.id + '|t:' + norm(textoProd(p, c))] || null; }
  function guardarOrden(f, o, borrarSiVacia) {
    var ol = limpiarOrden(o);
    if (borrarSiVacia && !ol.cortes.length) { S.prod = (S.prod || []).filter(function (x) { return x.id !== f; }); return store.del('produccion', f); }
    S.prod = poner(S.prod, f, ol); return store.set('produccion', f, ol);
  }
  function sumarCortes(p, cuales) {
    var f = p.entrega, o = clone(prodGuardada(f) || prodVacia(f)), m = enProduccion();
    cuales.forEach(function (c) { if (c.texto && !fechaProdDe(m, p, c)) insertarLinea(o, c.corte, textoProd(p, c), p.id, c.k, c.frio || p.frio); });
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
    var h = '<div class="panel carga"><h2>Agregar cliente</h2><div class="campos cli-alta">'
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
    return store.set('pedidos', id, doc);
  }
  function guardarPrecio(id, k, valor) {
    var p = pedidoDe(id); if (!p) return Promise.resolve();
    var doc = clone(p), v = valor === '' ? '' : +String(valor).replace(',', '.') || 0; delete doc.id;
    if (k === 'm') doc.precioMedias = v; else doc.cortes = cortesDe(doc).map(function (c) { if (c.k === k) c.precio = v; return c; });
    S.pedidos = poner(S.pedidos, id, doc);
    return store.set('pedidos', id, doc);
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
      + '<select data-flete="' + id + '" data-k="modo" aria-label="Cómo se paga el flete de ' + esc(cam.nombre) + '"><option value="viaje"' + (fl.modo !== 'kg' ? ' selected' : '') + '>Precio por viaje</option><option value="kg"' + (fl.modo === 'kg' ? ' selected' : '') + '>Precio por kg</option></select>'
      + '<label class="precio"><span>$</span><input type="number" inputmode="decimal" step="any" min="0" data-flete="' + id + '" data-k="valor" value="' + esc(fl.valor === 0 ? 0 : fl.valor || '') + '" aria-label="Precio del flete de ' + esc(cam.nombre) + '"></label>'
      + '<span class="fl-res" data-flete-res="' + id + '">' + fleteTxt(f, cam, peds) + '</span></div>';
  }
  // Las medias del pedido se muestran como un corte más, arriba de la lista.
  function textoMedias(p) { return +p.medias ? n(+p.medias) + (+p.medias === 1 ? ' MEDIA' : ' MEDIAS') + (p.peso ? ' ' + String(p.peso).toUpperCase() : '') : ''; }
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
      fila.cliente = String(p.cliente || '').toUpperCase().trim(); fila.cant = medias / 2; fila.pedido = p.id; fila.nota = p.peso || '';
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
      insertarLinea(x, c.corte, textoProd(p, c), p.id, c.k, c.frio || p.frio); tocadas[p.entrega] = x;
    });
    return Promise.all(Object.keys(tocadas).map(function (f) { return guardarOrden(f, tocadas[f], true); }));
  }
  // Pasa un pedido a otro día: se mueven sus medias y sus cortes en producción, y sale del camión que tenía.
  function moverPedido(p, f) {
    if (!p || !f || f === p.entrega) return Promise.resolve();
    S.prop.forEach(function (x) { if (x.editaId === p.id) x.entrega = f; });
    return guardarPropuesta({ editaId: p.id, cliente: p.cliente, entrega: f, medias: p.medias, peso: p.peso, frio: p.frio, cuenta: p.cuenta || '', nota: p.nota, kg: p.kg, origen: p.origen, cortes: clone(cortesDe(p)) });
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
    if (pe && !S.prop.some(function (x) { return x.editaId === pe.id; })) S.prop.push({ k: uid(), editaId: pe.id, cliente: pe.cliente || '', entrega: pe.entrega || '', medias: pe.medias || '', peso: pe.peso || '', frio: pe.frio || '', cuenta: pe.cuenta || '', nota: pe.nota || '', kg: pe.kg || '', origen: pe.origen || 'manual', dudas: (pe.dudas || []).slice(), cortes: clone(cortesDe(pe)).map(function (c) { c.texto = sinCliente(c.texto, pe.cliente); return c; }) });
    S.msg.fotos = ''; renderPedidos();
    var k = -1; S.prop.forEach(function (x, i) { if (x.editaId === id) k = i; });
    var fe = $('q' + k + (campo || 'cliente')); if (fe) { fe.focus(); if (fe.scrollIntoView) fe.scrollIntoView({ block: 'center' }); }
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
    var cams = (camiones || camionesDe(f)).map(function (c) { return { id: c.id, nombre: c.nombre || '', nota: c.nota || '', kg: +c.kg || 0, orden: (c.orden || []).slice() }; }), hay = {};
    cams.forEach(function (c) { hay[c.id] = c; });
    var peds = (S.pedidos || []).filter(function (p) { return p.entrega === f; }).map(function (p) {
      var k = kgPedido(p);
      return { id: p.id, cliente: p.cliente || '', cuenta: cuentaPedido(p), medias: +p.medias || 0, peso: p.peso || '', frio: p.frio || '', nota: p.nota || '', camion: p.camion && hay[p.camion] ? p.camion : '', kg: k.kg, kgFalta: !!k.falta, kgManual: !!k.manual,
        cortes: (p.cortes || []).filter(function (c) { return c.texto; }).map(function (c) { return { corte: c.corte, texto: sinCliente(c.texto, p.cliente) }; }) };
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
  // Si lo publicado no coincide con los pedidos (por ejemplo, pedidos cargados antes de que existiera Logística), se vuelve a publicar.
  function conciliarLog() {
    if (!S.editor || !S.pedidos || !S.logListo) return;
    var desde = habilAnterior(hoy()), porFecha = {};
    S.pedidos.forEach(function (p) { if (p.entrega && p.entrega >= desde) (porFecha[p.entrega] = porFecha[p.entrega] || []).push(p.id); });
    Object.keys(S.log || {}).forEach(function (f) { if (f >= desde && !porFecha[f]) porFecha[f] = []; });
    Object.keys(porFecha).forEach(function (f) {
      var lg = logDe(f), kgDe = {}; S.pedidos.forEach(function (p) { if (p.entrega === f) kgDe[p.id] = kgPedido(p).kg; });
      var a = porFecha[f].slice().sort().map(function (id) { return id + ':' + kgDe[id] + ':' + ((pedidoDe(id) || {}).frio || '') + ':' + cuentaPedido(pedidoDe(id) || {}); }).join(','), b = ((lg && lg.pedidos) || []).map(function (x) { return x.id + ':' + (+x.kg || 0) + ':' + (x.frio || '') + ':' + (x.cuenta || ''); }).sort().join(',');
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
    var cams = camionesDe(f).map(function (c) { return c.id === id ? { id: id, nombre: String(nombre || '').trim() || c.nombre, nota: String(nota || '').trim(), kg: +kg || 0, orden: c.orden || [] } : c; });
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
  function guardarPropuesta(q, auto) {
    var previo = q.editaId ? pedidoDe(q.editaId) : null, entrega = q.entrega || '';
    var p = { cliente: String(q.cliente || '').toUpperCase().trim(), entrega: entrega, medias: +q.medias || 0, peso: q.peso || '', frio: frioDe(q.frio), cuenta: String(q.cuenta || '').trim(), nota: q.nota || '', origen: q.origen || 'manual',
      creado: previo && previo.creado ? previo.creado : ahoraTxt(), kg: +q.kg > 0 ? +q.kg : '',
      camion: previo && previo.entrega === entrega ? (previo.camion || '') : '',
      cortes: (q.cortes || []).filter(function (c) { return c.texto; }).map(function (c) { return { k: c.k || uid(), corte: norm(c.corte), texto: sinCliente(String(c.texto).toUpperCase().replace(/\s+/g, ' ').trim(), q.cliente), orden: c.orden !== false, precio: c.precio === 0 ? 0 : c.precio || '', iva: c.iva || '', frio: frioDe(c.frio) }; }).filter(function (c) { return c.texto; }) };
    if (previo && (previo.precioMedias === 0 || previo.precioMedias)) p.precioMedias = previo.precioMedias;
    if (previo && previo.ivaMedias) p.ivaMedias = previo.ivaMedias;
    var vd = q.vendedor || (previo && previo.vendedor); if (vd) { p.vendedor = vd; p.vendedorNombre = q.vendedorNombre || (previo && previo.vendedorNombre) || ''; }
    if (!p.cliente) return Promise.reject(new Error('Falta el cliente.'));
    if (!p.entrega) return Promise.reject(new Error('Falta la fecha de entrega.'));
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
      + '2. Planillas de Excel de reparto por zona o por ciudad: cada fila es un cliente; la columna "Medias" es cantidad de medias reses y las demás columnas son cortes; si el encabezado dice la unidad (cajas, kg), es esa. La fecha del encabezado es la fecha de entrega. Si junto al cliente dice un rango de kilos (ej. "46 a 48 kg"), es el peso pedido para las medias.\n'
      + '3. Planillas por sucursal (ej. DINO): arriba a la izquierda figura el cliente y cada COLUMNA es una sucursal (Rod del Busto, Salsipuedes, Alta Gracia, Ruta 20…); cada fila es un corte, con su código, y el número es lo que pide esa sucursal de ese corte, en kilos cuando la planilla lo dice (por ejemplo con la fila "KG X SUCURSAL" o la columna "TOTAL KG"). Devolvé UN PEDIDO POR CADA SUCURSAL que tenga algo pedido, nunca uno solo con todo sumado: cada sucursal sale en un camión distinto. cliente = el nombre del cliente seguido de la sucursal (ej. "DINO ROD DEL BUSTO"). En cada pedido, un corte por cada fila que tenga cantidad en esa columna, con la cantidad de ESA sucursal. Una sucursal con toda la columna vacía o en cero no se carga. La imagen puede traer más de una tabla del mismo cliente: son más sucursales. No tomes como sucursal la columna TOTAL KG ni como corte la fila "KG X SUCURSAL": sirven para controlar; si la suma de una columna no coincide con su "KG X SUCURSAL", avisalo en dudas de ese pedido. El texto de cada corte lleva la cantidad con su unidad, el nombre del corte como figura y el código entre paréntesis (ej. "100KG JAMON 4 MUSC (COD 341)"); la sucursal no se repite en el texto. Los embutidos (chorizo, morcilla, salchicha) van con orden=false.\n'
      + '4. Lista escrita a mano en una hoja suelta: cada renglón es un cliente seguido de una cantidad con "½" (ej.: "Molina 100 ½" = 100 medias reses para MOLINA). Un título subrayado arriba (ej. "San Juan") es la zona o el destino, no un cliente: ponelo en la nota de cada pedido. Los importes con "$" son precios: no los copies. Una aclaración entre paréntesis como "(grandes)" va en peso. Un número rodeado con un círculo al pie es el total de medias de la hoja: no es un pedido; si la suma de los renglones no coincide con ese total, avisalo en dudas del primer pedido. Marcas como "ok" o rayas no son pedidos.\n'
      + '5. Texto pegado de WhatsApp u otro mensaje: suele empezar con una frase general (ej. "pedido de cerdo para el martes por caja") que da la fecha de entrega y la unidad para todo el mensaje, y sigue con bloques separados por una línea en blanco: la primera línea de cada bloque es el cliente o la sucursal y las siguientes son "cantidad corte". Cada bloque es un pedido. Aplicá la unidad general a cada renglón ("por caja": "2 matambre" = 2 CAJAS). "Pierna" es el rubro JAMON; conservá abreviaturas como "S/C" tal como vienen. Ignorá saludos y texto que no sea pedido. Si al pedirte la lectura te indican que todo el mensaje es de UN solo cliente y que los bloques son sus sucursales, devolvé igual un pedido por cada sucursal, con cliente = ese cliente seguido de la sucursal (ej. "CLIENTE MENENDEZ PIDAL").\n\n'
      + 'QUÉ CARGAR, POR CADA PEDIDO\n'
      + '- cliente: en mayúsculas. Si coincide con uno de la lista de clientes conocidos, usá exactamente ese nombre.\n'
      + '- entrega: en formato AAAA-MM-DD. Resolvé fechas como "lun 05/10" con el año actual. Si solo dice un día de la semana ("para el martes"), es el próximo día con ese nombre contando desde mañana. Si no figura, dejala vacía.\n'
      + '- medias: cantidad de medias reses, número. 0 si no pide medias. Si un cliente figura en la planilla con 0 medias o con la cantidad en blanco, cargalo igual con medias 0: no lo saltees.\n'
      + '- peso: aclaración de peso de las medias (livianas, pesadas, rango de kg), o "".\n'
      + '- frio: "FRESCO" o "CONGELADO" cuando en cualquier parte de la imagen o del mensaje dice que la mercadería es fresca o congelada: en el título, el encabezado, el nombre de la planilla o de la hoja, una columna, una nota al margen, al lado del cliente o en la frase inicial de un mensaje. También valen las abreviaturas ("CONG.", "CGDO", "FCO", "FRESC."). Si lo dice una sola vez en general, vale para TODOS los pedidos de esa imagen o mensaje: ponelo en cada uno. Si no lo dice en ningún lado, "" (no lo supongas). Si en un mismo pedido hay cortes frescos y cortes congelados, dejá frio en "" y escribí FRESCO o CONGELADO dentro del texto de cada corte.\n'
      + '- cortes: un elemento por cada corte pedido. "corte" es el rubro de la orden de producción, uno de: ' + CORTES_BASE.join(', ') + '. "texto" es lo que pide de ese corte, en mayúsculas: primero la cantidad, tal cual figura en el pedido, con su unidad si el pedido la dice (ej. "600KG", "10 CAJAS", "50 UND"), después la presentación o variante si se aclara (ej. "15 CAJAS PIERNA S/C", "107 CAJAS DE 20KG CARRE CON HUESO") y el código si figura (ej. "(ART 276)"). Cargá el pedido como aparece: la unidad (CAJAS, KG, UND, BINES) se escribe solo cuando el pedido la aclara, sea en el renglón, en el encabezado de la columna, en la fila de totales o en la frase general ("por caja", "en kilos", "cj", "x kg"); en ese caso escribila en cada corte al que le corresponde. Si el pedido no aclara si es caja o kg, NO pongas ninguna unidad: dejá la cantidad sola (ej. "2 MATAMBRE"). Nunca la supongas ni la deduzcas por costumbre. NO pongas el nombre del cliente ni de la sucursal en el texto, ni entre comillas ni suelto: ya va en "cliente". Si el cliente pide TODO el corte, la línea va sin cantidad (ej. "TODO FRESCO EN BINES").\n'
      + '- orden: true si es un corte fresco que hay que producir ese día; false si es mercadería congelada que sale de stock, o productos que no salen del desposte (chorizo, morcilla, salchicha).\n'
      + '- nota: aclaraciones del pedido que no entran en otro campo. No copies precios.\n'
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
      + '<label class="campo"><span>N° de cuenta</span><input type="text" inputmode="numeric" id="q' + i + 'cuenta" data-q="' + i + '" data-k="cuenta" value="' + esc(q.cuenta || '') + '" placeholder="' + esc(cuentaDe(q.cliente) || 'Sin número') + '"></label>'
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
      + '<button class="ped-tit" data-act="ped-abrir" data-id="' + id + '" aria-expanded="' + ab + '"><span class="nom">' + esc(p.cliente || 'Sin cliente') + '</span>' + ctaHTML(cuentaPedido(p), true) + '<span class="res">' + res.join(' · ') + (p.frio ? ' ' + frioBadge(p.frio) : '') + '</span>'
      + (cam || p.vendedor ? '<span class="marcas">' + (p.vendedor ? '<span class="badge vend" title="' + esc(p.vendedor) + '">Vendedor: ' + esc(p.vendedorNombre || p.vendedor.split('@')[0]) + '</span>' : '') + (cam ? '<span class="badge plain">' + esc(cam) + '</span>' : '') + '</span>' : '') + '<span class="chev" aria-hidden="true">' + (ab ? '▴' : '▾') + '</span></button></div>';
    if (!ab) return h + '</div>';
    h += '<div class="ped-det">' + elegirCuentaHTML(p) + '<div class="op-ped">';
    if (+p.medias) h += '<p class="lp"><span><b>Medias</b> ' + esc(textoMedias(p)) + '</span><span class="lp-der">' + precioHTML(p.id, 'm', p.precioMedias, 'las medias', p.ivaMedias) + '</span></p>';
    cs.forEach(function (c) {
      var f = fechaProdDe(m, p, c);
      h += '<p class="lp"><span><b>' + esc(c.corte) + '</b> ' + esc(sinCliente(c.texto, p.cliente)) + (c.frio && c.frio !== p.frio ? ' ' + frioBadge(c.frio) : '') + '</span><span class="lp-der">' + precioHTML(p.id, c.k, c.precio, c.corte, c.iva) + (f
        ? '<span class="en"><span class="badge ok">En producción</span><button class="btn sm" data-act="c-quitar" data-id="' + id + '" data-k="' + esc(c.k) + '">Quitar</button></span>'
        : '<button class="btn sm pri" data-act="c-sumar" data-id="' + id + '" data-k="' + esc(c.k) + '">Sumar a producción</button>') + '</span></p>';
    });
    h += '</div>';
    if (p.nota) h += '<p class="small muted">' + esc(p.nota) + '</p>';
    h += '<div class="acciones">' + (cs.length - enP > 1 ? '<button class="btn sm" data-act="c-todos" data-id="' + id + '">Sumar todos a producción</button>' : '')
      + '<button class="btn sm" data-act="ped-editar" data-id="' + id + '">Editar</button>' + opcionesDia(p)
      + '<button class="btn sm rojo" data-act="ped-borrar" data-id="' + id + '" data-i="' + id + '">' + (S._c2 === 'ped-borrar' + p.id ? 'Tocá de nuevo para confirmar' : 'Quitar') + '</button></div>';
    return h + '</div></div>';
  }
  /* ---------- pedidos de vendedores ----------
     Los vendedores externos cargan desde /vendedor; quedan en "ventas" como pendientes hasta que acá
     se aceptan (pasan a ser un pedido más) o se rechazan. El vendedor ve el estado desde su página. */
  // Filtro por vendedor (S.fv): '' todos, '-' los cargados por Qualitá, o el mail del vendedor.
  function pasaFiltro(mail) { return !S.fv || (S.fv === '-' ? !mail : mail === S.fv); }
  function vendedoresConocidos() {
    var vs = {};
    (S.ventas || []).forEach(function (v) { if (v.vendedor) vs[v.vendedor] = nombreVend(v); });
    (S.pedidos || []).forEach(function (p) { if (p.vendedor && !vs[p.vendedor]) vs[p.vendedor] = p.vendedorNombre || p.vendedor.split('@')[0]; });
    return vs;
  }
  function filtroVendHTML() {
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
    h += '</div>' + filtroVendHTML() + ventasHTML();

    S.prop.forEach(function (q, k) { if (q.editaId) h += '<div class="panel"><h3>Editando: ' + esc(q.cliente || 'pedido') + '</h3>' + propHTML(q, k) + '</div>'; });

    // Un día por vez: arranca en mañana (el próximo día hábil) y se puede ir a otros con las flechas.
    var hy = hoy(), m = enProduccion();
    if (S.pedDia) { S.pd = S.pedDia; S.pedDia = null; }
    if (!S.pd) S.pd = habilSiguiente(hy);
    var f = S.pd, lista = (S.pedidos || []).filter(function (p) { return p.entrega === f && pasaFiltro(p.vendedor); }), tild = S.selDia === f ? lista.filter(function (p) { return S.sel[p.id]; }) : [];
    h += '<section class="dia-ped" id="dia-' + f + '"><div class="nav nav-ped"><button class="btn step" data-act="pd" data-d="-1" aria-label="Día anterior">‹</button>'
      + '<span class="tit">' + esc(tituloDe(f)) + (f === hy ? ' <span class="tag">hoy</span>' : f === mas(hy, 1) ? ' <span class="tag">mañana</span>' : '') + '</span>'
      + '<button class="btn step" data-act="pd" data-d="1" aria-label="Día siguiente">›</button><input type="date" id="pd-fecha" value="' + esc(f) + '" aria-label="Ir a una fecha">'
      + (f !== habilSiguiente(hy) ? '<button class="btn" data-act="pd-ir" data-f="' + habilSiguiente(hy) + '">Volver a mañana</button>' : '')
      + (lista.length ? botonBorrar('ped-borrar-todos', f, 'Eliminar todos los pedidos') : '') + '</div>';
    // Aviso de los otros días que tienen pedidos cargados, para no perderlos de vista.
    var otros = {}; (S.pedidos || []).forEach(function (p) { if (p.entrega && p.entrega !== f && p.entrega >= hy && pasaFiltro(p.vendedor)) otros[p.entrega] = (otros[p.entrega] || 0) + 1; });
    var ko = Object.keys(otros).sort();
    if (ko.length) h += '<p class="otros-dias"><span class="small muted">Otros días con pedidos:</span>' + ko.map(function (d) { return '<button class="btn sm" data-act="pd-ir" data-f="' + d + '">' + esc(diaCorto(d)) + ' <b>' + otros[d] + '</b></button>'; }).join('') + '</p>';
    if (tild.length) h += barraCamionHTML(f, tild);
    h += lista.length ? '<div class="peds">' + lista.map(function (p) { return pedidoHTML(p, m); }).join('') + '</div>' : '<p class="muted sin">Sin pedidos para este día.</p>';
    h += '</section>';

    h += '<div class="panel"><details' + (S._conf ? ' open' : '') + '><summary>Configuración</summary><div class="campos">'
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
  function logPedidoHTML(p, cam, cams, pos, total) {
    var id = esc(p.id), filas = (p.cortes || []).map(function (c) { return { corte: c.corte, texto: sinCliente(c.texto, p.cliente) }; });
    if (+p.medias) filas.unshift({ corte: 'MEDIAS', texto: textoMedias(p) });
    var h = '<div class="log-ped"><div class="log-cab">' + (cam ? '<span class="log-pos">' + (pos + 1) + '</span>' : '') + '<strong>' + esc(p.cliente || 'Sin cliente') + '</strong>' + ctaHTML(p.cuenta)
      + frioBadge(p.frio)
      + '<span class="small muted">' + esc(kgTxt({ kg: +p.kg || 0, falta: p.kgFalta, manual: p.kgManual })) + '</span>';
    if (S.editor) h += '<span class="log-acc">' + (cam
      ? (total > 1 ? '<button class="btn sm ord" data-act="cam-subir" data-id="' + id + '" data-cam="' + esc(cam.id) + '"' + (pos === 0 ? ' disabled' : '') + ' aria-label="Subir a ' + esc(p.cliente) + ' un lugar">↑</button>'
        + '<button class="btn sm ord" data-act="cam-bajar" data-id="' + id + '" data-cam="' + esc(cam.id) + '"' + (pos === total - 1 ? ' disabled' : '') + ' aria-label="Bajar a ' + esc(p.cliente) + ' un lugar">↓</button>' : '')
        + '<button class="btn sm" data-act="cam-quitar-ped" data-id="' + id + '">Sacar</button>'
      : opcionesCamion(p, cams)) + '</span>';
    h += '</div>';
    if (filas.length) h += '<div class="log-cortes">' + filas.map(function (c) { return '<p><u>' + esc(c.corte) + '</u>: ' + esc(c.texto) + '</p>'; }).join('') + '</div>';
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
    // Quien mira (sin cuenta, o por el link de Logística) ve solo los pedidos que ya tienen camión.
    if (!S.editor) peds = peds.filter(function (p) { return p.camion; });
    var h = '<div class="nav"><button class="btn step" data-act="fl" data-d="-1" aria-label="Día anterior">‹</button><span class="tit">' + esc(tituloDe(f)) + '</span><button class="btn step" data-act="fl" data-d="1" aria-label="Día siguiente">›</button>'
      + '<input type="date" id="l-fecha" value="' + esc(f) + '" aria-label="Ir a una fecha">'
      + (peds.length ? '<button class="btn" data-act="imprimir">Imprimir</button>' : '')
      + (S.editor ? '<button class="btn" data-act="cam-nuevo">+ Camión para este día</button><button class="btn" data-act="link-log">Copiar link para compartir</button><span class="guardado" id="g-log"></span>' : '') + '</div>';
    if (!peds.length && !cams.length) {
      h += '<div class="panel"><p class="state">No hay pedidos para entregar este día.</p>' + (S.editor ? '<div class="acciones" style="justify-content:center"><button class="btn pri" data-act="ir-pedidos" data-f="' + f + '">Ir a los pedidos de este día</button></div>' : '') + '</div>';
      if (S.editor || flota().length) h += stockCamionesHTML(f, peds, cams);
      el.innerHTML = h; pintarMsg('log'); pintarMsg('flota'); return;
    }
    h += '<p class="muted">Para entregar ' + esc(cuandoEs(f)) + ': ' + resumenLog(peds) + (cams.length ? ' · ' + cams.length + (cams.length === 1 ? ' camión' : ' camiones') : '') + '.</p>';
    cams.forEach(function (cam, k) {
      var suyos = peds.filter(function (p) { return p.camion === cam.id; }), ed = S.ec === cam.id;
      var car = cargaDe(peds, cam.id), ct = capTxt(cam, car), pasa = +cam.kg > 0 && car > +cam.kg;
      h += '<section class="cam' + (pasa ? ' pasa' : '') + '" data-cam="' + esc(cam.id) + '"><header class="cam-cab"><span class="cam-num">Camión ' + (k + 1) + '</span><h2>' + esc(cam.nombre) + '</h2>'
        + (cam.nota && !ed ? '<span class="cam-nota">' + esc(cam.nota) + '</span>' : '')
        + (!ed ? '<span class="log-acc"><button class="btn sm" data-act="cam-imprimir" data-id="' + esc(cam.id) + '">Imprimir</button>'
          + (S.editor ? '<button class="btn sm" data-act="cam-editar" data-id="' + esc(cam.id) + '">Editar</button>' + botonBorrar('cam-borrar', cam.id, 'Borrar camión') : '') + '</span>' : '') + '</header>';
      h += '<div class="cam-datos"><div class="cam-res"><b>' + suyos.length + '</b><span>' + (suyos.length === 1 ? 'pedido' : 'pedidos') + '</span></div>'
        + (ct ? '<div class="cam-carga"><p class="cam-cap' + (pasa ? ' neg' : '') + '">' + esc(ct) + '</p>' + (+cam.kg > 0 ? '<div class="medidor' + (pasa ? ' pasa' : '') + '" role="img" aria-label="' + esc(ct) + '"><i style="width:' + Math.min(100, Math.round(car / +cam.kg * 100)) + '%"></i></div>' : '') + '</div>' : '') + '</div>';
      if (S.editor) h += fleteHTML(f, cam, peds);
      h += '<div class="cam-cuerpo">';
      if (ed) h += '<div class="campos"><label class="campo"><span>Nombre</span><input type="text" id="cam-e-nombre" value="' + esc(S.ecNombre || '') + '"></label><label class="campo"><span>Capacidad kg</span><input type="number" inputmode="numeric" id="cam-e-kg" value="' + esc(S.ecKg || '') + '"></label><label class="campo"><span>Nota (chofer, hora…)</span><input type="text" id="cam-e-nota" value="' + esc(S.ecNota || '') + '"></label></div>'
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

  /* ---------- inicio ---------- */
  /* ---------- inicio ----------
     Una tarjeta por pestaña, todas con el mismo orden: el día, los números del día y qué hay para el día siguiente. */
  function plural(k, uno, muchos) { return k === 1 ? uno : muchos; }
  function tarjeta(tab, titulo, dia, datos, vacio, marca, sigue) {
    return '<button class="tile" data-act="ir" data-tab="' + tab + '"><span class="t-cab"><b>' + titulo + '</b>' + (marca || '') + '</span>'
      + '<span class="t-dia">' + esc(dia) + '</span>'
      + (datos.length ? '<span class="t-nums">' + datos.map(function (d, k) { return '<strong' + (k === 0 ? ' class="g"' : '') + '>' + n(d[0]) + '</strong><span>' + esc(d[1]) + '</span>'; }).join('') + '</span>' : '<span class="t-vacio">' + esc(vacio) + '</span>')
      + (sigue ? '<span class="t-sig">' + sigue + '</span>' : '') + '</button>';
  }
  function renderInicio() {
    var el = $('view-inicio');
    if (cargando(el, S.prod && S.faena)) return;
    var h = hoy(), f = fechaProdInicial(), sig = habilSiguiente(f), html = '<div class="home">';
    var rot = function (d) { return (d === h ? 'Hoy · ' : d === mas(h, 1) ? 'Mañana · ' : '') + tituloDe(d); };
    var neg = function (k, uno, muchos) { return '<strong>' + n(k) + '</strong> ' + plural(k, uno, muchos); };
    var pie = function (txt) { return '<span class="t-dia">' + esc(rot(sig)) + '</span><span>' + txt + '</span>'; };
    if (S.editor && ventasPendientes(true).length) { var nv = ventasPendientes(true).length; html += '<button class="aviso-vend" data-act="ir-ventas"><strong>' + nv + '</strong> ' + plural(nv, 'pedido de vendedor para revisar', 'pedidos de vendedores para revisar') + ' <span aria-hidden="true">›</span></button>'; }
    if (S.editor) {
      var deDia = function (d) { return (S.pedidos || []).filter(function (p) { return p.entrega === d; }); };
      var ph = deDia(f), ps = deDia(sig), mas2 = (S.pedidos || []).filter(function (p) { return p.entrega > sig; }).length;
      var pm = ph.reduce(function (t, p) { return t + (+p.medias || 0); }, 0), pc = ph.reduce(function (t, p) { return t + (p.cortes || []).length; }, 0);
      var dp = ph.length ? [[ph.length, plural(ph.length, 'pedido', 'pedidos')]] : [];
      if (pm) dp.push([pm, plural(pm, 'media', 'medias')]);
      if (pc) dp.push([pc, plural(pc, 'renglón de cortes', 'renglones de cortes')]);
      html += tarjeta('pedidos', 'Pedidos', rot(f), dp, 'Sin pedidos cargados', '',
        pie(ps.length ? neg(ps.length, 'pedido', 'pedidos') : 'Sin pedidos') + (mas2 ? '<span>Más adelante: ' + neg(mas2, 'pedido', 'pedidos') + '</span>' : ''));
    }
    var prodNum = function (d) {
      var o = prodDe(d), ids = {}, nl = 0;
      if (o) (o.cortes || []).forEach(function (c) { c.lineas.forEach(function (l) { nl++; if (l.p) ids[l.p] = 1; }); });
      return { o: o, nl: nl, peds: Object.keys(ids).length };
    };
    var a = prodNum(f), b = prodNum(sig), da = [];
    if (a.nl) { da.push([a.nl, plural(a.nl, 'renglón', 'renglones')]); if (a.peds) da.push([a.peds, plural(a.peds, 'pedido', 'pedidos')]); if (+a.o.medias) da.push([+a.o.medias, 'medias a despostar']); }
    html += tarjeta('produccion', 'Producción', rot(f), da, 'Todavía no hay nada cargado',
      a.nl ? '<span class="badge ' + (a.o.estado === 'borrador' ? 'warn">Borrador' : 'ok">Confirmada') + '</span>' : '',
      pie(b.nl ? neg(b.nl, 'renglón', 'renglones') + (b.o.estado === 'borrador' ? ' · borrador' : ' · confirmada') : 'Sin cargar'));
    var logNum = function (d) { var lg = logDe(d), lp = ((lg && lg.pedidos) || []).filter(function (x) { return S.editor || x.camion; }), lc = (lg && lg.camiones) || []; return { p: lp.length, c: lc.length, s: lp.filter(function (x) { return !x.camion; }).length }; };
    var la = logNum(f), lb = logNum(sig), dl = [];
    if (la.p) { dl.push([la.p, plural(la.p, 'pedido', 'pedidos')]); dl.push([la.c, plural(la.c, 'camión armado', 'camiones armados')]); if (la.s) dl.push([la.s, 'sin camión']); }
    html += tarjeta('logistica', 'Logística', rot(f), dl, 'Sin pedidos para entregar', '',
      pie(lb.p ? neg(lb.p, 'pedido', 'pedidos') + ' · ' + neg(lb.c, 'camión', 'camiones') : 'Sin pedidos'));
    var medNum = function (d) { var x = diaFaena(d), cl = x ? conMedias(x.d) : []; return { c: cl.length, a: cl.reduce(function (t, r) { return t + (+r.cant || 0); }, 0) }; };
    var ma = medNum(f), mb = medNum(sig);
    html += tarjeta('medias', 'Medias', rot(f), ma.c ? [[ma.c, plural(ma.c, 'cliente', 'clientes')], [ma.a, plural(ma.a, 'animal', 'animales')]] : [], 'Sin ventas cargadas', '',
      pie(mb.c ? neg(mb.c, 'cliente', 'clientes') + ' · ' + neg(mb.a, 'animal', 'animales') : 'Sin ventas cargadas'));
    if (S.editor) {
      var lc = clientes(), sn = lc.filter(function (x) { return !x.c; }).length;
      html += tarjeta('clientes', 'Clientes', 'Números de cuenta', lc.length ? [[lc.length, plural(lc.length, 'cliente', 'clientes')]].concat(sn ? [[sn, 'sin número']] : []) : [], 'Todavía no hay clientes cargados', '', '');
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
  function render() {
    $('stamp').textContent = (S.config.actualizado ? 'Actualizado: ' + S.config.actualizado : '') + (S.fuente === 'cache' ? ' · sin conexión' : '');
    var ht = $('hoy-txt'); if (ht) ht.textContent = 'Hoy es ' + tituloDe(hoy()).toLowerCase();
    var e = $('sesion');
    if (S.solo) { S.tab = S.solo; S.editor = false; }
    $('tabs').hidden = !!S.solo;
    if (!store || !store.signIn || S.solo) e.innerHTML = '';
    else if (!S.user) e.innerHTML = '<button class="btn sm lnk" data-act="ingresar">Ingresar para cargar</button>';
    else e.innerHTML = '<span>' + esc(S.user.email) + (S.editor ? '' : ' · sin permiso para cargar') + '</span><button class="btn sm lnk" data-act="salir">Salir</button>';
    $('tab-pedidos').hidden = !S.editor; $('tab-clientes').hidden = !S.editor;
    $('tabs').classList.toggle('muchas', !!S.editor);
    // Si la página se abrió (o se recargó sola) en Pedidos o Clientes, se vuelve ahí apenas se confirma el permiso.
    if ((S.tab === 'pedidos' || S.tab === 'clientes') && !S.editor) { S.volver = S.tab; S.tab = 'inicio'; }
    TABS.forEach(function (t) { $('view-' + t).hidden = S.tab !== t; if (S.tab !== t) $('view-' + t).innerHTML = ''; $('tab-' + t).setAttribute('aria-selected', String(S.tab === t)); });
    if (S.tab === 'medias') renderMedias(); else if (S.tab === 'pedidos') renderPedidos(); else if (S.tab === 'produccion') renderProduccion(); else if (S.tab === 'logistica') renderLogistica(); else if (S.tab === 'clientes') renderClientes(); else renderInicio();
  }
  // Cuando llegan datos nuevos no se redibuja la pantalla en la que se está escribiendo.
  function renderDatos() {
    if (S.tab === 'medias' && S.em) return pintarSumas();
    if (S.tab === 'produccion' && S.ep) return;
    if (S.tab === 'pedidos' && (S.prop.length || escribiendo())) return;
    if (S.tab === 'clientes' && escribiendo()) return;
    if (S.tab === 'logistica' && (S.ec || S.ef || (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.flete))) return;
    render();
  }
  function irA(tab) { if (S.solo) tab = S.solo; S.volver = null; S.tab = tab; try { history.replaceState(null, '', '#' + tab); } catch (err) {} render(); window.scrollTo(0, 0); }

  document.querySelector('.top').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (!b) return; e.preventDefault(); if (b.dataset.tab === 'inicio') alInicio(); if (S.ep) { asentarEdicion(); S.ep = null; } S.ec = null; S.msg.fotos = ''; S.msg.log = ''; S.pegar = false; if (!S.leyendo) { S.pegarTxt = ''; S.pegarCli = ''; } irA(b.dataset.tab); });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var a = b.dataset.act, D = b.dataset, o, c;
    if (S._c2 && S._c2 !== a + (D.i == null ? '' : D.i)) S._c2 = null;

    if (a === 'actualizar') { recargar(); return; }
    if (a === 'link-log') {
      var url = location.origin + location.pathname.replace(/[^\/]*$/, '') + 'logistica', listo = function () { S.msg.log = 'Link copiado: ' + url; pintarMsg('log'); avisar('Link de Logística copiado. Pegalo donde quieras compartirlo.', 6000); };
      var aMano = function () { S.msg.log = 'Link para compartir: ' + url; pintarMsg('log'); avisar('Link para compartir: ' + url, 15000); };
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
    if (a === 'cli-quitar') {
      var lq = clone(clientes()); lq.splice(+D.i, 1);
      escribirClientes(lq).then(renderClientes, function () { avisar('!No se pudo quitar. Revisá la conexión.', 6000); });
      return;
    }
    if (a === 'ir') irA(D.tab);
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
      setTimeout(function () { window.print(); setTimeout(limpiar, 60000); }, 80);
    }
    else if (a === 'cam-subir' || a === 'cam-bajar') { moverEnCamion(S.fl, D.cam, D.id, a === 'cam-subir' ? -1 : 1).then(render, function () { S.msg.log = '!No se pudo guardar.'; render(); }); }
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
    else if (a === 'pd') { var yp = S.pd || habilSiguiente(hoy()); do { yp = mas(yp, +D.d); } while (!esHabil(yp)); S.pd = yp; S.abierto = {}; renderPedidos(); }
    else if (a === 'pd-ir') { S.pd = D.f; S.abierto = {}; renderPedidos(); window.scrollTo(0, 0); }
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

  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.ctaIn) { e.preventDefault(); var bg = document.querySelector('[data-act="cta-guardar"][data-id="' + e.target.dataset.ctaIn + '"]'); if (bg) bg.click(); } });
  document.addEventListener('input', function (e) {
    var t = e.target, D = t.dataset;
    if (t.id === 'cli-buscar') { S.cliBuscar = t.value; filtrarClientes(); return; }
    if (D.cli != null) return;
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
  document.addEventListener('toggle', function (e) { var d = e.target; if (d && d.tagName === 'DETAILS') { if (d.id === 'det-cli') S._cliVarios = d.open; else S._conf = d.open; } }, true);
  document.addEventListener('change', function (e) {
    var t = e.target, D = t.dataset;
    if (t.id === 'p-fecha' && t.value) { if (S.ep) guardar('prod', true); S.ep = null; S.fechaFija = true; S.fecha = t.value; render(); }
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
    else if (D.precio) {
      guardarPrecio(D.precio, D.k, t.value).then(function () { avisar('Precio guardado.', 2500); }, function () { avisar('!No se pudo guardar el precio. Revisá la conexión.', 6000); });
    }
    else if (D.flete) {
      var cambio = {}; cambio[D.k] = t.value;
      guardarFlete(S.fl, D.flete, cambio).then(function () { avisar('Costo guardado.', 2500); }, function () { avisar('!No se pudo guardar el costo. Revisá la conexión.', 6000); });
      var lgf = logDe(S.fl), camf = camionesDe(S.fl).filter(function (c) { return c.id === D.flete; })[0], res = document.querySelector('[data-flete-res="' + D.flete + '"]');
      if (camf && res) res.innerHTML = fleteTxt(S.fl, camf, (lgf && lgf.pedidos) || []);
    }
    else if (D.mover && t.value) {
      var pm = pedidoDe(D.mover), fm = t.value;
      if (fm === 'otra') { editarPedido(D.mover, 'entrega'); return; }
      if (!pm || S._ocup) return;
      S._ocup = true; delete S.sel[pm.id];
      moverPedido(pm, fm).then(function () { S._ocup = false; S.msg.fotos = 'Pedido de ' + pm.cliente + ' pasado al ' + diaCorto(fm).toLowerCase() + '.'; avisar(S.msg.fotos, 6000); renderPedidos(); },
        function () { S._ocup = false; S.msg.fotos = '!No se pudo cambiar de día. Revisá la conexión.'; renderPedidos(); });
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
  // Link para compartir con una sola pestaña: se ve esa sola, sin las demás y sin ingresar.
  // Es la página logistica.html (se arma con tools/paginas.py); el link viejo con ?solo=logistica sigue andando.
  try { var qs = document.documentElement.getAttribute('data-solo') || new URLSearchParams(location.search).get('solo'); if (qs === 'logistica') { S.solo = qs; S.tab = qs; } } catch (err) {}
  if (S.solo) {
    document.title = 'Logística Qualitá';
    var mf = document.querySelector('link[rel="manifest"]'); if (mf) mf.setAttribute('href', 'logistica.webmanifest');
    var mn = document.querySelector('.marca-nom'); if (mn) mn.textContent = 'Logística';
    document.documentElement.classList.add('solo');
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
      if (S.solo) { S.user = null; render(); return; }   // el link para compartir es siempre de solo lectura
      if (!u) { S.em = null; S.ep = null; S.prop = []; render(); return; }
      store.esEditor(u.email).then(function (ok) {
        S.editor = ok;
        if (ok && S.volver && S.tab === 'inicio') { S.tab = S.volver; S.volver = null; }
        if (ok) {
          if (S.fuente === 'respaldo' || vacia) traer();
          if (!suscripto) {
            suscripto = true;
            store.sub('pedidos', function (l) { S.pedidos = ordenar(l); conciliarLog(); renderDatos(); });
            store.sub('ventas', function (l) { var antes = ventasPendientes(true).length; S.ventas = l; if (antes !== ventasPendientes(true).length && (S.tab === 'pedidos' || S.tab === 'inicio')) renderDatos(); });
            store.sub('privado', function (l) {
              var fl = {}, antesF = JSON.stringify(S.fletes || {});
              l.forEach(function (x) { if (String(x.id).indexOf('fletes-') === 0) fl[x.id.slice(7)] = x; });
              S.fletes = fl; if (JSON.stringify(fl) !== antesF && S.tab === 'logistica') renderDatos();
              var cl = l.filter(function (x) { return x.id === 'clientes'; })[0], antesC = JSON.stringify(clientes());
              S.clientes = (cl && cl.lista) || [];
              if (JSON.stringify(S.clientes) !== antesC) { conciliarLog(); renderDatos(); }
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
  function ocupado() { return !!(S.em || S.ep || S.ef || S.ec || S.pegar || (S.prop && S.prop.length) || cargas.activas || S._ocup) || escribiendo(); }
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
