# Writing math that renders

The app only treats a span as math when it looks like a formula. These rules come from real
failures; each has a case in `tests/`. Read this, plus `fixes.local.md` if it exists, before writing
math.

## Inline `$...$`

- **At most 60 characters between the dollars.** Longer spans show as text. Split them, or move
  the formula to a `$$` paragraph.
  - Fails: `$\mathbf{u} \cdot \mathbf{v} = u_1 v_1 + u_2 v_2 + u_3 v_3 + u_4 v_4 + u_5 v_5$`
  - Renders: `the sum of $u_1 v_1 + u_2 v_2 + u_3 v_3$ and $u_4 v_4 + u_5 v_5$`
  - Renders: `$f(x) = g(x) + c_6 x^6$ where $g(x) = c_0 + c_1 x + c_2 x^2 + c_3 x^3 + c_4 x^4 + c_5 x^5$`
- **A span starting with a digit needs a TeX symbol or operator.**
  - Fails: `$1/r$`, `$2x$`
  - Renders: `$\frac{1}{r}$`, `$r^{-1}$`, `$2\,x$`, `$2x+1$`
- **A bracketed span needs an operator.**
  - Fails: `$[a:b]$`
  - Renders: `$n = [a:b]$` inline, or `[a:b]` inside a `$$` block.
- **Don't end a span with an operator** (`-`, `+`, `=`, `,`, `:`, …).
  - Fails: `$a \cdot b -$`
  - Renders: `$c \mapsto a \cdot b \cdot c$`
- **Watch what touches the dollars.**
  - Right before the opening `$`: only a line start, a space, `(`, `[` or a non-ASCII character.
    Straight quotes `"` `'`, `-`, `/`, `:`, letters and digits make it text.
  - Right after the closing `$`: only a space, a line end, punctuation like `.,;:!?)` or a
    non-ASCII character. Again, no straight `"`.
  - Emphasis markers `*` and `_` don't count, so `*$k$*` is fine.
  - Fails: `means "$f$ has property P"`, `"a thing of kind $k$", they mean`
  - Renders: curly quotes, as in `means “$f$ has property P”`, or rewording, as in
    `means that $f$ has property P` and `A *thing of kind* $k$ means`
- **Keep each span on one line.**

## Display `$$...$$`

- Only as its own paragraph, never mid-sentence. `$$x+1$$` inside a sentence shows as text.

## Avoid `\(...\)` and `\[...\]`

- Simple ones show as plain text with the backslashes gone: `\(x\)` becomes `(x)`, `\(2x\)` becomes
  `(2x)`. A `\[...\]` block over several lines shows as text too. Use `$...$` and `$$...$$`.
