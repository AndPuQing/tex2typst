import { array_includes, array_split } from "./generic";
import { reverseSymbolMap } from "./map";
import { TexNode, TexToken, TexSqrtData, TexSupsubData, TexTokenType, TypstNode, TypstSupsubData } from "./types";

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


export class TexWriter {
    protected buffer: string = "";
    queue: TexToken[] = [];

    private writeBuffer(token: TexToken) {
        const str = token.toString();

        let no_need_space = false;
        if (token.type === TexTokenType.SPACE) {
            no_need_space = true;
        } else {
            // putting the first token in clause
            no_need_space ||= /[{\(\[\|]$/.test(this.buffer);
            // opening a optional [] parameter for a command
            no_need_space ||= /\\\w+$/.test(this.buffer) && str === '[';
            // putting a punctuation
            no_need_space ||= /^[\.,;:!\?\(\)\]{}_^]$/.test(str);
            no_need_space ||= ['\\{', '\\}'].includes(str);
            // putting a prime
            no_need_space ||= str === "'";
            // putting a subscript or superscript
            no_need_space ||= this.buffer.endsWith('_') || this.buffer.endsWith('^');
            // buffer ends with a whitespace
            no_need_space ||= /\s$/.test(this.buffer);
            // token starts with a space
            no_need_space ||= /^\s/.test(str);
            // buffer is empty
            no_need_space ||= this.buffer === '';
            // leading sign. e.g. produce "+1" instead of " +1"
            no_need_space ||= /[\(\[{]\s*(-|\+)$/.test(this.buffer) || this.buffer === '-' || this.buffer === '+';
            // "&=" instead of "& ="
            no_need_space ||= this.buffer.endsWith('&') && str === '=';
        }

        if (!no_need_space) {
            this.buffer += ' ';
        }
        this.buffer += str;
    }

    public append(node: TexNode) {
        const alignment_char = new TexNode('control', '&');
        const newline_char = new TexNode('control', '\\\\');

        if (node.type === 'ordgroup' && array_includes(node.args!, alignment_char)) {
            // wrap the whole math formula with \begin{aligned} and \end{aligned}
            const rows = array_split(node.args!, newline_char);
            const data: TexNode[][] = [];
            for(const row of rows) {
                const cells = array_split(row, alignment_char);
                data.push(cells.map(cell => new TexNode('ordgroup', '', cell)));
            }
            node = new TexNode('beginend', 'aligned', [], data);
        }
        this.queue = this.queue.concat(node.serialize());
    }

    protected flushQueue() {
        for (let i = 0; i < this.queue.length; i++) {
            this.writeBuffer(this.queue[i]);
        }
        this.queue = [];
    }

    public finalize(): string {
        this.flushQueue();
        return this.buffer;
    }
}

export function convert_typst_node_to_tex(node: TypstNode): TexNode {
    // special hook for eq.def
    if(node.eq(new TypstNode('symbol', 'eq.def'))) {
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
            // special hook for comma
            if (node.content === 'comma') {
                return new TexNode('element', ',');
            }
            return new TexNode('symbol', typst_token_to_tex(node.content));
        case 'text':
            return new TexNode('text', node.content);
        case 'comment':
            return new TexNode('comment', node.content);
        case 'group': {
            const args = node.args!.map(convert_typst_node_to_tex);
            if(node.content === 'parenthesis') {
                args.unshift(new TexNode('element', '('));
                args.push(new TexNode('element', ')'));
            }
            return new TexNode('ordgroup', '', args);
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
                ])
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
                if('delim' in node.options) {
                    switch (node.options.delim) {
                        case '#none':
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

export function typst_token_to_tex(token: string): string {
    if (/^[a-zA-Z0-9]$/.test(token)) {
        return token;
    } else if (token === 'thin') {
        return '\\,';
    } else if (reverseSymbolMap.has(token)) {
        return '\\' + reverseSymbolMap.get(token)!;
    }
    return '\\' + token;
}