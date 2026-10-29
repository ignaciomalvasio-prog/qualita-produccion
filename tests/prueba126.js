// Pedidos vacíos (sin medias y sin cortes con cantidad, o todo en 0): no se muestran, no se guardan y "Guardar todos" los descarta.
const {chromium}=require('playwright');
const P=(c,ext)=>Object.assign({cliente:c,entrega:'2026-10-30',medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[]},ext||{});
const data={faena:{},produccion:{},config:{general:{}},privado:{clientes:{lista:[]}},pedidos:{a:P('VACIO SA'),b:P('CERO SRL',{cortes:[{k:'k0',corte:'PECHO',texto:'0 KG'}]}),c:P('MAFER',{cortes:[{k:'k0',corte:'PALETA',texto:'50 CAJAS'}]}),d:P('MEDIAS SOLO',{medias:10})}};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-29T10:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);
console.log(w,'en Pedidos:',(await p.locator('#view-pedidos .ped .nom').allInnerTexts()).join(', '));
await p.click('[data-act="q-nuevo"]');await p.fill('#q0cliente','NUEVO VACIO');await p.locator('#q0cliente').dispatchEvent('input');
await p.click('[data-act="q-guardar"][data-q="0"]');await p.clock.runFor(800);await p.waitForTimeout(200);
console.log(w,'guardar vacío →',(await p.locator('#view-pedidos .card .neg').first().innerText().catch(()=>'(sin aviso)')),'· guardados:',await p.evaluate(()=>Object.keys(window.__mock.data.pedidos).length));
await p.click('[data-act="q-nuevo"]');await p.fill('#q1cliente','OTRO');await p.locator('#q1cliente').dispatchEvent('input');await p.fill('#q1medias','4');await p.locator('#q1medias').dispatchEvent('input');
await p.click('[data-act="q-todos"]');await p.clock.runFor(800);await p.waitForTimeout(300);
console.log(w,'Guardar todos → quedan para cargar:',await p.locator('#view-pedidos .carga .card').count(),'· guardados:',await p.evaluate(()=>Object.values(window.__mock.data.pedidos).map(x=>x.cliente).join(', ')));
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
