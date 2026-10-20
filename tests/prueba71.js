// Logística: precio sin IVA o final (IVA 10,5 %): se escribe uno y se calcula el otro; el link compartido los muestra sin poder cambiarlos.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-21';
const K=(k,corte,texto,ext)=>Object.assign({k,corte,texto},ext||{});
const data={faena:{},produccion:{},privado:{clientes:{lista:[]}},config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'',num:'SEMI PASSERI 1 (DIGAR)',hora:'05:00',orden:['a']},{id:'c2',nombre:'',num:'7',hora:'06:00',orden:[]}],pedidos:[]}},
 pedidos:{a:{cliente:'DIGAR',entrega:F,medias:360,peso:'',nota:'',origen:'manual',kg:'',camion:'c1',cuenta:'21580',frio:'FRESCO',cortes:[K('k0','BONDIOLA','2000 KG BONDIOLA FRESCA'),K('k1','PECHO','100 KG PECHITO',{precio:5000,iva:'final'})]}}};
(async()=>{const b=await chromium.launch();
for(const w of [1280,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-20T13:00:00-03:00')});
await p.addInitScript(d=>{window.print=()=>{};window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForSelector('#view-logistica .nav');
for(let k=0;k<3&&!(await p.locator('.log-ped').count());k++){await p.click('[data-act="fl"][data-d="1"]');await p.waitForTimeout(100);}
console.log(w,'títulos:',await p.$$eval('.cam>.cam-cab h2',x=>x.map(e=>e.textContent).join(' | ')));
const val=(k,c)=>p.inputValue('[data-plog="a"][data-k="'+k+'"][data-cual="'+c+'"]');
console.log(w,'pecho ya cargado (5000 final): sin IVA',await val('k1','iva'),'· final',await val('k1','final'));
// medias: escribir sin IVA
await p.fill('[data-plog="a"][data-k="m"][data-cual="iva"]','3000');await p.locator('[data-plog="a"][data-k="m"][data-cual="iva"]').dispatchEvent('input');
console.log(w,'medias en vivo → final:',await val('m','final'));
await p.locator('[data-plog="a"][data-k="m"][data-cual="iva"]').dispatchEvent('change');await p.clock.runFor(1500);await p.waitForTimeout(200);
// bondiola: escribir final
await p.fill('[data-plog="a"][data-k="k0"][data-cual="final"]','4420');await p.locator('[data-plog="a"][data-k="k0"][data-cual="final"]').dispatchEvent('input');await p.locator('[data-plog="a"][data-k="k0"][data-cual="final"]').dispatchEvent('change');await p.clock.runFor(1500);await p.waitForTimeout(200);
console.log(w,'guardado:',await p.evaluate(()=>{const x=window.__mock.data.pedidos.a;return 'medias '+x.precioMedias+' '+x.ivaMedias+' · '+x.cortes.map(c=>c.corte+' '+c.precio+' '+c.iva).join(' · ');}));
console.log(w,'bondiola sin IVA calculado:',await val('k0','iva'));
await p.screenshot({path:SP+'/precioslog'+w+'.png',fullPage:true});
await p.emulateMedia({media:'print'});console.log(w,'impreso:',(await p.locator('.log-cortes').first().innerText()).replace(/\s+/g,' '));await p.emulateMedia({media:'screen'});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');
// link compartido con lo publicado
const pub=await p.evaluate(()=>JSON.parse(JSON.stringify(window.__mock.data)));
const q=await b.newPage({viewport:{width:w,height:900}});await q.clock.install({time:new Date('2026-10-20T13:00:00-03:00')});
await q.addInitScript(d=>{window.__mock={data:d,user:{email:'yo@x.com'},editores:['yo@x.com']}},pub);
await q.goto('http://127.0.0.1:8765/logistica.html');await q.clock.runFor(1500);await q.waitForTimeout(300);
for(let k=0;k<3&&!(await q.locator('.log-ped').count());k++){await q.click('[data-act="fl"][data-d="1"]').catch(()=>{});await q.waitForTimeout(100);}
console.log(w,'link: casilleros',await q.locator('[data-plog], input').count(),'· precios:',await q.$$eval('.log-precio',x=>x.map(e=>e.textContent).join(' | ')));
await q.screenshot({path:SP+'/precioslink'+w+'.png',fullPage:true});}
await b.close();})();
