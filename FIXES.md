# Writing math that renders

The app only treats a span as math when it looks like a formula. These rules come from real
failures; each has a case in `tests/`.

## Short rules

Write math this way from the start. This block is meant to be copied into an always-loaded
CLAUDE.md (between the markers), so it stays short and conservative. `tests/25-short-rules.md` is
written by these rules and must render fully.

<!-- short-rules:start -->
Math formatting for the Claude desktop app (inline math renders only if it looks like a formula):
- Use `$...$` inline and `$$...$$` only as its own paragraph. Never use `\(...\)` or `\[...\]`.
- Inline spans: at most 60 characters, on one line, not starting with a digit, `(` or `[`, not
  ending with an operator.
- Every inline span other than a single letter or `f(x)` needs a `\command` or one of
  `= + - < > ^ _`. Plain letters like `$xy$` or `$AB/B$` stay text.
- Brace every subscript and superscript: `x_{i}`, `x^{2}`, `x'^{n}`.
- Put a space before each opening `$`, and a space or `.,;:!?)` after each closing `$`. Never a
  straight quote or hyphen touching a `$`: use “curly quotes” or a non-breaking hyphen (U+2011).
<!-- short-rules:end -->

## Looking up a fix

When the checker flags a span, find its rule below and rewrite just that span.

### Inline `$...$`

- **At most 60 characters between the dollars.** Longer spans show as text. Split them, or move
  the formula to a `$$` paragraph.
  - Fails: `$\mathbf{u} \cdot \mathbf{v} = u_1 v_1 + u_2 v_2 + u_3 v_3 + u_4 v_4 + u_5 v_5$`
  - Renders: `the sum of $u_1 v_1 + u_2 v_2 + u_3 v_3$ and $u_4 v_4 + u_5 v_5$`
  - Renders: `$f(x) = g(x) + c_6 x^6$ where $g(x) = c_0 + c_1 x + c_2 x^2 + c_3 x^3 + c_4 x^4 + c_5 x^5$`
- **A span starting with a digit needs a TeX symbol or operator.**
  - Fails: `$1/r$`, `$2x$`
  - Renders: `$\frac{1}{r}$`, `$r^{-1}$`, `$2\,x$`, `$2x+1$`
- **A span of two or more plain letters needs an operator, `_`, `^` or a `\command`.** A `/` doesn't
  count. A single letter is fine.
  - Fails: `$xY$`, `$AB/B$`
  - Renders: `$x$`, `$xY \in Z$`, `$\bar{A} = AB/B$`
- **A span starting with `(` needs a `\command` or `^` in it.** An `=` or `_` isn't enough, even
  with braces. A plain list like `$(a, b)$` is fine. Otherwise, don't start the span with `(`.
  - Fails: `$(x_i)$`, `$(f)(x) = x a - a$`, `$(A_{B})$`
  - Renders: `$x = (x_i)$`, `$(f)(x) = x \cdot a - a$`, `$(f)(x) = x^2 a - a$`,
    `$(a, b) \to (c, d)$`, `$(\mathrm{id}, b)$`, and for a family, `choices $a_{B} \in A_{B}$`
- **A bracketed span needs an operator or a `\command`.** For a colon inside brackets, use
  `\colon`.
  - Fails: `$[a:b]$`, `$[A : B]$`
  - Renders: `$[A \colon B]$`, `$\left[A : B\right]$`, `$n = [a:b]$`, or `[a:b]` inside a `$$`
    block.
- **Brace an uppercase subscript on an uppercase letter.**
  - Fails: `$A_B$`
  - Renders: `$A_{B}$`. Lowercase or digit subscripts like `$x_B$` and `$A_1$` are fine.
- **After a prime, brace the superscript.**
  - Fails: `$x'^n$`
  - Renders: `$x'^{n}$`, `$x^{\prime n}$`. A prime alone, `$x'$`, is fine.
- **Don't end a span with an operator** (`-`, `+`, `=`, `,`, `:`, …).
  - Fails: `$a \cdot b -$`
  - Renders: `$c \mapsto a \cdot b \cdot c$`
- **Watch what touches the dollars.**
  - Right before the opening `$`: only a line start, a space, `(`, `[` or a non-ASCII character.
    Straight quotes `"` `'`, `-`, `/`, `:`, letters and digits make it text.
  - Right after the closing `$`: only a space, a line end, punctuation like `.,;:!?)` or a
    non-ASCII character. Again, no straight `"`.
  - Emphasis markers `*` and `_` don't count, so `*$k$*` is fine.
  - Fails: `means "$f$ has property P"`, `"a thing of kind $k$", they mean`, `word-$k$`
  - Renders: curly quotes, as in `means “$f$ has property P”`, or rewording, as in
    `means that $f$ has property P` and `A *thing of kind* $k$ means`
  - For a hyphenated word touching `$`, use a non-breaking hyphen (U+2011): `word‑$k$` renders and
    looks the same.
- **Keep each span on one line.**

### Display `$$...$$`

- Only as its own paragraph, never mid-sentence. `$$x+1$$` inside a sentence shows as text.

### Avoid `\(...\)` and `\[...\]`

- Simple ones show as plain text with the backslashes gone: `\(x\)` becomes `(x)`, `\(2x\)` becomes
  `(2x)`. A `\[...\]` block over several lines shows as text too. Use `$...$` and `$$...$$`.
