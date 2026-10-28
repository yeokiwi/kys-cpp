// Head: a role's portrait with HP/MP/stamina bars (Head.cpp)
import { C, RI } from './Color.js';
import { Engine } from './Engine.js';
import { Font } from './Font.js';
import { GameUtil } from './GameUtil.js';
import { NodeNormal } from './RunNode.js';
import { Save } from './Save.js';
import { TextBox } from './TextBox.js';
import { TextureManager } from './TextureManager.js';
import { clamp, format, textDrawSize } from './util.js';

export class Head extends TextBox {
    constructor(r = null) {
        super();
        this.role_ = r;
        this.style_ = 0;
        this.width_ = 800;
        this.always_light_ = 0;
        this.HP_ = 0;
        this.MP_ = 0;
        this.PhysicalPower_ = 0;
        this.setTextPosition(20, 65);
        this.setFontSize(20);
        this.setTextColor(C(255, 255, 255, 255));
        this.setHaveBox(false);
    }

    setRole(r) {
        this.role_ = r;
        if (r) {
            this.HP_ = r.HP;
            this.MP_ = r.MP;
            this.PhysicalPower_ = r.PhysicalPower;
        } else {
            this.HP_ = 0;
            this.MP_ = 0;
            this.PhysicalPower_ = 0;
        }
    }

    getRole() {
        return this.role_;
    }

    setStyle(i) {
        this.style_ = i;
    }

    setAlwaysLight(i) {
        this.always_light_ = i;
    }

    getWidth() {
        return this.width_;
    }

    async onPressedOK() {}

    async onPressedCancel() {}

    backRun() {}

