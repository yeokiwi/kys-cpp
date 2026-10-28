// UI (main game menu) and UIStatus (role status page) (UI.cpp, UIStatus.cpp)
import { BattleEquipItemMenu, BattleMagicMenu } from './BattleMenu.js';
import { C } from './Color.js';
import { DayNightDisplay } from './DayNightSystem.js';
import { Engine } from './Engine.js';
import { Event } from './Event.js';
import { Font } from './Font.js';
import { Head } from './Head.js';
import * as K from './Keys.js';
import { NodeNormal, NodePass, NodePress, RunNode } from './RunNode.js';
import { Save } from './Save.js';
import { ShowRoleDifference } from './ShowExp.js';
import { TeamMenu } from './TeamMenu.js';
import { Button, Menu } from './TextBox.js';
import { TextureManager } from './TextureManager.js';
import { INT_MAX, Role, TEAMMATE_COUNT } from './Types.js';
import { UIItem } from './UIItem.js';
import { UISystem } from './UISave.js';
import { clamp, format, textDrawSize } from './util.js';

export class UIStatus extends RunNode {
    constructor() {
        super();
        this.show_button_ = true;
        this.show_random_properties_ = false;
        this.role_ = null;
        this.menu_ = new Menu();
        const mk = (text, x, y) => {
            const b = new Button();
            if (text) {
                b.setText(text);
            }
            if (x === undefined) {
                this.menu_.addChild(b);
            } else {
                this.menu_.addChild(b, x, y);
            }
            return b;
        };
        this.button_medicine_ = mk('醫療', 350, 55);
        this.button_detoxification_ = mk('解毒', 400, 55);
        this.button_leave_ = mk('離隊', 450, 55);
        this.equip_magics_ = [mk('__________', 40, 620), mk('__________', 160, 610), mk('__________', 280, 620), mk('__________', 160, 635)];
        this.equip_item_ = mk('__________', 420, 620);
        this.button_equip0_ = mk();
        this.button_equip1_ = mk();
        this.button_learning_book_ = mk();
        this.addChild(this.menu_);
    }

    setShowButton(b) {
        this.show_button_ = b;
    }

    setShowRandomProperties(b) {
        this.show_random_properties_ = b;
    }

    setRole(r) {
        this.role_ = r;
    }

    getRole() {
        return this.role_;
    }

    getMenu() {
        return this.menu_;
    }

    setRoleName(name) {
        this.role_.Name = name;
    }

    setExtentionVisible(b) {
        for (const em of this.equip_magics_) {
            em.setVisible(b);
        }
        this.equip_item_.setVisible(b);
    }

