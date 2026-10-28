// Cifa: the small C-like scripting language used by the event scripts
// (https://github.com/scarsty/cifa). This is a JavaScript implementation of
// the language as used by kys-cpp: the evaluator is written with generators so
// host functions can be asynchronous (talking, battles... run nested game loops)
// while plain computations run synchronously.
import { csprintf, fmtG } from './csprintf.js';

const KEYWORDS = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'goto', 'true', 'false', 'struct']);
const TYPES = new Set(['auto', 'int', 'float', 'double', 'string', 'char', 'void', 'bool', 'long', 'short', 'unsigned', 'signed', 'const']);
const ALT_OPS = {
    and: '&&', and_eq: '&=', bitand: '&', bitor: '|', compl: '~', not: '!', not_eq: '!=', or: '||', or_eq: '|=', xor: '^', xor_eq: '^=',
};
const OPS3 = ['<<=', '>>='];
const OPS2 = ['::', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^='];
const OPS1 = '+-*/%=<>!~&|^?:,;()[]{}.';
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '|=', '^=']);
const BUILTIN_METHODS = new Set(['push_back', 'pop_back', 'resize', 'insert', 'erase', 'clear', 'contains', 'keys']);

export class CifaError extends Error {
    constructor(message, node) {
        super(message);
        this.line = node ? node.line : 0;
        this.col = node ? node.col : 0;
    }
}

class ExitSignal {}

class CifaMap extends Map {}

// ---------------------------------------------------------------- lexer
function tokenize(src) {
    const toks = [];
    let i = 0;
    let line = 1;
    let lineStart = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        if (c === '\n') {
            line++;
            lineStart = i + 1;
            i++;
            continue;
        }
        if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '﻿') {
            i++;
            continue;
        }
        if (c === '/' && src[i + 1] === '/') {
            while (i < n && src[i] !== '\n') {
                i++;
            }
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            i += 2;
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
                if (src[i] === '\n') {
                    line++;
                    lineStart = i + 1;
                }
                i++;
            }
            i += 2;
            continue;
        }
        const col = i - lineStart + 1;
        if (c === '#') {
            // preprocessor lines (#include) are not supported in event scripts
            while (i < n && src[i] !== '\n') {
                i++;
            }
            continue;
        }
        if (c === '"' || c === "'") {
            let j = i + 1;
            while (j < n && src[j] !== c) {
                if (src[j] === '\n') {
                    line++;
                    lineStart = j + 1;
                }
                j++;
            }
            toks.push({ t: 'str', v: src.slice(i + 1, j), line, col });
            i = j + 1;
            continue;
        }
        if (c >= '0' && c <= '9' || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
            let j = i;
            if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
                j += 2;
                while (j < n && /[0-9a-fA-F]/.test(src[j])) {
                    j++;
                }
                toks.push({ t: 'num', v: parseInt(src.slice(i + 2, j), 16) || 0, line, col });
            } else if (c === '0' && (src[i + 1] === 'b' || src[i + 1] === 'B')) {
                j += 2;
                while (j < n && (src[j] === '0' || src[j] === '1')) {
                    j++;
                }
                toks.push({ t: 'num', v: parseInt(src.slice(i + 2, j), 2) || 0, line, col });
            } else {
                while (j < n && /[0-9.]/.test(src[j])) {
                    j++;
                }
                if ((src[j] === 'e' || src[j] === 'E') && /[0-9+-]/.test(src[j + 1] || '')) {
                    j++;
                    if (src[j] === '+' || src[j] === '-') {
                        j++;
                    }
                    while (j < n && /[0-9]/.test(src[j])) {
                        j++;
                    }
                }
                const text = src.slice(i, j);
                let v;
                if (/^0[0-7]+$/.test(text)) {
                    v = parseInt(text, 8);
                } else {
                    v = parseFloat(text);
                }
                // allow C suffixes like 1.0f / 10u / 10l
                while (j < n && /[fFuUlL]/.test(src[j])) {
                    j++;
                }
                toks.push({ t: 'num', v, line, col });
            }
            i = j;
            continue;
        }
        if (/[A-Za-z_]/.test(c) || c.charCodeAt(0) >= 0x80) {
            let j = i + 1;
            while (j < n && (/[A-Za-z0-9_]/.test(src[j]) || src[j].charCodeAt(0) >= 0x80)) {
                j++;
            }
            const word = src.slice(i, j);
            if (ALT_OPS[word]) {
                toks.push({ t: 'op', v: ALT_OPS[word], line, col });
            } else {
                toks.push({ t: 'id', v: word, line, col });
            }
            i = j;
            continue;
        }
        const three = src.slice(i, i + 3);
        const two = src.slice(i, i + 2);
        if (OPS3.includes(three)) {
            toks.push({ t: 'op', v: three, line, col });
            i += 3;
            continue;
        }
        if (OPS2.includes(two)) {
            toks.push({ t: 'op', v: two, line, col });
            i += 2;
            continue;
        }
        if (OPS1.includes(c)) {
            toks.push({ t: 'op', v: c, line, col });
            i++;
            continue;
        }
        throw new CifaError(`unexpected character '${c}'`, { line, col });
    }
    toks.push({ t: 'eof', v: '', line, col: 0 });
    return toks;
}

// ---------------------------------------------------------------- parser
class Parser {
    constructor(tokens, structNames) {
        this.toks = tokens;
        this.p = 0;
        this.functions = new Map();
        this.structs = new Map();
        this.structNames = new Set(structNames);
    }

    peek(o = 0) {
        return this.toks[Math.min(this.p + o, this.toks.length - 1)];
    }

    next() {
        return this.toks[this.p++];
    }

    is(v, o = 0) {
        const t = this.peek(o);
        return (t.t === 'op' || t.t === 'id') && t.v === v;
    }

