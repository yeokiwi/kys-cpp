// BattleSceneAct: base of the real time battles (BattleSceneAct.cpp).
// Positions are physical coordinates seen from above; on screen y is halved:
// x_pix = x_phy, y_pix = y_phy / 2 - z_phy.
import { makeMapSquareInt } from './BattleMap.js';
import { BattleScene, eftPath, fightPath } from './BattleScene.js';
import { C, RI } from './Color.js';
import { Engine } from './Engine.js';
import { Font } from './Font.js';
import * as K from './Keys.js';
import { EuclidDis, Pointf, Towards_LeftDown, Towards_LeftUp, Towards_RightDown, Towards_RightUp, realTowardsToFaceTowards } from './Point.js';
import { Save } from './Save.js';
import { Scene, TILE_W_0 } from './Scene.js';
import { TeamMenu } from './TeamMenu.js';
import { MenuText } from './TextBox.js';
import { TextureManager } from './TextureManager.js';
import { ROLE_MAGIC_COUNT } from './Types.js';
import { UIKeyConfig } from './UIConfig.js';
import { clamp, textDrawSize } from './util.js';

export class AttackEffect {
    constructor() {
        this.Pos = new Pointf();
        this.Velocity = new Pointf();
        this.Acceleration = new Pointf();
        this.Attacker = null;
        // every role can be hit only once by an effect
        this.Defender = new Map();
        this.UsingMagic = null;
        this.UsingHiddenWeapon = null;
        this.Frame = 0;
        this.TotalFrame = 1;
        this.TotalEffectFrame = 1;
        this.OperationType = -1;
        this.Path = '';
        this.FollowRole = null;
        this.Weaken = 0;
        this.Strengthen = 1;
        this.Track = 0;
        this.Through = 0;
        this.NoHurt = 0;
    }

    // copy, like pushing a struct into a std::deque
    clone() {
        const ae = Object.assign(new AttackEffect(), this);
        ae.Pos = this.Pos.clone();
        ae.Velocity = this.Velocity.clone();
        ae.Acceleration = this.Acceleration.clone();
        ae.Defender = new Map(this.Defender);
        return ae;
    }

    setEft(num) {
        this.setPath(eftPath(num));
    }

    setPath(p) {
        this.Path = p;
        this.TotalEffectFrame = TextureManager.getTextureGroupCount(p);
    }
}

export class TextEffect {
    constructor() {
        this.Pos = new Pointf();
        this.PaperPos = new Pointf();
        this.Text = '';
        this.Size = 30;
        this.Frame = 0;
        this.PaperRise = 0;
        this.color = C(255, 255, 255, 255);
        // 0: rises slowly, 1: stays
        this.Type = 0;
    }

    set(text, c, r) {
        this.Text = text;
        this.color = c;
        if (r) {
            this.PaperPos = r.Pos.clone();
            this.Pos = r.Pos.clone();
            this.Pos.x -= 7.5 * textDrawSize(this.Text);
            this.Pos.y -= 50;
        }
    }
}

export function decreaseToZero(o, k, v = 1) {
    if (o[k] > 0) {
        o[k] -= v;
    }
    if (o[k] < 0) {
        o[k] = 0;
    }
}

export class BattleSceneAct extends BattleScene {
    constructor() {
        super();
        this.isBattleSceneAct = true;
        this.pos_ = new Pointf();
        this.gravity_ = -4;
        this.friction_ = 0.1;
        this.keys_ = { ...UIKeyConfig.getKeyConfig() };
        this.attack_effects_ = [];
        this.text_effects_ = [];
        this.enemies_ = [];
        this.enemies_obj_ = [];
        this.heads_ = [];
        this.head_boss_ = [];
        this.is_running_ = false;
        this.role_ = null;
        this.dying_ = null;
        this.weapon_ = 1;
        this.frozen_ = 0;
        this.slow_ = 0;
        this.shake_ = 0;
        this.paper_shake_ = 0;
        this.close_up_ = 0;
        this.sword_light_ = 0;
        this.sword_light_color_ = C(255, 255, 255, 255);
        this.special_magic_effect_every_frame_ = new Map();
        this.special_magic_effect_attack_ = new Map();
        this.special_magic_effect_beat_ = new Map();
    }

