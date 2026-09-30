import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardPaste, Download, Film, Image as ImageIcon, Music, Play, Sparkles, Square, Volume2, X } from "lucide-react";
import { Drop, fmtBytes, fmtTime, Mark, Section, Segmented, Switch } from "../../ui/components/bits";
import { sentences, type Sentence } from "../match";
import { SOUNDS } from "../sfx";
import type { CaptionLook, CardSlot, MimicPlan, MimicTemplate } from "../types";
import { CaptionPreview } from "./CaptionPreview";
import { SoundCard } from "./SoundCard";
import { fromPaste, PASTE_KEY } from "./paste";
import { mimic, useMimic, type Item, type Job, type State } from "./store";

function Bar({ job }: { job: Job }) {
  if (job.stage !== "working") return null;
  return (
    <div className="job">
      <div className="bar-line">
        <i style={{ width: `${Math.round(job.progress * 100)}%` }} />
      </div>
      <span className="hint">{job.label}</span>
    </div>
  );
}

function Problem({ job }: { job: Job }) {
  return job.stage === "error" ? <div className="banner bad">{job.error}</div> : null;
}

function ItemRow({ item, icon }: { item: Item; icon: React.ReactNode }) {
  return (
    <div className="shot-row">
      {item.thumb ? <img src={item.thumb} alt="" /> : <span className="glyph">{icon}</span>}
      <span className="name" title={item.name}>
        {item.name}
      </span>
      {item.duration > 0 && <span className="muted num">{fmtTime(item.duration)}</span>}
    </div>
  );
}

function ReferencePanel({ s }: { s: State }) {
  return (
    <Section title="1 · The edit to copy">
      <Drop accept="video/*" onFiles={(f) => void mimic.setReference(f[0])} tall={!s.reference}>
        <Film size={16} /> <strong>{s.reference ? "Drop another" : "Drop the ad or video"}</strong>
        {!s.reference && <span>its captions, cards, zooms and sound are copied</span>}
      </Drop>
      {s.reference && s.reference.status !== "reading" && (
        <div className="field">
          <ItemRow item={s.reference} icon={<Film size={14} />} />
        </div>
      )}
      <Bar job={s.study} />
      <Problem job={s.study} />
    </Section>
  );
}

function FootagePanel({ s }: { s: State }) {
  return (
    <Section title="2 · Your footage">
      <Drop accept="video/*" onFiles={(f) => void mimic.setFootage(f[0])} tall={!s.footage}>
        <Film size={16} /> <strong>{s.footage ? "Drop another" : "Drop your raw video"}</strong>
        {!s.footage && <span>the talking you want edited like the reference</span>}
      </Drop>
      {s.footage && s.footage.status !== "reading" && (
        <div className="field">
          <ItemRow item={s.footage} icon={<Film size={14} />} />
        </div>
      )}
      <Bar job={s.hearing} />
      <Problem job={s.hearing} />
      <div className="field">
        <Switch checked={s.clip} onChange={(v) => mimic.setOption({ clip: v })} hint={`Cut the pauses down to the reference's (${s.template ? `${s.template.maxPause.toFixed(2)} s` : "its longest"}). Off: your cut stays as it is.`}>
          Also clip the footage
        </Switch>
      </div>
      <div className="field">
        <span className="label">Captions heard by</span>
        <Segmented
          label="Captions heard by"
          value={s.ear}
          onChange={(v) => mimic.setOption({ ear: v })}
          options={[
            { value: "local", label: "This computer" },
            { value: "gemini", label: "+ Gemini" },
          ]}
        />
        <span className="hint">
          {s.ear === "local"
            ? "A speech model for 25 European languages runs here (a 670 MB download the first time, then kept in the browser). Nothing is uploaded."
            : "The words are also checked by Gemini with your key (the sound is sent to Google); the timing stays this computer's."}
        </span>
        {s.ear === "gemini" && <input className="input" type="password" placeholder="Gemini API key" value={s.geminiKey} onChange={(e) => mimic.setKey(e.target.value.trim())} />}
        {s.footage && s.hearing.stage !== "working" && (
          <button type="button" className="btn" onClick={() => void mimic.hear()}>
            Hear it again
          </button>
        )}
      </div>
      {s.hearing.stage === "ready" && (
        <div className="field">
          <label htmlFor="words">The words (fix any; each keeps its time)</label>
          <textarea id="words" className="textarea words" value={s.text} onChange={(e) => mimic.setText(e.target.value)} spellCheck={false} />
        </div>
      )}
    </Section>
  );
}

