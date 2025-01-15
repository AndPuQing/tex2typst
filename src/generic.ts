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