# The reference edits, taken apart

Thirteen Reels in [`reference-edits/`](../reference-edits/), measured with [`tools/analyze_edit.py`](../tools/analyze_edit.py) (every cut, the beat grid, motion, brightness, loudness, where there's speech) and then reviewed frame by frame. This is what the clipping machine has to reproduce.

## At a glance

| Edit | Length | Frame | Shots | Median shot | Tempo | Cuts on the beat ¹ | Speech | Format |
|---|---|---|---|---|---|---|---|---|
| nio_trade …1290 | 25.2s | 4:3 (960×720) | 28 | 0.70s | 86 | 41% | 91% | Story: dialogue, then a flex burst, then the demo card |
| nio_trade …6955 | 27.7s | 4:3 | 9 | 0.57s | 112 | 62% | 84% | Reaction: a screen recording with the trader's voice, flex burst, card |
| nio_trade …3659 | 19.6s | 4:3 | 27 | 0.43s | 155 | 42% (73% on its editor's grid) | 9% | Music montage with lyric captions, card |
| nio_trade …8678 | 34.1s | 4:3 | 42 | 0.63s | 87 | 32% | 0% | Montage under one POV caption, a flashback twist, card |
| nio_trade …0002 | 11.5s | 4:3 | 22 | 0.38s | 156 | 48% | n/a | Montage: a burst of tilted photos, then flex about a beat a shot, card |
| nio_trade …5448 | 24.7s | 4:3 | 38 | 0.47s | 110 | 43% | n/a | Story: a Ferrari on Rodeo Drive under subtitled dialogue, one clip cut on the words, then a flex burst, card |
| nio_trade …2531 | 19.0s | 4:3 | 41 | 0.27s | 143 | 40% | n/a | The same story cut faster: the Ferrari eight times in two seconds, a flip from black and white to colour, the PnL card, card |
| mico17777 | 12.5s | 9:16 | 18 | 0.47s | 148 | **94%** | 0% | Lifestyle montage cut on the song's accent pattern |
| gillioniare …9336 | 11.2s | 9:16 | 1 | n/a | 136 | n/a | sung | Text meme over one clip |
| gillioniare …7613 | 8.6s | 9:16 | 1 | n/a | 118 | n/a | sung | Text meme: a list that turns on its last line |
| xxzezedongoxx | 28.7s | 9:16 | 5 | 4.83s | n/a | n/a | 87% | Raw first-person walkaround with talking |
| brezscales …1216 | 21.5s | 9:16 | 9 | 1.60s | 92 | 12% (38%) | music | Twist: a night supercar montage under "what they see vs...", then one long shot of a dark room and a desk under "what they don't..." |
| brezscales …9528 | 8.4s | 1:1 (720×720) | 1 | n/a | 144 | n/a | music | Text meme, square: one handheld night shot, a centred block of small bold text |

¹ Share of cuts within 1.5 frames (50 ms) of a beat on the song's own grid (the app's, the beats where the hits start; see [the rhythm](#the-rhythm-cut-by-cut-against-each-songs-grid)). Speech is the share of the running time a voice-activity model marks as speech, so a sung track can read as speech.

**The split that matters:** montages are cut to the music (mico: 94% of cuts within 1.5 frames of the beat), while the Nio story clips are cut to the *dialogue* and only their flex bursts hit the music. A machine that snaps every cut to the beat would make the story clips worse.

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
- The cuts follow the song's accent pattern, not every beat. mico's shots run **1, 1, 2, 1, 3 beats** and repeat, at 148 bpm, and 16 of its 17 cuts land within 1.5 frames of the beat.
- One caption held for the whole edit (a small italic serif "Peak life.", centred) or lyrics word by word (nio …3659: "she say", "ur the worst", in a tall condensed face, placed off-centre).
- At most one special transition: a crossfade double exposure (nio …3659, 7.0s) or a warm film-burn flash of 3 to 4 frames (nio …8678, 26.1s).

### 4. Text meme (gillioniare ×2)

One held clip of 8 to 11s, a fade up from black over about a second, and a block of small bold white text in the upper third: a setup and punchline ("when she tries to talk to me / but all i hear in my head is this..") or a list that turns on its last line ("Puffy eyebags / 5 hours of sleep / 80 hour work weeks / … / And then "is this your 812?""). The song carries it. No cuts at all.

The square variant (brezscales …9528) puts the block dead centre, narrow (about 40% of the frame's width, four short lines: "It's rare, but some / people truly want to / see you win and / Im one of them:)") over a handheld, shallow-focus night shot of someone talking, with the music replacing their voice.

### 5. Twist (brezscales …1216)

The contrast format, and a natural promo: the flex, then the work behind it.

| Time | What happens |
|---|---|
| 0 to 13.9s | **What they see:** night POV footage of supercars on the causeway, a Lamborghini at sunset, Porsches beside a private jet, a garage of cars. 8 shots of 0.3 to 4 seconds, held longer than a montage (median 1.6s), under a small centred caption, "what they see vs..." |
| 13.9s to the end | **What they don't:** a hard cut to one 7.6 second shot of a dark room lit red, someone at a desk with two screens, under "what they don't...". The screen at the end shows the chart |

No transitions and no flourish: the flip is the event. nio.trade's …8678 does the same turn with its caption ("kimchi after retiring:" to "kimchi 3 days before retiring:"). For a product, the second act is where the demo goes: the screen, the dashboard, the work.

*xxzezedongoxx* is raw footage rather than an edit: long handheld orbits of a car in the fog, with the owner talking. Useful as a source type, not as a template.

## The rhythm, cut by cut against each song's grid

Three more nio.trade Reels came in (…0002, …5448, …2531; two more uploads were copies of …1290 and …8678). Every cut of the eight music edits was then measured against its song's exact beat grid (the app's own analyzer, the beats put where the hits start), sorted into beats, "and"s and sixteenths, and checked for whether it goes to a new clip or re-cuts the one before (the colours and the picture model's view of the frames either side of it both the same).

| Edit | Tempo | Cuts | On the beat ¹ | Shot after the drop (median, longest) | Re-cuts of the clip before |
|---|---|---|---|---|---|
| mico | 148 | 17 | 16 | 0.47 s, 1.23 s: **1, 1, 2, 1, 3 beats, three times over** | none |
| nio …3659 (lyrics) | 155 ² | 26 | 11 (19 on its editor's grid) | 0.37 s, 1.67 s: **every beat** (11 frames, 11, 11, then 13 to stay on it); two beats or more before the drop | 4 (15%) |
| nio …0002 | 156 | 21 | 10 | 0.43 s, 1.13 s: about a beat, after a burst of four photos 3 frames each | 4: a restaurant cut three times in 0.7 s, a club twice |
| nio …2531 | 143 | 40 | 16 | 0.27 s, 1.07 s: half a beat to a beat | 11 (28%): the Ferrari cut eight times (0.07 to 0.83 s), then another street five |
| nio …5448 | 110 | 37 | 16 | 0.40 s, 1.33 s: six half beats in a row right after the drop, then about a beat | 13 (35%) |
| nio …1290 | 86 | 27 | 11 | 0.40 s, 1.27 s | 9 (33%) |
| nio …8678 (snaps) | 87 | 41 | 13 | 0.50 s, 2.80 s (the last shot) | 12 (29%): the jet cabin five times in half a second |

¹ Cuts within 1.5 frames (50 ms) of a beat; by chance about one in four would be. The story edits cut their dialogue to the words ("LARP! LARP!"), not the beat, which is most of the rest.
² The app heard it at 103: its kick falls every beat and a half (a 3-3-2 groove), and a steady grid holds there too. Its editor's cuts sit on 155 (19 of 26 within 50 ms, against 7 by chance), and so does the app now: when a grid 3:2 away keeps the song's hardest hits (on its beats or exactly between them) clearly better, and the drums keep to it at least as tightly, that's the beat.

What that makes the rules:

- **One rhythm from the drop to the end.** The same beats of every two bars (mico's 1, 1, 2, 1, 3 three times; the lyric montage's every beat), each shot about 0.3 to 0.5 s, none after the drop longer than about 1.3 s. Where the song hits between the beats (a syncopated kick), the cut goes there, every time it does; where a beat has nothing on it, the cut passes over it (mico's song hits beats 1, 2, 3, 5 and 6 of every eight, which is exactly where its editor cuts).
- **Before the drop, two beats a shot or more.** On the beat, holding back.
- **Faster means one clip re-cut, not more clips.** A run of two to eight cuts inside one clip, each a jump further into it (the car further down the street, the crowd a moment later), on the half beat or faster: a fifth to a third of all the nio.trade cuts. It's how they get the pace without the footage.
- **On the beat, touches:** photos flying in tilted, three frames each; a shot flipping from black and white to colour on a hit; the drop with a flash or a burn.

## Craft rules, measured

- **Hook on frame one.** Every Nio clip opens with its caption on black before any footage. Nothing opens on a logo.
- **Cut to what's driving the moment:** the phrase in dialogue, the accent in music. Montage cuts land within a frame of an accent; story cuts ignore the beat grid.
- **Speed up with jump cuts.** Inside one scene, dead frames are cut out (the jet cabin, nio …8678 at 10s: five cuts in half a second).
- **Transitions are rare.** Hard cuts almost everywhere. A dip to black before the card. At most one flourish per edit (film burn, crossfade).
- **The movement is in the footage.** Walking shots, gimbal moves and handheld energy, not added zooms. The only added move is the card's slow pull-out.
- **Music under everything.** It runs under the dialogue, carries on under the card, and fades out with the picture. The master is loud: −11 to −16 dBFS RMS.
- **Warm, cinematic grade** on all the Nio footage.
- **Nio posts in 4:3 landscape** (960×720), keeping the YouTube framing whole instead of cropping to 9:16.
- **Lengths:** montages 12 to 20s, stories and reactions 25 to 34s, twists about 20s, memes 8 to 11s.
- **Cut lead:** montage cuts land on the start of the hit. Against an onset detector's beats they look about 45 ms (a frame and a half) early, consistently (mico: every one of its 17 cuts), but those beats sit 40 ms after the hits start; measured against where each hit starts, mico's cuts land a median 3 ms after it, 94% within a frame and a half. The app puts its beats on the hit starts and cuts 12 ms ahead of them.

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
