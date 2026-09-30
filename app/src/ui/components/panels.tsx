import { AudioWaveform, Clapperboard, Dices, Eye, EyeOff, Film, ImagePlus, MessageSquareQuote, Music, Plus, RotateCcw, Shuffle, Sparkles, Type, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { drawCard } from "../../engine/render/card";
import { loadFonts } from "../../engine/render/fonts";
import { FRAME_SIZE, type Aspect } from "../../engine/plan/types";
import type { Pace } from "../../engine/plan/rhythm";
import { EDIT_STYLES, paceOf } from "../../engine/plan/styles";
import { CARD_VIDEO_LENGTH, cardHoldOf, MAX_LENGTH, studio, type Format, type State, type Style } from "../studio";
import { Drop, fmtTime, Section, Segmented, Switch } from "./bits";
import { SongTimeline } from "./song";

const FORMATS: { value: Format; name: string; desc: string; icon: typeof Film }[] = [
  { value: "montage", name: "Montage", desc: "Your best moments, cut to the beat", icon: Film },
  { value: "story", name: "Story", desc: "The best bits of a long video, subtitled", icon: MessageSquareQuote },
  { value: "twist", name: "Twist", desc: "What they see vs what they don't", icon: Shuffle },
  { value: "meme", name: "Meme", desc: "One clip, a line of text, the song", icon: Type },
];

export function FormatPanel({ s }: { s: State }) {
  return (
    <Section title="Format">
      <div className="formats">
        {FORMATS.map((f) => (
          <button key={f.value} type="button" className="format" aria-pressed={s.style.format === f.value} onClick={() => studio.setStyle({ format: f.value })}>
            <span className="name">
              <f.icon size={15} strokeWidth={2.25} />
              {f.name}
            </span>
            <span className="desc">{f.desc}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

/** The Gemini key, shared by smart picks and story clips. */
function GeminiKey({ s, note }: { s: State; note: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor="gkey">Gemini key</label>
      <div className="row">
        <input id="gkey" className="input" type={show ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder="AIza..." value={s.geminiKey} onChange={(e) => studio.setGeminiKey(e.target.value)} />
        <button type="button" className="btn icon" aria-label={show ? "Hide the key" : "Show the key"} onClick={() => setShow(!show)}>
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      <span className="hint">
        Free from{" "}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: "var(--brand)" }}>
          Google AI Studio
        </a>
        , no card. It stays in this browser. {note}
      </span>
    </div>
  );
}

/**
 * Smart picks: a picture model in the page always looks at stills of the footage
 * to find the flex; with a key and the switch on, Gemini does it instead, sharper.
 */
function SmartPicks({ s }: { s: State }) {
  const [open, setOpen] = useState(false);
  const rating = s.footage.filter((f) => f.look === "queued" || f.look === "rating");
  const flex = s.footage.reduce((a, f) => a + (f.flexSeconds ?? 0), 0);
  const rated = s.footage.some((f) => f.look === "done");
  const local = rating.length
    ? `Looking at what's in ${rating.length === 1 ? rating[0].name : `${rating.length} clips`}...`
    : rated
      ? `Found ${fmtTime(flex)} of flex, right here in your browser.`
      : "A picture model in your browser sees what's in every shot (the supercars, the jets, the views) so the edits open on the flex and skip the talking and the desk.";
  if (!s.geminiKey) {
    return (
      <div className="smart">
        <div className="row between">
          <span className="smart-title">
            <Sparkles size={14} /> Smart picks
          </span>
          <button type="button" className="btn ghost" onClick={() => setOpen(!open)}>
            {open ? "Not now" : "Sharper with Gemini"}
          </button>
        </div>
        <span className="hint">{local}</span>
        {open && <GeminiKey s={s} note="Gemini judges the shots more sharply still. Only small stills of your footage go to it, one every few seconds, never the video." />}
      </div>
    );
  }
  return (
    <div className="smart">
      <Switch
        checked={s.style.smart}
        onChange={(v) => studio.setStyle({ smart: v })}
        hint={
          !s.style.smart
            ? `Off: ${local.charAt(0).toLowerCase()}${local.slice(1)}`
            : rating.length
              ? `Gemini is looking at ${rating.length === 1 ? rating[0].name : `${rating.length} clips`}...`
              : rated
                ? `Gemini found ${fmtTime(flex)} of flex. Only small stills went to Gemini, never the video.`
                : "Gemini looks at small stills of each clip, one every few seconds, to find the flex and skip the talking."
        }
      >
        <span className="smart-title">
          <Sparkles size={14} /> Smart picks
        </span>
      </Switch>
    </div>
  );
}

export function FootagePanel({ s }: { s: State }) {
  const ready = s.footage.filter((f) => f.status === "ready");
  const total = ready.reduce((a, f) => a + f.duration, 0);
  const twist = s.style.format === "twist";
  return (
    <Section title="Footage" right={s.footage.length ? <span className="num">{s.footage.length} {s.footage.length === 1 ? "file" : "files"}{total ? ` · ${fmtTime(total)}` : ""}</span> : undefined}>
      <Drop accept="video/*,image/*,.mov,.mp4,.m4v,.webm,.mkv,.jpg,.jpeg,.png,.webp" multiple onFiles={(f) => studio.addFootage(f)} tall={!s.footage.length}>
        {s.footage.length ? (
          <>
            <Plus size={16} /> Add more clips or photos
          </>
        ) : (
          <>
            <Clapperboard size={22} strokeWidth={2} />
            <span>
              <strong>Drop clips and photos</strong>
              <br />
              raw footage, screen recordings, a long video: it finds the best moments
            </span>
          </>
        )}
      </Drop>
      <SmartPicks s={s} />
      {twist && s.footage.length > 0 && <p className="hint" style={{ margin: "10px 0 0" }}>Tap a clip's tag to put it after the flip (<b style={{ color: "var(--orange)" }}>Real</b>): the work, the desk, the screen. Leave them all as Flex and it picks the calmest clip.</p>}
      {s.footage.length > 0 && (
        <div className="thumbs">
          {s.footage.map((f) => (
            <div key={f.id} className={`thumb${f.status === "error" ? " error" : ""}`} title={f.error ?? (f.skipped ? `${f.name}: leaving out ${fmtTime(f.skipped)} of sponsor reads, intro and outro (SponsorBlock)` : f.name)}>
              {f.thumb && <img src={f.thumb} alt={f.name} />}
              {f.status !== "ready" && (
                <div className="state">
                  {f.status === "error" ? <span className="error-text">{f.error}</span> : <span>{f.status === "reading" ? "Opening" : "Looking"}</span>}
                </div>
              )}
              {(f.status === "scanning" || f.status === "reading") && (
                <div className="bar">
                  <i style={{ width: `${Math.round(f.progress * 100)}%` }} />
                </div>
              )}
              {f.status === "ready" && <span className="badge">{f.kind === "image" ? "Photo" : fmtTime(f.duration)}</span>}
              {f.status === "ready" && (f.look === "queued" || f.look === "rating") && (
                <div className="bar look" title={f.lookBy === "gemini" ? "Gemini is looking at it" : "Looking at what's in it"}>
                  <i style={{ width: `${Math.round((f.lookProgress ?? 0) * 100)}%` }} />
                </div>
              )}
              {f.status === "ready" && f.look === "done" && f.heat && f.heat.length > 1 && (
                <div className="heat" title={`${fmtTime(f.flexSeconds ?? 0)} of flex`}>
                  {f.heat.map((h, i) => (
                    <i key={i} style={{ opacity: 0.15 + 0.85 * h * h }} />
                  ))}
                </div>
              )}
              {twist && f.status === "ready" && (
                <button type="button" className={`act${f.act === "b" ? " b" : ""}`} onClick={() => studio.setAct(f.id, f.act === "a" ? "b" : "a")} aria-label={`${f.name}: ${f.act === "a" ? "before" : "after"} the flip`}>
                  {f.act === "a" ? "Flex" : "Real"}
                </button>
              )}
              <button type="button" className="x" aria-label={`Remove ${f.name}`} onClick={() => studio.removeFootage(f.id)}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

export function SoundPanel({ s }: { s: State }) {
  const snd = s.sound;
  return (
    <Section
      title="Sound"
      right={
        snd ? (
          <button type="button" className="btn ghost icon" aria-label="Remove the sound" onClick={() => studio.clearSound()}>
            <X size={16} />
          </button>
        ) : undefined
      }
    >
      {!snd ? (
        <Drop accept="audio/*,video/*,.mp3,.m4a,.wav,.aac,.mp4,.mov,.webm" onFiles={(f) => void studio.setSound(f[0])} tall>
          <Music size={22} strokeWidth={2} />
          <span>
            <strong>Drop a Reel that uses the sound</strong>
            <br />
            or any song. It cuts to its beat and accents.
          </span>
        </Drop>
      ) : (
        <div>
          <div className="row between">
            <div style={{ minWidth: 0 }}>
              <div className="sound-name" title={snd.name}>
                {snd.name}
              </div>
              <div className="hint num">
                {snd.duration ? fmtTime(snd.duration) : ""}
                {snd.status === "error" && <span className="error-text"> {snd.error}</span>}
                {(snd.status === "reading" || snd.status === "analyzing") && ` · listening ${Math.round(snd.progress * 100)}%`}
              </div>
            </div>
            {snd.bpm !== undefined && (
              <div style={{ textAlign: "right" }}>
                <div className="big-number">{Math.round(snd.bpm)}</div>
                <div className="caps">bpm</div>
              </div>
            )}
          </div>
          {snd.status === "ready" && snd.bars && <SongTimeline s={s} />}
          {snd.status === "ready" && (
            <div className="field">
              <Switch checked={snd.fromReel} onChange={(v) => studio.setFromReel(v)} hint={snd.fromReel ? "Tap Use audio on that Reel and every cut lines up (the post note says where to start it)." : "A full song: the post note says where to start it in the app."}>
                It's from a Reel
              </Switch>
            </div>
          )}
          <div className="field">
            <Drop accept="audio/*,video/*,.mp3,.m4a,.wav,.aac,.mp4,.mov,.webm" onFiles={(f) => void studio.setSound(f[0])}>
              <AudioWaveform size={16} /> Use a different sound
            </Drop>
          </div>
        </div>
      )}
    </Section>
  );
}

const ACCENTS = ["#568CFF", "#5465FF", "#FFFFFF", "#FF8A5C", "#34C759"];

function CardPreview({ s }: { s: State }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const aspect: Aspect = s.style.aspect;
  const [W, H] = FRAME_SIZE[aspect];
  const k = 520 / Math.max(W, H);
  const w = Math.round(W * k);
  const h = Math.round(H * k);
  const own = s.kit.kind === "video" ? s.kit.video : undefined;
  useEffect(() => {
    let alive = true;
    void loadFonts().then(() => {
      const c = canvas.current;
      if (!alive || !c) return;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      const img = studio.getCardImage();
      drawCard(ctx, W, H, 2, 4, { kind: s.kit.kind, top: s.kit.top, bottom: s.kit.bottom, accent: s.kit.accent, hold: 4, draw: false }, { shot: img ?? undefined });
    });
    return () => {
      alive = false;
    };
  }, [s.kit, s.cardVersion, W, H, k]);
  const width = aspect === "9x16" ? 146 : aspect === "4x5" ? 208 : aspect === "1x1" ? 240 : 340;
  return (
    <div className="preview">
      {own ? (
        <video key={own.url} src={own.url} autoPlay muted loop playsInline style={{ width, aspectRatio: `${W} / ${H}`, objectFit: Math.abs(Math.log(own.aspect / (W / H))) < 0.03 ? "cover" : "contain", background: "#000" }} />
      ) : (
        <canvas ref={canvas} width={w} height={h} style={{ width }} />
      )}
    </div>
  );
}

export function CardPanel({ s }: { s: State }) {
  const kit = s.kit;
  return (
    <Section title="End card" right={<Switch checked={kit.enabled} onChange={(v) => studio.setKit({ enabled: v })}>{kit.enabled ? "On" : "Off"}</Switch>}>
      {kit.enabled ? (
        <>
          <CardPreview s={s} />
          <div className="field">
            <span className="label">On the card</span>
            <Segmented label="What's on the card" value={kit.kind} options={[{ value: "laptop", label: "Laptop" }, { value: "phone", label: "Phone" }, { value: "video", label: "Your video" }]} onChange={(v) => studio.setKit({ kind: v })} />
          </div>
          {kit.kind === "video" ? (
            <div className="field">
              <span className="label">Your card</span>
              {kit.video ? (
                <div className="shot-row">
                  <span className="name" title={kit.video.name}>
                    {kit.video.name}
                  </span>
                  <Drop accept="video/*,.mp4,.mov,.webm" onFiles={(f) => void studio.setKitVideo(f[0])}>
                    <Film size={15} /> Replace
                  </Drop>
                  <button type="button" className="btn ghost icon" aria-label="Remove your card video" onClick={() => void studio.clearKitVideo()}>
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <Drop accept="video/*,.mp4,.mov,.webm" onFiles={(f) => void studio.setKitVideo(f[0])}>
                  <Film size={16} /> Drop your end card video
                </Drop>
              )}
              <span className="hint">
                {kit.video
                  ? `${kit.video.length > CARD_VIDEO_LENGTH[1] + 0.05 ? `Its first ${CARD_VIDEO_LENGTH[1]}s play at the end (a card runs ${CARD_VIDEO_LENGTH[1]}s at most)` : `It plays whole at the end (${(Math.round(cardHoldOf(kit) * 10) / 10).toFixed(1)}s)`}, the song under it and its own sound off. It fills the frame when it's the edit's shape, and sits inside it when not.`
                  : "A motion design or any clip, MP4 or MOV, played whole at the end of every edit with the song under it. Until there is one, the laptop card stands in."}
              </span>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="card-top">Line above</label>
                <input id="card-top" className="input" value={kit.top} maxLength={40} onChange={(e) => studio.setKit({ top: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="card-bottom">Address or handle</label>
                <input id="card-bottom" className="input" value={kit.bottom} maxLength={40} onChange={(e) => studio.setKit({ bottom: e.target.value })} />
              </div>
              <div className="field">
                <span className="label">On the laptop</span>
                <div className="shot-row">
                  <img src={kit.shot} alt="" />
                  <span className="name" title={kit.shotName}>
                    {kit.shotName}
                  </span>
                  <Drop accept="image/*" onFiles={(f) => void studio.setKitShot(f[0])}>
                    <ImagePlus size={15} /> Replace
                  </Drop>
                  <button type="button" className="btn ghost icon" aria-label="Back to the default screenshot" onClick={() => void studio.resetKitShot()}>
                    <RotateCcw size={15} />
                  </button>
                </div>
                <span className="hint">{kit.kind === "phone" ? "A phone screenshot of the app. The top of it shows." : "A screenshot of the product's page, landscape. The top of it shows."}</span>
              </div>
              <div className="field">
                <span className="label">Arrow</span>
                <div className="row between">
                  <div className="swatches">
                    {ACCENTS.map((c) => (
                      <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={`Arrow colour ${c}`} aria-pressed={kit.accent.toUpperCase() === c} onClick={() => studio.setKit({ accent: c })} />
                    ))}
                    <span className="swatch custom" title="Any colour">
                      <input type="color" value={kit.accent} onChange={(e) => studio.setKit({ accent: e.target.value })} aria-label="Pick an arrow colour" />
                    </span>
                  </div>
                  <Switch checked={kit.draw} onChange={(v) => studio.setKit({ draw: v })}>
                    Draw it on
                  </Switch>
                </div>
              </div>
              <div className="field">
                <div className="row between">
                  <label htmlFor="card-hold">Card on screen</label>
                  <span className="num muted">{kit.hold.toFixed(1)}s</span>
                </div>
                <input id="card-hold" type="range" min={3} max={8} step={0.5} value={kit.hold} onChange={(e) => studio.setKit({ hold: Number(e.target.value) })} />
              </div>
            </>
          )}
        </>
      ) : (
        <p className="hint" style={{ margin: 0 }}>The edits end without a promo.</p>
      )}
    </Section>
  );
}

export function StoryPanel({ s }: { s: State }) {
  const st = s.story;
  return (
    <Section title="Story">
      <p className="hint" style={{ margin: 0 }}>
        It listens to the longest video you dropped, finds the moments that stand on their own, and cuts each into a clip: the hook on frame one, the pauses cut, subtitles, a burst of the best shots to the song, then your card.
      </p>
      <GeminiKey s={s} note="For story clips only the video's sound goes to Gemini; with smart picks on, small stills too." />
      <div className="field">
        <span className="label">Clip length</span>
        <Segmented label="Clip length" value={st.clipLength} options={[{ value: "short", label: "12 to 25s" }, { value: "medium", label: "18 to 40s" }, { value: "long", label: "30 to 60s" }]} onChange={(v) => studio.setClipLength(v)} />
      </div>
      <div className="field">
        <span className="label">How many clips</span>
        <Segmented label="Number of clips" value={s.style.variants} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} onChange={(v) => studio.setStyle({ variants: v })} />
      </div>
      <div className="field">
        <span className="label">Frame</span>
        <Segmented label="Frame" value={s.style.aspect} options={[{ value: "4x3", label: "4:3" }, { value: "9x16", label: "9:16" }, { value: "1x1", label: "1:1" }, { value: "4x5", label: "4:5" }]} onChange={(v) => studio.setStyle({ aspect: v })} />
        <span className="hint">nio.trade posts story clips in 4:3, keeping the YouTube frame whole.</span>
      </div>
      <div className="field">
        <Switch checked={s.style.faces} onChange={(v) => studio.setStyle({ faces: v })} hint={s.style.faces ? "The crop follows the people in each shot, so faces stay in frame. A small face finder runs in this browser." : "Off: the crop goes where the picture's interest is."}>
          Face tracking
        </Switch>
      </div>
      <div className="field">
        <span className="label">Look</span>
        <Segmented label="Look" value={s.style.look} options={[{ value: "warm", label: "Warm film" }, { value: "natural", label: "As shot" }]} onChange={(v) => studio.setStyle({ look: v })} />
      </div>
    </Section>
  );
}

const CUTTING: { value: Pace; label: string }[] = [
  { value: "hard", label: "Hard" },
  { value: "beat", label: "Steady" },
  { value: "relaxed", label: "Relaxed" },
];

/** How hard a montage cuts on the music; slow and fast re-cuts have their own pace. */
function CuttingField({ st }: { st: Style }) {
  const own = st.edit === "slow" || st.edit === "recut" ? paceOf(st.edit, st.cutting) : undefined;
  const mix = st.edit === "mix";
  const hint =
    st.edit === "slow"
      ? "Slow and cinematic keeps its long holds."
      : st.edit === "recut"
        ? "Fast re-cuts always cut hard."
        : st.cutting === "hard"
          ? `A cut on every hit that stands out (every stab of an intro), on every beat into the drop, and fast after it.${mix ? " A mix leaves out the slow style." : ""}`
          : st.cutting === "beat"
            ? "The reference editors' rhythm: two beats a shot into the drop, their pattern after it, and a cut on the hits that stand out."
            : `Longer shots: a cut on the biggest hits only.${mix ? " A mix leaves out the fast re-cuts." : ""}`;
  return (
    <div className="field">
      <span className="label">Cutting</span>
      <Segmented label="Cutting" value={own ?? st.cutting} options={CUTTING} disabled={!!own} onChange={(v) => studio.setStyle({ cutting: v })} />
      <span className="hint">{hint}</span>
    </div>
  );
}

export function StylePanel({ s }: { s: State }) {
  const st = s.style;
  const hold = cardHoldOf(s.kit);
  const aspects: { value: Aspect; label: string }[] = [
    { value: "9x16", label: "9:16" },
    { value: "4x3", label: "4:3" },
    { value: "1x1", label: "1:1" },
    { value: "4x5", label: "4:5" },
  ];
  return (
    <Section title="Style">
      {st.format === "montage" && (
        <div className="field" style={{ marginTop: 0 }}>
          <span className="label">Edit style</span>
          <div className="formats styles">
            <button type="button" className="format" aria-pressed={st.edit === "mix"} onClick={() => studio.setStyle({ edit: "mix" })}>
              <span className="name">
                <Dices size={15} strokeWidth={2.25} />
                Mix
              </span>
              <span className="desc">Each edit in the batch in another style.</span>
            </button>
            {EDIT_STYLES.map((e) => (
              <button key={e.value} type="button" className="format" aria-pressed={st.edit === e.value} onClick={() => studio.setStyle({ edit: e.value })}>
                <span className="name">{e.name}</span>
                <span className="desc">{e.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {st.format === "montage" && <CuttingField st={st} />}
      <div className="field" style={st.format === "montage" ? undefined : { marginTop: 0 }}>
        <span className="label">Frame</span>
        <Segmented label="Frame" value={st.aspect} options={aspects} onChange={(v) => studio.setStyle({ aspect: v })} />
        <span className="hint">{st.aspect === "4x3" ? "How nio.trade posts: a YouTube frame kept whole." : st.aspect === "9x16" ? "Full screen. Wide footage is cropped to follow the subject." : st.aspect === "1x1" ? "Square, like the brezscales meme." : "The feed's tallest post."}</span>
      </div>
      <div className="field">
        <Switch checked={st.faces} onChange={(v) => studio.setStyle({ faces: v })} hint={st.faces ? "The crop follows the people in each shot, so faces stay in frame. A small face finder runs in this browser." : "Off: the crop goes where the picture's interest is."}>
          Face tracking
        </Switch>
      </div>
      <div className="field">
        <div className="row between">
          <label htmlFor="len">Length</label>
          <span className="num muted">{Math.round(st.length + hold)}s</span>
        </div>
        <input id="len" type="range" min={Math.round(6 + hold)} max={Math.round(MAX_LENGTH + hold)} step={1} value={Math.round(st.length + hold)} onChange={(e) => studio.setLength(Number(e.target.value) - hold)} />
        <span className="hint">{hold ? `The whole edit, the card's last ${Math.round(hold * 10) / 10}s included. The card comes in on a bar line.` : "The whole edit. It ends on a bar line."}</span>
      </div>
      {st.format === "meme" ? (
        <>
          <div className="field">
            <label htmlFor="meme">The text</label>
            <textarea id="meme" className="textarea" placeholder={"when she tries to talk to me\nbut all i hear in my head is this.."} value={st.memeText} onChange={(e) => studio.setStyle({ memeText: e.target.value })} />
          </div>
          <div className="field">
            <span className="label">Where it sits</span>
            <Segmented label="Text position" value={st.memePosition} options={[{ value: "upper", label: "Upper third" }, { value: "centre", label: "Centre" }]} onChange={(v) => studio.setStyle({ memePosition: v })} />
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <span className="label">Caption</span>
            <Segmented
              label="Caption"
              value={st.caption}
              options={
                st.format === "twist"
                  ? [
                      { value: "meme", label: "Two lines" },
                      { value: "none", label: "None" },
                    ]
                  : [
                      { value: "mood", label: "Mood line" },
                      { value: "pov", label: "POV" },
                      { value: "meme", label: "Text" },
                      { value: "none", label: "None" },
                    ]
              }
              onChange={(v) => studio.setStyle({ caption: v })}
            />
          </div>
          {st.caption !== "none" && (
            <div className="field">
              <label htmlFor="cap">{st.format === "twist" ? "Before the flip" : "Text"}</label>
              <textarea id="cap" className="textarea line" rows={1} value={st.text} maxLength={160} placeholder={st.caption === "pov" ? "kimchi after retiring:" : "Peak life."} onChange={(e) => studio.setStyle({ text: e.target.value })} />
              {st.format === "twist" && (
                <>
                  <label htmlFor="cap2" style={{ marginTop: 6 }}>
                    After the flip
                  </label>
                  <textarea id="cap2" className="textarea line" rows={1} value={st.textB} maxLength={160} placeholder="what they don't..." onChange={(e) => studio.setStyle({ textB: e.target.value })} />
                </>
              )}
              <span className="hint">Press Enter for a new line.</span>
            </div>
          )}
        </>
      )}
      <div className="field">
        <span className="label">Look</span>
        <Segmented label="Look" value={st.look} options={[{ value: "warm", label: "Warm film" }, { value: "natural", label: "As shot" }]} onChange={(v) => studio.setStyle({ look: v })} />
        <span className="hint">{st.look === "warm" ? "The nio.trade grade: warm highlights, soft contrast, a little grain and vignette." : "No grade: for footage that's already graded."}</span>
      </div>
      {st.format !== "meme" && (
        <div className="field">
          <Switch checked={st.velocity} onChange={(v) => studio.setStyle({ velocity: v })} hint={st.velocity ? "Each shot hits in slow motion on the beat, then rushes into the next cut (smoothest with 60 fps footage)." : "Off: shots play at their own speed."}>
            Velocity (speed ramps)
          </Switch>
        </div>
      )}
      {st.format === "montage" && (
        <div className="field">
          <Switch
            checked={st.loop}
            onChange={(v) => studio.setStyle({ loop: v })}
            hint={s.kit.enabled ? "With the end card on, the edit ends on the card." : st.loop ? "The last shot runs into the first, so the replay has no seam (TJR). Not after talking." : "Off: the edit ends on its last shot."}
          >
            Loop the ending
          </Switch>
        </div>
      )}
      <div className="field">
        <span className="label">How many edits</span>
        <Segmented label="Number of edits" value={st.variants} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} onChange={(v) => studio.setStyle({ variants: v })} />
        <span className="hint">{st.format === "montage" && st.edit === "mix" ? "Each one in another style, with its own moments and flourish." : "Each one uses different moments and a different flourish."}</span>
      </div>
    </Section>
  );
}
