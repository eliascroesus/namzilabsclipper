# themochi.app 1788197316: typography and layering breakdown

> Measured frame by frame for the Mimic page (docs/mimic-text.md). The evidence frames named below (extra/...) were kept out of this public repository: they're frames of someone else's video.

Video: 720x1280 (9:16), 24 fps, 91.5 s, 2195 frames. Frame numbers are 0-based (frame n is at n/24 s). Pixel numbers are on the 720x1280 frame. "em" means the font size of the line in question. All colours are sampled from the video (after the creator's grade and the platform's compression).

Method in short: every frame decoded; OCR on all caption frames to find each line's first frame and box; each settled line refitted with rendered font outlines (scale, position, tracking) to get its true x-height, cap height and baseline; entry motion measured by template tracking against the settled line and a clean background plate from the frame before the line appears (offset, scale, opacity per frame); the person and head segmented every frame (MediaPipe selfie and multiclass segmenters) and the fitted text outline intersected with the person matte to measure how much of each word is hidden; drop shadow measured as the before/after brightness ratio around the letters; word onsets from Parakeet TDT ASR. Evidence images are in extra/.

## 1. At a glance

| Frames | Time (s) | Segment | Text on screen |
|---|---|---|---|
| 0-161 | 0.00-6.75 | Talking head A (pink room, practical magenta paper lamp top centre). push-in f0-f16, pull-back with a tilt down f28-f48, jump cut f87/88, push-in x1.31 f92-f108, pull-back x0.83 f150-f161 | Captions 1-3 |
| 162-233 | 6.75-9.75 | Talking head B (close, low angle, warm lamp light). Push-in x1.08 f205-f212 | 4-6 |
| 234-330 | 9.75-13.79 | Plush toy on a table, then sofa talking head. Pull-back x0.90 f309-f328 | 7-8 |
| 330-332 | | Object wipe: the plush is thrown at the lens | |
| 333-522 | 13.88-21.79 | Motion graphics on a pastel mesh gradient: Organize button and cursor, Priority Inbox list and card stack | UI text |
| 523-753 | 21.79-31.42 | Talking head C (sofa, curtains). Push-in x1.18 f534-f557, pull-back x0.81 f611-f641 | 9-11; DM notification banners f655-f753 over the footage |
| 754-756 | | White flash | |
| 757-796 | 31.54-33.21 | Talking head A. Push-in x1.085 | 12 |
| 797-857, 883-917, 965-1032 | | Real footage inserts: hands using the app on an orange iPhone | none |
| 858-882, 918-964 | | Talking head A. Push-in x1.15 on 934-954 | 13, 14 |
| 1033-1073 | 43.04-44.75 | Talking head A | voice-note waveform panel |
| 1074-1076 | | White flash | |
| 1076-1126 | 44.83-46.92 | Purple gradient title card | 15 ("Last but not least / you have the business side", different style) |
| 1124-1526 | 46.83-63.58 | Motion graphics: stats dashboard, member performance, script performance, reels carousel and wall | UI text |
| 1527-1554 | 63.62-64.79 | Talking head A. Pull-back x0.905 | 16 |
| 1555-1558 | | White flash | |
| 1556-1910 | 64.83-79.58 | Motion graphics: app icon, x Claude / x ChatGPT, dark chat composer and streamed answer, integration chain, Qualified Leads notification | UI text |
| 1911-2194 | 79.63-91.46 | Talking head D (pink room, plush in lap), static camera | 17-26 |

What matters for the text from the talking-head treatment:

