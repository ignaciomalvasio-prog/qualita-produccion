// Pedidos tildados: pasar a otro día, borrar con doble confirmación y recuperar con Deshacer / Borrados recientes.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-20',L='2026-10-19';
const K=(k,corte,texto)=>({k,corte,texto});
const P=(c,m,cortes,ext)=>Object.assign({cliente:c,entrega:F,medias:m||0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:cortes||[]},ext||{});
const data={privado:{clientes:{lista:[]}},config:{general:{}},
 faena:{[L]:{desde:L,stockInicial:null,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[{origen:'X',propios:100,usuarios:0}],clientes:i===0?[{cliente:'ALBERTO BRAVO',cant:2,pedido:'a'}]:[]}))}},
 produccion:{[F]:{medias:0,mercado:'',estado:'borrador',cortes:[{corte:'BONDIOLA',lineas:[{t:'4 CAJAS BONDIOLA “ALBERTO BRAVO”',p:'a',ck:'k0'},{t:'2 CAJAS BONDIOLA “OTRO”',p:'z'}]}]}},
 pedidos:{a:P('ALBERTO BRAVO',4,[K('k0','BONDIOLA','4 CAJAS BONDIOLA')],{frio:'CONGELADO'}),b:P('DOS DE FIERRO',0,[K('k0','PECHO','10 CAJAS PECHO')]),c:P('WAL ROM',0,[K('k0','JAMON','5 CAJAS JAMON')]),d:P('PROSPITTI',2)}};
(async()=>{const b=await chromium.launch();
for(const w of [1280,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
let dialogo='aceptar',vistos=[];p.on('dialog',d=>{vistos.push(d.message().split('\n')[0]);dialogo==='aceptar'?d.accept():d.dismiss();});
await p.clock.install({time:new Date('2026-10-20T13:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForTimeout(200);
if(!(await p.locator('#view-pedidos .ped').count())){await p.click('[data-act="pd"][data-d="-1"]');await p.waitForTimeout(150);}
const tildar=async c=>{await p.locator('#view-pedidos .ped',{hasText:c}).locator('input[data-sel]').check();await p.waitForTimeout(80);};
const lista=()=>p.$$eval('#view-pedidos .ped .nom',x=>x.map(e=>e.textContent).join(', '));
console.log(w,'al empezar:',await lista());
// 1) pasar 2 al jueves
await tildar('WAL ROM');await tildar('PROSPITTI');
await p.screenshot({path:SP+'/tildados'+w+'.png'});
await p.selectOption('#sel-mover','2026-10-22');await p.clock.runFor(2000);await p.waitForTimeout(300);
console.log(w,'pasados:',await p.evaluate(()=>['c','d'].map(k=>window.__mock.data.pedidos[k].entrega).join(',')),'· quedan hoy:',await lista());
// 2) borrar: cancelar en el diálogo
await tildar('ALBERTO BRAVO');await tildar('DOS DE FIERRO');
await p.click('[data-act="sel-borrar"]');await p.waitForTimeout(80);
console.log(w,'1er toque:',await p.locator('[data-act="sel-borrar"]').innerText());
dialogo='cancelar';await p.click('[data-act="sel-borrar"]');await p.clock.runFor(1000);await p.waitForTimeout(200);
console.log(w,'cancelado → siguen:',await lista(),'· pregunta:',vistos.slice(-1)[0]);
// 3) borrar de verdad
dialogo='aceptar';await p.click('[data-act="sel-borrar"]');await p.waitForTimeout(80);await p.click('[data-act="sel-borrar"]');await p.clock.runFor(2000);await p.waitForTimeout(300);
console.log(w,'borrados → quedan:',await lista()||'(ninguno)','· producción:',await p.evaluate(()=>JSON.stringify(window.__mock.data.produccion['2026-10-20'].cortes.map(c=>c.lineas.map(l=>l.p)))),'· medias:',await p.evaluate(()=>window.__mock.data.faena['2026-10-19'].dias[0].clientes.map(c=>c.cliente).join(',')||'-'));
console.log(w,'aviso:',(await p.locator('.deshacer').innerText()).replace(/\s+/g,' '));
await p.screenshot({path:SP+'/deshacer'+w+'.png',fullPage:true});
// 4) deshacer
await p.click('.deshacer [data-act="pap-recuperar"]');await p.clock.runFor(2500);await p.waitForTimeout(400);
console.log(w,'recuperados:',await lista(),'· producción:',await p.evaluate(()=>JSON.stringify(window.__mock.data.produccion['2026-10-20'].cortes.map(c=>c.lineas.map(l=>l.p+'/'+(l.ck||''))))),'· medias:',await p.evaluate(()=>window.__mock.data.faena['2026-10-19'].dias[0].clientes.map(c=>c.cliente+' '+c.cant).join(',')),'· papelera:',await p.evaluate(()=>window.__mock.data.privado.papelera.items.length));
console.log(w,'en producción ALBERTO:',(await p.locator('#view-pedidos .ped',{hasText:'ALBERTO BRAVO'}).locator('.col-prod').innerText()).trim());
// 5) borrar 1 y recuperar desde "Borrados recientes" después de recargar
await p.locator('#view-pedidos .ped',{hasText:'DOS DE FIERRO'}).locator('[data-act="ped-abrir"] .nom').click();await p.waitForTimeout(100);
await p.click('.ped.abierto [data-act="ped-borrar"]');await p.click('.ped.abierto [data-act="ped-borrar"]');await p.clock.runFor(1500);await p.waitForTimeout(200);
await p.click('.deshacer [data-act="pap-cerrar"]');await p.waitForTimeout(100);
await p.click('#pap-det summary');await p.waitForTimeout(100);
console.log(w,'borrados recientes:',(await p.locator('ul.pap').innerText()).replace(/\s+/g,' '));
await p.click('ul.pap [data-act="pap-recuperar"]');await p.clock.runFor(2000);await p.waitForTimeout(300);
console.log(w,'después de recuperar:',await lista());
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
