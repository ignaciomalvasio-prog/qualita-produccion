// Centro de desposte › Tropas (pedido de Sabi 30/10): tropas que ingresaron en el mes con productor, granja, jaula, cabezas, faenadas
// (y días), muertos (sistema + A1 + a mano), kg vivos, peso promedio vivo y % de animales del romaneo por rango de peso (rangos editables).
const {chromium}=require('playwright');
const DJ=['OK|2026-10-30 11:00','TK|TRO_KILOS|TRO_KILOS,TRO_KILOSDESB',
 'TP|261798|2026-10-25|160|21840|AE667IF|5153|LA QUIMERA S.A.|EL RODEO','TP|261814|2026-10-29|60|8160|AF672YQ|5153|LA QUIMERA S.A.|EL RODEO',
 'FD|261798|2026-10-26|81','FD|261798|2026-10-27|79','FD|261814|2026-10-30|60',
 'FR|261798|58|10','FR|261798|65|30','FR|261798|75|60','FR|261798|85|50','FR|261798|95|9','FR|261798|101|1',
 'FR|261814|59|1','FR|261814|75|20','FR|261814|85|30','FR|261814|95|9'].join('\n');
const ANUAL='OK|x\nMU|2026-10-26|261798|1|C|AE667IF|5153|LA QUIMERA|EL RODEO| ';
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
for(const w of [1300,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-30T12:00:00-03:00')});
 await p.addInitScript(m=>{window.__mock=m},{user:{email:'ssaavedra@x.com',displayName:'Saavedra',emailVerified:true},rol:'ddjj',sis:{'dj-2026-10':DJ,'dj-anual':ANUAL},docs:{}});
 await p.goto('http://127.0.0.1:8765/ddjj.html');await p.clock.runFor(1500);
 await p.click('#nav a[data-t="tropas"]');await p.waitForTimeout(400);
 const filas=await p.evaluate(()=>[...document.querySelectorAll('.dj-tropas tbody tr')].map(r=>[...r.cells].map(c=>c.innerText.replace(/\s+/g,' ').trim()).join(' | ')));
 if(w===1300){console.log(filas.join('\n'));
  ok(/^261798 \| 25\/10 \| La Quimera S.A. \| El Rodeo \| 160 \| 1 \| 21\.840 \| 136,50/.test(filas[1])&&!/AE667IF/.test(filas[1])&&/^261814/.test(filas[0]),'más reciente primero (261814); 261798: datos sin jaula ni faenadas, muerto, kg vivos y promedio');
  ok(/100 · 62,5 % \| 60 · 37,5 % \| 0 · 0,0 %$/.test(filas[1]),'261798: animales y % (menos de 80, 80 a 110, más de 110): '+filas[1].split('|').slice(-3).join('|'));
  ok(/^Total del mes \| 220 \| 1 \| 30\.000 \| 136,36/.test(filas[2]),'total del mes');
  // cambiar rangos
  await p.click('text=Cambiar rangos');await p.fill('#dlg-v','70, 90');await p.click('#dlg-ok');await p.waitForTimeout(400);
  const cab=await p.evaluate(()=>[...document.querySelectorAll('.dj-tropas thead th')].slice(8).map(t=>t.innerText).join(' | '));
  ok(cab==='menos de 70 kg | 70 a 90 kg | más de 90 kg','rangos cambiados: '+cab);
  ok(JSON.stringify(await p.evaluate(()=>window.__mock.docs['ddjj-equiv'].tropasRangos2))==='[70,90]','se guardan');
  await p.evaluate(()=>{window.__xl=[];window.XLSX={utils:{book_new:()=>({h:[]}),aoa_to_sheet:a=>({a}),book_append_sheet:(wb,ws,n)=>wb.h.push([n,ws.a])},writeFile:(wb,n)=>window.__xl.push([n,wb.h])};});
  await p.click('text=Bajar Excel');const xl=await p.evaluate(()=>window.__xl[0]);
  ok(xl[0]==='Tropas 2026-10.xlsx'&&xl[1][0][1].length===3&&xl[1][0][1][0].includes('Animales menos de 70 kg')&&!xl[1][0][1][0].includes('Jaula')&&!xl[1][0][1][0].includes('Faenadas'),'Excel de tropas sin jaula ni faenadas');}
 ok(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=0,w+' sin desborde de la página');
 ok(!errs.length,w+' errores: '+(errs.join('|')||'ninguno'));await p.close();}
// sin datos todavía
{const p=await b.newPage();await p.addInitScript(m=>{window.__mock=m},{user:{email:'s@x.com',displayName:'S',emailVerified:true},rol:'ddjj',sis:{'dj-2026-10':'OK|x'},docs:{}});
 await p.goto('http://127.0.0.1:8765/ddjj.html');await p.waitForTimeout(1500);await p.click('#nav a[data-t="tropas"]');await p.waitForTimeout(300);
 ok(/Todavía no llegaron los datos/.test(await p.evaluate(()=>document.getElementById('main').innerText)),'sin datos: aviso');await p.close();}
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
