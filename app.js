'use strict';
const $=id=>document.getElementById(id), KEY='nanpure.soundAudition.v1';
let catalog=[], favorites={}, enabled=true, context, voice, stopTimer, raf, generation=0, paths;
const cache=new Map(), pending=new Map();
const stats=window.__auditionStats={contexts:0,created:0,released:0,frames:0,active:0,cacheBytes:0,timings:[]};
window.__audioState=()=>context?.state||'not-created';
try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');favorites=saved.favorites||{};enabled=saved.enabled!==false;}catch{}
const tile=new Image();tile.src='assets/tile.webp';
function save(){try{localStorage.setItem(KEY,JSON.stringify({favorites,enabled}));}catch{$('status').textContent='Storage unavailable. Export your choices before closing.';}}
function dispose(v){if(!v||v.done)return;v.done=true;v.source.onended=null;try{v.source.stop();}catch{}v.source.disconnect();v.gain.disconnect();stats.released++;stats.active--;if(voice===v)voice=null;}
function stop(message){generation++;clearTimeout(stopTimer);cancelAnimationFrame(raf);dispose(voice);if(context&&context.state==='running')context.suspend().catch(()=>{});if(message)$('status').textContent=message;}
async function buffer(url){if(cache.has(url)){const b=cache.get(url);cache.delete(url);cache.set(url,b);return b;}if(pending.has(url))return pending.get(url);const p=(async()=>{const response=await fetch(url);if(!response.ok)throw Error('Sample unavailable');const b=await context.decodeAudioData(await response.arrayBuffer());cache.set(url,b);while(cache.size>8)cache.delete(cache.keys().next().value);stats.cacheBytes=[...cache.values()].reduce((n,x)=>n+x.length*x.numberOfChannels*4,0);return b;})();pending.set(url,p);try{return await p;}finally{pending.delete(url);}}
function current(){return catalog.find(x=>x.id===$('action').value);}
async function play(event,option,demonstrate=false){
 stop();if(!enabled){$('status').textContent='Sound is off. Turn it on to audition.';return;}const ticket=generation;const requested=performance.now();
 try{
  if(!context){context=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});stats.contexts++;}
  // Resume is invoked directly from the gesture, before loading or decoding.
  const resumed=context.resume();$('status').textContent='Preparing '+event.title+' '+option.id+'…';
  const [b]=await Promise.all([buffer(option.url),resumed,tile.decode()]);
  if(ticket!==generation||document.hidden)return;
  if(context.state!=='running')throw Error('Tap Play again to unlock audio');
  const source=context.createBufferSource(),gain=context.createGain();source.buffer=b;gain.gain.value=.72;source.connect(gain).connect(context.destination);
  const v={source,gain,done:false};voice=v;stats.created++;stats.active++;
  const milestone=demonstrate&&event.id!=='placement'? .420:0;
  const start=context.currentTime+.035;
  source.start(start+milestone);
  const ts=context.getOutputTimestamp?.();
  const now=performance.now(),mapped=ts?.contextTime>0?ts.performanceTime+(start-ts.contextTime)*1000:NaN;
  // Safari/Chromium can retain an old output timestamp while suspended.
  // Reject stale clock pairs on a fresh resume instead of jumping the animation.
  const origin=Number.isFinite(mapped)&&ts.performanceTime>now-100&&mapped>=now&&mapped<now+250?mapped:now+(start-context.currentTime+(context.baseLatency||0))*1000;
  const record={action:event.id,option:option.id,demo:demonstrate,requestMs:requested,scheduledContext:start+milestone,visualTargetMs:origin+milestone*1000,firstVisualMs:null};stats.timings.push(record);if(stats.timings.length>100)stats.timings.shift();
  source.onended=()=>{dispose(v);};
  const duration=demonstrate?Math.max(milestone+b.duration,milestone+(event.id==='victory'?1.6:.8)):b.duration;
  stopTimer=setTimeout(()=>{if(ticket===generation){dispose(v);context.suspend().catch(()=>{});$('status').textContent=option.silent?'Silent selection option.':'Ready to replay or choose another.';}},(duration+.09)*1000);
  $('status').textContent=option.silent?'Silence — intentionally no selection sound.':`${event.title} · ${option.id} ${demonstrate?'with animation':'playing'}`;
  if(demonstrate){const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;function frame(t){if(ticket!==generation)return;stats.frames++;const elapsed=(t-origin)/1000;draw(event.id,Math.max(0,elapsed),reduced);if(elapsed>=milestone&&record.firstVisualMs===null)record.firstVisualMs=t;if(elapsed<duration)raf=requestAnimationFrame(frame);}raf=requestAnimationFrame(frame);}
 }catch(e){if(ticket===generation){stop();$('status').textContent='Could not play: '+e.message+'. Tap Play to retry.';}}
}
function render(){
 const e=current();$('title').textContent=e.title;$('description').textContent=e.description;$('options').replaceChildren();$('demoButtons').replaceChildren();$('demo').hidden=!e.demo;
 const earlier=document.createElement('details'),heading=document.createElement('summary');heading.textContent='Earlier options · first audition round';earlier.append(heading);earlier.open=['A','B','C'].includes(favorites[e.id]);
 for(const o of [...e.options.filter(o=>o.round===2),...e.options.filter(o=>o.round!==2)]){
  const card=document.createElement('article');card.className='option'+(favorites[e.id]===o.id?' chosen':'');
  card.innerHTML=`<div class="option-head"><b><span class="letter">${o.id}</span>${o.name}</b><button aria-label="Play ${e.title} ${o.id}">Play</button></div><p>${o.description} · ${o.durationMs} ms</p><label><input type="radio" name="favorite" value="${o.id}"> Choose ${o.id} as my favorite</label>`;
  card.querySelector('button').onclick=()=>play(e,o);const input=card.querySelector('input');input.checked=favorites[e.id]===o.id;
  input.onchange=()=>{favorites[e.id]=o.id;save();render();};(o.round===2?$('options'):earlier).append(card);
 }
 $('options').append(earlier);
 if(e.demo){
  const select=document.createElement('select');select.id='demoOption';select.setAttribute('aria-label','Demonstration sound');
  for(const o of [...e.options.filter(o=>o.round===2),...e.options.filter(o=>o.round!==2)]){const opt=document.createElement('option');opt.value=o.id;opt.textContent=o.id+' · '+o.name;select.append(opt);}
  if(favorites[e.id])select.value=favorites[e.id];
  const replay=document.createElement('button');replay.textContent='Replay demonstration';replay.onclick=()=>play(e,e.options.find(o=>o.id===select.value),true);
  $('demoButtons').append(select,replay);draw(e.id,0,false);
 }
 $('count').textContent=Object.keys(favorites).length+'/18';
}
function summary(){stop();$('sounds').hidden=true;$('summary').hidden=false;$('soundsTab').setAttribute('aria-pressed','false');$('summaryTab').setAttribute('aria-pressed','true');$('choices').replaceChildren();for(const e of catalog){const c=document.createElement('div');c.className='choice';const o=e.options.find(x=>x.id===favorites[e.id]);c.innerHTML=`<span>${e.title}<br><strong>${o?o.id+' · '+o.name:'Not chosen'}</strong></span><button>Change</button>`;c.querySelector('button').onclick=()=>{$('action').value=e.id;showSounds();};$('choices').append(c);}}
function showSounds(){$('sounds').hidden=false;$('summary').hidden=true;$('soundsTab').setAttribute('aria-pressed','true');$('summaryTab').setAttribute('aria-pressed','false');render();}
function exported(){return JSON.stringify({project:'NANPURE WRLD',catalog:'sound-audition-v2',approvedForProduction:false,selections:Object.fromEntries(catalog.map(e=>[e.id,favorites[e.id]||null]))},null,2);}
$('export').onclick=()=>{const text=exported();$('exportText').hidden=false;$('exportText').value=text;const blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='nanpure-sound-selections.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('copy').onclick=async()=>{const text=exported();$('exportText').hidden=false;$('exportText').value=text;try{await navigator.clipboard.writeText(text);$('status').textContent='Selections copied.';}catch{$('exportText').select();$('status').textContent='Select and copy the export below.';}};
$('stop').onclick=()=>stop('Stopped.');$('sound').checked=enabled;$('sound').onchange=()=>{enabled=$('sound').checked;save();if(!enabled)stop('Sound off.');};$('action').onchange=()=>{stop();render();};$('soundsTab').onclick=showSounds;$('summaryTab').onclick=summary;
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('Paused while away. Tap Play when you return.');});window.addEventListener('pagehide',()=>stop());
function draw(kind,time,reduced){
 const canvas=$('board'),g=canvas.getContext('2d'),n=kind==='victory'?9:3,size=720,pad=20,step=(size-pad*2)/n;
 g.clearRect(0,0,size,size);g.fillStyle='#111e23';g.fillRect(0,0,size,size);
 const phase=Math.max(0,time-.42),pulse=time>.42?Math.max(0,1-phase/(kind==='victory'?1.6:.8)):0;
 for(let r=0;r<n;r++)for(let c=0;c<n;c++){
 const active=(kind==='row'?r===1:kind==='column'?c===1:kind==='box'||kind==='victory'||kind==='multi'?(kind!=='multi'||r===1||c===1):r===1&&c===1);
 let compression=0;if(!reduced&&time>0&&time<.42&&r===1&&c===1){const p=time/.42;compression=p<.12?p/.12*.55:p<.30?.55-(p-.12)/.18*.40:p<.80?.15:p<.88?.15+(p-.80)/.08*.85:(1-p)/.12;}
 const x=pad+c*step,y=pad+r*step+compression*step*.026;
 g.shadowColor=active&&pulse?'#67ded1':'#000';g.shadowBlur=active&&pulse?12*pulse:4;g.fillStyle=active&&pulse?`rgba(87,219,206,${pulse*.55})`:'#071115';g.fillRect(x-2,y-2,step,step);g.shadowBlur=0;
 if(tile.complete)g.drawImage(tile,x,y,step-3,step-3);
 const last=r===1&&c===1;const number=(r*3+Math.floor(r/3)+c)%9+1;
 if(!last||time>0){g.save();if(last){g.globalAlpha=Math.min(1,time/.23);g.beginPath();g.rect(x,y,step,step*Math.min(1,time/.30));g.clip();}const s=step*.65;g.translate(x+step/2-s*.3,y+step*.23);g.scale(s,s);g.fillStyle=last?'#9d181f':'#282723';g.strokeStyle='#f7ebd1';g.lineWidth=.02;const p=paths?.[number];if(p){g.stroke(p);g.fill(p);}g.restore();}
 }
 // Recessed structural section divisions on the full-board demo.
 if(n===9){g.strokeStyle='#417975';g.lineWidth=5;for(let i=3;i<9;i+=3){g.beginPath();g.moveTo(pad+i*step-2,pad);g.lineTo(pad+i*step-2,size-pad);g.moveTo(pad,pad+i*step-2);g.lineTo(size-pad,pad+i*step-2);g.stroke();}}
}
Promise.all([fetch('catalog.json?v=2').then(r=>r.json()),fetch('assets/numerals.json').then(r=>r.json()),tile.decode()]).then(([data,numerals])=>{catalog=data;paths=Object.fromEntries(Object.entries(numerals).map(([n,p])=>[n,new Path2D(p)]));favorites=Object.fromEntries(Object.entries(favorites).filter(([id,v])=>catalog.some(e=>e.id===id&&e.options.some(o=>o.id===v))));for(const e of catalog){const opt=document.createElement('option');opt.value=e.id;opt.textContent=e.group+' · '+e.title;$('action').append(opt);}render();}).catch(e=>{$('status').textContent='Gallery could not load. Reload to retry. '+e.message;});
