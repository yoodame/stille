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

    // Body color: saturated ocean blue. The boost (red down, blue up)
    // pulls the cool palette toward unambiguous ocean blue, and the
    // brightness is high enough that the water reads as a distinct
    // surface against the dark indigo bottom of the bg gradient.
    vec3 blueBoost = vec3(0.65, 0.95, 1.35);
    vec3 deep   = uCool * 0.65 * blueBoost;
    vec3 shallow = uCool * 1.05 * blueBoost;
    vec3 col = mix(deep, shallow, smoothstep(0.0, 0.95, vUv.y));

    // ── Horizon — a soft blue seam where sea meets sky. Stays in the
    // cool palette so the water never reads as warm/shiny.
    float horizon = smoothstep(0.030, 0.0, abs(vUv.y - 0.96));
    col = mix(col, mix(uCool, uAccent, 0.50) * blueBoost, horizon * 0.35);

    // ── Orb reflection ───────────────────────────────────────────────
    // The orb mirrored on the water directly below it: a narrow streak
    // descending from the horizon line down into the foreground,
    // broken into chunks by drifting noise so it scintillates like
    // reflected light on a moving surface. Kept dim enough that it
    // doesn't bloom into a wide silver band.
    float reflX = abs(vUv.x - 0.5);
    float reflStreakX = exp(-reflX * 28.0);
    float reflStreakY = smoothstep(0.05, 0.96, vUv.y);
    float reflShimmer = vnoise(vec2(vUv.x * 30.0, vUv.y * 18.0 - t * 1.6));
    float reflStreak = reflStreakX * reflStreakY * (0.15 + 0.85 * pow(reflShimmer, 3.0));
    vec3 orbColor = mix(uWarm, vec3(1.0, 0.88, 0.72), 0.55);
    col += orbColor * reflStreak * 0.40;

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
