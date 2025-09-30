import { TexNode, TypstNode, TexSupsubData, TypstSupsubData, TexSqrtData, Tex2TypstOptions, TYPST_NONE, TypstLrData, TexArrayData, TypstNamedParams } from "./types";
import { symbolMap, reverseSymbolMap } from "./map";
import { array_intersperse } from "./generic";
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

function tex_token_to_typst(token: string): string {
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


// \overset{X}{Y} -> limits(Y)^X
// and with special case \overset{\text{def}}{=} -> eq.def
function convert_overset(node: TexNode, options: Tex2TypstOptions): TypstNode {
    const [sup, base] = node.args!;

    if (options.optimize) {
        const is_def = (n: TexNode): boolean => {
            if (n.eq(new TexNode('text', 'def'))) {
                return true;
            }
            // \overset{def}{=} is also considered as eq.def
            if (n.type === 'ordgroup' && n.args!.length === 3) {
                const [a1, a2, a3] = n.args!;
                const d = new TexNode('element', 'd');
                const e = new TexNode('element', 'e');
                const f = new TexNode('element', 'f');
                if (a1.eq(d) && a2.eq(e) && a3.eq(f)) {
                    return true;
                }
            }
            return false;
        };
        const is_eq = (n: TexNode): boolean => n.eq(new TexNode('element', '='));
        if (is_def(sup) && is_eq(base)) {
            return new TypstNode('symbol', 'eq.def');
        }
    }
    const limits_call = new TypstNode(
        'funcCall',
        'limits',
        [convert_tex_node_to_typst(base, options)]
    );
    return new TypstNode('supsub', '', [], {
            base: limits_call,
            sup: convert_tex_node_to_typst(sup, options),
    });
}

// \underset{X}{Y} -> limits(Y)_X
function convert_underset(node: TexNode, options: Tex2TypstOptions): TypstNode {
    const [sub, base] = node.args!;

    const limits_call = new TypstNode(
        'funcCall',
        'limits',
        [convert_tex_node_to_typst(base, options)]
    );
    return new TypstNode('supsub', '', [], {
            base: limits_call,
            sub: convert_tex_node_to_typst(sub, options),
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

        np['augment'] = new TypstNode('literal', augment_str);
    }

    const alignments = chars
        .map(c => alignMap[c])
        .filter((x) => x !== undefined)
        .map(s => new TypstNode('literal', s!));

    if (alignments.length > 0) {
        const all_same = alignments.every(item => item.eq(alignments[0]));
        np['align'] = all_same ? alignments[0] : new TypstNode('literal', '#center');
    }
    return np;
}


export function convert_tex_node_to_typst(node: TexNode, options: Tex2TypstOptions = {}): TypstNode {
    switch (node.type) {
        case 'empty':
            return TYPST_NONE;
        case 'whitespace':
            return new TypstNode('whitespace', node.content);
        case 'ordgroup':
            return new TypstNode(
                'group',
                '',
                node.args!.map((n) => convert_tex_node_to_typst(n, options))
            );
        case 'element':
            return new TypstNode('atom', tex_token_to_typst(node.content));
        case 'symbol':
            return new TypstNode('symbol', tex_token_to_typst(node.content));
        case 'text': {
            if ((/[^\x00-\x7F]+/).test(node.content) && options.nonAsciiWrapper !== "") {
                return new TypstNode(
                    'funcCall',
                    options.nonAsciiWrapper!,
                    [new TypstNode('text', node.content)]
                );
            }
            return new TypstNode('text', node.content);
        }
        case 'literal':
            // This happens, for example, node={type: 'literal', content: 'myop'} as in `\operatorname{myop}`
            return new TypstNode('literal', node.content);
        case 'comment':
            return new TypstNode('comment', node.content);
        case 'supsub': {
            let { base, sup, sub } = node.data as TexSupsubData;

            // special hook for overbrace
            if (base && base.type === 'unaryFunc' && base.content === '\\overbrace' && sup) {
                return new TypstNode(
                    'funcCall',
                    'overbrace',
                    [convert_tex_node_to_typst(base.args![0], options), convert_tex_node_to_typst(sup, options)]
                );
            } else if (base && base.type === 'unaryFunc' && base.content === '\\underbrace' && sub) {
                return new TypstNode(
                    'funcCall',
                    'underbrace',
                    [convert_tex_node_to_typst(base.args![0], options), convert_tex_node_to_typst(sub, options)]
                );
            }

            const data: TypstSupsubData = {
                base: convert_tex_node_to_typst(base, options),
            };
            if (data.base.type === 'none') {
                data.base = new TypstNode('none', '');
            }

            if (sup) {
                data.sup = convert_tex_node_to_typst(sup, options);
            }

            if (sub) {
                data.sub = convert_tex_node_to_typst(sub, options);
            }

            return new TypstNode('supsub', '', [], data);
        }
        case 'leftright': {
            const [left, _body, right] = node.args!;
            const [typ_left, typ_body, typ_right] = node.args!.map((n) => convert_tex_node_to_typst(n, options));

            if (options.optimize) {
                // optimization off: "lr(bar.v.double a + 1/2 bar.v.double)"
                // optimization on : "norm(a + 1/2)"
                if (left.content === '\\|' && right.content === '\\|') {
                    return new TypstNode('funcCall', 'norm', [typ_body]);
                }

                // These pairs will be handled by Typst compiler by default. No need to add lr()
                if ([
                    "[]", "()", "\\{\\}",
                    "\\lfloor\\rfloor",
                    "\\lceil\\rceil",
                    "\\lfloor\\rceil",
                ].includes(left.content + right.content)) {
                    return new TypstNode('group', '', [typ_left, typ_body, typ_right]);
                }
            }

            const group = new TypstNode(
                'group',
                '',
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
            if (right.content === '.') {
                typ_left.content = escape_curly_or_paren(typ_left.content);
                group.args = [typ_left, typ_body];
            } else if (left.content === '.') {
                typ_right.content = escape_curly_or_paren(typ_right.content);
                group.args = [typ_body, typ_right];
            }
            return new TypstNode('funcCall', 'lr', [group]);
        }
        case 'binaryFunc': {
            if (node.content === '\\overset') {
                return convert_overset(node, options);
            }
            if (node.content === '\\underset') {
                return convert_underset(node, options);
            }
            // \frac{a}{b} -> a / b
            if (node.content === '\\frac') {
                if (options.fracToSlash) {
                    return new TypstNode(
                        'fraction',
                        '',
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
            if (node.content === '\\sqrt' && node.data) {
                const data = convert_tex_node_to_typst(node.data as TexSqrtData, options); // the number of times to take the root
                return new TypstNode(
                    'funcCall',
                    'root',
                    [data, arg0]
                );
            }
            // \mathbf{a} -> upright(bold(a))
            if (node.content === '\\mathbf') {
                const inner: TypstNode = new TypstNode(
                    'funcCall',
                    'bold',
                    [arg0]
                );
                return new TypstNode(
                    'funcCall',
                    'upright',
                    [inner]
                );
            }
            // \overrightarrow{AB} -> arrow(A B)
            if (node.content === '\\overrightarrow') {
                return new TypstNode(
                    'funcCall',
                    'arrow',
                    [arg0]
                );
            }
            // \overleftarrow{AB} -> accent(A B, arrow.l)
            if (node.content === '\\overleftarrow') {
                return new TypstNode(
                    'funcCall',
                    'accent',
                    [arg0, new TypstNode('symbol', 'arrow.l')]
                );
            }
            // \operatorname{opname} -> op("opname")
            if (node.content === '\\operatorname') {
                // arg0 must be of type 'literal' in this situation
                if (options.optimize) {
                    if (TYPST_INTRINSIC_OP.includes(arg0.content)) {
                        return new TypstNode('symbol', arg0.content);
                    }
                }
                return new TypstNode('funcCall', 'op', [new TypstNode('text', arg0.content)]);
            }

            // \substack{a \\ b} -> `a \ b`
            // as in translation from \sum_{\substack{a \\ b}} to sum_(a \ b)
            if (node.content === '\\substack') {
                return arg0;
            }

            if(options.optimize) {
                // \mathbb{R} -> RR
                if (node.content === '\\mathbb' && arg0.type === 'atom' && /^[A-Z]$/.test(arg0.content)) {
                    return new TypstNode('symbol', arg0.content + arg0.content);
                }
                // \mathrm{d} -> dif
                if (node.content === '\\mathrm' && arg0.eq(new TypstNode('atom', 'd'))) {
                    return new TypstNode('symbol', 'dif');
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

            if (node.content.startsWith('align')) {
                // align, align*, alignat, alignat*, aligned, etc.
                return new TypstNode('align', '', [], data);
            }
            if (node.content === 'cases') {
                return new TypstNode('cases', '', [], data);
            }
            if (node.content === 'subarray') {
                const align_node = node.args![0];
                switch (align_node.content) {
                    case 'r':
                        data.forEach(row => row[0].args!.push(new TypstNode('symbol', '&')));
                        break;
                    case 'l':
                        data.forEach(row => row[0].args!.unshift(new TypstNode('symbol', '&')));
                        break;
                    default:
                        break;
                }
                return new TypstNode('align', '', [], data);
            }
            if (node.content === 'array') {
                const np: TypstNamedParams = { 'delim': TYPST_NONE };

                assert(node.args!.length > 0 && node.args![0].type === 'literal');
                const np_new = convert_tex_array_align_literal(node.args![0].content);
                Object.assign(np, np_new);

                const res = new TypstNode('matrix', '', [], data);
                res.setOptions(np);
                return res;
            }
            if (node.content.endsWith('matrix')) {
                const res = new TypstNode('matrix', '', [], data);
                let delim: TypstNode;
                switch (node.content) {
                    case 'matrix':
                        delim = TYPST_NONE;
                        break;
                    case 'pmatrix':
                        // delim = new TypstNode('text', '(');
                        // break;
                        return res; // typst mat use delim:"(" by default
                    case 'bmatrix':
                        delim = new TypstNode('text', '[');
                        break;
                    case 'Bmatrix':
                        delim = new TypstNode('text', '{');
                        break;
                    case 'vmatrix':
                        delim = new TypstNode('text', '|');
                        break;
                    case 'Vmatrix': {
                        delim = new TypstNode('symbol', 'bar.v.double');
                        break;
                    }
                    default:
                        throw new ConverterError(`Unimplemented beginend: ${node.content}`, node);
                }
                res.setOptions({ 'delim': delim });
                return res;
            }
            throw new ConverterError(`Unimplemented beginend: ${node.content}`, node);
        }
        case 'unknownMacro':
            return new TypstNode('unknown', tex_token_to_typst(node.content));
        case 'control':
            if (node.content === '\\\\') {
                // \\ -> \
                return new TypstNode('symbol', '\\');
            } else if (node.content === '\\!') {
                // \! -> #h(-math.thin.amount)
                return new TypstNode('funcCall', '#h', [
                    new TypstNode('literal', '-math.thin.amount')
                ]);
            } else if (symbolMap.has(node.content.substring(1))) {
                // node.content is one of \, \: \;
                const typst_symbol = symbolMap.get(node.content.substring(1))!;
                return new TypstNode('symbol', typst_symbol);
            } else {
                throw new ConverterError(`Unknown control sequence: ${node.content}`, node);
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

function typst_token_to_tex(token: string): string {
    if (/^[a-zA-Z0-9]$/.test(token)) {
        return token;
    } else if (reverseSymbolMap.has(token)) {
        return '\\' + reverseSymbolMap.get(token)!;
    }
    return '\\' + token;
}


const TEX_NODE_COMMA = new TexNode('element', ',');

export function convert_typst_node_to_tex(node: TypstNode): TexNode {
    // special hook for eq.def
    if (node.eq(new TypstNode('symbol', 'eq.def'))) {
        return new TexNode('binaryFunc', '\\overset', [
            new TexNode('text', 'def'),
            new TexNode('element', '=')
        ]);
    }
    switch (node.type) {
        case 'none':
            // e.g. Typst `#none^2` is converted to TeX `^2`
            return new TexNode('empty', '');
        case 'whitespace':
            return new TexNode('whitespace', node.content);
        case 'atom':
            return new TexNode('element', node.content);
        case 'symbol': {
            // special hook for comma
            if(node.content === 'comma') {
                return new TexNode('element', ',');
            }
            // special hook for dif
            if(node.content === 'dif') {
                return new TexNode('unaryFunc', '\\mathrm', [new TexNode('element', 'd')]);
            }
            // special hook for hyph and hyph.minus
            if(node.content === 'hyph' || node.content === 'hyph.minus') {
                return new TexNode('text', '-');
            }
            // special hook for mathbb{R} <-- RR
            if(/^([A-Z])\1$/.test(node.content)) {
                return new TexNode('unaryFunc', '\\mathbb', [
                    new TexNode('element', node.content[0])
                ]);
            }
            return new TexNode('symbol', typst_token_to_tex(node.content));
        }
        case 'literal':
            return new TexNode('literal', node.content);
        case 'text':
            return new TexNode('text', node.content);
        case 'comment':
            return new TexNode('comment', node.content);
        case 'group': {
            const args = node.args!.map(convert_typst_node_to_tex);
            if (node.content === 'parenthesis') {
                const is_over_high = node.isOverHigh();
                const left_delim = is_over_high ? '\\left(' : '(';
                const right_delim = is_over_high ? '\\right)' : ')';
                args.unshift(new TexNode('element', left_delim));
                args.push(new TexNode('element', right_delim));
            }
            return new TexNode('ordgroup', node.content, args);
        }
        case 'funcCall': {
            // special hook for lr
            if (node.content === 'lr') {
                const data = node.data as TypstLrData;
                if (data.leftDelim !== null) {
                    let left_delim = apply_escape_if_needed(data.leftDelim);
                    assert(data.rightDelim !== null, "leftDelim has value but rightDelim not");
                    let right_delim = apply_escape_if_needed(data.rightDelim!);
                    // TODO: should be TeXNode('leftright', ...)
                    // But currently writer will output `\left |` while people commonly prefer `\left|`.
                    return new TexNode('ordgroup', '', [
                        new TexNode('element', '\\left' + left_delim),
                        ...node.args!.map(convert_typst_node_to_tex),
                        new TexNode('element', '\\right' + right_delim)
                    ]);
                } else {
                    return new TexNode('ordgroup', '', node.args!.map(convert_typst_node_to_tex));
                }
            }
            // special hook for norm
            // `\| a  \|` <- `norm(a)`
            // `\left\| a + \frac{1}{3} \right\|` <- `norm(a + 1/3)`
            if (node.content === 'norm') {
                const arg0 = node.args![0];
                const tex_node_type = node.isOverHigh() ? 'leftright' : 'ordgroup';
                return new TexNode(tex_node_type, '', [
                    new TexNode('symbol', "\\|"),
                    convert_typst_node_to_tex(arg0),
                    new TexNode('symbol', "\\|")
                ]);
            }
            // special hook for floor, ceil
            // `\lfloor a \rfloor` <- `floor(a)`
            // `\lceil a \rceil` <- `ceil(a)`
            // `\left\lfloor a \right\rfloor` <- `floor(a)`
            // `\left\lceil a \right\rceil` <- `ceil(a)`
            if (node.content === 'floor' || node.content === 'ceil') {
                const left = "\\l" + node.content;
                const right = "\\r" + node.content;
                const arg0 = node.args![0];
                const tex_node_type = node.isOverHigh() ? 'leftright' : 'ordgroup';
                return new TexNode(tex_node_type, '', [
                    new TexNode('symbol', left),
                    convert_typst_node_to_tex(arg0),
                    new TexNode('symbol', right)
                ]);
            }
            // special hook for root
            if (node.content === 'root') {
                const [degree, radicand] = node.args!;
                const data: TexSqrtData = convert_typst_node_to_tex(degree);
                return new TexNode('unaryFunc', '\\sqrt', [convert_typst_node_to_tex(radicand)], data);
            }
            // special hook for overbrace and underbrace
            if (node.content === 'overbrace' || node.content === 'underbrace') {
                const [body, label] = node.args!;
                const base = new TexNode('unaryFunc', '\\' + node.content, [convert_typst_node_to_tex(body)]);
                const script = convert_typst_node_to_tex(label);
                const data = node.content === 'overbrace' ? { base, sup: script } : { base, sub: script };
                return new TexNode('supsub', '', [], data);
            }

            // special hook for vec
            // "vec(a, b, c)" -> "\begin{pmatrix}a\\ b\\ c\end{pmatrix}"
            if (node.content === 'vec') {
                const tex_data = node.args!.map(convert_typst_node_to_tex).map((n) => [n]) as TexArrayData;
                return new TexNode('beginend', 'pmatrix', [], tex_data);
            }

            // general case
            const func_name_tex = typst_token_to_tex(node.content);
            if (func_name_tex.length > 0 && TEX_UNARY_COMMANDS.includes(func_name_tex.substring(1))) {
                return new TexNode('unaryFunc', func_name_tex, node.args!.map(convert_typst_node_to_tex));
            } else if (func_name_tex.length > 0 && TEX_BINARY_COMMANDS.includes(func_name_tex.substring(1))) {
                return new TexNode('binaryFunc', func_name_tex, node.args!.map(convert_typst_node_to_tex));
            } else {
                return new TexNode('ordgroup', '', [
                    new TexNode('symbol', typst_token_to_tex(node.content)),
                    new TexNode('element', '('),
                    ...array_intersperse(node.args!.map(convert_typst_node_to_tex), TEX_NODE_COMMA),
                    new TexNode('element', ')')
                ]);
            }
        }
        case 'supsub': {
            const { base, sup, sub } = node.data as TypstSupsubData;
            let sup_tex: TexNode | undefined;
            let sub_tex: TexNode | undefined;

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
            if (base.eq(new TypstNode('funcCall', 'limits'))) {
                const body_in_limits = convert_typst_node_to_tex(base.args![0]);
                if (sup_tex !== undefined && sub_tex === undefined) {
                    return new TexNode('binaryFunc', '\\overset', [sup_tex, body_in_limits]);
                } else if (sup_tex === undefined && sub_tex !== undefined) {
                    return new TexNode('binaryFunc', '\\underset', [sub_tex, body_in_limits]);
                } else {
                    const underset_call = new TexNode('binaryFunc', '\\underset', [sub_tex!, body_in_limits]);
                    return new TexNode('binaryFunc', '\\overset', [sup_tex!, underset_call]);
                }
            }

            const base_tex = convert_typst_node_to_tex(base);

            const res = new TexNode('supsub', '', [], {
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
                    switch (delim.content) {
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
            return new TexNode('beginend', env_type, [], tex_data);
        }
        case 'cases': {
            const typst_data = node.data as TypstNode[][];
            const tex_data = typst_data.map(row => row.map(convert_typst_node_to_tex));
            return new TexNode('beginend', 'cases', [], tex_data);
        }
        case 'control': {
            switch (node.content) {
                case '\\':
                    return new TexNode('control', '\\\\');
                case '&':
                    return new TexNode('control', '&');
                default:
                    throw new Error('[convert_typst_node_to_tex] Unimplemented control: ' + node.content);
            }
        }
        case 'fraction': {
            const [numerator, denominator] = node.args!;
            const num_tex = convert_typst_node_to_tex(numerator);
            const den_tex = convert_typst_node_to_tex(denominator);
            return new TexNode('binaryFunc', '\\frac', [num_tex, den_tex]);
        }
        default:
            throw new Error('[convert_typst_node_to_tex] Unimplemented type: ' + node.type);
    }
}

