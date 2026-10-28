// Pedidos: "Duplicar" arma otro pedido igual en Cargar pedidos para cambiarlo antes de guardar; "Copiar texto" copia el pedido.
const {chromium}=require('playwright');
const P=(c,ext)=>Object.assign({cliente:c,entrega:'2026-10-29',medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[]},ext||{});
const data={faena:{},produccion:{},config:{general:{}},privado:{clientes:{lista:[]}},
 pedidos:{a:P('SCIAN ASOCIADOS',{medias:200,cuenta:'21645',frio:'FRESCO',nota:'ENTREGAR TEMPRANO',cortes:[{k:'k0',corte:'PECHO',texto:'200 UNIDADES PECHO',precio:5000},{k:'k1',corte:'CHURRASCO',texto:'100 KG'}]})}};
(async()=>{const b=await chromium.launch();const errs=[];
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-28T12:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);
if(!(await p.locator('[data-act="ped-txt"]').count())){await p.click('[data-act="ped-abrir"][data-id="a"] .nom');await p.waitForTimeout(150);}
await p.click('[data-act="ped-txt"][data-id="a"]');await p.waitForTimeout(150);
console.log(w,'texto copiado:\n'+await p.evaluate(()=>window.__mock.copiado));
await p.click('[data-act="ped-dup"][data-id="a"]');await p.waitForTimeout(200);
console.log(w,'copia: cliente',await p.inputValue('#q0cliente'),'· medias',await p.inputValue('#q0medias'),'· entrega',await p.inputValue('#q0entrega'),'· cortes',await p.inputValue('#q0c0texto'),'/',await p.inputValue('#q0c1texto'));
await p.fill('#q0entrega','2026-10-30');await p.locator('#q0entrega').dispatchEvent('change');
await p.fill('#q0medias','150');await p.locator('#q0medias').dispatchEvent('input');
await p.click('[data-act="q-guardar"][data-q="0"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
const ps=await p.evaluate(()=>Object.values(window.__mock.data.pedidos).map(x=>x.cliente+'@'+x.entrega+' '+x.medias+'m '+x.cortes.map(c=>c.corte+'='+c.texto+(c.precio?' $'+c.precio:'')).join(',')));
console.log(w,'pedidos guardados:',ps.join(' | '));
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
