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
// A horizontal plane filling the lower half of the frame. Distinct
// reading:
//   • A bright horizon line at the top edge of the water (where sea
//     meets sky) — the strongest single anchor in the scene.
//   • Horizontal shimmer bands tilted with perspective so the closer
//     bands read wider; the bands ride drifting value-noise so the
//     waves are never uniform.
//   • A vertical moonlight streak directly under the centered orb.

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
    float t = uTime * 0.18;

    // Body color: deep cool below, lighter cool near the horizon.
    vec3 deep   = uCool * 0.5;
    vec3 shallow = mix(uCool, uAccent, 0.45);
    vec3 col = mix(deep, shallow, smoothstep(0.0, 0.95, vUv.y));

    // ── Horizon line — a bright thin band right at the top of the
    // plane, where sea meets sky. This is the strongest anchor.
    float horizon = smoothstep(0.04, 0.0, abs(vUv.y - 0.96));
    col = mix(col, mix(uAccent, uWarm, 0.4), horizon * 0.85);

    // ── Shimmer bands. Bands get denser/finer toward the horizon for
    // perspective. Each band's brightness is gated by drifting noise so
    // the wave field looks irregular.
    float perspective = mix(8.0, 36.0, vUv.y); // few bands near, many near horizon
    float bandY = vUv.y * perspective - t * 0.7;
    float bands = sin(bandY) * 0.5 + 0.5;
    bands = pow(bands, 3.0);
    float wave = vnoise(vec2(vUv.x * 4.0 - t * 0.4, vUv.y * 5.0 + t * 0.3));
    float shimmer = bands * smoothstep(0.25, 0.80, wave);

    // Brighten shimmer as we approach the horizon (catches more sky).
    shimmer *= 0.5 + 0.9 * vUv.y;
    col += mix(uAccent, uWarm, 0.2) * shimmer * 0.85;

    // ── Moonlight streak below the orb (centered horizontally).
    float beamX = abs(vUv.x - 0.5);
    float beamFalloff = exp(-beamX * 11.0);
    float beam = beamFalloff * smoothstep(0.05, 0.85, vUv.y);
    beam *= 0.45 + 0.55 * vnoise(vec2(vUv.x * 14.0, vUv.y * 9.0 - t * 1.5));
    col += mix(uWarm, uAccent, 0.5) * beam * 0.9;

    // The plane fades out at its very top edge so the horizon never
    // shows a hard line above where the band sits.
    float topFade = 1.0 - smoothstep(0.98, 1.0, vUv.y);

    float alpha = uOpacity * topFade;
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
      {/* Wide plane filling the lower half. Horizon (its top edge) sits
          a touch below the orb so the orb reads as a moon on the
          horizon line. */}
      <mesh position={[0, -2.4, -8]}>
        <planeGeometry args={[28, 6]} />
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
