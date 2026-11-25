// "Subir el camión" en Logística: cambia el orden y no pierde pedidos; un pedido que quedó sin día vuelve a su camión; viajes en orden.
const {chromium}=require('playwright');const F='2026-11-26';
const ped={a:{cliente:'NOVICERD',entrega:F,medias:100,peso:'',nota:'',frio:'',origen:'manual',kg:'',camion:'c1',cuenta:'',cortes:[]},b:{cliente:'MONTEVERDE',entrega:-1,medias:4,peso:'',nota:'',frio:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'1',corte:'PECHO',texto:'2 CAJAS'}]},
 c:{cliente:'RIBADAVIA',entrega:F,medias:6,peso:'',nota:'',frio:'',origen:'manual',kg:'',camion:'c3',cuenta:'',cortes:[]},x:{cliente:'PERDIDO SIN CAMION',entrega:1,medias:2,peso:'',nota:'',frio:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[]}};
const data={faena:{},privado:{},config:{general:{feriados:[]},['log-'+F]:{fecha:F,camiones:[{id:'c3',nombre:'LOVAIZA SEGUNDO VIAJE',orden:['c']},{id:'c1',nombre:'MAXIMO',orden:['a']},{id:'c2',nombre:'LOVAIZA PRIMER VIAJE',orden:['b']}],pedidos:[{id:'a',cliente:'NOVICERD',medias:100,camion:'c1',cortes:[]},{id:'c',cliente:'RIBADAVIA',medias:6,camion:'c3',cortes:[]}]}},pedidos:ped,produccion:{}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-25T18:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html');await p.clock.runFor(3000);await p.waitForTimeout(500);
 await p.evaluate(()=>document.querySelector('[data-tab="logistica"]').click());await p.waitForTimeout(300);
 await p.evaluate(()=>document.querySelector('#view-logistica [data-act=fl][data-d="1"]').click());await p.clock.runFor(1500);await p.waitForTimeout(400);
 const est=()=>p.evaluate(()=>{const m=window.__mock.data;return JSON.stringify({ped:Object.keys(m.pedidos).map(k=>k+':'+m.pedidos[k].entrega+':'+m.pedidos[k].camion).join(' '),cams:(m.config['log-2026-11-26'].camiones||[]).map(c=>c.nombre).join(' / '),pant:[...document.querySelectorAll('#view-logistica .badge.cam-ped, #view-logistica .log-cam h2, #view-logistica [class*=cam-nom]')].map(x=>x.innerText).join(' / '),perdidos:[...document.querySelectorAll('.perd-l b')].map(x=>x.innerText).join()});});
 console.log('1 recuperado:',await est());
 await p.evaluate(()=>document.querySelector('[data-act=menu][data-k=cam-c1]').click());await p.waitForTimeout(200);
 await p.evaluate(()=>document.querySelector('[data-act=camion-subir][data-id=c1]').click());await p.clock.runFor(1500);await p.waitForTimeout(400);
 console.log('2 subir MAXIMO:',await est());
 await p.evaluate(()=>{document.getElementById('perd-x').value='2026-11-26';document.querySelector('[data-act=perd-rec][data-id=x]').click();});await p.clock.runFor(1500);await p.waitForTimeout(400);
 console.log('3 recupero a mano:',await est());
 console.log('errores:',errs);await b.close();})();
