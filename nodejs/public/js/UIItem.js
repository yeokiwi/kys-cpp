// UIItem: the item bag (UIItem.cpp)
import { C, RI } from './Color.js';
import { Engine } from './Engine.js';
import { Event } from './Event.js';
import { Font } from './Font.js';
import * as K from './Keys.js';
import { MainScene } from './MainScene.js';
import { DirectDown, DirectLeft, DirectRight, DirectUp, NodeNormal, NodePass, NodePress } from './RunNode.js';
import { Save } from './Save.js';
import { ShowRoleDifference } from './ShowExp.js';
import { TeamMenu } from './TeamMenu.js';
import { Button, Menu, MenuText, TextBox } from './TextBox.js';
import { TextureManager } from './TextureManager.js';
import { ITEM_IN_BAG_COUNT } from './Types.js';
import { UI } from './UI.js';
import { clamp, format, textDrawSize } from './util.js';

export class UIItem extends Menu {
    constructor() {
        super();
        this.item_each_line_ = 7;
        this.line_count_ = 3;
        this.item_buttons_ = [];
        this.leftup_index_ = 0;
        this.max_leftup_ = 0;
        this.force_item_type_ = new Set();
        this.select_user_ = true;
        this.focus_ = 0;
        this.properties_ = [];
        this.current_item_ = null;
        this.dropped_item_ = null;
        this.clear_current_item_after_drag_ok_ = false;
        this.current_button_ = null;
        this.available_items_ = [];
        this.used_item_ = null;
        this.touch_confirm_item_ = null;
        this.role_ = null;
        this.try_role_ = null;
        for (let i = 0; i < this.line_count_ * this.item_each_line_; i++) {
            const b = new Button();
            this.addChild(b);
            this.item_buttons_.push(b);
            b.setPosition((i % this.item_each_line_) * 85 + 40, Math.trunc(i / this.item_each_line_) * 85 + 100);
            b.setAlpha(192);
            b.setMoveOnState(false);
        }
        this.title_ = new MenuText();
        this.title_.setStrings(['劇情', '兵器', '護甲', '丹藥', '暗器', '拳經', '劍譜', '刀錄', '奇門', '心法']);
        this.title_.setFontSize(24);
        this.title_.arrange(40, 50, 64, 0);
        this.title_.setDealEvent(0);
        this.title_.setLRStyle(1);
        this.addChild(this.title_);
        this.cursor_ = new TextBox();
        this.cursor_.setTexture('title', 127);
        this.cursor_.setVisible(false);
        this.addChild(this.cursor_);
        this.active_child_ = 0;
        this.getChild(0).setState(NodePass);
        this.drag_item_ = new Button();
        this.drag_item_.setTexture('item', -1);
        this.drag_item_.setAlpha(128);
        this.drag_item_.setMoveOnState(false);
        this.addChild(this.drag_item_);
    }

    getTitle() {
        return this.title_;
    }

    setSelectUser(s) {
        this.select_user_ = s;
    }

    getCurrentItem() {
        return this.current_item_;
    }

    getUsedItem() {
        return this.used_item_;
    }

    clearUsedItem() {
        this.used_item_ = null;
    }

    setRole(r) {
        this.role_ = r;
    }

    setTryRole(r) {
        this.try_role_ = r;
    }

    async onEntrance() {
        this.used_item_ = null;
        this.touch_confirm_item_ = null;
    }

    setForceItemType(f) {
        this.force_item_type_ = new Set(f);
        if (this.force_item_type_.size) {
            this.title_.setAllChildVisible(false);
            for (const i of this.force_item_type_) {
                this.title_.getChild(i).setVisible(true);
            }
        } else {
            this.title_.setAllChildVisible(true);
        }
        this.title_.arrange(40, 50, 64, 0);
    }

