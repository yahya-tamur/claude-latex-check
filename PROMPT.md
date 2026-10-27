Paste this into a CLAUDE.md (global `~/.claude/CLAUDE.md` or a project's), replacing `<repo>` with
the absolute path of this repository.

---

## Checking math before sending

Before sending a reply that contains LaTeX, check that it renders in the Claude desktop app:

1. Write the reply's markdown, exactly as it will be sent, to a temporary file.
2. Run `node "<repo>/check.mjs" <file>` (or pipe the text to it on stdin).
3. Each `FAIL` line is a formula that would show as plain text or as a KaTeX error. Fix those and
   re-run until it prints `ok`. Then send.

Exit codes: 0 = all math renders, 1 = something failed, 2 = the checker itself couldn't run (app not
installed, or an app update changed its internals). On 2, send the reply anyway and mention that
the math couldn't be checked.

The app only treats a span as math when it looks like a formula. What renders reliably:
- `$...$` for inline math. A span that starts with a digit needs a TeX symbol or operator:
  `$\frac{1}{r}$` or `$r^{-1}$`, not `$1/r$`; `$2\,x$` or `$2x+1$`, not `$2x$`.
- `$$...$$` for display math, only as its own paragraph, never mid-sentence.
- Keep each `$...$` on one line.
- Avoid `\(...\)` and `\[...\]`: simple ones like `\(x\)` or `\(2x\)` show as plain `(x)`, `(2x)`.
