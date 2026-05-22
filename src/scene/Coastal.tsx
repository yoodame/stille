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
//   • A soft horizon line where sea meets sky.
//   • Caustic-like bright specks scattered across the surface (two
//     scrolling noise fields multiplied + powered) so highlights cluster
//     into irregular twinkling pockets.
//   • Long ripple lines drifting slowly horizontally for surface flow.
//   • The orb reflected on the water directly below it: a compact disk
//     at the horizon plus a shimmering streak descending toward the
//     viewer, broken into chunks by drifting noise.

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
    // Pulled together so the contrast between body and highlights is
    // softer — the surface reads as moonlit night water, not daylight.
    vec3 deep   = uCool * 0.55;
    vec3 shallow = mix(uCool, uAccent, 0.30);
    vec3 col = mix(deep, shallow, smoothstep(0.0, 0.95, vUv.y));

    // ── Horizon line — softer, not a glowing slash anymore.
    float horizon = smoothstep(0.035, 0.0, abs(vUv.y - 0.96));
    col = mix(col, mix(uAccent, uWarm, 0.4), horizon * 0.50);

    // ── Caustic specks — toned way down. Read as quiet glints, not
    // sparklers.
    float n1 = vnoise(vec2(vUv.x * 13.0 - t * 0.35, vUv.y * 17.0 + t * 0.75));
    float n2 = vnoise(vec2(vUv.x * 19.0 + t * 0.55, vUv.y * 24.0 - t * 0.45));
    float specks = pow(n1 * n2, 3.5);
    specks *= 0.4 + 1.4 * smoothstep(0.2, 0.95, vUv.y);
    col += mix(uAccent, uWarm, 0.2) * specks * 1.6;

    // ── Slow ripple lines — long horizontal wave fronts drifting
    // sideways. Subtle surface flow.
    float ripple = sin(vUv.y * mix(10.0, 28.0, vUv.y) - t * 0.5 + sin(vUv.x * 3.0 + t * 0.3) * 0.8);
    ripple = pow(ripple * 0.5 + 0.5, 8.0);
    ripple *= smoothstep(0.1, 0.7, vUv.y) * smoothstep(0.95, 0.85, vUv.y);
    col += mix(uAccent, uWarm, 0.15) * ripple * 0.22;

    // ── Orb reflection ───────────────────────────────────────────────
    // The orb mirrored onto the water surface directly below it. Two
    // parts working together:
    //   • A compact bright "spot" right at the horizon line where the
    //     orb's image touches the water (the disk of the reflection).
    //   • A long shimmering streak descending from the spot toward the
    //     viewer, broken into chunks by drifting noise so it reads as
    //     scattered highlights on a moving surface rather than a solid
    //     column.
    float reflX = abs(vUv.x - 0.5);
    // Compact disk just under the horizon (matches the orb's projected
    // width on the water).
    float reflSpot = exp(-reflX * reflX * 60.0) * smoothstep(0.84, 0.96, vUv.y);
    // Streak descends from the spot down into the foreground.
    float reflStreakX = exp(-reflX * 12.0);
    float reflStreakY = smoothstep(0.05, 0.96, vUv.y);
    float reflShimmer = vnoise(vec2(vUv.x * 26.0, vUv.y * 16.0 - t * 1.6));
    float reflStreak = reflStreakX * reflStreakY * (0.2 + 0.8 * pow(reflShimmer, 2.5));
    // Warm cream — the orb's body color.
    vec3 orbColor = mix(uWarm, vec3(1.0, 0.88, 0.72), 0.55);
    col += orbColor * (reflSpot * 1.4 + reflStreak * 0.45);

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
