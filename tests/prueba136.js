// Centro de compras (/compras): carga, todas las pestañas, filtros, diálogos y celular.
// Con datos reales si se pasa CM_DIR=carpeta con lo que baja cm_sync.ps1 -SinSubir; si no, con datos de mentira.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const SP=process.argv[2];
const sis={};
if(process.env.CM_DIR){for(const f of fs.readdirSync(process.env.CM_DIR))if(f.endsWith('.txt'))sis[f.replace('.txt','')]=fs.readFileSync(path.join(process.env.CM_DIR,f),'utf8');}
else{sis['cm-maestro']=['OK|2026-11-03 11:34','I|3025|Guantes anticorte spectra|3|2|5456.74|12|5','I|3046|Manga de PVC atóxica|3|2|5800|40|0','I|7001|Yerba|31|2|1817.36|3|10',
 'F|3|ROPA Y EQUIPOS','F|31|COMEDOR - COCINA','K|1|Productivo','K|2|No Productivo','S|1|Playa faena','S|18|Ciclo III','M|4|Reposicion por desgaste/uso','A|2|PAÑOL','E|3|Entregado',
 'P|50090|SALAS JOSE ANTONIO','P|50196|ARIAS JUAN FACUNDO'].join('\n');
 sis['cm-compras']=['OK|2026-11-03 11:34','OC|2025-12-01|900|11335|1|3025|10|4800|0|0|0|0|0|1|','OC|2026-09-01|1200|11335|1|3025|10|5456.74|0|0|0|0|0|1|','OC|2026-10-01|1210|10101|1|3025|10|6200|0|0|0|0|4|1|','OC|2026-10-02|1211|11335|1|7001|20|1817.36|0|0|0|0|0|1|','PV|11335|PROVEEDOR UNO SA','PV|10101|OTRO PROVEEDOR SRL'].join('\n');
 sis['cm-v-2026-10']=['OK|2026-11-03 11:34','V|6001|1|2026-10-01|3|50090|3025|1|1|5456.74|1|4|2|0|2026-10-01|0||','V|6002|1|2026-10-05|3|50090|3025|1|1|5456.74|1|4|2|0|2026-10-05|0||','V|6003|1|2026-10-09|3|50090|3025|2|1|0|1|4|2|0|2026-10-09|0|falta|','V|6004|1|2026-10-09|3|50196|7001|1|1|1817.36|18|4|2|1|2026-10-09|0||'].join('\n');}
(async()=>{const b=await chromium.launch();
for(const w of [1400,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.clock.install({time:new Date('2026-11-03T12:00:00-03:00')});
await p.addInitScript(m=>{window.__mock=m;try{localStorage.clear()}catch(e){}},{user:{email:'cgiampaolo@x.com',displayName:'Claudia',emailVerified:true},rol:'compras',sis});
await p.goto('http://127.0.0.1:8765/compras.html');await p.clock.runFor(1500);await p.waitForSelector('.kpi');
console.log(w,'kpis:',await p.evaluate(()=>[...document.querySelectorAll('.kpi')].map(k=>k.innerText.replace(/\n/g,' ')).join(' | ')));
if(w===1400)await p.screenshot({path:SP+'/compras-resumen.png',fullPage:true});
for(const t of ['personas','articulos','sectores','precios','compras','vales']){await p.click('#nav a[data-t="'+t+'"]');await p.waitForTimeout(300);
 const n=await p.locator('main table tbody tr').count();console.log(w,t,'filas',n);if(w===1400)await p.screenshot({path:SP+'/compras-'+t+'.png',fullPage:true});}
if(w===1400){
 // filtro persona → vales
 await p.click('#nav a[data-t="personas"]');await p.waitForTimeout(200);await p.locator('tr.clic').first().click();await p.waitForTimeout(300);
 console.log('diálogo persona:',(await p.innerText('#dlg-h')));await p.screenshot({path:SP+'/compras-dlg-persona.png'});
 await p.click('#dlg-f button.primary');await p.waitForTimeout(300);console.log('vales de esa persona:',await p.locator('main table tbody tr').count(),'· filtro',await p.inputValue('#f-per'));
 await p.click('#f-limpiar');await p.waitForTimeout(200);
 await p.click('#nav a[data-t="precios"]');await p.waitForTimeout(200);await p.locator('#tw-aum tr.clic').first().click();await p.waitForTimeout(300);
 console.log('diálogo artículo:',await p.innerText('#dlg-h'));await p.screenshot({path:SP+'/compras-dlg-art.png'});await p.click('#dlg-f button:not(.primary)');
 // ordenar y excel
 await p.click('#nav a[data-t="articulos"]');await p.waitForTimeout(200);await p.click('#tw-art th[data-col="3"]');await p.waitForTimeout(200);
 const [dl]=await Promise.all([p.waitForEvent('download',{timeout:5000}).catch(()=>null),p.click('[data-xl="art"]')]);console.log('excel:',dl?dl.suggestedFilename():'no (sin internet para la librería)');
 await p.click('a[data-r="mes"]');await p.waitForTimeout(200);console.log('este mes:',await p.inputValue('#f-desde'),await p.inputValue('#f-hasta'));
}
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');
if(w===400){await p.click('#nav a[data-t="resumen"]');await p.waitForTimeout(200);await p.screenshot({path:SP+'/compras400.png',fullPage:true});}
await p.close();}
await b.close();})();
