# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (starts both Vite dev server and Rust backend)
npm run tauri dev

# Production build
npm run tauri build

# Frontend-only (no Tauri shell — limited functionality)
npm run dev

# Type-check the frontend
npx tsc --noEmit

# Rebuild Rust only (inside src-tauri/)
cargo build
```

There are no tests in this project.

## Architecture

Meflix is a **Tauri v2** desktop app: a React 19 / TypeScript frontend served by Vite, backed by a Rust process (`src-tauri/src/main.rs`).

### Two servers, always running

| Server | Address | Purpose |
|--------|---------|---------|
| Vite dev server | `http://localhost:1420` | Frontend (dev only; port is strict — fails if taken) |
| FFmpeg streaming server | `http://127.0.0.1:1421` | Transcodes MKV/AVI/FLV → fragmented MP4 via pipe; started unconditionally at app launch in `start_streaming_server()` |

The streaming server port (1421) doubles as the Vite HMR port in remote dev scenarios — take care if changing it.

### File layout

```
src/App.tsx        — entire frontend: all components, state, logic
src/App.css        — all styles (Netflix-style design system)
src-tauri/src/main.rs  — ALL Rust logic: scanner, TMDB fetch, settings, streaming server
src-tauri/src/lib.rs   — empty mobile stub; do not add logic here
src-tauri/tauri.conf.json  — security config (CSP, asset protocol scope)
src-tauri/capabilities/default.json  — Tauri permission grants
```

### Frontend component tree (all in `App.tsx`)

```
App
├── BillboardImage        — backdrop/poster as CSS background-image (Image() preload for error detection)
├── ModalBackdrop         — <img> with onError fallback
├── EpisodeThumbnail      — <img> with onError fallback
├── VideoPlayer           — full-screen player overlay
└── MediaCard             — card in content rows
```

All components use gradient fallbacks (`gradient-1` … `gradient-5`) when images are missing.

### Media playback routing (`toPlaySrc()`)

```
.mkv / .avi / .flv  →  http://127.0.0.1:1421/stream?path=<encoded>   (FFmpeg transcode)
everything else     →  convertFileSrc(path)  →  https://asset.localhost/...  (Tauri asset protocol)
```

`convertFileSrc` requires `assetProtocol.enable: true` and the path in scope (`$HOME/.meflix/**`) in `tauri.conf.json`. The CSP must include both `asset: https://asset.localhost` and `http://127.0.0.1:1421` in `media-src`.

### Episode autoplay / queue

`buildSeriesQueue(series)` flattens all seasons (sorted) into `{path, title}[]`. `handlePlayItem(item, startPath?)` builds this queue and sets `playingQueue` + `playingQueueIdx`. `handleNext` advances the index and swaps `playingVideoPath`. `VideoPlayer` receives `onNext` (undefined when at end) and shows an Up Next card 30 s before the video ends with a 10 s countdown.

### Rust backend (`main.rs`)

All Tauri commands: `scan_folders`, `fetch_metadata`, `fetch_all_metadata`, `play_media`, `load_settings`, `save_settings`.

**Persistence** — everything lives under `~/.meflix/`:
- `config.json` — `AppSettings` (TMDB API key, source folders)
- `metadata_cache.json` — `MetadataCache` (keyed by lowercased folder name)
- `posters/{tmdb_id}_poster.jpg` / `{tmdb_id}_backdrop.jpg`

**Scanning** — `scan_folders` reads directory trees, groups episodes by season (`SxxExx` / `NxNN` regex), merges with the metadata cache, and returns `Vec<MediaItem>`. `fetch_all_metadata` batches TMDB API calls with a 260 ms delay to stay under the 40 req/10 s rate limit.

### CSP / security

Any new external origin (image CDN, API) must be added to the `connect-src` / `img-src` / `media-src` directives in `tauri.conf.json`. Tauri blocks everything not listed, silently for assets (the asset will just fail to load with no console error in release builds).
