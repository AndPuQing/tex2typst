import { reverseSymbolMap } from "./map";
import { TexToken } from "./tex-parser";
import { TexNode, TexSqrtData, TexSupsubData, TexTokenType, TypstNode, TypstSupsubData } from "./types";

const TYPST_UNARY_FUNCTIONS: string[] = [
    'sqrt',
    'bold',
    'arrow',
    'upright',
    'lr',
    'op',
];

const TYPST_BINARY_FUNCTIONS: string[] = [
    'frac',
    'root',
];

function apply_escape_if_needed(c: string) {
    if (['{', '}', '%'].includes(c)) {
        return '\\' + c;
    }
    return c;
}

export class TexWriter {
    protected buffer: string = "";
    protected queue: TexToken[] = [];

    private writeBuffer(token: TexToken) {
        const str = token.value;

        let no_need_space = false;
        if (token.type === TexTokenType.SPACE) {
            no_need_space = true;
        } else {
            // putting the first token in clause
            no_need_space ||= /[{\(\[\|]$/.test(this.buffer) && /^[\w\\\-\+]/.test(str);
            // opening a optional [] parameter for a command
            no_need_space ||= /\\\w+$/.test(this.buffer) && str === '[';
            // putting a punctuation
            no_need_space ||= /^[\.,;:!\?\(\)\]{}_^]$/.test(str);
            no_need_space ||= ['\\{', '\\}'].includes(str);
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
        }

        if (!no_need_space) {
            this.buffer += ' ';
        }
        this.buffer += token.value;
    }

    public serialize(node: TexNode) {
        switch (node.type) {
            case 'empty':
                break;
            case 'element': {
                let c = node.content;
                c = apply_escape_if_needed(c);
                this.queue.push(new TexToken(TexTokenType.ELEMENT, c));
                break;
            }
            case 'symbol':
                this.queue.push(new TexToken(TexTokenType.COMMAND, node.content));
                break;
            case 'text':
                this.queue.push(new TexToken(TexTokenType.TEXT, `\\text{${node.content}}`));
                break;
            case 'comment':
                this.queue.push(new TexToken(TexTokenType.COMMENT, `%${node.content}`));
                break;
            case 'whitespace':
                for (const c of node.content) {
                    const token_type = c === ' ' ? TexTokenType.SPACE : TexTokenType.NEWLINE;
                    this.queue.push(new TexToken(token_type, c));
                }
                break;
            case 'ordgroup':
                for (const item of node.args!) {
                    this.serialize(item);
                }
                break;
            case 'unaryFunc':
                this.queue.push(new TexToken(TexTokenType.COMMAND, node.content));

                // special hook for \sqrt
                if (node.content === '\\sqrt' && node.data) {
                    this.queue.push(new TexToken(TexTokenType.ELEMENT, '['));
                    this.serialize(node.data! as TexSqrtData);
                    this.queue.push(new TexToken(TexTokenType.ELEMENT, ']'));
                }
                // special hook for \operatorname
                if (node.content === '\\operatorname' && node.args!.length === 1 && node.args![0].type === 'text') {
                    const text = node.args![0].content;
                    this.queue.push(new TexToken(TexTokenType.ELEMENT, '{'));
                    this.serialize(new TexNode('symbol', text));
                    this.queue.push(new TexToken(TexTokenType.ELEMENT, '}'));
                    return;
                }

                this.queue.push(new TexToken(TexTokenType.ELEMENT, '{'));
                this.serialize(node.args![0]);
                this.queue.push(new TexToken(TexTokenType.ELEMENT, '}'));
                break;
            case 'binaryFunc':
                this.queue.push(new TexToken(TexTokenType.COMMAND, node.content));
                this.queue.push(new TexToken(TexTokenType.ELEMENT, '{'));
                this.serialize(node.args![0]);
                this.queue.push(new TexToken(TexTokenType.ELEMENT, '}'));
                this.queue.push(new TexToken(TexTokenType.ELEMENT, '{'));
                this.serialize(node.args![1]);
                this.queue.push(new TexToken(TexTokenType.ELEMENT, '}'));
                break;
            case 'supsub': {
                const { base, sup, sub } = node.data! as TexSupsubData;
                this.serialize(base);
                if (sub) {
                    this.queue.push(new TexToken(TexTokenType.CONTROL, '_'));
                    if (sub.type === 'ordgroup' || sub.type === 'supsub') {
                        this.queue.push(new TexToken(TexTokenType.ELEMENT, '{'));
                        this.serialize(sub);
                        this.queue.push(new TexToken(TexTokenType.ELEMENT, '}'));
                    } else {
                        this.serialize(sub);
                    }
                }
                if (sup) {
                    this.queue.push(new TexToken(TexTokenType.CONTROL, '^'));
                    if (sup.type === 'ordgroup' || sup.type === 'supsub') {
                        this.queue.push(new TexToken(TexTokenType.ELEMENT, '{'));
                        this.serialize(sup);
                        this.queue.push(new TexToken(TexTokenType.ELEMENT, '}'));
                    } else {
                        this.serialize(sup);
                    }
                }
                break;
            }
            case 'control': {
                this.queue.push(new TexToken(TexTokenType.CONTROL, node.content));
                break;
            }
            default:
                throw new Error('[TexWriter.serialize] Unimplemented type: ' + node.type);
        }
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
        case 'group':
            return new TexNode('ordgroup', '', node.args!.map(convert_typst_node_to_tex));
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
        default:
            throw new Error('[convert_typst_node_to_tex] Unimplemented type: ' + node.type);
    }
}

export function typst_token_to_tex(token: string): string {
    if (/^[a-zA-Z0-9]$/.test(token)) {
        return token;
    } else if (reverseSymbolMap.has(token)) {
        return '\\' + reverseSymbolMap.get(token)!;
    }
    return '\\' + token;
}