    backRun() {}

    usePaperPresentation() {
        return false;
    }

    handlePaperPresentationEvent(e) {}

    canWalk45(x, y) {
        return !(this.isOutLine(x, y) || this.isBuilding(x, y) || this.isWater(x, y));
    }

    // canWalk90(x, y) or canWalk90(p, role, dis)
    canWalk90(p, r, dis = -1) {
        if (!(p instanceof Pointf)) {
            const p45 = this.pos90To45(p, r);
            return this.canWalk45(p45.x, p45.y);
        }
        if (r.Pos.z > 1) {
            return true;
        }
        if (dis === -1) {
            dis = Scene.TILE_W * 1.5;
        }
        for (const r1 of this.battle_roles_) {
            if (r1 === r || r1.Dead) {
                continue;
            }
            const dis1 = EuclidDis(p, r1.Pos);
            if (dis1 < dis) {
                const dis0 = EuclidDis(r.Pos, r1.Pos);
                if (dis0 >= dis1) {
                    return false;
                }
            }
        }
        const p45 = this.pos90To45(p.x, p.y);
        return this.canWalk45(p45.x, p45.y);
    }

    canWalk(x, y) {
        return this.canWalk45(x, y);
    }

    findNearestEnemy(team, p) {
        let nearest = null;
        let nearest_distance = Number.MAX_VALUE;
        for (const role of this.battle_roles_) {
            if (role && role.Team !== team && role.Dead === 0) {
                const distance = EuclidDis(role.Pos, p);
                if (distance < nearest_distance) {
                    nearest = role;
                    nearest_distance = distance;
                }
            }
        }
        return nearest;
    }

    findFarthestEnemy(team, p) {
        let dis = 0;
        let r0 = null;
        for (const r1 of this.battle_roles_) {
            if (r1.Dead === 0 && team !== r1.Team) {
                const dis1 = EuclidDis(p, r1.Pos);
                if (dis1 > dis) {
                    dis = dis1;
                    r0 = r1;
                }
            }
        }
        return r0;
    }

    // hooks of the classic drawing
    adjustClassicRoleDrawInfo(role, info) {}

    drawClassicExtraEffects() {}

    swordLightYOffset() {
        return 0;
    }

    // the textures of the roles, their magic effects and the blood effects
    async preloadActTextures(roles) {
        const groups = new Set(['eft/eft011', 'smap', 'title']);
        for (let i = 0; i < 5; i++) {
            groups.add(`eft/bld${String(i).padStart(3, '0')}`);
        }
        for (const r of roles) {
            groups.add(fightPath(r.HeadID));
            groups.add(`walk/walk${String(r.HeadID).padStart(3, '0')}`);
            for (let i = 0; i < ROLE_MAGIC_COUNT; i++) {
                const m = Save.getMagic(r.MagicID[i]);
                if (m) {
                    groups.add(eftPath(m.EffectID));
                }
            }
            const items = [Save.getItem(r.EquipItem), ...r.TakingItem.map((id) => Save.getItem(id))];
            for (const item of items) {
                if (item && item.ItemType === 4) {
                    groups.add(eftPath(item.HiddenWeaponEffectID));
                }
            }
        }
        const m1 = Save.getMagic(1);
        if (m1) {
            groups.add(eftPath(m1.EffectID));
        }
        await TextureManager.ensureGroups([...groups]);
        // the images arrive while the battle starts
        for (const g of groups) {
            if (g.startsWith('fight/') || g.startsWith('eft/')) {
                TextureManager.preloadAll(g);
            }
        }
    }

