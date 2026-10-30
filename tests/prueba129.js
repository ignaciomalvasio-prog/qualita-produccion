// Centro de desposte › Trazabilidad: solo se muestran los despostes de cerdo (pedido de Sabi 29/10); rendering, chacinados y tipo 5 no.
const {chromium}=require('playwright');
const RES=['OK|2026-10-29 13:00','TT|261791|x|2026-10-20|160|PRODUCTOR|LOCALIDAD|AB123','TM|2026-10-21|318|25440',
 'DP|416191|2026-10-22|2|100|300|8000','DP|416196|2026-10-23|2|80|250|6000','DP|416300|2026-10-23|6|10|10|500',
 'RP|416191|416192|2026-10-23|6|5|100','RP|416191|416184|2026-10-23|2|3|60','RP|416196|416193|2026-10-24|2|4|80',
 'RP|416196|416200|2026-10-24|6|2|40','RP|416191|416194|2026-10-24|4|6|120','RP|416196|416218|2026-10-25|5|1|20','RP|416191|416218|2026-10-25|5|1|20',
 'VE|416192|2026-10-22|R 0011-00044568|900|AGRO INDUSTRIAS BAIRES SA|9001|HARINA DE CARNE Y HUESO PORCINA|1|1200','VE|416200|2026-10-29|R 0011-00044749|900|AGRO INDUSTRIAS BAIRES SA|9001|HARINA DE CARNE Y HUESO PORCINA|4|5570',
 'VE|416191|2026-10-23|R 0001-00012345|500|CARNICERIA EJEMPLO|101|BONDIOLA|3|60','VE|416196|2026-10-23|R 0001-00012345|500|CARNICERIA EJEMPLO|101|BONDIOLA|3|60','SR|416191|300|8000|3|5|0','VE|416184|2026-10-24|R 0001-00012346|501|OTRO CLIENTE|211|PECHITO|2|40'].join('\n');
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
for(const w of [1100,400]){
 let r=await ver(T,w);
 if(w===1100){
  ok(/416184\s*Desposte cerdo/.test(r.txt)&&/416193\s*Desposte cerdo/.test(r.txt),'quedan los reprocesos en desposte cerdo (416184, 416193)');
  ok(!/Rendering|Chacinados|Ciclo III|Tipo 5/.test(r.txt),'no aparecen rendering, chacinados ni tipo 5');
  ok(!/416300/.test(r.txt),'el desposte de rendering no figura en "Despostes donde entró"');
  ok(/416191/.test(r.txt)&&/416196/.test(r.txt),'los despostes de cerdo siguen');
  ok(!/AGRO INDUSTRIAS/.test(r.txt),'no figura el cliente de la harina de carne (rendering)');
  ok(/CARNICERIA EJEMPLO/.test(r.txt)&&/OTRO CLIENTE/.test(r.txt)&&/2 clientes/.test(r.txt),'sí los clientes de cortes de desposte cerdo');
  ok(/2 clientes · 5 cajas o piezas · 100 kg/.test(r.txt),'la venta repetida en dos despostes cuenta una sola vez');
  const fila=(r.txt.split('\n').find(l=>/^N° 416191/.test(l))||'').replace(/\s+/g,' ');console.log('balance 416191:',fila);
  ok(/8\.000 60 60 240 — 7\.640$/.test(fila),'balance: 8.000 producidos = 60 vendidos + 60 reprocesado + 240 a rendering u otros + 7.640 en cámara');
  r=await ver(C,w);
  ok(/416184/.test(r.txt)&&!/416192/.test(r.txt),'correlativo: "A dónde fue" solo muestra el reproceso en desposte cerdo');
 }
 ok(r.des<=0,w+' sin desborde');ok(!r.errs.length,w+' errores: '+(r.errs.join('|')||'ninguno'));}
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
