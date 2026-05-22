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

// ───── Sea surface ───────────────────────────────────────────────────
// A horizontal plane in the lower half. Horizontal shimmer bands sample
// from value-noise so the waves never repeat. A vertical reflection
// streak sits directly below the centered orb — the "moonlight on water"
// gesture that anchors the scene.

const seaVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const seaFragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uCool;
  uniform vec3 uAccent;
  uniform vec3 uWarm;
  varying vec2 vUv;

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

  void main() {
    float t = uTime * 0.15;

    // Top of the plane is the horizon — fade water in from there downward.
    float horizonFade = smoothstep(0.95, 0.78, vUv.y);

    // Body color: deep sea at the bottom, lighter near the horizon.
    vec3 deep = uCool * 0.55;
    vec3 shallow = mix(uCool, uAccent, 0.35);
    vec3 col = mix(deep, shallow, vUv.y);

    // Shimmer bands — narrow horizontal stripes whose brightness is
    // modulated by drifting value-noise so the waves are never even.
    float bandY = vUv.y * 28.0 - t * 0.6;
    float bands = sin(bandY) * 0.5 + 0.5;
    bands = pow(bands, 4.0);
    float shimmerMask = vnoise(vec2(vUv.x * 3.0 - t * 0.3, vUv.y * 6.0 + t * 0.4));
    float shimmer = bands * smoothstep(0.35, 0.85, shimmerMask);

    // Brightening near the horizon (shallow water catches more sky light).
    shimmer *= 0.4 + 0.8 * vUv.y;

    col += uAccent * shimmer * 0.55;

    // Moonlight streak under the orb — a soft vertical glow column at the
    // center of the plane, broken up by the same wave noise so it shimmers.
    float beamX = abs(vUv.x - 0.5);
    float beam = exp(-beamX * 14.0) * smoothstep(0.30, 0.95, vUv.y);
    beam *= 0.55 + 0.45 * vnoise(vec2(vUv.x * 12.0, vUv.y * 8.0 - t * 1.2));
    col += mix(uAccent, uWarm, 0.3) * beam * 0.55;

    float alpha = horizonFade * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function Coastal({ stateRef, trebleRef, visible }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const seaMatRef = useRef<THREE.ShaderMaterial>(null);

  const tmpVec = useMemo(() => new THREE.Vector3(), []);

  const seaUniforms = useMemo(
    () => ({
      uTime:    { value: 0 },
      uOpacity: { value: 0 },
      uCool:    { value: new THREE.Vector3(0.34, 0.45, 0.58) },
      uAccent:  { value: new THREE.Vector3(0.82, 0.92, 1.00) },
      uWarm:    { value: new THREE.Vector3(0.92, 0.88, 0.75) },
    }),
    [],
  );

  const opacityRef = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 24);

    const target = visible ? 1 : 0;
    const fadeRate = 1 - Math.exp(-dt / FADE_TAU);
    opacityRef.current += (target - opacityRef.current) * fadeRate;

    if (seaMatRef.current) {
      seaMatRef.current.uniforms.uTime.value += dt;
      // Treble sharpens the shimmer — wind on the water reads as treble.
      const trebleBoost = 1 + trebleRef.current * 0.20;
      seaMatRef.current.uniforms.uOpacity.value = opacityRef.current * trebleBoost;
    }

    if (groupRef.current) groupRef.current.visible = opacityRef.current > 0.005;

    if (opacityRef.current > 0.005 && seaMatRef.current) {
      const pal = tintForTimeOfDay(paletteFor(stateRef.current.sceneId));
      const rate = 1 - Math.exp(-dt / PALETTE_TAU);

      (seaMatRef.current.uniforms.uCool.value as THREE.Vector3).lerp(
        tmpVec.set(pal.cool[0], pal.cool[1], pal.cool[2]),
        rate,
      );
      (seaMatRef.current.uniforms.uAccent.value as THREE.Vector3).lerp(
        tmpVec.set(pal.accent[0], pal.accent[1], pal.accent[2]),
        rate,
      );
      (seaMatRef.current.uniforms.uWarm.value as THREE.Vector3).lerp(
        tmpVec.set(pal.warm[0], pal.warm[1], pal.warm[2]),
        rate,
      );
    }
  });

  return (
    <group ref={groupRef} renderOrder={-1} visible={false}>
      {/* Water plane sits in the lower half. Top edge near the horizon line. */}
      <mesh position={[0, -2.6, -10]}>
        <planeGeometry args={[36, 7]} />
        <shaderMaterial
          ref={seaMatRef}
          vertexShader={seaVertex}
          fragmentShader={seaFragment}
          uniforms={seaUniforms}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
