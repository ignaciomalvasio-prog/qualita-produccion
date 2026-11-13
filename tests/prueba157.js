// Túnel: "Imprimir" va en la fila de botones de la hoja (no arriba al lado de la fecha) y saca el PDF.
const {chromium}=require('playwright');const F='2026-11-16';
const H=require('crypto').createHash('sha256').update('renzolovaiza@gmail.com').digest('hex');
const data={faena:{},config:{general:{feriados:[]}},pedidos:{},produccion:{},privado:{['tunel-'+F]:{fecha:F,clientes:[{nombre:'SWIFT',items:[{corte:'GRASA',cod:'479',cant:8000,uni:'kg',nota:''},{corte:'CUERO',cod:'412',cant:4000,uni:'kg',nota:''}]}]}}};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-13T16:30:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'renzolovaiza@gmail.com'},editores:['renzolovaiza@gmail.com'],camara:['renzolovaiza@gmail.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#tunel');await p.clock.runFor(1500);await p.waitForTimeout(300);
 await p.fill('#tu-fecha-in',F);await p.dispatchEvent('#tu-fecha-in','change');await p.waitForTimeout(300);
 console.log(w,'arriba:',await p.locator('#view-tunel .nav [data-act="imprimir"]').count(),'| botones:',await p.evaluate(()=>[...document.querySelectorAll('#view-tunel .hoja-acc .btn')].map(x=>x.textContent.trim()).join(' · ')));
 const bt=p.locator('#view-tunel .hoja-acc [data-act="imprimir"]');if(await bt.count()){await bt.click();await p.waitForFunction(()=>window.__mock.ultimoPDF,null,{timeout:15000});console.log(w,'pdf ok');}
 console.log(w,'desborde:',await p.evaluate(()=>document.documentElement.scrollWidth));await p.close();}
 console.log('errores:',errs);await b.close();})();
