// DayNightSystem and DayNightDisplay (DayNightSystem.cpp, DayNightDisplay.cpp)
import { C } from './Color.js';
import { Engine } from './Engine.js';
import { Font } from './Font.js';
import { GameUtil } from './GameUtil.js';
import { RunNode } from './RunNode.js';
import { clamp, format } from './util.js';

const Pi = Math.PI;

function mixColor(from, to, factor) {
    factor = clamp(factor, 0, 1);
    const mix = (l, r) => Math.trunc(l + (r - l) * factor) & 255;
    return { r: mix(from.r, to.r), g: mix(from.g, to.g), b: mix(from.b, to.b), a: mix(from.a, to.a) };
}

function smoothStep(e0, e1, v) {
    const t = clamp((v - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
}

export class DayNightSystem extends RunNode {
    constructor() {
        super();
        this.time_of_day_ = -1;
        this.previous_ticks_ = 0;
    }

    static getInstance() {
        if (!DayNightSystem.instance_) {
            DayNightSystem.instance_ = new DayNightSystem();
        }
        return DayNightSystem.instance_;
    }

    backRun() {
        const now = Engine.getTicks();
        if (this.time_of_day_ < 0) {
            this.time_of_day_ = Math.random();
            this.previous_ticks_ = now;
            return;
        }
        const elapsed = (now - this.previous_ticks_) / 1000;
        this.previous_ticks_ = now;
        if (!this.isDynamic()) {
            this.time_of_day_ = 0.5;
            return;
        }
        const cycle = Math.max(1, GameUtil.getReal('game', 'day_night_cycle_seconds', 1800));
        this.time_of_day_ = (this.time_of_day_ + elapsed / cycle) % 1;
    }

    getTimeOfDay() {
        return this.time_of_day_;
    }

    isDynamic() {
        return GameUtil.getInt('game', 'dynamic_day_night', 1) !== 0;
    }

    getLighting(time) {
        if (time === undefined) {
            time = this.time_of_day_ < 0 ? 0.5 : this.time_of_day_;
        }
        const sun_height = Math.sin((time - 0.25) * 2 * Pi);
        const daylight = smoothStep(-0.14, 0.22, sun_height);
        const twilight = Math.exp(-sun_height * sun_height * 18) * (1 - daylight * 0.55);
        const night = 1 - daylight;
        const L = {};
        L.sky_zenith = mixColor(C(6, 13, 34), C(54, 107, 169), daylight);
        L.sky_mid = mixColor(C(16, 26, 52), C(104, 157, 204), daylight);
        L.sky_horizon = mixColor(C(31, 41, 68), C(176, 208, 228), daylight);
        L.sky_zenith = mixColor(L.sky_zenith, C(100, 65, 116), twilight * 0.65);
        L.sky_mid = mixColor(L.sky_mid, C(164, 98, 115), twilight * 0.75);
        L.sky_horizon = mixColor(L.sky_horizon, C(224, 151, 108), twilight);
        L.ambient_color = mixColor(C(100, 116, 150), C(255, 255, 255), daylight);
        L.ambient_color = mixColor(L.ambient_color, C(255, 194, 156), twilight * 0.5);
        L.sun_inner = mixColor(C(224, 232, 255, 205), C(255, 246, 180, 205), daylight);
        L.sun_outer = mixColor(C(105, 124, 180, 24), C(255, 255, 220, 16), daylight);
        L.sun_outer = mixColor(L.sun_outer, C(235, 118, 86, 24), twilight);
        L.sun_azimuth = -Pi + time * 2 * Pi;
        L.sun_elevation = clamp(sun_height * 0.52, -0.12, 0.52);
        L.star_alpha = smoothStep(0.1, 0.48, night);
        return L;
    }

    getTimeLabel() {
        const time = this.time_of_day_ < 0 ? 0.5 : this.time_of_day_;
        const minutes = Math.trunc(time * 24 * 60) % (24 * 60);
        let period = '深夜';
        if (time >= 0.2 && time < 0.3) {
            period = '黎明';
        } else if (time >= 0.3 && time < 0.7) {
            period = '白天';
        } else if (time >= 0.7 && time < 0.8) {
            period = '黄昏';
        } else if (time >= 0.8 || time < 0.2) {
            period = '夜晚';
        }
        return format('{} {:02}:{:02}', period, Math.trunc(minutes / 60), minutes % 60);
    }
}

export class DayNightDisplay extends RunNode {
    draw() {
        const dn = DayNightSystem.getInstance();
        if (!dn.isDynamic()) {
            return;
        }
        const [, ui_height] = Engine.getUISize();
        Font.draw(dn.getTimeLabel(), 20, 16, ui_height - 32, C(255, 255, 255, 255), 255);
    }
}