    drawClassicPresentation() {
        const engine = Engine;
        const TILE_W = Scene.TILE_W;
        const TILE_H = Scene.TILE_H;
        const N = this.COORD_COUNT;
        const white = C(255, 255, 255, 255);
        engine.setRenderTarget('scene');
        engine.fillColor(C(0, 0, 0, 255), 0, 0, this.render_center_x_ * 2, this.render_center_y_ * 2);
        {
            const p = this.pos90To45(this.pos_.x, this.pos_.y);
            this.man_x_ = p.x;
            this.man_y_ = p.y;
        }
        const whole_scene = engine.getTexture('whole_scene');
        if (!whole_scene) {
            engine.renderTextureToMain('scene');
            this.drawClassicExtraEffects();
            return;
        }
        engine.setRenderTarget(whole_scene);
        engine.fillColor(C(0, 0, 0, 255), 0, 0, N * TILE_W * 2, N * TILE_H * 2);
        const vs = this.view_sum_region_;
        const vw = this.view_width_region_;
        const earth_tex = engine.getTexture('earth');
        if (earth_tex) {
            engine.setColor(earth_tex, white);
            const w = this.render_center_x_ * 2;
            const h = this.render_center_y_ * 2;
            const rect0 = { x: Math.trunc(this.pos_.x - this.render_center_x_ - this.x_), y: Math.trunc(this.pos_.y / 2 - this.render_center_y_ - this.y_), w, h };
            const rect1 = { ...rect0 };
            rect0.y += TILE_H * 2;
            if (rect0.x < 0) {
                rect1.x -= rect0.x;
                rect0.x = 0;
            }
            if (rect0.y < 0) {
                rect1.y -= rect0.y;
                rect0.y = 0;
            }
            if (rect0.x + rect0.w > N * TILE_W * 2) {
                rect1.w -= rect0.x + rect0.w - N * TILE_W * 2;
                rect0.w = N * TILE_W * 2 - rect0.x;
            }
            if (rect0.y + rect0.h > N * TILE_H * 2) {
                rect1.h -= rect0.y + rect0.h - N * TILE_H * 2;
                rect0.h = N * TILE_H * 2 - rect0.y;
            }
            engine.renderTextureLight(earth_tex, rect0, rect1, [white, white, white, white], [0.25, 0, 0, 0]);
        } else {
            for (let sum = -vs; sum <= vs + 15; sum++) {
                for (let i = -vw; i <= vw; i++) {
                    const ix = this.man_x_ + i + Math.trunc(sum / 2);
                    const iy = this.man_y_ - i + (sum - Math.trunc(sum / 2));
                    if (!this.isOutLine(ix, iy)) {
                        const p = this.pos45To90(ix, iy);
                        const num = Math.trunc(this.earth_layer_.data(ix, iy) / 2);
                        if (num > 0) {
                            TextureManager.renderTextureByName('smap', num, Math.trunc(p.x), Math.trunc(p.y / 2), RI(white));
                        }
                    }
                }
            }
        }
        const draw_infos = [];
        const newInfo = () => ({
            path: '', num: 0, p: new Pointf(), color: white, alpha: 255, rot: 0, rot2: 0, shadow: 0, white: 0,
            breathless: 0, draw_turn: 1, is_wall: false, is_effect: false,
        });
        for (let sum = -vs; sum <= vs + 15; sum++) {
            for (let i = -vw; i <= vw; i++) {
                const ix = this.man_x_ + i + Math.trunc(sum / 2);
                const iy = this.man_y_ - i + (sum - Math.trunc(sum / 2));
                if (!this.isOutLine(ix, iy)) {
                    const num = Math.trunc(this.building_layer_.data(ix, iy) / 2);
                    if (num > 0) {
                        const info = newInfo();
                        info.path = 'smap';
                        info.num = num;
                        info.p = this.pos45To90(ix, iy);
                        info.is_wall = Scene.isWallTile(num);
                        draw_infos.push(info);
                    }
                }
            }
        }
        for (const r of this.battle_roles_) {
            const info = newInfo();
            info.path = fightPath(r.HeadID);
            info.p = r.Pos.clone();
            if (this.result_ === -1 && r.Shake) {
                info.p.x += -2.5 + this.rand_.rand() * 5;
            }
            r.FaceTowards = realTowardsToFaceTowards(r.RealTowards);
            info.num = this.calRolePic(r, r.ActType, r.ActFrame);
            if (r.Dead) {
                info.rot = r.FaceTowards >= 2 ? 90 : 270;
                info.draw_turn = 0;
            }
            if (r.Attention) {
                info.alpha = 255 - r.Attention * 4;
            }
            info.shadow = 1;
            this.adjustClassicRoleDrawInfo(r, info);
            draw_infos.push(info);
        }
        for (const ae of this.attack_effects_) {
            const info = newInfo();
            info.path = ae.Path;
            info.num = ae.TotalEffectFrame > 0 ? ae.Frame % ae.TotalEffectFrame : 0;
            info.p = (ae.FollowRole ? ae.FollowRole.Pos : ae.Pos).clone();
            info.is_effect = true;
            info.shadow = ae.Attacker && ae.Attacker.Team === 0 ? 2 : 1;
            info.alpha = Math.trunc((255 * (ae.TotalFrame * 1.25 - ae.Frame)) / (ae.TotalFrame * 1.25)) & 255;
            draw_infos.push(info);
        }
        draw_infos.sort((d1, d2) => (d1.p.y !== d2.p.y ? d1.p.y - d2.p.y : d1.p.x - d2.p.x));
        // shadows
        for (const d of draw_infos) {
            if (!d.shadow) {
                continue;
            }
            const tex = TextureManager.getTexture(d.path, d.num);
            if (!tex) {
                continue;
            }
            let scalex = 1;
            let scaley = 0.3;
            let yd = Math.trunc(tex.dy * 0.7);
            if (d.rot) {
                scalex = 0.3;
                scaley = 1;
                yd = Math.trunc(tex.dy * 0.1);
            }
            const x = Math.trunc(d.p.x);
            const y = Math.trunc(d.p.y / 2 + yd);
            if (d.shadow === 1) {
                TextureManager.renderTexture(tex, x, y, RI(C(32, 32, 32, 255), d.alpha >> 1, scalex, scaley, d.rot));
            }
            if (d.shadow === 2) {
                TextureManager.renderTexture(tex, x, y, RI(C(128, 128, 128, 255), d.alpha >> 1, scalex, scaley, d.rot2, 128));
            }
        }
        const tile_scale = Math.max(1, Math.trunc(TILE_W / TILE_W_0));
        for (let turn = 0; turn < 2; turn++) {
            for (const d of draw_infos) {
                if (d.draw_turn !== turn) {
                    continue;
                }
                const scaley = d.rot ? 0.5 : 1;
                const brightness_v = (d.alpha === 255 && !d.is_wall) || d.is_effect ? [0.5, 0, 0, 0] : [];
                TextureManager.renderTextureByName(d.path, d.num, Math.trunc(d.p.x), Math.trunc(d.p.y / 2 - d.p.z),
                    RI(d.color, d.alpha, scaley, 1, d.rot, d.white, [], brightness_v));
                if (d.breathless) {
                    TextureManager.renderTextureByName('title', 205, Math.trunc(d.p.x - 5), Math.trunc(d.p.y / 2 - d.p.z - 36 * tile_scale),
                        RI(white, 255, 0.1, 0.1, d.rot2, 0));
                }
            }
        }
        for (const r of this.battle_roles_) {
            this.renderExtraRoleInfo(r, Math.trunc(r.Pos.x), Math.trunc(r.Pos.y / 2));
        }
        engine.setColor(whole_scene, white);
        const w = this.render_center_x_ * 2;
        const h = this.render_center_y_ * 2;
        const rect0 = { x: Math.trunc(this.pos_.x - this.render_center_x_ - this.x_), y: Math.trunc(this.pos_.y / 2 - this.render_center_y_ - this.y_), w, h };
        const rect1 = { x: 0, y: 0, w, h };
        if (rect0.x < 0) {
            rect1.x = -rect0.x;
            rect0.x = 0;
            rect0.w = w - rect1.x;
        }
        if (rect0.y < 0) {
            rect1.y = -rect0.y;
            rect0.y = 0;
            rect0.h = h - rect1.y;
        }
        rect0.w = Math.min(rect0.w, N * TILE_W * 2 - rect0.x);
        rect0.h = Math.min(rect0.h, N * TILE_H * 2 - rect0.y);
        rect1.w = rect0.w;
        rect1.h = rect0.h;
        const [w_ui, h_ui] = engine.getUISize();
        for (const te of this.text_effects_) {
            const x = Math.trunc((te.Pos.x * w_ui) / this.render_center_x_ / 2) - rect0.x;
            const y = Math.trunc((te.Pos.y * h_ui) / this.render_center_y_ / 2 / 2) - rect0.y;
            Font.draw(te.Text, te.Size, x, y, te.color, 255);
        }
        engine.setRenderTarget('scene');
        if (this.close_up_) {
            rect0.w = Math.trunc(rect0.w / 2);
            rect0.h = Math.trunc(rect0.h / 2);
            rect0.x += Math.trunc(rect0.w / 2);
            rect0.y += Math.trunc(rect0.h / 2) - 20 * tile_scale;
        }
        engine.renderTextureRect(whole_scene, rect0, rect1, 0);
        engine.renderTextureToMain('scene');
        this.drawClassicExtraEffects();
    }

