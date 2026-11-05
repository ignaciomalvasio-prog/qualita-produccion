// Clientes → Kilos por sucursal: cuadro de kilos por sucursal y semana, con Córdoba y Mendoza (Las Heras, San Martín) aparte.
const {chromium}=require('playwright');const SP=process.argv[2]||'.';
const SUC=['ALTA GRACIA','LAS HERAS','RUTA 20','SAN MARTIN'],ped={};let i=0;
['2026-10-14','2026-10-21','2026-10-28','2026-11-04'].forEach((f,w)=>SUC.forEach((s,k)=>{ped['p'+(i++)]={cliente:'DINO '+s,entrega:f,medias:0,peso:'',nota:'',origen:'manual',kg:String(100*(k+1)+w*10),kgManual:true,camion:'',cuenta:'',cortes:[{corte:'PECHO',texto:(100*(k+1)+w*10)+'KG PECHO'}]};}));
ped.x={cliente:'DINO RUTA 20',entrega:'2026-11-03',medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{corte:'JAMON',texto:'50KG JAMON'}]};
const data={faena:{},produccion:{},privado:{},config:{general:{}},pedidos:ped};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:1000}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-11-04T10:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#clientes');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'cuadro:',await p.evaluate(()=>[...document.querySelectorAll('.rep-ss tr')].map(r=>r.innerText.replace(/\s+/g,' ')).join(' | ')));
await p.selectOption('#rep-n','8');await p.waitForTimeout(300);
console.log(w,'columnas con 8:',await p.locator('.rep-ss thead th').count());
console.log(w,'chips:',await p.locator('[data-act="rep-dia"]').allInnerTexts());
await p.click('[data-act="rep-dia"][data-f="2026-11-03"]');await p.waitForTimeout(300);
console.log(w,'solo martes:',await p.evaluate(()=>document.querySelector('.rep-dias + .rep-tabla table').innerText.replace(/\s+/g,' ')));
if(w===1366)await p.locator('.rep-ss').screenshot({path:SP+'/p141.png'});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
