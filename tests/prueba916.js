// DDJJ Chacinados: desde el 28/10 a cada producto se le restan los ingresos del mismo producto (Sabi 18/11).
const {chromium}=require('playwright');
const TXT=['OK|2026-10-30 07:00',
'C3|2026-10-29|2000|CHORIZO FRESCO ESPECIAL|65|1804.43','C3|2026-10-29|2000|CHORIZO FRESCO ESPECIAL|3|2410','C3|2026-10-29|2001|MORCILLA FRESCA|13|361.94','C3|2026-10-29|2001|MORCILLA FRESCA|1|270',
'C3I|2026-10-29|361|RECORTE|103|2216.93','C3I|2026-10-29|2000|CHORIZO FRESCO ESPECIAL|3|2410','C3I|2026-10-29|2001|MORCILLA FRESCA|1|270',
'C3|2026-10-27|2000|CHORIZO FRESCO ESPECIAL|3|500','C3I|2026-10-27|2000|CHORIZO FRESCO ESPECIAL|3|200'].join('\n');
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-30T09:00:00-03:00')});
await p.addInitScript(m=>{window.__mock=m},{user:{email:'s@x.com',displayName:'Sabi',emailVerified:true},rol:'ddjj',sis:{'dj-2026-10':TXT},docs:{}});
await p.goto('http://127.0.0.1:8765/ddjj.html');await p.clock.runFor(1500);await p.click('#nav a[data-t="c3"]');await p.waitForTimeout(400);
const r=await p.evaluate(()=>[planilla3('2026-10-29'),planilla3('2026-10-27')].map(P=>P.filas.map(x=>x.n+'='+x.kg).join(';')));
console.log(r.join(' | '));
ok(/CHORIZO FRESCO DE CERDO=1804\.43/.test(r[0])&&/MORCILLA=361\.94/.test(r[0]),'29/10: se restan los ingresos de chorizo y morcilla');
ok(/CHORIZO FRESCO DE CERDO=500/.test(r[1]),'27/10: no se resta');
ok(!errs.length,'errores: '+(errs.join('|')||'ninguno'));await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
