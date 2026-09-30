# Mimic: an edit copied from a reference

The clipper's second page (`app/mimic.html`, linked from the clipper's header). You drop
three things: a reference video to copy (an ad, a Reel), your raw footage, and optionally
extras (pictures and clips) and music. The page studies the reference on your computer,
hears your footage, and edits it the way the reference is edited: the same captions (place,
size, colour, how they come on), the same cards sliding over the talk with your pictures in
them, the same cutaways, zooms, sound under the voice and ending. A switch decides whether
your footage is also clipped (its pauses cut to the reference's) or kept as it is.

Nothing is uploaded unless you choose Gemini for the words (then the sound goes to Google).
Everything else (the analysis, the speech model, the render) runs in the browser.

Extras can be pasted instead of dropped (`app/src/mimic/ui/paste.ts`): copy a picture in any
tab (right-click, Copy image) and press Ctrl+V (⌘V on a Mac) anywhere on the page, or use the
Paste button; each of the reference's cards and cutaways has its own paste button, which
puts the picture straight in it. A picture comes named by its alt text when the page it was
copied from gave it one, and one pasted twice isn't added twice. A copied link to a picture
is fetched when its site allows it (most don't; a copied picture always works).

## What the example showed

The example pair in `inspirationedit/` and `rawvidneededited/`:

- **The reference**: a 62.7 s vertical ad (360 × 640, 30 fps), one person talking to camera
  in one room, Danish.
- **The raw footage**: 2:27 of another person talking to camera (608 × 1080, 30 fps),
  Danish, already rough-cut: about 30 jump cuts (one every 4 s or so) and almost no pauses
  (four gaps over half a second). So the job is less cutting than dressing: captions, cards,
  zooms that hide the jumps, and the ending.

Measured from the reference, frame by frame (the page's own analysis, checked against the
Python tools in `tools/`):

| What | The reference |
| --- | --- |
| Captions | White, a semi-bold sans (Inter at 600 matches its strokes), set tight: 3 to 4 px between words on a 13 px x-height (0.15 of the size, where Inter's own space leaves 0.26), sentence case with the speech's punctuation, a soft shadow. The first line's middle at 62% of the height, two lines at most. Words come on one at a time as they're said, fading in over about 0.1 s, laid out for the whole caption first (a line doesn't jump as it fills). Each line is sized to fill 43% of the frame's width, up to a cap: a long line ("hvordan og hvorfor") is small, a short one ("webshop.") big. A caption ends at a sentence or a pause and leaves when the voice stops. |
| Cards | Ten, in five runs. The hook: four 4:5 photos in one place (80% of the width, centred), the first sliding in from the right in 0.2 s easing out, the next three cutting in on the same spot every half second, the last sliding out to the left. Later: a sales screenshot (76% wide), a pair of screenshots, a 16:10 video thumbnail (70% wide), a pair of product pictures, each sliding in from the right and out to the left. Captions stay on top. |
| Cutaways | Three stretches of full-frame footage over the voice (7.5 to 12.5 s with two cuts, 22.5 to 25.3 s zooming into a laptop screen, 38.0 to 40.4 s). |
| Zooms | 19 on the talking: steps between the wide framing and one about 16% closer, most over 6 frames (0.2 s) at an even speed, a few as jumps on a cut, about every 2 s where they come (long stretches have none). |
| Sound | Voice only for the first 18.7 s, then a low bed under it (about 16 dB down) to the end. No sound effects: the loudest high-frequency moments near the cards and cuts are no louder than anywhere else. |
| Ending | A cut to 3 s of black. |

## How a reference is studied

`app/src/mimic/analyze/`, orchestrated by `reference.ts`:

1. **Every frame**, small and gray (the long side 320 px), for cards, cuts and zooms.
   - **Cards** (`cards.ts`): a card is a rectangle of straight edges: two sides of the same
     height, or a top and bottom over the same stretch, with the rest of its outline showing
     wherever a caption or its own picture doesn't hide it. A rectangle's picture can hide
     part of its edge, so candidates grow to the fullest outline, and a centred card's
     fainter side is found at the mirror of the strong one. Once seen, a card is looked for
     again each frame where it was, or up to a third of the frame either side (a slide);
     whole outlines seen at its place vote for its width. A card has to be a new picture
     (not something already there, like an arm or a door), unless it takes over from a card
     that just left the same place (the next of a run). Its moves on and off give the
     motion (direction, time, easing); a change of picture while it rests starts the next
     card of the run. On the example: all ten cards, their runs, rectangles within a pixel
     or two and their motions.
   - **Cuts** (`shots.ts`): at least 12 of 16 cells changing at once, far more than the
     frames around (a card swapping its picture changes only the card). Shots whose
     layout matches the longest one are the talking footage; the rest are cutaways.
   - **Zooms** (`zoom.ts`): each frame against the one before, scaled about the middle and
     nudged a pixel or two, leaving out the captions and cards; the best scale is the
     zoom. A run of frames growing (or shrinking) is one punch-in (or pull-out).
2. **A frame a second, read whole** with PP-OCRv4's text detector and recogniser (ONNX,
   Apache 2.0, 15.6 MB, `public/models/ppocr-*`): where big, changing lines of text sit
   most often is the caption band; small text inside a card makes it a screenshot.
3. **Three frames a second of the caption band, read closely** (`captions.ts`). Inside each
   line the letters are picked out (the extreme of brightness away from what the box's
   border shows), which gives their height, width, colour, weight, and what sits around
   them (an outline, a shadow, a box). A line's size is the one Inter needs to draw its
   lowercase as tall (capitals only for a line of capitals: faces differ most in how far
   their tall letters reach), with Inter's display cut, which the browser draws at caption
   sizes. Frames of one caption show how it comes on (one more word each time is word by
   word) and, when it's laid out whole, the space between words: each new word starts one
   gap past where its line ended (the reader can't tell, as it runs tight words together).
   The example keeps 3 to 4 px between words whatever the letters (a t's bar to the next
   t's too), so the gap is kept as ink, not as a narrower space.
   Each caption's last frame is the whole caption: letters per line, alignment, and
   whether lines are fitted to one width (their widths stay put while their letters vary)
   or all one size (their widths grow with their letters).
4. **The sound** (`sound.ts`, 16 kHz): where the voice is and its pauses; a bed under it
   (the low end under a voice, 20 to 90 Hz, rising well above where it starts and staying
   up; its level from the quiet between words); and sounds on events (for each kind of
   visual event, the loudest high-frequency moment near each, against moments picked evenly
   through the video).
5. **Faces** (YuNet, already in the clipper) on the frames read whole: the speaker's face
   size and place, to frame the new footage the same.

On the example the analysis takes about 75 s in Node and a little longer in a browser.

## How the edit is made

`app/src/mimic/plan.ts`:

- **The footage** stays whole, or (with the switch on) keeps its speech with pauses over
  the reference's longest cut down to it.
- **Captions** come from your words: a sentence's end or a pause of 0.35 s ends a caption,
  lines fill up to the reference's letters per line (breaking after a comma when half
  full), a caption holds the reference's number of lines. `captions.ts` sizes and places
  them as measured and brings each word on as it's said. Where the reference sets its
  words tighter or looser than Inter would, each word is placed by its letters' edges, the
  reference's gap from one word to the next (the example's 0.15 of the size, where Inter
  leaves 0.26).
- **Cards and cutaways** come at the same point of the talk: the hook's (the first 5 s) to
  the second, later ones at the same share of the speech through, on a caption's first
  word. A run keeps its gaps. Your extras fill them in order (clips to cutaways and clip
  cards, pictures to cards, then anything left over to slots still empty), or as you pick
  per slot; each is cropped to the slot's shape about its subject (a face).
- **Zooms** step between wide and close (the reference's close level) where the
  reference's do, at the same share of the talk, and jump at every cut in your footage (so
  a jump cut reads as a punch-in, the way the reference hides its own).
- **Framing**: when both faces are found, the footage is cropped (up to 1.3 times) so the
  face is as big, and where, the reference has it.
- **Sound**: sounds on the same events as the reference's (synthesised in the page:
  whoosh, pop, click, hit, riser, ding); your music from where the reference's bed came in,
  as far under the voice; the whole at -14 LUFS.
- **Ending**: the reference's black, if it has one (a switch).

`render.ts` draws each frame on a canvas (footage or cutaway, cards, captions) and encodes
it with WebCodecs, H.264 and AAC in MP4 where the browser can.

## Hearing the footage

The words come from NVIDIA's Parakeet TDT 0.6B v3 (25 European languages, punctuated and
capitalised, CC BY 4.0), the int8 ONNX export from sherpa-onnx, run by ONNX Runtime's
WebAssembly build in a worker (`app/src/mimic/asr/`):

- The features are computed the way sherpa-onnx computes them for NeMo models
  (kaldi-native-fbank's Povey window and librosa mel bank, 128 bands, per-band
  normalisation); `tests/mimic-asr.test.ts` holds them to kaldi-native-fbank's numbers, and
  the search is sherpa-onnx's token-and-duration greedy search, so the words come out as
  sherpa-onnx's do (up to int8 rounding).
- Speed, measured in headless Chromium: the encoder hears 2.7 times faster than real time on
  one thread (8 times with four threads, where the page is cross-origin isolated), so 2.5
  minutes of footage takes about a minute. Loading the model takes 4 to 7 s.
- The model is about 670 MB. The deploy fetches it from sherpa-onnx's GitHub release and
  serves it from the site (`models/parakeet-v3/`); the browser keeps it after the first
  time. If the site doesn't have it, the page tries Hugging Face.
- Danish from this model is readable but not perfect ("sikret" for "sikkert", names
  misheard). The words can be fixed in the page (each keeps its time: the text is lined up
  against what was heard), and with a Gemini key the page asks Gemini to fix them against
  the sound while keeping the local timing.

## Limits

- One speaker's talking footage as the main footage (the planner doesn't pick between
  takes).
- The caption face is the clipper's Inter (weights 100 to 900), Oswald, League Gothic or
  Instrument Serif: a reference in another face gets the nearest of these.
- A card's picture is laid flat in its rectangle (no rotation, 3D or masks beyond rounded
  corners).
- A reference's own music and sounds aren't copied (they're someone else's); the page
  copies where and how loud they sit, with your music and its own sounds.
