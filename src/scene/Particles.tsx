import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneState } from '../audio/useAudioEngine';
import { SCENE_BY_ID, tintForTimeOfDay } from '../audio/scenes';

type OrbAnchor = { x: number; y: number; z: number; scale: number };

type Props = {
  trebleRef: React.RefObject<number>;
  mouseSmoothed: React.RefObject<{ x: number; y: number }>;
  orbAnchor: React.RefObject<OrbAnchor>;
  stateRef: React.RefObject<SceneState>;
};

const COUNT = 220;
const FIELD_RADIUS = 6;
const FIELD_HEIGHT = 8;
// Avoidance radius scales with the orb (smaller orbs have a smaller no-fly zone).
const ORB_AVOID_FACTOR = 1.36; // multiply orb scale to get avoid radius
const ORB_AVOID_PUSH = 0.65;

type Particle = {
  basePos: THREE.Vector3;
  speed: number;
  phase: number;
  size: number;
};

// Each particle is a camera-facing 1x1 plane (billboard) with a soft radial
// gradient — gives true feathered edges that read as glowing droplets, not
// hard circles. Same palette as the orb so they feel like cousins.
const particleVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Center of this instance in world space (translation column).
    vec4 worldCenter = modelMatrix * vec4(instanceMatrix[3].xyz, 1.0);
    // To view space — center sits at viewCenter.
    vec4 viewCenter = viewMatrix * worldCenter;
    // Instance scale (uniform via .scale.setScalar()).
    float s = length(instanceMatrix[0].xyz);
    // Plane local XY (default planeGeometry vertices in [-0.5, 0.5]) used as
    // view-space offsets so the plane always faces camera.
    viewCenter.xy += position.xy * s;
    gl_Position = projectionMatrix * viewCenter;
  }
`;

const particleFragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uWarm;
  uniform vec3 uAccent;
  uniform float uAlpha;
  varying vec2 vUv;

  void main() {
    vec2 d = vUv - 0.5;
    float r = length(d) * 2.0;       // 0 at center, 1 at plane edge

    // Two-tier radial falloff: a bright soft core, a gentler halo around it.
    float core = 1.0 - smoothstep(0.0, 0.55, r);
    core = pow(core, 1.6);
    float halo = 1.0 - smoothstep(0.0, 1.0, r);
    halo = pow(halo, 2.2) * 0.35;

    vec3 col = mix(uWarm, uAccent, 0.35);
    // Subtly brighten the core so the center feels lit, not flat.
    col *= 0.85 + core * 0.45;

    float a = clamp(core + halo, 0.0, 1.0) * uAlpha;
    gl_FragColor = vec4(col, a);
  }
`;

export function Particles({ trebleRef, mouseSmoothed, orbAnchor, stateRef }: Props) {
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

    // Orb world position = scene anchor + mouse-driven shift (matches Orb.tsx).
    const a = orbAnchor.current;
    const orbX = a.x - mouseSmoothed.current.x * 0.30;
    const orbY = a.y - mouseSmoothed.current.y * 0.24;
    const avoidR = a.scale * ORB_AVOID_FACTOR;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const yDrift = ((p.basePos.y + drift.current * p.speed) % FIELD_HEIGHT) - FIELD_HEIGHT / 2;
      const sway = Math.sin(t.current * 0.4 + p.phase) * 0.12;
      let x = p.basePos.x + sway + fieldShiftX;
      let y = yDrift + fieldShiftY;
      const z = p.basePos.z;

      // Repel from orb's screen-position disc (scales with orb size).
      const dx = x - orbX;
      const dy = y - orbY;
      const dist = Math.hypot(dx, dy);
      if (dist < avoidR) {
        const safeDist = Math.max(dist, 0.05);
        const t01 = 1 - safeDist / avoidR;
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
      <planeGeometry args={[1, 1]} />
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
