interface IEquatable {
    eq(other: IEquatable): boolean;
}


export function array_find<T extends IEquatable>(array: T[], item: T, start: number = 0): number {
    for (let i = start; i < array.length; i++) {
        if (array[i].eq(item)) {
            return i;
        }
    }
    return -1;
}

export function array_includes<T extends IEquatable>(array: T[], item: T): boolean {
    for (const i of array) {
        if (i.eq(item)) {
            return true;
        }
    }
    return false;
}

export function array_split<T extends IEquatable>(array: T[], sep: T): T[][] {
    const res: T[][] = [];
    let current_slice: T[] = [];
    for (const i of array) {
        if (i.eq(sep)) {
            res.push(current_slice);
            current_slice = [];
        } else {
            current_slice.push(i);
        }
    }
    res.push(current_slice);
    return res;
}

// e.g. input array=['a', 'b', 'c'], sep = '+'
// return ['a','+', 'b', '+','c']
export function array_join<T>(array: T[], sep: T): T[] {
    const res: T[] = [];
    for (let i = 0; i < array.length; i++) {
        res.push(array[i]);
        if (i != array.length - 1) {
            res.push(sep);
        }
    }
    return res;
}