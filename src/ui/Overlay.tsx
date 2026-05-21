import { useState } from 'react';
import type { AudioControls } from '../audio/useAudioEngine';
import { SCENES } from '../audio/useAudioEngine';
import type { DrumKit, VoiceId } from '../audio/engine';
import { RANGES } from '../audio/engine';
import styles from './overlay.module.css';

type Props = { audio: AudioControls };

type VoiceDetail = { key: string; label: string; format?: (v: number) => string };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const panFmt = (v: number) =>
  Math.abs(v) < 0.02 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`;
const signed = (v: number) => `${v >= 0 ? '+' : ''}${v}`;

const VOICE_LIST: { id: VoiceId; name: string }[] = [
  { id: 'binaural', name: 'binaural' },
  { id: 'noise',    name: 'noise' },
  { id: 'pad',      name: 'pad' },
  { id: 'pluck',    name: 'pluck' },
  { id: 'bells',    name: 'bells' },
  { id: 'drums',    name: 'drums' },
  { id: 'subBass',  name: 'sub-bass' },
];

const VOICE_DETAILS: Record<VoiceId, VoiceDetail[]> = {
  binaural: [
    { key: 'beatFreq',    label: 'beat',   format: (v) => `${v.toFixed(1)} hz` },
    { key: 'carrierFreq', label: 'tone',   format: (v) => `${Math.round(v)} hz` },
  ],
  noise: [
    { key: 'pan',    label: 'pan',    format: panFmt },
    { key: 'cutoff', label: 'bright', format: (v) => `${Math.round(v)} hz` },
  ],
  pad: [
    { key: 'pan',        label: 'pan',    format: panFmt },
    { key: 'root',       label: 'pitch',  format: signed },
    { key: 'brightness', label: 'bright', format: pct },
  ],
  bells: [
    { key: 'pan',    label: 'pan',    format: panFmt },
    { key: 'rate',   label: 'rate',   format: pct },
    { key: 'octave', label: 'octave', format: signed },
  ],
  drums: [
    { key: 'kit',   label: 'kit' }, // cycler
    { key: 'pan',   label: 'pan',   format: panFmt },
    { key: 'swing', label: 'swing', format: pct },
  ],
  pluck: [
    { key: 'pan',    label: 'pan',    format: panFmt },
    { key: 'rate',   label: 'rate',   format: pct },
    { key: 'decay',  label: 'decay',  format: (v) => `${v.toFixed(2)}s` },
    { key: 'octave', label: 'octave', format: signed },
  ],
  subBass: [
    { key: 'freq',     label: 'freq',  format: (v) => `${v.toFixed(1)} hz` },
    { key: 'modDepth', label: 'sway',  format: pct },
  ],
};

const KITS: DrumKit[] = ['lofi', 'tribal', 'electronic'];

export function Overlay({ audio }: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [expanded, setExpanded] = useState<VoiceId | null>(null);
  const [scenesOpen, setScenesOpen] = useState(false);
  const [presetName, setPresetName] = useState('');

  const currentScene = SCENES.find((s) => s.id === audio.sceneId) ?? SCENES[0];

  const handleSave = () => {
    const name = presetName.trim();
    if (!name) return;
    audio.savePreset(name);
    setPresetName('');
  };

  return (
    <div className={styles.root}>
      <div className={styles.brand}>
        <div className={styles.wordmark}>stille</div>
        <div className={styles.brandDef}>
          <div className={styles.defPhonetic}>/ˈstɪlːə/ · Norwegian for stillness</div>
          <div className={styles.defTagline}>soundscapes for focus, relax, sleep</div>
        </div>
      </div>

      <div className={styles.scenePicker}>
        <button
          className={styles.sceneCurrent}
          onClick={() => setScenesOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={scenesOpen}
        >
          {currentScene.name}
        </button>
        {scenesOpen && (
          <ul className={styles.sceneList} onMouseLeave={() => setScenesOpen(false)}>
            {SCENES.map((s) => (
              <li key={s.id}>
                <button
                  className={`${styles.sceneOption} ${s.id === audio.sceneId ? styles.sceneOptionActive : ''}`}
                  onClick={() => { audio.setScene(s.id); setScenesOpen(false); }}
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.playWrap}>
        <button
          className={styles.play}
          onClick={audio.toggle}
          aria-label={audio.playing ? 'Pause' : 'Play'}
        >
          {audio.playing ? <PauseGlyph /> : <PlayGlyph />}
        </button>
        <button
          className={styles.shuffle}
          onClick={audio.randomizeAll}
          aria-label="Shuffle"
          title="Shuffle"
        >
          <ShuffleGlyph />
        </button>
      </div>

      <div className={styles.panelHandle} onMouseEnter={() => setPanelOpen(true)} aria-hidden />
      <div
        className={`${styles.panel} ${panelOpen ? styles.open : ''}`}
        onMouseLeave={() => setPanelOpen(false)}
      >
        <div className={styles.panelTitle}>compose</div>

        {/* Globals */}
        <div className={styles.globals}>
          <div className={styles.globalRow}>
            <span className={styles.globalLabel}>tempo</span>
            <input
              className={styles.slider}
              type="range"
              min={RANGES.tempo.min}
              max={RANGES.tempo.max}
              step={RANGES.tempo.step}
              value={audio.params.tempo}
              onChange={(e) => audio.setParam('tempo', Number(e.target.value))}
            />
            <span className={styles.globalValue}>{audio.params.tempo} bpm</span>
          </div>
          <div className={styles.globalRow}>
            <button
              className={`${styles.driftBtn} ${audio.params.drift.enabled ? styles.driftOn : ''}`}
              onClick={() => audio.setParam('drift.enabled', !audio.params.drift.enabled)}
            >
              drift
            </button>
            <input
              className={styles.slider}
              type="range"
              min={RANGES['drift.intervalSec'].min}
              max={RANGES['drift.intervalSec'].max}
              step={RANGES['drift.intervalSec'].step}
              value={audio.params.drift.intervalSec}
              onChange={(e) => audio.setParam('drift.intervalSec', Number(e.target.value))}
              disabled={!audio.params.drift.enabled}
            />
            <span className={styles.globalValue}>{audio.params.drift.intervalSec}s</span>
          </div>
          <button className={styles.randomizeBtn} onClick={audio.randomizeAll}>
            randomize unlocked
          </button>
        </div>

        <div className={styles.divider} />

        {/* Voice cards */}
        <div className={styles.voices}>
          {VOICE_LIST.map(({ id, name }) => (
            <VoiceCard
              key={id}
              id={id}
              name={name}
              audio={audio}
              expanded={expanded === id}
              onToggle={() => setExpanded(expanded === id ? null : id)}
            />
          ))}
        </div>

        <div className={styles.divider} />

        {/* Saved presets */}
        <div className={styles.panelTitle}>saved</div>
        <div className={styles.saveRow}>
          <input
            className={styles.saveInput}
            placeholder="name this mix"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            maxLength={40}
          />
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!presetName.trim()}
            aria-label="Save current as preset"
          >save</button>
        </div>
        {audio.presets.length > 0 && (
          <ul className={styles.presetList}>
            {audio.presets.map((p) => {
              const scene = SCENES.find((s) => s.id === p.sceneId);
              return (
                <li key={p.id} className={styles.presetItem}>
                  <button
                    className={styles.presetName}
                    onClick={() => audio.loadPreset(p.id)}
                    title="Load preset"
                  >
                    {p.name}
                  </button>
                  <span className={styles.presetScene}>{scene?.name ?? p.sceneId}</span>
                  <button
                    className={styles.presetDelete}
                    onClick={() => audio.deletePreset(p.id)}
                    aria-label={`Delete ${p.name}`}
                    title="Delete"
                  >×</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={styles.footer}>v0 · headphones recommended</div>
    </div>
  );
}

function VoiceCard({
  id, name, audio, expanded, onToggle,
}: { id: VoiceId; name: string; audio: AudioControls; expanded: boolean; onToggle: () => void }) {
  const params = audio.params[id] as unknown as Record<string, number | string>;
  const locked = audio.params.locks[id];
  const vol = params.volume as number;

  return (
    <div className={`${styles.voice} ${expanded ? styles.voiceOpen : ''}`}>
      <div className={styles.voiceHeader}>
        <span className={styles.voiceIcon} aria-hidden>
          <VoiceIcon id={id} />
        </span>
        <button className={styles.voiceName} onClick={onToggle}>{name}</button>
        <input
          className={styles.voiceVol}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={vol}
          onChange={(e) => audio.setParam(`${id}.volume`, Number(e.target.value))}
          onClick={(e) => e.stopPropagation()}
        />
        <button
          className={`${styles.lock} ${locked ? styles.locked : ''}`}
          onClick={(e) => { e.stopPropagation(); audio.setLock(id, !locked); }}
          aria-label={locked ? 'Unlock' : 'Lock'}
        />
        <button className={styles.chevron} onClick={onToggle} aria-label={expanded ? 'Collapse' : 'Expand'}>
          <ChevronGlyph open={expanded} />
        </button>
      </div>
      {expanded && (
        <div className={styles.detail}>
          {VOICE_DETAILS[id].map((d) => (
            <DetailField key={d.key} voice={id} detail={d} audio={audio} />
          ))}
        </div>
      )}
    </div>
  );
}

function DetailField({ voice, detail, audio }: { voice: VoiceId; detail: VoiceDetail; audio: AudioControls }) {
  const params = audio.params[voice] as unknown as Record<string, number | string>;
  const path = `${voice}.${detail.key}`;

  // Special-case the drum kit cycler (string param)
  if (voice === 'drums' && detail.key === 'kit') {
    const current = params.kit as DrumKit;
    const idx = KITS.indexOf(current);
    return (
      <div className={styles.field}>
        <div className={styles.fieldLabel}>
          <span>{detail.label}</span>
          <span className={styles.fieldValue}>{current}</span>
        </div>
        <button
          className={styles.kitCycle}
          onClick={() => audio.setParam('drums.kit', KITS[(idx + 1) % KITS.length])}
        >
          {KITS.map((k, i) => (
            <span key={k} className={`${styles.kitDot} ${i === idx ? styles.kitDotOn : ''}`} aria-hidden />
          ))}
          <span className={styles.kitNext}>next</span>
        </button>
      </div>
    );
  }

  const range = RANGES[path];
  if (!range) return null;
  const value = params[detail.key] as number;

  return (
    <div className={styles.field}>
      <div className={styles.fieldLabel}>
        <span>{detail.label}</span>
        <span className={styles.fieldValue}>{detail.format ? detail.format(value) : value}</span>
      </div>
      <input
        className={styles.slider}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => audio.setParam(path, Number(e.target.value))}
      />
    </div>
  );
}

function PlayGlyph() {
  return (
    <svg className={styles.playGlyph} viewBox="0 0 14 14" aria-hidden>
      <path d="M3 1.5 L12 7 L3 12.5 Z" fill="currentColor" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg className={styles.playGlyph} viewBox="0 0 14 14" aria-hidden>
      <rect x="3" y="2" width="2.5" height="10" fill="currentColor" />
      <rect x="8.5" y="2" width="2.5" height="10" fill="currentColor" />
    </svg>
  );
}

function ChevronGlyph({ open }: { open: boolean }) {
  return (
    <svg className={`${styles.chevronGlyph} ${open ? styles.chevronOpen : ''}`} viewBox="0 0 10 10" aria-hidden>
      <path d="M2 4 L5 7 L8 4" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShuffleGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path d="M2 4h2.5l3.2 3.5M2 12h2.5l3.2-3.5M9 12h3v-2l2 3-2 3v-2H9M9 4h3V2l2 3-2 3V6H9"
            fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Lucide-style icons (inlined, stroke-width 1.5 for a lighter feel).
function VoiceIcon({ id }: { id: VoiceId }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (id) {
    case 'binaural':
      return (
        <svg {...common}>
          <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1v-6Z" />
          <path d="M21 14h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2a1 1 0 0 0 1-1v-6Z" />
          <path d="M3 14a9 9 0 1 1 18 0" />
        </svg>
      );
    case 'noise':
      return (
        <svg {...common}>
          <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
          <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
          <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
        </svg>
      );
    case 'pad':
      return (
        <svg {...common}>
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
        </svg>
      );
    case 'bells':
      return (
        <svg {...common}>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      );
    case 'pluck':
      return (
        <svg {...common}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    case 'drums':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" />
        </svg>
      );
    case 'subBass':
      return (
        <svg {...common}>
          <path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2" />
        </svg>
      );
    default:
      return null;
  }
}
