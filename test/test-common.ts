import yaml from 'js-yaml';
import path from 'node:path';
import fs from 'node:fs';

export interface TestCase {
  title: string;
  tex: string;
  typst: string;
  nonStrict?: boolean;
  preferShorthands?: boolean;
  inftyToOo?: boolean;
  customTexMacros: { [key: string]: string };
};


export interface TestCaseFile {
    title: string;
    cases: TestCase[];
};


export function loadTestCases(filename: string): TestCaseFile {
    const content = fs.readFileSync(path.join(__dirname, filename), { encoding: 'utf-8' });
    return yaml.load(content) as TestCaseFile;
}
