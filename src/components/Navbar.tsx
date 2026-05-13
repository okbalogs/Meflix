import { useRef } from "react";
import logo from "../assets/logo.png";

interface NavbarProps {
  scrolled: boolean;
  activeFilter: string;
  setActiveFilter: (f: string) => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onOpenSettings: () => void;
}

export default function Navbar({
  scrolled, activeFilter, setActiveFilter,
  searchOpen, setSearchOpen, searchQuery, setSearchQuery,
  onOpenSettings,
}: NavbarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  return (
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
        <button className="nav-icon" onClick={onOpenSettings} title="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        </button>
      </div>
    </nav>
  );
}
