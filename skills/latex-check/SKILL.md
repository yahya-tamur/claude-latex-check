---
name: latex-check
description: Write LaTeX math that renders in the Claude desktop app's Code tab, and check replies before sending. Use whenever a reply will contain math in $...$ or $$...$$.
---

# Math that renders in the Claude desktop app

The app only treats a span as math when it looks like a formula, so valid TeX can show as plain
text. For the rest of this session, write every reply that contains math by these rules, and check
it before sending.

## Rules

- Use `$...$` inline and `$$...$$` only as its own paragraph. Never use `\(...\)` or `\[...\]`.
- Inline spans: at most 60 characters, on one line, not starting with a digit, `(` or `[`, not
  ending with an operator.
- Every inline span other than a single letter or `f(x)` needs a `\command` or one of
  `= + - < > ^ _`. Plain letters like `$xy$` or `$AB/B$` stay text.
- Brace every subscript and superscript: `x_{i}`, `x^{2}`, `x'^{n}`.
- Put a space before each opening `$`, and a space or `.,;:!?)` after each closing `$`. Never a
  straight quote or hyphen touching a `$`: use “curly quotes” or a non-breaking hyphen (U+2011).

Also run this once per session, to see fixes found on this machine:
`node "${CLAUDE_PLUGIN_ROOT}/check.mjs" --data "${CLAUDE_PLUGIN_DATA}" --show-fixes`

## Checking a reply

1. Write the reply's markdown, exactly as it will be sent, to a temp file and run:
   `node "${CLAUDE_PLUGIN_ROOT}/check.mjs" --data "${CLAUDE_PLUGIN_DATA}" <file>`
   Run it on its own, without `&&`, pipes or shell variables. It prints only failures plus a summary
   line. Exit 0 = all math renders, 1 = something failed,
   2 = the checker couldn't run. A check takes about 3 s, or 0.2 s without math. The first run on
   a machine also installs one dependency and builds a cache, so it takes a bit longer.
2. On `FAIL` lines, fix only the flagged spans:
   - On the first failure in a session, read `${CLAUDE_PLUGIN_ROOT}/FIXES.md`, which lists what
     each kind of failing span needs. Use what you've read for later failures; re-read only if a
     fix doesn't work.
   - Edit each flagged span in the temp file in place. Don't regenerate the reply.
   - Re-run the checker on the edited file, then send that text.
3. On exit 2, send the reply anyway and tell the user the math wasn't checked. Then:
   - If the message says the app wasn't found, find the app's resources folder (the one containing
     `ion-dist` or `ion-dist.asar`; it varies by platform, store and version). Save it with
     `node "${CLAUDE_PLUGIN_ROOT}/check.mjs" --data "${CLAUDE_PLUGIN_DATA}" --set-app-path "<path>"`,
     with `*` in place of the version number, because the folder name changes with every update,
     e.g. `C:\Program Files\Claude_*\app\resources`. When several folders match, the most
     recently modified one is used.
   - Otherwise, see `${CLAUDE_PLUGIN_ROOT}/MAINTENANCE.md`.

Plain dollar amounts like "$5 and $10" are reported as failures. That's a known false positive;
ignore it. Don't read `check.mjs`, the tests or the app's files during normal use.

## Learning from failures

Each fail-and-retry round costs edits and a re-run, so don't hit the same failure twice:
- When a `FAIL` gets fixed and the fix isn't already in FIXES.md or the local fixes, save it right
  away: the form that failed, the form that rendered, and the rule if there is one.
  `node "${CLAUDE_PLUGIN_ROOT}/check.mjs" --data "${CLAUDE_PLUGIN_DATA}" --add-fix "<entry>"`
  For example: `$1/r$` failed, `$\frac{1}{r}$` renders; digit-led spans need a TeX symbol.
- Generalize when you can. Save "digit-led spans need a TeX symbol", not just the one formula.
- Anonymize entries. The file may be shared or published, so it must not reveal what the
  conversation was about. Replace the subject's symbols and wording with neutral ones (`x`, `f`,
  `a`, `b`, "property P") while keeping whatever the rule depends on: length, first and last
  character, operators, and what touches the dollars. Run both anonymized forms through the checker
  to confirm the failing one still fails and the fixed one still renders.
- Don't edit the plugin's own files, and don't offer to. The user curates the rules and tests.

## Talking to the user

Keep all of this behind the scenes. Plain wording like "I rewrote a formula so it renders" or "I
couldn't check the math rendering this time" is fine. Don't name the checker, its files, exit codes
or the rules unless the user asks how it works.

If the user reports that math didn't render as intended even though the checker passed it, or that
it flagged math that does render, treat it as a bug in the checker and see
`${CLAUDE_PLUGIN_ROOT}/MAINTENANCE.md`.
