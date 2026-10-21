// Pedidos: el desglose de un pedido abierto tiene el selector KG / CAJAS / UNIDADES, igual que Logística.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-20';
const K=(k,corte,texto)=>({k,corte,texto});
const data={faena:{},config:{general:{}},privado:{clientes:{lista:[]}},
 produccion:{[F]:{medias:0,mercado:'',estado:'borrador',cortes:[{corte:'RECORTE',lineas:[{t:'1 RECORTE “ITURRE FABIAN”',p:'a',ck:'k0'}]}]}},
 pedidos:{a:{cliente:'ITURRE FABIAN',entrega:F,medias:0,peso:'',nota:'ZONA SARMIENTO',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[K('k0','RECORTE','1 RECORTE'),K('k1','TOCINO','1 TOCINO'),K('k2','BONDIOLA','3 CAJAS BONDIOLA')]}}};
(async()=>{const b=await chromium.launch();
for(const w of [1280,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-20T12:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForTimeout(200);
if(!(await p.locator('#view-pedidos .ped').count())){await p.click('[data-act="pd"][data-d="-1"]');await p.waitForTimeout(150);}
await p.click('#view-pedidos [data-act="ped-abrir"] .nom');await p.waitForTimeout(150);
console.log(w,'selectores:',await p.$$eval('.ped.abierto select.uni',x=>x.map(s=>s.value||'?').join(',')),'· kg antes:',await p.locator('.ped .col-kg').innerText());
await p.selectOption('.ped.abierto select.uni[data-k="k0"]','kg');await p.clock.runFor(1500);await p.waitForTimeout(200);
if(!(await p.locator('.ped.abierto').count())){await p.click('#view-pedidos [data-act="ped-abrir"] .nom');await p.waitForTimeout(150);}
await p.selectOption('.ped.abierto select.uni[data-k="k1"]','und');await p.clock.runFor(1500);await p.waitForTimeout(200);
console.log(w,'pedido:',await p.evaluate(()=>window.__mock.data.pedidos.a.cortes.map(c=>c.texto).join(' / ')),'· producción:',await p.evaluate(()=>window.__mock.data.produccion['2026-10-20'].cortes.map(c=>c.lineas.map(l=>l.t).join(';')).join(' | ')));
console.log(w,'sigue abierto:',await p.locator('.ped.abierto').count(),'· kg:',await p.locator('.ped .col-kg').innerText());
await p.locator('.ped.abierto').screenshot({path:SP+'/peduni'+w+'.png'});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
