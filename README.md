# claude-latex-check

Claude, especially Claude Code, often gives replies with LaTeX that isn't rendered.

On the desktop app's Code tab, each span is rendered as LaTeX only if the app decides that it looks like math.

This plugin started as some code that detects when a formula won't be rendered by using the desktop app's own Markdown renderer in a simulated browser.

We noticed two things:
* Most rendering failures can be avoided by telling the session to follow a few rules.
* An earlier version had the session write its response to a temporary file, fixed it, and told the session to give the user the fixed version. However, asking an LLM to copy text is error-prone and slow.

So, in the desktop app's Code tab, when the skill loads, the plugin:
 * Tells Claude to follow those rules.
 * Copies the replies with math, including the prompts, with all formulas fixed so they render, into a new markdown file. This is saved in a `math-notes` folder in the session's working folder, and you can read it from the app's file pane.

The plugin checks whether every LaTeX span is rendered by using the installed Claude desktop app's source code in a simulated browser. If a formula isn't rendered due to a documented reason, it's rewritten using a script, which is a lot faster than an LLM. If a formula isn't rendered due to an undocumented reason, it tells the session to rewrite it, which can take up to about a minute. If using the desktop app's code isn't possible — finding the part of the code that decides whether to render math may no longer work after an update — it will still check the known rules and use a LaTeX engine (KaTeX) to look for LaTeX errors and unknown commands.

On claude.ai and in Cowork, rendering using the desktop app's code is not viable. However, the LaTeX renders a lot more reliably in the first place. So, this plugin just includes the few rules that still apply.

## Installing

Node is required for the desktop app's Code tab.

In the Claude app's settings, open **Customize > Plugins**, choose **Add > Add marketplace**, and enter
`yahya-tamur/claude-latex-check`. You can install the plugin from there. This installs it for your account.

## License

MIT. See [LICENSE](LICENSE). KaTeX is used to find LaTeX errors and flag unknown commands. It's included under its own MIT [license](skills/latex-check-chat/scripts/KATEX-LICENSE).
