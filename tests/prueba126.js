// Pedidos: botón "✕ Sacar" al lado del camión de cada cliente, para sacarlo del camión directo.
const {chromium}=require('playwright');const F='2026-10-30';
const P=(c,cam,m)=>({cliente:c,entrega:F,medias:m||0,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cuenta:'',cortes:[{k:'k0',corte:'PECHO',texto:'20 KG'}]});
const cams=[{id:'c1',nombre:'LUCAS HEREDIA',hora:'',kg:0,orden:['a','b']}];
const ped={a:P('CYRE SA','c1'),b:P('MAFER','c1'),c:P('GRION','')};
const data={faena:{},produccion:{},privado:{},config:{general:{},['log-'+F]:{fecha:F,camiones:cams,pedidos:Object.keys(ped).map(k=>Object.assign({id:k},ped[k]))}},pedidos:ped};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-29T17:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForTimeout(200);
console.log(w,'botones Sacar:',await p.locator('[data-act="camp-sacar"]').count(),'(GRION sin camión no tiene)');
await p.click('[data-act="camp-sacar"][data-id="b"]');await p.clock.runFor(800);await p.waitForTimeout(300);
console.log(w,'MAFER camión:',JSON.stringify(await p.evaluate(()=>window.__mock.data.pedidos.b.camion)),'· CYRE sigue:',await p.evaluate(()=>window.__mock.data.pedidos.a.camion),'· abierto:',await p.locator('[data-ped="b"].abierto').count());
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
