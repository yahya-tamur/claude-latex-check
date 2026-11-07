# Markdown math in this viewer

Open this file in a markdown viewer to see how it handles math. Part 1 is written by the plugin's
document rules and should render fully in any viewer that supports `$...$` math. Part 2 shows the
mistakes those rules avoid, one per paragraph, each with what it breaks elsewhere. In a viewer with
no math support, everything shows as raw text with dollar signs.

## Part 1: written by the rules

A presheaf $\mathcal{F}$ on $X$ is a **sheaf** when sections that agree on overlaps glue: for an
open cover $U = \bigcup_{i} U_{i}$ and sections $s_{i} \in \mathcal{F}(U_{i})$ that agree on each
$U_{i} \cap U_{j}$, there is one $s \in \mathcal{F}(U)$ restricting to each of them.

The rotation $R = \begin{pmatrix} 0 & -1 \cr 1 & 0 \end{pmatrix}$ has $R^{4} = I$, and

$$
\lvert x \rvert = \begin{cases} x & x \ge 0 \cr -x & x < 0 \end{cases}
$$

- **Image of $d$:** the presheaf $U \mapsto \lbrace f' \colon f \in \mathcal{O}(U) \rbrace$.
- **Image of $\exp$:** the units $\mathcal{O}^{\ast}(U)$ and the sheaf $\mathcal{O}^{\ast}$.
- _Norms:_ $\lVert v \rVert_{2} = 1$, $x_{i}^{2} \ge 0$ and $\mathbf x_{i} = \mathbf y_{j}$.

| Name | Formula |
|---|---|
| Absolute value | $\vert x \vert = \sqrt{x^{2}}$ |
| Two-element set | $S = \lbrace a, b \rbrace$ |

With a thin space, $y = 2\thinspace x$ and $a \medspace b = c$.

## Part 2: what the rules avoid

Shown as text in the Claude Code tab, which needs a formula to look like math: $1/r$ and $2x$.

Shown as text in the Claude Code tab, which needs a blank line around a display:
$$a^{2} + b^{2}$$
and the formulas next to it, like $c^{2}$, can break too.

Bold shown as stars in Cowork and on claude.ai: **Image of $\exp$:** $\mathcal{O}^*(U)$ and $\mathcal{O}^*$.

Bold shown as stars in both Claude views: $\mathbf{x}_{i}$ then **bold** then $\mathbf{y}_{j}$.

Row breaks written `\\` show as text inline in the Claude Code tab: $A = \begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}$.

Escaped punctuation, which viewers that read markdown escapes first turn into plain `{`, `,` and
`|` (and `\|` fails in the Claude Code tab too): $S = \{a, b\}$, $y = 2\,x$ and $\|v\| = 1$.

A `|` inside a formula can split a table cell:

| Name | Formula |
|---|---|
| Absolute value | $|x| = \sqrt{x^{2}}$ |

### A heading with math, $e^{i\pi} = -1$, which some viewers and tables of contents mangle

Backslash delimiters, which many viewers don't treat as math: \(x^{2}\) and \[y^{2}\].
