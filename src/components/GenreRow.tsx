import { useRef } from "react";
import type { MediaItem } from "../types";
import type { ProgressStore } from "../progressStore";
import { getItemProgressRatio } from "../progressStore";
import { scrollRow } from "../utils";
import MediaCard from "./MediaCard";

interface GenreRowProps {
  genre: string;
  items: MediaItem[];
  watchProgress: ProgressStore;
  myList: string[];
  onPlayItem: (item: MediaItem, startPath?: string, resumeAt?: number) => void;
  onInfo: (item: MediaItem) => void;
  onToggleMyList: (path: string) => void;
}

export default function GenreRow({ genre, items, watchProgress, myList, onPlayItem, onInfo, onToggleMyList }: GenreRowProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  return (
    <div className="content-row">
      <h2 className="row-title">{genre}</h2>
      <div className="row-container">
        <button className="row-arrow left" onClick={() => scrollRow(sliderRef, "left")}>&#8249;</button>
        <div className="row-slider" ref={sliderRef}>
          {items.map((item, i) => (
            <MediaCard
              key={i} item={item}
              progress={getItemProgressRatio(item, watchProgress)}
              inMyList={myList.includes(item.path)}
              onToggleMyList={onToggleMyList}
              onPlayItem={onPlayItem} onInfo={onInfo}
            />
          ))}
        </div>
        <button className="row-arrow right" onClick={() => scrollRow(sliderRef, "right")}>&#8250;</button>
      </div>
    </div>
  );
}
