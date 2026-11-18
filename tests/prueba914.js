// Centro de desposte › DDJJ › Menudencias (Sabi 18/11): la pestaña mensual muestra solo menudencias (el rendering tiene su DDJJ diaria aparte).
const {chromium}=require('playwright');
const TXT=['OK|2026-11-18 07:00','TR|2026-11-17|261850|160|2026-11-16|320|25600','RE|2026-11-17|705|CABEZA|1|60|0|500',
 'ME|2026-11-17|3|431|HIGADO|0|80','ME|2026-11-17|3|436|CORAZON|0|20','ME|2026-11-17|6|900|HARINA DE CARNE Y HUESO PORCINA|0|1200'].join('\n');
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
for(const w of [1300,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-18T08:00:00-03:00')});
 await p.addInitScript(m=>{window.__mock=m},{user:{email:'s@x.com',displayName:'Sabi',emailVerified:true},rol:'ddjj',sis:{'dj-2026-11':TXT},docs:{}});
 await p.goto('http://127.0.0.1:8765/ddjj.html');await p.clock.runFor(1500);
 const nav=await p.evaluate(()=>[...document.querySelectorAll('#nav .ngl a')].map(a=>a.textContent).join(' · '));
 ok(nav==='Desposte · Chacinados · Rendering · Menudencias','menú DDJJ: '+nav);
 await p.click('#nav a[data-t="men"]');await p.waitForTimeout(400);
 const t=await p.evaluate(()=>document.getElementById('main').innerText.replace(/\s+/g,' '));
 if(w===1300){
  ok(/Menudencias · Noviembre 2026/i.test(t)&&!/Menudencias y rendering/i.test(t),'título Menudencias');
  ok(/Total menudencias 600,00/.test(t),'total de menudencias (hígado 80 + corazón 20 + cabeza 500)');
  ok(!/Total rendering|HARINA/.test(t),'sin rendering');
  const hoja=await p.evaluate(()=>hojaM());
  ok(/RESUMEN MENSUAL DE PRODUCCIÓN DE MENUDENCIAS<\/div>/.test(hoja)&&!/RENDERING/.test(hoja),'hoja impresa solo con menudencias');}
 ok(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=0,w+' sin desborde');ok(!errs.length,w+' errores: '+(errs.join('|')||'ninguno'));await p.close();}
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
