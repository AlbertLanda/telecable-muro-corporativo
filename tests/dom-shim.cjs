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
 get id(){return this.attrs.id||''}
 set id(v){this.attrs.id=v}
 get className(){return this.attrs.class||''}
 set className(v){this.attrs.class=v}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this)}
 insertBefore(c,ref){c.parent=this;const at=this.children.indexOf(ref);if(at<0)this.children.push(c);else this.children.splice(at,0,c);return c}
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
 s=s.replace(/:last-child/g,()=>{ok=ok&&el.parent.children.filter(c=>c instanceof El).at(-1)===el;return '';});
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
 const win={matchMedia:()=>motion,addEventListener(){}};doc.body=doc.querySelector('body');
 const ctx={document:doc,window:win,performance:{now:()=>now},setInterval:(fn,ms)=>{const id=nextId++;intervals.set(id,{fn,ms,next:now+ms});return id},clearInterval:id=>intervals.delete(id),requestAnimationFrame:()=>1,cancelAnimationFrame(){},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Uint8Array,Intl,Date,Set,console};
 vm.runInNewContext(source,ctx);
 function advance(ms){const end=now+ms;while(true){let soon=Infinity;for(const t of intervals.values())soon=Math.min(soon,t.next);if(soon>end)break;now=soon;for(const t of [...intervals.values()])if(t.next===now){t.next+=t.ms;t.fn();}}now=end;}
 const q=s=>root.querySelector(s),scene=()=>q('.mv-active').dataset.scene,click=a=>q('[data-action="'+a+'"]').click();
 return {root,doc,q,scene,advance,click,motion,win,run:(code,extra={})=>vm.runInNewContext(code,Object.assign(ctx,extra))};
}

module.exports={setup};
