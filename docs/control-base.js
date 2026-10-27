/* Centro de control Ciclo III y Qualitá Express · conexión con Firebase (link /control y /caja)
   - Ingreso con Google o mail (acceso.js). Entran los editores de la app y las cuentas que figuran en /c3usuarios
     (rol "todo" = Carlos y quien controla; rol "caja" = el encargado del local, solo la planilla de caja).
   - Los datos del sistema de gestión los sube la notebook de Igna todos los días a las 8 h y a las 20 h (C:\InformeQualita\ciclo3\c3_sync.ps1)
     a /c3sis: "mes-AAAA-MM" (remitos, producción, ventas, stock) e "ins" (insumos, compras y producción).
   - Lo que se carga a mano va en /c3docs/{nombre} = { json, ver, por, ts } y cada cambio deja un renglón en /c3cambios.
   - Modo de prueba: si existe window.__mock = { user, rol, sis: {id: txt}, docs: {nombre: objeto} } no usa Firebase. */
window.C3API = (function () {
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
  var api = { usuario: null, rol: '', editor: false };
  var resolverListo, store = null;
  api.listo = new Promise(function (r) { resolverListo = r; });

  function nombreDe(u) {
    if (!u) return 'sin nombre';
    var n = (u.displayName || '').trim();
    if (n) return n;
    return String(u.email || '').split('@')[0];
  }

  /* ---------- Firebase ---------- */
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
        confirmar: function () { var u = auth.currentUser; if (!u) return Promise.resolve(false); return u.reload().then(function () { return u.getIdToken(true); }).then(function () { if (u.emailVerified && authCb) authCb(auth.currentUser); return u.emailVerified; }); },
        signOut: function () { return au.signOut(auth); },
        permiso: function (email) {
          var ed = fs.getDoc(fs.doc(db, 'editores', email)).then(function (s) { return s.exists(); }, function () { return false; });
          var c3 = fs.getDoc(fs.doc(db, 'c3usuarios', email)).then(function (s) { return s.exists() ? (s.data() || {}) : null; }, function () { return null; });
          return Promise.all([ed, c3]).then(function (r) { return { editor: r[0], c3: r[1] }; });
        },
        sis: function (id) { return fs.getDoc(fs.doc(db, 'c3sis', id)).then(function (s) { return s.exists() ? s.data() : null; }); },
        leer: function (n) { return fs.getDoc(fs.doc(db, 'c3docs', n)).then(function (s) { return s.exists() ? s.data() : null; }); },
        /* lee, cambia y guarda en una transacción: si otro guardó en el medio, Firestore la repite sola */
        cambiar: function (n, fn, quien, desc) {
          var ref = fs.doc(db, 'c3docs', n), out = null;
          return fs.runTransaction(db, function (tx) {
            return tx.get(ref).then(function (s) {
              var x = s.exists() ? s.data() : {};
              var d = {}; try { d = JSON.parse(x.json || '{}'); } catch (e) { d = {}; }
              fn(d); out = d;
              tx.set(ref, { json: JSON.stringify(d), ver: (x.ver || 0) + 1, por: quien, ts: new Date().toISOString() });
            });
          }).then(function () {
            return fs.addDoc(fs.collection(db, 'c3cambios'), { ts: new Date().toISOString(), quien: quien, doc: n, cambio: String(desc || '').slice(0, 1500) }).catch(function () {});
          }).then(function () { return out; });
        },
        cambios: function () {
          return fs.getDocs(fs.query(fs.collection(db, 'c3cambios'), fs.orderBy('ts', 'desc'), fs.limit(400))).then(function (s) { return s.docs.map(function (x) { return x.data(); }); });
        },
        encolarMail: function (d) { return fs.addDoc(fs.collection(db, 'c3mail'), d); },
        usuarios: function () { return fs.getDocs(fs.collection(db, 'c3usuarios')).then(function (s) { return s.docs.map(function (x) { var o = x.data() || {}; o.email = x.id; return o; }); }); },
        ponerUsuario: function (email, datos) { return fs.setDoc(fs.doc(db, 'c3usuarios', email), datos); },
        sacarUsuario: function (email) { return fs.deleteDoc(fs.doc(db, 'c3usuarios', email)); }
      };
    });
  }

  /* ---------- modo de prueba ---------- */
  function mockStore(m) {
    var clone = function (x) { return JSON.parse(JSON.stringify(x)); };
    m.docs = m.docs || {}; m.sis = m.sis || {}; m.cambios = m.cambios || []; m.usuarios = m.usuarios || {};
    var cb = null;
    return {
      onAuth: function (c) { cb = c; setTimeout(function () { c(m.user || null); }, 0); },
      google: function () { m.user = m.user || { email: 'prueba@x.com', displayName: 'Prueba', emailVerified: true }; cb(m.user); return Promise.resolve(); },
      entrarMail: function () { return this.google(); }, crearMail: function () { return Promise.resolve(); }, olvide: function () { return Promise.resolve(); },
      reenviar: function () { return Promise.resolve(); }, confirmar: function () { return Promise.resolve(true); },
      signOut: function () { m.user = null; cb(null); return Promise.resolve(); },
      permiso: function () { return Promise.resolve({ editor: m.rol === 'editor', c3: m.rol && m.rol !== 'editor' ? { rol: m.rol } : null }); },
      sis: function (id) { return Promise.resolve(m.sis[id] != null ? { txt: m.sis[id], hora: '21/10 12:30' } : null); },
      leer: function (n) { return Promise.resolve(m.docs[n] ? { json: JSON.stringify(m.docs[n]), ver: 1 } : null); },
      cambiar: function (n, fn, quien, desc) { var d = clone(m.docs[n] || {}); fn(d); m.docs[n] = clone(d); m.cambios.unshift({ ts: new Date().toISOString(), quien: quien, doc: n, cambio: desc }); return Promise.resolve(d); },
      cambios: function () { return Promise.resolve(clone(m.cambios)); },
      encolarMail: function (d) { m.mails = m.mails || []; m.mails.push(clone(d)); return Promise.resolve(); },
      usuarios: function () { return Promise.resolve(Object.keys(m.usuarios).map(function (e) { var o = clone(m.usuarios[e]); o.email = e; return o; })); },
      ponerUsuario: function (e, d) { m.usuarios[e] = clone(d); return Promise.resolve(); },
      sacarUsuario: function (e) { delete m.usuarios[e]; return Promise.resolve(); }
    };
  }

  /* ---------- pantalla de ingreso / sin permiso ---------- */
  var mostroCartel = false;
  function cartel(html) {
    mostroCartel = true;
    var main = document.getElementById('main') || document.querySelector('main');
    if (main) main.innerHTML = '<section style="max-width:560px;margin:40px auto;text-align:center">' + html + '</section>';
  }
  function pedirIngreso() {
    cartel('<h2 style="justify-content:center">' + (window.C3_TITULO || 'Centro de control Ciclo III y Qualitá Express') + '</h2><p class="sub">Ingresá con tu cuenta para ver y cargar los datos.</p><button class="primary big" id="c3-entrar">Ingresar</button>');
    var b = document.getElementById('c3-entrar'); if (b) b.onclick = function () { window.Acceso.abrir(store); };
    window.Acceso.abrir(store);
  }
  function revisar(u) {
    if (!u) { api.usuario = null; pedirIngreso(); return; }
    if (u.emailVerified === false) { window.Acceso.verificar(store, u.email); return; }
    store.permiso(u.email).then(function (p) {
      if (!p.editor && !p.c3) {
        cartel('<h2 style="justify-content:center">Tu cuenta todavía no está habilitada</h2><p class="sub">Entraste como <b>' + String(u.email).replace(/</g, '&lt;') + '</b>. Pedile a Igna que la habilite (Centro de control › Usuarios).</p><button id="c3-salir">Usar otra cuenta</button>');
        document.getElementById('c3-salir').onclick = function () { store.signOut(); };
        return;
      }
      if (mostroCartel) { location.reload(); return; }   // la página se tapó con el cartel de ingreso: se vuelve a abrir
      api.usuario = { email: u.email, nombre: (p.c3 && p.c3.nombre) || nombreDe(u) };
      api.editor = !!p.editor;
      api.rol = p.editor ? 'todo' : ((p.c3 && p.c3.rol) || 'todo');
      var st = document.getElementById('st-user'); if (st) st.innerHTML = String(api.usuario.nombre).replace(/</g, '&lt;') + ' · <a href="#" onclick="C3API.salir();return false">Salir</a>';
      resolverListo(api);
    });
  }

  /* ---------- lo que usan las pantallas ---------- */
  api.sis = function (id) { return api.listo.then(function () { return store.sis(id); }); };
  api.leerDoc = function (n) {
    return api.listo.then(function () { return store.leer(n); }).then(function (x) {
      var d = {}; if (x && x.json) { try { d = JSON.parse(x.json); } catch (e) { d = {}; } }
      return { d: d, ver: x ? String(x.ver || 0) : '0' };
    });
  };
  api.cambiarDoc = function (n, fn, desc) { return api.listo.then(function () { return store.cambiar(n, fn, api.usuario ? api.usuario.nombre : 'sin nombre', desc); }); };
  api.cambios = function () { return api.listo.then(function () { return store.cambios(); }); };
  api.usuarios = function () { return store.usuarios(); };
  api.encolarMail = function (d) { return api.listo.then(function () { return store.encolarMail(d); }); };
  api.ponerUsuario = function (e, d) { return store.ponerUsuario(e, d); };
  api.sacarUsuario = function (e) { return store.sacarUsuario(e); };
  api.salir = function () { return store.signOut().then(function () { location.reload(); }); };

  (window.__mock ? Promise.resolve(mockStore(window.__mock)) : firebaseStore()).then(function (s) { store = s; store.onAuth(revisar); }, function () {
    cartel('<h2 style="justify-content:center">No hay conexión</h2><p class="sub">No se pudo conectar. Revisá internet y recargá la página.</p>');
  });
  return api;
})();
