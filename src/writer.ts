import { symbolMap } from "./map";
import { TexNode, TexSqrtData, TexSupsubData, TypstNode, TypstSupsubData, TypstToken, TypstTokenType } from "./types";


// symbols that are supported by Typst but not by KaTeX
const TYPST_INTRINSIC_SYMBOLS = [
    'dim',
    'id',
    'im',
    'mod',
    'Pr',
    'sech',
    'csch',
    // 'sgn
];


function is_delimiter(c: TypstNode): boolean {
    return c.type === 'atom' && ['(', ')', '[', ']', '{', '}', '|', '⌊', '⌋', '⌈', '⌉'].includes(c.content);
}


// \overset{X}{Y} -> op(Y, limits: #true)^X
// and with special case \overset{\text{def}}{=} -> eq.def
function convert_overset(node: TexNode): TypstNode {
    const [sup, base] = node.args!;

    const is_def = (n: TexNode): boolean => {
        if (n.eq_shallow(new TexNode('text', 'def'))) {
            return true;
        }
        // \overset{def}{=} is also considered as eq.def
        if (n.type === 'ordgroup' && n.args!.length === 3) {
            const [a1, a2, a3] = n.args!;
            const d = new TexNode('element', 'd');
            const e = new TexNode('element', 'e');
            const f = new TexNode('element', 'f');
            if (a1.eq_shallow(d) && a2.eq_shallow(e) && a3.eq_shallow(f)) {
                return true;
            }
        }
        return false;
    };
    const is_eq = (n: TexNode): boolean => n.eq_shallow(new TexNode('element', '='));
    if (is_def(sup) && is_eq(base)) {
        return new TypstNode('symbol', 'eq.def');
    }
    const op_call = new TypstNode(
        'unaryFunc',
        'op',
        [convertTree(base)]
    );
    op_call.setOptions({ limits: '#true' });
    return new TypstNode(
        'supsub',
        '',
        [],
        {
            base: op_call,
            sup: convertTree(sup),
        }
    );
}

const TYPST_LEFT_PARENTHESIS: TypstToken = new TypstToken(TypstTokenType.ELEMENT, '(');
const TYPST_RIGHT_PARENTHESIS: TypstToken = new TypstToken(TypstTokenType.ELEMENT, ')');
const TYPST_COMMA: TypstToken = new TypstToken(TypstTokenType.ELEMENT, ',');
const TYPST_NEWLINE: TypstToken = new TypstToken(TypstTokenType.SYMBOL, '\n');

export class TypstWriterError extends Error {
    node: TexNode | TypstNode | TypstToken;

    constructor(message: string, node: TexNode | TypstNode | TypstToken) {
        super(message);
        this.name = "TypstWriterError";
        this.node = node;
    }
}

export class TypstWriter {
    private nonStrict: boolean;
    private preferTypstIntrinsic: boolean;
    private keepSpaces: boolean;

    protected buffer: string = "";
    protected queue: TypstToken[] = [];

    private insideFunctionDepth = 0;

    constructor(nonStrict: boolean, preferTypstIntrinsic: boolean, keepSpaces: boolean) {
        this.nonStrict = nonStrict;
        this.preferTypstIntrinsic = preferTypstIntrinsic;
        this.keepSpaces = keepSpaces;
    }


