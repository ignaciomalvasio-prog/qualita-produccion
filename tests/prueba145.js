// Pedidos: pasar un camión entero (con sus clientes, horario y orden) a otro día desde su ⋯.
const {chromium}=require('playwright');const F='2026-11-09',G='2026-11-11';
const P=(c,cam,m)=>({cliente:c,entrega:F,medias:m||0,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cuenta:'',cortes:[{k:'1',corte:'PECHO',texto:'2 CAJAS'}]});
const ped={a:P('CHARCUT','c1'),b:P('MAIDANA','c1',70),c:P('OTRO','c2')};
const data={faena:{},produccion:{},privado:{},config:{general:{}, ['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'SEBA DIAZ (AGRALE)',hora:'04:30',kg:9000,orden:['b','a']},{id:'c2',nombre:'LAGUI',orden:['c']}],pedidos:Object.keys(ped).map(k=>Object.assign({id:k},ped[k]))}},pedidos:ped};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-11-06T13:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForTimeout(200);
await p.evaluate(F=>{const i=document.querySelector('.nav-ped input[type=date]');i.value=F;i.dispatchEvent(new Event('change',{bubbles:true}));},F);await p.waitForTimeout(300);
await p.click('.grupo-cam[data-gcam="c1"] .mas-btn');await p.waitForTimeout(150);
await p.click('select[data-cam-dia="c1"]');await p.waitForTimeout(100);
console.log('menú sigue abierto:',await p.locator('select[data-cam-dia="c1"]').count());
await p.selectOption('select[data-cam-dia="c1"]',G);await p.clock.runFor(3000);await p.waitForTimeout(600);
const d=await p.evaluate(()=>window.__mock.data);
console.log('pedidos:',['a','b','c'].map(k=>k+'='+d.pedidos[k].entrega+'/'+d.pedidos[k].camion).join(' '));
console.log('día viejo:',(d.config['log-2026-11-09'].camiones||[]).map(c=>c.nombre).join(','),'· día nuevo:',(d.config['log-2026-11-11']?.camiones||[]).map(c=>c.nombre+' '+(c.hora||'')+' '+(c.kg||'')+' ['+(c.orden||[]).join('')+']').join(','));
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
