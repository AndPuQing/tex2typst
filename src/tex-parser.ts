import { symbolMap } from "./map";
import { TexNode, TexSupsubData, TexToken, TexTokenType } from "./types";
import { isalpha, isdigit, assert } from "./util";


const UNARY_COMMANDS = [
    'sqrt',
    'text',

    'bar',
    'bold',
    'boldsymbol',
    'ddot',
    'dot',
    'hat',
    'mathbb',
    'mathbf',
    'mathcal',
    'mathfrak',
    'mathit',
    'mathrm',
    'mathscr',
    'mathsf',
    'mathtt',
    'operatorname',
    'overbrace',
    'overline',
    'pmb',
    'rm',
    'tilde',
    'underbrace',
    'underline',
    'vec',
    'widehat',
    'widetilde',
]

const BINARY_COMMANDS = [
    'frac',
    'tfrac',
    'binom',
    'dbinom',
    'dfrac',
    'tbinom',
    'overset',
]



const EMPTY_NODE: TexNode = new TexNode('empty', '');

function get_command_param_num(command: string): number {
    if (UNARY_COMMANDS.includes(command)) {
        return 1;
    } else if (BINARY_COMMANDS.includes(command)) {
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
    if (firstToken.type === TexTokenType.ELEMENT && ['(', ')', '[', ']', '|', '\\{', '\\}', '.'].includes(firstToken.value)) {
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


function eat_command_name(latex: string, start: number): string {
    let pos = start;
    while (pos < latex.length && isalpha(latex[pos])) {
        pos += 1;
    }
    return latex.substring(start, pos);
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

function find_closing_curly_bracket_char(latex: string, start: number): number {
    assert(latex[start] === '{');
    let count = 1;
    let pos = start + 1;

    while (count > 0) {
        if (pos >= latex.length) {
            throw new LatexParserError('Unmatched curly brackets');
        }
        if(pos + 1 < latex.length && (['\\{', '\\}'].includes(latex.substring(pos, pos + 2)))) {
            pos += 2;
            continue;
        }
        if (latex[pos] === '{') {
            count += 1;
        } else if (latex[pos] === '}') {
            count -= 1;
        }
        pos += 1;
    }

    return pos - 1;
}


export function tokenize(latex: string): TexToken[] {
    const tokens: TexToken[] = [];
    let pos = 0;

    while (pos < latex.length) {
        const firstChar = latex[pos];
        let token: TexToken;
        switch (firstChar) {
            case '%': {
                let newPos = pos + 1;
                while (newPos < latex.length && latex[newPos] !== '\n') {
                    newPos += 1;
                }
                token = new TexToken(TexTokenType.COMMENT, latex.slice(pos + 1, newPos));
                pos = newPos;
                break;
            }
            case '{':
            case '}':
            case '_':
            case '^':
            case '&':
                token = new TexToken(TexTokenType.CONTROL, firstChar);
                pos++;
                break;
            case '\n':
                token = new TexToken(TexTokenType.NEWLINE, firstChar);
                pos++;
                break;
            case '\r': {
                if (pos + 1 < latex.length && latex[pos + 1] === '\n') {
                    token = new TexToken(TexTokenType.NEWLINE, '\n');
                    pos += 2;
                } else {
                    token = new TexToken(TexTokenType.NEWLINE, '\n');
                    pos ++;
                }
                break;
            }
            case ' ': {
                let newPos = pos;
                while (newPos < latex.length && latex[newPos] === ' ') {
                    newPos += 1;
                }
                token = new TexToken(TexTokenType.SPACE, latex.slice(pos, newPos));
                pos = newPos;
                break;
            }
            case '\\': {
                if (pos + 1 >= latex.length) {
                    throw new LatexParserError('Expecting command name after \\');
                }
                const firstTwoChars = latex.slice(pos, pos + 2);
                if (['\\\\', '\\,'].includes(firstTwoChars)) {
                    token = new TexToken(TexTokenType.CONTROL, firstTwoChars);
                } else if (['\\{','\\}', '\\%', '\\$', '\\&', '\\#', '\\_', '\\|'].includes(firstTwoChars)) {
                    // \| is double vertical bar, not the same as just |
                    token = new TexToken(TexTokenType.ELEMENT, firstTwoChars);
                } else {
                    const command = eat_command_name(latex, pos + 1);
                    token = new TexToken(TexTokenType.COMMAND, '\\' + command);
                }
                pos += token.value.length;
                break;
            }
            default: {
                if (isdigit(firstChar)) {
                    let newPos = pos;
                    while (newPos < latex.length && isdigit(latex[newPos])) {
                        newPos += 1;
                    }
                    token = new TexToken(TexTokenType.ELEMENT, latex.slice(pos, newPos));
                } else if (isalpha(firstChar)) {
                    token = new TexToken(TexTokenType.ELEMENT, firstChar);
                } else if ('+-*/=\'<>!.,;?()[]|'.includes(firstChar)) {
                    token = new TexToken(TexTokenType.ELEMENT, firstChar)
                } else {
                    token = new TexToken(TexTokenType.UNKNOWN, firstChar);
                }
                pos += token.value.length;
            }
        }

        tokens.push(token);

        if (token.type === TexTokenType.COMMAND && ['\\text', '\\operatorname', '\\begin', '\\end'].includes(token.value)) {
            if (pos >= latex.length || latex[pos] !== '{') {
                throw new LatexParserError(`No content for ${token.value} command`);
            }
            tokens.push(new TexToken(TexTokenType.CONTROL, '{'));
            const posClosingBracket = find_closing_curly_bracket_char(latex, pos);
            pos++;
            let textInside = latex.slice(pos, posClosingBracket);
            // replace all escape characters with their actual characters
            const chars = ['{', '}', '\\', '$', '&', '#', '_', '%'];
            for (const char of chars) {
                textInside = textInside.replaceAll('\\' + char, char);
            }
            tokens.push(new TexToken(TexTokenType.TEXT, textInside));
            tokens.push(new TexToken(TexTokenType.CONTROL, '}'));
            pos = posClosingBracket + 1;
        }
    }
    return tokens;
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
        const results: TexNode[] = [];
        let pos = 0;
        while (pos < tokens.length) {
            const results: TexNode[] = [];
            let pos = 0;
    
            while (pos < tokens.length) {
                const [res, newPos] = this.parseNextExpr(tokens, pos);
                pos = newPos;
                if(res.type === 'whitespace') {
                    if (!this.space_sensitive && res.content.replace(/ /g, '').length === 0) {
                        continue;
                    }
                    if (!this.newline_sensitive && res.content === '\n') {
                        continue;
                    }
                }
                if (res.type === 'control' && res.content === '&') {
                    throw new LatexParserError('Unexpected & outside of an alignment');
                }
                results.push(res);
            }
    
            if (results.length === 0) {
                return EMPTY_NODE;
            } else if (results.length === 1) {
                return results[0];
            } else {
                return new TexNode('ordgroup', '', results);
            }
        }


        if (results.length === 0) {
            return EMPTY_NODE;
        } else if (results.length === 1) {
            return results[0];
        } else {
            return new TexNode('ordgroup', '', results);
        }
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
            const res: TexSupsubData = { base };
            if (sub) {
                res.sub = sub;
            }
            if (num_prime > 0) {
                res.sup = new TexNode('ordgroup', '',  []);
                for (let i = 0; i < num_prime; i++) {
                    res.sup.args!.push(new TexNode('element', "'"));
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
            return [new TexNode('supsub', '', [], res), pos];
        } else {
            return [base, pos];
        }
    }

    parseNextExprWithoutSupSub(tokens: TexToken[], start: number): ParseResult {
        const firstToken = tokens[start];
        const tokenType = firstToken.type;
        switch (tokenType) {
            case TexTokenType.ELEMENT:
                return [new TexNode('element', firstToken.value), start + 1];
            case TexTokenType.TEXT:
                return [new TexNode('text', firstToken.value), start + 1];
            case TexTokenType.COMMENT:
                return [new TexNode('comment', firstToken.value), start + 1];
            case TexTokenType.SPACE:
            case TexTokenType.NEWLINE:
                return [new TexNode('whitespace', firstToken.value), start + 1];
            case TexTokenType.COMMAND:
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
                        const exprInside = tokens.slice(start + 1, posClosingBracket);
                        return [this.parse(exprInside), posClosingBracket + 1];
                    case '}':
                        throw new LatexParserError("Unmatched '}'");
                    case '\\\\':
                        return [new TexNode('control', '\\\\'), start + 1];
                    case '\\,':
                        return [new TexNode('control', '\\,'), start + 1];
                    case '_':
                    case '^':
                        return [ EMPTY_NODE, start];
                    case '&':
                        return [new TexNode('control', '&'), start + 1];
                    default:
                        throw new LatexParserError('Unknown control sequence');
                }
            default:
                throw new LatexParserError('Unknown token type');
        }
    }

    parseCommandExpr(tokens: TexToken[], start: number): ParseResult {
        assert(tokens[start].type === TexTokenType.COMMAND);

        const command = tokens[start].value; // command name starts with a \

        let pos = start + 1;

        if (['left', 'right', 'begin', 'end'].includes(command.slice(1))) {
            throw new LatexParserError('Unexpected command: ' + command);
        } 


        const paramNum = get_command_param_num(command.slice(1));
        switch (paramNum) {
            case 0:
                if (!symbolMap.has(command.slice(1))) {
                    return [new TexNode('unknownMacro', command), pos];
                }
                return [new TexNode('symbol', command), pos];
            case 1: {
                if (command === '\\sqrt' && pos < tokens.length && tokens[pos].eq(LEFT_SQUARE_BRACKET)) {
                    const posLeftSquareBracket = pos;
                    const posRightSquareBracket = find_closing_match(tokens, pos, LEFT_SQUARE_BRACKET, RIGHT_SQUARE_BRACKET);
                    const exprInside = tokens.slice(posLeftSquareBracket + 1, posRightSquareBracket);
                    const exponent = this.parse(exprInside);
                    const [arg1, newPos] = this.parseNextExprWithoutSupSub(tokens, posRightSquareBracket + 1);
                    return [new TexNode('unaryFunc', command, [arg1], exponent), newPos];
                } else if (command === '\\text') {
                    if (pos + 2 >= tokens.length) {
                        throw new LatexParserError('Expecting content for \\text command');
                    }
                    assert(tokens[pos].eq(LEFT_CURLY_BRACKET));
                    assert(tokens[pos + 1].type === TexTokenType.TEXT);
                    assert(tokens[pos + 2].eq(RIGHT_CURLY_BRACKET));
                    const text = tokens[pos + 1].value;
                    return [new TexNode('text', text), pos + 3];
                }
                let [arg1, newPos] = this.parseNextExprWithoutSupSub(tokens, pos);
                return [new TexNode('unaryFunc', command, [arg1]), newPos];
            }
            case 2: {
                const [arg1, pos1] = this.parseNextExprWithoutSupSub(tokens, pos);
                const [arg2, pos2] = this.parseNextExprWithoutSupSub(tokens, pos1);
                return [new TexNode('binaryFunc', command, [arg1, arg2]), pos2];
            }
            default:
                throw new Error( 'Invalid number of parameters');
        }
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

        const exprInside = tokens.slice(exprInsideStart, exprInsideEnd);
        const body = this.parse(exprInside);
        const args: TexNode[] = [
            new TexNode('element', leftDelimiter.value),
            body,
            new TexNode('element', rightDelimiter.value)
        ]
        const res = new TexNode('leftright', '', args);
        return [res, pos];
    }

    parseBeginEndExpr(tokens: TexToken[], start: number): ParseResult {
        assert(tokens[start].eq(BEGIN_COMMAND));

        let pos = start + 1;
        assert(tokens[pos].eq(LEFT_CURLY_BRACKET));
        assert(tokens[pos + 1].type === TexTokenType.TEXT);
        assert(tokens[pos + 2].eq(RIGHT_CURLY_BRACKET));
        const envName = tokens[pos + 1].value;
        pos += 3;
        
        pos += eat_whitespaces(tokens, pos).length; // ignore whitespaces and '\n' after \begin{envName}
        
        const exprInsideStart = pos;

        const endIdx = find_closing_end_command(tokens, start);
        if (endIdx === -1) {
            throw new LatexParserError('No matching \\end');
        }
        const exprInsideEnd = endIdx;
        pos = endIdx + 1;
        
        assert(tokens[pos].eq(LEFT_CURLY_BRACKET));
        assert(tokens[pos + 1].type === TexTokenType.TEXT);
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
        const res = new TexNode('beginend', envName, [], body);
        return [res, pos];
    }

    parseAligned(tokens: TexToken[]): TexNode[][] {
        let pos = 0;
        const allRows: TexNode[][] = [];
        let row: TexNode[] = [];
        allRows.push(row);
        let group = new TexNode('ordgroup', '', []);
        row.push(group);

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
            
            if (res.type === 'control' && res.content === '\\\\') {
                row = [];
                group = new TexNode('ordgroup', '', []);
                row.push(group);
                allRows.push(row);
            } else if (res.type === 'control' && res.content === '&') {
                group = new TexNode('ordgroup', '', []);
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
            const expanded_tokens = tokenize(customTexMacros[token.value]);
            out_tokens = out_tokens.concat(expanded_tokens);
        } else {
            out_tokens.push(token);
        }
    }
    return out_tokens;
}

export function parseTex(tex: string, customTexMacros: {[key: string]: string}): TexNode {
    const parser = new LatexParser();
    let tokens = tokenize(tex);
    tokens = passIgnoreWhitespaceBeforeScriptMark(tokens);
    tokens = passExpandCustomTexMacros(tokens, customTexMacros);
    return parser.parse(tokens);
}
