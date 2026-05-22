import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneState } from '../audio/useAudioEngine';
import { SCENE_BY_ID, tintForTimeOfDay } from '../audio/scenes';

type Props = {
  stateRef: React.RefObject<SceneState>;
  trebleRef: React.RefObject<number>;
  visible: boolean;
};

const FADE_TAU = 0.45;
const PALETTE_TAU = 1.0;

// ───── Aurora ribbon ──────────────────────────────────────────────────
// A large horizontal plane in the upper sky with a shader that draws 2-3
// flowing curved bands. Additive blending so it glows over the bg gradient.

const auroraVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const auroraFragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uAccent;       // cyan
  uniform vec3 uWarm;         // soft violet (top)
  uniform vec3 uGreen;        // classic aurora green (bottom)
  varying vec2 vUv;

  // 2D value-noise + 4-octave FBM — the standard ingredient for cloudy /
  // ribbon-like aurora textures.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.55;
    for (int i = 0; i < 4; i++) {
      sum += vnoise(p) * amp;
      p *= 2.0;
      amp *= 0.55;
    }
    return sum;
  }

  void main() {
    float t = uTime * 0.05;

    // Ribbon centerline — sits just above the visible plane so the bright
    // peak is OFF-SCREEN; what we see is the soft cascade flowing down.
    float ribbonY = 0.92
      + 0.05 * sin(vUv.x * 2.0 + t * 0.6)
      + 0.025 * sin(vUv.x * 4.5 + t * 0.4 + 1.4);

    float d = vUv.y - ribbonY; // 0 at ribbon, negative below, positive above

    // Vertical envelope — wide soft crest (no hard line even when it dips in)
    // + long cascade falling DOWN. Cascade decays gently so the glow reaches
    // well into the middle of the sky.
    float crest = exp(-pow(d / 0.12, 2.0));
    float cascade = exp(d * 1.9) * step(d, 0.0); // 1 at ribbon, fades down
    float band = crest * 0.5 + cascade * 1.15;

    // Internal texture: FBM gives organic cloudy/streaky brightness variation,
    // drifting sideways with time. The y-stretch makes ribbons feel vertical.
    vec2 npos = vec2(vUv.x * 3.0 - t * 0.5, vUv.y * 1.8 + t * 0.15);
    float n = fbm(npos);

    // Multiply the band by the noise — wherever noise is bright, the ribbon
    // glows brighter. Floor keeps it from ever fully fading as the noise
    // pattern drifts (so the aurora can't "disappear" mid-scene).
    float ribbon = band * (0.55 + 0.65 * n);

    // ── Subtle vertical rays piercing through the ribbon ──
    // Sharp, narrow vertical streaks that only appear where the ribbon is
    // glowing, fading downward into the cascade. Slight slant for organic feel.
    float slant = 0.08;
    float r1 = abs(sin((vUv.x + vUv.y * slant) * 18.0 + t * 1.0));
    r1 = pow(r1, 9.0);
    float r2 = abs(sin((vUv.x + vUv.y * slant * 1.4) * 47.0 + t * 1.6));
    r2 = pow(r2, 14.0);
    // Slow horizontal masking so rays appear in pockets, not everywhere at once.
    float rayMask = smoothstep(0.4, 0.85, fbm(vec2(vUv.x * 1.6 - t * 0.3, t * 0.2)));
    float rays = (r1 + r2 * 0.7) * rayMask;
    // Gate rays by the band envelope — they live inside the curtain.
    rays *= band;

    float intensity = ribbon + rays * 0.85;

    // ── Color along the cascade: green (deep) → cyan (mid) → violet (crest) ──
    float cPos = clamp((d + 0.42) / 0.50, 0.0, 1.0);
    vec3 lower = mix(uGreen, uAccent, smoothstep(0.05, 0.55, cPos));
    vec3 col   = mix(lower,  uWarm,   smoothstep(0.85, 1.05, cPos));

    float alpha = clamp(intensity, 0.0, 1.0) * uOpacity * 0.95;
    if (alpha < 0.004) discard;

    // Soft brightness boost on the brightest regions for the glow feel.
    gl_FragColor = vec4(col * (0.7 + intensity * 0.5), alpha);
  }
