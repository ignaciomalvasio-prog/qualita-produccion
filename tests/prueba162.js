// Pestaña Fichas técnicas: solo la ve la cuenta de Cámara/Túnel; lista las fichas de fichas/lista.json.
const {chromium}=require('playwright');
const data={faena:{},privado:{},config:{general:{feriados:[]}},pedidos:{},produccion:{}};
(async()=>{const b=await chromium.launch();const errs=[];
for(const [w,cam] of [[1366,true],[400,true],[1366,false]]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-19T14:00:00-03:00')});
 await p.addInitScript(([d,cam])=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'renzolovaiza@gmail.com'},editores:['renzolovaiza@gmail.com'],camara:cam?['renzolovaiza@gmail.com']:[]}},[data,cam]);
 await p.goto('http://127.0.0.1:8765/index.html#fichas');await p.clock.runFor(2000);await p.waitForTimeout(800);
 const vis=await p.evaluate(()=>!document.getElementById('tab-fichas').hidden);
 console.log(w,cam?'renzo':'otro','pestaña visible:',vis,'| fichas:',await p.locator('.ficha-c').count());
 if(vis){await p.fill('#ficha-q','bond');await p.waitForTimeout(200);console.log(w,'buscar bond:',await p.evaluate(()=>[...document.querySelectorAll('.ficha-c b')].map(x=>x.textContent).join(',')));
  console.log(w,'desborde:',await p.evaluate(()=>document.documentElement.scrollWidth));await p.screenshot({path:(process.argv[2]||'.')+'/p162-'+w+'.png'});}
 await p.close();}
console.log('errores:',errs);await b.close();})();
