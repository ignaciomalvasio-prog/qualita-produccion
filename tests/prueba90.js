// Logística: Imprimir (el día o un camión) sale como se ve, achicado lo justo para usar la menor cantidad de hojas A4 (y sin la primera hoja vacía).
const {chromium}=require('playwright');const SP=process.argv[2];const fs=require('fs');
const F='2026-10-22';const K=(k,corte,texto,precio)=>Object.assign({k,corte,texto},precio?{precio,iva:'iva'}:{});
function dia(nCam,porCam,R){const cams=[],peds=[];let id=0;
 for(let c=0;c<nCam;c++){const orden=[];for(let i=0;i<porCam;i++){const pid='p'+(id++);orden.push(pid);
  peds.push({id:pid,cliente:'CLIENTE '+pid.toUpperCase(),entrega:F,medias:i%3===0?14:0,peso:'',nota:i%4===1?'ALLEN, RIO NEGRO':'',origen:'manual',kg:400+i*50,camion:'c'+c,frio:i%2?'CONGELADO':'FRESCO',
   cortes:(R&&i%3!==2)?[]:i%3===0?[]:[K('k0','CARRE','15 CAJAS CARRE CON HUESO CONGELADO',5200),K('k1','PECHO','15 CAJAS PECHITO CON HUESO'),K('k2','MATAMBRE','30 CAJAS MATAMBRE CONGELADAS')]});}
  cams.push({id:'c'+c,nombre:['SURFRIGO (RETIRA EN PLANTA)','MAXIMO (PRIMER VIAJE)','SEMI PASSERI 1','CHAVEZ','LOVAIZA 1','JMC (RETIRA EN PLANTA)','SEBA DIAZ (AGRALE)','MOREIRA','LAGUI','BRINGAS','DIGAR','COTO'][c%12],hora:String(c).padStart(2,'0')+':00',kg:6000,orden});}
 const ped={};peds.forEach(p=>{const q=Object.assign({},p);delete q.id;ped[p.id]=q;});
 return {faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:0,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[],clientes:[]}))}},produccion:{},privado:{},pedidos:ped,config:{general:{},['log-'+F]:{fecha:F,camiones:cams,pedidos:[]}}};}
(async()=>{const b=await chromium.launch();
for(const [nom,data,cam] of [['dia-real',dia(12,4,true),''],['dia-grande',dia(12,4),''],['dia-chico',dia(3,3),''],['un-camion',dia(12,4),'c0']]){
const p=await b.newPage({viewport:{width:1100,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-21T17:00:00-03:00')});
await p.addInitScript(d=>{window.print=()=>{};window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForSelector('#view-logistica .nav');
await p.fill('#l-fecha',F);await p.locator('#l-fecha').dispatchEvent('change');await p.waitForSelector('.log-ped',{timeout:8000});
await p.waitForTimeout(500);await p.evaluate(c=>{if(c)document.querySelector('[data-act="menu"][data-k="cam-'+c+'"]').click();document.querySelector(c?'[data-act="cam-imprimir"][data-id="'+c+'"]':'#view-logistica .nav [data-act="imprimir"]').click();},cam);
await p.waitForFunction(()=>window.__mock.zoomImpresion,null,{timeout:20000});const zi=await p.evaluate(()=>window.__mock.zoomImpresion);
await p.pdf({path:SP+'/log-'+nom+'.pdf',preferCSSPageSize:true,printBackground:true});
await p.evaluate(()=>{document.getElementById('hoja-impresion').textContent='@page{size:A4 portrait;margin:10mm}';});await p.pdf({path:SP+'/log-'+nom+'-sin.pdf',preferCSSPageSize:true});
console.log(nom,'alto medido',zi.alto,'zoom',zi.zoom.toFixed(2));
console.log(nom,'errores:',errs.join('|')||'ninguno');}
await b.close();})();
