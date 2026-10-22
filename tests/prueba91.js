// Cámara (privada): solo la ve la cuenta habilitada en /camaraUsuarios. Se carga pegando la planilla (bloques semanales),
// calcula remanente, disponible, medias en cámara y lugar libre como la planilla, todo número se puede corregir,
// y aparece un cuadro en Inicio. Datos inventados (el repositorio es público).
const {chromium}=require('playwright');const SP=process.argv[2];const fs=require('fs');
const SEM=process.env.CAM_DATOS?JSON.parse(fs.readFileSync(process.env.CAM_DATOS,'utf8')):[
 {lunes:'2026-10-05',dias:[[600,0,300,700,400],[600,0,250,700,null],[600,0,200,700,null],[600,0,250,700,null],[700,160,400,700,null]]},
 {lunes:'2026-10-12',dias:[[0,0,0,700,null],[600,0,300,720,null],[600,0,200,720,null],[600,0,250,720,null],[700,160,300,740,null]],nota:'semana con feriado'},
 {lunes:'2026-10-19',dias:[[600,0,280,740,null],[600,0,300,740,null],[600,0,180,740,null],[600,0,240,720,null],[500,160,300,750,null]]}];
const MES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'],DN=['Lunes','Martes','Miercoles','Jueves','Viernes'];
// Arma el texto como sale al copiar la planilla de Google (con los remanentes calculados por la planilla).
function tsv(sem){let out=[],dispPrev=null,despPrev=null;const esp=[];
 for(const w of sem){const l=new Date(w.lunes+'T12:00:00');const r=Array.from({length:12},()=>Array(18).fill(''));
  r[0][0]=MES[l.getMonth()];
  w.dias.forEach((d,i)=>{const f=new Date(l);f.setDate(l.getDate()+i);const c=i*3;const [p,u,v,ds,remIni]=d;
   r[1][c]=DN[i]+' '+String(f.getDate()).padStart(2,'0');r[1][c+2]='FAENA';
   r[2][c]='PROPIOS';r[2][c+1]=String(p);r[2][c+2]=String(p+u);r[3][c]='USUARIO';r[3][c+1]=u?String(u):'';
   r[5][c]='VENTA';r[5][c+1]=String(v);r[5][c+2]='DESPOSTE';r[6][c]='DESPOSTE';r[6][c+1]=String((p-v)*2);
   const rem=remIni!=null?remIni:dispPrev-despPrev;esp.push({f:f.toISOString().slice(0,10),rem,cam:(p+u)*2+rem});
   r[7][c]='REMANENTE';r[7][c+1]=String(rem).replace(/\B(?=(\d{3})+(?!\d))/g,'.');r[7][c+2]=String(ds);
   dispPrev=(p-v)*2+rem;despPrev=ds;r[8][c+1]=String(dispPrev);r[9][c+2]=String((p+u)*2+rem);});
  r[9][0]='MEDIAS EN CAMARAS X DIA';if(w.nota)r[9][15]=w.nota;out=out.concat(r.map(x=>x.join('\t')));}
 return {txt:out.join('\n'),esp};}
