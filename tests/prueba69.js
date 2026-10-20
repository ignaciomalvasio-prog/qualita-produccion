// Pedidos por voz: "Dictar pedido" (reconocimiento del navegador) deja el texto en "Pegar texto" para leerlo.
const {chromium}=require('playwright');const SP=process.argv[2];const fs=require('fs');
fs.writeFileSync(SP+'/audio.opus',Buffer.from('OggS falso'));
const data={faena:{},config:{general:{}},privado:{clientes:{lista:[]},ia:{clave:'sk-ant-x',modelo:'m'}},produccion:{},pedidos:{}};
(async()=>{const b=await chromium.launch();
for(const w of [1100,400]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.clock.install({time:new Date('2026-10-19T12:00:00-03:00')});
await p.addInitScript(d=>{
 class Rec{start(){this.n=(this.n||0);setTimeout(()=>{const r=(t,f)=>{const x=[{transcript:t}];x.isFinal=f;return x;};this.onresult&&this.onresult({results:[r('para el martes rover dos cajas de bondiola',true),r(' y cinco kilos de pechito',false)]});},50);} stop(){setTimeout(()=>this.onend&&this.onend(),10);}}
 window.__mock={data:JSON.parse(JSON.stringify(d)),user:{email:'yo@x.com'},editores:['yo@x.com'],dictado:Rec,audio:()=>'Hola, para el miércoles Grion, tres cajas de matambrito.',
  ia:(tipo,txt)=>({pedidos:[{cliente:'ROVER',entrega:'2026-10-20',medias:0,peso:'',frio:'',cortes:[{corte:'BONDIOLA',texto:'2 CAJAS BONDIOLA',orden:true}],nota:'',dudas:[]}],planilla:[]})};
},data);
await p.goto('http://127.0.0.1:8765/index.html#pedidos');await p.clock.runFor(1500);await p.waitForSelector('[data-act="q-dictar"]');
await p.click('[data-act="q-dictar"]');await p.waitForTimeout(150);
console.log(w,'dictando:',await p.locator('[data-act="q-dictar"]').innerText(),'· aviso:',await p.locator('.escuchando').count(),'· texto:',await p.inputValue('#pegar-txt'));
await p.screenshot({path:SP+'/dictado'+w+'.png'});
await p.click('[data-act="q-dictar"]');await p.waitForTimeout(100);
console.log(w,'detenido:',await p.locator('[data-act="q-dictar"]').innerText(),'· texto guardado:',await p.evaluate(()=>document.getElementById('pegar-txt').value));
console.log(w,'sin botón de audio:',await p.locator('#audio').count()===0);
await p.click('[data-act="q-leer-texto"]');await p.clock.runFor(2000);await p.waitForTimeout(300);
console.log(w,'propuestas:',await p.evaluate(()=>document.querySelectorAll('#view-pedidos .prop, #view-pedidos [data-act="q-guardar"]').length),'· errores',errs.join('|')||'ninguno','· desborde',await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth));
await p.screenshot({path:SP+'/dictado-leido'+w+'.png',fullPage:true});}
await b.close();})();
