// Case-insensitive INI reader/writer (INIReaderNormal from mlcc). Comments and
// the layout of the file are kept when the file is written back.

function parseValue(raw) {
    let v = '';
    let quote = 0;
    let i = 0;
    while (i < raw.length && raw[i] === ' ') {
        i++;
    }
    let comment = '';
    for (; i < raw.length; i++) {
        const c = raw[i];
        if (quote === 0 && c === "'") {
            quote = 1;
        } else if (quote === 0 && c === '"') {
            quote = 2;
        } else if (quote === 1 && c === "'") {
            quote = 0;
        } else if (quote === 2 && c === '"') {
            quote = 0;
        }
        if (quote === 0 && (c === '#' || c === ';')) {
            comment = raw.slice(i);
            break;
        }
        v += c;
    }
    const trimmed = v.replace(/[ \t]+$/, '');
    comment = v.slice(trimmed.length) + comment;
    v = trimmed;
    if (v.length >= 2 && ((v[0] === "'" && v.at(-1) === "'") || (v[0] === '"' && v.at(-1) === '"'))) {
        v = v.slice(1, -1);
    }
    return [v, comment];
}

export class INIReader {
    constructor() {
        this.clear();
    }

    clear() {
        // lines: { type: 'other'|'section'|'key', text, section, key, value, comment }
        this.lines = [];
        this.sections = new Map();
        this.lineBreak = '\n';
        this.bom = false;
    }

    loadString(content) {
        this.clear();
        if (content.charCodeAt(0) === 0xfeff) {
            content = content.slice(1);
            this.bom = true;
        }
        if (content.includes('\r\n')) {
            this.lineBreak = '\r\n';
        }
        let section = '';
        for (const rawLine of content.split('\n')) {
            const line = rawLine.replace(/\r$/, '');
            const t = line.replace(/^[ \t]+/, '');
            if (t.startsWith('[')) {
                const end = t.indexOf(']');
                section = end > 0 ? t.slice(1, end) : t.slice(1);
                this.lines.push({ type: 'section', text: line, section });
                this.ensureSection(section);
                continue;
            }
            const eq = t.indexOf('=');
            const commentPos = t.search(/[;#'"]/);
            if (t === '' || eq < 0 || (commentPos >= 0 && commentPos < eq)) {
                this.lines.push({ type: 'other', text: line, section });
                continue;
            }
            const key = t.slice(0, eq).replace(/[ \t]+$/, '');
            const [value, comment] = parseValue(t.slice(eq + 1));
            const entry = { type: 'key', text: line, section, key, value, comment };
            this.lines.push(entry);
            this.ensureSection(section).set(key.toLowerCase(), entry);
        }
    }

    ensureSection(name) {
        const k = name.toLowerCase();
        let s = this.sections.get(k);
        if (!s) {
            s = new Map();
            this.sections.set(k, s);
        }
        return s;
    }

    hasSection(section) {
        return this.sections.has(section.toLowerCase());
    }

    hasKey(section, key) {
        const s = this.sections.get(section.toLowerCase());
        return !!(s && s.has(key.toLowerCase()));
    }

    getString(section, key, def = '') {
        const s = this.sections.get(section.toLowerCase());
        if (!s) {
            return def;
        }
        const e = s.get(key.toLowerCase());
        return e ? e.value : def;
    }

    // strtol(value, &end, 0)
    getInt(section, key, def = 0) {
        const v = this.getString(section, key, '').trim();
        const m = /^[+-]?(0x[0-9a-f]+|0[0-7]*|[1-9][0-9]*)/i.exec(v);
        if (!m) {
            return def;
        }
        let s = m[0];
        let neg = false;
        if (s[0] === '+' || s[0] === '-') {
            neg = s[0] === '-';
            s = s.slice(1);
        }
        let n;
        if (/^0x/i.test(s)) {
            n = parseInt(s.slice(2), 16);
        } else if (s.length > 1 && s[0] === '0') {
            n = parseInt(s, 8);
        } else {
            n = parseInt(s, 10);
        }
        return neg ? -n : n;
    }

    getReal(section, key, def = 0) {
        const v = parseFloat(this.getString(section, key, ''));
        return Number.isFinite(v) ? v : def;
    }

    getAllSections() {
        return [...new Set(this.lines.filter((l) => l.type === 'section').map((l) => l.section))];
    }

    getAllKeys(section) {
        const s = this.sections.get(section.toLowerCase());
        return s ? [...s.values()].map((e) => e.key) : [];
    }

    setKey(section, key, value) {
        value = String(value);
        const s = this.ensureSection(section);
        const e = s.get(key.toLowerCase());
        if (e) {
            e.value = value;
            e.text = null;
            return;
        }
        const entry = { type: 'key', text: null, section, key, value, comment: '' };
        s.set(key.toLowerCase(), entry);
        // insert at the end of the section (before trailing blank lines)
        let last = -1;
        let found = false;
        for (let i = 0; i < this.lines.length; i++) {
            const l = this.lines[i];
            if (l.section.toLowerCase() === section.toLowerCase()) {
                if (l.type === 'section') {
                    found = true;
                }
                if (l.type !== 'other' || l.text.trim() !== '') {
                    last = i;
                }
            }
        }
        if (!found && section !== '') {
            if (this.lines.length && this.lines.at(-1).text !== '') {
                this.lines.push({ type: 'other', text: '', section: this.lines.at(-1).section });
            }
            this.lines.push({ type: 'section', text: `[${section}]`, section });
            this.lines.push(entry);
            return;
        }
        this.lines.splice(last + 1, 0, entry);
    }

    eraseKey(section, key) {
        const s = this.sections.get(section.toLowerCase());
        if (!s) {
            return;
        }
        const e = s.get(key.toLowerCase());
        if (e) {
            s.delete(key.toLowerCase());
            this.lines = this.lines.filter((l) => l !== e);
        }
    }

    toString() {
        const out = this.lines.map((l) => {
            if (l.type !== 'key' || l.text !== null) {
                return l.text;
            }
            let v = l.value;
            if (/[;#\n\r]/.test(v)) {
                v = `"${v}"`;
            }
            return `${l.key} = ${v}${l.comment ? ' ' + l.comment.trimStart() : ''}`;
        });
        return (this.bom ? '﻿' : '') + out.join(this.lineBreak);
    }
}
