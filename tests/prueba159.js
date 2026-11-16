// Pedidos: recordatorio propio en el renglón ("hacer producir el miércoles"); no va a Logística.
const {chromium}=require('playwright');const F='2026-11-17';
const ped={g:{cliente:'GRION',entrega:F,medias:0,peso:'',nota:'',frio:'FRESCO',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'1',corte:'JAMON',texto:'2000 KG'}]},
 h:{cliente:'ALICAN',entrega:F,medias:0,peso:'',nota:'',frio:'FRESCO',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'1',corte:'PECHO',texto:'50 KG'}]}};
const data={faena:{},privado:{},config:{general:{feriados:[]}},pedidos:ped,produccion:{}};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-16T16:30:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(2000);await p.waitForTimeout(300);
 await p.evaluate(()=>document.querySelector('[data-ped="g"] [data-act="rec-menu"]').click());await p.waitForTimeout(200);
 console.log(w,'abierto:',await p.evaluate(()=>[!!document.getElementById('rec-in'),document.activeElement&&document.activeElement.id].join(',')),'pedido abierto?',await p.evaluate(()=>document.querySelector('[data-ped="g"]').classList.contains('abierto')));
 await p.fill('#rec-in','hacer producir el miércoles');await p.press('#rec-in','Enter');await p.waitForTimeout(400);
 console.log(w,'chip:',await p.evaluate(()=>document.querySelector('[data-ped="g"] .rec-chip').textContent),'| guardado:',await p.evaluate(()=>window.__mock.data.pedidos.g.recordatorio));
 console.log(w,'en logística publicada:',await p.evaluate(()=>JSON.stringify(window.__mock.data.config['log-2026-11-17']||{}).includes('miércoles')));
 await p.screenshot({path:(process.argv[2]||'.')+'/p159-'+w+'.png'});
 console.log(w,'desborde:',await p.evaluate(()=>document.documentElement.scrollWidth));await p.close();}
console.log('errores:',errs);await b.close();})();
