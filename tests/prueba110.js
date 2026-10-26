// Producción: "PECHITO CON MANTA" (cargado como PECHO MANTA DOBLE) se muestra en PECHO; solo lo que dice "DOBLE" queda aparte.
const {chromium}=require('playwright');const SP=process.argv[2];const F='2026-10-28';
const C=(c,ls)=>({corte:c,lineas:ls.map(t=>({t}))});
const data={faena:{},privado:{},config:{general:{}},pedidos:{},produccion:{[F]:{medias:750,mercado:'',estado:'borrador',cortes:[C('JAMON',['40 KG JAMON "A"']),C('PECHO',['1 CAJAS PECHO "CHAVARRIA"']),C('PECHO MANTA DOBLE',['80 KG PECHITO CON MANTA (COD 211) "DINO ALTA GRACIA"','2 UND PECHO MANTA DOBLE "X"'])]}}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1100,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-26T17:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#produccion');await p.clock.runFor(1500);
 await p.fill('#p-fecha',F);await p.locator('#p-fecha').dispatchEvent('change');await p.waitForTimeout(300);
 const g=p.locator('.hoja').first().locator('.hoja-corte');for(let i=0;i<await g.count();i++)console.log((await g.nth(i).innerText()).replace(/\n+/g,' | '));
 console.log('guardado sin tocar:',await p.evaluate(()=>window.__mock.data.produccion['2026-10-28'].cortes.map(c=>c.corte+':'+c.lineas.length).join(', ')));
 console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
