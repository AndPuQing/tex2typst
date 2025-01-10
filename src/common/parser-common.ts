import { assert } from "../util";

interface Equality {
    eq(other: Equality): boolean;
}


export function find_closing_match<T extends Equality>(tokens: T[], start: number, leftToken: T, rightToken: T): number {
    assert(tokens[start].eq(leftToken));
    let count = 1;
    let pos = start + 1;

    while (count > 0) {
        if (pos >= tokens.length) {
            throw new Error('Unmatched brackets');
        }
        if (tokens[pos].eq(leftToken)) {
            count += 1;
        } else if (tokens[pos].eq(rightToken)) {
            count -= 1;
        }
        pos += 1;
    }

    return pos - 1;
}
