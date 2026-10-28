// TextBox, Button, ButtonGetKey, Menu and MenuText (TextBox.cpp, Button.cpp, Menu.cpp)
import { C, RI } from './Color.js';
import { Engine } from './Engine.js';
import { Font } from './Font.js';
import * as K from './Keys.js';
import {
    DirectDown, DirectLeft, DirectNone, DirectRight, DirectUp, NodeNormal, NodePass, NodePress, RunNode,
} from './RunNode.js';
import { TextureManager } from './TextureManager.js';
import { textDrawSize, utf8Length } from './util.js';

export class TextBox extends RunNode {
    constructor() {
        super();
        this.text_ = '';
        this.font_size_ = 20;
        this.text_x_ = 0;
        this.text_y_ = 0;
        this.color_normal_ = C(32, 32, 32, 255);
        this.color_pass_ = C(255, 255, 255, 255);
        this.color_press_ = C(255, 255, 255, 255);
        this.have_box_ = true;
        this.have_alpha_box_ = false;
        this.outline_color_ = C(0, 0, 0, 0);
        this.background_color_ = C(0, 0, 0, 0);
        this.texture_path_ = '';
        this.texture_normal_id_ = -1;
        this.texture_pass_id_ = -1;
        this.texture_press_id_ = -1;
        this.resize_with_text_ = false;
    }

    setAlphaBox(outline, background) {
        this.outline_color_ = outline;
        this.background_color_ = background;
        this.have_alpha_box_ = true;
    }

    setTexture(path, normal_id, pass_id = -1, press_id = -1) {
        if (pass_id < 0) {
            pass_id = normal_id;
        }
        if (press_id < 0) {
            press_id = normal_id;
        }
        this.texture_path_ = path;
        this.texture_normal_id_ = normal_id;
        this.texture_pass_id_ = pass_id;
        this.texture_press_id_ = press_id;
    }

    getNormalTextureID() {
        return this.texture_normal_id_;
    }

    setFontSize(size) {
        for (const c of this.childs_) {
            if (c instanceof TextBox) {
                c.setFontSize(size);
            }
        }
        this.font_size_ = size;
        if (this.resize_with_text_) {
            this.w_ = Math.trunc((this.font_size_ * utf8Length(this.text_)) / 2);
            this.h_ = this.font_size_;
        }
    }

    setText(text) {
        this.text_ = String(text);
        if (this.resize_with_text_ && this.texture_normal_id_ < 0) {
            this.w_ = Math.trunc((this.font_size_ * textDrawSize(this.text_)) / 2);
            this.h_ = this.font_size_;
        }
    }

    getText() {
        return this.text_;
    }

    setTextPosition(x, y) {
        this.text_x_ = x;
        this.text_y_ = y;
    }

    setTextColor(c1, c2, c3) {
        this.color_normal_ = c1;
        if (c2) {
            this.color_pass_ = c2;
        }
        if (c3) {
            this.color_press_ = c3;
        }
    }

    setHaveBox(h) {
        this.have_box_ = h;
    }

    draw() {
        if (this.texture_path_) {
            TextureManager.renderTextureByName(this.texture_path_, this.texture_normal_id_, this.x_, this.y_, RI(C(255, 255, 255, 255), 255));
        }
        if (this.have_alpha_box_) {
            const rect = Font.getBoxRect(textDrawSize(this.text_), this.font_size_, this.x_ + this.text_x_, this.y_ + this.text_y_);
            Engine.fillColor(this.background_color_, rect.x, rect.y, rect.w, rect.h);
            Engine.fillColor(this.outline_color_, rect.x, rect.y, rect.w, 1);
            Engine.fillColor(this.outline_color_, rect.x, rect.y + rect.h, rect.w, 1);
            Engine.fillColor(this.outline_color_, rect.x, rect.y, 1, rect.h);
            Engine.fillColor(this.outline_color_, rect.x + rect.w, rect.y, 1, rect.h);
        }
        if (this.text_) {
            if (this.have_box_) {
                Font.drawWithBox(this.text_, this.font_size_, this.x_ + this.text_x_, this.y_ + this.text_y_, this.color_normal_, 255);
            } else {
                Font.draw(this.text_, this.font_size_, this.x_ + this.text_x_, this.y_ + this.text_y_, this.color_normal_, 255);
            }
        }
    }

    async onPressedOK() {
        this.exitWithResult(0);
    }

