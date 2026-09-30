# What makes a music edit hit

Research behind the clipping machine's editing rules: how people perceive cuts against music, how the best short-form editors pace and pick shots, what creators want from clipping tools and don't get, and which methods run in a browser. Sources are research papers and platform data where they exist, and editor tutorials and user reviews where they don't; each rule says which. Our own measurements are in [edit-analysis.md](edit-analysis.md).

## 1. Timing: where a cut has to land

- **Cut on the start of the hit, or a hair before it (within a frame), never after it.** Viewers notice audio arriving before the picture at about 45 ms and after it at about 125 ms (ITU-R BT.1359), and judge sound and picture most "together" when the picture leads a little. Measured against where each hit starts, the best reference montage cuts a median 3 ms after it, 94% of its cuts within a frame and a half. (Measured against an onset detector's beats it looks 45 ms early: those beats sit 25 to 55 ms after the hits start, where the energy peaks, so an edit cut on them lands late.) *Research and our measurement.*
- **Soft attacks take less lead** (a sung syllable, a pad, a swelling 808): the slower the attack, the later listeners place the beat. *Research (Danielsen 2019).*
- **No cut and no effect without something to hear under it.** Sound at the moment of a cut is what makes it go unnoticed; when the drums drop out the grid keeps ticking but nothing hides the cut, so the shot holds. *Research (Smith & Santacreu 2017).*
- **Sync the motion inside shots, not only the cuts.** A sudden slowdown on screen (a car arriving, a door shutting, a whip pan stopping) reads as a visual beat, and lining those up with the music makes footage look like it dances. *Research (Davis & Agrawala 2018).*
- **Mostly predictable, rarely surprising.** 75 to 85% of cuts on the beat or a strong accent; off-beat cuts only on syncopations that stand out. Listeners enjoy surprise most inside a predictable pattern; cutting every beat feels frantic. *Research (Cheung 2019) and practice.*
- **Every hit nobody can miss gets a cut.** A stab out of silence, a snare fill or the hit that opens a section rises far above everything within a second of it (its onset ten times the median around it and more, where a kick in a busy groove is two or three), and an edit that cuts past one looks late however exact its other cuts are. A run of stabs before a drop is the rhythm there, not the grid under it. *Practice, and our measurement: a user's edit that held two beats a shot over six opening stabs, [the planner against the editors](edit-analysis.md#the-planner-against-the-editors).*
- **In a broken beat, cut on the kicks where they fall.** Garage, breaks and drill put their kicks and claps between the beats (the "a" of 1, the "and" of 3) and leave beats empty; a cut on an empty beat reads as off even when it's exactly on the grid. *Practice and our measurement (KETTAMA's Comes and Goes).*

## 2. Pacing: how long a shot runs, by section

| Section | Shot length | Cut on |
|---|---|---|
| Hook (first 1 to 2 s) | 1 to 2 beats | downbeats |
| Verse with vocals | 2 to 4 beats | downbeats, where sung lines start |
| Build | halving every bar or two: 4, 2, 1, half a beat | the snare roll |
| The gap before a drop | no cut in the silence: hold | the start of the gap |
| Drop or chorus | a 1-beat base in an accent pattern (the reference: 1-1-2-1-3); 2-beat holds on hero shots; the drop's own shot a beat at least | kick and snare, wherever they fall |
| Breakdown or half-time | a bar, slow motion | the half-time snare |
| Drums out, a voice carrying it | 1 to 2 bars, no shakes or flashes | phrase starts, stressed syllables |

Shot length follows the clock more than the tempo: after the drop the reference editors' shots run 0.3 to 0.45 s at 86 to 156 bpm, a beat at the fast tempos and the half beats at the slow ones, and half of them cut faster into the drop (every beat of the last bar, or a burst of photos). *Our measurement.* Pace follows the drums more than the level: a quiet build with a clap on every eighth drives as hard as a loud verse, and a drop is played as the edit's peak even when it's quieter than what came before (a garage drop often is). Neighbouring shots should be close in length, changing at section boundaries (film shot lengths have become correlated with their neighbours over the decades). Shots under 6 frames only in bursts within one scene. Across about 10,000 brand TikToks, editing pace was the feature most strongly linked to likes, comments, shares and saves. *Research (Cutting 2010; arXiv 2606.16053) and practice.*

## 3. Choosing the shots

