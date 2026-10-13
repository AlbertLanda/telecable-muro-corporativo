const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {setup}=require('./dom-shim.cjs');
const code=fs.readFileSync(path.join(__dirname,'../piloto/managed.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const initial={signature:'v1',version:1,config:{name:'Muro real',welcome_title:'Bienvenidos',welcome_body:'Equipo',ticker:'Aviso publicado',interval_minutes:1,videos_per_turn:'all',quiz_enabled:false,qr_enabled:false},contents:[{id:1,kind:'message',title:'Publicación inicial',body:'Sin ejemplos',duration:40},{id:2,kind:'video',title:'Video publicado',url:'/tv/token/archivo/clip/'}],birthdays:[],music_url:null};

(async()=>{
  const t=setup(false,true);t.win.MURO_BOOT={manifest:structuredClone(initial),poll_url:'/tv/token/manifest/'};
  let response=structuredClone(initial),fail=false,revoked=false;
  t.run(code,{AbortController,setTimeout,clearTimeout,fetch:async()=>{if(fail)throw new Error('offline');return {ok:!revoked,status:revoked?404:200,json:async()=>structuredClone(response)}}});
  assert.equal(t.q('.mv-photo-copy h1').textContent,'Publicación inicial');
  assert(t.q('[data-module="weather"]').hidden);assert(t.q('[data-module="birthdays"]').hidden);
  assert(t.q('.mv-grid').classList.contains('mv-no-sidebar'));
  assert.equal(t.q('.mv-program-count').textContent,'01 / 02','Videos are scenes in the same carousel');
  assert(t.doc.body.classList.contains('ready'));
  assert.equal(t.q('#mvp-interval').value,'60000');
  response.signature='v2';response.version=2;response.contents[0].title='Segunda publicación';
  t.advance(30000);await tick();
  assert.equal(t.q('.mv-photo-copy h1').textContent,'Publicación inicial','Polling must not interrupt a scene');
  t.advance(10000);
  assert.equal(t.q('.mv-photo-copy h1').textContent,'Segunda publicación');
  t.click('video-test');await tick();const player=t.q('.mvp-player');
  assert.equal(player.src,'/tv/token/archivo/clip/');assert.equal(player.muted,false);
  response.signature='v3';response.version=3;response.contents[0].title='Después del video';
  t.advance(29000);await tick();
  assert.equal(t.q('.mv-photo-copy h1').textContent,'Segunda publicación');assert(t.win.TelecableWall.getState().playlistActive);
  player.ended=true;player.emit('ended');await tick();
  assert.equal(t.q('.mv-photo-copy h1').textContent,'Después del video');
  assert(!t.win.TelecableWall.getState().playlistActive);
  fail=true;t.advance(30000);await tick();assert.equal(t.q('.mv-photo-copy h1').textContent,'Después del video');
  assert.match(t.doc.getElementById('managed-status').textContent,/Sin conexión/);
  fail=false;revoked=true;t.advance(30000);await tick();
  assert(!t.doc.body.classList.contains('ready'));assert(t.win.TelecableWall.getState().paused);
  assert.equal(t.doc.getElementById('pilot-tv-tools').hidden,false);

  const b=setup(false,true),data=structuredClone(initial);
  data.contents=[{id:1,kind:'image',title:'Foto real',body:'Equipo',url:'/foto/',duration:8},{id:2,kind:'event',title:'Encuentro',body:'Información',event_at:'2026-10-08T14:00:00Z',location:'Sala A',duration:8},{id:3,kind:'recognition',title:'Gracias',body:'Nuestro equipo',duration:8}];
  data.birthdays=[{name:'Nombre Real',department:'Imagen',day:6,month:10,is_today:true,days_until:0,photo_url:'/foto-cumple/',greeting:'Una dedicatoria personal.'},
    {name:'Segunda Persona',department:'TI',day:6,month:10,is_today:true,days_until:0},
    {name:'Mañana',department:'TI',day:7,month:10,is_today:false,days_until:1}];
  data.config.quiz_enabled=true;data.preview=true;
  b.win.MURO_BOOT={manifest:data,poll_url:null};b.run(code,{AbortController,setTimeout,clearTimeout});
  assert.equal(b.q('.mv-program-count').textContent,'01 / 06');
  assert.equal(b.q('.mv-hero-photo').src,'/foto/');assert(b.q('.mv-hero-photo').hidden,'Never show the previous photograph while the new one loads');
  b.q('.mv-hero-photo').onload();assert(!b.q('.mv-hero-photo').hidden);
  assert.equal(b.q('.mv-birthday-row strong').textContent,'Nombre Real');
  b.advance(8000);assert.equal(b.scene(),'2');assert.equal(b.q('.mv-active h1').textContent,'Encuentro');
  b.advance(8000);assert.equal(b.scene(),'3');assert.equal(b.q('.mv-active h1').textContent,'Gracias');
  b.advance(8000);assert.equal(b.scene(),'1');assert.equal(b.q('.mv-active .mv-nameplate strong').textContent,'Nombre Real');
  assert(b.root.classList.contains('mv-birthday-focus'));
  assert.equal(b.q('.mv-program-count').textContent,'04 / 06');
  assert.equal(b.q('.mv-active .mv-description').textContent,'Una dedicatoria personal.');
  assert.match(b.q('.mv-active .mv-overline').textContent,/6 de octubre/);
  const birthdayPhoto=b.q('.mv-birthday-photo'),fallback=b.q('.mv-medallion>span');
  assert.equal(birthdayPhoto.src,'/foto-cumple/');assert(birthdayPhoto.hidden);
  birthdayPhoto.onload();assert(!birthdayPhoto.hidden);assert(fallback.hidden);
  birthdayPhoto.onerror();assert(birthdayPhoto.hidden);assert(!fallback.hidden);
  b.click('celebrate');assert.match(b.q('.mv-current-scene').textContent,/Nombre Real/);
  b.advance(16000);assert.equal(b.scene(),'1');assert.equal(b.q('.mv-active .mv-nameplate strong').textContent,'Segunda Persona');
  assert.equal(birthdayPhoto.src,'');assert(birthdayPhoto.hidden);assert.equal(fallback.textContent,'SP');
  assert.match(b.q('.mv-active .mv-description').textContent,/Gracias por ser parte/);
  b.advance(16000);assert.equal(b.scene(),'4');
  assert(!b.root.classList.contains('mv-birthday-focus'));

  const n=setup(false,true),items=structuredClone(initial);
  items.config.qr_enabled=true;
  items.contents=[{kind:'image',title:'Primera foto',url:'/primera/',duration:8},{kind:'message',title:'Solo texto',body:'Mensaje completo',duration:8}];
  n.win.MURO_BOOT={manifest:items,poll_url:null};n.run(code,{AbortController,setTimeout,clearTimeout});
  assert(n.q('.mv-grid').classList.contains('mv-no-sidebar'),'QR has its own scene, never a sidebar');
  assert.equal(n.q('.mv-program-count').textContent,'01 / 03');
  n.advance(4000);assert.equal(n.q('[data-managed-progress]').style.transform,'scaleX(0.5)');
  n.advance(4000);
  assert.equal(n.scene(),'0');assert.equal(n.q('.mv-program-count').textContent,'02 / 03');
  assert.equal(n.q('[data-managed-progress]').style.transform,'scaleX(0)');
  assert.equal(n.q('.mv-photo-copy h1').textContent,'Solo texto');
  assert(n.q('.mv-hero-photo').hidden);assert.equal(n.q('.mv-hero-photo').src,'');
  assert(n.root.classList.contains('mv-message-focus'));
  n.advance(8000);assert.equal(n.scene(),'6');assert.equal(n.q('.mv-program-count').textContent,'03 / 03');
  n.advance(12000);assert.equal(n.q('.mv-program-count').textContent,'01 / 03');
  assert(!n.root.classList.contains('mv-message-focus'));
  assert.equal(n.q('.mv-hero-photo').src,'/primera/');

  const dense=setup(false,true),all=structuredClone(data);
  all.config.qr_enabled=true;all.music_url='/music/';
  all.birthdays[0].name='Nombre compuesto de prueba suficientemente largo para la tarjeta';
  dense.win.MURO_BOOT={manifest:all,poll_url:null};dense.run(code,{AbortController,setTimeout,clearTimeout});
  assert(dense.root.classList.contains('mv-rail-dense'));
  assert.equal(dense.root.querySelectorAll('.mv-birthday-row').length,2);
  assert.equal(dense.q('.mv-program-count').textContent,'01 / 07','QR and birthdays each have a complete scene');
  dense.advance(24000);assert(dense.root.classList.contains('mv-birthday-long'));
  dense.advance(16000);assert(!dense.root.classList.contains('mv-birthday-long'));

  const p=setup(false,true),draft=structuredClone(initial);
  draft.preview=true;draft.version='draft-1';draft.signature='draft-1';
  draft.contents=draft.contents.filter(item=>item.kind!=='video');draft.contents[0].duration=16;
  p.win.MURO_BOOT={manifest:draft,poll_url:'/panel/vista-previa/manifest/'};
  let mode='unchanged',requestedHeaders;
  p.run(code,{AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{
    requestedHeaders=options.headers;
    if(mode==='unchanged')return {status:304,ok:false};
    if(mode==='invalid')return {status:422,ok:false};
    if(mode==='login')return {status:200,ok:true,redirected:true};
    return {status:200,ok:true,json:async()=>({...structuredClone(draft),signature:'draft-2',version:'draft-2',contents:[{kind:'message',title:'Borrador actualizado',duration:16}]})};
  }});
  p.advance(30000);await tick();
  assert.equal(requestedHeaders['If-None-Match'],'"draft-1"');
  assert.match(p.doc.getElementById('managed-status').textContent,/Conectado.*borrador/);
  mode='changed';p.advance(30000);await tick();
  assert.equal(p.q('.mv-photo-copy h1').textContent,'Publicación inicial');
  p.advance(4000);assert.equal(p.q('.mv-photo-copy h1').textContent,'Borrador actualizado');
  mode='invalid';p.advance(30000);await tick();
  assert.equal(p.q('.mv-photo-copy h1').textContent,'Borrador actualizado');
  assert.match(p.doc.getElementById('managed-status').textContent,/pendiente de corregir/);
  mode='login';p.advance(30000);await tick();
  assert(!p.doc.body.classList.contains('ready'));
  assert.match(p.doc.getElementById('managed-status').textContent,/inicia sesión/);
  const projects=setup(false,true),portfolio=structuredClone(initial);
  portfolio.contents=Array.from({length:5},(_,i)=>({id:i+1,kind:'project',title:'Proyecto '+(i+1),body:'Reporte del equipo',url:'/proyecto/'+i+'/',duration:8,progress_percent:[0,25,null,100,72][i],progress_as_of:i===2?null:'2026-10-12',featured:i===4}));
  portfolio.contents.push({kind:'culture',title:'Valor aprobado',body:'Así trabajamos.',duration:8});
  portfolio.contents.push({kind:'field_event',title:'Visita en campo',body:'Actividad del equipo',url:'/campo/',duration:8,event_at:'2026-10-12T15:00:00Z',location:'Jauja'});
  portfolio.demo=true;
  projects.win.MURO_BOOT={manifest:portfolio,poll_url:null};projects.run(code,{AbortController,setTimeout,clearTimeout});
  const board=()=>projects.q('.mv-project-board'),tiles=()=>board().querySelectorAll('.mv-project-tile');
  assert.equal(projects.scene(),'5');
  assert.equal(tiles()[0].querySelector('h2').textContent,'Proyecto 5','Featured projects lead the first group');
  assert.equal(projects.q('.mv-program-count').textContent,'01 / 04');
  assert.equal(tiles().length,4);
  assert.equal(tiles()[0].querySelector('.mv-project-tile-percent').textContent,'72%');
  assert.match(tiles()[0].querySelector('.mv-project-tile-date').textContent,/12\/10\/2026/);
  assert.equal(tiles()[1].querySelector('.mv-project-tile-percent').textContent,'0%');
  assert(!tiles()[1].querySelector('.mv-project-tile-bar').hidden);
  assert.equal(tiles()[3].querySelector('.mv-project-tile-percent').textContent,'Sin avance reportado');
  assert(tiles()[3].querySelector('.mv-project-tile-bar').hidden);
  assert.match(projects.q('.mv-footer>span:last-child').textContent,/DATOS FICTICIOS/);
  projects.advance(8000);
  assert.equal(tiles().length,1);assert(board().classList.contains('mv-project-count-1'));
  assert.equal(tiles()[0].querySelector('.mv-project-tile-percent').textContent,'100%');
  assert.match(projects.q('.mv-project-page').textContent,/5–5 de 5/);
  projects.advance(8000);assert(projects.root.classList.contains('mv-culture-focus'));
  assert(projects.q('.mv-project-overview').hidden);assert(projects.q('.mv-project-metric').hidden);
  assert(projects.q('.mv-hero-photo').hidden);
  projects.advance(8000);assert(projects.root.classList.contains('mv-field-focus'));
  assert.equal(projects.q('.mv-field-location').textContent,'Jauja');
  assert.match(projects.q('.mv-field-date').textContent,/10:00/);
  assert(!projects.q('.mv-field-meta').hidden);assert.equal(projects.q('.mv-hero-photo').src,'/campo/');
  projects.advance(8000);assert.equal(projects.q('.mv-program-count').textContent,'01 / 04');

  const updateProject=setup(false,true),report=structuredClone(portfolio);
  report.contents=[{...report.contents[0],duration:40}];report.demo=false;
  updateProject.win.MURO_BOOT={manifest:report,poll_url:'/tv/token/manifest/'};
  updateProject.run(code,{AbortController,setTimeout,clearTimeout,fetch:async()=>({status:200,ok:true,json:async()=>({...structuredClone(report),signature:'new-report',contents:[{...report.contents[0],progress_percent:80}]})})});
  updateProject.advance(30000);await tick();
  assert.equal(updateProject.q('.mv-project-tile-percent').textContent,'0%');
  updateProject.advance(10000);
  assert.equal(updateProject.q('.mv-project-tile-percent').textContent,'80%','New report enters at the scene boundary');
  // Ordered mixed-media program: team -> video -> video -> image. Clips end naturally.
  const carousel=setup(false,true),mix=structuredClone(initial);
  mix.contents=[{kind:'team',id:1,title:'Operaciones de prueba',body:'Nuestro equipo',team_roles:'Instalaciones, Soporte, Mantenimiento',url:'/team/',duration:8},
    {kind:'video',id:2,title:'Primer video',url:'/clip-a/',duration:8},
    {kind:'video',id:3,title:'Segundo video',url:'/clip-b/',duration:8},
    {kind:'image',id:4,title:'Después del video',url:'/image/',duration:8}];
  carousel.win.MURO_BOOT={manifest:mix,poll_url:null};carousel.run(code,{AbortController,setTimeout,clearTimeout});
  assert(carousel.root.classList.contains('mv-team-focus'));assert.equal(carousel.q('.mv-team-roles').children.length,3);
  assert.equal(carousel.q('.mv-hero-photo').src,'/team/');
  carousel.advance(8000);await tick();
  const movie=carousel.q('.mvp-player');assert.equal(movie.src,'/clip-a/');assert(!movie.muted);
  assert(carousel.q('.mv-team-roles').hidden);assert.equal(carousel.q('.mv-program-count').textContent,'02 / 04');
  // More than the old one-minute interval: neither timer nor scene duration cuts the clip.
  for(let i=0;i<7;i++){movie.currentTime+=10;carousel.advance(10000);await tick();assert.equal(movie.src,'/clip-a/');}
  carousel.click('rotation');assert(movie.paused);carousel.advance(20000);assert.equal(movie.src,'/clip-a/');
  carousel.click('rotation');await tick();assert(!movie.paused);
  movie.ended=true;movie.emit('ended');await tick();assert.equal(movie.src,'/clip-b/');
  assert.equal(carousel.q('.mv-program-count').textContent,'03 / 04');
  movie.ended=true;movie.emit('ended');await tick();assert.equal(carousel.q('.mv-photo-copy h1').textContent,'Después del video');
  assert(!carousel.win.TelecableWall.getState().playlistActive);
  carousel.advance(8000);assert(carousel.root.classList.contains('mv-team-focus'));

  // Every group size is valid; the longest project duration controls the shared page.
  for(const count of [1,2,3,4,5,9]){
    const g=setup(false,true),gd=structuredClone(initial);
    gd.contents=Array.from({length:count},(_,i)=>({id:i,kind:'project',title:'P'+i,progress_percent:0,duration:i===0?12:8}));
    g.win.MURO_BOOT={manifest:gd,poll_url:null};g.run(code,{AbortController,setTimeout,clearTimeout});
    assert.equal(g.q('.mv-project-board').children.length,Math.min(count,4));
    g.advance(8000);assert.match(g.q('.mv-project-page').textContent,new RegExp('1–'+Math.min(count,4)));
    const seen=new Set();
    for(let page=0;page<Math.ceil(count/4);page++){
      g.q('.mv-project-board').querySelectorAll('h2').forEach(h=>seen.add(h.textContent));g.advance(page===0?4000:8000);
    }
    assert.equal(seen.size,count,'All company projects appear exactly across the paginated groups');
  }

  const broken=setup(false,true),bad=structuredClone(initial);
  bad.contents=[{id:1,kind:'video',title:'Unavailable',url:'/bad/'}];
  broken.win.MURO_BOOT={manifest:bad,poll_url:null};broken.run(code,{AbortController,setTimeout,clearTimeout});await tick();
  broken.q('.mvp-player').emit('error');await tick();
  assert.equal(broken.q('.mv-photo-copy h1').textContent,'Video no disponible');
  assert(!broken.win.TelecableWall.getState().playlistActive);
  broken.advance(7900);assert(!broken.win.TelecableWall.getState().playlistActive,'Broken-only playlists cannot spin in a synchronous loop');
  broken.advance(100);await tick();assert(broken.win.TelecableWall.getState().playlistActive);
  const media=setup(false,true),mediaData=structuredClone(initial);
  assert.equal(media.q('.mv-hero-photo').getAttribute('src'),null,'Production template has no embedded demonstration photo');
  mediaData.music_url='/corporate-music/';
  mediaData.contents=[{kind:'team',title:'Team A',url:'/team-a/',duration:8},{kind:'team',title:'Team B',url:'/team-b/',duration:8},{kind:'video',id:33,title:'Corporate video',url:'/corporate-video/'}];
  media.win.MURO_BOOT={manifest:mediaData,poll_url:null};media.run(code,{AbortController,setTimeout,clearTimeout});
  const hero=media.q('.mv-hero-photo'),prompt=media.doc.getElementById('player-sound-prompt'),music=media.q('.mv-audio'),clip=media.q('.mvp-player');
  await tick();assert(hero.hidden);assert(prompt.hidden);assert(!music.paused,'Opening the wall attempts native audio playback');
  let decoded;hero.decode=()=>new Promise(resolve=>{decoded=resolve;});hero.onload();
  media.advance(8000);assert.equal(hero.src,'/team-b/');assert(hero.hidden);
  decoded();await tick();assert(hero.hidden,'A late decode of A must not reveal B before B is ready');
  hero.decode=()=>Promise.resolve();hero.onload();await tick();assert(!hero.hidden);
  hero.onerror();assert(hero.hidden,'An image error cannot restore a sample image');
  media.doc.getElementById('player-enable-sound').click();await tick();
  assert(!music.paused);assert(prompt.hidden);assert(media.win.TelecableWall.getState().soundEnabled);
  media.advance(8000);await tick();assert.equal(clip.src,'/corporate-video/');assert(!clip.muted);assert(!clip.paused);
  assert.equal(music.volume,0.25*0.15,'Background music ducks while the video has audio');
  media.win.TelecableWall.muteSound();assert(music.paused);assert(clip.muted);assert(!prompt.hidden);
  clip.pause();media.doc.getElementById('player-enable-sound').click();await tick();
  assert(!clip.muted);assert(!clip.paused,'Enabling sound also resumes a video paused by the browser');assert(!music.paused);
  music.emit('error');assert(!prompt.hidden);assert.match(media.doc.getElementById('player-sound-message').textContent,/MP3 o WAV/);
  clip.play=()=>clip.muted?Promise.resolve():Promise.reject(Object.assign(new Error('gesture required'),{name:'NotAllowedError'}));
  media.doc.getElementById('player-enable-sound').click();await tick();await tick();
  assert(clip.muted);assert(music.paused);assert(!prompt.hidden);assert(!media.win.TelecableWall.getState().soundEnabled);
  assert.equal(media.q('.mv-hero-photo').getAttribute('src'),null);
  // Native autoplay avoids a suspended AudioContext; permission denial is recoverable.
  const songs=setup(false,true),songData=structuredClone(initial),songAudio=songs.q('.mv-audio');
  songData.contents=[{kind:'message',title:'Muro con música',duration:40}];
  songData.music_tracks=[{id:1,title:'Primera',url:'/one/'},{id:2,title:'Segunda',url:'/two/'},{id:3,title:'Tercera',url:'/three/'}];
  songData.music_url='/one/';
  songs.win.AudioContext=function(){throw new Error('Managed playback must not wait for AudioContext permission');};
  let allowed=false,starts=0;
  const songPlay=songAudio.play.bind(songAudio);
  songAudio.play=()=>{starts++;return allowed?songPlay():Promise.reject(Object.assign(new Error('permission'),{name:'NotAllowedError'}));};
  songs.win.MURO_BOOT={manifest:songData,poll_url:null};songs.run(code,{AbortController,setTimeout,clearTimeout});await tick();
  const songPrompt=songs.doc.getElementById('player-sound-prompt');
  assert.equal(starts,1);assert(!songPrompt.hidden);assert(songAudio.paused);assert(!songs.win.TelecableWall.getState().soundEnabled);
  allowed=true;songs.doc.emit('keydown',{key:'Enter'});await tick();assert(!songAudio.paused);assert(songPrompt.hidden);
  assert.equal(songAudio.src,'/one/');
  for(const url of ['/two/','/three/','/one/']){songAudio.ended=true;songAudio.emit('ended');await tick();assert.equal(songAudio.src,url);assert(!songAudio.paused);}
  const playlistConfig={carousel:true,config:{},videos:[],music_tracks:songData.music_tracks};
  songAudio.currentTime=42;songs.win.TelecableWall.configure(playlistConfig);await tick();
  assert.equal(songAudio.currentTime,42,'Content refresh does not restart music');
  const reordered=[songData.music_tracks[2],songData.music_tracks[0],songData.music_tracks[1]];
  songs.win.TelecableWall.configure({...playlistConfig,music_tracks:reordered});await tick();
  assert.equal(songAudio.currentTime,42);assert.match(songs.q('.mv-track-subtitle').textContent,/2 de 3/);
  songAudio.ended=true;songAudio.emit('ended');await tick();assert.equal(songAudio.src,'/two/');
  songs.win.TelecableWall.muteSound();songs.win.TelecableWall.configure({...playlistConfig,music_tracks:[songData.music_tracks[0]]});await tick();
  assert(songAudio.paused,'Publication changes respect a manual mute');
  songs.win.TelecableWall.configure({...playlistConfig,music_tracks:[],music_url:'/legacy-must-not-return/'});
  assert.equal(songAudio.src,'');assert(songAudio.paused);assert(songPrompt.hidden,'Explicit empty playlist never falls back to legacy music');

  // A broken song is skipped once; an entirely broken list stops instead of spinning.
  const failSongs=setup(false,true),failedAudio=failSongs.q('.mv-audio'),failedData=structuredClone(songData);
  let failing=true,attempts=[];
  const workingPlay=failedAudio.play.bind(failedAudio);
  failedAudio.play=()=>{attempts.push(failedAudio.src);return failing?Promise.reject(Object.assign(new Error('bad format'),{name:'NotSupportedError'})):workingPlay();};
  failSongs.win.MURO_BOOT={manifest:failedData,poll_url:null};failSongs.run(code,{AbortController,setTimeout,clearTimeout});
  await new Promise(resolve=>setTimeout(resolve,600));
  assert.deepEqual(attempts,['/one/','/two/','/three/']);
  assert(!failSongs.doc.getElementById('player-sound-prompt').hidden);assert(failedAudio.paused);
  failing=false;failSongs.doc.getElementById('player-enable-sound').click();await tick();assert(!failedAudio.paused);
  failedAudio.ended=true;failedAudio.emit('ended');await tick();assert.equal(failedAudio.src,'/one/','Manual retry makes previously failed songs available again');
  failSongs.win.TelecableWall.muteSound();
  console.log('PASS: managed carousel, publication sync, no sample-photo flash, late image decode/error, visible sound control, music/video activation, ducking, autoplay fallback, ordered music loop, live reordering, mute and bounded error recovery.');
})().catch(error=>{console.error(error);process.exitCode=1});
