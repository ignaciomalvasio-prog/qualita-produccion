const {chromium}=require('playwright');const SP=process.argv[2];
const prod={'2026-10-13':{fecha:'2026-10-13',estado:'confirmada',medias:400,cortes:[{corte:'JAMON',lineas:[{t:'15 CAJAS PIERNA S/C “URCA”',p:'p1'}]},{corte:'PECHO',lineas:[{t:'10 CAJAS “ALMACOR”',p:'p2',f:'CONGELADO'}]}]}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-12T19:40:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:{faena:{},produccion:d,config:{general:{}},pedidos:{},privado:{}},user:{email:'yo@x.com'},editores:['yo@x.com']}},prod);
await p.goto('http://127.0.0.1:8765/produccion.html');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log('=== ancho',w,'título:',await p.title(),'· marca:',await p.locator('.marca-nom').innerText(),'· pestañas visibles:',await p.locator('#tabs').isVisible(),'· editar:',await p.locator('[data-act="p-editar"]').count(),'· ingresar:',await p.locator('[data-act="ingresar"]').count());
console.log('contenido:',(await p.locator('#view-produccion').innerText()).replace(/\s+/g,' ').slice(0,250));
if(w===400)await p.screenshot({path:SP+'/prodlink400.png',fullPage:true});
console.log('errores:',errs.join('|')||'ninguno');await p.close();}
const q=await b.newPage({viewport:{width:1100,height:900}});
await q.clock.install({time:new Date('2026-10-12T19:40:00-03:00')});
await q.addInitScript(d=>{window.__mock={data:{faena:{},produccion:d,config:{general:{}},pedidos:{},privado:{}},user:{email:'yo@x.com'},editores:['yo@x.com']}},prod);
await q.context().grantPermissions(['clipboard-read','clipboard-write']);
await q.goto('http://127.0.0.1:8765/index.html#produccion');await q.clock.runFor(1500);await q.waitForTimeout(300);
await q.click('[data-act="link-prod"]');await q.waitForTimeout(200);console.log('editor copia link:',await q.locator('#g-prod').innerText(),'·',await q.locator('#toast').innerText());
await b.close();})();
