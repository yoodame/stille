// 3D simplex noise — Ashima Arts / Stefan Gustavson, public domain.
// https://github.com/ashima/webgl-noise
const SIMPLEX_3D_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

export const orbVertexShader = /* glsl */ `
${SIMPLEX_3D_GLSL}

uniform float uTime;
uniform float uBass;
uniform float uBeat;
uniform float uHitBell;
uniform float uHitPluck;
uniform float uHitDrum;
uniform float uNoiseAmount;

varying vec3 vNormal;
varying vec3 vViewPos;
varying float vDisp;

void main() {
  vec3 pos = position;
  // Big slow lumps only — no high-freq detail, so the silhouette stays soft.
  float baseFreq = 0.7;
  float n = snoise(pos * baseFreq + vec3(0.0, uTime * 0.14, 0.0));

  // Base shape: slow time-driven breathing. Transient hits (bell/pluck/drum)
  // add bumps — bells ring slowly, plucks pop short, drums punch briefest.
  float breath = sin(uTime * 0.55) * 0.5 + 0.5;            // ~0.09 Hz, one breath ≈ 11s
  float amp =
      0.020
    + breath * 0.010
    + uHitBell  * 0.016
    + uHitPluck * 0.024
    + uHitDrum  * 0.032;
  float displacement = n * amp;
  pos += normal * displacement;
  vDisp = displacement;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  vViewPos = mvPos.xyz;
  vNormal = normalize(normalMatrix * normal);

  gl_Position = projectionMatrix * mvPos;
}
`;

export const orbFragmentShader = /* glsl */ `
precision highp float;

uniform float uMid;
uniform float uTreble;
uniform float uBeat;
uniform float uHitBell;
uniform float uHitPluck;
uniform float uHitDrum;
uniform float uPadAmount;
uniform float uTime;
uniform vec3 uWarm;
uniform vec3 uCool;
uniform vec3 uAccent;

varying vec3 vNormal;
varying vec3 vViewPos;
varying float vDisp;

void main() {
  vec3 viewDir = normalize(-vViewPos);
  float fresnel = 1.0 - max(dot(viewDir, vNormal), 0.0);
  fresnel = pow(fresnel, 2.1);

  // Directional light from upper-right-front for actual shape readability.
  vec3 lightDir = normalize(vec3(0.55, 0.75, 0.45));
  float diffuse = max(dot(vNormal, lightDir), 0.0);
  // Ambient lifts the dark side so it doesn't go pitch black.
  float lighting = 0.42 + diffuse * 0.58;

  // Vertical gradient: cool at the bottom, warm at the top, driven by scene palette.
  float vGrad = clamp(vViewPos.y * 0.72 + 0.5, 0.0, 1.0);
  vec3 body = mix(uCool, uWarm, smoothstep(0.05, 0.95, vGrad));

  // Pad volume shifts the whole body warmer
  body = mix(body, body + uWarm * 0.18, uPadAmount * 0.55);
  body *= lighting;

  // Inner pulse driven by scene accent, gently brightens with the beat,
  // plus a brief flash on transient hits (bell ring / pluck / drum).
  float hitGlow = uHitBell * 0.20 + uHitPluck * 0.30 + uHitDrum * 0.35;
  float pulseStrength = 0.34 + uBeat * 0.18 + hitGlow;
  vec3 pulse = uAccent * pulseStrength * (1.0 - fresnel);

  // Rim: a soft brightening of the warm + a neutral silver, mixed by mid energy
  vec3 silver = vec3(0.90, 0.94, 1.05);
  vec3 rim = mix(silver, uWarm + vec3(0.15), clamp(uMid * 0.4 + uPadAmount * 0.3, 0.0, 1.0));
  float rimStrength = 0.6 + uTreble * 0.22;
  vec3 rimCol = rim * fresnel * rimStrength;

  vec3 col = body * 0.55 + pulse + rimCol;

  // Tiny displacement-driven sparkle on peaks
  col += uAccent * 0.10 * max(vDisp, 0.0) * 3.5;

  gl_FragColor = vec4(col, 1.0);
}
`;

export const backgroundFragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uTreble;
uniform float uPadAmount;
uniform float uDrone;   // 0..1, sum of binaural+noise+pad+subBass volumes
uniform vec3 uWarm;
uniform vec3 uCool;
uniform vec3 uAccent;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  // Top: sandy paper warmed by the scene palette; bottom: deep tinted indigo.
  vec3 paper  = vec3(0.957, 0.937, 0.902);
  vec3 deepBg = vec3(0.075, 0.090, 0.165);
  vec3 top    = mix(paper, uWarm * 0.65 + paper * 0.5, 0.5);
  vec3 bottom = mix(deepBg, uCool * 0.5, 0.55);
  vec3 mid    = mix(bottom, top, 0.32);

  // Drones bend the gradient mid-point slightly + give it size variation.
  // splitShift moves the band where bottom→mid transitions, so the bg "breathes".
  float splitShift = sin(uTime * 0.08) * 0.05 * uDrone;
  float lowEdge  = 0.55 + splitShift;
  float highEdge = 1.05 + splitShift;

  float y = vUv.y;
  vec3 col = mix(bottom, mid, smoothstep(0.0, lowEdge, y));
  col = mix(col, top, smoothstep(lowEdge, highEdge, y));

  // Subtle accent wash from pad volume
  col += uAccent * 0.06 * uPadAmount * (0.5 + 0.4 * sin(uTime * 0.06));

  // Horizontal drift band — speed scales with drone intensity (faster drift when drones are loud).
  float bandSpeed = 0.04 + uDrone * 0.10;
  float band = sin(vUv.y * 6.0 - uTime * bandSpeed) * 0.5 + 0.5;
  col += vec3(0.02, 0.02, 0.04) * band * (0.6 + uTreble * 0.6);

  // Grain density scales with drone — noisier bg when drones are louder.
  float grainAmt = 0.018 + uDrone * 0.030;
  float g = (hash(vUv * 1024.0 + uTime) - 0.5) * grainAmt;
  col += g;

  gl_FragColor = vec4(col, 1.0);
}
`;

export const backgroundVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;