    isOp(v, o = 0) {
        const t = this.peek(o);
        return t.t === 'op' && t.v === v;
    }

    accept(v) {
        if (this.isOp(v) || (this.peek().t === 'id' && this.peek().v === v)) {
            return this.next();
        }
        return null;
    }

    expect(v) {
        const t = this.accept(v);
        if (!t) {
            const got = this.peek();
            throw new CifaError(`expected '${v}' but got '${got.v || got.t}'`, got);
        }
        return t;
    }

    isType(o = 0) {
        const t = this.peek(o);
        return t.t === 'id' && (TYPES.has(t.v) || this.structNames.has(t.v));
    }

    node(type, tok, props) {
        return { type, line: tok.line, col: tok.col, ...props };
    }

    parseProgram() {
        const tok = this.peek();
        const body = [];
        while (this.peek().t !== 'eof') {
            const fn = this.tryFunctionDef();
            if (fn) {
                continue;
            }
            if (this.tryStructDef()) {
                continue;
            }
            body.push(this.parseStatement());
        }
        return this.makeBlock(body, tok, false);
    }

    makeBlock(body, tok, scope) {
        const labels = new Map();
        body.forEach((s, i) => {
            if (s.type === 'Label') {
                labels.set(s.name, i);
            }
        });
        const b = this.node('Block', tok, { body, labels, scope });
        b.hasCall = body.some((s) => s.hasCall);
        return b;
    }

    // name ( params ) { ... } at the global level, optionally with a return type
    tryFunctionDef() {
        let o = 0;
        while (this.isType(o)) {
            o++;
        }
        const nameTok = this.peek(o);
        if (nameTok.t !== 'id' || KEYWORDS.has(nameTok.v) || !this.isOp('(', o + 1)) {
            return null;
        }
        let depth = 0;
        let k = o + 1;
        for (;; k++) {
            const t = this.peek(k);
            if (t.t === 'eof') {
                return null;
            }
            if (t.t === 'op' && t.v === '(') {
                depth++;
            } else if (t.t === 'op' && t.v === ')') {
                depth--;
                if (depth === 0) {
                    break;
                }
            }
        }
        if (!this.isOp('{', k + 1)) {
            return null;
        }
        this.p += o + 2;
        const params = [];
        while (!this.isOp(')')) {
            while (this.isType()) {
                this.next();
            }
            this.accept('&');
            const t = this.next();
            if (t.t !== 'id') {
                throw new CifaError('bad parameter list', t);
            }
            params.push(t.v);
            if (!this.accept(',')) {
                break;
            }
        }
        this.expect(')');
        const body = this.parseBlock();
        let overloads = this.functions.get(nameTok.v);
        if (!overloads) {
            overloads = new Map();
            this.functions.set(nameTok.v, overloads);
        }
        overloads.set(params.length, { params, body });
        return true;
    }

    tryStructDef() {
        if (!(this.peek().t === 'id' && this.peek().v === 'struct' && this.peek(1).t === 'id' && this.isOp('{', 2))) {
            return false;
        }
        this.next();
        const name = this.next().v;
        this.expect('{');
        const fields = [];
        while (!this.isOp('}')) {
            while (this.isType()) {
                this.next();
            }
            const f = this.next();
            if (f.t === 'id') {
                fields.push(f.v);
            }
            while (this.accept(',')) {
                const g = this.next();
                if (g.t === 'id') {
                    fields.push(g.v);
                }
            }
            this.accept(';');
        }
        this.expect('}');
        this.accept(';');
        this.structs.set(name, fields);
        this.structNames.add(name);
        return true;
    }

    parseBlock() {
        const tok = this.expect('{');
        const body = [];
        while (!this.isOp('}')) {
            if (this.peek().t === 'eof') {
                throw new CifaError('unpaired left bracket {', tok);
            }
            body.push(this.parseStatement());
        }
        this.expect('}');
        return this.makeBlock(body, tok, true);
    }

    endStatement() {
        if (this.accept(';')) {
            return;
        }
        // be tolerant before a closing brace or at the end of the script
        if (this.isOp('}') || this.peek().t === 'eof') {
            return;
        }
        const t = this.peek();
        throw new CifaError(`missing ; before '${t.v}'`, t);
    }

    parseStatement() {
        const t = this.peek();
        if (t.t === 'op') {
            if (t.v === '{') {
                return this.parseBlock();
            }
            if (t.v === ';') {
                this.next();
                return this.node('Empty', t, {});
            }
        }
        if (t.t === 'id') {
            // label:
            if (!KEYWORDS.has(t.v) && this.isOp(':', 1) && !this.isOp(':', 2)) {
                this.next();
                this.next();
                return this.node('Label', t, { name: t.v });
            }
            switch (t.v) {
            case 'if': {
                this.next();
                this.expect('(');
                const cond = this.parseExpr();
                this.expect(')');
                const then = this.parseStatement();
                let els = null;
                if (this.is('else')) {
                    this.next();
                    els = this.parseStatement();
                }
                return this.withCall(this.node('If', t, { cond, then, els }), [cond, then, els]);
            }
            case 'while': {
                this.next();
                this.expect('(');
                const cond = this.parseExpr();
                this.expect(')');
                const body = this.parseStatement();
                return this.withCall(this.node('While', t, { cond, body }), [cond, body]);
            }
            case 'do': {
                this.next();
                const body = this.parseStatement();
                if (!this.is('while')) {
                    throw new CifaError('do while has no condition', t);
                }
                this.next();
                this.expect('(');
                const cond = this.parseExpr();
                this.expect(')');
                this.endStatement();
                return this.withCall(this.node('DoWhile', t, { cond, body }), [cond, body]);
            }
            case 'for':
                return this.parseFor();
            case 'switch':
                return this.parseSwitch();
            case 'return': {
                this.next();
                let e = null;
                if (!this.isOp(';') && !this.isOp('}')) {
                    e = this.parseExpr();
                }
                this.endStatement();
                return this.withCall(this.node('Return', t, { e }), [e]);
            }
            case 'break':
                this.next();
                this.endStatement();
                return this.node('Break', t, {});
            case 'continue':
                this.next();
                this.endStatement();
                return this.node('Continue', t, {});
            case 'goto': {
                this.next();
                const l = this.next();
                this.endStatement();
                return this.node('Goto', t, { label: l.v });
            }
            case 'case':
            case 'default':
                throw new CifaError(`${t.v} outside of switch`, t);
            default:
                break;
            }
            if (this.isType() && this.peek(1).t === 'id' && !this.isOp('(', 1)) {
                const d = this.parseDecl();
                this.endStatement();
                return d;
            }
        }
        const e = this.parseExpr();
        this.endStatement();
        return this.withCall(this.node('ExprStmt', t, { e }), [e]);
    }

