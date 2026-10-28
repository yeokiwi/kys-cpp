// RandomRole: rolling the properties of the hero at the start (RandomRole.cpp)
import { C } from './Color.js';
import { Engine } from './Engine.js';
import { Head } from './Head.js';
import { Button, Menu } from './TextBox.js';
import { UIStatus } from './UI.js';
import { RandomDouble } from './util.js';

export class RandomRole extends UIStatus {
    constructor() {
        super();
        this.setShowButton(false);
        this.setShowRandomProperties(true);
        this.action_menu_ = new Menu();
        this.action_menu_.setPosition(185, 675);
        this.action_menu_.setSize(270, 30);
        this.button_random_ = this.action_menu_.addChild(new Button(), 0, 0);
        this.button_random_.setText('隨機');
        this.button_ok_ = this.action_menu_.addChild(new Button(), 90, 0);
        this.button_ok_.setText('確定');
        this.button_cancel_ = this.action_menu_.addChild(new Button(), 180, 0);
        this.button_cancel_.setText('取消');
        this.addChild(this.action_menu_);
        this.head_ = this.addChild(new Head(), -290, 100);
    }

    async onEntrance() {
        this.randomizeRole();
        await this.action_menu_.onEntrance();
    }

    randomizeRole() {
        const role = this.role_;
        if (!role) {
            return;
        }
        const r = new RandomDouble();
        role.MaxHP = 25 + r.rand_int(26);
        role.HP = role.MaxHP;
        role.MaxMP = 25 + r.rand_int(26);
        role.MP = role.MaxMP;
        role.MPType = r.rand_int(2);
        role.IncLife = 1 + r.rand_int(10);
        for (const k of ['Attack', 'Speed', 'Defence', 'Medicine', 'UsePoison', 'Detoxification', 'Fist', 'Sword', 'Knife', 'Unusual', 'HiddenWeapon']) {
            role[k] = 25 + r.rand_int(6);
        }
        role.IQ = 1 + r.rand_int(100);
        for (let i = 0; i < role.EquipMagic.length; i++) {
            role.EquipMagic[i] = role.MagicID[0];
        }
    }

    async onPressedOK() {
        const action = this.action_menu_.getResult();
        if (action < 0) {
            return;
        }
        this.action_menu_.setExit(false);
        this.action_menu_.setResult(-1);
        if (action === 0) {
            this.randomizeRole();
            await this.action_menu_.onEntrance();
        } else if (action === 1) {
            this.exitWithResult(0);
        } else if (action === 2) {
            this.exitWithResult(-1);
        }
    }

    async onPressedCancel() {
        this.exitWithResult(-1);
    }

    draw() {
        Engine.fillColor(C(0, 0, 0, 192), 0, 0, -1, -1);
        this.head_.setRole(this.role_);
        super.draw();
    }
}
