// Cámara: deshacer y rehacer (botones ↶ ↷ y Ctrl+Z / Ctrl+Y), como en el Excel.
const {chromium}=require('playwright');
const base={faena:{},produccion:{},config:{general:{}},privado:{},pedidos:{}};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-29T10:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],camara:['yo@x.com']}},base);
 await p.goto('http://127.0.0.1:8765/index.html#camara');await p.clock.runFor(1500);await p.waitForSelector('.cam-tabla');
 const val=()=>p.inputValue('.cam-in[data-cf="venta"][data-f="2026-10-28"]');
 const dis=async()=>[await p.locator('[data-act="cam-deshacer"]').isDisabled(),await p.locator('[data-act="cam-rehacer"]').isDisabled()].join('/');
 console.log(w,'al abrir venta mié:',await val(),'· botones deshabilitados:',await dis());
 for(const x of ['200','210']){const c=p.locator('.cam-in[data-cf="venta"][data-f="2026-10-28"]');await c.fill(x);await c.press('Enter');await p.clock.runFor(500);await p.waitForTimeout(200);}
 console.log(w,'después de 200 y 210:',await val(),'· botones:',await dis());
 await p.click('[data-act="cam-deshacer"]');await p.clock.runFor(500);await p.waitForTimeout(200);console.log(w,'deshacer →',await val());
 await p.locator('body').click({position:{x:5,y:5}});await p.keyboard.press('Control+z');await p.clock.runFor(500);await p.waitForTimeout(200);console.log(w,'Ctrl+Z →',await val(),'· guardado:',await p.evaluate(()=>JSON.stringify(window.__mock.data.privado['camara-2026-10-26'].dias[2])));
 await p.keyboard.press('Control+y');await p.clock.runFor(500);await p.waitForTimeout(200);console.log(w,'Ctrl+Y →',await val());
 await p.click('[data-act="cam-rehacer"]');await p.clock.runFor(500);await p.waitForTimeout(200);console.log(w,'rehacer →',await val(),'· botones:',await dis());
 console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
