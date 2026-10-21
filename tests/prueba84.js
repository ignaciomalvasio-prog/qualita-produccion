// Logística: la nota se escribe ahí mismo (sin Editar). Con nota: recuadro amarillo editable; sin nota: "+ Nota". Se guarda y se republica. El link para compartir solo la muestra.
const {chromium}=require('playwright');const SP=process.argv[2];
const F='2026-10-14';
const P=(id,c,nota)=>({id,cliente:c,entrega:F,medias:10,peso:'',nota:nota||'',origen:'manual',kg:470,camion:'c1',cuenta:'',cortes:[]});
const L=[P('a','LUCAS V','ENCABEZADO DEL MENSAJE: CARNES LA GANADERA'),P('b','MITRE')];
const ped={};L.forEach(p=>{const q=Object.assign({},p);delete q.id;ped[p.id]=q;});
const data={faena:{'2026-10-12':{desde:'2026-10-12',stockInicial:0,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(12+i),faena:[],clientes:[]}))}},produccion:{},config:{general:{},['log-'+F]:{fecha:F,camiones:[{id:'c1',nombre:'Lagui',hora:'03:00',nota:'',kg:0,orden:['a','b']}],pedidos:L}},privado:{},pedidos:ped};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-13T18:20:00-03:00')});
await p.addInitScript(d=>{window.print=()=>{};window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com']}},data);
await p.goto('http://127.0.0.1:8765/index.html#logistica');await p.clock.runFor(1500);await p.waitForSelector('#view-logistica .nav');for(let k=0;k<3&&!(await p.locator('.log-ped').count());k++){await p.click('[data-act="fl"][data-d="1"]');await p.waitForTimeout(100);}
const notas=()=>p.evaluate(()=>{const m=window.__mock.data;return 'pedido: '+['a','b'].map(k=>m.pedidos[k].nota||'—').join(' | ')+' · publicado: '+m.config['log-2026-10-14'].pedidos.map(x=>x.nota||'—').join(' | ');});
console.log('=== ',w,'editables:',await p.locator('textarea[data-nota-ped]').count(),'· botón +Nota:',await p.locator('[data-act="nota-abrir"]').count());
await p.screenshot({path:SP+'/nota-antes'+w+'.png',fullPage:true});
const ta=p.locator('textarea[data-nota-ped="a"]');await ta.fill('Bajar por el portón de atrás');await ta.press('Enter');await p.clock.runFor(1500);await p.waitForTimeout(200);
console.log('cambiada:',await notas());
await p.click('[data-act="nota-abrir"][data-id="b"]');await p.waitForTimeout(100);console.log('foco en nota nueva:',await p.evaluate(()=>document.activeElement.dataset.notaPed));
await p.keyboard.type('Llamar antes');await p.locator('textarea[data-nota-ped="b"]').blur();await p.clock.runFor(1500);await p.waitForTimeout(200);
console.log('nueva:',await notas());
await p.locator('textarea[data-nota-ped="a"]').fill('');await p.locator('textarea[data-nota-ped="a"]').blur();await p.clock.runFor(1500);await p.waitForTimeout(200);
console.log('borrada:',await notas(),'· botón +Nota en LUCAS:',await p.locator('[data-act="nota-abrir"][data-id="a"]').count());
await p.click('[data-act="nota-abrir"][data-id="a"]');await p.waitForTimeout(50);await p.locator('textarea[data-nota-ped="a"]').blur();await p.waitForTimeout(150);
console.log('abrir y salir sin escribir → vuelve el botón:',await p.locator('[data-act="nota-abrir"][data-id="a"]').count());
await p.screenshot({path:SP+'/nota-despues'+w+'.png',fullPage:true});
await p.emulateMedia({media:'print'});console.log('impreso:',await p.evaluate(()=>[...document.querySelectorAll('.log-nota')].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.innerText).join(' | ')));await p.emulateMedia({media:'screen'});
console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');
if(w===400){const q=await b.newPage({viewport:{width:w,height:900}});await q.clock.install({time:new Date('2026-10-13T18:20:00-03:00')});
await q.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:null,editores:['yo@x.com']}},data);
await q.goto('http://127.0.0.1:8765/logistica.html');await q.clock.runFor(1500);await q.waitForSelector('#view-logistica .nav');for(let k=0;k<3&&!(await q.locator('.log-ped').count());k++){await q.click('[data-act="fl"][data-d="1"]');await q.waitForTimeout(100);}
console.log('link compartido: editables',await q.locator('textarea[data-nota-ped]').count(),'· +Nota',await q.locator('[data-act="nota-abrir"]').count(),'· nota:',await q.locator('.log-nota').innerText());}}
await b.close();})();
