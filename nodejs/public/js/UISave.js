// UISave (save/load slots) and UISystem (system menu) (UISave.cpp, UISystem.cpp)
import { C } from './Color.js';
import { Engine } from './Engine.js';
import { Event } from './Event.js';
import { MainScene } from './MainScene.js';
import { RunNode } from './RunNode.js';
import { Save } from './Save.js';
import { SubScene } from './SubScene.js';
import { MenuText, TextBox } from './TextBox.js';
import { UI } from './UI.js';
import { UIConfig } from './UIConfig.js';
import { format } from './util.js';

const AUTO_SAVE_ID = 11;

function timeString(ms) {
    if (!ms) {
        return '-------------------';
    }
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export class UISave extends MenuText {
    constructor() {
        super();
        this.mode_ = 0;    // 0 load, 1 save
        const strings = [];
        for (let i = 0; i <= 10; i++) {
            strings.push(format('進度{:02}  {}', i, timeString(0)));
        }
        strings.push(format('自動檔  {}', timeString(0)));
        this.setStrings(strings);
        this.childs_[0].setVisible(false);
        this.forceActiveChild(1);
        this.arrange(0, 0, 0, 28);
    }

    setMode(m) {
        this.mode_ = m;
    }

    async onEntrance() {
        const list = await Save.listSaves(AUTO_SAVE_ID);
        const times = new Map(list.map((s) => [s.slot, s.mtime]));
        for (let i = 0; i <= 10; i++) {
            this.childs_[i].setText(format('進度{:02}  {}', i, timeString(times.get(i))));
        }
        this.childs_[AUTO_SAVE_ID].setText(format('自動檔  {}', timeString(times.get(AUTO_SAVE_ID))));
        if (this.mode_ === 1) {
            this.childs_[this.childs_.length - 1].setVisible(false);
        }
    }

    async onPressedOK() {
        this.checkActiveToResult();
        if (this.result_ >= 0) {
            if (this.mode_ === 0) {
                this.setExit(await UISave.load(this.result_));
            }
            if (this.mode_ === 1) {
                Event.getInstance().arrangeBag();
                await UISave.save(this.result_);
                this.setExit(true);
            }
        }
    }

    static async load(r) {
        const sub_scene = RunNode.getPointerFromRoot(SubScene);
        const save = Save;
        const main_scene = MainScene.getInstance();
        if (await save.load(r)) {
            main_scene.setManPosition(save.MainMapX, save.MainMapY);
            if (save.InSubMap >= 0) {
                if (sub_scene) {
                    await sub_scene.forceJumpSubScene(save.InSubMap, save.SubMapX, save.SubMapY);
                } else {
                    main_scene.forceEnterSubScene(save.InSubMap, save.SubMapX, save.SubMapY);
                }
            } else if (sub_scene) {
                sub_scene.forceExit();
            }
            UI.getInstance().setExit(true);
            return true;
        }
        const text = new TextBox();
        text.setText('存檔讀取失敗!');
        text.setFontSize(24);
        text.setTextColor(C(255, 0, 0, 255));
        await text.runAtPosition(Math.trunc(Engine.getUIWidth() / 2) - 100, 620);
        return false;
    }

    static async save(r) {
        const sub_scene = RunNode.getPointerFromRoot(SubScene);
        const save = Save;
        const main_scene = MainScene.getInstance();
        [save.MainMapX, save.MainMapY] = main_scene.getManPosition();
        if (sub_scene) {
            [save.SubMapX, save.SubMapY] = sub_scene.getManPosition();
            save.InSubMap = sub_scene.getMapInfo().ID;
        } else {
            save.InSubMap = -1;
        }
        await save.save(r);
    }

    static async autoSave() {
        await UISave.save(AUTO_SAVE_ID);
    }
}

export class UISystem extends RunNode {
    constructor() {
        super();
        this.title_ = new MenuText();
        this.title_.setStrings(['讀取進度', '保存進度', '遊戲配置', '離開遊戲']);
        this.title_.setFontSize(24);
        this.title_.arrange(100, 50, 120, 0);
        this.title_.setLRStyle(1);
        this.addChild(this.title_);
    }

    async onPressedOK() {
        this.result_ = -1;
        const r = this.title_.getResult();
        const x = 400 + 120 * r;
        if (r === 0) {
            const ui_load = new UISave();
            ui_load.setMode(0);
            ui_load.setFontSize(22);
            this.result_ = await ui_load.runAtPosition(x, 100);
        } else if (r === 1) {
            const ui_save = new UISave();
            ui_save.setMode(1);
            ui_save.setFontSize(22);
            this.result_ = await ui_save.runAtPosition(x, 100);
        } else if (r === 2) {
            const menu = new UIConfig();
            this.result_ = await menu.runAtPosition(x, 100);
        } else if (r === this.title_.getChildCount() - 1) {
            this.result_ = await UISystem.askExit();
        }
        this.title_.setResult(-1);
    }

    async onPressedCancel() {
        this.exitWithResult(-1);
    }

    static async askExit(mode = 0) {
        let ret = -1;
        if (!UISystem.asking_) {
            UISystem.asking_ = true;
            const menu = new MenuText();
            menu.setStrings(['我點錯了', '離開遊戲', '返回開頭']);
            menu.setFontSize(24);
            let x = 760;
            let y = 100;
            if (mode === 1) {
                x = Engine.getUIWidth() - 150;
                y = 20;
                menu.setIsDark(1);
            }
            menu.arrange(0, 0, 0, 40);
            const r = await menu.runAtPosition(x, y);
            if (r === 1) {
                // there is no process to quit in a browser: go back to the start page
                window.location.reload();
                await new Promise(() => {});
            } else if (r === 2) {
                RunNode.exitAll(1);
                Event.getInstance().forceExit();
                ret = 0;
            }
            UISystem.asking_ = false;
        }
        return ret;
    }
}
UISystem.asking_ = false;
