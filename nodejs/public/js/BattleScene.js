// BattleScene: the turn based (and semi real time) battle (BattleScene.cpp).
// The "paper" 3D presentation and network battles of the desktop version are
// not available in the browser.
import { Audio } from './Audio.js';
import { BattleActionMenu, BattleItemMenu } from './BattleActionMenu.js';
import { BattleCursor } from './BattleCursor.js';
import { BATTLE_ENEMY_COUNT, BATTLEMAP_COORD_COUNT, BattleMap, makeMapSquareInt } from './BattleMap.js';
import { BattleMagicMenu } from './BattleMenu.js';
import { Weather } from './Cloud.js';
import { C, RI } from './Color.js';
import { Engine } from './Engine.js';
import { Event } from './Event.js';
import { Font } from './Font.js';
import { GameUtil } from './GameUtil.js';
import { Head } from './Head.js';
import * as K from './Keys.js';
import { Point, Pointf, Towards_None } from './Point.js';
import { NodePass } from './RunNode.js';
import { Save } from './Save.js';
import { Scene, TILE_W_0 } from './Scene.js';
import { ShowExp, ShowRoleDifference } from './ShowExp.js';
import { TeamMenu } from './TeamMenu.js';
import { TextBox } from './TextBox.js';
import { TextureManager } from './TextureManager.js';
import { MAX_MAGIC_LEVEL, MapSquare, ROLE_MAGIC_COUNT, Role, TEAMMATE_COUNT } from './Types.js';
import { UIRenderer } from './UIRenderer.js';
import { LOG, RandomDouble, clamp, findNumbers, format, sign, textDrawSize, utf8Length } from './util.js';

// the battle data is needed as soon as a battle is created
await BattleMap.load();

export const TimingPromptState = { Ready: 0, Press: 1, Success: 2 };

const animation_delay_ = 2;

export function fightPath(head_id) {
    return format('fight/fight{:03}', head_id);
}

export function eftPath(effect_id) {
    return format('eft/eft{:03}', effect_id);
}

function copyShow(s) {
    return { ...s, ShowStrings: s.ShowStrings.map((x) => ({ ...x })) };
}

function emptyShow() {
    return { ShowStrings: [], BattleHurt: 0, ProgressChange: 0, Effect: -1 };
}

export class BattleScene extends Scene {
    constructor(id) {
        super();
        // flags used by the virtual stick
        this.isBattleScene = true;
        this.rand_ = new RandomDouble();
        this.full_window_ = 1;
        this.COORD_COUNT = BATTLEMAP_COORD_COUNT;
        this.battle_id_ = 0;
        this.info_ = null;
        this.save_ = Save;
        this.battle_roles_ = [];
        this.friends_ = [];
        this.acting_role_ = null;
        this.earth_layer_ = makeMapSquareInt(this.COORD_COUNT);
        this.building_layer_ = makeMapSquareInt(this.COORD_COUNT);
        this.select_layer_ = makeMapSquareInt(this.COORD_COUNT);
        this.effect_layer_ = makeMapSquareInt(this.COORD_COUNT);
        this.role_layer_ = new MapSquare(this.COORD_COUNT);
        this.select_type_ = 0;
        this.select_x_ = 0;
        this.select_y_ = 0;
        this.show_number_y_ = 0;
        this.effect_id_ = -1;
        this.effect_frame_ = 0;
        this.effect_attack_area_type_ = -1;
        this.dead_alpha_ = 255;
        this.actionAnimation_ = null;
        this.fail_exp_ = false;
        this.semi_real_ = 0;
        this.expedition33_ = 0;
        this.prev_block_pressed_ = false;
        this.block_role_offsets_ = new Map();
        this.block_light_overlay_ = { roles: [], frame: -1, total_frames: 0 };
        this.point_magic_overlay_ = { position: new Point(), magics: [], frame: -1, total_frames: 0 };
        this.layer_magic_overlay_ = { magic: null, frame: -1, total_frames: 0 };
        this.battle_menu_ = new BattleActionMenu(this);
        this.battle_menu_.setPosition(160, 200);
        this.head_self_ = new Head();
        this.addChild(this.head_self_);
        this.battle_cursor_ = new BattleCursor(this);
        this.prev_music_ = Audio.getCurrentMusic();
        this.easy_block_ = GameUtil.getInt('game', 'easy_block', 0);
        if (id !== undefined) {
            this.setID(id);
        }
    }

    // the C++ destructor restores the music
    async run(in_root = true) {
        const r = await super.run(in_root);
        Audio.playMusic(this.prev_music_);
        return r;
    }

    setID(id) {
        this.battle_id_ = id;
        this.info_ = BattleMap.getBattleInfo(id);
        if (this.info_) {
            BattleMap.copyLayerData(this.info_.BattleFieldID, 0, this.earth_layer_);
            BattleMap.copyLayerData(this.info_.BattleFieldID, 1, this.building_layer_);
        }
        this.role_layer_.setAll(null);
        this.select_layer_.setAll(-1);
        this.effect_layer_.setAll(-1);
    }

    getTowardsByKey(key) {
        return super.getTowardsByKey(key);
    }

    getTowardsByMouse(mouse_x, mouse_y) {
        return super.getTowardsByMouse(mouse_x, mouse_y);
    }

    getMousePosition(mouse_x, mouse_y, view_x, view_y) {
        return super.getMousePosition(mouse_x, mouse_y, view_x, view_y);
    }

    usePaperPresentation() {
        return false;
    }

    handlePaperCameraInput(e) {}

    setSelectPosition(x, y) {
        this.select_x_ = x;
        this.select_y_ = y;
    }

    getBattleRoles() {
        return this.battle_roles_;
    }

    getRoleLayer() {
        return this.role_layer_;
    }

    selectX() {
        return this.select_x_;
    }

    selectY() {
        return this.select_y_;
    }

    setHaveFailExp(b) {
        this.fail_exp_ = b;
    }

    setSemiReal(b) {
        this.semi_real_ = b ? 1 : 0;
    }

    setExpedition33(b) {
        this.expedition33_ = b ? 1 : 0;
    }

    tileScale() {
        return Math.max(1, Math.trunc(Scene.TILE_W / TILE_W_0));
    }

    draw() {
        const engine = Engine;
        engine.setRenderTarget('scene');
        engine.fillColor(C(0, 0, 0, 255), 0, 0, this.render_center_x_ * 2, this.render_center_y_ * 2);
        // the ground changes its brightness while a position is selected
        const need_change_earth_color = this.battle_cursor_.isRunning() && !this.acting_role_.isAuto();
        const TILE_W = Scene.TILE_W;
        const TILE_H = Scene.TILE_H;
        const earth_texture = engine.getTexture('earth');
        if (earth_texture) {
            const c = need_change_earth_color ? C(64, 64, 64, 255) : C(255, 255, 255, 255);
            engine.setColor(earth_texture, c);
            const p = this.getPositionOnWholeEarth(this.man_x_, this.man_y_);
            const w = this.render_center_x_ * 2;
            const h = this.render_center_y_ * 2;
            const rect0 = { x: p.x - this.render_center_x_ - this.x_, y: p.y - this.render_center_y_ - this.y_, w, h };
            const rect1 = { x: 0, y: 0, w, h };
            if (rect0.x < 0) {
                rect1.x = -rect0.x;
                rect0.x = 0;
            }
            if (rect0.y < 0) {
                rect1.y = -rect0.y;
                rect0.y = 0;
            }
            if (rect0.w + rect0.x > this.COORD_COUNT * TILE_W * 2) {
                rect0.w = this.COORD_COUNT * TILE_W * 2 - rect0.x;
                rect1.w = rect0.w;
            }
            if (rect0.h + rect0.y > this.COORD_COUNT * TILE_H * 2) {
                rect0.h = this.COORD_COUNT * TILE_H * 2 - rect0.y;
                rect1.h = rect0.h;
            }
            engine.renderTextureLight(earth_texture, rect0, rect1, [c, c, c, c], [0.25, 0, 0, 0]);
        }
        const vs = this.view_sum_region_;
        const vw = this.view_width_region_;
        for (let sum = -vs; sum <= vs + 15; sum++) {
            for (let i = -vw; i <= vw; i++) {
                const ix = this.man_x_ + i + Math.trunc(sum / 2);
                const iy = this.man_y_ - i + (sum - Math.trunc(sum / 2));
                if (this.isOutLine(ix, iy)) {
                    continue;
                }
                const p = this.getPositionOnRender(ix, iy, this.man_x_, this.man_y_);
                p.x += this.x_;
                p.y += this.y_;
                const num = Math.trunc(this.earth_layer_.data(ix, iy) / 2);
                let color = C(255, 255, 255, 255);
                let need_draw = earth_texture === null;
                if (need_change_earth_color) {
                    if (this.select_layer_.data(ix, iy) < 0) {
                        color = C(64, 64, 64, 255);
                        need_draw = earth_texture === null;
                    } else {
                        color = C(128, 128, 128, 255);
                        need_draw = true;
                    }
                    if (this.battle_cursor_.getMode() === BattleCursor.Action && this.haveEffect(ix, iy)) {
                        need_draw = true;
                        color = C(192, 192, 192, 255);
                    }
                    if (ix === this.select_x_ && iy === this.select_y_) {
                        color = C(255, 255, 255, 255);
                    }
                }
                if (need_draw && num > 0) {
                    TextureManager.renderTextureByName('smap', num, p.x, p.y, RI(color));
                }
            }
        }
        const white = C(255, 255, 255, 255);
        for (let sum = -vs; sum <= vs + 15; sum++) {
            for (let i = -vw; i <= vw; i++) {
                const ix = this.man_x_ + i + Math.trunc(sum / 2);
                const iy = this.man_y_ - i + (sum - Math.trunc(sum / 2));
                if (this.isOutLine(ix, iy)) {
                    continue;
                }
                const p = this.getPositionOnRender(ix, iy, this.man_x_, this.man_y_);
                p.x += this.x_;
                p.y += this.y_;
                let num = Math.trunc(this.building_layer_.data(ix, iy) / 2);
                if (num > 0) {
                    const brightness = Scene.isWallTile(num) ? [] : [0.5, 0, 0, 0];
                    TextureManager.renderTextureByName('smap', num, p.x, p.y, RI(white, 255, 1, 1, 0, 0, [], brightness));
                }
                const r = this.role_layer_.data(ix, iy);
                if (r) {
                    let color = white;
                    let alpha = 255;
                    if (this.battle_cursor_.isRunning() && !this.acting_role_.isAuto()) {
                        color = this.inEffect(this.acting_role_, r) ? white : C(128, 128, 128, 255);
                    }
                    const pic = this.calRolePic(r, r.ActType, r.ActFrame);
                    if (r.HP <= 0) {
                        alpha = this.dead_alpha_;
                    }
                    const offset = this.block_role_offsets_.get(r);
                    if (offset) {
                        p.x += offset.x;
                        p.y += offset.y;
                    }
                    const brightness = alpha === 255 ? [0.5, 0, 0, 0] : [];
                    TextureManager.renderTextureByName(fightPath(r.HeadID), pic, p.x, p.y, RI(color, alpha, 1, 1, 0, 0, [], brightness));
                    this.renderExtraRoleInfo(r, p.x, p.y);
                }
                if (this.effect_id_ >= 0 && this.haveEffect(ix, iy)) {
                    const dis = this.calDistance(this.acting_role_.X(), this.acting_role_.Y(), ix, iy);
                    num = this.effect_frame_ - dis;
                    if (this.effect_attack_area_type_ === 3) {
                        num += this.rand_.rand_int(3) - this.rand_.rand_int(3);
                    }
                    TextureManager.renderTextureByName(eftPath(this.effect_id_), num, p.x, p.y, RI(white, 224, 1, 1, 0, 0, [], [0.5, 0, 0, 0]));
                }
            }
        }
        this.renderBattleSceneOverlays();
        engine.renderTextureToMain('scene');
        if (this.semi_real_) {
            const h = engine.getUIHeight();
            TextureManager.renderTextureByName('title', 202, 200, h - 100);
            for (const r of this.battle_roles_) {
                const x = 300 + Math.trunc(r.Progress / 2);
                const alpha = r.HP <= 0 ? this.dead_alpha_ : 255;
                TextureManager.renderTextureByName('head', r.HeadID, x, h - 100, RI(white, alpha, 0.25, 0.25));
            }
        }
        if (this.result_ >= 0) {
            engine.fillColor(C(0, 0, 0, 128), 0, 0, -1, -1);
        }
    }