    // the damage text and the blood effect of the accumulated hurt of this frame
    showHurtThisFrame(r, hurt) {
        const te = new TextEffect();
        te.set(String(-hurt), r.Team === 0 ? C(255, 20, 20, 255) : C(255, 255, 255, 255), r);
        this.text_effects_.push(te);
        const ae1 = new AttackEffect();
        ae1.FollowRole = r;
        ae1.setPath(`eft/bld${String(Math.trunc(this.rand_.rand() * 5)).padStart(3, '0')}`);
        ae1.TotalFrame = ae1.TotalEffectFrame;
        ae1.Frame = 0;
        this.attack_effects_.push(ae1);
    }

    updateTextEffects() {
        for (const te of this.text_effects_) {
            if (te.Type === 0) {
                te.Pos.y -= 2;
                te.PaperRise += 2;
            }
            te.Frame++;
        }
        this.text_effects_ = this.text_effects_.filter((te) => te.Frame < 30);
    }

    // the setup common to Hades and Sekiro: enemies come one after another,
    // the main role always fights
    async setupActBattle(first_enemies) {
        const engine = Engine;
        const info = this.info_;
        await this.makeEarthTexture();
        engine.createRenderedTexture('whole_scene', this.COORD_COUNT * Scene.TILE_W * 2, this.COORD_COUNT * Scene.TILE_H * 2);
        for (let i = 0; i < info.Enemy.length; i++) {
            const r_ptr = Save.getRole(info.Enemy[i]);
            if (r_ptr) {
                // enemies are copies, the same role can appear several times
                const r = r_ptr.clone();
                r.resetBattleInfo();
                this.enemies_obj_.push(r);
                this.enemies_.push(r);
                r.setPositionOnly(info.EnemyX[i], info.EnemyY[i]);
                r.Team = 1;
                await this.readFightFrame(r);
                r.FaceTowards = this.rand_.rand_int(4);
                this.man_x_ = r.X();
                this.man_y_ = r.Y();
            }
        }
        for (const r of this.enemies_) {
            await this.setRoleInitState(r);
        }
        if (this.enemies_.length) {
            this.pos_ = this.enemies_[0].Pos.clone();
        }
        // weaker enemies come first
        this.enemies_.sort((l, r) => (l.MaxHP + l.Attack) - (r.MaxHP + r.Attack));
        for (let i = 0; i < this.head_boss_.length; i++) {
            if (this.enemies_.length >= i + 1) {
                const r = this.enemies_[this.enemies_.length - i - 1];
                if (r.MaxHP >= 300 || r === this.enemies_[this.enemies_.length - 1]) {
                    this.head_boss_[i].setRole(r);
                }
            }
        }
        for (let i = 0; i < first_enemies; i++) {
            if (this.enemies_.length) {
                this.battle_roles_.push(this.enemies_.shift());
            }
        }
        if (info.AutoTeamMate[0] >= 0) {
            for (const id of info.AutoTeamMate) {
                const r = Save.getRole(id);
                if (r) {
                    this.friends_.push(r);
                    r.Auto = 2;
                }
            }
        }
        const team_menu = new TeamMenu();
        team_menu.setMode(1);
        team_menu.setForceMainRole(true);
        await team_menu.run();
        for (const r of team_menu.getRoles()) {
            if (!this.friends_.includes(r)) {
                this.friends_.push(r);
            }
        }
        this.role_ = Save.getRole(0);
        if (!this.friends_.includes(this.role_)) {
            this.friends_.unshift(this.role_);
        }
        for (let i = 0; i < this.friends_.length; i++) {
            const r = this.friends_[i];
            if (r) {
                r.resetBattleInfo();
                this.battle_roles_.push(r);
                r.setPositionOnly(info.TeamMateX[i], info.TeamMateY[i]);
                r.Team = 0;
                await this.setRoleInitState(r);
            }
        }
        await this.preloadActTextures([...this.battle_roles_, ...this.enemies_]);
    }

