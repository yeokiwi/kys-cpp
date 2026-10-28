// BattleSceneHades: real time battle in the style of Hades (BattleSceneHades.cpp).
// j light attack, i heavy attack, k long range, m dash; the four equipped
// magics are used for the four operations.
import { Audio } from './Audio.js';
import { AttackEffect, BattleSceneAct, TextEffect, decreaseToZero } from './BattleSceneAct.js';
import { BattleScene } from './BattleScene.js';
import { Weather } from './Cloud.js';
import { C } from './Color.js';
import { Engine } from './Engine.js';
import { Event } from './Event.js';
import { Head } from './Head.js';
import * as K from './Keys.js';
import { EuclidDis, Pointf } from './Point.js';
import { NodeNormal, NodePass } from './RunNode.js';
import { Save } from './Save.js';
import { Scene, TILE_W_0 } from './Scene.js';
import { Button, Menu, TextBox } from './TextBox.js';
import { Role } from './Types.js';
import { LOG, clamp, textDrawSize } from './util.js';

export class BattleSceneHades extends BattleSceneAct {
    constructor(id) {
        super();
        this.heads_ = [new Head()];
        this.heads_.forEach((h, i) => {
            h.setAlwaysLight(1);
            this.addChild(h, 10, 10 + i * 80);
            h.setVisible(false);
        });
        this.heads_[0].setVisible(true);
        this.heads_[0].setRole(Save.getRole(0));
        this.menu_ = new Menu();
        this.menu_.setPosition(300, 30);
        this.button_magics_ = [new Button(), new Button(), new Button(), new Button()];
        const pos = [[0, 10], [120, 0], [240, 10], [120, 25]];
        this.button_magics_.forEach((b, i) => {
            b.setText('__________');
            this.menu_.addChild(b, pos[i][0], pos[i][1]);
        });
        this.button_item_ = new Button();
        this.button_item_.setText('__________');
        this.menu_.addChild(this.button_item_, 400, 10);
        this.addChild(this.menu_);
        this.menu_.setVisible(false);
        this.head_boss_ = [];
        for (let i = 0; i < 6; i++) {
            const h = new Head();
            h.setStyle(1);
            h.setVisible(false);
            this.addChild(h);
            this.head_boss_.push(h);
        }
        this.show_auto_ = new TextBox();
        this.show_auto_.setText('自動戰鬥');
        this.show_auto_.setFontSize(16);
        this.addChild(this.show_auto_);
        this.show_auto_.setPosition(20, 100);
        this.show_auto_.setVisible(false);
        this.team_heads_ = [];
        this.makeSpecialMagicEffect();
        if (id !== undefined) {
            this.setID(id);
        }
    }

    draw() {
        this.layoutTeamHeads();
        this.drawClassicPresentation();
    }

    layoutTeamHeads() {
        const [ui_width, ui_height] = Engine.getUISize();
        const x = ui_width - 250 - 10;
        this.team_heads_.forEach((h, i) => h.setPosition(x, 10 + 80 * i));
        this.head_boss_.forEach((head, i) => head.setPosition(Math.trunc(ui_width / 2) - Math.trunc(head.getWidth() / 2), ui_height - 50 - 25 * i));
    }

