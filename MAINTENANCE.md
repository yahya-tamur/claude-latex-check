# Maintaining the plugin

## Where things are

| File | What it is |
|---|---|
| `skills/latex-check/` | The Claude Code skill. Its `scripts/` holds the checker (`check.mjs`, plus `env.mjs` for the browser globals, `bundle.mjs` for reading the app's code in place and `loader.mjs` for serving it to `import()`) and `lint.mjs`, the check against the rules and KaTeX, used when the checker can't run |
| `skills/latex-check-chat/` | The claude.ai and Cowork skill. Its `scripts/` holds `lint.mjs`, the bundled KaTeX 0.16.47 (`katex.min.cjs`, the version the app ships) and `math-spans.mjs`, which both skills' `lint.mjs` use to find formulas and hold the rules they check. It lives here because on claude.ai only a skill's own folder is copied into the sandbox |
| `hooks/` | The plugin's hooks (`hooks.json`), for the Code tab only: they act only in sessions that loaded the Code tab skill, and exit at once anywhere else. After each reply, `check-reply.mjs` copies a reply with math into the conversation document with fixed formulas. When the skill loads, `skill-loaded.mjs` starts the checker's background browser and tells the session the document's path |
| `tests/`, `test.mjs` | One test per kind of failure; `short-rules.md` and `doc-rules.md`, a reply and a document written by the rules, which must render fully; `fix/broken.md`, known failures that must render after `--fix`; and `viewer-sample.md`, to open in other markdown viewers (not run by the tests) |
| `.claude-plugin/` | Plugin and marketplace manifests |
| `package.mjs`, `.github/workflows/release.yml` | Build the plugin zip (`npm run package`); the workflow publishes it as a GitHub release for each new version |
| `icon.svg`, `icon.png` | The icon: the source, and the PNG the manifest points to (only Anthropic's plugin directory reads it) |

## Running the checker and tests

The checker needs Node 18.19+ (for module loader hooks) and the desktop app on the same machine.
In a clone:

```bash
npm install
node skills/latex-check/scripts/check.mjs tests/short-rules.md
```

The second command should print `ok: 18 rendered`. Pass several files to check them in one run,
each headed by a `== <file>` line, or pipe text in on stdin. Only problems are printed:

```
FAIL  shown as text: $1/r$
1 failed, 14 rendered
```

- Exit codes: 0 = all math renders, 1 = something failed, 2 = the checker couldn't run.
- `--surface chat` renders through the claude.ai and Cowork chat view instead of the Code tab.
- `--append <file.md>` adds the text to that markdown document once it passes, instead of
  printing it; until then it's kept in a `.<name>.draft.md` next to the document. In the Code
  tab, the Stop hook uses it to copy every reply with math, after the user's message, into
  `math-notes/<session>.md` in the working directory, so the session writes each answer once, in
  chat, and the user reads it rendered in the file pane. When the checker can't run, the hook uses
  the Code tab lint's `--append` instead, which does the same rewrites without the renderer.
- The first run leaves a copy of the checker running in the background (`--serve`) with the app's
  code loaded, so later runs take about 0.4 s instead of 2–4 s. It listens on a socket in the
  cache folder (a named pipe on Windows) named after the app version and the checker's code, and
  exits after 5 minutes without checks, and a new copy tells copies of other versions to exit.
  `LATEX_CHECK_NO_CACHE=1` skips it.
- `--fix` first rewrites inline formulas into forms the Code tab renders, where a known rewrite
  exists, saves each file in place and prints its new text. The rewrites are `fixText` in
  `skills/latex-check-chat/scripts/math-spans.mjs`, and both lints take `--fix` too. Most of the
  work is done by putting `\textstyle `, a no-op in inline math, in front: the app's test for
  “looks like math” (`on(e)` near `inHouseLatexPlugin` in the bundle) passes anything with a
  backslash that has no four-letter word outside braces and no trailing operator.
- `--flag off` simulates the app's inline-math feature flag being off, so only `$$` blocks render.
  The default is `on`.
- `--data <folder>`, `--show-fixes` and `--add-fix "<text>"`: see [Per-machine files](#per-machine-files).
- The lints take one file, or stdin: `node skills/latex-check/scripts/lint.mjs reply.md`, and
  `skills/latex-check-chat/scripts/lint.mjs` for the chat skill. `--doc` adds the rules for
  markdown documents, which other viewers may open; the chat skill's lint then also applies the
  Code tab's rules.

`npm test` runs the files in `tests/` through the checker and the chat skill's lint, compares
each result with what's expected, and checks that the Code tab's lint flags everything the checker
does. It also checks `--fix`, `--append` and the Stop hook. Run it after changing either skill,
its scripts, the hooks or the tests, and after app updates: when an update breaks the checker, the
hook falls back to the lint, so users barely notice, and the tests are how you find out.

## Changing the rules

New rules come from:
- **Code tab:** the fixes each machine's sessions saved in `fixes.local.md` (see
  [Per-machine files](#per-machine-files)). These are the best source.
- **claude.ai and Cowork:** the chat skill saves no fixes and nothing checks its replies, so
  reports, and comparing renderers:
  running a sample through `check.mjs` with and without `--surface chat` shows where the Code tab
  and the chat view differ.

When the rules change, update everything that encodes them:
- **The lints:** `skills/latex-check-chat/scripts/math-spans.mjs` holds the rules both lints check:
  `commonRules` (both skills), `strictRules` (the Code tab, and documents in the chat skill) and
  `docRules` (documents).
- **Code tab:** the "Rules", "If a span is flagged" and "Other documents" sections of
  `skills/latex-check/SKILL.md`. Extend `tests/short-rules.md` if the rule changes how math should
  be written.
- **claude.ai and Cowork:** the "Rules" and "Documents" sections of
  `skills/latex-check-chat/SKILL.md`.
- **Rewrites:** if a failure has a rewrite that draws the same thing, add it to `fixText` and to
  `tests/fix/broken.md` instead of adding a rule for sessions to follow.
- **Tests:** add a `tests/*.md` case with its expected results in `test.mjs`, and extend
  `tests/doc-rules.md` if the rule changes how documents should be written. `tests/viewer-sample.md`
  shows the document rules next to the hazards they avoid, to open in other markdown viewers.

## Releasing

1. If `check.mjs`'s or the lints' options changed, update the commands written out in both
   `SKILL.md` files and in `hooks/check-reply.mjs`.
2. Run `npm test` and `claude plugin validate .`.
3. Raise `version` in `.claude-plugin/plugin.json`. Installs only update when it changes.
4. Commit and push. `.github/workflows/release.yml` then builds the zip (`npm run package`, which
   writes `dist/latex-check-<version>.zip` from the committed state) and publishes it as GitHub
   release `v<version>`, once per version. The zip can be loaded into the Claude app as a plugin
   file, which helps when the marketplace is slow to pick up a new version.

## Per-machine files

- **Data folder:** `${CLAUDE_PLUGIN_DATA}`, a folder under `~/.claude/plugins/data/` that survives
  plugin updates. The hook and the skill pass it to the checker as `--data`. It holds `fixes.local.md`, which
  `--show-fixes` prints and `--add-fix "<text>"` appends to, and jsdom, installed there on first use
  unless the repository's own `node_modules` has it. Test runs with `claude --plugin-dir` can share
  the installed plugin's data folder, so don't delete it after testing.
- **Cache folder:** a small index, per app version, of which bundle files hold what, and the
  background browser's socket. It's in
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
Stop hook uses the lint instead.

## What the checker relies on

The app's code is in `<resources>/ion-dist/assets/v1/`, or in `ion-dist.asar` in newer builds,
which `bundle.mjs` reads in place. `loader.mjs` serves those files to `import()` with the patches
below applied in memory. File names and minified identifiers change every build, so everything is
found by content, and these are the heuristics to start from when something can't be found:

| What | Found by | Used for |
|---|---|---|
| Code-tab markdown hook file | contains `guardedInline:` | decides if math is on, returns `{remarkPlugins, rehypePlugins}` |
| inline-math flag | the call `x=<fn>()` in the hook whose result reaches the function returning `{display, guardedInline}` (older builds: `x=<fn>(),{display:`); `<fn>` itself may be imported from another chunk | that call replaced by `globalThis.__latexCheckInlineMath!==!1`, which `--flag` sets |
| chunk preloader | `<name>=function(a,b,c){let d=globalThis.__antChunkLoadCtx`, any names (newer builds: `=function e(t,n,r){…`) | export replaced with `f=>f()` (jsdom never fires `<link>` load events, so it hangs) |
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
- Whenever the app's code is loaded (a check without the background browser, or the background
  browser starting), a canary renders first (`$a^2$` inline plus a `$$b^2$$` paragraph), and the
  checker exits 2 unless exactly the expected math renders; the chat view gets its own canary the
  first time it's used.
