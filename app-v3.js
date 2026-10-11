'use strict';
const $=id=>document.getElementById(id),KEY='nanpure.soundAudition.v1';
let catalog=[],imports=[],favorites={},tuning={},enabled=true,context,voice,stopTimer,raf,generation=0,paths,stream,loadingTicket=null;
const cache=new Map(),pending=new Map(),MAX_BYTES=2400000;
const stats=window.__auditionStats={contexts:0,created:0,released:0,frames:0,active:0,cacheBytes:0,streamInstances:0,timings:[]};
window.__audioState=()=>context?.state||'not-created';
try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');favorites=saved.favorites||{};tuning=saved.tuning||{};enabled=saved.enabled!==false;}catch{}
const tile=new Image();tile.src='assets/tile.webp';const icons={};
for(const id of ['notes','scanner','reveal','arrow','bomb']){const im=new Image();im.src='assets/'+id+'.webp';icons[id]=im;}
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const OFF={id:'OFF',name:'Silence',description:'No sound for this action.',silent:true,durationMs:0};
function save(){try{localStorage.setItem(KEY,JSON.stringify({favorites,tuning,enabled}));}catch{$('status').textContent='Storage unavailable. Export your choices before closing.';}}
function dispose(v){if(!v||v.done)return;v.done=true;if(v.type==='stream'){if(voice===v){stream.onended=null;stream.pause();stream.removeAttribute('src');stream.load();}}else{v.source.onended=null;try{v.source.stop();}catch{}v.source.disconnect();v.gain.disconnect();}stats.released++;stats.active--;if(voice===v)voice=null;}
function stop(message){generation++;loadingTicket=null;clearTimeout(stopTimer);cancelAnimationFrame(raf);dispose(voice);if(context&&context.state==='running')context.suspend().catch(()=>{});if(message)$('status').textContent=message;}
async function buffer(option){const url=option.url;if(cache.has(url)){const b=cache.get(url);cache.delete(url);cache.set(url,b);return b;}if(pending.has(url))return pending.get(url);const p=(async()=>{const r=await fetch(url);if(!r.ok)throw Error('Sample unavailable');const b=await context.decodeAudioData(await r.arrayBuffer());cache.set(url,b);const bytes=()=>[...cache.values()].reduce((n,x)=>n+x.length*x.numberOfChannels*4,0);while(cache.size>8||bytes()>MAX_BYTES)cache.delete(cache.keys().next().value);stats.cacheBytes=bytes();return b;})();pending.set(url,p);try{return await p;}finally{pending.delete(url);}}
const current=()=>catalog.find(x=>x.id===$('action').value);
function chosen(e){return e.options.find(o=>o.id===favorites[e.id])||OFF;}
function bounds(e,o,useTuning){const t=useTuning&&tuning[e.id]?.sound===o.id?tuning[e.id]:{};const start=Math.max(0,Math.min(o.durationMs-1,Number(t.startMs)||0));const end=Math.max(start+1,Math.min(o.durationMs,Number(t.endMs)||o.durationMs));return{start,end,volume:Math.max(0,Math.min(1,t.volume??.72))};}
function visualDuration(e){return e.id==='victory'?2.02:e.id==='scanner'?4:['row','column','box','multi'].includes(e.id)?1.22:['notes','reveal','arrow','bomb'].includes(e.id)?.75:.8;}
function animate(e,origin,ticket,milestone,record){const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;function frame(t){if(ticket!==generation)return;stats.frames++;const elapsed=(t-origin)/1000;draw(e.id,Math.max(0,elapsed),reduced);if(elapsed>=milestone&&record.firstVisualMs===null)record.firstVisualMs=t;if(elapsed<visualDuration(e))raf=requestAnimationFrame(frame);}raf=requestAnimationFrame(frame);}
async function play(e,o,demo=false,useTuning=true){
 stop();const ticket=generation,requested=performance.now(),completion=['row','column','box','multi','victory'].includes(e.id),milestone=demo&&completion?.420:0;
 if(o.silent||!enabled){$('status').textContent=o.silent?'Silent action — no audio playback.':'Sound is off.';if(demo){const rec={action:e.id,option:o.id,demo:true,silent:true,visualTargetMs:requested+milestone*1000,firstVisualMs:null};stats.timings.push(rec);if(stats.timings.length>100)stats.timings.shift();animate(e,requested,ticket,milestone,rec);}return;}
 loadingTicket=ticket;
 const bnd=bounds(e,o,useTuning);
 try{
  if(o.durationMs>12000){
   if(!stream){stream=new Audio();stream.preload='none';stats.streamInstances++;}
   const v={type:'stream',done:false};voice=v;loadingTicket=null;stats.created++;stats.active++;stream.src=o.url;stream.volume=bnd.volume;
   stream.onloadedmetadata=()=>{if(ticket===generation)stream.currentTime=bnd.start/1000;};
   const promise=stream.play();$('status').textContent='Preparing '+e.title+'…';await promise;if(ticket!==generation)return;
   stream.onended=()=>{dispose(v);$('status').textContent='Ready to replay.';};
   const now=performance.now(),rec={action:e.id,option:o.id,demo,streamed:true,requestMs:requested,visualTargetMs:now,firstVisualMs:null};stats.timings.push(rec);
   // Stream previews align to media-playing, not precise scheduled audio-clock output.
   if(demo)animate(e,now-milestone*1000,ticket,milestone,rec);
   stopTimer=setTimeout(()=>{if(ticket===generation)stop('Ready to replay.');},bnd.end-bnd.start+100);
  }else{
   if(!context){context=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});stats.contexts++;}
   const resumed=context.resume();$('status').textContent='Preparing '+e.title+'…';const [b]=await Promise.all([buffer(o),resumed]);if(ticket!==generation||document.hidden){if(loadingTicket===null&&!voice&&context.state==='running')context.suspend().catch(()=>{});return;}
   if(context.state!=='running')throw Error('Tap Play again to unlock audio');
   const source=context.createBufferSource(),gain=context.createGain();source.buffer=b;gain.gain.value=bnd.volume;source.connect(gain).connect(context.destination);
   const v={type:'buffer',source,gain,done:false};voice=v;loadingTicket=null;stats.created++;stats.active++;
   const start=context.currentTime+.035,offset=Math.min(bnd.start/1000,b.duration-.001),length=Math.max(.001,Math.min((bnd.end-bnd.start)/1000,b.duration-offset));
   const fade=Math.min(.003,length/3);gain.gain.setValueAtTime(0,start+milestone);gain.gain.linearRampToValueAtTime(bnd.volume,start+milestone+fade);gain.gain.setValueAtTime(bnd.volume,start+milestone+length-fade);gain.gain.linearRampToValueAtTime(0,start+milestone+length);
   source.start(start+milestone,offset,length);source.onended=()=>dispose(v);
   const ts=context.getOutputTimestamp?.(),now=performance.now(),mapped=ts?.contextTime>0?ts.performanceTime+(start-ts.contextTime)*1000:NaN;
   const origin=Number.isFinite(mapped)&&ts.performanceTime>now-100&&mapped>=now&&mapped<now+250?mapped:now+(start-context.currentTime+(context.baseLatency||0))*1000;
   const rec={action:e.id,option:o.id,demo,requestMs:requested,scheduledContext:start+milestone,visualTargetMs:origin+milestone*1000,firstVisualMs:null};stats.timings.push(rec);
   stopTimer=setTimeout(()=>{if(ticket===generation){dispose(v);context.suspend().catch(()=>{});$('status').textContent='Ready to replay or choose another.';}},(Math.max(milestone+length,demo?visualDuration(e):0)+.09)*1000);
   if(demo)animate(e,origin,ticket,milestone,rec);
  }
  if(stats.timings.length>100)stats.timings.splice(0,stats.timings.length-100);
  $('status').textContent=e.title+' · '+o.name+(demo?' with animation':' playing');
 }catch(err){if(ticket===generation){stop();$('status').textContent='Could not play: '+err.message+'. Tap Play to retry.';}}
}
function select(e,o){favorites[e.id]=o.id==='OFF'?null:o.id;if(tuning[e.id]?.sound!==o.id)delete tuning[e.id];save();render();}
function metadata(o){return o.round===3?`${o.originalFilename} · ${o.source}. Leading trim ${o.processing.leadTrimMs} ms; gain ${o.processing.gainDb} dB; mono MP3. Production approval pending.`:o.name;}
function card(e,o){const c=document.createElement('article');c.className='option'+(chosen(e).id===o.id?' chosen':'');c.innerHTML=`<div class="option-head"><b><span class="letter">${esc(o.id)}</span>${esc(o.name)}</b><button aria-label="Play ${esc(e.title)} ${esc(o.id)}">Play</button></div><p>${esc(o.description)} · ${o.durationMs} ms</p><label><input type="radio" name="favorite" value="${esc(o.id)}"> Use this sound</label>`;c.querySelector('button').onclick=()=>play(e,o);const input=c.querySelector('input');input.checked=chosen(e).id===o.id;input.onchange=()=>select(e,o);return c;}
function render(){
 const e=current();if(!e)return;$('title').textContent=e.title;$('description').textContent=e.description;$('options').replaceChildren();$('demoButtons').replaceChildren();$('demo').hidden=false;
 const earlier=document.createElement('details'),s=document.createElement('summary');s.textContent='Earlier options · first audition round';earlier.append(s);earlier.open=['A','B','C'].includes(favorites[e.id]);
 const downloaded=document.createElement('details'),d=document.createElement('summary');d.textContent='Downloaded sounds · 11 imported recordings';downloaded.append(d);downloaded.open=chosen(e).round===3;
 for(const o of e.options){if(o.id==='OFF')continue;(o.round===3?downloaded:o.round===2?$('options'):earlier).append(card(e,o));}
 $('options').append(card(e,OFF),downloaded,earlier);
 const demoSelect=document.createElement('select');demoSelect.id='demoOption';demoSelect.setAttribute('aria-label','Demonstration sound');
 for(const o of [OFF,...e.options.filter(o=>o.id!=='OFF')]){const opt=document.createElement('option');opt.value=o.id;opt.textContent=o.id+' · '+o.name;demoSelect.append(opt);}demoSelect.value=chosen(e).id;
 const replay=document.createElement('button');replay.textContent='Replay demonstration';replay.onclick=()=>play(e,e.options.find(o=>o.id===demoSelect.value)||OFF,true);$('demoButtons').append(demoSelect,replay);
 const selected=chosen(e);$('selected').textContent='Selected: '+metadata(selected);$('tuning').hidden=selected.silent;
 const b=bounds(e,selected,true);$('trimStart').value=Math.round(b.start);$('trimEnd').value=Math.round(b.end);$('volume').value=Math.round(b.volume*100);
 $('count').textContent='18/18';draw(e.id,0,false);
}
function show(view){stop();for(const name of ['sounds','downloads','summary']){$(name).hidden=name!==view;$(name+'Tab').setAttribute('aria-pressed',String(name===view));}if(view==='sounds')render();if(view==='downloads')renderImports();if(view==='summary')summary();}
function renderImports(){
 $('importList').replaceChildren();for(const o of imports){const c=document.createElement('article');c.className='option';c.innerHTML=`<h2>${esc(o.originalFilename)}</h2><p>${esc(o.description)}</p><p>${(o.originalDurationMs/1000).toFixed(3)} s original · ${(o.durationMs/1000).toFixed(3)} s prepared<br>Peak ${o.peakDbFS} dBFS · RMS ${o.rmsDbFS} dBFS</p><p>${esc(o.source)} · ${esc(o.license)}</p><p class="small">Prepared: trim ${o.processing.leadTrimMs} ms; gain ${o.processing.gainDb} dB; 3 ms edge fades; mono 96 kbps MP3. No tail cut. ${esc(o.issues.join(' '))}</p><button class="listen">Play recording</button><label>Preview / assign to<select aria-label="Action for ${esc(o.id)}"></select></label><button class="preview">Preview animation</button><button class="assign">Assign to action</button><p class="assignments"></p>`;
  const selector=c.querySelector('select');for(const e of catalog){const opt=document.createElement('option');opt.value=e.id;opt.textContent=e.title;selector.append(opt);}selector.value=current()?.id||'placement';
  c.querySelector('.listen').onclick=()=>play(catalog.find(e=>e.id===selector.value),o,false,false);
  c.querySelector('.preview').onclick=()=>{$('action').value=selector.value;show('sounds');$('demoOption').value=o.id;play(current(),o,true);$('demo').scrollIntoView({behavior:'instant',block:'start'});};
  c.querySelector('.assign').onclick=()=>{select(catalog.find(e=>e.id===selector.value),o);renderImports();$('status').textContent='Assigned '+o.originalFilename+' to '+catalog.find(e=>e.id===selector.value).title+'.';};
  const assigned=catalog.filter(e=>favorites[e.id]===o.id).map(e=>e.title);c.querySelector('.assignments').textContent=assigned.length?'Assigned: '+assigned.join(', '):'Not assigned. Listening will not replace your choices.';
  const link=document.createElement('a');link.href=o.sourceUrl;link.textContent=o.sourceVerified?'Verified source page':'Candidate source page (unverified)';link.target='_blank';link.rel='noopener';c.append(link);$('importList').append(c);
 }
}
function summary(){ $('choices').replaceChildren();for(const e of catalog){const o=chosen(e),c=document.createElement('div');c.className='choice';c.innerHTML=`<span>${esc(e.title)}<br><strong>${esc(o.name)}</strong><br><small>${o.silent?'Intentionally silent':esc(metadata(o))}</small></span><button>Change</button>`;c.querySelector('button').onclick=()=>{$('action').value=e.id;show('sounds');};$('choices').append(c);}}
function exported(){return JSON.stringify({project:'NANPURE WRLD',catalog:'sound-audition-v3-imports',approvedForProduction:false,selections:Object.fromEntries(catalog.map(e=>[e.id,favorites[e.id]??null])),configuration:Object.fromEntries(catalog.map(e=>{const o=chosen(e);return[e.id,{silent:o.silent,option:o.id==='OFF'?null:o.id,filename:o.silent?null:o.originalFilename||o.url.split('/').pop(),source:o.silent?null:o.source||'Original NANPURE synthesis',sourceUrl:o.sourceUrl||null,originalSha256:o.originalSha256||null,previewSha256:o.previewSha256||null,processing:o.processing||null,playback:o.silent?null:bounds(e,o,true),productionReady:false,license:o.license||null}];}))},null,2);}
$('export').onclick=()=>{const text=exported();$('exportText').hidden=false;$('exportText').value=text;const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='nanpure-sound-selections.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('copy').onclick=async()=>{const text=exported();$('exportText').hidden=false;$('exportText').value=text;try{await navigator.clipboard.writeText(text);$('status').textContent='Selections copied.';}catch{$('exportText').select();$('status').textContent='Select and copy the export below.';}};
$('saveTuning').onclick=()=>{const e=current(),o=chosen(e),start=Number($('trimStart').value),end=Number($('trimEnd').value),vol=Number($('volume').value);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>o.durationMs||vol<0||vol>100){$('status').textContent='Use a valid excerpt within the prepared recording, and volume 0–100.';return;}tuning[e.id]={sound:o.id,startMs:start,endMs:end,volume:vol/100};save();$('status').textContent='Saved this action’s excerpt and volume.';};
$('stop').onclick=()=>stop('Stopped.');$('sound').checked=enabled;$('sound').onchange=()=>{enabled=$('sound').checked;save();if(!enabled)stop('Sound off.');};$('action').onchange=()=>{stop();render();};for(const name of ['sounds','downloads','summary'])$(name+'Tab').onclick=()=>show(name);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('Paused while away. Tap Play when you return.');});window.addEventListener('pagehide',()=>stop());
function draw(kind,time,reduced){
 const g=$('board').getContext('2d'),n=['victory','failure'].includes(kind)?9:3,size=720,pad=20,step=(size-pad*2)/n;
 g.clearRect(0,0,size,size);g.fillStyle='#111e23';g.fillRect(0,0,size,size);
 const completion=['row','column','box','multi','victory'].includes(kind),phase=Math.max(0,time-(completion?.42:0)),pulse=time>(completion?.42:0)?Math.max(0,1-phase/(kind==='victory'?1.6:.8)):0;
 for(let r=0;r<n;r++)for(let c=0;c<n;c++){
  const last=r===1&&c===1,active=kind==='row'?r===1:kind==='column'?c===1:kind==='box'||kind==='bomb'||kind==='victory'?true:kind==='multi'?r===1||c===1:kind==='arrow'?r===1:kind==='reveal'?c===1:last;
  let compression=0;if(!reduced&&kind==='placement'&&time>0&&time<.42&&last){const p=time/.42;compression=p<.12?p/.12*.55:p<.30?.55-(p-.12)/.18*.40:p<.80?.15:p<.88?.15+(p-.80)/.08*.85:(1-p)/.12;}
  const x=pad+c*step,y=pad+r*step+compression*step*.026;
  g.shadowColor=active&&pulse?'#67ded1':'#000';g.shadowBlur=active&&pulse?12*pulse:4;g.fillStyle=active&&pulse?`rgba(87,219,206,${pulse*.55})`:'#071115';g.fillRect(x-2,y-2,step,step);g.shadowBlur=0;
  if(tile.complete)g.drawImage(tile,x,y,step-3,step-3);
  const num=kind==='failure'&&last?7:(r*3+Math.floor(r/3)+c+(kind==='retry'&&time>.35?2:0))%9+1;
  if(kind==='notes'&&last){g.fillStyle='#55554b';g.font='28px Montserrat';g.fillText('1   3   7',x+step*.15,y+step*.42);continue;}
  const hidden=last&&kind==='placement'&&time===0||last&&kind==='erase'&&time>.2;
  if(!hidden){g.save();if(last&&kind==='placement'){g.globalAlpha=Math.min(1,time/.23);g.beginPath();g.rect(x,y,step,step*Math.min(1,time/.30));g.clip();}if(last&&kind==='erase')g.globalAlpha=Math.max(0,1-time/.2);if(kind==='retry'&&time<.35)g.globalAlpha=1-time/.35;const s=step*.65;g.translate(x+step/2-s*.3,y+step*.23);g.scale(s,s);g.fillStyle=last?'#9d181f':'#282723';g.strokeStyle='#f7ebd1';g.lineWidth=.02;const p=paths?.[num];if(p){g.stroke(p);g.fill(p);}g.restore();}
 }
 if(kind==='scanner'&&time>0&&time<4){g.fillStyle='rgba(90,210,214,.25)';g.fillRect(pad,reduced?size/2:pad+(size-2*pad)*time/4,size-2*pad,20);}
 if(icons[kind]?.complete&&time>0&&time<.75&&!reduced){g.globalAlpha=Math.max(0,1-time/.75);g.drawImage(icons[kind],size/2-70,size/2-70,140,140);g.globalAlpha=1;}
 if(kind==='failure'){g.fillStyle='rgba(8,18,26,.85)';g.fillRect(70,220,580,270);g.fillStyle='#f6eedc';g.font='32px Montserrat';g.textAlign='center';g.fillText('FAILED BOARD',360,300);g.font='22px Montserrat';g.fillText('CONTINUE     ·     PLAY AGAIN',360,380);g.textAlign='start';}
 if(n===9){g.strokeStyle='#417975';g.lineWidth=5;for(let i=3;i<9;i+=3){g.beginPath();g.moveTo(pad+i*step-2,pad);g.lineTo(pad+i*step-2,size-pad);g.moveTo(pad,pad+i*step-2);g.lineTo(size-pad,pad+i*step-2);g.stroke();}}
}
Promise.all([fetch('catalog.json?v=3').then(r=>r.json()),fetch('assets/numerals.json').then(r=>r.json()),fetch('imports.json?v=3').then(r=>r.json()),fetch('owner-defaults.json').then(r=>r.json()),tile.decode()]).then(([data,numerals,downloaded,defaults])=>{
 imports=downloaded;catalog=data.map(e=>({...e,options:[...e.options,...imports,OFF]}));paths=Object.fromEntries(Object.entries(numerals).map(([n,p])=>[n,new Path2D(p)]));favorites={...defaults.selections,...favorites};favorites=Object.fromEntries(Object.entries(favorites).filter(([id,v])=>catalog.some(e=>e.id===id&&(v===null||e.options.some(o=>o.id===v)))));
 for(const e of catalog){const opt=document.createElement('option');opt.value=e.id;opt.textContent=e.group+' · '+e.title;$('action').append(opt);}save();render();
}).catch(e=>{$('status').textContent='Gallery could not load. Reload to retry. '+e.message;});
