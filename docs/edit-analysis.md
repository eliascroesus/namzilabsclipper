# The reference edits, taken apart

Fourteen Reels in [`reference-edits/`](../reference-edits/), measured with [`tools/analyze_edit.py`](../tools/analyze_edit.py) (every cut, the beat grid, motion, brightness, loudness, where there's speech) and then reviewed frame by frame. This is what the clipping machine has to reproduce. How each one is shaped beyond where it cuts (its colour, its build and drop, its ending) is in [the styles](#the-styles).

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
| tjr …7392 | 16.6s | 1:1 (720×720) | 17 | 0.70s | 129 | 31% ² | sung intro | A calm build (a jet arriving, 1.7 s a shot), a hard cut on the 808 into a money room at 0.57 s a shot, one meme caption over it all, and the first shot again at the end: a loop |

¹ Share of cuts within 1.5 frames (50 ms) of a beat on the song's own grid (the app's, the beats where the hits start; see [the rhythm](#the-rhythm-cut-by-cut-against-each-songs-grid)). Speech is the share of the running time a voice-activity model marks as speech, so a sung track can read as speech.
² On librosa's beats (its song keeps no exact grid); after the drop it cuts on the 808's hits.

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

### The planner against the editors

Each reference edit's song, planned by the app from 0:00 to where its editor's card or last cut comes (the first edit of a batch, with footage standing in), and every planned cut checked against the editor's own (a match within two frames) and against the song's strong hits (onsets at 0.6 of the song's loudest or more). A shot's length is the median over the whole edit, build included. F is how well the planned cuts and the editor's line up (the harmonic mean of the share of planned cuts the editor also made and the share of the editor's cuts the plan has).

| Song | Editor: shot, strong hits cut | Before: shot, hits cut, F | Steady | Hard | Relaxed |
|---|---|---|---|---|---|
| mico (148 bpm) | 0.47 s, 100% | 0.43 s, 71%, 82 | 0.43 s, 100%, 94 | 0.40 s, 100%, 78 | 0.83 s, 100%, 80 |
| nio …3659 (155) | 0.43 s, 55% | 0.40 s, 73%, 55 | 0.40 s, 82%, 49 | 0.40 s, 82%, 53 | 0.77 s, 18%, 33 |
| nio …0002 (156) | 0.33 s, 40% | 0.77 s, 20%, 41 | 0.40 s, 100%, 42 | 0.40 s, 100%, 45 | 0.77 s, 80%, 44 |
| nio …2531 (143) | 0.27 s, 64% | 0.83 s, 43%, 37 | 0.83 s, 50%, 37 | 0.43 s, 79%, 45 | 0.87 s, 29%, 26 |
| nio …5448 (110) | 0.43 s, 83% | 0.83 s, 33%, 41 | 0.80 s, 33%, 39 | 0.57 s, 100%, 56 | 1.10 s, 33%, 32 |
| nio …8678 (87) | 0.63 s, 33% | 0.70 s, 40%, 37 | 0.70 s, 40%, 36 | 0.70 s, 56%, 36 | 0.70 s, 40%, 36 |
| TJR (88) | 0.70 s, 75% | 1.33 s, 38%, 28 | 1.23 s, 50%, 34 | 0.67 s, 50%, 29 | 1.33 s, 38%, 37 |
| nio …1290 (86) | 0.67 s, 40% | 1.37 s, 40%, 31 | 1.33 s, 40%, 27 | 0.70 s, 60%, 38 | 1.33 s, 40%, 32 |
| brezscales …1216 (93, a twist) | 1.60 s, 25% | 1.27 s, 75%, 0 | 0.67 s, 75%, 0 | 0.63 s, 75%, 10 | 1.30 s, 75%, 0 |
| **All nine** | **57% of strong hits** | **48%, F 39.0** | **63%, F 39.8** | **78%, F 43.4** | **50%, F 35.5** |
| A user's edit (…0002's sound, 10.7 s) | | 0.77 s, 20% | 0.40 s, 100% | 0.40 s, 100% | 0.77 s, 80% |

What it showed, and what changed:

- **The planner heard the hits and cut past them.** A user's edit to the sound of nio …0002 opens on six stabs in two bars before the drop; the analysis had every one of them at full strength, and the build's every-two-beats rule passed over them: the plan cut a fifth of the song's strong hits. Now a hit that rises far above the music within a second of it (its onset ten times the median around it and more, out of silence; a kick in a busy groove is two or three) is a cut at every pace, and before the drop the grid gives way around a run of them.
- **Loud intros hid the groove's hits.** The onset picker takes one threshold from the song's loudest moments (as librosa does, which the tempo still uses), so after stabs at full strength a quieter groove's kicks and snares fell under it. The hits are now also picked against the loudest around them (the 95th percentile within two seconds), keeping the ones among the loudest there.
- **Slow songs were cut on the beat, where the editors cut on the half beat.** At 86 to 110 bpm the editors' shots after the drop run 0.3 to 0.45 s, the half beats; a beat there is 0.55 to 0.7 s. For a while cutting hard took the half beats too, on nothing when the shots needed it, and a user's edit showed what that looks like ([below](#a-users-edit-cut-hard)): a cut on every hat, attached to nothing. Now no pace cuts between beats where the song doesn't hit hard there every time.
- **Half of them speed into the drop.** nio …3659, …2531 and …8678 cut every beat of the last bar or so before the drop, after two beats a shot or more; …0002 flashes four photos a sixteenth each. Cutting hard, the build is every beat that has a hit on it.
- **Relaxed wasn't.** The pattern's cuts are worth more than a shot's length costs, so a longer target still cut every beat of a four-on-the-floor; relaxed now holds two beats a shot at least (one where a beat is 0.65 s or more).

### A user's edit, cut hard

A user's montage at 111 bpm, cut hard, came back as "all over the place": it didn't seem to cut to any beat. Taken apart against its song:

| Stretch | The song | What hard cut | What it cuts now |
|---|---|---|---|
| 0 to 2.5 s | pads and a melody, no drums; the loudest onset under a third of the song's | 0.87, 1.4, 1.67, 1.8, 1.93: every beat and a burst on soft notes | the bar line at 1.95, on a melody note |
| 2.5 to 3.0 s | the song gone | (nothing) | (nothing) |
| 3.0 to 3.9 s | a faint lead-in at 3.16, then the switch sound at 3.28, half a beat after the bar the silence ends on | 3.03, 3.3, 3.57, 3.83: the half beats of a run into the drop | 3.28, the switch sound (hard: 3.58 too, its second hit) |
| 4.1 s on | the beat: a kick or snare on every beat (onsets 0.6 to 1.7), a hat on every "and" (0.1 to 0.5), an 808 ducking under each beat | 22 cuts in 7.5 s, most of them half a beat apart | the drop at 4.11, then every beat, the hit each one has |

Measured on the rendered edit: 87% of the cuts within a frame and a half of a beat (39% before), 93% on a hit (58%), and one cut between beats, the switch sound itself (14). What it makes the rules, for every pace: a cut before the drop needs something under it (a hit among the loudest around it) or a bar line; the song coming back after it drops out is cut on the sound it comes back with, not the bar the silence ends on; and nothing is cut between the beats, a clip's re-cut included, unless the song hits there every time it comes round. The user's word for steady cutting: it "cuts to the actual beat that is the loudest".

### A user's fast cut on nio.trade's …0002 sound

The same user's next edit, cut fast to a 156 bpm sound: "in the beginning it doesn't even cut to the beat". It's the sound of nio.trade's …0002: six stabs out of silence in the first three seconds (0.73, 1.11, 1.50, 2.25, 2.46 and 3.02 s), then the groove.

| | 0 to 3 s, the stabs | 3 to 4 s | After |
|---|---|---|---|
| nio.trade's editor | holds the first shot through the first two stabs (photos land on his head instead), a burst of photos from the 1.50 stab held to the next, a cut on the 2.25 stab and on 3.02 | holds | on the beat |
| The user's edit (before) | a cut on every stab, and two re-cuts between them where the song plays nothing: 1.33 s, and 2.53 s, three frames after a stab | a cut at 3.4 s on nothing | on the beat's hits |
| Now, hard | a cut on every stab and nothing between them: 0.73, 1.10, 1.50, 2.25, 2.43, 3.00 | holds until the groove comes in, at 3.8 | on the beat's hits |

Each cut on nothing came from a different device: the fast re-cuts' build re-cut on every beat, their half-beat re-cuts (exempt from the check the others had), and the pattern after the drop repeated into a bar where the song leaves the beat out. What it makes the rule, for every style and every pace: whatever places a cut, it has a hit under it (within a frame and a half, at least half as strong as the hits around it); one that misses its hit by two frames or less moves onto it, and one on nothing goes, the shot before it playing on. And a song is cut in parts: where a new section plays another pattern for two bars or more, it gets its own template from its own hits. On the reference editors' songs this raised the planner's agreement with their cuts (F 39.8 to 40.6 steady, 43.4 to 44.5 hard; mico's song 94) and kept the hits it cuts on (80% of the strongest, cutting hard, as before).

## The styles

Every edit was measured again for what shapes it besides where it cuts: the colour of every shot (black and white is under 3.5 on the Lab colour scale), the drop (the biggest jump in the low end) and the shot lengths either side of it, the first shot against the last, and every time the edit goes back to a clip within 2.5 seconds of leaving it. The latest upload had one new edit, TJR's; the other file was a third copy of nio.trade's …8678.

### TJR, cut by cut

| Time | What happens |
|---|---|
| 0 to 10.4s | **The build.** Six calm daylight shots of two men getting off a private jet (0.53, 0.93, 1.73, 1.73, 1.80 and 3.70 s; median 1.73 s), under the song's quiet sung intro. The colour is muted (a third as strong as after the drop) |
| 10.4s | **The drop.** The 808 comes in and the edit cuts on it, a hard cut, no flash |
| 10.4 to 16.1s | **The payoff.** Eleven shots in a room full of cash, 0.17 to 1.03 s (median 0.57 s), cut on the bass hits |
| 16.1 to 16.6s | **The loop.** The first shot again, the same frames (93% alike in colour, the same picture), so the replay starts without a seam |

One meme caption holds over the whole edit, small white text centred high: "Me and Bro if we bought Bitcoin in 2011 instead of learning ABC".

### What each one does

| Edit | Before the drop | After the drop | Colour | Re-cuts | Ending |
|---|---|---|---|---|---|
| tjr …7392 | 6 shots, median 1.73 s | 11 shots, median 0.57 s | colour, muted in the build | 2 | the first shot again (a loop) |
| nio …1290 | the dialogue, median 1.22 s | 0.40 s | colour | 33% | the card |
| nio …3659 | median 0.88 s | 0.37 s | colour | 15% | the card |
| nio …0002 | a 1.5 s shot, then four photos of 3 frames | 0.43 s | colour | 4 | the card |
| nio …5448 | 0.47 s a shot all through (the median) | | two shots start in black and white and turn to colour on the beat | 35% | the card |
| nio …2531 | 0.27 s a shot all through | | one shot flips from black and white to colour | 28% | the card |
| mico | 0.47 s a shot all through, cut on the song's accents | | colour | none | the last shot |
| brezscales …1216 | 8 shots, median 1.6 s | one 7.6 s shot (the twist) | colour, at night | none | the reveal |

Two things the frames show that the numbers alone don't:

- **Real black and white is rare, and short.** Only nio.trade's …5448 and …2531 have it: a shot that starts in black and white for about a beat (0.6 s) and turns to colour on the next one, twice in …5448. The shots that measure grey elsewhere are colour in low light (brezscales' night causeway, the defocused car interior …8678 opens on). The TJR edit here is in colour; the black-and-white talking intros TJR and others post (someone talking for up to ten seconds, then a hard cut into the edit) aren't among the uploads, so the app takes that style's timing from TJR's build and its look from nio.trade's flips.
- **None of them hop back and forth.** Across the fourteen edits (about 300 cuts), the frame matcher found four returns to a clip within 2.5 s: one is a conversation, cut between the two people talking (nio …1290: "but you kind of made it?", "nah"), and the other three are one scene cut forward, a run of re-cuts. A clip either carries on, a jump further into it, or comes back well after. The app, with four to seven clips to work with, was going back to a clip with one or two shots in between up to seven times an edit.

### What they lay over the shots

Frame by frame, the few things the editors put on top of their footage, beyond the cut, the colour and the captions:

| Edit | When | What happens |
|---|---|---|
| nio …0002 | 0 to 0.27 s | **Up from black**, over 8 frames. Every nio.trade edit opens so |
| nio …0002 | 0.73 s, then 1.0 s | **Pictures on his head.** Over a shot of him standing in his room, which plays on under them, a photo of a face lands on his head on the beat: cut square to the face, a little bigger than his head, turned about a fifth of a turn. On the next beat another replaces it, turned the other way. Then the burst of tilted photos on black |
| nio …5448 | 11.62 s, then 11.88 s | The same gag late in a story: two face photos on his head a quarter of a second apart, then a tilted photo full frame |
| tjr …7392 | 12.73 s | **Windows.** Over a close shot (the back of a head), a card of another clip lands in the middle of the frame: the clip whole, in its own wide shape, 0.6 of the square frame across, no border, no move |
| tjr …7392 | 13.17 s | A second card lands on top of it, nearly square: the clip that comes next |
| tjr …7392 | 13.40 s | That clip takes the whole frame on the cut and plays straight on from where the card was |
| nio …3659 | 5.37 s, 6.13 s | A screenshot dissolves in over four frames and the shot after it dissolves out: a trading screenshot, not built here |
| xxzezedongoxx | all of it | Long takes walking round one car in fog, nothing laid over them: the slow style |

What the app does with them:

- **Up from black:** 8 frames (12 in the slow style), in the burst, the black and white one and every other straight edit.
- **Pictures on someone's head** (the photo burst): the shot before the burst, if someone is in it, or the best moment of a clip with someone in it, plays on, and on its last beats and half beats (up to three, a fifth of a second apart at least, from a third of the way in) a picture lands on the head of whoever is in it, each replacing the last: your photos first, then stills of clips the edit doesn't show there. The page finds the faces (the same face model as the framing): each photo is cut to its own face, the card sits on the head of the main person in the shot (the biggest face near the middle, followed through the shot) at about twice its size, turned −18°, +22°, −14° and +19° by turns. A photo with no face in it lands whole, bigger. The burst then shows other pictures than these, when there are.
- **Windows** (every other straight edit, and after the talking): once after the drop, over the middle one of the runs of a clip three quarters of a second long or more. The last card, the shot that comes next, lands on the last beat or half beat a fifth of a second or more before the cut; on the one before it, a card of another clip the edit doesn't show there (a photo when there's no clip). Each card is its clip whole in its own shape (inside any black bars), a fifth of the frame. The last one plays what comes just before the shot, so the cut carries straight on; when that's across one of the footage's own cuts, as a shot often starts right after one, the shot starts that much later and the card plays its start. Like the shots, what the cards play is looked at frame by frame for the footage's own cuts (see [settle](../app/src/engine/plan/settle.ts)).

