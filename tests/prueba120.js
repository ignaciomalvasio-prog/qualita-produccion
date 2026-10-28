// Trazabilidad (/ddjj, pestaña "Trazabilidad"): consulta por tropa y por correlativo (la respuesta de la notebook se simula). Datos inventados.
const {chromium}=require('playwright');const SP=process.argv[2];
const TROPA=['OK|2026-10-28 13:03','TT|261791|12698|2026-10-21|159|GRANJA UNO S.A.|EL RODEO|AA000AA','TM|2026-10-24|360|23448','TM|2026-10-22|117|8220',
 'DP|416210|2026-10-27|2|240|414|15427.14','DP|416196|2026-10-23|2|1|251|14430','DT|416196|261788|248','DT|416210|261790|174',
 'RP|416210|416213|2026-10-27|2|18|385.24','RP|416210|416210|2026-10-27|2|86|1532.12','RP|416196|416194|2026-10-23|4|10|178.98',
 'SR|416210|559|15019.48|276|115|38','SR|416196|542|13088.34|323|62|57',
 'VE|416210|2026-10-28|R 0011-00044702|1|CLIENTE A S.A.|211|PECHITO CON MANTA|9|137.4','VE|416210|2026-10-27|R 0011-00044652|1|CLIENTE A S.A.|343|JAMON 4 MUSCULOS|4|79.86',
 'VE|416194|2026-10-23|R 0012-00008737|2|CLIENTE B|2000|CHORIZO FRESCO ESPECIAL|3|30','VE|0|2026-10-25|R 0011-00044600|3|CLIENTE C SRL|18|Capon|2|160',
 'RI|416210|2026-10-27|5001|CAMARA|CICLO III|10|200'].join('\n');
const CORR=['OK|2026-10-28 13:03','PR|5970414|0|271|CARRE CON HUESO SIN SOLOMILLO|16.7|2026-10-20|4891521|0|0','DR|416167|2026-10-20|2|0',
 'VE|0|2026-10-21|R 0011-00044487|1|CLIENTE A S.A.|271|CARRE CON HUESO SIN SOLOMILLO|1|16.7','TI|0|416167|261776|GRANJA UNO S.A.|2026-10-17|216|10494',
 'DR|416164|2026-10-19|2|1','DR|416167|2026-10-20|2|1','TI|1|416167|261776|GRANJA UNO S.A.|2026-10-17|216|10494','TI|1|416164|261770|GRANJA DOS S.A.|2026-10-15|198|10638'].join('\n');
(async()=>{const b=await chromium.launch();
for(const w of [1300,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.addInitScript(m=>{window.__mock=m},{user:{email:'a@x.com',displayName:'Saavedra',emailVerified:true},rol:'ddjj',sis:{},docs:{}});
await p.goto('http://127.0.0.1:8765/ddjj.html');await p.waitForTimeout(1200);
await p.click('#nav a[data-t="traza"]');await p.waitForSelector('#tz-v');
const responder=async res=>{await p.waitForFunction(()=>window.__mock.docs['ddjj-traza']&&window.__mock.docs['ddjj-traza'].pedido);
 await p.evaluate(res=>{const d=window.__mock.docs['ddjj-traza'];d.hecho=d.pedido;d.res=res;},res);await p.waitForSelector('.tz-form button:not([disabled])',{timeout:10000});};
await p.fill('#tz-v','261791');await p.click('.tz-form button');await responder(TROPA);
const txt=(await p.innerText('main')).replace(/\n+/g,' | ');
if(w===1300){console.log('tropa:',txt.slice(0,900));
 await p.click('text=CLIENTE A S.A.');console.log('detalle cliente:',(await p.innerText('.dj-mini')).replace(/\s+/g,' '));}
await p.screenshot({path:SP+'/p120_tropa_'+w+'.png',fullPage:true});
await p.check('input[value="correlativo"]');await p.fill('#tz-v','4891521-271-16.7');await p.click('.tz-form button');
await p.waitForFunction(()=>window.__mock.docs['ddjj-traza'].tipo==='correlativo'&&window.__mock.docs['ddjj-traza'].valor==='4891521');await responder(CORR);
if(w===1300)console.log('correlativo:',(await p.innerText('main')).replace(/\n+/g,' | ').slice(0,900));
await p.screenshot({path:SP+'/p120_corr_'+w+'.png',fullPage:true});
await p.click('text=261770');await p.waitForFunction(()=>window.__mock.docs['ddjj-traza'].valor==='261770');console.log('clic en tropa → consulta', await p.evaluate(()=>window.__mock.docs['ddjj-traza'].tipo+' '+window.__mock.docs['ddjj-traza'].valor));
const anch=await p.evaluate(()=>document.documentElement.scrollWidth);console.log(w,'desborde:',anch>w?anch:'no','· errores:',errs.length?errs:'ninguno');await p.close();}
await b.close();})();
