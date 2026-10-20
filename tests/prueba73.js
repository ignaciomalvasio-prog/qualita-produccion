// Producción: dos solapas. "Orden de producción" (completa, como el Word: se arma desde la anterior o la base y se edita a mano)
// y "Planilla de frescos" (la de los pedidos, aparte).
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-21',A='2026-10-20';
const L=(t,ext)=>Object.assign({t},ext||{});
const data={faena:{},privado:{clientes:{lista:[]}},pedidos:{},config:{general:{desposteHabitual:750}},
 produccion:{
  [F]:{fecha:F,medias:750,mercado:'',estado:'borrador',cortes:[{corte:'JAMON',lineas:[L('100 UND JAMON CON HUESO “GRION”',{p:'x',ck:'k0'})]}]},
  ['op-'+A]:{fecha:A,linea:'op',medias:750,mercado:'CONSUMO',estado:'lista',cortes:[{corte:'JAMON',lineas:[L('100 UND CON HUESO SIN CUERO CON TAPA FRESCO EN BINES “GRION” PRIMERA HORA (COD 418)'),L('RESTO: RECORTE DE JAMON CON GRASA 3º (COD 359) FRESCO EN BINES “ARGENCARNES”')]},{corte:'PECHO',lineas:[L('CONGELAR EN CAJAS “CARREFOUR” (COD 30216)')]}]}}};
(async()=>{const b=await chromium.launch();
for(const w of [1280,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-20T16:00:00-03:00')});
await p.addInitScript(d=>{window.print=()=>{};window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#produccion');await p.clock.runFor(1500);await p.waitForSelector('.pv-tabs');
console.log(w,'abre en:',await p.locator('.pv-tabs [aria-selected="true"]').innerText());await p.click('[data-act="pv"][data-v="op"]');await p.waitForTimeout(100);
console.log(w,'solapas:',await p.$$eval('.pv-tabs .btn',x=>x.map(e=>e.innerText.replace(/\s+/g,' ')+(e.getAttribute('aria-selected')==='true'?' *':'')).join(' | ')),'· día:',await p.locator('.nav .tit').innerText());
console.log(w,'vacía:',(await p.locator('#view-produccion .panel .acciones').first().innerText()).replace(/\s+/g,' '));
// desde la base
await p.click('[data-act="op-nueva"][data-v="base"]');await p.clock.runFor(1500);await p.waitForTimeout(200);
const doc=await p.inputValue('#p-doc');console.log(w,'base, primeras líneas:',doc.split('\n').slice(0,5).join(' / '),'· cortes:',(doc.match(/^[A-Z ]+:/gm)||[]).length);
// modificar: agregar un pedido especial al pecho
await p.fill('#p-doc',doc.replace('PECHO: CONGELAR','PECHO: 300KG PECHITO FRESCO EN CAJAS “ROVER”\nRESTO: CONGELAR'));await p.locator('#p-doc').dispatchEvent('input');await p.clock.runFor(1500);await p.waitForTimeout(200);
await p.click('.nav [data-act="p-editar"]');await p.clock.runFor(800);await p.waitForTimeout(200);
const g=await p.evaluate(()=>window.__mock.data.produccion['op-2026-10-21']);
console.log(w,'guardada:',g.medias+'½ '+g.mercado,'· pecho:',JSON.stringify(g.cortes.find(c=>c.corte==='PECHO').lineas.map(l=>l.t)));
await p.screenshot({path:SP+'/op'+w+'.png',fullPage:true});
// planilla de frescos sigue aparte
await p.click('[data-act="pv"][data-v="frescos"]');await p.waitForTimeout(150);
console.log(w,'frescos:',(await p.locator('.hoja-corte').first().innerText()).replace(/\s+/g,' '));
// día siguiente: armar desde la anterior
await p.click('.nav [data-act="fecha"][data-d="1"]');await p.waitForTimeout(100);await p.click('[data-act="pv"][data-v="op"]');await p.waitForTimeout(100);
console.log(w,'otro día:',(await p.locator('#view-produccion .panel .acciones').first().innerText()).replace(/\s+/g,' '));
await p.click('[data-act="op-nueva"][data-v="ant"]');await p.clock.runFor(1500);await p.waitForTimeout(200);
console.log(w,'desde la anterior, pecho:',(await p.inputValue('#p-doc')).split('\n').filter(l=>/PECHO|ROVER/.test(l)).join(' / '));
// guardar como base
await p.click('[data-act="op-base"]');await p.clock.runFor(2000);await p.waitForTimeout(200);
console.log(w,'base guardada empieza:',await p.evaluate(()=>String(window.__mock.data.config.general.opBase||'').split('\n')[0]));
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
// link para compartir: ve la orden, sin editar
const q=await b.newPage({viewport:{width:1100,height:900}});await q.clock.install({time:new Date('2026-10-20T10:00:00-03:00')});
await q.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:null,editores:[]}},data);
await q.goto('http://127.0.0.1:8765/produccion.html');await q.clock.runFor(1500);await q.waitForTimeout(300);
console.log('link: solapas',await q.locator('.pv-tabs .btn').count(),'· botones editar',await q.locator('[data-act="p-editar"],[data-act="op-nueva"]').count(),'· orden:',(await q.locator('.op-lista').innerText().catch(()=>'-')).replace(/\s+/g,' ').slice(0,120));
await q.screenshot({path:SP+'/op-link.png',fullPage:true});
await b.close();})();
