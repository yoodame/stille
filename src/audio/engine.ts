export type Bands = { bass: number; mid: number; treble: number };
export type DrumKit = 'lofi' | 'tribal' | 'electronic';

const PINK_NOISE_DURATION_S = 4;
const FADE_S = 1.5;

// Diatonic + pentatonic scales over two octaves. Used by bell/pluck.
const PENTATONIC_BASE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

// Minor-pentatonic semitone offsets used for the melodic sub-bass — meditative phrasing.
const BASS_OFFSETS = [0, -3, -5, 0, +2, -7, 0, +5, -3, 0, -5, +2];

// 16-step drum grooves per kit. kick/snare are boolean; hat is a velocity 0..1.
type DrumPattern = {
  kick: ReadonlyArray<0 | 1>;
  snare: ReadonlyArray<0 | 1>;
  hat: ReadonlyArray<number>;
};
const DRUM_PATTERNS: Record<DrumKit, DrumPattern> = {
  // Boom-bap: kick on 1 + the "and of 2", snare 2 + 4, hat 8ths with quiet ghosts.
  lofi: {
    kick:  [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hat:   [1,0.35,1,0.35, 1,0.35,1,0.35, 1,0.35,1,0.35, 1,0.35,1,0.35],
  },
  // Polyrhythmic: kick syncopated, clave 3-2 son pattern, shaker every 16th.
  tribal: {
    kick:  [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,1,0,0],
    snare: [1,0,0,0, 0,0,0,1, 0,0,1,0, 0,1,0,0],
    hat:   [1,0.7,1,0.7, 1,0.7,1,0.7, 1,0.7,1,0.7, 1,0.7,1,0.7],
  },
  // Four-on-the-floor: kick every quarter, clap 2 + 4, hat with off-beat accent.
  electronic: {
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hat:   [1,0,0.55,0, 1,0,0.55,0, 1,0,0.55,0, 1,0,0.55,0],
  },
};

export type Params = {
  tempo: number; // BPM, 40-120
  drift: { enabled: boolean; intervalSec: number };
  binaural: { volume: number; carrierFreq: number; beatFreq: number };
  noise: { volume: number; pan: number; cutoff: number };
  pad: { volume: number; pan: number; root: number; brightness: number };
  bells: { volume: number; pan: number; rate: number; octave: number };
  drums: { volume: number; pan: number; kit: DrumKit; swing: number };
  pluck: { volume: number; pan: number; rate: number; decay: number; octave: number };
  subBass: { volume: number; freq: number; modDepth: number };
  locks: Record<VoiceId, boolean>;
};

export type VoiceId = 'binaural' | 'noise' | 'pad' | 'bells' | 'drums' | 'pluck' | 'subBass';

export const DEFAULTS: Params = {
  tempo: 62,
  drift: { enabled: false, intervalSec: 120 },
  binaural: { volume: 0.35, carrierFreq: 200, beatFreq: 8 },
  noise: { volume: 0.4, pan: 0, cutoff: 1400 },
  pad: { volume: 0.5, pan: 0, root: 0, brightness: 0.5 },
  bells: { volume: 0.3, pan: 0, rate: 0.3, octave: 0 },
  drums: { volume: 0, pan: 0, kit: 'lofi', swing: 0 },
  pluck: { volume: 0, pan: 0, rate: 0.4, decay: 0.7, octave: 0 },
  subBass: { volume: 0, freq: 55, modDepth: 0.3 },
  locks: { binaural: false, noise: false, pad: false, bells: false, drums: false, pluck: false, subBass: false },
};

// Numeric ranges for sliders + drift bounds. Strings (kit) handled separately.
export const RANGES: Record<string, { min: number; max: number; step: number }> = {
  'tempo':           { min: 40,  max: 120, step: 1 },
  'drift.intervalSec': { min: 30, max: 180, step: 5 },
  'binaural.volume':    { min: 0,    max: 1,    step: 0.01 },
  'binaural.carrierFreq': { min: 120, max: 300, step: 1 },
  'binaural.beatFreq':  { min: 4,    max: 14,   step: 0.1 },
  'noise.volume':       { min: 0,    max: 1,    step: 0.01 },
  'noise.pan':          { min: -1,   max: 1,    step: 0.01 },
  'noise.cutoff':       { min: 300,  max: 8000, step: 50 },
  'pad.volume':         { min: 0,    max: 1,    step: 0.01 },
  'pad.pan':            { min: -1,   max: 1,    step: 0.01 },
  'pad.root':           { min: -7,   max: 7,    step: 1 },
  'pad.brightness':     { min: 0,    max: 1,    step: 0.01 },
  'bells.volume':       { min: 0,    max: 1,    step: 0.01 },
  'bells.pan':          { min: -1,   max: 1,    step: 0.01 },
  'bells.rate':         { min: 0,    max: 1,    step: 0.01 },
  'bells.octave':       { min: -1,   max: 2,    step: 1 },
  'drums.volume':       { min: 0,    max: 1,    step: 0.01 },
  'drums.pan':          { min: -1,   max: 1,    step: 0.01 },
  'drums.swing':        { min: 0,    max: 0.4,  step: 0.01 },
  'pluck.volume':       { min: 0,    max: 1,    step: 0.01 },
  'pluck.pan':          { min: -1,   max: 1,    step: 0.01 },
  'pluck.rate':         { min: 0,    max: 1,    step: 0.01 },
  'pluck.decay':        { min: 0.3,  max: 1.5,  step: 0.01 },
  'pluck.octave':       { min: -1,   max: 2,    step: 1 },
  'subBass.volume':     { min: 0,    max: 1,    step: 0.01 },
  'subBass.freq':       { min: 30,   max: 80,   step: 0.5 },
  'subBass.modDepth':   { min: 0,    max: 1,    step: 0.01 },
};

// Numeric params that Drift mode is allowed to nudge per voice.
const DRIFT_PARAMS: Record<VoiceId, string[]> = {
  binaural: ['beatFreq', 'carrierFreq'],
  noise: ['cutoff', 'pan'],
  pad: ['root', 'brightness', 'pan'],
  bells: ['rate', 'octave', 'pan'],
  drums: ['swing'],
  pluck: ['rate', 'decay', 'octave', 'pan'],
  subBass: ['freq', 'modDepth'],
};

function clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }
function easeInOut(t: number) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