    async dealEvent(e) {
        this.handlePaperCameraInput(e);
        if (this.battle_roles_.length === 0) {
            this.exitWithResult(0);
            return;
        }
        let role = null;
        if (this.semi_real_ === 0) {
            // the first role in the list acts
            role = this.battle_roles_[0];
            // everybody has acted: reset and sort again
            if (role.Acted !== 0) {
                this.resetRolesAct();
                this.sortRoles();
                role = this.battle_roles_[0];
            }
        } else {
            role = this.battle_roles_.find((r) => r.Progress > 1000) || null;
            if (role === null) {
                for (const r of this.battle_roles_) {
                    r.Progress += Math.trunc(r.Speed / 4);
                }
                return;
            }
        }
        this.acting_role_ = role;
        this.man_x_ = role.X();
        this.man_y_ = role.Y();
        this.select_x_ = role.X();
        this.select_y_ = role.Y();
        this.head_self_.setRole(role);
        this.head_self_.setState(NodePass);
        await this.action(role);
        // a role that has acted goes to the end of the list
        if (role.Acted) {
            if (this.semi_real_ === 0) {
                const i = this.battle_roles_.indexOf(role);
                if (i >= 0) {
                    this.battle_roles_.splice(i, 1);
                }
                this.battle_roles_.push(role);
            } else {
                role.Progress -= 1000;
                this.resetRolesAct();
            }
            if (role.HP > 0 && !role.Dead) {
                this.poisonEffect(role);
            }
        }
        await this.clearDead();
        const battle_result = this.checkResult();
        if (battle_result >= 0) {
            this.result_ = battle_result;
            if (this.result_ === 0 || (this.result_ === 1 && this.fail_exp_)) {
                await this.calExpGot();
            }
            this.setExit(true);
        }
    }

    // cancels the automatic battle
    async dealEvent2(e) {
        if (this.isPressCancel(e)) {
            for (const r of this.battle_roles_) {
                if (r.Team === 0 && r.Auto === 1) {
                    r.Auto = 0;
                }
            }
        }
    }

    // textures needed by the battle are loaded before it starts
    async preloadTextures() {
        const groups = new Set(['smap', 'title']);
        for (const r of Save.getRoles()) {
            if (r.Team === 0 || r.Team === 1) {
                groups.add(fightPath(r.HeadID));
            }
        }
        await TextureManager.ensureGroups([...groups]);
        await Promise.all([...groups].filter((g) => g.startsWith('fight/')).map((g) => TextureManager.preloadAll(g)));
    }

    async onEntrance() {
        this.calViewRegion();
        if (!this.info_) {
            this.exitWithResult(1);
            return;
        }
        Audio.playMusic(this.info_.Music);
        this.head_self_.setPosition(80, 100);
        this.addChild(Weather.getInstance());
        await this.makeEarthTexture();
        await this.readBattleInfo();
        for (const r of this.battle_roles_) {
            await this.setRoleInitState(r);
            r.Progress = 0;
        }
        await this.preloadTextures();
        this.sortRoles();
        this.acting_role_ = this.battle_roles_[0] || null;
    }

    async onExit() {
        for (const r of Save.getRoles()) {
            r.setRolePositionLayer(null);
        }
    }

    backRun() {}

    // positions and teams of the roles
    async readBattleInfo() {
        this.man_x_ = Math.trunc(this.COORD_COUNT / 2);
        this.man_y_ = Math.trunc(this.COORD_COUNT / 2);
        const info = this.info_;
        for (const r of Save.getRoles()) {
            r.setRolePositionLayer(this.role_layer_);
            r.Team = 2;
            r.Auto = 1;
            r.Dead = 0;
        }
        for (let i = 0; i < BATTLE_ENEMY_COUNT; i++) {
            const r = Save.getRole(info.Enemy[i]);
            if (r) {
                this.battle_roles_.push(r);
                r.setPosition(info.EnemyX[i], info.EnemyY[i]);
                r.Team = 1;
                await this.readFightFrame(r);
                r.FaceTowards = this.rand_.rand_int(4);
                this.man_x_ = r.X();
                this.man_y_ = r.Y();
            }
        }
        LOG(`${this.battle_roles_.length}`);
        if (info.AutoTeamMate[0] >= 0) {
            for (let i = 0; i < TEAMMATE_COUNT; i++) {
                const r = Save.getRole(info.AutoTeamMate[i]);
                if (r) {
                    this.friends_.push(r);
                    r.Auto = 2;
                }
            }
        } else {
            const team_menu = new TeamMenu();
            team_menu.setMode(1);
            await team_menu.run();
            this.friends_ = team_menu.getRoles();
        }
        this.friends_.forEach((r, i) => {
            if (r) {
                this.battle_roles_.push(r);
                r.setPosition(info.TeamMateX[i], info.TeamMateY[i]);
                r.Team = 0;
            }
        });
        if (this.battle_roles_.length > 0) {
            this.man_x_ = this.battle_roles_[0].X();
            this.man_y_ = this.battle_roles_[0].Y();
        }
    }

    async setRoleInitState(r) {
        r.Acted = 0;
        r.ExpGot = 0;
        r.clearShowStrings();
        r.FightingFrame = 0;
        r.Moved = 0;
        r.AI_Action = -1;
        r.Show.Effect = -1;
        r.Show.BattleHurt = 0;
        r.Show.ProgressChange = 0;
        r.Progress = 0;
        r.ActType = -1;
        r.ActFrame = 0;
        r.HP = clamp(r.HP, Math.trunc(r.MaxHP / 10), r.MaxHP);
        r.MP = clamp(r.MP, Math.trunc(r.MaxMP / 10), r.MaxMP);
        r.Sheild = 0;
        if (r.Team === 1) {
            r.Sheild = Math.trunc(r.Level / 10) + 1;
        }
        // enemies are automatic
        r.Auto = r.Team;
        if (r.Team === 1) {
            // enemies start recovered
            r.PhysicalPower = Math.max(r.PhysicalPower, 90);
            r.HP = r.MaxHP;
            r.MP = r.MaxMP;
            r.Poison = 0;
            r.HurtThisFrame = 0;
        }
        await this.readFightFrame(r);
        this.setFaceTowardsNearest(r);
    }

    // faces the nearest enemy, or the nearest role in the effect
    setFaceTowardsNearest(r, in_effect = false) {
        let min_distance = this.COORD_COUNT * this.COORD_COUNT;
        let r_near = null;
        for (const r1 of this.battle_roles_) {
            if ((!in_effect && r.Team !== r1.Team) || (in_effect && this.inEffect(r, r1))) {
                const dis = this.calRoleDistance(r, r1);
                if (dis < min_distance) {
                    r_near = r1;
                    min_distance = dis;
                }
            }
        }
        if (r_near) {
            const tw = this.calTowards(r.X(), r.Y(), r_near.X(), r_near.Y());
            if (tw !== Towards_None) {
                r.FaceTowards = tw;
            }
        }
    }

    async readFightFrame(r) {
        if (r.FightFrame[0] >= 0) {
            return;
        }
        for (let i = 0; i < 5; i++) {
            r.FightFrame[i] = 0;
        }
        const path = fightPath(r.HeadID);
        await TextureManager.ensureGroup(path);
        const frames = findNumbers(await TextureManager.getTextureGroup(path).getFileContent('fightframe.txt'));
        for (let i = 0; i < Math.trunc(frames.length / 2); i++) {
            r.FightFrame[frames[i * 2]] = frames[i * 2 + 1];
        }
    }

    sortRoles() {
        const key = this.semi_real_ === 0 ? (r) => [r.Speed, r.ID, r.X(), r.Y()] : (r) => [r.Progress, r.ID, r.X(), r.Y()];
        this.battle_roles_.sort((r1, r2) => {
            const a = key(r1);
            const b = key(r2);
            for (let i = 0; i < a.length; i++) {
                if (a[i] !== b[i]) {
                    return b[i] - a[i];
                }
            }
            return 0;
        });
    }

    resetRolesAct() {
        for (const r of this.battle_roles_) {
            r.Acted = 0;
            r.Moved = 0;
            r.ActType = -1;
            r.setPosition(r.X(), r.Y());
        }
    }

    calMoveStep(r) {
        if (r.Moved) {
            return 0;
        }
        let speed = r.Speed;
        for (const e of [r.Equip0, r.Equip1]) {
            if (e >= 0) {
                const i = Save.getItem(e);
                if (i) {
                    speed += i.AddSpeed;
                }
            }
        }
        return Math.trunc(speed / 15) + 1;
    }

    calActionStep(ability) {
        return Math.trunc(ability / 15) + 1;
    }

