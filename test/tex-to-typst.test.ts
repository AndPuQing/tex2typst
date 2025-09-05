import { describe, it, test, expect } from 'vitest';
import { tokenize_tex } from '../src/tex-tokenizer';
import { parseTex } from '../src/tex-parser';
import { tex2typst } from '../src/index';
import { TypstWriterError } from '../src/typst-writer';
import { Tex2TypstOptions, TexNode, TexToken } from '../src/types';
import { loadTestCases, TestCase } from './test-common';

describe('options', () => {
    it('fracToSlash = true', function () {
        const input = '\\frac{a}{b}';
        const expected = 'a/b';
        const res = tex2typst(input, { fracToSlash: true });
        expect(res).toEqual(expected);
    });

    it('fracToSlash = false', function () {
        const input = '\\frac{a}{b}';
        const expected = 'frac(a, b)';
        const res = tex2typst(input, { fracToSlash: false });
        expect(res).toEqual(expected);
    });


    it('nonAsciiWrapper = ""', function () {
        const input = 'a + b = \\text{こにちは、世界}';
        const expected = 'a + b = "こにちは、世界"';
        const res = tex2typst(input);
        expect(res).toEqual(expected);
    });

    it('nonAsciiWrapper = "ut"', function () {
        const input = 'a + b = \\text{こにちは、世界}';
        const expected = 'a + b = ut("こにちは、世界")';
        const res = tex2typst(input, { nonAsciiWrapper: 'ut' });
        expect(res).toEqual(expected);
    });

    it('preferShorthands = true', function () {
        const map = new Map<string, string>([
            ['a \\rightarrow b', 'a -> b'],
            ['a \\to b', 'a -> b'],
            ['a \\implies b', 'a ==> b'],
            ['a \\iff b', 'a <==> b'],
            ['a \\ll b', 'a << b'],
            ['a \\gg b', 'a >> b'],

        ]);
        for(const [input, expected] of map.entries()) {
            const res = tex2typst(input, { preferShorthands: true });
            expect(res).toEqual(expected);
        }
    });

    it('preferShorthands = false', function () {
        const map = new Map<string, string>([
            ['a \\rightarrow b', 'a arrow.r b'],
            ['a \\to b', 'a arrow.r b'],
            ['a \\implies b', 'a arrow.r.double.long b'],
            ['a \\iff b', 'a arrow.l.r.double.long b'],
            ['a \\ll b', 'a lt.double b'],
            ['a \\gg b', 'a gt.double b'],

        ]);
        for(const [input, expected] of map.entries()) {
            const res = tex2typst(input, { preferShorthands: false });
            expect(res).toEqual(expected);
        }
    });
});


const caseFiles = ["struct-tex2typst.yaml", "symbol.yml", "struct-bidirection.yaml"];

caseFiles.forEach((ymlFilename) => {
  const suite = loadTestCases(ymlFilename);
  describe(ymlFilename, () => {
    suite.cases.forEach((c: TestCase) => {
      test(c.title, function() {
        const {tex, typst} = c;
        let tokens: null | TexToken[] = null;
        let tex_node: null | TexNode = null;
        let result: null | string = null;
        try {
          const settings: Tex2TypstOptions = {
            nonStrict: c.nonStrict? c.nonStrict: false,
            preferShorthands: c.preferShorthands !== undefined? c.preferShorthands: true,
            inftyToOo: c.inftyToOo !== undefined? c.inftyToOo: false,
            customTexMacros: c.customTexMacros? c.customTexMacros: {},
          };
          tokens = tokenize_tex(tex);
          tex_node = parseTex(tex, settings.customTexMacros!);
          result = tex2typst(tex, settings);
          if (result !== typst) {
            console.log(`====== 😭 Wrong ======`);
            console.log(tex);
            console.log(tokens);
            console.dir(tex_node, {depth: null});
          }
          expect(result).toBe(typst);
        } catch (e) {
          console.log(`====== 😭 Error ======`);
          if (e instanceof TypstWriterError) {
            console.log(e.node);
          }
          if (tex_node !== null) {
            console.dir(tex_node, {depth: null});
          }
          console.log(tex);
          throw e;
        }
      })
    });
  });
});
