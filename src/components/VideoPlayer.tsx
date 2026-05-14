import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MediaItem, TmdbRecommendation, MediaInfo, MediaChapter } from "../types";
import { toPlaySrc } from "../utils";
import { saveWatchRecord } from "../progressStore";
import {
  MediaController,
  MediaControlBar,
  MediaPlayButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaMuteButton,
  MediaVolumeRange,
  MediaTimeRange,
  MediaTimeDisplay,
  MediaFullscreenButton,
  MediaLoadingIndicator,
} from "media-chrome/react";

interface VideoPlayerProps {
  src: string;
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
  onAudioChange?: (audioIdx: number, start?: number) => void;
}

export default function VideoPlayer({
  rawPath, title, initialTime, onClose, onNext, nextTitle,
  playingItem, apiKey, onShowDetail, onToast,
}: VideoPlayerProps) {
  // ── Core state ───────────────────────────────────────────────────────────
  const [activeSrc, setActiveSrc] = useState<string | null>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [audioIdx, setAudioIdx] = useState(0);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // ── UI state ─────────────────────────────────────────────────────────────
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

  // ── Refs ─────────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const centerTimerRef = useRef<number | null>(null);
  const upNextShownRef = useRef(false);
  const dismissedUpNextRef = useRef(false);
  const suggestionsShownRef = useRef(false);
  const seekAfterLoadRef = useRef<number | null>(null);

  // Stable refs so zero-dep effects read current values without re-registering
  const rawPathRef = useRef(rawPath);
  const onNextRef = useRef(onNext);
  const onCloseRef = useRef(onClose);
  const initialTimeRef = useRef(initialTime || 0);

  useEffect(() => { rawPathRef.current = rawPath; }, [rawPath]);
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { initialTimeRef.current = initialTime || 0; }, [initialTime]);

  // ── Progress saving ───────────────────────────────────────────────────────
  const saveCurrentProgress = useCallback(() => {
    const vid = videoRef.current;
    if (vid && vid.duration > 0 && vid.currentTime > 2) {
      saveWatchRecord(rawPathRef.current, {
        progress: vid.currentTime,
        duration: vid.duration,
        updatedAt: Date.now(),
      });
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(saveCurrentProgress, 5000);
    return () => clearInterval(id);
  }, [saveCurrentProgress]);
  useEffect(() => () => { saveCurrentProgress(); }, [saveCurrentProgress]);

  // ── Build activeSrc when rawPath changes ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    // Reset state for the new file
    setActiveSrc(null);
    setHasError(false);
    setErrorMsg("");
    setPosition(0);
    setDuration(0);
    setAudioIdx(0);
    setMediaInfo(null);
    setShowUpNext(false);
    setUpNextCountdown(10);
    setShowIntroBtn(false);
    setShowSuggestions(false);
    setRecommendations([]);
    setShowTracks(false);
    upNextShownRef.current = false;
    dismissedUpNextRef.current = false;
    suggestionsShownRef.current = false;
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 3500);

    toPlaySrc(rawPath, null, null).then(src => {
      if (!cancelled) setActiveSrc(src);
    });
    return () => { cancelled = true; };
  }, [rawPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Audio track switch — rebuild src and seek to saved position ───────────
  const handleAudioChange = useCallback(async (idx: number) => {
    const savedTime = videoRef.current?.currentTime || 0;
    seekAfterLoadRef.current = savedTime;
    setAudioIdx(idx);
    const src = await toPlaySrc(rawPath, idx === 0 ? null : idx, null);
    setActiveSrc(src);
    setShowTracks(false);
  }, [rawPath]);

  // ── Subtitle track handler (external .srt or subtitle endpoint) ───────────
  const [activeSubIdx, setActiveSubIdx] = useState<number | null>(null);
  const handleSubtitleChange = useCallback((idx: number | null) => {
    setActiveSubIdx(idx);
    setShowTracks(false);
  }, []);

  // ── Chapters via ffprobe ──────────────────────────────────────────────────
  useEffect(() => {
    if (!rawPath) return;
    invoke<MediaInfo>("get_media_info", { path: rawPath })
      .then(info => {
        setMediaInfo(info);
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

  // ── Video element event handlers ──────────────────────────────────────────
  const handleLoadedMetadata = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    setDuration(vid.duration);
    const startAt = seekAfterLoadRef.current ?? initialTimeRef.current;
    if (startAt > 0.5) vid.currentTime = startAt;
    seekAfterLoadRef.current = null;
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const vid = videoRef.current;
    if (vid) setPosition(vid.currentTime);
  }, []);

  const handleEnded = useCallback(() => {
    saveCurrentProgress();
    if (onNextRef.current) {
      onNextRef.current();
    } else if (!suggestionsShownRef.current) {
      suggestionsShownRef.current = true;
      setShowSuggestions(true);
    }
  }, [saveCurrentProgress]);

  const handleVideoError = useCallback(() => {
    const vid = videoRef.current;
    const msg = vid?.error?.message || "Failed to load video.";
    setHasError(true);
    setErrorMsg(msg);
    if (onToast) onToast("Video failed to load — check the file path or FFmpeg.");
  }, [onToast]);

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

  // ── Controls autohide ─────────────────────────────────────────────────────
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 3000);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const vid = videoRef.current;
      if (!vid) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          if (vid.paused) vid.play();
          else vid.pause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          vid.currentTime = Math.max(0, vid.currentTime - 15);
          setCenterIcon("⏪");
          if (centerTimerRef.current) clearTimeout(centerTimerRef.current);
          centerTimerRef.current = window.setTimeout(() => setCenterIcon(null), 700);
          break;
        case "ArrowRight":
          e.preventDefault();
          vid.currentTime += 15;
          setCenterIcon("⏩");
          if (centerTimerRef.current) clearTimeout(centerTimerRef.current);
          centerTimerRef.current = window.setTimeout(() => setCenterIcon(null), 700);
          break;
        case "m":
          e.preventDefault();
          vid.muted = !vid.muted;
          break;
        case "f":
          e.preventDefault();
          if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
          else document.exitFullscreen?.();
          break;
        case "n":
          if (onNextRef.current) { e.preventDefault(); onNextRef.current(); }
          break;
        case "Escape":
          onCloseRef.current();
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isEndscreenActive = showUpNext || showSuggestions;
  const audioStreams = mediaInfo?.streams.filter(s => s.codec_type === "audio") ?? [];
  const subtitleStreams = mediaInfo?.streams.filter(s => s.codec_type === "subtitle") ?? [];
  const timeLeft = duration > 0 ? duration - position : 0;

  const formatTime = (sec: number) => {
    if (!isFinite(sec) || isNaN(sec)) return "0:00";
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const getStreamLabel = (s: typeof audioStreams[number], idx: number, type: string) => {
    const lang = s.language && s.language !== "und"
      ? (new Intl.DisplayNames(["en"], { type: "language" }).of(s.language) || s.language.toUpperCase())
      : `${type} ${idx + 1}`;
    return s.title ? `${lang} — ${s.title}` : lang;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <MediaController
      className={`video-player-overlay mc-player ${showControls && !isEndscreenActive ? "controls-active" : "controls-hidden"} ${isEndscreenActive ? "vp-endscreen-active" : ""}`}
      autohide="-1"
      gestures-disabled=""
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => {
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 1000);
      }}
    >
      {/* ── Actual video element (rendered inside MC shadow DOM) ── */}
      <video
        ref={videoRef}
        slot="media"
        src={activeSrc || undefined}
        playsInline
        crossOrigin="anonymous"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleVideoError}
      >
        {/* Subtitle track via the FFmpeg subtitle endpoint */}
        {activeSubIdx !== null && (
          <track
            key={activeSubIdx}
            kind="subtitles"
            src={`http://127.0.0.1:1421/subtitle?path=${encodeURIComponent(rawPath)}&s=${activeSubIdx}`}
            default
          />
        )}
      </video>

      {/* ── Media Chrome loading indicator (built-in) ── */}
      <MediaLoadingIndicator slot="centered-chrome" className="mc-loading-indicator" />

      {/* ── Center flash icon ── */}
      {centerIcon && (
        <div className="vp-center-action" slot="centered-chrome">{centerIcon}</div>
      )}

      {/* ── Error overlay ── */}
      {hasError && (
        <div className="vp-error">
          <div className="vp-error-icon">⚠</div>
          <div className="vp-error-msg">{errorMsg || "Video failed to load."}</div>
          <div className="vp-error-hint">
            Make sure FFmpeg is installed: <code>sudo apt install ffmpeg</code>
          </div>
          <button className="vp-error-btn" onClick={onClose}>Close Player</button>
        </div>
      )}

      {/* ── Skip Intro button ── */}
      {showIntroBtn && (
        <button className="skip-intro-btn" onClick={() => {
          const target = introChapter ? introChapter.end_time : introEnd;
          if (videoRef.current) videoRef.current.currentTime = target;
          setShowIntroBtn(false);
        }}>
          Skip Intro
        </button>
      )}

      {/* ── Endscreen ── */}
      {isEndscreenActive && (
        <div className="endscreen-container">
          <button className="vp-back-btn" onClick={onClose}
            style={{ position: "absolute", top: 40, left: 40, zIndex: 100 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {showUpNext && onNext && nextTitle && (
            <div className="endscreen-up-next">
              <div className="endscreen-up-next-label">Up Next in {upNextCountdown}s</div>
              <div className="endscreen-up-next-title">{nextTitle}</div>
              <div className="endscreen-up-next-desc">The next episode is starting automatically.</div>
              <div className="endscreen-actions">
                <button className="endscreen-btn endscreen-btn-play" onClick={onNext}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Play Next
                </button>
                <button className="endscreen-btn endscreen-btn-credits"
                  onClick={() => { setShowUpNext(false); dismissedUpNextRef.current = true; }}>
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
                <div style={{ color: "var(--text-muted)", fontSize: "1.2rem" }}>
                  Loading recommendations...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Top bar ── */}
      {!isEndscreenActive && (
        <div slot="top-chrome" className="vp-top-bar">
          <button className="vp-back-btn" onClick={onClose}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          {title && <div className="vp-title">{title}</div>}
          {timeLeft > 0 && duration > 0 && (
            <div className="vp-time-remaining-top">−{formatTime(timeLeft)}</div>
          )}
        </div>
      )}

      {/* ── Bottom Media Chrome control bar ── */}
      {!isEndscreenActive && (
        <MediaControlBar className="mc-control-bar">
          <MediaPlayButton className="mc-btn" />

          {onNext && (
            <button className="mc-btn mc-next-btn vp-btn" onClick={onNext} title="Next Episode (n)">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 4 15 12 5 20 5 4" />
                <rect x="17" y="4" width="2.5" height="16" rx="1" />
              </svg>
            </button>
          )}

          <MediaSeekBackwardButton className="mc-btn" seekOffset={15} />
          <MediaSeekForwardButton className="mc-btn" seekOffset={15} />

          <MediaMuteButton className="mc-btn" />
          <MediaVolumeRange className="mc-volume" />

          <MediaTimeDisplay className="mc-time" />
          <MediaTimeRange className="mc-time-range" />

          {/* Track selector */}
          {(audioStreams.length > 1 || subtitleStreams.length > 0) && (
            <div className="vp-tracks-container mc-tracks">
              <button className="mc-btn vp-btn" onClick={() => setShowTracks(t => !t)}
                title="Audio & Subtitles">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </button>
              {showTracks && (
                <div className="vp-tracks-popup">
                  {audioStreams.length > 1 && (
                    <div className="vp-tracks-column">
                      <div className="vp-tracks-header">Audio</div>
                      {audioStreams.map((s, i) => (
                        <div
                          key={s.index}
                          className={`vp-track-item ${audioIdx === i ? "active" : ""}`}
                          onClick={() => handleAudioChange(i)}
                        >
                          {audioIdx === i && <span className="vp-track-check">✓</span>}
                          {getStreamLabel(s, i, "Audio")}
                        </div>
                      ))}
                    </div>
                  )}
                  {subtitleStreams.length > 0 && (
                    <div className="vp-tracks-column">
                      <div className="vp-tracks-header">Subtitles</div>
                      <div
                        className={`vp-track-item ${activeSubIdx === null ? "active" : ""}`}
                        onClick={() => handleSubtitleChange(null)}
                      >
                        {activeSubIdx === null && <span className="vp-track-check">✓</span>}
                        Off
                      </div>
                      {subtitleStreams.map((s, i) => (
                        <div
                          key={s.index}
                          className={`vp-track-item ${activeSubIdx === s.index ? "active" : ""}`}
                          onClick={() => handleSubtitleChange(s.index)}
                        >
                          {activeSubIdx === s.index && <span className="vp-track-check">✓</span>}
                          {getStreamLabel(s, i, "Subtitle")}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Set Intro button */}
          <button className="mc-btn vp-btn vp-set-intro-btn" onClick={() => setSettingIntro(s => !s)}
            title="Set Intro Timestamps">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
            </svg>
          </button>

          <MediaFullscreenButton className="mc-btn" />
        </MediaControlBar>
      )}

      {/* Set Intro panel */}
      {settingIntro && !isEndscreenActive && (
        <div className="vp-intro-setter">
          <span className="vp-intro-setter-label">
            Intro end: {introEnd > 0 ? formatTime(introEnd) : "not set"}
          </span>
          <button className="vp-intro-setter-btn" onClick={() => setIntroEnd(position)}>
            Mark Current as Intro End
          </button>
          <button className="vp-intro-setter-btn"
            onClick={() => { setIntroEnd(0); setSettingIntro(false); }}>
            Clear
          </button>
        </div>
      )}
    </MediaController>
  );
}