    withCall(node, children) {
        node.hasCall = children.some((c) => c && c.hasCall);
        return node;
    }

    // int a = 1, b[], c;   Point p;
    parseDecl() {
        const tok = this.peek();
        let structType = null;
        while (this.isType()) {
            const t = this.next();
            if (this.structNames.has(t.v)) {
                structType = t.v;
            }
        }
        const decls = [];
        for (;;) {
            this.accept('&');
            const nameTok = this.next();
            if (nameTok.t !== 'id') {
                throw new CifaError('bad declaration', nameTok);
            }
            const d = { name: nameTok.v, arraySize: null, isArray: false, init: null, structType };
            if (this.accept('[')) {
                d.isArray = true;
                if (!this.isOp(']')) {
                    d.arraySize = this.parseAssign();
                }
                this.expect(']');
            }
            if (this.accept('=')) {
                d.init = this.parseAssign();
            }
            decls.push(d);
            if (!this.accept(',')) {
                break;
            }
        }
        const n = this.node('Decl', tok, { decls });
        n.hasCall = decls.some((d) => (d.init && d.init.hasCall) || (d.arraySize && d.arraySize.hasCall));
        return n;
    }

    parseFor() {
        const t = this.next();
        this.expect('(');
        // range for
        {
            let o = 0;
            while (this.isType(o)) {
                o++;
            }
            if (this.peek(o).t === 'id' && this.isOp(':', o + 1)) {
                this.p += o;
                const v = this.next().v;
                this.expect(':');
                const range = this.parseExpr();
                this.expect(')');
                const body = this.parseStatement();
                return this.withCall(this.node('ForRange', t, { v, range, body }), [range, body]);
            }
        }
        let init = null;
        if (!this.isOp(';')) {
            if (this.isType() && this.peek(1).t === 'id') {
                init = this.parseDecl();
            } else {
                const e = this.parseExpr();
                init = this.withCall(this.node('ExprStmt', t, { e }), [e]);
            }
        }
        this.expect(';');
        const cond = this.isOp(';') ? null : this.parseExpr();
        this.expect(';');
        const step = this.isOp(')') ? null : this.parseExpr();
        this.expect(')');
        const body = this.parseStatement();
        return this.withCall(this.node('For', t, { init, cond, step, body }), [init, cond, step, body]);
    }

    parseSwitch() {
        const t = this.next();
        this.expect('(');
        const disc = this.parseExpr();
        this.expect(')');
        this.expect('{');
        const items = [];
        while (!this.isOp('}')) {
            const tok = this.peek();
            if (tok.t === 'eof') {
                throw new CifaError('unpaired left bracket {', t);
            }
            if (this.is('case')) {
                this.next();
                const e = this.parseTernary();
                this.expect(':');
                items.push(this.withCall(this.node('Case', tok, { e }), [e]));
            } else if (this.is('default')) {
                this.next();
                this.expect(':');
                items.push(this.node('Default', tok, {}));
            } else {
                items.push(this.parseStatement());
            }
        }
        this.expect('}');
        return this.withCall(this.node('Switch', t, { disc, items }), [disc, ...items]);
    }

    // ---- expressions (C precedence)
    parseExpr() {
        let e = this.parseAssign();
        while (this.isOp(',')) {
            const t = this.next();
            const r = this.parseAssign();
            e = this.withCall(this.node('Comma', t, { l: e, r }), [e, r]);
        }
        return e;
    }

    parseAssign() {
        const l = this.parseTernary();
        const t = this.peek();
        if (t.t === 'op' && ASSIGN_OPS.has(t.v)) {
            this.next();
            const r = this.parseAssign();
            return this.withCall(this.node('Assign', t, { op: t.v, target: l, value: r }), [l, r]);
        }
        return l;
    }

    parseTernary() {
        const c = this.parseBinary(0);
        if (this.isOp('?')) {
            const t = this.next();
            const a = this.parseAssign();
            this.expect(':');
            const b = this.parseAssign();
            return this.withCall(this.node('Cond', t, { c, a, b }), [c, a, b]);
        }
        return c;
    }

    parseBinary(level) {
        const LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
        if (level >= LEVELS.length) {
            return this.parseUnary();
        }
        let l = this.parseBinary(level + 1);
        for (;;) {
            const t = this.peek();
            if (t.t === 'op' && LEVELS[level].includes(t.v)) {
                this.next();
                const r = this.parseBinary(level + 1);
                l = this.withCall(this.node('Binary', t, { op: t.v, l, r }), [l, r]);
            } else {
                return l;
            }
        }
    }

