import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

type Props = {
  trebleRef: React.RefObject<number>;
  mouseSmoothed: React.RefObject<{ x: number; y: number }>;
};

const COUNT = 220;
const FIELD_RADIUS = 6;
const FIELD_HEIGHT = 8;

// Orb avoidance: keep particles out of a small disc around where the
// orb sits in world space. Slightly larger than the orb's visible radius
// (0.7 world units) so they don't graze the silhouette.
const ORB_AVOID_RADIUS = 0.95;
const ORB_AVOID_PUSH = 0.65;

type Particle = {
  basePos: THREE.Vector3;
  speed: number;
  phase: number;
  size: number;
};

export function Particles({ trebleRef, mouseSmoothed }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

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
        size: 0.012 + Math.random() * 0.025,
      });
    }
    return arr;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorBase = useMemo(() => new THREE.Color('#f4efe6'), []);
  const t = useRef(0);
  const drift = useRef(0);

  useFrame((_, dtRaw) => {
    if (!meshRef.current) return;
    const dt = Math.min(dtRaw, 1 / 24);
    t.current += dt;
    const speedMul = 1 + trebleRef.current * 0.6;
    drift.current += dt * speedMul;

    // Whole field anti-magnetically shifts opposite the cursor.
    const fieldShiftX = -mouseSmoothed.current.x * 0.45;
    const fieldShiftY = -mouseSmoothed.current.y * 0.35;

    // Orb's world position (matches the shift logic in Orb.tsx).
    const orbX = -mouseSmoothed.current.x * 0.30;
    const orbY = -mouseSmoothed.current.y * 0.24;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const yDrift = ((p.basePos.y + drift.current * p.speed) % FIELD_HEIGHT) - FIELD_HEIGHT / 2;
      const sway = Math.sin(t.current * 0.4 + p.phase) * 0.12;
      let x = p.basePos.x + sway + fieldShiftX;
      let y = yDrift + fieldShiftY;
      const z = p.basePos.z;

      // Repel from the orb's screen-position disc — particles flow around it.
      const dx = x - orbX;
      const dy = y - orbY;
      const dist = Math.hypot(dx, dy);
      if (dist < ORB_AVOID_RADIUS) {
        const safeDist = Math.max(dist, 0.05);
        const t01 = 1 - safeDist / ORB_AVOID_RADIUS; // 0 at edge, 1 at center
        // Smoothstep falloff for a softer push.
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
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color={colorBase} transparent opacity={0.55} depthWrite={false} />
    </instancedMesh>
  );
}
