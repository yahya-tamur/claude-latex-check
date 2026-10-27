# For Claude: using and maintaining this checker

## Using it (read only this part unless the checker exits 2)

1. Clone once to a stable place and reuse it in later sessions (e.g. `~/tools/latex-check`), then
   `npm install` there. Node 18+ and the Claude desktop app must be on the same machine. Optionally
   `npm test` once (~45 s, prints one line).
2. For every reply containing LaTeX: write the reply's markdown, exactly as it will be sent, to a temp
   file and run `node <repo>/check.mjs <file>`. Fix each `FAIL` line, re-run, then send.
3. Exit 0 = all math renders, 1 = something failed, 2 = the checker couldn't run. On 2, send the
   reply anyway, tell the user the math wasn't checked, and see "When it breaks" below.

Writing math that passes the first time:
- Inline `$...$`. A span that starts with a digit needs a TeX symbol or operator:
  `$\frac{1}{r}$`, `$r^{-1}$`, `$2\,x$`, `$2x+1$` render; `$1/r$`, `$2x$` don't.
- Display `$$...$$` only as its own paragraph, never mid-sentence. Keep each `$...$` on one line.
- Avoid `\(...\)` and `\[...\]`: simple ones like `\(x\)` and `\(2x\)` show as plain `(x)`, `(2x)`.

Keeping token use low:
- Run it once per finished draft, not per formula. Output is already minimal: only failures plus a
  summary line. A reply without math costs 0.2 s and prints `ok: no math`.
- Don't read `check.mjs`, the tests or the app bundle during normal use.
- Plain dollar amounts like "$5 and $10" are reported as failures; that's a known false positive.
  Ignore it.
- Save "check LaTeX with <repo>/check.mjs" to memory so later sessions skip setup.

## When it breaks (exit 2 after an app update)

The checker runs the installed app's own code, so app updates can break it. The error message says
which step failed. The app's file names and minified identifiers change every build, so everything
is found by content. What it relies on:

| What | Found by | Used for |
|---|---|---|
| Code-tab markdown hook file | contains `guardedInline:` | decides if math is on, returns `{remarkPlugins, rehypePlugins}` |
| inline-math flag function | `x=<fn>(),{display:` inside that hook | patched to return true/false |
| chunk preloader | `=function(e,t,n){let r=globalThis.__antChunkLoadCtx` | export replaced with `f=>f()` (jsdom never fires `<link>` load events, so it hangs) |
| feature-flag service | `throw …Error("Missing or invalid GrowthBookProvider")` | patched to answer "unknown flag" |
| React | contains `e.createRoot=function`; `createRoot` has `(299)`; `jsx` is found by test-calling | rendering |
| react-markdown | `.runSync(<x>.parse(` | rendering |

A unique match can still be the wrong thing, so a match alone isn't trusted:
- React's `createRoot` and `jsx` are checked by calling them.
- The hook and react-markdown must each match exactly once.
- Once per app version, a wiring check confirms some app component still calls the hook as
  `hook(text, "chat", true, …)`.
- Every run first renders a canary (`$a^2$` inline plus a `$$b^2$$` paragraph) and exits 2 unless
  exactly the expected math renders.

Simulated wrong-but-unique matches at each step all exit 2. What these checks can't catch: the app
keeping this pipeline but drawing the Code tab with a different one. Only `npm test` against what
the user sees in the real app catches that.

Fixing, cheaply:
- Bundle: `<resources>/ion-dist/assets/v1/` (Linux `/usr/lib/claude-desktop/resources`). It has ~3,800
  minified `.js` files, with single lines up to ~500 KB. Never print whole files or lines: use
  `grep -l` to find files and `grep -oE '.{0,200}MARKER.{0,200}'` to see context. Pipe node errors
  through `cut -c1-300 | head`, because stack traces echo minified source lines.
- Re-find the moved piece by searching for stable strings: `singleDollarTextMath`, `inlineGuard:`,
  `rehypePlugins:`, `katex`, `remarkMath`. The Code tab's transcript component calls
  `hook(text, "chat", true, smartQuotes)` and passes the result to react-markdown.
- Trap: there are several markdown renderers. `ChatMarkdown` (claude.ai chat view, custom parser)
  isn't the Code tab's. Make sure you're using the one the Code tab transcript uses.
- Update the marker or pattern in `check.mjs`, then run `npm test`. If an expected summary changes,
  the app's math rules may really have changed. Ask the user to send the test text in the app and
  look before you change any expectation.

If it can't be patched, rewrite it. Keep the same contract so callers don't change:
- `node check.mjs [--flag on|off] [file]`, stdin when no file.
- Output lines: `FAIL  shown as text: <source>` and `FAIL  KaTeX error in <tex>: <message>`.
- Last line: `N failed, M rendered`, `ok: M rendered` or `ok: no math`.
- Exit codes 0 / 1 / 2.
- It must run the app's own renderer. A reimplementation of its rules drifts from the app silently.

## History (condensed)

- Problem: the app's renderer guesses which `$...$` is math, so valid TeX sometimes shows as text.
  The user wanted every reply with math checked against "the app's own parser".
- An earlier tool imported the chat parser plus its math guards and checked line by line. It missed
  mid-sentence `$$`, KaTeX syntax errors and `$...$` split across lines, and it used the claude.ai
  chat parser, not the Code tab's. It was replaced by this full render in jsdom.
- The inline-math flag's real value can't be read without the user's account data. Don't try.
  "on" matched what the user saw (only `$1/r$` failed in a reply with 15 formulas).
- A rejected `\(x\)` renders as plain `(x)`, leaving no `$` or backslash to find. The checker counts
  `(body)` occurrences against the source instead.
- Only the Linux install has been tested. The macOS and Windows paths are educated guesses;
  `CLAUDE_DESKTOP_RESOURCES` overrides them.
- Known costs: ~3 s per check (it scans the bundle for markers and renders the canary each run).
  A ~150 MB patched copy is cached per app version.
