// Cámara: cartel grande cuando la sincronización con FAENA POR DÍA se rompe (código viejo, semana que no aparece, venta que no pasa).
const {chromium}=require('playwright');
const base={faena:{},produccion:{},config:{general:{}},privado:{'camara-ajustes':{sheet:{url:'https://script.google.com/macros/s/ABC/exec',k:'T1',desde:'2026-10-01'}}},pedidos:{}};
const sem=l=>({lunes:l,dias:[{},{},{},{},{}],nota:''});
const casos=[['código viejo',{ok:true,semanas:[sem('2026-11-02')]}],['falta la semana',{ok:true,version:2,semanas:[sem('2026-10-26')],estadoVenta:{ok:true,ts:Date.parse('2026-11-02T18:00:00-03:00')}}],['venta no pasa',{ok:true,version:2,semanas:[sem('2026-11-02')],estadoVenta:{ok:false,msg:'No encuentro la semana del 02/11 en la planilla FAENA.',ts:Date.parse('2026-11-02T18:00:00-03:00')}}],['todo bien',{ok:true,version:2,semanas:[sem('2026-11-02')],estadoVenta:{ok:true,ts:Date.parse('2026-11-02T18:50:00-03:00')}}]];
(async()=>{const b=await chromium.launch();const errs=[];
for(const [nom,resp] of casos){const p=await b.newPage({viewport:{width:1100,height:800}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-02T19:00:00-03:00')});
 await p.addInitScript(([d,r])=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],camara:['yo@x.com'],hoja:()=>JSON.parse(JSON.stringify(r))}},[base,resp]);
 await p.goto('http://127.0.0.1:8765/index.html#camara');await p.clock.runFor(2000);await p.waitForTimeout(400);
 const t=await p.locator('.cam-alerta').innerText().catch(()=>'(sin cartel)');
 await p.click('[data-tab="inicio"]:visible');await p.waitForTimeout(200);
 console.log(nom,'→',t.replace(/\s+/g,' ').slice(0,140),'· en Inicio:',await p.locator('#view-inicio .cam-alerta').count());await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
