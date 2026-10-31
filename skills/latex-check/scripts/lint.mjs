// Lint a markdown draft against the "Rules" in this skill's SKILL.md, plus KaTeX errors, without
// the app. The fallback when check.mjs can't run (e.g. after an app update). The rules are stricter
// than the app, so a flagged formula may still render; a clean result means it follows the rules.
//
// usage: node lint.mjs [file.md]          (reads stdin when no file)
// Prints only problems ("FAIL  rule: <what>: <span>"), then "N failed, M checked", "ok: M checked"
// or "ok: no math". exit 0 = all fine, 1 = something failed.
import { readFileSync } from 'fs';
// Span finding and KaTeX are shared with the chat skill, which bundles KaTeX.
import { findSpans, katexProblem, loadKatex } from '../../latex-check-chat/scripts/math-spans.mjs';

let katex;
try { katex = loadKatex(); } catch {}

const problems = [];
const fail = (what, span) => problems.push(`rule: ${what}: ${span}`);
const katexCheck = (tex, displayMode) => { const p = katex && katexProblem(katex, tex, displayMode); if (p) problems.push(p); };
let checked = 0;

// Characters allowed right before an opening $ and right after a closing $. Non-ASCII (curly
// quotes, U+2011 hyphen) is fine.
const okBefore = c => c === undefined || /[\s([]/.test(c) || c > '\x7f';
const okAfter = c => c === undefined || /[\s.,;:!?)]/.test(c) || c > '\x7f';

function lintInline({ tex, span, before, after, multiline }) {
  checked++;
  if (multiline) return fail('keep each $...$ on one line', span);
  const t = tex.trim();
  if (tex.length > 60) fail('at most 60 characters', span);
  if (/^[\d([]/.test(t)) fail('don\'t start with a digit, ( or [', span);
  if (/(?:[-+=<>/^_,:;({[\\]|(?<![_^])\*)$/.test(t)) fail('don\'t end with an operator', span);
  const simple = /^[A-Za-z]$/.test(t) || /^[A-Za-z]\([A-Za-z0-9, ]*\)$/.test(t);
  if (!simple && !/\\[A-Za-z]|[=+\-<>^_]/.test(t)) fail('needs a \\command or one of = + - < > ^ _', span);
  if (/[_^](?!\{)/.test(t)) fail('brace every subscript and superscript', span);
  if (!okBefore(before)) fail('space or ( [ before the opening $', span);
  if (!okAfter(after)) fail('space or .,;:!?) after the closing $', span);
  katexCheck(tex, false);
}

for (const s of findSpans(readFileSync(process.argv[2] ?? 0, 'utf8'))) {
  if (s.type === 'inline') lintInline(s);
  else if (s.type === 'midDisplay') fail('$$...$$ only as its own paragraph', s.span);
  else if (s.type === 'paren' || s.type === 'bracket' || (s.type === 'display' && s.delim === '\\['))
    fail('use $...$ or $$...$$, not \\( \\) or \\[ \\]', s.span);
  else if (s.type === 'display') { checked++; katexCheck(s.tex, true); }
}

for (const p of problems) console.log(`FAIL  ${p}`);
if (!checked && !problems.length) { console.log('ok: no math'); process.exit(0); }
console.log(problems.length ? `${problems.length} failed, ${checked} checked` : `ok: ${checked} checked`);
process.exit(problems.length ? 1 : 0);
