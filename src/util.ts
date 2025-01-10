
export function isalpha(char: string): boolean {
    return 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.includes(char);
}

export function isdigit(char: string): boolean {
    return '0123456789'.includes(char);
}

export function assert(condition: boolean, message: string = ''): void {
    if (!condition) {
        throw new Error(message);
    }
}
