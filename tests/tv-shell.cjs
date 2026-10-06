// Controller tests with simulated browser APIs; this is not a browser/TV test.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../piloto/tv.js'), 'utf8');

function setup({query = '', wake, denyFull = false} = {}) {
  const nodes = {}, timers = new Map(), calls = {resume: 0, full: [], exit: 0};
  let timer = 0, doc;
  class Element {
    constructor(id) {this.id = id;this.listeners = {};this.style = {};this.hidden = true;this.clientWidth = 1024;this.textContent = '';this.classes = new Set();this.classList = {add: v => this.classes.add(v), remove: v => this.classes.delete(v), contains: v => this.classes.has(v)};}
    addEventListener(name, fn) {(this.listeners[name] ||= []).push(fn);}
    emit(name, extra = {}) {for (const fn of this.listeners[name] || []) fn({target: this, preventDefault() {}, ...extra});}
    focus() {doc.activeElement = this;}
    blur() {doc.activeElement = doc.body;}
    contains(el) {return ['pilot-video','pilot-sound','pilot-hide','pilot-exit'].includes(el.id);}
    matches() {return this.id.startsWith('pilot-') && !['pilot-tv-tools','pilot-wake-status'].includes(this.id);}
    requestFullscreen() {calls.full.push(this.id);if (denyFull) return Promise.reject(new Error('denied'));doc.fullscreenElement = this;return Promise.resolve();}
  }
  const ids = ['pilot-tv-tools','pilot-wake-status','pilot-video','pilot-sound','pilot-hide','pilot-exit','pilot-enter','pilot-quick'];
  for (const id of ids) nodes[id] = new Element(id);
  const frame = new Element('frame'), screen = new Element('screen'), player = new Element('player');
  doc = new Element('document');doc.body = new Element('body');doc.documentElement = new Element('html');doc.activeElement = doc.body;doc.hidden = false;
  doc.getElementById = id => nodes[id];
  doc.querySelector = selector => ({'.pilot-frame': frame, '.mv-screen': screen, '.mvp-player': player})[selector];
  doc.exitFullscreen = () => {calls.exit++;doc.fullscreenElement = null;return Promise.resolve();};
  const state = {playlistActive: false};
  const wall = {
    resume() {calls.resume++;},
    setInterval(value) {calls.interval = value;},
    setTvMode(value) {calls.tv = value;},
    getState() {return state;},
    startMusic() {calls.music = true;},
    testVideos() {state.playlistActive = true;}
  };
  const win = new Element('window');Object.assign(win, {TelecableWall: wall,location: {search: query},innerWidth: 1920,innerHeight: 1080,isSecureContext: true});
  vm.runInNewContext(source, {document: doc,window: win,navigator: {wakeLock: wake},URLSearchParams,Promise,Error,setTimeout: fn => {timers.set(++timer, fn);return timer;},clearTimeout: id => timers.delete(id)});
  return {nodes,doc,win,screen,frame,player,state,calls,timers,click: id => nodes[id].emit('click')};
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function lock() {return {released: 0,listeners: {},addEventListener(n, fn) {this.listeners[n] = fn;},release() {this.released++;if(this.listeners.release)this.listeners.release();return Promise.resolve();}};}

(async () => {
  const a = setup({query: '?tv=1&prueba=1'});
  assert(a.doc.body.classList.contains('tv-mode'));
  assert.equal(a.calls.resume, 1);assert.equal(a.calls.interval, 30000);
  assert.equal(a.calls.full.length, 0, 'URL autostart must not pretend fullscreen was granted');
  assert.match(a.screen.style.transform, /scale\(1\.875\)/);
  assert.match(a.nodes['pilot-wake-status'].textContent, /no disponible/);
  a.doc.emit('keydown', {key: 'Enter'});assert.equal(a.nodes['pilot-tv-tools'].hidden, false);
  a.click('pilot-video');await flush();assert(a.state.playlistActive);assert.equal(a.doc.fullscreenElement, a.player);
  a.state.playlistActive = false;a.player.emit('ended');assert.equal(a.calls.exit, 1);
  a.click('pilot-exit');assert(!a.doc.body.classList.contains('tv-mode'));assert.equal(a.calls.tv, false);
  a.frame.clientWidth = 640;a.win.emit('resize');assert.equal(a.frame.style.height, '360px');assert.match(a.screen.style.transform, /scale\(0\.625\)/);

  let acquisitions = 0;const locks = [];
  const b = setup({wake: {async request(type) {assert.equal(type, 'screen');acquisitions++;const l = lock();locks.push(l);return l;}}});
  b.click('pilot-enter');await flush();assert.equal(b.doc.fullscreenElement, b.doc.documentElement);assert.equal(acquisitions, 1);
  b.doc.hidden = true;b.doc.emit('visibilitychange');await flush();assert.equal(locks[0].released, 1);
  b.doc.hidden = false;b.doc.emit('visibilitychange');await flush();assert.equal(acquisitions, 2);
  b.click('pilot-sound');assert.equal(b.calls.music, true);
  b.click('pilot-exit');await flush();assert.equal(locks[1].released, 1);
  b.click('pilot-quick');assert.equal(b.calls.interval, 30000);

  let grant;const stale = lock();
  const c = setup({wake: {request() {return new Promise(resolve => {grant = resolve;});}}});
  c.click('pilot-enter');c.click('pilot-exit');grant(stale);await flush();
  assert.equal(stale.released, 1, 'A late wake lock must not survive leaving TV mode');

  const d = setup({denyFull: true,wake: {request() {return Promise.reject(new Error('not allowed'));}}});
  d.click('pilot-enter');await flush();assert(d.doc.body.classList.contains('tv-mode'));
  assert.match(d.nodes['pilot-wake-status'].textContent, /rechazó/);
  d.click('pilot-video');await flush();assert(d.state.playlistActive);
  assert.match(d.nodes['pilot-wake-status'].textContent, /no permitió/);
  console.log('PASS: TV scaling, URL startup, menu, fullscreen denial/final return, wake-lock visibility/release/races, quick interval and sound action.');
})().catch(error => {console.error(error);process.exitCode = 1;});
