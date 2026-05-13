import { useRef } from "react";
import type { MediaItem } from "../types";
import type { ProgressStore, ContinueEntry } from "../progressStore";
import { getItemProgressRatio, buildContinueWatching, getTop10, buildBecauseYouWatched } from "../progressStore";
import type { FirstSeenStore } from "../recentlyAdded";
import { getRecentlyAdded } from "../recentlyAdded";

import MediaCard from "./MediaCard";
import GenreRow from "./GenreRow";

interface ContentRowsProps {
  activeFilter: string;
  series: MediaItem[];
  movies: MediaItem[];
  allGenres: string[];
  activeGenre: string | null;
  filteredLibrary: MediaItem[];
  watchProgress: ProgressStore;
  myList: string[];
  firstSeenStore: FirstSeenStore;
  onPlayItem: (item: MediaItem, startPath?: string, resumeAt?: number) => void;
  onInfo: (item: MediaItem) => void;
  onToggleMyList: (path: string) => void;
}

interface RowProps {
  title: string;
  items: MediaItem[];
  watchProgress: ProgressStore;
  myList: string[];
  onPlayItem: (item: MediaItem, startPath?: string, resumeAt?: number) => void;
  onInfo: (item: MediaItem) => void;
  onToggleMyList: (path: string) => void;
  getRank?: (item: MediaItem) => number | undefined;
}

function SimpleRow({ title, items, watchProgress, myList, onPlayItem, onInfo, onToggleMyList, getRank }: RowProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  return (
    <div className="content-row">
      <h2 className="row-title">{title}</h2>
      <div className="row-container">
        <button className="row-arrow left" onClick={() => { if (sliderRef.current) sliderRef.current.scrollBy({ left: -sliderRef.current.clientWidth * 0.8, behavior: "smooth" }); }}>&#8249;</button>
        <div className="row-slider" ref={sliderRef}>
          {items.map((item, i) => (
            <MediaCard
              key={i} item={item}
              progress={getItemProgressRatio(item, watchProgress)}
              inMyList={myList.includes(item.path)}
              onToggleMyList={onToggleMyList}
              rank={getRank?.(item)}
              onPlayItem={onPlayItem} onInfo={onInfo}
            />
          ))}
        </div>
        <button className="row-arrow right" onClick={() => { if (sliderRef.current) sliderRef.current.scrollBy({ left: sliderRef.current.clientWidth * 0.8, behavior: "smooth" }); }}>&#8250;</button>
      </div>
    </div>
  );
}

