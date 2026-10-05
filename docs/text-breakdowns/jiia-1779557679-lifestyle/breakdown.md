# jiia 1779557679: typography and layering breakdown

> Measured frame by frame for the Mimic page (docs/mimic-text.md). The evidence frames named below (extra/...) were kept out of this public repository: they're frames of someone else's video.

Source: `inspirationedit/jiia_1779557679_3903531121787214584_7181902700.mp4`, 960x720, 23.976 fps, 722 frames (f0 to f721), 30.11 s. Frame f starts at t = f x 1001/24000 s. Sizes in px are on the 720 px tall frame; "H" is the frame height, "W" the width.

How it was measured: every frame streamed with cv2; red text isolated as alpha = (R - max(G,B)) / 199; white text from luminance on black or cream frames. Fonts were identified by rendering candidates glyph by glyph and fitting position, size, tracking and a Gaussian blur to the observed alpha (least squares); the residual is the mean squared alpha error (lower is better). Person masks from MediaPipe selfie_segmenter; word timings from Parakeet TDT 0.6B (token timestamps, about 80 ms granularity).

Evidence images are in `extra/` (listed at the end).

## 1. At a glance

Two independent text layers sit on this edit:

1. **White subtitles** (20 captions): small Google Sans Medium, sentence as said, one line, bottom centre, soft drop shadow, hard cuts. They are pure #FFFFFF and sharp, while the red titles are graded and blurred and every other white in the edit stops at cream (255,246,238), so the subtitles were added in a separate pass on top of the finished, graded edit.
2. **Red title cards** (6 events): huge Anton capitals in #C70001 with a soft 2.7 px blur, set over the speaker's neck and chest (or split beside his head), each word cutting on within about 2 frames of its spoken word, with a small red Google Sans Bold line for lead-in words. While a card is up, the white subtitles for those words are not shown (one exception: "all of the time" under "is at 99").

Nothing is placed behind the person: every letter that crosses his face, chin or neck is fully visible (0 hidden letter pixels in the 100 frames where a card crosses him).

| Frames | Time (s) | Shot | Text on screen |
|---|---|---|---|
| 0 to 2 | 0.00 to 0.13 | flash in: f1 solid cream (255,245,239), f0 and f2 picture mixed 81 % toward it | none |
| 3 to 136 | 0.13 to 5.71 | sofa at night, medium shot, pink plush toy | subs; "you would not wanna"; SWITCH + "your current lifestyle"; WITH MINE |
| 137 to 139 | 5.71 to 5.84 | flash cut: f138 solid cream, f137 and f139 the pool shot flashed white | WITH MINE turns cyan-blue (inverted) |
| 140 to 160 | 5.84 to 6.71 | pool, swimmer from above | subs |
| 161 to 189 | 6.71 to 7.92 | driving at night | subs |
| 190 to 230 | 7.92 to 9.63 | black frame with a B&W picture-in-picture of a wide sofa shot | subs below the PiP |
| 231 to 233 | 9.63 to 9.76 | cream flash (f232 solid) | sub stays, white on cream |
| 234 to 252 | 9.76 to 10.55 | balcony phone call | subs |
| 253 to 272 | 10.55 to 11.39 | garage | subs |
| 273 to 292 | 11.39 to 12.22 | desk with laptop | sub |
| 293 to 365 | 12.22 to 15.27 | cafe close-up | subs; "is at" + "99" |
| 366 to 518 | 15.27 to 21.65 | sofa, second angle | subs; START UP SEASON; glitch; I'M STILL IN IT |
| 519 to 522 | 21.65 to 21.81 | flash cut (f520 bleached B&W of the next shot) | I'M STILL IN IT stays red on top |
| 523 to 721 | 21.81 to 30.11 | B-roll montage (two men, writing, rooms, laptop, cafe, balcony, city) with flash cuts at f553 to 555, 581 to 583, 619 to 621, 676 to 678 | none |

**Grade.** Teal and orange film look. Night shots: black level about (8,9,11), median (13,14,19), cool navy shadows, warm skin and lamps (p99 (188,155,132)). Day shots: teal-green mids (cafe median (119,121,103)), warm highlights. The whole edit has a cream white ceiling: the brightest pixels of every shot and every flash frame stop at (255,246,238). Only the white subtitles reach (255,255,255). The B&W picture-in-picture is fully desaturated (mean |R-G|+|G-B| = 4.8, compression noise).