    calRolePic(r, style = -1, frame = 0) {
        if (!(r.FightFrame[style] > 0)) {
            style = -1;
        }
        if (style === -1) {
            for (let i = 0; i < 5; i++) {
                if (r.FightFrame[i] > 0) {
                    return r.FightFrame[i] * r.FaceTowards;
                }
            }
        } else {
            let total = 0;
            for (let i = 0; i < 5; i++) {
                if (i === style) {
                    return total + r.FightFrame[style] * r.FaceTowards + frame;
                }
                total += r.FightFrame[i] * 4;
            }
        }
        return r.FaceTowards;
    }

    // mode: 0 move (steps and obstacles), 1 action (steps only), 2 check (all),
    // 3 straight lines, 4 only the role itself
    calSelectLayer(...args) {
        if (args[0] instanceof Role) {
            const [r, mode, step = 0] = args;
            this.calSelectLayerXY(r.X(), r.Y(), r.Team, mode, step);
        } else {
            this.calSelectLayerXY(...args);
        }
    }

    calSelectLayerXY(x, y, team, mode, step = 0) {
        const sl = this.select_layer_;
        const N = this.COORD_COUNT;
        if (mode === 0) {
            sl.setAll(-1);
            let cal_stack = [[x, y]];
            sl.set(x, y, step);
            let count = 0;
            while (step >= 0) {
                const cal_stack_next = [];
                const check_next = (x1, y1) => {
                    if (sl.data(x1, y1) === -1 && this.canWalk(x1, y1)) {
                        sl.set(x1, y1, step - 1);
                        cal_stack_next.push([x1, y1]);
                        count++;
                    }
                };
                for (const [px, py] of cal_stack) {
                    // roles next to an enemy cannot move further
                    if (!this.isNearEnemy(team, px, py) || (px === x && py === y)) {
                        check_next(px - 1, py);
                        check_next(px + 1, py);
                        check_next(px, py - 1);
                        check_next(px, py + 1);
                    }
                    if (count >= N * N) {
                        break;
                    }
                }
                if (cal_stack_next.length === 0) {
                    break;
                }
                cal_stack = cal_stack_next;
                step--;
            }
        } else if (mode === 1) {
            for (let ix = 0; ix < N; ix++) {
                for (let iy = 0; iy < N; iy++) {
                    sl.set(ix, iy, step - this.calDistance(ix, iy, x, y));
                }
            }
        } else if (mode === 2) {
            sl.setAll(0);
        } else if (mode === 3) {
            for (let ix = 0; ix < N; ix++) {
                for (let iy = 0; iy < N; iy++) {
                    const dx = Math.abs(ix - x);
                    const dy = Math.abs(iy - y);
                    sl.set(ix, iy, (dx === 0 && dy <= step) || (dy === 0 && dx <= step) ? 0 : -1);
                }
            }
            sl.set(x, y, -1);
        } else {
            sl.setAll(-1);
            sl.set(x, y, 0);
        }
    }

    calSelectLayerByMagic(x, y, team, magic, level_index) {
        if (magic.AttackAreaType === 0 || magic.AttackAreaType === 3) {
            this.calSelectLayerXY(x, y, team, 1, magic.SelectDistance[level_index]);
        } else if (magic.AttackAreaType === 1) {
            this.calSelectLayerXY(x, y, team, 3, magic.SelectDistance[level_index]);
        } else {
            this.calSelectLayerXY(x, y, team, 4);
        }
    }

    // calEffectLayer(role, select_x, select_y, magic, level_index) or
    // calEffectLayer(x, y, select_x, select_y, magic, level_index)
    calEffectLayer(...args) {
        if (args[0] instanceof Role) {
            const [r, sx, sy, m = null, l = 0] = args;
            this.calEffectLayerXY(r.X(), r.Y(), sx, sy, m, l);
        } else {
            this.calEffectLayerXY(...args);
        }
    }

    calEffectLayerXY(x, y, select_x, select_y, m = null, level_index = 0) {
        const el = this.effect_layer_;
        el.setAll(-1);
        // without a magic only the selected position
        if (!m || m.AttackAreaType === 0) {
            if (!this.isOutLine(select_x, select_y)) {
                el.set(select_x, select_y, 0);
            }
            return;
        }
        if (m.AttackAreaType === 1) {
            const tw = this.calTowards(x, y, select_x, select_y);
            const dis = m.SelectDistance[level_index];
            for (let ix = x - dis; ix <= x + dis; ix++) {
                for (let iy = y - dis; iy <= y + dis; iy++) {
                    if (!this.isOutLine(ix, iy) && (x === ix || y === iy) && this.calTowards(x, y, ix, iy) === tw) {
                        el.set(ix, iy, 0);
                    }
                }
            }
        } else if (m.AttackAreaType === 2) {
            const dis = m.SelectDistance[level_index];
            for (let ix = x - dis; ix <= x + dis; ix++) {
                for (let iy = y - dis; iy <= y + dis; iy++) {
                    if (!this.isOutLine(ix, iy) && (x === ix || y === iy)) {
                        el.set(ix, iy, 0);
                    }
                }
            }
        } else if (m.AttackAreaType === 3) {
            const dis = m.AttackDistance[level_index];
            for (let ix = select_x - dis; ix <= select_x + dis; ix++) {
                for (let iy = select_y - dis; iy <= select_y + dis; iy++) {
                    if (!this.isOutLine(ix, iy)) {
                        el.set(ix, iy, 0);
                    }
                }
            }
        }
    }

    haveEffect(x, y) {
        return !this.isOutLine(x, y) && this.effect_layer_.data(x, y) >= 0;
    }

    // r2 is in the effect and is affected by the action of r1
    inEffect(r1, r2) {
        if (this.haveEffect(r2.X(), r2.Y())) {
            if (r1.ActTeam === 0 && r1.Team === r2.Team) {
                return true;
            } else if (r1.ActTeam !== 0 && r1.Team !== r2.Team) {
                return true;
            }
        }
        return false;
    }

    canSelect(x, y) {
        return !this.isOutLine(x, y) && this.select_layer_.data(x, y) >= 0;
    }

    walk(r, x, y, t) {
        if (this.canWalk(x, y)) {
            r.setPosition(x, y);
        }
    }

    canWalk(x, y) {
        return !(this.isOutLine(x, y) || this.isBuilding(x, y) || this.isWater(x, y) || this.isRole(x, y));
    }

    isBuilding(x, y) {
        return this.building_layer_.data(x, y) > 0;
    }

    isWater(x, y) {
        const num = Math.trunc(this.earth_layer_.data(x, y) / 2);
        return (num >= 179 && num <= 181) || num === 261 || num === 511 || (num >= 662 && num <= 665) || num === 674;
    }

    isRole(x, y) {
        return !!this.role_layer_.data(x, y);
    }

    isOutScreen(x, y) {
        return Math.abs(this.man_x_ - x) >= 16 || Math.abs(this.man_y_ - y) >= 20;
    }

    isNearEnemy(team, x, y) {
        return this.battle_roles_.some((r1) => team !== r1.Team && this.calDistance(r1.X(), r1.Y(), x, y) <= 1);
    }

    calRoleDistance(r1, r2) {
        return this.calDistance(r1.X(), r1.Y(), r2.X(), r2.Y());
    }

    calDistanceRound(x1, x2, y1, y2) {
        return Math.trunc(Math.sqrt((x1 - y1) * (x1 - y1) + (x2 - y2) * (x2 - y2)));
    }

    calDistanceLayer(x, y, distance_layer, max_step) {
        distance_layer.setAll(max_step + 1);
        let cal_stack = [[x, y]];
        distance_layer.set(x, y, 0);
        let count = 0;
        let step = 0;
        while (step <= 64) {
            const cal_stack_next = [];
            const check_next = (x1, y1) => {
                if (this.isOutLine(x1, y1)) {
                    return;
                }
                if (distance_layer.data(x1, y1) === max_step + 1 && this.canWalk(x1, y1)) {
                    distance_layer.set(x1, y1, step + 1);
                    cal_stack_next.push([x1, y1]);
                    count++;
                }
            };
            for (const [px, py] of cal_stack) {
                distance_layer.set(px, py, step);
                check_next(px - 1, py);
                check_next(px + 1, py);
                check_next(px, py - 1);
                check_next(px, py + 1);
                if (count >= distance_layer.squareSize()) {
                    break;
                }
            }
            if (cal_stack_next.length === 0) {
                break;
            }
            cal_stack = cal_stack_next;
            step++;
        }
    }

    getSelectedRole() {
        if (this.isOutLine(this.select_x_, this.select_y_)) {
            return null;
        }
        return this.role_layer_.data(this.select_x_, this.select_y_);
    }

    async action(r) {
        this.actionAnimation_ = null;
        this.resetBattleAnimationState();
        await this.battle_menu_.runAsRole(r);
        r.Network_Action = this.battle_menu_.getResult();
        const str = this.battle_menu_.getResultString();
        switch (str) {
        case '移動': await this.actMove(r); break;
        case '武學': await this.actUseMagic(r); break;
        case '用毒': await this.actUsePoison(r); break;
        case '解毒': await this.actDetoxification(r); break;
        case '醫療': await this.actMedicine(r); break;
        case '暗器': await this.actUseHiddenWeapon(r); break;
        case '藥品': await this.actUseDrug(r); break;
        case '等待': this.actWait(r); break;
        case '狀態': await this.actStatus(r); break;
        case '自動': this.actAuto(r); r.Network_Action = -1; break;
        case '結束': this.actRest(r); break;
        default: break;
        }
        // the next role starts from the first menu item
        if (r.Acted) {
            this.battle_menu_.setStartItem(0);
        }
        if (this.actionAnimation_) {
            await this.actionAnimation_();
        }
        for (const r1 of this.battle_roles_) {
            r1.clearShow();
        }
        this.resetBattleAnimationState();
    }

    async actMove(r) {
        const step = this.calMoveStep(r);
        this.calSelectLayer(r, 0, step);
        this.battle_cursor_.setRoleAndMagic(r);
        this.battle_cursor_.setMode(BattleCursor.Move);
        if ((await this.battle_cursor_.run()) === 0) {
            r.PhysicalPower = clamp(r.PhysicalPower - 2, 0, Role.getMaxValue().PhysicalPower);
            r.setPrevPosition(r.X(), r.Y());
            r.Network_MoveX = this.select_x_;
            r.Network_MoveY = this.select_y_;
            r.ExpGot += 1;
            r.Moved = 1;
            const move_x = this.select_x_;
            const move_y = this.select_y_;
            this.actionAnimation_ = async () => {
                this.calSelectLayer(r, 0, step);
                await this.moveAnimation(r, move_x, move_y);
            };
        }
    }

