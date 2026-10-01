/**
 * The fonts a text style can use: the app's own faces and about fifty more from Google
 * Fonts (Open Font License or Apache 2.0: assets/fonts/lib/FONTS-LICENSE.txt), the free
 * faces nearest the ones short-form editors set captions in (wide grotesks like Druk Wide
 * and Monument Extended, Clash Display, Proxima Nova, TikTok's own, serif italics for an
 * accent word, scripts, condensed and rounded display faces). Each loads only when a style
 * uses it. Their measurements (x-height, cap height, ascent and descent, as shares of the
 * font size) let a size read off a reference's letters be turned back into a font size.
 */

export type FontKind = "grotesk" | "wide" | "condensed" | "display" | "rounded" | "serif" | "script" | "mono";

export interface FontFile {
  /** under assets/fonts/lib (or assets/fonts, as ../name) */
  file: string;
  style: "normal" | "italic";
  /** a CSS weight or range ("200 900") */
  weight: string;
  /** a CSS stretch range ("75% 150%"), for a face with a width axis */
  stretch?: string;
}

export interface FontDef {
  id: string;
  name: string;
  kind: FontKind;
  /** what it stands in for */
  like: string;
  license: "OFL" | "Apache-2.0";
  /** the lightest and heaviest weights it has */
  weights: [number, number];
  /** its width axis, in % of normal, when it has one */
  stretch?: [number, number];
  italic: boolean;
  upright: boolean;
  /** x-height, cap height, ascent and descent, as shares of the font size */
  metrics: { xh: number; cap: number; asc: number; desc: number };
  files: FontFile[];
}

export const FONT_KINDS: { kind: FontKind; name: string }[] = [
  { kind: "grotesk", name: "Sans" },
  { kind: "wide", name: "Wide" },
  { kind: "condensed", name: "Condensed" },
  { kind: "display", name: "Display" },
  { kind: "rounded", name: "Rounded" },
  { kind: "serif", name: "Serif" },
  { kind: "script", name: "Script" },
  { kind: "mono", name: "Mono" },
];

