/*
 * Lava Run: Inferno - Canvas2D renderer. Purely visual: it never decides outcomes (Math.random and the
 * seeded PRNG are used ONLY for decoration). The app tells it what happened; it animates it.
 *
 * World: a pseudo-3D "descent" corridor. Slab k sits at depth z = k*S; the camera looks down the corridor,
 * so slabs ahead converge toward a vanishing point (the funnel of Hell). Depth zones map to the 9 circles
 * (LavaCircles.circleOf), so the hazard, props and arches ahead already show the next circle.
 */
(function (root) {
  'use strict';
  var A = root.LavaArt, U = A.util, C = root.LavaCircles;
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function elastic(t) { return t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1; }
  var FONT = '"Lilita One", "Arial Black", system-ui, sans-serif', SERIF = '"Cinzel", Georgia, serif';

  function Scene(canvas, fxCanvas, assets, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d'), fctx = fxCanvas ? fxCanvas.getContext('2d') : null;
    var W = 390, H = 470, dpr = 1, K = 1, hy = 90, gy = 395, cx = 195;
    var F = 260, S = 110, L = 150, SLAB = 0.41, HERO = 0.19, COL = 0.42, painted = false;
    var quality = 2, forcedQuality = opts.quality != null ? opts.quality : null, calm = false, reduced = false, timeScale = 1;
    var t = 0, last = 0, lastFrameWall = 0, frames = 0, fpsAcc = 0, fps = 60, slowFor = 0;
    var N = 24, ladder = [], idolCount = 0, slabs = [];
    var camZ = 0, camX = 0, camZTarget = 0;
    var hero = { z: 0, x: 0, hop: 0, pose: 'hero_idle', sx: 1, sy: 1, rot: 0, alpha: 1, visible: true, flip: 1, anim: null, idleSince: 0, blinkAt: 2, blinkUntil: 0, personality: null, sink: 0, bubble: null };
    var parts = [], amb = [], floaters = [], fxParts = [], timers = [];
    var shake = 0, flash = { a: 0, c: '255,220,140' }, rays = null, desat = 0, glowPulse = 0;
    var circleNow = 0, circleFrom = 0, circleFade = 1;
    var impMood = { type: 'idle', until: 0 }, flyer = null, nextFlyer = 12;
    var idleCue = 0, cueT0 = 0, peek = null; // gentle 'still there?' cues during an active run (no timer, no pressure)
    var patterns = {}, flameCache = {}, rayCanvas = null, vignette = null, fxActive = false;
    var MAXP = [70, 160, 280];
    var assetRev = 0;

    // ---------- timers in scene time (time-scale aware) ----------
    function after(ms, fn) { timers.push({ at: t + ms / 1000, fn: fn }); }
    function wait(ms) { return new Promise(function (res) { after(ms, res); }); }
    function runTimers() { for (var i = timers.length - 1; i >= 0; i--) if (timers[i].at <= t) { var f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (e) { console.error(e); } } }

    // ---------- layout ----------
    function resize() {
      var r = canvas.getBoundingClientRect();
      var cap = [1, 1.5, 2][quality];
      dpr = Math.min(window.devicePixelRatio || 1, cap);
      W = Math.max(200, r.width); H = Math.max(200, r.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      layout();
      patterns = {};
      if (fxCanvas) { var fd = Math.min(window.devicePixelRatio || 1, 2); fxCanvas.width = Math.round(innerWidth * fd); fxCanvas.height = Math.round(innerHeight * fd); fxCanvas.dpr = fd; }
      buildAmbient();
    }
    function layout() {
      // with painted backdrops the sky band gets more room (the painting carries the scene's mood)
      painted = !!(assets.hasBand && assets.hasBand());
      K = clamp(Math.min(W / 390, H / 470), 0.72, 2.2);
      var land = W > H * 1.1;
      hy = H * (land ? (painted ? 0.26 : 0.2) : (painted ? 0.29 : 0.19)); gy = H * (land ? 0.86 : 0.85); cx = W / 2;
      L = land ? 175 : 150; HERO = painted ? 0.215 : 0.19;
      vignette = null;
    }
    function proj(z, x, h) {
      var d = z - camZ; if (d < -0.62 * F) return null;
      var s = F / (F + d);
      return { x: cx + (x - camX) * s * K, y: hy + (gy - hy) * s - (h || 0) * s * K, s: s, d: d };
    }
    function zoneCircle(z) { var k = Math.round(z / S); if (k <= 0) return 0; return C.circleOf(Math.min(k, N), N); }
    function slabX(i) { if (i <= 0) return 0; return Math.sin(i * 2.15 + 0.7) * 70 * (i % 3 === 0 ? 0.55 : 1); }
    function depthAlpha(d) { var a = 1; if (d < -0.12 * S) a = clamp(1 + (d + 0.12 * S) / (0.42 * S), 0, 1); if (d > 7 * S) a *= clamp(1 - (d - 7 * S) / (3.5 * S), 0, 1); return a; }

    // ---------- round setup ----------
    function setup(steps, newLadder, j) {
      N = steps; ladder = newLadder.slice(); idolCount = j || 0;
      slabs = [];
      for (var i = 0; i <= N; i++) slabs.push({ state: i === 0 ? 'passed' : 'idle', idol: false, idolT: -1, frags: null, wob: 0, crackT: -1, ring: -1 });
      hero.z = 0; hero.x = 0; hero.hop = 0; hero.anim = null; hero.pose = 'hero_idle'; hero.visible = true; hero.alpha = 1; hero.sink = 0; hero.rot = 0; hero.sx = hero.sy = 1; hero.bubble = null; hero.idleSince = t;
      camZ = camZTarget = 0; camX = 0; rays = null; floaters = []; parts = []; desat = 0;
      setCircle(0, true);
    }
    function setLadder(l, j) { ladder = l.slice(); idolCount = j; }
    function restore(k, path) {
      var kk = 0;
      for (var i = 0; i < path.length; i++) { if (path[i] === 'collapse') break; kk++; slabs[kk].state = 'passed'; if (path[i] === 'idol') { slabs[kk].idol = true; slabs[kk].idolT = -99; } }
      hero.z = k * S; hero.x = slabX(k); camZ = camZTarget = hero.z; camX = hero.x * 0.35;
      setCircle(C.circleOf(k, N), true);
    }
    function setCircle(c, instant) {
      if (c === circleNow && !instant) return;
      circleFrom = instant ? c : circleNow; circleNow = c; circleFade = instant ? 1 : 0;
      buildAmbient();
    }

    // ---------- sequences ----------
    /**
     * Jump to slab k. outcome is only used AFTER the reveal; everything before it (hop, landing,
     * anticipation) is identical for every outcome. opts: {tension, onLand, onTension, onReveal}
     */
    function jumpTo(k, outcome, o) {
      o = o || {};
      setIdleCue(0); if (peek) peek = null;
      var tension = o.tension || 0, from = { z: hero.z, x: hero.x }, to = { z: k * S, x: slabX(k) };
      hero.flip = to.x >= from.x ? 1 : -1;
      return new Promise(function (resolve) {
        hero.anim = { type: 'jump', t0: t, from: from, to: to, dur: 0.44, pre: 0.09 };
        after(530, function () { // landed
          hero.anim = { type: 'land', t0: t }; hero.z = to.z; hero.x = to.x; hero.hop = 0;
          dust(to.z, to.x, 12); ring(k, 0.5);
          if (o.onLand) o.onLand();
          var tensionMs = tension === 2 ? 620 : tension === 1 ? 360 : 0;
          if (tensionMs) { slabs[k].wob = tensionMs / 1000; hero.pose = 'hero_nervous'; glowPulse = tensionMs / 1000; if (o.onTension) o.onTension(tension); }
          after(tensionMs + 40, function () {
            if (o.onReveal) o.onReveal(outcome);
            if (outcome === 'collapse') { collapse(k, resolve); return; }
            slabs[k].state = 'passed'; hero.pose = 'hero_idle'; hero.idleSince = t;
            sparkle(k, tension ? 16 : 9); ring(k, 0.9);
            var v = ladder[k - 1];
            if (v != null) floatText('x' + (v / 100).toFixed(2), to.z, to.x, 150, '#ffe680', 30, 1.1);
            if (tension) floatText(tension === 2 ? 'PHEW!!' : 'PHEW!', to.z, to.x, 210, '#ffffff', tension === 2 ? 40 : 32, 1.2, -0.08);
            hero.anim = { type: 'bounce', t0: t };
            if (outcome === 'idol') idolReveal(k);
            after(outcome === 'idol' ? 260 : 120, resolve);
          });
        });
      });
    }
    function idolReveal(k) {
      var s = slabs[k]; s.idol = true; s.idolT = t;
      hero.pose = 'hero_idol'; hero.anim = { type: 'cheer', t0: t };
      var p = proj(k * S, slabX(k), 60);
      rays = { z: k * S, x: slabX(k), h: 120, age: 0, life: calm ? 1.2 : 1.6, scale: calm ? 0.8 : 1.15, color: '255,214,90' };
      stamp('IDOL x2!', '#ffd23c');
      burst(k * S, slabX(k), 130, calm ? 14 : 34, 'spark');
      flashOn(calm ? 0.1 : 0.28, '255,214,90');
      impReact('cheer', 1.6);
      after(1150, function () { if (hero.pose === 'hero_idol') hero.pose = 'hero_idle'; });
    }
    function collapse(k, resolve) {
      var s = slabs[k];
      s.state = 'cracking'; s.crackT = t; shakeOn(4);
      after(300, function () {
        s.state = 'collapsed'; s.frags = makeFrags(k);
        hero.pose = 'hero_fall'; hero.anim = { type: 'fall', t0: t };
        shakeOn(6); desat = calm ? 0.25 : 0.6; flashOn(calm ? 0.08 : 0.22, '255,90,30');
        burst(k * S, slabX(k), 10, calm ? 12 : 26, 'lava');
        after(560, function () {
          splash(k * S, slabX(k)); shakeOn(3);
          floatText(Math.random() < 0.5 ? 'SIZZLE!' : 'OOPS!', k * S, slabX(k), 120, '#ffb36b', 40, 1.3, 0.1);
          impReact('giggle', 2.2);
          after(420, function () { hero.bubble = { t0: t, z: k * S, x: slabX(k) }; hero.pose = 'hero_soot'; });
          after(520, resolve);
        });
      });
    }
    function makeFrags(k) {
      var fr = [], n = 6;
      for (var i = 0; i < n; i++) {
        var a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, mid = (a0 + a1) / 2;
        fr.push({ a0: a0, a1: a1, x: 0, y: 0, vx: Math.cos(mid) * (40 + Math.random() * 40), vy: -60 - Math.random() * 60, rot: 0, vr: (Math.random() - 0.5) * 3, sink: 0, alpha: 1 });
      }
      return fr;
    }

    /** cash-out celebration; tier = LavaCircles tier object. Resolves quickly (non-blocking UI). */
    function celebrate(tier, o) {
      o = o || {};
      var r = tier ? tier.rank : 1, k = Math.round(hero.z / S);
      hero.pose = 'hero_win'; hero.anim = { type: 'cheer', t0: t, repeat: r >= 4 ? 4 : r >= 3 ? 2 : 1 };
      burst(hero.z, hero.x, 120, calm ? 10 : [0, 18, 30, 44, 60][r], 'coin');
      sparkle(k, calm ? 8 : 16);
      if (r >= 2) rays = { z: hero.z, x: hero.x, h: 70, age: 0, life: [0, 1.2, 1.8, 2.6, 3.6][r], scale: [0, 0.9, 1.1, 1.4, 1.7][r] * (calm ? 0.75 : 1), color: '255,226,130' };
      if (r >= 2) confetti(calm ? 24 : [0, 0, 60, 100, 150][r]);
      if (r >= 3) for (var i = 0; i < (calm ? 1 : r === 3 ? 3 : 6); i++) (function (i) { after(250 + i * 380, function () { firework(); }); })(i);
      if (r >= 4 && !calm) coinRain(2.6);
      flashOn(calm ? 0.06 : [0, 0.12, 0.2, 0.26, 0.32][r], '255,230,150');
      impReact('cheer', 2 + r * 0.4);
      after([0, 1300, 1900, 2700, 3700][r], function () { if (hero.pose === 'hero_win') { hero.pose = 'hero_idle'; hero.idleSince = t; } });
      return wait(520);
    }

    // ---------- effects primitives ----------
    function budget() { return MAXP[quality] * (calm ? 0.45 : 1); }
    function shakeOn(a) { if (calm || reduced) return; shake = Math.max(shake, Math.min(6, a)); }
    function flashOn(a, c) { flash.a = Math.max(flash.a, Math.min(calm ? 0.12 : 0.35, a)); flash.c = c; }
    function ring(k, strength) { if (slabs[k]) slabs[k].ring = t; }
    function dust(z, x, n) { n = Math.round(n * (calm ? 0.5 : 1)); for (var i = 0; i < n && parts.length < budget(); i++) { var a = Math.PI + Math.random() * Math.PI; parts.push({ k: 'dust', z: z, x: x + (Math.random() - 0.5) * 50, h: 4, vx: Math.cos(a) * 60, vh: Math.random() * 30, vz: (Math.random() - 0.5) * 30, g: 0, life: 0.55, age: 0, s: 3 + Math.random() * 4 }); } }
    function sparkle(k, n) { var z = k * S, x = slabX(k); for (var i = 0; i < n && parts.length < budget(); i++) { var a = Math.random() * Math.PI * 2, v = 50 + Math.random() * 90; parts.push({ k: 'spark', z: z, x: x + Math.cos(a) * 30, h: 20 + Math.random() * 40, vx: Math.cos(a) * v, vh: 60 + Math.random() * 90, vz: Math.sin(a) * 30, g: -140, life: 0.7 + Math.random() * 0.5, age: 0, s: 4 + Math.random() * 5 }); } }
    function burst(z, x, h, n, kind) { for (var i = 0; i < n && parts.length < budget(); i++) { var a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 160; parts.push({ k: kind, z: z, x: x, h: h, vx: Math.cos(a) * v, vh: 120 + Math.random() * 220, vz: Math.sin(a) * 40, g: kind === 'spark' ? -120 : -520, life: 1 + Math.random() * 0.7, age: 0, s: kind === 'coin' ? 7 + Math.random() * 4 : 3 + Math.random() * 5, spin: Math.random() * 6 }); } }
    function splash(z, x) {
      var n = calm ? 16 : 36;
      for (var i = 0; i < n && parts.length < budget(); i++) { var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 120 + Math.random() * 220; parts.push({ k: 'lava', z: z, x: x + (Math.random() - 0.5) * 40, h: 0, vx: Math.cos(a) * v * 0.6, vh: -Math.sin(a) * v, vz: (Math.random() - 0.5) * 40, g: -600, life: 0.7 + Math.random() * 0.6, age: 0, s: 3 + Math.random() * 5 }); }
      for (var j = 0; j < (calm ? 4 : 10); j++) parts.push({ k: 'smoke', z: z, x: x + (Math.random() - 0.5) * 60, h: 10, vx: (Math.random() - 0.5) * 20, vh: 40 + Math.random() * 40, vz: 0, g: 0, life: 1.6, age: 0, s: 14 + Math.random() * 16 });
    }
    function floatText(text, z, x, h, color, size, life, rot) { floaters.push({ text: text, z: z, x: x, h: h, color: color, size: size, life: life || 1.2, age: 0, rot: rot || 0, screen: false }); }
    function stamp(text, color) { floaters.push({ text: text, sx: 0.5, sy: 0.4, color: color, size: 58, life: 1.9, age: 0, rot: -0.06, screen: true, stamp: true }); }
    function impReact(type, sec) { impMood = { type: type, until: t + sec }; }

    // ---------- fx canvas (full viewport): confetti, coin flights, fireworks, idol flight ----------
    function stageRect() { return canvas.getBoundingClientRect(); }
    function heroClient() { var p = proj(hero.z, hero.x, 50) || { x: cx, y: gy }; var r = stageRect(); return { x: r.left + p.x, y: r.top + p.y }; }
    function confetti(n) { var cols = ['#ffd23c', '#ff5a6a', '#7ae05a', '#5ac8ff', '#ffffff', '#ff9a2a']; for (var i = 0; i < n; i++) fxParts.push({ k: 'conf', x: innerWidth * Math.random(), y: -20 - Math.random() * innerHeight * 0.4, vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 140, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: cols[i % cols.length], life: 3.2, age: 0 }); fxActive = true; }
    function firework() { var r = stageRect(), x = r.left + r.width * (0.2 + Math.random() * 0.6), y = r.top + r.height * (0.15 + Math.random() * 0.3), cols = ['255,214,90', '255,120,140', '140,220,255', '160,255,140'], c = cols[Math.floor(Math.random() * cols.length)];
      for (var i = 0; i < (quality ? 46 : 24); i++) { var a = i / 46 * Math.PI * 2, v = 120 + Math.random() * 90; fxParts.push({ k: 'fw', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: c, life: 1.1 + Math.random() * 0.4, age: 0 }); }
      fxActive = true; if (opts.onFirework) opts.onFirework(); }
    function coinRain(sec) { var n = Math.round(sec * 22); for (var i = 0; i < n; i++) fxParts.push({ k: 'rain', x: Math.random() * innerWidth, y: -30 - Math.random() * innerHeight * 1.2, vy: 260 + Math.random() * 200, spin: Math.random() * 6, life: 4, age: 0, s: 14 + Math.random() * 10 }); fxActive = true; }
    /** coins fly from the hero to a DOM element; onArrive(i, n) per coin */
    function coinFly(el, n, onArrive) {
      if (!el) return; var tr = el.getBoundingClientRect(), tx = tr.left + tr.width * 0.2, ty = tr.top + tr.height / 2, st = heroClient();
      n = Math.max(3, Math.round(n * (calm ? 0.5 : 1)));
      for (var i = 0; i < n; i++) fxParts.push({ k: 'fly', x0: st.x + (Math.random() - 0.5) * 40, y0: st.y + (Math.random() - 0.5) * 30, cx: st.x + (Math.random() - 0.5) * 220, cy: Math.min(st.y, ty) - 60 - Math.random() * 120, tx: tx, ty: ty, delay: i * 0.055, dur: 0.7 + Math.random() * 0.15, age: 0, life: 9, i: i, n: n, cb: onArrive, s: 18 });
      fxActive = true;
    }
    function idolFly(el, onArrive) {
      if (!el) return; var tr = el.getBoundingClientRect(), k = Math.round(hero.z / S), p = proj(k * S, slabX(k), 170) || { x: cx, y: gy }, r = stageRect();
      fxParts.push({ k: 'idolfly', x0: r.left + p.x, y0: r.top + p.y, cx: r.left + p.x - 40, cy: tr.top - 80, tx: tr.left + tr.width / 2, ty: tr.top + tr.height / 2, delay: 0.75, dur: 0.6, age: 0, life: 9, cb: onArrive, s: 60 });
      fxActive = true;
    }

    // ---------- ambient particles (per circle) ----------
    function buildAmbient() {
      amb = []; var type = A.palette(circleNow).amb, n = { mist: 9, wind: 22, rain: 70, gold: 26, swamp: 22, embers: 40, firerain: 30, ash: 36, snow: 55 }[type] || 30;
      n = Math.round(n * [0.35, 0.7, 1][quality] * (calm ? 0.5 : 1));
      for (var i = 0; i < n; i++) amb.push(newAmb(type, true));
    }
    function newAmb(type, init) {
      var p = { type: type, x: Math.random() * W, y: init ? Math.random() * H : -10, ph: Math.random() * 6, s: 1 };
      if (type === 'mist') { p.vx = 6 + Math.random() * 10; p.vy = 0; p.s = 60 + Math.random() * 90; p.y = hy + Math.random() * (H - hy); }
      else if (type === 'wind') { p.vx = 180 + Math.random() * 160; p.vy = (Math.random() - 0.5) * 30; p.s = 30 + Math.random() * 60; p.petal = Math.random() < 0.4; if (!init) { p.x = -60; p.y = Math.random() * H; } }
      else if (type === 'rain') { p.vx = -60; p.vy = 520 + Math.random() * 200; p.s = 10 + Math.random() * 10; }
      else if (type === 'gold') { p.vx = 0; p.vy = 14 + Math.random() * 20; p.s = 2 + Math.random() * 3; }
      else if (type === 'swamp') { p.vx = (Math.random() - 0.5) * 10; p.vy = -8 - Math.random() * 12; p.s = 2 + Math.random() * 2; if (!init) p.y = H + 10; }
      else if (type === 'embers') { p.vx = (Math.random() - 0.5) * 16; p.vy = -30 - Math.random() * 40; p.s = 1 + Math.random() * 2.2; if (!init) p.y = H + 10; }
      else if (type === 'firerain') { p.vx = -30; p.vy = 160 + Math.random() * 120; p.s = 2 + Math.random() * 2; }
      else if (type === 'ash') { p.vx = 10 + Math.random() * 14; p.vy = 18 + Math.random() * 20; p.s = 1.5 + Math.random() * 2.5; }
      else if (type === 'snow') { p.vx = (Math.random() - 0.5) * 20; p.vy = 30 + Math.random() * 40; p.s = 1.5 + Math.random() * 2.5; }
      return p;
    }
    function drawAmbient(dt) {
      var pal = A.palette(circleNow), glow = pal.glowRgb;
      for (var i = 0; i < amb.length; i++) {
        var p = amb[i]; p.x += p.vx * dt + (p.type === 'snow' || p.type === 'ash' ? Math.sin(t + p.ph) * 0.4 : 0); p.y += p.vy * dt;
        if (p.y > H + 20 || p.y < -30 || p.x > W + 80 || p.x < -90) { amb[i] = newAmb(p.type, false); if (p.type === 'mist' && p.x > W + 80) amb[i].x = -80; continue; }
        if (p.type === 'mist') { ctx.globalAlpha = 0.16 + 0.06 * Math.sin(t * 0.5 + p.ph); ctx.drawImage(A.glow('#e6deef', 128), p.x - p.s, p.y - p.s * 0.5, p.s * 2, p.s); ctx.globalAlpha = 1; }
        else if (p.type === 'wind') { if (p.petal) { ctx.fillStyle = 'rgba(255,150,180,0.85)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + Math.sin(t * 4 + p.ph) * 8, 5, 3, t * 3 + p.ph, 0, Math.PI * 2); ctx.fill(); } else { ctx.strokeStyle = 'rgba(255,190,215,0.28)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x - p.s * 0.5, p.y - 10 * Math.sin(t * 2 + p.ph), p.x - p.s, p.y); ctx.stroke(); } }
        else if (p.type === 'rain') { ctx.strokeStyle = 'rgba(190,210,235,0.42)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * 0.03, p.y - p.s * 1.6); ctx.stroke(); }
        else if (p.type === 'gold') { var tw = 0.5 + 0.5 * Math.sin(t * 5 + p.ph); ctx.fillStyle = 'rgba(255,230,120,' + (0.35 + 0.65 * tw) + ')'; U.star4(ctx, p.x, p.y, p.s * (1 + tw)); ctx.fill(); }
        else if (p.type === 'swamp') { ctx.fillStyle = 'rgba(150,255,190,' + (0.4 + 0.4 * Math.sin(t * 3 + p.ph)) + ')'; ctx.beginPath(); ctx.arc(p.x + Math.sin(t + p.ph) * 6, p.y, p.s, 0, Math.PI * 2); ctx.fill(); }
        else if (p.type === 'embers' || p.type === 'firerain') { ctx.fillStyle = U.rgba(glow, 0.55 + 0.45 * Math.sin(t * 6 + p.ph)); ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill(); if (p.type === 'firerain') { ctx.strokeStyle = U.rgba(glow, 0.35); ctx.lineWidth = p.s; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.06, p.y - p.vy * 0.06); ctx.stroke(); } }
        else if (p.type === 'ash') { ctx.fillStyle = 'rgba(150,140,140,0.5)'; ctx.fillRect(p.x, p.y, p.s, p.s); }
        else if (p.type === 'snow') { ctx.fillStyle = 'rgba(240,250,255,0.85)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill(); }
      }
    }

    // ---------- drawing: hazard plane ----------
    function pattern(c, layer) {
      var key = c + (layer ? 's' : 'h'); if (patterns[key]) return patterns[key];
      var tex = layer ? assets.streak(c) : assets.hazard(c); var p = ctx.createPattern(tex, 'repeat'); p.tex = tex;
      return (patterns[key] = p);
    }
    var canSetTransform = typeof DOMMatrix !== 'undefined';
    function band(c, y0, y1, s, z, layer, alpha) {
      var pat = pattern(c, layer), TS = layer ? 320 : 240, p = pat.tex.width / TS;
      var dydz = -(gy - hy) * s * s / F, yc = (y0 + y1) / 2;
      var flowX = t * (layer ? 14 : 6) * (c === 9 ? 0.15 : c === 2 ? 2.2 : 1), flowZ = t * (layer ? -18 : -8) * (c === 9 ? 0.1 : 1);
      if (canSetTransform && pat.setTransform) {
        var a = s * K / p, d = dydz / p, e = cx - (((flowX + camX) % TS) + TS) % TS * s * K, f = yc - ((((z + flowZ) % TS) + TS) % TS) * dydz;
        pat.setTransform(new DOMMatrix([a, 0, 0, d, e, f]));
      }
      ctx.globalAlpha = alpha; ctx.fillStyle = pat; ctx.fillRect(0, y0, W, y1 - y0 + 0.6);
    }
    function drawHazard() {
      // screen-space bands: thin near the horizon, at most ~10 px (q2) near the camera, so seams stay invisible
      var s0 = 0.035, prev = hy + (gy - hy) * s0, qmul = [2.2, 1.4, 1][quality];
      ctx.fillStyle = U.rgba(A.palette(zoneCircle(camZ + 12 * S)).lavaRgb[1]); ctx.fillRect(0, hy, W, prev - hy + 1);
      while (prev < H) {
        var hgt = Math.max(1.5, Math.min(10, 1 + (prev - hy) * 0.035) * qmul), y1 = Math.min(H + 1, prev + hgt);
        var sm = ((prev + y1) / 2 - hy) / (gy - hy), d = F / sm - F, z = camZ + d;
        var c = zoneCircle(z);
        band(c, prev, y1, sm, z, false, 1);
        // blend toward the neighbouring circle near a zone border
        var kz = z / S - 0.5, frac = kz - Math.floor(kz);
        if (frac > 0.75 || frac < 0.25) { var c2 = zoneCircle(z + (frac > 0.5 ? S * 0.5 : -S * 0.5)); if (c2 !== c) band(c2, prev, y1, sm, z, false, 0.45); }
        if (quality >= 1) { ctx.globalCompositeOperation = 'lighter'; band(c, prev, y1, sm, z, true, c === 9 ? 0.35 : c === 5 ? 0.55 : 0.42); ctx.globalCompositeOperation = 'source-over'; }
        prev = y1;
      }
      ctx.globalAlpha = 1;
      // horizon fog
      var fog = A.palette(circleNow).fogRgb;
      var g = ctx.createLinearGradient(0, hy, 0, hy + (gy - hy) * 0.38);
      var fk = painted ? 0.45 : 1;
      g.addColorStop(0, U.rgba(fog, 0.92 * fk)); g.addColorStop(0.45, U.rgba(fog, 0.32 * fk)); g.addColorStop(1, U.rgba(fog, 0));
      ctx.fillStyle = g; ctx.fillRect(0, hy - 2, W, (gy - hy) * 0.38 + 2);
    }

    // ---------- drawing: walkways ----------
    function drawLedges() {
      var pal = A.palette(circleNow), zNear = camZ - 0.55 * F, zFar = camZ + 16 * S;
      var ledgeTex = assets.ledge(), lp = patterns.ledge || (patterns.ledge = ctx.createPattern(ledgeTex, 'repeat'));
      [-1, 1].forEach(function (side) {
        var a = proj(zFar, side * L), b = proj(zNear, side * L); if (!a || !b) return;
        var edgeX = side < 0 ? -40 : W + 40;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(edgeX, b.y); ctx.lineTo(edgeX, a.y); ctx.closePath();
        if (lp.setTransform && canSetTransform) lp.setTransform(new DOMMatrix([0.5 * K, 0, 0, 0.5 * K, 0, 0]));
        ctx.fillStyle = lp; ctx.fill();
        ctx.save(); ctx.clip();
        var rx = Math.min(edgeX, a.x, b.x) - 10, rw = Math.max(edgeX, a.x, b.x) - rx + 10;
        ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = U.rgba(pal.ledgeRgb, 1); ctx.fillRect(rx, a.y, rw, b.y - a.y); ctx.globalCompositeOperation = 'source-over';
        var og = ctx.createLinearGradient(a.x, 0, edgeX, 0); og.addColorStop(0, 'rgba(20,6,4,0)'); og.addColorStop(0.55, 'rgba(20,6,4,0.25)'); og.addColorStop(1, 'rgba(20,6,4,0.6)');
        ctx.fillStyle = og; ctx.fillRect(rx, a.y, rw, b.y - a.y);
        var g = ctx.createLinearGradient(0, a.y, 0, a.y + (gy - hy) * 0.45); g.addColorStop(0, U.rgba(pal.fogRgb, painted ? 0.6 : 0.95)); g.addColorStop(1, U.rgba(pal.fogRgb, 0)); ctx.fillStyle = g; ctx.fillRect(rx, a.y, rw, (gy - hy) * 0.45);
        // paving joints moving with the camera
        ctx.strokeStyle = 'rgba(70,50,40,0.28)'; ctx.lineWidth = 1.5;
        var z0 = Math.ceil((camZ - 0.4 * F) / (S * 0.5)) * S * 0.5;
        for (var z = z0; z < camZ + 10 * S; z += S * 0.5) { var p = proj(z, side * L); if (!p) continue; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(edgeX, p.y); ctx.stroke(); }
        // lava-lit inner edge
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = U.rgba(pal.glowRgb, 0.22); ctx.lineWidth = 26 * K; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = U.rgba(pal.glowRgb, 0.3); ctx.lineWidth = 10 * K; ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
        // curb
        ctx.strokeStyle = 'rgba(60,36,26,0.9)'; ctx.lineWidth = 5 * K; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,248,232,0.75)'; ctx.lineWidth = 2 * K; ctx.beginPath(); ctx.moveTo(a.x + side * 2, a.y); ctx.lineTo(b.x + side * 3 * K, b.y); ctx.stroke();
      });
    }

    // ---------- sprites ----------
    function sprite(name, x, y, scale, o) { // scale = css px per spec px
      o = o || {};
      var im = o.tint ? assets.tinted(name, o.tint[0], o.tint[1]) : assets.img(name), m = assets.meta(name);
      var w = m.w * scale, h = m.h * scale, ax = (o.anchor || m.anchor)[0], ay = (o.anchor || m.anchor)[1];
      if (w < 1 || h < 1) return;
      var al = o.alpha == null ? 1 : o.alpha; if (al <= 0.01) return;
      if (o.rot || o.sx || o.sy || o.flip) {
        ctx.save(); ctx.globalAlpha = al; ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); ctx.scale((o.sx || 1) * (o.flip || 1), o.sy || 1);
        ctx.drawImage(im, -w * ax, -h * ay, w, h); ctx.restore();
      } else { ctx.globalAlpha = al; ctx.drawImage(im, x - w * ax, y - h * ay, w, h); ctx.globalAlpha = 1; }
    }
    function flame(c) {
      if (flameCache[c]) return flameCache[c];
      var pal = A.palette(c), cv = U.canvas(64, 112), x = cv.getContext('2d');
      [[pal.flame[2], 1, 30], [pal.flame[1], 0.78, 22], [pal.flame[0], 0.5, 13]].forEach(function (f) {
        x.beginPath(); x.moveTo(32 - f[2], 100); x.bezierCurveTo(32 - f[2], 70, 32 - f[2] * 0.2, 60, 32, 100 - 96 * f[1]); x.bezierCurveTo(32 + f[2] * 0.2, 60, 32 + f[2], 70, 32 + f[2], 100);
        x.quadraticCurveTo(32, 112, 32 - f[2], 100); x.fillStyle = f[0]; x.fill();
      });
      return (flameCache[c] = cv);
    }
    function drawFlame(c, x, y, s, ph) {
      var im = flame(c), fl = 0.88 + 0.14 * Math.sin(t * 13 + ph) + 0.06 * Math.sin(t * 23 + ph * 2), w = 28 * s * K, h = 50 * s * K * fl;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (quality >= 1) { var gl = A.glow(A.palette(c).glow, 64); ctx.globalAlpha = 0.55; ctx.drawImage(gl, x - w * 1.8, y - h * 1.0, w * 3.6, w * 3.6); }
      ctx.globalAlpha = 0.95; ctx.translate(x, y); ctx.rotate(Math.sin(t * 3 + ph) * 0.06); ctx.drawImage(im, -w / 2, -h, w, h);
      ctx.restore();
    }

    // ---------- world objects ----------
    function collect() {
      var list = [], zMin = camZ - 0.6 * F, zMax = camZ + 10.5 * S;
      // slabs
      for (var i = 0; i <= N; i++) { var z = i * S; if (z < zMin || z > zMax) continue; list.push({ d: z - camZ, f: drawSlab, i: i }); }
      // arches at circle borders
      var first = C.firstSteps(N);
      for (var c = 2; c <= 9; c++) { var za = (first[c - 1] - 0.5) * S; if (za > zMin && za < zMax) list.push({ d: za - camZ + 0.01, f: drawArch, c: c, z: za }); }
      // exit portal
      var ze = (N + 1.4) * S; if (ze < zMax + 3 * S) list.push({ d: ze - camZ, f: drawExit, z: ze });
      // colonnade + braziers + circle props
      var j0 = Math.floor(zMin / (1.5 * S)) - 1, j1 = Math.ceil(zMax / (1.5 * S)) + 1;
      for (var j = Math.max(-1, j0); j <= j1; j++) { var zc = j * 1.5 * S - 0.4 * S; if (zc < zMin || zc > zMax) continue; list.push({ d: zc - camZ, f: drawColumn, j: j, z: zc, side: -1 }); list.push({ d: zc - camZ - 0.01, f: drawColumn, j: j + 7, z: zc, side: 1 }); }
      for (var b = Math.max(0, Math.floor(zMin / (3 * S))); b <= Math.ceil(zMax / (3 * S)); b++) { var zb = (b * 3 + 0.9) * S; if (zb < zMin || zb > zMax) continue; list.push({ d: zb - camZ, f: drawBrazier, z: zb, side: b % 2 ? 1 : -1, ph: b }); }
      for (var q = Math.max(0, Math.floor(zMin / (4 * S))); q <= Math.ceil(zMax / (4 * S)); q++) { var zp = (q * 4 + 2.6) * S; if (zp < zMin || zp > zMax) continue; list.push({ d: zp - camZ, f: drawProp, z: zp, side: q % 2 ? -1 : 1 }); }
      list.push({ d: hero.z - camZ - 0.02, f: drawHero });
      if (rays) list.push({ d: rays.z - camZ + 0.03, f: function () { drawRays(); } });
      list.sort(function (a, b) { return b.d - a.d; });
      return list;
    }
    function circleTint(c) { var tt = A.palette(c).slabTint; return tt && tt[1] >= 0.1 ? tt : null; }
    function drawSlab(o) {
      var i = o.i, s = slabs[i], z = i * S, x = slabX(i), p = proj(z, x, 0); if (!p) return;
      var al = depthAlpha(p.d); if (al <= 0) return;
      var sc = SLAB * p.s * K, c = zoneCircle(z), jx = 0, jy = 0;
      if (s.wob > 0) { jx = Math.sin(t * 46) * 2.2 * K * p.s; jy = Math.sin(t * 31) * 1.2 * K; }
      if (s.state === 'cracking') { jx = (Math.random() - 0.5) * 5 * K; jy = (Math.random() - 0.5) * 3 * K; }
      // lava light pool under the slab
      if (quality >= 1 && i > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 * al; var gl = A.glow(A.palette(c).glow, 64), gw = 230 * p.s * K; ctx.drawImage(gl, p.x - gw / 2, p.y - gw * 0.18, gw, gw * 0.62); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      if (s.state === 'collapsed') { drawFrags(s, p, sc, c, al); return; }
      if (i === 0) {
        if (assets.isFallback('gate_dais') && !assets.isFallback('slab_marble')) sprite('slab_marble', p.x, p.y, SLAB * 1.45 * p.s * K, { alpha: al, tint: ['#ffcf70', 0.1] });
        else sprite('gate_dais', p.x, p.y, 0.4 * p.s * K, { alpha: al });
        return;
      }
      if (peek && i === Math.round(hero.z / S) + 1 && s.state === 'idle') drawPeek(p, al);
      var name = s.state === 'cracking' ? 'slab_cracked' : 'slab_marble', sm = assets.meta(name), tf = sm.topFace;
      sprite(name, p.x + jx, p.y + jy, sc, { alpha: al, tint: circleTint(c) });
      // top-face ellipse (rings / highlights) in screen space
      var ex = p.x + jx + (tf ? (tf[0] - sm.w * sm.anchor[0]) * sc : 0), ey = p.y + jy + (tf ? (tf[1] - sm.h * sm.anchor[1]) * sc : 0);
      var erx = tf ? tf[2] * 0.9 * sc : 82 * p.s * K, ery = tf ? tf[3] * 0.9 * sc : 46 * p.s * K;
      var k = Math.round(hero.z / S), isNext = i === k + 1 && !hero.bubble && hero.anim && hero.anim.type !== 'fall', onIt = i === k && !(hero.anim && hero.anim.type === 'jump');
      if (i === k + 1 && !hero.anim) isNext = true;
      if (hero.pose === 'hero_fall' || hero.bubble) isNext = false;
      // landing ring
      if (s.ring >= 0 && t - s.ring < 0.6) { var rk = (t - s.ring) / 0.6; ctx.strokeStyle = 'rgba(255,248,210,' + (0.9 * (1 - rk)) + ')'; ctx.lineWidth = 4 * K * p.s * (1 - rk) + 1; ctx.beginPath(); ctx.ellipse(ex, ey, erx * (1.05 + 0.6 * easeOut(rk)), ery * (1.05 + 0.6 * easeOut(rk)), 0, 0, Math.PI * 2); ctx.stroke(); }
      if (isNext && s.state === 'idle') {
        var pulse = 0.5 + 0.5 * Math.sin(t * 5);
        ctx.save(); ctx.strokeStyle = 'rgba(255,214,80,' + (0.55 + 0.4 * pulse) * al + ')'; ctx.lineWidth = (3 + pulse * 2) * K * p.s; ctx.setLineDash([10 * K * p.s, 7 * K * p.s]); ctx.lineDashOffset = -t * 30;
        ctx.beginPath(); ctx.ellipse(ex, ey, erx, ery, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        if (idleCue && !glowPulse) { var br = 0.5 + 0.5 * Math.sin((t - cueT0) * 2.4 - Math.PI / 2); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (calm ? 0.16 : 0.28) * br * al; var g4 = A.glow('#ffe27a', 64), w4 = 220 * p.s * K; ctx.drawImage(g4, p.x - w4 / 2, p.y - w4 * 0.3, w4, w4 * 0.6); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        if (glowPulse > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, glowPulse * 2) * 0.5; var g2 = A.glow('#ffd23c', 64), w2 = 200 * p.s * K; ctx.drawImage(g2, p.x - w2 / 2, p.y - w2 * 0.3, w2, w2 * 0.6); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      }
      // multiplier inside the centre medallion (scaled by depth, squashed onto the top face)
      if (ladder[i - 1] != null && !onIt && p.s > 0.2) {
        var md = sm.medallion, txt = (ladder[i - 1] / 100).toFixed(2) + 'x';
        var mx = p.x + jx + (md ? (md[0] - sm.w * sm.anchor[0]) * sc : 0), my = p.y + jy + (md ? (md[1] - sm.h * sm.anchor[1]) * sc : 0);
        var fs = Math.round(clamp(30 * p.s * K, 9, 34));
        ctx.font = fs + 'px ' + FONT; var tw = ctx.measureText(txt).width, fit = md ? Math.min(1.25, (md[2] * 2.45 * sc) / tw) : 1;
        if (fs * fit >= 6) {
          ctx.save(); ctx.globalAlpha = al; ctx.translate(mx, my); ctx.scale(fit, fit * (md ? 0.86 : 1)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
          ctx.lineWidth = Math.max(2.5, fs * 0.26); ctx.strokeStyle = isNext ? '#5a1e00' : s.state === 'passed' ? '#1f4a12' : '#4a2410'; ctx.strokeText(txt, 0, 1.5);
          var tg = ctx.createLinearGradient(0, -fs * 0.5, 0, fs * 0.5);
          if (isNext) { tg.addColorStop(0, '#fff6b0'); tg.addColorStop(0.5, '#ffd23c'); tg.addColorStop(1, '#f39a12'); }
          else if (s.state === 'passed') { tg.addColorStop(0, '#eaffd8'); tg.addColorStop(1, '#8fd86a'); }
          else { tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, '#ffe6b0'); }
          ctx.fillStyle = tg; ctx.fillText(txt, 0, 0); ctx.restore();
        }
      }
      // idol resting on a passed slab
      if (s.idol && (s.idolT < 0 || t - s.idolT > 1.4)) sprite('idol', p.x + 52 * p.s * K, p.y - 6 * p.s * K, 0.2 * p.s * K, { alpha: al * 0.95 });
    }
    function drawFrags(s, p, sc, c, al) {
      var im = assets.tinted('slab_marble', circleTint(c) && circleTint(c)[0], circleTint(c) ? circleTint(c)[1] : 0), m = assets.meta('slab_marble'), w = m.w * sc, h = m.h * sc;
      var tf = m.topFace, rr = tf ? [tf[2], tf[3]] : A.slabRadius, ax = m.anchor[0], ay = m.anchor[1], oy = tf ? (tf[1] - m.h * ay) * sc : 0, side = tf ? (m.h - tf[1] - tf[3]) * 0.9 : 54;
      for (var f = 0; f < s.frags.length; f++) {
        var fr = s.frags[f]; if (fr.alpha <= 0) continue;
        ctx.save(); ctx.globalAlpha = clamp(fr.alpha, 0, 1) * al;
        ctx.translate(p.x + fr.x * K * p.s, p.y + fr.y * K * p.s); ctx.rotate(fr.rot); var k = Math.max(0.05, 1 - fr.sink); ctx.scale(k, k);
        ctx.beginPath(); ctx.moveTo(0, 0);
        for (var a = fr.a0; a <= fr.a1 + 0.001; a += (fr.a1 - fr.a0) / 4) ctx.lineTo(Math.cos(a) * rr[0] * 1.15 * sc, oy + Math.sin(a) * rr[1] * 1.15 * sc + (Math.sin(a) > 0 ? side * sc : 0));
        ctx.closePath(); ctx.clip();
        ctx.drawImage(im, -w * ax, -h * ay, w, h);
        ctx.fillStyle = 'rgba(255,120,30,' + clamp(fr.sink * 1.2, 0, 0.8) + ')'; ctx.fillRect(-w, -h, w * 2, h * 2);
        ctx.restore();
      }
    }
    function drawColumn(o) {
      var p = proj(o.z, o.side * (L + 38), 0); if (!p) return; var al = depthAlpha(p.d); if (al <= 0) return;
      var c = zoneCircle(o.z), broken = ((o.j % 3) + 3) % 3 === 1, name = broken ? 'column_broken' : 'column';
      sprite(name, p.x, p.y, COL * p.s * K, { alpha: al, tint: circleTint(c) });
      // imp perched on some columns
      if (((o.j % 4) + 4) % 4 === 1 && p.s > 0.3) {
        var m = assets.meta(name), topY = p.y - (m.h * m.anchor[1] - (m.top != null ? m.top : broken ? 150 : 58)) * COL * p.s * K;
        var mood = t < impMood.until ? impMood.type : 'idle', iname = mood === 'cheer' ? 'imp_cheer' : mood === 'giggle' ? 'imp_giggle' : 'imp';
        var bob = Math.sin(t * 3 + o.j) * 3 * K * p.s + (mood === 'cheer' ? -Math.abs(Math.sin(t * 9)) * 10 * K * p.s : 0);
        sprite(iname, p.x, topY + bob + 4 * p.s * K, 0.3 * p.s * K, { alpha: al, flip: o.side < 0 ? 1 : -1 });
      }
    }
    function drawBrazier(o) {
      var p = proj(o.z, o.side * (L + 14), 0); if (!p) return; var al = depthAlpha(p.d); if (al <= 0) return;
      var sc = 0.36 * p.s * K, c = zoneCircle(o.z); sprite('brazier', p.x, p.y, sc, { alpha: al });
      var m = assets.meta('brazier'), bf = m.flame || A.brazierFlame, fx = p.x + (bf[0] - m.w * m.anchor[0]) * sc, fy = p.y + (bf[1] - m.h * m.anchor[1]) * sc;
      ctx.globalAlpha = al; drawFlame(c, fx, fy, p.s * 1.25, o.ph * 1.7); ctx.globalAlpha = 1;
    }
    function drawProp(o) {
      var p = proj(o.z, o.side * (L + 105), 0); if (!p) return; var al = depthAlpha(p.d); if (al <= 0) return;
      var c = zoneCircle(o.z); if (c < 1) c = 1;
      sprite('prop_c' + c, p.x, p.y, 0.42 * p.s * K, { alpha: al, flip: o.side });
      if (c === 6 || c === 7) { ctx.globalAlpha = al * 0.8; drawFlame(c, p.x, p.y - 120 * p.s * K, p.s * 1.6, o.z); ctx.globalAlpha = 1; }
    }
    function drawArch(o) {
      var p = proj(o.z, 0, 0); if (!p) return; var al = depthAlpha(p.d) * (p.d < 0.3 * S ? clamp((p.d) / (0.3 * S), 0, 1) : 1); if (al <= 0) return;
      var sc = 0.5 * p.s * K, m = assets.meta('gate_arch');
      sprite('gate_arch', p.x, p.y, sc, { alpha: al, tint: circleTint(o.c) });
      var px = p.x + (A.archPlaque[0] - m.w * m.anchor[0]) * sc, py = p.y + (A.archPlaque[1] - m.h * m.anchor[1]) * sc;
      var fs = Math.round(40 * sc); if (fs >= 6) { ctx.globalAlpha = al; ctx.font = '900 ' + fs + 'px ' + SERIF; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffe9a0'; ctx.fillText(C.info(o.c).roman, px, py + fs * 0.05); ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1; }
    }
    function drawExit(o) {
      var p = proj(o.z, 0, 140); if (!p) return; var al = depthAlpha(p.d) || (p.d > 0 ? 0.6 : 0); if (al <= 0) return;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * al; var gl = A.glow('#8ad0ff', 64), gw = 520 * p.s * K; ctx.drawImage(gl, p.x - gw / 2, p.y - gw / 2, gw, gw); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      sprite('exit_stars', p.x, p.y, 0.62 * p.s * K, { alpha: al, rot: Math.sin(t * 0.3) * 0.03 });
    }
    /** impatient idle loop (3.6 s): shift weight, tap foot, glance at the next slab. Calm/reduced = smaller. */
    function impatience(x) {
      var a = calm ? 0.5 : 1, ph = (t - cueT0) % 3.6, o = { rot: 0, dx: 0, hop: 0, sy: 1 };
      if (ph < 1.2) { if (!reduced) { var w = Math.sin(ph / 1.2 * Math.PI * 2); o.rot = 0.05 * a * w; o.dx = 7 * a * w; } }
      else if (ph < 2.2) { if (!reduced) { var tap = Math.abs(Math.sin((ph - 1.2) * Math.PI * 3)); o.sy = 1 - 0.03 * a * tap; o.hop = 2.5 * a * tap; } }
      else { var k = Math.round(hero.z / S); hero.flip = slabX(k + 1) >= x ? 1 : -1; o.rot = 0.06 * a * hero.flip * Math.sin(Math.PI * (ph - 2.2) / 1.4); }
      return o;
    }
    /** a cheeky imp peeks over the back edge of the next slab (idle cue level 2) */
    function drawPeek(p, al) {
      var pk = clamp((t - peek.t0) / 0.7, 0, 1), e = reduced ? pk : easeOutBack(pk), fade = peek.out ? clamp(1 - (t - peek.out) / 0.4, 0, 1) : 1;
      if (peek.out && fade <= 0) { peek = null; return; }
      var side = peek.side, s = p.s * K, bob = calm || reduced ? 0 : Math.sin(t * 2.2) * 2 * s;
      var feet = p.y + 30 * s - e * 55 * s * fade + bob;
      var blinkPose = (t % 3.1) < 0.9 && !calm ? 'imp_giggle' : 'imp';
      sprite(blinkPose, p.x + side * 34 * s, feet, 0.27 * s, { alpha: al * (reduced ? pk : 1) * fade, flip: -side, rot: calm ? 0 : Math.sin(t * 1.7) * 0.12 * side });
    }
    function setIdleCue(level) {
      level = level | 0; if (level === idleCue) return;
      if (level > 0 && idleCue === 0) cueT0 = t;
      if (level >= 2 && !peek) peek = { t0: t, side: Math.random() < 0.5 ? -1 : 1 };
      if (level < 2 && peek && !peek.out) peek.out = t;
      idleCue = level;
    }
    // painted hero set without a frame for this pose: reuse the closest painted pose (never mix art styles)
    var POSE_ALIAS = { hero_idle_blink: 'hero_idle', hero_nervous: 'hero_idle', hero_wave: 'hero_idle' };
    function poseArt(p) { return assets.isFallback(p) && POSE_ALIAS[p] && !assets.isFallback('hero_idle') ? POSE_ALIAS[p] : p; }
    function drawHero() {
      if (!hero.visible) return;
      var an = hero.anim, el = an ? t - an.t0 : 0, sx = 1, sy = 1, rot = 0, hop = 0, z = hero.z, x = hero.x, alpha = 1, sink = 0, pose = hero.pose;
      if (an && an.type === 'jump') {
        if (el < an.pre) { var q = el / an.pre; sy = 1 - 0.14 * easeOut(q); sx = 1 + 0.1 * easeOut(q); pose = 'hero_idle'; }
        else { var k = clamp((el - an.pre) / an.dur, 0, 1), e = easeInOut(k); z = lerp(an.from.z, an.to.z, e); x = lerp(an.from.x, an.to.x, e); hop = Math.sin(Math.PI * k) * 78; sy = k < 0.3 ? 1.1 : k > 0.75 ? 1.06 : 1.02; sx = 2 - sy; pose = 'hero_jump'; camZTarget = z; }
      } else if (an && an.type === 'land') { var lk = clamp(el / 0.28, 0, 1); sy = lerp(0.8, 1, elastic(lk)); sx = 2 - sy; if (lk >= 1) hero.anim = null; }
      else if (an && an.type === 'bounce') { var bk = clamp(el / 0.32, 0, 1); hop = Math.sin(Math.PI * bk) * 10; sy = 1 + Math.sin(Math.PI * bk) * 0.05; sx = 2 - sy; if (bk >= 1) hero.anim = null; }
      else if (an && an.type === 'cheer') { var reps = an.repeat || 1, ck = el / 0.42; if (ck < reps) { var ph = ck % 1; hop = Math.sin(Math.PI * ph) * 26; sy = ph < 0.15 ? 0.9 : 1.05; sx = 2 - sy; } else hero.anim = null; }
      else if (an && an.type === 'fall') {
        if (el < 0.22) { hop = 14 * easeOut(el / 0.22); rot = Math.sin(el * 40) * 0.06; }
        else { var fk = clamp((el - 0.22) / 0.42, 0, 1); hop = 14 - fk * fk * 70; sy = 1 + fk * 0.25; sx = 1 - fk * 0.2; sink = fk; alpha = fk < 0.7 ? 1 : 1 - (fk - 0.7) / 0.3; if (fk >= 1) alpha = 0; }
      }
      if (!an || an.type !== 'jump') camZTarget = hero.z;
      // idle life: breathing, blink, personality
      if (!an) {
        sy *= 1 + 0.014 * Math.sin(t * 2.4) * (reduced ? 0.3 : 1); rot += 0.012 * Math.sin(t * 1.1) * (reduced ? 0.3 : 1);
        if (t > hero.blinkAt) { hero.blinkUntil = t + 0.12; hero.blinkAt = t + 2.5 + Math.random() * 3; }
        if (pose === 'hero_idle' && t < hero.blinkUntil) pose = 'hero_idle_blink';
        if (idleCue && (pose === 'hero_idle' || pose === 'hero_idle_blink')) { hero.personality = null; var imp = impatience(x); rot += imp.rot; x += imp.dx; hop += imp.hop; sy *= imp.sy; sx = 2 - sy; }
        if (pose === 'hero_idle' && !idleCue && !hero.personality && t - hero.idleSince > 7 && !reduced) { hero.personality = { pose: Math.random() < 0.6 && poseArt('hero_wave') === 'hero_wave' ? 'hero_wave' : 'flip', t0: t, dur: Math.random() < 0.5 ? 1.4 : 1.8 }; }
        if (hero.personality) { var pe = hero.personality; if (t - pe.t0 > pe.dur) { hero.personality = null; hero.idleSince = t; } else if (pose === 'hero_idle' || pose === 'hero_idle_blink') { if (pe.pose === 'flip') hero.flip = Math.sin((t - pe.t0) / pe.dur * Math.PI) > 0.2 ? -1 : 1; else pose = pe.pose; } }
      } else hero.personality = null;
      if (pose === 'hero_nervous' && poseArt(pose) !== pose && !reduced) { rot += Math.sin(t * 38) * 0.025; sy *= 0.97; sx = 2 - sy; } // shiver
      var logical = pose; pose = poseArt(pose);
      var p = proj(z, x, hop); if (!p) return;
      var gp = proj(z, x, 0), sc = HERO * p.s * K;
      if (!(an && an.type === 'fall') && gp) { ctx.fillStyle = 'rgba(30,10,4,' + (0.38 - Math.min(hop, 70) / 260) + ')'; ctx.beginPath(); ctx.ellipse(gp.x, gp.y + 2, 30 * p.s * K * (1 - hop / 220), 10 * p.s * K, 0, 0, Math.PI * 2); ctx.fill(); }
      var y = p.y + sink * 30 * K;
      if (alpha > 0) {
        sprite(pose, p.x, y, sc, { sx: sx, sy: sy, rot: rot, flip: hero.flip, alpha: alpha });
        // lantern flicker glow
        var m = assets.meta(pose), lp = m.lantern || (assets.isFallback(pose) ? A.heroLantern[logical] : null);
        if (lp && quality >= 1) { var lx = p.x + (lp[0] - m.w * m.anchor[0]) * sc * sx * hero.flip, ly = y + (lp[1] - m.h * m.anchor[1]) * sc * sy, fl = 1 + 0.12 * Math.sin(t * 17) + 0.06 * Math.sin(t * 29);
          if (idleCue) fl *= 0.8 + 0.4 * Math.abs(Math.sin(t * 9.7 + Math.sin(t * 2.3) * 3));
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * alpha; var g = A.glow('#ffb84a', 64), gw = 70 * p.s * K * fl; ctx.drawImage(g, lx - gw / 2, ly - gw / 2, gw, gw); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        // fallback idol pose: float the glowing idol above the raised hand
        if (pose === 'hero_idol' && assets.isFallback('hero_idol')) {
          var hx = p.x + (A.heroIdolHand[0] - m.w * m.anchor[0]) * sc * hero.flip, hyy = y + (A.heroIdolHand[1] - m.h * m.anchor[1]) * sc, bob2 = Math.sin(t * 6) * 3 * K * p.s;
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; var g3 = A.glow('#ffd23c', 64), w3 = 120 * p.s * K; ctx.drawImage(g3, hx - w3 / 2, hyy - w3 * 0.75, w3, w3); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          sprite('idol', hx, hyy + bob2, 0.24 * p.s * K, { anchor: [0.5, 0.95] });
        }
      }
      // comic rescue bubble (soot-faced hero floats back to the gate)
      if (hero.bubble) {
        var bk2 = (t - hero.bubble.t0) / 1.6; if (bk2 >= 1) { hero.bubble = null; return; }
        var bp = proj(hero.bubble.z, hero.bubble.x, 40 + easeOut(bk2) * 90); if (!bp) return;
        var bx = bp.x + Math.sin(bk2 * 9) * 6 * K, by = bp.y + bk2 * 80 * K, bs = HERO * bp.s * K * 0.62, ba = bk2 < 0.15 ? bk2 / 0.15 : bk2 > 0.7 ? (1 - bk2) / 0.3 : 1;
        sprite('hero_soot', bx, by, bs, { alpha: ba });
        var r = 60 * bp.s * K; ctx.globalAlpha = ba; ctx.strokeStyle = 'rgba(220,240,255,0.85)'; ctx.lineWidth = 2.5 * K; ctx.beginPath(); ctx.arc(bx, by - r * 0.95, r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(200,230,255,0.16)'; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(bx - r * 0.4, by - r * 1.4, r * 0.18, r * 0.1, -0.6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
    }

    // ---------- particles in world space ----------
    function drawParts(dt) {
      for (var i = parts.length - 1; i >= 0; i--) {
        var q = parts[i]; q.age += dt; if (q.age >= q.life) { parts.splice(i, 1); continue; }
        q.vh += q.g * dt; q.x += q.vx * dt; q.h += q.vh * dt; q.z += q.vz * dt;
        if (q.k !== 'smoke' && q.k !== 'spark' && q.h < -30) { parts.splice(i, 1); continue; }
        var p = proj(q.z, q.x, q.h); if (!p) continue;
        var k = q.age / q.life, a = 1 - k, r = q.s * p.s * K;
        if (q.k === 'lava') { ctx.fillStyle = 'rgba(255,' + Math.round(220 - 140 * k) + ',50,' + a + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, r * (1 - k * 0.4), 0, Math.PI * 2); ctx.fill(); }
        else if (q.k === 'smoke') { var sr = r * (1 + k * 1.4); ctx.globalAlpha = 0.42 * a; ctx.drawImage(A.glow('#b8a49a', 64), p.x - sr, p.y - sr, sr * 2, sr * 2); ctx.globalAlpha = 1; }
        else if (q.k === 'dust') { ctx.fillStyle = 'rgba(235,220,200,' + 0.7 * a + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, r * (1 + k), 0, Math.PI * 2); ctx.fill(); }
        else if (q.k === 'spark') { ctx.fillStyle = 'rgba(255,244,170,' + a + ')'; U.star4(ctx, p.x, p.y, r * 1.5 * (1 - k * 0.5)); ctx.fill(); }
        else if (q.k === 'coin') { var cw = Math.abs(Math.cos(q.age * 9 + q.spin)); ctx.save(); ctx.globalAlpha = Math.min(1, a * 2); ctx.translate(p.x, p.y); ctx.scale(Math.max(0.15, cw), 1); var ci = assets.img('coin'); ctx.drawImage(ci, -r * 1.3, -r * 1.3, r * 2.6, r * 2.6); ctx.restore(); }
      }
    }
    function drawFloaters(dt) {
      for (var i = floaters.length - 1; i >= 0; i--) {
        var f = floaters[i]; f.age += dt; if (f.age > f.life) { floaters.splice(i, 1); continue; }
        var k = f.age / f.life, x, y, sc;
        if (f.screen) { x = W * f.sx; y = H * f.sy; sc = f.age < 0.25 ? easeOutBack(f.age / 0.25) * 1.0 : 1 + 0.03 * Math.sin(t * 8); }
        else { var p = proj(f.z, f.x, f.h + easeOut(Math.min(1, k * 1.6)) * 50); if (!p) continue; x = p.x; y = p.y; sc = f.age < 0.18 ? easeOutBack(f.age / 0.18) : 1; }
        var size = f.size * Math.min(1.25, K) * (f.screen ? 1 : 1);
        ctx.save(); ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1; ctx.translate(x, y); ctx.rotate(f.rot); ctx.scale(sc, sc);
        ctx.font = size + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        ctx.lineWidth = size * 0.26; ctx.strokeStyle = '#4a1206'; ctx.strokeText(f.text, 0, size * 0.06);
        ctx.lineWidth = size * 0.18; ctx.strokeStyle = '#7a2a0a'; ctx.strokeText(f.text, 0, 0);
        var g = ctx.createLinearGradient(0, -size / 2, 0, size / 2); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, f.color); g.addColorStop(1, f.color);
        ctx.fillStyle = g; ctx.fillText(f.text, 0, 0); ctx.restore();
      }
    }
    function rayArt(col) {
      rayCanvas = rayCanvas || {}; if (rayCanvas[col]) return rayCanvas[col]; var cv = U.canvas(512, 512), x = cv.getContext('2d'); x.translate(256, 256);
      for (var i = 0; i < 14; i++) { x.rotate(Math.PI * 2 / 14); var g = x.createLinearGradient(0, 0, 0, -256); g.addColorStop(0, 'rgba(' + col + ',0.85)'); g.addColorStop(0.6, 'rgba(' + col + ',0.25)'); g.addColorStop(1, 'rgba(' + col + ',0)'); x.fillStyle = g; x.beginPath(); x.moveTo(-8, 0); x.lineTo(-34, -256); x.lineTo(34, -256); x.lineTo(8, 0); x.fill(); }
      return (rayCanvas[col] = cv);
    }
    function ageRays(dt) { if (rays) { rays.age += dt; if (rays.age > rays.life) rays = null; } }
    function drawRays() {
      if (!rays) return;
      var p = proj(rays.z, rays.x, rays.h); if (!p) return;
      var k = rays.age / rays.life, a = (k < 0.15 ? k / 0.15 : k > 0.7 ? (1 - k) / 0.3 : 1) * (calm ? 0.18 : 0.3), sz = 470 * rays.scale * K * (0.85 + 0.15 * easeOut(Math.min(1, k * 3)));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.translate(p.x, p.y); ctx.rotate(calm || reduced ? 0 : t * 0.5);
      var tint = rayArt(rays.color || '255,214,90'); ctx.drawImage(tint, -sz / 2, -sz / 2, sz, sz);
      ctx.rotate(0); ctx.globalAlpha = a * 0.6; var g = A.glow('#ffd23c', 64); ctx.drawImage(g, -sz * 0.3, -sz * 0.3, sz * 0.6, sz * 0.6);
      ctx.restore();
    }
    function drawFx(dt) {
      if (!fctx || !fxActive) return;
      var d = fxCanvas.dpr || 1; fctx.setTransform(d, 0, 0, d, 0, 0); fctx.clearRect(0, 0, innerWidth, innerHeight);
      if (!fxParts.length) { fxActive = false; return; }
      var coin = assets.img('coin');
      for (var i = fxParts.length - 1; i >= 0; i--) {
        var q = fxParts[i]; q.age += dt; if (q.age > q.life) { fxParts.splice(i, 1); continue; }
        if (q.k === 'conf') { q.vy += 30 * dt; q.x += (q.vx + Math.sin(q.age * 3 + q.rot) * 40) * dt; q.y += q.vy * dt; q.rot += q.vr * dt; if (q.y > innerHeight + 20) { fxParts.splice(i, 1); continue; }
          fctx.save(); fctx.globalAlpha = q.age > q.life - 0.6 ? (q.life - q.age) / 0.6 : 1; fctx.translate(q.x, q.y); fctx.rotate(q.rot); fctx.scale(1, Math.abs(Math.cos(q.age * 6 + q.rot))); fctx.fillStyle = q.c; fctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); fctx.restore(); }
        else if (q.k === 'fw') { q.vy += 90 * dt; q.vx *= 0.985; q.vy *= 0.985; q.x += q.vx * dt; q.y += q.vy * dt; var a = 1 - q.age / q.life;
          fctx.globalCompositeOperation = 'lighter'; fctx.fillStyle = 'rgba(' + q.c + ',' + a + ')'; fctx.beginPath(); fctx.arc(q.x, q.y, 2.6, 0, Math.PI * 2); fctx.fill();
          fctx.strokeStyle = 'rgba(' + q.c + ',' + a * 0.5 + ')'; fctx.lineWidth = 2; fctx.beginPath(); fctx.moveTo(q.x, q.y); fctx.lineTo(q.x - q.vx * 0.08, q.y - q.vy * 0.08); fctx.stroke(); fctx.globalCompositeOperation = 'source-over'; }
        else if (q.k === 'rain') { q.y += q.vy * dt; if (q.y > innerHeight + 30) { fxParts.splice(i, 1); continue; } if (q.y < -20) continue; var cw = Math.max(0.15, Math.abs(Math.cos(q.age * 7 + q.spin))); fctx.save(); fctx.translate(q.x, q.y); fctx.scale(cw, 1); fctx.drawImage(coin, -q.s / 2, -q.s / 2, q.s, q.s); fctx.restore(); }
        else if (q.k === 'fly' || q.k === 'idolfly') {
          var e = (q.age - q.delay) / q.dur; if (e < 0) continue;
          if (e >= 1) { fxParts.splice(i, 1); if (q.cb) q.cb(q.i || 0, q.n || 1); if (q.k === 'fly') { for (var s = 0; s < 4; s++) fxParts.push({ k: 'fw', x: q.tx, y: q.ty, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, c: '255,220,110', life: 0.35, age: 0 }); } continue; }
          var ee = easeInOut(e), u = 1 - ee, x = u * u * q.x0 + 2 * u * ee * q.cx + ee * ee * q.tx, y = u * u * q.y0 + 2 * u * ee * q.cy + ee * ee * q.ty, sz = q.s * (q.k === 'idolfly' ? 1 - ee * 0.55 : 1 + Math.sin(e * Math.PI) * 0.4);
          if (q.k === 'idolfly') { fctx.globalCompositeOperation = 'lighter'; fctx.drawImage(A.glow('#ffd23c', 64), x - sz, y - sz, sz * 2, sz * 2); fctx.globalCompositeOperation = 'source-over'; var ii = assets.img('idol'); fctx.drawImage(ii, x - sz * 0.4, y - sz * 0.5, sz * 0.8, sz); }
          else { fctx.save(); fctx.translate(x, y); fctx.scale(Math.max(0.2, Math.abs(Math.cos(e * 12 + q.i))), 1); fctx.drawImage(coin, -sz / 2, -sz / 2, sz, sz); fctx.restore(); }
        }
      }
    }

    // ---------- frame ----------
    function step(dtReal) {
      var dt = Math.min(0.05, dtReal) * timeScale; t += dt;
      runTimers();
      camZ += (camZTarget - camZ) * Math.min(1, dt * 6);
      camX += (hero.x * 0.35 - camX) * Math.min(1, dt * 3);
      if (circleFade < 1) circleFade = Math.min(1, circleFade + dt / 1.2);
      for (var i = 0; i < slabs.length; i++) {
        var s = slabs[i]; if (s.wob > 0) s.wob = Math.max(0, s.wob - dt);
        if (s.frags) for (var f = 0; f < s.frags.length; f++) { var fr = s.frags[f]; fr.vy += 260 * dt; fr.x += fr.vx * dt; fr.y += fr.vy * dt * 0.5; fr.rot += fr.vr * dt; if (fr.vy > 0) { fr.sink += dt * 1.1; fr.alpha -= dt * 0.9; } }
      }
      if (glowPulse > 0) glowPulse = Math.max(0, glowPulse - dt);
      if (desat > 0) desat = Math.max(0, desat - dt * 0.9);
      if (flash.a > 0) flash.a = Math.max(0, flash.a - dt * 1.4);
      if (shake > 0) shake = Math.max(0, shake - dt * 26);
      return dt;
    }
    function draw(dt) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var sx = 0, sy = 0; if (shake > 0) { sx = (Math.random() - 0.5) * shake * 2; sy = (Math.random() - 0.5) * shake * 2; }
      ctx.save(); ctx.translate(sx, sy);
      // backdrop (crossfade between circles)
      if (assets.rev && assets.rev() !== assetRev) { assetRev = assets.rev(); patterns = {}; layout(); }
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      var bgs = Math.min(dpr, 1.5), off = -camX * 0.12 * K;
      if (circleFade < 1) { ctx.drawImage(assets.bg(circleFrom, W + 40, H, hy, bgs), off - 20, 0, W + 40, H); ctx.globalAlpha = circleFade; }
      ctx.drawImage(assets.bg(circleNow, W + 40, H, hy, bgs), off - 20, 0, W + 40, H); ctx.globalAlpha = 1;
      drawHazard();
      drawLedges();
      if (painted) { // painted horizon band (crossfades with the circle), fading into the lava
        var b0 = circleFade < 1 ? assets.band(circleFrom, W + 40, H, hy, gy, bgs) : null, b1 = assets.band(circleNow, W + 40, H, hy, gy, bgs);
        if (b0) { ctx.drawImage(b0, off - 20, 0, W + 40, b0.cssH); ctx.globalAlpha = circleFade; }
        if (b1) ctx.drawImage(b1, off - 20, 0, W + 40, b1.cssH);
        ctx.globalAlpha = 1;
      }
      var list = collect();
      for (var i = 0; i < list.length; i++) list[i].f(list[i]);
      ageRays(dt);
      drawParts(dt);
      drawFloaters(dt);
      ctx.restore();
      drawAmbient(dt);
      // flying imp across the screen (idle charm)
      if (!flyer && t > nextFlyer && !reduced) { flyer = { t0: t, dir: Math.random() < 0.5 ? 1 : -1, y: H * (0.25 + Math.random() * 0.2) }; nextFlyer = t + 18 + Math.random() * 20; }
      if (flyer) { var fk = (t - flyer.t0) / 6; if (fk > 1) flyer = null; else { var fx = flyer.dir > 0 ? -40 + fk * (W + 80) : W + 40 - fk * (W + 80); sprite('imp', fx, flyer.y + Math.sin(fk * 20) * 10, 0.22 * K, { flip: flyer.dir, sy: 1 + Math.sin(t * 20) * 0.06 }); } }
      // vignette
      if (!vignette) { vignette = ctx.createRadialGradient(W / 2, H * 0.58, Math.min(W, H) * 0.35, W / 2, H * 0.58, Math.max(W, H) * 0.78); vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(18,2,4,0.55)'); }
      ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
      if (glowPulse > 0) { ctx.fillStyle = 'rgba(20,0,6,' + Math.min(0.28, glowPulse * 0.5) + ')'; ctx.fillRect(0, 0, W, H); }
      if (desat > 0 && quality >= 1) { ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = 'rgba(128,128,128,' + Math.min(1, desat) + ')'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
      if (flash.a > 0) { ctx.fillStyle = 'rgba(' + flash.c + ',' + flash.a + ')'; ctx.fillRect(0, 0, W, H); }
      drawFx(dt);
    }
    function frame(now) {
      var dtReal = lastFrameWall ? (now - lastFrameWall) / 1000 : 0.016; lastFrameWall = now;
      var dt = step(dtReal); draw(dt);
      // adaptive quality: drop a level if we stay under ~42 fps for 2.5 s
      frames++; fpsAcc += dtReal; if (fpsAcc >= 1) { fps = frames / fpsAcc; frames = 0; fpsAcc = 0; if (forcedQuality == null) { slowFor = fps < 42 ? slowFor + 1 : 0; if (slowFor >= 3 && quality > 0) { quality--; slowFor = 0; resize(); } } }
      requestAnimationFrame(frame);
    }
    // keep timers/promises alive when rAF is throttled (background tab)
    setInterval(function () { var now = performance.now(); if (now - lastFrameWall > 400) { step(0.05); lastFrameWall = now - 16; } }, 250);

    if (forcedQuality != null) quality = forcedQuality;
    resize();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { resize(); }).observe(canvas); else window.addEventListener('resize', resize);
    window.addEventListener('resize', function () { if (fxCanvas) resize(); });
    requestAnimationFrame(frame);

    return {
      setup: setup, setLadder: setLadder, restore: restore, jumpTo: jumpTo, celebrate: celebrate, enterCircle: function (c) { setCircle(c, false); },
      coinFly: coinFly, idolFly: idolFly, confetti: confetti, resize: resize,
      react: impReact, stamp: stamp,
      setCalm: function (v) { calm = !!v; buildAmbient(); }, setReduced: function (v) { reduced = !!v; },
      after: after, wait: wait, setIdleCue: setIdleCue, idleCue: function () { return idleCue; },
      setTimeScale: function (v) { timeScale = v > 0 ? v : 1; },
      setQuality: function (q) { forcedQuality = q; if (q != null) { quality = q; resize(); } },
      circle: function () { return circleNow; },
      stats: function () { return { fps: Math.round(fps), quality: quality, dpr: dpr, particles: parts.length + fxParts.length, circle: circleNow, size: [Math.round(W), Math.round(H)] }; }
    };
  }
  root.LavaScene = Scene;
})(this);