    // the state at the start of a real time battle
    async setRoleInitStateAct(r) {
        await super.setRoleInitState(r);
        r.HP = r.MaxHP;
        r.MP = r.MaxMP;
        r.PhysicalPower = Math.max(r.PhysicalPower, 90);
        const p = this.pos45To90(r.X(), r.Y());
        r.Pos.x = p.x;
        r.Pos.y = p.y;
        const towards = [[1, -1], [1, 1], [-1, -1], [-1, 1]][r.FaceTowards];
        if (towards) {
            r.RealTowards = new Pointf(towards[0], towards[1]);
        }
        r.Acceleration = new Pointf(0, 0, this.gravity_);
    }

    // the real time battles end when one team is gone, including the enemies waiting
    checkResult() {
        const team0 = this.getTeamMateCount(0);
        const team1 = this.enemies_.length + this.getTeamMateCount(1);
        if (team0 > 0 && team1 === 0) {
            return 0;
        }
        if (team0 === 0 && team1 >= 0) {
            return 1;
        }
        return -1;
    }

    // the pictures stay on the last frame of the action
    calRolePic(r, style, frame) {
        if (style < 0 || style >= 5) {
            for (let i = 0; i < 5; i++) {
                if (r.FightFrame[i] > 0) {
                    return r.FightFrame[i] * r.FaceTowards;
                }
            }
        }
        if (!(r.FightFrame[style] > 0)) {
            // choose an existing action, otherwise the attack would not show
            for (let i = 0; i < 5; i++) {
                if (r.FightFrame[i] > 0) {
                    style = i;
                }
            }
        }
        let total = 0;
        for (let i = 0; i < 5; i++) {
            if (i === style) {
                if (frame < r.FightFrame[style] - 2) {
                    return total + r.FightFrame[style] * r.FaceTowards + frame;
                }
                return total + r.FightFrame[style] * r.FaceTowards + r.FightFrame[style] - 2;
            }
            total += r.FightFrame[i] * 4;
        }
        return r.FaceTowards;
    }