export const FONTS: FontDef[] = [
  { id: "inter", name: "Inter", kind: "grotesk", like: "SF Pro, Instagram Sans, Neue Haas (the app's own text)", license: "OFL", weights: [100, 900], italic: false, upright: true, metrics: { xh: 0.546, cap: 0.728, asc: 0.969, desc: 0.241 }, files: [{ file: "../inter-opsz.woff2", style: "normal", weight: "100 900" }] },
  { id: "montserrat", name: "Montserrat", kind: "grotesk", like: "Gotham", license: "OFL", weights: [100, 900], italic: false, upright: true, metrics: { xh: 0.517, cap: 0.7, asc: 0.968, desc: 0.251 }, files: [{ file: "../montserrat-var.woff2", style: "normal", weight: "100 900" }] },
  { id: "tiktok-sans", name: "TikTok Sans", kind: "grotesk", like: "TikTok's own text, and its Expanded cut (a width axis to 150%)", license: "OFL", weights: [300, 900], stretch: [75, 150], italic: false, upright: true, metrics: { xh: 0.507, cap: 0.705, asc: 1.0, desc: 0.3 }, files: [{ file: "tiktok-sans.woff2", style: "normal", weight: "300 900", stretch: "75% 150%" }] },
  { id: "archivo", name: "Archivo", kind: "grotesk", like: "Helvetica Neue Extended or Condensed (it has a width axis)", license: "OFL", weights: [100, 900], stretch: [62, 125], italic: true, upright: true, metrics: { xh: 0.526, cap: 0.686, asc: 0.878, desc: 0.21 }, files: [{ file: "archivo.woff2", style: "normal", weight: "100 900", stretch: "62% 125%" }, { file: "archivo-italic.woff2", style: "italic", weight: "100 900", stretch: "62% 125%" }] },
  { id: "bricolage-grotesque", name: "Bricolage Grotesque", kind: "grotesk", like: "editorial grotesk, condensed to normal", license: "OFL", weights: [200, 800], stretch: [75, 100], italic: false, upright: true, metrics: { xh: 0.528, cap: 0.66, asc: 0.93, desc: 0.27 }, files: [{ file: "bricolage-grotesque.woff2", style: "normal", weight: "200 800", stretch: "75% 100%" }] },
  { id: "dm-sans", name: "DM Sans", kind: "grotesk", like: "Circular, Graphik", license: "OFL", weights: [100, 1000], italic: true, upright: true, metrics: { xh: 0.504, cap: 0.7, asc: 0.992, desc: 0.31 }, files: [{ file: "dm-sans.woff2", style: "normal", weight: "100 1000" }, { file: "dm-sans-italic.woff2", style: "italic", weight: "100 1000" }] },
  { id: "familjen-grotesk", name: "Familjen Grotesk", kind: "grotesk", like: "a Swiss grotesk with character", license: "OFL", weights: [400, 700], italic: true, upright: true, metrics: { xh: 0.5, cap: 0.65, asc: 1.025, desc: 0.225 }, files: [{ file: "familjen-grotesk.woff2", style: "normal", weight: "400 700" }, { file: "familjen-grotesk-italic.woff2", style: "italic", weight: "400 700" }] },
  { id: "figtree", name: "Figtree", kind: "grotesk", like: "Proxima Nova, Instagram Sans", license: "OFL", weights: [300, 900], italic: true, upright: true, metrics: { xh: 0.5, cap: 0.7, asc: 0.95, desc: 0.25 }, files: [{ file: "figtree.woff2", style: "normal", weight: "300 900" }, { file: "figtree-italic.woff2", style: "italic", weight: "300 900" }] },
  { id: "manrope", name: "Manrope", kind: "grotesk", like: "SF Pro Rounded-ish, Avenir Next", license: "OFL", weights: [200, 800], italic: false, upright: true, metrics: { xh: 0.54, cap: 0.72, asc: 1.066, desc: 0.3 }, files: [{ file: "manrope.woff2", style: "normal", weight: "200 800" }] },
  { id: "outfit", name: "Outfit", kind: "grotesk", like: "Gilroy, Product Sans", license: "OFL", weights: [100, 900], italic: false, upright: true, metrics: { xh: 0.46, cap: 0.676, asc: 1.0, desc: 0.26 }, files: [{ file: "outfit.woff2", style: "normal", weight: "100 900" }] },
  { id: "plus-jakarta-sans", name: "Plus Jakarta Sans", kind: "grotesk", like: "Proxima Nova, Gilroy", license: "OFL", weights: [200, 800], italic: true, upright: true, metrics: { xh: 0.536, cap: 0.745, asc: 1.038, desc: 0.222 }, files: [{ file: "plus-jakarta-sans.woff2", style: "normal", weight: "200 800" }, { file: "plus-jakarta-sans-italic.woff2", style: "italic", weight: "200 800" }] },
  { id: "poppins", name: "Poppins", kind: "grotesk", like: "Gilroy ExtraBold, Product Sans heavy", license: "OFL", weights: [800, 800], italic: false, upright: true, metrics: { xh: 0.561, cap: 0.709, asc: 1.05, desc: 0.35 }, files: [{ file: "../poppins-800.woff2", style: "normal", weight: "800" }] },
  { id: "sora", name: "Sora", kind: "grotesk", like: "Satoshi, Eina", license: "OFL", weights: [100, 800], italic: false, upright: true, metrics: { xh: 0.534, cap: 0.73, asc: 0.97, desc: 0.29 }, files: [{ file: "sora.woff2", style: "normal", weight: "100 800" }] },
  { id: "space-grotesk", name: "Space Grotesk", kind: "grotesk", like: "Neue Montreal with quirks", license: "OFL", weights: [300, 700], italic: false, upright: true, metrics: { xh: 0.486, cap: 0.7, asc: 0.984, desc: 0.292 }, files: [{ file: "space-grotesk.woff2", style: "normal", weight: "300 700" }] },
  { id: "urbanist", name: "Urbanist", kind: "grotesk", like: "Futura-like geometric", license: "OFL", weights: [100, 900], italic: true, upright: true, metrics: { xh: 0.5, cap: 0.7, asc: 0.95, desc: 0.25 }, files: [{ file: "urbanist.woff2", style: "normal", weight: "100 900" }, { file: "urbanist-italic.woff2", style: "italic", weight: "100 900" }] },
  { id: "dela-gothic-one", name: "Dela Gothic One", kind: "wide", like: "heavy wide display", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.54, cap: 0.726, asc: 1.16, desc: 0.288 }, files: [{ file: "dela-gothic-one.woff2", style: "normal", weight: "400" }] },
  { id: "krona-one", name: "Krona One", kind: "wide", like: "Eurostile Extended", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.576, cap: 0.763, asc: 0.991, desc: 0.259 }, files: [{ file: "krona-one.woff2", style: "normal", weight: "400" }] },
  { id: "lexend-zetta", name: "Lexend Zetta", kind: "wide", like: "the widest of geometric sans", license: "OFL", weights: [100, 900], italic: false, upright: true, metrics: { xh: 0.525, cap: 0.7, asc: 1.0, desc: 0.25 }, files: [{ file: "lexend-zetta.woff2", style: "normal", weight: "100 900" }] },
  { id: "michroma", name: "Michroma", kind: "wide", like: "Microgramma", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.562, cap: 0.75, asc: 1.156, desc: 0.266 }, files: [{ file: "michroma.woff2", style: "normal", weight: "400" }] },
  { id: "syncopate", name: "Syncopate", kind: "wide", like: "wide small capitals", license: "OFL", weights: [400, 700], italic: false, upright: true, metrics: { xh: 0.468, cap: 0.671, asc: 0.76, desc: 0.208 }, files: [{ file: "syncopate-400.woff2", style: "normal", weight: "400" }, { file: "syncopate-700.woff2", style: "normal", weight: "700" }] },
  { id: "syne", name: "Syne", kind: "wide", like: "Clash Display, Neue Machina", license: "OFL", weights: [400, 800], italic: false, upright: true, metrics: { xh: 0.5, cap: 0.65, asc: 0.925, desc: 0.275 }, files: [{ file: "syne.woff2", style: "normal", weight: "400 800" }] },
  { id: "unbounded", name: "Unbounded", kind: "wide", like: "Druk Wide, Monument Extended", license: "OFL", weights: [200, 900], italic: false, upright: true, metrics: { xh: 0.566, cap: 0.75, asc: 0.995, desc: 0.245 }, files: [{ file: "unbounded.woff2", style: "normal", weight: "200 900" }] },
  { id: "anton", name: "Anton", kind: "condensed", like: "Impact, Bebas heavy", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.732, cap: 0.859, asc: 1.176, desc: 0.329 }, files: [{ file: "../anton-400.woff2", style: "normal", weight: "400" }] },
  { id: "barlow-condensed", name: "Barlow Condensed", kind: "condensed", like: "DIN Condensed, Tungsten-light", license: "OFL", weights: [600, 800], italic: true, upright: true, metrics: { xh: 0.511, cap: 0.7, asc: 1.0, desc: 0.2 }, files: [{ file: "barlow-condensed-600.woff2", style: "normal", weight: "600" }, { file: "barlow-condensed-800.woff2", style: "normal", weight: "800" }, { file: "barlow-condensed-italic.woff2", style: "italic", weight: "800" }] },
  { id: "bebas", name: "Bebas Neue", kind: "condensed", like: "Bebas, tall capitals", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.7, cap: 0.7, asc: 0.9, desc: 0.3 }, files: [{ file: "../bebas-neue-400.woff2", style: "normal", weight: "400" }] },
  { id: "big-shoulders-display", name: "Big Shoulders Display", kind: "condensed", like: "Druk, Tungsten", license: "OFL", weights: [100, 900], italic: false, upright: true, metrics: { xh: 0.6, cap: 0.8, asc: 0.984, desc: 0.213 }, files: [{ file: "big-shoulders-display.woff2", style: "normal", weight: "100 900" }] },
  { id: "league-gothic", name: "League Gothic", kind: "condensed", like: "News Gothic Condensed, tall titles", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.547, cap: 0.735, asc: 0.968, desc: 0.233 }, files: [{ file: "../league-gothic-400.woff2", style: "normal", weight: "400" }] },
  { id: "oswald", name: "Oswald", kind: "condensed", like: "Alternate Gothic", license: "OFL", weights: [500, 500], italic: false, upright: true, metrics: { xh: 0.578, cap: 0.81, asc: 1.193, desc: 0.289 }, files: [{ file: "../oswald-500.woff2", style: "normal", weight: "500" }] },
  { id: "archivo-black", name: "Archivo Black", kind: "display", like: "heavy grotesk for hooks", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.528, cap: 0.688, asc: 0.878, desc: 0.21 }, files: [{ file: "archivo-black.woff2", style: "normal", weight: "400" }] },
  { id: "bangers", name: "Bangers", kind: "display", like: "comic-book capitals", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.721, cap: 0.721, asc: 0.883, desc: 0.181 }, files: [{ file: "bangers.woff2", style: "normal", weight: "400" }] },
  { id: "lilita-one", name: "Lilita One", kind: "display", like: "Komika Axis-like cartoon bold", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.506, cap: 0.704, asc: 0.923, desc: 0.22 }, files: [{ file: "lilita-one.woff2", style: "normal", weight: "400" }] },
  { id: "luckiest-guy", name: "Luckiest Guy", kind: "display", like: "The Bold Font, comic captions", license: "Apache-2.0", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.684, cap: 0.695, asc: 0.703, desc: 0.297 }, files: [{ file: "luckiest-guy.woff2", style: "normal", weight: "400" }] },
  { id: "rubik", name: "Rubik", kind: "display", like: "rounded heavy sans, MrBeast-style", license: "OFL", weights: [300, 900], italic: true, upright: true, metrics: { xh: 0.52, cap: 0.7, asc: 0.935, desc: 0.25 }, files: [{ file: "rubik.woff2", style: "normal", weight: "300 900" }, { file: "rubik-italic.woff2", style: "italic", weight: "300 900" }] },
  { id: "rubik-mono-one", name: "Rubik Mono One", kind: "display", like: "heavy monospaced capitals", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.7, cap: 0.7, asc: 0.932, desc: 0.306 }, files: [{ file: "rubik-mono-one.woff2", style: "normal", weight: "400" }] },
  { id: "titan-one", name: "Titan One", kind: "display", like: "bubble-heavy", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.58, cap: 0.71, asc: 0.97, desc: 0.175 }, files: [{ file: "titan-one.woff2", style: "normal", weight: "400" }] },
  { id: "fredoka", name: "Fredoka", kind: "rounded", like: "soft rounded, a width axis", license: "OFL", weights: [300, 700], stretch: [75, 125], italic: false, upright: true, metrics: { xh: 0.5, cap: 0.7, asc: 0.974, desc: 0.236 }, files: [{ file: "fredoka.woff2", style: "normal", weight: "300 700", stretch: "75% 125%" }] },
  { id: "nunito", name: "Nunito", kind: "rounded", like: "rounded meme text (Nunito Black: gillioniare's)", license: "OFL", weights: [200, 1000], italic: true, upright: true, metrics: { xh: 0.484, cap: 0.705, asc: 1.011, desc: 0.353 }, files: [{ file: "nunito.woff2", style: "normal", weight: "200 1000" }, { file: "nunito-italic.woff2", style: "italic", weight: "200 1000" }] },
  { id: "quicksand", name: "Quicksand", kind: "rounded", like: "light rounded", license: "OFL", weights: [300, 700], italic: false, upright: true, metrics: { xh: 0.503, cap: 0.7, asc: 1.0, desc: 0.25 }, files: [{ file: "quicksand.woff2", style: "normal", weight: "300 700" }] },
  { id: "bodoni-moda", name: "Bodoni Moda", kind: "serif", like: "Didot, Bodoni (fashion)", license: "OFL", weights: [400, 900], italic: true, upright: true, metrics: { xh: 0.46, cap: 0.75, asc: 1.125, desc: 0.4 }, files: [{ file: "bodoni-moda.woff2", style: "normal", weight: "400 900" }, { file: "bodoni-moda-italic.woff2", style: "italic", weight: "400 900" }] },
  { id: "cormorant-garamond", name: "Cormorant Garamond", kind: "serif", like: "Garamond italic, delicate", license: "OFL", weights: [300, 700], italic: true, upright: true, metrics: { xh: 0.386, cap: 0.625, asc: 0.924, desc: 0.287 }, files: [{ file: "cormorant-garamond.woff2", style: "normal", weight: "300 700" }, { file: "cormorant-garamond-italic.woff2", style: "italic", weight: "300 700" }] },
  { id: "dm-serif-display", name: "DM Serif Display", kind: "serif", like: "high-contrast display serif", license: "OFL", weights: [400, 400], italic: true, upright: true, metrics: { xh: 0.481, cap: 0.66, asc: 1.036, desc: 0.335 }, files: [{ file: "dm-serif-display.woff2", style: "normal", weight: "400" }, { file: "dm-serif-display-italic.woff2", style: "italic", weight: "400" }] },
  { id: "fraunces", name: "Fraunces", kind: "serif", like: "soft old-style serif (Cooper-ish when heavy)", license: "OFL", weights: [100, 900], italic: true, upright: true, metrics: { xh: 0.482, cap: 0.7, asc: 0.978, desc: 0.255 }, files: [{ file: "fraunces.woff2", style: "normal", weight: "100 900" }, { file: "fraunces-italic.woff2", style: "italic", weight: "100 900" }] },
  { id: "gloock", name: "Gloock", kind: "serif", like: "heavy high-contrast serif", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.508, cap: 0.75, asc: 0.975, desc: 0.225 }, files: [{ file: "gloock.woff2", style: "normal", weight: "400" }] },
  { id: "instrument-serif", name: "Instrument Serif", kind: "serif", like: "editorial serif, the italic for accent words", license: "OFL", weights: [400, 400], italic: true, upright: true, metrics: { xh: 0.51, cap: 0.72, asc: 0.99, desc: 0.31 }, files: [{ file: "instrument-serif.woff2", style: "normal", weight: "400" }, { file: "instrument-serif-italic.woff2", style: "italic", weight: "400" }, { file: "../instrument-serif-italic.woff2", style: "italic", weight: "400" }] },
  { id: "playfair", name: "Playfair Display", kind: "serif", like: "Didot italic", license: "OFL", weights: [400, 900], italic: true, upright: false, metrics: { xh: 0.514, cap: 0.708, asc: 1.082, desc: 0.251 }, files: [{ file: "../playfair-italic-var.woff2", style: "italic", weight: "400 900" }] },
  { id: "allura", name: "Allura", kind: "script", like: "thin elegant script", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.295, cap: 0.59, asc: 0.8, desc: 0.45 }, files: [{ file: "allura.woff2", style: "normal", weight: "400" }] },
  { id: "caveat", name: "Caveat", kind: "script", like: "handwriting", license: "OFL", weights: [400, 700], italic: false, upright: true, metrics: { xh: 0.4, cap: 0.61, asc: 0.96, desc: 0.3 }, files: [{ file: "caveat.woff2", style: "normal", weight: "400 700" }] },
  { id: "dancing-script", name: "Dancing Script", kind: "script", like: "casual script", license: "OFL", weights: [400, 700], italic: false, upright: true, metrics: { xh: 0.332, cap: 0.72, asc: 0.92, desc: 0.28 }, files: [{ file: "dancing-script.woff2", style: "normal", weight: "400 700" }] },
  { id: "great-vibes", name: "Great Vibes", kind: "script", like: "formal script", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.328, cap: 0.75, asc: 0.851, desc: 0.401 }, files: [{ file: "great-vibes.woff2", style: "normal", weight: "400" }] },
  { id: "homemade-apple", name: "Homemade Apple", kind: "script", like: "signature handwriting", license: "Apache-2.0", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.586, cap: 0.998, asc: 1.296, desc: 0.846 }, files: [{ file: "homemade-apple.woff2", style: "normal", weight: "400" }] },
  { id: "kaushan-script", name: "Kaushan Script", kind: "script", like: "bold brush script", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.452, cap: 0.714, asc: 1.084, desc: 0.367 }, files: [{ file: "kaushan-script.woff2", style: "normal", weight: "400" }] },
  { id: "pacifico", name: "Pacifico", kind: "script", like: "retro brush script", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.46, cap: 0.84, asc: 1.303, desc: 0.453 }, files: [{ file: "pacifico.woff2", style: "normal", weight: "400" }] },
  { id: "permanent-marker", name: "Permanent Marker", kind: "script", like: "marker pen", license: "Apache-2.0", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.61, cap: 0.74, asc: 1.109, desc: 0.317 }, files: [{ file: "permanent-marker.woff2", style: "normal", weight: "400" }] },
  { id: "satisfy", name: "Satisfy", kind: "script", like: "brush script", license: "Apache-2.0", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.407, cap: 0.749, asc: 0.935, desc: 0.489 }, files: [{ file: "satisfy.woff2", style: "normal", weight: "400" }] },
  { id: "jetbrains-mono", name: "JetBrains Mono", kind: "mono", like: "code mono", license: "OFL", weights: [100, 800], italic: false, upright: true, metrics: { xh: 0.55, cap: 0.73, asc: 1.02, desc: 0.3 }, files: [{ file: "jetbrains-mono.woff2", style: "normal", weight: "100 800" }] },
  { id: "space-mono", name: "Space Mono", kind: "mono", like: "typewriter mono", license: "OFL", weights: [400, 700], italic: false, upright: true, metrics: { xh: 0.496, cap: 0.7, asc: 1.12, desc: 0.361 }, files: [{ file: "space-mono-400.woff2", style: "normal", weight: "400" }, { file: "space-mono-700.woff2", style: "normal", weight: "700" }] },
  { id: "vt323", name: "VT323", kind: "mono", like: "a VCR's on-screen text", license: "OFL", weights: [400, 400], italic: false, upright: true, metrics: { xh: 0.4, cap: 0.56, asc: 0.8, desc: 0.2 }, files: [{ file: "../vt323-400.woff2", style: "normal", weight: "400" }] },
];

