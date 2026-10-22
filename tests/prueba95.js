// Pedidos: al lado de fresco/congelado, un cartelito para sumar el pedido a un camión (o cambiarlo / sacarlo) sin tildar.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-22';
const P=(c,cam)=>({cliente:c,entrega:F,medias:10,peso:'',nota:'',origen:'manual',kg:'',camion:cam,cuenta:'',frio:'FRESCO',cortes:[]});
const cams=[{id:'c1',nombre:'SEMI PASSERI 1',hora:'10:00',kg:24000,orden:['a']}];
const data={faena:{},produccion:{},privado:{},config:{general:{},['log-'+F]:{fecha:F,camiones:cams,pedidos:[]}},pedidos:{a:P('COTO','c1'),b:P('BRACCO',''),c:P('GRION','')}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-21T17:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForSelector('.ped');
 const chips=()=>p.$$eval('.ped',ps=>ps.map(x=>x.querySelector('.nom').innerText+': '+(x.querySelector('.cam-chip')||{innerText:'-'}).innerText).join(' | '));
 const cam=id=>p.evaluate(i=>window.__mock.data.pedidos[i].camion||'(sin)',id);
 console.log('=== ',w,'antes:',await chips());
 await p.click('.cam-chip[data-id="b"]');await p.waitForSelector('.cam-menu');
 console.log('menú:',(await p.locator('.cam-menu').innerText()).replace(/\s+/g,' '));
 if(w===400)await p.screenshot({path:SP+'/ped-cam-menu.png',fullPage:false});
 await p.click('.cam-menu [data-act="camp-set"][data-v="d:c1"]');await p.clock.runFor(1500);await p.waitForTimeout(200);
 console.log('BRACCO → c1:',await cam('b'),'· publicado:',await p.evaluate(()=>JSON.stringify((window.__mock.data.config['log-2026-10-22'].pedidos||[]).filter(x=>x.camion==='c1').map(x=>x.cliente))),'· aviso:',await p.evaluate(()=>{const a=document.querySelector('.aviso,#aviso,.toast');return a?a.innerText:'';}));
 await p.click('.cam-chip[data-id="b"]');await p.click('.cam-menu [data-act="camp-set"][data-v=""]');await p.clock.runFor(1500);await p.waitForTimeout(200);
 console.log('sacar BRACCO:',await cam('b'));
 await p.click('.cam-chip[data-id="c"]');await p.click('.cam-menu [data-act="camp-otro"]');await p.waitForTimeout(200);
 console.log('otro camión → tildados:',await p.evaluate(()=>[...document.querySelectorAll('input[data-sel]:checked')].map(x=>x.dataset.sel).join(',')),'· campo N° con foco:',await p.evaluate(()=>document.activeElement.id));
 console.log('después:',await chips());
 // Con varios tildados, el camión elegido en uno va para todos los tildados.
 await p.click('[data-act="sel-nada"]').catch(()=>{});await p.waitForTimeout(100);
 await p.check('input[data-sel="b"]');await p.check('input[data-sel="c"]');await p.waitForTimeout(100);
 await p.click('.cam-chip[data-id="c"]');console.log('menú tildados:',(await p.locator('.cam-menu .small').innerText()));
 await p.click('.cam-menu [data-act="camp-set"][data-v="d:c1"]');await p.clock.runFor(1500);await p.waitForTimeout(200);
 console.log('tildados → c1: BRACCO',await cam('b'),'GRION',await cam('c'),'· aviso:',await p.evaluate(()=>{const a=document.querySelector('.aviso,#aviso,.toast');return a?a.innerText:'';}),'· quedan tildados:',await p.locator('input[data-sel]:checked').count());
 if(w===1100)await p.screenshot({path:SP+'/ped-cam.png',fullPage:true});
 console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');}
await b.close();})();