## 2. Text styles

### Style table

| | sub (base) | title | tag |
|---|---|---|---|
| Role | every spoken phrase without a card | the key phrase of a beat | lead-in words; the line under a title |
| Best free font | **Google Sans Medium** (OFL, `@fontsource-variable/google-sans`) | **Anton** (OFL, bundled `anton`) | **Google Sans Bold** (OFL; Google Sans Flex 700 fits best) |
| Likely original | Google Sans / Product Sans | Anton itself (Impact is the paid look-alike, not used) | Google Sans Bold |
| Fit residual (best / next) | 0.0104 / Figtree 0.0158, Inter 0.0235, Poppins 0.0252, Montserrat 0.0323 (49 fonts) | 0.0031 / League Gothic 0.038 (only with a 1.26x stretch), Antonio 0.039, Bebas Neue 0.042, Oswald 0.110 | 0.0244 / Inter 800 0.0254, Inter 700 0.0258, Figtree 700 0.0259, Google Sans 700 0.0265, Poppins 700 0.0272 (soft: within 15 %) |
| Weight, width | 500, normal | 400 (single weight), normal (free width fit 1.007) | 700, normal |
| Case | as said (capital I only, no punctuation) | upper; Anton lowercase for "is at"; digits | lower |
| Font size | 29.4 px = **0.0408 H** | per card: SWITCH 171.6 px (0.238), WITH MINE 148.5 (0.206), START UP SEASON 79.8 (0.111), I'M STILL IN IT 79.7 (0.111), "is at" 90.1 (0.125), "99" 179.8 (0.250) | 42.7 px = **0.0593 H** |
| Cap height | 21.0 px = 2.92 % H (font ratio 0.716) | SWITCH 147.4 px = 20.5 %; WITH MINE 127.6 = 17.7 %; cards at 79.8 px: 68.5 = 9.5 %; "99" ink 158 px = 21.9 % (ratio 0.859) | 30.6 px = 4.25 % (no capitals used) |
| x-height | 15.0 px = 2.08 % (ratio 0.510) | "is at": 66 px = 9.2 % (ratio 0.732) | 21.8 px = 3.03 % (ratio 0.514) |
| Tracking | -0.6 px = **-0.02 em** | -0.7 to -1.2 px = **-0.005 to -0.012 em** (mean -0.008) | -1.2 px = **-0.028 em** |
| Word spacing | normal space | normal Anton space | 2.0 em / 4.4 em / 2.0 em in "you would / not wanna"; justified (0.81 em) under SWITCH |
| Line spacing | single line always | title baseline to tag baseline 42.8 px (engine leading 1.0) | |
| Colour | #FFFFFF (sampled 255,255,255) | **#C70001** (sampled core 195 to 202, 0, 0 to 2 on all 6 cards) | #C70001 (thin strokes peak at about 157 because of the blur) |
| Gradient, texture | none | none (flat fill; see the invert flash in section 5) | none |
| Stroke | none | none | none |
| Shadow | black, **50 %**, Gaussian sigma **6.6 px (0.224 em)**, offset x 0, y **+3.4 px (0.117 em)** | none | none |
| Glow | none | none | none |
| Blur (static) | none (edge sigma 0.55 px, compression only) | **Gaussian sigma 2.7 px** (2.3 to 2.9), the same in px at every size: 0.016 em at 171 px, 0.036 em at 80 px; 0.0037 H | sigma 2.8 px (0.065 em) |
| Opacity | 1.0 | 1.0 | 1.0 |
| Blend | normal | normal (proof below) | normal |
| Layout | centred x 0.500, baseline y 0.925 (666 px), ascender top 0.896; width 44 to 277 px (max 0.29 W) | centred on the frame (x 0.500 to 0.502), cap line between 0.06 H above and 0.05 H below the chin; or split left and right of the head | flanking the centre line at the chin line, or justified to the title's ink width just under it |

### Font identification, by glyph