    parseUnary() {
        const t = this.peek();
        if (t.t === 'op' && (t.v === '!' || t.v === '~' || t.v === '-' || t.v === '+')) {
            this.next();
            const e = this.parseUnary();
            return this.withCall(this.node('Unary', t, { op: t.v, e }), [e]);
        }
        if (t.t === 'op' && (t.v === '++' || t.v === '--')) {
            this.next();
            const e = this.parseUnary();
            return this.withCall(this.node('PreInc', t, { op: t.v, e }), [e]);
        }
        // C-style casts such as (int)x are ignored
        if (t.t === 'op' && t.v === '(' && this.isType(1) && this.isOp(')', 2)) {
            this.p += 3;
            return this.parseUnary();
        }
        return this.parsePostfix();
    }

    parsePostfix() {
        let e = this.parsePrimary();
        for (;;) {
            const t = this.peek();
            if (t.t !== 'op') {
                return e;
            }
            if (t.v === '[') {
                this.next();
                const idx = this.isOp(']') ? null : this.parseExpr();
                this.expect(']');
                e = this.withCall(this.node('Index', t, { obj: e, idx }), [e, idx]);
            } else if (t.v === '.' || t.v === '::') {
                this.next();
                const name = this.next();
                if (this.isOp('(')) {
                    const args = this.parseArgs();
                    e = this.node('MethodCall', name, { obj: e, name: name.v, args, sep: t.v });
                    e.hasCall = true;
                } else {
                    e = this.withCall(this.node('Member', name, { obj: e, name: name.v }), [e]);
                }
            } else if (t.v === '++' || t.v === '--') {
                this.next();
                e = this.withCall(this.node('PostInc', t, { op: t.v, e }), [e]);
            } else {
                return e;
            }
        }
    }

    parseArgs() {
        this.expect('(');
        const args = [];
        while (!this.isOp(')')) {
            args.push(this.parseAssign());
            if (!this.accept(',')) {
                break;
            }
        }
        this.expect(')');
        return args;
    }

    parsePrimary() {
        const t = this.next();
        if (t.t === 'num') {
            return this.node('Num', t, { v: t.v });
        }
        if (t.t === 'str') {
            return this.node('Str', t, { v: t.v });
        }
        if (t.t === 'id') {
            if (t.v === 'true') {
                return this.node('Num', t, { v: 1 });
            }
            if (t.v === 'false') {
                return this.node('Num', t, { v: 0 });
            }
            if (this.isOp('(')) {
                const args = this.parseArgs();
                const n = this.node('Call', t, { name: t.v, args });
                n.hasCall = true;
                return n;
            }
            return this.node('Var', t, { name: t.v });
        }
        if (t.t === 'op' && t.v === '(') {
            const e = this.parseExpr();
            this.expect(')');
            return e;
        }
        if (t.t === 'op' && t.v === '{') {
            const items = [];
            while (!this.isOp('}')) {
                items.push(this.parseAssign());
                if (!this.accept(',')) {
                    break;
                }
            }
            this.expect('}');
            return this.withCall(this.node('ArrayLit', t, { items }), items);
        }
        throw new CifaError(`unexpected '${t.v || t.t}'`, t);
    }
}

// ---------------------------------------------------------------- values
function typeName(v) {
    if (v === undefined) {
        return 'empty';
    }
    if (typeof v === 'number') {
        return 'number';
    }
    if (typeof v === 'string') {
        return 'string';
    }
    if (Array.isArray(v)) {
        return 'array';
    }
    if (v instanceof Map) {
        return 'map';
    }
    return typeof v;
}

function clone(v) {
    if (Array.isArray(v)) {
        return v.map(clone);
    }
    if (v instanceof Map) {
        const m = new CifaMap();
        for (const [k, x] of v) {
            m.set(k, clone(x));
        }
        return m;
    }
    return v;
}

function isNum(v) {
    return typeof v === 'number';
}

function toInt32(v) {
    return Math.trunc(v) | 0;
}

// ---------------------------------------------------------------- interpreter
export class Cifa {
    constructor() {
        this.functions = new Map();     // host functions
        this.functions2 = new Map();    // script functions: name -> Map(arity -> fn)
        this.struct_defs = new Map();
        this.global_variables = new Map();
        this.max_loop_iterations = 10000000;
        this.max_call_depth = 1000;
        this.output_error = true;
        this.last_error = '';
        this.depth = 0;
        this.registerBuiltins();
    }

    register_function(name, fn) {
        this.functions.set(name, fn);
        return true;
    }

    register_parameter(name, v) {
        this.global_variables.set(name, v);
        return true;
    }

    register_vector(name, v) {
        this.global_variables.set(name, Array.from(v));
        return true;
    }

    set_output_error(b) {
        this.output_error = b;
    }

    has_error() {
        return !!this.last_error;
    }

    get_errors_str() {
        return this.last_error;
    }

    compile(src) {
        const parser = new Parser(tokenize(src), [...this.struct_defs.keys()]);
        const root = parser.parseProgram();
        return { root, functions: parser.functions, structs: parser.structs };
    }

    // compiles and runs; returns the script result or { error } on failure
    async run_script(src, entryLabel = '') {
        this.last_error = '';
        let program;
        try {
            program = this.compile(src);
        } catch (e) {
            this.reportError('Syntax Error', e);
            return { error: e.message };
        }
        return this.run(program, entryLabel);
    }

    async run(program, entryLabel = '') {
        for (const [name, overloads] of program.functions) {
            let o = this.functions2.get(name);
            if (!o) {
                o = new Map();
                this.functions2.set(name, o);
            }
            for (const [arity, fn] of overloads) {
                o.set(arity, fn);
            }
        }
        for (const [name, fields] of program.structs) {
            this.struct_defs.set(name, fields);
        }
        const ctx = { scopes: [], returning: false };
        let start = 0;
        if (entryLabel) {
            if (!program.root.labels.has(entryLabel)) {
                this.reportError('Runtime Error', new CifaError(`label '${entryLabel}' is not defined`));
                return { error: 'label' };
            }
            start = program.root.labels.get(entryLabel);
        }
        try {
            const sig = await this.drive(this.execBlock(program.root, ctx, start));
            if (sig && sig.k === 'return') {
                return sig.v;
            }
            if (sig && sig.k === 'goto') {
                throw new CifaError(`goto target '${sig.label}' is not defined`, sig.node);
            }
            return undefined;
        } catch (e) {
            if (e instanceof ExitSignal) {
                return undefined;
            }
            this.reportError('Runtime Error', e);
            return { error: e.message };
        }
    }

