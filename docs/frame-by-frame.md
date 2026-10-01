# Every reference edit, frame by frame

The fourteen Reels in [`reference-edits/`](../reference-edits/), taken apart a frame at a time: every cut and what really happens across it, every overlay, every caption's face, size, colour and timing, and how each edit sits on its song. [`tools/break_down.py`](../tools/break_down.py) makes the first pass (every frame's brightness, sharpness, motion, colour split and torn rows; each cut classed by what the frames do around it; cards found and followed; captions read with OCR and cropped; strips of the frames around every cut and effect), and then every cut was checked by eye on those strips and on frames pulled out of the video, and the music measured again by hand. The first pass is often wrong: a camera's own whip pan reads as a whip transition, a handheld roll as a spin, a dissolve split in two as two cuts. The tables below are the checked ones. Frame numbers are at 30 fps.

How the app uses what's here is under [What the app takes from it](#what-the-app-takes-from-it); the broader measurements (the rhythm against each song's grid, the look, the styles) are in [the edit analysis](edit-analysis.md).

## The vocabulary, counted

| Edit | Cuts | Hard | Crossfade | Dip to black | Other | Effects inside shots |
|---|---|---|---|---|---|---|
| nio.trade …3659 (montage, lyrics) | 27 | 18 | 8 (3 to 5 frames, ending on the beat, in runs) | 1 (into the card) | | a 30% linear zoom into a screen; a freeze with a date overlay |
| nio.trade …1290 (story) | 18 | 10 (2 jump cuts) | 7 (6 to 8 frames, all after the drop, each ending on a kick) | 1 (black frame on a kick) | | a +53% punch-in over 9 frames; a +113% zoom into a cut over 18 frames; a sticker faded in |
| nio.trade …8678 (two chapters) | 31 | 26 (2 jump cuts) | 3 (4 to 7 frames, between screen grabs) | | 1 warm light-leak burn (6 frames) | a freeze with two boxes cut in on it |
| mico17777 | 17 | 17 | | | | none |
| xxzezedongoxx | 5 | 5 | | | | none |
| brezscales …9528 (meme) | 0 | | | | | none (one take) |
| gillioniare …9336, …7613 (memes) | 0 | | | | | a 2.2 s fade up from black over the photo and its caption |

What the counts say: **the reference editors' vocabulary is small and they use it in runs.** Hard cuts are most of every edit. The crossfade is nio.trade's signature, linear, 3 to 8 frames, timed so the next shot is whole on the beat (not centred on it), and used in runs: one a beat into the drop, one a beat for two bars after it, never on the drop itself. The drop is a hard cut, usually from the brightest shot to the darkest, with nothing on it. Many of the first pass's zooms, spins, whips and shakes are the footage's own camera; a 24 fps clip in a 30 fps edit repeats every fifth frame, and that unbroken cadence through a "cut" proves it isn't one.

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
- **24.6 to 30.2 s, "kimchi 3 days before retiring:"**: the label swaps on a harmonic change with a hard cut; office shots of 0.4 to 0.8 s; the edit's only stylised transition, a warm light-leak burn (3 frames near opaque, 3 fading over the next shot); 4 to 7 frame crossfades between screen grabs; a black "Jan 17, 2025" box, then a mint "+$40M" box, cut in on a frozen screen.
- **The card** comes in on a hard cut (no dip) and shrinks 4.6%.

**The label:** white, a regular humanist sans (Instagram's Classic, Proxima Nova style), lowercase with a colon, 4.9% of the frame's height, on a square-cornered solid black box near the bottom (centre at 0.89 of the height), from frame 0, above every effect, swapped on the chapter cut.

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

## What the app takes from it

- **The Crossfade design** (nio.trade's own): up from black over half a second pushing in, crossfades into the drop a beat apart (4 frames, the next shot whole on the beat), nothing on the drop, then two bars of crossfades of 6 frames each finishing on its kick, hard cuts after, a crossfade where a phrase starts.
- **Shots shown together.** Crossfades, pushes and slides show the shot going out and the one coming in at once (the renderer draws both); a crossfade's frames step evenly from one shot to the next and the next is whole on the cut, as nio.trade's do.
- **Every design mixes its moves** (rather than one move on every cut) and keeps most cuts hard; the bigger moves go where a phrase or a section starts; crossfades come in runs. A warm light-leak burn (…8678) is one of the moves.
- **Caption looks from the references** in the caption editor: Label (nio.trade's white on a black box), Subtitle (its YouTube-style subtitles), Signature (mico's tiny serif italic), Phone (brezscales' in-app text), Meme (gillioniare's outlined rounded sans).
