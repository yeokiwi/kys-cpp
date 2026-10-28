// BattleCursor: selects positions on the battle field (BattleCursor.cpp).
// The AI targets are also applied here.
import { Engine } from './Engine.js';
import { Head } from './Head.js';
import * as K from './Keys.js';
import { RunNode } from './RunNode.js';
import { Scene } from './Scene.js';
import { UIStatus } from './UI.js';

export class BattleCursor extends RunNode {
    static Other = -1;
    static Move = 0;
    static Action = 1;
    static Check = 2;

    constructor(b) {
        super();
        this.role_ = null;
        this.magic_ = null;
        this.level_index_ = 0;
        this.mode_ = BattleCursor.Move;
        this.head_selected_ = new Head();
        this.addChild(this.head_selected_);
        this.ui_status_ = new UIStatus();
        this.ui_status_.setVisible(false);
        this.ui_status_.setShowButton(false);
        this.addChild(this.ui_status_, 300, 0);
        this.battle_scene_ = b;
    }

    setRoleAndMagic(r, m = null, l = 0) {
        this.role_ = r;
        this.magic_ = m;
        this.level_index_ = l;
        this.head_selected_.setRole(r);
    }

    getHead() {
        return this.head_selected_;
    }

    getUIStatus() {
        return this.ui_status_;
    }

    setMode(m) {
        this.mode_ = m;
    }

    getMode() {
        return this.mode_;
    }

    async dealEvent(e) {
        const engine = Engine;
        const bs = this.battle_scene_;
        if (bs === null || this.role_.isAuto()) {
            return;
        }
        let x = -1;
        let y = -1;
        const move = (x0, y0, tw) => {
            const p = Scene.getTowardsPosition(x0, y0, tw);
            if (p) {
                [x, y] = p;
            }
        };
        // lines start from the role
        const line = this.magic_ && this.magic_.AttackAreaType === 1;
        if (e.type === K.EVENT_KEY_DOWN) {
            const tw = bs.getTowardsByKey(e.key.key);
            if (line) {
                move(this.role_.X(), this.role_.Y(), tw);
            } else {
                move(bs.selectX(), bs.selectY(), tw);
            }
        }
        if (e.type === K.EVENT_MOUSE_MOTION) {
            const u = engine.windowToUISpace(e.motion.x, e.motion.y, false);
            if (u.inside) {
                if (line) {
                    move(this.role_.X(), this.role_.Y(), bs.getTowardsByMouse(u.x, u.y));
                } else {
                    const p = bs.getMousePosition(u.x, u.y, this.role_.X(), this.role_.Y());
                    x = p.x;
                    y = p.y;
                }
            }
        }
        for (const [button, key] of [[K.GAMEPAD_BUTTON_DPAD_UP, K.K_UP], [K.GAMEPAD_BUTTON_DPAD_DOWN, K.K_DOWN],
            [K.GAMEPAD_BUTTON_DPAD_LEFT, K.K_LEFT], [K.GAMEPAD_BUTTON_DPAD_RIGHT, K.K_RIGHT]]) {
            if (engine.gameControllerGetButton(button)) {
                move(bs.selectX(), bs.selectY(), bs.getTowardsByKey(key));
            }
        }
        this.setCursor(x, y);
    }

    setCursor(x, y) {
        const bs = this.battle_scene_;
        if (bs.canSelect(x, y)) {
            bs.setSelectPosition(x, y);
            if (this.head_selected_.getVisible()) {
                this.head_selected_.setRole(bs.getRoleLayer().data(x, y));
            }
            if (this.ui_status_.getVisible()) {
                this.ui_status_.setRole(bs.getRoleLayer().data(x, y));
            }
        }
        if (this.mode_ === BattleCursor.Action) {
            bs.calEffectLayer(this.role_, bs.selectX(), bs.selectY(), this.magic_, this.level_index_);
        }
    }

    async onEntrance() {
        const bs = this.battle_scene_;
        if (bs === null) {
            this.setExit(true);
            this.setVisible(!this.exit_);
            return;
        }
        const [w, h] = Engine.getUISize();
        this.head_selected_.setPosition(w - 400, h - 150);
        bs.towards_ = this.role_.FaceTowards;
        if (this.mode_ === BattleCursor.Action) {
            bs.calEffectLayer(this.role_, bs.selectX(), bs.selectY(), this.magic_, this.level_index_);
        }
        if (this.role_.isAuto()) {
            let x = -1;
            let y = -1;
            if (this.mode_ === BattleCursor.Move) {
                x = this.role_.AI_MoveX;
                y = this.role_.AI_MoveY;
            } else if (this.mode_ === BattleCursor.Action) {
                x = this.role_.AI_ActionX;
                y = this.role_.AI_ActionY;
            }
            this.setResult(0);
            this.setExit(true);
            this.setVisible(!this.exit_);
            this.setCursor(x, y);
        }
    }

    async onPressedOK() {
        this.exitWithResult(0);
    }

    async onPressedCancel() {
        this.exitWithResult(-1);
    }
}
