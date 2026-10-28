// InputBox and SuperMenuText (InputBox.cpp, SuperMenuText.cpp)
import { C } from './Color.js';
import { Engine } from './Engine.js';
import { Font } from './Font.js';
import { hanz2pinyin } from './Hanz2Piny.js';
import * as K from './Keys.js';
import { NodeNormal, NodePress } from './RunNode.js';
import { Button, Menu, MenuText, TextBox } from './TextBox.js';

function dropLastChar(s) {
    const chars = [...s];
    chars.pop();
    return chars.join('');
}

export class InputBox extends TextBox {
    constructor(title = '', font_size = 20) {
        super();
        this.title_ = title;
        this.font_size_ = font_size;
        this.text_x_ = 0;
        this.text_y_ = 0;
        this.color_ = C(32, 32, 32, 255);
        this.action_menu_ = null;
    }

    setTitle(t) {
        this.title_ = t;
    }

    setText(text) {
        this.text_ = String(text);
    }

    getText() {
        return this.text_;
    }

    setTextColor(c) {
        this.color_ = c;
    }

    async dealEvent(e) {
        switch (e.type) {
        case K.EVENT_TEXT_INPUT:
            this.text_ += e.text.text;
            break;
        case K.EVENT_KEY_DOWN:
            if (e.key.key === K.K_BACKSPACE && this.text_.length >= 1) {
                this.text_ = dropLastChar(this.text_);
            }
            break;
        case K.EVENT_KEY_UP:
            if (e.key.key === K.K_RETURN) {
                this.result_ = 0;
                this.exit_ = true;
            }
            break;
        default:
            break;
        }
    }

    draw() {
        Font.drawWithBox(this.title_, this.font_size_, this.x_, this.y_, this.color_, 255);
        Font.drawWithBox(this.text_ + '_', this.font_size_, this.text_x_, this.text_y_, this.color_, 255);
        Engine.setTextInputArea(this.text_x_, this.text_y_, this.font_size_ * 15, this.font_size_);
    }

    setInputPosition(x, y) {
        this.x_ = x;
        this.y_ = y;
        this.text_x_ = x;
        this.text_y_ = Math.trunc(y + this.font_size_ * 1.5);
        if (this.action_menu_) {
            this.action_menu_.setPosition(Math.trunc(x + this.font_size_ * 4.5), this.text_y_ + this.font_size_ * 2);
        }
    }

    setActionButtons(enabled) {
        if (!enabled || this.action_menu_) {
            return;
        }
        this.action_menu_ = new Menu();
        this.action_menu_.setSize(this.font_size_ * 6, this.font_size_);
        this.action_menu_.addChild(new Button(), 0, 0).setText('確定');
        this.action_menu_.addChild(new Button(), this.font_size_ * 3, 0).setText('取消');
        this.addChild(this.action_menu_);
        this.setInputPosition(this.x_, this.y_);
    }

    async onPressedOK() {
        if (!this.action_menu_ || this.exit_) {
            return;
        }
        const action = this.action_menu_.getResult();
        if (action === 0) {
            this.exitWithResult(0);
        } else if (action === 1) {
            this.exitWithResult(-1);
        }
    }

    async onPressedCancel() {
        this.exitWithResult(-1);
    }

    async onEntrance() {
        Engine.startTextInput();
        if (this.action_menu_) {
            await this.action_menu_.onEntrance();
        }
    }

    async onExit() {
        Engine.stopTextInput();
    }
}

export class SuperMenuText extends InputBox {
    constructor(title, font_size, allItems, itemsPerPage) {
        super(title, font_size);
        this.items_ = allItems;
        this.itemsPerPage_ = itemsPerPage;
        this.curPage_ = 0;
        this.maxPages_ = 1;
        this.curDefault_ = false;
        this.activeIndices_ = [];
        this.searchResultIndices_ = [];
        this.docs_ = [];
        this.matches_ = new Map();
        this.previous_ = new Button();
        this.previous_.setText('上一頁PgUp');
        this.next_ = new Button();
        this.next_.setText('下一頁PgDown');
        this.addChild(this.previous_);
        this.addChild(this.next_);
        this.selections_ = new MenuText();
        this.addChild(this.selections_);
        this.setAllChildState(NodeNormal);
        this.defaultPage();
        this.matchFunc_ = (text, name) => {
            const pinyin = hanz2pinyin(name);
            let p = 0;
            for (let i = 0; i < text.length; i++) {
                const p1 = pinyin.indexOf(text[i], p);
                if (p1 < 0) {
                    return false;
                }
                p = p1 + 1;
            }
            return true;
        };
        for (const [id, name] of this.items_) {
            const strID = String(id);
            for (let i = 0; i < strID.length; i++) {
                const k = strID.slice(0, i + 1);
                if (!this.matches_.has(k)) {
                    this.matches_.set(k, new Set());
                }
                this.matches_.get(k).add(name);
            }
        }
    }

