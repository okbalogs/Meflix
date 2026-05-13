import { useState, useRef, useCallback } from "react";
import type { MediaItem } from "../types";
import { getGradient, convertFileSrc, toPlaySrc } from "../utils";

interface MediaCardProps {
  item: MediaItem;
  progress?: number;
  onPlayItem: (item: MediaItem, startPath?: string, resumeAt?: number) => void;
  onInfo: (item: MediaItem) => void;
  startPath?: string;
  resumeAt?: number;
  epLabel?: string;
  inMyList?: boolean;
  onToggleMyList?: (path: string) => void;
  rank?: number;
}

export default function MediaCard({
  item, progress, onPlayItem, onInfo, startPath, resumeAt, epLabel,
  inMyList, onToggleMyList, rank,
}: MediaCardProps) {
  const [imgError, setImgError] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const hoverTimer = useRef<number | null>(null);

  const imgSrc = !imgError
    ? (item.poster_path ? convertFileSrc(item.poster_path) : item.backdrop_path ? convertFileSrc(item.backdrop_path) : null)
    : null;

  const showBar = progress !== undefined && progress > 0.01;
  const isWatched = progress !== undefined && progress >= 0.95;

  const handleMouseEnter = useCallback(() => {
    hoverTimer.current = window.setTimeout(async () => {
      const path = item.media_type === "movie"
        ? item.video_files[0]
        : item.seasons[0]?.episodes[0]?.path;
      if (!path) return;
      try {
        const src = await toPlaySrc(path);
        setPreviewSrc(src);
      } catch { /* preview unavailable */ }
    }, 700);
  }, [item]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    setPreviewSrc(null);
  }, []);

  return (
    <div
      className="media-card"
      onClick={() => onInfo(item)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {imgSrc ? (
        <img className="card-poster" src={imgSrc} alt={item.name} loading="lazy" onError={() => setImgError(true)} />
      ) : (
        <div className={`card-poster-fallback ${getGradient(item.name)}`}>
          <span className="card-fallback-title">{item.name}</span>
        </div>
      )}

      {previewSrc && (
        <video
          className="card-preview-video"
          src={previewSrc}
          autoPlay muted loop playsInline
          onError={() => setPreviewSrc(null)}
        />
      )}

      {isWatched && (
        <div className="card-watched-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
      )}

      {rank !== undefined && (
        <div className="card-rank">{rank}</div>
      )}

      {showBar && !isWatched && (
        <div className="card-progress-bar">
          <div className="card-progress-fill" style={{ width: `${Math.min(100, progress! * 100)}%` }} />
        </div>
      )}

      <div className="card-hover-info">
        <div className="card-hover-title">{item.name}</div>
        {epLabel && <div className="card-ep-label-small">{epLabel}</div>}
        <div className="card-actions">
          <button className="card-action-btn play-btn" onClick={e => { e.stopPropagation(); onPlayItem(item, startPath, resumeAt); }} title="Play">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          {onToggleMyList && (
            <button
              className={`card-action-btn${inMyList ? " in-list" : ""}`}
              title={inMyList ? "Remove from My List" : "Add to My List"}
              onClick={e => { e.stopPropagation(); onToggleMyList(item.path); }}
            >
              {inMyList ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              )}
            </button>
          )}
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
