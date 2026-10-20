// Pedidos agrupados por camión: arrastrar desde ⠿ cambia el orden de bajada y, soltando en otro grupo, el camión.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-21';
const P=(c,m,cam)=>({cliente:c,entrega:F,medias:m,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cuenta:'',cortes:[]});
const data={faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:null,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[{origen:'X',propios:100,usuarios:0}],clientes:[]}))}},produccion:{},privado:{clientes:{lista:[]}},
 config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'SEMI PASSERI 2',hora:'03:00',orden:['a','b','c']},{id:'c2',nombre:'LAGUI',hora:'05:00',orden:['d']}],pedidos:[]}},
 pedidos:{a:P('GUTIERREZ HNOS',10,'c1'),b:P('FRIG. AVENIDA',20,'c1'),c:P('GANADERA GRACIOTIN',30,'c1'),d:P('DINO DON BOSCO',4,'c2'),e:P('COLAZO',12)}};
(async()=>{const b=await chromium.launch();
for(const w of [1280,400]){const p=await b.newPage({viewport:{width:w,height:900},hasTouch:w<500});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-20T13:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForSelector('#view-pedidos .ped');
const grupos=()=>p.$$eval('.grupo-cam',g=>g.map(x=>(x.getAttribute('data-gcam')||'sin')+':'+[...x.querySelectorAll('.ped .nom')].map(n=>n.textContent).join(',')).join(' | '));
const orden=()=>p.evaluate(()=>window.__mock.data.config['log-2026-10-21'].camiones.map(c=>c.id+'='+c.orden.join(',')).join(' '));
const arrastrar=async(de,a,abajo)=>{await p.locator('.ped',{hasText:a}).evaluate(e=>e.scrollIntoView({block:'center'}));await p.waitForTimeout(50);const h=await p.locator('.ped',{hasText:de}).locator('.ped-mover').boundingBox();const t=await p.locator('.ped',{hasText:a}).boundingBox();
 await p.mouse.move(h.x+h.width/2,h.y+h.height/2);await p.mouse.down();await p.mouse.move(t.x+40,t.y+(abajo?t.height-4:4),{steps:8});await p.mouse.up();await p.clock.runFor(1500);await p.waitForTimeout(300);};
console.log(w,'antes:',await grupos());
await p.screenshot({path:SP+'/arrped'+w+'.png'});
await arrastrar('GANADERA GRACIOTIN','GUTIERREZ HNOS',false);
console.log(w,'GANADERA primero:',await grupos(),'· log:',await orden());
await arrastrar('COLAZO','DINO DON BOSCO',true);
console.log(w,'COLAZO a LAGUI:',await grupos(),'· camión:',await p.evaluate(()=>window.__mock.data.pedidos.e.camion),'· log:',await orden());
// teclado
await p.locator('.ped',{hasText:'COLAZO'}).locator('.ped-mover').focus();await p.keyboard.press('ArrowUp');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'teclado ↑:',await orden());
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