    reportError(kind, e) {
        const where = e && e.line ? ` at line ${e.line}, col ${e.col}` : '';
        this.last_error = `${kind}: ${e && e.message ? e.message : e}${where}`;
        if (this.output_error) {
            console.error(this.last_error);
            if (!(e instanceof CifaError) && e && e.stack) {
                console.error(e.stack);
            }
        }
    }

    // runs a generator; yielded values are promises from host functions
    async drive(gen) {
        let r = gen.next();
        while (!r.done) {
            let v;
            let threw = false;
            let err;
            try {
                v = await r.value;
            } catch (e) {
                threw = true;
                err = e;
            }
            r = threw ? gen.throw(err) : gen.next(v);
        }
        return r.value;
    }

    // ---- variables
    findVar(ctx, name) {
        for (let i = ctx.scopes.length - 1; i >= 0; i--) {
            if (ctx.scopes[i].has(name)) {
                return ctx.scopes[i];
            }
        }
        if (this.global_variables.has(name)) {
            return this.global_variables;
        }
        return null;
    }

    currentScope(ctx) {
        return ctx.scopes.length ? ctx.scopes[ctx.scopes.length - 1] : this.global_variables;
    }

    getVar(ctx, name, node) {
        const s = this.findVar(ctx, name);
        if (!s) {
            throw new CifaError(`variable '${name}' has not been initialized`, node);
        }
        const v = s.get(name);
        if (v === undefined) {
            throw new CifaError(`variable '${name}' has not been initialized`, node);
        }
        return v;
    }

    // a reference { get, set } to an assignable expression; containers are created on demand
    *ref(node, ctx, declare = false) {
        if (node.type === 'Var') {
            const name = node.name;
            let scope = declare ? this.currentScope(ctx) : this.findVar(ctx, name);
            if (!scope) {
                scope = this.currentScope(ctx);
            }
            return {
                get: () => scope.get(name),
                set: (v) => {
                    scope.set(name, v);
                    return v;
                },
                name,
            };
        }
        if (node.type === 'Index') {
            const base = yield* this.ref(node.obj, ctx, false);
            const idx = node.idx ? yield* this.ev(node.idx, ctx) : 0;
            let container = base.get();
            if (typeof idx === 'string') {
                if (!(container instanceof Map)) {
                    container = new CifaMap();
                    base.set(container);
                }
                const m = container;
                return {
                    get: () => m.get(idx),
                    set: (v) => {
                        m.set(idx, v);
                        return v;
                    },
                    name: `${base.name}["${idx}"]`,
                };
            }
            let i = isNum(idx) ? Math.trunc(idx) : 0;
            if (i < 0) {
                i = 0;
            }
            if (!Array.isArray(container)) {
                if (container instanceof Map) {
                    const m = container;
                    const k = String(idx);
                    return {
                        get: () => m.get(k),
                        set: (v) => {
                            m.set(k, v);
                            return v;
                        },
                        name: `${base.name}[${k}]`,
                    };
                }
                container = [];
                base.set(container);
            }
            const arr = container;
            if (i >= arr.length) {
                for (let k = arr.length; k <= i; k++) {
                    arr.push(undefined);
                }
            }
            return {
                get: () => arr[i],
                set: (v) => {
                    arr[i] = v;
                    return v;
                },
                name: `${base.name}[${i}]`,
            };
        }
        if (node.type === 'Member') {
            const base = yield* this.ref(node.obj, ctx, false);
            let container = base.get();
            if (!(container instanceof Map)) {
                // like Cifa, a flat "a::b" variable when the base is not a map/struct
                const flat = `${base.name}::${node.name}`;
                return yield* this.ref({ type: 'Var', name: flat, line: node.line, col: node.col }, ctx, false);
            }
            const m = container;
            return {
                get: () => m.get(node.name),
                set: (v) => {
                    m.set(node.name, v);
                    return v;
                },
                name: `${base.name}.${node.name}`,
            };
        }
        throw new CifaError('expression cannot be assigned', node);
    }

