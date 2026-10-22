// Cámara: el link personal (#camara?d=...) trae las semanas armadas; al abrirlo con la cuenta habilitada se cargan con un toque.
// Datos inventados (el repositorio es público). Con CAM_LINK se prueba un link real sin guardarlo acá.
const {chromium}=require('playwright');const SP=process.argv[2];
const SEM=[['2026-10-12',[[0,0,0,700,300],[600,0,300,720,null],[600,0,200,720,null],[600,0,250,720,null],[700,160,300,740,null]],'feriado el lunes'],
 ['2026-10-19',[[600,0,280,740,null],[600,0,300,740,null],[600,0,180,740,null],[600,0,240,720,null],[500,160,300,750,null]]]];
const LINK=process.env.CAM_LINK||Buffer.from(JSON.stringify(SEM)).toString('base64url');
const base={faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:0,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[],clientes:[]}))}},produccion:{},config:{general:{}},privado:{},pedidos:{}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-21T10:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],camara:['yo@x.com']}},base);
 await p.goto('http://127.0.0.1:8765/index.html#camara?d='+LINK);await p.clock.runFor(1500);await p.waitForSelector('.cam-pegar');
 console.log('=== ',w,'hash limpio:',await p.evaluate(()=>location.hash),'· aviso:',(await p.locator('.cam-pegar').innerText()).replace(/\s+/g,' '));
 await p.click('[data-act="cam-guardar-pegado"]');await p.clock.runFor(800);await p.waitForTimeout(300);
 const fila=async lab=>p.evaluate(l=>{const tr=[...document.querySelectorAll('.cam-tabla tbody tr')].find(t=>t.querySelector('th').innerText.startsWith(l));return [...tr.querySelectorAll('td')].slice(0,5).map(td=>{const i=td.querySelector('input');return (i?i.value:td.innerText).split('\n')[0].trim();}).join(' | ');},lab);
 console.log('semana:',await p.locator('.cam-tit').innerText(),'· remanente:',await fila('REMANENTE'),'· cámara:',await fila('MEDIAS EN CÁMARA'));
 console.log('guardado en privado:',await p.evaluate(()=>Object.keys(window.__mock.data.privado).filter(k=>k.startsWith('camara-')).join(', ')));
 if(w===1100)await p.screenshot({path:SP+'/camara-link.png',fullPage:true});
 // Un link roto no rompe nada.
 const q=await b.newPage({viewport:{width:w,height:900}});const e2=[];q.on('pageerror',e=>e2.push(e.message));await q.clock.install({time:new Date('2026-10-21T10:00:00-03:00')});
 await q.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],camara:['yo@x.com']}},base);
 await q.goto('http://127.0.0.1:8765/index.html#camara?d=xxxx');await q.clock.runFor(1500);await q.waitForTimeout(200);
 console.log('link roto → pestaña:',await q.evaluate(()=>location.hash),'· errores:',e2.join('|')||'ninguno');
 console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');}
await b.close();})();
