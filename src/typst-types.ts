import { array_includes } from "./generic";

export enum TypstTokenType {
    NONE,
    SYMBOL,
    ELEMENT,
    LITERAL,
    TEXT,
    COMMENT,
    SPACE,
    CONTROL,
    NEWLINE
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
        switch (this.type) {
            case TypstTokenType.NONE:
            case TypstTokenType.LITERAL:
            case TypstTokenType.TEXT:
            case TypstTokenType.COMMENT:
            case TypstTokenType.SPACE:
            case TypstTokenType.NEWLINE:
            case TypstTokenType.ELEMENT:
            case TypstTokenType.SYMBOL:
                return new TypstNode('terminal', this);
            case TypstTokenType.CONTROL: {
                const controlChar = this.value;
                switch (controlChar) {
                    case '':
                    case '_':
                    case '^':
                        throw new Error(`Should not convert ${controlChar} to a node`);
                    case '&':
                        return new TypstNode('terminal', this);
                    case '\\':
                        return new TypstNode('terminal', this);
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

    public static readonly NONE = new TypstToken(TypstTokenType.NONE, '#none');
}

export interface TypstSupsubData {
    base: TypstNode;
    sup: TypstNode | null;
    sub: TypstNode | null;
}
export type TypstArrayData = TypstNode[][];
export interface TypstLrData {
    leftDelim: string | null;
    rightDelim: string | null;
}

export interface TypstLeftRightData {
    left: string;
    right: string;
}

/**
 * fraction: `1/2`, `(x + y)/2`, `(1+x)/(1-x)`
 * group: `a + 1/3`
 * leftright: `(a + 1/3)`, `[a + 1/3)`
 */
export type TypstNodeType = 'terminal' | 'group' | 'supsub' | 'funcCall' | 'fraction'| 'leftright' | 'align' | 'matrix' | 'cases';

export type TypstNamedParams = { [key: string]: TypstNode; };

export class TypstNode {
    type: TypstNodeType;
    head: TypstToken;
    args?: TypstNode[];
    data?: TypstSupsubData | TypstArrayData | TypstLrData | TypstLeftRightData;
    // Some Typst functions accept additional options. e.g. mat() has option "delim", op() has option "limits"
    options?: TypstNamedParams;

    constructor(type: TypstNodeType, head: TypstToken | null, args?: TypstNode[],
        data?: TypstSupsubData | TypstArrayData | TypstLrData | TypstLeftRightData) {
        this.type = type;
        this.head = head ? head : TypstToken.NONE;
        this.args = args;
        this.data = data;
    }

    public setOptions(options: TypstNamedParams) {
        this.options = options;
    }

    // Note that this is only shallow equality.
    public eq(other: TypstNode): boolean {
        return this.type === other.type && this.head.eq(other.head);
    }

    // whether the node is over high so that if it's wrapped in braces, \left and \right should be used in its TeX form
    // e.g. 1/2 is over high, "2" is not.
    public isOverHigh(): boolean {
        switch (this.type) {
            case 'fraction':
                return true;
            case 'funcCall': {
                if (this.head.value === 'frac') {
                    return true;
                }
                return this.args!.some((n) => n.isOverHigh());
            }
            case 'leftright':
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

    public toString(): string {
        if (this.type !== 'terminal') {
            throw new Error(`Unimplemented toString() for non-terminal`);
        }
        return this.head.toString();
    }
}


