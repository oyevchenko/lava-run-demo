/*
 * Lava Run: Inferno - code-drawn art, part 1: helpers, per-circle palettes, procedural textures, backdrops.
 * Everything here is a FALLBACK for the bitmap assets listed in assets/manifest.json. When a PNG is present
 * the renderer uses it instead. Decorative randomness only (seeded), never game outcomes.
 */
(function (root) {
  'use strict';
  var A = root.LavaArt = root.LavaArt || {};

  // ---------- helpers ----------
  function prng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function lin(ctx, x0, y0, x1, y1, stops) { var g = ctx.createLinearGradient(x0, y0, x1, y1); for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]); return g; }
  function rad(ctx, x, y, r0, r1, stops, x1, y1) { var g = ctx.createRadialGradient(x, y, r0, x1 == null ? x : x1, y1 == null ? y : y1, r1); for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]); return g; }
  function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function poly(ctx, pts) { ctx.beginPath(); for (var i = 0; i < pts.length; i++) ctx[i ? 'lineTo' : 'moveTo'](pts[i][0], pts[i][1]); ctx.closePath(); }
  function hex(c) { c = c.replace('#', ''); if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2]; var n = parseInt(c, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : a) + ')'; }
  function ramp(stops, t) { // stops: array of rgb, evenly spaced
    t = t < 0 ? 0 : t > 1 ? 1 : t; var f = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)); return mix(stops[i], stops[i + 1], f - i);
  }
  function star4(ctx, x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r * .16, y - r * .16, x + r, y); ctx.quadraticCurveTo(x + r * .16, y + r * .16, x, y + r); ctx.quadraticCurveTo(x - r * .16, y + r * .16, x - r, y); ctx.quadraticCurveTo(x - r * .16, y - r * .16, x, y - r); ctx.closePath(); }
  // Greek key (meander) band along a horizontal line, unit u
  function meander(ctx, x0, y, x1, u, color, lw) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw || u * 0.32; ctx.lineJoin = 'miter'; ctx.beginPath();
    for (var x = x0; x + u * 4 <= x1 + 0.01; x += u * 4) {
      ctx.moveTo(x, y + u * 1.5); ctx.lineTo(x, y - u * 1.5); ctx.lineTo(x + u * 3, y - u * 1.5); ctx.lineTo(x + u * 3, y + u * 0.5);
      ctx.lineTo(x + u * 1, y + u * 0.5); ctx.lineTo(x + u * 1, y - u * 0.5); ctx.lineTo(x + u * 2, y - u * 0.5); ctx.moveTo(x, y + u * 1.5); ctx.lineTo(x + u * 4, y + u * 1.5);
    }
    ctx.stroke(); ctx.restore();
  }
  A.util = { prng: prng, canvas: canvas, lin: lin, rad: rad, rr: rr, poly: poly, hex: hex, mix: mix, rgba: rgba, ramp: ramp, star4: star4, meander: meander };

  // ---------- palettes ----------
  // lava: 5-stop ramp dark->hot, fog: horizon haze, sky: cavern top, rock: terrace stone, glow: emissive accent,
  // ledge: walkway stone, slabTint: [rgb, alpha] multiplied over marble, flame: brazier flame colours, amb: ambient particle type
  var P = [
    { name: 'gate', lava: ['#3a0c04', '#a8300a', '#f0701a', '#ffb648', '#fff0b8'], fog: '#5a1a0e', sky: '#1c0806', rock: '#4a2a22', glow: '#ff9a3a', ledge: '#8a7462', slabTint: null, flame: ['#fff2b0', '#ffb030', '#ff5a10'], amb: 'embers' },
    { name: 'limbo', lava: ['#2a1210', '#7a3a24', '#e0843e', '#ffc27a', '#fff3dc'], fog: '#7a6c8a', sky: '#2c2836', rock: '#6a6272', glow: '#ffd2a0', ledge: '#a49aa4', slabTint: ['#d8d0e8', 0.12], flame: ['#fff6d8', '#ffd080', '#ff9a50'], amb: 'mist' },
    { name: 'lust', lava: ['#3a0620', '#901842', '#e8406a', '#ff9a86', '#ffe2cc'], fog: '#6a2048', sky: '#2a0a1e', rock: '#5a2a40', glow: '#ff7aa0', ledge: '#9a7480', slabTint: ['#ffb0c8', 0.12], flame: ['#ffe6f0', '#ff8ab0', '#e8306a'], amb: 'wind' },
    { name: 'gluttony', lava: ['#1e130a', '#4e3218', '#9a6230', '#e0983e', '#ffe0a0'], fog: '#4a4c56', sky: '#181a20', rock: '#3e3a3a', glow: '#ffb05a', ledge: '#7c7470', slabTint: ['#8a7a6a', 0.18], flame: ['#fff0c0', '#ffb048', '#e86a1a'], amb: 'rain' },
    { name: 'greed', lava: ['#3a1a00', '#8e5400', '#e8a412', '#ffdc50', '#fff8c8'], fog: '#6a4410', sky: '#241404', rock: '#5a4020', glow: '#ffd23c', ledge: '#a08a5a', slabTint: ['#ffd87a', 0.14], flame: ['#fffad0', '#ffd23c', '#ff9a10'], amb: 'gold' },
    { name: 'wrath', lava: ['#050d0b', '#0e2a23', '#1e5c48', '#3aa47c', '#bff5d4'], fog: '#1e3a34', sky: '#0a1412', rock: '#24332e', glow: '#5ae0a8', ledge: '#5e6e66', slabTint: ['#6a9a80', 0.2], flame: ['#e8fff0', '#7af0b8', '#20a070'], amb: 'swamp' },
    { name: 'heresy', lava: ['#2a0400', '#7c1404', '#da420a', '#ff8e1e', '#ffe48e'], fog: '#4a140a', sky: '#1e0806', rock: '#4a2018', glow: '#ff7a2a', ledge: '#8a6a5a', slabTint: ['#ff9a6a', 0.1], flame: ['#fff2b0', '#ff9a20', '#ff3a08'], amb: 'embers' },
    { name: 'violence', lava: ['#3a0600', '#a62200', '#ff5c00', '#ffb424', '#fffac8'], fog: '#5a1806', sky: '#260804', rock: '#5a2010', glow: '#ffb020', ledge: '#946652', slabTint: ['#ff8a40', 0.14], flame: ['#ffffd0', '#ffc030', '#ff4a00'], amb: 'firerain' },
    { name: 'fraud', lava: ['#060505', '#1c0e0a', '#4e1c0c', '#c8460e', '#ffaa48'], fog: '#2a1c1a', sky: '#0e0a0a', rock: '#2e2624', glow: '#ff6a20', ledge: '#6a5e58', slabTint: ['#5a4a46', 0.22], flame: ['#ffe8c0', '#ff8a30', '#c8300a'], amb: 'ash' },
    { name: 'treachery', lava: ['#0a1a2e', '#1e4c78', '#5ca4d6', '#c2eaff', '#ffffff'], fog: '#a6d0ee', sky: '#0c1a2e', rock: '#3a5470', glow: '#9ee0ff', ledge: '#b4c8d8', slabTint: ['#cfeaff', 0.28], flame: ['#f0ffff', '#8ad8ff', '#2a7ad8'], amb: 'snow' }
  ];
  P.forEach(function (p) { p.lavaRgb = p.lava.map(hex); p.glowRgb = hex(p.glow); p.fogRgb = hex(p.fog); p.skyRgb = hex(p.sky); p.rockRgb = hex(p.rock); p.ledgeRgb = hex(p.ledge); });
  A.palette = function (c) { return P[c] || P[0]; };
  A.palettes = P;

  // ---------- periodic value noise (tileable) ----------
  function makeNoise(seed) {
    var perm = new Uint8Array(512), g = prng(seed), vals = new Float32Array(256), i;
    for (i = 0; i < 256; i++) { perm[i] = i; vals[i] = g(); }
    for (i = 255; i > 0; i--) { var j = Math.floor(g() * (i + 1)), t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (i = 0; i < 256; i++) perm[i + 256] = perm[i];
    function v(ix, iy, p) { ix = ((ix % p) + p) % p; iy = ((iy % p) + p) % p; return vals[perm[perm[ix & 255] + (iy & 255)]]; }
    function n2(x, y, p) { // periodic with period p lattice cells
      var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      var a = v(ix, iy, p), b = v(ix + 1, iy, p), c = v(ix, iy + 1, p), d = v(ix + 1, iy + 1, p);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    }
    return function fbm(u, v2, base, oct) { // u,v in [0,1)
      var s = 0, amp = 0.5, tot = 0, p = base;
      for (var o = 0; o < oct; o++) { s += amp * n2(u * p, v2 * p, p); tot += amp; amp *= 0.5; p *= 2; }
      return s / tot;
    };
  }

  /** Tileable cellular distance (F2 - F1): ~0 along the borders between crust plates. */
  function makeCells(seed, G) {
    var g = prng(seed), pts = [];
    for (var j = 0; j < G; j++) for (var i = 0; i < G; i++) pts.push([i + 0.15 + g() * 0.7, j + 0.15 + g() * 0.7]);
    return function (u, v) {
      var x = u * G, y = v * G, ix = Math.floor(x), iy = Math.floor(y), f1 = 9, f2 = 9;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var cx = ix + dx, cy = iy + dy, wx = ((cx % G) + G) % G, wy = ((cy % G) + G) % G, q = pts[wy * G + wx];
        var px = q[0] + (cx - wx), py = q[1] + (cy - wy), d = (px - x) * (px - x) + (py - y) * (py - y);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      return [Math.sqrt(f2) - Math.sqrt(f1), Math.sqrt(f1)];
    };
  }
  /** Tileable hazard texture for circle c: dark crust plates split by glowing cracks with a soft bloom halo and a few
   *  molten pools (lava circles), or the original flowing material for the swamp (V) and the ice (IX). */
  A.hazardTexture = function (c, size) {
    size = size || 256; var pal = A.palette(c), cv = canvas(size, size), ctx = cv.getContext('2d');
    var img = ctx.createImageData(size, size), d = img.data, fbm = makeNoise(101 + c * 7);
    var stops = pal.lavaRgb, crusty = c !== 5 && c !== 9;
    var warpK = c === 2 ? 0.55 : c === 9 ? 0.18 : 0.32, veinK = c === 9 ? 9 : c === 5 ? 7 : 5;
    var cells = makeCells(55 + c * 13, c === 4 ? 4 : c === 8 ? 6 : 5), crackW = c === 8 ? 0.035 : 0.05, pool = c === 7 ? 0.56 : c === 8 ? 0.74 : c === 3 ? 0.72 : 0.64;
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      var u = x / size, v = y / size;
      var wx = fbm(u, v, 4, 3), wy = fbm(u + 0.37, v + 0.71, 4, 3);
      var uu = u + (wx - 0.5) * warpK, vv = v + (wy - 0.5) * warpK;
      uu -= Math.floor(uu); vv -= Math.floor(vv);
      var base = fbm(uu, vv, 4, 4), t;
      if (crusty) {
        var cw = cells(uu, vv), e = cw[0], crack = Math.exp(-(e * e) / (crackW * crackW)), halo = Math.exp(-(e * e) / 0.06);
        var plate = 0.04 + 0.13 * base + 0.05 * fbm(uu, vv, 16, 2) - 0.05 * Math.min(1, cw[1] * 1.6); // plates darker toward their middle
        t = plate + 0.2 * halo + 0.78 * crack;
        var m = (base - pool) / 0.12; if (m > 0) t = Math.max(t, 0.5 + Math.min(1, m) * 0.42 + 0.08 * crack); // molten pools
        t = Math.max(0, Math.min(1, t));
      } else {
        var r = fbm(uu, vv, 8, 3), ridge = Math.pow(1 - Math.abs(r * 2 - 1), veinK);
        t = Math.max(0, Math.min(1, (base - 0.3 - (c === 5 ? 0.12 : 0)) / 0.5)); t = t * t * (3 - 2 * t) * 0.62 + ridge * 0.62;
        if (c === 9) t = 0.28 + t * 0.7; // ice stays bright and clear
      }
      var col = ramp(stops, t), o = (y * size + x) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if (c === 9) { // ice: crisp white crack lines
      var g = prng(9); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2;
      for (var k = 0; k < 14; k++) { var x0 = g() * size, y0 = g() * size; ctx.beginPath(); ctx.moveTo(x0, y0); for (var s = 0; s < 4; s++) { x0 += (g() - 0.5) * 60; y0 += (g() - 0.5) * 60; ctx.lineTo(x0, y0); } ctx.stroke(); }
    }
    return cv;
  };
  /** Tileable additive streak layer (bright flowing veins), alpha-only, tinted with the circle glow. */
  A.streakTexture = function (c, size) {
    size = size || 256; var pal = A.palette(c), cv = canvas(size, size), ctx = cv.getContext('2d');
    var img = ctx.createImageData(size, size), d = img.data, fbm = makeNoise(707 + c), hot = pal.lavaRgb[4], warm = pal.lavaRgb[3];
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      var u = x / size, v = y / size;
      var w = fbm(u, v, 2, 3);
      var n = fbm(u, (v + w * 0.4) % 1, 4, 3), ridge = Math.pow(1 - Math.abs(n * 2 - 1), 14);
      var o = (y * size + x) * 4, col = mix(warm, hot, ridge);
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = Math.min(255, ridge * 255 * (c === 5 ? 0.6 : 1));
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  };
  /** Tileable marble texture for the walkway ledges. */
  A.marbleTexture = function (size, tint) {
    size = size || 256; var cv = canvas(size, size), ctx = cv.getContext('2d'), img = ctx.createImageData(size, size), d = img.data, fbm = makeNoise(4242);
    var base = tint || [236, 228, 214];
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      var u = x / size, v = y / size, n = fbm(u, v, 4, 4), vein = Math.pow(1 - Math.abs(Math.sin((u * 2 + n * 3.2) * Math.PI)), 18);
      var shade = 0.86 + n * 0.16 - vein * 0.28, o = (y * size + x) * 4;
      d[o] = base[0] * shade; d[o + 1] = base[1] * shade; d[o + 2] = base[2] * shade; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  };

  // ---------- backdrops (cavern funnel seen from inside), drawn to screen size ----------
  /**
   * w,h = stage size in css px * scale; hy = horizon y (vanishing point). The lava plane covers y > hy,
   * so only the top part matters, but we paint the full height for crossfades.
   */
  A.background = function (c, w, h, hy, scale) {
    var pal = A.palette(c), cv = canvas(w * scale, h * scale), ctx = cv.getContext('2d'), g = prng(31 + c * 13);
    ctx.scale(scale, scale);
    var cx = w / 2, sky = pal.skyRgb, rock = pal.rockRgb, glow = pal.glowRgb, fog = pal.fogRgb;
    ctx.fillStyle = lin(ctx, 0, 0, 0, hy + 40, [[0, rgba(mix(sky, [0, 0, 0], 0.35))], [0.6, rgba(sky)], [1, rgba(mix(sky, glow, 0.45))]]);
    ctx.fillRect(0, 0, w, h);
    // distant glow at the vanishing point (the heart of the funnel)
    ctx.fillStyle = rad(ctx, cx, hy, 0, Math.max(w, hy * 2.2), [[0, rgba(glow, 0.75)], [0.18, rgba(glow, 0.32)], [0.55, rgba(glow, 0.06)], [1, rgba(glow, 0)]]);
    ctx.fillRect(0, 0, w, h);
    // concentric terraces of the funnel, far (small) to near (big): draw big first
    var rings = 11;
    for (var i = rings; i >= 1; i--) {
      var rx = w * 0.07 * Math.pow(1.34, i), ry = rx * 0.34, t = i / rings;
      var stone = mix(rock, sky, 0.15 + t * 0.45), lit = mix(stone, glow, 0.35 * (1 - t));
      ctx.beginPath(); ctx.ellipse(cx, hy + ry * 0.12, rx, ry, 0, Math.PI, 0); ctx.closePath();
      ctx.fillStyle = lin(ctx, 0, hy - ry, 0, hy, [[0, rgba(mix(stone, [0, 0, 0], 0.25))], [0.75, rgba(stone)], [1, rgba(lit)]]); ctx.fill();
      // glowing rim (lava rivulet along the terrace edge)
      ctx.beginPath(); ctx.ellipse(cx, hy + ry * 0.12, rx * 0.985, ry * 0.97, 0, Math.PI * 1.02, Math.PI * 1.98);
      ctx.strokeStyle = rgba(glow, 0.55 * (1 - t) + 0.1); ctx.lineWidth = Math.max(1, 2.4 * (1 - t) + 0.6); ctx.stroke();
      // little silhouettes along the terrace (columns, tombs, spikes ... per circle)
      var n = 5 + i * 2;
      for (var k = 0; k < n; k++) {
        var a = Math.PI + (k + 0.5 + (g() - 0.5) * 0.6) / n * Math.PI, px = cx + Math.cos(a) * rx * 0.96, py = hy + ry * 0.12 + Math.sin(a) * ry * 0.96;
        if (py > hy - 2) continue;
        var sz = Math.max(2, rx * 0.035) * (0.7 + g() * 0.6);
        terraceProp(ctx, c, px, py, sz, mix(stone, [0, 0, 0], 0.45), glow, g);
      }
    }
    // cavern ceiling: stalactites / icicles
    ctx.fillStyle = rgba(mix(sky, [0, 0, 0], 0.55));
    for (var s = 0; s < 22; s++) {
      var x = g() * w, len = 18 + g() * hy * 0.35, wd = 8 + g() * 18;
      ctx.beginPath(); ctx.moveTo(x - wd, 0); ctx.quadraticCurveTo(x - wd * 0.2, len * 0.6, x, len); ctx.quadraticCurveTo(x + wd * 0.2, len * 0.6, x + wd, 0); ctx.fill();
      if (c === 9) { ctx.fillStyle = 'rgba(200,235,255,0.25)'; ctx.fill(); ctx.fillStyle = rgba(mix(sky, [0, 0, 0], 0.55)); }
    }
    // circle-specific atmosphere
    if (c === 1) { for (var m = 0; m < 7; m++) { ctx.fillStyle = rad(ctx, g() * w, hy - g() * hy * 0.6, 0, 60 + g() * 90, [[0, 'rgba(230,224,240,0.22)'], [1, 'rgba(230,224,240,0)']]); ctx.fillRect(0, 0, w, h); } }
    if (c === 2) { ctx.strokeStyle = 'rgba(255,170,200,0.22)'; ctx.lineWidth = 3; for (var q = 0; q < 6; q++) { var yy = hy * (0.2 + g() * 0.7); ctx.beginPath(); ctx.moveTo(-20, yy); ctx.bezierCurveTo(w * 0.3, yy - 40, w * 0.6, yy + 40, w + 20, yy - 10); ctx.stroke(); } }
    if (c === 7) { for (var f = 0; f < 5; f++) { var fx = g() * w; ctx.fillStyle = lin(ctx, 0, 0, 0, hy, [[0, rgba(glow, 0)], [1, rgba(glow, 0.5)]]); ctx.fillRect(fx, 0, 4 + g() * 6, hy); } }
    if (c === 9) { ctx.fillStyle = 'rgba(200,235,255,0.10)'; ctx.fillRect(0, 0, w, hy); }
    // horizon haze
    ctx.fillStyle = lin(ctx, 0, hy - h * 0.12, 0, hy + 6, [[0, rgba(fog, 0)], [1, rgba(fog, 0.55)]]);
    ctx.fillRect(0, hy - h * 0.12, w, h * 0.12 + 6);
    return cv;
  };

  function terraceProp(ctx, c, x, y, s, col, glow, g) {
    ctx.fillStyle = rgba(col);
    if (c === 0 || c === 1 || c === 4) { ctx.fillRect(x - s * 0.35, y - s * 3, s * 0.7, s * 3); ctx.fillRect(x - s * 0.6, y - s * 3.2, s * 1.2, s * 0.35); if (c === 4 && g() < 0.5) { ctx.fillStyle = rgba(glow, 0.8); ctx.fillRect(x - 1, y - s * 3.6, 2, 2); } }
    else if (c === 2) { ctx.beginPath(); ctx.ellipse(x, y - s, s * 0.5, s, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (c === 3) { ctx.beginPath(); ctx.ellipse(x, y - s * 0.6, s * 0.8, s * 0.6, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (c === 5) { ctx.strokeStyle = rgba(col); ctx.lineWidth = Math.max(1, s * 0.25); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - s * 2.6); ctx.lineTo(x - s, y - s * 3.4); ctx.moveTo(x, y - s * 2); ctx.lineTo(x + s * 0.8, y - s * 2.8); ctx.stroke(); }
    else if (c === 6) { ctx.fillRect(x - s, y - s * 0.9, s * 2, s * 0.9); ctx.fillStyle = rgba(glow, 0.85); ctx.beginPath(); ctx.moveTo(x - s * 0.6, y - s * 0.9); ctx.quadraticCurveTo(x, y - s * 3, x + s * 0.6, y - s * 0.9); ctx.fill(); }
    else if (c === 7) { ctx.beginPath(); ctx.moveTo(x - s * 0.8, y); ctx.lineTo(x, y - s * 3); ctx.lineTo(x + s * 0.8, y); ctx.fill(); ctx.fillStyle = rgba(glow, 0.7); ctx.fillRect(x - 0.8, y - s * 3, 1.6, s * 1.4); }
    else if (c === 8) { ctx.lineWidth = Math.max(1, s * 0.5); ctx.strokeStyle = rgba(col); ctx.beginPath(); ctx.arc(x, y, s * 1.6, Math.PI, 0); ctx.stroke(); }
    else if (c === 9) { ctx.fillStyle = 'rgba(210,240,255,0.55)'; ctx.beginPath(); ctx.moveTo(x - s * 0.5, y); ctx.lineTo(x, y - s * 3.4); ctx.lineTo(x + s * 0.5, y); ctx.fill(); }
  }

  // soft additive glow sprite (white core -> colour -> transparent), cached by colour
  var glowCache = {};
  A.glow = function (color, size) {
    var key = color + size; if (glowCache[key]) return glowCache[key];
    size = size || 128; var cv = canvas(size, size), ctx = cv.getContext('2d'), c = hex(color);
    ctx.fillStyle = rad(ctx, size / 2, size / 2, 0, size / 2, [[0, rgba(mix(c, [255, 255, 255], 0.6), 1)], [0.25, rgba(c, 0.55)], [0.6, rgba(c, 0.16)], [1, rgba(c, 0)]]);
    ctx.fillRect(0, 0, size, size);
    return (glowCache[key] = cv);
  };
})(this);
