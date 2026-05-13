import type { MediaItem } from "./types";

const FIRST_SEEN_KEY = "meflix_first_seen";

export type FirstSeenStore = Record<string, number>;

export function loadFirstSeen(): FirstSeenStore {
  try {
    return JSON.parse(localStorage.getItem(FIRST_SEEN_KEY) || "{}");
  } catch { return {}; }
}

export function trackNewItems(library: MediaItem[], current: FirstSeenStore): FirstSeenStore {
  const store = { ...current };
  let changed = false;
  for (const item of library) {
    if (!(item.path in store)) {
      store[item.path] = Date.now();
      changed = true;
    }
  }
  if (changed) {
    try { localStorage.setItem(FIRST_SEEN_KEY, JSON.stringify(store)); } catch {}
  }
  return store;
}

export function getRecentlyAdded(library: MediaItem[], store: FirstSeenStore, limit = 20): MediaItem[] {
  return [...library]
    .filter(i => i.path in store)
    .sort((a, b) => (store[b.path] ?? 0) - (store[a.path] ?? 0))
    .slice(0, limit);
}
