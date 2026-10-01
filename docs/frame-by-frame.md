# Every reference edit, frame by frame

The fourteen Reels in [`reference-edits/`](../reference-edits/), taken apart a frame at a time: every cut and what really happens across it, every overlay, every caption's face, size, colour and timing, and how each edit sits on its song. [`tools/break_down.py`](../tools/break_down.py) makes the first pass (every frame's brightness, sharpness, motion, colour split and torn rows; each cut classed by what the frames do around it; cards found and followed; captions read with OCR and cropped; strips of the frames around every cut and effect), and then every cut was checked by eye on those strips and on frames pulled out of the video, and the music measured again by hand. The first pass is often wrong: a camera's own whip pan reads as a whip transition, a handheld roll as a spin, a dissolve split in two as two cuts. The tables below are the checked ones. Frame numbers are at 30 fps.

How the app uses what's here is under [What the app takes from it](#what-the-app-takes-from-it); the broader measurements (the rhythm against each song's grid, the look, the styles) are in [the edit analysis](edit-analysis.md).

## The vocabulary, counted

| Edit | Cuts | Hard | Crossfade | Dip to black | Other | Effects inside shots |
|---|---|---|---|---|---|---|
| nio.trade …3659 (montage, lyrics) | 27 | 18 | 8 (3 to 5 frames, ending on the beat, in runs) | 1 (into the card) | | a 30% linear zoom into a screen; a freeze with a date overlay |
| nio.trade …1290 (story) | 18 | 10 (2 jump cuts) | 7 (6 to 8 frames, all after the drop, each ending on a kick) | 1 (black frame on a kick) | | a +53% punch-in over 9 frames; a +113% zoom into a cut over 18 frames; a sticker faded in |
| nio.trade …8678 (two chapters) | 31 | 26 (2 jump cuts) | 3 (4 to 7 frames, between screen grabs) | | 1 warm light-leak burn (6 frames) | a freeze with two boxes cut in on it |
| nio.trade …0002 (sticker, flipbook) | 18 | 18 (5 in a flipbook a sixteenth apart) | | | | a freeze with a face sticker; a stepped zoom (+10% every two frames); the song stuttered under the opening |
| mico17777 | 17 | 17 | | | | none |
| xxzezedongoxx | 5 | 5 | | | | none |
| brezscales …9528 (meme) | 0 | | | | | none (one take) |
| gillioniare …9336, …7613 (memes) | 0 | | | | | a 2.2 s fade up from black over the photo and its caption |
| nio.trade …5448 (LARP, 4:3) | 25 | 25 | | | | 2 jump cuts and 4 one-frame punch-in steps inside takes (+4.7% to +16%, up to 1.3° turned); 2 black-and-white shots snapping to colour on a beat; an eased zoom to 160% and back before the drop; a freeze with a face photo on his head after it; 3 tilted stills on black, one an eighth |
| nio.trade …2531 (LARP again, 4:3) | 28 | 28 (2 jump cuts) | | | | 5 punch-in steps (+3.9% to +16.1%, about 1° turned); a crash zoom (+48% in 5 frames) into laser eyes; a black-and-white snap; a face photo on his head, swapped on the eighth; 3 stills on black |
| nio.trade …6955 (stream, 4:3) | 14 | 2 | 11 (3 or 5 mixed frames, the middle one on the beat), and 1 into a 2x crop of the same picture | 1 (a cut to black, the card fading in) | | a "+$40M" box faded in over a view count |
| TJR …7392 (money, 1:1) | 16 | 16 | | | | two windows on consecutive claps (the second the next shot), the shot under them stepping at 12 fps, then frozen; the first shot played backwards to end on, so it loops |
| brezscales …1216 (twist, 9:16) | 6 | 6 | | | | none: the caption swapped on the twist's cut |

