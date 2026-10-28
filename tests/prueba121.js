// PIN de esta compu: se pone en Configuración; la app se bloquea al abrirla y a los 10 min sin uso; el PIN correcto la abre.
const {chromium}=require('playwright');
const data={faena:{},produccion:{},privado:{},config:{general:{}},pedidos:{a:{cliente:'X',entrega:'2026-10-29',medias:5,cortes:[]}}};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1100,400]){const ctx=await b.newContext({viewport:{width:w,height:800}});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-28T10:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:d,user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);
await p.locator('details',{hasText:'Configuración'}).locator('summary').click();
console.log(w,'antes bloqueada:',await p.locator('#pin-lock').count());
await p.fill('#pin-nuevo','12');await p.click('[data-act="pin-poner"]');await p.waitForTimeout(200);console.log(w,'PIN corto guardado:',await p.evaluate(()=>!!localStorage.getItem('qualita-pin')));
await p.fill('#pin-nuevo','4321');await p.click('[data-act="pin-poner"]');await p.waitForTimeout(300);console.log(w,'PIN guardado:',await p.evaluate(()=>(localStorage.getItem('qualita-pin')||'').length),'caracteres (cifrado, no 4321:',await p.evaluate(()=>localStorage.getItem('qualita-pin')!=='4321'),')');
await p.reload();await p.clock.runFor(1500);await p.waitForTimeout(200);
console.log(w,'al abrir, bloqueada:',await p.locator('#pin-lock').isVisible());
await p.fill('#pin-in','1111');await p.keyboard.press('Enter');await p.waitForTimeout(300);console.log(w,'PIN mal →',await p.locator('#pin-err').innerText(),'· sigue bloqueada:',await p.locator('#pin-lock').count());
await p.fill('#pin-in','4321');await p.keyboard.press('Enter');await p.waitForTimeout(300);console.log(w,'PIN bien → bloqueada:',await p.locator('#pin-lock').count());
await p.clock.runFor(11*60000);await p.waitForTimeout(200);console.log(w,'11 min sin uso → bloqueada:',await p.locator('#pin-lock').count());
await p.fill('#pin-in','4321');await p.click('[data-act="pin-ok"]');await p.waitForTimeout(300);
await p.locator('details',{hasText:'Configuración'}).locator('summary').click().catch(()=>{});await p.waitForTimeout(100);
await p.click('[data-act="pin-sacar"]');await p.waitForTimeout(200);console.log(w,'sacar PIN:',await p.evaluate(()=>localStorage.getItem('qualita-pin')));
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await ctx.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