const BY_ID = new Map(FONTS.map((f) => [f.id, f]));

/** A font by its id (Inter when there's no such font). */
export function fontById(id: string | undefined): FontDef {
  return (id && BY_ID.get(id)) || BY_ID.get("inter")!;
}

/** The family name a font is drawn under. */
export const familyOf = (f: FontDef) => `NZ ${f.name}`;

/** The nearest weight the font has. */
export const weightIn = (f: FontDef, w: number) => Math.min(f.weights[1], Math.max(f.weights[0], Math.round(w / 100) * 100));

/** The canvas keyword for a width in % of normal (the nearest the face has). */
export function stretchKeyword(f: FontDef, pct: number | undefined): CanvasFontStretch {
  if (!pct || !f.stretch) return "normal";
  const p = Math.min(f.stretch[1], Math.max(f.stretch[0], pct));
  const keys: [number, CanvasFontStretch][] = [
    [50, "ultra-condensed"],
    [62.5, "extra-condensed"],
    [75, "condensed"],
    [87.5, "semi-condensed"],
    [100, "normal"],
    [112.5, "semi-expanded"],
    [125, "expanded"],
    [150, "extra-expanded"],
    [200, "ultra-expanded"],
  ];
  return keys.reduce((best, k) => (Math.abs(k[0] - p) < Math.abs(best[0] - p) ? k : best))[1];
}

