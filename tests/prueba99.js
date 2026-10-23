// Pedidos: en "Sin camión" los últimos pedidos cargados van arriba (así se chequean apenas se cargan).
const {chromium}=require('playwright');const SP=process.argv[2];const F='2026-10-27';
const id=t=>'p'+t.toString(36)+'abcd';
const P=(c,cam,alta)=>({cliente:c,entrega:F,medias:4,peso:'',nota:'',origen:'manual',kg:'',camion:cam,cuenta:'',cortes:[],...(alta?{alta}:{})});
const T=Date.parse('2026-10-23T10:00:00-03:00');
const ped={[id(T)]:P('PRIMERO',''),[id(T+60000)]:P('SEGUNDO',''),[id(T+120000)]:P('TERCERO','c1'),zz1:P('CON ALTA','',T+180000)};
const data={faena:{},produccion:{},privado:{},config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'LUCAS',kg:0,orden:[]}],pedidos:[]}},pedidos:ped};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-23T17:30:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);
 for(let i=0;i<3;i++){ if((await p.locator('#view-pedidos .nav-ped .tit').innerText()).includes('27'))break; await p.click('#view-pedidos [data-act="pd"][data-d="1"]');await p.waitForTimeout(150);}
 const sin=async()=> (await p.locator('.grupo-cam.sin-cam .ped .nom').allInnerTexts()).join(' | ');
 console.log('=== ',w,'sin camión:',await sin());
 console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');}
await b.close();})();
