// RunNode: the basic executable/drawable node (RunNode.cpp). run() keeps the
// C++ semantics of a nested loop; in the browser it is an async loop that yields
// to the browser once per frame, so every caller of run() awaits it.
import { Audio } from './Audio.js';
import { Engine } from './Engine.js';
import { Font } from './Font.js';
import { FrameClock } from './FrameClock.js';
import * as K from './Keys.js';
import { format } from './util.js';

export const NodeNormal = 0;
export const NodePass = 1;
export const NodePress = 2;

export const DirectNone = 0;
export const DirectLeft = 1;
export const DirectUp = 2;
export const DirectRight = 3;
export const DirectDown = 4;

const root_ = [];
let render_message_ = 0;
let use_virtual_stick_ = 0;
let virtual_stick_ = null;
let quit_handler_ = null;

export class RunNode {
    constructor() {
        this.childs_ = [];
        this.visible_ = true;
        this.result_ = -1;
        this.full_window_ = 0;
        this.exit_ = false;
        this.running_ = false;
        this.stay_frame_ = -1;
        this.current_frame_ = 0;
        this.dark_ = 0;
        this.x_ = 0;
        this.y_ = 0;
        this.w_ = 0;
        this.h_ = 0;
        this.active_child_ = -1;
        this.tag_ = 0;
        this.deal_event_ = 1;
        this.state_ = NodeNormal;
        this.prev_present_ticks_ = 0;
    }

    static get root() {
        return root_;
    }

    static setRefreshInterval(i) {
        FrameClock.refresh_interval_ = i;
    }

    static getRefreshInterval() {
        return FrameClock.refresh_interval_;
    }

    static getShowTimes() {
        return FrameClock.getShowTimes();
    }

    static setRenderMessage(m) {
        render_message_ = m;
    }

    static setUseVirtualStick(u) {
        use_virtual_stick_ = u;
    }

    static getUseVirtualStick() {
        return use_virtual_stick_;
    }

    static setVirtualStick(v) {
        virtual_stick_ = v;
    }

    static setQuitHandler(f) {
        quit_handler_ = f;
    }

    onWindowResized() {
        for (const c of this.childs_) {
            c.onWindowResized();
        }
    }

    static notifyWindowResized() {
        for (const n of root_) {
            n.onWindowResized();
        }
        if (use_virtual_stick_ && virtual_stick_) {
            virtual_stick_.onWindowResized();
        }
    }

    static drawAll() {
        let begin_base = 0;
        for (let i = 0; i < root_.length; i++) {
            root_[i].backRunSelfChilds();
            if (root_[i].full_window_) {
                begin_base = i;
            }
        }
        for (let i = begin_base; i < root_.length; i++) {
            root_[i].drawSelfChilds();
        }
        if (use_virtual_stick_ && virtual_stick_) {
            virtual_stick_.drawSelfChilds();
        }
    }

    static addIntoDrawTop(element) {
        root_.push(element);
    }

    static removeFromDraw(element = null) {
        if (element === null) {
            return root_.pop() || null;
        }
        const i = root_.indexOf(element);
        if (i >= 0) {
            root_.splice(i, 1);
            return element;
        }
        return null;
    }

    addChild(element, x, y) {
        element.setTag(this.childs_.length);
        this.childs_.push(element);
        if (x !== undefined) {
            element.setPosition(this.x_ + x, this.y_ + y);
        }
        return element;
    }

    getChild(i) {
        return this.childs_[i];
    }

    getChilds() {
        return this.childs_;
    }

    getChildCount() {
        return this.childs_.length;
    }

    removeChild(element) {
        const i = this.childs_.indexOf(element);
        if (i >= 0) {
            this.childs_.splice(i, 1);
        }
    }

    clearChilds() {
        this.childs_.length = 0;
    }

    setPosition(x, y) {
        for (const c of this.childs_) {
            c.setPosition(c.x_ + x - this.x_, c.y_ + y - this.y_);
        }
        this.x_ = x;
        this.y_ = y;
    }

    setSize(w, h) {
        this.w_ = w;
        this.h_ = h;
    }

    getPosition() {
        return [this.x_, this.y_];
    }

    getSize() {
        return [this.w_, this.h_];
    }

    inSide(x, y) {
        if (!this.visible_) {
            return false;
        }
        const r = Engine.windowToUISpace(x, y, false);
        if (!r.inside) {
            return false;
        }
        return r.x > this.x_ && r.x < this.x_ + this.w_ && r.y > this.y_ && r.y < this.y_ + this.h_;
    }

    mouseIn() {
        const [x, y] = Engine.getMouseState();
        return this.inSide(x, y);
    }

