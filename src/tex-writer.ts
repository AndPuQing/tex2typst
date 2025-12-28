import { TexNode, TexToken, TexTokenType, writeTexTokenBuffer } from "./tex-types";



export class TexWriter {
    protected buffer: string = "";
    queue: TexToken[] = [];


    public append(node: TexNode) {
        this.queue = this.queue.concat(node.serialize());
    }

    protected flushQueue() {
        for (let i = 0; i < this.queue.length; i++) {
            this.buffer = writeTexTokenBuffer(this.buffer, this.queue[i]);
        }
        this.queue = [];
    }

    public finalize(): string {
        this.flushQueue();
        // "\displaystyle \displaystyle" -> "\displaystyle"
        this.buffer = this.buffer.replace(/\\displaystyle \\displaystyle/g, "\\displaystyle");
        // "\textstyle \textstyle" -> "\textstyle"
        this.buffer = this.buffer.replace(/\\textstyle \\textstyle/g, "\\textstyle");
        // remove \textstyle or \displaystyle if it is the end
        this.buffer = this.buffer.replace(/\s?\\textstyle\s?$/, "");
        this.buffer = this.buffer.replace(/\s?\\displaystyle\s?$/, "");
        return this.buffer;
    }
}

