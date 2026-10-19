const {chromium}=require('playwright');const SP=process.argv[2];
const P=(c,cam,m)=>({cliente:c,entrega:'2026-10-19',medias:m||10,peso:'',nota:'',origen:'manual',kg:'',camion:cam||'',cuenta:'',cortes:[]});
const data={faena:{},produccion:{},config:{general:{},'log-2026-10-19':{fecha:'2026-10-19',camiones:[{id:'c1',nombre:'Lagui',hora:'03:00',orden:['a']},{id:'c2',nombre:'Ruta 9',hora:'05:00',orden:['b']},{id:'c3',nombre:'Sur',hora:'07:00',orden:['c']}],pedidos:[]}},privado:{clientes:{lista:[]}},
 pedidos:{a:P('ALFA','c1'),b:P('BETA','c2'),c:P('GAMA','c3'),d:P('DELTA','')}};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64').toString('base64');
(async()=>{const b=await chromium.launch();
for(const w of [1280,400]){
const p=await b.newPage({viewport:{width:w,height:900},hasTouch:w<500});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-16T12:00:00-03:00')});
await p.addInitScript(d=>{window.print=()=>{};window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],ia:(n)=>({pedidos:[{cliente:'PEGADO '+n,entrega:'2026-10-19',medias:5,peso:'',cortes:[],nota:'',dudas:[]}],planilla:[]})}},data);
await p.goto('http://127.0.0.1:8765/index.html');await p.clock.runFor(1500);await p.waitForSelector('.dash');
// pegar captura
await p.click('#tab-pedidos');await p.waitForSelector('#fotos',{state:'attached'});
console.log(w,'tip:',await p.locator('.pega-tip').isVisible());
await p.click('[data-act="q-pegar"]');await p.focus('#pegar-txt');
await p.evaluate(b64=>{const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);const dt=new DataTransfer();dt.items.add(new File([u],'image.png',{type:'image/png'}));document.getElementById('pegar-txt').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},png);
await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log(w,'pedidos guardados:',await p.evaluate(()=>Object.values(window.__mock.data.pedidos).map(x=>x.cliente).join(',')),'msg:',await p.evaluate(()=>document.getElementById('view-pedidos').innerText.slice(0,300).replace(/\s+/g,' ')));console.log(w,'tras pegar:',await p.evaluate(()=>[...document.querySelectorAll('#view-pedidos input')].map(i=>i.value).filter(v=>/PEGADO/i.test(v)).join(',')||document.getElementById('view-pedidos').innerText.match(/PEGADO[^\n]*/i)?.[0]||'NO'));
// texto normal sigue pegándose
await p.evaluate(()=>{const dt=new DataTransfer();dt.setData('text/plain','hola');const ev=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});document.body.dispatchEvent(ev);window.__nopd=!ev.defaultPrevented;});
console.log(w,'texto no bloqueado:',await p.evaluate(()=>window.__nopd));
// resumen
await p.click('#tab-logistica');await p.waitForSelector('#view-logistica .nav');
if(!(await p.locator('[data-act="resumen"]').count())){for(let k=0;k<3&&!(await p.locator('[data-act="resumen"]').count());k++){await p.click('[data-act="fl"][data-d="1"]');await p.waitForTimeout(100);}}
await p.click('[data-act="resumen"]');await p.waitForSelector('.res-mover');
const orden=async()=>await p.evaluate(()=>window.__mock.data.config['log-2026-10-19'].camiones.map(c=>c.nombre+'@'+c.hora).join(', '));
const h3=p.locator('.res-mover').nth(2),h1=p.locator('.res-cam[data-cam]').nth(0);
const a=await h3.boundingBox(),t=await h1.boundingBox();
await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(t.x+20,t.y+15,{steps:6});await p.mouse.move(t.x+10,t.y+10,{steps:3});await p.mouse.up();
await p.clock.runFor(500);await p.waitForTimeout(200);
console.log(w,'tras arrastrar:',await orden());
await p.locator('.res-hora').nth(1).fill('04:30');await p.locator('.res-hora').nth(1).dispatchEvent('change');await p.clock.runFor(500);await p.waitForTimeout(200);
console.log(w,'tras hora:',await orden());
await p.focus('.res-mover >> nth=0');await p.keyboard.press('ArrowDown');await p.clock.runFor(300);await p.waitForTimeout(200);console.log(w,'teclado:',await orden());
await p.screenshot({path:SP+'/res'+w+'.png',fullPage:true});
await p.click('[data-act="resumen"]');await p.waitForTimeout(200);
console.log(w,'ver por camión:',(await p.locator('.cam h2').allInnerTexts()).join(', '));
await p.click('[data-act="resumen"]');await p.waitForTimeout(100);await p.emulateMedia({media:'print'});await p.screenshot({path:SP+'/res-print'+w+'.png'});await p.emulateMedia({media:'screen'});
console.log(w,'desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');
const d2=await p.evaluate(()=>window.__mock.data);
const v=await b.newPage({viewport:{width:w,height:900}});await v.clock.install({time:new Date('2026-10-16T12:00:00-03:00')});await v.addInitScript(d=>{window.__mock={data:d,user:null,editores:[]}},d2);
await v.goto('http://127.0.0.1:8765/logistica.html');await v.clock.runFor(1500);await v.waitForTimeout(200);
for(let k=0;k<3&&!(await v.locator('[data-act="resumen"]').count());k++){await v.click('[data-act="fl"][data-d="1"]');await v.waitForTimeout(100);}
await v.click('[data-act="resumen"]');await v.waitForTimeout(100);console.log(w,'link: manijas',await v.locator('.res-mover').count(),'horas editables',await v.locator('.res-hora').count(),'·',(await v.locator('.resumen-dia').innerText()).replace(/\s+/g,' ').slice(0,160));
}
const vd=await b.newPage({viewport:{width:1100,height:900}});const ev=[];vd.on('pageerror',e=>ev.push(e.message));
await vd.addInitScript(()=>{window.__mock={data:{ventas:{}},user:{email:'v@x.com',emailVerified:true},vendedores:{'v@x.com':{nombre:'V'}},foto:n=>'AAAA'}});
await vd.goto('http://127.0.0.1:8765/vendedor.html');await vd.waitForTimeout(800);
const hay=await vd.locator('#adj-fotos').count();
if(hay){await vd.evaluate(b64=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array([1,2])],'image.png',{type:'image/png'}));document.body.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},png);await vd.waitForTimeout(300);}
console.log('vendedor: input',hay,'· fotos tras pegar:',await vd.locator('.mini img').count(),'· errores',ev.join('|')||'ninguno');
await b.close();})();
