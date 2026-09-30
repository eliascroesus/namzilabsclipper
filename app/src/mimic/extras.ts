/**
 * What each of the user's pictures and clips is, found as it's added: a name worth matching
 * (from its file name or the page it was copied from, not a camera's "IMG_2041"), the words
 * printed on it (a screenshot's brand, a dashboard's amounts, read by the text reader that
 * reads the reference's captions), what it looks like to the clipper's picture model (a car,
 * a jet, money, a party, a screen of text), and so whether it's a screenshot or a photo.
 */
import { Senser } from "../engine/vision/sense";
import { TextReader, type Picture } from "./analyze/ocr";

export interface Understood {
  label: string;
  text: string;
  tags: string[];
  look: "screenshot" | "photo" | "clip";
}

// Names a camera, a phone or a clipboard gives, which say nothing of what's in the picture.
const GENERIC = /^(image|img|pic|picture|photo|foto|billede|bild|screenshot|screen shot|skaermbillede|skærmbillede|skarmavbild|skärmavbild|pasted|clip|video|vid|mov|dsc|dcim|pxl|whatsapp image|signal|untitled|unnamed|download|file|capture)\b/i;
// Sites whose names end up in a copied picture's title.
const SITES = /\b(wikipedia|wikimedia|getty ?images|shutterstock|pinterest|alamy|dreamstime|istock|unsplash|pexels|freepik|google)\b/gi;

/** The words of a file's name worth matching ("andrew-tate_2023.jpg" is "andrew tate"), or "" for a name that says nothing. */
export function labelFromName(name: string): string {
  const base = name
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(SITES, " ")
    .replace(/[_\-+.|•·:()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base || GENERIC.test(base) || /^[\d\s]+$/.test(base)) return "";
  return base
    .replace(/(\s+(\d{2,}|[a-f0-9]{8,}))+$/i, "")
    .trim()
    .slice(0, 60);
}

/** The picture model's kinds for a picture, most likely first (those with a fifth of the belief or more). */
async function kindsOf(img: CanvasImageSource & { width: number; height: number }): Promise<string[]> {
  const senser = await Senser.get();
  const [e] = await senser.embed([
    (ctx, size) => {
      const k = Math.max(size / img.width, size / img.height);
      ctx.drawImage(img, (size - img.width * k) / 2, (size - img.height * k) / 2, img.width * k, img.height * k);
    },
  ]);
  const sims = senser.text.classes.map((c) => c.emb.reduce((s, v, i) => s + v * e[i], 0));
  const top = Math.max(...sims);
  const p = sims.map((s) => Math.exp(50 * (s - top)));
  const z = p.reduce((a, b) => a + b, 0);
  const byKind = new Map<string, number>();
  senser.text.classes.forEach((c, i) => byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + p[i] / z));
  return [...byKind.entries()]
    .filter(([k, v]) => v >= 0.2 && k !== "other")
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

/** The words printed on a picture, line by line (the lines read surely). */
async function textOn(img: CanvasImageSource & { width: number; height: number }): Promise<{ text: string; lines: number }> {
  const reader = await TextReader.get();
  const k = Math.min(1, 1280 / Math.max(img.width, img.height));
  const w = Math.max(32, Math.round(img.width * k));
  const h = Math.max(32, Math.round(img.height * k));
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const p: Picture = { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
  const boxes = (await reader.find(p, 960))
    .filter((b) => b.y1 - b.y0 >= 7)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    .slice(0, 48);
  const lines: string[] = [];
  for (const b of boxes) {
    const r = await reader.read(p, b);
    if (r.conf >= 0.6 && /\p{L}|\p{N}/u.test(r.text)) lines.push(r.text.trim());
  }
  return { text: lines.join(" | "), lines: lines.length };
}

/**
 * What a picture (or a clip's frame) is. Each look is its own try: a picture the text
 * reader or the picture model can't take is still placed by its name.
 */
export async function understand(img: (CanvasImageSource & { width: number; height: number }) | null, name: string, clip: boolean): Promise<Understood> {
  const label = labelFromName(name);
  let text = "";
  let lines = 0;
  let tags: string[] = [];
  if (img) {
    try {
      ({ text, lines } = await textOn(img));
    } catch {
      // no text reader: its name has to do
    }
    try {
      tags = await kindsOf(img);
    } catch {
      // no picture model
    }
  }
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const look = clip ? "clip" : (lines >= 5 && letters >= 25) || (tags[0] === "text" && letters >= 10) ? "screenshot" : "photo";
  return { label, text, tags, look };
}