### The styles in the app

| Style | From | What it does |
|---|---|---|
| **On the beat** | mico, nio …3659, TJR | Straight cuts: the build, then one rhythm from the drop to the end (see [the rhythm](#the-rhythm-cut-by-cut-against-each-songs-grid)), as hard as the Cutting picked; every other one with TJR's windows once after the drop, the others up from black |
| **Talk, then the drop** | TJR, and the talking intros described above | Someone talking, in black and white, with their own voice over the song's intro (the song kept low), their pauses cut out; a hard cut into colour on the drop, then the edit, with TJR's windows once. The song is picked so the drop lands a third to two thirds of the way in. With no one talking in the footage, a few calm shots a bar each, as TJR's build |
| **Black and white to colour** | nio …5448, …2531 | The build in black and white, colour from the drop, and after it a shot or two that start in black and white and turn to colour on the beat (or on the clip's first re-cut) |
| **Photo burst** | nio …0002, …5448 | Up from black; early on, your photos land on the head of someone in a shot, then four or five pictures fly in tilted on black, a sixteenth each (three or four frames): your photos first, then a moment of each clip |
| **Fast re-cuts** | nio …2531, …5448 | A clip re-cut on the half beat in every bar and carried over a beat, and the build re-cut on the beat too: over a third of the cuts |
| **Slow and cinematic** | brezscales, TJR's build | A bar a shot before the drop, two beats after it, every clip pushing in or pulling out slowly, no flash, burn or punch-ins |
| **Mix** (the default) | | Each edit in a batch in the next of these (the talking one only when someone talks in the footage, the burst only with four clips or photos, the slow one not when cutting hard, the fast re-cuts not when relaxed), so no two in a row look alike |

**Cutting** (Steady by default) sets how hard the montage cuts: **steady** is the references' own rhythm on the song's loudest hits, the build two beats a shot or more and their pattern after the drop; **hard** cuts on more of the hits, every beat into the drop that has one, with more re-cuts; **relaxed** holds two beats a shot or more. Every pace cuts only where the song plays something, and on the hits nobody can miss ([the planner against the editors](#the-planner-against-the-editors)). Slow and cinematic cuts relaxed and Fast re-cuts hard, whatever is picked.

**Loop the ending** (a switch, on by default, without an end card): the last shot is the moment just before the first, or the first shot again, as TJR ends, and the music stops on the bar line instead of fading, so the replay runs straight on. Not after talking.

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
