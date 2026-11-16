---
name: latex-check-chat
description: Write LaTeX math that renders in replies and documents on claude.ai and in Cowork (not Claude Code). Use whenever a reply or a markdown document there will contain math in $...$ or $$...$$.
allowed-tools: Bash(node *) PowerShell(node *)
license: MIT
---

# Math that renders in Claude's chat

Claude's chat renders almost any `$...$` as math. What goes wrong is invalid TeX, which shows as an
error or with a command spelled out literally, and a few layout mistakes. For the rest of this
session, follow these rules in every reply that contains math.
Markdown files you create that contain math follow them too, plus those in "Documents" below.

## Rules

- Start every inline formula with `\textstyle `, as in `$\textstyle x^{2} + 1$`. It changes
  nothing visible, and it makes the formula render in stricter viewers too, such as Claude Code's.
- Put `$$...$$` only on its own paragraph, never mid-sentence.
- Keep each `$...$` on one line.
- Don't escape brackets in text: write [a, b], not `\[a, b\]`, which shows as a broken formula.
- Never put `*` inside `$...$`: markdown can pair it with nearby `**bold**` or `*italics*`
  markers, which then show as stars. Write the symbol as `\ast`, as in `$\mathcal{O}^{\ast}$`.
- In a paragraph with bold or italics, put each `_` in `$...$` right after a letter or digit:
  `x_{i}^{2}`, not `x^{2}_{i}`. After a symbol, it can pair with the emphasis markers the same way.
- Write row breaks as `\cr` followed by a space, not `\\`, as in
  `\begin{pmatrix} 1 & 2 \cr 3 & 4 \end{pmatrix}`. Markdown can eat a backslash of `\\`.
- Use only commands KaTeX knows; give every command all its arguments, and balance braces.

## Writing a reply

Write the reply directly, by the rules above; nothing checks it after it's sent. If the user
says a formula didn't render, rewrite it by the rules, or with a command KaTeX supports.

## Documents

A markdown file you create may also be opened in stricter viewers, such as Claude Code's, which
only treats a span as math when it looks like a formula. Write it by the rules above, and also:
- Inline `$...$`: at most 60 characters; not starting with a digit, `(` or `[`; not ending with an
  operator. Split a long one into spans joined by words, or move it to a `$$` paragraph.
- Every inline formula needs a `\command` or one of `= + - < > ^ _`, except a single letter, or a
  single letter applied to single letters or numbers separated by `, `, like `f(x)` or `f(a, b)`:
  `$\frac{1}{r}$`, not `$1/r$`; `$x = (a, b)$`, not `$(a, b)$`; `$\mathrm{AB}(n)$`, not `$AB(n)$`;
  `$f(a, b)$`, not `$f(a,b)$`.
- No run of four or more letters outside braces: `$G \to UFUG$` stays text. Space them,
  `$G \to U F U G$`, or put them in a command's braces, `\mathrm{UFUG}`.
- Write a hash sign as `\char35`, not `\#`, which shows as text: `$M \char35 N$`.
- Brace every subscript and superscript: `x_{i}`, `x^{2}`.
- Put a space before each opening `$`, and a space or `.,;:!?)` after each closing `$`. Never a
  straight quote or hyphen touching a `$`: use “curly quotes” or a non-breaking hyphen (U+2011).
- Give each `$$...$$` a blank line before and after. Never use `\(...\)` or `\[...\]`.
- Write named commands instead of escaped punctuation, which some viewers strip: `\lbrace a \rbrace`
  for `\{a\}`, `\Vert` for `\|`, and `\thinspace`, `\medspace`, `\thickspace`, `\negthinspace` for
  `\,`, `\:`, `\;`, `\!` (so `$2\thinspace x$`, not `$2\,x$`).
- In a table, write `\vert` instead of `|` inside formulas: a `|` can end the cell.
- Keep math out of headings.

Check it with `node ${CLAUDE_SKILL_DIR}/scripts/lint.mjs --fix --doc <file>`. `--fix` rewrites inline
formulas into forms those viewers render where it can (mostly by putting `\textstyle `, which
changes nothing visible, in front) and saves the file. Fix what it still flags by these rules.

Don't mention the check or these rules in replies unless the user asks.
