import { memo, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import type { Bands } from '../audio/engine';
import type { SceneState } from '../audio/useAudioEngine';
import { Background } from './Background';
import { Orb } from './Orb';
import { Particles } from './Particles';
import { Halo } from './Halo';

type Props = {
  getBands: () => Bands;
  stateRef: React.RefObject<SceneState>;
};

const TAU_BANDS = 0.18;
const TAU_PULSE = 0.22;
const TAU_HIT_BELL = 1.4;
const TAU_HIT_PLUCK = 0.6;
const TAU_HIT_DRUM = 0.22;
const TAU_MOUSE = 0.18;
const MAX_DT = 1 / 24;

const CANVAS_STYLE = { position: 'fixed', inset: 0 } as const;
const CAMERA = { position: [0, 0, 7] as [number, number, number], fov: 30 };
const GL = { antialias: true, alpha: false } as const;
const DPR = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2);

function SceneInner({ getBands, stateRef }: Props) {
  const bassRef = useRef(0);
  const midRef = useRef(0);
  const trebleRef = useRef(0);
  const beatPulseRef = useRef(0);
  const hitBellRef = useRef(0);
  const hitPluckRef = useRef(0);
  const hitDrumRef = useRef(0);

  // Anti-magnetic mouse: raw target (from pointer events) and smoothed value (used by visuals).
  const mouseTarget = useRef({ x: 0, y: 0 });
  const mouseSmoothed = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      mouseTarget.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseTarget.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    const leave = () => {
      // Decay toward center when pointer leaves the window
      mouseTarget.current.x = 0;
      mouseTarget.current.y = 0;
    };
    window.addEventListener('pointermove', handler, { passive: true });
    window.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', handler);
      window.removeEventListener('pointerleave', leave);
    };
  }, []);

  return (
    <Canvas
      dpr={DPR}
      camera={CAMERA}
      gl={GL}
      style={CANVAS_STYLE}
      frameloop="always"
    >
      <BandsSampler
        getBands={getBands}
        stateRef={stateRef}
        bassRef={bassRef}
        midRef={midRef}
        trebleRef={trebleRef}
        beatPulseRef={beatPulseRef}
        hitBellRef={hitBellRef}
        hitPluckRef={hitPluckRef}
        hitDrumRef={hitDrumRef}
        mouseTarget={mouseTarget}
        mouseSmoothed={mouseSmoothed}
      />
      <Background trebleRef={trebleRef} stateRef={stateRef} />
      <Halo
        hitBellRef={hitBellRef}
        hitPluckRef={hitPluckRef}
        hitDrumRef={hitDrumRef}
        mouseSmoothed={mouseSmoothed}
        stateRef={stateRef}
      />
      <Orb
        bassRef={bassRef}
        midRef={midRef}
        trebleRef={trebleRef}
        beatPulseRef={beatPulseRef}
        hitBellRef={hitBellRef}
        hitPluckRef={hitPluckRef}
        hitDrumRef={hitDrumRef}
        mouseSmoothed={mouseSmoothed}
        stateRef={stateRef}
      />
      <Particles trebleRef={trebleRef} mouseSmoothed={mouseSmoothed} />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.55} luminanceThreshold={0.5} luminanceSmoothing={0.7} kernelSize={3} />
        <Vignette eskil={false} offset={0.22} darkness={0.55} />
      </EffectComposer>
    </Canvas>
  );
}

export const Scene = memo(SceneInner);

function BandsSampler({
  getBands,
  stateRef,
  bassRef,
  midRef,
  trebleRef,
  beatPulseRef,
  hitBellRef,
  hitPluckRef,
  hitDrumRef,
  mouseTarget,
  mouseSmoothed,
}: {
  getBands: () => Bands;
  stateRef: React.RefObject<SceneState>;
  bassRef: React.RefObject<number>;
  midRef: React.RefObject<number>;
  trebleRef: React.RefObject<number>;
  beatPulseRef: React.RefObject<number>;
  hitBellRef: React.RefObject<number>;
  hitPluckRef: React.RefObject<number>;
  hitDrumRef: React.RefObject<number>;
  mouseTarget: React.RefObject<{ x: number; y: number }>;
  mouseSmoothed: React.RefObject<{ x: number; y: number }>;
}) {
  const phase = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, MAX_DT);
    const aBands = 1 - Math.exp(-dt / TAU_BANDS);
    const aPulse = 1 - Math.exp(-dt / TAU_PULSE);
    const aMouse = 1 - Math.exp(-dt / TAU_MOUSE);

    const { bass, mid, treble } = getBands();
    bassRef.current += (bass - bassRef.current) * aBands;
    midRef.current += (mid - midRef.current) * aBands;
    trebleRef.current += (treble - trebleRef.current) * aBands;

    const s = stateRef.current;
    phase.current = (phase.current + dt * s.params.binaural.beatFreq) % 1;
    const target = s.playing ? Math.sin(phase.current * Math.PI * 2) * 0.5 + 0.5 : 0;
    beatPulseRef.current += (target - beatPulseRef.current) * aPulse;

    // Pull engine hit stamps and decay.
    const h = s.hits;
    hitBellRef.current = Math.max(hitBellRef.current, h.bell);
    hitPluckRef.current = Math.max(hitPluckRef.current, h.pluck);
    hitDrumRef.current = Math.max(hitDrumRef.current, h.drum);
    h.bell = h.pluck = h.drum = 0;
    hitBellRef.current *= Math.exp(-dt / TAU_HIT_BELL);
    hitPluckRef.current *= Math.exp(-dt / TAU_HIT_PLUCK);
    hitDrumRef.current *= Math.exp(-dt / TAU_HIT_DRUM);

    // Smooth mouse toward target so movement feels graceful.
    mouseSmoothed.current.x += (mouseTarget.current.x - mouseSmoothed.current.x) * aMouse;
    mouseSmoothed.current.y += (mouseTarget.current.y - mouseSmoothed.current.y) * aMouse;
  });
  return null;
}
