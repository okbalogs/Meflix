import { useState } from "react";
import type { MediaItem } from "../types";
import { getGradient, convertFileSrc } from "../utils";

function fmt(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

interface ResumePromptProps {
  item: MediaItem;
  resumeAt: number;
  onResume: () => void;
  onPlayFromBeginning: () => void;
  onClose: () => void;
}

export default function ResumePrompt({ item, resumeAt, onResume, onPlayFromBeginning, onClose }: ResumePromptProps) {
  const [imgError, setImgError] = useState(false);
  const src = !imgError
    ? (item.backdrop_path ? convertFileSrc(item.backdrop_path) : item.poster_path ? convertFileSrc(item.poster_path) : null)
    : null;

  return (
    <div className="resume-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="resume-prompt">
        {src ? (
          <img className="resume-backdrop" src={src} alt="" onError={() => setImgError(true)} />
        ) : (
          <div className={`resume-backdrop resume-backdrop-fallback ${getGradient(item.name)}`} />
        )}
        <div className="resume-gradient" />
        <div className="resume-content">
          <p className="resume-label">Continue watching</p>
          <h3 className="resume-title">{item.name}</h3>
          <div className="resume-buttons">
            <button className="resume-btn resume-btn-primary" onClick={onResume}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Resume from {fmt(resumeAt)}
            </button>
            <button className="resume-btn resume-btn-secondary" onClick={onPlayFromBeginning}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>
              </svg>
              Play from beginning
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
