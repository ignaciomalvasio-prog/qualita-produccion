// Logística: buscadores de cliente y de camión (como en Pedidos); "Ver" lleva al día y marca el cliente o el camión. También en el link para compartir (solo lo que tiene camión).
const {chromium}=require('playwright');const SP=process.argv[2];
const P=(id,c,cam,f,cta)=>({id,cliente:c,entrega:f||'2026-10-14',medias:10,peso:'',nota:'',origen:'manual',kg:cam?470:470,camion:cam||'',cuenta:cta||'',cortes:[]});
const cams=[{id:'c1',nombre:'Lagui',hora:'03:00',nota:'',kg:0,orden:['b','a']},{id:'c2',nombre:'Moreira',nota:'',kg:0,orden:['d']},{id:'c3',nombre:'Lagui vacío',nota:'',kg:0,orden:[]}];
const cams2=[{id:'k1',nombre:'MAXIMO (PRIMER VIAJE)',hora:'02:00',nota:'',kg:6000,orden:['h']}];
const L1=[P('a','ALFA','c1'),P('b','BETA','c1'),P('c','GAMA'),P('d','DELTA','c2')], L2=[P('h','NOVICERD','k1','2026-10-16','21337'),P('i','ALFA OTRO',null,'2026-10-16')];
const ped={};[...L1,...L2].forEach(p=>{const q=Object.assign({},p);delete q.id;ped[p.id]=q;});
const data={faena:{},produccion:{},config:{general:{},'log-2026-10-14':{fecha:'2026-10-14',camiones:cams,pedidos:L1},'log-2026-10-16':{fecha:'2026-10-16',camiones:cams2,pedidos:L2}},privado:{},pedidos:ped};
(async()=>{const b=await chromium.launch();
for(const [w,url,user] of [[1100,'index.html#logistica','yo@x.com'],[400,'index.html#logistica','yo@x.com'],[400,'logistica.html',null]]){
const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-13T18:20:00-03:00')});
await p.addInitScript(([d,u])=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:u?{email:u}:null,editores:['yo@x.com']}},[data,user]);
await p.goto('http://127.0.0.1:8765/'+url);await p.clock.runFor(1500);await p.waitForSelector('#lg-buscar');
const res=async()=>(await p.locator('#view-logistica .busq, #view-logistica .sin').first().innerText()).replace(/\s+/g,' ');
console.log('=== ',w,url,user||'sin cuenta');
await p.locator('#lg-buscar').pressSequentially('alfa',{delay:30});await p.waitForTimeout(150);
console.log('cliente "alfa":',await res(),'· foco:',await p.evaluate(()=>document.activeElement.id));
await p.fill('#lg-buscar','21337');await p.locator('#lg-buscar').dispatchEvent('input');console.log('cuenta 21337:',await res());
await p.click('[data-act="lbusq-ver"]');await p.waitForTimeout(300);
console.log('ver cliente → día:',await p.locator('#view-logistica .nav .tit').innerText(),'· marcado:',await p.locator('.log-ped.destello strong').innerText().catch(()=>'(ninguno)'));
await p.locator('#lg-cam-buscar').pressSequentially('lag',{delay:30});await p.waitForTimeout(150);console.log('camión "lag":',await res());
if(w===400)await p.screenshot({path:SP+'/lgbus'+(user?'ed':'pub')+'.png',fullPage:true});else await p.screenshot({path:SP+'/lgbus1100.png'});
await p.click('[data-act="lbusq-ver"]');await p.waitForTimeout(300);
console.log('ver camión → día:',await p.locator('#view-logistica .nav .tit').innerText(),'· marcado:',await p.locator('section.cam.destello h2').innerText().catch(()=>'(ninguno)'));
await p.fill('#lg-cam-buscar','zzz');await p.locator('#lg-cam-buscar').dispatchEvent('input');console.log('nada:',await res());
await p.click('[data-act="lbusq-limpiar"]');await p.waitForTimeout(100);console.log('limpiar → camiones:',await p.locator('section.cam').count());
console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');}
await b.close();})();
