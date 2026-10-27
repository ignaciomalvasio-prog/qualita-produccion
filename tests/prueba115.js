// Medias (vista del día): "Editar" deja cambiar cliente, nota y animales; si viene de un pedido, se cambia el pedido.
const {chromium}=require('playwright');const SP=process.argv[2];
const L='2026-10-26';const dia=(cl)=>({propios:600,usuarios:0,faena:[],clientes:cl});
const ped={a:{cliente:'ESTEMATI NO GORDAS',entrega:'2026-10-29',medias:26,peso:'46 A 48 KG',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[]}};
const sem={id:L,desde:L,dias:[dia([]),dia([]),dia([{cliente:'ESTEMATI NO GORDAS',cant:13,pedido:'a',nota:'46 A 48 KG'},{cliente:'MONTEVERDE',cant:3,nota:'NO GORDAS X FAVOR'}]),dia([]),dia([])]};
const data={faena:{[L]:sem},produccion:{},privado:{clientes:{lista:[]}},config:{general:{}},pedidos:ped};
(async()=>{const b=await chromium.launch();const errs=[];
 for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-27T18:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#medias');await p.clock.runFor(1500);
 const m=p.locator('[data-act="m-dia"]');if(await m.count())await m.click();await p.waitForTimeout(200);
 await p.click('[data-act="fm-ir"][data-f="2026-10-28"]');await p.waitForTimeout(200);
 await p.click('[data-act="md-editar"]');await p.waitForTimeout(200);
 const fila=p.locator('.cl-dia tbody tr').first();
 await fila.locator('[data-k="cliente"]').fill('ESTEMATI');await fila.locator('[data-k="cliente"]').press('Tab');await p.clock.runFor(1500);await p.waitForTimeout(300);
 await p.locator('.cl-dia tbody tr').first().locator('[data-k="nota"]').fill('NO GORDAS 46 A 48 KG');await p.locator('.cl-dia tbody tr').first().locator('[data-k="nota"]').press('Tab');await p.clock.runFor(1500);await p.waitForTimeout(300);
 await p.locator('.cl-dia tbody tr').nth(1).locator('[data-k="cant"]').fill('4');await p.locator('.cl-dia tbody tr').nth(1).locator('[data-k="cant"]').press('Tab');await p.clock.runFor(1500);await p.waitForTimeout(300);
 console.log(w,'pedido:',await p.evaluate(()=>{const x=window.__mock.data.pedidos.a;return x.cliente+' · '+x.peso+' · '+x.medias+' medias';}));
 console.log(w,'planilla:',await p.evaluate(d=>window.__mock.data.faena[d].dias[2].clientes.map(r=>r.cliente+'/'+r.nota+'/'+r.cant).join(' | '),L));
 await p.click('[data-act="md-editar"]');await p.waitForTimeout(200);console.log(w,'vista:',(await p.locator('.cl-dia tbody').innerText()).replace(/\s+/g,' '));
 if(w===400)await p.screenshot({path:SP+'/md.png'});
 console.log(w,'desborde:',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
 console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
