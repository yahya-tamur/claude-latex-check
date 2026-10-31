# Maintaining the plugin

## Where new rules come from

- **Code tab:** each machine records the fixes its sessions found in `fixes.local.md`, in the
  plugin's data folder: `~/.claude/plugins/data/latex-check-inline/` for an install from the
  desktop app's **Customize > Plugins**, `~/.claude/plugins/data/latex-check-latex-check/` for one
  from the `claude plugin` commands. `node skills/latex-check/scripts/check.mjs --data <folder>
  --show-fixes` prints them. These are the best source of new rules.
- **claude.ai and Cowork:** the chat skill records no local fixes. New rules come from reports, and
  from comparing renderers: `check.mjs --surface chat` renders through the chat view that claude.ai
  and Cowork share, so running a sample through both surfaces shows where they differ.

The desktop app loads an account install the same way `claude --plugin-dir` does, so test runs with
`--plugin-dir` read and write the same `latex-check-inline` folder. Don't delete it after testing.

## When the rules change

Update everything that encodes them, in the skill you're changing:

- **Code tab:** the "Rules" and "If a span is flagged" sections of `skills/latex-check/SKILL.md`,
  and `skills/latex-check/scripts/lint.mjs`. Add a `tests/*.md` case with its expected result in
  `test.mjs`, and extend `tests/short-rules.md` if the rule changes how math should be written.
- **claude.ai and Cowork:** `skills/latex-check-chat/SKILL.md` and
  `skills/latex-check-chat/scripts/lint.mjs`, with the expected results in `test.mjs`.
- Code both lints share, finding formulas and running KaTeX, is in
  `skills/latex-check-chat/scripts/math-spans.mjs`.

If `check.mjs`'s options change, update the commands written out in `skills/latex-check/SKILL.md`.
Then run `npm test` and `claude plugin validate .`.

## What the checker relies on

The checker runs the installed app's own code, so an app update can break it. Since it falls back
to the lint when that happens, users barely notice; run `npm test` after app updates to find out.

The app's code is in `<resources>/ion-dist/assets/v1/`, or in `ion-dist.asar` in newer builds,
which the checker unpacks into its cache. File names and minified identifiers change every build, so
everything is found by content, and these are the heuristics to start from when something can't be
found:

| What | Found by | Used for |
|---|---|---|
| Code-tab markdown hook file | contains `guardedInline:` | decides if math is on, returns `{remarkPlugins, rehypePlugins}` |
| inline-math flag function | the no-argument function whose result reaches the function returning `{display, guardedInline}` (older builds: `x=<fn>(),{display:`) | patched to return true/false |
| chunk preloader | `=function(e,t,n){let r=globalThis.__antChunkLoadCtx` | export replaced with `f=>f()` (jsdom never fires `<link>` load events, so it hangs) |
| feature-flag service | `throw …Error("Missing or invalid GrowthBookProvider")` | patched to answer "unknown flag" |
| React | contains `e.createRoot=function`; `createRoot` has `(299)`; `jsx` is found by test-calling | rendering |
| react-markdown | `.runSync(<x>.parse(` | rendering |
| chat view component (`--surface chat`) | the memo-wrapped component whose code contains `inHouseLatexPlugin:` and `normalizationMode:` | rendering as claude.ai and Cowork do |

There are several markdown renderers in the app, so make sure a match is the one the surface
actually uses: the Code tab transcript calls the hook as `hook(text, "chat", true, …)`, and the
chat view also contains a dormant renderer, `ChatMarkdown`, that neither uses.

A unique match can still be the wrong thing, so a match alone isn't trusted:
- React's `createRoot` and `jsx` are checked by calling them.
- The hook, react-markdown and the chat component must each match exactly once.
- Once per app version, a wiring check confirms some app component still calls the hook as
  `hook(text, "chat", true, …)`.
- Every run first renders a canary (`$a^2$` inline plus a `$$b^2$$` paragraph) and exits 2 unless
  exactly the expected math renders.
