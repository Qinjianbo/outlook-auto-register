// hsprotect progress bridge — read-only.
//
// Two halves, both in this one file (all_frames: true):
//  - Inside the hsprotect iframe: observe the press-and-hold progress and
//    postMessage it to the parent window. The page's own JS cannot read
//    cross-origin iframe internals, but a content script runs inside the
//    iframe's own origin, so it can.
//  - In the top frame: listen for those messages and expose the latest
//    progress on <html> data attributes, where CDP Runtime.evaluate can read
//    it. The DOM is shared across isolated worlds; JS variables are not,
//    which is why this goes through attributes instead of window properties.
//
// It never modifies the challenge, never clicks, never types. If the
// progress ring is drawn on canvas (no DOM signal), readProgress returns
// null and the driver falls back to fixed-duration presses.
(function () {
  'use strict';

  var IS_TOP = window === window.top;
  var IN_HSPROTECT = /hsprotect\.net$/i.test(location.hostname);

  function clamp01(v) {
    if (typeof v !== 'number' || isNaN(v)) return null;
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
  }

  function readProgress() {
    // (1) SVG ring: stroke-dashoffset vs stroke-dasharray
    var circles = document.querySelectorAll('circle[stroke-dasharray]');
    for (var i = 0; i < circles.length; i++) {
      var dash = parseFloat(circles[i].getAttribute('stroke-dasharray')) || 0;
      var off = parseFloat(circles[i].getAttribute('stroke-dashoffset'));
      if (dash > 0 && !isNaN(off)) return clamp01(1 - off / dash);
    }
    // (2) aria progress
    var aria = document.querySelector('[aria-valuenow]');
    if (aria) {
      var now = parseFloat(aria.getAttribute('aria-valuenow'));
      var max = parseFloat(aria.getAttribute('aria-valuemax')) || 100;
      if (!isNaN(now)) return clamp01(now / max);
    }
    // (3) fill bar: width % or scaleX
    var bars = document.querySelectorAll('[class*=progress], [class*=fill], [class*=ring]');
    for (var j = 0; j < bars.length; j++) {
      var style = bars[j].style || {};
      if (style.width && style.width.indexOf('%') > -1) {
        return clamp01(parseFloat(style.width) / 100);
      }
      if (style.transform) {
        var m = /scaleX\(([\d.]+)\)/.exec(style.transform);
        if (m) return clamp01(parseFloat(m[1]));
      }
    }
    // (4) text like "85%"
    var txt = (document.body && document.body.innerText) || '';
    var pct = /(\d{1,3})\s*%/.exec(txt);
    if (pct) return clamp01(parseInt(pct[1], 10) / 100);
    return null;
  }

  function checkCleared() {
    var txt = ((document.body && document.body.innerText) || '').toLowerCase();
    return txt.indexOf('verified') > -1 ||
      txt.indexOf('success') > -1 ||
      txt.indexOf('验证成功') > -1 ||
      txt.indexOf('验证通过') > -1;
  }

  function postProgress(progress, cleared) {
    try {
      window.parent.postMessage(
        { type: 'HS_PROGRESS', src: 'hsprotect-progress', progress: progress, cleared: !!cleared },
        '*'
      );
    } catch (e) { /* cross-origin postMessage to a navigated-away parent */ }
  }

  if (IN_HSPROTECT) {
    var lastSent = -1;
    // Announce presence immediately so the driver knows the bridge is alive.
    postProgress(0, false);
    setInterval(function () {
      try {
        if (checkCleared()) {
          postProgress(1, true);
          return;
        }
        var p = readProgress();
        if (p !== null && Math.abs(p - lastSent) >= 0.02) {
          lastSent = p;
          postProgress(p, false);
        }
      } catch (e) { /* DOM churn during challenge transitions */ }
    }, 150);
  }

  if (IS_TOP) {
    window.addEventListener('message', function (ev) {
      try {
        var d = ev.data || {};
        if (d.type !== 'HS_PROGRESS' || d.src !== 'hsprotect-progress') return;
        var el = document.documentElement;
        if (!el) return;
        el.setAttribute('data-hsprotect-progress', String(d.progress));
        el.setAttribute('data-hsprotect-cleared', d.cleared ? '1' : '0');
        el.setAttribute('data-hsprotect-observed', '1');
      } catch (e) { /* attribute write during navigation */ }
    });
  }
})();