    // 0 story, 1 weapon, 2 armor, 3 medicine, 4 hidden weapon, 5 fist, 6 sword, 7 knife, 8 unusual, 9 internal
    getItemDetailType(item) {
        if (!item) {
            return -1;
        }
        if (item.ItemType === 0) {
            return 0;
        } else if (item.ItemType === 1) {
            return item.EquipType === 0 ? 1 : 2;
        } else if (item.ItemType === 3) {
            return 3;
        } else if (item.ItemType === 4) {
            return 4;
        } else if (item.ItemType === 2) {
            const m = Save.getMagic(item.MagicID);
            if (m && m.HurtType === 0) {
                return m.MagicType + 4;
            }
            return 9;
        }
        return 0;
    }

    geItemsByType(item_type) {
        this.available_items_ = [];
        for (let i = 0; i < ITEM_IN_BAG_COUNT; i++) {
            const item = Save.getItemByBagIndex(i);
            if (this.getItemDetailType(item) === item_type) {
                if (!this.role_ || this.role_.canUseItem(item)) {
                    this.available_items_.push(item);
                }
            }
        }
    }

    checkCurrentItem() {
        if (this.force_item_type_.size === 1) {
            this.title_.forceActiveChild([...this.force_item_type_][0]);
        }
        const active = this.title_.getActiveChildIndex();
        this.title_.getChild(active)?.setState(NodePass);
        this.geItemsByType(active);
        const n = this.available_items_.length;
        this.max_leftup_ = (Math.trunc((n + this.item_each_line_ - 1) / this.item_each_line_) - this.line_count_) * this.item_each_line_;
        if (this.max_leftup_ < 0) {
            this.max_leftup_ = 0;
        }
        this.leftup_index_ = clamp(this.leftup_index_, 0, this.max_leftup_);
        this.current_button_ = null;
        this.item_buttons_.forEach((button, i) => {
            const item = this.getAvailableItem(i + this.leftup_index_);
            button.setTexture('item', item ? item.ID : -1);
            if (button.getState() === NodePass || button.getState() === NodePress) {
                this.current_button_ = button;
            }
        });
        this.current_item_ = null;
        if (this.current_button_) {
            this.dropped_item_ = null;
            const [x, y] = this.current_button_.getPosition();
            this.current_item_ = Save.getItem(this.current_button_.getTexutreID());
            this.cursor_.setPosition(x, y);
            this.cursor_.setVisible(this.focus_ === 1);
        } else {
            this.current_item_ = this.dropped_item_;
            this.cursor_.setVisible(false);
        }
    }

    getAvailableItem(i) {
        if (i >= 0 && i < this.available_items_.length) {
            return this.available_items_[i];
        }
        return null;
    }

    moveItemCursor(direct) {
        const per = this.item_each_line_;
        switch (direct) {
        case DirectLeft:
            if (this.active_child_ > 0) {
                this.active_child_--;
            } else if (this.leftup_index_ > 0) {
                this.leftup_index_ -= per;
                this.active_child_ = per - 1;
            }
            break;
        case DirectRight:
            if (this.active_child_ < per * this.line_count_ - 1) {
                this.active_child_++;
            } else {
                this.leftup_index_ += per;
                if (this.leftup_index_ <= this.max_leftup_) {
                    this.active_child_ = per * (this.line_count_ - 1);
                }
            }
            break;
        case DirectUp:
            if (this.active_child_ < per && this.leftup_index_ === 0) {
                this.focus_ = 0;
            } else if (this.active_child_ < per) {
                this.leftup_index_ -= per;
            } else {
                this.active_child_ -= per;
            }
            break;
        case DirectDown:
            if (this.active_child_ < per * (this.line_count_ - 1)) {
                this.active_child_ += per;
            } else {
                this.leftup_index_ += per;
            }
            break;
        default:
            break;
        }
    }

    updateFocusFromMouse(e) {
        if (e.type !== K.EVENT_MOUSE_MOTION
            && !((e.type === K.EVENT_MOUSE_BUTTON_DOWN || e.type === K.EVENT_MOUSE_BUTTON_UP) && e.button.button === K.BUTTON_LEFT)) {
            return;
        }
        for (const b of this.item_buttons_) {
            if (b.mouseIn()) {
                this.focus_ = 1;
                return;
            }
        }
        if (!this.title_.checkAllMouseNotIn()) {
            this.focus_ = 0;
        }
    }

