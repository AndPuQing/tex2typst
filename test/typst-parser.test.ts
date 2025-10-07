import { describe, it, expect } from 'vitest';
import { tokenize_typst } from '../src/typst-tokenizer';
import { TypstParser } from '../src/typst-parser';
import { TypstFuncCall, TypstGroup, TypstLeftright, TypstSupsub, TypstTerminal, TypstToken, TypstTokenType } from '../src/typst-types';


describe('typst-tokenizer', () => {
    it('a + b', function () {
        const res = tokenize_typst('a + b');
        expect(res).toEqual([
            new TypstToken(TypstTokenType.ELEMENT, 'a'),
            new TypstToken(TypstTokenType.SPACE, ' '),
            new TypstToken(TypstTokenType.ELEMENT, '+'),
            new TypstToken(TypstTokenType.SPACE, ' '),
            new TypstToken(TypstTokenType.ELEMENT, 'b'),
        ]);
    });

    it('a (x)', function () {
        const res = tokenize_typst('a (x)');
        expect(res).toEqual([
            new TypstToken(TypstTokenType.ELEMENT, 'a'),
            new TypstToken(TypstTokenType.SPACE, ' '),
            new TypstToken(TypstTokenType.ELEMENT, '('),
            new TypstToken(TypstTokenType.ELEMENT, 'x'),
            new TypstToken(TypstTokenType.ELEMENT, ')'),
        ]);
    });

    it('f(x)', function () {
        const res = tokenize_typst('f(x)');
        expect(res).toEqual([
            new TypstToken(TypstTokenType.ELEMENT, 'f'),
            new TypstToken(TypstTokenType.ELEMENT, '('),
            new TypstToken(TypstTokenType.ELEMENT, 'x'),
            new TypstToken(TypstTokenType.ELEMENT, ')'),
        ]);
    });

    it('comment', function() {
        const res = tokenize_typst('a // comment');
        expect(res).toEqual([
            new TypstToken(TypstTokenType.ELEMENT, 'a'),
            new TypstToken(TypstTokenType.SPACE, ' '),
            new TypstToken(TypstTokenType.COMMENT, ' comment'),
        ]);
    })
});

describe('typst-parser', () => {
    const parser = new TypstParser();
    it('a + b', function () {
        const tokens = tokenize_typst('a + b');
        const res = parser.parse(tokens);
        expect(res).toEqual(new TypstGroup([
            new TypstTerminal(new TypstToken(TypstTokenType.ELEMENT, 'a')),
            new TypstTerminal(new TypstToken(TypstTokenType.SPACE, ' ')),
            new TypstTerminal(new TypstToken(TypstTokenType.ELEMENT, '+')),
            new TypstTerminal(new TypstToken(TypstTokenType.SPACE, ' ')),
            new TypstTerminal(new TypstToken(TypstTokenType.ELEMENT, 'b')),
        ]));
    });

    it('a (x)', function () {
        const tokens = tokenize_typst('a (x)');
        const res = parser.parse(tokens);
        expect(res).toEqual(new TypstGroup([
            new TypstTerminal(new TypstToken(TypstTokenType.ELEMENT, 'a')),
            new TypstTerminal(new TypstToken(TypstTokenType.SPACE, ' ')),
            new TypstLeftright(null, [
                new TypstTerminal(new TypstToken(TypstTokenType.ELEMENT, 'x')),
            ], { left: '(', right: ')' })
        ]));
    });

    it('f(x)', function () {
        const tokens = tokenize_typst('f(x)');
        const res = parser.parse(tokens);
        expect(res).toEqual(new TypstFuncCall(new TypstToken(TypstTokenType.ELEMENT, 'f'), [
            new TypstTerminal(new TypstToken(TypstTokenType.ELEMENT, 'x')),
        ]));
    });

    it('root(x, 3)', function () {
        const tokens = tokenize_typst('root(x, 3)');
        const res = parser.parse(tokens);
        expect(res).toEqual(new TypstFuncCall(new TypstToken(TypstTokenType.SYMBOL, 'root'), [
            new TypstTerminal(new TypstToken(TypstTokenType.ELEMENT, 'x')),
            new TypstTerminal(new TypstToken(TypstTokenType.ELEMENT, '3')),
        ]));
    });

    it('lim_(x arrow.r 0)', function () {
        const tokens = tokenize_typst('lim_(x arrow.r 0)');
        const res = parser.parse(tokens);
        expect(res).toEqual(new TypstSupsub({
            base: new TypstTerminal(new TypstToken(TypstTokenType.SYMBOL, 'lim')),
            sub: new TypstGroup([
                new TypstTerminal(new TypstToken(TypstTokenType.ELEMENT, 'x')),
                new TypstTerminal(new TypstToken(TypstTokenType.SPACE, ' ')),
                new TypstTerminal(new TypstToken(TypstTokenType.SYMBOL, 'arrow.r')),
                new TypstTerminal(new TypstToken(TypstTokenType.SPACE, ' ')),
                new TypstTerminal(new TypstToken(TypstTokenType.ELEMENT, '0')),
            ]),
            sup: null,
        }));
    });

    it('a -> b', function () {
        const tokens = tokenize_typst('a -> b');
        const res = parser.parse(tokens);
        expect(res).toEqual(new TypstGroup([
            new TypstTerminal(new TypstToken(TypstTokenType.ELEMENT, 'a')),
            new TypstTerminal(new TypstToken(TypstTokenType.SPACE, ' ')),
            new TypstTerminal(new TypstToken(TypstTokenType.SYMBOL, 'arrow.r')),
            new TypstTerminal(new TypstToken(TypstTokenType.SPACE, ' ')),
            new TypstTerminal(new TypstToken(TypstTokenType.ELEMENT, 'b')),
        ]));
    });
});