    async actUseMagic(r) {
        const magic_menu = new BattleMagicMenu();
        for (;;) {
            let magic = null;
            magic_menu.setStartItem(r.SelectedMagic);
            if (r.isAuto()) {
                magic = r.AI_Magic;
                r.SelectedMagic = r.getMagicOfRoleIndex(magic);
            } else {
                await magic_menu.runAsRole(r);
                magic = magic_menu.getMagic();
                r.SelectedMagic = magic_menu.getResult();
            }
            if (!magic) {
                break;
            }
            r.ActTeam = 1;
            const level_index = r.getMagicLevelIndex(magic.ID);
            this.calSelectLayerByMagic(r.X(), r.Y(), r.Team, magic, level_index);
            this.battle_cursor_.setMode(BattleCursor.Action);
            this.battle_cursor_.setRoleAndMagic(r, magic, level_index);
            const selected = await this.battle_cursor_.run();
            // cancelled: choose the magic again
            if (selected < 0) {
                continue;
            }
            r.Network_ActionX = this.select_x_;
            r.Network_ActionY = this.select_y_;
            r.Network_Magic = magic;
            this.actUseMagicSub(r, magic);
            break;
        }
    }

    // random counter attack magics of the roles who block
    pickCounters(roles) {
        const counters = [];
        for (const r2 of roles) {
            const counter_magics = [];
            for (let i = 0; i < ROLE_MAGIC_COUNT; i++) {
                const m = Save.getMagic(r2.MagicID[i]);
                if (m) {
                    counter_magics.push(m);
                }
            }
            if (counter_magics.length) {
                counters.push({ role: r2, magic: counter_magics[this.rand_.rand_int(counter_magics.length)] });
            }
        }
        return counters;
    }

    actUseMagicSub(r, magic) {
        // the results of every attack are saved for the animation
        const multi_shows = [];
        const show_roles = [];
        const block_roles = [];
        const attack_count = this.expedition33_ ? 1 : 1 + sign(r.AttackTwice);
        for (let i = 0; i < attack_count; i++) {
            const level_index = r.getMagicLevelIndex(magic.ID);
            r.PhysicalPower = clamp(r.PhysicalPower - 3, 0, Role.getMaxValue().PhysicalPower);
            r.MP = clamp(r.MP - magic.calNeedMP(level_index), 0, r.MaxMP);
            this.calMagiclHurtAllEnemies(r, magic);
            multi_shows.push([]);
            show_roles.push([]);
            block_roles.push([]);
            for (const r2 of this.battle_roles_) {
                if (r2.Show.BattleHurt !== 0) {
                    if (magic.HurtType === 0) {
                        r2.addShowString(`-${r2.Show.BattleHurt}`, C(255, 20, 20, 255));
                    } else if (magic.HurtType === 1) {
                        r2.addShowString(`-${r2.Show.BattleHurt}`, C(160, 32, 240, 255));
                        r2.Show.BattleHurt = 0;
                    }
                    if (r2.Show.BattleHurt !== 0) {
                        block_roles[i].push(r2);
                    }
                }
                show_roles[i].push(r2);
                multi_shows[i].push(copyShow(r2.Show));
                r2.clearShow();
            }
            // the magic level increases
            const index = r.getMagicOfRoleIndex(magic);
            if (index >= 0) {
                r.MagicLevel[index] += 1 + this.rand_.rand_int(2);
                r.MagicLevel[index] = clamp(r.MagicLevel[index], 0, MAX_MAGIC_LEVEL);
                LOG(`${r.Name} ${magic.Name} level is ${r.MagicLevel[index]}`);
            }
        }
        r.Acted = 1;
        this.actionAnimation_ = async () => {
            for (let i = 0; i < multi_shows.length; i++) {
                await this.showMagicName(magic.Name);
                const counters = this.pickCounters(block_roles[i]);
                const timing = { success: false };
                const blocked = await this.useMagicAnimation(r, magic, block_roles[i], counters, timing);
                if (this.expedition33_ && r.Team === 0 && timing.success && magic.HurtType === 0) {
                    await this.attackTimingSuccessAnimation(r, magic, block_roles[i]);
                }
                const base_hurts = multi_shows[i].map((s) => s.BattleHurt);
                if (blocked) {
                    let reflect_hurt = 0;
                    show_roles[i].forEach((r2, j) => {
                        if (block_roles[i].includes(r2)) {
                            reflect_hurt += multi_shows[i][j].BattleHurt;
                            multi_shows[i][j] = emptyShow();
                        }
                    });
                    for (const r2 of block_roles[i]) {
                        r2.Sheild++;
                    }
                    if (r.Sheild > 0) {
                        r.Sheild--;
                    } else if (reflect_hurt > 0) {
                        let counter_hurt = 0;
                        for (const c of counters) {
                            counter_hurt += this.calMagicHurt(c.role, r, c.magic);
                        }
                        if (counter_hurt > 0) {
                            reflect_hurt = counter_hurt;
                        }
                        const j = show_roles[i].indexOf(r);
                        if (j >= 0) {
                            multi_shows[i][j].BattleHurt += reflect_hurt;
                            multi_shows[i][j].ProgressChange -= Math.trunc(reflect_hurt / 5);
                            r.Show = multi_shows[i][j];
                            r.addShowString(`-${reflect_hurt}`, C(255, 20, 20, 255));
                            multi_shows[i][j] = copyShow(r.Show);
                            r.Show = emptyShow();
                        }
                    }
                } else if (this.expedition33_ && magic.HurtType === 0) {
                    show_roles[i].forEach((r2, j) => {
                        if (block_roles[i].includes(r2) && r2.Sheild > 0 && multi_shows[i][j].BattleHurt > 0) {
                            r2.Sheild--;
                            multi_shows[i][j] = emptyShow();
                        }
                    });
                }
                if (this.expedition33_ && r.Team === 0 && timing.success && magic.HurtType === 0) {
                    let shield_count = r.Sheild;
                    if (shield_count > 0) {
                        r.Sheild = 0;
                    }
                    const shield_blocked = show_roles[i].map(() => false);
                    show_roles[i].forEach((r2, j) => {
                        const hurt = base_hurts[j];
                        if (!r2 || r2.Team === r.Team || hurt <= 0 || r2.Sheild <= 0) {
                            return;
                        }
                        const shield_used = Math.min(r2.Sheild, shield_count);
                        r2.Sheild -= shield_used;
                        shield_count -= shield_used;
                        if (r2.Sheild > 0) {
                            r2.Sheild--;
                            shield_blocked[j] = true;
                        }
                    });
                    const damage_multiplier = 1 + shield_count;
                    show_roles[i].forEach((r2, j) => {
                        const hurt = base_hurts[j];
                        if (!r2 || r2.Team === r.Team || hurt <= 0 || shield_blocked[j] || r2.Sheild > 0) {
                            return;
                        }
                        const extra_hurt = hurt * damage_multiplier;
                        multi_shows[i][j].BattleHurt += extra_hurt;
                        multi_shows[i][j].ProgressChange -= Math.trunc(extra_hurt / 5);
                        r2.Show = multi_shows[i][j];
                        r2.addShowString(`-${extra_hurt}`, C(255, 20, 20, 255));
                        multi_shows[i][j] = copyShow(r2.Show);
                        r2.Show = emptyShow();
                    });
                }
                // gradual changes of HP and progress
                const animated_changes = [];
                show_roles[i].forEach((r2, j) => {
                    if (!this.battle_roles_.includes(r2)) {
                        return;
                    }
                    r2.Show = copyShow(multi_shows[i][j]);
                    animated_changes.push({ o: r2, k: 'HP', d: -r2.Show.BattleHurt });
                    animated_changes.push({ o: r2, k: 'Progress', d: r2.Show.ProgressChange });
                });
                await this.showNumberAnimation(2, true, animated_changes);
                await this.clearDead();
            }
        };
    }

    async actSelectTarget(r, ability, act_team) {
        this.calSelectLayer(r, 1, this.calActionStep(ability));
        this.battle_cursor_.setMode(BattleCursor.Action);
        this.battle_cursor_.setRoleAndMagic(r);
        r.ActTeam = act_team;
        return await this.battle_cursor_.run();
    }

    async actUsePoison(r) {
        if ((await this.actSelectTarget(r, r.UsePoison, 1)) >= 0) {
            r.Network_ActionX = this.select_x_;
            r.Network_ActionY = this.select_y_;
            const r2 = this.getSelectedRole();
            if (r2) {
                const v = r.usePoison(r2);
                r2.addShowString(format('{:+}', v), C(20, 255, 20, 255));
                r.ExpGot += v;
            }
            r.PhysicalPower = clamp(r.PhysicalPower - 3, 0, Role.getMaxValue().PhysicalPower);
            r.Acted = 1;
            this.actionAnimation_ = async () => {
                await this.actionAnimation(r, 0, 30);
                await this.showNumberAnimation();
            };
        }
    }

    async actDetoxification(r) {
        if ((await this.actSelectTarget(r, r.Detoxification, 0)) >= 0) {
            r.Network_ActionX = this.select_x_;
            r.Network_ActionY = this.select_y_;
            const r2 = this.getSelectedRole();
            if (r2) {
                const v = r.detoxification(r2);
                r2.addShowString(`-${-v}`, C(20, 200, 255, 255));
                r.ExpGot += v;
            }
            r.PhysicalPower = clamp(r.PhysicalPower - 5, 0, Role.getMaxValue().PhysicalPower);
            r.Acted = 1;
            this.actionAnimation_ = async () => {
                await this.actionAnimation(r, 0, 36);
                await this.showNumberAnimation();
            };
        }
    }

    async actMedicine(r) {
        if ((await this.actSelectTarget(r, r.Medicine, 0)) >= 0) {
            r.Network_ActionX = this.select_x_;
            r.Network_ActionY = this.select_y_;
            const r2 = this.getSelectedRole();
            if (r2) {
                const v = r.medicine(r2);
                r2.addShowString(`-${Math.abs(v)}`, C(255, 255, 200, 255));
                r.ExpGot += v;
            }
            r.PhysicalPower = clamp(r.PhysicalPower - 5, 0, Role.getMaxValue().PhysicalPower);
            r.Acted = 1;
            this.actionAnimation_ = async () => {
                await this.actionAnimation(r, 0, 0);
                await this.showNumberAnimation();
            };
        }
    }

