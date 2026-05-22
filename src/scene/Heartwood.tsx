import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneState } from '../audio/useAudioEngine';
import { paletteFor, tintForTimeOfDay } from '../audio/scenes';
import { FADE_TAU, PALETTE_TAU } from './sceneConstants';

type Props = {
  stateRef: React.RefObject<SceneState>;
  trebleRef: React.RefObject<number>;
  visible: boolean;
};

// ───── Fire glow ─────────────────────────────────────────────────────
// Strong radial bloom anchored above the tipi's base. Sits IN FRONT of
// the orb in render order so the warm halo reads even against the orb.

const glowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glowFragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uWarm;
  uniform vec3 uAccent;
  varying vec2 vUv;

  void main() {
    // Anchor at the centre of the plane — the plane itself is positioned
    // so this point lands where the tipi tops converge. Squashed
    // vertically so the bloom reads as fire glowing upward.
    vec2 c = (vUv - vec2(0.5, 0.5)) * vec2(1.0, 1.5);
    float d = length(c);

    // Bright hot core + softer outer halo.
    float core = exp(-d * 5.0);
    float halo = exp(-d * 1.5);

    // Two non-harmonic sines for irregular flicker.
    float flicker = 0.75 + 0.25 * sin(uTime * 4.2 + sin(uTime * 6.7) * 1.8);

    // Warm-hot center (pulled away from white so it reads as fire, not
    // a star flare) fading to the scene's warm tone in the halo.
    vec3 hot = mix(uAccent, vec3(1.0, 0.78, 0.55), core * 0.8);
    vec3 col = mix(uWarm, hot, smoothstep(0.0, 0.55, core + halo * 0.4));

    float intensity = (core * 1.4 + halo * 0.9) * flicker;
    float alpha = intensity * uOpacity;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(col * intensity, alpha);
  }
`;

// ───── Tipi sticks ───────────────────────────────────────────────────
// Four cylinders leaning in toward a shared top point above the fire's
// hot core. Each stick is positioned so its TOP converges near (0, -1.1)
// and its BOTTOM splays outward — the classic tipi/campfire-pile shape.
// The two `lean.z`-rotated sticks splay left/right; the two `lean.x`-
// rotated sticks splay front/back, giving a 3D bonfire silhouette.

type LogDef = {
  pos: [number, number, number];
  rot: [number, number, number];
};
const STICK_LENGTH = 1.7;
const STICK_RADIUS = 0.07;
const LEAN = 0.55; // ~31° tilt — splays bottoms wide enough to read as a pile

const LOGS: LogDef[] = [
  // Left-leaning (top tilts right toward center, bottom splays left)
  { pos: [-0.55, -2.05, -3.0], rot: [0, 0,  LEAN] },
  // Right-leaning
  { pos: [ 0.55, -2.05, -3.0], rot: [0, 0, -LEAN] },
  // Back-leaning (top tilts toward camera, bottom away)
  { pos: [ 0.00, -2.05, -3.55], rot: [-LEAN, 0, 0] },
  // Front-leaning
  { pos: [ 0.00, -2.05, -2.45], rot: [ LEAN, 0, 0] },
];

export function Heartwood({ stateRef, trebleRef, visible }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const glowMatRef = useRef<THREE.ShaderMaterial>(null);

  const logMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#0a0608'),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  );

  const tmpColor = useMemo(() => new THREE.Color(), []);
  const tmpVec   = useMemo(() => new THREE.Vector3(), []);

  const glowUniforms = useMemo(
    () => ({
      uTime:    { value: 0 },
      uOpacity: { value: 0 },
      uWarm:    { value: new THREE.Vector3(0.92, 0.62, 0.42) },
      uAccent:  { value: new THREE.Vector3(1.00, 0.50, 0.30) },
    }),
    [],
  );

  const opacityRef = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 24);

    const target = visible ? 1 : 0;
    const fadeRate = 1 - Math.exp(-dt / FADE_TAU);
    opacityRef.current += (target - opacityRef.current) * fadeRate;

    logMat.opacity = opacityRef.current;
    logMat.visible = opacityRef.current > 0.005;
    if (glowMatRef.current) {
      glowMatRef.current.uniforms.uTime.value += dt;
      const trebleBoost = 1 + trebleRef.current * 0.30;
      glowMatRef.current.uniforms.uOpacity.value = opacityRef.current * trebleBoost;
    }

    if (groupRef.current) groupRef.current.visible = opacityRef.current > 0.005;

    if (opacityRef.current > 0.005) {
      const pal = tintForTimeOfDay(paletteFor(stateRef.current.sceneId));
      const rate = 1 - Math.exp(-dt / PALETTE_TAU);

      // Logs: very dark with a faint cool undertone so they don't read
      // pitch-black against the warm glow.
      tmpColor.setRGB(pal.cool[0] * 0.18, pal.cool[1] * 0.18, pal.cool[2] * 0.18);
      logMat.color.lerp(tmpColor, rate);

      if (glowMatRef.current) {
        (glowMatRef.current.uniforms.uWarm.value as THREE.Vector3).lerp(
          tmpVec.set(pal.warm[0], pal.warm[1], pal.warm[2]),
          rate,
        );
        (glowMatRef.current.uniforms.uAccent.value as THREE.Vector3).lerp(
          tmpVec.set(pal.accent[0], pal.accent[1], pal.accent[2]),
          rate,
        );
      }
    }
  });

  return (
    <group ref={groupRef} renderOrder={-1} visible={false}>
      {/* Glow plane sits between the tipi and camera; its centre lands
          where the tipi tops converge so the bloom reads as fire at the
          peak of the pile. */}
      <mesh position={[0, -1.3, -2.5]} renderOrder={2}>
        <planeGeometry args={[6, 4]} />
        <shaderMaterial
          ref={glowMatRef}
          vertexShader={glowVertex}
          fragmentShader={glowFragment}
          uniforms={glowUniforms}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {LOGS.map((log, i) => (
        <mesh key={i} position={log.pos} rotation={log.rot} material={logMat}>
          <cylinderGeometry args={[STICK_RADIUS, STICK_RADIUS, STICK_LENGTH, 8]} />
        </mesh>
      ))}
    </group>
  );
}
