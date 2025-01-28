import yaml from 'js-yaml';
import path from 'node:path';
import fs from 'node:fs';
import { describe, it, test, expect } from 'vitest';
import { parseTypst } from '../src/typst-parser';
import { TexWriter } from '../src/tex-writer';
import { convert_typst_node_to_tex } from '../src/convert';


type TestCase = {
    title: string;
    tex: string;
    typst: string;
    nonStrict?: boolean;
    preferTypstIntrinsic?: boolean;
    customTexMacros: { [key: string]: string };
};


type TestCaseFile = {
    title: string;
    cases: TestCase[];
};


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
    
    it('lr({a))', function () {
        const typst_node = parseTypst('lr({a))');
        const tex_node = convert_typst_node_to_tex(typst_node);
        const writer = new TexWriter();
        writer.append(tex_node);
        const res = writer.finalize();
        expect(res).toEqual('\\left\\{a \\right)');
    });
});

function loadTestCases(filename: string): TestCaseFile {
    const content = fs.readFileSync(path.join(__dirname, filename), { encoding: 'utf-8' });
    return yaml.load(content) as TestCaseFile;
}

describe('integration-cases.yaml', function () {
    const suite = loadTestCases('integration-cases.yml');
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