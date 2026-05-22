import type { DrumKit, Params } from './engine';

export type SceneId = 'drift' | 'forest' | 'aurora' | 'heartwood' | 'coastal' | 'tribal';

export type Palette = {
  warm: [number, number, number];   // 0-1 RGB
  cool: [number, number, number];
  accent: [number, number, number];
};

export type Scene = {
  id: SceneId;
  name: string;
  palette: Palette;
  /** Optional orb positioning per scene. When omitted, orb sits at (0,0,0) scale 0.7. */
  orb?: { position: [number, number, number]; scale: number };
  /** How dark the upper sky is. 0 = bright (default day-feel); 1 = deep night. */
  skyDarkness?: number;
  // Partial params — only the keys we want each scene to override.
  preset: {
    tempo: number;
    binaural: Pick<Params['binaural'], 'volume' | 'carrierFreq' | 'beatFreq'>;
    noise: Pick<Params['noise'], 'volume' | 'pan' | 'cutoff'>;
    pad: Pick<Params['pad'], 'volume' | 'pan' | 'root' | 'brightness'>;
    bells: Pick<Params['bells'], 'volume' | 'pan' | 'rate' | 'octave'>;
    drums: { volume: number; pan: number; kit: DrumKit; swing: number };
    pluck: Pick<Params['pluck'], 'volume' | 'pan' | 'rate' | 'decay' | 'octave'>;
    subBass: Pick<Params['subBass'], 'volume' | 'freq' | 'modDepth'>;
  };
};

