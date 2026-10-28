// SimpleCC (mlcc): longest-match phrase conversion using OpenCC dictionaries,
// used for traditional -> simplified Chinese.

export class SimpleCC {
    constructor() {
        this.root_ = { value: null, children: new Map() };
    }

    loadText(str) {
        let i = 0;
        while (i < str.length) {
            const tab = str.indexOf('\t', i);
            if (tab < 0) {
                break;
            }
            const key = str.slice(i, tab);
            let end = str.indexOf('\n', tab + 1);
            const cr = str.indexOf('\r', tab + 1);
            if (cr >= 0 && (end < 0 || cr < end)) {
                end = cr;
            }
            if (end < 0) {
                break;
            }
            let value = str.slice(tab + 1, end);
            const sp = value.indexOf(' ');
            if (sp >= 0) {
                value = value.slice(0, sp);
            }
            this.write(key, value);
            i = end + 1;
        }
    }

    write(key, value) {
        let t = this.root_;
        const chars = [...key];
        for (let i = 0; i < chars.length; i++) {
            let c = t.children.get(chars[i]);
            if (!c) {
                c = { value: null, children: new Map() };
                t.children.set(chars[i], c);
            }
            t = c;
        }
        t.value = value;
    }

    conv(src) {
        if (this.root_.children.size === 0) {
            return src;
        }
        const chars = [...src];
        let dst = '';
        let i = 0;
        while (i < chars.length) {
            let t = this.root_;
            let end = i;
            let best = 0;
            let bestValue = null;
            while (end < chars.length) {
                const c = t.children.get(chars[end]);
                if (!c) {
                    break;
                }
                end++;
                if (c.value) {
                    best = end - i;
                    bestValue = c.value;
                }
                t = c;
            }
            if (best === 0) {
                dst += chars[i];
                i++;
            } else {
                dst += bestValue;
                i += best;
            }
        }
        return dst;
    }
}
