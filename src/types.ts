export enum TexTokenType {
    ELEMENT,
    COMMAND,
    TEXT,
    COMMENT,
    SPACE,
    NEWLINE,
    CONTROL,
    UNKNOWN,
}



export interface TexSupsubData {
    base: TexNode;
    sup?: TexNode;
    sub?: TexNode;
}

export type TexSqrtData = TexNode;

export type TexArrayData = TexNode[][];

/**
 * element: 0-9, a-z, A-Z, punctuations such as +-/*,:; etc.
 * symbol: LaTeX macro with no parameter. e.g. \sin \cos \int \sum
 * unaryFunc: LaTeX macro with 1 parameter. e.g. \sqrt{3} \log{x} \exp{x}
 * binaryFunc: LaTeX macro with 2 parameters. e.g. \frac{1}{2}
 * text: text enclosed by braces. e.g. \text{hello world}
 * empty: special type when something is empty. e.g. the base of _{a} or ^{a}
 * whitespace: space, tab, newline
 */
type TexNodeType = 'element' | 'text' | 'comment' | 'whitespace' | 'control' | 'ordgroup' | 'supsub'
             | 'unaryFunc' | 'binaryFunc' | 'leftright' | 'beginend' | 'symbol' | 'empty' | 'unknownMacro';

export class TexNode {
    type: TexNodeType;
    content: string;
    args?: TexNode[];
    // For type="sqrt", it's additional argument wrapped square bracket. e.g. 3 in \sqrt[3]{x}
    // For type="supsub", it's base, sup, and sub.
    // For type="beginend", it's the 2-dimensional matrix.
    data?: TexSqrtData | TexSupsubData | TexArrayData;

    constructor(type: TexNodeType, content: string, args?: TexNode[],
            data?: TexSqrtData | TexSupsubData | TexArrayData) {
        this.type = type;
        this.content = content;
        this.args = args;
        this.data = data;
    }

    public eq_shallow(other: TexNode): boolean {
        return this.type === other.type && this.content === other.content;
    }

    public toString(): string {
        switch (this.type) {
            case 'text':
                return `\\text{${this.content}}`;
            default:
                throw new Error(`toString() is not implemented for type ${this.type}`);
        }
    }
}

export enum TypstTokenType {
    SYMBOL,
    ELEMENT,
    TEXT,
    COMMENT,
    SPACE,
    SOFT_SPACE,
    CONTROL,
    NEWLINE,
}

export class TypstToken {
    type: TypstTokenType;
    value: string;

    constructor(type: TypstTokenType, content: string) {
        this.type = type;
        this.value = content;
    }

    eq(other: TypstToken): boolean {
        return this.type === other.type && this.value === other.value;
    }

    isOneOf(tokens: TypstToken[]): boolean {
        let found = false;
        for (const token of tokens) {
            if (this.eq(token)) {
                found = true;
                break;
            }
        }
        return found;
    }
}

export interface TypstSupsubData {
    base: TypstNode;
    sup?: TypstNode;
    sub?: TypstNode;
}

export type TypstArrayData = TypstNode[][];

type TypstNodeType = 'atom' | 'symbol' | 'text' | 'control' | 'comment' | 'whitespace'
            | 'empty' | 'group' | 'supsub' | 'unaryFunc' | 'binaryFunc' | 'align' | 'matrix' | 'unknown';


export class TypstNode {
    type: TypstNodeType;
    content: string;
    args?: TypstNode[];
    data?: TypstSupsubData | TypstArrayData;
    // Some Typst functions accept additional options. e.g. mat() has option "delim", op() has option "limits"
    options?: { [key: string]: string };

    constructor(type: TypstNodeType, content: string, args?: TypstNode[],
            data?: TypstSupsubData | TypstArrayData) {
        this.type = type;
        this.content = content;
        this.args = args;
        this.data = data;
    }

    public setOptions(options: { [key: string]: string }) {
        this.options = options;
    }

    public eq_shallow(other: TypstNode): boolean {
        return this.type === other.type && this.content === other.content;
    }
}

export interface Tex2TypstOptions {
    nonStrict?: boolean; // default is true
    preferTypstIntrinsic?: boolean; // default is true,
    keepSpaces?: boolean; // default is false
    customTexMacros?: { [key: string]: string };
    // TODO: custom typst functions
}
