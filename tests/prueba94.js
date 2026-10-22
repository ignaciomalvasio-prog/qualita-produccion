// Producción (planilla de frescos): cada renglón se muestra en la unidad en que se pidió (unidades, cajas, kg)
// y el total del corte es un solo número en kilos, con el detalle de lo pedido abajo.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-22';
const data={faena:{},config:{general:{}},privado:{clientes:{lista:[]}},pedidos:{},
 produccion:{[F]:{medias:120,mercado:'',estado:'borrador',cortes:[
  {corte:'JAMON',lineas:[{t:'5 CAJAS NALGA "GRION"'},{t:'10 UND JAMON 5M "ROVER"'},{t:'130KG JAMON CON HUESO "DINO"'}]},
  {corte:'PECHO',lineas:[{t:'100KG COSTILLA "GRION"'},{t:'4 CANASTOS PECHITO CON MANTA "ROVER"'}]},
  {corte:'PALETA',lineas:[{t:'50KG PALETA "X"'}]},
  {corte:'CUERO',lineas:[{t:'3 UND CUERO "Y"'},{t:'2 BINES CUERO "Z"'}]}]}}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-22T09:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#produccion');await p.clock.runFor(1500);await p.waitForSelector('#view-produccion .nav');
 await p.click('[data-act="pv"][data-v="frescos"]');await p.waitForSelector('.hoja-corte');
 console.log('=== ',w);
 for(const c of await p.locator('.hoja-corte').all())console.log(' ',(await c.locator('h3').innerText()),'| total:',(await c.locator('.hoja-tot').innerText()).replace(/\s+/g,' '),'| renglones:',(await c.locator('li').allInnerTexts()).map(x=>x.replace(/\s+/g,' ')).join(' / '));
 console.log('texto:\n'+await p.inputValue('#txt-orden'));
 await p.screenshot({path:SP+'/prod-unidades'+w+'.png',fullPage:true});
 console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');}
await b.close();})();
