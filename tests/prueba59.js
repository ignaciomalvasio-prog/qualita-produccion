// Pedidos: cada renglón marca si sus cortes ya están en producción (todos, algunos o ninguno).
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-20';
const P=(c,m,cortes)=>({cliente:c,entrega:F,medias:m||0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:cortes||[]});
const K=(k,corte,texto)=>({k,corte,texto});
const data={faena:{},config:{general:{}},privado:{clientes:{lista:[]}},
 produccion:{[F]:{medias:0,mercado:0,estado:'borrador',cortes:[
  {corte:'BONDIOLA',lineas:[{t:'4 CAJAS BONDIOLA "GRION"',p:'a',ck:'k0'},{t:'2 CAJAS BONDIOLA "ROVER"',p:'b',ck:'k0'}]},
  {corte:'PECHO',lineas:[{t:'100KG COSTILLA "GRION"',p:'a',ck:'k1'}]}]}},
 pedidos:{
  a:P('GRION',0,[K('k0','BONDIOLA','4 CAJAS BONDIOLA'),K('k1','PECHO','100KG COSTILLA')]),
  b:P('ROVER',0,[K('k0','BONDIOLA','2 CAJAS BONDIOLA'),K('k1','PECHO','50KG COSTILLA'),K('k2','PALETA','1 CAJA PALETA')]),
  c:P('BOCANTINO',0,[K('k0','BONDIOLA','3 CAJAS BONDIOLA')]),
  d:P('MONTEVERDE',16)}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-19T12:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForSelector('#view-pedidos .ped');
const marca=async c=>((await p.locator('#view-pedidos .ped',{hasText:c}).locator('.ped-tit .marcas').innerText().catch(()=>''))||'(sin marca)').replace(/\s+/g,' ').trim();
for(const c of ['GRION','ROVER','BOCANTINO','MONTEVERDE'])console.log(w,c,'→',await marca(c));
// Sumar el corte que falta de ROVER desde el pedido abierto y ver que la marca cambia.
await p.locator('#view-pedidos .ped',{hasText:'BOCANTINO'}).locator('[data-act="ped-abrir"]').click();await p.waitForTimeout(100);
const sumar=p.locator('#view-pedidos .ped.abierto button',{hasText:/sumar|producci/i}).first();
if(await sumar.count()){await sumar.click();await p.clock.runFor(1000);await p.waitForTimeout(200);console.log(w,'BOCANTINO después de sumar →',await marca('BOCANTINO'));}
await p.screenshot({path:SP+'/marca-prod'+w+'.png',fullPage:true});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
