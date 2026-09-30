# Mimic: an edit copied from a reference

The clipper's second page (`app/mimic.html`, linked from the clipper's header). You drop
three things: a reference video to copy (an ad, a Reel), your raw footage, and optionally
extras (pictures and clips) and music. The page studies the reference on your computer,
hears your footage, and edits it the way the reference is edited: the same captions (place,
size, colour, how they come on), the same cards sliding over the talk with your pictures in
them, the same cutaways, zooms, sound under the voice and ending. A switch decides whether
your footage is also clipped (its pauses cut to the reference's) or kept as it is.

Nothing is uploaded unless you choose Gemini for the words (then the sound goes to Google,
and, to place your pictures or pick sounds from your script, the transcript and small copies
of your pictures). Everything else (the analysis, the speech model, reading your pictures,
the mix, the render) runs in the browser.

A reference once studied, and footage once heard, are kept in the browser (IndexedDB, by the
file's name, size and date): dropping the same file again takes a second instead of minutes.
*Study it again* and *Hear it again* do them afresh.

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
| Sound | Voice only for the first 18.7 s, then a low bed under it (about 16 dB down) to the end. No sound effect to be found in its sound: with the voice taken out (Spleeter's separation, already in the clipper) nothing rises at the cards' moves above any other moment, no two moves share a sound (compared sample by sample against random moments), and the quiet between syllables doesn't fill up there. The file is a 48 kb/s HE-AAC download, so a faint whoosh may have been lost; the edit puts whooshes on the moves anyway (below). |
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
- **Your pictures and clips** (`extras.ts`) are looked at as they come in: a name worth
  matching (the file's, or the page's it was copied from; not a camera's "IMG_2041" or a
  clipboard's "Pasted picture 3"), the words printed on it (read by the text reader that
  reads the reference's captions: a dashboard's brand and amounts), what the clipper's
  picture model sees in it (a car, a jet, money, a party, a screen of text), and so whether
  it's a screenshot or a photo. `know.ts` holds what about 45 people and brands these ads
  show stand for (Iman Gadzhi: agencies and courses; Andrew Tate: get-rich gurus; Stripe:
  payments) and 18 topics as the stems of their words in Danish, Swedish, Norwegian, German
  and English. Each extra shows what the page made of it ("a picture · Iman Gadzhi · about
  agencies, courses, business"), and its name can be typed over ("Stripe sales").
- **Where they go**, with a switch:
  - *Where you talk about them* (the default, `match.ts`): every word of your footage is
    weighed against each picture. Its name said, however the speech model spelt it (names
    are compared by how they sound, over one word more or less than they have: "Imangachi"
    is Iman Gadzhi); a word printed on it said; an amount on it said the way people say
    amounts ("5 millioner danske kroner" is the dashboard's "kr. 5.234.118,00"); what it
    stands for talked about there, more where a sentence is full of it (his photo where
    agencies and courses come up, when his name isn't said). The best fits are taken
    first, each picture once, a second apart unless they're in one sentence (a list said:
    "trading, dropshipping, Amazon FBA", a picture on each). With + Gemini chosen, Gemini
    also reads your script word by word and looks at small copies of your pictures, says
    what each shows and the word it belongs on, quoting the words there (`ai.ts`: a model
    counts words badly and quotes them well, so the quote is found in the script and wins
    over a number that's off); the page's own reading stands in until it answers, and a
    name said outright wins over Gemini finding no place.
  - Each lands on its word in the reference's card for its kind (the reference's screenshot
    card for a screenshot, its photo card for a photo: shape, corners, way in and out), for
    as long as its sentence goes on (1.3 to 3 s). Pictures said close together follow each
    other as a run (the first slides in, the next cut in, the last slides out); a clip goes
    full frame, the way the reference's cutaway does.
  - Pictures nothing is said of fill the reference's own cards and cutaways, in order
    (clips to cutaways and clip cards first), where there's room around the placed ones: a
    card of the reference's waits for one to go, and is left out rather than wait over 2 s.
  - Every picture shows where it went and why ("at 0:22 · you say the 5.234.118 on it ·
    'Så jeg nu starter min virksomhed...'"), and can be moved to any sentence, put in the
    reference's cards, or left out.
  - *As in the reference*: your pictures in the reference's cards and cutaways in your
    order (or as you pick per slot), at the same point of the talk: the hook's (the first
    5 s) to the second, later ones at the same share of the speech through, on a caption's
    first word. A run of the reference's keeps its gaps, and nothing lands on top of
    anything else. Its cards and cutaways can also be moved to any of your sentences.
  - Each picture is cropped to its card's shape about its subject (a face).
- **Zooms** step between wide and close (the reference's close level) where the
  reference's do, at the same share of the talk, and jump at every cut in your footage (so
  a jump cut reads as a punch-in, the way the reference hides its own).
- **Framing**: when both faces are found, the footage is cropped (up to 1.3 times) so the
  face is as big, and where, the reference has it.
- **Sound effects** (`sfx.ts`, made in the page: whoosh, swipe, pop, click, boom, riser,
  ding, cash register; or your own files), with a switch: none; *on the moves* (a whoosh
  peaking as a card lands, moving across from the side it comes in from, a softer one as
  it leaves, a swipe as a run's picture changes, a whoosh into each cutaway, or the
  reference's own sounds on these where it has some); or *moves and script* (and a cash
  register where money is said, or, with + Gemini, the moments Gemini picks: a ding on a key
  number, a boom on a big claim). Each sits at a set loudness against the voice's talking
  (8 dB under, then its own level and the effects' level). Every one can be heard, moved
  (dragged along the Sound timeline), given another sound or level, or taken out, and your
  changes stay with what it's on when the edit is planned again; add your own anywhere.
- **Music**: from where the reference's bed came in (or the top), as far under the voice,
  from any point of the song, up or down as a whole, and shaped stretch by stretch on the
  Sound timeline: a volume line with points to drag (click the music's lane for a point,
  drag it up or down, double-click to take it out), the way an editor keyframes it.
- **Listening before making**: the Sound card mixes the edit's sound (voice, music, effects,
  all at -14 LUFS as the render will be) and plays it from any moment; the voice and music
  are decoded once, so a change is heard again within a second.
- **Ending**: the reference's black, if it has one (a switch).

`render.ts` draws each frame on a canvas (footage or cutaway, cards, captions) and encodes
it with WebCodecs, H.264 and AAC in MP4 where the browser can.

The captions can be seen before any of that: the Captions card draws one of your captions
over a frame of your footage (framed as the edit frames it) in the look as it's set, redrawn
as you change it, stepping through the captions and playing one coming on word by word.

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
