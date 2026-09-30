import { useState } from "react";
import { CircleAlert, Clapperboard, Copy, Check, Download, Film, LoaderCircle, Music, Sparkles, VolumeX, X } from "lucide-react";
import type { EditPlan } from "../../engine/plan/types";
import { studio, type Job, type State } from "../studio";
import { fmtBytes, fmtTime } from "./bits";

function Strip({ plan, thumbs }: { plan: EditPlan; thumbs: Map<string, string | undefined> }) {
  return (
    <div>
      <div className="strip" aria-label="The edit, shot by shot">
        {plan.shots.map((sh, i) => (
          <span
            key={i}
            className={sh.role === "hook" || sh.role === "drop" ? sh.role : undefined}
            style={{ flexGrow: sh.end - sh.start, backgroundImage: thumbs.get(sh.source) ? `url(${thumbs.get(sh.source)})` : undefined }}
            title={`${fmtTime(sh.start)} to ${fmtTime(sh.end)}${sh.role ? ` · ${sh.role}` : ""}`}
          />
        ))}
        {plan.card && <span className="card" style={{ flexGrow: plan.card.end - plan.card.start }} title="The card" />}
      </div>
      <div className="legend" style={{ marginTop: 6 }}>
        <span>
          <i style={{ background: "var(--brand)" }} />
          hook
        </span>
        {plan.shots.some((s) => s.role === "drop") && (
          <span>
            <i style={{ background: "var(--orange)" }} />
            the drop
          </span>
        )}
        <span className="num">{plan.shots.length} shots</span>
        {plan.checks?.bpm !== "none" && <span className="num">{plan.checks?.bpm} bpm</span>}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn ghost"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        });
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function JobCard({ job, thumbs }: { job: Job; thumbs: Map<string, string | undefined> }) {
  const plan = job.plan;
  const aspect = plan ? plan.width / plan.height : 9 / 16;
  const name = `clipper-${job.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${plan?.aspect ?? ""}`;
  return (
    <article className="job">
      <div className="screen" style={{ aspectRatio: String(aspect) }}>
        <button type="button" className="del" aria-label={`Delete ${job.label}`} title={job.status === "done" || job.status === "error" ? "Delete" : "Stop and delete"} onClick={() => studio.removeJob(job.id)}>
          <X size={15} />
        </button>
        {job.status === "done" && job.url ? (
          <video src={job.url} controls loop playsInline preload="metadata" />
        ) : (
          <div className="working">
            {job.status === "error" ? (
              <>
                <CircleAlert size={22} color="var(--danger)" />
                <span className="error-text">{job.error}</span>
              </>
            ) : (
              <>
                {job.status === "rendering" ? <span className="pct">{Math.round(job.progress * 100)}%</span> : <LoaderCircle size={22} className="spin" />}
                <span>{job.stage}</span>
                {job.status === "rendering" && (
                  <div className="progress">
                    <i style={{ width: `${job.progress * 100}%` }} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div className="body">
        <div className="title">
          <b>{job.label}</b>
          <span className="meta">
            {plan ? `${fmtTime(plan.duration)} · ${plan.aspect.replace("x", ":")}` : ""}
            {job.bytes ? ` · ${fmtBytes(job.bytes)}` : ""}
          </span>
        </div>
        {plan && <Strip plan={plan} thumbs={thumbs} />}
        {job.status === "done" && job.url && (
          <>
            <div className="actions">
              <a className="btn primary" href={job.url} download={`${name}.${job.ext}`}>
                <Download size={15} /> Download
              </a>
              {job.silentUrl && (
                <a className="btn" href={job.silentUrl} download={`${name}-no-song.${job.ext}`} title={plan?.format === "story" ? "The same clip with only the voice, to add the song in the app" : "The same edit without the song, to add the sound in the app"}>
                  <VolumeX size={15} /> {plan?.format === "story" ? "Voice only" : "Without the song"}
                </a>
              )}
            </div>
            {plan?.note && (
              <div className="note">
                <span className="k">Sound</span>
                <span>{plan.note.sound}</span>
                {plan.note.caption && (
                  <>
                    <span className="k" style={{ marginTop: 4 }}>
                      Caption
                    </span>
                    <div className="row between">
                      <span>{plan.note.caption}</span>
                      <CopyButton text={plan.note.caption} />
                    </div>
                  </>
                )}
              </div>
            )}
            {job.ms !== undefined && <span className="meta">Made in {(job.ms / 1000).toFixed(1)}s on this machine</span>}
          </>
        )}
      </div>
    </article>
  );
}

function Moments({ s }: { s: State }) {
  const st = s.story;
  if (s.style.format !== "story" || st.status === "idle") return null;
  if (st.status === "working")
    return (
      <div className="story-status">
        <LoaderCircle size={18} className="spin" />
        <span>{st.stage}</span>
        <div className="progress">
          <i style={{ width: `${st.progress * 100}%` }} />
        </div>
      </div>
    );
  if (st.status === "error")
    return (
      <div className="banner bad">
        <CircleAlert size={16} color="var(--danger)" />
        <span>{st.error}</span>
      </div>
    );
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  return (
    <div>
      <div className="outputs-head">
        <h1>Moments</h1>
        <div className="row">
          <span className="muted num">{st.moments.filter((m) => m.selected).length} picked</span>
          {!s.busy && (
            <button type="button" className="btn ghost" onClick={() => void studio.findMoments()} title="Pick again with the current clip length and count (the transcript is kept)">
              Find again
            </button>
          )}
        </div>
      </div>
      <div className="moments">
        {st.moments.map((m) => (
          <div key={m.id} className={`moment${m.selected ? " on" : ""}`}>
            <input type="checkbox" checked={m.selected} onChange={() => studio.toggleMoment(m.id)} aria-label={`Clip this moment: ${m.hook}`} />
            <div style={{ minWidth: 0 }}>
              <textarea className="hook" rows={1} value={m.hook} onChange={(e) => studio.setMomentHook(m.id, e.target.value)} aria-label="The hook on screen (Enter for a new line)" />
              <div className="why">{m.why}</div>
              <div className="words">{m.text}</div>
            </div>
            <div className="when">
              <div className="score">{m.score.toFixed(0)}</div>
              <div>
                {mmss(m.start)} to {mmss(m.end)}
              </div>
              <div>{Math.round(m.end - m.start)}s</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="empty">
      <h2>
        Drop footage and a sound. Get edits cut to the <span className="serif">beat</span>.
      </h2>
      <p className="lead">It finds the best moments, cuts them on the song's accents like the Reels that do numbers, and ends every edit on your demo card.</p>
      <div className="steps">
        <div className="step">
          <div className="n">1</div>
          <div className="t">
            <Clapperboard size={16} /> Footage
          </div>
          <div className="d">Clips, photos, screen recordings or a long video. It skims every frame.</div>
        </div>
        <div className="step">
          <div className="n">2</div>
          <div className="t">
            <Music size={16} /> A sound
          </div>
          <div className="d">Save a Reel with the trending sound and drop it in. It hears the beat, the accents and the drop.</div>
        </div>
        <div className="step">
          <div className="n">3</div>
          <div className="t">
            <Sparkles size={16} /> Edits
          </div>
          <div className="d">Several finished edits, each ending on the card, ready to post with a note on adding the sound.</div>
        </div>
      </div>
      <div className="promise">
        <span className="dot" /> Everything runs in this browser, on this computer's own chips. Your videos never leave it (with smart picks on, Gemini sees small stills of them).
      </div>
    </div>
  );
}

export function Results({ s }: { s: State }) {
  const thumbs = new Map(s.footage.map((f) => [f.id, f.thumb]));
  const wide = s.jobs.some((j) => j.plan && j.plan.width > j.plan.height);
  const sup = s.support;
  return (
    <div>
      {sup.checked && (!sup.webcodecs || !sup.webgl2) && (
        <div className="banner bad">
          <CircleAlert size={16} color="var(--danger)" />
          <span>This browser can't edit video here. Open this page in Chrome (on a Mac, Chrome uses the Mac's own video engine).</span>
        </div>
      )}
      {sup.checked && sup.webcodecs && sup.webgl2 && !sup.mp4 && (
        <div className="banner warn">
          <CircleAlert size={16} color="var(--warning)" />
          <span>This browser can't write MP4, so edits come out as WebM. Chrome on a Mac writes MP4, which Instagram and TikTok want.</span>
        </div>
      )}
      {s.notice && (
        <div className="banner warn">
          <CircleAlert size={16} color="var(--warning)" />
          <span style={{ flex: 1 }}>{s.notice}</span>
          <button type="button" className="btn ghost icon" aria-label="Dismiss" onClick={() => studio.dismissNotice()} style={{ height: 22, width: 22 }}>
            <X size={14} />
          </button>
        </div>
      )}
      <Moments s={s} />
      {s.jobs.length === 0 ? (
        s.style.format === "story" && s.story.status !== "idle" ? null : <Empty />
      ) : (
        <>
          <div className="outputs-head">
            <h1>
              <Film size={20} style={{ verticalAlign: "-3px", marginRight: 8 }} />
              Edits
            </h1>
            <button type="button" className="btn ghost" onClick={() => studio.clearResults()} title={s.busy ? "Stop and delete every edit" : "Delete every edit"}>
              Clear all
            </button>
          </div>
          <div className={`jobs${wide ? " wide" : ""}`}>
            {s.jobs.map((j) => (
              <JobCard key={j.id} job={j} thumbs={thumbs} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
