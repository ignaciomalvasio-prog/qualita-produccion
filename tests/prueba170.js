// Armar camión: choferes de siempre (de días anteriores) con su hora; 1er/2do viaje.
const {chromium}=require('playwright');const SP=process.argv[2]||'/tmp';const F='2026-11-30';
const cfg={general:{feriados:[]}};
['2026-11-20','2026-11-23','2026-11-24','2026-11-25','2026-11-26'].forEach((d,i)=>{cfg['log-'+d]={fecha:d,pedidos:[],camiones:[{id:'a'+i,nombre:'JOEL PIZARRO',hora:'03:00',orden:[]},{id:'b'+i,nombre:'LOVAIZA PRIMER VIAJE',hora:'02:00',orden:[]},{id:'c'+i,nombre:'LOVAIZA SEGUNDO VIAJE',hora:'09:30',orden:[]},{id:'d'+i,nombre:'MAXIMO',nota:'05:00HS',orden:[]}].concat(i==0?[{id:'z',nombre:'UNA VEZ',orden:[]}]:[])};});
const ped={p1:{cliente:'ALICAN',entrega:F,medias:10,peso:'',nota:'',frio:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[]}};
(async()=>{const b=await chromium.launch();
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-11-27T15:40:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},{faena:{},privado:{},config:cfg,pedidos:ped,produccion:{}});
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(2000);await p.waitForTimeout(300);
await p.evaluate(()=>{const c=document.querySelector('.ped input[type=checkbox]');c.click();});await p.waitForTimeout(300);
const sel=await p.$('#cam-a');if(sel){await p.selectOption('#cam-a','nuevo').catch(()=>{});await p.waitForTimeout(200);}
console.log(w,'choferes:',await p.evaluate(()=>[...document.querySelectorAll('#cam-nom-sel option')].map(o=>o.textContent).join(' | ')));
console.log(w,'viajes:',await p.evaluate(()=>[...document.querySelectorAll('#cam-viaje-sel option')].map(o=>o.textContent).join(' | ')));
await p.selectOption('#cam-nom-sel','LOVAIZA');await p.selectOption('#cam-viaje-sel','2');await p.selectOption('#cam-hora-sel','09:30');
await p.screenshot({path:SP+'/sel'+w+'.png'});
await p.click('[data-act=cam-crear]');await p.clock.runFor(1500);await p.waitForTimeout(300);
await p.clock.runFor(500);console.log(w,'creado:',await p.evaluate(()=>JSON.stringify((window.__mock.data.config['log-2026-11-30']||{}).camiones)));
console.log(w,'desborde:',await p.evaluate(()=>document.documentElement.scrollWidth),'errores:',errs);await p.close();}
await b.close();})();
