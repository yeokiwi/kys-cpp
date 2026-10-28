// MainScene: the world map (MainScene.cpp)
import { CloudGroup, Weather } from './Cloud.js';
import { C, RI } from './Color.js';
import { Console } from './Console.js';
import { DayNightSystem } from './DayNightSystem.js';
import { Engine } from './Engine.js';
import { readBinary } from './Files.js';
import * as K from './Keys.js';
import { Point, Pointf, Towards_LeftDown, Towards_LeftUp, Towards_None, Towards_RightDown, Towards_RightUp, realTowardsToFaceTowards } from './Point.js';
import { Save } from './Save.js';
import { Scene } from './Scene.js';
import { SubScene } from './SubScene.js';
import { TextureManager } from './TextureManager.js';
import { MAINMAP_COORD_COUNT, MapSquare } from './Types.js';
import { UI } from './UI.js';
import { UISave } from './UISave.js';
import { RandomDouble } from './util.js';

export const ObjectMaterial = { Water: 0, Wood: 1, Stone: 2 };

class MapObject {
    constructor() {
        this.tex_ = null;
        this.can_walk_ = 0;
        this.material_ = ObjectMaterial.Stone;
    }

    getTexture() {
        return this.tex_;
    }
}

let instance = null;

export class MainScene extends Scene {
    constructor() {
        super();
        this.full_window_ = 1;
        this.COORD_COUNT = MAINMAP_COORD_COUNT;
        this.MAN_PIC_0 = 2501;
        this.MAN_PIC_COUNT = 7;
        this.REST_PIC_0 = 2529;
        this.REST_PIC_COUNT = 6;
        this.SHIP_PIC_0 = 3715;
        this.SHIP_PIC_COUNT = 4;
        this.BEGIN_REST_TIME = 200;
        this.REST_INTERVAL = 15;
        this.force_submap_ = -1;
        this.force_submap_x_ = -1;
        this.force_submap_y_ = -1;
        this.force_event_ = -1;
        this.view_cloud_ = 0;
        this.data_readed_ = false;
        this.building_vec_ = [];
    }

    static getInstance() {
        if (!instance) {
            instance = new MainScene();
        }
        return instance;
    }

    // replaces the synchronous file reading of the C++ constructor
    static async init() {
        const ms = MainScene.getInstance();
        if (ms.data_readed_) {
            return ms;
        }
        await TextureManager.ensureGroups(['mmap', 'mmap-earth', 'cloud']);
        const n = ms.COORD_COUNT;
        const read = async (name) => {
            const m = new MapSquare(n, Int16Array);
            const buf = await readBinary(`resource/${name}`);
            if (buf) {
                m.data_.set(new Int16Array(buf.slice(0, Math.min(buf.byteLength, n * n * 2) & ~1)));
            }
            return m;
        };
        const [earth, surface, building, bx, by] = await Promise.all(
            ['earth.002', 'surface.002', 'building.002', 'buildx.002', 'buildy.002'].map(read));
        ms.earth_layer_ = new MapSquare(n);
        ms.surface_layer_ = new MapSquare(n);
        ms.building_layer_ = new MapSquare(n);
        ms.build_x_layer_ = bx;
        ms.build_y_layer_ = by;
        ms.divide2(earth, ms.earth_layer_);
        ms.divide2(surface, ms.surface_layer_);
        ms.divide2(building, ms.building_layer_);
        ms.data_readed_ = true;
        ms.cloud_group_ = new CloudGroup();
        ms.cloud_group_.init(100, n * Scene.TILE_W * 2, n * Scene.TILE_H * 2);
        ms.addChild(ms.cloud_group_);
        ms.addChild(Weather.getInstance());
        return ms;
    }

