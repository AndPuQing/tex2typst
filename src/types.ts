export enum TexTokenType {
    ELEMENT,
    COMMAND,
    TEXT,
    COMMENT,
    WHITESPACE,
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

type TexNodeType = 'element' | 'text' | 'comment' | 'whitespace' | 'newline' | 'control' | 'ordgroup' | 'supsub'
             | 'unaryFunc' | 'binaryFunc' | 'leftright' | 'beginend' | 'symbol' | 'empty' | 'unknownMacro';

export class TexNode {
    type: TexNodeType;
    content: string;
    args?: TexNode[];
    // For type="sqrt", it's additional argument wrapped square bracket. e.g. 3 in \sqrt[3]{x}
    // For type="supsub", it's base, sup, and sub.
    // For type="array", it's the 2-dimensional matrix.
    data?: TexSqrtData | TexSupsubData | TexArrayData;

    constructor(type: TexNodeType, content: string, args?: TexNode[],
            data?: TexSqrtData | TexSupsubData | TexArrayData) {
        this.type = type;
        this.content = content;
        this.args = args;
        this.data = data;
    }

    public eq_shadow(other: TexNode): boolean {
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

export interface TypstSupsubData {
    base: TypstNode;
    sup?: TypstNode;
    sub?: TypstNode;
}

export type TypstArrayData = TypstNode[][];

type TypstNodeType = 'atom' | 'symbol' | 'text' | 'softSpace' | 'comment' | 'newline'
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

    public eq_shadow(other: TypstNode): boolean {
        return this.type === other.type && this.content === other.content;
    }
}

export interface Tex2TypstOptions {
    nonStrict?: boolean; // default is false
    preferTypstIntrinsic?: boolean; // default is false,
    customTexMacros?: { [key: string]: string };
    // TODO: custom typst functions
}
