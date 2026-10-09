// Logic checks with simulated DOM/media.
const assert=require('assert/strict');
const {setup}=require('./dom-shim.cjs');
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
