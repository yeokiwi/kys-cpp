// UIConfig (options screen) and UIKeyConfig (key bindings) (UIConfig.cpp, UIKeyConfig.cpp)
import { Audio } from './Audio.js';
import { C, RI } from './Color.js';
import { Engine } from './Engine.js';
import { Font } from './Font.js';
import { GameUtil } from './GameUtil.js';
import * as K from './Keys.js';
import { NodeNormal, NodePress, RunNode } from './RunNode.js';
import { Button, ButtonGetKey, Menu, MenuText } from './TextBox.js';
import { TextureManager } from './TextureManager.js';
import { findNumbers, textDrawSize } from './util.js';

const ROW_WIDTH = 180;
const ROW_HEIGHT = 28;
const ROW_GAP = 36;
const ARROW_WIDTH = 16;
const ARROW_LEFT_OFFSET = 150;
const ARROW_RIGHT_OFFSET = 250;
const BUTTON_TOP_GAP = 18;

function clampIndex(value, count) {
    if (count <= 0) {
        return 0;
    }
    return Math.max(0, Math.min(value, count - 1));
}

let first_press = 0;

export class UIConfig extends Menu {
    constructor() {
        super();
        this.items_ = [];
        this.buttons_left_ = [];
        this.buttons_right_ = [];
        const volume = [];
        for (let v = 0; v <= 100; v += 10) {
            volume.push(String(v));
        }
        this.addOption('音樂音量', 'music', 'volume', volume);
        this.addOption('戰鬥音效', 'music', 'volumewav', volume);
        this.addOption('戰鬥模式', 'game', 'battle_mode', ['回合制', '半即時', '黑帝斯', '隻狼']);
        this.addOption('遠征隊規則', 'game', 'expedition33', ['關閉', '開啟']);
        this.addOption('戰鬥畫法', 'game', 'battle_presentation', ['經典', '紙片']);
        this.addOption('格擋輔助', 'game', 'easy_block', ['關閉', '開啟']);
        this.addOption('直接勝利', 'game', 'battle_debug_win', ['關閉', '開啟']);
        this.addOption('文字顯示', 'game', 'simplified_chinese', ['繁體', '簡體']);
        this.addOption('手柄震動', 'game', 'controller_rumble', ['關閉', '開啟']);
        this.addOption('虛擬手柄', 'game', 'use_virtual_stick', ['關閉', '開啟']);
        this.addOption('動態晝夜', 'game', 'dynamic_day_night', ['關閉', '開啟']);
        this.addOption('貼圖左上高光', 'game', 'texture_top_left_highlight', ['關閉', '開啟']);
        this.addOption('全屏', 'game', 'fullscreen', ['關閉', '開啟']);
        const button_y = this.items_.length * ROW_GAP + BUTTON_TOP_GAP;
        this.button_ok_ = new Button();
        this.button_ok_.setFontSize(24);
        this.button_ok_.setText('確認');
        this.addChild(this.button_ok_, 100, button_y);
        this.button_cancel_ = new Button();
        this.button_cancel_.setFontSize(24);
        this.button_cancel_.setText('取消');
        this.addChild(this.button_cancel_, 200, button_y);
        this.w_ = ROW_WIDTH;
        this.h_ = button_y + 30;
        this.loadConfig();
        this.refreshTexts();
    }

    addOption(label, section, key, options) {
        const row = new Button();
        row.setFontSize(24);
        row.setText(label);
        row.setHaveBox(false);
        row.setTextColor(C(48, 32, 16, 255), C(255, 255, 255, 255), C(255, 255, 255, 255));
        row.setSize(ROW_WIDTH, ROW_HEIGHT);
        this.addChild(row, 0, this.items_.length * ROW_GAP);
        const left = new Button();
        left.setTexture('title', 104);
        row.addChild(left, ARROW_LEFT_OFFSET, 4);
        this.buttons_left_.push(left);
        const right = new Button();
        right.setTexture('title', 105);
        row.addChild(right, ARROW_RIGHT_OFFSET, 4);
        this.buttons_right_.push(right);
        this.items_.push({ label, section, key, options, value: 0, row });
    }

    findOption(section, key) {
        return this.items_.find((i) => i.section === section && i.key === key) || null;
    }