    async onPressedCancel() {
        this.exitWithResult(-1);
    }
}

export class Button extends TextBox {
    constructor(path, normal_id, pass_id = -1, press_id = -1) {
        super();
        this.alpha_ = 255;
        this.move_on_state_ = true;
        this.button_id_ = -1;
        this.resize_with_text_ = true;
        if (path !== undefined) {
            this.setTexture(path, normal_id, pass_id, press_id);
        }
    }

    getTexutreID() {
        return this.texture_normal_id_;
    }

    setAlpha(a) {
        this.alpha_ = a;
    }

    setMoveOnState(m) {
        this.move_on_state_ = m;
    }

    async dealEvent(e) {
        this.result_ = -1;
        if (e.type === K.EVENT_MOUSE_BUTTON_UP) {
            if (this.inSide(e.button.x, e.button.y)) {
                this.result_ = 0;
            }
        }
    }

    draw() {
        if (this.w_ * this.h_ === 0) {
            const tex = TextureManager.getTexture(this.texture_path_, this.texture_normal_id_);
            if (tex) {
                this.w_ = tex.w;
                this.h_ = tex.h;
            }
        }
        let x = this.x_;
        let y = this.y_;
        let id = this.texture_normal_id_;
        let color = C(255, 255, 255, 255);
        let alpha = 255;
        if (this.state_ === NodeNormal) {
            if (this.texture_normal_id_ === this.texture_pass_id_) {
                color = C(224, 224, 224, 255);
            }
        }
        if (this.state_ === NodePass) {
            id = this.texture_pass_id_;
            alpha = 240;
            if (this.move_on_state_) {
                x += 2;
            }
        } else if (this.state_ === NodePress) {
            id = this.texture_press_id_;
            alpha = 255;
            if (this.move_on_state_) {
                x += 2;
                y += 2;
            }
        }
        if (this.alpha_ !== 255) {
            alpha = this.alpha_;
        }
        TextureManager.renderTextureByName(this.texture_path_, id, x, y, RI(color, alpha));
        if (this.text_) {
            let ct = this.color_normal_;
            if (this.state_ === NodePass) {
                ct = this.color_pass_;
            } else if (this.state_ === NodePress) {
                ct = this.color_press_;
            }
            if (this.have_box_) {
                Font.drawWithBox(this.text_, this.font_size_, x + this.text_x_, y + this.text_y_, ct, 255, alpha);
            } else {
                Font.draw(this.text_, this.font_size_, x + this.text_x_, y + this.text_y_, ct, alpha);
            }
        }
    }
}

export class ButtonGetKey extends Button {
    async dealEvent(e) {
        if (e.type === K.EVENT_KEY_UP) {
            this.result_ = e.key.key;
            this.setExit(true);
        }
    }

    async onPressedOK() {}

    async onPressedCancel() {}
}

export class Menu extends TextBox {
    constructor() {
        super();
        this.active_child_ = 0;
        this.start_ = 0;
        this.lr_style_ = 0;
        this.ud_style_ = 0;
    }

    setStartItem(s) {
        this.start_ = s;
    }

    setLRStyle(i) {
        this.lr_style_ = i;
    }

    setUDStyle(i) {
        this.ud_style_ = i;
    }