- **Anton** (title). S with flat, horizontal terminals and a tight spine; W with flat-topped strokes and pointed vertices; C with horizontal cut terminals; R with a straight diagonal leg; very heavy stems (the I is 0.166 em wide, 28.5 px at 171.6 px); "9" with an oval bowl and a short curved tail; tall lowercase ("is at" has an x-height of 0.732 em) with a double story "a" and an angled cut on "t". Fitted per glyph it overlays the observed letters with no fringe (extra/02, extra/03; side by side renders in extra/13). League Gothic and Antonio have the same skeleton but are narrower and lighter (they need a 1.26x and 1.12x horizontal stretch to cover the same box); Bebas Neue is lighter and has no lowercase (it would set "IS AT"); Oswald 700 and Barlow Condensed 900 are wider at the same cap height with rounder bowls; Big Shoulders has square bowls and a wide W.
- **Google Sans Medium** (sub). Single story "g" with an open round tail ("doing", "working"); "t" with a slanted cut on the top left; "e" with a horizontal bar and an angled terminal; "a" double story with a straight stem; "y" with a straight tail; straight apostrophe; round "o" narrower than Poppins. Figtree is the closest bundled face (same proportions, slightly different "g", "j" and "t"); Poppins, Montserrat and TikTok Sans set too wide; Inter's x-height is too tall (extra/04 overlays, extra/14 side by side).
- **Google Sans Bold** (tag). Same skeleton at 700. The 2.8 px blur hides detail, so the family ranking is soft: summed over 7 words Google Sans Flex 700 scores 0.0244, Inter 800 0.0254, Inter 700 0.0258, Figtree 700 0.0259, Google Sans 700 0.0265, Poppins 700 0.0272, and single words flip (Poppins wins on "lifestyle"). The weight is clear: Google Sans 600 scores 0.0369 and 500 is worse again. Same family as the subtitles is the consistent choice; Inter 700 is the bundled stand-in (extra/05).

### Blend mode evidence (title and tag)

Same glyph core, sampled over very different backgrounds, against what each blend of the #C70001 fill would give there:

| Sample | Background | Measured core | Normal | Multiply | Screen | Overlay | Soft light | Difference |
|---|---|---|---|---|---|---|---|---|
| WITH MINE f117 over his face | skin about (150,100,80) | **(199.5, 0.7, 1.1)** | (199,0,1) | (117,0,0) | (232,100,81) | (209,0,1) | (176,39,26) | (49,100,79) |
| WITH MINE f117 over the room | about (18,15,17) | **(198.3, 0.3, 1.1)** | (199,0,1) | (14,0,0) | (203,15,18) | (28,0,0) | (41,1,1) | (181,15,16) |

More samples, all equal to normal: SWITCH f75 over the face (197.8, 0.8, 1.5) and over the dark (199.0, 0.3, 0.9); "99" f340 from the dark plant (luminance 10) to the lit wall (150): (202, 0, 0), p5 to p95 195 to 204; I'M STILL IN IT on the white flash frame f520: (198, 0, 4); "is at" (200, 0, 2).

The core never moves with the background, so it is normal blend at 100 % opacity: every other mode would differ by 20 to 180 levels in at least one of the two samples. The only non-normal looks are the two transition states in section 5 (invert flash, glitch).

## 3. Caption events

Bbox and head are (x0, y0, x1, y1) as frame fractions; bbox is the ink box (ascender top to descender bottom). Layer is front for all. Enter and exit: "cut" means the text is complete (summed alpha within 1.5 % of its final value, box unchanged) on its first frame and gone on the next frame after its last: no scale, opacity ramp, blur, offset or overshoot anywhere. Spoken onset from Parakeet; delta = caption start minus spoken onset (negative = caption leads).

