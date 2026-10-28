// Run check.mjs on every tests/*.md and compare with the expected summary line.
// A mismatch after an app update means the app's math handling (or the harness) changed.
import { execFileSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';

const here = fileURLToPath(new URL('.', import.meta.url));
const expected = {
  '01-mixed.md': '1 failed, 14 rendered',              // $1/r$: starts with a digit, no TeX operator
  '02-digits.md': '2 failed, 1 rendered',              // $1/r$, $2x$ fail; $\frac{1}{r}$ renders
  '03-inline-dd.md': '1 failed, 0 rendered',           // $$...$$ mid-sentence stays text
  '04-katex-error.md': '1 failed, 1 rendered',         // \frac{1} is a KaTeX error
  '05-table-pipe.md': 'ok: 1 rendered',
  '06-list.md': 'ok: 3 rendered',
  '07-display-multiline.md': 'ok: 1 rendered',
  '08-dollars.md': '1 failed, 0 rendered',             // prices: correctly not math, still reported
  '09-escapes.md': 'ok: 2 rendered',
  '10-linebreak.md': '2 failed, 0 rendered',           // $...$ can't span lines
  '11-quote-code.md': 'ok: 1 rendered',
  '12-no-math.md': 'ok: no math',
  // \(2x\), \(1/r\), \(x\) and a \[...\] block stay text; \(\frac{1}\) is a KaTeX error; ${2x}$ fails
  '13-backslash-delims.md': '7 failed, 4 rendered',
  // two >60-char spans and the 61-char boundary fail; split forms, $$ form and 60 chars render
  '14-long-span.md': '3 failed, 6 rendered',
  '15-bracket-span.md': '1 failed, 2 rendered',        // $[a:b]$ fails; $n = [a:b]$ and $$[a:b] = 2$$ render
  '16-trailing-operator.md': '1 failed, 1 rendered',   // $a \cdot b -$ fails
  '17-quote-adjacent.md': '1 failed, 1 rendered',      // $k$" fails
  // "$f$, -$x$, /$y$, :$z$ fail; reworded and curly-quoted forms render
  '18-quote-before.md': '4 failed, 3 rendered',
};

let bad = 0;
for (const [file, want] of Object.entries(expected)) {
  let out;
  try {
    out = execFileSync(process.execPath, [join(here, 'check.mjs'), join(here, 'tests', file)], { encoding: 'utf8' });
  } catch (e) {
    if (e.status === 2) { console.log(`ERROR ${file}: ${e.stderr.trim()}`); bad++; continue; }
    out = e.stdout;
  }
  const got = out.trim().split('\n').pop();
  if (got !== want) { console.log(`DIFF  ${file}: expected "${want}", got "${got}"`); bad++; }
}
console.log(bad ? `${bad} of ${Object.keys(expected).length} differ` : `all ${Object.keys(expected).length} as expected`);
process.exit(bad ? 1 : 0);