    draw() {
        const role = this.role_;
        if (!role || !this.show_button_) {
            for (const b of [this.button_medicine_, this.button_detoxification_, this.button_leave_, this.button_equip0_,
                this.button_equip1_, this.button_learning_book_]) {
                b.setVisible(false);
            }
            this.setExtentionVisible(false);
        }
        if (role) {
            if (this.show_button_) {
                this.button_medicine_.setVisible(role.Medicine > 0);
                this.button_detoxification_.setVisible(role.Detoxification > 0);
                this.button_leave_.setVisible(role.ID !== 0);
                this.button_equip0_.setVisible(true);
                this.button_equip1_.setVisible(true);
                this.button_learning_book_.setVisible(true);
                this.setExtentionVisible(role.ID === 0);
            }
            this.menu_.setVisible(true);
        } else {
            this.menu_.setVisible(false);
            this.setExtentionVisible(false);
            return;
        }
        const x_ = this.x_;
        const y_ = this.y_;
        TextureManager.renderTextureByName('head', role.HeadID, x_ + 10, y_ + 20);
        const font = Font;
        const color_white = C(255, 255, 255, 255);
        const color_name = C(255, 215, 0, 255);
        const color_ability1 = C(255, 250, 205, 255);
        const color_red = C(255, 90, 60, 255);
        const color_magic = C(236, 200, 40, 255);
        const color_purple = C(208, 152, 208, 255);
        const select_color1 = (v, max_v) => {
            if (v >= max_v * 0.9) {
                return color_red;
            } else if (v >= max_v * 0.8) {
                return C(255, 165, 79, 255);
            } else if (v >= max_v * 0.7) {
                return C(255, 255, 50, 255);
            } else if (v < 0) {
                return color_purple;
            }
            return color_white;
        };
        const select_color2 = (v) => (v > 0 ? color_red : v < 0 ? color_purple : color_white);
        const fs = 22;
        const max = Role.getMaxValue();
        let x = x_ + 200;
        let y = y_ + 50;
        font.draw(format('{}', role.Name), 30, x - 10, y, color_name);
        font.draw('等級', fs, x, y + 50, color_ability1);
        font.draw(format('{:5}', role.Level), fs, x + 66, y + 50, color_white);
        font.draw('經驗', fs, x, y + 75, color_ability1);
        font.draw(format('{:5}', role.Exp), fs, x + 66, y + 75, color_white);
        font.draw('升級', fs, x, y + 100, color_ability1);
        const exp_up = role.getLevelUpExp(role.Level);
        font.draw(exp_up !== INT_MAX ? format('{:6}', exp_up) : '------', fs, x + 55, y + 100, color_white);
        font.draw('生命', fs, x + 175, y + 50, color_ability1);
        font.draw(format('{:5}/', Math.max(0, role.HP)), fs, x + 219, y + 50, color_white);
        font.draw(format('{:5}', role.MaxHP), fs, x + 285, y + 50, color_white);
        font.draw('內力', fs, x + 175, y + 75, color_ability1);
        let c = color_white;
        if (role.MPType === 0) {
            c = color_purple;
        } else if (role.MPType === 1) {
            c = color_magic;
        }
        font.draw(format('{:5}/', role.MP), fs, x + 219, y + 75, c);
        font.draw(format('{:5}', role.MaxMP), fs, x + 285, y + 75, c);
        font.draw('體力', fs, x + 175, y + 100, color_ability1);
        font.draw(format('{:5}/', role.PhysicalPower), fs, x + 219, y + 100, color_white);
        font.draw(format('{:5}', 100), fs, x + 285, y + 100, color_white);

        x = x_ + 20;
        y = y_ + 200;
        const stat = (label, k, dx, dy) => {
            font.draw(label, fs, x + dx, y + dy, color_ability1);
            font.draw(format('{:5}', role[k]), fs, x + dx + 44, y + dy, select_color1(role[k], max[k]));
        };
        stat('攻擊', 'Attack', 0, 0);
        stat('防禦', 'Defence', 200, 0);
        stat('輕功', 'Speed', 400, 0);
        if (this.show_random_properties_) {
            font.draw('資質', fs, x + 600, y, color_ability1);
            font.draw(format('{:5}', role.IQ), fs, x + 644, y, color_white);
        }
        stat('醫療', 'Medicine', 0, 25);
        stat('解毒', 'Detoxification', 200, 25);
        stat('用毒', 'UsePoison', 400, 25);
        if (this.show_random_properties_) {
            font.draw('體質', fs, x + 600, y + 25, color_ability1);
            font.draw(format('{:5}', role.IncLife), fs, x + 644, y + 25, color_white);
        }

        x = x_ + 20;
        y = y_ + 270;
        font.draw('技能', 25, x - 10, y, color_name);
        stat('拳掌', 'Fist', 0, 30);
        stat('御劍', 'Sword', 0, 55);
        stat('耍刀', 'Knife', 0, 80);
        stat('特殊', 'Unusual', 0, 105);
        stat('暗器', 'HiddenWeapon', 0, 130);

        x = x_ + 220;
        y = y_ + 270;
        font.draw('武學', 25, x - 10, y, color_name);
        for (let i = 0; i < 10; i++) {
            const magic = Save.getRoleLearnedMagic(role, i);
            const x1 = x + (i % 2) * 200;
            const y1 = y + 30 + Math.trunc(i / 2) * 25;
            if (magic) {
                font.draw(format('{}', magic.Name), fs, x1, y1, color_ability1);
                const lv = role.getRoleShowLearnedMagicLevel(i);
                font.draw(format('{:3}', lv), fs, x1 + 100, y1, lv > 9 ? color_red : color_purple);
            }
        }

        x = x_ + 420;
        y = y_ + 445;
        font.draw('修煉', 25, x - 10, y, color_name);
        const book = Save.getItem(role.PracticeItem);
        if (book) {
            this.button_learning_book_.setTexture('item', book.ID);
            this.button_learning_book_.setPosition(x, y + 30);
            font.draw(format('{}', book.Name), fs, x + 90, y + 30, color_name);
            font.draw(format('經驗{:5}', role.ExpForItem), 18, x + 90, y + 55, color_ability1);
            const up = role.getFinishedExpForItem(book);
            font.draw(up !== INT_MAX ? format('升級{:5}', up) : '升級 ----', 18, x + 90, y + 75, color_ability1);
        } else {
            this.button_learning_book_.setTexture('title', 127);
            this.button_learning_book_.setPosition(x, y + 30);
        }
        const showEquip = (equip, button, ex, label) => {
            const ey = y_ + 445;
            font.draw(label, 25, ex - 10, ey, color_name);
            if (equip) {
                button.setTexture('item', equip.ID);
                button.setPosition(ex, ey + 30);
                font.draw(format('{}', equip.Name), fs, ex + 90, ey + 30, color_name);
                font.draw('攻擊', 18, ex + 90, ey + 55, color_ability1);
                font.draw(format('{:+}', equip.AddAttack), 18, ex + 126, ey + 55, select_color2(equip.AddAttack));
                font.draw('防禦', 18, ex + 90, ey + 75, color_ability1);
                font.draw(format('{:+}', equip.AddDefence), 18, ex + 126, ey + 75, select_color2(equip.AddDefence));
                font.draw('輕功', 18, ex + 90, ey + 95, color_ability1);
                font.draw(format('{:+}', equip.AddSpeed), 18, ex + 126, ey + 95, select_color2(equip.AddSpeed));
            } else {
                button.setTexture('title', 127);
                button.setPosition(ex, ey + 30);
            }
        };
        showEquip(Save.getItem(role.Equip0), this.button_equip0_, x_ + 20, '武器');
        showEquip(Save.getItem(role.Equip1), this.button_equip1_, x_ + 220, '防具');
        x = x_ + 20;
        y = y_ + 575;
        if (role.ID === 0) {
            font.draw('裝備武學', 25, x - 10, y, color_name);
            this.equip_magics_.forEach((b, i) => {
                let m = Save.getMagic(role.EquipMagic[i]);
                if (m && role.getMagicOfRoleIndex(m) < 0) {
                    m = null;
                }
                b.setText(m ? m.Name + ' '.repeat(Math.max(0, 10 - textDrawSize(m.Name))) : '__________');
            });
            font.draw('裝備物品', 25, x + 390, y, color_name);
            const m = Save.getItem(role.EquipItem);
            this.equip_item_.setText(m ? m.Name + ' '.repeat(Math.max(0, 10 - textDrawSize(m.Name))) : '__________');
        }
    }

