/* Client analytics. Events stay on the page; analyticsUrl gets a beacon if set. */
(function (root) {
  'use strict';
  var events = [];
  var t0 = Date.now();
  function track(name, data) {
    var ev = { name: name, t: Date.now(), sessionMs: Date.now() - t0, data: data || {} };
    events.push(ev);
    if (events.length > 200) events.shift();
    var url = root.LAVA_CONFIG && root.LAVA_CONFIG.analyticsUrl;
    if (url && root.navigator && navigator.sendBeacon) {
      try { navigator.sendBeacon(url, JSON.stringify(ev)); } catch (e) {}
    }
    return ev;
  }
  root.LavaAnalytics = { track: track, events: function () { return events.slice(); }, since: function () { return Date.now() - t0; } };
  track('boot', { build: root.LAVA_BUILD || '' });
})(this);
