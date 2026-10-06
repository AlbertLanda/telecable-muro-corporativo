(function () {
  'use strict';
  var wall = window.TelecableWall;
  if (!wall) return;
  var frame = document.querySelector('.pilot-frame');
  var screen = document.querySelector('.mv-screen');
  var player = document.querySelector('.mvp-player');
  var menu = document.getElementById('pilot-tv-tools');
  var status = document.getElementById('pilot-wake-status');
  var tvMode = false, wakeLock = null, wakePending = false, nativePending = false;
  var menuTimer = null, lockGeneration = 0;
  var params = new URLSearchParams(window.location.search);

  function fit() {
    var width = tvMode ? window.innerWidth : frame.clientWidth;
    var height = tvMode ? window.innerHeight : width * 9 / 16;
    if (!tvMode) frame.style.height = height + 'px';
    else frame.style.height = '100%';
    screen.style.transform = 'translate(-50%,-50%) scale(' + Math.min(width / 1024, height / 576) + ')';
  }
  function note(text) { status.textContent = text; }
  function fullElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function requestFull(element) {
    var fn = element.requestFullscreen || element.webkitRequestFullscreen;
    if (!fn) return Promise.reject(new Error('fullscreen-unavailable'));
    try { return Promise.resolve(fn.call(element)); } catch (error) { return Promise.reject(error); }
  }
  function exitFull() {
    var fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fullElement() && fn) {
      try { Promise.resolve(fn.call(document)).catch(function () {}); } catch (error) { /* TV-specific API. */ }
    }
  }
  function videoFullscreen() {
    if (!tvMode || !wall.getState().playlistActive || nativePending || fullElement() === player) return;
    nativePending = true;
    requestFull(player).catch(function () {
      // Filling the page is not the same as a TV-native fullscreen exception.
      note('Video ajustado a la página. El navegador no permitió pantalla completa nativa; validar el protector en la TV.');
    }).then(function () { nativePending = false; });
  }
  async function requestWake() {
    if (!tvMode || document.hidden || wakeLock || wakePending) return;
    if (!window.isSecureContext || !navigator.wakeLock) {
      note('Bloqueo de suspensión no disponible en este navegador o conexión. La prueba en la TV sigue pendiente.');
      return;
    }
    var generation = lockGeneration;
    wakePending = true;
    try {
      var acquired = await navigator.wakeLock.request('screen');
      if (!tvMode || document.hidden || generation !== lockGeneration) { await acquired.release(); return; }
      wakeLock = acquired;
      note('El navegador aceptó mantener la pantalla activa. Aun así, verifica el comportamiento de la TV.');
      acquired.addEventListener('release', function () {
        if (wakeLock === acquired) {
          wakeLock = null;
          note('El navegador liberó el bloqueo de pantalla. Validar el protector en la TV.');
        }
      });
    } catch (error) {
      note('El navegador rechazó el bloqueo de pantalla. La programación continúa; validar en la TV.');
    } finally {
      wakePending = false;
      if (generation !== lockGeneration && tvMode && !document.hidden) requestWake();
    }
  }
  function releaseWake() {
    lockGeneration++;
    var previous = wakeLock;
    wakeLock = null;
    if (previous) Promise.resolve(previous.release()).catch(function () {});
  }
  function hideMenu() {
    clearTimeout(menuTimer);
    menu.hidden = true;
    if (menu.contains(document.activeElement)) document.activeElement.blur();
  }
  function showMenu() {
    if (!tvMode) return;
    menu.hidden = false;
    document.getElementById('pilot-video').focus();
    clearTimeout(menuTimer);
    menuTimer = setTimeout(hideMenu, 15000);
  }
  function enterTV(withFullscreen) {
    tvMode = true;
    document.body.classList.add('tv-mode');
    wall.setTvMode(true);
    wall.resume();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    fit();
    if (withFullscreen) requestFull(document.documentElement).catch(function () {
      note('Modo TV activo dentro del navegador. Usa sus opciones de pantalla completa si están disponibles.');
    });
    requestWake();
  }
  function leaveTV() {
    if(window.MURO_BOOT){hideMenu();exitFull();return;}
    tvMode = false;
    document.body.classList.remove('tv-mode');
    wall.setTvMode(false);
    hideMenu();
    releaseWake();
    exitFull();
    fit();
    document.getElementById('pilot-enter').focus();
  }
  document.getElementById('pilot-enter').addEventListener('click', function () { enterTV(true); });
  document.getElementById('pilot-exit').addEventListener('click', leaveTV);
  document.getElementById('pilot-hide').addEventListener('click', hideMenu);
  document.getElementById('pilot-sound').addEventListener('click', function () { wall.startMusic(); requestWake(); hideMenu(); });
  document.getElementById('pilot-video').addEventListener('click', function () {
    wall.testVideos(); videoFullscreen(); hideMenu();
  });
  document.getElementById('pilot-quick').addEventListener('click', function (event) {
    wall.setInterval(30000);
    wall.resume();
    event.target.textContent = 'Prueba rápida activa · 30 s';
  });
  // Best effort: automatic native fullscreen may require a remote-control click.
  player.addEventListener('play', videoFullscreen);
  player.addEventListener('ended', function () {
    if (!wall.getState().playlistActive && fullElement() === player) exitFull();
  });
  player.addEventListener('emptied', function () {
    if (!wall.getState().playlistActive && fullElement() === player) exitFull();
  });
  frame.addEventListener('click', function (event) {
    if (tvMode && !event.target.closest('button,video,a,input,select')) showMenu();
  });
  document.addEventListener('keydown', function (event) {
    if (!tvMode) return;
    if (event.key === 'Escape') { leaveTV(); return; }
    if ((event.key === 'Enter' || event.keyCode === 13) && menu.hidden &&
        (!document.activeElement || !document.activeElement.matches('button,input,select,video,a'))) {
      event.preventDefault(); showMenu();
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) releaseWake(); else requestWake();
  });
  document.addEventListener('fullscreenchange', fit);
  window.addEventListener('resize', fit);
  window.addEventListener('pagehide', function () { clearTimeout(menuTimer); releaseWake(); });
  window.addEventListener('pageshow', function () { fit(); if (tvMode) requestWake(); });
  if (params.get('prueba') === '1') {
    wall.setInterval(30000);
    document.getElementById('pilot-quick').textContent = 'Prueba rápida activa · 30 s';
  }
  if (params.get('tv') === '1' || window.MURO_BOOT) enterTV(false); else fit();
})();
