// Battle menus used outside of battles too: the magic list and the hidden
// weapon list (BattleMenu.cpp). The action menu with the AI is in
// BattleActionMenu.js.
import { Save } from './Save.js';
import { MenuText } from './TextBox.js';
import { ROLE_MAGIC_COUNT } from './Types.js';
import { format, textDrawSize } from './util.js';

function padName(s) {
    return s + ' '.repeat(Math.max(0, 12 - textDrawSize(s)));
}

function hideEmpty(menu) {
    for (const child of menu.childs_) {
        const [w] = child.getSize();
        if (w <= 0) {
            child.setVisible(false);
        }
    }
}

export class BattleMagicMenu extends MenuText {
    constructor() {
        super();
        this.role_ = null;
        this.magic_ = null;
        this.setPosition(160, 200);
    }

    setRole(r) {
        this.role_ = r;
        this.result_ = -1;
        this.magic_ = null;
        this.setVisible(true);
        const magic_names = [];
        for (let i = 0; i < ROLE_MAGIC_COUNT; i++) {
            const m = Save.getRoleLearnedMagic(this.role_, i);
            if (m) {
                magic_names.push(format('{}{:2}  ', padName(m.Name), this.role_.getRoleShowLearnedMagicLevel(i)));
            } else {
                magic_names.push('');
            }
        }
        this.setStrings(magic_names);
        hideEmpty(this);
        this.arrange(0, 0, 0, 30);
    }

    async runAsRole(r) {
        this.setRole(r);
        return await this.run();
    }

    getMagic() {
        return this.magic_;
    }

    async onEntrance() {
        if (this.role_ === null) {
            return;
        }
        this.forceActiveChild();
    }

    async onPressedOK() {
        this.checkActiveToResult();
        this.magic_ = Save.getRoleLearnedMagic(this.role_, this.result_);
        if (this.magic_) {
            this.setExit(true);
        }
    }

    async onPressedCancel() {
        this.magic_ = null;
        this.exitWithResult(-1);
    }
}

export class BattleEquipItemMenu extends MenuText {
    constructor() {
        super();
        this.role_ = null;
        this.item_ = null;
        this.setPosition(20, 20);
    }

    setRole(r) {
        this.role_ = r;
        this.result_ = -1;
        this.item_ = null;
        this.setVisible(true);
        const item_names = Save.getAvailableEquipItems().map(([item, count]) => format('{}{:3}  ', padName(item.Name), count));
        this.setStrings(item_names);
        hideEmpty(this);
        this.arrange(0, 0, 0, 30);
    }

    async runAsRole(r) {
        this.setRole(r);
        return await this.run();
    }

    getItem() {
        return this.item_;
    }

    async onEntrance() {}

    async onPressedOK() {
        this.checkActiveToResult();
        if (this.result_ >= 0) {
            this.item_ = Save.getAvailableEquipItems()[this.result_][0];
        }
        if (this.item_) {
            this.setExit(true);
        }
    }

    async onPressedCancel() {
        this.item_ = null;
        this.exitWithResult(-1);
    }
}
