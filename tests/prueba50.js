const {chromium}=require('playwright');const SP=process.argv[2];
const P=(c,cam,cta)=>({cliente:c,entrega:'2026-10-14',medias:10,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cuenta:cta||'',cortes:[]});
const cams=[{id:'c1',nombre:'Lagui',hora:'03:00',nota:'',kg:0,orden:['b','a']},{id:'c2',nombre:'Moreira',nota:'',kg:0,orden:['d']}];
const data={faena:{},produccion:{},config:{general:{},'log-2026-10-14':{fecha:'2026-10-14',camiones:cams,pedidos:[]}},privado:{},
 pedidos:{a:P('ALFA','c1'),b:P('BETA','c1'),c:P('GAMA'),d:P('DELTA','c2'),e:P('EPSILON'),f:Object.assign(P('ALFA SUCURSAL 2'),{entrega:'2026-10-16'}),g:P('ZETA',null,'99001')}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-13T18:20:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForSelector('.nav-ped');
const grupos=async()=>(await p.locator('.grupo-cam').evaluateAll(gs=>gs.map(g=>g.querySelector('.grupo-tit').innerText.replace(/\s+/g,' ')+' → '+[...g.querySelectorAll('.ped .nom')].map(x=>x.innerText).join(', ')))).join(' | ');
console.log('=== ancho',w,'grupos:',await grupos());
await p.locator('#pd-buscar').pressSequentially('alf',{delay:30});await p.waitForTimeout(150);
console.log('buscar "alf":',(await p.locator('.busq').innerText()).replace(/\s+/g,' '),'· foco sigue:',await p.evaluate(()=>document.activeElement.id));
await p.fill('#pd-buscar','2100');await p.locator('#pd-buscar').dispatchEvent('input');console.log('buscar cuenta:',(await p.locator('#view-pedidos .busq, #view-pedidos .sin').first().innerText()).replace(/\s+/g,' '));
if(w===400)await p.screenshot({path:SP+'/busq400.png',fullPage:true});
await p.fill('#pd-buscar','alfa suc');await p.locator('#pd-buscar').dispatchEvent('input');
await p.click('[data-act="busq-ver"]');await p.waitForTimeout(150);console.log('ver → día:',await p.locator('.nav-ped .tit').innerText(),'· abierto:',await p.locator('.ped.abierto .nom').innerText());
// logística: posiciones por número
await p.click('#tab-logistica');await p.waitForTimeout(200);if(!(await p.locator('section.cam').count())||!(await p.locator('.pos-sel').count())){await p.fill('#l-fecha','2026-10-14');await p.locator('#l-fecha').dispatchEvent('change');await p.waitForTimeout(200);}
const orden=async()=>(await p.locator('section.cam:not(.suelto)').evaluateAll(cs=>cs.map(c=>c.querySelector('h2').innerText+': '+[...c.querySelectorAll('.log-ped strong')].map(x=>x.innerText).join(',')))).join(' | ');
console.log('logística:',await orden());
await p.locator('select[data-pos-ped="a"]').selectOption('0');await p.clock.runFor(800);console.log('ALFA al 1:',await orden());
await p.locator('select[data-pos-cam="c2"]').selectOption('0');await p.clock.runFor(800);console.log('Moreira primero:',await orden());
if(w===400)await p.screenshot({path:SP+'/pos400.png',fullPage:true});else await p.screenshot({path:SP+'/pos1100.png'});
await p.emulateMedia({media:'print'});console.log('print: número visible',await p.locator('.log-num-sel .solo-print').first().isVisible(),'select oculto',!(await p.locator('.pos-sel').first().isVisible()));await p.emulateMedia({media:'screen'});
console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');await p.close();}
await b.close();})();