    inSideInStartWindow(x, y) {
        if (!this.visible_) {
            return false;
        }
        return x > this.x_ && x < this.x_ + this.w_ && y > this.y_ && y < this.y_ + this.h_;
    }

    getResult() {
        return this.result_;
    }

    setResult(r) {
        this.result_ = r;
    }

    getVisible() {
        return this.visible_;
    }

    setVisible(v) {
        this.visible_ = v;
    }

    setDealEvent(d) {
        this.deal_event_ = d;
    }

    setIsDark(d) {
        this.dark_ = d;
    }

    getState() {
        return this.state_;
    }

    setState(s) {
        this.state_ = s;
    }

    getTag() {
        return this.tag_;
    }

    setTag(t) {
        this.tag_ = t;
    }

    static getCurrentTopDraw() {
        return root_[root_.length - 1];
    }

    setAllChildState(s) {
        for (const c of this.childs_) {
            c.state_ = s;
        }
    }

    setAllChildVisible(v) {
        for (const c of this.childs_) {
            c.visible_ = v;
        }
    }

    findNextVisibleChild(i0, direct) {
        if (direct === DirectNone || this.childs_.length === 0) {
            return i0;
        }
        const current = this.getChild(i0);
        let min1 = 9999;
        let min2 = 9999 * 10;
        let i1 = i0;
        let wrap_index = i0;
        let wrap_distance = -1;
        let wrap_offset = 999999;
        for (let i = 0; i < this.childs_.length; i++) {
            if (i === i0 || !this.childs_[i].visible_) {
                continue;
            }
            const c = this.childs_[i];
            let dis1 = 0;
            let dis2 = 0;
            switch (direct) {
            case DirectLeft:
                dis1 = current.x_ - c.x_;
                dis2 = Math.abs(c.y_ - current.y_);
                break;
            case DirectUp:
                dis1 = current.y_ - c.y_;
                dis2 = Math.abs(c.x_ - current.x_);
                break;
            case DirectRight:
                dis1 = c.x_ - current.x_;
                dis2 = Math.abs(c.y_ - current.y_);
                break;
            case DirectDown:
                dis1 = c.y_ - current.y_;
                dis2 = Math.abs(c.x_ - current.x_);
                break;
            default:
                break;
            }
            if (dis1 === 0) {
                continue;
            }
            if (dis1 < 0) {
                const opposite = -dis1;
                if (opposite > wrap_distance || (opposite === wrap_distance && dis2 < wrap_offset)) {
                    wrap_distance = opposite;
                    wrap_offset = dis2;
                    wrap_index = i;
                }
                continue;
            }
            const deg = (Math.atan2(dis2, dis1) * 180) / 3.14159265;
            if (dis1 < min1 && deg < 15) {
                min1 = dis1;
                i1 = i;
            }
            if (dis1 + deg * 20 < min2) {
                min2 = dis1 + deg * 20;
                i1 = i;
            }
        }
        if (i1 !== i0) {
            return i1;
        }
        return wrap_index;
    }

    findFristVisibleChild() {
        for (let i = 0; i < this.childs_.length; i++) {
            if (this.childs_[i].visible_) {
                return i;
            }
        }
        return -1;
    }

    setExit(e) {
        this.exit_ = e;
    }

    isRunning() {
        return this.running_;
    }

    exitWithResult(r) {
        this.setExit(true);
        this.result_ = r;
    }

    getActiveChildIndex() {
        return this.active_child_;
    }

    forceActiveChild(index) {
        if (index !== undefined) {
            this.active_child_ = index;
        }
        for (let i = 0; i < this.childs_.length; i++) {
            this.childs_[i].setState(NodeNormal);
            if (i === this.active_child_) {
                this.childs_[i].setState(NodePass);
            }
        }
    }

    checkActiveToResult() {
        this.result_ = -1;
        const r = this.checkChildState();
        if (r === this.active_child_) {
            this.result_ = this.active_child_;
        }
    }

    // virtual hooks
    backRun() {}

    draw() {}

    async dealEvent(e) {}

    async dealEvent2(e) {}

    async onEntrance() {}

    async onExit() {}

    async onPressedOK() {}

    async onPressedCancel() {}

    setStayFrame(s) {
        this.stay_frame_ = s;
    }

    checkFrame() {
        if (this.stay_frame_ > 0 && this.current_frame_ >= this.stay_frame_) {
            this.exit_ = true;
        }
    }

    isPressOK(e) {
        return (e.type === K.EVENT_KEY_UP && (e.key.key === K.K_RETURN || e.key.key === K.K_SPACE))
            || (e.type === K.EVENT_MOUSE_BUTTON_UP && e.button.button === K.BUTTON_LEFT)
            || (e.type === K.EVENT_GAMEPAD_BUTTON_UP && e.gbutton.button === K.GAMEPAD_BUTTON_SOUTH);
    }

