// "+ Sumar a camión": se puede escribir el nombre de un camión nuevo ahí mismo y el cliente queda adentro.
const {chromium}=require('playwright');const F='2026-11-02';
const P=(c,cam)=>({cliente:c,entrega:F,medias:20,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cuenta:'',cortes:[]});
const ped={a:P('GANADOS'),b:P('HONORIO'),c:P('NOVICERD','c1')};
const data={faena:{},produccion:{},privado:{},config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'LAGUI',orden:['c']}],pedidos:Object.keys(ped).map(k=>Object.assign({id:k},ped[k]))}},pedidos:ped};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-30T14:30:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForTimeout(200);
await p.click('[data-act="camp-menu"][data-id="a"]');await p.waitForTimeout(150);
await p.fill('#camp-nombre-a','seba diaz');await p.locator('#camp-nombre-a').press('Enter');await p.clock.runFor(800);await p.waitForTimeout(300);
const cams=()=>p.evaluate(F=>window.__mock.data.config['log-'+F].camiones.map(c=>c.nombre+':'+(c.orden||[]).join('')).join(' | '),F);
console.log(w,'camiones:',await cams(),'· GANADOS en:',await p.evaluate(()=>window.__mock.data.pedidos.a.camion!==''));
await p.click('[data-act="camp-menu"][data-id="b"]');await p.waitForTimeout(150);await p.fill('#camp-nombre-b','Seba Diaz');await p.click('[data-act="camp-crear"][data-id="b"]');await p.clock.runFor(800);await p.waitForTimeout(300);
console.log(w,'mismo nombre no duplica:',await cams());
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
