// Medias: pegar la faena desde la planilla de Excel (días uno al lado del otro). Va a la semana de las fechas, reemplaza solo la faena y no toca los clientes.
const {chromium}=require('playwright');const SP=process.argv[2];
const T=a=>a.join('\t');
const blk=(o,p,u,t)=>[o||'',p==null?'':String(p),u==null?'':String(u),t==null?'':String(t)];
const fila=(...ds)=>T([''].concat(...ds));
const vacio=blk();
const xl=[
 T(['SEMA','Lunes 19','','','','Martes 20','','','','Miercoles 21','','','','Jueves 22','','','','Viernes 23','','','','','']),
 T(['43','','PROPIOS','USUARIOS','TOTAL','','PROPIOS','USUARIOS','TOTAL','','PROPIOS','USUARIOS','TOTAL','','PROPIOS','USUARIOS','TOTAL','','PROPIOS','USUARIOS','TOTAL','PROPIOS','USUARIOS']),
 fila(blk('CANDELARIA',160),blk('CANDELARIA',160),blk('CANDELARIA',160),blk('CANDELARIA',160),blk('CANDELARIA',160)),
 fila(blk('CANDELARIA',160),blk('CANDELARIA',160),blk('LA COLORADA',160),blk('CANDELARIA',160),blk('EL CEBIL',120)),
 fila(blk('LA COLORADA',160),blk('EL CEBIL',160),blk('EL CEBIL',160),blk('LA COLORADA',160),blk('AG',120)),
 fila(blk('EL CEBIL',160),blk('AG',200),blk('AG',200),blk('EL CEBIL',160),vacio),
 fila(blk('AG',200),vacio,vacio,vacio,vacio),
 fila(blk('INTERPOK','',0),vacio,vacio,vacio,blk('DON PEDRO','',160)),
 fila(vacio,vacio,vacio,vacio,vacio),
 fila(vacio,vacio,vacio,vacio,vacio),
 T(['','TOTAL','840','0','840','TOTAL','680','0','680','TOTAL','680','0','680','TOTAL','640','0','640','TOTAL','400','160','560','3240','160']),
].join('\n');
const L='2026-10-19';
const dia=(i,cl)=>({fecha:['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23'][i],faena:[{origen:'VIEJO',propios:1,usuarios:0}],clientes:cl||[]});
const data={config:{general:{}},privado:{clientes:{lista:[]}},produccion:{},pedidos:{},
 faena:{[L]:{desde:L,stockInicial:null,dias:[dia(0,[{cliente:'JMC',cant:25}]),dia(1,[{cliente:'DIGAR',cant:180}]),dia(2),dia(3),dia(4)]}}};
const res=d=>d.dias.map((x,i)=>['LU','MA','MI','JU','VI'][i]+': '+x.faena.map(r=>(r.origen||'-')+' '+r.propios+'/'+r.usuarios).join(', ')+(x.clientes.length?' · clientes '+x.clientes.map(c=>c.cliente+' '+c.cant).join(','):'')).join('\n  ');
(async()=>{const b=await chromium.launch();
for(const [w,atras] of [[1280,0],[400,1]]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-19T23:10:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#medias');await p.clock.runFor(1500);await p.waitForTimeout(200);
if(!(await p.locator('[data-act="pf-abrir"]').count())){await p.click('[data-act="m-semana"]').catch(()=>{});await p.waitForTimeout(200);}
if(atras){await p.click('[data-act="sem"][data-d="-7"]');await p.waitForTimeout(150);}
console.log(w,'semana a la vista:',await p.locator('#view-medias .nav .tit').innerText());
await p.click('[data-act="pf-abrir"]');await p.waitForTimeout(100);
await p.fill('#pf-txt',xl);await p.locator('#pf-txt').dispatchEvent('input');await p.waitForTimeout(100);
console.log(w,'vista previa:',(await p.locator('#pf-prev').innerText()).replace(/\s+/g,' ').slice(0,420));
await p.screenshot({path:SP+'/pegafaena'+w+'.png',fullPage:true});
await p.click('[data-act="pf-guardar"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'mensaje:',await p.locator('#g-medias').innerText().catch(()=>'?'),'· semana a la vista:',await p.locator('#view-medias .nav .tit').innerText());
console.log(w,'guardado:\n  '+await p.evaluate(()=>window.__mock.data.faena['2026-10-19']).then(res));
await p.screenshot({path:SP+'/pegafaena-despues'+w+'.png',fullPage:true});
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
