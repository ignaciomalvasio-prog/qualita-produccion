// Pedido solo congelado: no muestra la cruz roja de "falta producir", sino ❄.
const {chromium}=require('playwright');const W='2026-11-12';
const ped={a:{cliente:'VISINTINI',entrega:W,medias:0,peso:'',nota:'',frio:'CONGELADO',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'1',corte:'HIGADO',texto:'1 CAJAS'},{k:'2',corte:'OREJAS',texto:'6 CAJAS'}]},
 b:{cliente:'REPVIL',entrega:W,medias:0,peso:'',nota:'',frio:'FRESCO',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'1',corte:'PECHO',texto:'100KG'}]},
 c:{cliente:'MIXTO',entrega:W,medias:0,peso:'',nota:'',frio:'CONGELADO',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'1',corte:'PECHO',texto:'100KG',frio:'FRESCO'},{k:'2',corte:'HIGADO',texto:'1 CAJA'}]}};
const data={faena:{},privado:{},config:{general:{feriados:[]}},pedidos:ped,produccion:{}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-10T16:30:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(2000);await p.waitForTimeout(300);
 const go=await p.$('[data-act="dia-ir"][data-f="'+W+'"], [data-f="'+W+'"]');if(go){await go.click();await p.waitForTimeout(300);}
 console.log(await p.evaluate(()=>[...document.querySelectorAll('.col-prod')].map(x=>x.closest('.pedido,.ped,[data-id]')?.innerText.split('\n')[0]+' → '+x.textContent).join(' | ')));
 console.log('errores:',errs);await b.close();})();
