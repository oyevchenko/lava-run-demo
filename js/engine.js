/*
 * Lava Run - game math engine (pure logic, no DOM). Works in browser and Node.
 *
 * Uses EXACTLY the multiplier tables produced by math/lava_model.py
 * (data/lava-run-tables.json). All money is integer "centi-coins" (1 coin = 100).
 *
 * Step rule (identical to the simulator):
 *   r = rng.int(rngScale)              // uniform integer in [0, 10000)
 *   r <  collapseThreshold  -> slab collapses, round lost
 *   r <  idolThreshold      -> safe slab + Golden Idol (j += 1, multiplier x2)
 *   otherwise               -> safe slab
 * Cash-out multiplier after k safe steps with j idols = tables[rtp][diff].multipliersCents[k-1][j] / 100
 * Auto cash-out on the last slab or when the multiplier reaches the max-win cap.
 */
(function (root) {
  'use strict';

  function LavaModel(tables) {
    var self = {
      raw: tables,
      cap: tables.cap,
      rtpOptions: tables.rtpOptions,
      defaultRtp: tables.defaultRtp,
      difficulties: tables.difficulties,
      difficultyIds: Object.keys(tables.difficulties),
      steps: function (diff) { return tables.difficulties[diff].steps; },
      /** multiplier (cents, i.e. x100) after k safe steps (1..N) with j idols */
      multCents: function (rtp, diff, k, j) {
        var row = tables.tables[String(rtp)][diff].multipliersCents[k - 1];
        return row[Math.min(j, row.length - 1)];
      },
      /** ladder for the current idol count: array index k-1 -> cents */
      ladder: function (rtp, diff, j) {
        var out = [], n = self.steps(diff);
        for (var k = 1; k <= n; k++) out.push(self.multCents(rtp, diff, k, Math.min(j, k)));
        return out;
      },
      isCap: function (cents) { return cents >= tables.cap * 100; },
      /** maps one RNG integer to a step outcome */
      outcome: function (diff, r) {
        var d = tables.difficulties[diff];
        if (r < d.collapseThreshold) return 'collapse';
        if (r < d.idolThreshold) return 'idol';
        return 'safe';
      }
    };
    return self;
  }

  /*
   * LocalRoundProvider: runs a round on the client. Its async interface is the
   * contract a future server (provably-fair RGS) provider must implement:
   *   start({bet, difficulty, rtp}) -> {round}
   *   step()                        -> {outcome, k, j, multCents, auto, payoutCents, round}
   *   cashOut()                     -> {payoutCents, multCents, round}
   *   resume(savedRound)            -> {round}
   */
  function LocalRoundProvider(model, rng) {
    var round = null;
    function snapshot() { return round ? JSON.parse(JSON.stringify(round)) : null; }
    function settle(status, multCents) {
      round.status = status;
      round.multCents = multCents;
      round.payoutCents = status === 'lost' ? 0 : round.bet * multCents; // bet in coins * x100 = centi-coins
      return round.payoutCents;
    }
    return {
      kind: 'local',
      rngName: rng.name,
      start: function (opts) {
        if (round && round.status === 'active') return Promise.reject(new Error('round already active'));
        if (!model.difficulties[opts.difficulty]) return Promise.reject(new Error('bad difficulty'));
        if (model.rtpOptions.indexOf(opts.rtp) < 0) return Promise.reject(new Error('bad rtp'));
        if (!(opts.bet > 0) || Math.floor(opts.bet) !== opts.bet) return Promise.reject(new Error('bad bet'));
        round = { id: Date.now().toString(36) + '-' + rng.int(1e9).toString(36), bet: opts.bet,
                  difficulty: opts.difficulty, rtp: opts.rtp, k: 0, j: 0, steps: model.steps(opts.difficulty),
                  status: 'active', multCents: 0, payoutCents: 0, path: [] };
        return Promise.resolve({ round: snapshot() });
      },
      resume: function (saved) {
        round = JSON.parse(JSON.stringify(saved));
        return Promise.resolve({ round: snapshot() });
      },
      step: function () {
        if (!round || round.status !== 'active') return Promise.reject(new Error('no active round'));
        var r = rng.int(model.raw.rngScale);
        var oc = model.outcome(round.difficulty, r);
        round.path.push(oc);
        var res = { outcome: oc, auto: null, payoutCents: 0 };
        if (oc === 'collapse') {
          settle('lost', 0);
        } else {
          round.k += 1;
          if (oc === 'idol') round.j += 1;
          var m = model.multCents(round.rtp, round.difficulty, round.k, round.j);
          round.multCents = m;
          if (model.isCap(m)) { res.auto = 'cap'; res.payoutCents = settle('won', m); }
          else if (round.k >= round.steps) { res.auto = 'end'; res.payoutCents = settle('won', m); }
        }
        res.k = round.k; res.j = round.j; res.multCents = round.multCents;
        res.round = snapshot();
        return Promise.resolve(res);
      },
      cashOut: function () {
        if (!round || round.status !== 'active') return Promise.reject(new Error('no active round'));
        if (round.k < 1) return Promise.reject(new Error('take at least one step first'));
        var p = settle('won', round.multCents);
        return Promise.resolve({ payoutCents: p, multCents: round.multCents, round: snapshot() });
      },
      current: snapshot
    };
  }

  var api = { LavaModel: LavaModel, LocalRoundProvider: LocalRoundProvider };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LavaEngine = api;
})(this);
