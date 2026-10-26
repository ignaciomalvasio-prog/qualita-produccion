// Logística, Resumen del día: "PDF por WhatsApp" arma el PDF del resumen (todos, o solo los tildados).
const {chromium}=require('playwright');const SP=process.argv[2];const F='2026-10-26';
const P=(c,cam,m,cs,frio)=>({cliente:c,entrega:F,medias:m,peso:'',nota:'',origen:'manual',kg:'',camion:cam,cuenta:'',frio:frio||'',cortes:cs?[{corte:'JAMON',texto:'100KG',orden:true}]:[]});
const cams=[{id:'c1',nombre:'SEMI DOLCI',hora:'00:00',kg:0,orden:['a']},{id:'c2',nombre:'MAXIMO (PRIMER VIAJE)',hora:'02:00',kg:0,orden:['b']},{id:'c3',nombre:'LAGUI',hora:'04:00',kg:0,orden:['c','d']}];
const ped={a:P('DON PEDRO','c1',320),b:P('NOVICERD','c2',84),c:P('ALICAN','c3',0,1),d:P('GANADOS','c3',20,0,'CONGELADO')};
const data={faena:{},produccion:{},privado:{},config:{general:{},['log-'+F]:{fecha:F,camiones:cams,pedidos:Object.keys(ped).map(k=>Object.assign({id:k},ped[k]))}},pedidos:ped};
const fs=require('fs');const {execSync}=require('child_process');
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-23T18:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);
 await p.fill('#l-fecha',F);await p.locator('#l-fecha').dispatchEvent('change');await p.waitForTimeout(300);
 await p.click('[data-act="resumen"]');await p.waitForTimeout(200);
 const pdf=async(tag)=>{await p.evaluate(()=>{delete window.__mock.ultimoPDF;});await p.click('[data-act="res-pdf"]');await p.waitForFunction(()=>window.__mock.ultimoPDF,null,{timeout:15000});
  const r=await p.evaluate(async()=>{const a=new Uint8Array(await window.__mock.ultimoPDF.blob.arrayBuffer());let s='';a.forEach(x=>s+=String.fromCharCode(x));return {n:window.__mock.ultimoPDF.nombre,b:btoa(s)};});
  fs.writeFileSync(SP+'/res-'+tag+'.pdf',Buffer.from(r.b,'base64'));console.log(w,tag,r.n,'\n'+execSync('pdftotext -layout '+SP+'/res-'+tag+'.pdf -').toString().trim());};
 await pdf('todos');
 await p.locator('[data-res-sel="c3"]').check();await p.waitForTimeout(150);console.log(w,'botón:',await p.locator('[data-act="res-pdf"]').innerText());
 await pdf('uno');
 console.log(w,'desborde:',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
