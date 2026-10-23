// Arreglo: armar un camión con nota (ej. "13:00HS") colgaba la página cuando Cámara estaba conectada a la Google Sheet:
// la nota del camión y la nota de la semana de Cámara tenían el mismo id y se mezclaban. Ahora no se tocan entre sí.
const {chromium}=require('playwright');const F='2026-10-26';
const P=(c,cam)=>({cliente:c,entrega:F,medias:30,peso:'',nota:'',origen:'manual',kg:'',camion:cam,cuenta:'',frio:'CONGELADO',cortes:[{corte:'JAMON',texto:'1000KG',orden:true}]});
const data={faena:{},produccion:{},config:{general:{}},pedidos:{a:P('AVICO',''),b:P('FABRO ANIBAL','')},
 privado:{'camara-ajustes':{sheet:{url:'https://script.google.com/macros/s/X/exec',k:'T'}},'camara-2026-10-19':{dias:[{},{},{},{},{}],nota:'si carga recreo faenamos'}}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-23T17:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],camara:['yo@x.com'],posts:[],
  hoja:(url,c)=>{if(c)window.__mock.posts.push(c.semanas.map(s=>s.lunes+':'+s.nota));return {ok:true,semanas:[]};}}},data);
 await p.goto('http://127.0.0.1:8765/index.html#camara');await p.clock.runFor(1500);await p.waitForSelector('#cam-nota-sem');
 await p.click('#tab-pedidos');await p.clock.runFor(800);
 for(let i=0;i<3;i++){ if((await p.locator('#view-pedidos .nav-ped .tit').innerText()).includes('26'))break; await p.click('#view-pedidos [data-act="pd"][data-d="1"]');await p.waitForTimeout(150);}
 await p.locator('input[data-sel="b"]').check();await p.waitForTimeout(100);
 await p.selectOption('#cam-a','nuevo').catch(()=>{});await p.waitForTimeout(100);
 await p.fill('#cam-num','FABRO ANIBAL (F');await p.fill('#cam-nota','13:00HS');
 const r=await Promise.race([p.click('[data-act="cam-crear"]').then(()=>p.clock.runFor(1500)).then(()=>'responde'),new Promise(r=>setTimeout(()=>r('COLGADA'),15000))]);
 console.log('=== ',w,'armar camión:',r);
 if(r==='COLGADA'){await b.close();process.exit(1);}
 console.log('camión:',await p.evaluate(()=>JSON.stringify(window.__mock.data.config['log-2026-10-26'].camiones.map(c=>[c.num,c.hora,c.nota,c.orden]))),
  '· nota de Cámara:',await p.evaluate(()=>window.__mock.data.privado['camara-2026-10-19'].nota),'· envíos a la planilla:',await p.evaluate(()=>JSON.stringify(window.__mock.posts)));
 console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');}
await b.close();process.exit(0);})();
