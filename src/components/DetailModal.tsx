import { useState } from "react";
import type { MediaItem } from "../types";
import { getGradient, cleanEpisodeName, convertFileSrc } from "../utils";

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

function EpisodeThumbnail({ item }: { item: MediaItem }) {
  const [error, setError] = useState(false);
  const src = item.backdrop_path ? convertFileSrc(item.backdrop_path) : null;
  if (!src || error) return <div className={`episode-thumbnail-fallback ${getGradient(item.name)}`} />;
  return <img className="episode-thumbnail" src={src} alt="" loading="lazy" onError={() => setError(true)} />;
}

interface DetailModalProps {
  item: MediaItem;
  selectedSeason: number;
  setSelectedSeason: (n: number) => void;
  onClose: () => void;
  onPlay: (item: MediaItem, startPath?: string) => void;
  inMyList: boolean;
  onToggleMyList: (path: string) => void;
}

export default function DetailModal({ item, selectedSeason, setSelectedSeason, onClose, onPlay, inMyList, onToggleMyList }: DetailModalProps) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <ModalBackdrop item={item} />
        <div className="modal-body">
          <div className="modal-header-actions">
            {(item.media_type === "movie" ? item.video_files.length > 0 : !!item.seasons[0]?.episodes[0]) && (
              <button className="modal-play-btn" onClick={() => { onPlay(item); onClose(); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Play
              </button>
            )}
            <button className="modal-mylist-btn" onClick={() => onToggleMyList(item.path)}>
              {inMyList ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  In My List
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  My List
                </>
              )}
            </button>
          </div>
          <h2 className="modal-title">{item.name}</h2>
          <div className="modal-meta">
            {item.rating && <span className="modal-match">{Math.round(item.rating * 10)}% Match</span>}
            {(item.tmdb_year || item.year) && <span className="modal-year">{item.tmdb_year || item.year}</span>}
            {item.quality && <span className="modal-badge">{item.quality}</span>}
            {item.source && <span className="modal-badge">{item.source}</span>}
            <span className="modal-badge">{item.media_type === "series" ? "Series" : "Movie"}</span>
          </div>
          {item.overview && <p className="modal-overview">{item.overview}</p>}
          {item.genres && item.genres.length > 0 && (
            <div className="modal-genres">
              <span className="modal-genres-label">Genres:</span>
              {item.genres.map((g, i) => <span key={i} className="modal-genre-tag">{g}</span>)}
            </div>
          )}
          {item.media_type === "series" && item.seasons.length > 0 && (
            <>
              <div className="season-selector">
                <select className="season-select" value={selectedSeason} onChange={e => setSelectedSeason(Number(e.target.value))}>
                  {item.seasons.map(s => <option key={s.number} value={s.number}>Season {s.number}</option>)}
                </select>
                <span className="season-label">
                  {item.seasons.find(s => s.number === selectedSeason)?.episodes.length || 0} Episodes
                </span>
              </div>
              <div className="episode-list">
                {item.seasons.find(s => s.number === selectedSeason)?.episodes.map((ep, i) => (
                  <div key={i} className="episode-item" onClick={() => { onPlay(item, ep.path); onClose(); }}>
                    <div className="episode-number">{ep.number || i + 1}</div>
                    <div className="episode-thumbnail-wrap">
                      <EpisodeThumbnail item={item} />
                      <div className="episode-play-overlay">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      </div>
                    </div>
                    <div className="episode-info">
                      <div className="episode-name-row">
                        <div className="episode-name">{cleanEpisodeName(ep.name)}</div>
                      </div>
                      <div className="episode-description">
                        Season {selectedSeason}, Episode {ep.number || i + 1} of {item.name}.
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
  );
}
