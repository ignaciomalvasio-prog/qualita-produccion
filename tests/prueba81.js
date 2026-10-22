// Centro de control Ciclo III y Q Express (/control y /caja) con datos de mentira: pestañas, corrección, caja, permisos y celular.
const {chromium}=require('playwright');const SP=process.argv[2];
const L=[],d=f=>'2026-10-'+String(f).padStart(2,'0');L.push('OK|2026-10-21 12:30');
for(let i=1;i<=20;i++){const f=d(i);L.push('PR|'+f+'|2000|CHORIZO FRESCO ESPECIAL|'+(500+i*10)+'|25','PR|'+f+'|2001|MORCILLA FRESCA|200|10','RI|1|3|'+f+'|7770'+i+'|361|RECORTE|'+(600+i)+'|20','RI|1|5|'+f+'|7780'+i+'|101|BONDIOLA|40|2','VL|'+f+'|5101|BONDIOLA FRESCA|30|30|240000|290000','VL|'+f+'|51000|Gaseosa|10|10|10000|12100');}
L.push('RI|5|1|2026-10-06|77900|101|BONDIOLA|5|1','RI|3|5|2026-10-05|77901|2000|CHORIZO FRESCO ESPECIAL|300|10','ST|5|101|BONDIOLA|80');
const INS=['OK|x','IL|20016|Pimienta blanca en grano|1|22700','IL|20018|Sal Entrefina x 1 kg.|1|225','CI|2026-10-10|20018|50|123'].concat(L.filter(x=>x.startsWith('PR|'))).join('\n');
const mock=(rol,email)=>({user:{email,displayName:email.split('@')[0],emailVerified:true},rol,sis:{'mes-2026-10':L.join('\n'),ins:INS},docs:{insumos:{conteos:[{id:'20018',fecha:'2026-10-01',cant:60}]}}});
(async()=>{const b=await chromium.launch();
for(const w of [1300,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-21T13:00:00-03:00')});
await p.addInitScript(m=>{window.__mock=m},mock('editor','igna@x.com'));
await p.goto('http://127.0.0.1:8765/control.html');await p.clock.runFor(2000);await p.waitForSelector('.kgrid');
for(const t of ['c3','insumos','merc','ventas','caja','cambios','inicio']){await p.click('#nav a[data-t="'+t+'"]');await p.waitForTimeout(700);}
await p.click('#nav a[data-t="c3"]');await p.waitForTimeout(300);
await p.locator('td.ed[data-k^="mp|2026-10-05|361"]').click();await p.fill('#ev0','700');await p.click('#dlg-f button.primary');await p.waitForTimeout(400);
console.log(w,'corrección:',await p.evaluate(()=>JSON.stringify(window.__mock.docs['ajustes-2026-10']['mp|2026-10-05|361'].kg)),'· cambios:',await p.evaluate(()=>window.__mock.cambios.length));
// producción del mes agrupada y desplegable
const hijos=()=>p.evaluate(()=>[...document.querySelectorAll('tr.hijo[data-p="p-chorizo"]')].filter(x=>!x.hidden).length);
const h0=await hijos();await p.locator('tr.grp[data-g="p-chorizo"]').click();console.log(w,'grupos:',await p.locator('tr.grp').count(),'· chorizo abre',h0,'→',await hijos(),'· sin stock según sistema:',!(await p.locator('main').innerText()).includes('según el sistema'));
// límite de un insumo: se pone en rojo y deja el mail para Carlos (una sola vez)
await p.click('#nav a[data-t="insumos"]');await p.waitForTimeout(800);
await p.locator('td.nom').filter({hasText:'Sal'}).first().click();await p.fill('#li-v','100000');await p.click('#dlg-f button.primary');await p.waitForTimeout(800);
await p.click('#nav a[data-t="inicio"]');await p.waitForTimeout(600);await p.click('#nav a[data-t="insumos"]');await p.waitForTimeout(800);
console.log(w,'límite:',await p.evaluate(()=>JSON.stringify(window.__mock.docs.insumos.lista)),'· rojas',await p.locator('tr.ins.bajo').count(),'· mails',await p.evaluate(()=>(window.__mock.mails||[]).map(m=>m.tipo+': '+m.asunto).join(' | ')));
if(w===1300){await p.screenshot({path:SP+'/insumos.png',fullPage:false});await p.click('#nav a[data-t="caja"]');await p.waitForTimeout(800);
 await p.evaluate(()=>{const t=document.querySelector('.caja-tw');t.scrollTop=400;});await p.waitForTimeout(200);
 console.log('caja: títulos fijos',await p.evaluate(()=>{const t=document.querySelector('.caja-tw'),r=t.querySelector('thead').rows,a=r[0].cells[1].getBoundingClientRect(),c=r[1].cells[1].getBoundingClientRect();return [a.top-t.getBoundingClientRect().top,c.top-a.bottom,t.scrollTop].join(' ')}));
 await p.screenshot({path:SP+'/cajafija.png'});await p.click('#nav a[data-t="c3"]');await p.waitForTimeout(500);await p.screenshot({path:SP+'/c3.png',fullPage:true});}
await p.click('#nav a[data-t="inicio"]');await p.waitForTimeout(500);await p.screenshot({path:SP+'/control'+w+'.png',fullPage:true});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');await p.close();}
// planilla de caja (rol caja)
const c=await b.newPage({viewport:{width:400,height:900}});const ec=[];c.on('pageerror',e=>ec.push(e.message));
await c.addInitScript(m=>{window.__mock=m},mock('caja','gaston@x.com'));
await c.goto('http://127.0.0.1:8765/caja.html?f=2026-10-16');await c.waitForTimeout(1500);
await c.fill('#zeta','290000');await c.fill('#emp','1000');await c.click('#btn-guardar');await c.waitForTimeout(1500);
console.log('mail en cola:',await c.evaluate(()=>(window.__mock.mails||[]).map(m=>m.asunto+' · adjunto '+(m.adjunto?m.adjunto.length:0)+' · html '+m.html.length).join(' | ')));
console.log('caja guardada:',await c.evaluate(()=>JSON.stringify(window.__mock.docs['local-2026-10'].dias['2026-10-16'].caja)),'· por',await c.evaluate(()=>window.__mock.docs['local-2026-10'].dias['2026-10-16'].por));
await c.screenshot({path:SP+'/caja400.png',fullPage:true});console.log('caja desborde',await c.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',ec.join('|')||'ninguno');
// sin permiso
const n=await b.newPage();await n.addInitScript(m=>{window.__mock=m},mock('','otro@x.com'));await n.goto('http://127.0.0.1:8765/control.html');await n.waitForTimeout(800);
console.log('sin permiso:',(await n.locator('main').innerText()).split('\n')[0]);
await b.close();})();
