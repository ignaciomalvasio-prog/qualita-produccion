// Medias: la Orden de producción y Empaque usan el mismo número; si cambia en una, cambia en la otra.
const {chromium}=require('playwright');const F='2026-11-13';
const data={faena:{},config:{general:{feriados:[]}},privado:{},pedidos:{},
 produccion:{['op-'+F]:{fecha:F,medias:750,mercado:'CONSUMO',estado:'borrador',cortes:[{corte:'JAMON',lineas:[{t:'50 UND "GRION"'}]}]},
  [F]:{fecha:F,medias:600,mercado:'',estado:'borrador',cortes:[{corte:'PECHO',lineas:[{t:'100 KG "ZANOTTI"'}]}]}}};
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1100,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-12T18:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#produccion');await p.clock.runFor(1500);
 await p.fill('#p-fecha',F);await p.dispatchEvent('#p-fecha','change');await p.waitForTimeout(300);
 const dato=()=>p.evaluate(()=>[...document.querySelectorAll('#view-produccion .hoja-dato')].map(x=>x.textContent).join(' | '));
 await p.click('[data-act="pv"][data-v="op"]');await p.waitForTimeout(200);console.log('op muestra:',await dato());
 // editar medias en Empaque
 await p.click('[data-act="pv"][data-v="frescos"]');await p.waitForTimeout(200);
 await p.click('.hoja [data-act="p-editar"]');await p.waitForTimeout(300);
 const v=await p.inputValue('#p-doc');await p.fill('#p-doc',v.replace(/^(.*\n)?\s*600/m,(m)=>m.replace('600','820')));await p.dispatchEvent('#p-doc','input');await p.waitForTimeout(900);
 await p.click('[data-act="p-editar"]');await p.waitForTimeout(800);
 console.log('guardado:',await p.evaluate(()=>[window.__mock.data.produccion['op-2026-11-13'].medias,window.__mock.data.produccion['2026-11-13'].medias].join('/')));
 await p.click('[data-act="pv"][data-v="op"]');await p.waitForTimeout(200);console.log('op muestra:',await dato());
 console.log('errores:',errs);await b.close();})();
