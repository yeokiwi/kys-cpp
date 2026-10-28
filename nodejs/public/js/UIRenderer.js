// UIRenderer: UI draw calls made on the main texture are deferred and executed
// directly on the window after the main texture has been scaled, keeping text
// and UI images sharp at any window size.
import { BLENDMODE_BLEND } from './Keys.js';
import { Engine } from './Engine.js';
import { TextureManager } from './TextureManager.js';

class UIRendererImpl {
    constructor() {
        this.commands_ = [];
        this.executing_ = false;
        this.font_ = null;
    }

    isExecuting() {
        return this.executing_;
    }

    drawText(text, size, x, y, color, alpha) {
        this.commands_.push({ t: 0, text, size, x, y, color, alpha });
    }

    fillColor(color, x, y, w, h, blend = BLENDMODE_BLEND) {
        this.commands_.push({ t: 1, color, x, y, w, h, blend });
    }

    drawTexture(texture, x, y, info, w = -1, h = -1) {
        if (!texture) {
            return;
        }
        this.commands_.push({ t: 2, texture, x, y, info, w, h });
    }

    drawRawTexture(texture, rect, color) {
        if (!texture) {
            return;
        }
        this.commands_.push({ t: 3, texture, rect: { ...rect }, color });
    }

    execute() {
        this.executing_ = true;
        const engine = Engine;
        const [px, py, pw, ph] = engine.getPresentRect();
        const [ui_w, ui_h] = engine.getUISize();
        if (pw <= 0 || ph <= 0 || ui_w <= 0 || ui_h <= 0) {
            this.commands_.length = 0;
            this.executing_ = false;
            return;
        }
        const sx = pw / ui_w;
        const sy = ph / ui_h;
        for (const d of this.commands_) {
            switch (d.t) {
            case 0:
                this.font_.renderText(d.text, Math.max(1, Math.trunc(d.size * sx)),
                    px + Math.trunc(d.x * sx), py + Math.trunc(d.y * sy), d.color, d.alpha);
                break;
            case 1: {
                const w = d.w < 0 ? pw : Math.trunc(d.w * sx);
                const h = d.h < 0 ? ph : Math.trunc(d.h * sy);
                engine.fillColor(d.color, px + Math.trunc(d.x * sx), py + Math.trunc(d.y * sy), w, h, d.blend);
                break;
            }
            case 2: {
                const tex = d.texture;
                tex.load();
                const info = { ...d.info, zoom_x: (d.info.zoom_x ?? 1) * sx, zoom_y: (d.info.zoom_y ?? 1) * sy };
                const w = d.w < 0 ? -1 : Math.trunc(d.w * sx);
                const h = d.h < 0 ? -1 : Math.trunc(d.h * sy);
                const x = px + Math.trunc((d.x - tex.dx) * sx) + tex.dx;
                const y = py + Math.trunc((d.y - tex.dy) * sy) + tex.dy;
                TextureManager.renderTexture(tex, x, y, info, w, h);
                break;
            }
            default: {
                const rect = {
                    x: px + Math.trunc(d.rect.x * sx),
                    y: py + Math.trunc(d.rect.y * sy),
                    w: Math.trunc(d.rect.w * sx),
                    h: Math.trunc(d.rect.h * sy),
                };
                Engine.setColor(d.texture, d.color);
                engine.renderTextureRect(d.texture, null, rect);
            }
            }
        }
        this.commands_.length = 0;
        this.executing_ = false;
    }
}

export const UIRenderer = new UIRendererImpl();
UIRenderer.getInstance = () => UIRenderer;
Engine.ui_ = UIRenderer;
