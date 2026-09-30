/**
 * Where the reference's cards and cutaways belong in the user's footage when its script says
 * things in another order. Each one is given what the reference was saying while it showed
 * (its captions around it) and what the user's pictures in it are (their names), and those
 * are looked for in the footage's sentences: letters three at a time (the reference's words
 * are read off its captions, run together, a letter out here and there), the topics both
 * touch (money, shops and products, social media, gurus, students and their results, the
 * good life), and the pictures' names said aloud. Each takes the sentence that fits it best,
 * no two the same one; one that nothing fits stays where the reference has it. With a Gemini
 * key the page asks Gemini as well (ai.ts), which reads the meaning.
 */
import type { Word } from "./asr/parakeet";
import type { MimicTemplate } from "./types";

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

/** Letters only, lowercase, Danish letters spelt out as a reader of captions would give them. */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "");

// Words every sentence has (Danish and English), left out when sentences are compared.
const STOP = new Set(
  "og i at det en den til er som pa de med han af for ikke der var mig sig men et har om vi min havde ham hun nu over da fra du ud sin dem os op man hans hvor eller hvad skal selv her alle vil blev kunne ind nar vaere dog noget ville jo deres efter ned skulle denne end dette mit ogsa under have dig anden hende mine alt meget sit sine vor mod disse hvis din nogle hos blive mange ad bliver hendes vaeret thi jer sadan jeg sa lige bare godt kan helt rigtig lidt ja nej altsa ligesom the a an and or of to in on at is it that this for with you your i me my we our they them be are was were so just like"
    .split(" "),
);

function grams(s: string): Set<string> {
  const f = s
    .split(/\s+/)
    .map(fold)
    .filter((w) => w && !STOP.has(w))
    .join("");
  const out = new Set<string>();
  for (let i = 0; i + 3 <= f.length; i++) out.add(f.slice(i, i + 3));
  return out;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const g of a) if (b.has(g)) n++;
  return (2 * n) / (a.size + b.size);
}

/** Topics, as bits of words (Danish and English, spelt as `fold` gives them). */
export const TOPICS: Record<string, string[]> = {
  money: ["kroner", "penge", "dollar", "euro", "omsaet", "omsat", "indtjen", "tjene", "tjent", "solgt", "salg", "million", "tusind", "profit", "revenue", "sales", "sold", "money", "stripe", "betaling"],
  shop: ["webshop", "produkt", "product", "shop", "butik", "dropship", "amazon", "ecommerce", "varer", "lager", "fba"],
  social: ["tiktok", "instagram", "youtube", "video", "reel", "folger", "follower", "views", "content", "opslag"],
  gurus: ["idiot", "guru", "influencer", "trading", "rignatten", "blivrig", "bliverrig", "kursus", "kurser", "coach", "scam", "fake"],
  results: ["elev", "hjulpet", "hjaelp", "kunde", "student", "client", "resultat", "forstemaaned", "forstemaned", "forsteman", "dage"],
  life: ["lambo", "ferrari", "rolex", "villa", "rejse", "rejser", "usa", "dubai", "yacht", "bil", "frihed", "hvorjegvil"],
};

export function topicsIn(text: string): Set<string> {
  const f = fold(text);
  const out = new Set<string>();
  for (const [k, bits] of Object.entries(TOPICS)) if (bits.some((b) => f.includes(b))) out.add(k);
  return out;
}

// Words in a picture's name that say nothing of what it shows.
const GENERIC = new Set(["picture", "pasted", "image", "billede", "screenshot", "skaermbillede", "photo", "foto", "img", "dsc", "copy", "kopi", "wikipedia", "jpeg", "png", "webp", "file", "untitled"]);

/** The words of a picture's name worth listening for ("Andrew Tate - Wikipedia.png" → andrew, tate). */
export function nameWords(name: string): string[] {
  return name
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .split(/[^\p{L}\p{N}]+/u)
    .map(fold)
    .filter((w) => w.length >= 4 && !GENERIC.has(w) && !/^\d+$/.test(w));
}