function PasteNote({ s, where }: { s: State; where: "extras" | "slots" }) {
  return s.pasted?.where === where ? (
    <div className={`paste-note${s.pasted.bad ? " bad" : ""}`} role="status">
      {s.pasted.text}
    </div>
  ) : null;
}

function ExtrasPanel({ s }: { s: State }) {
  return (
    <Section title="3 · Extras" right={s.extras.length ? `${s.extras.length}` : undefined}>
      <Drop accept="image/*,video/*" multiple onFiles={(f) => void mimic.addExtras(f)}>
        <ImageIcon size={16} /> <strong>Drop or paste pictures and clips</strong>
      </Drop>
      <div className="paste-row">
        <button type="button" className="btn" onClick={() => void mimic.pasteFromClipboard()}>
          <ClipboardPaste size={14} /> Paste
        </button>
        <span className="hint">
          or press <kbd>{PASTE_KEY}</kbd> anywhere on this page after copying a picture (right-click it in any tab, Copy image).
        </span>
      </div>
      <PasteNote s={s} where="extras" />
      <span className="hint">They go in the reference's cards and cutaways, in this order (or pick for each slot on the right), cropped to the same shapes.</span>
      {s.extras.length > 0 && (
        <div className="thumbs">
          {s.extras.map((e, i) => (
            <div key={e.id} className={`thumb${e.status === "error" ? " error" : ""}`} title={e.error ?? e.name}>
              {e.thumb ? <img src={e.thumb} alt="" /> : <div className="state">{e.status === "reading" ? "Reading" : e.error ?? e.name}</div>}
              <span className="badge">{i + 1}</span>
              <button type="button" className="x" aria-label={`Remove ${e.name}`} onClick={() => mimic.removeExtra(e.id)}>
                <X size={12} />
              </button>
              <span className="order">
                <button type="button" aria-label="Earlier" onClick={() => mimic.moveExtra(e.id, -1)}>
                  <ArrowUp size={11} />
                </button>
                <button type="button" aria-label="Later" onClick={() => mimic.moveExtra(e.id, 1)}>
                  <ArrowDown size={11} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function SoundPanel({ s }: { s: State }) {
  const bed = s.template?.sound.bed;
  const own = s.sounds.filter((x) => x.status === "ready");
  return (
    <Section title="4 · Sound and ending">
      <Drop accept="audio/*,video/*" onFiles={(f) => void mimic.setMusic(f[0])}>
        <Music size={16} /> <strong>{s.music ? s.music.name : "Drop music (optional)"}</strong>
      </Drop>
      {s.music?.status === "error" && <div className="error-text">{s.music.error}</div>}
      {s.music && s.music.status === "ready" ? (
        <div className="field">
          <label className="slider">
            <span>Music volume</span>
            <input type="range" min={-24} max={12} step={1} value={s.musicDb} onChange={(e) => mimic.setMusicOption({ musicDb: Number(e.target.value) })} />
            <span className="num">{s.musicDb > 0 ? "+" : ""}{s.musicDb} dB</span>
          </label>
          <span className="hint">{bed ? `The reference has music ${-bed.level} dB under the voice; this moves yours up or down from there.` : "Up or down from 18 dB under the voice."} Shape it stretch by stretch on the Sound timeline.</span>
          <label className="slider">
            <span>Comes in</span>
            <select className="select" value={s.musicAt} onChange={(e) => mimic.setMusicOption({ musicAt: e.target.value as State["musicAt"] })}>
              <option value="bed">{bed ? `where the reference's does (${bed.start.toFixed(0)} s through its talk)` : "from the start"}</option>
              <option value="start">from the start</option>
            </select>
          </label>
          <label className="slider">
            <span>Start the song at</span>
            <input className="input num" type="number" min={0} max={Math.max(0, Math.floor(s.music.duration - 1))} step={1} value={s.musicFrom} onChange={(e) => mimic.setMusicOption({ musicFrom: Math.max(0, Number(e.target.value) || 0) })} />
            <span className="hint">s</span>
          </label>
          <button type="button" className="btn ghost" onClick={() => void mimic.setMusic(null)}>
            Remove the music
          </button>
        </div>
      ) : (
        <span className="hint">{bed ? `The reference has music under the voice from ${bed.start.toFixed(1)} s, ${-bed.level} dB down. Yours comes in at the same point, as far down.` : "Music you add plays under the voice."}</span>
      )}
      <div className="field">
        <span className="label">Sound effects</span>
        <Segmented
          label="Sound effects"
          value={s.sfxMode}
          onChange={(v) => mimic.setSfx({ sfxMode: v })}
          options={[
            { value: "none", label: "None" },
            { value: "moves", label: "On the moves" },
            { value: "script", label: "Moves + script" },
          ]}
        />
        <span className="hint">
          {s.sfxMode === "none"
            ? "No sound effects (add your own on the Sound timeline)."
            : s.sfxMode === "moves"
              ? "A whoosh as each card slides in and out and into each cutaway, a swipe as a card's picture changes."
              : mimic.canAsk()
                ? "The moves, and Gemini picks moments in your script for a sound: a cash register on money, a ding on a key point, a boom on a big claim."
                : "The moves, and a cash register where money is said. With + Gemini chosen above, Gemini picks the moments."}
        </span>
        {s.sfxMode !== "none" && (
          <>
            <label className="slider">
              <span>The moves sound like</span>
              <select className="select" value={s.sfxMove} onChange={(e) => mimic.setSfx({ sfxMove: e.target.value })}>
                {SOUNDS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
                {own.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn icon" aria-label="Hear it" onClick={() => void mimic.hearSound(s.sfxMove)}>
                <Play size={12} />
              </button>
            </label>
            <label className="slider">
              <span>Effects volume</span>
              <input type="range" min={-18} max={12} step={1} value={s.sfxDb} onChange={(e) => mimic.setSfx({ sfxDb: Number(e.target.value) })} />
              <span className="num">{s.sfxDb > 0 ? "+" : ""}{s.sfxDb} dB</span>
            </label>
          </>
        )}
        <Drop accept="audio/*" multiple onFiles={(f) => void mimic.addSounds(f)}>
          <Volume2 size={14} /> <strong>Drop your own sounds</strong>
        </Drop>
        {s.sounds.length > 0 && (
          <div className="own-sounds">
            {s.sounds.map((x) => (
              <div key={x.id} className="row between">
                <span className={x.status === "error" ? "error-text" : ""} title={x.error ?? x.name}>
                  {x.status === "reading" ? "Reading " : ""}
                  {x.name}
                </span>
                <span className="row">
                  {x.status === "ready" && (
                    <button type="button" className="btn icon" aria-label={`Hear ${x.name}`} onClick={() => void mimic.hearSound(x.id)}>
                      <Play size={12} />
                    </button>
                  )}
                  <button type="button" className="btn icon" aria-label={`Remove ${x.name}`} onClick={() => mimic.removeSound(x.id)}>
                    <X size={12} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {s.template && s.template.tail > 0.2 && (
        <div className="field">
          <Switch checked={s.tail} onChange={(v) => mimic.setOption({ tail: v })} hint={`The reference ends on ${s.template.tail.toFixed(1)} s of black.`}>
            End on black
          </Switch>
        </div>
      )}
    </Section>
  );
}

const motionText = (c: CardSlot) => {
  const m = c.enter;
  const on = m.kind === "slide" ? `slides in from the ${m.from}` : m.kind === "cut" ? "cuts in" : m.kind === "fade" ? "fades in" : "pops in";
  const x = c.exit;
  const off = x.kind === "slide" ? `out to the ${x.from}` : x.kind === "cut" ? "cuts out" : "fades out";
  return `${on}, ${off}`;
};

/** Where a run (its first card) or a cutaway sits in the edit, why, and a sentence of the footage to move it to. */
function Placed({ s, plan, slot, sents }: { s: State; plan: MimicPlan | null; slot: string; sents: Sentence[] }) {
  const t = plan?.cards.find((c) => c.slot === slot)?.start ?? plan?.broll.find((b) => b.slot === slot)?.start;
  const p = mimic.lastPlaces[slot];
  const by = p?.by === "gemini" ? "Gemini: " : p?.by === "words" ? "your words: " : p?.by === "you" ? "you put it at: " : "";
  const moved = s.moved[slot];
  return (
    <div className="placed">
      <span className="hint">
        {t === undefined ? "not in the edit (nothing to put in it)" : `at ${fmtTime(t)}`}
        {p?.said ? ` · ${by}"${p.said.length > 70 ? `${p.said.slice(0, 70)}…` : p.said}"` : t !== undefined ? " · as in the reference" : ""}
      </span>
      {sents.length > 0 && t !== undefined && (
        <select className="select" aria-label="Move it to a sentence" value={moved === undefined ? "" : String(sents.find((x) => Math.abs(x.start - moved) < 0.05)?.i ?? "")} onChange={(e) => mimic.moveSlot(slot, e.target.value === "" ? null : sents[Number(e.target.value)].start)}>
          <option value="">{moved === undefined ? "Move to…" : "Put it back"}</option>
          {sents.map((x) => (
            <option key={x.i} value={x.i}>
              {fmtTime(x.start)} {x.text.length > 60 ? `${x.text.slice(0, 60)}…` : x.text}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function SlotRow({ s, id, label, detail, thumb, want, place }: { s: State; id: string; label: string; detail: string; thumb?: string; want: string; place?: React.ReactNode }) {
  const value = id in s.assign ? (s.assign[id] ?? "none") : "auto";
  const waiting = s.pasteSlot === id;
  return (
    <div className={`slot${waiting ? " waiting" : ""}`}>
      {thumb ? <img src={thumb} alt="" /> : <span className="glyph" />}
      <div className="slot-text">
        <strong>{label}</strong>
        <span className="hint">
          {waiting ? (
            <>
              Press <kbd>{PASTE_KEY}</kbd> to paste a copied picture here.{" "}
              <button type="button" className="link" onClick={() => mimic.cancelPaste()}>
                Cancel
              </button>
            </>
          ) : (
            detail
          )}
        </span>
        {place}
      </div>
      <button type="button" className="btn icon" title={`Paste a copied picture into ${label}`} aria-label={`Paste a copied picture into ${label}`} onClick={() => void mimic.pasteFromClipboard(id)}>
        <ClipboardPaste size={14} />
      </button>
      <select className="select" aria-label={`What goes in ${label}`} value={value} onChange={(e) => mimic.assignSlot(id, e.target.value === "auto" ? undefined : e.target.value === "none" ? null : e.target.value)}>
        <option value="auto">Next extra ({want})</option>
        <option value="none">Leave out</option>
        {s.extras
          .filter((e) => e.status === "ready")
          .map((e, i) => (
            <option key={e.id} value={e.id}>
              {i + 1}. {e.name}
            </option>
          ))}
      </select>
    </div>
  );
}

function Slots({ s, t, plan }: { s: State; t: MimicTemplate; plan: MimicPlan | null }) {
  const sents = useMemo(() => sentences(s.words), [s.words]);
  if (!t.cards.length && !t.broll.length) return <p className="hint">The reference has no cards or cutaways over the talk.</p>;
  const firstOfRun = new Map<number, string>();
  for (const c of t.cards) if (!firstOfRun.has(c.run)) firstOfRun.set(c.run, c.id);
  const rows = [
    ...t.cards.map((c, i) => {
      const lead = firstOfRun.get(c.run)!;
      const leadNo = t.cards.findIndex((x) => x.id === lead) + 1;
      return {
        at: c.start,
        node: (
          <SlotRow
            key={c.id}
            s={s}
            id={c.id}
            thumb={c.thumb}
            want={c.content === "video" ? "a clip" : "a picture"}
            label={`Card ${i + 1} at ${fmtTime(c.start)}`}
            detail={`${Math.round(c.rect[2] * 100)}% wide, ${motionText(c)}, ${c.content}${c.said ? `, over "${c.said}"` : ""}`}
            place={lead === c.id ? <Placed s={s} plan={plan} slot={c.id} sents={sents} /> : <span className="hint">moves with card {leadNo}</span>}
          />
        ),
      };
    }),
    ...t.broll.map((b, i) => ({
      at: b.start,
      node: <SlotRow key={b.id} s={s} id={b.id} thumb={b.thumb} want="a clip" label={`Cutaway ${i + 1} at ${fmtTime(b.start)}`} detail={`full frame for ${(b.end - b.start).toFixed(1)} s${b.zoom[1] > 1.05 ? `, pushing in ${Math.round((b.zoom[1] - 1) * 100)}%` : ""}`} place={<Placed s={s} plan={plan} slot={b.id} sents={sents} />} />,
    })),
  ].sort((a, b) => a.at - b.at);
  return <div className="slots">{rows.map((r) => r.node)}</div>;
}

function LookControls({ s }: { s: State }) {
  const l = s.look;
  const set = (p: Partial<CaptionLook>) => mimic.setLook(p);
  return (
    <div className="look">
      <label>
        Height <input type="range" min={0.1} max={0.92} step={0.005} value={l.y} onChange={(e) => set({ y: Number(e.target.value) })} /> <span className="num">{Math.round(l.y * 100)}%</span>
      </label>
      <label>
        Size <input type="range" min={0.015} max={0.09} step={0.001} value={l.maxSize} onChange={(e) => set({ maxSize: Number(e.target.value), minSize: Math.min(l.minSize, Number(e.target.value)) })} /> <span className="num">{Math.round(l.maxSize * 1920)} px</span>
      </label>
      <label>
        Width <input type="range" min={0.2} max={0.95} step={0.005} value={l.width} onChange={(e) => set({ width: Number(e.target.value) })} /> <span className="num">{Math.round(l.width * 100)}%</span>
      </label>
      <label>
        Weight
        <select className="select" value={l.weight} onChange={(e) => set({ weight: Number(e.target.value) })}>
          {[400, 500, 600, 700, 800, 900].map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </label>
      <label>
        Colour <input type="color" value={l.color.slice(0, 7)} onChange={(e) => set({ color: e.target.value })} />
      </label>
      <label>
        Lines
        <select className="select" value={l.lines} onChange={(e) => set({ lines: Number(e.target.value) as 1 | 2 | 3 })}>
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </label>
      <label>
        Words come
        <select className="select" value={l.reveal} onChange={(e) => set({ reveal: e.target.value as CaptionLook["reveal"] })}>
          <option value="word">one by one</option>
          <option value="line">a line at a time</option>
          <option value="page">all at once</option>
        </select>
      </label>
      <label>
        Letters
        <select className="select" value={l.case} onChange={(e) => set({ case: e.target.value as CaptionLook["case"] })}>
          <option value="as-said">As said</option>
          <option value="upper">CAPITALS</option>
          <option value="lower">lowercase</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={l.fit} onChange={(e) => set({ fit: e.target.checked })} /> Fit each line to the width
      </label>
      <label className="check">
        <input type="checkbox" checked={!!l.shadow} onChange={(e) => set({ shadow: e.target.checked ? { color: "rgba(0,0,0,0.35)", blur: 0.25, y: 0.04 } : null })} /> Shadow
      </label>
      <label className="check">
        <input type="checkbox" checked={!!l.stroke} onChange={(e) => set({ stroke: e.target.checked ? { color: "#000000", width: 0.08 } : null })} /> Outline
      </label>
    </div>
  );
}

function Preview() {
  const [stills, setStills] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const ready = !mimic.why();
  useEffect(() => () => stills.forEach((u) => URL.revokeObjectURL(u)), [stills]);
  if (!ready) return null;
  const run = async () => {
    setBusy(true);
    try {
      const plan = mimic.plan();
      if (!plan) return;
      const times = [1.2, 2.2, ...plan.cards.slice(0, 3).map((c) => (c.start + c.end) / 2), plan.duration * 0.4, plan.duration * 0.7].filter((t, i, a) => t < plan.duration && a.findIndex((x) => Math.abs(x - t) < 0.3) === i).slice(0, 6);
      setStills(await mimic.preview(times));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="field">
      <div className="row between">
        <span className="caps">Preview</span>
        <button type="button" className="btn" disabled={busy} onClick={() => void run()}>
          {busy ? "Drawing" : stills.length ? "Draw again" : "Draw a few frames"}
        </button>
      </div>
      {stills.length > 0 && (
        <div className="stills">
          {stills.map((u) => (
            <img key={u} src={u} alt="" />
          ))}
        </div>
      )}
    </div>
  );
}

function Outputs({ s }: { s: State }) {
  const t = s.template;
  const plan = useMemo(() => (t && s.footage ? mimic.plan() : null), [s, t]);
  return (
    <>
      <div className="outputs-head">
        <h1>Mimic an edit</h1>
      </div>
      {!s.reference && (
        <div className="intro">
          <p>Drop an ad or video you want yours to look like, then your raw footage. The page studies the reference on this computer: where its captions sit and how big, how they come on word by word, the cards that slide over the talk, the cutaways, the zooms, the sound under it and how it ends. Then it edits your footage the same way, with captions from your own words and your pictures in its cards.</p>
        </div>
      )}
      {s.result && (
        <div className="result">
          <video src={s.result.url} controls playsInline />
          <div className="row between">
            <span className="muted num">
              {fmtTime(s.result.duration)} · {fmtBytes(s.result.bytes)} · made in {Math.round(s.result.ms / 1000)} s
            </span>
            <a className="btn primary" href={s.result.url} download={s.result.name}>
              <Download size={14} /> Download
            </a>
          </div>
        </div>
      )}
      {t && (
        <>
          <section className="card">
            <div className="section-head">
              <span className="caps">What gets copied</span>
            </div>
            <ul className="notes">
              {t.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>
          <section className="card">
            <div className="section-head">
              <span className="caps">Captions</span>
              <span className="right">{t.captions ? "as measured; adjust if you like" : "none found in the reference; these are a start"}</span>
            </div>
            <div className="cap-layout">
              <CaptionPreview look={s.look} plan={plan} />
              <div>
                <LookControls s={s} />
                <Preview />
              </div>
            </div>
          </section>
          <section className="card">
            <div className="section-head">
              <span className="caps">Cards and cutaways</span>
              <span className="right">copy a picture and paste it straight into one</span>
            </div>
            <div className="field">
              <span className="label">Where they go</span>
              <Segmented
                label="Where they go"
                value={s.placement}
                onChange={(v) => mimic.setPlacement(v)}
                options={[
                  { value: "reference", label: "As in the reference" },
                  { value: "script", label: "Where your script says it" },
                ]}
              />
              <span className="hint">
                {s.placement === "reference"
                  ? "At the same point of your talk as the reference has them (its hook to the second)."
                  : mimic.canAsk()
                    ? "Where you talk about what they show: Gemini reads your script and sees your pictures."
                    : "Where your words and topics match what the reference was saying over them. Choose + Gemini above for it to read the meaning, or move any of them to a sentence yourself."}
              </span>
              {s.placement === "script" && mimic.canAsk() && s.placing.stage !== "working" && (
                <button type="button" className="btn" onClick={() => void mimic.askGeminiPlaces()}>
                  Ask Gemini again
                </button>
              )}
              <Bar job={s.placing} />
              <Problem job={s.placing} />
            </div>
            <PasteNote s={s} where="slots" />
            <Slots s={s} t={t} plan={plan} />
          </section>
          {plan && <SoundCard s={s} plan={plan} />}
        </>
      )}
    </>
  );
}

/** A picture copied anywhere and pasted on the page goes into the extras (or the card waiting for it). */
function usePaste() {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const p = fromPaste(e.clipboardData, mimic.nextPaste());
      const typing = e.target instanceof Element && !!e.target.closest("textarea, input, select, [contenteditable]");
      // Text pasted where it's typed stays text; a picture always comes here.
      if (!p.files.length && (typing || !p.link)) return;
      e.preventDefault();
      void mimic.paste(p);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);
}

export function MimicApp() {
  const s = useMimic();
  const why = mimic.why();
  usePaste();
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <span>Namzilabs</span>
          <span className="sep" />
          <nav className="pages">
            <a href="./">Clipper</a>
            <a href="./mimic.html" aria-current="page">
              Mimic
            </a>
          </nav>
        </div>
        <div className="topnote">
          <span className="dot" />
          <span className="long">{s.ear === "gemini" && s.geminiKey ? "Runs on this computer. Only the sound goes to Gemini." : "Runs on this computer. Nothing is uploaded."}</span>
        </div>
      </header>
      <main className="main">
        <aside className="inputs">
          <ReferencePanel s={s} />
          <FootagePanel s={s} />
          <ExtrasPanel s={s} />
          <SoundPanel s={s} />
          <div className="go">
            {s.make.stage === "working" ? (
              <button type="button" className="btn big" onClick={() => mimic.cancel()}>
                <Square size={14} /> Stop
              </button>
            ) : (
              <button type="button" className="btn primary big" disabled={!!why} onClick={() => void mimic.make()}>
                <Sparkles size={16} /> Make the edit
              </button>
            )}
            <Bar job={s.make} />
            <div className="why">{s.make.stage === "error" ? s.make.error : s.make.stage === "working" ? "Keep this tab open." : (why ?? "")}</div>
          </div>
        </aside>
        <section className="outputs">
          <Outputs s={s} />
        </section>
      </main>
    </div>
  );
}
