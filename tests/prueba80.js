// Pedidos: el cartelito de fresco / congelado del renglón se toca y se elige Fresco, Congelado o Sin aclarar; se guarda en el pedido.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-21';
const K=(k,corte,texto)=>({k,corte,texto});
const P=(c,frio,cortes)=>({cliente:c,entrega:F,medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',frio:frio,cortes:cortes||[]});
const data={faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:0,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[],clientes:[]}))}},privado:{clientes:{lista:[]}},config:{general:{}},
 produccion:{[F]:{medias:0,mercado:'',estado:'borrador',cortes:[{corte:'PECHO',lineas:[{t:'5 CAJAS PECHO “CRUDI”',p:'a',ck:'k0',f:'FRESCO'}]}]}},
 pedidos:{a:Object.assign(P('CRUDI','FRESCO',[K('k0','PECHO','5 CAJAS PECHO'),Object.assign(K('k1','JAMON','2 CAJAS JAMON'),{precio:4200,iva:'iva'})]),{cuenta:'21305'}),b:P('ROVER','',[K('k0','BONDIOLA','2 CAJAS BONDIOLA')])}};
(async()=>{const b=await chromium.launch();
for(const w of [1280,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-20T13:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForSelector('#view-pedidos .ped');
const chips=()=>p.$$eval('.frio-chip',x=>x.map(e=>e.textContent).join(' | '));
console.log(w,'chips:',await chips());
await p.locator('.ped',{hasText:'CRUDI'}).locator('.frio-chip').click();await p.waitForTimeout(150);
console.log(w,'menú:',(await p.locator('.frio-menu').innerText()).replace(/\s+/g,' '),'· se abrió el pedido:',await p.locator('.ped.abierto').count());
await p.screenshot({path:SP+'/friomenu'+w+'.png'});
await p.click('.frio-menu [data-act="frio-set"][data-v="CONGELADO"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
const a=await p.evaluate(()=>window.__mock.data.pedidos.a);
console.log(w,'CRUDI:',a.frio,'· precio jamón sigue:',a.cortes[1].precio,a.cortes[1].iva,'· en producción:',await p.evaluate(()=>window.__mock.data.produccion['2026-10-21'].cortes.map(c=>c.lineas.map(l=>l.t+'/'+(l.f||'')).join(';')).join(' | ')),'· chips:',await chips());
await p.locator('.ped',{hasText:'ROVER'}).locator('.frio-chip').click();await p.waitForTimeout(100);await p.click('.frio-menu [data-act="frio-set"][data-v="FRESCO"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'ROVER:',await p.evaluate(()=>window.__mock.data.pedidos.b.frio),'· chips:',await chips());
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