`;

// ───── Snowy mountains ────────────────────────────────────────────────
const mountainVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Three ridges (back/mid/front) sculpted from 1D FBM value noise so the
// peaks never repeat. Atmospheric haze lightens the back range and a faint
// aurora "spill" tints the snow caps cool-green from the lights overhead.
const mountainFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uFrontColor;
  uniform vec3 uBackColor;
  uniform vec3 uSnowColor;
  uniform float uOpacity;
  varying vec2 vUv;

  float hash1(float x) {
    return fract(sin(x * 127.1) * 43758.5453);
  }
  // 1D value noise: smoothed lerp between hashed integers.
  float n1d(float x) {
    float i = floor(x);
    float f = fract(x);
    float u = f * f * (3.0 - 2.0 * f);
    return mix(hash1(i), hash1(i + 1.0), u);
  }
  // 4-octave FBM — organic, non-repeating ridge profiles.
  float fbm1(float x) {
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 4; i++) {
      sum += n1d(x * freq) * amp;
      amp *= 0.5;
      freq *= 2.0;
    }
    return sum;
  }

  void main() {
    // Back: low-frequency rolling, gentle and tall (distant, hazy).
    float hBack  = 0.58 + 0.16 * fbm1(vUv.x * 1.5 + 7.3);
    // Mid: medium frequency, in between.
    float hMid   = 0.44 + 0.18 * fbm1(vUv.x * 2.4 + 17.1);
    // Front: sharpest ridge with a touch of high-freq micro-detail (rocky).
    float hFront = 0.28
      + 0.18 * fbm1(vUv.x * 3.6 + 29.7)
      + 0.035 * fbm1(vUv.x * 13.0 + 4.1);

    // Antialiased silhouette masks (a tiny pixel-scale falloff at each ridge).
    float backMask  = smoothstep(hBack  + 0.004, hBack  - 0.004, vUv.y);
    float midMask   = smoothstep(hMid   + 0.004, hMid   - 0.004, vUv.y);
    float frontMask = smoothstep(hFront + 0.004, hFront - 0.004, vUv.y);

    float anyMask = max(max(backMask, midMask), frontMask);
    if (anyMask * uOpacity < 0.005) discard;

    // Per-layer snow caps. Each is a narrow band just below its own ridge.
    // Bands are wider on the back range (snow feels softer when distant).
    float snowBack  = smoothstep(hBack  - 0.085, hBack  - 0.004, vUv.y) * backMask;
    float snowMid   = smoothstep(hMid   - 0.065, hMid   - 0.004, vUv.y) * midMask;
    float snowFront = smoothstep(hFront - 0.050, hFront - 0.004, vUv.y) * frontMask;

    // Layered colors. Back gets atmospheric haze (pulled toward snow color)
    // so it reads as far away; front stays dark and sharp.
    vec3 hazedBack = mix(uBackColor, uSnowColor, 0.30);
    vec3 midColor  = mix(uBackColor, uFrontColor, 0.55);
    vec3 col = hazedBack;
    col = mix(col, midColor,      midMask);
    col = mix(col, uFrontColor,   frontMask);

    // Apply snow. Distant snow is less saturated white (atmospheric).
    vec3 snowBackCol  = mix(uSnowColor, hazedBack, 0.25);
    vec3 snowMidCol   = mix(uSnowColor, midColor,  0.12);
    vec3 snowFrontCol = uSnowColor;
    col = mix(col, snowBackCol,  snowBack  * 0.55);
    col = mix(col, snowMidCol,   snowMid   * 0.65);
    col = mix(col, snowFrontCol, snowFront * 0.75);

    // Aurora spillover — the snowy caps pick up a faint cool-green tint
    // from the lights overhead. Strongest near the top of the frame.
    vec3 auroraTint = vec3(0.45, 0.85, 0.70);
    float spill = smoothstep(0.30, 0.75, vUv.y);
    float snowAmt = max(max(snowBack, snowMid), snowFront);
    col = mix(col, col * auroraTint * 1.7, snowAmt * spill * 0.18);

    float bottomFade = smoothstep(0.0, 0.18, vUv.y);
    gl_FragColor = vec4(col, anyMask * uOpacity * bottomFade);
  }
`;

