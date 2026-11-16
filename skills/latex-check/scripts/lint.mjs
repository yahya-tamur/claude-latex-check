// Lint a markdown draft against the "Rules" in this skill's SKILL.md, plus KaTeX errors, without
// the app. The fallback when check.mjs can't run (e.g. after an app update). The rules are stricter
// than the app, so a flagged formula may still render; a clean result means it follows the rules.
//
// usage: node lint.mjs [--fix] [--doc] [--append <file.md>] [file.md]   (reads stdin when no file)
//   --append  add the text to this markdown document if nothing fails, as check.mjs does
//   --fix  first rewrite inline formulas where a known rewrite exists, saving the file in place
//          and printing its new text
//   --doc  also the rules for markdown documents, which other viewers open
// Prints only problems ("FAIL  rule: <what>: <span>"), then "N failed, M checked", "ok: M checked"
// or "ok: no math". exit 0 = all fine, 1 = something failed.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
// Span finding and KaTeX are shared with the chat skill, which bundles KaTeX.
import { commonRules, docRules, findSpans, fixText, katexProblem, loadKatex, strictRules } from '../../latex-check-chat/scripts/math-spans.mjs';

let katex;
try { katex = loadKatex(); } catch {}

const doc = process.argv.includes('--doc');
const argv = process.argv.slice(2);
const append = argv.includes('--append') ? argv[argv.indexOf('--append') + 1] : undefined;
const file = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--append');
const problems = [];
const katexCheck = (tex, displayMode) => { const p = katex && katexProblem(katex, tex, displayMode); if (p) problems.push(p); };
let checked = 0;

let text = readFileSync(file ?? 0, 'utf8');
if (process.argv.includes('--fix')) {
  const r = fixText(text, katex);
  if (r.fixed) {
    text = r.text;
    if (file) writeFileSync(file, text);
    console.log(append ? `rewrote ${r.fixed} formulas` : `rewrote ${r.fixed} formulas${file ? ' and saved the file' : ''}; the text is now:\n${text.trimEnd()}\n--`);
  }
}
for (const s of findSpans(text)) {
  for (const p of [...commonRules(s), ...strictRules(s), ...(doc ? docRules(s) : [])]) problems.push(`rule: ${p}: ${s.span}`);
  if (s.type === 'inline') { checked++; if (!s.multiline) katexCheck(s.tex, false); }
  else if (s.type === 'display' && s.delim === '$$') { checked++; katexCheck(s.tex, true); }
}

for (const p of problems) console.log(`FAIL  ${p}`);
if (append) {
  // As check.mjs does: keep the entry in a draft until it passes, then add it to the document.
  const draft = file ?? join(dirname(append), `.${basename(append, '.md')}.draft.md`);
  if (problems.length) {
    mkdirSync(dirname(draft), { recursive: true });
    writeFileSync(draft, text);
    console.log(`not added to ${append}. Fix the flagged spans in ${draft}, then run the same command with ${draft} in place of the text on stdin.`);
  } else {
    const old = existsSync(append) ? readFileSync(append, 'utf8').trimEnd() : '';
    mkdirSync(dirname(append), { recursive: true });
    writeFileSync(append, `${old ? `${old}\n\n---\n\n` : ''}${text.trim()}\n`);
    if (basename(draft).endsWith('.draft.md')) rmSync(draft, { force: true });
    console.log(`added to ${append}`);
  }
}
if (!checked && !problems.length) { console.log('ok: no math'); process.exit(0); }
console.log(problems.length ? `${problems.length} failed, ${checked} checked` : `ok: ${checked} checked`);
process.exit(problems.length ? 1 : 0);
