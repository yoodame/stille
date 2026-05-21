import { memo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import type { Bands } from '../audio/engine';
import type { SceneState } from '../audio/useAudioEngine';
import { Background } from './Background';
import { Orb } from './Orb';
import { Particles } from './Particles';

type Props = {
  getBands: () => Bands;
  stateRef: React.RefObject<SceneState>;
};

// Time constants (seconds) for exponential smoothing. dt-independent so a 30fps
// hiccup feels the same as 60fps steady state.
const TAU_BANDS = 0.18;
const TAU_PULSE = 0.22;
// Hit envelope decays — short = punchy, long = lingering.
const TAU_HIT_BELL = 1.4;
const TAU_HIT_PLUCK = 0.6;
const TAU_HIT_DRUM = 0.22;
const MAX_DT = 1 / 24;

const CANVAS_STYLE = { position: 'fixed', inset: 0 } as const;
const CAMERA = { position: [0, 0, 7] as [number, number, number], fov: 30 };
const GL = { antialias: true, alpha: false } as const;
const DPR = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2);

function SceneInner({ getBands, stateRef }: Props) {
  // Live refs read by GPU components each frame.
  const bassRef = useRef(0);
  const midRef = useRef(0);
  const trebleRef = useRef(0);
  const beatPulseRef = useRef(0);
  const hitBellRef = useRef(0);
  const hitPluckRef = useRef(0);
  const hitDrumRef = useRef(0);

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
      />
      <Background
        trebleRef={trebleRef}
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
        stateRef={stateRef}
      />
      <Particles trebleRef={trebleRef} />
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
}) {
  const phase = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, MAX_DT);
    const aBands = 1 - Math.exp(-dt / TAU_BANDS);
    const aPulse = 1 - Math.exp(-dt / TAU_PULSE);

    const { bass, mid, treble } = getBands();
    bassRef.current += (bass - bassRef.current) * aBands;
    midRef.current += (mid - midRef.current) * aBands;
    trebleRef.current += (treble - trebleRef.current) * aBands;

    const s = stateRef.current;
    phase.current = (phase.current + dt * s.params.binaural.beatFreq) % 1;
    const target = s.playing ? Math.sin(phase.current * Math.PI * 2) * 0.5 + 0.5 : 0;
    beatPulseRef.current += (target - beatPulseRef.current) * aPulse;

    // Pull engine hit stamps into refs, then decay them. Engine sets to 1.0
    // on a trigger; we exp-decay each frame.
    const h = s.hits;
    hitBellRef.current = Math.max(hitBellRef.current, h.bell);
    hitPluckRef.current = Math.max(hitPluckRef.current, h.pluck);
    hitDrumRef.current = Math.max(hitDrumRef.current, h.drum);
    h.bell = h.pluck = h.drum = 0;
    hitBellRef.current *= Math.exp(-dt / TAU_HIT_BELL);
    hitPluckRef.current *= Math.exp(-dt / TAU_HIT_PLUCK);
    hitDrumRef.current *= Math.exp(-dt / TAU_HIT_DRUM);
  });
  return null;
}
