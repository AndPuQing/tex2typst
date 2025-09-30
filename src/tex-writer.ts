import { array_includes, array_split } from "./generic";
import { TexNode, TexToken, TexTokenType } from "./types";

const EMPTY_TOKEN: TexToken = new TexToken(TexTokenType.EMPTY, '');

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
        const alignment_char = new TexToken(TexTokenType.CONTROL, '&').toNode();
        const newline_char = new TexToken(TexTokenType.CONTROL, '\\\\').toNode();

        // TODO: this should happen in the converter instead
        if (node.type === 'ordgroup' && array_includes(node.args!, alignment_char)) {
            // wrap the whole math formula with \begin{aligned} and \end{aligned}
            const rows = array_split(node.args!, newline_char);
            const data: TexNode[][] = [];
            for(const row of rows) {
                const cells = array_split(row, alignment_char);
                data.push(cells.map(cell => new TexNode('ordgroup', EMPTY_TOKEN, cell)));
            }
            node = new TexNode('beginend', new TexToken(TexTokenType.CONTROL, 'aligned'), [], data);
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

