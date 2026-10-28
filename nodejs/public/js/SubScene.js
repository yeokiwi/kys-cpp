// SubScene: interior maps (SubScene.cpp)
import { Audio } from './Audio.js';
import { Weather } from './Cloud.js';
import { C, RI } from './Color.js';
import { Console } from './Console.js';
import { DayNightSystem } from './DayNightSystem.js';
import { Engine } from './Engine.js';
import { Event } from './Event.js';
import * as K from './Keys.js';
import { MainScene } from './MainScene.js';
import { Towards_None } from './Point.js';
import { RunNode } from './RunNode.js';
import { Save } from './Save.js';
import { Scene } from './Scene.js';
import { TextBox } from './TextBox.js';
import { TextureManager } from './TextureManager.js';
import { SUBMAP_COORD_COUNT, SUBMAP_EVENT_COUNT } from './Types.js';
import { UI } from './UI.js';
import { textDrawSize } from './util.js';

export class SubScene extends Scene {
    constructor(id) {
        super();
        this.full_window_ = 1;
        this.COORD_COUNT = SUBMAP_COORD_COUNT;
        this.view_x_ = 0;
        this.view_y_ = 0;
        this.MAN_PIC_0 = 2501;
        this.MAN_PIC_COUNT = 7;
        this.submap_id_ = -1;
        this.submap_info_ = null;
        this.exit_music_ = -1;
        this.force_man_pic_ = -1;
        this.force_begin_event_ = -1;
        if (id !== undefined) {
            this.setID(id);
        }
    }

    getMapInfo() {
        return this.submap_info_;
    }

    changeExitMusic(m) {
        this.exit_music_ = m;
    }

    setID(id) {
        this.submap_id_ = id;
        this.submap_info_ = Save.getSubMapInfo(id);
        if (!this.submap_info_) {
            this.setExit(true);
            return;
        }
        this.exit_music_ = this.submap_info_.ExitMusic;
        Audio.playMusic(this.submap_info_.EntranceMusic);
        console.log(`Sub Scene ${id}, ${this.submap_info_.Name}`);
    }

    setViewPosition(x, y) {
        this.view_x_ = x;
        this.view_y_ = y;
    }

    setManViewPosition(x, y) {
        this.setManPosition(x, y);
        this.setViewPosition(x, y);
    }

    calManPic() {
        return this.MAN_PIC_0 + this.towards_ * this.MAN_PIC_COUNT + this.step_;
    }

    forceManPic(pic) {
        this.force_man_pic_ = pic;
    }

    setForceBeginEvent(e) {
        this.force_begin_event_ = e;
    }