    async dealEvent(e) {
        if (this.deal_event_ === 0) {
            return;
        }
        let direct = DirectNone;
        if (this.ud_style_ === 0) {
            if (e.type === K.EVENT_KEY_DOWN) {
                switch (e.key.key) {
                case K.K_LEFT: direct = DirectLeft; break;
                case K.K_UP: direct = DirectUp; break;
                case K.K_RIGHT: direct = DirectRight; break;
                case K.K_DOWN: direct = DirectDown; break;
                default: break;
                }
            }
        } else if (this.ud_style_ === 1) {
            if (e.type === K.EVENT_KEY_DOWN) {
                switch (e.key.key) {
                case K.K_PAGEUP: direct = DirectUp; break;
                case K.K_PAGEDOWN: direct = DirectDown; break;
                default: break;
                }
            }
        }
        if (this.ud_style_ === 0) {
            const engine = Engine;
            if (this.lr_style_ === 0) {
                if (engine.gameControllerGetButton(K.GAMEPAD_BUTTON_DPAD_UP)) {
                    direct = DirectUp;
                    engine.setInterValControllerPress(200);
                }
                if (engine.gameControllerGetButton(K.GAMEPAD_BUTTON_DPAD_DOWN)) {
                    direct = DirectDown;
                    engine.setInterValControllerPress(200);
                }
                if (engine.gameControllerGetButton(K.GAMEPAD_BUTTON_DPAD_LEFT)) {
                    direct = DirectLeft;
                    engine.setInterValControllerPress(200);
                }
                if (engine.gameControllerGetButton(K.GAMEPAD_BUTTON_DPAD_RIGHT)) {
                    direct = DirectRight;
                    engine.setInterValControllerPress(200);
                }
            }
            if (this.lr_style_ === 1) {
                if (engine.gameControllerGetButton(K.GAMEPAD_BUTTON_RIGHT_SHOULDER)) {
                    direct = DirectRight;
                    engine.setInterValControllerPress(200);
                }
                if (engine.gameControllerGetButton(K.GAMEPAD_BUTTON_LEFT_SHOULDER)) {
                    direct = DirectLeft;
                    engine.setInterValControllerPress(200);
                }
            }
        }
        if (direct !== DirectNone) {
            const all_normal = this.checkAllNormal();
            this.setAllChildState(NodeNormal);
            if (all_normal) {
                if (this.active_child_ < this.childs_.length && this.childs_[this.active_child_] && !this.childs_[this.active_child_].getVisible()) {
                    this.active_child_ = this.findFristVisibleChild();
                }
            } else {
                this.active_child_ = this.findNextVisibleChild(this.active_child_, direct);
            }
            this.forceActiveChild();
        }
        if (e.type === K.EVENT_MOUSE_MOTION
            || ((e.type === K.EVENT_MOUSE_BUTTON_DOWN || e.type === K.EVENT_MOUSE_BUTTON_UP) && e.button.button === K.BUTTON_LEFT)) {
            const a = this.active_child_;
            if (a >= 0 && a < this.childs_.length && this.childs_[a].getState() !== NodeNormal) {
                for (let i = 0; i < this.childs_.length; i++) {
                    if (i !== a && this.childs_[i].getState() !== NodeNormal) {
                        this.childs_[i].setState(NodeNormal);
                    }
                }
            }
        }
    }

    arrange(x, y, inc_x, inc_y) {
        for (const c of this.childs_) {
            if (c.getVisible()) {
                c.setPosition(this.x_ + x, this.y_ + y);
                x += inc_x;
                y += inc_y;
            }
        }
    }

    async onPressedOK() {
        if (this.checkAllNormal()) {
            this.result_ = -1;
            return;
        }
        this.checkActiveToResult();
        if (this.result_ >= 0) {
            this.setExit(true);
        }
    }

    async onPressedCancel() {
        this.exitWithResult(-1);
    }

    async onEntrance() {
        if (!this.checkAllNormal()) {
            this.active_child_ = this.start_;
        }
        this.forceActiveChild();
    }

    async onExit() {
        this.start_ = this.active_child_;
    }

    checkAllNormal() {
        for (const c of this.childs_) {
            if (c.getVisible() && c.getState() !== NodeNormal) {
                return false;
            }
        }
        return true;
    }

    checkAllMouseNotIn() {
        for (const c of this.childs_) {
            if (c.getVisible() && c.mouseIn()) {
                return false;
            }
        }
        return true;
    }
}

export class MenuText extends Menu {
    constructor(items) {
        super();
        this.strings_ = [];
        this.childs_text_ = new Map();
        if (items) {
            this.setStrings(items);
        }
    }

    setStrings(strings) {
        this.strings_ = [...strings];
        this.clearChilds();
        let len = 0;
        strings.forEach((str, i) => {
            if (utf8Length(str) > len) {
                len = utf8Length(str);
            }
            const b = new Button();
            this.addChild(b, 0, i * 25);
            b.setText(str);
        });
        this.w_ = 10 * len;
        this.h_ = 25 * strings.length;
        this.childs_text_.clear();
        this.strings_.forEach((s, i) => this.childs_text_.set(s, this.childs_[i]));
    }

    getStringFromResult(i) {
        if (i >= 0 && i < this.strings_.length) {
            return this.strings_[i];
        }
        return '';
    }

    getResultString() {
        return this.getStringFromResult(this.result_);
    }

    getResultFromString(str) {
        return this.strings_.indexOf(str);
    }
}
