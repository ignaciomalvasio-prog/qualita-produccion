// Imprimir desde el celular en la compu: el celu manda la pantalla (privado/imprimir); la compu marcada como impresora la abre y aprieta Imprimir.
const {chromium}=require('playwright');const SP=process.argv[2];
const L='2026-10-26';const dia=(cl)=>({propios:600,usuarios:0,faena:[],clientes:cl});
const sem={id:L,desde:L,dias:[dia([]),dia([]),dia([{cliente:'MONTEVERDE',cant:3,nota:'NO GORDAS'}]),dia([]),dia([])]};
const base={faena:{[L]:sem},produccion:{},config:{general:{}},pedidos:{}};
(async()=>{const b=await chromium.launch();const errs=[];
 // Celular
 const cel=await b.newPage({viewport:{width:400,height:900},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile'});cel.on('pageerror',e=>errs.push('cel:'+e.message));
 await cel.clock.install({time:new Date('2026-10-27T18:00:00-03:00')});
 const d1=JSON.parse(JSON.stringify(base));d1.privado={clientes:{lista:[]},impresora:{nombre:'FRIGO',visto:new Date('2026-10-27T17:59:00-03:00').getTime()}};
 await cel.addInitScript(d=>{window.__mock={data:d,user:{email:'yo@x.com'},editores:['yo@x.com']}},d1);
 await cel.goto('http://127.0.0.1:8765/index.html#medias');await cel.clock.runFor(1500);
 const m=cel.locator('[data-act="m-dia"]');if(await m.count())await m.click();await cel.waitForTimeout(200);
 await cel.click('[data-act="fm-ir"][data-f="2026-10-28"]');await cel.waitForTimeout(300);
 console.log('celu botón:',await cel.locator('[data-act="imprimir-remoto"]').innerText());
 await cel.click('[data-act="imprimir-remoto"]');await cel.click('[data-act="imp-mas"]');console.log('copias elegidas:',await cel.locator('#imp-n').innerText());await cel.click('[data-act="imp-mandar"]');await cel.clock.runFor(500);
 const job=await cel.evaluate(()=>window.__mock.data.privado.imprimir);console.log('mandado:',JSON.stringify({tab:job.tab,fm:job.fm,mv:job.mv,copias:job.copias}));
 // Compu
 const pc=await b.newPage({viewport:{width:1200,height:900}});pc.on('pageerror',e=>errs.push('pc:'+e.message));
 await pc.clock.install({time:new Date('2026-10-27T18:00:30-03:00')});
 const d2=JSON.parse(JSON.stringify(base));d2.privado={clientes:{lista:[]},imprimir:job};
 await pc.addInitScript(d=>{localStorage.setItem('qualita-imprime','1');localStorage.setItem('qualita-imprime-nombre','FRIGO');window.print=()=>{window.__impreso=(window.__impreso||0)+1;};window.__mock={data:d,user:{email:'yo@x.com'},editores:['yo@x.com']}},d2);
 await pc.goto('http://127.0.0.1:8765/index.html#pedidos');await pc.clock.runFor(12000);await pc.waitForTimeout(500);
 console.log('compu: pestaña',await pc.evaluate(()=>document.querySelector('.tabs [aria-current="page"], .tabs .on, [data-tab][aria-selected="true"]')?.textContent||location.hash),'· imprimió:',await pc.evaluate(()=>window.__impreso||0),'· marcado hecho:',await pc.evaluate(()=>!!window.__mock.data.privado.imprimir.hecho),'· latido:',await pc.evaluate(()=>!!window.__mock.data.privado.impresora));
 console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