    syncFocusState() {
        this.title_.setDealEvent(this.focus_ === 0 ? 1 : 0);
        if (this.focus_ === 1) {
            this.title_.setAllChildState(NodeNormal);
        }
        this.cursor_.setVisible(this.focus_ === 1 && this.current_button_ !== null);
    }

    async dealEvent(e) {
        const engine = Engine;
        const is_touch_tap = e.type === K.EVENT_MOUSE_BUTTON_UP && e.which === 'touch' && e.button.button === K.BUTTON_LEFT;
        this.checkCurrentItem();
        const previous_focus = this.focus_;
        const previous_active_child = this.active_child_;
        const previous_leftup_index = this.leftup_index_;
        this.updateFocusFromMouse(e);
        if (e.type === K.EVENT_MOUSE_WHEEL) {
            if (e.wheel.y > 0) {
                this.leftup_index_ -= this.item_each_line_;
            } else if (e.wheel.y < 0) {
                this.leftup_index_ += this.item_each_line_;
            }
        }
        // dragging items
        if (e.type === K.EVENT_MOUSE_BUTTON_DOWN && e.button.button === K.BUTTON_LEFT && this.drag_item_.getTexutreID() < 0) {
            if (this.current_button_) {
                this.dropped_item_ = null;
                this.drag_item_.setTexture('item', this.current_button_.getTexutreID());
            }
        }
        if (this.drag_item_.getTexutreID() >= 0) {
            const [x, y] = engine.getMouseStateInStartWindow();
            this.current_item_ = Save.getItem(this.drag_item_.getTexutreID());
            const [w, h] = this.drag_item_.getSize();
            this.drag_item_.setPosition(x - Math.trunc(w / 2), y - Math.trunc(h / 2));
        }
        if (e.type === K.EVENT_MOUSE_BUTTON_UP && e.button.button === K.BUTTON_LEFT && this.drag_item_.getTexutreID() >= 0) {
            this.drag_item_.setTexture('item', -1);
            this.clear_current_item_after_drag_ok_ = true;
        }
        if (this.focus_ === 1) {
            if (e.type === K.EVENT_KEY_DOWN) {
                switch (e.key.key) {
                case K.K_LEFT:
                case K.K_A:
                    this.moveItemCursor(DirectLeft);
                    break;
                case K.K_RIGHT:
                case K.K_D:
                    this.moveItemCursor(DirectRight);
                    break;
                case K.K_UP:
                case K.K_W:
                    this.moveItemCursor(DirectUp);
                    break;
                case K.K_DOWN:
                case K.K_S:
                    this.moveItemCursor(DirectDown);
                    break;
                default:
                    break;
                }
                this.forceActiveChild();
            }
            this.title_.setDealEvent(0);
            this.title_.setAllChildState(NodeNormal);
        }
        if (this.focus_ === 0) {
            this.title_.setDealEvent(1);
            if (e.type === K.EVENT_KEY_UP && e.key.key === K.K_DOWN) {
                this.focus_ = 1;
            }
        }
        if (this.focus_ === 1) {
            const dirs = [[K.GAMEPAD_BUTTON_DPAD_LEFT, DirectLeft], [K.GAMEPAD_BUTTON_DPAD_RIGHT, DirectRight],
                [K.GAMEPAD_BUTTON_DPAD_UP, DirectUp], [K.GAMEPAD_BUTTON_DPAD_DOWN, DirectDown]];
            for (const [b, d] of dirs) {
                if (engine.gameControllerGetButton(b)) {
                    this.moveItemCursor(d);
                    engine.setInterValControllerPress(100);
                    this.forceActiveChild();
                }
            }
        }
        if (this.focus_ !== previous_focus && this.focus_ === 1) {
            this.forceActiveChild();
        }
        if (this.drag_item_.getTexutreID() < 0
            && (this.focus_ !== previous_focus || this.active_child_ !== previous_active_child || this.leftup_index_ !== previous_leftup_index)) {
            this.checkCurrentItem();
        }
        if (is_touch_tap) {
            const tapped = this.current_button_ && this.current_button_.inSide(e.button.x, e.button.y);
            if (tapped && this.touch_confirm_item_ === this.current_item_) {
                this.touch_confirm_item_ = null;
            } else if (tapped) {
                this.touch_confirm_item_ = this.current_item_;
                e.type = K.EVENT_FIRST;
            } else {
                this.touch_confirm_item_ = null;
            }
        } else if (this.touch_confirm_item_ !== this.current_item_) {
            this.touch_confirm_item_ = null;
        }
        this.syncFocusState();
    }

