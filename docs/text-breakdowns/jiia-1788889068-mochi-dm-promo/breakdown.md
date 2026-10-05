# jiia 1788889068: typography and layering breakdown

> Measured frame by frame for the Mimic page (docs/mimic-text.md). The evidence frames named below (extra/...) were kept out of this public repository: they're frames of someone else's video.

Video: 1276x718, 23.976 fps, 1768 frames (73.7 s). Talking-head promo for "Mochi" (Instagram DM tool).
Frame numbers are 0-based decode order (f = t x 23.976). Pixel values are on the 1276x718 frame.
Font sizes in engine units use the matched font (Zalando Sans SemiExpanded: x-height 0.514 em, cap 0.714 em), so size = x-height px / 0.514 / 718.
Method: every frame cached as JPEG, person matte from Robust Video Matting (RVM mobilenetv3, per frame), word motion fitted per frame (opacity, dx, dy, scale, blur) against the background of the frame before the word appears, glyphs matched against rendered candidate fonts (IoU). Evidence images are in `extra/`.

## 1. At a glance

| Range | Frames | Segment | What matters for text |
|---|---|---|---|
| 0.00 to 0.79 s | f0 to f19 | Talking head A, wide | Opening move: the composite zooms out (head 254 -> 178 px tall f0 to f16, partly him leaning back; measured on the text itself: 10 to 12 % smaller from f11 to f19 while it drifts +38 px right). Caption "let me tell you a" rides the same zoom. |
| 0.83 to 1.84 s | f20 to f44 | Talking head A | Giant gradient "secret" BEHIND the speaker, sparkles. |
| 1.96 to 7.17 s | f47 to f172 | Talking head A | White stacked captions beside the head; slow push-in on the composite (+8.8 % over f52 to f72); a 1.15x punch-in cut at f120 (text punches in with the footage). |
| 7.26 to 8.38 s | f174 to f201 | Talking head A | Magenta cursor enters; footage re-graded violet with a halftone texture (f186 to f200). |
| 8.38 to 8.72 s | f201 to f209 | Transition | Footage shrinks (1.0 -> 0.27) into the image of an Instagram post. |
| 8.5 to 67.2 s | f204 to f1610 | Motion graphics | iOS-style UI on pastel mesh gradients, a dark void scene (f920 to f1104) and a yellow scene (f1353 to f1480). 9 text statements/labels (section 3b). |
| 67.07 to 67.32 s | f1608 to f1614 | Transition | Phone icon content becomes the footage, iris opens. |
| 67.2 to 73.7 s | f1611 to f1767 | Talking head B (closer, hands clasped) | One-line captions, lower centre then left; last line magenta -> white; footage defocuses and fades to black under the final caption (f1716 to f1756). |

