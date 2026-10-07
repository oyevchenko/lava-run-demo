/*
 * Lava Run - RNG layer.
 *
 * The game only ever asks an RNG for "an unbiased integer in [0, n)".
 * CryptoRng uses crypto.getRandomValues (browser / Node >= 19 webcrypto).
 *
 * To move to a provably-fair, server-side model, replace this (and the
 * LocalRoundProvider in engine.js) with a provider whose integers are derived from
 *   HMAC_SHA256(serverSeed, clientSeed + ":" + nonce + ":" + step)
 * where sha256(serverSeed) is published before the round. See README.md.
 */
(function (root) {
  'use strict';

  function getCrypto() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) return globalThis.crypto;
    if (typeof require === 'function') return require('crypto').webcrypto;
    throw new Error('No crypto.getRandomValues available');
  }

  function CryptoRng() {
    var c = getCrypto();
    var buf = new Uint32Array(64);
    var pos = buf.length;
    function nextUint32() {
      if (pos >= buf.length) { c.getRandomValues(buf); pos = 0; }
      return buf[pos++];
    }
    return {
      name: 'crypto.getRandomValues',
      /** Unbiased integer in [0, n) via rejection sampling (n <= 2^32). */
      int: function (n) {
        var limit = 4294967296 - (4294967296 % n);
        var x;
        do { x = nextUint32(); } while (x >= limit);
        return x % n;
      }
    };
  }

  var api = { CryptoRng: CryptoRng };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LavaRng = api;
})(this);
