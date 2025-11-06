import { TexNode, TexToken, TexTokenType, writeTexTokenBuffer } from "./tex-types";



export class TexWriter {
    protected buffer: string = "";
    queue: TexToken[] = [];


    public append(node: TexNode) {
        this.queue = this.queue.concat(node.serialize());
    }

    protected flushQueue() {
        // remove \textstyle or \displaystyle if it is the end of the math code
        while (this.queue.length > 0) {
            const last_token = this.queue[this.queue.length - 1];
            if (last_token.eq(TexToken.COMMAND_DISPLAYSTYLE) || last_token.eq(TexToken.COMMAND_TEXTSTYLE)) {
                this.queue.pop();
            } else {
                break;
            }
        }
        for (let i = 0; i < this.queue.length; i++) {
            this.buffer = writeTexTokenBuffer(this.buffer, this.queue[i]);
        }
        this.queue = [];
    }

    public finalize(): string {
        this.flushQueue();
        return this.buffer;
    }
}

