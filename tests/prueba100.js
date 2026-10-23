// Pedidos: al mandar los tildados a un camión, quedan en el orden en que se tildaron (al final de los que ya tenía).
const {chromium}=require('playwright');const F='2026-10-27';
const P=(c,cam)=>({cliente:c,entrega:F,medias:10,peso:'',nota:'',origen:'manual',kg:'',camion:cam,cuenta:'',cortes:[]});
const data={faena:{},produccion:{},privado:{},config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'SEMI PASSERI',hora:'10:00',kg:0,orden:['a']}],pedidos:[]}},
 pedidos:{a:P('MAFER','c1'),b:P('GANADOS',''),c:P('HERNANDEZ NICOLAS',''),d:P('EMERIC',''),e:P('ALICAN','')}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-23T17:30:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);
 for(let i=0;i<3;i++){ if((await p.locator('#view-pedidos .nav-ped .tit').innerText()).includes('27'))break; await p.click('#view-pedidos [data-act="pd"][data-d="1"]');await p.waitForTimeout(150);}
 const orden=()=>p.evaluate(()=>{const l=window.__mock.data.config['log-2026-10-27'];const c=l.camiones[0];return c.orden.map(id=>l.pedidos.find(x=>x.id===id).cliente).join(' > ');});
 // Tildo EMERIC, después GANADOS, después HERNANDEZ (destildo y vuelvo a tildar GANADOS: pasa al final).
 for(const id of ['d','b','c']){await p.locator('input[data-sel="'+id+'"]').check();await p.waitForTimeout(80);}
 await p.locator('input[data-sel="b"]').uncheck();await p.waitForTimeout(80);await p.locator('input[data-sel="b"]').check();await p.waitForTimeout(80);
 await p.selectOption('#cam-a','d:c1');await p.clock.runFor(1500);await p.waitForTimeout(200);
 console.log('=== ',w,'barra → camión:',await orden());
 // Con el cartelito de un tildado también respeta el orden.
 await p.locator('input[data-sel="e"]').check();await p.waitForTimeout(80);
 await p.click('.cam-chip[data-id="e"]');await p.click('.cam-menu [data-act="camp-set"][data-v="d:c1"]');await p.clock.runFor(1500);await p.waitForTimeout(200);
 console.log('cartelito → camión:',await orden());
 console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');}
await b.close();})();
