// Lint a markdown draft against the "Rules" in skills/latex-check/SKILL.md, plus KaTeX errors,
// without the app.
// The fallback when check.mjs can't run (e.g. after an app update). The rules are stricter than the
// app, so a flagged formula may still render; a clean result means it follows the rules.
//
// usage: node lint.mjs [file.md]          (reads stdin when no file)
// Prints only problems ("FAIL  rule: <what>: <span>"), then "N failed, M checked", "ok: M checked"
// or "ok: no math". exit 0 = all fine, 1 = something failed.
import { readFileSync } from 'fs';
import { createRequire } from 'module';

// Formulas are also run through KaTeX, bundled with the latex-check-chat skill.
let katex;
try { katex = createRequire(import.meta.url)('./skills/latex-check-chat/scripts/katex.min.cjs'); } catch {}
function katexCheck(tex, displayMode) {
  if (!katex) return;
  try { katex.renderToString(tex, { throwOnError: true, strict: 'ignore', displayMode, output: 'html' }); }
  catch (e) {
    const msg = String(e.message).replace(/^KaTeX parse error: /, '').split('\n')[0];
    const cmd = msg.match(/Undefined control sequence: (\\[a-zA-Z]+)/)?.[1];
    problems.push(cmd ? `unknown command ${cmd} shown literally in ${tex.trim()}` : `KaTeX error in ${tex.trim()}: ${msg}`);
  }
}

const src = readFileSync(process.argv[2] ?? 0, 'utf8');
// Code blocks and inline code aren't math; blank them out, keeping line breaks.
const text = src.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, m => m.replace(/[^\n]/g, ' '));

const problems = [];
const fail = (what, span) => problems.push(`rule: ${what}: ${span}`);
let checked = 0;

// Characters allowed right before an opening $ and right after a closing $. Non-ASCII (curly
// quotes, U+2011 hyphen) is fine; emphasis markers are skipped over.
const okBefore = c => c === undefined || /[\s([]/.test(c) || c > '\x7f';
const okAfter = c => c === undefined || /[\s.,;:!?)]/.test(c) || c > '\x7f';
const skipEmphasis = (s, i, step) => { while (s[i] === '*' || s[i] === '_') i += step; return s[i]; };

function lintSpan(body, span, before, after) {
  checked++;
  const t = body.trim();
  if (body.includes('\n')) return fail('keep each $...$ on one line', span.replace(/\s*\n\s*/g, ' '));
  if (body.length > 60) fail('at most 60 characters', span);
  if (/^[\d([]/.test(t)) fail('don\'t start with a digit, ( or [', span);
  if (/(?:[-+=<>/^_,:;({[\\]|(?<![_^])\*)$/.test(t)) fail('don\'t end with an operator', span);
  const simple = /^[A-Za-z]$/.test(t) || /^[A-Za-z]\([A-Za-z0-9, ]*\)$/.test(t);
  if (!simple && !/\\[A-Za-z]|[=+\-<>^_]/.test(t)) fail('needs a \\command or one of = + - < > ^ _', span);
  if (/[_^](?!\{)/.test(t)) fail('brace every subscript and superscript', span);
  if (!okBefore(before)) fail('space or ( [ before the opening $', span);
  if (!okAfter(after)) fail('space or .,;:!?) after the closing $', span);
  katexCheck(body, false);
}

for (const para of text.split(/\n[ \t]*\n/)) {
  const t = para.trim();
  if (!t) continue;
  if (/\\\(|\\\[/.test(t)) for (const m of t.matchAll(/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g)) fail('use $...$ or $$...$$, not \\( \\) or \\[ \\]', m[0]);
  if (/^\$\$[\s\S]+\$\$$/.test(t)) { checked++; katexCheck(t.slice(2, -2), true); continue; }
  for (const m of t.matchAll(/\$\$[^$]+\$\$/g)) fail('$$...$$ only as its own paragraph', m[0]);
  const rest = t.replace(/\$\$[^$]+\$\$/g, m => ' '.repeat(m.length));
  // Inline $...$, paired the way markdown math usually is: opening $ not followed by a space,
  // closing $ not preceded by a space and not followed by a digit ("$5 and $10" isn't math).
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] !== '$' || rest[i - 1] === '\\' || /\s/.test(rest[i + 1] ?? ' ')) continue;
    let j = i + 1;
    while (j < rest.length && !(rest[j] === '$' && rest[j - 1] !== '\\' && !/\s/.test(rest[j - 1]) && !/\d/.test(rest[j + 1] ?? ''))) j++;
    if (j >= rest.length) continue;
    lintSpan(rest.slice(i + 1, j), rest.slice(i, j + 1), skipEmphasis(rest, i - 1, -1), skipEmphasis(rest, j + 1, 1));
    i = j;
  }
}

for (const p of problems) console.log(`FAIL  ${p}`);
if (!checked && !problems.length) { console.log('ok: no math'); process.exit(0); }
console.log(problems.length ? `${problems.length} failed, ${checked} checked` : `ok: ${checked} checked`);
process.exit(problems.length ? 1 : 0);
