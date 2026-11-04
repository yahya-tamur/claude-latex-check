# Maintaining the plugin

## Where things are

| File | What it is |
|---|---|
| `skills/latex-check/` | The Claude Code skill. Its `scripts/` holds the checker (`check.mjs`, plus `env.mjs` for the browser globals, `bundle.mjs` for reading the app's code in place and `hooks.mjs` for serving it to `import()`) and `lint.mjs`, the fallback check against the rules and KaTeX |
| `skills/latex-check-chat/` | The claude.ai and Cowork skill. Its `scripts/` holds `lint.mjs`, the bundled KaTeX 0.16.47 (`katex.min.cjs`, the version the app ships) and `math-spans.mjs`, which both skills' `lint.mjs` use to find and check formulas. It lives here because on claude.ai only a skill's own folder is copied into the sandbox |
| `tests/`, `test.mjs` | One test per kind of failure, plus `tests/short-rules.md`, a sample written by the rules that must render fully |
| `.claude-plugin/` | Plugin and marketplace manifests |
| `icon.svg`, `icon.png` | The icon: the source, and the PNG the manifest points to (only Anthropic's plugin directory reads it) |

## Running the checker and tests

The checker needs Node 18.19+ (for module loader hooks) and the desktop app on the same machine.
In a clone:

```bash
npm install
node skills/latex-check/scripts/check.mjs tests/short-rules.md
```

The second command should print `ok: 17 rendered`. Pass several files to check them in one run,
each headed by a `== <file>` line, or pipe text in on stdin. Only problems are printed:

```
FAIL  shown as text: $1/r$
1 failed, 14 rendered
```

- Exit codes: 0 = all math renders, 1 = something failed, 2 = the checker couldn't run.
- `--surface chat` renders through the claude.ai and Cowork chat view instead of the Code tab.
- `--flag off` simulates the app's inline-math feature flag being off, so only `$$` blocks render.
  The default is `on`.
- `--data <folder>`, `--show-fixes` and `--add-fix "<text>"`: see [Per-machine files](#per-machine-files).
- The lints take one file, or stdin: `node skills/latex-check/scripts/lint.mjs reply.md`, and
  `skills/latex-check-chat/scripts/lint.mjs` for the chat skill.

`npm test` runs the 25 files in `tests/` through the checker and the chat skill's lint, compares
each result with what's expected, and checks that the Code tab's lint flags everything the checker
does. Run it after changing either skill, its scripts or the tests, and after app updates: the
checker falls back to the lint when an update breaks it, so users barely notice, and the tests are
how you find out.

## Changing the rules

New rules come from:
- **Code tab:** the fixes each machine's sessions saved in `fixes.local.md` (see
  [Per-machine files](#per-machine-files)). These are the best source.
- **claude.ai and Cowork:** the chat skill saves no fixes, so reports, and comparing renderers:
  running a sample through `check.mjs` with and without `--surface chat` shows where the Code tab
  and the chat view differ.

When the rules change, update everything that encodes them, in the skill you're changing:
- **Code tab:** the "Rules" and "If a span is flagged" sections of `skills/latex-check/SKILL.md`,
  and `skills/latex-check/scripts/lint.mjs`. Add a `tests/*.md` case with its expected result in
  `test.mjs`, and extend `tests/short-rules.md` if the rule changes how math should be written.
- **claude.ai and Cowork:** `skills/latex-check-chat/SKILL.md` and
  `skills/latex-check-chat/scripts/lint.mjs`, with the expected results in `test.mjs`.
- Code both lints share, finding formulas and running KaTeX, is in
  `skills/latex-check-chat/scripts/math-spans.mjs`.

## Releasing

1. If `check.mjs`'s options changed, update the commands written out in
   `skills/latex-check/SKILL.md`.
2. Run `npm test` and `claude plugin validate .`.
3. Raise `version` in `.claude-plugin/plugin.json`. Installs only update when it changes.

## Per-machine files

- **Data folder:** `${CLAUDE_PLUGIN_DATA}`, a folder under `~/.claude/plugins/data/` that survives
  plugin updates. The skill passes it to the checker as `--data`. It holds `fixes.local.md`, which
  `--show-fixes` prints and `--add-fix "<text>"` appends to, and jsdom, installed there on first use
  unless the repository's own `node_modules` has it. Test runs with `claude --plugin-dir` can share
  the installed plugin's data folder, so don't delete it after testing.
- **Cache folder:** a small index, per app version, of which bundle files hold what. It's in
  `~/.cache/claude-latex-check` (Linux, or `$XDG_CACHE_HOME`), `~/Library/Caches/claude-latex-check`
  (macOS) or `%LOCALAPPDATA%\claude-latex-check` (Windows); `LATEX_CHECK_CACHE` overrides it.

## Finding the app

The checker looks in this order:

1. The running desktop app: the folder next to its executable, from `/proc` on Linux, `ps` on
   macOS and PowerShell on Windows. That's always the current version, and it works for Microsoft
   Store installs, whose folder under `C:\Program Files\WindowsApps` can't be listed but can be
   read.
2. A few common install locations, for when the running app can't be seen (for example in a
   sandbox): `/usr/lib/claude-desktop/resources` and similar on Linux, `/Applications/Claude.app`
   on macOS, `%LOCALAPPDATA%\AnthropicClaude` on Windows.

`CLAUDE_DESKTOP_RESOURCES` overrides both. If the app isn't found, the checker exits 2 and the
skill uses the lint.

## What the checker relies on

The app's code is in `<resources>/ion-dist/assets/v1/`, or in `ion-dist.asar` in newer builds,
which `bundle.mjs` reads in place. `hooks.mjs` serves those files to `import()` with the patches
below applied in memory. File names and minified identifiers change every build, so everything is
found by content, and these are the heuristics to start from when something can't be found:

| What | Found by | Used for |
|---|---|---|
| Code-tab markdown hook file | contains `guardedInline:` | decides if math is on, returns `{remarkPlugins, rehypePlugins}` |
| inline-math flag function | the no-argument function whose result reaches the function returning `{display, guardedInline}` (older builds: `x=<fn>(),{display:`) | patched to read `globalThis.__latexCheckInlineMath`, which `--flag` sets |
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
