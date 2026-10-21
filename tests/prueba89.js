// Pedidos: el horario de cada camión se pone o se cambia ahí mismo en el título del grupo (sin ir a Logística).
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-22';
const P=(c,cam)=>({cliente:c,entrega:F,medias:10,peso:'',nota:'',origen:'manual',kg:'',camion:cam,cuenta:'',cortes:[]});
const cams=[{id:'c1',nombre:'SEMI PASSERI 1',hora:'10:00',kg:24000,orden:['a']},{id:'c2',nombre:'CHAVEZ',hora:'',kg:0,orden:['b']},{id:'c3',nombre:'LOVAIZA 1',hora:'08:00',kg:0,orden:['c']}];
const data={faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:0,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[],clientes:[]}))}},produccion:{},privado:{},
 config:{general:{},['log-'+F]:{fecha:F,camiones:cams,pedidos:[]}},pedidos:{a:P('COTO','c1'),b:P('CRUDI','c2'),c:P('GRION','c3')}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-21T17:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForSelector('.grupo-cam');
const grupos=()=>p.$$eval('.grupo-cam:not(.sin-cam) .grupo-tit',gs=>gs.map(g=>{const i=g.querySelector('input[type=time]');return g.querySelector('.cam-ped').innerText+' '+(i?'['+(i.value||'--')+']':g.querySelector('.cam-hora-mas')?'(+Horario)':'')}).join(' | '));
const pub=()=>p.evaluate(()=>window.__mock.data.config['log-2026-10-22'].camiones.map(c=>c.nombre+'@'+(c.hora||'-')).join(', '));
console.log('=== ',w,'antes:',await grupos());
await p.click('[data-act="hora-abrir"][data-id="c2"]');await p.waitForTimeout(100);
const inp=p.locator('input[data-hora-cam="c2"]');console.log('foco:',await p.evaluate(()=>document.activeElement.dataset.horaCam));
await inp.fill('09:30');await inp.press('Enter');await p.clock.runFor(1500);await p.waitForTimeout(200);
console.log('CHAVEZ 09:30 →',await grupos(),'· publicado:',await pub());
const i1=p.locator('input[data-hora-cam="c1"]');await i1.fill('07:15');await i1.blur();await p.clock.runFor(1500);await p.waitForTimeout(200);
console.log('PASSERI 07:15 →',await grupos(),'· publicado:',await pub());
await p.locator('.grupo-cam').first().screenshot({path:SP+'/hora-ped'+w+'.png'});
console.log('desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores',errs.join('|')||'ninguno');}
await b.close();})();
