// Producción: "Compartir PDF" arma un PDF con solo la hoja (orden de producción o planilla de frescos) y lo descarga en la compu.
const {chromium}=require('playwright');const SP=process.argv[2];const fs=require('fs');
const F='2026-10-22';
const OP='JAMON: 100 UND CON HUESO SIN CUERO CON TAPA FRESCO EN BINES “GRION” IMPORTANTE DEJAR TODA LA TAPA DE JAMON Y REDONDEARLO UN POCO – QUITAR EL HUESO DE CADERA COMO LA MUESTRA QUE PASAMOS – PRIMERA HORA (COD 418)\nRESTO: RECORTE DE JAMON CON GRASA 3º (COD 374) FRESCO EN BINES “ARGENCARNES” // SOLO CAMBIA EL CORRELATIVO\nPALETA: 1000KG RECORTE DE PALETA INDUSTRIAL 3º FRESCA EN BINES (COD 182) “ARGENCARNES”\nRESTO: PALETA SIN HUESO SIN CUERO SIN GRASA SIN GARRON CAJAS A CONGELAR (COD 377)\nPECHO: CONGELAR EN CAJAS “CARREFOUR” (COD 30216)\nCARRE: CAJAS A CONGELAR “CARREFOUR” (COD 30276)\nSOLOMILLO: CAJAS A CONGELAR INTERFOLIADOS EN ONDAS “CARREFOUR” (COD 30287)\nMATAMBRE: CAJAS A CONGELAR “SUR” (COD 240)\nBONDIOLA: CAJAS A CONGELAR “CARREFOUR” (COD 30105)\nRECORTE: 1000KG 80/20 FRESCOS EN CANASTOS CICLO 3\n20 CAJAS A CONGELAR 80/20 (COD 364)\nRESTO: 60/40 FRESCO EN BINES “ARGENCARNES”\nGRASA: CANASTOS A CONGELAR (COD 479)\nCUERO: FRESCOS “RENDERING”\nTAPA DE PALETA: CAJAS A CONGELAR (COD 156 – CONTRATO 10) “ARGENCARNES”';
const data={faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:0,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[],clientes:[]}))}},config:{general:{}},privado:{clientes:{lista:[]}},pedidos:{},
 produccion:{[F]:{medias:120,mercado:'',estado:'borrador',cortes:[{corte:'BONDIOLA',lineas:[{t:'4 CAJAS BONDIOLA "GRION"'},{t:'2 CAJAS BONDIOLA "ROVER"'}]},{corte:'PECHO',lineas:[{t:'100KG COSTILLA "GRION"'}]}]}}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900},acceptDownloads:true});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-21T17:00:00-03:00')});
await p.addInitScript(([d,op])=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']};window.__op=op;},[data,OP]);
await p.goto('http://127.0.0.1:8765/index.html#produccion');await p.clock.runFor(1500);await p.waitForSelector('#view-produccion .nav');
// Armar la orden desde el texto (como hace la app al editar).
await p.click('[data-act="pv"][data-v="op"]');await p.waitForTimeout(100);
const nueva=p.locator('[data-act="op-nueva"]');if(await nueva.count()){await nueva.first().click();await p.waitForTimeout(150);}
await p.fill('#p-doc',OP);await p.locator('#p-doc').dispatchEvent('input');await p.clock.runFor(1500);
await p.locator('[data-act="p-editar"]').first().click();await p.clock.runFor(800);await p.waitForTimeout(200);
console.log('=== ',w,'botones PDF:',await p.locator('[data-act="hoja-pdf"]').count());
for(const v of ['op','frescos']){
 await p.click('[data-act="pv"][data-v="'+v+'"]');await p.waitForTimeout(150);
 const [dl]=await Promise.all([p.waitForEvent('download',{timeout:20000}),p.locator('[data-act="hoja-pdf"]').first().click()]);
 const ruta=SP+'/hoja-'+v+w+'.pdf';await dl.saveAs(ruta);await p.waitForTimeout(200);
 console.log(v,'→',dl.suggestedFilename(),fs.statSync(ruta).size,'bytes · aviso:',await p.evaluate(()=>{const a=document.querySelector('.aviso,#aviso,.toast');return a?a.innerText:'';}),'· botón vuelve:',await p.locator('[data-act="hoja-pdf"]').first().innerText());}
for(const v of ['op','frescos']){await p.click('[data-act="pv"][data-v="'+v+'"]');await p.waitForTimeout(100);await p.evaluate(()=>{delete window.__mock.ultimoPDF;});
 await p.click('[data-act="imprimir"]');await p.waitForFunction(()=>window.__mock.ultimoPDF,null,{timeout:15000});
 const b64=await p.evaluate(async()=>{const a=new Uint8Array(await window.__mock.ultimoPDF.blob.arrayBuffer());let s='';a.forEach(x=>s+=String.fromCharCode(x));return btoa(s);});fs.writeFileSync(SP+'/imprimir-'+v+w+'.pdf',Buffer.from(b64,'base64'));
 console.log('imprimir',v,'→ PDF',fs.statSync(SP+'/imprimir-'+v+w+'.pdf').size,'bytes');}
console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');}
await b.close();})();
