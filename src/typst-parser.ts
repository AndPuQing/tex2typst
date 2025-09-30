
import { array_find } from "./generic";
import { TypstLrData, TypstNamedParams, TypstNode, TypstSupsubData, TypstToken, TypstTokenType } from "./types";
import { tokenize_typst } from "./typst-tokenizer";
import { assert, isalpha } from "./util";

const NONE_TOKEN = new TypstToken(TypstTokenType.NONE, '#none');

// TODO: In Typst, y' ' is not the same as y''.
// The parser should be able to parse the former correctly.
function eat_primes(tokens: TypstToken[], start: number): number {
    let pos = start;
    while (pos < tokens.length && tokens[pos].eq(new TypstToken(TypstTokenType.ELEMENT, "'"))) {
        pos += 1;
    }
    return pos - start;
}


function _find_closing_match(tokens: TypstToken[], start: number,
        leftBrackets: TypstToken[], rightBrackets: TypstToken[]): number {
    assert(tokens[start].isOneOf(leftBrackets));
    let count = 1;
    let pos = start + 1;

    while (count > 0) {
        if (pos >= tokens.length) {
            throw new Error('Unmatched brackets or parentheses');
        }
        if (tokens[pos].isOneOf(rightBrackets)) {
            count -= 1;
        }else if (tokens[pos].isOneOf(leftBrackets)) {
            count += 1;
        }
        pos += 1;
    }

    return pos - 1;
}

function find_closing_match(tokens: TypstToken[], start: number): number {
    return _find_closing_match(
        tokens,
        start,
        [LEFT_PARENTHESES, LEFT_BRACKET, LEFT_CURLY_BRACKET],
        [RIGHT_PARENTHESES, RIGHT_BRACKET, RIGHT_CURLY_BRACKET]
    );
}

function find_closing_delim(tokens: TypstToken[], start: number): number {
    return _find_closing_match(
        tokens,
        start,
        [LEFT_PARENTHESES, LEFT_BRACKET, LEFT_CURLY_BRACKET, VERTICAL_BAR],
        [RIGHT_PARENTHESES, RIGHT_BRACKET, RIGHT_CURLY_BRACKET, VERTICAL_BAR]
    );
}



