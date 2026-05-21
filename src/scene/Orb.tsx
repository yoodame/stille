import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneState } from '../audio/useAudioEngine';
import { SCENE_BY_ID } from '../audio/scenes';
import { orbFragmentShader, orbVertexShader } from './shaders';

type Props = {
  bassRef: React.RefObject<number>;
  midRef: React.RefObject<number>;
  trebleRef: React.RefObject<number>;
  beatPulseRef: React.RefObject<number>;
  stateRef: React.RefObject<SceneState>;
};

export function Orb({ bassRef, midRef, trebleRef, beatPulseRef, stateRef }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => {
    const init = SCENE_BY_ID.drift.palette;
    return {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uBeat: { value: 0 },
      uNoiseAmount: { value: 0.4 },
      uPadAmount: { value: 0.5 },
      uWarm:   { value: new THREE.Vector3(...init.warm) },
      uCool:   { value: new THREE.Vector3(...init.cool) },
      uAccent: { value: new THREE.Vector3(...init.accent) },
    };
  }, []);

  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dtRaw) => {
    if (!matRef.current || !meshRef.current) return;
    const dt = Math.min(dtRaw, 1 / 24);
    const u = matRef.current.uniforms;
    const p = stateRef.current.params;
    u.uTime.value += dt;
    u.uBass.value = bassRef.current;
    u.uMid.value = midRef.current;
    u.uTreble.value = trebleRef.current;
    u.uBeat.value = beatPulseRef.current;
    u.uNoiseAmount.value = p.noise.volume;
    u.uPadAmount.value = p.pad.volume;

    // Smoothly lerp palette toward current scene
    const pal = SCENE_BY_ID[stateRef.current.sceneId].palette;
    const rate = 1 - Math.exp(-dt * 0.7);
    (u.uWarm.value as THREE.Vector3).lerp(tmp.set(...pal.warm), rate);
    (u.uCool.value as THREE.Vector3).lerp(tmp.set(...pal.cool), rate);
    (u.uAccent.value as THREE.Vector3).lerp(tmp.set(...pal.accent), rate);

    meshRef.current.rotation.y += dt * 0.06;
    meshRef.current.rotation.x = Math.sin(u.uTime.value * 0.12) * 0.08;
  });

  return (
    <mesh ref={meshRef} scale={0.7}>
      <sphereGeometry args={[1, 96, 64]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={orbVertexShader}
        fragmentShader={orbFragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}
