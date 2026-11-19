// "Ver carga" en los ⋯ del camión: totales por corte y unidad (Pedidos y Logística).
const {chromium}=require('playwright');const F='2026-11-20';
const P=(cl,med,cs)=>({cliente:cl,entrega:F,medias:med,peso:'',nota:'',frio:'',origen:'manual',kg:'',camion:'c1',cuenta:'',cortes:cs.map((x,i)=>({k:'k'+i,corte:x[0],texto:x[1]}))});
const ped={a:P('LUCAS',14,[['PECHO','8 CAJAS PECHITO'],['CARRE SIN SOLOMILLO','4 CAJAS']]),b:P('MITRE',26,[['PECHO','9 CAJAS'],['MATAMBRE','99 UND'],['CARRE SIN SOLOMILLO','8 C CARRE']]),c:P('RUTA',0,[['MATAMBRE','20 KG'],['BONDIOLA','TODO']])};
const data={faena:{},privado:{},config:{general:{feriados:[]},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'JOEL PIZARRO',hora:'04:00',orden:['a','b','c']}],pedidos:Object.entries(ped).map(([id,p])=>Object.assign({id},p))}},pedidos:ped,produccion:{}};
(async()=>{const b=await chromium.launch();const errs=[];
for(const [w,tab] of [[1366,'pedidos'],[400,'logistica']]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-19T14:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#'+tab);await p.clock.runFor(2000);await p.waitForTimeout(400);
 if(tab==='logistica'){await p.fill('#l-fecha',F);await p.dispatchEvent('#l-fecha','change');await p.waitForTimeout(400);}
 const k=tab==='pedidos'?'pcam-c1':'cam-c1';
 await p.evaluate(k=>document.querySelector('[data-act="menu"][data-k="'+k+'"]').click(),k);await p.waitForTimeout(200);
 await p.evaluate(()=>document.querySelector('[data-act="ver-carga"]').click());await p.waitForTimeout(300);
 console.log(w,tab,'→',await p.evaluate(()=>document.querySelector('.carga-box')?.innerText.replace(/\n+/g,' | ')));
 await p.screenshot({path:(process.argv[2]||'.')+'/p163-'+w+'.png'});
 const ins=p.locator('.carga-in');await ins.nth(1).fill('+2 cajas');await ins.nth(1).press('Enter');await p.waitForTimeout(300);
 console.log(w,'guardado:',await p.evaluate(()=>JSON.stringify(window.__mock.data.privado.cargas)),'| wa:',await p.evaluate(()=>decodeURIComponent(document.querySelector('.carga-box a.wa').href).includes('→ +2 cajas')));
 await p.evaluate(()=>document.querySelector('.carga-box').click());await p.waitForTimeout(100);const sig=await p.locator('.carga-ov').count();
 await p.click('.carga-cab [data-act="carga-cerrar"]');await p.waitForTimeout(100);console.log(w,'sigue al tocar adentro:',sig,'| cerrado:',await p.locator('.carga-ov').count()===0,'| desborde:',await p.evaluate(()=>document.documentElement.scrollWidth));
 await p.close();}
console.log('errores:',errs);await b.close();})();