export default function ContentRows({
  activeFilter, series, movies, allGenres, activeGenre, filteredLibrary,
  watchProgress, myList, firstSeenStore, onPlayItem, onInfo, onToggleMyList,
}: ContentRowsProps) {
  const continueRef = useRef<HTMLDivElement>(null);
  const seriesSliderRef = useRef<HTMLDivElement>(null);
  const moviesSliderRef = useRef<HTMLDivElement>(null);

  const library = [...series, ...movies];

  const continueItems: ContinueEntry[] = activeFilter === "all"
    ? buildContinueWatching(library, watchProgress)
    : [];

  const myListItems = myList.map(path => library.find(i => i.path === path)).filter(Boolean) as MediaItem[];

  const recentlyAdded = activeFilter === "all" ? getRecentlyAdded(library, firstSeenStore) : [];

  const top10Items = activeFilter === "all" ? getTop10(library, watchProgress) : [];

  const becauseRow = activeFilter === "all" ? buildBecauseYouWatched(library, watchProgress) : null;

  return (
    <div className="content-section">

      {/* Continue Watching */}
      {continueItems.length > 0 && (
        <div className="content-row">
          <h2 className="row-title">Continue Watching</h2>
          <div className="row-container">
            <button className="row-arrow left" onClick={() => continueRef.current?.scrollBy({ left: -continueRef.current.clientWidth * 0.8, behavior: "smooth" })}>&#8249;</button>
            <div className="row-slider" ref={continueRef}>
              {continueItems.map((entry, i) => (
                <MediaCard
                  key={i} item={entry.item}
                  progress={entry.ratio}
                  startPath={entry.startPath} resumeAt={entry.resumeAt} epLabel={entry.epLabel}
                  inMyList={myList.includes(entry.item.path)}
                  onToggleMyList={onToggleMyList}
                  onPlayItem={onPlayItem} onInfo={onInfo}
                />
              ))}
            </div>
            <button className="row-arrow right" onClick={() => continueRef.current?.scrollBy({ left: continueRef.current.clientWidth * 0.8, behavior: "smooth" })}>&#8250;</button>
          </div>
        </div>
      )}

      {/* My List */}
      {myListItems.length > 0 && (activeFilter === "all" || activeFilter === "mylist") && (
        <SimpleRow title="My List" items={myListItems} watchProgress={watchProgress}
          myList={myList} onPlayItem={onPlayItem} onInfo={onInfo} onToggleMyList={onToggleMyList} />
      )}

      {/* Recently Added */}
      {recentlyAdded.length > 0 && (
        <SimpleRow title="Recently Added" items={recentlyAdded} watchProgress={watchProgress}
          myList={myList} onPlayItem={onPlayItem} onInfo={onInfo} onToggleMyList={onToggleMyList} />
      )}

      {/* TV Shows */}
      {(activeFilter === "all" || activeFilter === "series") && series.length > 0 && (
        <div className="content-row">
          <h2 className="row-title">TV Shows</h2>
          <div className="row-container">
            <button className="row-arrow left" onClick={() => seriesSliderRef.current?.scrollBy({ left: -seriesSliderRef.current.clientWidth * 0.8, behavior: "smooth" })}>&#8249;</button>
            <div className="row-slider" ref={seriesSliderRef}>
              {series.map((item, i) => (
                <MediaCard key={i} item={item}
                  progress={getItemProgressRatio(item, watchProgress)}
                  inMyList={myList.includes(item.path)} onToggleMyList={onToggleMyList}
                  onPlayItem={onPlayItem} onInfo={onInfo} />
              ))}
            </div>
            <button className="row-arrow right" onClick={() => seriesSliderRef.current?.scrollBy({ left: seriesSliderRef.current.clientWidth * 0.8, behavior: "smooth" })}>&#8250;</button>
          </div>
        </div>
      )}

      {/* Movies */}
      {(activeFilter === "all" || activeFilter === "movies") && movies.length > 0 && (
        <div className="content-row">
          <h2 className="row-title">Movies</h2>
          <div className="row-container">
            <button className="row-arrow left" onClick={() => moviesSliderRef.current?.scrollBy({ left: -moviesSliderRef.current.clientWidth * 0.8, behavior: "smooth" })}>&#8249;</button>
            <div className="row-slider" ref={moviesSliderRef}>
              {movies.map((item, i) => (
                <MediaCard key={i} item={item}
                  progress={getItemProgressRatio(item, watchProgress)}
                  inMyList={myList.includes(item.path)} onToggleMyList={onToggleMyList}
                  onPlayItem={onPlayItem} onInfo={onInfo} />
              ))}
            </div>
            <button className="row-arrow right" onClick={() => moviesSliderRef.current?.scrollBy({ left: moviesSliderRef.current.clientWidth * 0.8, behavior: "smooth" })}>&#8250;</button>
          </div>
        </div>
      )}

      {/* Because You Watched */}
      {becauseRow && (
        <SimpleRow
          title={`Because you watched ${becauseRow.basedOnName}`}
          items={becauseRow.items} watchProgress={watchProgress}
          myList={myList} onPlayItem={onPlayItem} onInfo={onInfo} onToggleMyList={onToggleMyList}
        />
      )}

      {/* Top 10 */}
      {top10Items.length >= 3 && (
        <SimpleRow
          title="Top 10 in Your Library"
          items={top10Items} watchProgress={watchProgress}
          myList={myList} onPlayItem={onPlayItem} onInfo={onInfo} onToggleMyList={onToggleMyList}
          getRank={(item) => top10Items.indexOf(item) + 1}
        />
      )}

      {/* Genre Rows */}
      {(activeFilter === "all" ? allGenres : allGenres.filter(g => !activeGenre || g === activeGenre)).map(genre => {
        const genreItems = filteredLibrary.filter(i => i.genres?.includes(genre));
        if (genreItems.length === 0) return null;
        return (
          <GenreRow
            key={genre} genre={genre} items={genreItems}
            watchProgress={watchProgress} myList={myList}
            onPlayItem={onPlayItem} onInfo={onInfo} onToggleMyList={onToggleMyList}
          />
        );
      })}
    </div>
  );
}
