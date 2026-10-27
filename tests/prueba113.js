// DDJJ de producción de desposte (/ddjj): planilla del día, corrección, artículo nuevo, equivalencias, ingreso, impresión y celular.
// Con datos de mentira; si se pasa DJ_DATOS=archivo (lo que baja dj_sync.ps1 -SinSubir) usa esos.
const {chromium}=require('playwright');const fs=require('fs');const SP=process.argv[2];
let TXT=process.env.DJ_DATOS?fs.readFileSync(process.env.DJ_DATOS,'utf8'):['OK|2026-10-23 19:00',
 'TR|2026-10-23|261783|160|2026-10-21|54|3090','TR|2026-10-23|261786|160|2026-10-21|132|6287',
 'IN|2026-10-23|211|PECHITO CON MANTA|7|94.28','IN|2026-10-23|376|RECORTE 70/30 CONGELADO|1|2000',
 'RE|2026-10-23|101|BONDIOLA|1|6|41|93.59','RE|2026-10-23|30105|BONDIOLA CONGELADA|9|85|669|1811.69',
 'RE|2026-10-23|211|PECHITO CON MANTA|1|9|27|118.08','RE|2026-10-23|30216|PECHITO CON MANTA CONGELADO|9|236|708|3834.93',
 'RE|2026-10-23|316|JAMON CON HUESO Y CUERO CONGELADO|2|23|23|322.78','RE|2026-10-23|136|PALETA C/HUESO Y S/CUERO CONGELADA|2|50|150|921.67',
 'RE|2026-10-23|377|PALETA S/HUESO S/ CUERO Y S/ GRASA  CONG|2|38|0|666.55','RE|2026-10-23|376|RECORTE 70/30 CONGELADO|2|2|95|1811',
 'RE|2026-10-23|417|CUERO  "CH"|1|109|0|1909.3','RE|2026-10-23|705|CABEZA|8|45|180|913.04','RE|2026-10-23|999|ARTICULO NUEVO|1|1|0|50',
 'RE|2026-10-22|101|BONDIOLA|1|64|554|1355.97','TR|2026-10-22|261780|160|2026-10-18|62|3085','CO|8|EXP|Argentina','C3|2026-10-23|2000|CHORIZO FRESCO ESPECIAL|46|950','C3|2026-10-23|2003|CHORIZO BOMBON FRESCO ESPECIAL|3|33','C3|2026-10-23|2001|MORCILLA FRESCA|14|258'].join('\n');
const F=process.env.DJ_FECHA||'2026-10-23';
(async()=>{const b=await chromium.launch();
for(const w of [1300,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-24T09:00:00-03:00')});
await p.addInitScript(m=>{window.__mock=m},{user:{email:'ssaavedra@x.com',displayName:'Saavedra',emailVerified:true},rol:'ddjj',sis:{'dj-2026-10':TXT},docs:{}});
await p.goto('http://127.0.0.1:8765/ddjj.html?f='+F);await p.clock.runFor(1500);await p.waitForSelector('.dj-tab');
const filas=await p.evaluate(()=>[...document.querySelectorAll('.dj-tab')[0].querySelectorAll('tbody tr:not(.dj-det)')].map(r=>[...r.cells].slice(0,4).map(c=>c.innerText.trim()).join(' | ')));
if(w===1300){console.log('producción:\n  '+filas.join('\n  '));console.log('obs:',await p.inputValue('#obs'));
 console.log('ingreso:',await p.evaluate(()=>[...document.querySelectorAll('.dj-tab')[1].querySelectorAll('tbody tr')].map(r=>[...r.cells].slice(0,6).map(c=>c.innerText.trim()).join(' ')).join(' / ')));
 console.log('nuevos:',await p.locator('.dj-nuevos tr').count());
 await p.screenshot({path:SP+'/ddjj.png',fullPage:true});
 // corregir la cantidad de Bondiola
 await p.locator('.dj-tab td.ed').nth(0).click();await p.fill('#dlg-v','700');await p.click('#dlg-ok');await p.waitForTimeout(400);
 console.log('corrección:',await p.evaluate(()=>JSON.stringify(window.__mock.docs['ddjj-2026-10'].dias[new URLSearchParams(location.search).get('f')].prod)),'· amarillas',await p.locator('td.aj').count());
 // asignar el artículo nuevo
 if(await p.locator('.dj-nuevos select').count()){await p.selectOption('.dj-nuevos select','I');await p.waitForTimeout(400);console.log('artículo nuevo → no va:',await p.evaluate(()=>window.__mock.docs['ddjj-equiv'].ignorar.includes(999)),'· quedan nuevos',await p.locator('.dj-nuevos tr').count());}
 // ingreso: cambiar medias de una tropa
 await p.locator('.dj-tab').nth(1).locator('td.ed').nth(3).click();await p.fill('#dlg-v','50');await p.click('#dlg-ok');await p.waitForTimeout(400);
 console.log('ingreso editado:',await p.evaluate(()=>JSON.stringify(window.__mock.docs['ddjj-2026-10'].dias[new URLSearchParams(location.search).get('f')].ing[0])));
 // impresión
 await p.evaluate(()=>{document.getElementById('impresion').innerHTML=hojas(S.fecha)});await p.emulateMedia({media:'print'});
 await p.pdf({path:SP+'/ddjj.pdf',format:'A4',printBackground:true,margin:{top:0,bottom:0,left:0,right:0}});await p.emulateMedia({media:'screen'});
 await p.click('#nav a[data-t="c3"]');await p.waitForTimeout(400);console.log('ciclo III:',await p.evaluate(()=>planilla3(S.fecha3).filas.map(r=>r.n+' '+r.kg).join(' | ')));
 await p.evaluate(()=>{document.getElementById('impresion').innerHTML=hoja3(S.fecha3)});
 await p.click('#nav a[data-t="rend"]');await p.waitForTimeout(400);console.log('rendimiento:',await p.evaluate(()=>{const R=calcularR('2026-10-23');return R.medias+' medias, pp '+R.pp.toFixed(2)+', bondiola '+(R.filas.find(r=>r.n==='Bondiola').rend*100).toFixed(1)+' %'}));
 await p.click('#nav a[data-t="equiv"]');await p.waitForTimeout(500);await p.screenshot({path:SP+'/ddjj-equiv.png',fullPage:true});}
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');
if(w===400)await p.screenshot({path:SP+'/ddjj400.png',fullPage:true});await p.close();}
await b.close();})();
