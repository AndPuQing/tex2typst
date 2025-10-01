import { TexNode, TexSupsubData, TexSqrtData, Tex2TypstOptions, TexArrayData, TexToken, TexTokenType } from "./tex-types";
import { TypstNode } from "./typst-types";
import { TypstLrData, TypstNamedParams } from "./typst-types";
import { TypstSupsubData } from "./typst-types";
import { TypstToken } from "./typst-types";
import { TypstTokenType } from "./typst-types";
import { symbolMap, reverseSymbolMap } from "./map";
import { array_includes, array_intersperse, array_split } from "./generic";
import { assert } from "./util";
import { TEX_BINARY_COMMANDS, TEX_UNARY_COMMANDS } from "./tex-tokenizer";


export class ConverterError extends Error {
    node: TexNode | TypstNode;

    constructor(message: string, node: TexNode | TypstNode) {
        super(message);
        this.name = "ConverterError";
        this.node = node;
    }
}

const TYPST_NONE = TypstToken.NONE.toNode();

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
            return TypstToken.NONE;
        case TexTokenType.COMMAND:
            token_type = TypstTokenType.SYMBOL;
            break;
        case TexTokenType.ELEMENT:
            token_type = TypstTokenType.ELEMENT;
            break;
        case TexTokenType.LITERAL:
            // This happens, for example, node={type: 'literal', content: 'myop'} as in `\operatorname{myop}`
            token_type = TypstTokenType.LITERAL;
            break;
        case TexTokenType.COMMENT:
            token_type = TypstTokenType.COMMENT;
            break;
        case TexTokenType.SPACE:
            token_type = TypstTokenType.SPACE;
            break;
        case TexTokenType.NEWLINE:
            token_type = TypstTokenType.NEWLINE;
            break;
        case TexTokenType.CONTROL: {
            if (token.value === '\\\\') {
                // \\ -> \
                return new TypstToken(TypstTokenType.CONTROL, '\\');
            } else if (token.value === '\\!') {
                // \! -> #h(-math.thin.amount)
                return new TypstToken(TypstTokenType.SYMBOL, '#h(-math.thin.amount)');
            } else if (symbolMap.has(token.value.substring(1))) {
                // node.content is one of \, \: \;
                const typst_symbol = symbolMap.get(token.value.substring(1))!;
                return new TypstToken(TypstTokenType.SYMBOL, typst_symbol);
            } else {
                throw new Error(`Unknown control sequence: ${token.value}`);
            }
        }
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
        // \overset{\text{def}}{=} or \overset{def}{=} are considered as eq.def
        if (["\\overset{\\text{def}}{=}", "\\overset{d e f}{=}"].includes(node.toString())) {
            return new TypstToken(TypstTokenType.SYMBOL, 'eq.def').toNode();
        }
    }
    const limits_call = new TypstNode(
        'funcCall',
        new TypstToken(TypstTokenType.SYMBOL, 'limits'),
        [convert_tex_node_to_typst(base, options)]
    );
    return new TypstNode('supsub', null, [], {
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
    return new TypstNode('supsub', null, [], {
            base: limits_call,
            sub: convert_tex_node_to_typst(sub, options),
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
        case 'terminal':
            return tex_token_to_typst(node.head).toNode();
        case 'text': {
            if ((/[^\x00-\x7F]+/).test(node.head.value) && options.nonAsciiWrapper !== "") {
                return new TypstNode(
                    'funcCall',
                    new TypstToken(TypstTokenType.SYMBOL, options.nonAsciiWrapper!),
                    [new TypstToken(TypstTokenType.TEXT, node.head.value).toNode()]
                );
            }
            return new TypstToken(TypstTokenType.TEXT, node.head.value).toNode();
        }
        case 'ordgroup':
            return new TypstNode(
                'group',
                null,
                node.args!.map((n) => convert_tex_node_to_typst(n, options))
            );
        case 'supsub': {
            let { base, sup, sub } = node.data as TexSupsubData;

            // special hook for overbrace
            if (base && base.type === 'unaryFunc' && base.head.value === '\\overbrace' && sup) {
                return new TypstNode(
                    'funcCall',
                    new TypstToken(TypstTokenType.SYMBOL, 'overbrace'),
                    [convert_tex_node_to_typst(base.args![0], options), convert_tex_node_to_typst(sup, options)]
                );
            } else if (base && base.type === 'unaryFunc' && base.head.value === '\\underbrace' && sub) {
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

            if (sup) {
                data.sup = convert_tex_node_to_typst(sup, options);
            }

            if (sub) {
                data.sub = convert_tex_node_to_typst(sub, options);
            }

            return new TypstNode('supsub', null, [], data);
        }
        case 'leftright': {
            const [left, _body, right] = node.args!;
            const [typ_left, typ_body, typ_right] = node.args!.map((n) => convert_tex_node_to_typst(n, options));

            if (options.optimize) {
                // optimization off: "lr(bar.v.double a + 1/2 bar.v.double)"
                // optimization on : "norm(a + 1/2)"
                if (left.head.value === '\\|' && right.head.value === '\\|') {
                    return new TypstNode('funcCall', new TypstToken(TypstTokenType.SYMBOL, 'norm'), [typ_body]);
                }

                // These pairs will be handled by Typst compiler by default. No need to add lr()
                if ([
                    "[]", "()", "\\{\\}",
                    "\\lfloor\\rfloor",
                    "\\lceil\\rceil",
                    "\\lfloor\\rceil",
                ].includes(left.head.value + right.head.value)) {
                    return new TypstNode('group', null, [typ_left, typ_body, typ_right]);
                }
            }

            const group = new TypstNode(
                'group',
                null,
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
            if (right.head.value === '.') {
                typ_left.head.value = escape_curly_or_paren(typ_left.head.value);
                group.args = [typ_left, typ_body];
            } else if (left.head.value === '.') {
                typ_right.head.value = escape_curly_or_paren(typ_right.head.value);
                group.args = [typ_body, typ_right];
            }
            return new TypstNode('funcCall', new TypstToken(TypstTokenType.SYMBOL, 'lr'), [group]);
        }
        case 'binaryFunc': {
            if (node.head.value === '\\overset') {
                return convert_overset(node, options);
            }
            if (node.head.value === '\\underset') {
                return convert_underset(node, options);
            }
            // \frac{a}{b} -> a / b
            if (node.head.value === '\\frac') {
                if (options.fracToSlash) {
                    return new TypstNode(
                        'fraction',
                        null,
                        node.args!.map((n) => convert_tex_node_to_typst(n, options))
                    );
                }
            }
            return new TypstNode(
                'funcCall',
                tex_token_to_typst(node.head),
                node.args!.map((n) => convert_tex_node_to_typst(n, options))
            );
        }
        case 'unaryFunc': {
            const arg0 = convert_tex_node_to_typst(node.args![0], options);
            // \sqrt{3}{x} -> root(3, x)
            if (node.head.value === '\\sqrt' && node.data) {
                const data = convert_tex_node_to_typst(node.data as TexSqrtData, options); // the number of times to take the root
                return new TypstNode(
                    'funcCall',
                    new TypstToken(TypstTokenType.SYMBOL, 'root'),
                    [data, arg0]
                );
            }
            // \mathbf{a} -> upright(bold(a))
            if (node.head.value === '\\mathbf') {
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
            if (node.head.value === '\\overrightarrow') {
                return new TypstNode(
                    'funcCall',
                    new TypstToken(TypstTokenType.SYMBOL, 'arrow'),
                    [arg0]
                );
            }
            // \overleftarrow{AB} -> accent(A B, arrow.l)
            if (node.head.value === '\\overleftarrow') {
                return new TypstNode(
                    'funcCall',
                    new TypstToken(TypstTokenType.SYMBOL, 'accent'),
                    [arg0, new TypstToken(TypstTokenType.SYMBOL, 'arrow.l').toNode()]
                );
            }
            // \operatorname{opname} -> op("opname")
            if (node.head.value === '\\operatorname') {
                // arg0 must be of type 'literal' in this situation
                if (options.optimize) {
                    if (TYPST_INTRINSIC_OP.includes(arg0.head.value)) {
                        return new TypstToken(TypstTokenType.SYMBOL, arg0.head.value).toNode();
                    }
                }
                return new TypstNode('funcCall', new TypstToken(TypstTokenType.SYMBOL, 'op'), [new TypstToken(TypstTokenType.TEXT, arg0.head.value).toNode()]);
            }

            // \substack{a \\ b} -> `a \ b`
            // as in translation from \sum_{\substack{a \\ b}} to sum_(a \ b)
            if (node.head.value === '\\substack') {
                return arg0;
            }

            if(options.optimize) {
                // \mathbb{R} -> RR
                if (node.head.value === '\\mathbb' && /^\\mathbb{[A-Z]}$/.test(node.toString())) {
                    return new TypstToken(TypstTokenType.SYMBOL, arg0.head.value + arg0.head.value).toNode();
                }
                // \mathrm{d} -> dif
                if (node.head.value === '\\mathrm' && node.toString() === '\\mathrm{d}') {
                    return new TypstToken(TypstTokenType.SYMBOL, 'dif').toNode();
                }
            }

            // generic case
            return new TypstNode(
                'funcCall',
                tex_token_to_typst(node.head),
                node.args!.map((n) => convert_tex_node_to_typst(n, options))
            );
        }
        case 'beginend': {
            const matrix = node.data as TexNode[][];
            const data = matrix.map((row) => row.map((n) => convert_tex_node_to_typst(n, options)));

            if (node.head.value.startsWith('align')) {
                // align, align*, alignat, alignat*, aligned, etc.
                return new TypstNode('align', null, [], data);
            }
            if (node.head.value === 'cases') {
                return new TypstNode('cases', null, [], data);
            }
            if (node.head.value === 'subarray') {
                const align_node = node.args![0];
                switch (align_node.head.value) {
                    case 'r':
                        data.forEach(row => row[0].args!.push(new TypstToken(TypstTokenType.CONTROL, '&').toNode()));
                        break;
                    case 'l':
                        data.forEach(row => row[0].args!.unshift(new TypstToken(TypstTokenType.CONTROL, '&').toNode()));
                        break;
                    default:
                        break;
                }
                return new TypstNode('align', null, [], data);
            }
            if (node.head.value === 'array') {
                const np: TypstNamedParams = { 'delim': TYPST_NONE };

                assert(node.args!.length > 0 && node.args![0].head.type === TexTokenType.LITERAL);
                const np_new = convert_tex_array_align_literal(node.args![0].head.value);
                Object.assign(np, np_new);

                const res = new TypstNode('matrix', null, [], data);
                res.setOptions(np);
                return res;
            }
            if (node.head.value.endsWith('matrix')) {
                const res = new TypstNode('matrix', null, [], data);
                let delim: TypstToken;
                switch (node.head.value) {
                    case 'matrix':
                        delim = TypstToken.NONE;
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
                        throw new ConverterError(`Unimplemented beginend: ${node.head}`, node);
                }
                res.setOptions({ 'delim': delim.toNode()});
                return res;
            }
            throw new ConverterError(`Unimplemented beginend: ${node.head}`, node);
        }
        case 'unknownMacro':
            return new TypstNode('unknown', tex_token_to_typst(node.head));

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
            // e.g. Typst `#none^2` is converted to TeX `^2`
            return TexToken.EMPTY;
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


const TEX_NODE_COMMA = new TexToken(TexTokenType.ELEMENT, ',').toNode();

export function convert_typst_node_to_tex(node: TypstNode): TexNode {
    // special hook for eq.def
    if (node.head.eq(new TypstToken(TypstTokenType.SYMBOL, 'eq.def'))) {
        return new TexNode('binaryFunc', new TexToken(TexTokenType.COMMAND, '\\overset'), [
            new TexNode('text', new TexToken(TexTokenType.LITERAL, 'def')),
            new TexToken(TexTokenType.ELEMENT, '=').toNode()
        ]);
    }
    switch (node.type) {
        case 'terminal': {
            if (node.head.type === TypstTokenType.SYMBOL) {
                // special hook for comma
                if(node.head.value === 'comma') {
                    return new TexToken(TexTokenType.ELEMENT, ',').toNode();
                }
                // special hook for dif
                if(node.head.value === 'dif') {
                    return new TexNode('unaryFunc', new TexToken(TexTokenType.COMMAND, '\\mathrm'), [new TexToken(TexTokenType.ELEMENT, 'd').toNode()]);
                }
                // special hook for hyph and hyph.minus
                if(node.head.value === 'hyph' || node.head.value === 'hyph.minus') {
                    return new TexNode('text', new TexToken(TexTokenType.LITERAL, '-'));
                }
                // special hook for mathbb{R} <-- RR
                if(/^([A-Z])\1$/.test(node.head.value)) {
                    return new TexNode('unaryFunc', new TexToken(TexTokenType.COMMAND, '\\mathbb'), [
                        new TexToken(TexTokenType.ELEMENT, node.head.value[0]).toNode()
                    ]);
                }
            }
            if (node.head.type === TypstTokenType.TEXT) {
                return new TexNode('text', new TexToken(TexTokenType.LITERAL, node.head.value));
            }
            return typst_token_to_tex(node.head).toNode();
        }

        case 'group': {
            const args = node.args!.map(convert_typst_node_to_tex);
            const alignment_char = new TexToken(TexTokenType.CONTROL, '&').toNode();
            const newline_char = new TexToken(TexTokenType.CONTROL, '\\\\').toNode();
            if (array_includes(args, alignment_char)) {
                // wrap the whole math formula with \begin{aligned} and \end{aligned}
                const rows = array_split(args, newline_char);
                const data: TexNode[][] = [];
                for(const row of rows) {
                    const cells = array_split(row, alignment_char);
                    data.push(cells.map(cell => new TexNode('ordgroup', null, cell)));
                }
                return new TexNode('beginend', new TexToken(TexTokenType.CONTROL, 'aligned'), [], data);
            }
            if (node.head.value === 'parenthesis') {
                const is_over_high = node.isOverHigh();
                const left_delim = is_over_high ? '\\left(' : '(';
                const right_delim = is_over_high ? '\\right)' : ')';
                args.unshift(new TexToken(TexTokenType.ELEMENT, left_delim).toNode());
                args.push(new TexToken(TexTokenType.ELEMENT, right_delim).toNode());
            }
            return new TexNode('ordgroup', null, args);
        }
        case 'funcCall': {
            // special hook for lr
            if (node.head.value === 'lr') {
                const data = node.data as TypstLrData;
                if (data.leftDelim !== null) {
                    let left_delim = apply_escape_if_needed(data.leftDelim);
                    assert(data.rightDelim !== null, "leftDelim has value but rightDelim not");
                    let right_delim = apply_escape_if_needed(data.rightDelim!);
                    // TODO: should be TeXNode('leftright', ...)
                    // But currently writer will output `\left |` while people commonly prefer `\left|`.
                    return new TexNode('ordgroup', null, [
                        new TexToken(TexTokenType.ELEMENT, '\\left' + left_delim).toNode(),
                        ...node.args!.map(convert_typst_node_to_tex),
                        new TexToken(TexTokenType.ELEMENT, '\\right' + right_delim).toNode()
                    ]);
                } else {
                    return new TexNode('ordgroup', null, node.args!.map(convert_typst_node_to_tex));
                }
            }
            // special hook for norm
            // `\| a  \|` <- `norm(a)`
            // `\left\| a + \frac{1}{3} \right\|` <- `norm(a + 1/3)`
            if (node.head.value === 'norm') {
                const arg0 = node.args![0];
                const tex_node_type = node.isOverHigh() ? 'leftright' : 'ordgroup';
                return new TexNode(tex_node_type, null, [
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
            if (node.head.value === 'floor' || node.head.value === 'ceil') {
                const left = "\\l" + node.head.value;
                const right = "\\r" + node.head.value;
                const arg0 = node.args![0];
                const tex_node_type = node.isOverHigh() ? 'leftright' : 'ordgroup';
                return new TexNode(tex_node_type, null, [
                    new TexToken(TexTokenType.COMMAND, left).toNode(),
                    convert_typst_node_to_tex(arg0),
                    new TexToken(TexTokenType.COMMAND, right).toNode()
                ]);
            }
            // special hook for root
            if (node.head.value === 'root') {
                const [degree, radicand] = node.args!;
                const data: TexSqrtData = convert_typst_node_to_tex(degree);
                return new TexNode('unaryFunc', new TexToken(TexTokenType.COMMAND, '\\sqrt'), [convert_typst_node_to_tex(radicand)], data);
            }
            // special hook for overbrace and underbrace
            if (node.head.value === 'overbrace' || node.head.value === 'underbrace') {
                const [body, label] = node.args!;
                const base = new TexNode('unaryFunc', typst_token_to_tex(node.head), [convert_typst_node_to_tex(body)]);
                const script = convert_typst_node_to_tex(label);
                const data = node.head.value === 'overbrace' ? { base, sup: script, sub: null } : { base, sub: script, sup: null };
                return new TexNode('supsub', null, [], data);
            }

            // special hook for vec
            // "vec(a, b, c)" -> "\begin{pmatrix}a\\ b\\ c\end{pmatrix}"
            if (node.head.value === 'vec') {
                const tex_data = node.args!.map(convert_typst_node_to_tex).map((n) => [n]) as TexArrayData;
                return new TexNode('beginend', new TexToken(TexTokenType.LITERAL, 'pmatrix'), [], tex_data);
            }

            // special hook for op
            if (node.head.value === 'op') {
                const arg0 = node.args![0];
                assert(arg0.head.type === TypstTokenType.TEXT);
                return new TexNode('unaryFunc', typst_token_to_tex(node.head), [new TexToken(TexTokenType.LITERAL, arg0.head.value).toNode()]);
            }

            // general case
            const func_name_tex = typst_token_to_tex(node.head);
            if (func_name_tex.value.length > 0 && TEX_UNARY_COMMANDS.includes(func_name_tex.value.substring(1))) {
                return new TexNode('unaryFunc', func_name_tex, node.args!.map(convert_typst_node_to_tex));
            } else if (func_name_tex.value.length > 0 && TEX_BINARY_COMMANDS.includes(func_name_tex.value.substring(1))) {
                return new TexNode('binaryFunc', func_name_tex, node.args!.map(convert_typst_node_to_tex));
            } else {
                return new TexNode('ordgroup', null, [
                    typst_token_to_tex(node.head).toNode(),
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
            if (base.head.eq(new TypstToken(TypstTokenType.SYMBOL, 'limits'))) {
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

            const res = new TexNode('supsub', null, [], {
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
                    switch (delim.head.value) {
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
                            throw new Error(`Unexpected delimiter ${delim.head}`);
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