type Lerp = { voice: VoiceId; param: string; from: number; to: number; startMs: number; durationMs: number };

export type Hits = { bell: number; pluck: number; drum: number };

export class AudioEngine {
  readonly params: Params = JSON.parse(JSON.stringify(DEFAULTS));
  /** Transient-event envelopes. Engine stamps 1.0 on triggers; the visual layer decays them. */
  readonly hits: Hits = { bell: 0, pluck: 0, drum: 0 };

  private ctx: AudioContext;
  private master: GainNode;
  private analyser: AnalyserNode;
  private freqData: Uint8Array<ArrayBuffer>;

  // Binaural
  private leftOsc: OscillatorNode | null = null;
  private rightOsc: OscillatorNode | null = null;
  private leftPan: StereoPannerNode;
  private rightPan: StereoPannerNode;
  private binauralGain: GainNode;

  // Noise
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private noiseFilter: BiquadFilterNode;
  private noisePanner: StereoPannerNode;
  private noiseGain: GainNode;

  // Pad
  private padOscs: OscillatorNode[] = [];
  private padFilter: BiquadFilterNode;
  private padPanner: StereoPannerNode;
  private padGain: GainNode;

  // Bell
  private bellPanner: StereoPannerNode;
  private bellGain: GainNode;
  private bellTimer: number | null = null;

  // Drum (16-step grooves)
  private drumPanner: StereoPannerNode;
  private drumGain: GainNode;
  private drumTimer: number | null = null;
  private drumNextBeatTime = 0;
  private drumStepIndex = 0;

  // Melodic sub-bass scheduler
  private subBassTimer: number | null = null;
  private subBassNoteIdx = 0;

  // Pluck
  private pluckPanner: StereoPannerNode;
  private pluckGain: GainNode;
  private pluckTimer: number | null = null;

  // Sub-bass
  private subOsc: OscillatorNode | null = null;
  private subLfo: OscillatorNode | null = null;
  private subLfoGain: GainNode | null = null;
  private subGain: GainNode;

  // Drift
  private driftTimer: number | null = null;
  private lerps: Lerp[] = [];
  private lerpFrame: number | null = null;

  private _playing = false;
  private stopTimer: number | null = null;

  constructor() {
    this.ctx = new AudioContext();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;
    this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Binaural chain
    this.binauralGain = this.ctx.createGain();
    this.binauralGain.connect(this.master);
    this.leftPan = this.ctx.createStereoPanner();
    this.leftPan.pan.value = -1;
    this.leftPan.connect(this.binauralGain);
    this.rightPan = this.ctx.createStereoPanner();
    this.rightPan.pan.value = 1;
    this.rightPan.connect(this.binauralGain);

    // Noise chain: filter -> panner -> gain -> master
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.connect(this.master);
    this.noisePanner = this.ctx.createStereoPanner();
    this.noisePanner.connect(this.noiseGain);
    this.noiseFilter = this.ctx.createBiquadFilter();
    this.noiseFilter.type = 'lowpass';
    this.noiseFilter.Q.value = 0.7;
    this.noiseFilter.connect(this.noisePanner);

    // Pad chain: oscs -> filter -> panner -> gain
    this.padGain = this.ctx.createGain();
    this.padGain.connect(this.master);
    this.padPanner = this.ctx.createStereoPanner();
    this.padPanner.connect(this.padGain);
    this.padFilter = this.ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.Q.value = 0.5;
    this.padFilter.connect(this.padPanner);

    // Bell chain
    this.bellGain = this.ctx.createGain();
    this.bellGain.connect(this.master);
    this.bellPanner = this.ctx.createStereoPanner();
    this.bellPanner.connect(this.bellGain);

    // Drum chain
    this.drumGain = this.ctx.createGain();
    this.drumGain.connect(this.master);
    this.drumPanner = this.ctx.createStereoPanner();
    this.drumPanner.connect(this.drumGain);

    // Pluck chain
    this.pluckGain = this.ctx.createGain();
    this.pluckGain.connect(this.master);
    this.pluckPanner = this.ctx.createStereoPanner();
    this.pluckPanner.connect(this.pluckGain);

    // Sub-bass
    this.subGain = this.ctx.createGain();
    this.subGain.connect(this.master);

    // Apply initial params to gains/filters
    this.applyAll();
  }

