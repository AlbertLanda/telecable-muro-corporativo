// Deterministic script-level checks. This is a DOM/media shim, not a browser render.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path'),child=require('child_process');
const fixture=JSON.parse(child.execFileSync(process.env.PYTHON||'python3',[path.join(__dirname,'validate.py'),'--fixture'],{encoding:'utf8'}));
const source=fs.readFileSync(path.join(__dirname,'../piloto/wall.js'),'utf8');
class El {
 constructor(data){this.tagName=data.tag;this.attrs={...data.attrs};this.children=[];this.parent=null;this.listeners={};this.style={setProperty(k,v){this[k]=v}};this.isConnected=true;this.clientHeight=370;this.offsetWidth=700;this.paused=true;this.ended=false;this.muted=false;this.volume=1;this.value=this.attrs.value||'';this.checked='checked' in this.attrs;this.disabled='disabled' in this.attrs;this.hidden='hidden' in this.attrs;this.currentTime=0;
  this.dataset=Object.fromEntries(Object.entries(this.attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5),v]));
  this.classList={contains:c=>(this.attrs.class||'').split(/\s+/).includes(c),add:(...cs)=>{this.attrs.class=[...new Set((this.attrs.class||'').split(/\s+/).concat(cs))].join(' ')},remove:(...cs)=>{this.attrs.class=(this.attrs.class||'').split(/\s+/).filter(c=>!cs.includes(c)).join(' ')},toggle:(c,value)=>{const on=value===undefined?!this.classList.contains(c):value;this.classList[on?'add':'remove'](c);return on}};
  for(const c of data.children||[])this.appendChild(typeof c==='string'?new Text(c):new El(c));
  if(this.tagName==='select')this.value=this.querySelector('[selected]')?.attrs.value||this.children[0]?.attrs.value||'';
 }
 appendChild(c){c.parent=this;this.children.push(c);return c}
 replaceChildren(...cs){this.children=[];for(const c of cs)this.appendChild(c)}
 get textContent(){return this.children.map(c=>c.textContent).join('')}
 set textContent(t){this.replaceChildren(new Text(String(t)))}
 setAttribute(k,v){this.attrs[k]=String(v)}
 getAttribute(k){return this.attrs[k]??null}
 removeAttribute(k){delete this.attrs[k]}
 get src(){return this.attrs.src||''}
 set src(v){this.attrs.src=v;this.currentTime=0;this.ended=false;}
 get currentSrc(){return this.src}
 addEventListener(k,f){(this.listeners[k]??=[]).push(f)}
 removeEventListener(k,f){this.listeners[k]=(this.listeners[k]||[]).filter(x=>x!==f)}
 emit(k,extra={}){for(const f of this.listeners[k]||[])f({target:this,preventDefault(){},...extra})}
 click(){if(!this.disabled)this.emit('click')}
 focus(){}
 load(){this.currentTime=0;this.ended=false;this.paused=true;}
 pause(){const changed=!this.paused;this.paused=true;if(changed)this.emit('pause')}
 play(){this.paused=false;this.emit('play');return Promise.resolve()}
 descendants(){return this.children.flatMap(c=>c instanceof El?[c,...c.descendants()]:[])}
 querySelectorAll(s){return this.descendants().filter(el=>matches(el,s))}
 querySelector(s){return this.querySelectorAll(s)[0]||null}
}
class Text{constructor(t){this.textContent=t}}
function single(el,s){if(!(el instanceof El))return false;let ok=true;
 s=s.replace(/\[([^=\]]+)(?:="([^"]*)")?\]/g,(_,k,v)=>{ok=ok&&(v===undefined?k in el.attrs:(el.attrs[k]===v||el[k]===v));return ''});
 s=s.replace(/#([\w-]+)/g,(_,id)=>{ok=ok&&el.attrs.id===id;return ''});
 s=s.replace(/\.([\w-]+)/g,(_,c)=>{ok=ok&&el.classList.contains(c);return ''});
 return ok&&(!s||el.tagName===s);
}
function matches(el,s){const parts=s.trim().replace(/\s*>\s*/g,' > ').split(/\s+/);let i=parts.length-1;if(!single(el,parts[i--]))return false;
 while(i>=0){if(parts[i]==='>'){el=el.parent;i--;if(!single(el,parts[i--]))return false;}else{let p=el.parent;while(p&&!single(p,parts[i]))p=p.parent;if(!p)return false;el=p;i--;}}return true;
}
function setup(reduced=false){
 const doc=new El(fixture),root=doc.querySelector('#tc-mural-videos');doc.hidden=false;doc.getElementById=id=>doc.querySelector('#'+id);doc.createElement=tag=>new El({tag,attrs:{},children:[]});doc.createTextNode=t=>new Text(t);
 let now=0,nextId=1,intervals=new Map();const motion={matches:reduced,listeners:[],addEventListener(k,f){this.listeners.push(f)},removeEventListener(k,f){this.listeners=this.listeners.filter(x=>x!==f)}};
 const win={matchMedia:()=>motion,addEventListener(){}};
 const ctx={document:doc,window:win,performance:{now:()=>now},setInterval:(fn,ms)=>{const id=nextId++;intervals.set(id,{fn,ms,next:now+ms});return id},clearInterval:id=>intervals.delete(id),requestAnimationFrame:()=>1,cancelAnimationFrame(){},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Uint8Array,Intl,Date,Set,console};
 vm.runInNewContext(source,ctx);
 function advance(ms){const end=now+ms;while(true){let soon=Infinity;for(const t of intervals.values())soon=Math.min(soon,t.next);if(soon>end)break;now=soon;for(const t of [...intervals.values()])if(t.next===now){t.next+=t.ms;t.fn();}}now=end;}
 const q=s=>root.querySelector(s),scene=()=>q('.mv-active').dataset.scene,click=a=>q('[data-action="'+a+'"]').click();
 return {root,doc,q,scene,advance,click,motion};
}
const t=setup();assert.equal(t.scene(),'0');
t.advance(16000);assert.equal(t.scene(),'1');t.advance(900);assert.equal(t.q('.mv-burst').children.length,36);assert(t.q('[data-module="birthdays"]').classList.contains('mv-module-focus'));
t.click('rotation');const progress=t.q('.mv-slide-track').textContent;t.advance(20000);assert.equal(t.scene(),'1');assert.equal(t.q('.mv-burst').children.length,36);assert(t.root.classList.contains('mv-paused'));
t.click('next');assert.equal(t.scene(),'2');assert.equal(t.q('.mv-burst').children.length,0);assert(t.q('[data-module="event"]').classList.contains('mv-module-focus'));
t.click('rotation');t.advance(16000);assert.equal(t.scene(),'3');t.advance(900);assert.equal(t.q('.mv-burst').children.length,24);
t.click('quiz');assert.equal(t.scene(),'4');t.advance(6900);assert.equal(t.q('.mv-quiz-timer strong').textContent,'1');assert(!t.q('[data-answer="0"]').disabled);t.advance(100);assert(t.q('[data-answer="0"]').disabled);assert(t.q('[data-answer="0"]').classList.contains('mv-answer-correct'));assert.match(t.q('.mv-quiz-result').textContent,/EQUIPO/);
t.advance(9000);assert.equal(t.scene(),'0');t.click('quiz');assert.match(t.q('.mv-quiz-clue').textContent,/L · A/);t.q('[data-answer="1"]').click();assert.match(t.q('.mv-quiz-result').textContent,/¡Acertaste!/);
t.click('prev');t.click('quiz');t.q('[data-answer="1"]').click();assert.match(t.q('.mv-quiz-result').textContent,/La respuesta es CONECTAR/);
t.click('next');t.doc.hidden=true;t.doc.emit('visibilitychange');t.advance(60000);assert.equal(t.scene(),'0');t.doc.hidden=false;t.doc.emit('visibilitychange');t.advance(16000);assert.equal(t.scene(),'1');
// Local video must finish before automatic advance; pausing the wall pauses it.
t.click('prev');const video=t.q('.mv-hero-video');video.src='blob:test-video';t.click('next');t.click('prev');assert.equal(video.paused,false);t.advance(60000);assert.equal(t.scene(),'0');t.click('rotation');assert.equal(video.paused,true);t.advance(20000);assert.equal(t.scene(),'0');t.click('rotation');video.ended=true;video.emit('ended');assert.equal(t.scene(),'1');
// User motion preference starts paused, but explicit activation still rotates content.
const r=setup(true);assert(r.root.classList.contains('mv-paused'));r.advance(30000);assert.equal(r.scene(),'0');r.click('rotation');r.advance(16900);assert.equal(r.scene(),'1');assert.equal(r.q('.mv-burst').children.length,0);r.click('quiz');r.advance(7000);assert.match(r.q('.mv-quiz-result').textContent,/EQUIPO/);
console.log('PASS: rotation, automatic celebrations, pause/resume, module emphasis, quiz timing, rotating questions, answer choices, background pause, video completion, reduced motion.');

async function playlistChecks(){
 const p=setup(),pv=p.q('.mvp-player');
 assert.equal(p.q('.mvp-list').children.length,2);
 p.advance(5000);const savedScene=p.scene();p.click('video-test');
 await Promise.resolve();
 assert(p.root.classList.contains('mvp-on'));assert.equal(p.q('.mvp-overlay').hidden,false);
 assert.match(p.q('.mvp-player-title').textContent,/Conectamos personas.*1\/2/);
 const firstURL=pv.src;p.advance(4000);assert.equal(p.scene(),savedScene);
 pv.ended=true;pv.emit('ended');await Promise.resolve();
 assert.notEqual(pv.src,firstURL);assert.match(p.q('.mvp-player-title').textContent,/El talento.*2\/2/);
 pv.ended=true;pv.emit('ended');assert.equal(p.q('.mvp-overlay').hidden,true);assert.equal(p.scene(),savedScene);
 // A second complete turn loops back to the first clip.
 p.click('video-test');assert.equal(pv.src,firstURL);p.click('video-return');
 p.q('#mvp-mode').value='one';p.q('#mvp-mode').emit('change');p.q('#mvp-interval').value='30000';p.q('#mvp-interval').emit('change');
 p.advance(29900);assert.equal(p.q('.mvp-overlay').hidden,true);p.advance(100);assert.equal(p.q('.mvp-overlay').hidden,false);assert.match(p.q('.mvp-player-title').textContent,/El talento.*1\/1/);
 pv.ended=true;pv.emit('ended');p.advance(30000);assert.match(p.q('.mvp-player-title').textContent,/Conectamos personas.*1\/1/);
 p.click('rotation');p.advance(60000);assert.equal(pv.paused,true);assert.equal(p.q('.mvp-overlay').hidden,false);p.click('rotation');await Promise.resolve();assert.equal(pv.paused,false);
 p.doc.hidden=true;p.doc.emit('visibilitychange');p.advance(40000);assert.equal(pv.paused,true);p.doc.hidden=false;p.doc.emit('visibilitychange');await Promise.resolve();assert.equal(pv.paused,false);
 p.click('video-return');p.click('video-clear');assert.equal(p.q('[data-action="video-test"]').disabled,true);p.advance(60000);assert.equal(p.q('.mvp-overlay').hidden,true);
 // First upload replaces demos, subsequent uploads append without duplicates.
 const u=setup(),uv=u.q('.mvp-player'),files=u.q('#mvp-files');
 files.files=[{name:'Capacitación.mp4',type:'video/mp4',size:80,lastModified:1},{name:'Equipo.mp4',type:'video/mp4',size:90,lastModified:2}];files.emit('change');
 assert.equal(u.q('.mvp-list').children.length,2);assert.match(u.q('.mvp-list').textContent,/Capacitación/);assert(!u.q('.mvp-list').textContent.includes('Conectamos personas'));
 files.files=[{name:'Equipo.mp4',type:'video/mp4',size:90,lastModified:2}];files.emit('change');assert.equal(u.q('.mvp-list').children.length,2);
 u.root.descendants().find(e=>e.getAttribute('aria-label')==='Bajar Capacitación.mp4').click();assert.match(u.q('.mvp-list').children[0].textContent,/Equipo/);
 u.click('video-test');await Promise.resolve();assert.equal(uv.muted,false);assert.equal(u.q('.mv-audio').volume,.25*.15);
 // A failed clip advances to the other item, then returns to the wall after its end.
 uv.emit('error');await Promise.resolve();assert.match(u.q('.mvp-player-title').textContent,/Capacitación.*2\/2/);
 uv.ended=true;uv.emit('ended');assert.equal(u.q('.mvp-overlay').hidden,true);assert.equal(u.q('.mv-audio').volume,.25);
 // Autoplay denial is surfaced; a user gesture retries the same clip.
 const b=setup(),bv=b.q('.mvp-player'),originalPlay=bv.play.bind(bv);
 bv.play=()=>Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));b.click('video-test');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(b.q('.mvp-retry').hidden,false);assert.match(b.q('.mvp-status').textContent,/bloqueó/);
 bv.play=originalPlay;b.click('video-retry');await Promise.resolve();assert.equal(b.q('.mvp-retry').hidden,true);assert.equal(bv.paused,false);
 b.q('#mvp-enabled').checked=false;b.q('#mvp-enabled').emit('change');bv.ended=true;bv.emit('ended');bv.ended=true;bv.emit('ended');b.advance(1000000);assert.equal(b.q('.mvp-overlay').hidden,true);
 console.log('PASS: playlist order, all/one modes, repeat, interval, original-scene resume, pause/visibility, upload/dedup/reorder, error skip, audio ducking, autoplay retry, disabling, empty list.');
}
playlistChecks().catch(e=>{console.error(e);process.exitCode=1;});
