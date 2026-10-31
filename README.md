# claude-latex-check

> **Claude:** read [CLAUDE.md](CLAUDE.md) instead of this file. It covers usage, where the render rules
> are, recording new fixes, keeping token use low, and fixing the checker after app updates.

Fixes for LaTeX that doesn't render in the Claude desktop app's Code tab, plus a script that checks
a reply before it's sent.

The app guesses which spans are math, so valid TeX can still show as plain text, for example
`$1/r$`, `$a \cdot b -$` or any inline span over 60 characters. The repo has three parts:

- **[FIXES.md](FIXES.md), the main part:** a few short rules for writing math that renders, then
  a lookup list of what fails and what to write instead, with examples.
- **`check.mjs`:** checks a draft by running the installed app's own renderer (its markdown code,
  react-markdown and KaTeX) in a simulated browser (jsdom). It reports every formula that would
  show as plain text or as a KaTeX error.
- **A learning loop:** when the check fails, Claude looks up the fix and rewrites only the flagged
  formulas. Once a form renders, it records both forms in `fixes.local.md` and uses the working one
  from then on. That file is git-ignored, one per clone, and shared by every session on the
  machine. You move entries from it into FIXES.md over time (see [Curating fixes](#curating-fixes)).

## Using it with Claude

Tell a Claude Code session on the machine, in any folder:

```
use github.com/yahya-tamur/claude-latex-check to check LaTeX before sending
```

Following [CLAUDE.md](CLAUDE.md), it:

1. Clones the repo to a stable place (e.g. `~/tools/claude-latex-check`) and runs `npm install`.
2. Offers to install it **globally, not just for that session**. It adds the short rules from
   FIXES.md and one line pointing to the checker to your global `~/.claude/CLAUDE.md`. That file is
   loaded into every turn of every Claude Code session on the machine, in every folder. So after
   this one-time setup, every session writes math by the short rules from the first draft and
   checks replies before sending. You don't have to mention the repo again.

From then on, sessions:
- write math by the short rules;
- check each reply that contains math;
- on a failure, read the lookup list once, edit only the flagged formulas, and re-check;
- record each new fix in `fixes.local.md`.

They talk about this only in plain terms, like "I rewrote a formula so it renders", without
mentioning files or tools. When you update the short rules in FIXES.md, the next session on each
machine offers to update its global copy.

## Running it yourself

Needs Node 18+ and the Claude desktop app installed on the same machine.

```bash
npm install
npm test
```

`npm test` runs `tests/*.md` (25 cases, ~75 s) and compares each result with what's expected.
There's a case for every rule in FIXES.md. One more case is written strictly by the short rules
and must render fully. If anything differs after an app update, the app's math handling or its
internals changed.

To check a draft:

```bash
node check.mjs reply.md
```

Text can also be piped on stdin. Only problems are printed:

```
FAIL  shown as text: $1/r$
1 failed, 14 rendered
```

Exit codes: 0 = all math renders, 1 = something failed, 2 = the checker couldn't run. A check takes
about 3 s, or 0.2 s for text with no math.

`--flag off` simulates the app's inline-math feature flag being off; then only `$$` blocks render.
The default is `on`.

## Curating fixes

Claude never edits FIXES.md or `tests/`, so they change only when you curate them. Every so
often, for each machine:

1. Move entries from that clone's `fixes.local.md` into FIXES.md, under "Looking up a fix".
2. Check the examples with `node check.mjs`.
3. Add a `tests/*.md` case, with its expected summary in `test.mjs`.
4. If a new rule isn't already implied by the short rules, update the short rules block, keeping
   it short. Extend `tests/25-short-rules.md` to use the new rule correctly.
5. Run `npm test`.

## Platforms

The app's bundle is looked up in these places:

| Platform | Location |
|---|---|
| Linux | `/usr/lib/claude-desktop/resources`, `/opt/Claude/resources`, `/opt/claude-desktop/resources`, `/usr/lib/claude/resources` |
| macOS | `/Applications/Claude.app/Contents/Resources`, `~/Applications/Claude.app/Contents/Resources` |
| Windows | `%LOCALAPPDATA%\AnthropicClaude\app-<version>\resources` (newest version) |

Only the first Linux location has been tested. Elsewhere, set `CLAUDE_DESKTOP_RESOURCES` to the
folder that contains `ion-dist` or `ion-dist.asar`.

The first run for each app version copies and patches the bundle into a cache, and removes copies
for older versions. Newer app builds pack the bundle into `ion-dist.asar`, which is unpacked once
first. Expect a few hundred MB. Cache locations: `~/.cache/claude-latex-check` (Linux, or
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
