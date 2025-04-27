import { TexNode, TypstNode, TexSupsubData, TypstSupsubData, TexSqrtData, Tex2TypstOptions, TYPST_NONE, TYPST_TRUE, TypstPrimitiveValue, TypstToken, TypstTokenType } from "./types";
import { TypstWriterError } from "./typst-writer";
import { symbolMap, reverseSymbolMap } from "./map";

// symbols that are supported by Typst but not by KaTeX
const TYPST_INTRINSIC_SYMBOLS = [
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
    } else if (token === '\\|') {
        // \| in LaTeX is double vertical bar looks like ||
        return 'parallel';
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


// \overset{X}{Y} -> op(Y, limits: #true)^X
// and with special case \overset{\text{def}}{=} -> eq.def
function convert_overset(node: TexNode, options: Tex2TypstOptions): TypstNode {
    const [sup, base] = node.args!;

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
    const op_call = new TypstNode(
        'funcCall',
        'op',
        [convert_tex_node_to_typst(base, options)]
    );
    op_call.setOptions({ limits: TYPST_TRUE });
    return new TypstNode(
        'supsub',
        '',
        [],
        {
            base: op_call,
            sup: convert_tex_node_to_typst(sup, options),
        }
    );
}


export function convert_tex_node_to_typst(node: TexNode, options: Tex2TypstOptions = {}): TypstNode {
    switch (node.type) {
        case 'empty':
            return new TypstNode('empty', '');
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
        case 'text':
            return new TypstNode('text', node.content);
        case 'comment':
            return new TypstNode('comment', node.content);
        case 'supsub': {
            let { base, sup, sub } = node.data as TexSupsubData;

            // Special logic for overbrace
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
            if (data.base.type === 'empty') {
                data.base = new TypstNode('text', '');
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
            const [left, body, right] = node.args!;
            // These pairs will be handled by Typst compiler by default. No need to add lr()
            const group: TypstNode = new TypstNode(
                'group',
                '',
                node.args!.map((n) => convert_tex_node_to_typst(n, options))
            );
            if ([
                "[]", "()", "\\{\\}",
                "\\lfloor\\rfloor",
                "\\lceil\\rceil",
                "\\lfloor\\rceil",
            ].includes(left.content + right.content)) {
                return group;
            }
            // "\left\{ A \right." -> "{A"
            // "\left. A \right\}" -> "lr( A} )"
            if (right.content === '.') {
                group.args!.pop();
                return group;
            } else if (left.content === '.') {
                group.args!.shift();
                return new TypstNode('funcCall', 'lr', [group]);
            }
            return new TypstNode(
                'funcCall',
                'lr',
                [group]
            );
        }
        case 'binaryFunc': {
            if (node.content === '\\overset') {
                return convert_overset(node, options);
            }
            // \frac{a}{b} -> a / b
            if (node.content === '\\frac') {
                if(options.fracToSlash) {
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
            // \mathbf{a} -> upright(mathbf(a))
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
            // \mathbb{R} -> RR
            if (node.content === '\\mathbb' && arg0.type === 'atom' && /^[A-Z]$/.test(arg0.content)) {
                return new TypstNode('symbol', arg0.content + arg0.content);
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
                const body = node.args!;
                if (body.length !== 1 || body[0].type !== 'text') {
                    throw new TypstWriterError(`Expecting body of \\operatorname to be text but got`, node);
                }
                const text = body[0].content;

                if (TYPST_INTRINSIC_SYMBOLS.includes(text)) {
                    return new TypstNode('symbol', text);
                } else {
                    return new TypstNode(
                        'funcCall',
                        'op',
                        [new TypstNode('text', text)]
                    );
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

            if (node.content!.startsWith('align')) {
                // align, align*, alignat, alignat*, aligned, etc.
                return new TypstNode('align', '', [], data);
            }
            if (node.content!.endsWith('matrix')) {
                let delim: TypstPrimitiveValue = null;
                switch (node.content) {
                    case 'matrix':
                        delim = TYPST_NONE;
                        break;
                    case 'pmatrix':
                        delim = '(';
                        break;
                    case 'bmatrix':
                        delim = '[';
                        break;
                    case 'Bmatrix':
                        delim = '{';
                        break;
                    case 'vmatrix':
                        delim = '|';
                        break;
                    case 'Vmatrix': {
                        delim = new TypstToken(TypstTokenType.SYMBOL, 'bar.v.double');
                        break;
                    }
                    default:
                        throw new TypstWriterError(`Unimplemented beginend: ${node.content}`, node);
                }
                const res = new TypstNode('matrix', '', [], data);
                res.setOptions({ 'delim': delim });
                return res;
            }
            throw new TypstWriterError(`Unimplemented beginend: ${node.content}`, node);
        }
        case 'unknownMacro':
            return new TypstNode('unknown', tex_token_to_typst(node.content));
        case 'control':
            if (node.content === '\\\\') {
                return new TypstNode('symbol', '\\');
            } else if (node.content === '\\,') {
                return new TypstNode('symbol', 'thin');
            } else {
                throw new TypstWriterError(`Unknown control sequence: ${node.content}`, node);
            }
        default:
            throw new TypstWriterError(`Unimplemented node type: ${node.type}`, node);
    }
}



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
];

const TYPST_BINARY_FUNCTIONS: string[] = [
    'frac',
    'root',
    'overbrace',
    'underbrace',
];

function apply_escape_if_needed(c: string) {
    if (['{', '}', '%'].includes(c)) {
        return '\\' + c;
    }
    return c;
}

function typst_token_to_tex(token: string): string {
    if (/^[a-zA-Z0-9]$/.test(token)) {
        return token;
    } else if (token === 'thin') {
        return '\\,';
    } else if (reverseSymbolMap.has(token)) {
        return '\\' + reverseSymbolMap.get(token)!;
    }
    return '\\' + token;
}



export function convert_typst_node_to_tex(node: TypstNode): TexNode {
    // special hook for eq.def
    if (node.eq(new TypstNode('symbol', 'eq.def'))) {
        return new TexNode('binaryFunc', '\\overset', [
            new TexNode('text', 'def'),
            new TexNode('element', '=')
        ]);
    }
    switch (node.type) {
        case 'empty':
            return new TexNode('empty', '');
        case 'whitespace':
            return new TexNode('whitespace', node.content);
        case 'atom':
            return new TexNode('element', node.content);
        case 'symbol':
            switch (node.content) {
                // special hook for comma
                case 'comma':
                    return new TexNode('element', ',');
                // special hook for hyph and hyph.minus
                case 'hyph':
                case 'hyph.minus':
                    return new TexNode('text', '-');
                default:
                    return new TexNode('symbol', typst_token_to_tex(node.content));
            }
        case 'text':
            return new TexNode('text', node.content);
        case 'comment':
            return new TexNode('comment', node.content);
        case 'group': {
            const args = node.args!.map(convert_typst_node_to_tex);
            return new TexNode('ordgroup', node.content, args);
        }
        case 'funcCall': {
            if (TYPST_UNARY_FUNCTIONS.includes(node.content)) {
                // special hook for lr
                if (node.content === 'lr') {
                    const body = node.args![0];
                    if (body.type === 'group') {
                        let left_delim = body.args![0].content;
                        let right_delim = body.args![body.args!.length - 1].content;
                        left_delim = apply_escape_if_needed(left_delim);
                        right_delim = apply_escape_if_needed(right_delim);
                        return new TexNode('ordgroup', '', [
                            new TexNode('element', '\\left' + left_delim),
                            ...body.args!.slice(1, body.args!.length - 1).map(convert_typst_node_to_tex),
                            new TexNode('element', '\\right' + right_delim)
                        ]);
                    }
                }
                const command = typst_token_to_tex(node.content);
                return new TexNode('unaryFunc', command, node.args!.map(convert_typst_node_to_tex));
            } else if (TYPST_BINARY_FUNCTIONS.includes(node.content)) {
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
                const command = typst_token_to_tex(node.content);
                return new TexNode('binaryFunc', command, node.args!.map(convert_typst_node_to_tex));
            } else {
                return new TexNode('ordgroup', '', [
                    new TexNode('symbol', typst_token_to_tex(node.content)),
                    new TexNode('element', '('),
                    ...node.args!.map(convert_typst_node_to_tex),
                    new TexNode('element', ')')
                ]);
            }
        }
        case 'supsub': {
            const { base, sup, sub } = node.data as TypstSupsubData;
            const base_tex = convert_typst_node_to_tex(base);
            let sup_tex: TexNode | undefined;
            let sub_tex: TexNode | undefined;
            if (sup) {
                sup_tex = convert_typst_node_to_tex(sup);
            }
            if (sub) {
                sub_tex = convert_typst_node_to_tex(sub);
            }
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
            const matrix = new TexNode('beginend', 'matrix', [], tex_data);
            let left_delim = "\\left(";
            let right_delim = "\\right)";
            if (node.options) {
                if ('delim' in node.options) {
                    switch (node.options.delim) {
                        case TYPST_NONE:
                            return matrix;
                        case '[':
                            left_delim = "\\left[";
                            right_delim = "\\right]";
                            break;
                        case ']':
                            left_delim = "\\left]";
                            right_delim = "\\right[";
                            break;
                        case '{':
                            left_delim = "\\left\\{";
                            right_delim = "\\right\\}";
                            break;
                        case '}':
                            left_delim = "\\left\\}";
                            right_delim = "\\right\\{";
                            break;
                        case '|':
                            left_delim = "\\left|";
                            right_delim = "\\right|";
                            break;
                        case ')':
                            left_delim = "\\left)";
                            right_delim = "\\right(";
                        case '(':
                        default:
                            left_delim = "\\left(";
                            right_delim = "\\right)";
                            break;
                    }
                }
            }
            return new TexNode('ordgroup', '', [
                new TexNode('element', left_delim),
                matrix,
                new TexNode('element', right_delim)
            ]);
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

