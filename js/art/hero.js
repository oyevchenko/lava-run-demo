/*
 * Lava Run: Inferno - code-drawn hero (fallback for hero_*.png). Young ancient traveler-poet:
 * laurel wreath, deep red cloak with gold trim, bronze-trimmed linen tunic, greaves + sandals, bronze lantern.
 * Drawn in the 512x640 sprite space of the asset spec (feet at y = 608).
 */
(function (root) {
  'use strict';
  var A = root.LavaArt, U = A.util;
  var OUT = '#4a2414', SKIN = ['#ffdcc2', '#f0b48e', '#c47e5e'], HAIR = '#3a2416', HAIR_HI = '#6e4a2c';
  var CLOAK = ['#c42a33', '#8e1720', '#5e0c14'], TRIM = '#e8b84e', LINEN = ['#fbf1da', '#e6d4ad', '#c2a87c'];
  var BRONZE = ['#ffe9a8', '#c9923c', '#7a4c18'], LEATHER = ['#8a552c', '#5e361a'];
  var LW = 5; // outline width

  function dir(a) { return [Math.sin(a), Math.cos(a)]; }
  function limb(ctx, x1, y1, x2, y2, w, fill, hi) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUT; ctx.lineWidth = w + LW * 2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = fill; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if (hi) { var dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, ox = -dy / l * w * 0.22, oy = dx / l * w * 0.22;
      ctx.strokeStyle = hi; ctx.lineWidth = w * 0.28; ctx.beginPath(); ctx.moveTo(x1 - ox, y1 - oy); ctx.lineTo(x2 - ox, y2 - oy); ctx.stroke(); }
  }
  function blob(ctx, fill) { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = LW; ctx.lineJoin = 'round'; ctx.stroke(); }

  function lantern(ctx, x, y, s, swing) { // (x,y) = handle top
    ctx.save(); ctx.translate(x, y); ctx.rotate(swing || 0); ctx.scale(s, s);
    ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 4, 9, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = BRONZE[1]; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 4, 9, Math.PI, 0); ctx.stroke();
    U.poly(ctx, [[-16, 22], [-8, 8], [8, 8], [16, 22]]); blob(ctx, U.lin(ctx, -16, 0, 16, 0, [[0, BRONZE[0]], [0.5, BRONZE[1]], [1, BRONZE[2]]]));
    U.rr(ctx, -18, 20, 36, 46, 8);
    ctx.fillStyle = U.rad(ctx, 0, 44, 2, 30, [[0, '#ffffff'], [0.25, '#fff2a0'], [0.7, '#ffb030'], [1, '#e86a10']]); ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = BRONZE[2]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-6, 21); ctx.lineTo(-6, 66); ctx.moveTo(6, 21); ctx.lineTo(6, 66); ctx.stroke();
    U.poly(ctx, [[-20, 64], [20, 64], [14, 76], [-14, 76]]); blob(ctx, U.lin(ctx, -20, 0, 20, 0, [[0, BRONZE[0]], [0.5, BRONZE[1]], [1, BRONZE[2]]]));
    ctx.restore();
  }

  function cloakBack(ctx, p) {
    var f = p.cloak || 0, side = p.cloakSide || 0, hem = 578 - f * 230, wHem = 150 + f * 60, sx = side * 60 * (0.4 + f);
    ctx.beginPath();
    ctx.moveTo(206, 214);
    ctx.bezierCurveTo(150, 260 - f * 40, 120 + sx - f * 50, hem - 180, 256 - wHem + sx, hem);
    var waves = 4;
    for (var i = 1; i <= waves; i++) { var x = 256 - wHem + sx + (wHem * 2) * i / waves, xm = x - wHem / waves; ctx.quadraticCurveTo(xm, hem + (i % 2 ? 22 : -6), x, hem + (i % 2 ? 4 : 10)); }
    ctx.bezierCurveTo(392 + sx + f * 50, hem - 180, 362, 260 - f * 40, 306, 214);
    ctx.closePath();
    blob(ctx, U.lin(ctx, 120, 0, 400, 0, [[0, CLOAK[1]], [0.35, CLOAK[0]], [0.7, CLOAK[1]], [1, CLOAK[2]]]));
    // gold trim along the hem
    ctx.save(); ctx.clip();
    ctx.strokeStyle = TRIM; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(256 - wHem + sx - 20, hem + 2);
    for (var j = 1; j <= waves; j++) { var x2 = 256 - wHem + sx + (wHem * 2) * j / waves, xm2 = x2 - wHem / waves; ctx.quadraticCurveTo(xm2, hem + (j % 2 ? 20 : -8), x2, hem + (j % 2 ? 2 : 8)); }
    ctx.stroke();
    // inner lining shadow + folds
    ctx.strokeStyle = 'rgba(60,4,10,0.45)'; ctx.lineWidth = 6;
    for (var k = 0; k < 4; k++) { var fx = 170 + k * 56 + sx * 0.5; ctx.beginPath(); ctx.moveTo(fx + 30 - k * 10, 260); ctx.quadraticCurveTo(fx, hem - 120, fx - 10 + sx * 0.3, hem); ctx.stroke(); }
    ctx.restore();
  }

  function leg(ctx, hx, hy, a1, a2) {
    var d1 = dir(a1), kx = hx + d1[0] * 92, ky = hy + d1[1] * 92, d2 = dir(a1 + a2), ax = kx + d2[0] * 104, ay = ky + d2[1] * 104;
    limb(ctx, hx, hy, kx, ky, 34, SKIN[1], SKIN[0]);
    // greave (bronze shin guard)
    var gx = kx + d2[0] * 26, gy = ky + d2[1] * 26;
    limb(ctx, gx, gy, ax - d2[0] * 6, ay - d2[1] * 6, 38, BRONZE[1], BRONZE[0]);
    ctx.strokeStyle = BRONZE[2]; ctx.lineWidth = 3;
    for (var i = 1; i < 4; i++) { var t = i / 4, px = gx + (ax - gx) * t, py = gy + (ay - gy) * t; ctx.beginPath(); ctx.moveTo(px - d2[1] * 14, py + d2[0] * 14); ctx.lineTo(px + d2[1] * 14, py - d2[0] * 14); ctx.stroke(); }
    // knee cap
    ctx.beginPath(); ctx.arc(kx, ky, 11, 0, Math.PI * 2); blob(ctx, U.rad(ctx, kx - 4, ky - 4, 1, 16, [[0, BRONZE[0]], [1, BRONZE[1]]]));
    // sandal
    ctx.beginPath(); ctx.ellipse(ax + d2[0] * 8, ay + 10, 26, 13, 0, 0, Math.PI * 2); blob(ctx, U.lin(ctx, 0, ay, 0, ay + 22, [[0, LEATHER[0]], [1, LEATHER[1]]]));
    ctx.beginPath(); ctx.ellipse(ax + d2[0] * 8, ay + 2, 16, 9, 0, Math.PI, 0); ctx.fillStyle = SKIN[1]; ctx.fill();
    ctx.strokeStyle = LEATHER[1]; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ax - 12, ay + 4); ctx.lineTo(ax + 14, ay - 2); ctx.stroke();
    return [ax, ay];
  }

  function arm(ctx, sx, sy, a1, a2, open) {
    var d1 = dir(a1), ex = sx + d1[0] * 78, ey = sy + d1[1] * 78, d2 = dir(a1 + a2), wx = ex + d2[0] * 76, wy = ey + d2[1] * 76;
    limb(ctx, sx, sy, ex, ey, 30, SKIN[1], SKIN[0]);
    limb(ctx, ex, ey, wx, wy, 27, SKIN[1], SKIN[0]);
    // bronze bracer
    limb(ctx, ex + d2[0] * 30, ey + d2[1] * 30, ex + d2[0] * 58, ey + d2[1] * 58, 30, BRONZE[1], BRONZE[0]);
    // hand
    ctx.beginPath(); ctx.arc(wx + d2[0] * 8, wy + d2[1] * 8, open ? 17 : 15, 0, Math.PI * 2); blob(ctx, U.rad(ctx, wx, wy, 2, 18, [[0, SKIN[0]], [1, SKIN[1]]]));
    if (open) { ctx.lineCap = 'round'; for (var f = -2; f <= 2; f++) { var a = a1 + a2 + f * 0.32, dd = dir(a), bx = wx + d2[0] * 8 + dd[0] * 14, by = wy + d2[1] * 8 + dd[1] * 14;
      limb(ctx, bx, by, bx + dd[0] * 13, by + dd[1] * 13, 8, SKIN[1]); } }
    // short linen sleeve cap at the shoulder
    ctx.beginPath(); ctx.ellipse(sx + d1[0] * 14, sy + d1[1] * 14, 26, 22, a1 * -1, 0, Math.PI * 2); blob(ctx, U.lin(ctx, sx - 26, 0, sx + 26, 0, [[0, LINEN[0]], [1, LINEN[1]]]));
    ctx.strokeStyle = BRONZE[1]; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(sx + d1[0] * 14, sy + d1[1] * 14, 22, 18, -a1, 0.2, Math.PI - 0.2); ctx.stroke();
    return [wx + d2[0] * 10, wy + d2[1] * 10];
  }

  function torso(ctx, p) {
    // skirt + chest silhouette
    ctx.beginPath();
    ctx.moveTo(204, 222); ctx.quadraticCurveTo(256, 206, 308, 222);
    ctx.lineTo(304, 330); ctx.quadraticCurveTo(330, 390, 326, 442);
    ctx.quadraticCurveTo(256, 456, 186, 442); ctx.quadraticCurveTo(182, 390, 208, 330); ctx.closePath();
    blob(ctx, U.lin(ctx, 186, 0, 326, 0, [[0, LINEN[0]], [0.55, LINEN[1]], [1, LINEN[2]]]));
    ctx.save(); ctx.clip();
    // warm lava bounce light from below
    ctx.fillStyle = U.lin(ctx, 0, 380, 0, 450, [[0, 'rgba(255,140,40,0)'], [1, 'rgba(255,140,40,0.28)']]); ctx.fillRect(170, 380, 170, 80);
    // folds
    ctx.strokeStyle = 'rgba(120,90,50,0.35)'; ctx.lineWidth = 4;
    [[226, 350, 214, 440], [256, 352, 256, 448], [286, 350, 300, 440]].forEach(function (l) { ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.quadraticCurveTo(l[0] + 6, (l[1] + l[3]) / 2, l[2], l[3]); ctx.stroke(); });
    // meander hem band
    ctx.fillStyle = BRONZE[2]; ctx.fillRect(176, 418, 160, 26);
    U.meander(ctx, 182, 431, 334, 5.2, BRONZE[0], 2.6);
    ctx.restore();
    // pteruges (leather strips) under belt
    for (var i = 0; i < 6; i++) { var x = 214 + i * 15; U.rr(ctx, x, 334, 13, 56, 4); blob(ctx, U.lin(ctx, 0, 334, 0, 390, [[0, LEATHER[0]], [1, LEATHER[1]]])); ctx.fillStyle = BRONZE[1]; ctx.beginPath(); ctx.arc(x + 6.5, 382, 3.5, 0, Math.PI * 2); ctx.fill(); }
    // cross straps
    ctx.lineCap = 'butt';
    [[212, 230, 294, 330], [300, 230, 218, 330]].forEach(function (s) { ctx.strokeStyle = OUT; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke(); ctx.strokeStyle = LEATHER[0]; ctx.lineWidth = 11; ctx.stroke(); });
    // belt
    U.rr(ctx, 200, 318, 112, 22, 6); blob(ctx, U.lin(ctx, 0, 318, 0, 340, [[0, LEATHER[0]], [1, LEATHER[1]]]));
    U.rr(ctx, 244, 315, 24, 28, 5); blob(ctx, U.lin(ctx, 244, 315, 268, 343, [[0, BRONZE[0]], [1, BRONZE[2]]]));
    // chest medallion
    ctx.beginPath(); ctx.arc(256, 278, 15, 0, Math.PI * 2); blob(ctx, U.rad(ctx, 251, 273, 2, 16, [[0, BRONZE[0]], [0.6, BRONZE[1]], [1, BRONZE[2]]]));
    ctx.strokeStyle = BRONZE[2]; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(256, 278, 8, 0, Math.PI * 2); ctx.stroke();
  }

  function collar(ctx) {
    ctx.beginPath(); ctx.moveTo(196, 236); ctx.quadraticCurveTo(204, 204, 256, 202); ctx.quadraticCurveTo(308, 204, 316, 236);
    ctx.quadraticCurveTo(290, 222, 256, 232); ctx.quadraticCurveTo(222, 222, 196, 236); ctx.closePath();
    blob(ctx, U.lin(ctx, 0, 200, 0, 236, [[0, CLOAK[0]], [1, CLOAK[1]]]));
    // fibula brooch
    ctx.beginPath(); ctx.arc(222, 226, 11, 0, Math.PI * 2); blob(ctx, U.rad(ctx, 219, 222, 1, 12, [[0, BRONZE[0]], [1, BRONZE[1]]]));
  }

  function head(ctx, p) {
    var f = p.face || {}, lookX = f.look ? f.look[0] : 0, lookY = f.look ? f.look[1] : 0;
    ctx.save(); ctx.translate(256, 214); ctx.rotate(p.headTilt || 0); ctx.scale(1.14, 1.14); ctx.translate(-256, -208);
    // neck
    U.rr(ctx, 236, 178, 40, 44, 10); blob(ctx, SKIN[1]);
    ctx.fillStyle = 'rgba(120,60,30,0.35)'; ctx.fillRect(240, 196, 32, 10);
    // back laurel leaves (behind hair)
    laurel(ctx, p, true);
    // hair back mass
    ctx.beginPath(); ctx.ellipse(256, 122, 70, 68, 0, 0, Math.PI * 2); blob(ctx, HAIR);
    // ears
    [[196, 150], [316, 150]].forEach(function (e) { ctx.beginPath(); ctx.ellipse(e[0], e[1], 12, 17, 0, 0, Math.PI * 2); blob(ctx, SKIN[1]); });
    // face
    ctx.beginPath(); ctx.moveTo(200, 128); ctx.bezierCurveTo(198, 178, 226, 206, 256, 206); ctx.bezierCurveTo(286, 206, 314, 178, 312, 128);
    ctx.bezierCurveTo(310, 90, 202, 90, 200, 128); ctx.closePath();
    blob(ctx, U.rad(ctx, 238, 132, 8, 90, [[0, SKIN[0]], [0.7, SKIN[1]], [1, SKIN[2]]]));
    // blush
    ctx.fillStyle = 'rgba(240,110,100,0.28)'; ctx.beginPath(); ctx.ellipse(220, 172, 13, 8, 0, 0, Math.PI * 2); ctx.ellipse(292, 172, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
    // eyes
    var ey = 148, eyes = f.eyes || 'open';
    [[230, -1], [282, 1]].forEach(function (e) {
      var x = e[0];
      if (eyes === 'closed') { ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, ey - 2, 11, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); return; }
      if (eyes === 'happy') { ctx.strokeStyle = OUT; ctx.lineWidth = 5.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, ey + 6, 12, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke(); return; }
      var ry = eyes === 'wide' ? 18 : 15, rx = eyes === 'wide' ? 14 : 12.5;
      ctx.beginPath(); ctx.ellipse(x, ey, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = '#fffaf2'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke();
      var ir = eyes === 'wide' ? 7 : 9.5;
      ctx.beginPath(); ctx.arc(x + lookX * 4, ey + 1 + lookY * 4, ir, 0, Math.PI * 2); ctx.fillStyle = U.rad(ctx, x + lookX * 4, ey + lookY * 4, 1, ir, [[0, '#8a5a2a'], [1, '#3e220e']]); ctx.fill();
      ctx.beginPath(); ctx.arc(x + lookX * 4, ey + 1 + lookY * 4, ir * 0.5, 0, Math.PI * 2); ctx.fillStyle = '#140804'; ctx.fill();
      ctx.beginPath(); ctx.arc(x + lookX * 4 - 3, ey - 3 + lookY * 4, 3.2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, ey + 2, rx + 1, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
    });
    // brows
    var b = f.brows || 0; ctx.strokeStyle = HAIR; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(216, 124 - b * 6 + (b < 0 ? -6 : 0)); ctx.quadraticCurveTo(230, 116 - b * 8, 244, 122 + (b < 0 ? -8 : 0) - b * 2);
    ctx.moveTo(268, 122 + (b < 0 ? -8 : 0) - b * 2); ctx.quadraticCurveTo(282, 116 - b * 8, 296, 124 - b * 6 + (b < 0 ? -6 : 0)); ctx.stroke();
    // nose
    ctx.strokeStyle = 'rgba(150,80,45,0.8)'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(258, 152); ctx.quadraticCurveTo(264, 166, 254, 168); ctx.stroke();
    // mouth
    var m = f.mouth || 'smile';
    ctx.strokeStyle = OUT; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
    if (m === 'smile') { ctx.beginPath(); ctx.moveTo(238, 180); ctx.quadraticCurveTo(256, 194, 274, 180); ctx.stroke(); }
    else if (m === 'sheepish') { ctx.beginPath(); ctx.moveTo(240, 184); ctx.quadraticCurveTo(262, 192, 276, 178); ctx.stroke(); }
    else if (m === 'grin') { ctx.beginPath(); ctx.moveTo(232, 176); ctx.quadraticCurveTo(256, 178, 280, 176); ctx.quadraticCurveTo(276, 204, 256, 204); ctx.quadraticCurveTo(236, 204, 232, 176); ctx.closePath(); ctx.fillStyle = '#7a1e1a'; ctx.fill(); ctx.stroke();
      ctx.save(); ctx.clip(); ctx.fillStyle = '#fff'; ctx.fillRect(232, 174, 48, 9); ctx.fillStyle = '#e8606a'; ctx.beginPath(); ctx.ellipse(256, 204, 14, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    else if (m === 'o') { ctx.beginPath(); ctx.ellipse(256, 188, 10, 13, 0, 0, Math.PI * 2); ctx.fillStyle = '#5a1410'; ctx.fill(); ctx.stroke(); }
    else if (m === 'wobble') { ctx.beginPath(); ctx.moveTo(240, 186); ctx.quadraticCurveTo(245, 180, 250, 186); ctx.quadraticCurveTo(256, 192, 262, 186); ctx.quadraticCurveTo(268, 180, 273, 186); ctx.stroke(); }
    // hair front: curls + fringe
    ctx.fillStyle = HAIR; ctx.strokeStyle = OUT; ctx.lineWidth = 4;
    var curls = [[206, 112, 20], [226, 96, 22], [252, 90, 23], [278, 94, 22], [300, 108, 20], [196, 132, 13], [316, 132, 13]];
    curls.forEach(function (c) { ctx.beginPath(); ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2); ctx.fill(); });
    ctx.beginPath(); ctx.moveTo(204, 124); ctx.quadraticCurveTo(222, 100, 240, 116); ctx.quadraticCurveTo(254, 98, 270, 114); ctx.quadraticCurveTo(290, 100, 308, 124); ctx.quadraticCurveTo(300, 80, 256, 76); ctx.quadraticCurveTo(212, 80, 204, 124); ctx.fill();
    ctx.strokeStyle = HAIR_HI; ctx.lineWidth = 3.5; curls.slice(0, 5).forEach(function (c) { ctx.beginPath(); ctx.arc(c[0] - 3, c[1] - 3, c[2] * 0.55, 3.6, 5.2); ctx.stroke(); });
    laurel(ctx, p, false);
    if (p.soot) soot(ctx, [[228, 168, 16], [286, 140, 12], [262, 112, 14], [214, 136, 10]]);
    if (p.sweat) { ctx.beginPath(); ctx.moveTo(318, 104); ctx.quadraticCurveTo(330, 124, 324, 132); ctx.quadraticCurveTo(312, 134, 314, 122); ctx.closePath(); blob(ctx, U.lin(ctx, 310, 104, 330, 134, [[0, '#e8f8ff'], [1, '#5ab4f0']])); }
    ctx.restore();
  }

  function laurel(ctx, p, back) {
    var tilt = p.laurelTilt || 0, cx = 256, cy = 96 + tilt * 10, rx = 72, ry = 22;
    for (var i = 0; i < 18; i++) {
      var a = (i / 18) * Math.PI * 2, front = Math.sin(a) > -0.15;
      if (front === back) continue;
      if (!back && Math.abs(Math.cos(a)) < 0.12 && Math.sin(a) > 0) continue; // gap at the front centre
      var x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry + Math.cos(a) * tilt * 14;
      var ang = Math.atan2(Math.sin(a) * ry, Math.cos(a) * rx) + (Math.cos(a) > 0 ? -0.9 : 0.9) + Math.PI / 2;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.beginPath(); ctx.ellipse(0, -12, 7.5, 16, 0, 0, Math.PI * 2);
      ctx.fillStyle = U.lin(ctx, -7, -28, 7, 4, [[0, '#fff3a6'], [0.45, '#e2b440'], [1, '#9a6a14']]); ctx.fill();
      ctx.strokeStyle = '#5a3a08'; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.strokeStyle = 'rgba(120,80,10,0.6)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -24); ctx.stroke();
      ctx.restore();
    }
  }
  function soot(ctx, spots) { spots.forEach(function (s) { ctx.fillStyle = U.rad(ctx, s[0], s[1], 0, s[2] * 1.6, [[0, 'rgba(40,30,30,0.7)'], [1, 'rgba(40,30,30,0)']]); ctx.beginPath(); ctx.arc(s[0], s[1], s[2] * 1.6, 0, Math.PI * 2); ctx.fill(); }); }

  // --- poses (angles in radians; 0 = pointing down, + = toward screen right) ---
  var POSES = {
    hero_idle: { armL: [-0.22, 0.32], armR: [0.2, -0.15], legL: [-0.06, 0.04], legR: [0.06, -0.04], lantern: 'R', face: { eyes: 'open', mouth: 'smile' } },
    hero_idle_blink: { armL: [-0.22, 0.32], armR: [0.2, -0.15], legL: [-0.06, 0.04], legR: [0.06, -0.04], lantern: 'R', face: { eyes: 'closed', mouth: 'smile' } },
    hero_jump: { armL: [-1.75, -0.35], armR: [1.6, 0.45], legL: [-0.45, 1.25], legR: [0.3, -1.4], lantern: 'R', cloak: 0.75, cloakSide: -0.4, face: { eyes: 'open', mouth: 'grin', brows: 1, look: [0, -0.6] } },
    hero_win: { armL: [-2.7, 0.25], armR: [2.7, -0.25], legL: [-0.14, 0.05], legR: [0.14, -0.05], lantern: 'R', cloak: 0.18, face: { eyes: 'happy', mouth: 'grin', brows: 1 } },
    hero_idol: { armL: [-0.25, 0.3], armR: [2.75, 0.25], legL: [-0.1, 0.05], legR: [0.1, -0.05], lantern: 'L', idol: true, cloak: 0.1, face: { eyes: 'open', mouth: 'grin', brows: 1, look: [0.6, -0.8] } },
    hero_nervous: { armL: [-0.25, 1.9], armR: [0.25, -1.9], legL: [0.05, 0], legR: [-0.05, 0], lantern: 'C', sweat: true, face: { eyes: 'open', mouth: 'wobble', brows: -1, look: [0.3, 0.8] } },
    hero_fall: { armL: [-2.3, -0.7], armR: [2.1, 0.8], legL: [-0.6, 0.5], legR: [0.55, -0.7], lantern: 'R', cloak: 1, cloakSide: 0.3, face: { eyes: 'wide', mouth: 'o', brows: 1.4 } },
    hero_soot: { armL: [-0.2, 0.3], armR: [2.4, 1.2], legL: [-0.06, 0.04], legR: [0.06, -0.04], lantern: 'belt', soot: true, laurelTilt: 0.5, headTilt: 0.08, face: { eyes: 'happy', mouth: 'sheepish' } },
    hero_wave: { armL: [-2.55, -0.55], armR: [0.2, -0.15], legL: [-0.06, 0.04], legR: [0.06, -0.04], lantern: 'R', openL: true, face: { eyes: 'open', mouth: 'grin', brows: 0.6 } }
  };
  A.heroPoses = Object.keys(POSES);

  function drawHero(ctx, name) {
    var p = POSES[name] || POSES.hero_idle;
    ctx.save();
    cloakBack(ctx, p);
    leg(ctx, 232, 404, p.legL[0], p.legL[1]); leg(ctx, 280, 404, p.legR[0], p.legR[1]);
    torso(ctx, p);
    if (p.soot) soot(ctx, [[230, 300, 22], [290, 390, 18], [210, 410, 14]]);
    if (p.lantern === 'belt' || p.lantern === 'L' && false) lantern(ctx, 312, 336, 0.8, 0.1);
    var hl = arm(ctx, 196, 238, p.armL[0], p.armL[1], p.openL);
    var hr = arm(ctx, 316, 238, p.armR[0], p.armR[1], false);
    collar(ctx);
    head(ctx, p);
    if (p.lantern === 'R') lantern(ctx, hr[0], hr[1] - 4, 1, -p.armR[0] * 0.15);
    if (p.lantern === 'L') lantern(ctx, hl[0], hl[1] - 4, 1, -p.armL[0] * 0.15);
    if (p.lantern === 'C') lantern(ctx, 256, 286, 0.95, 0);
    ctx.restore();
  }
  // lantern glass centre per pose (sprite px), for the renderer's live flicker glow
  A.heroLantern = { hero_idle: [356, 500], hero_idle_blink: [356, 500], hero_jump: [424, 316], hero_win: [362, 126], hero_idol: [152, 520], hero_nervous: [256, 326], hero_fall: [394, 156], hero_soot: [312, 376], hero_wave: [356, 500] };

  // raised hand of hero_idol (the renderer floats the glowing idol here when the fallback sprite is used)
  A.heroIdolHand = [362, 78];
  A.sizes = A.sizes || {}; A.heroPoses.forEach(function (n) { A.sizes[n] = [512, 640]; });
  A.draw = A.draw || {};
  A.heroPoses.forEach(function (n) { A.draw[n] = function (ctx) { drawHero(ctx, n); }; });
  A.lantern = lantern;
})(this);
