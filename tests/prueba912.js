// Centro RRHH (/rrhh) · pestaña Reloj: Excel de CC-Cloud que llegan por mail (rhdocs/reloj-entrada + reloj-x-*) y subidos a mano,
// vista de un día, período, ficha › Reloj, celular. Datos de mentira (nunca datos reales en el repositorio).
const {chromium}=require('playwright');const fs=require('fs'),os=require('os'),path=require('path');const SP=process.argv[2]||'/tmp';
function cuil(pre,dni){const c=String(pre)+String(dni).padStart(8,'0');const w=[5,4,3,2,7,6,5,4,3,2];let s=0;for(let i=0;i<10;i++)s+=w[i]*+c[i];let v=11-s%11;if(v===11)v=0;if(v===10)return cuil(pre===20?23:27,dni+1);return c+v;}
const E=(l,c,ap,no,sec,alta)=>['E',l,c,ap,no,'M','1980-01-01',alta||'2015-01-01','','','',sec,'Oficial','Operario','CCT 607/10','1','Calle','1','','','5220','','','','8'].join('|');
const a=cuil(20,30111222),b=cuil(20,31222333),c=cuil(20,32333444),f=cuil(20,35666777);
const sisNom='OK|2026-11-12 07:05\n'+[E(101,a,'PEREZ','JUAN','DESPOSTE'),E(102,b,'GOMEZ','ANA','DESPOSTE'),E(103,c,'LOPEZ','CARLOS','FAENA'),E(106,f,'SOSA','LUIS','FAENA')].join('\n');
const docs={'sis-nomina':{txt:sisNom,act:'2026-11-12 07:05'},'aus-2026':{lista:[{id:'x1',cuil:b,tipo:'enf',desde:'2026-11-10',hasta:'2026-11-14',cert:true}]}};
// reportes como los de CC-Cloud (título, período, sector o persona como título de grupo, encabezado, renglones)
const cab=(t,d)=>[[t],['Período: '+d],['Fecha de emisión: 12/11/2026 06:00'],[]];
const HF=['Legajo','Empleado','Día','Fecha','Hora','E/S','Reloj','Estado fichada','Rostro detectado','Biometría superada','Geolocalización','Coordenadas','En lugar'];
const fi=(l,n,d,h,es)=>[l,n,'x',d,h,es,'Frigorifico','Aceptada','No aplica','No aplica','','',''];
const crono10=cab('Reporte Cronológico de Fichadas','10/11/2026').concat([['7 - FAENA'],HF,fi(106,'SOSA LUIS','10/11/2026','22:01','Entrada'),fi(103,'LOPEZ CARLOS','10/11/2026','06:00','Entrada'),fi(103,'LOPEZ CARLOS','10/11/2026','15:00','Salida')]);
const crono11=cab('Reporte Cronológico de Fichadas','11/11/2026').concat([['9 - DESPOSTE'],HF,fi(101,'PEREZ JUAN','11/11/2026','06:05','Entrada'),fi(101,'PEREZ JUAN','11/11/2026','14:55','Salida'),[],[],
 ['7 - FAENA'],HF,fi(106,'SOSA LUIS','11/11/2026','06:00','Salida'),fi(103,'LOPEZ CARLOS','11/11/2026','06:30','Entrada'),fi(103,'LOPEZ CARLOS','11/11/2026','15:00','Salida'),fi(106,'SOSA LUIS','11/11/2026','21:58','Entrada'),
 [],['13 - OTROS SERVICIOS'],HF,fi(999,'NUEVO SIN LEGAJO','11/11/2026','07:00','Entrada'),[...fi(999,'NUEVO SIN LEGAJO','11/11/2026','07:01','Entrada').slice(0,7),'Rechazada']]);
const HN=['LEGAJO','DÍA','FECHA','NOVEDAD','COD.','CONCEPTO','CANT.','PAGO','OBSERVACIONES'];
const aus11=cab('Reporte de Ausencias y Retrasos','11/11/2026').concat([['101 - PEREZ JUAN'],HN,[101,'Miércoles','11/11/2026','SAL.ANTES','','','0:05','NO',''],['102 - GOMEZ ANA'],HN,[102,'Miércoles','11/11/2026','AUSENTE','','','9:00','NO',''],
 ['103 - LOPEZ CARLOS'],HN,[103,'Miércoles','11/11/2026','ENT.TARDE','','','0:30','NO','']]);
