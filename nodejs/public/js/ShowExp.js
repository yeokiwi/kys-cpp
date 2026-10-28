// ShowExp and ShowRoleDifference (ShowExp.cpp, ShowRoleDifference.cpp)
import { C, RI } from './Color.js';
import { Engine } from './Engine.js';
import { Font } from './Font.js';
import { Head } from './Head.js';
import * as K from './Keys.js';
import { RunNode } from './RunNode.js';
import { Save } from './Save.js';
import { TextBox } from './TextBox.js';
import { TextureManager } from './TextureManager.js';
import { ROLE_MAGIC_COUNT } from './Types.js';
import { format, textDrawSize } from './util.js';

export class ShowExp extends RunNode {
    constructor() {
        super();
        this.roles_ = [];
        this.text_ = '';
        this.ok_enabled_ = false;
        this.x_ = 100;
        this.y_ = 100;
        this.entered_ticks_ = Engine.getTicks();
    }

    setRoles(r) {
        this.roles_ = r;
    }

    setText(t) {
        this.text_ = t;
    }

    async dealEvent(e) {
        if (!this.ok_enabled_) {
            // swallow a confirm key release left over from the battle
            if ((e.type === K.EVENT_KEY_DOWN && (e.key.key === K.K_RETURN || e.key.key === K.K_SPACE))
                || (e.type === K.EVENT_MOUSE_BUTTON_DOWN && e.button.button === K.BUTTON_LEFT)
                || (e.type === K.EVENT_GAMEPAD_BUTTON_DOWN && e.gbutton.button === K.GAMEPAD_BUTTON_SOUTH)) {
                this.ok_enabled_ = true;
            } else if ((e.type === K.EVENT_KEY_UP && (e.key.key === K.K_RETURN || e.key.key === K.K_SPACE))
                || (e.type === K.EVENT_MOUSE_BUTTON_UP && e.button.button === K.BUTTON_LEFT)
                || (e.type === K.EVENT_GAMEPAD_BUTTON_UP && e.gbutton.button === K.GAMEPAD_BUTTON_SOUTH)) {
                if (Engine.getTicks() - this.entered_ticks_ >= 150) {
                    this.ok_enabled_ = true;
                    return;
                }
                this.ok_enabled_ = true;
                e.type = K.EVENT_FIRST;
            }
        }
    }

    async onPressedOK() {
        if (this.ok_enabled_) {
            this.exitWithResult(0);
        }
    }

    async onPressedCancel() {
        this.exitWithResult(-1);
    }

    draw() {
        Engine.fillColor(C(0, 0, 0, 128), 0, 0, -1, -1);
        Font.draw(this.text_, 30, Math.trunc(Engine.getUIWidth() / 2 - (15 * textDrawSize(this.text_)) / 2), this.y_, C(255, 255, 255, 255));
        const row_count = 3;
        const item_width = 180;
        const row_height = 100;
        this.roles_.forEach((r, i) => {
            const row = Math.trunc(i / row_count);
            const col = i % row_count;
            const count_in_row = Math.min(this.roles_.length - row * row_count, row_count);
            const row_width = count_in_row * item_width;
            const row_x = Math.trunc(Engine.getUIWidth() / 2 - row_width / 2);
            const x = row_x + col * item_width;
            const y = this.y_ + 50 + row * row_height;
            TextureManager.renderTextureByName('head', r.HeadID, x, y, RI(C(255, 255, 255, 255), 255, 0.5, 0.5));
            Font.draw(format('{}', r.Name), 20, x + 90, y + 30, C(255, 255, 255, 255));
            Font.draw(format('{}', r.ExpGot), 20, x + 90, y + 55, C(255, 255, 255, 255));
        });
    }
}

// shows the difference of two copies of a role (level up, using an item...)
export class ShowRoleDifference extends TextBox {
    constructor(r1 = null, r2 = null) {
        super();
        this.role1_ = r1;
        this.role2_ = r2;
        this.show_head_ = true;
        this.head1_ = new Head();
        this.head2_ = new Head();
        this.addChild(this.head1_, 0, 0);
        this.addChild(this.head2_, 150, 0);
        this.setPosition(Math.trunc(Engine.getUIWidth() / 2) - 150, 180);
        this.setTextPosition(0, -30);
    }

