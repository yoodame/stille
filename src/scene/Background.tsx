import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneState } from '../audio/useAudioEngine';
import { SCENE_BY_ID } from '../audio/scenes';
import { backgroundFragmentShader, backgroundVertexShader } from './shaders';

type Props = {
  trebleRef: React.RefObject<number>;
  stateRef: React.RefObject<SceneState>;
};

export function Background({ trebleRef, stateRef }: Props) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => {
    const init = SCENE_BY_ID.drift.palette;
    return {
      uTime: { value: 0 },
      uTreble: { value: 0 },
      uPadAmount: { value: 0.5 },
      uWarm:   { value: new THREE.Vector3(...init.warm) },
      uCool:   { value: new THREE.Vector3(...init.cool) },
      uAccent: { value: new THREE.Vector3(...init.accent) },
    };
  }, []);

  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dtRaw) => {
    if (!matRef.current) return;
    const dt = Math.min(dtRaw, 1 / 24);
    const u = matRef.current.uniforms;
    u.uTime.value += dt;
    u.uTreble.value = trebleRef.current;
    u.uPadAmount.value = stateRef.current.params.pad.volume;

    const pal = SCENE_BY_ID[stateRef.current.sceneId].palette;
    const rate = 1 - Math.exp(-dt * 0.7);
    (u.uWarm.value as THREE.Vector3).lerp(tmp.set(...pal.warm), rate);
    (u.uCool.value as THREE.Vector3).lerp(tmp.set(...pal.cool), rate);
    (u.uAccent.value as THREE.Vector3).lerp(tmp.set(...pal.accent), rate);
  });

  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={backgroundVertexShader}
        fragmentShader={backgroundFragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}
