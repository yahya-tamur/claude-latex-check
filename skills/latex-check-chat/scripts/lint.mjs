// Lint a markdown draft for Claude's chat view (claude.ai, Cowork): this skill's rules, plus KaTeX,
// the library the chat view renders math with.
// Needs only Node: KaTeX is bundled next to this file (see math-spans.mjs).
//
// usage: node lint.mjs [--doc] [file.md]   (reads stdin when no file)
//   --doc  for a markdown document: also the rules of stricter viewers such as Claude Code's
// Prints only problems, then a summary line:
//   FAIL  KaTeX error in <tex>: <message>        invalid TeX, shown as an error
//   FAIL  unknown command <cmd> shown literally in <tex>
//   FAIL  $$...$$ mid-sentence shows as text: <span>
//   FAIL  rule: <what>: <span>                    breaks a rule (see SKILL.md)
//   FAIL  $...$ split across lines shows as text: <span>
//   N failed, M checked  |  ok: M checked  |  ok: no math
// exit 0 = all fine, 1 = something failed, 2 = couldn't run.
import { readFileSync } from 'fs';
import { commonRules, docRules, findSpans, katexProblem, loadKatex, strictRules } from './math-spans.mjs';

let katex;
try { katex = loadKatex(); }
catch (e) { console.error(`lint: couldn't load KaTeX: ${e.message}`); process.exit(2); }

const doc = process.argv.includes('--doc');
const file = process.argv.slice(2).find(a => a !== '--doc');
const problems = [];
let checked = 0;
const check = (tex, displayMode) => { checked++; const p = katexProblem(katex, tex, displayMode); if (p) problems.push(p); };
for (const s of findSpans(readFileSync(file ?? 0, 'utf8'))) {
  // Documents are opened in other viewers too, so they also follow the strictest one's rules.
  for (const p of [...commonRules(s), ...(doc ? [...strictRules(s), ...docRules(s)] : [])]) problems.push(`rule: ${p}: ${s.span}`);
  if (s.type === 'display' || (s.type === 'midDisplay' && s.ownLine)) check(s.tex, true);
  else if (s.type === 'midDisplay') { if (!doc) problems.push(`$$...$$ mid-sentence shows as text: ${s.span}`); }
  else if (s.type === 'paren') check(s.tex, false);
  else if (s.type === 'inline' && s.multiline) { if (!doc) problems.push(`$...$ split across lines shows as text: ${s.span}`); }
  else if (s.type === 'inline') check(s.tex, false);
}

for (const p of problems) console.log(`FAIL  ${p}`);
if (!checked && !problems.length) { console.log('ok: no math'); process.exit(0); }
console.log(problems.length ? `${problems.length} failed, ${checked} checked` : `ok: ${checked} checked`);
process.exit(problems.length ? 1 : 0);