    async dealEvent(e) {}

    async onPressedOK() {
        const role_ = this.role_;
        if (!role_) {
            return;
        }
        const r = this.menu_.getResult();
        if (r === 0 || r === 1) {
            const team_menu = new TeamMenu();
            team_menu.setText(format(r === 0 ? '{}要為誰醫療' : '{}要為誰解毒', role_.Name));
            await team_menu.run();
            const role = team_menu.getRole();
            if (role) {
                const copy = role.clone();
                if (r === 0) {
                    role_.medicine(role);
                } else {
                    role_.detoxification(role);
                }
                const df = new ShowRoleDifference(copy, role);
                df.setText(format(r === 0 ? '{}接受{}醫療' : '{}接受{}解毒', role.Name, role_.Name));
                await df.run();
            }
        } else if (r === 2) {
            await Event.getInstance().callLeaveEvent(role_);
        }
        if (r >= 3 && r < 7) {
            const menu = new BattleMagicMenu();
            menu.setRole(role_);
            menu.setPosition(730, 630 - 30 * role_.getLearnedMagicCount());
            await menu.run();
            if (menu.getMagic()) {
                const id = menu.getMagic().ID;
                for (let i = 0; i < role_.EquipMagic.length; i++) {
                    if (role_.EquipMagic[i] === id) {
                        role_.EquipMagic[i] = -1;
                    }
                }
                role_.EquipMagic[r - 3] = id;
            }
        }
        if (r === 7) {
            const menu = new BattleEquipItemMenu();
            menu.setRole(role_);
            menu.setPosition(730, 630 - 30 * menu.getChildCount());
            await menu.run();
            if (menu.getItem()) {
                role_.EquipItem = menu.getItem().ID;
            }
        }
        const uiitem_for_role = async (f) => {
            UI.getInstance().setVisible(false);
            const menu = new UIItem();
            menu.setIsDark(1);
            menu.setRole(role_);
            menu.setForceItemType(f);
            const head = new Head();
            head.setRole(role_);
            head.setPosition(-280, 60);
            head.setAlwaysLight(1);
            menu.addChild(head);
            menu.setPosition(300, 0);
            this.setVisible(false);
            await menu.runAtPosition(300, 0);
            this.setVisible(true);
            if (menu.getUsedItem()) {
                role_.equip(menu.getUsedItem());
            }
            UI.getInstance().setVisible(true);
        };
        if (r === 8) {
            await uiitem_for_role([1]);
        }
        if (r === 9) {
            await uiitem_for_role([2]);
        }
        if (r === 10) {
            await uiitem_for_role([5, 6, 7, 8, 9]);
        }
    }
}

