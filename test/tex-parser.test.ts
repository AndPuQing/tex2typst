import { describe, it, expect } from 'vitest';
import { tokenize_tex } from '../src/tex-tokenizer';
import { TexToken, TexTokenType } from '../src/tex-types';


describe('typst-tokenizer', () => {
    it('a + b', function () {
        const res = tokenize_tex('a + b');
        expect(res).toEqual([
            new TexToken(TexTokenType.ELEMENT, 'a'),
            new TexToken(TexTokenType.SPACE, ' '),
            new TexToken(TexTokenType.ELEMENT, '+'),
            new TexToken(TexTokenType.SPACE, ' '),
            new TexToken(TexTokenType.ELEMENT, 'b'),
        ]);
    });

    it('a (x)', function () {
        const res = tokenize_tex('a (x)');
        expect(res).toEqual([
            new TexToken(TexTokenType.ELEMENT, 'a'),
            new TexToken(TexTokenType.SPACE, ' '),
            new TexToken(TexTokenType.ELEMENT, '('),
            new TexToken(TexTokenType.ELEMENT, 'x'),
            new TexToken(TexTokenType.ELEMENT, ')'),
        ]);
    });

    it('f(x)', function () {
        const res = tokenize_tex('f(x)');
        expect(res).toEqual([
            new TexToken(TexTokenType.ELEMENT, 'f'),
            new TexToken(TexTokenType.ELEMENT, '('),
            new TexToken(TexTokenType.ELEMENT, 'x'),
            new TexToken(TexTokenType.ELEMENT, ')'),
        ]);
    });

    it('comment', function() {
        const res = tokenize_tex('a % comment');
        expect(res).toEqual([
            new TexToken(TexTokenType.ELEMENT, 'a'),
            new TexToken(TexTokenType.SPACE, ' '),
            new TexToken(TexTokenType.COMMENT, ' comment'),
        ]);
    });

    it('macro', function() {
        const res = tokenize_tex('\\sqrt{a}');
        expect(res).toEqual([
            new TexToken(TexTokenType.COMMAND, '\\sqrt'),
            new TexToken(TexTokenType.CONTROL, '{'),
            new TexToken(TexTokenType.ELEMENT, 'a'),
            new TexToken(TexTokenType.CONTROL, '}'),
        ]);
    })
});