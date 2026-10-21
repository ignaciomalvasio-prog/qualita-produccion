const {chromium}=require('playwright');const SP=process.argv[2];
const P=(c,f)=>({cliente:c,entrega:f,medias:10,peso:'',nota:'',origen:'manual',kg:'',camion:'',cortes:[]});
const peds={a:P('AYER','2026-10-07'),b:P('HOY','2026-10-08'),c:P('MAÑANA 1','2026-10-09'),d:P('MAÑANA 2','2026-10-09'),e:P('LUNES','2026-10-12'),f:P('MARTES','2026-10-13')};
const data={faena:{'2026-10-05':{desde:'2026-10-05',stockInicial:0,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-0'+(5+i),faena:[{origen:'X',propios:1,usuarios:0}],clientes:[]}))}},produccion:{},config:{general:{}},pedidos:peds,privado:{ia:{clave:'x'}}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>{errs.push(e.message);console.log('PAGEERROR',e.message)});
await p.clock.install({time:new Date('2026-10-08T10:10:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:null,editores:['yo@example.com'],loginAs:'yo@example.com'}},data);
const esp=async(ms=400)=>{await p.clock.runFor(ms);await p.waitForTimeout(60)};
const ver=async()=>(await p.locator('#view-pedidos .nav-ped .tit').innerText()).replace(/\s+/g,' ')+' → '+((await p.locator('#view-pedidos .ped .nom').allInnerTexts()).join(', ')||'(sin pedidos)');
console.log('=== ancho',w);
await p.goto('http://127.0.0.1:8765/index.html');await p.waitForSelector('.tile');await p.click('[data-act="ingresar"]');await p.click('[data-acc="google"]');await esp(1200);
await p.click('#tab-pedidos');await p.waitForSelector('.nav-ped');
console.log('al entrar:',await ver());
console.log('otros días:',(await p.locator('.otros-dias .btn').allInnerTexts()).map(t=>t.replace(/\s+/g,' ')).join(' | '));
if(w===400)await p.screenshot({path:SP+'/ped-dia400.png'});else await p.screenshot({path:SP+'/ped-dia1100.png'});
await p.click('[data-act="pd"][data-d="-1"]');console.log('‹:',await ver());
await p.click('[data-act="pd"][data-d="-1"]');console.log('‹:',await ver());
await p.click('[data-act="pd-ir"]:has-text("Volver a mañana")');console.log('volver:',await ver());
await p.click('[data-act="pd"][data-d="1"]');console.log('› (salta el fin de semana):',await ver());
await p.click('.otros-dias [data-act="pd-ir"] >> nth=-1');console.log('chip último:',await ver());
await p.fill('#pd-fecha','2026-10-07');await p.locator('#pd-fecha').dispatchEvent('change');console.log('fecha 7/10:',await ver());
// cambiar de día un pedido: me quedo en el día donde estaba
await p.click('[data-act="pd-ir"]:has-text("Volver a mañana")');await p.locator('.ped',{hasText:'MAÑANA 1'}).locator('[data-act="ped-abrir"] .nom').click();
await p.locator('.ped',{hasText:'MAÑANA 1'}).locator('select[data-mover]').selectOption('2026-10-12');await esp(900);
console.log('después de mover MAÑANA 1 al lunes:',await ver(),'· aviso:',await p.locator('#toast').innerText());
// ir a inicio y volver: arranca otra vez en mañana
await p.click('[data-act="pd"][data-d="1"]');await p.click('#logo');await p.click('#tab-pedidos');console.log('inicio y volver:',await ver());
console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores:',errs.join('|')||'ninguno');await p.close();}
await b.close();})();
