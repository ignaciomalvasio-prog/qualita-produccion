// Centro de desposte › DDJJ desposte: una tropa con un muerto (tropa 261799, 160 cabezas, 1 muerto) declara 159 y FAENA PARCIAL.
// Botones Excel del día y del mes.
// También cuenta un muerto cargado a mano en Faena y mortalidad, y no toca las tropas sin muertos.
const {chromium}=require('playwright');const SP=process.argv[2];
const TXT=['OK|2026-10-28 19:00',
 'TR|2026-10-28|261799|160|2026-10-27|318|25440','TR|2026-10-28|261800|150|2026-10-27|300|24000','TR|2026-10-28|261801|80|2026-10-27|160|12800',
 'RE|2026-10-28|101|BONDIOLA|1|64|554|1355.97'].join('\n');
const ANUAL=['OK|2026-10-28 19:00','MU|2026-10-27|261799|1|C|AB123CD|10|PRODUCTOR|LOCALIDAD| '].join('\n');
const MUERTOS={lista:[{id:'a1',fecha:'2026-10-27',tropa:'261801',cab:2,lugar:'VIAJE'}]};
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
for(const w of [1300,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-29T09:00:00-03:00')});
await p.addInitScript(m=>{window.__mock=m},{user:{email:'ssaavedra@x.com',displayName:'Saavedra',emailVerified:true},rol:'ddjj',sis:{'dj-2026-10':TXT,'dj-anual':ANUAL},docs:{'ddjj-muertos':MUERTOS}});
await p.goto('http://127.0.0.1:8765/ddjj.html?f=2026-10-28');await p.clock.runFor(1500);
await p.evaluate(()=>{const a=document.querySelector('#nav a[data-t="dia"]');if(a)a.click();});await p.waitForTimeout(400);
await p.waitForSelector('.dj-tab');
const ing=await p.evaluate(()=>planilla('2026-10-28').ingreso.map(t=>t.tropa+':'+t.cab+':'+t.obs));
if(w===1300){console.log('ingreso:',ing.join(' / '));
 ok(ing.includes('261799:159:FAENA PARCIAL'),'261799 → 159 y FAENA PARCIAL');
 ok(ing.includes('261800:150:Consumo'),'261800 sin muertos queda igual');
 ok(ing.includes('261801:78:FAENA PARCIAL'),'261801 con 2 muertos a mano → 78');
 const aviso=await p.evaluate(()=>[...document.querySelectorAll('.alerta')].map(a=>a.textContent).join(' '));
 ok(/261799 160 − 1 = 159/.test(aviso),'aviso de muertos en Ingreso');
 await p.evaluate(()=>{document.getElementById('impresion').innerHTML=hojas(S.fecha)});
 const imp=await p.evaluate(()=>document.getElementById('impresion').textContent);
 ok(/261799159318/.test(imp)&&/FAENA PARCIAL/.test(imp),'la hoja impresa lleva 159 y FAENA PARCIAL');
 // Excel del día y del mes (librería de mentira que guarda lo que iría a cada hoja)
 await p.evaluate(()=>{window.__xl=[];window.XLSX={utils:{book_new:()=>({h:[]}),aoa_to_sheet:a=>({a}),book_append_sheet:(wb,ws,n)=>wb.h.push([n,ws.a])},writeFile:(wb,n)=>window.__xl.push([n,wb.h])};});
 await p.click('text=Excel del día');await p.click('text=Excel del mes');
 const xl=await p.evaluate(()=>window.__xl);const dia=xl[0][1][0][1].map(r=>r.join('|'));
 ok(xl[0][0]==='DDJJ desposte 28-10-2026.xlsx','nombre del Excel del día: '+xl[0][0]);
 ok(dia.includes('27/10/2026|261799|159|318|25440|FAENA PARCIAL'),'Excel del día: tropa 261799 con 159 y FAENA PARCIAL');
 ok(dia.some(r=>r.startsWith('Bondiola|')),'Excel del día: producción');
 ok(xl[1][1].length===1&&xl[1][1][0][0]==='28-10','Excel del mes: una hoja por día ('+xl[1][1].map(h=>h[0])+')');
 await p.screenshot({path:SP+'/ddjj-muertos.png',fullPage:true});}
const des=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);ok(des<=0,w+' sin desborde');ok(!errs.length,w+' errores: '+(errs.join('|')||'ninguno'));
await p.close();}
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
