// Font: text drawing with per-character glyph textures (Font.cpp). Draw calls
// are queued in the UIRenderer and executed at window resolution.
import { C, RI } from './Color.js';
import { Engine } from './Engine.js';
import { fileUrl, readText } from './Files.js';
import { SimpleCC } from './SimpleCC.js';
import { TextureManager } from './TextureManager.js';
import { UIRenderer } from './UIRenderer.js';
import { textDrawSize } from './util.js';

const FONT_FAMILY = 'kysfont';

class FontImpl {
    constructor() {
        this.family_ = `"${FONT_FAMILY}", "Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif`;
        this.buffer_ = new Map();
        this.t2s_buffer_ = new Map();
        this.cct2s_ = new SimpleCC();
        this.simplified_ = 1;
        this.stat_message_ = 0;
        UIRenderer.font_ = this;
    }

    async init() {
        try {
            const face = new FontFace(FONT_FAMILY, `url(${fileUrl('font/chinese.ttf')})`);
            await face.load();
            document.fonts.add(face);
        } catch {
            console.log('Failed to load font/chinese.ttf, using a browser font');
            this.family_ = '"Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC", sans-serif';
        }
        const [phrases, characters] = await Promise.all([readText('cc/TSPhrases.txt'), readText('cc/TSCharacters.txt')]);
        this.cct2s_.loadText(phrases);
        this.cct2s_.loadText(characters);
    }

    setStatMessage(s) {
        this.stat_message_ = s;
    }

    setSimplified(s) {
        this.simplified_ = s;
    }

    T2S(str) {
        return this.cct2s_.conv(str);
    }

    static getBoxRect(textLen, size, x, y) {
        return { x: x - 10, y: y - 3, w: Math.trunc((size * textLen) / 2) + 20, h: size + 8 };
    }

    getBoxRect(textLen, size, x, y) {
        return FontImpl.getBoxRect(textLen, size, x, y);
    }

    // returns the estimated number of lines
    draw(text, size, x, y, color = C(255, 255, 255, 255), alpha = 255) {
        text = String(text ?? '');
        if (!text || size <= 0 || alpha === 0) {
            return 0;
        }
        UIRenderer.drawText(text, size, x, y, color, alpha);
        let lines = 1;
        for (const c of text) {
            if (c === '\n') {
                lines++;
            }
        }
        return lines;
    }

    renderText(text, size, x, y, color, alpha) {
        if (!text || size <= 0 || alpha === 0) {
            return 0;
        }
        let line = 1;
        const x0 = x;
        if (this.simplified_) {
            let t = this.t2s_buffer_.get(text);
            if (t === undefined) {
                t = this.cct2s_.conv(text);
                this.t2s_buffer_.set(text, t);
            }
            text = t;
        }
        const engine = Engine;
        const shadow = { r: Math.trunc(color.r / 10), g: Math.trunc(color.g / 10), b: Math.trunc(color.b / 10), a: alpha };
        const main = { r: color.r, g: color.g, b: color.b, a: alpha };
        for (const ch of text) {
            let w = size;
            const h = size;
            if (ch === '\n') {
                y += h;
                x = x0;
                line++;
                continue;
            }
            const cp = ch.codePointAt(0);
            const key = ch + '\u0000' + size;
            let tex = this.buffer_.get(key);
            if (!tex) {
                tex = engine.createTextTexture(this.family_, ch, size);
                this.buffer_.set(key, tex);
            }
            let x1 = x;
            let y1 = y;
            if (cp < 128) {
                w = Math.trunc(size / 2);
                const drawW = Math.min(tex.w, w);
                x1 += Math.trunc((w - drawW) / 2);
                y1 = y + 4;
                if (cp > 32) {
                    Engine.setColor(tex, shadow);
                    engine.renderTexture(tex, x1 + 1, y1, drawW, size);
                    Engine.setColor(tex, main);
                    engine.renderTexture(tex, x1, y1, drawW, size);
                }
            } else {
                Engine.setColor(tex, shadow);
                engine.renderTexture(tex, x1 + 1, y1, -1, -1);
                Engine.setColor(tex, main);
                engine.renderTexture(tex, x1, y1, -1, -1);
            }
            x += w;
        }
        return line;
    }

    executeDrawCalls() {
        UIRenderer.execute();
    }

    drawWithBox(text, size, x, y, color = C(255, 255, 255, 255), alpha = 255, alpha_box = 255) {
        const r = FontImpl.getBoxRect(textDrawSize(text), size, x, y);
        UIRenderer.drawTexture(TextureManager.getTexture('title', 126), r.x, r.y, RI(C(255, 255, 255, 255), alpha_box), r.w, r.h);
        this.draw(text, size, x, y, color, alpha);
    }

    clearBuffer() {
        for (const t of this.buffer_.values()) {
            Engine.destroyTexture(t);
        }
        this.buffer_.clear();
    }

    getBufferSize() {
        return this.buffer_.size;
    }

    static getTextDrawSize(text) {
        return textDrawSize(text);
    }

    getTextDrawSize(text) {
        return textDrawSize(text);
    }
}

export const Font = new FontImpl();
Font.getInstance = () => Font;
Font.getTextDrawSize = textDrawSize;
Font.getBoxRect = FontImpl.getBoxRect;