    async dealEvent(e) {
        const engine = Engine;
        const r = this.role_;
        const keys = this.keys_;
        this.show_auto_.setVisible(!!r.Auto);
        if (!(await this.beginFrame(e))) {
            return;
        }
        this.followCamera();
        const speed = Math.min(4.0, r.Speed / 30.0);
        await this.checkAutoAndSurrender(e);
        if (r.Dead === 0) {
            let pos = r.Pos.clone();
            if (r.Frozen === 0 && r.CoolDown === 0) {
                pos = this.readMoveInput(r, speed);
            }
            this.readFaceInput(r);
            // the role faces where it wants to go, even if it cannot
            if (pos.x !== r.Pos.x || pos.y !== r.Pos.y) {
                r.RealTowards = pos.sub(r.Pos);
            }
            r.Pos = pos;
            const magic = [];
            for (let i = 0; i < 4; i++) {
                let m = Save.getMagic(r.EquipMagic[i]);
                if (m && r.getMagicOfRoleIndex(m) < 0) {
                    m = null;
                }
                magic.push(m);
                this.button_magics_[i].setState(NodeNormal);
            }
            const item = Save.getItem(r.EquipItem);
            if (item) {
                this.button_item_.setText(`${item.Name} ${Save.getItemCountInBag(item.ID)}`);
            }
            if (r.Frozen === 0 && r.CoolDown === 0) {
                let index = -1;
                if (r.PhysicalPower >= 10 && (engine.checkKeyPress(keys.Light) || engine.gameControllerGetButton(K.GAMEPAD_BUTTON_WEST)
                    || (e.type === K.EVENT_MOUSE_BUTTON_DOWN && e.button.button === K.BUTTON_LEFT))) {
                    index = 0;
                }
                if (r.PhysicalPower >= 30 && (engine.checkKeyPress(keys.Heavy) || engine.gameControllerGetButton(K.GAMEPAD_BUTTON_NORTH)
                    || (e.type === K.EVENT_MOUSE_BUTTON_DOWN && e.button.button === K.BUTTON_MIDDLE))) {
                    index = 1;
                }
                if (r.PhysicalPower >= 20 && (engine.checkKeyPress(keys.Long) || engine.gameControllerGetButton(K.GAMEPAD_BUTTON_EAST)
                    || (e.type === K.EVENT_MOUSE_BUTTON_DOWN && e.button.button === K.BUTTON_RIGHT))) {
                    index = 2;
                }
                if (r.PhysicalPower >= 10 && (engine.checkKeyPress(keys.Slash) || engine.gameControllerGetButton(K.GAMEPAD_BUTTON_SOUTH))) {
                    index = 3;
                }
                if (r.PhysicalPower >= 40 && item && (engine.checkKeyPress(keys.Item) || engine.gameControllerGetButton(K.GAMEPAD_BUTTON_RIGHT_SHOULDER))) {
                    index = 4;
                }
                if (index >= 0) {
                    r.Auto = 0;
                }
                if (r.OperationCount >= 3 || this.current_frame_ - r.PreActTimer > 60) {
                    r.OperationCount = 0;
                }
                if (index >= 0 && index === r.OperationType) {
                    r.OperationCount++;
                }
                if (index >= 0 && index < magic.length && magic[index]) {
                    r.OperationType = index;
                    this.button_magics_[index].setState(NodePass);
                    const m = magic[index];
                    r.ActType = m.MagicType;
                    r.UsingMagic = m;
                    r.UsingItem = null;
                    r.ActFrame = 0;
                    r.HaveAction = 1;
                    r.CoolDown = this.calCoolDown(m.MagicType, index, r);
                    if (r.OperationCount >= 3 && index === 0) {
                        r.CoolDown *= 2;
                    }
                }
                if (index === 4 && item) {
                    r.OperationType = index;
                    r.UsingMagic = null;
                    r.UsingItem = item;
                    r.ActFrame = 0;
                    r.HaveAction = 1;
                    r.CoolDown = 64;
                }
            }
        }
        await this.backRun1();
    }

    async dealEvent2(e) {}

    async onEntrance() {
        this.calViewRegion();
        if (!this.info_) {
            this.exitWithResult(1);
            return;
        }
        Audio.playMusic(this.info_.Music);
        this.head_self_.setPosition(10, 10);
        this.addChild(Weather.getInstance());
        await this.setupActBattle(6);
        for (const r of this.friends_) {
            if (r && r !== this.heads_[0].getRole()) {
                const head = new Head();
                head.setRole(r);
                head.setAlwaysLight(true);
                this.team_heads_.push(head);
                this.addChild(head);
            }
        }
        this.layoutTeamHeads();
        this.button_magics_.forEach((b, i) => {
            let m = Save.getMagic(this.role_.EquipMagic[i]);
            if (m && this.role_.getMagicOfRoleIndex(m) < 0) {
                m = null;
            }
            b.setText(m ? m.Name + ' '.repeat(Math.max(0, 10 - textDrawSize(m.Name))) : '__________');
        });
        this.menu_.setVisible(true);
    }

    async onExit() {}