function find_closing_parenthesis(nodes: TypstNode[], start: number): number {
    const left_parenthesis = new TypstToken(TypstTokenType.ELEMENT, '(').toNode();
    const right_parenthesis = new TypstToken(TypstTokenType.ELEMENT, ')').toNode();



    assert(nodes[start].eq(left_parenthesis));

    let count = 1;
    let pos = start + 1;

    while (count > 0) {
        if (pos >= nodes.length) {
            throw new Error("Unmatched '('");
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
        res.push(new TypstToken(TypstTokenType.ELEMENT, "'").toNode());
    }
    return res;
}

const DIV = new TypstToken(TypstTokenType.ELEMENT, '/').toNode();



function next_non_whitespace(nodes: TypstNode[], start: number): TypstNode | null {
    let pos = start;
    while (pos < nodes.length && (nodes[pos].head.type === TypstTokenType.SPACE || nodes[pos].head.type === TypstTokenType.NEWLINE)) {
        pos++;
    }
    return pos === nodes.length ? null : nodes[pos];
}

function trim_whitespace_around_operators(nodes: TypstNode[]): TypstNode[] {
    let after_operator = false;
    const res: TypstNode[] = [];
    for (let i = 0; i < nodes.length; i++) {
        const current = nodes[i];
        if (current.head.type === TypstTokenType.SPACE || current.head.type === TypstTokenType.NEWLINE) {
            if(after_operator) {
                continue;
            }
            if(next_non_whitespace(nodes, i + 1)?.eq(DIV)) {
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
    const SPECIAL_PAREN_TOKEN = new TypstToken(TypstTokenType.LITERAL, 'parenthesis');

    nodes = trim_whitespace_around_operators(nodes);

    const opening_bracket = new TypstToken(TypstTokenType.ELEMENT, '(').toNode();
    const closing_bracket = new TypstToken(TypstTokenType.ELEMENT, ')').toNode();

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

                if(denominator.type === 'group' && denominator.head.eq(SPECIAL_PAREN_TOKEN)) {
                    denominator.head = NONE_TOKEN;
                }
                if(numerator.type === 'group' && numerator.head.eq(SPECIAL_PAREN_TOKEN)) {
                    numerator.head = NONE_TOKEN;
                }

                args.push(new TypstNode('fraction', NONE_TOKEN, [numerator, denominator]));
                stack.pop(); // drop the '/' operator
            } else {
                args.push(current_tree);
            }
        }
    }
    if(parenthesis) {
        return new TypstNode('group', SPECIAL_PAREN_TOKEN, args);
    } else {
        if(args.length === 1) {
            return args[0];
        } else {
            return new TypstNode('group', NONE_TOKEN, args);
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
const VERTICAL_BAR = new TypstToken(TypstTokenType.ELEMENT, '|');
const COMMA = new TypstToken(TypstTokenType.ELEMENT, ',');
const SEMICOLON = new TypstToken(TypstTokenType.ELEMENT, ';');
const SINGLE_SPACE = new TypstToken(TypstTokenType.SPACE, ' ');
const CONTROL_AND = new TypstToken(TypstTokenType.CONTROL, '&');

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
            if (res.head.type === TypstTokenType.SPACE || res.head.type === TypstTokenType.NEWLINE) {
                if (!this.space_sensitive && res.head.value.replace(/ /g, '').length === 0) {
                    continue;
                }
                if (!this.newline_sensitive && res.head.value === '\n') {
                    continue;
                }
            }
            results.push(res);
        }

        let node: TypstNode;
        if(parentheses) {
            node = process_operators(results, true);
        } else {
            if (results.length === 1) {
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
            base = new TypstNode('group', NONE_TOKEN, [base].concat(primes(num_base_prime)));
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
            const res: TypstSupsubData = { base, sup: null, sub: null };
            if (sub) {
                res.sub = sub;
            }
            if (sup) {
                res.sup = sup;
            }
            return [new TypstNode('supsub', NONE_TOKEN, [], res), pos];
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
            node = new TypstNode('group', NONE_TOKEN, [node].concat(primes(num_prime)));
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
                    const [matrix, named_params, newPos] = this.parseMatrix(tokens, start + 1, SEMICOLON, COMMA);
                    const mat = new TypstNode('matrix', NONE_TOKEN, [], matrix);
                    mat.setOptions(named_params);
                    return [mat, newPos];
                }
                if(firstToken.value === 'cases') {
                    const [cases, named_params, newPos] = this.parseMatrix(tokens, start + 1, COMMA, CONTROL_AND);
                    const casesNode = new TypstNode('cases', NONE_TOKEN, [], cases);
                    casesNode.setOptions(named_params);
                    return [casesNode, newPos];
                }
                if (firstToken.value === 'lr') {
                    const [args, newPos, lrData] = this.parseLrArguments(tokens, start + 1);
                    const func_call = new TypstNode('funcCall', firstToken, args, lrData);
                    return [func_call, newPos];
                }
                const [args, newPos] = this.parseArguments(tokens, start + 1);
                const func_call = new TypstNode('funcCall', firstToken, args);
                return [func_call, newPos];
            }
        }

        return [node, start + 1];
    }

    // start: the position of the left parentheses
    parseArguments(tokens: TypstToken[], start: number): [TypstNode[], number] {
        const end = find_closing_match(tokens, start);
        return [this.parseArgumentsWithSeparator(tokens, start + 1, end, COMMA), end + 1];
    }

    // start: the position of the left parentheses
    parseLrArguments(tokens: TypstToken[], start: number): [TypstNode[], number, TypstLrData] {
        if (tokens[start + 1].isOneOf([LEFT_PARENTHESES, LEFT_BRACKET, LEFT_CURLY_BRACKET, VERTICAL_BAR])) {
            const end = find_closing_match(tokens, start);
            const inner_start = start + 1;
            const inner_end = find_closing_delim(tokens, inner_start);
            const inner_args= this.parseArgumentsWithSeparator(tokens, inner_start + 1, inner_end, COMMA);
            return [
                inner_args,
                end + 1,
                {leftDelim: tokens[inner_start].value, rightDelim: tokens[inner_end].value} as TypstLrData
            ];
        } else {
            const [args, end] = this.parseArguments(tokens, start);
            return [
                args,
                end,
                {leftDelim: null, rightDelim: null} as TypstLrData,
            ];
        }
    }

    // start: the position of the left parentheses
    parseMatrix(tokens: TypstToken[], start: number, rowSepToken: TypstToken, cellSepToken: TypstToken): [TypstNode[][], TypstNamedParams, number] {
        const end = find_closing_match(tokens, start);
        tokens = tokens.slice(0, end);

        const matrix: TypstNode[][] = [];
        let named_params: TypstNamedParams = {};

        let pos = start + 1;
        while (pos < end) {
            while(pos < end) {
                let next_stop = array_find(tokens, rowSepToken, pos);
                if (next_stop === -1) {
                    next_stop = end;
                }

                let row = this.parseArgumentsWithSeparator(tokens, pos, next_stop, cellSepToken);
                let np: TypstNamedParams = {};

                function extract_named_params(arr: TypstNode[]): [TypstNode[], TypstNamedParams] {
                    const COLON = new TypstToken(TypstTokenType.ELEMENT, ':').toNode();
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
                        if(param_name.eq(new TypstToken(TypstTokenType.SYMBOL, 'delim').toNode())) {
                            if(g.args!.length !== 3) {
                                throw new TypstParserError('Invalid number of arguments for delim');
                            }
                            np['delim'] = g.args![pos_colon + 1];
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
    parseArgumentsWithSeparator(tokens: TypstToken[], start: number, end: number, sepToken: TypstToken): TypstNode[] {
        const args: TypstNode[] = [];
        let pos = start;
        while (pos < end) {
            let nodes: TypstNode[] = [];
            while(pos < end) {
                if(tokens[pos].eq(sepToken)) {
                    pos += 1;
                    break;
                } else if(tokens[pos].eq(SINGLE_SPACE)) {
                    pos += 1;
                    continue;
                }
                const [argItem, newPos] = this.parseNextExpr(tokens, pos);
                pos = newPos;
                nodes.push(argItem);
            }

            let arg: TypstNode;
            if (nodes.length === 1) {
                arg = nodes[0];
            } else {
                arg = process_operators(nodes);
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