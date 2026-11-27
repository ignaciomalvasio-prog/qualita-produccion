// Centro de desposte › DDJJ › Rendering (pedido de Sabi 18/11): igual a chacinados, solo lo producido (renglones ME de tipo 6), Establecimiento 4886.
const {chromium}=require('playwright');
const TXT=['OK|2026-11-18 07:00','TR|2026-11-17|261850|160|2026-11-16|320|25600','RE|2026-11-17|101|BONDIOLA|1|60|500|1300',
 'ME|2026-11-17|6|900|HARINA DE CARNE Y HUESO PORCINA|0|1200','ME|2026-11-17|6|901|SEBO PORCINO|0|350.5','ME|2026-11-17|6|905|PRODUCTO RARO|0|10',
 'ME|2026-11-17|3|431|HIGADO|0|80','ME|2026-11-16|6|900|HARINA DE CARNE Y HUESO PORCINA|0|900'].join('\n');
(async()=>{const b=await chromium.launch();let mal=0;const ok=(c,m)=>{console.log((c?'OK  ':'MAL ')+m);if(!c)mal++;};
for(const w of [1300,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-11-18T08:00:00-03:00')});
 await p.addInitScript(m=>{window.__mock=m},{user:{email:'s@x.com',displayName:'Sabi',emailVerified:true},rol:'ddjj',sis:{'dj-2026-11':TXT},docs:{}});
 await p.goto('http://127.0.0.1:8765/ddjj.html');await p.clock.runFor(1500);
 await p.click('#nav a[data-t="rd"]');await p.waitForTimeout(400);
 const t=await p.evaluate(()=>document.getElementById('main').innerText.replace(/\s+/g,' '));
 if(w===1300){console.log(t.slice(0,600));
  ok(/Rendering · martes, 17 de noviembre/i.test(t)||/Rendering · .*17/.test(t),'abre el último día con producción (17/11)');
  ok(/HARINA DE CARNE Y HUESO PORCINA QUALITA 1\.200,00/.test(t)&&/SEBO PORCINO QUALITA 350,50/.test(t),'harina y sebo con sus kg');
  ok(/Total 1\.550,50 kg/.test(t),'total 1.550,50 kg (sin el producto que no se reconoce ni las menudencias)');
  ok(/no se reconocen/.test(t)&&/905 · PRODUCTO RARO/.test(t),'avisa el producto que no se reconoce');
  // asignarlo para siempre a harina
  await p.selectOption('.dj-nuevos select','L:HARINA DE CARNE Y HUESO PORCINA');await p.waitForTimeout(200);await p.click('#mv-siempre');await p.waitForTimeout(400);
  const t2=await p.evaluate(()=>document.getElementById('main').innerText.replace(/\s+/g,' '));
  ok(/HARINA DE CARNE Y HUESO PORCINA QUALITA 1\.210,00/.test(t2)&&/Total 1\.560,50 kg/.test(t2),'asignado: suma a harina');
  ok(JSON.stringify(await p.evaluate(()=>window.__mock.docs['ddjj-equiv'].rd.lineas[0].arts))==='[905]','queda guardado en equivalencias de rendering');
  // corregir destino
  await p.locator('tr:has-text("HARINA") td.ed').nth(2).click();await p.fill('#dlg-v','VENTA');await p.click('#dlg-ok');await p.waitForTimeout(300);
  const hoja=await p.evaluate(()=>hojaRd(S.fechaRd));
  ok(/Km. 745 · Colonia Caroya/.test(hoja)&&/Establecimiento N.º Oficial 4886/.test(hoja)&&/PRODUCCIÓN RENDERING FRIGORIFICO QUALITA S\.A\./.test(hoja)&&/DECLARACIÓN JURADA/.test(hoja),'hoja: encabezado con establecimiento 4886');
  ok(/HARINA DE CARNE Y HUESO PORCINA<\/td><td>QUALITA<\/td><td class=\"r\" style=\"text-align:center\">1\.210,00<\/td><td>VENTA/.test(hoja),'hoja: renglón con kg y destino corregido');
  ok(/Fecha:<\/b> 17\.11\.2026/.test(hoja)&&/N.º de Lote:<\/b> 171126/.test(hoja),'hoja: fecha y lote');
  // Excel del día y del mes (el .xlsx va sin comprimir: se lee el XML)
  await p.evaluate(()=>{window.__auto={hecho:true};window.__autoOut=[];});
  await p.click('text=Excel del día');await p.click('text=Excel del mes');
  const xl=await p.evaluate(()=>window.__autoOut);const d1=Buffer.from(xl[0].b64,'base64').toString('utf8'),d2=Buffer.from(xl[1].b64,'base64').toString('utf8');
  ok(xl[0].nombre==='DDJJ rendering 17-11-2026.xlsx'&&/HARINA DE CARNE Y HUESO PORCINA/.test(d1)&&/<v>1210<\/v>/.test(d1)&&/Km. 745/.test(d1)&&/Oficial 4886/.test(d1),'Excel del día: '+xl[0].nombre);
  ok(/DDJJ rendering Noviembre 2026\.xlsx/i.test(xl[1].nombre)&&/name="17-11"/.test(d2)&&/name="16-11"/.test(d2),'Excel del mes: una hoja por día ('+xl[1].nombre+')');
  await p.evaluate(()=>{delete window.__auto;});
  // equivalencias
  await p.click('#nav a[data-t="equiv"]');await p.waitForTimeout(300);
  ok(/Equivalencias de rendering/.test(await p.evaluate(()=>document.getElementById('main').innerText)),'equivalencias de rendering en la pestaña Equivalencias');
  // chacinados sigue igual
  await p.click('#nav a[data-t="c3"]');await p.waitForTimeout(300);
  ok(/chacinados/i.test(await p.evaluate(()=>document.getElementById('main').innerText)),'chacinados sigue funcionando');}
 ok(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=0,w+' sin desborde');ok(!errs.length,w+' errores: '+(errs.join('|')||'ninguno'));await p.close();}
await b.close();console.log(mal?'FALLARON '+mal:'todo bien');process.exit(mal?1:0);})();
