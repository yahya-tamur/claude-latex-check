// Check the math in a markdown draft with KaTeX, the library Claude's chat view renders math with.
// Needs only Node: KaTeX 0.16.47 (MIT, the version the desktop app ships) is bundled next to this file.
//
// usage: node katex-check.mjs [file.md]          (reads stdin when no file)
// Prints only problems, then a summary line:
//   FAIL  KaTeX error in <tex>: <message>        invalid TeX, shown as an error
//   FAIL  unknown command <cmd> shown literally in <tex>
//   FAIL  $$...$$ mid-sentence shows as text: <span>
//   FAIL  $...$ split across lines shows as text: <span>
//   N failed, M checked  |  ok: M checked  |  ok: no math
// exit 0 = all fine, 1 = something failed, 2 = couldn't run.
import { readFileSync } from 'fs';
import { createRequire } from 'module';

let katex;
try { katex = createRequire(import.meta.url)('./katex.min.cjs'); }
catch (e) { console.error(`katex-check: couldn't load KaTeX: ${e.message}`); process.exit(2); }

const src = readFileSync(process.argv[2] ?? 0, 'utf8');
// Code blocks and inline code aren't math; blank them out, keeping line breaks.
const text = src.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, m => m.replace(/[^\n]/g, ' '));

const spans = [];   // [tex, displayMode]
const problems = [];
for (const para of text.split(/\n[ \t]*\n/)) {
  const t = para.trim();
  if (!t) continue;
  // Display math: a paragraph that is just $$...$$ or \[...\].
  const display = t.match(/^\$\$([\s\S]+)\$\$$/) ?? t.match(/^\\\[([\s\S]+)\\\]$/);
  if (display) { spans.push([display[1], true]); continue; }
  for (const m of t.matchAll(/\$\$([^$]+)\$\$/g)) problems.push(`$$...$$ mid-sentence shows as text: ${m[0]}`);
  const rest = t.replace(/\$\$[^$]+\$\$/g, m => ' '.repeat(m.length));
  for (const m of rest.matchAll(/\\\(([\s\S]+?)\\\)/g)) spans.push([m[1], false]);
  // Inline $...$: opening $ not followed by a space; closing $ not preceded by a space and not
  // followed by a digit, so "$5 and $10" isn't math.
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] !== '$' || rest[i - 1] === '\\' || /\s/.test(rest[i + 1] ?? ' ')) continue;
    let j = i + 1;
    while (j < rest.length && !(rest[j] === '$' && rest[j - 1] !== '\\' && !/\s/.test(rest[j - 1]) && !/\d/.test(rest[j + 1] ?? ''))) j++;
    if (j >= rest.length) continue;
    const body = rest.slice(i + 1, j);
    if (body.includes('\n')) problems.push(`$...$ split across lines shows as text: ${rest.slice(i, j + 1).replace(/\s*\n\s*/g, ' ')}`);
    else spans.push([body, false]);
    i = j;
  }
}

for (const [tex, displayMode] of spans) {
  try { katex.renderToString(tex, { throwOnError: true, strict: 'ignore', displayMode, output: 'html' }); }
  catch (e) {
    const msg = String(e.message).replace(/^KaTeX parse error: /, '').split('\n')[0];
    const cmd = msg.match(/Undefined control sequence: (\\[a-zA-Z]+)/)?.[1];
    problems.push(cmd ? `unknown command ${cmd} shown literally in ${tex.trim()}` : `KaTeX error in ${tex.trim()}: ${msg}`);
  }
}

for (const p of problems) console.log(`FAIL  ${p}`);
if (!spans.length && !problems.length) { console.log('ok: no math'); process.exit(0); }
console.log(problems.length ? `${problems.length} failed, ${spans.length} checked` : `ok: ${spans.length} checked`);
process.exit(problems.length ? 1 : 0);