    divide2(m1, m) {
        for (let i = 0; i < m1.squareSize(); i++) {
            const v = Math.trunc(m1.data_[i] / 2);
            m1.data_[i] = v;
            const a = new MapObject();
            m.data_[i] = a;
            if (v > 0) {
                a.tex_ = TextureManager.getTexture('mmap', v);
                const pic = v;
                if (pic === 419 || (pic >= 306 && pic <= 335)) {
                    a.material_ = ObjectMaterial.Water;
                    a.can_walk_ = 0;
                } else if ((pic >= 179 && pic <= 181) || (pic >= 253 && pic <= 335) || (pic >= 508 && pic <= 511)) {
                    a.material_ = ObjectMaterial.Water;
                    a.can_walk_ = 1;
                } else if ((pic >= 1008 && pic <= 1164) || (pic >= 1214 && pic <= 1238)) {
                    a.material_ = ObjectMaterial.Wood;
                }
            } else {
                a.tex_ = null;
            }
        }
    }

    draw() {
        const ambient = DayNightSystem.getInstance().getLighting().ambient_color;
        const TILE_W = Scene.TILE_W;
        const TILE_H = Scene.TILE_H;
        Engine.setRenderTarget('scene');
        const buildings = this.building_vec_;
        let building_count = 0;
        Engine.fillColor(C(0, 0, 0, 255), 0, 0, -1, -1);
        const hasEarth = TextureManager.getTextureGroup('mmap-earth').getTextureCount() > 0;
        if (hasEarth) {
            const earth_size = TILE_W * 480 * 2;
            const pe = this.getPositionOnRender(0, 0, this.man_x_, this.man_y_);
            const earth_x = pe.x - earth_size / 2;
            const earth_y = pe.y - TILE_H * 2 + 1;
            const [view_w, view_h] = Engine.getAssistTextureSize('scene');
            Engine.createRenderedTexture('temp', view_w, view_h);
            Engine.setRenderTarget('temp');
            Engine.fillColorDirect(C(0, 0, 0, 0), 0, 0, -1, -1, K.BLENDMODE_NONE);
            for (let i = 0; i < 8; i++) {
                for (let j = 0; j < 8; j++) {
                    const x = Math.trunc((i * earth_size) / 8 + earth_x);
                    const y = Math.trunc((j * earth_size) / 8 / 2 + earth_y);
                    const w = earth_size / 8;
                    const h = earth_size / 8 / 2;
                    if (x > view_w || y > view_h || x + w < 0 || y + h < 0) {
                        continue;
                    }
                    TextureManager.renderTextureByName('mmap-earth', i + j * 8, x, y);
                }
            }
            Engine.setRenderTarget('scene');
            const temp = Engine.getTexture('temp');
            Engine.setColor(temp, C(255, 255, 255, 255));
            Engine.renderTextureLight(temp, null, { x: 0, y: 0, w: view_w, h: view_h }, [ambient, ambient, ambient, ambient], [0.5, 0, 0, 0]);
        }
        for (let sum = -this.view_sum_region_; sum <= this.view_sum_region_ + 15; sum++) {
            for (let i = -this.view_width_region_; i <= this.view_width_region_; i++) {
                const ix = this.man_x_ + i + Math.trunc(sum / 2);
                const iy = this.man_y_ - i + (sum - Math.trunc(sum / 2));
                const p = this.getPositionOnRender(ix, iy, this.man_x_, this.man_y_);
                p.x += this.x_;
                p.y += this.y_;
                if (this.isOutLine(ix, iy)) {
                    continue;
                }
                if (!hasEarth) {
                    const e = this.earth_layer_.data(ix, iy).getTexture();
                    if (e) {
                        TextureManager.renderTexture(e, p.x, p.y, RI(ambient));
                    }
                    const s = this.surface_layer_.data(ix, iy).getTexture();
                    if (s) {
                        TextureManager.renderTexture(s, p.x, p.y, RI(ambient));
                    }
                }
                const tex = this.building_layer_.data(ix, iy).getTexture();
                if (tex) {
                    const c = ((ix + iy) - Math.trunc((tex.w + TILE_W * 2 - 1) / (TILE_W * 2)) - Math.trunc((tex.dy - tex.h + 1) / Math.trunc(TILE_H / 2))) * 1024 + ix;
                    buildings[building_count++] = { index: 2 * c + 1, tex, p };
                }
                if (ix === this.man_x_ && iy === this.man_y_) {
                    if (this.isWater(this.man_x_, this.man_y_)) {
                        this.man_pic_ = this.SHIP_PIC_0 + this.towards_ * this.SHIP_PIC_COUNT + this.step_;
                    } else {
                        this.man_pic_ = this.MAN_PIC_0 + this.towards_ * this.MAN_PIC_COUNT + this.step_;
                        if (this.rest_time_ >= this.BEGIN_REST_TIME) {
                            this.man_pic_ = this.REST_PIC_0 + this.towards_ * this.REST_PIC_COUNT
                                + Math.trunc((this.rest_time_ - this.BEGIN_REST_TIME) / this.REST_INTERVAL) % this.REST_PIC_COUNT;
                        }
                    }
                    const c = 1024 * (ix + iy) + ix;
                    buildings[building_count++] = { index: 2 * c, tex: TextureManager.getTexture('mmap', this.man_pic_), p };
                }
            }
        }
        const list = buildings.slice(0, building_count).sort((a, b) => a.index - b.index);
        const cv = [ambient, ambient, ambient, ambient];
        const bv = [1, 0, 0, 0];
        const info = RI(ambient, 255, 1, 1, 0, 0, cv, bv);
        for (const d of list) {
            TextureManager.renderTexture(d.tex, d.p.x, d.p.y, info);
        }
        const p = this.getPositionOnRender(this.cursor_x_, this.cursor_y_, this.man_x_, this.man_y_);
        TextureManager.renderTextureByName('mmap', 1, p.x, p.y, RI(C(255, 255, 255, 255), 128));
        Engine.renderTextureToMain('scene');
    }

