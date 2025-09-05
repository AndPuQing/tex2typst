import { TexNode, TypstNode, TypstPrimitiveValue, TypstSupsubData, TypstToken, TypstTokenType } from "./types";
import { shorthandMap } from "./typst-shorthands";
import { assert } from "./util";

function is_delimiter(c: TypstNode): boolean {
    return c.type === 'atom' && ['(', ')', '[', ']', '{', '}', '|', '⌊', '⌋', '⌈', '⌉'].includes(c.content);
}

const TYPST_LEFT_PARENTHESIS: TypstToken = new TypstToken(TypstTokenType.ELEMENT, '(');
const TYPST_RIGHT_PARENTHESIS: TypstToken = new TypstToken(TypstTokenType.ELEMENT, ')');
const TYPST_COMMA: TypstToken = new TypstToken(TypstTokenType.ELEMENT, ',');
const TYPST_NEWLINE: TypstToken = new TypstToken(TypstTokenType.SYMBOL, '\n');

function typst_primitive_to_string(value: TypstPrimitiveValue) {
    switch (typeof value) {
        case 'string':
            return `"${value}"`;
        case 'number':
            return (value as number).toString();
        case 'boolean':
            return (value as boolean) ? '#true' : '#false';
        default:
            assert(value instanceof TypstNode, 'Not a valid primitive value');
            return (value as TypstNode).content;
    }
}

export class TypstWriterError extends Error {
    node: TexNode | TypstNode | TypstToken;

    constructor(message: string, node: TexNode | TypstNode | TypstToken) {
        super(message);
        this.name = "TypstWriterError";
        this.node = node;
    }
}

export interface TypstWriterOptions {
    nonStrict: boolean;
    preferShorthands: boolean;
    keepSpaces: boolean;
    inftyToOo: boolean;
    optimize: boolean;
}

export class TypstWriter {
    private nonStrict: boolean;
    private preferShorthands: boolean;
    private keepSpaces: boolean;
    private inftyToOo: boolean;
    private optimize: boolean;

    protected buffer: string = "";
    protected queue: TypstToken[] = [];

    private insideFunctionDepth = 0;

    constructor(options: TypstWriterOptions) {
        this.nonStrict = options.nonStrict;
        this.preferShorthands = options.preferShorthands;
        this.keepSpaces = options.keepSpaces;
        this.inftyToOo = options.inftyToOo;
        this.optimize = options.optimize;
    }


