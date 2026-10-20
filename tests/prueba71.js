// Rendering: pegar la captura del reporte "Resumen de Insumos" del sistema y que quede el real del día.
const {chromium}=require('playwright');const SP=process.argv[2];
const dias=[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[{origen:'X',propios:660,usuarios:20}],clientes:[]}));
const data={faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:0,dias}},produccion:{},config:{general:{}},pedidos:{},privado:{clientes:{lista:[]}}};
const PROD={es_reporte:true,reporte:'produccion',desde:'2026-10-19',hasta:'2026-10-19',tipo:'Rendering',total_kilos:6000,dudas:[],articulos:[{codigo:810,nombre:'HARINA DE CARNE Y HUESO POR',unidades:5,kilos:6000}]};
const REP={es_reporte:true,reporte:'insumos',desde:'2026-10-19',hasta:'2026-10-19',tipo:'Rendering',total_kilos:25751.46,dudas:[],articulos:[
 {codigo:417,nombre:'CUERO "CH"',unidades:87,kilos:2158.96},{codigo:420,nombre:'HUESO',unidades:8,kilos:3900},{codigo:425,nombre:'HUESO CABEZA',unidades:3,kilos:1170},
 {codigo:430,nombre:'DESPOJO DE DESPOSTADA',unidades:12,kilos:2571},{codigo:434,nombre:'HUESO',unidades:2,kilos:3631.2},{codigo:440,nombre:'DESPOJO DE FAENA',unidades:1,kilos:6720},
 {codigo:443,nombre:'DESPOJO',unidades:2,kilos:2584.8},{codigo:472,nombre:'GRASA EN RAMA',unidades:9,kilos:3015.5}]};
(async()=>{const b=await chromium.launch();
for(const w of [1280,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-20T09:40:00-03:00')});
await p.addInitScript(([d,r,q])=>{window.print=()=>{};window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],iaRep:(n)=>n==='varios.png'?Object.assign({},r,{hasta:'2026-10-20'}):n==='prod.png'?q:r}},[data,REP,PROD]);
await p.goto('http://127.0.0.1:8765/index.html#rendering');await p.clock.runFor(1500);await p.waitForSelector('.rend-hero');
const pegar=async(nom)=>{await p.evaluate(nom=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array([1,2,3])],nom,{type:'image/png'}));document.body.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},nom);await p.clock.runFor(800);await p.waitForTimeout(200);};
await pegar('varios.png');console.log(w,'varios días:',await p.locator('#g-rend').innerText());
await pegar('image.png');
console.log(w,'guardado:',await p.evaluate(()=>JSON.stringify(window.__mock.data.config['rend-2026-10-19'].v)));
console.log(w,'aviso:',await p.locator('#g-rend').innerText());
await pegar('prod.png');console.log(w,'prod:',await p.locator('#g-rend').innerText(),'·',await p.evaluate(()=>JSON.stringify(window.__mock.data.config['rend-2026-10-19'].v)));
console.log(w,'hero:',(await p.locator('.rend-hero').innerText()).replace(/\s+/g,' '));
console.log(w,'detalle:',(await p.locator('.rend-det summary').allInnerTexts()).join(' | '));
await p.screenshot({path:SP+'/rend-rep'+w+'.png',fullPage:true});
console.log(w,'desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');}
await b.close();})();
