import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneState } from '../audio/useAudioEngine';
import { SCENE_BY_ID, paletteFor, tintForTimeOfDay } from '../audio/scenes';
import { orbFragmentShader, orbVertexShader } from './shaders';

type OrbAnchor = { x: number; y: number; z: number; scale: number };

type Props = {
  bassRef: React.RefObject<number>;
  midRef: React.RefObject<number>;
  trebleRef: React.RefObject<number>;
  beatPulseRef: React.RefObject<number>;
  hitBellRef: React.RefObject<number>;
  hitPluckRef: React.RefObject<number>;
  hitDrumRef: React.RefObject<number>;
  mouseSmoothed: React.RefObject<{ x: number; y: number }>;
  orbAnchor: React.RefObject<OrbAnchor>;
  stateRef: React.RefObject<SceneState>;
};

export function Orb({
  bassRef, midRef, trebleRef, beatPulseRef,
  hitBellRef, hitPluckRef, hitDrumRef,
  mouseSmoothed, orbAnchor, stateRef,
}: Props) {
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
      uHitBell:  { value: 0 },
      uHitPluck: { value: 0 },
      uHitDrum:  { value: 0 },
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
    u.uHitBell.value  = hitBellRef.current;
    u.uHitPluck.value = hitPluckRef.current;
    u.uHitDrum.value  = hitDrumRef.current;
    u.uNoiseAmount.value = p.noise.volume;
    u.uPadAmount.value = p.pad.volume;

    // Palette lerp toward current scene, tinted by time of day.
    const pal = tintForTimeOfDay(paletteFor(stateRef.current.sceneId));
    const rate = 1 - Math.exp(-dt * 0.7);
    (u.uWarm.value as THREE.Vector3).lerp(tmp.set(...pal.warm), rate);
    (u.uCool.value as THREE.Vector3).lerp(tmp.set(...pal.cool), rate);
    (u.uAccent.value as THREE.Vector3).lerp(tmp.set(...pal.accent), rate);

    // Spin: base + drum hits subtly speed it up briefly.
    meshRef.current.rotation.y += dt * (0.06 + hitDrumRef.current * 0.7);
    meshRef.current.rotation.x = Math.sin(u.uTime.value * 0.12) * 0.08;

    // Scale = scene-anchor scale × small hit-driven pulse.
    const a = orbAnchor.current;
    const scale = a.scale * (1 + hitDrumRef.current * 0.05 + hitPluckRef.current * 0.02);
    meshRef.current.scale.setScalar(scale);

    // Position = scene anchor + anti-magnetic mouse shift.
    meshRef.current.position.x = a.x - mouseSmoothed.current.x * 0.30;
    meshRef.current.position.y = a.y - mouseSmoothed.current.y * 0.24;
    meshRef.current.position.z = a.z;
  });

  return (
    <mesh ref={meshRef}>
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
