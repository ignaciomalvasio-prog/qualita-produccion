// Rendering: estimado desde faena + desposte, corrección a mano, factores, días anteriores y link de solo lectura.
const {chromium}=require('playwright');const SP=process.argv[2];
const dias=[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[{origen:'X',propios:380,usuarios:20}],clientes:[]}));
const data={faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:0,dias},'2026-10-12':{desde:'2026-10-12',stockInicial:0,dias:dias.map((d,i)=>({...d,fecha:'2026-10-1'+(2+i)}))}},
 produccion:{'2026-10-20':{fecha:'2026-10-20',estado:'borrador',medias:750,cortes:[]},'2026-10-19':{fecha:'2026-10-19',estado:'borrador',medias:700,cortes:[]}},
 config:{general:{}},pedidos:{},privado:{clientes:{lista:[]}}};
(async()=>{const b=await chromium.launch();
for(const w of [1280,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-20T09:00:00-03:00')});
await p.addInitScript(d=>{window.print=()=>{};window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html');await p.clock.runFor(1500);await p.waitForSelector('.dash');
console.log(w,'tarjeta:',(await p.locator('.tile.t-rendering').innerText()).replace(/\s+/g,' '));
await p.click('#tab-rendering');await p.waitForSelector('.rend-hero');
console.log(w,'hero:',(await p.locator('.rend-hero').innerText()).replace(/\s+/g,' '));
console.log(w,'tablas:',(await p.locator('.rend-grid').innerText()).replace(/\s+/g,' ').slice(0,500));
await p.fill('[data-rend="hueso"]','4100');await p.locator('[data-rend="hueso"]').dispatchEvent('change');await p.clock.runFor(500);await p.locator('body').click({position:{x:5,y:5}});await p.waitForTimeout(150);
console.log(w,'guardado:',await p.evaluate(()=>JSON.stringify(window.__mock.data.config['rend-2026-10-20'].v)),'· hero',(await p.locator('.rend-hero .kpis').innerText()).replace(/\s+/g,' '));
await p.click('.rend-cfg summary');await p.fill('[data-rcfg="ins"][data-id="sangre"]','3.5');await p.locator('[data-rcfg="ins"][data-id="sangre"]').dispatchEvent('change');await p.clock.runFor(400);await p.waitForTimeout(150);
console.log(w,'factores:',await p.evaluate(()=>JSON.stringify(window.__mock.data.config.rendering.ins)),'· sangre ahora:',(await p.locator('.rend-tabla tr',{hasText:'Sangre'}).first().innerText()).replace(/\s+/g,' '));
await p.click('[data-act="fr-ir"][data-f="2026-10-19"]');await p.waitForTimeout(100);console.log(w,'día anterior:',(await p.locator('.rend-hero .kpis').innerText()).replace(/\s+/g,' '));
console.log(w,'historial:',(await p.locator('.rend-hist').innerText()).replace(/\s+/g,' ').slice(0,260));
await p.click('[data-act="fr-hoy"]');await p.waitForTimeout(100);
await p.screenshot({path:SP+'/rend'+w+'.png',fullPage:true});
console.log(w,'desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');
const d2=await p.evaluate(()=>window.__mock.data);
const v=await b.newPage({viewport:{width:w,height:900}});const ev=[];v.on('pageerror',e=>ev.push(e.message));await v.clock.install({time:new Date('2026-10-20T09:00:00-03:00')});await v.addInitScript(d=>{window.__mock={data:d,user:null,editores:[]}},d2);
await v.goto('http://127.0.0.1:8765/rendering.html');await v.clock.runFor(1500);await v.waitForSelector('.rend-hero');
console.log(w,'link:',await v.title(),'· editables',await v.locator('.rend-in,.rend-cfg').count(),'·',(await v.locator('.rend-grid').innerText()).replace(/\s+/g,' ').slice(0,200),'· desborde',await v.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores',ev.join('|')||'ninguno');
await v.screenshot({path:SP+'/rend-link'+w+'.png',fullPage:true});}
await b.close();})();
