// // Menudencias y rendering (/ddjj, pestaña "Menudencias y rendering"): resumen del mes para SENASA, stock del sebo, impresión y celular.
const {chromium}=require('playwright');const SP=process.argv[2];
const TXT=['OK|2026-10-28 15:00',
 'ME|2026-09-02|3|440|DESPOJO DE FAENA|1|9000','ME|2026-09-02|3|502|HIGADO FRESCO|10|500.5','ME|2026-09-03|3|502|HIGADO FRESCO|9|480',
 'ME|2026-09-02|3|603|CORAZON (CONGELADO)|20|700','ME|2026-09-02|3|503|CORAZON|2|40','ME|2026-09-02|3|604|ENTRAÑA (CONGELADA)|5|100',
 'ME|2026-09-02|3|485|Riñon|1|22.3','ME|2026-09-03|3|505|RIÑON|2|40',
 'ME|2026-09-05|6|810|HARINA DE CARNE Y HUESO PORCINA|5|7000','ME|2026-09-20|6|814|SEBO LIQUIDO DE CERDO DE ALTA	ACIDEZ|2|54280',
 'TR|2026-09-02|261639|160|2026-09-01|100|5609','RE|2026-09-02|705|CABEZA|8|45|180|913.04','RE|2026-09-02|611|OREJA (CONGELADO)|2|10|0|100','RE|2026-09-02|425|HUESO CABEZA|1|10|0|300'].join('\n');
(async()=>{const b=await chromium.launch();
for(const w of [1300,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.clock.install({time:new Date('2026-10-28T12:00:00-03:00')});
await p.addInitScript(m=>{window.__mock=m},{user:{email:'ssaavedra@x.com',displayName:'Saavedra',emailVerified:true},rol:'ddjj',sis:{'dj-2026-09':TXT},docs:{'ddjj-2026-08':{men:{stock:{'r|Sebo líquido de alta acidez':{fin:3000}}}}}});
await p.goto('http://127.0.0.1:8765/ddjj.html');await p.clock.runFor(1500);
await p.evaluate(()=>{S.tab='men';cambiarMes('2026-09');});await p.clock.runFor(1500);await p.waitForSelector('.dj-tab');
const tabla=i=>p.evaluate(i=>[...document.querySelectorAll('.dj-tab')[i].querySelectorAll('tbody tr')].map(r=>[...r.cells].map(c=>c.innerText.trim().replace(/\s+/g,' ')).join(' | ')),i);
if(w===1300){
 console.log('menudencias:\n  '+(await tabla(0)).join('\n  '));console.log('rendering:\n  '+(await tabla(1)).join('\n  '));
 await p.evaluate(()=>editarStockM('r|Sebo líquido de alta acidez','fin'));await p.fill('#dlg-v','5000');await p.click('#dlg-ok');await p.clock.runFor(800);
 console.log('después de cargar stock final 5000:\n  '+(await tabla(1)).join('\n  '));
 await p.evaluate(()=>{$('impresion').innerHTML=hojaM();});console.log('hoja:',(await p.innerText('#impresion')).replace(/\s+/g,' ').slice(0,400));
 await p.evaluate(()=>{document.body.classList.add('vista','vista-m');document.querySelector('#impresion').classList.remove('solo-print');});
 await p.locator('#impresion .hoja').screenshot({path:SP+'/p119_hoja.png'});
 await p.evaluate(()=>{document.body.classList.remove('vista','vista-m');document.querySelector('#impresion').classList.add('solo-print');});
}
await p.screenshot({path:SP+'/p119_'+w+'.png',fullPage:true});
const anch=await p.evaluate(()=>document.documentElement.scrollWidth);console.log(w,'desborde:',anch>w?anch:'no','· errores:',errs.length?errs:'ninguno');await p.close();}
await b.close();})();
