// Producción: al escribir en la orden (cuadro grande de texto), la pantalla y el cursor se quedan donde están.
const {chromium}=require('playwright');const SP=process.argv[2];const F='2026-10-27';
const lineas=[];for(let i=0;i<40;i++)lineas.push('CORTE'+i+': RENGLON '+i+' FRESCO EN BINES "CLIENTE '+i+'"','');
const data={faena:{},config:{general:{}},privado:{},pedidos:{},produccion:{}};
(async()=>{const b=await chromium.launch();
for(const [w,h] of [[1366,700],[400,800]]){const p=await b.newPage({viewport:{width:w,height:h}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-23T18:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
 await p.goto('http://127.0.0.1:8765/index.html#produccion');await p.clock.runFor(1500);
 for(let i=0;i<4;i++){ if((await p.locator('#view-produccion .nav .tit').innerText()).includes('27'))break; await p.click('#view-produccion [data-act="fecha"][data-d="1"]');await p.waitForTimeout(150);}
 await p.click('[data-act="pv"][data-v="op"]');await p.waitForTimeout(150);
 const nueva=p.locator('[data-act="op-nueva"]');if(await nueva.count()){await nueva.first().click();await p.waitForTimeout(150);}
 if(!(await p.locator('#p-doc').count())){await p.locator('[data-act="p-editar"]').first().click();await p.waitForTimeout(150);}
 await p.fill('#p-doc',lineas.join('\n'));await p.locator('#p-doc').dispatchEvent('input');await p.clock.runFor(1500);
 // Me paro en el medio (renglón 20), con la pantalla ahí, y escribo.
 const pos=await p.evaluate(()=>{const t=document.getElementById('p-doc');const i=t.value.indexOf('RENGLON 20')+7;t.focus();t.setSelectionRange(i,i);const r=t.getBoundingClientRect();const lh=parseFloat(getComputedStyle(t).lineHeight)||20;window.scrollTo(0,window.scrollY+r.top+lh*40-200);return {i,y:window.scrollY};});
 await p.keyboard.type(' XX');await p.clock.runFor(1500);await p.waitForTimeout(200);
 await p.keyboard.press('Enter');await p.keyboard.type('NUEVO');await p.clock.runFor(1500);await p.waitForTimeout(200);
 const d=await p.evaluate(()=>{const t=document.getElementById('p-doc');return {cursor:t.selectionStart,y:window.scrollY,activo:document.activeElement.id,trozo:t.value.slice(t.selectionStart-20,t.selectionStart)};});
 console.log('=== ',w,'antes: cursor',pos.i,'pantalla',Math.round(pos.y),'· después: cursor',d.cursor,'(esperado',pos.i+9,') pantalla',Math.round(d.y),'· foco',d.activo,'· texto antes del cursor:',JSON.stringify(d.trozo));
 console.log('errores:',errs.join('|')||'ninguno');}
await b.close();})();