    private writeBuffer(token: TypstToken) {
        const str = token.value;

        if (str === '') {
            return;
        }

        let no_need_space = false;
        // starting clause
        no_need_space ||= /[\(\|]$/.test(this.buffer) && /^\w/.test(str);
        // putting punctuation
        no_need_space ||= /^[}()_^,;!\|]$/.test(str);
        // putting a prime
        no_need_space ||= str === "'";
        // continue a number
        no_need_space ||= /[0-9]$/.test(this.buffer) && /^[0-9]/.test(str);
        // leading sign. e.g. produce "+1" instead of " +1"
        no_need_space ||= /[\(\[{]\s*(-|\+)$/.test(this.buffer) || this.buffer === "-" || this.buffer === "+";
        // new line
        no_need_space ||= str.startsWith('\n');
        // buffer is empty
        no_need_space ||= this.buffer === "";
        // str is starting with a space itself
        no_need_space ||= /^\s/.test(str);
        // other cases
        no_need_space ||= /[\s_^{\(]$/.test(this.buffer);
        if (!no_need_space) {
            this.buffer += ' ';
        }

        this.buffer += str;
    }

    // Serialize a tree of TypstNode into a list of TypstToken
    public serialize(node: TypstNode) {
        switch (node.type) {
            case 'empty':
                break;
            case 'atom': {
                if (node.content === ',' && this.insideFunctionDepth > 0) {
                    this.queue.push(new TypstToken(TypstTokenType.SYMBOL, 'comma'));
                } else {
                    this.queue.push(new TypstToken(TypstTokenType.ELEMENT, node.content));
                }
                break;
            }
            case 'symbol':
                this.queue.push(new TypstToken(TypstTokenType.SYMBOL, node.content));
                break;
            case 'text':
                this.queue.push(new TypstToken(TypstTokenType.TEXT, `"${node.content}"`));
                break;
            case 'comment':
                this.queue.push(new TypstToken(TypstTokenType.COMMENT, `//${node.content}`));
                break;
            case 'whitespace':
                for (const c of node.content) {
                    if (c === ' ') {
                        if (this.keepSpaces) {
                            this.queue.push(new TypstToken(TypstTokenType.SPACE, c));
                        }
                    } else if (c === '\n') {
                        this.queue.push(new TypstToken(TypstTokenType.SYMBOL, c));
                    } else {
                        throw new TypstWriterError(`Unexpected whitespace character: ${c}`, node);
                    }
                }
                break;
            case 'group':
                for (const item of node.args!) {
                    this.serialize(item);
                }
                break;
            case 'supsub': {
                let { base, sup, sub } = node.data as TypstSupsubData;
                this.appendWithBracketsIfNeeded(base);

                let trailing_space_needed = false;
                const has_prime = (sup && sup.type === 'atom' && sup.content === '\'');
                if (has_prime) {
                    // Put prime symbol before '_'. Because $y_1'$ is not displayed properly in Typst (so far)
                    // e.g. 
                    // y_1' -> y'_1
                    // y_{a_1}' -> y'_{a_1}
                    this.queue.push(new TypstToken(TypstTokenType.ELEMENT, '\''));
                    trailing_space_needed = false;
                }
                if (sub) {
                    this.queue.push(new TypstToken(TypstTokenType.ELEMENT, '_'));
                    trailing_space_needed = this.appendWithBracketsIfNeeded(sub);
                }
                if (sup && !has_prime) {
                    this.queue.push(new TypstToken(TypstTokenType.ELEMENT, '^'));
                    trailing_space_needed = this.appendWithBracketsIfNeeded(sup);
                }
                if (trailing_space_needed) {
                    this.queue.push(new TypstToken(TypstTokenType.CONTROL, ' '));
                }
                break;
            }
            case 'binaryFunc': {
                const func_symbol: TypstToken = new TypstToken(TypstTokenType.SYMBOL, node.content);
                const [arg0, arg1] = node.args!;
                this.queue.push(func_symbol);
                this.insideFunctionDepth++;
                this.queue.push(TYPST_LEFT_PARENTHESIS);
                this.serialize(arg0);
                this.queue.push(new TypstToken(TypstTokenType.ELEMENT, ','));
                this.serialize(arg1);
                this.queue.push(TYPST_RIGHT_PARENTHESIS);
                this.insideFunctionDepth--;
                break;
            }
            case 'unaryFunc': {
                const func_symbol: TypstToken = new TypstToken(TypstTokenType.SYMBOL, node.content);
                const arg0 = node.args![0];
                this.queue.push(func_symbol);
                this.insideFunctionDepth++;
                this.queue.push(TYPST_LEFT_PARENTHESIS);
                this.serialize(arg0);
                if (node.options) {
                    for (const [key, value] of Object.entries(node.options)) {
                        this.queue.push(new TypstToken(TypstTokenType.SYMBOL, `, ${key}: ${value}`));
                    }
                }
                this.queue.push(TYPST_RIGHT_PARENTHESIS);
                this.insideFunctionDepth--;
                break;
            }
            case 'align': {
                const matrix = node.data as TypstNode[][];
                matrix.forEach((row, i) => {
                    row.forEach((cell, j) => {
                        if (j > 0) {
                            this.queue.push(new TypstToken(TypstTokenType.ELEMENT, '&'));
                        }
                        this.serialize(cell);
                    });
                    if (i < matrix.length - 1) {
                        this.queue.push(new TypstToken(TypstTokenType.SYMBOL, '\\'));
                    }
                });
                break;
            }
            case 'matrix': {
                const matrix = node.data as TypstNode[][];
                this.queue.push(new TypstToken(TypstTokenType.SYMBOL, 'mat'));
                this.insideFunctionDepth++;
                this.queue.push(TYPST_LEFT_PARENTHESIS);
                if (node.options) {
                    for (const [key, value] of Object.entries(node.options)) {
                        this.queue.push(new TypstToken(TypstTokenType.SYMBOL, `${key}: ${value}, `));
                    }
                }
                matrix.forEach((row, i) => {
                    row.forEach((cell, j) => {
                        // There is a leading & in row
                        // if (cell.type === 'ordgroup' && cell.args!.length === 0) {
                        // this.queue.push(new TypstNode('atom', ','));
                        // return;
                        // }
                        // if (j == 0 && cell.type === 'newline' && cell.content === '\n') {
                        // return;
                        // }
                        this.serialize(cell);
                        // cell.args!.forEach((n) => this.append(n));
                        if (j < row.length - 1) {
                            this.queue.push(new TypstToken(TypstTokenType.ELEMENT, ','));
                        } else {
                            if (i < matrix.length - 1) {
                                this.queue.push(new TypstToken(TypstTokenType.ELEMENT, ';'));
                            }
                        }
                    });
                });
                this.queue.push(TYPST_RIGHT_PARENTHESIS);
                this.insideFunctionDepth--;
                break;
            }
            case 'unknown': {
                if (this.nonStrict) {
                    this.queue.push(new TypstToken(TypstTokenType.SYMBOL, node.content));
                } else {
                    throw new TypstWriterError(`Unknown macro: ${node.content}`, node);
                }
                break;
            }
            default:
                throw new TypstWriterError(`Unimplemented node type to append: ${node.type}`, node);
        }
    }

    private appendWithBracketsIfNeeded(node: TypstNode): boolean {
        let need_to_wrap = ['group', 'supsub', 'empty'].includes(node.type);

        if (node.type === 'group') {
            const first = node.args![0];
            const last = node.args![node.args!.length - 1];
            if (is_delimiter(first) && is_delimiter(last)) {
                need_to_wrap = false;
            }
        }

        if (need_to_wrap) {
            this.queue.push(TYPST_LEFT_PARENTHESIS);
            this.serialize(node);
            this.queue.push(TYPST_RIGHT_PARENTHESIS);
        } else {
            this.serialize(node);
        }

        return !need_to_wrap;
    }

    protected flushQueue() {
        const SOFT_SPACE = new TypstToken(TypstTokenType.CONTROL, ' ');

        // delete soft spaces if they are not needed
        for(let i = 0; i < this.queue.length; i++) {
            let token = this.queue[i];
            if (token.eq(SOFT_SPACE)) {
                if (i === this.queue.length - 1) {
                    this.queue[i].value = '';
                } else if (this.queue[i + 1].isOneOf([TYPST_RIGHT_PARENTHESIS, TYPST_COMMA, TYPST_NEWLINE])) {
                    this.queue[i].value = '';
                }
            }
        }

        this.queue.forEach((token) => {
            this.writeBuffer(token)
        });

        this.queue = [];
    }

    public finalize(): string {
        this.flushQueue();
        const smartFloorPass = function (input: string): string {
            // Use regex to replace all "floor.l xxx floor.r" with "floor(xxx)"
            let res = input.replace(/floor\.l\s*(.*?)\s*floor\.r/g, "floor($1)");
            // Typst disallow "floor()" with empty argument, so add am empty string inside if it's empty.
            res = res.replace(/floor\(\)/g, 'floor("")');
            return res;
        };
        const smartCeilPass = function (input: string): string {
            // Use regex to replace all "ceil.l xxx ceil.r" with "ceil(xxx)"
            let res = input.replace(/ceil\.l\s*(.*?)\s*ceil\.r/g, "ceil($1)");
            // Typst disallow "ceil()" with empty argument, so add an empty string inside if it's empty.
            res = res.replace(/ceil\(\)/g, 'ceil("")');
            return res;
        }
        const smartRoundPass = function (input: string): string {
            // Use regex to replace all "floor.l xxx ceil.r" with "round(xxx)"
            let res = input.replace(/floor\.l\s*(.*?)\s*ceil\.r/g, "round($1)");
            // Typst disallow "round()" with empty argument, so add an empty string inside if it's empty.
            res = res.replace(/round\(\)/g, 'round("")');
            return res;
        }
        const all_passes = [smartFloorPass, smartCeilPass, smartRoundPass];
        for (const pass of all_passes) {
            this.buffer = pass(this.buffer);
        }
        return this.buffer;
    }
}

// Convert a tree of TexNode into a tree of TypstNode
export function convertTree(node: TexNode): TypstNode {
    switch (node.type) {
        case 'empty':
            return new TypstNode('empty', '');
        case 'whitespace':
            return new TypstNode('whitespace', node.content);
        case 'ordgroup':
            return new TypstNode(
                'group',
                '',
                node.args!.map(convertTree),
            );
        case 'element':
            return new TypstNode('atom', convertToken(node.content));
        case 'symbol':
            return new TypstNode('symbol', convertToken(node.content));
        case 'text':
            return new TypstNode('text', node.content);
        case 'comment':
            return new TypstNode('comment', node.content);
        case 'supsub': {
            let { base, sup, sub } = node.data as TexSupsubData;

            // Special logic for overbrace
            if (base && base.type === 'unaryFunc' && base.content === '\\overbrace' && sup) {
                return new TypstNode(
                    'binaryFunc',
                    'overbrace',
                    [convertTree(base.args![0]), convertTree(sup)],
                );
            } else if (base && base.type === 'unaryFunc' && base.content === '\\underbrace' && sub) {
                return new TypstNode(
                    'binaryFunc',
                    'underbrace',
                    [convertTree(base.args![0]), convertTree(sub)],
                );
            }

            const data: TypstSupsubData = {
                base: convertTree(base),
            };
            if (data.base.type === 'empty') {
                data.base = new TypstNode('text', '');
            }

            if (sup) {
                data.sup = convertTree(sup);
            }

            if (sub) {
                data.sub = convertTree(sub);
            }

            return new TypstNode('supsub', '', [], data);
        }
        case 'leftright': {
            const [left, body, right] = node.args!;
            // These pairs will be handled by Typst compiler by default. No need to add lr()
            const group: TypstNode = new TypstNode(
                'group',
                '',
                node.args!.map(convertTree),
            );
            if ([
                "[]", "()", "\\{\\}",
                "\\lfloor\\rfloor",
                "\\lceil\\rceil",
                "\\lfloor\\rceil",
            ].includes(left.content + right.content)) {
                return group;
            }
            return new TypstNode(
                'unaryFunc',
                'lr',
                [group],
            );
        }
        case 'binaryFunc': {
            if (node.content === '\\overset') {
                return convert_overset(node);
            }
            return new TypstNode(
                'binaryFunc',
                convertToken(node.content),
                node.args!.map(convertTree),
            );
        }
        case 'unaryFunc': {
            const arg0 = convertTree(node.args![0]);
            // \sqrt{3}{x} -> root(3, x)
            if (node.content === '\\sqrt' && node.data) {
                const data = convertTree(node.data as TexSqrtData); // the number of times to take the root
                return new TypstNode(
                    'binaryFunc',
                    'root',
                    [data, arg0],
                );
            }
            // \mathbf{a} -> upright(mathbf(a))
            if (node.content === '\\mathbf') {
                const inner: TypstNode = new TypstNode(
                    'unaryFunc',
                    'bold',
                    [arg0],
                );
                return new TypstNode(
                    'unaryFunc',
                    'upright',
                    [inner],
                );
            }
            // \mathbb{R} -> RR
            if (node.content === '\\mathbb' && arg0.type === 'atom' && /^[A-Z]$/.test(arg0.content)) {
                return new TypstNode('symbol', arg0.content + arg0.content);
            }
            // \operatorname{opname} -> op("opname")
            if (node.content === '\\operatorname') {
                const body = node.args!;
                if (body.length !== 1 || body[0].type !== 'text') {
                    throw new TypstWriterError(`Expecting body of \\operatorname to be text but got`, node);
                }
                const text = body[0].content;

                if (TYPST_INTRINSIC_SYMBOLS.includes(text)) {
                    return new TypstNode('symbol', text);
                } else {
                    return new TypstNode(
                        'unaryFunc',
                        'op',
                        [new TypstNode('text', text)],
                    );
                }
            }

            // generic case
            return new TypstNode(
                'unaryFunc',
                convertToken(node.content),
                node.args!.map(convertTree),
            );
        }
        case 'beginend': {
            const matrix = node.data as TexNode[][];
            const data = matrix.map((row) => row.map(convertTree));

            if (node.content!.startsWith('align')) {
                // align, align*, alignat, alignat*, aligned, etc.
                return new TypstNode( 'align', '', [], data);
            } else {
                const res = new TypstNode('matrix', '', [], data);
                res.setOptions({'delim': '#none'});
                return res;
            }
        }
        case 'unknownMacro':
            return new TypstNode('unknown', convertToken(node.content));
        case 'control':
            if (node.content === '\\\\') {
                return new TypstNode('symbol', '\\');
            } else if (node.content === '\\,') {
                return new TypstNode('symbol', 'thin');
            } else {
                throw new TypstWriterError(`Unknown control sequence: ${node.content}`, node);
            }
        default:
            throw new TypstWriterError(`Unimplemented node type: ${node.type}`, node);
    }
}


function convertToken(token: string): string {
    if (/^[a-zA-Z0-9]$/.test(token)) {
        return token;
    } else if (token === '/') {
        return '\\/';
    } else if (token === '\\|') {
        // \| in LaTeX is double vertical bar looks like ||
        return 'parallel';
    } else if (token === '\\\\') {
        return '\\';
    } else if (['\\$', '\\#', '\\&', '\\_'].includes(token)) {
        return token;
    } else if (token.startsWith('\\')) {
        const symbol = token.slice(1);
        if (symbolMap.has(symbol)) {
            return symbolMap.get(symbol)!;
        } else {
            // Fall back to the original macro.
            // This works for \alpha, \beta, \gamma, etc.
            // If this.nonStrict is true, this also works for all unknown macros.
            return symbol;
        }
    }
    return token;
}

