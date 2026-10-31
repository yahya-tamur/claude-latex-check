# For Claude: writing math that renders in the Claude desktop app

## Using it

Read only this part unless the checker exits 2 or the user reports a rendering problem.

1. Clone once to a stable place and reuse it in later sessions (e.g. `~/tools/claude-latex-check`),
   then `npm install` there. Node 18+ and the Claude desktop app must be on the same machine.
   Optionally run `npm test` once (~75 s, prints one line).
2. Install the short rules once per machine. They're the block between the `short-rules` markers
   at the top of `<repo>/FIXES.md`. If the user's global `~/.claude/CLAUDE.md` doesn't contain
   that block, or holds an older copy, offer to add or update it there, with the markers. That file
   is loaded into every turn of every session, so the rules can't fade from context the way a file
   you read once can. Until it's installed, read the block yourself at the start of the session.
3. Write math by the short rules from the start. Also read `<repo>/fixes.local.md`, if it exists,
   once per session. Don't read the rest of FIXES.md up front.
4. For every reply containing LaTeX: write the reply's markdown, exactly as it will be sent, to a
   temp file and run `node <repo>/check.mjs <file>`.
5. On `FAIL` lines, fix only the flagged spans. Edit each span in the temp file in place, and don't
   regenerate the reply. If the fix isn't obvious, look up that span's rule under "Looking up a fix"
   in FIXES.md. Re-run the checker on the edited file, then send that text.
6. Exit 0 = all math renders, 1 = something failed, 2 = the checker couldn't run. On 2, send the
   reply anyway, tell the user the math wasn't checked, and see "When it breaks" below.

Talking to the user: keep all of this behind the scenes. Plain wording like "I rewrote a formula
so it renders" or "I couldn't check the math rendering this time" is fine. Don't name FIXES.md,
`fixes.local.md`, `check.mjs`, exit codes or the rules unless the user asks how it works. When
offering step 2, say something like "Can I add a few math-formatting rules to your global Claude
instructions (`~/.claude/CLAUDE.md`)?"

Learn from every failure. Each fail-and-retry round costs a re-run and a rewrite, so don't hit the
same failure twice:
- When a `FAIL` gets fixed, append it right away to `<repo>/fixes.local.md` (create it if missing;
  git ignores it): the form that failed, the form that rendered, and the rule if there is one. For
  example: `$1/r$` failed, `$\frac{1}{r}$` renders; digit-led spans need a TeX symbol. Use this
  file, not Claude's own memory, which is per project folder and so isn't shared between sessions.
- Generalize when you can. Save "digit-led spans need a TeX symbol", not just the one formula.
- Anonymize entries. The file may be shared or published, so it must not reveal what the
  conversation was about. Replace the subject's symbols and wording with neutral ones (`x`, `f`,
  `a`, `b`, "property P") while keeping whatever the rule depends on: length, first and last
  character, operators, and what touches the dollars. Run both anonymized forms through `check.mjs`
  to confirm the failing one still fails and the fixed one still renders.
- Don't add fixes to `FIXES.md`, this CLAUDE.md or `tests/`, and don't offer to. The user curates
  those.

Keeping token use low:
- The short rules cost nothing extra once they're in the global CLAUDE.md. Read the rest of
  FIXES.md only to look up a specific failure, and `fixes.local.md` once per session.
- A retry should be a few small edits to the flagged spans, not a rewritten reply.
- Run the checker once per finished draft, not per formula. Output is already minimal: only
  failures plus a summary line. A reply without math costs 0.2 s and prints `ok: no math`.
- Don't read `check.mjs`, the tests or the app bundle during normal use.
- Plain dollar amounts like "$5 and $10" are reported as failures; that's a known false positive.
  Ignore it.
- Save "check LaTeX with <repo>/check.mjs" to memory so later sessions skip setup.

## When it breaks

Two signs:
- **Exit 2.** The error message names the step that failed.
- **The user reports that math didn't render as intended**, even though the checker passed it, or
  that it flagged math that does render. Treat this as a bug in the checker, not the user's eyes.
  Reproduce it with the exact text in a temp file, work out why the checker disagrees, and tell
  the user. Don't add it to `tests/`; the user curates those.

The checker runs the installed app's own code, so app updates can break it. The app's file names and
minified identifiers change every build, so everything is found by content. What it relies on:

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
- Bundle: `<resources>/ion-dist/assets/v1/` (Linux `/usr/lib/claude-desktop/resources`). Newer builds ship
  `ion-dist.asar` instead; `check.mjs` unpacks it to `<cache>/asar-<hash>/ion-dist/`, so grep there. It has ~3,800
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
  The once-per-version copy (~150 MB) and wiring check add no noticeable time.