  async start(): Promise<void> {
    if (this._playing) return;
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
      this.teardownVoices();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const now = this.ctx.currentTime;

    // Binaural
    const p = this.params;
    this.leftOsc = this.ctx.createOscillator();
    this.leftOsc.type = 'sine';
    this.leftOsc.frequency.value = p.binaural.carrierFreq;
    this.leftOsc.connect(this.leftPan);
    this.leftOsc.start();

    this.rightOsc = this.ctx.createOscillator();
    this.rightOsc.type = 'sine';
    this.rightOsc.frequency.value = p.binaural.carrierFreq + p.binaural.beatFreq;
    this.rightOsc.connect(this.rightPan);
    this.rightOsc.start();

    // Noise
    if (!this.noiseBuffer) this.noiseBuffer = this.createPinkNoiseBuffer();
    this.noiseSource = this.ctx.createBufferSource();
    this.noiseSource.buffer = this.noiseBuffer;
    this.noiseSource.loop = true;
    this.noiseSource.connect(this.noiseFilter);
    this.noiseSource.start();

    // Pad — root in semitones from base 110 Hz (A2)
    this.startPad();

    // Sub-bass
    this.startSubBass();

    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), now);
    this.master.gain.exponentialRampToValueAtTime(0.7, now + FADE_S);

    this._playing = true;

    this.scheduleNextBell();
    this.startDrumScheduler();
    this.scheduleNextPluck();
    this.scheduleNextBassNote();
    this.scheduleNextDrift();
  }

  stop(): void {
    if (!this._playing) return;
    const now = this.ctx.currentTime;
    const cur = this.master.gain.value;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(cur, 0.0001), now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + FADE_S);

    this._playing = false;
    [this.bellTimer, this.drumTimer, this.pluckTimer, this.driftTimer, this.subBassTimer].forEach((t) => {
      if (t !== null) clearTimeout(t);
    });
    this.bellTimer = this.drumTimer = this.pluckTimer = this.driftTimer = this.subBassTimer = null;
    this.lerps = [];

    this.stopTimer = window.setTimeout(() => {
      this.teardownVoices();
      this.stopTimer = null;
    }, FADE_S * 1000 + 100);
  }

  get playing(): boolean { return this._playing; }

  /**
   * Single setter. Path is "voice.param", e.g. "bells.volume", "drift.intervalSec", "tempo".
   */
  setParam(path: string, value: number | string | boolean): void {
    const parts = path.split('.');
    let target: Record<string, unknown> = this.params as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      target = target[parts[i]] as Record<string, unknown>;
    }
    target[parts[parts.length - 1]] = value;
    this.applyPath(path);
  }

  setLock(voice: VoiceId, locked: boolean): void {
    this.params.locks[voice] = locked;
  }

  applyScene(preset: {
    tempo: number;
    binaural: { volume: number; carrierFreq: number; beatFreq: number };
    noise: { volume: number; pan: number; cutoff: number };
    pad: { volume: number; pan: number; root: number; brightness: number };
    bells: { volume: number; pan: number; rate: number; octave: number };
    drums: { volume: number; pan: number; kit: DrumKit; swing: number };
    pluck: { volume: number; pan: number; rate: number; decay: number; octave: number };
    subBass: { volume: number; freq: number; modDepth: number };
  }): void {
    const dur = 2500;
    // Tempo lerp via params.tempo direct write (no audio param)
    this.lerpScalar('tempo', this.params.tempo, preset.tempo, dur);

    const lerpVoice = <V extends VoiceId>(v: V, vals: Record<string, number>) => {
      for (const k of Object.keys(vals)) this.startLerp(v, k, vals[k], dur);
    };
    lerpVoice('binaural', preset.binaural);
    lerpVoice('noise', preset.noise);
    lerpVoice('pad', preset.pad);
    lerpVoice('bells', preset.bells);
    lerpVoice('pluck', preset.pluck);
    lerpVoice('subBass', preset.subBass);
    lerpVoice('drums', { volume: preset.drums.volume, pan: preset.drums.pan, swing: preset.drums.swing });

    // Kit is a string — swap immediately.
    this.params.drums.kit = preset.drums.kit;
  }

  randomizeAll(): void {
    const voices: VoiceId[] = ['binaural', 'noise', 'pad', 'bells', 'drums', 'pluck', 'subBass'];
    for (const v of voices) {
      if (this.params.locks[v]) continue;
      const params = DRIFT_PARAMS[v];
      for (const param of params) {
        const range = RANGES[`${v}.${param}`];
        if (!range) continue;
        const target = range.min + Math.random() * (range.max - range.min);
        this.startLerp(v, param, target, 4000);
      }
    }
  }

  getBands(): Bands {
    this.analyser.getByteFrequencyData(this.freqData);
    const nyquist = this.ctx.sampleRate / 2;
    const binWidth = nyquist / this.analyser.frequencyBinCount;
    const bassEnd = Math.max(1, Math.floor(250 / binWidth));
    const midEnd = Math.max(bassEnd + 1, Math.floor(2000 / binWidth));
    const trebleEnd = Math.max(midEnd + 1, Math.floor(8000 / binWidth));
    let bass = 0, mid = 0, treble = 0;
    for (let i = 0; i < bassEnd; i++) bass += this.freqData[i];
    for (let i = bassEnd; i < midEnd; i++) mid += this.freqData[i];
    for (let i = midEnd; i < trebleEnd; i++) treble += this.freqData[i];
    return {
      bass: bass / (bassEnd * 255),
      mid: mid / ((midEnd - bassEnd) * 255),
      treble: treble / ((trebleEnd - midEnd) * 255),
    };
  }

  // ===== Param application =====

  private applyAll() {
    this.applyBinaural();
    this.applyNoise();
    this.applyPad();
    this.applyBells();
    this.applyDrums();
    this.applyPluck();
    this.applySubBass();
  }

  private applyPath(path: string) {
    const v = path.split('.')[0];
    switch (v) {
      case 'binaural': this.applyBinaural(); break;
      case 'noise': this.applyNoise(); break;
      case 'pad': this.applyPad(); break;
      case 'bells': this.applyBells(); break;
      case 'drums': this.applyDrums(); break;
      case 'pluck': this.applyPluck(); break;
      case 'subBass': this.applySubBass(); break;
    }
  }

  private applyBinaural() {
    const p = this.params.binaural;
    const t = this.ctx.currentTime;
    this.binauralGain.gain.cancelScheduledValues(t);
    this.binauralGain.gain.linearRampToValueAtTime(p.volume * 0.13, t + 0.1);
    if (this.leftOsc) {
      this.leftOsc.frequency.cancelScheduledValues(t);
      this.leftOsc.frequency.linearRampToValueAtTime(p.carrierFreq, t + 0.1);
    }
    if (this.rightOsc) {
      this.rightOsc.frequency.cancelScheduledValues(t);
      this.rightOsc.frequency.linearRampToValueAtTime(p.carrierFreq + p.beatFreq, t + 0.1);
    }
  }

  private applyNoise() {
    const p = this.params.noise;
    const t = this.ctx.currentTime;
    this.noiseGain.gain.cancelScheduledValues(t);
    this.noiseGain.gain.linearRampToValueAtTime(p.volume * 0.32, t + 0.1);
    this.noisePanner.pan.cancelScheduledValues(t);
    this.noisePanner.pan.linearRampToValueAtTime(p.pan, t + 0.1);
    this.noiseFilter.frequency.cancelScheduledValues(t);
    this.noiseFilter.frequency.linearRampToValueAtTime(p.cutoff, t + 0.1);
  }

  private applyPad() {
    const p = this.params.pad;
    const t = this.ctx.currentTime;
    this.padGain.gain.cancelScheduledValues(t);
    this.padGain.gain.linearRampToValueAtTime(p.volume * 0.24, t + 0.1);
    this.padPanner.pan.cancelScheduledValues(t);
    this.padPanner.pan.linearRampToValueAtTime(p.pan, t + 0.1);
    // Brightness: 0 → 400 Hz, 1 → 4000 Hz (log)
    const cutoff = 400 * Math.pow(10, p.brightness * 1.0);
    this.padFilter.frequency.cancelScheduledValues(t);
    this.padFilter.frequency.linearRampToValueAtTime(cutoff, t + 0.1);
    // Root: shift oscillator frequencies by semitones
    const ratio = Math.pow(2, p.root / 12);
    this.padOscs.forEach((osc, i) => {
      const base = [110, 164.81, 220][i] ?? 110;
      osc.frequency.cancelScheduledValues(t);
      osc.frequency.linearRampToValueAtTime(base * ratio, t + 0.15);
    });
  }

  private startPad() {
    const ratio = Math.pow(2, this.params.pad.root / 12);
    const chord = [
      { freq: 110 * ratio, detune: 0 },
      { freq: 164.81 * ratio, detune: 5 },
      { freq: 220 * ratio, detune: -4 },
    ];
    this.padOscs = chord.map(({ freq, detune }) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const voiceGain = this.ctx.createGain();
      voiceGain.gain.value = 1 / chord.length;
      osc.connect(voiceGain);
      voiceGain.connect(this.padFilter);
      osc.start();
      return osc;
    });
  }

  private applyBells() {
    const p = this.params.bells;
    const t = this.ctx.currentTime;
    this.bellGain.gain.cancelScheduledValues(t);
    this.bellGain.gain.linearRampToValueAtTime(p.volume * 0.4, t + 0.1);
    this.bellPanner.pan.cancelScheduledValues(t);
    this.bellPanner.pan.linearRampToValueAtTime(p.pan, t + 0.1);
  }

  private applyDrums() {
    const p = this.params.drums;
    const t = this.ctx.currentTime;
    this.drumGain.gain.cancelScheduledValues(t);
    this.drumGain.gain.linearRampToValueAtTime(p.volume * 0.55, t + 0.1);
    this.drumPanner.pan.cancelScheduledValues(t);
    this.drumPanner.pan.linearRampToValueAtTime(p.pan, t + 0.1);
  }

  private applyPluck() {
    const p = this.params.pluck;
    const t = this.ctx.currentTime;
    this.pluckGain.gain.cancelScheduledValues(t);
    this.pluckGain.gain.linearRampToValueAtTime(p.volume * 0.45, t + 0.1);
    this.pluckPanner.pan.cancelScheduledValues(t);
    this.pluckPanner.pan.linearRampToValueAtTime(p.pan, t + 0.1);
  }

  private applySubBass() {
    const p = this.params.subBass;
    const t = this.ctx.currentTime;
    this.subGain.gain.cancelScheduledValues(t);
    this.subGain.gain.linearRampToValueAtTime(p.volume * 0.4, t + 0.1);
    // Note: sub.frequency is owned by the melodic scheduler so we don't fight it.
    // User's freq slider takes effect on the next scheduled note (within ~5s).
    if (this.subLfoGain) {
      this.subLfoGain.gain.cancelScheduledValues(t);
      this.subLfoGain.gain.linearRampToValueAtTime(p.modDepth * p.freq * 0.06, t + 0.3);
    }
  }

  private startSubBass() {
    const p = this.params.subBass;
    this.subOsc = this.ctx.createOscillator();
    this.subOsc.type = 'sine';
    this.subOsc.frequency.value = p.freq;
    this.subLfo = this.ctx.createOscillator();
    this.subLfo.type = 'sine';
    this.subLfo.frequency.value = 0.08; // slow swell
    this.subLfoGain = this.ctx.createGain();
    this.subLfoGain.gain.value = p.modDepth * p.freq * 0.06;
    this.subLfo.connect(this.subLfoGain);
    this.subLfoGain.connect(this.subOsc.frequency);
    this.subOsc.connect(this.subGain);
    this.subOsc.start();
    this.subLfo.start();
  }

  // ===== Bell scheduler (FM synth, sparse) =====

  private scheduleNextBell = () => {
    if (!this._playing) { this.bellTimer = null; return; }
    if (this.params.bells.volume > 0.01) this.triggerBell();
    // Rate 0→1 maps to interval 12s → 1.5s
    const rate = this.params.bells.rate;
    const base = 12 - rate * 10.5;
    const interval = (base * 1000) * (0.7 + Math.random() * 0.6);
    this.bellTimer = window.setTimeout(this.scheduleNextBell, interval);
  };

  private triggerBell() {
    this.hits.bell = 1;
    const now = this.ctx.currentTime + 0.02;
    const oct = this.params.bells.octave;
    const baseFreq = PENTATONIC_BASE[Math.floor(Math.random() * PENTATONIC_BASE.length)];
    const freq = baseFreq * Math.pow(2, oct);

    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;
    const modulator = this.ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.value = freq * 3.5;
    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(freq * 8, now);
    modGain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(0.55, now + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + 3.0);

    carrier.connect(amp);
    amp.connect(this.bellPanner);

    modulator.start(now);
    carrier.start(now);
    modulator.stop(now + 3.2);
    carrier.stop(now + 3.2);
  }

  // ===== Pluck scheduler (Karplus-like via filtered noise burst → resonator-ish, simplified) =====

  private scheduleNextPluck = () => {
    if (!this._playing) { this.pluckTimer = null; return; }
    if (this.params.pluck.volume > 0.01) this.triggerPluck();
    const rate = this.params.pluck.rate;
    const base = 8 - rate * 7.0; // 8s → 1s
    const interval = (base * 1000) * (0.6 + Math.random() * 0.8);
    this.pluckTimer = window.setTimeout(this.scheduleNextPluck, interval);
  };

  private triggerPluck() {
    this.hits.pluck = 1;
    const now = this.ctx.currentTime + 0.02;
    const oct = this.params.pluck.octave;
    const decay = this.params.pluck.decay;
    const baseFreq = PENTATONIC_BASE[Math.floor(Math.random() * PENTATONIC_BASE.length)];
    const freq = baseFreq * Math.pow(2, oct);

    // Marimba-ish: two sines an octave apart, fast decay
    const oscA = this.ctx.createOscillator();
    oscA.type = 'triangle';
    oscA.frequency.value = freq;
    const oscB = this.ctx.createOscillator();
    oscB.type = 'sine';
    oscB.frequency.value = freq * 2;
    const oscBGain = this.ctx.createGain();
    oscBGain.gain.value = 0.3;
    oscB.connect(oscBGain);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(0.5, now + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    oscA.connect(amp);
    oscBGain.connect(amp);
    amp.connect(this.pluckPanner);

    oscA.start(now);
    oscB.start(now);
    oscA.stop(now + decay + 0.1);
    oscB.stop(now + decay + 0.1);
  }

  // ===== Drum scheduler =====

  private startDrumScheduler() {
    this.drumNextBeatTime = this.ctx.currentTime + 0.1;
    this.drumStepIndex = 0;
    this.tickDrumScheduler();
  }

  private tickDrumScheduler = () => {
    if (!this._playing) { this.drumTimer = null; return; }
    const lookahead = 0.25;
    const stepDuration = (60 / this.params.tempo) / 4; // 16th note
    const audible = this.params.drums.volume > 0.01;

    while (this.drumNextBeatTime < this.ctx.currentTime + lookahead) {
      if (audible) {
        const step = this.drumStepIndex % 16;
        // Swing pushes odd 16ths (the "and") slightly later for groove.
        const swingShift = (step % 2 === 1) ? this.params.drums.swing * stepDuration : 0;
        this.scheduleDrumStep(this.drumNextBeatTime + swingShift, step);
      }
      this.drumNextBeatTime += stepDuration;
      this.drumStepIndex++;
    }
    this.drumTimer = window.setTimeout(this.tickDrumScheduler, 30);
  };

  private scheduleDrumStep(time: number, step: number) {
    const kit = this.params.drums.kit;
    const pattern = DRUM_PATTERNS[kit];
    if (pattern.kick[step]) this.kick(time, kit);
    if (pattern.snare[step]) this.snare(time, kit);
    const hatVel = pattern.hat[step];
    if (hatVel > 0) this.hat(time, hatVel, kit);
  }

  // ===== Melodic sub-bass scheduler =====

  private scheduleNextBassNote = () => {
    if (!this._playing) { this.subBassTimer = null; return; }
    if (this.params.subBass.volume > 0.01 && this.subOsc) {
      const offset = BASS_OFFSETS[this.subBassNoteIdx % BASS_OFFSETS.length];
      this.subBassNoteIdx++;
      const targetFreq = this.params.subBass.freq * Math.pow(2, offset / 12);
      const now = this.ctx.currentTime;
      this.subOsc.frequency.cancelScheduledValues(now);
      this.subOsc.frequency.linearRampToValueAtTime(targetFreq, now + 1.4);
    }
    // 4-7s between notes — meditative phrasing.
    const interval = 4000 + Math.random() * 3000;
    this.subBassTimer = window.setTimeout(this.scheduleNextBassNote, interval);
  };

  private kick(time: number, kit: DrumKit) {
    this.hits.drum = 1;
    if (kit === 'electronic') this.kickElectronic(time);
    else if (kit === 'tribal') this.kickTribal(time);
    else this.kickLofi(time);
  }

  /** Lo-fi: warm sub-kick + a faint tape "click" for character. */
  private kickLofi(time: number) {
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(100, time);
    sub.frequency.exponentialRampToValueAtTime(38, time + 0.20);
    const subAmp = this.ctx.createGain();
    subAmp.gain.setValueAtTime(0, time);
    subAmp.gain.linearRampToValueAtTime(0.85, time + 0.007);
    subAmp.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);
    sub.connect(subAmp);
    subAmp.connect(this.drumPanner);
    sub.start(time);
    sub.stop(time + 0.5);

    if (this.noiseBuffer) {
      const click = this.ctx.createBufferSource();
      click.buffer = this.noiseBuffer;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 320;
      f.Q.value = 5;
      const a = this.ctx.createGain();
      a.gain.setValueAtTime(0.45, time);
      a.gain.exponentialRampToValueAtTime(0.0001, time + 0.025);
      click.connect(f); f.connect(a); a.connect(this.drumPanner);
      click.start(time, Math.random() * (PINK_NOISE_DURATION_S - 0.1));
      click.stop(time + 0.04);
    }
  }

  /** Tribal: low wooden tom — fundamental + 2x harmonic, long decay. */
  private kickTribal(time: number) {
    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(76, time);
    body.frequency.exponentialRampToValueAtTime(56, time + 0.5);
    const harm = this.ctx.createOscillator();
    harm.type = 'triangle';
    harm.frequency.setValueAtTime(152, time);
    harm.frequency.exponentialRampToValueAtTime(115, time + 0.4);
    const harmGain = this.ctx.createGain();
    harmGain.gain.value = 0.32;
    harm.connect(harmGain);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(0.78, time + 0.018);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.75);
    body.connect(amp); harmGain.connect(amp); amp.connect(this.drumPanner);
    body.start(time); harm.start(time);
    body.stop(time + 0.8); harm.stop(time + 0.8);
  }

  /** Electronic: tight 808-style — fast pitch-drop click + sustained sub. */
  private kickElectronic(time: number) {
    const click = this.ctx.createOscillator();
    click.type = 'sine';
    click.frequency.setValueAtTime(180, time);
    click.frequency.exponentialRampToValueAtTime(35, time + 0.045);
    const clickAmp = this.ctx.createGain();
    clickAmp.gain.setValueAtTime(0, time);
    clickAmp.gain.linearRampToValueAtTime(0.85, time + 0.001);
    clickAmp.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
    click.connect(clickAmp); clickAmp.connect(this.drumPanner);

    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(50, time);
    sub.frequency.exponentialRampToValueAtTime(40, time + 0.3);
    const subAmp = this.ctx.createGain();
    subAmp.gain.setValueAtTime(0, time);
    subAmp.gain.linearRampToValueAtTime(0.62, time + 0.004);
    subAmp.gain.exponentialRampToValueAtTime(0.0001, time + 0.42);
    sub.connect(subAmp); subAmp.connect(this.drumPanner);

    click.start(time); sub.start(time);
    click.stop(time + 0.1); sub.stop(time + 0.5);
  }

  private snare(time: number, kit: DrumKit) {
    this.hits.drum = Math.max(this.hits.drum, 0.7);
    if (kit === 'electronic') this.snareElectronic(time);
    else if (kit === 'tribal') this.snareTribal(time);
    else this.snareLofi(time);
  }

  /** Lo-fi snare — paper-snap: warm bandpass body + 200Hz sine thump. */
  private snareLofi(time: number) {
    if (!this.noiseBuffer) return;
    const body = this.ctx.createBufferSource();
    body.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 2.2;
    const a = this.ctx.createGain();
    a.gain.setValueAtTime(0, time);
    a.gain.linearRampToValueAtTime(0.42, time + 0.003);
    a.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
    body.connect(f); f.connect(a); a.connect(this.drumPanner);
    body.start(time, Math.random() * (PINK_NOISE_DURATION_S - 0.2));
    body.stop(time + 0.18);

    // Tiny low thump for body
    const thump = this.ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(220, time);
    thump.frequency.exponentialRampToValueAtTime(110, time + 0.06);
    const thumpAmp = this.ctx.createGain();
    thumpAmp.gain.setValueAtTime(0.22, time);
    thumpAmp.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
    thump.connect(thumpAmp); thumpAmp.connect(this.drumPanner);
    thump.start(time); thump.stop(time + 0.09);
  }

  /** Tribal: wood clave — narrow high bandpass, very short. */
  private snareTribal(time: number) {
    if (!this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 14;
    const a = this.ctx.createGain();
    a.gain.setValueAtTime(0, time);
    a.gain.linearRampToValueAtTime(0.55, time + 0.001);
    a.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    source.connect(f); f.connect(a); a.connect(this.drumPanner);
    source.start(time, Math.random() * (PINK_NOISE_DURATION_S - 0.1));
    source.stop(time + 0.06);
  }

  /** Electronic: hand-clap — short HP noise burst with bright tail. */
  private snareElectronic(time: number) {
    if (!this.noiseBuffer) return;
    // 3 quick noise micro-hits + tail (the "clap" feel)
    for (const offset of [0, 0.012, 0.022]) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1500;
      const a = this.ctx.createGain();
      const t = time + offset;
      a.gain.setValueAtTime(0, t);
      a.gain.linearRampToValueAtTime(0.38, t + 0.001);
      a.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      src.connect(f); f.connect(a); a.connect(this.drumPanner);
      src.start(t, Math.random() * (PINK_NOISE_DURATION_S - 0.1));
      src.stop(t + 0.04);
    }
    // Bright tail for sustain
    const tail = this.ctx.createBufferSource();
    tail.buffer = this.noiseBuffer;
    const tailFilter = this.ctx.createBiquadFilter();
    tailFilter.type = 'highpass';
    tailFilter.frequency.value = 2400;
    const tailAmp = this.ctx.createGain();
    tailAmp.gain.setValueAtTime(0, time + 0.022);
    tailAmp.gain.linearRampToValueAtTime(0.18, time + 0.025);
    tailAmp.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
    tail.connect(tailFilter); tailFilter.connect(tailAmp); tailAmp.connect(this.drumPanner);
    tail.start(time + 0.022, Math.random() * (PINK_NOISE_DURATION_S - 0.2));
    tail.stop(time + 0.18);
  }

  private hat(time: number, vol: number, kit: DrumKit) {
    if (!this.noiseBuffer) return;
    if (kit === 'electronic') return this.hatElectronic(time, vol);
    if (kit === 'tribal') return this.hatTribal(time, vol);
    this.hatLofi(time, vol);
  }

  /** Lo-fi: brushed warm — softer attack, slight body. */
  private hatLofi(time: number, vol: number) {
    if (!this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6500;
    f.Q.value = 0.6;
    const a = this.ctx.createGain();
    a.gain.setValueAtTime(0, time);
    a.gain.linearRampToValueAtTime(vol * 0.26, time + 0.003);
    a.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
    source.connect(f); f.connect(a); a.connect(this.drumPanner);
    source.start(time, Math.random() * (PINK_NOISE_DURATION_S - 0.2));
    source.stop(time + 0.11);
  }

  /** Tribal: shaker — mid bandpass, longer body. */
  private hatTribal(time: number, vol: number) {
    if (!this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3600;
    f.Q.value = 2.2;
    const a = this.ctx.createGain();
    a.gain.setValueAtTime(0, time);
    a.gain.linearRampToValueAtTime(vol * 0.34, time + 0.006);
    a.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    source.connect(f); f.connect(a); a.connect(this.drumPanner);
    source.start(time, Math.random() * (PINK_NOISE_DURATION_S - 0.3));
    source.stop(time + 0.2);
  }

  /** Electronic: closed hi-hat — tight, very bright, very short. */
  private hatElectronic(time: number, vol: number) {
    if (!this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 9000;
    f.Q.value = 1.1;
    const a = this.ctx.createGain();
    a.gain.setValueAtTime(0, time);
    a.gain.linearRampToValueAtTime(vol * 0.30, time + 0.0005);
    a.gain.exponentialRampToValueAtTime(0.0001, time + 0.028);
    source.connect(f); f.connect(a); a.connect(this.drumPanner);
    source.start(time, Math.random() * (PINK_NOISE_DURATION_S - 0.1));
    source.stop(time + 0.04);
  }

  // ===== Drift =====

  private scheduleNextDrift = () => {
    const ms = this.params.drift.intervalSec * 1000;
    this.driftTimer = window.setTimeout(this.driftTick, ms);
  };

  private driftTick = () => {
    if (!this._playing) { this.driftTimer = null; return; }
    if (this.params.drift.enabled) this.applyDriftEvent();
    this.scheduleNextDrift();
  };

  private applyDriftEvent() {
    const voices = (Object.keys(DRIFT_PARAMS) as VoiceId[]).filter((v) => !this.params.locks[v]);
    if (voices.length === 0) return;
    const voice = voices[Math.floor(Math.random() * voices.length)];
    const params = DRIFT_PARAMS[voice];
    const param = params[Math.floor(Math.random() * params.length)];
    const rangeKey = `${voice}.${param}`;
    const range = RANGES[rangeKey];
    if (!range) return;
    const cur = (this.params[voice] as unknown as Record<string, number>)[param];
    const span = (range.max - range.min) * 0.25;
    const target = clamp(cur + (Math.random() - 0.5) * 2 * span, range.min, range.max);
    this.startLerp(voice, param, target, 6000);
  }

  private startLerp(voice: VoiceId, param: string, to: number, durationMs: number) {
    const cur = (this.params[voice] as unknown as Record<string, number>)[param];
    this.lerps = this.lerps.filter((l) => !(l.voice === voice && l.param === param));
    this.lerps.push({ voice, param, from: cur, to, startMs: performance.now(), durationMs });
    if (this.lerpFrame === null) this.lerpFrame = requestAnimationFrame(this.tickLerps);
  }

  private lerpScalar(path: string, from: number, to: number, durationMs: number) {
    // Lerp for top-level numeric params like tempo. Reuses the lerp pipeline by
    // piggybacking on the 'voice' slot — we use a sentinel '_global'.
    this.lerps = this.lerps.filter((l) => !(l.voice === ('_global' as VoiceId) && l.param === path));
    this.lerps.push({ voice: '_global' as VoiceId, param: path, from, to, startMs: performance.now(), durationMs });
    if (this.lerpFrame === null) this.lerpFrame = requestAnimationFrame(this.tickLerps);
  }

  private tickLerps = (now: number) => {
    if (this.lerps.length === 0) {
      this.lerpFrame = null;
      return;
    }
    this.lerps = this.lerps.filter((l) => {
      const t = Math.min(1, (now - l.startMs) / l.durationMs);
      const v = l.from + (l.to - l.from) * easeInOut(t);
      if ((l.voice as string) === '_global') {
        // Top-level scalar like 'tempo'
        (this.params as unknown as Record<string, number>)[l.param] = v;
      } else {
        (this.params[l.voice] as unknown as Record<string, number>)[l.param] = v;
        this.applyPath(`${l.voice}.${l.param}`);
      }
      return t < 1;
    });
    this.lerpFrame = requestAnimationFrame(this.tickLerps);
  };

  // ===== Teardown =====

  private teardownVoices() {
    const stopMaybe = (n: AudioScheduledSourceNode | null) => {
      if (!n) return;
      try { n.stop(); } catch { /* already stopped */ }
      n.disconnect();
    };
    stopMaybe(this.leftOsc); this.leftOsc = null;
    stopMaybe(this.rightOsc); this.rightOsc = null;
    stopMaybe(this.noiseSource); this.noiseSource = null;
    stopMaybe(this.subOsc); this.subOsc = null;
    stopMaybe(this.subLfo); this.subLfo = null;
    this.subLfoGain?.disconnect(); this.subLfoGain = null;
    this.padOscs.forEach(stopMaybe);
    this.padOscs = [];
    if (this.lerpFrame !== null) cancelAnimationFrame(this.lerpFrame);
    this.lerpFrame = null;
    this.lerps = [];
  }

  // Voss-McCartney pink noise approximation, 2-channel decorrelated.
  private createPinkNoiseBuffer(): AudioBuffer {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * PINK_NOISE_DURATION_S);
    const buffer = this.ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
        data[i] = pink * 0.11;
      }
    }
    return buffer;
  }
}
