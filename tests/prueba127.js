// Buscar camión: todos los viajes desde el principio (también los de hace más de 45 días, que se leen una sola vez al buscar).
const {chromium}=require('playwright');
const P=(c,f,cam)=>({cliente:c,entrega:f,medias:50,peso:'',nota:'',origen:'manual',kg:2350,camion:cam,cuenta:'',cortes:[]});
const ped={a:P('COLDCUTS FOOD','2026-10-28','c1'),b:P('MAIDANA','2026-11-02','fE'),c:P('CABAÑAS','2026-11-02','fE'),d:P('VIEJO','2026-08-03','c9'),e:P('OTRO','2026-10-28','c2')};
const lg=(f,cams,ids)=>({fecha:f,camiones:cams,pedidos:ids.map(k=>Object.assign({id:k},ped[k]))});
const data={faena:{},produccion:{},privado:{},config:{general:{},'log-2026-10-28':lg('2026-10-28',[{id:'c1',nombre:'ENRIQUE GRENETIHER',hora:'03:00',orden:['a']},{id:'c2',nombre:'LAGUI',orden:['e']}],['a','e']),'log-2026-11-02':lg('2026-11-02',[{id:'fE',nombre:'ENRIQUE GRENETHIER',hora:'05:00',orden:['b','c']}],['b','c']),'log-2026-08-03':lg('2026-08-03',[{id:'c9',nombre:'Enrique',hora:'',orden:['d']}],['d'])},pedidos:{a:ped.a,b:ped.b,c:ped.c,e:ped.e}};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-30T08:28:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:d,user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);
await p.fill('#pd-cam-buscar','enrique');await p.locator('#pd-cam-buscar').dispatchEvent('input');await p.clock.runFor(500);await p.waitForTimeout(300);
console.log(w,'Pedidos:',(await p.locator('#view-pedidos .busq').innerText()).replace(/\s+/g,' '));
await p.locator('[data-act="busq-cam"][data-f="2026-08-03"]').click();await p.waitForTimeout(200);console.log(w,'Ver el viejo → día:',await p.locator('.nav-ped .tit').innerText());
await p.click('[data-tab="logistica"]:visible');await p.waitForTimeout(200);await p.fill('#lg-cam-buscar','enrique');await p.locator('#lg-cam-buscar').dispatchEvent('input');await p.waitForTimeout(300);
console.log(w,'Logística:',(await p.locator('#view-logistica .busq').innerText()).replace(/\s+/g,' ').slice(0,200));
await p.locator('[data-act="lbusq-ver"][data-f="2026-08-03"]').click();await p.waitForTimeout(300);console.log(w,'Logística viejo → camiones:',(await p.locator('#view-logistica section.cam h2').allInnerTexts()).join(','));
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