    async backRun1() {
        if (this.slow_ > 0) {
            if (this.current_frame_ % 4) {
                return;
            }
            this.slow_--;
        }
        for (const r of this.battle_roles_) {
            r.HurtThisFrame = 0;
            for (const m of r.getLearnedMagics()) {
                const f = this.special_magic_effect_every_frame_.get(m.Name);
                if (f) {
                    f(r);
                }
            }
            decreaseToZero(r, 'Frozen');
            decreaseToZero(r, 'Shake');
            if (r.Frozen > 0) {
                continue;
            }
            this.moveByVelocity(r, false);
            decreaseToZero(r, 'CoolDown');
            if (r.CoolDown === 0) {
                if (this.current_frame_ % 3 === 0) {
                    r.PhysicalPower += 1;
                }
                r.MP += 1;
                r.ActFrame = 0;
                r.ActType = -1;
                r.HaveAction = 0;
            }
            decreaseToZero(r, 'HurtFrame');
            decreaseToZero(r, 'Attention');
            decreaseToZero(r, 'Invincible');
        }
        for (const r of this.battle_roles_) {
            this.Action(r);
            this.AI(r);
        }
        const TILE_W = Scene.TILE_W;
        for (const ae of this.attack_effects_) {
            ae.Frame++;
            ae.Velocity.addSelf(ae.Acceleration);
            ae.Pos.addSelf(ae.Velocity);
            const r = ae.Attacker ? this.findNearestEnemy(ae.Attacker.Team, ae.Pos) : null;
            if (ae.Track && r) {
                // tracking the nearest enemy
                const n = ae.Velocity.norm();
                ae.Velocity.addSelf(r.Pos.sub(ae.Pos).normTo(n / 20.0));
                ae.Velocity.normTo(n);
            }
            // hits an enemy
            if (r && !r.HurtFrame && !r.Invincible && r.Dead === 0 && ae.Attacker && r.Team !== ae.Attacker.Team
                && !ae.Defender.has(r) && EuclidDis(r.Pos, ae.Pos) <= TILE_W * 2) {
                if (ae.UsingMagic) {
                    Audio.playESound(ae.UsingMagic.EffectID);
                }
                ae.Defender.set(r, (ae.Defender.get(r) || 0) + 1);
                this.shake_ = 5;
                r.Frozen = 20;
                r.Shake = 20;
                if (ae.OperationType >= 0) {
                    Engine.gameControllerRumble(100, 100, 50);
                    this.defaultMagicEffect(ae, r);
                }
            }
        }
        // effects of the two teams cancel each other
        const aes = this.attack_effects_;
        if (aes.length >= 2) {
            for (let i = 0; i < aes.length - 2; i++) {
                const ae1 = aes[i];
                if (!ae1.UsingMagic) {
                    continue;
                }
                for (let j = i + 1; j < aes.length - 1; j++) {
                    const ae2 = aes[j];
                    if (!ae2.UsingMagic) {
                        continue;
                    }
                    if (ae1.NoHurt === 0 && ae2.NoHurt === 0 && ae1.Attacker && ae2.Attacker
                        && ae1.Attacker.Team !== ae2.Attacker.Team && EuclidDis(ae1.Pos, ae2.Pos) < TILE_W * 4) {
                        const hurt1 = this.calMagicHurt(ae1.Attacker, ae2.Attacker, ae1.UsingMagic);
                        const hurt2 = this.calMagicHurt(ae2.Attacker, ae1.Attacker, ae2.UsingMagic);
                        ae1.Weaken += hurt2;
                        ae2.Weaken += hurt1;
                        if (ae1.Weaken > hurt1) {
                            ae1.NoHurt = 1;
                            ae1.Frame = Math.max(ae1.TotalFrame - 5, ae1.Frame);
                        }
                        if (ae2.Weaken > hurt2) {
                            ae2.NoHurt = 1;
                            ae2.Frame = Math.max(ae2.TotalFrame - 5, ae2.Frame);
                        }
                    }
                }
            }
        }
        this.attack_effects_ = this.attack_effects_.filter((ae) => ae.Frame < ae.TotalFrame);
        for (const r of this.battle_roles_) {
            this.applyHurtThisFrame(r);
        }
        this.updateTextEffects();
        // the next enemy comes
        if (this.getTeamMateCount(1) < 5 && this.enemies_.length) {
            const r = this.enemies_.shift();
            this.battle_roles_.push(r);
            r.Attention = 30;
            r.CoolDown = 30;
            r.Invincible = 30;
        }
        // the HP bars of the last enemies
        if (this.enemies_.length < this.head_boss_.length) {
            this.head_boss_.forEach((h, i) => {
                if (i >= this.enemies_.length) {
                    h.setVisible(true);
                }
            });
        }
        const battle_result = this.checkResult();
        if (battle_result >= 0) {
            if (this.result_ === -1) {
                this.close_up_ = 60;
                this.frozen_ = 60;
                this.slow_ = 40;
                this.shake_ = 60;
                this.paper_shake_ = 60;
                this.result_ = battle_result;
            }
            if (this.slow_ === 0 && (this.result_ === 0 || this.result_ === 1)) {
                this.menu_.setVisible(false);
                await this.calExpGot();
                this.setExit(true);
            }
        }
    }

