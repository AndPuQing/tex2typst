import { symbolMap } from "./map";
import { TexNode, TexSupsubData, TexToken, TexTokenType } from "./tex-types";
import { assert } from "./util";
import { array_find } from "./generic";
import { TEX_BINARY_COMMANDS, TEX_UNARY_COMMANDS, tokenize_tex } from "./tex-tokenizer";

const IGNORED_COMMANDS = [
    'bigl', 'bigr',
    'biggl', 'biggr',
    'Bigl', 'Bigr',
    'Biggl', 'Biggr',
];

const EMPTY_NODE: TexNode = TexToken.EMPTY.toNode();

function get_command_param_num(command: string): number {
    if (TEX_UNARY_COMMANDS.includes(command)) {
        return 1;
    } else if (TEX_BINARY_COMMANDS.includes(command)) {
        return 2;
    } else {
        return 0;
    }
}

const LEFT_CURLY_BRACKET: TexToken = new TexToken(TexTokenType.CONTROL, '{');
const RIGHT_CURLY_BRACKET: TexToken = new TexToken(TexTokenType.CONTROL, '}');


const LEFT_SQUARE_BRACKET: TexToken = new TexToken(TexTokenType.ELEMENT, '[');
const RIGHT_SQUARE_BRACKET: TexToken = new TexToken(TexTokenType.ELEMENT, ']');

function eat_whitespaces(tokens: TexToken[], start: number): TexToken[] {
    let pos = start;
    while (pos < tokens.length && [TexTokenType.SPACE, TexTokenType.NEWLINE].includes(tokens[pos].type)) {
        pos++;
    }
    return tokens.slice(start, pos);
}


function eat_parenthesis(tokens: TexToken[], start: number): TexToken | null {
    const firstToken = tokens[start];
    if (firstToken.type === TexTokenType.ELEMENT && ['(', ')', '[', ']', '|', '\\{', '\\}', '.', '\\|'].includes(firstToken.value)) {
        return firstToken;
    } else if (firstToken.type === TexTokenType.COMMAND && ['lfloor', 'rfloor', 'lceil', 'rceil', 'langle', 'rangle'].includes(firstToken.value.slice(1))) {
        return firstToken;
    } else {
        return null;
    }
}

function eat_primes(tokens: TexToken[], start: number): number {
    let pos = start;
    while (pos < tokens.length && tokens[pos].eq(new TexToken(TexTokenType.ELEMENT, "'"))) {
        pos += 1;
    }
    return pos - start;
}


function find_closing_match(tokens: TexToken[], start: number, leftToken: TexToken, rightToken: TexToken): number {
    assert(tokens[start].eq(leftToken));
    let count = 1;
    let pos = start + 1;

    while (count > 0) {
        if (pos >= tokens.length) {
            return -1;
        }
        if (tokens[pos].eq(leftToken)) {
            count += 1;
        } else if (tokens[pos].eq(rightToken)) {
            count -= 1;
        }
        pos += 1;
    }

    return pos - 1;
}


const LEFT_COMMAND: TexToken = new TexToken(TexTokenType.COMMAND, '\\left');
const RIGHT_COMMAND: TexToken = new TexToken(TexTokenType.COMMAND, '\\right');

function find_closing_right_command(tokens: TexToken[], start: number): number {
    return find_closing_match(tokens, start, LEFT_COMMAND, RIGHT_COMMAND);
}


const BEGIN_COMMAND: TexToken = new TexToken(TexTokenType.COMMAND, '\\begin');
const END_COMMAND: TexToken = new TexToken(TexTokenType.COMMAND, '\\end');


function find_closing_end_command(tokens: TexToken[], start: number): number {
    return find_closing_match(tokens, start, BEGIN_COMMAND, END_COMMAND);
}


export class LatexParserError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LatexParserError';
    }
}


type ParseResult = [TexNode, number];

