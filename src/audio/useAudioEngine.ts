import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine, type Bands, type Hits, type Params, type VoiceId } from './engine';
import { SCENE_BY_ID, SCENES, type SceneId } from './scenes';
import {
  deletePreset as storageDelete,
  listPresets,
  renamePreset as storageRename,
  savePreset as storageSave,
  type Preset,
} from './presets';
import {
  loadSession,
  saveSession,
  snapshotFromHash,
  snapshotToShareURL,
  writeSnapshotToHash,
  type Snapshot,
} from './persistence';

export type SceneState = {
  playing: boolean;
  params: Params;
  sceneId: SceneId;
  /** Live event envelopes — set to 1.0 on trigger by the engine, decayed by the visual layer. */
  hits: Hits;
};

export type AudioControls = {
  playing: boolean;
  params: Params;
  sceneId: SceneId;
  setScene: (id: SceneId) => void;
  toggle: () => void;
  setParam: (path: string, value: number | string | boolean) => void;
  setLock: (voice: VoiceId, locked: boolean) => void;
  randomizeAll: () => void;

  presets: Preset[];
  savePreset: (name: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  renamePreset: (id: string, name: string) => void;

  /** Get a shareable URL encoding the current state. */
  getShareURL: () => string;

  stateRef: React.RefObject<SceneState>;
  getBands: () => Bands;
};

const ZERO_BANDS: Bands = { bass: 0, mid: 0, treble: 0 };

const VOICE_IDS: VoiceId[] = ['binaural', 'noise', 'pad', 'bells', 'drums', 'pluck', 'subBass'];

/** Apply a saved snapshot to the engine. Used both for hash-restore and localStorage restore. */
function applySnapshot(engine: AudioEngine, snap: Snapshot) {
  // Use applyScene with the snapshot's voice params (no lerp duration since we want immediate).
  // applyScene already lerps in 2.5s; for an initial load we want instant. Just write params directly.
  Object.assign(engine.params, snap.params);
  for (const v of VOICE_IDS) engine.setLock(v, snap.params.locks?.[v] ?? false);
  // Trigger applyPath on each voice so the audio nodes pick up the new values.
  for (const v of VOICE_IDS) engine.setParam(`${v}.volume`, snap.params[v].volume);
}

export function useAudioEngine(): AudioControls {
  const engineRef = useRef<AudioEngine | null>(null);
  if (engineRef.current === null) {
    const engine = new AudioEngine();
    // Restore from URL hash (priority — for shared links) or localStorage (returning user).
    const restored = snapshotFromHash() ?? loadSession();
    if (restored) applySnapshot(engine, restored);
    engineRef.current = engine;
  }
  const engine = engineRef.current;

  const initialSceneId =
    snapshotFromHash()?.sceneId ?? loadSession()?.sceneId ?? 'drift';

  const stateRef = useRef<SceneState>({
    playing: false,
    params: engine.params,
    sceneId: initialSceneId,
    hits: engine.hits,
  });

  const [presets, setPresets] = useState<Preset[]>(() => listPresets());
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  // Debounced persistence — every state change writes to localStorage + URL hash.
  const persistTimer = useRef<number | null>(null);
  const schedulePersist = useCallback(() => {
    if (persistTimer.current !== null) clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      const snap: Snapshot = { sceneId: stateRef.current.sceneId, params: engine.params };
      saveSession(snap);
      writeSnapshotToHash(snap);
      persistTimer.current = null;
    }, 350);
  }, [engine]);

  const toggle = useCallback(() => {
    if (engine.playing) {
      engine.stop();
      stateRef.current.playing = false;
    } else {
      void engine.start();
      stateRef.current.playing = true;
    }
    rerender();
  }, [engine, rerender]);

  const setParam = useCallback((path: string, value: number | string | boolean) => {
    engine.setParam(path, value);
    schedulePersist();
    rerender();
  }, [engine, rerender, schedulePersist]);

  const setLock = useCallback((voice: VoiceId, locked: boolean) => {
    engine.setLock(voice, locked);
    schedulePersist();
    rerender();
  }, [engine, rerender, schedulePersist]);

  const randomizeAll = useCallback(() => {
    engine.randomizeAll();
    const tick = window.setInterval(rerender, 60);
    window.setTimeout(() => {
      clearInterval(tick);
      schedulePersist();
    }, 4500);
  }, [engine, rerender, schedulePersist]);

  const setScene = useCallback((id: SceneId) => {
    const scene = SCENE_BY_ID[id];
    if (!scene) return;
    engine.applyScene(scene.preset);
    stateRef.current.sceneId = id;
    const tick = window.setInterval(rerender, 60);
    window.setTimeout(() => {
      clearInterval(tick);
      schedulePersist();
    }, 2700);
    rerender();
  }, [engine, rerender, schedulePersist]);

  const savePreset = useCallback((name: string) => {
    storageSave(name, stateRef.current.sceneId, engine.params);
    setPresets(listPresets());
  }, [engine]);

  const loadPreset = useCallback((id: string) => {
    const list = listPresets();
    const preset = list.find((p) => p.id === id);
    if (!preset) return;
    engine.applyScene({
      tempo: preset.params.tempo,
      binaural: preset.params.binaural,
      noise: preset.params.noise,
      pad: preset.params.pad,
      bells: preset.params.bells,
      drums: preset.params.drums,
      pluck: preset.params.pluck,
      subBass: preset.params.subBass,
    });
    for (const v of VOICE_IDS) engine.setLock(v, preset.params.locks[v] ?? false);
    engine.setParam('drift.enabled', preset.params.drift.enabled);
    engine.setParam('drift.intervalSec', preset.params.drift.intervalSec);
    stateRef.current.sceneId = preset.sceneId;
    const tick = window.setInterval(rerender, 60);
    window.setTimeout(() => {
      clearInterval(tick);
      schedulePersist();
    }, 2700);
    rerender();
  }, [engine, rerender, schedulePersist]);

  const deletePreset = useCallback((id: string) => {
    storageDelete(id);
    setPresets(listPresets());
  }, []);

  const renamePreset = useCallback((id: string, name: string) => {
    storageRename(id, name);
    setPresets(listPresets());
  }, []);

  const getBands = useCallback((): Bands => engine.getBands() ?? ZERO_BANDS, [engine]);

  const getShareURL = useCallback((): string => {
    return snapshotToShareURL({ sceneId: stateRef.current.sceneId, params: engine.params });
  }, [engine]);

  useEffect(() => {
    return () => { engine.stop(); };
  }, [engine]);

  return {
    playing: engine.playing,
    params: engine.params,
    sceneId: stateRef.current.sceneId,
    setScene,
    toggle,
    setParam,
    setLock,
    randomizeAll,
    presets,
    savePreset,
    loadPreset,
    deletePreset,
    renamePreset,
    getShareURL,
    stateRef,
    getBands,
  };
}

export { SCENES };
export type { Preset };
