import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { isAndroid } from "./platform";
import type { MediaItem } from "./types";

export const STREAM_BASE = "http://127.0.0.1:1421";

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

// Codecs the Android WebView / device decoders handle when remuxed into
// fragmented MP4. The bundled LGPL FFmpeg has no H.264 encoder, so on Android
// the server stream-copies video whenever possible and only re-encodes audio.
const ANDROID_COPYABLE_VIDEO = ["h264", "hevc", "vp9", "av1"];
const COPYABLE_AUDIO = ["aac", "mp3"];

export async function toPlaySrc(path: string, audioIdx: number | null = null, start: number | null = null): Promise<string> {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const android = await isAndroid();
  // Android routes everything through the local server: remuxing is cheap and
  // it avoids asset-protocol scoping issues with /storage paths.
  const serverRouted = android || ['mkv', 'avi', 'flv', 'mov'].includes(ext);
  if (!serverRouted) return convertFileSrc(path);

  let vc = android ? 'copy' : 'libx264';
  let ac = android ? 'copy' : 'aac';
  try {
    const codecs = await invoke<string>("probe_codecs", { path });
    const [vcodec, acodec] = codecs.split(':');
    if (android) {
      // mpeg4 is the only LGPL software encoder available as a last resort.
      vc = ANDROID_COPYABLE_VIDEO.includes(vcodec) ? 'copy' : 'mpeg4';
      ac = COPYABLE_AUDIO.includes(acodec) ? 'copy' : 'aac';
    } else {
      vc = vcodec === 'h264' ? 'copy' : 'libx264';
      ac = acodec === 'aac' ? 'copy' : 'aac';
    }
  } catch { /* keep defaults: copy-all attempt on Android, full transcode on desktop */ }
  const q = new URLSearchParams({ path, vc, ac });
  // Note: probe_codecs reports the first audio track; when a different track
  // is selected the worst case is an already-AAC track getting re-encoded.
  if (audioIdx !== null) q.set('a', String(audioIdx));
  if (start !== null) q.set('start', String(start));
  return `${STREAM_BASE}/stream?${q.toString()}`;
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
