// Compu (1366 px): ‹ DÍA › juntos a la izquierda y los botones a la derecha; tocando el día se abre el calendario.
const {chromium}=require('playwright');const SP=process.argv[2];
const L='2026-10-26';const dia=(cl)=>({propios:600,usuarios:0,clientes:cl});
const sem={id:L,desde:L,dias:[dia([]),dia([{cliente:'JMC',cant:30}]),dia([{cliente:'MONTE',cant:3}]),dia([]),dia([])]};
const ped=(id,cli,f,cam)=>({id,cliente:cli,entrega:f,camion:cam,items:[{corte:'PECHO',cant:20,unidad:'kg'}]});
const data={faena:{[L]:sem},produccion:{},privado:{},config:{general:{}},pedidos:{a:ped('a','JMC','2026-10-27','SEMI'),b:ped('b','DIGAR','2026-10-27','LAGUI')}};
(async()=>{const b=await chromium.launch();const errs=[];
 const p=await b.newPage({viewport:{width:1366,height:700},deviceScaleFactor:2});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-27T10:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],ia:{}}},data);
 await p.goto('http://127.0.0.1:8765/index.html');await p.clock.runFor(1500);
 for(const t of ['logistica','pedidos','medias','produccion']){
  await p.click('[data-tab="'+t+'"]:visible');await p.waitForTimeout(300);
  if(t==='medias'){const m=p.locator('[data-act="m-dia"]');if(await m.count())await m.click();await p.waitForTimeout(200);}
  const v='#view-'+t;
  const r=await p.evaluate(v=>{const n=document.querySelector(v+' .nav.armada');if(!n)return 'sin nav';const q=s=>n.querySelector(s).getBoundingClientRect();
   const a=q('.step'),tt=q('.tit'),z=n.querySelectorAll('.step')[1].getBoundingClientRect(),i=q('input[type=date]');
   return 'misma fila: '+(Math.abs(a.top-tt.top)<30&&Math.abs(z.top-tt.top)<30)+' · ‹ a la izq: '+(a.right<=tt.left+1)+' · › a la der: '+(z.left>=tt.right-1)+' · fecha encima del día: '+(Math.abs(i.left-tt.left)<2&&getComputedStyle(n.querySelector('input[type=date]')).opacity==='0');},v);
  console.log(t+':',r,'· desborde:',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
  await p.screenshot({path:SP+'/d118-'+t+'.png',clip:{x:0,y:await p.evaluate(v=>document.querySelector(v+' .nav.armada').getBoundingClientRect().top+scrollY-10,v),width:1366,height:80}});
 }
 // tocar el día y elegir otra fecha
 await p.click('[data-tab="logistica"]:visible');await p.waitForTimeout(300);
 await p.locator('#view-logistica .nav input[type=date]').fill('2026-10-28');await p.waitForTimeout(300);
 console.log('después de elegir fecha:',await p.locator('#view-logistica .nav .tit').innerText());
 console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
