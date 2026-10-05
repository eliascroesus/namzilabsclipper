# jiia 1780933717: typography and layering, frame by frame

> Measured frame by frame for the Mimic page (docs/mimic-text.md). The evidence frames named below (extra/...) were kept out of this public repository: they're frames of someone else's video.

Video: 1276x720, 24 fps, 337 frames (0 to 336), 14.04 s, H.264 yuv420p BT.709 limited range. Frame i is at t = i/24 s (PTS start 0, constant rate).
Voice-over (Parakeet ASR, checked against the captions): "What do you plan to do if this whole dream of yours doesn't work out? That doesn't even enter my consciousness."
Every caption lives in frames 63 to 160 (2.625 s to 6.708 s). All 337 frames were inspected; nothing is captioned after the whip at 6.71 s.
Units below: px on the 1276x720 frame, H = 720 (frame height), W = 1276, f = frame, em = font size. Engine sizes are font px / 720 for the bundled `inter` (Inter 700 at opsz 32) unless noted.

## 1. At a glance

**Grade.** Black and white with a faint magenta tint (mid greys: R = B, G 2 to 3 levels lower, e.g. rgb 105/102/106). Blacks sit at luma 9 to 16 (5th percentile), footage highlights are capped at 165 to 184 (95th percentile); only the captions reach 255 (no footage pixel reaches 225). So white text is always the brightest thing on screen, about 70 levels above the footage's 95th percentile. Red (one red, about #980F04) exists only in captions: frame saturation outside text frames is under 4.5 (mean chroma).
**Frame.** A 10 px pure white border on all four sides with square corners (content area x 10 to 1265, y 10 to 709, 1256x700). All positions below are on the full 1276x720 frame.

Shots, as far as they matter for the text:

| frames | time (s) | shot | text |
|---|---|---|---|
| 0 to 57 | 0.00 to 2.40 | eye close-ups, hands on a laptop, browser typing "themochi.ap" (31 to 37), negative flash at 57 | none (the browser is footage, see 5) |
| 58 to 83 | 2.42 to 3.46 | low-angle office, man looks up right, second man behind | A |
| 84 to 98 | 3.50 to 4.08 | window, man with arms spread | B, first half |
| 99 to 111 | 4.125 to 4.625 | face close-up, hand at chin | B continues, its text unchanged across the cut (same boxes, same glyph pixels) |
| 112 to 124 | 4.67 to 5.17 | man at laptop, dark office | C |
| 125 to 127 | 5.21 to 5.29 | pure white flash (255) at 125, decaying 126 (mean 192) and 127 (mean 132) | D starts under the flash |
| 126 to 160 | 5.25 to 6.67 | static balcony silhouette against the skyline (camera locked, man nearly still) | D, E, F, G |
| 161 to 336 | 6.71 to 14.0 | whips, gym, treadmill, street, car, cafe, elevator; negative flash frames and inset boxes | none |

## 2. Text styles

Three styles. Two share one font: a bold neo-grotesk (Inter / SF Pro Display Bold shapes), white for the base and deep red for the key word. The third is a heavy red roundhand script for the accent phrase.

### 2.1 Style table

