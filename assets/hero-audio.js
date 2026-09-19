(function () {
  'use strict';

  var button = document.getElementById('heroAudio');
  var audioContext = null;
  var master = null;
  var ambient = null;
  var enabled = false;

  if (!button || !window.AudioContext && !window.webkitAudioContext) return;

  function createAudio() {
    var AudioCtor = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtor();
    master = audioContext.createGain();
    master.gain.value = 0.035;
    master.connect(audioContext.destination);
    ambient = audioContext.createOscillator();
    var ambientGain = audioContext.createGain();
    ambient.type = 'sine';
    ambient.frequency.value = 146.83;
    ambientGain.gain.value = 0.025;
    ambient.connect(ambientGain).connect(master);
    ambient.start();
  }

  function chime() {
    if (!enabled || !audioContext) return;
    var oscillator = audioContext.createOscillator();
    var gain = audioContext.createGain();
    var now = audioContext.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(392, now);
    oscillator.frequency.exponentialRampToValueAtTime(659.25, now + 0.22);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    oscillator.connect(gain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + 0.45);
  }

  async function toggle() {
    if (!audioContext) createAudio();
    if (audioContext.state === 'suspended') await audioContext.resume();
    enabled = !enabled;
    master.gain.setTargetAtTime(enabled ? 0.035 : 0, audioContext.currentTime, 0.08);
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled ? 'Matikan suara' : 'Aktifkan suara';
    if (enabled) chime();
  }

  button.addEventListener('click', toggle);
  document.addEventListener('hero:statechange', function (event) {
    if (event.detail.phase === 'locked') chime();
  });
  document.addEventListener('visibilitychange', function () {
    if (!audioContext) return;
    if (document.hidden) audioContext.suspend();
    else if (enabled) audioContext.resume();
  });
})();