    draw() {
        const info = this.submap_info_;
        if (!info) {
            return;
        }
        const TILE_W = Scene.TILE_W;
        const ambient = DayNightSystem.getInstance().getLighting().ambient_color;
        Engine.setRenderTarget('scene');
        Engine.fillColor(C(0, 0, 0, 255), 0, 0, this.render_center_x_ * 2, this.render_center_y_ * 2);
        const earth_texture = Engine.getTexture('searth');
        const vw = this.view_width_region_;
        const vs = this.view_sum_region_;
        if (earth_texture) {
            const p = this.getPositionOnWholeEarth(this.view_x_, this.view_y_);
            const w = this.render_center_x_ * 2;
            const h = this.render_center_y_ * 2;
            const rect0 = { x: p.x - this.render_center_x_, y: p.y - this.render_center_y_, w, h };
            const rect1 = { x: 0, y: 0, w, h };
            if (rect0.x < 0) {
                rect1.x = -rect0.x;
                rect0.x = 0;
            }
            if (rect0.y < 0) {
                rect1.y = -rect0.y;
                rect0.y = 0;
            }
            Engine.setColor(earth_texture, C(255, 255, 255, 255));
            Engine.renderTextureLight(earth_texture, rect0, rect1, [ambient, ambient, ambient, ambient], [0.25, 0, 0, 0]);
        } else {
            for (let sum = -vs; sum <= vs + 15; sum++) {
                for (let i = -vw; i <= vw; i++) {
                    const ix = this.view_x_ + i + Math.trunc(sum / 2);
                    const iy = this.view_y_ - i + (sum - Math.trunc(sum / 2));
                    if (this.isOutLine(ix, iy)) {
                        continue;
                    }
                    const p = this.getPositionOnRender(ix, iy, this.view_x_, this.view_y_);
                    p.x += this.x_;
                    p.y += this.y_;
                    const h = info.BuildingHeight(ix, iy);
                    const num = Math.trunc(info.Earth(ix, iy) / 2);
                    if (num > 0 && h <= 2) {
                        TextureManager.renderTextureByName('smap', num, p.x, p.y, RI(ambient));
                    }
                }
            }
        }
        const color_v = [ambient, ambient, ambient, ambient];
        const bright = [0.5, 0, 0, 0];
        const white = C(255, 255, 255, 255);
        const lit = RI(white, 255, 1, 1, 0, 0, color_v, bright);
        const litWall = RI(white, 255, 1, 1, 0, 0, color_v, []);
        const rate = Math.trunc(TILE_W / 18);
        for (let sum = -vs; sum <= vs + 20; sum++) {
            for (let i = -vw; i <= vw; i++) {
                const ix = this.view_x_ + i + Math.trunc(sum / 2);
                const iy = this.view_y_ - i + (sum - Math.trunc(sum / 2));
                if (this.isOutLine(ix, iy)) {
                    continue;
                }
                const p = this.getPositionOnRender(ix, iy, this.view_x_, this.view_y_);
                p.x += this.x_;
                p.y += this.y_;
                const h0 = info.BuildingHeight(ix, iy);
                const h = h0 * rate;
                let num = Math.trunc(info.Earth(ix, iy) / 2);
                if (num > 0 && (!earth_texture || (earth_texture && h0 > 2 && rate === 1))) {
                    TextureManager.renderTextureByName('smap', num, p.x, p.y, RI(ambient));
                }
                if (ix === this.cursor_x_ && iy === this.cursor_y_) {
                    TextureManager.renderTextureByName('mmap', 1, p.x, p.y - h, RI(white, 128));
                }
                num = Math.trunc(info.Building(ix, iy) / 2);
                if (num > 0) {
                    TextureManager.renderTextureByName('smap', num, p.x, p.y - h, Scene.isWallTile(num) ? litWall : lit);
                }
                if (ix === this.man_x_ && iy === this.man_y_) {
                    this.man_pic_ = this.force_man_pic_ === -1 ? this.calManPic() : this.force_man_pic_;
                    TextureManager.renderTextureByName('smap', this.man_pic_, p.x, p.y - h, lit);
                }
                const event = info.Event(ix, iy);
                if (event) {
                    num = Math.trunc(event.CurrentPic / 2);
                    if (num > 0) {
                        TextureManager.renderTextureByName('smap', num, p.x, p.y - h, lit);
                    }
                }
                num = Math.trunc(info.Decoration(ix, iy) / 2);
                if (num > 0) {
                    TextureManager.renderTextureByName('smap', num, p.x, p.y - info.DecorationHeight(ix, iy) * rate, lit);
                }
            }
        }
        Engine.renderTextureToMain('scene');
    }

