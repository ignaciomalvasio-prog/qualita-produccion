// Pedidos: la hoja de medias en ANIMALES copiada de Excel (CLIENTE <tab> número) se carga con el doble de medias (50 animales = 100 medias),
// sin pasar por la IA: pegando con Ctrl+V en la página o en "Pegar texto". Un mensaje común sigue yendo a la IA.
const {chromium}=require('playwright');const SP=process.argv[2];
const HOJA='NOVICERD\t50\nDON PEDRO\t50\nHERNANDEZ NICOLAS\t5\nGANADOS\t20\nBUSTAMANTE\t2\nSCIAN ASOCIADOS\t100\nALTA GRACIA\t20';
const GRILLA='HONORIO\t7\t\tCOLAZO\t6\t\tAGOSTI\t9\nFINUCCI\t3\t\tVIDELA\t1\t\tESTEMATI\t13\n\t\t\tDIGAR\t180\t\t\t';
const FAENA='FAENA\tPROPIOS\tUSUARIOS\nLA COLORADA\t160\t20';
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-21T16:20:00-03:00')});
await p.addInitScript(()=>{window.__iaLlamadas=0;window.__mock={data:{faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:0,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[],clientes:[]}))}},produccion:{},config:{general:{}},pedidos:{},privado:{clientes:{lista:[]},ia:{clave:'x'}}},user:{email:'yo@x.com'},editores:['yo@x.com'],
 ia:(t,x)=>{window.__iaLlamadas++;return {pedidos:[{cliente:'POR IA',entrega:'',medias:4,peso:'',frio:'',cortes:[],nota:'',dudas:[],precioMedias:0,ivaMedias:''}],planilla:[]};}}});
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForSelector('[data-act="q-pegar"]');
const pegar=(txt,sel)=>p.evaluate(([t,s])=>{const dt=new DataTransfer();dt.setData('text/plain',t);const ev=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});(s?document.querySelector(s):document.body).dispatchEvent(ev);return ev.defaultPrevented;},[txt,sel||null]);
const props=()=>p.evaluate(()=>[...document.querySelectorAll('#view-pedidos [id$="cliente"]')].map(c=>{const i=c.id.replace(/cliente$/,'');const m=document.getElementById(i+'medias');return c.value+'='+(m?m.value:'?');}).join(', '));
console.log('=== ',w,'Ctrl+V hoja → tomado:',await pegar(HOJA));await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log('propuestas:',await props(),'· IA:',await p.evaluate(()=>window.__iaLlamadas));
console.log('aviso:',await p.evaluate(()=>{const d=document.querySelector('#view-pedidos .duda, #view-pedidos .dudas');return d?d.innerText.replace(/\s+/g,' ').slice(0,120):'(sin aviso)';}));
await p.screenshot({path:SP+'/animales'+w+'.png',fullPage:true});
const todos=p.locator('[data-act="q-todos"]');if(await todos.count()){await todos.click();await p.clock.runFor(1500);await p.waitForTimeout(300);}
console.log('guardados:',await p.evaluate(()=>Object.values(window.__mock.data.pedidos).map(x=>x.cliente+'='+x.medias).join(', ')));
// Grilla de varias columnas, pegada en el recuadro de "Pegar texto" y Leer.
await p.click('[data-act="q-pegar"]');await p.waitForTimeout(100);
console.log('en el recuadro → tomado:',await pegar(GRILLA,'#pegar-txt'));
await p.fill('#pegar-txt',GRILLA);await p.click('[data-act="q-leer-texto"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log('grilla guardada:',await p.evaluate(()=>Object.values(window.__mock.data.pedidos).map(x=>x.cliente+'='+x.medias).slice(7).join(', ')),'· IA:',await p.evaluate(()=>window.__iaLlamadas));
// Descartar y probar que lo que no es la hoja va a la IA.
const desc=p.locator('[data-act="q-descartar-todos"]');if(await desc.count()){await desc.click();await p.waitForTimeout(100);const s2=p.locator('[data-act="q-descartar-todos"]');if(await s2.count())await s2.click();await p.waitForTimeout(100);}
await p.click('[data-act="q-pegar"]');await p.fill('#pegar-txt',FAENA);await p.click('[data-act="q-leer-texto"]');await p.clock.runFor(1500);await p.waitForTimeout(300);
console.log('faena (no es la hoja) → IA:',await p.evaluate(()=>window.__iaLlamadas));
console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');}
await b.close();})();
