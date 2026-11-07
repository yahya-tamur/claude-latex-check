// Lint a markdown draft against the "Rules" in this skill's SKILL.md, plus KaTeX errors, without
// the app. The fallback when check.mjs can't run (e.g. after an app update). The rules are stricter
// than the app, so a flagged formula may still render; a clean result means it follows the rules.
//
// usage: node lint.mjs [--doc] [file.md]   (reads stdin when no file)
//   --doc  also the rules for markdown documents, which other viewers open
// Prints only problems ("FAIL  rule: <what>: <span>"), then "N failed, M checked", "ok: M checked"
// or "ok: no math". exit 0 = all fine, 1 = something failed.
import { readFileSync } from 'fs';
// Span finding and KaTeX are shared with the chat skill, which bundles KaTeX.
import { commonRules, docRules, findSpans, katexProblem, loadKatex, strictRules } from '../../latex-check-chat/scripts/math-spans.mjs';

let katex;
try { katex = loadKatex(); } catch {}

const doc = process.argv.includes('--doc');
const file = process.argv.slice(2).find(a => a !== '--doc');
const problems = [];
const katexCheck = (tex, displayMode) => { const p = katex && katexProblem(katex, tex, displayMode); if (p) problems.push(p); };
let checked = 0;

for (const s of findSpans(readFileSync(file ?? 0, 'utf8'))) {
  for (const p of [...commonRules(s), ...strictRules(s), ...(doc ? docRules(s) : [])]) problems.push(`rule: ${p}: ${s.span}`);
  if (s.type === 'inline') { checked++; if (!s.multiline) katexCheck(s.tex, false); }
  else if (s.type === 'display' && s.delim === '$$') { checked++; katexCheck(s.tex, true); }
}

for (const p of problems) console.log(`FAIL  ${p}`);
if (!checked && !problems.length) { console.log('ok: no math'); process.exit(0); }
console.log(problems.length ? `${problems.length} failed, ${checked} checked` : `ok: ${checked} checked`);
process.exit(problems.length ? 1 : 0);
