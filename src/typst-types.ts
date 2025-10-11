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
        return new TypstTerminal(this);
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


export interface TypstLeftRightData {
    body: TypstNode;
    left: TypstToken | null;
    right: TypstToken | null;
}

/**
 * fraction: `1/2`, `(x + y)/2`, `(1+x)/(1-x)`
 * group: `a + 1/3`
 * leftright: `(a + 1/3)`, `[a + 1/3)`, `lr(]sum_(x=1)^n])`
 */
export type TypstNodeType = 'terminal' | 'group' | 'supsub' | 'funcCall' | 'fraction'| 'leftright' | 'align' | 'matrix' | 'cases';

export type TypstNamedParams = { [key: string]: TypstNode; };

export abstract class TypstNode {
    readonly type: TypstNodeType;
    head: TypstToken;
    // Some Typst functions accept additional options. e.g. mat() has option "delim", op() has option "limits"
    options?: TypstNamedParams;

    constructor(type: TypstNodeType, head: TypstToken | null) {
        this.type = type;
        this.head = head ? head : TypstToken.NONE;
    }

    // whether the node is over high so that if it's wrapped in braces, \left and \right should be used in its TeX form
    // e.g. 1/2 is over high, "2" is not.
    abstract isOverHigh(): boolean;

    public setOptions(options: TypstNamedParams) {
        this.options = options;
    }

    // Note that this is only shallow equality.
    public eq(other: TypstNode): boolean {
        return this.type === other.type && this.head.eq(other.head);
    }

    public toString(): string {
        throw new Error(`Unimplemented toString() in base class TypstNode`);
    }
}

export class TypstTerminal extends TypstNode {
    constructor(head: TypstToken) {
        super('terminal', head);
    }

    public isOverHigh(): boolean {
        return false;
    }

    public toString(): string {
        return this.head.toString();
    }
}

export class TypstGroup extends TypstNode {
    public items: TypstNode[];
    constructor(items: TypstNode[]) {
        super('group', TypstToken.NONE);
        this.items = items;
    }

    public isOverHigh(): boolean {
        return this.items.some((n) => n.isOverHigh());
    }
}

export class TypstSupsub extends TypstNode {
    public base: TypstNode;
    public sup: TypstNode | null;
    public sub: TypstNode | null;

    constructor(data: TypstSupsubData) {
        super('supsub', TypstToken.NONE);
        this.base = data.base;
        this.sup = data.sup;
        this.sub = data.sub;
    }

    public isOverHigh(): boolean {
        return this.base.isOverHigh();
    }
}

export class TypstFuncCall extends TypstNode {
    public args: TypstNode[];
    constructor(head: TypstToken, args: TypstNode[]) {
        super('funcCall', head);
        this.args = args;
    }

    public isOverHigh(): boolean {
        if (this.head.value === 'frac') {
            return true;
        }
        return this.args.some((n) => n.isOverHigh());
    }
}

export class TypstFraction extends TypstNode {
    public args: TypstNode[];

    constructor(args: TypstNode[]) {
        super('fraction', TypstToken.NONE);
        this.args = args;
    }

    public isOverHigh(): boolean {
        return true;
    }
}


export class TypstLeftright extends TypstNode {
    public body: TypstNode;
    public left: TypstToken | null;
    public right: TypstToken | null;

    constructor(head: TypstToken | null, data: TypstLeftRightData) {
        super('leftright', head);
        this.body = data.body;
        this.left = data.left;
        this.right = data.right;
    }

    public isOverHigh(): boolean {
        return this.body.isOverHigh();
    }
}

export class TypstAlign extends TypstNode {
    public matrix: TypstNode[][];

    constructor(data: TypstNode[][]) {
        super('align', TypstToken.NONE);
        this.matrix = data;
    }

    public isOverHigh(): boolean {
        return true;
    }
}

export class TypstMatrix extends TypstNode {
    public matrix: TypstNode[][];
    constructor(data: TypstNode[][]) {
        super('matrix', TypstToken.NONE);
        this.matrix = data;
    }

    public isOverHigh(): boolean {
        return true;
    }
}

export class TypstCases extends TypstNode {
    public matrix: TypstNode[][];

    constructor(data: TypstNode[][]) {
        super('cases', TypstToken.NONE);
        this.matrix = data;
    }

    public isOverHigh(): boolean {
        return true;
    }
}

