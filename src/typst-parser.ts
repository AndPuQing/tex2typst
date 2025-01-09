
import { assert } from "console";
import { TypstNode, TypstSupsubData, TypstToken, TypstTokenType } from "./types";
import { isalpha, isdigit } from "./util";
import { reverseSymbolMap } from "./map";

const TYPST_UNARY_FUNCTIONS: string[] = [
    'sqrt',
    'bold',
];

const TYPST_BINARY_FUNCTIONS: string[] = [
    'frac',
    'root',
];

function eat_primes(tokens: TypstToken[], start: number): number {
    let pos = start;
    while (pos < tokens.length && tokens[pos].eq(new TypstToken(TypstTokenType.ELEMENT, "'"))) {
        pos += 1;
    }
    return pos - start;
}


function eat_identifier_name(typst: string, start: number): string {
    let pos = start;
    while (pos < typst.length && (isalpha(typst[pos]) || (typst[pos] === '.'))) {
        pos += 1;
    }
    return typst.substring(start, pos);
}


const TYPST_EMPTY_NODE = new TypstNode('empty', '');

function get_function_param_num(identifier: string): number {
    if (TYPST_UNARY_FUNCTIONS.includes(identifier)) {
        return 1;
    } else if (TYPST_BINARY_FUNCTIONS.includes(identifier)) {
        return 2;
    } else {
        return 0;
    }
}

function tokenize_typst(typst: string): TypstToken[] {
    const tokens: TypstToken[] = [];

    let pos = 0;

    while (pos < typst.length) {
        const firstChar = typst[pos];
        let token: TypstToken;
        switch (firstChar) {
            case '_':
            case '^':
            case '&':
                token = new TypstToken(TypstTokenType.CONTROL, firstChar);
                pos++;
                break;
            case '\n':
                token = new TypstToken(TypstTokenType.NEWLINE, firstChar);
                pos++;
                break;
            case '\r': {
                if (pos + 1 < typst.length && typst[pos + 1] === '\n') {
                    token = new TypstToken(TypstTokenType.NEWLINE, '\n');
                    pos += 2;
                } else {
                    token = new TypstToken(TypstTokenType.NEWLINE, '\n');
                    pos++;
                }
                break;
            }
            case ' ': {
                let newPos = pos;
                while (newPos < typst.length && typst[newPos] === ' ') {
                    newPos++;
                }
                token = new TypstToken(TypstTokenType.SPACE, typst.substring(pos, newPos));
                pos = newPos;
                break;
            }
            case '/': {
                if (pos < typst.length && typst[pos + 1] === '/') {
                    token = new TypstToken(TypstTokenType.COMMENT, '//');
                    pos += 2;
                } else {
                    let newPos = pos + 1;
                    while (newPos < typst.length && typst[newPos] !== '\n') {
                        newPos += 1;
                    }
                    token = new TypstToken(TypstTokenType.COMMENT, typst.slice(pos + 1, newPos));
                    pos = newPos;
                    break;
                }
            }
            case '\\': {
                if (pos + 1 >= typst.length) {
                    throw new Error('Expecting a character after \\');
                }
                const firstTwoChars = typst.substring(pos, pos + 2);
                if (['\\$', '\\&', '\\#', '\\_'].includes(firstTwoChars)) {
                    token = new TypstToken(TypstTokenType.ELEMENT, firstTwoChars);
                    pos += 2;
                } else if (firstTwoChars === '\\\n') {
                    token = new TypstToken(TypstTokenType.CONTROL, '\\');
                    pos += 1;

                } else {
                    // this backslash is dummy and will be ignored in later stages
                    token = new TypstToken(TypstTokenType.CONTROL, '');
                    pos++;
                }
                break;
            }
            case '"': {
                let newPos = pos + 1;
                while (newPos < typst.length) {
                    if (typst[newPos] === '"' && typst[newPos - 1] !== '\\') {
                        break;
                    }
                    newPos++;
                }
                let text = typst.substring(pos + 1, newPos);
                // replace all escape characters with their actual characters
                const chars = ['"', '\\'];
                for (const char of chars) {
                    text = text.replaceAll('\\' + char, char);
                }
                token = new TypstToken(TypstTokenType.TEXT, text);
                pos = newPos + 1;
                break;
            }
            default: {
                if (isdigit(firstChar)) {
                    let newPos = pos;
                    while (newPos < typst.length && isdigit(typst[newPos])) {
                        newPos += 1;
                    }
                    token = new TypstToken(TypstTokenType.ELEMENT, typst.slice(pos, newPos));
                } else if ('+-*/=\'<>!.,;?()[]|'.includes(firstChar)) {
                    token = new TypstToken(TypstTokenType.ELEMENT, firstChar)
                } else {
                    token = new TypstToken(TypstTokenType.SYMBOL, eat_identifier_name(typst, pos));
                }
                pos += token.value.length;
            }
        }
        tokens.push(token);

    }


    return tokens;
}


export class TypstParserError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TypstParserError';
    }
}


type TypstParseResult = [TypstNode, number];

const SUB_SYMBOL: TypstToken = new TypstToken(TypstTokenType.CONTROL, '_');
const SUP_SYMBOL: TypstToken = new TypstToken(TypstTokenType.CONTROL, '^');

class TypstParser {
    space_sensitive: boolean;
    newline_sensitive: boolean;

    constructor(space_sensitive: boolean = false, newline_sensitive: boolean = true) {
        this.space_sensitive = space_sensitive;
        this.newline_sensitive = newline_sensitive;
    }

