// VirtualStick: on-screen gamepad for touch screens (VirtualStick.cpp)
import { C, RI } from './Color.js';
import { Engine } from './Engine.js';
import * as K from './Keys.js';
import { NodeNormal, NodePress, RunNode } from './RunNode.js';
import { ShowExp } from './ShowExp.js';
import { Button, MenuText } from './TextBox.js';
import { TextureManager } from './TextureManager.js';
import { clamp } from './util.js';

export class VirtualStick extends RunNode {
    constructor() {
        super();
        [this.w_, this.h_] = Engine.getUISize();
        this.prev_press_ = 0;
        this.button_interval_ = new Map();
        this.left_axis_x_ = 0;
        this.left_axis_y_ = 0;
        this.right_axis_x_ = 0;
        this.right_axis_y_ = 0;
        this.axis_radius_ = 0;
        this.previous_pinch_distance_ = 0;
        this.previous_pinch_center_ = { x: 0, y: 0 };
        this.a_touch_pressed_ = false;
        this.b_touch_pressed_ = false;
        this.view_touch_pressed_ = false;
        this.menu_touch_pressed_ = false;
        const add = (id, buttonid) => {
            const b = new Button('title', id);
            b.setAlpha(128);
            b.button_id_ = buttonid;
            this.addChild(b, 0, 0);
            return b;
        };
        this.button_up_ = add(312, K.GAMEPAD_BUTTON_DPAD_UP);
        this.button_down_ = add(312, K.GAMEPAD_BUTTON_DPAD_DOWN);
        this.button_left_ = add(312, K.GAMEPAD_BUTTON_DPAD_LEFT);
        this.button_right_ = add(312, K.GAMEPAD_BUTTON_DPAD_RIGHT);
        this.button_a_ = add(300, K.GAMEPAD_BUTTON_SOUTH);
        this.button_b_ = add(302, K.GAMEPAD_BUTTON_EAST);
        this.button_x_ = add(304, K.GAMEPAD_BUTTON_WEST);
        this.button_y_ = add(306, K.GAMEPAD_BUTTON_NORTH);
        this.button_left_axis_ = add(320, K.GAMEPAD_BUTTON_LEFT_STICK);
        this.button_right_axis_ = add(320, K.GAMEPAD_BUTTON_RIGHT_STICK);
        this.button_left_axis_.setVisible(false);
        this.button_right_axis_.setVisible(false);
        this.button_view_ = add(310, K.GAMEPAD_BUTTON_BACK);
        this.button_menu_ = add(308, K.GAMEPAD_BUTTON_START);
        this.updateLayout();
    }

    onWindowResized() {
        this.updateLayout();
        super.onWindowResized();
    }

    updateLayout() {
        [this.w_, this.h_] = Engine.getUISize();
        const w = this.w_;
        const h = this.h_;
        let x = Math.trunc(w * 0.1);
        let y = Math.trunc(h * 0.65);
        let r = Math.trunc(h * 0.1);
        this.button_up_.setPosition(x, y - r);
        this.button_down_.setPosition(x, y + r);
        this.button_left_.setPosition(x - r, y);
        this.button_right_.setPosition(x + r, y);
        x = Math.trunc(w * 0.8);
        y = Math.trunc(h * 0.65);
        r = Math.trunc(h * 0.15);
        this.button_a_.setPosition(x, y + r);
        this.button_b_.setPosition(x + r, y);
        this.button_x_.setPosition(x - r, y);
        this.button_y_.setPosition(x, y - r);
        this.button_left_axis_.setPosition(Math.trunc(w * 0.04), Math.trunc(h * 0.5));
        this.button_right_axis_.setPosition(Math.trunc(w * 0.82), Math.trunc(h * 0.08));
        this.button_view_.setPosition(Math.trunc(w * 0.4 - 25), Math.trunc(h * 0.9));
        this.button_menu_.setPosition(Math.trunc(w * 0.6 - 25), Math.trunc(h * 0.9));
        const t = TextureManager.getTexture('title', 320);
        if (t) {
            this.left_axis_center_x_ = Math.trunc(t.w / 2 + w * 0.04);
            this.left_axis_center_y_ = Math.trunc(t.h / 2 + h * 0.5);
            this.right_axis_center_x_ = Math.trunc(t.w / 2 + w * 0.82);
            this.right_axis_center_y_ = Math.trunc(t.h / 2 + h * 0.08);
            this.axis_radius_ = t.w / 2;
        }
        for (const b of this.childs_) {
            const tex = TextureManager.getTexture('title', b.getNormalTextureID());
            if (tex) {
                b.setSize(tex.w, tex.h);
            }
        }
    }

