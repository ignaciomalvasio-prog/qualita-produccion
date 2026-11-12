// Centro RRHH (/rrhh): acceso (solo rhusuarios), todas las pestañas, ficha, baja, ausencias, vacaciones,
// importar CSV y TXT de ancho fijo, usuarios, celular. Datos de mentira (nunca datos reales en el repositorio).
const {chromium}=require('playwright');const SP=process.argv[2];
function cuil(pre,dni){const c=String(pre)+String(dni).padStart(8,'0');const w=[5,4,3,2,7,6,5,4,3,2];let s=0;for(let i=0;i<10;i++)s+=w[i]*+c[i];let v=11-s%11;if(v===11)v=0;if(v===10)return cuil(pre===20?23:27,dni+1);return c+v;}
const P={};const add=(dni,o)=>{const c=cuil(20,dni);P[c]=Object.assign({cuil:c,dni:String(dni)},o);return c;};
const a=add(30111222,{nombre:'PEREZ JUAN',legajo:'101',nac:'1985-11-20',ingreso:'2012-03-01',sector:'Desposte',puesto:'Despostador',domicilio:'Calle 1',tel:'351111',basico:900000});
const b=add(31222333,{nombre:'GOMEZ ANA',legajo:'102',nac:'1990-11-12',ingreso:'2024-02-10',sector:'Desposte',puesto:'Envasado',domicilio:'Calle 2',tel:'351222'});
const c=add(32333444,{nombre:'LOPEZ CARLOS',legajo:'103',nac:'1970-05-02',ingreso:'2000-01-15',sector:'Faena',categoria:'Oficial',domicilio:'Calle 3',tel:'351333'});
const d=add(33444555,{nombre:'DIAZ MARTA',legajo:'104',ingreso:'2026-11-03',sector:'Administración'});
const e=add(34555666,{nombre:'RUIZ PEDRO',legajo:'105',nac:'1995-01-01',ingreso:'2019-06-01',egreso:'2026-10-15',motivo:'Renuncia',sector:'Faena',puesto:'Playero',domicilio:'x',tel:'1'});
const f=add(35666777,{nombre:'SOSA LUIS',legajo:'106',nac:'1980-07-07',ingreso:'2026-07-01',sector:'Faena',puesto:'Playero',domicilio:'y',tel:'2'});
const docs={nomina:{personas:P},
 'aus-2026':{lista:[{id:'x1',cuil:b,tipo:'enf',desde:'2026-11-10',hasta:'2026-11-14',cert:true,obs:'gripe'},{id:'x2',cuil:a,tipo:'vac',periodo:2025,desde:'2026-01-05',hasta:'2026-01-18'},{id:'x3',cuil:c,tipo:'inj',desde:'2026-11-03',hasta:'2026-11-03'}]},
 'aus-2025':{lista:[{id:'x4',cuil:c,tipo:'vac',periodo:2025,desde:'2025-12-01',hasta:'2025-12-28'}]},
 'liq-indice':{meses:{'2026-09':{n:5,bruto:5000000,neto:4000000,contrib:1300000},'2026-10':{n:5,bruto:5200000,neto:4100000,contrib:0}}},
 'liq-2026-10':{mes:'2026-10',filas:{[a]:{nombre:'PEREZ JUAN',rem:1000000,noRem:50000,bruto:1050000,neto:850000,aportes:200000,contrib:0}}},
 'liq-2026-09':{mes:'2026-09',filas:{[a]:{nombre:'PEREZ JUAN',bruto:1000000,neto:800000,contrib:260000}}}};
const csv='Legajo;CUIL;Apellido y Nombre;Fecha Ingreso;Sección;Categoría;Total Remunerativo;No Remunerativo;Neto\n'+
 '101;'+a.slice(0,2)+'-'+a.slice(2,10)+'-'+a[10]+';PEREZ JUAN;01/03/2012;Desposte;Oficial especializado;1.100.000,50;60.000,00;900.000,00\n'+
 '107;'+cuil(20,36777888)+';NUEVO TOMAS;02/11/2026;Ciclo III;Ayudante;700.000,00;0;560.000,00\n'+
 ';;TOTAL;;;;1.800.000,50;60.000,00;1.460.000,00\n';
