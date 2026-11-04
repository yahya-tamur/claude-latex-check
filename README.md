# claude-latex-check

Claude, especially Claude Code, often gives replies with LaTeX that's not rendered.

One reason for this is that it's difficult to properly render different languages embedded in each other, like LaTeX in Markdown. On the desktop app's Code tab, each span is rendered in LaTeX only if it's decided that it looks like math.

This plugin was initially some code that detects when a formula won't be rendered by using the desktop app's own Markdown renderer in a simulated browser. We noticed that most rendering failures can be avoided by following a few rules.

So, in the desktop app's Code tab, the plugin:
 * Tells Claude to follow those rules.
 * Checks the LaTeX for errors and unknown commands.
 * Tries to render each reply in a simulated browser, using the installed Claude desktop app's source code.
   * If a formula isn't rendered due to a documented reason, it's rewritten using the known fix.
   * If a formula isn't rendered due to an unexpected reason, it records a new rule and an associated fix on that machine.
 * If rendering the reply isn't possible, which may also happen after a desktop app update, it runs a script to check each reply against the known rules.

On claude.ai or Cowork, rendering using the desktop app's code is not viable, since these run in a sandbox. However, the LaTeX renders a lot more reliably anyway. So, this plugin just includes the few rules that still apply, and checks the LaTeX.

## Installing

Node is required for the desktop app's Code tab.

In the Claude app's settings, open **Customize > Plugins**, choose **Add > Add marketplace**, and enter
`yahya-tamur/claude-latex-check`. You can install the plugin from there. This installs it for your account.

## Context cost

The short descriptions of the two skills (one for Claude Code and one for claude.ai and Cowork) are always loaded, but the rest only loads in sessions with math.

## License

MIT. See [LICENSE](LICENSE). KaTeX is used to find LaTeX errors and flag unknown commands. It's included under its own MIT [license](skills/latex-check-chat/scripts/KATEX-LICENSE).
