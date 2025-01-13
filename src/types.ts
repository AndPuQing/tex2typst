import { isalpha } from "./util";

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

export class TexToken {
    type: TexTokenType;
    value: string;

    constructor(type: TexTokenType, value: string) {
        this.type = type;
        this.value = value;
    }

    public eq(token: TexToken): boolean {
        return this.type === token.type && this.value === token.value;
    }

    public toString(): string {
        switch (this.type) {
            case TexTokenType.TEXT:
                return `\\text{${this.value}}`;
            case TexTokenType.COMMENT:
                return `%${this.value}`;
            default:
                return this.value;
        }
    }
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


function apply_escape_if_needed(c: string) {
    if (['{', '}', '%'].includes(c)) {
        return '\\' + c;
    }
    return c;
}

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


    public serialize(): TexToken[] {
        switch (this.type) {
            case 'empty':
                return [];
            case 'element': {
                let c = this.content;
                c = apply_escape_if_needed(c);
                return [new TexToken(TexTokenType.ELEMENT, c)];
            }
            case 'symbol':
                return [new TexToken(TexTokenType.COMMAND, this.content)];
            case 'text':
                return [new TexToken(TexTokenType.TEXT, this.content)];
            case 'comment':
                return [new TexToken(TexTokenType.COMMENT, this.content)];
            case 'whitespace': {
                const tokens: TexToken[] = [];
                for (const c of this.content) {
                    const token_type = c === ' ' ? TexTokenType.SPACE : TexTokenType.NEWLINE;
                    tokens.push(new TexToken(token_type, c));
                }
                return tokens;
            }
            case 'ordgroup':
                return this.args!.map((n) => n.serialize()).flat();
            case 'unaryFunc': {
                let tokens: TexToken[] = [];
                tokens.push(new TexToken(TexTokenType.COMMAND, this.content));

                // special hook for \sqrt
                if (this.content === '\\sqrt' && this.data) {
                    tokens.push(new TexToken(TexTokenType.ELEMENT, '['));
                    tokens = tokens.concat((this.data! as TexSqrtData).serialize());
                    tokens.push(new TexToken(TexTokenType.ELEMENT, ']'));
                }
                // special hook for \operatorname
                if (this.content === '\\operatorname' && this.args!.length === 1 && this.args![0].type === 'text') {
                    const text = this.args![0].content;
                    tokens.push(new TexToken(TexTokenType.ELEMENT, '{'));
                    // this.serialize(new TexNode('symbol', text));
                    tokens.push(new TexToken(TexTokenType.COMMAND, text));
                    tokens.push(new TexToken(TexTokenType.ELEMENT, '}'));
                    return tokens;
                }

                tokens.push(new TexToken(TexTokenType.ELEMENT, '{'));
                tokens = tokens.concat(this.args![0].serialize());
                tokens.push(new TexToken(TexTokenType.ELEMENT, '}'));

                return tokens;
            }
            case 'binaryFunc': {
                let tokens: TexToken[] = [];
                tokens.push(new TexToken(TexTokenType.COMMAND, this.content));
                tokens.push(new TexToken(TexTokenType.ELEMENT, '{'));
                tokens = tokens.concat(this.args![0].serialize());
                tokens.push(new TexToken(TexTokenType.ELEMENT, '}'));
                tokens.push(new TexToken(TexTokenType.ELEMENT, '{'));
                tokens = tokens.concat(this.args![1].serialize());
                tokens.push(new TexToken(TexTokenType.ELEMENT, '}'));
                return tokens;
            }
            case 'supsub': {
                let tokens: TexToken[] = [];
                const { base, sup, sub } = this.data! as TexSupsubData;
                tokens = tokens.concat(base.serialize());
                if (sub) {
                    tokens.push(new TexToken(TexTokenType.CONTROL, '_'));
                    if (sub.type === 'ordgroup' || sub.type === 'supsub') {
                        tokens.push(new TexToken(TexTokenType.ELEMENT, '{'));
                        tokens = tokens.concat(sub.serialize());
                        tokens.push(new TexToken(TexTokenType.ELEMENT, '}'));
                    } else {
                        tokens = tokens.concat(sub.serialize());
                    }
                }
                if (sup) {
                    tokens.push(new TexToken(TexTokenType.CONTROL, '^'));
                    if (sup.type === 'ordgroup' || sup.type === 'supsub') {
                        tokens.push(new TexToken(TexTokenType.ELEMENT, '{'));
                        tokens = tokens.concat(sup.serialize());
                        tokens.push(new TexToken(TexTokenType.ELEMENT, '}'));
                    } else {
                        tokens = tokens.concat(sup.serialize());
                    }
                }
                return tokens;
            }
            case 'control': {
                return [new TexToken(TexTokenType.CONTROL, this.content)];
            }
            default:
                throw new Error('[TexNode.serialize] Unimplemented type: ' + this.type);
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

    public toNode(): TypstNode {
        switch(this.type) {
            case TypstTokenType.TEXT:
                return new TypstNode('text', this.value);
            case TypstTokenType.COMMENT:
                return new TypstNode('comment', this.value);
            case TypstTokenType.SPACE:
            case TypstTokenType.NEWLINE:
                return new TypstNode('whitespace', this.value);
            case TypstTokenType.ELEMENT:
                return new TypstNode('atom', this.value);
            case TypstTokenType.SYMBOL:
                return new TypstNode('symbol', this.value);
            case TypstTokenType.CONTROL: {
                const controlChar = this.value;
                switch (controlChar) {
                    case '':
                    case '_':
                    case '^':
                        return new TypstNode('empty', '');
                    case '&':
                        return new TypstNode('control', '&');
                    case '\\':
                        return new TypstNode('control', '\\');
                    default:
                        throw new Error(`Unexpected control character ${controlChar}`);
                }
            }
            default:
                throw new Error(`Unexpected token type ${this.type}`);
        }
    }

    public toString(): string {
        switch (this.type) {
            case TypstTokenType.TEXT:
                return `"${this.value}"`;
            case TypstTokenType.COMMENT:
                return `//${this.value}`;
            default:
                return this.value;
        }
    }
}

export interface TypstSupsubData {
    base: TypstNode;
    sup?: TypstNode;
    sub?: TypstNode;
}

export type TypstArrayData = TypstNode[][];

type TypstNodeType = 'atom' | 'symbol' | 'text' | 'control' | 'comment' | 'whitespace'
            | 'empty' | 'group' | 'supsub' | 'funcCall' | 'align' | 'matrix' | 'unknown';


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
