
/**
 * ATTENTION:
 * Don't use any options except those explicitly documented in
 *   https://github.com/qwinsi/tex2typst/blob/main/docs/api-reference.md
 * Any undocumented options may be not working at present or break in the future!
 */
export interface Tex2TypstOptions {
    nonStrict: boolean; /** default is true */
    preferShorthands: boolean; /** default is true */
    keepSpaces: boolean; /** default is false */
    fracToSlash: boolean; /** default is true */
    inftyToOo: boolean; /** default is false */
    optimize: boolean; /** default is true */
    customTexMacros: { [key: string]: string; };
}

export interface Typst2TexOptions {
    blockMathMode: boolean; /** default is true */
}

export declare function tex2typst(tex: string, options?: Partial<Tex2TypstOptions>): string;
export declare function typst2tex(typst: string, options?: Partial<Typst2TexOptions>): string;

export declare const symbolMap: Map<string, string>;
export declare const shorthandMap: Map<string, string>;
