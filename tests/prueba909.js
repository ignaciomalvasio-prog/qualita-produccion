// Centro de desposte › Faena y mortalidad: editar un muerto cargado a mano (✎), con el tilde "Pasó por la playa de emergencia" (Sabi 03/11).
const {chromium}=require('playwright');
const MU={lista:[{id:'m1',fecha:'2026-10-15',tropa:'261770',cab:1,lugar:'CORRAL',patente:'AB1',prod:'LA QUIMERA S.A.',loc:'EL RODEO',obs:'',por:'Sabi'},{id:'m2',fecha:'2026-10-20',tropa:'261780',cab:2,lugar:'VIAJE',obs:'x'}]};
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
for(const w of [1300,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-03T13:00:00-03:00')});
 await p.addInitScript(m=>{window.__mock=m},{user:{email:'s@x.com',displayName:'S',emailVerified:true},rol:'ddjj',sis:{'dj-2026-11':'OK|x','dj-anual':'OK|x\nFA|2026-10|1|4000|400000|20'},docs:{'ddjj-muertos':MU}});
 await p.goto('http://127.0.0.1:8765/ddjj.html');await p.clock.runFor(1500);await p.click('#nav a[data-t="faena"]');await p.waitForTimeout(400);
 ok(await p.locator('button[title="Editar"]').count()===2,w+': botón editar en los cargados a mano');
 if(w===1300){
  await p.locator('tr:has-text("261770") button[title="Editar"]').click();await p.waitForTimeout(200);
  ok(await p.inputValue('#mu-t')==='261770'&&await p.inputValue('#mu-g')==='EL RODEO','el formulario viene con los datos');
  await p.check('#mu-e');await p.click('#mu-ok');await p.waitForTimeout(400);
  const d=await p.evaluate(()=>window.__mock.docs['ddjj-muertos'].lista);
  ok(d.length===2&&d[0].id==='m1'&&d[0].emerg===true&&d[0].obs==='Playa de emergencia'&&d[0].lugar==='CORRAL','se guarda en el mismo renglón: playa de emergencia');
  const fila=await p.locator('tr:has-text("261770")').innerText();
  ok(/emergencia/.test(fila)&&/Playa de emergencia/.test(fila),'en el listado queda marcado');}
 ok(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=0,w+' sin desborde');ok(!errs.length,w+' errores: '+(errs.join('|')||'ninguno'));await p.close();}
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
