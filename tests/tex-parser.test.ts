import { describe, test, expect } from 'vitest';
import { tokenize_tex } from '../src/tex-tokenizer';
import { parseTex } from '../src/tex-parser';
import { TexToken, TexTokenType } from '../src/tex-types';


describe('typst-tokenizer', () => {
    test('a + b', function () {
        const res = tokenize_tex('a + b');
        expect(res).toEqual([
            new TexToken(TexTokenType.ELEMENT, 'a'),
            new TexToken(TexTokenType.SPACE, ' '),
            new TexToken(TexTokenType.ELEMENT, '+'),
            new TexToken(TexTokenType.SPACE, ' '),
            new TexToken(TexTokenType.ELEMENT, 'b'),
        ]);
    });

    test('a (x)', function () {
        const res = tokenize_tex('a (x)');
        expect(res).toEqual([
            new TexToken(TexTokenType.ELEMENT, 'a'),
            new TexToken(TexTokenType.SPACE, ' '),
            new TexToken(TexTokenType.ELEMENT, '('),
            new TexToken(TexTokenType.ELEMENT, 'x'),
            new TexToken(TexTokenType.ELEMENT, ')'),
        ]);
    });

    test('f(x)', function () {
        const res = tokenize_tex('f(x)');
        expect(res).toEqual([
            new TexToken(TexTokenType.ELEMENT, 'f'),
            new TexToken(TexTokenType.ELEMENT, '('),
            new TexToken(TexTokenType.ELEMENT, 'x'),
            new TexToken(TexTokenType.ELEMENT, ')'),
        ]);
    });

    test('comment', function() {
        const res = tokenize_tex('a % comment');
        expect(res).toEqual([
            new TexToken(TexTokenType.ELEMENT, 'a'),
            new TexToken(TexTokenType.SPACE, ' '),
            new TexToken(TexTokenType.COMMENT, ' comment'),
        ]);
    });

    test('macro', function() {
        const res = tokenize_tex('\\sqrt{a}');
        expect(res).toEqual([
            new TexToken(TexTokenType.COMMAND, '\\sqrt'),
            new TexToken(TexTokenType.CONTROL, '{'),
            new TexToken(TexTokenType.ELEMENT, 'a'),
            new TexToken(TexTokenType.CONTROL, '}'),
        ]);
    });

    test('throw error on & outside of an alignment', function() {
        expect(() => parseTex('a & b')).toThrow();
    });

    test('throw on extra {', function() {
        expect(() => parseTex('a { {b}')).toThrow();
    });

    test('throw on extra }', function() {
        expect(() => parseTex('a { b } }')).toThrow();
    });

    test('throw on extra \\left', function() {
        expect(() => parseTex('a \\left( \\left( b \\right)')).toThrow();
    });

    test('throw on extra \\right', function() {
        expect(() => parseTex('a \\left( b \\right) \\right)')).toThrow();
    });

    test('throw on extra \\begin', function() {
        expect(() => parseTex('a \\begin{aligned} \\begin{aligned} b \\end{aligned}')).toThrow();
    });

    test('throw on extra \\end', function() {
        expect(() => parseTex('a \\begin{aligned} b \\end{aligned} \\end{aligned}')).toThrow();
    });
});