---
name: latex-check
description: Write LaTeX math that renders in Claude Code (the desktop app's Code tab), and check replies and markdown documents before sending. Use whenever a reply or a markdown file written in Claude Code will contain math in $...$ or $$...$$.
allowed-tools: Bash(node *) PowerShell(node *)
---

# Math that renders in the Claude desktop app

The app only treats a span as math when it looks like a formula, so valid TeX can show as plain
text. For the rest of this session, write every reply that contains math by these rules, and check
it before sending.

Markdown files you write that contain math follow these rules too, plus those in "Documents" below.

## Rules

- Use `$...$` inline and `$$...$$` only as its own paragraph, with a blank line before and after;
  its own line isn't enough. In a list item, also indent it to the item's text. Never use `\(...\)`
  or `\[...\]`.
- Inline spans: at most 60 characters, on one line, not starting with a digit, `(` or `[`, not
  ending with an operator.
- Every inline span needs a `\command` or one of `= + - < > ^ _`, except a single letter, or a
  single letter applied to single letters or numbers separated by `, `, like `f(x)` or `f(a, b)`.
  Plain letters like `$xy$` or `$AB/B$` stay text, and so do `$AB(n)$`, `$f(a,b)$` and `$f(ab)$`:
  write `$\mathrm{AB}(n)$` and `$f(a, b)$`.
- Write a hash sign as `\char35`, not `\#`, which shows as text: `$M \char35 N$`.
- Brace every subscript and superscript: `x_{i}`, `x^{2}`, `x'^{n}`.
- Never put `*` inside `$...$`: markdown can pair it with nearby `**bold**` or `*italics*`
  markers, which then show as stars. Write the symbol as `\ast`, as in `$\mathcal{O}^{\ast}$`.
- In a paragraph with bold or italics, put each `_` in `$...$` right after a letter or digit:
  `x_{i}^{2}`, not `x^{2}_{i}`. After a symbol, it can pair with the emphasis markers the same way.
- Write row breaks as `\cr` followed by a space, not `\\`, as in
  `\begin{pmatrix} 1 & 2 \cr 3 & 4 \end{pmatrix}`. Markdown can eat a backslash of `\\`.
- Put a space before each opening `$`, and a space or `.,;:!?)` after each closing `$`. Never a
  straight quote or hyphen touching a `$`: use “curly quotes” or a non-breaking hyphen (U+2011).

Also run this once per session, to see fixes found on this machine:
`node "${CLAUDE_SKILL_DIR}/scripts/check.mjs" --data "${CLAUDE_PLUGIN_DATA}" --show-fixes`

## If a span is flagged

Rewrite just that span:
- **Over 60 characters:** split it into shorter spans joined by words, as in
  `the sum of $u_{1} v_{1} + u_{2} v_{2}$ and $u_{3} v_{3}$`, or move it to a `$$` paragraph.
- **Starts with a digit:** `$\frac{1}{r}$` or `$r^{-1}$` instead of `$1/r$`; `$2\,x$` instead of `$2x$`.
- **Only plain letters** (`$xY$`, `$AB/B$`; a `/` doesn't count): add context, as in `$xY \in Z$` or
  `$\bar{A} = AB/B$`.
- **Starts with `(` or `[`:** put a name first, as in `$x = (x_{i})$` or `$n = [a:b]$`. Inside
  brackets, write a colon as `\colon`: `$[A \colon B]$`. For a family, reword:
  `choices $a_{B} \in A_{B}$`.
- **Unbraced subscript or superscript:** `$A_{B}$`, `$x'^{n}$`.
- **`*` inside `$...$`:** `\ast` for the symbol, as in `$f \ast g$` or `$f^{\ast}$`; `\operatorname`
  for `\operatorname*` (the same inline); a starred environment like `pmatrix*` goes in a `$$`
  paragraph.
- **`_` after a symbol:** `x_{i}^{2}` for `x^{2}_{i}`; before a subscript, use named brackets:
  `\lVert v \rVert_{2}`, `\lvert z \rvert_{p}`, `\lbrace a \rbrace_{i}`, `\lparen a \rparen_{n}`; after
  a command's braces, drop the braces around a single letter: `\mathbf x_{i}`, `\hat x_{i}`. All
  look the same.
- **`\\` row break:** write `\cr` instead, followed by a space.
- **`\#`:** write `\char35`.
- **Ends with an operator:** complete the formula, as in `$c \mapsto a \cdot b \cdot c$`.
- **Something touches a dollar:** curly quotes, as in `means “$f$ has property P”`; a non-breaking
  hyphen, `word‑$k$`; or reword.
- **Emphasis shown as text:** a `*` or `_` in a nearby formula paired with the `**` or `__`
  markers. Fix that formula by the rules above. Stars or underscores meant to show go in code,
  `` `**kwargs` ``, or are escaped, `\*\*`; the check skips both.
- **`KaTeX error`:** the TeX itself is invalid, such as a missing argument in `\frac{1}`. Fix the
  syntax.

## Documents

A markdown file you write, such as notes or a write-up, may be opened in many viewers: the Code
tab's file pane renders like this tab, Cowork and claude.ai like their chat, and other editors and
sites each their own way. Write it by the rules above, and also:
- Write named commands instead of escaped punctuation, which some viewers strip: `\lbrace a \rbrace`
  for `\{a\}`, `\Vert` for `\|`, and `\thinspace`, `\medspace`, `\thickspace`, `\negthinspace` for
  `\,`, `\:`, `\;`, `\!` (so `$2\thinspace x$`, not `$2\,x$`).
- In a table, write `\vert` instead of `|` inside formulas: a `|` can end the cell.
- Keep math out of headings.

Before saying the file is done, check it three ways and fix flagged spans as above: with the
checker as in "Checking a reply" below, again with `--surface chat` added, and with
`node "${CLAUDE_SKILL_DIR}/scripts/lint.mjs" --doc <file>`.

## Checking a reply

1. Write the reply's markdown, exactly as it will be sent, to a temp file and run:
   `node "${CLAUDE_SKILL_DIR}/scripts/check.mjs" --data "${CLAUDE_PLUGIN_DATA}" <file>`
   Run it on its own, without `&&`, pipes or shell variables. It prints only failures plus a summary
   line. Exit 0 = all math renders, 1 = something failed, 2 = the checker couldn't run. A check
   takes about 3 s, or 0.2 s without math. The first run on a machine also installs one dependency
   and searches the app's code, so it takes a bit longer.
2. On `FAIL` lines, fix only the flagged spans:
   - Use "If a span is flagged" above, and the local fixes.
   - Edit each flagged span in the temp file in place. Don't regenerate the reply.
   - Re-run the checker on the edited file, then send that text.
3. On exit 2, for the rest of the session check replies with the rules lint instead, which needs
   no app and also catches KaTeX errors:
   `node "${CLAUDE_SKILL_DIR}/scripts/lint.mjs" <file>`
   Fix flagged spans the same way. It's stricter than the app, so it may flag formulas that would
   render. If the app was found but the checker still failed, an app update has probably broken
   it: tell the user once that the full check isn't working, and suggest updating the plugin,
   since a fix may already be published. If it still fails after updating, suggest reporting it at
   https://github.com/yahya-tamur/claude-latex-check/issues with the error message. If the user
   wants to repair it themselves, `${CLAUDE_PLUGIN_ROOT}/MAINTENANCE.md` lists what the checker
   relies on in the app. If the app wasn't found, just use the lint without mentioning it.

Plain dollar amounts like "$5 and $10" are reported as failures. That's a known false positive;
ignore it. Don't read `check.mjs`, the tests or the app's files during normal use.

## Learning from failures

Each fail-and-retry round costs edits and a re-run, so don't hit the same failure twice:
- Before saving, check whether a rule above already explains the failure, even if it isn't the
  first explanation you thought of; if one does, don't save it.
- When a `FAIL` gets fixed and the fix isn't already covered above or in the local fixes, save it
  right away: the form that failed, the form that rendered, and the rule if there is one.
  `node "${CLAUDE_SKILL_DIR}/scripts/check.mjs" --data "${CLAUDE_PLUGIN_DATA}" --add-fix "<entry>"`
  For example: `$1/r$` failed, `$\frac{1}{r}$` renders; digit-led spans need a TeX symbol.
- Generalize when you can. Save "digit-led spans need a TeX symbol", not just the one formula.
- Anonymize entries. The file may be shared or published, so it must not reveal what the
  conversation was about. Replace the subject's symbols and wording with neutral ones (`x`, `f`,
  `a`, `b`, "property P") while keeping whatever the rule depends on: length, first and last
  character, operators, and what touches the dollars. Run both anonymized forms through the checker
  to confirm the failing one still fails and the fixed one still renders.
- Don't edit the installed plugin's files; they're replaced on every update.

## Talking to the user

Don't mention the checker or these rules in replies unless the user asks, or the checker needs an
update or a bug report as described here.

If the user reports that a formula didn't render even though the checker passed it, or that it
flagged one that does render, fix the formula if needed, save an anonymized local fix as above, and
suggest reporting it at https://github.com/yahya-tamur/claude-latex-check/issues with that example.