export const SCENES: Scene[] = [
  {
    id: 'drift',
    name: 'Drift',
    palette: {
      warm:   [0.96, 0.74, 0.58],
      cool:   [0.22, 0.30, 0.62],
      accent: [1.00, 0.58, 0.32],
    },
    preset: {
      tempo: 62,
      binaural: { volume: 0.35, carrierFreq: 200, beatFreq: 8 },
      noise:    { volume: 0.4, pan: 0,    cutoff: 1400 },
      pad:      { volume: 0.5, pan: 0,    root: 0,  brightness: 0.5 },
      bells:    { volume: 0.3, pan: 0,    rate: 0.3, octave: 0 },
      drums:    { volume: 0,   pan: 0,    kit: 'lofi', swing: 0 },
      pluck:    { volume: 0,   pan: 0,    rate: 0.4, decay: 0.7, octave: 0 },
      subBass:  { volume: 0,   freq: 55,  modDepth: 0.3 },
    },
  },
  {
    id: 'forest',
    name: 'Tranquil Forest',
    palette: {
      warm:   [0.85, 0.76, 0.50],   // amber leaf
      cool:   [0.18, 0.32, 0.24],   // moss
      accent: [0.95, 0.72, 0.40],   // late-afternoon sun
    },
    // Orb becomes a small moon in the upper-middle-right of the sky — over
    // the gap between the left near-pair and the right hero, so no tree
    // silhouette ever overlaps it.
    orb: { position: [1.0, 1.55, -1.2], scale: 0.42 },
    preset: {
      tempo: 56,
      binaural: { volume: 0.28, carrierFreq: 175, beatFreq: 6 },
      noise:    { volume: 0.6, pan: 0.12, cutoff: 800 },     // warm, brown-noise-ish
      pad:      { volume: 0.55, pan: -0.1, root: -2, brightness: 0.32 },
      bells:    { volume: 0,   pan: 0,    rate: 0.2, octave: 0 },
      drums:    { volume: 0,   pan: 0,    kit: 'lofi', swing: 0 },
      pluck:    { volume: 0.5, pan: 0.15, rate: 0.4, decay: 0.55, octave: 0 }, // rain on leaves
      subBass:  { volume: 0.4, freq: 50,  modDepth: 0.4 },
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    palette: {
      warm:   [0.82, 0.74, 1.00],   // soft violet
      cool:   [0.16, 0.34, 0.52],   // deep teal
      accent: [0.68, 0.86, 1.00],   // ice cyan
    },
    // Orb is a small distant moon in the upper-left.
    orb: { position: [-1.6, 1.55, -1.2], scale: 0.38 },
    // Aurora needs a properly dark night sky for the lights to glow against.
    skyDarkness: 0.94,
    preset: {
      tempo: 50,
      binaural: { volume: 0.28, carrierFreq: 240, beatFreq: 5 },
      noise:    { volume: 0.3, pan: 0,    cutoff: 3200 },    // airy
      pad:      { volume: 0.7, pan: 0,    root: 3,  brightness: 0.72 },
      bells:    { volume: 0.5, pan: -0.18, rate: 0.13, octave: 1 }, // icy chimes
      drums:    { volume: 0,   pan: 0,    kit: 'lofi', swing: 0 },
      pluck:    { volume: 0,   pan: 0,    rate: 0.3, decay: 0.7, octave: 0 },
      subBass:  { volume: 0.2, freq: 38,  modDepth: 0.2 },
    },
  },
  {
    id: 'heartwood',
    name: 'Heartwood',
    palette: {
      warm:   [0.92, 0.62, 0.42],   // ember
      cool:   [0.32, 0.18, 0.22],   // burgundy
      accent: [1.00, 0.50, 0.30],   // glowing coal
    },
    preset: {
      tempo: 58,
      binaural: { volume: 0.3, carrierFreq: 160, beatFreq: 7 },
      noise:    { volume: 0.25, pan: 0,   cutoff: 600 },
      pad:      { volume: 0.6, pan: 0,    root: -3, brightness: 0.42 },
      bells:    { volume: 0.2, pan: 0.15, rate: 0.18, octave: -1 },  // low warm bells
      drums:    { volume: 0.3, pan: 0,    kit: 'lofi', swing: 0.15 }, // soft pulse
      pluck:    { volume: 0.3, pan: -0.1, rate: 0.35, decay: 0.9, octave: -1 },
      subBass:  { volume: 0.5, freq: 60,  modDepth: 0.3 },
    },
  },
  {
    id: 'coastal',
    name: 'Coastal',
    palette: {
      warm:   [0.92, 0.88, 0.75],   // sun on sand
      cool:   [0.34, 0.45, 0.58],   // sea blue
      accent: [0.82, 0.92, 1.00],   // foam
    },
    preset: {
      tempo: 52,
      binaural: { volume: 0.22, carrierFreq: 210, beatFreq: 6 },
      noise:    { volume: 0.8, pan: 0,    cutoff: 2200 },    // wide wind/water
      pad:      { volume: 0.4, pan: 0,    root: 0,  brightness: 0.6 },
      bells:    { volume: 0.4, pan: 0.22, rate: 0.1, octave: 1 },    // distant chimes
      drums:    { volume: 0,   pan: 0,    kit: 'lofi', swing: 0 },
      pluck:    { volume: 0,   pan: 0,    rate: 0.3, decay: 0.7, octave: 0 },
      subBass:  { volume: 0.3, freq: 45,  modDepth: 0.5 },           // slow tide
    },
  },
  {
    id: 'tribal',
    name: 'Tribal',
    palette: {
      warm:   [0.88, 0.50, 0.32],
      cool:   [0.30, 0.14, 0.16],
      accent: [1.00, 0.55, 0.28],
    },
    preset: {
      tempo: 78,
      binaural: { volume: 0.28, carrierFreq: 180, beatFreq: 10 },
      noise:    { volume: 0.3, pan: 0,    cutoff: 1200 },
      pad:      { volume: 0.4, pan: 0,    root: -5, brightness: 0.3 },
      bells:    { volume: 0,   pan: 0,    rate: 0.2, octave: 0 },
      drums:    { volume: 0.55, pan: 0,   kit: 'tribal', swing: 0.2 },
      pluck:    { volume: 0.35, pan: 0.1, rate: 0.5, decay: 0.5, octave: 0 },
      subBass:  { volume: 0.5, freq: 55,  modDepth: 0.4 },
    },
  },
];

export const SCENE_BY_ID: Record<SceneId, Scene> = Object.fromEntries(
  SCENES.map((s) => [s.id, s]),
) as Record<SceneId, Scene>;

/**
 * Return a copy of the palette gently tinted by the user's local time-of-day.
 * Subtle (±12% warmth shift, ±10% brightness shift) — same scene reads
 * differently at noon vs at 2am.
 */
export function tintForTimeOfDay(p: Palette, date: Date = new Date()): Palette {
  const hour = date.getHours() + date.getMinutes() / 60;
  // warmth peaks at 6pm (dusk), low at 6am (dawn)
  const warmth = 0.5 + 0.5 * Math.cos(((hour - 18) / 24) * Math.PI * 2);
  // brightness peaks at noon, low at midnight
  const brightness = 0.5 + 0.5 * Math.cos(((hour - 12) / 24) * Math.PI * 2);

  const warmShift = (warmth - 0.5) * 0.12;
  const brightShift = (brightness - 0.5) * 0.10;

  const tint = (c: [number, number, number]): [number, number, number] => [
    Math.max(0, Math.min(1, c[0] + warmShift + brightShift)),
    Math.max(0, Math.min(1, c[1] + brightShift)),
    Math.max(0, Math.min(1, c[2] - warmShift + brightShift)),
  ];

  return { warm: tint(p.warm), cool: tint(p.cool), accent: tint(p.accent) };
}