- **The drop gets the strongest approach shot**: a car or a person coming at the lens. Things that grow in frame grab attention automatically. *Research (Franconeri & Simons).*
- **Contrast into the drop**: darker, tighter, stiller before it; brighter, bigger, faster on it. People pair loudness with brightness and size. *Research (Spence 2011).*
- **Match motion to the music**: push-ins and accelerating footage on risers, slow motion on held notes, short sharp moves on short notes. *Research (Su & Jonikaitis; Schutz & Lipscomb).*
- **Eye contact on the hook and on sung lines**: viewers look first at a face looking straight at them. *Research.*
- **Real over glossy**: the owner's own footage beats stock-looking clips, and Instagram no longer recommends repost aggregators. *Platform statements (2026).*
- **Never the same clip twice, and a clear change of size or angle** when two shots of the same subject follow each other, or the cut looks like a glitch. *Practice and research on continuity.*

## 4. Smoothness

- **Motion right after the cut hides it.** Removing motion after a cut made cuts easier to spot; removing it before made no difference. Start shots where movement is already under way. *Research (Smith & Henderson).*
- **One screen direction and one grade** through a run of shots. *Practice.*
- **Ease every move the editor adds** (punch-ins arrive in 2 to 3 frames on the beat and settle over 6 to 12), ease speed ramps over 4 to 6 frames, and don't slow footage below its frame rate's limit without interpolation or it stutters. *Practice.*
- **Effects follow how hard the hit is**: shakes and flashes on the drop and the few strongest kicks, none while the drums are out, never more than 3 flashes a second (the WCAG seizure limit). *Practice; the limit is a standard.*
- **Transitions are punctuation**: hard cuts by default, one flourish per edit, whip and zoom-blur transitions only on a whoosh, riser or fill. *Practice.*

## 5. Hook, length, loop

- Frame 1 is the hero, already moving, big and easy to read. Half of an ad's impact lands in its first 2 seconds (TikTok's research), and Instagram shows creators the share of viewers who swipe away in the first 3. *Platform data.*
- Start the song at its recognisable, energetic part: a strong downbeat within half a second, the first cut by about a second, the first payoff by 6. *Practice, following the platform data.*
- Montages of about 8 bars (12 to 20 s) plus a card of 2 bars or less. Most recommended videos aren't watched to the end, and most of those are dropped before halfway. *Research (Zannettou, CHI 2024).*
- End on a bar line so a replay lands on the opening downbeat; Instagram ranks on watch time including replays, and YouTube counts every replay of a Short as a view. *Platform statements.*

## 6. What creators want from clipping tools

What they complain about, from reviews, forums and feature-request boards:

1. The wrong moments: clips cut mid-thought, weak hooks, highlights that aren't. One test threw away about 40% of an AI clipper's clips.
2. "Virality scores" that don't predict anything: independent tests found low-scored clips beating high-scored ones.
3. Tools that only understand speech, and are blind to a car, a view or a watch.
4. Beat markers that need constant checking, with no bars or half beats.
5. Mechanical pacing: "if every marker causes the same kind of cut, the drop has nowhere to go".
6. Reframing that loses the subject or jerks around.
7. Stuck processing and failed exports; paywalls and watermarks; licences over uploaded footage.

What they want and don't get: a beat grid with bars and half beats; moment finding for visual footage, not just talking; automation that still lets them pick; control over tracking; long footage as input; no uploading; an editor that learns their style.

No tool we found combines mining a long vlog for visual moments, pacing that knows bars, builds and drops, velocity effects locked to the beat, and doing it all without uploading. That's the gap this app is built for.

## 7. How the app applies it

Done:

- An exact beat grid on the kick and snare (not the hats), from the whole song or a 15 second clip of it, moved onto where the hits start (found in 3 ms steps); bar lines from the kick and the bass; cuts 12 ms ahead of the hit, so never more than 5 ms after it once rounded to a frame.
- A song with no exact grid (played by hand, or a voice and finger snaps) is tracked at the tempo its standout hits keep: each tempo its rhythm repeats at is tried, and one wins when it puts clearly more of the hardest hits on its beats and its beats hit harder on average (a faster level catches more hits, but half its beats fall between them). A tracker leaning toward 120 bpm heard a sound with snaps on 2 and 4 at 86 bpm as 117; now it's 87, the tracked beats move onto the hits' starts, and a bar line with next to nothing on it pulls a cut less than the snap beside it.
- The song's shape, bar by bar: sections, breaks, four-bar phrases; the singing (a vocal model in the page) with where each line lands and its syllables.
- One rhythm from the drop to the card, as the references cut ([the rhythm](edit-analysis.md#the-rhythm-cut-by-cut-against-each-songs-grid)): a two-bar template of the sixteenths to cut on, from the hits the song repeats there (averaged over up to sixteen bars from the drop), on the beat unless the song hits hard between beats, passing over a beat with nothing on it, each shot near 0.45 s and none over 1.5 s, laid again every two bars. Before the drop, every two beats (cutting steady; cutting hard, every beat, and the last two beats into the drop on the half beats); a break's silence held and the return cut; a stretch with no drop that doesn't hit hard, every two beats on the pair of beats the song hits harder (a snap's 2 and 4). In every bar after the drop one clip carries over a beat, and at the end of every four bars (two, in every other edit) one clip is re-cut on the half beat (the sixteenth, when the half beat is long), each piece a jump further into it and punched in a little more.
- Every hit that stands out is a cut, at every pace: hits are picked against the loudest around them (the 95th percentile within two seconds) as well as against the whole song, and one that rises far above the music within a second of it, with some body to it (a kick, a snare or clap, a stab, an 808; a hat alone never), and isn't the groove's own (a hit much like it a bar or two either side, counted on its own side of the drop), takes the cut nearest it or gets its own; before the drop, where such hits are the rhythm, the grid's cuts give way around them. Cutting hard hears more of them and cuts after the drop on the half beats where a beat runs well past the shots wanted (a slow song's eighths); cutting relaxed holds two beats a shot at least. A user picks the pace (Cutting: hard, steady, relaxed).
- An off-beat cut only where the song hits in that bar (the pattern repeats; a syncopated hit doesn't always, and without it the cut goes back to the beat, or goes); punch-ins on kicks only, after the drop.
- Moments picked by what they show: a picture model in the page (TinyCLIP) tells supercars, jets, villas and views from desks, charts, talking heads and title cards, without a key; Gemini sharpens it when there is one.
- Selects, the way an editor pulls them: each edit comes from the best moments of all the footage (about 1.75 for every shot it has), drawn first from the good ones no earlier edit in the batch used; its hook and drop from the three best no other edit used at all (while those are nearly as good), the first edit leaving the later ones candidates of their own; never another edit's opening, drop or last shot, the shots it's remembered by, anywhere while anything else strong is left; the shots after the drop picked before the build, with the most flex; and filler (a room, people with nothing to show off, a blur) only once the flex runs out. Clips the user dropped one by one (short clips and photos, when there are several) are selects by being picked: each gets a turn, scene by scene, before any comes back, what the picture model would call filler in them counts as the life (a talking head or a screen of text aside), a weak one gets just its turn, and one too short for its slot plays slower (to three fifths of its speed) rather than another clip repeating. In a test built like a user's trip of fifteen phone clips, an edit used to take nine of them (a view four times over, the yacht three); it now takes all fifteen, none twice before all are in. And no hopping back and forth: none of the fourteen reference edits goes back to a clip a moment after leaving it (outside a conversation's shot and reverse shot), so a clip left under 2.5 s before comes back with one shot in between only when nothing else will do, and costs more the fewer shots lie between; when a clip is needed again that soon, it carries on in the next shot instead, a jump further into it and punched in, as a re-cut. Over a set of test batches with four to fifteen clips (fifteen edits), returns with one shot between fell from 11 to none, and with two shots between from 18 to 5. Variety comes from what the shots show, not which file they're in: the picture model's view of every shot already in the edit makes a look-alike less welcome, the selects count each moment that shows what an earlier one shows for less (a long stretch of one parked car, cut into a dozen moments, gives two or three), and a third shot of one thing in a row gives way to anything else with flex, even if it wasn't among the selects.
- Flow between shots: no accidental jump cuts (two shots of one subject back to back have to change the framing: the colours and where the subject sits; a clip re-cut on the beat, jumping forward and punching in, is on purpose), related shots within a section, a clear change where a new section starts, cuts into movement, darker shots before the drop and a brighter one on it.
- No cuts but the edit's own: every frame of what an edit takes from a long video is checked for the video's own cuts, and the edit is planned around them, so a shot never flashes to another scene off the beat. A video whose key frames come where its scenes change (YouTube's do: irregular gaps, where a phone's come evenly) is skimmed on them, and a change in the picture between two is put on the key frames in between, so the planner knows its scenes to the frame before it starts. Tested on a seven minute travel vlog cut every two seconds or so: the skim finds 182 of its scene changes (it found 4), and none of the 54 shots in three edits runs over one of its cuts (6 did).
- A frame too dark to read on a phone counts for less whatever it shows (its flex counts half at a twelfth of full brightness), and the hook, which has to read at a glance, passes over a dim picture for a bright one.
- A build that builds even when the song drops out before the drop: two beats a shot, then one on every beat of the last bar, then one shot held through the silence and the drop on the return.
- Edit styles, so a batch isn't the same edit three times ([the styles](edit-analysis.md#the-styles)): talking in black and white up to the drop (TJR's build, the voice over the song kept low), black and white turning to colour on the beat (nio.trade), a burst of tilted photos a sixteenth each (nio.trade), fast re-cuts (a third of the cuts and more), slow holds with no flourish (brezscales), each edit in a batch in the next; and without a card, the last shot running into the first so the replay loops (TJR).