What the counts say: **the reference editors' vocabulary is small and they use it in runs.** Hard cuts are most of every edit. The crossfade is nio.trade's signature, linear, 3 to 8 frames, timed so the next shot is whole on the beat (…3659, …1290) or with its middle frame, half and half, on it (…6955), and used in runs: one a beat into the drop, one a beat for two bars after it, never on the drop itself. The drop is a hard cut, usually from the brightest shot to the darkest, with nothing on it. Many of the first pass's zooms, spins, whips and shakes are the footage's own camera; a 24 fps clip in a 30 fps edit repeats every fifth frame, and that unbroken cadence through a "cut" proves it isn't one. Where the LARP edits (…5448, …2531) get their pace without a single transition: inside the takes, the picture jumps closer in one frame on a beat and stays, a shot comes in black and white and snaps to colour on the next beat, a crash zoom lands on a beat; so the picture changes on every beat or eighth even when the cut doesn't.

## nio.trade …3659: the music montage with lyric captions

19.6 s, 4:3 (960×720), melodic trap at 155 bpm (a beat tracker reads 103: it locks onto the 808's dotted rhythm).

| Time | Section | What the edit does |
|---|---|---|
| 0.00 to 3.60 | the intro, a sung vocal with no drums | up from black over 15 frames while the first shot pushes in 6%; four talking vlog shots of 0.9, 1.07, 0.87 and 0.77 s, shortening; the lyric placed beside the subject, moved with each shot |
| 3.60 to 5.87 | the last six beats before the drop | the picture changes on every beat: a monitor zooming in 30% (linear, 10 frames), then three 4-frame crossfades through screen close-ups, a date swapped on a frozen screen, a 5-frame crossfade to the news post; the lyric a word at a time at the centre |
| 5.87 | the drop | a hard cut a frame early onto the "+$40M" card; no flash, no shake |
| 5.87 to 7.37 | the drop's flurry | three lifestyle shots of 0.3 to 0.47 s joined by 3 to 5 frame crossfades ending on the beats |
| 7.37 to 9.03 | a breather | a chart held 1.67 s, four beats |
| 9.03 to 12.03 | the montage | nine hard cuts in three seconds, one a beat, stills among the clips (no Ken Burns) |
| 12.03 to 15.10 | cooling down | 0.4 to 0.8 s shots, a jump cut, a crossfade to a close-up, a 7-frame fade to black |
| 15.10 to the end | the card | one black frame three frames before a downbeat, a 6-frame fade in, the card shrinking 6% |

**Captions:** the lyrics in a medium condensed grotesque (Roboto Condensed style), lowercase, white with a 1.5 to 2 px black outline and a faint shadow, about 4.5% of the frame's height, one line, cut in and out with no animation. The first phrases sit in empty space beside the subject and move with each shot; from the build on, a word at a time at the exact centre, each on its sung syllable (5 to 13 frames); the last word gets two emoji. None after the drop.

**Missed by a basic editor:** crossfades end on the beat; hard cuts land 1 to 2 frames before it; the date swap is a black box matched to the screen's perspective on a frozen frame; stills sit completely still next to moving footage.

## nio.trade …1290: the story clip

25.2 s, 4:3, trap at 86 bpm.

| Time | What happens |
|---|---|
| 0.0 to 0.5 | up from black (15 frames), the first subtitle already there |
| 0.0 to 8.9 | vlog dialogue under the song (not ducked): hard cuts every two beats for the first five, then on the speaker's turns; a +53% punch-in over 9 frames (constant, hard stop) on the listener's face after the first cut, a +113% zoom over 18 frames into a supercar straight into a cut |
| 8.9 to 16.1 | the 808 drops out and the bed sinks 15 dB: the build is made by taking away, not by a riser; two jump cuts and the cameraman's own whip pans between the speakers |
| 15.7 to 16.1 | the punchline said, 0.37 s of near silence, the picture holding |
| 16.1 | the drop: a hard cut on the kick from the brightest shot (daylight) to the darkest (night), the subtitles off on the same frame |
| 16.1 to 21.7 | one picture a beat for eight beats, every change a linear crossfade of 6 to 8 frames finishing on the next kick: night car, party, the tweet, a tighter crop of it (a crossfade, not a zoom), a "+$40M" sticker faded in on the half beat, the profit card, cars and the jet, walking to it, the party inside |
| 21.5 to 21.9 | dip to black: 7 frames out, a black frame on the kick, 7 frames in |
| 21.9 to the end | the card, zooming out 3.5% while the music fades |

**Subtitles:** YouTube's look: Roboto Regular, white, lowercase as spoken (slang kept), 3.75% of the frame's height on an opaque black box flush to the bottom edge, one line, switched instantly per phrase with no gaps, gone on the drop frame.

## nio.trade …8678: two chapters under one label

34.1 s, 4:3, a sung track at 173 bpm (a tracker reads 117.5) with the snare every four beats, no drop. One warm peach grade on every clip (the same jet footage is neutral grey in …3659).

- **0 to 24.6 s, "kimchi after retiring:"**: a talking hook up from black (14 frames, out of focus at first), one long beauty shot, then shots of 0.93, 0.8 and 0.67 s; from the first snare a cut every four beats on the snare, 1 to 3 frames early; one burst of four one-beat shots at the party's peak (a dark room, the club, the lawn, the pool), then back to four beats a shot; two jump cuts (a time skip framed 11% tighter).
- **24.6 to 30.2 s, "kimchi 3 days before retiring:"**: the label swaps on a harmonic change with a hard cut; office shots of 0.4 to 0.8 s; the edit's only stylised transition, a warm light-leak burn (3 frames near opaque, 3 fading over the next shot); 4 to 7 frame crossfades between screen grabs (these start on the beat, where …3659's and …1290's end on it); a black "Jan 17, 2025" box, then a mint "+$40M" box, cut in on a frozen screen.
- **The card** comes in on a hard cut (no dip) and shrinks 4.6%.

**The label:** white, a regular humanist sans (Instagram's Classic, Proxima Nova style), lowercase with a colon, 4.9% of the frame's height, on a square-cornered solid black box near the bottom (centre at 0.89 of the height), from frame 0, above every effect, swapped on the chapter cut.

## nio.trade …0002: the stutter, the sticker and the flipbook

11.5 s, 4:3, melodic trap at 156 bpm with an 808 phrase every eight beats. No captions at all: the hook is purely visual and the sound is re-cut.

| Time | What happens |
|---|---|
| 0.00 to 0.73 | his own clip in his apartment, up from black over 15 frames |
| 0.73 to 1.50 | the frame **freezes** on the beat and a square selfie of him is pasted over his head (tilted 23°, hard edges); eight frames later a second, 14% bigger one (tilted 15°) |
| 1.50 to 1.87 | a **flipbook** of four photos on black, 3, 3, 3 and 2 frames (a sixteenth each), each at its own tilt or perspective lean |
| 1.87 to 2.29 | a landscape photo inset at 84% held 13 frames |
| 2.29 | the drop: a hard cut to the TRUMP chart; a +15% punch on the next half beat, then a **stepped zoom** (+10% every two frames) to 165% on the market cap |
| 3.03 to 9.17 | the montage: 12 shots of 0.33 to 1.13 s (median 0.5), hard cuts only, a frame early, on beats or half beats, a structural cut on every 808 phrase |
| 9.17 to the end | the card, zooming out 5.5%, fading with the music |

**The sound is re-cut under the hook (a stutter):** half a second of the song, silence, then the same 0.15 s slice of it played again on beats 1 and 2 with silence between (the freeze), a 0.1 s slice again on every sixteenth (the flipbook), a roll of 16th-note chops (the held photo), and the song running on uncut from the drop. The slices match the song's own waveform (correlation 0.88 to 0.98), and every picture change in the first 2.3 seconds sits on one of them.

## mico17777: hard cuts on the melody

12.5 s, 9:16, a drumless melodic loop on a 0.406 s note grid (148 bpm), no drop.

- **17 hard cuts, nothing else**: no crossfade, zoom, flash or shake; every move is the camera's.
- **The cuts follow the melody's notes, not a beat:** in each eight-step phrase the notes fall on steps 0, 1, 2, 4 and 5, so the shots run 1, 1, 2, 1 and 3 steps (12, 12, 24, 12, 36 frames); a step with no note never gets a cut; the coda's fewer notes stretch the shots (1, 3, 3).
- **Light against dark:** 13 of the 17 cuts jump from a dark night shot to a bright snowy or daylight one or back. That ping-pong is the energy; there's no effect.
- **A hero:** the same BMW three times, always on the long hold that ends a phrase, and last with its "A MICO" plate. Every person faceless (masks, backs, a phone over a face).
- **"Peak life."** in a Garamond-style serif italic, white, tiny (a cap height of 1.9% of the frame's height), dead centre, no outline or shadow, on every frame.

## xxzezedongoxx: the slow photo dump

28.7 s, 9:16, a drumless ambient track the cuts ignore. Six angles of one white Ferrari in fog at a border sign, each exactly 145 frames (4.83 s), hard cuts only (the first pass missed one: both shots had the same palette). Each clip carries its own slow camera move, the biggest last (a +56% walk-in, real: the parallax shows it); the brightness matched across every cut (within 5 of 255); the place name on the sign does a caption's job. The music's biggest moment falls mid-shot with no cut.

## brezscales …9528: the square meme

8.4 s, 1:1 (720×720). One uncut handheld night shot (its sound muted although the person talks and laughs), a soft drumless loop, and one block of text: "It's rare, but some / people truly want to / see you win and / Im one of them:)" in the phone's own text (SF Pro or Inter at 500 to 600), white, tiny (a cap height of 1.9% of the frame), no outline or shadow, four short lines broken by hand, dead centre, on from frame 0. It's exactly five bars long, ending on a downbeat so the loop restarts on the beat; someone crossing the lens makes a free "wipe" on a downbeat.

## gillioniare …9336 and …7613: the photo memes

11.2 s and 8.6 s, 9:16. One still photo each (no movement at all), and for sound not a song but a trending voice clip with its own music bed (not ducked), heard word for word by the speech model: "You're broke. You're fucking poor..." under the first, "He's such a mystery. He never talks about his past. It doesn't-" under the second (cut off mid-word: the loop is the ending). The caption is the setup and the sound the punchline: the second lists exactly the past the voice says he never talks about. One block of text: a two-line setup ("when she tries to talk to me / but all ihear in my head is this..", typo kept) or a list that turns on its last line ("Puffy eyebags / 5 hours of sleep / ... / And then "is this your 812?"", an empty line before the punchline). The text: a heavy rounded sans (Nunito ExtraBold style), white with a hard 3 px black outline, small (cap height 1.4% of the frame), centred on the photo's empty space rather than the frame, from frame 0. The photo and the text fade up from black together, linearly, over 2.2 seconds; no fade out.

## nio.trade …5448: the LARP edit

24.7 s, 4:3 (960×720), about 110 BPM, an 808 drop at 11.05. No grade, no grain.

| Time | What happens |
|---|---|
| 0.00 to 0.50 | up from black, 15 frames, linear |
| 0.00 to 4.50 | the hook: a stranger yelling "LARP!" in the clips' own sound over the song's bassless intro (not ducked); the picture changes on every beat or eighth: 4 cuts, 2 jump cuts, and 4 **one-frame punch-in steps** inside the takes (+4.7% turned 1.3°, a 1.2° turn, +16%, +14.5%), anchored low on the car, each held to the cut |
| 4.50 to 6.17 | the reveal: the trader, cut to on a bar line in **black and white** (20 to 35 levels darker, the blacks crushed), **snapping to colour** 15 to 17 frames later on the next beat or eighth; twice running |
| 6.17 to 7.77 | a dashboard POV and a selfie in the car |
| 7.77 to 11.03 | one talking shot held 3.3 s: an **eased zoom to 160%** landing on the bar's downbeat (85% of it in its first 5 frames), held, then back to 100% over 13 frames a beat before the drop, so the drop cuts from a plain frame |
| 11.05 | the drop: a plain hard cut a frame before the 808; no flash, no shake, no riser before it |
| 11.60 | the frame **freezes** and a rectangular photo of his face (a fifth of the width, turned 21°, hard edges) lands on his head; another on the next eighth |
| 11.9 to 19.8 | three stills on black, one an eighth, full height, left-aligned, turned 0 to 18°; then about a cut a beat, an **eased push** of +37 to 43% over 9 to 11 frames with its quickest frame on a beat, punches of +9 to 20%; one dark shot held over the 808's break, the next cut with its return |
| 19.80 | the card on a downbeat, cut straight in; the song **low-passed** from the same frame; the card shrinks linearly from 100% to 91.7%; fades to black over its last 24 frames |

Subtitles only where someone speaks (none after the drop): one phrase a block (1 to 6 words), white condensed sans (Roboto Condensed style) with a cap height of 3.75% of the frame, on a solid black box glued to the bottom edge; on and off with the words, hard; "LARP!" becomes "LARP! LARP!" when it's said again; one emoji. They never move with the punch-ins.

## nio.trade …2531: the same edit, cut again

19.0 s, 4:3, 143 BPM, the same LARP footage and card, cut tighter. Every bar line from bar 3 to bar 10 has a cut; the rest land on beats or eighths (27 ms off on average), 1 to 2 frames early around the drop. Five punch-in steps (+3.9% to +16.1%, about 1° turned, at most two a clip, four of them in the first 3 seconds); a burst of four jump cuts (6, 4, 3 and 12 frames); the subject's first shot in black and white for 13 frames, colour on the next beat; about five beats before the drop a **crash zoom** (+48% over 5 frames, easing in and out, motion-blurred) onto his face, and laser eyes on the beat with the whole frame darkening 26%; the chart, then the profit card for one beat, ending 2 frames before the drop. The drop: 2 frames before the 808, the voice stopping as it starts (the music is ducked about 6 dB under the talking until then). A beat later a photo of his face on his head (turned 35°, swapped for another at 25° on the eighth, the shot playing on under it), then 3 stills on black at 6 or 7 frames each, each placed its own way. The card zooms out 5 to 7%, then 3 black frames.

## nio.trade …6955: the stream, then the song

27.7 s, 4:3, 112 BPM.

| Time | What happens |
|---|---|
| 0.00 to 12.57 | a static screen recording of a trade (no zoom, no pan, no cut for 12.6 s) with only the streamer's voice: **no music at all**; 8 subtitles, the first already up on black while the video fades in under it over 15 frames; the lines held through pauses with no gap, in capitals when he shouts, a repeated shout doubled in one block ("ACTUALLY RIGHT NOW ACTUALLY RIGHT NOW") |
| 12.567 | the drop: the song starts here, its first 808 on the hard cut, no fade in; the subtitles gone on the same frame |
| 12.57 to 19.00 | exactly three bars, a picture a beat: 13 shots joined by 11 linear crossfades of 4 or 6 frames (3 or 5 of them mixed), the **middle frame, half and half, on the beat**; a crossfade into a 2x crop of the same screenshot instead of a zoom; a mint "+$40M" box faded in over 4 frames on the eighth over the post's view count, setting up the profit card that follows in the same green |
| 19.00 | a hard cut to black, the card fading in over 12 frames; the song **low-passed** from the same beat (about 18 dB off above 4 kHz); zooming out at half …5448's speed; a 2 s fade out |

## TJR …7392: windows on the money

16.6 s, 1:1 (720×720), music only. The first 10.4 s are calm and drumless, cut once a bar (the last shot held two bars), every shot pushing in slowly and the last pulling out 11% into the drop, faster and faster; the colour cool and washed out. The drop: a hard cut exactly on the 808 boom, warm and golden from there. After it every cut lands 0 to 2 frames **after** a clap, snare or kick, never before. Between the two booms, two **windows** on consecutive claps: a 16:9 window of related footage (60% of the width), the shot under it now stepping at 12 frames a second; then a window of the next shot (48% by 45%) over it, the shot under it **freezing**; on the next hit the next shot takes the whole frame with a hard cut. The last 15 frames are the first shot played backwards, so the end matches frame 1 and the video loops. One caption all the way, dead centre over faces: Arial-style regular, white, a 2 px black outline, a cap height of 2.9% of the frame.

## brezscales …1216: what they see vs what they don't

21.5 s, 9:16, one sung R&B song at 93 BPM, no ducking, no sound of its own. Six flex shots (3.07, 5.00, 1.60, 1.53, 0.67 and 1.67 s, shortening toward the twist), cut on the vocal's syllables and the clips' own action (held until the Lambo's flames die), not on the drums. The twist: a hard cut 2.5 frames before the section change (where the kick goes from every other beat to every beat), the caption swapped on the same frame, then one locked-off shot of the desk at night held 7.97 s (37% of the video) to an abrupt end. The captions: "what they see vs..." and "what they don't...", lowercase, the phone's own semibold, 2.4% of the frame tall, white with a 2 px black outline, at 0.37 of the height and the second 2.8% lower. The brand is a licence plate in the first shot, not an overlay.

## What the app takes from it

- **The Crossfade design** (nio.trade's own): up from black over half a second pushing in, crossfades into the drop a beat apart (4 frames, the next shot whole on the beat), nothing on the drop, then two bars of crossfades of 6 frames each finishing on its kick, hard cuts after, a crossfade where a phrase starts.
- **Shots shown together.** Crossfades, pushes and slides show the shot going out and the one coming in at once (the renderer draws both); a crossfade's frames step evenly from one shot to the next and the next is whole on the cut, as nio.trade's do.
- **Every design mixes its moves** (rather than one move on every cut) and keeps most cuts hard; the bigger moves go where a phrase or a section starts; crossfades come in runs. A warm light-leak burn (…8678) is one of the moves.
- **The stepped zoom** (…0002's chart): in Phonk, the drop's shot zooms in a tenth every two frames, up to half again, choppy on purpose.
- **The stutter** (…0002): under the photo burst the song cuts out and the hit the burst starts on plays again on each picture, a sixteenth apart, rolling on through the last one, until the next cut brings the song back.
- **The Reframe design** (…5448, …2531): hard cuts only; before the drop the picture steps closer in one frame on the beats or eighths that split each long clip (4 to 16%, a degree or so turned, two a clip and a quarter closer at most), the first shot on a bar line after the opening comes in black and white a fifth darker and snaps to colour on the next beat (twice running when the next cut is a bar on), a crash zoom (half as close again in 5 to 7 frames, landing on a beat) in the bars before the drop; a plain cut on the drop, a face on the head of whoever is in its shot (the shot freezing under it in some); after it an occasional step closer and a push of two fifths with its quickest frame on the beat.
- **The song muffled under the card** (…5448, …6955): every end card low-passes the song from its first frame, as if through a wall.
- **Crossfades centred on the beat** (…6955): in every other Crossfade edit the burst after the drop crossfades with 3 or 5 mixed frames by turns, the middle one on the beat.
- **Openings that hold the song back** (…6955): every other edit that opens on clips of the user's own plays them with no music under them; the song comes in on the drop.
- **TJR's windows** (…7392): under the windows the shot steps at 12 frames a second from the first, and freezes when the next shot's window lands.
- **Subtitles as nio.trade sets them**: each line held through pauses of up to a second, a word said again added to the line where it's said ("LARP!", then "LARP! LARP!"), a line said again joined to the one before, a shouted line (8 dB over the talking around it) in capitals.
- **Choppy frames**: Phonk stutters at 12 frames a second into its freeze before the drop; Glitch stutters on some hits after it.
- **The twist's second caption** (…1216) is swapped in on the cut's own frame and sits a little lower than the first.
- **Caption looks from the references** in the caption editor: Label (nio.trade's white on a black box), Subtitle (its YouTube-style subtitles), Signature (mico's tiny serif italic), Phone (brezscales' in-app text), Meme (gillioniare's outlined rounded sans).
