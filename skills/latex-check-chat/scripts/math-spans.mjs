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
//   { type: 'midDisplay', tex, span, ownLine }          $$...$$ inside a paragraph; ownLine if
//       nothing else is on its lines (the chat view renders that, the Code tab doesn't)
//   { type: 'inline', tex, span, before, after, multiline, emphasis }  $...$; before/after are the
//       characters touching the dollars, skipping emphasis markers; emphasis if the paragraph has
//       * or _ outside math, which a formula's * or _ could pair with
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
    for (const m of t.matchAll(/\$\$([^$]+)\$\$/g)) {
      const end = m.index + m[0].length;
      const ownLine = /(^|\n)[ \t]*$/.test(t.slice(0, m.index)) && /^[ \t]*(\n|$)/.test(t.slice(end));
      spans.push({ type: 'midDisplay', tex: m[1], span: m[0], ownLine });
    }
    const rest = t.replace(/\$\$[^$]+\$\$/g, m => ' '.repeat(m.length));
    const first = spans.length;
    let prose = rest;
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
        before: skipEmphasis(rest, i - 1, -1), after: skipEmphasis(rest, j + 1, 1), at: i,
      });
      prose = prose.slice(0, i) + ' '.repeat(j + 1 - i) + prose.slice(j + 1);
      i = j;
    }
    // Emphasis can't cross into another list item, heading, table cell or quote line.
    const blocks = [...prose.matchAll(/(?:^|\n)(?=[ \t]*(?:[-*+]|\d+[.)])[ \t]|[ \t]*[#>|])/g)].map(m => m.index).concat(prose.length);
    for (const s of spans.slice(first)) {
      if (s.type !== 'inline') continue;
      const k = blocks.findLastIndex(b => b <= s.at);
      const cellStart = prose.lastIndexOf('|', s.at), cellEnd = prose.indexOf('|', s.at);
      const from = Math.max(blocks[k], cellStart), to = cellEnd < 0 ? blocks[k + 1] : Math.min(blocks[k + 1], cellEnd);
      const block = prose.slice(from, to).replace(/^\n?[ \t]*(?:[-*+]|\d+[.)])[ \t]/, '');
      s.emphasis = /[*_]/.test(block.replace(/\\[*_]/g, ''));
      delete s.at;
    }
  }
  return spans;
}

function skipEmphasis(s, i, step) {
  while (s[i] === '*' || s[i] === '_') i += step;
  return s[i];
}
