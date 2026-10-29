// Logística: "Imprimir x camión" imprime todo el día con cada camión en una hoja aparte.
const {chromium}=require('playwright');const SP=process.argv[2];const F='2026-10-26';const {execSync}=require('child_process');
const P=(c,cam)=>({cliente:c,entrega:F,medias:10,peso:'',nota:'',origen:'manual',kg:'',camion:cam,cuenta:'',cortes:[]});
const cams=[{id:'c1',nombre:'SEMI DOLCI',hora:'00:00',kg:0,orden:['a']},{id:'c2',nombre:'MAXIMO',hora:'02:00',kg:0,orden:['b','c']},{id:'c3',nombre:'LUCAS',hora:'05:00',kg:0,orden:['d']}];
const ped={a:P('DON PEDRO','c1'),b:P('NOVICERD','c2'),c:P('ALICAN','c2'),d:P('MAFER','c3')};
const data={faena:{},produccion:{},privado:{},config:{general:{},['log-'+F]:{fecha:F,camiones:cams,pedidos:Object.keys(ped).map(k=>Object.assign({id:k},ped[k]))}},pedidos:ped};
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1100,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-23T18:00:00-03:00')});
 await p.addInitScript(d=>{window.print=()=>{window.__impreso=(window.__impreso||0)+1;};window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);
 await p.fill('#l-fecha',F);await p.locator('#l-fecha').dispatchEvent('change');await p.waitForTimeout(300);
 await p.click('[data-act="menu"][data-k="log-imp"]');console.log('botón:',await p.locator('[data-act="imprimir-camiones"]').innerText());
 await p.click('[data-act="imprimir-camiones"]');await p.clock.runFor(200);await p.waitForTimeout(100);
 console.log('llamó a imprimir:',await p.evaluate(()=>window.__impreso||0),'· modo por camión:',await p.evaluate(()=>document.getElementById('view-logistica').classList.contains('por-camion')));
 await p.emulateMedia({media:'print'});await p.pdf({path:SP+'/por-camion.pdf',format:'A4',preferCSSPageSize:true});
 const txt=execSync('pdftotext -layout '+SP+'/por-camion.pdf -').toString().split('\f').filter(x=>x.trim());
 console.log('hojas:',txt.length,'→',txt.map(t=>['SEMI DOLCI','MAXIMO','LUCAS'].filter(n=>t.includes(n)).join('+')||'-').join(' | '));
 console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
