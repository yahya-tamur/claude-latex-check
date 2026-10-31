# Writing math that renders

The app only treats a span as math when it looks like a formula. These rules come from real
failures; each has a case in `tests/`.

## Short rules

Copied into the global CLAUDE.md, markers included.

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

Find what the flagged span looks like, then rewrite just that span. These fixes show what
actually renders, and some go beyond the stricter short rules (e.g. a span starting with `(`).
When there's a choice, prefer a form that also follows the short rules.

- **Over 60 characters:** split it into shorter spans joined by words, or move it to a `$$`
  paragraph.
  `the sum of $u_1 v_1 + u_2 v_2 + u_3 v_3$ and $u_4 v_4 + u_5 v_5$`,
  `$f(x) = g(x) + c_6 x^6$ where $g(x) = c_0 + c_1 x + c_2 x^2 + c_3 x^3 + c_4 x^4 + c_5 x^5$`
- **Starts with a digit** (`$1/r$`, `$2x$`): add a TeX symbol or operator. `$\frac{1}{r}$`,
  `$r^{-1}$`, `$2\,x$`, `$2x+1$`
- **Only plain letters** (`$xY$`, `$AB/B$`; a `/` doesn't count): add an operator or a `\command`.
  `$xY \in Z$`, `$\bar{A} = AB/B$`. A single letter, `$x$`, is fine.
- **Starts with `(`** (`$(x_i)$`, `$(f)(x) = x a - a$`, even `$(A_{B})$`): an `=` or `_` isn't enough.
  Put a name first, `$x = (x_i)$`, or add a `\command` or `^`, as in `$(f)(x) = x \cdot a - a$`.
  For a family, reword: `choices $a_{B} \in A_{B}$`. Plain lists like `$(a, b)$` are fine.
- **Starts with `[`** (`$[a:b]$`, `$[A : B]$`): use `\colon`, `$[A \colon B]$`, or put a name first,
  `$n = [a:b]$`.
- **Unbraced subscript or superscript** (`$A_B$`, `$x'^n$`): brace it. `$A_{B}$`, `$x'^{n}$`
- **Ends with an operator** (`$a \cdot b -$`): complete the formula, `$c \mapsto a \cdot b \cdot c$`.
- **Something touches a dollar** (`means "$f$ has property P"`, `"a thing of kind $k$", they mean`,
  `word-$k$`):
  - Only a line start, a space, `(`, `[` or a non-ASCII character may come right before the
    opening `$`.
  - Only a space, a line end, `.,;:!?)` or a non-ASCII character may come right after the
    closing `$`.
  - Emphasis markers `*` and `_` don't count, so `*$k$*` is fine.
  - Fixes: curly quotes, as in `means “$f$ has property P”`; a non-breaking hyphen (U+2011),
    `word‑$k$`; or rewording, as in `means that $f$ has property P`.
- **Spans two lines:** join it onto one line.
- **`$$...$$` mid-sentence** (`$$x+1$$`): use `$...$`, or give it its own paragraph.
- **`\(...\)` or `\[...\]`:** these show as plain text, with `\(x\)` becoming `(x)`. Use `$...$`
  and `$$...$$`.
- **`KaTeX error`:** the TeX itself is invalid, such as a missing argument in `\frac{1}` or an
  unknown command. Fix the syntax.
