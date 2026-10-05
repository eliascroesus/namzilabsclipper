# jiia 1789492941: Mochi "Voice Clone 2.0" promo, text and layering breakdown

> Measured frame by frame for the Mimic page (docs/mimic-text.md). The evidence frames named below (extra/...) were kept out of this public repository: they're frames of someone else's video.

Source: `inspirationedit/jiia_1789492941_3986874505613100171_7181902700.mp4`, 1276 x 718, 23.976 fps, 1586 frames (66.15 s).
Frame numbers are 0-based (f = t x 23.976). Pixel values are in the 1276 x 718 frame. "Stabilised" means the camera move of the
footage has been undone with a per-frame similarity transform (ORB features outside the person, RANSAC), so a value that stays
constant there is fixed to the footage. Engine numbers use ENGINE.md units (size = font px / 718, other lengths in em).
Evidence images are in `extra/` (listed at the end).

## 1. At a glance

| Frames | Time (s) | Segment | Text and graphics |
|---|---|---|---|
| 0 to 395 | 0.00 to 16.47 | Talking head A: night apartment, blue city windows left, warm lamp and TV right; speaker centred | white stacked captions beside the head, giant gradient words behind him, review-card cloud behind him, "Introducing VOICE CLONE 2.0" and the orb |
| 395 to 597 | 16.47 to 24.90 | Motion graphic, deep purple | orb, magenta waveform, transcript ticker, Voice Settings sliders |
| 598 to 836 | 24.94 to 34.87 | Motion graphic, lavender | orb, four scene photo cards, cursor, duotone scene behind the orb, "Intelligent" panel, prompt bar with Start |
| 837 to 1030 | 34.91 to 42.96 | Motion graphic, dark navy with blue arcs | orb, "What do you sell?", circle reveal of a second shot of the speaker, white waveform, "Building your voice clone" progress bar |
| 1030 to 1112 | 42.96 to 46.38 | Kinetic type on dark purple | "So whenever your team needs to send a personal voice note" |
| 1116 to 1176 | 46.55 to 49.05 | UI | chat composer + "Scene: Car" dropdown + Convert |
| 1176 to 1236 | 49.05 to 51.55 | UI | voice-note player pill |
| 1236 to 1346 | 51.55 to 56.14 | UI | DM notification stack scrolling, ends on "Ronald / You: Sent a voice message" |
| 1346 to 1397 | 56.14 to 58.27 | Logo | light-streak reveal of "VOICE CLONE 2.0" |
| 1398 to 1482 | 58.31 to 61.81 | Tagline | "Making every conversation feel personal" |
| 1482 to 1585 | 61.81 to 66.11 | End card | Mochi mascot + "mochi" wordmark |

Talking head treatment, only where it matters for the text. The edit pushes in and out on almost every caption change, and
the captions are composited into the footage layer, so they zoom and drift with it:

| Zoom move | Frames | Frame scale | Fixed point (px) | Caption it carries |
|---|---|---|---|---|
| ease-out pull-back | 0 to 17 | 0.868 | (1367, 411) | Mochi / has been |
| pull-back | 23 to 36 | 0.722 | (375, 226) | first (entry) |
| push-in | 43 to 53 | 1.117 | (630, 354) | only |
| pull-back | 60 to 70 | 0.898 | (661, 364) | tool |
| push-in, then 62 px pan left | 80 to 88, 104 to 112 | 1.31 | (89, 359) | type something |
| whip blur transition | 122 to 129 | n/a | n/a | type something out, and transform in |
| pull-back | 143 to 164 | 0.725 | (1170, 368) | it into, voice |
| push-in | 168 to 178 | 1.099 | (598, 321) | voice exit |
| pull-back | 192 to 205 | 0.911 | (706, -584) | review cards |
| push-in | 227 to 243 | 1.296 | (201, 235) | now |
| pull-back | 274 to 294 | 0.774 | (222, 238) | better exit, Introducing |

Proof that the text rides the footage: on "Mochi" (f4 to f24) the frame zooms out by 13 %, yet the stabilised word centre
stays at x 393 to 394 px and its stabilised scale at 1.00 +- 0.01; the same holds for first (left edge 147 to 150 px from f27 to
f45 while the frame scale changes 0.75 to 1.0), only, tool, voice and type something (stabilised position constant within 1 to 2 px).

## 2. Text styles

All caption words are NORMAL blend and fully opaque (section 2.3). One display family (an extended neo-grotesk) is used at
three treatments; the UI and the closing lines use a normal-width UI grotesk.

### 2.1 Style table

