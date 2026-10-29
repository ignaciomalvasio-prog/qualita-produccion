// Cámara: "DESPOSTE DEL DÍA" muestra el desposte de ese mismo día (se guarda como "día siguiente" del día anterior,
// así la planilla no cambia) y abajo se ven 3 semanas más.
const {chromium}=require('playwright');const SP=process.argv[2];
const base={faena:{},produccion:{},config:{general:{}},privado:{'camara-2026-10-26':{dias:[{despSig:700},{despSig:710},{despSig:720},{despSig:730},{despSig:740}]}},pedidos:{}};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-29T10:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],camara:['yo@x.com']}},base);
 await p.goto('http://127.0.0.1:8765/index.html#camara');await p.clock.runFor(1500);await p.waitForSelector('.cam-tabla');
 const fila=(lab,k)=>p.evaluate(([l,k])=>{const t=document.querySelectorAll('.cam-tabla')[k];const tr=[...t.querySelectorAll('tbody tr')].find(x=>x.querySelector('th').innerText.startsWith(l));return [...tr.querySelectorAll('td')].slice(0,5).map(td=>{const i=td.querySelector('input');return (i?i.value:td.innerText).trim()}).join(' | ')},[lab,k]);
 console.log(w,'tablas:',await p.locator('.cam-tabla').count(),'· títulos:',(await p.locator('.cam-sem-tit').allInnerTexts()).join(' / '));
 console.log(w,'desposte del día (sem 26/10):',await fila('DESPOSTE DEL DÍA',0),'· remanente:',await fila('REMANENTE',0));
 const c=p.locator('.cam-in[data-cf="despSig"][data-dia="2026-10-28"]');await c.fill('800');await c.press('Enter');await p.clock.runFor(800);await p.waitForTimeout(300);
 console.log(w,'cambio miércoles a 800 → guardado en el martes:',await p.evaluate(()=>window.__mock.data.privado['camara-2026-10-26'].dias[1].despSig),'· fila:',await fila('DESPOSTE DEL DÍA',0));
 console.log(w,'semana siguiente desposte:',await fila('DESPOSTE DEL DÍA',1));
 if(w===1366)await p.screenshot({path:SP+'/cam122.png',fullPage:true});
 console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
