// Logística: la franja de cada camión muestra, además de pedidos y kilos, el total de medias y de cajas que lleva.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-22';const K=(k,corte,texto)=>({k,corte,texto});
const P=(id,c,m,cortes)=>({id,cliente:c,entrega:F,medias:m,peso:'',nota:'',origen:'manual',kg:0,camion:'c1',cuenta:'',cortes:cortes||[]});
const L=[P('a','LOPEZ PABLO',14),P('b','ALBERTO BRAVO',0,[K('k0','CARRE','15 CAJAS CARRE'),K('k1','PECHO','15 CAJAS PECHITO'),K('k2','JAMON','100 KG JAMON')]),P('c','MONTEVERDE',6,[K('k0','MATAMBRE','30 CAJAS MATAMBRE')])];
const L2=[Object.assign(P('d','SOLO KG',0,[K('k0','JAMON','200 KG JAMON')]),{camion:'c2'})];
const ped={};[...L,...L2].forEach(p=>{const q=Object.assign({},p);delete q.id;ped[p.id]=q;});
const data={faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:0,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[],clientes:[]}))}},produccion:{},privado:{},pedidos:ped,
 config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'MAXIMO',hora:'02:00',kg:6000,orden:['a','b','c']},{id:'c2',nombre:'LAGUI',hora:'03:00',kg:0,orden:['d']}],pedidos:[...L,...L2]}}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-21T17:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForSelector('#view-logistica .nav');
for(let k=0;k<3&&!(await p.locator('.log-ped').count());k++){await p.click('[data-act="fl"][data-d="1"]');await p.waitForTimeout(100);}
console.log(w,await p.$$eval('section.cam:not(.suelto)',cs=>cs.map(c=>c.querySelector('h2').innerText+': '+c.querySelector('.cam-datos').innerText.replace(/\s+/g,' ')).join(' | ')));
await p.locator('section.cam').first().screenshot({path:SP+'/franja'+w+'.png'});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores',errs.join('|')||'ninguno');}
await b.close();})();
