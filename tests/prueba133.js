// Centro de desposte › Faena y mortalidad: muertos de la playa de emergencia (pedido de Sabi 30/10). En la consulta de faena, un renglón
// de lista A1 con 1 cabeza de una tropa de más animales es un muerto en corral (marcado "emergencia A1"). A1 con 40 cabezas no; una tropa
// de un solo animal tampoco. Si ya está en la tabla de muertos del sistema, no se repite. También cuenta en la DDJJ (FAENA PARCIAL).
const {chromium}=require('playwright');
const ANUAL=['OK|2026-10-30 07:00','FA|2026-10|1|4000|400000|20','FX|ok|FAENAS|FAE_LISTA|FAE_CABEZAS|FAE_FECHA|FAE_NUMERO|P0 A1',
 'FE|2026-10-09|261756|A1|1|34612|160|AB1|5223|MALVASIO|X','FE|2026-10-21|261787|A1|1|34719|160|AB2|5153|LA QUIMERA|EL RODEO',
 'FE|2026-10-22|261789|A1|1|34733|160|NJD593|5208|CONSULTORES ASOCIADOS|LOS COMETIERRAS','FE|2026-10-22|299999|A1|1|34734|1|AB3|5208|OTRO|Y','FE|2026-10-01|261732|A1|40|34528|160|AB4|5153|LA QUIMERA|EL RODEO',
 'FE|2026-10-15|261770|A1|1|34650|160|AB5|5153|LA QUIMERA|EL RODEO','MU|2026-10-15|261770|1|C|AB5|5153|LA QUIMERA|EL RODEO| '].join('\n');
const DJ=['OK|x','TR|2026-10-23|261787|160|2026-10-21|318|25440','RE|2026-10-23|101|BONDIOLA|1|60|500|1300'].join('\n');
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
const abrir=async(anual,w)=>{const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-30T09:00:00-03:00')});
 await p.addInitScript(m=>{window.__mock=m},{user:{email:'ssaavedra@x.com',displayName:'Saavedra',emailVerified:true},rol:'ddjj',sis:{'dj-2026-10':DJ,'dj-anual':anual},docs:{}});
 await p.goto('http://127.0.0.1:8765/ddjj.html?f=2026-10-23');await p.clock.runFor(1500);await p.waitForSelector('.dj-tab');return {p,errs};};
for(const w of [1300,400]){
 let {p,errs}=await abrir(ANUAL,w);
 const ing=await p.evaluate(()=>planilla(S.fecha).ingreso.map(t=>t.tropa+':'+t.cab+':'+t.obs).join(' / '));
 await p.click('#nav a[data-t="faena"]');await p.waitForTimeout(400);
 const filas=await p.evaluate(()=>[...document.querySelectorAll('.dj-rm tbody tr')].map(r=>r.innerText.replace(/\s+/g,' ').trim()));
 if(w===1300){console.log(filas.join('\n'));
  ok(filas.some(f=>/261756.*CORRAL.*Playa de emergencia \(A1, faena N° 34612\).*emergencia A1/.test(f)),'261756 (A1, 1 cabeza) entra como muerto en corral, marcado');
  ok(filas.some(f=>/261787.*emergencia A1/.test(f)),'261787 también');
  ok(filas.some(f=>/261789.*emergencia A1/.test(f)),'261789 (160 cabezas, A1 de 1 el 22/10) entra');ok(!filas.some(f=>/299999/.test(f)),'tropa de un solo animal (299999), no es muerto');
  ok(!filas.some(f=>/261732/.test(f)),'261732: A1 con 40 cabezas (más faena), no es muerto');
  ok(filas.filter(f=>/261770/.test(f)).length===1&&!filas.some(f=>/261770.*emergencia/.test(f)),'261770: ya estaba en el sistema, no se repite');
  ok(ing==='261787:159:FAENA PARCIAL','DDJJ: la tropa con muerto A1 va 159 y FAENA PARCIAL ('+ing+')');
  ok(!(await p.locator('.chip.bad').count()),'sin aviso de error');
  // Excel
  await p.evaluate(()=>{window.__xl=[];window.XLSX={utils:{book_new:()=>({h:[]}),aoa_to_sheet:a=>({a}),book_append_sheet:(wb,ws,n)=>wb.h.push([n,ws.a])},writeFile:(wb,n)=>window.__xl.push(wb.h)};excelFaena();});
  const xl=await p.evaluate(()=>window.__xl[0][1][1].map(r=>r.join('|')));
  ok(xl.some(r=>/^261756\|.*Playa de emergencia \(A1\)/.test(r)),'Excel: origen "Playa de emergencia (A1)"');}
 ok(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=0,w+' sin desborde');
 ok(!errs.length,w+' errores: '+(errs.join('|')||'ninguno'));await p.close();}
// si la notebook no encontró la tabla, se avisa
let {p,errs}=await abrir(ANUAL.replace(/FX\|ok[^\n]*/,'FX|no|ninguna tabla con columnas LISTA y TRO_NROINT'),1300);
await p.click('#nav a[data-t="faena"]');await p.waitForTimeout(400);
ok(/no se pudieron leer/.test(await p.evaluate(()=>document.getElementById('main').innerText)),'si no encontró la tabla, avisa');await p.close();
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
