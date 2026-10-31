# claude-latex-check

A Claude Code plugin that makes LaTeX math render in the Claude desktop app's Code tab.

The app guesses which spans are math, so valid TeX can still show as plain text, for example
`$1/r$`, `$a \cdot b -$` or any inline span over 60 characters. The plugin has one skill,
`latex-check`, which Claude loads whenever a reply will contain math. It has three parts:

- **Short rules** for writing math that renders, in the skill itself, so Claude follows them from
  the first draft.
- **A checker**, `check.mjs`, that runs the installed app's own renderer (its markdown code,
  react-markdown and KaTeX) in a simulated browser (jsdom). Claude runs it on each reply with
  math before sending, and it reports every formula that would show as plain text or as a KaTeX
  error.
- **Fixes:** when a check fails, Claude looks up the fix in [FIXES.md](FIXES.md) and rewrites
  only the flagged formulas. It records each new fix in a `fixes.local.md` file on that machine,
  and uses the working form from then on. You move those into FIXES.md over time (see
  [Curating fixes](#curating-fixes)).

Claude talks about this only in plain terms, like "I rewrote a formula so it renders", without
mentioning files or tools.

## Installing

Needs Claude Code, Node 18+ and the Claude desktop app on the same machine. In a terminal:

```bash
claude plugin marketplace add yahya-tamur/claude-latex-check
```

```bash
claude plugin install latex-check@latex-check
```

Or inside a Claude Code session, `/plugin marketplace add yahya-tamur/claude-latex-check` and then
`/plugin install latex-check@latex-check`.

The plugin is installed for your user, so it applies to every session in every folder. The skill's
short description is always in context, and the rest loads only in sessions that involve math. The
first check on a machine installs jsdom into the plugin's data folder and builds a cache, so it
takes a bit longer than the usual 3 s.

To update later:

```bash
claude plugin marketplace update latex-check
```

```bash
claude plugin update latex-check@latex-check
```

## Where things are

| File | What it is |
|---|---|
| [`skills/latex-check/SKILL.md`](skills/latex-check/SKILL.md) | The skill: short rules and how Claude checks and fixes replies |
| [`FIXES.md`](FIXES.md) | Lookup of what each kind of failing span needs |
| [`check.mjs`](check.mjs), `env.mjs` | The checker |
| [`MAINTENANCE.md`](MAINTENANCE.md) | How to repair the checker after an app update |
| `tests/`, `test.mjs` | One test per rule in FIXES.md, plus `tests/short-rules.md`, a sample written by the short rules that must render fully |
| `.claude-plugin/` | Plugin and marketplace manifests |

Per-machine files live in the plugin's data folder (`~/.claude/plugins/data/<id>/`), which
survives plugin updates: `fixes.local.md`, `app-path.local` and jsdom.

## Running it yourself

In a clone of this repository:

```bash
npm install
node check.mjs tests/short-rules.md
```

The second command takes about 3 s and should print `ok: 17 rendered`. That confirms that the
checker works with your app version and that the short rules still produce math that renders.

To check a draft, run `node check.mjs reply.md`, or pipe the text in on stdin. Only problems are
printed:

```
FAIL  shown as text: $1/r$
1 failed, 14 rendered
```

Exit codes: 0 = all math renders, 1 = something failed, 2 = the checker couldn't run. A check takes
about 3 s, or 0.2 s for text with no math. `--flag off` simulates the app's inline-math feature
flag being off; then only `$$` blocks render. The default is `on`.

`npm test` runs all 25 cases in `tests/` (~75 s) and compares each result with what's expected.
Run it after changing FIXES.md, the short rules, the tests or `check.mjs`, or after an app update.

## Curating fixes

Claude never edits the plugin's files, so the rules and tests change only when you curate them.
Every so often:

1. Move entries from each machine's `fixes.local.md` (in the plugin's data folder) into FIXES.md.
2. Check the examples with `node check.mjs`.
3. Add a `tests/*.md` case, with its expected summary in `test.mjs`.
4. If a new rule isn't already implied by the short rules in SKILL.md, update them, keeping them
   short. Extend `tests/short-rules.md` to use the new rule correctly.
5. Run `npm test` and `claude plugin validate .`, then commit and push.
6. On each machine, update the plugin (see [Installing](#installing)).

## Platforms

Install locations of the desktop app vary by platform, store and version, so the checker doesn't
rely on a fixed list. It looks in this order:

1. `app-path.local` in the plugin's data folder, if it exists. When the app isn't found, Claude
   finds the folder containing `ion-dist` or `ion-dist.asar` and saves its path here, with `*` in
   place of the version number, e.g. `C:\Program Files\Claude_*\app\resources`. When several
   folders match, the most recently modified one is used, so the saved path survives updates.
2. A few common locations: the Linux package (`/usr/lib/claude-desktop/resources`, tested),
   `/Applications/Claude.app` on macOS, and `%LOCALAPPDATA%\AnthropicClaude` on Windows.

`CLAUDE_DESKTOP_RESOURCES` overrides both.

The first run for each app version copies and patches the app's code into a cache, and removes
copies for older versions. Newer app builds pack it into `ion-dist.asar`, which is unpacked once
first. Expect a few hundred MB. Cache locations: `~/.cache/claude-latex-check` (Linux, or
`$XDG_CACHE_HOME`), `~/Library/Caches/claude-latex-check` (macOS),
`%LOCALAPPDATA%\claude-latex-check` (Windows). Override with `LATEX_CHECK_CACHE`.

## How it works

The app's file names and minified function names change with every build, so `check.mjs` finds
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
