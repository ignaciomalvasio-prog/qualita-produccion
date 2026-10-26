// Producción: botón WhatsApp en la orden y en la planilla de frescos (arma el PDF y abre WhatsApp).
const {chromium}=require('playwright');const SP=process.argv[2];const F='2026-10-28';
const data={faena:{},privado:{},config:{general:{}},pedidos:{},produccion:{[F]:{medias:750,mercado:0,estado:'borrador',cortes:[{corte:'JAMON',lineas:[{t:'40 KG JAMON 4 MUSC "DINO RUTA 20"'}]}]}}};
(async()=>{const b=await chromium.launch();const errs=[];
 for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-26T17:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#produccion');await p.clock.runFor(1500);
 await p.fill('input[type=date]',F);await p.locator('input[type=date]').first().dispatchEvent('change');await p.waitForTimeout(300);
 const bs=p.locator('[data-act="wa-pdf"]');console.log(w,'botones WhatsApp visibles:',await bs.count());
 for(let i=0;i<await bs.count();i++){const x=bs.nth(i);if(await x.isVisible()){await x.click();await p.waitForTimeout(2500);console.log(w,'pdf:',await p.evaluate(()=>window.__mock.ultimoPDF&&window.__mock.ultimoPDF.nombre),'abrió WhatsApp:',await p.evaluate(()=>!!window.__mock.abrioWA));}}
 if(w===400)await p.screenshot({path:SP+'/wa-prod.png'});
 console.log(w,'desborde:',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
 console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
