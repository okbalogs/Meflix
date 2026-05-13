# Meflix

A Netflix-style local media player built with Tauri, React, and Rust. Meflix lets you organize and watch your personal movie and TV show collection with a polished streaming-service UI — complete with metadata, artwork, and playback features — entirely offline on your desktop.

## Features

- **Library scanning** — point Meflix at any folder and it scans for movies and TV series automatically, grouping episodes by season
- **TMDB metadata** — fetches posters, backdrops, overviews, genres, ratings, and release years from The Movie Database
- **Netflix-style home screen** — rotating billboard hero, genre rows, Continue Watching, My List, Recently Added, Top 10, and "Because you watched…" recommendation rows
- **Resume prompt** — when you return to something you've partially watched, choose to resume from where you left off or start from the beginning
- **Watch progress** — a progress bar on every card tracks how far through each title you are; a checkmark appears on fully-watched items
- **My List** — bookmark any title with the + button; your list persists across sessions
- **Video player** — full-screen player with chapter detection (auto-detects intros and credits), skip-intro button, Up Next countdown, audio/subtitle track switching, and episode autoplay queue
- **Hover preview** — hovering a card for a moment starts a muted video preview of that title
- **Search with filters** — search by name, then narrow results by type (Movies / TV Shows) and genre
- **Genre filter bar** — filter the entire home screen by genre with a pill bar under the navbar
- **Settings** — configure source folders and your TMDB API key through a sidebar settings panel
- **Splash screen** — branded loading screen on startup
- **Mobile responsive** — the UI adapts for phone and tablet screen sizes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 |
| Frontend | React 19, TypeScript, Vite |
| Backend | Rust |
| Metadata | TMDB API |
| Video transcoding | FFmpeg (streams MKV/AVI/FLV via local HTTP server) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable toolchain)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS
- FFmpeg installed and available on your PATH
- A free [TMDB API key](https://developer.themoviedb.org/docs/getting-started) (optional — the app works without one, but without metadata)

### Running in development

```bash
npm install
npm run tauri dev
```

### Building for production

```bash
npm run tauri build
```

### Type-checking only

```bash
npx tsc --noEmit
```

## Configuration

On first launch, open **Settings** (gear icon in the navbar) and:

1. Add one or more **source folders** containing your media files
2. Optionally paste a **TMDB API key** to enable automatic metadata and artwork fetching

Settings are saved to `~/.meflix/config.json`. Metadata and poster images are cached under `~/.meflix/` so they are only fetched once.

## Supported Formats

| Format | Playback method |
|--------|----------------|
| MP4, M4V, WebM, MOV | Native browser playback via Tauri asset protocol |
| MKV, AVI, FLV | Transcoded to fragmented MP4 on the fly via a local FFmpeg HTTP server on port 1421 |

## File Naming

For best results, name your files using standard conventions:

- **Movies** — `Movie Title (2023).mkv`
- **TV episodes** — `Show Name S01E03.mkv` or `Show Name 1x03.mkv`

## License

MIT
