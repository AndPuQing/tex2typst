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