// DDJJ Rendering: ingreso de materia prima con su peso (renglones MI) en pantalla, hoja impresa y Excel (Sabi 27/11).
const {chromium}=require('playwright');
const TXT=['OK|2026-11-27 07:00',
'ME|2026-11-26|6|900|HARINA DE CARNE Y HUESO|40|2000','ME|2026-11-26|6|901|SEBO PORCINO|10|800',
'MI|2026-11-26|6|705|CABEZA|0|3500.5','MI|2026-11-26|6|361|HUESOS|0|4200','MI|2026-11-26|6|411|DECOMISOS|0|900.25','MI|2026-11-26|6|705|CABEZA|0|100','MI|2026-11-26|6|443|DESPOJO|0|1283.8','MI|2026-11-25|6|417|CUERO "CH"|38|709.5','MI|2026-11-25|6|420|HUESO|4|2144','MI|2026-11-25|6|425|HUESO CABEZA|2|1038','MI|2026-11-25|6|430|DESPOJO DE DESPOSTADA|8|2685','MI|2026-11-25|6|434|HUESO|1|1493.2','MI|2026-11-25|6|440|DESPOJO DE FAENA|1|8757','MI|2026-11-25|6|443|DESPOJO|1|1283.8','MI|2026-11-25|6|472|GRASA EN RAMA|4|1000','MI|2026-11-25|6|473|GRASA EN RAMA|1|120.8','MI|2026-11-25|6|474|OTRO LARGO NOMBRE DE MATERIA PRIMA|1|10','MI|2026-11-25|6|475|OTRO|1|10','ME|2026-11-25|6|810|HARINA DE CARNE Y HUESO PORCINA|2|2400','ME|2026-11-25|6|811|SEBO PORCINO|1|27460','ME|2026-11-18|6|811|SEBO PORCINO|1|20000'].join('\n');
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
for(const w of [1300,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-27T09:00:00-03:00')});
 await p.addInitScript(m=>{window.__mock=m},{user:{email:'s@x.com',displayName:'Sabi',emailVerified:true},rol:'ddjj',sis:{'dj-2026-11':TXT},docs:{}});
 await p.goto('http://127.0.0.1:8765/ddjj.html');await p.clock.runFor(1500);await p.click('#nav a[data-t="rd"]');await p.waitForTimeout(400);
 const txt=await p.textContent('main');
 ok(/Ingreso de materia prima/.test(txt)&&/HUESOS/.test(txt)&&!/361 · HUESOS/.test(txt)&&/3[.,]?600,50/.test(txt)&&/9[.,]?984,55/.test(txt),w+' pantalla: ingresos por artículo y total');
 if(w===1300){
  const ob=await p.evaluate(()=>[planillaRd('2026-11-25'),planillaRd('2026-11-26'),planillaRd('2026-11-18')].map(P=>(P.filas.find(r=>/SEBO/.test(r.n))||{}).dest));
  await p.waitForTimeout(300);const ob2=await p.evaluate(()=>(planillaRd('2026-11-18').filas.find(r=>/SEBO/.test(r.n))||{}).dest);console.log(JSON.stringify(ob),ob2);
  ok(/después del 18\.11\.2026/.test(ob[0])&&/después del 25\.11\.2026/.test(ob[1])&&!ob2,'sebo: aclara desde cuándo se acumula');
  for(const F of ['2026-11-26','2026-11-25']){
  const hh=await p.evaluate((F)=>{const d=document.createElement('div');d.innerHTML=hojaRd(F);document.body.appendChild(d);const H=d.querySelector('.hoja'),f=d.querySelector('.h3-firma');const tb=[...d.querySelectorAll('.h3-tab')];const r={tabla:!!d.querySelector('.h3-ing'),primero:tb[0].classList.contains('h3-ing'),filasProd:tb[1].querySelectorAll('tr.fi').length,cabe:f.getBoundingClientRect().bottom-H.getBoundingClientRect().top<=H.clientHeight-50,abajo:Math.round(f.getBoundingClientRect().bottom-H.getBoundingClientRect().top),alto:H.clientHeight};d.remove();return r;},F);
  ok(!/CH"/.test(await p.evaluate(F=>hojaRd(F),F))&&hh.tabla&&hh.cabe&&hh.primero&&hh.filasProd===2,F+' hoja impresa: tabla de ingreso y entra en la hoja con margen '+JSON.stringify(hh));}
  await p.evaluate(()=>{window.__auto={hecho:true};window.__autoOut=[];});await p.click('text=Excel del día');
  const x=await p.evaluate(()=>window.__autoOut[0]);const s=Buffer.from(x.b64,'base64').toString('utf8');
  ok(s.indexOf('INGRESO DE MATERIA PRIMA')<s.indexOf('NOMBRE DEL PRODUCTO')&&/De terceros \(Don Pedro\)/.test(s)&&/INGRESO DE MATERIA PRIMA/.test(s)&&/<v>3600.5<\/v>/.test(s)&&/HUESOS/.test(s),'Excel con el ingreso');
  await p.evaluate(()=>{window.__auto=null;});
  await p.evaluate(()=>{window.pedir=(t,v,s,cb)=>cb('4000');});await p.click('td[onclick="editarIngRd(361)"]');await p.waitForTimeout(300);
  const tt=await p.textContent('main');ok(tt.indexOf('Ingreso de materia prima')<tt.indexOf('Producción de rendering'),'pantalla: ingreso primero');console.log(tt.slice(tt.indexOf('Ingreso de materia'),tt.indexOf('Ingreso de materia')+200));ok(/9[.,]?784,55/.test(tt),'corregir un peso a mano cambia el total');}
 ok(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=0,w+' sin desborde');ok(!errs.length,w+' errores: '+(errs.join('|')||'ninguno'));await p.close();}
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
