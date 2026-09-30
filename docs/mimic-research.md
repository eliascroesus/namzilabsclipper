# Placing pictures on a talk: what the research says, and the plan

Research done in September 2026 for the Mimic page's automatic placement of the user's
pictures and clips (`app/src/mimic/match.ts`, `plan.ts`, `ai.ts`): open-source tools read
at the source, papers, the settings commercial tools expose, editing guides, and Google's
Gemini documentation. Many vendor pages could only be read through search extracts; where a
number comes from marketing rather than a measurement, it says so.

## What the others do

- **Open-source tools** place B-roll greedily or hand the choice to a language model. None
  optimises all the pictures together.
  - [ShortGPT](https://github.com/RayVentura/ShortGPT) asks a model for timed image queries
    and holds each image for at most 2 s.
  - [Vertigo](https://github.com/SysAdminDoc/Vertigo) picks keywords with KeyBERT and makes
    at most 3 inserts of 3 s, at least 5 s apart.
  - [video-editing-skill](https://github.com/maxazure/video-editing-skill) keeps the first
    3 s clear and holds cutaways for 2 to 3.5 s.
  - The [Reframe plan](https://github.com/Prekzursil/Reframe/blob/main/docs/plans/v1.5/flagship-auto-broll.md)
    caps coverage at 40 to 50%.
- **Commercial tools** expose a density setting (0 to 100, 50 by default in
  [Submagic's API](https://docs.submagic.co/api-reference/upload-project) and
  [ZapCap's](https://platform.zapcap.ai/docs/configuration/)) and layouts (full screen,
  split, picture in picture). None documents how it picks the exact frame.
- **B-Script** ([Huber et al., CHI 2019](https://arxiv.org/abs/1902.11216)) had 115 expert
  editors add B-roll to talking-head videos:
  - they put it on keyword mentions, and its content matched the keyword (73% within 1 s of
    the word);
  - they agreed with each other only loosely on the exact word (F1 0.26);
  - suggestions beat B-roll at a fixed interval, and the videos made with them were rated
    more engaging;
  - durations were clamped to 0.5 to 8 s, 2 s by default.
- **Timing.** Viewers notice sound ahead of the picture at about 45 ms, but a picture ahead
  of the sound only at about 125 ms
  ([ITU-R BT.1359](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1359-1-199811-I!!PDF-E.pdf)).
  So a picture a little early goes unnoticed and a late one reads as a mistake. Editors'
  own rules differ: some say land 0.2 to 0.5 s before the word, some after.
- **Reading time.** Text needs time: Netflix's subtitle rules allow 17 characters a second
  ([guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements)).
  The gist of a photo is taken in within a tenth of a second
  ([MIT](https://news.mit.edu/2014/in-the-blink-of-an-eye-0116)).

## What the page does now because of it

- **The places are chosen for all the pictures together.** A branch-and-bound search over
  each picture's best few words replaces best-first picking, which can cost a picture its
  only place.
- **Each picture lands on its word:** a card's slide ends as the word starts, and a cut
  comes two frames before it.
- **Holds depend on the picture:** a photo 1.2 to 2.5 s; a screenshot 2 to 3.5 s (text to
  read), and at least 1 s in a list.
- **The hook and the call to action are protected.** The first 1.5 s and the last 4 s take
  only pictures whose name, figure or words are said there, and a clip in the opening comes
  as a card, so the face opens the edit.
- **At most half the talk is covered by default** (a quarter to all, as set). Past that the
  least sure places are left out first.
- **Gemini's answers can be checked, and are:**
  - it quotes the words where each picture goes, before giving the number (field order set
    with `propertyOrdering`), and the quote is found in the script;
  - picture ids and the kind of match come from fixed lists;
  - pictures go at 640 px;
  - who a person is comes from the picture's name or text, never from a face (Google's
    models [aren't meant](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/image-understanding)
    to identify people who aren't celebrities).
- **Gemini 3 models are asked at their own temperature, with a low thinking level**, as the
  [Gemini 3 guide](https://ai.google.dev/gemini-api/docs/gemini-3) advises. The page picks
  the newest Flash model a key lists, so the reported shutdown of `gemini-2.5-flash`
  ([deprecations](https://ai.google.dev/gemini-api/docs/deprecations)) doesn't stop it.
- **More numbers are read:** Danish tens ("halvtreds" is 50, "firs" is 80), and the
  Norwegian and Swedish ones.

## The plan: next steps, most gain first

1. **Hear the names right in the first place.** While the speech model decodes, give a
   bonus to the tokens that continue a name the project knows: the pictures' names and the
   knowledge file's. This is NVIDIA NeMo's phrase boosting
   ([docs](https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/asr/asr_customization/word_boosting.html),
   [TurboBias](https://arxiv.org/abs/2508.07014)), and it works with the greedy search the
   page runs. The captions would then read "Iman Gadzhi", not "Imangachi". It costs no
   download, only a few hundred lines. Boost only the current project's names, or words
   that weren't said creep in.
2. **Weigh topics by meaning, not by stems.** A multilingual sentence embedding model would
   stand behind the stem lists and carry them to Swedish, Norwegian and German:
   - the pick is multilingual-e5-small (MIT), which is best among its size on the
     [Scandinavian Embedding Benchmark](https://arxiv.org/abs/2406.02396);
   - it's 118 MB in 8-bit, about 30 to 45 MB with its vocabulary cut to these languages;
   - it would take a few seconds for a two-minute script.
   It helps only for what a picture stands for, not for names or amounts.
3. **Learn the timing from the reference.** Measure how far each of the reference's cards
   comes from the word it shows, how long it stays and how dense the cards are, and use
   those numbers instead of the defaults.
4. **Let Gemini give candidates, not decisions.** Ask for its top three words per picture,
   with a confidence each, and let the search weigh them with the page's own.
5. **Build a test set.** Take 10 to 20 edits with pictures placed by hand and score the
   page at the sentence, or within a second. Even the experts in B-Script agree only
   loosely on the exact word.
6. **See pictures better.** TinyCLIP-39M/16 (MIT) tells apart far more than the 8M model
   used now, at a larger download.

Changes that aren't worth it here:

- **Sending Gemini the video.** It samples one frame a second, so it can't hit a word; the
  numbered transcript is more exact and cheaper.
- **Multilingual CLIP models** (135M parameters and up) are too big for a page.
- **Keeping the upload order**, with dynamic programming as the video editing papers do.
  It suits only a fixed order of pictures, which extras don't have.