    isPressCancel(e) {
        return (e.type === K.EVENT_KEY_UP && e.key.key === K.K_ESCAPE)
            || (e.type === K.EVENT_MOUSE_BUTTON_UP && e.button.button === K.BUTTON_RIGHT)
            || (e.type === K.EVENT_GAMEPAD_BUTTON_UP && e.gbutton.button === K.GAMEPAD_BUTTON_EAST);
    }

    drawSelfChilds() {
        if (this.visible_) {
            if (this.dark_) {
                Engine.fillColor({ r: 0, g: 0, b: 0, a: 128 }, 0, 0, -1, -1);
            }
            this.draw();
            for (const c of this.childs_) {
                if (c.visible_) {
                    c.drawSelfChilds();
                }
            }
        }
    }

    async checkStateSelfChilds(e, check_event = false) {
        if (this.visible_ || this.full_window_) {
            for (let i = this.childs_.length - 1; i >= 0; i--) {
                const c = this.childs_[i];
                if (c) {
                    await c.checkStateSelfChilds(e, check_event);
                }
            }
            if (check_event) {
                this.checkSelfState(e);
                const r = this.checkChildState();
                if (r >= 0) {
                    this.active_child_ = r;
                }
                if (this.deal_event_) {
                    await this.dealEvent(e);
                    if (this.isPressOK(e)) {
                        await this.onPressedOK();
                    }
                    if (this.isPressCancel(e)) {
                        await this.onPressedCancel();
                    }
                }
            }
            await this.dealEvent2(e);
        } else {
            this.state_ = NodeNormal;
        }
    }

    backRunSelfChilds() {
        for (const c of [...this.childs_]) {
            c.backRunSelfChilds();
            if (c.stay_frame_ > 0 && c.current_frame_ > c.stay_frame_) {
                this.removeChild(c);
            }
        }
        this.backRun();
        this.current_frame_++;
    }

    async dealEventSelfChilds(check_event = false) {
        if (check_event) {
            let e = { type: K.EVENT_FIRST };
            let ev;
            while ((ev = Engine.pollEvent())) {
                e = ev;
                if (RunNode.isSpecialEvent(e)) {
                    break;
                }
            }
            if (e.type === K.EVENT_GAMEPAD_AXIS_MOTION) {
                while (Engine.pollEvent()) {
                    // drop the flood of axis events
                }
            }
            if (e.type === K.EVENT_DID_ENTER_BACKGROUND) {
                Audio.pauseMusic();
            }
            if (e.type === K.EVENT_DID_ENTER_FOREGROUND) {
                Audio.resumeMusic();
            }
            if (e.type === K.EVENT_WINDOW_RESIZED || e.type === K.EVENT_WINDOW_PIXEL_SIZE_CHANGED
                || e.type === K.EVENT_WINDOW_MAXIMIZED || e.type === K.EVENT_WINDOW_RESTORED) {
                RunNode.notifyWindowResized();
            }
            if (use_virtual_stick_ && virtual_stick_) {
                virtual_stick_.dealEventVirtual(e);
            }
            await this.checkStateSelfChilds(e, check_event);
            if (e.type === K.EVENT_QUIT || e.type === K.EVENT_WINDOW_CLOSE_REQUESTED) {
                if (quit_handler_) {
                    await quit_handler_();
                }
            }
        } else {
            const e = { type: K.EVENT_FIRST };
            if (use_virtual_stick_ && virtual_stick_) {
                virtual_stick_.dealEventVirtual(e);
            }
            await this.checkStateSelfChilds(e, check_event);
        }
    }

    static isSpecialEvent(e) {
        const t = e.type;
        return t === K.EVENT_QUIT || t === K.EVENT_WINDOW_CLOSE_REQUESTED || t === K.EVENT_KEY_DOWN || t === K.EVENT_KEY_UP
            || t === K.EVENT_TEXT_EDITING || t === K.EVENT_TEXT_INPUT || t === K.EVENT_MOUSE_MOTION
            || t === K.EVENT_MOUSE_BUTTON_DOWN || t === K.EVENT_MOUSE_BUTTON_UP || t === K.EVENT_MOUSE_WHEEL
            || t === K.EVENT_GAMEPAD_AXIS_MOTION || t === K.EVENT_GAMEPAD_BUTTON_DOWN || t === K.EVENT_GAMEPAD_BUTTON_UP
            || t === K.EVENT_DID_ENTER_BACKGROUND || t === K.EVENT_WILL_ENTER_FOREGROUND || t === K.EVENT_DID_ENTER_FOREGROUND
            || t === K.EVENT_GAMEPAD_ADDED || t === K.EVENT_GAMEPAD_REMOVED
            || t === K.EVENT_WINDOW_RESIZED || t === K.EVENT_WINDOW_PIXEL_SIZE_CHANGED
            || t === K.EVENT_WINDOW_MAXIMIZED || t === K.EVENT_WINDOW_RESTORED;
    }

