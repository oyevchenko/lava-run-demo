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
      Object.keys(cache).forEach(function (k) { if (k === name || k.indexOf(name + '|') === 0 || /^hz|^st|^ledge$/.test(k)) delete cache[k]; });
      if (/^bg_circle_/.test(name)) bgCache = {};
    }
    function meta(name) { var m = M.images[name]; if (m) return m; var s = A.sizes[name] || [256, 256]; return { w: s[0], h: s[1], anchor: [0.5, 0.95] }; }
    function isFallback(name) { return !imgs[name]; }
    /** drawable for a sprite (PNG if present, else code-drawn canvas at a sensible resolution) */
    function img(name) {
      if (imgs[name]) return imgs[name];
      if (cache[name]) return cache[name];
      var m = meta(name), r = Math.min(1, (opts.fallbackMax || 480) / Math.max(m.w, m.h)), cv = U.canvas(m.w * r, m.h * r), ctx = cv.getContext('2d');
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
    function audioUrl(name) { var a = M.audio && M.audio[name]; return a && a.src ? base + a.src : null; }
    function stats() { return { loaded: loaded, failed: failed.slice(), fallbacks: Object.keys(M.images || {}).filter(isFallback).length, total: Object.keys(M.images || {}).length }; }
    // pre-render the common fallbacks so the first frames don't stutter
    function warm(names) { names.forEach(function (n) { img(n); }); }
    return { rev: function () { return rev; }, ready: ready, img: img, meta: meta, isFallback: isFallback, tinted: tinted, hazard: hazard, streak: streak, ledge: ledge, bg: bg, band: band, hasBand: hasBand, audioUrl: audioUrl, stats: stats, warm: warm, manifest: M };
  }
  root.LavaAssets = Assets;
})(this);
