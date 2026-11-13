// Logística: desde los ⋯ de un camión se manda ese camión completo (como se ve) en PDF por WhatsApp.
const {chromium}=require('playwright');const SP=process.argv[2];const fs=require('fs');
const F='2026-10-22';const K=(k,corte,texto,precio)=>Object.assign({k,corte,texto},precio?{precio,iva:'iva'}:{});
function dia(nCam,porCam,R){const cams=[],peds=[];let id=0;
 for(let c=0;c<nCam;c++){const orden=[];for(let i=0;i<porCam;i++){const pid='p'+(id++);orden.push(pid);
  peds.push({id:pid,cliente:'CLIENTE '+pid.toUpperCase(),entrega:F,medias:i%3===0?14:0,peso:'',nota:i%4===1?'ALLEN, RIO NEGRO':'',origen:'manual',kg:400+i*50,camion:'c'+c,frio:i%2?'CONGELADO':'FRESCO',
   cortes:(R&&i%3!==2)?[]:i%3===0?[]:[K('k0','CARRE','15 CAJAS CARRE CON HUESO CONGELADO',5200),K('k1','PECHO','15 CAJAS PECHITO CON HUESO'),K('k2','MATAMBRE','30 CAJAS MATAMBRE CONGELADAS')]});}
  cams.push({id:'c'+c,nombre:['SURFRIGO (RETIRA EN PLANTA)','MAXIMO (PRIMER VIAJE)','SEMI PASSERI 1','CHAVEZ','LOVAIZA 1','JMC (RETIRA EN PLANTA)','SEBA DIAZ (AGRALE)','MOREIRA','LAGUI','BRINGAS','DIGAR','COTO'][c%12],hora:String(c).padStart(2,'0')+':00',kg:6000,orden});}
 const ped={};peds.forEach(p=>{const q=Object.assign({},p);delete q.id;ped[p.id]=q;});
 return {faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:0,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[],clientes:[]}))}},produccion:{},privado:{},pedidos:ped,config:{general:{},['log-'+F]:{fecha:F,camiones:cams,pedidos:[]}}};}
(async()=>{const b=await chromium.launch();const data=dia(3,3);
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-21T17:00:00-03:00')});
await p.addInitScript(d=>{window.__wa=[];window.open=(u)=>{window.__wa.push(u);return null};window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],compartirArchivos:n=>{window.__comp=n}}},data);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForSelector('#view-logistica .nav');
await p.fill('#l-fecha',F);await p.locator('#l-fecha').dispatchEvent('change');await p.waitForSelector('.log-ped',{timeout:8000});
await p.evaluate(()=>document.querySelector('[data-act="menu"][data-k="cam-c1"]').click());await p.waitForTimeout(200);
console.log(w,'menú:',await p.evaluate(()=>[...document.querySelectorAll('.menu-pop:not([hidden]) button, [data-k="cam-c1"] ~ * button')].map(x=>x.textContent).filter(Boolean).join(' | ')));
await p.evaluate(()=>document.querySelector('[data-act="cam-pdf"][data-id="c1"]').click());
await p.waitForFunction(()=>window.__mock.ultimoPDF||window.__comp,null,{timeout:15000});
const r=await p.evaluate(async()=>{const x=window.__mock.ultimoPDF;const a=new Uint8Array(await x.blob.arrayBuffer());let s='';a.forEach(c=>s+=String.fromCharCode(c));return {n:x.nombre,b:btoa(s)};});
console.log(w,'pdf:',r.n);if(SP&&w===400){require('fs').writeFileSync(SP+'/p156.pdf',Buffer.from(r.b,'base64'));require('child_process').execSync('pdftoppm -r 70 -png -f 1 -l 1 '+SP+'/p156.pdf '+SP+'/p156');}
console.log(w,'desborde:',await p.evaluate(()=>document.documentElement.scrollWidth),'errores:',errs);await p.close();}
await b.close();})();
