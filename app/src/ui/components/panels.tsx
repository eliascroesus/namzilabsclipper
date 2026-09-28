import { AudioWaveform, Clapperboard, Eye, EyeOff, Film, ImagePlus, MessageSquareQuote, Music, Plus, RotateCcw, Shuffle, Sparkles, Type, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { drawCard } from "../../engine/render/card";
import { loadFonts } from "../../engine/render/fonts";
import { FRAME_SIZE, type Aspect } from "../../engine/plan/types";
import { studio, type Format, type State } from "../studio";
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

/** Smart picks: on with a key, Gemini looks at stills of the footage to find the flex. */
function SmartPicks({ s }: { s: State }) {
  const [open, setOpen] = useState(false);
  const rating = s.footage.filter((f) => f.look === "queued" || f.look === "rating");
  const flex = s.footage.reduce((a, f) => a + (f.flexSeconds ?? 0), 0);
  const rated = s.footage.some((f) => f.look === "done");
  if (!s.geminiKey) {
    return (
      <div className="smart">
        <div className="row between">
          <span className="smart-title">
            <Sparkles size={14} /> Smart picks
          </span>
          <button type="button" className="btn ghost" onClick={() => setOpen(!open)}>
            {open ? "Not now" : "Turn on"}
          </button>
        </div>
        <span className="hint">Let Gemini see what's in your shots (the supercars, the watches, the views) so the edits open on the flex and skip the talking.</span>
        {open && <GeminiKey s={s} note="Only small stills of your footage go to Gemini, one every few seconds, never the video." />}
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
            ? "Off: it judges the footage by how it looks (sharp, bright, colourful, moving)."
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
                <div className="bar look" title="Gemini is looking at it">
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
  return (
    <div className="preview">
      <canvas ref={canvas} width={w} height={h} style={{ width: aspect === "9x16" ? 146 : aspect === "4x5" ? 208 : aspect === "1x1" ? 240 : 340 }} />
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
            <Segmented label="Device on the card" value={kit.kind} options={[{ value: "laptop", label: "Laptop (a website)" }, { value: "phone", label: "Phone (an app)" }]} onChange={(v) => studio.setKit({ kind: v })} />
          </div>
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

export function StylePanel({ s }: { s: State }) {
  const st = s.style;
  const aspects: { value: Aspect; label: string }[] = [
    { value: "9x16", label: "9:16" },
    { value: "4x3", label: "4:3" },
    { value: "1x1", label: "1:1" },
    { value: "4x5", label: "4:5" },
  ];
  return (
    <Section title="Style">
      <div className="field" style={{ marginTop: 0 }}>
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
          <label htmlFor="len">Length before the card</label>
          <span className="num muted">{st.length}s</span>
        </div>
        <input id="len" type="range" min={6} max={30} step={1} value={st.length} onChange={(e) => studio.setStyle({ length: Number(e.target.value) })} />
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
              <input id="cap" className="input" value={st.text} maxLength={80} placeholder={st.caption === "pov" ? "kimchi after retiring:" : "Peak life."} onChange={(e) => studio.setStyle({ text: e.target.value })} />
              {st.format === "twist" && (
                <>
                  <label htmlFor="cap2" style={{ marginTop: 6 }}>
                    After the flip
                  </label>
                  <input id="cap2" className="input" value={st.textB} maxLength={80} placeholder="what they don't..." onChange={(e) => studio.setStyle({ textB: e.target.value })} />
                </>
              )}
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
      <div className="field">
        <span className="label">How many edits</span>
        <Segmented label="Number of edits" value={st.variants} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} onChange={(v) => studio.setStyle({ variants: v })} />
        <span className="hint">Each one uses different moments and a different flourish.</span>
      </div>
    </Section>
  );
}
