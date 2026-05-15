import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MediaItem, TmdbRecommendation, MediaStream, MediaInfo, MediaChapter } from "../types";
import { saveWatchRecord } from "../progressStore";
import { IS_MOBILE } from "../utils";

const getLanguageName = (code?: string | null) => {
  if (!code || code === 'und') return null;
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
  } catch {
    return code.toUpperCase();
  }
};

const getTrackName = (s: MediaStream, fallbackIndex: number, type: "Audio" | "Subtitle") => {
  const lang = getLanguageName(s.language);
  let name = lang || `${type} Track ${fallbackIndex + 1}`;
  
  // Use title only if it's short and doesn't look spammy
  if (s.title && s.title.length < 25 && !s.title.match(/http|\.com|\.cc|\.net|\.org/i)) {
    name += ` - ${s.title}`;
  } else if (s.codec_name) {
    const codecMap: Record<string, string> = { subrip: "SRT", aac: "AAC", ac3: "AC3", eac3: "E-AC3", dts: "DTS", truehd: "TrueHD", flac: "FLAC", ass: "ASS", hdmv_pgs_subtitle: "PGS" };
    name += ` [${codecMap[s.codec_name] || s.codec_name.toUpperCase()}]`;
  }
  return name;
};

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
  src, rawPath, title, initialTime, onClose, onNext, nextTitle, playingItem, apiKey, onShowDetail, onToast, onAudioChange,
}: VideoPlayerProps) {
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
  const [streams, setStreams] = useState<MediaStream[]>([]);
  const [introChapter, setIntroChapter] = useState<MediaChapter | null>(null);
  const [creditsChapter, setCreditsChapter] = useState<MediaChapter | null>(null);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number | null>(null);
  const [showTracks, setShowTracks] = useState(false);
  const [activeSrc, setActiveSrc] = useState(src);
  const [streamOffset, setStreamOffset] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const controlsTimerRef = useRef<number | null>(null);
  const centerTimerRef = useRef<number | null>(null);
  const upNextShownRef = useRef(false);
  const dismissedUpNextRef = useRef(false);
  const isSeekingRef = useRef(false);
  const suggestionsShownRef = useRef(false);
  const progressTrackRef = useRef<HTMLDivElement>(null);

  // Stable refs for progress saving (avoid stale closures in intervals/cleanup)
  const rawPathRef = useRef(rawPath);
  const streamOffsetRef = useRef(0);
  const mediaDurationRef = useRef(0);
  useEffect(() => { rawPathRef.current = rawPath; }, [rawPath]);
  useEffect(() => { streamOffsetRef.current = streamOffset; }, [streamOffset]);
  useEffect(() => { mediaDurationRef.current = mediaDuration; }, [mediaDuration]);

  const saveCurrentProgress = useCallback(() => {
    if (!rawPathRef.current || !videoRef.current) return;
    const current = streamOffsetRef.current + videoRef.current.currentTime;
    const dur = mediaDurationRef.current > 0 ? mediaDurationRef.current : (videoRef.current.duration || 0);
    if (dur > 0 && current > 2) {
      saveWatchRecord(rawPathRef.current, { progress: current, duration: dur, updatedAt: Date.now() });
    }
  }, []);

  // Save every 5 seconds
  useEffect(() => {
    const id = window.setInterval(saveCurrentProgress, 5000);
    return () => clearInterval(id);
  }, [saveCurrentProgress]);

  // Save on unmount (player closed)
  useEffect(() => () => { saveCurrentProgress(); }, [saveCurrentProgress]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 3000);
  }, []);

  // Reset everything when src changes (new episode loaded)
  useEffect(() => {
    setActiveSrc(src);
    const t = initialTime || 0;
    setStreamOffset(t);
    setProgress(t);
    setPlaying(true); setDuration(0);
    setIsBuffering(true); setHasError(false); setCenterIcon(null);
    setShowUpNext(false); setUpNextCountdown(10); setShowIntroBtn(false);
    setShowSuggestions(false); setRecommendations([]);
    setShowTracks(false);
    upNextShownRef.current = false; dismissedUpNextRef.current = false;
    suggestionsShownRef.current = false;
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 3500);
    if (videoRef.current) videoRef.current.load();
  }, [src]);

  // Fetch streams, duration, and chapters on rawPath change
  useEffect(() => {
    if (!rawPath) return;
    invoke<MediaInfo>("get_media_info", { path: rawPath })
      .then(info => {
        setStreams(info.streams);
        if (info.duration > 0) setMediaDuration(info.duration);
        
        // Find Intro and Credits chapters using robust regex
        let intro = info.chapters.find(c => c.title && /^(intro|opening|op\b)/i.test(c.title));
        let credits = info.chapters.find(c => c.title && /^(credits|ending|ed\b|outro)/i.test(c.title));
        
        // Fallback: if no named chapters, use position heuristics
        if (info.chapters.length > 1) {
          if (!credits) credits = info.chapters[info.chapters.length - 1];
          
          if (!intro) {
            const first = info.chapters[0];
            const length = first.end_time - first.start_time;
            if (length > 0 && length < 300) intro = first; // Intro is usually short (< 5 mins)
          }
        }

        setIntroChapter(intro || null);
        setCreditsChapter(credits || null);
      })
      .catch(e => console.error("Failed to get media info:", e));
  }, [rawPath]);

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

  // Force subtitle track to show when dynamically added
  useEffect(() => {
    if (selectedSubtitle !== null && videoRef.current) {
      const timer = setTimeout(() => {
        if (!videoRef.current) return;
        const tracks = videoRef.current.textTracks;
        for (let i = 0; i < tracks.length; i++) {
          tracks[i].mode = 'showing';
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedSubtitle, activeSrc]);

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

  const triggerSeek = useCallback((newTime: number) => {
    if (activeSrc.includes("/stream")) {
      try {
        const url = new URL(activeSrc);
        url.searchParams.set("start", newTime.toString());
        setActiveSrc(url.toString());
        setStreamOffset(newTime);
        setIsBuffering(true);
        setProgress(newTime);
      } catch {
        if (videoRef.current) videoRef.current.currentTime = newTime;
      }
    } else {
      if (videoRef.current) videoRef.current.currentTime = newTime;
      setProgress(newTime);
    }
  }, [activeSrc]);

  const skip = useCallback((amount: number) => {
    const currentVirtualTime = streamOffset + (videoRef.current?.currentTime || 0);
    const target = Math.max(0, currentVirtualTime + amount);
    triggerSeek(target);
  }, [streamOffset, triggerSeek]);

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
    const current = streamOffset + videoRef.current.currentTime;
    const dur = mediaDuration > 0 ? mediaDuration : (videoRef.current.duration || 0);
    setProgress(current);
    setDuration(dur);
    
    // Skip Intro logic
    if (introChapter && current >= introChapter.start_time && current < introChapter.end_time) {
      setShowIntroBtn(true);
    } else if (introEnd > 0 && current >= 0 && current < introEnd) {
      setShowIntroBtn(true);
    } else {
      setShowIntroBtn(false);
    }
    
    // Up Next / Endscreen logic
    const isCreditsTime = creditsChapter ? (current >= creditsChapter.start_time) : (dur > 60 && dur - current <= 30);
    if (isCreditsTime && !upNextShownRef.current && !dismissedUpNextRef.current) {
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

  const seekToPosition = (clientX: number) => {
    if (!progressTrackRef.current) return;
    const rect = progressTrackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const dur = mediaDuration > 0 ? mediaDuration : (videoRef.current?.duration || 0);
    const newTime = ratio * dur;
    triggerSeek(newTime);
  };

  // Pointer events work for both mouse (desktop) and touch (mobile)
  const handleSeekPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isSeekingRef.current = true;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    seekToPosition(e.clientX);
  };
  const handleSeekPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return;
    seekToPosition(e.clientX);
  };
  const handleSeekPointerUp = () => { isSeekingRef.current = false; };

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
  const isEndscreenActive = showUpNext || showSuggestions;

  return (
    <div
      ref={playerRef}
      className={`video-player-overlay ${showControls && !isEndscreenActive ? "controls-active" : "controls-hidden"} ${isEndscreenActive ? "vp-endscreen-active" : ""}`}
      onPointerMove={resetControlsTimer}
      onMouseLeave={() => {
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 1000);
      }}
    >
      <video
        ref={videoRef}
        className="video-element"
        src={activeSrc}
        autoPlay
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onClick={togglePlay}
        onDoubleClick={IS_MOBILE ? undefined : toggleFullscreen}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onPlaying={() => { setIsBuffering(false); setPlaying(true); }}
        onPause={() => setPlaying(false)}
        onError={() => { setHasError(true); setIsBuffering(false); if (onToast) onToast(IS_MOBILE ? "Unable to play this file." : "Unable to play this file. FFmpeg may be required."); }}
        onLoadedMetadata={() => {
          if (!videoRef.current) return;
          setDuration(videoRef.current.duration);
          if (initialTime && initialTime > 0 && !activeSrc.includes("/stream")) {
            videoRef.current.currentTime = initialTime;
          }
        }}
        onEnded={() => { if (onNext) onNext(); else { setPlaying(false); if (!suggestionsShownRef.current) { suggestionsShownRef.current = true; setShowSuggestions(true); } } }}
        crossOrigin="anonymous"
      >
        {selectedSubtitle !== null && rawPath && (
          <track
            kind="subtitles"
            src={`http://127.0.0.1:1421/subtitle?path=${encodeURIComponent(rawPath)}&s=${selectedSubtitle}${streamOffset > 0 ? `&start=${streamOffset}` : ''}`}
            default
          />
        )}
      </video>

      {centerIcon && <div className="vp-center-action">{centerIcon}</div>}
      {isBuffering && !hasError && <div className="vp-buffering"><div className="vp-spinner" /></div>}

      {hasError && (
        <div className="vp-error">
          <div className="vp-error-icon">⚠</div>
          <div className="vp-error-msg">{IS_MOBILE ? "Unable to play this file. The format may not be supported." : "Unable to play this file. FFmpeg is required for MKV/AVI/MOV playback."}</div>
          <button className="vp-error-btn" onClick={onClose}>Close Player</button>
        </div>
      )}
      {/* Skip Intro */}
      {showIntroBtn && (
        <button className="skip-intro-btn" onClick={() => { 
          const target = introChapter ? introChapter.end_time : introEnd;
          triggerSeek(target); 
          setShowIntroBtn(false); 
        }}>
          Skip Intro
        </button>
      )}

      {/* Netflix Autoplay Endscreen */}
      {isEndscreenActive && (
        <div className="endscreen-container">
          <button className="vp-back-btn" onClick={onClose} style={{ position: "absolute", top: 40, left: 40, zIndex: 100 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>

          {showUpNext && onNext && nextTitle && (
            <div className="endscreen-up-next">
              <div className="endscreen-up-next-label">Up Next in {upNextCountdown}s</div>
              <div className="endscreen-up-next-title">{nextTitle}</div>
              <div className="endscreen-up-next-desc">The next episode is starting automatically.</div>
              <div className="endscreen-actions">
                <button className="endscreen-btn endscreen-btn-play" onClick={onNext}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
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
                <div style={{ color: "var(--text-muted)", fontSize: "1.2rem" }}>Loading recommendations...</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Top and Bottom Bars hidden during endscreen */}
      {!isEndscreenActive && (
        <>
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
          <div className="vp-progress-track" ref={progressTrackRef}
               onPointerDown={handleSeekPointerDown}
               onPointerMove={handleSeekPointerMove}
               onPointerUp={handleSeekPointerUp}
               onPointerCancel={handleSeekPointerUp}>
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

          {!IS_MOBILE && (
            <div className="vp-volume-group">
              <button className="vp-btn" onClick={toggleMute} title="Mute (m)"><VolumeIcon /></button>
              <input type="range" min="0" max="1" step="0.02"
                value={muted ? 0 : volume} onChange={handleVolumeChange} className="vp-volume-slider" />
            </div>
          )}

          <div className="vp-spacer" />

          {streams.length > 0 && (
            <div className="vp-tracks-container" style={{ position: "relative" }}>
              <button className="vp-btn" onClick={() => setShowTracks(!showTracks)} title="Audio & Subtitles">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
              </button>
              {showTracks && (
                <div className="vp-tracks-popup">
                  <div className="vp-tracks-column">
                    <div className="vp-tracks-header">Audio</div>
                    {streams.filter(s => s.codec_type === "audio").map((s, i) => {
                      const currentAudioIdx = src.match(/&a=(\d+)/) ? parseInt(src.match(/&a=(\d+)/)![1]) : streams.find(st => st.codec_type === "audio")?.index;
                      const isActive = currentAudioIdx === s.index;
                      return (
                        <div key={s.index} className={`vp-track-item ${isActive ? "active" : ""}`} onClick={() => {
                          if (!isActive && onAudioChange) {
                            if (videoRef.current) isSeekingRef.current = true;
                            const currentTime = streamOffset + (videoRef.current?.currentTime || 0);
                            
                            try {
                              const url = new URL(activeSrc);
                              url.searchParams.set("a", s.index.toString());
                              url.searchParams.set("start", currentTime.toString());
                              setActiveSrc(url.toString());
                              setStreamOffset(currentTime);
                              setIsBuffering(true);
                            } catch {
                              onAudioChange(s.index, currentTime);
                            }
                            isSeekingRef.current = false;
                          }
                          setShowTracks(false);
                        }}>
                          {isActive && <span className="vp-track-check">✓</span>}
                          {getTrackName(s, i, "Audio")}
                        </div>
                      );
                    })}
                  </div>
                  <div className="vp-tracks-column">
                    <div className="vp-tracks-header">Subtitles</div>
                    <div className={`vp-track-item ${selectedSubtitle === null ? "active" : ""}`} onClick={() => { setSelectedSubtitle(null); setShowTracks(false); }}>
                      {selectedSubtitle === null && <span className="vp-track-check">✓</span>}
                      Off
                    </div>
                    {streams.filter(s => s.codec_type === "subtitle").map((s, i) => {
                      const isActive = selectedSubtitle === s.index;
                      return (
                        <div key={s.index} className={`vp-track-item ${isActive ? "active" : ""}`} onClick={() => { setSelectedSubtitle(s.index); setShowTracks(false); }}>
                          {isActive && <span className="vp-track-check">✓</span>}
                          {getTrackName(s, i, "Subtitle")}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {!IS_MOBILE && (
            <button className="vp-btn vp-set-intro-btn" onClick={() => setSettingIntro(!settingIntro)} title="Set Intro Timestamps">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
              </svg>
            </button>
          )}

          {!IS_MOBILE && (
            <button className="vp-btn" onClick={toggleFullscreen} title="Fullscreen (f)">
              {document.fullscreenElement
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
              }
            </button>
          )}
        </div>

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
      </>
      )}
    </div>
  );
}
