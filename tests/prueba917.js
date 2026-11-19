// DDJJ desposte: "Excel del día/mes" se guarda directo en la carpeta DDJJ\AAAA-MM Mes, no en Descargas (Sabi 19/11).
const {chromium}=require('playwright');const F='2026-10-29';
const TXT=['OK|2026-10-29 19:00','TR|2026-10-29|261797|200|2026-10-26|12|612','RE|2026-10-29|101|BONDIOLA|1|60|500|1943.15'].join('\n');
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
for(const w of [1300,400]){
const p=await b.newPage({viewport:{width:w,height:900},acceptDownloads:true});const errs=[];p.on('pageerror',e=>errs.push(e.message));let descargas=0;p.on('download',()=>descargas++);
await p.clock.install({time:new Date('2026-10-30T09:00:00-03:00')});
await p.addInitScript(m=>{window.__mock=m;window.__esc=[];window.__picker=0;
 const dir=(name)=>({name,kind:'directory',queryPermission:async()=>'granted',requestPermission:async()=>'granted',
  getDirectoryHandle:async(n)=>dir(name+'\\'+n),getFileHandle:async(n)=>({createWritable:async()=>({write:async(d)=>window.__esc.push({ruta:name+'\\'+n,len:d.length}),close:async()=>{}})})});
 window.showDirectoryPicker=async()=>{window.__picker++;return dir('DDJJ');};
 indexedDB.deleteDatabase('ddjj-carpeta');},
 {user:{email:'s@x.com',displayName:'Sabi',emailVerified:true},rol:'ddjj',sis:{'dj-2026-10':TXT},docs:{}});
await p.goto('http://127.0.0.1:8765/ddjj.html?f='+F);await p.clock.runFor(1500);await p.waitForSelector('.dj-tab');
ok(await p.isVisible('text=Cambiar carpeta'),'muestra el aviso de la carpeta');
if(w===1300){
 await p.click('text=Excel del día');await p.clock.runFor(800);
 // la carpeta queda guardada en IndexedDB; el handle falso no se puede clonar, así que el picker puede volver a pedirse: lo importante es dónde se escribe
 await p.click('text=Excel del mes');await p.clock.runFor(800);await p.waitForFunction(()=>window.__esc.length>=2,null,{timeout:5000}).catch(()=>{});
 const e=await p.evaluate(()=>window.__esc);console.log(JSON.stringify(e));
 ok(e.length===2&&e[0].ruta==='DDJJ\\2026-10 Octubre\\DDJJ desposte 29-10-2026.xlsx'&&e[0].len>1000,'día en DDJJ\\2026-10 Octubre');
 ok(e[1]&&/DDJJ\\2026-10 Octubre\\DDJJ desposte Octubre 2026\.xlsx/i.test(e[1].ruta),'mes en la misma carpeta');
 ok(descargas===0,'no se descarga en Descargas ('+descargas+')');}
ok(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=0,w+' sin desborde');
ok(!errs.length,w+' errores: '+(errs.join('|')||'ninguno'));await p.close();}
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
