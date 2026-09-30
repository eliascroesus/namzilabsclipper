/**
 * Keeping each word's time when the words change: a transcript fixed by hand
 * (or by Gemini) is lined up against the timed words the speech model heard,
 * word for word where they're alike; a word with no partner gets its time from
 * its neighbours, shared out by length.
 */
import type { Word } from "./parakeet";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");

/** How alike two words are, 0 to 1 (by edit distance over their letters). */
function alike(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return x === y ? 1 : 0;
  if (x === y) return 1;
  const d = Array.from({ length: x.length + 1 }, (_, i) => i);
  for (let j = 1; j <= y.length; j++) {
    let prev = d[0];
    d[0] = j;
    for (let i = 1; i <= x.length; i++) {
      const tmp = d[i];
      d[i] = Math.min(d[i] + 1, d[i - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - d[x.length] / Math.max(x.length, y.length);
}

/**
 * New words (text) timed from the old ones. Where the text breaks the line after a word,
 * the word says so (`br`): once, a new line of the caption; with an empty line, a new caption.
 */
export function retime(timed: Word[], text: string): Word[] {
  const tokens = [...text.matchAll(/(\S+)(\s*)/g)].map((m) => {
    const lines = (m[2].match(/\n/g) ?? []).length;
    return { text: m[1], br: lines >= 2 ? ("page" as const) : lines === 1 ? ("line" as const) : undefined };
  });
  return align(timed, tokens.map((t) => t.text)).map((w, j) => {
    const { br: _old, ...word } = w;
    return tokens[j].br ? { ...word, br: tokens[j].br } : word;
  });
}

function align(timed: Word[], next: string[]): Word[] {
  const n = timed.length;
  const m = next.length;
  if (!m) return [];
  if (!n) return next.map((w, i) => ({ text: w, start: i * 0.3, end: i * 0.3 + 0.28, conf: 0 }));
  // Alignment: matching alike words scores, skipping costs a little.
  const score = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const move = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) (score[i][0] = -0.3 * i), (move[i][0] = 1);
  for (let j = 1; j <= m; j++) (score[0][j] = -0.3 * j), (move[0][j] = 2);
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const s = alike(timed[i - 1].text, next[j - 1]);
      const diag = score[i - 1][j - 1] + (s >= 0.5 ? s : s - 0.6);
      const up = score[i - 1][j] - 0.3;
      const left = score[i][j - 1] - 0.3;
      if (diag >= up && diag >= left) (score[i][j] = diag), (move[i][j] = 0);
      else if (up >= left) (score[i][j] = up), (move[i][j] = 1);
      else (score[i][j] = left), (move[i][j] = 2);
    }
  const partner = new Array<number>(m).fill(-1);
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const mv = move[i][j];
    if (i > 0 && j > 0 && mv === 0) {
      partner[j - 1] = i - 1;
      i--;
      j--;
    } else if (i > 0 && (j === 0 || mv === 1)) i--;
    else j--;
  }
  const out: Word[] = next.map((w, j) => (partner[j] >= 0 ? { ...timed[partner[j]], text: w } : { text: w, start: NaN, end: NaN, conf: 0 }));
  // Words without a partner: share out the time between the partnered words around them.
  for (let j = 0; j < m; ) {
    if (!Number.isNaN(out[j].start)) {
      j++;
      continue;
    }
    let k = j;
    while (k < m && Number.isNaN(out[k].start)) k++;
    const from = j > 0 ? out[j - 1].end : Math.max(0, (out[k]?.start ?? timed[0].start) - 0.3 * (k - j));
    const to = k < m ? out[k].start : Math.max(from + 0.3 * (k - j), timed[n - 1].end);
    const lens = out.slice(j, k).map((w) => Math.max(1, norm(w.text).length));
    const total = lens.reduce((a, b) => a + b, 0);
    let at = from;
    for (let q = j; q < k; q++) {
      const d = ((to - from) * lens[q - j]) / total;
      out[q] = { ...out[q], start: at, end: at + d };
      at += d;
    }
    j = k;
  }
  return out;
}
