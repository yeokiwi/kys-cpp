// Cloud, CloudGroup, Weather and Fade (Cloud.cpp, Weather.cpp, Fade.h)
import { C, RI } from './Color.js';
import { Engine } from './Engine.js';
import { ParticleExample, Vec2 } from './ParticleSystem.js';
import { RunNode } from './RunNode.js';
import { Scene } from './Scene.js';
import { TextureManager } from './TextureManager.js';
import { RandomDouble, clamp, crand } from './util.js';

export class Cloud {
    constructor() {
        this.x_ = -1000;
        this.y_ = -1000;
        this.num_style_ = 10;
        this.position_ = { x: 0, y: 0 };
        this.speed_x_ = 0;
        this.speed_y_ = 0;
        this.max_X_ = 17280;
        this.max_Y_ = 8640;
        this.num_ = 0;
        this.color_ = C(255, 255, 255, 255);
        this.alpha_ = 255;
    }

    initRand() {
        const r = new RandomDouble();
        this.position_.x = r.rand_int(this.max_X_);
        this.position_.y = r.rand_int(this.max_Y_);
        this.speed_x_ = 1 + r.rand_int(3);
        this.speed_y_ = 0;
        this.num_ = r.rand_int(this.num_style_);
        this.alpha_ = 64 + r.rand_int(192);
        this.color_ = C(r.rand_int(256), r.rand_int(256), r.rand_int(256), 255);
    }

    setPositionOnScreen(x, y, center_x, center_y) {
        this.x_ = this.position_.x - (-y * Scene.TILE_W + x * Scene.TILE_W + Math.trunc(this.max_X_ / 2) - center_x);
        this.y_ = this.position_.y - (y * Scene.TILE_H + x * Scene.TILE_H + Scene.TILE_H - center_y);
    }

    getPosition() {
        return [this.x_, this.y_];
    }

    draw() {
        const c = { ...this.color_, a: this.alpha_ };
        TextureManager.renderTextureByName('cloud', this.num_, this.x_, this.y_, RI(c, this.alpha_, 1, 1, 0, 0, [c, c, c, c], [1, 0, 0, 0]));
    }

    flow() {
        this.position_.x += this.speed_x_;
        this.position_.y += this.speed_y_;
        const p = { ...this.position_ };
        if (p.x < 0 || p.x > this.max_X_ || p.y < 0 || p.y > this.max_Y_) {
            this.initRand();
        }
        if (p.x < 0) {
            this.position_.x = this.max_X_;
        }
        if (p.x > this.max_X_) {
            this.position_.x = 0;
        }
        if (p.y < 0) {
            this.position_.y = this.max_Y_;
        }
        if (p.y > this.max_Y_) {
            this.position_.y = 0;
        }
    }
}

export class CloudGroup extends RunNode {
    constructor() {
        super();
        this.cloud_vector_ = [];
    }

    init(cloud_num, max_x, max_y) {
        this.cloud_vector_ = [];
        for (let i = 0; i < cloud_num; i++) {
            const c = new Cloud();
            c.max_X_ = max_x;
            c.max_Y_ = max_y;
            c.initRand();
            this.cloud_vector_.push(c);
        }
    }

    backRun() {}

    setPositionOnScreen(x, y, center_x, center_y) {
        let view_cloud = 0;
        for (const c of this.cloud_vector_) {
            c.flow();
            c.setPositionOnScreen(x, y, center_x, center_y);
            const [cx, cy] = c.getPosition();
            if (cx > -center_x && cx < center_x * 3 && cy > 0 && cy < center_y * 2) {
                view_cloud++;
            }
        }
        return view_cloud;
    }

    draw() {
        for (const c of this.cloud_vector_) {
            c.draw();
            c.flow();
        }
    }
}

export class Weather extends RunNode {
    constructor() {
        super();
        this.particle_ = new ParticleExample();
        this.slash_ = 0;
    }

    static getInstance() {
        if (!Weather.instance_) {
            Weather.instance_ = new Weather();
        }
        return Weather.instance_;
    }

    draw() {
        const tex = Engine.getTexture('scene');
        let v = 255;
        if (this.slash_) {
            v = 64 + (crand() % 192);
        }
        Engine.setColor(tex, C(v, v, v, 255));
        this.particle_.draw();
    }

    backRun() {}

    setSlash(s) {
        this.slash_ = s;
    }

    setWeather(north, rain_count) {
        const p = this.particle_;
        p.setPosition(Math.trunc(Engine.getWindowWidth() / 2), 0);
        if (north) {
            p.setStyle(ParticleExample.SNOW);
            if (!p.isActive()) {
                p.resetSystem();
            }
        } else if (rain_count) {
            p.setStyle(ParticleExample.RAIN);
            p.setEmissionRate(50 * rain_count);
            p.setGravity(new Vec2(10, 20));
            if (!p.isActive()) {
                p.resetSystem();
            }
        } else if (p.isActive()) {
            p.stopSystem();
        }
    }
}

export class Fade extends RunNode {
    constructor() {
        super();
        this.frame_ = 0;
        this.total_ = 1;
        this.from_ = 0;
        this.to_ = 255;
    }

    draw() {
        const alpha = clamp(this.from_ + Math.trunc(((this.to_ - this.from_) * (this.frame_ + 1)) / this.total_), 0, 255);
        Engine.fillColor(C(0, 0, 0, alpha), 0, 0, -1, -1);
        this.frame_++;
        if (this.frame_ >= this.total_) {
            this.setExit(true);
        }
    }

    set(total, from, to) {
        this.total_ = total;
        this.from_ = from;
        this.to_ = to;
    }

    reset() {
        this.frame_ = 0;
        this.setExit(false);
    }

    static async fadeIn(total) {
        const f = new Fade();
        f.set(total, 255, 0);
        await f.run();
    }

    static async fadeOut(total) {
        const f = new Fade();
        f.set(total, 0, 255);
        await f.run();
    }
}
