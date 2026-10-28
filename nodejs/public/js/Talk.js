// Talk (dialogue box) and TextBoxRoll (Talk.cpp, TextBoxRoll.cpp)
import { C } from './Color.js';
import { Engine } from './Engine.js';
import { Font } from './Font.js';
import * as K from './Keys.js';
import { RunNode } from './RunNode.js';
import { TextBox } from './TextBox.js';
import { TextureManager } from './TextureManager.js';
import { clamp, utf8Length } from './util.js';

export class Talk extends RunNode {
    constructor(c = '', h = -1) {
        super();
        this.content_ = '';
        this.head_id_ = -1;
        this.head_style_ = 0;
        this.current_line_ = 0;
        this.width_ = 40;
        this.height_ = 4;
        this.content_lines_ = [];
        if (c) {
            this.setContent(c);
            this.setHeadID(h);
        }
    }

    setContent(c) {
        this.content_ = c;
    }

    setHeadID(h) {
        this.head_id_ = h;
    }

    setHeadStyle(s) {
        this.head_style_ = s;
    }

    draw() {
        const w = Engine.getUIWidth();
        if (this.content_) {
            const dialog_width = 530;
            const portrait_width = 200;
            const dialog_margin = 20;
            const max_dialog_x = Math.max(dialog_margin, w - dialog_width - dialog_margin);
            const left_dialog_x = clamp(Math.trunc(w / 2) - 390, dialog_margin, max_dialog_x);
            const right_dialog_x = clamp(Math.trunc(w / 2) - 140, dialog_margin, max_dialog_x);
            this.x_ = left_dialog_x;
            let x_text = this.x_ + 25;
            if (this.head_id_ >= 0) {
                if (this.head_style_ === 0) {
                    this.x_ = left_dialog_x;
                    TextureManager.renderTextureByName('head', this.head_id_, Math.max(0, this.x_ - portrait_width), this.y_ + 50);
                    x_text = this.x_ + 25;
                } else {
                    this.x_ = right_dialog_x;
                    x_text = this.x_ + 25;
                    TextureManager.renderTextureByName('head', this.head_id_, Math.min(w - portrait_width, this.x_ + dialog_width + 50), this.y_ + 50);
                }
            }
            Engine.fillColor(C(0, 0, 0, 160), this.x_, this.y_ + 65, dialog_width, 150);
            const end_line = Math.min(this.current_line_ + this.height_, this.content_lines_.length);
            for (let i = this.current_line_; i < end_line; i++) {
                Font.draw(this.content_lines_[i], 24, x_text, this.y_ + 75 + 34 * (i - this.current_line_), C(255, 255, 255, 255));
            }
        }
    }

    async onPressedOK() {
        Engine.setInterValControllerPress(200);
        if (this.current_line_ + this.height_ >= this.content_lines_.length) {
            this.setExit(true);
        } else {
            this.current_line_ += this.height_;
        }
        this.result_ = 0;
    }

    async onPressedCancel() {
        this.exitWithResult(-1);
    }

    async onEntrance() {
        this.content_lines_ = [];
        this.current_line_ = 0;
        const chars = [...this.content_];
        let i = 0;
        while (i < chars.length) {
            let len = 0;
            let j = i;
            while (j < chars.length) {
                len += chars[j].codePointAt(0) >= 0x80 ? 2 : 1;
                j++;
                if (len >= this.width_) {
                    break;
                }
            }
            this.content_lines_.push(chars.slice(i, j).join(''));
            i = j;
        }
    }
}

export class TextBoxRoll extends TextBox {
    constructor() {
        super();
        this.texts_ = [];
        this.roll_line_ = -1;
        this.begin_line_ = 0;
    }

    // [[[color, text], ...], ...]
    setTexts(t) {
        this.texts_ = t;
    }

    setRollLine(r) {
        this.roll_line_ = r;
    }

    draw() {
        let x = this.x_;
        let y = this.y_;
        let i = -1;
        let line_count = 0;
        for (const line of this.texts_) {
            i++;
            if (i < this.begin_line_) {
                continue;
            }
            if (this.roll_line_ > 0 && line_count >= this.roll_line_) {
                break;
            }
            for (const [color, text] of line) {
                Font.draw(text, this.font_size_, x, y, color, color.a ?? 255);
                x += Math.trunc(this.font_size_ / 2) * utf8Length(text);
            }
            line_count++;
            x = this.x_;
            y += this.font_size_;
        }
    }

    async dealEvent(e) {
        if (this.roll_line_ <= 0) {
            return;
        }
        if (e.type === K.EVENT_MOUSE_WHEEL) {
            if (e.wheel.y < 0) {
                this.begin_line_++;
            } else {
                this.begin_line_--;
            }
        }
        this.begin_line_ = clamp(this.begin_line_, 0, this.texts_.length - this.roll_line_);
    }
}
