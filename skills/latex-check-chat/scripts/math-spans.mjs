// Finding math in a markdown draft, and checking a formula with KaTeX. Shared by both skills'
// lint.mjs (this skill's and the Code tab skill's). It lives in this skill's folder because on
// claude.ai only a skill's own folder is copied into the sandbox.
import { createRequire } from 'module';

// KaTeX 0.16.47 (MIT), the version the desktop app ships, bundled next to this file.
export function loadKatex() {
  return createRequire(import.meta.url)('./katex.min.cjs');
}

// null if KaTeX renders the formula, else a problem description. The app shows an unknown command
// literally instead of as an error, so that's reported separately.
export function katexProblem(katex, tex, displayMode) {
  try {
    katex.renderToString(tex, { throwOnError: true, strict: 'ignore', displayMode, output: 'html' });
    return null;
  } catch (e) {
    const msg = String(e.message).replace(/^KaTeX parse error: /, '').split('\n')[0];
    const cmd = msg.match(/Undefined control sequence: (\\[a-zA-Z]+)/)?.[1];
    return cmd ? `unknown command ${cmd} shown literally in ${tex.trim()}` : `KaTeX error in ${tex.trim()}: ${msg}`;
  }
}

// The spans in a draft, in order. Each is one of:
//   { type: 'display', tex, delim: '$$' | '\\[', span }  a paragraph that is just $$...$$ or \[...\]
//   { type: 'midDisplay', span }                        $$...$$ inside a paragraph
//   { type: 'inline', tex, span, before, after, multiline }  $...$; before/after are the characters
//       touching the dollars, skipping emphasis markers
//   { type: 'paren', tex, span }                        \(...\)
//   { type: 'bracket', span }                           \[...\] inside a paragraph
export function findSpans(src) {
  // Code blocks and inline code aren't math; blank them out, keeping line breaks.
  const text = src.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, m => m.replace(/[^\n]/g, ' '));
  const spans = [];
  for (const para of text.split(/\n[ \t]*\n/)) {
    const t = para.trim();
    if (!t) continue;
    const display = t.match(/^\$\$([\s\S]+)\$\$$/) ?? t.match(/^\\\[([\s\S]+)\\\]$/);
    if (display) { spans.push({ type: 'display', tex: display[1], delim: t.startsWith('$$') ? '$$' : '\\[', span: t }); continue; }
    for (const m of t.matchAll(/\$\$[^$]+\$\$/g)) spans.push({ type: 'midDisplay', span: m[0] });
    const rest = t.replace(/\$\$[^$]+\$\$/g, m => ' '.repeat(m.length));
    for (const m of rest.matchAll(/\\\(([\s\S]+?)\\\)/g)) spans.push({ type: 'paren', tex: m[1], span: m[0] });
    for (const m of rest.matchAll(/\\\[[\s\S]*?\\\]/g)) spans.push({ type: 'bracket', span: m[0] });
    // Inline $...$, paired the way markdown math usually is: opening $ not followed by a space,
    // closing $ not preceded by a space and not followed by a digit ("$5 and $10" isn't math).
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] !== '$' || rest[i - 1] === '\\' || /\s/.test(rest[i + 1] ?? ' ')) continue;
      let j = i + 1;
      while (j < rest.length && !(rest[j] === '$' && rest[j - 1] !== '\\' && !/\s/.test(rest[j - 1]) && !/\d/.test(rest[j + 1] ?? ''))) j++;
      if (j >= rest.length) continue;
      const tex = rest.slice(i + 1, j);
      spans.push({
        type: 'inline', tex, span: rest.slice(i, j + 1).replace(/\s*\n\s*/g, ' '), multiline: tex.includes('\n'),
        before: skipEmphasis(rest, i - 1, -1), after: skipEmphasis(rest, j + 1, 1),
      });
      i = j;
    }
  }
  return spans;
}

function skipEmphasis(s, i, step) {
  while (s[i] === '*' || s[i] === '_') i += step;
  return s[i];
}