const SUB_SYMBOL:TexToken = new TexToken(TexTokenType.CONTROL, '_');
const SUP_SYMBOL:TexToken = new TexToken(TexTokenType.CONTROL, '^');

export class LatexParser {
    space_sensitive: boolean;
    newline_sensitive: boolean;

    constructor(space_sensitive: boolean = false, newline_sensitive: boolean = true) {
        this.space_sensitive = space_sensitive;
        this.newline_sensitive = newline_sensitive;
    }

    parse(tokens: TexToken[]): TexNode {
        const token_displaystyle = new TexToken(TexTokenType.COMMAND, '\\displaystyle');
        const idx = array_find(tokens, token_displaystyle);
        if (idx === -1) {
            // no \displaystyle, normal execution path
            const [tree, _] = this.parseGroup(tokens, 0, tokens.length);
            return tree;
        } else if (idx === 0) {
            // \displaystyle at the beginning. Wrap the whole thing in \displaystyle
            const [tree, _] = this.parseGroup(tokens, 1, tokens.length);
            return new TexNode('unaryFunc', token_displaystyle, [tree]);
        } else {
            // \displaystyle somewhere in the middle. Split the expression to two parts
            const [tree1, _1] = this.parseGroup(tokens, 0, idx);
            const [tree2, _2] = this.parseGroup(tokens, idx + 1, tokens.length);
            const display = new TexNode('unaryFunc', token_displaystyle, [tree2]);
            return new TexNode('ordgroup', null, [tree1, display]);
        }
    }

    parseGroup(tokens: TexToken[], start: number, end: number): ParseResult {
        const results: TexNode[] = [];
        let pos = start;
        while (pos < end) {
            const [res, newPos] = this.parseNextExpr(tokens, pos);
            pos = newPos;
            if(res.head.type === TexTokenType.SPACE || res.head.type === TexTokenType.NEWLINE) {
                if (!this.space_sensitive && res.head.value.replace(/ /g, '').length === 0) {
                    continue;
                }
                if (!this.newline_sensitive && res.head.value === '\n') {
                    continue;
                }
            }
            if (res.head.eq(new TexToken(TexTokenType.CONTROL, '&'))) {
                throw new LatexParserError('Unexpected & outside of an alignment');
            }
            results.push(res);
        }

        let node: TexNode;
        if (results.length === 1) {
            node = results[0];
        } else {
            node = new TexNode('ordgroup', null, results);
        }
        return [node, end + 1];
    }

