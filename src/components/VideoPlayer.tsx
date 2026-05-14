import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { MediaItem, TmdbRecommendation, MediaInfo, MediaChapter, MpvTrack } from "../types";
import { saveWatchRecord } from "../progressStore";

const getTrackLabel = (track: MpvTrack, fallbackIndex: number, type: "Audio" | "Subtitle"): string => {
  let name: string;
  try {
    name =
      track.lang && track.lang !== "und"
        ? new Intl.DisplayNames(["en"], { type: "language" }).of(track.lang) || track.lang.toUpperCase()
        : `${type} Track ${fallbackIndex + 1}`;
  } catch {
    name = `${type} Track ${fallbackIndex + 1}`;
  }
  if (track.title && track.title.length < 30 && !track.title.match(/http|\.com|\.cc|\.net/i)) {
    name += ` - ${track.title}`;
  } else if (track.codec) {
    const codecMap: Record<string, string> = {
      subrip: "SRT", aac: "AAC", ac3: "AC3", eac3: "E-AC3",
      dts: "DTS", truehd: "TrueHD", flac: "FLAC", ass: "ASS",
      hdmv_pgs_subtitle: "PGS", hdmv_pgs: "PGS", opus: "Opus", vorbis: "Vorbis",
    };
    name += ` [${codecMap[track.codec] || track.codec.toUpperCase()}]`;
  }
  return name;
};

interface VideoPlayerProps {
  src: string;           // kept for interface compat — mpv uses rawPath instead
  rawPath: string;
  title: string;
  initialTime?: number;
  onClose: () => void;
  onNext?: () => void;
  nextTitle?: string;
  playingItem?: MediaItem | null;
  apiKey?: string | null;
  onShowDetail?: (item: MediaItem) => void;
  onToast?: (msg: string) => void;
  onAudioChange?: (audioIdx: number, start?: number) => void; // kept for compat, not called
}

