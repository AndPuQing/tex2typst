import { describe, it, expect } from 'vitest';
import { tokenize_typst } from '../src/typst-tokenizer';
import { TypstParser } from '../src/typst-parser';
import { TypstNode, TypstToken, TypstTokenType } from '../src/types';


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
        expect(res).toEqual(new TypstNode('group', '', [
            new TypstNode('atom', 'a'),
            new TypstNode('whitespace', ' '),
            new TypstNode('atom', '+'),
            new TypstNode('whitespace', ' '),
            new TypstNode('atom', 'b'),
        ]));
    });

    it('a (x)', function () {
        const tokens = tokenize_typst('a (x)');
        const res = parser.parse(tokens);
        expect(res).toEqual(new TypstNode('group', '', [
            new TypstNode('atom', 'a'),
            new TypstNode('whitespace', ' '),
            new TypstNode('group', 'parenthesis', [
                new TypstNode('atom', 'x'),
            ])
        ]));
    });

    it('f(x)', function () {
        const tokens = tokenize_typst('f(x)');
        const res = parser.parse(tokens);
        expect(res).toEqual(new TypstNode('funcCall', 'f', [
            new TypstNode('atom', 'x'),
        ]));
    });

    it('root(x, 3)', function () {
        const tokens = tokenize_typst('root(x, 3)');
        const res = parser.parse(tokens);
        expect(res).toEqual(new TypstNode('funcCall', 'root', [
            new TypstNode('atom', 'x'),
            new TypstNode('atom', '3'),
        ]));
    });

    it('lim_(x arrow.r 0)', function () {
        const tokens = tokenize_typst('lim_(x arrow.r 0)');
        const res = parser.parse(tokens);
        expect(res).toEqual(new TypstNode('supsub', '', [], {
            base: new TypstNode('symbol', 'lim'),
            sub: new TypstNode('group', '', [
                new TypstNode('atom', 'x'),
                new TypstNode('whitespace', ' '),
                new TypstNode('symbol', 'arrow.r'),
                new TypstNode('whitespace', ' '),
                new TypstNode('atom', '0'),
            ]),
        }));
    });

    it('a -> b', function () {
        const tokens = tokenize_typst('a -> b');
        const res = parser.parse(tokens);
        expect(res).toEqual(new TypstNode('group', '', [
            new TypstNode('atom', 'a'),
            new TypstNode('whitespace', ' '),
            new TypstNode('symbol', 'arrow.r'),
            new TypstNode('whitespace', ' '),
            new TypstNode('atom', 'b'),
        ]));
    });
});