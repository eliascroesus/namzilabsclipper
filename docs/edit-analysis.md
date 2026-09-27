# The reference edits, taken apart

Eight Reels in [`reference-edits/`](../reference-edits/), measured with [`tools/analyze_edit.py`](../tools/analyze_edit.py) (every cut, the beat grid, motion, brightness, loudness, where there's speech) and then reviewed frame by frame. This is what the clipping machine has to reproduce.

## At a glance

| Edit | Length | Frame | Shots | Median shot | Tempo | Cuts on the beat ¹ | Speech | Format |
|---|---|---|---|---|---|---|---|---|
| nio_trade …1290 | 25.2s | 4:3 (960×720) | 28 | 0.70s | 112 | 26% (56% on an accent) | 91% | Story: dialogue, then a flex burst, then the demo card |
| nio_trade …6955 | 27.7s | 4:3 | 9 | 0.57s | 112 | 25% (50%) | 84% | Reaction: a screen recording with the trader's voice, flex burst, card |
| nio_trade …3659 | 19.6s | 4:3 | 27 | 0.43s | 103 | 12% (31%) | 9% | Music montage with lyric captions, card |
| nio_trade …8678 | 34.1s | 4:3 | 42 | 0.63s | 118 | 17% (24%) | 0% | Montage under one POV caption, a flashback twist, card |
| mico17777 | 12.5s | 9:16 | 18 | 0.47s | 152 | **71%** (76%) | 0% | Lifestyle montage cut on the song's accent pattern |
| gillioniare …9336 | 11.2s | 9:16 | 1 | n/a | 136 | n/a | sung | Text meme over one clip |
| gillioniare …7613 | 8.6s | 9:16 | 1 | n/a | 118 | n/a | sung | Text meme: a list that turns on its last line |
| xxzezedongoxx | 28.7s | 9:16 | 5 | 4.83s | n/a | n/a | 87% | Raw first-person walkaround with talking |

¹ Share of cuts within one frame (±50 ms) of a detected beat; in brackets, of any musical accent (onset). Speech is the share of the running time a voice-activity model marks as speech, so a sung track can read as speech.

**The split that matters:** montages are cut to the music (mico: 71% of cuts within a frame of the beat), while the Nio story clips are cut to the *dialogue* and only their flex bursts hit the music. A machine that snaps every cut to the beat would make the story clips worse.

## The four formats

### 1. Story clip (nio …1290, nio …8678)

The best-performing shape in the set, and the one to build first for promo clips.

| Time | What happens |
|---|---|
| 0.0 to 0.5s | **The hook, as text on black.** "kimchi, you made $2M at 18". The footage fades up underneath it over about 0.5s |
| 0.5 to ~16s | **The story.** 2 to 5 lines of real dialogue from a vlog, one shot per line (about 1.2 to 1.5s each), handheld footage with its own movement. A turn in the middle: "but you kind of made it?" / "nah" / "hell nah" / "not yet" |
| ~16 to 21.5s | **The payoff burst.** Proof and flex at 2 to 15 frames a shot: a trading screen with the number, a PnL card ("TRUMP +$40M"), the tweet, a club, cars, a private jet |
| 21.7s to the end | **The demo card** (below) |

The variant (nio …8678) hangs one caption over the whole montage, "kimchi after retiring:", then flips it: "kimchi 3 days before retiring:" over the apartment footage, with a green "+$40M" label on the trading monitor as the reveal.

### 2. Reaction (nio …6955)

Hook on black ("im down 600k"), then 12.6s of a screen recording (a memecoin chart in a trading terminal) with the trader's live voice. Captions follow the voice, and the shouting goes to capitals: "BUY EVERYONE BUY", "ACTUALLY RIGHT NOW ACTUALLY RIGHT NOW". Then the same flex burst and the card, held longer here (8.7s).

### 3. Music montage (mico17777, nio …3659)

- 15 to 20 clips of 0.4 to 1.2s, hard cuts.
- The cuts follow the song's accent pattern, not every beat. mico's shots run **1, 1, 2, 1, 3 beats** and repeat, at 152 bpm, and 71% of its cuts land within one frame of the beat.
- One caption held for the whole edit (a small italic serif "Peak life.", centred) or lyrics word by word (nio …3659: "she say", "ur the worst", in a tall condensed face, placed off-centre).
- At most one special transition: a crossfade double exposure (nio …3659, 7.0s) or a warm film-burn flash of 3 to 4 frames (nio …8678, 26.1s).

### 4. Text meme (gillioniare ×2)

One held clip of 8 to 11s, a fade up from black over about a second, and a block of small bold white text in the upper third: a setup and punchline ("when she tries to talk to me / but all i hear in my head is this..") or a list that turns on its last line ("Puffy eyebags / 5 hours of sleep / 80 hour work weeks / … / And then "is this your 812?""). The song carries it. No cuts at all.

*xxzezedongoxx* is raw footage rather than an edit: long handheld orbits of a car in the fog, with the owner talking. Useful as a source type, not as a template.

## Craft rules, measured

- **Hook on frame one.** Every Nio clip opens with its caption on black before any footage. Nothing opens on a logo.
- **Cut to what's driving the moment:** the phrase in dialogue, the accent in music. Montage cuts land within a frame of an accent; story cuts ignore the beat grid.
- **Speed up with jump cuts.** Inside one scene, dead frames are cut out (the jet cabin, nio …8678 at 10s: five cuts in half a second).
- **Transitions are rare.** Hard cuts almost everywhere. A dip to black before the card. At most one flourish per edit (film burn, crossfade).
- **The movement is in the footage.** Walking shots, gimbal moves and handheld energy, not added zooms. The only added move is the card's slow pull-out.
- **Music under everything.** It runs under the dialogue, carries on under the card, and fades out with the picture. The master is loud: −11 to −16 dBFS RMS.
- **Warm, cinematic grade** on all the Nio footage.
- **Nio posts in 4:3 landscape** (960×720), keeping the YouTube framing whole instead of cropping to 9:16.
- **Lengths:** montages 12 to 20s, stories and reactions 25 to 34s, memes 8 to 11s.

## Caption styles

| # | Style | Where | Free font to match |
|---|---|---|---|
| 1 | Documentary subtitle: lowercase, white on a tight black box, bottom centre, about 3.5% of frame height | nio dialogue | Inter 500 (it's Instagram's "Classic" text with its background on) |
| 2 | POV label: held over the whole montage, white on a black box | nio …8678 | Oswald or Roboto Condensed |
| 3 | Shout: ALL CAPS, white on a black box | nio …6955 | Inter 500 |
| 4 | Lyric: tall condensed words, white with a thin dark outline, one or two at a time, placed off-centre | nio …3659 | League Gothic or Oswald |
| 5 | Mood line: a small italic serif, white, centred, held throughout | mico | Instrument Serif Italic |
| 6 | Meme block: small bold white sans, centred lines in the upper third, soft shadow | gillioniare | Inter 700 |

## The demo card (the nio.trade end card)

The same card closes all four Nio clips.

- **Entrance:** the last shot dims to black over 3 frames, one frame of black, then the card fades in over 8 frames (0.27s).
- **Layout** (on the 960×720 frame):
  - a space-grey MacBook, centred, 500 px wide (52% of the frame), showing a still of the product's landing page
  - the call to action above it: "join the waitlist", lowercase, medium weight, white, about 34 px
  - the address below it: "nio.trade", about 36 px
  - a hand-drawn blue arrow (about #5465FF, 9 px stroke, round caps) from just left of the call to action, out about 80 px past the laptop's left side and back in, landing with a small arrowhead just left of the address
- **Motion:** the whole card slowly pulls out while it holds, about 0.05% a frame (5 to 12% over the card). Nothing else moves.
- **Hold:** 3.5s, 8.7s, 4.5s and 3.9s in the four clips.
- **Exit:** a fade to black over 0.4 to 2s, with the music fading alongside it.

[`templates/endcard/laptop.html`](../templates/endcard/laptop.html) reproduces it with every value as a parameter (image on the screen, the two lines, arrow colour, frame shape, duration, and an optional draw-on for the arrow), rendered by [`tools/render_html.py`](../tools/render_html.py).