    Action(r) {
        if (!r.HaveAction) {
            return;
        }
        const TILE_W = Scene.TILE_W;
        if (r.OperationType >= 0 && r.ActFrame === this.calCast(r.ActType, r.OperationType, r)) {
            r.PreActTimer = this.current_frame_;
            for (const m of r.getLearnedMagics()) {
                const f = this.special_magic_effect_attack_.get(m.Name);
                if (f) {
                    f(r);
                }
            }
            let magic = this.chooseMagicForAction(r);
            const ae = new AttackEffect();
            if (magic) {
                Audio.playASound(magic.SoundID);
                ae.setEft(magic.EffectID);
                ae.UsingMagic = magic;
            } else {
                Audio.playESound(r.ActType);
                ae.setEft(11);
                magic = Save.getMagic(1);
                ae.UsingMagic = magic;
            }
            r.PhysicalPower = clamp(r.PhysicalPower - 3, 0, Role.getMaxValue().PhysicalPower);
            const level_index = r.getMagicLevelIndex(magic.ID);
            let needMP = magic.calNeedMP(level_index);
            ae.TotalFrame = 30;
            ae.Attacker = r;
            r.RealTowards.normTo(1);
            ae.Pos = r.Pos.add(r.RealTowards.mul(TILE_W * 2.0));
            ae.Frame = 0;
            ae.OperationType = r.OperationType;
            if (!(r.Team === 0 && r === this.role_) && r.OperationType === -1) {
                // the AI attacks according to the area of the magic
                const t = ae.UsingMagic.AttackAreaType;
                if (t === 0) {
                    ae.OperationType = 0;
                } else if (t === 1 || t === 2) {
                    ae.OperationType = 2;
                } else if (t === 3) {
                    ae.OperationType = 1;
                }
            }
            const index = r.getMagicOfRoleIndex(ae.UsingMagic);
            if (index >= 0) {
                r.MagicLevel[index] = Math.trunc(clamp(r.MagicLevel[index] + this.rand_.rand() * 2 + 1, 0, 999));
            }
            // the attack effects depend on the operation
            if (ae.OperationType === 0) {
                ae.TotalFrame = 10;
                if (r.OperationCount === 3 && magic.AttackAreaType === 0) {
                    // the third hit of a combo
                    ae.TotalFrame = 30;
                    this.shake_ = 10;
                    ae.Strengthen = 2;
                    ae.Velocity = r.RealTowards.clone();
                    ae.Velocity.normTo(magic.SelectDistance[level_index] / 2.0);
                    ae.Track = 1;
                }
                this.attack_effects_.push(ae.clone());
                needMP = Math.trunc(needMP * 0.1);
            } else if (ae.OperationType === 1) {
                const range = magic.AttackAreaType === 3 ? 1 : 0;
                const count = 1 + range;
                const p = ae.Pos.clone();
                ae.TotalFrame = 120;
                const angle = r.RealTowards.getAngle();
                for (let i = 0; i < count; i++) {
                    // "5 / 180" is an integer division in the C++ code
                    const a = angle + (this.rand_.rand() * 10 / 180) * Math.PI;
                    ae.Pos = p.clone();
                    ae.Velocity = new Pointf(Math.cos(a), Math.sin(a));
                    ae.Velocity.normTo(3);
                    ae.Frame = Math.trunc(this.rand_.rand() * 10);
                    ae.Track = 1;
                    this.attack_effects_.push(ae.clone());
                }
                needMP = Math.trunc(needMP * 0.4);
            } else if (ae.OperationType === 2) {
                const r0 = this.findNearestEnemy(r.Team, r.Pos);
                if (r0) {
                    ae.Velocity = r0.Pos.sub(r.Pos);
                    r.RealTowards = ae.Velocity.clone();
                } else {
                    ae.Velocity = r.RealTowards.clone();
                }
                ae.Velocity.normTo(5);
                ae.TotalFrame = 15 + magic.SelectDistance[level_index] * 5;
                const line = magic.AttackAreaType === 1 || magic.AttackAreaType === 2;
                if (line) {
                    ae.Through = 1;
                }
                this.attack_effects_.push(ae.clone());
                needMP = Math.trunc(needMP * 0.2);
                if (line) {
                    let v = 5;
                    const angle = ae.Velocity.getAngle();
                    for (let i = 0; i < 2; i++) {
                        v -= 0.5;
                        const a = angle + (this.rand_.rand() * 30 / 180) * Math.PI;
                        ae.Velocity = new Pointf(Math.cos(a), Math.sin(a));
                        ae.Velocity.normTo(v);
                        ae.Through = 1;
                        ae.Strengthen = 0.5;
                        this.attack_effects_.push(ae.clone());
                    }
                }
            } else if (ae.OperationType === 3) {
                // dash
                const acc = r.RealTowards.clone();
                acc.normTo(Math.min(4.0, r.Speed / 30.0) * 1.7);
                r.Velocity = acc;
                r.ActType = 0;
                const p = ae.Pos.clone();
                const count = Math.min(3, Math.trunc((r.Speed + r.getActProperty(ae.UsingMagic.MagicType)) / 60));
                for (let i = 0; i < count; i++) {
                    ae.Pos = p.add(r.Velocity.mul((i - 1) * 2));
                    ae.Frame += 3;
                    this.attack_effects_.push(ae.clone());
                }
                needMP = Math.trunc(needMP * 0.05);
            }
            LOG(`${ae.Attacker.Name} use ${ae.UsingMagic.Name} as ${ae.OperationType}`);
            r.MP -= needMP;
            r.UsingMagic = null;
        }
        if (r.UsingItem) {
            const item = r.UsingItem;
            if (item.ItemType === 3) {
                // medicine is taken at once
                r.useItem(item);
            } else if (item.ItemType === 4) {
                // hidden weapon
                const ae1 = new AttackEffect();
                const r0 = this.findFarthestEnemy(r.Team, r.Pos);
                ae1.Velocity = r0 ? r0.Pos.sub(r.Pos) : r.RealTowards.clone();
                ae1.Velocity.normTo(10);
                ae1.Attacker = r;
                ae1.Pos = r.Pos.clone();
                ae1.UsingHiddenWeapon = item;
                ae1.Through = 0;
                ae1.setEft(item.HiddenWeaponEffectID);
                ae1.TotalFrame = 100;
                ae1.Frame = 0;
                ae1.OperationType = 4;
                this.attack_effects_.push(ae1);
            }
            Event.getInstance().addItemWithoutHint(item.ID, -1);
            r.UsingItem = null;
        }
        r.ActFrame++;
        if (r.OperationType === 1 && r.ActFrame === 7) {
            this.shake_ = 1;
            this.paper_shake_ = 1;
        }
    }