    // the menu to give up the battle
    async askSurrender() {
        const menu2 = new MenuText();
        menu2.setStrings(['確認', '取消']);
        menu2.setPosition(400, 300);
        menu2.setFontSize(24);
        menu2.setHaveBox(true);
        menu2.setText('認輸？');
        menu2.arrange(0, 50, 150, 0);
        if ((await menu2.run()) === 0) {
            this.result_ = 1;
            for (const r of this.friends_) {
                r.ExpGot = 0;
            }
            this.setExit(true);
        }
    }

    // walking with the left stick and the keyboard; returns the wanted position
    readMoveInput(r, speed) {
        const engine = Engine;
        const keys = this.keys_;
        const pos = r.Pos.clone();
        let axis_x = engine.gameControllerGetAxis(K.GAMEPAD_AXIS_LEFTX);
        let axis_y = engine.gameControllerGetAxis(K.GAMEPAD_AXIS_LEFTY);
        if (Math.abs(axis_x) < 6000) {
            axis_x = 0;
        }
        if (Math.abs(axis_y) < 6000) {
            axis_y = 0;
        }
        if (axis_x !== 0 || axis_y !== 0) {
            axis_x = clamp(axis_x, -20000, 20000);
            axis_y = clamp(axis_y, -20000, 20000);
            const axis = new Pointf(axis_x / 20000, axis_y / 20000);
            r.RealTowards = axis.clone();
            axis.normTo(speed);
            pos.addSelf(axis);
        }
        const direct = new Pointf();
        if (engine.checkKeyPress(keys.Left) || engine.checkKeyPress(K.K_LEFT)) {
            direct.x = -1;
            r.FaceTowards = Towards_LeftDown;
        }
        if (engine.checkKeyPress(keys.Right) || engine.checkKeyPress(K.K_RIGHT)) {
            direct.x = 1;
            r.FaceTowards = Towards_RightUp;
        }
        if (engine.checkKeyPress(keys.Up) || engine.checkKeyPress(K.K_UP)) {
            direct.y = -1;
            r.FaceTowards = Towards_LeftUp;
        }
        if (engine.checkKeyPress(keys.Down) || engine.checkKeyPress(K.K_DOWN)) {
            direct.y = 1;
            r.FaceTowards = Towards_RightDown;
        }
        direct.normTo(speed);
        pos.addSelf(direct);
        return pos;
    }