| | white (base) | redsans (key word) | redscript (accent) |
|---|---|---|---|
| words | what do you plan / if this whole / doesn't / that doesn't / even enter / my | work, out, consciousness | to do, Dream, of, Yours |
| likely original | SF Pro Display Bold (Apple system font; Helvetica Now Display Bold is the paid alternative) | same | Snell Roundhand Bold (macOS) or a Bickham-class roundhand |
| best free match | Inter Tight 700 (IoU 0.911 over 8 words); bundled `inter` 700 at opsz 32: 0.892 | same family | Pinyon Script (IoU 0.358; 0.384 with a 2 px same-colour stroke to fake the heavier shades); all free scripts are far off |
| weight, width | Bold 700 (650: 0.871, 750: 0.879), normal width | Bold 700, normal | heavy shades, hairline joins, slant about 18 deg (d ascender) |
| case | lower, even sentence starts | lower | as typed: "to do", "of" lower; "Dream", "Yours" capitalised |
| ascender (= cap height in this class) | A 67.0 px (9.31% H); B 50 to 51 (7.0%); C 51.1 (7.10%); D/E/F 53.5 (7.43%) | work 104.5 px (14.5%); out t 118 (16.4%); consciousness 112.5 (15.6%, i-dot top) | Dream D 97 px (13.5%); Yours Y 108 (15.0%); do d 142 (19.7%) |
| x-height | A 51.5 px (7.15%); B 36.5 (5.07%); C 39.3 (5.46%); D/E/F 41.2 (5.72%) | work 80.5 (11.2%); out 94.5 (13.1%); consciousness 86.5 (12.0%) | Dream 49 (6.8%); Yours 55 (7.6%); do 75 (10.4%); to 51 (7.1%); of 23 (3.2%) |
| engine size | A 0.135, B 0.096, C 0.102, D/E/F 0.106 (mean over the 6 white captions 0.108) | work 0.209, out 0.253, consciousness 0.2295 | with Pinyon (x-height 0.334 em): Dream 0.204, Yours 0.229, do 0.312, to 0.21, of 0.096 |
| tracking | -0.10 em with bundled Inter (word fits -0.073 to -0.125); -0.08 em with Inter Tight. Letters touch (wh, at, th, is) | -0.085, -0.090, -0.108 em (mean -0.095) | 0 (connected script) |
| line pitch | A 69.7 px = 0.72 em = 1.04 x ascender; B 51.7 then 43.5 px (0.75, 0.63 em: "whole" ascenders rise above the "this" baseline) | doesn't to work 93.5 px; work to out 102.3 px (0.56 em of "out") | Dream to Yours baseline 124 px, "of" set between them at 0.47x |
| word gap (two-word lines) | 0.19 to 0.22 em after the tracked advance (a plain space) | | |
| colour | #FFFFFF (Y' 235 limited = 255) | #980F04 = rgb(152,15,3) | #971009 = rgb(151,16,9) (thin strokes, same red) |
| stroke, glow | none, none | none, none | none, none |
| shadow | black 30%, Gaussian sigma 7 px (canvas blur 14 px), offset +2.5, +4.2 px; fixed pixel size | black 28%, sigma 6.5 px, offset +1.2, +4.1 px (same shadow) | not measurable (moving close-up), assume the same |
| opacity, blend | 1, normal | 1, normal | 1, normal |
| enter | hard cut on the spoken word | cut ("work", "out"); 3-frame linear fade ("consciousness") | 3-frame linear fade (0.125 s) |

### 2.2 Font identification (evidence: extra/white_overlay_doesnt.jpg, extra/white_overlay_doesnt_b.jpg, extra/font_script_sheet_*.jpg, extra/font_script2_*.jpg)

