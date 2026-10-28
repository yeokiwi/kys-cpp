// TeamMenu: choose one (or several) members of the team (TeamMenu.cpp)
import { C } from './Color.js';
import { Engine } from './Engine.js';
import { Head } from './Head.js';
import * as K from './Keys.js';
import { NodeNormal, NodePress } from './RunNode.js';
import { Save } from './Save.js';
import { Button, Menu, TextBox } from './TextBox.js';
import { TEAMMATE_COUNT } from './Types.js';

export class TeamMenu extends Menu {
    constructor() {
        super();
        this.heads_ = [];
        this.role_ = null;
        this.item_ = null;
        this.mode_ = 0;
        this.force_main_ = false;
        const [w] = Engine.getUISize();
        for (let i = 0; i < TEAMMATE_COUNT; i++) {
            const h = new Head();
            this.addChild(h, (i % 2) * 250, Math.trunc(i / 2) * 100);
            h.setHaveBox(false);
            this.heads_.push(h);
        }
        this.button_all_ = new Button();
        this.button_all_.setText('全選');
        this.button_all_.setFontSize(30);
        this.button_ok_ = new Button();
        this.button_ok_.setText('確定');
        this.button_ok_.setFontSize(30);
        this.addChild(this.button_all_, 200, 300);
        this.addChild(this.button_ok_, 300, 300);
        this.setPosition(Math.trunc(w / 2) - 250, 150);
        this.setTextPosition(20, -30);
    }

    setItem(item) {
        this.item_ = item;
    }

    setMode(m) {
        this.mode_ = m;
    }

    setForceMainRole(f) {
        this.force_main_ = f;
    }

    async onEntrance() {
        let visible_index = 0;
        let has_usable_role = false;
        for (let i = 0; i < TEAMMATE_COUNT; i++) {
            const r = Save.getTeamMate(i);
            const head = this.heads_[i];
            let visible = r !== null;
            if (r) {
                head.setRole(r);
                if (this.mode_ === 0 && this.item_) {
                    has_usable_role = has_usable_role || r.canUseItem(this.item_);
                    if (!r.canUseItem(this.item_)) {
                        head.setText('不適合');
                    }
                    if (r.PracticeItem === this.item_.ID || r.Equip0 === this.item_.ID || r.Equip1 === this.item_.ID) {
                        head.setText('使用中');
                    }
                    if ((this.item_.ItemType === 1 || this.item_.ItemType === 2) && !r.canUseItem(this.item_)) {
                        visible = false;
                    }
                }
            }
            head.setVisible(visible);
            if (visible) {
                head.setPosition(this.x_ + (visible_index % 2) * 250, this.y_ + Math.trunc(visible_index / 2) * 100);
                visible_index++;
            }
        }
        if (this.mode_ === 0) {
            this.button_all_.setVisible(false);
            this.button_ok_.setVisible(false);
            if (this.item_ && !has_usable_role) {
                this.setText('隊中無人可用');
            }
        }
    }

    getRole() {
        return this.role_;
    }

    getRoles() {
        return this.heads_.filter((h) => h.getResult() === 0 && h.getRole()).map((h) => h.getRole());
    }

    draw() {
        Engine.fillColor(C(0, 0, 0, 128), 0, 0, -1, -1);
        TextBox.prototype.draw.call(this);
    }

    async onPressedOK() {
        if (this.mode_ === 0) {
            this.role_ = null;
            for (const h of this.heads_) {
                if (h.getState() === NodePress) {
                    this.role_ = h.getRole();
                }
            }
            if (this.role_ && (!this.item_ || this.role_.canUseItem(this.item_))) {
                this.result_ = 0;
                this.setExit(true);
            }
        }
        if (this.mode_ === 1) {
            for (const h of this.heads_) {
                if (h.getState() === NodePress) {
                    h.setResult(h.getResult() === -1 ? 0 : -1);
                }
            }
            if (this.button_all_.getState() === NodePress) {
                let all = -1;
                for (const h of this.heads_) {
                    if (h.getResult() !== 0) {
                        all = 0;
                        break;
                    }
                }
                for (const h of this.heads_) {
                    h.setResult(all);
                }
            }
            if (this.button_ok_.getState() === NodePress) {
                for (const h of this.heads_) {
                    if (h.getResult() === 0) {
                        this.setExit(true);
                    }
                }
            }
        }
    }

    async onPressedCancel() {
        if (this.mode_ === 0) {
            this.role_ = null;
            this.result_ = -1;
            this.setExit(true);
        }
    }

    async dealEvent(e) {
        await super.dealEvent(e);
        if (this.mode_ === 1) {
            for (const h of this.heads_) {
                if (h.getResult() === 0) {
                    h.setText('已選中');
                    h.setAlwaysLight(1);
                } else {
                    h.setText('');
                    h.setAlwaysLight(0);
                }
            }
        }
        if (this.force_main_ && this.heads_.length) {
            this.heads_[0].setResult(0);
        }
        if (e.type === K.EVENT_KEY_UP) {
            if (e.key.key === K.K_A) {
                for (const h of this.heads_) {
                    h.setState(NodeNormal);
                }
                this.button_all_.setState(NodePress);
                this.button_ok_.setState(NodeNormal);
                e.key = { ...e.key, key: K.K_RETURN };
            }
            if (e.key.key === K.K_O) {
                this.button_all_.setState(NodeNormal);
                this.button_ok_.setState(NodePress);
                e.key = { ...e.key, key: K.K_RETURN };
            }
        }
    }
}
