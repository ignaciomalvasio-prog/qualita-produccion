// Pedidos: el corte (rubro) de cada renglón se cambia tocándolo, sin Editar.
const {chromium}=require('playwright');const F='2026-11-05';
const ped={a:{cliente:'DINO',entrega:F,medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'1',corte:'PECHO',texto:'450KG COSTELETA DE CERDO'},{k:'2',corte:'MATAMBRE',texto:'300KG'}]}};
const data={faena:{},produccion:{},privado:{},config:{general:{}},pedidos:ped};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1366,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-11-04T11:30:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForTimeout(200);
await p.evaluate(()=>document.querySelector('.ped[data-ped="a"] [data-act="ped-abrir"]').click());await p.waitForTimeout(200);
console.log(w,'selects:',await p.locator('select[data-rubro="a"]').count(),await p.locator('.lc-corte').count(),await p.locator('.ped.abierto').count());
await p.selectOption('select[data-rubro="a"][data-k="1"]','CARRE CON SOLOMILLO');await p.clock.runFor(800);await p.waitForTimeout(250);
console.log(w,'guardado:',await p.evaluate(()=>window.__mock.data.pedidos.a.cortes.map(c=>c.corte+'='+c.texto).join(', ')));
await p.waitForTimeout(400);if(w===1366)await p.screenshot({path:'/tmp/claude-0/-home-claude/d55ee530-b6ab-5c24-b297-7bd58dddd042/scratchpad/p138.png'});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
