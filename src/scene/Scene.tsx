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
const MAX_DT = 1 / 24; // clamp huge dt after a stall, so visuals don't lurch

const CANVAS_STYLE = { position: 'fixed', inset: 0 } as const;
const CAMERA = { position: [0, 0, 7] as [number, number, number], fov: 30 };
const GL = { antialias: true, alpha: false } as const;
// Pin DPR so R3F doesn't dynamically reallocate render targets (causes black flashes).
const DPR = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2);

function SceneInner({ getBands, stateRef }: Props) {
  // Live refs read by GPU components each frame. Smoothing happens in BandsSampler.
  const bassRef = useRef(0);
  const midRef = useRef(0);
  const trebleRef = useRef(0);
  const beatPulseRef = useRef(0);

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
      />
      <Background trebleRef={trebleRef} stateRef={stateRef} />
      <Orb
        bassRef={bassRef}
        midRef={midRef}
        trebleRef={trebleRef}
        beatPulseRef={beatPulseRef}
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
}: {
  getBands: () => Bands;
  stateRef: React.RefObject<SceneState>;
  bassRef: React.RefObject<number>;
  midRef: React.RefObject<number>;
  trebleRef: React.RefObject<number>;
  beatPulseRef: React.RefObject<number>;
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
  });
  return null;
}