    async dealEvent(e) {
        const engine = Engine;
        let x = this.man_x_;
        let y = this.man_y_;
        await this.checkEvent3(x, y);
        if (this.isExit(x, y) || (await this.isJumpSubScene(x, y))) {
            this.way_que_ = [];
            this.total_step_ = 0;
        }
        if ((e.type === K.EVENT_KEY_UP && e.key.key === K.K_TAB)
            || (e.type === K.EVENT_GAMEPAD_BUTTON_UP && e.gbutton.button === K.GAMEPAD_BUTTON_BACK)) {
            await new Console().run();
        }
        if ((e.type === K.EVENT_KEY_UP && e.key.key === K.K_ESCAPE)
            || (e.type === K.EVENT_MOUSE_BUTTON_UP && e.button.button === K.BUTTON_RIGHT)
            || engine.gameControllerGetButton(K.GAMEPAD_BUTTON_START)) {
            await UI.getInstance().run();
            const item = UI.getInstance().getUsedItem();
            if (item && item.ItemType === 0) {
                if (await this.checkEvent2(this.man_x_, this.man_y_, this.towards_, item.ID)) {
                    this.step_ = 0;
                }
            }
        }
        if (engine.getTicks() - this.pre_pressed_ticks_ > Scene.key_walk_delay_) {
            this.pre_pressed_ticks_ = engine.getTicks();
            const pressed = MainScene.readWalkInput(engine, this.pre_pressed_);
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
            if (this.way_que_.length) {
                const p = this.way_que_[this.way_que_.length - 1];
                x = p.x;
                y = p.y;
                if (this.calDistance(this.man_x_, this.man_y_, x, y) <= 1) {
                    const tw = this.calTowards(this.man_x_, this.man_y_, x, y);
                    if (tw !== Towards_None) {
                        this.towards_ = tw;
                    }
                    this.tryWalk(x, y);
                    this.way_que_.pop();
                    if (!this.way_que_.length && this.mouse_event_x_ >= 0 && this.mouse_event_y_ >= 0) {
                        const tw2 = this.calTowards(this.man_x_, this.man_y_, this.mouse_event_x_, this.mouse_event_y_);
                        if (tw2 !== Towards_None) {
                            this.towards_ = tw2;
                        }
                        await this.checkEvent1(this.man_x_, this.man_y_, this.towards_);
                        this.setMouseEventPoint(-1, -1);
                    }
                } else {
                    this.way_que_ = [];
                }
            }
        }
        if ((e.type === K.EVENT_KEY_UP && (e.key.key === K.K_RETURN || e.key.key === K.K_SPACE))
            || (e.type === K.EVENT_GAMEPAD_BUTTON_UP && e.gbutton.button === K.GAMEPAD_BUTTON_SOUTH)) {
            if (await this.checkEvent1(x, y, this.towards_)) {
                this.step_ = 0;
            }
        }
        this.calCursorPosition(this.view_x_, this.view_y_);
        if (e.type === K.EVENT_MOUSE_BUTTON_UP && e.button.button === K.BUTTON_LEFT) {
            this.setMouseEventPoint(-1, -1);
            const [mx, my] = engine.getMouseStateInStartWindow();
            const p = this.getMousePosition(mx, my, x, y);
            this.way_que_ = [];
            if (this.isCannotPassEvent(p.x, p.y)) {
                this.FindWay(x, y, p.x, p.y);
                if (this.way_que_.length >= 1) {
                    this.way_que_ = this.way_que_.slice(1);
                    this.setMouseEventPoint(p.x, p.y);
                }
            } else if (this.isCanPassEvent1(p.x, p.y) && this.calDistance(p.x, p.y, x, y) === 1) {
                this.FindWay(x, y, x, y);
                this.setMouseEventPoint(p.x, p.y);
            } else if (this.canWalk(p.x, p.y)) {
                this.FindWay(x, y, p.x, p.y);
            }
        }
    }

    backRun() {
        this.rest_time_++;
        if (this.rest_time_ > 50) {
            this.step_ = 0;
        }
        const info = this.submap_info_;
        if (!info) {
            return;
        }
        if (this.current_frame_ % Math.trunc(200 / RunNode.getRefreshInterval()) === 0) {
            for (let i = 0; i < SUBMAP_EVENT_COUNT; i++) {
                const e = info.Event(i);
                if (e.BeginPic < e.EndPic) {
                    e.CurrentPic = e.CurrentPic + 1;
                    if (e.CurrentPic > e.EndPic) {
                        e.CurrentPic = e.BeginPic;
                    }
                }
            }
        }
    }