export default function VideoPlayer({
  rawPath, title, initialTime, onClose, onNext, nextTitle,
  playingItem, apiKey, onShowDetail, onToast,
}: VideoPlayerProps) {
  // ── mpv-driven state ─────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [mpvFullscreen, setMpvFullscreen] = useState(false);
  const [mpvTracks, setMpvTracks] = useState<MpvTrack[]>([]);
  const [currentAudioId, setCurrentAudioId] = useState<number | null>(null);
  const [currentSubtitleId, setCurrentSubtitleId] = useState<number | null>(null);

  // ── UI state (unchanged from HTML5 version) ───────────────────────────────
  const [showControls, setShowControls] = useState(true);
  const [centerIcon, setCenterIcon] = useState<string | null>(null);
  const [showUpNext, setShowUpNext] = useState(false);
  const [upNextCountdown, setUpNextCountdown] = useState(10);
  const [showIntroBtn, setShowIntroBtn] = useState(false);
  const [introEnd, setIntroEnd] = useState(0);
  const [settingIntro, setSettingIntro] = useState(false);
  const [recommendations, setRecommendations] = useState<TmdbRecommendation[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [introChapter, setIntroChapter] = useState<MediaChapter | null>(null);
  const [creditsChapter, setCreditsChapter] = useState<MediaChapter | null>(null);
  const [showTracks, setShowTracks] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const playerRef = useRef<HTMLDivElement>(null);
  const progressTrackRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const centerTimerRef = useRef<number | null>(null);
  const upNextShownRef = useRef(false);
  const dismissedUpNextRef = useRef(false);
  const suggestionsShownRef = useRef(false);
  const isSeekingRef = useRef(false);
  const prevVolumeRef = useRef(1);

  // Stable refs — let zero-dep effects and keyboard handler read current values
  const rawPathRef = useRef(rawPath);
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const playingRef = useRef(true);
  const mutedRef = useRef(false);
  const volumeRef = useRef(1);
  const mpvFullscreenRef = useRef(false);
  const onNextRef = useRef(onNext);
  const onCloseRef = useRef(onClose);
  const initialTimeRef = useRef(initialTime || 0);

  useEffect(() => { rawPathRef.current = rawPath; }, [rawPath]);
  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { mpvFullscreenRef.current = mpvFullscreen; }, [mpvFullscreen]);
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { initialTimeRef.current = initialTime || 0; }, [initialTime]);

  // ── Progress saving (uses refs — no stale closures) ───────────────────────
  const saveCurrentProgress = useCallback(() => {
    const pos = positionRef.current;
    const dur = durationRef.current;
    if (dur > 0 && pos > 2) {
      saveWatchRecord(rawPathRef.current, { progress: pos, duration: dur, updatedAt: Date.now() });
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(saveCurrentProgress, 5000);
    return () => clearInterval(id);
  }, [saveCurrentProgress]);

  useEffect(() => () => { saveCurrentProgress(); }, [saveCurrentProgress]);

  // ── Open mpv whenever rawPath changes (including initial mount) ───────────
  useEffect(() => {
    // Reset everything for the new file
    setPosition(0); positionRef.current = 0;
    setDuration(0); durationRef.current = 0;
    setMpvTracks([]); setCurrentAudioId(null); setCurrentSubtitleId(null);
    setPlaying(true); setIsBuffering(true); setHasError(false); setErrorMsg("");
    setShowUpNext(false); setUpNextCountdown(10); setShowIntroBtn(false);
    setShowSuggestions(false); setRecommendations([]); setShowTracks(false);
    upNextShownRef.current = false;
    dismissedUpNextRef.current = false;
    suggestionsShownRef.current = false;
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 3500);

    const startSec = initialTimeRef.current;
    invoke<void>("mpv_open", {
      path: rawPath,
      start: startSec > 0.5 ? startSec : null,
      sid: -1, // subtitles off by default; user selects via track panel
    }).catch((e: unknown) => {
      const msg = String(e);
      setHasError(true);
      setErrorMsg(msg.includes("mpv") ? msg : "Failed to start mpv. Install it with: sudo apt install mpv");
      setIsBuffering(false);
      if (onToast) onToast("mpv not found — install mpv to play media.");
    });
  }, [rawPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop mpv when the player is closed ───────────────────────────────────
  useEffect(() => {
    return () => {
      invoke("mpv_stop").catch(() => {});
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      if (centerTimerRef.current) clearTimeout(centerTimerRef.current);
    };
  }, []);

  // ── mpv IPC event subscriptions (registered once, use refs for callbacks) ─
  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen<number>("mpv://position", ({ payload }) => {
      positionRef.current = payload;
      if (!isSeekingRef.current) setPosition(payload);
      setIsBuffering(false);
    }).then(fn => unlisteners.push(fn));

    listen<number>("mpv://duration", ({ payload }) => {
      durationRef.current = payload;
      setDuration(payload);
    }).then(fn => unlisteners.push(fn));

    listen<boolean>("mpv://paused", ({ payload }) => {
      setPlaying(!payload);
    }).then(fn => unlisteners.push(fn));

    listen<null>("mpv://ended", () => {
      saveCurrentProgress();
      if (onNextRef.current) {
        onNextRef.current();
      } else if (!suggestionsShownRef.current) {
        suggestionsShownRef.current = true;
        setShowSuggestions(true);
      }
    }).then(fn => unlisteners.push(fn));

    listen<boolean>("mpv://buffering", ({ payload }) => {
      if (payload) setIsBuffering(true);
    }).then(fn => unlisteners.push(fn));

    listen<MpvTrack[]>("mpv://track-list", ({ payload }) => {
      if (!Array.isArray(payload)) return;
      setMpvTracks(payload);
      const audioSel = payload.find(t => t.type === "audio" && t.selected);
      if (audioSel) setCurrentAudioId(audioSel.id);
      const subSel = payload.find(t => t.type === "sub" && t.selected);
      setCurrentSubtitleId(subSel?.id ?? null);
    }).then(fn => unlisteners.push(fn));

    listen<boolean>("mpv://fullscreen", ({ payload }) => {
      setMpvFullscreen(payload);
      mpvFullscreenRef.current = payload;
    }).then(fn => unlisteners.push(fn));

    listen<number>("mpv://volume", ({ payload }) => {
      setVolume(payload);
      volumeRef.current = payload;
      setMuted(payload === 0);
    }).then(fn => unlisteners.push(fn));

    return () => unlisteners.forEach(fn => fn());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chapters via ffprobe (FFmpeg utilities preserved) ─────────────────────
  useEffect(() => {
    if (!rawPath) return;
    invoke<MediaInfo>("get_media_info", { path: rawPath })
      .then(info => {
        let intro = info.chapters.find(c => c.title && /^(intro|opening|op\b)/i.test(c.title));
        let credits = info.chapters.find(c => c.title && /^(credits|ending|ed\b|outro)/i.test(c.title));
        if (info.chapters.length > 1) {
          if (!credits) credits = info.chapters[info.chapters.length - 1];
          if (!intro) {
            const first = info.chapters[0];
            if (first.end_time - first.start_time < 300) intro = first;
          }
        }
        setIntroChapter(intro ?? null);
        setCreditsChapter(credits ?? null);
      })
      .catch(() => {});
  }, [rawPath]);

  // ── Skip Intro / Up Next driven by position ───────────────────────────────
  useEffect(() => {
    if (introChapter && position >= introChapter.start_time && position < introChapter.end_time) {
      setShowIntroBtn(true);
    } else if (introEnd > 0 && position < introEnd) {
      setShowIntroBtn(true);
    } else {
      setShowIntroBtn(false);
    }

    const isCreditsTime = creditsChapter
      ? position >= creditsChapter.start_time
      : duration > 60 && duration - position <= 30;

    if (isCreditsTime && duration > 0 && !upNextShownRef.current && !dismissedUpNextRef.current) {
      upNextShownRef.current = true;
      if (onNext) {
        setShowUpNext(true);
        setUpNextCountdown(10);
      } else if (!suggestionsShownRef.current) {
        suggestionsShownRef.current = true;
        setShowSuggestions(true);
      }
    }
  }, [position, duration, introChapter, creditsChapter, introEnd, onNext]);

  // ── Up Next countdown ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!showUpNext || !onNext) return;
    if (upNextCountdown <= 0) { onNext(); return; }
    const t = window.setTimeout(() => setUpNextCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [showUpNext, upNextCountdown, onNext]);

  // ── Recommendations ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!showSuggestions || !playingItem?.tmdb_id || !apiKey) return;
    invoke<TmdbRecommendation[]>("fetch_recommendations", {
      tmdbId: playingItem.tmdb_id, mediaType: playingItem.media_type, apiKey,
    }).then(setRecommendations).catch(() => {});
  }, [showSuggestions, playingItem, apiKey]);

  // ── Controls hide timer ───────────────────────────────────────────────────
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 3000);
  }, []);

  // ── Keyboard shortcuts (stable, use refs — no re-registration on state Δ) ─
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      switch (e.key) {
        case " ":
        case "k": {
          e.preventDefault();
          const p = playingRef.current;
          invoke("mpv_set_paused", { paused: p });
          setPlaying(!p);
          setCenterIcon(p ? "▶" : "⏸");
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const t = Math.max(0, positionRef.current - 15);
          invoke("mpv_seek", { position: t });
          setPosition(t); positionRef.current = t;
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const t = positionRef.current + 15;
          invoke("mpv_seek", { position: t });
          setPosition(t); positionRef.current = t;
          break;
        }
        case "m": {
          e.preventDefault();
          const m = mutedRef.current;
          const v = volumeRef.current;
          setMuted(!m);
          invoke("mpv_set_volume", { volume: m ? v : 0 });
          break;
        }
        case "f": {
          e.preventDefault();
          invoke("mpv_set_fullscreen", { fullscreen: !mpvFullscreenRef.current });
          break;
        }
        case "n": {
          if (onNextRef.current) { e.preventDefault(); onNextRef.current(); }
          break;
        }
        case "Escape": {
          onCloseRef.current();
          break;
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────
  const flashCenter = (icon: string) => {
    setCenterIcon(icon);
    if (centerTimerRef.current) clearTimeout(centerTimerRef.current);
    centerTimerRef.current = window.setTimeout(() => setCenterIcon(null), 700);
  };

  const togglePlay = useCallback(() => {
    const pausing = playing;
    invoke("mpv_set_paused", { paused: pausing });
    setPlaying(!pausing);
    flashCenter(pausing ? "▶" : "⏸");
  }, [playing]);

  const toggleMute = useCallback(() => {
    if (muted) {
      const v = prevVolumeRef.current;
      setMuted(false); setVolume(v);
      invoke("mpv_set_volume", { volume: v });
    } else {
      prevVolumeRef.current = volume;
      setMuted(true);
      invoke("mpv_set_volume", { volume: 0 });
    }
  }, [muted, volume]);

  const toggleFullscreen = useCallback(() => {
    invoke("mpv_set_fullscreen", { fullscreen: !mpvFullscreen });
  }, [mpvFullscreen]);

  const skip = useCallback((amount: number) => {
    const t = Math.max(0, position + amount);
    invoke("mpv_seek", { position: t });
    setPosition(t); positionRef.current = t;
  }, [position]);

  const seekToPosition = (clientX: number) => {
    if (!progressTrackRef.current || duration <= 0) return;
    const rect = progressTrackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    invoke("mpv_seek", { position: newTime });
    setPosition(newTime); positionRef.current = newTime;
  };

  const handleSeekMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isSeekingRef.current = true;
    seekToPosition(e.clientX);
    const onMove = (ev: MouseEvent) => seekToPosition(ev.clientX);
    const onUp = () => {
      isSeekingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (val > 0) prevVolumeRef.current = val;
    setVolume(val); setMuted(val === 0);
    invoke("mpv_set_volume", { volume: val });
  };

  const formatTime = (sec: number) => {
    if (!isFinite(sec) || isNaN(sec)) return "0:00";
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const VolumeIcon = () => {
    if (muted || volume === 0) return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    );
    if (volume < 0.5) return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 010 7.07" />
      </svg>
    );
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 010 14.14" /><path d="M15.54 8.46a5 5 0 010 7.07" />
      </svg>
    );
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const progressPct = duration > 0 ? (position / duration) * 100 : 0;
  const timeLeft = duration > 0 ? duration - position : 0;
  const isEndscreenActive = showUpNext || showSuggestions;
  const audioTracks = mpvTracks.filter(t => t.type === "audio");
  const subtitleTracks = mpvTracks.filter(t => t.type === "sub");
  const backdropSrc = playingItem?.backdrop_path ? convertFileSrc(playingItem.backdrop_path) : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={playerRef}
      className={`video-player-overlay ${showControls && !isEndscreenActive ? "controls-active" : "controls-hidden"} ${isEndscreenActive ? "vp-endscreen-active" : ""}`}
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => {
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 1000);
      }}
    >
      {/* ── mpv backdrop: replaces <video>, shows artwork while mpv plays in its window ── */}
      <div
        className="mpv-backdrop"
        style={backdropSrc ? { backgroundImage: `url("${backdropSrc}")` } : {}}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
      />

      {centerIcon && <div className="vp-center-action">{centerIcon}</div>}
      {isBuffering && !hasError && <div className="vp-buffering"><div className="vp-spinner" /></div>}

      {hasError && (
        <div className="vp-error">
          <div className="vp-error-icon">⚠</div>
          <div className="vp-error-msg">{errorMsg || "mpv failed to start."}</div>
          <div className="vp-error-hint" style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 8 }}>
            Install mpv: <code style={{ background: "#111", padding: "2px 6px", borderRadius: 4 }}>sudo apt install mpv</code>
          </div>
          <button className="vp-error-btn" onClick={onClose}>Close Player</button>
        </div>
      )}

      {/* Skip Intro */}
      {showIntroBtn && (
        <button className="skip-intro-btn" onClick={() => {
          const target = introChapter ? introChapter.end_time : introEnd;
          invoke("mpv_seek", { position: target });
          setPosition(target);
          setShowIntroBtn(false);
        }}>
          Skip Intro
        </button>
      )}

      {/* Endscreen */}
      {isEndscreenActive && (
        <div className="endscreen-container">
          <button className="vp-back-btn" onClick={onClose} style={{ position: "absolute", top: 40, left: 40, zIndex: 100 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>

          {showUpNext && onNext && nextTitle && (
            <div className="endscreen-up-next">
              <div className="endscreen-up-next-label">Up Next in {upNextCountdown}s</div>
              <div className="endscreen-up-next-title">{nextTitle}</div>
              <div className="endscreen-up-next-desc">The next episode is starting automatically.</div>
              <div className="endscreen-actions">
                <button className="endscreen-btn endscreen-btn-play" onClick={onNext}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  Play Next
                </button>
                <button className="endscreen-btn endscreen-btn-credits" onClick={() => { setShowUpNext(false); dismissedUpNextRef.current = true; }}>
                  Watch Credits
                </button>
              </div>
            </div>
          )}

          {showSuggestions && !onNext && (
            <div className="endscreen-recommendations">
              <div className="endscreen-rec-title">More Like This</div>
              {recommendations.length > 0 ? (
                <div className="endscreen-rec-grid">
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
                      {rec.poster_url
                        ? <img className="suggestion-poster" src={rec.poster_url} alt={rec.title} loading="lazy" />
                        : <div className="suggestion-poster-fallback">{rec.title}</div>
                      }
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
                <div style={{ color: "var(--text-muted)", fontSize: "1.2rem" }}>Loading recommendations...</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Top and Bottom bars (hidden during endscreen) */}
      {!isEndscreenActive && (
        <>
          {/* Top bar */}
          <div className="vp-top-bar">
            <button className="vp-back-btn" onClick={onClose}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
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
                {formatTime(position)} / {formatTime(duration)}
                {timeLeft > 0 && duration > 0 && <span className="vp-time-remaining"> −{formatTime(timeLeft)}</span>}
              </div>
            </div>

            <div className="vp-controls-row">
              {/* Play / Pause */}
              <button className="vp-btn" onClick={togglePlay} title={playing ? "Pause (k)" : "Play (k)"}>
                {playing
                  ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                  : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                }
              </button>

              {/* Next episode */}
              {onNext && (
                <button className="vp-btn" onClick={onNext} title="Next Episode (n)">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 4 15 12 5 20 5 4" /><rect x="17" y="4" width="2.5" height="16" rx="1" />
                  </svg>
                </button>
              )}

              {/* Skip -15 */}
              <button className="vp-btn" onClick={() => skip(-15)} title="Rewind 15s (←)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
                  <text x="7" y="16" fontSize="5.5" fill="currentColor" stroke="none" fontFamily="sans-serif">15</text>
                </svg>
              </button>

              {/* Skip +15 */}
              <button className="vp-btn" onClick={() => skip(15)} title="Forward 15s (→)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                  <text x="7" y="16" fontSize="5.5" fill="currentColor" stroke="none" fontFamily="sans-serif">15</text>
                </svg>
              </button>

              {/* Volume */}
              <div className="vp-volume-group">
                <button className="vp-btn" onClick={toggleMute} title="Mute (m)"><VolumeIcon /></button>
                <input type="range" min="0" max="1" step="0.02"
                  value={muted ? 0 : volume} onChange={handleVolumeChange} className="vp-volume-slider" />
              </div>

              <div className="vp-spacer" />

              {/* Audio & Subtitle track selector */}
              {(audioTracks.length > 0 || subtitleTracks.length > 0) && (
                <div className="vp-tracks-container" style={{ position: "relative" }}>
                  <button className="vp-btn" onClick={() => setShowTracks(!showTracks)} title="Audio & Subtitles">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                  </button>
                  {showTracks && (
                    <div className="vp-tracks-popup">
                      {audioTracks.length > 0 && (
                        <div className="vp-tracks-column">
                          <div className="vp-tracks-header">Audio</div>
                          {audioTracks.map((t, i) => (
                            <div
                              key={t.id}
                              className={`vp-track-item ${currentAudioId === t.id ? "active" : ""}`}
                              onClick={() => {
                                invoke("mpv_set_audio_track", { id: t.id });
                                setCurrentAudioId(t.id);
                                setShowTracks(false);
                              }}
                            >
                              {currentAudioId === t.id && <span className="vp-track-check">✓</span>}
                              {getTrackLabel(t, i, "Audio")}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="vp-tracks-column">
                        <div className="vp-tracks-header">Subtitles</div>
                        <div
                          className={`vp-track-item ${currentSubtitleId === null ? "active" : ""}`}
                          onClick={() => { invoke("mpv_set_subtitle_track", { id: -1 }); setCurrentSubtitleId(null); setShowTracks(false); }}
                        >
                          {currentSubtitleId === null && <span className="vp-track-check">✓</span>}
                          Off
                        </div>
                        {subtitleTracks.map((t, i) => (
                          <div
                            key={t.id}
                            className={`vp-track-item ${currentSubtitleId === t.id ? "active" : ""}`}
                            onClick={() => {
                              invoke("mpv_set_subtitle_track", { id: t.id });
                              setCurrentSubtitleId(t.id);
                              setShowTracks(false);
                            }}
                          >
                            {currentSubtitleId === t.id && <span className="vp-track-check">✓</span>}
                            {getTrackLabel(t, i, "Subtitle")}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Set Intro button */}
              <button className="vp-btn vp-set-intro-btn" onClick={() => setSettingIntro(!settingIntro)} title="Set Intro Timestamps">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
                </svg>
              </button>

              {/* Fullscreen (controls mpv's window) */}
              <button className="vp-btn" onClick={toggleFullscreen} title="Toggle mpv Fullscreen (f)">
                {mpvFullscreen
                  ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" /></svg>
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" /></svg>
                }
              </button>
            </div>

            {settingIntro && (
              <div className="vp-intro-setter">
                <span className="vp-intro-setter-label">Intro end: {introEnd > 0 ? formatTime(introEnd) : "not set"}</span>
                <button className="vp-intro-setter-btn" onClick={() => setIntroEnd(position)}>
                  Mark Current as Intro End
                </button>
                <button className="vp-intro-setter-btn" onClick={() => { setIntroEnd(0); setSettingIntro(false); }}>Clear</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
