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
            ─► audio/structure the song bar by bar: sections, breaks, four-bar phrases
            ─► audio/vocals    where the singing is (Spleeter's vocal network), each sung line's
                               start and its syllables; the structure is rebuilt with them
            ─► plan/*          the format decides: where to cut (to the beat and the song's shape),
                               the selects and which moment fills each slot (and keeps a batch's
                               edits apart), the flourish, captions, the card, the music from
                               where the song timeline says
            ─► vision/track    face tracking: each shot looked at 8 times a second for faces
                               (vision/faces, YuNet on ONNX Runtime Web), the crop path from
                               plan/framing
            ─► render/*        per frame: decode (WebCodecs) → WebGL2 compositor (crop, grade,
                               effects) → captions and card from a 2D canvas → encode (WebCodecs)
                               → MP4 via Mediabunny; the soundtrack mixed and mastered to -14 LUFS
```

Story adds a listening step first: `audio/speech` finds where people talk and packs the sound as MP3, `ai/gemini` + `story/story` transcribe it and pick the moments, and `plan/story` builds the clip.

## The code

| Folder | What |
|---|---|
| `src/engine/audio/` | `dsp` (FFT, mel, onset strength), `rhythm` (tempo, beats, onsets: librosa 0.11 exactly), `grid` (the steady beat grid: the exact tempo from the onset envelope's long-range repeats, the right level of the beat, the beat on the kick and snare rather than the hats, and a check that the drums keep to it all the way through), `song` (bar lines, accents, drops, best section), `structure` (bars, sections, breaks, phrases), `vocals` (the singing: Spleeter's vocal network on the song's own spectrogram, sung lines and syllables), `resample` (streaming sinc), `speech` (voice detection, pause cutting, MP3) |
| `src/engine/media/` | `sources` (open files, decode audio), `scan` (per-frame measurements, shot changes, black bars, interest scores) |
| `src/engine/plan/` | `types` (the edit plan, and the speed-ramp time map), `montage` (music window, the cut plan by section, the selects and slot filling, variety within an edit and across a batch, jump cuts kept out, velocity ramps, finishing; the montage format), `formats` (twist, meme), `story`, `framing` (black bars, following faces, the camera path) |
| `src/engine/vision/` | `faces` (YuNet face detector), `track` (face tracking through a plan's shots), `sheets` (contact sheets), `sense` (the picture model: kind, flex, wow and an embedding per frame, without a key), `look` (smart picks: the ratings, Gemini's or the picture model's, remembered per file) |
| `src/engine/render/` | `gl` (the WebGL2 compositor and its shaders: crop, grade, flash, burn, shake, zoom blur), `card` (the demo card), `captions` (six styles), `mix` (soundtrack, loudness, limiter), `export` (FramePainter, punch-ins, stills, the encode loop) |
| `src/engine/ai/`, `src/engine/story/` | The Gemini client and SponsorBlock; transcription and moment picking |
| `src/ui/` | `studio` (state and actions), `App` and `components/` (panels, results), `kit` (brand kit storage), `styles.css` |
| `src/harness.ts`, `harness.html` | A bare page the browser tests drive |

## Tests

- `npm test` runs the unit tests: DSP parity with librosa (on the reference songs, when their fixtures are present), the steady beat grid (drum-machine grooves from house to drum & bass, a tempo change and a drifting live band that must keep the tracker, and a 134 bpm garage track and clips of it when the fixture is present), the song's shape (a break heard, held through and cut on its return, a sung verse given room), the resampler, loudness and limiter, the planners (the selects over filler, variety by what the shots show, no jump cuts, five edits from one 40 minute video staying apart), the picture model's ratings, framing (black bars, following a face), smart picks and SponsorBlock with the network stubbed, speech detection.
- `node e2e/run.mjs montage '<json>' --out DIR` renders edits through the harness in headless Chromium (plan, stills, or full renders; `"faces": true` follows faces; the picture and vocal models run as in the app, `"sense": false` and `"vocals": false` skip them; `"dump": true` saves the analysed song and footage as JSON with the contact sheets, to tune the planner outside the browser). `node e2e/run.mjs faces '["<video>", [times]]'` runs the face detector on frames. Set `CHROMIUM_PATH` if Chromium isn't at `/opt/pw-browsers/chromium`, and `E2E_DIST=<a vite build>` to run against a built copy (an edit to the sources then can't reload a long run halfway; `ui`, `smart` and `manage` take it too).
- `node e2e/ui.mjs`, `node e2e/story.mjs`, `node e2e/smart.mjs` and `node e2e/manage.mjs` use the real UI like a person would and screenshot each step; the story and smart picks tests answer Gemini's calls with a stand-in, so no key is needed, and the manage test drives the song timeline and deletes edits (waiting, being made, finished).

The librosa fixtures and the test footage are other creators' media, so they stay out of git (`tests/fixtures/`, `test-media/`). To rebuild the fixtures, decode a song to 22,050 Hz mono float32 and save librosa's `onset_strength`, `feature.tempo`, `beat.beat_track`, `onset.onset_detect` and `feature.rms` output next to it (see `tests/audio.test.ts` for the fields).

## Browsers

Built for Chrome (desktop), which has WebCodecs, WebGL2, and on a Mac hardware H.264 and AAC encoding. Where a browser can't encode AAC, a small WASM encoder loads on demand; where it can't encode H.264, edits come out as WebM (VP9 + Opus) with a notice. The models run on ONNX Runtime's WebAssembly build (about 14 MB, once, cached by the browser) from `public/models`: YuNet for faces (230 KB), TinyCLIP's 8M image encoder with 8-bit weights for the picture model (9 MB, with its text side precomputed in `tinyclip-text.json`) and Spleeter's vocal network (20 MB), all MIT (see the `*-LICENSE.txt` files there). Safari and Firefox are untested.