const T=tsv(SEM);
const base={faena:{'2026-10-19':{desde:'2026-10-19',stockInicial:0,dias:[0,1,2,3,4].map(i=>({fecha:'2026-10-'+(19+i),faena:[],clientes:[]}))}},produccion:{},config:{general:{}},privado:{},pedidos:{}};
(async()=>{const b=await chromium.launch();
// 1) Otro editor: no ve la pestaña ni el cuadro.
{const p=await b.newPage({viewport:{width:1100,height:900}});await p.clock.install({time:new Date('2026-10-21T10:00:00-03:00')});
 await p.addInitScript(d=>{window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'otro@x.com'},editores:['otro@x.com','yo@x.com'],camara:['yo@x.com']}},base);
 await p.goto('http://127.0.0.1:8765/index.html#camara');await p.clock.runFor(1500);await p.waitForTimeout(300);
 console.log('otro editor → pestaña visible:',await p.locator('#tab-camara').isVisible(),'· cuadro en Inicio:',await p.locator('.t-camara').count(),'· quedó en:',await p.evaluate(()=>location.hash));}
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.clock.install({time:new Date('2026-10-21T10:00:00-03:00')});
 await p.addInitScript(d=>{window.print=()=>{};window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],camara:['yo@x.com']}},base);
 await p.goto('http://127.0.0.1:8765/index.html');await p.clock.runFor(1500);await p.waitForTimeout(200);
 console.log('=== ',w,'pestaña visible:',await p.locator('#tab-camara').isVisible(),'· cuadro Inicio (vacío):',(await p.locator('.t-camara').innerText()).replace(/\s+/g,' '));
 await p.click('#tab-camara');await p.waitForSelector('#cam-txt');
 await p.fill('#cam-txt',T.txt);await p.locator('#cam-txt').dispatchEvent('input');await p.waitForTimeout(100);
 console.log('vista previa:',(await p.locator('.cam-prev').innerText()).replace(/\s+/g,' '));
 await p.click('[data-act="cam-guardar-pegado"]');await p.clock.runFor(800);await p.waitForTimeout(300);
 const fila=async lab=>p.evaluate(l=>{const tr=[...document.querySelectorAll('.cam-tabla tbody tr')].find(t=>t.querySelector('th').innerText.startsWith(l));return [...tr.querySelectorAll('td')].slice(0,5).map(td=>{const i=td.querySelector('input');return (i?i.value:td.innerText).split('\n')[0].trim();}).join(' | ');},lab);
 console.log('semana:',await p.locator('.cam-tit').innerText());
 for(const l of ['PROPIOS','VENTA','DESPOSTE DÍA','REMANENTE','MEDIAS EN CÁMARA','LUGAR LIBRE'])console.log('  ',l,':',await fila(l));
 const esp=T.esp.filter(x=>x.f>='2026-10-19'&&x.f<='2026-10-23');console.log('   esperado remanente:',esp.map(x=>x.rem).join(' | '),'· cámara:',esp.map(x=>x.cam).join(' | '));
 // Corregir la venta del miércoles y ver que el jueves se recalcula.
 const inp=p.locator('.cam-in[data-cf="venta"][data-f="2026-10-21"]');await inp.fill('200');await inp.press('Enter');await p.clock.runFor(500);await p.waitForTimeout(200);
 console.log('venta mié 200 → remanente:',await fila('REMANENTE'),'· guardado:',await p.evaluate(()=>JSON.stringify(window.__mock.data.privado['camara-2026-10-19'].dias[2])));
 // Remanente a mano y volver al calculado.
 const rm=p.locator('.cam-in[data-cf="rem"][data-f="2026-10-22"]');await rm.fill('1000');await rm.press('Enter');await p.waitForTimeout(200);console.log('rem jue a mano 1000 →',await fila('REMANENTE'));
 await p.locator('.cam-in[data-cf="rem"][data-f="2026-10-22"]').fill('');await p.locator('.cam-in[data-cf="rem"][data-f="2026-10-22"]').press('Enter');await p.waitForTimeout(200);console.log('borrado → vuelve:',await fila('REMANENTE'));
 await p.click('[data-act="cam-sem"][data-d="-7"]');await p.waitForTimeout(100);console.log('semana anterior:',await p.locator('.cam-tit').innerText(),'· nota:',await p.inputValue('#cam-nota'),'· remanente:',await fila('REMANENTE'));
 await p.click('[data-act="cam-hoy"]');await p.waitForTimeout(100);
 await p.screenshot({path:SP+'/camara'+w+'.png',fullPage:true});
 await p.click('#tab-inicio');await p.waitForTimeout(200);console.log('cuadro Inicio:',(await p.locator('.t-camara').innerText()).replace(/\s+/g,' '));
 await p.locator('.t-camara').screenshot({path:SP+'/camara-tile'+w+'.png'});
 console.log('desborde:',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'errores:',errs.join('|')||'ninguno');}
await b.close();})();