    // ---- statements; return undefined or a signal { k: 'break'|'continue'|'return'|'goto' }
    *exec(s, ctx) {
        switch (s.type) {
        case 'Block':
            return yield* this.execBlock(s, ctx, 0);
        case 'ExprStmt':
            yield* this.ev(s.e, ctx);
            return undefined;
        case 'Decl':
            for (const d of s.decls) {
                const scope = this.currentScope(ctx);
                let v;
                if (d.init) {
                    v = clone(yield* this.ev(d.init, ctx));
                } else if (d.isArray) {
                    const n = d.arraySize ? Math.max(0, Math.trunc(yield* this.ev(d.arraySize, ctx))) : 0;
                    v = new Array(n).fill(undefined);
                } else if (d.structType && this.struct_defs.has(d.structType)) {
                    v = new CifaMap();
                    for (const f of this.struct_defs.get(d.structType)) {
                        v.set(f, undefined);
                    }
                } else {
                    v = undefined;
                }
                scope.set(d.name, v);
            }
            return undefined;
        case 'If': {
            const c = yield* this.ev(s.cond, ctx);
            if (this.truthy(c, s)) {
                return yield* this.exec(s.then, ctx);
            }
            if (s.els) {
                return yield* this.exec(s.els, ctx);
            }
            return undefined;
        }
        case 'While': {
            let count = 0;
            while (this.truthy(yield* this.ev(s.cond, ctx), s)) {
                if (++count > this.max_loop_iterations) {
                    throw new CifaError('while loop exceeded max iterations', s);
                }
                const sig = yield* this.exec(s.body, ctx);
                if (sig) {
                    if (sig.k === 'break') {
                        break;
                    }
                    if (sig.k === 'continue') {
                        continue;
                    }
                    return sig;
                }
            }
            return undefined;
        }
        case 'DoWhile': {
            let count = 0;
            do {
                if (++count > this.max_loop_iterations) {
                    throw new CifaError('do-while loop exceeded max iterations', s);
                }
                const sig = yield* this.exec(s.body, ctx);
                if (sig) {
                    if (sig.k === 'break') {
                        break;
                    }
                    if (sig.k === 'continue') {
                        continue;
                    }
                    return sig;
                }
            } while (this.truthy(yield* this.ev(s.cond, ctx), s));
            return undefined;
        }
        case 'For': {
            // like Cifa, the init declaration lives in the enclosing scope
            if (s.init) {
                yield* this.exec(s.init, ctx);
            }
            let count = 0;
            while (!s.cond || this.truthy(yield* this.ev(s.cond, ctx), s)) {
                if (++count > this.max_loop_iterations) {
                    throw new CifaError('for loop exceeded max iterations', s);
                }
                const sig = yield* this.exec(s.body, ctx);
                if (sig) {
                    if (sig.k === 'break') {
                        break;
                    }
                    if (sig.k !== 'continue') {
                        return sig;
                    }
                }
                if (s.step) {
                    yield* this.ev(s.step, ctx);
                }
            }
            return undefined;
        }
        case 'ForRange': {
            const range = yield* this.ev(s.range, ctx);
            if (!Array.isArray(range)) {
                throw new CifaError('range for requires an array', s);
            }
            const values = range.slice();
            for (const v of values) {
                ctx.scopes.push(new Map([[s.v, clone(v)]]));
                let sig;
                try {
                    sig = yield* this.exec(s.body, ctx);
                } finally {
                    ctx.scopes.pop();
                }
                if (sig) {
                    if (sig.k === 'break') {
                        break;
                    }
                    if (sig.k !== 'continue') {
                        return sig;
                    }
                }
            }
            return undefined;
        }
        case 'Switch': {
            const d = yield* this.ev(s.disc, ctx);
            ctx.scopes.push(new Map());
            try {
                // a matching case or default starts execution, then falls through
                let start = -1;
                for (let i = 0; i < s.items.length && start < 0; i++) {
                    const it = s.items[i];
                    if (it.type === 'Case') {
                        const v = yield* this.ev(it.e, ctx);
                        if (this.equal(d, v)) {
                            start = i;
                        }
                    }
                }
                if (start < 0) {
                    start = s.items.findIndex((it) => it.type === 'Default');
                }
                if (start < 0) {
                    return undefined;
                }
                for (let i = start; i < s.items.length; i++) {
                    const it = s.items[i];
                    if (it.type === 'Case' || it.type === 'Default') {
                        continue;
                    }
                    const sig = yield* this.exec(it, ctx);
                    if (sig) {
                        if (sig.k === 'break') {
                            break;
                        }
                        return sig;
                    }
                }
            } finally {
                ctx.scopes.pop();
            }
            return undefined;
        }
        case 'Return':
            return { k: 'return', v: s.e ? yield* this.ev(s.e, ctx) : undefined };
        case 'Break':
            return { k: 'break' };
        case 'Continue':
            return { k: 'continue' };
        case 'Goto':
            return { k: 'goto', label: s.label, node: s };
        case 'Label':
        case 'Empty':
            return undefined;
        default:
            throw new CifaError(`unknown statement ${s.type}`, s);
        }
    }

    *execBlock(b, ctx, start) {
        if (b.scope) {
            ctx.scopes.push(new Map());
        }
        try {
            let gotoCount = 0;
            for (let i = start; i < b.body.length; i++) {
                const sig = yield* this.exec(b.body[i], ctx);
                if (!sig) {
                    continue;
                }
                if (sig.k === 'goto') {
                    const target = b.labels.get(sig.label);
                    if (target !== undefined) {
                        if (++gotoCount > this.max_loop_iterations) {
                            throw new CifaError('goto exceeded max iterations', sig.node);
                        }
                        i = target;
                        continue;
                    }
                }
                return sig;
            }
            return undefined;
        } finally {
            if (b.scope) {
                ctx.scopes.pop();
            }
        }
    }

    truthy(v, node) {
        if (typeof v === 'number') {
            return v !== 0 && !Number.isNaN(v);
        }
        if (v === undefined) {
            throw new CifaError('type conversion failed: from <empty> to double', node);
        }
        if (typeof v === 'string') {
            throw new CifaError('type conversion failed: from string to double', node);
        }
        return !!v;
    }

    equal(a, b) {
        if (isNum(a) && isNum(b)) {
            return a === b;
        }
        if (typeof a === 'string' && typeof b === 'string') {
            return a === b;
        }
        return false;
    }

