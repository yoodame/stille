import { memo, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import type { Bands } from '../audio/engine';
import type { SceneState } from '../audio/useAudioEngine';
import { Background } from './Background';
import { Orb } from './Orb';
import { Particles } from './Particles';
import { Halo } from './Halo';
import { Forest } from './Forest';
import { SCENE_BY_ID } from '../audio/scenes';

const DEFAULT_ORB_POS: [number, number, number] = [0, 0, 0];
const DEFAULT_ORB_SCALE = 0.7;
const ORB_ANCHOR_TAU = 1.4; // seconds — gentle glide to per-scene orb position

type Props = {
  getBands: () => Bands;
  stateRef: React.RefObject<SceneState>;
  /** Re-rendered on scene change so per-scene worlds can mount/unmount. */
  sceneId: string;
};

const TAU_BANDS = 0.18;
const TAU_PULSE = 0.22;
const TAU_HIT_BELL = 1.4;
const TAU_HIT_PLUCK = 0.6;
const TAU_HIT_DRUM = 0.22;
const TAU_MOUSE = 0.18;
const TAU_MOUSE_RECENTER = 2.0; // slower, graceful return-to-center
const LEAVE_DELAY_MS = 800;     // short buffer so quick mouse-outs don't recenter
const MAX_DT = 1 / 24;

const CANVAS_STYLE = { position: 'fixed', inset: 0 } as const;
const CAMERA = { position: [0, 0, 7] as [number, number, number], fov: 30 };
const GL = { antialias: true, alpha: false } as const;
const DPR = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2);

export type OrbAnchor = { x: number; y: number; z: number; scale: number };

function SceneInner({ getBands, stateRef, sceneId }: Props) {
  const bassRef = useRef(0);
  const midRef = useRef(0);
  const trebleRef = useRef(0);
  const beatPulseRef = useRef(0);
  const hitBellRef = useRef(0);
  const hitPluckRef = useRef(0);
  const hitDrumRef = useRef(0);

  // Orb anchor — lerped toward the current scene's per-scene position/scale.
  // Read by Orb, Halo, and Particles so they all track the same focal point.
  const orbAnchor = useRef<OrbAnchor>({
    x: DEFAULT_ORB_POS[0],
    y: DEFAULT_ORB_POS[1],
    z: DEFAULT_ORB_POS[2],
    scale: DEFAULT_ORB_SCALE,
  });

  // Anti-magnetic mouse: raw target (from pointer events) and smoothed value (used by visuals).
  const mouseTarget = useRef({ x: 0, y: 0 });
  const mouseSmoothed = useRef({ x: 0, y: 0 });
  // Timestamp of last pointerleave; null when pointer is in the window.
  // After LEAVE_DELAY_MS with no return, BandsSampler starts the recenter.
  const leftAt = useRef<number | null>(null);
  const recentering = useRef(false);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      mouseTarget.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseTarget.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
      leftAt.current = null;
      recentering.current = false;
    };
    const leave = () => {
      if (leftAt.current === null) leftAt.current = performance.now();
    };
    const onVisibility = () => {
      if (document.hidden) leave();
    };
    window.addEventListener('pointermove', handler, { passive: true });
    // mouseleave on <html> reliably fires when the cursor leaves the viewport.
    document.documentElement.addEventListener('mouseleave', leave);
    // Alt-tab / focus-away counts as "off screen" too.
    window.addEventListener('blur', leave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pointermove', handler);
      document.documentElement.removeEventListener('mouseleave', leave);
      window.removeEventListener('blur', leave);
      document.removeEventListener('visibilitychange', onVisibility);
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
        leftAt={leftAt}
        recentering={recentering}
        orbAnchor={orbAnchor}
      />
      <CameraDrift />
      <Background trebleRef={trebleRef} stateRef={stateRef} />
      <Forest stateRef={stateRef} trebleRef={trebleRef} visible={sceneId === 'forest'} />
      <Halo
        hitBellRef={hitBellRef}
        hitPluckRef={hitPluckRef}
        hitDrumRef={hitDrumRef}
        mouseSmoothed={mouseSmoothed}
        orbAnchor={orbAnchor}
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
        orbAnchor={orbAnchor}
        stateRef={stateRef}
      />
      <Particles
        trebleRef={trebleRef}
        mouseSmoothed={mouseSmoothed}
        orbAnchor={orbAnchor}
        stateRef={stateRef}
      />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.55} luminanceThreshold={0.5} luminanceSmoothing={0.7} kernelSize={3} />
        <Vignette eskil={false} offset={0.22} darkness={0.55} />
      </EffectComposer>
    </Canvas>
  );
}