const txt=[a,cuil(20,36777888)].map((x,i)=>x+(i?'NUEVO TOMAS                   ':'PEREZ JUAN                    ')+'0101 000001100000,50 000000060000,00 000000300000,00').join('\r\n');
(async()=>{const br=await chromium.launch();
const nueva=async(w,mock,url)=>{const p=await br.newPage({viewport:{width:w,height:900}});p.errs=[];p.on('pageerror',x=>p.errs.push(x.message));p.on('console',m=>{if(m.type()==='error'&&!/xlsx|cdnjs|ERR_|Failed to load resource/i.test(m.text()))p.errs.push(m.text())});
 await p.clock.install({time:new Date('2026-11-12T12:00:00-03:00')});await p.addInitScript(m=>{window.__mock=m;try{localStorage.clear()}catch(e){}},mock);await p.goto('http://127.0.0.1:8765/'+(url||'rrhh.html'));await p.clock.runFor(1500);return p;};
// acceso: un editor de producción sin rhusuarios no entra; quien tiene solo rol rrhh va de /control a /rrhh
{const p=await nueva(1200,{user:{email:'renzo@x.com',displayName:'Renzo',emailVerified:true},rol:'editor',docs});console.log('editor sin RRHH:',(await p.innerText('main')).split('\n')[0]);await p.close();}
{const p=await nueva(1200,{user:{email:'carlos@x.com',displayName:'Carlos',emailVerified:true},rol:'todo',docs});console.log('usuario de otro centro:',(await p.innerText('main')).split('\n')[0]);await p.close();}
{const p=await nueva(1200,{user:{email:'gabi@x.com',displayName:'Gabi',emailVerified:true},rol:'rrhh',docs},'control.html');await p.waitForTimeout(300);console.log('solo rrhh en /control va a:',new URL(p.url()).pathname);await p.close();}
for(const w of [1400,400]){
const p=await nueva(w,{user:{email:'igna@x.com',displayName:'Igna',emailVerified:true},rol:'editor',rh:{admin:true,nombre:'Igna'},rhusuarios:{'igna@x.com':{admin:true,nombre:'Igna'}},docs:JSON.parse(JSON.stringify(docs))});
await p.waitForSelector('.kpi');
console.log(w,'resumen:',await p.evaluate(()=>[...document.querySelectorAll('.kpi')].map(k=>k.innerText.replace(/\n/g,' ')).join(' | ')));
if(w===1400)await p.screenshot({path:SP+'/rrhh-resumen.png',fullPage:true});
for(const t of ['nomina','ausencias','vacaciones','indicadores','importar','cambios','usuarios','resumen']){await p.click('#nav a[data-t="'+t+'"]');await p.waitForTimeout(300);
 console.log(w,t,'filas',await p.locator('main table tbody tr').count(),'· desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth));
 if(w===1400||t==='nomina')await p.screenshot({path:SP+'/rrhh-'+t+(w===400?'-400':'')+'.png',fullPage:true});}
if(w===1400){
 await p.click('#nav a[data-t="vacaciones"]');await p.waitForTimeout(300);
 console.log('vacaciones 2026:',await p.evaluate(()=>[...document.querySelectorAll('#tw-vac tbody tr')].map(r=>r.cells[1].innerText+' '+r.cells[5].innerText+'/'+r.cells[6].innerText).join(', ')));
 await p.selectOption('#f-anio','2025');await p.waitForTimeout(300);
 console.log('vacaciones 2025:',await p.evaluate(()=>[...document.querySelectorAll('#tw-vac tbody tr')].map(r=>r.cells[1].innerText+' '+r.cells[5].innerText+'/'+r.cells[6].innerText+'/'+r.cells[7].innerText).join(', ')));
 // ficha: editar, solapas, baja
 await p.click('#nav a[data-t="nomina"]');await p.waitForTimeout(200);await p.fill('#f-bus','gomez');await p.waitForTimeout(200);
 console.log('buscar gomez:',await p.locator('#tw-nom tbody tr').count());await p.locator('#tw-nom tr.clic').first().click();await p.waitForTimeout(300);
 await p.fill('#p-nac','1990-11-12');await p.fill('#p-categoria','Medio oficial');await p.click('#p-ok');await p.waitForTimeout(300);
 console.log('guardado:',await p.evaluate(()=>JSON.stringify(window.__mock.docs.nomina.personas[Object.keys(window.__mock.docs.nomina.personas).find(k=>window.__mock.docs.nomina.personas[k].nombre==='GOMEZ ANA')].categoria)));
 for(const s of ['ausencias','vacaciones','sueldos']){await p.click('[data-fi="'+s+'"]');await p.waitForTimeout(300);console.log('ficha',s,':',(await p.innerText('#fi-b')).replace(/\s+/g,' ').slice(0,120));if(s==='ausencias')await p.screenshot({path:SP+'/rrhh-ficha.png'});}
 await p.click('[data-fi="datos"]');await p.waitForTimeout(200);p.once('dialog',dd=>dd.accept());await p.fill('#b-fec','2026-11-12');await p.selectOption('#b-mot','Despido sin causa');await p.click('.caja-baja button.danger');await p.waitForTimeout(300);
 console.log('baja:',await p.evaluate(()=>{const x=Object.values(window.__mock.docs.nomina.personas).find(x=>x.nombre==='GOMEZ ANA');return x.egreso+' '+x.motivo;}));
 await p.click('#dlg-f button:has-text("Cerrar")');
 // nueva persona con CUIL inválido y luego válido
 await p.click('button:has-text("Nueva persona")');await p.fill('#p-nombre','PRUEBA X');await p.fill('#p-cuil','20-12345678-0');p.once('dialog',dd=>dd.dismiss());await p.click('#p-ok');await p.waitForTimeout(200);
 await p.fill('#p-cuil','20123456786');await p.fill('#p-ingreso','2026-11-01');await p.click('#p-ok');await p.waitForTimeout(300);
 console.log('nueva persona:',await p.evaluate(()=>!!window.__mock.docs.nomina.personas['20123456786']));await p.click('#dlg-f button:has-text("Cerrar")');
 // ausencia nueva
 await p.click('#nav a[data-t="ausencias"]');await p.waitForTimeout(300);await p.click('main button:has-text("Cargar ausencia")');await p.waitForTimeout(200);
 await p.selectOption('#a-cuil','20123456786');await p.selectOption('#a-tipo','art');await p.fill('#a-desde','2026-11-09');await p.fill('#a-hasta','2026-11-11');await p.click('#a-ok');await p.waitForTimeout(300);
 console.log('ausencias nov:',await p.locator('#tw-aus tbody tr').count(),'·',await p.evaluate(()=>window.__mock.docs['aus-2026'].lista.length));
 // importar CSV
 await p.click('#nav a[data-t="importar"]');await p.waitForTimeout(200);
 await p.setInputFiles('#imp-file',{name:'sueldos 2026-10.csv',mimeType:'text/csv',buffer:Buffer.from(csv,'latin1')});await p.waitForTimeout(500);
 console.log('csv columnas:',await p.evaluate(()=>[...document.querySelectorAll('[data-map]')].filter(s=>s.value!=='-1').map(s=>s.dataset.map+'='+s.selectedOptions[0].text).join(', ')));
 console.log('csv mes:',await p.inputValue('#imp-mes'),'· vista previa',await p.locator('#tw-imp tbody tr').count());
 await p.screenshot({path:SP+'/rrhh-importar.png',fullPage:true});
 p.once('dialog',dd=>dd.accept());await p.click('#imp-ok');await p.waitForTimeout(500);
 console.log('resultado:',(await p.innerText('.ok-box')).replace(/\s+/g,' ').slice(0,200));
 console.log('liq oct:',await p.evaluate(()=>JSON.stringify(window.__mock.docs['liq-indice'].meses['2026-10'].bruto)),'· categoría Perez',await p.evaluate(()=>Object.values(window.__mock.docs.nomina.personas).find(x=>x.nombre==='PEREZ JUAN').categoria));
 // TXT de ancho fijo
 await p.click('#imp-otro');await p.waitForTimeout(200);
 await p.setInputFiles('#imp-file',{name:'F931_202609.txt',mimeType:'text/plain',buffer:Buffer.from(txt)});await p.waitForTimeout(500);
 console.log('txt:',await p.evaluate(()=>[...document.querySelectorAll('#tw-imp tbody tr')].map(r=>r.innerText.replace(/\s+/g,' ')).join(' / ')),'· mes',await p.inputValue('#imp-mes'));
 // indicadores y usuarios
 await p.click('#nav a[data-t="indicadores"]');await p.waitForTimeout(400);
 console.log('indicadores:',await p.evaluate(()=>[...document.querySelectorAll('.kpi')].map(k=>k.innerText.replace(/\n/g,' ')).join(' | ')));
 await p.screenshot({path:SP+'/rrhh-indicadores.png',fullPage:true});
 const [dl]=await Promise.all([p.waitForEvent('download',{timeout:5000}).catch(()=>null),p.click('[data-xl^="ind"]')]);console.log('excel:',dl?dl.suggestedFilename():'no (sin internet para la librería)');
 await p.click('#nav a[data-t="usuarios"]');await p.waitForTimeout(300);await p.fill('#nu-mail','Gabi@X.com');await p.fill('#nu-nom','Gabi');await p.click('button:has-text("Agregar")');await p.waitForTimeout(300);
 console.log('usuarios:',await p.evaluate(()=>JSON.stringify(Object.keys(window.__mock.rhusuarios))));
 await p.click('#nav a[data-t="cambios"]');await p.waitForTimeout(300);console.log('cambios:',await p.locator('#tw-camb tbody tr').count());
}
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',p.errs.join('|')||'ninguno');
if(w===400){await p.locator('#tw-nom tr.clic').first().click().catch(()=>{});}
await p.close();}
// un usuario rrhh sin admin no ve Usuarios
{const p=await nueva(1200,{user:{email:'gabi@x.com',displayName:'Gabi',emailVerified:true},rol:'rrhh',docs});await p.waitForSelector('.kpi');console.log('rrhh sin admin ve Usuarios:',await p.isVisible('#nav-usr'),'· errores',p.errs.join('|')||'ninguno');await p.close();}
await br.close();})();
