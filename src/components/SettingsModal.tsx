import { useState } from "react";
import type { AppSettings } from "../types";

type Tab = "library" | "api";

interface SettingsModalProps {
  settingsDraft: AppSettings;
  setSettingsDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
  showApiKey: boolean;
  setShowApiKey: (v: boolean) => void;
  onClose: () => void;
  onSave: () => void;
  onAddFolder: () => void;
  onRemoveFolder: (idx: number) => void;
  platform: string;
}

export default function SettingsModal({
  settingsDraft, setSettingsDraft,
  showApiKey, setShowApiKey,
  onClose, onSave, onAddFolder, onRemoveFolder,
  platform,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("library");
  const isAndroid = platform === "android";

  return (
    <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-v2-panel">

        {/* Header */}
        <div className="settings-v2-header">
          <span className="settings-v2-title">Settings</span>
          <button className="settings-close-btn" onClick={onClose} title="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="settings-v2-body">
          {/* Sidebar */}
          <nav className="settings-v2-nav">
            <button
              className={`settings-v2-tab ${activeTab === "library" ? "active" : ""}`}
              onClick={() => setActiveTab("library")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              Library
            </button>
            <button
              className={`settings-v2-tab ${activeTab === "api" ? "active" : ""}`}
              onClick={() => setActiveTab("api")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              API Keys
            </button>

            <div className="settings-v2-nav-spacer" />

            <div className="settings-v2-app-info">
              <div className="settings-v2-app-name">Meflix</div>
              <div className="settings-v2-app-version">v0.2.0</div>
            </div>
          </nav>

          {/* Content */}
          <div className="settings-v2-content">
            {activeTab === "library" && (
              <div className="settings-v2-section">
                <div className="settings-v2-section-header">
                  <div className="settings-v2-section-title">Media Library</div>
                  <p className="settings-v2-section-desc">
                    {isAndroid
                      ? "Meflix automatically scans the standard media folders on your device for movies and TV shows."
                      : "Meflix scans these folders for movies and TV shows. Changes take effect after saving."}
                  </p>
                </div>

                <div className="folder-list">
                  {settingsDraft.source_folders.length === 0 && (
                    <div className="settings-v2-empty-folders">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                      </svg>
                      <span>No folders added yet</span>
                    </div>
                  )}
                  {settingsDraft.source_folders.map((f, i) => (
                    <div key={i} className="folder-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                      </svg>
                      <span className="folder-path" title={f}>{f}</span>
                      {!isAndroid && (
                        <button className="folder-remove" onClick={() => onRemoveFolder(i)} title="Remove folder">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {!isAndroid && (
                  <button className="settings-add-btn" onClick={onAddFolder}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add Media Folder
                  </button>
                )}
              </div>
            )}

            {activeTab === "api" && (
              <div className="settings-v2-section">
                <div className="settings-v2-section-header">
                  <div className="settings-v2-section-title">TMDB API Key</div>
                  <p className="settings-v2-section-desc">
                    Required for movie posters, ratings, and plot summaries. Sign up at{" "}
                    <strong style={{ color: "var(--text-primary)" }}>themoviedb.org</strong> and generate a free v3 API key under Settings → API.
                  </p>
                </div>

                <div className="settings-v2-field">
                  <label className="settings-v2-field-label">API Key</label>
                  <div className="settings-api-wrap">
                    <input
                      className="settings-input settings-api-input"
                      type={showApiKey ? "text" : "password"}
                      placeholder="Paste your v3 API key here"
                      value={settingsDraft.tmdb_api_key || ""}
                      onChange={e => setSettingsDraft(prev => ({ ...prev, tmdb_api_key: e.target.value || null }))}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      className="settings-api-eye"
                      onClick={() => setShowApiKey(!showApiKey)}
                      title={showApiKey ? "Hide key" : "Reveal key"}
                    >
                      {showApiKey ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                  {settingsDraft.tmdb_api_key ? (
                    <div className="settings-api-status ok">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      API key saved
                    </div>
                  ) : (
                    <div className="settings-api-status empty">No API key set — metadata and artwork will not load.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="settings-v2-footer">
          <button className="settings-cancel" onClick={onClose}>Cancel</button>
          <button className="settings-save" onClick={onSave}>Save & Scan</button>
        </div>
      </div>
    </div>
  );
}
