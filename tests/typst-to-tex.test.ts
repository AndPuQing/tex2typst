
import { describe, it, test, expect } from 'vitest';
import { parseTypst } from '../src/typst-parser';
import { TexWriter } from '../src/tex-writer';
import { convert_typst_node_to_tex } from '../src/convert';
import { loadTestCases, TestCase  } from './test-common';



describe('examples', () => {
    it('a + b', function () {
        const typst_node = parseTypst('a + b');
        const tex_node = convert_typst_node_to_tex(typst_node);
        const writer = new TexWriter();
        writer.append(tex_node);
        const res = writer.finalize();
        expect(res).toEqual('a + b');
    });

    it('sqrt(x)', function () {
        const typst_node = parseTypst('sqrt(x)');
        const tex_node = convert_typst_node_to_tex(typst_node);
        const writer = new TexWriter();
        writer.append(tex_node);
        const res = writer.finalize();
        expect(res).toEqual('\\sqrt{x}');
    });

    it('integral_a^b f(x) dif x', function () {
        const typst_node = parseTypst('integral_a^b f(x) dif x');
        const tex_node = convert_typst_node_to_tex(typst_node);
        const writer = new TexWriter();
        writer.append(tex_node);
        const res = writer.finalize();
        expect(res).toEqual('\\int_a^b f(x) \\mathrm{d} x');
    });

    it('lr({a + 1/3))', function () {
        const typst_node = parseTypst('lr({a + 1/3))');
        const tex_node = convert_typst_node_to_tex(typst_node);
        const writer = new TexWriter();
        writer.append(tex_node);
        const res = writer.finalize();
        expect(res).toEqual('\\left\\{a + \\frac{1}{3} \\right)');
    });
});



describe('struct-typst2tex.yaml', function () {
    const suite = loadTestCases('struct-typst2tex.yaml');
    suite.cases.forEach((c: TestCase) => {
        test(c.title, function () {
            const typst_node = parseTypst(c.typst);
            const tex_node = convert_typst_node_to_tex(typst_node);
            const writer = new TexWriter();
            writer.append(tex_node);
            const res = writer.finalize();
            expect(res).toEqual(c.tex);
        });
    });
});

describe('struct-bidirection.yaml', function () {
    const suite = loadTestCases('struct-bidirection.yaml');
    suite.cases.forEach((c: TestCase) => {
        test(c.title, function () {
            const typst_node = parseTypst(c.typst);
            const tex_node = convert_typst_node_to_tex(typst_node);
            const writer = new TexWriter();
            writer.append(tex_node);
            const res = writer.finalize();
            expect(res).toEqual(c.tex);
        });
    });
});