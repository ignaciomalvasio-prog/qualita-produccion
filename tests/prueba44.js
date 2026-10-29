const {chromium}=require('playwright');const SP=process.argv[2];
const P=(c,cam)=>({cliente:c,entrega:'2026-10-09',medias:10,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cortes:[]});
const data={faena:{},produccion:{},config:{general:{},'log-2026-10-09':{fecha:'2026-10-09',camiones:[{id:'c1',nombre:'Camión 1',nota:'',kg:0,orden:['a']},{id:'c2',nombre:'Camión 2',nota:'',kg:0,orden:['b']}],pedidos:[]}},pedidos:{a:P('ALFA','c1'),b:P('BETA','c2'),c:P('GAMA')},privado:{}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-08T10:10:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForTimeout(300);if(!(await p.locator('section.cam').count())){await p.fill('#l-fecha','2026-10-09');await p.locator('#l-fecha').dispatchEvent('change');await p.waitForTimeout(200);}await p.waitForSelector('section.cam');
const cab=async()=> (await p.locator('section.cam:not(.suelto) .cam-cab').allInnerTexts()).map(t=>t.replace(/\s+/g,' ').replace(/Imprimir.*$/,'')).join(' | ');
console.log('=== ancho',w,'al abrir:',await cab());
await p.locator('section.cam',{hasText:'Camión 2'}).locator('header [data-act="menu"]').click();await p.locator('section.cam',{hasText:'Camión 2'}).locator('[data-act="camion-subir"]').click();await p.clock.runFor(800);
console.log('subo Camión 2:',await cab());
await p.locator('section.cam',{hasText:'Camión 1'}).locator('[data-act="menu"]').first().click();await p.locator('section.cam',{hasText:'Camión 1'}).locator('[data-act="cam-editar"]').first().click();
await p.fill('#cam-e-nombre','CHAVEZ');await p.click('[data-act="cam-guardar"]');await p.clock.runFor(800);
console.log('renombrado CHAVEZ:',await cab());
if(w===400)await p.screenshot({path:SP+'/cam400.png',fullPage:true});else await p.screenshot({path:SP+'/cam1100.png'});
const lg=await p.evaluate(()=>window.__mock.data.config['log-2026-10-09'].camiones.map(c=>[c.id,c.nombre,c.num]));console.log('guardado:',JSON.stringify(lg));
// armar camión desde pedidos con N°
await p.click('#tab-pedidos');await p.waitForSelector('.ped');await p.locator('.ped',{hasText:'GAMA'}).locator('input[type=checkbox]').check();
await p.selectOption('#cam-a','nuevo').catch(()=>{});await p.waitForTimeout(100);
if(await p.locator('#cam-nombre').count()){console.log('campo N° en la barra:',await p.locator('#cam-num').count());await p.fill('#cam-nombre','LUCAS HEREDIA');await p.click('[data-act="cam-crear"]');await p.clock.runFor(800);}
const lg2=await p.evaluate(()=>window.__mock.data.config['log-2026-10-09'].camiones.map(c=>[c.nombre,c.num]));console.log('tras armar:',JSON.stringify(lg2),'· cartel GAMA:',(await p.locator('.ped',{hasText:'GAMA'}).locator('.cam-chip').innerText().catch(()=>'')).replace(/\s+/g,' '));
console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');await p.close();}
await b.close();})();
