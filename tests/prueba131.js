// Medias: las de usuario (ej. DON PEDRO en la faena con usuarios) no cuentan como clientes; arriba en verde, abajo no aparecen.
const {chromium}=require('playwright');const L='2026-10-26';
const dia=(f,cl)=>({faena:f,clientes:cl});
const vie=dia([{origen:'CANDELARIA',propios:160},{origen:'EL CEBIL',propios:120},{origen:'AG',propios:120},{origen:'DON PEDRO',propios:0,usuarios:160}],[{cliente:'CABAÑAS DEL SUR',cant:25},{cliente:'EMERIC',cant:5},{cliente:'DON PEDRO',cant:160}]);
const sem={id:L,desde:L,dias:[dia([],[]),dia([],[]),dia([],[]),dia([],[]),vie]};
(async()=>{const b=await chromium.launch();const errs=[];const p=await b.newPage({viewport:{width:1366,height:900}});p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-30T16:00:00-03:00')});
await p.addInitScript(d=>{window.__mock={data:d,user:{email:'yo@x.com'},editores:['yo@x.com']}},{faena:{[L]:sem},produccion:{},privado:{},config:{general:{}},pedidos:{}});
await p.goto('http://127.0.0.1:8765/index.html#medias');await p.clock.runFor(1500);await p.waitForTimeout(300);
const v=p.locator('section.dia').nth(4);
console.log('verde arriba:',await v.locator('tr.usu').innerText().then(t=>t.replace(/\s+/g,' ')),'· color:',await v.locator('tr.usu td').first().evaluate(e=>getComputedStyle(e).backgroundColor));
console.log('clientes abajo:',(await v.innerText()).split('\n').filter(l=>/CABAÑAS|EMERIC|DON PEDRO|TOTAL CLIENTES|A DESPOSTE/.test(l)).join(' | '));
await p.locator('[data-act="m-dia"]').click().catch(()=>{});await p.waitForTimeout(200);await p.click('[data-act="fm-ir"][data-f="2026-10-30"]').catch(()=>{});await p.waitForTimeout(200);
console.log('día viernes:',(await p.locator('.cl-dia').innerText().catch(()=>'-')).replace(/\s+/g,' '));
console.log('errores:',errs.join('|')||'ninguno');await b.close();})();
