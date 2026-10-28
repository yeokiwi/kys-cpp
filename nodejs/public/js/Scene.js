// Scene: base of the main map, sub scenes and battle scenes (Scene.cpp)
import { C } from './Color.js';
import { Engine } from './Engine.js';
import * as K from './Keys.js';
import { Point, Towards_LeftDown, Towards_LeftUp, Towards_None, Towards_RightDown, Towards_RightUp } from './Point.js';
import { RunNode } from './RunNode.js';
import { clamp } from './util.js';

export const TILE_W_0 = 18;
export const TILE_H_0 = 9;

// a small binary heap for A*
class MinHeap {
    constructor(less) {
        this.a = [];
        this.less = less;
    }

    push(v) {
        const a = this.a;
        a.push(v);
        let i = a.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.less(a[i], a[p])) {
                [a[i], a[p]] = [a[p], a[i]];
                i = p;
            } else {
                break;
            }
        }
    }

    pop() {
        const a = this.a;
        const top = a[0];
        const last = a.pop();
        if (a.length) {
            a[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1;
                const r = l + 1;
                let m = i;
                if (l < a.length && this.less(a[l], a[m])) {
                    m = l;
                }
                if (r < a.length && this.less(a[r], a[m])) {
                    m = r;
                }
                if (m === i) {
                    break;
                }
                [a[i], a[m]] = [a[m], a[i]];
                i = m;
            }
        }
        return top;
    }

    get size() {
        return this.a.length;
    }
}

export class Scene extends RunNode {
    constructor() {
        super();
        this.render_center_x_ = 0;
        this.render_center_y_ = 0;
        this.view_width_region_ = 0;
        this.view_sum_region_ = 0;
        this.total_step_ = 0;
        this.pre_pressed_ = K.K_UNKNOWN;
        this.pre_pressed_ticks_ = 0;
        this.man_x_ = 0;
        this.man_y_ = 0;
        this.mouse_event_x_ = -1;
        this.mouse_event_y_ = -1;
        this.cursor_x_ = 0;
        this.cursor_y_ = 0;
        this.towards_ = 0;
        this.step_ = 0;
        this.man_pic_ = 0;
        this.rest_time_ = 0;
        this.COORD_COUNT = 0;
        this.first_step_delay_ = 5;
        this.way_que_ = [];
    }

    static setTileScale(scale) {
        Scene.TILE_W = TILE_W_0 * scale;
        Scene.TILE_H = TILE_H_0 * scale;
    }

    static setKeyWalkDealy(d) {
        Scene.key_walk_delay_ = d;
    }

    static isWallTile(n) {
        return (n >= 701 && n <= 1139) || (n >= 1410 && n <= 1436) || (n >= 1505 && n <= 1621)
            || (n >= 1816 && n <= 1849) || (n >= 2116 && n <= 2144) || (n >= 2184 && n <= 2285);
    }

    onWindowResized() {
        this.calViewRegion();
        super.onWindowResized();
    }

    draw() {}

    async dealEvent(e) {}

    calViewRegion() {
        const [w, h] = Engine.getAssistTextureSize('scene');
        this.render_center_x_ = Math.trunc(w / 2);
        this.render_center_y_ = Math.trunc(h / 2);
        this.view_width_region_ = Math.trunc(this.render_center_x_ / Scene.TILE_W / 2) + 3;
        this.view_sum_region_ = Math.trunc(this.render_center_y_ / Scene.TILE_H) + 2;
    }

    beginDrawScene() {
        Engine.setRenderTarget('scene');
    }

    endDrawScene() {
        Engine.renderTextureToMain('scene');
        Engine.setRenderMainTexture();
    }

    setManPosition(x, y) {
        this.man_x_ = x;
        this.man_y_ = y;
    }

    getManPosition() {
        return [this.man_x_, this.man_y_];
    }

    setManPic(pic) {
        this.man_pic_ = pic;
    }

    setTowards(t) {
        this.towards_ = t;
    }

    getPositionOnRender(x, y, view_x, view_y) {
        x -= view_x;
        y -= view_y;
        return new Point(-y * Scene.TILE_W + x * Scene.TILE_W + this.render_center_x_, y * Scene.TILE_H + x * Scene.TILE_H + this.render_center_y_);
    }

    getPositionOnWindow(x, y, view_x, view_y) {
        const p = this.getPositionOnRender(x, y, view_x, view_y);
        const [w, h] = Engine.getUISize();
        p.x = Math.trunc((p.x * w) / this.render_center_x_ / 2);
        p.y = Math.trunc((p.y * h) / this.render_center_y_ / 2);
        return p;
    }

    calTowards(x1, y1, x2, y2) {
        const d1 = y2 - y1;
        const d2 = x2 - x1;
        const dm = Math.abs(d1) - Math.abs(d2);
        if (d1 !== 0 || d2 !== 0) {
            if (dm >= 0) {
                return d1 < 0 ? Towards_RightUp : Towards_LeftDown;
            }
            return d2 < 0 ? Towards_LeftUp : Towards_RightDown;
        }
        return Towards_None;
    }

    calDistance(x1, y1, x2, y2) {
        return Math.abs(x1 - x2) + Math.abs(y1 - y2);
    }

    calBlockTurn(x, y, layer) {
        return 4 * (128 * (x + y) + x) + layer;
    }

    changeTowardsByKey(key) {
        const tw = this.getTowardsByKey(key);
        if (tw !== Towards_None) {
            this.towards_ = tw;
        }
    }

