export interface Episode {
  name: string;
  path: string;
  season: number;
  number: number;
  quality: string | null;
  source: string | null;
}

export interface Season {
  number: number;
  path: string;
  episodes: Episode[];
}

export interface MediaItem {
  name: string;
  path: string;
  media_type: string;
  video_files: string[];
  seasons: Season[];
  year: string | null;
  quality: string | null;
  source: string | null;
  tmdb_id: number | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  rating: number | null;
  genres: string[] | null;
  tmdb_year: string | null;
}

export interface AppSettings {
  tmdb_api_key: string | null;
  source_folders: string[];
}

export interface TmdbRecommendation {
  tmdb_id: number;
  title: string;
  poster_url: string | null;
  year: string | null;
  rating: number | null;
  media_type: string;
  overview: string | null;
}

export interface MediaStream {
  index: number;
  codec_type: string;
  codec_name: string | null;
  language: string | null;
  title: string | null;
}

export interface MediaChapter {
  id: number;
  start_time: number;
  end_time: number;
  title: string | null;
}

export interface MediaInfo {
  duration: number;
  streams: MediaStream[];
  chapters: MediaChapter[];
}

// mpv track-list entry (from mpv IPC observe_property track-list)
export interface MpvTrack {
  id: number;
  type: "audio" | "sub" | "video";
  lang?: string;
  title?: string;
  codec?: string;
  selected?: boolean;
  default?: boolean;
  forced?: boolean;
  "external-filename"?: string;
}
