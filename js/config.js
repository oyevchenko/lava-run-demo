/* Launch and operator config. Query wins over defaults. Math tables are not changed. */
(function (root) {
  'use strict';
  var q = new URLSearchParams(root.location.search);
  function num(name, d) { var n = parseFloat(q.get(name)); return isFinite(n) ? n : d; }
  function langOf(v) {
    v = (v || 'en').toLowerCase().replace('_', '-');
    if (v === 'ua' || v === 'uk' || v.indexOf('uk') === 0) return 'uk';
    if (v === 'pt' || v.indexOf('pt') === 0) return 'pt-BR';
    if (v.indexOf('es') === 0) return 'es';
    return 'en';
  }
  var rtp = parseInt(q.get('rtp'), 10);
  root.LAVA_CONFIG = {
    lang: langOf(q.get('lang')),
    currency: (q.get('currency') || 'COIN').toUpperCase(),
    mode: q.get('mode') === 'real' ? 'real' : 'demo',
    lobbyUrl: q.get('lobbyUrl') || '',
    rtp: rtp === 95 || rtp === 96 || rtp === 97 ? rtp : null,
    minBet: Math.max(1, Math.floor(num('minBet', 1))),
    maxBet: Math.max(1, Math.floor(num('maxBet', 500))),
    maxWinX: Math.max(1, num('maxWin', 10000)),
    autocash: q.get('autocash') !== '0',
    stake: q.get('channel') !== 'cash' && q.get('stake') !== '0',
    analyticsUrl: q.get('analyticsUrl') || ''
  };
})(this);