export class UI extends RunNode {
    constructor() {
        super();
        this.current_head_ = 0;
        this.current_button_ = 0;
        this.item_id_ = -1;
        this.heads_ptrs_ = [];
        this.button_status_ = new Button();
        this.button_status_.setTexture('title', 122);
        this.button_status_.setAlpha(192);
        this.button_item_ = new Button();
        this.button_item_.setTexture('title', 124);
        this.button_item_.setAlpha(192);
        this.button_system_ = new Button();
        this.button_system_.setTexture('title', 125);
        this.button_system_.setAlpha(192);
        this.addChild(this.button_status_, 10, 10);
        this.addChild(this.button_item_, 90, 10);
        this.addChild(this.button_system_, 170, 10);
        this.addChild(new DayNightDisplay());
        this.heads_ = new Menu();
        this.addChild(this.heads_);
        for (let i = 0; i < TEAMMATE_COUNT; i++) {
            const h = new Head();
            this.heads_.addChild(h, 20, 60 + i * 90);
            this.heads_ptrs_.push(h);
        }
        this.heads_.getChild(0).setState(NodePass);
        // childs_[ui_index_] is the current sub page
        this.ui_index_ = this.getChildCount();
        this.ui_status_ = new UIStatus();
        this.ui_item_ = new UIItem();
        this.ui_system_ = new UISystem();
        this.ui_status_.setPosition(300, 0);
        this.ui_item_.setPosition(300, 0);
        this.ui_system_.setPosition(300, 0);
        this.addChild(this.ui_status_);
        this.setIsDark(1);
        this.result_ = -1;
    }

    static getInstance() {
        if (!UI.instance_) {
            UI.instance_ = new UI();
        }
        return UI.instance_;
    }

    getUsedItem() {
        return this.ui_item_.getUsedItem();
    }

    async onEntrance() {}

    draw() {}

