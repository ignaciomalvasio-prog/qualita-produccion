const {chromium}=require('playwright');const SP=process.argv[2];
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-16T12:00:00-03:00')});
await p.addInitScript(()=>{window.__mock={data:{faena:{},produccion:{},config:{general:{}},pedidos:{},privado:{clientes:{lista:[]}}},user:{email:'yo@x.com'},editores:['yo@x.com'],ia:(t,x)=>({pedidos:[{cliente:'TEXTO '+String(x).slice(0,4),entrega:'2026-10-20',medias:5,peso:'',cortes:[],nota:'',dudas:[]},{cliente:'OTRO',entrega:'2026-10-22',medias:3,peso:'',cortes:[],nota:'',dudas:[]}],planilla:[]})}});
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForSelector('[data-act="q-pegar"]');
await p.click('[data-act="q-pegar"]');await p.fill('#pegar-txt','hola pedido para el martes');await p.fill('#pegar-dia','2026-10-21');
await p.screenshot({path:SP+'/pegardia'+w+'.png',fullPage:true});
await p.click('[data-act="q-leer-texto"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'con día:',await p.evaluate(()=>Object.values(window.__mock.data.pedidos).map(x=>x.cliente+'@'+x.entrega).join(', ')),'· campo vacío al reabrir:');
await p.click('[data-act="q-pegar"]');console.log(w,'  día al reabrir:',JSON.stringify(await p.inputValue('#pegar-dia')));
await p.fill('#pegar-txt','sin dia');await p.click('[data-act="q-leer-texto"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'sin día:',await p.evaluate(()=>Object.values(window.__mock.data.pedidos).map(x=>x.cliente+'@'+x.entrega).join(', ')),'· desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores',errs.join('|')||'ninguno');}
await b.close();})();
