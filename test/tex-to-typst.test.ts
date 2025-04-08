import { describe, it, test, expect } from 'vitest';
import { tex2typst } from '../src/index';

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
