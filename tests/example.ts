import { tex2typst, typst2tex } from "../src/index";

function example_tex2typst(text: string) {
    const res = tex2typst(text);
    console.log(res);
}

function example_typst2tex(text: string) {
    const res = typst2tex(text);
    console.log(res);
}

example_tex2typst("a + \\frac{1}{2}");

example_typst2tex("a + 1/2");