const aus10=cab('Reporte de Ausencias y Retrasos','10/11/2026').concat([['102 - GOMEZ ANA'],HN,[102,'Martes','10/11/2026','AUSENTE','','','9:00','NO',''],['101 - PEREZ JUAN'],HN,[101,'Martes','10/11/2026','AUSENTE','','','9:00','NO','']]);
(async()=>{const br=await chromium.launch();
const p0=await br.newPage();await p0.goto('http://127.0.0.1:8765/rrhh.html');await p0.waitForFunction(()=>window.XLSX,null,{timeout:20000});
const b64=aoa=>p0.evaluate(x=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(x),'CC-Cloud');return XLSX.write(wb,{type:'base64',bookType:'xlsx'});},aoa);
const fixDate=aoa=>aoa.map(r=>r.map(v=>typeof v==='string'&&/^\d\d\/\d\d\/\d{4}$/.test(v)&&r.length>3?v:v));
docs['reloj-entrada']={lista:[{id:'v1-1-0',archivo:'ReporteFichadasCronologico_20261111.xlsx',recibido:'2026-11-12T06:00'},{id:'v1-2-0',archivo:'ReporteAusenciasRetrasos_20261111.xlsx',recibido:'2026-11-12T06:01'},{id:'v1-3-0',archivo:'otro.xlsx',recibido:'2026-11-12T06:02'}]};
docs['reloj-x-v1-1-0']={b64:await b64(fixDate(crono11))};docs['reloj-x-v1-2-0']={b64:await b64(aus11)};docs['reloj-x-v1-3-0']={b64:await b64([['Hola'],['nada']])};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rj-'));
fs.writeFileSync(tmp+'/Crono10.xlsx',Buffer.from(await b64(crono10),'base64'));fs.writeFileSync(tmp+'/Aus10.xlsx',Buffer.from(await b64(aus10),'base64'));
await p0.close();
const nueva=async(w)=>{const p=await br.newPage({viewport:{width:w,height:900}});p.errs=[];p.on('pageerror',x=>p.errs.push(x.message));p.on('console',m=>{if(m.type()==='error'&&!/ERR_|Failed to load resource/i.test(m.text()))p.errs.push(m.text())});
 await p.clock.install({time:new Date('2026-11-12T12:00:00-03:00')});await p.addInitScript(m=>{window.__mock=m;try{localStorage.clear()}catch(e){}},{user:{email:'igna@x.com',displayName:'Igna',emailVerified:true},rol:'editor',rh:{admin:true,nombre:'Igna'},rhusuarios:{'igna@x.com':{admin:true,nombre:'Igna'}},docs:JSON.parse(JSON.stringify(docs))});
 await p.goto('http://127.0.0.1:8765/rrhh.html');await p.clock.runFor(1500);return p;};
const p=await nueva(1400);await p.waitForSelector('.kpi');
await p.click('#nav a[data-t="reloj"]');await p.waitForSelector('#rj-dia',{timeout:15000});await p.waitForTimeout(300);
const kp=()=>p.evaluate(()=>[...document.querySelectorAll('main .kpi')].map(k=>k.innerText.replace(/\n/g,' ')).join(' | '));
console.log('procesados:',await p.evaluate(()=>JSON.stringify(window.__mock.docs['reloj-hechos'].ids)),'· índice',await p.evaluate(()=>JSON.stringify(window.__mock.docs['reloj-indice'].meses)));
console.log('mes nov:',await p.evaluate(()=>window.__mock.docs['reloj-2026-11'].txt.split('\n').length+' renglones · '+JSON.stringify(window.__mock.docs['reloj-2026-11'].dias)));
console.log('título:',await p.innerText('main .cab h2'));console.log('kpis 11/11:',await kp());
const filas=id=>p.evaluate(i=>[...document.querySelectorAll('#tw-'+i+' tbody tr')].map(r=>[...r.cells].map(c=>c.innerText.trim()).join(' / ')).join(' || '),id);
for(const t of ['rj-sec','rj-aus','rj-tar','rj-ant','rj-inc','rj-tod'])console.log(t,':',await filas(t));
await p.screenshot({path:SP+'/rrhh-reloj.png',fullPage:true});
// subir a mano el 10/11 (fichadas y ausencias)
await p.setInputFiles('#rj-up',[tmp+'/Crono10.xlsx',tmp+'/Aus10.xlsx']);await p.waitForTimeout(1500);
console.log('después de subir:',await p.evaluate(()=>JSON.stringify(window.__mock.docs['reloj-2026-11'].dias)));
await p.click('#rj-ant');await p.waitForTimeout(500);console.log('día anterior:',await p.innerText('main .cab h2'),'·',await kp());
console.log('rj-aus 10/11:',await filas('rj-aus'));console.log('rj-tod 10/11:',await filas('rj-tod'));
// período
await p.click('#rj-m-per');await p.waitForTimeout(500);console.log('período:',await p.innerText('main .cab h2'),'·',await kp());
console.log('rj-pp:',await filas('rj-pp'));console.log('rj-pd:',await filas('rj-pd'));
await p.screenshot({path:SP+'/rrhh-reloj-per.png',fullPage:true});
// ficha › Reloj
await p.locator('#tw-rj-pp tr.clic').first().click();await p.waitForSelector('#fi-b table',{timeout:5000});console.log('ficha reloj:',(await p.innerText('#fi-b')).replace(/\s+/g,' ').slice(0,260));
await p.screenshot({path:SP+'/rrhh-reloj-ficha.png'});
console.log('cambios:',await p.evaluate(()=>(window.__mock.cambios||[]).length));
console.log('errores 1400:',p.errs.join(' ; ')||'ninguno');await p.close();
const q=await nueva(400);await q.waitForSelector('.kpi');await q.click('#nav a[data-t="reloj"]');await q.waitForSelector('#rj-dia',{timeout:15000});await q.waitForTimeout(400);
console.log('400 desborde:',await q.evaluate(()=>document.documentElement.scrollWidth-innerWidth));await q.screenshot({path:SP+'/rrhh-reloj-400.png',fullPage:true});
await q.click('#rj-m-per');await q.waitForTimeout(400);console.log('400 período desborde:',await q.evaluate(()=>document.documentElement.scrollWidth-innerWidth));
console.log('errores 400:',q.errs.join(' ; ')||'ninguno');
await br.close();})();
