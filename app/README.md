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
                               movement, people, shot changes, where the subject sits
drop sound ─► audio/song       librosa's onset envelope, tempo and beat tracker (ported exactly),
                               bar lines, accents, loudness, drops
            ─► plan/*          the format decides: where to cut, which moment fills each slot,
                               the flourish, captions, the card, the music
            ─► render/*        per frame: decode (WebCodecs) → WebGL2 compositor (crop, grade,
                               effects) → captions and card from a 2D canvas → encode (WebCodecs)
                               → MP4 via Mediabunny; the soundtrack mixed and mastered to -14 LUFS
```

Story adds a listening step first: `audio/speech` finds where people talk and packs the sound as MP3, `ai/gemini` + `story/story` transcribe it and pick the moments, and `plan/story` builds the clip.

## The code

| Folder | What |
|---|---|
| `src/engine/audio/` | `dsp` (FFT, mel, onset strength), `rhythm` (tempo, beats, onsets: librosa 0.11 exactly), `song` (bar lines, accents, drops, best section), `resample` (streaming sinc), `speech` (voice detection, pause cutting, MP3) |
| `src/engine/media/` | `sources` (open files, decode audio), `scan` (per-frame measurements, shot changes, interest scores) |
| `src/engine/plan/` | `types` (the edit plan), `montage` (music window, cut grid, slot filling, finishing; the montage format), `formats` (twist, meme), `story` |
| `src/engine/render/` | `gl` (the WebGL2 compositor and its shaders), `card` (the demo card), `captions` (six styles), `mix` (soundtrack, loudness, limiter), `export` (FramePainter, stills, the encode loop) |
| `src/engine/ai/`, `src/engine/story/` | The Gemini client; transcription and moment picking |
| `src/ui/` | `studio` (state and actions), `App` and `components/` (panels, results), `kit` (brand kit storage), `styles.css` |
| `src/harness.ts`, `harness.html` | A bare page the browser tests drive |

## Tests

- `npm test` runs the unit tests: DSP parity with librosa (on the reference songs, when their fixtures are present), the resampler, loudness and limiter, the planners, speech detection.
- `node e2e/run.mjs montage '<json>' --out DIR` renders edits through the harness in headless Chromium (plan, stills, or full renders). Set `CHROMIUM_PATH` if Chromium isn't at `/opt/pw-browsers/chromium`.
- `node e2e/ui.mjs` and `node e2e/story.mjs` use the real UI like a person would and screenshot each step; the story test answers Gemini's calls with a stand-in, so no key is needed.

The librosa fixtures and the test footage are other creators' media, so they stay out of git (`tests/fixtures/`, `test-media/`). To rebuild the fixtures, decode a song to 22,050 Hz mono float32 and save librosa's `onset_strength`, `feature.tempo`, `beat.beat_track`, `onset.onset_detect` and `feature.rms` output next to it (see `tests/audio.test.ts` for the fields).

## Browsers

Built for Chrome (desktop), which has WebCodecs, WebGL2, and on a Mac hardware H.264 and AAC encoding. Where a browser can't encode AAC, a small WASM encoder loads on demand; where it can't encode H.264, edits come out as WebM (VP9 + Opus) with a notice. Safari and Firefox are untested.
