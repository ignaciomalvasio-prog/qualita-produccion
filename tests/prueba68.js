// Pedidos: kilos y estado de producción en dos columnas alineadas (✓ verde en producción, ✗ roja sin producción, amarillo si falta una parte, raya si es solo medias).
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-20';
const P=(c,m,cortes,ext)=>Object.assign({cliente:c,entrega:F,medias:m||0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:cortes||[]},ext||{});
const K=(k,corte,texto)=>({k,corte,texto});
const data={faena:{},privado:{clientes:{lista:[]}},config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'LAGUI',hora:'03:00',orden:['e']}],pedidos:[]}},
 produccion:{[F]:{medias:0,mercado:'',estado:'borrador',cortes:[{corte:'HIGADO',lineas:[{t:'800 KG HIGADO “CHACINADOS SAN ANTONIO”',p:'a',ck:'k0'},{t:'40 KG BONDIOLA “DELFIN”',p:'c',ck:'k0'}]}]}},
 pedidos:{a:P('CHACINADOS SAN ANTONIO',0,[K('k0','HIGADO','800 KG HIGADO')],{frio:'FRESCO',cuenta:'20014'}),
  b:P('GRION',0,[K('k0','PECHO','1200 KG PECHO')],{frio:'FRESCO',cuenta:'21128'}),
  c:P('DELFIN',0,[K('k0','BONDIOLA','40 KG BONDIOLA'),K('k1','JAMON','10 CAJAS JAMON'),K('k2','PECHO','5 UNIDADES PECHO')],{cuenta:'20090'}),
  d:P('COLDCUTS FOOD',100,[],{cuenta:'21509'}),
  e:P('DINO DON BOSCO',0,[K('k0','RECORTE','TODO')],{camion:'c1',vendedor:'juan@x.com',vendedorNombre:'Juan'})}};
(async()=>{const b=await chromium.launch();
for(const w of [1280,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-19T12:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForSelector('#view-pedidos .ped');
console.log(w,await p.$$eval('#view-pedidos .ped',x=>x.map(e=>e.querySelector('.nom').textContent+': '+e.querySelector('.col-kg').innerText.trim()+' | '+e.querySelector('.col-prod').innerText.replace(/\s+/g,' ').trim()).join('\n   ')));
if(w===1280)console.log('columnas alineadas (x de kg / x de producción):',await p.$$eval('#view-pedidos .ped',x=>[...new Set(x.map(e=>Math.round(e.querySelector('.col-kg').getBoundingClientRect().right)+'/'+Math.round(e.querySelector('.col-prod').getBoundingClientRect().left)))].join(' ')));
await (await p.$('#view-pedidos .dia-ped')).screenshot({path:SP+'/columnas'+w+'.png'});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
