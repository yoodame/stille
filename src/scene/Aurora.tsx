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
// A large plane in the upper sky. Bright crest sits OFF-SCREEN above the
// viewport; what we see is the soft cascade flowing down toward the
// horizon (and fading out before it reaches the centered orb).

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

  // 2D value-noise + 4-octave FBM — organic, non-repeating shimmer.
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

    // Ribbon centerline — sits just above the visible plane.
    float ribbonY = 0.92
      + 0.05 * sin(vUv.x * 2.0 + t * 0.6)
      + 0.025 * sin(vUv.x * 4.5 + t * 0.4 + 1.4);

    float d = vUv.y - ribbonY;

    // Wide soft crest + long cascade falling DOWN.
    float crest = exp(-pow(d / 0.12, 2.0));
    float cascade = exp(d * 1.9) * step(d, 0.0);
    float band = crest * 0.5 + cascade * 1.15;

    // Organic shimmer from drifting FBM noise.
    vec2 npos = vec2(vUv.x * 3.0 - t * 0.5, vUv.y * 1.8 + t * 0.15);
    float n = fbm(npos);
    float ribbon = band * (0.55 + 0.65 * n);

    // Subtle vertical rays inside the curtain.
    float slant = 0.08;
    float r1 = abs(sin((vUv.x + vUv.y * slant) * 18.0 + t * 1.0));
    r1 = pow(r1, 9.0);
    float r2 = abs(sin((vUv.x + vUv.y * slant * 1.4) * 47.0 + t * 1.6));
    r2 = pow(r2, 14.0);
    float rayMask = smoothstep(0.4, 0.85, fbm(vec2(vUv.x * 1.6 - t * 0.3, t * 0.2)));
    float rays = (r1 + r2 * 0.7) * rayMask * band;

    float intensity = ribbon + rays * 0.85;

    // Color along the cascade: green deep → cyan mid → violet near crest.
    float cPos = clamp((d + 0.42) / 0.50, 0.0, 1.0);
    vec3 lower = mix(uGreen, uAccent, smoothstep(0.05, 0.55, cPos));
    vec3 col   = mix(lower,  uWarm,   smoothstep(0.85, 1.05, cPos));

    // Bottom fade — aurora dissolves before reaching the horizon / orb level.
    float bottomFade = smoothstep(0.30, 0.60, vUv.y);

    float alpha = clamp(intensity, 0.0, 1.0) * uOpacity * bottomFade * 0.95;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(col * (0.7 + intensity * 0.5), alpha);
  }
`;

export function Aurora({ stateRef, trebleRef, visible }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const auroraMatRef = useRef<THREE.ShaderMaterial>(null);

  const tmpVec = useMemo(() => new THREE.Vector3(), []);

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

    if (groupRef.current) groupRef.current.visible = opacityRef.current > 0.005;

    if (opacityRef.current > 0.005 && auroraMatRef.current) {
      const pal = tintForTimeOfDay(SCENE_BY_ID[stateRef.current.sceneId].palette);
      const rate = 1 - Math.exp(-dt / PALETTE_TAU);

      // Aurora bands track scene accent + warm. uniform.value is a Vector3,
      // so use a Vector3 tmp (NOT a Color — different lerp semantics).
      (auroraMatRef.current.uniforms.uAccent.value as THREE.Vector3).lerp(
        tmpVec.set(pal.accent[0], pal.accent[1], pal.accent[2]),
        rate,
      );
      (auroraMatRef.current.uniforms.uWarm.value as THREE.Vector3).lerp(
        tmpVec.set(pal.warm[0], pal.warm[1], pal.warm[2]),
        rate,
      );
    }
  });

  return (
    <group ref={groupRef} renderOrder={-1} visible={false}>
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
    </group>
  );
}