    async actUseHiddenWeapon(r) {
        const item_menu = new BattleItemMenu();
        item_menu.setRole(r);
        item_menu.setForceItemType([4]);
        await item_menu.runAtPosition(300, 0);
        const item = item_menu.getCurrentItem();
        if (!item) {
            return;
        }
        if ((await this.actSelectTarget(r, r.HiddenWeapon, 1)) < 0) {
            return;
        }
        const r2 = this.getSelectedRole();
        let v = 0;
        if (r2) {
            v = this.calHiddenWeaponHurt(r, r2, item);
            r2.Show.BattleHurt = v;
            r2.addShowString(`-${v}`, C(255, 20, 20, 255));
        }
        r.PhysicalPower = clamp(r.PhysicalPower - 5, 0, Role.getMaxValue().PhysicalPower);
        item_menu.addItem(item, -1);
        r.ExpGot += v;
        r.Acted = 1;
        this.actionAnimation_ = async () => {
            await this.showMagicName(item.Name);
            const block_roles = [];
            let counters = [];
            if (r2 && r2.Show.BattleHurt > 0) {
                block_roles.push(r2);
                counters = this.pickCounters(block_roles);
            }
            const blocked = await this.actionAnimation(r, 0, item.HiddenWeaponEffectID, 0, block_roles, counters);
            if (blocked && r2) {
                let reflect_hurt = r2.Show.BattleHurt;
                r2.clearShow();
                for (const b of block_roles) {
                    b.Sheild++;
                }
                if (r.Sheild > 0) {
                    r.Sheild--;
                } else if (reflect_hurt > 0) {
                    let counter_hurt = 0;
                    for (const c of counters) {
                        counter_hurt += this.calMagicHurt(c.role, r, c.magic);
                    }
                    if (counter_hurt > 0) {
                        reflect_hurt = counter_hurt;
                    }
                    r.Show.BattleHurt += reflect_hurt;
                    r.Show.ProgressChange -= Math.trunc(reflect_hurt / 5);
                    r.addShowString(`-${reflect_hurt}`, C(255, 20, 20, 255));
                }
            } else if (this.expedition33_ && r2 && r2.Sheild > 0 && r2.Show.BattleHurt > 0) {
                r2.Sheild--;
                r2.clearShow();
            }
            const animated_changes = [];
            if (r2) {
                animated_changes.push({ o: r2, k: 'HP', d: -r2.Show.BattleHurt });
            }
            if (r.Show.BattleHurt !== 0) {
                animated_changes.push({ o: r, k: 'HP', d: -r.Show.BattleHurt });
                animated_changes.push({ o: r, k: 'Progress', d: r.Show.ProgressChange });
            }
            await this.showNumberAnimation(2, true, animated_changes);
            await this.clearDead();
        };
    }

    async actUseDrug(r) {
        const item_menu = new BattleItemMenu();
        item_menu.setForceItemType([3]);
        item_menu.setRole(r);
        await item_menu.runAtPosition(300, 0);
        const item = item_menu.getCurrentItem();
        if (item) {
            const r0 = r.clone();
            r.useItem(item);
            item_menu.addItem(item, -1);
            r.Acted = 1;
            this.actionAnimation_ = async () => {
                const df = new ShowRoleDifference(r0, r);
                df.setText(`${r.Name}服用${item.Name}`);
                df.setShowHead(false);
                df.setPosition(250, 220);
                df.setStayFrame(40);
                await df.run();
            };
        }
    }

    // waits: moves after the last role who has not acted
    actWait(r) {
        for (let i = 1; i < this.battle_roles_.length; i++) {
            if (this.battle_roles_[i].Acted === 0) {
                this.battle_roles_.shift();
                this.battle_roles_.splice(i, 0, r);
            }
        }
    }

    async actStatus(r) {
        this.head_self_.setVisible(false);
        this.battle_cursor_.getHead().setVisible(false);
        this.battle_cursor_.getUIStatus().setVisible(true);
        this.calSelectLayer(r, 2, 0);
        this.battle_cursor_.setRoleAndMagic(r);
        this.battle_cursor_.setMode(BattleCursor.Check);
        await this.battle_cursor_.run();
        this.head_self_.setVisible(true);
        this.battle_cursor_.getHead().setVisible(true);
        this.battle_cursor_.getUIStatus().setVisible(false);
    }

    actAuto(r) {
        for (const r1 of this.battle_roles_) {
            r1.Auto = 1;
        }
    }

    actRest(r) {
        r.PhysicalPower = clamp(r.PhysicalPower + 5, 0, Role.getMaxValue().PhysicalPower);
        r.HP = Math.trunc(clamp(r.HP + 0.05 * r.MaxHP, 0, r.MaxHP));
        r.MP = Math.trunc(clamp(r.MP + 0.05 * r.MaxMP, 0, r.MaxMP));
        r.Acted = 1;
    }

    async moveAnimation(r, x, y) {
        // the way is found from the target back to the role
        const way = [[x, y]];
        const check_next = (x1, y1, step) => {
            if (this.canSelect(x1, y1) && this.select_layer_.data(x1, y1) === step) {
                way.push([x1, y1]);
                return true;
            }
            return false;
        };
        for (let i = this.select_layer_.data(x, y); i < this.select_layer_.data(r.X(), r.Y()); i++) {
            const [x1, y1] = way[way.length - 1];
            if (check_next(x1 - 1, y1, i + 1) || check_next(x1 + 1, y1, i + 1) || check_next(x1, y1 - 1, i + 1)
                || check_next(x1, y1 + 1, i + 1)) {
                continue;
            }
        }
        for (let i = way.length - 2; i >= 0; i--) {
            if (this.exit_) {
                break;
            }
            r.FaceTowards = this.calTowards(r.X(), r.Y(), way[i][0], way[i][1]);
            r.setPosition(way[i][0], way[i][1]);
            this.man_x_ = r.X();
            this.man_y_ = r.Y();
            await this.drawAndPresent(2);
        }
        r.setPosition(x, y);
        this.man_x_ = r.X();
        this.man_y_ = r.Y();
        r.Moved = 1;
        this.select_layer_.setAll(-1);
    }

    async useMagicAnimation(r, m, block_roles = null, counters = null, timing = null) {
        if (r && m) {
            Audio.playASound(m.SoundID);
            return await this.actionAnimation(r, m.MagicType, m.EffectID, Math.trunc(r.Attack / 20), block_roles, counters, timing,
                m.AttackAreaType);
        }
        return false;
    }

    async blockWith(r, block_roles, counters) {
        if (block_roles !== null) {
            await this.blockAnimation(r, block_roles, counters || []);
        } else {
            await this.blockAnimation(r, this.getBlockingRoles(r));
        }
    }

    // timing: { success } is set when the player times an attack (expedition33)
    async actionAnimation(r, style, effect_id, shake = 0, block_roles = null, counters = null, timing = null, attack_area_type = -1) {
        let blocked = false;
        if (timing) {
            timing.success = false;
        }
        if (r.X() !== this.select_x_ || r.Y() !== this.select_y_) {
            r.FaceTowards = this.calTowards(r.X(), r.Y(), this.select_x_, this.select_y_);
        }
        if (r.isAuto()) {
            this.setFaceTowardsNearest(r, true);
        }
        if (this.expedition33_ && (style < 0 || style >= 5 || r.FightFrame[style] <= 0)) {
            for (let i = 0; i < 5; i++) {
                if (r.FightFrame[i] > 0) {
                    style = i;
                    break;
                }
            }
        }
        const frame_count = r.FightFrame[style] ?? 0;
        r.ActType = style;
        this.effect_id_ = effect_id;
        this.effect_attack_area_type_ = attack_area_type;
        const path = eftPath(effect_id);
        await TextureManager.ensureGroup(path);
        await TextureManager.preloadAll(path);
        const effect_count = TextureManager.getTextureGroupCount(path);
        // the effect spreads from near to far
        let min_dis = 9999;
        let max_dis = 0;
        for (let ix = 0; ix < this.COORD_COUNT; ix++) {
            for (let iy = 0; iy < this.COORD_COUNT; iy++) {
                if (this.haveEffect(ix, iy)) {
                    const dis = this.calDistance(r.X(), r.Y(), ix, iy);
                    min_dis = Math.min(min_dis, dis);
                    max_dis = Math.max(max_dis, dis);
                }
            }
        }
        // the effect appears in the middle of the action
        const half = Math.trunc(frame_count / 2);
        const cycles = half + effect_count + max_dis - min_dis + 1;
        r.ActFrame = 0;
        const drawSuccessPrompt = async (frame) => {
            for (let j = 0; j < 5; j++) {
                await this.drawAndPresent(animation_delay_, () => {
                    this.renderAttackTimingCircle(frame + 1, frame_count, block_roles);
                    this.renderBlockPrompt(TimingPromptState.Success);
                });
            }
        };
        for (let i = 0; i < cycles; i++) {
            r.ActFrame++;
            if (r.ActFrame >= frame_count) {
                r.ActFrame = frame_count - 1;
            }
            // effects shown on the role first (poison, etc.)
            if (r.ActFrame === 1) {
                Audio.playASound(r.ActType);
                if (r.Show.Effect !== -1 || r.Show.ShowStrings.length) {
                    await this.showNumberAnimation(2, false);
                    r.clearShow();
                    continue;
                }
            }
            if (i >= half) {
                if (i === half) {
                    Audio.playESound(effect_id);
                }
                this.effect_frame_ = i - half - min_dis;
                if (shake > 0) {
                    this.x_ = this.rand_.rand_int(shake) - this.rand_.rand_int(shake);
                    this.y_ = this.rand_.rand_int(shake) - this.rand_.rand_int(shake);
                }
                this.effect_frame_++;
            }
            if (this.exit_) {
                break;
            }
            let timing_window = 7;
            if (this.expedition33_) {
                let wider_timing = false;
                if (r.Team === 0 && timing) {
                    wider_timing = r.AttackTwice > 0;
                } else if (r.Team === 1 && block_roles) {
                    wider_timing = block_roles.some((b) => b && b.Team !== r.Team && b.AttackTwice > 0);
                }
                if (wider_timing) {
                    timing_window = 12;
                }
            }
            const in_block_window = i >= frame_count - timing_window && i <= frame_count + timing_window;
            const can_timing_action = (r.Team === 1 && !blocked) || (r.Team === 0 && timing && !timing.success);
            if (this.expedition33_ && can_timing_action && i <= frame_count + timing_window) {
                await this.drawAndPresent(animation_delay_, () => {
                    this.renderAttackTimingCircle(i + 1, frame_count, block_roles);
                    this.renderBlockPrompt(in_block_window ? TimingPromptState.Press : TimingPromptState.Ready);
                });
                if (!in_block_window) {
                    this.checkEnemyAttackBlockInput();
                } else if (r.Team === 1 && !blocked && (this.easy_block_ || this.checkEnemyAttackBlockInput())) {
                    await drawSuccessPrompt(i);
                    await this.blockWith(r, block_roles, counters);
                    blocked = true;
                } else if (r.Team === 0 && in_block_window && timing && !timing.success
                    && (this.easy_block_ || this.checkEnemyAttackBlockInput())) {
                    await drawSuccessPrompt(i);
                    timing.success = true;
                }
            } else {
                await this.drawAndPresent(animation_delay_);
                if (this.expedition33_ && r.Team === 1 && in_block_window && !blocked
                    && (this.easy_block_ || this.checkEnemyAttackBlockInput())) {
                    await drawSuccessPrompt(i);
                    await this.blockWith(r, block_roles, counters);
                    blocked = true;
                }
            }
        }
        r.ActFrame = 0;
        r.ActType = -1;
        this.effect_frame_ = 0;
        this.effect_id_ = -1;
        this.effect_attack_area_type_ = -1;
        this.x_ = 0;
        this.y_ = 0;
        return blocked;
    }

