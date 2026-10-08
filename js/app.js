/* Lava Run: Inferno - UI controller. Talks to the game only through a RoundProvider (engine.js);
   circles, effects, music and idle cues are presentation only and never influence outcomes. */
(function () {
  'use strict';
  var STORE_KEY = 'lavaRun.v1';
  var cfg = window.LAVA_CONFIG || { lang: 'en', currency: 'COIN', mode: 'demo', lobbyUrl: '', rtp: null, minBet: 1, maxBet: 500, maxWinX: 10000, autocash: true, analyticsUrl: '' };
  var t = (window.LavaI18n && window.LavaI18n.t) || function (k) { return k; };
  var track = (window.LavaAnalytics && window.LavaAnalytics.track) || function () {};
  var START_COINS = 1000, MIN_BET = cfg.minBet, MAX_BET = Math.max(cfg.minBet, cfg.maxBet);
  var BET_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500].filter(function (b) { return b >= MIN_BET && b <= MAX_BET; });
  if (!BET_STEPS.length) BET_STEPS = [MIN_BET];
  var IDLE_1 = 4500, IDLE_2 = 10000; // gentle idle cues (no decision timer, no auto-actions)
  var $ = function (id) { return document.getElementById(id); };
  var C = window.LavaCircles;

  var store = (function () {
    try { var k = '__t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; }
    catch (e) { var m = {}; return { getItem: function (k) { return m[k] || null; }, setItem: function (k, v) { m[k] = String(v); } }; }
  })();

  function loadTables() {
    if (/^https?:$/.test(location.protocol) && window.fetch) {
      return fetch('data/lava-run-tables.json', { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch(function (e) { console.warn('JSON load failed, using embedded mirror', e); return window.LAVA_RUN_TABLES; });
    }
    return Promise.resolve(window.LAVA_RUN_TABLES); // file:// fallback (identical generated mirror)
  }

  function fmt(c) {
    var v = c / 100;
    if (!cfg.currency || cfg.currency === 'COIN') return v.toFixed(2);
    var loc = cfg.lang === 'pt-BR' ? 'pt-BR' : cfg.lang === 'uk' ? 'uk' : cfg.lang;
    var dec = cfg.currency === 'JPY' || cfg.currency === 'KRW' ? 0 : 2;
    try { return new Intl.NumberFormat(loc, { style: 'currency', currency: cfg.currency, minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v); }
    catch (e) { return v.toFixed(dec) + ' ' + cfg.currency; }
  }
  function fmtMult(c) { return (c / 100).toFixed(2) + 'x'; }

  loadTables().then(start).catch(function (e) { console.error(e); document.body.insertAdjacentHTML('beforeend', '<p style="color:#f88;padding:20px">Failed to load game data.</p>'); });

  /** ?qa=1|all -> idols spread over every circle + no lose (the run always reaches the last slab);
      ?qa=idols -> literally every slab an idol (reaches the MAX WIN cap early); ?qa=nolose -> safe slabs only;
      &lose=N forces a collapse on step N (loss / fall / soot preview) */
  function parseQa(qs) {
    if (!qs.has('qa')) return null;
    var v = (qs.get('qa') || '1').toLowerCase(), all = v === '1' || v === 'all' || v === 'true' || v === '';
    var o = { mode: all ? 'all' : /idol/.test(v) && /nolose/.test(v) ? 'idols' : /idol/.test(v) ? 'idols' : /nolose/.test(v) ? 'nolose' : 'all',
              lose: Math.max(0, parseInt(qs.get('lose'), 10) || 0) };
    o.idols = o.mode !== 'nolose'; o.nolose = true;
    return o;
  }
  /** QA rng: only step draws are forced (idol / safe, or a collapse on step `lose`); other draws (round ids) stay random.
      'all': J = the most idols the run can hold without hitting the max-win cap before the last slab, spread evenly
      over the run, so every circle, title card, idol reveal and (by cashing out earlier or later) every win tier shows. */
  function QaRng(model, round, o) {
    var real = LavaRng.CryptoRng(), planFor = {};
    function plan(r) {
      var key = r.difficulty + '/' + r.rtp; if (planFor[key] != null) return planFor[key];
      var N = model.steps(r.difficulty), J = 0;
      while (J < N && !model.isCap(model.multCents(r.rtp, r.difficulty, N, J + 1))) J++;
      return (planFor[key] = J);
    }
    return {
      name: 'QA MODE (forced outcomes, not random)',
      int: function (n) {
        if (n !== model.raw.rngScale) return real.int(n);
        var r = round(), d = r && model.difficulties[r.difficulty];
        if (!d) return real.int(n);
        var step = r.k + 1, N = model.steps(r.difficulty), IDOL = d.collapseThreshold, SAFE = n - 1; // collapse <= r < idol -> idol
        if (o.lose && step === o.lose) return 0;                                                   // r < collapse -> collapse
        if (!o.idols || !(d.idolThreshold > d.collapseThreshold)) return SAFE;
        if (o.mode === 'idols') return IDOL;
        var J = plan(r); return Math.floor(step * J / N) > Math.floor((step - 1) * J / N) ? IDOL : SAFE;
      }
    };
  }

  function start(tables) {
    var qs = new URLSearchParams(location.search), qParam = qs.has('quality') ? Math.max(0, Math.min(2, parseInt(qs.get('quality'), 10) || 0)) : null;
    var model = LavaEngine.LavaModel(tables);
    // ---- QA test mode (?qa=1, ?qa=nolose, ?qa=idols, ?qa=1&lose=N): forced outcomes so every animation, idol, circle
    // and win tier can be reviewed. It only swaps the RNG fed to the unchanged LocalRoundProvider (engine.js, tables and
    // RTP untouched), keeps its own wallet (separate storage key) and shows a QA MODE badge. Without ?qa nothing changes.
    var qa = parseQa(qs);
    if (qa) STORE_KEY += '.qa';
    var provider = LavaEngine.LocalRoundProvider(model, qa ? QaRng(model, function () { return provider.current(); }, qa) : LavaRng.CryptoRng());
    if (qa) { document.documentElement.classList.add('qa'); var qb = document.createElement('div'); qb.id = 'qaBadge'; qb.title = 'QA test mode: forced outcomes, separate wallet. Not real play.';
      var qaBits = ['QA MODE'];
      if (qa.lose && qa.mode === 'nolose') qaBits.push('SAFE UNTIL LOSE @' + qa.lose);
      else {
        if (qa.mode === 'idols') qaBits.push('ALL IDOLS');
        else if (qa.mode === 'nolose') qaBits.push('NO LOSE');
        else qaBits.push('IDOLS + NO LOSE');
        if (qa.lose) qaBits.push('LOSE @' + qa.lose);
      }
      qb.textContent = qaBits.join(' \u00b7 '); ($('stage') || document.body).appendChild(qb); }
    var assets = LavaAssets(window.LAVA_ASSET_MANIFEST, {});
    var audio = LavaAudio(assets);
    // splash stays up until the gate art and the standing hero are in; the bar tracks that, not a fake loop
    (function () {
      var sp = $('splash'); if (!sp) return;
      var fill = $('splashFill'), t0 = Date.now();
      if (assets.onProgress) assets.onProgress(function (done, total) { if (fill) fill.style.width = Math.round(100 * done / Math.max(1, total)) + '%'; });
      assets.ready.then(function () {
        if (fill) fill.style.width = '100%';
        setTimeout(function () { sp.classList.add('gone'); setTimeout(function () { sp.remove(); }, 600); }, Math.max(0, 400 - (Date.now() - t0)));
      });
    })();
    var streakLv = 0;
    var scene = LavaScene($('scene'), $('fx'), assets, { quality: qParam,
      onFirework: function () { audio.firework(); },
      onBubble: function (size, c) { audio.bubble(size, c); },
      onStreak: function (lv) { if (lv > streakLv) audio.aura(lv); streakLv = lv; audio.setStreak(lv); document.documentElement.classList.toggle('streak', lv > 0); document.documentElement.dataset.streak = lv; } });
    var timeScale = 1;
    function later(ms, fn) { return setTimeout(fn, ms / timeScale); }
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg) { try { tg.ready(); tg.expand(); } catch (e) {} }
    function haptic(kind) { try { if (tg && tg.HapticFeedback) { if (kind === 'success' || kind === 'error') tg.HapticFeedback.notificationOccurred(kind); else tg.HapticFeedback.impactOccurred(kind); } else if (navigator.vibrate && !st.calm) navigator.vibrate(kind === 'heavy' || kind === 'error' ? 50 : 12); } catch (e) {} }

    var saved = {};
    try { saved = JSON.parse(store.getItem(STORE_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    var reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    var legacyMute = saved.sound === false;
    var st = {
      balance: Number.isInteger(saved.balance) ? saved.balance : START_COINS * 100,
      bet: saved.bet || 10,
      diff: model.difficulties[saved.diff] ? saved.diff : 'medium',
      rtp: cfg.rtp && model.rtpOptions.indexOf(cfg.rtp) >= 0 ? cfg.rtp : (model.rtpOptions.indexOf(saved.rtp) >= 0 ? saved.rtp : model.defaultRtp),
      music: typeof saved.music === 'boolean' ? saved.music : !legacyMute,
      sfx: typeof saved.sfx === 'boolean' ? saved.sfx : !legacyMute,
      calm: typeof saved.calm === 'boolean' ? saved.calm : !!reduceMq.matches,
      history: Array.isArray(saved.history) ? saved.history.slice(0, 20) : [],
      autoStep: (cfg.stake || saved.playMode === 'slab') ? (saved.autoStep || 5) : (cfg.autocash ? (saved.autoStep || 0) : 0),
      round: null, last: null, busy: false, rounds: saved.rounds || 0
    };
    var shown = st.balance; // displayed balance (animated count-up toward st.balance)

    function save() {
      var r = provider.current();
      store.setItem(STORE_KEY, JSON.stringify({ balance: st.balance, bet: st.bet, diff: st.diff, rtp: st.rtp, music: st.music, sfx: st.sfx, calm: st.calm,
        history: st.history, rounds: st.rounds, autoStep: st.autoStep, playMode: cfg.stake ? 'slab' : 'cash', activeRound: r && r.status === 'active' ? r : null }));
    }

    // ---------- settings ----------
    function applySettings() {
      document.documentElement.classList.toggle('calm', st.calm);
      scene.setCalm(st.calm); scene.setReduced(!!reduceMq.matches);
      audio.setMusic(st.music); audio.setSfx(st.sfx);
      $('musicBtn').classList.toggle('off', !st.music); $('musicBtn').setAttribute('aria-pressed', st.music);
      $('sfxBtn').classList.toggle('off', !st.sfx); $('sfxBtn').setAttribute('aria-pressed', st.sfx);
      $('calmQuick').classList.toggle('on', st.calm); $('calmQuick').setAttribute('aria-pressed', st.calm);
      $('optMusic').checked = st.music; $('optSfx').checked = st.sfx; $('optCalm').checked = st.calm;
    }
    function setOpt(k, v) { st[k] = v; applySettings(); save(); audio.toggle(); }
    $('musicBtn').addEventListener('click', function () { setOpt('music', !st.music); });
    $('sfxBtn').addEventListener('click', function () { setOpt('sfx', !st.sfx); });
    $('calmQuick').addEventListener('click', function () { setOpt('calm', !st.calm); });
    $('optMusic').addEventListener('change', function (e) { setOpt('music', e.target.checked); });
    $('optSfx').addEventListener('change', function (e) { setOpt('sfx', e.target.checked); });
    $('optCalm').addEventListener('change', function (e) { setOpt('calm', e.target.checked); });
    document.documentElement.classList.toggle('stake', !!cfg.stake);
    // audio may only start after a user gesture
    function unlockAudio() { audio.unlock(); }
    document.addEventListener('pointerdown', unlockAudio, true); document.addEventListener('keydown', unlockAudio, true);

    // ---------- static UI ----------
    var ICON = { easy: 'leaf', medium: 'shield', hard: 'flame', extreme: 'skull' };
    var seg = $('diffSeg');
    model.difficultyIds.forEach(function (id) {
      var b = document.createElement('button'); b.dataset.d = id; b.setAttribute('role', 'tab');
      b.innerHTML = '<svg><use href="#i-' + (ICON[id] || 'flame') + '"/></svg><span>' + model.difficulties[id].label + '</span>';
      b.addEventListener('click', function () {
        st.round = null; st.busy = false; stakeRun = false;
        audio.click(); st.diff = id; st.last = null;
        var n = model.steps(id);
        if (!st.autoStep || st.autoStep > n) st.autoStep = Math.min(5, n);
        hideWin(); hideBanner(); resetScene(); renderAll(); save();
      });
      seg.appendChild(b);
    });
    var rseg = $('rtpSeg');
    model.rtpOptions.forEach(function (r) {
      var b = document.createElement('button'); b.textContent = r + '%'; b.dataset.r = r;
      b.addEventListener('click', function () { if (st.round || st.busy) return; st.rtp = r; st.last = null; resetScene(); renderAll(); save(); });
      rseg.appendChild(b);
    });
    $('capNote').textContent = model.cap.toLocaleString('en-US') + 'x';
    if ($('capNote2')) $('capNote2').textContent = model.cap.toLocaleString('en-US') + 'x';
    if ($('minBetNote')) $('minBetNote').textContent = String(MIN_BET);
    if ($('maxBetNote')) $('maxBetNote').textContent = String(MAX_BET);
    if ($('capCoinsNote')) $('capCoinsNote').textContent = (model.cap * MAX_BET).toLocaleString('en-US');
    if ($('buildNote')) $('buildNote').textContent = 'build ' + (window.LAVA_BUILD || 'dev');
    var desc = $('descent');
    for (var ci = 1; ci <= 9; ci++) { var pip = document.createElement('div'); pip.className = 'pip'; pip.textContent = C.info(ci).roman; pip.title = C.label(ci); desc.appendChild(pip); }

    function renderInfo() {
      $('diffTable').innerHTML = model.difficultyIds.map(function (id) {
        var d = model.difficulties[id], n = d.steps;
        return '<tr><td>' + d.label + '</td><td>' + n + '</td><td>' + (d.collapseProb * 100).toFixed(0) + '%</td><td>' +
          (d.idolProb * 100).toFixed(0) + '%</td><td>' + fmtMult(model.multCents(st.rtp, id, 1, 0)) + '</td><td>' + fmtMult(model.multCents(st.rtp, id, n, 0)) + '</td></tr>';
      }).join('');
      var detail = $('rtpDetail');
      if (detail) detail.textContent = 'Selected RTP ' + st.rtp + '% applies to every difficulty. Step 1 and the no-idol top above are at that RTP. Rounding down to 0.01x keeps the realised return at or below the target.';
      Array.prototype.forEach.call(rseg.children, function (b) { b.classList.toggle('active', +b.dataset.r === st.rtp); b.disabled = !!st.round; });
      rseg.classList.toggle('locked', !!st.round);
    }

    // ---------- rendering ----------
    function view() { return st.round || st.last; }
    function curK() { var v = view(); return v ? v.k : 0; }
    function curJ() { var v = view(); return v ? v.j : 0; }
    function ladderNow() { return model.ladder(st.rtp, st.diff, curJ()); }
    function resetScene() { scene.setDifficulty(st.diff); scene.setup(model.steps(st.diff), ladderNow(), 0); audio.setCircle(0); setFrameBg(0); multHold = null; }

    function renderLadder(lostAt) {
      var L = $('ladder'), lad = ladderNow(), k = curK(), N = lad.length, html = '', first = C.firstSteps(N);
      for (var i = 0; i < N; i++) {
        var step = i + 1, c = C.circleOf(step, N), cls = 'rung', isFirst = first[c - 1] === step;
        if (lostAt != null && i === lostAt - 1) cls += ' lost';
        else if (i < k) cls += ' done';
        else if (i === k && lostAt == null && !(st.last && !st.round)) cls += ' next';
        if (isFirst && step > 1) cls += ' sep';
        html += '<div class="' + cls + '" title="' + C.label(c) + '">' + (isFirst ? '<span class="c">' + C.info(c).roman + '</span>' : '') +
          '<div class="n">' + step + '</div><div class="m">' + fmtMult(lad[i]) + '</div></div>';
      }
      L.innerHTML = html;
      if (L.scrollWidth > L.clientWidth + 4 && getComputedStyle(L).flexWrap !== 'wrap') { var focus = L.children[Math.max(0, (lostAt || k) - 2)]; if (focus) L.scrollLeft = focus.offsetLeft - 10; }
    }
    function circleNow() { var v = view(); if (!v) return 0; var k = v.k + (st.last && st.last.status === 'lost' && !st.round ? 1 : 0); return C.circleOf(k, model.steps(st.diff)); }
    function renderCircle(c) {
      $('hudCircle').textContent = C.label(c);
      var med = $('hudMedal'); med.parentNode.classList.toggle('gate', !c);
      med.innerHTML = c ? C.info(c).roman : '<svg style="width:26px;height:26px;color:#fff;filter:drop-shadow(0 1.5px 0 #7a3f05)"><use href="#i-gate"/></svg>';
      Array.prototype.forEach.call(desc.children, function (p, i) { p.className = 'pip' + (i + 1 < c ? ' done' : i + 1 === c ? ' now' : ''); });
    }
    function renderHud() {
      var n = model.steps(st.diff), k = curK(), j = curJ(), hw = $('hudWin');
      $('hudStep').textContent = k + '/' + n;
      $('hudIdols').textContent = 'x' + Math.pow(2, j);
      $('idolBadge').classList.toggle('on', j > 0);
      hw.classList.remove('cashable');
      if (multHold != null && (st.round || (st.last && st.last.status !== 'lost'))) { $('hudMult').textContent = 'x' + (multHold / 100).toFixed(2); if (st.round) { if (k) { hw.textContent = 'Cash out: ' + fmt(st.round.bet * st.round.multCents); hw.classList.add('cashable'); } } else hw.textContent = 'Won ' + fmt(st.last.payoutCents) + ' coins'; }
      else if (st.round) {
        $('hudMult').textContent = 'x' + ((k ? st.round.multCents : 100) / 100).toFixed(2);
        if (k) { hw.textContent = t('cashOut', { amt: fmt(st.round.bet * st.round.multCents) }); hw.classList.add('cashable'); }
        else hw.textContent = t('takeFirst', { bet: st.round.bet });
      } else if (st.last) {
        $('hudMult').textContent = st.last.status === 'lost' ? 'x0.00' : 'x' + (st.last.multCents / 100).toFixed(2);
        hw.textContent = st.last.status === 'lost' ? t('lost', { amt: st.last.bet }) : t('won', { amt: fmt(st.last.payoutCents) });
        showNext(null);
      } else {
        $('hudMult').textContent = 'x1.00';
        hw.textContent = t('pressGo');
        showNext(model.multCents(st.rtp, st.diff, 1, 0));
      }
      if (st.round && k < n) showNext(model.multCents(st.rtp, st.diff, k + 1, j));
      else if (st.round) showNext(null);
      renderCircle(circleNow());
    }
    function showNext(cents) {
      var el = $('hudNext'); if (!el) return;
      if (cents == null) { el.hidden = true; return; }
      el.hidden = false; el.textContent = t('next').toUpperCase() + ' ' + fmtMult(cents);
    }
    function renderBalance() { $('balance').textContent = fmt(shown); }
    // multiplier counter: holds the old value until the sparks from the slab arrive, then rolls the digits up with a flash
    var multHold = null, multRaf = 0, multSafety = null;
    function rollMult(from, to) {
      cancelAnimationFrame(multRaf); clearTimeout(multSafety);
      var el = $('hudMult'), t0 = performance.now(), dur = (st.calm ? 260 : 520) / timeScale, lastShown = -1;
      el.classList.add('rolling');
      function tick(now) {
        var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = Math.round(from + (to - from) * e);
        multHold = v; if (v !== lastShown) { el.textContent = 'x' + (v / 100).toFixed(2); if (lastShown >= 0) audio.reel(); lastShown = v; }
        if (k < 1) multRaf = requestAnimationFrame(tick);
        else { multRaf = 0; multHold = null; el.classList.remove('rolling'); renderHud(); pop('hudMult', 'pop'); if (!st.calm) pop('plaque', 'flash'); }
      }
      multRaf = requestAnimationFrame(tick);
    }
    function holdMult(from) { multHold = from; clearTimeout(multSafety); multSafety = later(1600, function () { if (multHold != null && !multRaf) { multHold = null; renderHud(); } }); }
    // balance roll-up: the displayed number eases toward its target (coins arriving push the target up)
    var balTarget = null, balRaf = 0;
    function setShown(v) {
      balTarget = v; $('balance').parentNode.classList.add('rolling');
      if (balRaf) return;
      (function step() {
        var d = balTarget - shown;
        if (Math.abs(d) <= 1) { shown = balTarget; renderBalance(); balRaf = 0; $('balance').parentNode.classList.remove('rolling'); return; }
        shown += d > 0 ? Math.max(1, Math.round(d * 0.18)) : Math.min(-1, Math.round(d * 0.18)); renderBalance();
        if (Math.random() < 0.5) audio.tick();
        balRaf = requestAnimationFrame(step);
      })();
    }
    function fitBet() {
      if (st.round || st.busy) return;
      var afford = Math.floor(st.balance / 100);
      if (afford < MIN_BET || st.bet <= afford) return;
      var steps = BET_STEPS.filter(function (b) { return b <= afford; });
      st.bet = steps.length ? steps[steps.length - 1] : afford;
      save();
    }
    function renderControls() {
      fitBet();
      renderBalance();
      $('betVal').textContent = st.bet;
      var inRound = !!st.round;
      Array.prototype.forEach.call(seg.children, function (b) {
        b.classList.toggle('active', b.dataset.d === st.diff);
        b.setAttribute('aria-selected', b.dataset.d === st.diff);
        b.disabled = false;
      });
      seg.classList.toggle('locked', false);
      var active = inRound;
      var broke = !active && st.bet * 100 > st.balance;
      var active = !!st.round;
      $('goLabel').textContent = active ? t('step') : t('go');
      if (active) { var nk = st.round.k + 1; $('goSub').textContent = nk <= st.round.steps ? t('next') + ': ' + fmtMult(model.multCents(st.rtp, st.diff, nk, st.round.j)) : ''; }
      else if (cfg.stake && !st.autoStep) $('goSub').textContent = t('pick');
      else if (broke) $('goSub').textContent = Math.floor(st.balance / 100) < MIN_BET ? t('broke') : t('brokeLower');
      else $('goSub').textContent = t('bet') + ' ' + st.bet + ' · ' + t('next') + ' ' + fmtMult(model.multCents(st.rtp, st.diff, 1, 0));
      $('goBtn').disabled = st.busy || broke;
      $('goBtn').title = broke ? t('brokeTitle') : '';
      var canCash = !cfg.stake && active && st.round.k >= 1 && !st.busy;
      if ($('cashBtn')) {
        $('cashBtn').hidden = !!cfg.stake;
        $('cashBtn').disabled = !canCash; $('cashBtn').classList.toggle('ready', canCash);
        $('cashSub').textContent = canCash ? fmt(st.round.bet * st.round.multCents) : '\u2014';
        var cashSpan = $('cashBtn').querySelector('span'); if (cashSpan) cashSpan.textContent = t('cash');
      }
      var pw = $('possibleWin');
      if (pw) {
        pw.hidden = !cfg.stake;
        if (cfg.stake && st.autoStep) {
          var pm = model.multCents(st.rtp, st.diff, st.autoStep, 0);
          $('possibleTitle').textContent = t('possible');
          $('possibleAmt').textContent = fmt(st.bet * pm);
          $('possibleSub').textContent = t('ifHolds', { n: st.autoStep });
        }
      }
      ['betMinus', 'betPlus'].forEach(function (id) { $(id).disabled = active || st.busy; });
      Array.prototype.forEach.call(document.querySelectorAll('.chips .chip'), function (c) { c.disabled = active || st.busy; });
      $('refillBtn').disabled = st.busy || active || st.balance >= START_COINS * 100;
      $('rtpNote').textContent = 'RTP ' + st.rtp + '%';
      renderAuto();
      renderSlab();
    }
    function renderSlab() {
      var row = $('slabRow'); if (!row) return;
      row.hidden = !cfg.stake;
      if (!cfg.stake) return;
      var n = model.steps(st.diff);
      if (!st.autoStep || st.autoStep > n) st.autoStep = n;
      if (st.autoStep < 1) st.autoStep = 1;
      $('slabLabel').textContent = t('pickSlab');
      $('slabCap').textContent = t('slab');
      $('slabVal').textContent = String(st.autoStep);
      $('slabMult').textContent = fmtMult(model.multCents(st.rtp, st.diff, st.autoStep, 0));
      if ($('possibleAmt')) {
        var pm = model.multCents(st.rtp, st.diff, st.autoStep, 0);
        $('possibleTitle').textContent = t('possible');
        $('possibleAmt').textContent = fmt(st.bet * pm);
        $('possibleSub').textContent = t('ifHolds', { n: st.autoStep });
      }
      $('slabMinus').disabled = !!st.round || st.busy || st.autoStep <= 1;
      $('slabPlus').disabled = !!st.round || st.busy || st.autoStep >= n;
    }
    function nudgeSlab(d) {
      if (!cfg.stake || st.round || st.busy) return;
      var n = model.steps(st.diff);
      st.autoStep = Math.max(1, Math.min(n, (st.autoStep || 1) + d));
      audio.click(); save(); renderControls();
    }
    function renderAuto() {
      var row = $('autoRow'), seg = $('autoSeg'); if (!row || !seg) return;
      row.hidden = !cfg.autocash || !!cfg.stake;
      row.classList.toggle('locked', !!st.round || st.busy);
      $('autoLabel').textContent = t('auto');
      var n = model.steps(st.diff);
      var opts = cfg.stake
        ? [{ v: 3, l: '3' }, { v: 5, l: '5' }, { v: 10, l: '10' }, { v: n, l: 'MAX' }]
        : [{ v: 0, l: t('autoOff') }, { v: 3, l: '3' }, { v: 5, l: '5' }, { v: 10, l: '10' }, { v: n, l: 'MAX' }];
      if (cfg.stake && !st.autoStep) st.autoStep = Math.min(5, n);
      var key = opts.map(function (o) { return o.v + ':' + o.l; }).join(',');
      if (seg.dataset.key !== key) {
        seg.innerHTML = '';
        opts.forEach(function (o) {
          if (o.v && o.v > n) return;
          if (o.v && o.v !== n && opts.some(function (x) { return x !== o && x.v === o.v; })) return;
          var b = document.createElement('button'); b.type = 'button'; b.dataset.step = String(o.v); b.textContent = o.l; b.setAttribute('role', 'tab');
          b.addEventListener('click', function () {
            if (st.round || st.busy) return;
            st.autoStep = o.v; audio.click(); save(); renderControls();
          });
          seg.appendChild(b);
        });
        seg.dataset.key = key;
      }
      Array.prototype.forEach.call(seg.children, function (b) {
        var on = +b.dataset.step === (st.autoStep || 0);
        b.classList.toggle('active', on); b.setAttribute('aria-selected', on);
      });
    }
    function renderHistory() {
      $('history').innerHTML = st.history.map(function (h, i) {
        var tail = h.d + (h.k ? ' @' + h.k : '');
        return h.win ? '<span class="h w" data-i="' + i + '">' + fmtMult(h.mult) + '<span class="d">' + tail + '</span></span>'
                     : '<span class="h l" data-i="' + i + '">LAVA<span class="d">' + tail + '</span></span>';
      }).join('') || '<span class="h">' + t('none') + '</span>';
    }
    function renderAll(lostAt) {
      try { renderControls(); } catch (e) { console.error(e); }
      try { renderLadder(lostAt); } catch (e) { console.error(e); }
      try { renderHud(); } catch (e) { console.error(e); }
      try { renderHistory(); } catch (e) { console.error(e); }
      try { renderInfo(); } catch (e) { console.error(e); }
    }

    // ---------- banners / overlays ----------
    var bannerTimer = null;
    function banner(kind, big, small, ms) {
      var b = $('banner'); b.className = 'banner ' + kind; b.innerHTML = '<div class="big">' + big + '</div><div class="small">' + small + '</div>';
      clearTimeout(bannerTimer); bannerTimer = later(ms || 2600, hideBanner);
    }
    function hideBanner() { $('banner').className = 'banner hidden'; }
    var cbTimers = [];
    function circleBanner(c) {
      var el = $('circleBanner'), i = C.info(c);
      cbTimers.forEach(clearTimeout);
      el.className = 'circle-banner' + (c === 9 ? ' cb-ice' : '');
      el.innerHTML = '<div class="cb-medal"><span>' + i.roman + '</span></div><div class="cb-num">CIRCLE ' + i.roman + ' &middot; ' + i.name.toUpperCase() + '</div><div class="cb-name"><svg class="laurel" viewBox="0 0 48 24"><use href="#i-laurel"/></svg>' + i.name.toUpperCase() +
        '<svg class="laurel" viewBox="0 0 48 24" style="transform:scaleX(-1)"><use href="#i-laurel"/></svg></div><div class="cb-tag">' + i.tag + '</div>';
      el.dataset.c = c;
      cbTimers = [later(2000, function () { el.classList.add('out'); }), later(2450, function () { el.className = 'circle-banner hidden'; })];
    }
    function enterCircle(c) { scene.enterCircle(c); audio.portal(); audio.circle(c); audio.setCircle(c); circleBanner(c); setFrameBg(c); }
    function hideCircleBanner() { var el = $('circleBanner'); if (el.classList.contains('hidden') || el.classList.contains('out')) return; cbTimers.forEach(clearTimeout); el.classList.add('out'); cbTimers = [later(400, function () { el.className = 'circle-banner hidden'; })]; }
    function pop(id, cls) { var m = $(id); m.classList.remove(cls); void m.offsetWidth; m.classList.add(cls); }

    var win = { timer: null, raf: 0, done: null };
    function showWin(tier, amount, sub, payoutTarget) {
      hideWin(); hideBanner();
      var ov = $('winOverlay'), dur = (st.calm ? [0, 700, 1000, 1400, 1800] : [0, 900, 1500, 2300, 3200])[tier.rank] / timeScale;
      ov.className = 'win-overlay t-' + tier.id; $('winTitle').textContent = tier.label + (tier.rank === 1 ? '' : '!');
      $('winMult').textContent = sub; var t0 = performance.now(), amt = $('winAmount');
      function tick(now) { var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); amt.textContent = '+' + fmt(Math.round(amount * e)); if (k < 1) { audio.tick(); win.raf = requestAnimationFrame(tick); } else win.raf = 0; }
      win.raf = requestAnimationFrame(tick);
      win.done = function () { if (win.raf) cancelAnimationFrame(win.raf); win.raf = 0; amt.textContent = '+' + fmt(amount); };
      win.timer = setTimeout(hideWin, dur + 1500 / timeScale);
    }
    function hideWin() { clearTimeout(win.timer); if (win.done) win.done(); win.done = null; $('winOverlay').className = 'win-overlay hidden'; }
    $('winOverlay').addEventListener('click', hideWin);

    // balance count-up via coins flying from the hero to the balance pill
    function flyCoins(payout, rank) {
      var from = shown, n = [6, 8, 14, 22, 32][rank] || 8, arrived = 0;
      audio.whoosh();
      scene.coinFly($('balance'), n, function (i, total) {
        arrived++; audio.coin(i); setShown(arrived >= total ? st.balance : Math.min(st.balance, from + Math.round(payout * arrived / total))); pop('balance', 'bump');
      });
      later(3200, function () { if (shown !== st.balance && !balRaf) { shown = st.balance; renderBalance(); } });
    }

    // ---------- idle cues (friendly nudges only: no countdown, no auto-action, no sounds) ----------
    var idle = { t1: null, t2: null, level: 0 };
    function setIdle(l) {
      idle.level = l; scene.setIdleCue(l);
      var canCash = !!(st.round && st.round.k >= 1);
      $('goBtn').classList.toggle('nudge', l >= 1);
      $('cashBtn').classList.toggle('nudge', l >= 1 && canCash);
      var hint = $('idleHint'); hint.textContent = canCash ? t('idleCash') : t('idleStep');
      hint.classList.toggle('show', l >= 2);
    }
    function clearIdle() { clearTimeout(idle.t1); clearTimeout(idle.t2); if (idle.level) setIdle(0); }
    function armIdle() {
      clearIdle(); if (!st.round || st.busy || !$('modal').classList.contains('hidden')) return;
      idle.t1 = later(IDLE_1, function () { if (st.round && !st.busy) setIdle(1); });
      idle.t2 = later(IDLE_2, function () { if (st.round && !st.busy) setIdle(2); });
    }
    document.addEventListener('pointerdown', function (e) { if (st.round && !st.busy && !(e.target.closest && e.target.closest('#goBtn,#cashBtn'))) armIdle(); }, true);

    var DIFF_TAG = { easy: 'E', medium: 'M', hard: 'H', extreme: 'X' };
    function pushHistory(isWin, mult, k, round) {
      var r = round || {};
      st.history.unshift({ win: isWin, mult: mult, k: k, d: DIFF_TAG[st.diff] || st.diff[0].toUpperCase(),
        bet: r.bet, pay: r.payoutCents || 0, id: r.id || '', j: r.j || 0, t: Date.now(), path: (r.path || []).slice(), steps: r.steps || 0 });
      st.history = st.history.slice(0, 20);
    }

    // ---------- game actions ----------
    /** presentation of a settled win (balance was already credited and saved) */
    function presentWin(r, payout, auto) {
      var tier = C.winTier(r.multCents);
      if (auto === 'cap' && tier.rank < 4) tier = C.TIERS[3];
      var sub = (auto === 'cap' ? 'MAX WIN \u00b7 ' : auto === 'end' ? 'TO THE STARS! \u00b7 ' : '') + fmtMult(r.multCents) + ' \u00b7 ' + C.label(C.circleOf(r.k, r.steps));
      audio.win(tier); haptic('success'); if (tier.rank >= 2) audio.coinShower(tier.rank);
      showWin(tier, payout, sub);
      flyCoins(payout, tier.rank);
      renderAll();
      return scene.celebrate(tier);
    }
    function settleWin(res, auto) {
      st.balance += res.payoutCents;
      var r = res.round; st.round = null; st.last = r; st.rounds++;
      pushHistory(true, r.multCents, r.k, r);
      save();
      return r;
    }

    function doStep() {
      var prevK = st.round.k, k = prevK + 1, N = st.round.steps, prevMult = prevK ? st.round.multCents : 100;
      var stake = model.multCents(st.rtp, st.diff, k, st.round.j);
      var tension = C.tension(k, N, stake); // outcome-neutral anticipation
      st.busy = true; clearIdle(); renderControls(); hideBanner(); hideWin(); hideCircleBanner();
      audio.jump(); haptic('light');
      return provider.step().then(function (res) {
        // persist the result BEFORE animating, so closing the app mid-animation can't re-roll it
        var lost = res.outcome === 'collapse', wonRound = null;
        if (lost) { st.round = null; st.last = res.round; st.rounds++; pushHistory(false, 0, k, res.round); save(); }
        else if (res.auto) wonRound = settleWin({ payoutCents: res.payoutCents, round: res.round }, res.auto);
        else { st.round = res.round; track('step', { id: res.round.id, k: res.round.k, outcome: res.outcome, mult: res.multCents }); save(); }
        var cPrev = C.circleOf(prevK, N), cNew = C.circleOf(k, N);
        return scene.jumpTo(k, res.outcome, {
          tension: tension,
          onLand: function () { audio.land(); },
          onTension: function (lvl) { audio.tension(lvl); if (lvl) haptic('light'); },
          onReveal: function (outcome) {
            if (outcome === 'collapse') {
              audio.crack(); haptic('error'); scene.after(720, function () { audio.eruption(); });
              scene.after(300, function () { audio.giggle(); });
              scene.after(860, function () { audio.splash(); });
              scene.after(1150, function () { audio.loss(); });
              return;
            }
            audio.safe(k, N); audio.rune(); if (tension) scene.after(120, function () { audio.phew(); });
            scene.setLadder(model.ladder(st.rtp, st.diff, res.j), res.j);
            holdMult(prevMult);
            if (!wonRound) renderAll(); else { renderLadder(); renderHud(); }
            scene.multFly($('hudMult'), k, function () { rollMult(prevMult, res.multCents); });
            if (outcome === 'idol') { audio.idol(); audio.slowmo(); haptic('medium'); scene.idolFly($('idolBadge'), function () { pop('idolBadge', 'hit'); audio.coin(1); }); }
            if (cNew !== cPrev) {
              scene.after(outcome === 'idol' ? 1300 : 260, function () { enterCircle(cNew); });
            }
          }
        }).then(function () {
          if (lost) {
            banner('lose', t('lava'), t('lavaSub', { k: k, circle: C.label(cNew), bet: res.round.bet }), 2800);
            renderAll(k);
            track('loss', { id: res.round && res.round.id, k: k, bet: res.round && res.round.bet });
            return;
          }
          if (!wonRound && st.autoStep && res.round.k >= st.autoStep) {
            return provider.cashOut().then(function (cr) { track('cashout', { id: cr.round.id, auto: 'target', k: cr.round.k }); var r = settleWin(cr, 'target'); return presentWin(r, cr.payoutCents, 'target'); });
          }
          if (wonRound) return presentWin(wonRound, res.payoutCents, res.auto);
        });
      }).catch(function (e) { banner('info', t('fault'), t('faultSub')); console.error(e); }).then(function () {
        if (stakeRun && st.round && st.round.status === 'active') return doStep();
        stakeRun = false; st.busy = false; renderControls(); armIdle();
      });
    }

    var stakeRun = false;
    function onGo() {
      if (st.busy) return;
      if (st.round) return doStep();
      if (cfg.stake && !st.autoStep) { banner('info', t('pick'), t('stake')); return; }
      if (cfg.stake && st.autoStep > model.steps(st.diff)) st.autoStep = model.steps(st.diff);
      if (st.bet * 100 > st.balance) { banner('info', t('notEnough'), t('notEnoughSub')); return; }
      st.busy = true; hideWin(); hideBanner();
      provider.start({ bet: st.bet, difficulty: st.diff, rtp: st.rtp }).then(function (res) {
        st.balance -= st.bet * 100; shown = st.balance; st.round = res.round; st.last = null;
        track('round_start', { id: res.round.id, bet: st.bet, diff: st.diff, rtp: st.rtp });
        resetScene(); save(); renderAll();
        stakeRun = !!cfg.stake;
        return doStep();
      }).catch(function (e) { st.busy = false; banner('info', t('fault'), t('faultSub')); console.error(e); renderControls(); });
    }

    function onCash() {
      if (cfg.stake || st.busy || !st.round || st.round.k < 1) return;
      st.busy = true; clearIdle(); renderControls();
      provider.cashOut().then(function (res) { track('cashout', { id: res.round.id, k: res.round.k }); var r = settleWin(res, null); return presentWin(r, res.payoutCents, null); })
        .catch(function (e) { console.error(e); }).then(function () { st.busy = false; renderControls(); });
    }

    function setBet(v) { st.bet = Math.max(MIN_BET, Math.min(MAX_BET, Math.floor(v))); audio.click(); renderControls(); save(); }
    $('betMinus').addEventListener('click', function () { var lower = BET_STEPS.filter(function (b) { return b < st.bet; }); setBet(lower.length ? lower[lower.length - 1] : MIN_BET); });
    $('betPlus').addEventListener('click', function () { var higher = BET_STEPS.filter(function (b) { return b > st.bet; }); setBet(higher.length ? higher[0] : MAX_BET); });
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (c) {
      c.addEventListener('click', function () {
        var a = c.dataset.bet;
        if (a === 'half') setBet(st.bet / 2); else if (a === 'double') setBet(st.bet * 2);
        else setBet(Math.max(MIN_BET, Math.min(MAX_BET, Math.floor(st.balance / 100))));
      });
    });
    $('goBtn').addEventListener('click', onGo);
    if ($('cashBtn')) $('cashBtn').addEventListener('click', onCash);
    if ($('slabMinus')) $('slabMinus').addEventListener('click', function () { nudgeSlab(-1); });
    if ($('slabPlus')) $('slabPlus').addEventListener('click', function () { nudgeSlab(1); });
    $('refillBtn').addEventListener('click', function () {
      if (st.round || st.busy || st.balance >= START_COINS * 100) return;
      var add = START_COINS * 100 - st.balance; st.balance = START_COINS * 100; save(); audio.refill();
      banner('info', t('refill'), t('refillSub', { n: START_COINS }));
      flyCoins(add, 1); renderControls();
    });
    function openModal() { renderInfo(); clearIdle(); $('modal').classList.remove('hidden'); audio.click(); }
    function closeModal() { $('modal').classList.add('hidden'); armIdle(); }
    $('infoBtn').addEventListener('click', openModal);
    $('modalClose').addEventListener('click', closeModal);
    $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
    document.addEventListener('keydown', function (e) {
      if (!$('modal').classList.contains('hidden')) { if (e.key === 'Escape') closeModal(); return; }
      if (e.key === 'Escape') { hideWin(); return; }
      if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); onGo(); }
      else if (e.key === 'c' || e.key === 'C') onCash();
    });

    // ---------- desktop cabinet: scale the fixed reference layout to the window, blurred circle painting behind ----------
    var DESK = { w: 1040, h: 740 };
    function fitDesktop() {
      var de = document.documentElement, desk = innerWidth >= 900 && innerHeight >= 560;
      de.classList.toggle('desk', desk);
      if (!desk) { de.style.removeProperty('--s'); return; }
      var s = Math.min(innerWidth * 0.86 / DESK.w, (innerHeight - 76) / DESK.h);
      de.style.setProperty('--s', Math.max(0.6, s).toFixed(4));
    }
    window.addEventListener('resize', fitDesktop); fitDesktop();
    assets.ready.then(function () { var c = frameC; frameC = -1; setFrameBg(c < 0 ? circleNow() : c); });
    var frameC = -1, frameFlip = false;
    function setFrameBg(c) {
      var name = 'bg_circle_' + Math.max(1, c);
      var apply = function () {
        if (c === frameC) return;
        var m = assets.manifest && assets.manifest.images, src = m && m[name] && m[name].src;
        if (!src || assets.isFallback(name)) return;
        frameC = c;
        var url = new URL(assets.assetUrl ? assets.assetUrl(src) : (assets.manifest.basePath || 'assets/') + src, location.href).href;
        var a = $('frameBgA'), b = $('frameBgB'); if (!a || !b) return;
        var on = frameFlip ? a : b, off = frameFlip ? b : a; frameFlip = !frameFlip;
        on.style.backgroundImage = 'url("' + url + '")'; on.classList.add('on'); off.classList.remove('on');
      };
      if (assets.ensure) assets.ensure(name).then(apply); else apply();
    }

    // ---------- boot ----------
    applySettings();
    resetScene();
    var ar = saved.activeRound;
    if (ar && ar.status === 'active' && model.difficulties[ar.difficulty] && model.rtpOptions.indexOf(ar.rtp) >= 0) {
      provider.resume(ar).then(function (res) {
        st.round = res.round; st.diff = ar.difficulty; st.rtp = ar.rtp;
        scene.setDifficulty(st.diff); scene.setup(model.steps(st.diff), ladderNow(), st.round.j); scene.restore(st.round.k, st.round.path);
        audio.setCircle(C.circleOf(st.round.k, st.round.steps)); setFrameBg(C.circleOf(st.round.k, st.round.steps));
        renderAll(); armIdle();
      });
    }
    if (cfg.lobbyUrl && $('homeBtn')) { $('homeBtn').hidden = false; $('homeBtn').title = t('home'); $('homeBtn').addEventListener('click', function () { location.href = cfg.lobbyUrl; }); }
    Array.prototype.forEach.call(document.querySelectorAll('#langSeg button'), function (b) {
      b.classList.toggle('active', b.dataset.lang === cfg.lang);
      b.addEventListener('click', function () { var u = new URL(location.href); u.searchParams.set('lang', b.dataset.lang); location.href = u.href; });
    });
    if ($('modeNote')) $('modeNote').textContent = (cfg.stake ? t('stake') : (cfg.mode === 'real' ? t('real') : t('demo'))) + ' · ' + (window.LAVA_BUILD || '');
    document.documentElement.classList.toggle('stake', !!cfg.stake);
    var help = $('deskHelp');
    if (help && $('deskBody')) {
      $('deskTitle').textContent = t('how');
      $('deskBody').innerHTML = '<p>' + t('how1') + '</p><p>' + (cfg.stake ? t('stakeRule2') : t('how2')) + '</p><p>' + t('how3') + '</p>';
      $('deskToggle').addEventListener('click', function () {
        var open = help.classList.toggle('open');
        $('deskBody').hidden = !open;
        $('deskToggle').setAttribute('aria-expanded', open);
      });
    }
    if (cfg.stake && $('stakeRules')) {
      $('stakeHead').hidden = false; $('stakeRules').hidden = false;
      $('stakeRules').innerHTML = '<li>' + t('stakeRule1') + '</li><li>' + t('stakeRule2') + '</li><li>' + t('stakeRule3') + '</li>';
    }
    var openRound = null;
    function showRound(h) {
      openRound = h; $('roundTitle').textContent = t('round') + (h.id ? ' ' + h.id : '');
      $('roundBody').textContent = t('detail', { bet: h.bet != null ? h.bet : '?', result: h.win ? t('won', { amt: fmt(h.pay || 0) }) : t('lost', { amt: h.bet || 0 }), steps: h.k, j: Math.pow(2, h.j || 0) });
      $('roundPath').textContent = (h.path || []).join(' · ') || '';
      $('roundReplay').querySelector('span').textContent = t('replay');
      $('roundModal').classList.remove('hidden');
    }
    $('history').addEventListener('click', function (e) {
      var chip = e.target.closest ? e.target.closest('.h') : null;
      if (!chip || chip.dataset.i == null) return;
      showRound(st.history[+chip.dataset.i]);
    });
    $('roundClose').addEventListener('click', function () { $('roundModal').classList.add('hidden'); });
    $('roundModal').addEventListener('click', function (e) { if (e.target === $('roundModal')) $('roundModal').classList.add('hidden'); });
    $('roundReplay').addEventListener('click', function () {
      var h = openRound; if (!h || !h.path || st.busy || st.round) return;
      $('roundModal').classList.add('hidden');
      st.busy = true; renderControls(); resetScene();
      var i = 0;
      (function next() {
        if (i >= h.path.length) { st.busy = false; renderControls(); return; }
        var oc = h.path[i++]; scene.jumpTo(i, oc, {}).then(next);
      })();
    });
    var replayId = qs.get('replay');
    if (replayId) { var found = st.history.filter(function (h) { return h.id === replayId; })[0]; if (found) showRound(found); }

    renderAll();
    (function coach() {
      var el = $('coach'), text = $('coachText'), btn = $('coachNext');
      if (el && document.documentElement.classList.contains('desk')) $('app').appendChild(el);
      if (!el || qa || store.getItem('lavaRun.seenCoach')) return;
      var tips = [t('tip1'), t('tip2'), t('tip3')];
      var i = 0;
      function show() { text.textContent = tips[i]; btn.textContent = i < tips.length - 1 ? t('nextBtn') : t('gotIt'); el.classList.remove('hidden'); }
      function hide() { el.classList.add('hidden'); store.setItem('lavaRun.seenCoach', '1'); }
      btn.addEventListener('click', function () { i++; if (i >= tips.length) hide(); else show(); });
      $('goBtn').addEventListener('click', function () { if (!el.classList.contains('hidden')) hide(); });
      show();
    })();

    // hooks for automated tests: read-only state + purely visual controls (no way to influence outcomes or balance)
    window.__lavaRun = {
      ready: true,
      state: function () { return { balance: st.balance, shownBalance: shown, bet: st.bet, diff: st.diff, rtp: st.rtp, busy: st.busy, calm: st.calm, music: st.music, sfx: st.sfx,
        round: st.round ? JSON.parse(JSON.stringify(st.round)) : null, history: st.history.slice(), rounds: st.rounds, provider: provider.kind, rng: provider.rngName, qa: qa,
        circle: circleNow(), idleCue: idle.level }; },
      events: function () { return window.LavaAnalytics ? window.LavaAnalytics.events() : []; },
      providerRound: function () { return provider.current(); },
      setTimeScale: function (v) { timeScale = v > 0 ? v : 1; scene.setTimeScale(timeScale); if (st.round && !st.busy) armIdle(); },
      sceneStats: function () { return scene.stats(); },
      setQuality: function (q) { scene.setQuality(q); },
      audioState: function () { return audio.state(); },
      assetStats: function () { return assets.stats(); },
      /** visual-only preview of rare celebrations for screenshots: never touches balance, round or RNG */
      fxPreview: function (kind, arg) {
        if (kind === 'win') { var tier = C.TIERS[Math.max(0, Math.min(3, (arg | 0) - 1))], m = [0, 340, 1260, 4880, 21500][tier.rank]; showWin(tier, st.bet * m, 'PREVIEW \u00b7 ' + fmtMult(m)); scene.celebrate(tier); scene.coinFly($('balance'), 14, function () {}); audio.win(tier); }
        else if (kind === 'circle') { enterCircle(arg); }
        else if (kind === 'erupt') { scene.eruptNow(); }
      }
    };
  }
})();
