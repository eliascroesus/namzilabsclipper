/** The caption and card faces (all under the Open Font License: assets/fonts/FONTS-LICENSE.txt), loaded into the page (or worker) before drawing. */
import interUrl from "../../assets/fonts/inter-opsz.woff2?url";
import serifUrl from "../../assets/fonts/instrument-serif-italic.woff2?url";
import oswaldUrl from "../../assets/fonts/oswald-500.woff2?url";
import gothicUrl from "../../assets/fonts/league-gothic-400.woff2?url";
import monoUrl from "../../assets/fonts/vt323-400.woff2?url";

export const FONT = {
  sans: "ClipInter",
  serif: "ClipSerif",
  condensed: "ClipOswald",
  tall: "ClipGothic",
  /** a VCR's on-screen lettering */
  mono: "ClipVT323",
} as const;

let loading: Promise<void> | null = null;

export function loadFonts(): Promise<void> {
  if (loading) return loading;
  const set = (globalThis as unknown as { fonts?: FontFaceSet }).fonts ?? (typeof document !== "undefined" ? document.fonts : undefined);
  if (!set) return (loading = Promise.resolve());
  const faces = [
    new FontFace(FONT.sans, `url(${interUrl})`, { weight: "100 900" }),
    new FontFace(FONT.serif, `url(${serifUrl})`, { style: "italic" }),
    new FontFace(FONT.condensed, `url(${oswaldUrl})`, { weight: "500" }),
    new FontFace(FONT.tall, `url(${gothicUrl})`),
    new FontFace(FONT.mono, `url(${monoUrl})`),
  ];
  loading = Promise.all(
    faces.map(async (f) => {
      await f.load();
      set.add(f);
    }),
  ).then(() => undefined);
  return loading;
}
