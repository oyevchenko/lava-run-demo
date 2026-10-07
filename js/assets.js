/*
 * Lava Run: Inferno - asset manager. Loads the bitmaps listed in assets/manifest.json (src != null) and
 * transparently falls back to the code-drawn art (js/art/*) for everything that is missing.
 */
(function (root) {
  'use strict';
  function Assets(manifest, opts) {
    opts = opts || {};
    var M = manifest || { images: {}, audio: {}, basePath: 'assets/' };
    var base = M.basePath || 'assets/', imgs = {}, cache = {}, A = root.LavaArt, U = A.util;
    var loaded = 0, failed = [], rev = 0, bgCache = {};
    // code-drawn fallbacks are rasterised above spec size on high-dpi / desktop screens so they stay crisp
    var HI = Math.max(1, Math.min(2, (root.devicePixelRatio || 1) * ((root.innerWidth || 0) >= 900 ? 1.4 : 1)));

    function loadImage(name, src) {
      return new Promise(function (res) {
        var im = new Image(); im.decoding = 'async';
        im.onload = function () { imgs[name] = im; loaded++; invalidate(name); res(); };
        im.onerror = function () { failed.push(name); console.warn('asset missing, using fallback:', name); res(); };
        im.src = base + src;
      });
    }
    var jobs = Object.keys(M.images || {}).filter(function (n) { return M.images[n].src; }).map(function (n) { return loadImage(n, M.images[n].src); });
    var ready = Promise.race([Promise.all(jobs), new Promise(function (r) { setTimeout(r, 8000); })]).then(applyUiCss);

    // a bitmap arrived after its fallback was already used: drop derived caches so the renderer picks it up
    function invalidate(name) {
      rev++;
      Object.keys(cache).forEach(function (k) { if (k === name || k.indexOf(name + '|') === 0 || k.indexOf('|' + name + '|') >= 0 || /^hz|^st|^ledge$/.test(k)) delete cache[k]; });
      if (/^bg_circle_/.test(name)) bgCache = {};
    }
    function meta(name) { var m = M.images[name]; if (m) return m; var s = A.sizes[name] || [256, 256]; return { w: s[0], h: s[1], anchor: [0.5, 0.95] }; }
    function isFallback(name) { return !imgs[name]; }
    /** drawable for a sprite (PNG if present, else code-drawn canvas at a sensible resolution) */
    function img(name) {
      if (imgs[name]) return imgs[name];
      if (cache[name]) return cache[name];
      var m = meta(name), r = Math.min(HI, (opts.fallbackMax || 1024) / Math.max(m.w, m.h)), cv = U.canvas(m.w * r, m.h * r), ctx = cv.getContext('2d');
      ctx.scale(r, r);
      try { if (A.draw[name]) A.draw[name](ctx, m.w, m.h); } catch (e) { console.warn('fallback draw failed', name, e); }
      cv.specScale = r;
      return (cache[name] = cv);
    }
    /** tinted copy of a sprite (multiply-ish wash with alpha), cached */
    function tinted(name, color, alpha) {
      if (!color) return img(name);
      var key = name + '|' + color + '|' + alpha; if (cache[key]) return cache[key];
      var src = img(name), cv = U.canvas(src.width, src.height), ctx = cv.getContext('2d');
      ctx.drawImage(src, 0, 0); ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fillRect(0, 0, cv.width, cv.height);
      cv.specScale = src.specScale || (src.width / meta(name).w);
      return (cache[key] = cv);
    }
    function hazard(c) { // tileable canvas/image for the hazard plane of circle c (0 = gate)
      var key = 'hz' + c; if (cache[key]) return cache[key];
      if (c >= 1 && imgs['hazard_c' + c]) return (cache[key] = imgs['hazard_c' + c]);
      return (cache[key] = A.hazardTexture(c, opts.texSize || 256));
    }
    function streak(c) { var key = 'st' + c; return cache[key] || (cache[key] = A.streakTexture(c, opts.texSize || 256)); }
    function ledge() { if (imgs.stone_ledge) return imgs.stone_ledge; return cache.ledge || (cache.ledge = A.marbleTexture(256)); }
    function bg(c, w, h, hy, scale) { // code-drawn cavern sky/funnel (always under the painted band)
      var key = c + ':' + Math.round(w) + 'x' + Math.round(h) + ':' + Math.round(hy) + ':' + scale;
      if (bgCache[key]) return bgCache[key];
      var cv = A.background(c, w, h, hy, scale);
      var keys = Object.keys(bgCache); if (keys.length > 8) delete bgCache[keys[0]];
      return (bgCache[key] = cv);
    }
    function hasBand() { return !!imgs.bg_circle_1; }
    /**
     * Painted backdrop of circle c as a horizon band (landscape 16:9 art): scaled to cover the canvas width and the
     * sky, the painting's own horizon line (manifest `horizon`, fraction of its height) placed on the scene horizon hy,
     * opaque a little below hy and fading out over the far lava so the code-drawn hazard plane takes over. null = none.
     */
    function band(c, w, h, hy, gy, scale) {
      var im = imgs['bg_circle_' + Math.max(1, c)]; if (!im) return null;
      var key = 'band' + c + ':' + Math.round(w) + 'x' + Math.round(h) + ':' + Math.round(hy) + ':' + scale;
      if (bgCache[key]) return bgCache[key];
      var HZ = (M.images['bg_circle_' + Math.max(1, c)] || {}).horizon || 0.7;
      var sc = Math.max(w / im.width, (hy * 1.18) / (im.height * HZ)), dw = im.width * sc, dh = im.height * sc, y0 = hy - dh * HZ;
      var y1 = Math.min(h, hy + (gy - hy) * 0.34), cv = U.canvas(w * scale, y1 * scale), bx = cv.getContext('2d'); bx.scale(scale, scale);
      bx.imageSmoothingQuality = 'high'; bx.drawImage(im, (w - dw) / 2, y0, dw, dh);
      bx.globalCompositeOperation = 'destination-in';
      var g = bx.createLinearGradient(0, 0, 0, y1), a = (hy + (gy - hy) * 0.05) / y1;
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(a, 'rgba(0,0,0,1)'); g.addColorStop(a + (1 - a) * 0.45, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      bx.fillStyle = g; bx.fillRect(0, 0, w, y1); // single mask fill (destination-in is unbounded)
      cv.cssH = y1;
      var keys = Object.keys(bgCache); if (keys.length > 8) delete bgCache[keys[0]];
      return (bgCache[key] = cv);
    }
    function applyUiCss() {
      var de = document.documentElement;
      ['ui_panel_crimson', 'ui_plaque', 'ui_btn_green', 'ui_btn_gold', 'ui_medallion', 'ui_icon_btn', 'ui_meander_strip', 'logo', 'coin'].forEach(function (n) {
        if (imgs[n]) { de.style.setProperty('--img-' + n.replace(/_/g, '-'), 'url("' + new URL(base + M.images[n].src, location.href).href + '")'); de.classList.add('has-' + n.replace(/_/g, '-')); }
      });
    }
    // ---------- per-circle slab variants (derived from slab_marble / slab_cracked with composite ops only, so they
    // also work from file:// where reading back pixels of a disk image is blocked) ----------
    var SLAB_LOOK = [
      null,                                                                                     // gate: original warm marble
      { color: '#cbc3e6', ca: 0.32, screen: '#141018', veins: ['rgba(120,110,150,0.35)', 5] },     // I   Limbo: pale lavender marble
      { mul: '#ffd9e6', color: '#ff7aa6', ca: 0.62, screen: '#2a0c18', veins: ['rgba(255,245,250,0.55)', 6], gloss: 0.5 }, // II rose quartz
      { mul: '#a39d8a', color: '#6e7f4c', ca: 0.55, moss: true },                                   // III mossy stone
      { mul: '#ffd36a', color: '#ffb81c', ca: 0.95, screen: '#3a2200', gloss: 0.9, flecks: '#fff6c0' }, // IV gold
      { mul: '#5f8885', color: '#1f7068', ca: 0.8, veins: ['rgba(140,255,210,0.18)', 4] },          // V   dark teal Styx stone
      { mul: '#3b3338', color: '#3a2a34', ca: 0.5, ember: '#ff7a1a', gloss: 0.5 },                    // VI  obsidian, ember veins
      { mul: '#b0594a', color: '#9e1a14', ca: 0.88, pores: true },                                     // VII blood-red basalt
      { mul: '#9c8bb0', color: '#6a2a96', ca: 0.72, curse: '#7dff9e' },                                // VIII cursed purple-green
      { mul: '#d6f0ff', color: '#8fd2ff', ca: 0.7, screen: '#1e3c58', frost: true, gloss: 0.9 }       // IX  ice
    ];
    var svKeys = [];
    function slabVariant(c, v, cracked) {
      var base = cracked ? 'slab_cracked' : 'slab_marble', look = SLAB_LOOK[c] || null;
      var key = 'sv|' + base + '|' + c + '|' + v; if (cache[key]) return cache[key];
      svKeys.push(key); if (svKeys.length > 16) delete cache[svKeys.shift()]; // ~2 MB each at 2x: keep the recent ones only
      var src = img(base), m = meta(base), W = src.width, H = src.height, k = W / m.w, cv = U.canvas(W, H), x = cv.getContext('2d');
      var rnd = U.prng(1000 + c * 31 + v * 7 + (cracked ? 3 : 0)), tf = m.topFace || [200, 131, 184, 107], md = m.medallion || [200, 124, 58, 37];
      var ex = tf[0] * k, ey = tf[1] * k, erx = tf[2] * k, ery = tf[3] * k;
      x.drawImage(src, 0, 0);
      if (look) {
        if (look.mul) { x.globalCompositeOperation = 'multiply'; x.fillStyle = look.mul; x.fillRect(0, 0, W, H); }
        if (look.color) { x.globalCompositeOperation = 'color'; x.globalAlpha = look.ca; x.fillStyle = look.color; x.fillRect(0, 0, W, H); x.globalAlpha = 1; }
        if (look.screen) { x.globalCompositeOperation = 'screen'; x.fillStyle = look.screen; x.fillRect(0, 0, W, H); }
        x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0);
      }
      x.globalCompositeOperation = 'source-atop';
      function walk(x0, y0, ang, len, steps) { var pts = [[x0, y0]]; for (var i = 0; i < steps; i++) { ang += (rnd() - 0.5) * 0.9; x0 += Math.cos(ang) * len; y0 += Math.sin(ang) * len * 0.6; pts.push([x0, y0]); } return pts; }
      function stroke(pts, col, w) { x.strokeStyle = col; x.lineWidth = w; x.lineJoin = 'round'; x.lineCap = 'round'; x.beginPath(); pts.forEach(function (p, i) { x[i ? 'lineTo' : 'moveTo'](p[0], p[1]); }); x.stroke(); }
      function onTop() { var a = rnd() * Math.PI * 2, r = 0.35 + rnd() * 0.6; return [ex + Math.cos(a) * erx * r, ey + Math.sin(a) * ery * r]; }
      if (look && look.veins) for (var i = 0; i < look.veins[1]; i++) { var o = onTop(); stroke(walk(o[0], o[1], rnd() * 6.3, 16 * k, 6), look.veins[0], (1 + rnd() * 1.4) * k); }
      if (look && look.moss) {
        for (var j = 0; j < 26; j++) { var a2 = rnd() * Math.PI * 2, rr = 0.82 + rnd() * 0.3, mx = ex + Math.cos(a2) * erx * rr, my = ey + Math.sin(a2) * ery * rr + (Math.sin(a2) > 0 ? rnd() * 50 * k : 0), ms = (10 + rnd() * 22) * k;
          var g = x.createRadialGradient(mx, my, 0, mx, my, ms); g.addColorStop(0, 'rgba(92,140,52,0.85)'); g.addColorStop(0.6, 'rgba(70,112,40,0.5)'); g.addColorStop(1, 'rgba(60,100,30,0)'); x.fillStyle = g; x.fillRect(mx - ms, my - ms, ms * 2, ms * 2); }
        for (var j2 = 0; j2 < 5; j2++) { var o2 = onTop(); stroke(walk(o2[0], o2[1], rnd() * 6.3, 12 * k, 5), 'rgba(40,46,30,0.35)', 2.2 * k); }
      }
      if (look && look.flecks) for (var f = 0; f < 40; f++) { var o3 = onTop(); x.fillStyle = look.flecks; x.globalAlpha = 0.5 + rnd() * 0.5; U.star4(x, o3[0], o3[1], (1.5 + rnd() * 3) * k); x.fill(); x.globalAlpha = 1; }
      if (look && look.ember) for (var e = 0; e < 7; e++) { var o4 = onTop(), pts = walk(o4[0], o4[1], rnd() * 6.3, 15 * k, 7); stroke(pts, 'rgba(255,90,20,0.35)', 7 * k); stroke(pts, look.ember, 2.2 * k); stroke(pts, 'rgba(255,230,150,0.9)', 0.8 * k); }
      if (look && look.pores) for (var q = 0; q < 70; q++) { var o5 = onTop(); x.fillStyle = 'rgba(40,6,4,' + (0.25 + rnd() * 0.35) + ')'; x.beginPath(); x.arc(o5[0], o5[1], (1 + rnd() * 2.6) * k, 0, Math.PI * 2); x.fill(); }
      if (look && look.curse) {
        for (var cu = 0; cu < 14; cu++) { var o6 = onTop(), ms2 = (14 + rnd() * 26) * k, g2 = x.createRadialGradient(o6[0], o6[1], 0, o6[0], o6[1], ms2); g2.addColorStop(0, 'rgba(90,190,110,0.5)'); g2.addColorStop(1, 'rgba(90,190,110,0)'); x.fillStyle = g2; x.fillRect(o6[0] - ms2, o6[1] - ms2, ms2 * 2, ms2 * 2); }
        for (var cv2 = 0; cv2 < 4; cv2++) { var o7 = onTop(), pts2 = walk(o7[0], o7[1], rnd() * 6.3, 14 * k, 6); stroke(pts2, 'rgba(120,255,160,0.28)', 6 * k); stroke(pts2, look.curse, 1.6 * k); }
      }
      if (look && look.frost) {
        for (var fr = 0; fr < 9; fr++) { var o8 = onTop(); stroke(walk(o8[0], o8[1], rnd() * 6.3, 18 * k, 5), 'rgba(255,255,255,0.75)', 1.3 * k); }
        var fg = x.createLinearGradient(0, ey - ery, 0, H); fg.addColorStop(0, 'rgba(255,255,255,0.0)'); fg.addColorStop(0.55, 'rgba(220,245,255,0.18)'); fg.addColorStop(1, 'rgba(160,220,255,0.35)'); x.fillStyle = fg; x.fillRect(0, 0, W, H);
      }
      if (look && look.gloss) { // a broad glossy highlight across the top face
        x.save(); x.translate(ex - erx * 0.25, ey - ery * 0.35); x.rotate(-0.25); x.scale(1, 0.32);
        var gg = x.createRadialGradient(0, 0, 0, 0, 0, erx * 0.7); gg.addColorStop(0, 'rgba(255,255,255,' + 0.38 * look.gloss + ')'); gg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gg; x.fillRect(-erx, -erx, erx * 2, erx * 2); x.restore();
      }
      // variety inside a circle: hairline cracks + chipped rim (v1), grime and soot patina toward the rim (v2)
      if (v === 1) for (var h1 = 0; h1 < 4; h1++) { var o9 = onTop(); stroke(walk(o9[0], o9[1], rnd() * 6.3, 13 * k, 4), 'rgba(40,24,18,0.38)', 1.4 * k); }
      if (v === 2) { x.save(); x.translate(ex, ey); x.scale(1, ery / erx); var pg = x.createRadialGradient(0, 0, erx * 0.55, 0, 0, erx * 1.05); pg.addColorStop(0, 'rgba(30,14,8,0)'); pg.addColorStop(1, 'rgba(30,14,8,0.42)'); x.fillStyle = pg; x.fillRect(-erx * 1.2, -erx * 1.2, erx * 2.4, erx * 2.4); x.restore(); }
      // keep the golden centre medallion untouched (feathered), so the multiplier stays readable on every material
      if (look) {
        var tm = U.canvas(W, H), tx = tm.getContext('2d'); tx.drawImage(src, 0, 0); tx.globalCompositeOperation = 'destination-in';
        tx.save(); tx.translate(md[0] * k, md[1] * k); tx.scale(1, md[3] / md[2]); var mg = tx.createRadialGradient(0, 0, 0, 0, 0, md[2] * k * 1.22); mg.addColorStop(0, '#000'); mg.addColorStop(0.8, '#000'); mg.addColorStop(1, 'rgba(0,0,0,0)'); tx.fillStyle = mg; tx.fillRect(-md[2] * k * 1.5, -md[2] * k * 1.5, md[2] * k * 3, md[2] * k * 3); tx.restore();
        x.globalCompositeOperation = 'source-over'; x.drawImage(tm, 0, 0);
      }
      x.globalCompositeOperation = 'source-over';
      cv.specScale = k;
      return (cache[key] = cv);
    }
    /** cached copy of a sprite lit from below by the lava (white->colour gradient masked by the sprite), half resolution */
    function underlit(name, color) {
      var key = 'ul|' + name + '|' + color; if (cache[key]) return cache[key];
      Object.keys(cache).forEach(function (kk) { if (kk.indexOf('ul|') === 0 && kk.split('|')[2] !== color) delete cache[kk]; });
      var src = img(name), w = Math.max(1, Math.round(src.width / 2)), h = Math.max(1, Math.round(src.height / 2)), cv = U.canvas(w, h), x = cv.getContext('2d');
      x.drawImage(src, 0, 0, w, h); x.globalCompositeOperation = 'source-atop';
      var g = x.createLinearGradient(0, h, 0, h * 0.35); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = '#000'; x.globalAlpha = 1; x.fillRect(0, 0, w, h); x.fillStyle = g; x.fillRect(0, 0, w, h);
      cv.specScale = (src.specScale || src.width / meta(name).w) / 2;
      return (cache[key] = cv);
    }
    // ---------- sprite sequences (assets/anim/<name>/anim.json: WebP atlases, frames row-major) ----------
    // hero_idle + imp_idle load eagerly; everything else loads lazily (on first use, or in a background
    // prefetch after the first paint). Until an anim's sheets are loaded the static sprite is used.
    var anims = {}, animMeta = {}, EAGER = ['hero_idle', 'imp_idle'];
    var PREFETCH = ['hero_jump', 'hero_wave', 'hero_fall', 'hero_soot', 'hero_win', 'imp_cheer', 'imp_giggle', 'hero_impatient', 'hero_nervous', 'hero_idol'];
    var STATIC_REF = { hero: 'hero_idle', imp: 'imp' }; // static sprite whose character size the anims must match
    function family(n) { return n.split('_')[0]; }
    function addAnim(name, a, dir) {
      if (!a || !a.frames || !a.sheets || !a.sheets.length || !a.frameW) return;
      var ref = meta(STATIC_REF[family(name)] || name) || {};
      // spec size of one frame: precomputed by tools/update-manifest.js (character height matched to the static art), else the static size
      var m = { name: name, fps: a.fps || 24, loop: !!a.loop, holdLast: !!a.holdLast, frameW: a.frameW, frameH: a.frameH, cols: a.cols || 1, rows: a.rows || 1, frames: a.frames,
        anchor: a.anchor || ref.anchor || [0.5, 0.95], sheets: a.sheets.map(function (s) { return (a.dir || dir || 'anim/' + name + '/') + s; }),
        perSheet: a.perSheet || 0, airborne: a.airborne || null, landFrame: a.landFrame != null ? a.landFrame : null, exitFrame: a.exitFrame != null ? a.exitFrame : null,
        w: a.w || (a.drawScale ? a.frameW * a.drawScale : 0) || ref.w || a.frameW, h: a.h || (a.w ? a.w * a.frameH / a.frameW : (ref.w ? ref.w * a.frameH / a.frameW : a.frameH)) };
      m.dur = m.frames / m.fps; animMeta[name] = m;
    }
    Object.keys(M.anims || {}).forEach(function (n) { addAnim(n, M.anims[n]); });
    function loadAnim(name) {
      var m = animMeta[name]; if (!m) return null;
      var st = anims[name]; if (st) return st;
      st = anims[name] = { meta: m, sheets: new Array(m.sheets.length), n: 0, ready: false, failed: false };
      m.sheets.forEach(function (src, i) {
        var im = new Image(); im.decoding = 'async';
        im.onload = function () { st.sheets[i] = im; st.n++; if (st.n === m.sheets.length) { st.ready = true; rev++; } };
        im.onerror = function () { if (!st.failed) console.warn('anim sheet missing, using static sprite:', name); st.failed = true; };
        im.src = base + src;
      });
      return st;
    }
    /** loaded anim state or null (kicks off the lazy load on first ask) */
    function anim(name) { var st = anims[name] || loadAnim(name); return st && st.ready && !st.failed ? st : null; }
    function hasAnim(name) { return !!animMeta[name]; }
    /** frame i of an anim -> {img, sx, sy, sw, sh} (atlas source rect) */
    function animCell(st, i) {
      var m = st.meta, per = m.perSheet || m.cols * m.rows, s = Math.min(st.sheets.length - 1, Math.floor(i / per)), j = i - s * per;
      return { img: st.sheets[s], sx: (j % m.cols) * m.frameW, sy: Math.floor(j / m.cols) * m.frameH, sw: m.frameW, sh: m.frameH };
    }
    function startAnims() {
      EAGER.forEach(loadAnim);
      var q = PREFETCH.concat(Object.keys(animMeta)).filter(function (n, i, arr) { return animMeta[n] && arr.indexOf(n) === i && EAGER.indexOf(n) < 0; });
      (function next() { // one at a time, after the first paint, so the eager art and first frames win the bandwidth
        if (!q.length) return; var st = loadAnim(q.shift());
        var iv = setInterval(function () { if (!st || st.ready || st.failed) { clearInterval(iv); setTimeout(next, 120); } }, 100);
      })();
    }
    // http(s) builds can pick up anims added after the manifest was generated (assets/anim/index.json); file:// relies on manifest.js
    function discoverAnims() {
      if (Object.keys(animMeta).length || typeof fetch === 'undefined' || !/^https?:$/.test(location.protocol)) return Promise.resolve();
      return fetch(base + 'anim/index.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (ix) {
        var names = ix && ix.anims ? ix.anims : [];
        return Promise.all(names.map(function (n) {
          return fetch(base + 'anim/' + n + '/anim.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (a) { if (a) addAnim(n, a); }).catch(function () {});
        }));
      }).catch(function () {});
    }
    setTimeout(function () { discoverAnims().then(startAnims); }, 0);
    function audioUrl(name) { var a = M.audio && M.audio[name]; return a && a.src ? base + a.src : null; }
    function stats() { return { loaded: loaded, failed: failed.slice(), fallbacks: Object.keys(M.images || {}).filter(isFallback).length, total: Object.keys(M.images || {}).length }; }
    // pre-render the common fallbacks so the first frames don't stutter
    function warm(names) { names.forEach(function (n) { img(n); }); }
    return { rev: function () { return rev; }, ready: ready, img: img, slabVariant: slabVariant, underlit: underlit, anim: anim, hasAnim: hasAnim, animCell: animCell, animMeta: function (n) { return animMeta[n] || null; }, meta: meta, isFallback: isFallback, tinted: tinted, hazard: hazard, streak: streak, ledge: ledge, bg: bg, band: band, hasBand: hasBand, audioUrl: audioUrl, stats: stats, warm: warm, manifest: M };
  }
  root.LavaAssets = Assets;
})(this);
