// Feriados: lunes 9 y martes 10/11. Lo del miércoles 11 se deja listo el viernes 6 (cortes en esa planilla); los feriados siguen apareciendo en las listas.
const {chromium}=require('playwright');const W='2026-11-11';
const ped={a:{cliente:'ZANOTTI',entrega:W,medias:10,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'1',corte:'PECHO',texto:'100KG'},{k:'2',corte:'BONDIOLA',texto:'50KG'}]},
 b:{cliente:'JUEVES',entrega:'2026-11-12',medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'1',corte:'PECHO',texto:'10KG'}]}};
const data={faena:{'2026-11-09':{desde:'2026-11-09',stockInicial:null,dias:[0,1,2,3,4].map(i=>({fecha:'2026-11-'+String(9+i).padStart(2,'0'),faena:[{origen:'',propios:0,usuarios:0}],clientes:i===1?[{cliente:'ZANOTTI',cant:5,pedido:'a',nota:''}]:[]}))}},privado:{},config:{general:{}},pedidos:ped,produccion:{[W]:{fecha:W,medias:750,mercado:'',estado:'borrador',cortes:[{corte:'PECHO',lineas:[{t:'100 KG "ZANOTTI"',p:'a',ck:'1'},{t:'20 KG A MANO'}]}]}}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-04T14:30:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(2000);await p.waitForTimeout(300);
 const prod=()=>p.evaluate(()=>Object.keys(window.__mock.data.produccion).sort().map(k=>k+': '+window.__mock.data.produccion[k].cortes.map(c=>c.corte+'['+c.lineas.map(l=>l.t).join(' + ')+']').join(' ')).join(' | '));
 console.log('movido:',await prod());
 console.log('cargar para:',await p.evaluate(()=>[...document.querySelectorAll('.carga button')].map(b=>b.textContent).filter(t=>/\d+\/11/.test(t)).join(', ')));
 await p.evaluate(()=>{const i=document.getElementById('p-pd')||document.querySelector('.nav-ped input[type=date]');i.value='2026-11-11';i.dispatchEvent(new Event('change',{bubbles:true}));});await p.waitForTimeout(300);
 await p.evaluate(()=>document.querySelector('.ped[data-ped="a"] [data-act="ped-abrir"]').click());await p.waitForTimeout(200);
 await p.click('[data-act="c-sumar"][data-id="a"][data-k="2"]');await p.clock.runFor(800);await p.waitForTimeout(300);
 console.log('sumar bondiola:',await prod());
 console.log('faena:',await p.evaluate(()=>Object.keys(window.__mock.data.faena).sort().map(k=>k+': '+window.__mock.data.faena[k].dias.map((d,i)=>i+'='+d.clientes.map(r=>r.cliente+' '+r.cant).join('+')).join(' ')).join(' | ')));
 await p.click('[data-act="mf-abrir"][data-id="a"]');await p.waitForTimeout(200);
 console.log('opciones:',await p.evaluate(()=>document.querySelector('.mf-menu').innerText.replace(/\s+/g,' ')));
 console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
