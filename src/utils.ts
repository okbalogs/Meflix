import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { MediaItem } from "./types";

export const GRADIENTS = ["gradient-1","gradient-2","gradient-3","gradient-4","gradient-5"];

export function getGradient(name: string) {
  const idx = Math.abs(name.split("").reduce((a,c)=>a+c.charCodeAt(0),0)) % GRADIENTS.length;
  return GRADIENTS[idx];
}

export function cleanEpisodeName(name: string): string {
  let cleaned = name.replace(/\.[^.]+$/, "");
  cleaned = cleaned.replace(/\./g, " ").replace(/_/g, " ");
  cleaned = cleaned.replace(/\s*(x265|x264|10Bit|HEVC|AAC|DDP?5[\.\\s]?1|BluRay|WEB[- ]?DL|WEBRip|HDRip|HDTV|BRRip|AMZN|NF|HMAX|RARBG|YIFY|YTS|Pahe[\.\\s]in|mkv|mp4).*$/i, "");
  return cleaned.trim();
}

export async function toPlaySrc(path: string, audioIdx: number | null = null, start: number | null = null): Promise<string> {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (['mkv', 'avi', 'flv', 'mov'].includes(ext)) {
    const audioQuery = audioIdx !== null ? `&a=${audioIdx}` : '';
    const startQuery = start !== null ? `&start=${start}` : '';
    if (ext === 'mkv') {
      try {
        const codecs = await invoke<string>("probe_codecs", { path });
        const [vcodec, acodec] = codecs.split(':');
        if (vcodec === 'h264' && acodec === 'aac') {
          return `http://127.0.0.1:1421/stream?path=${encodeURIComponent(path)}&copy=true${audioQuery}${startQuery}`;
        }
      } catch { /* fall through to full transcode */ }
    }
    return `http://127.0.0.1:1421/stream?path=${encodeURIComponent(path)}${audioQuery}${startQuery}`;
  }
  return convertFileSrc(path);
}

export function buildSeriesQueue(series: MediaItem): Array<{ path: string; title: string }> {
  const queue: Array<{ path: string; title: string }> = [];
  const sortedSeasons = [...series.seasons].sort((a, b) => a.number - b.number);
  for (const season of sortedSeasons) {
    const sortedEps = [...season.episodes].sort((a, b) => a.number - b.number);
    for (const ep of sortedEps) {
      queue.push({ path: ep.path, title: `${series.name} — S${season.number}:E${ep.number}` });
    }
  }
  return queue;
}

export function scrollRow(ref: React.RefObject<HTMLDivElement | null>, dir: "left" | "right") {
  if (!ref.current) return;
  ref.current.scrollBy({ left: dir === "left" ? -ref.current.clientWidth * 0.8 : ref.current.clientWidth * 0.8, behavior: "smooth" });
}

export { convertFileSrc };
