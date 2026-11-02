// Centro de desposte › DDJJ desposte: "Excel del día" con el formato de la planilla de Sabi (29.10.2026.xls, pedido del 30/10):
// hojas INGRESO (tabla desde la fila 18) y PROD (desde la fila 32), letras, bordes, celdas combinadas, total con merma y A4.
// Guarda el .xlsx en la carpeta de salida para revisarlo (python openpyxl / LibreOffice).
const {chromium}=require('playwright');const fs=require('fs');const SP=process.argv[2]||'.';
const F='2026-10-29';
const TXT=['OK|2026-10-29 19:00',
 'TR|2026-10-29|261797|200|2026-10-26|12|612','TR|2026-10-29|261798|160|2026-10-27|6|282','TR|2026-10-29|261801|160|2026-10-27|16|720',
 'TR|2026-10-29|261802|160|2026-10-28|110|6160','TR|2026-10-29|261803|160|2026-10-27|172|7912','TR|2026-10-29|261804|200|2026-10-27|248|12896','TR|2026-10-29|261808|200|2026-10-28|186|9672',
 'RE|2026-10-29|327|BOLA DE LOMO|1|5|5|65.7','RE|2026-10-29|101|BONDIOLA|1|60|500|1943.15','RE|2026-10-29|705|CABEZA|8|45|180|886.72',
 'RE|2026-10-29|319|NALGA|1|5|5|70.4','RE|2026-10-29|611|OREJA|1|5|5|40'].join('\n');
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-30T09:00:00-03:00')});
await p.addInitScript(m=>{window.__mock=m;window.__auto={hecho:true};},{user:{email:'ssaavedra@x.com',displayName:'Saavedra',emailVerified:true},rol:'ddjj',sis:{'dj-2026-10':TXT},
 docs:{'ddjj-2026-10':{dias:{[F]:{obs:'Se procesa como recorte de carne parte del jamón (619 unidades) y paleta (350 unidades) por cuestiones comerciales. Parte del cuero (489.70 kg) se destina a rendering por el mismo motivo.'}}}}});
await p.goto('http://127.0.0.1:8765/ddjj.html?f='+F);await p.clock.runFor(1500);await p.waitForSelector('.dj-tab');
await p.click('text=Excel del día');await p.click('text=Excel del mes');
const out=await p.evaluate(()=>window.__autoOut);
ok(out&&out[0].nombre==='DDJJ desposte 29-10-2026.xlsx','nombre: '+(out&&out[0].nombre));
fs.writeFileSync(SP+'/ddjj-dia.xlsx',Buffer.from(out[0].b64,'base64'));fs.writeFileSync(SP+'/ddjj-mes.xlsx',Buffer.from(out[1].b64,'base64'));
ok(Buffer.from(out[0].b64,'base64').slice(0,2).toString()==='PK','es un .xlsx (zip)');
ok(!errs.length,'errores: '+(errs.join('|')||'ninguno'));
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
