// BattleSceneSekiro: real time battle in the style of Sekiro (BattleSceneSekiro.cpp).
// One magic at a time (switched with left/right), attack, block (perfect
// blocks break the posture of the attacker) and dash; a role whose posture
// is broken can be finished with one hit.
import { Audio } from './Audio.js';
import { AttackEffect, BattleSceneAct, decreaseToZero } from './BattleSceneAct.js';
import { Weather } from './Cloud.js';
import { C, RI } from './Color.js';
import { Engine } from './Engine.js';
import { Event } from './Event.js';
import { GameUtil } from './GameUtil.js';
import { Head } from './Head.js';
import * as K from './Keys.js';
import { EuclidDis, Pointf } from './Point.js';
import { Save } from './Save.js';
import { Scene, TILE_W_0 } from './Scene.js';
import { TextureManager } from './TextureManager.js';
import { Role } from './Types.js';
import { clamp } from './util.js';

const MAX_POSTURE = 100;

export class BattleSceneSekiro extends BattleSceneAct {
    constructor(id) {
        super();
        this.heads_ = [new Head()];
        this.heads_.forEach((h, i) => {
            h.setStyle(2);
            h.setAlwaysLight(1);
            this.addChild(h, 10, 10 + i * 80);
            h.setVisible(false);
        });
        this.heads_[0].setVisible(true);
        this.heads_[0].setRole(Save.getRole(0));
        this.heads_[0].setPosition(10, Engine.getUIHeight() - 100);
        this.head_boss_ = [new Head()];
        for (const h of this.head_boss_) {
            h.setStyle(2);
            h.setVisible(true);
            this.addChild(h);
        }
        this.switch_magic_ = 0;
        this.easy_block_ = GameUtil.getInt('game', 'easy_block', 0);
        if (id !== undefined) {
            this.setID(id);
        }
    }

    draw() {
        this.drawClassicPresentation();
    }

    // roles without an action use their walking pictures when there are some
    adjustClassicRoleDrawInfo(role, info) {
        if (role.ActType < 0 || role.ActType > 4) {
            const path = `walk/walk${String(role.HeadID).padStart(3, '0')}`;
            const count_for_one = Math.trunc(TextureManager.getTextureGroupCount(path) / 4);
            if (count_for_one > 0) {
                info.path = path;
                info.num = role.FaceTowards * count_for_one + (Math.trunc(role.WalkingStep / 5) % count_for_one);
            }
        }
        if (role.Breathless && role.HP > 0) {
            info.breathless = 1;
            info.rot2 = role.CoolDown;
        }
    }

    drawClassicExtraEffects() {
        if (!this.sword_light_) {
            return;
        }
        const tex = TextureManager.getTexture('title', 203);
        if (!tex) {
            return;
        }
        const [ui_w, ui_h] = Engine.getUISize();
        const zoom = ((1.0 * ui_w) / tex.w) * this.sword_light_ / 20;
        const w = Math.trunc(tex.w * zoom);
        const h = Math.trunc(tex.h * zoom);
        const x = Math.trunc(ui_w / 2) - Math.trunc(w / 2);
        const y = Math.trunc(ui_h / 2) - Math.trunc(h / 2) - 40;
        TextureManager.renderTextureByName('title', 203, x, y, RI(this.sword_light_color_, 255, zoom, zoom, 0, 0));
    }

    swordLightYOffset() {
        return -40;
    }

