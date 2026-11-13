// Centro de desposte › DDJJ desposte: un artículo sacado de la declaración solo un día (No va / rendering) se lista con "volver a ponerlo" (Sabi 13/11, art. 374).
const {chromium}=require('playwright');
const F='2026-11-11';
const TXT=['OK|2026-11-11 19:00','TR|2026-11-11|261830|160|2026-11-10|320|25600','RE|2026-11-11|101|BONDIOLA|1|60|500|1300','RE|2026-11-11|374|RECORTE DE JAMON CON GRASA 50/50" 3 "|1|20|20|412.5'].join('\n');
const EQ={lineas:[{n:'Bondiola',arts:[101]},{n:'Recortes',arts:[374]}],ignorar:[22],rendering:[417],enteras:[22],eqVer:2,contExp:[8]};
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
for(const w of [1300,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-13T07:00:00-03:00')});
 await p.addInitScript(m=>{window.__mock=m},{user:{email:'s@x.com',displayName:'S',emailVerified:true},rol:'ddjj',sis:{'dj-2026-11':TXT},docs:{'ddjj-equiv':EQ,'ddjj-2026-11':{dias:{[F]:{mover:{374:'I'}}}}}});
 await p.goto('http://127.0.0.1:8765/ddjj.html?f='+F);await p.clock.runFor(1500);await p.waitForSelector('.dj-tab');
 const kg=()=>p.evaluate(()=>{const r=planilla(S.fecha).filas.find(z=>z.n==='Recortes');return r?(r.cons||0)+(r.exp||0):0;});
 const t=await p.evaluate(()=>document.getElementById('main').innerText);
 ok(/Sacados de la declaración solo este día: 374 · RECORTE DE JAMON CON GRASA/.test(t),w+': se ve el artículo sacado ese día');
 ok(await kg()===0,w+': mientras tanto no está en Recortes');
 if(w===1300){await p.click('text=volver a ponerlo');await p.waitForTimeout(400);
  ok(await kg()===412.5,'vuelve a Recortes con sus 412,5 kg');
  ok(!/Sacados de la declaración/.test(await p.evaluate(()=>document.getElementById('main').innerText)),'ya no figura como sacado');}
 ok(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=0,w+' sin desborde');ok(!errs.length,w+' errores: '+(errs.join('|')||'ninguno'));await p.close();}
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