    renderAttackTimingCircle(frame, frame_count, target_roles = null) {
        if (frame_count <= 0) {
            return;
        }
        const tex = TextureManager.getTexture('title', 204);
        if (!tex) {
            return;
        }
        tex.load();
        const tile_scale = this.tileScale();
        const [ui_w, ui_h] = Engine.getUISize();
        const progress = Math.max(0, frame_count - frame) / frame_count;
        const max_size = Math.trunc(Math.sqrt(ui_w * ui_w + ui_h * ui_h)) + 64 * tile_scale;
        const min_size = 6 * tile_scale;
        const size = Math.trunc(min_size + (max_size - min_size) * progress);
        UIRenderer.drawTexture(tex, Math.trunc(ui_w / 2 - size / 2), Math.trunc(ui_h / 2 - size / 2), RI(C(255, 255, 255, 255), 192), size, size);
    }

    renderBlockPrompt(state) {
        const prompt = state === TimingPromptState.Ready ? '准备' : (state === TimingPromptState.Press ? '按E键' : '成功');
        const font_size = 26;
        const tile_scale = this.tileScale();
        const [ui_w, ui_h] = Engine.getUISize();
        const text_w = Math.trunc((textDrawSize(prompt) * font_size) / 2);
        const button_tex = state === TimingPromptState.Press ? TextureManager.getTexture('title', 300) : null;
        if (button_tex) {
            button_tex.load();
        }
        const x = Math.trunc(ui_w / 2) - Math.trunc(text_w / 2);
        const y = Math.trunc(ui_h / 2) + 60;
        const color = state === TimingPromptState.Success ? C(255, 150, 40, 255)
            : (state === TimingPromptState.Press ? C(255, 40, 40, 255) : C(255, 255, 255, 255));
        Font.draw(prompt, font_size, x, y, color, 255);
        if (button_tex) {
            const icon_size = 36 * tile_scale;
            UIRenderer.drawTexture(button_tex, Math.trunc(ui_w / 2 - icon_size / 2), Math.trunc(ui_h / 2 - icon_size / 2),
                RI(C(255, 255, 255, 255), 160), icon_size, icon_size);
        }
    }

    renderBattleSceneOverlays() {
        const white = C(255, 255, 255, 255);
        const blo = this.block_light_overlay_;
        if (blo.frame >= 0 && blo.total_frames > 0) {
            const tex = TextureManager.getTexture('title', 203);
            if (tex) {
                const tile_scale = this.tileScale();
                const light = blo.total_frames - blo.frame;
                const zoom_max = (1.0 * this.render_center_x_ * 2) / tex.w;
                const zoom = (zoom_max * light) / blo.total_frames;
                const w = Math.trunc(tex.w * zoom);
                const h = Math.trunc(tex.h * zoom);
                const alpha = Math.trunc(192 + (63 * light) / blo.total_frames) & 255;
                for (const r of blo.roles) {
                    if (!r) {
                        continue;
                    }
                    const p = this.getPositionOnRender(r.X(), r.Y(), this.man_x_, this.man_y_);
                    const x = p.x + this.x_ - Math.trunc(w / 2);
                    const y = p.y + this.y_ - 32 * tile_scale - Math.trunc(h / 2);
                    TextureManager.renderTextureByName('title', 203, x, y, RI(white, alpha, zoom, zoom, 0, 0));
                }
            }
        }
        const pmo = this.point_magic_overlay_;
        if (pmo.frame >= 0 && pmo.total_frames > 0) {
            for (const magic of pmo.magics) {
                if (!magic) {
                    continue;
                }
                const path = eftPath(magic.EffectID);
                const effect_count = TextureManager.getTextureGroupCount(path);
                if (effect_count <= 0) {
                    continue;
                }
                const effect_frame = Math.trunc((pmo.frame * effect_count) / pmo.total_frames);
                TextureManager.renderTextureByName(path, effect_frame, pmo.position.x, pmo.position.y, RI(white, 224));
            }
        }
        const lmo = this.layer_magic_overlay_;
        if (lmo.magic && lmo.frame >= 0 && lmo.total_frames > 0) {
            const path = eftPath(lmo.magic.EffectID);
            const effect_count = TextureManager.getTextureGroupCount(path);
            if (effect_count > 0) {
                const effect_frame = Math.trunc((lmo.frame * effect_count) / lmo.total_frames);
                for (let ix = 0; ix < this.COORD_COUNT; ix++) {
                    for (let iy = 0; iy < this.COORD_COUNT; iy++) {
                        if (this.haveEffect(ix, iy)) {
                            const p = this.getPositionOnRender(ix, iy, this.man_x_, this.man_y_);
                            TextureManager.renderTextureByName(path, effect_frame, p.x, p.y, RI(white, 224));
                        }
                    }
                }
            }
        }
    }

    checkEnemyAttackBlockInput() {
        const block_pressed = Engine.checkKeyPress(K.K_E) || Engine.gameControllerGetButton(K.GAMEPAD_BUTTON_SOUTH);
        const pressed = block_pressed && !this.prev_block_pressed_;
        this.prev_block_pressed_ = block_pressed;
        return pressed;
    }

    getBlockingRoles(attacker) {
        if (!attacker) {
            return [];
        }
        return this.battle_roles_.filter((r) => r.Team !== attacker.Team && this.haveEffect(r.X(), r.Y()));
    }

    // the defenders block the attack and counter attack (expedition33)
    async blockAnimation(attacker, roles, counters = []) {
        const valid_roles = roles.filter((r) => r && this.battle_roles_.includes(r));
        if (!attacker || !valid_roles.length || !this.battle_roles_.includes(attacker)) {
            return;
        }
        try {
            const tile_scale = this.tileScale();
            const tex = TextureManager.getTexture('title', 203);
            if (!tex) {
                return;
            }
            tex.load();
            Audio.playASound(10);
            const total_frames = 16;
            for (let frame = 0; frame < total_frames; frame++) {
                for (const r of valid_roles) {
                    let act_type = -1;
                    for (let i = 0; i < 5; i++) {
                        if (r.FightFrame[i] > 0) {
                            act_type = i;
                            break;
                        }
                    }
                    r.ActType = act_type;
                    r.ActFrame = act_type >= 0 ? frame % r.FightFrame[act_type] : 0;
                    r.FaceTowards = this.calTowards(r.X(), r.Y(), attacker.X(), attacker.Y());
                }
                this.block_light_overlay_ = { roles: valid_roles, frame, total_frames };
                await this.drawAndPresent(1);
            }
            this.block_light_overlay_ = { roles: [], frame: -1, total_frames: 0 };
            this.block_role_offsets_.clear();
            const dodge_frames = 8;
            const rush_frames = 8;
            let attack_frames = 8;
            for (const c of counters) {
                if (c.magic) {
                    const path = eftPath(c.magic.EffectID);
                    await TextureManager.ensureGroup(path);
                    attack_frames = Math.max(attack_frames, TextureManager.getTextureGroupCount(path));
                }
            }
            const counter_effect_delay = 2;
            const dodge_dis = 48 * tile_scale;
            const rush_dis = 64 * tile_scale;
            const roleFrame = (r, frame) => {
                const frame_count = r.ActType >= 0 ? Math.max(1, r.FightFrame[r.ActType]) : 1;
                r.ActFrame = frame % frame_count;
            };
            for (let frame = 0; frame < dodge_frames; frame++) {
                const progress = (frame + 1) / dodge_frames;
                for (const r of valid_roles) {
                    const p1 = this.getPositionOnRender(r.X(), r.Y(), this.man_x_, this.man_y_);
                    const p2 = this.getPositionOnRender(attacker.X(), attacker.Y(), this.man_x_, this.man_y_);
                    let dx = p1.x - p2.x;
                    let dy = p1.y - p2.y;
                    let length = Math.sqrt(dx * dx + dy * dy);
                    if (length < 1) {
                        length = 1;
                        dx = 0;
                        dy = 1;
                    }
                    this.block_role_offsets_.set(r, new Point(Math.trunc((dx / length) * dodge_dis * progress),
                        Math.trunc((dy / length) * dodge_dis * progress)));
                    roleFrame(r, frame);
                }
                await this.drawAndPresent(1);
            }
            for (let frame = 0; frame < rush_frames; frame++) {
                const progress = (frame + 1) / rush_frames;
                for (const r of valid_roles) {
                    const p1 = this.getPositionOnRender(r.X(), r.Y(), this.man_x_, this.man_y_);
                    const p2 = this.getPositionOnRender(attacker.X(), attacker.Y(), this.man_x_, this.man_y_);
                    let dx = p2.x - p1.x;
                    let dy = p2.y - p1.y;
                    let length = Math.sqrt(dx * dx + dy * dy);
                    if (length < 1) {
                        length = 1;
                        dx = 0;
                        dy = -1;
                    }
                    const old = this.block_role_offsets_.get(r) || new Point(0, 0);
                    const target_x = Math.trunc((dx / length) * rush_dis);
                    const target_y = Math.trunc((dy / length) * rush_dis);
                    this.block_role_offsets_.set(r, new Point(Math.trunc(old.x + (target_x - old.x) * progress),
                        Math.trunc(old.y + (target_y - old.y) * progress)));
                    roleFrame(r, frame);
                }
                await this.drawAndPresent(1);
            }
            for (let frame = 0; frame < attack_frames; frame++) {
                for (const r of valid_roles) {
                    if (r.ActType >= 0) {
                        const role_frame_count = Math.max(1, r.FightFrame[r.ActType]);
                        r.ActFrame = Math.trunc((frame * role_frame_count) / attack_frames);
                    }
                }
                this.point_magic_overlay_ = {
                    position: this.getPositionOnRender(attacker.X(), attacker.Y(), this.man_x_, this.man_y_),
                    magics: counters.filter((c) => c.magic).map((c) => c.magic),
                    frame,
                    total_frames: attack_frames,
                };
                await this.drawAndPresent(counter_effect_delay);
            }
            this.point_magic_overlay_ = { position: new Point(), magics: [], frame: -1, total_frames: 0 };
        } finally {
            this.block_role_offsets_.clear();
        }
    }

