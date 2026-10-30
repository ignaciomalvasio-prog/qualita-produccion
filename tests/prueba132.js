// Túnel 🔒 (pestaña privada como Cámara): se arma por día, por cliente y corte; copiar el día anterior, total de kg, PDF.
// Producción ya no tiene la solapa "Mercadería para túnel". Quien no es de Cámara no ve la pestaña.
const {chromium}=require('playwright');const SP=process.argv[2];
const data={faena:{},produccion:{},config:{general:{}},privado:{'tunel-2026-10-30':{fecha:'2026-10-30',clientes:[{nombre:'COTO',items:[{corte:'BONDIOLA',cod:'',cant:3600,uni:'kg',nota:''},{corte:'MATAMBRE',cod:'',cant:3600,uni:'kg',nota:''}]}]}},pedidos:{}};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-30T17:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],camara:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#produccion');await p.clock.runFor(1500);await p.waitForTimeout(200);
console.log(w,'producción sin túnel:',await p.locator('[data-act="pv"][data-v="tunel"]').count()===0);
await p.click('#tab-tunel');await p.waitForTimeout(200);
console.log(w,'día:',await p.locator('#view-tunel .nav .tit').innerText(),'·',(await p.locator('#view-tunel .panel').last().innerText()).replace(/\s+/g,' '));
await p.click('[data-act="tu-copiar"]');await p.waitForTimeout(100);
await p.fill('[data-tu="0.1.cant"]','5.200');
await p.click('[data-act="tu-ren"][data-i="0"]');await p.fill('[data-tu="0.2.corte"]','carre');await p.fill('[data-tu="0.2.cant"]','8100');
await p.click('[data-act="tu-cli"]');await p.fill('[data-tuc="1"]','swift');await p.fill('[data-tu="1.0.corte"]','grasa');await p.fill('[data-tu="1.0.cod"]','479');await p.fill('[data-tu="1.0.cant"]','7500');await p.fill('[data-tu="1.0.nota"]','+ producción jueves');
await p.click('[data-act="tu-ren"][data-i="1"]');await p.fill('[data-tu="1.1.corte"]','pecho');await p.fill('[data-tu="1.1.cant"]','100');await p.selectOption('[data-tu="1.1.uni"]','cajas');
if(w===400)await p.screenshot({path:SP+'/tunel-ed.png',fullPage:true});
console.log(w,'desborde editando',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
await p.click('[data-act="tu-guardar"]');await p.clock.runFor(800);await p.waitForTimeout(300);
console.log(w,'guardado:',JSON.stringify(await p.evaluate(()=>window.__mock.data.privado['tunel-2026-11-02'])));
console.log(w,'hoja:',(await p.locator('.tu-hoja').innerText()).replace(/\s+/g,' '));
await p.click('.tu-hoja [data-act="tu-pdf"]');await p.waitForFunction(()=>window.__mock.ultimoPDF,null,{timeout:15000});console.log(w,'PDF:',await p.evaluate(()=>window.__mock.ultimoPDF.nombre));
await p.screenshot({path:SP+'/tunel-'+w+'.png',fullPage:true});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
// sin permiso de Cámara: no hay pestaña
const p=await b.newPage();await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'otro@x.com'},editores:['otro@x.com'],camara:[]}},data);
await p.goto('http://127.0.0.1:8765/index.html#tunel');await p.waitForTimeout(1500);
console.log('otro: pestaña oculta',await p.locator('#tab-tunel').isHidden(),'· está en',await p.evaluate(()=>document.querySelector('.view:not([hidden])').id));
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
