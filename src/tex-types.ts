export enum TexTokenType {
    EMPTY,
    ELEMENT,
    COMMAND,
    LITERAL,
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
            case TexTokenType.COMMENT:
                return "%" + this.value;
            default:
                return this.value;
        }
    }

    public toNode(): TexNode {
        switch (this.type) {
            case TexTokenType.EMPTY:
            case TexTokenType.ELEMENT:
            case TexTokenType.LITERAL:
            case TexTokenType.COMMENT:
            case TexTokenType.SPACE:
            case TexTokenType.NEWLINE:
            case TexTokenType.COMMAND:
            case TexTokenType.CONTROL:
                return new TexNode('terminal', this);
            case TexTokenType.UNKNOWN:
            default:
                throw new Error(`Unknown token type: ${this.type}`);
        }
    }

    public static readonly EMPTY = new TexToken(TexTokenType.EMPTY, '');
}


export interface TexSupsubData {
    base: TexNode;
    sup: TexNode | null;
    sub: TexNode | null;
}

export type TexSqrtData = TexNode;

export type TexArrayData = TexNode[][];

/**
 * element: 0-9, a-z, A-Z, punctuations such as +-/*,:; etc.
 * symbol: LaTeX macro with no parameter. e.g. \sin \cos \int \sum
 * funcCall: LaTeX macro with 1 or more parameters. e.g. \sqrt{3} \log{x} \exp{x} \frac{1}{2}
 * text: text enclosed by braces. e.g. \text{hello world}
 * empty: special type when something is empty. e.g. the base of _{a} or ^{a}
 * whitespace: space, tab, newline
 */
type TexNodeType = 'terminal' | 'text' | 'ordgroup' | 'supsub'
             | 'funcCall' | 'leftright' | 'beginend' | 'unknownMacro';


function apply_escape_if_needed(c: string) {
    if (['{', '}', '%'].includes(c)) {
        return '\\' + c;
    }
    return c;
}


export class TexNode {
    type: TexNodeType;
    head: TexToken;
    args?: TexNode[];
    // For type="sqrt", it's additional argument wrapped square bracket. e.g. 3 in \sqrt[3]{x}
    // For type="supsub", it's base, sup, and sub.
    // For type="beginend", it's the 2-dimensional matrix.
    data?: TexSqrtData | TexSupsubData | TexArrayData;

    constructor(type: TexNodeType, head: TexToken | null, args?: TexNode[],
            data?: TexSqrtData | TexSupsubData | TexArrayData) {
        this.type = type;
        this.head = head ? head : TexToken.EMPTY;
        this.args = args;
        this.data = data;
    }

    // Note that this is only shallow equality.
    public eq(other: TexNode): boolean {
        return this.type === other.type && this.head.eq(other.head);
    }

