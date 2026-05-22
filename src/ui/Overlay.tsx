import { useEffect, useState } from 'react';
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

const ONBOARD_KEY = 'stille.seen.v1';

export function Overlay({ audio }: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [expanded, setExpanded] = useState<VoiceId | null>(null);
  const [scenesOpen, setScenesOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARD_KEY)) setShowHint(true);
    } catch { /* private mode etc */ }
  }, []);

  const dismissHint = () => {
    if (!showHint) return;
    setShowHint(false);
    try { localStorage.setItem(ONBOARD_KEY, '1'); } catch { /* ignore */ }
  };

  const handleToggle = () => {
    dismissHint();
    audio.toggle();
  };

  const currentScene = SCENES.find((s) => s.id === audio.sceneId) ?? SCENES[0];

  const handleSave = () => {
    const name = presetName.trim();
    if (!name) return;
    audio.savePreset(name);
    setPresetName('');
  };

  const handleShuffleScene = () => {
    const others = SCENES.filter((s) => s.id !== audio.sceneId);
    if (others.length === 0) return;
    const pick = others[Math.floor(Math.random() * others.length)];
    audio.setScene(pick.id);
  };

  // Keyboard shortcuts. Space = play/pause, S = shuffle, R = reroll, 1-6 = scene.
  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    };
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      // Number keys 1-6: jump to scene
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < SCENES.length) {
          audio.setScene(SCENES[idx].id);
          e.preventDefault();
        }
        return;
      }
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'spacebar': // older browsers
          audio.toggle();
          e.preventDefault();
          break;
        case 's':
          handleShuffleScene();
          e.preventDefault();
          break;
        case 'r':
          audio.randomizeAll();
          e.preventDefault();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio.sceneId]);

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
        <ul className={`${styles.sceneList} ${scenesOpen ? styles.sceneListOpen : ''}`}>
          {SCENES.map((s) => (
            <li key={s.id}>
              <button
                className={`${styles.sceneOption} ${s.id === audio.sceneId ? styles.sceneOptionActive : ''}`}
                onClick={() => { audio.setScene(s.id); setScenesOpen(false); }}
              >
                <SceneIcon id={s.id} />
                <span>{s.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.playWrap}>
        {showHint && !audio.playing && (
          <div className={styles.hint} aria-hidden>tap to begin</div>
        )}
        <button
          className={styles.shuffle}
          onClick={handleShuffleScene}
          aria-label="Shuffle scene"
          title="Shuffle scene"
        >
          <ShuffleGlyph />
        </button>
        <button
          className={styles.play}
          onClick={handleToggle}
          aria-label={audio.playing ? 'Pause' : 'Play'}
        >
          {audio.playing ? <PauseGlyph /> : <PlayGlyph />}
        </button>
      </div>

      <button
        type="button"
        className={styles.panelHandle}
        onMouseEnter={() => setPanelOpen(true)}
        onClick={() => setPanelOpen((v) => !v)}
        aria-label={panelOpen ? 'Close mixer' : 'Open mixer'}
        aria-expanded={panelOpen}
      >
        <span className={styles.panelHandleLabel}>mixer</span>
        <SlidersGlyph />
      </button>
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
            <span className={styles.globalLabel}>reverb</span>
            <input
              className={styles.slider}
              type="range"
              min={RANGES['reverb.wet'].min}
              max={RANGES['reverb.wet'].max}
              step={RANGES['reverb.wet'].step}
              value={audio.params.reverb.wet}
              onChange={(e) => audio.setParam('reverb.wet', Number(e.target.value))}
            />
            <span className={styles.globalValue}>{Math.round(audio.params.reverb.wet * 100)}%</span>
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
          <button
            className={styles.randomizeBtn}
            onClick={audio.randomizeAll}
            title="Re-roll unlocked voices within the current scene"
          >
            reroll mix
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

function SlidersGlyph() {
  // lucide: sliders-vertical
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden
    >
      <line x1="4" x2="4" y1="21" y2="14" />
      <line x1="4" x2="4" y1="10" y2="3" />
      <line x1="12" x2="12" y1="21" y2="12" />
      <line x1="12" x2="12" y1="8" y2="3" />
      <line x1="20" x2="20" y1="21" y2="16" />
      <line x1="20" x2="20" y1="12" y2="3" />
      <line x1="2" x2="6" y1="14" y2="14" />
      <line x1="10" x2="14" y1="8" y2="8" />
      <line x1="18" x2="22" y1="16" y2="16" />
    </svg>
  );
}

function ShuffleGlyph() {
  // lucide: shuffle
  return (
    <svg
      width="15" height="15" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden
    >
      <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" />
      <path d="m18 2 4 4-4 4" />
      <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" />
      <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" />
      <path d="m18 14 4 4-4 4" />
    </svg>
  );
}

function SceneIcon({ id }: { id: string }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (id) {
    case 'drift':
      return (
        <svg {...common}>
          <path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z" />
          <path d="M16 8 2 22" />
          <path d="M17.5 15H9" />
        </svg>
      );
    case 'forest':
      return (
        <svg {...common}>
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96a1 1 0 0 1 1.8.66c0 6.49-3.16 9.92-7.42 11.16l-2.34.93" />
          <path d="M2 21c0-3 1.85-5.36 5.08-6" />
        </svg>
      );
    case 'aurora':
      return (
        <svg {...common}>
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
          <path d="M20 3v4" />
          <path d="M22 5h-4" />
          <path d="M4 17v2" />
          <path d="M5 18H3" />
        </svg>
      );
    case 'heartwood':
      return (
        <svg {...common}>
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      );
    case 'coastal':
      return (
        <svg {...common}>
          <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
          <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
          <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
        </svg>
      );
    case 'tribal':
      return (
        <svg {...common}>
          <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
        </svg>
      );
    default:
      return null;
  }
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
