import { TexNode, TexToken, writeTexTokenBuffer } from "./types";



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
        return this.buffer;
    }
}

