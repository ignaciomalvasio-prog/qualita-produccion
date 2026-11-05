// Clientes: reporte "Kilos por sucursal" (DINO) sumando las entregas de la semana.
const {chromium}=require('playwright');const SP=process.argv[2];
const P=(c,f,medias,cortes,kg)=>({cliente:c,entrega:f,medias:medias,peso:'',nota:'',origen:'manual',kg:kg||'',camion:'',cuenta:'',cortes:(cortes||[]).map(t=>({corte:'JAMON',texto:t}))});
const ped={a:P('DINO ROD DEL BUSTO','2026-10-26',0,['100KG JAMON 4 MUSC (COD 341)','5 CAJAS PECHITO']),b:P('DINO ROD DEL BUSTO','2026-10-29',0,['80 KG JAMON']),
 c:P('DINO ALTA GRACIA','2026-10-26',2,[]),d:P('DINO ALTA GRACIA','2026-10-29',0,[],350),e:P('DINO RUTA 20','2026-10-29',0,['10 UND BONDIOLA']),
 f:P('HONORIO','2026-10-26',7,[]),g:P('DINO RUTA 20','2026-11-02',0,['999 KG JAMON'])};
const data={faena:{},produccion:{},privado:{},config:{general:{}},pedidos:ped};
(async()=>{const b=await chromium.launch();const errs=[];
 for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-27T10:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#clientes');await p.clock.runFor(1500);
 const t=()=>p.locator('.rep-suc').innerText();
 console.log('==',w,'\n'+(await t()));
 await p.click('[data-act="rep-copiar"]');console.log('copiado:\n'+await p.evaluate(()=>window.__mock.copiado));
 await p.click('[data-act="rep-excel"]');console.log('excel:',JSON.stringify(await p.evaluate(()=>window.__mock.excel)));
 await p.click('[data-act="rep-sem"][data-d="7"]');await p.waitForTimeout(150);console.log('semana sig:',(await t()).split('\n').slice(0,6).join(' | '));
 await p.fill('#rep-cli','HONO');await p.waitForTimeout(150);console.log('otro cliente:',(await t()).split('\n').slice(0,4).join(' | '));
 if(w===400){await p.screenshot({path:SP+'/rep.png',fullPage:false});}
 console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
 console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
