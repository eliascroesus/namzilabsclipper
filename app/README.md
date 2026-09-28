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
            ─► vision/look     smart picks: Gemini rates the sheets for flex and says what's in them
            ─► ai/sponsorblock a YouTube file's sponsor reads, intro and outro, when its name has the ID
drop sound ─► audio/song       librosa's onset envelope, tempo and beat tracker (ported exactly),
                               and when the song keeps one tempo, a steady grid at it (audio/grid);
                               bar lines, accents, loudness, drops
            ─► plan/*          the format decides: where to cut, which moment fills each slot
                               (and keeps a batch's edits apart), the flourish, captions, the card,
                               the music from where the song timeline says
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
| `src/engine/audio/` | `dsp` (FFT, mel, onset strength), `rhythm` (tempo, beats, onsets: librosa 0.11 exactly), `grid` (the steady beat grid: the exact tempo from the onset envelope's long-range repeats, the right level of the beat, the beat on the kick and snare rather than the hats, and a check that the drums keep to it all the way through), `song` (bar lines, accents, drops, best section), `resample` (streaming sinc), `speech` (voice detection, pause cutting, MP3) |
| `src/engine/media/` | `sources` (open files, decode audio), `scan` (per-frame measurements, shot changes, black bars, interest scores) |
| `src/engine/plan/` | `types` (the edit plan, and the speed-ramp time map), `montage` (music window, cut grid, slot filling and variety across a batch, velocity ramps, finishing; the montage format), `formats` (twist, meme), `story`, `framing` (black bars, following faces, the camera path) |
| `src/engine/vision/` | `faces` (YuNet face detector), `track` (face tracking through a plan's shots), `sheets` (contact sheets), `look` (smart picks: Gemini's ratings, remembered per file) |
| `src/engine/render/` | `gl` (the WebGL2 compositor and its shaders: crop, grade, flash, burn, shake, zoom blur), `card` (the demo card), `captions` (six styles), `mix` (soundtrack, loudness, limiter), `export` (FramePainter, punch-ins, stills, the encode loop) |
| `src/engine/ai/`, `src/engine/story/` | The Gemini client and SponsorBlock; transcription and moment picking |
| `src/ui/` | `studio` (state and actions), `App` and `components/` (panels, results), `kit` (brand kit storage), `styles.css` |
| `src/harness.ts`, `harness.html` | A bare page the browser tests drive |

## Tests

- `npm test` runs the unit tests: DSP parity with librosa (on the reference songs, when their fixtures are present), the steady beat grid (drum-machine grooves from house to drum & bass, a tempo change and a drifting live band that must keep the tracker, and a 134 bpm garage track and clips of it when the fixture is present), the resampler, loudness and limiter, the planners (including five edits from one 40 minute video staying apart), framing (black bars, following a face), smart picks and SponsorBlock with the network stubbed, speech detection.
- `node e2e/run.mjs montage '<json>' --out DIR` renders edits through the harness in headless Chromium (plan, stills, or full renders; `"faces": true` follows faces). `node e2e/run.mjs faces '["<video>", [times]]'` runs the face detector on frames. Set `CHROMIUM_PATH` if Chromium isn't at `/opt/pw-browsers/chromium`, and `E2E_DIST=<a vite build>` to run against a built copy (an edit to the sources then can't reload a long run halfway).
- `node e2e/ui.mjs`, `node e2e/story.mjs`, `node e2e/smart.mjs` and `node e2e/manage.mjs` use the real UI like a person would and screenshot each step; the story and smart picks tests answer Gemini's calls with a stand-in, so no key is needed, and the manage test drives the song timeline and deletes edits (waiting, being made, finished).

The librosa fixtures and the test footage are other creators' media, so they stay out of git (`tests/fixtures/`, `test-media/`). To rebuild the fixtures, decode a song to 22,050 Hz mono float32 and save librosa's `onset_strength`, `feature.tempo`, `beat.beat_track`, `onset.onset_detect` and `feature.rms` output next to it (see `tests/audio.test.ts` for the fields).

## Browsers

Built for Chrome (desktop), which has WebCodecs, WebGL2, and on a Mac hardware H.264 and AAC encoding. Where a browser can't encode AAC, a small WASM encoder loads on demand; where it can't encode H.264, edits come out as WebM (VP9 + Opus) with a notice. Face tracking loads ONNX Runtime's WebAssembly build (about 14 MB, once, cached by the browser) and the 230 KB YuNet model from `public/models` (MIT, see `YUNET-LICENSE.txt`). Safari and Firefox are untested.
