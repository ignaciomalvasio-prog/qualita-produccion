const {chromium}=require('playwright');const SP=process.argv[2];
(async()=>{const b=await chromium.launch();
const p=await b.newPage({viewport:{width:400,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{window.__mock={data:{ventas:{}},user:{email:'ana@x.com'},vendedores:{'ana@x.com':{nombre:'Ana'}}}});
await p.goto('http://127.0.0.1:8765/vendedor.html');await p.waitForSelector('#adj');
await p.click('[data-act="adj-enviar"]');console.log('vacío →',await p.locator('#adj-aviso').innerText());
await p.setInputFiles('#adj-fotos',[SP+'/ped400.png',SP+'/v-form1100.png']);await p.waitForSelector('.mini img');await p.waitForTimeout(300);
console.log('miniaturas:',await p.locator('#adj .mini').count());
await p.fill('#adj-msg','Para el martes, todo fresco');
await p.locator('#adj [data-act="adj-quitar"]').nth(1).click();console.log('tras quitar una:',await p.locator('#adj .mini').count(),'· mensaje sigue:',await p.inputValue('#adj-msg'));
await p.screenshot({path:SP+'/v-adj400.png',fullPage:true});
await p.click('[data-act="adj-enviar"]');await p.waitForTimeout(400);
const vs=await p.evaluate(()=>window.__mock.data.ventas);const v=Object.values(vs)[0];
console.log('enviado →',await p.locator('#adj-aviso').innerText(),'· doc:',v.tipo,v.fotos.length,'foto(s),',Math.round(v.fotos[0].length/1024)+'KB,','mensaje:',v.mensaje,'· cliente:',JSON.stringify(v.cliente),'entrega:',JSON.stringify(v.entrega));
console.log('lista:',(await p.locator('.mio').first().innerText()).replace(/\s+/g,' '));
console.log('errores vendedor:',errs.join('|')||'ninguno');
// Renzo lo lee
const id=Object.keys(vs)[0];
const data={faena:{},produccion:{},config:{general:{}},privado:{ia:{clave:'x'}},pedidos:{},ventas:vs};
for(const w of [1100,400]){const q=await b.newPage({viewport:{width:w,height:900}});const e2=[];q.on('pageerror',e=>e2.push(e.message));
await q.clock.install({time:new Date('2026-10-08T10:10:00-03:00')});
await q.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],
  ia:(n,extra)=>({pedidos:[{cliente:'LA ESQUINA',entrega:'2026-10-13',medias:4,peso:'',frio:'FRESCO',nota:'',dudas:[],cortes:[{corte:'PECHO',texto:'5 CAJAS',orden:true}]},{cliente:'DON PEPE',entrega:'2026-10-13',medias:0,peso:'',frio:'',nota:'',dudas:[],cortes:[{corte:'BONDIOLA',texto:'2 CAJAS',orden:true}]}],planilla:[],_extra:extra})}},data);
await q.goto('http://127.0.0.1:8765/index.html#pedidos');await q.clock.runFor(1500);await q.waitForSelector('#ventas');
console.log('=== ancho',w,'panel:',(await q.locator('#ventas .venta').innerText()).replace(/\s+/g,' ').slice(0,200));
await q.click('[data-act="v-ver"]');console.log('agrandada:',await q.locator('.v-fotos.grande').count());
if(w===400)await q.screenshot({path:SP+'/vr-adj400.png',fullPage:true});else await q.screenshot({path:SP+'/vr-adj1100.png',fullPage:true});
await q.click('[data-act="v-leer"]');await q.clock.runFor(3000);await q.waitForTimeout(200);
const m=await q.evaluate(()=>window.__mock.data);
console.log('pedidos:',JSON.stringify(Object.values(m.pedidos).map(x=>[x.cliente,x.entrega,x.vendedorNombre,x.origen])));
console.log('venta:',m.ventas[id].estado,m.ventas[id].leidos,m.ventas[id].clientes,'· panel queda:',await q.locator('#ventas').count(),'· aviso:',await q.locator('#toast').innerText());
console.log('desborde:',await q.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',e2.join('|')||'ninguno');await q.close();}
await b.close();})();
