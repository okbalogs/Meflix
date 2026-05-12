import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import logo from "./assets/logo.png";
import "./App.css";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Episode {
  name: string;
  path: string;
  season: number;
  number: number;
  quality: string | null;
  source: string | null;
}

interface Season {
  number: number;
  path: string;
  episodes: Episode[];
}

interface MediaItem {
  name: string;
  path: string;
  media_type: string;
  video_files: string[];
  seasons: Season[];
  year: string | null;
  quality: string | null;
  source: string | null;
  tmdb_id: number | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  rating: number | null;
  genres: string[] | null;
  tmdb_year: string | null;
}

interface AppSettings {
  tmdb_api_key: string | null;
  source_folders: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const GRADIENTS = ["gradient-1","gradient-2","gradient-3","gradient-4","gradient-5"];
function getGradient(name: string) {
  const idx = Math.abs(name.split("").reduce((a,c)=>a+c.charCodeAt(0),0)) % GRADIENTS.length;
  return GRADIENTS[idx];
}

function cleanEpisodeName(name: string): string {
  let cleaned = name.replace(/\.[^.]+$/, "");
  cleaned = cleaned.replace(/\./g, " ").replace(/_/g, " ");
  cleaned = cleaned.replace(/\s*(x265|x264|10Bit|HEVC|AAC|DDP?5[\.\s]?1|BluRay|WEB[- ]?DL|WEBRip|HDRip|HDTV|BRRip|AMZN|NF|HMAX|RARBG|YIFY|YTS|Pahe[\.\s]in|mkv|mp4).*$/i, "");
  return cleaned.trim();
}

async function toPlaySrc(path: string): Promise<string> {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (['mkv', 'avi', 'flv', 'mov'].includes(ext)) {
    // For MKV: probe codecs — if h264+aac, remux (copy) instead of full transcode
    if (ext === 'mkv') {
      try {
        const codecs = await invoke<string>("probe_codecs", { path });
        const [vcodec, acodec] = codecs.split(':');
        if (vcodec === 'h264' && acodec === 'aac') {
          return `http://127.0.0.1:1421/stream?path=${encodeURIComponent(path)}&copy=true`;
        }
      } catch { /* fall through to full transcode */ }
    }
    return `http://127.0.0.1:1421/stream?path=${encodeURIComponent(path)}`;
  }
  return convertFileSrc(path);
}

function buildSeriesQueue(series: MediaItem): Array<{ path: string; title: string }> {
  const queue: Array<{ path: string; title: string }> = [];
  const sortedSeasons = [...series.seasons].sort((a, b) => a.number - b.number);
  for (const season of sortedSeasons) {
    const sortedEps = [...season.episodes].sort((a, b) => a.number - b.number);
    for (const ep of sortedEps) {
      queue.push({ path: ep.path, title: `${series.name} — S${season.number}:E${ep.number}` });
    }
  }
  return queue;
}

// ─── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [settings, setSettings] = useState<AppSettings>({ tmdb_api_key: null, source_folders: [] });
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchProgress, setFetchProgress] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [showSettings, setShowSettings] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [billboardIdx, setBillboardIdx] = useState(0);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>({ tmdb_api_key: null, source_folders: [] });
  const [showApiKey, setShowApiKey] = useState(false);
  const [playingVideoPath, setPlayingVideoPath] = useState<string | null>(null);
  const [playingTitle, setPlayingTitle] = useState<string>("");
  const [playingQueue, setPlayingQueue] = useState<Array<{ path: string; title: string }>>([]);
  const [playingQueueIdx, setPlayingQueueIdx] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [playingItem, setPlayingItem] = useState<MediaItem | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 5000);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await invoke<AppSettings>("load_settings");
        setSettings(s);
        setSettingsDraft(s);
        if (s.source_folders.length > 0) scanLibrary(s.source_folders, s.tmdb_api_key);
      } catch (e) { console.error("Load settings error:", e); }
    })();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (library.length === 0) return;
    const withBackdrop = library.filter(i => i.backdrop_path);
    if (withBackdrop.length === 0) return;
    const interval = setInterval(() => setBillboardIdx(prev => (prev + 1) % withBackdrop.length), 30000);
    return () => clearInterval(interval);
  }, [library]);

  const scanLibrary = useCallback(async (folders: string[], apiKey: string | null) => {
    setLoading(true);
    try {
      const data = await invoke<MediaItem[]>("scan_folders", { folderPaths: folders });
      setLibrary(data);
      if (apiKey) {
        const unfetched = data.filter(i => !i.tmdb_id);
        if (unfetched.length > 0) {
          setFetchProgress(0);
          try {
            await invoke("fetch_all_metadata", { items: unfetched, apiKey });
            const updated = await invoke<MediaItem[]>("scan_folders", { folderPaths: folders });
            setLibrary(updated);
          } catch (e) { console.error("Metadata fetch error:", e); }
          setFetchProgress(null);
        }
      }
    } catch (e) { console.error("Scan error:", e); }
    setLoading(false);
  }, []);

  const handlePlayItem = useCallback(async (item: MediaItem, startPath?: string) => {
    setPlayingItem(item);
    if (item.media_type === "movie") {
      const path = startPath || item.video_files[0];
      if (!path) return;
      setPlayingVideoPath(await toPlaySrc(path));
      setPlayingTitle(item.name);
      setPlayingQueue([{ path, title: item.name }]);
      setPlayingQueueIdx(0);
    } else {
      const q = buildSeriesQueue(item);
      if (q.length === 0) return;
      const idx = startPath ? Math.max(0, q.findIndex(e => e.path === startPath)) : 0;
      setPlayingVideoPath(await toPlaySrc(q[idx].path));
      setPlayingTitle(q[idx].title);
      setPlayingQueue(q);
      setPlayingQueueIdx(idx);
    }
  }, []);

  const handleNext = useCallback(async () => {
    const nextIdx = playingQueueIdx + 1;
    if (nextIdx >= playingQueue.length) return;
    const next = playingQueue[nextIdx];
    setPlayingVideoPath(await toPlaySrc(next.path));
    setPlayingTitle(next.title);
    setPlayingQueueIdx(nextIdx);
  }, [playingQueueIdx, playingQueue]);

  const openSettings = () => { setSettingsDraft({ ...settings }); setShowSettings(true); };

  const addFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: "Select Media Folder" });
      if (selected && !settingsDraft.source_folders.includes(selected as string)) {
        setSettingsDraft(prev => ({ ...prev, source_folders: [...prev.source_folders, selected as string] }));
      }
    } catch (e) { console.error("Dialog error:", e); }
  };

  const removeFolder = (idx: number) => {
    setSettingsDraft(prev => ({ ...prev, source_folders: prev.source_folders.filter((_, i) => i !== idx) }));
  };

  const saveSettings = async () => {
    try {
      await invoke("save_settings", { settings: settingsDraft });
      setSettings(settingsDraft);
      setShowSettings(false);
      if (settingsDraft.source_folders.length > 0) scanLibrary(settingsDraft.source_folders, settingsDraft.tmdb_api_key);
    } catch (e) { console.error("Save settings error:", e); }
  };

  const series = library.filter(i => i.media_type === "series");
  const movies = library.filter(i => i.media_type === "movie");
  const searchResults = searchQuery.trim() ? library.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase())) : [];
  const itemsWithBackdrop = library.filter(i => i.backdrop_path);
  const billboardItem = itemsWithBackdrop.length > 0 ? itemsWithBackdrop[billboardIdx % itemsWithBackdrop.length] : library[0] || null;

  // Genre computation for Task 6
  const allGenres = Array.from(new Set(library.flatMap(i => i.genres || []))).sort();
  const filteredLibrary = activeGenre ? library.filter(i => i.genres?.includes(activeGenre)) : library;

  const scrollRow = (ref: React.RefObject<HTMLDivElement | null>, dir: "left" | "right") => {
    if (!ref.current) return;
    ref.current.scrollBy({ left: dir === "left" ? -ref.current.clientWidth * 0.8 : ref.current.clientWidth * 0.8, behavior: "smooth" });
  };

  const seriesSliderRef = useRef<HTMLDivElement>(null);
  const moviesSliderRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      {fetchProgress !== null && (
        <div className="progress-bar"><div className="progress-fill" style={{ width: "60%" }} /></div>
      )}

      {/* ─── Navbar ─── */}
      <nav className={`navbar ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-left">
          <div className="nav-logo">
            <img src={logo} alt="Meflix" style={{ height: "40px", display: "block" }} />
          </div>
          <ul className="nav-links">
            <li className={activeFilter === "all" ? "active" : ""} onClick={() => { setActiveFilter("all"); setSearchQuery(""); }}>Home</li>
            <li className={activeFilter === "series" ? "active" : ""} onClick={() => { setActiveFilter("series"); setSearchQuery(""); }}>TV Shows</li>
            <li className={activeFilter === "movies" ? "active" : ""} onClick={() => { setActiveFilter("movies"); setSearchQuery(""); }}>Movies</li>
          </ul>
        </div>
        <div className="nav-right">
          <div className={`search-container ${searchOpen ? "expanded" : "collapsed"}`}>
            <button className="nav-icon search-icon" onClick={() => { setSearchOpen(!searchOpen); if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 100); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            {searchOpen && (
              <input ref={searchInputRef} className="search-input" placeholder="Titles, genres..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
              />
            )}
          </div>
          <button className="nav-icon" onClick={openSettings} title="Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          </button>
        </div>
      </nav>

      {/* ─── Genre Filter Bar ─── */}
      {allGenres.length > 0 && !searchQuery.trim() && (
        <div className={`genre-bar ${scrolled ? "genre-bar-scrolled" : ""}`}>
          <button className={`genre-pill ${activeGenre === null ? "active" : ""}`} onClick={() => setActiveGenre(null)}>All</button>
          {allGenres.map(g => (
            <button key={g} className={`genre-pill ${activeGenre === g ? "active" : ""}`} onClick={() => setActiveGenre(activeGenre === g ? null : g)}>{g}</button>
          ))}
        </div>
      )}

      {/* ─── Toast ─── */}
      {toastMsg && <div className="toast-notification">{toastMsg}</div>}

      {/* ─── Search Results ─── */}
      {searchQuery.trim() ? (
        <div className="search-results">
          <div className="search-results-title">Results for "{searchQuery}"</div>
          {searchResults.length === 0 ? (
            <div style={{ color: "var(--text-muted)", marginTop: 40 }}>No results found.</div>
          ) : (
            <div className="search-grid">
              {searchResults.map((item, i) => (
                <MediaCard key={i} item={item} onPlayItem={handlePlayItem} onInfo={item => { setDetailItem(item); setSelectedSeason(item.seasons[0]?.number || 1); }} />
              ))}
            </div>
          )}
        </div>
      ) : library.length === 0 && !loading ? (
        <div className="empty-state">
          <div className="empty-icon">🎬</div>
          <div className="empty-title">Welcome to Meflix</div>
          <div className="empty-subtitle">Add your media folders to get started</div>
          <button className="empty-btn" onClick={openSettings}>Open Settings</button>
        </div>
      ) : loading && library.length === 0 ? (
        <>
          <div className="skeleton-billboard" />
          <div className="content-section">
            <div className="content-row">
              <div className="skeleton-row-title" />
              <div className="row-slider">{[...Array(8)].map((_, i) => <div key={i} className="skeleton-card" />)}</div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* ─── Billboard ─── */}
          {billboardItem && (
            <div className="billboard">
              <BillboardImage item={billboardItem} />
              <div className="billboard-gradient" />
              <div className="billboard-content">
                {billboardItem.rating && (
                  <div className="billboard-match">
                    <span className="billboard-match-pct">{Math.round(billboardItem.rating * 10)}% Match</span>
                  </div>
                )}
                <h1 className="billboard-title">{billboardItem.name}</h1>
                {billboardItem.overview && <p className="billboard-overview">{billboardItem.overview}</p>}
                <div className="billboard-meta">
                  {(billboardItem.tmdb_year || billboardItem.year) && (
                    <span className="billboard-year">{billboardItem.tmdb_year || billboardItem.year}</span>
                  )}
                  {billboardItem.genres && billboardItem.genres.slice(0, 3).map((g, i) => (
                    <span key={i} className="billboard-genre">{g}</span>
                  ))}
                </div>
                <div className="billboard-buttons">
                  <button className="btn-play" onClick={() => handlePlayItem(billboardItem)}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Play
                  </button>
                  <button className="btn-info" onClick={() => { setDetailItem(billboardItem); setSelectedSeason(billboardItem.seasons[0]?.number || 1); }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.3)"/><line x1="12" y1="16" x2="12" y2="12" stroke="white" strokeWidth="2"/><line x1="12" y1="8" x2="12.01" y2="8" stroke="white" strokeWidth="2"/></svg>
                    More Info
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── Content Rows ─── */}
          <div className="content-section">
            {(activeFilter === "all" || activeFilter === "series") && series.length > 0 && (
              <div className="content-row">
                <h2 className="row-title">TV Shows</h2>
                <div className="row-container">
                  <button className="row-arrow left" onClick={() => scrollRow(seriesSliderRef, "left")}>&#8249;</button>
                  <div className="row-slider" ref={seriesSliderRef}>
                    {series.map((item, i) => (
                      <MediaCard key={i} item={item} onPlayItem={handlePlayItem} onInfo={item => { setDetailItem(item); setSelectedSeason(item.seasons[0]?.number || 1); }} />
                    ))}
                  </div>
                  <button className="row-arrow right" onClick={() => scrollRow(seriesSliderRef, "right")}>&#8250;</button>
                </div>
              </div>
            )}
            {(activeFilter === "all" || activeFilter === "movies") && movies.length > 0 && (
              <div className="content-row">
                <h2 className="row-title">Movies</h2>
                <div className="row-container">
                  <button className="row-arrow left" onClick={() => scrollRow(moviesSliderRef, "left")}>&#8249;</button>
                  <div className="row-slider" ref={moviesSliderRef}>
                    {movies.map((item, i) => (
                      <MediaCard key={i} item={item} onPlayItem={handlePlayItem} onInfo={item => { setDetailItem(item); setSelectedSeason(item.seasons[0]?.number || 1); }} />
                    ))}
                  </div>
                  <button className="row-arrow right" onClick={() => scrollRow(moviesSliderRef, "right")}>&#8250;</button>
                </div>
              </div>
            )}
            {/* ─── Genre Rows ─── */}
            {(activeFilter === "all" ? allGenres : allGenres.filter(g => !activeGenre || g === activeGenre)).map(genre => {
              const genreItems = filteredLibrary.filter(i => i.genres?.includes(genre));
              if (genreItems.length === 0) return null;
              return (
                <GenreRow key={genre} genre={genre} items={genreItems} scrollRow={scrollRow} onPlayItem={handlePlayItem} onInfo={item => { setDetailItem(item); setSelectedSeason(item.seasons[0]?.number || 1); }} />
              );
            })}
          </div>
        </>
      )}

      {/* ─── Detail Modal ─── */}
      {detailItem && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDetailItem(null); }}>
          <div className="modal-content">
            <button className="modal-close" onClick={() => setDetailItem(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <ModalBackdrop item={detailItem} />
            <div className="modal-body">
              <div className="modal-header-actions">
                {(detailItem.media_type === "movie" ? detailItem.video_files.length > 0 : !!detailItem.seasons[0]?.episodes[0]) && (
                  <button className="modal-play-btn" onClick={() => { handlePlayItem(detailItem); setDetailItem(null); }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Play
                  </button>
                )}
              </div>
              <h2 className="modal-title">{detailItem.name}</h2>
              <div className="modal-meta">
                {detailItem.rating && <span className="modal-match">{Math.round(detailItem.rating * 10)}% Match</span>}
                {(detailItem.tmdb_year || detailItem.year) && <span className="modal-year">{detailItem.tmdb_year || detailItem.year}</span>}
                {detailItem.quality && <span className="modal-badge">{detailItem.quality}</span>}
                {detailItem.source && <span className="modal-badge">{detailItem.source}</span>}
                <span className="modal-badge">{detailItem.media_type === "series" ? "Series" : "Movie"}</span>
              </div>
              {detailItem.overview && <p className="modal-overview">{detailItem.overview}</p>}
              {detailItem.genres && detailItem.genres.length > 0 && (
                <div className="modal-genres">
                  <span className="modal-genres-label">Genres:</span>
                  {detailItem.genres.map((g, i) => <span key={i} className="modal-genre-tag">{g}</span>)}
                </div>
              )}
              {detailItem.media_type === "series" && detailItem.seasons.length > 0 && (
                <>
                  <div className="season-selector">
                    <select className="season-select" value={selectedSeason} onChange={e => setSelectedSeason(Number(e.target.value))}>
                      {detailItem.seasons.map(s => <option key={s.number} value={s.number}>Season {s.number}</option>)}
                    </select>
                    <span className="season-label">
                      {detailItem.seasons.find(s => s.number === selectedSeason)?.episodes.length || 0} Episodes
                    </span>
                  </div>
                  <div className="episode-list">
                    {detailItem.seasons.find(s => s.number === selectedSeason)?.episodes.map((ep, i) => (
                      <div key={i} className="episode-item" onClick={() => { handlePlayItem(detailItem, ep.path); setDetailItem(null); }}>
                        <div className="episode-number">{ep.number || i + 1}</div>
                        <div className="episode-thumbnail-wrap">
                          <EpisodeThumbnail item={detailItem} />
                          <div className="episode-play-overlay">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          </div>
                        </div>
                        <div className="episode-info">
                          <div className="episode-name-row">
                            <div className="episode-name">{cleanEpisodeName(ep.name)}</div>
                          </div>
                          <div className="episode-description">
                            Season {selectedSeason}, Episode {ep.number || i + 1} of {detailItem.name}.
                          </div>
                          <div className="episode-badges">
                            {ep.quality && <span className="episode-badge">{ep.quality}</span>}
                            {ep.source && <span className="episode-badge">{ep.source}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Settings Modal ─── */}
      {showSettings && (
        <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) setShowSettings(false); }}>
          <div className="settings-panel">
            <div className="settings-header">
              <h2 className="settings-title">Settings</h2>
              <button className="settings-close-btn" onClick={() => setShowSettings(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="settings-section">
              <div className="settings-label">TMDB API Key</div>
              <div className="settings-input-wrap">
                <input className="settings-input" type={showApiKey ? "text" : "password"}
                  placeholder="Enter your TMDB API key"
                  value={settingsDraft.tmdb_api_key || ""}
                  onChange={e => setSettingsDraft(prev => ({ ...prev, tmdb_api_key: e.target.value || null }))}
                />
                <button className="settings-toggle-btn" onClick={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div className="settings-section">
              <div className="settings-label">Media Folders</div>
              <div className="folder-list">
                {settingsDraft.source_folders.map((f, i) => (
                  <div key={i} className="folder-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0,opacity:0.5}}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                    <span className="folder-path" title={f}>{f}</span>
                    <button className="folder-remove" onClick={() => removeFolder(i)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
              </div>
              <button className="settings-add-btn" onClick={addFolder}>+ Add Media Folder</button>
            </div>
            <div className="settings-actions">
              <button className="settings-cancel" onClick={() => setShowSettings(false)}>Cancel</button>
              <button className="settings-save" onClick={saveSettings}>Save & Scan</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Video Player ─── */}
      {playingVideoPath && (
        <VideoPlayer
          src={playingVideoPath}
          title={playingTitle}
          onClose={() => { setPlayingVideoPath(null); setPlayingQueue([]); setPlayingQueueIdx(0); setPlayingItem(null); }}
          onNext={playingQueueIdx < playingQueue.length - 1 ? handleNext : undefined}
          nextTitle={playingQueue[playingQueueIdx + 1]?.title}
          playingItem={playingItem}
          apiKey={settings.tmdb_api_key}
          onShowDetail={(item) => { setPlayingVideoPath(null); setPlayingQueue([]); setPlayingQueueIdx(0); setPlayingItem(null); setDetailItem(item); setSelectedSeason(item.seasons[0]?.number || 1); }}
          onToast={showToast}
        />
      )}
    </div>
  );
}

// ─── BillboardImage ────────────────────────────────────────────────────────

function BillboardImage({ item }: { item: MediaItem }) {
  const [error, setError] = useState(false);
  const src = item.backdrop_path ? convertFileSrc(item.backdrop_path) : item.poster_path ? convertFileSrc(item.poster_path) : null;

  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onerror = () => setError(true);
    img.src = src;
  }, [src]);

  if (!src || error) {
    return <div className={`billboard-bg ${getGradient(item.name)}`} style={{ position: "absolute", inset: 0 }} />;
  }
  return <div className="billboard-bg" style={{ backgroundImage: `url(${src})` }} />;
}

// ─── ModalBackdrop ─────────────────────────────────────────────────────────

function ModalBackdrop({ item }: { item: MediaItem }) {
  const [error, setError] = useState(false);
  const src = item.backdrop_path ? convertFileSrc(item.backdrop_path) : item.poster_path ? convertFileSrc(item.poster_path) : null;
  if (!src || error) return <div className={`modal-backdrop-fallback ${getGradient(item.name)}`}>{item.name}</div>;
  return (
    <>
      <img className="modal-backdrop" src={src} alt="" onError={() => setError(true)}
        style={item.poster_path && !item.backdrop_path ? { objectPosition: "center top" } : undefined} />
      <div className="modal-backdrop-gradient" />
    </>
  );
}

// ─── EpisodeThumbnail ──────────────────────────────────────────────────────

function EpisodeThumbnail({ item }: { item: MediaItem }) {
  const [error, setError] = useState(false);
  const src = item.backdrop_path ? convertFileSrc(item.backdrop_path) : null;
  if (!src || error) return <div className={`episode-thumbnail-fallback ${getGradient(item.name)}`} />;
  return <img className="episode-thumbnail" src={src} alt="" loading="lazy" onError={() => setError(true)} />;
}

// ─── VideoPlayer ───────────────────────────────────────────────────────────

interface TmdbRecommendation {
  tmdb_id: number;
  title: string;
  poster_url: string | null;
  year: string | null;
  rating: number | null;
  media_type: string;
  overview: string | null;
}

function VideoPlayer({
  src, title, onClose, onNext, nextTitle, playingItem, apiKey, onShowDetail, onToast,
}: {
  src: string; title: string; onClose: () => void; onNext?: () => void; nextTitle?: string;
  playingItem?: MediaItem | null; apiKey?: string | null;
  onShowDetail?: (item: MediaItem) => void; onToast?: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [centerIcon, setCenterIcon] = useState<string | null>(null);
  const [showUpNext, setShowUpNext] = useState(false);
  const [upNextCountdown, setUpNextCountdown] = useState(10);
  const [showIntroBtn, setShowIntroBtn] = useState(false);
  const [introEnd, setIntroEnd] = useState(0);
  const [settingIntro, setSettingIntro] = useState(false);
  const [recommendations, setRecommendations] = useState<TmdbRecommendation[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const controlsTimerRef = useRef<number | null>(null);
  const centerTimerRef = useRef<number | null>(null);
  const upNextShownRef = useRef(false);
  const dismissedUpNextRef = useRef(false);
  const isSeekingRef = useRef(false);
  const suggestionsShownRef = useRef(false);
  const progressTrackRef = useRef<HTMLDivElement>(null);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 3000);
  }, []);

  // Reset everything when src changes (new episode loaded)
  useEffect(() => {
    setPlaying(true); setProgress(0); setDuration(0);
    setIsBuffering(true); setHasError(false); setCenterIcon(null);
    setShowUpNext(false); setUpNextCountdown(10); setShowIntroBtn(false);
    setShowSuggestions(false); setRecommendations([]);
    upNextShownRef.current = false; dismissedUpNextRef.current = false;
    suggestionsShownRef.current = false;
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 3500);
    if (videoRef.current) videoRef.current.load();
  }, [src]);

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      if (centerTimerRef.current) clearTimeout(centerTimerRef.current);
    };
  }, []);

  // Up Next countdown
  useEffect(() => {
    if (!showUpNext) return;
    if (onNext) {
      if (upNextCountdown <= 0) { onNext(); return; }
      const t = window.setTimeout(() => setUpNextCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [showUpNext, upNextCountdown, onNext]);

  // Fetch recommendations when suggestions overlay shows
  useEffect(() => {
    if (!showSuggestions || !playingItem?.tmdb_id || !apiKey) return;
    invoke<TmdbRecommendation[]>("fetch_recommendations", {
      tmdbId: playingItem.tmdb_id, mediaType: playingItem.media_type, apiKey,
    }).then(setRecommendations).catch(() => {});
  }, [showSuggestions, playingItem, apiKey]);

  const flashCenter = (icon: string) => {
    setCenterIcon(icon);
    if (centerTimerRef.current) clearTimeout(centerTimerRef.current);
    centerTimerRef.current = window.setTimeout(() => setCenterIcon(null), 700);
  };

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) { videoRef.current.play(); setPlaying(true); flashCenter("▶"); }
    else { videoRef.current.pause(); setPlaying(false); flashCenter("⏸"); }
  }, []);

  const skip = useCallback((amount: number) => {
    if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + amount);
  }, []);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const next = !videoRef.current.muted;
    videoRef.current.muted = next;
    setMuted(next);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else playerRef.current?.requestFullscreen();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "ArrowLeft": e.preventDefault(); skip(-15); break;
        case "ArrowRight": e.preventDefault(); skip(15); break;
        case "m": e.preventDefault(); toggleMute(); break;
        case "f": e.preventDefault(); toggleFullscreen(); break;
        case "n": if (onNext) { e.preventDefault(); onNext(); } break;
        case "Escape": if (!document.fullscreenElement) onClose(); break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePlay, skip, toggleMute, toggleFullscreen, onClose, onNext]);

  const handleTimeUpdate = () => {
    if (!videoRef.current || isSeekingRef.current) return;
    const current = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 0;
    setProgress(current);
    setDuration(dur);
    // Skip Intro check
    if (introEnd > 0 && current >= 0 && current < introEnd) {
      setShowIntroBtn(true);
    } else {
      setShowIntroBtn(false);
    }
    // Show overlay 30 seconds before end
    if (dur > 60 && !upNextShownRef.current && !dismissedUpNextRef.current && dur - current <= 30) {
      upNextShownRef.current = true;
      if (onNext) {
        setShowUpNext(true);
        setUpNextCountdown(10);
      } else if (!suggestionsShownRef.current) {
        suggestionsShownRef.current = true;
        setShowSuggestions(true);
      }
    }
  };

  // Pointer-event based seeking
  const seekToPosition = (clientX: number) => {
    if (!progressTrackRef.current || !videoRef.current) return;
    const rect = progressTrackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = ratio * (videoRef.current.duration || 0);
    videoRef.current.currentTime = newTime;
    setProgress(newTime);
  };

  const handleSeekMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isSeekingRef.current = true;
    seekToPosition(e.clientX);
    const onMove = (ev: MouseEvent) => seekToPosition(ev.clientX);
    const onUp = () => { isSeekingRef.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (videoRef.current) { videoRef.current.volume = val; videoRef.current.muted = val === 0; }
    setMuted(val === 0);
  };

  const formatTime = (sec: number) => {
    if (!isFinite(sec) || isNaN(sec)) return "0:00";
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    return `${m}:${String(s).padStart(2,"0")}`;
  };

  const VolumeIcon = () => {
    if (muted || volume === 0) return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
      </svg>
    );
    if (volume < 0.5) return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/>
      </svg>
    );
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/>
      </svg>
    );
  };

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const timeLeft = duration > 0 ? duration - progress : 0;

  return (
    <div
      ref={playerRef}
      className={`video-player-overlay ${showControls ? "controls-active" : "controls-hidden"}`}
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => {
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 1000);
      }}
    >
      <video
        ref={videoRef}
        className="video-element"
        src={src}
        autoPlay
        onTimeUpdate={handleTimeUpdate}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onPlaying={() => { setIsBuffering(false); setPlaying(true); }}
        onPause={() => setPlaying(false)}
        onError={() => { setHasError(true); setIsBuffering(false); if (onToast) onToast("Unable to play this file. FFmpeg may be required."); }}
        onLoadedMetadata={() => { if (videoRef.current) setDuration(videoRef.current.duration); }}
        onEnded={() => { if (onNext) onNext(); else { setPlaying(false); if (!suggestionsShownRef.current) { suggestionsShownRef.current = true; setShowSuggestions(true); } } }}
      />

      {centerIcon && <div className="vp-center-action">{centerIcon}</div>}
      {isBuffering && !hasError && <div className="vp-buffering"><div className="vp-spinner" /></div>}

      {hasError && (
        <div className="vp-error">
          <div className="vp-error-icon">⚠</div>
          <div className="vp-error-msg">Unable to play this file. FFmpeg is required for MKV/AVI/MOV playback.</div>
          <button className="vp-error-btn" onClick={onClose}>Close Player</button>
        </div>
      )}
      {/* Skip Intro */}
      {showIntroBtn && (
        <button className="skip-intro-btn" onClick={() => { if (videoRef.current) videoRef.current.currentTime = introEnd; setShowIntroBtn(false); }}>
          Skip Intro
        </button>
      )}

      {/* Up Next / Skip Credits (has next episode) */}
      {showUpNext && onNext && nextTitle && (
        <div className="vp-up-next">
          <div className="vp-up-next-label">Up Next</div>
          <div className="vp-up-next-title">{nextTitle}</div>
          <div className="vp-up-next-bar">
            <div className="vp-up-next-bar-fill" style={{ width: `${(upNextCountdown / 10) * 100}%` }} />
          </div>
          <div className="vp-up-next-actions">
            <button className="vp-up-next-play" onClick={onNext}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Skip Credits ({upNextCountdown}s)
            </button>
            <button className="vp-up-next-dismiss" onClick={() => { setShowUpNext(false); dismissedUpNextRef.current = true; }}>
              Watch Credits
            </button>
          </div>
        </div>
      )}

      {/* Suggestions Modal (no next episode) */}
      {showSuggestions && !onNext && (
        <div className="suggestions-overlay">
          <div className="suggestions-sheet">
            <button className="suggestions-close" onClick={() => setShowSuggestions(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <h3 className="suggestions-heading">What's Next?</h3>
            {recommendations.length > 0 ? (
              <div className="suggestions-row">
                {recommendations.map(rec => (
                  <div key={rec.tmdb_id} className="suggestion-card" onClick={() => {
                    if (onShowDetail && playingItem) {
                      const fakeItem: MediaItem = {
                        name: rec.title, path: "", media_type: rec.media_type,
                        video_files: [], seasons: [], year: rec.year, quality: null, source: null,
                        tmdb_id: rec.tmdb_id, overview: rec.overview, poster_path: null,
                        backdrop_path: null, rating: rec.rating, genres: null, tmdb_year: rec.year,
                      };
                      onShowDetail(fakeItem);
                    }
                  }}>
                    {rec.poster_url ? (
                      <img className="suggestion-poster" src={rec.poster_url} alt={rec.title} loading="lazy" />
                    ) : (
                      <div className="suggestion-poster-fallback">{rec.title}</div>
                    )}
                    <div className="suggestion-info">
                      <div className="suggestion-title">{rec.title}</div>
                      <div className="suggestion-meta">
                        {rec.year && <span>{rec.year}</span>}
                        {rec.rating && <span>{Math.round(rec.rating * 10)}%</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", padding: "20px 0" }}>Loading recommendations...</div>
            )}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="vp-top-bar">
        <button className="vp-back-btn" onClick={onClose}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        {title && <div className="vp-title">{title}</div>}
      </div>

      {/* Bottom bar */}
      <div className="vp-bottom-bar">
        <div className="vp-progress-container">
          <div className="vp-progress-track" ref={progressTrackRef} onMouseDown={handleSeekMouseDown}>
            <div className="vp-progress-bg" />
            <div className="vp-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="vp-time-display">
            {formatTime(progress)} / {formatTime(duration)}
            {timeLeft > 0 && duration > 0 && <span className="vp-time-remaining"> −{formatTime(timeLeft)}</span>}
          </div>
        </div>

        <div className="vp-controls-row">
          <button className="vp-btn" onClick={togglePlay} title={playing ? "Pause (k)" : "Play (k)"}>
            {playing
              ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            }
          </button>

          {onNext && (
            <button className="vp-btn" onClick={onNext} title="Next Episode (n)">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 4 15 12 5 20 5 4"/>
                <rect x="17" y="4" width="2.5" height="16" rx="1"/>
              </svg>
            </button>
          )}

          <button className="vp-btn" onClick={() => skip(-15)} title="Rewind 15s (←)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
              <text x="7" y="16" fontSize="5.5" fill="currentColor" stroke="none" fontFamily="sans-serif">15</text>
            </svg>
          </button>
          <button className="vp-btn" onClick={() => skip(15)} title="Forward 15s (→)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
              <text x="7" y="16" fontSize="5.5" fill="currentColor" stroke="none" fontFamily="sans-serif">15</text>
            </svg>
          </button>

          <div className="vp-volume-group">
            <button className="vp-btn" onClick={toggleMute} title="Mute (m)"><VolumeIcon /></button>
            <input type="range" min="0" max="1" step="0.02"
              value={muted ? 0 : volume} onChange={handleVolumeChange} className="vp-volume-slider" />
          </div>

          <div className="vp-spacer" />

          {/* Set Intro button */}
          <button className="vp-btn vp-set-intro-btn" onClick={() => setSettingIntro(!settingIntro)} title="Set Intro Timestamps">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
            </svg>
          </button>

          <button className="vp-btn" onClick={toggleFullscreen} title="Fullscreen (f)">
            {document.fullscreenElement
              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
            }
          </button>
        </div>

        {/* Set Intro popup */}
        {settingIntro && (
          <div className="vp-intro-setter">
            <span className="vp-intro-setter-label">Intro end: {introEnd > 0 ? formatTime(introEnd) : "not set"}</span>
            <button className="vp-intro-setter-btn" onClick={() => { if (videoRef.current) setIntroEnd(videoRef.current.currentTime); }}>
              Mark Current as Intro End
            </button>
            <button className="vp-intro-setter-btn" onClick={() => { setIntroEnd(0); setSettingIntro(false); }}>Clear</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── GenreRow ──────────────────────────────────────────────────────────────

function GenreRow({ genre, items, scrollRow, onPlayItem, onInfo }: {
  genre: string;
  items: MediaItem[];
  scrollRow: (ref: React.RefObject<HTMLDivElement | null>, dir: "left" | "right") => void;
  onPlayItem: (item: MediaItem) => void;
  onInfo: (item: MediaItem) => void;
}) {
  const sliderRef = useRef<HTMLDivElement>(null);
  return (
    <div className="content-row">
      <h2 className="row-title">{genre}</h2>
      <div className="row-container">
        <button className="row-arrow left" onClick={() => scrollRow(sliderRef, "left")}>&#8249;</button>
        <div className="row-slider" ref={sliderRef}>
          {items.map((item, i) => (
            <MediaCard key={i} item={item} onPlayItem={onPlayItem} onInfo={onInfo} />
          ))}
        </div>
        <button className="row-arrow right" onClick={() => scrollRow(sliderRef, "right")}>&#8250;</button>
      </div>
    </div>
  );
}

// ─── MediaCard ─────────────────────────────────────────────────────────────

function MediaCard({ item, onPlayItem, onInfo }: {
  item: MediaItem;
  onPlayItem: (item: MediaItem) => void;
  onInfo: (item: MediaItem) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const posterSrc = item.poster_path && !imgError ? convertFileSrc(item.poster_path) : null;

  return (
    <div className="media-card" onClick={() => onInfo(item)}>
      {posterSrc ? (
        <img className="card-poster" src={posterSrc} alt={item.name} loading="lazy" onError={() => setImgError(true)} />
      ) : (
        <div className={`card-poster-fallback ${getGradient(item.name)}`}>
          <span className="card-fallback-title">{item.name}</span>
        </div>
      )}
      <div className="card-hover-info">
        <div className="card-hover-title">{item.name}</div>
        <div className="card-actions">
          <button className="card-action-btn play-btn" onClick={e => { e.stopPropagation(); onPlayItem(item); }} title="Play">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <button className="card-action-btn" title="Add to list" onClick={e => e.stopPropagation()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button className="card-action-btn expand-btn" title="More info" onClick={e => { e.stopPropagation(); onInfo(item); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
        <div className="card-meta">
          {item.rating && <span className="card-match">{Math.round(item.rating * 10)}% Match</span>}
          {(item.tmdb_year || item.year) && <span className="card-year">{item.tmdb_year || item.year}</span>}
          {item.quality && <span className="card-badge">{item.quality}</span>}
        </div>
        {item.genres && item.genres.length > 0 && (
          <div className="card-genres">
            {item.genres.slice(0, 3).map((g, i) => <span key={i} className="card-genre-dot">{g}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}
