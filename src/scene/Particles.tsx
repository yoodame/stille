import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneState } from '../audio/useAudioEngine';
import { SCENE_BY_ID, tintForTimeOfDay } from '../audio/scenes';

type Props = {
  trebleRef: React.RefObject<number>;
  mouseSmoothed: React.RefObject<{ x: number; y: number }>;
  stateRef: React.RefObject<SceneState>;
};

const COUNT = 220;
const FIELD_RADIUS = 6;
const FIELD_HEIGHT = 8;
const ORB_AVOID_RADIUS = 0.95;
const ORB_AVOID_PUSH = 0.65;

type Particle = {
  basePos: THREE.Vector3;
  speed: number;
  phase: number;
  size: number;
};

// Each particle is a small instanced sphere shaded to look like a soft glowing
// droplet — bright fresnel-core, palette-tinted, additive-blended.
const particleVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vViewPos = mvPos.xyz;
    vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const particleFragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uWarm;
  uniform vec3 uAccent;
  uniform float uAlpha;

  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    vec3 viewDir = normalize(-vViewPos);
    float fresnel = 1.0 - max(dot(viewDir, vNormal), 0.0);

    // Each particle reads like a tiny lit droplet: bright soft core, gentle rim.
    float core = pow(1.0 - fresnel, 1.8);
    float rim  = pow(fresnel, 2.4) * 0.32;

    // Subtle palette tint — same family as the orb so they feel like cousins.
    vec3 col = mix(uWarm, uAccent, 0.32);
    float a = clamp(core + rim, 0.0, 1.0) * uAlpha;

    gl_FragColor = vec4(col * (0.85 + core * 0.4), a);
  }
`;

export function Particles({ trebleRef, mouseSmoothed, stateRef }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const particles = useMemo<Particle[]>(() => {
    const arr: Particle[] = [];
    for (let i = 0; i < COUNT; i++) {
      const r = Math.sqrt(Math.random()) * FIELD_RADIUS;
      const theta = Math.random() * Math.PI * 2;
      arr.push({
        basePos: new THREE.Vector3(
          Math.cos(theta) * r,
          (Math.random() - 0.5) * FIELD_HEIGHT,
          Math.sin(theta) * r - 1.0,
        ),
        speed: 0.08 + Math.random() * 0.18,
        phase: Math.random() * Math.PI * 2,
        // Slightly larger than before — the soft falloff makes the visible
        // glow look smaller than the geometry, so we bump the base size.
        size: 0.018 + Math.random() * 0.034,
      });
    }
    return arr;
  }, []);

  const uniforms = useMemo(() => {
    const init = SCENE_BY_ID.drift.palette;
    return {
      uWarm:   { value: new THREE.Vector3(...init.warm) },
      uAccent: { value: new THREE.Vector3(...init.accent) },
      uAlpha:  { value: 0.45 },
    };
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const t = useRef(0);
  const drift = useRef(0);

  useFrame((_, dtRaw) => {
    if (!meshRef.current || !matRef.current) return;
    const dt = Math.min(dtRaw, 1 / 24);
    t.current += dt;
    const speedMul = 1 + trebleRef.current * 0.6;
    drift.current += dt * speedMul;

    // Palette lerp (matches Orb / Background pipeline).
    const pal = tintForTimeOfDay(SCENE_BY_ID[stateRef.current.sceneId].palette);
    const rate = 1 - Math.exp(-dt * 0.7);
    (matRef.current.uniforms.uWarm.value as THREE.Vector3).lerp(tmp.set(...pal.warm), rate);
    (matRef.current.uniforms.uAccent.value as THREE.Vector3).lerp(tmp.set(...pal.accent), rate);

    // Whole field anti-magnetically shifts opposite the cursor.
    const fieldShiftX = -mouseSmoothed.current.x * 0.45;
    const fieldShiftY = -mouseSmoothed.current.y * 0.35;

    // Orb world position (matches Orb.tsx mouse-driven shift).
    const orbX = -mouseSmoothed.current.x * 0.30;
    const orbY = -mouseSmoothed.current.y * 0.24;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const yDrift = ((p.basePos.y + drift.current * p.speed) % FIELD_HEIGHT) - FIELD_HEIGHT / 2;
      const sway = Math.sin(t.current * 0.4 + p.phase) * 0.12;
      let x = p.basePos.x + sway + fieldShiftX;
      let y = yDrift + fieldShiftY;
      const z = p.basePos.z;

      // Repel from orb's screen-position disc.
      const dx = x - orbX;
      const dy = y - orbY;
      const dist = Math.hypot(dx, dy);
      if (dist < ORB_AVOID_RADIUS) {
        const safeDist = Math.max(dist, 0.05);
        const t01 = 1 - safeDist / ORB_AVOID_RADIUS;
        const falloff = t01 * t01 * (3 - 2 * t01);
        const nx = dx / safeDist;
        const ny = dy / safeDist;
        const push = falloff * ORB_AVOID_PUSH;
        x += nx * push;
        y += ny * push;
      }

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(p.size);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, COUNT]}
      frustumCulled={false}
      renderOrder={2}
    >
      <sphereGeometry args={[1, 16, 12]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={particleVertexShader}
        fragmentShader={particleFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}
