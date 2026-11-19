// "Todo en KG": pone la unidad a todos los renglones que dicen ¿Unidad? de una vez.
const {chromium}=require('playwright');const F='2026-11-20';
const ped={a:{cliente:'DINO RUTA 20',entrega:F,medias:0,peso:'',nota:'',frio:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'1',corte:'JAMON',texto:'40 KG 4 MUSC'},{k:'2',corte:'BONDIOLA',texto:'120 (COD 101)'},{k:'3',corte:'PECHO',texto:'300 PECHITO CON MANTA'},{k:'4',corte:'MORCILLA',texto:'60'}]}};
const data={faena:{},privado:{},config:{general:{feriados:[]}},pedidos:ped,produccion:{}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-19T09:30:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(2000);await p.waitForTimeout(300);
 await p.evaluate(()=>document.querySelector('[data-ped="a"] .ped-tit').click());await p.waitForTimeout(300);
 console.log('aviso:',await p.evaluate(()=>document.querySelector('.uni-todos')?.textContent));
 await p.click('[data-act="uni-todos"][data-u="kg"]');await p.waitForTimeout(500);
 console.log('textos:',await p.evaluate(()=>window.__mock.data.pedidos.a.cortes.map(c=>c.texto).join(' | ')),'| aviso queda:',await p.locator('.uni-todos').count());
 console.log('errores:',errs);await b.close();})();
