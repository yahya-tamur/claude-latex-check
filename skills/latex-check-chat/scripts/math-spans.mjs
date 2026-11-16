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
//   { type: 'display', tex, delim: '$$' | '\\[', span, quoted }  a paragraph that is just $$...$$ or
//       \[...\]; quoted if it's inside a blockquote
//   { type: 'midDisplay', tex, span, ownLine }          $$...$$ inside a paragraph; ownLine if
//       nothing else is on its lines (the chat view renders that, the Code tab doesn't)
//   { type: 'inline', tex, span, before, after, multiline, emphasis }  $...$; before/after are the
//       characters touching the dollars, skipping emphasis markers; emphasis if the paragraph has
//       * or _ outside math, which a formula's * or _ could pair with; table and heading if it's
//       in a table row or a heading; start and end are its position in src
//   { type: 'paren', tex, span }                        \(...\)
//   { type: 'bracket', span }                           \[...\] inside a paragraph
export function findSpans(src) {
  // Code blocks and inline code aren't math; blank them out, keeping line breaks. Blank out
  // blockquote markers too, remembering where they were: inside a quote, the text is read as usual.
  const quoted = [];
  const text = src.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*(?:>[ \t]?)+/gm, (m, at) => { quoted.push(at); return ' '.repeat(m.length); });
  const inQuote = at => { const line = text.lastIndexOf('\n', at - 1) + 1; return quoted.includes(line); };
  const spans = [];
  // Split on blank lines, keeping each paragraph's position in src.
  const parts = text.split(/(\n[ \t]*\n)/);
  for (let k = 0, offset = 0; k < parts.length; offset += parts[k].length, k++) {
    if (k % 2) continue;
    const para = parts[k];
    const t = para.trim();
    if (!t) continue;
    const base = offset + para.length - para.trimStart().length;
    const display = t.match(/^\$\$([\s\S]+)\$\$$/) ?? t.match(/^\\\[([\s\S]+)\\\]$/);
    if (display) { spans.push({ type: 'display', tex: display[1], delim: t.startsWith('$$') ? '$$' : '\\[', span: t, quoted: inQuote(base) }); continue; }
    for (const m of t.matchAll(/\$\$([^$]+)\$\$/g)) {
      const end = m.index + m[0].length;
      const ownLine = /(^|\n)[ \t]*$/.test(t.slice(0, m.index)) && /^[ \t]*(\n|$)/.test(t.slice(end));
      spans.push({ type: 'midDisplay', tex: m[1], span: m[0], ownLine, quoted: inQuote(base + m.index) });
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
        start: base + i, end: base + j + 1,
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
      const line = prose.slice(blocks[k], blocks[k + 1]);
      s.table = /^\n?[ \t]*\|/.test(line);
      s.heading = /^\n?[ \t]*#/.test(line);
      const block = prose.slice(from, to).replace(/^\n?[ \t]*(?:[-*+]|\d+[.)])[ \t]/, '');
      s.emphasis = /[*_]/.test(block.replace(/\\[*_]/g, ''));
      delete s.at;
    }
  }
  return spans;
}

// The rules, as problem texts for one span from findSpans (none: empty):
//   commonRules  both skills, always
//   strictRules  what the Code tab needs, the strictest viewer known: the Code tab skill always, the
//                chat skill for documents
//   docRules     documents, for viewers that strip markdown escapes or split table rows at |
export function commonRules(s) {
  const p = [];
  if (s.type === 'inline' && s.tex.includes('*')) p.push('no * inside $...$; write \\ast');
  if (s.type === 'inline' && s.emphasis && /(^|[^A-Za-z0-9\\])_/.test(s.tex))
    p.push('next to bold or italics, put each _ right after a letter or digit');
  if (s.tex?.includes('\\\\')) p.push('write row breaks as \\cr, not \\\\');
  if (s.type === 'bracket') p.push('\\[...\\] inside a sentence shows its backslashes; write brackets in text as [a, b], and math as $...$');
  return p;
}

