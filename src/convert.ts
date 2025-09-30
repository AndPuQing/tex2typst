import { TexNode, TypstNode, TexSupsubData, TypstSupsubData, TexSqrtData, Tex2TypstOptions, TYPST_NONE, TypstLrData, TexArrayData, TypstNamedParams, TexToken, TexTokenType, TypstToken, TypstTokenType } from "./types";
import { symbolMap, reverseSymbolMap } from "./map";
import { array_equal, array_intersperse } from "./generic";
import { assert } from "./util";
import { TEX_BINARY_COMMANDS, TEX_UNARY_COMMANDS } from "./tex-tokenizer";

const TYPST_NONE_TOKEN = new TypstToken(TypstTokenType.NONE, '#none');

export class ConverterError extends Error {
    node: TexNode | TypstNode;

    constructor(message: string, node: TexNode | TypstNode) {
        super(message);
        this.name = "ConverterError";
        this.node = node;
    }
}

// native textual operators in Typst
const TYPST_INTRINSIC_OP = [
    'dim',
    'id',
    'im',
    'mod',
    'Pr',
    'sech',
    'csch',
    // 'sgn
];

function _tex_token_str_to_typst(token: string): string{
    if (/^[a-zA-Z0-9]$/.test(token)) {
        return token;
    } else if (token === '/') {
        return '\\/';
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

function tex_token_to_typst(token: TexToken): TypstToken {
    let token_type: TypstTokenType;
    switch (token.type) {
        case TexTokenType.EMPTY:
            token_type = TypstTokenType.NONE;
            break;
        case TexTokenType.COMMAND:
            token_type = TypstTokenType.SYMBOL;
            break;
        case TexTokenType.ELEMENT:
            token_type = TypstTokenType.ELEMENT;
            break;
        case TexTokenType.LITERAL:
            token_type = TypstTokenType.LITERAL;
            break;
        case TexTokenType.COMMENT:
            token_type = TypstTokenType.COMMENT;
            break;
        case TexTokenType.SPACE:
            token_type = TypstTokenType.SPACE;
            break;
        case TexTokenType.CONTROL:
            token_type = TypstTokenType.CONTROL;
            break;
        case TexTokenType.NEWLINE:
            token_type = TypstTokenType.NEWLINE;
            break;
        default:
            throw Error(`Unknown token type: ${token.type}`);
    }
    return new TypstToken(token_type, _tex_token_str_to_typst(token.value));
}

// \overset{X}{Y} -> limits(Y)^X
// and with special case \overset{\text{def}}{=} -> eq.def
function convert_overset(node: TexNode, options: Tex2TypstOptions): TypstNode {
    const [sup, base] = node.args!;

    if (options.optimize) {
        const is_def = function (n: TexNode): boolean {
            // \overset{\text{def}}{=} is considered as eq.def
            if (n.eq(new TexNode('text', new TexToken(TexTokenType.LITERAL, 'def')))) {
                return true;
            }
            // \overset{def}{=} is also considered as eq.def
            if (n.type === 'ordgroup') {
                return array_equal(n.args!, [
                    new TexToken(TexTokenType.ELEMENT, 'd').toNode(),
                    new TexToken(TexTokenType.ELEMENT, 'e').toNode(),
                    new TexToken(TexTokenType.ELEMENT, 'f').toNode()
                ]);
            }
            return false;
        };
        const is_eq = function (n: TexNode): boolean {
            return n.eq(new TexToken(TexTokenType.ELEMENT, '=').toNode());
        };
        if (is_def(sup) && is_eq(base)) {
            return new TypstToken(TypstTokenType.SYMBOL, 'eq.def').toNode();
        }
    }
    const limits_call = new TypstNode(
        'funcCall',
        new TypstToken(TypstTokenType.SYMBOL, 'limits'),
        [convert_tex_node_to_typst(base, options)]
    );
    return new TypstNode('supsub', TYPST_NONE_TOKEN, [], {
            base: limits_call,
            sup: convert_tex_node_to_typst(sup, options),
            sub: null,
    });
}

// \underset{X}{Y} -> limits(Y)_X
function convert_underset(node: TexNode, options: Tex2TypstOptions): TypstNode {
    const [sub, base] = node.args!;

    const limits_call = new TypstNode(
        'funcCall',
        new TypstToken(TypstTokenType.SYMBOL, 'limits'),
        [convert_tex_node_to_typst(base, options)]
    );
    return new TypstNode('supsub', TYPST_NONE_TOKEN, [], {
            base: limits_call,
            sub: convert_tex_node_to_typst(node=sub, options=options),
            sup: null,
    });
}

function convert_tex_array_align_literal(alignLiteral: string): TypstNamedParams {
    const np: TypstNamedParams = {};
    const alignMap: Record<string, string> = { l: '#left', c: '#center', r: '#right' };
    const chars = Array.from(alignLiteral);

    const vlinePositions: number[] = [];
    let columnIndex = 0;
    for (const c of chars) {
        if (c === '|') {
            vlinePositions.push(columnIndex);
        } else if (c === 'l' || c === 'c' || c === 'r') {
            columnIndex++;
        }
    }

    if (vlinePositions.length > 0) {
        let augment_str: string;
        if (vlinePositions.length === 1) {
            augment_str = `#${vlinePositions[0]}`;
        } else {
            augment_str = `#(vline: (${vlinePositions.join(', ')}))`;
        }

        np['augment'] = new TypstToken(TypstTokenType.LITERAL, augment_str).toNode();
    }

    const alignments = chars
        .map(c => alignMap[c])
        .filter((x) => x !== undefined)
        .map(s => new TypstToken(TypstTokenType.LITERAL, s!).toNode());

    if (alignments.length > 0) {
        const all_same = alignments.every(item => item.eq(alignments[0]));
        np['align'] = all_same ? alignments[0] : new TypstToken(TypstTokenType.LITERAL, '#center').toNode();
    }
    return np;
}


export function convert_tex_node_to_typst(node: TexNode, options: Tex2TypstOptions = {}): TypstNode {
    switch (node.type) {
        case 'empty':
        case 'whitespace':
        case 'element':
        case 'symbol':
        case 'literal':
            // This happens, for example, node={type: 'literal', content: 'myop'} as in `\operatorname{myop}`
        case 'comment':
            return tex_token_to_typst(node.content).toNode();
        case 'text': {
            if ((/[^\x00-\x7F]+/).test(node.content.value) && options.nonAsciiWrapper !== "") {
                return new TypstNode(
                    'funcCall',
                    new TypstToken(TypstTokenType.SYMBOL, options.nonAsciiWrapper!),
                    [new TypstToken(TypstTokenType.TEXT, node.content.value).toNode()]
                );
            }
            return new TypstToken(TypstTokenType.TEXT, node.content.value).toNode();
        }
        case 'ordgroup':
            return new TypstNode(
                'group',
                TYPST_NONE_TOKEN,
                node.args!.map((n) => convert_tex_node_to_typst(n, options))
            );
        case 'supsub': {
            let { base, sup, sub } = node.data as TexSupsubData;

            // special hook for overbrace
            if (base && base.type === 'unaryFunc' && base.content.value === '\\overbrace' && sup) {
                return new TypstNode(
                    'funcCall',
                    new TypstToken(TypstTokenType.SYMBOL, 'overbrace'),
                    [convert_tex_node_to_typst(base.args![0], options), convert_tex_node_to_typst(sup, options)]
                );
            } else if (base && base.type === 'unaryFunc' && base.content.value === '\\underbrace' && sub) {
                return new TypstNode(
                    'funcCall',
                    new TypstToken(TypstTokenType.SYMBOL, 'underbrace'),
                    [convert_tex_node_to_typst(base.args![0], options), convert_tex_node_to_typst(sub, options)]
                );
            }

            const data: TypstSupsubData = {
                base: convert_tex_node_to_typst(base, options),
                sup: null,
                sub: null,
            };
            if (data.base.type === 'none') {
                data.base = TYPST_NONE_TOKEN.toNode();
            }

            if (sup) {
                data.sup = convert_tex_node_to_typst(sup, options);
            }

            if (sub) {
                data.sub = convert_tex_node_to_typst(sub, options);
            }

            return new TypstNode('supsub', TYPST_NONE_TOKEN, [], data);
        }
        case 'leftright': {
            const [left, _body, right] = node.args!;
            const [typ_left, typ_body, typ_right] = node.args!.map((n) => convert_tex_node_to_typst(n, options));

            if (options.optimize) {
                // optimization off: "lr(bar.v.double a + 1/2 bar.v.double)"
                // optimization on : "norm(a + 1/2)"
                if (left.content.value === '\\|' && right.content.value === '\\|') {
                    return new TypstNode('funcCall', new TypstToken(TypstTokenType.SYMBOL, 'norm'), [typ_body]);
                }

                // These pairs will be handled by Typst compiler by default. No need to add lr()
                if ([
                    "[]", "()", "\\{\\}",
                    "\\lfloor\\rfloor",
                    "\\lceil\\rceil",
                    "\\lfloor\\rceil",
                ].includes(left.content.value + right.content.value)) {
                    return new TypstNode('group', TYPST_NONE_TOKEN, [typ_left, typ_body, typ_right]);
                }
            }

            const group = new TypstNode(
                'group',
                TYPST_NONE_TOKEN,
                [typ_left, typ_body, typ_right]
            );

            // "\left\{ a + \frac{1}{3} \right." -> "lr(\{ a + 1/3)"
            // "\left. a + \frac{1}{3} \right\}" -> "lr( a + \frac{1}{3} \})"
            // Note that: In lr(), if one side of delimiter doesn't present (i.e. derived from "\\left." or "\\right."),
            // "(", ")", "{", "[", should be escaped with "\" to be the other side of delimiter.
            // Simple "lr({ a+1/3)" doesn't compile in Typst.
            const escape_curly_or_paren = function(s: string): string {
                if (["(", ")", "{", "["].includes(s)) {
                    return "\\" + s;
                } else {
                    return s;
                }
            };
            if (right.content.value === '.') {
                typ_left.content.value = escape_curly_or_paren(typ_left.content.value);
                group.args = [typ_left, typ_body];
            } else if (left.content.value === '.') {
                typ_right.content.value = escape_curly_or_paren(typ_right.content.value);
                group.args = [typ_body, typ_right];
            }
            return new TypstNode('funcCall', new TypstToken(TypstTokenType.SYMBOL, 'lr'), [group]);
        }
        case 'binaryFunc': {
            if (node.content.value === '\\overset') {
                return convert_overset(node, options);
            }
            if (node.content.value === '\\underset') {
                return convert_underset(node, options);
            }
            // \frac{a}{b} -> a / b
            if (node.content.value === '\\frac') {
                if (options.fracToSlash) {
                    return new TypstNode(
                        'fraction',
                        TYPST_NONE_TOKEN,
                        node.args!.map((n) => convert_tex_node_to_typst(n, options))
                    );
                }
            }
            return new TypstNode(
                'funcCall',
                tex_token_to_typst(node.content),
                node.args!.map((n) => convert_tex_node_to_typst(n, options))
            );
        }
        case 'unaryFunc': {
            const arg0 = convert_tex_node_to_typst(node.args![0], options);
            // \sqrt{3}{x} -> root(3, x)
            if (node.content.value === '\\sqrt' && node.data) {
                const data = convert_tex_node_to_typst(node.data as TexSqrtData, options); // the number of times to take the root
                return new TypstNode(
                    'funcCall',
                    new TypstToken(TypstTokenType.SYMBOL, 'root'),
                    [data, arg0]
                );
            }
            // \mathbf{a} -> upright(bold(a))
            if (node.content.value === '\\mathbf') {
                const inner: TypstNode = new TypstNode(
                    'funcCall',
                    new TypstToken(TypstTokenType.SYMBOL, 'bold'),
                    [arg0]
                );
                return new TypstNode(
                    'funcCall',
                    new TypstToken(TypstTokenType.SYMBOL, 'upright'),
                    [inner]
                );
            }
            // \overrightarrow{AB} -> arrow(A B)
            if (node.content.value === '\\overrightarrow') {
                return new TypstNode(
                    'funcCall',
                    new TypstToken(TypstTokenType.SYMBOL, 'arrow'),
                    [arg0]
                );
            }
            // \overleftarrow{AB} -> accent(A B, arrow.l)
            if (node.content.value === '\\overleftarrow') {
                return new TypstNode(
                    'funcCall',
                    new TypstToken(TypstTokenType.SYMBOL, 'accent'),
                    [arg0, new TypstToken(TypstTokenType.SYMBOL, 'arrow.l').toNode()]
                );
            }
            // \operatorname{opname} -> op("opname")
            if (node.content.value === '\\operatorname') {
                // arg0 must be of type 'literal' in this situation
                if (options.optimize) {
                    if (TYPST_INTRINSIC_OP.includes(arg0.content.value)) {
                        return new TypstToken(TypstTokenType.SYMBOL, arg0.content.value).toNode();
                    }
                }
                return new TypstNode('funcCall', new TypstToken(TypstTokenType.SYMBOL, 'op'), [new TypstToken(TypstTokenType.TEXT, arg0.content.value).toNode()]);
            }

            // \substack{a \\ b} -> `a \ b`
            // as in translation from \sum_{\substack{a \\ b}} to sum_(a \ b)
            if (node.content.value === '\\substack') {
                return arg0;
            }

            if(options.optimize) {
                // \mathbb{R} -> RR
                if (node.content.value === '\\mathbb' && arg0.type === 'atom' && /^[A-Z]$/.test(arg0.content.value)) {
                    return new TypstToken(TypstTokenType.SYMBOL, arg0.content.value + arg0.content.value).toNode();
                }
                // \mathrm{d} -> dif
                if (node.content.value === '\\mathrm' && arg0.eq(new TypstToken(TypstTokenType.ELEMENT, 'd').toNode())) {
                    return new TypstToken(TypstTokenType.SYMBOL, 'dif').toNode();
                }
            }

            // generic case
            return new TypstNode(
                'funcCall',
                tex_token_to_typst(node.content),
                node.args!.map((n) => convert_tex_node_to_typst(n, options))
            );
        }
        case 'beginend': {
            const matrix = node.data as TexNode[][];
            const data = matrix.map((row) => row.map((n) => convert_tex_node_to_typst(n, options)));

            if (node.content.value.startsWith('align')) {
                // align, align*, alignat, alignat*, aligned, etc.
                return new TypstNode('align', TYPST_NONE_TOKEN, [], data);
            }
            if (node.content.value === 'cases') {
                return new TypstNode('cases', TYPST_NONE_TOKEN, [], data);
            }
            if (node.content.value === 'subarray') {
                const align_node = node.args![0];
                switch (align_node.content.value) {
                    case 'r':
                        data.forEach(row => row[0].args!.push(new TypstToken(TypstTokenType.SYMBOL, '&').toNode()));
                        break;
                    case 'l':
                        data.forEach(row => row[0].args!.unshift(new TypstToken(TypstTokenType.SYMBOL, '&').toNode()));
                        break;
                    default:
                        break;
                }
                return new TypstNode('align', TYPST_NONE_TOKEN, [], data);
            }
            if (node.content.value === 'array') {
                const np: TypstNamedParams = { 'delim': TYPST_NONE };

                assert(node.args!.length > 0 && node.args![0].type === 'literal');
                const np_new = convert_tex_array_align_literal(node.args![0].content.value);
                Object.assign(np, np_new);

                const res = new TypstNode('matrix', TYPST_NONE_TOKEN, [], data);
                res.setOptions(np);
                return res;
            }
            if (node.content.value.endsWith('matrix')) {
                const res = new TypstNode('matrix', TYPST_NONE_TOKEN, [], data);
                let delim: TypstToken;
                switch (node.content.value) {
                    case 'matrix':
                        delim = TYPST_NONE_TOKEN;
                        break;
                    case 'pmatrix':
                        // delim = new TypstToken(TypstTokenType.TEXT, '(');
                        // break;
                        return res; // typst mat use delim:"(" by default
                    case 'bmatrix':
                        delim = new TypstToken(TypstTokenType.TEXT, '[');
                        break;
                    case 'Bmatrix':
                        delim = new TypstToken(TypstTokenType.TEXT, '{');
                        break;
                    case 'vmatrix':
                        delim = new TypstToken(TypstTokenType.TEXT, '|');
                        break;
                    case 'Vmatrix': {
                        delim = new TypstToken(TypstTokenType.SYMBOL, 'bar.v.double');
                        break;
                    }
                    default:
                        throw new ConverterError(`Unimplemented beginend: ${node.content}`, node);
                }
                res.setOptions({ 'delim': delim.toNode()});
                return res;
            }
            throw new ConverterError(`Unimplemented beginend: ${node.content}`, node);
        }
        case 'unknownMacro':
            return new TypstNode('unknown', tex_token_to_typst(node.content));
        case 'control':
            if (node.content.value === '\\\\') {
                // \\ -> \
                return new TypstToken(TypstTokenType.SYMBOL, '\\').toNode();
            } else if (node.content.value === '\\!') {
                // \! -> #h(-math.thin.amount)
                return new TypstNode('funcCall', new TypstToken(TypstTokenType.SYMBOL, '#h'), [
                    new TypstToken(TypstTokenType.LITERAL, '-math.thin.amount').toNode()
                ]);
            } else if (symbolMap.has(node.content.value.substring(1))) {
                // node.content is one of \, \: \;
                const typst_symbol = symbolMap.get(node.content.value.substring(1))!;
                return new TypstToken(TypstTokenType.SYMBOL, typst_symbol).toNode();
            } else {
                throw new ConverterError(`Unknown control sequence: ${node.content.value}`, node);
            }
        default:
            throw new ConverterError(`Unimplemented node type: ${node.type}`, node);
    }
}


/*
const TYPST_UNARY_FUNCTIONS: string[] = [
    'sqrt',
    'bold',
    'arrow',
    'upright',
    'lr',
    'op',
    'macron',
    'dot',
    'dot.double',
    'hat',
    'tilde',
    'overline',
    'underline',
    'bb',
    'cal',
    'frak',
    'floor',
    'ceil',
    'norm',
    'limits',
    '#h',
];

const TYPST_BINARY_FUNCTIONS: string[] = [
    'frac',
    'root',
    'overbrace',
    'underbrace',
];
*/

function apply_escape_if_needed(c: string) {
    if (['{', '}', '%'].includes(c)) {
        return '\\' + c;
    }
    return c;
}


function typst_token_to_tex(token: TypstToken): TexToken {
    switch (token.type) {
        case TypstTokenType.NONE:
            return TEX_EMPTY_TOKEN;
        case TypstTokenType.SYMBOL: {
            const _typst_symbol_to_tex = function(symbol: string): string {
                if (reverseSymbolMap.has(symbol)) {
                    return '\\' + reverseSymbolMap.get(symbol)!;
                } else {
                    return '\\' + symbol;
                }
            }
            return new TexToken(TexTokenType.COMMAND, _typst_symbol_to_tex(token.value));
        }
        case TypstTokenType.ELEMENT:
            return new TexToken(TexTokenType.ELEMENT, token.value);
        case TypstTokenType.LITERAL:
            return new TexToken(TexTokenType.LITERAL, token.value);
        case TypstTokenType.TEXT:
            return new TexToken(TexTokenType.LITERAL, token.value);
        case TypstTokenType.COMMENT:
            return new TexToken(TexTokenType.COMMENT, token.value);
        case TypstTokenType.SPACE:
            return new TexToken(TexTokenType.SPACE, token.value);
        case TypstTokenType.CONTROL: {
            let value: string;
            switch(token.value) {
                case '\\':
                    value = '\\\\';
                    break;
                case '&':
                    value = '&';
                    break;
                default:
                        throw new Error(`[typst_token_to_tex]Unimplemented control sequence: ${token.value}`);
            }
            return new TexToken(TexTokenType.CONTROL, value);
        }
        case TypstTokenType.NEWLINE:
            return new TexToken(TexTokenType.NEWLINE, token.value);
        default:
            throw new Error(`Unimplemented token type: ${token.type}`);
    }
}


const TEX_EMPTY_TOKEN = new TexToken(TexTokenType.EMPTY, '');
const TEX_NODE_COMMA = new TexToken(TexTokenType.ELEMENT, ',').toNode();

export function convert_typst_node_to_tex(node: TypstNode): TexNode {
    // special hook for eq.def
    if (node.content.eq(new TypstToken(TypstTokenType.SYMBOL, 'eq.def'))) {
        return new TexNode('binaryFunc', new TexToken(TexTokenType.COMMAND, '\\overset'), [
            new TexNode('text', new TexToken(TexTokenType.LITERAL, 'def')),
            new TexToken(TexTokenType.ELEMENT, '=').toNode()
        ]);
    }
    switch (node.type) {
        case 'none':
            // e.g. Typst `#none^2` is converted to TeX `^2`
        case 'whitespace':
        case 'atom':
        case 'literal':
        case 'comment':
        case 'control':
            return typst_token_to_tex(node.content).toNode();
        case 'symbol': {
            // special hook for comma
            if(node.content.value === 'comma') {
                return new TexToken(TexTokenType.ELEMENT, ',').toNode();
            }
            // special hook for dif
            if(node.content.value === 'dif') {
                return new TexNode('unaryFunc', new TexToken(TexTokenType.COMMAND, '\\mathrm'), [new TexToken(TexTokenType.ELEMENT, 'd').toNode()]);
            }
            // special hook for hyph and hyph.minus
            if(node.content.value === 'hyph' || node.content.value === 'hyph.minus') {
                return new TexNode('text', new TexToken(TexTokenType.LITERAL, '-'));
            }
            // special hook for mathbb{R} <-- RR
            if(/^([A-Z])\1$/.test(node.content.value)) {
                return new TexNode('unaryFunc', new TexToken(TexTokenType.COMMAND, '\\mathbb'), [
                    new TexToken(TexTokenType.ELEMENT, node.content.value[0]).toNode()
                ]);
            }
            return typst_token_to_tex(node.content).toNode();
        }
        case 'text':
            return new TexNode('text', new TexToken(TexTokenType.LITERAL, node.content.value));
        case 'group': {
            const args = node.args!.map(convert_typst_node_to_tex);
            if (node.content.value === 'parenthesis') {
                const is_over_high = node.isOverHigh();
                const left_delim = is_over_high ? '\\left(' : '(';
                const right_delim = is_over_high ? '\\right)' : ')';
                args.unshift(new TexToken(TexTokenType.ELEMENT, left_delim).toNode());
                args.push(new TexToken(TexTokenType.ELEMENT, right_delim).toNode());
            }
            return new TexNode('ordgroup', TEX_EMPTY_TOKEN, args);
        }
        case 'funcCall': {
            // special hook for lr
            if (node.content.value === 'lr') {
                const data = node.data as TypstLrData;
                if (data.leftDelim !== null) {
                    let left_delim = apply_escape_if_needed(data.leftDelim);
                    assert(data.rightDelim !== null, "leftDelim has value but rightDelim not");
                    let right_delim = apply_escape_if_needed(data.rightDelim!);
                    // TODO: should be TeXNode('leftright', ...)
                    // But currently writer will output `\left |` while people commonly prefer `\left|`.
                    return new TexNode('ordgroup', TEX_EMPTY_TOKEN, [
                        new TexToken(TexTokenType.ELEMENT, '\\left' + left_delim).toNode(),
                        ...node.args!.map(convert_typst_node_to_tex),
                        new TexToken(TexTokenType.ELEMENT, '\\right' + right_delim).toNode()
                    ]);
                } else {
                    return new TexNode('ordgroup', TEX_EMPTY_TOKEN, node.args!.map(convert_typst_node_to_tex));
                }
            }
            // special hook for norm
            // `\| a  \|` <- `norm(a)`
            // `\left\| a + \frac{1}{3} \right\|` <- `norm(a + 1/3)`
            if (node.content.value === 'norm') {
                const arg0 = node.args![0];
                const tex_node_type = node.isOverHigh() ? 'leftright' : 'ordgroup';
                return new TexNode(tex_node_type, TEX_EMPTY_TOKEN, [
                    new TexToken(TexTokenType.COMMAND, "\\|").toNode(),
                    convert_typst_node_to_tex(arg0),
                    new TexToken(TexTokenType.COMMAND, "\\|").toNode()
                ]);
            }
            // special hook for floor, ceil
            // `\lfloor a \rfloor` <- `floor(a)`
            // `\lceil a \rceil` <- `ceil(a)`
            // `\left\lfloor a \right\rfloor` <- `floor(a)`
            // `\left\lceil a \right\rceil` <- `ceil(a)`
            if (node.content.value === 'floor' || node.content.value === 'ceil') {
                const left = "\\l" + node.content.value;
                const right = "\\r" + node.content.value;
                const arg0 = node.args![0];
                const tex_node_type = node.isOverHigh() ? 'leftright' : 'ordgroup';
                return new TexNode(tex_node_type, TEX_EMPTY_TOKEN, [
                    new TexToken(TexTokenType.COMMAND, left).toNode(),
                    convert_typst_node_to_tex(arg0),
                    new TexToken(TexTokenType.COMMAND, right).toNode()
                ]);
            }
            // special hook for root
            if (node.content.value === 'root') {
                const [degree, radicand] = node.args!;
                const data: TexSqrtData = convert_typst_node_to_tex(degree);
                return new TexNode('unaryFunc', new TexToken(TexTokenType.COMMAND, '\\sqrt'), [convert_typst_node_to_tex(radicand)], data);
            }
            // special hook for overbrace and underbrace
            if (node.content.value === 'overbrace' || node.content.value === 'underbrace') {
                const [body, label] = node.args!;
                const base = new TexNode('unaryFunc', typst_token_to_tex(node.content), [convert_typst_node_to_tex(body)]);
                const script = convert_typst_node_to_tex(label);
                const data = node.content.value === 'overbrace' ? { base, sup: script, sub: null } : { base, sub: script, sup: null };
                return new TexNode('supsub', TEX_EMPTY_TOKEN, [], data);
            }

            // special hook for vec
            // "vec(a, b, c)" -> "\begin{pmatrix}a\\ b\\ c\end{pmatrix}"
            if (node.content.value === 'vec') {
                const tex_data = node.args!.map(convert_typst_node_to_tex).map((n) => [n]) as TexArrayData;
                return new TexNode('beginend', new TexToken(TexTokenType.LITERAL, 'pmatrix'), [], tex_data);
            }

            // special hook for op
            if (node.content.value === 'op') {
                const arg0 = node.args![0];
                assert(arg0.type === 'text');
                return new TexNode('unaryFunc', typst_token_to_tex(node.content), [new TexToken(TexTokenType.LITERAL, arg0.content.value).toNode()]);
            }

            // general case
            const func_name_tex = typst_token_to_tex(node.content);
            if (func_name_tex.value.length > 0 && TEX_UNARY_COMMANDS.includes(func_name_tex.value.substring(1))) {
                return new TexNode('unaryFunc', func_name_tex, node.args!.map(convert_typst_node_to_tex));
            } else if (func_name_tex.value.length > 0 && TEX_BINARY_COMMANDS.includes(func_name_tex.value.substring(1))) {
                return new TexNode('binaryFunc', func_name_tex, node.args!.map(convert_typst_node_to_tex));
            } else {
                return new TexNode('ordgroup', TEX_EMPTY_TOKEN, [
                    new TexNode('symbol', typst_token_to_tex(node.content)),
                    new TexToken(TexTokenType.ELEMENT, '(').toNode(),
                    ...array_intersperse(node.args!.map(convert_typst_node_to_tex), TEX_NODE_COMMA),
                    new TexToken(TexTokenType.ELEMENT, ')').toNode()
                ]);
            }
        }
        case 'supsub': {
            const { base, sup, sub } = node.data as TypstSupsubData;
            let sup_tex: TexNode | null = null;
            let sub_tex: TexNode | null = null;

            if (sup) {
                sup_tex = convert_typst_node_to_tex(sup);
            }
            if (sub) {
                sub_tex = convert_typst_node_to_tex(sub);
            }

            // special hook for limits
            // `limits(+)^a` -> `\overset{a}{+}`
            // `limits(+)_a` -> `\underset{a}{+}`
            // `limits(+)_a^b` -> `\overset{b}{\underset{a}{+}}`
            if (base.content.eq(new TypstToken(TypstTokenType.SYMBOL, 'limits'))) {
                const body_in_limits = convert_typst_node_to_tex(base.args![0]);
                if (sup_tex !== null && sub_tex === null) {
                    return new TexNode('binaryFunc', new TexToken(TexTokenType.COMMAND, '\\overset'), [sup_tex, body_in_limits]);
                } else if (sup_tex === null && sub_tex !== null) {
                    return new TexNode('binaryFunc', new TexToken(TexTokenType.COMMAND, '\\underset'), [sub_tex, body_in_limits]);
                } else {
                    const underset_call = new TexNode('binaryFunc', new TexToken(TexTokenType.COMMAND, '\\underset'), [sub_tex!, body_in_limits]);
                    return new TexNode('binaryFunc', new TexToken(TexTokenType.COMMAND, '\\overset'), [sup_tex!, underset_call]);
                }
            }

            const base_tex = convert_typst_node_to_tex(base);

            const res = new TexNode('supsub', TEX_EMPTY_TOKEN, [], {
                base: base_tex,
                sup: sup_tex,
                sub: sub_tex
            });
            return res;
        }
        case 'matrix': {
            const typst_data = node.data as TypstNode[][];
            const tex_data = typst_data.map(row => row.map(convert_typst_node_to_tex));
            let env_type = 'pmatrix'; // typst mat use delim:"(" by default
            if (node.options) {
                if ('delim' in node.options) {
                    const delim = node.options.delim;
                    switch (delim.content.value) {
                        case '#none':
                            env_type = 'matrix';
                            break;
                        case '[':
                        case ']':
                            env_type = 'bmatrix';
                            break;
                        case '(':
                        case ')':
                            env_type = 'pmatrix';
                            break;
                        case '{':
                        case '}':
                            env_type = 'Bmatrix';
                            break;
                        case '|':
                            env_type = 'vmatrix';
                            break;
                        case 'bar':
                        case 'bar.v':
                            env_type = 'vmatrix';
                            break;
                        case 'bar.v.double':
                            env_type = 'Vmatrix';
                            break;
                        default:
                            throw new Error(`Unexpected delimiter ${delim.content}`);
                    }
                }
            }
            return new TexNode('beginend', new TexToken(TexTokenType.LITERAL, env_type), [], tex_data);
        }
        case 'cases': {
            const typst_data = node.data as TypstNode[][];
            const tex_data = typst_data.map(row => row.map(convert_typst_node_to_tex));
            return new TexNode('beginend', new TexToken(TexTokenType.LITERAL, 'cases'), [], tex_data);
        }
        case 'fraction': {
            const [numerator, denominator] = node.args!;
            const num_tex = convert_typst_node_to_tex(numerator);
            const den_tex = convert_typst_node_to_tex(denominator);
            return new TexNode('binaryFunc', new TexToken(TexTokenType.COMMAND, '\\frac'), [num_tex, den_tex]);
        }
        default:
            throw new Error('[convert_typst_node_to_tex] Unimplemented type: ' + node.type);
    }
}