    parseNextExpr(tokens: TexToken[], start: number): ParseResult {
        let [base, pos] = this.parseNextExprWithoutSupSub(tokens, start);
        let sub: TexNode | null = null;
        let sup: TexNode | null = null;
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
                    throw new LatexParserError('Double superscript');
                }
            }
        } else if (pos < tokens.length && tokens[pos].eq(SUP_SYMBOL)) {
            [sup, pos] = this.parseNextExprWithoutSupSub(tokens, pos + 1);
            if (eat_primes(tokens, pos) > 0) {
                throw new LatexParserError('Double superscript');
            }
            if (pos < tokens.length && tokens[pos].eq(SUB_SYMBOL)) {
                [sub, pos] = this.parseNextExprWithoutSupSub(tokens, pos + 1);
                if (eat_primes(tokens, pos) > 0) {
                    throw new LatexParserError('Double superscript');
                }
            }
        }

        if (sub !== null || sup !== null || num_prime > 0) {
            const res: TexSupsubData = { base, sup: null, sub: null };
            if (sub) {
                res.sub = sub;
            }
            if (num_prime > 0) {
                res.sup = new TexNode('ordgroup', null, []);
                for (let i = 0; i < num_prime; i++) {
                    res.sup.args!.push(new TexToken(TexTokenType.ELEMENT, "'").toNode());
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
            return [new TexNode('supsub', null, [], res), pos];
        } else {
            return [base, pos];
        }
    }

    parseNextExprWithoutSupSub(tokens: TexToken[], start: number): ParseResult {
        if (start >= tokens.length) {
            return [EMPTY_NODE, start];
        }
        const firstToken = tokens[start];
        switch (firstToken.type) {
            case TexTokenType.ELEMENT:
            case TexTokenType.LITERAL:
            case TexTokenType.COMMENT:
            case TexTokenType.SPACE:
            case TexTokenType.NEWLINE:
                return [firstToken.toNode(), start + 1];
            case TexTokenType.COMMAND:
                const commandName = firstToken.value.slice(1);
                if (IGNORED_COMMANDS.includes(commandName)) {
                    return this.parseNextExprWithoutSupSub(tokens, start + 1);
                }
                if (firstToken.eq(BEGIN_COMMAND)) {
                    return this.parseBeginEndExpr(tokens, start);
                } else if (firstToken.eq(LEFT_COMMAND)) {
                    return this.parseLeftRightExpr(tokens, start);
                } else {
                    return this.parseCommandExpr(tokens, start);
                }
            case TexTokenType.CONTROL:
                const controlChar = firstToken.value;
                switch (controlChar) {
                    case '{':
                        const posClosingBracket = find_closing_match(tokens, start, LEFT_CURLY_BRACKET, RIGHT_CURLY_BRACKET);
                        if(posClosingBracket === -1) {
                            throw new LatexParserError("Unmatched '{'");
                        }
                        return this.parseGroup(tokens, start + 1, posClosingBracket);
                    case '}':
                        throw new LatexParserError("Unmatched '}'");
                    case '\\\\':
                    case '\\!':
                    case '\\,':
                    case '\\:':
                    case '\\;':
                        return [firstToken.toNode(), start + 1];
                    case '\\ ':
                        return [firstToken.toNode(), start + 1];
                    case '_':
                    case '^':
                        return [ EMPTY_NODE, start];
                    case '&':
                        return [firstToken.toNode(), start + 1];
                    default:
                        throw new LatexParserError('Unknown control sequence');
                }
            default:
                throw new LatexParserError('Unknown token type');
        }
    }

    parseCommandExpr(tokens: TexToken[], start: number): ParseResult {
        assert(tokens[start].type === TexTokenType.COMMAND);

        const command_token = tokens[start];
        const command = command_token.value; // command name starts with a \

        let pos = start + 1;

        if (['left', 'right', 'begin', 'end'].includes(command.slice(1))) {
            throw new LatexParserError('Unexpected command: ' + command);
        }


        const paramNum = get_command_param_num(command.slice(1));
        switch (paramNum) {
            case 0:
                if (!symbolMap.has(command.slice(1))) {
                    return [new TexNode('unknownMacro', command_token), pos];
                }
                return [command_token.toNode(), pos];
            case 1: {
                // TODO: JavaScript gives undefined instead of throwing an error when accessing an index out of bounds,
                // so index checking like this should be everywhere. This is rough.
                if(pos >= tokens.length) {
                    throw new LatexParserError('Expecting argument for ' + command);
                }
                if (command === '\\sqrt' && pos < tokens.length && tokens[pos].eq(LEFT_SQUARE_BRACKET)) {
                    const posLeftSquareBracket = pos;
                    const posRightSquareBracket = find_closing_match(tokens, pos, LEFT_SQUARE_BRACKET, RIGHT_SQUARE_BRACKET);
                    if (posRightSquareBracket === -1) {
                        throw new LatexParserError('No matching right square bracket for [');
                    }
                    const [exponent, _] = this.parseGroup(tokens, posLeftSquareBracket + 1, posRightSquareBracket);
                    const [arg1, newPos] = this.parseNextArg(tokens, posRightSquareBracket + 1);
                    return [new TexNode('unaryFunc', command_token, [arg1], exponent), newPos];
                } else if (command === '\\text') {
                    if (pos + 2 >= tokens.length) {
                        throw new LatexParserError('Expecting content for \\text command');
                    }
                    assert(tokens[pos].eq(LEFT_CURLY_BRACKET));
                    assert(tokens[pos + 1].type === TexTokenType.LITERAL);
                    assert(tokens[pos + 2].eq(RIGHT_CURLY_BRACKET));
                    const literal = tokens[pos + 1];
                    return [new TexNode('text', literal), pos + 3];
                }
                let [arg1, newPos] = this.parseNextArg(tokens, pos);
                return [new TexNode('unaryFunc', command_token, [arg1]), newPos];
            }
            case 2: {
                const [arg1, pos1] = this.parseNextArg(tokens, pos);
                const [arg2, pos2] = this.parseNextArg(tokens, pos1);
                return [new TexNode('binaryFunc', command_token, [arg1, arg2]), pos2];
            }
            default:
                throw new Error( 'Invalid number of parameters');
        }
    }

    /*
    Extract a non-space argument from the token stream.
    So that `\frac{12} 3` is parsed as
        TexNode{ type: 'binaryFunc', content: '\frac', args: [ELEMENT_12, ELEMENT_3] }
        rather than
        TexNode{ type: 'binaryFunc', content: '\frac', args: [ELEMENT_12, SPACE] }, ELEMENT_3
    */
    parseNextArg(tokens: TexToken[], start: number): ParseResult {
        let pos = start;
        let arg: TexNode | null = null;
        while (pos < tokens.length) {
            let node: TexNode;
            [node, pos] = this.parseNextExprWithoutSupSub(tokens, pos);
            if (!(node.head.type === TexTokenType.SPACE || node.head.type === TexTokenType.NEWLINE)) {
                arg = node;
                break;
            }
        }
        if (arg === null) {
            throw new LatexParserError('Expecting argument but token stream ended');
        }
        return [arg, pos];
    }

    parseLeftRightExpr(tokens: TexToken[], start: number): ParseResult {
        assert(tokens[start].eq(LEFT_COMMAND));

        let pos = start + 1;
        pos += eat_whitespaces(tokens, pos).length;

        if (pos >= tokens.length) {
            throw new LatexParserError('Expecting delimiter after \\left');
        }

        const leftDelimiter = eat_parenthesis(tokens, pos);
        if (leftDelimiter === null) {
            throw new LatexParserError('Invalid delimiter after \\left');
        }
        pos++;
        const exprInsideStart = pos;
        const idx = find_closing_right_command(tokens, start);
        if (idx === -1) {
            throw new LatexParserError('No matching \\right');
        }
        const exprInsideEnd = idx;
        pos = idx + 1;

        pos += eat_whitespaces(tokens, pos).length;
        if (pos >= tokens.length) {
            throw new LatexParserError('Expecting \\right after \\left');
        }

        const rightDelimiter = eat_parenthesis(tokens, pos);
        if (rightDelimiter === null) {
            throw new LatexParserError('Invalid delimiter after \\right');
        }
        pos++;

        const [body, _] = this.parseGroup(tokens, exprInsideStart, exprInsideEnd);
        const args: TexNode[] = [
            leftDelimiter.toNode(),
            body,
            rightDelimiter.toNode()
        ]
        const res = new TexNode('leftright', null, args);
        return [res, pos];
    }

    parseBeginEndExpr(tokens: TexToken[], start: number): ParseResult {
        assert(tokens[start].eq(BEGIN_COMMAND));

        let pos = start + 1;
        assert(tokens[pos].eq(LEFT_CURLY_BRACKET));
        assert(tokens[pos + 1].type === TexTokenType.LITERAL);
        assert(tokens[pos + 2].eq(RIGHT_CURLY_BRACKET));
        const envName = tokens[pos + 1].value;
        pos += 3;


        const args: TexNode[] = [];
        if(['array', 'subarray'].includes(envName)) {
            pos += eat_whitespaces(tokens, pos).length;
            const [arg, newPos] = this.parseNextArg(tokens, pos);
            args.push(arg);
            pos = newPos;
        }

        pos += eat_whitespaces(tokens, pos).length; // ignore whitespaces and '\n' after \begin{envName}


        const exprInsideStart = pos;

        const endIdx = find_closing_end_command(tokens, start);
        if (endIdx === -1) {
            throw new LatexParserError('No matching \\end');
        }
        const exprInsideEnd = endIdx;
        pos = endIdx + 1;

        assert(tokens[pos].eq(LEFT_CURLY_BRACKET));
        assert(tokens[pos + 1].type === TexTokenType.LITERAL);
        assert(tokens[pos + 2].eq(RIGHT_CURLY_BRACKET));
        if (tokens[pos + 1].value !== envName) {
            throw new LatexParserError('Mismatched \\begin and \\end environments');
        }
        pos += 3;

        const exprInside = tokens.slice(exprInsideStart, exprInsideEnd);
        // ignore spaces and '\n' before \end{envName}
        while(exprInside.length > 0 && [TexTokenType.SPACE, TexTokenType.NEWLINE].includes(exprInside[exprInside.length - 1].type)) {
            exprInside.pop();
        }
        const body = this.parseAligned(exprInside);
        const res = new TexNode('beginend', new TexToken(TexTokenType.LITERAL, envName), args, body);
        return [res, pos];
    }

    parseAligned(tokens: TexToken[]): TexNode[][] {
        let pos = 0;
        const allRows: TexNode[][] = [];
        let row: TexNode[] = [];
        allRows.push(row);
        let group = new TexNode('ordgroup', null, []);
        row.push(group);

        while (pos < tokens.length) {
            const [res, newPos] = this.parseNextExpr(tokens, pos);
            pos = newPos;

            if (res.head.type === TexTokenType.SPACE || res.head.type === TexTokenType.NEWLINE) {
                if (!this.space_sensitive && res.head.value.replace(/ /g, '').length === 0) {
                    continue;
                }
                if (!this.newline_sensitive && res.head.value === '\n') {
                    continue;
                }
            }

            if (res.head.eq(new TexToken(TexTokenType.CONTROL, '\\\\'))) {
                row = [];
                group = new TexNode('ordgroup', null, []);
                row.push(group);
                allRows.push(row);
            } else if (res.head.eq(new TexToken(TexTokenType.CONTROL, '&'))) {
                group = new TexNode('ordgroup', null, []);
                row.push(group);
            } else {
                group.args!.push(res);
            }
        }
        return allRows;
    }
}

