// Vendedores pausados: sin filtro de vendedor, sin recuadro "Pedidos de vendedores", sin aviso en Inicio ni marca en el pedido; el portal avisa que está pausado.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-21';
const data={faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:null,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[{origen:'X',propios:100,usuarios:0}],clientes:[]}))}},produccion:{},privado:{clientes:{lista:[]}},config:{general:{}},
 ventas:{v1:{vendedor:'juan@x.com',nombre:'Juan',cliente:'GRION',entrega:F,medias:2,cortes:[],estado:'pendiente'}},
 pedidos:{a:{cliente:'ROVER',entrega:F,medias:4,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[],vendedor:'juan@x.com',vendedorNombre:'Juan'},b:{cliente:'GRION',entrega:F,medias:2,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[]}}};
(async()=>{const b=await chromium.launch();
for(const w of [1280,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-20T13:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#inicio');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'inicio menciona vendedor:',/vendedor/i.test(await p.locator('#view-inicio').innerText()));
await p.click('#tab-pedidos');await p.waitForTimeout(200);await p.waitForSelector('#view-pedidos .ped');
const t=await p.locator('#view-pedidos').innerText();
console.log(w,'pedidos: menciona vendedor',/vendedor/i.test(t),'· recuadro ventas',await p.locator('#ventas').count(),'· pedidos a la vista',await p.locator('#view-pedidos .ped').count(),'(esperado 2)');
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
const q=await b.newPage({viewport:{width:400,height:800}});
await q.addInitScript(()=>{window.__mock={data:{vendedores:{'juan@x.com':{nombre:'Juan'}},ventas:{}},user:{email:'juan@x.com'},vendedores:['juan@x.com']}});
await q.goto('http://127.0.0.1:8765/vendedor.html');await q.waitForTimeout(800);
console.log('portal:',(await q.locator('#app').innerText()).replace(/\s+/g,' ').slice(0,90));
await b.close();})();
