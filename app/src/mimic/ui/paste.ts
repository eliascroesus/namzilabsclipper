/**
 * Pictures from the clipboard. A picture copied anywhere (right-click, Copy image, in any
 * tab or app) comes to the page as a file; a copied link to one, or a piece of a page with
 * a picture in it, is fetched when the picture's site lets a page do that.
 */

const MEDIA = /^(image|video)\//;

export class PasteError extends Error {}

/** The paste shortcut on this computer. */
export const PASTE_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘V" : "Ctrl+V";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/svg+xml": "svg", "video/quicktime": "mov" };
const extOf = (type: string) => EXT[type] ?? (/^\w+\/([\w.+-]+)$/.exec(type)?.[1] ?? "png");

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', "#39": "'", apos: "'", lt: "<", gt: ">" };
const unescape = (s: string) => s.replace(/&(amp|quot|#39|apos|lt|gt);/g, (_, e: string) => ENTITIES[e]);

/** A pasted picture's name: its alt text, else its link's file name, else "Picture n". */
export function pastedName(n: number, type: string, hint?: { url?: string; alt?: string } | null): string {
  const ext = extOf(type);
  const alt = hint?.alt?.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (alt) return `${alt}.${ext}`;
  try {
    // (With what was pasted's own ending: a copied picture comes as a PNG whatever it was.)
    const file = hint?.url && /^https?:/i.test(hint.url) ? decodeURIComponent(new URL(hint.url).pathname.split("/").pop() ?? "") : "";
    const base = /^([\w\s().,-]{1,80})\.(jpe?g|png|gif|webp|avif|bmp)$/i.exec(file)?.[1];
    if (base) return `${base}.${ext}`;
  } catch {
    // not a link we can read a name from
  }
  return `Picture ${n}.${ext}`;
}

/** The first picture a copied piece of a page shows: its link and alt text. */
export function pictureInHtml(html: string): { url: string; alt?: string } | null {
  const tag = /<img\b[^>]*>/i.exec(html)?.[0];
  if (!tag) return null;
  const attr = (k: string) => {
    const m = new RegExp(`\\s${k}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
    return m ? unescape(m[1] ?? m[2] ?? m[3] ?? "").trim() : "";
  };
  const url = attr("src");
  if (!/^(https?:\/\/|data:image\/)/i.test(url)) return null;
  const alt = attr("alt");
  return alt ? { url, alt } : { url };
}

/** A copied link, when it could be a picture (a web address or a picture written out). */
export function pictureLink(text: string): string | null {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  return line && (/^https?:\/\/\S+$/i.test(line) || /^data:image\/[\w.+-]+;base64,/i.test(line)) ? line : null;
}

// Names a browser gives what it puts on the clipboard: they say nothing of the picture.
const GENERIC = /^(image|blob|clipboard|untitled|pasted[\s_-]?image|screenshot)?(\.\w+)?$/i;

function named(f: File, n: number, hint: { url?: string; alt?: string } | null): File {
  if (f.name && !GENERIC.test(f.name)) return f;
  return new File([f], pastedName(n, f.type, hint), { type: f.type, lastModified: f.lastModified });
}

export interface Pasted {
  /** pictures and clips that came themselves */
  files: File[];
  /** else a link to one (from a copied link or piece of a page) */
  link: { url: string; alt?: string } | null;
}

/**
 * What a paste brought: pictures and clips, named for what they show (n: the number the
 * first one would take among the pictures pasted so far), or a link to one.
 */
export function fromPaste(data: Pick<DataTransfer, "items" | "files" | "getData">, n: number): Pasted {
  const html = data.getData("text/html");
  const hint = html ? pictureInHtml(html) : null;
  const files: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file" || !MEDIA.test(item.type)) continue;
    const f = item.getAsFile();
    if (f) files.push(f);
  }
  if (!files.length) for (const f of Array.from(data.files ?? [])) if (MEDIA.test(f.type)) files.push(f);
  if (files.length) return { files: files.map((f, i) => named(f, n + i, files.length === 1 ? hint : null)), link: null };
  const url = pictureLink(data.getData("text/uri-list") || data.getData("text/plain"));
  return { files: [], link: hint ?? (url ? { url } : null) };
}

/** What the clipboard holds, read on a click (the browser may ask to allow it, once). */
export async function readClipboard(n: number): Promise<Pasted> {
  const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (!clip?.read) throw new PasteError(`This browser pastes with the keyboard only: press ${PASTE_KEY}.`);
  let items: ClipboardItems;
  try {
    items = await clip.read();
  } catch {
    throw new PasteError(`The browser didn't let the page read the clipboard. Press ${PASTE_KEY} instead.`);
  }
  const blobs: Blob[] = [];
  let hint: { url: string; alt?: string } | null = null;
  let text = "";
  for (const item of items) {
    if (item.types.includes("text/html")) hint ??= pictureInHtml(await (await item.getType("text/html")).text());
    const media = item.types.find((t) => MEDIA.test(t));
    if (media) blobs.push(await item.getType(media));
    else if (item.types.includes("text/plain")) text ||= await (await item.getType("text/plain")).text();
  }
  if (blobs.length) return { files: blobs.map((b, i) => named(new File([b], "image", { type: b.type }), n + i, blobs.length === 1 ? hint : null)), link: null };
  const url = pictureLink(text);
  return { files: [], link: hint ?? (url ? { url } : null) };
}

/** A picture from a link. Most sites don't hand theirs to other pages; a copied picture always works. */
export async function fetchPicture(url: string, n: number, alt?: string): Promise<File> {
  let res: Response;
  try {
    res = await fetch(url, { mode: "cors", credentials: "omit" });
  } catch {
    throw new PasteError("That's a link to a picture on a site that won't hand it to this page. Right-click the picture itself, pick Copy image, and paste that.");
  }
  if (!res.ok) throw new PasteError(`The picture's site answered ${res.status}. Copy the picture itself (right-click, Copy image) and paste that.`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!MEDIA.test(type)) throw new PasteError("That link isn't a picture. Copy the picture itself (right-click, Copy image) and paste that.");
  return new File([await res.blob()], pastedName(n, type, { url, alt }), { type });
}

/** A file's fingerprint, to know a picture pasted twice. */
export async function fingerprint(f: Blob): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return `${f.size}:${f.type}`;
  const d = new Uint8Array(await subtle.digest("SHA-256", await f.arrayBuffer()));
  return Array.from(d.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}
