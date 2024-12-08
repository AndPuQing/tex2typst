import path from 'path';
import toml from 'toml';
import fs from 'node:fs';
import { describe, it, test, expect } from 'vitest';
import { symbolMap } from '../src';


describe('general symbols', () => {
    const cheatSheetFile = path.join(__dirname, 'general-symbols.toml');
    const text_content = fs.readFileSync(cheatSheetFile, { encoding: 'utf-8' });
    const data = toml.parse(text_content);

    expect(data.symbols_in_official_doc).toBeDefined();

    test('symbols_in_official_doc', () => {
        expect(data.symbols_in_official_doc).toBeDefined();

        for (const [key, value] of Object.entries(data.symbols_in_official_doc)) {
            expect(symbolMap.get(key)).toBe(value);
        }
    });
});
