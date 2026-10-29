// Centro de desposte › DDJJ desposte: un artículo nuevo (251 PANCETA CON CUERO) se puede mandar a un renglón agregado a mano
// ("Otro (escribir el nombre)"): solo ese día o para siempre (queda como renglón fijo en Equivalencias). Pedido de Sabi 29/10.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-28';
const TXT=['OK|2026-10-28 19:00','TR|2026-10-28|261799|160|2026-10-27|318|25440',
 'RE|2026-10-28|101|BONDIOLA|1|64|554|1355.97','RE|2026-10-28|251|PANCETA CON CUERO|1|1|0|9.06'].join('\n');
const docs=()=>({'ddjj-2026-10':{dias:{[F]:{prod:{'Panceta con cuero':{cant:null,exp:null,cons:0,dest:'CONSUMO'}}}}}});
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
const abrir=async w=>{const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-29T09:00:00-03:00')});
 await p.addInitScript(m=>{window.__mock=m},{user:{email:'ssaavedra@x.com',displayName:'Saavedra',emailVerified:true},rol:'ddjj',sis:{'dj-2026-10':TXT},docs:docs()});
 await p.goto('http://127.0.0.1:8765/ddjj.html?f='+F);await p.clock.runFor(1500);await p.waitForSelector('.dj-nuevos select');return {p,errs};};
const fila=p=>p.evaluate(()=>{const r=planilla(S.fecha).filas.find(z=>z.n==='Panceta con cuero');return r?r.cant+'|'+r.exp+'|'+r.cons+'|'+r.dest+'|'+(r.manual?'agregado':'sistema'):'no está';});
// 1) solo este día
let {p,errs}=await abrir(1300);
const opc=await p.evaluate(()=>[...document.querySelectorAll('.dj-nuevos select optgroup')].map(g=>g.label+': '+[...g.children].length));
ok(opc.some(o=>o.startsWith('Agregados en este día: 1')),'el renglón agregado aparece en "Elegir…" ('+opc.join(' · ')+')');
await p.selectOption('.dj-nuevos select','N:Panceta con cuero');await p.waitForTimeout(200);
await p.click('#mv-dia');await p.waitForTimeout(400);
ok(await fila(p)==='null|null|9.06|CONSUMO|sistema','solo este día: el renglón toma los 9,06 kg del sistema ('+await fila(p)+')');
ok(await p.locator('.dj-nuevos').count()===0,'ya no queda como artículo sin asignar');
ok(await p.evaluate(()=>!eq().lineas.some(l=>l.n==='Panceta con cuero')),'no cambia las equivalencias');
await p.screenshot({path:SP+'/ddjj-agregado.png',fullPage:true});
ok(!errs.length,'errores: '+(errs.join('|')||'ninguno'));await p.close();
// 2) para siempre (y en celular)
({p,errs}=await abrir(400));
await p.selectOption('.dj-nuevos select','N:Panceta con cuero');await p.waitForTimeout(200);
await p.click('#mv-siempre');await p.waitForTimeout(600);
ok(await p.evaluate(()=>JSON.stringify(window.__mock.docs['ddjj-equiv'].lineas.find(l=>l.n==='Panceta con cuero')))==='{"n":"Panceta con cuero","arts":[251]}','siempre: queda como renglón fijo con el artículo 251');
ok(await fila(p)==='null|null|9.06|CONSUMO|sistema','siempre: el renglón sale del sistema ('+await fila(p)+')');
ok(await p.locator('.dj-nuevos').count()===0,'siempre: ya no queda sin asignar');
// "Mandarlo a" también ofrece los agregados: se agrega otro a mano y se manda Bondiola ahí solo este día
await p.evaluate(()=>cambiarDia(x=>{x.prod['Otro corte']={cant:null,exp:null,cons:0,dest:'CONSUMO'};},'prueba'));await p.waitForTimeout(300);
await p.click('a.dj-n:has-text("Bondiola")');await p.waitForTimeout(200);
ok(await p.locator('select.dj-mover option[value="N:Otro corte"]').count()===1,'"Mandarlo a" ofrece el renglón agregado');
ok(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=0,'400 sin desborde');
ok(!errs.length,'errores: '+(errs.join('|')||'ninguno'));await p.close();
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
