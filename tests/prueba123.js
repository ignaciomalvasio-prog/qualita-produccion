// Los que no tienen camión se ven en el link público de Logística (solo mirar) y el bloqueo con PIN tapa toda la pantalla en la compu.
const {chromium}=require('playwright');const SP=process.argv[2];const F='2026-10-26';
const P=(c,cam,m,cs,frio)=>({cliente:c,entrega:F,medias:m,peso:'',nota:'',origen:'manual',kg:'',camion:cam,cuenta:'',frio:frio||'',cortes:cs?[{corte:'JAMON',texto:'100KG',orden:true}]:[]});
const cams=[{id:'c1',nombre:'SEMI DOLCI',hora:'00:00',kg:0,orden:['a']},{id:'c2',nombre:'MAXIMO (PRIMER VIAJE)',hora:'02:00',kg:0,orden:['b']},{id:'c3',nombre:'LAGUI',hora:'04:00',kg:0,orden:['c','d']}];
const ped={a:P('DON PEDRO','c1',320),b:P('NOVICERD','c2',84),c:P('ALICAN','c3',0,1),d:P('GANADOS','c3',20,0,'CONGELADO'),e:P('GRION','',0,1),g:P('CYRE SA','',10)};
const data={faena:{},produccion:{},privado:{},config:{general:{},['log-'+F]:{fecha:F,camiones:cams,pedidos:Object.keys(ped).map(k=>Object.assign({id:k},ped[k]))}},pedidos:ped};
(async()=>{const b=await chromium.launch();
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-23T18:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);
 await p.fill('#l-fecha',F);await p.locator('#l-fecha').dispatchEvent('change');await p.waitForTimeout(300);
 await p.click('[data-act="resumen"]');await p.waitForTimeout(200);
 console.log(w,'Resumen sin camión sin botón:',await p.locator('.res-cam',{hasText:'Sin camión'}).locator('[data-act="res-wa"]').count());
 // Link público (solo mirar): también se ven los que no tienen camión.
 const pub=await b.newPage({viewport:{width:w,height:900}});await pub.clock.install({time:new Date('2026-10-23T18:00:00-03:00')});
 await pub.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d))}},data);
 await pub.goto('http://127.0.0.1:8765/logistica.html');await pub.clock.runFor(1500);await pub.fill('#l-fecha',F).catch(()=>{});await pub.locator('#l-fecha').dispatchEvent('change').catch(()=>{});await pub.waitForTimeout(300);
 const st=await pub.locator('section.cam.suelto').innerText().catch(()=>'(no está)');
 console.log(w,'link público, Sin camión:',st.replace(/\s+/g,' ').slice(0,80),'· inputs para editar:',await pub.locator('#view-logistica input[type=number], #view-logistica input[type=checkbox]').count());await pub.close();
 // PIN: el bloqueo tapa toda la pantalla
 await p.evaluate(()=>{localStorage.setItem('qualita-pin','x')});await p.reload();await p.clock.runFor(1500);await p.waitForTimeout(300);
 const r=await p.evaluate(()=>{const e=document.getElementById('pin-lock');if(!e)return 'sin bloqueo';const b=e.getBoundingClientRect();return getComputedStyle(e).position+' '+Math.round(b.width)+'x'+Math.round(b.height)+' (pantalla '+innerWidth+'x'+innerHeight+')';});
 console.log(w,'bloqueo:',r);await p.evaluate(()=>localStorage.removeItem('qualita-pin'));
 console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'errores',errs.join('|')||'ninguno');await p.close();}
await b.close();})();
