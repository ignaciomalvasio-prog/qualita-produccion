/* Ingreso a la app y al portal de vendedores: con Google o con cualquier mail y contraseña
   (por ejemplo @frigorificoqualita.com.ar). Quien entra con mail tiene que confirmarlo con el link
   que le llega; hasta entonces no puede leer ni cargar nada (las reglas piden mail verificado).
   Qué puede hacer cada uno lo siguen decidiendo /editores y /vendedores en Firestore.

   Uso: Acceso.abrir(store) muestra la ventana; Acceso.verificar(store, mail) la abre pidiendo
   la confirmación. El store tiene que tener: google, entrarMail, crearMail, olvide, reenviar,
   confirmar y signOut. */
window.Acceso = (function () {
  'use strict';
  var dlg = null, st = null, modo = 'inicio', mail = '', msg = '', err = false, ocupado = false;

  var CSS = '.acc{border:0;border-radius:10px;padding:0;max-width:420px;width:calc(100% - 32px);background:var(--surface,#fff);color:var(--ink,#12222b);box-shadow:0 10px 40px rgba(0,0,0,.3)}'
    + '.acc::backdrop{background:rgba(10,20,25,.55)}'
    + '.acc form{display:flex;flex-direction:column;gap:12px;padding:20px}'
    + '.acc h2{margin:0;font:700 22px/1.1 var(--display,sans-serif);text-transform:uppercase}'
    + '.acc p{margin:0}'
    + '.acc label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted,#52646f)}'
    + '.acc input{font:500 16px var(--body,sans-serif);color:var(--ink,#12222b);background:var(--surface,#fff);border:1px solid var(--line,#ccd6dc);border-radius:4px;padding:9px 10px;width:100%;box-sizing:border-box;text-transform:none;letter-spacing:0}'
    + '.acc .b{font:600 16px var(--body,sans-serif);border-radius:4px;padding:10px 14px;min-height:44px;cursor:pointer;border:1px solid var(--line,#ccd6dc);background:var(--surface,#fff);color:var(--ink,#12222b);width:100%}'
    + '.acc .b.pri{background:var(--accent,#005e78);border-color:var(--accent,#005e78);color:var(--accent-ink,#fff)}'
    + '.acc .b:disabled{opacity:.5;cursor:default}'
    + '.acc .lnk{background:none;border:0;color:var(--accent,#005e78);font:600 14px var(--body,sans-serif);cursor:pointer;padding:4px;text-decoration:underline}'
    + '.acc .links{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px}'
    + '.acc .sep{display:flex;align-items:center;gap:10px;color:var(--muted,#52646f);font-size:13px}.acc .sep:before,.acc .sep:after{content:"";flex:1;border-top:1px solid var(--line,#ccd6dc)}'
    + '.acc .m{font-size:14px;font-weight:600;color:var(--ok,#1c7446)}.acc .m.e{color:var(--crit,#a5251c)}'
    + '.acc .cerrar{position:absolute;top:8px;right:8px;width:36px;height:36px;border:0;background:none;font-size:20px;cursor:pointer;color:var(--muted,#52646f)}'
    + '.acc .chico{font-size:14px;color:var(--muted,#52646f)}';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function crear() {
    if (dlg) return;
    var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
    dlg = document.createElement('dialog'); dlg.className = 'acc'; dlg.setAttribute('aria-labelledby', 'acc-tit');
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function (e) { var b = e.target.closest('[data-acc]'); if (b) { e.preventDefault(); accion(b.getAttribute('data-acc')); } });
    dlg.addEventListener('submit', function (e) { e.preventDefault(); accion(modo === 'crear' ? 'crear-ok' : modo === 'olvide' ? 'olvide-ok' : 'entrar'); });
  }
  function val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function texto(e) {
    var c = (e && e.code) || '';
    if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'Mail o contraseña incorrectos. Si es la primera vez, tocá "Crear cuenta".';
    if (/email-already-in-use/.test(c)) return 'Ese mail ya tiene cuenta: ingresá con tu contraseña o tocá "Me olvidé la contraseña".';
    if (/weak-password/.test(c)) return 'La contraseña tiene que tener al menos 6 caracteres.';
    if (/invalid-email|missing-email/.test(c)) return 'Revisá el mail: parece que está mal escrito.';
    if (/too-many-requests/.test(c)) return 'Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.';
    if (/operation-not-allowed|admin-restricted/.test(c)) return 'El ingreso con mail todavía no está activado. Avisale a Qualitá.';
    if (/popup-closed|cancelled-popup/.test(c)) return '';
    if (/network/.test(c)) return 'No hay conexión. Revisá internet y probá de nuevo.';
    return 'No se pudo. Probá de nuevo.';
  }
  function aviso(t, e) { msg = t; err = !!e; ponerOcupado(false); var m = dlg.querySelector('.m'); if (m) { m.textContent = t; m.className = 'm' + (err ? ' e' : ''); } }
  function ponerOcupado(si) { ocupado = si; Array.prototype.forEach.call(dlg.querySelectorAll('button.b'), function (b) { b.disabled = si; }); }
  function pintar() {
    var h = '<form novalidate><button type="button" class="cerrar" data-acc="cerrar" aria-label="Cerrar">✕</button>';
    if (modo === 'inicio') {
      h += '<h2 id="acc-tit">Ingresar</h2>'
        + '<button type="button" class="b" data-acc="google"' + (ocupado ? ' disabled' : '') + '>Ingresar con Google</button>'
        + '<div class="sep">o con tu mail</div>'
        + '<label>Mail<input type="email" id="acc-mail" autocomplete="username" value="' + esc(mail) + '" placeholder="nombre@frigorificoqualita.com.ar"></label>'
        + '<label>Contraseña<input type="password" id="acc-pass" autocomplete="current-password"></label>'
        + '<button type="submit" class="b pri"' + (ocupado ? ' disabled' : '') + '>' + (ocupado ? 'Ingresando…' : 'Ingresar') + '</button>'
        + '<div class="links"><button type="button" class="lnk" data-acc="a-crear">Crear cuenta</button><button type="button" class="lnk" data-acc="a-olvide">Me olvidé la contraseña</button></div>';
    } else if (modo === 'crear') {
      h += '<h2 id="acc-tit">Crear cuenta</h2><p class="chico">Con el mail que te habilitó Qualitá. Te va a llegar un mail para confirmarlo.</p>'
        + '<label>Mail<input type="email" id="acc-mail" autocomplete="username" value="' + esc(mail) + '"></label>'
        + '<label>Contraseña (mínimo 6 caracteres)<input type="password" id="acc-pass" autocomplete="new-password"></label>'
        + '<label>Repetí la contraseña<input type="password" id="acc-pass2" autocomplete="new-password"></label>'
        + '<button type="submit" class="b pri"' + (ocupado ? ' disabled' : '') + '>' + (ocupado ? 'Creando…' : 'Crear cuenta') + '</button>'
        + '<div class="links"><button type="button" class="lnk" data-acc="a-inicio">Ya tengo cuenta</button></div>';
    } else if (modo === 'olvide') {
      h += '<h2 id="acc-tit">Nueva contraseña</h2><p class="chico">Te mandamos un mail con un link para elegir una contraseña nueva.</p>'
        + '<label>Mail<input type="email" id="acc-mail" autocomplete="username" value="' + esc(mail) + '"></label>'
        + '<button type="submit" class="b pri"' + (ocupado ? ' disabled' : '') + '>Mandarme el link</button>'
        + '<div class="links"><button type="button" class="lnk" data-acc="a-inicio">Volver</button></div>';
    } else if (modo === 'verificar') {
      h += '<h2 id="acc-tit">Confirmá tu mail</h2><p>Te mandamos un mail a <b>' + esc(mail) + '</b>. Abrilo y tocá el link (si no está, fijate en spam). Después volvé acá y tocá <b>Ya lo confirmé</b>.</p>'
        + '<button type="button" class="b pri" data-acc="confirmar"' + (ocupado ? ' disabled' : '') + '>Ya lo confirmé</button>'
        + '<div class="links"><button type="button" class="lnk" data-acc="reenviar">Reenviar el mail</button><button type="button" class="lnk" data-acc="salir">Usar otra cuenta</button></div>';
    }
    h += '<p class="m' + (err ? ' e' : '') + '" role="status">' + esc(msg) + '</p></form>';
    dlg.innerHTML = h;
    var f = dlg.querySelector('#acc-mail'), p = dlg.querySelector('#acc-pass');
    if (msg) return;   // con un aviso a la vista no se mueve el foco
    if (f && !mail) f.focus(); else if (p) p.focus();
  }
  function ir(m) { mail = val('acc-mail') || mail; modo = m; msg = ''; err = false; ocupado = false; pintar(); }
  function cerrar() { if (dlg && dlg.open) dlg.close(); }
  function accion(a) {
    if (a === 'cerrar') { if (modo === 'verificar') st.signOut(); cerrar(); return; }
    if (a === 'a-crear') return ir('crear');
    if (a === 'a-olvide') return ir('olvide');
    if (a === 'a-inicio') return ir('inicio');
    if (ocupado) return;
    if (a === 'google') { msg = ''; aviso('', false); ponerOcupado(true); st.google().then(function () { ocupado = false; cerrar(); }, function (e) { aviso(texto(e), true); }); return; }
    if (a === 'entrar') {
      mail = val('acc-mail'); var p = val('acc-pass');
      if (!mail || !p) return aviso('Escribí el mail y la contraseña.', true);
      msg = ''; aviso('', false); ponerOcupado(true);
      st.entrarMail(mail, p).then(function (u) { ocupado = false; if (u && u.emailVerified === false) { modo = 'verificar'; msg = ''; err = false; pintar(); } else cerrar(); }, function (e) { aviso(texto(e), true); });
      return;
    }
    if (a === 'crear-ok') {
      mail = val('acc-mail'); var p1 = val('acc-pass'), p2 = val('acc-pass2');
      if (!mail || !p1) return aviso('Escribí el mail y una contraseña.', true);
      if (p1.length < 6) return aviso('La contraseña tiene que tener al menos 6 caracteres.', true);
      if (p1 !== p2) return aviso('Las dos contraseñas no coinciden.', true);
      msg = ''; aviso('', false); ponerOcupado(true);
      st.crearMail(mail, p1).then(function () { modo = 'verificar'; msg = ''; err = false; ocupado = false; pintar(); }, function (e) { aviso(texto(e), true); });
      return;
    }
    if (a === 'olvide-ok') {
      mail = val('acc-mail'); if (!mail) return aviso('Escribí tu mail.', true);
      msg = ''; aviso('', false); ponerOcupado(true);
      // Por seguridad Firebase no dice si el mail tiene cuenta: el mensaje es el mismo en los dos casos.
      st.olvide(mail).then(function () { modo = 'inicio'; msg = 'Si ese mail tiene cuenta, te llegó un link para elegir la contraseña nueva.'; err = false; ocupado = false; pintar(); }, function (e) { aviso(texto(e), true); });
      return;
    }
    if (a === 'reenviar') { msg = ''; aviso('', false); ponerOcupado(true); st.reenviar().then(function () { aviso('Listo, te lo mandamos de nuevo.', false); }, function (e) { aviso(texto(e), true); }); return; }
    if (a === 'confirmar') {
      msg = ''; aviso('', false); ponerOcupado(true);
      st.confirmar().then(function (ok) { if (ok) { ocupado = false; cerrar(); } else aviso('Todavía no figura confirmado. Tocá el link del mail y probá de nuevo.', true); }, function (e) { aviso(texto(e), true); });
      return;
    }
    if (a === 'salir') { st.signOut(); modo = 'inicio'; mail = ''; msg = ''; err = false; ocupado = false; pintar(); }
  }
  return {
    abrir: function (store) { st = store; crear(); modo = 'inicio'; msg = ''; err = false; ocupado = false; pintar(); if (!dlg.open) dlg.showModal(); },
    verificar: function (store, m) { st = store; crear(); mail = m || mail; if (modo !== 'verificar') { modo = 'verificar'; msg = ''; err = false; } ocupado = false; pintar(); if (!dlg.open) dlg.showModal(); },
    cerrar: cerrar
  };
})();
