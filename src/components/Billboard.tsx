import { useState } from "react";
import type { MediaItem } from "../types";
import { getGradient, convertFileSrc } from "../utils";

function BillboardImage({ item }: { item: MediaItem }) {
  const [error, setError] = useState(false);
  const src = item.backdrop_path ? convertFileSrc(item.backdrop_path) : item.poster_path ? convertFileSrc(item.poster_path) : null;

  if (!src || error) return <div className={`billboard-bg ${getGradient(item.name)}`} style={{ position: "absolute", inset: 0 }} />;
  return (
    <img
      className="billboard-bg"
      src={src}
      alt=""
      draggable={false}
      onError={() => setError(true)}
    />
  );
}

interface BillboardProps {
  item: MediaItem;
  onPlay: (item: MediaItem) => void;
  onInfo: (item: MediaItem) => void;
}

export default function Billboard({ item, onPlay, onInfo }: BillboardProps) {
  return (
    <div className="billboard">
      <BillboardImage item={item} />
      <div className="billboard-gradient" />
      <div className="billboard-content">

        {item.rating && (
          <div className="billboard-match">{Math.round(item.rating * 10)}% Match</div>
        )}

        <h1 className="billboard-title">{item.name}</h1>

        <div className="billboard-meta">
          {(item.tmdb_year || item.year) && (
            <span className="billboard-year">{item.tmdb_year || item.year}</span>
          )}
          {item.genres && item.genres.slice(0, 3).map((g, i) => (
            <span key={i} className="billboard-genre">{g}</span>
          ))}
        </div>

        {item.overview && <p className="billboard-overview">{item.overview}</p>}

        <div className="billboard-buttons">
          <button className="btn-play" onClick={() => onPlay(item)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Play
          </button>
          <button className="btn-info" onClick={() => onInfo(item)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.25)"/>
              <line x1="12" y1="16" x2="12" y2="12" stroke="white" strokeWidth="2"/>
              <line x1="12" y1="8" x2="12.01" y2="8" stroke="white" strokeWidth="2.5"/>
            </svg>
            More Info
          </button>
        </div>
      </div>
    </div>
  );
}
