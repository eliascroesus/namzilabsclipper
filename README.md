# Namzilabs clipper

A clipping machine: paste YouTube links or drop in footage, get finished short-form edits cut to the music, each ending on a demo card for the product it promotes.

**Status:** research and first pieces. The reference edits are analysed and the demo card works; the pipeline itself is next ([build plan](docs/build-plan.md)).

| | |
|---|---|
| [`docs/edit-analysis.md`](docs/edit-analysis.md) | The reference edits taken apart: formats, measured cut timing, captions, and the demo card spec |
| [`docs/build-plan.md`](docs/build-plan.md) | How the machine works, the free stack, where it runs, milestones |
| [`docs/namzilabs-context.md`](docs/namzilabs-context.md) | Namzilabs as a product: the app, its look, the content rules |
| [`templates/endcard/laptop.html`](templates/endcard/laptop.html) | The demo end card (nio.trade style), every value a parameter |
| [`tools/analyze_edit.py`](tools/analyze_edit.py) | Breaks an edit down: cuts, beats, how tightly the cuts sit on the music, motion, contact sheets |
| [`tools/render_html.py`](tools/render_html.py) | Renders an HTML motion template to MP4, one exact frame at a time |
| [`reference-edits/`](reference-edits/) | Example Reels to learn from |
| [`screenshots/`](screenshots/) | Real screens of the Namzilabs app |

## Try it

```bash
pip install -r tools/requirements.txt && playwright install chromium

# The demo card: 9:16, arrow drawn on
python3 tools/render_html.py templates/endcard/laptop.html out/endcard.mp4 \
  --query "aspect=9x16&draw=1&top=start free&bottom=namzilabs.co"

# Nio's 4:3, another product
python3 tools/render_html.py templates/endcard/laptop.html out/endcard-4x3.mp4 \
  --query "aspect=4x3&top=join the waitlist&bottom=example.com&shot=/path/to/screenshot.png&accent=#5465FF"

# Take an edit apart
python3 tools/analyze_edit.py reference-edits/*.mp4 --out analysis/
```
