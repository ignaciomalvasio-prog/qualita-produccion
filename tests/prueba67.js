// Peso por unidad: un renglón en unidades se pasa a kilos (producción, totales y kilos del camión) con la tabla de Renzo, editable en Stock de camiones.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-19';
const K=(k,corte,texto)=>({k,corte,texto});
const data={faena:{},privado:{clientes:{lista:[]}},config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'LAGUI',hora:'03:00',orden:['a']}],pedidos:[]}},
 produccion:{[F]:{medias:0,mercado:'',estado:'borrador',cortes:[{corte:'BONDIOLA',lineas:[{t:'4 UNIDADES BONDIOLA (COD 101) “ROVER”',p:'a',ck:'k0'},{t:'2 CAJAS BONDIOLA “URCA”',p:'x'}]},{corte:'LOMO',lineas:[{t:'10 UND CINTA DE LOMO “ROVER”',p:'a',ck:'k3'}]}]}},
 pedidos:{a:{cliente:'ROVER',entrega:F,medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:'c1',cuenta:'',
  cortes:[K('k0','BONDIOLA','4 UNIDADES BONDIOLA (COD 101)'),K('k1','JAMON','3 UND PIERNAS'),K('k2','PECHO','2 UNIDADES PECHITOS'),K('k3','LOMO','10 UND CINTA DE LOMO'),K('k4','MATAMBRE','5 UNIDADES'),K('k5','CHORIZO','3 UND CHORIZO')]}}};
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1100,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-16T12:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForSelector('#view-logistica .nav');
for(let k=0;k<3&&!(await p.locator('.log-ped').count());k++){await p.click('[data-act="fl"][data-d="1"]');await p.waitForTimeout(100);}
// esperado: bondiola 4*2.5=10, piernas(jamon por corte) 3*12=36, pechitos (pecho por corte) 2*5=10, cinta de lomo 10*3.5=35, matambre 5*1.5=7.5, chorizo sin peso
console.log('kg del pedido:',await p.locator('.log-ped .log-cab .small').innerText(),'(esperado ≈ 99 kg + renglones sin peso)');
await p.click('[data-act="fl-editar"]');await p.waitForTimeout(100);
console.log('tabla:',(await p.inputValue('#cfg-kgund')).replace(/\n/g,' | '));
await p.fill('#cfg-kgund','UND PECHO 5KG\nund carre 5kg\nBONDIOLA = 3\nMATAMBRE 1,5\nJAMON 12\nPALETA 7,5\nMEDIA 50\nCINTA DE LOMO 3,5');await p.locator('#cfg-kgund').dispatchEvent('input');await p.clock.runFor(2500);await p.waitForTimeout(200);
console.log('guardado:',await p.evaluate(()=>JSON.stringify(window.__mock.data.config.general.kgUnidad||window.__mock.data.config.general)));
await p.click('[data-act="fl-editar"]');await p.waitForTimeout(100);
const q=await b.newPage({viewport:{width:1100,height:900}});q.on('pageerror',e=>errs.push(e.message));await q.clock.install({time:new Date('2026-10-19T10:00:00-03:00')});await q.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:null,editores:[]}},data);await q.goto('http://127.0.0.1:8765/produccion.html');await q.clock.runFor(1500);await q.waitForSelector('.hoja-corte');const p2=q;
const hoy=await p2.$$eval('.hoja-corte',x=>x.map(e=>e.innerText.replace(/\s+/g,' ')).join(' | '));console.log('producción:',hoy);
console.log('errores',errs.join('|')||'ninguno');await b.close();})();
