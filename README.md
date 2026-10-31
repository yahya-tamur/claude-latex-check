# claude-latex-check

A Claude Code plugin that makes LaTeX math render in the Claude desktop app's Code tab. To install,
run these in a terminal (details under [Installing](#installing)):

```bash
claude plugin marketplace add yahya-tamur/claude-latex-check
```

```bash
claude plugin install latex-check@latex-check
```

The app guesses which spans are math, so valid TeX can still show as plain text, for example
`$1/r$`, `$a \cdot b -$` or any inline span over 60 characters. The plugin has one skill,
`latex-check`, which Claude loads whenever a reply will contain math. It has three parts:

- **Rules** for writing math that renders, and how to fix each kind of formula that doesn't, in the
  skill itself, so Claude follows them from the first draft.
- **A checker**, `check.mjs`, that runs the installed app's own renderer (its markdown code,
  react-markdown and KaTeX) in a simulated browser (jsdom). Claude runs it on each reply with
  math before sending, and it reports every formula that would show as plain text or as a KaTeX
  error.
- **Fixes:** when a check fails, Claude rewrites only the flagged formulas, and records each new fix
  in a `fixes.local.md` file on that machine, so it doesn't repeat the mistake.

## Installing

Needs Claude Code, Node 18+ and the Claude desktop app on the same machine. Run the two commands at
the top in a terminal, or inside a Claude Code session use `/plugin marketplace add
yahya-tamur/claude-latex-check` and then `/plugin install latex-check@latex-check`.

The plugin is installed for your user, so it applies to every session in every folder. The skill's
short description is always in context, and the rest loads only in sessions that involve math. The
first check on a machine installs jsdom and builds a cache, so it takes a bit longer.

To update later (this also refreshes the marketplace):

```bash
claude plugin update latex-check@latex-check
```

## Where things are

| File | What it is |
|---|---|
| [`skills/latex-check/SKILL.md`](skills/latex-check/SKILL.md) | The skill: the rules, what to write when a formula fails, and how Claude checks replies |
| [`check.mjs`](check.mjs), `env.mjs` | The checker |
| [`MAINTENANCE.md`](MAINTENANCE.md) | Curating the rules from local fixes, and repairing the checker after an app update |
| `tests/`, `test.mjs` | One test per kind of failure in the skill, plus `tests/short-rules.md`, a sample written by the rules that must render fully |
| `.claude-plugin/` | Plugin and marketplace manifests |

Per-machine files live in the plugin's data folder (`~/.claude/plugins/data/<id>/`), which
survives plugin updates: `fixes.local.md`, `app-path.local` and jsdom.

## Running it yourself

In a clone of this repository:

```bash
npm install
node check.mjs tests/short-rules.md
```

The second command should print `ok: 17 rendered`. That confirms that the checker works with your
app version and that the skill's rules still produce math that renders.

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
Run it after changing the skill, the tests or `check.mjs`, or after an app update.

## When the checker breaks

App updates can break the checker. Report problems on the
[issues page](https://github.com/yahya-tamur/claude-latex-check/issues); fixes go out to everyone
through plugin updates. [MAINTENANCE.md](MAINTENANCE.md) explains how to repair it yourself.

## Platforms

Install locations of the desktop app vary by platform, store and version, so the checker doesn't
rely on a fixed list. It looks in this order:

1. `app-path.local` in the plugin's data folder, if it exists. Claude saves the app's location
   there when it isn't found automatically. The checker cuts any folder name at its version
   number, so `Claude_1.2.3.0_x64__pzs8sxrjxfjjc` becomes `Claude_*`. When several folders match,
   the most recently modified one that contains the app is used, so the saved location follows
   updates.
2. A few common locations: the Linux package (`/usr/lib/claude-desktop/resources`, tested),
   `/Applications/Claude.app` on macOS, and `%LOCALAPPDATA%\AnthropicClaude` on Windows.

`CLAUDE_DESKTOP_RESOURCES` overrides both.

The first run for each app version copies and patches the app's code into a cache, and removes
copies for older versions. Newer app builds pack it into `ion-dist.asar`, which is unpacked once
first. Expect a few hundred MB. Cache locations: `~/.cache/claude-latex-check` (Linux, or
`$XDG_CACHE_HOME`), `~/Library/Caches/claude-latex-check` (macOS),
`%LOCALAPPDATA%\claude-latex-check` (Windows). Override with `LATEX_CHECK_CACHE`.

## How it works

`check.mjs` finds the pieces of the app's code it needs by their content, since file and function
names change with every build, and patches a few browser-only parts in its copy. Then it renders
the reply the way the Code tab's transcript does and inspects the result. Several checks, including
a render of known math on every run, make it exit 2 rather than give a wrong verdict when an update
changes something. [MAINTENANCE.md](MAINTENANCE.md) has the details.

## License

MIT. See [LICENSE](LICENSE).
