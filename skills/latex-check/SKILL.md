---
name: latex-check
description: Write LaTeX math that renders in Claude Code (the desktop app's Code tab); answers with math are also copied, with fixed formulas, into a conversation document. Use whenever a reply or a markdown file written in Claude Code will contain math in $...$ or $$...$$.
allowed-tools: Bash(node *) PowerShell(node *)
---

# Math that renders in the Claude desktop app

The app only treats a span as math when it looks like a formula, so valid TeX can show as plain
text. For the rest of this session, write every reply that contains math by the rules below. After
each such reply, a script copies it, after the user's message, into a conversation document,
rewriting formulas that wouldn't render and checking them with the app's own renderer; the user
reads the rendered answer there, in the app's file pane.

## Rules

The script fixes most problems, but write math this way:
- Write all math in LaTeX, even single letters, numbers and short expressions: `$\textstyle x$`,
  `$\textstyle 3$`, `$\textstyle n + 1$`, `$\textstyle \eta \colon X \to Y$`. Don't write math
  in plain text or Unicode symbols, such as η: X → Y or x², even when it's short.
- Start every inline formula with `\textstyle `, as in `$\textstyle x^{2} + 1$`. It changes
  nothing visible, and with it the app takes the formula for math.
- Use `$...$` inline, on one line. Never use `\(...\)` or `\[...\]`.
- Give each `$$...$$` its own paragraph, with a blank line before and after; its own line isn't
  enough. In a list item, also indent it to the item's text.
- Keep inline formulas short, at most about 45 characters after `\textstyle `. A longer one goes in
  a `$$` paragraph.
- Put a space before each opening `$`, and a space or `.,;:!?)` after each closing `$`.

## Answering with math

Answer in the chat as usual; you don't run anything. The copy goes to `math-notes/<session>.md` in
the working directory; its exact path is given to you right after this skill loads.
- End your first reply that has math with one short sentence saying the rendered answer is in that
  document, linking it. Afterwards, open it in the app's file pane if you have a tool for that.
- If a copy still has a formula the script couldn't fix, you're asked to fix it in a draft: fix
  only the flagged spans there, with in-place edits (see "If a span is flagged"), and run the
  command it gives. Don't send the answer again.

Plain dollar amounts like "$5 and $10" are reported as failures; that's a known false positive, so
write them as "5 and 10 dollars". Don't read `check.mjs`, the tests or the app's files during
normal use. If the checker needs repairs (it says so in an error), suggest updating the plugin, and
if that doesn't help, reporting it at https://github.com/yahya-tamur/claude-latex-check/issues;
`${CLAUDE_PLUGIN_ROOT}/MAINTENANCE.md` lists what the checker relies on in the app.

## If a span is flagged

These are what the script couldn't rewrite. Fix just that span:
- **A long formula shown as text:** an inline span holds at most 60 characters, counting
  `\textstyle `. Shorten it, split it into spans joined by words, or move it to a `$$` paragraph.
- **`$$...$$` shown as text:** give it its own paragraph, with a blank line before and after.
- **Something touches a dollar:** reword so that a space comes before the opening `$`, and a space
  or `.,;:!?)` after the closing one.
- **Emphasis shown as text:** a `_` right after a symbol in a nearby formula paired with the `**`
  or `__` markers. Put the `_` right after a letter: named brackets, as in `\lVert v \rVert_{2}`
  or `\lbrace a \rbrace_{i}`, or no braces around a single letter, as in `\mathbf x_{i}`. Stars or
  underscores meant to show go in code, `` `**kwargs` ``, or are escaped, `\*\*`.
- **`KaTeX error`:** the TeX itself is invalid, such as a missing argument in `\frac{1}`. Fix the
  syntax.
- **`unknown command`:** use a command KaTeX supports, or `\operatorname{name}` / `\text{...}`.
- A failure also prints the fixes saved on this machine, which may cover it. If it isn't clear why
  a span is `shown as text`, the lint names the rule it breaks:
  `node "${CLAUDE_SKILL_DIR}/scripts/lint.mjs" <draft>`

## Other documents

Other markdown files you write, such as notes or a write-up for the user, may be opened in many
viewers: the Code tab's file pane renders like this tab, Cowork and claude.ai like their chat, and
other editors and sites each their own way. Write them by the rules above, and also:
- Write named commands instead of escaped punctuation, which some viewers strip: `\lbrace a \rbrace`
  for `\{a\}`, `\Vert` for `\|`, and `\thinspace`, `\medspace`, `\thickspace`, `\negthinspace` for
  `\,`, `\:`, `\;`, `\!` (so `$2\thinspace x$`, not `$2\,x$`).
- In a table, write `\vert` instead of `|` inside formulas: a `|` can end the cell.
- Keep math out of headings.

Before saying the file is done, check it three ways and fix what's flagged:
`node "${CLAUDE_SKILL_DIR}/scripts/check.mjs" --fix --data "${CLAUDE_PLUGIN_DATA}" <file>`, the same
with `--surface chat` added, and `node "${CLAUDE_SKILL_DIR}/scripts/lint.mjs" --doc <file>`.

## Learning from failures

Each fail-and-retry round costs edits and a re-run, so don't hit the same failure twice:
- Before saving, check whether a rule above already explains the failure, even if it isn't the
  first explanation you thought of; if one does, don't save it.
- When a `FAIL` that the script didn't rewrite gets fixed and the fix isn't already covered above
  or in the local fixes, save it right away: the form that failed, the form that rendered, and the
  rule if there is one.
  `node "${CLAUDE_SKILL_DIR}/scripts/check.mjs" --data "${CLAUDE_PLUGIN_DATA}" --add-fix "<entry>"`
- Generalize when you can: save the pattern, not just the one formula.
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