export const Scene = memo(SceneInner);

/** Gentle camera wobble so the scene feels alive even when nothing's happening. */
function CameraDrift() {
  const t = useRef(0);
  useFrame(({ camera }, dtRaw) => {
    const dt = Math.min(dtRaw, MAX_DT);
    t.current += dt;
    camera.position.x = Math.sin(t.current * 0.03) * 0.18;
    camera.position.y = Math.sin(t.current * 0.025 + 1.5) * 0.12;
    camera.position.z = 7 + Math.sin(t.current * 0.018) * 0.10;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

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
  leftAt,
  recentering,
  orbAnchor,
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
  leftAt: React.RefObject<number | null>;
  recentering: React.RefObject<boolean>;
  orbAnchor: React.RefObject<OrbAnchor>;
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

    // Pull engine hit stamps and decay.
    const h = s.hits;
    hitBellRef.current = Math.max(hitBellRef.current, h.bell);
    hitPluckRef.current = Math.max(hitPluckRef.current, h.pluck);
    hitDrumRef.current = Math.max(hitDrumRef.current, h.drum);
    h.bell = h.pluck = h.drum = 0;
    hitBellRef.current *= Math.exp(-dt / TAU_HIT_BELL);
    hitPluckRef.current *= Math.exp(-dt / TAU_HIT_PLUCK);
    hitDrumRef.current *= Math.exp(-dt / TAU_HIT_DRUM);

    // Recenter after the pointer's been gone LEAVE_DELAY_MS.
    if (leftAt.current !== null && performance.now() - leftAt.current > LEAVE_DELAY_MS) {
      mouseTarget.current.x = 0;
      mouseTarget.current.y = 0;
      recentering.current = true;
    }
    // Use the slower recenter time constant while drifting back to (0, 0).
    const tau = recentering.current ? TAU_MOUSE_RECENTER : TAU_MOUSE;
    const aMouse = 1 - Math.exp(-dt / tau);
    mouseSmoothed.current.x += (mouseTarget.current.x - mouseSmoothed.current.x) * aMouse;
    mouseSmoothed.current.y += (mouseTarget.current.y - mouseSmoothed.current.y) * aMouse;
    // Once we're essentially back at center, drop the recenter flag.
    if (
      recentering.current &&
      Math.abs(mouseSmoothed.current.x) < 0.005 &&
      Math.abs(mouseSmoothed.current.y) < 0.005
    ) {
      recentering.current = false;
    }

    // Lerp orb anchor toward the current scene's per-scene position/scale.
    const sceneOrb = SCENE_BY_ID[stateRef.current.sceneId]?.orb;
    const tx = sceneOrb?.position[0] ?? DEFAULT_ORB_POS[0];
    const ty = sceneOrb?.position[1] ?? DEFAULT_ORB_POS[1];
    const tz = sceneOrb?.position[2] ?? DEFAULT_ORB_POS[2];
    const ts = sceneOrb?.scale       ?? DEFAULT_ORB_SCALE;
    const aRate = 1 - Math.exp(-dt / ORB_ANCHOR_TAU);
    const a = orbAnchor.current;
    a.x += (tx - a.x) * aRate;
    a.y += (ty - a.y) * aRate;
    a.z += (tz - a.z) * aRate;
    a.scale += (ts - a.scale) * aRate;
  });
  return null;
}