    loadConfig() {
        const g = GameUtil;
        for (const item of this.items_) {
            const def = item.section === 'game' && item.key === 'texture_top_left_highlight' ? 1 : 0;
            let value = g.getInt(item.section, item.key, def);
            if (item.section === 'music' && (item.key === 'volume' || item.key === 'volumewav')) {
                value = Math.trunc(value / 10);
            }
            item.value = clampIndex(value, item.options.length);
        }
        let item = this.findOption('music', 'volume');
        item.value = clampIndex(Math.trunc(g.getInt('music', 'volume', 20) / 10), item.options.length);
        item = this.findOption('music', 'volumewav');
        item.value = clampIndex(Math.trunc(g.getInt('music', 'volumewav', 50) / 10), item.options.length);
        const battle_mode = g.getInt('game', 'battle_mode', 0);
        item = this.findOption('game', 'battle_mode');
        item.value = clampIndex(battle_mode, item.options.length);
        if (battle_mode !== item.value) {
            g.setKey('game', 'battle_mode', String(item.value));
        }
        item = this.findOption('game', 'battle_debug_win');
        item.value = g.getInt('game', 'battle_debug_win', 0) !== 0 ? 1 : 0;
        item = this.findOption('game', 'fullscreen');
        item.value = Engine.isFullScreen() ? 1 : 0;
    }

    saveConfig() {
        for (const item of this.items_) {
            let value = item.value;
            if (item.section === 'music' && (item.key === 'volume' || item.key === 'volumewav')) {
                value *= 10;
            }
            GameUtil.setKey(item.section, item.key, String(value));
        }
        Audio.setVolume(this.findOption('music', 'volume').value * 10);
        Audio.setVolumeWav(this.findOption('music', 'volumewav').value * 10);
        Font.setSimplified(this.findOption('game', 'simplified_chinese').value);
        Engine.setFullScreen(this.findOption('game', 'fullscreen').value !== 0);
        Engine.setTextureTopLeftHighlightEnabled(this.findOption('game', 'texture_top_left_highlight').value !== 0);
        Engine.rumble_enabled_ = this.findOption('game', 'controller_rumble').value !== 0;
        RunNode.setUseVirtualStick(this.findOption('game', 'use_virtual_stick').value);
    }

    refreshTexts() {
        for (const item of this.items_) {
            item.row.setText(item.label);
        }
    }

    changeOption(index, delta) {
        if (index < 0 || index >= this.items_.length) {
            return;
        }
        const item = this.items_[index];
        item.value += delta;
        if (item.value < 0) {
            item.value = item.options.length - 1;
        } else if (item.value >= item.options.length) {
            item.value = 0;
        }
    }

    isConfigItemActive() {
        return this.active_child_ >= 0 && this.active_child_ < this.items_.length;
    }

    draw() {
        for (const item of this.items_) {
            const [row_x, row_y] = item.row.getPosition();
            const alpha = item.row.getState() === NodeNormal ? 224 : 255;
            const value = item.options[clampIndex(item.value, item.options.length)];
            const value_width = Math.trunc((24 * textDrawSize(value)) / 2);
            const value_x = Math.trunc((ARROW_LEFT_OFFSET + ARROW_WIDTH + ARROW_RIGHT_OFFSET - value_width) / 2);
            const rect = Font.getBoxRect(0, 24, row_x, row_y);
            rect.w = Math.max(value_x + value_width, ARROW_RIGHT_OFFSET + ARROW_WIDTH) + 20;
            TextureManager.renderTextureByName('title', 126, rect.x, rect.y, RI(C(255, 255, 255, 255), alpha), rect.w, rect.h);
            const vc = item.row.getState() === NodeNormal ? C(48, 32, 16, 255) : C(255, 255, 255, 255);
            Font.draw(value, 24, row_x + value_x, row_y, vc, 255);
        }
    }

