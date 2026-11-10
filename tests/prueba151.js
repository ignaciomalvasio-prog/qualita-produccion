// Unidad PALLETS en el selector de unidad (Pedidos/Logística).
const {chromium}=require('playwright');const F='2026-11-11';
const data={faena:{},config:{general:{feriados:[]}},privado:{},produccion:{},
 pedidos:{a:{cliente:'ARGENCARNES',entrega:F,medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',frio:'CONGELADO',cortes:[{k:'k0',corte:'PALETA',texto:'24 PALLET INDUSTRIAL'},{k:'k1',corte:'PECHO',texto:'3 PALLETS'},{k:'k2',corte:'PALETA',texto:'5 PALETA'}]}}};
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1366,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-10T12:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForTimeout(300);
 await p.evaluate(()=>{const b=document.querySelector('[data-act="ped-abrir"],.ped-tit');b&&b.click();});await p.waitForTimeout(300);
 console.log(await p.evaluate(()=>[...document.querySelectorAll('select')].filter(s=>[...s.options].some(o=>/PALLETS|BINES/.test(o.text))).map(s=>s.options[s.selectedIndex].text+' ['+[...s.options].map(o=>o.text).join(',')+']').join(' | ')));
 console.log('errores:',errs);await b.close();})();
