# Mimic: text designs, read off a reference and drawn on your footage

The Mimic page copies a reference edit onto your raw talking footage. This page is about its
text: several caption styles in one video, stacked layouts of words at different sizes,
gradients, glows, blend modes, words set behind the speaker, the word being said lit up, and
the moves words make coming on. It covers what the six inspiration edits do (each broken down
frame by frame in [text-breakdowns/](text-breakdowns/)), what the engine can draw, the ready-made
looks, and how the page reads a design off any reference you drop in.

## The six inspiration edits

| Edit | What its text does | Preset |
|---|---|---|
| [jiia 1788889068, Mochi DM promo](text-breakdowns/jiia-1788889068-mochi-dm-promo/breakdown.md) | Lowercase Zalando Sans semi-expanded (PP Monument Extended's look), bold, tracked -0.06 em, stacked beside or above the head in a staircase (indents 0, 0.55, 1.6, 0.75 em), leading 0.77. Key words 0.164 of the height in a red, pink, violet, blue gradient across the line with a glow in their own hue, stretching up from the baseline (to 121%, settled by 13 frames). One giant gradient word ("secret", 0.42) behind the speaker. Words rise 0.7 em and fade in over 8 frames as they're said. Captions ride the camera's zooms. | jiia gradient stack |
| [jiia 1789492941, voice clone](text-breakdowns/jiia-1789492941-voice-clone/breakdown.md) | Mona Sans at 125% width, 700, near white with a 35% shadow, each word its own size (0.062 to 0.130), small words small, a staircase. Giant gradient words ("first", "voice", 0.52 to 0.62) filling 76 to 79% of the width behind the speaker, stretching up from the baseline. A pair split round the head. Words rise, fade and sharpen from a 2 to 8 px blur, starting 4 to 11 frames before they're said. Typing at 17.7 and 35 letters a second. | jiia voice clone, Magenta typing |
| [jiia 1783186897, cinematic](text-breakdowns/jiia-1783186897-cinematic/breakdown.md) | A heavy lowercase grotesk (Helvetica Neue Bold's look) with its letters touching (-0.11 em), in five size tiers, a soft shadow. Whole captions in difference (white turned into the picture's inverse: peach over blue, navy over sky). The last word now and then a copperplate script in title case, also in difference ("Patient" goes green over purple, blue over wood). Two captions partly behind people. Words fade in over 3 frames. | jiia difference |
| [jiia 1779557679, lifestyle](text-breakdowns/jiia-1779557679-lifestyle/breakdown.md) | White Google Sans Medium subtitles at 0.041 of the height, low down, cut on and off whole, a soft shadow. Now and then a red (#C70001) title card instead: a giant Anton key word (0.11 to 0.25) over a small red line justified to its width, softened by a 2.7 px blur, its words cut on as they're said. A phrase spread either side of the head. Nothing behind the speaker. | jiia subtitles and giant words |
| [jiia 1780933717, black and white](text-breakdowns/jiia-1780933717-black-and-white/breakdown.md) | Black and white footage, white bold grotesk (SF Pro Display's look, Inter Tight is closest) at -0.1 em, stacked flush left in a staircase. Key words deep red (#980F04) at twice the size, marked phrases in a red roundhand script ("Dream of Yours"), pairs of words either side of a standing person, one giant red word behind him ("consciousness"). White words cut on as said, red ones fade in over 3 frames. | jiia black and white |
| [themochi.app, vertical](text-breakdowns/themochi-1788197316-vertical/breakdown.md) | Bold Zalando Sans at 115% width (SF Pro Expanded's look), near white (#FEF8F5) with a 55% dark shadow, lowercase but for names (Instagram, DMs, CRM). A word or two a line in stacks of up to five lines over the head, each line its own size (five sizes, 0.046 to 0.166 of the height: the first line smallest, the last biggest, now and then a giant key word), the first line set 8% of the width left, the stack's foot 1.5% of the height below the top of the head, so 12 of the 14 captions that meet him are tucked behind his hair. Each line comes on with its first word, rising 7% of the height: two-thirds there in opacity on its first frame, a quintic ease over 16 to 20 frames. The caption cuts off whole. Captions ride the footage's zooms (x0.81 to x1.31). | Mochi vertical |

## What the engine draws

**Styles** ([engine/text/style.ts](../app/src/engine/text/style.ts)). Each style names a font of the
library and its weight, slant and width (for faces with a width axis), the case, the size (a share
of the frame's height), letter spacing, and its fill: a colour, or a gradient of up to five colours
at any angle across each word or across the whole line. On top: an outline, a dropped shadow, a glow
in any colour, a box behind the words, opacity, one of twelve blend modes (multiply, screen,
overlay, soft light, hard light, darken, lighten, difference, exclusion, colour dodge and burn), a
turn and a lean of each word, a soft focus that stays, and its own way of coming on.

**Fonts** ([engine/text/library.ts](../app/src/engine/text/library.ts)). 71 faces, all free to
ship (OFL, Apache 2.0, or public domain), each loaded only when a style uses it: wide grotesks
(TikTok Sans and Archivo with width axes, Zalando Sans, Mona Sans, Hubot Sans, Anybody from 50 to
150% width, Unbounded, Syne), clean sans (Inter, Inter Tight, Google Sans, Geist, Instrument Sans,
Metropolis, Figtree, Montserrat), condensed (Anton, Antonio, Bebas Neue, Oswald, League Gothic),
display (Bungee, Bowlby One, Luckiest Guy, Bangers), serifs (Instrument Serif, Playfair italic,
Kalnia, Bodoni Moda, Fraunces), scripts (Pinyon Script, Great Vibes, Allura, Caveat), and mono.
Their licences are in [assets/fonts/lib/FONTS-LICENSE.txt](../app/src/assets/fonts/lib/FONTS-LICENSE.txt).

**Moves** ([engine/text/motion.ts](../app/src/engine/text/motion.ts)). Fade, pop and bounce (their
overshoot exact: easeOutBack's constant is solved for it, 1.70158 for 10%), zoom, stretch up from the
baseline, rise, drop, slides, blur in, typing (letters a second, a caret that blinks once the line
is out), and a wipe. Any move can also come into focus, and fade in quicker than it moves (a line
nearly there at once that slides on into place); the curve can be smooth (cubic), sharp (quintic),
gentle at both ends, even, or past and back. Each word comes on as it's said, a line or a caption at
once with a stagger, or a little ahead of being said.

**Designs** ([mimic/design.ts](../app/src/mimic/design.ts)). A design is a set of styles and rules:

- **Picks**: which words take another style: each caption's key word, its last or first word, numbers,
  the small words (the, in, you), the second line, or words you mark by typing `*like this*`.
- **Case**: as said, lowercase, capitals, title case, or lowercase keeping names (a sentence's capital
  goes, Instagram's and DMs' stay).
- **Layout**: lines all one size, stacked lines with each word at its style's size, or a line's words
  spread across the place (round the speaker); lines fitted to the width; a staircase of indents.
- **Places**: where captions sit, used in turn; any of them behind the speaker.
- **Other looks**: a share of the captions set another way: the one with the strongest word alone in
  the middle at a giant size (its key word in one style, the rest in another), or words spread round
  the speaker, each look with its own places, layout, moves and whether it's behind.
- **The word being said**: its own colour, outline, glow or weight, growing a little, a box behind it
  that moves word to word, or the colour sweeping across it (karaoke), kept once said or not; words
  not said yet dimmed.
- **Riding the zoom**: captions scale with the footage's zooms, as if set in the picture.
- **Clear of the face**: the speaker's face is found a second apart through the footage (a take can
  lean in and walk back), and followed through the framing and the zooms while each caption is up. A
  caption in front that would cover the head (the face, the hair or a cap above it, the chin) moves
  the least way that clears it wherever the face goes meanwhile: up, under the chin, or to a side.
  One behind the speaker that the head would mostly hide goes up until only its foot is tucked behind
  the top of the head, as Mochi's stacks are, or comes out in front when there's no room above the
  head (a close-up); a giant word across the frame keeps its middle behind the head, as jiia's do.

**Behind the speaker** ([engine/vision/person.ts](../app/src/engine/vision/person.ts)). MediaPipe's
selfie segmenter (250 KB, Apache 2.0, served by the site) finds the person at 256 pixels square; a
guided filter snaps the mask to the frame's own edges at 512 pixels, and each frame leans on the last
so the edge doesn't shimmer. The frame is drawn, the person cut out of it, the caption drawn, and the
person laid back over it.

## Ready-made looks

[mimic/presets.ts](../app/src/mimic/presets.ts) has 32, in three groups. **From the reference
edits**: jiia gradient stack, jiia voice clone, jiia difference, jiia black and white, jiia subtitles
and giant words, Mochi vertical, Magenta typing. **Popular caption looks**: Hormozi (and Submagic's
Anton version), MrBeast, Beasty, CapCut's word pop, karaoke fill, light to bold (Iman Gadzhi), a block
beside you (Ali Abdaal), Opus Clip's Mozi, Pod P, Popline and Deep Diver, a highlighter box, two tone,
TikTok's box, word chips, a supersized word, one word at a time. **Clean, editorial, effects**: serif
editorial, minimal blur, a handwritten accent, neon, typewriter, a glass card, a giant word behind you.
Their numbers come from the tools' own published settings (CapCut's, Opus Clip's, Submagic's), from
open-source caption projects, and from frames where nothing is published.

## Reading a design off a reference

When a reference's captions are more than subtitles in a band (big lines of text coming and going
all over the frame, or at very different sizes), the study reads its frames whole, three a second,
round the moments text was seen ([analyze/reference.ts](../app/src/mimic/analyze/reference.ts)).
Screens of an app's interface (no speaker's face, lines of small text all over) are skipped, and
so, when most of the text comes while the speaker is on screen, are the long stretches without them
(a promo's motion graphics). A frame of ten small words or more on four lines or more (a list, a
chat), writing held still for over four and a half seconds, and mid-grey writing are an app's, not
captions.

1. **Words** ([analyze/words.ts](../app/src/mimic/analyze/words.ts)). Each line the text reader finds
   is split into its words, and each word's letters are picked out whatever their colour: what stands
   out of its surroundings, lighter or darker, by more than a stroke's width (a top-hat and a black-hat
   per channel), each piece kept when its colour is unlike the picture right round it (so a glow behind
   the words, or the gaps between letters, isn't taken for ink, and letters mixed in by difference,
   dark over light and light over dark, are). Each word is measured: its lowercase and tall letters'
   heights, its baseline, stroke thickness (its weight), lean (italic), its colour or the gradient
   across it (fitted along the direction its colour changes most), and the picture round it.
2. **Behind or in front.** With the person masked in the frame, a line whose letters go missing where
   the person is sits behind them.
3. **Blend modes.** Where a word's colour changes with the picture under it, all twelve blend modes are
   fitted (the letters' colour per channel and an opacity) and kept when one explains the colour far
   better than a plain colour does. Over an even picture, white letters mixed by difference still show
   as the picture's colour turned inside out.
4. **Captions** ([analyze/textdesign.ts](../app/src/mimic/analyze/textdesign.ts)). Words are followed
   from frame to frame: a caption goes on while most of its words stay, gaining the ones that come on.
   Its fullest frame shows its layout.
5. **Styles.** Words are grouped by how they look (colour or gradient, blend, lean, stroke), then by
   size: the commonest is the base. A style in only one caption that's nothing out of the ordinary, or
   dark grey writing, is writing in the picture, not a caption style.
6. **Rules.** A style that takes one word of a caption is a pick (by the rule most of its words keep);
   one that takes whole captions is another look. Words a line, lines a caption, stacked or one size,
   spread round the speaker, the places captions sit in, the share behind the speaker, and whether
   words come on one by one as they're said.
7. **Fonts** ([analyze/fontmatch.ts](../app/src/mimic/analyze/fontmatch.ts)). Each style's clearest
   words are drawn in every face of the library at the size their measured heights give, with the
   letter spacing that makes them as wide as read (editors set letters touching, or spaced out), laid
   on the frame's letters baseline to baseline, and scored by how much of the
   letters overlap; the best six faces are then tried at every weight and width they have. A face is
   taken when it's at least 55% alike; below that, the face picked from the letters' proportions
   (wide, condensed, a script, or Inter) stays.

The design is what "As the reference" puts on the page; the page then lets you change any of it.

## Not done yet

- Captions don't yet take on a reference's per-caption exits, animated gradients, the accent that's
  wiped from one colour to another, or a word swapped in place.
- The moves read off a reference are its pace (word by word or whole) with standard curves, not
  measured frame by frame; the presets carry the measured ones.
- Interface pop-ups (notification cards, chat bubbles, cursors) aren't generated; the breakdowns
  measure them (popups.json) for when they are.
- A sharper cut-out (MODNet, Apache 2.0, about 7 MB, WebGPU) for hair edges is the next step for text
  behind the speaker.
- Which captions go behind the speaker is a share of them, not chosen by where the head is.
