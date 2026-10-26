// Producción: las achuras/frescos de FAENA (hígado, patas, lengua, chinchulín, riñón, rabo, cabeza, orejas…) van en una hoja aparte "FAENA".
const {chromium}=require('playwright');const SP=process.argv[2];const F='2026-10-28';
const C=(c,ls)=>({corte:c,lineas:ls.map(t=>({t}))});
const data={faena:{},privado:{},config:{general:{}},pedidos:{},produccion:{[F]:{medias:750,mercado:'',estado:'borrador',cortes:[C('JAMON',['40 KG JAMON "DINO RUTA 20"']),C('HIGADO',['1000 KG HIGADO "ALICAN"']),C('MENUDENCIAS',['20 KG CHINCHULIN FRESCO "ROSSOTI"']),C('HUESITOS',['1 CAJA HUESOS "LEONE"']),C('LENGUA',['10 KG LENGUA "X"'])]}}};
(async()=>{const b=await chromium.launch();const errs=[];
 for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-26T17:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#produccion');await p.clock.runFor(1500);
 await p.fill('#p-fecha',F);await p.locator('#p-fecha').dispatchEvent('change');await p.waitForTimeout(300);
 const hojas=p.locator('#view-produccion .hoja');
 for(let i=0;i<await hojas.count();i++){const x=hojas.nth(i);console.log(w,'hoja',i,':',(await x.locator('h2').innerText()),'→',(await x.locator('.hoja-nom h3').allInnerTexts()).join(', '),'· botones:',(await x.locator('.hoja-acc .btn').allInnerTexts()).join(' / '));}
 console.log(w,'texto faena:',JSON.stringify(await p.inputValue('#txt-faena')));
 await p.locator('#faena [data-act="wa-pdf"]').click();await p.waitForTimeout(2500);console.log(w,'pdf:',await p.evaluate(()=>window.__mock.ultimoPDF&&window.__mock.ultimoPDF.nombre));
 if(w===400)await p.screenshot({path:SP+'/faena.png',fullPage:true});
 console.log(w,'desborde:',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await p.close();}
 console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
