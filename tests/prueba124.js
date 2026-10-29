// Pedidos: la nota se escribe ahí mismo (sin Editar), igual que en Logística; "+ Nota" si no tiene.
const {chromium}=require('playwright');
const P=(c,ext)=>Object.assign({cliente:c,entrega:'2026-10-30',medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'k0',corte:'PALETA',texto:'50 CAJAS'}]},ext||{});
const data={faena:{},produccion:{},config:{general:{}},privado:{clientes:{lista:[]}},pedidos:{a:P('MAFER',{nota:'ENVIARLAS COMO ESTÉN'}),b:P('CRUDI')}};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-29T10:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);
const abrir=async id=>{if(!(await p.locator('[data-ped="'+id+'"].abierto').count())){await p.click('[data-act="ped-abrir"][data-id="'+id+'"] .nom');await p.waitForTimeout(150);}};
await abrir('a');const ta=p.locator('textarea[data-nota-ped="a"]');await ta.fill('ENVIARLAS COMO ESTÉN, LLAMAR ANTES');await ta.press('Enter');await p.clock.runFor(800);await p.waitForTimeout(300);
console.log(w,'nota MAFER:',await p.evaluate(()=>window.__mock.data.pedidos.a.nota));
await abrir('b');await p.click('[data-act="nota-abrir"][data-id="b"]');await p.waitForTimeout(150);const tb=p.locator('textarea[data-nota-ped="b"]');await tb.fill('SIN HUESO');await tb.press('Enter');await p.clock.runFor(800);await p.waitForTimeout(300);
console.log(w,'nota CRUDI nueva:',await p.evaluate(()=>window.__mock.data.pedidos.b.nota));
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