| id | Role | Font (closest free / likely original) | Weight, width, case | Cap / x-height (px, % of 718) | Engine size | Tracking | Fill | Effects |
|---|---|---|---|---|---|---|---|---|
| stack_white | base stacked caption beside the head | Mona Sans wdth 125 / GT America Extended or Helvetica Now Display Extended | 700, extended, as said (lowercase, "Mochi" capitalised) | cap 57 (7.9 %), x 24 to 50 (3.3 to 7.0 %) | 0.062 to 0.130 per word (Mochi 0.109) | -0.02 em | solid #F9F8FF | drop shadow black 35 %, offset (2, 3) px, blur 5 px |
| stack_white_small | connector words (and, it, has) | same | 700, extended, lower | x 24 to 26 (3.4 %) | 0.063 to 0.068 | -0.02 em | #F9F8FF | same shadow |
| giant_gradient | hook word BEHIND the speaker (first, voice) | same | 700, extended, lower | x 240 (33.4 %) on first, 200 (27.9 %) on voice | 0.62 / 0.52 | -0.02 em | animated 5-stop linear gradient across the line, red to periwinkle | outer glow 3 px, red on the left half, blue on the right half |
| mid_gradient | emphasis pair flanking the head (only ... tool) | same | 700, extended, lower | x 86 (12.0 %) | 0.223 | -0.01 em | same ramp spread over the whole line (only = left end, tool = right end) | same glow |
| typed_white | typed line (type something) | same | 700, extended, lower | x 25 (3.5 %) | 0.065 | -0.02 em | #F9F8FF | same shadow |
| intro_label | "Introducing" | Inter / SF Pro Display Semibold | 600, normal | cap 22, x 16 | inter 0.042 | 0 | magenta #E040E0 sweeping to white | magenta glow while magenta |
| product_caps | "VOICE CLONE 2.0" (title and end logo) | Mona Sans wdth 125 wght 900 / same extended family, Black | 900, extended, upper | cap 36 (5.0 %); 30 on the logo | 0.069 | -0.04 em | white | faint dark-violet halo |
| ui_transcript | "This is a voice clone. Isn't that crazy?", "What do you sell?", "Building your voice clone" | Inter / SF Pro Text Medium | 500, normal | cap 21 to 23, x 15 to 17 | inter 0.040 to 0.044 | 0 | #F2EEF8 (ticker #C9C3D6) | ticker: both ends faded over about 60 px |
| kinetic_line | "So whenever your team needs to send a personal voice note" | Inter / SF Pro Text Medium | 500, normal | cap 35, x 25.5 | inter 0.065 | 0 | type-on colour ramp dim magenta to magenta to white | none |
| accent_glow | "personal" in both late lines | Inter / SF Pro Semibold | 600, normal | x 25.5 (19 in the tagline) | inter 0.065 / 0.048 | 0 | gradient #FBE6FF > #F28CF5 > #C78BFF > #9FB2FF (tagline: #E040F0 to #C0C8FF) | pink-violet bloom #D040F0, 10 px, 60 % |
| tagline | "Making every conversation feel personal" | Inter / SF Pro Display Semibold | 600, normal | cap 25.5, x 18.5 | inter 0.049 | 0 | purple #9030C0 brightening to #F9F3FF | none |

Full numbers per style (engine block, candidates, evidence) are in `styles.json`.

### 2.2 Font identification

Display family (all lowercase captions, first, only, tool, voice, type something). Measured on clean frames
(f24, f40, f74, f170, f278):

- Glyphs: flat, horizontally cut top on t (also in "first" at 286 px tall); single-storey g with an open hooked tail; double-storey a
  with a straight stem and no spur; c, e and s end in horizontal cuts with tight apertures; y has a straight diagonal tail with a flat cut;
  v and w are pointed; i dot is a rectangle the width of the stem (74 x 60 px on "first", stem 74 px); o is nearly a circle
  (218 x 208 px on "voice").
- Proportions: x-height / cap height 0.74 (Mochi: 42 / 57); ascender / x-height 1.32 to 1.33 (better 66 / 50, only 114 / 86,
  first 320 / 240); stem / x-height 0.29 to 0.33 (Bold); words are 15 to 30 % wider than Inter Display at the same x-height.
- That combination (Helvetica-like terminals, flat t, square dots, extended width) points to a paid extended neo-grotesk:
  GT America Extended Bold or Helvetica Now Display Extended Bold. It is not Monument Extended or Druk Wide (their o is a wide
  ellipse; here it is round), not Unbounded (single-storey a), not SF Pro (round dots).
- Free candidates, scored by per-letter IoU on 10 giant letters (f, i, t from "first"; o, n, l, y from "only"; v, c, e from
  "voice"), each scaled to the measured x-height and aligned on the baseline (`extra/font_letter_overlays.jpg`):

| Candidate | Mean letter IoU | Word IoU (now, gets, even, better, Mochi, has been, only, tool) | Notes |
|---|---|---|---|
| Mona Sans wdth 125 wght 700 | 0.852 | 0.77 to 0.89 at tracking -0.02 em | best; widths match; e aperture slightly more open |
| Mona Sans wdth 112.5 wght 800 | 0.846 | 0.75 to 0.88 | a bit narrow |
| Hubot Sans wdth 112.5 wght 700 | 0.846 | n/a | more geometric c and e |
| Funnel Display 800 | 0.836 | n/a | narrow v (0.75), otherwise close |
| Zalando Sans SemiExpanded 700 | 0.834 | n/a | |
| Anybody wdth 120 wght 700 | 0.830 | n/a | t too short |
| Montserrat 700 (bundled) | 0.827 | n/a | geometric t and e |
| Archivo wdth 112.5 wght 800 (bundled) | 0.825 | n/a | closed c and e |
| TikTok Sans wdth 125 wght 700 (bundled) | 0.818 | 0.73 to 0.84, needs tracking -0.06 em | curved y tail |
| Inter Display 800 (bundled) | 0.802 | 0.71 to 0.80 | too narrow |
| Unbounded 600 / 700 (bundled) | 0.80 / 0.78 | n/a | single-storey a |

Recommendation: add Mona Sans (OFL, `@fontsource-variable/mona-sans`, axes wdth 75 to 125, wght 200 to 900) as `mona-sans`;
use wdth 125, wght 700 for captions and wght 900 for "VOICE CLONE 2.0". Bundled fallback: `tiktok-sans` stretch 125 weight 700
tracking -0.06.

UI grotesk ("Introducing", transcripts, kinetic line, tagline, UI labels): normal width, x / cap 0.73 to 0.75, single-storey g,
straight y: SF Pro / Inter. Use bundled `inter` 500 (labels) and 600 (titles, tagline).

Font metrics used for engine sizes (fontTools): Mona Sans wdth 125: x-height 0.536 em, cap 0.729 em; Inter: x-height 0.546, cap 0.728.

### 2.3 Colour, gradient, glow, shadow and blend measurements

Blend mode test (normal vs screen / multiply / overlay): the same glyph column sampled over very different backgrounds,
background taken from a stabilised clean plate:

