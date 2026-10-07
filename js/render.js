/*
 * Lava Run: Inferno - scene renderer (Canvas2D + an optional WebGL lava layer, js/lava-gl.js). Purely visual: it never
 * decides outcomes (Math.random and the seeded PRNG are used ONLY for decoration). The app tells it what happened; it animates it.
 *
 * World: a pseudo-3D "descent" corridor. Slab k sits at depth z = k*S; the camera looks down the corridor,
 * so slabs ahead converge toward a vanishing point (the funnel of Hell). Depth zones map to the 9 circles
 * (LavaCircles.circleOf), so the hazard, slabs, props and arches ahead already show the next circle.
 *
 * Effects (all respect Calm effects: no shake, no flashes above 0.12, fewer/smaller particles, gentler slow-mo):
 *  light & atmosphere (god rays, bloom pass, motes, heat haze in the lava shader, lava underlight on the hero),
 *  step anticipation (camera push-in, slab wobble), safe-landing shockwave + runes, multiplier sparks to the counter,
 *  lava micro-eruptions, collapse eruption, idol slow-mo + sun flare, streak aura, circle portal swirl,
 *  physics coin shower and cash-out coin fountain on the full-viewport FX canvas, sprite-sequence player.
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
  function toHex(c) { return '#' + ((1 << 24) | (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2])).toString(16).slice(1); }
  function hash(a, b) { var x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); }
  var FONT = '"Lilita One", "Arial Black", system-ui, sans-serif', SERIF = '"Cinzel", Georgia, serif';
  var RUNES = ['\u03A9', '\u0394', '\u03A8', '\u03A6', '\u039B', '\u03A3', '\u039E', '\u03A0'];

  function Scene(canvas, fxCanvas, assets, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d'), fctx = fxCanvas ? fxCanvas.getContext('2d') : null;
    var W = 390, H = 470, dpr = 1, K = 1, hy = 90, gy = 395, cx = 195;
    var F = 260, S = 110, L = 150, SLAB = 0.41, HERO = 0.19, COL = 0.42, painted = false;
    var quality = 2, forcedQuality = opts.quality != null ? opts.quality : null, calm = false, reduced = false, timeScale = 1;
    var t = 0, wall = 0, lastFrameWall = 0, frames = 0, fpsAcc = 0, fps = 60, slowFor = 0, frameMs = 16;
    var N = 24, ladder = [], idolCount = 0, slabs = [], borders = [];
    var camZ = 0, camX = 0, camZTarget = 0;
    var hero = { z: 0, x: 0, hop: 0, pose: 'hero_idle', sx: 1, sy: 1, rot: 0, alpha: 1, visible: true, flip: 1, anim: null, idleSince: 0, blinkAt: 2, blinkUntil: 0, personality: null, sink: 0, bubble: null, lastPose: '', poseT0: 0, clip: null, waved: false, sooty: null };
    var diffId = 'normal', heroDrawn = '', heroFoot = null, slabTops = {};
    var parts = [], amb = [], motes = [], floaters = [], fxParts = [], timers = [], erupts = [];
    var shake = 0, flash = { a: 0, c: '255,220,140' }, rays = null, desat = 0, glowPulse = 0;
    var circleNow = 0, circleFrom = 0, circleFade = 1;
    var impMood = { type: 'idle', until: 0 }, flyer = null, nextFlyer = 12;
    var idleCue = 0, cueT0 = 0, peek = null; // gentle 'still there?' cues during an active run (no timer, no pressure)
    var patterns = {}, flameCache = {}, rayCanvas = null, beamCache = {}, vignette = null, fxActive = false;
    var MAXP = [70, 160, 280];
    var assetRev = 0;
    var lavaGL = null, glState = '', collapseHot = null;
    var zoom = 1, zoomTarget = 1, zoomFocus = { x: 195, y: 300 };
    var slow = 1, slowTarget = 1, slowUntil = 0;
    var nextErupt = 0.8, nextBurp = 6;
    var streak = 0, aura = 0, auraT0 = 0;
    var portal = null, flare = null;
    var bloomA = null, bloomB = null, lastReveal = -1;

    // ---------- timers in scene time (time-scale aware) ----------
    function after(ms, fn) { timers.push({ at: t + ms / 1000, fn: fn }); }
    function wait(ms) { return new Promise(function (res) { after(ms, res); }); }
    function runTimers() { for (var i = timers.length - 1; i >= 0; i--) if (timers[i].at <= t) { var f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (e) { console.error(e); } } }

    // ---------- layout ----------
    function resize() {
      var r = canvas.getBoundingClientRect();
      var cap = [1.25, 1.5, 2][quality];
      dpr = Math.min(window.devicePixelRatio || 1, cap);
      W = Math.max(200, r.width); H = Math.max(200, r.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      layout();
      patterns = {}; bloomA = bloomB = null;
      if (fxCanvas) { var fd = Math.min(window.devicePixelRatio || 1, 2); fxCanvas.width = Math.round(innerWidth * fd); fxCanvas.height = Math.round(innerHeight * fd); fxCanvas.dpr = fd; }
      buildAmbient();
    }
    function layout() {
      painted = !!(assets.hasBand && assets.hasBand());
      K = clamp(Math.min(W / 390, H / 470), 0.72, 2.4);
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
    /** canvas-local point -> point after the camera push-in transform (for FX that leave the scene canvas) */
    function zoomed(p) { return { x: zoomFocus.x + (p.x - zoomFocus.x) * zoom, y: zoomFocus.y + (p.y - zoomFocus.y) * zoom }; }
    function zoneCircle(z) { var k = Math.round(z / S); if (k <= 0) return 0; return C.circleOf(Math.min(k, N), N); }
    function slabX(i) { if (i <= 0) return 0; return Math.sin(i * 2.15 + 0.7) * 70 * (i % 3 === 0 ? 0.55 : 1); }
    /** THE place the hero stands on slab k (world space): the slab's anchor = the centre of its top face (rotation and scale
     *  of the slab variants pivot on it). Used by setup/restore, the jump target, the landing, the soot return and every frame
     *  while he isn't airborne, so his resting position can never drift from the slab he is on. */
    function standOn(k) { return { z: k * S, x: slabX(k) }; }
    function placeHero(k) { var sp = standOn(k); hero.z = sp.z; hero.x = sp.x; return sp; }
    function depthAlpha(d) { var a = 1; if (d < -0.12 * S) a = clamp(1 + (d + 0.12 * S) / (0.42 * S), 0, 1); if (d > 7 * S) a *= clamp(1 - (d - 7 * S) / (3.5 * S), 0, 1); return a; }
    function addGlow(col, x, y, w, h, a) { if (a <= 0.004 || w < 1) return; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a); ctx.drawImage(A.glow(col, 64), x - w / 2, y - h / 2, w, h); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }

    // ---------- round setup ----------
    function setup(steps, newLadder, j) {
      N = steps; ladder = newLadder.slice(); idolCount = j || 0;
      slabs = []; var first = C.firstSteps(N); borders = []; for (var b = 0; b < 9; b++) borders.push(first[b] != null ? (first[b] - 0.5) * S : null);
      for (var i = 0; i <= N; i++) slabs.push({ state: i === 0 ? 'passed' : 'idle', idol: false, idolT: -1, frags: null, wob: 0, crackT: -1, ring: -1, ringK: 0, runeT: -1 });
      placeHero(0); hero.hop = 0; hero.anim = null; hero.pose = 'hero_idle'; hero.visible = true; hero.alpha = 1; hero.sink = 0; hero.rot = 0; hero.sx = hero.sy = 1; hero.bubble = null; hero.idleSince = t; hero.clip = null; hero.sooty = null;
      if (!hero.waved) { hero.waved = true; hero.clip = { name: 'hero_wave', t0: t + 0.35, rate: 1, wait: 3 }; } // hello on load / first round
      camZ = camZTarget = 0; camX = 0; rays = null; floaters = []; parts = []; desat = 0; zoomTarget = 1; collapseHot = null;
      setStreak(0);
      setCircle(0, true);
    }
    function setLadder(l, j) { ladder = l.slice(); idolCount = j; }
    function restore(k, path) {
      var kk = 0;
      for (var i = 0; i < path.length; i++) { if (path[i] === 'collapse') break; kk++; slabs[kk].state = 'passed'; slabs[kk].runeT = -99; if (path[i] === 'idol') { slabs[kk].idol = true; slabs[kk].idolT = -99; } }
      placeHero(k); camZ = camZTarget = hero.z; camX = hero.x * 0.35;
      setCircle(C.circleOf(k, N), true); setStreak(k);
    }
    function setCircle(c, instant) {
      if (c === circleNow && !instant) return;
      circleFrom = instant ? c : circleNow; circleNow = c; circleFade = instant ? 1 : 0;
      if (!instant && c > 0) portal = { t0: t, c: c };
      buildAmbient();
    }
    /** consecutive safe steps in this run -> fiery aura level (0..3), presentation only */
    function setStreak(k) {
      streak = k | 0; var lv = streak >= 10 ? 3 : streak >= 7 ? 2 : streak >= 4 ? 1 : 0;
      if (lv > aura) auraT0 = t;
      if (lv !== aura) { aura = lv; if (opts.onStreak) opts.onStreak(lv); }
      return lv;
    }

    // ---------- sequences ----------
    /**
     * Jump to slab k. outcome is only used AFTER the reveal; everything before it (hop, landing,
     * anticipation: camera push-in, wobble, heartbeat) is identical for every outcome. opts: {tension, onLand, onTension, onReveal}
     */
    function jumpTo(k, outcome, o) {
      o = o || {};
      setIdleCue(0); if (peek) peek = null;
      var tension = o.tension || 0, from = { z: hero.z, x: hero.x }, to = standOn(k);
      hero.flip = to.x >= from.x ? 1 : -1;
      return new Promise(function (resolve) {
        var pre = 0.09, dur = 0.44, jm = animReady('hero_jump') ? assets.animMeta('hero_jump') : null;
        if (jm) {
          // airborne frames from the converter (else ~35%..75% of the clip); the clip is sped up (<= 2x) so the flight takes ~0.46 s,
          // and only ~0.2 s of the wind-up before take-off is played
          var fps = jm.fps, a0 = jm.airborne ? jm.airborne[0] : Math.round(jm.frames * 0.35), a1 = jm.landFrame != null ? jm.landFrame : jm.airborne ? jm.airborne[1] + 1 : Math.round(jm.frames * 0.75);
          var rate = clamp((a1 - a0) / fps / 0.46, 1, 2), f0 = Math.max(0, a0 - Math.floor(0.2 * rate * fps));
          pre = (a0 - f0) / fps / rate; dur = (a1 - a0) / fps / rate;
          hero.clip = { name: 'hero_jump', t0: t - f0 / fps / rate, rate: rate };
        } else hero.clip = null;
        hero.anim = { type: 'jump', t0: t, from: from, to: to, dur: dur, pre: pre, clip: !!jm };
        after(Math.round((pre + dur) * 1000) + 1, function () { // landed
          var jumpClip = hero.clip && hero.clip.name === 'hero_jump' ? hero.clip : null;
          hero.anim = { type: 'land', t0: t, clip: !!jumpClip }; placeHero(k); hero.hop = 0; // == the end of the airborne tween (to)
          if (jumpClip) { // this is the clip's landFrame: thud. After it the clip lowers the arms and ends on hero_idle frame 0,
            // so it flows straight into the idle loop. The post-landing part plays faster so the arms-up landing pose is brief
            // and the hero is back to standing ~1.5 s after touchdown; a STEP tap during it starts the next jump at once.
            shakeOn(1.2);
            var jmm = assets.animMeta('hero_jump'), lf = jmm.landFrame != null ? jmm.landFrame : Math.round(jmm.frames * 0.75), post = Math.max(jumpClip.rate, 1.8);
            if (jmm.frames - lf > 12) { jumpClip.rate = post; jumpClip.t0 = t - lf / jmm.fps / post; } // re-base: same frame now, faster from here
          }
          dust(to.z, to.x, 12); ring(k, 0.5);
          if (o.onLand) o.onLand();
          // anticipation before EVERY reveal (outcome-neutral): a short push-in; longer, with a heartbeat, when more is at stake
          var tensionMs = tension === 2 ? 820 : tension === 1 ? 520 : (calm ? 160 : 240);
          var push = tension === 2 ? 0.095 : tension === 1 ? 0.065 : 0.03;
          var hp = proj(to.z, to.x, 40); if (hp) zoomFocus = { x: hp.x, y: hp.y };
          zoomTarget = 1 + push * (calm || reduced ? 0.45 : 1);
          slabs[k].wob = tensionMs / 1000 * (tension ? 1 : 0.6);
          if (tension) { hero.pose = 'hero_nervous'; glowPulse = tensionMs / 1000; }
          if (o.onTension) o.onTension(tension);
          after(tensionMs + 40, function () {
            zoomTarget = 1; lastReveal = t;
            if (o.onReveal) o.onReveal(outcome);
            if (outcome === 'collapse') { collapse(k, resolve); return; }
            slabs[k].state = 'passed'; hero.pose = 'hero_idle'; hero.idleSince = t;
            sparkle(k, tension ? 18 : 10); ring(k, 1); slabs[k].runeT = t;
            var v = ladder[k - 1];
            if (v != null) floatText('x' + (v / 100).toFixed(2), to.z, to.x, 150, '#ffe680', 30, 1.1);
            if (tension) floatText(tension === 2 ? 'PHEW!!' : 'PHEW!', to.z, to.x, 210, '#ffffff', tension === 2 ? 40 : 32, 1.2, -0.08);
            hero.anim = { type: 'bounce', t0: t };
            setStreak(k);
            if (outcome === 'idol') idolReveal(k);
            after(outcome === 'idol' ? 260 : 120, resolve);
          });
        });
      });
    }
    function idolReveal(k) {
      var s = slabs[k]; s.idol = true; s.idolT = t;
      hero.pose = 'hero_idol'; hero.anim = { type: 'cheer', t0: t };
      rays = { z: k * S, x: slabX(k), h: 120, age: 0, life: calm ? 1.2 : 1.8, scale: calm ? 0.8 : 1.2, color: '255,214,90' };
      flare = { t0: t, z: k * S, x: slabX(k) + 20, h: 150 };
      slowTarget = calm || reduced ? 0.6 : 0.3; slowUntil = wall + (calm ? 0.35 : 0.6); // slow-motion beat (real time)
      stamp('IDOL x2!', '#ffd23c');
      burst(k * S, slabX(k), 130, calm ? 14 : 36, 'spark');
      flashOn(calm ? 0.1 : 0.26, '255,214,90');
      impReact('cheer', 1.6);
      var idD = animReady('hero_idol') ? animDur('hero_idol') : 0;
      if (idD) { hero.anim = null; hero.clip = { name: 'hero_idol', t0: t, rate: 1 }; }
      after(idD ? Math.round(idD * 1000) + 1000 : 1150, function () { if (hero.pose === 'hero_idol') { hero.pose = 'hero_idle'; hero.idleSince = t; } if (hero.clip && hero.clip.name === 'hero_idol') hero.clip = null; });
    }
    function collapse(k, resolve) {
      var s = slabs[k];
      s.state = 'cracking'; s.crackT = t; shakeOn(4);
      after(300, function () {
        s.state = 'collapsed'; s.frags = makeFrags(k);
        hero.pose = 'hero_fall'; hero.anim = { type: 'fall', t0: t, clip: animReady('hero_fall') }; hero.clip = hero.anim.clip ? { name: 'hero_fall', t0: t, rate: 1 } : null;
        shakeOn(6); desat = calm ? 0.25 : 0.6; flashOn(calm ? 0.08 : 0.22, '255,90,30');
        burst(k * S, slabX(k), 10, calm ? 12 : 26, 'lava');
        setStreak(0);
        after(420, function () { // the lava erupts where the hero falls in
          collapseHot = { x: slabX(k), z: k * S, t0: t };
          erupts.push({ z: k * S + 4, x: slabX(k), t0: t - 0.45, big: true, kind: 'collapse', c: zoneCircle(k * S), seed: Math.random() * 999, dur: 2.2, size: calm ? 0.8 : 1.25, swell: 0.45 });
        });
        after(560, function () {
          splash(k * S, slabX(k)); shakeOn(3);
          floatText(Math.random() < 0.5 ? 'SIZZLE!' : 'OOPS!', k * S, slabX(k), 120, '#ffb36b', 40, 1.3, 0.1);
          impReact('giggle', 2.2);
          after(420, function () { hero.bubble = { t0: t, z: k * S, x: slabX(k) }; hero.pose = 'hero_soot'; });
          // with the soot clip: after the bubble pops the sooty hero is back on the last safe slab until the next round
          after(2100, function () { if (hero.pose === 'hero_soot' && animReady('hero_soot')) { var kb = Math.max(0, k - 1); hero.sooty = { t0: t }; hero.anim = null; hero.clip = null; placeHero(kb); smokePuff(hero.z, hero.x); } });
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
      hero.pose = 'hero_win'; hero.anim = { type: 'cheer', t0: t, repeat: r >= 4 ? 4 : r >= 3 ? 2 : 1 }; hero.clip = null;
      if (animReady('hero_win')) { hero.anim = null; hero.clip = { name: 'hero_win', t0: t, rate: 1 }; }
      burst(hero.z, hero.x, 120, calm ? 10 : [0, 18, 30, 44, 60][r], 'coin');
      sparkle(k, calm ? 8 : 16);
      if (r >= 2) rays = { z: hero.z, x: hero.x, h: 70, age: 0, life: [0, 1.2, 1.8, 2.6, 3.6][r], scale: [0, 0.9, 1.1, 1.4, 1.7][r] * (calm ? 0.75 : 1), color: r >= 4 ? '255,190,240' : r >= 3 ? '255,170,90' : '255,226,130' };
      if (r >= 2) { coinShower(calm ? 14 : [0, 0, 36, 70, 120][r], r); shakeOn([0, 0, 2.5, 3.5, 5][r]); }
      if (r >= 2) confetti(calm ? 20 : [0, 0, 50, 90, 140][r]);
      if (r >= 3) for (var i = 0; i < (calm ? 1 : r === 3 ? 3 : 6); i++) (function (i) { after(250 + i * 380, function () { firework(); }); })(i);
      if (r >= 4 && !calm) coinRain(2.6);
      flashOn(calm ? 0.06 : [0, 0.12, 0.2, 0.26, 0.32][r], '255,230,150');
      impReact('cheer', 2 + r * 0.4);
      setStreak(0);
      var hold = [0, 1300, 1900, 2700, 3700][r]; if (hero.clip) hold = Math.max(hold, Math.round(animDur('hero_win') * 1000) + 900);
      after(hold, function () { if (hero.pose === 'hero_win') { hero.pose = 'hero_idle'; hero.idleSince = t; } if (hero.clip && hero.clip.name === 'hero_win') hero.clip = null; });
      return wait(520);
    }

    // ---------- effects primitives ----------
    function budget() { return MAXP[quality] * (calm ? 0.45 : 1); }
    function shakeOn(a) { if (calm || reduced) return; shake = Math.max(shake, Math.min(6, a)); }
    function flashOn(a, c) { flash.a = Math.max(flash.a, Math.min(calm ? 0.12 : 0.35, a)); flash.c = c; }
    function ring(k, strength) { if (slabs[k]) { slabs[k].ring = t; slabs[k].ringK = strength || 0.5; } }
    function dust(z, x, n) { n = Math.round(n * (calm ? 0.5 : 1)); for (var i = 0; i < n && parts.length < budget(); i++) { var a = Math.PI + Math.random() * Math.PI; parts.push({ k: 'dust', z: z, x: x + (Math.random() - 0.5) * 50, h: 4, vx: Math.cos(a) * 60, vh: Math.random() * 30, vz: (Math.random() - 0.5) * 30, g: 0, life: 0.55, age: 0, s: 3 + Math.random() * 4 }); } }
    function sparkle(k, n) { var z = k * S, x = slabX(k); for (var i = 0; i < n && parts.length < budget(); i++) { var a = Math.random() * Math.PI * 2, v = 50 + Math.random() * 90; parts.push({ k: 'spark', z: z, x: x + Math.cos(a) * 30, h: 20 + Math.random() * 40, vx: Math.cos(a) * v, vh: 60 + Math.random() * 90, vz: Math.sin(a) * 30, g: -140, life: 0.7 + Math.random() * 0.5, age: 0, s: 4 + Math.random() * 5 }); } }
    function burst(z, x, h, n, kind) { for (var i = 0; i < n && parts.length < budget(); i++) { var a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 160; parts.push({ k: kind, z: z, x: x, h: h, vx: Math.cos(a) * v, vh: 120 + Math.random() * 220, vz: Math.sin(a) * 40, g: kind === 'spark' ? -120 : -520, life: 1 + Math.random() * 0.7, age: 0, s: kind === 'coin' ? 7 + Math.random() * 4 : 3 + Math.random() * 5, spin: Math.random() * 6 }); } }
    function smokePuff(z, x) { var n = calm ? 5 : 10; for (var i = 0; i < n && parts.length < budget(); i++) parts.push({ k: 'smoke', z: z + (Math.random() - 0.5) * 20, x: x + (Math.random() - 0.5) * 40, h: 10 + Math.random() * 40, vx: (Math.random() - 0.5) * 30, vh: 20 + Math.random() * 30, vz: 0, g: 0, life: 0.9 + Math.random() * 0.5, age: 0, s: 14 + Math.random() * 10 }); }
    function splash(z, x) {
      var n = calm ? 16 : 36;
      for (var i = 0; i < n && parts.length < budget(); i++) { var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 120 + Math.random() * 220; parts.push({ k: 'lava', z: z, x: x + (Math.random() - 0.5) * 40, h: 0, vx: Math.cos(a) * v * 0.6, vh: -Math.sin(a) * v, vz: (Math.random() - 0.5) * 40, g: -600, life: 0.7 + Math.random() * 0.6, age: 0, s: 3 + Math.random() * 5 }); }
      for (var j = 0; j < (calm ? 4 : 10); j++) parts.push({ k: 'smoke', z: z, x: x + (Math.random() - 0.5) * 60, h: 10, vx: (Math.random() - 0.5) * 20, vh: 40 + Math.random() * 40, vz: 0, g: 0, life: 1.6, age: 0, s: 14 + Math.random() * 16 });
    }
    function floatText(text, z, x, h, color, size, life, rot) { floaters.push({ text: text, z: z, x: x, h: h, color: color, size: size, life: life || 1.2, age: 0, rot: rot || 0, screen: false }); }
    function stamp(text, color) { floaters.push({ text: text, sx: 0.5, sy: 0.4, color: color, size: 58, life: 1.9, age: 0, rot: -0.06, screen: true, stamp: true }); }
    function impReact(type, sec) { impMood = { type: type, until: t + sec }; }

    // ---------- fx canvas (full viewport): confetti, coin shower / fountain, fireworks, idol + multiplier flights ----------
    function stageRect() { return canvas.getBoundingClientRect(); }
    function stageScale() { var r = stageRect(); return r.width / W || 1; } // the desktop cabinet is CSS-scaled
    function toClient(p) { var r = stageRect(), k = stageScale(), q = zoomed(p); return { x: r.left + q.x * k, y: r.top + q.y * k }; }
    function heroClient() { return toClient(proj(hero.z, hero.x, 50) || { x: cx, y: gy }); }
    function confetti(n) { var cols = ['#ffd23c', '#ff5a6a', '#7ae05a', '#5ac8ff', '#ffffff', '#ff9a2a']; for (var i = 0; i < n; i++) fxParts.push({ k: 'conf', x: innerWidth * Math.random(), y: -20 - Math.random() * innerHeight * 0.4, vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 140, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: cols[i % cols.length], life: 3.2, age: 0 }); fxActive = true; }
    function firework() { var r = stageRect(), x = r.left + r.width * (0.2 + Math.random() * 0.6), y = r.top + r.height * (0.15 + Math.random() * 0.3), cols = ['255,214,90', '255,120,140', '140,220,255', '160,255,140'], c = cols[Math.floor(Math.random() * cols.length)];
      for (var i = 0; i < (quality ? 46 : 24); i++) { var a = i / 46 * Math.PI * 2, v = 120 + Math.random() * 90; fxParts.push({ k: 'fw', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: c, life: 1.1 + Math.random() * 0.4, age: 0 }); }
      fxActive = true; if (opts.onFirework) opts.onFirework(); }
    function coinRain(sec) { var n = Math.round(sec * 22); for (var i = 0; i < n; i++) fxParts.push({ k: 'rain', x: Math.random() * innerWidth, y: -30 - Math.random() * innerHeight * 1.2, vy: 260 + Math.random() * 200, spin: Math.random() * 6, life: 4, age: 0, s: 14 + Math.random() * 10 }); fxActive = true; }
    /** physics coin shower: coins burst up from the hero, fall, bounce on the stage floor and settle/fade */
    function coinShower(n, rank) {
      var st = heroClient(), r = stageRect(), floor = r.top + r.height * 0.97;
      n = Math.round(n * [0.45, 0.75, 1][quality]);
      for (var i = 0; i < n; i++) { var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 380 + Math.random() * 420 + rank * 40;
        fxParts.push({ k: 'pc', x: st.x + (Math.random() - 0.5) * 30, y: st.y, vx: Math.cos(a) * v * 0.75, vy: Math.sin(a) * v, floor: floor - Math.random() * 30, spin: Math.random() * 6, vs: 6 + Math.random() * 10, s: 16 + Math.random() * 12, life: 2.6 + Math.random() * 0.8, age: 0, delay: Math.random() * 0.35, b: 0 }); }
      fxActive = true;
    }
    /** coins fly from the hero to a DOM element; onArrive(i, n) per coin. A short upward fountain first, then a curve into the target. */
    function coinFly(el, n, onArrive) {
      if (!el) return; var tr = el.getBoundingClientRect(), tx = tr.left + tr.width * 0.2, ty = tr.top + tr.height / 2, st = heroClient();
      n = Math.max(3, Math.round(n * (calm ? 0.5 : 1)));
      for (var i = 0; i < n; i++) { var a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, v = 260 + Math.random() * 260;
        fxParts.push({ k: 'fly', x0: st.x + (Math.random() - 0.5) * 30, y0: st.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, up: calm ? 0.18 : 0.32 + Math.random() * 0.12, tx: tx, ty: ty, delay: i * 0.045, dur: 0.6 + Math.random() * 0.15, age: 0, life: 9, i: i, n: n, cb: onArrive, s: 18 + Math.random() * 6 }); }
      fxActive = true;
    }
    function idolFly(el, onArrive) {
      if (!el) return; var tr = el.getBoundingClientRect(), k = Math.round(hero.z / S), p = toClient(proj(k * S, slabX(k), 170) || { x: cx, y: gy });
      fxParts.push({ k: 'idolfly', x0: p.x, y0: p.y, cx: p.x - 40, cy: tr.top - 80, tx: tr.left + tr.width / 2, ty: tr.top + tr.height / 2, delay: 0.75, dur: 0.6, age: 0, life: 9, cb: onArrive, s: 60 });
      fxActive = true;
    }
    /** golden multiplier sparks fly from the landed slab into a HUD element (the counter); onArrive() once, when the first lands */
    function multFly(el, k, onArrive) {
      if (!el) { if (onArrive) onArrive(); return; }
      var tr = el.getBoundingClientRect(), p = toClient(proj(k * S, slabX(k), 20) || { x: cx, y: gy }), n = calm ? 5 : [7, 11, 16][quality], done = false;
      for (var i = 0; i < n; i++) fxParts.push({ k: 'spk', x0: p.x + (Math.random() - 0.5) * 50, y0: p.y + (Math.random() - 0.5) * 16, cx: p.x + (Math.random() - 0.5) * 200, cy: Math.min(p.y, tr.top) - 40 - Math.random() * 90, tx: tr.left + tr.width * (0.3 + Math.random() * 0.4), ty: tr.top + tr.height / 2, delay: i * 0.03, dur: 0.5 + Math.random() * 0.12, age: 0, life: 4, s: 5 + Math.random() * 4,
        cb: function () { if (!done) { done = true; if (onArrive) onArrive(); } } });
      fxActive = true;
    }

    // ---------- ambient particles (per circle) + light motes ----------
    function buildAmbient() {
      amb = []; var type = A.palette(circleNow).amb, n = { mist: 9, wind: 22, rain: 70, gold: 26, swamp: 22, embers: 40, firerain: 30, ash: 36, snow: 55 }[type] || 30;
      n = Math.round(n * [0.35, 0.7, 1][quality] * (calm ? 0.5 : 1));
      for (var i = 0; i < n; i++) amb.push(newAmb(type, true));
      motes = []; var nm = Math.round([6, 14, 24][quality] * (calm ? 0.5 : 1));
      for (var j = 0; j < nm; j++) motes.push({ x: Math.random() * W, y: hy + Math.random() * (H - hy), z: 0.3 + Math.random() * 0.7, ph: Math.random() * 6, v: 4 + Math.random() * 10 });
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
      // dust motes drifting through the god rays (soft, warm, additive)
      if (quality >= 1 && motes.length) {
        var mg = A.glow(c9() ? '#dff4ff' : '#ffe2b0', 32);
        ctx.globalCompositeOperation = 'lighter';
        for (var m = 0; m < motes.length; m++) { var q = motes[m]; q.y -= q.v * dt * q.z; q.x += Math.sin(t * 0.4 + q.ph) * 6 * dt; if (q.y < hy - 20) { q.y = H + 10; q.x = Math.random() * W; }
          var tw2 = 0.5 + 0.5 * Math.sin(t * 1.3 + q.ph * 3), ms = (3 + 5 * q.z) * K; ctx.globalAlpha = (calm ? 0.18 : 0.32) * tw2 * q.z; ctx.drawImage(mg, q.x - ms, q.y - ms, ms * 2, ms * 2); }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }
    function c9() { return circleNow === 9; }

    // ---------- lava micro-eruptions (world objects: swell, pop, droplets, sparks, smoke; style per circle) ----------
    var ERUPT_STYLE = { // drop = droplet rgb, hot = glow, sparks, smoke rgb, swell dome
      0: { sparks: 1, smoke: [90,60,50] }, 1: { sparks: 0.4, smoke: [150,140,160] }, 2: { sparks: 0.7, smoke: [150,80,110] },
      3: { sparks: 0, smoke: [90,90,80], mud: true }, 4: { sparks: 1.2, smoke: [140,110,60], gold: true }, 5: { sparks: 0, smoke: [120,170,140], swamp: true },
      6: { sparks: 1, smoke: [80,50,40] }, 7: { sparks: 1.3, smoke: [90,50,30] }, 8: { sparks: 0.5, smoke: [50,40,40], pitch: true }, 9: null
    };
    function spawnEruption(force) {
      var d = (0.7 + Math.random() * 6) * S, z = camZ + d, c = zoneCircle(z), st = ERUPT_STYLE[c];
      if (!st && !force) return;
      var big = Math.random() < 0.18, kind = big ? 'burp' : Math.random() < 0.35 ? 'spurt' : 'bubble';
      var x = (Math.random() * 2 - 1) * (L - 25), sl = Math.round(z / S); if (Math.abs(x - slabX(sl)) < 55 && Math.abs(z - sl * S) < 40) x += x > slabX(sl) ? 60 : -60;
      erupts.push({ z: z, x: x, t0: t, kind: kind, c: c, seed: Math.random() * 999, dur: kind === 'burp' ? 2.4 : kind === 'spurt' ? 1.5 : 1.6, size: (big ? 1.25 : 0.65 + Math.random() * 0.35) * (calm ? 0.75 : 1), swell: kind === 'spurt' ? 0.25 : 0.7 + Math.random() * 0.4 });
      if (opts.onBubble && d < 4.2 * S) opts.onBubble(kind === 'burp' ? 2 : kind === 'spurt' ? 1 : 0, c);
    }
    function ageErupts(dt) {
      for (var i = erupts.length - 1; i >= 0; i--) if (t - erupts[i].t0 > erupts[i].dur + erupts[i].swell) erupts.splice(i, 1);
      if (reduced) return;
      nextErupt -= dt;
      if (nextErupt <= 0) { spawnEruption(false); var rate = [0.9, 1.7, 2.6][quality] * (calm ? 0.5 : 1); nextErupt = (0.3 + Math.random() * 0.9) / rate * 1.6; }
    }
    function drawErupt(o) {
      var e = o.e, p = proj(e.z, e.x, 0); if (!p) return; var al = depthAlpha(p.d); if (al <= 0) return;
      var pal = A.palette(e.c === 9 ? 6 : e.c), st = ERUPT_STYLE[e.c] || ERUPT_STYLE[0], hot = pal.lavaRgb[4], warm = pal.lavaRgb[3], mid = pal.lavaRgb[2], dark = pal.lavaRgb[1];
      if (st.mud) { hot = [190, 150, 100]; warm = [130, 96, 60]; } if (st.swamp) { hot = [150, 240, 190]; warm = [60, 140, 110]; mid = [30, 80, 64]; } if (st.pitch) { hot = [255, 150, 70]; warm = [70, 40, 30]; mid = [30, 22, 20]; }
      var age = t - e.t0, sc = p.s * K * e.size, R = 26 * sc;
      if (age < e.swell) { // the dome swells
        var k = age / e.swell, r = R * (0.3 + 0.7 * easeInOut(k)), dome = r * 0.62 * (0.5 + 0.5 * k);
        ctx.globalAlpha = al; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(A.glow(toHex(warm), 64), p.x - r * 2, p.y - r * 0.9, r * 4, r * 1.8); ctx.globalCompositeOperation = 'source-over';
        var g = ctx.createRadialGradient(p.x - r * 0.3, p.y - dome * 0.7, r * 0.05, p.x, p.y - dome * 0.2, r);
        g.addColorStop(0, U.rgba(hot, al)); g.addColorStop(0.45, U.rgba(st.pitch ? mid : warm, al)); g.addColorStop(1, U.rgba(st.pitch ? dark : mid, al * 0.9));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.42, 0, Math.PI, 0); ctx.ellipse(p.x, p.y - 0.01, r, dome, 0, 0, Math.PI, true); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * al * k) + ')'; ctx.beginPath(); ctx.ellipse(p.x - r * 0.32, p.y - dome * 0.62, r * 0.18, r * 0.08, -0.4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; return;
      }
      var tt = age - e.swell, life = e.dur, kk = tt / life;
      // pop ring on the surface
      if (tt < 0.6) { var rk = tt / 0.6; ctx.strokeStyle = U.rgba(hot, al * 0.8 * (1 - rk)); ctx.lineWidth = Math.max(1, 3 * sc * (1 - rk)); ctx.beginPath(); ctx.ellipse(p.x, p.y, R * (0.8 + 1.6 * rk), R * 0.38 * (0.8 + 1.6 * rk), 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * (1 - rk) * 0.8; ctx.drawImage(A.glow(toHex(hot), 64), p.x - R * 2.4, p.y - R * 1.2, R * 4.8, R * 2.4); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      // droplets: analytic ballistic arcs (no per-frame state), stretched along the velocity
      var nd = Math.round((e.kind === 'burp' || e.kind === 'collapse' ? 16 : e.kind === 'spurt' ? 10 : 6) * [0.5, 0.8, 1][quality] * (calm ? 0.6 : 1));
      var G = 900, vmax = e.kind === 'spurt' ? 420 : e.kind === 'bubble' ? 200 : e.kind === 'collapse' ? 560 : 330;
      for (var i = 0; i < nd; i++) {
        var hA = hash(e.seed, i), hB = hash(i, e.seed + 3), hC = hash(e.seed + i, 7);
        var ang = e.kind === 'spurt' ? (hA - 0.5) * 0.7 : (hA - 0.5) * 2.4, v = vmax * (0.45 + 0.55 * hB) * e.size, td = tt - hC * 0.12; if (td <= 0) continue;
        var vx = Math.sin(ang) * v * 0.55, vh = Math.cos(ang) * v, hh = vh * td - 0.5 * G * td * td; if (hh < -4) continue;
        var dp = proj(e.z + (hC - 0.5) * 20 * td, e.x + vx * td, hh); if (!dp) continue;
        var vy2 = vh - G * td, r2 = Math.max(0.8, (2.4 + 3 * hC) * dp.s * K * e.size * (1 - kk * 0.3)), coolK = clamp(td / 1.1, 0, 1);
        var col = st.gold ? [255, 230 - 40 * coolK, 110 - 60 * coolK] : st.swamp ? [110 + 40 * (1 - coolK), 200, 150] : st.mud ? [120, 88, 56] : [255, Math.round(lerp(hot[1], dark[1] + 40, coolK)), Math.round(lerp(hot[2] * 0.6, 20, coolK))];
        var stretch = clamp(Math.abs(vy2) / 300, 1, 2.4);
        ctx.fillStyle = 'rgba(' + Math.round(col[0]) + ',' + Math.round(col[1]) + ',' + Math.round(col[2]) + ',' + al + ')';
        ctx.beginPath(); ctx.ellipse(dp.x, dp.y, r2, r2 * stretch, 0, 0, Math.PI * 2); ctx.fill();
        if (!st.mud && !st.swamp && quality >= 1 && coolK < 0.7) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * 0.5 * (1 - coolK); ctx.drawImage(A.glow(toHex(warm), 32), dp.x - r2 * 4, dp.y - r2 * 4, r2 * 8, r2 * 8); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        if (hh < 6 && td > 0.2) { ctx.strokeStyle = U.rgba(hot, al * 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(dp.x, dp.y, r2 * 3, r2, 0, 0, Math.PI * 2); ctx.stroke(); } // splash-down
      }
      // sparks: fast, light, additive streaks
      var ns = Math.round((e.kind === 'bubble' ? 3 : 9) * st.sparks * [0.4, 0.8, 1][quality] * (calm ? 0.5 : 1));
      if (ns && tt < 1.2) { ctx.globalCompositeOperation = 'lighter';
        for (var j = 0; j < ns; j++) { var a2 = (hash(j, e.seed) - 0.5) * 2.8, v2 = (240 + 300 * hash(e.seed, j + 9)) * e.size, tj = tt, hx = Math.sin(a2) * v2 * 0.5 * tj, hy2 = Math.cos(a2) * v2 * tj - 260 * tj * tj, sp = proj(e.z, e.x + hx, hy2), sp2 = proj(e.z, e.x + hx * 0.9, hy2 - (Math.cos(a2) * v2 - 520 * tj) * 0.03); if (!sp || !sp2) continue;
          ctx.strokeStyle = st.gold ? 'rgba(255,250,200,' + (1 - tj / 1.2) * al + ')' : 'rgba(255,230,160,' + (1 - tj / 1.2) * al + ')'; ctx.lineWidth = Math.max(1, 1.6 * sp.s * K); ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(sp2.x, sp2.y); ctx.stroke(); }
        ctx.globalCompositeOperation = 'source-over'; }
      // smoke puff rising
      if (quality >= 1 && (e.kind !== 'bubble' || st.swamp)) { var sm = A.glow(toHex(st.smoke), 64), np = e.kind === 'collapse' ? 5 : 2;
        for (var s2 = 0; s2 < np; s2++) { var ts = tt - s2 * 0.15; if (ts <= 0) continue; var sk = ts / (life + 0.4), sp3 = proj(e.z, e.x + (hash(s2, e.seed) - 0.5) * 30 + ts * 8, 20 + ts * 60); if (!sp3 || sk >= 1) continue; var srr = (18 + ts * 40) * sp3.s * K * e.size;
          ctx.globalAlpha = 0.35 * (1 - sk) * al; ctx.drawImage(sm, sp3.x - srr, sp3.y - srr, srr * 2, srr * 2); }
        ctx.globalAlpha = 1; }
    }

    // ---------- drawing: hazard plane (WebGL shader lava when available, Canvas2D pattern bands otherwise) ----------
    function useGL() {
      if (glState === 'off') return null; if (lavaGL && lavaGL.ok()) return lavaGL;
      if (glState === 'on') return null; // context lost: fall back until restored
      glState = 'off';
      if (opts.gl === false || /[?&]gl=0\b/.test(location.search) || !root.LavaGL) return null;
      try { var pals = []; for (var c = 0; c <= 9; c++) pals.push(A.palette(c)); lavaGL = root.LavaGL(pals); } catch (e) { console.warn('lava gl', e); lavaGL = null; }
      if (lavaGL) glState = 'on';
      return lavaGL;
    }
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
      var g = useGL(), drawn = false;
      if (g) {
        var res = Math.min(dpr, [0.55, 0.8, 1.15][quality]), er = [0, 0, 0, 0];
        if (collapseHot) { var ea = t - collapseHot.t0; if (ea < 2.2) er = [collapseHot.x, collapseHot.z, ea, calm ? 0.5 : 1]; else collapseHot = null; }
        try { drawn = g.render({ w: W, h: H - hy + 1, res: res, hy: hy, gy: gy, cx: cx, K: K, F: F, camZ: camZ, camX: camX, t: t, borders: borders, bw: S * 0.35, haze: (calm || reduced ? 0.35 : 1) * (quality ? 1 : 0.5), erupt: er, detail: 1 }); } catch (e) { drawn = false; glState = 'off'; lavaGL = null; console.warn('lava gl render', e); }
        if (drawn) ctx.drawImage(g.canvas, 0, hy, W, H - hy + 1);
      }
      if (!drawn) {
        // screen-space bands: thin near the horizon, at most ~10 px (q2) near the camera, so seams stay invisible
        var s0 = 0.035, prev = hy + (gy - hy) * s0, qmul = [2.2, 1.4, 1][quality];
        ctx.fillStyle = U.rgba(A.palette(zoneCircle(camZ + 12 * S)).lavaRgb[1]); ctx.fillRect(0, hy, W, prev - hy + 1);
        while (prev < H) {
          var hgt = Math.max(1.5, Math.min(10, 1 + (prev - hy) * 0.035) * qmul), y1 = Math.min(H + 1, prev + hgt);
          var sm = ((prev + y1) / 2 - hy) / (gy - hy), d = F / sm - F, z = camZ + d;
          var c = zoneCircle(z);
          band(c, prev, y1, sm, z, false, 1);
          var kz = z / S - 0.5, frac = kz - Math.floor(kz);
          if (frac > 0.75 || frac < 0.25) { var c2 = zoneCircle(z + (frac > 0.5 ? S * 0.5 : -S * 0.5)); if (c2 !== c) band(c2, prev, y1, sm, z, false, 0.45); }
          if (quality >= 1) { ctx.globalCompositeOperation = 'lighter'; band(c, prev, y1, sm, z, true, c === 9 ? 0.35 : c === 5 ? 0.55 : 0.42); ctx.globalCompositeOperation = 'source-over'; }
          prev = y1;
        }
        ctx.globalAlpha = 1;
      }
      // horizon fog
      var fog = A.palette(circleNow).fogRgb;
      var fg = ctx.createLinearGradient(0, hy, 0, hy + (gy - hy) * 0.38), fk = painted ? 0.45 : 1;
      fg.addColorStop(0, U.rgba(fog, 0.92 * fk)); fg.addColorStop(0.45, U.rgba(fog, 0.32 * fk)); fg.addColorStop(1, U.rgba(fog, 0));
      ctx.fillStyle = fg; ctx.fillRect(0, hy - 2, W, (gy - hy) * 0.38 + 2);
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
        ctx.strokeStyle = 'rgba(70,50,40,0.28)'; ctx.lineWidth = 1.5;
        var z0 = Math.ceil((camZ - 0.4 * F) / (S * 0.5)) * S * 0.5;
        for (var z = z0; z < camZ + 10 * S; z += S * 0.5) { var p = proj(z, side * L); if (!p) continue; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(edgeX, p.y); ctx.stroke(); }
        ctx.restore();
        // lava-lit inner edge (flickers with the lava)
        var fl = 0.85 + 0.15 * Math.sin(t * 2.3 + side) * Math.sin(t * 3.7);
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = U.rgba(pal.glowRgb, 0.24 * fl); ctx.lineWidth = 26 * K; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = U.rgba(pal.glowRgb, 0.32 * fl); ctx.lineWidth = 10 * K; ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(60,36,26,0.9)'; ctx.lineWidth = 5 * K; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,248,232,0.75)'; ctx.lineWidth = 2 * K; ctx.beginPath(); ctx.moveTo(a.x + side * 2, a.y); ctx.lineTo(b.x + side * 3 * K, b.y); ctx.stroke();
      });
    }

    // ---------- sprites + sprite-sequence player ----------
    /** current frame of assets/anim/<name> (if its frames are loaded), else null -> caller uses the static sprite */
    var ANIM_ALIAS = { imp: 'imp_idle' };
    /** frame of anim `name` started at t0 (played at `rate`), or null when it isn't loaded -> static sprite. done = a one-shot clip has ended */
    function animFrame(name, t0, rate) {
      var st = assets.anim ? assets.anim(ANIM_ALIAS[name] || name) : null; if (!st) return null;
      var m = st.meta, n = m.frames, el = (t - (t0 || 0)) * (rate || 1), idx = Math.floor(el * m.fps);
      var done = !m.loop && el >= m.dur;
      idx = m.loop ? ((idx % n) + n) % n : clamp(idx, 0, n - 1);
      var c = assets.animCell(st, idx); c.meta = m; c.done = done; c.idx = idx; return c;
    }
    function animReady(name) { return !!(assets.anim && assets.anim(ANIM_ALIAS[name] || name)); }
    function animDur(name) { var m = assets.animMeta && assets.animMeta(ANIM_ALIAS[name] || name); return m ? m.dur : 0; }
    function sprite(name, x, y, scale, o) { // scale = css px per spec px
      o = o || {};
      var m = assets.meta(name), im = o.img, anchor = o.anchor || m.anchor, mw = m.w, mh = m.h, cell = null;
      if (!im && !o.noAnim && !o.tint) { cell = animFrame(name, o.t0, o.rate); if (cell) { im = cell.img; mw = cell.meta.w; mh = cell.meta.h; if (!o.anchor) anchor = cell.meta.anchor; } }
      if (!im) im = o.tint ? assets.tinted(name, o.tint[0], o.tint[1]) : assets.img(name);
      var w = mw * scale, h = mh * scale, ax = anchor[0], ay = anchor[1];
      if (w < 1 || h < 1) return;
      var al = o.alpha == null ? 1 : o.alpha; if (al <= 0.01) return;
      if (o.comp) ctx.globalCompositeOperation = o.comp;
      if (o.rot || o.sx || o.sy || o.flip) {
        ctx.save(); ctx.globalAlpha = al; ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); ctx.scale((o.sx || 1) * (o.flip || 1), o.sy || 1);
        if (cell) ctx.drawImage(im, cell.sx, cell.sy, cell.sw, cell.sh, -w * ax, -h * ay, w, h); else ctx.drawImage(im, -w * ax, -h * ay, w, h); ctx.restore();
      } else { ctx.globalAlpha = al; if (cell) ctx.drawImage(im, cell.sx, cell.sy, cell.sw, cell.sh, x - w * ax, y - h * ay, w, h); else ctx.drawImage(im, x - w * ax, y - h * ay, w, h); ctx.globalAlpha = 1; }
      if (o.comp) ctx.globalCompositeOperation = 'source-over';
      return cell;
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
    /** living flame: independent flickering tongues, a breathing halo, rising embers and a wisp of smoke (all stateless) */
    function drawFlame(c, x, y, s, ph, big) {
      var im = flame(c), pal = A.palette(c), w = 28 * s * K, h = 50 * s * K, a0 = ctx.globalAlpha;
      var breath = 0.9 + 0.1 * Math.sin(t * 5.3 + ph) + 0.05 * Math.sin(t * 13 + ph * 2);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (quality >= 1) { ctx.globalAlpha = a0 * 0.55 * breath; ctx.drawImage(A.glow(pal.glow, 64), x - w * 2, y - h * 1.05, w * 4, w * 4); }
      var af = animFrame('flame_c' + c, ph) || animFrame('flame', ph);
      if (af) { var fw = w * 1.6, fh = fw * af.sh / af.sw; ctx.globalAlpha = a0; ctx.drawImage(af.img, af.sx, af.sy, af.sw, af.sh, x - fw / 2, y - fh * af.meta.anchor[1], fw, fh); }
      else {
        var nT = quality ? 3 : 1;
        for (var j = 0; j < nT; j++) {
          var side = nT === 1 ? 0 : j - 1, fl = 0.78 + 0.16 * Math.sin(t * (10 + j * 3.1) + ph + j * 2.1) + 0.08 * Math.sin(t * (21 + j * 4.3) + ph * 1.3);
          var hh = h * (side ? 0.7 : 1) * fl, ww = w * (side ? 0.62 : 1), sk = Math.sin(t * (3.2 + j) + ph + j) * 0.12 + side * 0.08;
          ctx.save(); ctx.globalAlpha = a0 * (side ? 0.75 : 0.95); ctx.translate(x + side * w * 0.24, y); ctx.transform(1, 0, sk, 1, 0, 0); ctx.drawImage(im, -ww / 2, -hh, ww, hh); ctx.restore();
        }
      }
      ctx.restore();
      // embers and smoke (stateless loops)
      if (quality >= 1 && s * K > 0.25) {
        var ne = (calm ? 2 : big ? 6 : 4) * (quality === 2 ? 1 : 0.5); ctx.globalCompositeOperation = 'lighter';
        for (var i = 0; i < ne; i++) { var u = (t * (0.55 + 0.2 * hash(i, ph)) + hash(ph, i)) % 1, ex = x + Math.sin(u * 7 + i * 2 + ph) * w * 0.55 * (0.3 + u), ey = y - h * 0.5 - u * h * 2.2, er = Math.max(0.8, 1.6 * s * K * (1 - u * 0.6));
          ctx.globalAlpha = a0 * (1 - u) * (u < 0.1 ? u * 10 : 1); ctx.fillStyle = pal.flame[0]; ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalCompositeOperation = 'source-over';
        if (quality === 2) { var smk = A.glow('#3a2a26', 32); for (var k2 = 0; k2 < 2; k2++) { var u2 = (t * 0.22 + hash(k2, ph + 1)) % 1, sr = w * (0.6 + u2 * 1.6); ctx.globalAlpha = a0 * 0.22 * Math.sin(Math.PI * u2); ctx.drawImage(smk, x - sr + Math.sin(t * 0.7 + k2 + ph) * w * 0.4 * u2, y - h * 1.1 - u2 * h * 2.4 - sr, sr * 2, sr * 2); } }
      }
      ctx.globalAlpha = a0;
    }

    // ---------- world objects ----------
    function collect() {
      var list = [], zMin = camZ - 0.6 * F, zMax = camZ + 10.5 * S;
      for (var i = 0; i <= N; i++) { var z = i * S; if (z < zMin || z > zMax) continue; list.push({ d: z - camZ, f: drawSlab, i: i }); }
      var first = C.firstSteps(N);
      for (var c = 2; c <= 9; c++) { var za = (first[c - 1] - 0.5) * S; if (za > zMin && za < zMax) list.push({ d: za - camZ + 0.01, f: drawArch, c: c, z: za }); }
      var ze = (N + 1.4) * S; if (ze < zMax + 3 * S) list.push({ d: ze - camZ, f: drawExit, z: ze });
      var j0 = Math.floor(zMin / (1.5 * S)) - 1, j1 = Math.ceil(zMax / (1.5 * S)) + 1;
      for (var j = Math.max(-1, j0); j <= j1; j++) { var zc = j * 1.5 * S - 0.4 * S; if (zc < zMin || zc > zMax) continue; list.push({ d: zc - camZ, f: drawColumn, j: j, z: zc, side: -1 }); list.push({ d: zc - camZ - 0.01, f: drawColumn, j: j + 7, z: zc, side: 1 }); }
      for (var b = Math.max(0, Math.floor(zMin / (3 * S))); b <= Math.ceil(zMax / (3 * S)); b++) { var zb = (b * 3 + 0.9) * S; if (zb < zMin || zb > zMax) continue; list.push({ d: zb - camZ, f: drawBrazier, z: zb, side: b % 2 ? 1 : -1, ph: b }); }
      for (var q = Math.max(0, Math.floor(zMin / (4 * S))); q <= Math.ceil(zMax / (4 * S)); q++) { var zp = (q * 4 + 2.6) * S; if (zp < zMin || zp > zMax) continue; list.push({ d: zp - camZ, f: drawProp, z: zp, side: q % 2 ? -1 : 1 }); }
      for (var e = 0; e < erupts.length; e++) { var ez = erupts[e].z; if (ez > zMin && ez < zMax) list.push({ d: ez - camZ + 0.02, f: drawErupt, e: erupts[e] }); }
      list.push({ d: hero.z - camZ - 0.02, f: drawHero });
      if (rays) list.push({ d: rays.z - camZ + 0.03, f: function () { drawRays(); } });
      list.sort(function (a, b) { return b.d - a.d; });
      return list;
    }
    function circleTint(c) { var tt = A.palette(c).slabTint; return tt && tt[1] >= 0.1 ? tt : null; }
    /** deterministic per-slab variety: surface variant, tiny rotation and size jitter */
    function slabLook(i) { var h = hash(i, 3.7); return { v: h < 0.34 ? 0 : h < 0.67 ? 1 : 2, rot: (hash(i, 9.1) - 0.5) * 0.035, sc: 0.97 + hash(i, 1.3) * 0.06 }; }
    function slabImg(c, i, cracked) { return assets.slabVariant ? assets.slabVariant(c, slabLook(i).v, cracked) : null; }
    function drawSlab(o) {
      var i = o.i, s = slabs[i], z = i * S, x = slabX(i), p = proj(z, x, 0); if (!p) return;
      var al = depthAlpha(p.d); if (al <= 0) return;
      var look = slabLook(i), sc = SLAB * p.s * K * look.sc, c = zoneCircle(z), jx = 0, jy = 0, wrot = 0;
      if (s.wob > 0) { var wa = calm || reduced ? 0.35 : 1, wk = Math.min(1, s.wob * 3); jx = Math.sin(t * 38) * 1.8 * K * p.s * wa * wk; jy = Math.sin(t * 27) * 1.1 * K * wa * wk; wrot = Math.sin(t * 21) * 0.012 * wa * wk; }
      if (s.state === 'cracking') { jx = (Math.random() - 0.5) * 5 * K * (calm ? 0.3 : 1); jy = (Math.random() - 0.5) * 3 * K * (calm ? 0.3 : 1); }
      if (quality >= 1 && i > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 * al; var gl = A.glow(A.palette(c).glow, 64), gw = 230 * p.s * K; ctx.drawImage(gl, p.x - gw / 2, p.y - gw * 0.18, gw, gw * 0.62); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      if (s.state === 'collapsed') { drawFrags(s, p, sc, c, al, i); return; }
      if (i === 0) {
        slabTops[0] = { x: p.x, y: p.y, ax: p.x, ay: p.y };
        if (assets.isFallback('gate_dais') && !assets.isFallback('slab_marble')) sprite('slab_marble', p.x, p.y, SLAB * 1.45 * p.s * K, { alpha: al, tint: ['#ffcf70', 0.1] });
        else sprite('gate_dais', p.x, p.y, 0.4 * p.s * K, { alpha: al });
        return;
      }
      if (peek && i === Math.round(hero.z / S) + 1 && s.state === 'idle') drawPeek(p, al);
      var cracked = s.state === 'cracking', name = cracked ? 'slab_cracked' : 'slab_marble', sm = assets.meta(name), tf = sm.topFace;
      var vim = slabImg(c, i, cracked);
      sprite(name, p.x + jx, p.y + jy, sc, { alpha: al, img: vim || null, tint: vim ? null : circleTint(c), rot: look.rot + wrot, noAnim: true });
      var ex = p.x + jx + (tf ? (tf[0] - sm.w * sm.anchor[0]) * sc : 0), ey = p.y + jy + (tf ? (tf[1] - sm.h * sm.anchor[1]) * sc : 0);
      var fdx = tf ? (tf[0] - sm.w * sm.anchor[0]) * sc : 0, fdy = tf ? (tf[1] - sm.h * sm.anchor[1]) * sc : 0, cr = Math.cos(look.rot), sr = Math.sin(look.rot);
      slabTops[i] = { x: p.x + fdx * cr - fdy * sr, y: p.y + fdx * sr + fdy * cr, ax: p.x, ay: p.y };
      var erx = tf ? tf[2] * 0.9 * sc : 82 * p.s * K, ery = tf ? tf[3] * 0.9 * sc : 46 * p.s * K;
      var k = Math.round(hero.z / S), isNext = i === k + 1 && !hero.bubble && hero.anim && hero.anim.type !== 'fall', onIt = i === k && !(hero.anim && hero.anim.type === 'jump');
      if (i === k + 1 && !hero.anim) isNext = true;
      if (hero.pose === 'hero_fall' || hero.bubble) isNext = false;
      // landing ring / safe-landing shockwave
      if (s.ring >= 0 && t - s.ring < (s.ringK >= 1 ? 0.9 : 0.6)) {
        var strong = s.ringK >= 1, rl = strong ? 0.9 : 0.6, rk = (t - s.ring) / rl;
        ctx.strokeStyle = 'rgba(255,248,210,' + (0.9 * (1 - rk)) + ')'; ctx.lineWidth = (strong ? 6 : 4) * K * p.s * (1 - rk) + 1; ctx.beginPath(); ctx.ellipse(ex, ey, erx * (1.05 + (strong ? 1.5 : 0.6) * easeOut(rk)), ery * (1.05 + (strong ? 1.5 : 0.6) * easeOut(rk)), 0, 0, Math.PI * 2); ctx.stroke();
        if (strong) {
          var rk2 = clamp(rk * 1.4 - 0.15, 0, 1); ctx.strokeStyle = 'rgba(255,200,90,' + (0.7 * (1 - rk2)) + ')'; ctx.lineWidth = 3 * K * p.s * (1 - rk2) + 0.5; ctx.beginPath(); ctx.ellipse(ex, ey, erx * (1 + 0.9 * easeOut(rk2)), ery * (1 + 0.9 * easeOut(rk2)), 0, 0, Math.PI * 2); ctx.stroke();
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (calm ? 0.25 : 0.55) * (1 - rk); var gs = A.glow('#ffd86a', 64); ctx.drawImage(gs, ex - erx * 1.6, ey - ery * 1.8, erx * 3.2, ery * 3.6); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
      }
      // runes ignite around the rim after a safe landing
      if (s.runeT >= 0 && t - s.runeT < 1.5) {
        var ru = (t - s.runeT) / 1.5, ra = ru < 0.2 ? ru / 0.2 : ru > 0.6 ? (1 - ru) / 0.4 : 1, fsr = Math.max(7, 15 * p.s * K);
        ctx.save(); ctx.font = '700 ' + Math.round(fsr) + 'px ' + SERIF; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (var r = 0; r < 8; r++) { var an = r / 8 * Math.PI * 2 + ru * 0.6, rx2 = ex + Math.cos(an) * erx * 1.12, ry2 = ey + Math.sin(an) * ery * 1.12 - (1 - ra) * 4;
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ra * al * (calm ? 0.45 : 0.8); ctx.drawImage(A.glow('#ffb43c', 32), rx2 - fsr, ry2 - fsr, fsr * 2, fsr * 2);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = ra * al; ctx.fillStyle = '#fff2b8'; ctx.fillText(RUNES[(r + i) % 8], rx2, ry2); }
        ctx.restore();
      }
      if (isNext && s.state === 'idle') {
        var pulse = 0.5 + 0.5 * Math.sin(t * 5);
        ctx.save(); ctx.strokeStyle = 'rgba(255,214,80,' + (0.55 + 0.4 * pulse) * al + ')'; ctx.lineWidth = (3 + pulse * 2) * K * p.s; ctx.setLineDash([10 * K * p.s, 7 * K * p.s]); ctx.lineDashOffset = -t * 30;
        ctx.beginPath(); ctx.ellipse(ex, ey, erx, ery, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        if (idleCue && !glowPulse) { var br = 0.5 + 0.5 * Math.sin((t - cueT0) * 2.4 - Math.PI / 2); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (calm ? 0.16 : 0.28) * br * al; var g4 = A.glow('#ffe27a', 64), w4 = 220 * p.s * K; ctx.drawImage(g4, p.x - w4 / 2, p.y - w4 * 0.3, w4, w4 * 0.6); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      }
      // anticipation glow on the slab the hero stands on (same for every outcome)
      if (onIt && glowPulse > 0 && s.state === 'idle') { var beat = Math.pow(Math.max(0, Math.sin(t * 7.6)), 6); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, glowPulse * 2) * (0.3 + 0.3 * beat) * (calm ? 0.5 : 1); var g2 = A.glow('#ffd23c', 64), w2 = 200 * p.s * K; ctx.drawImage(g2, p.x - w2 / 2, p.y - w2 * 0.3, w2, w2 * 0.6); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      // multiplier inside the centre medallion (scaled by depth, squashed onto the top face)
      if (ladder[i - 1] != null && !onIt && p.s > 0.2) {
        var md = sm.medallion, txt = (ladder[i - 1] / 100).toFixed(2) + 'x';
        var mx = p.x + jx + (md ? (md[0] - sm.w * sm.anchor[0]) * sc : 0), my = p.y + jy + (md ? (md[1] - sm.h * sm.anchor[1]) * sc : 0);
        var fs = Math.round(clamp(30 * p.s * K, 9, 40));
        ctx.font = fs + 'px ' + FONT; var tw = ctx.measureText(txt).width, fit = md ? Math.min(1.25, (md[2] * 2.45 * sc) / tw) : 1;
        if (fs * fit >= 6) {
          ctx.save(); ctx.globalAlpha = al; ctx.translate(mx, my); ctx.rotate(look.rot + wrot); ctx.scale(fit, fit * (md ? 0.86 : 1)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
          ctx.lineWidth = Math.max(2.5, fs * 0.26); ctx.strokeStyle = isNext ? '#5a1e00' : s.state === 'passed' ? '#1f4a12' : '#4a2410'; ctx.strokeText(txt, 0, 1.5);
          var tg = ctx.createLinearGradient(0, -fs * 0.5, 0, fs * 0.5);
          if (isNext) { tg.addColorStop(0, '#fff6b0'); tg.addColorStop(0.5, '#ffd23c'); tg.addColorStop(1, '#f39a12'); }
          else if (s.state === 'passed') { tg.addColorStop(0, '#eaffd8'); tg.addColorStop(1, '#8fd86a'); }
          else { tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, '#ffe6b0'); }
          ctx.fillStyle = tg; ctx.fillText(txt, 0, 0);
          ctx.restore();
        }
      }
      if (s.idol && (s.idolT < 0 || t - s.idolT > 1.4)) sprite('idol', p.x + 52 * p.s * K, p.y - 6 * p.s * K, 0.2 * p.s * K, { alpha: al * 0.95 });
    }
    function drawFrags(s, p, sc, c, al, i) {
      var vim = slabImg(c, i, false), im = vim || assets.tinted('slab_marble', circleTint(c) && circleTint(c)[0], circleTint(c) ? circleTint(c)[1] : 0), m = assets.meta('slab_marble'), w = m.w * sc, h = m.h * sc;
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
      if (c === 6 || c === 7) { ctx.globalAlpha = al * 0.8; drawFlame(c, p.x, p.y - 120 * p.s * K, p.s * 1.6, o.z, true); ctx.globalAlpha = 1; }
    }
    function drawArch(o) {
      var p = proj(o.z, 0, 0); if (!p) return; var al = depthAlpha(p.d) * (p.d < 0.3 * S ? clamp((p.d) / (0.3 * S), 0, 1) : 1); if (al <= 0) return;
      var sc = 0.5 * p.s * K, m = assets.meta('gate_arch');
      sprite('gate_arch', p.x, p.y, sc, { alpha: al, tint: circleTint(o.c) });
      var px = p.x + (A.archPlaque[0] - m.w * m.anchor[0]) * sc, py = p.y + (A.archPlaque[1] - m.h * m.anchor[1]) * sc;
      var fs = Math.round(40 * sc); if (fs >= 6) {
        if (quality >= 1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * (0.45 + 0.15 * Math.sin(t * 2 + o.c)); ctx.drawImage(A.glow(A.palette(o.c).glow, 64), px - fs * 1.6, py - fs * 1.2, fs * 3.2, fs * 2.4); ctx.globalCompositeOperation = 'source-over'; }
        ctx.globalAlpha = al; ctx.font = '900 ' + fs + 'px ' + SERIF; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffe9a0'; ctx.fillText(C.info(o.c).roman, px, py + fs * 0.05); ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1; }
    }
    function drawExit(o) {
      var p = proj(o.z, 0, 140); if (!p) return; var al = depthAlpha(p.d) || (p.d > 0 ? 0.6 : 0); if (al <= 0) return;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * al; var gl = A.glow('#8ad0ff', 64), gw = 520 * p.s * K; ctx.drawImage(gl, p.x - gw / 2, p.y - gw / 2, gw, gw); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      sprite('exit_stars', p.x, p.y, 0.62 * p.s * K, { alpha: al, rot: Math.sin(t * 0.3) * 0.03 });
    }
    function impatience(x) {
      var a = calm ? 0.5 : 1, ph = (t - cueT0) % 3.6, o = { rot: 0, dx: 0, hop: 0, sy: 1 };
      if (ph < 1.2) { if (!reduced) { var w = Math.sin(ph / 1.2 * Math.PI * 2); o.rot = 0.05 * a * w; o.dx = 7 * a * w; } }
      else if (ph < 2.2) { if (!reduced) { var tap = Math.abs(Math.sin((ph - 1.2) * Math.PI * 3)); o.sy = 1 - 0.03 * a * tap; o.hop = 2.5 * a * tap; } }
      else { var k = Math.round(hero.z / S); hero.flip = slabX(k + 1) >= x ? 1 : -1; o.rot = 0.06 * a * hero.flip * Math.sin(Math.PI * (ph - 2.2) / 1.4); }
      return o;
    }
    function drawPeek(p, al) {
      var pk = clamp((t - peek.t0) / 0.7, 0, 1), e = reduced ? pk : easeOutBack(pk), fade = peek.out ? clamp(1 - (t - peek.out) / 0.4, 0, 1) : 1;
      if (peek.out && fade <= 0) { peek = null; return; }
      var side = peek.side, s = p.s * K, bob = calm || reduced ? 0 : Math.sin(t * 2.2) * 2 * s;
      var feet = p.y + 30 * s - e * 55 * s * fade + bob;
      var blinkPose = (t % 3.1) < 0.9 && !calm && !animReady('imp') ? 'imp_giggle' : 'imp';
      sprite(blinkPose, p.x + side * 34 * s, feet, 0.27 * s, { alpha: al * (reduced ? pk : 1) * fade, flip: -side, rot: calm ? 0 : Math.sin(t * 1.7) * 0.12 * side });
    }
    function setIdleCue(level) {
      level = level | 0; if (level === idleCue) return;
      if (level > 0 && idleCue === 0) cueT0 = t;
      if (level >= 2 && !peek) peek = { t0: t, side: Math.random() < 0.5 ? -1 : 1 };
      if (level < 2 && peek && !peek.out) peek.out = t;
      idleCue = level;
    }
    var POSE_ALIAS = { hero_idle_blink: 'hero_idle', hero_nervous: 'hero_idle', hero_wave: 'hero_idle' };
    function poseArt(p) { return assets.isFallback(p) && POSE_ALIAS[p] && !assets.isFallback('hero_idle') ? POSE_ALIAS[p] : p; }
    /** streak aura: fire tongues licking up around the hero (level 1..3), ignites with a burst */
    function drawAura(x, y, s, alpha) {
      if (!aura || alpha <= 0) return;
      var c = zoneCircle(hero.z), pal = A.palette(c), ign = clamp((t - auraT0) / 0.5, 0, 1), lv = aura, k = calm ? 0.5 : 1, R = 46 * s;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * k * (0.35 + 0.12 * lv) * (0.85 + 0.15 * Math.sin(t * 6)); ctx.drawImage(A.glow(pal.glow, 64), x - R * 2, y - R * 3.2, R * 4, R * 4);
      if (ign < 1 && !calm) { ctx.globalAlpha = alpha * (1 - ign) * 0.8; ctx.drawImage(A.glow('#fff0b0', 64), x - R * 3 * ign - R, y - R * 2.4 - R * 2 * ign, (R * 3 * ign + R) * 2, (R * 3 * ign + R) * 2); }
      if (quality >= 1) {
        var im = flame(c), n = 4 + lv * 2;
        for (var i = 0; i < n; i++) { var u = i / (n - 1) - 0.5, fl = 0.7 + 0.3 * Math.sin(t * (9 + i * 1.7) + i * 2.3), fw = R * 0.55, fh = R * (0.9 + 0.35 * lv) * fl * (1 - Math.abs(u) * 0.9) * (0.4 + 0.6 * ign);
          ctx.save(); ctx.globalAlpha = alpha * k * 0.55; ctx.translate(x + u * R * 1.5, y - R * 0.1); ctx.rotate(u * 0.5 + Math.sin(t * 4 + i) * 0.08); ctx.drawImage(im, -fw / 2, -fh, fw, fh); ctx.restore(); }
      }
      ctx.restore();
    }
    /** base pose while standing: nervous deep down (circles VII-IX) or on Hard/Extreme, impatient during the idle nudge, sooty after a loss */
    function standPose() {
      if (hero.sooty) return 'hero_soot';
      if (idleCue && animReady('hero_impatient')) return 'hero_impatient';
      if ((zoneCircle(hero.z) >= 7 || diffId === 'hard' || diffId === 'extreme') && animReady('hero_nervous')) return 'hero_nervous';
      return 'hero_idle';
    }
    function drawHero() {
      if (!hero.visible) return;
      if (!(hero.anim && hero.anim.type === 'jump')) placeHero(Math.round(hero.z / S)); // resting (incl. fall start, soot, win...) = on the slab
      var an = hero.anim, el = an ? t - an.t0 : 0, sx = 1, sy = 1, rot = 0, hop = 0, z = hero.z, x = hero.x, alpha = 1, sink = 0, pose = hero.pose;
      // one-shot clips (wave / jump / win / idol / fall) override the pose while they play
      var clip = hero.clip, clipOn = false;
      if (clip) {
        var cr = animReady(clip.name);
        if (clip.name === 'hero_wave' && (an || hero.pose !== 'hero_idle' || idleCue || (!cr && t > clip.t0 + (clip.wait || 0)))) { hero.clip = clip = null; }
        else if (cr && t >= clip.t0) {
          var cf = animFrame(clip.name, clip.t0, clip.rate);
          if (clip.name === 'hero_fall' && cf.meta.exitFrame != null && cf.idx >= cf.meta.exitFrame) { alpha = 0; clipOn = true; }
          else if (cf.done && !cf.meta.holdLast) { if (clip.name === 'hero_fall') alpha = 0; else { hero.clip = clip = null; hero.idleSince = t; hero.lastPose = ''; } }  // the stand loop restarts at frame 0 (the clips end on idle frame 0)
          else clipOn = true;
        }
      }
      if (an && an.type === 'jump') {
        if (an.clip) { var k0 = clamp((el - an.pre) / an.dur, 0, 1), e0 = easeInOut(k0); z = lerp(an.from.z, an.to.z, e0); x = lerp(an.from.x, an.to.x, e0); if (el >= an.pre) camZTarget = z; pose = 'hero_jump'; }
        else if (el < an.pre) { var q = el / an.pre; sy = 1 - 0.14 * easeOut(q); sx = 1 + 0.1 * easeOut(q); pose = 'hero_idle'; }
        else { var k = clamp((el - an.pre) / an.dur, 0, 1), e = easeInOut(k); z = lerp(an.from.z, an.to.z, e); x = lerp(an.from.x, an.to.x, e); hop = Math.sin(Math.PI * k) * 78; sy = k < 0.3 ? 1.1 : k > 0.75 ? 1.06 : 1.02; sx = 2 - sy; pose = 'hero_jump'; camZTarget = z; }
      } else if (an && an.type === 'land') { var lk = clamp(el / 0.28, 0, 1); if (!an.clip) { sy = lerp(0.8, 1, elastic(lk)); sx = 2 - sy; } if (lk >= 1) hero.anim = null; }
      else if (an && an.type === 'bounce') { var bk = clamp(el / 0.32, 0, 1); if (!clipOn) { hop = Math.sin(Math.PI * bk) * 10; sy = 1 + Math.sin(Math.PI * bk) * 0.05; sx = 2 - sy; } if (bk >= 1) hero.anim = null; }
      else if (an && an.type === 'cheer') { var reps = an.repeat || 1, ck = el / 0.42; if (ck < reps) { var ph = ck % 1; hop = Math.sin(Math.PI * ph) * 26; sy = ph < 0.15 ? 0.9 : 1.05; sx = 2 - sy; } else hero.anim = null; }
      else if (an && an.type === 'fall') {
        if (an.clip) { /* the clip drops him out of the bottom of its frame */ }
        else if (el < 0.22) { hop = 14 * easeOut(el / 0.22); rot = Math.sin(el * 40) * 0.06; }
        else { var fk = clamp((el - 0.22) / 0.42, 0, 1); hop = 14 - fk * fk * 70; sy = 1 + fk * 0.25; sx = 1 - fk * 0.2; sink = fk; alpha = fk < 0.7 ? 1 : 1 - (fk - 0.7) / 0.3; if (fk >= 1) alpha = 0; }
      }
      if (!an || an.type !== 'jump') camZTarget = hero.z;
      if (pose === 'hero_idle' && !an && !clipOn) pose = standPose();
      var animated = clipOn || animReady(pose);
      if (!an && !clipOn) {
        if (!animated) { sy *= 1 + 0.014 * Math.sin(t * 2.4) * (reduced ? 0.3 : 1); rot += 0.012 * Math.sin(t * 1.1) * (reduced ? 0.3 : 1); }
        if (t > hero.blinkAt) { hero.blinkUntil = t + 0.12; hero.blinkAt = t + 2.5 + Math.random() * 3; }
        if (pose === 'hero_idle' && t < hero.blinkUntil && !animated) pose = 'hero_idle_blink';
        if (idleCue && (pose === 'hero_idle' || pose === 'hero_idle_blink')) { hero.personality = null; var imp = impatience(x); rot += imp.rot; x += imp.dx; hop += imp.hop; sy *= imp.sy; sx = 2 - sy; }
        if (pose === 'hero_idle' && !idleCue && !hero.personality && !hero.clip && t - hero.idleSince > 7 && !reduced) {
          if (animReady('hero_wave') && Math.random() < 0.6) { hero.clip = { name: 'hero_wave', t0: t, rate: 1 }; hero.idleSince = t; }
          else hero.personality = { pose: Math.random() < 0.6 && poseArt('hero_wave') === 'hero_wave' ? 'hero_wave' : 'flip', t0: t, dur: Math.random() < 0.5 ? 1.4 : 1.8 };
        }
        if (hero.personality) { var pe = hero.personality; if (t - pe.t0 > pe.dur) { hero.personality = null; hero.idleSince = t; } else if (pose === 'hero_idle' || pose === 'hero_idle_blink') { if (pe.pose === 'flip') hero.flip = Math.sin((t - pe.t0) / pe.dur * Math.PI) > 0.2 ? -1 : 1; else pose = pe.pose; } }
      } else hero.personality = null;
      if (pose === 'hero_nervous' && !animated && poseArt(pose) !== pose && !reduced) { rot += Math.sin(t * 38) * 0.025; sy *= 0.97; sx = 2 - sy; }
      if (hero.sooty) alpha *= clamp((t - hero.sooty.t0) / 0.35, 0, 1);
      var logical = pose, st0, srate = 1;
      if (clipOn) { pose = clip.name; st0 = clip.t0; srate = clip.rate || 1; }
      else { if (!animReady(pose)) pose = poseArt(pose); if (pose !== hero.lastPose) { hero.lastPose = pose; hero.poseT0 = t; } st0 = hero.poseT0; }
      if (!assets.hasAnim(pose) && !(assets.manifest.images || {})[pose] && !A.sizes[pose]) pose = 'hero_idle'; // e.g. hero_impatient without a static sprite
      var p = proj(z, x, hop); if (!p) return;
      var gp = proj(z, x, 0), sc = HERO * p.s * K;
      if (!(an && an.type === 'fall') && gp) { ctx.fillStyle = 'rgba(30,10,4,' + (0.38 - Math.min(hop, 70) / 260) + ')'; ctx.beginPath(); ctx.ellipse(gp.x, gp.y + 2, 30 * p.s * K * (1 - hop / 220), 10 * p.s * K, 0, 0, Math.PI * 2); ctx.fill(); }
      var y = p.y + sink * 30 * K;
      if (alpha > 0) {
        drawAura(p.x, y, p.s * K, alpha);
        var so = { sx: sx, sy: sy, rot: rot, flip: hero.flip, alpha: alpha, t0: st0, rate: srate };
        var cell = sprite(pose, p.x, y, sc, so);
        heroDrawn = cell ? pose + '#' + cell.idx : pose; heroFoot = { x: p.x, y: y, k: Math.round(z / S), phase: an ? an.type : (clipOn ? clip.name : 'rest'), air: !!(an && an.type === 'jump'), t: t };
        // lava underlight: warm light from below on the hero (from the circle's glow colour)
        if (quality >= 1 && assets.underlit && !cell) {
          var zc = zoneCircle(z), ul = assets.underlit(pose, A.palette(zc === 9 ? 9 : zc).glow), fl0 = 0.85 + 0.15 * Math.sin(t * 3.1) * Math.sin(t * 4.7);
          sprite(pose, p.x, y, sc, { sx: sx, sy: sy, rot: rot, flip: hero.flip, alpha: alpha * (calm ? 0.3 : 0.5) * fl0 * (1 - Math.min(1, hop / 120)), img: ul, comp: 'lighter', noAnim: true });
        }
        var m = assets.meta(pose), lp = cell ? null : m.lantern || (assets.isFallback(pose) ? A.heroLantern[logical] : null);
        if (lp && quality >= 1) { var lx = p.x + (lp[0] - m.w * m.anchor[0]) * sc * sx * hero.flip, ly = y + (lp[1] - m.h * m.anchor[1]) * sc * sy, fl = 1 + 0.12 * Math.sin(t * 17) + 0.06 * Math.sin(t * 29);
          if (idleCue) fl *= 0.8 + 0.4 * Math.abs(Math.sin(t * 9.7 + Math.sin(t * 2.3) * 3));
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * alpha; var g = A.glow('#ffb84a', 64), gw = 70 * p.s * K * fl; ctx.drawImage(g, lx - gw / 2, ly - gw / 2, gw, gw); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        if (pose === 'hero_idol' && !cell && assets.isFallback('hero_idol')) {
          var hx = p.x + (A.heroIdolHand[0] - m.w * m.anchor[0]) * sc * hero.flip, hyy = y + (A.heroIdolHand[1] - m.h * m.anchor[1]) * sc, bob2 = Math.sin(t * 6) * 3 * K * p.s;
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; var g3 = A.glow('#ffd23c', 64), w3 = 120 * p.s * K; ctx.drawImage(g3, hx - w3 / 2, hyy - w3 * 0.75, w3, w3); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          sprite('idol', hx, hyy + bob2, 0.24 * p.s * K, { anchor: [0.5, 0.95] });
        }
      }
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
        var size = f.size * Math.min(1.25, K);
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
      var k = rays.age / rays.life, a = (k < 0.15 ? k / 0.15 : k > 0.7 ? (1 - k) / 0.3 : 1) * (calm ? 0.18 : 0.34), sz = 470 * rays.scale * K * (0.85 + 0.15 * easeOut(Math.min(1, k * 3)));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.translate(p.x, p.y); ctx.rotate(calm || reduced ? 0 : t * 0.5);
      var tint = rayArt(rays.color || '255,214,90'); ctx.drawImage(tint, -sz / 2, -sz / 2, sz, sz);
      ctx.rotate(calm || reduced ? 0 : -t * 0.8); ctx.globalAlpha = a * 0.5; ctx.drawImage(tint, -sz * 0.35, -sz * 0.35, sz * 0.7, sz * 0.7);
      ctx.globalAlpha = a * 0.6; var g = A.glow('#ffd23c', 64); ctx.drawImage(g, -sz * 0.3, -sz * 0.3, sz * 0.6, sz * 0.6);
      ctx.restore();
    }
    // god rays: soft volumetric beams falling from the cavern opening, swaying slowly (q1+)
    function beam(col) {
      if (beamCache[col]) return beamCache[col];
      var cv = U.canvas(64, 256), x = cv.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256), c = U.hex(col);
      g.addColorStop(0, U.rgba(c, 0.9)); g.addColorStop(0.5, U.rgba(c, 0.35)); g.addColorStop(1, U.rgba(c, 0));
      var h = x.createLinearGradient(0, 0, 64, 0); h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(0.5, '#fff'); h.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(24, 0); x.lineTo(40, 0); x.lineTo(64, 256); x.lineTo(0, 256); x.closePath(); x.fill();
      x.globalCompositeOperation = 'destination-in'; x.fillStyle = h; x.fillRect(0, 0, 64, 256);
      return (beamCache[col] = cv);
    }
    function drawGodRays() {
      if (quality < 1) return;
      var pal = A.palette(circleNow), col = circleNow === 9 ? '#cfefff' : circleNow === 5 ? '#9af0c8' : circleNow === 4 ? '#ffe08a' : pal.glow;
      var b = beam(col), n = quality === 2 ? 5 : 3, base = calm ? 0.07 : 0.11;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < n; i++) {
        var u = (i + 0.5) / n, x0 = W * (0.12 + 0.76 * u) + Math.sin(t * 0.13 + i * 1.7) * W * 0.04, sway = Math.sin(t * 0.21 + i * 2.3) * 0.12 + (u - 0.5) * 0.35, len = H * (0.75 + 0.2 * hash(i, 2)), wd = W * (0.1 + 0.06 * hash(i, 5));
        ctx.globalAlpha = base * (0.6 + 0.4 * Math.sin(t * 0.37 + i * 1.3));
        ctx.save(); ctx.translate(x0, -10); ctx.rotate(sway); ctx.drawImage(b, -wd / 2, 0, wd, len); ctx.restore();
      }
      ctx.restore();
    }
    // portal swirl at the vanishing point + palette shift when a new circle begins
    function drawPortal() {
      if (!portal) return; var k = (t - portal.t0) / 1.7; if (k >= 1) { portal = null; return; }
      var pal = A.palette(portal.c), a = (k < 0.25 ? k / 0.25 : (1 - k) / 0.75) * (calm ? 0.35 : 0.8), px = cx, py = hy + (gy - hy) * 0.12, R = Math.max(W, H) * (0.25 + 0.65 * easeOut(k));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.55; ctx.translate(px, py); ctx.rotate(reduced ? 0 : -t * (calm ? 0.6 : 2.2)); ctx.scale(1, 0.55);
      var ra = rayArt(pal.glowRgb.join(',')); ctx.drawImage(ra, -R, -R, R * 2, R * 2);
      ctx.rotate(reduced ? 0 : t * 3.1); ctx.globalAlpha = a * 0.4; ctx.drawImage(ra, -R * 0.6, -R * 0.6, R * 1.2, R * 1.2);
      ctx.globalAlpha = a * 0.7; ctx.drawImage(A.glow(pal.glow, 64), -R * 0.5, -R * 0.5, R, R); ctx.restore();
      // palette shift: wash the frame in the new circle's colour, fading out
      ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = (1 - k) * (calm ? 0.25 : 0.55); ctx.fillStyle = pal.glow; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    // idol sun flare: star glint + hexagonal ghosts along the line through the screen centre
    function drawFlare() {
      if (!flare) return; var k = (t - flare.t0) / 1.8; if (k >= 1) { flare = null; return; }
      var p = proj(flare.z, flare.x, flare.h); if (!p) return;
      var a = (k < 0.12 ? k / 0.12 : Math.pow(1 - (k - 0.12) / 0.88, 1.5)) * (calm ? 0.35 : 1), R = 120 * K;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.8; ctx.drawImage(A.glow('#fff2c0', 64), p.x - R, p.y - R, R * 2, R * 2);
      // star glint (two thin crossed streaks, slowly turning)
      ctx.translate(p.x, p.y); ctx.rotate(calm || reduced ? 0.3 : t * 0.4);
      for (var s = 0; s < 2; s++) { ctx.rotate(Math.PI / 2); var L2 = R * (2.6 + 0.4 * Math.sin(t * 9)), g = ctx.createLinearGradient(-L2, 0, L2, 0); g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(0.5, 'rgba(255,250,230,' + a + ')'); g.addColorStop(1, 'rgba(255,240,200,0)'); ctx.fillStyle = g; ctx.fillRect(-L2, -1.5 * K, L2 * 2, 3 * K); }
      ctx.restore(); ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var dx = W / 2 - p.x, dy = H / 2 - p.y, cols = ['#ffd27a', '#ff9a6a', '#9ad8ff', '#c6a0ff'];
      for (var i = 0; i < 4; i++) { var f = 0.5 + i * 0.45, gx = p.x + dx * f * 2, gy2 = p.y + dy * f * 2, r = (14 + i * 9) * K; ctx.globalAlpha = a * 0.22; ctx.fillStyle = cols[i]; ctx.beginPath(); for (var h = 0; h < 6; h++) { var an = h / 6 * Math.PI * 2; ctx[h ? 'lineTo' : 'moveTo'](gx + Math.cos(an) * r, gy2 + Math.sin(an) * r); } ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    // bloom: downsample the frame, cube it (multiply with itself = soft threshold), blur by a second downsample, add back (q2)
    function bloom() {
      if (quality < 2) return;
      var bw = Math.max(8, Math.round(canvas.width / 8)), bh = Math.max(8, Math.round(canvas.height / 8));
      if (!bloomA || bloomA.width !== bw || bloomA.height !== bh) { bloomA = U.canvas(bw, bh); bloomB = U.canvas(Math.max(4, bw >> 1), Math.max(4, bh >> 1)); }
      var a = bloomA.getContext('2d'), b = bloomB.getContext('2d');
      a.globalCompositeOperation = 'copy'; a.imageSmoothingEnabled = true; a.drawImage(canvas, 0, 0, bw, bh);
      b.globalCompositeOperation = 'copy'; b.drawImage(bloomA, 0, 0, bloomB.width, bloomB.height);
      a.globalCompositeOperation = 'multiply'; a.drawImage(bloomB, 0, 0, bw, bh); a.drawImage(bloomB, 0, 0, bw, bh); a.drawImage(bloomB, 0, 0, bw, bh);
      b.globalCompositeOperation = 'copy'; b.drawImage(bloomA, 0, 0, bloomB.width, bloomB.height);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
      var k = calm ? 0.22 : 0.4; ctx.globalAlpha = k * 0.6; ctx.drawImage(bloomA, 0, 0, canvas.width, canvas.height); ctx.globalAlpha = k; ctx.drawImage(bloomB, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    function drawFx(dt) {
      if (!fctx || !fxActive) return;
      var d = fxCanvas.dpr || 1; fctx.setTransform(d, 0, 0, d, 0, 0); fctx.clearRect(0, 0, innerWidth, innerHeight);
      if (!fxParts.length) { fxActive = false; return; }
      var coin = assets.img('coin'), glowG = A.glow('#ffd23c', 32);
      for (var i = fxParts.length - 1; i >= 0; i--) {
        var q = fxParts[i]; q.age += dt; if (q.age > q.life) { fxParts.splice(i, 1); continue; }
        if (q.k === 'conf') { q.vy += 30 * dt; q.x += (q.vx + Math.sin(q.age * 3 + q.rot) * 40) * dt; q.y += q.vy * dt; q.rot += q.vr * dt; if (q.y > innerHeight + 20) { fxParts.splice(i, 1); continue; }
          fctx.save(); fctx.globalAlpha = q.age > q.life - 0.6 ? (q.life - q.age) / 0.6 : 1; fctx.translate(q.x, q.y); fctx.rotate(q.rot); fctx.scale(1, Math.abs(Math.cos(q.age * 6 + q.rot))); fctx.fillStyle = q.c; fctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); fctx.restore(); }
        else if (q.k === 'fw') { q.vy += 90 * dt; q.vx *= 0.985; q.vy *= 0.985; q.x += q.vx * dt; q.y += q.vy * dt; var a = 1 - q.age / q.life;
          fctx.globalCompositeOperation = 'lighter'; fctx.fillStyle = 'rgba(' + q.c + ',' + a + ')'; fctx.beginPath(); fctx.arc(q.x, q.y, 2.6, 0, Math.PI * 2); fctx.fill();
          fctx.strokeStyle = 'rgba(' + q.c + ',' + a * 0.5 + ')'; fctx.lineWidth = 2; fctx.beginPath(); fctx.moveTo(q.x, q.y); fctx.lineTo(q.x - q.vx * 0.08, q.y - q.vy * 0.08); fctx.stroke(); fctx.globalCompositeOperation = 'source-over'; }
        else if (q.k === 'rain') { q.y += q.vy * dt; if (q.y > innerHeight + 30) { fxParts.splice(i, 1); continue; } if (q.y < -20) continue; var cw = Math.max(0.15, Math.abs(Math.cos(q.age * 7 + q.spin))); fctx.save(); fctx.translate(q.x, q.y); fctx.scale(cw, 1); fctx.drawImage(coin, -q.s / 2, -q.s / 2, q.s, q.s); fctx.restore(); }
        else if (q.k === 'pc') { // physics coin: gravity, floor bounces, settle, fade
          if (q.age < q.delay) continue; var pdt = dt;
          q.vy += 1500 * pdt; q.x += q.vx * pdt; q.y += q.vy * pdt; q.spin += q.vs * pdt;
          if (q.y > q.floor && q.vy > 0) { q.y = q.floor; q.vy *= -0.42; q.vx *= 0.65; q.vs *= 0.6; q.b++; if (q.b > 3) { q.vy = 0; q.vx *= 0.5; } }
          var fa = q.age > q.life - 0.5 ? (q.life - q.age) / 0.5 : 1, cw2 = Math.max(0.12, Math.abs(Math.cos(q.spin)));
          fctx.save(); fctx.globalAlpha = fa; fctx.translate(q.x, q.y); fctx.scale(cw2, 1); fctx.drawImage(coin, -q.s / 2, -q.s / 2, q.s, q.s); fctx.restore();
          if (cw2 > 0.96 && quality >= 1) { fctx.globalCompositeOperation = 'lighter'; fctx.globalAlpha = fa * 0.9; fctx.fillStyle = '#fffbe0'; U.star4(fctx, q.x - q.s * 0.15, q.y - q.s * 0.2, q.s * 0.45); fctx.fill(); fctx.globalCompositeOperation = 'source-over'; fctx.globalAlpha = 1; }
        }
        else if (q.k === 'fly') { // cash-out fountain: up and out, then a curve into the balance
          var e0 = q.age - q.delay; if (e0 < 0) continue; var x, y, sz = q.s;
          if (e0 < q.up) { x = q.x0 + q.vx * e0; y = q.y0 + q.vy * e0 + 0.5 * 1100 * e0 * e0; }
          else {
            if (q.bx == null) { q.bx = q.x0 + q.vx * q.up; q.by = q.y0 + q.vy * q.up + 0.5 * 1100 * q.up * q.up; q.cx = q.bx + q.vx * 0.25; q.cy = Math.min(q.by, q.ty) - 50 - Math.random() * 60; }
            var e = (e0 - q.up) / q.dur;
            if (e >= 1) { fxParts.splice(i, 1); if (q.cb) q.cb(q.i || 0, q.n || 1); for (var s = 0; s < 4; s++) fxParts.push({ k: 'fw', x: q.tx, y: q.ty, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, c: '255,220,110', life: 0.35, age: 0 }); continue; }
            var ee = e * e * (3 - 2 * e), u = 1 - ee; x = u * u * q.bx + 2 * u * ee * q.cx + ee * ee * q.tx; y = u * u * q.by + 2 * u * ee * q.cy + ee * ee * q.ty; sz = q.s * (1 - 0.35 * ee);
          }
          if (quality >= 1) { fctx.globalCompositeOperation = 'lighter'; fctx.globalAlpha = 0.35; fctx.drawImage(glowG, x - sz, y - sz, sz * 2, sz * 2); fctx.globalAlpha = 1; fctx.globalCompositeOperation = 'source-over'; }
          fctx.save(); fctx.translate(x, y); fctx.scale(Math.max(0.2, Math.abs(Math.cos(e0 * 12 + q.i))), 1); fctx.drawImage(coin, -sz / 2, -sz / 2, sz, sz); fctx.restore();
        }
        else if (q.k === 'idolfly' || q.k === 'spk') {
          var e2 = (q.age - q.delay) / q.dur; if (e2 < 0) continue;
          if (e2 >= 1) { fxParts.splice(i, 1); if (q.cb) q.cb(q.i || 0, q.n || 1); if (q.k === 'spk') for (var s2 = 0; s2 < 3; s2++) fxParts.push({ k: 'fw', x: q.tx, y: q.ty, vx: (Math.random() - 0.5) * 140, vy: (Math.random() - 0.5) * 140, c: '255,236,150', life: 0.3, age: 0 }); continue; }
          var e3 = easeInOut(e2), u2 = 1 - e3, x2 = u2 * u2 * q.x0 + 2 * u2 * e3 * q.cx + e3 * e3 * q.tx, y2 = u2 * u2 * q.y0 + 2 * u2 * e3 * q.cy + e3 * e3 * q.ty;
          if (q.k === 'idolfly') { var sz2 = q.s * (1 - e3 * 0.55); fctx.globalCompositeOperation = 'lighter'; fctx.drawImage(A.glow('#ffd23c', 64), x2 - sz2, y2 - sz2, sz2 * 2, sz2 * 2); fctx.globalCompositeOperation = 'source-over'; var ii = assets.img('idol'); fctx.drawImage(ii, x2 - sz2 * 0.4, y2 - sz2 * 0.5, sz2 * 0.8, sz2); }
          else { var r3 = q.s * (1 + Math.sin(e2 * Math.PI) * 0.5) * (1 - 0.6 * e3 * e3); fctx.globalCompositeOperation = 'lighter'; fctx.globalAlpha = 0.9 * (1 - 0.5 * e3 * e3); fctx.drawImage(glowG, x2 - r3 * 2.5, y2 - r3 * 2.5, r3 * 5, r3 * 5); fctx.fillStyle = '#fff6c8'; U.star4(fctx, x2, y2, r3); fctx.fill();
            var e4 = easeInOut(Math.max(0, e2 - 0.08)), u4 = 1 - e4, tx2 = u4 * u4 * q.x0 + 2 * u4 * e4 * q.cx + e4 * e4 * q.tx, ty2 = u4 * u4 * q.y0 + 2 * u4 * e4 * q.cy + e4 * e4 * q.ty;
            fctx.strokeStyle = 'rgba(255,210,90,0.6)'; fctx.lineWidth = r3 * 0.7; fctx.lineCap = 'round'; fctx.beginPath(); fctx.moveTo(tx2, ty2); fctx.lineTo(x2, y2); fctx.stroke(); fctx.globalAlpha = 1; fctx.globalCompositeOperation = 'source-over'; }
        }
      }
    }

    // ---------- frame ----------
    function step(dtReal) {
      wall += dtReal;
      if (slowTarget < 1 && wall > slowUntil) slowTarget = 1;
      slow += (slowTarget - slow) * Math.min(1, dtReal * (slowTarget < slow ? 14 : 5));
      var dt = Math.min(0.05, dtReal) * timeScale * slow; t += dt;
      runTimers();
      camZ += (camZTarget - camZ) * Math.min(1, dt * 6);
      camX += (hero.x * 0.35 - camX) * Math.min(1, dt * 3);
      zoom += (zoomTarget - zoom) * Math.min(1, dt * (zoomTarget > zoom ? 3.2 : 7));
      if (circleFade < 1) circleFade = Math.min(1, circleFade + dt / 1.2);
      for (var i = 0; i < slabs.length; i++) {
        var s = slabs[i]; if (s.wob > 0) s.wob = Math.max(0, s.wob - dt);
        if (s.frags) for (var f = 0; f < s.frags.length; f++) { var fr = s.frags[f]; fr.vy += 260 * dt; fr.x += fr.vx * dt; fr.y += fr.vy * dt * 0.5; fr.rot += fr.vr * dt; if (fr.vy > 0) { fr.sink += dt * 1.1; fr.alpha -= dt * 0.9; } }
      }
      if (glowPulse > 0) glowPulse = Math.max(0, glowPulse - dt);
      if (desat > 0) desat = Math.max(0, desat - dt * 0.9);
      if (flash.a > 0) flash.a = Math.max(0, flash.a - dt * 1.4);
      if (shake > 0) shake = Math.max(0, shake - dt * 26);
      ageErupts(dt);
      return dt;
    }
    function draw(dt) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var sx = 0, sy = 0; if (shake > 0) { sx = (Math.random() - 0.5) * shake * 2; sy = (Math.random() - 0.5) * shake * 2; }
      ctx.save(); ctx.translate(sx, sy);
      if (zoom > 1.0005) { ctx.translate(zoomFocus.x, zoomFocus.y); ctx.scale(zoom, zoom); ctx.translate(-zoomFocus.x, -zoomFocus.y); }
      if (assets.rev && assets.rev() !== assetRev) { assetRev = assets.rev(); patterns = {}; layout(); }
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      var bgs = Math.min(dpr, 2), off = -camX * 0.12 * K;
      if (circleFade < 1) { ctx.drawImage(assets.bg(circleFrom, W + 40, H, hy, bgs), off - 20, 0, W + 40, H); ctx.globalAlpha = circleFade; }
      ctx.drawImage(assets.bg(circleNow, W + 40, H, hy, bgs), off - 20, 0, W + 40, H); ctx.globalAlpha = 1;
      drawHazard();
      drawLedges();
      if (painted) {
        var b0 = circleFade < 1 ? assets.band(circleFrom, W + 40, H, hy, gy, bgs) : null, b1 = assets.band(circleNow, W + 40, H, hy, gy, bgs);
        if (b0) { ctx.drawImage(b0, off - 20, 0, W + 40, b0.cssH); ctx.globalAlpha = circleFade; }
        if (b1) ctx.drawImage(b1, off - 20, 0, W + 40, b1.cssH);
        ctx.globalAlpha = 1;
      }
      drawPortal();
      slabTops = {}; var list = collect();
      for (var i = 0; i < list.length; i++) list[i].f(list[i]);
      ageRays(dt);
      drawParts(dt);
      drawGodRays();
      drawFlare();
      drawFloaters(dt);
      ctx.restore();
      drawAmbient(dt);
      if (!flyer && t > nextFlyer && !reduced) { flyer = { t0: t, dir: Math.random() < 0.5 ? 1 : -1, y: H * (0.25 + Math.random() * 0.2) }; nextFlyer = t + 18 + Math.random() * 20; }
      if (flyer) { var fk = (t - flyer.t0) / 6; if (fk > 1) flyer = null; else { var fx = flyer.dir > 0 ? -40 + fk * (W + 80) : W + 40 - fk * (W + 80); sprite('imp', fx, flyer.y + Math.sin(fk * 20) * 10, 0.22 * K, { flip: flyer.dir, sy: 1 + Math.sin(t * 20) * 0.06 }); } }
      bloom();
      if (!vignette) { vignette = ctx.createRadialGradient(W / 2, H * 0.58, Math.min(W, H) * 0.35, W / 2, H * 0.58, Math.max(W, H) * 0.78); vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(18,2,4,0.58)'); }
      ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
      if (glowPulse > 0) { var beat = calm ? 0 : Math.pow(Math.max(0, Math.sin(t * 7.6)), 6) * 0.08; ctx.fillStyle = 'rgba(20,0,6,' + Math.min(0.3, glowPulse * 0.5 + beat) + ')'; ctx.fillRect(0, 0, W, H); }
      if (desat > 0 && quality >= 1) { ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = 'rgba(128,128,128,' + Math.min(1, desat) + ')'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
      if (slow < 0.95) { ctx.fillStyle = 'rgba(255,214,120,' + (1 - slow) * (calm ? 0.05 : 0.1) + ')'; ctx.fillRect(0, 0, W, H); }
      if (flash.a > 0) { ctx.fillStyle = 'rgba(' + flash.c + ',' + flash.a + ')'; ctx.fillRect(0, 0, W, H); }
      drawFx(dt);
    }
    function frame(now) {
      var dtReal = lastFrameWall ? (now - lastFrameWall) / 1000 : 0.016; lastFrameWall = now;
      var t0 = performance.now(); var dt = step(dtReal); draw(dt); frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1;
      frames++; fpsAcc += dtReal; if (fpsAcc >= 1) { fps = frames / fpsAcc; frames = 0; fpsAcc = 0; if (forcedQuality == null) { slowFor = fps < 42 ? slowFor + 1 : 0; if (slowFor >= 3 && quality > 0) { quality--; slowFor = 0; resize(); } } }
      requestAnimationFrame(frame);
    }
    setInterval(function () { var now = performance.now(); if (now - lastFrameWall > 400) { step(0.05); lastFrameWall = now - 16; } }, 250);

    if (forcedQuality != null) quality = forcedQuality;
    resize();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { resize(); }).observe(canvas); else window.addEventListener('resize', resize);
    window.addEventListener('resize', function () { if (fxCanvas) resize(); });
    requestAnimationFrame(frame);

    return {
      setup: setup, setLadder: setLadder, restore: restore, jumpTo: jumpTo, celebrate: celebrate, enterCircle: function (c) { setCircle(c, false); },
      coinFly: coinFly, idolFly: idolFly, multFly: multFly, confetti: confetti, resize: resize, setStreak: setStreak,
      react: impReact, stamp: stamp,
      setDifficulty: function (d) { diffId = String(d || 'normal'); },
      setCalm: function (v) { calm = !!v; buildAmbient(); }, setReduced: function (v) { reduced = !!v; },
      after: after, wait: wait, setIdleCue: setIdleCue, idleCue: function () { return idleCue; },
      setTimeScale: function (v) { timeScale = v > 0 ? v : 1; },
      setQuality: function (q) { forcedQuality = q; if (q != null) { quality = q; resize(); } },
      circle: function () { return circleNow; },
      eruptNow: function () { spawnEruption(true); },
      stats: function () { return { heroFoot: heroFoot, slabTops: slabTops, hero: heroDrawn, fps: Math.round(fps), frameMs: Math.round(frameMs * 10) / 10, quality: quality, dpr: dpr, gl: !!(lavaGL && lavaGL.ok() && glState === 'on'), t: Math.round(t * 1000) / 1000, anticipation: zoomTarget > 1, revealAt: lastReveal, flare: !!flare, eruption: !!collapseHot, portal: !!portal, slow: Math.round(slow * 100) / 100, erupts: erupts.length, aura: aura, zoom: Math.round(zoom * 1000) / 1000, particles: parts.length + fxParts.length, circle: circleNow, size: [Math.round(W), Math.round(H)] }; }
    };
  }
  root.LavaScene = Scene;
})(this);
