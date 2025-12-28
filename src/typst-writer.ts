import { TexNode } from "./tex-types";
import { TypstNode, TypstWriterOptions } from "./typst-types";
import { TypstToken } from "./typst-types";
import { TypstTokenType } from "./typst-types";


const TYPST_NEWLINE: TypstToken = new TypstToken(TypstTokenType.SYMBOL, '\n');

const SOFT_SPACE = new TypstToken(TypstTokenType.CONTROL, ' ');

export class TypstWriterError extends Error {
    node: TexNode | TypstNode | TypstToken;

    constructor(message: string, node: TexNode | TypstNode | TypstToken) {
        super(message);
        this.name = "TypstWriterError";
        this.node = node;
    }
}



export class TypstWriter {
    protected buffer: string = "";
    protected queue: TypstToken[] = [];

    private options: TypstWriterOptions;

    constructor(options: TypstWriterOptions) {
        this.options = options;
    }


    // Serialize a tree of TypstNode into a list of TypstToken
    public serialize(abstractNode: TypstNode) {
        const env = {insideFunctionDepth: 0};
        this.queue.push(...abstractNode.serialize(env, this.options));
    }


    protected flushQueue() {
        const queue1 = this.queue.filter((token) => token.value !== '');

        // merge consecutive soft spaces
        let qu: TypstToken[] = [];
        for(const token of queue1) {
            if (token.eq(SOFT_SPACE) && qu.length > 0 && qu[qu.length - 1].eq(SOFT_SPACE)) {
                continue;
            }
            qu.push(token);
        }

        // delete soft spaces before or after a newline
        const dummy_token = new TypstToken(TypstTokenType.SYMBOL, '');
        for(let i = 0; i < qu.length; i++) {
            let token = qu[i];
            if (token.eq(SOFT_SPACE)) {
                const to_delete = (i === 0)
                                || (i === qu.length - 1)
                                || (qu[i - 1].type === TypstTokenType.SPACE)
                                || qu[i - 1].eq(TYPST_NEWLINE)
                                || qu[i + 1].eq(TYPST_NEWLINE);
                if (to_delete) {
                    qu[i] = dummy_token;
                }
            }
        }

        for(const token of qu) {
            this.buffer += token.toString();
        }

        this.queue = [];
    }

    public finalize(): string {
        this.flushQueue();
        const smartFloorPass = function (input: string): string {
            // Use regex to replace all "floor.l xxx floor.r" with "floor(xxx)"
            let res = input.replace(/floor\.l\s*(.*?)\s*floor\.r/g, "floor($1)");
            // Typst disallow "floor()" with empty argument, so add am empty string inside if it's empty.
            res = res.replace(/floor\(\)/g, 'floor("")');
            return res;
        };
        const smartCeilPass = function (input: string): string {
            // Use regex to replace all "ceil.l xxx ceil.r" with "ceil(xxx)"
            let res = input.replace(/ceil\.l\s*(.*?)\s*ceil\.r/g, "ceil($1)");
            // Typst disallow "ceil()" with empty argument, so add an empty string inside if it's empty.
            res = res.replace(/ceil\(\)/g, 'ceil("")');
            return res;
        }
        const smartRoundPass = function (input: string): string {
            // Use regex to replace all "floor.l xxx ceil.r" with "round(xxx)"
            let res = input.replace(/floor\.l\s*(.*?)\s*ceil\.r/g, "round($1)");
            // Typst disallow "round()" with empty argument, so add an empty string inside if it's empty.
            res = res.replace(/round\(\)/g, 'round("")');
            return res;
        }
        if (this.options.optimize) {
            const all_passes = [smartFloorPass, smartCeilPass, smartRoundPass];
            for (const pass of all_passes) {
                this.buffer = pass(this.buffer);
            }
        }
        // "& =" -> "&="
        this.buffer = this.buffer.replace(/& =/g, '&=');
        return this.buffer;
    }
}
