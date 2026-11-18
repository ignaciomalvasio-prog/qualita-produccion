// Centro de desposte › DDJJ Chacinados: Excel del día y del mes con el formato de la hoja impresa (Sabi 18/11).
const {chromium}=require('playwright');
const TXT=['OK|2026-11-18 07:00','C3|2026-11-17|801|CHORIZO FRESCO|100|250.5','C3|2026-11-17|802|MORCILLA|50|80','C3|2026-11-16|801|CHORIZO FRESCO|100|200'].join('\n');
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
for(const w of [1300,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-18T09:00:00-03:00')});
 await p.addInitScript(m=>{window.__mock=m},{user:{email:'s@x.com',displayName:'Sabi',emailVerified:true},rol:'ddjj',sis:{'dj-2026-11':TXT},docs:{}});
 await p.goto('http://127.0.0.1:8765/ddjj.html');await p.clock.runFor(1500);await p.click('#nav a[data-t="c3"]');await p.waitForTimeout(400);
 if(w===1300){
  await p.evaluate(()=>{window.__auto={hecho:true};window.__autoOut=[];});
  await p.click('text=Excel del día');await p.click('text=Excel del mes');
  const xl=await p.evaluate(()=>window.__autoOut);const d1=Buffer.from(xl[0].b64,'base64').toString('utf8'),d2=Buffer.from(xl[1].b64,'base64').toString('utf8');
  ok(xl[0].nombre==='DDJJ chacinados 17-11-2026.xlsx'&&/CHORIZO FRESCO DE CERDO/.test(d1)&&/<v>250.5<\/v>/.test(d1)&&/Km. 748/.test(d1)&&/Oficial 5036/.test(d1)&&/Chacinados/.test(d1),'Excel del día: '+xl[0].nombre);
  ok(/DDJJ chacinados Noviembre 2026\.xlsx/i.test(xl[1].nombre)&&/name="17-11"/.test(d2)&&/name="16-11"/.test(d2),'Excel del mes: una hoja por día');}
 ok(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=0,w+' sin desborde');ok(!errs.length,w+' errores: '+(errs.join('|')||'ninguno'));await p.close();}
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
