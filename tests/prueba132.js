// Centro de desposte · descarga automática diaria (dj_excel_diario.ps1): la PC arma una copia de ddjj.html con los datos en
// window.__mock y el pedido en window.__auto, la abre con Edge sin ventana y lee <pre id="auto-out">. Acá se hace lo mismo con Chromium.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const SP=process.argv[2];
const TXT=['OK|2026-10-29 07:00',
 'TR|2026-10-27|261790|160|2026-10-25|320|25600','RE|2026-10-27|101|BONDIOLA|1|64|554|1355.97',
 'TR|2026-10-28|261799|160|2026-10-27|318|25440','RE|2026-10-28|101|BONDIOLA|1|60|500|1300',
 'TR|2026-10-29|261805|160|2026-10-28|300|24000','RE|2026-10-29|101|BONDIOLA|1|10|50|130'].join('\n');
const ANUAL='OK|2026-10-29 07:00\nMU|2026-10-27|261799|1|C|AB123CD|10|PRODUCTOR|LOCALIDAD| ';
function armar(auto){   // lo mismo que hace dj_excel_diario.ps1
  let h=fs.readFileSync(path.join(__dirname,'../docs/ddjj.html'),'utf8');
  const mock={user:{email:'pc@x.com',displayName:'Descarga automática',emailVerified:true},rol:'ddjj',sis:{'dj-2026-10':TXT,'dj-anual':ANUAL},docs:{}};
  const js=('window.__mock='+JSON.stringify(mock)+';window.__auto='+JSON.stringify(auto)+';').replace(/<\//g,'<\\/');
  h=h.replace(/<head>/i,'<head><base href="http://127.0.0.1:8765/"><script>'+js+'</script>');
  const f=path.join(SP,'auto.html');fs.writeFileSync(f,h);return 'file://'+f;
}
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
const correr=async auto=>{const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 // la librería de Excel viene de internet: acá una de mentira que devuelve el contenido en vez del archivo
 await p.addInitScript(()=>{window.XLSX={utils:{book_new:()=>({h:[]}),aoa_to_sheet:a=>({a}),book_append_sheet:(wb,ws,n)=>wb.h.push([n,ws.a])},write:wb=>btoa(unescape(encodeURIComponent(JSON.stringify(wb.h))))};});
 await p.goto(armar(auto));await p.waitForFunction(()=>/^AUTO-/.test(document.title),null,{timeout:20000});
 const r={titulo:await p.title(),out:JSON.parse(await p.textContent('#auto-out')),errs};await p.close();return r;};
let r=await correr({hasta:'2026-10-28',tener:[]});
ok(r.titulo==='AUTO-OK','termina bien ('+r.titulo+')');
ok(JSON.stringify(r.out.dias)==='["2026-10-27","2026-10-28"]','sin archivos: todos los días hasta ayer, no el de hoy ('+r.out.dias+')');
const nom=r.out.archivos.map(a=>a.nombre);console.log('archivos:',nom.join(', '));
ok(nom.includes('DDJJ desposte 28-10-2026.xlsx')&&nom.includes('Rendimiento desposte 2026-10.xlsx'),'DDJJ del día y Rendimiento del mes');
const d28=JSON.parse(Buffer.from(r.out.archivos.find(a=>a.nombre==='DDJJ desposte 28-10-2026.xlsx').b64,'base64').toString('utf8'));
ok(d28[0][1].some(f=>f.join('|')==='27/10/2026|261799|159|318|25440|FAENA PARCIAL'),'el Excel trae lo mismo que la página (159, FAENA PARCIAL)');
ok(!r.errs.length,'errores: '+(r.errs.join('|')||'ninguno'));
r=await correr({hasta:'2026-10-28',tener:['2026-10-27','2026-10-28']});
ok(JSON.stringify(r.out.dias)==='["2026-10-28"]','con archivos: solo vuelve a guardar el último día ('+r.out.dias+')');
r=await correr({hasta:'2026-10-26',tener:[]});
ok(r.titulo==='AUTO-OK'&&r.out.archivos.length===0,'sin desposte hasta esa fecha: no guarda nada');
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
