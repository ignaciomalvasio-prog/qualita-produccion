// Pedidos: el desglose de un pedido abierto con el mismo estilo que Logística (corte subrayado, cantidad en negrita, nota resaltada).
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-20';
const K=(k,corte,texto)=>({k,corte,texto});
const data={faena:{},config:{general:{}},privado:{clientes:{lista:[]}},produccion:{},
 pedidos:{a:{cliente:'ACHAVAL',entrega:F,medias:4,peso:'NO GORDAS',nota:'Temprano en lo posible',origen:'manual',kg:'',camion:'',cuenta:'21096',frio:'CONGELADO',
  cortes:[K('k0','MATAMBRE','6 CAJAS MATAMBRITOS'),K('k1','CHURRASCO','6 CAJAS CHURRASQUITOS'),K('k2','JAMON','20 JAMON 4 MUSC (COD 341)'),K('k3','RECORTE','TODO')]}}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-19T12:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForSelector('#view-pedidos .ped');
await p.click('#view-pedidos [data-act="ped-abrir"]');await p.waitForTimeout(150);
console.log(w,'cortes:',await p.$$eval('.ped.abierto .lc-corte',x=>x.map(e=>e.textContent).join(',')),'· cantidades:',await p.$$eval('.ped.abierto .lc-cant',x=>x.map(e=>e.textContent).join(' | ')),'· nota:',await p.locator('.ped.abierto .log-nota').innerText());
await p.click('.ped.abierto [data-act="c-sumar"][data-k="k0"]');await p.clock.runFor(1000);await p.waitForTimeout(200);
console.log(w,'en producción:',await p.locator('.ped.abierto .lp .badge.ok').count());
await p.locator('.ped.abierto').screenshot({path:SP+'/pedprolijo'+w+'.png'});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
