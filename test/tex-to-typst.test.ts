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
});
