/*
 * Lava Run: Inferno - procedural WebGL hazard plane (lava, Styx swamp, Cocytus ice...).
 * One fragment shader, no textures loaded from disk (so it also works from file://): domain-warped fbm flow,
 * drifting Voronoi crust plates with glowing cracks and a bloom halo, molten pools and ridged fire streaks,
 * heat-haze shimmer, and micro-eruptions (bubbles that swell and pop) clustered where the crust cracks.
 * The per-circle look comes from a tiny generated palette texture (5-stop colour ramp + 3 parameter rows),
 * blended across circle borders by bilinear filtering. Rendered at reduced resolution into an offscreen WebGL
 * canvas and drawn into the 2D scene (render.js), so depth order, shake and camera push stay in one place.
 * Purely decorative. If WebGL / highp is unavailable, render.js keeps the Canvas2D pattern hazard.
 */
(function (root) {
  'use strict';
  // per circle (0 = gate .. 9): [flow, crust, crackW, warp], [bubbleRate, bubbleSize, gloss, scale], [ice, water, rain, emissive]
  var PARAMS = [
    [[0.55, 0.62, 0.30, 0.45], [0.55, 0.55, 0.55, 0.45], [0, 0, 0, 0.8]],   // gate: classic
    [[0.35, 0.50, 0.35, 0.40], [0.35, 0.45, 0.45, 0.40], [0, 0, 0, 0.55]],  // I limbo: pale, soft
    [[0.95, 0.45, 0.30, 0.95], [0.45, 0.45, 0.60, 0.50], [0, 0, 0, 0.8]],   // II lust: swirling pink
    [[0.30, 0.85, 0.18, 0.35], [0.10, 0.40, 0.70, 0.55], [0, 0, 1, 0.55]],  // III gluttony: mud + rain
    [[0.40, 0.80, 0.30, 0.40], [0.55, 0.50, 1.00, 0.45], [0, 0, 0, 0.8]],   // IV greed: molten gold under dark bronze crust (so the gold slabs pop), glossy
    [[0.22, 0.00, 0.20, 0.55], [0.55, 0.45, 0.60, 0.45], [0, 1, 0, 0.6]],   // V wrath: Styx swamp
    [[0.55, 0.70, 0.30, 0.45], [0.70, 0.60, 0.55, 0.50], [0, 0, 0, 0.9]],   // VI heresy: classic lava
    [[1.00, 0.18, 0.40, 0.60], [0.80, 0.60, 0.50, 0.40], [0, 0, 0, 1.0]],   // VII violence: river of fire
    [[0.30, 0.95, 0.14, 0.35], [0.85, 0.75, 0.80, 0.60], [0, 0, 0, 0.75]],  // VIII fraud: boiling pitch
    [[0.00, 0.80, 0.18, 0.25], [0.00, 0.00, 1.00, 0.45], [1, 0, 0, 0.5]]    // IX treachery: ice
  ];
  // shader-only ramp overrides (the 2D fallback keeps the palette in art/core.js)
  var GL_RAMP = { 4: ['#1e0c00', '#5a2c02', '#c27408', '#ffcc3a', '#fff4c0'] };
  var VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  var FS = [
    'precision highp float;',
    'uniform vec2 uSize;uniform float uRes,uHy,uGy,uCx,uK,uF,uCamZ,uCamX,uT,uBW,uHaze,uDetail;',
    'uniform float uB[9];uniform sampler2D uPal;uniform vec4 uErupt;',
    'float h21(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}',
    'vec2 h22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}',
    'float vn(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),u.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),u.x),u.y);}',
    'const mat2 RT=mat2(1.6,1.2,-1.2,1.6);',
    'float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p);p=RT*p;a*=.5;}return s/.9375;}',
    'float fbm2(vec2 p){float s=.5*vn(p);p=RT*p;s+=.25*vn(p);return s/.75;}',
    // voronoi: x = F1, y = F2-F1 (crack distance), zw = vector to the nearest plate centre
    'vec4 voro(vec2 p,float t){vec2 i=floor(p),f=fract(p);float f1=8.,f2=8.;vec2 b=vec2(0.);',
    ' for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 o=h22(i+g);o=.5+.36*sin(t+6.2831*o);vec2 r=g+o-f;float d=dot(r,r);',
    '  if(d<f1){f2=f1;f1=d;b=r;}else if(d<f2){f2=d;}}',
    ' f1=sqrt(f1);f2=sqrt(f2);return vec4(f1,f2-f1,b);}',
    'vec3 ramp(float h,float pv){return texture2D(uPal,vec2((clamp(h,0.,1.)*4.+.5)/8.,pv)).rgb;}',
    'void main(){',
    ' vec2 fc=gl_FragCoord.xy;float sx=fc.x/uRes;float sy=uHy+(uSize.y-fc.y)/uRes;',
    ' float s0=(sy-uHy)/(uGy-uHy);',
    // heat haze: a gentle screen-space shimmer, strongest in the middle distance
    ' float hz=uHaze*smoothstep(0.02,0.12,s0)*(1.-smoothstep(0.25,0.9,s0));',
    ' sy+=sin(sx*.11+uT*3.1+sin(sy*.27-uT*1.7)*2.3)*hz*1.6;sx+=sin(sy*.19+uT*2.3)*hz*0.9;',
    ' float s=max((sy-uHy)/(uGy-uHy),.018);float d=uF/s-uF;float z=uCamZ+d;float x=(sx-uCx)/(s*uK)+uCamX;',
    ' float cf=0.;for(int i=0;i<9;i++){cf+=smoothstep(uB[i]-uBW,uB[i]+uBW,z);}',
    ' float pv=(cf+.5)/10.;',
    ' vec4 P1=texture2D(uPal,vec2(5.5/8.,pv)),P2=texture2D(uPal,vec2(6.5/8.,pv)),P3=texture2D(uPal,vec2(7.5/8.,pv));',
    ' float flow=P1.x,crust=P1.y,cw=.035+P1.z*.16,warp=P1.w*1.6,ice=P3.x,water=P3.y,rain=P3.z,emi=P3.w;',
    ' float sc=.0105*(.6+P2.w);',
    // pixel footprint in noise units -> fade fine detail far away (no shimmering moire near the horizon)
    ' float fp=uF/(s*s*(uGy-uHy)*uRes)*sc;float det=1.-smoothstep(.12,.55,fp);',
    ' float T=uT;vec2 p=vec2(x,z)*sc;vec2 pf=p+vec2(.25,-1.)*flow*T*.055;',
    ' vec2 q=vec2(fbm(pf*.7+vec2(0.,T*.035*flow)),fbm(pf*.7+vec2(5.2,1.3)-T*.03*flow));',
    ' vec2 pw=pf+warp*(q-.5);',
    ' float r=fbm(pw*1.3+q*1.1+vec2(T*.02*flow,0.));',
    ' vec4 v=voro(pw*1.9,T*.12*flow+ice*0.);',
    ' float crack=1.-smoothstep(0.,cw,v.y);float halo=exp(-v.y*v.y/(cw*cw*10.));',
    ' float grain=fbm2(pw*8.);',
    ' float plate=.05+.15*r+.07*grain*det-.07*v.x;',
    ' float pool=smoothstep(.56,.76,r);',
    ' float ridge=pow(1.-abs(2.*fbm2(pw*2.6+q*2.)-1.),5.);',
    ' float molten=.46+.42*r+.22*ridge*det;',
    ' float crustH=plate+.22*halo+.85*crack*mix(.55,1.,det);',
    ' float hc=mix(crustH,.58+.34*r+.1*ridge*det,pool*(1.-crust*.55));',
    ' float cw2=clamp(crust*1.6,0.,1.);',
    ' float heat=mix(molten,hc,cw2);',
    ' heat*=.9+.1*sin(T*1.7+v.x*9.+r*6.);',
    // Cocytus ice: frosted plates, white cracks, cold depth
    ' float hi=.30+.22*r+.10*grain*det+.62*crack*det-.08*v.x;',
    // Styx swamp: murky water with faint glowing veins
    ' float hw=.10+.34*r*r+.38*ridge*det;',
    ' heat=mix(heat,hi,ice);heat=mix(heat,hw,water);',
    // micro-eruptions: one bubble per world cell, most visible where the crust cracks or the lava is open
    ' float bub=0.,bring=0.,bspec=0.,bdark=0.;',
    ' if(P2.x>.01&&det>.05){',
    '  vec2 bp=(vec2(x,z)+vec2(0.,-T*flow*6.))/34.;vec2 bi=floor(bp);vec2 bf=fract(bp)-.5;',
    '  float hb=h21(bi+17.);',
    '  if(hb<P2.x){',
    '   float per=2.4+h21(bi+5.)*4.5;float lt=mod(T+hb*31.,per);',
    '   vec2 off=(h22(bi+3.)-.5)*.3;vec2 dv=(bf-off)*vec2(1.,1.);float dist=length(dv);',
    '   float R=(.10+.12*h21(bi+9.))*(.5+P2.y);',
    '   float mask=clamp(halo*1.6+pool+(1.-crust)+water,0.,1.);',
    '   if(lt<1.){float rr=R*(.25+.75*smoothstep(0.,1.,lt));float dome=1.-smoothstep(rr*.82,rr,dist);',
    '    float rim=smoothstep(rr*.45,rr*.98,dist)*dome;bub=dome*mask;bdark=(1.-rim)*dome*mask;bring=rim*mask;',
    '    bspec=(1.-smoothstep(0.,rr*.35,length(dv-vec2(-.3,-.35)*rr)))*dome*mask;}',
    '   else if(lt<1.6){float k=(lt-1.)/.6;float rr=R*(1.+1.4*k);float w=R*.22*(1.-k*.5);',
    '    bring=exp(-pow((dist-rr)/w,2.))*(1.-k)*mask;bub=(1.-smoothstep(0.,R*.75,dist))*pow(1.-k,2.)*mask*1.4;}',
    '  }',
    ' }',
    ' float hotB=bub-bdark*.5;',
    ' heat=mix(heat,.25+.1*r,bdark*crust*(1.-water)*.9);',
    ' heat+=bring*.55+max(hotB,0.)*.5*(1.-bdark);',
    // rain ripples (Gluttony)
    ' if(rain>.01&&det>.05){vec2 rp=vec2(x,z)/22.;vec2 ri=floor(rp);vec2 rf=fract(rp)-.5-(h22(ri)-.5)*.4;float rl=fract(T*.9+h21(ri+2.));float rd=length(rf);',
    '  heat+=rain*exp(-pow((rd-rl*.45)/.035,2.))*(1.-rl)*.35*det;}',
    // collapse eruption: a hot ripple from the hole
    ' if(uErupt.w>0.){float ed=length(vec2(x,z)-uErupt.xy);float ea=uErupt.z;float er=ea*190.;',
    '  heat+=uErupt.w*(exp(-pow((ed-er)/(30.+ea*40.),2.))*(1.-smoothstep(.2,1.6,ea))*.7+exp(-ed*ed/(3600.))*(1.-smoothstep(0.,1.2,ea)));}',
    ' vec3 col=ramp(heat,pv);',
    ' vec3 hot=ramp(.8,pv);',
    // emissive bloom from the cracks / hot spots (HDR-ish overbright, toned down for ice + water)
    ' col+=hot*(halo*.22*crust*(1.-water)+pow(clamp(heat,0.,1.),3.)*.32)*emi;',
    // glossy crust plates: a soft specular on the far-facing side of each plate + bubble highlights
    ' float gl=pow(clamp(1.-v.x*1.3,0.,1.),3.)*smoothstep(-.05,.35,-v.w)*crust*P2.z*det;',
    ' col+=vec3(1.,.92,.8)*gl*.16*(1.-water)+vec3(1.,.95,.85)*bspec*.55;',
    ' if(ice>.01){float sp=h21(floor(vec2(x,z)/3.)+floor(T*2.));col+=ice*vec3(.9,.97,1.)*step(.996,sp)*det*1.5;col+=ice*vec3(.75,.9,1.)*gl*.5;}',
    ' if(water>.01){col+=water*vec3(.5,1.,.75)*pow(ridge,3.)*.18*det;}',
    ' col=mix(col,ramp(mix(.5,.3,cw2*(1.-water)),pv)*1.05,(1.-det)*.75);',
    ' gl_FragColor=vec4(col,1.);',
    '}'
  ].join('\n');

  function hex(c) { c = c.replace('#', ''); var n = parseInt(c, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }

  function LavaGL(palettes) {
    var cv = document.createElement('canvas'), gl = null, prog = null, loc = {}, tex = null, ok = false, lost = false;
    try {
      var o = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' };
      gl = cv.getContext('webgl', o) || cv.getContext('experimental-webgl', o);
    } catch (e) { gl = null; }
    if (!gl) return null;
    var hp = gl.getShaderPrecisionFormat && gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (!hp || hp.precision < 16) return null; // mediump-only GPUs: keep the Canvas2D hazard (world coords need highp)
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('lava shader:', gl.getShaderInfoLog(s)); return null; } return s; }
    function build() {
      var v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, FS); if (!v || !f) return false;
      prog = gl.createProgram(); gl.attachShader(prog, v); gl.attachShader(prog, f); gl.bindAttribLocation(prog, 0, 'a'); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('lava link:', gl.getProgramInfoLog(prog)); return false; }
      gl.useProgram(prog);
      ['uSize', 'uRes', 'uHy', 'uGy', 'uCx', 'uK', 'uF', 'uCamZ', 'uCamX', 'uT', 'uBW', 'uHaze', 'uDetail', 'uB', 'uPal', 'uErupt'].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n === 'uB' ? 'uB[0]' : n); });
      var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      // palette texture 8 x 10 (RGBA8): 5 ramp stops + 3 parameter texels per circle row
      var data = new Uint8Array(8 * 10 * 4);
      for (var c = 0; c < 10; c++) {
        var pal = palettes[c] || palettes[0], P = PARAMS[c], ramp5 = GL_RAMP[c] || pal.lava;
        for (var j = 0; j < 5; j++) { var rgb = hex(ramp5[j]), o2 = (c * 8 + j) * 4; data[o2] = rgb[0]; data[o2 + 1] = rgb[1]; data[o2 + 2] = rgb[2]; data[o2 + 3] = 255; }
        for (var k = 0; k < 3; k++) for (var m = 0; m < 4; m++) data[(c * 8 + 5 + k) * 4 + m] = Math.round(Math.max(0, Math.min(1, P[k][m])) * 255);
      }
      tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 8, 10, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(loc.uPal, 0);
      return true;
    }
    ok = build();
    if (!ok) return null;
    cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; }, false);
    cv.addEventListener('webglcontextrestored', function () { lost = !build(); }, false);
    var borders = new Float32Array(9);
    return {
      canvas: cv,
      ok: function () { return ok && !lost; },
      /** o: {w, h (css px of the lava region), res, hy, gy, cx, K, F, camZ, camX, t, borders[9], bw, haze, erupt[4]} (hy is relative to the region top) */
      render: function (o) {
        if (!ok || lost) return false;
        var pw = Math.max(16, Math.round(o.w * o.res)), ph = Math.max(16, Math.round(o.h * o.res));
        if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
        gl.viewport(0, 0, pw, ph);
        for (var i = 0; i < 9; i++) borders[i] = o.borders[i] == null ? 1e7 : o.borders[i];
        gl.uniform2f(loc.uSize, pw, ph); gl.uniform1f(loc.uRes, o.res);
        gl.uniform1f(loc.uHy, o.hy); gl.uniform1f(loc.uGy, o.gy); gl.uniform1f(loc.uCx, o.cx); gl.uniform1f(loc.uK, o.K); gl.uniform1f(loc.uF, o.F);
        gl.uniform1f(loc.uCamZ, o.camZ); gl.uniform1f(loc.uCamX, o.camX); gl.uniform1f(loc.uT, o.t % 3600);
        gl.uniform1f(loc.uBW, o.bw); gl.uniform1f(loc.uHaze, o.haze); gl.uniform1f(loc.uDetail, o.detail || 1);
        gl.uniform1fv(loc.uB, borders); gl.uniform4fv(loc.uErupt, o.erupt || [0, 0, 0, 0]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return true;
      }
    };
  }
  root.LavaGL = LavaGL;
  root.LavaGL.PARAMS = PARAMS;
})(this);
