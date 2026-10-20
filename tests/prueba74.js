// Logística: tildar clientes y mandarlos juntos a un camión del día, del stock o a uno nuevo.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-21';
const P=(c,m,cam)=>({cliente:c,entrega:F,medias:m,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cuenta:'',cortes:[]});
const data={faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:null,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[{origen:'X',propios:100,usuarios:0}],clientes:[]}))}},produccion:{},privado:{clientes:{lista:[]}},config:{general:{flota:[{id:'s1',nombre:'SEMI PASSERI 2',kg:20000}]},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'LAGUI',hora:'03:00',orden:['a']}],pedidos:[]}},
 pedidos:{a:P('NOVICERD',100,'c1'),b:P('ACHAVAL',4),c:P('GRION',10),d:P('ROVER',6),e:P('DIGAR',20)}};
(async()=>{const b=await chromium.launch();
for(const w of [1280,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-20T13:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForSelector('#view-logistica .nav');
for(let k=0;k<3&&!(await p.locator('.log-ped').count());k++){await p.click('[data-act="fl"][data-d="1"]');await p.waitForTimeout(100);}
const cam=()=>p.evaluate(()=>Object.entries(window.__mock.data.pedidos).map(([k,v])=>v.cliente+':'+(v.camion||'-')).join(' '));
const tildar=async c=>{await p.locator('.log-ped',{hasText:c}).locator('input[data-sel]').check();await p.waitForTimeout(100);};
console.log(w,'casillas:',await p.locator('.log-ped input[data-sel]').count());
// 1) dos al camión del día
await tildar('ACHAVAL');await tildar('GRION');
console.log(w,'barra:',(await p.locator('.log-barra strong').innerText()),'· opciones:',await p.$$eval('#cam-a option',x=>x.map(o=>o.textContent).join(' | ')));
await p.screenshot({path:SP+'/logtildar'+w+'.png'});
await p.selectOption('#cam-a',{index:1});await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'a LAGUI:',await cam());
// 2) uno al del stock
await tildar('ROVER');await p.selectOption('#cam-a',await p.$eval('#cam-a',s=>[...s.options].find(o=>/SEMI PASSERI 2/.test(o.textContent)).value));await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'al stock:',await cam(),'· camiones:',await p.$$eval('.cam>.cam-cab h2',x=>x.map(e=>e.textContent).join(' | ')));
// 3) uno a un camión nuevo
await tildar('DIGAR');await p.selectOption('#cam-a','nuevo');await p.waitForTimeout(150);
await p.fill('#cam-nombre','SURFRIGO (RETIRA EN PLANTA)');await p.locator('#cam-nombre').dispatchEvent('input');await p.click('[data-act="cam-crear"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'nuevo:',await cam(),'· camiones:',await p.$$eval('.cam>.cam-cab h2',x=>x.map(e=>e.textContent).join(' | ')),'· barra:',await p.locator('.log-barra').count());
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
const q=await b.newPage({viewport:{width:1100,height:900}});await q.clock.install({time:new Date('2026-10-20T13:00:00-03:00')});
await q.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await q.goto('http://127.0.0.1:8765/logistica.html');await q.clock.runFor(1500);await q.waitForTimeout(300);
console.log('link: casillas',await q.locator('input[data-sel]').count());
await b.close();})();
