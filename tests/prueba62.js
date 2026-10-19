// Logística: cada cliente del camión en su recuadro, con su lugar bien grande y los cortes en columnas con la cantidad resaltada.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-19';
const P=(c,m,cortes,ext)=>Object.assign({cliente:c,entrega:F,medias:m||0,peso:'',nota:'',origen:'manual',kg:'',camion:'c1',cuenta:'',cortes:cortes||[]},ext||{});
const K=(k,corte,texto)=>({k,corte,texto});
const data={faena:{},produccion:{},privado:{clientes:{lista:[]}},config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'LAGUI',hora:'03:00',orden:['a','b','c','d','e']},{id:'c2',nombre:'MAXIMO (PRIMER VIAJE)',hora:'00:00',orden:['f']}],pedidos:[]}},
 pedidos:{a:P('CICLO 3',0,[K('k0','RECORTE','TODO')]),b:P('ALICAN',0,[K('k0','HIGADO','500 KG HIGADO FRESCO')],{frio:'FRESCO',cuenta:'21004'}),
  c:P('ACUÑA LEANDRO',2,[],{peso:'LIVIANITAS, LINDAS, NO GORDAS'}),
  d:P('ACHAVAL',0,[K('k0','MATAMBRE','6 CAJAS MATAMBRITOS'),K('k1','CHURRASCO','6 CAJAS CHURRASQUITOS'),K('k2','SOLOMILLO','1 CAJA SOLOMILLO'),K('k3','JAMON','20 JAMON 4 MUSC (COD 341)')],{frio:'CONGELADO',nota:'Temprano en lo posible'}),
  e:P('REYNA MARIA',2),f:P('NOVICERD',100),g:P('SUELTO SA',0,[K('k0','PECHO','5 CAJAS PECHITOS')],{camion:''})}};
(async()=>{const b=await chromium.launch();
for(const [w,ed] of [[1100,1],[400,1],[1100,0]]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-16T12:00:00-03:00')});
await p.addInitScript(([d,ed])=>{window.print=()=>{};window.__mock={data:JSON.parse(JSON.stringify(d)),user:ed?{email:'yo@x.com'}:null,editores:['yo@x.com']}},[data,ed]);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForSelector('#view-logistica .nav');
for(let k=0;k<3&&!(await p.locator('.log-ped').count());k++){await p.click('[data-act="fl"][data-d="1"]');await p.waitForTimeout(100);}
console.log(w,ed?'editor':'público','lugares:',await p.$$eval('.log-num',x=>x.map(e=>e.textContent).join(',')),'· recuadros:',await p.locator('.log-ped').count(),'· cantidades:',await p.$$eval('.lc-cant',x=>x.map(e=>e.innerText.replace(/\s+/g,' ').trim()).join(' | ')));
await p.screenshot({path:SP+'/logprolijo'+w+(ed?'':'pub')+'.png',fullPage:true});
if(ed){await p.locator('.log-ped',{hasText:'ACHAVAL'}).locator('[data-act="cam-subir"]').click();await p.clock.runFor(1500);await p.waitForTimeout(200);
 console.log(w,'subir ACHAVAL:',await p.$$eval('.cam',c=>c[0]?[...c[0].querySelectorAll('.log-ped')].map(e=>e.querySelector('.log-num').textContent+' '+e.querySelector('strong').textContent).join(', '):''));}
await p.emulateMedia({media:'print'});await p.screenshot({path:SP+'/logprolijo-print'+w+(ed?'':'pub')+'.png',fullPage:true});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
