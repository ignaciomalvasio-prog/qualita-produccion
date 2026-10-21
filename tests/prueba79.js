// Link para compartir Medias (/medias): solo los animales para clientes del día, de solo lectura, aunque quien lo abra sea editor.
const {chromium}=require('playwright');const SP=process.argv[2];
const L='2026-10-19';
const data={privado:{clientes:{lista:[]}},config:{general:{}},produccion:{},pedidos:{},
 faena:{[L]:{desde:L,stockInicial:500,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[{origen:'CANDELARIA',propios:160,usuarios:0}],clientes:i===1?[{cliente:'NOVICERD',cant:50},{cliente:'MOLINA S.J',cant:50},{cliente:'JMC',cant:25}]:[]}))}}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-20T10:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/medias.html');await p.clock.runFor(1500);await p.waitForTimeout(400);
const t=(await p.locator('#view-medias').innerText()).replace(/\s+/g,' ');
console.log(w,'título:',await p.title(),'· solapas visibles:',await p.locator('#tabs').isVisible(),'· inputs editables:',await p.locator('#view-medias input:not([type=date])').count(),'· botones editar:',await p.locator('[data-act="m-editar"],[data-act="m-semana"],[data-act="link-medias"],[data-act="pf-abrir"]').count());
console.log(w,'contenido:',t.slice(0,220));
await p.screenshot({path:SP+'/link-medias'+w+'.png',fullPage:true});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
// en la app, el editor tiene el botón para copiar el link
const q=await b.newPage({viewport:{width:1100,height:800}});await q.clock.install({time:new Date('2026-10-20T10:00:00-03:00')});
await q.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await q.goto('http://127.0.0.1:8765/index.html#medias');await q.clock.runFor(1500);await q.waitForTimeout(300);
console.log('botón en la app:',await q.locator('[data-act="link-medias"]').count());
await b.close();})();