    draw() {
        this.showItemProperty(this.current_item_);
    }

    showItemProperty(item) {
        if (!item) {
            return;
        }
        const x_ = this.x_;
        const y_ = this.y_;
        Font.draw(item.Name, 24, x_ + 10, y_ + 370, C(255, 255, 255, 255));
        Font.draw(String(Save.getItemCountInBag(this.current_item_.ID)), 24, x_ + 260, y_ + 370, C(255, 255, 255, 255));
        let user_role = null;
        if ((item.ItemType === 1 || item.ItemType === 2) && item.User >= 0) {
            user_role = Save.getRole(item.User);
        }
        const draw_user = () => {
            if (user_role) {
                TextureManager.renderTextureByName('head', user_role.HeadID, x_ + 520, y_ + 355, RI(C(255, 255, 255, 255), 255, 0.35, 0.35));
                Font.draw(user_role.Name, 18, x_ + 570, y_ + 370, C(255, 255, 255, 255));
                Font.draw('正在使用', 18, x_ + 570, y_ + 390, C(255, 215, 0, 255));
            }
        };
        const l0 = Font.draw(item.Introduction, 20, x_ + 20, y_ + 400, C(255, 255, 255, 255));
        const x = 10;
        let y = 410 + 20 * l0;
        const size = 20;
        let l;
        let c = C(255, 215, 0, 255);
        if (item.isCompass()) {
            const [man_x, man_y] = MainScene.getInstance().getManPosition();
            this.addOneProperty(format('當前坐標 {}, {}', man_x, man_y), 1);
            l = this.showAddedProperty(size, c, x, y);
            y += l * size + 10;
        }
        if (item.ItemType === 0) {
            draw_user();
            return;
        }
        const add = (f, v) => this.addOneProperty(f, v);
        add('生命{:+}', item.AddHP);
        add('生命上限{:+}', item.AddMaxHP);
        add('內力{:+}', item.AddMP);
        add('內力上限{:+}', item.AddMaxMP);
        add('體力{:+}', item.AddPhysicalPower);
        add('中毒{:+}', item.AddPoison);
        add('攻擊{:+}', item.AddAttack);
        add('輕功{:+}', item.AddSpeed);
        add('防禦{:+}', item.AddDefence);
        add('醫療{:+}', item.AddMedicine);
        add('用毒{:+}', item.AddUsePoison);
        add('解毒{:+}', item.AddDetoxification);
        add('抗毒{:+}', item.AddAntiPoison);
        add('拳掌{:+}', item.AddFist);
        add('御劍{:+}', item.AddSword);
        add('耍刀{:+}', item.AddKnife);
        add('特殊兵器{:+}', item.AddUnusual);
        add('暗器{:+}', item.AddHiddenWeapon);
        add('作弊{:+}', item.AddKnowledge);
        add('道德{:+}', item.AddMorality);
        add('攻擊帶毒{:+}', item.AddAttackWithPoison);
        add('內力調和', item.ChangeMPType === 2 ? 1 : 0);
        add('雙擊', item.AddAttackTwice === 1 ? 1 : 0);
        const magic = Save.getMagic(item.MagicID);
        if (magic) {
            add(`習得武學${magic.Name}`, 1);
        }
        l = this.showAddedProperty(size, c, x, y);
        if (item.ItemType === 3 || item.ItemType === 4) {
            draw_user();
            return;
        }
        y += l * size + 10;
        c = C(224, 170, 255, 255);
        const role = Save.getRole(item.OnlySuitableRole);
        if (role) {
            add(`僅適合${role.Name}`, 1);
        }
        add('內力{}', item.NeedMP);
        add('攻擊{}', item.NeedAttack);
        add('輕功{}', item.NeedSpeed);
        add('醫療{}', item.NeedMedicine);
        add('用毒{}', item.NeedUsePoison);
        add('解毒{}', item.NeedDetoxification);
        add('拳掌{}', item.NeedFist);
        add('御劍{}', item.NeedSword);
        add('耍刀{}', item.NeedKnife);
        add('特殊兵器{}', item.NeedUnusual);
        add('暗器{}', item.NeedHiddenWeapon);
        add('資質{}', item.NeedIQ);
        if (item.NeedMPType === 0) {
            this.properties_.push('陰性內力');
        }
        if (item.NeedMPType === 1) {
            this.properties_.push('陽性內力');
        }
        add('基礎經驗{}', item.NeedExp);
        if (item.NeedMaterial >= 0) {
            const mat = Save.getItem(item.NeedMaterial);
            add('耗費' + (mat ? mat.Name : ''), 1);
        }
        l = this.showAddedProperty(size, c, x, y);
        y += l * size + 10;
        c = C(51, 250, 255, 255);
        for (let i = 0; i < 5; i++) {
            const make = item.MakeItem[i];
            if (make >= 0) {
                const it = Save.getItem(make);
                add(it ? it.Name : '', item.MakeItemCount[i]);
            }
        }
        this.showAddedProperty(size, c, x, y);
        draw_user();
    }

