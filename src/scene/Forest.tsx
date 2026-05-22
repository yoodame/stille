import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneState } from '../audio/useAudioEngine';
import { SCENE_BY_ID, tintForTimeOfDay } from '../audio/scenes';

type Props = {
  stateRef: React.RefObject<SceneState>;
  trebleRef: React.RefObject<number>;
  /** When true, the forest fades in; when false, it fades out. Always mounted
   *  so its shaders compile once and never flash on re-show. */
  visible: boolean;
};

type TreeDef = { x: number; z: number; h: number; w: number };
const TREES: TreeDef[] = [
  // Far row
  { x: -4.2, z: -14,   h: 1.8, w: 0.42 },
  { x: -1.6, z: -13,   h: 1.6, w: 0.38 },
  { x:  1.4, z: -13.5, h: 1.9, w: 0.44 },
  { x:  4.0, z: -14,   h: 1.7, w: 0.40 },
  // Mid row
  { x: -3.2, z: -8,    h: 2.6, w: 0.55 },
  { x:  2.2, z: -8.5,  h: 2.4, w: 0.50 },
  { x:  3.6, z: -10,   h: 2.1, w: 0.46 },
  // Near row
  { x: -2.3, z: -5,    h: 3.0, w: 0.60 },
  { x:  2.6, z: -5.5,  h: 2.8, w: 0.58 },
];

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
    float h = 0.55
      + 0.10 * sin(vUv.x * 6.0 + 0.4)
      + 0.06 * sin(vUv.x * 13.0 + 1.7)
      + 0.03 * sin(vUv.x * 31.0 + 3.1);
    float mask = smoothstep(h + 0.012, h - 0.012, vUv.y);
    if (mask * uOpacity < 0.005) discard;
    float bottomFade = smoothstep(0.0, 0.25, vUv.y);
    gl_FragColor = vec4(uColor, mask * uOpacity * bottomFade);
  }
`;

const FADE_TAU = 0.45;     // seconds — how fast forest fades in/out
const PALETTE_TAU = 1.0;   // seconds — how fast silhouette colors track scene

export function Forest({ stateRef, trebleRef, visible }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const treesRef = useRef<THREE.Group>(null);
  const hillMatRef = useRef<THREE.ShaderMaterial>(null);

  // One shared material for all 9 trees × 2 meshes (trunk + crown).
  // Updating .color and .opacity once updates the whole forest.
  const treeMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#1a2218'),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  );
  const hillColor = useMemo(() => new THREE.Color(0.08, 0.12, 0.10), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  const uniforms = useMemo(
    () => ({
      uColor: { value: hillColor },
      uOpacity: { value: 0 },
    }),
    [hillColor],
  );

  const opacityRef = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 24);

    // Lerp opacity toward visible target — smooth fade in and out.
    const target = visible ? 1 : 0;
    const fadeRate = 1 - Math.exp(-dt / FADE_TAU);
    opacityRef.current += (target - opacityRef.current) * fadeRate;

    treeMat.opacity = opacityRef.current;
    if (hillMatRef.current) hillMatRef.current.uniforms.uOpacity.value = opacityRef.current;

    // Toggle group.visible to skip rendering when fully faded out.
    if (groupRef.current) groupRef.current.visible = opacityRef.current > 0.005;

    // Track scene cool color (darkened) — only when we're actually showing.
    if (opacityRef.current > 0.005) {
      const pal = tintForTimeOfDay(SCENE_BY_ID[stateRef.current.sceneId].palette);
      tmp.setRGB(pal.cool[0], pal.cool[1], pal.cool[2]).multiplyScalar(0.32);
      const colorRate = 1 - Math.exp(-dt / PALETTE_TAU);
      treeMat.color.lerp(tmp, colorRate);
      hillColor.lerp(tmp.multiplyScalar(1.08), colorRate); // hill a touch brighter than trees

      // Treetop sway driven by treble + slow base oscillation.
      if (treesRef.current) {
        const t = (performance.now() % 60_000) * 0.0006;
        const swayAmp = 0.012 + trebleRef.current * 0.03;
        const children = treesRef.current.children;
        for (let i = 0; i < children.length; i++) {
          children[i].rotation.z = Math.sin(t + i * 0.73) * swayAmp;
        }
      }
    }
  });

  return (
    <group ref={groupRef} renderOrder={-1} visible={false}>
      {/* Distant hill ridge */}
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

      {/* Pine silhouettes — all share treeMat */}
      <group ref={treesRef}>
        {TREES.map((t, i) => (
          <group key={i} position={[t.x, -2, t.z]}>
            <mesh position={[0, t.h * 0.18, 0]} material={treeMat}>
              <cylinderGeometry args={[t.w * 0.05, t.w * 0.09, t.h * 0.36, 6]} />
            </mesh>
            <mesh position={[0, t.h * 0.62, 0]} material={treeMat}>
              <coneGeometry args={[t.w * 0.7, t.h * 1.05, 7]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
