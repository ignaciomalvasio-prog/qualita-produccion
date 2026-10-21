// Pedidos: al lado de "N cortes" dice cuántos están sumados a producción y cuántos no (y si los que no son congelados).
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-20';
const P=(c,m,cortes,frio)=>({cliente:c,entrega:F,medias:m||0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',frio:frio||'',cortes:cortes||[]});
const K=(k,corte,texto,frio)=>Object.assign({k,corte,texto},frio?{frio}:{});
const L=(t,p,ck)=>({t,p,ck});
const data={faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:0,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[],clientes:[]}))}},config:{general:{}},privado:{clientes:{lista:[]}},
 produccion:{[F]:{medias:0,mercado:0,estado:'borrador',cortes:[
  {corte:'BONDIOLA',lineas:[L('4 CAJAS BONDIOLA "GRION"','a','k0'),L('2 CAJAS BONDIOLA "ROVER"','b','k0'),L('1 CAJA BONDIOLA "CONTRERAS"','c','k0')]},
  {corte:'PECHO',lineas:[L('100KG COSTILLA "GRION"','a','k1'),L('50KG COSTILLA "ROVER"','b','k1'),L('20KG PECHO "CONTRERAS"','c','k1')]},
  {corte:'PALETA',lineas:[L('1 CAJA PALETA "CONTRERAS"','c','k2')]}]}},
 pedidos:{
  a:P('GRION',0,[K('k0','BONDIOLA','4 CAJAS BONDIOLA'),K('k1','PECHO','100KG COSTILLA')]),
  b:P('ROVER',0,[K('k0','BONDIOLA','2 CAJAS BONDIOLA'),K('k1','PECHO','50KG COSTILLA'),K('k2','PALETA','1 CAJA PALETA')]),
  c:P('ALEJANDRO EMMANUEL CONTRERAS',0,[K('k0','BONDIOLA','1 CAJA BONDIOLA'),K('k1','PECHO','20KG PECHO'),K('k2','PALETA','1 CAJA PALETA'),K('k3','LOMO','10KG LOMO','CONGELADO'),K('k4','MATAMBRE','2 CAJAS MATAMBRE','CONGELADO'),K('k5','VACIO','10KG VACIO','CONGELADO')],'FRESCO'),
  d:P('BOCANTINO',0,[K('k0','BONDIOLA','3 CAJAS BONDIOLA')],'CONGELADO'),
  e:P('MONTEVERDE',16)}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-19T12:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForSelector('#view-pedidos .ped');
for(const c of ['GRION','ROVER','CONTRERAS','BOCANTINO','MONTEVERDE'])console.log(w,c,'→',(await p.locator('#view-pedidos .ped',{hasText:c}).locator('.ped-tit .res').innerText()).replace(/\s+/g,' '));
await p.screenshot({path:SP+'/cuentaprod'+w+'.png'});
// Sumar uno de ROVER y ver que cambia.
await p.locator('#view-pedidos .ped',{hasText:'ROVER'}).locator('[data-act="ped-abrir"] .nom').click();await p.waitForTimeout(100);
await p.locator('#view-pedidos .ped.abierto [data-act="c-sumar"]').first().click();await p.clock.runFor(1000);await p.waitForTimeout(200);
console.log(w,'ROVER después de sumar →',(await p.locator('#view-pedidos .ped',{hasText:'ROVER'}).locator('.ped-tit .res').innerText()).replace(/\s+/g,' '));
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