    draw() {
        this.w_ = 250;
        this.h_ = 90;
        const role = this.role_;
        if (!role) {
            return;
        }
        let color = C(255, 255, 255, 255);
        const white = C(255, 255, 255, 255);
        const font = Font;
        const x_ = this.x_;
        const y_ = this.y_;
        if (this.state_ === NodeNormal) {
            color = C(128, 128, 128, 255);
        }
        if (this.always_light_) {
            color = C(255, 255, 255, 255);
        }
        if (this.style_ === 0) {
            TextureManager.renderTextureByName('title', 102, x_, y_, RI(color));
        }
        color = { ...color };
        if (role.HP <= 0) {
            color.r = Math.trunc(color.r / 4);
            color.g = Math.trunc(color.g / 4);
            color.b = Math.trunc(color.b / 4);
        }
        // poisoned roles look green (uint8 arithmetic as in C++)
        color.r = (color.r - 2 * role.Poison) & 255;
        color.b = (color.b - 2 * role.Poison) & 255;

        if (this.style_ === 0) {
            let alpha_text = 255;
            let alpha_ribbon = 192;
            if (this.state_ === NodeNormal && !this.always_light_) {
                alpha_text = 128;
                alpha_ribbon = 96;
            }
            TextureManager.renderTextureByName('head', role.HeadID, x_ + 10, y_, RI(color, 255, 0.5, 0.5));
            if (this.text_) {
                font.drawWithBox(this.text_, this.font_size_, x_ + this.text_x_, y_ + this.text_y_, this.color_normal_, 255, 192);
            }
            font.draw(role.Name, 16, x_ + 117, y_ + 9, white, alpha_text);
            font.draw(format('{}', role.Level), 16, x_ + 99 - 4 * GameUtil.digit(role.Level), y_ + 5, C(250, 200, 50, 255), alpha_text);
            const hp_for_bar = clamp(role.HP, 0, role.MaxHP);
            let r1 = role.MaxHP > 0 ? { x: x_ + 96, y: y_ + 32, w: Math.trunc((138 * hp_for_bar) / role.MaxHP), h: 9 } : { x: 0, y: 0, w: 0, h: 0 };
            Engine.renderSquareTexture(r1, C(196, 25, 16, 255), alpha_ribbon);
            font.draw(format('{:3}/{:3}', hp_for_bar, role.MaxHP), 16, x_ + 138, y_ + 28, C(250, 200, 50, 255), alpha_text);
            r1 = role.MaxMP > 0 ? { x: x_ + 96, y: y_ + 48, w: Math.trunc((138 * role.MP) / role.MaxMP), h: 9 } : { x: 0, y: 0, w: 0, h: 0 };
            let c = C(200, 200, 200, 255);
            let c_text = white;
            if (role.MPType === 0) {
                c = C(112, 12, 112, 255);
                c_text = C(240, 150, 240, 255);
            } else if (role.MPType === 1) {
                c = C(224, 180, 32, 255);
                c_text = C(250, 200, 50, 255);
            }
            Engine.renderSquareTexture(r1, c, alpha_ribbon);
            font.draw(format('{:3}/{:3}', role.MP, role.MaxMP), 16, x_ + 138, y_ + 44, c_text, alpha_text);
            r1 = { x: x_ + 115, y: y_ + 65, w: Math.trunc((83 * role.PhysicalPower) / 100), h: 9 };
            Engine.renderSquareTexture(r1, C(128, 128, 255, 255), alpha_ribbon);
            font.draw(format('{}', role.PhysicalPower), 16, x_ + 154 - 4 * GameUtil.digit(role.PhysicalPower), y_ + 61, C(250, 200, 50, 255), alpha_text);
        } else if (this.style_ === 1) {
            // boss HP bar (Hades mode)
            let r1 = { x: x_, y: y_, w: this.width_, h: 11 };
            let r2 = { x: 0, y: 0, w: 0, h: 0 };
            Engine.fillColor(C(0, 0, 0, 168), r1.x, r1.y, r1.w, r1.h);
            const hp_for_bar = clamp(role.HP, 0, role.MaxHP);
            if (role.MaxHP > 0) {
                const w = Math.trunc(((this.width_ - 2) * hp_for_bar) / role.MaxHP);
                r2 = { x: x_ + 1 + w, y: y_ + 1, w: Math.trunc(((this.width_ - 2) * (this.HP_ - hp_for_bar)) / role.MaxHP), h: 9 };
                r1 = { x: x_ + 1, y: y_ + 1, w, h: 9 };
            }
            Engine.renderSquareTexture(r2, C(0xff, 0xb7, 0x4d, 255), 144);
            Engine.renderSquareTexture(r1, C(196, 25, 16, 255), 192);
            font.draw(role.Name, 20, x_ - 10 - textDrawSize(role.Name) * 10, y_ - 4, white);
            font.draw(format('{}/{}', hp_for_bar, role.MaxHP), 16, x_ + this.width_ + 10, y_ - 2, white);
        } else if (this.style_ === 2) {
            // boss and player bars (Sekiro mode)
            this.width_ = Math.trunc((350.0 / 999) * role.MaxHP);
            let r1 = { x: x_, y: y_ + 25, w: this.width_, h: 11 };
            let r2 = { x: 0, y: 0, w: 0, h: 0 };
            Engine.fillColor(C(0, 0, 0, 168), r1.x, r1.y, r1.w, r1.h);
            const hp_for_bar = clamp(role.HP, 0, role.MaxHP);
            if (role.MaxHP > 0) {
                const w = Math.trunc(((this.width_ - 2) * hp_for_bar) / role.MaxHP);
                r2 = { x: x_ + 1 + w, y: y_ + 26, w: Math.trunc(((this.width_ - 2) * (this.HP_ - hp_for_bar)) / role.MaxHP), h: 9 };
                r1 = { x: x_ + 1, y: y_ + 26, w, h: 9 };
            }
            Engine.renderSquareTexture(r2, C(0xff, 0xb7, 0x4d, 255), 144);
            Engine.renderSquareTexture(r1, C(196, 25, 16, 255), 192);
            font.draw(role.Name, 20, x_ + 10, y_, white);
            const m = Save.getMagic(role.EquipMagic[0]);
            if (m) {
                font.draw(m.Name, 15, x_ + textDrawSize(role.Name) * 10 + 30, y_ + 5, white);
            }
            font.draw(format('{}/{}', hp_for_bar, role.MaxHP), 12, x_ + this.width_ + 10, y_ + 25, white);
            const length = Math.trunc(Math.max(0, role.Posture * 5));
            const t203 = TextureManager.getTexture('title', 203);
            const w_tex = t203 ? t203.w || 1 : 1;
            const h_tex = t203 ? t203.h : 0;
            const zoomb_x = 450 / w_tex;
            const zoomb_y = (3.0 * 450) / w_tex;
            TextureManager.renderTextureByName('title', 203, Math.trunc(Engine.getUIWidth() / 2 - 450 / 2 + 20), y_ - 10,
                RI(C(255, 128, 128, 255), 255, zoomb_x, zoomb_y));
            const zoom_x = length / w_tex;
            const zoom_y = (3.0 * length) / w_tex;
            TextureManager.renderTextureByName('title', 203, Math.trunc(Engine.getUIWidth() / 2 - length / 2 + 20),
                Math.trunc(y_ - 10 - h_tex * (zoom_y / 2 - zoomb_y / 2)), RI(C(255, 255, 255, 255), 255, zoom_x, zoom_y));
            if (role.Team === 0 && role.Auto) {
                font.draw('自動', 15, x_ + 10, y_ + 40, white);
            }
        }
        this.HP_ = Math.max(this.HP_ - 1 - Math.trunc(role.MaxHP / 1000), role.HP);
        this.MP_ = Math.max(this.MP_ - 1 - Math.trunc(role.MaxMP / 1000), role.MP);
        this.PhysicalPower_ = Math.max(this.PhysicalPower_ - 1, role.PhysicalPower);
    }
}
