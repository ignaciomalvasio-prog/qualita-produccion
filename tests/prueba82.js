// Pedidos: al lado del buscador de clientes hay un buscador de camiones (los que ya tienen clientes); "Ver" lleva a ese día y camión.
const {chromium}=require('playwright');const SP=process.argv[2];
const P=(c,cam,f)=>({cliente:c,entrega:f||'2026-10-14',medias:10,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cuenta:'',cortes:[]});
const cams=[{id:'c1',nombre:'Lagui',hora:'03:00',nota:'',kg:0,orden:['b','a']},{id:'c2',nombre:'Moreira',nota:'',kg:0,orden:['d']},{id:'c3',nombre:'Lagui vacío',nota:'',kg:0,orden:[]}];
const cams2=[{id:'k1',nombre:'MAXIMO (PRIMER VIAJE)',hora:'02:00',nota:'',kg:6000,orden:['h']}];
const data={faena:{},produccion:{},config:{general:{},'log-2026-10-14':{fecha:'2026-10-14',camiones:cams,pedidos:[]},'log-2026-10-16':{fecha:'2026-10-16',camiones:cams2,pedidos:[]}},privado:{},
 pedidos:{a:P('ALFA','c1'),b:P('BETA','c1'),c:P('GAMA'),d:P('DELTA','c2'),h:P('NOVICERD','k1','2026-10-16'),i:P('OTRO',null,'2026-10-16')}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-13T18:20:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForSelector('#pd-cam-buscar');
const res=async()=>(await p.locator('#view-pedidos .busq, #view-pedidos .sin').first().innerText()).replace(/\s+/g,' ');
await p.locator('#pd-cam-buscar').pressSequentially('lag',{delay:30});await p.waitForTimeout(150);
console.log('=== ancho',w,'buscar "lag":',await res(),'· foco sigue:',await p.evaluate(()=>document.activeElement.id));
await p.fill('#pd-cam-buscar','maximo');await p.locator('#pd-cam-buscar').dispatchEvent('input');console.log('buscar "maximo":',await res());
await p.screenshot({path:SP+'/buscam'+w+'.png',fullPage:true});
await p.click('[data-act="busq-cam"]');await p.waitForTimeout(300);
console.log('ver → día:',await p.locator('.nav-ped .tit').innerText(),'· destacado:',await p.locator('.grupo-cam.destello .grupo-tit').innerText().catch(()=>'(ninguno)'),'· buscador vacío:',await p.inputValue('#pd-cam-buscar')==='');
await p.fill('#pd-cam-buscar','zzz');await p.locator('#pd-cam-buscar').dispatchEvent('input');console.log('sin resultado:',await res());
await p.click('[data-act="busq-limpiar"]');await p.waitForTimeout(100);console.log('limpiar → grupos:',await p.locator('.grupo-cam').count());
console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');}
await b.close();})();
