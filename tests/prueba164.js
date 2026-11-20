// Jamón, paleta, tocino y recorte de los pedidos pasan solos a la Orden de producción del día; se pueden corregir a mano.
const {chromium}=require('playwright');const L='2026-11-23',V='2026-11-20';
const ped={r:{cliente:'ROVER',entrega:L,medias:0,peso:'',nota:'',frio:'FRESCO',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'a',corte:'JAMON',texto:'1200 KG JAMON 5 MUSCULOS'},{k:'b',corte:'PECHO',texto:'5 CAJAS'},{k:'c',corte:'TOCINO',texto:'300 KG'},{k:'d',corte:'RECORTE',texto:'2000 KG RECORTE DE JAMON CON GRASA 3 (COD 374)'},{k:'e',corte:'RECORTE',texto:'800 KG RECORTE DE PALETA INDUSTRIAL'},{k:'f',corte:'RECORTE',texto:'1400 KG 80/20'}]},
 g:{cliente:'GRION',entrega:L,medias:0,peso:'',nota:'',frio:'FRESCO',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'a',corte:'PALETA',texto:'800 KG SIN HUESO'},{k:'b',corte:'TAPA DE JAMON',texto:'50 KG'}]}};
const data={faena:{},privado:{},config:{general:{feriados:[]}},pedidos:ped,produccion:{['op-'+V]:{fecha:V,medias:750,mercado:'CONSUMO',estado:'borrador',cortes:[{corte:'JAMON',lineas:[{t:'RESTO: RECORTE DE JAMON (COD 374) FRESCO EN BINES "ARGENCARNES"'}]},{corte:'RECORTE',lineas:[{t:'RESTO: 60/40 FRESCO EN BINES'}]}]}}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-20T19:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(3000);await p.waitForTimeout(600);
 const op=()=>p.evaluate(()=>{const o=window.__mock.data.produccion['op-2026-11-23'];return o?o.cortes.map(c=>c.corte+': '+c.lineas.map(l=>l.t+(l.op?' [auto]':'')).join(' / ')).join(' || '):'(no hay)';});
 console.log('1 orden lunes:',await op());
 // cambia el pedido
 await p.evaluate(()=>{const x=window.__mock.data.pedidos.r;x.cortes[0].texto='1500 KG JAMON 5 MUSCULOS';window.__mock.emitir('pedidos');});await p.clock.runFor(1500);await p.waitForTimeout(400);
 console.log('2 cambia pedido:',await op());
 // Renzo corrige a mano el renglón de Grion y borra el tocino (simula guardar la orden editada)
 await p.evaluate(()=>{const o=window.__mock.data.produccion['op-2026-11-23'];o.cortes.forEach(c=>c.lineas.forEach(l=>{if(/GRION/.test(l.t))l.t='800 KG SIN HUESO CON CUERO "GRION"';}));const t=o.cortes.find(c=>c.corte==='TOCINO');const l=t.lineas.find(x=>x.op);o.opNo={[l.p+'|'+l.ck]:1};t.lineas=t.lineas.filter(x=>!x.op);window.__mock.emitir('produccion');});
 await p.clock.runFor(1500);await p.waitForTimeout(400);
 console.log('3 corregido a mano:',await op());
 // borran el pedido de Rover
 await p.evaluate(()=>{delete window.__mock.data.pedidos.r;window.__mock.emitir('pedidos');});await p.clock.runFor(1500);await p.waitForTimeout(400);
 console.log('4 sin Rover:',await op());
 console.log('empaque sin tocar:',await p.evaluate(()=>!window.__mock.data.produccion['2026-11-23']));
 console.log('errores:',errs);await b.close();})();
