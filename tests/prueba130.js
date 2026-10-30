// Centro de desposte › DDJJ desposte: tropa faenada en dos días (pedido de Sabi 30/10, tropa 261798: 160 cabezas, 81 el 26/10 y 79 el 27/10).
// El desposte del 29/10 tiene solo medias de un día de faena: total de tropa = cabezas faenadas ese día y FAENA PARCIAL (datos FT del romaneo).
const {chromium}=require('playwright');
const F='2026-10-29';
const BASE=['OK|2026-10-29 19:00','TR|2026-10-29|261798|160|2026-10-27|158|14000','TR|2026-10-29|261800|150|2026-10-28|300|24000',
 'TR|2026-10-28|261798|160|2026-10-26|162|14300','RE|2026-10-29|101|BONDIOLA|1|60|500|1300','RE|2026-10-28|101|BONDIOLA|1|60|500|1300'];
const FT=['FT|261798|2026-10-26|81','FT|261798|2026-10-27|79','FT|261800|2026-10-28|150','FT|261799|2026-10-27|159'];
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
const ver=async(txt,f,anual,w)=>{const p=await b.newPage({viewport:{width:w||1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-30T09:00:00-03:00')});
 await p.addInitScript(m=>{window.__mock=m},{user:{email:'ssaavedra@x.com',displayName:'Saavedra',emailVerified:true},rol:'ddjj',sis:{'dj-2026-10':txt.join('\n'),'dj-anual':anual||'OK|x'},docs:{}});
 await p.goto('http://127.0.0.1:8765/ddjj.html?f='+f);await p.clock.runFor(1500);await p.waitForSelector('.dj-tab');
 const ing=await p.evaluate(()=>planilla(S.fecha).ingreso.map(t=>t.tropa+':'+t.cab+':'+t.obs));
 const aviso=await p.evaluate(()=>[...document.querySelectorAll('.alerta')].map(a=>a.textContent).join(' '));
 await p.evaluate(()=>{document.getElementById('impresion').innerHTML=hojas(S.fecha)});const imp=await p.evaluate(()=>document.getElementById('impresion').textContent);
 const des=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);await p.close();return {ing,aviso,imp,errs,des};};
let r=await ver(BASE.concat(FT),F);console.log('29/10:',r.ing.join(' / '));
ok(r.ing.includes('261798:79:FAENA PARCIAL'),'29/10: 261798 faena 27/10 → 79 y FAENA PARCIAL');
ok(r.ing.includes('261800:150:Consumo'),'29/10: tropa faenada en un solo día sin cambios');
ok(/261798.*26\/10: 81, 27\/10: 79/.test(r.aviso),'aviso con los dos días de faena');
ok(/26179879158/.test(r.imp)&&/FAENA PARCIAL/.test(r.imp),'la hoja impresa lleva 79 y FAENA PARCIAL');
ok(!r.errs.length,'errores: '+(r.errs.join('|')||'ninguno'));
r=await ver(BASE.concat(FT),'2026-10-28',null,400);console.log('28/10:',r.ing.join(' / '));
ok(r.ing.includes('261798:81:FAENA PARCIAL'),'28/10: 261798 faena 26/10 → 81 y FAENA PARCIAL');
ok(r.des<=0,'400 sin desborde');ok(!r.errs.length,'errores: '+(r.errs.join('|')||'ninguno'));
// sin FT (datos viejos de la notebook): como antes
r=await ver(BASE,F);ok(r.ing.includes('261798:160:Consumo'),'sin datos FT: queda como antes ('+r.ing[0]+')');
// muerto + FT de un solo día: toma las faenadas del romaneo (159) y FAENA PARCIAL
r=await ver(['OK|x','TR|2026-10-29|261799|160|2026-10-27|318|25440','RE|2026-10-29|101|BONDIOLA|1|60|500|1300'].concat(FT),F,'OK|x\nMU|2026-10-27|261799|1|C|AB|10|P|L| ');
ok(r.ing.includes('261799:159:FAENA PARCIAL')&&/160 − 1 = 159/.test(r.aviso),'muerto: 159, FAENA PARCIAL y aviso 160 − 1 = 159');
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
