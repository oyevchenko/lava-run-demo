/*
 * Lava Run: Inferno - the nine circles (theme data only, no game math).
 *
 * A run of N steps is split proportionally across the 9 circles:
 *   circleOf(k, N) = floor((k - 1) * 9 / N) + 1      for k = 1..N   (k = 0 is the Gate / base camp)
 * Step 1 is always Circle I (Limbo) and step N is always Circle IX (Treachery), for any N >= 9.
 * Purely presentational: it never changes multipliers, probabilities or outcomes.
 */
(function (root) {
  'use strict';
  var CIRCLES = [
    { n: 1, roman: 'I', name: 'Limbo', tag: 'Pale mist and quiet sighs', mood: 'misty' },
    { n: 2, roman: 'II', name: 'Lust', tag: 'Hold on to your laurels!', mood: 'winds' },
    { n: 3, roman: 'III', name: 'Gluttony', tag: 'Cold rain, warm mud', mood: 'rain' },
    { n: 4, roman: 'IV', name: 'Greed', tag: 'Heavy gold, light feet', mood: 'gold' },
    { n: 5, roman: 'V', name: 'Wrath', tag: 'Across the Styx swamp', mood: 'swamp' },
    { n: 6, roman: 'VI', name: 'Heresy', tag: 'Mind the burning tombs', mood: 'tombs' },
    { n: 7, roman: 'VII', name: 'Violence', tag: 'A river of fire!', mood: 'fire' },
    { n: 8, roman: 'VIII', name: 'Fraud', tag: 'Bridges of Malebolge', mood: 'ditches' },
    { n: 9, roman: 'IX', name: 'Treachery', tag: 'Frozen Cocytus - the stars await', mood: 'ice' }
  ];
  var GATE = { n: 0, roman: '', name: 'The Gate', tag: 'Abandon all hope... or cash out', mood: 'gate' };

  function circleOf(k, N) {
    if (!(k >= 1)) return 0;
    if (k > N) k = N;
    return Math.min(9, Math.floor((k - 1) * 9 / N) + 1);
  }
  function info(c) { return c >= 1 && c <= 9 ? CIRCLES[c - 1] : GATE; }
  /** steps per circle for an N-step run: array of 9 counts */
  function split(N) { var out = [0, 0, 0, 0, 0, 0, 0, 0, 0]; for (var k = 1; k <= N; k++) out[circleOf(k, N) - 1]++; return out; }
  /** first step index of each circle */
  function firstSteps(N) { var out = []; for (var k = 1; k <= N; k++) { var c = circleOf(k, N); if (out[c - 1] == null) out[c - 1] = k; } return out; }
  function label(c) { var i = info(c); return c ? 'Circle ' + i.roman + ' \u00b7 ' + i.name : i.name; }

  /*
   * Win tiers for the cash-out celebration (presentation only).
   *   Nice  < 5x  |  Big 5x - <25x  |  Mega 25x - <100x  |  Epic >= 100x (or the 10,000x cap)
   */
  var TIERS = [
    { id: 'nice', label: 'NICE!', min: 0, rank: 1 },
    { id: 'big', label: 'BIG WIN', min: 500, rank: 2 },
    { id: 'mega', label: 'MEGA WIN', min: 2500, rank: 3 },
    { id: 'epic', label: 'EPIC WIN', min: 10000, rank: 4 }
  ];
  function winTier(multCents) { var t = TIERS[0]; for (var i = 0; i < TIERS.length; i++) if (multCents >= TIERS[i].min) t = TIERS[i]; return t; }

  /*
   * Anticipation level before the reveal of step k (outcome-neutral: depends ONLY on k, N and the
   * multiplier at stake, never on the result, which the renderer is not allowed to hint at).
   *   0 = normal hop, 1 = drum-roll (>= 5x at stake or one of the last 3 steps), 2 = heartbeat (>= 25x or the last step)
   */
  function tension(k, N, multCents) {
    if (k >= N || multCents >= 2500) return 2;
    if (k >= N - 2 || multCents >= 500) return 1;
    return 0;
  }

  var api = { CIRCLES: CIRCLES, GATE: GATE, circleOf: circleOf, info: info, split: split, firstSteps: firstSteps, label: label,
    TIERS: TIERS, winTier: winTier, tension: tension };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LavaCircles = api;
})(this);