    getTowardsByKey(key) {
        switch (key) {
        case K.K_LEFT: return Towards_LeftUp;
        case K.K_RIGHT: return Towards_RightDown;
        case K.K_UP: return Towards_RightUp;
        case K.K_DOWN: return Towards_LeftDown;
        default: return Towards_None;
        }
    }

    getTowardsByMouse(mouse_x, mouse_y) {
        const [w, h] = Engine.getWindowSize();
        mouse_x = Math.trunc((mouse_x * this.render_center_x_ * 2) / w);
        mouse_y = Math.trunc((mouse_y * this.render_center_y_ * 2) / h);
        const cx = this.render_center_x_;
        const cy = this.render_center_y_;
        if (mouse_x < cx && mouse_y < cy) {
            return Towards_LeftUp;
        }
        if (mouse_x < cx && mouse_y > cy) {
            return Towards_LeftDown;
        }
        if (mouse_x > cx && mouse_y < cy) {
            return Towards_RightUp;
        }
        if (mouse_x > cx && mouse_y > cy) {
            return Towards_RightDown;
        }
        return Towards_None;
    }

    // returns [x1, y1]; when tw is None, returns null (positions unchanged)
    static getTowardsPosition(x0, y0, tw) {
        if (tw === Towards_None) {
            return null;
        }
        let x1 = x0;
        let y1 = y0;
        switch (tw) {
        case Towards_LeftUp: x1--; break;
        case Towards_RightDown: x1++; break;
        case Towards_RightUp: y1--; break;
        case Towards_LeftDown: y1++; break;
        default: break;
        }
        return [x1, y1];
    }

    canWalk(x, y) {
        return false;
    }

    isOutScreen(x, y) {
        return false;
    }

    getMousePosition(mouse_x, mouse_y, view_x, view_y) {
        if (view_x === undefined) {
            view_x = mouse_x;
            view_y = mouse_y;
            [mouse_x, mouse_y] = Engine.getMouseStateInStartWindow();
        }
        const [w, h] = Engine.getUISize();
        const mx = (mouse_x * this.render_center_x_ * 2.0) / w;
        const my = (mouse_y * this.render_center_y_ * 2.0) / h + Scene.TILE_H * 2;
        const cx = this.render_center_x_;
        const cy = this.render_center_y_;
        return new Point(
            Math.trunc(((mx - cx) / Scene.TILE_W + (my - cy) / Scene.TILE_H) / 2 + view_x),
            Math.trunc(((-mx + cx) / Scene.TILE_W + (my - cy) / Scene.TILE_H) / 2 + view_y),
        );
    }

    calCursorPosition(x, y) {
        const p = this.getMousePosition(x, y);
        this.cursor_x_ = p.x;
        this.cursor_y_ = p.y;
    }

    // A*
    FindWay(Mx, My, Fx, Fy) {
        this.way_que_ = [];
        const visited = new Map();
        const key = (x, y) => (x + 1000) * 4096 + (y + 1000);
        const dirs = [[1, 0], [0, -1], [0, 1], [-1, 0]];
        // ties are broken by insertion order like a std::priority_queue would not be; keep it deterministic
        let serial = 0;
        const heap = new MinHeap((a, b) => (a.f !== b.f ? a.f < b.f : a.serial < b.serial));
        const begin = { x: Mx, y: My, step: 0, f: 0, parent: null, serial: serial++ };
        begin.f = begin.step + 2 * (Math.abs(Mx - Fx) + Math.abs(My - Fy));
        visited.set(key(Mx, My), begin);
        heap.push(begin);
        let s_num = 0;
        while (heap.size && s_num <= 4096) {
            const t = heap.pop();
            s_num++;
            if (t.x === Fx && t.y === Fy) {
                let p = t;
                this.way_que_.push(new Point(p.x, p.y));
                while (p.parent) {
                    this.way_que_.push(new Point(p.x, p.y));
                    p = p.parent;
                }
                break;
            }
            for (const [dx, dy] of dirs) {
                const x = t.x + dx;
                const y = t.y + dy;
                if ((this.canWalk(x, y) || (x === Fx && y === Fy)) && !visited.has(key(x, y))) {
                    const n = { x, y, step: t.step + 1, f: 0, parent: t, serial: serial++ };
                    n.f = n.step + 2 * (Math.abs(x - Fx) + Math.abs(y - Fy));
                    visited.set(key(x, y), n);
                    heap.push(n);
                }
            }
        }
    }

    async lightScene() {
        for (let i = 10; i >= 0; i--) {
            if (this.exit_) {
                break;
            }
            const alpha = clamp(i * 25, 0, 255);
            await this.drawAndPresent(1, () => Engine.fillColor(C(0, 0, 0, alpha), 0, 0, -1, -1));
        }
    }

    async darkScene() {
        for (let i = 0; i <= 10; i++) {
            if (this.exit_) {
                break;
            }
            const alpha = clamp(i * 25, 0, 255);
            await this.drawAndPresent(1, () => Engine.fillColor(C(0, 0, 0, alpha), 0, 0, -1, -1));
        }
    }

    isOutLine(x, y) {
        return x < 0 || x >= this.COORD_COUNT || y < 0 || y >= this.COORD_COUNT;
    }

    setMouseEventPoint(x, y) {
        this.mouse_event_x_ = x;
        this.mouse_event_y_ = y;
    }

    getPositionOnWholeEarth(x, y) {
        const p = this.getPositionOnRender(x, y, 0, 0);
        p.x += this.COORD_COUNT * Scene.TILE_W - this.render_center_x_;
        p.y += 2 * Scene.TILE_H - this.render_center_y_;
        return p;
    }
}
Scene.TILE_W = 18;
Scene.TILE_H = 9;
Scene.key_walk_delay_ = 20;
