// Embutidos impresos antes de Agregado: "Esta hoja ya la pasé" y después "Volver a Agregado" para lo nuevo.
const {chromium}=require('playwright');const W='2026-11-11';
const data={faena:{},privado:{},config:{general:{feriados:[]}},pedidos:{},produccion:{
 [W]:{fecha:W,medias:750,mercado:'',estado:'borrador',impreso:{ts:1,l:['PECHO|100 KG "ZANOTTI"']},cortes:[{corte:'PECHO',lineas:[{t:'100 KG "ZANOTTI"'}]}]},
 ['c3-'+W]:{fecha:W,linea:'ciclo3',estado:'borrador',cortes:[{corte:'CHORIZO',lineas:[{t:'200KG CHORIZO "COTO"'},{t:'50KG CHORIZO "ESLAVA"'}]}]}}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-10T16:30:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#produccion');await p.clock.runFor(2000);await p.waitForTimeout(300);
 await p.fill('#p-fecha',W);await p.dispatchEvent('#p-fecha','change');await p.waitForTimeout(300);
 await p.click('[data-act="pv"][data-v="frescos"]');await p.waitForTimeout(200);
 const tabs=()=>p.evaluate(()=>[...document.querySelectorAll('.pv-tabs .btn')].map(x=>x.textContent.trim()).join(' | '));
 console.log('botón base:',await p.evaluate(()=>[...document.querySelectorAll('[data-act="agr-base"]')].map(x=>x.dataset.doc).join(',')));
 await p.click('[data-act="agr-base"]');await p.waitForTimeout(400);
 await p.click('[data-act="agr-volver"][data-k*="ESLAVA"]');await p.waitForTimeout(400);
 console.log('tabs:',await tabs());
 await p.click('.pv-tabs [data-v="agr"]');await p.waitForTimeout(300);
 console.log('agregado:',await p.evaluate(()=>document.querySelector('.hoja-agr .hoja-cortes').innerText.replace(/\s+/g,' ')));
 console.log('errores:',errs);await b.close();})();
