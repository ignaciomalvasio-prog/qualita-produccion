// Logística: el horario de cada camión se pone o se cambia ahí mismo (como en Pedidos).
const {chromium}=require('playwright');const F='2026-11-05';
const P=(c,cam)=>({cliente:c,entrega:F,medias:14,peso:'',nota:'',origen:'manual',kg:'',camion:cam,cuenta:'',cortes:[]});
const ped={a:P('LOPEZ','c1'),b:P('EMERIC','c2')};
const data={faena:{},produccion:{},privado:{},config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'SEBA',hora:'04:00',orden:['a']},{id:'c2',nombre:'MAXIMO',orden:['b']}],pedidos:Object.keys(ped).map(k=>Object.assign({id:k},ped[k]))}},pedidos:ped};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-11-04T16:30:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForTimeout(300);
await p.evaluate(()=>{const i=document.getElementById('l-fecha');i.value='2026-11-05';i.dispatchEvent(new Event('change',{bubbles:true}));});await p.waitForTimeout(300);
await p.click('section.cam[data-cam="c2"] [data-act="hora-abrir"]');await p.waitForTimeout(150);
await p.fill('input[data-hora-cam="c2"]','03:30');await p.locator('input[data-hora-cam="c2"]').press('Enter');await p.clock.runFor(800);await p.waitForTimeout(300);
await p.fill('input[data-hora-cam="c1"]','05:15');await p.locator('input[data-hora-cam="c1"]').press('Enter');await p.clock.runFor(800);await p.waitForTimeout(300);
console.log(w,'horarios:',await p.evaluate(F=>window.__mock.data.config['log-'+F].camiones.map(c=>c.nombre+' '+(c.hora||'-')).join(' | '),F));
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
