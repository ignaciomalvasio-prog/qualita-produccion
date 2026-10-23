// Producción: cada planilla (cortes y embutidos) tiene su "Imprimir", que imprime solo esa.
const {chromium}=require('playwright');const SP=process.argv[2];const fs=require('fs');const {execSync}=require('child_process');
const F='2026-10-27';
const data={faena:{},config:{general:{}},privado:{clientes:{lista:[]}},pedidos:{},
 produccion:{[F]:{medias:750,mercado:'',estado:'borrador',cortes:[{corte:'MATAMBRE',lineas:[{t:'1 CAJA "FINUCCI"'}]},{corte:'HIGADO',lineas:[{t:'400KG "BOCANTINO"'}]}]},
  ['c3-'+F]:{fecha:F,linea:'ciclo3',estado:'borrador',cortes:[{corte:'CHORIZO',lineas:[{t:'200KG CHORIZO PARRILLERO "COTO"'}]}]}}};
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1100,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-23T18:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#produccion');await p.clock.runFor(1500);
 for(let i=0;i<4;i++){ if((await p.locator('#view-produccion .nav .tit').innerText()).includes('27'))break; await p.click('#view-produccion [data-act="fecha"][data-d="1"]');await p.waitForTimeout(150);}
 await p.click('[data-act="pv"][data-v="frescos"]');await p.waitForTimeout(200);
 console.log('botones:',(await p.locator('[data-act="hoja-imprimir"]').allInnerTexts()).join(' | '));
 for(const [i,n] of [[0,'cortes'],[1,'embutidos']]){
  if(i>=await p.locator('[data-act="hoja-imprimir"]').count())continue;
  await p.evaluate(()=>{delete window.__mock.ultimoPDF;});await p.locator('[data-act="hoja-imprimir"]').nth(i).click();
  await p.waitForFunction(()=>window.__mock.ultimoPDF,null,{timeout:15000});
  const b64=await p.evaluate(async()=>{const a=new Uint8Array(await window.__mock.ultimoPDF.blob.arrayBuffer());let s='';a.forEach(x=>s+=String.fromCharCode(x));return btoa(s);});
  fs.writeFileSync(SP+'/imp-'+n+'.pdf',Buffer.from(b64,'base64'));const t=execSync('pdftotext '+SP+'/imp-'+n+'.pdf -').toString();
  console.log(n,'→ tiene MATAMBRE:',t.includes('MATAMBRE'),'· tiene CHORIZO:',t.includes('CHORIZO'));}
 console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
