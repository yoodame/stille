import type { Params } from './engine';
import type { SceneId } from './scenes';

const STORAGE_KEY = 'stille.presets.v1';

export type Preset = {
  id: string;
  name: string;
  sceneId: SceneId;
  params: Params;
  createdAt: number;
};

function read(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list: Preset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore quota / privacy errors
  }
}

export function listPresets(): Preset[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function savePreset(name: string, sceneId: SceneId, params: Params): Preset {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const preset: Preset = {
    id,
    name: name.trim() || 'untitled',
    sceneId,
    // Structured clone via JSON to avoid keeping live refs
    params: JSON.parse(JSON.stringify(params)) as Params,
    createdAt: Date.now(),
  };
  const list = read();
  list.push(preset);
  write(list);
  return preset;
}

export function deletePreset(id: string) {
  write(read().filter((p) => p.id !== id));
}

export function renamePreset(id: string, name: string) {
  const list = read();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], name: name.trim() || list[idx].name };
  write(list);
}
