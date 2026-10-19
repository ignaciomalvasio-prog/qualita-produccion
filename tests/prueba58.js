const {chromium}=require('playwright');const SP=process.argv[2];
const P=(c,cam,m,ext)=>Object.assign({cliente:c,entrega:'2026-10-19',medias:m||0,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cuenta:'',cortes:[]},ext||{});
const data={faena:{},produccion:{},config:{general:{},'log-2026-10-19':{fecha:'2026-10-19',camiones:[{id:'c1',nombre:'MAXIMO 1',hora:'02:00',orden:['a','b']}],pedidos:[]}},privado:{clientes:{lista:[]}},
 pedidos:{a:P('QUALITA EXPRESS','c1',0,{cortes:[{k:'k0',corte:'BONDIOLA',texto:'4 CANASTOS BONDIOLA (COD 101)'},{k:'k1',corte:'PECHO',texto:'100KG COSTILLA'}]}),b:P('URCA','c1',10)}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-16T12:00:00-03:00')});
await p.addInitScript(d=>{window.print=()=>{};window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForSelector('#view-logistica .nav');
for(let k=0;k<3&&!(await p.locator('.cam').count());k++){await p.click('[data-act="fl"][data-d="1"]');await p.waitForTimeout(100);}
await p.locator('.log-ped',{hasText:'QUALITA EXPRESS'}).locator('[data-act="log-editar"]').click();await p.waitForTimeout(100);
console.log(w,'editor abierto:',await p.locator('#view-logistica .log-edit textarea').count(),'textareas · foco en',await p.evaluate(()=>document.activeElement.id));
await p.screenshot({path:SP+'/logedit'+w+'.png',fullPage:true});
await p.fill('#view-logistica .log-edit textarea >> nth=0','6 CANASTOS BONDIOLA (COD 101)');await p.locator('#view-logistica .log-edit textarea >> nth=0').dispatchEvent('input');
await p.click('#view-logistica .log-edit [data-act="q-guardar"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'guardado:',await p.evaluate(()=>window.__mock.data.pedidos.a.cortes.map(c=>c.texto).join(' / ')),'· log:',await p.evaluate(()=>window.__mock.data.config['log-2026-10-19'].pedidos.find(x=>x.id==='a').cortes.map(c=>c.texto).join(' / ')),'· sigue en camión:',await p.evaluate(()=>window.__mock.data.pedidos.a.camion));
console.log(w,'editor cerrado:',await p.locator('#view-logistica .log-edit').count(),'· vista:',(await p.locator('.log-ped',{hasText:'QUALITA EXPRESS'}).innerText()).replace(/\s+/g,' ').slice(0,140));
await p.locator('.log-ped',{hasText:'URCA'}).locator('[data-act="log-editar"]').click();await p.click('#view-logistica .log-edit [data-act="q-descartar"]');await p.waitForTimeout(100);
console.log(w,'cancelar:',await p.locator('#view-logistica .log-edit').count(),'· desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
