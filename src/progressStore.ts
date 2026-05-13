const STORAGE_KEY = "meflix_watch_progress";

export interface WatchRecord {
  progress: number;   // currentTime in seconds
  duration: number;   // total duration in seconds
  updatedAt: number;  // Date.now() timestamp
}

export type ProgressStore = Record<string, WatchRecord>;

export function loadAllProgress(): ProgressStore {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveWatchRecord(path: string, record: WatchRecord): void {
  try {
    const store = loadAllProgress();
    store[path] = record;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { /* ignore quota errors */ }
}

export function getProgressRatio(store: ProgressStore, path: string): number {
  const rec = store[path];
  if (!rec || rec.duration <= 0) return 0;
  return Math.min(1, rec.progress / rec.duration);
}

export interface ContinueEntry {
  item: import("./types").MediaItem;
  startPath: string;
  resumeAt: number;
  ratio: number;
  updatedAt: number;
  duration: number;
  epLabel?: string;
}

export function buildContinueWatching(
  library: import("./types").MediaItem[],
  store: ProgressStore,
): ContinueEntry[] {
  const results: ContinueEntry[] = [];

  for (const item of library) {
    let best: ContinueEntry | null = null;

    if (item.media_type === "movie") {
      const path = item.video_files[0];
      if (!path) continue;
      const rec = store[path];
      if (!rec || rec.duration <= 0) continue;
      const ratio = rec.progress / rec.duration;
      if (ratio < 0.03 || ratio > 0.95) continue;
      best = { item, startPath: path, resumeAt: rec.progress, ratio, updatedAt: rec.updatedAt, duration: rec.duration };
    } else {
      for (const season of item.seasons) {
        for (const ep of season.episodes) {
          const rec = store[ep.path];
          if (!rec || rec.duration <= 0) continue;
          const ratio = rec.progress / rec.duration;
          if (ratio < 0.03 || ratio > 0.95) continue;
          if (!best || rec.updatedAt > best.updatedAt) {
            best = {
              item, startPath: ep.path, resumeAt: rec.progress, ratio,
              updatedAt: rec.updatedAt, duration: rec.duration,
              epLabel: `S${season.number}:E${ep.number}`,
            };
          }
        }
      }
    }

    if (best) results.push(best);
  }

  return results.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20);
}

export function getItemProgressRatio(
  item: import("./types").MediaItem,
  store: ProgressStore,
): number {
  if (item.media_type === "movie") {
    return getProgressRatio(store, item.video_files[0] || "");
  }
  let best = 0;
  let bestAt = 0;
  for (const season of item.seasons) {
    for (const ep of season.episodes) {
      const rec = store[ep.path];
      if (rec && rec.updatedAt > bestAt) {
        bestAt = rec.updatedAt;
        best = rec.duration > 0 ? rec.progress / rec.duration : 0;
      }
    }
  }
  return Math.min(1, best);
}

export function getTop10(
  library: import("./types").MediaItem[],
  store: ProgressStore,
): import("./types").MediaItem[] {
  const scores: Array<{ item: import("./types").MediaItem; score: number }> = [];
  for (const item of library) {
    let total = 0;
    if (item.media_type === "movie") {
      total = store[item.video_files[0] || ""]?.progress ?? 0;
    } else {
      for (const season of item.seasons)
        for (const ep of season.episodes)
          total += store[ep.path]?.progress ?? 0;
    }
    if (total > 60) scores.push({ item, score: total });
  }
  return scores.sort((a, b) => b.score - a.score).slice(0, 10).map(s => s.item);
}

export function getLastWatchedItem(
  library: import("./types").MediaItem[],
  store: ProgressStore,
): import("./types").MediaItem | null {
  let best: import("./types").MediaItem | null = null;
  let bestAt = 0;
  for (const item of library) {
    const paths = item.media_type === "movie"
      ? item.video_files
      : item.seasons.flatMap(s => s.episodes.map(e => e.path));
    for (const p of paths) {
      const rec = store[p];
      if (rec && rec.updatedAt > bestAt) { bestAt = rec.updatedAt; best = item; }
    }
  }
  return best;
}

export function buildBecauseYouWatched(
  library: import("./types").MediaItem[],
  store: ProgressStore,
): { items: import("./types").MediaItem[]; basedOnName: string } | null {
  const last = getLastWatchedItem(library, store);
  if (!last || !last.genres?.length) return null;
  const items = library
    .filter(i => i.path !== last.path && i.genres?.some(g => last.genres!.includes(g)))
    .slice(0, 20);
  if (items.length < 3) return null;
  return { items, basedOnName: last.name };
}
