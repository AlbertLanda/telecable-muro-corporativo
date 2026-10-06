(function(){
  'use strict';
  const root=document.getElementById('tc-mural-videos');
  if(!root)return;
  const q=s=>root.querySelector(s);
  const qa=s=>Array.from(root.querySelectorAll(s));
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const scenes=qa('.mv-scene'),fills=qa('.mv-slide-track i');
  const sceneNames=['Nuestro equipo','Cumpleaños','Evento','Reconocimiento','Reto de palabras'];
  const video=q('.mv-hero-video');
  const playlistVideo=q('.mvp-player');
  let playlistActive=false,playlistWasPlaying=false;
  const tickerMessages=['Esta semana aprendemos juntos: taller de atención al cliente.','Celebramos a las personas que hacen posible cada conexión.','Jueves 08 · 9:00 a. m. · Sala de capacitación.','Gracias, equipo técnico, por su compromiso en cada conexión.','Una pequeña pausa para pensar juntos. ¿Ya encontraste la palabra?'];
  const secondMessages=['Nuestra mejor conexión empieza con las personas.','Un nuevo año de historias, aprendizajes y buenos momentos.','Trae tus ideas. Cada experiencia suma al equipo.','Cada visita, cada instalación, cada solución cuenta.','Comparte tu respuesta con quien tienes al lado.'];
  const sceneNotes=['SOMOS EQUIPO','¡FELIZ CUMPLEAÑOS!','NOS ENCONTRAMOS','GRACIAS POR CONECTARNOS','PIÉNSALO EN EQUIPO'];
  const quizzes=[
    {letters:'O · P · I · Q · E · U',options:['Equipo','Empleo'],correct:0,message:'EQUIPO. Juntos conectamos oportunidades.'},
    {letters:'L · A · T · E · N · O · T',options:['Trabajo','Talento'],correct:1,message:'TALENTO. Lo mejor de Telecable está en su gente.'},
    {letters:'C · R · A · O · N · E · C · T',options:['Conectar','Compartir'],correct:0,message:'CONECTAR. Personas, ideas y oportunidades.'}
  ];
  let scene=0,elapsed=0,lastTick=performance.now(),paused=reduced.matches,burstClearAt=0;
  let cues=new Set(),quizIndex=-1,quizRevealed=false,quizChoice=null,videoWasPlaying=false;
  let duration=16000;
  function sceneDuration(){return scene===4?Math.max(duration,15000):duration;}
  function progress(){fills.forEach((f,i)=>{f.style.transform='scaleX('+(i<scene?1:i===scene?Math.min(1,elapsed/sceneDuration()):0)+')';});}
  function setTicker(message){
    const el=q('.mv-ticker-message');el.textContent=message;
    el.classList.remove('mv-ticker-enter');void el.offsetWidth;el.classList.add('mv-ticker-enter');
  }
  function resetQuiz(){
    quizIndex=(quizIndex+1)%quizzes.length;quizRevealed=false;quizChoice=null;
    const quiz=quizzes[quizIndex];q('.mv-quiz-clue').textContent=quiz.letters;
    q('.mv-quiz-clue').setAttribute('aria-label','Letras: '+quiz.letters.split(' · ').join(', '));
    qa('[data-answer]').forEach((button,i)=>{button.querySelector('strong').textContent=quiz.options[i];button.querySelector('.mv-answer-mark').textContent='';button.disabled=false;button.classList.remove('mv-answer-correct','mv-answer-chosen');button.setAttribute('aria-pressed','false');});
    q('.mv-quiz-result').classList.remove('mv-revealed');
    q('.mv-quiz-result').textContent='Piensa tu respuesta. Se revelará automáticamente.';
    q('.mv-quiz-timer').replaceChildren(document.createTextNode('Respuesta en '),Object.assign(document.createElement('strong'),{textContent:'7'}),document.createTextNode(' s'));
  }
  function revealQuiz(choice=null){
    if(quizRevealed||scene!==4)return;
    quizRevealed=true;quizChoice=choice;const quiz=quizzes[quizIndex];
    qa('[data-answer]').forEach((button,i)=>{button.disabled=true;button.classList.toggle('mv-answer-correct',i===quiz.correct);button.classList.toggle('mv-answer-chosen',i===choice);button.setAttribute('aria-pressed',String(i===choice));if(i===quiz.correct)button.querySelector('.mv-answer-mark').textContent='✓';});
    q('.mv-quiz-timer').textContent='Respuesta revelada';
    q('.mv-quiz-result').textContent=(choice===null?'':choice===quiz.correct?'¡Acertaste! ':'La respuesta es ')+quiz.message;
    q('.mv-quiz-result').classList.add('mv-revealed');
  }
  function rotate(index){
    const previous=scene;scene=(index+scenes.length)%scenes.length;elapsed=0;lastTick=performance.now();cues=new Set();
    root.classList.toggle('mv-static-entry',paused);
    burstClearAt=0;q('.mv-burst').replaceChildren();q('.mv-auto-note').classList.remove('mv-note-visible');
    scenes.forEach((s,i)=>{s.classList.toggle('mv-leaving',i===previous&&previous!==scene);s.classList.toggle('mv-active',i===scene);s.setAttribute('aria-hidden',String(i!==scene));if(i===scene)s.removeAttribute('inert');else s.setAttribute('inert','');});
    q('.mv-current-scene').textContent=sceneNames[scene]+' · '+(scene+1)+'/'+scenes.length;
    q('.mv-stage').style.setProperty('--mv-scene-time',sceneDuration()+'ms');
    q('.mv-stage').style.setProperty('--mva-confetti-fall',(q('.mv-stage').clientHeight+60)+'px');
    q('[data-module="birthdays"]').classList.toggle('mv-module-focus',scene===1);
    q('[data-module="event"]').classList.toggle('mv-module-focus',scene===2);
    setTicker(tickerMessages[scene]);if(scene===4)resetQuiz();
    root.classList.toggle('mv-video-visible',scene===0&&!!video.getAttribute('src'));
    if(video.getAttribute('src')){
      if(scene!==0)video.pause();
      else if(!paused&&!playlistActive){if(video.ended)video.currentTime=0;video.play().catch(()=>{q('.mv-editor-status').textContent='Video listo. Pulsa reproducir en el video para iniciarlo.';});}
    }
    progress();
  }
  function rotationState(){q('[data-action="rotation"]').textContent=paused?'Activar automático':'Pausar animación';q('[data-action="rotation"]').setAttribute('aria-pressed',String(paused));root.classList.toggle('mv-paused',paused||document.hidden);if(!paused)root.classList.remove('mv-static-entry');}
  function burst(count=36){
    q('.mv-burst').replaceChildren();
    if(reduced.matches)return;
    const colors=['#d9c697','#aac5b7','#f6f2e8','#78988b'];
    for(let i=0;i<count;i++){const piece=document.createElement('span');piece.style.left=(i*100/count)+'%';piece.style.background=colors[i%4];piece.style.animationDelay=((i%7)*.08)+'s';piece.style.animationDuration=(3+(i%5)*.23)+'s';piece.style.width=(4+i%5)+'px';piece.style.setProperty('--mva-confetti-dx',(i%2?35:-35)+'px');q('.mv-burst').appendChild(piece);}
    burstClearAt=elapsed+5500;
  }
  function choreography(){
    if(elapsed>=850&&!cues.has('celebration')){cues.add('celebration');if(scene===1)burst();if(scene===3)burst(24);}
    if(elapsed>=1800&&!cues.has('note')){cues.add('note');q('.mv-auto-note strong').textContent=sceneNotes[scene];q('.mv-auto-note').classList.add('mv-note-visible');}
    if(elapsed>=9000&&!cues.has('ticker')){cues.add('ticker');setTicker(secondMessages[scene]);}
    if(elapsed>=sceneDuration()-4000&&!cues.has('next')){cues.add('next');q('.mv-auto-note strong').textContent='SIGUE · '+sceneNames[(scene+1)%scenes.length].toUpperCase();}
    if(burstClearAt&&elapsed>=burstClearAt){q('.mv-burst').replaceChildren();burstClearAt=0;}
    if(scene===4&&!quizRevealed){if(elapsed>=7000)revealQuiz();else q('.mv-quiz-timer strong').textContent=String(Math.ceil((7000-elapsed)/1000));}
  }
  q('[data-action="prev"]').addEventListener('click',()=>rotate(scene-1));
  q('[data-action="next"]').addEventListener('click',()=>rotate(scene+1));
  q('[data-action="quiz"]').addEventListener('click',()=>rotate(4));
  qa('[data-answer]').forEach(button=>button.addEventListener('click',()=>revealQuiz(Number(button.dataset.answer))));
  q('[data-action="rotation"]').addEventListener('click',()=>{paused=!paused;lastTick=performance.now();rotationState();if(playlistActive){if(paused)playlistVideo.pause();else playPlaylistVideo();}else if(scene===0&&video.getAttribute('src')){if(paused)video.pause();else if(video.ended)rotate(1);else video.play().catch(()=>{q('.mv-editor-status').textContent='Pulsa reproducir en el video.';});}renderSchedule();});
  q('[data-action="celebrate"]').addEventListener('click',()=>{burst();q('.mv-current-scene').textContent='¡Feliz cumpleaños, Valeria!';});
  q('[data-action="applaud"]').addEventListener('click',()=>{burst();q('.mv-current-scene').textContent='¡Un aplauso para el equipo!';});
  function updateClock(){
    const now=new Date();q('.mv-clock time').textContent=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);q('.mv-clock time').setAttribute('datetime',now.toISOString());q('.mv-clock>span').textContent=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'long',day:'numeric',month:'long'}).format(now);
    const diff=new Date('2026-10-08T09:00:00-05:00').getTime()-now.getTime();
    if(diff<=0)q('.mv-countdown').textContent='Evento de ejemplo finalizado';
    else{const total=Math.floor(diff/60000),days=Math.floor(total/1440),hours=Math.floor(total%1440/60),minutes=total%60;q('.mv-countdown').textContent='Faltan '+days+' d · '+hours+' h · '+minutes+' min';}
  }
  function onVisibility(){lastTick=performance.now();rotationState();if(document.hidden){videoWasPlaying=!video.paused;playlistWasPlaying=playlistActive&&!playlistVideo.paused;video.pause();playlistVideo.pause();}else{updateClock();if(playlistWasPlaying&&!paused&&playlistActive)playPlaylistVideo();else if(videoWasPlaying&&!paused&&!playlistActive&&scene===0&&video.getAttribute('src'))video.play().catch(()=>{});videoWasPlaying=false;playlistWasPlaying=false;}}
  function onMotionChange(e){if(e.matches){paused=true;rotationState();video.pause();playlistVideo.pause();q('.mv-burst').replaceChildren();renderSchedule();}}
  document.addEventListener('visibilitychange',onVisibility);
  if(reduced.addEventListener)reduced.addEventListener('change',onMotionChange);
  const sceneTimer=setInterval(()=>{if(!root.isConnected){cleanup();return;}const now=performance.now(),dt=Math.min(now-lastTick,1000);lastTick=now;if(paused||document.hidden)return;playlistTick(dt);if(playlistActive)return;if(scene===0&&video.getAttribute('src')){if(video.ended)rotate(1);return;}elapsed+=dt;if(elapsed>=sceneDuration())rotate(scene+1);else{choreography();progress();}},100);
  const clockTimer=setInterval(()=>{if(!document.hidden)updateClock();},1000);

  // Audio stays local: an original synthesized demo or user-selected audio files.
  const audio=q('.mv-audio'),playButton=q('[data-action="play"]'),status=q('.mv-audio-status');
  let context=null,master=null,analyser=null,mediaSource=null,synthBus=null,delayNode=null;
  let mode='demo',playing=false,tracks=[],trackIndex=0,scheduled=[],musicTimer=null,nextBeat=0,beatIndex=0,busy=false;
  let generation=0,animFrame=0,cleaned=false;
  const bars=[];
  for(let i=0;i<22;i++){const bar=document.createElement('span');q('.mv-spectrum').appendChild(bar);bars.push(bar);}
  const volume=()=>Number(q('#mv-volume').value)/100;
  const mixedVolume=()=>volume()*([video,playlistVideo].some(v=>!v.paused&&!v.muted&&!v.ended&&v.volume>0) ? .15 : 1);
  function applyMix(){if(master&&context)master.gain.setTargetAtTime(mixedVolume(),context.currentTime,.12);if(!mediaSource)audio.volume=mixedVolume();}
  function setPlaying(value){playing=value;root.classList.toggle('mv-playing',value);playButton.textContent=value?'Pausar música':mode==='demo'?'Escuchar demo':'Reproducir';q('.mv-now-label').textContent='MÚSICA DE FONDO · '+(value?'SONANDO':'EN PAUSA');}
  async function setupAudio(){
    if(!context){
      const AudioContextClass=window.AudioContext||window.webkitAudioContext;
      if(!AudioContextClass)throw new Error('Este navegador no admite la demo instrumental. Prueba con archivos MP3.');
      context=new AudioContextClass();master=context.createGain();master.gain.value=mixedVolume();analyser=context.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.8;
      master.connect(analyser);analyser.connect(context.destination);
      synthBus=context.createGain();synthBus.gain.value=.75;synthBus.connect(master);
      delayNode=context.createDelay(.7);delayNode.delayTime.value=.29;const feedback=context.createGain();feedback.gain.value=.19;const wet=context.createGain();wet.gain.value=.17;synthBus.connect(delayNode);delayNode.connect(feedback);feedback.connect(delayNode);delayNode.connect(wet);wet.connect(master);
    }
    if(context.state!=='running')await context.resume();
    if(context.state!=='running')throw new Error('Pulsa Reproducir otra vez para habilitar el sonido en este navegador.');
  }
  function tone(midi,time,length,gain,type){
    const osc=context.createOscillator(),envelope=context.createGain();osc.type=type||'sine';osc.frequency.value=440*Math.pow(2,(midi-69)/12);
    envelope.gain.setValueAtTime(.0001,time);envelope.gain.exponentialRampToValueAtTime(gain,time+.035);envelope.gain.exponentialRampToValueAtTime(.0001,time+length);osc.connect(envelope);envelope.connect(synthBus);osc.start(time);osc.stop(time+length+.04);
    const item={osc,envelope};scheduled.push(item);osc.onended=()=>{osc.disconnect();envelope.disconnect();scheduled=scheduled.filter(x=>x!==item);};
  }
  const chords=[[60,64,67,71],[57,60,64,67],[53,57,60,64],[55,59,62,67]];
  const step=.375;
  function schedule(){if(!playing||mode!=='demo'||!context)return;if(nextBeat<context.currentTime-.3)nextBeat=context.currentTime+.05;while(nextBeat<context.currentTime+.25){const chord=chords[Math.floor(beatIndex/8)%4],pos=beatIndex%8;
    if(pos===0){chord.forEach((note,i)=>tone(note,nextBeat,2.7,.035,'sine'));tone(chord[0]-24,nextBeat,1.8,.105,'sine');}
    const pattern=[0,2,1,3,2,1,3,2];tone(chord[pattern[pos]]+12,nextBeat,.65,pos%2===0?.043:.025,'sine');
    if(pos===4)tone(chord[0]-24,nextBeat,.9,.06,'sine');
    nextBeat+=step;beatIndex++;
  }}
  function stopSynth(){clearInterval(musicTimer);musicTimer=null;scheduled.slice().forEach(item=>{try{item.osc.stop();}catch(e){}});scheduled=[];if(synthBus&&context){synthBus.gain.cancelScheduledValues(context.currentTime);synthBus.gain.setValueAtTime(0,context.currentTime);}}
  function pauseMusic(){generation++;audio.pause();stopSynth();setPlaying(false);}
  function errorMessage(err){return err&&err.name==='NotAllowedError'?'El navegador bloqueó el inicio de audio. Pulsa Reproducir para intentarlo.':err&&err.message?err.message:'No se pudo reproducir este audio. Prueba otra canción.';}
  async function startMusic(){
    if(busy)return;busy=true;playButton.disabled=true;const ticket=++generation;
    try{
      if(mode==='demo'){
        await setupAudio();if(ticket!==generation)return;synthBus.gain.setValueAtTime(.75,context.currentTime);setPlaying(true);nextBeat=context.currentTime+.08;beatIndex=0;schedule();musicTimer=setInterval(schedule,90);status.textContent='Demo instrumental en reproducción. Puedes cambiar a tus canciones cuando quieras.';
      }else{
        if(!tracks.length)throw new Error('Elige al menos un archivo de audio.');
        // Audio element remains a functional fallback without Web Audio support.
        const AudioContextClass=window.AudioContext||window.webkitAudioContext;
        if(AudioContextClass){await setupAudio();if(ticket!==generation)return;if(!mediaSource){mediaSource=context.createMediaElementSource(audio);mediaSource.connect(master);}audio.volume=1;}else audio.volume=mixedVolume();
        await audio.play();if(ticket!==generation){audio.pause();return;}setPlaying(true);status.textContent='Reproduciendo tu música. Los archivos permanecen en esta sesión; no se han subido.';
      }
    }catch(err){if(ticket===generation){setPlaying(false);stopSynth();status.textContent=errorMessage(err);}}
    finally{busy=false;playButton.disabled=false;}
  }
  function chooseTrack(index){trackIndex=(index+tracks.length)%tracks.length;audio.src=tracks[trackIndex].url;audio.load();q('.mv-track-title').textContent=tracks[trackIndex].name;q('.mv-track-subtitle').textContent='Mi música · '+(trackIndex+1)+' de '+tracks.length;q('[data-action="track-next"]').disabled=tracks.length<2;}
  playButton.addEventListener('click',()=>{if(playing){pauseMusic();status.textContent='Música en pausa.';}else startMusic();});
  q('[data-action="track-next"]').addEventListener('click',()=>{if(tracks.length<2||busy)return;const resume=playing;pauseMusic();chooseTrack(trackIndex+1);if(resume)startMusic();else status.textContent='Pista seleccionada. Pulsa Reproducir.';});
  q('#mv-volume').addEventListener('input',()=>{q('.mv-volume-label output').textContent=q('#mv-volume').value+'%';applyMix();});
  q('#mv-files').addEventListener('change',event=>{
    const selected=Array.from(event.target.files||[]).filter(file=>file.type.startsWith('audio/')||/\.(mp3|wav|ogg|m4a)$/i.test(file.name));
    if(!selected.length){status.textContent='Selecciona archivos de audio, por ejemplo MP3.';return;}
    pauseMusic();audio.removeAttribute('src');audio.load();tracks.forEach(track=>URL.revokeObjectURL(track.url));tracks=selected.map(file=>({name:file.name.replace(/\.[^.]+$/,''),url:URL.createObjectURL(file)}));mode='local';chooseTrack(0);setPlaying(false);q('[data-action="demo"]').hidden=false;status.textContent=tracks.length+' canción(es) lista(s). Pulsa Reproducir. Se usan solo en esta sesión.';
  });
  q('[data-action="demo"]').addEventListener('click',()=>{pauseMusic();audio.removeAttribute('src');audio.load();tracks.forEach(track=>URL.revokeObjectURL(track.url));tracks=[];mode='demo';q('.mv-track-title').textContent='Conexiones';q('.mv-track-subtitle').textContent='Demo instrumental · lista para escuchar';q('[data-action="track-next"]').disabled=true;q('[data-action="demo"]').hidden=true;q('#mv-files').value='';setPlaying(false);status.textContent='Demo seleccionada. Pulsa Escuchar demo.';});
  audio.addEventListener('ended',()=>{if(mode==='local'&&tracks.length){pauseMusic();chooseTrack(trackIndex+1);startMusic();}});
  audio.addEventListener('error',()=>{if(mode==='local'&&audio.currentSrc){setPlaying(false);status.textContent='Este archivo no se puede reproducir aquí. Prueba otro formato o pulsa Siguiente pista.';}});
  audio.addEventListener('pause',()=>{if(mode==='local'&&!audio.ended)setPlaying(false);});
  // A local playlist, independent of the main media scene. Nothing is uploaded.
  let clips=JSON.parse(q('#mvp-demo-data').textContent),nextClip=0,playlistElapsed=0;
  let batch=[],batchPosition=0,clipToken=0,clipLoading=false,awaitingGesture=false;
  let clipStall=0,lastClipTime=0,clipAdvancePending=false,heroResume=false,playlistSequence=0;
  const playlistStatus=q('.mvp-status');
  function clipInterval(){return Number(q('#mvp-interval').value)||900000;}
  function currentClip(){return batch[batchPosition]||null;}
  function renderSchedule(){
    let message;
    if(playlistActive){const clip=currentClip();message=(awaitingGesture?'Esperando inicio · ':paused?'En pausa · ':clipLoading?'Cargando · ':playlistVideo.paused?'En pausa · ':'Reproduciendo · ')+(clip?clip.name:'Video');}
    else if(!clips.length)message='Añade videos para comenzar';
    else if(!q('#mvp-enabled').checked)message='Programación desactivada';
    else if(paused)message='Programación en pausa';
    else {const seconds=Math.ceil(Math.max(0,clipInterval()-playlistElapsed)/1000);message='Próximo turno en '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
    if(q('.mvp-schedule').textContent!==message)q('.mvp-schedule').textContent=message;
  }
  function renderPlaylist(){
    const list=q('.mvp-list');list.replaceChildren();
    clips.forEach((clip,index)=>{
      const row=document.createElement('li'),info=document.createElement('div'),name=document.createElement('strong'),meta=document.createElement('small'),actions=document.createElement('div');
      info.classList.add('mvp-row-info');actions.classList.add('mvp-row-actions');name.textContent=clip.name;
      const selected=playlistActive?currentClip()&&currentClip().id===clip.id:index===nextClip;
      row.classList.toggle('mvp-selected',selected);
      meta.textContent=(clip.demo?'Ejemplo · 6 s · sin audio':'Archivo de esta sesión')+(selected?(playlistActive?' · En reproducción':' · Siguiente'):'');
      info.appendChild(name);info.appendChild(meta);row.appendChild(info);
      [['↑','Subir',-1],['↓','Bajar',1],['Quitar','Quitar',0]].forEach(([label,verb,direction])=>{
        const button=document.createElement('button');button.type='button';button.textContent=label;button.classList.add('cursor-interaction');button.setAttribute('aria-label',verb+' '+clip.name);
        button.disabled=playlistActive||(direction===-1&&index===0)||(direction===1&&index===clips.length-1);
        button.addEventListener('click',()=>{if(playlistActive)return;if(direction){const target=index+direction;[clips[index],clips[target]]=[clips[target],clips[index]];}else{clips.splice(index,1);if(!clip.demo)URL.revokeObjectURL(clip.url);}
          nextClip=0;playlistElapsed=0;renderPlaylist();playlistStatus.textContent=clips.length?'Orden actualizado. El siguiente turno comenzará por el primer video.':'Lista vacía. Añade videos para programar un turno.';
        });actions.appendChild(button);
      });row.appendChild(actions);list.appendChild(row);
    });
    if(!clips.length){const empty=document.createElement('li');empty.classList.add('mvp-empty');empty.textContent='Selecciona uno o varios videos de tu equipo.';list.appendChild(empty);}
    q('[data-action="video-test"]').disabled=playlistActive||!clips.length;
    q('[data-action="video-clear"]').disabled=playlistActive||!clips.length;
    ['#mvp-files','#mvp-interval','#mvp-mode'].forEach(selector=>q(selector).disabled=playlistActive);
    ['prev','next','quiz'].forEach(action=>q('[data-action="'+action+'"]').disabled=playlistActive);
    q('#mv-media').disabled=playlistActive;q('[data-action="reset-media"]').disabled=playlistActive;
    q('.mv-editor-form button[type="submit"]').disabled=playlistActive;
    renderSchedule();
  }
  function advanceClipCursor(){const clip=currentClip();if(!clip||!clips.length)return;const index=clips.findIndex(c=>c.id===clip.id);nextClip=(Math.max(0,index)+1)%clips.length;}
  function finishPlaylist(message,skipCurrent=false){
    if(!playlistActive)return;
    if(skipCurrent)advanceClipCursor();
    clipToken++;playlistActive=false;clipLoading=false;awaitingGesture=false;clipAdvancePending=false;playlistElapsed=0;
    playlistVideo.pause();playlistVideo.removeAttribute('src');playlistVideo.load();q('.mvp-overlay').hidden=true;q('.mvp-retry').hidden=true;root.classList.remove('mvp-on');
    if(heroResume&&!paused&&!document.hidden&&scene===0&&video.getAttribute('src'))video.play().catch(()=>{editorStatus.textContent='Pulsa reproducir para retomar el video del muro.';});
    heroResume=false;lastTick=performance.now();applyMix();rotationState();renderPlaylist();playlistStatus.textContent=message;
  }
  function advancePlaylist(){
    if(!playlistActive)return;advanceClipCursor();batchPosition++;clipAdvancePending=false;
    if(batchPosition>=batch.length){finishPlaylist('Turno completado. El muro continúa; la lista se repetirá automáticamente.');return;}
    loadPlaylistClip();
  }
  function failPlaylistClip(){
    if(!playlistActive)return;const clip=currentClip(),name=clip?clip.name:'El video';
    if(clip)clipToken++;
    advancePlaylist();playlistStatus.textContent='No se pudo reproducir «'+name+'». Se omitió para continuar. Prueba un MP4 compatible.';
  }
  async function playPlaylistVideo(){
    if(!playlistActive||cleaned)return;
    if(clipAdvancePending){advancePlaylist();return;}
    const ticket=++clipToken;awaitingGesture=false;q('.mvp-retry').hidden=true;
    try{await playlistVideo.play();if(ticket!==clipToken)return;clipLoading=false;clipStall=0;applyMix();renderSchedule();}
    catch(err){if(ticket!==clipToken||!playlistActive)return;clipLoading=false;
      if(err&&err.name==='NotAllowedError'){awaitingGesture=true;q('.mvp-retry').hidden=false;playlistStatus.textContent='El navegador bloqueó el inicio automático. Pulsa Reproducir video para continuar.';renderSchedule();}
      else if(err&&err.name==='AbortError'){return;}
      else failPlaylistClip();
    }
  }
  function loadPlaylistClip(){
    const clip=currentClip();if(!clip){finishPlaylist('Lista completada.');return;}
    clipToken++;clipLoading=true;awaitingGesture=false;clipStall=0;lastClipTime=0;clipAdvancePending=false;
    playlistVideo.src=clip.url;playlistVideo.muted=!!clip.demo;playlistVideo.volume=.7;playlistVideo.load();
    q('.mvp-player-title').textContent=clip.name+' · '+(batchPosition+1)+'/'+batch.length;
    q('.mvp-retry').hidden=true;renderPlaylist();
    if(!paused&&!document.hidden)playPlaylistVideo();
  }
  function startPlaylist(manual=false){
    if(playlistActive||!clips.length||cleaned)return;
    if(manual&&paused){paused=false;rotationState();}
    const count=q('#mvp-mode').value==='all'?clips.length:1;
    batch=Array.from({length:count},(_,offset)=>clips[(nextClip+offset)%clips.length]);batchPosition=0;
    playlistActive=true;heroResume=scene===0&&!video.paused;video.pause();q('.mvp-overlay').hidden=false;root.classList.add('mvp-on');
    playlistStatus.textContent=count===1?'Se reproduce un video completo y después vuelve el muro.':'Se reproduce toda la lista en orden y después vuelve el muro.';
    loadPlaylistClip();
  }
  function playlistTick(dt){
    if(playlistActive){
      if(clipAdvancePending){advancePlaylist();return;}
      if(awaitingGesture)return;
      if(playlistVideo.currentTime!==lastClipTime){lastClipTime=playlistVideo.currentTime;clipStall=0;}
      else if(clipLoading||!playlistVideo.paused){clipStall+=dt;if(clipStall>=30000)failPlaylistClip();}
      return;
    }
    if(q('#mvp-enabled').checked&&clips.length){playlistElapsed+=dt;
      // Finish any video already running inside the main scene before starting the list.
      if(playlistElapsed>=clipInterval()&&!(scene===0&&video.getAttribute('src')&&!video.ended))startPlaylist();
    }
    renderSchedule();
  }
  q('[data-action="video-test"]').addEventListener('click',()=>startPlaylist(true));
  q('[data-action="video-return"]').addEventListener('click',()=>finishPlaylist('Volviste al muro. El próximo turno continuará con el siguiente video.',true));
  q('[data-action="video-retry"]').addEventListener('click',()=>{if(paused){paused=false;rotationState();}playPlaylistVideo();});
  q('#mvp-enabled').addEventListener('change',()=>{playlistElapsed=0;renderSchedule();playlistStatus.textContent=q('#mvp-enabled').checked?'Programación activada.':'Programación desactivada.'+(playlistActive?' El turno actual terminará completo.':'');});
  q('#mvp-interval').addEventListener('change',()=>{playlistElapsed=0;renderSchedule();});
  q('#mvp-mode').addEventListener('change',()=>{playlistElapsed=0;renderSchedule();playlistStatus.textContent=q('#mvp-mode').value==='all'?'Cada turno mostrará toda la lista y volverá al muro.':'Cada turno mostrará un video; el siguiente turno continuará con el próximo.';});
  q('[data-action="video-clear"]').addEventListener('click',()=>{if(playlistActive)return;clips.forEach(c=>{if(!c.demo)URL.revokeObjectURL(c.url);});clips=[];nextClip=0;playlistElapsed=0;renderPlaylist();playlistStatus.textContent='Lista vacía. El muro continúa normalmente.';});
  q('#mvp-files').addEventListener('change',event=>{
    if(playlistActive)return;const files=Array.from(event.target.files||[]);
    const valid=files.filter(file=>/^video\/(mp4|webm)$/.test(file.type)||/\.(mp4|webm)$/i.test(file.name));
    if(!valid.length){playlistStatus.textContent='Selecciona videos MP4 o WebM.';event.target.value='';return;}
    if(clips.length&&clips.every(c=>c.demo)){clips=[];nextClip=0;}
    let added=0;valid.forEach(file=>{const key=file.name+'|'+file.size+'|'+file.lastModified;if(clips.some(c=>c.key===key))return;clips.push({id:'local-'+(++playlistSequence),key,name:file.name,url:URL.createObjectURL(file),demo:false});added++;});
    event.target.value='';playlistElapsed=0;renderPlaylist();playlistStatus.textContent=added+' video(s) añadido(s). Se usarán en este orden, solo durante esta sesión.'+(valid.length<files.length?' Se omitieron archivos de otro tipo.':'');
  });
  playlistVideo.addEventListener('ended',()=>{if(!playlistActive)return;applyMix();if(paused||document.hidden)clipAdvancePending=true;else advancePlaylist();});
  playlistVideo.addEventListener('error',()=>{if(playlistActive&&playlistVideo.getAttribute('src'))failPlaylistClip();});
  ['play','pause','volumechange'].forEach(name=>playlistVideo.addEventListener(name,()=>{applyMix();renderSchedule();}));
  // Changes below affect this preview only. No remote publishing or upload occurs.
  let mediaURL=null;
  const initialPhoto=q('.mv-hero-photo').src;
  const editorStatus=q('.mv-editor-status');
  q('.mv-editor-form').addEventListener('submit',event=>{
    event.preventDefault();
    if(playlistActive){editorStatus.textContent='Espera a que termine el turno de videos para aplicar cambios al muro.';return;}
    const title=q('#mv-title').value.trim(),subtitle=q('#mv-subtitle').value.trim();
    if(!title){editorStatus.textContent='Escribe un titular antes de aplicar.';q('#mv-title').focus();return;}
    q('.mv-photo-copy h1').textContent=title;q('.mv-photo-copy p').textContent=subtitle;
    duration=Number(q('#mv-duration').value);
    qa('[data-toggle]').forEach(input=>{q('[data-module="'+input.dataset.toggle+'"]').hidden=!input.checked;});
    q('.mv-grid').classList.toggle('mv-no-sidebar',q('[data-module="weather"]').hidden&&q('[data-module="birthdays"]').hidden);
    rotate(0);editorStatus.textContent='Cambios aplicados solo en este navegador; se perderán al recargar.';
  });
  function clearVideo(){video.pause();video.removeAttribute('src');video.load();video.hidden=true;q('.mv-photo-scene').classList.remove('mv-video-active');root.classList.remove('mv-video-visible');applyMix();}
  q('#mv-media').addEventListener('change',event=>{
    const file=event.target.files&&event.target.files[0];if(!file)return;
    const isVideo=/^video\//.test(file.type)||/\.(mp4|webm)$/i.test(file.name);
    const isPhoto=/^image\/(png|jpeg|webp)$/.test(file.type)||/\.(png|jpe?g|webp)$/i.test(file.name);
    if(!isVideo&&!isPhoto){editorStatus.textContent='Usa PNG, JPG, WebP, MP4 o WebM.';return;}
    clearVideo();if(mediaURL)URL.revokeObjectURL(mediaURL);mediaURL=URL.createObjectURL(file);
    q('.mv-hero-photo').hidden=isVideo;
    if(isVideo){video.src=mediaURL;video.hidden=false;video.controls=true;video.muted=false;q('.mv-photo-scene').classList.add('mv-video-active');video.load();}
    else{q('.mv-hero-photo').src=mediaURL;q('.mv-hero-photo').alt='Foto añadida para el mural';q('.mv-media-note').textContent='Foto de tu equipo';}
    rotate(0);editorStatus.textContent=isVideo?'Video cargado localmente. Se mostrará completo antes de cambiar de escena.':'Foto aplicada localmente. No se ha subido al servidor.';
  });
  q('[data-action="reset-media"]').addEventListener('click',()=>{clearVideo();if(mediaURL){URL.revokeObjectURL(mediaURL);mediaURL=null;}q('.mv-hero-photo').src=initialPhoto;q('.mv-hero-photo').alt='Imagen ilustrativa generada de un equipo colaborando';q('.mv-hero-photo').hidden=false;q('.mv-media-note').textContent='Imagen ilustrativa · IA';q('#mv-media').value='';rotate(0);editorStatus.textContent='Imagen de muestra restaurada.';});
  ['play','pause','volumechange'].forEach(name=>video.addEventListener(name,applyMix));
  video.addEventListener('ended',()=>{applyMix();if(scene===0&&!paused)rotate(1);});
  video.addEventListener('error',()=>{if(video.getAttribute('src')){clearVideo();if(mediaURL){URL.revokeObjectURL(mediaURL);mediaURL=null;}q('.mv-hero-photo').src=initialPhoto;q('.mv-hero-photo').hidden=false;q('.mv-hero-photo').alt='Imagen ilustrativa generada de un equipo colaborando';q('.mv-media-note').textContent='Imagen ilustrativa · IA';q('#mv-media').value='';elapsed=0;editorStatus.textContent='No se pudo reproducir el video; se restauró la imagen para continuar el mural. Prueba MP4 con H.264.';}});
  q('.mv-hero-photo').addEventListener('error',()=>{editorStatus.textContent='No se pudo abrir esa imagen. Prueba otro archivo o restaura la imagen de muestra.';});
  const freqData=new Uint8Array(128);
  let lastPaint=0;
  function drawSpectrum(now){
    if(cleaned)return;
    if(now-lastPaint>70){lastPaint=now;if(playing&&analyser&&!document.hidden&&!reduced.matches){analyser.getByteFrequencyData(freqData);bars.forEach((bar,i)=>{const value=freqData[Math.min(127,2+Math.floor(i*1.8))]/255;bar.style.transform='scaleY('+Math.max(.12,value)+')';});}else bars.forEach(bar=>bar.style.transform='scaleY(.12)');}
    animFrame=requestAnimationFrame(drawSpectrum);
  }
  function cleanup(){if(cleaned)return;cleaned=true;clipToken++;playlistActive=false;playlistVideo.pause();playlistVideo.removeAttribute('src');playlistVideo.load();clips.forEach(c=>{if(!c.demo)URL.revokeObjectURL(c.url);});clearInterval(sceneTimer);clearInterval(clockTimer);document.removeEventListener('visibilitychange',onVisibility);if(reduced.removeEventListener)reduced.removeEventListener('change',onMotionChange);pauseMusic();video.pause();if(mediaURL)URL.revokeObjectURL(mediaURL);cancelAnimationFrame(animFrame);tracks.forEach(t=>URL.revokeObjectURL(t.url));if(context)context.close().catch(()=>{});}
  window.addEventListener('pagehide',event=>{if(!event.persisted)cleanup();});
  window.TelecableWall = {
    resume: function(){if(paused)q('[data-action="rotation"]').click();},
    testVideos: function(){startPlaylist(true);},
    setInterval: function(value){
      if([30000,300000,600000,900000].indexOf(value)<0)return;
      q('#mvp-interval').value=String(value);playlistElapsed=0;renderSchedule();
    },
    setTvMode: function(value){playlistVideo.controls=!value;},
    startMusic: function(){if(!playing)startMusic();},
    getState: function(){return {paused:paused,playlistActive:playlistActive,awaitingGesture:awaitingGesture,scene:scene};}
  };
  rotate(0);rotationState();updateClock();renderPlaylist();
  animFrame=requestAnimationFrame(drawSpectrum);
})();