    async dealEvent(e) {
        if (e.type === K.EVENT_KEY_DOWN && this.isConfigItemActive() && (e.key.key === K.K_LEFT || e.key.key === K.K_RIGHT)) {
            if (first_press === 0 || first_press > 5) {
                this.changeOption(this.active_child_, e.key.key === K.K_LEFT ? -1 : 1);
            }
            first_press++;
        } else if (this.isConfigItemActive() && Engine.gameControllerGetButton(K.GAMEPAD_BUTTON_DPAD_LEFT)) {
            this.changeOption(this.active_child_, -1);
            Engine.setInterValControllerPress(200);
        } else if (this.isConfigItemActive() && Engine.gameControllerGetButton(K.GAMEPAD_BUTTON_DPAD_RIGHT)) {
            this.changeOption(this.active_child_, 1);
            Engine.setInterValControllerPress(200);
        } else {
            await super.dealEvent(e);
        }
        if (e.type === K.EVENT_KEY_UP && (e.key.key === K.K_LEFT || e.key.key === K.K_RIGHT)) {
            first_press = 0;
        }
    }

    async onPressedOK() {
        for (let i = 0; i < this.items_.length; i++) {
            if (this.buttons_left_[i].getState() === NodePress) {
                this.changeOption(i, -1);
                return;
            }
            if (this.buttons_right_[i].getState() === NodePress) {
                this.changeOption(i, 1);
                return;
            }
        }
        if (this.button_ok_.getState() === NodePress) {
            this.saveConfig();
            GameUtil.saveConfig();
            this.exitWithResult(-1);
            return;
        }
        if (this.button_cancel_.getState() === NodePress) {
            this.exitWithResult(-1);
            return;
        }
        this.checkActiveToResult();
        if (this.result_ >= 0 && this.result_ < this.items_.length) {
            this.changeOption(this.result_, 1);
            this.result_ = -1;
        }
    }

    async onPressedCancel() {
        this.exitWithResult(-1);
    }
}

const KEYS = { Left: K.K_A, Up: K.K_W, Right: K.K_D, Down: K.K_S, Light: K.K_J, Heavy: K.K_I, Long: K.K_K, Slash: K.K_M, Item: K.K_P };
const KEY_ORDER = ['Left', 'Up', 'Right', 'Down', 'Light', 'Heavy', 'Long', 'Slash', 'Item'];

export class UIKeyConfig extends MenuText {
    constructor() {
        super();
        this.key_ = { ...KEYS };
        const s = (k) => UIKeyConfig.keyToString(this.key_[k]);
        this.setStrings(['左' + s('Left'), '上' + s('Up'), '右' + s('Right'), '下' + s('Down'), '轻' + s('Light'), '重' + s('Heavy'),
            '远' + s('Long'), '闪' + s('Slash'), '器' + s('Item'), '確定', '取消']);
        this.setFontSize(30);
        const pos = [[0, 50], [120, 0], [240, 50], [120, 100], [400, 50], [520, 0], [640, 50], [520, 100], [760, 100], [500, 200], [600, 200]];
        pos.forEach(([x, y], i) => this.childs_[i].setPosition(x, y));
    }

    static getKeyConfig() {
        return KEYS;
    }

    static readFromString(str) {
        const v = findNumbers(str);
        if (v.length >= 9) {
            KEY_ORDER.forEach((k, i) => {
                KEYS[k] = v[i];
            });
        }
    }

    static toString() {
        return KEY_ORDER.map((k) => KEYS[k]).join(',');
    }

    static keyToString(k) {
        return `[${String.fromCharCode(k & 0xff)}]`;
    }

    async onPressedOK() {
        this.checkActiveToResult();
        const r0 = this.result_;
        if (r0 >= 0 && r0 < 9) {
            const button = new ButtonGetKey();
            const [x, y] = this.childs_[r0].getPosition();
            button.setText('按下一個鍵');
            await button.runAtPosition(x + 20, y + 20);
            const r = button.getResult();
            const b = this.childs_[r0];
            b.setText([...b.getText()][0] + UIKeyConfig.keyToString(r));
            this.key_[KEY_ORDER[r0]] = r;
        }
        if (r0 === 9) {
            Object.assign(KEYS, this.key_);
            GameUtil.setKey('game', 'key', UIKeyConfig.toString());
            GameUtil.saveConfig();
            this.setExit(true);
        }
        if (r0 === 10) {
            this.setExit(true);
        }
    }

    async onPressedCancel() {
        this.setExit(true);
    }
}
