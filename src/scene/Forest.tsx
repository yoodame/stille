import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneState } from '../audio/useAudioEngine';
import { SCENE_BY_ID, tintForTimeOfDay } from '../audio/scenes';

type Props = {
  stateRef: React.RefObject<SceneState>;
  trebleRef: React.RefObject<number>;
  /** When true the forest fades in; when false it fades out. Always mounted so
   *  its shaders compile once and never flash on re-show. */
  visible: boolean;
};

type TreeDef = { x: number; z: number; h: number; w: number };
// Layout aims for visual rhythm rather than even spacing — some trees pair
// up (left near + small companion; far-row clusters of 2-3), others stand
// alone (right near hero; lone mid-row sentries). Middle keeps a deliberate
// gap so the eye has room to rest on the moon overhead.
const TREES: TreeDef[] = [
  // Far row — broad scattering across the horizon
  { x: -5.0, z: -14,   h: 1.7, w: 0.40 },
  { x: -3.6, z: -13.5, h: 1.5, w: 0.36 }, // pair w/ above
  { x: -0.6, z: -14,   h: 1.4, w: 0.34 }, // lone, slightly left of center
  { x:  2.8, z: -13,   h: 1.8, w: 0.42 },
  { x:  4.8, z: -14,   h: 1.6, w: 0.38 }, // pair w/ above

  // Mid row — two lone sentries with a wide gap between them
  { x: -3.6, z: -9,    h: 2.5, w: 0.52 },
  { x:  3.6, z: -9.5,  h: 2.4, w: 0.50 },

  // Near row — left has a tall hero + small companion; right has a lone hero
  { x: -2.8, z: -5,    h: 3.1, w: 0.60 }, // tall hero left
  { x: -1.5, z: -5.5,  h: 2.0, w: 0.42 }, // smaller companion close by
  { x:  2.8, z: -5.5,  h: 2.9, w: 0.58 }, // lone tall hero right
];

const hillVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Two stacked silhouettes (back ridge + front ridge) at different heights and
// brightnesses for real atmospheric depth. Edges are crisp — smoothstep width
// just 0.004 so they don't read as blurry.
const hillFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uFrontColor;
  uniform vec3 uBackColor;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    // Back ridge — taller, lighter.
    float hBack = 0.62
      + 0.07 * sin(vUv.x * 4.5 + 1.1)
      + 0.04 * sin(vUv.x * 11.0 + 2.8);
    float backMask = smoothstep(hBack + 0.002, hBack - 0.002, vUv.y);

    // Front ridge — lower, darker, more varied.
    float hFront = 0.48
      + 0.09 * sin(vUv.x * 6.0 + 0.4)
      + 0.05 * sin(vUv.x * 13.0 + 1.7)
      + 0.025 * sin(vUv.x * 27.0 + 3.1);
    float frontMask = smoothstep(hFront + 0.002, hFront - 0.002, vUv.y);

    float mask = max(backMask, frontMask);
    if (mask * uOpacity < 0.005) discard;

    // Pick the front color where front mask wins (front draws over back).
    vec3 col = mix(uBackColor, uFrontColor, frontMask);

    // Soft bottom fade so the hill base blends into the lower bg gradient.
    float bottomFade = smoothstep(0.0, 0.20, vUv.y);
    gl_FragColor = vec4(col, mask * uOpacity * bottomFade);
  }
`;

const FADE_TAU = 0.45;
const PALETTE_TAU = 1.0;

export function Forest({ stateRef, trebleRef, visible }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const treesRef = useRef<THREE.Group>(null);
  const hillMatRef = useRef<THREE.ShaderMaterial>(null);

  // Single shared material for every tree mesh (9 trees × 4 meshes = 36 meshes
  // all picking up one .color and .opacity update per frame).
  const treeMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#10130d'),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  );

  const frontHillColor = useMemo(() => new THREE.Color(0.08, 0.12, 0.09), []);
  const backHillColor  = useMemo(() => new THREE.Color(0.14, 0.20, 0.15), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  const uniforms = useMemo(
    () => ({
      uFrontColor: { value: frontHillColor },
      uBackColor:  { value: backHillColor },
      uOpacity:    { value: 0 },
    }),
    [frontHillColor, backHillColor],
  );

  const opacityRef = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 24);

    // Fade toward visible target.
    const target = visible ? 1 : 0;
    const fadeRate = 1 - Math.exp(-dt / FADE_TAU);
    opacityRef.current += (target - opacityRef.current) * fadeRate;

    treeMat.opacity = opacityRef.current;
    if (hillMatRef.current) hillMatRef.current.uniforms.uOpacity.value = opacityRef.current;

    if (groupRef.current) groupRef.current.visible = opacityRef.current > 0.005;

    if (opacityRef.current > 0.005) {
      const pal = tintForTimeOfDay(SCENE_BY_ID[stateRef.current.sceneId].palette);
      const colorRate = 1 - Math.exp(-dt / PALETTE_TAU);

      // Trees: darkest — 0.22× the cool palette. Reads as near-silhouette.
      tmp.setRGB(pal.cool[0], pal.cool[1], pal.cool[2]).multiplyScalar(0.22);
      treeMat.color.lerp(tmp, colorRate);

      // Front hill: a bit lighter, 0.42×.
      tmp.setRGB(pal.cool[0], pal.cool[1], pal.cool[2]).multiplyScalar(0.42);
      frontHillColor.lerp(tmp, colorRate);

      // Back hill: lighter still, 0.62× — atmospheric perspective.
      tmp.setRGB(pal.cool[0], pal.cool[1], pal.cool[2]).multiplyScalar(0.62);
      backHillColor.lerp(tmp, colorRate);

      // Treetop sway.
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
      {/* Distant double-ridge silhouette */}
      <mesh position={[0, -0.4, -16]}>
        <planeGeometry args={[36, 9]} />
        <shaderMaterial
          ref={hillMatRef}
          vertexShader={hillVertex}
          fragmentShader={hillFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* Pine silhouettes — 3-tier stacked crowns + trunk for organic shape */}
      <group ref={treesRef}>
        {TREES.map((t, i) => (
          <group key={i} position={[t.x, -2, t.z]}>
            {/* Trunk */}
            <mesh position={[0, t.h * 0.16, 0]} material={treeMat}>
              <cylinderGeometry args={[t.w * 0.04, t.w * 0.08, t.h * 0.32, 6]} />
            </mesh>
            {/* Bottom crown — widest, most foliage */}
            <mesh position={[0, t.h * 0.46, 0]} material={treeMat}>
              <coneGeometry args={[t.w * 0.78, t.h * 0.56, 8]} />
            </mesh>
            {/* Middle crown */}
            <mesh position={[0, t.h * 0.76, 0]} material={treeMat}>
              <coneGeometry args={[t.w * 0.55, t.h * 0.46, 8]} />
            </mesh>
            {/* Top crown — narrow tip */}
            <mesh position={[0, t.h * 1.02, 0]} material={treeMat}>
              <coneGeometry args={[t.w * 0.32, t.h * 0.34, 7]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