/** The canvas font string for a font at a size (pixels), a weight and slant. */
export function fontString(f: FontDef, px: number, weight: number, italic = false): string {
  const slant = italic && f.italic ? "italic " : "";
  return `${slant}${weightIn(f, weight)} ${Math.round(px * 10) / 10}px "${familyOf(f)}"`;
}

// The files' URLs, by their path under assets/fonts.
const URLS = import.meta.glob("../../assets/fonts/**/*.woff2", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const urlOf = (file: string) => URLS[file.startsWith("../") ? `../../assets/fonts/${file.slice(3)}` : `../../assets/fonts/lib/${file}`];

const loading = new Map<string, Promise<void>>();

/** Load a font into the page (or the worker) once; later calls wait for the same load. */
export function loadFont(id: string): Promise<void> {
  const f = fontById(id);
  let p = loading.get(f.id);
  if (p) return p;
  const set = (globalThis as unknown as { fonts?: FontFaceSet }).fonts ?? (typeof document !== "undefined" ? document.fonts : undefined);
  if (!set || typeof FontFace === "undefined") return Promise.resolve();
  p = Promise.all(
    f.files.map(async (file) => {
      const url = urlOf(file.file);
      if (!url) return;
      const face = new FontFace(familyOf(f), `url(${url})`, { style: file.style, weight: file.weight, ...(file.stretch ? { stretch: file.stretch } : {}) });
      await face.load();
      set.add(face);
    }),
  ).then(() => undefined);
  p.catch(() => loading.delete(f.id));
  loading.set(f.id, p);
  return p;
}

/** Load every font in `ids`. */
export const loadFontsFor = (ids: Iterable<string>) => Promise.all([...new Set(ids)].map(loadFont)).then(() => undefined);