    addOneProperty(fmt, v) {
        if (v === undefined) {
            this.properties_.push(fmt);
            return;
        }
        if (v !== 0) {
            this.properties_.push(format(fmt, v));
        }
    }

    // returns the number of lines
    showAddedProperty(size, c, x, y) {
        let line = 1;
        for (const str of this.properties_) {
            const draw_length = Math.trunc((size * textDrawSize(str)) / 2) + size;
            if (x + draw_length > 700) {
                x = 10;
                y += size + 5;
                line++;
            }
            Font.draw(str, size, this.x_ + x, this.y_ + y, c);
            x += draw_length;
        }
        this.properties_ = [];
        return line;
    }

    async onPressedOK() {
        const cur = this.current_item_;
        if (!cur) {
            return;
        }
        if (!this.current_button_ && cur === this.dropped_item_) {
            return;
        }
        this.used_item_ = cur;
        if (cur.ItemType === 0) {
            this.result_ = cur.ID;
        }
        if (this.role_) {
            this.select_user_ = false;
        }
        if (this.select_user_) {
            UI.getInstance().setVisible(false);
            let role = this.try_role_;
            if (cur.ItemType === 3) {
                if (!role) {
                    const team_menu = new TeamMenu();
                    team_menu.setItem(cur);
                    team_menu.setText(format('誰要使用{}', cur.Name));
                    await team_menu.run();
                    role = team_menu.getRole();
                }
                if (role && role.canUseItem(cur)) {
                    const r = role.clone();
                    role.useItem(cur);
                    const df = new ShowRoleDifference(r, role);
                    df.setText(format('{}服用{}', role.Name, cur.Name));
                    await df.run();
                    await Event.getInstance().addItemWithoutHint(cur.ID, -1);
                }
            } else if (cur.ItemType === 1 || cur.ItemType === 2) {
                if (!role) {
                    const team_menu = new TeamMenu();
                    team_menu.setItem(cur);
                    team_menu.setText(format(cur.ItemType === 1 ? '誰要裝備{}' : '誰要修煉{}', cur.Name));
                    await team_menu.run();
                    role = team_menu.getRole();
                }
                if (role && role.canUseItem(cur)) {
                    role.equip(cur);
                    this.dropped_item_ = cur;
                }
            }
            UI.getInstance().setVisible(true);
        }
        if (this.clear_current_item_after_drag_ok_) {
            this.current_item_ = this.dropped_item_;
            this.current_button_ = null;
            this.clear_current_item_after_drag_ok_ = false;
            this.setAllChildState(NodeNormal);
        }
        this.setExit(true);
    }

    async onPressedCancel() {
        this.current_item_ = null;
        this.exitWithResult(-1);
    }
}
