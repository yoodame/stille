import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneState } from '../audio/useAudioEngine';
import { SCENE_BY_ID, tintForTimeOfDay } from '../audio/scenes';

type Props = {
  stateRef: React.RefObject<SceneState>;
  trebleRef: React.RefObject<number>;
};

// Hand-placed for a balanced, calm composition. Negative z puts trees behind the
// orb (orb sits at z=0, camera at z=7).
type TreeDef = { x: number; z: number; h: number; w: number; yOff?: number };
const TREES: TreeDef[] = [
  // Far row (small, hazier)
  { x: -4.2, z: -14, h: 1.8, w: 0.42 },
  { x: -1.6, z: -13, h: 1.6, w: 0.38 },
  { x:  1.4, z: -13.5, h: 1.9, w: 0.44 },
  { x:  4.0, z: -14, h: 1.7, w: 0.40 },

  // Mid row (medium)
  { x: -3.2, z: -8,  h: 2.6, w: 0.55 },
  { x:  2.2, z: -8.5, h: 2.4, w: 0.50 },
  { x:  3.6, z: -10, h: 2.1, w: 0.46 },

  // Near row (taller, sharper)
  { x: -2.3, z: -5,  h: 3.0, w: 0.60 },
  { x:  2.6, z: -5.5, h: 2.8, w: 0.58 },
];

// Distant hill silhouette as a single plane with a wavy upper edge.
const hillVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const hillFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    // Layered sines give a calm rolling-hill horizon.
    float h = 0.55
      + 0.10 * sin(vUv.x * 6.0 + 0.4)
      + 0.06 * sin(vUv.x * 13.0 + 1.7)
      + 0.03 * sin(vUv.x * 31.0 + 3.1);
    float mask = smoothstep(h + 0.012, h - 0.012, vUv.y);
    if (mask < 0.01) discard;
    // Soft fade at the very bottom so the hill blends with deeper bg.
    float bottomFade = smoothstep(0.0, 0.25, vUv.y);
    gl_FragColor = vec4(uColor, mask * uOpacity * bottomFade);
  }
`;

const SILHOUETTE_LERP = 0.6; // how fast silhouette color follows the scene cool

export function Forest({ stateRef, trebleRef }: Props) {
  const treesRef = useRef<THREE.Group>(null);
  const hillMatRef = useRef<THREE.ShaderMaterial>(null);
  const trunkMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const crownMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const hillColor = useMemo(() => new THREE.Color(0.08, 0.12, 0.10), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  const uniforms = useMemo(
    () => ({
      uColor: { value: hillColor },
      uOpacity: { value: 0 }, // fade-in on mount
    }),
    [hillColor],
  );

  // Mount fade — opacity ramps 0 → 1 over ~600ms so the forest dissolves in
  // when the scene is selected (and out cleanly via React unmount).
  const mountedAt = useRef<number | null>(null);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 24);
    if (mountedAt.current === null) mountedAt.current = performance.now();
    const age = (performance.now() - mountedAt.current) / 600;
    const opacity = Math.min(1, age * age * (3 - 2 * age));

    // Recolor silhouettes from current scene palette (cool, darkened).
    const pal = tintForTimeOfDay(SCENE_BY_ID[stateRef.current.sceneId].palette);
    tmp.setRGB(pal.cool[0], pal.cool[1], pal.cool[2]).multiplyScalar(0.32);
    const rate = 1 - Math.exp(-dt * SILHOUETTE_LERP);
    hillColor.lerp(tmp, rate);
    if (trunkMatRef.current) trunkMatRef.current.color.lerp(tmp.multiplyScalar(0.85), rate);
    if (crownMatRef.current) crownMatRef.current.color.lerp(tmp.multiplyScalar(0.95), rate);

    if (hillMatRef.current) hillMatRef.current.uniforms.uOpacity.value = opacity;
    if (trunkMatRef.current) trunkMatRef.current.opacity = opacity;
    if (crownMatRef.current) crownMatRef.current.opacity = opacity;

    // Subtle sway on the trees — driven by audio treble (treetops in the breeze).
    if (treesRef.current) {
      const t = (performance.now() % 60_000) * 0.0006;
      const sway = 0.012 + trebleRef.current * 0.03;
      treesRef.current.children.forEach((tree, i) => {
        const phase = i * 0.73;
        tree.rotation.z = Math.sin(t + phase) * sway;
      });
    }
  });

  return (
    <group renderOrder={-1}>
      {/* Distant rolling hill ridge */}
      <mesh position={[0, -0.6, -16]}>
        <planeGeometry args={[36, 8]} />
        <shaderMaterial
          ref={hillMatRef}
          vertexShader={hillVertex}
          fragmentShader={hillFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* Pine tree silhouettes */}
      <group ref={treesRef}>
        {TREES.map((t, i) => (
          <group key={i} position={[t.x, -2 + (t.yOff ?? 0), t.z]}>
            {/* Trunk */}
            <mesh position={[0, t.h * 0.18, 0]}>
              <cylinderGeometry args={[t.w * 0.05, t.w * 0.09, t.h * 0.36, 6]} />
              <meshBasicMaterial
                ref={i === 0 ? trunkMatRef : undefined}
                color="#1a2218"
                transparent
                opacity={0}
                depthWrite={false}
              />
            </mesh>
            {/* Pine crown — single tall cone for the silhouette */}
            <mesh position={[0, t.h * 0.62, 0]}>
              <coneGeometry args={[t.w * 0.7, t.h * 1.05, 7]} />
              <meshBasicMaterial
                ref={i === 0 ? crownMatRef : undefined}
                color="#1a2218"
                transparent
                opacity={0}
                depthWrite={false}
              />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
