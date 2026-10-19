const {chromium}=require('playwright');const SP=process.argv[2];
const P=(c,cam,m,ext)=>Object.assign({cliente:c,entrega:'2026-10-19',medias:m||0,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cuenta:'',cortes:[]},ext||{});
const data={faena:{},produccion:{},config:{general:{},'log-2026-10-19':{fecha:'2026-10-19',camiones:[{id:'c1',nombre:'MAXIMO 1',hora:'',nota:'02:00HS',orden:['a']},{id:'c2',nombre:'LAGUI',hora:'',nota:'03:00hs',orden:['b']},{id:'c3',nombre:'SUR',hora:'',nota:'por ruta 9',orden:[]}],pedidos:[]}},privado:{clientes:{lista:[]}},
 pedidos:{a:P('NOVICERD','c1',100,{precioMedias:2850.5,ivaMedias:'iva'}),b:P('URCA','c2',0,{cortes:[{k:'k0',corte:'JAMON',texto:'15 CAJAS PIERNA',precio:4200,iva:'final'},{k:'k1',corte:'TOCINO',texto:'5 CAJAS'}]})}};
(async()=>{const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1280,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-16T12:00:00-03:00')});
await p.addInitScript(d=>{window.print=()=>{};window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForSelector('#view-logistica .nav');
for(let k=0;k<3&&!(await p.locator('.cam').count());k++){await p.click('[data-act="fl"][data-d="1"]');await p.waitForTimeout(100);}
console.log('por camión:',(await p.locator('#view-logistica').innerText()).replace(/\s+/g,' ').slice(0,700));
await p.click('[data-act="resumen"]');await p.waitForTimeout(150);
console.log('horas en resumen:',await p.evaluate(()=>[...document.querySelectorAll('.res-hora')].map(i=>i.value).join(',')),'· notas:',(await p.locator('.res-nota').allInnerTexts()).join('|'));
await p.locator('.res-hora').nth(0).fill('02:30');await p.locator('.res-hora').nth(0).dispatchEvent('change');await p.clock.runFor(500);await p.waitForTimeout(200);
console.log('guardado:',await p.evaluate(()=>JSON.stringify(window.__mock.data.config['log-2026-10-19'].camiones.map(c=>[c.nombre,c.hora,c.nota]))));
console.log('precios en log:',await p.evaluate(()=>JSON.stringify(window.__mock.data.config['log-2026-10-19'].pedidos.map(x=>[x.cliente,x.precioMedias,x.ivaMedias,x.cortes.map(c=>c.precio+'/'+c.iva)]))));
// cambio de precio en pedidos se publica
await p.click('#tab-pedidos');await p.waitForSelector('.ped');
for(let k=0;k<4&&!(await p.locator('.ped',{hasText:'URCA'}).count());k++){await p.click('[data-act="pd-ir"]').catch(()=>{});await p.waitForTimeout(100);}
const u=p.locator('.ped',{hasText:'URCA'});await u.locator('[data-act="ped-abrir"]').click();
const inp=p.locator('.ped.abierto input[data-precio][data-k="k1"]');await inp.fill('3100');await inp.dispatchEvent('change');await p.clock.runFor(600);await p.waitForTimeout(200);
await p.locator('.ped.abierto [data-act="iva"][data-k="k1"][data-v="iva"]').click();await p.clock.runFor(600);await p.waitForTimeout(200);
console.log('tras cambiar precio:',await p.evaluate(()=>JSON.stringify(window.__mock.data.config['log-2026-10-19'].pedidos.find(x=>x.cliente==='URCA').cortes)));
console.log('errores:',errs.join('|')||'ninguno');
const d2=await p.evaluate(()=>window.__mock.data);
for(const w of [1100,400]){const v=await b.newPage({viewport:{width:w,height:900}});await v.clock.install({time:new Date('2026-10-16T12:00:00-03:00')});await v.addInitScript(d=>{window.__mock={data:d,user:null,editores:[]}},d2);
await v.goto('http://127.0.0.1:8765/logistica.html');await v.clock.runFor(1500);await v.waitForTimeout(200);
for(let k=0;k<3&&!(await v.locator('.cam').count());k++){await v.click('[data-act="fl"][data-d="1"]');await v.waitForTimeout(100);}
console.log(w,'link logística:',(await v.locator('#view-logistica').innerText()).replace(/\s+/g,' ').slice(0,400),'· desborde',await v.evaluate(()=>document.documentElement.scrollWidth-innerWidth));
await v.screenshot({path:SP+'/logprecio'+w+'.png',fullPage:true});}
await b.close();})();
