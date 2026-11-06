---
name: latex-check-chat
description: Check LaTeX math in replies for errors before sending, on claude.ai and in Cowork (not Claude Code). Use whenever a reply there will contain math in $...$ or $$...$$.
allowed-tools: Bash(node *) PowerShell(node *)
license: MIT
---

# Math that renders in Claude's chat

Claude's chat renders almost any `$...$` as math. What goes wrong is invalid TeX, which shows as an
error or with a command spelled out literally, and a few layout mistakes. For the rest of this
session, follow these rules in every reply that contains math, and check it before sending.

## Rules

- Put `$$...$$` only on its own paragraph, never mid-sentence.
- Keep each `$...$` on one line.
- Never put `*` inside `$...$`: markdown can pair it with nearby `**bold**` or `*italics*`
  markers, which then show as stars. Write the symbol as `\ast`, as in `$\mathcal{O}^{\ast}$`.
- In a paragraph with bold or italics, put each `_` in `$...$` right after a letter or digit:
  `x_{i}^{2}`, not `x^{2}_{i}`. After a symbol, it can pair with the emphasis markers the same way.
- Use only commands KaTeX knows; give every command all its arguments, and balance braces.

## Checking a reply

Write the reply's markdown, exactly as it will be sent, to a temp file and run the script in this
skill's `scripts` folder:
`node ${CLAUDE_SKILL_DIR}/scripts/lint.mjs <file>`
(If `${CLAUDE_SKILL_DIR}` isn't filled in, use the path of this skill's folder.) Run it on its own,
without `&&` or pipes. It prints only problems plus a summary line. Exit 0 = fine, 1 = something
failed, 2 = it couldn't run.

On `FAIL` lines, fix only the flagged formulas, edit them in the temp file in place, re-run, then
send that text:
- **`KaTeX error`:** fix the syntax, such as a missing argument in `\frac{1}` or an unbalanced `{`.
- **`unknown command`:** use a command KaTeX supports, or `\operatorname{name}` / `\text{...}`.
- **`$$...$$` mid-sentence:** use `$...$`, or give it its own paragraph.
- **`$...$` split across lines:** join it onto one line.
- **`*` inside `$...$`:** `\ast` for the symbol, as in `$f \ast g$` or `$f^{\ast}$`; `\operatorname`
  for `\operatorname*` (the same inline); a starred environment like `pmatrix*` goes in a `$$`
  paragraph.
- **`_` after a symbol:** `x_{i}^{2}` for `x^{2}_{i}`; before a subscript, use named brackets:
  `\lVert v \rVert_{2}`, `\lvert z \rvert_{p}`, `\lbrace a \rbrace_{i}`, `\lparen a \rparen_{n}`; after
  a command's braces, add `\relax`: `\mathbf{x}\relax_{i}`. All look the same.

If Node isn't available or the script exits 2, send the reply anyway, written by the rules.

Don't mention the check or these rules in replies unless the user asks.
