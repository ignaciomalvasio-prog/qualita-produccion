// Logística: el costo del flete ya no se muestra (para ganar espacio); lo cargado sigue guardado en privado/fletes-*.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-08';
const data={faena:{'2026-10-05':{desde:'2026-10-05',stockInicial:0,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-0'+(5+i),faena:[{origen:'X',propios:1,usuarios:0}],clientes:[]}))}},produccion:{},
 config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'fa',nombre:'MAXIMO 1',kg:6000,orden:['pA']}],pedidos:[]}},
 pedidos:{pA:{cliente:'MOLINA',entrega:F,medias:100,peso:'',nota:'',origen:'manual',kg:'',camion:'fa',cuenta:'',cortes:[]}},
 privado:{clientes:{lista:[]},['fletes-'+F]:{camiones:{fa:{modo:'viaje',valor:250000}}}}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-07T12:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForSelector('#view-logistica .nav');
for(let k=0;k<3&&!(await p.locator('.cam').count());k++){await p.click('[data-act="fl"][data-d="1"]');await p.waitForTimeout(100);}
console.log(w,'fila de flete:',await p.locator('[data-flete], .cam-flete').count(),'(esperado 0) · texto "costo del flete":',/costo del flete/i.test(await p.locator('#view-logistica').innerText()),'· guardado sigue:',await p.evaluate(()=>window.__mock.data.privado['fletes-2026-10-08'].camiones.fa.valor));
console.log(w,'desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'· errores',errs.join('|')||'ninguno');}
await b.close();})();