export interface Slot {
  /** a run's first card, or a cutaway */
  id: string;
  /** reference times it shows */
  start: number;
  end: number;
  /** the names of the user's pictures or clips in it */
  names: string[];
}

export interface Place {
  /** source time of the footage it belongs at */
  t: number;
  /** the footage's words there */
  said: string;
  score: number;
}

/** What the reference was saying while a slot showed (its captions from a second before to half a second after). */
export function refSaid(tpl: MimicTemplate, start: number, end: number): string {
  return (tpl.script ?? [])
    .filter((c) => c.end > start - 1.2 && c.start < end + 0.5)
    .map((c) => c.text)
    .join(" ");
}

/** The best sentence of the footage for each slot, by its words, topics and names; none where nothing fits. */
export function placeByWords(tpl: MimicTemplate, slots: Slot[], words: Word[]): Record<string, Place> {
  const sents = sentences(words);
  if (!sents.length) return {};
  const refTotal = Math.max(1e-6, tpl.duration);
  const outTotal = Math.max(1e-6, words[words.length - 1].end);
  const cands: { slot: Slot; s: Sentence; score: number; at: number }[] = [];
  for (const slot of slots) {
    const said = refSaid(tpl, slot.start, slot.end);
    const g = grams(said);
    const topics = topicsIn(said);
    const names = slot.names.flatMap(nameWords);
    for (const s of sents) {
      // The sentence and the one after it (a card often spans the turn of a sentence).
      const next = sents[s.i + 1];
      const text = next ? `${s.text} ${next.text}` : s.text;
      const lex = Math.max(dice(g, grams(s.text)), dice(g, grams(text)) * 0.9);
      const shared = [...topicsIn(s.text)].filter((k) => topics.has(k)).length;
      const f = fold(s.text);
      const named = names.find((n) => f.includes(n));
      const fit = lex + Math.min(0.3, 0.12 * shared) + (named ? 0.5 : 0);
      // Where each falls in its own video, as a tie-breaker.
      const score = fit - 0.15 * Math.abs(s.start / outTotal - slot.start / refTotal);
      if (fit < 0.22) continue;
      // On the word that says it, when a name or a topic's word is in there.
      let at = s.start;
      const hit = named ?? [...topics].flatMap((k) => TOPICS[k]).find((b) => f.includes(b));
      if (hit)
        for (let w = s.w0; w < s.w1; w++)
          if (fold(words[w].text).includes(hit.slice(0, Math.min(hit.length, 5)))) {
            at = words[w].start;
            break;
          }
      cands.push({ slot, s, score, at });
    }
  }
  // The best fits first; a sentence (or one within 1.5 s of it) goes to one slot only.
  cands.sort((a, b) => b.score - a.score);
  const out: Record<string, Place> = {};
  const taken: number[] = [];
  for (const c of cands) {
    if (c.slot.id in out || taken.some((t) => Math.abs(t - c.at) < 1.5)) continue;
    out[c.slot.id] = { t: c.at, said: c.s.text, score: Math.round(c.score * 100) / 100 };
    taken.push(c.at);
  }
  return out;
}

/** Moments in the script for a sound: money said (a cash register), one every 6 s at most, eight at most. */
export function soundsByWords(words: Word[]): { key: string; t: number; sound: string; why: string }[] {
  const out: { key: string; t: number; sound: string; why: string }[] = [];
  for (let i = 0; i < words.length && out.length < 8; i++) {
    const f = fold(words[i].text);
    const money = TOPICS.money.some((b) => f.includes(b)) || (/\d/.test(words[i].text) && /^(kr|kroner|dollars?|euro|\$)/i.test(words[i + 1]?.text ?? ""));
    if (!money) continue;
    if (out.length && words[i].start - out[out.length - 1].t < 6) continue;
    out.push({ key: `word:${i}`, t: words[i].start, sound: "cash", why: `money: "${words[i].text}"` });
  }
  return out;
}
