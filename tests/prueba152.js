// PDF por WhatsApp de embutidos a la primera: se arma el PDF y recién después queda marcado como pasado.
const {chromium}=require('playwright');const W='2026-11-12';
const data={faena:{},privado:{},config:{general:{feriados:[]}},pedidos:{},produccion:{
 ['c3-'+W]:{fecha:W,linea:'ciclo3',estado:'borrador',cortes:[{corte:'CHORIZO',lineas:[{t:'200KG CHORIZO "COTO"'},{t:'50KG CHORIZO "ESLAVA"'}]}]}}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-11T16:30:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],compartirArchivos:n=>{window.__comp=(window.__comp||[]).concat(n)}}},data);
 await p.goto('http://127.0.0.1:8765/index.html#produccion');await p.clock.runFor(2000);await p.waitForTimeout(300);
 await p.fill('#p-fecha',W);await p.dispatchEvent('#p-fecha','change');await p.waitForTimeout(300);
 await p.click('[data-act="pv"][data-v="frescos"]');await p.waitForTimeout(200);
 await p.click('.hoja-c3 [data-act="wa-pdf"]');await p.waitForTimeout(1500);
 console.log('compartido:',await p.evaluate(()=>JSON.stringify(window.__comp)),'| avisos:',await p.evaluate(()=>document.querySelector('#aviso,.aviso')?.textContent||''));
 console.log('marcado:',await p.evaluate(()=>!!window.__mock.data.produccion['c3-2026-11-12'].impreso));
 console.log('errores:',errs);await b.close();})();
