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
  uniform vec3 uAccent;       // cyan/violet
  uniform vec3 uWarm;         // soft violet at curtain crest
  uniform vec3 uGreen;        // aurora green at the cascade base
  varying vec2 vUv;

  void main() {
    float t = uTime * 0.04;

    // Curtain top — undulating S-curve.
    float crestY = 0.80
      + 0.07 * sin(vUv.x * 2.0 + t * 0.6)
      + 0.04 * sin(vUv.x * 5.5 + t * 0.4 + 1.7);

    float d = vUv.y - crestY; // 0 at crest, negative below

    // ── Vertical rays — the key visual feature of real aurora ──
    // Layered sine waves at increasing horizontal frequencies create many
    // narrow bright vertical columns. Lower pow exponent = more columns.
    float c1 = sin(vUv.x * 12.0 + t * 0.7);
    float c2 = sin(vUv.x * 28.0 + t * 1.1 + 1.2);
    float c3 = sin(vUv.x * 62.0 + t * 1.6 + 2.6);
    float c4 = sin(vUv.x * 130.0 + t * 2.2 + 3.7);
    float columns = (c1 + 0.7 * c2 + 0.5 * c3 + 0.35 * c4) / 2.55;
    columns = pow(max(0.0, columns), 1.6); // softer peaks → more columns visible

    // Cascade vertical envelope — strongest just under crest, fading down.
    float vFade = smoothstep(-0.70, -0.01, d);
    // No rays above the crest.
    float belowMask = 1.0 - smoothstep(0.0, 0.04, d);

    float rays = columns * vFade * belowMask * 1.8;

    // Subtle crest line — bright thin band at the top of the cascade,
    // varied by the same columns so it doesn't read as a clean horizontal stroke.
    float crest = exp(-pow(d / 0.014, 2.0)) * (0.2 + 0.8 * columns) * 0.55;

    float intensity = rays + crest;

    // ── Color along the cascade: green (deep) → cyan (mid) → violet (top) ──
    float cPos = clamp((d + 0.60) / 0.65, 0.0, 1.0);
    vec3 lower = mix(uGreen, uAccent, smoothstep(0.05, 0.55, cPos));
    vec3 col   = mix(lower,  uWarm,   smoothstep(0.80, 1.00, cPos));

    float alpha = clamp(intensity, 0.0, 1.0) * uOpacity * 1.0;
    if (alpha < 0.004) discard;

    // Modest brightness boost — preserves color saturation instead of washing
    // everything to white.
    gl_FragColor = vec4(col * (0.85 + intensity * 0.6), alpha);
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

// Jagged peaks via layered triangle-ish waves (saw-tooth-ish via abs(sin)).
const mountainFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uFrontColor;
  uniform vec3 uBackColor;
  uniform vec3 uSnowColor;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    // Back range — taller, lighter, smoother.
    float hBack = 0.55
      + 0.16 * abs(sin(vUv.x * 2.4 + 1.1))
      + 0.06 * abs(sin(vUv.x * 6.0 + 2.8))
      - 0.05;
    float backMask = smoothstep(hBack + 0.002, hBack - 0.002, vUv.y);

    // Front range — lower, darker, jaggier (sharp peaks).
    float hFront = 0.34
      + 0.18 * abs(sin(vUv.x * 3.5 + 0.4))
      + 0.07 * abs(sin(vUv.x * 9.0 + 1.7))
      + 0.03 * abs(sin(vUv.x * 21.0 + 3.1));
    float frontMask = smoothstep(hFront + 0.002, hFront - 0.002, vUv.y);

    float mask = max(backMask, frontMask);
    if (mask * uOpacity < 0.005) discard;

    // Snow cap: near the top of each peak, blend toward white.
    float snowBack  = smoothstep(hBack - 0.06, hBack - 0.002, vUv.y) * backMask;
    float snowFront = smoothstep(hFront - 0.06, hFront - 0.002, vUv.y) * frontMask;
    float snowAmt   = max(snowBack, snowFront);

    vec3 base = mix(uBackColor, uFrontColor, frontMask);
    vec3 col = mix(base, uSnowColor, snowAmt * 0.65);

    float bottomFade = smoothstep(0.0, 0.18, vUv.y);
    gl_FragColor = vec4(col, mask * uOpacity * bottomFade);
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
