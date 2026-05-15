import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { MediaItem, AppSettings } from "./types";
import { toPlaySrc, buildSeriesQueue } from "./utils";
import { loadAllProgress, type ProgressStore } from "./progressStore";
import { loadMyList, toggleMyList } from "./myList";
import { loadFirstSeen, trackNewItems, type FirstSeenStore } from "./recentlyAdded";
import Navbar from "./components/Navbar";
import Billboard from "./components/Billboard";
import GenreBar from "./components/GenreBar";
import Toast from "./components/Toast";
import ContentRows from "./components/ContentRows";
import MediaCard from "./components/MediaCard";
import DetailModal from "./components/DetailModal";
import SettingsModal from "./components/SettingsModal";
import VideoPlayer from "./components/VideoPlayer";
import SplashScreen from "./components/SplashScreen";
import ResumePrompt from "./components/ResumePrompt";
import "./App.css";

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
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
  const [searchTypeFilter, setSearchTypeFilter] = useState<"all" | "movie" | "series">("all");
  const [searchGenreFilter, setSearchGenreFilter] = useState<string | null>(null);
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
  const [playingInitialTime, setPlayingInitialTime] = useState(0);
  const [watchProgress, setWatchProgress] = useState<ProgressStore>(() => loadAllProgress());
  const [myList, setMyList] = useState<string[]>(() => loadMyList());
  const [firstSeenStore, setFirstSeenStore] = useState<FirstSeenStore>(() => loadFirstSeen());
  const [pendingPlay, setPendingPlay] = useState<{ item: MediaItem; startPath?: string; resumeAt: number } | null>(null);

  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 5000);
  }, []);

  // ─── Init & Effects ──────────────────────────────────────────────────────

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

  useEffect(() => {
    setSearchTypeFilter("all");
    setSearchGenreFilter(null);
  }, [searchQuery]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const scanLibrary = useCallback(async (folders: string[], apiKey: string | null) => {
    setLoading(true);
    try {
      const data = await invoke<MediaItem[]>("scan_folders", { folderPaths: folders });
      setLibrary(data);
      setFirstSeenStore(prev => trackNewItems(data, prev));
      if (apiKey) {
        const unfetched = data.filter(i => !i.tmdb_id);
        if (unfetched.length > 0) {
          setFetchProgress(0);
          try {
            await invoke("fetch_all_metadata", { items: unfetched, apiKey });
            const updated = await invoke<MediaItem[]>("scan_folders", { folderPaths: folders });
            setLibrary(updated);
            setFirstSeenStore(prev => trackNewItems(updated, prev));
          } catch (e) { console.error("Metadata fetch error:", e); }
          setFetchProgress(null);
        }
      }
    } catch (e) { console.error("Scan error:", e); }
    setLoading(false);
  }, []);

  // Internal: actually start playback (no resume check)
  const startPlayItem = useCallback(async (item: MediaItem, startPath?: string, resumeAt?: number) => {
    setPlayingItem(item);
    setPlayingInitialTime(resumeAt || 0);
    if (item.media_type === "movie") {
      const path = startPath || item.video_files[0];
      if (!path) return;
      setPlayingVideoPath(await toPlaySrc(path, null, resumeAt || null));
      setPlayingTitle(item.name);
      setPlayingQueue([{ path, title: item.name }]);
      setPlayingQueueIdx(0);
    } else {
      const q = buildSeriesQueue(item);
      if (q.length === 0) return;
      const idx = startPath ? Math.max(0, q.findIndex(e => e.path === startPath)) : 0;
      setPlayingVideoPath(await toPlaySrc(q[idx].path, null, resumeAt || null));
      setPlayingTitle(q[idx].title);
      setPlayingQueue(q);
      setPlayingQueueIdx(idx);
    }
  }, []);

  // Public: checks for saved progress and shows resume prompt if needed
  const handlePlayItem = useCallback(async (item: MediaItem, startPath?: string, resumeAt?: number) => {
    // If resumeAt is explicitly provided (e.g. from Continue Watching), play directly
    if (resumeAt !== undefined) {
      await startPlayItem(item, startPath, resumeAt);
      return;
    }

    const store = loadAllProgress();

    // Find saved progress for this item / path
    let savedPath: string | undefined = startPath;
    let savedTime = 0;

    if (item.media_type === "movie") {
      const path = startPath || item.video_files[0];
      if (path) {
        const rec = store[path];
        if (rec && rec.duration > 0) {
          const ratio = rec.progress / rec.duration;
          if (ratio > 0.03 && ratio < 0.95) { savedPath = path; savedTime = rec.progress; }
        }
      }
    } else {
      // For series: if startPath given check that episode; otherwise find most recent
      let bestAt = 0;
      for (const season of item.seasons) {
        for (const ep of season.episodes) {
          if (startPath && ep.path !== startPath) continue;
          const rec = store[ep.path];
          if (rec && rec.duration > 0) {
            const ratio = rec.progress / rec.duration;
            if (ratio > 0.03 && ratio < 0.95 && rec.updatedAt > bestAt) {
              bestAt = rec.updatedAt;
              savedPath = ep.path;
              savedTime = rec.progress;
            }
          }
        }
      }
    }

    if (savedTime > 0) {
      setPendingPlay({ item, startPath: savedPath, resumeAt: savedTime });
    } else {
      await startPlayItem(item, startPath, 0);
    }
  }, [startPlayItem]);

  const handleNext = useCallback(async () => {
    const nextIdx = playingQueueIdx + 1;
    if (nextIdx >= playingQueue.length) return;
    const next = playingQueue[nextIdx];
    setPlayingVideoPath(await toPlaySrc(next.path));
    setPlayingTitle(next.title);
    setPlayingQueueIdx(nextIdx);
  }, [playingQueueIdx, playingQueue]);

  const handleToggleMyList = useCallback((path: string) => {
    setMyList(prev => {
      const next = toggleMyList(prev, path);
      showToast(next.includes(path) ? "Added to My List" : "Removed from My List");
      return next;
    });
  }, [showToast]);

  const openSettings = () => { setSettingsDraft({ ...settings }); setShowSettings(true); };

  const addFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: "Select Media Folder" });
      if (selected && !settingsDraft.source_folders.includes(selected as string)) {
        setSettingsDraft(prev => ({ ...prev, source_folders: [...prev.source_folders, selected as string] }));
      }
    } catch (e) { console.error("Dialog error:", e); }
  };

  const addFolderPath = (path: string) => {
    if (!settingsDraft.source_folders.includes(path)) {
      setSettingsDraft(prev => ({ ...prev, source_folders: [...prev.source_folders, path] }));
    }
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

  const handleInfo = (item: MediaItem) => { setDetailItem(item); setSelectedSeason(item.seasons[0]?.number || 1); };

  const closePlayer = () => {
    setWatchProgress(loadAllProgress());
    setPlayingVideoPath(null); setPlayingQueue([]); setPlayingQueueIdx(0);
    setPlayingItem(null); setPlayingInitialTime(0);
  };

  // ─── Derived Data ────────────────────────────────────────────────────────

  const series = library.filter(i => i.media_type === "series");
  const movies = library.filter(i => i.media_type === "movie");
  const allGenres = Array.from(new Set(library.flatMap(i => i.genres || []))).sort();
  const filteredLibrary = activeGenre ? library.filter(i => i.genres?.includes(activeGenre)) : library;
  const itemsWithBackdrop = library.filter(i => i.backdrop_path);
  const billboardItem = itemsWithBackdrop.length > 0 ? itemsWithBackdrop[billboardIdx % itemsWithBackdrop.length] : library[0] || null;

  const baseSearchResults = searchQuery.trim()
    ? library.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];
  const searchResults = baseSearchResults.filter(i => {
    if (searchTypeFilter !== "all" && i.media_type !== searchTypeFilter) return false;
    if (searchGenreFilter && !i.genres?.includes(searchGenreFilter)) return false;
    return true;
  });
  const searchGenres = Array.from(new Set(baseSearchResults.flatMap(i => i.genres || []))).sort();

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      {fetchProgress !== null && (
        <div className="progress-bar"><div className="progress-fill" style={{ width: "60%" }} /></div>
      )}

      <Navbar
        scrolled={scrolled}
        activeFilter={activeFilter} setActiveFilter={setActiveFilter}
        searchOpen={searchOpen} setSearchOpen={setSearchOpen}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        onOpenSettings={openSettings}
      />

      {allGenres.length > 0 && !searchQuery.trim() && (
        <GenreBar allGenres={allGenres} activeGenre={activeGenre} setActiveGenre={setActiveGenre} scrolled={scrolled} />
      )}

      {toastMsg && <Toast message={toastMsg} />}

      {/* ─── Main Content ─── */}
      {searchQuery.trim() ? (
        <div className="search-results">
          <div className="search-results-title">Results for "{searchQuery}"</div>

          {/* Search filters */}
          <div className="search-filters">
            <div className="search-filter-group">
              {(["all", "movie", "series"] as const).map(t => (
                <button key={t} className={`search-filter-btn${searchTypeFilter === t ? " active" : ""}`}
                  onClick={() => setSearchTypeFilter(t)}>
                  {t === "all" ? "All" : t === "movie" ? "Movies" : "TV Shows"}
                </button>
              ))}
            </div>
            {searchGenres.length > 0 && (
              <div className="search-genre-pills">
                <button className={`search-filter-btn${!searchGenreFilter ? " active" : ""}`}
                  onClick={() => setSearchGenreFilter(null)}>All Genres</button>
                {searchGenres.map(g => (
                  <button key={g} className={`search-filter-btn${searchGenreFilter === g ? " active" : ""}`}
                    onClick={() => setSearchGenreFilter(searchGenreFilter === g ? null : g)}>{g}</button>
                ))}
              </div>
            )}
          </div>

          {searchResults.length === 0 ? (
            <div style={{ color: "var(--text-muted)", marginTop: 40 }}>No results found.</div>
          ) : (
            <div className="search-grid">
              {searchResults.map((item, i) => (
                <MediaCard key={i} item={item}
                  progress={watchProgress[item.video_files[0]]?.progress && watchProgress[item.video_files[0]]?.duration
                    ? watchProgress[item.video_files[0]].progress / watchProgress[item.video_files[0]].duration
                    : undefined}
                  inMyList={myList.includes(item.path)}
                  onToggleMyList={handleToggleMyList}
                  onPlayItem={handlePlayItem} onInfo={handleInfo} />
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
          {billboardItem && (
            <Billboard item={billboardItem} onPlay={handlePlayItem} onInfo={handleInfo} />
          )}
          <ContentRows
            activeFilter={activeFilter}
            series={series} movies={movies}
            allGenres={allGenres} activeGenre={activeGenre}
            filteredLibrary={filteredLibrary}
            watchProgress={watchProgress}
            myList={myList} firstSeenStore={firstSeenStore}
            onPlayItem={handlePlayItem} onInfo={handleInfo}
            onToggleMyList={handleToggleMyList}
          />
        </>
      )}

      {/* ─── Modals ─── */}
      {detailItem && (
        <DetailModal
          item={detailItem}
          selectedSeason={selectedSeason} setSelectedSeason={setSelectedSeason}
          onClose={() => setDetailItem(null)}
          onPlay={handlePlayItem}
          inMyList={myList.includes(detailItem.path)}
          onToggleMyList={handleToggleMyList}
        />
      )}

      {showSettings && (
        <SettingsModal
          settingsDraft={settingsDraft} setSettingsDraft={setSettingsDraft}
          showApiKey={showApiKey} setShowApiKey={setShowApiKey}
          onClose={() => setShowSettings(false)}
          onSave={saveSettings}
          onAddFolder={addFolder} onAddFolderPath={addFolderPath} onRemoveFolder={removeFolder}
        />
      )}

      {pendingPlay && (
        <ResumePrompt
          item={pendingPlay.item}
          resumeAt={pendingPlay.resumeAt}
          onResume={() => { const p = pendingPlay; setPendingPlay(null); startPlayItem(p.item, p.startPath, p.resumeAt); }}
          onPlayFromBeginning={() => { const p = pendingPlay; setPendingPlay(null); startPlayItem(p.item, p.startPath, 0); }}
          onClose={() => setPendingPlay(null)}
        />
      )}

      {playingVideoPath && (
        <VideoPlayer
          src={playingVideoPath}
          rawPath={playingQueue[playingQueueIdx]?.path}
          title={playingTitle}
          initialTime={playingInitialTime}
          onClose={closePlayer}
          onNext={playingQueueIdx < playingQueue.length - 1 ? handleNext : undefined}
          nextTitle={playingQueue[playingQueueIdx + 1]?.title}
          playingItem={playingItem}
          apiKey={settings.tmdb_api_key}
          onShowDetail={(item) => { closePlayer(); setDetailItem(item); setSelectedSeason(item.seasons[0]?.number || 1); }}
          onToast={showToast}
          onAudioChange={async (audioIdx, start) => {
            const path = playingQueue[playingQueueIdx]?.path;
            if (path) setPlayingVideoPath(await toPlaySrc(path, audioIdx, start));
          }}
        />
      )}
    </div>
  );
}