    async onEntrance() {
        this.calViewRegion();
        this.towards_ = MainScene.getInstance().towards_;
        const info = this.submap_info_;
        if (!info) {
            return;
        }
        for (let i = 0; i < SUBMAP_EVENT_COUNT; i++) {
            const e = info.Event(i);
            if (e.BeginPic < e.EndPic) {
                e.CurrentPic = e.BeginPic + ((e.PicDelay * 2) % (e.EndPic - e.BeginPic));
            }
        }
        if (this.force_begin_event_ >= 0) {
            await Event.getInstance().callEvent(this.force_begin_event_, this);
        }
        this.addChild(Weather.getInstance());
        Engine.createRenderedTexture('searth', this.COORD_COUNT * Scene.TILE_W * 2, this.COORD_COUNT * Scene.TILE_H * 2);
        await this.reDrawEarthTexture();
        const scene_name = new TextBox();
        scene_name.setFontSize(24);
        scene_name.setText(info.Name);
        scene_name.setPosition(Math.trunc(Engine.getUIWidth() / 2) - Math.trunc(textDrawSize(info.Name) / 2) * 12, 100);
        scene_name.setStayFrame(40);
        this.addChild(scene_name);
    }

    async onExit() {
        Audio.playMusic(this.exit_music_);
    }

    async onPressedCancel() {}

    tryWalk(x, y) {
        if (this.canWalk(x, y)) {
            this.man_x_ = x;
            this.man_y_ = y;
            this.view_x_ = x;
            this.view_y_ = y;
        }
        this.step_++;
        if (this.step_ >= this.MAN_PIC_COUNT) {
            this.step_ = 1;
        }
        this.rest_time_ = 0;
    }

    async checkEvent(x, y, tw = Towards_None, item_id = -1) {
        const t = Scene.getTowardsPosition(this.man_x_, this.man_y_, tw);
        if (t) {
            [x, y] = t;
        }
        const info = this.submap_info_;
        if (this.isOutLine(x, y)) {
            return false;
        }
        const index = info.EventIndex(x, y);
        if (index >= 0) {
            let id = 0;
            const ev = info.Event(x, y);
            if (!ev) {
                return false;
            }
            if (tw !== Towards_None) {
                id = item_id < 0 ? ev.Event1 : ev.Event2;
                if (id > 0) {
                    this.step_ = 0;
                }
            } else {
                id = ev.Event3;
            }
            if (id > 0) {
                return Event.getInstance().callEvent(id, this, info.ID, item_id, index, x, y);
            }
        }
        return false;
    }

    checkEvent1(x, y, tw) {
        return this.checkEvent(x, y, tw, -1);
    }

    checkEvent2(x, y, tw, item_id) {
        return this.checkEvent(x, y, tw, item_id);
    }

    checkEvent3(x, y) {
        return this.checkEvent(x, y, Towards_None, -1);
    }

    isBuilding(x, y) {
        const b = this.submap_info_.Building(x, y);
        return b > 0 && b < 9999;
    }

    isWater(x, y) {
        const num = Math.trunc(this.submap_info_.Earth(x, y) / 2);
        return (num >= 179 && num <= 181) || num === 261 || num === 511 || (num >= 662 && num <= 665) || num === 674;
    }

    isCanPassEvent1(x, y) {
        if (this.isOutLine(x, y)) {
            return false;
        }
        const e = this.submap_info_.Event(x, y);
        return !!(e && !e.CannotWalk && e.Event1 > 0);
    }

    isCannotPassEvent(x, y) {
        if (this.isOutLine(x, y)) {
            return false;
        }
        const e = this.submap_info_.Event(x, y);
        return !!(e && (e.CannotWalk || this.isBuilding(x, y)));
    }

    isFall() {
        return false;
    }

