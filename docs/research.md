# What makes a music edit hit

Research behind the clipping machine's editing rules: how people perceive cuts against music, how the best short-form editors pace and pick shots, what creators want from clipping tools and don't get, and which methods run in a browser. Sources are research papers and platform data where they exist, and editor tutorials and user reviews where they don't; each rule says which. Our own measurements are in [edit-analysis.md](edit-analysis.md).

## 1. Timing: where a cut has to land

- **Cut 40 to 50 ms before a drum hit (1 to 1.5 frames at 30 fps), never after it.** Viewers notice audio arriving before the picture at about 45 ms and after it at about 125 ms (ITU-R BT.1359), and judge sound and picture most "together" when the picture leads a little. The best reference montage cuts 45 ms early on all 17 of its cuts. *Research.*
- **Soft attacks take less lead** (a sung syllable, a pad, a swelling 808): the slower the attack, the later listeners place the beat. *Research (Danielsen 2019).*
- **No cut and no effect without something to hear under it.** Sound at the moment of a cut is what makes it go unnoticed; when the drums drop out the grid keeps ticking but nothing hides the cut, so the shot holds. *Research (Smith & Santacreu 2017).*
- **Sync the motion inside shots, not only the cuts.** A sudden slowdown on screen (a car arriving, a door shutting, a whip pan stopping) reads as a visual beat, and lining those up with the music makes footage look like it dances. *Research (Davis & Agrawala 2018).*
- **Mostly predictable, rarely surprising.** 75 to 85% of cuts on the beat or a strong accent; off-beat cuts only on syncopations that stand out. Listeners enjoy surprise most inside a predictable pattern; cutting every beat feels frantic. *Research (Cheung 2019) and practice.*

## 2. Pacing: how long a shot runs, by section

| Section | Shot length | Cut on |
|---|---|---|
| Hook (first 1 to 2 s) | 1 to 2 beats | downbeats |
| Verse with vocals | 2 to 4 beats | downbeats, where sung lines start |
| Build | halving every bar or two: 4, 2, 1, half a beat | the snare roll |
| The gap before a drop | no cut in the silence: hold | the start of the gap |
| Drop or chorus | a 1-beat base in an accent pattern (the reference: 1-1-2-1-3); 2-beat holds on hero shots | kick and snare |
| Breakdown or half-time | a bar, slow motion | the half-time snare |
| Drums out, a voice carrying it | 1 to 2 bars, no shakes or flashes | phrase starts, stressed syllables |

Neighbouring shots should be close in length, changing at section boundaries (film shot lengths have become correlated with their neighbours over the decades). Shots under 6 frames only in bursts within one scene. Across about 10,000 brand TikToks, editing pace was the feature most strongly linked to likes, comments, shares and saves. *Research (Cutting 2010; arXiv 2606.16053) and practice.*

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

- An exact beat grid on the kick and snare (not the hats), from the whole song or a 15 second clip of it; bar lines from the kick and the bass; cuts 1 to 2 frames early.
- The song's shape, bar by bar: sections, breaks, four-bar phrases; the singing (a vocal model in the page) with where each line lands and its syllables.
- Pacing by section as in the table: a bar in breakdowns, 2 to 4 beats in verses (at least 2 while a voice carries sparse drums), a 1-beat base in drops, builds that halve into the drop, no cuts in a break's silence, cuts where sung lines land.
- Off-beat cuts and punch-ins only on hits that stand out from what always plays there; punch-ins on kicks only.
- Moments picked by what they show: a picture model in the page (TinyCLIP) tells supercars, jets, villas and views from desks, charts, talking heads and title cards, without a key; Gemini sharpens it when there is one.
- Selects, the way an editor pulls them: each edit comes from the best moments of all the footage (about 1.75 for every shot it has), its hook and drop from the three best no other edit in the batch opened or dropped on, and filler (a room, people with nothing to show off, a blur) only once the flex runs out. Variety comes from what the shots show, not which file they're in: the picture model's view of every shot already in the edit makes a look-alike less welcome.
- Flow between shots: no jump cuts (two shots of one subject back to back have to change the framing: the colours and where the subject sits), related shots within a section, a clear change where a new section starts, cuts into movement, darker shots before the drop and a brighter one on it.

Next: visual beats (land a car's arrival on the hit), screen direction across cuts, shot size from faces, a beat model with downbeats (Beat This!), and lyric-matched shots.

## Selected sources

- ITU-R BT.1359 via [TV Technology](https://www.tvtechnology.com/opinions/managing-lip-sync-267386); [Vroomen & Keetels](https://link.springer.com/article/10.3758/APP.72.4.871); [Danielsen 2019](https://pubmed.ncbi.nlm.nih.gov/30802130/)
- [Smith & Santacreu 2017](https://www.tandfonline.com/doi/abs/10.1080/15213269.2016.1160789); [Smith & Henderson](https://bop.unibe.ch/JEMR/article/view/2264); [Davis & Agrawala 2018](https://openaccess.thecvf.com/content_cvpr_2018_workshops/html/Davis_Visual_Rhythm_and_CVPR_2018_paper.html)
- [Cheung et al. 2019](https://www.cell.com/current-biology/fulltext/s0960-9822(19)31258-8); [Cutting et al. 2010](https://journals.sagepub.com/doi/10.1177/0956797610361679); [Solberg 2014](https://dj.dancecult.net/index.php/dancecult/article/view/451)
- [Franconeri & Simons](https://link.springer.com/article/10.3758/BF03194829); [Spence 2011](https://link.springer.com/article/10.3758/s13414-010-0073-7)
- [TikTok MediaScience](https://ads.tiktok.com/business/en-US/blog/mediascience-study-brands-memorable-tiktok); [Zannettou et al., CHI 2024](https://dl.acm.org/doi/fullHtml/10.1145/3613904.3642433)
- [W3C: three flashes](https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html); [Apple TN2258 on AAC priming](https://developer.apple.com/library/archive/technotes/tn2258/_index.html)
- Tools and reviews: [OpusClip virality score](https://help.opus.pro/docs/article/virality-score), [an OpusClip test](https://bigvu.tv/blog/opus-clip-tested-2026-where-ai-wins-40-percent-discard/), [CapCut beat editing](https://cursa.app/en/page/beat-based-editing-in-capcut-syncing-cuts-transitions-and-motion-to-music), [Premiere beat detection request](https://community.adobe.com/t5/premiere-pro-ideas/automatic-beat-detection/idi-p/14635575), [GoPro Quik moments](https://gopro.com/en/us/news/quik-moments-updates-and-gpmf)
- Models: [TinyCLIP](https://github.com/microsoft/Cream/tree/main/TinyCLIP) (MIT), [Spleeter](https://github.com/deezer/spleeter) (MIT) via [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx), [Beat This!](https://github.com/CPJKU/beat_this) (MIT)
