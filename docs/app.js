/* Producción Qualitá. Datos en Firestore; todos leen, solo los editores escriben. */
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

  var nf = new Intl.NumberFormat('es-AR');
  var n = function (v) { return (v < 0 ? '−' : '') + nf.format(Math.abs(v)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var cap1 = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
  var $ = function (id) { return document.getElementById(id); };

  var SIG = { 'Lunes': 'martes', 'Martes': 'miércoles', 'Miércoles': 'jueves', 'Jueves': 'viernes', 'Viernes': 'lunes' };
  var ORDEN_CORTES = ['Jamón', 'Paleta', 'Pecho', 'Carré', 'Solomillo', 'Matambre', 'Bondiola', 'Recorte', 'Grasa buena', 'Grasa mala', 'Grasa (sin separar)', 'Cuero', 'Tapa de paleta', 'Tapa de jamón', 'Tortuga', 'Garrón', 'Tocino', 'Churrasco', 'Papada', 'Orejas', 'Cabeza', 'Pulmón', 'Hígado', 'Patas y manos'];
  var DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  var SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var UNIDADES = ['kg', 'unidades', 'cajas', 'boneles'];
  var ENVASES = ['', 'bines', 'cajas', 'canastos', 'boneles'];
  var TABS = ['stock', 'ordenes', 'cortes', 'cargar'];

  var S = {
    semanas: null, ordenes: null, config: {}, status: 'loading', fuente: '',
    tab: 'stock', sem: null, ord: null,
    user: null, editor: false,
    editSem: null,                 // borrador de la semana en edición
    dia: null, guardado: '',       // orden en carga
    form: null                     // formulario de pedido abierto
  };
  var store = null;

  /* ---------- fechas ---------- */
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fecha(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function mas(s, dias) { var d = fecha(s); d.setDate(d.getDate() + dias); return iso(d); }
  function diaDe(s) { return SEMANA[fecha(s).getDay()]; }
  function tituloDe(s) { var d = fecha(s); return SEMANA[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }
  function esHabil(s) { var g = fecha(s).getDay(); return g >= 1 && g <= 5; }
  function habilSiguiente(s) { var x = mas(s, 1); while (!esHabil(x)) x = mas(x, 1); return x; }
  function habilAnterior(s) { var x = mas(s, -1); while (!esHabil(x)) x = mas(x, -1); return x; }
  function etiquetaSemana(desde) {
    var a = fecha(desde), b = fecha(mas(desde, 4)), ma = MESES[a.getMonth()].slice(0, 3), mb = MESES[b.getMonth()].slice(0, 3);
    return ma === mb ? a.getDate() + '–' + b.getDate() + ' ' + mb : a.getDate() + ' ' + ma + ' – ' + b.getDate() + ' ' + mb;
  }
  function ahoraTxt() { var d = new Date(); return d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear() + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

  /* ---------- cálculo del stock de medias ---------- */
  function calc(sem) {
    var rem = +sem.remanenteInicial || 0;
    return (sem.dias || []).map(function (d) {
      var propios = +d.propios || 0, usuarios = +d.usuarios || 0, venta = +d.venta || 0, sale = +d.desposteSig || 0;
      var aDesposte = (propios - venta) * 2;
      var disponible = aDesposte + rem;
      var remFin = disponible - sale;
      var o = { dia: d.dia, num: d.num, propios: propios, usuarios: usuarios, venta: venta, desposteSig: sale,
                aDesposte: aDesposte, remAnt: rem, disponible: disponible, remFin: remFin, camara: (propios + usuarios) * 2 + rem };
      rem = remFin;
      return o;
    });
  }
  function diaTxt(d) { return d.dia + (d.num ? ' ' + d.num : ''); }

  function alertas() {
    var cap = S.config.capacidadCamara, out = [];
    (S.semanas || []).forEach(function (s) {
      calc(s).forEach(function (d) {
        if (cap && d.camara > cap) out.push({ k: 'crit', t: 'Cámara llena', sem: s, x: diaTxt(d) + ': ' + n(d.camara) + ' medias en cámara, ' + n(d.camara - cap) + ' más que la capacidad.' });
        if (d.remFin < 0) out.push({ k: 'crit', t: 'Falta stock', sem: s, x: diaTxt(d) + ': faltan ' + n(-d.remFin) + ' medias con un día de frío para despostar ' + n(d.desposteSig) + ' el ' + SIG[d.dia] + '.' });
      });
    });
    return out;
  }

  // Lo que el plan de faena deja disponible para despostar en una fecha.
  function planPara(fechaISO) {
    var prev = habilAnterior(fechaISO), hit = null;
    (S.semanas || []).forEach(function (s) {
      var i = Math.round((fecha(prev) - fecha(s.desde)) / 86400000);
      if (i >= 0 && i < (s.dias || []).length) { var c = calc(s)[i]; hit = { medias: c.desposteSig, disponible: c.disponible, remanente: c.remFin }; }
    });
    return hit;
  }

  var FILAS = [
    { k: 'propios', l: 'Faena propia', sub: 'cerdos' },
    { k: 'usuarios', l: 'Faena de usuarios', sub: 'cerdos, no van a desposte' },
    { k: 'venta', l: 'Venta en medias reses', sub: 'cerdos' },
    { k: 'aDesposte', l: 'Queda para desposte', sub: 'medias', cls: 'sum', calc: true },
    { k: 'remAnt', l: 'Remanente del día anterior', sub: 'medias', calc: true },
    { k: 'disponible', l: 'Disponible con un día de frío', sub: 'medias', cls: 'sum', calc: true },
    { k: 'desposteSig', l: 'Sale a desposte', sub: 'al día siguiente' },
    { k: 'remFin', l: 'Remanente', sub: 'medias que quedan en cámara', cls: 'key', calc: true },
    { k: 'camara', l: 'Medias en cámara', sub: '', calc: true }
  ];
  function celda(k, d, cap) {
    if (k === 'usuarios') return d.usuarios ? n(d.usuarios) : '<span class="muted">—</span>';
    if (k === 'venta') return n(d.venta) + '<small>' + n(d.venta * 2) + ' medias</small>';
    if (k === 'desposteSig') return n(d.desposteSig) + '<small>' + SIG[d.dia] + '</small>';
    if (k === 'remAnt' || k === 'remFin') return '<span class="' + (d[k] < 0 ? 'neg' : '') + '">' + n(d[k]) + '</span>';
    if (k === 'camara') {
      if (!cap) return n(d.camara);
      var p = d.camara / cap, c = p > 1 ? 'crit' : p > 0.9 ? 'warn' : '';
      return '<span class="' + (p > 1 ? 'neg' : '') + '">' + n(d.camara) + '</span><small>' + Math.round(p * 100) + '%</small><div class="meter ' + c + '"><i style="width:' + Math.min(100, Math.round(p * 100)) + '%"></i></div>';
    }
    return n(d[k]);
  }
  function stat(l, v, u) { return '<div><dt>' + l + '</dt><dd>' + v + ' <small>' + u + '</small></dd></div>'; }
  function statsSemana(dias) {
    var t = dias.reduce(function (t, d) { t.p += d.propios; t.u += d.usuarios; t.v += d.venta; t.a += d.aDesposte; return t; }, { p: 0, u: 0, v: 0, a: 0 });
    var nd = dias.length || 1, ult = dias[dias.length - 1];
    return stat('Faena propia', n(t.p), 'cerdos') + stat('Faena de usuarios', n(t.u), 'cerdos') + stat('Venta en medias', n(t.v), 'cerdos')
      + stat('A desposte', n(t.a), 'medias') + stat('A desposte por día', nf.format(Math.round(t.a / nd * 10) / 10), 'medias') + stat('Remanente final', n(ult ? ult.remFin : 0), 'medias');
  }

  function renderStock() {
    var el = $('view-stock');
    if (stateBlock(el, S.semanas, S.editor ? '' : 'Todavía no hay semanas cargadas.')) return;
    var h = '', cap = S.config.capacidadCamara;
    if (!S.semanas.length) {
      el.innerHTML = '<div class="panel"><h2>Plan de faena</h2><p class="muted">Todavía no hay semanas cargadas.</p><div class="acciones"><button class="btn pri" data-act="sem-nueva">Cargar la primera semana</button></div></div>';
      return;
    }
    var sem = S.semanas.filter(function (s) { return s.id === S.sem; })[0] || S.semanas[0];
    var edit = S.editSem && S.editSem.id === sem.id ? S.editSem : null;
    var dias = calc(edit || sem), al = alertas();

    h += '<div class="panel"><h2>Para revisar</h2>';
    if (!al.length) h += '<p class="muted">Sin alertas en las semanas cargadas.</p>';
    else h += '<ul class="alerts">' + al.map(function (a) { return '<li><span class="badge ' + a.k + '">' + esc(a.t) + '</span><span><strong>' + esc(a.sem.etiqueta) + '</strong> · ' + esc(a.x) + '</span></li>'; }).join('') + '</ul>';
    h += '</div>';

    h += '<div class="pills" role="group" aria-label="Semana">' + S.semanas.map(function (s) {
      return '<button class="pill" data-sem="' + esc(s.id) + '" aria-pressed="' + (s.id === sem.id) + '">' + esc(s.etiqueta) + '</button>';
    }).join('') + (S.editor ? '<button class="btn sm lnk" data-act="sem-nueva">+ Nueva semana</button>' : '') + '</div>';

    h += '<div class="panel">';
    h += '<div class="weekhead"><h2>Semana ' + esc(sem.etiqueta) + '</h2><span class="badge ' + ((edit || sem).tipo === 'real' ? 'ok' : 'accent') + '">' + ((edit || sem).tipo === 'real' ? 'Real' : 'Proyección') + '</span>';
    if (S.editor && !edit) h += '<button class="btn sm" data-act="sem-editar">Editar semana</button>';
    h += '</div>';
    if (sem.nota && !edit) h += '<p class="small muted">' + esc(sem.nota) + '</p>';
    if (edit) {
      h += '<div class="campos"><label class="campo"><span>Remanente inicial (medias)</span><input type="number" inputmode="numeric" id="sem-rem" data-sem-campo="remanenteInicial" value="' + esc(edit.remanenteInicial) + '"></label>'
        + '<div class="campo"><span>Tipo</span><div class="acciones"><button class="btn sm" data-act="sem-tipo" data-v="real" aria-pressed="' + (edit.tipo === 'real') + '">Real</button><button class="btn sm" data-act="sem-tipo" data-v="proyeccion" aria-pressed="' + (edit.tipo !== 'real') + '">Proyección</button></div></div></div>';
    }
    h += '<dl class="stats" id="sem-stats">' + statsSemana(dias) + '</dl>';
    h += '<div class="scroll"><table class="plan"><thead><tr><th></th>' + dias.map(function (d) { return '<th>' + esc(diaTxt(d)) + '<small>día de faena</small></th>'; }).join('') + '</tr></thead><tbody>';
    FILAS.forEach(function (f) {
      var sub = f.k === 'camara' ? (cap ? 'al cierre, sobre ' + n(cap) : 'al cierre del día') : f.sub;
      h += '<tr' + (f.cls ? ' class="' + f.cls + '"' : '') + '><th>' + f.l + '<small>' + sub + '</small></th>' + dias.map(function (d, i) {
        if (edit && !f.calc) return '<td><input type="number" inputmode="numeric" min="0" id="sem-' + f.k + '-' + i + '" data-sem-dia="' + i + '" data-sem-k="' + f.k + '" value="' + esc(d[f.k]) + '" aria-label="' + f.l + ', ' + d.dia + '"></td>';
        return '<td data-calc="' + f.k + '-' + i + '">' + celda(f.k, d, cap) + '</td>';
      }).join('') + '</tr>';
    });
    h += '</tbody></table></div>';
    if (edit) h += '<div class="acciones"><button class="btn pri" data-act="sem-guardar">Guardar semana</button><button class="btn" data-act="sem-cancelar">Cancelar</button><span class="guardado" id="sem-msg"></span></div>';
    h += '<p class="small muted">Lo faenado un día pasa un día en cámara: recién al día siguiente se entrega como media o entra a desposte. Las medias de usuarios ocupan cámara pero no cuentan para venta ni desposte.'
      + (cap ? ' Capacidad de cámaras usada para la alerta: ' + n(cap) + ' medias' + (S.config.capacidadConfirmada ? '.' : ' (dato a confirmar).') : '') + '</p>';
    h += '</div>';
    el.innerHTML = h;
  }
  function refrescarSemana() {
    var dias = calc(S.editSem), cap = S.config.capacidadCamara;
    FILAS.forEach(function (f) { if (f.calc) dias.forEach(function (d, i) { var td = document.querySelector('[data-calc="' + f.k + '-' + i + '"]'); if (td) td.innerHTML = celda(f.k, d, cap); }); });
    var st = $('sem-stats'); if (st) st.innerHTML = statsSemana(dias);
  }
  function semanaNueva() {
    var ult = S.semanas[S.semanas.length - 1], desde, base;
    if (ult) { desde = mas(ult.desde, 7); base = ult; }
    else { var hoy = iso(new Date()), g = fecha(hoy).getDay(); desde = mas(hoy, g === 0 ? 1 : 1 - g); }
    var cal = ult ? calc(ult) : [];
    return {
      id: desde, desde: desde, etiqueta: etiquetaSemana(desde), tipo: 'proyeccion', nota: '',
      remanenteInicial: cal.length ? cal[cal.length - 1].remFin : 0,
      dias: DIAS.map(function (dia, i) {
        var b = base && base.dias[i] || {};
        return { dia: dia, num: fecha(mas(desde, i)).getDate(), propios: +b.propios || 0, usuarios: +b.usuarios || 0, venta: +b.venta || 0, desposteSig: +b.desposteSig || 750 };
      })
    };
  }
  function guardarSemana() {
    var e = clone(S.editSem), msg = $('sem-msg');
    e.remanenteInicial = +e.remanenteInicial || 0;
    e.dias.forEach(function (d) { ['propios', 'usuarios', 'venta', 'desposteSig'].forEach(function (k) { d[k] = +d[k] || 0; }); });
    if (msg) msg.textContent = 'Guardando…';
    // Encadena el remanente a las semanas siguientes.
    var todas = S.semanas.filter(function (s) { return s.id !== e.id; }).concat([e]).sort(function (a, b) { return a.desde.localeCompare(b.desde); });
    var escribir = [e], i = todas.indexOf(e), rem = calc(e);
    rem = rem.length ? rem[rem.length - 1].remFin : 0;
    for (var j = i + 1; j < todas.length; j++) {
      var s = clone(todas[j]);
      if ((+s.remanenteInicial || 0) !== rem) { s.remanenteInicial = rem; escribir.push(s); }
      var c = calc(s); rem = c.length ? c[c.length - 1].remFin : rem;
    }
    Promise.all(escribir.map(function (s) { var id = s.id; delete s.id; return store.set('semanas', id, s); }))
      .then(function () { S.sem = e.id; S.editSem = null; tocarActualizado(); render(); },
            function () { if (msg) { msg.textContent = 'No se pudo guardar. Revisá la conexión.'; msg.className = 'guardado err'; } });
  }

  /* ---------- líneas de una orden ---------- */
  function envTxt(l) {
    var e = l.envase ? 'en ' + l.envase : '';
    if (l.extra) e += (e ? (/^de /.test(l.extra) ? ' ' : ', ') : '') + l.extra;
    return e;
  }
  function descTxt(l) { return cap1([l.prod, envTxt(l)].filter(Boolean).join(', ')); }
  function estadoBadge(e) { return e === 'congelado' ? '<span class="badge cold">Congelado</span>' : e === 'fresco' ? '<span class="badge ok">Fresco</span>' : ''; }
  function lineaTxt(l) {
    if (l.sinResto) return 'Sin resto: todo va a los pedidos';
    var p = [descTxt(l), l.estado, l.cod ? 'cód. ' + l.cod : '', l.contrato ? 'contrato ' + l.contrato : ''].filter(Boolean).join(' · ');
    return (p || 'Sin detalle') + (l.destino ? ' → ' + l.destino : ' (sin cliente)');
  }
  function claveDe(l) { return [l.tipo === 'nosale' ? 'nosale' : '', l.prod || '', l.estado || '', l.destino || ''].join('|'); }
  var CAMPOS = ['prod', 'envase', 'extra', 'estado', 'cod', 'contrato', 'destino', 'nota'];
  function soloCampos(l) { var o = {}; CAMPOS.forEach(function (k) { o[k] = l[k] || ''; }); return o; }
  function cantTxt(num, unidad) { return n(+num || 0) + ' ' + unidad; }

  function textoOrden(o) {
    var f = String(o.fecha || '').split('-'), out = [];
    out.push((o.dia || '').toUpperCase() + ' ' + [f[2], f[1], (f[0] || '').slice(2)].join('-'));
    out.push(o.medias + '½ ' + String(o.mercado || '').toUpperCase());
    (o.cortes || []).forEach(function (c) {
      c.lineas.forEach(function (l, k) {
        var t = [];
        if (l.tipo === 'nosale') t.push('NO SACAR');
        else {
          if (l.tipo === 'pedido') t.push(String(l.cantNum) + (l.unidad === 'kg' ? 'KG' : ' ' + (l.unidad === 'unidades' ? 'UND' : l.unidad)));
          if (l.prod) t.push(l.prod);
          var env = l.tipo === 'pedido' && l.unidad === l.envase ? (l.estado === 'congelado' ? 'a congelar' : l.estado === 'fresco' ? 'fresco' : '') : l.envase ? (l.estado === 'congelado' ? l.envase + ' a congelar' : (l.estado === 'fresco' ? 'fresco en ' : 'en ') + l.envase) : (l.estado === 'congelado' ? 'a congelar' : l.estado === 'fresco' ? 'fresco' : '');
          if (env) t.push(env);
          if (l.extra) t.push(l.extra);
          if (l.cod || l.contrato) t.push('(' + [l.cod ? 'COD ' + l.cod : '', l.contrato ? 'CONTRATO ' + l.contrato : ''].filter(Boolean).join(' – ') + ')');
          if (l.destino) t.push('“' + l.destino + '”');
          if (l.nota) t.push('– ' + l.nota.replace(/\.$/, ''));
        }
        var pre = k === 0 ? c.corte.replace(' (sin separar)', '') + ': ' : '';
        out.push((pre + (l.tipo === 'resto' ? 'RESTO: ' : '') + t.join(' ')).toUpperCase());
      });
    });
    return out.join('\n');
  }

  function ordenHTML(o, conCopia) {
    var borrador = o.estado === 'borrador', dest = {}, sinDest = 0;
    (o.cortes || []).forEach(function (c) { c.lineas.forEach(function (l) { if (l.tipo === 'nosale') return; if (l.destino) dest[l.destino] = (dest[l.destino] || 0) + 1; else sinDest++; }); });
    var dl = Object.keys(dest).sort(function (a, b) { return dest[b] - dest[a]; });
    var h = '<div class="weekhead"><h2>' + esc(o.titulo) + '</h2>' + (borrador ? '<span class="badge warn">Borrador</span>' : '') + '<span class="badge accent">' + n(o.medias) + ' medias</span><span class="badge plain">' + esc(o.mercado || '') + '</span></div>';
    h += '<div class="pills">' + dl.map(function (d) { return '<span class="badge plain">' + esc(d) + ' · ' + dest[d] + '</span>'; }).join('') + (sinDest ? '<span class="badge plain">Sin cliente indicado · ' + sinDest + '</span>' : '') + '</div>';
    h += '<div class="cortes">' + (o.cortes || []).map(function (c) {
      return '<div class="corte"><div><h3>' + esc(c.corte) + '</h3>' + (c.revisar ? '<span class="badge ' + (c.revisar === 'definir' ? 'warn' : 'accent') + '">' + (c.revisar === 'definir' ? 'A definir' : 'Confirmar') + '</span>' : '') + '</div><div class="lines">' + c.lineas.map(function (l) {
        var d = descTxt(l);
        return '<div class="line"><span class="qty ' + esc(l.tipo) + '">' + esc(l.cant) + '</span><span class="desc">'
          + (d ? '<span>' + esc(d) + '</span>' : '') + estadoBadge(l.estado)
          + (l.cod ? '<span class="badge plain">Cód. ' + esc(l.cod) + '</span>' : '')
          + (l.contrato ? '<span class="badge plain">Contrato ' + esc(l.contrato) + '</span>' : '')
          + (l.destino ? '<span class="dest">' + esc(l.destino) + '</span>' : '')
          + '</span>' + (l.nota ? '<span class="note">' + esc(l.nota) + '</span>' : '') + '</div>';
      }).join('') + '</div></div>';
    }).join('') + '</div>';
    if (conCopia && !borrador) h += '<div class="copy"><button class="btn" data-act="copiar">Copiar como texto</button><span class="small muted" id="copiado" aria-live="polite"></span></div><textarea id="txt-orden" class="txt" readonly hidden aria-label="Orden en texto">' + esc(textoOrden(o)) + '</textarea>';
    return h;
  }

  function renderOrdenes() {
    var el = $('view-ordenes');
    if (stateBlock(el, S.ordenes, 'Todavía no hay órdenes de desposte cargadas.')) return;
    var i = Math.max(0, S.ordenes.map(function (o) { return o.id; }).indexOf(S.ord));
    var o = S.ordenes[i], borrador = o.estado === 'borrador';
    var h = '<div class="picker"><button class="step" data-step="-1" aria-label="Orden anterior"' + (i === 0 ? ' disabled' : '') + '>‹</button>'
      + '<select id="sel-orden" aria-label="Fecha de la orden">' + S.ordenes.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === o.id ? ' selected' : '') + '>' + esc(x.titulo) + ' · ' + n(x.medias) + ' medias' + (x.estado === 'borrador' ? ' · borrador' : '') + '</option>'; }).join('') + '</select>'
      + '<button class="step" data-step="1" aria-label="Orden siguiente"' + (i === S.ordenes.length - 1 ? ' disabled' : '') + '>›</button></div>';
    var pend = (o.cortes || []).filter(function (c) { return c.revisar; });
    if (borrador && pend.length) {
      h += '<div class="panel"><div class="weekhead"><h2>Falta definir</h2><span class="badge warn">' + pend.length + ' cortes</span></div>';
      if (o.aviso) h += '<p class="muted">' + esc(o.aviso) + '</p>';
      h += pend.map(function (c) {
        return '<div class="block"><div class="weekhead"><h3>' + esc(c.corte) + '</h3><span class="badge ' + (c.revisar === 'definir' ? 'warn' : 'accent') + '">' + (c.revisar === 'definir' ? 'A definir' : 'Confirmar') + '</span></div>'
          + (c.motivo ? '<p class="small muted">' + esc(c.motivo) + '</p>' : '')
          + (c.opciones && c.opciones.length ? '<ul class="opts">' + c.opciones.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
      }).join('') + '</div>';
    }
    h += '<div class="panel">' + ordenHTML(o, true);
    if (S.editor) h += '<div class="acciones"><button class="btn sm" data-act="abrir-carga" data-fecha="' + esc(o.id) + '">Modificar en Cargar pedidos</button></div>';
    if (o.fuente) h += '<p class="small muted">Fuente: ' + esc(o.fuente) + '</p>';
    h += '</div>';
    el.innerHTML = h;
  }

  /* ---------- lo aprendido de las órdenes confirmadas ---------- */
  function firmes(menos) { return (S.ordenes || []).filter(function (o) { return o.estado !== 'borrador' && o.id !== menos; }); }
  function mayoria(m, total) { var k = Object.keys(m).sort(function (a, b) { return m[b] - m[a]; })[0]; return k && m[k] / total > 0.5 ? k : ''; }

  function modelo(menos) {
    var ORD = firmes(menos), porDia = {}, cortes = {};
    DIAS.forEach(function (d) { porDia[d] = 0; });
    ORD.forEach(function (o, idx) {
      porDia[o.dia] = (porDia[o.dia] || 0) + 1;
      (o.cortes || []).forEach(function (c) {
        var C = cortes[c.corte] = cortes[c.corte] || { corte: c.corte, fechas: {}, g: {}, hist: [] };
        C.fechas[o.id] = 1;
        var fijo = null, nosale = false;
        c.lineas.forEach(function (l) {
          var k = claveDe(l);
          var G = C.g[k] = C.g[k] || { k: k, fechas: {}, tipos: {}, cods: {}, env: {}, cant: {}, dias: {}, nPed: 0, nFijo: 0, notasPed: {}, notasFijo: {}, ultPorDia: {}, idx: -1 };
          G.fechas[o.id] = 1; G.tipos[l.tipo] = (G.tipos[l.tipo] || 0) + 1; G.idx = idx; G.l = l;
          if (l.cod) G.cods[l.cod] = (G.cods[l.cod] || 0) + 1;
          var e = envTxt(l); if (e) G.env[e] = (G.env[e] || 0) + 1;
          G.dias[o.dia] = (G.dias[o.dia] || 0) + 1;
          if (l.tipo === 'pedido') {
            (G.cant[l.unidad] = G.cant[l.unidad] || []).push(l.cantNum);
            G.nPed++; G.ultPed = l; G.ultPorDia[o.dia] = l; G.idxPed = idx; G.notasPed[l.nota || ''] = (G.notasPed[l.nota || ''] || 0) + 1;
          } else if (l.tipo === 'nosale') { nosale = true; }
          else { G.nFijo++; G.ultFijo = l; G.idxFijo = idx; fijo = k; G.notasFijo[l.nota || ''] = (G.notasFijo[l.nota || ''] || 0) + 1; }
        });
        C.hist.push({ idx: idx, fijo: fijo, nosale: nosale });
      });
    });
    return { ordenes: ORD, porDia: porDia, cortes: cortes };
  }

  // Destino habitual del resto de un corte: estable si las últimas 5 órdenes coinciden.
  function defecto(C) {
    if (!C) return { linea: null, estable: true, opciones: [], nosale: false };
    var ops = Object.keys(C.g).map(function (k) { return C.g[k]; }).filter(function (G) { return G.nFijo > 0; })
      .sort(function (a, b) { return b.idxFijo - a.idxFijo || b.nFijo - a.nFijo; })
      .map(function (G) { var l = soloCampos(G.ultFijo); l.nota = mayoria(G.notasFijo, G.nFijo); l.k = G.k; l.veces = G.nFijo; return l; });
    var ult = C.hist.slice(-5), u = ult[ult.length - 1];
    if (u && u.nosale && !ops.length) return { linea: null, estable: true, opciones: [], nosale: true };
    var estable = ult.length > 0 && ult.every(function (h) { return h.fijo && h.fijo === ult[0].fijo; });
    return { linea: ops[0] || null, estable: estable, opciones: ops, nosale: !!(u && u.nosale) };
  }
  // Pedidos con cantidad que ya aparecieron para un corte, del más reciente al más viejo.
  function habituales(C, M, dia) {
    if (!C) return [];
    return Object.keys(C.g).map(function (k) { return C.g[k]; }).filter(function (G) { return G.nPed > 0; })
      .sort(function (a, b) { return b.nPed - a.nPed; })
      .map(function (G) {
        var ref = (dia && G.ultPorDia[dia]) || G.ultPed, l = soloCampos(ref);
        l.nota = mayoria(G.notasPed, G.nPed); l.corte = C.corte; l.k = G.k; l.cantNum = ref.cantNum; l.unidad = ref.unidad; l.veces = G.nPed;
        l.delDia = dia && M.porDia[dia] ? (function () { var c = 0; M.ordenes.forEach(function (o) { if (o.dia === dia && G.fechas[o.id] && (o.cortes || []).some(function (x) { return x.corte === C.corte && x.lineas.some(function (y) { return y.tipo === 'pedido' && claveDe(y) === G.k; }); })) c++; }); return c; })() : 0;
        l.totalDia = dia ? (M.porDia[dia] || 0) : 0;
        return l;
      });
  }

  /* ---------- armado automático de la orden ---------- */
  function cortesDelDia(d, M) {
    return ORDEN_CORTES.filter(function (c) {
      if (c === 'Grasa (sin separar)') return d.grasaJunta;
      if (c === 'Grasa buena' || c === 'Grasa mala') return !d.grasaJunta;
      return M.cortes[c] || d.pedidos.some(function (p) { return p.corte === c; });
    });
  }
  function armar(d, M) {
    M = M || modelo(d.fecha);
    return cortesDelDia(d, M).map(function (nombre) {
      var def = defecto(M.cortes[nombre]), el = d.elecciones[nombre];
      var peds = d.pedidos.filter(function (p) { return p.corte === nombre; }).map(function (p) {
        var l = soloCampos(p); l.tipo = 'pedido'; l.cantNum = +p.cantNum || 0; l.unidad = p.unidad || 'kg'; l.cant = cantTxt(l.cantNum, l.unidad); return l;
      });
      var out = { corte: nombre, lineas: peds };
      if (!peds.length && !el && def.nosale && !def.linea) { out.lineas = [{ tipo: 'nosale', cant: 'No sacar', cantNum: null, unidad: '', prod: '', envase: '', extra: '', estado: '', cod: '', contrato: '', destino: '', nota: '' }]; return out; }
      var fijo = el ? (el.sinResto ? null : el) : def.linea;
      if (fijo) { var f = soloCampos(fijo); f.tipo = peds.length ? 'resto' : 'todo'; f.cant = peds.length ? 'Resto' : 'Todo'; f.cantNum = null; f.unidad = ''; out.lineas.push(f); }
      if (!el && (!def.estable || (!def.linea && !peds.length))) {
        out.revisar = 'definir';
        out.motivo = def.opciones.length ? 'El destino del resto cambia según el día. Estas son las opciones que ya se usaron:' : 'Este corte todavía no tiene un destino habitual.';
        out.opciones = def.opciones.map(lineaTxt);
      }
      return out;
    });
  }
  function ordenDe(d) {
    var cortes = armar(d);
    return {
      fecha: d.fecha, dia: diaDe(d.fecha), titulo: tituloDe(d.fecha), medias: +d.medias || 0, mercado: d.mercado || 'Consumo', estado: d.estado,
      pedidos: clone(d.pedidos), elecciones: clone(d.elecciones), grasaJunta: !!d.grasaJunta, cortes: cortes,
      fuente: 'Cargada desde la app', actualizado: ahoraTxt(), por: S.user ? S.user.email : ''
    };
  }
  // Abre para editar una fecha: toma la orden guardada si existe, o arranca una nueva.
  function diaDesde(fechaISO) {
    var o = (S.ordenes || []).filter(function (x) { return x.id === fechaISO; })[0];
    if (o && o.pedidos) return { fecha: fechaISO, medias: o.medias, mercado: o.mercado || 'Consumo', estado: o.estado || 'borrador', pedidos: clone(o.pedidos), elecciones: clone(o.elecciones || {}), grasaJunta: !!o.grasaJunta, existe: true };
    var d = { fecha: fechaISO, medias: 750, mercado: 'Consumo', estado: 'borrador', pedidos: [], elecciones: {}, grasaJunta: false, existe: !!o };
    if (o) {
      d.medias = o.medias; d.mercado = o.mercado || 'Consumo'; d.estado = o.estado || 'confirmada';
      d.grasaJunta = (o.cortes || []).some(function (c) { return c.corte === 'Grasa (sin separar)'; });
      (o.cortes || []).forEach(function (c) {
        var fijo = false;
        c.lineas.forEach(function (l, i) {
          if (l.tipo === 'pedido') { var p = soloCampos(l); p.id = 'p' + c.corte + i; p.corte = c.corte; p.cantNum = l.cantNum; p.unidad = l.unidad; d.pedidos.push(p); }
          else if (l.tipo !== 'nosale') { fijo = true; if (c.revisar !== 'definir') d.elecciones[c.corte] = soloCampos(l); }
        });
        if (!fijo && c.lineas.some(function (l) { return l.tipo === 'pedido'; })) d.elecciones[c.corte] = { sinResto: true };
      });
    } else {
      var plan = planPara(fechaISO), ult = firmes().slice(-1)[0];
      if (plan) d.medias = plan.medias;
      if (ult) d.grasaJunta = (ult.cortes || []).some(function (c) { return c.corte === 'Grasa (sin separar)'; });
    }
    return d;
  }

  var tGuardar = null;
  function guardarDia(ya) {
    if (!S.dia) return;
    S.guardado = 'Guardando…'; pintarGuardado();
    clearTimeout(tGuardar);
    tGuardar = setTimeout(function () {
      var doc = ordenDe(S.dia), id = S.dia.fecha;
      store.set('ordenes', id, doc).then(function () { S.dia.existe = true; S.guardado = 'Guardado ' + ahoraTxt().split(', ')[1]; pintarGuardado(); tocarActualizado(); },
        function () { S.guardado = '!No se pudo guardar. Revisá la conexión y tocá de nuevo.'; pintarGuardado(); });
    }, ya ? 0 : 600);
  }
  function pintarGuardado() { var e = $('c-guardado'); if (e) { var err = S.guardado.charAt(0) === '!'; e.textContent = err ? S.guardado.slice(1) : S.guardado; e.className = 'guardado' + (err ? ' err' : ''); } }
  var tAct = null;
  function tocarActualizado() {
    clearTimeout(tAct);
    tAct = setTimeout(function () { var c = clone(S.config || {}); delete c.id; c.actualizado = ahoraTxt(); store.set('config', 'general', c).catch(function () {}); }, 1500);
  }

  /* ---------- pestaña Cargar pedidos ---------- */
  function renderCargar() {
    var el = $('view-cargar');
    if (!S.editor) { el.innerHTML = '<div class="panel"><p class="state">Para cargar pedidos hay que ingresar con una cuenta autorizada.</p></div>'; return; }
    if (S.ordenes && S.semanas && !S.ordenes.length && !S.semanas.length && S.fuente !== 'vivo-con-datos') {
      el.innerHTML = '<div class="panel"><h2>La base está vacía</h2><p class="muted">Podés traer los datos que ya estaban en la web: las semanas de faena y las órdenes de septiembre, que son las que usa la app para saber cómo va cada corte.</p><div class="acciones"><button class="btn pri" data-act="importar">Importar los datos iniciales</button><span class="guardado" id="imp-msg"></span></div></div>';
      return;
    }
    if (!S.dia) S.dia = diaDesde(habilSiguiente(iso(new Date())));
    el.innerHTML = '<div class="panel" id="c-cab"></div><div class="panel" id="c-hab"></div><div class="panel" id="c-ped"></div><div class="panel" id="c-def"></div><div class="panel" id="c-prev"></div>';
    pintarCarga();
  }
  function pintarCarga() {
    var d = S.dia, M = modelo(d.fecha), dia = diaDe(d.fecha), cortes = armar(d, M), plan = planPara(d.fecha);
    var pend = cortes.filter(function (c) { return c.revisar === 'definir'; });

    // cabecera
    var h = '<div class="weekhead"><h2>Orden para el ' + esc(tituloDe(d.fecha).toLowerCase()) + '</h2><span class="badge ' + (d.estado === 'borrador' ? 'warn' : 'ok') + '">' + (d.estado === 'borrador' ? 'Borrador' : 'Confirmada') + '</span><span class="guardado" id="c-guardado"></span></div>';
    h += '<div class="campos"><label class="campo"><span>Fecha de desposte</span><input type="date" id="c-fecha" value="' + esc(d.fecha) + '"></label>'
      + '<label class="campo"><span>Medias a despostar</span><input type="number" inputmode="numeric" min="0" id="c-medias" class="q" value="' + esc(d.medias) + '"></label>'
      + '<label class="campo"><span>Mercado</span><input type="text" id="c-mercado" value="' + esc(d.mercado) + '"></label></div>';
    if (!esHabil(d.fecha)) h += '<p class="small"><span class="badge warn">Ojo</span> Esa fecha cae en fin de semana.</p>';
    if (plan) h += '<p class="small muted">Según el plan de faena hay ' + n(plan.disponible) + ' medias con un día de frío para ese día y están previstas ' + n(plan.medias) + ' a desposte.</p>';
    $('c-cab').innerHTML = h;
    pintarGuardado();

    // habituales del día
    var sug = [];
    cortesDelDia(d, M).forEach(function (c) {
      habituales(M.cortes[c], M, dia).forEach(function (p) {
        if (p.totalDia && p.delDia / p.totalDia >= 0.5 && !d.pedidos.some(function (x) { return x.corte === c && claveDe(x) === p.k; })) sug.push(p);
      });
    });
    S._sug = sug;
    h = '<h2>Habituales de los ' + dia.toLowerCase() + '</h2>';
    if (!sug.length) h += '<p class="muted">' + (M.ordenes.length ? 'No queda ningún pedido habitual por agregar.' : 'Todavía no hay órdenes confirmadas de donde aprender.') + '</p>';
    else h += '<div class="lista">' + sug.map(function (p, i) {
      return '<div class="item"><div class="cuerpo"><strong>' + esc(p.corte) + '</strong><span>' + esc(cantTxt(p.cantNum, p.unidad)) + ' · ' + esc(lineaTxt(p)) + '</span><span class="small muted">' + p.delDia + ' de ' + p.totalDia + ' ' + dia.toLowerCase() + ' anteriores' + '</span></div><button class="btn sm" data-act="sug" data-i="' + i + '">Agregar</button></div>';
    }).join('') + '</div><div class="acciones"><button class="btn" data-act="sug-todos">Agregar todos</button></div>';
    $('c-hab').innerHTML = h;

    // pedidos cargados
    h = '<div class="weekhead"><h2>Pedidos</h2><span class="badge plain">' + d.pedidos.length + '</span></div>';
    if (!d.pedidos.length) h += '<p class="muted">Todavía no hay pedidos para este día.</p>';
    else h += '<div class="lista">' + ORDEN_CORTES.map(function (c) {
      return d.pedidos.filter(function (p) { return p.corte === c; }).map(function (p) {
        return '<div class="item"><div class="cuerpo"><strong>' + esc(p.corte) + '</strong><span>' + esc(lineaTxt(p)) + '</span></div>'
          + '<div class="cant"><input type="number" inputmode="numeric" min="0" class="q" id="q-' + esc(p.id) + '" data-ped="' + esc(p.id) + '" data-k="cantNum" value="' + esc(p.cantNum) + '" aria-label="Cantidad, ' + esc(p.corte) + '"><span>' + esc(p.unidad) + '</span></div>'
          + '<button class="btn sm" data-act="ped-quitar" data-id="' + esc(p.id) + '">Quitar</button>'
          + '<input type="text" class="nota" id="n-' + esc(p.id) + '" data-ped="' + esc(p.id) + '" data-k="nota" value="' + esc(p.nota) + '" placeholder="Aclaración (opcional)" aria-label="Aclaración, ' + esc(p.corte) + '"></div>';
      }).join('');
    }).join('') + '</div>';
    h += formPedido(M, dia);
    $('c-ped').innerHTML = h;

    // falta definir
    h = '<div class="weekhead"><h2>Falta definir</h2><span class="badge ' + (pend.length ? 'warn' : 'ok') + '">' + (pend.length ? pend.length + ' cortes' : 'Nada pendiente') + '</span></div>';
    h += pend.map(function (c) { return bloqueOpciones(c.corte, d, M); }).join('');
    var otros = cortes.filter(function (c) { return c.revisar !== 'definir' && c.lineas[0] && c.lineas[0].tipo !== 'nosale'; });
    h += '<details' + (S._otro ? ' open' : '') + '><summary>Cambiar el destino de otro corte</summary><div class="campo"><span>Corte</span><select id="c-otro"><option value="">Elegir…</option>' + otros.map(function (c) { return '<option' + (S._otro === c.corte ? ' selected' : '') + '>' + esc(c.corte) + '</option>'; }).join('') + '</select></div>'
      + (S._otro && otros.some(function (c) { return c.corte === S._otro; }) ? bloqueOpciones(S._otro, d, M) : '') + '</details>';
    h += '<div class="campo"><span>Grasa</span><div class="acciones"><button class="btn sm" data-act="grasa" data-v="0" aria-pressed="' + !d.grasaJunta + '">Buena y mala por separado</button><button class="btn sm" data-act="grasa" data-v="1" aria-pressed="' + !!d.grasaJunta + '">Toda junta</button></div></div>';
    $('c-def').innerHTML = h;

    pintarPrevia(cortes, pend.length);
  }
  function bloqueOpciones(corte, d, M) {
    var def = defecto(M.cortes[corte]), el = d.elecciones[corte], ops = def.opciones.slice();
    var tienePed = d.pedidos.some(function (p) { return p.corte === corte; });
    if (el && !el.sinResto && !ops.some(function (o) { return claveDe(o) === claveDe(el); })) ops.unshift(el);
    var h = '<div class="block"><h3>' + esc(corte) + '</h3><p class="small muted">' + (tienePed ? '¿A dónde va el resto?' : '¿A dónde va?') + '</p><div class="ops">';
    S._ops = S._ops || {}; S._ops[corte] = ops;
    h += ops.map(function (o, i) {
      var sel = el && !el.sinResto && claveDe(o) === claveDe(el);
      return '<button class="btn" data-act="elegir" data-corte="' + esc(corte) + '" data-i="' + i + '" aria-pressed="' + !!sel + '">' + esc(lineaTxt(o)) + (o.veces ? ' <span class="small muted">· ' + o.veces + ' veces</span>' : '') + '</button>';
    }).join('');
    if (tienePed) h += '<button class="btn" data-act="elegir" data-corte="' + esc(corte) + '" data-i="-1" aria-pressed="' + !!(el && el.sinResto) + '">Sin resto: todo va a los pedidos</button>';
    h += '<button class="btn lnk" data-act="otro-destino" data-corte="' + esc(corte) + '">Otro destino…</button></div></div>';
    return h;
  }
  function pintarPrevia(cortes, pend) {
    var d = S.dia, o = ordenDe(d);
    o.cortes = cortes || o.cortes;
    var h = '<p class="label">Así queda la orden</p>' + ordenHTML(o, true) + '<div class="acciones">';
    if (d.estado === 'borrador') h += '<button class="btn pri" data-act="confirmar"' + (pend ? ' disabled' : '') + '>Confirmar orden</button>' + (pend ? '<span class="small muted">Falta definir ' + pend + ' ' + (pend === 1 ? 'corte' : 'cortes') + '.</span>' : '');
    else h += '<button class="btn" data-act="reabrir">Reabrir para modificar</button>';
    h += '</div>';
    $('c-prev').innerHTML = h;
  }

  function formPedido(M, dia) {
    var f = S.form;
    if (!f) return '<div class="acciones"><button class="btn pri" data-act="form-abrir">Agregar pedido</button></div>';
    var h = '<div class="block"><h3>' + (f.modo === 'destino' ? 'Otro destino para ' + esc(f.corte) : 'Nuevo pedido') + '</h3>';
    if (f.modo !== 'destino') {
      h += '<div class="campo"><span>Corte</span><select id="f-corte"><option value="">Elegir…</option>' + ORDEN_CORTES.filter(function (c) { return c !== 'Patas y manos'; }).map(function (c) { return '<option' + (f.corte === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>';
      if (f.corte && !f.manual) {
        var hab = habituales(M.cortes[f.corte], M, dia); S._hab = hab;
        h += '<p class="small muted">' + (hab.length ? 'Tocá uno de los que ya se pidieron o cargá uno distinto.' : 'Este corte todavía no tiene pedidos anteriores.') + '</p><div class="ops">'
          + hab.map(function (p, i) { return '<button class="btn" data-act="hab" data-i="' + i + '">' + esc(lineaTxt(p)) + ' <span class="small muted">· última vez ' + esc(cantTxt(p.cantNum, p.unidad)) + '</span></button>'; }).join('')
          + '<button class="btn lnk" data-act="form-manual">Otro distinto…</button></div>';
      }
    }
    if (f.manual || f.modo === 'destino') {
      var dests = {}, prods = {};
      Object.keys(M.cortes).forEach(function (c) { Object.keys(M.cortes[c].g).forEach(function (k) { var l = M.cortes[c].g[k].l; if (l.destino) dests[l.destino] = 1; if (c === f.corte && l.prod) prods[l.prod] = 1; }); });
      h += '<div class="campos">'
        + (f.modo === 'destino' ? '' : '<label class="campo"><span>Cantidad</span><input type="number" inputmode="numeric" min="0" id="f-cantNum" class="q" value="' + esc(f.cantNum || '') + '"></label><label class="campo"><span>Unidad</span><select id="f-unidad">' + UNIDADES.map(function (u) { return '<option' + (f.unidad === u ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select></label>')
        + '<label class="campo"><span>Cliente o destino</span><input type="text" id="f-destino" list="dl-dest" value="' + esc(f.destino || '') + '"></label>'
        + '<label class="campo"><span>Cómo va el corte</span><input type="text" id="f-prod" list="dl-prod" value="' + esc(f.prod || '') + '" placeholder="Ej.: sin hueso, con cuero"></label>'
        + '<label class="campo"><span>Estado</span><select id="f-estado"><option value="fresco"' + (f.estado !== 'congelado' ? ' selected' : '') + '>Fresco</option><option value="congelado"' + (f.estado === 'congelado' ? ' selected' : '') + '>Congelado</option></select></label>'
        + '<label class="campo"><span>Envase</span><select id="f-envase">' + ENVASES.map(function (u) { return '<option value="' + u + '"' + ((f.envase || '') === u ? ' selected' : '') + '>' + (u || 'Sin indicar') + '</option>'; }).join('') + '</select></label>'
        + '<label class="campo"><span>Código</span><input type="text" inputmode="numeric" id="f-cod" value="' + esc(f.cod || '') + '"></label>'
        + '<label class="campo"><span>Aclaración</span><input type="text" id="f-nota" value="' + esc(f.nota || '') + '"></label></div>'
        + '<datalist id="dl-dest">' + Object.keys(dests).sort().map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>'
        + '<datalist id="dl-prod">' + Object.keys(prods).sort().map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>';
      if (f.error) h += '<p class="small neg">' + esc(f.error) + '</p>';
    }
    h += '<div class="acciones">' + (f.manual || f.modo === 'destino' ? '<button class="btn pri" data-act="form-ok">' + (f.modo === 'destino' ? 'Usar este destino' : 'Agregar') + '</button>' : '') + '<button class="btn" data-act="form-cerrar">Cancelar</button></div></div>';
    return h;
  }
  function leerForm() {
    var f = S.form; if (!f) return;
    ['cantNum', 'unidad', 'destino', 'prod', 'estado', 'envase', 'cod', 'nota'].forEach(function (k) { var e = $('f-' + k); if (e) f[k] = e.value.trim(); });
  }
  function agregarPedido(p) {
    var x = soloCampos(p);
    x.id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    x.corte = p.corte; x.cantNum = +p.cantNum || 0; x.unidad = p.unidad || 'kg';
    S.dia.pedidos.push(x);
    return x;
  }

  /* ---------- cómo va cada corte ---------- */
  function renderCortes() {
    var el = $('view-cortes'), M = S.ordenes ? modelo() : null, ORD = M ? M.ordenes : null;
    if (stateBlock(el, S.ordenes && ORD, 'Todavía no hay órdenes confirmadas para aprender cómo va cada corte.')) return;
    var total = ORD.length, top = function (m) { return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }); };
    var lista = function (a) { return a.length > 1 ? a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] : a[0]; };
    var A = ORDEN_CORTES.filter(function (c) { return M.cortes[c]; }).map(function (c) {
      var C = M.cortes[c];
      return { corte: c, grupos: Object.keys(C.g).map(function (k) {
        var G = C.g[k], l = G.l, dias = Object.keys(G.fechas).length, ped = G.nPed, fijo = G.nFijo;
        var uso = l.tipo === 'nosale' ? 'No se saca' : ped && fijo ? 'Pedido o resto' : ped ? 'Pedido' : (G.tipos.resto || 0) > (G.tipos.todo || 0) ? 'Resto' : G.tipos.resto ? 'Todo o resto' : 'Todo';
        var cant = Object.keys(G.cant).map(function (u) { var a = G.cant[u], lo = Math.min.apply(null, a), hi = Math.max.apply(null, a); return (lo === hi ? n(lo) : n(lo) + '–' + n(hi)) + ' ' + u; }).join(' · ');
        var dd = DIAS.filter(function (d) { return G.dias[d]; });
        var cuando = dias === total ? 'Todos los días' : dias === 1 ? 'una vez, un ' + dd[0].toLowerCase() : dd.length <= 2 ? dd.map(function (d) { return G.dias[d] === M.porDia[d] ? 'todos los ' + d.toLowerCase() : d.toLowerCase() + ' (' + G.dias[d] + ' de ' + M.porDia[d] + ')'; }).join(' y ') : dd.length < 5 ? 'de ' + lista(dd.map(function (d) { return d.toLowerCase(); })) + ', nunca ' + lista(DIAS.filter(function (d) { return !G.dias[d]; }).map(function (d) { return d.toLowerCase(); })) : 'cualquier día';
        return { prod: cap1([l.prod, top(G.env)[0]].filter(Boolean).join(', ')), estado: l.estado, destino: l.destino, cods: top(G.cods), uso: uso, dias: dias, cant: cant, cuando: cap1(cuando), nosale: l.tipo === 'nosale' };
      }).sort(function (a, b) { return b.dias - a.dias; }) };
    });
    var fijos = A.filter(function (c) { return c.grupos.length === 1; }), vari = A.filter(function (c) { return c.grupos.length > 1; });
    var h = '<div class="panel"><h2>Lo que se repite en ' + total + ' órdenes</h2>'
      + '<p class="muted">Del ' + esc(ORD[0].titulo.toLowerCase()) + ' al ' + esc(ORD[total - 1].titulo.toLowerCase()) + '. Con esto se arma cada orden nueva: primero los pedidos con cantidad y el resto al destino habitual. Cada orden que se confirma se suma a lo aprendido.</p>'
      + '<dl class="stats">' + stat('Siempre igual', fijos.length, 'cortes') + stat('Cambian con los pedidos', vari.length, 'cortes') + '</dl></div>';
    h += '<div class="panel"><h2>Cambian con los pedidos</h2>' + vari.map(function (c) {
      return '<div class="block"><h3>' + esc(c.corte) + '</h3><div class="scroll"><table class="learn"><thead><tr><th>Cómo va</th><th>Destino</th><th>Uso</th><th style="text-align:right">Días</th><th>Cantidad</th><th>Cuándo</th></tr></thead><tbody>'
        + c.grupos.map(function (g) {
          return '<tr><td>' + (g.prod ? esc(g.prod) + ' ' : '') + estadoBadge(g.estado) + (g.cods.length ? ' <span class="badge plain">Cód. ' + esc(g.cods.join(' / ')) + '</span>' : '') + '</td>'
            + '<td>' + (g.destino ? '<strong>' + esc(g.destino) + '</strong>' : '<span class="muted">Sin cliente indicado</span>') + '</td><td>' + esc(g.uso) + '</td>'
            + '<td class="r"><span class="freq"><i style="width:' + Math.round(g.dias / total * 100) + '%"></i></span>' + g.dias + ' de ' + total + '</td>'
            + '<td>' + (g.cant ? esc(g.cant) : '<span class="muted">—</span>') + '</td><td>' + esc(g.cuando) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }).join('') + '</div>';
    h += '<div class="panel"><h2>Siempre igual</h2><div class="scroll"><table class="learn"><thead><tr><th>Corte</th><th>Cómo va</th><th>Destino</th></tr></thead><tbody>' + fijos.map(function (c) {
      var g = c.grupos[0];
      return '<tr><td><strong>' + esc(c.corte) + '</strong></td><td>' + (g.nosale ? 'No se saca' : (g.prod ? esc(g.prod) + ' ' : '') + estadoBadge(g.estado) + (g.cods.length ? ' <span class="badge plain">Cód. ' + esc(g.cods.join(' / ')) + '</span>' : '')) + '</td>'
        + '<td>' + (g.nosale ? '<span class="muted">—</span>' : g.destino ? '<strong>' + esc(g.destino) + '</strong>' : '<span class="muted">Sin cliente indicado</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
    el.innerHTML = h;
  }

  /* ---------- estados, sesión y navegación ---------- */
  function stateBlock(el, data, emptyMsg) {
    var msg = S.status === 'loading' && !data ? 'Cargando datos…'
      : S.status === 'error' && !data ? 'No se pudieron cargar los datos. Revisá la conexión y volvé a abrir la app.'
      : (!data || !data.length) && emptyMsg ? emptyMsg : '';
    if (msg) { el.innerHTML = '<div class="panel"><p class="state">' + msg + '</p></div>'; return true; }
    return false;
  }
  function renderSesion() {
    var e = $('sesion'); if (!e) return;
    if (!store || !store.signIn) { e.innerHTML = ''; return; }
    if (!S.user) e.innerHTML = '<button class="btn sm" data-act="ingresar">Ingresar para cargar</button>';
    else e.innerHTML = '<span class="muted">' + esc(S.user.email) + (S.editor ? '' : ' · sin permiso para cargar') + '</span><button class="btn sm lnk" data-act="salir">Salir</button>';
  }
  function render() {
    $('stamp').textContent = (S.config.actualizado ? 'Actualizado: ' + S.config.actualizado : '') + (S.fuente === 'cache' ? ' · sin conexión' : '');
    renderSesion();
    $('tab-cargar').hidden = !S.editor;
    if (S.tab === 'cargar' && !S.editor) S.tab = 'ordenes';
    TABS.forEach(function (t) { $('view-' + t).hidden = S.tab !== t; $('tab-' + t).setAttribute('aria-selected', String(S.tab === t)); });
    if (S.tab === 'stock') renderStock(); else if (S.tab === 'ordenes') renderOrdenes(); else if (S.tab === 'cortes') renderCortes(); else renderCargar();
  }
  // No redibuja la pantalla de carga mientras se escribe en ella.
  function renderDatos() { if (S.tab === 'cargar' && S.dia) { $('stamp').textContent = S.config.actualizado ? 'Actualizado: ' + S.config.actualizado : ''; return; } if (S.tab === 'stock' && S.editSem) return; render(); }

  function setSemanas(list) {
    S.semanas = list.slice().sort(function (a, b) { return String(a.desde).localeCompare(String(b.desde)); });
    if (!S.sem || !S.semanas.some(function (s) { return s.id === S.sem; })) {
      var hoy = iso(new Date()), prev = S.semanas.filter(function (s) { return s.desde <= hoy; });
      S.sem = (prev[prev.length - 1] || S.semanas[0] || {}).id || null;
    }
  }
  function setOrdenes(list) {
    S.ordenes = list.slice().sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
    if (!S.ord || !S.ordenes.some(function (o) { return o.id === S.ord; })) S.ord = (S.ordenes[S.ordenes.length - 1] || {}).id || null;
  }
  function irA(tab) { S.tab = tab; try { history.replaceState(null, '', '#' + tab); } catch (err) {} render(); window.scrollTo(0, 0); }

  document.querySelector('.tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) irA(b.dataset.tab); });

  document.addEventListener('click', function (e) {
    var p = e.target.closest('[data-sem]');
    if (p) { S.sem = p.dataset.sem; S.editSem = null; render(); return; }
    var st = e.target.closest('[data-step]');
    if (st && S.ordenes) { var i = S.ordenes.map(function (o) { return o.id; }).indexOf(S.ord) + Number(st.dataset.step); if (S.ordenes[i]) { S.ord = S.ordenes[i].id; render(); } return; }
    var b = e.target.closest('[data-act]'); if (!b) return;
    var a = b.dataset.act, d = S.dia;

    if (a === 'copiar') {
      var ta = $('txt-orden'), msg = $('copiado'); ta.hidden = false;
      var ok = function () { msg.textContent = 'Copiado.'; }, no = function () { ta.focus(); ta.select(); msg.textContent = 'Seleccionado: copialo con Ctrl+C o manteniendo apretado.'; };
      try { navigator.clipboard.writeText(ta.value).then(ok, no); } catch (err) { no(); }
    }
    else if (a === 'ingresar') { store.signIn().catch(function () {}); }
    else if (a === 'salir') { store.signOut(); }
    else if (a === 'importar') { importar(); }
    else if (a === 'abrir-carga') { S.dia = diaDesde(b.dataset.fecha); S.form = null; S._otro = ''; S.guardado = ''; irA('cargar'); }

    // semana
    else if (a === 'sem-editar') { S.editSem = clone(S.semanas.filter(function (s) { return s.id === S.sem; })[0]); render(); }
    else if (a === 'sem-nueva') { var nueva = semanaNueva(); S.semanas = S.semanas.concat([nueva]); S.sem = nueva.id; S.editSem = clone(nueva); S._semNueva = nueva.id; render(); }
    else if (a === 'sem-cancelar') { if (S._semNueva === S.editSem.id) { S.semanas = S.semanas.filter(function (s) { return s.id !== S._semNueva; }); S.sem = (S.semanas[S.semanas.length - 1] || {}).id || null; } S._semNueva = null; S.editSem = null; render(); }
    else if (a === 'sem-tipo') { S.editSem.tipo = b.dataset.v; render(); }
    else if (a === 'sem-guardar') { S._semNueva = null; guardarSemana(); }

    // carga de pedidos
    else if (a === 'sug') { agregarPedido(S._sug[+b.dataset.i]); guardarDia(); pintarCarga(); }
    else if (a === 'sug-todos') { S._sug.forEach(agregarPedido); guardarDia(); pintarCarga(); }
    else if (a === 'ped-quitar') { d.pedidos = d.pedidos.filter(function (x) { return x.id !== b.dataset.id; }); guardarDia(); pintarCarga(); }
    else if (a === 'form-abrir') { S.form = { corte: '', unidad: 'kg', estado: 'fresco' }; pintarCarga(); }
    else if (a === 'form-cerrar') { S.form = null; pintarCarga(); }
    else if (a === 'form-manual') { S.form.manual = true; pintarCarga(); }
    else if (a === 'hab') { var x = agregarPedido(S._hab[+b.dataset.i]); S.form = null; guardarDia(); pintarCarga(); var q = $('q-' + x.id); if (q) { q.focus(); q.select(); } }
    else if (a === 'form-ok') {
      leerForm(); var f = S.form;
      if (f.modo === 'destino') {
        if (!f.destino && !f.prod && !f.envase) { f.error = 'Indicá al menos el destino o cómo va el corte.'; pintarCarga(); return; }
        d.elecciones[f.corte] = soloCampos(f); S.form = null; guardarDia(); pintarCarga();
      } else {
        if (!f.corte) { f.error = 'Elegí el corte.'; pintarCarga(); return; }
        if (!(+f.cantNum > 0)) { f.error = 'Indicá la cantidad.'; pintarCarga(); return; }
        agregarPedido(f); S.form = null; guardarDia(); pintarCarga();
      }
    }
    else if (a === 'elegir') { var i2 = +b.dataset.i, c = b.dataset.corte; d.elecciones[c] = i2 < 0 ? { sinResto: true } : soloCampos(S._ops[c][i2]); guardarDia(); pintarCarga(); }
    else if (a === 'otro-destino') { S.form = { modo: 'destino', corte: b.dataset.corte, estado: 'fresco' }; pintarCarga(); var fd = $('f-destino'); if (fd) fd.focus(); }
    else if (a === 'grasa') { d.grasaJunta = b.dataset.v === '1'; guardarDia(); pintarCarga(); }
    else if (a === 'confirmar') { d.estado = 'confirmada'; guardarDia(true); S.ord = d.fecha; pintarCarga(); }
    else if (a === 'reabrir') { d.estado = 'borrador'; guardarDia(true); pintarCarga(); }
  });

  document.addEventListener('change', function (e) {
    var t = e.target, d = S.dia;
    if (t.id === 'sel-orden') { S.ord = t.value; render(); }
    else if (t.id === 'c-fecha' && t.value) { S.dia = diaDesde(t.value); S.form = null; S._otro = ''; S.guardado = ''; pintarCarga(); }
    else if (t.id === 'c-otro') { S._otro = t.value; pintarCarga(); }
    else if (t.id === 'f-corte') { leerForm(); S.form.corte = t.value; S.form.manual = false; pintarCarga(); }
  });
  document.addEventListener('input', function (e) {
    var t = e.target, d = S.dia;
    if (t.dataset.semK) { S.editSem.dias[+t.dataset.semDia][t.dataset.semK] = t.value; refrescarSemana(); }
    else if (t.dataset.semCampo) { S.editSem[t.dataset.semCampo] = t.value; refrescarSemana(); }
    else if (t.id === 'c-medias') { d.medias = +t.value || 0; guardarDia(); pintarPrevia(); }
    else if (t.id === 'c-mercado') { d.mercado = t.value; guardarDia(); pintarPrevia(); }
    else if (t.dataset.ped) {
      var p = d.pedidos.filter(function (x) { return x.id === t.dataset.ped; })[0]; if (!p) return;
      p[t.dataset.k] = t.dataset.k === 'cantNum' ? (+t.value || 0) : t.value;
      guardarDia(); pintarPrevia(null, armar(d).filter(function (c) { return c.revisar === 'definir'; }).length);
    }
  });

  var h0 = (location.hash || '').slice(1); if (TABS.indexOf(h0) >= 0) S.tab = h0;

  /* ---------- datos ---------- */
  function cache(leer) {
    try {
      if (leer) return JSON.parse(localStorage.getItem('pq-datos') || 'null');
      localStorage.setItem('pq-datos', JSON.stringify({ semanas: S.semanas, ordenes: S.ordenes, config: S.config }));
    } catch (err) { return null; }
  }
  function aplicar(d, fuente) { S.config = d.config || {}; setSemanas(d.semanas || []); setOrdenes(d.ordenes || []); S.status = 'ready'; S.fuente = fuente; }
  function respaldo() {
    return fetch('datos.json?v=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function importar() {
    var msg = $('imp-msg'); if (msg) msg.textContent = 'Importando…';
    respaldo().then(function (d) {
      var tareas = [];
      (d.semanas || []).forEach(function (s) { var x = clone(s), id = x.id; delete x.id; tareas.push(store.set('semanas', id, x)); });
      (d.ordenes || []).forEach(function (o) { var x = clone(o), id = x.id; delete x.id; tareas.push(store.set('ordenes', id, x)); });
      var c = clone(d.config || {}); c.actualizado = ahoraTxt(); tareas.push(store.set('config', 'general', c));
      return Promise.all(tareas);
    }).then(function () { S.dia = null; render(); }, function () { if (msg) { msg.textContent = 'No se pudo importar. Revisá la conexión y probá de nuevo.'; msg.className = 'guardado err'; } });
  }

  function mockStore(m) {
    var subs = {}, authCb = null;
    function emit(c) { var docs = Object.keys(m.data[c] || {}).map(function (id) { var o = clone(m.data[c][id]); o.id = id; return o; }); (subs[c] || []).forEach(function (f) { f(docs); }); }
    return {
      sub: function (c, cb) { (subs[c] = subs[c] || []).push(cb); setTimeout(function () { emit(c); }, 0); },
      set: function (c, id, data) { if (m.fallar) return Promise.reject(new Error('x')); m.data[c] = m.data[c] || {}; m.data[c][id] = clone(data); m.escrituras = (m.escrituras || 0) + 1; setTimeout(function () { emit(c); }, 0); return Promise.resolve(); },
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
        sub: function (c, cb, err) { return fs.onSnapshot(fs.collection(db, c), function (snap) { cb(snap.docs.map(function (x) { var o = x.data(); o.id = x.id; return o; })); }, err); },
        set: function (c, id, data) { return fs.setDoc(fs.doc(db, c, id), clone(data)); },
        onAuth: function (cb) { return au.onAuthStateChanged(auth, cb); },
        signIn: function () { return au.signInWithPopup(auth, new au.GoogleAuthProvider()); },
        signOut: function () { return au.signOut(auth); },
        esEditor: function (email) { return fs.getDoc(fs.doc(db, 'editores', email)).then(function (s) { return s.exists(); }, function () { return false; }); }
      };
    });
  }

  function conectar(st) {
    store = st;
    var got = {}, vacio = false;
    function llego(k) {
      got[k] = true;
      if (!(got.semanas && got.ordenes)) return;
      S.status = 'ready';
      if (!S.semanas.length && !S.ordenes.length) {
        // Base vacía: se muestra el respaldo publicado con la web hasta que un editor importe.
        if (!vacio) { vacio = true; S.fuente = 'vivo'; respaldo().then(function (d) { if (!S.semanas.length && !S.ordenes.length && !S.editor) { aplicar(d, 'respaldo'); render(); } }, function () {}); }
      } else { S.fuente = 'vivo-con-datos'; cache(); }
      renderDatos();
    }
    var fallo = function () { if (!got.semanas || !got.ordenes) { var c = cache(true); if (c && c.ordenes) aplicar(c, 'cache'); else S.status = 'error'; render(); } };
    store.sub('semanas', function (l) { if (S.fuente === 'respaldo' && !l.length) return; setSemanas(l); llego('semanas'); }, fallo);
    store.sub('ordenes', function (l) { if (S.fuente === 'respaldo' && !l.length) return; setOrdenes(l); llego('ordenes'); }, fallo);
    store.sub('config', function (l) { var c = l.filter(function (x) { return x.id === 'general'; })[0]; if (c) { S.config = c; renderDatos(); } }, function () {});
    store.onAuth(function (u) {
      S.user = u ? { email: u.email } : null; S.editor = false;
      if (!u) { S.dia = null; S.editSem = null; render(); return; }
      store.esEditor(u.email).then(function (ok) {
        S.editor = ok;
        if (ok && S.fuente === 'respaldo') { S.semanas = []; S.ordenes = []; S.fuente = 'vivo'; }
        render();
      });
    });
  }

  function boot() {
    var c = cache(true);
    if (c && c.ordenes && !window.__mock) aplicar(c, 'cache');
    render();
    if (window.__mock) { conectar(mockStore(window.__mock)); return; }
    firebaseStore().then(conectar, function () {
      if (S.status !== 'ready') respaldo().then(function (d) { aplicar(d, 'respaldo'); render(); }, function () { S.status = 'error'; render(); });
    });
  }
  if ('serviceWorker' in navigator && !window.__mock) navigator.serviceWorker.register('sw.js').catch(function () {});
  boot();
})();
