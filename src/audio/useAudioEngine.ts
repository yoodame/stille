import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine, type Bands, type Params, type VoiceId } from './engine';
import { SCENE_BY_ID, SCENES, type SceneId } from './scenes';
import {
  deletePreset as storageDelete,
  listPresets,
  renamePreset as storageRename,
  savePreset as storageSave,
  type Preset,
} from './presets';

export type SceneState = {
  playing: boolean;
  params: Params;
  sceneId: SceneId;
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

  stateRef: React.RefObject<SceneState>;
  getBands: () => Bands;
};

const ZERO_BANDS: Bands = { bass: 0, mid: 0, treble: 0 };

const VOICE_IDS: VoiceId[] = ['binaural', 'noise', 'pad', 'bells', 'drums', 'pluck', 'subBass'];

export function useAudioEngine(): AudioControls {
  const engineRef = useRef<AudioEngine | null>(null);
  if (engineRef.current === null) engineRef.current = new AudioEngine();
  const engine = engineRef.current;

  const stateRef = useRef<SceneState>({ playing: false, params: engine.params, sceneId: 'drift' });

  const [presets, setPresets] = useState<Preset[]>(() => listPresets());
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

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
    rerender();
  }, [engine, rerender]);

  const setLock = useCallback((voice: VoiceId, locked: boolean) => {
    engine.setLock(voice, locked);
    rerender();
  }, [engine, rerender]);

  const randomizeAll = useCallback(() => {
    engine.randomizeAll();
    const tick = window.setInterval(rerender, 60);
    window.setTimeout(() => clearInterval(tick), 4500);
  }, [engine, rerender]);

  const setScene = useCallback((id: SceneId) => {
    const scene = SCENE_BY_ID[id];
    if (!scene) return;
    engine.applyScene(scene.preset);
    stateRef.current.sceneId = id;
    const tick = window.setInterval(rerender, 60);
    window.setTimeout(() => clearInterval(tick), 2700);
    rerender();
  }, [engine, rerender]);

  const savePreset = useCallback((name: string) => {
    storageSave(name, stateRef.current.sceneId, engine.params);
    setPresets(listPresets());
  }, [engine]);

  const loadPreset = useCallback((id: string) => {
    const list = listPresets();
    const preset = list.find((p) => p.id === id);
    if (!preset) return;
    // Lerp voice params via applyScene's preset shape.
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
    // Snap locks and drift (these are meta state, not lerped).
    for (const v of VOICE_IDS) engine.setLock(v, preset.params.locks[v] ?? false);
    engine.setParam('drift.enabled', preset.params.drift.enabled);
    engine.setParam('drift.intervalSec', preset.params.drift.intervalSec);
    stateRef.current.sceneId = preset.sceneId;
    const tick = window.setInterval(rerender, 60);
    window.setTimeout(() => clearInterval(tick), 2700);
    rerender();
  }, [engine, rerender]);

  const deletePreset = useCallback((id: string) => {
    storageDelete(id);
    setPresets(listPresets());
  }, []);

  const renamePreset = useCallback((id: string, name: string) => {
    storageRename(id, name);
    setPresets(listPresets());
  }, []);

  const getBands = useCallback((): Bands => engine.getBands() ?? ZERO_BANDS, [engine]);

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
    stateRef,
    getBands,
  };
}

export { SCENES };
export type { Preset };
