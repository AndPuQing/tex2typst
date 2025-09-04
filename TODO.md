- Typst math `limits(Y)^X` to TeX `\overset{X}{Y}`
- make tex2typst() map TeX `\|` to Typst `bar.v.double` instead of `parallel`,
  so that `\left\| a + \frac{1}{2} \right.` translates to `lr(bar.v.double 1+1/3)`