import type { Params } from './engine';
import type { SceneId } from './scenes';

const SESSION_KEY = 'stille.session.v1';
const HASH_KEY = 'm';

export type Snapshot = {
  sceneId: SceneId;
  params: Params;
};

// ===== localStorage (auto-restore on next visit) =====

export function loadSession(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed.sceneId || !parsed.params) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(snapshot: Snapshot): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    // quota / privacy — silently ignore
  }
}

// ===== URL hash (#m=base64) for sharing =====

function toBase64(s: string): string {
  // Make standard btoa URL-safe (replace + and /, drop padding)
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

export function snapshotFromHash(): Snapshot | null {
  try {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash.slice(1); // drop "#"
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const encoded = params.get(HASH_KEY);
    if (!encoded) return null;
    const json = fromBase64(encoded);
    const parsed = JSON.parse(json) as Snapshot;
    if (!parsed.sceneId || !parsed.params) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function snapshotToShareURL(snapshot: Snapshot): string {
  const json = JSON.stringify(snapshot);
  const encoded = toBase64(json);
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#${HASH_KEY}=${encoded}`;
}

export function writeSnapshotToHash(snapshot: Snapshot): void {
  const json = JSON.stringify(snapshot);
  const encoded = toBase64(json);
  // Use replaceState so we don't pollute history
  const newHash = `#${HASH_KEY}=${encoded}`;
  if (window.location.hash !== newHash) {
    history.replaceState(null, '', `${window.location.pathname}${newHash}`);
  }
}

export function clearHash(): void {
  history.replaceState(null, '', window.location.pathname);
}
