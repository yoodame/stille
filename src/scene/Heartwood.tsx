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
// A soft radial bloom anchored above the log pile, additively blended so
// it tints the lower half of the screen warm. Flicker is irregular —
// nested sines rather than a clean oscillator.

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
    // Anchor a touch above the bottom-center, vertically stretched.
    vec2 c = (vUv - vec2(0.5, 0.18)) * vec2(1.0, 1.4);
    float d = length(c);

    // Soft exponential falloff.
    float glow = exp(-d * 2.6);

    // Irregular flicker: two non-harmonic sines combined.
    float flicker = 0.82 + 0.18 * sin(uTime * 3.7 + sin(uTime * 6.1) * 1.5);

    // Hot accent at the core, warm cast in the bloom.
    vec3 col = mix(uWarm, uAccent, smoothstep(0.0, 0.45, glow));

    float alpha = glow * uOpacity * flicker * 0.85;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(col * (1.0 + glow * 0.6), alpha);
  }
`;

// ───── Log pile ──────────────────────────────────────────────────────
// Five thin cylinder silhouettes arranged in a tipi-ish stack. Rotations
// are picked for visual rhythm; nothing about it is procedural.
type LogDef = {
  pos: [number, number, number];
  rot: [number, number, number];
  length: number;
  radius: number;
};

const LOGS: LogDef[] = [
  { pos: [-0.55, -2.05, -2.5], rot: [0, 0.0,  0.18], length: 1.9, radius: 0.10 },
  { pos: [ 0.55, -2.05, -2.5], rot: [0, 0.0, -0.18], length: 1.9, radius: 0.10 },
  { pos: [ 0.10, -1.85, -2.3], rot: [-0.4, 0.5,  0.0], length: 1.7, radius: 0.085 },
  { pos: [-0.10, -1.85, -2.3], rot: [ 0.4, -0.5, 0.0], length: 1.7, radius: 0.085 },
  { pos: [ 0.00, -1.65, -2.1], rot: [ 0.6, 0.0,  0.0], length: 1.5, radius: 0.075 },
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
    if (glowMatRef.current) {
      glowMatRef.current.uniforms.uTime.value += dt;
      // Treble adds extra brightness — high-freq voices stoke the flame.
      const trebleBoost = 1 + trebleRef.current * 0.30;
      glowMatRef.current.uniforms.uOpacity.value = opacityRef.current * trebleBoost;
    }

    if (groupRef.current) groupRef.current.visible = opacityRef.current > 0.005;

    if (opacityRef.current > 0.005) {
      const pal = tintForTimeOfDay(paletteFor(stateRef.current.sceneId));
      const rate = 1 - Math.exp(-dt / PALETTE_TAU);

      // Logs: very dark with a faint cool undertone so they don't look
      // pitch-black against the warm glow.
      tmpColor.setRGB(pal.cool[0] * 0.20, pal.cool[1] * 0.20, pal.cool[2] * 0.20);
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
      <mesh position={[0, -1.4, -3.2]}>
        <planeGeometry args={[12, 7]} />
        <shaderMaterial
          ref={glowMatRef}
          vertexShader={glowVertex}
          fragmentShader={glowFragment}
          uniforms={glowUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {LOGS.map((log, i) => (
        <mesh key={i} position={log.pos} rotation={log.rot} material={logMat}>
          <cylinderGeometry args={[log.radius, log.radius, log.length, 8]} />
        </mesh>
      ))}
    </group>
  );
}