    private writeBuffer(token: TypstToken) {
        const str = token.toString();

        if (str === '') {
            return;
        }

        let no_need_space = false;
        // putting the first token in clause
        no_need_space ||= /[\(\[\|]$/.test(this.buffer) && /^\w/.test(str);
        // closing a clause
        no_need_space ||= /^[})\]\|]$/.test(str);
        // putting the opening '(' for a function
        no_need_space ||= /[^=]$/.test(this.buffer) && str === '(';
        // putting punctuation
        no_need_space ||= /^[_^,;!]$/.test(str);
        // putting a prime
        no_need_space ||= str === "'";
        // leading sign. e.g. produce "+1" instead of " +1"
        no_need_space ||= /[\(\[{]\s*(-|\+)$/.test(this.buffer) || this.buffer === "-" || this.buffer === "+";
        // new line
        no_need_space ||= str.startsWith('\n');
        // buffer is empty
        no_need_space ||= this.buffer === "";
        // str is starting with a space itself
        no_need_space ||= /^\s/.test(str);
        // "&=" instead of "& ="
        no_need_space ||= this.buffer.endsWith('&') && str === '=';
        // before or after a slash e.g. "a/b" instead of "a / b"
        no_need_space ||= this.buffer.endsWith('/') || str === '/';
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
            case 'none':
                this.queue.push(new TypstToken(TypstTokenType.NONE, '#none'));
                break;
            case 'atom': {
                if (node.content === ',' && this.insideFunctionDepth > 0) {
                    this.queue.push(new TypstToken(TypstTokenType.SYMBOL, 'comma'));
                } else {
                    this.queue.push(new TypstToken(TypstTokenType.ELEMENT, node.content));
                }
                break;
            }
            case 'symbol': {
                let content = node.content;
                if(this.preferShorthands) {
                    if (shorthandMap.has(content)) {
                        content = shorthandMap.get(content)!;
                    }
                }
                if (this.inftyToOo && content === 'infinity') {
                    content = 'oo';
                }
                this.queue.push(new TypstToken(TypstTokenType.SYMBOL, content));
                break;
            }
            case 'text':
                this.queue.push(new TypstToken(TypstTokenType.TEXT, node.content));
                break;
            case 'comment':
                this.queue.push(new TypstToken(TypstTokenType.COMMENT, node.content));
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
                    // y_{a_1}' -> y'_(a_1)
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
            case 'funcCall': {
                const func_symbol: TypstToken = new TypstToken(TypstTokenType.SYMBOL, node.content);
                this.queue.push(func_symbol);
                if (node.content !== 'lr') {
                    this.insideFunctionDepth++;
                }
                this.queue.push(TYPST_LEFT_PARENTHESIS);
                for (let i = 0; i < node.args!.length; i++) {
                    this.serialize(node.args![i]);
                    if (i < node.args!.length - 1) {
                        this.queue.push(new TypstToken(TypstTokenType.ELEMENT, ','));
                    }
                }
                if (node.options) {
                    for (const [key, value] of Object.entries(node.options)) {
                        const value_str = typst_primitive_to_string(value);
                        this.queue.push(new TypstToken(TypstTokenType.SYMBOL, `, ${key}: ${value_str}`));
                    }
                }
                this.queue.push(TYPST_RIGHT_PARENTHESIS);
                if (node.content !== 'lr') {
                    this.insideFunctionDepth--;
                }
                break;
            }
            case 'fraction': {
                const [numerator, denominator] = node.args!;
                this.appendWithBracketsIfNeeded(numerator);
                this.queue.push(new TypstToken(TypstTokenType.ELEMENT, '/'));
                this.appendWithBracketsIfNeeded(denominator);
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
                        const value_str = typst_primitive_to_string(value);
                        this.queue.push(new TypstToken(TypstTokenType.SYMBOL, `${key}: ${value_str}, `));
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
            case 'cases': {
                const cases = node.data as TypstNode[][];
                this.queue.push(new TypstToken(TypstTokenType.SYMBOL, 'cases'));
                this.insideFunctionDepth++;
                this.queue.push(TYPST_LEFT_PARENTHESIS);
                if (node.options) {
                    for (const [key, value] of Object.entries(node.options)) {
                        const value_str = typst_primitive_to_string(value);
                        this.queue.push(new TypstToken(TypstTokenType.SYMBOL, `${key}: ${value_str}, `));
                    }
                }
                cases.forEach((row, i) => {
                    row.forEach((cell, j) => {
                        this.serialize(cell);
                        if (j < row.length - 1) {
                            this.queue.push(new TypstToken(TypstTokenType.ELEMENT, '&'));
                        } else {
                            if (i < cases.length - 1) {
                                this.queue.push(new TypstToken(TypstTokenType.ELEMENT, ','));
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
        let need_to_wrap = ['group', 'supsub', 'fraction','empty'].includes(node.type);

        if (node.type === 'group') {
            if (node.args!.length === 0) {
                // e.g. TeX `P_{}` converts to Typst `P_()`
                need_to_wrap = true;
            } else {
                const first = node.args![0];
                const last = node.args![node.args!.length - 1];
                if (is_delimiter(first) && is_delimiter(last)) {
                    need_to_wrap = false;
                }
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
        if (this.optimize) {
            const all_passes = [smartFloorPass, smartCeilPass, smartRoundPass];
            for (const pass of all_passes) {
                this.buffer = pass(this.buffer);
            }
        }
        return this.buffer;
    }
}
