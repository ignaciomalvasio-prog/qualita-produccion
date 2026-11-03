// Centro de desposte › Faena y mortalidad: los muertos de 2025 son los de la planilla RESUMEN PRODUCCIÓN (incluyen playa de emergencia; Sabi 03/11).
const {chromium}=require('playwright');
const ANUAL=['OK|2026-11-03 07:00','FA|2026-10|1|4000|400000|20','FA|2025-10|1|4000|400000|20','MU|2025-10-05|250000|3|C|AB|10|P|L| ','MU|2026-10-05|261000|2|V|AB|10|P|L| '].join('\n');
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
for(const w of [1300,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-03T13:00:00-03:00')});
 await p.addInitScript(m=>{window.__mock=m},{user:{email:'s@x.com',displayName:'S',emailVerified:true},rol:'ddjj',sis:{'dj-2026-11':'OK|x','dj-anual':ANUAL},docs:{}});
 await p.goto('http://127.0.0.1:8765/ddjj.html');await p.clock.runFor(1500);await p.click('#nav a[data-t="faena"]');await p.waitForTimeout(400);
 const t=await p.evaluate(()=>document.getElementById('main').innerText.replace(/\s+/g,' '));
 if(w===1300){const i=t.indexOf('Mortalidad 2026');console.log(t.slice(i,i+700));
  ok(/Enero 38 /.test(t.slice(i))&&/Octubre 41 2 /.test(t.slice(i))&&/Diciembre 26/.test(t.slice(i)),'meses de 2025 de la planilla (enero 38, octubre 41, diciembre 26)');
  ok(/Total 345 /.test(t.slice(i)),'total 2025 = 345');
  ok(/RESUMEN PRODUCCIÓN/.test(t),'aclara de dónde salen');}
 ok(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=0,w+' sin desborde');ok(!errs.length,w+' errores: '+(errs.join('|')||'ninguno'));await p.close();}
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