    // ---- expressions
    *ev(n, ctx) {
        switch (n.type) {
        case 'Num':
            return n.v;
        case 'Str':
            return n.v;
        case 'Var':
            return this.getVar(ctx, n.name, n);
        case 'Index':
        case 'Member': {
            const r = yield* this.ref(n, ctx, false);
            const v = r.get();
            if (v === undefined && n.type === 'Index') {
                const base = n.obj.type === 'Var' ? this.findVar(ctx, n.obj.name)?.get(n.obj.name) : null;
                if (!(base instanceof Map)) {
                    throw new CifaError(`array element '${r.name}' has not been initialized`, n);
                }
            }
            return v;
        }
        case 'ArrayLit': {
            const arr = [];
            for (const it of n.items) {
                arr.push(clone(yield* this.ev(it, ctx)));
            }
            return arr;
        }
        case 'Comma':
            yield* this.ev(n.l, ctx);
            return yield* this.ev(n.r, ctx);
        case 'Cond':
            if (this.truthy(yield* this.ev(n.c, ctx), n)) {
                return yield* this.ev(n.a, ctx);
            }
            return yield* this.ev(n.b, ctx);
        case 'Unary': {
            const v = yield* this.ev(n.e, ctx);
            switch (n.op) {
            case '+':
                return v;
            case '-':
                return isNum(v) ? -v : undefined;
            case '!':
                return this.truthy(v, n) ? 0 : 1;
            case '~':
                return isNum(v) ? ~toInt32(v) : undefined;
            default:
                return undefined;
            }
        }
        case 'PreInc': {
            const r = yield* this.ref(n.e, ctx);
            const v = r.get();
            return r.set(isNum(v) ? v + (n.op === '++' ? 1 : -1) : undefined);
        }
        case 'PostInc': {
            const r = yield* this.ref(n.e, ctx);
            const v = r.get();
            r.set(isNum(v) ? v + (n.op === '++' ? 1 : -1) : undefined);
            return v;
        }
        case 'Binary': {
            if (n.op === '&&') {
                const l = yield* this.ev(n.l, ctx);
                if (!this.truthy(l, n)) {
                    return 0;
                }
                return this.truthy(yield* this.ev(n.r, ctx), n) ? 1 : 0;
            }
            if (n.op === '||') {
                const l = yield* this.ev(n.l, ctx);
                if (this.truthy(l, n)) {
                    return 1;
                }
                return this.truthy(yield* this.ev(n.r, ctx), n) ? 1 : 0;
            }
            const l = yield* this.ev(n.l, ctx);
            const r = yield* this.ev(n.r, ctx);
            return this.binary(n.op, l, r);
        }
        case 'Assign': {
            if (n.op === '=') {
                const v = clone(yield* this.ev(n.value, ctx));
                const r = yield* this.ref(n.target, ctx);
                return r.set(v);
            }
            const r = yield* this.ref(n.target, ctx);
            const cur = r.get();
            if (cur === undefined) {
                throw new CifaError(`variable '${r.name}' has not been initialized`, n);
            }
            const v = yield* this.ev(n.value, ctx);
            return r.set(this.binary(n.op.slice(0, -1), cur, v));
        }
        case 'Call':
            return yield* this.call(n.name, n.args, ctx, n);
        case 'MethodCall':
            if (BUILTIN_METHODS.has(n.name)) {
                return yield* this.method(n, ctx);
            }
            return yield* this.call(n.name, [n.obj, ...n.args], ctx, n);
        default:
            throw new CifaError(`unknown expression ${n.type}`, n);
        }
    }

    binary(op, l, r) {
        if (typeof l === 'string' && typeof r === 'string') {
            switch (op) {
            case '+': return l + r;
            case '<': return l < r ? 1 : 0;
            case '>': return l > r ? 1 : 0;
            case '<=': return l <= r ? 1 : 0;
            case '>=': return l >= r ? 1 : 0;
            case '==': return l === r ? 1 : 0;
            case '!=': return l !== r ? 1 : 0;
            default: return undefined;
            }
        }
        if (!isNum(l) || !isNum(r)) {
            if (op === '==') {
                return 0;
            }
            if (op === '!=') {
                return 1;
            }
            return undefined;
        }
        switch (op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '%': {
            const b = toInt32(r);
            return b === 0 ? NaN : toInt32(l) % b;
        }
        case '<': return l < r ? 1 : 0;
        case '>': return l > r ? 1 : 0;
        case '<=': return l <= r ? 1 : 0;
        case '>=': return l >= r ? 1 : 0;
        case '==': return l === r ? 1 : 0;
        case '!=': return l !== r ? 1 : 0;
        case '&': return toInt32(l) & toInt32(r);
        case '|': return toInt32(l) | toInt32(r);
        case '^': return toInt32(l) ^ toInt32(r);
        case '<<': return toInt32(l) << toInt32(r);
        case '>>': return toInt32(l) >> toInt32(r);
        default: return undefined;
        }
    }

    *method(n, ctx) {
        const r = yield* this.ref(n.obj, ctx);
        const obj = r.get();
        const args = [];
        for (const a of n.args) {
            args.push(yield* this.ev(a, ctx));
        }
        if (Array.isArray(obj)) {
            switch (n.name) {
            case 'push_back':
                for (const a of args) {
                    obj.push(clone(a));
                }
                return obj.length;
            case 'pop_back':
                obj.pop();
                return obj.length;
            case 'resize': {
                const k = Math.max(0, Math.trunc(args[0] || 0));
                while (obj.length < k) {
                    obj.push(undefined);
                }
                obj.length = k;
                return obj.length;
            }
            case 'insert': {
                if (args.length >= 2) {
                    const i = Math.min(Math.max(0, Math.trunc(args[0])), obj.length);
                    obj.splice(i, 0, clone(args[1]));
                }
                return obj.length;
            }
            case 'erase': {
                const i = Math.trunc(args[0]);
                if (i >= 0 && i < obj.length) {
                    obj.splice(i, 1);
                }
                return obj.length;
            }
            case 'clear':
                obj.length = 0;
                return 0;
            case 'contains':
                return obj.some((e) => this.equal(e, args[0])) ? 1 : 0;
            default:
                throw new CifaError(`${n.name}() is not supported on arrays`, n);
            }
        }
        if (obj instanceof Map) {
            switch (n.name) {
            case 'erase':
                obj.delete(String(args[0]));
                return obj.size;
            case 'clear':
                obj.clear();
                return 0;
            case 'contains':
                return obj.has(String(args[0])) ? 1 : 0;
            case 'keys':
                return [...obj.keys()].sort();
            default:
                throw new CifaError(`${n.name}() is not supported on maps`, n);
            }
        }
        throw new CifaError(`${n.name}() requires an array or map`, n);
    }

