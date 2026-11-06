// Túnel: subir una foto o pegar un texto, se lee (IA falsa) y se abre para revisar con los códigos puestos; se suma a lo que ya había.
const {chromium}=require('playwright');const SP=process.argv[2]||'.';
const data={faena:{},produccion:{},config:{general:{}},privado:{'tunel-2026-11-12':{fecha:'2026-11-12',clientes:[{nombre:'CARREFOUR',items:[{corte:'CARRE',cod:'30276',cant:126,uni:'cajas',nota:''}]}]}},pedidos:{}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-11-06T17:40:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],camara:['yo@x.com'],sinRecorte:true,
 iaTunel:(n,t)=>n==='texto'?({clientes:[{nombre:'SWIFT',items:[{corte:'recorte 70/30',cod:'',cant:500,uni:'kg',nota:''}]}],dudas:[]}):({clientes:[{nombre:'Coto',items:[{corte:'carre',cod:'',cant:8100,uni:'kg',nota:''},{corte:'grasa',cod:'',cant:2000,uni:'kg',nota:'buena'}]},{nombre:'CARREFOUR',items:[{corte:'PECHO',cod:'',cant:40,uni:'cajas',nota:''}]}],dudas:['no se lee bien el 2000']})}},data);
await p.goto('http://127.0.0.1:8765/index.html#tunel');await p.clock.runFor(1500);await p.waitForTimeout(200);
await p.evaluate(()=>{const i=document.getElementById('tu-fecha-in');i.value='2026-11-12';i.dispatchEvent(new Event('change',{bubbles:true}));});await p.waitForTimeout(300);
console.log('botón foto:',await p.locator('#tu-foto').count());
await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=50;c.height=50;const bl=await new Promise(r=>c.toBlob(r,'image/png'));const dt=new DataTransfer();dt.items.add(new File([bl],'t.png',{type:'image/png'}));const i=document.getElementById('tu-foto');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));});
await p.clock.runFor(1500);await p.waitForTimeout(400);
console.log('editor:',await p.evaluate(()=>[...document.querySelectorAll('.tu-cli')].map(c=>c.querySelector('[data-tuc]').value+': '+[...c.querySelectorAll('.tu-r')].map(r=>r.querySelector('.tu-corte').value+' '+r.querySelector('.tu-cod').value+' '+r.querySelector('.tu-cant').value+' '+r.querySelector('.tu-uni').value).join(' | ')).join(' // ')));
await p.click('[data-act="tu-pegar"]');await p.fill('#tu-pegar-txt','swift recorte 70/30 500 kg');await p.click('[data-act="tu-pegar-leer"]');await p.clock.runFor(1000);await p.waitForTimeout(300);
console.log('con texto:',await p.evaluate(()=>[...document.querySelectorAll('.tu-cli [data-tuc]')].map(x=>x.value).join(', ')),await p.evaluate(()=>[...document.querySelectorAll('.tu-cod')].map(x=>x.value).join(',')));
await p.click('[data-act="tu-guardar"]');await p.clock.runFor(800);await p.waitForTimeout(300);
console.log('guardado:',JSON.stringify(await p.evaluate(()=>window.__mock.data.privado['tunel-2026-11-12'].clientes)));
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
