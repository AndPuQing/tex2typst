
import { array_find } from "./generic";
import { TypstNamedParams, TypstNode, TypstSupsubData, TypstToken, TypstTokenType } from "./types";
import { assert, isalpha, isdigit } from "./util";

// TODO: In Typst, y' ' is not the same as y''.
// The parser should be able to parse the former correctly.
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
                    let newPos = pos + 2;
                    while (newPos < typst.length && typst[newPos] !== '\n') {
                        newPos++;
                    }
                    token = new TypstToken(TypstTokenType.COMMENT, typst.slice(pos + 2, newPos));
                    pos = newPos;
                } else {
                    token = new TypstToken(TypstTokenType.ELEMENT, '/');
                    pos++;
                }
                break;
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

function find_closing_match(tokens: TypstToken[], start: number): number {
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


function find_closing_parenthesis(nodes: TypstNode[], start: number): number {
    const left_parenthesis = new TypstNode('atom', '(');
    const right_parenthesis = new TypstNode('atom', ')');

    assert(nodes[start].eq(left_parenthesis));

    let count = 1;
    let pos = start + 1;

    while (count > 0) {
        if (pos >= nodes.length) {
            throw new Error('Unmatched brackets');
        }
        if (nodes[pos].eq(left_parenthesis)) {
            count += 1;
        } else if (nodes[pos].eq(right_parenthesis)) {
            count -= 1;
        }
        pos += 1;
    }

    return pos - 1;
}

function primes(num: number): TypstNode[] {
    const res: TypstNode[] = [];
    for (let i = 0; i < num; i++) {
        res.push(new TypstNode('atom', "'"));
    }
    return res;
}

const DIV = new TypstNode('atom', '/');



function next_non_whitespace(nodes: TypstNode[], start: number): TypstNode {
    let pos = start;
    while (pos < nodes.length && nodes[pos].type === 'whitespace') {
        pos++;
    }
    return pos === nodes.length ? TYPST_EMPTY_NODE : nodes[pos];
}

function trim_whitespace_around_operators(nodes: TypstNode[]): TypstNode[] {
    let after_operator = false;
    const res: TypstNode[] = [];
    for (let i = 0; i < nodes.length; i++) {
        const current = nodes[i];
        if (current.type === 'whitespace') {
            if(after_operator) {
                continue;
            }
            if(next_non_whitespace(nodes, i + 1).eq(DIV)) {
                continue;
            }
        }
        if (current.eq(DIV)) {
            after_operator = true;
        } else {
            after_operator = false;
        }
        res.push(current);
    }
    return res;
}

function process_operators(nodes: TypstNode[], parenthesis = false): TypstNode {
    nodes = trim_whitespace_around_operators(nodes);

    const opening_bracket = new TypstNode('atom', '(');
    const closing_bracket = new TypstNode('atom', ')');

    const stack: TypstNode[] = [];

    const args: TypstNode[] = [];
    let pos = 0;
    while (pos < nodes.length) {
        const current = nodes[pos];
        if (current.eq(closing_bracket)) {
            throw new TypstParserError("Unexpected ')'");
        } else if(current.eq(DIV)) {
            stack.push(current);
            pos++;
        } else {
            let current_tree: TypstNode;
            if(current.eq(opening_bracket)) {
                // the expression is a group wrapped in parenthesis
                const pos_closing = find_closing_parenthesis(nodes, pos);
                current_tree = process_operators(nodes.slice(pos + 1, pos_closing), true);
                pos = pos_closing + 1;
            } else {
                // the expression is just a single item
                current_tree = current;
                pos++;
            }

            if(stack.length > 0 && stack[stack.length-1].eq(DIV)) {
                const denominator = current_tree;
                if(args.length === 0) {
                    throw new TypstParserError("Unexpected '/' operator, no numerator before it");
                }
                const numerator = args.pop()!;

                if(denominator.type === 'group' && denominator.content === 'parenthesis') {
                    denominator.content = '';
                }
                if(numerator.type === 'group' && numerator.content === 'parenthesis') {
                    numerator.content = '';
                }

                args.push(new TypstNode('fraction', '', [numerator, denominator]));
                stack.pop(); // drop the '/' operator
            } else {
                args.push(current_tree);
            }
        }
    }
    if(parenthesis) {
        return new TypstNode('group', 'parenthesis', args);
    } else {
        if(args.length === 0) {
            return TYPST_EMPTY_NODE;
        } else if(args.length === 1) {
            return args[0];
        } else {
            return new TypstNode('group', '', args);
        }
    }
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
const SEMICOLON = new TypstToken(TypstTokenType.ELEMENT, ';');
const SINGLE_SPACE = new TypstToken(TypstTokenType.SPACE, ' ');

export class TypstParser {
    space_sensitive: boolean;
    newline_sensitive: boolean;

    constructor(space_sensitive: boolean = true, newline_sensitive: boolean = true) {
        this.space_sensitive = space_sensitive;
        this.newline_sensitive = newline_sensitive;
    }

    parse(tokens: TypstToken[]): TypstNode {
        const [tree, _] = this.parseGroup(tokens, 0, tokens.length);
        return tree;
    }

    parseGroup(tokens: TypstToken[], start: number, end: number, parentheses = false): TypstParseResult {
        const results: TypstNode[] = [];
        let pos = start;

        while (pos < end) {
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

        let node: TypstNode;
        if(parentheses) {
            node = process_operators(results, true);
        } else {
            if (results.length === 0) {
                node = TYPST_EMPTY_NODE;
            } else if (results.length === 1) {
                node = results[0];
            } else {
                node = process_operators(results);
            }
        }
        return [node, end + 1];
    }

    parseNextExpr(tokens: TypstToken[], start: number): TypstParseResult {
        let [base, pos] = this.parseNextExprWithoutSupSub(tokens, start);
        let sub: TypstNode | null = null;
        let sup: TypstNode | null = null;

        const num_base_prime = eat_primes(tokens, pos);
        if (num_base_prime > 0) {
            base = new TypstNode('group', '', [base].concat(primes(num_base_prime)));
            pos += num_base_prime;
        }
        if (pos < tokens.length && tokens[pos].eq(SUB_SYMBOL)) {
            [sub, pos] = this.parseSupOrSub(tokens, pos + 1);
            if (pos < tokens.length && tokens[pos].eq(SUP_SYMBOL)) {
                [sup, pos] = this.parseSupOrSub(tokens, pos + 1);
            }
        } else if (pos < tokens.length && tokens[pos].eq(SUP_SYMBOL)) {
            [sup, pos] = this.parseSupOrSub(tokens, pos + 1);
            if (pos < tokens.length && tokens[pos].eq(SUB_SYMBOL)) {
                [sub, pos] = this.parseSupOrSub(tokens, pos + 1);
            }
        }

        if (sub !== null || sup !== null) {
            const res: TypstSupsubData = { base };
            if (sub) {
                res.sub = sub;
            }
            if (sup) {
                res.sup = sup;
            }
            return [new TypstNode('supsub', '', [], res), pos];
        } else {
            return [base, pos];
        }
    }

    parseSupOrSub(tokens: TypstToken[], start: number): TypstParseResult {
        let node: TypstNode;
        let end: number;
        if(tokens[start].eq(LEFT_PARENTHESES)) {
            const pos_closing = find_closing_match(tokens, start);
            [node, end] = this.parseGroup(tokens, start + 1, pos_closing);
        } else {
            [node, end] = this.parseNextExprWithoutSupSub(tokens, start);
        }
        const num_prime = eat_primes(tokens, end);
        if (num_prime > 0) {
            node = new TypstNode('group', '', [node].concat(primes(num_prime)));
            end += num_prime;
        }
        return [node, end];
    }

    parseNextExprWithoutSupSub(tokens: TypstToken[], start: number): TypstParseResult {
        const firstToken = tokens[start];
        const node = firstToken.toNode();
        if(firstToken.eq(LEFT_PARENTHESES)) {
            const pos_closing = find_closing_match(tokens, start);
            return this.parseGroup(tokens, start + 1, pos_closing, true);
        }
        if(firstToken.type === TypstTokenType.ELEMENT && !isalpha(firstToken.value[0])) {
            return [node, start + 1];
        }
        if ([TypstTokenType.ELEMENT, TypstTokenType.SYMBOL].includes(firstToken.type)) {
            if (start + 1 < tokens.length && tokens[start + 1].eq(LEFT_PARENTHESES)) {
                if(firstToken.value === 'mat') {
                    const [matrix, named_params, newPos] = this.parseGroupsOfArguments(tokens, start + 1);
                    const mat = new TypstNode('matrix', '', [], matrix);
                    mat.setOptions(named_params);
                    return [mat, newPos];
                }
                const [args, newPos] = this.parseArguments(tokens, start + 1);
                const func_call = new TypstNode('funcCall', firstToken.value);
                func_call.args = args;
                return [func_call, newPos];
            }
        }

        return [node, start + 1];
    }

    // start: the position of the left parentheses
    parseArguments(tokens: TypstToken[], start: number): [TypstNode[], number] {
        const end = find_closing_match(tokens, start);
        
        return [this.parseCommaSeparatedArguments(tokens, start + 1, end), end + 1];
    }

    // start: the position of the left parentheses
    parseGroupsOfArguments(tokens: TypstToken[], start: number): [TypstNode[][], TypstNamedParams, number] {
        const end = find_closing_match(tokens, start);

        const matrix: TypstNode[][] = [];
        let named_params: TypstNamedParams = {};

        let pos = start + 1;
        while (pos < end) {
            while(pos < end) {
                let next_stop = array_find(tokens, SEMICOLON, pos);
                if (next_stop === -1) {
                    next_stop = end;
                }

                let row = this.parseCommaSeparatedArguments(tokens, pos, next_stop);
                let np: TypstNamedParams = {};

                function extract_named_params(arr: TypstNode[]): [TypstNode[], TypstNamedParams] {
                    const COLON = new TypstNode('atom', ':');
                    const np: TypstNamedParams = {};

                    const to_delete: number[] = [];
                    for(let i = 0; i < arr.length; i++) {
                        if(arr[i].type !== 'group') {
                            continue;
                        }

                        const g = arr[i];
                        const pos_colon = array_find(g.args!, COLON);
                        if(pos_colon === -1 || pos_colon === 0) {
                            continue;
                        }
                        to_delete.push(i);
                        const param_name = g.args![pos_colon - 1];
                        if(param_name.eq(new TypstNode('symbol', 'delim'))) {
                            if(g.args![pos_colon + 1].type === 'text') {
                                np['delim'] = g.args![pos_colon + 1].content;
                                if(g.args!.length !== 3) {
                                    throw new TypstParserError('Invalid number of arguments for delim');
                                }
                            } else if(g.args![pos_colon + 1].eq(new TypstNode('atom', '#'))) {
                                // TODO: should parse #none properly
                                if(g.args!.length !== 4 || !g.args![pos_colon + 2].eq(new TypstNode('symbol', 'none'))) { 
                                    throw new TypstParserError('Invalid number of arguments for delim');
                                }
                                np['delim'] = "#none";
                            } else {
                                throw new TypstParserError('Not implemented for other types of delim');
                            }
                        } else {
                            throw new TypstParserError('Not implemented for other named parameters');
                        }
                    }
                    for(let i = to_delete.length - 1; i >= 0; i--) {
                        arr.splice(to_delete[i], 1);
                    }
                    return [arr, np];
                }

                [row, np] = extract_named_params(row);
                matrix.push(row);
                Object.assign(named_params, np);
                pos = next_stop + 1;
            }
        }
        
        return [matrix, named_params, end + 1];
    }

    // start: the position of the first token of arguments
    parseCommaSeparatedArguments(tokens: TypstToken[], start: number, end: number): TypstNode[] {
        const args: TypstNode[] = [];
        let pos = start;
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
        return args;
    }
}

export function parseTypst(typst: string): TypstNode {
    const parser = new TypstParser();
    let tokens = tokenize_typst(typst);
    return parser.parse(tokens);
}