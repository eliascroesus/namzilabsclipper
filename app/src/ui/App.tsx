import { Sparkles, Square } from "lucide-react";
import { studio, useStudio } from "./studio";
import { Mark } from "./components/bits";
import { CardPanel, FootagePanel, FormatPanel, SoundPanel, StoryPanel, StylePanel } from "./components/panels";
import { Results } from "./components/results";

export function App() {
  const s = useStudio();
  const why = studio.canGenerate();
  const picked = s.story.moments.filter((m) => m.selected).length;
  const label =
    s.style.format === "story"
      ? studio.storyNeedsMoments()
        ? s.geminiKey
          ? "Find the moments"
          : "Add your Gemini key"
        : `Make ${picked} ${picked === 1 ? "clip" : "clips"}`
      : `Make ${s.style.variants} ${s.style.variants === 1 ? "edit" : "edits"}`;
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <span>Namzilabs</span>
          <span className="sep" />
          <nav className="pages">
            <a href="./" aria-current="page">
              Clipper
            </a>
            <a href="./mimic.html">Mimic</a>
          </nav>
        </div>
        <div className="topnote">
          <span className="dot" />
          <span className="long">{s.geminiKey && s.style.smart ? "Runs on this computer. Only small stills go to Gemini (smart picks)." : "Runs on this computer. Nothing is uploaded."}</span>
        </div>
      </header>
      <main className="main">
        <aside className="inputs">
          <FormatPanel s={s} />
          <FootagePanel s={s} />
          <SoundPanel s={s} />
          {s.style.format === "story" ? <StoryPanel s={s} /> : <StylePanel s={s} />}
          <CardPanel s={s} />
          <div className="go">
            {s.busy ? (
              <button type="button" className="btn big" onClick={() => studio.cancel()}>
                <Square size={14} /> Stop
              </button>
            ) : (
              <button type="button" className="btn primary big" disabled={!!why} onClick={() => void studio.generate()}>
                <Sparkles size={16} /> {label}
              </button>
            )}
            <div className="why">{s.busy ? "Making edits. Keep this tab open." : why ?? ""}</div>
          </div>
        </aside>
        <section className="outputs">
          <Results s={s} />
        </section>
      </main>
    </div>
  );
}
