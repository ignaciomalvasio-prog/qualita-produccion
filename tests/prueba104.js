// Logística, Resumen del día: tildar camiones y compartirlos por WhatsApp (los elegidos o todos).
const {chromium}=require('playwright');const SP=process.argv[2];const F='2026-10-26';
const P=(c,cam,m,cs,frio)=>({cliente:c,entrega:F,medias:m,peso:'',nota:'',origen:'manual',kg:'',camion:cam,cuenta:'',frio:frio||'',cortes:cs?[{corte:'JAMON',texto:'100KG',orden:true}]:[]});
const cams=[{id:'c1',nombre:'SEMI DOLCI',hora:'00:00',kg:0,orden:['a']},{id:'c2',nombre:'MAXIMO (PRIMER VIAJE)',hora:'02:00',kg:0,orden:['b']},{id:'c3',nombre:'LAGUI',hora:'04:00',kg:0,orden:['c','d']}];
const ped={a:P('DON PEDRO','c1',320),b:P('NOVICERD','c2',84),c:P('ALICAN','c3',0,1),d:P('GANADOS','c3',20,0,'CONGELADO')};
const data={faena:{},produccion:{},privado:{},config:{general:{},['log-'+F]:{fecha:F,camiones:cams,pedidos:Object.keys(ped).map(k=>Object.assign({id:k},ped[k]))}},pedidos:ped};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-23T18:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);
 await p.fill('#l-fecha',F);await p.locator('#l-fecha').dispatchEvent('change');await p.waitForTimeout(300);
 await p.click('[data-act="resumen"]');await p.waitForSelector('.res-comp');
 console.log('=== ',w,'barra:',(await p.locator('.res-comp').innerText()).replace(/\s+/g,' '));
 await p.check('input[data-res-sel="c1"]');await p.check('input[data-res-sel="c3"]');await p.waitForTimeout(100);
 console.log('con 2 tildados:',await p.locator('[data-act="res-wa"][data-cual="sel"]').innerText());
 await p.click('[data-act="res-wa"][data-cual="sel"]');console.log('mensaje elegidos:\n'+await p.evaluate(()=>window.__mock.compartido));
 await p.click('[data-act="res-wa"][data-cual="todos"]');console.log('todos → camiones:',await p.evaluate(()=>(window.__mock.compartido.match(/🚚/g)||[]).length));
 if(w===400)await p.screenshot({path:SP+'/resumen-wa.png',fullPage:false});
 console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');}
await b.close();})();
