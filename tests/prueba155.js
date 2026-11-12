// PDF de la orden: dato largo (medias + mercado) baja abajo del título en varios renglones sin cortarse.
const {chromium}=require('playwright');const SP=process.argv[2];const fs=require('fs');const {execSync}=require('child_process');
const F='2026-11-13';
const data={faena:{},config:{general:{feriados:[]}},privado:{},pedidos:{},
 produccion:{['op-'+F]:{fecha:F,medias:750,mercado:'CONSUMO + CERDAS (PRODUCIR RECORTE 70/30 BONELES A CONGELAR)',estado:'borrador',cortes:[{corte:'JAMON',lineas:[{t:'50 UND CON HUESO "GRION"'}]},{corte:'PECHO',lineas:[{t:'CONGELAR EN CAJAS "CARREFOUR" (COD 30216)'}]}]}}};
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1100,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-12T18:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#produccion');await p.clock.runFor(1500);
 await p.fill('#p-fecha',F);await p.dispatchEvent('#p-fecha','change');await p.waitForTimeout(300);
 await p.click('[data-act="pv"][data-v="op"]');await p.waitForTimeout(200);
 await p.click('.nav [data-act="imprimir"]');
 await p.waitForFunction(()=>window.__mock.ultimoPDF,null,{timeout:15000});
 const b64=await p.evaluate(async()=>{const a=new Uint8Array(await window.__mock.ultimoPDF.blob.arrayBuffer());let s='';a.forEach(x=>s+=String.fromCharCode(x));return btoa(s);});
 fs.writeFileSync(SP+'/p155.pdf',Buffer.from(b64,'base64'));execSync('pdftoppm -r 60 -png -f 1 -l 1 '+SP+'/p155.pdf '+SP+'/p155');
 console.log('errores:',errs);await b.close();})();
