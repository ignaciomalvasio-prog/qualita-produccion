// Cámara ↔ Google Sheet: se conecta con la URL del programita de la planilla, trae las semanas, completa la planilla
// hasta fin de año, manda lo que se cambia en la app y trae lo que se cambia en la planilla. Planilla simulada (datos inventados).
const {chromium}=require('playwright');const SP=process.argv[2];
const base={faena:{},produccion:{},config:{general:{}},privado:{},pedidos:{}};
const dia=(p,u,v,d)=>({propios:p,usuario:u,venta:v,despSig:d});
const HOJA=[{lunes:'2026-10-12',dias:[{propios:0,usuario:null,venta:0,despSig:700,rem:300},dia(600,null,300,720),dia(600,null,200,720),dia(600,null,250,720),dia(500,160,300,740)],nota:''},
 {lunes:'2026-10-19',dias:[dia(600,null,280,740),dia(600,null,300,740),dia(600,null,180,740),dia(600,null,240,720),dia(500,160,300,750)],nota:'SABADO'}];
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-21T10:00:00-03:00')});
 await p.addInitScript(([d,h])=>{const hoja={tok:null,sem:JSON.parse(JSON.stringify(h)),posts:[]};window.__hoja=hoja;
  window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],camara:['yo@x.com'],
   hoja:(url,cuerpo)=>{const q=new URL(url).searchParams;
    if(!hoja.tok){if(q.get('accion')!=='vincular')return{ok:false,error:'sin vincular'};hoja.tok='T1';return{ok:true,token:'T1',semanas:hoja.sem};}
    if((cuerpo?cuerpo.k:q.get('k'))!==hoja.tok)return{ok:false,error:'clave incorrecta'};
    if(cuerpo){hoja.posts.push(cuerpo.semanas.map(s=>s.lunes));cuerpo.semanas.forEach(s=>{let x=hoja.sem.find(y=>y.lunes===s.lunes);if(!x){x={lunes:s.lunes,dias:[{},{},{},{},{}],nota:''};hoja.sem.push(x);}
     s.dias.forEach((dd,i)=>{const o=x.dias[i];['propios','usuario','venta','despSig'].forEach(k=>{if(k in dd)o[k]=dd[k]});if('rem' in dd){if(dd.rem==null)delete o.rem;else o.rem=dd.rem;}});if('nota' in s)x.nota=s.nota;});hoja.sem.sort((a,b)=>a.lunes<b.lunes?-1:1);}
    return{ok:true,semanas:hoja.sem};}}},[base,HOJA]);
 await p.goto('http://127.0.0.1:8765/index.html#camara');await p.clock.runFor(1500);await p.waitForSelector('.cam-tabla');
 const fila=async lab=>p.evaluate(l=>{const tr=[...document.querySelectorAll('.cam-tabla tbody tr')].find(t=>t.querySelector('th').innerText.startsWith(l));return [...tr.querySelectorAll('td')].slice(0,5).map(td=>{const i=td.querySelector('input');return (i?i.value:td.innerText).split('\n')[0].trim();}).join(' | ');},lab);
 await p.click('[data-act="cam-sheet"]');await p.fill('#cam-sheet-url','https://otra.com/x');await p.click('[data-act="cam-sheet-conectar"]');
 console.log('=== ',w,'URL mala:',await p.locator('.cam-sheet .neg').innerText());
 if(w===400)await p.screenshot({path:SP+'/camara-sheet-pasos.png',fullPage:true});
 await p.fill('#cam-sheet-url','https://script.google.com/macros/s/ABC/exec');await p.click('[data-act="cam-sheet-conectar"]');
 await p.clock.runFor(1500);await p.waitForTimeout(400);
 console.log('estado:',await p.locator('.cam-sync').innerText());
 console.log('venta en la app (de la planilla):',await fila('VENTA'),'· nota:',await p.inputValue('#cam-nota'));
 const hs=await p.evaluate(()=>window.__hoja.sem.map(s=>s.lunes));console.log('semanas en la planilla:',hs.length,hs[0],'…',hs.at(-1),'· viernes 25/12 (feriado):',await p.evaluate(()=>JSON.stringify(window.__hoja.sem.find(s=>s.lunes==='2026-12-21').dias[4])));
 console.log('guardado:',await p.evaluate(()=>JSON.stringify(window.__mock.data.privado['camara-ajustes'])));
 // Cambio en la app → va a la planilla.
 const c=p.locator('.cam-in[data-cf="venta"][data-f="2026-10-21"]');await c.fill('222');await c.press('Enter');await p.clock.runFor(800);await p.waitForTimeout(300);
 console.log('app → planilla: mié venta',await p.evaluate(()=>window.__hoja.sem.find(s=>s.lunes==='2026-10-19').dias[2].venta),'· últ. envío',await p.evaluate(()=>JSON.stringify(window.__hoja.posts.at(-1))));
 // Cambio en la planilla → aparece en la app.
 await p.evaluate(()=>{const s=window.__hoja.sem.find(s=>s.lunes==='2026-10-19');s.dias[3].venta=99;s.dias[0].propios=611;});
 await p.click('[data-act="cam-sync-ya"]');await p.clock.runFor(800);await p.waitForTimeout(300);
 console.log('planilla → app: propios',await fila('PROPIOS'),'· venta',await fila('VENTA'));
 await p.evaluate(()=>{window.__hoja.sem.find(s=>s.lunes==='2026-10-19').dias[1].venta=123;});await p.clock.runFor(61000);await p.waitForTimeout(300);
 console.log('solo, al minuto: venta',await fila('VENTA'));
 if(w===1100)await p.screenshot({path:SP+'/camara-sheet.png',fullPage:true});
 console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');}
await b.close();})();