| # | f0 to f1 | t0 to t1 (s) | Text (style) | Bbox | Head | Enter | Exit | Spoken onset (delta) |
|---|---|---|---|---|---|---|---|---|
| 1 | 8 to 18 | 0.334 to 0.792 | I think (sub) | 0.462,0.896,0.540,0.925 | 0.431,0.101,0.698,0.383 | cut | cut, replaced | "I" 0.24 (+0.09) |
| 2 | 19 to 33 | 0.792 to 1.418 | in the phase (sub) | 0.416,0.896,0.577,0.933 | 0.432,0.111,0.694,0.385 | cut | cut | "in" 0.72 (+0.07) |
| 3 | 34 to 52 | 1.418 to 2.211 | where I'm at (sub) | 0.418,0.896,0.581,0.925 | 0.435,0.128,0.683,0.397 | cut | cut (card follows) | "where" 1.36 (+0.06) |
| 4 | 53 to 74 | 2.211 to 3.128 | you would not wanna (tag) | 0.109,0.481,0.894,0.533 | 0.416,0.139,0.664,0.419 | cut per word on speech: you f53, would f57, not f62, wanna f67 | all cut at f75 | you 2.24 (-0.03), would 2.40 (-0.02), not 2.64 (-0.05), wanna 2.80 (-0.01) |
| 5 | 75 to 116 | 3.128 to 4.880 | SWITCH (title 171.6 px) / your current lifestyle (tag) | 0.258,0.350,0.740,0.631 | 0.405,0.156,0.698,0.410 | SWITCH f75; your f91, current f97, lifestyle f104, each on its word | all cut at f117 | switch 3.20 (-0.07), your 3.76 (+0.04), current 4.00 (+0.05), lifestyle 4.32 (+0.02) |
| 6 | 117 to 139 | 4.880 to 5.839 | WITH MINE (title 148.5 px) | 0.202,0.408,0.800,0.586 | 0.422,0.167,0.661,0.408 | both words at once | inverts to #0299D5 on the flash f137 to f139, gone f140 | with 4.96 to 5.04 (-0.08 to -0.16) |
| 7 | 139 to 146 | 5.797 to 6.131 | cause even (sub) | 0.445,0.896,0.554,0.925 | swimmer 0.42,0.48,0.55,0.62 | cut, on the last flash frame | cut | because 5.60 to 5.76 (+0.04 to +0.20) |
| 8 | 147 to 171 | 6.131 to 7.174 | on the outside (sub) | 0.403,0.896,0.596,0.925 | swimmer, then driver 0.233,0.176,0.595,0.433 after the cut at f161 | cut | cut | on 6.16 (-0.03) |
| 9 | 172 to 190 | 7.174 to 7.966 | we're doing fun stuff (sub) | 0.360,0.896,0.640,0.933 | 0.234,0.163,0.544,0.408 | cut | cut | we're 6.88 (+0.29, ASR weak under music) |
| 10 | 191 to 202 | 7.966 to 8.467 | now we're not even (sub) | 0.370,0.896,0.629,0.925 | in PiP about 0.469,0.347,0.531,0.444 | cut | cut | now 8.00 (-0.03) |
| 11 | 203 to 218 | 8.467 to 9.134 | doing fun stuff (sub) | 0.401,0.896,0.600,0.933 | in PiP | cut | cut | not recognised (music) |
| 12 | 219 to 234 | 9.134 to 9.801 | I'm just working (sub) | 0.397,0.896,0.604,0.933 | in PiP | cut | stays through the cream flash f231 to f233, cut | working 9.36 |
| 13 | 235 to 244 | 9.801 to 10.219 | from the outside (sub) | 0.388,0.896,0.612,0.925 | 0.308,0.133,0.569,0.487 | cut | cut | from 9.68 to 9.74 (+0.06 to +0.12) |
| 14 | 245 to 269 | 10.219 to 11.261 | it looks nice (sub) | 0.422,0.896,0.578,0.925 | 0.286,0.167,0.608,0.496 | cut | cut (spans the cut at f253) | it 10.32 (-0.10) |
| 15 | 270 to 297 | 11.261 to 12.429 | but from the inside (sub) | 0.373,0.896,0.626,0.925 | 0.407,0.263,0.629,0.479 | cut | cut | but 11.12 (+0.14) |
| 16 | 298 to 315 | 12.429 to 13.180 | my cortisol level (sub) | 0.393,0.896,0.607,0.933 | 0.405,0.165,0.650,0.494 | cut | cut (card follows) | cortisol 12.36 |
| 17 | 316 to 365 | 13.180 to 15.265 | is at (title, lowercase 90.1 px) + 99 (title 179.8 px) | 0.129,0.389,0.875,0.608 ("is at" 0.129,0.436,0.292,0.556; "99" 0.698,0.389,0.875,0.608) | 0.391,0.114,0.654,0.481 | cut per word: is f316, at f318, 99 f329 | cut with the shot at f366 | is 13.24 (-0.06), at 13.40 (-0.14), 99 13.64 (+0.08) |
| 18 | 349 to 365 | 14.556 to 15.265 | all of the time (sub, over the card) | 0.409,0.896,0.591,0.925 | 0.385,0.081,0.670,0.485 | cut | cut | all 14.44 to 14.48 (+0.08) |
| 19 | 366 to 386 | 15.265 to 16.141 | I have to work on that (sub) | 0.356,0.896,0.645,0.925 | 0.428,0.179,0.616,0.407 | cut | cut | I 15.28 (-0.02) |
| 20 | 387 to 404 | 16.141 to 16.892 | but at the same time (sub) | 0.362,0.896,0.638,0.925 | 0.439,0.165,0.620,0.404 | cut | cut | but 16.16 (-0.02) |
| 21 | 405 to 418 | 16.892 to 17.476 | I do (sub) | 0.477,0.896,0.523,0.925 | 0.463,0.172,0.650,0.408 | cut | cut | I 16.96 (-0.07) |
| 22 | 419 to 434 | 17.476 to 18.143 | notice that (sub) | 0.428,0.896,0.572,0.925 | 0.447,0.179,0.636,0.408 | cut | cut | notice 17.44 (+0.04) |
| 23 | 435 to 442 | 18.143 to 18.477 | it's (sub) | 0.483,0.896,0.518,0.925 | 0.428,0.179,0.620,0.408 | cut | cut | "it is" 18.00 to 18.16 |
| 24 | 443 to 472 | 18.477 to 19.728 | a season (sub) | 0.442,0.904,0.557,0.925 | 0.429,0.174,0.622,0.408 | cut | cut (card follows) | not recognised |
| 25 | 473 to 503 | 19.728 to 21.021 | START UP SEASON (title 79.8 px) | 0.242,0.450,0.758,0.547 | 0.396,0.174,0.588,0.393 | all at once | glitch f496 to f503, replaced at f504 | startup 19.76 (-0.03) |
| 26 | 504 to 522 | 21.021 to 21.813 | I'M STILL IN IT (title 79.7 px) | 0.296,0.450,0.708,0.547 | 0.422,0.178,0.620,0.404 | flickers in on f496, 498, 500, 502 (glitch), solid from f504 | stays red through the flash cut f519 to f522, gone f523 | I'm 21.06 (-0.04), still 21.28 |

