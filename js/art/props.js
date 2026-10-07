/*
 * Lava Run: Inferno - code-drawn props (fallbacks for slab/idol/column/brazier/imp/coin/arch/props PNGs).
 * Each draw function paints in the pixel space of its asset spec (A.sizes[name]).
 */
(function (root) {
  'use strict';
  var A = root.LavaArt, U = A.util;
  A.draw = A.draw || {};
  var D = A.draw;
  var OUT = '#4e3020', MARBLE = ['#fffaf0', '#efe4d2', '#cdbda4', '#9c8a74'], GOLD = ['#fff6c0', '#ffd23c', '#e09a12', '#8a5208'];
  var BR = ['#ffe9a8', '#c9923c', '#7a4c18'];
  function ol(ctx, w) { ctx.strokeStyle = OUT; ctx.lineWidth = w || 4; ctx.lineJoin = 'round'; ctx.stroke(); }
  function fillOl(ctx, f, w) { ctx.fillStyle = f; ctx.fill(); ol(ctx, w); }

  // ---------- sizes (must match the manifest / ASSET_SPECS) ----------
  A.sizes = {
    slab_marble: [400, 300], slab_cracked: [400, 300], gate_dais: [560, 360], idol: [256, 320], coin: [96, 96],
    column: [220, 640], column_broken: [220, 480], brazier: [200, 260], imp: [192, 192], imp_cheer: [192, 192], imp_giggle: [192, 192],
    gate_arch: [640, 520], exit_stars: [400, 400],
    prop_c1: [320, 400], prop_c2: [320, 400], prop_c3: [320, 400], prop_c4: [320, 400], prop_c5: [320, 400], prop_c6: [320, 400], prop_c7: [320, 400], prop_c8: [320, 400], prop_c9: [320, 400]
  };
  A.heroPoses && A.heroPoses.forEach(function (n) { A.sizes[n] = [512, 640]; });

  // ---------- marble slab (3/4 view). Top-face centre at (200,125) ----------
  function octa(cx, cy, rx, ry) { var pts = []; for (var i = 0; i < 8; i++) { var a = (i + 0.5) / 8 * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return pts; }
  function roundPoly(ctx, pts, t) {
    ctx.beginPath(); var n = pts.length;
    for (var i = 0; i < n; i++) { var p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      var s = [p[0] + (a[0] - p[0]) * t, p[1] + (a[1] - p[1]) * t], e = [p[0] + (b[0] - p[0]) * t, p[1] + (b[1] - p[1]) * t];
      ctx[i ? 'lineTo' : 'moveTo'](s[0], s[1]); ctx.quadraticCurveTo(p[0], p[1], e[0], e[1]); }
    ctx.closePath();
  }
  function slab(ctx, cracked) {
    var cx = 200, cy = 124, rx = 184, ry = 100, th = 54, top = octa(cx, cy, rx, ry);
    // soft contact shadow / lava glow under the slab
    ctx.fillStyle = U.rad(ctx, cx, cy + th + 30, 10, 200, [[0, 'rgba(255,170,60,0.0)'], [1, 'rgba(255,120,30,0)']]);
    // side faces
    var low = top.slice(0, 4).concat([]), side = [];
    roundPoly(ctx, top.map(function (p) { return [p[0], p[1] + th]; }), 0.22);
    fillOl(ctx, U.lin(ctx, 0, cy, 0, cy + ry + th, [[0, MARBLE[2]], [0.55, MARBLE[3]], [1, '#a2643a']]), 5);
    ctx.fillStyle = U.lin(ctx, 0, cy, 0, cy + ry + th, [[0, MARBLE[2]], [0.55, MARBLE[3]], [1, '#b0703c']]);
    ctx.fillRect(cx - rx * 0.92 + 2, cy, rx * 1.84 - 4, th);
    // vertical block joints on the side
    ctx.strokeStyle = 'rgba(70,45,30,0.35)'; ctx.lineWidth = 3;
    [-0.62, -0.2, 0.22, 0.64].forEach(function (f) { var x = cx + f * rx, y = cy + Math.sqrt(Math.max(0, 1 - f * f)) * ry * 0.92; ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x, y + th - 2); ctx.stroke(); });
    // lava bounce light on the side
    ctx.fillStyle = U.lin(ctx, 0, cy + ry * 0.4, 0, cy + ry + th, [[0, 'rgba(255,150,50,0)'], [1, 'rgba(255,130,40,0.45)']]);
    roundPoly(ctx, top.map(function (p) { return [p[0], p[1] + th]; }), 0.22); ctx.fill();
    // top face
    roundPoly(ctx, top, 0.22);
    fillOl(ctx, U.lin(ctx, cx - rx, cy - ry, cx + rx * 0.6, cy + ry, [[0, MARBLE[0]], [0.6, MARBLE[1]], [1, MARBLE[2]]]), 5);
    ctx.save(); roundPoly(ctx, top, 0.22); ctx.clip();
    // marble veins
    var g = U.prng(cracked ? 7 : 3); ctx.strokeStyle = 'rgba(120,110,120,0.22)'; ctx.lineWidth = 2;
    for (var v = 0; v < 6; v++) { ctx.beginPath(); var x = cx - rx + g() * rx * 2, y = cy - ry + g() * ry * 2; ctx.moveTo(x, y); ctx.bezierCurveTo(x + 60, y + (g() - 0.5) * 60, x + 100, y + (g() - 0.5) * 70, x + 170, y + (g() - 0.5) * 50); ctx.stroke(); }
    // carved border ring + meander dots
    roundPoly(ctx, octa(cx, cy, rx * 0.84, ry * 0.8), 0.25); ctx.strokeStyle = 'rgba(110,80,50,0.45)'; ctx.lineWidth = 4; ctx.stroke();
    roundPoly(ctx, octa(cx, cy + 2, rx * 0.84, ry * 0.8), 0.25); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
    roundPoly(ctx, octa(cx, cy, rx * 0.7, ry * 0.66), 0.25); ctx.strokeStyle = 'rgba(110,80,50,0.32)'; ctx.lineWidth = 3; ctx.stroke();
    for (var k = 0; k < 24; k++) { var a = k / 24 * Math.PI * 2; ctx.save(); ctx.translate(cx + Math.cos(a) * rx * 0.77, cy + Math.sin(a) * ry * 0.73); ctx.rotate(a);
      ctx.strokeStyle = 'rgba(150,110,60,0.5)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-5, 4); ctx.lineTo(-5, -4); ctx.lineTo(5, -4); ctx.lineTo(5, 2); ctx.lineTo(0, 2); ctx.stroke(); ctx.restore(); }
    // central recessed medallion (multiplier sits here)
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.46, ry * 0.42, 0, 0, Math.PI * 2);
    ctx.fillStyle = U.lin(ctx, 0, cy - ry * 0.42, 0, cy + ry * 0.42, [[0, 'rgba(150,120,90,0.35)'], [1, 'rgba(255,255,255,0.25)']]); ctx.fill();
    ctx.strokeStyle = 'rgba(110,80,50,0.4)'; ctx.lineWidth = 3; ctx.stroke();
    // specular sheen
    ctx.fillStyle = U.rad(ctx, cx - rx * 0.4, cy - ry * 0.5, 4, rx * 0.8, [[0, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    if (cracked) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var cracks = [[[200, 124], [168, 98], [130, 104], [96, 70]], [[200, 124], [236, 150], [262, 146], [300, 178]], [[200, 124], [214, 92], [250, 82], [268, 46]], [[200, 124], [176, 160], [150, 168], [118, 196]]];
      [['rgba(255,120,20,0.55)', 14], ['#ffb030', 7], ['#fff3b0', 3]].forEach(function (st) {
        ctx.strokeStyle = st[0]; ctx.lineWidth = st[1];
        cracks.forEach(function (c) { ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (var i = 1; i < c.length; i++) ctx.lineTo(c[i][0], c[i][1]); ctx.stroke(); });
      });
    }
    ctx.restore();
    // bright rim on the upper edge
    ctx.save(); roundPoly(ctx, top, 0.22); ctx.clip(); roundPoly(ctx, top.map(function (p) { return [p[0], p[1] + 5]; }), 0.22); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
  }
  D.slab_marble = function (ctx) { slab(ctx, false); };
  D.slab_cracked = function (ctx) { slab(ctx, true); };
  A.slabTop = [200, 124]; A.slabRadius = [184, 100];

  // ---------- gate dais (start platform), top centre (280,150) ----------
  D.gate_dais = function (ctx) {
    var cx = 280, cy = 140, rx = 262, ry = 118, th = 70;
    ctx.beginPath(); ctx.ellipse(cx, cy + th, rx, ry, 0, 0, Math.PI * 2); fillOl(ctx, U.lin(ctx, 0, cy, 0, cy + ry + th, [[0, MARBLE[2]], [1, '#9a6038']]), 5);
    ctx.fillStyle = U.lin(ctx, 0, cy, 0, cy + th + ry, [[0, MARBLE[2]], [1, '#9a6038']]); ctx.fillRect(cx - rx, cy, rx * 2, th);
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy + th, rx, ry, 0, 0, Math.PI); ctx.lineTo(cx - rx, cy); ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.clip();
    ctx.fillStyle = BR[2]; ctx.fillRect(0, cy + ry + 12, 560, 30);
    U.meander(ctx, 8, cy + ry + 27, 552, 6, BR[0], 3); ctx.restore();
    ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - rx, cy); ctx.lineTo(cx - rx, cy + th); ctx.moveTo(cx + rx, cy); ctx.lineTo(cx + rx, cy + th); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); fillOl(ctx, U.lin(ctx, cx - rx, cy - ry, cx + rx, cy + ry, [[0, MARBLE[0]], [1, MARBLE[2]]]), 5);
    // mosaic rings
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.78, ry * 0.76, 0, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(160,40,40,0.55)'; ctx.lineWidth = 12; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.5, ry * 0.48, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(230,180,80,0.35)'; ctx.fill(); ctx.strokeStyle = 'rgba(150,100,40,0.6)'; ctx.lineWidth = 4; ctx.stroke();
    for (var i = 0; i < 28; i++) { var a = i / 28 * Math.PI * 2; ctx.save(); ctx.translate(cx + Math.cos(a) * rx * 0.64, cy + Math.sin(a) * ry * 0.62); ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 14, 0.5, 0, Math.PI * 2); ctx.fillStyle = '#5a8a3a'; ctx.fill(); ctx.restore(); }
    ctx.fillStyle = U.rad(ctx, cx - rx * 0.4, cy - ry * 0.5, 4, rx, [[0, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };

  // ---------- golden idol: winged figure with halo ----------
  D.idol = function (ctx, w, h, noGlow) {
    var g = function (x0, y0, x1, y1) { return U.lin(ctx, x0, y0, x1, y1, [[0, GOLD[0]], [0.35, GOLD[1]], [0.75, GOLD[2]], [1, GOLD[3]]]); };
    var IO = '#6a3c04';
    if (!noGlow) { ctx.fillStyle = U.rad(ctx, 128, 140, 10, 130, [[0, 'rgba(255,240,150,0.7)'], [1, 'rgba(255,200,60,0)']]); ctx.fillRect(0, 0, 256, 320); }
    // halo rays
    ctx.save(); ctx.translate(128, 92);
    for (var i = 0; i < 16; i++) { ctx.rotate(Math.PI / 8); ctx.beginPath(); ctx.moveTo(-5, -30); ctx.lineTo(0, -62 - (i % 2) * 12); ctx.lineTo(5, -30); ctx.closePath(); ctx.fillStyle = GOLD[1]; ctx.fill(); ctx.strokeStyle = IO; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); ctx.fillStyle = g(-38, -38, 38, 38); ctx.fill(); ctx.strokeStyle = IO; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
    // wings
    [-1, 1].forEach(function (s) {
      ctx.save(); ctx.translate(128 + s * 22, 150); ctx.scale(s, 1);
      for (var f = 0; f < 5; f++) { ctx.beginPath(); ctx.ellipse(28 + f * 12, -10 - f * 8 + f * f * 1.5, 34 - f * 3, 12, -0.6 - f * 0.12, 0, Math.PI * 2); ctx.fillStyle = g(0, -60, 90, 20); ctx.fill(); ctx.strokeStyle = IO; ctx.lineWidth = 2.5; ctx.stroke(); }
      ctx.restore();
    });
    // robe body
    ctx.beginPath(); ctx.moveTo(104, 140); ctx.quadraticCurveTo(128, 128, 152, 140); ctx.quadraticCurveTo(166, 210, 178, 262); ctx.quadraticCurveTo(128, 276, 78, 262); ctx.quadraticCurveTo(90, 210, 104, 140); ctx.closePath();
    ctx.fillStyle = g(78, 130, 178, 270); ctx.fill(); ctx.strokeStyle = IO; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(120,70,8,0.5)'; ctx.lineWidth = 3; [[112, 160, 100, 258], [128, 158, 128, 266], [144, 160, 156, 258]].forEach(function (l) { ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.quadraticCurveTo((l[0] + l[2]) / 2 + 4, (l[1] + l[3]) / 2, l[2], l[3]); ctx.stroke(); });
    // ruby
    ctx.beginPath(); ctx.arc(128, 160, 8, 0, Math.PI * 2); ctx.fillStyle = U.rad(ctx, 125, 157, 1, 9, [[0, '#ffb0b0'], [0.5, '#e01830'], [1, '#7a0010']]); ctx.fill(); ctx.strokeStyle = IO; ctx.lineWidth = 2; ctx.stroke();
    // head
    ctx.beginPath(); ctx.arc(128, 104, 24, 0, Math.PI * 2); ctx.fillStyle = g(104, 80, 152, 128); ctx.fill(); ctx.strokeStyle = IO; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = IO; ctx.beginPath(); ctx.arc(120, 104, 2.6, 0, Math.PI * 2); ctx.arc(136, 104, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = IO; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(128, 110, 7, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    // pedestal
    U.rr(ctx, 70, 262, 116, 18, 5); ctx.fillStyle = g(70, 262, 186, 280); ctx.fill(); ctx.strokeStyle = IO; ctx.lineWidth = 3; ctx.stroke();
    U.rr(ctx, 84, 280, 88, 26, 5); ctx.fillStyle = g(84, 280, 172, 306); ctx.fill(); ctx.stroke();
    U.meander(ctx, 90, 293, 166, 3.2, 'rgba(110,60,6,0.8)', 1.8);
    // highlights
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; U.star4(ctx, 112, 92, 9); ctx.fill(); U.star4(ctx, 160, 200, 6); ctx.fill();
  };

  // ---------- coin ----------
  D.coin = function (ctx) {
    ctx.beginPath(); ctx.arc(48, 50, 42, 0, Math.PI * 2); ctx.fillStyle = GOLD[3]; ctx.fill();
    ctx.beginPath(); ctx.arc(48, 46, 42, 0, Math.PI * 2); ctx.fillStyle = U.lin(ctx, 10, 6, 86, 88, [[0, GOLD[0]], [0.4, GOLD[1]], [1, GOLD[2]]]); ctx.fill(); ctx.strokeStyle = '#7a4608'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(48, 46, 32, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(140,80,8,0.7)'; ctx.lineWidth = 3; ctx.stroke();
    for (var i = 0; i < 12; i++) { var a = Math.PI * 0.62 + i / 11 * Math.PI * 1.76; ctx.save(); ctx.translate(48 + Math.cos(a) * 24, 46 + Math.sin(a) * 24); ctx.rotate(a + 0.6); ctx.beginPath(); ctx.ellipse(0, 0, 3, 7, 0, 0, Math.PI * 2); ctx.fillStyle = '#b8780e'; ctx.fill(); ctx.restore(); }
    ctx.fillStyle = '#a86a08'; U.star4(ctx, 48, 46, 13); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(34, 26, 12, 6, -0.6, 0, Math.PI * 2); ctx.fill();
  };

  // ---------- Ionic column ----------
  function marbleShaft(ctx, x, y, w, h) {
    ctx.fillStyle = U.lin(ctx, x, 0, x + w, 0, [[0, MARBLE[2]], [0.3, MARBLE[0]], [0.65, MARBLE[1]], [1, MARBLE[3]]]); ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(110,90,70,0.35)'; ctx.lineWidth = 3; for (var f = 1; f < 7; f++) { var fx = x + w * f / 7; ctx.beginPath(); ctx.moveTo(fx, y); ctx.lineTo(fx, y + h); ctx.stroke(); }
    ctx.fillStyle = U.lin(ctx, 0, y + h * 0.6, 0, y + h, [[0, 'rgba(255,140,40,0)'], [1, 'rgba(255,130,40,0.35)']]); ctx.fillRect(x, y + h * 0.6, w, h * 0.4);
  }
  function base(ctx, cx, y, s) {
    U.rr(ctx, cx - 96 * s, y + 26 * s, 192 * s, 32 * s, 4); fillOl(ctx, U.lin(ctx, 0, y + 26 * s, 0, y + 58 * s, [[0, MARBLE[1]], [1, MARBLE[3]]]));
    U.rr(ctx, cx - 78 * s, y, 156 * s, 28 * s, 12 * s); fillOl(ctx, U.lin(ctx, 0, y, 0, y + 28 * s, [[0, MARBLE[0]], [1, MARBLE[2]]]));
  }
  D.column = function (ctx) {
    base(ctx, 110, 560, 1);
    marbleShaft(ctx, 52, 120, 116, 442); ctx.beginPath(); ctx.rect(52, 120, 116, 442); ol(ctx);
    // capital
    U.rr(ctx, 46, 100, 128, 24, 8); fillOl(ctx, U.lin(ctx, 0, 100, 0, 124, [[0, MARBLE[0]], [1, MARBLE[2]]]));
    [[46, 96], [174, 96]].forEach(function (v, i) { ctx.beginPath(); ctx.arc(v[0], v[1], 26, 0, Math.PI * 2); fillOl(ctx, U.rad(ctx, v[0] - 6, v[1] - 6, 2, 28, [[0, MARBLE[0]], [1, MARBLE[2]]]));
      ctx.beginPath(); for (var t = 0; t < 14; t += 0.2) { var r = 22 - t * 1.5; ctx.lineTo(v[0] + Math.cos(t * (i ? -1 : 1)) * r, v[1] + Math.sin(t) * r); } ctx.strokeStyle = 'rgba(110,80,50,0.55)'; ctx.lineWidth = 2.5; ctx.stroke(); });
    U.rr(ctx, 14, 58, 192, 22, 4); fillOl(ctx, U.lin(ctx, 0, 58, 0, 80, [[0, MARBLE[0]], [1, MARBLE[2]]]));
    U.meander(ctx, 26, 69, 194, 3.6, 'rgba(150,110,60,0.65)', 2);
    // weathering chips
    ctx.fillStyle = 'rgba(120,100,80,0.3)'; [[70, 260, 8], [140, 410, 6], [90, 480, 10]].forEach(function (c) { ctx.beginPath(); ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2); ctx.fill(); });
  };
  D.column_broken = function (ctx) {
    base(ctx, 110, 400, 1);
    ctx.save(); U.poly(ctx, [[52, 402], [52, 170], [70, 150], [86, 176], [104, 128], [124, 168], [146, 140], [168, 190], [168, 402]]); ctx.clip();
    marbleShaft(ctx, 52, 120, 116, 284); ctx.restore();
    U.poly(ctx, [[52, 402], [52, 170], [70, 150], [86, 176], [104, 128], [124, 168], [146, 140], [168, 190], [168, 402]]); ol(ctx);
    // broken top face
    U.poly(ctx, [[52, 170], [70, 150], [86, 176], [104, 128], [124, 168], [146, 140], [168, 190], [140, 196], [100, 194], [70, 188]]); fillOl(ctx, U.lin(ctx, 0, 128, 0, 196, [[0, MARBLE[1]], [1, MARBLE[3]]]), 3);
    // fallen chunk
    ctx.save(); ctx.translate(176, 446); ctx.rotate(0.35); U.rr(ctx, -34, -22, 68, 40, 8); fillOl(ctx, U.lin(ctx, -34, 0, 34, 0, [[0, MARBLE[1]], [1, MARBLE[3]]])); ctx.restore();
    // laurel sprig
    ctx.strokeStyle = '#5a7a2a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(60, 330); ctx.quadraticCurveTo(80, 300, 110, 290); ctx.stroke();
    for (var i = 0; i < 5; i++) { ctx.save(); ctx.translate(66 + i * 10, 320 - i * 7); ctx.rotate(-0.8 + (i % 2) * 1.6); ctx.beginPath(); ctx.ellipse(0, -9, 5, 11, 0, 0, Math.PI * 2); ctx.fillStyle = '#7aa83a'; ctx.fill(); ctx.restore(); }
  };

  // ---------- bronze tripod brazier (flame is animated by the renderer at A.brazierFlame) ----------
  D.brazier = function (ctx) {
    var bronze = function (x0, x1) { return U.lin(ctx, x0, 0, x1, 0, [[0, BR[2]], [0.35, BR[0]], [0.7, BR[1]], [1, BR[2]]]); };
    ctx.lineCap = 'round';
    [[-1, 60], [0, 100], [1, 140]].forEach(function (l) {
      ctx.strokeStyle = OUT; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(100 + l[0] * 30, 140); ctx.quadraticCurveTo(100 + l[0] * 70, 200, l[1] + l[0] * 20, 246); ctx.stroke();
      ctx.strokeStyle = BR[1]; ctx.lineWidth = 9; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(l[1] + l[0] * 20, 248, 12, 7, 0, 0, Math.PI * 2); fillOl(ctx, BR[1], 3);
    });
    U.rr(ctx, 70, 136, 60, 16, 6); fillOl(ctx, bronze(70, 130));
    // bowl
    ctx.beginPath(); ctx.moveTo(14, 100); ctx.quadraticCurveTo(24, 150, 100, 150); ctx.quadraticCurveTo(176, 150, 186, 100); ctx.closePath(); fillOl(ctx, bronze(14, 186), 5);
    ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(80,40,10,0.55)'; ctx.fillRect(0, 108, 200, 16); U.meander(ctx, 22, 116, 180, 3.2, BR[0], 2); ctx.restore();
    ctx.beginPath(); ctx.ellipse(100, 100, 88, 20, 0, 0, Math.PI * 2); fillOl(ctx, bronze(12, 188), 5);
    ctx.beginPath(); ctx.ellipse(100, 101, 74, 13, 0, 0, Math.PI * 2); ctx.fillStyle = U.rad(ctx, 100, 100, 4, 74, [[0, '#fff2a0'], [0.4, '#ff9a20'], [1, '#7a1e04']]); ctx.fill();
    var g = U.prng(5); for (var i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(46 + g() * 108, 96 + g() * 10, 4 + g() * 5, 0, Math.PI * 2); ctx.fillStyle = g() < 0.5 ? '#3a1408' : '#ffcf5a'; ctx.fill(); }
  };
  A.brazierFlame = [100, 96];

  // ---------- imp (cute, mischievous) ----------
  function imp(ctx, mode) {
    var RED = ['#ff8a72', '#e8384a', '#9a1028'], IO = '#4a0a14';
    var fill = function (f, w) { ctx.fillStyle = f; ctx.fill(); ctx.strokeStyle = IO; ctx.lineWidth = w || 4; ctx.lineJoin = 'round'; ctx.stroke(); };
    // wings
    [-1, 1].forEach(function (s) { ctx.save(); ctx.translate(96 + s * 26, 112); ctx.scale(s, 1); ctx.rotate(mode === 'cheer' ? -0.3 : 0);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(30, -40, 64, -30); ctx.quadraticCurveTo(54, -16, 60, -6); ctx.quadraticCurveTo(46, -8, 44, 6); ctx.quadraticCurveTo(30, 0, 24, 14); ctx.closePath(); fill('#7a1a3a', 3.5); ctx.restore(); });
    // tail
    ctx.strokeStyle = IO; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(110, 150); ctx.bezierCurveTo(150, 170, 170, 130, 150, 116); ctx.stroke();
    ctx.strokeStyle = RED[1]; ctx.lineWidth = 5; ctx.stroke(); U.poly(ctx, [[150, 104], [162, 120], [142, 122]]); fill(RED[1], 3);
    // body
    ctx.beginPath(); ctx.ellipse(96, 140, 30, 32, 0, 0, Math.PI * 2); fill(U.rad(ctx, 88, 128, 4, 36, [[0, RED[0]], [0.6, RED[1]], [1, RED[2]]]));
    ctx.beginPath(); ctx.ellipse(96, 146, 17, 18, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,200,170,0.55)'; ctx.fill();
    // feet
    [[80, 172], [112, 172]].forEach(function (f) { ctx.beginPath(); ctx.ellipse(f[0], f[1], 11, 7, 0, 0, Math.PI * 2); fill(RED[2], 3); });
    // arms
    var arms = mode === 'cheer' ? [[70, 128, 44, 82], [122, 128, 148, 82]] : mode === 'giggle' ? [[72, 132, 84, 98], [120, 132, 108, 98]] : [[70, 130, 56, 156], [122, 130, 136, 156]];
    arms.forEach(function (a) { ctx.strokeStyle = IO; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[2], a[3]); ctx.stroke(); ctx.strokeStyle = RED[1]; ctx.lineWidth = 7; ctx.stroke();
      ctx.beginPath(); ctx.arc(a[2], a[3], 7.5, 0, Math.PI * 2); fill(RED[1], 3); });
    // head
    [[64, 50, 54, 26], [128, 50, 138, 26]].forEach(function (h) { U.poly(ctx, [[h[0] - 9, h[1] + 8], [h[2], h[3]], [h[0] + 9, h[1] + 4]]); fill('#fff0d0', 3); });
    [[46, 82], [146, 82]].forEach(function (e, i) { U.poly(ctx, [[e[0] + (i ? -10 : 10), e[1] - 10], [e[0] + (i ? 14 : -14), e[1] - 18], [e[0] + (i ? -6 : 6), e[1] + 8]]); fill(RED[1], 3); });
    ctx.beginPath(); ctx.ellipse(96, 82, 46, 42, 0, 0, Math.PI * 2); fill(U.rad(ctx, 84, 66, 6, 52, [[0, RED[0]], [0.6, RED[1]], [1, RED[2]]]));
    // face
    if (mode === 'giggle') { ctx.strokeStyle = IO; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.arc(78, 80, 9, 1.1 * Math.PI, 1.9 * Math.PI); ctx.moveTo(123, 80); ctx.arc(114, 80, 9, 1.1 * Math.PI, 1.9 * Math.PI); ctx.stroke(); }
    else { [[78, 78], [114, 78]].forEach(function (e) { ctx.beginPath(); ctx.ellipse(e[0], e[1], 11, 13, 0, 0, Math.PI * 2); fill('#fffbe8', 3); ctx.beginPath(); ctx.arc(e[0] + 2, e[1] + 2, 6, 0, Math.PI * 2); ctx.fillStyle = '#2a0a0a'; ctx.fill(); ctx.beginPath(); ctx.arc(e[0], e[1] - 1, 2.2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); });
      ctx.strokeStyle = IO; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(66, 62); ctx.lineTo(86, 68); ctx.moveTo(126, 62); ctx.lineTo(106, 68); ctx.stroke(); }
    if (mode !== 'giggle') { ctx.beginPath(); ctx.moveTo(76, 100); ctx.quadraticCurveTo(96, 118, 118, 98); ctx.quadraticCurveTo(98, 110, 76, 100); ctx.closePath(); fill('#5a0a14', 3);
      U.poly(ctx, [[104, 104], [110, 103], [107, 112]]); ctx.fillStyle = '#fff'; ctx.fill(); }
    ctx.fillStyle = 'rgba(255,180,160,0.5)'; ctx.beginPath(); ctx.ellipse(64, 96, 8, 5, 0, 0, Math.PI * 2); ctx.ellipse(128, 96, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  D.imp = function (ctx) { imp(ctx, 'idle'); };
  D.imp_cheer = function (ctx) { imp(ctx, 'cheer'); };
  D.imp_giggle = function (ctx) { imp(ctx, 'giggle'); };

  // ---------- circle gate arch (plaque text drawn live at A.archPlaque) ----------
  D.gate_arch = function (ctx) {
    var cx = 320, cy = 262;
    ctx.beginPath(); ctx.arc(cx, cy, 252, Math.PI, 0); ctx.lineTo(cx + 192, cy); ctx.arc(cx, cy, 192, 0, Math.PI, true); ctx.closePath();
    fillOl(ctx, U.lin(ctx, 0, 10, 0, cy, [[0, MARBLE[0]], [1, MARBLE[2]]]), 5);
    ctx.strokeStyle = 'rgba(110,80,50,0.45)'; ctx.lineWidth = 3;
    for (var i = 1; i < 13; i++) { var a = Math.PI + i / 13 * Math.PI; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 194, cy + Math.sin(a) * 194); ctx.lineTo(cx + Math.cos(a) * 250, cy + Math.sin(a) * 250); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(cx, cy, 236, Math.PI, 0); ctx.strokeStyle = 'rgba(160,110,50,0.5)'; ctx.lineWidth = 4; ctx.stroke();
    // pillars
    [[60, 128], [512, 580]].forEach(function (p) { marbleShaft(ctx, p[0], cy - 2, p[1] - p[0], 222); ctx.beginPath(); ctx.rect(p[0], cy - 2, p[1] - p[0], 222); ol(ctx);
      U.rr(ctx, p[0] - 12, cy - 16, p[1] - p[0] + 24, 20, 4); fillOl(ctx, MARBLE[1]); U.rr(ctx, p[0] - 16, 480, p[1] - p[0] + 32, 30, 4); fillOl(ctx, U.lin(ctx, 0, 480, 0, 510, [[0, MARBLE[1]], [1, MARBLE[3]]])); });
    // keystone + bronze plaque
    U.poly(ctx, [[292, 4], [348, 4], [338, 72], [302, 72]]); fillOl(ctx, U.lin(ctx, 0, 4, 0, 72, [[0, MARBLE[0]], [1, MARBLE[2]]]));
    U.rr(ctx, 236, 34, 168, 66, 10); fillOl(ctx, U.lin(ctx, 0, 34, 0, 100, [[0, '#d2343e'], [1, '#7e1427']]), 5);
    U.rr(ctx, 236, 34, 168, 66, 10); ctx.strokeStyle = '#f2c445'; ctx.lineWidth = 5; ctx.stroke();
    // laurel sprigs on the arch
    [-1, 1].forEach(function (s) { for (var k = 0; k < 6; k++) { var a = Math.PI * 1.5 + s * (0.28 + k * 0.1); ctx.save(); ctx.translate(cx + Math.cos(a) * 222, cy + Math.sin(a) * 222); ctx.rotate(a + Math.PI / 2 + s * 0.4);
      ctx.beginPath(); ctx.ellipse(0, -8, 6, 13, 0, 0, Math.PI * 2); ctx.fillStyle = U.lin(ctx, 0, -20, 0, 4, [[0, '#fff3a6'], [1, '#b8861c']]); ctx.fill(); ctx.restore(); } });
  };
  A.archPlaque = [320, 68];

  // ---------- exit to the stars (end of the descent) ----------
  D.exit_stars = function (ctx) {
    var cx = 200, cy = 200, g = U.prng(11);
    ctx.beginPath(); ctx.arc(cx, cy, 186, 0, Math.PI * 2); ctx.fillStyle = U.rad(ctx, cx, cy, 150, 190, [[0, '#2a3a5a'], [1, 'rgba(20,30,50,0)']]); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 160, 0, Math.PI * 2); ctx.fillStyle = U.rad(ctx, cx, cy - 40, 10, 170, [[0, '#4a6ac8'], [0.6, '#22306a'], [1, '#121838']]); ctx.fill();
    ctx.save(); ctx.clip();
    for (var i = 0; i < 70; i++) { var x = cx + (g() - 0.5) * 320, y = cy + (g() - 0.5) * 320, r = g() * 2.4 + 0.6; ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + g() * 0.5) + ')'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#fff'; [[150, 140, 12], [260, 120, 9], [220, 250, 10]].forEach(function (s) { U.star4(ctx, s[0], s[1], s[2]); ctx.fill(); });
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, 162, 0, Math.PI * 2); ctx.strokeStyle = '#cfe8ff'; ctx.lineWidth = 8; ctx.stroke();
    ctx.strokeStyle = '#5a6a80'; ctx.lineWidth = 16; ctx.setLineDash([30, 14]); ctx.beginPath(); ctx.arc(cx, cy, 176, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  };

  // ---------- one ambient prop per circle (stands on the side walkways) ----------
  var PROP = {};
  PROP[1] = function (ctx) { // Limbo: quiet philosopher bust on a pedestal
    U.rr(ctx, 100, 250, 120, 140, 6); fillOl(ctx, U.lin(ctx, 100, 0, 220, 0, [[0, MARBLE[0]], [1, MARBLE[3]]]));
    U.rr(ctx, 88, 236, 144, 22, 4); fillOl(ctx, MARBLE[1]); U.rr(ctx, 88, 380, 144, 16, 4); fillOl(ctx, MARBLE[2]);
    U.meander(ctx, 106, 300, 214, 4, 'rgba(140,110,80,0.6)', 2);
    ctx.beginPath(); ctx.moveTo(110, 236); ctx.quadraticCurveTo(160, 196, 210, 236); ctx.closePath(); fillOl(ctx, MARBLE[1]);
    ctx.beginPath(); ctx.ellipse(160, 150, 46, 56, 0, 0, Math.PI * 2); fillOl(ctx, U.rad(ctx, 146, 130, 6, 60, [[0, MARBLE[0]], [1, MARBLE[2]]]));
    ctx.beginPath(); ctx.moveTo(126, 168); ctx.quadraticCurveTo(160, 236, 194, 168); ctx.quadraticCurveTo(160, 190, 126, 168); fillOl(ctx, MARBLE[2], 3);
    ctx.strokeStyle = 'rgba(110,90,70,0.7)'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(146, 146, 7, 0.1 * Math.PI, 0.9 * Math.PI); ctx.moveTo(181, 146); ctx.arc(174, 146, 7, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    for (var i = 0; i < 12; i++) { var a = Math.PI * 1.05 + i / 11 * Math.PI * 0.9; ctx.save(); ctx.translate(160 + Math.cos(a) * 48, 128 + Math.sin(a) * 30); ctx.rotate(a + Math.PI / 2); ctx.beginPath(); ctx.ellipse(0, -6, 5, 11, 0, 0, Math.PI * 2); ctx.fillStyle = '#9ab07a'; ctx.fill(); ctx.restore(); }
    ctx.fillStyle = U.lin(ctx, 0, 330, 0, 400, [[0, 'rgba(230,224,240,0)'], [1, 'rgba(230,224,240,0.7)']]); ctx.fillRect(40, 330, 240, 70);
  };
  PROP[2] = function (ctx) { // Lust: banner whipped by the winds
    ctx.strokeStyle = OUT; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(100, 392); ctx.lineTo(100, 40); ctx.stroke(); ctx.strokeStyle = BR[1]; ctx.lineWidth = 8; ctx.stroke();
    ctx.beginPath(); ctx.arc(100, 36, 12, 0, Math.PI * 2); fillOl(ctx, GOLD[1]);
    ctx.beginPath(); ctx.moveTo(104, 56); ctx.bezierCurveTo(170, 30, 210, 110, 300, 70); ctx.bezierCurveTo(270, 110, 290, 130, 260, 150); ctx.bezierCurveTo(200, 170, 170, 120, 104, 160); ctx.closePath();
    fillOl(ctx, U.lin(ctx, 104, 0, 300, 0, [[0, '#c22a5a'], [0.5, '#ff6a8a'], [1, '#a01848']]));
    ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(108, 154); ctx.bezierCurveTo(170, 116, 200, 166, 256, 148); ctx.stroke();
    var g = U.prng(2); for (var i = 0; i < 9; i++) { ctx.save(); ctx.translate(140 + g() * 160, 180 + g() * 150); ctx.rotate(g() * 6); ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2); ctx.fillStyle = '#ff8aa8'; ctx.fill(); ctx.restore(); }
    U.rr(ctx, 70, 380, 60, 16, 4); fillOl(ctx, MARBLE[2]);
  };
  PROP[3] = function (ctx) { // Gluttony: amphora sunk in mud
    ctx.beginPath(); ctx.ellipse(160, 360, 150, 34, 0, 0, Math.PI * 2); ctx.fillStyle = '#4a3420'; ctx.fill(); ctx.beginPath(); ctx.ellipse(150, 352, 110, 20, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(160,120,80,0.4)'; ctx.fill();
    ctx.save(); ctx.translate(160, 250); ctx.rotate(0.35);
    ctx.beginPath(); ctx.moveTo(-26, -150); ctx.lineTo(26, -150); ctx.quadraticCurveTo(30, -110, 70, -60); ctx.quadraticCurveTo(100, 20, 30, 100); ctx.lineTo(-30, 100); ctx.quadraticCurveTo(-100, 20, -70, -60); ctx.quadraticCurveTo(-30, -110, -26, -150); ctx.closePath();
    fillOl(ctx, U.lin(ctx, -90, 0, 90, 0, [[0, '#8a3a1a'], [0.35, '#e0784a'], [1, '#6a2a12']]));
    ctx.fillStyle = '#2a1408'; ctx.fillRect(-80, -40, 160, 30); U.meander(ctx, -72, -25, 76, 4.6, '#e8a060', 2.4);
    [[-1], [1]].forEach(function (s) { ctx.strokeStyle = OUT; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(s[0] * 24, -136); ctx.quadraticCurveTo(s[0] * 70, -140, s[0] * 58, -80); ctx.stroke(); ctx.strokeStyle = '#b85a2a'; ctx.lineWidth = 6; ctx.stroke(); });
    ctx.restore();
    ctx.fillStyle = '#5a3a1e'; ctx.beginPath(); ctx.ellipse(110, 352, 70, 16, 0, 0, Math.PI * 2); ctx.fill();
    [[230, 330], [244, 344], [222, 348]].forEach(function (g) { ctx.beginPath(); ctx.arc(g[0], g[1], 10, 0, Math.PI * 2); fillOl(ctx, '#7a3a8a', 3); });
  };
  PROP[4] = function (ctx) { // Greed: coin heap + bronze weight
    var g = U.prng(4);
    ctx.beginPath(); ctx.moveTo(30, 390); ctx.quadraticCurveTo(160, 200, 290, 390); ctx.closePath(); fillOl(ctx, U.lin(ctx, 0, 220, 0, 390, [[0, GOLD[1]], [1, GOLD[3]]]));
    for (var i = 0; i < 34; i++) { var x = 60 + g() * 200, y = 260 + g() * 120; if (y < 390 - Math.abs(x - 160) * 1.1 - 20) continue; ctx.beginPath(); ctx.ellipse(x, y, 16, 7, (g() - 0.5) * 0.6, 0, Math.PI * 2); ctx.fillStyle = U.lin(ctx, x - 16, y - 7, x + 16, y + 7, [[0, GOLD[0]], [1, GOLD[2]]]); ctx.fill(); ctx.strokeStyle = '#8a5208'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(150, 120); ctx.lineTo(214, 120); ctx.lineTo(236, 250); ctx.lineTo(128, 250); ctx.closePath(); fillOl(ctx, U.lin(ctx, 128, 0, 236, 0, [[0, BR[2]], [0.35, BR[0]], [1, BR[2]]]));
    ctx.beginPath(); ctx.arc(182, 108, 18, 0, Math.PI * 2); ctx.strokeStyle = OUT; ctx.lineWidth = 12; ctx.stroke(); ctx.strokeStyle = BR[1]; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = 'rgba(90,50,10,0.8)'; ctx.font = '900 30px serif'; ctx.textAlign = 'center'; ctx.fillText('X', 182, 200);
    ctx.fillStyle = '#fff'; U.star4(ctx, 110, 300, 10); ctx.fill(); U.star4(ctx, 214, 150, 8); ctx.fill();
  };
  PROP[5] = function (ctx) { // Wrath: gnarled stump in the Styx with reeds
    ctx.beginPath(); ctx.ellipse(160, 372, 150, 26, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(30,70,58,0.9)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(110, 380); ctx.quadraticCurveTo(130, 260, 120, 160); ctx.quadraticCurveTo(90, 120, 60, 110); ctx.quadraticCurveTo(100, 104, 130, 140); ctx.quadraticCurveTo(150, 90, 140, 50); ctx.quadraticCurveTo(170, 90, 160, 150);
    ctx.quadraticCurveTo(200, 120, 240, 120); ctx.quadraticCurveTo(200, 140, 178, 190); ctx.quadraticCurveTo(170, 280, 200, 380); ctx.closePath();
    fillOl(ctx, U.lin(ctx, 100, 0, 220, 0, [[0, '#3a2a22'], [0.4, '#6a5444'], [1, '#2a1c16']]));
    ctx.strokeStyle = '#4a7a3a'; ctx.lineWidth = 6; ctx.lineCap = 'round'; for (var i = 0; i < 9; i++) { var x = 40 + i * 30 + (i > 3 ? 60 : 0); if (x > 300) break; ctx.beginPath(); ctx.moveTo(x, 380); ctx.quadraticCurveTo(x + 8, 320, x + (i % 2 ? 14 : -6), 280 + (i % 3) * 16); ctx.stroke(); }
    ctx.fillStyle = '#6a3a2a'; [[40, 290], [268, 300]].forEach(function (c) { U.rr(ctx, c[0] - 6, c[1] - 16, 12, 30, 6); ctx.fill(); });
    ctx.fillStyle = 'rgba(160,255,200,0.8)'; [[90, 250], [220, 230], [250, 300]].forEach(function (f) { ctx.beginPath(); ctx.arc(f[0], f[1], 4, 0, Math.PI * 2); ctx.fill(); });
  };
  PROP[6] = function (ctx) { // Heresy: open burning sarcophagus
    ctx.fillStyle = U.rad(ctx, 160, 230, 10, 160, [[0, 'rgba(255,160,40,0.55)'], [1, 'rgba(255,100,20,0)']]); ctx.fillRect(0, 60, 320, 330);
    [[0.0, '#ff5a10', 120, 40], [0.2, '#ffa020', 90, 30], [0.4, '#fff0a0', 50, 18]].forEach(function (f) { ctx.beginPath(); ctx.moveTo(160 - f[2], 270); ctx.bezierCurveTo(160 - f[2], 160, 130, 150, 160, 70 + f[3]); ctx.bezierCurveTo(190, 150, 160 + f[2], 160, 160 + f[2], 270); ctx.closePath(); ctx.fillStyle = f[1]; ctx.fill(); });
    U.poly(ctx, [[30, 270], [290, 270], [270, 390], [50, 390]]); fillOl(ctx, U.lin(ctx, 0, 270, 0, 390, [[0, MARBLE[1]], [1, MARBLE[3]]]));
    U.meander(ctx, 60, 318, 262, 5, 'rgba(140,100,60,0.7)', 2.4);
    ctx.save(); ctx.translate(250, 250); ctx.rotate(0.32); U.rr(ctx, -40, -20, 150, 30, 6); fillOl(ctx, U.lin(ctx, 0, -20, 0, 10, [[0, MARBLE[0]], [1, MARBLE[2]]])); ctx.restore();
    ctx.beginPath(); ctx.ellipse(160, 272, 128, 14, 0, 0, Math.PI * 2); ctx.fillStyle = '#ffcf5a'; ctx.fill();
  };
  PROP[7] = function (ctx) { // Violence: jagged fire spire
    U.poly(ctx, [[40, 392], [90, 200], [120, 230], [150, 80], [180, 170], [210, 120], [240, 260], [280, 392]]); fillOl(ctx, U.lin(ctx, 40, 0, 280, 0, [[0, '#3a1a14'], [0.5, '#6a3226'], [1, '#2a120c']]));
    ctx.strokeStyle = '#ff9a20'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(150, 110); ctx.lineTo(140, 200); ctx.lineTo(160, 260); ctx.lineTo(140, 380); ctx.moveTo(210, 150); ctx.lineTo(220, 260); ctx.stroke();
    ctx.strokeStyle = '#fff0a0'; ctx.lineWidth = 2; ctx.stroke();
    [[150, 80, 34], [210, 120, 24], [90, 200, 22]].forEach(function (f) { ctx.beginPath(); ctx.moveTo(f[0] - f[2], f[1] + 10); ctx.bezierCurveTo(f[0] - f[2], f[1] - 30, f[0], f[1] - 40, f[0], f[1] - f[2] * 2.4); ctx.bezierCurveTo(f[0] + 6, f[1] - 30, f[0] + f[2], f[1] - 30, f[0] + f[2], f[1] + 10); ctx.closePath(); ctx.fillStyle = '#ffa020'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(f[0], f[1] - f[2] * 0.5, f[2] * 0.4, f[2] * 0.9, 0, 0, Math.PI * 2); ctx.fillStyle = '#fff2b0'; ctx.fill(); });
  };
  PROP[8] = function (ctx) { // Fraud: Malebolge stone bridge over a ditch
    ctx.beginPath(); ctx.ellipse(160, 370, 150, 24, 0, 0, Math.PI * 2); ctx.fillStyle = '#1a0e0a'; ctx.fill(); ctx.beginPath(); ctx.ellipse(160, 370, 110, 12, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,110,30,0.6)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(10, 390); ctx.lineTo(10, 210); ctx.quadraticCurveTo(160, 150, 310, 210); ctx.lineTo(310, 390); ctx.lineTo(250, 390); ctx.quadraticCurveTo(250, 270, 160, 270); ctx.quadraticCurveTo(70, 270, 70, 390); ctx.closePath();
    fillOl(ctx, U.lin(ctx, 0, 160, 0, 390, [[0, '#9a8e86'], [1, '#4a403c']]));
    ctx.strokeStyle = 'rgba(40,30,26,0.5)'; ctx.lineWidth = 3; for (var i = 0; i < 9; i++) { var a = Math.PI + 0.18 + i / 8 * (Math.PI - 0.36); ctx.beginPath(); ctx.moveTo(160 + Math.cos(a) * 92, 390 + Math.sin(a) * 120); ctx.lineTo(160 + Math.cos(a) * 120, 390 + Math.sin(a) * 160); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(10, 210); ctx.quadraticCurveTo(160, 150, 310, 210); ctx.strokeStyle = '#c8bcb4'; ctx.lineWidth = 6; ctx.stroke();
  };
  PROP[9] = function (ctx) { // Treachery: ice crystal cluster
    var cr = [[160, 60, 40, 330], [110, 160, 30, 230], [212, 140, 32, 250], [70, 250, 22, 140], [250, 240, 24, 150]];
    cr.forEach(function (c) { var x = c[0], top = c[1], w = c[2], bottom = top + c[3] + 10;
      U.poly(ctx, [[x, top], [x + w, top + w * 1.2], [x + w * 0.8, bottom], [x - w * 0.8, bottom], [x - w, top + w * 1.2]]);
      ctx.fillStyle = U.lin(ctx, x - w, 0, x + w, 0, [[0, 'rgba(160,220,255,0.9)'], [0.45, 'rgba(240,252,255,0.95)'], [1, 'rgba(90,160,220,0.9)']]); ctx.fill(); ctx.strokeStyle = '#2a5a8a'; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, top + 6); ctx.lineTo(x - w * 0.2, bottom - 10); ctx.stroke(); });
    ctx.beginPath(); ctx.ellipse(160, 394, 150, 14, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(220,245,255,0.8)'; ctx.fill();
  };
  for (var c = 1; c <= 9; c++) (function (c) { D['prop_c' + c] = function (ctx) { PROP[c](ctx); }; })(c);
})(this);
