# jiia 3186897: text and layering breakdown

> Measured frame by frame for the Mimic page (docs/mimic-text.md). The evidence frames named below (extra/...) were kept out of this public repository: they're frames of someone else's video.

Source: `inspirationedit/jiia_1783186897_3933978033790977121_7181902700.mp4`, 1276x720, 24 fps, 248 frames (10.33 s).
Frames are 0-based decode order (f24 = 1.000 s). Pixel numbers are at 1276x720. Every frame was viewed (contact sheets `extra/contact_sheet_*.jpg`, per-event strips `extra/strip_*.jpg`).

There are 15 caption blocks (17 events if the one-word replacements in E12 are counted separately). That is more than the examples in the brief, which only covered E1, E4, E7, E9, E12, E13 and E15.

## 1. At a glance

| frames | time (s) | shot | text, where it sits |
|---|---|---|---|
| f0-2 | 0.00-0.12 | b/w light-streak flash | none |
| f3-26 | 0.12-1.12 | gym, runner on curved treadmill (camera drifts) | E1 "even / when / i was", left third, y 0.36-0.61; runner far right |
| f27-30 | 1.12-1.29 | side portrait on a grey wall | E2 "Feeling" (nearly invisible: difference over mid grey) |
| f31 | 1.29 | 1-frame full-frame invert flash | "Feeling" turns black with everything else |
| f32-43 | 1.33-1.83 | extreme close-up of an eye, blur-out f41-43 | E2 "Feeling / Low", right half |
| f44-80 | 1.83-3.37 | sports car outside a hotel (jump cuts, opening blur f44-47) | E3 "i kept on / going", E4 "i weren't / gon'" top right; E5 "Quit" centre |
| f81-83 | 3.38-3.50 | light-streak flash | "Quit" still on screen |
| f84 | 3.50 | flat grey frame (90,90,90) | none |
| f85-103 | 3.54-4.33 | steering wheel close-up (dims at f95) | E6 "i can't wait", centre right |
| f104-129 | 4.33-5.42 | driver profile against a bright windscreen | E7 "for the day i", E8 "Make / it", right of the face |
| f130-144 | 5.42-6.04 | man from behind, lamp in the foreground (pan) | E9 "next / in Line", left |
| f145-158 | 6.04-6.62 | restaurant, paper umbrellas, diner looking down | E10 "i feel like a", top band, BEHIND the diner |
| f159-165 | 6.62-6.92 | rooftop pool at night, swimmer raises fists | E11 "King", centre, BEHIND the fists |
| f166-176 / f177-186 | 6.92-7.79 | two gym close-ups | E12 "my time", "will", "come" (one at a time, centre) |
| f187-211 | 7.79-8.83 | desk in daylight, frame blurs out f207-211 | E13 "i just / gotta be / Patient", centre right |
| f212-225 | 8.83-9.42 | desk at night (opening blur f212-213, grade flickers blue/orange/purple) | E14 "keep / on / Pushing", centre right |
| f226-228 | 9.42-9.54 | light-streak flash | none |
| f229-247 | 9.54-10.33 | low angle, man with a phone | E15 "and / take / these / Risk", right of centre |

- **Text motion:** text is fixed in screen space for the whole life of every caption. Word boxes are constant frame to frame, nothing tracks the camera, and no per-caption zoom exists except the "King" entry.
- **Grade:** blacks are lifted to about 8 to 11 on every shot and whites reach 245 to 255. The grade sits OVER the text. The same "white" text measures (242,243,236) in the gym, (249,250,253) at the hotel and (244,241,234) in the restaurant and on the desk. The difference-blend results are compressed the same way, which looks like about 90% opacity.
- **Transitions over the text:** a 1-frame white silhouette of the next shot's subject on f43 and f56.

## 2. Text styles

Two typefaces, used as 8 styles (5 base sizes, a difference variant, and the script in two blend modes).

### 2.1 Font identification

