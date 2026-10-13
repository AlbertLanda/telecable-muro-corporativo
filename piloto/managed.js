(function () {
  'use strict';
  const boot=window.MURO_BOOT,wall=window.TelecableWall;
  if(!boot||!wall)return;
  const root=document.getElementById('tc-mural-videos'),q=s=>root.querySelector(s);
  let current=null,pending=null,plan=[],projects=[],position=-1,busy=false,closed=false,hasStandardRail=false;
  const status=document.createElement('p');status.id='managed-status';status.setAttribute('role','status');
  document.getElementById('pilot-tv-tools').appendChild(status);
  const soundPrompt=document.getElementById('player-sound-prompt'),soundButton=document.getElementById('player-enable-sound');
  wall.onSoundChange(state=>{
    const available=state.available&&!closed;
    soundPrompt.hidden=!available||(state.enabled&&!state.error);
    soundButton.textContent=state.error?'Reintentar sonido':'Activar sonido';
    document.getElementById('player-sound-message').textContent=state.error||'Activa la música y el audio de los videos con un clic o con OK.';
    document.getElementById('pilot-sound').textContent=state.enabled&&!state.error?'Silenciar sonido':'Activar sonido';
    document.getElementById('pilot-sound').disabled=!available;
  });
  soundButton.addEventListener('click',()=>{wall.startMusic();if(soundPrompt.hidden&&soundButton.blur)soundButton.blur();});
  document.addEventListener('keydown',event=>{
    if((event.key==='Enter'||event.keyCode===13)&&!soundPrompt.hidden&&
       (!document.activeElement||document.activeElement===document.body)){
      event.preventDefault();wall.startMusic();
    }
  });
  q('.mv-media-note').hidden=true;
  let imageSequence=0,nextPhotos=[];
  function showPhoto(photo,url,alt){
    const ticket=++imageSequence;photo._muroImageTicket=ticket;
    photo.hidden=true;photo.onload=null;photo.onerror=null;photo.removeAttribute('src');photo.alt=alt||'';
    if(!url)return;
    const reveal=()=>{if(photo._muroImageTicket===ticket)photo.hidden=false;};
    photo.onerror=()=>{if(photo._muroImageTicket===ticket)photo.hidden=true;};
    photo.onload=()=>{
      if(photo._muroImageTicket!==ticket)return;
      if(typeof photo.decode==='function')photo.decode().then(reveal).catch(()=>{});else reveal();
    };
    photo.src=url;
    if(photo.complete&&photo.naturalWidth>0)photo.onload();
  }
  function preloadNext(){
    const following=plan[(position+1)%plan.length];nextPhotos=[];
    if(!following)return;
    const item=following.item;
    const urls=item.kind==='project_group'?item.projects.map(p=>p.url):[item.kind==='video'?null:item.photo_url||item.url];
    urls.filter(Boolean).forEach(url=>{const photo=document.createElement('img');photo.src=url;nextPhotos.push(photo);});
  }
  function text(selector,value){q(selector).textContent=value||'';}
  function dateText(value,options){return new Intl.DateTimeFormat('es-PE',Object.assign({timeZone:'America/Lima'},options)).format(new Date(value));}
  function initials(name){return name.trim().split(/\s+/).slice(0,2).map(s=>s.charAt(0)).join('').toUpperCase();}
  function renderSidebar(data){
    const birthdays=data.birthdays||[],events=(data.contents||[]).filter(c=>c.kind==='event'||c.kind==='field_event');
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
    hasStandardRail=hasRail;
    q('.mv-grid').classList.toggle('mv-no-sidebar',!hasRail);
    root.classList.toggle('mv-rail-dense',!!(birthdays.length&&event&&data.config.qr_enabled&&data.music_url));
    root.classList.toggle('mv-rail-busy',moduleCount>=3);
    q('[data-module="event"]').hidden=!event;
    if(event){
      text('.mv-next-event .mv-section-label',event.kind==='field_event'?'EN CAMPO':'AGENDA DEL EQUIPO');
      text('.mv-next-event h2',event.title);text('.mv-next-event p',dateText(event.event_at,{hour:'2-digit',minute:'2-digit'})+' · '+event.location);
      text('.mv-next-event .mv-date-box small',dateText(event.event_at,{month:'short'}).toUpperCase());text('.mv-next-event .mv-date-box strong',dateText(event.event_at,{day:'2-digit'}));
    }
    q('[data-module="qr"]').hidden=!data.config.qr_enabled;
    q('.mv-music-strip').hidden=!data.music_url;
    const noBottom=!event&&!data.config.qr_enabled&&!data.music_url;
    q('.mv-bottom-modules').hidden=noBottom;root.classList.toggle('no-bottom',noBottom);
    return event?event.event_at:null;
  }
  function reportedProgress(item){
    return Number.isInteger(item.progress_percent)&&item.progress_percent>=0&&item.progress_percent<=100?item.progress_percent:null;
  }
  function renderProjectBoard(item){
    const board=q('.mv-project-board');board.replaceChildren();
    board.className='mv-project-board mv-project-count-'+item.projects.length;
    item.projects.forEach(project=>{
      const tile=document.createElement('article'),photo=document.createElement('img'),copy=document.createElement('div');
      const label=document.createElement('span'),heading=document.createElement('h2'),value=document.createElement('strong'),date=document.createElement('small');
      const bar=document.createElement('div'),fill=document.createElement('i'),progress=reportedProgress(project);
      tile.className='mv-project-tile';copy.className='mv-project-tile-copy';
      photo.className='mv-project-tile-photo';showPhoto(photo,project.url,'');
      label.className='mv-project-tile-label';label.textContent=project.featured?'PROYECTO DESTACADO':'PROYECTO';
      heading.textContent=project.title;
      value.className='mv-project-tile-percent'+(progress===null?' mv-unknown':'');value.textContent=progress===null?'Sin avance reportado':progress+'%';
      date.className='mv-project-tile-date';
      date.textContent=progress!==null&&project.progress_as_of?'Reporte: '+dateText(project.progress_as_of+'T12:00:00-05:00',{day:'2-digit',month:'2-digit',year:'numeric'}):'';
      bar.className='mv-project-tile-bar';bar.hidden=progress===null;
      bar.setAttribute('aria-label','Avance de '+project.title);bar.setAttribute('role','progressbar');
      if(progress!==null){bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.setAttribute('aria-valuenow',String(progress));}
      fill.style.setProperty('--project-progress',progress===null?0:progress/100);bar.appendChild(fill);
      [label,heading,value,bar,date].forEach(el=>copy.appendChild(el));
      tile.appendChild(photo);tile.appendChild(copy);board.appendChild(tile);
    });
    text('.mv-project-page',String(item.start+1)+'–'+(item.start+item.projects.length)+' de '+projects.length+' proyectos');
  }
  function apply(data){
    current=data;position=-1;
    data.config=data.config||{};
    projects=data.contents.filter(c=>c.kind==='project');
    projects=projects.filter(c=>c.featured).concat(projects.filter(c=>!c.featured));
    const eventDate=renderSidebar(data);
    wall.configure({carousel:true,config:data.config,eventDate:eventDate,music_url:data.music_url,music_tracks:data.music_tracks,videos:data.contents.filter(c=>c.kind==='video')});
    text('.mv-channel strong',data.config.name||'Somos Telecable');
    text('.mv-footer>span:last-child',data.demo?'DEMOSTRACIÓN · DATOS FICTICIOS':data.preview?'BORRADOR · SIN PUBLICAR':'PUBLICADO · V'+data.version);
    plan=[];let grouped=false;
    data.contents.forEach(item=>{
      if(item.kind==='project'){
        if(grouped)return;grouped=true;
        for(let start=0;start<projects.length;start+=4){
          const group=projects.slice(start,start+4);
          plan.push({scene:5,item:{kind:'project_group',projects:group,start:start,duration:Math.max(...group.map(p=>p.duration||16))}});
        }
      }else plan.push({scene:item.kind==='event'?2:item.kind==='recognition'?3:0,item:item});
    });
    (data.birthdays||[]).filter(b=>b.is_today).forEach(b=>plan.push({scene:1,item:b}));
    if(!plan.length)plan.push({scene:0,item:{title:data.version===0?'Esperando la primera publicación':data.config.welcome_title,body:data.version===0?'El contenido aparecerá cuando Imagen publique el muro.':data.config.welcome_body,duration:16}});
    if(data.config.qr_enabled)plan.push({scene:6,item:{duration:12}});
    if(data.config.quiz_enabled)plan.push({scene:4,item:{duration:16}});
    status.textContent=data.preview?'Borrador guardado · actualización automática cada 30 s. Esta vista no publica en las TV.':'Versión '+data.version+' aplicada · consulta automática cada 30 s.';
  }
  function next(){
    if(pending){const update=pending;pending=null;apply(update);}
    if(!plan.length)return;
    position=(position+1)%plan.length;
    const entry=plan[position],item=entry.item,base='.mv-scene[data-scene="'+entry.scene+'"] ';
    const isProject=item.kind==='project_group',isCulture=item.kind==='culture',isField=item.kind==='field_event',isTeam=item.kind==='team',isVideo=item.kind==='video';
    root.classList.toggle('mv-project-focus',isProject);
    q('.mv-project-overview').hidden=true;
    root.classList.toggle('mv-team-focus',isTeam);
    root.classList.toggle('mv-culture-focus',isCulture);
    root.classList.toggle('mv-field-focus',isField);
    q('.mv-grid').classList.add('mv-no-sidebar');
    root.classList.toggle('mv-birthday-focus',entry.scene===1);
    root.classList.toggle('mv-message-focus',entry.scene===0&&(!item.url||isVideo)&&!isCulture&&!isField&&!isTeam);
    root.classList.toggle('mv-copy-long',(item.title||'').length>65||(item.body||'').length>180);
    root.classList.toggle('mv-birthday-long',entry.scene===1&&((item.name||'').length>45||(item.department||'').length>45||((item.name||'')+(item.department||'')+(item.greeting||'')).length>200));
    const labels=['Nuestro equipo','Celebramos contigo','Agenda del equipo','Orgullo Telecable','Un minuto para conectar','Proyectos de la empresa','Conoce Telecable'];
    const program=q('.mv-program');
    if(program){
      program.hidden=false;
      text('.mv-program-label',isProject?'Proyectos de la empresa':isCulture?'Nuestra cultura':isField?'Telecable en campo':isTeam?'Nuestros equipos':isVideo?'Videos del equipo':entry.scene===0&&!item.url?'Comunicación interna':labels[entry.scene]);
      text('.mv-program-count',String(position+1).padStart(2,'0')+' / '+String(plan.length).padStart(2,'0'));
    }
    if(entry.scene===0){
      showPhoto(q('.mv-hero-photo'),isVideo?null:item.url,item.title);
      text('.mv-photo-copy h1',item.title);text('.mv-photo-copy p',item.body);text('.mv-photo-tags>span',current.config.name||'TELECABLE');
      text('.mv-photo-copy>span',isProject?(item.featured?'PROYECTO DESTACADO':'NUESTROS PROYECTOS'):isCulture?'CULTURA ORGANIZACIONAL':isField?'EVENTOS EN CAMPO':isTeam?'NUESTROS EQUIPOS':isVideo?'VIDEOS DEL EQUIPO':'COMUNICACIÓN INTERNA');
      q('.mv-project-metric').hidden=true;
      q('.mv-field-meta').hidden=!isField;
      const roles=q('.mv-team-roles');roles.hidden=!isTeam;roles.replaceChildren();
      if(isTeam)(item.team_roles||'').split(',').map(role=>role.trim()).filter(Boolean).slice(0,3).forEach(role=>{
        const tag=document.createElement('span');tag.textContent=role;roles.appendChild(tag);
      });
      if(isField){
        text('.mv-field-date',dateText(item.event_at,{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}));
        text('.mv-field-location',item.location||'');
      }
    }else if(entry.scene===5){
      renderProjectBoard(item);
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
    if(isVideo)wall.showVideo(item.id);
    document.body.classList.add('ready');
    preloadNext();
  }
  wall.onBoundary(next,()=>!!pending);
  pending=boot.manifest;next();
  // One attempt on entry. Publication refreshes never override a user's mute.
  wall.startMusic();
  async function poll(){
    if(!boot.poll_url||busy||closed||document.hidden)return;
    busy=true;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(boot.poll_url,{cache:'no-store',credentials:'same-origin',signal:controller.signal,headers:{'If-None-Match':'"'+current.signature+'"'}});
      if(response.status===401||response.status===403||response.status===404||response.redirected){
        status.textContent=boot.poll_url.indexOf('/panel/')===0?'Esta vista ya no está disponible. Vuelve al panel e inicia sesión para abrirla de nuevo.':'El enlace de esta pantalla dejó de estar habilitado. Solicita uno nuevo a TI.';
        closed=true;
        soundPrompt.hidden=true;
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