Timing pattern: red words cut on between 0.14 s before and 0.08 s after their own spoken onset, most within 2 frames (the ASR's own precision); WITH MINE leads "with" by 2 to 4 frames. Subtitles cut on with their phrase's first word, usually within 2 frames before to 3 frames after it; they change back to back with no gap frames and are suppressed during cards 4, 5, 6, 17 (until f349), 25 and 26. No captions after f523.

## 4. Text behind the person

**None.** No word in this video sits between the background and the person.

Test: for each title card the full text was rendered from its fit (Anton, exact size and position), and every frame was checked for letter-core pixels (model alpha above 0.8) that are missing from the frame (observed alpha below 0.4). Result: SWITCH 0 of 38,641 core px in 42 frames (it covers his nose, mouth and chin); WITH MINE 0 of 40,709 in 20 frames (mouth, chin, neck); START UP SEASON 0 of 14,088 in 23 frames (across his neck; his chin ends 41 px above the cap line); I'M STILL IN IT 0 of 9,557 in 15 frames; "99" 0 in 37 frames; "is at" at most 2 px (noise). The person mask confirms these letters lie on him: the segmenter even counts the red letters as part of the person because they are in the foreground composite. "not" (x 0.600 to 0.663, baseline 0.52) sits right of his chin over the shirt collar and is fully visible; it is not behind his head. "is at" and "99" stand beside the head and never touch him. See extra/07.

So: no tracking matte, no occlusion edges. For our editor, `behind` stays off for this look.

## 5. Word effects and overlays

| Effect | Where | Measurement |
|---|---|---|
| Soft-focus blur on red text | every title and tag | Gaussian sigma 2.7 px (2.3 to 2.9) at every size; luma and chroma edges both 6 px from 10 to 90 %. The white subtitles (0.55 px) and the PiP border (2 px rise) are sharp, so it is the red layer that is blurred, not the video (extra/06). |
| Drop shadow | white subtitles | black 50 %, sigma 6.6 px, offset (0, +3.4 px). Invisible on dark shots, visible as a grey halo on the cream flash f232; model rmse 2.76 vs 11.27 without it (extra/10). |
| Word-by-word build | cards 4, 5, 17 | each word a hard cut on its own spoken onset; earlier words stay; all leave together. |
| Justified tag line | card 5 | "your current lifestyle" spans exactly the SWITCH ink width (x 0.259 to 0.739), gaps 0.81 em, baseline 42.8 px under the title baseline. |
| Split around the head | cards 4 and 17 | "you would" and "not wanna" centred at x 0.255 and 0.737 with a 4.4 em gap across the centre line; "is at" (90 px) left of the head and "99" (180 px, twice the size) right of it on a lower baseline (0.552 vs 0.606). |
| Invert flash | WITH MINE, f137 to f139 | three frame flash cut: f138 solid cream (251,243,238) with the letters (2,153,213) = #0299D5; on the half-flash frames f137 and f139 the letters let the picture through: (1 to 3,153 to 155,212 to 213) where the picture is near white, up to (49,179,188) where it is grey (204,215,215). Across 6 sampled letter edges the letter R falls 0.95 per unit of background brightness and B rises 1.05: only an inverting blend does that (normal keeps it flat; screen and overlay make it lighter than the background; multiply makes R fall with the background, not rise). It fits a difference blend of pure red (255,0,0) against the flashed picture for R and B; G is lower than difference predicts, consistent with the film grade compressing saturated cyan. The same card style does not invert at the later flash (f519 to f522 stay (198,0,4)), so this is a deliberate effect on that one card (extra/08). |
| Glitch swap | START UP SEASON to I'M STILL IN IT, f496 to f503 | on f496, 498, 500, 502 the incoming title is laid exactly in place (offset 0,0) as a white difference layer over the outgoing red one: cream (231,220,182) over the dark room, teal (8,165,165) where it crosses red letters, red (189,1,2) where only the old title shows. f497, 499, 501, 503 show the outgoing title alone. 12 flips per second for 0.33 s, then a hard cut to the red incoming title at f504, which lands on "I'm" (extra/09). |
| B&W picture-in-picture | f190 to f230 (7.92 to 9.63 s) | a wide sofa shot in a box x 163 to 796, y 115 to 603 px (0.170, 0.160 to 0.829, 0.838; 634 x 489 px, 0.660 W x 0.679 H, aspect 1.30), 100 % desaturated, hard edges (2 px), on pure black (0,0,0); static, no zoom. Subtitles keep their normal place below it (extra/11). |
| Cream flashes | f0 to 2, 137 to 139, 231 to 233, 519 to 522, 553 to 555, 581 to 583, 619 to 621, 676 to 678 | middle frame solid (255,246,237) = #FFF6ED; neighbours mixed 81 to 89 % toward it. Not a text overlay: the "faint text" on the 9.7 s cream frame is the ordinary white subtitle on cream with its grey shadow. Red titles stay on top of a flash (f519 to f522). |
| Not present | | no gradient, texture, grain or distress on letters; no outline, glow, typewriter, wipe, blur-in, scale pulse or flicker beyond the glitch; no keyframed motion of any text. |

## 6. Recipe (everything a renderer needs)

Frame 960 x 720 (scale every px value by H / 720).

**Subtitles (base).**
- Google Sans Medium 500, 29.4 px (0.0408 H), letter spacing -0.6 px (-0.02 em), text as said (capital I, no punctuation), fill #FFFFFF, opacity 1, normal blend.
- Drop shadow black at 50 %: Gaussian sigma 6.6 px, offset x 0, y +3.4 px. That is canvas shadowBlur 13.2 px.
- One line, centred at x 480, alphabetic baseline at y 666.
- Phrase chunks of 1 to 6 words (mean 3.1), cut on at the phrase's first spoken word and replaced back to back.
- Hidden while a title card is up.

**Title cards.**
- Anton 400, fill #C70001, opacity 1, normal blend, no stroke, shadow or glow. Letter spacing about -1 px (-0.008 em). Gaussian blur sigma 2.7 px on the rendered text (canvas `filter: blur(2.7px)`).
- Centre x 480. Cap line placed from just above to just below the chin: SWITCH cap top 252, baseline 402; WITH MINE cap top 294, baseline 422; START UP SEASON and I'M STILL IN IT cap top 324, baseline 394.
- Size per card: 171.6 px for a single word, 148.5 px for two words, 79.8 px for three or four. Equivalently, about 0.48 to 0.60 W of ink width for one or two words.
- All words of a card cut on at the first word's onset, or word by word on their spoken onsets when the card builds. Hard cut off when the next card or shot comes.
- Draw them in front of the person.

**Tag words.**
- Google Sans Bold 700, 42.7 px (0.0593 H), letter spacing -1.2 px, lowercase, #C70001, blur sigma 2.8 px.
- Lead-in form: one line at baseline 375.5 (just under the chin). The words form two pairs flanking the centre line: 2.0 em inside each pair, 4.4 em across the middle. Each word cuts on at its spoken onset.
- Under-title form: baseline 42.8 px under the title baseline, justified to the title's ink width. Each word cuts on at its spoken onset.

**Split card ("is at 99").**
- "is at" in Anton lowercase 90.1 px, baseline 397.5, left edge x 124 (left of the head).
- "99" in Anton 179.8 px, baseline 436.3, left edge x 670 (right of the head).
- Word by word on speech.

**Transitions on cards.**
- Invert flash: for a 3 frame cream flash under a card, draw the card in #0299D5. On the half-flash frames, a difference blend of #FF0000 against the flashed picture gives the textured look.
- Glitch swap: for the 8 frames before the next card, alternate frames add the next card in #FFFFFF with difference blend over the current card.

**Overlays.**
- PiP: desaturate 100 %, box 0.170, 0.160 to 0.829, 0.838 on black.
- Flash: one solid #FFF6ED frame with an 81 to 89 % mix toward it on the frames before and after.

## 7. Gaps (what a typical caption tool lacks)

1. **Two caption layers at once**: a continuous subtitle track plus independent title cards that suppress the subtitles while they are up. Most tools have one track with one emphasis style.
2. **Placement by style**: subtitles at the bottom, title cards mid-frame on the chin line, split cards beside the head.
3. **Phrase-level emphasis**: a whole phrase (START UP SEASON, I'M STILL IN IT, WITH MINE) takes the title style, not one keyword.
4. **Per-card size**: the same title style at 0.111 to 0.250 H depending on word count.
5. **Static blur on text** (a soft-focus title), as opposed to a blur-in animation.
6. **Word spacing control and justify-to-width**: 2.0 and 4.4 em gaps; a small line justified to a big word's ink width.
7. **Split layout around the head**: the left half of a phrase left of the face and the right half right of it, with different sizes and baselines.
8. **Transition states for text**: an invert (difference) state during a flash cut, and an alternating-frame glitch that overlays the next card as a difference layer.
9. **Overlays tied to the captions' time line**: the B&W picture-in-picture on black and the cream flash frames (the flash must sit under the cards and under the subtitles).

## 8. Fit to our engine (ENGINE.md)

design.json holds the closest TextDesign. Styles: sub (base), title, tag.

**Maps cleanly**
- sub: Google Sans Medium 500 (new id `google-sans`), size 0.0408, tracking -0.02, case as-said, fill #ffffff, shadow `{color "rgba(0,0,0,0.5)", blur 0.45, x 0, y 0.117}`, normal, opacity 1. The engine shadow blur is canvas shadowBlur in ems, 2 x 6.6 / 29.4 = 0.45.
- Subtitle place `{x 0.5, y 0.9136, align center, valign middle, width 0.6}`. With the engine's block maths (up = 0.716 x px, down = 0.286 x 0.55 x px) this puts the baseline at 666 px exactly.
- title: anton 400, size 0.238, tracking -0.008, fill #c70001, case upper, normal.
- tag: google-sans 700, size 0.0593, tracking -0.028, fill #c70001, case lower.
- Timing: enter `{kind none, dur 0, unit page}` (subtitles cut on whole) and exit null (cut off). accentEnter `{kind none, dur 0, unit word}`, so title words cut on at their own spoken onsets, as in cards 4, 5 and 17.
- Leading 1.0: with the engine formula (Anton cap 0.859, desc 0.329; Google Sans cap 0.716), it reproduces the measured 42.8 px between the SWITCH baseline and the tag baseline.
- `behind {share 0}`: matches, nothing is behind.
- Width 0.60 W for the place: the engine's shrink-to-fit (its own advance widths, 0.25 em word gaps) turns the 0.238 title into 0.205 for WITH MINE (measured 0.206).

**Approximated**
- Fonts: `google-sans` is not bundled. Add `@fontsource-variable/google-sans` (OFL-1.1, metrics xh 0.510, cap 0.716, asc 0.966, desc 0.286, weights 400 to 700). Until then use `figtree` 500 for sub (residual 0.0158 vs 0.0104) and `inter` 700 for tag (0.0258 vs 0.0244).
- Which words become titles: picks `keyword share 0.23` (6 cards in 26 captions) plus `number share 1` (for "99"). The reference picks whole phrases by meaning; use `marked` to choose them by hand.
- words 4, lines 1. The reference has 1 to 6 words (mean 3.1) on one line; the engine splits the two longer phrases (5 and 6 words).
- Card sizes. One title size plus shrink-to-fit gets SWITCH (0.238) and WITH MINE (0.205 vs 0.206) right. It gives START UP SEASON 0.126 and I'M STILL IN IT 0.158 where the reference has 0.111 for both, and "99" 0.238 vs 0.250.

**Cannot express yet (with the numbers it would need)**
1. **Static blur** on a style: Gaussian sigma 2.7 px at 720p = 0.0037 H, constant in px across sizes, so better as a share of frame height than in ems. In canvas: `ctx.filter = blur(0.0037*H px)` for title and tag.
2. **A place per style or per pick**. Subtitles: x 0.5, baseline 0.925. Titles: x 0.5, cap top at chin line - 0.06 H to + 0.05 H (SWITCH cap top 0.350, WITH MINE 0.408, cards 25 and 26 at 0.450). Split cards beside the head ("is at" right edge 0.29 W, "99" left edge 0.70 W). Places now rotate caption by caption, so titles land at the bottom (the safe-area clamp puts a 0.238 title's baseline at about 0.92 H, vs 0.55 to 0.59 in the reference).
3. **Phrase-level picks**: `pickIn` returns one word per rule per caption, so START UP SEASON can only get one red word. Needs "all words of a marked phrase" or a caption-level style.
4. **Two simultaneous tracks** with mutual suppression: subtitles hidden while a card is up, except one overlap (f349 to f365).
5. **Line breaks by style in stack layout**: the title alone on line 1 and the tag words on line 2. Today lines break by word count.
6. **Word spacing and justify**: gaps of 2.0 em, 4.4 em and 0.81 em vs the engine's fixed 0.25 em; `align: "justify"` to the widest line of the block.
7. **Split placement around the head** with per-word size: "is at" 0.125 left, "99" 0.250 right, different baselines.
8. **Transition text states**: invert-flash (card fill #0299D5, or difference of #FF0000 against a flash layer, 3 frames) and glitch-swap (alternate frames for 8 frames, next card in #FFFFFF with difference). The engine has blend modes per style but no per-frame state switches and no flash layer.
9. **Overlays**: B&W picture-in-picture (box 0.170, 0.160 to 0.829, 0.838, saturation 0, black surround) and cream flash frames (#FFF6ED, 1 solid frame with 81 to 89 % neighbours) are outside the caption engine.

## Evidence (extra/)

| File | Shows |
|---|---|
| 01_text_events_boxes.jpg | 12 key frames with measured text boxes (green) and head boxes (blue) |
| 02_font_title_SWITCH_fit.jpg | observed SWITCH alpha vs 8 fitted condensed faces (red = observed only, cyan = model only, white = match); Anton is the only clean overlay |
| 03_font_title_anton_all_cards.jpg | Anton fitted to 99, is at, WITH MINE, START UP SEASON, I'M STILL IN IT, with size, tracking, blur, residual |
| 04_font_subtitle_googlesans_fit.jpg | 3 subtitle lines vs Google Sans, Figtree, TikTok Sans, Inter, Poppins, Montserrat |
| 05_font_tag_fit.jpg | wanna, would, lifestyle vs Google Sans Flex 700, Inter, Poppins, Montserrat, DM Sans, and a too-light 500 |
| 06_edge_sharpness_red_blur.jpg | 10x pixel crops: blurred red edge vs sharp subtitle and PiP border |
| 07_text_in_front_not_behind.jpg | every card where it crosses the face or neck, with hidden-pixel counts (0) |
| 08_withmine_flash_invert.jpg | f136 to f140: red, inverted on the half and solid flash, gone |
| 09_glitch_title_swap.jpg | f495 to f504 alternate-frame glitch and the cut |
| 10_subtitle_shadow_fit.jpg | the subtitle shadow on the cream flash vs the fitted model |
| 11_pip_and_cream_flash.jpg | the B&W PiP box and the cream flash frames |
| 12_layout_measures.jpg | baselines, cap lines, word gaps in em, head boxes for four cards |
| 13_glyphs_condensed_candidates.jpg | SWITCH WRC 99 is at in Anton and six condensed alternatives at the same cap height |
| 14_glyphs_sans_candidates.jpg | the observed subtitle above Google Sans, Figtree, Poppins, Inter, Montserrat and TikTok Sans at the same cap height |
