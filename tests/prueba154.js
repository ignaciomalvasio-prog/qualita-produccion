// (con piezas en cámara) Stock → planilla "Stock de Cortes": manda los kg del depósito 1 de los 6 cortes al programita de la planilla.
const {chromium}=require('playwright');const dir=process.argv[2]||'.';
const stock={ts:new Date('2026-11-03T09:00:00-03:00').getTime(),actualizado:'3 nov, 9:00',depositos:{1:'Frigorifico Qualita',2:'Otro'},arts:{30216:'PECHO',30105:'BONDIOLA'},
 filas:[{a:30216,f:1,kg:1200.4,u:10},{a:30216,f:1,kg:800,u:5},{a:30216,f:2,kg:999,u:1},{a:30105,f:1,kg:450,u:3},{a:101,f:1,kg:77,u:1}],fechas:[{a:30216,f:1,d:"2026-10-01",kg:1000,u:9},{a:30216,f:1,d:"2026-11-01",kg:494.06,u:5}]};
const base={faena:{},produccion:{},config:{general:{}},privado:{stock,'camara-ajustes':{sheet:{url:'https://script.google.com/macros/s/ABC/exec',k:'T1',desde:'2026-10-01'}}},pedidos:{}};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-11-03T09:30:00-03:00')});
await p.addInitScript(d=>{window.__env=[];window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],camara:['yo@x.com'],
 hoja:(u,c)=>{if(c&&c.accion==='stock'){window.__env.push(c);return {ok:true,stock:true,escritos:6};}return {ok:true,semanas:[],version:3,estadoVenta:{ok:true,ts:Date.now()}};}}},base);
await p.goto('http://127.0.0.1:8765/index.html#stock');await p.clock.runFor(2000);await p.waitForTimeout(300);
console.log(w,'panel:',await p.evaluate(()=>document.querySelector('.stk-hoja').innerText.replace(/\s+/g,' ')));
await p.fill('#stk-url','https://docs.google.com/spreadsheets/d/1HsTkEXz_IuQ-ABCDEFGHIJKLMNOP/edit?usp=sharing');await p.click('[data-act="stk-conectar"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'mandado:',JSON.stringify(await p.evaluate(()=>window.__env.map(c=>[c.id,c.fecha,c.valores]))));
console.log(w,'panel después:',await p.evaluate(()=>document.querySelector('.stk-hoja').innerText.replace(/\s+/g,' ')));
// llega stock nuevo → se manda solo
await p.evaluate(()=>{const s=JSON.parse(JSON.stringify(window.__mock.data.privado.stock));s.ts=Date.now()+60000;s.actualizado='3 nov, 9:30';s.filas[0].kg=100;window.__mock.data.privado.stock=s;});
await p.evaluate(()=>window.__mock.emitir('privado'));await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'envíos:',await p.evaluate(()=>window.__env.map(c=>c.fecha+' PECHO '+c.valores.PECHO).join(' | ')));
if(w===1366)await p.screenshot({path:dir+'/p134.png'});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