| Glyph | Over background | Text colour | Over background | Text colour | Verdict |
|---|---|---|---|---|---|
| t of "first" (f40) | grey wall #555359 | #8667FF | black TV #110E12 | #7C74FC | normal (screen would give #AE... on the wall) |
| e of "voice" (f170) | warm wall #6A5B55 | #9755FE | black TV #110E12 | #9854FF | normal |
| v of "voice" (f170) | blue window #142960 | #FE0007 | blue window #02346F | #FF0546 | normal, pure red over blue |
| M of "Mochi" (f24) | navy #1C252F | #FCFAFF | black #1B1D21 | #FDF9FF | normal |

No caption uses a blend mode; opacity is 1.0 at rest. The only blend-like treatment in the video is the duotone scene photo
(section 6).

Giant / mid gradient (one ramp across the whole line, x 0.11 to 0.88 of the frame width; hue falls linearly at 0.118 deg per px,
direction +3 deg (range -7 to +13 deg over time), i.e. horizontal):

| Position on the line | 0.00 | 0.13 | 0.28 | 0.48 | 0.58 | 0.66 | 0.79 | 0.89 | 1.00 |
|---|---|---|---|---|---|---|---|---|---|
| "voice" f170 | #FE0008 | #FF0865 | #FF11B1 | #FD2893 | #EF31C1 | #BE35FC | #B03BFF | #905CFF | #6688FF |
| "first" f40 | #FF022A | #FF034A | #FF15A4 | #FE219A | (head) | #C135FC | #AB41FF | #826BFF | #628DFF |

Engine stops: #FF0018 at 0, #FF14A6 at 0.28, #FF2A98 at 0.52, #BE36FC at 0.66, #6688FF at 1.0 (the pink holds from 0.28 to 0.52,
then turns violet over 0.14). On "only ... tool" (f74): only #FD1F61 > #FD2186 > #FD1AA4, tool #AF3AFC > #8765FE > #5E8DFD > #44A5FF.

