// Through the door. The straight-on photo is rebuilt as a real space by ray casting in a shader:
// a ground plane, the facade plane, and the actual door leaf hinged on its left edge, all textured
// from the original photo by projecting back through the camera that took it. Every pixel is John's.
(function () {
  const { clamp, map, lerp, smooth, expoInOut, capture, reduced } = CWG;
  const canvas = document.getElementById('gl');
  const stage = document.querySelector('.stage');
  const root = document.documentElement;
  const opts = { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: capture };
  const gl = !reduced || capture ? canvas.getContext('webgl2', opts) : null;
  if (!gl) { root.classList.add('static'); return; }

  // Measured from the photo in 2000 x 1334 units. Paver joints meet at VP, so the camera sits
  // square on the door. 204.5 units per metre on the facade, door leaf taken as 2.44 m tall.
  const F0 = 1500, VP = [1052, 716], C0 = [-0.02, 1.27, 7.33];
  const ZEND = -0.35, ZB = 40;

  const FS = `#version 300 es
  precision highp float;
  uniform sampler2D T1, T3;
  uniform vec2 R, C;
  uniform float S, TH, SHARP, DARK, TIME, M;
  uniform vec2 C3;
  uniform vec3 CAM;
  uniform vec4 HOLE;
  out vec4 o;
  const float F0=${F0.toFixed(1)};
  const vec2 VP=vec2(${VP[0].toFixed(1)},${VP[1].toFixed(1)});
  const vec3 C0=vec3(${C0.map(v => v.toFixed(3)).join(',')});
  const float XL=-.484, XR=.484, HD=2.44, JD=.2, ZB=${ZB.toFixed(1)}, ZEND=${ZEND.toFixed(2)};
  const vec2 P=vec2(2000.,1334.);
  const vec3 PLASTER=vec3(.925,.906,.871);

  vec2 proj(vec3 p){ float d=C0.z-p.z; return vec2(VP.x+F0*(p.x-C0.x)/d, VP.y-F0*(p.y-C0.y)/d); }
  vec3 house(vec2 u){
    vec2 uv=u/P; vec3 c=texture(T1,uv).rgb;
    if(SHARP>.01){ vec2 e=1.2/vec2(2500.,1667.);
      vec3 b=(texture(T1,uv+vec2(e.x,0.)).rgb+texture(T1,uv-vec2(e.x,0.)).rgb+texture(T1,uv+vec2(0.,e.y)).rgb+texture(T1,uv-vec2(0.,e.y)).rgb)*.25;
      c+= (c-b)*SHARP; }
    return c;
  }
  vec3 inside(vec3 O, vec3 D){
    // what you see once a ray has gone through the door opening
    float best=1e9; vec3 col=vec3(0.);
    float tb=O.z+ZB; best=tb;
    vec2 scr=vec2(gl_FragCoord.x,R.y-gl_FragCoord.y)-.5*R;
    col=texture(T3,(C3+scr/(S*M))/P).rgb;
    // reveal of the opening
    if(O.z>-JD){
      float tz=O.z+JD; float tj=1e9; int side=0;
      if(D.x>0.){ float t=(XR-O.x)/D.x; if(t<tj){tj=t;side=1;} } else if(D.x<0.){ float t=(XL-O.x)/D.x; if(t<tj){tj=t;side=1;} }
      if(D.y>0.){ float t=(HD-O.y)/D.y; if(t<tj){tj=t;side=2;} } else if(D.y<0.){ float t=-O.y/D.y; if(t<tj){tj=t;side=3;} }
      if(tj<tz && tj>0. && tj<best){
        best=tj; float zz=clamp(-(O.z+D.z*tj)/JD,0.,1.);
        col = side==1? mix(vec3(.15,.155,.16),vec3(.26,.265,.27),zz) : side==2? vec3(.09,.09,.095) : mix(vec3(.3,.3,.29),vec3(.42,.41,.39),zz);
      }
    }
    // the door leaf itself, swung inward on its left hinge
    float c=cos(TH), s=sin(TH);
    vec3 H=vec3(XL,0.,0.), T=vec3(c,0.,-s), N=vec3(s,0.,c);
    float dn=dot(D,N);
    if(abs(dn)>1e-4){
      float t=dot(H-O,N)/dn;
      if(t>0. && t<best){
        vec3 p=O+D*t; float a=dot(p-H,T);
        if(a>=0. && a<=XR-XL && p.y>=0. && p.y<=HD){
          vec3 d=house(proj(vec3(XL+a,p.y,0.)));
          d*=mix(1.,.56,sin(TH));
          d*=mix(mix(1.,.7,sin(TH)),1.,smoothstep(0.,.16,a));
          if(a>XR-XL-.014) d*=.5;
          col=d;
        }
      }
    }
    return col;
  }
  void main(){
    vec2 px=vec2(gl_FragCoord.x, R.y-gl_FragCoord.y);
    if(px.x<HOLE.x||px.x>HOLE.z||px.y<HOLE.y||px.y>HOLE.w){ o=vec4(PLASTER,1.); return; }
    vec2 p=C+(px-.5*R)/S;
    vec3 D=vec3((p.x-VP.x)/F0,(VP.y-p.y)/F0,-1.);
    vec3 O=CAM, col;
    if(O.z>0.){
      float tF=O.z, tG=D.y<0.?O.y/(-D.y):1e9;
      if(tG<tF){ col=house(proj(O+D*tG)); col*=DARK; }
      else{
        vec3 F=O+D*tF;
        if(F.x>XL&&F.x<XR&&F.y>0.&&F.y<HD) col=inside(O,D);
        else col=house(proj(F))*DARK;
      }
    } else col=inside(O,D);
    // a little film grain keeps the close-up from looking like a stretched photo
    float g=fract(sin(dot(px+TIME,vec2(12.9898,78.233)))*43758.5453)-.5;
    col+=g*.016;
    o=vec4(col,1.);
  }`;
  const VS = `#version 300 es
  void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); gl_Position=vec4(p*2.-1.,0.,1.); }`;

  function sh(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog); gl.useProgram(prog);
  gl.bindVertexArray(gl.createVertexArray());
  const U = n => gl.getUniformLocation(prog, n);
  const u = { M: U('M'), C3: U('C3'), R: U('R'), C: U('C'), S: U('S'), TH: U('TH'), SHARP: U('SHARP'), DARK: U('DARK'), TIME: U('TIME'), CAM: U('CAM'), HOLE: U('HOLE') };

  function texture(unit, img) {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const a = gl.getExtension('EXT_texture_filter_anisotropic');
    if (a) gl.texParameterf(gl.TEXTURE_2D, a.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(a.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  }
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

  const el = {
    copy: document.getElementById('heroCopy'), hint: document.getElementById('hint'), end: document.getElementById('endCopy'),
    scrim: document.getElementById('scrim'), capL: document.getElementById('capL'), capR: document.getElementById('capR'), nav: document.querySelector('.nav'),
  };
  let W = 0, H = 0, intro = 0, introStart = 0, ready = false;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, capture ? 1 : 1.5);
    W = Math.round(canvas.clientWidth * dpr); H = Math.round(canvas.clientHeight * dpr);
    const over = Math.sqrt((W * H) / 3.4e6);
    if (over > 1) { W = Math.round(W / over); H = Math.round(H / over); }
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    gl.viewport(0, 0, W, H);
  }
  const startC = () => [innerWidth / innerHeight < 1 ? 1056 : 1000, 667];

  function draw(p) {
    if (!ready) return;
    const S = Math.max(W / 2000, H / 1334);
    const q = clamp(p / 0.92);
    const walk = ZEND + (C0[2] - ZEND) * Math.pow(1 - q, 1.35);
    const it = expoInOut(intro);
    const z = intro < 1 ? lerp(6.75, C0[2], it) : walk;
    const th = 1.66 * smooth(map(q, 0.27, 0.64));
    const k = smooth(map(q, 0, 0.42));
    const c0 = startC();
    const cx = lerp(c0[0], VP[0], k), cy = lerp(c0[1], VP[1], k);

    // the door-shaped window at the start grows from the door assembly out to the full screen
    const sx = X => W / 2 + (VP[0] + F0 * (X - C0[0]) / z - cx) * S;
    const sy = Y => H / 2 + (VP[1] - F0 * (Y - C0[1]) / z - cy) * S;
    const hole = intro >= 1 ? [-1, -1, W + 1, H + 1] : [lerp(sx(-0.508), -1, it), lerp(sy(3.28), -1, it), lerp(sx(0.508), W + 1, it), lerp(sy(0), H + 1, it)];

    gl.uniform2f(u.R, W, H); gl.uniform2f(u.C, cx, cy); gl.uniform1f(u.S, S); gl.uniform1f(u.TH, th);
    gl.uniform3f(u.CAM, lerp(C0[0], 0, k), C0[1], z);
    gl.uniform4f(u.HOLE, hole[0], hole[1], hole[2], hole[3]);
    gl.uniform1f(u.SHARP, clamp(((S * C0[2]) / Math.max(z, 0.3) / 1.25 - 0.9) * 0.55, 0, 0.8));
    gl.uniform1f(u.DARK, lerp(1, 0.3, smooth(map(z, 1.5, 0.15))));
    gl.uniform1f(u.TIME, capture ? 1 : (performance.now() / 1000) % 10);
    const g = smooth(map(z, 4.5, ZEND));
    gl.uniform1f(u.M, lerp(1, 1.12, g));
    gl.uniform2f(u.C3, lerp(1000, 970, g), lerp(667, 700, g));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // type
    const shown = intro >= 1;
    el.copy.style.opacity = shown ? 1 - map(p, 0.012, 0.07) : map(intro, 0.72, 1);
    el.hint.style.opacity = shown ? 1 - map(p, 0.012, 0.05) : map(intro, 0.8, 1);
    el.capL.style.opacity = el.capR.style.opacity = 1 - map(intro, 0.05, 0.3);
    const e = map(p, 0.885, 0.97);
    el.end.style.opacity = e; el.scrim.style.opacity = e;
    el.end.classList.toggle('live', e > 0.5);
    el.nav.classList.toggle('hide-links', intro < 0.7);
    el.nav.style.opacity = intro < 1 ? 1 : Math.max(1 - map(p, 0.02, 0.07), map(p, 0.86, 0.94));
  }

  const driver = CWG.driver(stage, p => draw(p), () => {
    if (intro >= 1 || !ready) return false;
    intro = clamp((performance.now() - introStart - 500) / 1700);
    return intro < 1;
  });

  addEventListener('resize', () => { resize(); driver.wake(); });
  CWG.ready = Promise.all([load('assets/img/house-front.webp'), load('assets/img/pavilion.webp')]).then(([a, b]) => {
    texture(0, a); texture(1, b);
    gl.uniform1i(U('T1'), 0); gl.uniform1i(U('T3'), 1);
    resize(); ready = true;
    intro = capture || scrollY > 40 ? 1 : 0;
    introStart = performance.now();
    draw(CWG.progress(stage)); driver.wake();
  });
  window.__seek = p => { draw(p); };
  window.__intro = t => { intro = t; draw(0); };
})();