    setInputPosition(x, y) {
        super.setInputPosition(x, y);
        if (!this.selections_) {
            return;
        }
        this.selections_.setPosition(x, y + this.font_size_ * 3);
        this.previous_.setPosition(x, Math.trunc(y - this.font_size_ * 1.5));
        this.next_.setPosition(x + this.font_size_ * 5, Math.trunc(y - this.font_size_ * 1.5));
    }

    addDrawableOnCall(doc) {
        this.docs_.push(doc);
        this.addChild(doc);
    }

    setMatchFunction(f) {
        this.matchFunc_ = f;
    }

    defaultPage() {
        if (this.curDefault_) {
            return;
        }
        const displays = [];
        this.searchResultIndices_ = [];
        for (let i = 0; i < this.items_.length; i++) {
            if (i < Math.min(this.itemsPerPage_, this.items_.length)) {
                this.activeIndices_.push(i);
                displays.push(this.items_[i][1]);
            }
            this.searchResultIndices_.push(i);
        }
        this.curPage_ = 0;
        this.updateMaxPages();
        this.selections_.setStrings(displays);
        if (displays.length) {
            this.selections_.forceActiveChild(0);
        }
        this.curDefault_ = true;
    }

    flipPage(inc) {
        if (this.curPage_ + inc >= 0 && this.curPage_ + inc < this.maxPages_) {
            this.curPage_ += inc;
            const start = this.curPage_ * this.itemsPerPage_;
            const displays = [];
            this.activeIndices_ = [];
            for (let i = start; i < Math.min(this.searchResultIndices_.length, start + this.itemsPerPage_); i++) {
                this.activeIndices_.push(this.searchResultIndices_[i]);
                displays.push(this.items_[this.searchResultIndices_[i]][1]);
            }
            this.selections_.setStrings(displays);
        }
    }

    defaultMatch(input, name) {
        const s = this.matches_.get(input);
        return !!(s && s.has(name));
    }

    search(text) {
        const results = [];
        this.activeIndices_ = [];
        this.searchResultIndices_ = [];
        for (let i = 0; i < this.items_.length; i++) {
            const opt = this.items_[i];
            let matched = false;
            if (this.matchFunc_ && this.matchFunc_(text, opt[1])) {
                matched = true;
            } else {
                matched = this.defaultMatch(text, opt[1]);
            }
            if (matched) {
                if (results.length < this.itemsPerPage_) {
                    results.push(opt[1]);
                    this.activeIndices_.push(i);
                }
                this.searchResultIndices_.push(i);
            }
        }
        this.updateMaxPages();
        this.curPage_ = 0;
        this.selections_.setStrings(results);
        this.selections_.forceActiveChild(0);
        this.curDefault_ = false;
    }

    updateMaxPages() {
        this.maxPages_ = Math.ceil(this.searchResultIndices_.length / this.itemsPerPage_);
    }

    async dealEvent(e) {
        if (this.previous_.getState() === NodePress && e.type === K.EVENT_MOUSE_BUTTON_UP) {
            this.flipPage(-1);
            this.previous_.setState(NodeNormal);
            this.previous_.setResult(-1);
        } else if (this.next_.getState() === NodePress && e.type === K.EVENT_MOUSE_BUTTON_UP) {
            this.flipPage(1);
            this.next_.setState(NodeNormal);
            this.next_.setResult(-1);
        }
        let research = false;
        switch (e.type) {
        case K.EVENT_TEXT_INPUT:
            this.text_ += Font.T2S(e.text.text);
            research = true;
            break;
        case K.EVENT_KEY_DOWN:
            if (e.key.key === K.K_BACKSPACE) {
                if (this.text_.length >= 1) {
                    this.text_ = dropLastChar(this.text_);
                }
                research = true;
            }
            break;
        case K.EVENT_KEY_UP:
            if (e.key.key === K.K_PAGEUP) {
                this.flipPage(-1);
            } else if (e.key.key === K.K_PAGEDOWN) {
                this.flipPage(1);
            }
            break;
        case K.EVENT_MOUSE_WHEEL:
            if (e.wheel.y > 0) {
                this.flipPage(-1);
            } else if (e.wheel.y < 0) {
                this.flipPage(1);
            }
            break;
        default:
            break;
        }
        if (!this.text_) {
            this.defaultPage();
        }
        if (research) {
            this.search(this.text_);
        }
        const sel = this.selections_.getActiveChildIndex();
        if (sel >= 0 && sel < this.activeIndices_.length) {
            const idx = this.activeIndices_[sel];
            for (const d of this.docs_) {
                d.updateScreenWithID(this.items_[idx][0]);
            }
        } else {
            for (const d of this.docs_) {
                d.updateScreenWithID(-1);
            }
        }
        if (this.selections_.getResult() >= 0) {
            this.result_ = this.activeIndices_[this.selections_.getResult()];
            if (this.result_ >= 0) {
                this.result_ = this.items_[this.result_][0];
            }
            this.setExit(true);
        }
    }
}
