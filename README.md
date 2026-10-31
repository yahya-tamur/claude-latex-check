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

1. Clones the repo to a stable place (e.g. `~/tools/claude-latex-check`), runs `npm install`, and
   confirms the checker works with a 3-second test. If the app isn't in a usual place, it finds
   the app and saves the location.
2. Offers to install it **globally, not just for that session**. It adds the short rules from
   FIXES.md and an instruction to run the check in every session to your global
   `~/.claude/CLAUDE.md`. That file is loaded into every turn of every Claude Code session on the
   machine, in every folder. So after this one-time setup, every session writes math by the short
   rules from the first draft and checks replies before sending. You don't have to mention the
   repo again.

From then on, sessions:
- write math by the short rules;
- check each reply that contains math;
- on a failure, read the lookup list once, edit only the flagged formulas, and re-check;
- record each new fix in `fixes.local.md`.

They talk about this only in plain terms, like "I rewrote a formula so it renders", without
mentioning files or tools.

## Running it yourself

Needs Node 18+ and the Claude desktop app installed on the same machine.

```bash
npm install
node check.mjs tests/short-rules.md
```

The second command takes about 3 s and should print `ok: 17 rendered`. That file is a sample
written strictly by the short rules, so this confirms that the checker works with your app version
and that the short rules still produce math that renders.

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

`npm test` runs all 25 cases in `tests/` (~75 s), one for every rule in FIXES.md plus the
short-rules sample, and compares each result with what's expected. Run it after changing
FIXES.md, the tests or `check.mjs`, or after an app update. If anything differs after an update,
the app's math handling or its internals changed.

## Curating fixes

Claude never edits FIXES.md or `tests/`, so they change only when you curate them. Every so
often:

1. Move entries from each machine's `fixes.local.md` into FIXES.md, under "Looking up a fix".
2. Check the examples with `node check.mjs`.
3. Add a `tests/*.md` case, with its expected summary in `test.mjs`.
4. If a new rule isn't already implied by the short rules, update the short rules block, keeping
   it short. Extend `tests/short-rules.md` to use the new rule correctly.
5. Run `npm test`, then commit and push.
6. On each machine, run `git pull` in its clone. If the short rules changed, the next session
   there offers to update the copy in the global CLAUDE.md.

## Platforms

Install locations vary by platform, store and version, so the checker doesn't rely on a fixed
list. It looks in this order:

1. `app-path.local` in the clone (git-ignored), if it exists. When the app isn't found, Claude
   finds the folder containing `ion-dist` or `ion-dist.asar` and saves its path here, with `*` in
   place of the version number, e.g. `C:\Program Files\Claude_*\app\resources`. When several
   folders match, the most recently modified one is used, so the saved path survives updates.
2. A few common locations: the Linux package (`/usr/lib/claude-desktop/resources`, tested),
   `/Applications/Claude.app` on macOS, and `%LOCALAPPDATA%\AnthropicClaude` on Windows.

`CLAUDE_DESKTOP_RESOURCES` overrides both.

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