- The captions are composited inside the footage, under its camera moves. When the footage punches in or pulls out, the settled caption lines scale and slide with it. Measured on settled lines (scale relative to the line's own settle frame): caption 2 x1.115, 3 x0.83, 5 x1.08, 8 x0.90, 9 x1.18, 11 x0.81, 12 x1.085, 14 x1.155, 16 x0.905 (shape: ease-in-out, 10 to 30 frames). Background feature tracking agrees (x1.31 between f89 and f104 while "then this is" grew from 264 to 338 px wide). The final segment (17-26) has a locked-off camera, so its captions do not move after they land.
- Grade: warm magenta and violet (practical magenta lamp, pink walls). The white text samples as #FEF8F5, a faint warm off-white.
- The magenta "glow" at 2.8 s is the out-of-focus practical paper lamp in the set (it sits in every shot of that room and moves with the camera). Nothing is added to the words there: "sell" and "you" sit on top of the lamp with the same off-white fill and the same dark drop shadow as everywhere else.

## 2. Text styles

All 25 caption blocks in the talking-head shots use ONE type style (same font, weight, width, fill, shadow) at different sizes; the per-line size is the only thing that changes. A second style is used once, on the purple title card. UI text inside the pop-ups is a third, system-UI style.

### 2.1 Font identification (caption style)

An expanded neo-grotesk, Bold, with this combination of letterforms (extra/font_glyphs_ref_vs_candidates.jpg, extra/ref_*.jpg):

- a double-storey with a straight stem and no spur; g single-storey with a flat-cut terminal; y with a straight diagonal tail ending in a short flat foot; t with a slanted top-left cut; r with a long arm and vertical terminal; 1 with a long diagonal flag and no foot; closed 4; R with a straight leg; M with vertical sides.
- x-height / digit height 0.753 ("14 days", f2185), descenders short: 0.34 (g) and 0.31 (y) of the x-height. Letters about 15 to 20 % wider than a normal-width grotesk.

| Candidate | a | g | y / 1 | x-height / digit | descender / x-height (g, y) | outline IoU, 10 words | Verdict |
|---|---|---|---|---|---|---|---|
| Video | double-storey | single-storey | straight tail / diagonal flag | 0.753 | 0.34, 0.31 | | |
| SF Pro Expanded Semibold-Bold | double-storey, no spur | single-storey | straight / diagonal flag | about 0.75 | not measurable here | not testable (proprietary, not downloadable here) | likely original; the editor sets all UI text in SF Pro |
| **Zalando Sans wdth 115 wght 700**, tracking -0.033 | same | same | same / shorter flat flag | 0.720 | 0.40, 0.37 | **0.7645** | best free match |
| Mona Sans (npm 2022 release and Google Fonts build) wdth 118 wght 750 | single-storey by default; double-storey only with ss01 | single-storey by default; ss01 makes it binocular | same / same | 0.744 | 0.33, 0.31 | 0.765 | closest proportions, but cannot give double-storey a with single-storey g |
| Google Sans Flex wdth 110 wght 750 | double-storey | single-storey | | | | 0.740 | rounder, geometric |
| TikTok Sans stretch 120 weight 700 (bundled) | double-storey with a spur | single-storey | hooked j | 0.743 | 0.38, 0.38 | 0.718 | bundled fallback |
| Archivo wdth 112 to 125 | spur | binocular | | | | lower | no |

Outline IoU: each word's real pixels against the candidate's outline fitted for scale, position and tracking (extra/font_overlay_zalando_tiktok_mona.jpg, extra/font_overlay_14days.jpg, extra/font_overlay_system_business.jpg; the a/g coupling in extra/font_mona_default_vs_ss01_a_g_coupled.jpg). On "14 days", "system" and "business" Zalando Sans scores 0.738, 0.809, 0.835 and TikTok Sans 0.689, 0.774, 0.782. About 70 other faces were screened (Hubot Sans, Montserrat, Unbounded, Encode Sans Expanded, Roboto Flex, Anek Latin, Inter, Special Gothic Expanded, Funnel, Instrument Sans and more) and scored lower.

Recommendation: Zalando Sans (OFL; Google Fonts; Fontsource `@fontsource-variable/zalando-sans`, whose `wdth.css` carries the 75 to 125 % width axis) at wdth 115, wght 700, tracking -0.033 em. Its metrics: x-height 0.514 em, cap height 0.714 em. All sizes below are given both as measured pixels (font independent) and as Zalando Sans sizes that reproduce the measured x-height.

### 2.2 Style table

| id | Role | Font | Weight / width / case | Measured x-height (range) | Cap height | Zalando Sans font px | Engine size |
|---|---|---|---|---|---|---|---|
| cap-s | small lead-in or function-word line ("if you", "then this is", "where", "and then", "if your", "for") | Zalando Sans | 700 / wdth 115 / as typed | 30 px = 2.4 % H (20 to 32) | 40 px = 3.1 % H | 59 | 0.0458 |
| cap-m | middle lines ("through", "exactly", "who need", "conversation") | same | same | 38 px = 2.9 % H (33 to 44) | 50 px = 3.9 % H | 73 | 0.0573 |
| cap-l | emphasis line, usually the last of the block ("Instagram", "everything", "the same", "an inbox", "business") | same | same | 51 px = 4.0 % H (46 to 62) | 68 px = 5.3 % H | 100 | 0.0781 |
| cap-xl | extra-large closer ("14 days", "for free", "actual", "system") | same | same | 72 px = 5.6 % H (69 to 74) | 95 px = 7.4 % H | 139 | 0.1088 |
| cap-hook | giant hook word ("mochi" in 3, "CRM", "all") | same | same | 109 px = 8.5 % H (101 to 113) | 145 px = 11.3 % H | 213 | 0.1661 |
| title-glow | title card "Last but not least / you have the business side" | SF Pro Display look; Inter 700 best free fit (IoU 0.811) | 700 / normal / sentence case | 20.5 px = 1.6 % H | 27 px = 2.1 % H | Inter 37 | 0.029 |
| ui-sf | UI text inside cards, chips, banners | SF Pro Text / Display; Inter stand-in | 400 to 700 | | | 13 to 30 | see popups.json |

The size is continuous rather than strictly tiered (73 lines measured, x-height 20 to 113 px); the five tiers above are clusters of the measured sizes. Sizes are measured when each line lands, so they include whatever camera zoom the footage had at that moment.

Shared caption properties (all five cap-* tiers):

- **Case**: as typed. Lower case throughout, except "Instagram", "DMs", "CRM". The brand is written "mochi" in lower case every time.
- **Tracking**: -0.033 em in Zalando Sans (fits from -0.008 to -0.040 depending on width; the letters sit tight but never touch).
- **Line spacing**: lines are packed tight. Baseline to baseline = 0.97 x the cap height of the larger of the two lines (median of 47 line pairs, range 0.77 to 1.26), so descenders of one line reach into the cap band of the next.
- **Fill**: solid #FEF8F5 (median of the eroded letter cores of 13 settled lines; 5th to 95th percentile on "Instagram": #FAF4F2 to #FFFAFA). No gradient on any caption word.
- **Stroke**: none.
- **Shadow**: soft drop shadow straight down. Measured as the before/after brightness ratio below the letters (extra/shadow_profile.jpg): darkening 40 % at 3 px under the edge, 30 % at 6 px, 19 % at 10 px, 6.5 % at 15 px, gone by 22 px for a 104 px word ("Instagram"); 35 %, 25 %, 9 %, 0 % at 3, 6, 10, 15 px for a 79 px word ("figure out"). Nothing above the letters beyond 5 px, slightly more on the right side than the left. Fit: colour near-black (regression gives about #141414), opacity 0.55, offset 1.5 px right and 7 px down, Gaussian sigma 6 px for a word with a 56 px x-height; in Zalando Sans ems: x +0.014, y +0.064, sigma 0.055 (canvas `shadowBlur` 0.11 em). The shadow scales with the font size.
- **Glow**: none on captions.
- **Opacity**: 1.0 once landed.
- **Blend mode: normal.** Evidence: (1) during the fade-in the apparent opacity is identical over dark and light background pixels (for example "itself" 0.670 vs 0.671, "Instagram" 0.675 vs 0.677, "you" 0.680 vs 0.673 on their first frames), which rules out overlay, soft light, multiply and difference, whose result depends on the background; (2) the shadow darkens the picture, which screen, lighten, add and colour dodge cannot do; (3) the letters stay #FEF8F5 over both the dark curtains (#361A20 to #462228 next to "if you") and the bright magenta lamp.
- **Alignment and layout**: a stack of 1 to 5 lines (median 3) set just above the head. 47 of 73 lines hold one word, 24 hold two, 2 hold three. The biggest line of each block is centred on the frame (median offset 1.5 px). The other lines are staggered: the first line sits left of the big line's centre in 20 of 22 blocks (median -58 px = -0.081 W, IQR -98 to -20 px); later lines step left or right (absolute offset median 59 px = 0.082 W, IQR 25 to 106 px, max 177 px). Block top at 0.138 H (median, range 0.067 to 0.17), block bottom at 0.292 H, which is 1.5 % H below the median top of the head (0.277 H). Caption 4 is the exception: "and" and "no" sit on one baseline at 0.457 H on either side of the face.

### 2.3 Title card style (caption 15)

Inter 700 is the best free fit (SF Pro Display Semibold-to-Bold look), 37 px (cap 27 px, x 20.5 px), tracking -0.01 em, fill #FFF6FF, no shadow, white glow: +22 luma at 3 px from the letter edge, +12 at 5 px, +5.5 at 7 px, nothing past 10 px (Gaussian sigma about 4.5 px = 0.12 em, canvas shadowBlur 0.24 em), added in a screen-like way (green rises more than red and blue on the magenta background). Two lines, baseline to baseline 39 px (1.44 x cap height), line 2 indented about +70 px. Background: drifting purple gradient #742483 (left) to #8A2D62 (right).

## 3. Caption events

Every line of every caption, in captions.json with per-line boxes, measured font size, entry curve, hidden share and the spoken word. Tier letters: s, m, l, xl, hook (section 2.2). "Frames after the spoken onset" compares the line's first visible frame with the ASR start of its first word; Parakeet TDT starts are about 2 frames (0.07 s) earlier than the acoustic energy onsets where those are clear, so +2 means "on the word". Head box from the multiclass segmenter (hair plus face) on the block's last frame; boxes are x0,y0,x1,y1 as shares of the frame.

| # | Frames (s) | Lines: "text" [tier, measured x-height px, first frame, frames after the spoken onset] | Block bbox | Head bbox | Layer |
|---|---|---|---|---|---|
| 1 | 33-87 (1.38-3.67) | "if you" [s, 31, f33]; "sell" [m, 36, f38, +5]; "through" [m, 38, f46, +4]; "Instagram" [l, 56, f54, +2]; "DMs" [m, 38, f65, +0] | 0.11,0.13,0.89,0.35 | 0.15,0.35,0.47,0.58 | behind (proven) |
| 2 | 89-137 (3.71-5.75) | "then this is" [s, 30, f89, +1]; "basically" [s, 32, f105, -1]; "everything" [l, 54, f122, +1] | 0.12,0.16,0.90,0.31 | 0.36,0.37,0.73,0.64 | no overlap |
| 3 | 139-161 (5.79-6.75) | "that" [m, 36, f139, +8]; "mochi" [hook, 101, f143, +7]; "does" [s, 30, f149, -5] | 0.13,0.17,0.88,0.33 | 0.33,0.36,0.64,0.59 | no overlap |
| 4 | 163-192 (6.79-8.04) | "and" [m, 36, f163, +0]; "no" [m, 37, f169, +0] | 0.11,0.42,0.88,0.47 | 0.27,0.17,0.73,0.54 | behind (proven) |
| 5 | 194-212 (8.08-8.88) | "this is" [l, 56, f194, +8]; "not just" [l, 62, f202, +4] | 0.09,0.07,0.87,0.22 | 0.31,0.18,0.76,0.53 | behind (proven) |
| 6 | 214-233 (8.92-9.75) | "another" [m, 37, f214, +7]; "CRM" [hook, 109, f220, +1] | 0.13,0.10,0.83,0.30 | 0.28,0.24,0.79,0.65 | behind (proven) |
| 7 | 255-291 (10.62-12.17) | "mochi" [s, 31, f255, +2]; "helps you" [s, 32, f269, -2]; "figure out" [m, 43, f277, -3] | 0.19,0.13,0.81,0.26 | 0.24,0.30,0.62,0.56 | no overlap |
| 8 | 293-328 (12.21-13.71) | "exactly" [m, 41, f293, -1]; "who need" [m, 42, f303, -2]; "your" [m, 39, f309, -8]; "attention" [m, 38, f316, -7] | 0.21,0.15,0.79,0.32 | 0.34,0.33,0.68,0.57 | no overlap |
| 9 | 523-557 (21.79-23.25) | "instead of" [s, 20, f523, +3]; "opening" [s, 31, f536, +4]; "Instagram" [m, 44, f544, +1] | 0.20,0.12,0.82,0.24 | 0.40,0.26,0.71,0.49 | no overlap |
| 10 | 559-598 (23.29-24.96) | "where" [s, 28, f559, +4]; "every lead" [s, 24, f565, +2]; "looks" [s, 31, f582, +4]; "the same" [l, 53, f587, +1] | 0.17,0.12,0.84,0.29 | 0.36,0.26,0.71,0.52 | behind (proven) |
| 11 | 601-654 (25.04-27.29) | "you can" [m, 43, f601, +0]; "actually" [m, 41, f609, -2]; "see" [m, 42, f618, -2]; "within" [l, 47, f629, +1]; "1second" [l, 48, f639, +2] | 0.21,0.12,0.80,0.35 | 0.40,0.35,0.65,0.53 | FRONT (proven) |
| 12 | 757-796 (31.54-33.21) | "and then" [s, 28, f757, +6]; "there is" [m, 34, f763]; "the" [m, 42, f768, +0]; "conversation" [m, 40, f772, +2]; "itself" [l, 51, f781, -2] | 0.14,0.11,0.86,0.34 | 0.33,0.34,0.69,0.62 | FRONT (proven) |
| 13 | 859-882 (35.79-36.79) | "it can" [m, 44, f859, +5]; "suggest" [l, 50, f867, +1]; "you" [l, 56, f871, -8] | 0.18,0.15,0.87,0.31 | 0.40,0.38,0.72,0.63 | no overlap |
| 14 | 919-964 (38.29-40.21) | "it can even" [s, 25, f919, +1]; "turn" [l, 46, f937, +0]; "a written" [l, 52, f946, +1]; "message" [m, 33, f958, -4] | 0.21,0.16,0.82,0.34 | 0.38,0.44,0.73,0.72 | no overlap |
| 16 | 1527-1554 (63.62-64.79) | "and that" [m, 35, f1527, +6]; "is not" [l, 49, f1532, +2]; "all" [hook, 113, f1540, -2] | 0.34,0.15,0.83,0.36 | 0.17,0.27,0.60,0.60 | touches hair, not provable |
| 17 | 1911-1933 (79.62-80.58) | "basically" [m, 42, f1911, +3] | 0.25,0.17,0.76,0.23 | 0.46,0.28,0.79,0.52 | no overlap |
| 18 | 1935-1976 (80.62-82.38) | "Instagram" [m, 34, f1935, +3]; "gives you" [m, 34, f1950, +3]; "an inbox" [l, 56, f1959, +3] | 0.14,0.13,0.86,0.29 | 0.38,0.25,0.64,0.44 | behind (proven) |
| 19 | 1978-2014 (82.42-83.96) | "and" [s, 27, f1978, +2]; "mochi" [m, 39, f1984, +3]; "turns it" [l, 48, f1997, -4] | 0.24,0.14,0.77,0.26 | 0.41,0.25,0.66,0.44 | behind (proven) |
| 20 | 2016-2034 (84.00-84.79) | "into an" [l, 47, f2016, +2]; "actual" [xl, 73, f2024, +0] | 0.18,0.14,0.81,0.30 | 0.43,0.26,0.69,0.45 | behind (proven) |
| 21 | 2036-2055 (84.83-85.67) | "sales" [l, 46, f2036, +3]; "system" [xl, 74, f2041, -2] | 0.13,0.14,0.87,0.29 | 0.42,0.28,0.69,0.47 | behind (proven) |
| 22 | 2057-2075 (85.71-86.50) | "if your" [s, 28, f2057, -3]; "business" [l, 61, f2068, -2] | 0.13,0.15,0.87,0.26 | 0.35,0.26,0.63,0.47 | behind (proven) |
| 23 | 2077-2116 (86.54-88.21) | "uses" [m, 33, f2077, +0]; "Instagram" [l, 47, f2082, -5]; "DMs" [m, 34, f2094, -6] | 0.17,0.14,0.82,0.27 | 0.53,0.28,0.83,0.51 | no overlap |
| 24 | 2118-2138 (88.25-89.12) | "then" [m, 33, f2118, +0]; "try out" [m, 34, f2124, +2]; "mochi" [m, 41, f2131, +0] | 0.24,0.14,0.68,0.28 | 0.47,0.29,0.80,0.52 | no overlap |
| 25 | 2140-2158 (89.17-89.96) | "for free" [xl, 70, f2140, -7] | 0.15,0.16,0.84,0.26 | 0.48,0.26,0.78,0.50 | behind (proven) |
| 26 | 2162-2194 (90.08-91.46) | "for" [s, 31, f2162, +4]; "14 days" [xl, 69, f2166, +4] | 0.15,0.15,0.85,0.29 | 0.46,0.28,0.77,0.51 | behind (proven) |

Caption 15 (title card, f1076-f1126): "Last but not least" (words at f1076, f1079, f1083, f1088) / "you have the business side" (f1100, f1104, f1108, f1112, f1116), title-glow style, block 0.16,0.44,0.92,0.50 at f1117, no person in shot.

Timing: the caption onset is the onset of its first spoken word. Over 73 lines the first visible frame is a median of +1 frame after the ASR word start (IQR -2 to +3 frames, so within about 2 frames of the acoustic onset). Words inside a line normally appear together; three lines build word by word instead: "it can" then "even" (f919, f928), "for" then "free" (f2140, f2145) and the title card.

Entry (all 71 caption lines in the talking-head shots, one recipe; extra/entry_curves.jpg):

- Kind: rise plus fade, per line, no scale, no blur filter (only motion blur while moving). Words that join an existing line ("even", "free") rise in place next to it.
- Median per-frame values from the first visible frame (frame 0), captions 1-16: offset 83, 55, 37, 26, 15, 12, 8, 5, 2, 1, 0 px; opacity 0.68, 0.83, 0.90, 0.96, 0.98, 0.99, 1.0. Captions 17-26 are slower: offset 81, 60, 44, 34, 25, 19, 14, 9, 6, 4, 2, 1, 0 px; opacity 0.55, 0.72, 0.82, 0.87, 0.91, 0.94, 0.96, 0.98, 0.99, 1.0.
- Offset curve: quintic ease-out fits best (median error 1.1 px): 16 frames in captions 1-16, 20 frames in 17-26, from a start offset of 88 px (median, IQR 76 to 115 px = 0.069 H); the animation starts a fraction of a frame before the first visible frame. A cubic ease-out over 12 frames (0.49 s) fits almost as well (1.6 px). Examples: "DMs" f65-f73: 74, 50, 34, 23, 15, 9, 5, 2, 0 px; "helps you" f269-f281: 104, 73, 53, 38, 27, 19, 13, 8, 5, 3, 2, 1, 0 px.
- Opacity is fast and front-loaded: about two thirds on the first frame, 0.95 by the 3rd frame (captions 1-16) or the 5th (17-26).
- The start offset is roughly constant in pixels, not in ems: "every lead" (45 px font) starts 119 px low (2.6 em) while "all" (210 px font) starts 77 px low (0.37 em).
- No overshoot when the camera is still (worst -2 px, within measurement noise).
- Motion blur: the moving line is smeared vertically (edge sharpness of "Instagram" 608 at 6 px/frame vs 695 at rest); consistent with a 180 degree shutter.

Exit: none. Every caption disappears in one frame with all its lines (no fade, scale or slide), whether or not the footage cuts there. Usually exactly one empty frame follows (for example last text f87, next caption f89), sometimes two or three. Only exception: the last caption blinks off for one frame at f2189 and dims to about 70 % on the last two frames of the video.


## 4. Text behind the person

The caption layer sits UNDER a cut-out of the speaker in 12 of the 14 captions where text and speaker overlap; in the other 2 the text stays on top. Method: each settled line refitted every frame with a rendered outline of its text (Mona Sans outlines, which share the video's proportions; the a/g shape difference does not matter for coverage), intersected with the person matte (MediaPipe selfie segmenter run on two 720x720 squares per frame); "hidden" is the share of the line's glyph area inside the matte, and "visible inside" is the share of those pixels that still show text. Evidence crops: extra/behind_*.jpg (green line = segmenter outline).

| # | Words | Frames | Hidden share | What covers it | Edge |
|---|---|---|---|---|---|
| 1 | "DMs" | f68-f81 | not measurable (segmenter misses the hand); by eye 15 to 30 % of D and M | his raised fingers holding the phone | follows the fingers including their motion blur |
| 4 | "and" (of "and ... no") | f175-f192 | by eye the right third of the d | his cheek | clean skin edge |
| 5 | "not just" | f207-f212 | 7.6 to 9.5 % (j descender and bottom of "not" gone, so it reads "not iust") | hair | soft, 2 to 3 px, single strands visible over the o |
| 6 | "CRM" | f221-f233 | 4.4 to 11.2 % | hair | soft, follows the curls |
| 10 | "the same" | f591-f598 | 0.2 to 2.5 % (bottom of "sa") | hair | soft |
| 18 | "an inbox" | f1963-f1976 | 16.2 % on its first frame, 4.8 to 7.3 % once landed (bottom of "in") | hair | soft, 2 to 4 px |
| 19 | "turns it" | f1999-f2004 | 17.8 % on its first frame, 0 % from f2005 | rises out from behind the head | soft |
| 20 | "actual" | f2027-f2034 | 11.4 % at f2027 down to 0.3 % at f2034 (bottom of "tu") | hair | soft |
| 21 | "system" | f2042-f2045 | 9.4 % on its first frame, 0 % from f2046 | rises out from behind the head | soft |
| 22 | "business" | f2068-f2070 | 8.7 % on its first frame, 0 % from f2071 | rises out from behind the head | soft |
| 25 | "free" | f2145-f2149 | bottoms of "fr" cut while it rises | hair | soft |
| 26 | "14 days" | f2166-f2175 | 4.1 % on its first frame | rises out from behind the head | soft |
| 11 | "1second" | f639-f640 | 5.5 % overlap, 77 % of it still visible | drawn OVER the hair (front) | n/a |
| 12 | "itself" | f781 | 3.7 % overlap, 90 % still visible | drawn OVER the hair (front) | n/a |

In every "behind" case 0.0 to 0.8 % of the overlapping glyph pixels are visible inside the person matte: the hair is drawn fully on top of the letters (not blended or darkened).

How the trick is used:

- Layout does most of the work: the block is set so its bottom line overlaps the top of the head (block bottom 0.292 H vs head top 0.277 H, medians). Hidden shares are small (0.2 to 11 % once settled): only descenders and the bottom of the last line go behind the hair, so the words stay readable.
- The rise entry doubles the effect: a line that rises 80 to 110 px from below starts behind the head and slides out of it (captions 19, 21, 22 and 26: 4 to 18 % hidden on the first frame, 0 % three to nine frames later; 25 by eye).
- The cutout tracks every frame. Hair edges are soft (2 to 4 px feather) with strand detail, the hand in caption 1 keeps its motion blur: this is a proper matte (rotoscope or AI matting with motion blur), not a hard mask.
- In caption 4 the two words are deliberately parked either side of the face at mouth height so the cheek clips the d.
- Caption 16 ("all") only touches the hair: the segmenter edge overlaps the a by 1 to 2 px (0.6 to 2.3 %) but no cut is visible at pixel level, so it is counted as no overlap.
- No other cutout tricks: nothing is placed in front of the person on purpose, no outline of the person, no text wrapping around the silhouette.

## 5. Word effects

| Effect | In this video? | Detail |
|---|---|---|
| Gradient fill on words | No | every caption word is flat #FEF8F5 (core colour spread under 8 levels) |
| Blend modes on words | No | normal; see 2.2 for the test |
| Glow | Only on the title card (caption 15) | white bloom, sigma about 4.5 px; the magenta "glow" at 2.8 s is the practical lamp behind the words |
| Outline / stroke | No | |
| Drop shadow | Yes, every caption | near-black, 55 %, x +0.014 em, y +0.064 em, sigma 0.055 em (Zalando Sans ems) |
| Highlight box or underline | No | |
| Colour change on the spoken word | No | lines are static once landed (no karaoke) |
| Scale pulse / pop | No | entry has no scale component (scale 1.00 on every measured frame of 71 entries) |
| Rise + fade | Yes, every line | about 88 px from below, quintic ease-out 16 to 20 frames; opacity 0.68 on the first frame, 0.95 by the 3rd to 5th |
| Motion blur | Yes | vertical smear while rising |
| Blur-in | Only on the title card words (first 2 frames) | |
| Typewriter / letter by letter | No on captions | used in UI: the "Organize" label types one letter per frame; the chat prompt types 4 to 5 characters per frame |
| Mask wipe / reveal | No on captions | the title card is wiped away by white cards |
| Emoji / icons beside words | No | |
| Size contrast inside a block | Yes, the main device | largest to smallest line in a block: median 1.73x (range 1.03x in "and / no" to 3.33x in "that / mochi / does") |
| Camera zoom carrying the text | Yes | captions scale with the footage punch-ins (x0.81 to x1.31) |
| Behind-the-head layering | Yes | section 4 |

## 6. Pop-ups and motion-graphic overlays

Full numbers per element are in popups.json. Shared design language: white cards with 16 to 26 px corner radius and soft pink-violet shadows on an animated pastel mesh gradient (top left #C9A1CE lilac, top right #F9C595 peach, bottom left #B13D6C raspberry, bottom right #E59FAA pink); a hot-magenta #FA02D7 arrow cursor that glides in with an exponential ease-out (speed falls to about 0.65 of itself each frame) and clicks; iOS-style glass banners that grow out of a small pill like the Dynamic Island; SF Pro UI type; white flash transitions.

| Element | Frames | Shape and style | How it enters / leaves |
|---|---|---|---|
| Organize button | 333-351 | white rounded rect, 201x74 px settled (260x101 at the peak), radius 26 px, magenta-violet rim on the right and bottom, soft white halo; label "Organize" SF Pro Semibold about 22 px #242225 | grows from a 6x24 px sliver: width 6, 132, 195, 228, 246, 257, 259, 260 px on f333-f340 (ease-out); letters type in one per frame f335-f339, each popping up from about 4 px lower; centre slides down from y 525 to 631; click squash to 0.78 over f340-f350; label turns #9F2CB0 left to right after the click |
| Cursor | 337-351 | #FA02D7 arrow 47x52 px | from (665,861) at f337 to rest at (423,640) by f346, steps 117, 71, 45, 33, 24, 17, 13 px |
| Priority Inbox | 352-522 | header card 335x81 px (radius about 20), 4 rows 335x73 px (radius about 18, gap 8 px) with 32 px coloured icon tiles (#F05FA8, #7A4CF0, #F7A23A, #8A6E7A) and chevrons; later 5 conversation cards with 40 px avatars ringed in #34C759, "Qualified" chips (white pill, grey 1 px border, orange star) and tag chips | the button stretches to 458 px and becomes the header (f352-f360, motion blur); rows stagger in every 2 frames (f360-f366), each led by a magenta-to-clear gradient bar sweeping from the left; whole stack in 3D (estimated about -12 deg Y, 6 deg X) with a push-in; rows collapse to dots (f398-f410) and blank cards drop from the header and fill in (f410-f422); camera pushes about x1.6 with tilt (f424-f520); hard cut out |
| DM notifications (over the talking head) | 655-753 | frosted glass banner 390x93 px at (165,265), radius about 26 px, fill brightens the footage by about 8 levels with a soft blur, 1.5 px light rim; 50 px gradient avatar (coral, violet, lime), name 19 px semibold, message 17 px, time "2m / 1m / now" | Dynamic Island morph in 6 frames: pill 50x25 (f656), 95x55, 170x80, 240x95 with horizontal motion blur, 340x95, 390x93 (f662); message types in word by word; collapses back to a pill that rises (4 frames) and the next banner grows from it (Richard f660, Tyler Jackson f692, Michael f728) |
| Voice-note panel | 1038-1073 | glass panel 356x144 px at (180,198), radius about 32, 2 px white rim; about 26 white bars 7 px wide on a 12 px pitch, 6 to 82 px tall, pink-white glow; heights change every frame | outlined capsule at f1038, full size by f1042; white flash out f1074-f1076 |
| Stats dashboard | 1124-1280 | white cards (radius about 16, shadow about 20 px blur, 8 px down): two stat cards, three small cards, Setter Replies, Active hours chart; 22 px icon tiles | blurred white slabs sweep in from right and bottom over the title card (f1124-f1136); numbers count up 0 to 857 over f1136-f1165 (25, 532, 630, 708, 768, 811, 839, 854, 857 every 3 frames: cubic ease-out); bars grow; 3D camera zooms and tilts with whip moves at f1215 and f1246 |
| Member performance | 1280-1316 | tilted table card, title in #D02BC0 | cards rise in perspective, staggered |
| Script performance | 1316-1412 | button pill + script cards with Good (green) / Bad (red) chips | same button-to-list morph as Organize, cursor click, list scrolls up fast with motion blur |
| Reels carousel and wall | 1416-1526 | phone-shaped video cards (estimated 105x185 px), radius about 12, purple radial glow behind the centre card, stats text under it | carousel slides left with the centre card scaled up; pulls back to a 3D wall of about 30 cards; white flash out |
| App icon, x Claude, x ChatGPT | 1556-1640 | iOS app icon (white rounded square, mascot) | after a white flash, zooms down from 263 px to 142 px over f1560-f1580 (exponential ease-out, about -6.5 % per frame at first), then slides left and shrinks to 91 px while "x" and the Claude logo pop in; Claude rolls up and out as ChatGPT rolls in (slot-machine swap) |
| Chat composer and answer | 1640-1772 | dark composer bar (radius about 18) on a dark mesh gradient; model chip "Fable 5 High", orange #F26B3A send button | prompt types 4 to 5 characters per frame (f1658-f1669); cursor clicks send; answer streams about one line every 1.5 to 2 frames with a slight blur-in and scrolls; leaves with a vertical smear |
| Integration chain | 1752-1840 | 3D-rendered icons about 56 px joined by white dashed elbow lines | one icon about every 4 frames (Mochi, Sheets, Gmail, Calendar, Slack at f1767), each popping slightly past full size as the dashed line reaches it; camera whips back left (f1772-f1774) to reveal the Zapier starburst, then drifts and pulls back to about 0.6x |
| Qualified Leads notification | 1844-1910 | dark rosy glass banner (darkens the pink to 75 %), radius about 28, 70 px app icon, two text lines, "now" | Dynamic Island morph; slow push-in; cursor drifts from (570,730) to (529,647); white flash out |
| Plush toy | 234-330, 1977-2194 | physical toy | thrown at the lens as the f330-f333 transition; in the last segment it sits in his lap below the captions |

Transitions between the talking head and the graphics: object wipe (plush thrown at the lens, f330-f332), hard cuts (f522/523, f1526/1527), white flashes of 2 to 3 frames (f754-f756, f1074-f1076, f1555-f1558, f1908-f1910) and a white-card wipe (f1124-f1132).

## 7. Recipe (everything a renderer needs)

Caption type

- Font: Zalando Sans variable at wdth 115, wght 700, tracking -0.033 em (free stand-in for an expanded neo-grotesk, most likely SF Pro Expanded Semibold to Bold). Bundled fallback: TikTok Sans stretch 120, weight 700, tracking 0.
- Case as typed (lower case, proper nouns capitalised, brand "mochi" lower case).
- Fill #FEF8F5, opacity 1, blend normal, no stroke, no glow.
- Drop shadow: colour #141414 at 55 % opacity, offset x +0.014 em, y +0.064 em, Gaussian sigma 0.055 em (canvas shadowBlur = 0.11 em x font px). In pixels for a 56 px x-height word: 1.5 px right, 7 px down, sigma 6 px.
- Metrics for size conversion (Zalando Sans): x-height 0.514 em, cap height 0.714 em. Measured in the video: x-height / cap height 0.753.

Sizes per line (measured x-height; Zalando Sans font px on a 1280 px frame; share of frame height)

- Lead-in or function-word line: x-height 30 px, 59 px font (0.0458). Middle line: 38 px, 73 px (0.0573). Emphasis line (normally the last line): 51 px, 100 px (0.0781). Number or closing punchline: 72 px, 139 px (0.1088). Hook word: 109 px, 213 px (0.1661).
- One size per line; words in the same line share the size. Typical block: small first line, one or two middle lines, emphasis last line. Largest to smallest ratio median 1.73x, range 1.03x to 3.33x.

Layout

- 1 to 5 lines (median 3), 1 word per line in 64 % of lines, 2 words in 33 %.
- Baseline to baseline: 0.97 x cap height of the larger line of the pair (range 0.77 to 1.26).
- Horizontal: largest line centred on x = 0.5 W; first line shifted left by 0.081 W (median, IQR 0.028 to 0.136 W); later lines shifted left or right by 0.035 to 0.147 W (IQR); lines keep at least 0.09 W from the frame edges.
- Vertical: block top at 0.138 H; place it so the bottom line overlaps the top of the speaker's head by about 0.015 H (2 to 11 % of that line's glyph area ends up behind the hair).
- Variant (caption 4): two short words on one baseline at mouth height (0.457 H), one each side of the face (x 0.11 to 0.29 W and 0.76 to 0.88 W).

Timing and motion

- A new caption block starts on its first spoken word. Each line appears on the spoken onset of its own first word (median +1 frame after the ASR start, about on the acoustic onset). Words that follow in the same line appear with it, except rare appended words.
- Line entry: start 88 px (0.069 H) below its rest position at opacity 0. Position eases to rest with a quintic ease-out over 16 frames (0.67 s; 20 frames in the final segment). Opacity per frame from the first visible frame: 0.68, 0.83, 0.90, 0.96, 0.98, 0.99, 1.0 (final segment 0.55, 0.72, 0.82, 0.87, 0.91, 0.94, 0.96, 0.98, 0.99, 1.0). Scale constant 1. Vertical motion blur with a 180 degree shutter.
- Earlier lines do not move when a new line lands.
- Exit: the whole block disappears in one frame; leave one empty frame before the next block.

Layering

- Draw the caption layer (letters and shadow) between the background plate and a soft person matte (2 to 4 px feather, hair detail, hands included, recomputed every frame). Keep 2 of 14 overlapping blocks in front (here captions 11 and 12) if you want the exact mix; otherwise all behind.
- Composite captions inside the footage transform: when the footage is zoomed (punch-in x1.08 to x1.31 or pull-back x0.81 to x0.905 over 10 to 30 frames, ease-in-out), the caption block scales and moves with it around the same anchor.

Title card variant (once)

- Inter 700, 37 px, tracking -0.01 em, fill #FFF6FF, white glow sigma 4.5 px, two lines (second indented about +70 px), words added one by one on their onsets with a 17 px rise, blur on the first 2 frames and opacity 0.09, 0.30, 0.71, 0.91, 0.97, 1.0; the line slides left to stay centred as each word lands; the block shrinks about 6 % per 10 frames; white card wipe out.

## 8. Gaps (what this edit needs that a typical caption tool lacks)

1. A size hierarchy per LINE inside a stacked block (2 to 4 sizes, x-height 20 to 113 px), not per word, with one-word lines as the norm.
2. Staggered line offsets (first line about 0.08 W left of centre, others stepping left or right) instead of one alignment for the block.
3. Entry distance in frame units (constant about 88 px for every size) rather than in ems.
4. Separate easing and duration for position (quintic, 16 to 20 frames) and opacity (0.95 within 3 to 5 frames) in one entry.
5. Motion blur on moving text.
6. Captions inside the footage's camera move (zoom or pan keyframes on the clip carry the text).
7. A per-frame soft person matte (hair strands, motion-blurred hands) drawn over the captions, with per-caption front or behind.
8. Placement relative to the head: block bottom keyed to the head top, or words parked either side of the face.
9. Hard-cut exits with a one-frame gap between blocks.
10. For the graphics: UI cards and banners with Dynamic Island morphs, a scripted cursor, count-up numbers, typed labels, 3D camera moves over flat layers, white flash and object-wipe transitions.

## 9. Fit to our engine (ENGINE.md)

> Since this was written the engine gained what several items below ask for, and the "Mochi vertical" look (app/src/mimic/presets.ts) uses them: Zalando Sans is bundled (zalando-sans, width 75 to 125%); captions ride the footage's zooms (ride); a quintic ease and a fade of its own, quicker than the move (ease "quint", fade); a rise the same in pixels at every size (each style its own enter, its distance in its own font sizes); lowercase that keeps names (case "names"); and per-line offsets (indents). Still missing: placement keyed to the head, front or behind chosen by where the head is, true motion blur, and the pop-ups.

Maps cleanly

- `TextStyle` for every caption tier: font `zalando-sans` (new id), weight 700, stretch 115, case `as-said`, tracking -0.033, fill solid #FEF8F5, stroke null, glow null, box null, opacity 1, blend `normal`, shadow {color rgba(20,20,20,0.55), blur 0.11, x 0.014, y 0.064}. Sizes 0.0458 / 0.0573 / 0.0781 / 0.1088 / 0.1661.
- `layout: "stack"`, one place {x 0.5, y 0.138, align center, valign top, width 0.8}, `exit: null` (hard cut).
- `enter: {kind "rise", unit "line", stagger 0, ease "out"}`: unit `line` gives each line its own onset on its first word, as in the video. The engine's opacity ramp (first third of the move) at dur 0.5 s lasts 4 frames, close to the measured 3.5 (but linear, see below).
- Title card: Inter 700, size 0.029, fill #FFF6FF, glow {#FFFFFF, blur 0.24, strength 0.4}.

Approximated (design.json)

- Size hierarchy: picks `first` > cap-s (share 0.6), `last` > cap-l (0.7), `number` > cap-xl (1.0), `marked` > cap-hook (0.12). The video sizes lines, the engine styles words: with `words: 2`, a two-word last line such as "the same" gets one big and one base word. Setting `words: 1` fixes that but splits every two-word line (24 of 73 lines in the video are two words).
- Leading 0.93: the engine adds 0.4 x 0.55 x descender of the line above, so equal lines land within 4 % of the measured spacing, a small line under a big one about 7 px (0.005 H) tighter ("DMs" under "Instagram": 53 px vs 60 px) and a big line under a small one about 4 px looser.
- Entry distance: `dist` is in ems, so one value cannot give a constant 88 px. design.json uses 1.15 em for the base (73 px font > 84 px) and 0.85 em in `accentEnter` (100 px > 85 px, 139 px > 118 px, 213 px > 181 px): a hook word travels about twice as far as in the video.
- Entry curve: the engine's `out` ease is cubic; dur 0.5 s (12 frames) gives offsets of 68, 51, 37, 26, 11, 3 px on frames 1, 2, 3, 4, 6, 8 against the measured quintic 64, 46, 33, 23, 11, 3 px (at most 5 px apart). Opacity is the bigger difference: the engine ramps linearly to 1 over 4 frames (0.25, 0.5, 0.75, 1.0) where the video is already at 0.67 on its first frame (0.67, 0.84, 0.90, 0.95).
- Behind: `behind.share 0.85` reproduces 12 behind to 2 front; the engine chooses which captions by count, the video by where the head is.

Cannot express yet (with numbers)

- Per-line horizontal stagger: first line -0.081 W, others plus or minus 0.035 to 0.147 W. Needs a per-line dx (or an alternating stagger rule) on `CaptionPlace`.
- Camera zoom on the caption layer: x0.81 to x1.31 per shot over 10 to 30 frames. Needs captions to inherit the clip's transform keyframes.
- Motion blur: 180 degree shutter on the rise (the 88 px move covers 24 px in its first frame).
- Separate opacity and position curves (opacity at 0.95 within 3 to 5 frames while the position takes 16 to 20 frames) and a quintic ease.
- Pixel-constant entry distance (0.069 H for every size).
- Head-keyed placement: block bottom = head top + 0.015 H; caption 4's words either side of the face at mouth height.
- Per-caption choice of front or behind by overlap (the engine's share is positional).
- Title card: per-word blur plus rise, live re-centring of a growing line (about 60 px slide), block zoom-out of about 6 % per 10 frames.
- All pop-ups (popups.json): cards, banners, cursor, counters, 3D camera, flashes and wipes are outside the caption model.
- Font: Zalando Sans is not bundled; add `@fontsource-variable/zalando-sans` (OFL, with its `wdth.css` for the width axis) as `zalando-sans`. Until it is added, swap in `tiktok-sans` at stretch 120, weight 700, tracking 0 and sizes x0.98 (`_fontToAdd.fallbackIfNotAdded` in design.json); its a has a spur. Mona Sans looks closer in proportions but cannot be used: it has no setting with a double-storey a and a single-storey g together.

## Evidence files (extra/)

- Font: font_glyphs_ref_vs_candidates.jpg, font_googlesansflex_zalando_encode.jpg, font_hubot_v1_default_vs_ss01.jpg, font_mona_default_vs_ss01_a_g_coupled.jpg, font_other_wide_candidates.jpg, font_overlay_14days.jpg, font_overlay_system_business.jpg, font_overlay_zalando_tiktok_mona.jpg
- Reference crops: ref_14days_f2185.jpg, ref_bigwords_all_mochi_actual.jpg, ref_sales_system_another_crm.jpg
- Behind evidence (green line = segmenter outline): behind_actual_f2028_f2033.jpg, behind_an_inbox_f1968_turns_it_f2005.jpg, behind_and_cheek_f180_f190.jpg, behind_dms_fingers_f66_f81.jpg, behind_edge_pixels_an_inbox_f1970.jpg, behind_edge_pixels_not_just_f208.jpg, behind_free_rising_f2145.jpg, behind_not_just_f208.jpg
- Front exceptions: front_1second_f639_f640.jpg, front_itself_f781.jpg
- Touching only, not provable: touch_only_all_f1545_f1553.jpg
- Layout: layout_and_no_around_face.jpg
- Caption overviews: captions_all_blocks_person_outline.jpg, captions_sample_tops.jpg
- Entry: entry_curves.jpg, entry_dms_motion_blur.jpg, entry_instagram_f52_f61.jpg
- Exit: exit_hard_cut_f134_f141.jpg, exit_hard_cut_f594_f605.jpg
- Shadow chart: shadow_profile.jpg
- Camera chart: camera_zoom.jpg
- Lamp: lamp_glow_is_practical_f67.jpg
- Title card: title_card_glow_f1122.jpg, title_card_line2_f1098_f1127.jpg, title_card_words_f1076_f1091.jpg
- Pop-ups: popup_app_icon_f1554_f1600.jpg, popup_dashboard_f1124_f1170.jpg, popup_dm_banner_f668.jpg, popup_dm_banner_morph_f655_f666.jpg, popup_dm_notifications_f654_f758.jpg, popup_inbox_rows_and_cards.jpg, popup_integrations_build_f1764_f1771.jpg, popup_integrations_f1772_f1795.jpg, popup_organize_button_f344.jpg, popup_organize_f330_f345.jpg, popup_organize_to_list_f344_f375.jpg, popup_priority_inbox_f376_f438.jpg, popup_qualified_leads_f1897.jpg, popup_reels_f1406_f1475.jpg, popup_voice_panel_f1030_f1076.jpg, popup_voice_panel_f1050.jpg
- Contact sheets (frame number and time on each tile): contact_s000.jpg, contact_s1200.jpg, contact_s1440.jpg, contact_s1680.jpg, contact_s1920.jpg, contact_s2156.jpg, contact_s240.jpg, contact_s480.jpg, contact_s720.jpg, contact_s960.jpg
