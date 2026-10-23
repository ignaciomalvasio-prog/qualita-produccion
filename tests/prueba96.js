// Pedidos: si un cliente no pudo recibir y el pedido se pasa a otro día, las medias que ya se faenaron no se vuelven
// a sumar a la faena: quedan en el día en que se faenaron ("Ya en cámara"). Se puede marcar o desmarcar a mano.
const {chromium}=require('playwright');const SP=process.argv[2];
const P={cliente:'NOVICERD',entrega:'2026-10-23',medias:84,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'21337',cortes:[]};
const sem={desde:'2026-10-19',stockInicial:0,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[{origen:'',propios:680,usuarios:0}],clientes:i===3?[{cliente:'NOVICERD',cant:42,pedido:'a',nota:''}]:[]}))};
const data={faena:{'2026-10-19':sem},produccion:{},privado:{},config:{general:{}},pedidos:{a:P}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-23T10:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.click('#view-pedidos [data-act="pd"][data-d="-1"]');await p.waitForTimeout(200);await p.waitForSelector('.ped');
 const faena=()=>p.evaluate(()=>{const r=[];Object.values(window.__mock.data.faena).forEach(s=>s.dias.forEach(d=>d.clientes.forEach(c=>{if(c.pedido==='a')r.push(d.fecha+':'+c.cant)})));return r.join(' ')||'(nada)';});
 const ped=()=>p.evaluate(()=>{const x=window.__mock.data.pedidos.a;return x.entrega+' fija='+(x.faenaFija||'-');});
 console.log('=== ',w,'antes:',await ped(),'· faena:',await faena());
 await p.click('.ped[data-ped="a"] .ped-tit .nom');await p.waitForTimeout(150);
 await p.selectOption('select[data-mover="a"]','2026-10-26');await p.clock.runFor(1500);await p.waitForTimeout(300);
 console.log('pasado al lunes:',await ped(),'· faena:',await faena());
 await p.click('#view-pedidos [data-act="pd"][data-d="1"]');await p.clock.runFor(800);await p.waitForTimeout(200);
 if(!(await p.locator('.ped[data-ped="a"].abierto').count()))await p.click('.ped[data-ped="a"] .ped-tit .nom');await p.waitForTimeout(150);
 console.log('en el pedido:',(await p.locator('.ped[data-ped="a"] .op-ped .lp').first().innerText()).replace(/\s+/g,' '));
 if(w===400)await p.screenshot({path:SP+'/ped-camara.png',fullPage:false});
 await p.click('.ped[data-ped="a"] [data-act="mf-set"][data-f=""]');await p.clock.runFor(1500);await p.waitForTimeout(300);
 console.log('faenar de nuevo:',await ped(),'· faena:',await faena());
 await p.click('.ped[data-ped="a"] [data-act="mf-abrir"]');await p.waitForTimeout(100);
 console.log('opciones:',(await p.locator('.mf-menu').innerText()).replace(/\s+/g,' '));
 await p.click('.mf-menu [data-f="2026-10-22"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
 console.log('ya en cámara jue 22:',await ped(),'· faena:',await faena());
 console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');}
await b.close();})();
