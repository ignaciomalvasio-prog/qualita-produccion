const {chromium}=require('playwright');const SP=process.argv[2];
const P=(c,cam)=>({cliente:c,entrega:'2026-10-14',medias:10,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cortes:[]});
const cams=[{id:'c1',nombre:'Lagui',hora:'03:00',kg:0,orden:['b','a','h']},{id:'c2',nombre:'Moreira',hora:'07:00',kg:0,orden:['d']},{id:'c3',nombre:'Passeri',hora:'00:00',kg:0,orden:['e']},{id:'c4',nombre:'Sin hora',kg:0,orden:['g']}];
const data={faena:{},produccion:{},config:{general:{},'log-2026-10-14':{fecha:'2026-10-14',camiones:cams,pedidos:[]}},privado:{},pedidos:{a:P('ALFA','c1'),b:P('BETA','c1'),h:P('HACHE','c1'),d:P('DELTA','c2'),e:P('EPSI','c3'),g:P('GAMA','c4')}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-13T18:30:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForTimeout(200);
if(!(await p.locator('.pos-sel').count())){await p.fill('#l-fecha','2026-10-14');await p.locator('#l-fecha').dispatchEvent('change');await p.waitForTimeout(200);}
const orden=async()=>(await p.locator('section.cam:not(.suelto)').evaluateAll(cs=>cs.map(c=>c.querySelector('h2').innerText+': '+[...c.querySelectorAll('.log-ped strong')].map(x=>x.innerText).join(',')))).join(' | ');
console.log('=== ancho',w,'al abrir:',await orden());
await p.click('[data-act="cam-por-hora"]');await p.clock.runFor(800);console.log('ordenar por horario:',await orden());
await p.locator('section.cam',{hasText:'Sin hora'}).locator('[data-act="camion-subir"]').click();await p.clock.runFor(800);console.log('flecha ↑ a Sin hora:',await orden());
await p.locator('select[data-pos-ped="h"]').selectOption('0');await p.clock.runFor(800);console.log('HACHE al 1:',await orden());
await p.locator('[data-act="cam-bajar"][data-id="h"]').click();await p.clock.runFor(800);console.log('HACHE ↓:',await orden());
await p.locator('section.cam',{hasText:'Moreira'}).locator('[data-act="cam-editar"]').first().click();await p.fill('#cam-e-hora','01:00');await p.locator('#cam-e-hora').dispatchEvent('input');await p.click('[data-act="cam-guardar"]');await p.clock.runFor(800);
console.log('Moreira a la 01:00 →',await orden());
if(w===400)await p.screenshot({path:SP+'/flechas400.png',fullPage:true});else await p.screenshot({path:SP+'/flechas1100.png'});
console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');await p.close();}
await b.close();})();
