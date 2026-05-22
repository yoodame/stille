import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneState } from '../audio/useAudioEngine';
import { SCENE_BY_ID, paletteFor } from '../audio/scenes';

const HALO_SIZE = 4.6;

const haloVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const haloFragmentShader = /* glsl */ `
precision highp float;

uniform float uHitBell;
uniform float uHitPluck;
uniform float uHitDrum;
uniform vec3 uAccent;
uniform vec3 uWarm;

varying vec2 vUv;

// Thin ring at the "center" radius, peaking and falling off across "thickness".
float ring(float r, float center, float thickness) {
  return 1.0 - smoothstep(0.0, thickness, abs(r - center));
}

void main() {
  // Distance from plane center in [0, 1] (corners ~sqrt(2)/2 * 2 = 1.41).
  float r = length(vUv - 0.5) * 2.0;

  // Envelope 1.0 = just triggered; envelope 0.0 = decayed.
  // Ring radius grows as envelope decays. Alpha fades with envelope.
  float rBell  = 1.0 - uHitBell;
  float rPluck = 1.0 - uHitPluck;
  float rDrum  = 1.0 - uHitDrum;

  // Tuned to be present but not loud — between the original (too apparent) and
  // the previous pass (too faint).
  float aBell  = ring(r, rBell  * 0.95, 0.045) * uHitBell  * 0.28;
  float aPluck = ring(r, rPluck * 0.75, 0.036) * uHitPluck * 0.36;
  float aDrum  = ring(r, rDrum  * 0.62, 0.030) * uHitDrum  * 0.48;

  vec3 col = uWarm * aBell + uAccent * aPluck + uAccent * aDrum;
  float a = aBell + aPluck + aDrum;

  gl_FragColor = vec4(col, a);
}
`;

type OrbAnchor = { x: number; y: number; z: number; scale: number };

type Props = {
  hitBellRef: React.RefObject<number>;
  hitPluckRef: React.RefObject<number>;
  hitDrumRef: React.RefObject<number>;
  mouseSmoothed: React.RefObject<{ x: number; y: number }>;
  orbAnchor: React.RefObject<OrbAnchor>;
  stateRef: React.RefObject<SceneState>;
};

export function Halo({ hitBellRef, hitPluckRef, hitDrumRef, mouseSmoothed, orbAnchor, stateRef }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => {
    const init = SCENE_BY_ID.drift.palette;
    return {
      uHitBell:  { value: 0 },
      uHitPluck: { value: 0 },
      uHitDrum:  { value: 0 },
      uAccent: { value: new THREE.Vector3(...init.accent) },
      uWarm:   { value: new THREE.Vector3(...init.warm) },
    };
  }, []);

  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dtRaw) => {
    if (!matRef.current || !meshRef.current) return;
    const dt = Math.min(dtRaw, 1 / 24);
    const u = matRef.current.uniforms;
    u.uHitBell.value = hitBellRef.current;
    u.uHitPluck.value = hitPluckRef.current;
    u.uHitDrum.value = hitDrumRef.current;

    const pal = paletteFor(stateRef.current.sceneId);
    const rate = 1 - Math.exp(-dt * 0.7);
    (u.uAccent.value as THREE.Vector3).lerp(tmp.set(...pal.accent), rate);
    (u.uWarm.value as THREE.Vector3).lerp(tmp.set(...pal.warm), rate);

    // Follow the orb (scene anchor + anti-magnetic mouse shift).
    const a = orbAnchor.current;
    meshRef.current.position.x = a.x - mouseSmoothed.current.x * 0.25;
    meshRef.current.position.y = a.y - mouseSmoothed.current.y * 0.20;
    meshRef.current.position.z = a.z;
    // Halo also scales with the orb (smaller for moon-like orbs).
    const haloScale = a.scale / 0.7;
    meshRef.current.scale.setScalar(haloScale);
  });

  return (
    <mesh ref={meshRef} renderOrder={1}>
      <planeGeometry args={[HALO_SIZE, HALO_SIZE]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={haloVertexShader}
        fragmentShader={haloFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
