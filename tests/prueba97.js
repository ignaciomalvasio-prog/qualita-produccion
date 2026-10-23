// Logística: si otra pantalla abierta (otra versión de la app) publica la logística del día con otros kilos, antes
// cada una republicaba lo suyo sin parar y la página se colgaba. Ahora se republica como mucho una vez cada 30 s.
const {chromium}=require('playwright');const F='2026-10-27';
const P=(c,cam)=>({cliente:c,entrega:F,medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:cam,cuenta:'',cortes:[{corte:'JAMON',texto:'1000KG',orden:true}]});
const data={faena:{},produccion:{},privado:{},config:{general:{}},pedidos:{a:P('COTO',''),b:P('BOCANTINO','')}};
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1100,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-23T16:30:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],pubs:0,
   // La "otra pantalla": cada vez que se publica el día, lo vuelve a publicar con otros kilos.
   alGuardar:(c,id,doc)=>{if(c==='config'&&id==='log-2026-10-27'){window.__mock.pubs++;(doc.pedidos||[]).forEach(x=>x.kg=(+x.kg||0)+1);}}}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(2000);
 const n0=await p.evaluate(()=>window.__mock.pubs);
 await p.clock.runFor(10000);const n1=await p.evaluate(()=>window.__mock.pubs);
 await p.clock.runFor(60000);const n2=await p.evaluate(()=>window.__mock.pubs);
 console.log('publicaciones: al abrir',n0,'· a los 10 s',n1,'· a los 70 s',n2,'(antes no paraba)');
 const r=await Promise.race([p.evaluate(()=>1).then(()=>'responde'),new Promise(r=>setTimeout(()=>r('COLGADA'),5000))]);
 console.log('página:',r,'· errores:',errs.join('|')||'ninguno');await b.close();process.exit(0);})();