**Base: Helvetica Neue Bold (likely original, Apple system font).** Glyph evidence (`extra/font_base_compare.jpg`, `extra/glyphs_*.jpg`):
- The double-story "a" has the Helvetica tail spur.
- The "i" dots are square.
- The apostrophe in weren't, can't and gon' is a tapered wedge.
- "c", "e" and "s" terminals are horizontal, and the "t" is flat-topped.
- The middle apex of "w" reaches full x-height, and the "g" descender is short and flat.

FreeSans Bold (a Helvetica clone) shows all of these. Inter lacks the spur and has a rectangular apostrophe and round dots. Arial-metric fonts have angled t/e cuts.

Pixel IoU (soft mask, size, tracking and offset fitted on 11 words: kept, weren't, going, was, even, when, gon', can't, keep, on, and):

| font | mean IoU | tracking (em) | note |
|---|---|---|---|
| Inter Tight 700 | 0.878 | -0.08 | same glyphs as Inter |
| Geist 700 | 0.878 | -0.10 to -0.13 | wrong apostrophe and t |
| Inter 700 (bundled `inter`) | 0.875 | -0.11 (range -0.087 to -0.133) | recommended for the engine |
| TikTok Sans 700 | 0.864 | -0.12 | |
| FreeSans Bold (Helvetica clone, GPL+FE) | 0.852 | -0.07 to -0.10 | closest SHAPES |
| Liberation Sans Bold / Arimo 700 | 0.839 / 0.813 | -0.08 to -0.11 | Arial details |

At a 33 px x-height the neo-grotesques are within 0.03 IoU of each other. Shape cues decide the original (Helvetica Neue); pixel fit decides the engine font (Inter 700).

**Script accent: a formal copperplate (English roundhand).** High stroke contrast with heavy shades and hairlines, connected lowercase slanted about 25 degrees, looped capitals: a wave-topped F, an L with a bottom loop, a "2"-like Q, a looped K, oval-bowl P and R. All ten script words (Feeling, Low, Quit, Make, it, Line, King, Patient, Pushing, Risk) are the same face (`extra/script_words_montage.jpg`).

"Patient" is NOT a serif italic. It is the same connected script, and its translucent look is the difference blend (section 2.3).

Free candidates fitted with uniform scale, shear ±0.15 and ±1 px weight on King, Feeling and Patient (`extra/font_script_compare.jpg`):

| font | King | Feeling | Patient | mean | note |
|---|---|---|---|---|---|
| Pinyon Script (OFL, Google Fonts, `@fontsource/pinyon-script`) | 0.358 | 0.283 | 0.359 | 0.333 | best: same construction, K/x ratio 2.11 vs 2.24 measured; shades lighter than the video |
| Vujahday Script | 0.278 | 0.352 | 0.340 | 0.324 | brush look, wrong capitals |
| Arizonia | 0.229 | 0.351 | 0.385 | 0.322 | too heavy, upright capitals |
| Mr Dafoe | 0.277 | 0.305 | 0.363 | 0.315 | |
| Allura (bundled `allura`) | 0.198 | 0.324 | 0.383 | 0.302 | best bundled |
| Italianno | 0.185 | 0.242 | 0.330 | 0.252 | too narrow |
| Great Vibes (bundled `great-vibes`) | 0.172 | 0.237 | 0.239 | 0.216 | capitals too tall and round |

No free face is close (IoU at or below 0.36 for all of about 80 scripts tried). The original is a commercial copperplate of the Bickham Script / Snell Roundhand / Edwardian Script class. Snell Roundhand ships with macOS, like Helvetica Neue, but it could not be tested here. Engine choice: new font id `pinyon-script`, with fallback `allura`.

### 2.2 Style table

Sizes are measured on the frame; "engine size" = font px / 720 for the engine font (Inter for base, Pinyon Script for script). Inter ratios: x-height 0.546, cap 0.7275. Pinyon Script ratios: x-height 0.335 em, K 0.707, P 0.687, F 0.769.

| id | role | words | x-height px (% of H) | ascender or capital px (%) | engine size | tracking | fill | shadow | blend |
|---|---|---|---|---|---|---|---|---|---|
| base-s | base, small | i kept on, i weren't gon', i just, gotta be, and | 33 to 36 (4.6 to 5.0%) | k/t ascender 45 (6.3%) | 0.088 (63.5 px) | -0.11 em | off-white #F4F2EC (grade-tinted) | black 45%, offset (5,10) px, sigma 4.5 px | normal |
| base-m | base, medium | even, when, keep, on | 42 to 44 (6.0%) | h ascender 59 (8.2%) | 0.108 (77.5 px) | -0.11 | same | same | normal |
| base-l | emphasis, large | going, these (take 0.126) | 60 to 61 (8.5%) | th 80 (11.1%) | 0.155 (112 px) | -0.11 | same | same | normal |
| base-xl | emphasis, extra large | i was; next / in at 0.17 | 72 to 73 (10.1%) | i dot to baseline 94 (13.1%) | 0.184 (132 px) | -0.11 | same | same | normal |
| base-xxl | one huge line | i feel like a | 100 (13.9%) | f 133 (18.5%) | 0.254 (183 px) | -0.11 to -0.12 | same | (5,9) px, sigma 5, 49% | normal |
| base-diff | base in DIFFERENCE | i can't wait, for the day i, my time / will / come, next | 28 to 69 (3.9 to 9.6%) | | 0.072 to 0.17 (0.09 typical) | -0.11 | white #FFFFFF | none measurable | difference |
| script | accent, DIFFERENCE | Feeling, Low, Quit, Patient, Pushing, Risk | 37 to 125 (5.1 to 17.4%) | capital 75 to 257 (10.4 to 35.7%) | 0.153 to 0.51 (0.23 typical) | 0 | white #FFFFFF | none | difference |
| script-normal | accent, normal | Make, it, Line, King | 54 to 115 (7.5 to 16.0%) | capital 119 to 258 (16.5 to 35.8%) | 0.23 to 0.48 | 0 | off-white #F4F2EC | (2,9) px, sigma 4, 35% (Make) | normal |

Per script word (x-height / capital px, then Pinyon Script engine size):

| word | x / cap px | engine size |
|---|---|---|
| Feeling | 58 / 108 | 0.23 (whole-word fit 0.221) |
| Low | 45 / 87 | 0.18 |
| Quit | 125 / 257 | 0.51 |
| Make, it | 54 / 133 | 0.24 |
| Line | 54 / 119 | 0.23 |
| King | 115 / 258 | 0.48 (whole-word fit 347 px) |
| Patient | 39 / 107 | 0.24 (whole-word fit) |
| Pushing | 37 / 75 | 0.153 |
| Risk | 45 / 112 | 0.20 |

Common to all styles:
- **Weight, width and case:** base is Bold (700), normal width, all lowercase (the voice-over's capital I is set as "i"). Script is a single weight, title case (capital first letter, the rest lowercase).
- **Tracking:** letters touch or overlap, -0.11 em in Inter (-0.07 to -0.10 em in a Helvetica clone). The script uses its natural connections (0).
- **Line spacing:** baseline to baseline is 0.62 to 0.74 em of the line size for equal sizes (even to when 49 px at 79 px, weren't to gon' 43 px at 63 px, i just to gotta be 46 px, keep to on 47 px). That is 0.85 to 1.0 x cap height, so lines touch or interlock: ascenders of the lower line poke between letters of the upper line ("these" under "take", "when" under "even").
- **Stroke, glow and gradient:** none anywhere. Fills are solid. Apparent colour shifts inside a word are the difference blend.
- **Shadow:** a soft black drop shadow on base text. The fit of the darkening around glyphs on light backgrounds gives:

  | word | offset (px) | sigma (px) | opacity | fit |
  |---|---|---|---|---|
  | feel | (5,9) | 5 | 0.49 | r2 0.67 |
  | a | (4,10) | 4 | 0.43 | |
  | gotta be | (4,9) | 4 | 0.45 | |
  | take | (5,12) | 8 | 0.50 | |
  | these | (7,12) | 6 | 0.44 | |
  | weren't | (6,11) | 4 | 0.28 | dark background |
  | going | (6,12) | 5 | 0.29 | dark background |

  The offset is constant in pixels (not in ems), so in ems it differs per size (styles.json). It is invisible on dark backgrounds.
- **Opacity:** 1.0 everywhere once settled. The grade compresses difference results to look like about 0.9.

### 2.3 Blend modes (evidence)

Method: background from a frame just before the word appears, ECC-aligned (affine) with the text masked out, or a 41 px median background where no clean frame exists. Glyph core pixels are split into the darkest and lightest 10 to 15% of background. Observed values are compared with white-fill predictions for normal, screen, multiply, overlay, soft-light and difference. Errors are mean absolute error over RGB (0 to 255).

| word (frame) | background RGB | observed RGB | normal / screen | multiply | overlay | soft-light | difference | verdict |
|---|---|---|---|---|---|---|---|---|
| Quit (f80) | light (234,221,196) | (25,27,47) | 222 | 184 | 222 | 202 | **7.7** | difference |
| Quit (f80) | dark (9,14,19) | (237,232,232) | 21 | 220 | 206 | 187 | **7.3** | difference |
| Patient (f203) | light (214,225,210) | (64,58,48) | 198 | 160 | 198 | 178 | **18** | difference |
| Patient (f203) | dark (10,11,16) | (237,238,232) | 19 | 223 | 211 | 193 | **7.0** | difference |
| the (f109) | light (235,222,201) | (28,29,42) | 222 | 186 | 222 | 203 | **8.0** | difference |
| for (f106) | light (235,228,205) | (21,16,30) | 233 | | | | **10.7** | difference |
| next (f138) | dark (12,30,57) | (244,220,206) | 32 | | | | **4.7** | difference |
| next (f138) | light (238,215,201) | (10,16,31) | 236 | | | | **18** | difference |
| will (f174) | orange skin (227,184,132) | teal (28,90,116) | 177 | | | | **8.8** | difference |
| my time (f169) | bright skin (242,240,229) | (18,14,10) | 241 | | | | **7.3** | difference |
| wait (f101) | yellow trim (108,79,8) | lavender (173,187,219) | 62 | 128 | 92 | 81 | **22** | difference |
| Low (f39) | skin (64,35,28) | (200,202,198) | 55 | 158 | 115 | 100 | **19** | difference |
| Feeling (f36) | skin (76,55,56) | (194,209,215) | 49 | | | | **13** | difference |
| Pushing (f224) | (46,80,91) | (201,191,179) | 65 | 118 | 48 | 56 | **13** | difference |
| Risk (f246) | light (211,209,178) | (88,84,79) | 171 | 116 | 171 | 142 | **28** | difference (still fading in) |
| feel (f150) | (158,172,181) | (246,241,234) | **14.7** | 70 | 14.7 | 32 | 156 | normal |
| a (f157) | (223,192,135) | (246,236,229) | **18** | 54 | 18 | 22 | 165 | normal |
| these (f241) | (196,192,163) | (246,242,231) | **15** | 56 | 15 | 23 | 168 | normal |
| King (f165) | (142,142,137) | (245,240,229) | **17** | | | | 123 | normal |
| Line (f143) | (74,108,130) | (246,248,254) | **5.7** | | | | 98 | normal |
| Make (f121) | dark (9,38,51) | (243,250,253) | **6.3** | | | | 28 | normal (stays white over the bright windscreen) |

Over light backgrounds, overlay and screen with a white source both collapse to white, which is what "normal" predicts. They are ruled out where normal is ruled out.

Visual proof (`extra/blend_patient_zoom_f203.jpg`): the single word "Patient" turns green over the purple area, blue over yellow wood, near black over the white monitor and near white over the dark wall. That is the inverted backdrop, i.e. white DIFFERENCE (exclusion is identical for a white source).

The 1-frame invert at f31 is a transition on the whole frame, not a text effect.

Per word:
- **Difference:** Feeling, Low, Quit, Patient, Pushing, Risk (script); i can't wait, for the day i, my time, will, come, next (base).
- **Normal:** all other base words, and the scripts Make, it, Line, King.

## 3. Caption events

bbox and head are frame fractions [x0,y0,x1,y1]. "+n f" is caption onset minus the ASR word start (Parakeet TDT, 80 ms granularity, so ±2 frames).

| # | frames (s) | lines (style) | bbox | subject or head | layer | enter (measured) | exit | lands on |
|---|---|---|---|---|---|---|---|---|
| E1 | f10-26 (0.42-1.12) | even (base-m) / when (base-m, indent +92 px) / i was (base-xl) | 0.211,0.356,0.438,0.614 | runner 0.66,0.22,0.72,0.32 | front | per-word fade 3 f: 0.44, 0.85, 1.0 (even f10, when f18, i f20, was f22); no scale, slide or blur | cut f27 | even +4 f, when +5 f, i +3 f, was +1 f |
| E2 | f28-43 (1.17-1.83) | Feeling / Low (script, difference) | 0.463,0.363,0.893,0.701 | portrait then eye close-up | front | Feeling slow fade f28-31 (0.18, 0.35, 0.50, 0.58); Low fade 3 f (0.32, 0.64, 1.0) at f37 | whole frame blurs f41-43 (text included), cut f44 | feeling +3 f, low +2 f |
| E3 | f44-64 (1.83-2.71) | i kept on (base-s) / going (base-l, +115 px) | 0.593,0.142,0.882,0.336 | two men at bottom left, about 0.20,0.45,0.30,0.62 | front | cut-in at full opacity (alpha first frame = settled); i under the shot's opening blur f44-47; kept f49, on f53, going f58 | replaced at f65 | not in ASR (music) |
| E4 | f65-78 (2.71-3.29) | i weren't / gon' (base-s, +141 px) | 0.610,0.142,0.796,0.285 | same | front | cut-in: i f65, weren't f69, gon' f73 | gone f79 (1 empty frame) | I +2 f, weren't on "walk" +2 f, gon' on "on" 0 f |
| E5 | f80-83 (3.33-3.50) | Quit (script, difference, 0.51) | 0.259,0.297,0.785,0.739 | man in white 0.38,0.28,0.42,0.35 | front (crosses his torso, dark there) | cut-in, full at f80 | stays through the flash f81-83, grey frame f84 | not in ASR |
| E6 | f90-103 (3.75-4.33) | i can't wait (base-diff, 0.088) | 0.620,0.460,0.840,0.539 | hands only | front | cut-in: i f90, can't f94, wait f99 | cut f104 | i +4 f on "I'm", can't +2 f on "gonna" |
| E7 | f104-116 (4.33-4.88) | for the day i (base-diff, about 0.09 to 0.10) | 0.573,0.418,0.823,0.556 | driver 0.24,0.00,0.49,0.55 | front | for cut-in with the shot; the fade 3 f (0.65, 0.76, 1.0) f107; day f111; i fade (0.41, 0.88, 1.0) f114 | gone f117 (1 empty frame) | i +1 f; for/the/day not in ASR |
| E8 | f118-129 (4.92-5.42) | Make / it (script-normal, 0.24) | 0.420,0.328,0.904,0.672 | driver, chin at x 0.48 | front (swash touches the chin, never cut) | Make fade 5 f (0.25, 0.50, 0.77, 0.86, 1.0); it fade 4 f (0.25, 0.54, 0.87, 1.0) f122 | cut f130 | make +1 f, it -1 f |
| E9 | f131-144 (5.46-6.04) | next (base-diff, 0.17) / in (base, 0.165) + Line (script-normal, 0.23) | 0.158,0.321,0.505,0.660 | back of head 0.63,0.03,0.72,0.22 | front | next slow fade (0.16, 0.32, 0.50, 0.61 f131-134); in fade 2 f (0.34, 1.0) f136; Line fade (0.22, 0.38, 0.54, 0.64, 0.72) f140-144 | cut f145 | next +2 f, in +2 f, line +2 f |
| E10 | f145-158 (6.04-6.62) | i feel like a (base-xxl, 0.254) | 0.220,0.249,0.795,0.450 | diner's head 0.46,0.37,0.55,0.56 | **BEHIND** | cut-in: i f145, feel f148, like f152, a f155 | cut f159 | i -3 f, feel -2 f, like -2 f, a -2 f |
| E11 | f159-165 (6.62-6.92) | King (script-normal, 0.48) | 0.239,0.142,0.848,0.653 | swimmer 0.47,0.55,0.52,0.65, fists rise to y 0.47 | **BEHIND** | zoom + blur-in, 7 f: scale 0.79, 0.84, 0.89, 0.92, 0.95, 0.98, 1.00; blur sigma 10, 8, 5, 4, 2, 1, 0 px; opacity 1 | cut f166 | king 0 f |
| E12a | f166-172 (6.92-7.21) | my time (base-diff, 0.072) | 0.420,0.447,0.583,0.517 | head fills the right half 0.50,0.00,0.86,0.55 | front (drawn over the head) | cut-in with the shot, both words together | replaced f173 | my -1 f (time shown 4 f early) |
| E12b | f173-175 (7.21-7.33) | will (base-diff) | 0.462,0.447,0.541,0.517 | same | front | cut-in | replaced f176 | "won't" -2 f |
| E12c | f176-186 (7.33-7.79) | come (base-diff) | 0.443,0.451,0.553,0.517 | face 0.45,0.20,0.80,0.75 | front | cut-in, stays across the cut at f177 | cut f187 | not in ASR |
| E13 | f187-211 (7.79-8.83) | i just (base-s) / gotta be (base-s, +54 px) / Patient (script, difference, 0.24) | 0.422,0.361,0.795,0.608 | man at desk 0.26,0.28,0.36,0.46 | front | i just cut-in with the shot; gotta be cut-in f191; Patient fade 3 f (0.36, 0.73, 1.0) f200 | whole frame blurs f207-211, cut f212 | I +5 f, just +1 f, gotta +1 f, patient 0 f |
| E14 | f212-225 (8.83-9.42) | keep (base-m) / on (base-m, +117 px) / Pushing (script, difference, 0.153) | 0.488,0.374,0.818,0.635 | man 0.31,0.28,0.41,0.47 | front | keep under the shot's opening blur f212-213; on fade about 3 f f216 (0.64, 0.79, 0.90, 1.0, grade flicker); Pushing near cut-in (0.87, 0.95, 1.0) f223 | cut into flash f226 | keep +1 f, on +1 f, pushing +4 f |
| E15 | f229-247 (9.54-10.33) | and (base-s) / take (0.126) / these (base-l) / Risk (script, difference, 0.20), right-aligned at x 0.73 | 0.534,0.286,0.866,0.700 | head 0.34,0.06,0.50,0.33; hand rises into Risk | front | and fade 3 f (0.55, 0.85, 1.0) f229; take cut-in f235; these fade 3 f (0.48, 0.84, 1.0) f239; Risk slow fade (0.22, 0.45, 0.64, 0.71 f244-247) | video ends | and +2 f, take +5 f, these +3 f, risk +4 f |

Timing pattern:
- Captions build word by word on the voice (one word per onset; "my time", "i just" and "gotta be" are two-word chunks).
- Median onset is +2 frames after the ASR word start, range -3 to +5 frames.
- Each caption is cleared by a hard cut or by the next shot; nothing fades out on its own.

Positions are composed per shot: blocks sit in the empty area beside or above the subject (x 0.42 to 0.88 on most shots, x 0.16 to 0.50 when the subject is right), vertically centred (y 0.29 to 0.70), with the top band reserved for E3, E4 and E10.

## 4. Text behind the person

Two true instances, proven with a person matte (MediaPipe selfie segmenter run on a crop around the subject) and by checking which pixels disappear:

1. **E10 "i feel like a" (f145-158), behind the diner.** His head and hair cover the lower part of the second "l" of feel and the "l" and "i" of like (about 25 to 35% of those letters' height, x 600 to 700, y 270 to 324).
   - In every frame f150-158 there are **0** bright text pixels inside the eroded person mask, while text fills 30 to 35% of the same band.
   - The text stops exactly on the hair silhouette. The edge is soft (about 2 px) and follows hair clumps, not a hard geometric cut.
   - The diner is static, so frame-by-frame tracking cannot be proven here.
   - Evidence: `extra/behind_e10_person_contour_f148_158.jpg`, `extra/behind_e10_and_shadow_f156.jpg`.
2. **E11 "King" (f159-165), behind the swimmer's raised fists.** On f163-165 the fists cover the bottom shades of "i" and "n". The strokes vanish where each fist is in each frame, and the fists move between frames, so the matte tracks per frame. Edges are soft from motion blur.
   - The rest of King sits above his head, so only those strokes are hidden.
   - Evidence: `extra/behind_king_fists_f162_165.jpg`.

Things that LOOK behind but are not:
- **E9 "next":** the navy "n" over the lamp is difference over a bright area. The glyph is fully drawn, just dark.
- **E12 "my time":** drawn on top of the head. It goes near black over the blown-out skin because of difference. `extra/front_difference_mytime_will_come.jpg`.
- **E5 "Quit":** crosses the man in front of him (dark over his white shirt).
- **E8 "Make":** the swash ends at the chin and is never cut.
- **E15 "Risk":** drawn over the rising hand.

## 5. Word effects

- **Fade-in per word:** 3 frames, roughly linear (0.40, 0.80, 1.0), no scale, slide or blur. Used in E1, E2 Low, E7, E13 Patient and E15.
- **Slow fade:** 5 to 6 frames, about 0.17 opacity per frame. Used for some accents (Feeling, Make, next, Line, Risk). Risk never completes before the video ends.
- **Cut-in:** the word appears at full opacity on its onset frame. Used in E3, E4, E6, E10, Quit, gotta be, take, Pushing.
- **Zoom and blur-in:** "King" only. Scale 0.79 to 1.0 with Gaussian blur 10 px to 0 over 7 frames, ease-out, no fade, scaled about a point near the swimmer's head. The background grows only 1.05x in the same span.
- **Difference blend (the invert look):** 12 of 44 words. This is the "translucent" or "gradient" look on Patient, Quit, Make-like scripts and the coloured base words. No real gradient fills exist.
- **Drop shadow:** soft black on normal base text (section 2.2).
- **Transitions that apply to the text as well as the picture:**
  - whole-frame blur-out (f41-43, f207-211);
  - opening blur (f44-47, f212-213);
  - 1-frame invert (f31);
  - light-streak flashes (f0-2, f81-83, f226-228);
  - flat grey frame (f84);
  - 1-frame white silhouette of the next subject (f43, f56).
- **Absent:** no outline, glow, highlight box, typewriter, wipe or mask reveal, letter-by-letter stagger, slide, bounce, overshoot or rotation.

## 6. Recipe

1. **Base font:** Helvetica Neue Bold (engine: Inter 700). Lowercase, tracking -0.11 em, fill #F4F2EC (pure white is fine if the grade is applied over the text), opacity 1, blend normal.
2. **Drop shadow on base:** black 45%, offset (5,10) px at 720p, Gaussian sigma 4.5 px (canvas shadowBlur 9 px). In ems that is x 0.079 / y 0.157 / blur 0.142 at size 0.088, and x 0.027 / y 0.049 / blur 0.055 at size 0.254.
3. **Base sizes** (font px / frame height): 0.088 small, 0.108 medium, 0.155 large, 0.184 extra large, 0.254 for a single huge line. Within a stack the last line is the biggest (going, i was, these).
4. **Script accent:** copperplate (engine: Pinyon Script, new id `pinyon-script`; fallback `allura` with sizes x1.13). Title case, tracking 0, white #FFFFFF.
   - Blend: difference for most accents; normal off-white with the same shadow for Make, it, Line, King.
   - Size: 0.23 typical (x-height 56 px). It goes up to 0.48 to 0.51 when the accent is the whole caption (King, Quit) and down to 0.15 to 0.20 under a base stack (Pushing, Risk, Low).
5. **Difference base variant:** the whole caption in white difference, no shadow (i can't wait, for the day i, my time / will / come, next).
6. **Layout:** stack of 1 to 4 lines.
   - Baseline to baseline is 0.62 to 0.74 em of the line above (lines touch or interlock).
   - Line 2 is indented right by +0.9 to +2.2 em of the small size (+54 to +141 px).
   - Alternatives: left-aligned (E9) or right-aligned (E15) stacks.
   - The script word overlaps under the last base line, starting left of it (Patient, Pushing, Line).
   - Block placed in the open area beside the subject, roughly x 0.42 to 0.88, y 0.29 to 0.70.
7. **Timing:** each word appears on its spoken onset +0 to +4 frames. Entry is a 3-frame linear fade or a cut-in; script accents fade over 3 to 6 frames. "King" uses zoom 0.79 plus blur 10 px over 7 frames. Captions end on the shot cut (no exit animation). Any shot transition (blur, flash, invert) is applied over the text.
8. **Behind the person:** about 1 caption in 8 (E10 base line, E11 script). Composite text between background and a per-frame person matte with soft (about 2 px) hair edges.

## 7. Gaps (what a typical caption tool lacks)

- **Difference blend per style:** and per caption, as with the whole E6, E7 and E12 captions.
- **Person matte compositing:** per frame, with soft hair edges, for text behind the subject (E10, E11).
- **Free-form stacks:** different sizes per line, interlocking leading below 1.0 x cap height, and per-line horizontal stagger.
- **A heavy copperplate script:** no free face matches well.
- **Combined entry motions:** scale, blur and fade together (King), and slow per-word fades of different lengths for accents vs base.
- **Transitions over text:** whole-frame blur in/out, invert flash, light-streak overlays and subject-silhouette flashes rendered over the captions.
- **A grade applied after text:** lifted blacks and tinted whites.

## 8. Fit to our engine

Maps cleanly:
- base style: `inter` 700, `case: "lower"`, `tracking: -0.11`, solid fill, `shadow`, `opacity: 1`, `blend: "normal"`;
- difference styles: `blend: "difference"` with `fill #FFFFFF`;
- `layout: "stack"` with per-style sizes;
- `enter: {kind: "fade", dur: 0.125, unit: "word", ease: "linear"}`;
- `exit: null` (cut);
- `behind` places for E10/E11;
- `picks` with rule `last` for the script accent (accent present in 8 of 17 captions, always the last word).

Approximated (with numbers):
- Helvetica Neue Bold to Inter 700: IoU 0.875 vs 0.852 for a Helvetica clone. You lose the tailed "a", square dots and wedge apostrophe.
- The copperplate becomes `pinyon-script` (IoU 0.33, new font: Google Fonts, OFL, `@fontsource/pinyon-script`) or bundled `allura` (0.30).
- Real sizes form a continuum (base 0.072 to 0.254, script 0.153 to 0.51). design.json keeps 5 base sizes plus one script size of 0.23, so King and Quit render at about 45% of their real size unless a per-caption size override exists.
- Shadow offsets are constant in px in the video, but per style in ems in the engine (values per style in styles.json).
- Cut-in words (about half) get the 3-frame fade instead. Cut-in is `dur: 0`, but the engine has one base enter.
- `leading` 0.9 approximates baseline spacing of 0.62 to 0.74 em.

Not expressible yet:
- **Per-line horizontal stagger** inside a stack: +54 to +141 px (+0.9 to +2.2 em) indent of line 2; places only offer left, center or right alignment.
- **Per-caption blend switch** for the same base style: E6, E7 and E12 whole captions in difference while other captions are normal. Needs a caption-level style variant; the `marked` rule is a stand-in.
- **Mixed blend inside one caption:** E9 "next" difference, "in" normal, "Line" normal script. The engine can only do this through picks.
- **Combined zoom and blur entry:** scale 0.79 to 1.0 with blur 10 px to 0 over 0.29 s, about an anchor point.
- **Accent fades of 5 to 6 frames vs base fades of 3 frames per word:** `accentEnter` 0.21 s covers it only roughly. Risk's fade is longer than the clip.
- **Per-caption size overrides:** King and Quit at 0.48 to 0.51.
- **Transitions applied over text:** blur, invert, flash, silhouette flash.
- **A grade over the text:** lifted blacks and per-shot white tint.
- **Script words overlapping a base line by design:** Patient under "gotta be", Line beside "in".