White sans: each candidate was fitted on 8 isolated words (what, you, doesn't x2, that, even, enter, my) by searching font size, tracking and position for the best binary IoU at 0.5 alpha. Mean IoU:

| font | IoU | | font | IoU |
|---|---|---|---|---|
| Inter Tight 700 | 0.911 | | Hanken Grotesk 800 | 0.865 |
| Inter 700 (opsz 14) | 0.898 | | FreeSans Bold (Helvetica clone) | 0.863 |
| Geist 700 | 0.896 | | Manrope 800 | 0.862 |
| Inter 700 (opsz 32, bundled at display size) | 0.892 | | Figtree 700 | 0.857 |
| Inter 750 (opsz 32) | 0.879 | | Arimo 700 (Arial metrics) | 0.847 |
| Inter Tight 800 | 0.873 | | Mona Sans 700 | 0.844 |
| Archivo 700 | 0.872 | | Albert Sans 800 | 0.839 |
| Inter 650 (opsz 32) | 0.871 | | Instrument Sans 700 | 0.833 |
| TikTok Sans 700 | 0.868 | | | |

Glyph evidence: the t has an angled cut on top and the a has no tail spur (both Inter / SF traits; the Helvetica clone loses 5 points), the apostrophe is a straight tapered wedge whose top is level with the ascenders, the x-height is large (x / ascender 0.769, Inter 0.750, Helvetica 0.741, Geist 0.755) and the descenders short (p, y drop 15 to 16 px under a 67 px ascender: 0.23; Inter 0.28, Geist 0.21). That mix (Inter shapes, Geist proportions) points at SF Pro Display Bold, the macOS system face.

Red script: fitted on "Dream", "Yours" and "do" (size and position search, tracking 0). Mean IoU: Pinyon Script 0.358, Arizonia 0.326, Luxurious Script 0.302, Alex Brush 0.295, Ephesis 0.267, Allura 0.264, Carattere 0.264, Imperial Script 0.261, Parisienne 0.257, Monte Carlo 0.257, Great Vibes 0.246, Ms Madi 0.246, Italianno 0.245, Rouge Script 0.227, Petit Formal Script 0.223, Bonheur Royale 0.211, Tangerine Bold 0.207. Serif italics (Playfair Display, Bodoni Moda, DM Serif Display, Instrument Serif, Cormorant, Fraunces) are ruled out by eye: the original is a connected script (hairline joins, looped D and Y, an exit stroke on every o). Traits of the original: a straight, unlooped d ascender, a looped swash D whose baseline stroke runs left under the bowl to x 656, a Y with a top-left entry curl and a 47 px looped descender, an r with a small notch, very heavy downstrokes (13 to 18 px on a 49 to 75 px x-height). That is Snell Roundhand Bold. No free font has its weight; Pinyon Script is the nearest shape.

### 2.3 Blend mode (evidence: extra/blend_red_over_dark_and_light.jpg)

Core red sampled per background luma band (text frame vs a clean plate of the same static shot, or an inpainted plate):

| word | bg luma 0 to 40 | 40 to 80 | 80 to 130 | 130 to 180 | 180+ |
|---|---|---|---|---|---|
| consciousness (plate f150) | 150, 15, 4 | 151, 15, 2 | 150, 15, 2 | 150, 15, 2 | 151, 15, 4 |
| work out (plate f116) | 150, 15, 1 | 150, 15, 2 | | | |
| Dream / Yours (inpainted) | 150, 14, 5 | 151, 15, 7 | 150, 14, 6 | 151, 14, 5 | |
| to do (inpainted) | 149, 13, 6 | 151, 14, 6 | 150, 15, 6 | 149, 15, 7 | |

The red is identical (within 2 levels) from luma 19 to 183. Predicted for rgb(152,15,3) over grey 20 and grey 160: multiply 12/1/0 and 95/9/2, screen 160/34/23 and 217/166/161, overlay 24/2/0 and 178/76/67, soft-light 28/4/2 and 168/107/102, hard-light 65/2/0 and 178/19/4, difference 132/5/17 and 8/145/157, darken 20/15/3 and 152/15/3, lighten 152/20/20 and 160/160/160. Only normal at 100% gives 152/15/3 on both. The white core reads 252 over backgrounds from 17 to 146 luma: normal (screen and lighten are indistinguishable for pure white). No word uses a blend mode.

## 3. Caption events

Spoken times: Parakeet token times averaged over 8 windows shifted by 10 ms (ASR), and where available the nearest voice-band spectral-flux onset (onset). Offsets are caption frame minus spoken time, in frames (+ = caption after the voice).

| id | frames (t) | lines and styles | bbox x0,y0,x1,y1 | head box | layer | enter | exit | lands on |
|---|---|---|---|---|---|---|---|---|
| A | 63 to 83 (2.625 to 3.500) | "what do" / "you plan" white; "to do" redscript | 0.132, 0.278, 0.415, 0.707 | 0.466, 0.143, 0.638, 0.458 | front (plan and the do swash lie on his shirt, complete) | what 63, do 66, you 67, plan 70: cuts; "to do" fade 76.75 to 79.75 (alpha .084 .413 .740 .994 at f77 to 80) | cut at 84 (shot) | what: voice onset 2.60 to 2.62 (ASR 2.24 is music), +0 to +1 f; do 2.675 +1.8 f; you 2.835 -1.0 f; plan 2.935 (onset 2.901) -0.4 f; to 3.185 (onset 3.171) +0.3 f |
| B | 84 to 111 (3.500 to 4.667) | "if" / "this" / "whole" white; "Dream" / "of" / "Yours" redscript | 0.514, 0.258, 0.940, 0.785 | f84 to 98: 0.426, 0.135, 0.626, 0.472; f99 to 111: face fills x 10 to 720 | front (half-faded Dream D lies over his face at f97, 98; the D crosses the dark hair edge fully visible f99 to 111) | if 84, this 88, whole 91: cuts; Dream fade 96.2 to 99.2 (.255 .582 .999); of 102.4 to 105.5 (.15 .41 .66); Yours 104.95 to 107.95 (.336 .650 .977) | cut at 112 | if 3.445 +1.3 f (shot cut); this onset 3.641 +0.6 f; whole onset 3.786 +0.1 f; Dream onset 4.021 -0.3 f; of onset 4.241 +0.6 f; Yours onset 4.371 0.0 f |
| C | 112 to 124 (4.667 to 5.208) | "doesn't" white / "work" redsans / "out" redsans | 0.163, 0.328, 0.449, 0.674 | 0.606, 0.175, 0.781, 0.458 | no overlap | doesn't 112, work 117, out 121: cuts | white flash at 125 | doesn't onset 4.696 -0.7 f (ASR 4.515; it waits for the shot cut); work onset 4.811 +1.5 f; out onset 5.036 +0.1 f |
| D | 126 to 132 (5.250 to 5.542) | "that" ... "doesn't" white, split round the head | 0.275, 0.336, 0.746, 0.410 | 0.469, 0.356, 0.511, 0.414 | no overlap (same shot as G, which is behind) | that 126 (maybe 125 under the flash), doesn't 130 | cut at 133 | that 5.285 -0.8 f; doesn't 5.430 -0.3 f |
| E | 133 to 146 (5.542 to 6.125) | "even" ... "enter" white, split | 0.268, 0.339, 0.720, 0.410 | same | no overlap | even 133, enter 138 | cut at 147 | even 5.685 -3.4 f (early); enter onset 5.761 -0.3 f |
| F | 147 to 149 (6.125 to 6.250) | "my" white, left place | 0.288, 0.351, 0.360, 0.426 | same | no overlap | cut 147 | cut at 150 (f150 empty) | my 6.145 -0.5 f |
| G | 151 to 160 (6.25 to 6.708) | "consciousness" redsans | 0.141, 0.261, 0.858, 0.421 | same | BEHIND | fade 150.0 to 153.0 (.347 .671 .999 at f151 to 153) | whip at 161 | consciousness 6.305: fade starts -1.3 f, full +1.7 f |

Layout per caption (pen x = left edge of the advance box, from the font fits):

| id | arrangement | numbers |
|---|---|---|
| A | two 2-word lines, staircase: line 2 starts 41 px (0.43 em) right of line 1; "to" tucked above-left of a 1.45x bigger "do" | baselines 265.8, 335.5 (script do 508); pen x what 174.8, do 381.8, you 216.2, plan 367.8; size 0.135 |
| B | one word per line, flush left (pen x 825.8, 822.5, 817.5); the script block hangs below and left (D swash starts at x 656), "of" small right of centre between "Dream" and "Yours" | baselines if 235.8, this 287.5, whole 331.0, Dream 394, Yours 518; size 0.096 |
| C | small white word over two big red words; "doesn't" and "work" flush left (pen 215.8, 204.2), "out" indented 118 px (0.65 em of out) | baselines 286.0, 379.5, 481.8; sizes 0.102, 0.209, 0.253 |
| D, E, F | one word each side of the head at chin height: left word centred at x 412 (0.323), right word centred at x 843 (0.661), head centre x 625, so +/-215 px (+/-0.169 W) | baselines 292 to 295 (0.408); sizes 0.101 to 0.109 |
| G | one word centred on the frame (centre x 637.5 = 0.4996), across the head | baseline 299.8 (0.416); width 915 px (0.717 W); size 0.2295 |

## 4. Text behind the person

Only one instance: "consciousness" (G, frames 151 to 160). Every other caption is either in front (A, B) or never touches the person (C, D, E, F).

| check | result |
|---|---|
| words hidden | the bottom middle of the "o" (between "i" and "u"); the "i" and "u" are clear of the head |
| how much | 1055 to 1103 px per frame = 2.0 to 2.1% of the word's glyph area, 24% of the "o" |
| hidden box | x 595 to 650, y 259 to 300 (head: x 599 to 652, top y 256, chin about 298) |
| tracking | per-frame hidden area stays within +/-2% while the man drifts 2 to 3 px (hidden box x0 598 then 595 from f157): the cutout follows every frame |
| edge | as sharp as the glyph's own edge: 10 to 90% chroma ramp 4 to 5 px at the head (a free glyph edge measures 3.9 px in the 4:2:0 chroma; the hair edge itself is 1.6 to 2.3 px in luma). No halo, no fringe, no sky gap at 4x |
| during the fade | the cut-out is already in place at f151 (alpha 0.35): the person sits above the text layer for the whole caption |
| proof crops | extra/behind_head_150_160.jpg (plate f150 vs f153, 156, 160) |

"Dream of Yours" is not behind: at f97 and f98 the half-faded D is drawn over his face and collar, and at f99 to f111 the D crosses onto the dark hair edge with the same red (extra/dream_over_face_97_99.jpg, extra/dream_over_face_102_110.jpg). The segmenter finds no person in the close-up (f99 to f111), and none is needed: nothing is occluded.

The balcony white words (D, E, F) stay 83 to 121 px clear of the head, so front or behind looks the same; in the edit they are probably on the same track under the cut-out as G.

## 5. Word effects

| effect | where | measurement |
|---|---|---|
| hard cut on | every white word, "work", "out" | alpha 0 to 0.985 in one frame; box identical from the first frame (0 px move, 0% scale, no blur) |
| linear fade in | "to do", "Dream", "of", "Yours", "consciousness" | 3 frames = 0.125 s, linear (about +0.33 alpha per frame), no scale, blur or move; starts on fractional frames (76.75, 96.2, 102.4, 104.95, 150.0), so the edit timeline was not 24 fps |
| exit | all | none: captions vanish on the shot cut (84, 112), the white flash (125), the next caption (133, 147, 150) or the whip (161) |
| progressive build | A, B, C, D, E | words of one caption appear one by one on their spoken onsets and stay until the caption ends |
| drop shadow | all words | black 30%, sigma 7 px, +2.5, +4.2 px |
| typing, wipe, blur-in, scale | none in captions | |

Browser typing "themochi.ap" (footage, not a caption; extra/typing_30_38.jpg): visible frames 31 to 37 (1.29 to 1.54 s). Frames 31 = 32 show "themochi.ap" with the caret; 33 = 34 are a 2-frame blend (ghost "p" at 14% opacity, suggestion rows double-exposed); 35 = 36 = 37 show "themochi.app" with the caret and the bold suggestion. So the screen recording runs at an effective 12 fps (each frame held twice) and only one keystroke ("p") is on screen, landing between f32 and f35 (about 1.40 s): a typing speed cannot be measured from a single keystroke. For a rebuild, a `type` at about 8 characters/s shown on 12 fps steps (each state held 2 frames, one blended frame between states) reproduces the look; the rate is a guess. The caret is solid in all 7 frames (292 ms), so no blink is seen (Chrome blinks every 500 ms).

## 6. Recipe (everything a renderer needs)

Frame: 1276x720 at 24 fps, 10 px white border. Footage graded B&W, blacks about 12, highlights capped at about 180, faint magenta.

Fonts: base and key word in SF Pro Display Bold (free: Inter Display 700 / Inter Tight 700); accent in Snell Roundhand Bold (free: Pinyon Script).

Styles:

| | white | redsans | redscript |
|---|---|---|---|
| font, weight | Inter (opsz 32) 700 | Inter (opsz 32) 700 | Pinyon Script 400 (Snell Roundhand Bold) |
| size (font px / 720) | 0.105 (A: 0.135) | 0.21 to 0.25 (work 0.209, out 0.253, consciousness 0.2295) | main words 0.20 to 0.31; connector words ("to", "of") at 0.47 to 0.69 x the main word beside them |
| tracking | -0.10 em | -0.095 em | 0 |
| case | lower | lower | as typed |
| fill | #FFFFFF | #980F04 | #971009 |
| shadow | rgba(0,0,0,0.30), sigma 7 px, dx 2.5, dy 4.2 px (fixed px, not scaled with the font) | same | same |
| stroke, glow, box | none | none | none |
| blend, opacity | normal, 1 | normal, 1 | normal, 1 |

Layout rules: lowercase stacks, 1 or 2 words a line, line pitch 0.63 to 0.75 em (baseline to baseline; ascenders may cross the line above where it has no descenders); flush left with optional staircase indents of 0.43 to 0.65 em; key words twice the base size under a small white word; accent phrases in the script with small connector words; two-word thoughts in a wide shot split left and right of the head at chin height, centred at head x +/- 0.169 W; one huge key word centred on the frame and set behind the person.

Timing: each word cuts on at its spoken onset (median offset 0 f against the acoustic onset; 18 of 20 words within +/-1.5 f; extremes "even" -3.4 f and "do" +1.8 f); script words and the final key word fade in linearly over 0.125 s starting on the onset; nothing animates out; a caption ends at the next shot cut, flash or caption.

Layer order (bottom to top): footage, caption text (with shadow), person cut-out (only when the caption is behind), white flash.

## 7. Gaps (what our editor needs that a typical caption tool lacks)

1. Split line around the subject: the words of one caption anchored on both sides of the detected head (centres at head x +/- 0.169 W, baseline at the chin line), each persisting until the caption ends.
2. Per-line x offsets (staircase): line 2 +0.43 em (A), line 3 +0.65 em (C).
3. Per-word size inside one style: "out" 1.21x "work"; "do" 1.45x "to"; "of" 0.47x "Dream".
4. Per-caption scale: the base size jumps from 0.096 to 0.135 between captions.
5. Uneven line pitch per caption (0.63 to 0.75 em; leading 0.71 to 0.96 in engine terms) and ascenders allowed to cross the line above.
6. Multi-word accent phrases ("to do", "Dream of Yours", "work out") in one style, and two different accent styles chosen per caption by meaning.
7. A word-level enter per style (cut for the base and for "work out", fade for the script and "consciousness").
8. A fixed-pixel shadow shared by all sizes.
9. Captions that survive a shot cut unchanged (B spans the cut at f99).
10. A person cut-out with a sharp matte that tracks every frame (exists in our engine).
11. Clean caption text: punctuation dropped, apostrophes kept, nouns capitalised only in the accent style.

## 8. Fit to our engine (ENGINE.md)

Maps cleanly:
- Fonts: base and key word = bundled `inter` 700: IoU 0.892 at opsz 32 (what the canvas draws if it applies optical sizing; tracking -0.10) or 0.898 at opsz 14 (tracking -0.11), vs 0.911 for Inter Tight. Worth adding `inter-tight` (OFL, `@fontsource-variable/inter-tight`) as the closest free face. Proposed new id for the accent: `pinyon-script` (Google Fonts, OFL, Fontsource `@fontsource/pinyon-script`); bundled fallback `great-vibes` (IoU 0.246 vs 0.358). A same-colour stroke of 0.013 em (2 px at 150 px) thickens Pinyon toward Snell Roundhand Bold's weight (IoU 0.347 to 0.384 in the same search); Great Vibes gains more from 4 px (0.217 to 0.276) but stays behind.
- Colours, case, tracking, normal blend, opacity 1, no glow: exact (no stroke except the script's stand-in).
- Shadow: `{color: rgba(0,0,0,0.3), blur, x, y}` in ems per style: white blur 0.185, x 0.033, y 0.056 (at size 0.105); redsans 0.085, 0.015, 0.025 (at 0.23); script 0.089, 0.016, 0.027 (at 0.21). Same pixels on screen: sigma 7 px, offset 2.5, 4.2 px.
- Enter: base `{kind: "none", unit: "word"}` (cut on each spoken word), `accentEnter: {kind: "fade", dur: 0.125, unit: "word", ease: "linear"}`; `exit: null`.
- Stack layout with each style at its own size; `words: 2`, `lines: 3` reproduces the video's pagination of the question without help: "what do / you plan / to do", "if this / whole dream / of yours", "doesn't work / out?".
- Behind: the last place (G, centred, `behind: true`) gives exactly the "consciousness" look; the engine's segmenter plus cut-out is the same layering.

Approximated:
- Sizes: one size per style. Base 0.105 (A is 0.135: -22%; B 0.096: +9%), redsans 0.23 (work -9%, out +10%), script 0.21 (do 0.31: -33%, of 0.096: +119%).
- Leading: one value, 0.84 (measured 0.71 to 0.96 per line pair). With Inter metrics the engine puts baselines at cap x px x leading + 0.053 x px: 0.84 gives 0.665 em pitch for equal sizes (measured 0.63 to 0.75).
- Line breaks of B and C: the engine makes "if this / whole dream / of yours" and "doesn't work / out" (the video uses one word a line). Matching it needs `br: "line"` marks after every word.
- Places: used in turn, so design.json lists the 9 places in the video's order, assuming the answer is split into one-word captions with page breaks (`br: "page"`) after "that", "doesn't", "even", "enter", "my". Each flank word then sits at its exact place and onset, but the left word disappears when the right one comes on (the video keeps both: frames 130 to 132 and 138 to 146).
- Word picks: only one word a caption per style, and only one style can use marks. design.json uses `redscript` on the marked word (mark "do" in A and "dream" or "yours" in B) and `redsans` by keyword with share 0.12, which lands on "consciousness" only. "to", "of", one of Dream/Yours, "work" and "out" stay base. No automatic rule (last, keyword, first) reproduces the video's choices without wrong picks.
- Gap words: the engine's 0.25 em word space vs 0.19 to 0.22 em measured (+3 to +6 px).
- Script: no free font has Snell Roundhand Bold's heavy shades.
- Alternative trade-off: keep the answer as 4 captions ("that doesn't", "even enter", "my", "consciousness") with places [A, B, C, left, left, left, G] and `redsans` by `last` with share 0.45: then "out" (C) and "consciousness" (G) turn red but "enter" does too, and the split around the head is lost. design.json prefers the exact split and leaves C white.
- Check: extra/design_overlay.jpg draws design.json with the engine's layout rules (cyan) over frames 82, 110, 124, 131, 140, 148, 156. D, E, F and G land on the video's words within a few px; A comes out 22% small, B and C break lines differently.

Cannot express yet (numbers to build):
- Split caption: `place.split = {anchor: "head", dx: 0.169, baseline: "chin"}`.
- Per-line indent: `[0, 0.43]` em (A), `[0, 0, 0.65]` em (C).
- Per-word scale: work 1.0 / out 1.21; to 0.69 / do 1.0; Dream 1.0 / of 0.47 / Yours 1.12.
- Per-caption size: 0.096 to 0.135.
- Per-style enter (cut for redsans "work out" while "consciousness" fades).
- Marks per style (a word marked for a given style), and multi-word accent phrases.
- Fixed-pixel shadow (the engine scales shadows with each style's size; fine here since each style has one size).
- Punctuation: the video drops "?" and "." and keeps the apostrophe; the engine draws words as said ("out?", "consciousness."), and `case` cannot capitalise only the nouns ("Dream", "Yours"): the transcript has to be edited for both.

## Evidence files (extra/)

| file | shows |
|---|---|
| contact_frames_060_089.jpg ... 150_179.jpg | every frame of the caption range with frame numbers |
| word_crops_white_red.jpg, script_crop_*.jpg | the words at 3x to 4x |
| white_overlay_doesnt.jpg, white_overlay_doesnt_b.jpg | "doesn't" (f116) vs 13 fitted sans candidates (green = video, magenta = render, white = both) |
| font_script_sheet_*.jpg, font_script2_*.jpg | "to do" and "Dream of Yours" in 73 script and serif italic candidates next to the video crops |
| blend_red_over_dark_and_light.jpg | the same red over dark hair, light wall, sky and tower |
| shadow_evidence.jpg | frame / clean plate ratio: the soft shadow below-right of every word |
| behind_head_150_160.jpg | the head covering the "o" of "consciousness" (plate f150, f153, f156, f160) |
| dream_over_face_97_99.jpg, dream_over_face_102_110.jpg | "Dream" drawn over the face and the hair edge (front) |
| person_mask_sheet.jpg | MediaPipe selfie masks on the caption shots |
| spectrogram_onsets.jpg, spectrogram_zoom_c.jpg, spectrogram_zoom_d.jpg | voice spectrogram with caption onsets (cyan) and ASR words (green), 24 fps ticks |
| typing_30_38.jpg | the browser URL bar, frames 30 to 38 |
| design_overlay.jpg | design.json laid out by the engine rules over the video |