    backRun() {
        this.rest_time_++;
        this.view_cloud_ = this.cloud_group_.setPositionOnScreen(this.man_x_, this.man_y_, this.render_center_x_, this.render_center_y_);
        Weather.getInstance().setWeather(this.inNorth(), this.view_cloud_);
    }

    async dealEvent(e) {
        const engine = Engine;
        if (this.force_submap_ >= 0) {
            this.setVisible(true);
            const sub_map = new SubScene(this.force_submap_);
            sub_map.setManViewPosition(this.force_submap_x_, this.force_submap_y_);
            sub_map.setTowards(this.towards_);
            sub_map.setForceBeginEvent(this.force_event_);
            await sub_map.run();
            this.towards_ = sub_map.towards_;
            this.force_submap_ = -1;
            this.force_event_ = -1;
        }
        if ((e.type === K.EVENT_KEY_UP && e.key.key === K.K_TAB)
            || (e.type === K.EVENT_GAMEPAD_BUTTON_UP && e.gbutton.button === K.GAMEPAD_BUTTON_BACK)) {
            await new Console().run();
        }
        if ((e.type === K.EVENT_KEY_UP && e.key.key === K.K_ESCAPE)
            || (e.type === K.EVENT_MOUSE_BUTTON_UP && e.button.button === K.BUTTON_RIGHT)
            || engine.gameControllerGetButton(K.GAMEPAD_BUTTON_START)) {
            await UI.getInstance().run();
        }
        let x = this.man_x_;
        let y = this.man_y_;
        if (engine.getTicks() - this.pre_pressed_ticks_ > Scene.key_walk_delay_) {
            let pressed = 0;
            this.pre_pressed_ticks_ = engine.getTicks();
            pressed = MainScene.readWalkInput(engine, this.pre_pressed_);
            this.pre_pressed_ = pressed;
            if (pressed) {
                if (this.total_step_ < 1 || this.total_step_ >= this.first_step_delay_) {
                    this.changeTowardsByKey(pressed);
                    const t = Scene.getTowardsPosition(this.man_x_, this.man_y_, this.towards_);
                    if (t) {
                        [x, y] = t;
                    }
                    this.tryWalk(x, y);
                }
                this.total_step_++;
            } else if (this.rest_time_ > 2) {
                this.total_step_ = 0;
            }
            if (pressed && (await this.checkEntrance(x, y))) {
                this.way_que_ = [];
                this.total_step_ = 0;
            }
            if (this.way_que_.length) {
                const p = this.way_que_[this.way_que_.length - 1];
                x = p.x;
                y = p.y;
                const tw = this.calTowards(this.man_x_, this.man_y_, x, y);
                if (tw !== Towards_None) {
                    this.towards_ = tw;
                }
                this.tryWalk(x, y);
                this.way_que_.pop();
                if (!this.way_que_.length && this.mouse_event_x_ >= 0 && this.mouse_event_y_ >= 0) {
                    this.towards_ = this.calTowards(this.man_x_, this.man_y_, this.mouse_event_x_, this.mouse_event_y_);
                    if (await this.checkEntrance(this.mouse_event_x_, this.mouse_event_y_)) {
                        this.way_que_ = [];
                        this.setMouseEventPoint(-1, -1);
                    }
                }
            }
        }
        this.calCursorPosition(this.man_x_, this.man_y_);
        if (e.type === K.EVENT_MOUSE_BUTTON_UP && e.button.button === K.BUTTON_LEFT) {
            this.setMouseEventPoint(-1, -1);
            const [mx, my] = engine.getMouseStateInStartWindow();
            const p = this.getMousePosition(mx, my, x, y);
            this.way_que_ = [];
            if (this.canWalk(p.x, p.y)) {
                this.FindWay(x, y, p.x, p.y);
            }
            if (this.isBuilding(p.x, p.y)) {
                const bx = this.build_x_layer_.data(p.x, p.y);
                const by = this.build_y_layer_.data(p.x, p.y);
                let found = false;
                for (let ix = bx + 1; ix > bx - 9 && !found; ix--) {
                    for (let iy = by + 1; iy > by - 9; iy--) {
                        if (!this.isOutLine(ix, iy) && this.build_x_layer_.data(ix, iy) === bx && this.build_y_layer_.data(ix, iy) === by
                            && (await this.checkEntrance(ix, iy, true))) {
                            p.x = ix;
                            p.y = iy;
                            found = true;
                            break;
                        }
                    }
                }
                if (found) {
                    const ps = [];
                    if (this.canWalk(p.x - 1, p.y)) {
                        ps.push(new Point(p.x - 1, p.y));
                    }
                    if (this.canWalk(p.x + 1, p.y)) {
                        ps.push(new Point(p.x + 1, p.y));
                    }
                    if (this.canWalk(p.x, p.y - 1)) {
                        ps.push(new Point(p.x, p.y - 1));
                    }
                    if (this.canWalk(p.x, p.y + 1)) {
                        ps.push(new Point(p.x, p.y + 1));
                    }
                    if (ps.length) {
                        const i = new RandomDouble().rand_int(ps.length);
                        this.FindWay(x, y, ps[i].x, ps[i].y);
                        this.setMouseEventPoint(p.x, p.y);
                    }
                }
            }
        }
    }

