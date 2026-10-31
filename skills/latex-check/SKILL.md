---
name: latex-check
description: Write LaTeX math that renders in the Claude desktop app's Code tab, and check replies before sending. Use whenever a reply will contain math in $...$ or $$...$$.
allowed-tools: Bash(node *) PowerShell(node *)
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
- **Ends with an operator:** complete the formula, as in `$c \mapsto a \cdot b \cdot c$`.
- **Something touches a dollar:** curly quotes, as in `means “$f$ has property P”`; a non-breaking
  hyphen, `word‑$k$`; or reword.
- **`KaTeX error`:** the TeX itself is invalid, such as a missing argument in `\frac{1}`. Fix the
  syntax.

## Checking a reply

1. Write the reply's markdown, exactly as it will be sent, to a temp file and run:
   `node "${CLAUDE_PLUGIN_ROOT}/check.mjs" --data "${CLAUDE_PLUGIN_DATA}" <file>`
   Run it on its own, without `&&`, pipes or shell variables. It prints only failures plus a summary
   line. Exit 0 = all math renders, 1 = something failed, 2 = the checker couldn't run. A check
   takes about 3 s, or 0.2 s without math. The first run on a machine also installs one dependency
   and builds a cache, so it takes a bit longer.
2. On `FAIL` lines, fix only the flagged spans:
   - Use "If a span is flagged" above, and the local fixes.
   - Edit each flagged span in the temp file in place. Don't regenerate the reply.
   - Re-run the checker on the edited file, then send that text.
3. On exit 2, send the reply anyway, written by the rules, and handle it like this:
   - If the message says the app wasn't found, find the app's resources folder (the one containing
     `ion-dist` or `ion-dist.asar`; it varies by platform, store and version). Save it with
     `node "${CLAUDE_PLUGIN_ROOT}/check.mjs" --data "${CLAUDE_PLUGIN_DATA}" --set-app-path "<path>"`.
     The checker replaces version numbers in folder names with `*` itself, so the location keeps
     working after updates.
   - Otherwise, an app update has probably broken the checker. Tell the user once per session that
     math couldn't be checked, and suggest `claude plugin update latex-check@latex-check`, since a
     fix may already be published. If it still fails after updating, suggest reporting it at
     https://github.com/yahya-tamur/claude-latex-check/issues with the error message. If the user
     wants to repair it themselves, `${CLAUDE_PLUGIN_ROOT}/MAINTENANCE.md` explains how. Otherwise,
     keep writing by the rules and don't re-run the checker this session.

Plain dollar amounts like "$5 and $10" are reported as failures. That's a known false positive;
ignore it. Don't read `check.mjs`, the tests or the app's files during normal use.

## Learning from failures

Each fail-and-retry round costs edits and a re-run, so don't hit the same failure twice:
- When a `FAIL` gets fixed and the fix isn't already covered above or in the local fixes, save it
  right away: the form that failed, the form that rendered, and the rule if there is one.
  `node "${CLAUDE_PLUGIN_ROOT}/check.mjs" --data "${CLAUDE_PLUGIN_DATA}" --add-fix "<entry>"`
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