// Characters allowed right before an opening $ and right after a closing $. Non-ASCII (curly
// quotes, U+2011 hyphen) is fine.
const okBefore = c => c === undefined || /[\s([]/.test(c) || c > '\x7f';
const okAfter = c => c === undefined || /[\s.,;:!?)]/.test(c) || c > '\x7f';

export function strictRules(s) {
  if (s.quoted && (s.type === 'display' || s.type === 'midDisplay'))
    return ['a $$...$$ display inside a quotation shows as text; end the quotation before it'];
  if (s.type === 'midDisplay') return ['$$...$$ only as its own paragraph, with a blank line before and after'];
  if (s.type === 'paren' || (s.type === 'display' && s.delim === '\\['))
    return ['use $...$ or $$...$$, not \\( \\) or \\[ \\]'];
  if (s.type !== 'inline') return [];
  if (s.multiline) return ['keep each $...$ on one line'];
  const p = [], t = s.tex.trim();
  if (s.tex.length > 60) p.push('at most 60 characters');
  if (/^[\d([]/.test(t)) p.push('don\'t start with a digit, ( or [');
  if (/(?:[-+=<>/^_,:;({[\\]|(?<![_^])\*)$/.test(t)) p.push('don\'t end with an operator');
  // f(x) and f(a, b) render plain; f(a,b) and f(ab) don't.
  const simple = /^[A-Za-z]$/.test(t) || /^[A-Za-z]\((?:[A-Za-z]|\d+)(?:, (?:[A-Za-z]|\d+))*\)$/.test(t);
  if (!simple && !/\\[A-Za-z]|[=+\-<>^_]/.test(t)) p.push('needs a \\command or one of = + - < > ^ _');
  if (/[_^](?!\{)/.test(t)) p.push('brace every subscript and superscript');
  if (t.includes('\\#')) p.push('write # as \\char35, not \\#');
  // A run of 4+ letters reads as a word; letters in a command's braces don't count.
  let bare = t.replace(/\\[A-Za-z]+/g, ' ');
  while (/\{[^{}]*\}/.test(bare)) bare = bare.replace(/\{[^{}]*\}/g, ' ');
  if (/[A-Za-z]{4,}/.test(bare)) p.push('no run of four or more letters outside braces; space them, as in U F U G');
  if (!okBefore(s.before)) p.push('space or ( [ before the opening $');
  if (!okAfter(s.after)) p.push('space or .,;:!?) after the closing $');
  return p;
}

export function docRules(s) {
  if (!s.tex) return [];
  const p = [];
  if (/\\[{}|,;:!]/.test(s.tex.replace(/\\\\/g, '')))
    p.push('escaped punctuation, which some viewers strip; write \\lbrace \\rbrace \\Vert \\thinspace \\medspace \\thickspace \\negthinspace');
  if (s.table && /(?<!\\)\|/.test(s.tex)) p.push('in a table, write \\vert, not |');
  if (s.heading) p.push('no math in headings');
  return p;
}

// Rewrite the inline formulas of a draft into forms the Code tab renders, where a known rewrite
// exists; returns { text, fixed } (fixed: how many formulas changed). Every rewrite draws the same
// thing in TeX. What it can't fix (mainly a formula too long to split) is left for the checker to
// report. katex, when given, validates the pieces of a split.
const PREFIX = '\\textstyle ';   // a no-op in inline math; with it the app takes any formula for math
const MAX = 60;                  // the app's limit for an inline span, dollars excluded
export function fixText(src, katex) {
  const moved = unquoteDisplays(src), spaced = separateDisplays(moved.text);
  src = spaced.text;
  const spans = findSpans(src).filter(s => s.type === 'inline' && !s.multiline);
  let text = src, fixed = moved.count + spaced.count;
  for (const s of spans.reverse()) {
    let before = text.slice(0, s.start), after = text.slice(s.end);
    const body = s.tex.trim().startsWith(PREFIX.trim()) ? s.tex.trim().slice(PREFIX.trim().length).trim() : s.tex.trim();
    let out;
    if (/^-?\d[\d.,]*$/.test(body) && !/[.,]$/.test(body)) out = body.replace(/^-/, '−');   // a lone number is plain text
    else {
      const b = fixBody(body, s.emphasis);
      const pieces = PREFIX.length + b.length <= MAX ? [b] : splitLong(b, MAX - PREFIX.length, katex);
      // A piece ending in an operator or a comma gets the same {} as a whole formula would.
      if (pieces) out = pieces.map(p => p.trim())
        .map(p => `$${PREFIX}${/(?:(?<![_^])[-+]|[=<>/^_({[,:])$/.test(p) ? `${p}{}` : p}$`).join(' ');
      else {
        // Too long to split: give it a $$ paragraph of its own, which has no length limit, and let
        // the sentence go on after it. Punctuation right after the formula moves into the display.
        // Not in a table or a quotation, where a display can't go.
        const line = before.slice(before.lastIndexOf('\n') + 1);
        const item = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+/.exec(line);
        const indent = item ? ' '.repeat(item[0].length) : /^[ \t]*/.exec(line)[0];
        if (/^[ \t]*[|>]/.test(line)) out = `$${b}$`;
        else {
          const punct = /^[.,;:]/.exec(after)?.[0] ?? '';
          after = after.slice(punct.length).replace(/^[ \t]+/, '');
          before = before.replace(/[ \t]+$/, '');
          out = `\n\n${indent}$$${b}${punct}$$\n\n${after.startsWith('\n') ? '' : indent}`;
        }
      }
    }
    // A straight quote or hyphen touching a dollar stops the formula from rendering: curl the quote
    // and its partner on the same line (one character for one, so earlier positions still hold).
    if (out.startsWith('$')) {
      if (before.endsWith('"')) {
        const close = after.search(/"|\n/);
        before = before.slice(0, -1) + '\u201c';
        if (after[close] === '"') after = after.slice(0, close) + '\u201d' + after.slice(close + 1);
      }
      if (after.startsWith('"')) {
        const open = Math.max(before.lastIndexOf('"'), before.lastIndexOf('\n'));
        after = '\u201d' + after.slice(1);
        if (before[open] === '"') before = before.slice(0, open) + '\u201c' + before.slice(open + 1);
      }
      if (/[A-Za-z0-9]-$/.test(before)) before = before.slice(0, -1) + '\u2011';
    }
    if (before + out + after !== text) fixed++;
    text = before + out + after;
  }
  return { text, fixed };
}

// A $$ display that is a paragraph of its own inside a blockquote, taken out of the quote.
function unquoteDisplays(src) {
  const lines = src.split('\n');
  const isQuoted = k => /^[ \t]*>/.test(lines[k] ?? '');
  const strip = k => lines[k].replace(/^[ \t]*(?:>[ \t]?)+/, '');
  const blankAround = k => k < 0 || k >= lines.length || (isQuoted(k) ? strip(k) : lines[k]).trim() === '';
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!isQuoted(i) || !strip(i).trim().startsWith('$$')) continue;
    let j = i;
    const oneLine = strip(i).trim().length > 4 && strip(i).trim().endsWith('$$');
    if (!oneLine) {
      for (j = i + 1; j < lines.length && isQuoted(j) && !strip(j).trim().endsWith('$$'); j++);
      if (j >= lines.length || !isQuoted(j)) continue;
    }
    if (!blankAround(i - 1) || !blankAround(j + 1)) continue;
    for (let k = i; k <= j; k++) lines[k] = strip(k);
    if (i > 0) lines[i - 1] = '';
    if (j + 1 < lines.length) lines[j + 1] = '';
    count++; i = j;
  }
  return { text: lines.join('\n'), count };
}

// A $$ display on lines of its own but inside a paragraph (no blank line around it), given blank
// lines: the Code tab only renders a display that is a paragraph of its own. Not in code blocks,
// quotations or tables.
function separateDisplays(src) {
  const lines = src.split('\n'), out = [];
  let fence = false, count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], t = line.trim();
    if (/^(```|~~~)/.test(t)) fence = !fence;
    if (fence || !t.startsWith('$$') || /^[ \t]*[>|]/.test(line)) { out.push(line); continue; }
    let j = i;
    if (!(t.length > 4 && t.endsWith('$$'))) {
      for (j = i + 1; j < lines.length && !lines[j].trim().endsWith('$$'); j++);
      if (j >= lines.length) { out.push(line); continue; }
    }
    const indent = /^[ \t]*/.exec(line)[0];
    const textBefore = i > 0 && lines[i - 1].trim() !== '', textAfter = j + 1 < lines.length && lines[j + 1].trim() !== '';
    if (textBefore) out.push('');
    for (let k = i; k <= j; k++) out.push(lines[k]);
    if (textAfter) out.push('');
    if (textBefore || textAfter) count++;
    i = j;
  }
  return { text: out.join('\n'), count };
}

function fixBody(tex, emphasis) {
  let t = tex
    .replace(/\\\\(?![A-Za-z])\s*/g, '\\cr ')                       // markdown eats a backslash of \\
    .replace(/\\#\s*/g, '\\char35 ')
    .replace(/\\\|/g, '\\Vert ')                                   // the Code tab drops \|; \Vert is the same
    .replace(/\\operatorname\*/g, '\\operatorname')                 // the same in inline math
    .replace(/(\\(?:begin|end)\{[A-Za-z]+)\*\}/g, '$1\u0000}')      // keep starred environment names
    .replace(/\*/g, '\\ast ').replace(/\u0000/g, '*')
    .replace(/([_^])([A-Za-z0-9])/g, '$1{$2}')
    .replace(/([_^])(\\[A-Za-z]+)(?![A-Za-z{])/g, '$1{$2}');
  if (emphasis) t = t
    .replace(/\^(\{[^{}]*\})_(\{[^{}]*\})/g, '_$2^$1')              // x^{2}_{i} -> x_{i}^{2}
    .replace(/(\\[A-Za-z]+)\{([A-Za-z])\}_/g, '$1 $2_');           // \mathbf{x}_ -> \mathbf x_
  // Space out runs of four or more letters outside braces: the app takes them for a word.
  let depth = 0, out = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\') { const m = /^\\([A-Za-z]+|.)?/.exec(t.slice(i))[0]; out += m; i += m.length - 1; continue; }
    if (c === '{') depth++; else if (c === '}' && depth) depth--;
    const run = depth === 0 && /^[A-Za-z]{4,}/.exec(t.slice(i));
    if (run && !/[A-Za-z]/.test(t[i - 1] ?? '')) { out += run[0].split('').join(' '); i += run[0].length - 1; continue; }
    out += c;
  }
  // A trailing operator makes the app take the formula for text.
  out = out.replace(/ {2,}/g, ' ').trim();
  if (/(?:(?<![_^])[-+]|[=<>/^_({[,:])$/.test(out)) out += '{}';
  return out;
}

// Split a long formula into pieces of at most max characters, before relations and operators at
// the top level, so `$a = b = c$` becomes `$a = b$ ${} = c$`. null if it can't be done.
const SPLIT_AT = /^(?:=|<|>|\+|-|\\(?:to|le|ge|leq|geq|ne|neq|approx|equiv|cong|sim|simeq|subset|subseteq|supset|supseteq|in|mapsto|rightarrow|Rightarrow|leftarrow|implies|iff|cdot|times|oplus|otimes|circ|cup|cap|colon)(?![A-Za-z]))/;
function splitLong(tex, max, katex) {
  const cuts = [];
  let brace = 0, paren = 0, group = 0;
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i];
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)?/.exec(tex.slice(i))[0];
      if (m === '\\left' || m === '\\begin') group++; else if (m === '\\right' || m === '\\end') group--;
      if (!brace && !paren && !group && tex[i - 1] === ' ' && SPLIT_AT.test(tex.slice(i))) cuts.push(i);
      i += m.length - 1; continue;
    }
    if (c === '{') brace++; else if (c === '}') brace--;
    else if (c === '(' || c === '[') paren++; else if (c === ')' || c === ']') paren--;
    else if (!brace && !paren && !group && tex[i - 1] === ' ' && SPLIT_AT.test(tex.slice(i))) cuts.push(i);
  }
  const pieces = [];
  let from = 0;
  const len = (a, b) => tex.slice(a, b).trim().length + (a ? 3 : 0);   // later pieces start with "{} "
  while (len(from, tex.length) > max) {
    const cut = cuts.filter(c => c > from && len(from, c) <= max).pop();
    if (cut === undefined) return null;
    pieces.push(tex.slice(from, cut)); from = cut;
  }
  pieces.push(tex.slice(from));
  const done = pieces.map((p, k) => (k ? '{} ' : '') + p.trim());
  if (katex && done.some(p => katexProblem(katex, p, false))) return null;
  return done;
}

function skipEmphasis(s, i, step) {
  while (s[i] === '*' || s[i] === '_') i += step;
  return s[i];
}