    // the attacker rushes at the targets after a well timed attack (expedition33)
    async attackTimingSuccessAnimation(attacker, magic, roles) {
        if (!attacker || !magic || !this.battle_roles_.includes(attacker)) {
            return;
        }
        const valid_roles = roles.filter((r) => r && this.battle_roles_.includes(r));
        try {
            let act_type = magic.MagicType;
            if (act_type < 0 || act_type >= 5 || attacker.FightFrame[act_type] <= 0) {
                act_type = -1;
                for (let i = 0; i < 5; i++) {
                    if (attacker.FightFrame[i] > 0) {
                        act_type = i;
                        break;
                    }
                }
            }
            attacker.ActType = act_type;
            if (valid_roles.length) {
                attacker.FaceTowards = this.calTowards(attacker.X(), attacker.Y(), valid_roles[0].X(), valid_roles[0].Y());
            }
            const getTargetPosition = () => {
                if (!valid_roles.length) {
                    return this.getPositionOnRender(this.select_x_, this.select_y_, this.man_x_, this.man_y_);
                }
                let sum_x = 0;
                let sum_y = 0;
                for (const r of valid_roles) {
                    const p = this.getPositionOnRender(r.X(), r.Y(), this.man_x_, this.man_y_);
                    sum_x += p.x;
                    sum_y += p.y;
                }
                return new Point(Math.trunc(sum_x / valid_roles.length), Math.trunc(sum_y / valid_roles.length));
            };
            const tile_scale = this.tileScale();
            const back_dis = 36 * tile_scale;
            const rush_dis = 72 * tile_scale;
            const back_frames = 6;
            const rush_frames = 6;
            const frame_count = act_type >= 0 ? Math.max(1, attacker.FightFrame[act_type]) : 1;
            Audio.playASound(10);
            for (let frame = 0; frame < back_frames; frame++) {
                const progress = (frame + 1) / back_frames;
                const p1 = this.getPositionOnRender(attacker.X(), attacker.Y(), this.man_x_, this.man_y_);
                const p2 = getTargetPosition();
                let dx = p1.x - p2.x;
                let dy = p1.y - p2.y;
                let length = Math.sqrt(dx * dx + dy * dy);
                if (length < 1) {
                    length = 1;
                    dx = 0;
                    dy = 1;
                }
                this.block_role_offsets_.set(attacker, new Point(Math.trunc((dx / length) * back_dis * progress),
                    Math.trunc((dy / length) * back_dis * progress)));
                attacker.ActFrame = frame % frame_count;
                await this.drawAndPresent(1);
            }
            for (let frame = 0; frame < rush_frames; frame++) {
                const progress = (frame + 1) / rush_frames;
                const p1 = this.getPositionOnRender(attacker.X(), attacker.Y(), this.man_x_, this.man_y_);
                const p2 = getTargetPosition();
                let dx = p2.x - p1.x;
                let dy = p2.y - p1.y;
                let length = Math.sqrt(dx * dx + dy * dy);
                if (length < 1) {
                    length = 1;
                    dx = 0;
                    dy = -1;
                }
                const old = this.block_role_offsets_.get(attacker) || new Point(0, 0);
                const target_x = Math.trunc((dx / length) * rush_dis);
                const target_y = Math.trunc((dy / length) * rush_dis);
                this.block_role_offsets_.set(attacker, new Point(Math.trunc(old.x + (target_x - old.x) * progress),
                    Math.trunc(old.y + (target_y - old.y) * progress)));
                attacker.ActFrame = frame % frame_count;
                await this.drawAndPresent(1);
            }
            const path = eftPath(magic.EffectID);
            await TextureManager.ensureGroup(path);
            const effect_count = TextureManager.getTextureGroupCount(path);
            const effect_frames = Math.max(8, effect_count);
            for (let frame = 0; frame < effect_frames && effect_count > 0; frame++) {
                if (act_type >= 0) {
                    attacker.ActFrame = Math.trunc((frame * frame_count) / effect_frames);
                }
                this.layer_magic_overlay_ = { magic, frame, total_frames: effect_frames };
                await this.drawAndPresent(1);
            }
            this.layer_magic_overlay_ = { magic: null, frame: -1, total_frames: 0 };
            attacker.ActFrame = 0;
            attacker.ActType = -1;
        } finally {
            this.block_role_offsets_.clear();
        }
    }

    resetBattleAnimationState() {
        this.block_role_offsets_.clear();
        this.block_light_overlay_ = { roles: [], frame: -1, total_frames: 0 };
        this.point_magic_overlay_ = { position: new Point(), magics: [], frame: -1, total_frames: 0 };
        this.layer_magic_overlay_ = { magic: null, frame: -1, total_frames: 0 };
        this.effect_frame_ = 0;
        this.effect_id_ = -1;
        this.effect_attack_area_type_ = -1;
        this.x_ = 0;
        this.y_ = 0;
        this.prev_block_pressed_ = false;
        for (const r of this.battle_roles_) {
            r.ActType = -1;
            r.ActFrame = 0;
        }
    }

    // battle_roles_ keeps its order, plus the roles found on the role layer
    syncBattleRolesFromLayer() {
        const layer_roles = [];
        for (let x = 0; x < this.COORD_COUNT; x++) {
            for (let y = 0; y < this.COORD_COUNT; y++) {
                const r = this.role_layer_.data(x, y);
                if (r && r.HP > 0 && !r.Dead && !layer_roles.includes(r)) {
                    layer_roles.push(r);
                }
            }
        }
        const synced = [];
        for (const r of this.battle_roles_) {
            if (layer_roles.includes(r) && !synced.includes(r)) {
                synced.push(r);
            }
        }
        for (const r of layer_roles) {
            if (!synced.includes(r)) {
                synced.push(r);
            }
        }
        this.battle_roles_ = synced;
    }

    // the hurt of r1 attacking r2 with the magic, a positive number
    calMagicHurt(r1, r2, magic, dis = -1) {
        let level_index = Save.getRoleLearnedMagicLevelIndex(r1, magic);
        level_index = magic.calMaxLevelIndexByMP(r1.MP, level_index);
        if (magic.HurtType === 0) {
            if (r1.MP <= 10) {
                return 1 + this.rand_.rand_int(10);
            }
            let attack = r1.Attack + Math.trunc(magic.Attack[level_index] / 3);
            let defence = r2.Defence;
            for (const e of [r1.Equip0, r1.Equip1]) {
                const i = e >= 0 ? Save.getItem(e) : null;
                if (i) {
                    attack += i.AddAttack;
                }
            }
            for (const e of [r2.Equip0, r2.Equip1]) {
                const i = e >= 0 ? Save.getItem(e) : null;
                if (i) {
                    defence += i.AddDefence;
                }
            }
            let v = attack - defence;
            // weaker with the distance
            if (dis === -1) {
                dis = this.calRoleDistance(r1, r2);
            }
            if (dis > 1) {
                v = Math.trunc(v / Math.exp((dis - 1) / 10.0));
            }
            v += this.rand_.rand_int(10) - this.rand_.rand_int(10);
            if (v < 10) {
                v = 1 + this.rand_.rand_int(10);
            }
            return v;
        } else if (magic.HurtType === 1) {
            let v = magic.HurtMP[level_index];
            v += this.rand_.rand_int(10) - this.rand_.rand_int(10);
            if (v < 10) {
                v = 1 + this.rand_.rand_int(10);
            }
            return v;
        }
        return 0;
    }

    calMagiclHurtAllEnemies(r, m, simulation = false) {
        let total = 0;
        for (const r2 of this.battle_roles_) {
            // enemies in the effect
            if (r2.Team !== r.Team && this.haveEffect(r2.X(), r2.Y())) {
                let hurt = this.calMagicHurt(r, r2, m);
                if (!simulation) {
                    r2.Show.BattleHurt = hurt;
                    if (m.HurtType === 0) {
                        const temp = clamp(r2.Show.BattleHurt, -(r2.MaxHP - r2.HP), r2.HP);
                        r.ExpGot += temp;
                        if (r2.HP === temp) {
                            r.ExpGot += Math.trunc(temp / 2);
                        }
                        r2.Show.ProgressChange = -Math.trunc(hurt / 5);
                    } else if (m.HurtType === 1) {
                        const prevMP = r2.MP;
                        r2.MP = clamp(r2.MP - hurt, 0, r2.MaxMP);
                        r.MP = clamp(r.MP + hurt, 0, r.MaxMP);
                        r.ExpGot += Math.trunc((prevMP - r2.MP) / 2);
                    }
                } else {
                    // the score of the AI
                    if (r.AttackTwice) {
                        hurt *= 2;
                    }
                    if (m.HurtType === 0) {
                        if (hurt >= r2.HP) {
                            hurt = Math.trunc(1.25 * r2.HP);
                        }
                    } else if (m.HurtType === 1) {
                        hurt = Math.trunc(hurt / 5);
                    }
                }
                total += hurt;
            }
        }
        return total;
    }

    // a positive number
    calHiddenWeaponHurt(r1, r2, item, dis = -1) {
        let v = r1.HiddenWeapon - item.AddHP;
        v += this.rand_.rand_int(10) - this.rand_.rand_int(10);
        if (dis === -1) {
            dis = this.calRoleDistance(r1, r2);
        }
        // integer division in the exponent, like the C++ code
        v = Math.trunc(v / Math.exp(Math.trunc((dis - 1) / 10)));
        if (v < 1) {
            v = 1;
        }
        return v;
    }

    async showMagicName(name) {
        const magic_name = new TextBox();
        magic_name.setText(name);
        const x = Math.trunc(Engine.getUIWidth() / 2) - Math.trunc((textDrawSize(name) * 10) / 2) - 10;
        magic_name.setPosition(x, 150);
        magic_name.setFontSize(20);
        magic_name.setStayFrame(40);
        await magic_name.run();
    }

