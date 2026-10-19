// Logística: el nombre del camión se muestra sin la palabra "Camión" adelante (en la tarjeta, el Resumen y el link para compartir).
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-19';
const P=(c,cam,m)=>({cliente:c,entrega:F,medias:m||0,peso:'',nota:'',origen:'manual',kg:'',camion:cam,cuenta:'',cortes:[]});
const data={faena:{},produccion:{},privado:{clientes:{lista:[]}},config:{general:{},['log-'+F]:{fecha:F,camiones:[
 {id:'c1',nombre:'Camión MAXIMO (PRIMER VIAJE)',hora:'00:00',orden:['a']},{id:'c2',nombre:'CAMION MAXIMO (SEGUNDO VIAJE)',hora:'01:00',orden:['b']},{id:'c3',nombre:'LAGUI',hora:'03:00',orden:[]}],pedidos:[]}},
 pedidos:{a:P('NOVICERD','c1',100),b:P('DON PEDRO','c2',4)}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-16T12:00:00-03:00')});
await p.addInitScript(d=>{window.print=()=>{};window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForSelector('#view-logistica .nav');
for(let k=0;k<3&&!(await p.locator('.log-ped').count());k++){await p.click('[data-act="fl"][data-d="1"]');await p.waitForTimeout(100);}
const txt=(await p.locator('#view-logistica').innerText());
console.log(w,'tarjetas:',(txt.match(/[^\n]*\((PRIMER|SEGUNDO) VIAJE\)[^\n]*/gi)||[]).join(' | '),'· dice "camión maximo":',/cami[oó]n\s+maximo/i.test(txt));
await p.click('text=Resumen del día');await p.waitForTimeout(200);
console.log(w,'resumen:',await p.$$eval('.res-tit mark',m=>m.map(x=>x.innerText.replace(/\s+/g,' ').trim()).join(' | ')));
await p.screenshot({path:SP+'/nomcam'+w+'.png',fullPage:true});
console.log(w,'publicado:',await p.evaluate(()=>window.__mock.data.config['log-2026-10-19'].camiones.map(c=>c.nombre).join(' | ')),'· desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
