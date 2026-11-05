// COSTILLA se toma como PECHO; GRASA BUENA/MALA → GRASA; nalga/peceto/cuadril/cuadrada/bola de lomo van en JAMON (no en TAPA DE JAMON): pedidos y planillas que la tengan se pasan a PECHO solos (el texto no cambia).
const {chromium}=require('playwright');const F='2026-11-04';
const C=(c,ls)=>({corte:c,lineas:ls.map(t=>({t}))});
const data={faena:{},privado:{},config:{general:{}},
 pedidos:{a:{cliente:'X',entrega:F,medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'1',corte:'COSTILLA',texto:'100KG COSTILLA'},{k:'2',corte:'BONDIOLA',texto:'10KG'},{k:'3',corte:'TAPA DE JAMON',texto:'50KG NALGA'},{k:'4',corte:'TAPA DE JAMON',texto:'20KG TAPA DE JAMON'},{k:'5',corte:'GRASA BUENA',texto:'2 CAJAS GRASA'}]}},
 produccion:{[F]:{medias:700,mercado:'',estado:'borrador',cortes:[C('PECHO',['1 CAJAS PECHO "A"']),C('GRASA MALA',['1 CANASTO GRASA "B"']),C('GRASA BUENA',['2 CAJAS GRASA "C"']),C('COSTILLA',['100 KG COSTILLA "X"']),C('TAPA DE JAMON',['50 KG NALGA "X"','20 KG TAPA DE JAMON "Y"','10 KG PECETO "Z"'])]}}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1100,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-03T10:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(2000);await p.waitForTimeout(300);
 console.log('pedido:',await p.evaluate(()=>window.__mock.data.pedidos.a.cortes.map(c=>c.corte+'='+c.texto).join(', ')));
 console.log('planilla:',await p.evaluate(F=>window.__mock.data.produccion[F].cortes.map(c=>c.corte+':'+c.lineas.map(l=>l.t).join('+')).join(', '),F));
 console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
