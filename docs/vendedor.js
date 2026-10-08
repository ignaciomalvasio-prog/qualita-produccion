/* Portal de vendedores · Qualitá
   Página para los vendedores externos: ingresan con su cuenta de Google, cargan los pedidos de sus
   clientes y ven si Qualitá ya los aceptó. Cada pedido queda en Firestore, colección "ventas", como
   pendiente; en la app principal (pestaña Pedidos) se acepta y pasa a ser un pedido más.
   Solo pueden cargar las cuentas que figuran como documento en /vendedores (se agregan desde la
   consola de Firebase, igual que los editores). Cada vendedor ve únicamente sus propios pedidos. */
(function () {
  'use strict';
  var FIREBASE = {
    version: '10.14.1',
    config: {
      apiKey: 'AIzaSyD9DSR82lLUigI8WeCjlR4nIc5I7xyjmTY',
      authDomain: 'qualita-produccion.firebaseapp.com',
      projectId: 'qualita-produccion',
      storageBucket: 'qualita-produccion.firebasestorage.app'
    }
  };
  // Productos de la lista de precios (solo código y nombre; los precios no se publican). El tercer dato es el rubro de la orden de producción.
  var PRODUCTOS = [
    [101, "Bondiola – Cajas x 10 Unid.", "BONDIOLA"],
    [131, "Paleta c/hueso s/cuero – Cajas x 4 Unid.", "PALETA"],
    [132, "Paleta c/hueso c/cuero – Cajas x 4 Unid.", "PALETA"],
    [134, "Pulpa Paleta c/cuero y s/hueso", "PALETA"],
    [139, "Paleta industrial – Cajas x 20 kgs.", "PALETA"],
    [141, "Paleta pulpa al rojo – Cajas x 20 kgs.", "PALETA"],
    [156, "Tapa de Paleta congelada", "TAPA DE PALETA"],
    [203, "Parrillero completo s/cuero", "PECHO"],
    [211, "Pechito con manta simple – Cajas x 5 Unid.", "PECHO"],
    [231, "Matambrito – Cajas x 10 Unid.", "MATAMBRE"],
    [241, "Churrasquito – Cajas x 20 kgs.", "CHURRASCO"],
    [251, "Panceta piano - Cajas x 4 Unid", "PECHO"],
    [271, "Carre con hueso s/solomillo – Cajas x 5 Unid.", "CARRE"],
    [281, "Carre con hueso c/solomillo – Cajas x 5 Unid.", "CARRE"],
    [285, "Solomillo – Cajas x 20 kgs.", "SOLOMILLO"],
    [289, "Cinta de lomo – Cajas x 20 kgs.", "CARRE"],
    [315, "Jamon c/hueso y c/cuero – Cajas x 2 Unid.", "JAMON"],
    [318, "Jamon con hueso sin cuero – Cajas x 2 Unid.", "JAMON"],
    [319, "Nalga - Cajas x 20 kgs.", "JAMON"],
    [321, "jamon sin cuero sin hueso y sin grasa – Cajas x 20 kgs.", "JAMON"],
    [322, "Cuadril - Cajas x 20 kgs.", "JAMON"],
    [324, "Peceto - Cajas x 20 kgs.", "JAMON"],
    [327, "Bola de Lomo - Cajas x 20 kgs.", "JAMON"],
    [329, "Cuadrada - Cajas x 20 kgs.", "JAMON"],
    [336, "Tapa de Jamón congelada", "TAPA DE JAMON"],
    [341, "Jamon 5 musculos – Cajas x 20 kgs.", "JAMON"],
    [349, "Jamón industrial – Cajas x 20 kgs.", "JAMON"],
    [361, "Recorte de 2º (80-20) – Cajas x 20 kgs.", "RECORTE"],
    [369, "Recorte 50/50 – Congelado Cajas x 20 kgs.", "RECORTE"],
    [381, "Tortuga – Cajas x 20 kgs.", "TORTUGA"],
    [401, "Garron – Cajas x 20 kgs.", "GARRON"],
    [406, "Patas – Manos – Cajas x 20 kgs.", "PATAS Y MANOS"],
    [411, "Cuero – Cajas x 20 kgs.", "CUERO"],
    [421, "Huesitos – Cajas x 20 kgs.", "HUESITOS"],
    [431, "Cabezas", "CABEZA"],
    [441, "Recorte de cabezas", "CABEZA"],
    [461, "Tocino – Cajas x 20 kgs.", "TOCINO"],
    [471, "Unto – Boneles x 20 kgs.", "UNTO"],
    [481, "Grasa – Cajas x 20 kgs.", "GRASA BUENA"],
    [501, "Lengua – Cajas x 10 kgs.", "MENUDENCIAS"],
    [502, "Higado – Cajas x 20 kgs.", "HIGADO"],
    [503, "Corazon – Cajas x 20 kgs.", "MENUDENCIAS"],
    [504, "Centro Entraña – Cajas x 20 kgs.", "MENUDENCIAS"],
    [505, "Riñon – Cajas x 20 kgs.", "MENUDENCIAS"],
    [506, "Rabo – Cajas x 10 kgs.", "MENUDENCIAS"],
    [508, "Panza – Cajas x 20 kgs.", "MENUDENCIAS"],
    [509, "Oreja – Cajas x 10 kgs.", "OREJAS"],
    [520, "Chinchulin – Cajas x 10 kgs.", "MENUDENCIAS"],
    [600, "Sangre", "MENUDENCIAS"],
    [2000, "Chorizo fresco especial (gancho o caja)", "EMBUTIDOS"],
    [2005, "Chorizo fresco especial E.V. - rosca (caja)", "EMBUTIDOS"],
    [2007, "Chorizo fresco especial E.V. X 4 Unid. (caja)", "EMBUTIDOS"],
    [2003, "Chorizo bombón fresco especial (gancho o caja)", "EMBUTIDOS"],
    [2006, "Chorizo bombón fresco espec. E.V.- rosca (caja)", "EMBUTIDOS"],
    [2101, "Chorizo bombón fresco espec. E.V.x 6 Un. (caja)", "EMBUTIDOS"],
    [2015, "Chorizo bombón fresco espec. E.V.x 4 Un. (caja)", "EMBUTIDOS"],
    [2051, "Chorizo especial en bandeja x 4 unidades", "EMBUTIDOS"],
    [2053, "Chorizo bombón en bandeja x 8 unidades", "EMBUTIDOS"],
    [2001, "Morcilla fresca (gancho o caja)", "EMBUTIDOS"],
    [2009, "Morcilla fresca E.V. - rosca (caja)", "EMBUTIDOS"],
    [2011, "Morcilla fresca E.V. X 4 Unidades (caja)", "EMBUTIDOS"],
    [2004, "Morcilla bombón fresca (gancho o caja)", "EMBUTIDOS"],
    [2010, "Morcilla bombón fresca E.V.-rosca (caja)", "EMBUTIDOS"],
    [2012, "Morcilla bombón fresca E.V. X 6 Unidades (caja)", "EMBUTIDOS"],
    [2061, "Morcilla en bandeja x 2 unidades", "EMBUTIDOS"],
    [2108, "Morcilla bombón en bandeja x 8 unidades", "EMBUTIDOS"],
    [2100, "Morcilla Bombón fresca x 4 unid.E.V.", "EMBUTIDOS"],
    [2002, "Salchicha fresca (gancho o caja)", "EMBUTIDOS"],
    [2110, "Salchicha fresca E.V.-rosca (caja)", "EMBUTIDOS"],
    [2112, "Salchicha fresca E.V.x 6 unid. (caja)", "EMBUTIDOS"],
    [2115, "Salchicha en bandeja", "EMBUTIDOS"]
  ];
  function etiqueta(p) { return p[0] + ' · ' + p[1]; }
  // Lo que se escribe en "Producto": si coincide con uno de la lista se guarda con su código y su rubro.
  function buscarProducto(txt) {
    var s = String(txt || '').trim(), m = s.match(/^(\d{3,4})\b/);
    return PRODUCTOS.filter(function (p) { return etiqueta(p) === s || (m && String(p[0]) === m[1]); })[0] || null;
  }
  function nombreCorte(c) { return c.producto ? c.producto + (c.art ? ' (ART ' + c.art + ')' : '') : c.corte; }
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  var S = { adj: { fotos: [], msg: '' }, adjMsg: '', adjErr: false, enviando: false, estado: 'cargando', user: null, nombre: '', ventas: [], form: null, msg: '', err: false, c2: null, filtro: 'todos' };
  var store = null, desuscribir = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fecha(s) { var x = String(s).split('-'); return new Date(+x[0], +x[1] - 1, +x[2]); }
  function hoy() { return iso(new Date()); }
  function habilSiguiente(s) { var d = fecha(s); do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); return iso(d); }
  function diaTxt(s) { if (!s) return ''; var d = fecha(s); return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }
  function ahoraTxt() { var d = new Date(); return d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3) + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function mayus(s) { return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function n(x) { return Number(x).toLocaleString('es-AR'); }

  function formVacio() { return { id: null, cliente: '', entrega: habilSiguiente(hoy()), medias: '', peso: '', nota: '', cortes: [{ corte: '', texto: '', frio: '' }] }; }

  /* ---------- pantalla ---------- */
  function render() {
    var ses = $('sesion');
    ses.innerHTML = S.user ? '<span>' + esc(S.user.email) + '</span><button class="btn sm lnk" data-act="salir">Salir</button>' : '';
    var el = $('app'), h = '';
    if (S.estado === 'cargando') h = '<div class="panel"><p class="state muted">Cargando…</p></div>';
    else if (S.estado === 'error') h = '<div class="panel"><p class="state">No se pudo conectar. Revisá la conexión y volvé a abrir la página.</p></div>';
    else if (!S.user) h = '<div class="panel"><h2>Cargá tus pedidos</h2><p>Ingresá para cargar los pedidos de tus clientes. Le llegan directo a Qualitá y desde acá ves si ya los aceptaron.</p>'
      + '<div class="acciones"><button class="btn pri grande" data-act="ingresar">Ingresar</button></div><p class="small muted">Con tu cuenta de Google o con tu mail y una contraseña.</p></div>';
    else if (S.estado === 'sin-permiso') h = '<div class="panel"><h2>Tu cuenta todavía no está habilitada</h2><p>Ingresaste como <b>' + esc(S.user.email) + '</b>. Pedile a Qualitá que te habilite esta cuenta como vendedor y después volvé a abrir la página.</p>'
      + '<div class="acciones"><button class="btn" data-act="reintentar">Ya me habilitaron</button><button class="btn lnk" data-act="salir">Ingresar con otra cuenta</button></div></div>';
    else h = adjHTML() + formHTML() + listaHTML();
    el.innerHTML = h;
  }

  // Foto o mensaje: se manda tal cual y Qualitá lo lee con la IA, como hace Renzo con los pedidos que le llegan.
  function adjHTML() {
    var a = S.adj;
    return '<div class="panel carga" id="adj"><h2>Mandar foto o mensaje</h2><p class="small">Sacale foto al pedido o pegá el mensaje de WhatsApp. Qualitá lo lee y lo carga; vos lo ves abajo en "Mis pedidos".</p>'
      + '<div class="acciones"><label class="btn pri">Subir fotos<input type="file" id="adj-fotos" accept="image/*" multiple hidden></label><span class="small muted">Hasta 4 fotos por envío</span></div>'
      + (a.fotos.length ? '<div class="miniaturas">' + a.fotos.map(function (b, i) { return '<div class="mini"><img src="data:image/jpeg;base64,' + b + '" alt="Foto ' + (i + 1) + '"><button type="button" class="btn x" data-act="adj-quitar" data-i="' + i + '" aria-label="Quitar la foto ' + (i + 1) + '">✕</button></div>'; }).join('') + '</div>' : '')
      + '<label class="campo"><span>Mensaje (opcional)</span><textarea id="adj-msg" placeholder="Pegá acá el pedido o escribí una aclaración">' + esc(a.msg) + '</textarea></label>'
      + '<div class="acciones"><button class="btn pri grande" data-act="adj-enviar"' + (S.enviando ? ' disabled' : '') + '>' + (S.enviando ? 'Enviando…' : 'Enviar a Qualitá') + '</button>'
      + '<span class="msg' + (S.adjErr ? ' err' : '') + '" id="adj-aviso" role="status">' + esc(S.adjMsg) + '</span></div></div>'
      + '<p class="o-mano">o cargalo a mano</p>';
  }
  function avisoAdj(t, err) { S.adjMsg = t; S.adjErr = !!err; var e = $('adj-aviso'); if (e) { e.textContent = t; e.className = 'msg' + (err ? ' err' : ''); } }
  // Achica la foto para que entre en la base (hasta ~1 MB por envío entre todas).
  function achicar(file, max, q) {
    return new Promise(function (ok, no) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', q).split(',')[1]);
      };
      img.onerror = function () { URL.revokeObjectURL(url); no(new Error('No se pudo abrir la imagen.')); };
      img.src = url;
    });
  }
  function sumarFotos(files) {
    var l = Array.prototype.slice.call(files || []).slice(0, Math.max(0, 4 - S.adj.fotos.length));
    if (!l.length) { avisoAdj('Ya hay 4 fotos. Mandalas y después subí las demás.', true); return; }
    leerAdj(); avisoAdj('Preparando ' + (l.length === 1 ? 'la foto' : 'las fotos') + '…');
    var cuota = Math.floor(880000 / Math.min(4, S.adj.fotos.length + l.length));
    Promise.all(l.map(function (f) {
      if (window.__mock && window.__mock.foto) return Promise.resolve(window.__mock.foto(f.name));
      // Primero con buena calidad; si queda pesada, se achica más hasta que entre.
      var intentos = [[1800, 0.8], [1600, 0.72], [1400, 0.65], [1200, 0.6], [1000, 0.55]];
      return (function prob(i) { return achicar(f, intentos[i][0], intentos[i][1]).then(function (b) { return b.length <= cuota || i === intentos.length - 1 ? b : prob(i + 1); }); })(0);
    })).then(function (bs) { S.adj.fotos = S.adj.fotos.concat(bs); S.adjMsg = ''; render(); }, function (e) { avisoAdj(e.message, true); });
  }
  function leerAdj() { var m = $('adj-msg'); if (m) S.adj.msg = m.value; }
  function enviarAdj() {
    leerAdj();
    var a = S.adj, msg = String(a.msg || '').trim();
    if (!a.fotos.length && !msg) return avisoAdj('Subí una foto o pegá el mensaje.', true);
    var peso = a.fotos.reduce(function (t, b) { return t + b.length; }, 0) + msg.length;
    if (peso > 950000) return avisoAdj('Las fotos son muy pesadas. Mandalas de a una.', true);
    var doc = { vendedor: S.user.email, nombre: S.nombre || '', tipo: 'archivo', cliente: '', entrega: '', medias: 0, cortes: [], fotos: a.fotos.slice(), mensaje: msg, estado: 'pendiente', creado: ahoraTxt(), ts: Date.now() };
    S.enviando = true; render();
    store.set('ventas', 'v' + uid(), doc).then(function () {
      S.enviando = false; S.adj = { fotos: [], msg: '' }; S.adjMsg = 'Enviado. Qualitá ya lo puede ver.'; S.adjErr = false; render();
    }, function () { S.enviando = false; render(); avisoAdj('No se pudo enviar. Revisá la conexión y probá de nuevo.', true); });
  }

  function formHTML() {
    var f = S.form || (S.form = formVacio()), edita = !!f.id;
    var clientes = {}; S.ventas.forEach(function (v) { if (v.cliente) clientes[v.cliente] = 1; (v.clientes ? String(v.clientes).split(', ') : []).forEach(function (c) { if (c) clientes[c] = 1; }); });
    var h = '<div class="panel carga" id="form"><h2>' + (edita ? 'Editando el pedido de ' + esc(f.cliente) : 'Nuevo pedido') + '</h2><div class="campos">'
      + '<label class="campo ancho"><span>Cliente</span><input type="text" id="f-cliente" list="l-clientes" autocomplete="off" value="' + esc(f.cliente) + '" placeholder="Nombre del cliente (y sucursal si tiene)"></label>'
      + '<datalist id="l-clientes">' + Object.keys(clientes).sort().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>'
      + '<label class="campo"><span>Fecha de entrega</span><input type="date" id="f-entrega" min="' + hoy() + '" value="' + esc(f.entrega) + '"></label>'
      + '<label class="campo"><span>Medias (van frescas)</span><input type="number" inputmode="numeric" min="0" id="f-medias" value="' + esc(f.medias) + '" placeholder="0"></label>'
      + '<label class="campo"><span>Peso de las medias</span><input type="text" id="f-peso" value="' + esc(f.peso) + '" placeholder="Opcional, ej. 90 a 100 kg"></label>'
      + '</div>'
      + '<div class="cortes"><h3>Productos</h3><div class="cortes-tit"><span>Producto</span><span>Cantidad</span><span>Fresco o congelado</span><span></span></div>'
      + f.cortes.map(function (c, i) {
        return '<div class="corte"><input type="text" list="l-cortes" data-c="corte" data-i="' + i + '" value="' + esc(c.corte) + '" placeholder="Escribí el nombre o el código" aria-label="Producto ' + (i + 1) + '">'
          + '<input type="text" class="det" data-c="texto" data-i="' + i + '" value="' + esc(c.texto) + '" placeholder="Ej. 10 cajas, 300 kg" aria-label="Cantidad del producto ' + (i + 1) + '">'
          + '<div class="chips frio">' + ['FRESCO', 'CONGELADO'].map(function (x) { return '<button type="button" class="btn sm" data-act="frio" data-i="' + i + '" data-v="' + x + '" aria-pressed="' + (c.frio === x) + '">' + (x === 'FRESCO' ? 'Fresco' : 'Congelado') + '</button>'; }).join('') + '</div>'
          + '<button type="button" class="btn x" data-act="c-quitar" data-i="' + i + '" aria-label="Quitar este producto">✕</button></div>';
      }).join('')
      + '<datalist id="l-cortes">' + PRODUCTOS.map(function (p) { return '<option value="' + esc(etiqueta(p)) + '">'; }).join('') + '</datalist>'
      + '<div><button type="button" class="btn sm" data-act="c-agregar">+ Agregar producto</button></div></div>'
      + '<label class="campo"><span>Nota</span><textarea id="f-nota" placeholder="Horario, dirección, lo que haga falta">' + esc(f.nota) + '</textarea></label>'
      + '<div class="acciones"><button class="btn pri grande" data-act="enviar">' + (edita ? 'Guardar cambios' : 'Enviar pedido') + '</button>'
      + (edita ? '<button class="btn" data-act="cancelar">Cancelar</button>' : '')
      + '<span class="msg' + (S.err ? ' err' : '') + '" id="msg" role="status">' + esc(S.msg) + '</span></div></div>';
    return h;
  }

  function badgeFrio(f) { return '<span class="badge ' + (f === 'CONGELADO' ? 'cong' : 'fresco') + '">' + esc(f) + '</span>'; }
  function estadoBadge(v) {
    if (v.estado === 'aceptado') return '<span class="badge ok">Aceptado</span>';
    if (v.estado === 'rechazado') return '<span class="badge no">Rechazado</span>';
    return '<span class="badge pend">Pendiente</span>';
  }
  function listaHTML() {
    var l = S.ventas.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    var cuenta = { pendiente: 0, aceptado: 0, rechazado: 0 }; l.forEach(function (v) { cuenta[v.estado] = (cuenta[v.estado] || 0) + 1; });
    if (S.filtro !== 'todos') l = l.filter(function (v) { return v.estado === S.filtro; });
    var h = '<div class="panel"><h2>Mis pedidos</h2>';
    if (!S.ventas.length) return h + '<p class="muted">Todavía no cargaste pedidos.</p></div>';
    h += '<div class="filtro">' + [['todos', 'Todos', S.ventas.length], ['pendiente', 'Pendientes', cuenta.pendiente], ['aceptado', 'Aceptados', cuenta.aceptado], ['rechazado', 'Rechazados', cuenta.rechazado]]
      .map(function (x) { return '<button class="btn sm" data-act="filtro" data-v="' + x[0] + '" aria-pressed="' + (S.filtro === x[0]) + '">' + x[1] + ' ' + x[2] + '</button>'; }).join('') + '</div>';
    if (!l.length) h += '<p class="muted">No hay pedidos en esta lista.</p>';
    l.forEach(function (v) {
      var id = esc(v.id);
      if (v.tipo === 'archivo') {
        var nf = (v.fotos || []).length;
        h += '<div class="mio"><div class="mio-cab"><span class="nom">' + (nf ? (nf === 1 ? 'Foto' : nf + ' fotos') + (v.mensaje ? ' y mensaje' : '') : 'Mensaje') + '</span>' + estadoBadge(v) + '</div>'
          + '<p class="small muted">' + (v.creado ? 'Enviado el ' + esc(v.creado) : '') + (v.leidos ? ' · Qualitá cargó ' + v.leidos + (v.leidos === 1 ? ' pedido' : ' pedidos') + (v.clientes ? ': ' + esc(v.clientes) : '') : '') + '</p>'
          + (nf ? '<div class="miniaturas">' + v.fotos.map(function (b) { return '<div class="mini"><img src="data:image/jpeg;base64,' + b + '" alt=""></div>'; }).join('') + '</div>' : '')
          + (v.mensaje ? '<p class="small msg-txt">' + esc(v.mensaje) + '</p>' : '');
        if (v.estado === 'rechazado' && v.motivo) h += '<p class="small"><b>Motivo:</b> ' + esc(v.motivo) + '</p>';
        if (v.estado === 'pendiente') h += '<div class="acciones"><button class="btn sm rojo" data-act="borrar" data-id="' + id + '">' + (S.c2 === 'borrar' + v.id ? 'Tocá de nuevo para borrarlo' : 'Borrar') + '</button></div>';
        h += '</div>'; return;
      }
      h += '<div class="mio"><div class="mio-cab"><span class="nom">' + esc(v.cliente) + '</span>' + estadoBadge(v) + '</div>'
        + '<p class="small muted">Entrega el ' + esc(diaTxt(v.entrega)) + (v.creado ? ' · cargado el ' + esc(v.creado) : '') + '</p><ul>';
      if (+v.medias) h += '<li><b>Medias</b> ' + n(+v.medias) + (v.peso ? ' · ' + esc(v.peso) : '') + '</li>';
      (v.cortes || []).forEach(function (c) { h += '<li><b>' + esc(nombreCorte(c)) + '</b> ' + esc(c.texto) + (c.frio ? ' ' + badgeFrio(c.frio) : '') + '</li>'; });
      h += '</ul>' + (v.nota ? '<p class="small">' + esc(v.nota) + '</p>' : '');
      if (v.estado === 'rechazado' && v.motivo) h += '<p class="small"><b>Motivo:</b> ' + esc(v.motivo) + '</p>';
      if (v.estado === 'pendiente') h += '<div class="acciones"><button class="btn sm" data-act="editar" data-id="' + id + '">Editar</button>'
        + '<button class="btn sm rojo" data-act="borrar" data-id="' + id + '">' + (S.c2 === 'borrar' + v.id ? 'Tocá de nuevo para borrarlo' : 'Borrar') + '</button></div>';
      else if (v.estado === 'aceptado') h += '<p class="small muted">Ya está en manos de Qualitá. Si necesitás cambiar algo, avisales.</p>';
      h += '</div>';
    });
    return h + '</div>';
  }

  /* ---------- formulario ---------- */
  function leerForm() {
    leerAdj();
    var f = S.form; if (!f || !$('f-cliente')) return;
    f.cliente = $('f-cliente').value; f.entrega = $('f-entrega').value; f.medias = $('f-medias').value; f.peso = $('f-peso').value; f.nota = $('f-nota').value;
    Array.prototype.forEach.call(document.querySelectorAll('[data-c]'), function (e) { var c = f.cortes[+e.getAttribute('data-i')]; if (c) c[e.getAttribute('data-c')] = e.value; });
  }
  function aviso(t, err) { S.msg = t; S.err = !!err; var e = $('msg'); if (e) { e.textContent = t; e.className = 'msg' + (err ? ' err' : ''); } }

  function enviar() {
    leerForm();
    var f = S.form, medias = Math.max(0, Math.round(+f.medias || 0));
    var cortes = f.cortes.filter(function (c) { return String(c.corte || '').trim() || String(c.texto || '').trim(); }).map(function (c) {
      var p = buscarProducto(c.corte), x = { corte: p ? p[2] : mayus(c.corte), texto: mayus(c.texto), frio: c.frio || '' };
      if (p) { x.producto = mayus(p[1]); x.art = p[0]; }
      return x;
    });
    // Si todos los cortes van igual, el pedido lleva ese cartelito; si se mezclan, va en cada corte.
    var frios = cortes.map(function (c) { return c.frio; }), frio = frios.length && frios.every(function (x) { return x && x === frios[0]; }) ? frios[0] : '';
    if (!mayus(f.cliente)) return aviso('Falta el cliente.', true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.entrega || '')) return aviso('Falta la fecha de entrega.', true);
    if (f.entrega < hoy()) return aviso('La fecha de entrega ya pasó.', true);
    if (cortes.some(function (c) { return !c.texto; })) return aviso('Escribí la cantidad de cada producto.', true);
    if (cortes.some(function (c) { return !c.corte; })) return aviso('Falta el producto en algún renglón.', true);
    if (!medias && !cortes.length) return aviso('Cargá medias o al menos un producto.', true);
    var previo = f.id ? S.ventas.filter(function (v) { return v.id === f.id; })[0] : null;
    if (previo && previo.estado !== 'pendiente') return aviso('Este pedido ya fue revisado por Qualitá y no se puede cambiar.', true);
    var doc = { vendedor: S.user.email, nombre: S.nombre || '', cliente: mayus(f.cliente), entrega: f.entrega, medias: medias, peso: String(f.peso || '').trim(), frio: frio,
      cortes: cortes, nota: String(f.nota || '').trim(), estado: 'pendiente', creado: previo ? previo.creado : ahoraTxt(), ts: previo ? previo.ts : Date.now() };
    if (previo) doc.editado = ahoraTxt();
    var id = f.id || 'v' + uid(), boton = document.querySelector('[data-act="enviar"]');
    if (boton) boton.disabled = true;
    aviso('Enviando…');
    store.set('ventas', id, doc).then(function () {
      S.form = formVacio(); S.msg = previo ? 'Cambios guardados.' : 'Pedido enviado. Qualitá ya lo puede ver.'; S.err = false; render();
    }, function () { if (boton) boton.disabled = false; aviso('No se pudo enviar. Revisá la conexión y probá de nuevo.', true); });
  }

  document.addEventListener('change', function (e) { if (e.target && e.target.id === 'adj-fotos') { sumarFotos(e.target.files); e.target.value = ''; } });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var a = b.getAttribute('data-act'), id = b.getAttribute('data-id');
    if (a !== 'borrar') S.c2 = null;
    if (a === 'ingresar') { if (window.Acceso) window.Acceso.abrir(store); else store.signIn().catch(function () {}); }
    else if (a === 'salir') store.signOut();
    else if (a === 'reintentar') { S.estado = 'cargando'; render(); revisar(S.user); }
    else if (a === 'frio') { leerForm(); var v = b.getAttribute('data-v'), cf = S.form.cortes[+b.getAttribute('data-i')]; if (cf) cf.frio = cf.frio === v ? '' : v; render(); }
    else if (a === 'c-agregar') { leerForm(); S.form.cortes.push({ corte: '', texto: '', frio: '' }); render(); var u = document.querySelectorAll('[data-c="corte"]'); if (u.length) u[u.length - 1].focus(); }
    else if (a === 'c-quitar') { leerForm(); S.form.cortes.splice(+b.getAttribute('data-i'), 1); if (!S.form.cortes.length) S.form.cortes.push({ corte: '', texto: '', frio: '' }); render(); }
    else if (a === 'enviar') enviar();
    else if (a === 'adj-enviar') enviarAdj();
    else if (a === 'adj-quitar') { leerAdj(); S.adj.fotos.splice(+b.getAttribute('data-i'), 1); render(); }
    else if (a === 'cancelar') { S.form = formVacio(); S.msg = ''; render(); }
    else if (a === 'filtro') { leerForm(); S.filtro = b.getAttribute('data-v'); render(); }
    else if (a === 'editar') {
      var v2 = S.ventas.filter(function (x) { return x.id === id; })[0]; if (!v2) return;
      S.form = { id: v2.id, cliente: v2.cliente, entrega: v2.entrega, medias: v2.medias || '', peso: v2.peso || '', nota: v2.nota || '', cortes: clone(v2.cortes || []).map(function (c) { var p = c.art && PRODUCTOS.filter(function (x) { return x[0] === c.art; })[0]; return { corte: p ? etiqueta(p) : c.corte, texto: c.texto, frio: c.frio || v2.frio || '' }; }) };
      if (!S.form.cortes.length) S.form.cortes.push({ corte: '', texto: '', frio: '' });
      S.msg = ''; render(); $('form').scrollIntoView({ behavior: 'smooth' });
    }
    else if (a === 'borrar') {
      leerForm();
      if (S.c2 !== 'borrar' + id) { S.c2 = 'borrar' + id; render(); return; }
      S.c2 = null;
      store.del('ventas', id).then(function () { if (S.form && S.form.id === id) S.form = formVacio(); render(); }, function () { aviso('No se pudo borrar.', true); });
    }
  });

  /* ---------- datos ---------- */
  function revisar(u) {
    if (desuscribir) { desuscribir(); desuscribir = null; }
    S.user = u ? { email: u.email } : null; S.ventas = [];
    if (!u) { S.estado = 'listo'; render(); return; }
    // Entró con mail y todavía no lo confirmó: hasta que lo confirme no puede cargar nada.
    if (u.emailVerified === false) { S.user = null; S.estado = 'listo'; render(); if (window.Acceso) window.Acceso.verificar(store, u.email); return; }
    store.vendedor(u.email).then(function (d) {
      if (!d) { S.estado = 'sin-permiso'; render(); return; }
      S.nombre = d.nombre || u.displayName || ''; S.estado = 'listo';
      desuscribir = store.mias(u.email, function (l) {
        S.ventas = l;
        if (S.form && S.form.id && !l.some(function (v) { return v.id === S.form.id && v.estado === 'pendiente'; })) { S.form = formVacio(); S.msg = 'Ese pedido ya lo revisó Qualitá.'; S.err = true; }
        leerForm(); render();
      }, function () { S.estado = 'error'; render(); });
      render();
    });
  }

  function mockStore(m) {
    var subs = [];
    function emit() { subs.forEach(function (s) { s.cb(Object.keys(m.data.ventas || {}).map(function (id) { var o = clone(m.data.ventas[id]); o.id = id; return o; }).filter(function (v) { return v.vendedor === s.email; })); }); }
    m.emit = emit;
    return {
      onAuth: function (cb) { m.authCb = cb; setTimeout(function () { cb(m.user || null); }, 0); },
      signIn: function () { m.user = { email: m.loginAs, displayName: 'Prueba' }; m.authCb(m.user); return Promise.resolve(); },
      google: function () { m.user = { email: m.loginAs, emailVerified: true }; m.authCb(m.user); return Promise.resolve(); },
      entrarMail: function (e) { if (m.malClave) return Promise.reject({ code: 'auth/invalid-credential' }); m.user = { email: e, emailVerified: !!m.verificado }; m.authCb(m.user); return Promise.resolve(m.user); },
      crearMail: function (e) { m.user = { email: e, emailVerified: false }; m.mails = (m.mails || 0) + 1; m.authCb(m.user); return Promise.resolve(); },
      olvide: function () { m.reset = (m.reset || 0) + 1; return Promise.resolve(); },
      reenviar: function () { m.mails = (m.mails || 0) + 1; return Promise.resolve(); },
      confirmar: function () { if (!m.verificado) return Promise.resolve(false); m.user.emailVerified = true; m.authCb(m.user); return Promise.resolve(true); },
      signOut: function () { m.user = null; m.authCb(null); return Promise.resolve(); },
      vendedor: function (email) { return Promise.resolve(m.vendedores && m.vendedores[email] ? m.vendedores[email] : null); },
      mias: function (email, cb) { var s = { email: email, cb: cb }; subs.push(s); setTimeout(emit, 0); return function () { subs = subs.filter(function (x) { return x !== s; }); }; },
      set: function (c, id, d) { if (m.fallar) return Promise.reject(new Error('x')); m.data[c] = m.data[c] || {}; m.data[c][id] = clone(d); setTimeout(emit, 0); return Promise.resolve(); },
      del: function (c, id) { delete m.data[c][id]; setTimeout(emit, 0); return Promise.resolve(); }
    };
  }
  function firebaseStore() {
    var base = 'https://www.gstatic.com/firebasejs/' + FIREBASE.version + '/';
    return Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js'), import(base + 'firebase-auth.js')]).then(function (m) {
      var app = m[0].initializeApp(FIREBASE.config), fs = m[1], au = m[2], db = fs.getFirestore(app), auth = au.getAuth(app), authCb = null;
      auth.languageCode = 'es';
      return {
        onAuth: function (cb) { authCb = cb; return au.onAuthStateChanged(auth, cb); },
        google: function () { var p = new au.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return au.signInWithPopup(auth, p); },
        entrarMail: function (e, p) { return au.signInWithEmailAndPassword(auth, e, p).then(function (c) { return c.user; }); },
        crearMail: function (e, p) { return au.createUserWithEmailAndPassword(auth, e, p).then(function (c) { return au.sendEmailVerification(c.user, { url: location.origin + location.pathname }); }); },
        olvide: function (e) { return au.sendPasswordResetEmail(auth, e); },
        reenviar: function () { return auth.currentUser ? au.sendEmailVerification(auth.currentUser, { url: location.origin + location.pathname }) : Promise.resolve(); },
        // Después de tocar el link del mail: se relee la cuenta y se pide un permiso nuevo, que ya dice "verificado".
        confirmar: function () { var u = auth.currentUser; if (!u) return Promise.resolve(false); return u.reload().then(function () { return u.getIdToken(true); }).then(function () { if (u.emailVerified && authCb) authCb(auth.currentUser); return u.emailVerified; }); },
        signIn: function () { var p = new au.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return au.signInWithPopup(auth, p); },
        signOut: function () { return au.signOut(auth); },
        vendedor: function (email) { return fs.getDoc(fs.doc(db, 'vendedores', email)).then(function (s) { return s.exists() ? (s.data() || {}) : null; }, function () { return null; }); },
        mias: function (email, cb, err) {
          return fs.onSnapshot(fs.query(fs.collection(db, 'ventas'), fs.where('vendedor', '==', email)), function (snap) { cb(snap.docs.map(function (x) { var o = x.data(); o.id = x.id; return o; })); }, err);
        },
        set: function (c, id, d) { return fs.setDoc(fs.doc(db, c, id), d); },
        del: function (c, id) { return fs.deleteDoc(fs.doc(db, c, id)); }
      };
    });
  }

  render();
  (window.__mock ? Promise.resolve(mockStore(window.__mock)) : firebaseStore()).then(function (st) { store = st; store.onAuth(revisar); }, function () { S.estado = 'error'; render(); });
})();
