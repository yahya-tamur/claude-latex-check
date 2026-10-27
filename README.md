# claude-latex-check

> **Claude:** read [CLAUDE.md](CLAUDE.md) instead of this file. It covers usage, writing math that
> passes, keeping token use low, and fixing the checker after app updates.

Checks that LaTeX in a markdown reply renders as math in the Claude desktop app's Code tab. It runs
the installed app's own renderer (its markdown code, react-markdown and KaTeX) in a simulated
browser (jsdom), then reports every formula that would show as plain text or as a KaTeX error.

The app decides heuristically whether a span is math, so valid TeX can still show as plain text
(`$1/r$`, `$2x$`, `$$x$$` mid-sentence, `\(x\)`). Running the app's own code catches exactly those
cases.

## Setup

Needs Node 18+ and the Claude desktop app installed on the same machine.

```bash
npm install
npm test
```

`npm test` runs `tests/*.md` and compares each result with what's expected. If anything differs
after an app update, the app's math handling or its internals changed.

## Usage

```bash
node check.mjs reply.md
```

Text can also be piped on stdin. Only problems are printed:

```
FAIL  shown as text: $1/r$
1 failed, 14 rendered
```

Exit codes: 0 = all math renders, 1 = something failed, 2 = the checker couldn't run.

[FIXES.md](FIXES.md) lists what renders and what doesn't, with examples.

`--flag off` simulates the app's inline-math feature flag being off; then only `$$` blocks render.
The default is `on`.

## Platforms

The app's bundle is looked up in these places:

| Platform | Location |
|---|---|
| Linux | `/usr/lib/claude-desktop/resources`, `/opt/Claude/resources`, `/opt/claude-desktop/resources`, `/usr/lib/claude/resources` |
| macOS | `/Applications/Claude.app/Contents/Resources`, `~/Applications/Claude.app/Contents/Resources` |
| Windows | `%LOCALAPPDATA%\AnthropicClaude\app-<version>\resources` (newest version) |

Only the first Linux location has been tested. Elsewhere, set `CLAUDE_DESKTOP_RESOURCES` to the folder
that contains `ion-dist`.

The first run for each app version copies and patches the bundle, about 150 MB, into a cache, and
removes copies for older versions. Cache locations: `~/.cache/claude-latex-check` (Linux, or
`$XDG_CACHE_HOME`), `~/Library/Caches/claude-latex-check` (macOS),
`%LOCALAPPDATA%\claude-latex-check` (Windows). Override with `LATEX_CHECK_CACHE`.

## How it works

The bundle's file names and minified function names change with every build, so `check.mjs` finds
files by content markers and functions by what their code does. It patches three things in the
copy:

- pins the inline-math feature flag
- makes the missing feature-flag service answer "unknown flag" instead of throwing
- replaces the browser-only chunk preloader with a plain `import`

Then it renders the reply the way the Code tab's transcript does and inspects the result.

So that a wrong match can't produce wrong results:
- React's functions are verified by calling them.
- The hook and react-markdown must each match exactly once.
- A wiring check confirms the app still calls the hook in transcript mode.
- Every run starts with a canary render of known math.

Any of these failing exits 2.
