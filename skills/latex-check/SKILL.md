---
name: latex-check
description: Write LaTeX math that renders in Claude Code (the desktop app's Code tab), and check replies and markdown documents before sending. Use whenever a reply or a markdown file written in Claude Code will contain math in $...$ or $$...$$.
allowed-tools: Bash(node *) PowerShell(node *)
---

# Math that renders in the Claude desktop app

The app only treats a span as math when it looks like a formula, so valid TeX can show as plain
text. A script rewrites most such formulas into forms that render, so write math the way you
normally would, follow the few rules below, and run every reply that contains math through the
script before sending, for the rest of this session. Markdown files you write that contain math
are checked too: see "Documents" below.

## Rules

The script can't fix these, so get them right while writing:
- Use `$...$` inline, on one line. Never use `\(...\)` or `\[...\]`.
- Give each `$$...$$` its own paragraph, with a blank line before and after; its own line isn't
  enough. In a list item, also indent it to the item's text.
- Keep inline formulas short, at most about 45 characters. A longer one goes in a `$$` paragraph.
- Write a number on its own as plain text: 0 or 1.179, never `$0$`.
- Put a space before each opening `$`, and a space or `.,;:!?)` after each closing `$`.

Also run this once per session, to see fixes found on this machine:
`node "${CLAUDE_SKILL_DIR}/scripts/check.mjs" --data "${CLAUDE_PLUGIN_DATA}" --show-fixes`

## If a span is flagged

These are what the script couldn't rewrite. Fix just that span:
- **A long formula shown as text:** an inline span holds at most 60 characters, counting the
  `\textstyle ` the script adds. Shorten it, split it into spans joined by words, or move it to a
  `$$` paragraph.
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
- If it isn't clear why a span is `shown as text`, the lint names the rule it breaks:
  `node "${CLAUDE_SKILL_DIR}/scripts/lint.mjs" <file>`

## Documents

A markdown file you write, such as notes or a write-up, may be opened in many viewers: the Code
tab's file pane renders like this tab, Cowork and claude.ai like their chat, and other editors and
sites each their own way. Write it by the rules above, and also:
- Write named commands instead of escaped punctuation, which some viewers strip: `\lbrace a \rbrace`
  for `\{a\}`, `\Vert` for `\|`, and `\thinspace`, `\medspace`, `\thickspace`, `\negthinspace` for
  `\,`, `\:`, `\;`, `\!` (so `$2\thinspace x$`, not `$2\,x$`).
- In a table, write `\vert` instead of `|` inside formulas: a `|` can end the cell.
- Keep math out of headings.

Before saying the file is done, check it three ways and fix what's flagged: with the script as in
"Checking a reply" below, again with `--surface chat` added, and with
`node "${CLAUDE_SKILL_DIR}/scripts/lint.mjs" --doc <file>`.

## Checking a reply

1. Write the reply's markdown, exactly as it will be sent, to a temp file and run:
   `node "${CLAUDE_SKILL_DIR}/scripts/check.mjs" --fix --data "${CLAUDE_PLUGIN_DATA}" <file>`
   Run it on its own, without `&&`, pipes or shell variables. It rewrites inline formulas into
   forms that render (mostly by putting `\textstyle `, which changes nothing visible, in front),
   saves the file and prints its new text. Then it prints only failures plus a summary line.
   Exit 0 = all math renders, 1 = something failed, 2 = the checker couldn't run. It takes about
   3 s. The first run on a machine also installs one dependency and searches the app's code, so
   it takes a bit longer.
2. On exit 0, send the text the script printed, with its rewritten formulas, not your draft. If
   it printed no text, nothing needed rewriting: send the draft. Send it character for character:
   don't reword it, and keep its curly quotes and hyphens, because even a changed character next
   to a formula can stop it rendering. If you do change anything, check again first.
3. On `FAIL` lines, fix only the flagged spans, using "If a span is flagged" above and the local
   fixes. Edit them in the temp file in place; don't regenerate the reply. Re-run the same
   command, then send the file's text.
4. On exit 2, for the rest of the session use the rules lint instead, which needs no app, does the
   same rewrites and also catches KaTeX errors:
   `node "${CLAUDE_SKILL_DIR}/scripts/lint.mjs" --fix <file>`
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
- When a `FAIL` that the script didn't rewrite gets fixed and the fix isn't already covered above or in the local fixes, save it
  right away: the form that failed, the form that rendered, and the rule if there is one.
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