    parse(tokens: TypstToken[]): TypstNode {
        const results: TypstNode[] = [];
        let pos = 0;

        while (pos < tokens.length) {
            const [res, newPos] = this.parseNextExpr(tokens, pos);
            pos = newPos;
            if (res.type === 'whitespace') {
                if (!this.space_sensitive && res.content.replace(/ /g, '').length === 0) {
                    continue;
                }
                if (!this.newline_sensitive && res.content === '\n') {
                    continue;
                }
                results.push(res);
            }
        }

        if (results.length === 0) {
            return TYPST_EMPTY_NODE;
        } else if (results.length === 1) {
            return results[0];
        } else {
            return new TypstNode('group', '', results);
        }
    }

    parseNextExpr(tokens: TypstToken[], start: number): TypstParseResult {
        let [base, pos] = this.parseNextExprWithoutSupSub(tokens, start);
        let sub: TypstNode | null = null;
        let sup: TypstNode | null = null;
        let num_prime = 0;

        num_prime += eat_primes(tokens, pos);
        pos += num_prime;
        if (pos < tokens.length && tokens[pos].eq(SUB_SYMBOL)) {
            [sub, pos] = this.parseNextExprWithoutSupSub(tokens, pos + 1);
            num_prime += eat_primes(tokens, pos);
            pos += num_prime;
            if (pos < tokens.length && tokens[pos].eq(SUP_SYMBOL)) {
                [sup, pos] = this.parseNextExprWithoutSupSub(tokens, pos + 1);
                if (eat_primes(tokens, pos) > 0) {
                    throw new TypstParserError('Double superscript');
                }
            }
        } else if (pos < tokens.length && tokens[pos].eq(SUP_SYMBOL)) {
            [sup, pos] = this.parseNextExprWithoutSupSub(tokens, pos + 1);
            if (eat_primes(tokens, pos) > 0) {
                throw new TypstParserError('Double superscript');
            }
            if (pos < tokens.length && tokens[pos].eq(SUB_SYMBOL)) {
                [sub, pos] = this.parseNextExprWithoutSupSub(tokens, pos + 1);
                if (eat_primes(tokens, pos) > 0) {
                    throw new TypstParserError('Double superscript');
                }
            }
        }

        if (sub !== null || sup !== null || num_prime > 0) {
            const res: TypstSupsubData = { base };
            if (sub) {
                res.sub = sub;
            }
            if (num_prime > 0) {
                res.sup = new TypstNode('group', '',  []);
                for (let i = 0; i < num_prime; i++) {
                    res.sup.args!.push(new TypstNode('atom', "'"));
                }
                if (sup) {
                    res.sup.args!.push(sup);
                }
                if (res.sup.args!.length === 1) {
                    res.sup = res.sup.args![0];
                }
            } else if (sup) {
                res.sup = sup;
            }
            return [new TypstNode('supsub', '', [], res), pos];
        } else {
            return [base, pos];
        }
    }

    parseNextExprWithoutSupSub(tokens: TypstToken[], start: number): TypstParseResult {
        const firstToken = tokens[start];
        const tokenType = firstToken.type;
        switch (tokenType) {
            case TypstTokenType.ELEMENT:
                return [new TypstNode('atom', firstToken.value), start + 1];
            case TypstTokenType.TEXT:
                return [new TypstNode('text', firstToken.value), start + 1];
            case TypstTokenType.COMMENT:
                return [TYPST_EMPTY_NODE, start + 1];
            case TypstTokenType.SPACE:
            case TypstTokenType.NEWLINE:
                return [new TypstNode('whitespace', firstToken.value), start + 1];
            case TypstTokenType.SYMBOL: {
                return this.parseFunctionExpr(tokens, start);
            }
            case TypstTokenType.CONTROL: {
                const controlChar = firstToken.value;
                switch (controlChar) {
                    case '':
                    case '_':
                    case '^':
                        return [TYPST_EMPTY_NODE, start + 1];
                    case '&':
                        return [new TypstNode('control', '&'), start + 1];
                    case '\\':
                        return [new TypstNode('control', '\\'), start + 1];
                    default:
                        throw new TypstParserError(`Unexpected control character ${controlChar}`);
                }
            }
            default:
                throw new TypstParserError(`Unexpected token type ${tokenType}`);
        }
    }

    parseFunctionExpr(tokens: TypstToken[], start: number): TypstParseResult {
        assert(tokens[start].type === TypstTokenType.SYMBOL);

        const identifier = tokens[start].value;

        let pos = start + 1;

        const paramNum = get_function_param_num(identifier);
        switch (paramNum) {
            case 0:
                if (!reverseSymbolMap.has(identifier)) {
                    return [new TypstNode('unknown', identifier), pos];
                }
                return [new TypstNode('symbol', identifier), pos];
            case 1: {
                let [arg1, newPos] = this.parseNextExprWithoutSupSub(tokens, pos);
                return [new TypstNode('unaryFunc', identifier, [arg1]), newPos];
            }
            case 2: {
                let [arg1, pos1] = this.parseNextExprWithoutSupSub(tokens, pos);
                let [arg2, pos2] = this.parseNextExprWithoutSupSub(tokens, pos1);
                return [new TypstNode('binaryFunc', identifier, [arg1, arg2]), pos2];
            }
            default:
                throw new TypstParserError('Invalid number of parameters');
        }
    }
}

export function parseTypst(typst: string): TypstNode {
    const parser = new TypstParser();
    let tokens = tokenize_typst(typst);
    return parser.parse(tokens);
}