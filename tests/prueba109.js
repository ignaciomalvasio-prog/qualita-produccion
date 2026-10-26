// Medias (vista del día): "PDF por WhatsApp" arma el PDF de los animales para clientes.
const {chromium}=require('playwright');const SP=process.argv[2];const fs=require('fs');const {execSync}=require('child_process');
const L='2026-10-26';const dia=(cl)=>({propios:600,usuarios:0,clientes:cl});
const sem={id:L,desde:L,dias:[dia([{cliente:'DON PEDRO',cant:150}]),dia([{cliente:'JMC',cant:30},{cliente:'COLAZO',cant:5,nota:'LIVIANAS'},{cliente:'DIGAR',cant:125}]),dia([]),dia([]),dia([])]};
const data={faena:{[L]:sem},produccion:{},privado:{},config:{general:{}},pedidos:{}};
(async()=>{const b=await chromium.launch();const errs=[];
 for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-26T20:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#medias');await p.clock.runFor(1500);
 const m=p.locator('[data-act="m-dia"]');if(await m.count())await m.click();await p.waitForTimeout(200);
 await p.click('[data-act="fm-ir"][data-f="2026-10-27"]');await p.waitForTimeout(200);
 await p.click('[data-act="m-pdf"]');await p.waitForFunction(()=>window.__mock.ultimoPDF,null,{timeout:15000});
 const r=await p.evaluate(async()=>{const a=new Uint8Array(await window.__mock.ultimoPDF.blob.arrayBuffer());let s='';a.forEach(x=>s+=String.fromCharCode(x));return {n:window.__mock.ultimoPDF.nombre,b:btoa(s)};});
 fs.writeFileSync(SP+'/medias.pdf',Buffer.from(r.b,'base64'));console.log(w,r.n,'\n'+execSync('pdftotext -layout '+SP+'/medias.pdf -').toString().trim());
 console.log(w,'desborde:',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
 console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
