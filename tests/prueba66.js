// Producción: cada renglón con el cliente en una etiqueta del color de la app, los kilos en negrita y después el detalle.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-19';
const C=(corte,ls)=>({corte,lineas:ls.map(t=>typeof t==='string'?{t,p:'x'}:t)});
const data={faena:{},config:{general:{}},privado:{clientes:{lista:[]}},pedidos:{},
 produccion:{[F]:{medias:750,mercado:'',estado:'borrador',cortes:[
  C('JAMON',['15 CAJAS PIERNA “URCA”','100 KG JAMON 4 MUSC (COD 341) “DINO RUTA 20”',{t:'20 KG JAMON 4 MUSC (COD 341) “DINO 60 CUADRAS”',p:'x',f:'CONGELADO'}]),
  C('BONDIOLA',['4 CAJAS BONDIOLA (COD 101) “QUALITA EXPRESS”','2 CANASTOS BONDIOLA “ROVER”']),
  C('PECHO',['240 KG PECHITO CON MANTA (COD 211) “DINO RUTA 20”','RESTO: 30KG PECHO SUELTO']),
  C('RECORTE',['TODO “CICLO 3”'])]}}};
(async()=>{const b=await chromium.launch();
for(const [w,ed] of [[1100,0],[400,0],[1100,1]]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-19T10:00:00-03:00')});
await p.addInitScript(([d,ed])=>{window.print=()=>{};window.__mock={data:JSON.parse(JSON.stringify(d)),user:ed?{email:'yo@x.com'}:null,editores:['yo@x.com']}},[data,ed]);
await p.goto('http://127.0.0.1:8765/'+(ed?'index.html#produccion':'produccion.html'));await p.clock.runFor(1500);await p.waitForSelector('.hoja-corte');
console.log(w,ed?'editor':'link','renglones:',await p.$$eval('.hoja-corte li',x=>x.map(e=>'['+(e.querySelector('.h-cli')||{}).textContent+'] '+(e.querySelector('.h-cant')||{textContent:'-'}).textContent+' / '+e.querySelector('.h-txt').textContent).join(' | ')));
await (await p.$('.hoja')).screenshot({path:SP+'/hojaA'+w+(ed?'ed':'')+'.png'});
if(!ed&&w===1100){await p.emulateMedia({media:'print'});await (await p.$('.hoja')).screenshot({path:SP+'/hojaA-print.png'});await p.emulateMedia({media:'screen'});}
if(ed){const t=await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Copiar como texto/.test(x.textContent));return !!b;});console.log('copiar como texto sigue:',t);}
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
