// Pedidos: tildo un cliente, lo mando a un camión (menú del renglón o camión nuevo con Enter) y queda destildado.
const {chromium}=require('playwright');const F='2026-11-06';
const P=(c,cam)=>({cliente:c,entrega:F,medias:20,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cuenta:'',cortes:[]});
const ped={a:P('GANADOS'),b:P('HONORIO'),c:P('NOVICERD','c1')};
const data={faena:{},produccion:{},privado:{},config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'LAGUI',orden:['c']}],pedidos:Object.keys(ped).map(k=>Object.assign({id:k},ped[k]))}},pedidos:ped};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-11-05T14:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForTimeout(200);
await p.check('input[data-sel="a"]');await p.waitForTimeout(150);
await p.click('[data-act="camp-menu"][data-id="a"]');await p.waitForTimeout(150);
await p.click('[data-act="camp-set"][data-id="a"][data-v="d:c1"]');await p.clock.runFor(800);await p.waitForTimeout(300);
console.log('a en camión:',await p.evaluate(()=>window.__mock.data.pedidos.a.camion),'· tildados:',await p.locator('input[data-sel]:checked').count());
await p.check('input[data-sel="b"]');await p.waitForTimeout(150);
await p.click('[data-act="camp-menu"][data-id="b"]');await p.waitForTimeout(150);
await p.fill('#camp-nombre-b','nuevo');await p.locator('#camp-nombre-b').press('Enter');await p.clock.runFor(800);await p.waitForTimeout(300);
console.log('b en camión:',!!await p.evaluate(()=>window.__mock.data.pedidos.b.camion),'· tildados:',await p.locator('input[data-sel]:checked').count());
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
