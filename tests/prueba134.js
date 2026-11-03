// Propuesta de camiones en Pedidos: arma como salieron los últimos días iguales (martes con martes).
const {chromium}=require('playwright');const F='2026-11-03',dir=process.argv[2]||'.';
const P=(c,f,cam,m)=>({cliente:c,entrega:f,medias:m||10,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cuenta:'',cortes:[]});
const ped={a:P('INDACOR',F),b:P('ALEDO',F),c:P('LOS NOVILLOS',F,'',40),d:P('CLIENTE NUEVO',F),e:P('EMERIC',F)};
const hist=(f,cams,peds)=>({fecha:f,camiones:cams,pedidos:peds});
const config={general:{},
 'log-2026-10-27':hist('2026-10-27',[{id:'x1',nombre:'MAXIMO',kg:3000,orden:['h2','h1']},{id:'x2',nombre:'CHAVEZ',orden:['h3']}],[{id:'h1',cliente:'INDACOR',camion:'x1'},{id:'h2',cliente:'ALEDO',camion:'x1'},{id:'h3',cliente:'LOS NOVILLOS',camion:'x2'}]),
 'log-2026-10-20':hist('2026-10-20',[{id:'y1',nombre:'CHAVEZ',orden:['g1']}],[{id:'g1',cliente:'INDACOR',camion:'y1'},{id:'g2',cliente:'EMERIC',camion:'y1'}]),
 'log-2026-10-28':hist('2026-10-28',[{id:'z1',nombre:'OTRO',orden:['k1']}],[{id:'k1',cliente:'CLIENTE NUEVO',camion:'z1'}]),
 ['log-'+F]:{fecha:F,camiones:[],pedidos:Object.keys(ped).map(k=>Object.assign({id:k},ped[k]))}};
const data={faena:{},produccion:{},privado:{},config,pedidos:ped};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-11-02T14:30:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForTimeout(200);
const prop=()=>p.evaluate(()=>[...document.querySelectorAll('.prop-g')].map(g=>g.querySelector('.prop-cab b').textContent+': '+[...g.querySelectorAll('.prop-f .nom')].map(x=>x.textContent).join(',')).join(' | '));
console.log(w,'propuesta:',await prop(),'·',await p.evaluate(()=>document.querySelector('.prop-top .t').textContent));
if(w===1366)await p.locator('.prop-cam').screenshot({path:dir+'/p134.png'});
await p.click('[data-act="prop-quitar"][data-id="c"]');await p.waitForTimeout(150);
console.log(w,'sin LOS NOVILLOS:',await prop());
await p.selectOption('[data-prop-sumar="MAXIMO"]','d');await p.waitForTimeout(150);
console.log(w,'con CLIENTE NUEVO:',await prop());
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
await p.click('[data-act="prop-todos"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'armado:',await p.evaluate(F=>window.__mock.data.config['log-'+F].camiones.map(c=>c.nombre+'('+(c.kg||0)+'):'+(c.orden||[]).join('')).join(' | '),F),'· propuesta queda:',await p.$$eval('.prop-g',x=>x.length));
await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