    // called by RunNode before the event is dispatched; may rewrite the event
    dealEventVirtual(e) {
        const root = RunNode.root;
        const battle_act = root.find((n) => n.isBattleSceneAct) || null;
        const battle = root.find((n) => n.isBattleScene) || null;
        const show_exp = RunNode.getPointerFromRoot(ShowExp);
        const is_action = battle_act !== null;
        const is_paper = is_action && battle_act.usePaperPresentation();
        const is_turn_based_paper = battle && !is_action && battle.usePaperPresentation();
        const is_any_paper = is_paper || is_turn_based_paper;
        const is_menu_active = RunNode.getPointerFromRoot(MenuText) !== null;
        this.setStyle(is_action ? 1 : 0);
        const engine = Engine;
        engine.setTouchPinchScale(1);
        engine.setTouchCameraPan(0, 0);
        engine.clearGameControllerButton();
        engine.clearGameControllerAxis();
        this.left_axis_x_ = 0;
        this.left_axis_y_ = 0;
        this.right_axis_x_ = 0;
        this.right_axis_y_ = 0;
        if (this.axis_radius_ === 0) {
            this.updateLayout();
        }
        for (const b of this.childs_) {
            b.state_ = NodeNormal;
        }
        let pinch_active = false;
        let is_press2 = false;
        const pinch_points = [];
        for (const p of engine.getTouchPoints()) {
            const u = engine.windowToUISpace(p.x, p.y, false);
            if (!u.inside) {
                continue;
            }
            const { x, y } = u;
            let finger_in_control = false;
            for (const b of this.childs_) {
                const [x2, y2] = b.getPosition();
                const [w2, h2] = b.getSize();
                const in_button = x >= x2 && x < x2 + w2 && y >= y2 && y < y2 + h2;
                is_press2 = is_press2 || in_button;
                finger_in_control = finger_in_control || in_button;
                if (b !== this.button_left_axis_ && b !== this.button_right_axis_) {
                    if (in_button && b.getVisible()) {
                        b.state_ = NodePress;
                        engine.setGameControllerButton(b.button_id_, 1);
                    }
                } else if (b.getVisible()) {
                    const left = b === this.button_left_axis_;
                    const cx = left ? this.left_axis_center_x_ : this.right_axis_center_x_;
                    const cy = left ? this.left_axis_center_y_ : this.right_axis_center_y_;
                    const r = Math.hypot(x - cx, y - cy);
                    if (r < this.axis_radius_ * 1.5) {
                        const ax = clamp(Math.trunc(((x - cx) * 30000) / this.axis_radius_), -30000, 30000);
                        const ay = clamp(Math.trunc(((y - cy) * 30000) / this.axis_radius_), -30000, 30000);
                        if (left) {
                            this.left_axis_x_ = x;
                            this.left_axis_y_ = y;
                            engine.setGameControllerAxis(K.GAMEPAD_AXIS_LEFTX, ax);
                            engine.setGameControllerAxis(K.GAMEPAD_AXIS_LEFTY, ay);
                        } else {
                            this.right_axis_x_ = x;
                            this.right_axis_y_ = y;
                            engine.setGameControllerAxis(K.GAMEPAD_AXIS_RIGHTX, ax);
                            engine.setGameControllerAxis(K.GAMEPAD_AXIS_RIGHTY, ay);
                        }
                        b.state_ = NodePress;
                    }
                }
            }
            if (!finger_in_control) {
                pinch_points.push([x, y]);
            }
        }
        if (is_any_paper && pinch_points.length >= 2) {
            const [[x0, y0], [x1, y1]] = pinch_points;
            const distance = Math.hypot(x1 - x0, y1 - y0);
            const center = { x: (x0 + x1) * 0.5, y: (y0 + y1) * 0.5 };
            if (this.previous_pinch_distance_ > 0 && distance > 0) {
                engine.setTouchPinchScale(clamp(distance / this.previous_pinch_distance_, 0.94, 1.06));
                engine.setTouchCameraPan(center.x - this.previous_pinch_center_.x, center.y - this.previous_pinch_center_.y);
            }
            this.previous_pinch_distance_ = distance;
            this.previous_pinch_center_ = center;
            pinch_active = true;
        }
        const a_pressed = this.button_a_.state_ === NodePress;
        const b_pressed = this.button_b_.state_ === NodePress;
        const menu_pressed = this.button_menu_.state_ === NodePress;
        const view_pressed = this.button_view_.state_ === NodePress;
        const a_up = !a_pressed && this.a_touch_pressed_;
        const b_up = !b_pressed && this.b_touch_pressed_;
        const menu_up = !menu_pressed && this.menu_touch_pressed_;
        const view_up = !view_pressed && this.view_touch_pressed_;
        this.a_touch_pressed_ = a_pressed;
        this.b_touch_pressed_ = b_pressed;
        this.menu_touch_pressed_ = menu_pressed;
        this.view_touch_pressed_ = view_pressed;
        const send = (button) => {
            e.type = K.EVENT_GAMEPAD_BUTTON_UP;
            e.gbutton = { button };
        };
        if (show_exp && a_up) {
            send(K.GAMEPAD_BUTTON_SOUTH);
        } else if (is_menu_active && (a_up || b_up)) {
            send(a_up ? K.GAMEPAD_BUTTON_SOUTH : K.GAMEPAD_BUTTON_EAST);
        } else if (menu_up) {
            send(K.GAMEPAD_BUTTON_START);
        } else if (view_up) {
            send(K.GAMEPAD_BUTTON_BACK);
        } else if (!is_action && !is_paper) {
            if (a_up) {
                send(K.GAMEPAD_BUTTON_SOUTH);
            } else if (b_up) {
                send(K.GAMEPAD_BUTTON_EAST);
            }
        }
        if (is_press2) {
            this.prev_press_ = engine.getTicks();
        }
        // ignore the mouse events generated by touches on the controls
        if ((e.type === K.EVENT_MOUSE_BUTTON_UP || e.type === K.EVENT_MOUSE_BUTTON_DOWN || e.type === K.EVENT_MOUSE_MOTION)
            && engine.getTicks() - this.prev_press_ < 500) {
            e.type = K.EVENT_FIRST;
        }
        if (!pinch_active) {
            this.previous_pinch_distance_ = 0;
            this.previous_pinch_center_ = { x: 0, y: 0 };
        }
    }

    draw() {
        const draw_axis = (x, y) => {
            if (x > 0 && y > 0) {
                const t = TextureManager.getTexture('title', 312);
                if (t) {
                    TextureManager.renderTextureByName('title', 312, x - Math.trunc(t.w / 2), y - Math.trunc(t.h / 2), RI(C(255, 255, 255, 255), 128));
                }
            }
        };
        draw_axis(this.left_axis_x_, this.left_axis_y_);
        draw_axis(this.right_axis_x_, this.right_axis_y_);
    }

    setStyle(style) {
        const dpad = style === 0;
        this.button_up_.setVisible(dpad);
        this.button_down_.setVisible(dpad);
        this.button_left_.setVisible(dpad);
        this.button_right_.setVisible(dpad);
        this.button_left_axis_.setVisible(!dpad);
        this.button_right_axis_.setVisible(false);
    }
}
