/**
 * A YouTube video saved with its ID in the file name (yt-dlp names files
 * "Title [dQw4w9WgXcQ].mp4") can leave out what viewers have marked in it on
 * SponsorBlock: sponsor reads, self-promotion, "like and subscribe" asks,
 * intros, outros and previews. The lookup sends only the first four characters
 * of the ID's SHA-256, so it doesn't say which video it is.
 */

const API = "https://sponsor.ajay.app/api/skipSegments";
const CATEGORIES = ["sponsor", "selfpromo", "interaction", "intro", "outro", "preview"];

export interface Skip {
  category: string;
  start: number;
  end: number;
}

/** The YouTube video ID in a file name, if there is one. */
export function youtubeId(name: string): string | null {
  const m = /\[([A-Za-z0-9_-]{11})\]/.exec(name) ?? /(?:watch\?v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/.exec(name);
  return m ? m[1] : null;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The stretches of a YouTube video its viewers marked as not the content. */
export async function skipSegments(id: string, signal?: AbortSignal): Promise<Skip[]> {
  const prefix = (await sha256Hex(id)).slice(0, 4);
  const res = await fetch(`${API}/${prefix}?categories=${encodeURIComponent(JSON.stringify(CATEGORIES))}`, { signal });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`SponsorBlock answered ${res.status}`);
  const list = (await res.json()) as { videoID: string; segments?: { category: string; segment: [number, number] }[] }[];
  const mine = list.find((v) => v.videoID === id);
  return (mine?.segments ?? [])
    .map((s) => ({ category: s.category, start: Number(s.segment[0]), end: Number(s.segment[1]) }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);
}
