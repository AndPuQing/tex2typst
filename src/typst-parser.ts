
import { TypstNode, TypstSupsubData, TypstToken, TypstTokenType } from "./types";
import { assert, isalpha, isdigit } from "./util";

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


export function tokenize_typst(typst: string): TypstToken[] {
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
                } else if (isalpha(firstChar)) {
                    const identifier = eat_identifier_name(typst, pos);
                    const _type = identifier.length === 1 ? TypstTokenType.ELEMENT : TypstTokenType.SYMBOL;
                    token = new TypstToken(_type, identifier);
                } else {
                    token = new TypstToken(TypstTokenType.ELEMENT, firstChar);
                }
                pos += token.value.length;
            }
        }
        tokens.push(token);
    }

    return tokens;
}

export function find_closing_match(tokens: TypstToken[], start: number): number {
    assert(tokens[start].isOneOf([LEFT_PARENTHESES, LEFT_BRACKET, LEFT_CURLY_BRACKET]));
    let count = 1;
    let pos = start + 1;

    while (count > 0) {
        if (pos >= tokens.length) {
            throw new Error('Unmatched brackets');
        }
        if (tokens[pos].isOneOf([LEFT_PARENTHESES, LEFT_BRACKET, LEFT_CURLY_BRACKET])) {
            count += 1;
        } else if (tokens[pos].isOneOf([RIGHT_PARENTHESES, RIGHT_BRACKET, RIGHT_CURLY_BRACKET])) {
            count -= 1;
        }
        pos += 1;
    }

    return pos - 1;
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
const LEFT_PARENTHESES: TypstToken = new TypstToken(TypstTokenType.ELEMENT, '(');
const RIGHT_PARENTHESES: TypstToken = new TypstToken(TypstTokenType.ELEMENT, ')');
const LEFT_BRACKET: TypstToken = new TypstToken(TypstTokenType.ELEMENT, '[');
const RIGHT_BRACKET: TypstToken = new TypstToken(TypstTokenType.ELEMENT, ']');
const LEFT_CURLY_BRACKET: TypstToken = new TypstToken(TypstTokenType.ELEMENT, '{');
const RIGHT_CURLY_BRACKET: TypstToken = new TypstToken(TypstTokenType.ELEMENT, '}');
const COMMA = new TypstToken(TypstTokenType.ELEMENT, ',');
const SINGLE_SPACE = new TypstToken(TypstTokenType.SPACE, ' ');

export class TypstParser {
    space_sensitive: boolean;
    newline_sensitive: boolean;

    constructor(space_sensitive: boolean = true, newline_sensitive: boolean = true) {
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
            }
            results.push(res);
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
            [sub, pos] = this.parseSupOrSub(tokens, pos + 1);
            num_prime += eat_primes(tokens, pos);
            pos += num_prime;
            if (pos < tokens.length && tokens[pos].eq(SUP_SYMBOL)) {
                [sup, pos] = this.parseNextExprWithoutSupSub(tokens, pos + 1);
                if (eat_primes(tokens, pos) > 0) {
                    throw new TypstParserError('Double superscript');
                }
            }
        } else if (pos < tokens.length && tokens[pos].eq(SUP_SYMBOL)) {
            [sup, pos] = this.parseSupOrSub(tokens, pos + 1);
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

    parseSupOrSub(tokens: TypstToken[], start: number): TypstParseResult {
        if(tokens[start].eq(LEFT_PARENTHESES)) {
            const end = find_closing_match(tokens, start);
            let node = new TypstNode('group', '', []);
            let pos = start + 1;
            while(pos < end) {
                let [res, newPos] = this.parseNextExpr(tokens, pos);
                pos = newPos;
                node.args!.push(res);
            }
            if (node.args!.length === 0) {
                node = TYPST_EMPTY_NODE;
            } else if (node.args!.length === 1) {
                node = node.args![0];
            }
            return [node, end + 1];
        } else {
            return this.parseNextExprWithoutSupSub(tokens, start);
        }
    }

    parseNextExprWithoutSupSub(tokens: TypstToken[], start: number): TypstParseResult {
        const firstToken = tokens[start];
        const tokenType = firstToken.type;
        switch (tokenType) {
            case TypstTokenType.TEXT:
                return [new TypstNode('text', firstToken.value), start + 1];
            case TypstTokenType.COMMENT:
                return [TYPST_EMPTY_NODE, start + 1];
            case TypstTokenType.SPACE:
            case TypstTokenType.NEWLINE:
                return [new TypstNode('whitespace', firstToken.value), start + 1];
            case TypstTokenType.ELEMENT:
            case TypstTokenType.SYMBOL: {
                if (start + 1 < tokens.length && tokens[start + 1].eq(LEFT_PARENTHESES)) {
                    const [args, newPos] = this.parseArguments(tokens, start + 1);
                    const func_call = new TypstNode('funcCall', firstToken.value);
                    func_call.args = args;
                    return [func_call, newPos];
                } else {
                    const identifier_type = tokenType === TypstTokenType.ELEMENT ? 'atom' : 'symbol';
                    return [new TypstNode(identifier_type, firstToken.value), start + 1];
                }
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

    parseArguments(tokens: TypstToken[], start: number): [TypstNode[], number] {
        const end = find_closing_match(tokens, start);
        
        const args: TypstNode[] = [];
        let pos = start + 1;
        while (pos < end) {
            let arg = new TypstNode('group', '', []);

            while(pos < end) {
                if(tokens[pos].eq(COMMA)) {
                    pos += 1;
                    break;
                } else if(tokens[pos].eq(SINGLE_SPACE)) {
                    pos += 1;
                    continue;
                }
                const [argItem, newPos] = this.parseNextExpr(tokens, pos);
                pos = newPos;
                arg.args!.push(argItem);
            }

            if(arg.args!.length === 0) {
                arg = TYPST_EMPTY_NODE;
            } else if (arg.args!.length === 1) {
                arg = arg.args![0];
            }
            args.push(arg);
        }
        return [args, end + 1];
    }
}

export function parseTypst(typst: string): TypstNode {
    const parser = new TypstParser();
    let tokens = tokenize_typst(typst);
    return parser.parse(tokens);
}