// Remove all whitespace before or after _ or ^
function passIgnoreWhitespaceBeforeScriptMark(tokens: TexToken[]): TexToken[] {
    const is_script_mark = (token: TexToken) => token.eq(SUB_SYMBOL) || token.eq(SUP_SYMBOL);
    let out_tokens: TexToken[] = [];
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type === TexTokenType.SPACE && i + 1 < tokens.length && is_script_mark(tokens[i + 1])) {
            continue;
        }
        if (tokens[i].type === TexTokenType.SPACE && i - 1 >= 0 && is_script_mark(tokens[i - 1])) {
            continue;
        }
        out_tokens.push(tokens[i]);
    }
    return out_tokens;
}

// expand custom tex macros
function passExpandCustomTexMacros(tokens: TexToken[], customTexMacros: {[key: string]: string}): TexToken[] {
    let out_tokens: TexToken[] = [];
    for (const token of tokens) {
        if (token.type === TexTokenType.COMMAND && customTexMacros[token.value]) {
            const expanded_tokens = tokenize_tex(customTexMacros[token.value]);
            out_tokens = out_tokens.concat(expanded_tokens);
        } else {
            out_tokens.push(token);
        }
    }
    return out_tokens;
}

export function parseTex(tex: string, customTexMacros: {[key: string]: string}): TexNode {
    const parser = new LatexParser();
    let tokens = tokenize_tex(tex);
    tokens = passIgnoreWhitespaceBeforeScriptMark(tokens);
    tokens = passExpandCustomTexMacros(tokens, customTexMacros);
    return parser.parse(tokens);
}
