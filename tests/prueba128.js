// Centro de desposte › DDJJ desposte: pechito con manta + panceta + "Carre,pecho y matambre en juego" = medias, y matambrito igual (pedido de Sabi 29/10).
// La panceta sin regla de cantidad cuenta las unidades del sistema; un renglón de panceta agregado a mano también se descuenta.
const {chromium}=require('playwright');
const F='2026-10-28';
const TXT=['OK|2026-10-28 19:00','TR|2026-10-28|261799|160|2026-10-27|318|25440',
 'RE|2026-10-28|203|CARRE PECHO Y MATAMBRE|1|10|10|150','RE|2026-10-28|211|PECHITO CON MANTA|1|9|27|900',
 'RE|2026-10-28|251|PANCETA CON CUERO|1|50|0|450','RE|2026-10-28|231|MATAMBRITO|1|5|20|300'].join('\n');
const EQ=L=>({lineas:L,ignorar:[22],rendering:[417],enteras:[22],eqVer:2,contExp:[8]});
const BASE=[{n:'Carre,pecho y matambre en juego',arts:[203],cant:'piezas'},{n:'Pechito con manta',arts:[211],cant:'resto',menos:['Carre,pecho y matambre en juego']},{n:'Matambrito',arts:[231],cant:'resto',menos:['Carre,pecho y matambre en juego']}];
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
const ver=async(docs,w)=>{const p=await b.newPage({viewport:{width:w||1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-29T09:00:00-03:00')});
 await p.addInitScript(m=>{window.__mock=m},{user:{email:'ssaavedra@x.com',displayName:'Saavedra',emailVerified:true},rol:'ddjj',sis:{'dj-2026-10':TXT},docs});
 await p.goto('http://127.0.0.1:8765/ddjj.html?f='+F);await p.clock.runFor(1500);await p.waitForSelector('.dj-tab');
 const r=await p.evaluate(()=>{const P=planilla(S.fecha),c=n=>{const f=P.filas.find(z=>z.n===n);return f?f.cant:'-';};return {ma:c('Matambrito'),pe:c('Pechito con manta'),pa:c('Panceta con cuero'),ju:c('Carre,pecho y matambre en juego'),m:P.tot.medias};});
 const des=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);await p.close();return Object.assign(r,{errs,des});};
// 1) panceta como renglón fijo (sin regla de cantidad)
let r=await ver({'ddjj-equiv':EQ(BASE.concat([{n:'Panceta con cuero',arts:[251]}]))});
console.log('fijo:',JSON.stringify(r));
ok(r.pa===50,'panceta cuenta las unidades del sistema (50)');
ok(r.pe===258&&r.pe+r.pa+r.ju===r.m,'pechito + panceta + juego = medias (258 + 50 + 10 = '+r.m+')');
ok(r.ma===258&&r.ma+r.pa+r.ju===r.m,'matambrito + panceta + juego = medias ('+r.ma+')');
ok(!r.errs.length,'errores: '+(r.errs.join('|')||'ninguno'));
// 2) panceta agregada a mano ese día con la cantidad escrita
r=await ver({'ddjj-equiv':EQ(BASE),'ddjj-2026-10':{dias:{[F]:{mover:{251:'I'},prod:{'Panceta con cuero':{cant:20,exp:null,cons:180,dest:'CONSUMO'}}}}}},400);
console.log('agregada:',JSON.stringify(r));
ok(r.pe===288&&r.pe+r.pa+r.ju===r.m,'con panceta agregada a mano (20): pechito 288');
ok(r.ma===288,'con panceta agregada a mano (20): matambrito 288');
ok(r.des<=0,'400 sin desborde');ok(!r.errs.length,'errores: '+(r.errs.join('|')||'ninguno'));
// 3) sin panceta: como antes (medias − juego)
r=await ver({'ddjj-equiv':EQ(BASE),'ddjj-2026-10':{dias:{[F]:{mover:{251:'I'}}}}});
ok(r.pe===308&&r.ma===308,'sin panceta: pechito y matambrito = medias − juego (308), como antes');
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