    setTwinRole(r1, r2) {
        this.role1_ = r1;
        this.role2_ = r2;
    }

    setShowHead(s) {
        this.show_head_ = s;
    }

    async onPressedOK() {
        this.exitWithResult(0);
    }

    async onPressedCancel() {
        this.exitWithResult(-1);
    }

    draw() {
        const r1 = this.role1_;
        const r2 = this.role2_;
        if (!r1 || !r2) {
            return;
        }
        this.setPosition(Math.trunc(Engine.getUIWidth() / 2) - 150, Math.trunc(Engine.getUIHeight() / 2) - 180);
        Engine.fillColor(C(0, 0, 0, 128), 0, 0, -1, -1);
        this.head1_.setRole(r1);
        this.head2_.setRole(r2);
        this.head1_.setAlwaysLight(1);
        this.head2_.setAlwaysLight(1);
        if (r1.ID === r2.ID) {
            this.head1_.setRole(r2);
            this.head1_.setPosition(this.x_, this.y_ - 130);
            this.head2_.setRole(null);
        }
        this.head1_.setVisible(this.show_head_);
        this.head2_.setVisible(this.show_head_);
        const color = C(255, 255, 255, 255);
        const x = this.x_;
        let y = this.y_;
        const show = (p1, p2, fmt, force = 0) => {
            if (p1 !== p2 || force) {
                Font.draw(format(fmt, p1, p2), 20, x, y, color);
                y += 25;
            }
        };
        const f = (k, label) => show(r1[k], r2[k], `${label} {:9}     -> {:9}`);
        f('Level', '等級');
        f('Exp', '經驗');
        f('PhysicalPower', '體力');
        if (r1.HP !== r2.HP || r1.MaxHP !== r2.MaxHP) {
            show(r1.HP, r2.HP, format('生命 {:4}/{:4}     -> {:4}/{:4}', r1.HP, r1.MaxHP, r2.HP, r2.MaxHP).replace(/[{}]/g, ''), 1);
        }
        if (r1.MP !== r2.MP || r1.MaxMP !== r2.MaxMP) {
            show(r1.MP, r2.MP, format('內力 {:4}/{:4}     -> {:4}/{:4}', r1.MP, r1.MaxMP, r2.MP, r2.MaxMP).replace(/[{}]/g, ''), 1);
        }
        f('Attack', '攻擊');
        f('Defence', '防禦');
        f('Speed', '輕功');
        f('Medicine', '醫療');
        f('UsePoison', '用毒');
        f('Detoxification', '解毒');
        f('AntiPoison', '抗毒');
        f('AttackWithPoison', '帶毒');
        f('Fist', '拳掌');
        f('Sword', '御劍');
        f('Knife', '耍刀');
        f('Unusual', '特殊');
        f('HiddenWeapon', '暗器');
        f('Poison', '中毒');
        f('Morality', '道德');
        f('Fame', '聲望');
        f('IQ', '資質');
        let str = '內力陰陽調和';
        if (r2.MPType === 0) {
            str = '內力陰';
        }
        if (r2.MPType === 1) {
            str = '內力陽';
        }
        show(r1.MPType, r2.MPType, str);
        show(r1.AttackTwice, r2.AttackTwice, '雙擊');
        for (let i = 0; i < ROLE_MAGIC_COUNT; i++) {
            if (r2.MagicID[i] > 0
                && (r1.MagicID[i] <= 0 || r1.getRoleShowLearnedMagicLevel(i) !== r2.getRoleShowLearnedMagicLevel(i))) {
                const m = Save.getMagic(r2.MagicID[i]);
                str = format('武學{}目前修為{}', m ? m.Name : '', r2.getRoleShowLearnedMagicLevel(i)).replace(/[{}]/g, '');
                show(r1.MagicLevel[i], r2.MagicLevel[i], str);
            }
        }
        if (y === this.y_) {
            Font.draw('無明显效果', 20, x, y, color);
        }
        super.draw();
    }
}
