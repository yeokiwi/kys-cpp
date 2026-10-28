// Small helpers shared by the whole client: logging, numeric helpers from
// mlcc (strfunc / Random) and C-style integer conversions.

export function LOG(...args) {
    console.log(...args);
}

// int(x) in C++: truncation toward zero, also for doubles coming from scripts
export function toInt(v) {
    v = Number(v);
    if (!Number.isFinite(v)) {
        return 0;
    }
    return Math.trunc(v) | 0;
}

export function clamp(v, lo, hi) {
    if (v < lo) {
        v = lo;
    }
    if (v > hi) {
        v = hi;
    }
    return v;
}

export function int16(v) {
    return (v << 16) >> 16;
}

export function uint8(v) {
    return v & 255;
}

export function sign(v) {
    return v > 0 ? 1 : v < 0 ? -1 : 0;
}

// strfunc::findNumbers
export function findNumbers(s, asInt = true) {
    const result = [];
    let str = '';
    let haveNum = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        const isNum = (c >= '0' && c <= '9') || c === '.' || c === '-' || c === '+' || c === 'E' || c === 'e';
        if (isNum) {
            str += c;
            if (c >= '0' && c <= '9') {
                haveNum = true;
            }
        }
        if (!isNum || i === s.length - 1) {
            if (str !== '' && haveNum) {
                let v = parseFloat(str);
                if (Number.isNaN(v)) {
                    v = 0;
                }
                result.push(asInt ? Math.trunc(v) : v);
            }
            str = '';
            haveNum = false;
        }
    }
    return result;
}

// RandomDouble from mlcc
export class RandomDouble {
    rand() {
        return Math.random();
    }

    rand_int(n1, n2) {
        if (n2 === undefined) {
            return Math.trunc(Math.random() * n1);
        }
        return n1 + Math.trunc(Math.random() * (n2 - n1));
    }
}

// C rand(): 0..RAND_MAX (32767 is enough for all uses in the game)
export const RAND_MAX = 32767;
export function crand() {
    return Math.floor(Math.random() * (RAND_MAX + 1));
}

// Number of display columns used by Font::getTextDrawSize (CJK counts 2)
export function textDrawSize(text) {
    let len = 0;
    for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp < 0x80) {
            len += 1;
        } else if (cp < 0x800) {
            len += 1;
        } else {
            len += 2;
        }
    }
    return len;
}

export function utf8Length(text) {
    return new TextEncoder().encode(text).length;
}

// Python-like std::format subset used for UI strings: {} and {:>N} / {:N} / {:.Nf}
export function format(fmt, ...args) {
    let auto = 0;
    return fmt.replace(/\{\{|\}\}|\{(\d*)(?::([^}]*))?\}/g, (m, idx, spec) => {
        if (m === '{{') {
            return '{';
        }
        if (m === '}}') {
            return '}';
        }
        const v = args[idx === '' || idx === undefined ? auto++ : Number(idx)];
        return formatValue(v, spec || '');
    });
}

function formatValue(v, spec) {
    let s;
    const m = /^(.?[<>^])?([+-])?(0)?(\d+)?(?:\.(\d+))?([dfsxX])?$/.exec(spec);
    if (!m) {
        return String(v);
    }
    let [, align, signFlag, zero, width, prec, type] = m;
    let fill = ' ';
    let al = '';
    if (align) {
        if (align.length === 2) {
            fill = align[0];
            al = align[1];
        } else {
            al = align;
        }
    }
    if (typeof v === 'number') {
        if (type === 'f' || prec !== undefined) {
            s = v.toFixed(prec === undefined ? 6 : Number(prec));
        } else if (type === 'x') {
            s = (v >>> 0).toString(16);
        } else if (type === 'X') {
            s = (v >>> 0).toString(16).toUpperCase();
        } else {
            s = Number.isInteger(v) ? String(v) : String(v);
        }
        if (signFlag === '+' && v >= 0) {
            s = '+' + s;
        }
        if (!al) {
            al = '>';
        }
        if (zero && !align) {
            fill = '0';
        }
    } else {
        s = String(v);
        if (!al) {
            al = '<';
        }
    }
    const w = width ? Number(width) : 0;
    if (w > s.length) {
        const pad = w - s.length;
        if (al === '<') {
            s = s + fill.repeat(pad);
        } else if (al === '^') {
            s = fill.repeat(Math.floor(pad / 2)) + s + fill.repeat(pad - Math.floor(pad / 2));
        } else if (fill === '0' && /^[+-]/.test(s)) {
            s = s[0] + '0'.repeat(pad) + s.slice(1);
        } else {
            s = fill.repeat(pad) + s;
        }
    }
    return s;
}

export function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

export function splitLines(text) {
    return text.split('\n').map((l) => l.replace(/\r/g, ''));
}
