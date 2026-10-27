# Writing math that renders

The app only treats a span as math when it looks like a formula. These rules come from real
failures; each has a case in `tests/`. Read this, plus `fixes.local.md` if it exists, before writing
math.

## Inline `$...$`

- **At most 60 characters between the dollars.** Longer spans show as text. Split them, or move
  the formula to a `$$` paragraph.
  - Fails: `$\mathrm{Spec}\, \mathbb{F}_2 \sqcup \mathrm{Spec}\, \mathbb{F}_3$`
  - Renders: `the disjoint union of $\mathrm{Spec}\, \mathbb{F}_2$ and $\mathrm{Spec}\, \mathbb{F}_3$`
  - Renders: `$D \to \mathrm{Spec}\, \mathbb{C}$ where $D = \mathrm{Spec}\, \mathbb{C}[x]/(x^2)$`
- **A span starting with a digit needs a TeX symbol or operator.**
  - Fails: `$1/r$`, `$2x$`
  - Renders: `$\frac{1}{r}$`, `$r^{-1}$`, `$2\,x$`, `$2x+1$`
- **A bracketed span needs an operator.**
  - Fails: `$[L:k]$`
  - Renders: `$n = [L:k]$` inline, or `[L:k]` inside a `$$` block.
- **Don't end a span with an operator** (`-`, `+`, `=`, `,`, `:`, …).
  - Fails: `$M \otimes_A -$`
  - Renders: `$N \mapsto M \otimes_A N$`
- **Nothing but a space or punctuation like `.,;:!?)` right after the closing `$`.** In particular,
  no `"` right after it.
  - Fails: `"a scheme of characteristic $p$", they mean`
  - Renders: `A *scheme of characteristic* $p$ means`
- **Keep each span on one line.**

## Display `$$...$$`

- Only as its own paragraph, never mid-sentence. `$$x+1$$` inside a sentence shows as text.

## Avoid `\(...\)` and `\[...\]`

- Simple ones show as plain text with the backslashes gone: `\(x\)` becomes `(x)`, `\(2x\)` becomes
  `(2x)`. A `\[...\]` block over several lines shows as text too. Use `$...$` and `$$...$$`.