The gradient is animated: it slides back and forth by about 10 % of the span. Examples: left edge of "first" #FB0A4F (f29) >
#FC0016 (f35) > #FE1062 (f43); left edge of "voice" #FA0B58 (f159) > #FE000A (f167) > #FE0948 (f175); "only" is solid red
f49 to f55, then pink sweeps in from its right end f57 to f70; "tool" enters pink (#FE3799 at f61) and settles violet-blue by f66.

Glow on gradient words (clean-plate difference outside the glyphs): red side R +84, +60, +30, +12, +3, 0 at 0 to 1.5, 1.5 to 3,
3 to 5, 5 to 8, 8 to 12, 12+ px with G and B -10 (a red #FF0A2D glow at 36 % at the edge); blue side B +46, +38, +22, +13, +8 with R
and G about 0 (a blue #2040FF glow). Gaussian-like, blur about 3 px regardless of word size (0.012 em on "first", 0.02 em on "only").

White caption shadow (clean plate f2 under "Mochi has been" f24, bright background only): -29 / -15 / -6 levels at 2 to 3 / 3 to 5 /
5 to 8 px below the letters, -14 / -12 / -7 to the right, 0 above and left: black, about 35 % at the edge, offset (2, 3) px, blur 5 px.
Text core #F9F8FF.

## 3. Caption events

Spoken times are Parakeet onsets; the envelope shows onsets 0.1 to 0.2 s earlier for some words (given where it matters).
Boxes are frame fractions [x0, y0, x1, y1] at the settled frame; head = hair + face classes of the selfie multiclass model.

| # | Frames (t) | Text and styles | bbox | head | Layer | Enter | Exit | Lands on |
|---|---|---|---|---|---|---|---|---|
| 1 | 4 to 27 (0.17 to 1.13) | Mochi / has been (stack_white, has + been 37.5 px x) | 0.213, 0.416, 0.502, 0.585 | 0.555, 0.142, 0.739, 0.560 | front (no overlap) | per word rise 14 px + fade + blur 8 px, 9 frames; Mochi f4, has f10, been f18 | fade 3 frames (1.00, 0.72, 0.52, 0) | words start 4 to 11 frames before their ASR onset and settle 0 to 4 frames before it |
| 2 | 27 to 45 (1.13 to 1.88) | first (giant_gradient) | 0.115, 0.181, 0.878, 0.628 | 0.470, 0.198, 0.598, 0.514 | BEHIND | vertical stretch from the baseline: 0.05, 0.20, 1.03, 1.17, 1.18, 1.12, 1.07, 1.04, 1.03, 1.02, 1.01, 1.00 (f27 to f38) | vertical squash to the baseline, ease-in: 0.985, 0.944, 0.868, 0.722, 0.415, 0 (f41 to f46) | "first" onset about 1.24 s: full height at f29 (1.21 s), peak f31 |
| 3 | 47 to 85 (1.96 to 3.55) | only ... tool (mid_gradient) | 0.119, 0.393, 0.889, 0.596 | 0.473, 0.175, 0.605, 0.487 | front (no overlap) | same stretch per word, only f47, tool f58; only peak 1.20 at f51, slow settle to f70 | drop + fade: dy +0.3, 3, 7, 15, 25, 40, 57, 76 px (f78 to f85), opacity 1, 0.83, 0.66, 0.49, 0.30, 0.12, 0 (f80 to f86) | only 2.0 s, tool 2.58 s (6 frames early) |
| 4 | 87 to 125 (3.63 to 5.21) | type something (typed_white) | 0.198, 0.409, 0.486, 0.479 | 0.527, 0.084, 0.708, 0.507 | front (no overlap) | typewriter, 17.7 chars/s, no caret | whole-frame whip blur f122 to f126 | done at f106 as "type" is said (4.32 s) |
| 5 | 128 to 154 (5.34 to 6.42) | and / transform / it into (small, base, small + base) | 0.499, 0.393, 0.794, 0.582 | 0.274, 0.113, 0.451, 0.504 | front (no overlap) | and + transform with the whip f128; it f131: dy +19 > 0 and opacity 0 > 1 in 10 frames; into f138 in 8 frames | carried off by the 0.725 pull-back, then cut | it starts f131 and settles f141 (ASR onset f142); into starts f138, settles f146 (ASR f149) |
| 6 | 157 to 177 (6.55 to 7.38) | voice (giant_gradient) | 0.097, 0.162, 0.878, 0.536 | 0.426, 0.194, 0.553, 0.492 | BEHIND | stretch: 0.05, 0.17, 1.04, 1.19, 1.21, 1.16, 1.11, 1.08, 1.06, 1.04, 1.03, 1.02, 1.01, 1.00 (f157 to f170) | squash: 0.98, 0.94, 0.67, 0.55, 0.33, 0 (f173 to f178) | "voice" onset about 6.67 s, peak f161 (6.71 s) |
| 7 | 239 to 285 (9.97 to 11.89) | now / it gets / even / better (4 lines, 5 sizes) | 0.219, 0.316, 0.526, 0.571 | 0.554, 0.149, 0.730, 0.552 | front (no overlap) | per word rise + fade + blur; now f239, it f244, gets f246, even f259, better f267 | fade 4 frames with blur during the 0.774 pull-back | 0 to 7 frames before each onset |
| 8 | 288 to 394 (12.01 to 16.43) | Introducing (intro_label) / VOICE CLONE 2.0 (product_caps) | 0.317, 0.454, 0.639, 0.556 | 0.475, 0.192, 0.612, 0.467 | front, then over the orb | Introducing: letter type-on with collapsing spacing; VOICE, CLONE, 2.0: per-word 3D swing-in (rotateY about 70 deg to 0, 5 frames, 4 frame stagger); magenta, then a sweep to white f300 to f318 | entry reversed, right to left: 2.0, CLONE, VOICE swing out (f395 to f400), Introducing spreads and fades (f397 to f401), after the orb's ring wipe | Introducing 11.76 s, Voice 12.40, 2.0 13.36 |
| 9 | 424 to 597 (17.68 to 24.90) | This is a voice clone. Isn't that crazy? (ui_transcript) | 0.395, 0.779, 0.608, 0.830 | none | front (graphic) | words fade in about 4 frames each as spoken; the line scrolls left in eased bursts (10 to 15 px per frame after each word, 2 to 4 px between; window about 270 px with 60 px faded ends) | fade | voice 18.08 s, crazy 19.52 s |
| 10 | 850 to 941 (35.45 to 39.25) | What do you sell? (ui_transcript) | 0.404, 0.730, 0.593, 0.767 | none | front (graphic) | word by word fade-in, one word per 3.3 frames (What f850, do f854, you f857, sell? f860), centred | slides left with the circle reveal and fades right to left by f941 | UI text, not word-synced (app question) |
| 11 | 947 to 1026 (39.50 to 42.79) | Building your voice clone (ui_transcript) | 0.128, 0.728, 0.389, 0.769 | none | front (graphic) | word by word fade-in, one word per 3.3 frames (Building f947, your f950, voice f954, clone f957), left aligned over the progress bar | slides out left with the scene | UI status text |
| 12 | 1033 to 1110 (43.08 to 46.30) | So whenever your team needs to send a personal voice note (kinetic_line + accent_glow on personal) | 0.000, 0.444, 0.951, 0.556 | none | front (graphic) | character type-on 35 chars/s with a brightness ramp (dim magenta > magenta > white), line rises 34 px and drifts left | whip pan left f1055 to f1063, push-in, whip up f1104 to f1110 | runs 4 to 10 frames ahead; the whip lands on "personal" (44.62 s) |
| 13 | 1402 to 1482 (58.48 to 61.81) | Making every conversation feel personal (tagline + accent_glow) | 0.253, 0.481, 0.752, 0.540 | none | front (graphic) | word by word in purple, line settles from 132 % to 100 % and slides right into the centre over 40 frames | fade 6 frames | "personal" lights up at f1446 to f1450, on its onset (60.44 s) |

Per-frame curves for every event (rise distances, opacities, blur, stretch factors) are in `captions.json`.

Layout of the stacked captions:

- Lines step to the right as they go down (a cascade): line centres move +94 px (Mochi > has been), +106 and +105 px
  (and > transform > it into), +33, +61, +60 px (now > it gets > even > better). Left edges are not aligned.
- Each word has its own size: content words big, connector words small. x-heights: Mochi 42, has / been 37.5, and 26,
  transform 35, it 24, into 40, now 35, it 25, gets 40, even 30, better 50 px. The last word of a block is the biggest in 2 of 3 blocks.
- Leading is tight: baseline gaps 38 to 64 px; in engine terms 0.78 to 1.0 (median 0.9). Ascenders of a lower line reach the baseline
  of the line above (transform under and).
- Placement alternates: left of the head (block centre x 0.36, y 0.44 to 0.50), right of the head (x 0.65, y 0.49), never over it.
  The giant words are centred (x 0.49), baseline at y 0.54 to 0.63, and span 76 to 79 % of the frame width.

## 4. Text behind the person

| Instance | Frames | What is hidden | Edge |
|---|---|---|---|
| "first" | 27 to 45 | 15.8 % of the word area (x 495 to 846 px): most of r and the left half of s are behind the head; the raised hand covers the bottom of s | soft 2 to 4 px matte following the hair, no outline, no glow, no light wrap; recomputed every frame as he moves (`extra/behind_first.jpg`) |
| "voice" | 157 to 177 | 21.6 % (x 385 to 772 px): the i stem and the inner parts of o and c; the i dot (64 x 34 px visible) sits above the hair line | same soft hair matte, tracks every frame (`extra/behind_voice.jpg`) |
| review cards | 190 to 233 | cards on both sides pass behind the head, neck and shoulders, e.g. "...lity is honestly better than I expected from an" starts at the jaw line | same matte; the cards also receive the depth-of-field blur of their plane (`extra/behind_cards.jpg`) |

Not behind: all white captions (they are placed beside the head and never overlap him, so the layer cannot be observed),
"only ... tool" (the 325 px gap between the words holds the head), "type something", and "Introducing VOICE CLONE 2.0", which sits
on top of his shirt and then on top of the orb.

Other cutout and mask tricks:

- The orb (f323 to f395) is drawn IN FRONT of the speaker, then expands as a cyan-blue ring that wipes to the purple graphic world
  (circle wipe outwards, ring diameter 267 > 497 > 871+ px over f386 to f394).
- Circle reveal at 38.6 s (f924 to f1028): a second shot of the speaker is shown inside a circle of radius 566 px (0.79 of the frame
  height) centred at (1195, 357), so only its left 650 px are on screen; the rim is a 5 to 6 px white-lavender ring with a 20 px violet
  bloom. It slides in from the right with ease-out over 22 frames (left edge 951, 852, 791, 745, 710, 682, 661, 646, 637, 631, 630 px)
  and back out with ease-in over 16 frames. This is a masked picture-in-picture, not a person cutout.
- The scene photo picked in the lavender scene appears behind the orb inside a soft circular vignette (radius about 420 px) as a violet
  duotone (section 6).

## 5. Word effects

- Gradient fill across the whole line (not per word), 5 stops red > hot pink (held) > violet > periwinkle, animated offset (section 2.3).
- Coloured outer glow that follows the gradient (red on the left, blue on the right), about 3 px, 36 % at the edge.
- Vertical stretch entry from the baseline with spring overshoot (+18 to +21 % at 4 frames, settled at 11 to 12 frames) plus 2 frames
  of vertical motion blur; vertical squash exit (ease-in cubic, 6 frames). Width stays constant: it is scaleY only.
- Sparkles around and over the giant words: concave 4-point stars, pale pink #FFD6E4 with a soft pink edge, 10 to 35 px, 2 to 5 visible at
  once, each spinning about 8 deg per frame while drifting and shrinking out over 6 to 8 frames; drawn in front of the word
  (f30 to f40 on first, f160 to f172 on voice).
- Rise + fade + blur per word for the stacked white captions: from +14 to +19 px below (about 2.5 % of the frame height) to 0 with an
  ease-out between quadratic and cubic over 8 to 11 frames ("into": 1, 0.76, 0.49, 0.33, 0.17, 0.07, 0.03, 0 of 18.9 px), opacity
  0 to 1 near-linearly over the same frames, blur 2 to 8 px on the first 1 to 2 frames, scale fixed at 1.00, no overshoot; each word is
  timed to finish on its spoken onset.
- Drop exit for "only ... tool": both words fall 76 px with accelerating speed while fading over 6 frames.
- Typewriter ("type something", 87 to 106): 14 characters in 19 frames = 17.7 characters per second, whole characters, no caret, no
  per-letter fade; starts on "allow" and completes as "type" is spoken.
- Spaced type-on ("Introducing", f289 to f302): one letter per 1.2 frames, each landing about 2 x its normal gap to the right; the gaps
  close within 2 to 4 frames; magenta first, then a left-to-right sweep to white (still magenta on "ing" at f316).
- 3D swing-in on "VOICE CLONE 2.0" (f292 to f306): each word rotates in from about 70 deg around its vertical axis with perspective,
  flat after about 5 frames, words 4 frames apart, magenta then white; a glowing magenta square rides the right end.
- Kinetic type-on with a colour ramp ("So whenever...", 43.1 s): 35 characters per second, each character appears dim magenta
  (#571E66, about 30 %), reaches full magenta #C850D1 about 5 frames later, then pink-lavender #DB79E2 and white; the brightness front lags
  the typing front by 150 to 200 px. No caret.
- Highlight word with gradient and bloom ("personal"): gradient #FBE6FF > #F28CF5 > #C78BFF > #9FB2FF, bloom #D040F0 10 px at 60 %;
  switched on when the word is spoken.
- Ticker transcript ("This is a voice clone..."): words fade in as spoken and the line scrolls left in eased bursts (about 130 px per
  second on average) inside a 270 px window whose ends fade over about 60 px.
- Purple-to-white reveal with a settle zoom (tagline): words arrive purple at about 40 to 50 % and brighten to white; the line
  shrinks from 132 % to 100 % while sliding right into the centre over 40 frames.
- No underline, no highlight box, no karaoke colour change in the talking-head captions, no emoji.

## 6. Pop-ups and motion-graphic overlays

Details and per-frame numbers are in `popups.json`; the main points:

| Overlay | Frames | Shape | Fill / border / shadow | Enter | Exit | Layer |
|---|---|---|---|---|---|---|
| Review / chat cards (10 to 12) | 189 to 233 | radius about 6 px (far), 10 (middle), 14 (near); 215 x 47, 300 x 95, 420 x 135+ px | #26282D, 1 px #3A3D44, coloured avatar squares (radius 25 %), orange CLIENT chip, shadow 0 6 18 black 50 % | rise from below the frame while un-tilting from rotateX about 55 deg, 8 frames ease-out, 1 frame stagger (avatar y 651 > 238) | fall back down, tilting, 11 frames ease-in | BEHIND the speaker, three depth planes with DOF blur |
| Title decor | 292 to 330 | dashed magenta rectangle, 2 px, 10 px dashes; glowing diamonds 10 to 16 px | #E040F0, glow 12 px | line draws on f295 to f312 | fades with the orb | front |
| Orb | 323 to 1030 | soft sphere, 258 px with bloom (0.36 H) on the talking head, 196 to 260 px with bloom in UI scenes (core 150 to 180), centred or shifted to x 0.26 to 0.33 beside a panel | cyan / magenta / violet / peach swirl, magenta rim bloom 15 to 25 px | rises as a 1000 px disc from below (f324 to f336), shrinks to 258 px centred (f336 to f370), ease-out | ring expands to full frame f386 to f395 | over the speaker |
| Waveform | 416 to 1012 | 2 px bars, 3 px gaps, up to 130 px tall (typically 20 to 70) on a dotted line, about 450 px long | magenta #E040C8 glow (purple scene), white (navy scene) | bars grow from the line | bars collapse | front |
| Voice Settings sliders | 488 to 597 | x 814 to 1122, 4 px tracks 302 px long, 86 px apart, 16 to 18 px knobs, no card | filled #E8E0FF with glow, empty #5A4FD0, white Inter Medium labels cap 15 px | dots, then labels type on, tracks draw leftwards, knobs slide while values count down (2,00x > 1,04x; 100 % > 40 %), 32 frames ease-out | camera push + wipe | front |
| Scene photo cards (4) | 601 to 745 | about 95 x 110 px, radius 8, 1 px violet border | shadow 0 6 14 #3A1060 45 % | fly in from the right on a 3D arc, 12 frames, 1 to 2 frame stagger | burst outward with glass bars | front |
| Duotone scene | 680 to 745 | full frame inside a circular vignette r about 420 px | gradient map #5A37D1 (black) > #EAC8FF (white), hue 260 deg | cross-fades in behind the orb as the picked card drops into it | bursts with the cards | behind the orb |
| Cursor | 596 to 1172 | 3D arrow about 34 x 40 px | gradient #F040F0 > #A020E0, glow 10 px | moves on eased arcs, 12 to 20 frames per move; tap = 2 frame dip to 90 % | n/a | top-most |
| Glass bars | 742 to 762 | 24 to 60 x 120 to 300 px, radius 4 | pastel cyan / pink / white glass at 70 % | fly up through the frame with motion blur | n/a | front |
| "Intelligent" panel | 748 to 808 | card radius 17 px, rows radius 10 px (485 x 64) | card #F8F4FC, rows white, shadow 0 10 30 #9A60D0 35 % | rises from the bottom scaling up from about 70 %, 12 frames | push-in 2.4 x, tapped row tints violet, pixel dissolve | front |
| Prompt bar + Start | 810 to 840 | radius 26 px, Start pill 90 x 44 px | #FCFAFE, grey text, magenta glow on tap | slides in from the right, letters arrive with wide tracking that collapses | whip into navy | front |
| Circle reveal | 924 to 1028 | circle r 566 px at (1195, 357) | rim 5 to 6 px #F4F0FF + 20 px violet bloom | slide from the right, 22 frames ease-out | slide right, 16 frames ease-in | picture-in-picture |
| Progress bar | 940 to 1028 | pill 250 x 6 px | fill #E890F8 > #F4C8FF on #6A2A70 track | fills 0 > 75 % roughly linearly | slides out with the scene | front |
| Chat composer + dropdown | 1116 to 1176 | bar radius 12, send button 28 px radius 7, dropdown radius 7 | white bar, blue #4A6CF0 send, lilac dropdown, magenta Convert | bar slides up with blur, text types (about 4 to 5 chars per frame, letters close up), dropdown pops 0.8 > 1 | taps Convert, then a vertical swap: drops out of the bottom as the pill drops in from the top (3 frames, motion blur) | front |
| Voice-note pill | 1176 to 1236 | full pill 692 x 137 px, play 36 px, close 28 px | white > lavender, grey bars, black close button, white bloom 16 px | drops in from the top, lands with +3 % overshoot (width 577, 632, 645, 634, 626, 624 px over f1175 to f1180), icons and close button grow in over 10 frames | close button shrinks to a dot, play icon morphs to a dot, pill drops out of the bottom as the first notification rises in | front |
| Notification stack | 1236 to 1346 | radius 15 px, about 250 x 52 px, 10 px gaps | #F2F0F6, gradient avatar circles, skeleton lines, shadow 0 8 24 black 35 % | rises from the bottom, fast upward scroll with heavy motion blur, then decelerates 20 > 0.5 px per frame over f1288 to f1314 | cards slide up, last card fades | front |
| Logo reveal | 1346 to 1397 | product_caps | outline (1.5 px white stroke) then solid white | light streaks, stretched outline letters, settle, fill | scale down to 20 % in 6 frames | front |
| End card | 1482 to 1585 | mascot + "mochi" wordmark | white rounded heavy lowercase | dither dissolve, mascot pops with stars, wordmark types on violet > white | fade | front |

Transitions between the talking head and the graphics: whip blur (f122 to f129, f1055 to f1063, f1104 to f1110), vertical swaps with
motion blur between UI pieces (f1172 to f1175, f1233 to f1236), circle wipe outwards
from the orb (f386 to f395), lavender circle wipe (f590 to f599), whip into navy (f836 to f842), circular mask slide (f924 to f1028),
pixel / grain dissolves (f804 to f810, f1482 to f1488).

## 7. Recipe (everything a renderer needs)

Fonts: `mona-sans` (Mona Sans variable, wdth 125) 700 and 900; `inter` 500 and 600.

Talking-head captions (0 to 16.5 s):

1. Draw captions into the footage layer before the edit's camera moves, so they scale and drift with every punch-in (section 1 table).
2. Base style: mona-sans 700 wdth 125, tracking -0.02 em, #F9F8FF, shadow rgba(0,0,0,0.35) offset (0.025, 0.04) em blur 0.06 em,
   normal blend. Per-word sizes: content words 0.090 to 0.130, connector words 0.062 to 0.068, line-final word biggest.
3. Stack 2 to 4 lines, 1 to 2 words per line, leading 0.9 on the larger cap height, each line's centre stepped +30 to +105 px
   (2.5 to 8 % of the frame width) to the right of the line above. Place the block beside the head on the side with more room:
   centre x 0.36 (left) or 0.65 (right), y 0.44 to 0.50.
4. Word entry: start about 8 frames (4 to 11) before the spoken onset, so it settles on it; dy from +2.5 % of the frame height to 0, ease-out
   (quadratic to cubic) over 8 to 11 frames; opacity 0 to 1 over the same frames, near-linear; Gaussian blur 2 to 8 px on the first
   1 to 2 frames.
5. Page exit: opacity 1 > 0 in 3 to 4 frames, timed with the next zoom or whip.
6. Hook words (1 in 3 captions, the emotional key word): mona-sans 700 lowercase, x-height 28 to 33 % of the frame height, centred,
   76 to 79 % of the frame width, baseline at y 0.54 to 0.63, BEHIND the person (cutout with a soft 2 to 4 px matte over it).
   Fill: linear gradient across the line, stops #FF0018 0, #FF14A6 0.28, #FF2A98 0.52, #BE36FC 0.66, #6688FF 1.0, angle 0; slide the
   gradient offset by +-10 % of its span with a slow ease in-out (one swing per 8 to 12 frames). Glow 3 px, 36 % at the edge,
   #FF0A2D left half, #2040FF right half.
   Entry: scaleY about the baseline 0.05 > 0.20 > 1.03 > 1.17 > 1.18 > 1.12 > 1.07 > 1.04 > 1.03 > 1.02 > 1.01 > 1.00 (one value per
   frame), vertical motion blur on frames 2 and 3, start 3 to 4 frames before the onset. Exit: scaleY 0.985, 0.944, 0.868, 0.722,
   0.415, 0 (ease-in cubic over 6 frames). Add 2 to 5 sparkles at a time (concave 4-point stars 10 to 35 px, #FFD6E4, spinning 8 deg per frame, 6 to 8 frame life) in front of the word.
7. Pair variant ("only ... tool"): same treatment at x-height 12 % of the frame height, the two words at the ends of one line with
   the head in the gap, the gradient spread over the whole line; each word stretches in on its own onset; exit both by falling 76 px
   with ease-in while fading over 6 frames.
8. Typed variant: 17.7 characters per second, no caret, finishes as the key word is spoken.
9. Title card: "Introducing" inter 600 at 0.042 above "VOICE CLONE 2.0" mona-sans 900 wdth 125 caps at 0.069 tracking -0.04, centred
   on the speaker; spaced letter type-on and per-word 3D swing-in (rotateY 70 deg to 0 in 5 frames, 4 frame stagger) in #E040E0, sweep to
   white over 18 frames; then the orb rises over him.

Motion-graphic text: inter 500 white at 0.040 to 0.044 (transcripts), inter 500 at 0.065 (kinetic line, 35 characters per second,
colour ramp #571E66 > #C850D1 > #DB79E2 > #FCF1FF), inter 600 at 0.049 (tagline, purple to white, settle from 132 %), accent word
gradient #FBE6FF > #F28CF5 > #C78BFF > #9FB2FF with a 10 px #D040F0 bloom at 60 %.

## 8. Gaps: what a typical caption tool lacks for this look

1. Captions attached to the footage's camera move (zoom and pan with the clip) instead of screen-fixed.
2. Anticipation: words that start animating 4 to 11 frames before the spoken onset so they land on it.
3. Non-uniform scale: scaleY-only stretch about the baseline with a spring overshoot, plus a matching squash exit and directional
   (vertical) motion blur.
4. Per-word size inside a stack by word role (connector words small), and a cascading per-line horizontal offset.
5. A gradient spanning the whole line (and across a gap around the head), with an animated offset.
6. A glow whose colour follows the fill gradient.
7. Person cutout over text (behind layer) per caption, and also over graphics (the review-card cloud).
8. Sparkle particle bursts around a word.
9. Character type-on with a trailing colour / brightness ramp; type-on with collapsing letter spacing; per-word 3D swing-in (rotateY).
10. 3D UI cards with perspective, depth of field, rotateX entry; masked picture-in-picture circle reveal; duotone gradient map.
11. A "settle" zoom of a whole line (132 % to 100 %) while words are still arriving.

## 9. Fit to our engine (ENGINE.md)

Maps cleanly:

- Fonts: Inter 500 / 600 bundled. Display font: add `mona-sans` (OFL, `@fontsource-variable/mona-sans`, wdth 75 to 125, wght 200 to 900);
  until then `tiktok-sans` stretch 125 weight 700 tracking -0.06 is the closest bundled option (IoU 0.818 vs 0.852).
- Solid white base style with a drop shadow (shadow rgba(0,0,0,0.35), blur 0.06, x 0.025, y 0.04 em).
- Linear gradient with stops and `fillSpan: "line"` for the hook words and for "only ... tool" (stops #FF0018 0, #FF14A6 0.28,
  #FF2A98 0.52, #BE36FC 0.66, #6688FF 1, angle 0).
- `layout: "stack"` with per-style sizes, `leading` 0.9, `words` 2, `lines` 4.
- `behind` with `style: "giant"` and share 1.0: every caption holding a giant word is set behind the speaker; the engine's cutout
  gives the same layering (soft matte, per frame).
- Word-unit `rise` entry (dist 0.22 em, 0.38 s, ease out) and page `fade` exit (0.13 s).
- Normal blend everywhere: no blend modes are needed for this video.

Approximated:

- Rise + blur + slow fade in one move: the engine's `rise` brings opacity to 1 in the first third (0.13 s); the video fades over the
  whole 8 to 11 frames (0.33 to 0.46 s) and blurs 2 to 8 px on the first frames. Use `rise` (dist 0.22, dur 0.38, ease out); `blur`
  alone would lose the travel.
- Rise distance is constant in pixels (14 to 19 px = 2 to 2.6 % of the frame height), so in em it ranges 0.18 (Mochi) to 0.42 (it).
- Stretch entry (scaleY 0.05 > 1.18 > 1.0): nearest is `pop` from 0.2, overshoot 0.14, ease back, 0.46 s (uniform scale, peak at 53 % of the
  move instead of 36 %), or `bounce` from 0.05 overshoot 0.2.
- Squash exit: the engine plays the entry backwards, so a pop exit shrinks uniformly to the centre instead of squashing to the baseline in
  6 frames.
- Glow: one colour; use #FF1A60 (strength 0.4, blur 0.012 em) and lose the blue right half.
- Per-word sizes: the engine gives one size per style, so connector words need their own style and the picks cannot target them
  (rules are keyword / last / first / number / marked); mark them by hand.
- Cascade: `align` is shared by all lines of a place; centre alignment keeps the stack compact but loses the +30 to +105 px per-line step.
- Typewriter: `type` with unit word gives per-word letter reveal; set dur so that 17.7 characters per second is met (about 0.056 s per
  character x word length).
- The tagline settle zoom, the kinetic line's colour ramp and the transcript ticker: approximate with `fade` per word.

Cannot be expressed yet (with numbers to add):

1. Footage-attached captions: captions must inherit the clip's transform (zoom 0.72 to 1.36, pans up to 62 px).
2. Onset lead: a per-design offset of -4 to -11 frames (median -7, about -0.3 s) so motions finish on the onset.
3. scaleY-only motion with anchor at the baseline, spring overshoot +18 to +21 % at 4 frames, settle at 11 frames; and a squash exit
   with ease-in cubic over 6 frames (exit curve independent of the entry).
4. Motion blur along the motion direction (vertical, about 30 to 60 px on the 2 stretch frames).
5. Gradient animation: offset +-10 % of the span, period about 16 to 24 frames.
6. Gradient-tinted glow (two colours along the line) and glow radius in pixels (3 px) rather than em.
7. Per-line x offsets (cascade +30 to +105 px per line).
8. Per-character type-on rate (17.7 or 35 characters per second) independent of word timing, with a trailing colour ramp
   (#571E66 > #C850D1 > #DB79E2 > #FCF1FF over about 15 frames).
9. Sparkle particles (2 to 5 at a time, 10 to 35 px, spin 8 deg per frame, 6 to 8 frame life).
10. Cutout over non-text graphics (the 3D review cards behind the speaker) and 3D card layers with perspective and depth-of-field.
11. Masked picture-in-picture (circle r 0.79 H with a glowing rim) and the duotone gradient map (#5A37D1 to #EAC8FF).
12. Keyword-only captions: when a hook word is shown, the rest of the phrase is dropped ("the first" shows only "first",
    "a voice" only "voice", "and only tool" only "only ... tool"); picks can restyle a word but not hide its neighbours.
13. Place chosen by style: the giant word always takes the centred wide place (width 0.8) and the pair always splits around the head;
    our places rotate caption by caption regardless of style, so a giant word landing on a side place (width 0.34) would be shrunk
    to fit.
14. A split line around the head: "only" and "tool" are one line with a 325 px gap reserved for the head (x 500 to 825).

How `design.json` is set up: styles `base` (stack white, size 0.10), `big` (line-final word, 0.13) and `giant` (0.60, gradient over
the line, behind); picks: `giant` on the keyword in 30 % of captions, `big` on the last word in 50 %; `layout` stack, `leading` 0.9,
`words` 2, `lines` 4; six places replaying the video's order (left of the head, centre-wide for a hook word, centre-wide for a pair,
left, right, centre-wide); `behind` share 1.0 for captions holding a `giant` word; entry `rise` 0.38 s, 0.22 em, per word;
accent entry `pop` from 0.2 with overshoot 0.14 (stand-in for the scaleY stretch); exit `fade` 0.13 s per page.

## Evidence files (extra/)

Fonts:
- `font_letter_overlays.jpg`: per-letter overlays for 8 candidate fonts (white = both, red = video only, green = font only) with IoU.
- `font_words_compare.jpg`: video words (better, Mochi, has been, only) against Mona Sans, TikTok Sans, Archivo, Montserrat, Inter Display.
- `font_caps_voiceclone.jpg`: "VOICE CLONE 2.0" against heavy extended candidates.
- `voice_ce_terminals.jpg`, `only_glow_edge.jpg`: native crops showing the horizontal c / e terminals, straight y tail and the glow rim.

Layering:
- `behind_first.jpg`, `behind_voice.jpg`, `behind_cards.jpg`: person outline (green) over the occluded words and cards.
- `and_transform_no_overlap.jpg`: white stack beside the neck, no overlap.

Animation:
- `first_stretch_in.jpg`, `first_squash_out.jpg`, `only_tool_in.jpg`, `only_tool_drop_out.jpg`: frame-by-frame entries and exits.
- `mochi_rise_in.jpg`, `and_transform_rise.jpg`, `now_better_rise.jpg`: stacked caption entries.
- `type_something_typing.jpg`, `introducing_scramble.jpg`, `title_swing_in.jpg`, `title_swing_out.jpg`: type-on and 3D swing.
- `kinetic_line_so_whenever.jpg`, `tagline_settle.jpg`: the two late text lines.
- `sparkle_zoom.jpg`: one sparkle over "first", f30 to f37, 10 x zoom.

Colour:
- `gradient_samples.jpg`: sampled colours along first, voice and only..tool against the proposed engine stops.
- `gradient_voice_over_time.jpg`, `gradient_only_tool_over_time.jpg`: the gradient moving over time (text pixels only).

Pop-ups and structure:
- `review_cards_seq.jpg`, `scene_cards_and_panel_entry.jpg`, `voice_settings_entry.jpg`, `orb_rise_and_wipe.jpg`, `circle_reveal_seq.jpg`,
  `ui_vertical_swaps.jpg`, `logo_reveal_and_endcard.jpg`, `ui_corner_radii.jpg` (10 px grid), `ui_overview_1.jpg` to `ui_overview_3.jpg`.
- `contact_0_to_24s.jpg`, `contact_24_to_48s.jpg`, `contact_48_to_66s.jpg`: one frame per 0.5 s.
