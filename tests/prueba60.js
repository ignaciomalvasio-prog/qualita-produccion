// Logística: cada renglón que empieza con un número tiene un selector KG / CAJAS / UNIDADES que reescribe el texto,
// recalcula los kilos y actualiza el renglón en producción si ya estaba.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-19';
const K=(k,corte,texto)=>({k,corte,texto});
const data={faena:{},config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'BRINGAS EZEQUIEL 710',hora:'05:00',orden:['a']}],pedidos:[]}},privado:{clientes:{lista:[]}},
 produccion:{[F]:{medias:0,mercado:0,estado:'borrador',cortes:[{corte:'JAMON',lineas:[{t:'20 JAMON 4 MUSC (COD 341) “DINO 60 CUADRAS”',p:'a',ck:'k0'}]}]}},
 pedidos:{a:{cliente:'DINO 60 CUADRAS',entrega:F,medias:0,peso:'',nota:'SON KG',origen:'manual',kg:'',camion:'c1',cuenta:'',
  cortes:[K('k0','JAMON','20 JAMON 4 MUSC (COD 341)'),K('k1','CARRE','60 CARRE C/HUESO S/SOL (COD 271)'),K('k2','BONDIOLA','4 CAJAS BONDIOLA'),K('k3','CHORIZO','CHORIZO A CONFIRMAR')]}}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-16T12:00:00-03:00')});
await p.addInitScript(d=>{window.print=()=>{};window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForSelector('#view-logistica .nav');
for(let k=0;k<3&&!(await p.locator('.log-ped').count());k++){await p.click('[data-act="fl"][data-d="1"]');await p.waitForTimeout(100);}
const kg=async()=>(await p.locator('.log-ped',{hasText:'DINO'}).locator('.log-cab .small').innerText());
console.log(w,'selectores:',await p.locator('.log-ped select.uni').count(),'(esperado 3) · valores:',await p.$$eval('.log-ped select.uni',s=>s.map(x=>x.value||'?').join(',')),'· kg:',await kg());
await p.screenshot({path:SP+'/uni-antes'+w+'.png',fullPage:true});
await p.selectOption('.log-ped select.uni[data-k="k0"]','kg');await p.clock.runFor(1500);await p.waitForTimeout(200);
await p.selectOption('.log-ped select.uni[data-k="k1"]','cajas');await p.clock.runFor(1500);await p.waitForTimeout(200);
await p.selectOption('.log-ped select.uni[data-k="k2"]','und');await p.clock.runFor(1500);await p.waitForTimeout(200);
console.log(w,'pedido:',await p.evaluate(()=>window.__mock.data.pedidos.a.cortes.map(c=>c.texto).join(' / ')));
console.log(w,'kg:',await kg(),'· producción:',await p.evaluate(()=>JSON.stringify(window.__mock.data.produccion['2026-10-19'].cortes.map(c=>c.lineas.map(l=>l.t+'@'+l.p+'/'+l.ck)))));
await p.screenshot({path:SP+'/uni-despues'+w+'.png',fullPage:true});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');
// Link para compartir: sin selectores.
const q=await b.newPage({viewport:{width:w,height:900}});await q.clock.install({time:new Date('2026-10-16T12:00:00-03:00')});
await q.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await q.goto('http://127.0.0.1:8765/logistica.html');await q.clock.runFor(1500);await q.waitForTimeout(300);
for(let k=0;k<3&&!(await q.locator('.log-ped').count());k++){await q.click('[data-act="fl"][data-d="1"]').catch(()=>{});await q.waitForTimeout(100);}
console.log(w,'link compartido, selectores:',await q.locator('select.uni').count());}
await b.close();})();
