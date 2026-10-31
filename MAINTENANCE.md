# Maintaining the checker

For anyone repairing the checker: the maintainer, Claude sessions working in this repository, or a
user fixing it on their own machine. By default the skill suggests a plugin update or a GitHub
issue when the checker breaks, and points here only if the user wants to fix it themselves.

Work in a clone of the repository rather than an installed plugin folder, which is replaced on
every update: `git clone https://github.com/yahya-tamur/claude-latex-check`, then `npm install` and
`npm test`.

## Signs that it's broken

- **Exit 2** after an app update, on your machine or in a reported issue. The error message names
  the step that failed.
- **A formula reported as wrongly passed or flagged**, in an issue or by you. Treat it as a bug in
  the checker. Reproduce it with the exact text in a temp file, work out why the checker disagrees,
  and add a test once you've confirmed in the app how it really renders.

## What it relies on

The checker runs the installed app's own code, so app updates can break it. The app's file names and
minified identifiers change every build, so everything is found by content:

| What | Found by | Used for |
|---|---|---|
| Code-tab markdown hook file | contains `guardedInline:` | decides if math is on, returns `{remarkPlugins, rehypePlugins}` |
| inline-math flag function | the no-argument function whose result reaches the function returning `{display, guardedInline}` (older builds: `x=<fn>(),{display:`) | patched to return true/false |
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
keeping this pipeline but drawing the Code tab with a different one. Only comparing with what the
user sees in the real app catches that.

## Fixing it cheaply

- Bundle: `<resources>/ion-dist/assets/v1/` (Linux `/usr/lib/claude-desktop/resources`). Newer
  builds ship `ion-dist.asar` instead; `check.mjs` unpacks it to `<cache>/asar-<hash>/ion-dist/`,
  so grep there. It has thousands of minified `.js` files, with single lines up to ~500 KB. Never
  print whole files or lines: use `grep -l` to find files and `grep -oE '.{0,200}MARKER.{0,200}'`
  to see context. Pipe node errors through `cut -c1-300 | head`, because stack traces echo
  minified source lines.
- Re-find the moved piece by searching for stable strings: `singleDollarTextMath`, `inlineGuard:`,
  `rehypePlugins:`, `katex`, `remarkMath`. The Code tab's transcript component calls
  `hook(text, "chat", true, smartQuotes)` and passes the result to react-markdown.
- Trap: there are several markdown renderers. `ChatMarkdown` (claude.ai chat view, custom parser)
  isn't the Code tab's. Make sure you're using the one the Code tab transcript uses.
- Don't try to read the real value of the app's inline-math feature flag; it can't be read without
  the user's account data. The checker assumes "on", which matched what the user saw.
- Update the marker or pattern in `check.mjs`, then run `npm test`. If an expected summary changes,
  the app's math rules may really have changed. Ask the user to send the test text in the app and
  look before you change any expectation.

## If it can't be patched

Rewrite it. Keep the same contract so callers don't change:
- `node check.mjs [--flag on|off] [--data <folder>] [file]`, stdin when no file. `--data` is where
  per-machine state lives (`app-path.local`, `fixes.local.md`, and jsdom when it isn't next to the
  script).
- `--show-fixes`, `--add-fix "<text>"` and `--set-app-path "<path>"` read or write that state and
  exit, so the skill never edits files under `~/.claude`, which need approval.
- Output lines: `FAIL  shown as text: <source>` and `FAIL  KaTeX error in <tex>: <message>`.
- Last line: `N failed, M rendered`, `ok: M rendered` or `ok: no math`.
- Exit codes 0 / 1 / 2.
- It must run the app's own renderer. A reimplementation of its rules drifts from the app silently.
