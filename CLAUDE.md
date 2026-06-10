# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (starts both Vite dev server and Rust backend)
npm run tauri dev

# Production build (Linux: deb/rpm/AppImage per tauri.conf.json bundle targets)
npm run tauri build

# Frontend-only (no Tauri shell — limited functionality)
npm run dev

# Type-check the frontend
npx tsc --noEmit

# Rebuild Rust only (inside src-tauri/)
cargo check

# Android (requires Android SDK + NDK; normally done by CI)
bash scripts/fetch-android-ffmpeg.sh
npm run tauri android init
python3 scripts/android/patch-android-project.py
npm run tauri android build -- --apk --target aarch64
```

There are no tests in this project. Android builds cannot be verified without the Android SDK — the `Build Android APK` GitHub Actions workflow is the source of truth.

## Architecture

Meflix is a **Tauri v2** app for desktop (Linux/macOS/Windows) and **Android**: a React 19 / TypeScript frontend served by Vite, backed by a Rust library (`src-tauri/src/lib.rs`).

### Two servers, always running (all platforms)

| Server | Address | Purpose |
|--------|---------|---------|
| Vite dev server | `http://localhost:1420` | Frontend (dev only; port is strict — fails if taken) |
| FFmpeg streaming server | `http://127.0.0.1:1421` | Remuxes/transcodes media → fragmented MP4 via pipe; started in the Tauri `setup` hook on every platform |

The streaming server port (1421) doubles as the Vite HMR port in remote dev scenarios — take care if changing it.

### File layout

```
src/App.tsx            — root component, app state, handlers
src/components/*.tsx   — UI components (VideoPlayer, SettingsModal, Billboard, …)
src/utils.ts           — toPlaySrc() playback routing, STREAM_BASE, helpers
src/platform.ts        — cached get_platform invoke (isAndroid())
src/App.css            — all styles (Netflix-style design system, responsive + touch)
src-tauri/src/lib.rs   — ALL Rust logic: scanner, TMDB fetch, settings, streaming server, entry point
src-tauri/src/main.rs  — thin binary stub calling meflix_lib::run()
src-tauri/tauri.conf.json — security config (CSP, asset protocol scope), bundle targets
src-tauri/capabilities/default.json — Tauri permission grants
scripts/fetch-android-ffmpeg.sh     — downloads pinned LGPL FFmpeg arm64 prebuilts
scripts/android/patch-android-project.py — patches the generated gen/android project
```

`src-tauri/gen/` is **generated** by `tauri android init` and is gitignored — never commit it; customize it only through `scripts/android/patch-android-project.py` (manifest permissions, MainActivity runtime permission request, gradle `useLegacyPackaging`, FFmpeg jniLibs).

### Media playback routing (`toPlaySrc()` in src/utils.ts)

Desktop:
```
.mkv / .avi / .flv / .mov →  http://127.0.0.1:1421/stream?path=…&vc=…&ac=…   (FFmpeg)
everything else           →  convertFileSrc(path)  (Tauri asset protocol)
```
Android: **everything** routes through the streaming server (avoids asset-scope issues with `/storage` paths).

The `vc`/`ac` query params are `"copy"` or an encoder name (legacy `copy=true` still maps to copy/copy). Policy (probe-driven via `probe_codecs`):
- Desktop: copy h264 video / aac audio, otherwise `libx264` / `aac`.
- Android: copy h264/hevc/vp9/av1 video (the device decodes it), copy aac/mp3 audio, otherwise transcode audio to `aac`. The bundled LGPL FFmpeg has **no H.264 encoder** — `mpeg4` is the only software fallback, so unsupported video codecs may simply fail with the player's error UI.

### FFmpeg location

`ffmpeg_path()` / `ffprobe_path()` in lib.rs: PATH on desktop; on Android the prebuilt static executables are packaged as fake jniLibs (`libffmpeg.so` / `libffprobe.so`) and resolved from `nativeLibraryDir` (found by scanning `/proc/self/maps` for our own `libmeflix_lib.so`). Exec on Android only works from nativeLibraryDir, which requires gradle `jniLibs.useLegacyPackaging = true` (applied by the patch script).

### Episode autoplay / queue

`buildSeriesQueue(series)` flattens all seasons (sorted) into `{path, title}[]`. `handlePlayItem(item, startPath?)` builds this queue and sets `playingQueue` + `playingQueueIdx`. `handleNext` advances the index and swaps `playingVideoPath`. `VideoPlayer` receives `onNext` (undefined when at end) and shows an Up Next card 30 s before the video ends with a 10 s countdown.

### Rust backend (`lib.rs`)

Tauri commands: `scan_folders`, `fetch_metadata`, `fetch_all_metadata`, `play_media` (desktop opens external player; Android stub errors), `load_settings`, `save_settings`, `check_ffmpeg`, `probe_codecs`, `get_media_info`, `fetch_recommendations`, `get_platform`.

**Persistence** — `get_meflix_dir()`: `~/.meflix/` on desktop, `app_data_dir()/meflix` on Android (set once via the `MEFLIX_DIR` OnceLock in `setup`):
- `config.json` — `AppSettings` (TMDB API key, source folders)
- `metadata_cache.json` — `MetadataCache` (keyed by lowercased folder name)
- `posters/{tmdb_id}_poster.jpg` / `{tmdb_id}_backdrop.jpg`

**Android folders** — there is no folder picker on Android; `load_settings` defaults to `/storage/emulated/0/{Movies,Download,Videos,DCIM}` when no folders are configured. Reading them requires `READ_MEDIA_VIDEO` (API 33+), requested at startup by the patched MainActivity.

**Asset-protocol scope** — the static scope in tauri.conf.json only covers `$HOME/.meflix/**`; the `setup` hook and `save_settings` extend it at runtime (`app.asset_protocol_scope().allow_directory(...)`) for every configured source folder so direct playback works from anywhere.

**Scanning** — `scan_folders` reads directory trees, groups episodes by season (`SxxExx` / `NxNN` regex), merges with the metadata cache, and returns `Vec<MediaItem>`. `fetch_all_metadata` batches TMDB API calls with a 260 ms delay to stay under the 40 req/10 s rate limit.

### CSP / security

Any new external origin (image CDN, API) must be added to the `connect-src` / `img-src` / `media-src` directives in `tauri.conf.json`. Note `http://asset.localhost` is required for Android/Windows (the asset protocol is served over http there). Tauri blocks everything not listed, silently for assets (the asset will just fail to load with no console error in release builds).

### CI

- `.github/workflows/android.yml` — arm64 debug APK: fetch FFmpeg prebuilts → `tauri android init` → patch script → build → verify the APK contains the FFmpeg libs and permissions.
- `.github/workflows/linux.yml` — deb/rpm/AppImage on ubuntu-22.04; attaches bundles to GitHub Releases on `v*` tags.
