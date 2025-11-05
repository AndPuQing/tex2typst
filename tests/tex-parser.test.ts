import { describe, test, expect } from 'vitest';
import { tokenize_tex } from '../src/tex-tokenizer';
import { LatexParserError, parseTex } from '../src/tex-parser';
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

    test('throw on missing ] for sqrt', function() {
        const input = '\\sqrt[3{x}';
        expect(() => parseTex(input)).toThrowError(LatexParserError.UNMATCHED_LEFT_BRACKET);
    });

    test('throw on extra {', function() {
        const input = 'a { {b}';
        expect(() => parseTex(input)).toThrowError(LatexParserError.UNMATCHED_LEFT_BRACE);
    });

    test('throw on extra }', function() {
        const input = 'a { b } }';
        expect(() => parseTex(input)).toThrowError(LatexParserError.UNMATCHED_RIGHT_BRACE);
    });

    test('throw on extra \\left', function() {
        const input = 'a \\left( \\left( b \\right)';
        expect(() => parseTex(input)).toThrowError(LatexParserError.UNMATCHED_COMMAND_LEFT);
    });

    test('throw on extra \\right', function() {
        const input = 'a \\left( b \\right) \\right)';
        expect(() => parseTex(input)).toThrowError(LatexParserError.UNMATCHED_COMMAND_RIGHT);
    });

    test('throw on extra \\begin', function() {
        const input = 'a \\begin{aligned} \\begin{aligned} b \\end{aligned}';
        expect(() => parseTex(input)).toThrowError(LatexParserError.UNMATCHED_COMMAND_BEGIN);
    });

    test('throw on extra \\end', function() {
        const input = 'a \\begin{aligned} b \\end{aligned} \\end{aligned}';
        expect(() => parseTex(input)).toThrowError(LatexParserError.UNMATCHED_COMMAND_END);
    });
});