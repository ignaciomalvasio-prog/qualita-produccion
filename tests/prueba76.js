// Inicio "Lo que falta" y filtros rápidos en Pedidos (Sin camión, Sin producción, Sin unidad, Sin precio, Sin N°, Congelados).
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-21';
const K=(k,corte,texto,ext)=>Object.assign({k,corte,texto},ext||{});
const P=(c,m,cortes,ext)=>Object.assign({cliente:c,entrega:F,medias:m||0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:cortes||[]},ext||{});
const data={faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:null,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[{origen:'X',propios:100,usuarios:0}],clientes:[]}))}},privado:{clientes:{lista:[]}},
 produccion:{[F]:{fecha:F,medias:750,mercado:'',estado:'borrador',cortes:[{corte:'PECHO',lineas:[{t:'10 CAJAS PECHO “GRION”',p:'b',ck:'k0'}]}]}},
 config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'LAGUI',hora:'03:00',kg:1000,orden:['b','c']}],pedidos:[]}},
 pedidos:{a:P('ACHAVAL',4,[K('k0','MATAMBRE','6 CAJAS MATAMBRITOS')],{frio:'CONGELADO'}),
  b:P('GRION',0,[K('k0','PECHO','10 CAJAS PECHO',{precio:5000,iva:'iva'})],{camion:'c1',cuenta:'21128'}),
  c:P('NOVICERD',20,[],{camion:'c1',cuenta:'21337',precioMedias:3000,ivaMedias:'iva'}),
  d:P('ROVER',0,[K('k0','BONDIOLA','20 BONDIOLA',{precio:4000,iva:'iva'})],{cuenta:'21000'})}};
(async()=>{const b=await chromium.launch();
for(const w of [1280,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-20T16:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#inicio');await p.clock.runFor(1500);await p.waitForSelector('.falta');
console.log(w,'falta:',(await p.locator('.falta').innerText()).replace(/\s*›\s*/g,' | ').replace(/\s+/g,' '));
await (await p.$('.falta')).screenshot({path:SP+'/falta'+w+'.png'});
await p.click('.falta [data-v="sincam"]');await p.waitForTimeout(200);
console.log(w,'→ pedidos:',await p.locator('.nav-ped .tit').innerText(),'· filtro:',await p.locator('.filtros [aria-pressed="true"]').innerText(),'· se ven:',await p.$$eval('#view-pedidos .ped .nom',x=>x.map(e=>e.textContent).join(',')));
console.log(w,'chips:',await p.$$eval('.filtros .chip',x=>x.map(e=>e.innerText.replace(/\s+/g,' ')).join(' | ')));
await p.click('[data-act="pfil-tildar"]');await p.waitForTimeout(150);
console.log(w,'tildados:',await p.locator('.cam-barra strong').innerText());
await p.screenshot({path:SP+'/filtros'+w+'.png'});
for(const v of ['sinprod','sinuni','sinprecio','cong']){await p.click('.filtros [data-v="'+v+'"]');await p.waitForTimeout(100);console.log(w,v,'→',await p.$$eval('#view-pedidos .ped .nom',x=>x.map(e=>e.textContent).join(','))||'(ninguno)','· mover:',await p.locator('.ped-mover').count());}
await p.click('.filtros [data-v=""]');await p.waitForTimeout(100);console.log(w,'todos → mover:',await p.locator('.ped-mover').count());
await p.click('#tab-inicio');await p.waitForSelector('.falta [data-act="ini-op"]');
await p.click('.falta [data-act="ini-op"]');await p.waitForTimeout(150);console.log(w,'orden →',await p.locator('.pv-tabs [aria-selected="true"]').innerText());
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