    async dealEvent(e) {
        const engine = Engine;
        const r = this.role_;
        if (!(await this.beginFrame(e))) {
            return;
        }
        decreaseToZero(this, 'sword_light_');
        this.followCamera();
        const speed = Math.min(4.0, r.Speed / 30.0);
        await this.checkAutoAndSurrender(e);
        if (r.Dead === 0) {
            let pos = r.Pos.clone();
            if (r.Frozen === 0 && r.CoolDown === 0 && r.Breathless === 0) {
                pos = this.readMoveInput(r, speed);
            }
            this.readFaceInput(r);
            if (pos.x !== r.Pos.x || pos.y !== r.Pos.y) {
                r.RealTowards = pos.sub(r.Pos);
                r.WalkingStep++;
            }
            if (this.canWalk90(pos, r)) {
                r.Pos = pos;
            }
            // the current magic: the first equipped one, or the first learned one
            let magic = Save.getMagic(r.EquipMagic[0]);
            if (magic && r.getMagicOfRoleIndex(magic) < 0) {
                magic = null;
            }
            if (!magic && r.getLearnedMagicCount() > 0) {
                magic = r.getLearnedMagics()[0];
            }
            const switchMagic = (step) => {
                const v = r.getLearnedMagics();
                if (!v.length) {
                    return;
                }
                let index = v.indexOf(magic) + step;
                if (index < 0) {
                    index = v.length - 1;
                }
                if (index >= v.length) {
                    index = 0;
                }
                r.EquipMagic[0] = v[index].ID;
                this.switch_magic_ = 20;
            };
            if (this.switch_magic_ === 0 && (engine.gameControllerGetButton(K.GAMEPAD_BUTTON_DPAD_LEFT) || engine.checkKeyPress(K.K_LEFT))) {
                switchMagic(-1);
            }
            if (this.switch_magic_ === 0 && (engine.gameControllerGetButton(K.GAMEPAD_BUTTON_DPAD_RIGHT) || engine.checkKeyPress(K.K_RIGHT))) {
                switchMagic(1);
            }
            decreaseToZero(this, 'switch_magic_');
            if (r.Frozen === 0 && r.CoolDown === 0) {
                // 0 attack, 5 block, 3 dash
                let index = -1;
                if (engine.gameControllerGetButton(K.GAMEPAD_BUTTON_RIGHT_SHOULDER) || engine.gameControllerGetButton(K.GAMEPAD_BUTTON_NORTH)
                    || engine.checkKeyPress(K.K_I)) {
                    index = 0;
                }
                if (engine.gameControllerGetButton(K.GAMEPAD_BUTTON_LEFT_SHOULDER) || engine.gameControllerGetButton(K.GAMEPAD_BUTTON_WEST)
                    || engine.checkKeyPress(K.K_E)) {
                    index = 5;
                }
                if (engine.gameControllerGetButton(K.GAMEPAD_BUTTON_SOUTH) || engine.checkKeyPress(K.K_L)) {
                    index = 3;
                }
                if (index >= 0) {
                    r.Auto = 0;
                }
                if (index === 0 && (r.OperationCount >= 3 || this.current_frame_ - r.PreActTimer > 60)) {
                    r.OperationCount = 0;
                }
                if (index >= 0 && index === r.OperationType) {
                    r.OperationCount++;
                }
                if (index !== r.OperationType) {
                    r.OperationCount = 0;
                }
                if (index >= 0) {
                    r.OperationType = index;
                    r.UsingItem = null;
                    r.ActFrame = 0;
                    r.HaveAction = 1;
                    if (magic) {
                        if (index === 0 || index === 5) {
                            r.ActType = magic.MagicType;
                            r.UsingMagic = magic;
                        }
                        r.CoolDown = this.calCoolDown(magic.MagicType, index, r);
                    } else {
                        r.CoolDown = 0;
                    }
                    if (r.OperationCount >= 3 && index === 0) {
                        r.CoolDown *= 2;
                    }
                }
                // blocking needs the button held
                if (r.OperationType === 5 && index < 0) {
                    r.OperationType = 0;
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
        for (const h of this.head_boss_) {
            h.setPosition(30, 40);
        }
        this.addChild(Weather.getInstance());
        await this.setupActBattle(1);
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
            decreaseToZero(r, 'Posture', 0.05);
            decreaseToZero(r, 'Breathless');
            if (r.Posture >= MAX_POSTURE && r.Breathless === 0) {
                // the posture is broken
                r.Breathless = 300;
                r.Shake = 300;
            }
            if (r.Frozen === 0) {
                // the main role walks in dealEvent
                if (r !== this.role_ && !r.Dead && r.Velocity.norm() > 0 && r.Pos.z <= 0) {
                    r.WalkingStep++;
                }
                this.moveByVelocity(r, true);
            }
            decreaseToZero(r, 'CoolDown');
            if (r.OperationType === 5) {
                // blocking lasts while the button is held
            } else if (r.CoolDown === 0) {
                if (!r.Dead) {
                    if (this.current_frame_ % 3 === 0) {
                        r.PhysicalPower += 1;
                    }
                    r.MP += 1;
                    r.ActFrame = 0;
                }
                r.ActType = -1;
                r.HaveAction = 0;
            }
            decreaseToZero(r, 'HurtFrame');
            decreaseToZero(r, 'Attention');
            decreaseToZero(r, 'Invincible');
        }
        for (const r of this.battle_roles_) {
            this.Action(r);
        }
        for (const r of this.battle_roles_) {
            this.AI(r);
        }
        const TILE_W = Scene.TILE_W;
        for (const ae of this.attack_effects_) {
            ae.Frame++;
            ae.Velocity.addSelf(ae.Acceleration);
            ae.Pos.addSelf(ae.Velocity);
            const r = ae.Attacker ? this.findNearestEnemy(ae.Attacker.Team, ae.Pos) : null;
            if (ae.Track && r) {
                const n = ae.Velocity.norm();
                ae.Velocity.addSelf(r.Pos.sub(ae.Pos).normTo(n / 20.0));
                ae.Velocity.normTo(n);
            }
            if (r && !r.HurtFrame && !r.Invincible && r.Dead === 0 && ae.Attacker && r.Team !== ae.Attacker.Team
                && !ae.Defender.has(r) && EuclidDis(r.Pos, ae.Pos) < TILE_W * 2) {
                if (ae.UsingMagic && ae.OperationType !== 5) {
                    Audio.playESound(ae.UsingMagic.EffectID);
                }
                ae.Defender.set(r, (ae.Defender.get(r) || 0) + 1);
                this.shake_ = 5;
                if (ae.OperationType === 0) {
                    Engine.gameControllerRumble(100, 100, 50);
                    this.defaultMagicEffect(ae, r);
                }
            }
        }
        this.attack_effects_ = this.attack_effects_.filter((ae) => ae.Frame < ae.TotalFrame);
        for (const r of this.battle_roles_) {
            this.applyHurtThisFrame(r, 30.0);
            r.Posture = clamp(r.Posture, 0.0, MAX_POSTURE + 1);
        }
        this.updateTextEffects();
        // one enemy more than the team
        if (this.getTeamMateCount(1) < this.getTeamMateCount(0) + 1 && this.enemies_.length) {
            const r = this.enemies_.shift();
            this.battle_roles_.push(r);
            this.head_boss_[0].setRole(r);
            r.Attention = 30;
            r.CoolDown = 30;
            r.Invincible = 30;
        }
        const battle_result = this.checkResult();
        if (battle_result >= 0) {
            if (this.result_ === -1) {
                this.close_up_ = 60;
                this.frozen_ = 60;
                this.slow_ = 30;
                this.shake_ = 60;
                this.paper_shake_ = 60;
                this.result_ = battle_result;
            }
            if (this.slow_ === 0 && (this.result_ === 0 || this.result_ === 1)) {
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
        if (!r.Dead && r.CoolDown === 0) {
            const r1 = this.findNearestEnemy(r.Team, r.Pos);
            if (r1) {
                r.RealTowards = r1.Pos.sub(r.Pos);
            }
        }
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
                ae.setEft(magic.EffectID);
                ae.UsingMagic = magic;
            } else {
                ae.setEft(11);
                magic = Save.getMagic(1);
                ae.UsingMagic = magic;
            }
            // blocking has no sound
            if (r.OperationType === 0) {
                if (magic) {
                    Audio.playASound(magic.SoundID);
                } else {
                    Audio.playESound(r.ActType);
                }
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
            if (ae.OperationType === 0) {
                ae.TotalFrame = 10;
                this.shake_ = 10;
                ae.Velocity = r.RealTowards.clone();
                ae.Velocity.normTo(magic.SelectDistance[level_index] / 2.0);
                ae.Track = 1;
                const r1 = this.findNearestEnemy(r.Team, r.Pos);
                if (r1 && r1.Breathless) {
                    // rush at the enemy whose posture is broken
                    ae.TotalFrame = 30;
                    r.Velocity = r1.Pos.sub(r.Pos);
                    r.RealTowards = r.Velocity.clone();
                    ae.Pos = r.Pos.clone();
                    ae.Velocity = r1.Pos.sub(ae.Pos);
                    const v = Math.min(10.0, r.Speed / 15.0);
                    ae.Velocity.normTo(v);
                    r.Velocity.normTo(v);
                }
                this.attack_effects_.push(ae);
                needMP = Math.trunc(needMP * 0.1);
            } else if (ae.OperationType === 3) {
                const acc = r.RealTowards.clone();
                acc.normTo(Math.min(10.0, r.Speed / 15.0));
                r.Velocity = acc;
                r.Velocity.z = 1;
                r.ActType = -1;
                needMP = Math.trunc(needMP * 0.05);
            }
            r.MP -= needMP;
            r.UsingMagic = null;
        }
        if (r.UsingItem) {
            const item = r.UsingItem;
            if (item.ItemType === 3) {
                r.useItem(item);
            } else if (item.ItemType === 4) {
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
        if (r.OperationType === 5) {
            // the blocking picture is the last frame
            r.ActFrame = 30;
        }
    }

    AI(r) {
        if (!((r !== this.role_ || r.Auto) && r.Dead === 0) || r.CoolDown !== 0 || r.Breathless !== 0) {
            return;
        }
        const TILE_W = Scene.TILE_W;
        if (r.UsingMagic === null) {
            const m = this.chooseMagicForAI(r, (h) => Math.exp(h / 500));
            if (m) {
                r.UsingMagic = m;
            }
        }
        if (r.UsingMagic) {
            r.EquipMagic[0] = r.UsingMagic.ID;
            if (r === this.role_) {
                // blocking is continuous, it is decided again every frame
                r.HaveAction = 0;
                for (const ae of this.attack_effects_) {
                    if (ae.Attacker && ae.Attacker.Team !== r.Team && EuclidDis(r.Pos, ae.Pos) <= TILE_W * 2.1) {
                        r.OperationType = 5;
                        r.HaveAction = 1;
                        r.ActFrame = 30;
                        r.ActType = r.UsingMagic.MagicType;
                        r.CoolDown = 0;
                        break;
                    }
                }
            }
        }
        const r0 = this.findNearestEnemy(r.Team, r.Pos);
        if (!r0 || r.HaveAction) {
            return;
        }
        r.RealTowards = r0.Pos.sub(r.Pos);
        r.RealTowards.normTo(1);
        const dis = TILE_W * 3;
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
                    r.WalkingStep++;
                }
            } else if (r.Velocity.norm() < 0.1) {
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
                if (this.rand_.rand() < 0.5 && EuclidDis(r.Pos, r0.Pos) < TILE_W * 2.5) {
                    // only close attacks
                    const m = r.UsingMagic;
                    r.OperationType = 0;
                    r.CoolDown = this.calCoolDown(m.MagicType, r.OperationType, r);
                    r.ActFrame = 0;
                    r.ActType = m.MagicType;
                    r.HaveAction = 1;
                } else {
                    if (this.rand_.rand() < 0.5) {
                        r.OperationType = 3;
                    }
                    if (r.OperationType === 3) {
                        if (EuclidDis(r.Pos, r0.Pos) < TILE_W * 3) {
                            // move randomly when close
                            r.RealTowards.rotate(Math.PI * 0.75 * (2 * this.rand_.rand() - 1));
                        } else {
                            r.RealTowards = r0.Pos.sub(r.Pos);
                        }
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

    async setRoleInitState(r) {
        await this.setRoleInitStateAct(r);
        r.Posture = 25;
    }

    // the HP bar and the posture bar
    renderExtraRoleInfo(r, x, y) {
        if (!r || r.Dead) {
            return;
        }
        const outline_color = C(0, 0, 0, 128);
        let background_color = r.Team === 1 ? C(255, 0, 0, 128) : C(0, 255, 0, 128);
        const tile_scale = Math.max(1, Math.trunc(Scene.TILE_W / TILE_W_0));
        const hp_max_w = 24 * tile_scale;
        const hp_x = x - Math.trunc(hp_max_w / 2);
        const hp_y = y - 60 * tile_scale;
        const hp_h = 3 * tile_scale;
        const perc = Math.max(0, r.HP / r.MaxHP);
        const alpha = r.HP <= 0 ? this.dead_alpha_ / 255.0 : 1;
        Engine.renderSquareTexture({ x: hp_x - tile_scale, y: hp_y - tile_scale, w: hp_max_w + 2 * tile_scale, h: hp_h + 2 * tile_scale },
            outline_color, Math.trunc(128 * alpha));
        Engine.renderSquareTexture({ x: hp_x, y: hp_y, w: Math.trunc(perc * hp_max_w), h: hp_h }, background_color, Math.trunc(128 * alpha));
        background_color = C(255, 165, 0, 128);
        let posture = Math.trunc((r.Posture * (hp_max_w + 2 * tile_scale)) / MAX_POSTURE);
        posture = Math.trunc(posture / 2) * 2;
        Engine.renderSquareTexture({ x: hp_x + Math.trunc(hp_max_w / 2) - Math.trunc(posture / 2), y: hp_y + 5 * tile_scale, w: posture, h: hp_h - tile_scale },
            background_color, Math.trunc(192 * alpha));
    }

    calCast(act_type, operation_type, r) {
        const v = [10, 20, 15, 2];
        return operation_type >= 0 && operation_type <= 3 ? v[operation_type] : 0;
    }

    calCoolDown(act_type, operation_type, r) {
        const i = r.getActProperty(act_type);
        const v = [100 - Math.trunc(i / 2), 160 - i, 70 - Math.trunc(i / 2), 5, 0];
        const min_v = [20, 45, 30, 5, 0];
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

    defaultMagicEffect(ae, r) {
        if (ae.NoHurt) {
            return;
        }
        if (r === this.role_) {
            this.head_boss_[0].setRole(ae.Attacker);
        }
        if (r === ae.Attacker) {
            this.head_boss_[0].setRole(r);
        }
        let hurt;
        if (ae.UsingHiddenWeapon) {
            hurt = Math.trunc(this.calHiddenWeaponHurt(ae.Attacker, r, ae.UsingHiddenWeapon) / 5);
        } else {
            hurt = this.calMagicHurt(ae.Attacker, r, ae.UsingMagic);
        }
        hurt -= ae.Weaken;
        hurt *= ae.Strengthen;
        hurt *= 1 - (0.5 * ae.Frame) / ae.TotalFrame;
        hurt *= this.angleFactor(ae, r);
        // knocked back
        const v = r.Pos.sub(ae.Attacker.Pos);
        v.normTo(2);
        r.Velocity.addSelf(v);
        if (r.Velocity.norm() > 2) {
            r.Velocity.normTo(2);
        }
        r.HurtFrame = 1;
        if (r.MP >= hurt / 10) {
            r.MP = Math.trunc(r.MP - hurt / 10);
        }
        if (ae.UsingMagic) {
            const act_type = ae.UsingMagic.MagicType;
            if (this.rand_.rand() < r.getActProperty(act_type) / 200.0) {
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
        if (ae.Through === 0) {
            ae.NoHurt = 1;
            ae.Frame = Math.max(ae.TotalFrame - 15, ae.Frame);
        }
        if (r.OperationType === 5) {
            // blocked
            const block_frame = 2;
            const r1 = ae.Attacker;
            const m = Save.getMagic(r1.EquipMagic[0]);
            Audio.playASound(m ? m.SoundID : -1);
            if (r.OperationCount <= block_frame) {
                // perfect block: the posture of the attacker breaks
                let posture = hurt / 2;
                if (posture < 75) {
                    posture = 75;
                }
                ae.Attacker.Posture += posture;
                decreaseToZero(r, 'Posture', posture / 2);
                hurt = 0;
                this.sword_light_ = 30;
                this.sword_light_color_ = C(255, 255, 255, 255);
                ae.Attacker.Velocity = r.RealTowards.sub(ae.Attacker.RealTowards);
                ae.Attacker.Velocity.normTo(2);
                ae.Attacker.CoolDown = 30;
                this.shake_ = 30;
                r.Velocity.normTo(0);
                Audio.playASound(10);
            } else {
                ae.Attacker.Posture += hurt * 0.01;
                r.Posture += hurt * 0.1;
                r.HurtThisFrame = Math.trunc(r.HurtThisFrame + hurt * 0.33);
                this.sword_light_ = 10;
                this.sword_light_color_ = C(255, 255, 255, 255);
                r.Velocity.normTo(0);
                ae.Attacker.ExpGot = Math.trunc(ae.Attacker.ExpGot + hurt / 2);
            }
        } else {
            ae.Attacker.ExpGot = Math.trunc(ae.Attacker.ExpGot + hurt / 2);
            if (ae.UsingHiddenWeapon || ae.UsingMagic.HurtType === 0) {
                if (r.Breathless) {
                    // the finishing blow
                    r.HurtThisFrame = Math.trunc(r.HurtThisFrame + hurt * 10);
                    if (r.HurtThisFrame < r.HP + 100) {
                        r.HurtThisFrame = r.HP + 100;
                    }
                    this.sword_light_ = 40;
                    this.sword_light_color_ = C(255, 0, 0, 255);
                    if (ae.UsingMagic) {
                        Audio.playESound(ae.UsingMagic.EffectID);
                    }
                } else {
                    r.HurtThisFrame = Math.trunc(r.HurtThisFrame + hurt);
                    r.Posture += hurt * 0.2;
                }
            }
            if (ae.UsingMagic && ae.UsingMagic.HurtType === 1) {
                r.MP = Math.trunc(r.MP - hurt);
                ae.Attacker.MP = Math.trunc(ae.Attacker.MP + hurt * 0.8);
            }
        }
    }
}