    // the AI also plays the main role in automatic mode
    AI(r) {
        if (!((r !== this.role_ || r.Auto) && r.Dead === 0) || r.CoolDown !== 0) {
            return;
        }
        const TILE_W = Scene.TILE_W;
        if (r.UsingMagic === null) {
            if (r === this.role_) {
                // the main role uses only the equipped magics, with the same probability
                const v = [];
                for (const id of r.EquipMagic) {
                    const m = Save.getMagic(id);
                    if (m && r.getMagicOfRoleIndex(m) >= 0) {
                        v.push(m);
                    }
                }
                if (v.length) {
                    r.UsingMagic = v[Math.trunc(this.rand_.rand() * v.length)];
                }
            } else {
                // other roles use all their magics, the stronger more often
                const m = this.chooseMagicForAI(r, (h) => h);
                if (m) {
                    r.UsingMagic = m;
                }
            }
        }
        const r0 = this.findNearestEnemy(r.Team, r.Pos);
        if (!r0) {
            return;
        }
        r.RealTowards = r0.Pos.sub(r.Pos);
        r.RealTowards.normTo(1);
        let dis = TILE_W * 3;
        if (r.UsingMagic) {
            if (r.UsingMagic.AttackAreaType === 3) {
                dis = 180;
            }
            if (r.UsingMagic.AttackAreaType === 1 || r.UsingMagic.AttackAreaType === 2) {
                dis = 300;
            }
        }
        const speed = r.Speed / 30.0;
        const canDash = () => this.rand_.rand() < 0.25 && r.Speed >= 60
            && ((r !== this.role_ && r.UsingMagic) || (r === this.role_ && r.getEquipMagicOfRoleIndex(r.UsingMagic) === 3));
        const dash = () => {
            r.CoolDown = this.calCoolDown(r.UsingMagic.MagicType, r.OperationType, r);
            r.ActFrame = 0;
            r.HaveAction = 1;
        };
        if (EuclidDis(r.Pos, r0.Pos) > dis) {
            const p = r.Pos.add(r.RealTowards.mul(speed));
            if (this.canWalk90(p, r) && r.FindingWay === 0) {
                r.OperationType = canDash() ? 3 : -1;
                if (r.OperationType === 3) {
                    dash();
                } else {
                    r.Pos = p;
                }
            } else if (r.Velocity.norm() < 0.1) {
                // find a way around the obstacles
                const p_target = this.findWayTarget(r, r0);
                r.FindingWay = 1;
                r.RealTowards = p_target.sub(r.Pos);
                r.OperationType = canDash() ? 3 : -1;
                if (r.OperationType === 3) {
                    dash();
                } else {
                    r.RealTowards = p_target.sub(r.Pos);
                    r.RealTowards.normTo(1);
                    r.Velocity = r.RealTowards.mul(speed);
                }
            }
        } else {
            r.FindingWay = 0;
            if (r.PhysicalPower >= 30 && r.UsingMagic) {
                const m = r.UsingMagic;
                if (m.AttackAreaType === 0 || (this.rand_.rand() < 0.75 && m.AttackAreaType !== 0)) {
                    // attack
                    if (r === this.role_) {
                        r.OperationType = r.getEquipMagicOfRoleIndex(m);
                    } else if (m.AttackAreaType === 0) {
                        r.OperationType = 0;
                    } else if (m.AttackAreaType === 1 || m.AttackAreaType === 2) {
                        r.OperationType = 2;
                    } else if (m.AttackAreaType === 3) {
                        r.OperationType = 1;
                    }
                    r.CoolDown = this.calCoolDown(m.MagicType, r.OperationType, r);
                    r.ActFrame = 0;
                    r.ActType = m.MagicType;
                    r.HaveAction = 1;
                } else {
                    if (r !== this.role_ && this.rand_.rand() < 0.25) {
                        r.OperationType = 3;
                    }
                    if (r.OperationType === 3) {
                        // move randomly to make it less predictable
                        r.RealTowards.rotate(Math.PI * 0.75 * (2 * this.rand_.rand() - 1));
                        dash();
                    }
                }
                if (!r.HaveAction) {
                    r.RealTowards.rotate(Math.PI * 0.5 * (2 * this.rand_.rand() - 1));
                    r.Velocity = r.RealTowards.clone();
                    r.Velocity.normTo(speed);
                }
            }
        }
    }

