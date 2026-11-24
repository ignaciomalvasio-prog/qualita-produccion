// Embutidos: al lado de cada cliente, "SALE <día de entrega>".
const {chromium}=require('playwright');const D='2026-11-24';
const ped={a:{cliente:'BRACCO JAVIER',entrega:'2026-11-25',diaProd:D,medias:0,peso:'',nota:'',frio:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'1',corte:'MORCILLA',texto:'1 CAJA MORCILLA'}]},
 b:{cliente:'ESLAVA',entrega:D,medias:0,peso:'',nota:'',frio:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'1',corte:'CHORIZO',texto:'3 CAJAS CHORI'}]}};
const data={faena:{},privado:{},config:{general:{feriados:[]}},pedidos:ped,produccion:{['c3-'+D]:{fecha:D,linea:'ciclo3',estado:'borrador',cortes:[{corte:'MORCILLA',lineas:[{t:'1 CAJA MORCILLA “BRACCO JAVIER”',p:'a',ck:'1'}]},{corte:'CHORIZO',lineas:[{t:'5 CAJAS CHORI “RAMI”',e:'2026-11-26'}]}]},[D]:{fecha:D,medias:750,mercado:'',estado:'borrador',cortes:[{corte:'PECHO',lineas:[{t:'5 CAJAS “ZANOTTI”',e:'2026-11-26'},{t:'2 CAJAS “DINO”',e:'2026-11-24'}]}]}}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-23T22:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(2000);await p.waitForTimeout(300);
 await p.fill('#pd-fecha',D);await p.dispatchEvent('#pd-fecha','change');await p.waitForTimeout(300);
 await p.evaluate(()=>document.querySelector('[data-ped="b"] .ped-tit').click());await p.waitForTimeout(200);
 await p.click('[data-ped="b"] [data-act="c-sumar"]');await p.clock.runFor(1500);await p.waitForTimeout(400);
 console.log('guardado e:',await p.evaluate(()=>JSON.stringify(window.__mock.data.produccion['c3-2026-11-24'].cortes.map(c=>c.lineas.map(l=>l.t+' e='+l.e)))));
 await p.evaluate(()=>document.querySelector('[data-tab="produccion"]').click());await p.waitForTimeout(400);
 await p.fill('#p-fecha',D);await p.dispatchEvent('#p-fecha','change');await p.waitForTimeout(300);
 await p.click('[data-act="pv"][data-v="frescos"]').catch(()=>{});await p.waitForTimeout(300);
 console.log('empaque:',await p.evaluate(()=>[...document.querySelectorAll('.hoja:not(.hoja-c3):not(.hoja-faena) li')].map(li=>li.innerText.replace(/\s+/g,' ')).join(' / ')));
 console.log('planilla:',await p.evaluate(()=>[...document.querySelectorAll('.hoja-c3 li')].map(li=>li.innerText.replace(/\s+/g,' ')).join(' / ')));
 await p.click('.hoja-c3 [data-act="hoja-imprimir"]');await p.waitForFunction(()=>window.__mock.ultimoPDF,null,{timeout:15000});
 console.log('errores:',errs);await b.close();})();
