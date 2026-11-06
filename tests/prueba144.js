// Pedidos: elegir el día de producción del pedido (entrega o días antes); los cortes van a esa planilla y se mueven si se cambia.
const {chromium}=require('playwright');const W='2026-11-11',SP=process.argv[2]||'.';
const ped={a:{cliente:'CESAR',entrega:W,medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'1',corte:'PECHO',texto:'4 CAJAS'},{k:'2',corte:'MATAMBRE',texto:'3 CAJAS'}]}};
const data={faena:{},privado:{},config:{general:{}},pedidos:ped,produccion:{}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-11-06T12:30:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForTimeout(200);
await p.evaluate(()=>{const i=document.querySelector('.nav-ped input[type=date]')||document.getElementById('p-pd');i.value='2026-11-11';i.dispatchEvent(new Event('change',{bubbles:true}));});await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelector('.ped[data-ped="a"] [data-act="ped-abrir"]').click());await p.waitForTimeout(200);
const prod=()=>p.evaluate(()=>Object.keys(window.__mock.data.produccion).filter(k=>k>='2026-11').sort().map(k=>k+': '+window.__mock.data.produccion[k].cortes.map(c=>c.corte+'('+c.lineas.length+')').join(' ')).join(' | ')||'nada');
console.log('opciones:',await p.locator('select[data-dia-prod="a"] option').allInnerTexts());
await p.selectOption('select[data-dia-prod="a"]','2026-11-05');await p.clock.runFor(800);await p.waitForTimeout(300);
await p.click('[data-act="c-todos"][data-id="a"]');await p.clock.runFor(800);await p.waitForTimeout(300);
console.log('sumado (jueves 5):',await prod(),'· diaProd:',await p.evaluate(()=>window.__mock.data.pedidos.a.diaProd));
await p.selectOption('select[data-dia-prod="a"]','2026-11-11');await p.clock.runFor(800);await p.waitForTimeout(300);
console.log('cambiado a miércoles:',await p.evaluate(()=>Object.keys(window.__mock.data.produccion).filter(k=>k>='2026-11').sort().map(k=>k+': '+window.__mock.data.produccion[k].cortes.map(c=>c.corte+'('+c.lineas.length+')').join(' ')).join(' | ')),'· diaProd:',await p.evaluate(()=>window.__mock.data.pedidos.a.diaProd||'(el de siempre)'));
await p.locator('.ped[data-ped="a"]').screenshot({path:SP+'/p144.png'});
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
