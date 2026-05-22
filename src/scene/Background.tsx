import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneState } from '../audio/useAudioEngine';
import { SCENE_BY_ID, paletteFor, tintForTimeOfDay } from '../audio/scenes';
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
      uDrone: { value: 0 },
      uSkyDarkness: { value: 0 },
      uWarm:   { value: new THREE.Vector3(...init.warm) },
      uCool:   { value: new THREE.Vector3(...init.cool) },
      uAccent: { value: new THREE.Vector3(...init.accent) },
    };
  }, []);

  const tmp = useMemo(() => new THREE.Vector3(), []);
  const droneRef = useRef(0);

  useFrame((_, dtRaw) => {
    if (!matRef.current) return;
    const dt = Math.min(dtRaw, 1 / 24);
    const u = matRef.current.uniforms;
    u.uTime.value += dt;
    u.uTreble.value = trebleRef.current;

    // Drone intensity = total ambient drone presence.
    // Weighted: binaural, noise, pad, sub-bass count; the transient voices (bell/pluck/drum) don't.
    const p = stateRef.current.params;
    const target = Math.min(
      1,
      p.binaural.volume * 0.9
      + p.noise.volume * 1.0
      + p.pad.volume * 0.8
      + p.subBass.volume * 1.0,
    ) * 0.5; // scale into a calm range
    // Smooth the drone level so volume changes don't jolt the bg.
    const rate = 1 - Math.exp(-dt / 0.5);
    droneRef.current += (target - droneRef.current) * rate;
    u.uDrone.value = droneRef.current;
    u.uPadAmount.value = p.pad.volume;

    // Sky darkness per scene — lerp toward target so transitions are smooth.
    const targetDarkness = SCENE_BY_ID[stateRef.current.sceneId]?.skyDarkness ?? 0;
    const darknessRate = 1 - Math.exp(-dt / 1.2);
    u.uSkyDarkness.value += (targetDarkness - u.uSkyDarkness.value) * darknessRate;

    const pal = tintForTimeOfDay(paletteFor(stateRef.current.sceneId));
    const palRate = 1 - Math.exp(-dt * 0.7);
    (u.uWarm.value as THREE.Vector3).lerp(tmp.set(...pal.warm), palRate);
    (u.uCool.value as THREE.Vector3).lerp(tmp.set(...pal.cool), palRate);
    (u.uAccent.value as THREE.Vector3).lerp(tmp.set(...pal.accent), palRate);
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
