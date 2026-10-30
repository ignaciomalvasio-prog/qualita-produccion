// Producción: solapa "Mercadería para túnel" (texto por día, títulos con ":", total de kg, copiar la anterior, PDF).
const {chromium}=require('playwright');const SP=process.argv[2];
const data={faena:{},produccion:{'tu-2026-10-29':{fecha:'2026-10-29',linea:'tunel',texto:'CARREFOUR:\n300KG BONDIOLA\n300KG MATAMBRE\nVARIOS:\n200KG PECHO',cortes:[]}},config:{general:{}},privado:{},pedidos:{}};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-30T10:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#produccion');await p.clock.runFor(1500);await p.waitForTimeout(200);
await p.click('[data-act="pv"][data-v="tunel"]');await p.waitForTimeout(200);
console.log(w,'día:',await p.locator('#view-produccion .nav .tit').innerText(),'· vacío:',(await p.locator('#view-produccion .panel').last().innerText()).replace(/\s+/g,' '));
await p.click('[data-act="tu-copiar"]');await p.clock.runFor(800);await p.waitForTimeout(200);
await p.fill('#tu-txt','CARREFOUR:\n300kg bondiola\n300kg matambre\n150kg solomillo\nVARIOS:\n200kg pecho');await p.click('[data-act="tu-guardar"]');await p.clock.runFor(800);await p.waitForTimeout(300);
console.log(w,'guardado:',JSON.stringify(await p.evaluate(()=>window.__mock.data.produccion['tu-2026-10-30'].texto)));
console.log(w,'hoja:',(await p.locator('.tu-hoja').innerText()).replace(/\s+/g,' '));
await p.click('.tu-hoja [data-act="wa-pdf"]');await p.waitForFunction(()=>window.__mock.ultimoPDF,null,{timeout:15000});console.log(w,'PDF:',await p.evaluate(()=>window.__mock.ultimoPDF.nombre));
if(w===1366)await p.screenshot({path:SP+'/tunel.png'});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
