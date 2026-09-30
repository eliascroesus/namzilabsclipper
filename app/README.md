# The clipper app

A static site. Everything runs in the browser: there is no server.

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # typecheck, then dist/ for hosting
```

## How an edit gets made

```
drop files ─► media/sources   read in place with Mediabunny (MP4, MOV, WebM, MKV, MP3, WAV, images)
            ─► media/scan      each clip skimmed several times a second: sharpness, exposure, colour,
                               movement, people, shot changes, where the subject sits, black bars;
                               numbered contact sheets as it goes (vision/sheets)
            ─► vision/sense    the picture model (TinyCLIP) says what every sheet frame shows,
                               how much it flexes and how striking it is, and keeps its
                               embedding (what two shots have in common)
            ─► vision/look     smart picks with a key: Gemini rates the sheets instead
            ─► ai/sponsorblock a YouTube file's sponsor reads, intro and outro, when its name has the ID
drop sound ─► audio/song       librosa's onset envelope, tempo and beat tracker (ported exactly),
                               and when the song keeps one tempo, a steady grid at it (audio/grid);
                               bar lines, accents, loudness, drops
            ─► audio/attacks   where each hit starts, in 3 ms steps: the beats and accents move
                               onto the starts (the envelope has them 25 to 55 ms late)
            ─► audio/structure the song bar by bar: sections, breaks, four-bar phrases
            ─► audio/vocals    where the singing is (Spleeter's vocal network), each sung line's
                               start and its syllables; the structure is rebuilt with them
            ─► plan/*          the format decides: where to cut (to the beat and the song's shape),
                               the selects and which moment fills each slot (and keeps a batch's
                               edits apart), the flourish, captions, the card, the music from
                               where the song timeline says
            ─► plan/settle     every frame the edit uses looked at for the footage's own cuts
                               (media/cuts), and the edit planned again around any it finds
            ─► vision/track    face tracking: each shot looked at 8 times a second for faces
                               (vision/faces, YuNet on ONNX Runtime Web), the crop path from
                               plan/framing
            ─► render/*        per frame: decode (WebCodecs) → WebGL2 compositor (crop, grade,
                               effects) → captions and card from a 2D canvas → encode (WebCodecs)
                               → MP4 via Mediabunny; the soundtrack mixed and mastered to -14 LUFS
```

The Mimic page (`mimic.html`, `src/mimic/`) is its own flow:

```
reference ─► analyze/source     the video's frames (every one, small and gray), pictures at chosen times, its sound
            ─► analyze/cards     rectangles of straight edges followed frame by frame: cards, their runs and motions
            ─► analyze/shots     cuts (most of the frame changing at once), talking footage and cutaways
            ─► analyze/zoom      each frame against the last, scaled: punch-ins and pull-outs
            ─► analyze/ocr       PP-OCRv4 (detector and recogniser) on ONNX Runtime Web
            ─► analyze/captions  the caption band, then its lines' letters: size, fit, colour, outline or
                                 shadow, lines, how they come on
            ─► analyze/sound     voice, a bed under it, sounds on events
            ─► analyze/reference all of it as a template (types.ts)
footage   ─► asr/*               Parakeet TDT v3 in a worker (fbank, encoder, token-and-duration search),
                                 words fixed by hand or Gemini keeping their times (align, gemini)
            ─► plan              the template applied: segments, captions (captions.ts), cards, cutaways,
                                 zooms, framing, sounds (sfx.ts), music, ending
            ─► render            per frame on a canvas, encoded with WebCodecs; the mix at -14 LUFS
```

Story adds a listening step first: `audio/speech` finds where people talk and packs the sound as MP3, `ai/gemini` + `story/story` transcribe it and pick the moments, and `plan/story` builds the clip.

## The code

| Folder | What |
|---|---|
| `src/engine/audio/` | `dsp` (FFT, mel, onset strength), `rhythm` (tempo, beats, onsets: librosa 0.11 exactly), `grid` (the steady beat grid: the exact tempo from the onset envelope's long-range repeats, the right level of the beat, the beat on the kick and snare rather than the hats, and a check that the drums keep to it all the way through; without one, the tempo the song's standout hits keep), `song` (bar lines, accents, drops, best section), `attacks` (where the hits start, and how far the grid sits from them), `structure` (bars, sections, breaks, phrases), `vocals` (the singing: Spleeter's vocal network on the song's own spectrogram, sung lines and syllables), `resample` (streaming sinc), `speech` (voice detection, pause cutting, MP3) |
| `src/engine/media/` | `sources` (open files, decode audio), `scan` (per-frame measurements, shot changes, black bars, interest scores), `cuts` (a stretch of a video looked at frame by frame for its cuts) |
| `src/engine/plan/` | `types` (the edit plan, and the speed-ramp time map), `rhythm` (where the cuts go: every two beats into the drop, one two-bar pattern from the song's own hits after it, clips carried over a beat and re-cut on the half beat), `montage` (music window, the selects and slot filling, clips re-cut on the beat, variety within an edit and across a batch, jump cuts kept out, velocity ramps, finishing; the montage format), `formats` (twist, meme), `story`, `framing` (black bars, following faces, the camera path), `settle` (planning again until no shot runs over one of its source's cuts) |
| `src/engine/vision/` | `faces` (YuNet face detector), `track` (face tracking through a plan's shots), `sheets` (contact sheets), `sense` (the picture model: kind, flex, wow and an embedding per frame, without a key), `look` (smart picks: the ratings, Gemini's or the picture model's, remembered per file) |
| `src/engine/render/` | `gl` (the WebGL2 compositor and its shaders: crop, grade, flash, burn, shake, zoom blur), `card` (the demo card), `captions` (six styles), `mix` (soundtrack, loudness, limiter), `export` (FramePainter, punch-ins, stills, the encode loop) |
| `src/engine/ai/`, `src/engine/story/` | The Gemini client and SponsorBlock; transcription and moment picking |
| `src/ui/` | `studio` (state and actions), `App` and `components/` (panels, results), `kit` (brand kit storage), `styles.css` |
| `src/mimic/` | The Mimic page: `analyze/` (studying a reference), `asr/` (the speech model and its worker, fixing words), `captions`, `plan`, `match` (placing cards by the footage's script), `ai` (Gemini placing them and picking moments for sounds), `render` (frames and the mix), `audio` (music decoded in stereo), `sfx`, `types`, `ui/` (`store`, `MimicApp`, `CaptionPreview`, `SoundCard`, `paste`, `mimic.css`), `main.tsx` |
| `src/harness.ts`, `harness.html` | A bare page the browser tests drive |

## Tests

- `npm test` runs the unit tests: DSP parity with librosa (on the reference songs, when their fixtures are present), the steady beat grid (drum-machine grooves from house to drum & bass, a tempo change and a drifting live band that must keep the tracker, a sparse song played by hand with finger snaps on 2 and 4 that the tracker used to hear at 115 bpm, and a 134 bpm garage track and clips of it and nio.trade's snap sound when the fixtures are present), where the hits start (a clap, a kick and a bell traced back to their starts; beats read late moved onto the hits, on a straight beat and a broken one), the song's shape (a break heard, held through and cut on its return, a build into it that holds back, two beats a shot or more, and a quicker pace after the drop, a sung verse given room, the same cuts in every two bars after the drop, a beat with nothing on it passed over as mico's editor does, a clip re-cut on the half beat, jumping on and punching in, a broken beat's kicks cut on after the drop), a long video's own cuts found (through a shaky stretch, between two dark shots, on its key frames when they come where its scenes change) and planned around, the resampler, loudness and limiter, the planners (the selects over filler, variety by what the shots show, a long stretch of one car not taking over, no jump cuts, a dim club passed over for the first frame, five edits from one 40 minute video staying apart, three from a minute and a half of video never showing each other's opening, drop or last shot, the user's own end card video played whole), the picture model's ratings (a frame too dark to read counting for less), framing (black bars, following a face), smart picks and SponsorBlock with the network stubbed, speech detection.
- `node e2e/run.mjs montage '<json>' --out DIR` renders edits through the harness in headless Chromium (plan, stills, or full renders; `"faces": true` follows faces; the picture and vocal models and the check for the footage's own cuts run as in the app, `"sense": false`, `"vocals": false` and `"settle": false` skip them; `"dump": true` saves the analysed song and footage as JSON with the contact sheets, to tune the planner outside the browser). `node e2e/run.mjs faces '["<video>", [times]]'` runs the face detector on frames. Set `CHROMIUM_PATH` if Chromium isn't at `/opt/pw-browsers/chromium`, and `E2E_DIST=<a vite build>` to run against a built copy (an edit to the sources then can't reload a long run halfway; `ui`, `smart` and `manage` take it too).
- `node e2e/ui.mjs`, `node e2e/story.mjs`, `node e2e/smart.mjs` and `node e2e/manage.mjs` use the real UI like a person would and screenshot each step; the story and smart picks tests answer Gemini's calls with a stand-in, so no key is needed, and the manage test drives the song timeline (moving the stretch, stepping it a bar, back to automatic, dragging its right edge to set the length) and deletes edits (waiting, being made, finished).

- The Mimic page's tests: `mimic-asr` (the speech features against kaldi-native-fbank, the token-and-duration search on a scripted model, words from tokens, and the real model on the example footage when a copy is in `tests/fixtures/parakeet-v3`), `mimic-ocr` (text boxes from the detector's map, CTC reading, and the example ad's caption lines where RapidOCR finds them), `mimic-cards` (a card sliding in, swapping twice and sliding out; the example ad's ten cards), `mimic-zoom`, `mimic-captions` (the caption look from word-by-word samples, fitted and not; the example ad's), `mimic-plan` (captions from words, fixing words, zoom keys, a card's motion, the plan, sound effects on the moves and the user's changes to them, runs moved by the script, the music's line), `mimic-match` (sentences, placing by words, topics and names, money for a cash register, sound effects in the mix), `mimic-ai` (Gemini's placements and sounds, against a stand-in), `mimic-paste`. `E2E_DIST=<a vite build> node e2e/mimic.mjs --ref <video> --raw <video> [--extra <file>...] [--music <file>] [--clip] [--placement script] [--sfx none|moves|script] [--fake-gemini] [--ui-check] [--mix] [--time-mix] --out DIR` uses the page like a person would (with the speech model at `<build>/models/parakeet-v3`) and saves the template, the plan, screenshots, the mixed sound and the finished edit; `--fake-gemini` answers the page's Gemini calls itself, `--ui-check` drags a dip into the music's volume line and a sound effect along the timeline.

The librosa fixtures and the test footage are other creators' media, so they stay out of git (`tests/fixtures/`, `test-media/`). To rebuild the fixtures, decode a song to 22,050 Hz mono float32 and save librosa's `onset_strength`, `feature.tempo`, `beat.beat_track`, `onset.onset_detect` and `feature.rms` output next to it (see `tests/audio.test.ts` for the fields).

## Browsers

Built for Chrome (desktop), which has WebCodecs, WebGL2, and on a Mac hardware H.264 and AAC encoding. Where a browser can't encode AAC, a small WASM encoder loads on demand; where it can't encode H.264, edits come out as WebM (VP9 + Opus) with a notice. The models run on ONNX Runtime's WebAssembly build (about 14 MB, once, cached by the browser) from `public/models`: YuNet for faces (230 KB), TinyCLIP's 8M image encoder with 8-bit weights for the picture model (9 MB, with its text side precomputed in `tinyclip-text.json`) and Spleeter's vocal network (20 MB), all MIT (see the `*-LICENSE.txt` files there). The Mimic page adds PP-OCRv4's text detector and recogniser (15.6 MB, Apache 2.0) and, for hearing the footage, NVIDIA's Parakeet TDT 0.6B v3 (670 MB, CC BY 4.0), which the deploy fetches from sherpa-onnx's release and serves from `models/parakeet-v3/` (the browser keeps it after the first time). Safari and Firefox are untested.
