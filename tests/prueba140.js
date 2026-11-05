// Subir fotos: antes de leerlas se puede recortar (recuadro con esquinas) o usar entera.
const {chromium}=require('playwright');const SP=process.argv[2]||'.';
const data={faena:{},produccion:{},privado:{clientes:{lista:[]}},config:{general:{}},pedidos:{}};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-11-04T10:00:00-03:00')});
await p.addInitScript(d=>{window.__leidos=[];window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],ia:(n)=>{window.__leidos.push(n);return {pedidos:[]};}}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForTimeout(200);
// imagen de prueba 800x600
await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='#4fa3c5';x.fillRect(0,0,800,600);x.fillStyle='#000';x.fillRect(100,100,200,200);
 const bl=await new Promise(r=>c.toBlob(r,'image/png'));const dt=new DataTransfer();dt.items.add(new File([bl],'pedido.png',{type:'image/png'}));dt.items.add(new File([bl],'otra.png',{type:'image/png'}));
 const i=document.getElementById('fotos');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));});
await p.waitForSelector('.rec-ov');await p.waitForTimeout(200);
console.log(w,'título:',await p.locator('.rec-tit').innerText());
const h=await p.locator('.rec-sel i[data-h="se"]').boundingBox();
await p.mouse.move(h.x+11,h.y+11);await p.mouse.down();await p.mouse.move(h.x-100,h.y-80,{steps:5});await p.mouse.up();
if(w===1366)await p.screenshot({path:SP+'/p140.png'});
await p.click('.rec-ov [data-r="ok"]');await p.waitForTimeout(300);
await p.waitForSelector('.rec-ov');await p.click('.rec-ov [data-r="entera"]');await p.clock.runFor(1500);await p.waitForTimeout(400);
console.log(w,'leídas:',await p.evaluate(()=>window.__leidos.join(' | ')),'· overlay:',await p.locator('.rec-ov').count());
await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