    // keyboard / gamepad direction used by both the main map and sub scenes
    static readWalkInput(engine, pre_pressed) {
        let pressed = 0;
        let ax = engine.gameControllerGetAxis(K.GAMEPAD_AXIS_LEFTX);
        let ay = engine.gameControllerGetAxis(K.GAMEPAD_AXIS_LEFTY);
        if (Math.abs(ax) < 10000) {
            ax = 0;
        }
        if (Math.abs(ay) < 10000) {
            ay = 0;
        }
        if (ax !== 0 || ay !== 0) {
            const to = realTowardsToFaceTowards(new Pointf(ax, ay));
            if (to === Towards_LeftUp) {
                pressed = K.K_LEFT;
            }
            if (to === Towards_LeftDown) {
                pressed = K.K_DOWN;
            }
            if (to === Towards_RightDown) {
                pressed = K.K_RIGHT;
            }
            if (to === Towards_RightUp) {
                pressed = K.K_UP;
            }
        }
        if (engine.gameControllerGetButton(K.GAMEPAD_BUTTON_DPAD_LEFT)) {
            pressed = K.K_LEFT;
        }
        if (engine.gameControllerGetButton(K.GAMEPAD_BUTTON_DPAD_DOWN)) {
            pressed = K.K_DOWN;
        }
        if (engine.gameControllerGetButton(K.GAMEPAD_BUTTON_DPAD_RIGHT)) {
            pressed = K.K_RIGHT;
        }
        if (engine.gameControllerGetButton(K.GAMEPAD_BUTTON_DPAD_UP)) {
            pressed = K.K_UP;
        }
        if (engine.checkKeyPress(K.K_A)) {
            pressed = K.K_LEFT;
        }
        if (engine.checkKeyPress(K.K_S)) {
            pressed = K.K_DOWN;
        }
        if (engine.checkKeyPress(K.K_D)) {
            pressed = K.K_RIGHT;
        }
        if (engine.checkKeyPress(K.K_W)) {
            pressed = K.K_UP;
        }
        for (const k of [K.K_RIGHT, K.K_LEFT, K.K_DOWN, K.K_UP]) {
            if (k !== pre_pressed && engine.checkKeyPress(k)) {
                pressed = k;
            }
        }
        if (pressed === 0 && engine.checkKeyPress(pre_pressed)) {
            pressed = pre_pressed;
        }
        return pressed;
    }

