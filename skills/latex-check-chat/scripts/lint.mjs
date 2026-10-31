// Lint a markdown draft for Claude's chat view (claude.ai, Cowork): this skill's rules, plus KaTeX,
// the library the chat view renders math with.
// Needs only Node: KaTeX is bundled next to this file (see math-spans.mjs).
//
// usage: node lint.mjs [file.md]          (reads stdin when no file)
// Prints only problems, then a summary line:
//   FAIL  KaTeX error in <tex>: <message>        invalid TeX, shown as an error
//   FAIL  unknown command <cmd> shown literally in <tex>
//   FAIL  $$...$$ mid-sentence shows as text: <span>
//   FAIL  $...$ split across lines shows as text: <span>
//   N failed, M checked  |  ok: M checked  |  ok: no math
// exit 0 = all fine, 1 = something failed, 2 = couldn't run.
import { readFileSync } from 'fs';
import { findSpans, katexProblem, loadKatex } from './math-spans.mjs';

let katex;
try { katex = loadKatex(); }
catch (e) { console.error(`lint: couldn't load KaTeX: ${e.message}`); process.exit(2); }

const problems = [];
let checked = 0;
const check = (tex, displayMode) => { checked++; const p = katexProblem(katex, tex, displayMode); if (p) problems.push(p); };
for (const s of findSpans(readFileSync(process.argv[2] ?? 0, 'utf8'))) {
  if (s.type === 'display') check(s.tex, true);
  else if (s.type === 'midDisplay') problems.push(`$$...$$ mid-sentence shows as text: ${s.span}`);
  else if (s.type === 'paren') check(s.tex, false);
  else if (s.type === 'inline' && s.multiline) problems.push(`$...$ split across lines shows as text: ${s.span}`);
  else if (s.type === 'inline') check(s.tex, false);
}

for (const p of problems) console.log(`FAIL  ${p}`);
if (!checked && !problems.length) { console.log('ok: no math'); process.exit(0); }
console.log(problems.length ? `${problems.length} failed, ${checked} checked` : `ok: ${checked} checked`);
process.exit(problems.length ? 1 : 0);
