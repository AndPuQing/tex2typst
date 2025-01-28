import { describe, it, test, expect } from 'vitest';
import yaml from 'js-yaml';
import path from 'node:path';
import fs from 'node:fs';
import { parseTex, tokenize } from '../src/tex-parser';
import { tex2typst } from '../src/index';
import { TypstWriterError } from '../src/typst-writer';
import { Tex2TypstOptions, TexNode, TexToken } from '../src/types';

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

function loadTestCases(filename: string): TestCaseFile {
  const content = fs.readFileSync(path.join(__dirname, filename), { encoding: 'utf-8' });
  return yaml.load(content) as TestCaseFile;
}

const caseFiles = ["math.yml", "symbol.yml"];

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
            preferTypstIntrinsic: c.preferTypstIntrinsic? c.preferTypstIntrinsic: false,
            customTexMacros: c.customTexMacros? c.customTexMacros: {},
          };
          tokens = tokenize(tex);
          tex_node = parseTex(tex, settings.customTexMacros!);
          result = tex2typst(tex, settings);
          if (result !== typst) {
            console.log(`====== 😭 Wrong ======`);
            console.log(tex);
            console.log(tokens);
            console.log(yaml.dump(tex_node));
          }
          expect(result).toBe(typst);
        } catch (e) {
          console.log(`====== 😭 Error ======`);
          if (e instanceof TypstWriterError) {
            console.log(e.node);
          }
          if (tex_node !== null) {
            console.log(yaml.dump(tex_node));
          }
          console.log(tex);
          throw e;
        }
      })
    });
  });
});
