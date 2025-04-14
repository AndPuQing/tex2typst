/**
 * Adapted from jslex - A lexer in JavaScript. https://github.com/jimbojw/jslex
 * Licensed under MIT license
 */


interface ILexSpec<T> {
    start: Map<string, (arg0: ILexApi) => T | T[]>;
}

interface IRule<T> {
    re: RegExp;
    action: (a: ILexApi) => T | T[];
}

interface IMatch<T> {
    index: number;
    text: string;
    len: number;
    rule: IRule<T>;
}

export interface ILexApi {
    text: string | null;
    leng: number | null;
    pos: number | null;
    line: number | null;
    column: number | null;
    input: () => string;
    unput: () => number;
    less: (n: number) => number;
    pushback: (n: number) => number;
    reject: () => void;
    begin: (state: string) => string;
    state: () => string;
}


// End of File marker
const EOF = {};

/**
 * Utility function for comparing two matches.
 * @param {object} m1 Left-hand side match.
 * @param {object} m2 Right-hand side match.
 * @return {int} Difference between the matches.
 */
function matchcompare<T>(m1: IMatch<T>, m2: IMatch<T>): number {
    if(m2.len !== m1.len) {
        return m2.len - m1.len;
    } else {
        return m1.index - m2.index;
    }
}


export class JSLex<T> {
    public states: string[];
    public specification: Record<string, IRule<T>[]>;

    constructor(spec: ILexSpec<T>) {
        this.states = Object.keys(spec);
        this.specification = {};
    
        // build out internal representation of the provided spec
        for (const s of this.states) {
            // e.g. s = "start"
            const rule_map = spec[s] as Map<string, (arg0: ILexApi) => T | T[]>;
    
            if (s in this.specification) {
                throw "Duplicate state declaration encountered for state '" + s + "'";
            }
    
            this.specification[s] = [] as IRule<T>[];
    
            for (const [k,v] of rule_map.entries()) {
                let re: RegExp;
                try {
                    re = new RegExp('^' + k);
                } catch (err) {
                    throw "Invalid regexp '" + k + "' in state '" + s + "' (" + (err as Error).message + ")";
                }
                this.specification[s].push({
                    re: re,
                    action: v
                });
            }
        }
    }

    /**
     * Scanner function - makes a new scanner object which is used to get tokens one at a time.
     * @param {string} input Input text to tokenize.
     * @return {function} Scanner function.
     */
    public scanner(input: string): () => T | T[] {
        var
            // avoid ambiguity between the lexer and the api object
            states = this.states,
            specification = this.specification,

            // position within input stream
            pos = 0,

            // current line number
            line = 0,

            // curret column number
            col = 0,

            offset,
            less,
            go,
            newstate,

            // initial state
            state = states[0];

        /**
         * The api object will be set to "this" when executing spec callbacks.
         */
        const api: ILexApi = {
            /**
             * Analogous to yytext and yyleng in lex - will be set during scan.
             */
            text: null,
            leng: null,

            /**
             * Position of in stream, line number and column number of match.
             */
            pos: null,
            line: null,
            column: null,

            /**
             * Analogous to input() in lex.
             * @return {string} The next character in the stream.
             */
            input: function () {
                return input.charAt(pos + this.leng! + offset++);
            },

            /**
             * Similar to unput() in lex, but does not allow modifying the stream.
             * @return {int} The offset position after the operation.
             */
            unput: function () {
                return offset = offset > 0 ? offset-- : 0;
            },

            /**
             * Analogous to yyless(n) in lex - retains the first n characters from this pattern, and returns 
             * the rest to the input stream, such that they will be used in the next pattern-matching operation.
             * @param {int} n Number of characters to retain.
             * @return {int} Length of the stream after the operation has completed.
             */
            less: function (n) {
                less = n;
                offset = 0;
                this.text = this.text!.substring(0, n);
                return this.leng = this.text.length;
            },

            /**
             * Like less(), but instead of retaining the first n characters, it chops off the last n.
             * @param {int} n Number of characters to chop.
             * @return {int} Length of the stream after the operation has completed.
             */
            pushback: function (n) {
                return this.less(this.leng! - n);
            },

            /**
             * Similar to REJECT in lex, except it doesn't break the current execution context.
             * TIP: reject() should be the last instruction in a spec callback.
             */
            reject: function () {
                go = true;
            },

            /**
             * Analogous to BEGIN in lex - sets the named state (start condition).
             * @param {string|int} state Name of state to switch to, or ordinal number (0 is first, etc).
             * @return {string} The new state on successful switch, throws exception on failure.
             */
            begin: function (state) {
                if (specification[state]) {
                    return newstate = state;
                }
                var s = states[parseInt(state)];
                if (s) {
                    return newstate = s;
                }
                throw "Unknown state '" + state + "' requested";
            },

            /**
             * Simple accessor for reading in the current state.
             * @return {string} The current state.
             */
            state: function () {
                return state;
            }
        };

        /**
         * Scan method to be returned to caller - grabs the next token and fires appropriate calback.
         * @return {T} The next token extracted from the stream.
         */
        function scan(): T | T[] {
            if (pos >= input.length) {
                return EOF as T;
            }

            api.pos = pos;
            api.line = line;
            api.column = col;

            const str = input.substring(pos);
            const rules = specification[state];
            const matches: IMatch<T>[] = [];
            for (let i = 0; i < rules.length; i++) {
                const rule = rules[i];
                const mt = str.match(rule.re);
                if (mt !== null && mt[0].length > 0) {
                    matches.push({
                        index: i,
                        text: mt[0],
                        len: mt[0].length,
                        rule: rule
                    });
                }
            }
            if (matches.length === 0) {
                throw new Error("No match found for input '" + str + "'");
            }
            matches.sort(matchcompare);
            go = true;

            let result: T | T[];
            let m: IMatch<T>;
            for (let j = 0, n = matches.length; j < n && go; j++) {
                offset = 0;
                less = null;
                go = false;
                newstate = null;
                m = matches[j];
                api.text = m.text;
                api.leng = m.len;
                result = m.rule.action(api);
                if (newstate && newstate != state) {
                    state = newstate;
                    break;
                }
            }
            const text = less === null ? m!.text : m!.text.substring(0, less);
            const len = text.length;
            pos += len + offset;

            const nlm = text.match(/\n/g);
            if (nlm !== null) {
                line += nlm.length;
                col = len - text.lastIndexOf("\n") - 1;
            } else {
                col += len;
            }
            return result!;
        }

        return scan;
    }

    /**
     * Similar to lex's yylex() function, consumes all input, calling calback for each token.
     * @param {string} input Text to lex.
     * @param {function} callback Function to execute for each token.
     */
    public lex(input: string, callback: (arg0: T | T[]) => void) {
        const scan = this.scanner(input);
        while (true) {
            const token = scan();
            if (token === EOF) {
                return;
            }
            if (token !== undefined) {
                callback(token);
            }
        }
    }

    /**
     * Consumes all input, collecting tokens along the way.
     * @param {string} input Text to lex.
     * @return {array} List of tokens, may contain an Error at the end.
     */
    public collect(input: string): T[] {
        const tokens: T[] = [];
        const callback = (token: T) => { tokens.push(token); };
        this.lex(input, callback as (arg0: T|T[]) => void);
        return tokens;
    }
};
