/* Pedidos Qualitá · Vendedores
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
  var CORTES = ['JAMON', 'PALETA', 'PECHO', 'CARRE', 'SOLOMILLO', 'MATAMBRE', 'BONDIOLA', 'RECORTE', 'GRASA BUENA', 'GRASA MALA', 'CUERO', 'TAPA DE PALETA', 'TAPA DE JAMON', 'TORTUGA', 'GARRON', 'TOCINO', 'CHURRASCO', 'PAPADA', 'OREJAS', 'CABEZA', 'PULMON', 'HIGADO', 'PATAS Y MANOS'];
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  var S = { estado: 'cargando', user: null, nombre: '', ventas: [], form: null, msg: '', err: false, c2: null, filtro: 'todos' };
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

  function formVacio() { return { id: null, cliente: '', entrega: habilSiguiente(hoy()), medias: '', peso: '', frio: '', nota: '', cortes: [{ corte: '', texto: '' }] }; }

  /* ---------- pantalla ---------- */
  function render() {
    var ses = $('sesion');
    ses.innerHTML = S.user ? '<span>' + esc(S.user.email) + '</span><button class="btn sm lnk" data-act="salir">Salir</button>' : '';
    var el = $('app'), h = '';
    if (S.estado === 'cargando') h = '<div class="panel"><p class="state muted">Cargando…</p></div>';
    else if (S.estado === 'error') h = '<div class="panel"><p class="state">No se pudo conectar. Revisá la conexión y volvé a abrir la página.</p></div>';
    else if (!S.user) h = '<div class="panel"><h2>Cargá tus pedidos</h2><p>Ingresá con tu cuenta de Google para cargar los pedidos de tus clientes. Le llegan directo a Qualitá y desde acá ves si ya los aceptaron.</p>'
      + '<div class="acciones"><button class="btn pri grande" data-act="ingresar">Ingresar con Google</button></div></div>';
    else if (S.estado === 'sin-permiso') h = '<div class="panel"><h2>Tu cuenta todavía no está habilitada</h2><p>Ingresaste como <b>' + esc(S.user.email) + '</b>. Pedile a Qualitá que te habilite esta cuenta como vendedor y después volvé a abrir la página.</p>'
      + '<div class="acciones"><button class="btn" data-act="reintentar">Ya me habilitaron</button><button class="btn lnk" data-act="salir">Ingresar con otra cuenta</button></div></div>';
    else h = formHTML() + listaHTML();
    el.innerHTML = h;
  }

  function formHTML() {
    var f = S.form || (S.form = formVacio()), edita = !!f.id;
    var clientes = {}; S.ventas.forEach(function (v) { if (v.cliente) clientes[v.cliente] = 1; });
    var h = '<div class="panel carga" id="form"><h2>' + (edita ? 'Editando el pedido de ' + esc(f.cliente) : 'Nuevo pedido') + '</h2><div class="campos">'
      + '<label class="campo ancho"><span>Cliente</span><input type="text" id="f-cliente" list="l-clientes" autocomplete="off" value="' + esc(f.cliente) + '" placeholder="Nombre del cliente (y sucursal si tiene)"></label>'
      + '<datalist id="l-clientes">' + Object.keys(clientes).sort().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>'
      + '<label class="campo"><span>Fecha de entrega</span><input type="date" id="f-entrega" min="' + hoy() + '" value="' + esc(f.entrega) + '"></label>'
      + '<label class="campo"><span>Medias</span><input type="number" inputmode="numeric" min="0" id="f-medias" value="' + esc(f.medias) + '" placeholder="0"></label>'
      + '<label class="campo"><span>Peso de las medias</span><input type="text" id="f-peso" value="' + esc(f.peso) + '" placeholder="Opcional, ej. 90 a 100 kg"></label>'
      + '<div class="campo"><span>Fresco o congelado</span><div class="chips">'
      + ['FRESCO', 'CONGELADO'].map(function (x) { return '<button type="button" class="btn sm" data-act="frio" data-v="' + x + '" aria-pressed="' + (f.frio === x) + '">' + (x === 'FRESCO' ? 'Fresco' : 'Congelado') + '</button>'; }).join('')
      + '</div></div></div>'
      + '<div class="cortes"><h3>Cortes</h3><div class="cortes-tit"><span>Corte</span><span>Cantidad y detalle</span><span></span></div>'
      + f.cortes.map(function (c, i) {
        return '<div class="corte"><input type="text" list="l-cortes" data-c="corte" data-i="' + i + '" value="' + esc(c.corte) + '" placeholder="Corte" aria-label="Corte ' + (i + 1) + '">'
          + '<input type="text" class="det" data-c="texto" data-i="' + i + '" value="' + esc(c.texto) + '" placeholder="Ej. 10 CAJAS, 300 KG" aria-label="Cantidad y detalle del corte ' + (i + 1) + '">'
          + '<button type="button" class="btn x" data-act="c-quitar" data-i="' + i + '" aria-label="Quitar este corte">✕</button></div>';
      }).join('')
      + '<datalist id="l-cortes">' + CORTES.map(function (c) { return '<option value="' + c + '">'; }).join('') + '</datalist>'
      + '<div><button type="button" class="btn sm" data-act="c-agregar">+ Agregar corte</button></div></div>'
      + '<label class="campo"><span>Nota</span><textarea id="f-nota" placeholder="Horario, dirección, lo que haga falta">' + esc(f.nota) + '</textarea></label>'
      + '<div class="acciones"><button class="btn pri grande" data-act="enviar">' + (edita ? 'Guardar cambios' : 'Enviar pedido') + '</button>'
      + (edita ? '<button class="btn" data-act="cancelar">Cancelar</button>' : '')
      + '<span class="msg' + (S.err ? ' err' : '') + '" id="msg" role="status">' + esc(S.msg) + '</span></div></div>';
    return h;
  }

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
      h += '<div class="mio"><div class="mio-cab"><span class="nom">' + esc(v.cliente) + '</span>' + estadoBadge(v) + (v.frio ? ' <span class="badge ' + (v.frio === 'CONGELADO' ? 'cong' : 'fresco') + '">' + esc(v.frio) + '</span>' : '') + '</div>'
        + '<p class="small muted">Entrega el ' + esc(diaTxt(v.entrega)) + (v.creado ? ' · cargado el ' + esc(v.creado) : '') + '</p><ul>';
      if (+v.medias) h += '<li><b>Medias</b> ' + n(+v.medias) + (v.peso ? ' · ' + esc(v.peso) : '') + '</li>';
      (v.cortes || []).forEach(function (c) { h += '<li><b>' + esc(c.corte) + '</b> ' + esc(c.texto) + '</li>'; });
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
    var f = S.form; if (!f || !$('f-cliente')) return;
    f.cliente = $('f-cliente').value; f.entrega = $('f-entrega').value; f.medias = $('f-medias').value; f.peso = $('f-peso').value; f.nota = $('f-nota').value;
    Array.prototype.forEach.call(document.querySelectorAll('[data-c]'), function (e) { var c = f.cortes[+e.getAttribute('data-i')]; if (c) c[e.getAttribute('data-c')] = e.value; });
  }
  function aviso(t, err) { S.msg = t; S.err = !!err; var e = $('msg'); if (e) { e.textContent = t; e.className = 'msg' + (err ? ' err' : ''); } }

  function enviar() {
    leerForm();
    var f = S.form, medias = Math.max(0, Math.round(+f.medias || 0));
    var cortes = f.cortes.map(function (c) { return { corte: mayus(c.corte), texto: mayus(c.texto) }; }).filter(function (c) { return c.corte || c.texto; });
    if (!mayus(f.cliente)) return aviso('Falta el cliente.', true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.entrega || '')) return aviso('Falta la fecha de entrega.', true);
    if (f.entrega < hoy()) return aviso('La fecha de entrega ya pasó.', true);
    if (cortes.some(function (c) { return !c.texto; })) return aviso('Escribí la cantidad de cada corte.', true);
    if (cortes.some(function (c) { return !c.corte; })) return aviso('Falta el nombre de algún corte.', true);
    if (!medias && !cortes.length) return aviso('Cargá medias o al menos un corte.', true);
    var previo = f.id ? S.ventas.filter(function (v) { return v.id === f.id; })[0] : null;
    if (previo && previo.estado !== 'pendiente') return aviso('Este pedido ya fue revisado por Qualitá y no se puede cambiar.', true);
    var doc = { vendedor: S.user.email, nombre: S.nombre || '', cliente: mayus(f.cliente), entrega: f.entrega, medias: medias, peso: String(f.peso || '').trim(), frio: f.frio || '',
      cortes: cortes, nota: String(f.nota || '').trim(), estado: 'pendiente', creado: previo ? previo.creado : ahoraTxt(), ts: previo ? previo.ts : Date.now() };
    if (previo) doc.editado = ahoraTxt();
    var id = f.id || 'v' + uid(), boton = document.querySelector('[data-act="enviar"]');
    if (boton) boton.disabled = true;
    aviso('Enviando…');
    store.set('ventas', id, doc).then(function () {
      S.form = formVacio(); S.msg = previo ? 'Cambios guardados.' : 'Pedido enviado. Qualitá ya lo puede ver.'; S.err = false; render();
    }, function () { if (boton) boton.disabled = false; aviso('No se pudo enviar. Revisá la conexión y probá de nuevo.', true); });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var a = b.getAttribute('data-act'), id = b.getAttribute('data-id');
    if (a !== 'borrar') S.c2 = null;
    if (a === 'ingresar') store.signIn().catch(function () {});
    else if (a === 'salir') store.signOut();
    else if (a === 'reintentar') { S.estado = 'cargando'; render(); revisar(S.user); }
    else if (a === 'frio') { leerForm(); var v = b.getAttribute('data-v'); S.form.frio = S.form.frio === v ? '' : v; render(); }
    else if (a === 'c-agregar') { leerForm(); S.form.cortes.push({ corte: '', texto: '' }); render(); var u = document.querySelectorAll('[data-c="corte"]'); if (u.length) u[u.length - 1].focus(); }
    else if (a === 'c-quitar') { leerForm(); S.form.cortes.splice(+b.getAttribute('data-i'), 1); if (!S.form.cortes.length) S.form.cortes.push({ corte: '', texto: '' }); render(); }
    else if (a === 'enviar') enviar();
    else if (a === 'cancelar') { S.form = formVacio(); S.msg = ''; render(); }
    else if (a === 'filtro') { leerForm(); S.filtro = b.getAttribute('data-v'); render(); }
    else if (a === 'editar') {
      var v2 = S.ventas.filter(function (x) { return x.id === id; })[0]; if (!v2) return;
      S.form = { id: v2.id, cliente: v2.cliente, entrega: v2.entrega, medias: v2.medias || '', peso: v2.peso || '', frio: v2.frio || '', nota: v2.nota || '', cortes: clone(v2.cortes || []) };
      if (!S.form.cortes.length) S.form.cortes.push({ corte: '', texto: '' });
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
      var app = m[0].initializeApp(FIREBASE.config), fs = m[1], au = m[2], db = fs.getFirestore(app), auth = au.getAuth(app);
      return {
        onAuth: function (cb) { return au.onAuthStateChanged(auth, cb); },
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