    async onEntrance() {
        this.calViewRegion();
    }

    async onExit() {}

    async onPressedCancel() {}

    tryWalk(x, y) {
        if (this.canWalk(x, y)) {
            this.man_x_ = x;
            this.man_y_ = y;
        }
        this.step_++;
        if (this.isWater(this.man_x_, this.man_y_)) {
            this.step_ = this.step_ % this.SHIP_PIC_COUNT;
        } else if (this.step_ >= this.MAN_PIC_COUNT) {
            this.step_ = 1;
        }
        this.rest_time_ = 0;
    }

    isBuilding(x, y) {
        if (this.isOutLine(x, y)) {
            return false;
        }
        const bx = this.build_x_layer_.data(x, y);
        const by = this.build_y_layer_.data(x, y);
        if (this.isOutLine(bx, by)) {
            return false;
        }
        return this.building_layer_.data(bx, by).getTexture() !== null;
    }

    isWater(x, y) {
        if (this.isOutLine(x, y)) {
            return 0;
        }
        return this.earth_layer_.data(x, y).material_ === ObjectMaterial.Water ? 1 : 0;
    }

    isOutScreen(x, y) {
        return Math.abs(this.man_x_ - x) >= 2 * this.view_width_region_ || Math.abs(this.man_y_ - y) >= this.view_sum_region_;
    }

    canWalk(x, y) {
        return !(this.isOutLine(x, y) || this.isBuilding(x, y));
    }

    async checkEntrance(x, y, only_check = false) {
        const infos = Save.getSubMapInfos();
        for (let i = 0; i < infos.length; i++) {
            const s = infos[i];
            if ((x === s.MainEntranceX1 && y === s.MainEntranceY1) || (x === s.MainEntranceX2 && y === s.MainEntranceY2)) {
                let can_enter = false;
                if (s.EntranceCondition === 0) {
                    can_enter = true;
                } else if (s.EntranceCondition === 2) {
                    for (const r of Save.Team) {
                        const role = Save.getRole(r);
                        if (role && role.Speed >= 70) {
                            can_enter = true;
                            break;
                        }
                    }
                }
                if (only_check) {
                    return true;
                }
                if (can_enter) {
                    await UISave.autoSave();
                    await this.drawAndPresent();
                    const sub_map = new SubScene(i);
                    sub_map.setManViewPosition(s.EntranceX, s.EntranceY);
                    await sub_map.run();
                    this.towards_ = sub_map.towards_;
                    return true;
                }
            }
        }
        return false;
    }

    forceEnterSubScene(submap_id, x, y, event = -1) {
        this.force_submap_ = submap_id;
        if (x >= 0) {
            this.force_submap_x_ = x;
        }
        if (y >= 0) {
            this.force_submap_y_ = y;
        }
        this.force_event_ = event;
        this.setVisible(false);
    }

    inNorth() {
        return this.man_x_ + this.man_y_ <= 220;
    }

    getViewCloud() {
        return this.view_cloud_;
    }
}
