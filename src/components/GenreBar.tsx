interface GenreBarProps {
  allGenres: string[];
  activeGenre: string | null;
  setActiveGenre: (g: string | null) => void;
  scrolled: boolean;
}

export default function GenreBar({ allGenres, activeGenre, setActiveGenre, scrolled }: GenreBarProps) {
  return (
    <div className={`genre-bar ${scrolled ? "genre-bar-scrolled" : ""}`}>
      <button className={`genre-pill ${activeGenre === null ? "active" : ""}`} onClick={() => setActiveGenre(null)}>All</button>
      {allGenres.map(g => (
        <button key={g} className={`genre-pill ${activeGenre === g ? "active" : ""}`} onClick={() => setActiveGenre(activeGenre === g ? null : g)}>{g}</button>
      ))}
    </div>
  );
}