    async onPressedCancel() {}

    renderExtraRoleInfo(r, x, y) {
        if (!r || r.Dead) {
            return;
        }
        const outline_color = C(0, 0, 0, 128);
        const background_color = r.Team === 1 ? C(255, 0, 0, 128) : C(0, 255, 0, 128);
        const tile_scale = Math.max(1, Math.trunc(Scene.TILE_W / TILE_W_0));
        const hp_max_w = 24 * tile_scale;
        const hp_x = x - Math.trunc(hp_max_w / 2);
        const hp_y = y - 60 * tile_scale;
        const hp_h = 3 * tile_scale;
        const perc = Math.max(0, r.HP / r.MaxHP);
        const alpha = r.HP <= 0 ? this.dead_alpha_ / 255.0 : 1;
        Engine.renderSquareTexture({ x: hp_x - tile_scale, y: hp_y - tile_scale, w: hp_max_w + 2 * tile_scale, h: hp_h + 2 * tile_scale },
            outline_color, Math.trunc(128 * alpha));
        Engine.renderSquareTexture({ x: hp_x, y: hp_y, w: Math.trunc(perc * hp_max_w), h: hp_h }, background_color, Math.trunc(192 * alpha));
    }

    async setRoleInitState(r) {
        await this.setRoleInitStateAct(r);
    }