    async dealEvent(e) {
        const engine = Engine;
        const page = () => this.childs_[this.ui_index_];
        for (let i = 0; i < TEAMMATE_COUNT; i++) {
            const head = this.heads_.getChild(i);
            const role = Save.getTeamMate(i);
            head.setRole(role);
            head.setVisible(role !== null);
            if (!role) {
                continue;
            }
            if (head.getState() === NodePass) {
                this.ui_status_.setRole(role);
                this.current_head_ = i;
            }
            head.setText('');
            if (page() === this.ui_item_) {
                head.setState(NodeNormal);
                const item = this.ui_item_.getCurrentItem();
                if (item) {
                    if (role.Equip0 === item.ID || role.Equip1 === item.ID || role.PracticeItem === item.ID) {
                        head.setText('使用中');
                    }
                    if (role.canUseItem(item)) {
                        head.setState(NodePass);
                    }
                }
            }
        }
        this.childs_[this.current_button_].setState(NodePass);
        let cb = this.current_button_;
        if (e.type === K.EVENT_KEY_UP) {
            if (e.key.key === K.K_1) {
                cb = 0;
            } else if (e.key.key === K.K_2) {
                cb = 1;
            } else if (e.key.key === K.K_3) {
                cb = 2;
            }
        }
        if (engine.gameControllerGetAxis(K.GAMEPAD_AXIS_LEFT_TRIGGER)) {
            cb = clamp(cb - 1, 0, 3);
            engine.setInterValControllerPress(200);
        }
        if (engine.gameControllerGetAxis(K.GAMEPAD_AXIS_RIGHT_TRIGGER)) {
            cb = clamp(cb + 1, 0, 3);
            engine.setInterValControllerPress(200);
        }
        if (cb !== this.current_button_) {
            this.current_button_ = cb;
            switch (cb) {
            case 0:
                this.childs_[this.ui_index_] = this.ui_status_;
                this.setAllChildState(NodeNormal);
                this.button_status_.setState(NodePress);
                break;
            case 1:
                this.childs_[this.ui_index_] = this.ui_item_;
                this.setAllChildState(NodeNormal);
                this.button_item_.setState(NodePress);
                break;
            case 2:
                this.childs_[this.ui_index_] = this.ui_system_;
                this.setAllChildState(NodeNormal);
                this.button_system_.setState(NodePress);
                break;
            default:
                break;
            }
        }
        this.heads_.setDealEvent(0);
        if (page() === this.ui_status_) {
            this.heads_.setDealEvent(1);
            this.heads_.setUDStyle(1);
        } else if (page() === this.ui_item_) {
            let r = null;
            for (const h of this.heads_.getChilds()) {
                if (h.mouseIn()) {
                    r = h.getRole();
                    break;
                }
            }
            this.ui_item_.setTryRole(r);
        }
    }

    backRun() {
        const page = this.childs_[this.ui_index_];
        if (page === this.ui_status_) {
            for (const h of this.heads_ptrs_) {
                if (h.getRole() === this.ui_status_.getRole()) {
                    h.setState(NodePress);
                }
            }
        }
        if (page === this.ui_system_) {
            for (const h of this.heads_.getChilds()) {
                h.setState(NodePress);
            }
        }
    }

    async onPressedOK() {
        if (this.button_status_.getState() === NodePress) {
            this.childs_[this.ui_index_] = this.ui_status_;
            this.current_button_ = this.button_status_.getTag();
            this.ui_item_.clearUsedItem();
            return;
        }
        if (this.button_item_.getState() === NodePress) {
            this.childs_[this.ui_index_] = this.ui_item_;
            this.current_button_ = this.button_item_.getTag();
            this.ui_item_.clearUsedItem();
            return;
        }
        if (this.button_system_.getState() === NodePress) {
            this.childs_[this.ui_index_] = this.ui_system_;
            this.current_button_ = this.button_system_.getTag();
            this.ui_item_.clearUsedItem();
            return;
        }
        if (this.childs_[this.ui_index_] === this.ui_item_) {
            const item = this.ui_item_.getUsedItem();
            if (item && item.ItemType === 0) {
                this.setExit(true);
                return;
            }
        }
        if (this.childs_[this.ui_index_] === this.ui_system_) {
            if (this.ui_system_.getResult() === 0) {
                this.setExit(true);
            }
        }
    }

    async onPressedCancel() {
        this.exitWithResult(-1);
    }
}
