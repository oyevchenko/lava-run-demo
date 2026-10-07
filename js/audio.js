/*
 * Lava Run: Inferno - audio. Three parts, all WebAudio:
 *  1. SFX samples (Kenney CC0 packs, see CREDITS.md) loaded from assets/audio via the manifest.
 *  2. Synthesized SFX (whooshes, heartbeat, sizzle, imp giggle...) + synth fallbacks for every sample
 *     (used on file:// where fetch is blocked, or if a file fails).
 *  3. A generative, adaptive score in D minor ("ancient lyre + frame drum" colour) composed for this game.
 *     Layers are added and the tempo / filter rise as the hero descends through the 9 circles.
 * Music and SFX have separate toggles. Nothing here influences game outcomes.
 */
(function (root) {
  'use strict';
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function LavaAudio(assets) {
    var ac = null, master, comp, musicBus, musicFilter, sfxBus, revIn, revOut, musicOn = true, sfxOn = true;
    var buf = {}, inst = {}, started = false, level = 0, targetLevel = 0, circle = 0, schedTimer = null, nextTime = 0, stepIdx = 0, bar = 0, cycle = 0;
    var lastCoin = 0, lastTick = 0, lastBubble = 0, lastReel = 0, ambNodes = null, unlocked = false, streak = 0;

    // ---------- graph ----------
    function ensure() {
      if (!unlocked || (!musicOn && !sfxOn)) return null;
      try {
        if (!ac) {
          var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
          ac = new AC();
          comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(ac.destination);
          master = ac.createGain(); master.gain.value = 0.9; master.connect(comp);
          revIn = ac.createConvolver(); revIn.buffer = impulse(2.6); revOut = ac.createGain(); revOut.gain.value = 0.32; revIn.connect(revOut); revOut.connect(master);
          musicFilter = ac.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 1400; musicFilter.Q.value = 0.4;
          musicBus = ac.createGain(); musicBus.gain.value = musicOn ? 0.5 : 0; musicBus.connect(musicFilter); musicFilter.connect(master);
          var mSend = ac.createGain(); mSend.gain.value = 0.55; musicFilter.connect(mSend); mSend.connect(revIn);
          sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? 0.85 : 0; sfxBus.connect(master);
          var sSend = ac.createGain(); sSend.gain.value = 0.18; sfxBus.connect(sSend); sSend.connect(revIn);
          buildInstruments(); loadSamples();
          document.addEventListener('visibilitychange', function () { if (!ac) return; if (document.hidden) ac.suspend(); else if (musicOn || sfxOn) ac.resume(); });
        }
        if (ac.state === 'suspended' && !document.hidden) ac.resume();
        if (musicOn && !started) startMusic();
      } catch (e) { return null; }
      return ac;
    }
    function impulse(sec) {
      var sr = ac.sampleRate, n = Math.floor(sr * sec), b = ac.createBuffer(2, n, sr);
      for (var c = 0; c < 2; c++) { var d = b.getChannelData(c); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2) * (i < sr * 0.01 ? i / (sr * 0.01) : 1); }
      return b;
    }
    function loadSamples() {
      if (!/^https?:$/.test(location.protocol) || !window.fetch) return; // file:// -> synth fallbacks
      var names = Object.keys((assets && assets.manifest && assets.manifest.audio) || {});
      names.forEach(function (n) {
        var url = assets.audioUrl(n); if (!url) return;
        fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then(function (ab) { return new Promise(function (res, rej) { ac.decodeAudioData(ab, res, rej); }); })
          .then(function (b) { buf[n] = b; }).catch(function (e) { console.warn('audio fallback for', n, e && e.message); });
      });
    }

    // ---------- pre-rendered instruments ----------
    function mono(sec, fn) { var sr = ac.sampleRate, n = Math.floor(sr * sec), b = ac.createBuffer(1, n, sr), d = b.getChannelData(0); fn(d, sr, n); return b; }
    function ks(freq, sec, bright) { // Karplus-Strong plucked string (lyre)
      return mono(sec, function (d, sr, n) {
        var N = Math.round(sr / freq), line = new Float32Array(N), prev = 0;
        for (var i = 0; i < N; i++) { var r = Math.random() * 2 - 1; prev = prev + (r - prev) * bright; line[i] = prev; }
        var idx = 0, last = 0;
        for (var j = 0; j < n; j++) { var cur = line[idx], nxt = line[(idx + 1) % N], v = (cur + nxt) * 0.5 * 0.9965; line[idx] = v; idx = (idx + 1) % N; d[j] = cur * 0.8 + last * 0.2; last = cur; }
        for (var k = 0; k < 64; k++) d[k] *= k / 64;
      });
    }
    function buildInstruments() {
      inst.lyre = [[110, ks(110, 2.2, 0.55)], [220, ks(220, 2.0, 0.6)], [440, ks(440, 1.6, 0.65)]];
      inst.bell = mono(2.6, function (d, sr, n) { var P = [[1, 1, 1.6], [2.76, 0.5, 1.1], [5.4, 0.25, 0.6], [8.93, 0.12, 0.35]]; for (var i = 0; i < n; i++) { var tt = i / sr, v = 0; for (var p = 0; p < P.length; p++) v += Math.sin(2 * Math.PI * 880 * P[p][0] * tt) * P[p][1] * Math.exp(-tt / P[p][2] * 2.2); d[i] = v * 0.35 * Math.min(1, i / 40); } });
      inst.doum = mono(0.6, function (d, sr, n) { var ph = 0; for (var i = 0; i < n; i++) { var tt = i / sr, f = 55 + 70 * Math.exp(-tt * 18); ph += 2 * Math.PI * f / sr; d[i] = Math.sin(ph) * Math.exp(-tt * 6) * 0.9 + (Math.random() * 2 - 1) * Math.exp(-tt * 60) * 0.25; } });
      inst.tek = mono(0.12, function (d, sr, n) { var p = 0; for (var i = 0; i < n; i++) { var tt = i / sr, r = Math.random() * 2 - 1, hp = r - p; p = r; d[i] = hp * Math.exp(-tt * 45) * 0.5 + Math.sin(2 * Math.PI * 1900 * tt) * Math.exp(-tt * 70) * 0.25; } });
      inst.shaker = mono(0.1, function (d, sr, n) { var p = 0; for (var i = 0; i < n; i++) { var tt = i / sr, r = Math.random() * 2 - 1, hp = r - p; p = r; d[i] = hp * Math.sin(Math.PI * i / n) * 0.22; } });
      inst.noise = mono(2, function (d) { for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
      inst.heart = mono(0.35, function (d, sr, n) { for (var i = 0; i < n; i++) { var tt = i / sr; d[i] = Math.sin(2 * Math.PI * (48 + 30 * Math.exp(-tt * 20)) * tt) * Math.exp(-tt * 14); } });
    }
    function play(b, when, rate, gain, dest, pan) {
      if (!b || !ac) return null;
      var s = ac.createBufferSource(); s.buffer = b; s.playbackRate.value = rate || 1;
      var g = ac.createGain(); g.gain.value = gain == null ? 1 : gain; s.connect(g);
      if (pan && ac.createStereoPanner) { var p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(dest || sfxBus); } else g.connect(dest || sfxBus);
      s.start(when || ac.currentTime); return s;
    }
    function lyre(m, when, gain, dest, pan) { var f = mtof(m), best = inst.lyre[0]; for (var i = 0; i < inst.lyre.length; i++) if (Math.abs(Math.log(inst.lyre[i][0] / f)) < Math.abs(Math.log(best[0] / f))) best = inst.lyre[i]; return play(best[1], when, f / best[0], gain, dest, pan); }
    function bell(m, when, gain, dest) { return play(inst.bell, when, mtof(m) / 880, gain, dest); }
    function tone(freq, dur, type, vol, slideTo, when, dest, attack) {
      var t0 = when || ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + (attack || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(dest || sfxBus); o.start(t0); o.stop(t0 + dur + 0.05); return o;
    }
    function noise(dur, vol, type, f0, f1, when, dest, q) {
      var t0 = when || ac.currentTime, s = ac.createBufferSource(); s.buffer = inst.noise; s.loop = true;
      var f = ac.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(f0 || 800, t0); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur); f.Q.value = q || 1;
      var g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + Math.min(0.05, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(dest || sfxBus); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
    }
    function sample(name, gain, rate, when) { if (buf[name]) { play(buf[name], when, rate || 1, gain == null ? 1 : gain); return true; } return false; }

    // ---------- music: composition ----------
    var CH = { Dm: [50, 53, 57], Bb: [46, 50, 53], C: [48, 52, 55], F: [53, 57, 60], Gm: [55, 58, 62], A: [45, 49, 52], Eb: [51, 55, 58] };
    var ROOT = { Dm: 38, Bb: 34, C: 36, F: 41, Gm: 43, A: 33, Eb: 39 };
    var PROG = ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'F', 'Gm', 'A'], PROG_DEEP = ['Dm', 'Eb', 'Dm', 'C', 'Bb', 'Eb', 'C', 'A'];
    var MEL = [[0, 0, 69, 4], [0, 4, 74, 4], [0, 8, 77, 6], [0, 14, 76, 2], [1, 0, 74, 8], [1, 8, 69, 8], [2, 0, 70, 4], [2, 4, 74, 4], [2, 8, 77, 4], [2, 12, 79, 2], [2, 14, 77, 2], [3, 0, 76, 12], [3, 12, 72, 4],
      [4, 0, 74, 4], [4, 4, 77, 4], [4, 8, 81, 6], [4, 14, 79, 2], [5, 0, 77, 4], [5, 4, 76, 2], [5, 6, 74, 2], [5, 8, 72, 8], [6, 0, 70, 4], [6, 4, 74, 4], [6, 8, 79, 4], [6, 12, 77, 2], [6, 14, 76, 2], [7, 0, 73, 8], [7, 8, 76, 4], [7, 12, 69, 4]];
    var MEL_DEEP = MEL.filter(function (n) { return n[0] !== 1 && n[0] !== 5; }).concat([[1, 0, 75, 6], [1, 6, 74, 2], [1, 8, 70, 8], [5, 0, 79, 4], [5, 4, 75, 4], [5, 8, 70, 8]]);
    var BPM = [72, 76, 80, 84, 87, 90, 94, 98, 102, 106];
    var CUTOFF = [1100, 1300, 1500, 1700, 1900, 2000, 2300, 2600, 2800, 3200];

    function startMusic() { if (!ac || started) return; started = true; nextTime = ac.currentTime + 0.1; stepIdx = 0; bar = 0; schedTimer = setInterval(schedule, 25); setAmbience(circle); }
    // optional drop-in stems (assets/audio/music_base|mid|deep, looped and layered by depth) replace the generative score
    var stems = null;
    function stemGains() { return [1, level >= 4 ? 1 : 0, level >= 7 ? 1 : 0]; }
    function startStems() {
      var t0 = ac.currentTime + 0.1; stems = ['music_base', 'music_mid', 'music_deep'].map(function (n, i) {
        if (!buf[n]) return null; var src = ac.createBufferSource(), g = ac.createGain(); src.buffer = buf[n]; src.loop = true; g.gain.value = stemGains()[i]; src.connect(g); g.connect(musicBus); src.start(t0); return g; });
    }
    function schedule() {
      if (!ac || !musicOn || ac.state !== 'running') return;
      if (stems || buf.music_base) { if (!stems) startStems(); if (level !== targetLevel) applyLevel(); var sg = stemGains(); stems.forEach(function (g, i) { if (g) g.gain.setTargetAtTime(sg[i], ac.currentTime, 1.5); }); return; }
      while (nextTime < ac.currentTime + 0.15) { playStep(stepIdx, nextTime); var spb = 60 / BPM[level] / 4; nextTime += spb; stepIdx++; if (stepIdx >= 16) { stepIdx = 0; bar = (bar + 1) % 8; if (bar === 0) cycle++; if (level !== targetLevel) applyLevel(); } }
    }
    function applyLevel() { level = targetLevel; applyCutoff(); }
    function applyCutoff() { if (musicFilter) musicFilter.frequency.setTargetAtTime(CUTOFF[level] + streak * 450, ac.currentTime, 0.8); }
    function playStep(s, when) {
      var deep = level >= 7, prog = deep ? PROG_DEEP : PROG, ch = prog[bar], tones = CH[ch], ext = [tones[0], tones[1], tones[2], tones[0] + 12, tones[1] + 12], spb = 60 / BPM[level] / 4;
      // pad (once per bar)
      if (s === 0) pad(tones, when, spb * 16);
      // lyre arpeggio
      var arp8 = [0, 2, 3, 2, 1, 2, 4, 2];
      if (level <= 1) { if (s % 4 === 0) lyre(ext[[0, 1, 2, 1][s / 4]] + 12, when, 0.34, musicBus, -0.2); }
      else if (s % 2 === 0) lyre(ext[arp8[s / 2]] + 12, when, 0.3 - (s % 4 ? 0.08 : 0), musicBus, -0.2);
      else if (level >= 5 && (s === 15 || s === 7) ) lyre(ext[4] + 12, when, 0.14, musicBus, -0.2);
      // bass
      var r = ROOT[ch];
      if (level >= 2 && level < 5 && (s === 0 || s === 8)) lyre(r, when, 0.55, musicBus, 0);
      if (level >= 5 && [0, 3, 6, 8, 11, 14].indexOf(s) >= 0) lyre(s === 6 || s === 14 ? r + 7 : r, when, s % 8 === 0 ? 0.55 : 0.36, musicBus, 0);
      // frame drum (maqsum) + shaker
      if (level >= 3) { if (s === 0 || s === 8) play(inst.doum, when, 1, 0.5, musicBus, 0.1); if (s === 2 || s === 6 || s === 12) play(inst.tek, when, 1, 0.32, musicBus, 0.25); if (level >= 6 && (s === 4 || s === 10 || s === 15)) play(inst.tek, when, 1.1, 0.14, musicBus, -0.25); }
      if (level >= 5 && s % 2 === 1) play(inst.shaker, when, 1, level >= 8 ? 0.5 : 0.32, musicBus, 0.35);
      // streak intensifies the score: extra frame-drum hits, driving shaker, a bass pulse
      if (streak >= 1 && (s === 4 || s === 12)) play(inst.tek, when, 1.15, 0.22, musicBus, -0.3);
      if (streak >= 2 && (s === 10 || s === 14)) play(inst.doum, when, 1.1, 0.32, musicBus, -0.1);
      if (streak >= 2 && level < 5 && s % 2 === 1) play(inst.shaker, when, 1.05, 0.22, musicBus, 0.35);
      if (streak >= 3 && s % 4 === 2) lyre(ROOT[ch] + 12, when, 0.28, musicBus, 0);
      // melody (pan flute) - every other cycle from circle IV, every cycle from VII
      if (level >= 4 && (level >= 7 || cycle % 2 === 1)) { var mel = deep ? MEL_DEEP : MEL; for (var i = 0; i < mel.length; i++) if (mel[i][0] === bar && mel[i][1] === s) flute(mel[i][2], when, mel[i][3] * spb); }
      // bells: Greed glitters, Treachery shimmers
      if ((circle === 4 && Math.random() < 0.18) || (circle === 9 && Math.random() < 0.24) || (level >= 1 && s === 0 && bar % 4 === 0)) bell(ext[Math.floor(Math.random() * 5)] + 24, when, circle === 9 ? 0.14 : 0.1, musicBus);
      // ambience accents
      if (circle === 6 || circle === 7) { if (Math.random() < 0.3) play(inst.tek, when + Math.random() * spb, 2 + Math.random(), 0.05, musicBus, (Math.random() - 0.5)); }
      if (circle === 5 && Math.random() < 0.06) tone(180 + Math.random() * 120, 0.18, 'sine', 0.06, 420, when, musicBus);
    }
    function pad(tones, when, dur) {
      var g = ac.createGain(), f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500 + level * 90; f.Q.value = 0.6;
      g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(0.055, when + dur * 0.3); g.gain.linearRampToValueAtTime(0.045, when + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, when + dur * 1.08);
      f.connect(g); g.connect(musicBus);
      tones.concat([tones[0] - 12]).forEach(function (m, i) { [-6, 6].forEach(function (det) { var o = ac.createOscillator(); o.type = i === 3 ? 'triangle' : 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det; o.connect(f); o.start(when); o.stop(when + dur * 1.1); }); });
    }
    function flute(m, when, dur) {
      var o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), v = ac.createOscillator(), vg = ac.createGain();
      o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m) * 2;
      v.frequency.value = 5.2; vg.gain.value = mtof(m) * 0.012; v.connect(vg); vg.connect(o.frequency);
      var g2 = ac.createGain(); g2.gain.value = 0.18; o2.connect(g2); g2.connect(g); o.connect(g);
      g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(0.085, when + 0.06); g.gain.setValueAtTime(0.075, when + Math.max(0.07, dur - 0.08)); g.gain.linearRampToValueAtTime(0.0001, when + dur + 0.12);
      g.connect(musicBus); [o, o2, v].forEach(function (n) { n.start(when); n.stop(when + dur + 0.2); });
      noise(Math.min(0.12, dur), 0.012, 'bandpass', 2400, null, when, musicBus, 2);
    }
    function setAmbience(c) {
      if (!ac) return;
      if (ambNodes) { var old = ambNodes; old.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.6); setTimeout(function () { try { old.s.stop(); } catch (e) {} }, 3000); ambNodes = null; }
      var cfg = { 1: ['bandpass', 900, 0.012, 0.6], 2: ['bandpass', 700, 0.03, 0.8], 3: ['highpass', 2500, 0.03, 0.5], 5: ['lowpass', 300, 0.03, 0.7], 7: ['lowpass', 500, 0.04, 0.6], 8: ['lowpass', 200, 0.03, 0.5], 9: ['highpass', 5000, 0.012, 0.4] }[c];
      if (!cfg || !musicOn) return;
      var s = ac.createBufferSource(); s.buffer = inst.noise; s.loop = true;
      var f = ac.createBiquadFilter(); f.type = cfg[0]; f.frequency.value = cfg[1]; f.Q.value = cfg[3];
      var g = ac.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(cfg[2], ac.currentTime, 1.2);
      if (c === 2) { var l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 0.13; lg.gain.value = 500; l.connect(lg); lg.connect(f.frequency); l.start(); }
      s.connect(f); f.connect(g); g.connect(musicBus); s.start(); ambNodes = { s: s, g: g };
    }

    // ---------- public API ----------
    var api = {
      unlock: function () { unlocked = true; return ensure(); },
      setMusic: function (v) { musicOn = !!v; if (musicOn) { ensure(); if (ac) { musicBus.gain.setTargetAtTime(0.5, ac.currentTime, 0.3); if (!ambNodes) setAmbience(circle); } } else if (ac) { musicBus.gain.setTargetAtTime(0.0001, ac.currentTime, 0.2); if (!sfxOn) setTimeout(function () { if (!musicOn && !sfxOn) ac.suspend(); }, 400); } },
      setSfx: function (v) { sfxOn = !!v; if (sfxOn) { ensure(); if (ac) sfxBus.gain.setTargetAtTime(0.85, ac.currentTime, 0.05); } else if (ac) { sfxBus.gain.setTargetAtTime(0.0001, ac.currentTime, 0.05); if (!musicOn) setTimeout(function () { if (!musicOn && !sfxOn) ac.suspend(); }, 400); } },
      /** depth 0 = gate/idle, 1..9 = circle */
      setCircle: function (c) { if (c === circle) return; circle = c; targetLevel = Math.max(0, Math.min(9, c)); if (ac && musicOn) setAmbience(c); if (ac && targetLevel < level) applyLevel(); },
      duck: function (to, ms) { if (!ac || !musicOn) return; var n = ac.currentTime; musicBus.gain.cancelScheduledValues(n); musicBus.gain.setTargetAtTime(0.5 * to, n, 0.05); musicBus.gain.setTargetAtTime(0.5, n + ms / 1000, 0.5); },
      state: function () { return { ctx: ac ? ac.state : 'none', music: musicOn, sfx: sfxOn, level: level, streak: streak, circle: circle, samples: Object.keys(buf).length, bpm: BPM[level] }; },
      click: function () { if (!ensure() || !sfxOn) return; if (!sample('ui_click', 0.6)) tone(700, 0.04, 'square', 0.06); },
      toggle: function () { if (!ensure() || !sfxOn) return; if (!sample('ui_toggle', 0.6)) tone(520, 0.06, 'triangle', 0.1, 780); },
      jump: function () { if (!ensure() || !sfxOn) return; sample('jump_cloth', 0.5, 1.1); noise(0.28, 0.07, 'bandpass', 500, 2200, null, null, 1.2); },
      land: function () { if (!ensure() || !sfxOn) return; if (!sample(Math.random() < 0.5 ? 'land_1' : 'land_2', 0.9, 0.9)) noise(0.08, 0.3, 'lowpass', 600); tone(95, 0.12, 'sine', 0.28, 60); },
      safe: function (k, N) { if (!ensure() || !sfxOn) return; var sc = [62, 64, 65, 67, 69, 70, 72, 74, 76, 77, 79, 81, 82, 84, 86], i = Math.round((k - 1) * 14 / Math.max(1, N - 1)), n = ac.currentTime + 0.01;
        lyre(sc[i], n, 0.55, sfxBus, 0.1); lyre(sc[i] + 12, n + 0.07, 0.3, sfxBus, 0.1); sample('sparkle', 0.25, 1 + i * 0.03, n + 0.05); },
      phew: function () { if (!ensure() || !sfxOn) return; var n = ac.currentTime; lyre(74, n, 0.4); lyre(78, n + 0.09, 0.4); lyre(81, n + 0.18, 0.45); },
      tension: function (lvl) { if (!ensure() || !sfxOn) return; var n = ac.currentTime, dur = lvl === 2 ? 0.62 : 0.36;
        if (!lvl) { play(inst.heart, n, 1.1, 0.32); noise(0.22, 0.025, 'bandpass', 500, 1400, n, null, 1.5); return; }
        [0, 0.17].concat(lvl === 2 ? [0.42, 0.57] : []).forEach(function (d) { play(inst.heart, n + d, 1, 0.75); });
        noise(dur, 0.06, 'bandpass', 400, 2600, n, null, 2); tone(260, dur, 'sine', 0.05, 520, n, null, dur * 0.8); if (musicOn) api.duck(0.55, dur * 1000 + 200); },
      idol: function () { if (!ensure() || !sfxOn) return; var n = ac.currentTime; if (!sample('sting_idol', 0.8)) { [74, 78, 81, 86].forEach(function (m, i) { lyre(m, n + i * 0.07, 0.45); }); }
        [86, 90, 93, 98].forEach(function (m, i) { bell(m, n + 0.05 + i * 0.08, 0.16); }); sample('sparkle_long', 0.5, 1, n + 0.1); noise(0.9, 0.04, 'highpass', 6000, 9000, n); if (musicOn) api.duck(0.4, 1300); },
      circle: function (c) { if (!ensure() || !sfxOn) return; var n = ac.currentTime; if (!sample('circle_bell', 0.7, 0.86 - c * 0.025)) bell(50 - c, n, 0.5); play(inst.doum, n, 0.8, 0.7); noise(0.7, 0.06, 'bandpass', 300, 1500, n, null, 0.8); },
      crack: function () { if (!ensure() || !sfxOn) return; if (!sample(Math.random() < 0.5 ? 'crack_1' : 'crack_2', 0.85)) noise(0.4, 0.4, 'lowpass', 1200, 300); },
      splash: function () { if (!ensure() || !sfxOn) return; var n = ac.currentTime; sample('splash_thud', 0.8, 0.8); noise(1.1, 0.16, 'highpass', 3000, 1200, n); noise(0.5, 0.25, 'lowpass', 500, 150, n);
        for (var i = 0; i < 5; i++) tone(240 + Math.random() * 200, 0.12, 'sine', 0.07, 600 + Math.random() * 300, n + 0.15 + i * 0.09); },
      loss: function () { if (!ensure() || !sfxOn) return; var n = ac.currentTime; if (musicOn) api.duck(0.25, 1800);
        if (!sample('sting_loss', 0.75)) { [[392, 0], [370, 0.32], [349, 0.64], [330, 0.96]].forEach(function (x, i) { var o = tone(x[0], i === 3 ? 0.9 : 0.3, 'sawtooth', 0.09, i === 3 ? 300 : null, n + x[1], null, 0.03); }); } },
      giggle: function () { if (!ensure() || !sfxOn) return; var n = ac.currentTime; for (var i = 0; i < 4; i++) tone(1100 + (i % 2) * 260, 0.07, 'square', 0.025, 1500 + (i % 2) * 200, n + i * 0.09); },
      win: function (tier) { if (!ensure() || !sfxOn) return; var n = ac.currentTime, r = tier ? tier.rank : 1, nm = ['win_nice', 'win_nice', 'win_big', 'win_mega', 'win_epic'][r];
        if (musicOn) api.duck(0.3, 900 + r * 700);
        if (!sample(nm, 0.75)) [62, 66, 69, 74, 78].slice(0, 2 + r).forEach(function (m, i) { lyre(m, n + i * 0.08, 0.5); });
        sample(r >= 2 ? 'coins_burst' : 'coins_small', 0.6, 1, n + 0.05);
        if (r >= 3) { [50, 54, 57, 62].forEach(function (m) { tone(mtof(m), 1.4, 'sawtooth', 0.035, null, n + 0.12, null, 0.12); }); for (var i = 0; i < 10; i++) play(inst.doum, n + 0.1 + i * 0.06, 1.3, 0.25); }
        if (r >= 4) { sample('win_big', 0.6, 1, n + 1.1); [74, 78, 81, 86, 90, 93].forEach(function (m, i) { bell(m, n + 0.4 + i * 0.09, 0.14); }); } },
      coin: function (i) { if (!ensure() || !sfxOn) return; var n = ac.currentTime; if (n - lastCoin < 0.045) return; lastCoin = n; if (!sample(i % 2 ? 'coin_2' : 'coin_1', 0.35, 0.95 + Math.random() * 0.3)) bell(96 + (i % 5), n, 0.08); },
      tick: function () { if (!ensure() || !sfxOn) return; var n = ac.currentTime; if (n - lastTick < 0.06) return; lastTick = n; if (!sample('tick', 0.25, 1.2)) tone(1800, 0.02, 'square', 0.03); },
      refill: function () { if (!ensure() || !sfxOn) return; if (!sample('coin_stack', 0.7)) bell(90, null, 0.15); sample('coins_small', 0.5, 1, ac.currentTime + 0.12); },
      /** safe landing: low shockwave thump + a rune chime */
      rune: function () { if (!ensure() || !sfxOn) return; var n = ac.currentTime + 0.02; tone(85, 0.45, 'sine', 0.22, 40, n); noise(0.35, 0.05, 'bandpass', 1800, 400, n, null, 0.9);
        [93, 98].forEach(function (m, i) { bell(m, n + 0.06 + i * 0.07, 0.07); }); },
      /** multiplier counter digits rolling */
      reel: function () { if (!ensure() || !sfxOn) return; var n = ac.currentTime; if (n - lastReel < 0.035) return; lastReel = n; tone(2300 + Math.random() * 400, 0.018, 'square', 0.018); },
      /** lava micro-eruptions near the camera: 0 bubble, 1 spurt, 2 burp (Styx gurgles, Cocytus is silent) */
      bubble: function (size, c) { if (!ensure() || !sfxOn || c === 9) return; var n = ac.currentTime; if (n - lastBubble < 0.18) return; lastBubble = n;
        var low = c === 5 || c === 3 || c === 8, f = (low ? 90 : 140) * (size === 2 ? 0.6 : 1) * (0.85 + Math.random() * 0.3), v = [0.05, 0.07, 0.11][size];
        tone(f, 0.12 + size * 0.06, 'sine', v, f * 2.6, n + 0.02);
        if (size >= 1 && !low) noise(0.35 + size * 0.2, v * 0.6, 'highpass', 3500, 1800, n + 0.05);
        if (size === 2) noise(0.6, 0.08, 'lowpass', 220, 90, n); },
      /** collapse: the lava erupts (roar + rumble) */
      eruption: function () { if (!ensure() || !sfxOn) return; var n = ac.currentTime; noise(1.6, 0.26, 'lowpass', 260, 1400, n, null, 0.8); noise(1.2, 0.12, 'highpass', 2500, 900, n + 0.1); tone(48, 1.4, 'sine', 0.3, 32, n, null, 0.08);
        for (var i = 0; i < 6; i++) tone(180 + Math.random() * 160, 0.1, 'sine', 0.05, 500, n + 0.2 + Math.random() * 0.8); },
      /** big win coin shower: a cascade of coin clinks */
      coinShower: function (rank) { if (!ensure() || !sfxOn) return; var n = ac.currentTime, cnt = [0, 0, 10, 16, 24][rank] || 8;
        for (var i = 0; i < cnt; i++) { var w = n + 0.15 + Math.random() * (0.8 + rank * 0.25); if (!buf.coin_1) bell(94 + Math.floor(Math.random() * 6), w, 0.05); else play(buf[i % 2 ? 'coin_2' : 'coin_1'], w, 0.9 + Math.random() * 0.4, 0.22, null, (Math.random() - 0.5) * 0.8); } },
      /** cash-out coin fountain launching */
      whoosh: function () { if (!ensure() || !sfxOn) return; var n = ac.currentTime; noise(0.55, 0.09, 'bandpass', 500, 3200, n, null, 1.4); },
      /** circle transition: portal swirl whoosh rising into a boom */
      portal: function () { if (!ensure() || !sfxOn) return; var n = ac.currentTime; noise(0.95, 0.1, 'bandpass', 180, 2400, n, null, 2.2); tone(110, 0.9, 'sawtooth', 0.025, 330, n, null, 0.6);
        play(inst.doum, n + 0.85, 0.7, 0.8); tone(55, 0.9, 'sine', 0.22, 38, n + 0.85); },
      /** idol slow-motion: a deep whum */
      slowmo: function () { if (!ensure() || !sfxOn) return; var n = ac.currentTime; tone(150, 1.1, 'sine', 0.2, 45, n, null, 0.05); noise(0.9, 0.06, 'lowpass', 900, 120, n); },
      /** streak aura ignites */
      aura: function (lv) { if (!ensure() || !sfxOn) return; var n = ac.currentTime; noise(0.7, 0.07 + lv * 0.02, 'bandpass', 600, 3800, n, null, 1.2); noise(0.5, 0.06, 'lowpass', 400, 120, n + 0.05); tone(220 * (1 + lv * 0.25), 0.5, 'triangle', 0.04, 440 * (1 + lv * 0.25), n); },
      /** streak level 0..3 -> music intensity (brighter filter + extra percussion layers) */
      setStreak: function (lv) { streak = Math.max(0, Math.min(3, lv | 0)); if (ac) applyCutoff(); },
      firework: function () { if (!ensure() || !sfxOn) return; var n = ac.currentTime; noise(0.25, 0.12, 'lowpass', 2000, 200, n); for (var i = 0; i < 6; i++) noise(0.03, 0.05, 'highpass', 4000, null, n + 0.15 + Math.random() * 0.4); }
    };
    return api;
  }
  root.LavaAudio = LavaAudio;
})(this);