    // diagonal keys
    readFaceInput(r) {
        const engine = Engine;
        const keys = this.keys_;
        if ((engine.checkKeyPress(keys.Up) && engine.checkKeyPress(keys.Right))
            || (engine.checkKeyPress(K.K_UP) && engine.checkKeyPress(K.K_RIGHT))) {
            r.FaceTowards = Towards_RightUp;
        }
        if ((engine.checkKeyPress(keys.Down) && engine.checkKeyPress(keys.Left))
            || (engine.checkKeyPress(K.K_DOWN) && engine.checkKeyPress(K.K_LEFT))) {
            r.FaceTowards = Towards_LeftDown;
        }
    }

    // the common start of a frame: camera, shaking, auto battle and surrender
    // returns false when the frame is frozen
    async beginFrame(e) {
        const engine = Engine;
        const r = this.role_;
        if (this.shake_ > 0) {
            this.x_ = this.rand_.rand_int(3) - this.rand_.rand_int(3);
            this.y_ = this.rand_.rand_int(3) - this.rand_.rand_int(3);
            this.shake_--;
        }
        if (this.frozen_ > 0) {
            this.frozen_--;
            engine.gameControllerRumble(100, 100, 50);
            return false;
        }
        decreaseToZero(this, 'close_up_');
        return true;
    }

    followCamera() {
        const r = this.role_;
        if (this.close_up_ === 0) {
            if (r.Dead) {
                for (const r1 of this.battle_roles_) {
                    if (r1.Team === 0 && r1.Dead === 0) {
                        this.pos_ = r1.Pos.clone();
                    }
                }
            } else {
                this.pos_ = r.Pos.clone();
            }
        }
    }

    async checkAutoAndSurrender(e) {
        const r = this.role_;
        if ((e.type === K.EVENT_KEY_UP && e.key.key === K.K_TAB)
            || (e.type === K.EVENT_GAMEPAD_BUTTON_UP && e.gbutton.button === K.GAMEPAD_BUTTON_BACK)) {
            r.Auto = r.Auto === 0 ? 1 : 0;
        }
        if ((e.type === K.EVENT_KEY_UP && e.key.key === K.K_ESCAPE)
            || (e.type === K.EVENT_GAMEPAD_BUTTON_UP && e.gbutton.button === K.GAMEPAD_BUTTON_START)) {
            await this.askSurrender();
        }
    }

    // physics of a role: velocity, friction and gravity
    moveByVelocity(r, sekiro) {
        const p = r.Pos.add(r.Velocity);
        const dis = r.OperationType === 3 ? 1 : -1;
        if (this.canWalk90(p, r, dis)) {
            r.Pos = p;
        } else {
            r.Velocity = new Pointf(0, 0, 0);
        }
        if (r.Pos.z < 0) {
            r.Pos.z = 0;
        }
        const on_ground = sekiro ? r.Pos.z <= 0 : r.Pos.z === 0;
        if (on_ground && r.Velocity.norm() !== 0) {
            const f = r.Velocity.neg();
            if (sekiro) {
                f.z = 0;
            }
            f.normTo(this.friction_);
            r.Acceleration = new Pointf(f.x, f.y, this.gravity_);
        } else {
            r.Acceleration = new Pointf(0, 0, this.gravity_);
        }
        const prev_v = r.Velocity.clone();
        r.Velocity.addSelf(r.Acceleration);
        if (sekiro) {
            // friction cannot reverse the motion
            if (prev_v.x * r.Velocity.x < 0) {
                r.Velocity.x = 0;
            }
            if (prev_v.y * r.Velocity.y < 0) {
                r.Velocity.y = 0;
            }
        }
        if (r.Pos.z === 0) {
            r.Velocity.z = 0;
        }
        if (r.Velocity.norm() < 0.1) {
            r.Velocity.x = 0;
            r.Velocity.y = 0;
        }
    }