    // the wind-up of an attack
    calCast(act_type, operation_type, r) {
        const v = [10, 20, 15, 5];
        return operation_type >= 0 && operation_type <= 3 ? v[operation_type] : 0;
    }

    // the cool down; minus the wind-up it is the recovery
    calCoolDown(act_type, operation_type, r) {
        const i = r.getActProperty(act_type);
        const v = [60 - Math.trunc(i / 2), 160 - i, 70 - Math.trunc(i / 2), 10];
        const min_v = [20, 45, 30, 10];
        if (operation_type >= 0 && operation_type <= 3) {
            let c = Math.max(min_v[operation_type], v[operation_type]);
            if (r.AttackTwice > 0) {
                c = Math.trunc(c * 0.666);
                c = Math.max(this.calCast(act_type, operation_type, r) + 2, c);
            }
            return c;
        }
        return 0;
    }

    // the real time battle hurts less with each hit
    calMagicHurt(r1, r2, magic, dis = -1) {
        return Math.trunc(BattleScene.prototype.calMagicHurt.call(this, r1, r2, magic, 1) / 20.0);
    }

    defaultMagicEffect(ae, r) {
        if (ae.NoHurt) {
            return;
        }
        let hurt;
        if (ae.UsingHiddenWeapon) {
            hurt = Math.trunc(this.calHiddenWeaponHurt(ae.Attacker, r, ae.UsingHiddenWeapon) / 5);
        } else {
            hurt = this.calMagicHurt(ae.Attacker, r, ae.UsingMagic);
        }
        hurt -= ae.Weaken;
        hurt *= ae.Strengthen;
        // weaker with the distance
        hurt *= 1 - (0.5 * ae.Frame) / ae.TotalFrame;
        hurt *= this.angleFactor(ae, r);
        if (ae.OperationType === 1) {
            hurt *= 1.5;
        }
        if (ae.OperationType === 3) {
            hurt /= 1.5;
            r.Frozen += 5;
        }
        // knocked back
        const v = r.Pos.sub(ae.Attacker.Pos);
        v.normTo(2);
        r.Velocity.addSelf(v);
        if (r.Velocity.norm() > 3) {
            r.Velocity.normTo(3);
        }
        r.HurtFrame = 1;
        // internal force avoids being stunned
        if (r.MP >= hurt / 10) {
            r.MP = Math.trunc(r.MP - hurt / 10);
        } else {
            r.Frozen += 10;
        }
        if (ae.UsingMagic) {
            const act_type = ae.UsingMagic.MagicType;
            if (this.rand_.rand() < r.getActProperty(act_type) / 200.0) {
                if (act_type === 1) {
                    r.Frozen += 10;
                }
                if (act_type === 2) {
                    ae.Attacker.CoolDown = Math.trunc(ae.Attacker.CoolDown * 0.5);
                }
                if (act_type === 3) {
                    hurt *= 1.5;
                }
                if (act_type === 4) {
                    const p = new Pointf(this.rand_.rand(), this.rand_.rand(), 0);
                    p.normTo(1);
                    r.Velocity.addSelf(p);
                }
            }
        }
        hurt += 5 * (this.rand_.rand() - this.rand_.rand());
        if (hurt <= 0) {
            hurt = 1 + this.rand_.rand() * 3;
        }
        // without piercing, the effect stops hurting and fades out
        if (ae.Through === 0) {
            ae.NoHurt = 1;
            ae.Frame = Math.max(ae.TotalFrame - 15, ae.Frame);
        }
        ae.Attacker.ExpGot = Math.trunc(ae.Attacker.ExpGot + hurt / 2);
        if (ae.UsingHiddenWeapon || ae.UsingMagic.HurtType === 0) {
            r.HurtThisFrame = Math.trunc(r.HurtThisFrame + hurt);
        }
        if (ae.UsingMagic && ae.UsingMagic.HurtType === 1) {
            r.MP = Math.trunc(r.MP - hurt);
            ae.Attacker.MP = Math.trunc(ae.Attacker.MP + hurt * 0.8);
            const te = new TextEffect();
            te.set(String(Math.trunc(-hurt)), C(160, 32, 240, 255), r);
            this.text_effects_.push(te);
        }
    }

    makeSpecialMagicEffect() {}
}