Talking-head grade: dark warm room, red and blue practical lights, near-black curtains (background behind captions #0f0b0c to #24101b). Captions are composited into the footage layer: every camera move (zoom-out intro, push-ins, the f120 punch-in, the TH-B final drift) moves and scales the text by the same amount.

## 2. Text styles

All caption words use ONE wide grotesk family; only size, fill and effects change. Motion-graphic text uses the iOS system face.

### Font identification (base family)

Candidates rendered at the measured x-height and fitted for tracking, compared on 43 glyphs from f74, f116 and the clean white-on-black end frame f1764 (extra/font_base_*.jpg):

| Candidate | Glyph IoU, 43 glyphs (f74, f116, f1764) | Glyph IoU, 31 glyphs (f74, f116; first pass over 130 font files) | Word IoU, clean line f1764 | Shape verdict |
|---|---|---|---|---|
| Zalando Sans SemiExpanded Bold (wdth 112.5, wght 700) | 0.825 | 0.814 | 0.830 (best) | Best. Double-story a with straight stem, single-story g with flat open tail, y with flat horizontal foot, t flat top, M vertex on the baseline. |
| TikTok Sans wdth 125 wght 700 (bundled) | 0.824 | not run | 0.790 | Close; a has a spur at the bottom right, y tail has no foot, slightly wider. Best bundled stand-in. |
| Mona Sans Expanded wdth 125 wght 700 | 0.836 | 0.819 | 0.815 | Rejected: single-story a (a IoU 0.59 to 0.66). |
| Hubot Sans wdth 112.5 wght 700 | not run | 0.698 (Expanded 800) | 0.802 | Rejected: single-story a. |
| Archivo wdth 118 wght 750 (bundled) | 0.821 | 0.801 (SemiExpanded 800) | 0.797 | Rejected: binocular g (g IoU 0.43). |
| Montserrat 800 (bundled) | 0.791 | 0.788 | 0.790 | Not wide enough, round a. |
| Unbounded 500 / 600 (bundled) | not run | 0.741 (600) | 0.794 (500) | Rejected: single-story a, rounder. |
| Days One, Lexend Exa 700, Funnel Display 800 | | 0.779, 0.763, 0.763 | 0.778, 0.787, 0.776 | Wrong a, g or y. |
| Google Sans Flex wdth 120 wght 800, Krona One, Syne 800 | 0.743 (GSF) | 0.661, 0.678, 0.391 | 0.793, n/a, 0.552 | Wrong proportions. |

Measured proportions (f1764): ascender/x-height 1.31 to 1.35, t/x-height 1.24, descender/x-height 0.37, o width/x-height 1.17, stem/x-height 0.29; cap/x-height 1.31 (Zalando 1.39, so the original has an even bigger x-height). The r has a long flat flag that no free candidate matches (r IoU 0.55 for all). Likely original: PP Monument Extended Regular (Pangram Pangram, paid): wide, huge x-height, double-story a, flat-foot y, long-flag r. Free font to add: Zalando Sans (Google Fonts, OFL; variable wdth 75 to 125 and wght 200 to 900; SemiExpanded = wdth 112.5). Proposed id `zalando-sans`, metrics xh 0.514, cap 0.714, asc 0.964, desc 0.25.

"secret", "wrong" and "order" are the same family at 700 (letter widths/x-height identical to the base: e 1.10, s 1.03, t 0.78 to 0.82); a 800 or 900 weight did not fit better (IoU 0.70 to 0.72 for 700 to 900, limited by the glow and rim).

UI text (pop-ups, statements, labels): SF Pro Display/Text (iOS system font; slanted t terminal, SF a). Stand-in: Inter (bundled).

### Style table

| id | Role | Font, weight, width, case | x-height (px, % H) | Cap (px, % H) | Engine size | Tracking | Line spacing | Fill | Stroke / shadow / glow | Blend, opacity |
|---|---|---|---|---|---|---|---|---|---|---|
| base | white caption word | Zalando SemiExp 700, semi-expanded, lower | 34 px, 4.7 % (TH-A stacks); 44 px, 6.1 % (first line); 19 to 30 px, 2.6 to 4.2 % (TH-B) | 1.31 x x-height: about 44.5 px, 6.2 % at x-height 34 (from I and D in the same stacks) | 0.092 (TH-A stacks), 0.119 (first line), 0.051 to 0.081 (TH-B) | -6 % em (fits -2.6 to -7.6 %) | baseline gaps 38 to 41.5 px at x-height 34 (0.60 em): lines touch | solid #fdf9fb | none (edge falls to background within 2 px) | normal, 1.0 |
| base-big | size-up word "Instagram" | same, as said | 41 px, 5.7 % | I = 54 px, 7.5 % | 0.111 | -6 % | 52.5 px under "your" | #fdf9fb | none | normal |
| base-small | "DMs", "in the" | same | DMs 30 px, 4.2 %; in the 21 px, 2.9 % | D = 39 px, 5.4 % | 0.081; 0.057 | -6 % | "in the" baseline 7 px above the x-height top of "wrong" | #fdf9fb | none | normal |
| hook | giant word "secret" | same, lower | 157 px, 21.9 % | n/a | 0.425 | -2.2 % | single word, 1000 px wide (78 % W) | linear 0 deg: #fe0532 0, #fe1b9c 0.35, #b738fe 0.68, #48a7fe 1 (animated, see 5) | outer glow in the letter colour, about 8 px (blue 95 -> 26 over 8 px outside the t), opacity about 0.35 at the edge | normal, 1.0, BEHIND the person |
| emph-red | "wrong" | same, lower | 60 px, 8.4 % | n/a | 0.163 | -1 % | baseline shared with "order" | linear 0 deg: #f61f58 -> #fd1f8a -> #ff11c7 (rest) | 2 px light rim #f8707e on the edge, 8 px red glow (#ff1e50) | normal |
| emph-blue | "order" | same, lower | 61 px, 8.5 % | n/a | 0.165 | -1 % | same baseline | linear 0 deg: #b436fe -> #8863ff (0.6) -> #37b6ff | thin light rim, 8 px violet glow (#7a5cff) | normal |
| accent-magenta | newest TH-B words "convert the ones" | same, lower | 30 px, 4.2 % | n/a | 0.081 | -6 % | one line | solid #e502f0, then wiped to white | none | normal (verified, see below) |
| accent-violet | "you already have" | same, lower | 26 px, 3.6 % | n/a | 0.070 | -6 % | same line | magenta -> purple (#e502f0 -> #a600c8), wiped to white | none | normal |
| ui-statement | "that's nice!", "is it nice?", "waiting..", "Priority Inbox" | SF Pro Display Semibold (Inter 600), as said | 25 px, 3.5 % | asc 34 px | 0.064 | -1 % | one line | #353138 on light; #c6bcbf on dark; waiting red #ff2020 then white | none | normal |
| ui-typed | "could still be sitting there", "more conversations move forward" | SF Pro Text Medium (Inter 500), lower | 24 px, 3.4 % | | 0.062 | 0 | one line | settled #463c4a; active word purple #b968cc | none | normal |
| ui-label | "Qualified Lead", "Booked calls" | SF Pro Regular (Inter 400), title | 26 to 30 px | | 0.068 | 0 | label 8 px above its card | #ba54c6 (pastel), #775d7b (dark), white 70 % (Booked calls) | none | normal |

Blend-mode evidence (extra/blend_normal_convert_f1709.jpg): the magenta core of "convert" at f1709 is #e402f0 over the dark curtain (#24081c), #e602f1 over dark red (#4d0917) and #e903f1 over the bright red plant (#9d0d1a). Screen would lift R to 244 and B to 241 on the red, multiply would give #83..., overlay #40...: the colour does not move, so it is normal blend at 100 %. The gradient words are the same: "order" o is #b136fc over the blue lamp (#02087c) and #b337fe over dark (#1c164b). The white base is #fdf9fb over every background. No blend modes are used on caption text in this video.

Alignment and layout: TH-A stacks are left-aligned blocks with per-line indents (zig-zag), set right of the head; the first caption is one centred line above the head; "wrong order" splits around the head on one baseline. TH-B captions are single lines (centred low, then left-aligned at x 0.19 to 0.20), the last one ends centred.

## 3. Caption events

### 3a. Talking-head captions (all in captions.json with per-word onsets)

| # | t0 to t1 (f0 to f1) | Lines (style) | bbox x0,y0,x1,y1 | head | Layer | Enter | Exit | Spoken (ASR) vs first visible |
|---|---|---|---|---|---|---|---|---|
| 1 | 0.17 to 0.79 s (f4 to f19) | "let me tell you a" (base, 0.119) | 0.252, 0.233, 0.748, 0.334 | 0.431, 0.312, 0.556, 0.554 | front (bottom of "tell" touches the hair at f19, not cut) | rise + fade per word, cubic out 8 f, dy 50.7 px (0.6 em) | hard cut at f20 | let 0.16 s / f4; me f6, tell f9, you f11, a f14 |
| 2 | 0.83 to 1.84 s (f20 to f44) | "secret" (hook, 0.425) | 0.109, 0.255, 0.893, 0.518 | 0.424, 0.313, 0.549, 0.507 | BEHIND (f20 to f44) | vertical stretch from a 2 px line on the baseline, scaleY peak 1.21 at f24, settled f33; width 1.06 -> 1.00 by f41 | scaleY collapse onto the baseline, f40 to f44, ease in | secret 1.12 s / f20 (lead 7 f; /s/ audible at 0.96 s) |
| 3 | 2.00 to 3.21 s (f48 to f77) | because / you / are / probably (base, 0.092) | 0.551, 0.359, 0.818, 0.602 | 0.358, 0.276, 0.487, 0.521 | front | rise + fade per word | linear fade 4 f (1, 0.77, 0.52, 0.26, 0) | because 1.92 s / f48; you f51, are f61, probably f65 |
| 4 | 3.34 to 5.13 s (f80 to f123) | answering / your / Instagram (base-big) / DMs (base-small) | 0.512, 0.366, 0.871, 0.618 | 0.295, 0.260, 0.447, 0.539 | front | rise + fade per word | fade 4 f on a 1.15x punch-in cut (f120) | answering 3.28 s / f80; your f88, Instagram f100, DMs f110 |
| 5 | 5.26 to 7.17 s (f126 to f172) | in the (base-small) / wrong (emph-red) + order (emph-blue) | 0.099, 0.422, 0.903, 0.586 | 0.432, 0.315, 0.551, 0.528 | front (gap between the words = the head) | small words rise + fade; big words vertical stretch (order scaleY 0.20, 0.95, 1.11, 1.125, 1.11, 1.06, 1.05, 1.02, 1.0 on f148 to f156) | drop + fade + blur, ease in, 6 f: dy 1.7 to 58 px, opacity to 0.33 then off, blur 2 to 3.4 px | in 5.44 s / f126; the f132, wrong f138, order f148 |
| 6 | 67.19 to 68.74 s (f1611 to f1648) | "you don't need more leads" (base, 0.062) | 0.280, 0.699, 0.723, 0.774 | 0.424, 0.175, 0.618, 0.503 | front (fingers pass under "don't", f1631 to f1643) | rise + fade per word | last word rolls up and out | you 66.72 s / f1611 (during the iris); don't f1614, need f1616, more f1618, leads f1621 |
| 7 | 68.74 to 70.03 s (f1648 to f1679) | "you don't need more messages" (base, 0.051) | 0.280, 0.688, 0.721, 0.731 | 0.397, 0.235, 0.552, 0.508 | front | "messages" rolls up into the slot, line re-fits to the same 563 px width | drop + fade + blur 7 f: opacity 0.92, 0.80, 0.55, 0.39, 0.19, 0; dy 3 to 30 px; blur 3 to 4.5 px | messages 69.20 s / f1648 |
| 8 | 70.03 to 70.95 s (f1679 to f1701) | "you just need to" (base, 0.057) | 0.203, 0.475, 0.449, 0.522 | 0.484, 0.191, 0.665, 0.517 | front | rise + fade per word (small rise 10 px) | hard cut f1702 | you 70.08 s / f1679; just f1683, need f1686, to f1688 |
| 9 | 70.99 to 73.70 s (f1702 to f1767) | "convert the ones" (accent-magenta) + "you already have" (accent-violet) | 0.165, 0.462, 0.837, 0.522 (final) | 0.444, 0.184, 0.620, 0.485 | front (matte shows letter holes where "ones" crosses his chin) | rise + fade per word, cubic out 8 f ("the": dy 39.4, 21.6, 12.8, 7.5, 4.0, 1.7, 0) | none; footage blurs and fades to black under it | convert 70.96 s / f1702; the f1707, ones f1711, you f1731, already f1735, have f1739 |

Entry curve, measured (base words): position and opacity follow the same cubic ease-out over about 8 frames. Example "probably": dy 40.4, 33.0, 17.7, 9.6, 5.2, 2.7, 0.9, 0 px and opacity 0.04, 0.23, 0.58, 0.76, 0.85, 0.93, 0.98, 1.0 (f65 to f72). Blur only 1.5 to 3 px in the first 2 frames (motion blur). Start offset 38 to 50 px = 0.55 to 0.85 em (median 0.7 em). No scale change, no overshoot, no x motion. Onsets: each word appears on its own spoken onset; the ASR timestamps (Parakeet, 80 ms steps) lag the visual onsets by 0 to 6 frames (median 3), the audio envelope agrees with the visual onsets within 1 to 2 frames.

### 3b. Text inside the motion-graphic segments

| t0 to t1 (f) | Text | Style | bbox | Enter | Exit |
|---|---|---|---|---|---|
| f411 to f448 | that's nice! | ui-statement #353138 | 0.408, 0.553, 0.583, 0.600 | per word rise + fade (that's f411, nice! f415) | cut with blur |
| f450 to f470 | is it nice? | ui-statement light grey on dark red | 0.369, 0.606, 0.650, 0.709 | per word; "it" later and smaller | zoom + blur |
| f836 to f856 | Qualified Lead | ui-label #ba54c6 | 0.276, 0.343, 0.483, 0.401 | typewriter about 1 letter per frame | leaves with the card |
| f856 to f892 | could still be sitting there | ui-typed: active word purple #b968cc, settles #463c4a 8 f later | 0.300, 0.472, 0.701, 0.532 | per word rise + fade | desaturate, cut |
| f892 to f920 | waiting.. | ui-statement: typed red #ff2020, then white with red dots | 0.389, 0.447, 0.609, 0.552 | typewriter | letters explode outward with rotation over 12 f |
| f931 to f1100 | Qualified Lead | ui-label #775d7b on black | 0.215, 0.334, 0.500, 0.398 | wipe in with the light sweep | tilt + blur with the card |
| f1124 to f1210 | Priority Inbox | ui-statement inside the pill | 0.409, 0.472, 0.591, 0.524 | typewriter magenta, then left-to-right sweep to #2c282d | becomes the menu header |
| f1412 to f1482 | more conversations move forward | ui-typed (purple active word, warm grey) | 0.270, 0.478, 0.730, 0.520 | per word rise + fade | horizontal motion-blur slide left |
| f1510 to f1611 | Booked calls | ui-label white 70 % | 0.415, 0.202, 0.591, 0.245 | typewriter | iris transition |

## 4. Text behind the person

| Caption | Frames | Hidden | Cut-out behaviour | Edge |
|---|---|---|---|---|
| "secret" | f20 to f44 (every frame) | about 10 % of the word ink: 57 % of the "c", the stem and top of the "r"; share 0.098 at f24, 0.105 at f32, 0.082 at f42 | follows the head every frame (he leans and turns, the hidden share changes with him); the hair crown cuts the top of "c" and "r" | soft but tight: full text colour to hair over 6 to 8 px at the sides (row 300: #ff209b, #be0a51, #7b0b23, #520c14, #2b0d0b at 2 px steps; half-max width about 3 px), 2 to 4 px at the crown; clean hair outline, no individual strands, no halo or colour spill |

Evidence: extra/behind_secret_head_over_c_r.jpg (frame, RVM matte, matte edge drawn on the frame for f24, f30, f36, f42) and extra/zoom_head_over_secret_f36.jpg.

Checked and NOT behind: "let me tell you a" (touches the hair at f19, letters whole), the TH-A stacks (never overlap the head), "wrong order" (the head sits in the gap), TH-B lines over the hands (extra/front_dont_over_fingers_f1631-1643.jpg: white letters stay whole over the fingers; the matte has letter-shaped holes, which only happens when the text is drawn over him), "convert the ones" at 71.4 s (extra/front_ones_matte_f1714-1718.jpg: "ones" is mid-entry, 47 to 15 px low and 25 to 71 % opaque over his chin, so it looks half hidden, but the matte shows it in front). One ambiguous moment: at f1617 to f1618 the fingertip sits where the still-fading "n" of "need" is (extra/front_need_fingertip_f1617-1622.jpg); from f1619 the "n" is whole, so this is the entry fade, not a cut-out.

Other layering tricks: the talking head is placed INTO graphics twice (shrunk into an Instagram post at f200 to f209, and shown inside the phone icon tile before an iris reveal at f1606 to f1614); the cursor is always the top layer; the violet wash and halftone texture sit over footage and cursor.

## 5. Word effects

| Effect | Where | Numbers |
|---|---|---|
| Rise + fade per word on the spoken onset | every caption word, most UI statements | dy 0.55 to 0.85 em, 8 f cubic out, opacity on the same curve |
| Vertical stretch from the baseline with overshoot | "secret", "wrong", "order" | scaleY 0.02 -> peak 1.12 to 1.23 on frame 3 to 4 -> 1.0 by frame 8 to 13; x scale stays 1.0 (secret also 1.06 -> 1.0); first 2 frames smeared horizontally (speed streaks) |
| Vertical collapse exit | "secret" | top edge 185, 192, 208, 236, 298 px on f40 to f44 (baseline fixed), ease in |
| Animated gradient | hook and emph words | "wrong" red #ff063a (f142) -> magenta-ended #f61f58..#ff11c7 (f166); "order" pink (f150) -> violet-blue (f156); "secret" right end #8770f7 (f23) -> #49a4ff (f33), tilt drifts +20 to -20 deg |
| Glow + light rim | gradient words | 8 px outer glow in the letter hue (about 35 to 40 % at the edge), 2 px lighter rim on "wrong"/"order" |
| Sparkles | around "secret" (and the Priority Inbox pill) | 4-point stars, pale pink/white, 10 to 40 px, rotating, flying outward, f21 to f34 |
| Active-word colour, then a white wipe | TH-B last caption, UI statements | new words magenta #e502f0 or purple; 8 f later a left-to-right wipe to white, front about 30 px per frame, soft edge 120 to 150 px |
| Size hierarchy inside a stack | "Instagram" 1.21x, "DMs" 0.88x, "in the" 0.35x of "wrong" | sizes in section 2 |
| Staggered indents | TH-A stacks | because 0, you +36 px, are +105 px, probably +49 px; answering 0, your +109, Instagram +53, DMs right part |
| Word swap roll | "leads" -> "messages" | old word rises about 30 px and fades, new word rises in from 0.7 em below, 5 f; line re-fits to the same width (font 23 -> 19 px x-height) |
| Line re-centre and scale | final caption | layer scales 1.0 -> 0.875 and drifts 28 px left (f1716 to f1750) so the finished line ends centred |
| Drop + blur exit | "wrong order", "messages" line | dy to 0.5 to 0.75 em, blur 3 to 4.5 px, 6 to 7 f ease in |
| Typewriter | UI labels, bubbles, composer | about 1 letter per frame (labels), 2.5 per frame (composer) |
| Letter explosion | "waiting.." | glyphs scatter outward and rotate over 12 f while fading |
| Camera-locked text | all TH captions | text scales with the footage zooms (intro zoom-out 25 %, push-in 8.8 %, punch-in 1.15x) |

No underline, highlight box, outline-only text, emoji next to words or per-letter caption animation in the talking-head captions.

## 6. Pop-ups and motion-graphic overlays

Full parameters are in popups.json (16 entries). Summary:

| Element | Frames | Shape and fill | Text / icons | Enter | Exit / camera |
|---|---|---|---|---|---|
| Cursor | f174 to f1560 (recurring) | arrowhead 70x74 px, solid #ce36ed, drop shadow dx -4, dy 6, blur 8 | | slides in from the right edge, 6 f | top layer; ease-in-out moves, click dip |
| Violet wash | f186 to f200 | full-frame re-grade (#1b0f19 -> #4d2fdd), halftone dots about 4 px | | 6 f ramp | into the shrink |
| Footage to post | f200 to f212 | footage scale 1.0, 0.97, 0.88, 0.66, 0.47, 0.375, 0.30, 0.27 | | ease in-out 8 f, zoom blur | becomes the post image |
| Phone mockup | f204 to f312 | white screen #fbf9fc, radius about 0.09 of width; nav pill #e9e7ec | IG post, caption SF Pro; red badge #ff2a2a d 48 px counting 6 -> 150 | UI fades up around the post | camera 1.0 -> 2.9x into the nav bar, back to 1.2x; whip blur out f304 to f316 |
| Chat composer | f313 to f400 | pill 680x97, radius 40, #fcfafd; green #34c759 circle d 92 | typed "Lots of unread messages, reply ASAP!" (2.5 chars/f); green sent bubble; grey "On it!" | flies in from the left with blur, -4 deg tilt -> 0, button pop 0.3 -> 1 (f321 to f324) | zoom out + blur |
| DM icon + counter | f400 to f470 | slate #3f5468 plane about 120 px; badge d 50 red #ff2b2b, then teal #2ad4e0 | 147 -> 132, 130 -> 123 | icon drops in with blur, badge pops | darken to red-black, push 1.6x |
| Inbox phone + Reply chip | f470 to f644 | IG inbox; pastel gradient avatars; "Requests (1)" #4a5cff; "Reply" chip on slate #5a5a8c | rows SF Pro | phone grows from a sliver, chip swipes in from the right f563 to f572 | rows removed with slide-up, blur out |
| Story + reply | f644 to f720 | story card tilted -5 deg; fire-emoji grey pill; blue reply pill #5f4fea | | slide up / pop / slide from right | pan up |
| Bubble slide | f712 to f748 | blue pill 607x84, radius 41.5, #5f4fea; grey incoming pill #efefef, avatar d 36 | "Hey, how's everything going?" white | from off-frame right, expo out: 184, 128, 82, 46, 28, 21, 15, 11, 7, 4, 2, 1, 0 px (f719 to f731), motion blur | conversation scrolls up 150 px |
| Skeleton stack | f748 to f836 | white cards radius about 0.3 h, violet avatar, grey bars; slate #6b6496 bg with falling particles | "Richard Sean / can you send me the link? 4h" | fast scroll with motion blur f748 to f770 | placeholders fade, bg turns pastel |
| Lead card, dark | f920 to f1104 | card 730x163, radius 54 (0.33 h), #eae8eb lit from the right; avatar d 110; orbiting white dot | time 4h -> 18h red #e03a3a -> 3d | light sweep reveal 12 f | push 2.2x, then 3D tilt + blur f1084 to f1104 |
| Priority pill | f1104 to f1210 | magenta orb #e040e0 -> blob -> white pill with 3 px magenta bottom edge, violet glow y +8 blur 16 | typed magenta, swept to #2c282d | liquid morph 20 f, sparkle burst | becomes the menu header |
| Priority menu | f1168 to f1352 | 4 rows white #fcfafd radius about 0.3 h, soft violet shadow y +6 blur 18; icon tiles radius 0.25: pink #ff4f9a, violet #6c4dff, orange #ff9f0a, grey #6e6e73 | labels SF Pro Medium | gradient bars #c44dff -> #8a00ff wipe in from the left, 2 f stagger, then turn white | 2x zoom with blur; "Qualified" expands 3 cards with 3 f stagger |
| Star app icon | f1352 to f1410 | squircle about 140 px, yellow #ffee00 -> orange #fdb32a/#ff8a00, orange glow 30 px | white star, outline then fill | pop with rotation -15 -> 0 deg, scale 0.6 -> 1.0, back ease, 13 f | blur out |
| Booked calls | f1482 to f1611 | 5 to 6 glowing rings; icon 147x153 radius 39 #436ee5; chip 127x57 radius 27.5 #7188fe; 5 stacked pink cards (90 % width, 22 px up per layer) | "Booked calls" label; count 3+ -> 90+ | rings expand, icon rises with 3D tilt, cards rise | icon fills with the footage, iris |
| Iris | f1608 to f1614 | soft circle radius 60 -> 900 px, feather about 60 px | | expo in 5 f | reveals TH-B |

Backgrounds: pastel mesh (pink #ff9cf5 bottom-left, cyan #b5f7ff top-right, periwinkle #9d9cff bottom-right, white centre glow) with faint concentric arcs; dark void (#130915 with a grey radial lift); green/olive/black (composer); warm yellow radial (#f6ca55); violet (#c084fc -> #6366f1) for booked calls. Glass blur is not used; cards are opaque white with soft coloured shadows. Camera moves are 2D zooms and pans with motion blur, plus a few 3D tilts (composer, lead card exit, phone icon entry).

## 7. Recipe

1. Font: Zalando Sans, wdth 112.5, wght 700, lowercase as said, tracking -0.06 em, word gap about 0.2 em of ink (engine: 0.25 em advance gap plus tracking). Fill #fdf9fb. No stroke, shadow or glow on white words.
2. Sizes (font px / frame height): first caption 0.119; stacks beside the head 0.092 with one word per line, a key proper noun at 0.111, a trailing short word at 0.081; small connector words over a big word 0.057; big gradient words 0.163 to 0.165; one-word hook 0.425; TH-B one-liners 0.051 to 0.081.
3. Stacks: left-aligned at x 0.51 to 0.55, lines indented by 0 / +0.55 / +1.6 / +0.75 em (zig-zag), baseline gap 0.60 em of the base size (engine leading 0.77), block vertically centred at y 0.48 to 0.49, beside the head on the side with room.
4. Entry for every word: on its spoken onset (use the first visible frame, not the raw ASR start), translate from +0.7 em below with opacity 0, both on cubic ease-out over 0.33 s (8 f), 1.5 to 3 px motion blur in the first 2 frames.
5. Exit: whole caption linear fade over 4 f; for emphasis captions instead drop 0.5 em with ease-in, fade and blur 3 px over 6 f.
6. Hook word: one word, centred at y 0.386, gradient #fe0532 / #fe1b9c (0.35) / #b738fe (0.68) / #48a7fe, 8 px glow at 35 %, placed BEHIND a per-frame person matte with a 2 to 6 px soft edge. Enter by scaling Y from 0.02 about the baseline to 1.21 at frame 4 and settling to 1.0 by frame 13 (x 1.06 -> 1.0 by frame 21), horizontal smear on the first 2 frames, 8 to 12 sparkles flying outward. Exit by scaling Y to 0 about the baseline in 5 f (ease in).
7. Split emphasis: the two key words sit on one baseline left and right of the head, one gradient across the line (#f61f58, #ff11c7 at 0.38, #b436fe at 0.64, #8863ff at 0.82, #37b6ff), the small connector words in white above the left word; same Y-stretch entry, overshoot 1.12 to 1.23.
8. Animate gradients during the hold: shift the ramp so the left end reddens and the right end blues over 10 to 20 frames after entry.
9. TH-B one-liners: centred low (baseline y 0.72 to 0.77) or left-aligned at x 0.19 to 0.20 (baseline y 0.51); fit the line to a fixed width (about 0.44 W) when a word is swapped; roll the swapped word up (5 f).
10. Active-word colour: new words magenta #e502f0 (normal blend), 8 f after the last word lands wipe to white left to right at about 30 px per frame with a 120 to 150 px soft edge.
11. Captions inherit the footage transform (zooms, punch-ins, drifts).
12. UI scenes: SF Pro/Inter text, white rounded cards (radius 0.3 to 0.5 of height), soft violet shadows, pastel mesh backgrounds, the magenta cursor, slides with motion blur and expo-out easing, typewriter labels, count-up badges.

## 8. Gaps (what the editor needs that a typical caption tool lacks)

1. Per-frame person matte with text behind it (needed for "secret"), with a soft 2 to 6 px edge.
2. Non-uniform scale about the baseline (scaleY stretch with overshoot) as an entry and exit.
3. Per-line indents inside one caption block (zig-zag stacks) and per-word size overrides inside a line (Instagram up, DMs down).
4. Words placed around the head: one caption split into a left part and a right part with the head-sized gap between them.
5. Gradients that animate over time (ramp shift and tilt drift) and a gradient spanning words in different places.
6. Glow plus a thin light inner rim on gradient words.
7. Colour wipe on settled words (accent -> base, left to right, soft edge) and "active word" colouring.
8. Word swap roll (replace one word in place, refit the line to a fixed width).
9. Text that inherits the footage's camera moves (zoom-out intro, push-ins, punch-in cuts).
10. Separate easing for opacity (the reference fades on the same cubic curve as the motion, not in the first third).
11. Particle sparkles and speed streaks attached to a word.
12. Letter-level effects for UI text: typewriter, explosion, per-letter colour.

## 9. Fit to the engine (ENGINE.md)

Maps cleanly:
- Fonts: base family as a new id `zalando-sans` (Google Fonts "Zalando Sans", OFL, variable wdth 75 to 125, wght 200 to 900; Fontsource slug expected @fontsource-variable/zalando-sans, not verifiable from here). Bundled fallback: `tiktok-sans` stretch 125 weight 700 (glyph IoU 0.824 vs 0.825). UI text: `inter` 400 to 600.
- Sizes: base 0.092, big 0.111, small 0.081/0.057, emphasis 0.164, hook 0.42; tracking -0.06 (gradient words -0.01 to -0.022).
- Fills: solid #fdf9fb; linear gradients at angle 0 with the stops above; `fillSpan: "line"` for the split emphasis.
- Glow: {color #ff2a8a, blur 0.03 to 0.04, strength 0.35 to 0.4}; stroke {#f8a0c0, 0.008} approximates the light rim (the real rim is inside the letter edge, an outer stroke is drawn outside).
- Blend: "normal" everywhere (verified).
- Enter: {kind "rise", dur 0.33, unit "word", dist 0.7, ease "out"}; exit {kind "fade", dur 0.17, unit "page"}.
- Layout "stack", leading 0.77 (reproduces the 38 to 41.5 px gaps at size 0.092 with the design.ts formula), words 1, lines 4 (one word per line is the signature stack; the reference breaks "let me tell you a" and "in the" differently, which the word limit cannot express).
- Behind: the hook place has `behind: true` (1 caption in 9 in the reference).

Approximated:
- Hook and emphasis entry: accentEnter {kind "pop", from 0.2, overshoot 0.2, ease "back", dur 0.42} scales uniformly about the word middle; the reference scales only Y about the baseline (from 0.02 to 1.21 peak), so the pop grows sideways too (x error up to 80 % in the first 2 frames).
- Opacity in "rise" reaches 1 at u = 1/3 (0.11 s); the reference reaches 0.58 at 2 f, 0.85 at 4 f, 1.0 at 7 f. Expect the engine words to look about 2 frames "harder".
- Picks: keyword rule finds "secret", "wrong"/"order" and "Instagram" in the reference text, but the shares (0.25 emph, 0.12 hook, 0.12 big) are approximations of 3 of 9 captions.
- Places used in turn approximate the reference order (above head, hook behind, two right stacks, left block).
- Word gap: engine 0.25 em + tracking (0.19 em) vs measured 0.19 to 0.25 em: fine.

Cannot express yet (with numbers):
- Per-line indents in a block: 0, +0.55, +1.6, +0.75 em (because / you / are / probably). Engine aligns every line on one anchor.
- Split line around the head: "wrong" right edge at x 0.406, "order" left edge at x 0.633 on the same baseline (a 0.227 W gap). Engine has one place per caption.
- Y-only stretch about the baseline: scaleY 0.02 -> 1.21 -> 1.0 in 13 f with x 1.06 -> 1.0 in 21 f; collapse exit in 5 f.
- Animated gradient during the hold (ramp shift of about 10 % of the word width and tilt +20 -> -20 deg over 20 f).
- Inner light rim 2 px (#f8707e) and glow that follows the gradient hue along the word.
- Accent-to-white wipe: 30 px/frame front, 120 to 150 px soft edge, starting 8 f after the last word.
- Word swap roll and fit-to-width (x-height 23 -> 19 px to keep 563 px line width).
- Inheriting footage zoom: intro zoom-out (text 1.10 -> 1.0 over f11 to f19), push-in +8.8 % (f52 to f72), punch-in 1.15x (f120), final layer drift scale 0.875 and -28 px (f1716 to f1750).
- Sparkle particles (8 to 12 four-point stars) and speed streaks on entry.
- Per-caption exits (fade vs drop + blur vs collapse vs roll vs hard cut): engine has one exit for all captions.
- UI motion graphics (cards, cursor, counters, typewriter, letter explosion) are outside the caption model.