    checkChildState() {
        let r = -1;
        for (let i = 0; i < this.childs_.length; i++) {
            if (this.childs_[i].getState() !== NodeNormal) {
                r = i;
            }
        }
        return r;
    }

    checkSelfState(e) {
        if (e.type === K.EVENT_MOUSE_MOTION) {
            this.state_ = this.inSide(e.motion.x, e.motion.y) ? NodePass : NodeNormal;
        }
        if ((e.type === K.EVENT_MOUSE_BUTTON_DOWN || e.type === K.EVENT_MOUSE_BUTTON_UP) && e.button.button === K.BUTTON_LEFT) {
            this.state_ = this.inSide(e.button.x, e.button.y) ? NodePress : NodeNormal;
        }
        if ((e.type === K.EVENT_KEY_DOWN || e.type === K.EVENT_KEY_UP) && (e.key.key === K.K_RETURN || e.key.key === K.K_SPACE)) {
            if (this.state_ === NodePass) {
                this.state_ = NodePress;
            }
        }
        if ((e.type === K.EVENT_GAMEPAD_BUTTON_DOWN || e.type === K.EVENT_GAMEPAD_BUTTON_UP) && e.gbutton.button === K.GAMEPAD_BUTTON_SOUTH) {
            if (this.state_ === NodePass) {
                this.state_ = NodePress;
            }
        }
    }

    static async present() {
        const t = Engine.getTicks() - FrameClock.global_prev_present_ticks_;
        const e = Engine;
        if (render_message_) {
            const w = e.getPresentWidth();
            const h = e.getPresentHeight();
            Font.draw(format('Render one frame in {:.3f} ms', t), 20, w - 300, h - 60);
            Font.draw(format('Render texture time is {}', e.getRenderTimes()), 20, w - 300, h - 35);
            e.resetRenderTimes();
        }
        e.resetRenderTarget();
        e.fillColor({ r: 0, g: 0, b: 0, a: 255 }, 0, 0, -1, -1, K.BLENDMODE_NONE);
        e.renderMainTextureToWindow();
        Font.executeDrawCalls();
        e.renderPresent();
        e.setRenderMainTexture();
        const interval = FrameClock.refresh_interval_;
        let t_delay = interval - t;
        if (t_delay > interval) {
            t_delay = interval;
        }
        await e.waitFrame(t_delay);
        FrameClock.global_prev_present_ticks_ = Engine.getTicks();
    }

    async run(in_root = true) {
        if (root_.length && root_[root_.length - 1].exit_) {
            return 1;
        }
        this.exit_ = false;
        this.visible_ = true;
        if (in_root) {
            RunNode.addIntoDrawTop(this);
        }
        await this.onEntrance();
        this.running_ = true;
        while (true) {
            if (root_.length === 0) {
                break;
            }
            if (this.exit_) {
                break;
            }
            await this.dealEventSelfChilds(true);
            if (this.exit_) {
                break;
            }
            RunNode.drawAll();
            this.checkFrame();
            await RunNode.present();
        }
        this.running_ = false;
        await this.onExit();
        if (in_root) {
            RunNode.removeFromDraw(this);
        }
        return this.result_;
    }

    async runAtPosition(x = 0, y = 0, in_root = true) {
        this.setPosition(x, y);
        return this.run(in_root);
    }

    static exitAll(begin = 0) {
        for (let i = begin; i < root_.length; i++) {
            root_[i].exit_ = true;
            root_[i].visible_ = false;
        }
    }

    async drawAndPresent(times = 1, func = null) {
        if (times < 1) {
            return 0;
        }
        if (times > 100) {
            times = 100;
        }
        for (let i = 0; i < times; i++) {
            await this.dealEventSelfChilds(false);
            RunNode.drawAll();
            if (func) {
                func();
            }
            await RunNode.present();
            if (this.exit_) {
                break;
            }
        }
        return times;
    }

    static getPointerFromRoot(cls) {
        for (let i = root_.length - 1; i >= 0; i--) {
            if (root_[i] instanceof cls) {
                return root_[i];
            }
        }
        return null;
    }

    static topIsType(cls) {
        return root_[root_.length - 1] instanceof cls;
    }

    checkPrevTimeElapsed(ms) {
        const t = Engine.getTicks();
        if (t - this.prev_present_ticks_ >= ms) {
            this.prev_present_ticks_ = t;
            return true;
        }
        return false;
    }
}
