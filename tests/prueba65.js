// Medias: pegar una captura (Ctrl+V) o subir una foto de la planilla en "Pegar faena desde Excel": se toma solo la faena.
const {chromium}=require('playwright');const SP=process.argv[2];const fs=require('fs');
const L='2026-10-19';
const dia=(i,cl)=>({fecha:['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23'][i],faena:[{origen:'VIEJO',propios:1,usuarios:0}],clientes:cl||[]});
const data={config:{general:{}},privado:{clientes:{lista:[]}},produccion:{},pedidos:{},
 faena:{[L]:{desde:L,stockInicial:null,dias:[dia(0,[{cliente:'JMC',cant:25}]),dia(1),dia(2),dia(3),dia(4)]}}};
const F=(o,p,u)=>({origen:o,propios:p,usuarios:u||0});
const planilla=[
 {dia:'LUNES',fecha:'2026-10-19',faena:[F('CANDELARIA',160),F('CANDELARIA',160),F('LA COLORADA',160),F('EL CEBIL',160),F('AG',200),F('INTERPOK',0,0)],clientes:[{cliente:'NO TIENE QUE ENTRAR',cerdos:99}]},
 {dia:'MARTES',fecha:'2026-10-20',faena:[F('CANDELARIA',160),F('CANDELARIA',160),F('EL CEBIL',160),F('AG',200)],clientes:[]},
 {dia:'MIERCOLES',fecha:'2026-10-21',faena:[F('CANDELARIA',160),F('LA COLORADA',160),F('EL CEBIL',160),F('AG',200)],clientes:[]},
 {dia:'JUEVES',fecha:'2026-10-22',faena:[F('CANDELARIA',160),F('CANDELARIA',160),F('LA COLORADA',160),F('EL CEBIL',160)],clientes:[]},
 {dia:'VIERNES',fecha:'2026-10-23',faena:[F('CANDELARIA',160),F('EL CEBIL',120),F('AG',120),F('DON PEDRO',0,160)],clientes:[]}];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');fs.writeFileSync(SP+'/planilla.png',png);
const res=d=>d.dias.map((x,i)=>['LU','MA','MI','JU','VI'][i]+': '+x.faena.map(r=>(r.origen||'-')+' '+r.propios+'/'+r.usuarios).join(', ')+(x.clientes.length?' · clientes '+x.clientes.map(c=>c.cliente+' '+c.cant).join(','):'')).join('\n  ');
(async()=>{const b=await chromium.launch();
for(const [w,modo] of [[1280,'pegar'],[400,'subir']]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-19T23:20:00-03:00')});
await p.addInitScript(([d,pl])=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],ia:(tipo)=>({pedidos:[],planilla:pl})}},[data,planilla]);
await p.goto('http://127.0.0.1:8765/index.html#medias');await p.clock.runFor(1500);await p.waitForTimeout(200);
if(!(await p.locator('[data-act="pf-abrir"]').count())){await p.click('[data-act="m-semana"]').catch(()=>{});await p.waitForTimeout(200);}
await p.click('[data-act="sem"][data-d="7"]');await p.waitForTimeout(150);
await p.click('[data-act="pf-abrir"]');await p.waitForTimeout(100);
if(modo==='pegar'){
 await p.evaluate(async()=>{const r=await fetch('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');const bl=await r.blob();const dt=new DataTransfer();dt.items.add(new File([bl],'image.png',{type:'image/png'}));document.getElementById('pf-txt').focus();document.getElementById('pf-txt').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true}));});
}else{await p.setInputFiles('#pf-foto',SP+'/planilla.png');}
await p.waitForTimeout(300);
console.log(w,modo,'vista previa:',(await p.locator('#pf-prev').innerText()).replace(/\s+/g,' ').slice(0,200));
await p.screenshot({path:SP+'/fotofaena'+w+'.png',fullPage:true});
await p.click('[data-act="pf-guardar"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'mensaje:',await p.locator('#g-medias').innerText().catch(()=>'?'),'· a la vista:',await p.locator('#view-medias .nav .tit').innerText());
console.log(w,'guardado:\n  '+await p.evaluate(()=>window.__mock.data.faena['2026-10-19']).then(res));
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
// Sin clave de IA: no ofrece fotos.
const q=await b.newPage({viewport:{width:1280,height:900}});await q.clock.install({time:new Date('2026-10-19T23:20:00-03:00')});
await q.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await q.goto('http://127.0.0.1:8765/index.html#medias');await q.clock.runFor(1500);await q.waitForTimeout(200);
if(!(await q.locator('[data-act="pf-abrir"]').count())){await q.click('[data-act="m-semana"]').catch(()=>{});await q.waitForTimeout(200);}
await q.click('[data-act="pf-abrir"]');await q.waitForTimeout(100);
console.log('sin clave:',await q.locator('.pf-foto').innerText());
await b.close();})();