    isExit(x, y) {
        const s = this.submap_info_;
        if ((s.ExitX[0] === x && s.ExitY[0] === y) || (s.ExitX[1] === x && s.ExitY[1] === y) || (s.ExitX[2] === x && s.ExitY[2] === y)) {
            this.setExit(true);
            return true;
        }
        return false;
    }

    async isJumpSubScene() {
        const s = this.submap_info_;
        if (s.JumpSubMap >= 0 && this.man_x_ === s.JumpX && this.man_y_ === s.JumpY) {
            const ns = Save.getSubMapInfo(s.JumpSubMap);
            if (!ns) {
                return false;
            }
            let x;
            let y;
            if (s.MainEntranceX1 !== 0) {
                x = ns.EntranceX;
                y = ns.EntranceY;
            } else {
                x = ns.JumpReturnX;
                y = ns.JumpReturnY;
            }
            await this.forceJumpSubScene(s.JumpSubMap, x, y);
            return true;
        }
        return false;
    }

    isOutScreen(x, y) {
        return Math.abs(this.view_x_ - x) >= 2 * this.view_width_region_ || Math.abs(this.view_y_ - y) >= this.view_sum_region_;
    }

    canWalk(x, y) {
        return !(this.isOutLine(x, y) || this.isBuilding(x, y) || this.isWater(x, y) || this.isCannotPassEvent(x, y) || this.isFall(x, y));
    }

    forceExit() {
        this.setVisible(false);
        this.setExit(true);
    }

    async forceJumpSubScene(submap_id, x, y) {
        this.setID(submap_id);
        this.setManViewPosition(x, y);
        await this.reDrawEarthTexture();
    }

    fillEarth() {
        for (let i1 = 0; i1 < this.COORD_COUNT; i1++) {
            for (let i2 = 0; i2 < this.COORD_COUNT; i2++) {
                if (this.submap_info_.Earth(i1, i2) <= 0) {
                    this.submap_info_.setLayerData(0, i1, i2, 70);
                }
            }
        }
    }

    // pre-renders the flat earth layer once per scene; images are fetched first
    async reDrawEarthTexture() {
        const earth = Engine.getTexture('searth');
        if (!earth || !this.submap_info_) {
            return;
        }
        const info = this.submap_info_;
        const big = await TextureManager.ensureGroup('smap-earth');
        if (big.getTextureCount() > 0) {
            await TextureManager.preload('smap-earth', [info.ID]);
        } else {
            const nums = new Set();
            for (let i1 = 0; i1 < this.COORD_COUNT; i1++) {
                for (let i2 = 0; i2 < this.COORD_COUNT; i2++) {
                    const num = Math.trunc(info.Earth(i1, i2) / 2);
                    if (num > 0 && info.BuildingHeight(i1, i2) <= 2) {
                        nums.add(num);
                    }
                }
            }
            await TextureManager.preload('smap', [...nums]);
        }
        if (Engine.getTexture('searth') !== earth || this.submap_info_ !== info) {
            return;
        }
        const prev = Engine.getRenderTarget();
        Engine.setRenderTarget(earth);
        Engine.fillColorDirect(C(0, 0, 0, 255), 0, 0, this.COORD_COUNT * Scene.TILE_W * 2, this.COORD_COUNT * Scene.TILE_H * 2, K.BLENDMODE_NONE);
        if (big.getTextureCount() > 0) {
            TextureManager.renderTextureByName('smap-earth', info.ID, 0, 0);
        } else {
            for (let i1 = 0; i1 < this.COORD_COUNT; i1++) {
                for (let i2 = 0; i2 < this.COORD_COUNT; i2++) {
                    const p = this.getPositionOnWholeEarth(i1, i2);
                    const h = info.BuildingHeight(i1, i2);
                    const num = Math.trunc(info.Earth(i1, i2) / 2);
                    if (num > 0 && h <= 2) {
                        TextureManager.renderTextureByName('smap', num, p.x, p.y);
                    }
                }
            }
        }
        Engine.setRenderTarget(prev);
    }
}
