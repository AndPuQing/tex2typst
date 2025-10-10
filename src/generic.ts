interface IEquatable {
    eq(other: IEquatable): boolean;
}

export function array_equal<T extends IEquatable>(a: T[], b: T[]): boolean {
    /*
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (!a[i].eq(b[i])) {
            return false;
        }
    }
    return true;
    */
    return a.length === b.length && a.every((x, i) => x.eq(b[i]));
}

export function array_find<T extends IEquatable>(array: T[], item: T, start: number = 0): number {
    /*
    for (let i = start; i < array.length; i++) {
        if (array[i].eq(item)) {
            return i;
        }
    }
    return -1;
    */
    const index = array.slice(start).findIndex((x) => x.eq(item));
    return index === -1 ? -1 : index + start;
}

export function array_includes<T extends IEquatable>(array: T[], item: T): boolean {
    /*
    for (const x of array) {
        if (x.eq(item)) {
            return true;
        }
    }
    return false;
    */
    return array.some((x) => x.eq(item));
}

// e.g. input array=['a', 'b', '+', 'c', '+', 'd', 'e'], sep = '+'
// return [['a', 'b'], ['c'], ['d', 'e']]
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
export function array_intersperse<T>(array: T[], sep: T): T[] {
    /*
    const res: T[] = [];
    for (let i = 0; i < array.length; i++) {
        res.push(array[i]);
        if (i != array.length - 1) {
            res.push(sep);
        }
    }
    return res;
    */
    return array.flatMap((x, i) => i !== array.length - 1? [x, sep]: [x]);
}