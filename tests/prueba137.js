// Pedidos: el camión se edita (nombre, capacidad, nota) y se borra desde el ⋯ del título del camión.
const {chromium}=require('playwright');const F='2026-11-05';
const P=(c,cam)=>({cliente:c,entrega:F,medias:20,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cuenta:'',cortes:[]});
const ped={a:P('NOVICERD','c1'),b:P('URCA','c1'),c:P('GRION')};
const data={faena:{},produccion:{},privado:{},config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'MAXIMO (PRIMER VIAJE)',hora:'02:00',orden:['a','b']},{id:'c2',nombre:'LUCAS',orden:[]}],pedidos:Object.keys(ped).map(k=>Object.assign({id:k},ped[k]))}},pedidos:ped};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-11-04T11:30:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForTimeout(200);
const cams=()=>p.evaluate(F=>window.__mock.data.config['log-'+F].camiones.map(c=>c.nombre+'/'+(c.kg||'')+'/'+(c.nota||'')+'/'+(c.hora||'')+':'+(c.orden||[]).join('')).join(' | '),F);
await p.click('.grupo-cam[data-gcam="c1"] .mas-btn');await p.waitForTimeout(150);
const bt=p.locator('[data-act="pcam-editar"]');await bt.scrollIntoViewIfNeeded();const bx=await bt.boundingBox();
console.log(w,'menu tocable:',await p.evaluate(b=>{const e=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return e&&e.closest('[data-act]')?e.closest('[data-act]').dataset.act:'tapado'},bx));
await bt.click();await p.waitForTimeout(150);
await p.fill('#cam-e-nombre','maximo segundo');await p.fill('#cam-e-kg','9000');await p.fill('#cam-e-nota','chofer ok');
await p.click('[data-act="pcam-guardar"]');await p.clock.runFor(800);await p.waitForTimeout(250);
console.log(w,'editado:',await cams(),'· título:',await p.locator('.grupo-cam[data-gcam="c1"] .badge.cam-ped').innerText());
await p.click('.grupo-cam[data-gcam="c2"] .mas-btn');await p.waitForTimeout(150);
await p.click('[data-act="pcam-borrar"][data-i="c2"]');await p.waitForTimeout(100);await p.click('[data-act="pcam-borrar"][data-i="c2"]');await p.clock.runFor(800);await p.waitForTimeout(250);
console.log(w,'borrado:',await cams());
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
