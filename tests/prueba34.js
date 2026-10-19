const {chromium}=require('playwright');const SP=process.argv[2];
const P=(c,m,cs,cam)=>({cliente:c,entrega:'2026-10-08',medias:m,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cortes:(cs||[]).map((t,i)=>({k:'k'+i,corte:t[0],texto:t[1],orden:true,precio:5800}))});
const peds={pA:P('ALMACOR',0,[['CARRE','107 CAJAS DE 20KG CARRE']],'fa'),pB:P('MOLINA',100,[],'fa'),pC:P('GANADOS',20,[['JAMON','50 UND CON HUESO']],'')};
const data={faena:{'2026-10-05':{desde:'2026-10-05',stockInicial:0,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-0'+(5+i),faena:[{origen:'X',propios:1,usuarios:0}],clientes:[]}))}},produccion:{'2026-10-08':{fecha:'2026-10-08',medias:750,mercado:'',estado:'lista',cortes:[{corte:'JAMON',lineas:[{t:'ALGO'}]}]}},config:{general:{flota:[{id:'a',nombre:'Máximo 1',kg:6000,nota:''}]},
 'log-2026-10-08':{fecha:'2026-10-08',camiones:[{id:'fa',nombre:'Máximo 1',nota:'Sale 6 hs',kg:6000,orden:['pA','pB']}],pedidos:Object.keys(peds).map(id=>({id,cliente:peds[id].cliente,cuenta:id==='pB'?'21607':'',medias:peds[id].medias,peso:'',frio:'',nota:'',camion:peds[id].camion,kg:2000,cortes:peds[id].cortes.map(c=>({corte:c.corte,texto:c.texto}))}))}},pedidos:peds,privado:{ia:{clave:'x'},'fletes-2026-10-08':{fecha:'2026-10-08',camiones:{fa:{modo:'viaje',valor:350000}}}}};
const V='.view:not([hidden]) ';
(async()=>{const b=await chromium.launch();
for(const [w,sesion,url] of [[1100,true,'logistica.html'],[400,false,'index.html?solo=logistica#pedidos'],[1100,true,'index.html']]){const c=await b.newContext({viewport:{width:w,height:900},permissions:['clipboard-read','clipboard-write']});const p=await c.newPage();const errs=[];p.on('pageerror',e=>{errs.push(e.message);console.log('PAGEERROR',e.message)});
await p.clock.install({time:new Date('2026-10-08T07:00:00-03:00')});
await p.addInitScript(([d,s])=>{window.__imp=0;window.print=()=>{window.__imp++};window.__mock={data:JSON.parse(JSON.stringify(d)),user:s?{email:'yo@example.com'}:null,editores:['yo@example.com'],loginAs:'yo@example.com'}},[data,sesion]);
await p.goto('http://127.0.0.1:8765/'+url);await p.clock.runFor(1200);await p.waitForTimeout(150);
console.log('===',url,w,sesion?'con sesión de editor':'sin sesión');
console.log('título:',await p.title(),'· encabezado:',(await p.locator('.marca-nom').innerText()),'· pestañas visibles:',await p.locator('.tabs .tab:visible').count(),'· vista:',await p.evaluate(()=>document.querySelector('.view:not([hidden])').id),'· manifiesto:',await p.locator('link[rel=manifest]').getAttribute('href'));
if(url!=='index.html'){
 console.log('camiones:',(await p.locator(V+'.cam-cab').allInnerTexts()).map(t=>t.replace(/\s+/g,' ')).join(' || '));
 console.log('pedidos:',(await p.locator(V+'.log-cab').allInnerTexts()).map(t=>t.replace(/\s+/g,' ')).join(' || '));
 console.log('controles de edición:',await p.locator(V+'[data-act="cam-editar"],'+V+'[data-act="cam-subir"],'+V+'.cam-flete,'+V+'[data-act="cam-nuevo"],'+V+'[data-act="fl-editar"],'+V+'[data-pasar]').count(),'· ingresar/salir:',await p.locator('[data-act="ingresar"],[data-act="salir"]').count(),'· imprimir por camión:',await p.locator(V+'[data-act="cam-imprimir"]').count());
 await p.click('#logo');await p.waitForTimeout(100);console.log('tocar el logo → vista:',await p.evaluate(()=>document.querySelector('.view:not([hidden])').id));
 await p.click(V+'[data-act="fl"][data-d="1"]');console.log('día siguiente:',await p.locator(V+'.nav .tit').innerText());
 await p.screenshot({path:SP+'/solo'+w+'.png'});
} else {
 await p.click('#tab-logistica');await p.waitForSelector(V+'.cam');await p.click(V+'[data-act="link-log"]');await p.waitForTimeout(200);
 console.log('botón copiar:',await p.locator('#g-log').innerText(),'· portapapeles:',await p.evaluate(()=>navigator.clipboard.readText()));
 console.log('pestañas visibles:',(await p.locator('.tabs .tab:visible').allInnerTexts()).join(' | '),'· flete visible:',await p.locator(V+'.cam-flete').count());
}
console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores:',errs.join('|')||'ninguno');await c.close();}
await b.close();})();
