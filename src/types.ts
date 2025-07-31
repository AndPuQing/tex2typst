import { array_includes } from "./generic";

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

    // Note that this is only shallow equality.
    public eq(other: TexNode): boolean {
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
            case 'ordgroup': {
                return this.args!.map((n) => n.serialize()).flat();
            }
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

                // TODO: should return true for more cases e.g. a_{\theta} instead of a_\theta
                function should_wrap_in_braces(node: TexNode): boolean {
                    if(node.type === 'ordgroup' || node.type === 'supsub' || node.type === 'empty') {
                        return true;
                    } else if(node.type === 'element' && /\d+(\.\d+)?/.test(node.content) && node.content.length > 1) {
                        // a number with more than 1 digit as a subscript/superscript should be wrapped in braces
                        return true;
                    } else {
                        return false;
                    }
                }

                if (sub) {
                    tokens.push(new TexToken(TexTokenType.CONTROL, '_'));
                    if (should_wrap_in_braces(sub)) {
                        tokens.push(new TexToken(TexTokenType.ELEMENT, '{'));
                        tokens = tokens.concat(sub.serialize());
                        tokens.push(new TexToken(TexTokenType.ELEMENT, '}'));
                    } else {
                        tokens = tokens.concat(sub.serialize());
                    }
                }
                if (sup) {
                    tokens.push(new TexToken(TexTokenType.CONTROL, '^'));
                    if (should_wrap_in_braces(sup)) {
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
            case 'beginend': {
                let tokens: TexToken[] = [];
                const matrix = this.data as TexArrayData;
                tokens.push(new TexToken(TexTokenType.COMMAND, `\\begin{${this.content}}`));
                tokens.push(new TexToken(TexTokenType.NEWLINE, '\n'));
                for (let i = 0; i < matrix.length; i++) {
                    const row = matrix[i];
                    for (let j = 0; j < row.length; j++) {
                        const cell = row[j];
                        tokens = tokens.concat(cell.serialize());
                        if (j !== row.length - 1) {
                            tokens.push(new TexToken(TexTokenType.CONTROL, '&'));
                        }
                    }
                    if (i !== matrix.length - 1) {
                        tokens.push(new TexToken(TexTokenType.CONTROL, '\\\\'));
                    }
                }
                tokens.push(new TexToken(TexTokenType.NEWLINE, '\n'));
                tokens.push(new TexToken(TexTokenType.COMMAND, `\\end{${this.content}}`));
                return tokens;
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
        return array_includes(tokens, this);
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
export interface TypstLrData {
    leftDelim: string | null;
    rightDelim: string | null;
}

type TypstNodeType = 'atom' | 'symbol' | 'text' | 'control' | 'comment' | 'whitespace'
            | 'empty' | 'group' | 'supsub' | 'funcCall' | 'fraction' | 'align' | 'matrix' | 'cases' | 'unknown';

export type TypstPrimitiveValue = string | boolean | null | TypstToken;
export type TypstNamedParams = { [key: string]: TypstPrimitiveValue };

// #none
export const TYPST_NULL: TypstPrimitiveValue = null;
export const TYPST_TRUE: TypstPrimitiveValue = true;
export const TYPST_FALSE: TypstPrimitiveValue = false;

export class TypstNode {
    type: TypstNodeType;
    content: string;
    args?: TypstNode[];
    data?: TypstSupsubData | TypstArrayData | TypstLrData;
    // Some Typst functions accept additional options. e.g. mat() has option "delim", op() has option "limits"
    options?: TypstNamedParams;

    constructor(type: TypstNodeType, content: string, args?: TypstNode[],
            data?: TypstSupsubData | TypstArrayData| TypstLrData) {
        this.type = type;
        this.content = content;
        this.args = args;
        this.data = data;
    }

    public setOptions(options: TypstNamedParams) {
        this.options = options;
    }

    // Note that this is only shallow equality.
    public eq(other: TypstNode): boolean {
        return this.type === other.type && this.content === other.content;
    }

    // whether the node is over high so that if it's wrapped in braces, \left and \right should be used in its TeX form
    // e.g. 1/2 is over high, "2" is not.
    public isOverHigh(): boolean {
        switch (this.type) {
            case 'fraction':
                return true;
            case 'funcCall': {
                if (this.content === 'frac') {
                    return true;
                }
                return this.args!.some((n) => n.isOverHigh());
            }
            case 'group':
                return this.args!.some((n) => n.isOverHigh());
            case 'supsub':
                return (this.data as TypstSupsubData).base.isOverHigh();
            case 'align':
            case 'cases':
            case 'matrix':
                return true;
            default:
                return false;
        }
    }
}

export interface Tex2TypstOptions {
    nonStrict?: boolean; // default is true
    preferTypstIntrinsic?: boolean; // default is true,
    preferShorthands?: boolean; // default is true
    keepSpaces?: boolean; // default is false
    fracToSlash?: boolean; // default is true
    inftyToOo?: boolean; // default is false
    customTexMacros?: { [key: string]: string };
    // TODO: custom typst functions
}
