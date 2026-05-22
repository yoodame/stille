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
// A horizontal plane below the orb. The visual reading is:
//   • A bright horizon line at the top edge (sea-meets-sky anchor).
//   • Caustic-like bright specks scattered across the surface — two
//     scrolling noise fields multiplied + powered so highlights cluster
//     into irregular twinkling pockets, never a stripe pattern.
//   • Long ripple lines drifting slowly horizontally for surface flow.
//   • A vertical moonlight streak under the orb that breaks into
//     shimmering chunks as it travels down the surface.

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
    vec3 deep   = uCool * 0.42;
    vec3 shallow = mix(uCool, uAccent, 0.45);
    vec3 col = mix(deep, shallow, smoothstep(0.0, 0.95, vUv.y));

    // ── Horizon line — bright thin band at the very top of the water.
    float horizon = smoothstep(0.035, 0.0, abs(vUv.y - 0.96));
    col = mix(col, mix(uAccent, uWarm, 0.4), horizon * 0.95);

    // ── Caustic specks — two scrolling noise fields multiplied together
    // then raised to a high power, so highlights cluster into irregular
    // bright pockets that scintillate (instead of striped bands).
    float n1 = vnoise(vec2(vUv.x * 13.0 - t * 0.35, vUv.y * 17.0 + t * 0.75));
    float n2 = vnoise(vec2(vUv.x * 19.0 + t * 0.55, vUv.y * 24.0 - t * 0.45));
    float specks = pow(n1 * n2, 3.5);
    // Specks read denser near the horizon — perspective + glancing angle
    // means more of the sky's light reflects toward the viewer there.
    specks *= 0.4 + 1.4 * smoothstep(0.2, 0.95, vUv.y);
    col += mix(uAccent, uWarm, 0.2) * specks * 4.0;

    // ── Slow ripple lines — long horizontal wave fronts drifting
    // sideways. Much subtler than the old shimmer bands so they read as
    // surface flow rather than venetian-blind stripes.
    float ripple = sin(vUv.y * mix(10.0, 28.0, vUv.y) - t * 0.5 + sin(vUv.x * 3.0 + t * 0.3) * 0.8);
    ripple = pow(ripple * 0.5 + 0.5, 8.0);
    ripple *= smoothstep(0.1, 0.7, vUv.y) * smoothstep(0.95, 0.85, vUv.y);
    col += mix(uAccent, uWarm, 0.15) * ripple * 0.35;

    // ── Moonlight column under the orb. Breaks into shimmering chunks
    // (powered noise) so it reads as moonlight scattered on a moving
    // surface rather than a solid streak.
    float beamX = abs(vUv.x - 0.5);
    float beamFalloff = exp(-beamX * 10.0);
    float beam = beamFalloff * smoothstep(0.05, 0.88, vUv.y);
    float beamChunks = vnoise(vec2(vUv.x * 22.0, vUv.y * 14.0 - t * 1.8));
    beam *= 0.25 + 0.85 * pow(beamChunks, 2.5);
    col += mix(uWarm, uAccent, 0.4) * beam * 1.05;

    // Soft top fade so the horizon doesn't sit against a hard plane edge.
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
      {/* Wide plane sitting low in the frame. The bright horizon line
          lands well below the orb (≈ lower third of the viewport) so
          the orb floats high in the sky with open air around it and
          the water sits as a distinct strip near the bottom. */}
      <mesh position={[0, -5.0, -8]}>
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