    // floating numbers, with gradual changes of { o, k, d } (object, key, total change)
    async showNumberAnimation(delay = animation_delay_, floating = true, animated_changes = []) {
        let need_show = false;
        let single_loop_frames = 15;
        for (const r of this.battle_roles_) {
            if (animated_changes.length || r.Show.ShowStrings.length) {
                need_show = true;
            }
            if (r.Show.Effect !== -1) {
                need_show = true;
                const path = eftPath(r.Show.Effect);
                await TextureManager.ensureGroup(path);
                single_loop_frames = Math.max(single_loop_frames, TextureManager.getTextureGroupCount(path));
            }
        }
        if (!need_show) {
            return;
        }
        const total_frames = single_loop_frames * delay;
        const white = C(255, 255, 255, 255);
        for (let i_frame = 0; i_frame < single_loop_frames; i_frame++) {
            if (this.exit_) {
                break;
            }
            await this.drawAndPresent(delay, () => {
                for (const r of this.battle_roles_) {
                    const p = this.getPositionOnWindow(r.X(), r.Y(), this.man_x_, this.man_y_);
                    if (r.Show.Effect !== -1) {
                        TextureManager.renderTextureByName(eftPath(r.Show.Effect), i_frame, p.x, p.y, RI(white, 224));
                    }
                    let y_pos = -75;
                    for (const s of r.Show.ShowStrings) {
                        const x = p.x - Math.trunc((s.Size * utf8Length(s.Text)) / 4);
                        const y = floating ? p.y - i_frame * 2 + y_pos : p.y - total_frames + y_pos;
                        const alpha = clamp(255 - Math.trunc(255 / total_frames) * i_frame, 0, 255);
                        Font.draw(s.Text, s.Size, x, y, s.Color, alpha);
                        y_pos += s.Size + 2;
                    }
                }
                for (const c of animated_changes) {
                    c.o[c.k] += Math.trunc(c.d / total_frames);
                }
            });
        }
        // the remainders of the divisions
        for (const c of animated_changes) {
            c.o[c.k] += c.d - total_frames * Math.trunc(c.d / total_frames);
        }
    }

    // the HP bar over a role
    renderExtraRoleInfo(r, x, y) {
        if (!r) {
            return;
        }
        const outline_color = C(0, 0, 0, 128);
        const background_color = r.Team === 1 ? C(255, 0, 0, 128) : C(0, 255, 0, 128);
        const tile_scale = this.tileScale();
        const hp_max_w = 24 * tile_scale;
        const hp_x = x - Math.trunc(hp_max_w / 2);
        const hp_y = y - 60 * tile_scale;
        const hp_h = 3 * tile_scale;
        const perc = Math.max(0, r.HP / r.MaxHP);
        const alpha = r.HP <= 0 ? this.dead_alpha_ / 255.0 : 1;
        Engine.renderSquareTexture({ x: hp_x, y: hp_y, w: hp_max_w, h: hp_h }, outline_color, Math.trunc(128 * alpha));
        Engine.renderSquareTexture({ x: hp_x, y: hp_y, w: Math.trunc(perc * hp_max_w), h: hp_h }, background_color, Math.trunc(192 * alpha));
        this.renderShieldInfo(r, hp_x, hp_y, hp_max_w, alpha);
    }

    renderShieldInfo(r, hp_x, hp_y, hp_max_w, alpha) {
        if (!this.expedition33_ || !r || r.Sheild <= 0) {
            return;
        }
        const tile_scale = this.tileScale();
        const shield_size = 5 * tile_scale;
        const shield_gap = tile_scale;
        const shield_y = hp_y + 5 * tile_scale;
        for (let i = 0; i < r.Sheild; i++) {
            TextureManager.renderTextureByName('title', 201, hp_x + i * (shield_size + shield_gap), shield_y,
                RI(C(255, 255, 255, 255), Math.trunc(224 * alpha)), shield_size, shield_size);
        }
    }

    // the defeated roles fade out and leave the field
    async clearDead() {
        this.resetBattleAnimationState();
        const roles_to_check = [...this.battle_roles_];
        for (let x = 0; x < this.COORD_COUNT; x++) {
            for (let y = 0; y < this.COORD_COUNT; y++) {
                const r = this.role_layer_.data(x, y);
                if (r && !roles_to_check.includes(r)) {
                    roles_to_check.push(r);
                }
            }
        }
        if (!roles_to_check.some((r) => r.HP <= 0 || r.Dead)) {
            return;
        }
        for (const r of roles_to_check) {
            if (r.HP <= 0 || r.Dead) {
                r.Dead = 1;
                r.ActType = -1;
                r.ActFrame = 0;
                r.clearShow();
            }
        }
        while (this.dead_alpha_ > 0) {
            this.dead_alpha_ = Math.max(0, this.dead_alpha_ - 25);
            await this.drawAndPresent(animation_delay_);
        }
        this.dead_alpha_ = 255;
        for (const r of roles_to_check) {
            if (r.HP <= 0 || r.Dead) {
                r.setPosition(-1, -1);
                r.HP = 0;
                r.Dead = 1;
            }
        }
        this.syncBattleRolesFromLayer();
        if (this.battle_roles_.length) {
            this.man_x_ = this.battle_roles_[0].X();
            this.man_y_ = this.battle_roles_[0].Y();
        }
        this.resetBattleAnimationState();
    }

    poisonEffect(r) {
        if (r) {
            // high anti poison removes poison
            r.Poison -= r.AntiPoison;
            r.Poison = clamp(r.Poison, 0, Role.getMaxValue().Poison);
            r.HP -= Math.trunc(r.Poison / 3);
            if (r.HP < 1) {
                r.HP = 1;
            }
        }
    }

    getTeamMateCount(team) {
        return this.battle_roles_.filter((r) => r.Team === team && !r.Dead).length;
    }

    // 0: we won, 1: the enemies won, -1: not finished
    checkResult() {
        this.syncBattleRolesFromLayer();
        const team0 = this.getTeamMateCount(0);
        if (team0 > 0 && team0 === this.battle_roles_.length) {
            return 0;
        }
        if (team0 === 0 && this.battle_roles_.length > 0) {
            return 1;
        }
        return -1;
    }

    async calExpGot() {
        this.head_self_.setVisible(false);
        const alive_teammate = this.result_ === 0 ? this.battle_roles_.filter((r) => r.Team === 0) : [...this.friends_];
        for (const r of alive_teammate) {
            r.ExpGot += Math.trunc(this.info_.Exp / alive_teammate.length);
        }
        const show_exp = new ShowExp();
        show_exp.setText(this.result_ === 0 ? '勝利獲得經驗' : '失敗也有經驗');
        show_exp.setRoles(alive_teammate);
        Engine.flushEvent();
        await show_exp.run();
        // level up and practice items
        const diff = new ShowRoleDifference();
        for (const r of alive_teammate) {
            if (this.exit_) {
                break;
            }
            let r0 = r.clone();
            const item = Save.getItem(r.PracticeItem);
            const max = Role.getMaxValue();
            if (r.Level >= max.Level) {
                r.ExpForItem += r.ExpGot;
            } else if (item) {
                r.Exp += Math.trunc(r.ExpGot / 2);
                r.ExpForItem += Math.trunc(r.ExpGot / 2);
            } else {
                r.Exp += r.ExpGot;
            }
            r.ExpForMakeItem += r.ExpGot;
            // overflow
            if (r.Exp < r0.Exp) {
                r.Exp = max.Exp;
            }
            if (r.ExpForItem < r0.ExpForItem) {
                r.ExpForItem = max.Exp;
            }
            let change = 0;
            while (r.canLevelUp()) {
                r.levelUp();
                change++;
            }
            if (change) {
                diff.setTwinRole(r0, r);
                diff.setText('升級');
                await diff.run();
            }
            if (item) {
                r0 = r.clone();
                change = 0;
                while (r.canFinishedItem()) {
                    r.useItem(item);
                    change++;
                }
                if (change) {
                    diff.setTwinRole(r0, r);
                    diff.setText(`修煉${item.Name}成功`);
                    await diff.run();
                }
                if (item.MakeItem[0] >= 0 && r.ExpForMakeItem >= item.NeedExpForMakeItem && Event.getInstance().haveItemBool(item.NeedMaterial)) {
                    const make_item = [];
                    for (let i = 0; i < 5; i++) {
                        if (item.MakeItem[i] >= 0) {
                            make_item.push([item.MakeItem[i], item.MakeItemCount[i]]);
                        }
                    }
                    const [id, count] = make_item[this.rand_.rand_int(make_item.length)];
                    await Event.getInstance().addItemWithNotice(id, count, `${r.Name}修煉${item.Name}製藥成功`);
                    Event.getInstance().addItemWithoutHint(item.NeedMaterial, -1);
                    r.ExpForMakeItem = 0;
                }
            }
        }
    }

    // 45 degree map coordinates to orthogonal (real time battles)
    pos45To90(x, y) {
        const TILE_W = Scene.TILE_W;
        return new Pointf(-y * TILE_W + x * TILE_W + this.COORD_COUNT * TILE_W, y * TILE_W + x * TILE_W);
    }

    pos90To45(x, y) {
        const TILE_W = Scene.TILE_W;
        x -= this.COORD_COUNT * TILE_W;
        // std::round rounds halves away from zero
        const round = (v) => Math.sign(v) * Math.round(Math.abs(v));
        return new Point(round((x / TILE_W + y / TILE_W) / 2), round((-x / TILE_W + y / TILE_W) / 2));
    }

    // the whole ground of the battle field in one texture
    async makeEarthTexture() {
        const TILE_W = Scene.TILE_W;
        const TILE_H = Scene.TILE_H;
        const W = this.COORD_COUNT * TILE_W * 2;
        const H = this.COORD_COUNT * TILE_H * 2;
        await TextureManager.ensureGroup('battle-earth');
        const use_image = TextureManager.getTextureGroup('battle-earth').getTextureCount() > 0;
        if (use_image) {
            await TextureManager.preload('battle-earth', [this.info_.BattleFieldID]);
        } else {
            const nums = new Set();
            for (let i = 0; i < this.earth_layer_.squareSize(); i++) {
                const num = Math.trunc(this.earth_layer_.data1(i) / 2);
                if (num > 0) {
                    nums.add(num);
                }
            }
            await TextureManager.ensureGroup('smap');
            await TextureManager.preload('smap', [...nums]);
        }
        const engine = Engine;
        engine.createRenderedTexture('earth', W, H);
        engine.setRenderTarget('earth');
        engine.fillColor(C(0, 0, 0, 255), 0, 0, W, H);
        if (use_image) {
            TextureManager.renderTextureByName('battle-earth', this.info_.BattleFieldID, 0, 0);
        } else {
            for (let i1 = 0; i1 < this.COORD_COUNT; i1++) {
                for (let i2 = 0; i2 < this.COORD_COUNT; i2++) {
                    const p = this.getPositionOnWholeEarth(i1, i2);
                    const num = Math.trunc(this.earth_layer_.data(i1, i2) / 2);
                    if (num > 0) {
                        TextureManager.renderTextureByName('smap', num, p.x, p.y);
                    }
                }
            }
        }
        engine.resetRenderTarget();
    }
}
