// Pedidos: un renglón en BINES se puede pasar a UNIDADES (o al revés) con el selector de unidad, y la planilla de producción lo toma.
const {chromium}=require('playwright');const SP=process.argv[2];const F='2026-10-29';
const data={faena:{},privado:{clientes:{lista:[]}},config:{general:{}},
 pedidos:{a:{cliente:'GRION',entrega:F,medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',frio:'FRESCO',cortes:[{k:'k0',corte:'JAMON',texto:'100 BINES JAMON CON HUESO SIN CUERO FRESCO'}]}},
 produccion:{[F]:{medias:0,mercado:'',estado:'borrador',cortes:[{corte:'JAMON',lineas:[{t:'100 BINES JAMON CON HUESO SIN CUERO FRESCO “GRION”',p:'a',ck:'k0',f:'FRESCO'}]}]}}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1280,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-27T18:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);
 await p.click('[data-act="carga-dia"][data-v="'+F+'"]');await p.waitForTimeout(200);
 await p.locator('.ped',{hasText:'GRION'}).locator('[data-act="ped-abrir"] .nom').click();await p.waitForTimeout(200);
 const sel=p.locator('select[data-uni="a"]');console.log('unidad que muestra:',await sel.inputValue());
 await sel.selectOption('und');await p.clock.runFor(1500);await p.waitForTimeout(300);
 console.log('pedido:',await p.evaluate(()=>window.__mock.data.pedidos.a.cortes[0].texto));
 console.log('producción:',await p.evaluate(d=>window.__mock.data.produccion[d].cortes.map(c=>c.lineas.map(l=>l.t).join(' | ')).join(' / '),F));
 console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
