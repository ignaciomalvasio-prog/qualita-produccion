// Precios al cargar: lo que lee la IA (foto, texto, dictado) trae precio e IVA por corte y de las medias; también se cargan a mano en el formulario.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-21';
const data={faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:null,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[{origen:'X',propios:100,usuarios:0}],clientes:[]}))}},produccion:{},privado:{clientes:{lista:[]},ia:{clave:'x'}},config:{general:{}},pedidos:{}};
const leido={pedidos:[{cliente:'ROVER',entrega:F,medias:10,peso:'',frio:'',nota:'',dudas:[],precioMedias:2850.5,ivaMedias:'iva',cortes:[{corte:'BONDIOLA',texto:'4 CAJAS BONDIOLA',orden:true,precio:4200,iva:'final'},{corte:'PECHO',texto:'100 KG PECHITO',orden:true,precio:0,iva:''}]}],planilla:[]};
(async()=>{const b=await chromium.launch();
for(const w of [1280,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-20T13:00:00-03:00')});
await p.addInitScript(([d,l])=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],ia:()=>JSON.parse(JSON.stringify(l))}},[data,leido]);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForSelector('[data-act="q-pegar"]');
await p.click('[data-act="q-pegar"]');await p.fill('#pegar-txt','rover 10 medias a 2850,50 + iva, 4 cajas bondiola a 4200 final, 100 kg pechito');await p.locator('#pegar-txt').dispatchEvent('input');
await p.click('[data-act="q-leer-texto"]');await p.clock.runFor(2500);await p.waitForTimeout(400);
const g=await p.evaluate(()=>{const x=Object.values(window.__mock.data.pedidos)[0];return x?('medias '+x.precioMedias+' '+x.ivaMedias+' · '+x.cortes.map(c=>c.corte+' '+JSON.stringify(c.precio)+' '+c.iva).join(' · ')):'(no guardado: queda para revisar)';});
console.log(w,'guardado:',g);
if(/no guardado/.test(g)){console.log(w,'form:',await p.$$eval('.card [data-k="precio"],.card [data-k="precioMedias"]',x=>x.map(e=>e.value).join(',')));await p.click('[data-act="q-guardar"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
 console.log(w,'guardado después:',await p.evaluate(()=>{const x=Object.values(window.__mock.data.pedidos)[0];return 'medias '+x.precioMedias+' '+x.ivaMedias+' · '+x.cortes.map(c=>c.corte+' '+JSON.stringify(c.precio)+' '+c.iva).join(' · ');}));}
// a mano
await p.click('[data-act="q-nuevo"]');await p.waitForTimeout(150);
const k=await p.evaluate(()=>{const c=[...document.querySelectorAll('.card')].pop();return c.querySelector('[data-k="cliente"]').getAttribute('data-q');});
await p.fill('#q'+k+'cliente','GRION');await p.locator('#q'+k+'cliente').dispatchEvent('input');
if(!(await p.locator('#q'+k+'c0texto').count())){await p.click('[data-act="q-corte"][data-q="'+k+'"]');await p.waitForTimeout(100);}
await p.fill('#q'+k+'c0texto','3 CAJAS MATAMBRE');await p.locator('#q'+k+'c0texto').dispatchEvent('input');
await p.fill('#q'+k+'c0precio','5100');await p.locator('#q'+k+'c0precio').dispatchEvent('input');
await p.selectOption('#q'+k+'c0iva','iva');
await p.screenshot({path:SP+'/precioform'+w+'.png',fullPage:true});
await p.locator('.card',{has:p.locator('#q'+k+'cliente')}).locator('[data-act="q-guardar"]').click();await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'a mano:',await p.evaluate(()=>{const x=Object.values(window.__mock.data.pedidos).find(v=>v.cliente==='GRION');return x?x.cortes.map(c=>c.corte+' '+JSON.stringify(c.precio)+' '+c.iva).join(' · '):'-';}));
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
