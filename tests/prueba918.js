// DDJJ Rendering: ingreso de materia prima con su peso (renglones MI) en pantalla, hoja impresa y Excel (Sabi 27/11).
const {chromium}=require('playwright');
const TXT=['OK|2026-11-27 07:00',
'ME|2026-11-26|6|900|HARINA DE CARNE Y HUESO|40|2000','ME|2026-11-26|6|901|SEBO PORCINO|10|800',
'MI|2026-11-26|6|705|CABEZA|0|3500.5','MI|2026-11-26|6|361|HUESOS|0|4200','MI|2026-11-26|6|411|DECOMISOS|0|900.25','MI|2026-11-26|6|705|CABEZA|0|100','MI|2026-11-26|6|443|DESPOJO|0|1283.8'].join('\n');
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
for(const w of [1300,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-27T09:00:00-03:00')});
 await p.addInitScript(m=>{window.__mock=m},{user:{email:'s@x.com',displayName:'Sabi',emailVerified:true},rol:'ddjj',sis:{'dj-2026-11':TXT},docs:{}});
 await p.goto('http://127.0.0.1:8765/ddjj.html');await p.clock.runFor(1500);await p.click('#nav a[data-t="rd"]');await p.waitForTimeout(400);
 const txt=await p.textContent('main');
 ok(/Ingreso de materia prima/.test(txt)&&/HUESOS/.test(txt)&&/3[.,]?600,50/.test(txt)&&/9[.,]?984,55/.test(txt),w+' pantalla: ingresos por artículo y total');
 if(w===1300){
  const hh=await p.evaluate(()=>{const d=document.createElement('div');d.innerHTML=hojaRd('2026-11-26');document.body.appendChild(d);const H=d.querySelector('.hoja'),f=d.querySelector('.h3-firma');const r={tabla:!!d.querySelector('.h3-ing'),cabe:f.getBoundingClientRect().bottom-H.getBoundingClientRect().top<=H.clientHeight};d.remove();return r;});
  ok(hh.tabla&&hh.cabe,'hoja impresa: tabla de ingreso y entra en la hoja '+JSON.stringify(hh));
  await p.evaluate(()=>{window.__auto={hecho:true};window.__autoOut=[];});await p.click('text=Excel del día');
  const x=await p.evaluate(()=>window.__autoOut[0]);const s=Buffer.from(x.b64,'base64').toString('utf8');
  ok(/DESPOJO \(DE TERCEROS: DON PEDRO\)/.test(s)&&/INGRESO DE MATERIA PRIMA/.test(s)&&/<v>3600.5<\/v>/.test(s)&&/HUESOS/.test(s),'Excel con el ingreso');
  await p.evaluate(()=>{window.__auto=null;});
  await p.evaluate(()=>{window.pedir=(t,v,s,cb)=>cb('4000');});await p.click('td[onclick="editarIngRd(361)"]');await p.waitForTimeout(300);
  const tt=await p.textContent('main');console.log(tt.slice(tt.indexOf('Ingreso de materia'),tt.indexOf('Ingreso de materia')+200));ok(/9[.,]?784,55/.test(tt),'corregir un peso a mano cambia el total');}
 ok(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=0,w+' sin desborde');ok(!errs.length,w+' errores: '+(errs.join('|')||'ninguno'));await p.close();}
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
