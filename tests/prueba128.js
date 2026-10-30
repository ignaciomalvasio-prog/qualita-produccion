// Artículo "CORTES": se elige a mano en el pedido (no está en la lista que usa la IA) y se guarda.
const {chromium}=require('playwright');
const data={faena:{},produccion:{},config:{general:{}},privado:{clientes:{lista:[]}},pedidos:{}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-30T11:30:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:d,user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);
await p.click('[data-act="q-nuevo"]');await p.fill('#q0cliente','QUALITA EXPRESS');await p.locator('#q0cliente').dispatchEvent('input');
await p.click('[data-act="q-corte"]');await p.waitForTimeout(100);
console.log('CORTES en la lista:',await p.locator('#q0c0corte option',{hasText:/^CORTES$/}).count());
await p.selectOption('#q0c0corte','CORTES');await p.locator('#q0c0corte').dispatchEvent('change');
await p.fill('#q0c0texto','2 CAJAS SURTIDOS');await p.locator('#q0c0texto').dispatchEvent('input');
await p.click('[data-act="q-guardar"][data-q="0"]');await p.clock.runFor(1000);await p.waitForTimeout(300);
console.log('guardado:',JSON.stringify(await p.evaluate(()=>Object.values(window.__mock.data.pedidos).map(x=>x.cortes.map(c=>c.corte+'='+c.texto)))));
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
