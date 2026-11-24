// Camiones: al poner horario se ordenan solos por hora; los que no tienen hora quedan arriba.
const {chromium}=require('playwright');const F='2026-11-25';
const P=(cl,cam)=>({cliente:cl,entrega:F,medias:10,peso:'',nota:'',frio:'',origen:'manual',kg:'',camion:cam,cuenta:'',cortes:[]});
const data={faena:{},privado:{},config:{general:{feriados:[]},['log-'+F]:{fecha:F,camiones:[{id:'a',nombre:'JMC',hora:'07:00',orden:['x']},{id:'b',nombre:'CHAVEZ',hora:'',orden:['y']},{id:'c',nombre:'LAGUI',hora:'',orden:['z']}],pedidos:[]}},pedidos:{x:P('JMC','a'),y:P('DINO','b'),z:P('MAIDANA','c')},produccion:{}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-23T22:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(2000);await p.waitForTimeout(400);await p.fill('#pd-fecha',F);await p.dispatchEvent('#pd-fecha','change');await p.waitForTimeout(400);
 const orden=()=>p.evaluate(()=>window.__mock.data.config['log-2026-11-25'].camiones.map(c=>c.nombre+(c.hora?' '+c.hora:'')).join(' | '));
 console.log('antes:',await orden());
 await p.evaluate(()=>{const b=document.querySelector('[data-act="hora-abrir"][data-id="c"]');b&&b.click();});await p.waitForTimeout(200);
 await p.fill('input[data-hora-cam="c"]','03:00');await p.press('input[data-hora-cam="c"]','Enter');await p.waitForTimeout(600);
 console.log('después:',await orden());
 console.log('errores:',errs);await b.close();})();
