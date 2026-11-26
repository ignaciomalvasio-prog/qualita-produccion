// "Cortes de sur": marcado antes de pegar, cada corte queda "A CONGELAR ROTULADO SUR"; la siguiente carga vuelve a ser normal.
const {chromium}=require('playwright');const SP=process.argv[2]||'/tmp';
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-11-26T09:00:00-03:00')});
await p.addInitScript(()=>{let n=0;window.__mock={data:{faena:{},produccion:{},config:{general:{}},pedidos:{},privado:{clientes:{lista:[]}}},user:{email:'yo@x.com'},editores:['yo@x.com'],ia:(t,x)=>({pedidos:[{cliente:'CLIENTE '+(++n),entrega:'2026-11-27',medias:0,peso:'',cortes:[{corte:'MATAMBRE',texto:'5 CAJAS MATAMBRE',orden:true},{corte:'PECHO',texto:'100 KG PECHO (COD 211)',orden:true}],nota:'',dudas:[]}],planilla:[]})};});
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForSelector('[data-act="carga-sur"]');
await p.click('[data-act="carga-sur"]');console.log(w,'chip:',await p.locator('.carga-sur').innerText());
await p.screenshot({path:SP+'/sur'+w+'.png'});
await p.click('[data-act="q-pegar"]');await p.fill('#pegar-txt','pedido sur');await p.click('[data-act="q-leer-texto"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
await p.click('[data-act="q-pegar"]');await p.fill('#pegar-txt','pedido normal');await p.click('[data-act="q-leer-texto"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,await p.evaluate(()=>Object.values(window.__mock.data.pedidos).map(x=>x.cliente+': '+x.cortes.map(c=>c.texto).join(' | ')).join(' // ')));
console.log(w,'desborde:',await p.evaluate(()=>document.documentElement.scrollWidth),'errores:',errs);await p.close();}
await b.close();})();
