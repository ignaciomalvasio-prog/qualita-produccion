// Stock: pestaña solo para editores; filtra por nombre, por N°, por rango de N° y por depósito.
const {chromium}=require('playwright');const SP=process.argv[2];
const stock={actualizado:'2 nov, 12:30',ts:String(Date.parse('2026-11-02T12:30:00-03:00')),fuente:'Sistema (automatico)',
 arts:{'18':'Capon','101':'BONDIOLA','109':'BONDIOLA CONGELADA SIN HUESO "SS"','215':'PECHITO SIN VACIO CONGELADO','810':'HARINA DE CARNE Y HUESO PORCINA','2000':'CHORIZO FRESCO ESPECIAL'},
 depositos:{'1':'Frigorifico Qualita S.A.','3':'Qualita S.A. - CICLO III','5':'Qualita  S.A. - Local Comercial','33':'Qualita S.A  (ARGENCARNES - X)'},
 filas:[{f:1,a:18,kg:5000,u:100},{f:1,a:101,kg:600.5,u:30},{f:3,a:101,kg:20,u:1},{f:5,a:101,kg:50.25,u:5},{f:1,a:109,kg:2600,u:120},{f:1,a:215,kg:2640,u:160},{f:33,a:215,kg:6600,u:330},{f:1,a:810,kg:7000,u:6},{f:3,a:2000,kg:300,u:0}]};
(async()=>{const b=await chromium.launch();
for(const w of [1280,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-11-02T13:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:{faena:{},produccion:{},config:{general:{}},pedidos:{},privado:{clientes:{lista:[]},stock:d}},user:{email:'yo@x.com'},editores:['yo@x.com']}},stock);
await p.goto('http://127.0.0.1:8765/index.html#stock');await p.clock.runFor(1500);await p.waitForSelector('#st-res');
const tot=async()=>(await p.locator('.stk-tot').innerText()).replace(/\s+/g,' ');
const arts=async()=>(await p.locator('.pl.stock-t td.stk-n').allInnerTexts()).join(',');
console.log(w,'todo:',await tot(),'·',await arts());
console.log(w,'fila 101:',(await p.locator('.pl.stock-t tr',{hasText:'BONDIOLA'}).first().innerText()).replace(/\s+/g,' '));
await p.fill('#st-q','bondiola');console.log(w,'nombre:',await arts());
await p.fill('#st-q','21');console.log(w,'numero 21:',await arts());
await p.fill('#st-q','');await p.fill('#st-desde','100');await p.fill('#st-hasta','300');console.log(w,'rango 100-300:',await arts(),'·',await tot());
await p.selectOption('#st-dep','1');await p.waitForTimeout(100);console.log(w,'rango + dep 1:',await arts(),'·',await tot());
await p.click('[data-act="st-limpiar"]');await p.waitForTimeout(100);console.log(w,'limpio:',await arts());
await p.screenshot({path:SP+'/stock'+w+'.png',fullPage:true});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');
const v=await b.newPage({viewport:{width:w,height:900}});await v.addInitScript(d=>{window.__mock={data:{faena:{},produccion:{},config:{general:{}},pedidos:{},privado:{stock:d}},user:null,editores:[]}},stock);
await v.goto('http://127.0.0.1:8765/index.html#stock');await v.waitForTimeout(1200);console.log(w,'sin cuenta: pestaña visible',await v.locator('#tab-stock').isVisible(),'· vista',await v.locator('#view-stock').isVisible());}
await b.close();})();
