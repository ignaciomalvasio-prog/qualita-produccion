// Sin rubros PECHO MANTA DOBLE (con y sin cuero): al entrar un editor, los pedidos y planillas que los tengan pasan a PECHO.
const {chromium}=require('playwright');const SP=process.argv[2];const F='2026-10-28';
const C=(c,ls)=>({corte:c,lineas:ls.map(t=>({t}))});
const ped={a:{cliente:'DINO RUTA 20',entrega:F,medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'k0',corte:'PECHO MANTA DOBLE',texto:'160KG PECHITO CON MANTA'},{k:'k1',corte:'JAMON',texto:'60KG JAMON'}]},
 b:{cliente:'X',entrega:F,medias:0,peso:'',nota:'',origen:'manual',kg:'',camion:'',cuenta:'',cortes:[{k:'k0',corte:'PECHO MANTA DOBLE CON CUERO',texto:'2 UND PECHO MANTA DOBLE CON CUERO'}]}};
const data={faena:{},privado:{},config:{general:{}},pedidos:ped,produccion:{[F]:{medias:0,mercado:'',estado:'borrador',cortes:[C('PECHO',['1 CAJA PECHO "CHAVARRIA"']),C('PECHO MANTA DOBLE',['160 KG PECHITO CON MANTA "DINO RUTA 20"']),C('PECHO MANTA DOBLE CON CUERO',['2 UND PECHO MANTA DOBLE CON CUERO "X"'])]}}};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1100,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-27T10:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(2500);await p.waitForTimeout(500);
 console.log('pedidos:',await p.evaluate(()=>Object.values(window.__mock.data.pedidos).map(x=>x.cliente+': '+x.cortes.map(c=>c.corte).join(', ')).join(' | ')));
 console.log('planilla:',await p.evaluate(d=>window.__mock.data.produccion[d].cortes.map(c=>c.corte+'('+c.lineas.length+')').join(', '),F));
 await p.click('[data-act="q-nuevo"]');await p.click('[data-act="q-corte"]');console.log('lista de cortes tiene manta doble:',await p.evaluate(()=>[...document.querySelectorAll('select[data-k="corte"] option')].some(o=>/MANTA/.test(o.textContent))));
 console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