    // the accumulated hurt of this frame; returns after updating HP
    applyHurtThisFrame(r, max_dead_speed) {
        const hurt = r.HurtThisFrame;
        if (hurt > 0) {
            this.showHurtThisFrame(r, hurt);
            r.HP -= hurt;
            if (r.HP <= 0) {
                r.Dead = 1;
                r.HP = 0;
                // the role is knocked away
                r.Velocity.normTo(15);
                r.Velocity.z = 12;
                r.Velocity.normTo(max_dead_speed === undefined ? hurt / 2.0 : Math.min(hurt / 2.0, max_dead_speed));
                r.Frozen = 5;
                this.x_ = this.rand_.rand_int(2) - this.rand_.rand_int(2);
                this.y_ = this.rand_.rand_int(2) - this.rand_.rand_int(2);
                this.pos_ = r.Pos.clone();
                this.frozen_ = 5;
                this.shake_ = 10;
                this.paper_shake_ = 10;
                this.slow_ = 10;
                this.close_up_ = 30;
            }
        }
        r.HP = clamp(r.HP, 0, r.MaxHP);
        r.MP = clamp(r.MP, 0, r.MaxMP);
        r.PhysicalPower = clamp(r.PhysicalPower, 0, 100);
    }

    // the magic used when the role has none: one of its magics of the current action type
    chooseMagicForAction(r) {
        if (r.UsingMagic) {
            return r.UsingMagic;
        }
        const v = [];
        for (let i = 0; i < ROLE_MAGIC_COUNT; i++) {
            if (r.MagicID[i] > 0) {
                const m = Save.getMagic(r.MagicID[i]);
                if (m && m.MagicType === r.ActType) {
                    v.push(m);
                }
            }
        }
        return v.length ? v[Math.trunc(this.rand_.rand() * v.length)] : null;
    }

    // the AI chooses a magic, more likely the stronger ones (Hades: linear, Sekiro: exponential)
    chooseMagicForAI(r, weight) {
        const v = r.getLearnedMagics();
        if (v.length === 1) {
            return v[0];
        }
        const hurt = [];
        let sum = 0;
        for (const m of v) {
            const h = weight(m.Attack[r.getMagicLevelIndex(m)]);
            hurt.push(sum + h);
            sum += h;
        }
        const select = this.rand_.rand() * sum;
        for (let i = 0; i < hurt.length; i++) {
            if (select < hurt[i]) {
                return v[i];
            }
        }
        return null;
    }

    // finds a way around obstacles to the enemy, one tile at a time
    findWayTarget(r, r0) {
        const dis_layer = makeMapSquareInt(this.COORD_COUNT);
        const p_enemy45 = this.pos90To45(r0.Pos.x, r0.Pos.y);
        this.calDistanceLayer(p_enemy45.x, p_enemy45.y, dis_layer, 64);
        const p_self45 = this.pos90To45(r.Pos.x, r.Pos.y);
        let max_dis45 = 4096;
        let p_target = r.Pos.clone();
        for (let x = p_self45.x - 1; x <= p_self45.x + 1; x++) {
            for (let y = p_self45.y - 1; y <= p_self45.y + 1; y++) {
                if (this.isOutLine(x, y) || this.calDistance(x, y, p_self45.x, p_self45.y) !== 1) {
                    continue;
                }
                const p1 = this.pos45To90(x, y);
                const dis1 = dis_layer.data(x, y) + (this.rand_.rand() - this.rand_.rand());
                if (this.canWalk90(p1, r) && dis1 < max_dis45) {
                    max_dis45 = Math.trunc(dis1);
                    p_target = p1;
                }
            }
        }
        return p_target;
    }

    // the angle between the attack and the facing of the defender: attacks from the side or behind hurt more
    angleFactor(ae, r) {
        const atk_dir = ae.Pos.sub(r.Pos);
        const angle = Math.acos((atk_dir.x * r.RealTowards.x + atk_dir.y * r.RealTowards.y) / atk_dir.norm() / r.RealTowards.norm());
        if (angle >= Math.PI * 0.25 && angle < Math.PI * 0.75) {
            return 1.5;
        } else if (angle >= Math.PI * 0.75) {
            return 2;
        }
        return 1;
    }
}
