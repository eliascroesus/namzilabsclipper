/**
 * Where the user's pictures and clips go in their footage: on the words where they talk
 * about what each shows. Each picture is known by its name (the user's words for it, its
 * file's, the page's it was copied from, or Gemini's), the words and amounts printed on it,
 * what the picture model sees in it, and what the people and brands in it stand for
 * (know.ts). Every word of the footage is weighed against each: the name said (spelt however
 * the speech model heard it), a word on it said, an amount on it said the way people say
 * amounts, and the topics it stands for spoken there (more where a sentence is full of them).
 * The best fits are taken first, a picture once, a second apart unless they're in one
 * sentence (a list said: the pictures follow each other as a run of cards).
 */
import type { Word } from "./asr/parakeet";
import { amounts, conceptsOfWord, entitiesIn, fold, heardAt, keysAlike, listenFor, sameAmount, soundKey, TOPIC_NAMES, topicWeights, windowKeys } from "./know";
import type { Extra } from "./types";

export { fold } from "./know";

export interface Sentence {
  i: number;
  /** its words: [w0, w1) in the footage's word list */
  w0: number;
  w1: number;
  /** source times */
  start: number;
  end: number;
  text: string;
}

/** The footage's words as sentences: to a full stop, a pause of 0.7 s, or 24 words. */
export function sentences(words: Word[]): Sentence[] {
  const out: Sentence[] = [];
  let w0 = 0;
  for (let i = 0; i < words.length; i++) {
    const end = /[.!?…]["”')\]]*$/.test(words[i].text) || i === words.length - 1 || words[i + 1].start - words[i].end >= 0.7 || i - w0 >= 23;
    if (!end) continue;
    out.push({ i: out.length, w0, w1: i + 1, start: words[w0].start, end: words[i].end, text: words.slice(w0, i + 1).map((w) => w.text).join(" ") });
    w0 = i + 1;
  }
  return out;
}

// Words every sentence has (Danish and English): never a picture's word worth matching.
const STOP = new Set(
  "og i at det en den til er som pa de med han af for ikke der var mig sig men et har om vi min havde ham hun nu over da fra du ud sin dem os op man hans hvor eller hvad skal selv her alle vil blev kunne ind nar vaere dog noget ville jo deres efter ned skulle denne end dette mit ogsa under have dig anden hende mine alt meget sit sine vor mod disse hvis din nogle hos blive mange ad bliver hendes vaeret jer sadan jeg sa lige bare godt kan helt rigtig lidt ja nej altsa ligesom the a an and or of to in on at is it that this for with you your i me my we our they them be are was were so just like from by as not"
    .split(" "),
);
// Words on screens that say nothing of the screen (a dashboard's furniture).
const CHROME = new Set(["total", "dashboard", "today", "idag", "yesterday", "igar", "overview", "oversigt", "settings", "indstillinger", "search", "sog", "home", "hjem", "menu", "login", "logout", "account", "konto", "profile", "profil", "view", "show", "hide", "more", "mere", "next", "previous", "back", "tilbage", "cancel", "done", "close", "report", "rapport", "export", "filter", "sort", "date", "dato", "time", "status", "page", "side", "select", "valgt", "vaelg"]);

/** The words of a picture's name or text worth listening for ("Andrew Tate - Wikipedia.png": andrew, tate). */
export function nameWords(name: string): string[] {
  return name
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .split(/[^\p{L}\p{N}]+/u)
    .map(fold)
    .filter((w) => w.length >= 4 && !STOP.has(w) && !CHROME.has(w) && !/^\d+$/.test(w) && !/^(wikipedia|picture|pasted|image|photo|foto|billede|screenshot|png|jpe?g|webp)$/.test(w));
}

/** Topics the picture model's kinds stand for. */
export const KIND_CONCEPTS: Record<string, string[]> = {
  car: ["luxury"],
  watch: ["luxury"],
  jet: ["luxury", "travel"],
  yacht: ["luxury", "travel"],
  home: ["luxury"],
  view: ["travel"],
  city: ["travel"],
  travel: ["travel"],
  money: ["money"],
  fashion: ["luxury"],
  party: ["events"],
  sport: ["fitness"],
  work: ["business", "tools"],
};

/** The amounts said in the footage, on the word that says each. */
export function amountsAt(words: Word[]): { i: number; v: number }[] {
  const out: { i: number; v: number }[] = [];
  for (let i = 0; i < words.length; i++) {
    if (!/\d|^(en|et|to|tre|fire|fem|seks|syv|otte|ni|ti|tyve|hundrede|one|two|three|four|five|six|seven|eight|nine|ten|twenty|hundred)$/i.test(words[i].text.replace(/[.,!?]$/, ""))) continue;
    const said = words
      .slice(i, i + 3)
      .map((w) => w.text)
      .join(" ");
    const [v] = amounts(said);
    if (v !== undefined && (v >= 1000 || /\d/.test(words[i].text))) out.push({ i, v });
  }
  return out;
}

export interface Place {
  /** source time of the word it goes on */
  t: number;
  /** the word's index */
  w: number;
  score: number;
  /** why it goes there, for the page */
  why: string;
  /** the sentence it's in */
  said: string;
}

type Known = Pick<Extra, "label" | "text" | "tags" | "about" | "keywords">;

/** What a picture is known by, for matching. */
function profile(e: Known) {
  const all = [e.label ?? "", e.text ?? "", (e.keywords ?? []).join(" "), e.about ?? ""].join(" | ");
  const ents = entitiesIn([e.label ?? "", e.text ?? "", (e.keywords ?? []).join(" ")].join(" "));
  // Names to listen for: its label, the people and brands in it, and their surnames.
  const names = new Set<string>();
  if (e.label && fold(e.label).length >= 3) names.add(e.label);
  for (const x of ents) {
    names.add(x.name);
    for (const a of x.also) if (fold(a).length >= 4) names.add(a);
  }
  // What it stands for, weighed (what the picture model sees in it counts a little less).
  const concepts = topicWeights(all);
  for (const t of (e.tags ?? []).slice(0, 2)) for (const c of KIND_CONCEPTS[t] ?? []) concepts.set(c, Math.max(concepts.get(c) ?? 0, 0.75));
  // Words on it, and words of its name, to listen for one by one (a name's own words more readily).
  const printed = [
    ...[...new Set(nameWords(e.text ?? ""))].filter((w) => w.length >= 5).slice(0, 20).map((w) => ({ key: soundKey(w), need: 0.85, own: false })),
    ...[...new Set(nameWords(e.label ?? ""))].filter((w) => w.length >= 5).map((w) => ({ key: soundKey(w), need: 0.8, own: true })),
  ];
  const keywords = [...new Set((e.keywords ?? []).map(fold).filter((k) => k.length >= 4 && !STOP.has(k)))];
  const figures = amounts(e.text ?? "").filter((v) => v >= 1000);
  return { names: [...names].map(listenFor), who: ents.map((x) => x.name), concepts, printed, keywords, figures };
}

const abouts = new Map<string, { who: string[]; topics: string[] }>();

/** Who or what a picture shows and what it stands for, as the page knows it ("Iman Gadzhi": agencies, courses...). */
export function aboutOf(e: Known): { who: string[]; topics: string[] } {
  const key = JSON.stringify([e.label, e.text, e.tags, e.about, e.keywords]);
  let a = abouts.get(key);
  if (!a) {
    const p = profile(e);
    a = { who: p.who, topics: [...p.concepts.entries()].sort((x, y) => y[1] - x[1]).map(([c]) => TOPIC_NAMES[c] ?? c) };
    if (abouts.size > 300) abouts.clear();
    abouts.set(key, a);
  }
  return a;
}

/**
 * The word each picture goes on, where the footage talks about it; pictures nothing is said
 * of aren't in it (they fill the reference's own cards instead).
 */
export function placeByContent(words: Word[], extras: Extra[]): Record<string, Place> {
  if (!words.length || !extras.length) return {};
  const sents = sentences(words);
  const sentOf = new Int32Array(words.length);
  for (const s of sents) for (let w = s.w0; w < s.w1; w++) sentOf[w] = s.i;
  const wordConcepts = words.map((w) => conceptsOfWord(w.text));
  const sentConcepts = sents.map((s) => {
    const n = new Map<string, number>();
    for (let w = s.w0; w < s.w1; w++) for (const c of wordConcepts[w]) n.set(c, (n.get(c) ?? 0) + 1);
    return n;
  });
  const said = amountsAt(words);
  // How every run of one to four words sounds, once for all the pictures' names.
  const keys = windowKeys(words.map((w) => w.text));
  const cands: { e: Extra; i: number; score: number; why: string }[] = [];
  for (const e of extras) {
    const p = profile(e);
    for (let i = 0; i < words.length; i++) {
      let score = 0;
      const why: string[] = [];
      // Its name, said (over one to a few words: a speech model splits and joins names).
      let named = 0;
      let namedAs = "";
      for (const n of p.names) {
        const h = heardAt(keys, n, i);
        if (h.sim > named) {
          named = h.sim;
          namedAs = words
            .slice(i, i + h.span)
            .map((w) => w.text)
            .join(" ")
            .replace(/[.,!?]+$/, "");
        }
      }
      if (named) {
        score += 1.2 * named;
        why.push(`you say "${namedAs}"`);
      }
      // A word printed on it, said.
      const w = fold(words[i].text);
      if (w.length >= 4 && !STOP.has(w)) {
        const hit = p.printed.find((x) => (w.length >= 5 || x.own) && keysAlike(x.key, keys[1][i], x.need) > 0);
        if (hit && !named) {
          score += 0.6;
          why.push(`"${words[i].text.replace(/[.,!?]+$/, "")}" is ${hit.own ? "in its name" : "on it"}`);
        }
        const key = p.keywords.find((k) => w.startsWith(k) || k.startsWith(w));
        if (key && !named) {
          score += 0.45;
          why.push(`"${words[i].text.replace(/[.,!?]+$/, "")}" is what it shows`);
        }
      }
      // An amount printed on it, said.
      const a = said.find((x) => x.i === i);
      const fig = a ? p.figures.find((f) => sameAmount(f, a.v)) : undefined;
      if (fig !== undefined) {
        score += 0.8;
        why.push(`you say the ${Math.round(fig).toLocaleString("da-DK")} on it`);
      }
      // What it stands for, spoken here (what it stands for first counting most), and more so
      // in a sentence full of it.
      const shared = wordConcepts[i].filter((c) => p.concepts.has(c)).sort((x, y) => p.concepts.get(y)! - p.concepts.get(x)!);
      if (shared.length) {
        const here = Math.min(1.6, shared.reduce((s, c) => s + p.concepts.get(c)!, 0));
        const dense = [...sentConcepts[sentOf[i]].entries()].reduce((s, [c, n]) => s + n * (p.concepts.get(c) ?? 0), 0);
        score += 0.3 * here + Math.min(0.3, 0.06 * dense);
        if (!why.length) why.push(`you talk about ${shared.map((c) => TOPIC_NAMES[c] ?? c).join(" and ")}`);
      }
      if (score >= 0.4) cands.push({ e, i, score, why: why.join(", ") });
    }
  }
  // The best fits first: a picture once; a second apart, unless in one sentence (a list said).
  cands.sort((a, b) => b.score - a.score || a.i - b.i);
  const out: Record<string, Place> = {};
  const taken: { i: number; t: number }[] = [];
  for (const c of cands) {
    if (c.e.id in out) continue;
    const t = words[c.i].start;
    if (taken.some((x) => x.i === c.i || (Math.abs(x.t - t) < 1 && sentOf[x.i] !== sentOf[c.i]) || Math.abs(x.t - t) < 0.3)) continue;
    out[c.e.id] = { t, w: c.i, score: Math.round(c.score * 100) / 100, why: c.why, said: sents[sentOf[c.i]]?.text ?? "" };
    taken.push({ i: c.i, t });
  }
  return out;
}

/** Moments in the script for a sound: money said (a cash register), one every 6 s at most, eight at most. */
export function soundsByWords(words: Word[]): { key: string; t: number; sound: string; why: string }[] {
  const out: { key: string; t: number; sound: string; why: string }[] = [];
  for (let i = 0; i < words.length && out.length < 8; i++) {
    const cs = conceptsOfWord(words[i].text);
    const money = (cs.includes("money") || cs.includes("sales")) && !/^(rig|rich)$/i.test(fold(words[i].text));
    const figure = /\d/.test(words[i].text) && /^(kr|kroner|dollars?|euro|\$)/i.test(words[i + 1]?.text ?? "");
    if (!money && !figure) continue;
    if (out.length && words[i].start - out[out.length - 1].t < 6) continue;
    out.push({ key: `word:${i}`, t: words[i].start, sound: "cash", why: `money: "${words[i].text}"` });
  }
  return out;
}
