// C printf-style formatting used by Cifa's sprintf and the event instruction 50.

// %g-like output of std::ostream << double (6 significant digits)
export function fmtG(v, prec = 6, alt = false, upper = false) {
    if (!Number.isFinite(v)) {
        return Number.isNaN(v) ? 'nan' : v > 0 ? 'inf' : '-inf';
    }
    if (prec === 0) {
        prec = 1;
    }
    if (v === 0) {
        return alt ? (0).toFixed(Math.max(0, prec - 1)) : '0';
    }
    const exp = Math.floor(Math.log10(Math.abs(v)));
    let s;
    // C uses the exponent after rounding
    let e = exp;
    const r = Number(v.toPrecision(prec));
    if (r !== 0) {
        e = Math.floor(Math.log10(Math.abs(r)));
    }
    if (e < -4 || e >= prec) {
        s = r.toExponential(prec - 1);
        if (!alt) {
            s = s.replace(/\.?0+e/, 'e');
        }
        s = s.replace(/e([+-])(\d)$/, 'e$10$2');
    } else {
        s = r.toFixed(Math.max(0, prec - 1 - e));
        if (!alt && s.includes('.')) {
            s = s.replace(/\.?0+$/, '');
        }
    }
    return upper ? s.toUpperCase() : s;
}

function pad(s, width, left, zero) {
    if (s.length >= width) {
        return s;
    }
    if (left) {
        return s + ' '.repeat(width - s.length);
    }
    if (zero) {
        let sign = '';
        if (/^[+\- ]/.test(s)) {
            sign = s[0];
            s = s.slice(1);
        }
        if (/^0[xX]/.test(s)) {
            sign += s.slice(0, 2);
            s = s.slice(2);
        }
        return sign + '0'.repeat(width - s.length - sign.length) + s;
    }
    return ' '.repeat(width - s.length) + s;
}

// width counts bytes like C does
function byteLen(s) {
    return new TextEncoder().encode(s).length;
}

function padBytes(s, width, left) {
    const n = byteLen(s);
    if (n >= width) {
        return s;
    }
    return left ? s + ' '.repeat(width - n) : ' '.repeat(width - n) + s;
}

export function formatOne(spec, arg) {
    const m = /^%([-+ #0]*)(\d*|\*)(?:\.(\d*))?[hlLzjtq]*([diouxXeEfFgGaAsc])$/.exec(spec);
    if (!m) {
        return spec;
    }
    const flags = m[1];
    const width = m[2] ? Number(m[2]) : 0;
    const prec = m[3] === undefined ? -1 : Number(m[3] || 0);
    const tc = m[4];
    const left = flags.includes('-');
    const zero = flags.includes('0') && !left;
    const plus = flags.includes('+');
    const space = flags.includes(' ');
    const alt = flags.includes('#');
    const signed = (s, neg) => (neg ? '-' : plus ? '+' : space ? ' ' : '') + s;
    if (tc === 's') {
        let s = typeof arg === 'string' ? arg : String(arg ?? '');
        if (prec >= 0) {
            const bytes = new TextEncoder().encode(s).slice(0, prec);
            s = new TextDecoder().decode(bytes);
        }
        return padBytes(s, width, left);
    }
    let v = typeof arg === 'number' ? arg : Number(arg) || 0;
    if (tc === 'd' || tc === 'i') {
        v = Math.trunc(v);
        let s = String(Math.abs(v));
        if (prec >= 0) {
            s = s.padStart(prec, '0');
        }
        return pad(signed(s, v < 0), width, left, zero && prec < 0);
    }
    if (tc === 'u' || tc === 'o' || tc === 'x' || tc === 'X') {
        let n = BigInt.asUintN(64, BigInt(Math.trunc(v)));
        let s = n.toString(tc === 'o' ? 8 : tc === 'u' ? 10 : 16);
        if (tc === 'X') {
            s = s.toUpperCase();
        }
        if (prec >= 0) {
            s = s.padStart(prec, '0');
        }
        if (alt && n !== 0n && (tc === 'x' || tc === 'X')) {
            s = (tc === 'x' ? '0x' : '0X') + s;
        }
        if (alt && tc === 'o' && s[0] !== '0') {
            s = '0' + s;
        }
        return pad(s, width, left, zero && prec < 0);
    }
    if (tc === 'c') {
        return pad(String.fromCharCode(Math.trunc(v) & 255), width, left, false);
    }
    const p = prec < 0 ? 6 : prec;
    const neg = v < 0 || Object.is(v, -0);
    const a = Math.abs(v);
    let s;
    if (!Number.isFinite(a)) {
        s = Number.isNaN(a) ? 'nan' : 'inf';
    } else if (tc === 'f' || tc === 'F') {
        s = a.toFixed(p);
        if (alt && p === 0) {
            s += '.';
        }
    } else if (tc === 'e' || tc === 'E') {
        s = a.toExponential(p).replace(/e([+-])(\d)$/, 'e$10$2');
        if (tc === 'E') {
            s = s.toUpperCase();
        }
    } else if (tc === 'g' || tc === 'G') {
        s = fmtG(a, p, alt, tc === 'G');
    } else {
        s = a.toString(16);
    }
    return pad(signed(s, neg), width, left, zero);
}

// sprintf(fmt, args) with Cifa's argument handling (missing args are skipped)
export function csprintf(fmt, args) {
    let result = '';
    let argi = 0;
    let i = 0;
    while (i < fmt.length) {
        const c = fmt[i];
        if (c !== '%') {
            result += c;
            i++;
            continue;
        }
        if (fmt[i + 1] === '%') {
            result += '%';
            i += 2;
            continue;
        }
        const start = i++;
        while (i < fmt.length && '-+ #0'.includes(fmt[i])) {
            i++;
        }
        while (i < fmt.length && fmt[i] >= '0' && fmt[i] <= '9') {
            i++;
        }
        if (fmt[i] === '.') {
            i++;
            while (i < fmt.length && fmt[i] >= '0' && fmt[i] <= '9') {
                i++;
            }
        }
        while (i < fmt.length && 'hlLzjtq'.includes(fmt[i])) {
            i++;
        }
        if (i >= fmt.length) {
            break;
        }
        i++;
        const spec = fmt.slice(start, i);
        if (argi < args.length) {
            result += formatOne(spec, args[argi++]);
        }
    }
    return result;
}
