(function () {
  'use strict';

  var keys = ['from', 'dibsen', 'sosmed', 'sipnex', 'safe'];
  var phases = ['idle', 'scrubbing', 'locked', 'navigating', 'paused'];
  var state = { phase: 'idle', key: 'from', source: 'initial' };

  function validKey(key) { return keys.indexOf(key) >= 0; }
  function emit() {
    document.dispatchEvent(new CustomEvent('hero:statechange', {
      detail: { phase: state.phase, key: state.key, source: state.source }
    }));
  }
  function set(phase, key, source) {
    if (phases.indexOf(phase) < 0 || (key && !validKey(key))) return false;
    state.phase = phase;
    if (key) state.key = key;
    state.source = source || 'system';
    emit();
    return true;
  }

  window.__heroState = {
    keys: keys.slice(),
    get: function () { return { phase: state.phase, key: state.key, source: state.source }; },
    scrub: function (source) { return set('scrubbing', null, source || 'scroll'); },
    request: function (key, source) { return set('scrubbing', key, source || 'control'); },
    lock: function (key, source) { return set('locked', key, source || 'engine'); },
    navigate: function (key, source) { return set('navigating', key, source || 'link'); },
    pause: function (source) { return set('paused', null, source || 'visibility'); },
    resume: function (source) { return set('idle', null, source || 'visibility'); }
  };
})();
