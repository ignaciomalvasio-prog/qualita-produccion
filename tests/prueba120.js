// Logística, Resumen: teléfono de cada chofer; el botón WhatsApp del camión abre directo su chat (y se guarda en privado/choferes).
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
 await p.click('[data-act="resumen"]');await p.waitForTimeout(200);
 await p.click('[data-act="res-tels"]');await p.waitForTimeout(200);
 console.log(w,'choferes para cargar:',(await p.locator('.res-tels input').evaluateAll(l=>l.map(x=>x.dataset.tel))).join(', '));
 await p.fill('.res-tels input[data-tel="MAXIMO"]','0351 15 123-4567');await p.locator('.res-tels input[data-tel="MAXIMO"]').dispatchEvent('change');await p.waitForTimeout(300);
 console.log(w,'guardado:',JSON.stringify(await p.evaluate(()=>window.__mock.data.privado.choferes)),'· en el log público:',await p.evaluate(()=>JSON.stringify(window.__mock.data.config).includes('123-4567')));
 console.log(w,'botones:',(await p.locator('.res-wa-uno').allInnerTexts()).join(' | '));
 await p.locator('.res-cam',{hasText:'MAXIMO'}).locator('.res-wa-uno').click();await p.waitForTimeout(200);
 console.log(w,'WhatsApp a:',await p.evaluate(()=>window.__mock.waTel),'· texto:',(await p.evaluate(()=>window.__mock.compartido)).replace(/\n/g,' / ').slice(0,90));
 await p.locator('.res-cam',{hasText:'LAGUI'}).locator('.res-wa-uno').click();await p.waitForTimeout(200);
 console.log(w,'sin teléfono:',JSON.stringify(await p.evaluate(()=>window.__mock.waTel)));
 console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'errores',errs.join('|')||'ninguno');await p.close();}
await b.close();})();
