// Kilos por sucursal: "PDF por WhatsApp" del cuadro Total por corte y sucursal (muchas sucursales entran en una hoja).
const {chromium}=require('playwright');const SP=process.argv[2];const fs=require('fs');const {execSync}=require('child_process');
const SUC=['60 CUADRAS','ALTA GRACIA','CIRCUNVALACION','COLONIA CAROYA','DON BOSCO','DONATO','LA CALERA','LAS HERAS MDZ','MALAGUENO','ROD DEL BUSTO','RUTA 20','SALSIPUEDES','SAN MARTIN','SAN VICENTE'];
const CS=[['JAMON','60KG JAMON 4 MUSC (COD 341)'],['PECHO','160KG PECHITO CON MANTA (COD 211)'],['CARRE SIN SOLOMILLO','140KG CARRE C/HUESO S/SOL (COD 271)'],['SOLOMILLO','20KG SOLOMILLO (COD 285)'],['MATAMBRE','40KG MATAMBRE (COD 231)'],['BONDIOLA','20KG BONDIOLA (COD 101)'],['CHURRASCO','80KG CHURRASCO (COD 241)'],['CHORIZO','140KG CHORI FRESCO ESPECIAL (COD 2000)'],['MORCILLA','80KG MORCILLA']];
const ped={};SUC.forEach((s,i)=>{ped['p'+i]={cliente:'DINO '+s,entrega:i%2?'2026-10-22':'2026-10-19',medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:CS.filter((c,k)=>(i+k)%3).map(c=>({corte:c[0],texto:c[1]}))};});
const data={faena:{},produccion:{},privado:{},config:{general:{}},pedidos:ped};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1100,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-21T10:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#clientes');await p.clock.runFor(1500);
 await p.click('[data-act="rep-mz-pdf"]');await p.waitForFunction(()=>window.__mock.ultimoPDF,null,{timeout:15000});
 const r=await p.evaluate(async()=>{const a=new Uint8Array(await window.__mock.ultimoPDF.blob.arrayBuffer());let s='';a.forEach(x=>s+=String.fromCharCode(x));return {n:window.__mock.ultimoPDF.nombre,b:btoa(s)};});
 fs.writeFileSync(SP+'/mz.pdf',Buffer.from(r.b,'base64'));console.log(r.n,'· hojas:',execSync('pdfinfo '+SP+'/mz.pdf').toString().match(/Pages:\s+(\d+)/)[1]);
 console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
