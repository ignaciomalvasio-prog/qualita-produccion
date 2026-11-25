// Orden de producción y empaque de la mano: si un corte ya sumado a empaque se manda a la orden del jueves, en empaque también pasa al jueves.
const {chromium}=require('playwright');const M='2026-11-25',J='2026-11-26';
const ped={g:{cliente:'GRION',entrega:J,diaProd:M,medias:0,peso:'',nota:'',frio:'FRESCO',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'a',corte:'JAMON',texto:'500 KG 5 MÚSCULOS',op:J},{k:'b',corte:'CUERO',texto:'15 CAJAS CON TOCINO'}]}};
const data={faena:{},privado:{},config:{general:{feriados:[]}},pedidos:ped,produccion:{[M]:{fecha:M,medias:750,mercado:'',estado:'borrador',cortes:[{corte:'JAMON',lineas:[{t:'500 KG 5 MÚSCULOS “GRION”',p:'g',ck:'a',e:J}]},{corte:'CUERO',lineas:[{t:'15 CAJAS CON TOCINO “GRION”',p:'g',ck:'b',e:J}]}]}}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-25T10:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(3000);await p.waitForTimeout(600);
 const ver=()=>p.evaluate(()=>{const P=window.__mock.data.produccion,r={};Object.keys(P).sort().forEach(k=>{const t=P[k].cortes.map(c=>c.corte+':'+c.lineas.length).join(',');if(t)r[k]=t;});return JSON.stringify(r);});
 console.log('antes:',await ver());
 await p.evaluate(()=>{const x=document.querySelector('[data-ped="g"] .ped-tit');x&&x.click();});await p.waitForTimeout(300);
 const sel=p.locator('[data-ped="g"] select.op-sel').first();
 await sel.selectOption(J);await p.clock.runFor(2000);await p.waitForTimeout(500);
 console.log('orden jueves:',await ver());
 await p.locator('[data-ped="g"] select.op-sel').first().selectOption('');await p.clock.runFor(2000);await p.waitForTimeout(500);
 console.log('quito orden:',await ver());
 console.log('errores:',errs);await b.close();})();