Next: visual beats (land a car's arrival on the hit), screen direction across cuts, shot size from faces, a beat model with downbeats (Beat This!, below), and lyric-matched shots.

## 8. Beat and hit models, weighed

The app hears beats and hits with signal processing alone: librosa's onset strength and beat tracker, ported exactly, and the steady grid and hit timing on top. Neural trackers were weighed for what they would add:

| Model | Gives | Size | Licence | Fit |
|---|---|---|---|---|
| Beat This! (JKU, ISMIR 2024) | beats and downbeats, with no tempo prior and no post-processing | small: about 2M parameters (about 9 MB); full: 20M | MIT | the best fit: runs on ONNX Runtime Web in the page, from a log-mel spectrogram at 50 frames a second (22.05 kHz, 1024-point FFT, 128 bands from 30 Hz to 11 kHz) |
| madmom (RNN and DBN) | beats, downbeats, onsets | small | code BSD, models CC BY-NC-SA | the models are non-commercial |
| BeatNet | beats and downbeats, online | about 9 MB | CC BY 4.0 | weaker than Beat This! offline |
| All-In-One | beats, downbeats, sections and their labels | needs Demucs to split the song first | MIT | too heavy for the page |
| Essentia | tempo networks, onsets | | AGPL | the licence |

A user's edit that cut past its song's opening stabs showed the misses weren't the hearing: the analysis had every stab at full strength, and the planner cut past them. So the fix went into the planner and into picking hits against the music around them, a local threshold as SuperFlux-style onset pickers use (a moving maximum and mean; Böck and Widmer, DAFx 2013). Beat This! is the next step for songs with no steady grid (played by hand, with a tempo change), where the bar lines are what's weakest.

## Selected sources

- ITU-R BT.1359 via [TV Technology](https://www.tvtechnology.com/opinions/managing-lip-sync-267386); [Vroomen & Keetels](https://link.springer.com/article/10.3758/APP.72.4.871); [Danielsen 2019](https://pubmed.ncbi.nlm.nih.gov/30802130/)
- [Smith & Santacreu 2017](https://www.tandfonline.com/doi/abs/10.1080/15213269.2016.1160789); [Smith & Henderson](https://bop.unibe.ch/JEMR/article/view/2264); [Davis & Agrawala 2018](https://openaccess.thecvf.com/content_cvpr_2018_workshops/html/Davis_Visual_Rhythm_and_CVPR_2018_paper.html)
- [Cheung et al. 2019](https://www.cell.com/current-biology/fulltext/s0960-9822(19)31258-8); [Cutting et al. 2010](https://journals.sagepub.com/doi/10.1177/0956797610361679); [Solberg 2014](https://dj.dancecult.net/index.php/dancecult/article/view/451)
- [Franconeri & Simons](https://link.springer.com/article/10.3758/BF03194829); [Spence 2011](https://link.springer.com/article/10.3758/s13414-010-0073-7)
- [TikTok MediaScience](https://ads.tiktok.com/business/en-US/blog/mediascience-study-brands-memorable-tiktok); [Zannettou et al., CHI 2024](https://dl.acm.org/doi/fullHtml/10.1145/3613904.3642433)
- [W3C: three flashes](https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html); [Apple TN2258 on AAC priming](https://developer.apple.com/library/archive/technotes/tn2258/_index.html)
- Tools and reviews: [OpusClip virality score](https://help.opus.pro/docs/article/virality-score), [an OpusClip test](https://bigvu.tv/blog/opus-clip-tested-2026-where-ai-wins-40-percent-discard/), [CapCut beat editing](https://cursa.app/en/page/beat-based-editing-in-capcut-syncing-cuts-transitions-and-motion-to-music), [Premiere beat detection request](https://community.adobe.com/t5/premiere-pro-ideas/automatic-beat-detection/idi-p/14635575), [GoPro Quik moments](https://gopro.com/en/us/news/quik-moments-updates-and-gpmf)
- Models: [TinyCLIP](https://github.com/microsoft/Cream/tree/main/TinyCLIP) (MIT), [Spleeter](https://github.com/deezer/spleeter) (MIT) via [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx), [Beat This!](https://github.com/CPJKU/beat_this) (MIT), [madmom](https://github.com/CPJKU/madmom), [BeatNet](https://github.com/mjhydri/BeatNet), [All-In-One](https://github.com/mir-aidj/all-in-one)