    *call(name, argNodes, ctx, node) {
        const host = this.functions.get(name);
        if (host) {
            const args = [];
            for (const a of argNodes) {
                args.push(yield* this.ev(a, ctx));
            }
            let res = host(args, this);
            if (res && typeof res.then === 'function') {
                res = yield res;
            }
            return res;
        }
        const overloads = this.functions2.get(name);
        if (!overloads) {
            throw new CifaError(`function '${name}' is not defined`, node);
        }
        const fn = overloads.get(argNodes.length);
        if (!fn) {
            throw new CifaError(`function '${name}' has no overload for ${argNodes.length} arguments; available: ${[...overloads.keys()].sort().join(', ')}`, node);
        }
        if (++this.depth > this.max_call_depth) {
            this.depth = 0;
            throw new CifaError('max call depth exceeded (possible infinite recursion)', node);
        }
        try {
            const scope = new Map();
            for (let i = 0; i < fn.params.length; i++) {
                scope.set(fn.params[i], clone(yield* this.ev(argNodes[i], ctx)));
            }
            const fctx = { scopes: [scope] };
            const sig = yield* this.execBlock(fn.body, fctx, 0);
            if (sig && sig.k === 'return') {
                return sig.v;
            }
            if (sig && sig.k === 'goto') {
                throw new CifaError(`goto target '${sig.label}' is not defined`, sig.node);
            }
            return undefined;
        } finally {
            this.depth--;
        }
    }

    // ---- builtins
    registerBuiltins() {
        const num = (v) => (isNum(v) ? v : NaN);
        const reg = (name, f) => this.register_function(name, f);
        const out = (args) => args.map((a) => (isNum(a) ? fmtG(a) : String(a ?? ''))).join('');
        reg('print', (a) => {
            console.log(out(a));
            return a.length;
        });
        reg('println', (a) => {
            console.log(out(a));
            return a.length;
        });
        reg('to_string', (a) => (a.length ? fmtG(num(a[0])) : ''));
        reg('to_number', (a) => (a.length ? parseFloat(String(a[0])) || 0 : undefined));
        reg('type', (a) => (a.length ? typeName(a[0]) : 'empty'));
        reg('exit', () => {
            throw new ExitSignal();
        });
        const ifv = (a) => (a.length === 3 ? (Math.trunc(num(a[0])) ? num(a[1]) : num(a[2])) : undefined);
        reg('ifv', ifv);
        reg('ifvalue', ifv);
        reg('max', (a) => (a.length === 0 ? undefined : a.length === 1 ? a[0] : Math.max(...a.map(num))));
        reg('min', (a) => (a.length === 0 ? undefined : a.length === 1 ? a[0] : Math.min(...a.map(num))));
        reg('random', (a) => {
            const r = Math.random();
            if (a.length === 0) {
                return r;
            }
            if (a.length === 1) {
                return r * num(a[0]);
            }
            return num(a[0]) + r * (num(a[1]) - num(a[0]));
        });
        reg('size', (a) => {
            if (!a.length) {
                return 0;
            }
            const v = a[0];
            if (typeof v === 'string') {
                return new TextEncoder().encode(v).length;
            }
            if (Array.isArray(v)) {
                return v.length;
            }
            if (v instanceof Map) {
                return v.size;
            }
            return undefined;
        });
        reg('sprintf', (a) => (a.length ? csprintf(String(a[0] ?? ''), a.slice(1)) : ''));
        reg('format', (a) => {
            if (!a.length) {
                return '';
            }
            const fmt = String(a[0]);
            let auto = 0;
            return fmt.replace(/\{\{|\}\}|\{(\d*)(?::[^}]*)?\}/g, (m, idx) => {
                if (m === '{{') {
                    return '{';
                }
                if (m === '}}') {
                    return '}';
                }
                const v = a[(idx === '' ? auto++ : Number(idx)) + 1];
                return v === undefined ? '' : String(v);
            });
        });
        reg('run_string', async (a) => this.run_script(String(a[0] ?? '')));
        const m1 = ['abs', 'sqrt', 'cbrt', 'round', 'trunc', 'ceil', 'floor', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
            'sinh', 'cosh', 'tanh', 'exp', 'log', 'log2', 'log10'];
        for (const f of m1) {
            reg(f, (a) => Math[f](num(a[0])));
        }
        reg('nearbyint', (a) => Math.round(num(a[0])));
        reg('rint', (a) => Math.round(num(a[0])));
        reg('pow', (a) => Math.pow(num(a[0]), num(a[1])));
        reg('atan2', (a) => Math.atan2(num(a[0]), num(a[1])));
        reg('hypot', (a) => Math.hypot(num(a[0]), num(a[1])));
        reg('fmod', (a) => num(a[0]) % num(a[1]));
        reg('remainder', (a) => {
            const x = num(a[0]);
            const y = num(a[1]);
            return x - Math.round(x / y) * y;
        });
        reg('copysign', (a) => Math.sign(num(a[1])) * Math.abs(num(a[0])));
        reg('fdim', (a) => Math.max(num(a[0]) - num(a[1]), 0));
        reg('fmax', (a) => Math.max(num(a[0]), num(a[1])));
        reg('fmin', (a) => Math.min(num(a[0]), num(a[1])));
    }
}

export function cifaInt(v) {
    if (typeof v === 'number') {
        return Number.isFinite(v) ? Math.trunc(v) | 0 : 0;
    }
    if (typeof v === 'boolean') {
        return v ? 1 : 0;
    }
    return 0;
}
