// Centro de desposte › Trazabilidad: solo se muestran los despostes de cerdo (pedido de Sabi 29/10); rendering, chacinados y tipo 5 no.
const {chromium}=require('playwright');
const RES=['OK|2026-10-29 13:00','TT|261791|x|2026-10-20|160|PRODUCTOR|LOCALIDAD|AB123','TM|2026-10-21|318|5100',
 'DP|416191|2026-10-22|2|100|300|8000|2700','DP|416196|2026-10-23|2|80|250|6000|2200','DP|416300|2026-10-23|6|10|10|500',
 'RP|416191|416192|2026-10-23|6|5|100','RP|416191|416184|2026-10-23|2|3|60','RP|416196|416193|2026-10-24|2|4|80',
 'RP|416196|416200|2026-10-24|6|2|40','RP|416191|416194|2026-10-24|4|6|120','RP|416196|416218|2026-10-25|5|1|20','RP|416191|416218|2026-10-25|5|1|20',
 'VE|416192|2026-10-22|R 0011-00044568|900|AGRO INDUSTRIAS BAIRES SA|9001|HARINA DE CARNE Y HUESO PORCINA|1|1200','VE|416200|2026-10-29|R 0011-00044749|900|AGRO INDUSTRIAS BAIRES SA|9001|HARINA DE CARNE Y HUESO PORCINA|4|5570',
 'VE|416191|2026-10-23|R 0001-00012345|500|CARNICERIA EJEMPLO|101|BONDIOLA|3|60','VE|416196|2026-10-23|R 0001-00012345|500|CARNICERIA EJEMPLO|101|BONDIOLA|3|60','SR|416191|300|8000|3|5|0|7640','SR|416196|250|6000|0|0|0|5860','VE|416184|2026-10-24|R 0001-00012346|501|OTRO CLIENTE|211|PECHITO|2|40'].join('\n');
const T={tipo:'tropa',valor:'261791',pedido:'2026-10-29T16:00:00Z',hecho:'2026-10-29T16:00:05Z',res:RES};
const C={tipo:'corr',valor:'4905612',pedido:'2026-10-29T16:00:00Z',hecho:'2026-10-29T16:00:05Z',
 res:['OK|2026-10-29 13:00','PR|4905612|1|30276|CARRE|17.68|2026-10-22|4905612|261791','DR|416191|2026-10-22|2|0',
 'RP|416191|416184|2026-10-23|2|1|17.68','RP|416191|416192|2026-10-23|6|1|17.68'].join('\n')};
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
const ver=async(traza,w)=>{const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-29T13:30:00-03:00')});
 await p.addInitScript(m=>{window.__mock=m},{user:{email:'ssaavedra@x.com',displayName:'Saavedra',emailVerified:true},rol:'ddjj',sis:{'dj-2026-10':'OK|x'},docs:{'ddjj-traza':traza}});
 await p.goto('http://127.0.0.1:8765/ddjj.html');await p.clock.runFor(1500);
 await p.click('#nav a[data-t="traza"]');await p.waitForTimeout(500);
 const txt=await p.evaluate(()=>document.getElementById('main').innerText);const des=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 await p.close();return {txt,errs,des};};
// cajas con tropa (desposteres.despr_tropa): en el 416191 solo cuentan las de esta tropa; las sin tropa no
{const T2=Object.assign({},T,{res:T.res+'\n'+['PT|416191|261791|100|2600','PT|416191|261790|180|5000','PT|416191|?|20|400','SX|416191|100|2600|100|2440',
  'VX|416191|2026-10-23|R 0001-00099999|502|CLIENTE DE LA TROPA|101|BONDIOLA|2|40'].join('\n')});
 const r=await ver(T2,1100);const t=r.txt.replace(/\s+/g,' ');
 ok(/CLIENTE DE LA TROPA 1 2 40,00 40,00/.test(t),'cajas con tropa: el cliente de las cajas de esta tropa cuenta entero (40 kg)');
 ok(/CARNICERIA EJEMPLO 1 3 60,00 22,00/.test(t),'desposte sin tropa en las cajas (416196): en proporción (36,7 % de 60 = 22)');
 ok(/2\.600 solo cajas con esta tropa/.test(t),'despostes: producido de la tropa exacto (2.600)');
 ok(/N° 416191 22\/10\/26 · 32,5 % \(cajas con tropa\) 2\.600 40 — 100 2\.440 99,2 %/.test(t),'balance del lote con las cajas de la tropa');
 ok(!r.errs.length,'errores: '+(r.errs.join('|')||'ninguno'));}
for(const w of [1100,400]){
 let r=await ver(T,w);
 if(w===1100){
  ok(!/volvieron a procesar/.test(r.txt)&&!/416184|416193/.test(r.txt),'no figura nada de lo reprocesado (ni la tabla ni los despostes 416184, 416193)');
  ok(!/Rendering|Chacinados|Ciclo III|Tipo 5/.test(r.txt),'no aparecen rendering, chacinados ni tipo 5');
  ok(!/416300/.test(r.txt),'el desposte de rendering no figura en "Despostes donde entró"');
  ok(/416191/.test(r.txt)&&/416196/.test(r.txt),'los despostes de cerdo siguen');
  ok(!/AGRO INDUSTRIAS/.test(r.txt),'no figura el cliente de la harina de carne (rendering)');
  ok(/CARNICERIA EJEMPLO/.test(r.txt)&&!/OTRO CLIENTE/.test(r.txt),'sí los clientes de lo que salió de los despostes de la tropa; no los de un reproceso (416184)');
  ok(/1 cliente · 3 cajas o piezas · 60 kg/.test(r.txt),'la venta repetida en dos despostes cuenta una sola vez');
  const bm=r.txt.slice(r.txt.indexOf('3 · Balance de masas')).replace(/\s+/g,' ');console.log('balance:',bm.slice(0,700));
  ok(/Conciliación 160 159 1 0 100,0 %/.test(bm),'a) animales: 160 = 159 faenados + 1 diferencia');
  ok(/5\.100 — 4\.900 200 96,1 %/.test(bm),'b) kg de medias: 5.100 = 4.900 a desposte + 200 de oreo');
  ok(/N° 416191 22\/10\/26 · 33,8 % 2\.700 20 — 101 2\.579 100,0 %/.test(bm)&&!/Reprocesado/.test(bm),'c) lote 416191, parte de la tropa (33,8 %): 2.700 = 20 + 101 + 2.579 → 100 %');
  ok(/N° 416196 23\/10\/26 · 36,7 % 2\.200 — — 51 2\.149 100,0 %/.test(bm),'c) lote 416196, parte de la tropa → 100 %');
  ok(/de los que le corresponden a esta tropa 20 kg/.test(r.txt),'clientes: kg que le corresponden a la tropa');
  ok(/N° 416191 22\/10\/26 100 de 300 ninguna 300 8\.000 2\.700 33,8 % 2\.700/.test(r.txt.replace(/\s+/g,' ')),'despostes: kg de la tropa, % y producido de la tropa');
  r=await ver(C,w);
  ok(!/volvió a procesar|416184|416192/.test(r.txt),'correlativo: "A dónde fue" sin reprocesos');
 }
 ok(r.des<=0,w+' sin desborde');ok(!r.errs.length,w+' errores: '+(r.errs.join('|')||'ninguno'));}
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