export function Aurora({ stateRef, trebleRef, visible }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const auroraMatRef = useRef<THREE.ShaderMaterial>(null);
  const mountainMatRef = useRef<THREE.ShaderMaterial>(null);

  // Shared pine silhouette material for the single lone foreground pine.
  const pineMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#0a0d18'),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  );

  const frontMtnColor = useMemo(() => new THREE.Color(0.10, 0.14, 0.20), []);
  const backMtnColor  = useMemo(() => new THREE.Color(0.18, 0.22, 0.32), []);
  const snowColor     = useMemo(() => new THREE.Color(0.82, 0.86, 0.96), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const tmpVec   = useMemo(() => new THREE.Vector3(), []);

  const auroraUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uAccent: { value: new THREE.Vector3(0.68, 0.86, 1.0) },  // cool cyan
      uWarm:   { value: new THREE.Vector3(0.82, 0.74, 1.0) },  // soft violet (top)
      uGreen:  { value: new THREE.Vector3(0.45, 1.0, 0.65) },  // classic aurora green
    }),
    [],
  );

  const mountainUniforms = useMemo(
    () => ({
      uFrontColor: { value: frontMtnColor },
      uBackColor:  { value: backMtnColor },
      uSnowColor:  { value: snowColor },
      uOpacity:    { value: 0 },
    }),
    [frontMtnColor, backMtnColor, snowColor],
  );

  const opacityRef = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 24);

    const target = visible ? 1 : 0;
    const fadeRate = 1 - Math.exp(-dt / FADE_TAU);
    opacityRef.current += (target - opacityRef.current) * fadeRate;

    if (auroraMatRef.current) {
      auroraMatRef.current.uniforms.uTime.value += dt;
      // Treble subtly intensifies the aurora — high-freq audio = brighter glow.
      const trebleBoost = 1 + trebleRef.current * 0.25;
      auroraMatRef.current.uniforms.uOpacity.value = opacityRef.current * trebleBoost;
    }
    if (mountainMatRef.current) {
      mountainMatRef.current.uniforms.uOpacity.value = opacityRef.current;
    }
    pineMat.opacity = opacityRef.current;

    if (groupRef.current) groupRef.current.visible = opacityRef.current > 0.005;

    if (opacityRef.current > 0.005) {
      const pal = tintForTimeOfDay(SCENE_BY_ID[stateRef.current.sceneId].palette);
      const rate = 1 - Math.exp(-dt / PALETTE_TAU);

      // Aurora bands track scene accent + warm. uniform.value is a Vector3,
      // so use a Vector3 tmp (NOT a Color — different lerp semantics).
      if (auroraMatRef.current) {
        (auroraMatRef.current.uniforms.uAccent.value as THREE.Vector3).lerp(
          tmpVec.set(pal.accent[0], pal.accent[1], pal.accent[2]),
          rate,
        );
        (auroraMatRef.current.uniforms.uWarm.value as THREE.Vector3).lerp(
          tmpVec.set(pal.warm[0], pal.warm[1], pal.warm[2]),
          rate,
        );
      }

      // Pine: darker than mountains, near-black with cool tint.
      tmpColor.setRGB(pal.cool[0] * 0.18, pal.cool[1] * 0.18, pal.cool[2] * 0.18);
      pineMat.color.lerp(tmpColor, rate);

      // Mountains: front darker (0.50× cool), back lighter (0.78× cool).
      tmpColor.setRGB(pal.cool[0] * 0.50, pal.cool[1] * 0.50, pal.cool[2] * 0.50);
      frontMtnColor.lerp(tmpColor, rate);
      tmpColor.setRGB(pal.cool[0] * 0.78, pal.cool[1] * 0.78, pal.cool[2] * 0.78);
      backMtnColor.lerp(tmpColor, rate);

      // Snow: midpoint between scene's warm and a clean blue-white.
      tmpColor.setRGB(
        (pal.warm[0] + 0.92) * 0.5,
        (pal.warm[1] + 0.94) * 0.5,
        (pal.warm[2] + 1.00) * 0.5,
      );
      snowColor.lerp(tmpColor, rate);
    }
  });

  return (
    <group ref={groupRef} renderOrder={-1} visible={false}>
      {/* Aurora curtain — large plane high in the sky, BEHIND the mountains
          so its cascading streamers get cut off by the peaks naturally. */}
      <mesh position={[0, 2.6, -16]}>
        <planeGeometry args={[36, 11]} />
        <shaderMaterial
          ref={auroraMatRef}
          vertexShader={auroraVertex}
          fragmentShader={auroraFragment}
          uniforms={auroraUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Snowy mountain ridges — sits closer than the aurora to occlude its
          lower streamers, like a real mountain horizon does. */}
      <mesh position={[0, -0.6, -14]}>
        <planeGeometry args={[36, 8]} />
        <shaderMaterial
          ref={mountainMatRef}
          vertexShader={mountainVertex}
          fragmentShader={mountainFragment}
          uniforms={mountainUniforms}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* One lone pine in the lower-right foreground for anchoring */}
      <group position={[3.0, -2, -5.5]}>
        <mesh position={[0, 0.45, 0]} material={pineMat}>
          <cylinderGeometry args={[0.03, 0.06, 0.9, 6]} />
        </mesh>
        <mesh position={[0, 1.30, 0]} material={pineMat}>
          <coneGeometry args={[0.46, 1.6, 8]} />
        </mesh>
        <mesh position={[0, 2.20, 0]} material={pineMat}>
          <coneGeometry args={[0.32, 1.3, 8]} />
        </mesh>
        <mesh position={[0, 2.95, 0]} material={pineMat}>
          <coneGeometry args={[0.20, 0.95, 7]} />
        </mesh>
      </group>
    </group>
  );
}
