import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

type Props = {
  trebleRef: React.RefObject<number>;
};

const COUNT = 220;
const FIELD_RADIUS = 6;
const FIELD_HEIGHT = 8;

type Particle = {
  basePos: THREE.Vector3;
  speed: number;
  phase: number;
  size: number;
};

export function Particles({ trebleRef }: Props) {
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

  useFrame((_, dtRaw) => {
    if (!meshRef.current) return;
    const dt = Math.min(dtRaw, 1 / 24);
    t.current += dt;
    // Treble adds a small bit of energy, but keep the floor steady so motion
    // doesn't visibly stutter when audio bands fluctuate.
    const speedMul = 1 + trebleRef.current * 0.6;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const yDrift = ((p.basePos.y + t.current * p.speed * speedMul) % FIELD_HEIGHT) - FIELD_HEIGHT / 2;
      const sway = Math.sin(t.current * 0.4 + p.phase) * 0.12;
      dummy.position.set(p.basePos.x + sway, yDrift, p.basePos.z);
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
