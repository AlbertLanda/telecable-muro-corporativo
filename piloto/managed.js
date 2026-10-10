(function () {
  'use strict';
  const boot=window.MURO_BOOT,wall=window.TelecableWall;
  if(!boot||!wall)return;
  const root=document.getElementById('tc-mural-videos'),q=s=>root.querySelector(s);
  let current=null,pending=null,plan=[],position=-1,busy=false,closed=false;
  const status=document.createElement('p');status.id='managed-status';status.setAttribute('role','status');
  document.getElementById('pilot-tv-tools').appendChild(status);
  document.getElementById('pilot-sound').textContent='Activar sonido';
  q('.mv-media-note').hidden=true;
  function text(selector,value){q(selector).textContent=value||'';}
  function dateText(value,options){return new Intl.DateTimeFormat('es-PE',Object.assign({timeZone:'America/Lima'},options)).format(new Date(value));}
  function initials(name){return name.trim().split(/\s+/).slice(0,2).map(s=>s.charAt(0)).join('').toUpperCase();}
  function renderSidebar(data){
    const birthdays=data.birthdays||[],events=(data.contents||[]).filter(c=>c.kind==='event');
    const event=events.slice().sort((a,b)=>new Date(a.event_at)-new Date(b.event_at)).find(e=>new Date(e.event_at)>=new Date(data.server_time||Date.now()))||events[0];
    const moduleCount=[birthdays.length,event,data.config.qr_enabled,data.music_url].filter(Boolean).length;
    const section=q('[data-module="birthdays"]');
    section.hidden=!birthdays.length;
    Array.from(section.querySelectorAll('.mv-birthday-row')).forEach(el=>el.remove());
    // Keep the TV rail legible when several modules are enabled. All today's
    // birthdays still receive their own full-width card in the main program.
    birthdays.slice(0,moduleCount>=3?2:3).forEach(person=>{
      const row=document.createElement('div'),avatar=document.createElement('span'),info=document.createElement('div'),name=document.createElement('strong'),department=document.createElement('small'),label=document.createElement('em');
      row.className='mv-birthday-row'+(person.is_today?' mv-today':'');avatar.textContent=initials(person.name);name.textContent=person.name;department.textContent=person.department;
      label.textContent=person.is_today?'HOY':String(person.day).padStart(2,'0')+'/'+String(person.month).padStart(2,'0');
      info.appendChild(name);info.appendChild(department);row.appendChild(avatar);row.appendChild(info);row.appendChild(label);section.insertBefore(row,section.querySelector('p'));
    });
    q('[data-module="weather"]').hidden=true;
    const hasRail=!!(birthdays.length||event||data.config.qr_enabled||data.music_url);
    q('.mv-grid').classList.toggle('mv-no-sidebar',!hasRail);
    root.classList.toggle('mv-rail-dense',!!(birthdays.length&&event&&data.config.qr_enabled&&data.music_url));
    root.classList.toggle('mv-rail-busy',moduleCount>=3);
    q('[data-module="event"]').hidden=!event;
    if(event){
      text('.mv-next-event h2',event.title);text('.mv-next-event p',dateText(event.event_at,{hour:'2-digit',minute:'2-digit'})+' · '+event.location);
      text('.mv-next-event .mv-date-box small',dateText(event.event_at,{month:'short'}).toUpperCase());text('.mv-next-event .mv-date-box strong',dateText(event.event_at,{day:'2-digit'}));
    }
    q('[data-module="qr"]').hidden=!data.config.qr_enabled;
    q('.mv-music-strip').hidden=!data.music_url;
    const noBottom=!event&&!data.config.qr_enabled&&!data.music_url;
    q('.mv-bottom-modules').hidden=noBottom;root.classList.toggle('no-bottom',noBottom);
    return event?event.event_at:null;
  }
  function apply(data){
    current=data;position=-1;
    data.config=data.config||{};
    const eventDate=renderSidebar(data);
    wall.configure({config:data.config,eventDate:eventDate,music_url:data.music_url,videos:data.contents.filter(c=>c.kind==='video')});
    text('.mv-channel strong',data.config.name||'Somos Telecable');
    text('.mv-footer>span:last-child',data.preview?'BORRADOR · SIN PUBLICAR':'PUBLICADO · V'+data.version);
    plan=data.contents.filter(c=>c.kind!=='video').map(c=>({scene:c.kind==='event'?2:c.kind==='recognition'?3:0,item:c}));
    (data.birthdays||[]).filter(b=>b.is_today).forEach(b=>plan.push({scene:1,item:b}));
    if(!plan.length)plan.push({scene:0,item:{title:data.version===0?'Esperando la primera publicación':data.config.welcome_title,body:data.version===0?'El contenido aparecerá cuando Imagen publique el muro.':data.config.welcome_body,duration:16}});
    if(data.config.quiz_enabled)plan.push({scene:4,item:{duration:16}});
    status.textContent=data.preview?'Borrador guardado · actualización automática cada 30 s. Esta vista no publica en las TV.':'Versión '+data.version+' aplicada · consulta automática cada 30 s.';
  }
  function next(){
    if(pending){const update=pending;pending=null;apply(update);}
    if(!plan.length)return;
    position=(position+1)%plan.length;
    const entry=plan[position],item=entry.item,base='.mv-scene[data-scene="'+entry.scene+'"] ';
    root.classList.toggle('mv-birthday-focus',entry.scene===1);
    root.classList.toggle('mv-message-focus',entry.scene===0&&!item.url);
    root.classList.toggle('mv-copy-long',(item.title||'').length>65||(item.body||'').length>180);
    root.classList.toggle('mv-birthday-long',entry.scene===1&&((item.name||'').length>45||(item.department||'').length>45||((item.name||'')+(item.department||'')+(item.greeting||'')).length>200));
    const labels=['Nuestro equipo','Celebramos contigo','Agenda del equipo','Orgullo Telecable','Un minuto para conectar'];
    const program=q('.mv-program');
    if(program){
      program.hidden=false;
      text('.mv-program-label',entry.scene===0&&!item.url?'Comunicación interna':labels[entry.scene]);
      text('.mv-program-count',String(position+1).padStart(2,'0')+' / '+String(plan.length).padStart(2,'0'));
    }
    if(entry.scene===0){
      const image=q('.mv-hero-photo');image.hidden=!item.url;
      if(item.url){image.src=item.url;image.alt=item.title;}
      else{image.removeAttribute('src');image.alt='';}
      text('.mv-photo-copy h1',item.title);text('.mv-photo-copy p',item.body);text('.mv-photo-tags>span',current.config.name||'TELECABLE');
      text('.mv-photo-copy>span','COMUNICACIÓN INTERNA');
    }else if(entry.scene===1){
      text(base+'h1','¡Feliz cumpleaños!');
      text(base+'.mv-overline',dateText(Date.UTC(2000,item.month-1,item.day,12),{day:'numeric',month:'long'}));
      text(base+'.mv-description',item.greeting||'Que este nuevo año te traiga alegría, nuevos logros y muchos momentos para celebrar. ¡Gracias por ser parte del equipo!');
      text(base+'.mv-nameplate>span',initials(item.name));text(base+'.mv-nameplate strong',item.name);text(base+'.mv-nameplate small',item.department);text(base+'.mv-medallion>span',initials(item.name));
      text(base+'[data-action="celebrate"]','Celebrar con '+item.name.split(/\s+/)[0]+' ✦');
      q(base+'.mv-nameplate').classList.toggle('mv-long-name',item.name.length>45);
      const photo=q(base+'.mv-birthday-photo'),fallback=q(base+'.mv-medallion>span');
      photo.hidden=true;photo.removeAttribute('src');fallback.hidden=false;
      if(item.photo_url){
        photo.onload=()=>{photo.hidden=false;fallback.hidden=true;};
        photo.onerror=()=>{photo.hidden=true;fallback.hidden=false;};
        photo.alt='Foto de '+item.name;photo.src=item.photo_url;
      }else{photo.onload=null;photo.onerror=null;photo.alt='';}
    }else if(entry.scene===2){
      text(base+'h1',item.title);text(base+'.mv-description',item.body);text(base+'.mv-overline','Nos encontramos.');
      text(base+'.mv-event-meta strong',dateText(item.event_at,{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}));text(base+'.mv-event-meta>span',item.location);
      text(base+'.mv-calendar-art>span',dateText(item.event_at,{month:'long'}).toUpperCase());text(base+'.mv-calendar-art>strong',dateText(item.event_at,{day:'2-digit'}));text(base+'.mv-calendar-art>small',dateText(item.event_at,{weekday:'long'}).toUpperCase());
    }else if(entry.scene===3){text(base+'h1',item.title);text(base+'.mv-description',item.body);}
    wall.showScene(entry.scene,item.duration||16);
    document.body.classList.add('ready');
  }
  wall.onBoundary(next,()=>!!pending);
  pending=boot.manifest;next();
  async function poll(){
    if(!boot.poll_url||busy||closed||document.hidden)return;
    busy=true;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(boot.poll_url,{cache:'no-store',credentials:'same-origin',signal:controller.signal,headers:{'If-None-Match':'"'+current.signature+'"'}});
      if(response.status===401||response.status===403||response.status===404||response.redirected){
        status.textContent=boot.poll_url.indexOf('/panel/')===0?'Esta vista ya no está disponible. Vuelve al panel e inicia sesión para abrirla de nuevo.':'El enlace de esta pantalla dejó de estar habilitado. Solicita uno nuevo a TI.';
        closed=true;
        wall.stop();
        const exit=document.exitFullscreen||document.webkitExitFullscreen;
        if(exit){try{Promise.resolve(exit.call(document)).catch(()=>{});}catch(error){}}
        document.body.classList.remove('ready');
        document.getElementById('pilot-tv-tools').hidden=false;
        return;
      }
      if(response.status===304){pending=null;status.textContent='Conectado · '+(current.preview?'borrador guardado':'versión '+current.version)+' · revisión cada 30 s.';return;}
      if(response.status===422){status.textContent='El borrador tiene un archivo pendiente de corregir. Revísalo en el panel; se conserva la última vista válida.';return;}
      if(!response.ok)throw new Error('manifest');
      const update=await response.json();
      if(update.signature!==current.signature){pending=update;status.textContent='Actualización recibida; se aplicará en la siguiente transición.';}
      else{pending=null;status.textContent='Conectado · '+(current.preview?'borrador guardado':'versión '+current.version)+' · revisión cada 30 s.';}
    }catch(error){status.textContent='Sin conexión con el servidor. Se conserva la versión recibida; los archivos nuevos requieren conexión.';}
    finally{busy=false;clearTimeout(timeout);}
  }
  const timer=setInterval(poll,30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
  window.addEventListener('online',poll);
  window.addEventListener('pageshow',event=>{if(event.persisted)poll();});
  window.addEventListener('pagehide',event=>{if(!event.persisted){closed=true;clearInterval(timer);}});
})();