    public serialize(): TexToken[] {
        switch (this.type) {
            case 'terminal': {
                switch(this.head.type) {
                    case TexTokenType.EMPTY:
                        return [];
                    case TexTokenType.ELEMENT: {
                        let c = this.head.value;
                        c = apply_escape_if_needed(c);
                        return [new TexToken(TexTokenType.ELEMENT, c)];
                    }
                    case TexTokenType.COMMAND:
                    case TexTokenType.LITERAL:
                    case TexTokenType.COMMENT:
                    case TexTokenType.CONTROL: {
                        return [this.head];
                    }
                    case TexTokenType.SPACE:
                    case TexTokenType.NEWLINE: {
                        const tokens: TexToken[] = [];
                        for (const c of this.head.value) {
                            const token_type = c === ' ' ? TexTokenType.SPACE : TexTokenType.NEWLINE;
                            tokens.push(new TexToken(token_type, c));
                        }
                        return tokens;
                    }
                    default:
                        throw new Error(`Unknown terminal token type: ${this.head.type}`);
                }
            }
            case 'text':
                return [
                    new TexToken(TexTokenType.COMMAND, '\\text'),
                    new TexToken(TexTokenType.ELEMENT, '{'),
                    this.head,
                    new TexToken(TexTokenType.ELEMENT, '}'),
                ];
            case 'ordgroup': {
                return this.args!.map((n) => n.serialize()).flat();
            }
            case 'leftright': {
                let tokens = this.args!.map((n) => n.serialize()).flat();
                tokens.splice(0, 0, new TexToken(TexTokenType.COMMAND, '\\left'));
                tokens.splice(tokens.length - 1, 0, new TexToken(TexTokenType.COMMAND, '\\right'));

                return tokens;
            }
            case 'funcCall': {
                let tokens: TexToken[] = [];
                tokens.push(this.head);

                // special hook for \sqrt
                if (this.head.value === '\\sqrt' && this.data) {
                    tokens.push(new TexToken(TexTokenType.ELEMENT, '['));
                    tokens = tokens.concat((this.data! as TexSqrtData).serialize());
                    tokens.push(new TexToken(TexTokenType.ELEMENT, ']'));
                }

                for (const arg of this.args!) {
                    tokens.push(new TexToken(TexTokenType.ELEMENT, '{'));
                    tokens = tokens.concat(arg.serialize());
                    tokens.push(new TexToken(TexTokenType.ELEMENT, '}'));
                }

                return tokens;
            }
            case 'supsub': {
                let tokens: TexToken[] = [];
                const { base, sup, sub } = this.data! as TexSupsubData;
                tokens = tokens.concat(base.serialize());

                // TODO: should return true for more cases e.g. a_{\theta} instead of a_\theta
                function should_wrap_in_braces(node: TexNode): boolean {
                    if(node.type === 'ordgroup' || node.type === 'supsub' || node.head.type === TexTokenType.EMPTY) {
                        return true;
                    } else if(node.head.type === TexTokenType.ELEMENT && /\d+(\.\d+)?/.test(node.head.value) && node.head.value.length > 1) {
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
            case 'beginend': {
                let tokens: TexToken[] = [];
                const matrix = this.data as TexArrayData;
                // tokens.push(new TexToken(TexTokenType.COMMAND, `\\begin{${this.content}}`));
                tokens.push(new TexToken(TexTokenType.COMMAND, '\\begin'));
                tokens.push(new TexToken(TexTokenType.ELEMENT, '{'));
                tokens = tokens.concat(this.head);
                tokens.push(new TexToken(TexTokenType.ELEMENT, '}'));
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
                // tokens.push(new TexToken(TexTokenType.COMMAND, `\\end{${this.content}}`));
                tokens.push(new TexToken(TexTokenType.COMMAND, '\\end'));
                tokens.push(new TexToken(TexTokenType.ELEMENT, '{'));
                tokens = tokens.concat(this.head);
                tokens.push(new TexToken(TexTokenType.ELEMENT, '}'));
                return tokens;
            }
            default:
                throw new Error('[TexNode.serialize] Unimplemented type: ' + this.type);
        }
    }

    // Note: toString() is expensive. Do not use it on performance-critical code path.
    public toString(): string {
        /*
        let buffer = '';
        const tokens = this.serialize();
        for (let i = 0; i < tokens.length; i++) {
            buffer = writeTexTokenBuffer(buffer, tokens[i]);
        }
        return buffer;
        */
       return this.serialize().reduce(writeTexTokenBuffer, '');
    }
}

export function writeTexTokenBuffer(buffer: string, token: TexToken): string {
    const str = token.toString();

    let no_need_space = false;
    if (token.type === TexTokenType.SPACE) {
        no_need_space = true;
    } else {
        // putting the first token in clause
        no_need_space ||= /[{\(\[\|]$/.test(buffer);
        // opening a optional [] parameter for a command
        no_need_space ||= /\\\w+$/.test(buffer) && str === '[';
        // putting a punctuation
        no_need_space ||= /^[\.,;:!\?\(\)\]{}_^]$/.test(str);
        no_need_space ||= ['\\{', '\\}'].includes(str);
        // putting a prime
        no_need_space ||= str === "'";
        // putting a subscript or superscript
        no_need_space ||= buffer.endsWith('_') || buffer.endsWith('^');
        // buffer ends with a whitespace
        no_need_space ||= /\s$/.test(buffer);
        // token starts with a space
        no_need_space ||= /^\s/.test(str);
        // buffer is empty
        no_need_space ||= buffer === '';
        // leading sign. e.g. produce "+1" instead of " +1"
        no_need_space ||= /[\(\[{]\s*(-|\+)$/.test(buffer) || buffer === '-' || buffer === '+';
        // "&=" instead of "& ="
        no_need_space ||= buffer.endsWith('&') && str === '=';
    }

    if (!no_need_space) {
        buffer += ' ';
    }

    return buffer + str;
}

/**
 * ATTENTION:
 * Don't use any options except those explicitly documented in
 *   https://github.com/qwinsi/tex2typst/blob/main/docs/api-reference.md
 * Any undocumented options may be not working at present or break in the future!
 */
export interface Tex2TypstOptions {
    nonStrict?: boolean; /** default is true */
    preferShorthands?: boolean; /** default is true */
    keepSpaces?: boolean; /** default is false */
    fracToSlash?: boolean; /** default is true */
    inftyToOo?: boolean; /** default is false */
    optimize?: boolean; /** default is true */
    nonAsciiWrapper?: string; /** default is "" */
    customTexMacros?: { [key: string]: string };
    // TODO: custom typst functions
}
