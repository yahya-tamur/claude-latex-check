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
  '04-katex-error.md': '2 failed, 0 rendered',         // \frac{1} is a KaTeX error; \notacommand shows literally
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
  // $(x_i)$, $(f)(x) = x a - a$, $(A_{B})$ fail; \command, ^, a plain list or no leading ( render
  '19-paren-start.md': '3 failed, 7 rendered',
  '20-plain-letters.md': '2 failed, 3 rendered',       // $xY$, $AB/B$ fail
  '21-uppercase-subscript.md': '1 failed, 3 rendered', // $A_B$ fails; $A_{B}$ renders
  '22-prime-superscript.md': '1 failed, 3 rendered',   // $x'^n$ fails; $x'^{n}$ renders
  '23-bracket-colon.md': '2 failed, 2 rendered',       // $[A:B]$ fails; $[A \colon B]$ renders
  '24-hyphen-before.md': '1 failed, 1 rendered',       // word-$k$ fails; U+2011 hyphen renders
  // a sample written strictly by the short rules in skills/latex-check/SKILL.md: must render
  // fully, or the short rules (or the checker) need fixing
  'short-rules.md': 'ok: 17 rendered',
};

let bad = 0;
for (const [file, want] of Object.entries(expected)) {
  let out;
  try {
    out = execFileSync(process.execPath, [join(here, 'skills/latex-check/scripts/check.mjs'), join(here, 'tests', file)], { encoding: 'utf8' });
  } catch (e) {
    if (e.status === 2) { console.log(`ERROR ${file}: ${e.stderr.trim()}`); bad++; continue; }
    out = e.stdout;
  }
  const got = out.trim().split('\n').pop();
  if (got !== want) { console.log(`DIFF  ${file}: expected "${want}", got "${got}"`); bad++; }
}
// The chat skill's lint (no app needed). These match what the chat view renders.
const katexExpected = {
  '01-mixed.md': 'ok: 15 checked', '02-digits.md': 'ok: 3 checked', '03-inline-dd.md': '1 failed, 0 checked',
  '04-katex-error.md': '2 failed, 2 checked', '05-table-pipe.md': 'ok: 1 checked', '06-list.md': 'ok: 3 checked',
  '07-display-multiline.md': 'ok: 1 checked', '08-dollars.md': 'ok: no math', '09-escapes.md': 'ok: 2 checked',
  '10-linebreak.md': '1 failed, 0 checked', '11-quote-code.md': 'ok: 1 checked', '12-no-math.md': 'ok: no math',
  '13-backslash-delims.md': '1 failed, 10 checked', '14-long-span.md': 'ok: 9 checked', '15-bracket-span.md': 'ok: 3 checked',
  '16-trailing-operator.md': 'ok: 2 checked', '17-quote-adjacent.md': 'ok: 2 checked', '18-quote-before.md': 'ok: 7 checked',
  '19-paren-start.md': 'ok: 10 checked', '20-plain-letters.md': 'ok: 5 checked', '21-uppercase-subscript.md': 'ok: 4 checked',
  '22-prime-superscript.md': 'ok: 4 checked', '23-bracket-colon.md': 'ok: 4 checked', '24-hyphen-before.md': 'ok: 2 checked',
  'short-rules.md': 'ok: 17 checked',
};
const run = (script, file) => {
  try { return { code: 0, out: execFileSync(process.execPath, [join(here, script), join(here, 'tests', file)], { encoding: 'utf8' }) }; }
  catch (e) { return { code: e.status, out: e.stdout ?? '' }; }
};
const last = out => out.trim().split('\n').pop();
for (const [file, want] of Object.entries(katexExpected)) {
  const got = last(run('skills/latex-check-chat/scripts/lint.mjs', file).out);
  if (got !== want) { console.log(`DIFF  chat lint ${file}: expected "${want}", got "${got}"`); bad++; }
}

// The Code tab skill's lint (the fallback when check.mjs breaks) must flag every file the checker flags, except
// the dollar amounts, which aren't math; and the sample written by the rules must pass it.
for (const [file, want] of Object.entries(expected)) {
  if (!want.includes('failed') || file === '08-dollars.md') continue;
  if (run('skills/latex-check/scripts/lint.mjs', file).code !== 1) { console.log(`DIFF  lint ${file}: expected failures, got none`); bad++; }
}
if (last(run('skills/latex-check/scripts/lint.mjs', 'short-rules.md').out) !== 'ok: 17 checked') { console.log('DIFF  lint short-rules.md: expected "ok: 17 checked"'); bad++; }

const total = Object.keys(expected).length * 2 + 1;
console.log(bad ? `${bad} of ${total} differ` : `all ${total} as expected`);
process.exit(bad ? 1 : 0);
