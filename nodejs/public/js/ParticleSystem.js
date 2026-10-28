// ParticleSystem (a port of the cocos2d-x particle system, ParticleSystem.cpp)
// and ParticleExample (preset styles, ParticleExample.cpp).
import { RI } from './Color.js';
import { RunNode } from './RunNode.js';
import { TextureManager } from './TextureManager.js';

export class Vec2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    getAngle() {
        return Math.atan2(this.y, this.x);
    }
}

const Deg2Rad = (a) => a * 0.01745329252;
const Rad2Deg = (a) => a * 57.29577951;

function clampf(v, lo, hi) {
    if (lo > hi) {
        [lo, hi] = [hi, lo];
    }
    return v < lo ? lo : v < hi ? v : hi;
}

// RANDOM_M11 from ejoy2d: a fast random number in [-1, 1)
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
function makeRandom(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 134775813) + 1) >>> 0;
        u32[0] = ((s & 0x7fff) << 8) | 0x40000000;
        return f32[0] - 3.0;
    };
}

function newParticle() {
    return {
        posx: 0, posy: 0, startPosX: 0, startPosY: 0,
        colorR: 0, colorG: 0, colorB: 0, colorA: 0,
        deltaColorR: 0, deltaColorG: 0, deltaColorB: 0, deltaColorA: 0,
        size: 0, deltaSize: 0, rotation: 0, deltaRotation: 0, timeToLive: 0,
        modeA: { dirX: 0, dirY: 0, radialAccel: 0, tangentialAccel: 0 },
        modeB: { angle: 0, degreesPerSecond: 0, radius: 0, deltaRadius: 0 },
    };
}

function copyParticle(dst, src) {
    Object.assign(dst, src);
    dst.modeA = { ...src.modeA };
    dst.modeB = { ...src.modeB };
}

export class ParticleSystem extends RunNode {
    constructor() {
        super();
        this._isBlendAdditive = true;
        this._isAutoRemoveOnFinish = false;
        this._elapsed = 0;
        this.modeA = { gravity: new Vec2(), speed: 0, speedVar: 0, tangentialAccel: 0, tangentialAccelVar: 0, radialAccel: 0, radialAccelVar: 0, rotationIsDir: false };
        this.modeB = { startRadius: 0, startRadiusVar: 0, endRadius: 0, endRadiusVar: 0, rotatePerSecond: 0, rotatePerSecondVar: 0 };
        this.particle_data_ = [];
        this._emitCounter = 0;
        this._isActive = true;
        this._particleCount = 0;
        this._duration = 0;
        this._sourcePosition = new Vec2();
        this._posVar = new Vec2();
        this._life = 0;
        this._lifeVar = 0;
        this._angle = 0;
        this._angleVar = 0;
        this._emitterMode = 'GRAVITY';
        this._startSize = 0;
        this._startSizeVar = 0;
        this._endSize = 0;
        this._endSizeVar = 0;
        this._startColor = { r: 0, g: 0, b: 0, a: 0 };
        this._startColorVar = { r: 0, g: 0, b: 0, a: 0 };
        this._endColor = { r: 0, g: 0, b: 0, a: 0 };
        this._endColorVar = { r: 0, g: 0, b: 0, a: 0 };
        this._startSpin = 0;
        this._startSpinVar = 0;
        this._endSpin = 0;
        this._endSpinVar = 0;
        this._emissionRate = 0;
        this._totalParticles = 0;
        this._yCoordFlipped = 1;
        this._paused = false;
        this.path_ = 'title';
        this.num_ = 201;
        this.stopSystem();
    }

    initWithTotalParticles(n) {
        this._totalParticles = n;
        this._isActive = true;
        this._emitterMode = 'GRAVITY';
        this._isAutoRemoveOnFinish = false;
        this.resetTotalParticles(n);
        return true;
    }

    resetTotalParticles(n) {
        while (this.particle_data_.length < n) {
            this.particle_data_.push(newParticle());
        }
    }

    addParticles(count) {
        if (this._paused) {
            return;
        }
        const R = makeRandom(Math.floor(Math.random() * 32768));
        const start = this._particleCount;
        this._particleCount = Math.min(this._particleCount + count, this._totalParticles);
        const P = this.particle_data_;
        const end = this._particleCount;
        for (let i = start; i < end; i++) {
            P[i].timeToLive = Math.max(0, this._life + this._lifeVar * R());
        }
        for (let i = start; i < end; i++) {
            P[i].posx = this._sourcePosition.x + this._posVar.x * R();
        }
        for (let i = start; i < end; i++) {
            P[i].posy = this._sourcePosition.y + this._posVar.y * R();
        }
        const setColor = (k, b, v) => {
            for (let i = start; i < end; i++) {
                P[i][k] = clampf(b + v * R(), 0, 1);
            }
        };
        setColor('colorR', this._startColor.r, this._startColorVar.r);
        setColor('colorG', this._startColor.g, this._startColorVar.g);
        setColor('colorB', this._startColor.b, this._startColorVar.b);
        setColor('colorA', this._startColor.a, this._startColorVar.a);
        setColor('deltaColorR', this._endColor.r, this._endColorVar.r);
        setColor('deltaColorG', this._endColor.g, this._endColorVar.g);
        setColor('deltaColorB', this._endColor.b, this._endColorVar.b);
        setColor('deltaColorA', this._endColor.a, this._endColorVar.a);
        const setDelta = (c, dc) => {
            for (let i = start; i < end; i++) {
                P[i][dc] = (P[i][dc] - P[i][c]) / P[i].timeToLive;
            }
        };
        setDelta('colorR', 'deltaColorR');
        setDelta('colorG', 'deltaColorG');
        setDelta('colorB', 'deltaColorB');
        setDelta('colorA', 'deltaColorA');
        for (let i = start; i < end; i++) {
            P[i].size = Math.max(0, this._startSize + this._startSizeVar * R());
        }
        if (this._endSize !== -1) {
            for (let i = start; i < end; i++) {
                const endSize = Math.max(0, this._endSize + this._endSizeVar * R());
                P[i].deltaSize = (endSize - P[i].size) / P[i].timeToLive;
            }
        } else {
            for (let i = start; i < end; i++) {
                P[i].deltaSize = 0;
            }
        }
        for (let i = start; i < end; i++) {
            P[i].rotation = this._startSpin + this._startSpinVar * R();
        }
        for (let i = start; i < end; i++) {
            const endA = this._endSpin + this._endSpinVar * R();
            P[i].deltaRotation = (endA - P[i].rotation) / P[i].timeToLive;
        }
        for (let i = start; i < end; i++) {
            P[i].startPosX = this.x_;
            P[i].startPosY = this.y_;
        }
        if (this._emitterMode === 'GRAVITY') {
            for (let i = start; i < end; i++) {
                P[i].modeA.radialAccel = this.modeA.radialAccel + this.modeA.radialAccelVar * R();
            }
            for (let i = start; i < end; i++) {
                P[i].modeA.tangentialAccel = this.modeA.tangentialAccel + this.modeA.tangentialAccelVar * R();
            }
            for (let i = start; i < end; i++) {
                const a = Deg2Rad(this._angle + this._angleVar * R());
                const s = this.modeA.speed + this.modeA.speedVar * R();
                P[i].modeA.dirX = Math.cos(a) * s;
                P[i].modeA.dirY = Math.sin(a) * s;
                if (this.modeA.rotationIsDir) {
                    P[i].rotation = -Rad2Deg(Math.atan2(P[i].modeA.dirY, P[i].modeA.dirX));
                }
            }
        } else {
            for (let i = start; i < end; i++) {
                P[i].modeB.radius = this.modeB.startRadius + this.modeB.startRadiusVar * R();
            }
            for (let i = start; i < end; i++) {
                P[i].modeB.angle = Deg2Rad(this._angle + this._angleVar * R());
            }
            for (let i = start; i < end; i++) {
                P[i].modeB.degreesPerSecond = Deg2Rad(this.modeB.rotatePerSecond + this.modeB.rotatePerSecondVar * R());
            }
            if (this.modeB.endRadius === -1) {
                for (let i = start; i < end; i++) {
                    P[i].modeB.deltaRadius = 0;
                }
            } else {
                for (let i = start; i < end; i++) {
                    const endRadius = this.modeB.endRadius + this.modeB.endRadiusVar * R();
                    P[i].modeB.deltaRadius = (endRadius - P[i].modeB.radius) / P[i].timeToLive;
                }
            }
        }
    }

    stopSystem() {
        this._isActive = false;
        this._elapsed = this._duration;
        this._emitCounter = 0;
    }

    resetSystem() {
        this._isActive = true;
        this._elapsed = 0;
    }

    isFull() {
        return this._particleCount === this._totalParticles;
    }

    update() {
        const dt = 1.0 / 25;
        if (this._isActive && this._emissionRate) {
            const rate = 1.0 / this._emissionRate;
            if (this._particleCount < this._totalParticles) {
                this._emitCounter += dt;
                if (this._emitCounter < 0) {
                    this._emitCounter = 0;
                }
            }
            const emitCount = Math.trunc(Math.min(this._totalParticles - this._particleCount, this._emitCounter / rate));
            this.addParticles(emitCount);
            this._emitCounter -= rate * emitCount;
            this._elapsed += dt;
            if (this._elapsed < 0) {
                this._elapsed = 0;
            }
            if (this._duration !== -1 && this._duration < this._elapsed) {
                this.stopSystem();
            }
        }
        const P = this.particle_data_;
        for (let i = 0; i < this._particleCount; i++) {
            P[i].timeToLive -= dt;
        }
        for (let i = 0; i < this._particleCount; i++) {
            if (P[i].timeToLive <= 0) {
                copyParticle(P[i], P[this._particleCount - 1]);
                --this._particleCount;
            }
        }
        if (this._emitterMode === 'GRAVITY') {
            for (let i = 0; i < this._particleCount; i++) {
                const p = P[i];
                let rx = 0;
                let ry = 0;
                if (p.posx || p.posy) {
                    const n = p.posx * p.posx + p.posy * p.posy;
                    if (n === 1) {
                        rx = 0;
                        ry = 0;
                    } else {
                        const sn = Math.sqrt(n);
                        if (sn >= 1e-5) {
                            rx = p.posx / sn;
                            ry = p.posy / sn;
                        }
                    }
                }
                let tx = ry;
                let ty = rx;
                rx *= p.modeA.radialAccel;
                ry *= p.modeA.radialAccel;
                tx *= -p.modeA.tangentialAccel;
                ty *= p.modeA.tangentialAccel;
                const ax = (rx + tx + this.modeA.gravity.x) * dt;
                const ay = (ry + ty + this.modeA.gravity.y) * dt;
                p.modeA.dirX += ax;
                p.modeA.dirY += ay;
                p.posx += p.modeA.dirX * dt * this._yCoordFlipped;
                p.posy += p.modeA.dirY * dt * this._yCoordFlipped;
            }
        } else {
            for (let i = 0; i < this._particleCount; i++) {
                const p = P[i];
                p.modeB.angle += p.modeB.degreesPerSecond * dt;
                p.modeB.radius += p.modeB.deltaRadius * dt;
                p.posx = -Math.cos(p.modeB.angle) * p.modeB.radius;
                p.posy = -Math.sin(p.modeB.angle) * p.modeB.radius * this._yCoordFlipped;
            }
        }
        for (let i = 0; i < this._particleCount; i++) {
            const p = P[i];
            p.colorR += p.deltaColorR * dt;
            p.colorG += p.deltaColorG * dt;
            p.colorB += p.deltaColorB * dt;
            p.colorA += p.deltaColorA * dt;
            p.size = Math.max(0, p.size + p.deltaSize * dt);
            p.rotation += p.deltaRotation * dt;
        }
    }

    setTexture(path, num) {
        this.path_ = path;
        this.num_ = num;
    }

    draw() {
        const tex = TextureManager.getTexture(this.path_, this.num_);
        for (let i = 0; i < this._particleCount; i++) {
            const p = this.particle_data_[i];
            if (p.size <= 0 || p.colorA <= 0) {
                continue;
            }
            const x = Math.trunc(p.posx + p.startPosX - p.size / 2);
            const y = Math.trunc(p.posy + p.startPosY - p.size / 2);
            const c = { r: Math.trunc(p.colorR * 255) & 255, g: Math.trunc(p.colorG * 255) & 255, b: Math.trunc(p.colorB * 255) & 255, a: Math.trunc(p.colorA * 255) & 255 };
            TextureManager.renderTexture(tex, x, y, RI(c, c.a, 1, 1, p.rotation), Math.trunc(p.size), Math.trunc(p.size));
        }
        this.update();
    }

    isActive() {
        return this._isActive;
    }

    getTotalParticles() {
        return this._totalParticles;
    }

    setTotalParticles(n) {
        this._totalParticles = n;
        while (this.particle_data_.length < n) {
            this.particle_data_.push(newParticle());
        }
        this.particle_data_.length = n;
    }

    getParticleCount() {
        return this._particleCount;
    }

    setEmitterMode(m) {
        this._emitterMode = m;
    }

    setGravity(g) {
        this.modeA.gravity = g;
    }

    getGravity() {
        return this.modeA.gravity;
    }

    setSpeed(v) {
        this.modeA.speed = v;
    }

    setSpeedVar(v) {
        this.modeA.speedVar = v;
    }

    setTangentialAccel(v) {
        this.modeA.tangentialAccel = v;
    }

    setTangentialAccelVar(v) {
        this.modeA.tangentialAccelVar = v;
    }

    setRadialAccel(v) {
        this.modeA.radialAccel = v;
    }

    setRadialAccelVar(v) {
        this.modeA.radialAccelVar = v;
    }

    setRotationIsDir(t) {
        this.modeA.rotationIsDir = t;
    }

    setStartRadius(v) {
        this.modeB.startRadius = v;
    }

    setStartRadiusVar(v) {
        this.modeB.startRadiusVar = v;
    }

    setEndRadius(v) {
        this.modeB.endRadius = v;
    }

    setEndRadiusVar(v) {
        this.modeB.endRadiusVar = v;
    }

    setRotatePerSecond(v) {
        this.modeB.rotatePerSecond = v;
    }

    setRotatePerSecondVar(v) {
        this.modeB.rotatePerSecondVar = v;
    }

    setDuration(d) {
        this._duration = d;
    }

    setSourcePosition(p) {
        this._sourcePosition = p;
    }

    setPosVar(p) {
        this._posVar = p instanceof Vec2 ? p : new Vec2(p.x, p.y);
    }

    getPosVar() {
        return this._posVar;
    }

    setLife(v) {
        this._life = v;
    }

    setLifeVar(v) {
        this._lifeVar = v;
    }

    setAngle(v) {
        this._angle = v;
    }

    setAngleVar(v) {
        this._angleVar = v;
    }

    setStartSize(v) {
        this._startSize = v;
    }

    setStartSizeVar(v) {
        this._startSizeVar = v;
    }

    setEndSize(v) {
        this._endSize = v;
    }

    setEndSizeVar(v) {
        this._endSizeVar = v;
    }

    setStartColor(c) {
        this._startColor = c;
    }

    setStartColorVar(c) {
        this._startColorVar = c;
    }

    setEndColor(c) {
        this._endColor = c;
    }

    setEndColorVar(c) {
        this._endColorVar = c;
    }

    setStartSpin(v) {
        this._startSpin = v;
    }

    setStartSpinVar(v) {
        this._startSpinVar = v;
    }

    setEndSpin(v) {
        this._endSpin = v;
    }

    setEndSpinVar(v) {
        this._endSpinVar = v;
    }

    setEmissionRate(v) {
        this._emissionRate = v;
    }

    getEmissionRate() {
        return this._emissionRate;
    }

    setAutoRemoveOnFinish(v) {
        this._isAutoRemoveOnFinish = v;
    }

    pauseEmissions() {
        this._paused = true;
    }

    resumeEmissions() {
        this._paused = false;
    }
}

export const STYLE = {
    NONE: 0, FIRE: 1, FIRE_WORK: 2, SUN: 3, GALAXY: 4, FLOWER: 5, METEOR: 6, SPIRAL: 7, EXPLOSION: 8, SMOKE: 9, SNOW: 10, RAIN: 11,
};

export class ParticleExample extends ParticleSystem {
    constructor() {
        super();
        this.style_ = STYLE.NONE;
    }

    setStyle(style) {
        if (this.style_ === style) {
            return;
        }
        this.style_ = style;
        if (style === STYLE.NONE) {
            this.stopSystem();
        }
        switch (style)
            {
            case STYLE.FIRE:
            {
                this.initWithTotalParticles(250);
                this._duration = -1;
                this._emitterMode = 'GRAVITY';
                this.modeA.gravity = new Vec2(0, 0 );
                this.modeA.radialAccel = 0;
                this.modeA.radialAccelVar = 0;
                this.modeA.speed = -60;
                this.modeA.speedVar = 20;
                this._angle = 90;
                this._angleVar = 10;
                this._life = 3;
                this._lifeVar = 0.25;
                this._startSize = 54.0;
                this._startSizeVar = 10.0;
                this._endSize = -1;
                this._emissionRate = this._totalParticles / this._life;
                this._startColor.r = 0.76;
                this._startColor.g = 0.25;
                this._startColor.b = 0.12;
                this._startColor.a = 1.0;
                this._startColorVar.r = 0.0;
                this._startColorVar.g = 0.0;
                this._startColorVar.b = 0.0;
                this._startColorVar.a = 0.0;
                this._endColor.r = 0.0;
                this._endColor.g = 0.0;
                this._endColor.b = 0.0;
                this._endColor.a = 0.0;
                this._endColorVar.r = 0.0;
                this._endColorVar.g = 0.0;
                this._endColorVar.b = 0.0;
                this._endColorVar.a = 0.0;
                this._posVar = new Vec2(40.0, 20.0 );
                break;
            }
            case STYLE.FIRE_WORK:
            {
                this.initWithTotalParticles(1500);
                this._duration = -1;
                this._emitterMode = 'GRAVITY';
                this.modeA.gravity = new Vec2(0.0, 90.0 );
                this.modeA.radialAccel = 0.0;
                this.modeA.radialAccelVar = 0.0;
                this.modeA.speed = -180.0;
                this.modeA.speedVar = 50.0;
                this._angle = 90.0;
                this._angleVar = 20.0;
                this._life = 3.5;
                this._lifeVar = 1.0;
                this._emissionRate = this._totalParticles / this._life;
                this._startColor.r = 0.5;
                this._startColor.g = 0.5;
                this._startColor.b = 0.5;
                this._startColor.a = 1.0;
                this._startColorVar.r = 0.5;
                this._startColorVar.g = 0.5;
                this._startColorVar.b = 0.5;
                this._startColorVar.a = 0.1;
                this._endColor.r = 0.1;
                this._endColor.g = 0.1;
                this._endColor.b = 0.1;
                this._endColor.a = 0.2;
                this._endColorVar.r = 0.1;
                this._endColorVar.g = 0.1;
                this._endColorVar.b = 0.1;
                this._endColorVar.a = 0.2;
                this._startSize = 8.0;
                this._startSizeVar = 2.0;
                this._endSize = -1;
                this._posVar = new Vec2(0, 0 );
                break;
            }
            case STYLE.SUN:
            {
                this.initWithTotalParticles(350);
                this._duration = -1;
                this.setEmitterMode('GRAVITY');
                this.setGravity(new Vec2(0, 0));
                this.setRadialAccel(0);
                this.setRadialAccelVar(0);
                this.setSpeed(-20);
                this.setSpeedVar(5);
                this._angle = 90;
                this._angleVar = 360;
                this._life = 1;
                this._lifeVar = 0.5;
                this._startSize = 30.0;
                this._startSizeVar = 10.0;
                this._endSize = -1;
                this._emissionRate = this._totalParticles / this._life;
                this._startColor.r = 0.76;
                this._startColor.g = 0.25;
                this._startColor.b = 0.12;
                this._startColor.a = 1.0;
                this._startColorVar.r = 0.0;
                this._startColorVar.g = 0.0;
                this._startColorVar.b = 0.0;
                this._startColorVar.a = 0.0;
                this._endColor.r = 0.0;
                this._endColor.g = 0.0;
                this._endColor.b = 0.0;
                this._endColor.a = 1.0;
                this._endColorVar.r = 0.0;
                this._endColorVar.g = 0.0;
                this._endColorVar.b = 0.0;
                this._endColorVar.a = 0.0;
                this._posVar = new Vec2(0, 0 );
                break;
            }
            case STYLE.GALAXY:
            {
                this.initWithTotalParticles(200);
                this._duration = -1;
                this.setEmitterMode('GRAVITY');
                this.setGravity(new Vec2(0, 0));
                this.setSpeed(-60);
                this.setSpeedVar(10);
                this.setRadialAccel(-80);
                this.setRadialAccelVar(0);
                this.setTangentialAccel(80);
                this.setTangentialAccelVar(0);
                this._angle = 90;
                this._angleVar = 360;
                this._life = 4;
                this._lifeVar = 1;
                this._startSize = 37.0;
                this._startSizeVar = 10.0;
                this._endSize = -1;
                this._emissionRate = this._totalParticles / this._life;
                this._startColor.r = 0.12;
                this._startColor.g = 0.25;
                this._startColor.b = 0.76;
                this._startColor.a = 1.0;
                this._startColorVar.r = 0.0;
                this._startColorVar.g = 0.0;
                this._startColorVar.b = 0.0;
                this._startColorVar.a = 0.0;
                this._endColor.r = 0.0;
                this._endColor.g = 0.0;
                this._endColor.b = 0.0;
                this._endColor.a = 1.0;
                this._endColorVar.r = 0.0;
                this._endColorVar.g = 0.0;
                this._endColorVar.b = 0.0;
                this._endColorVar.a = 0.0;
                this._posVar = new Vec2(0, 0 );
                break;
            }
            case STYLE.FLOWER:
            {
                this.initWithTotalParticles(250);
                this._duration = -1;
                this.setEmitterMode('GRAVITY');
                this.setGravity(new Vec2(0, 0));
                this.setSpeed(-80);
                this.setSpeedVar(10);
                this.setRadialAccel(-60);
                this.setRadialAccelVar(0);
                this.setTangentialAccel(15);
                this.setTangentialAccelVar(0);
                this._angle = 90;
                this._angleVar = 360;
                this._life = 4;
                this._lifeVar = 1;
                this._startSize = 30.0;
                this._startSizeVar = 10.0;
                this._endSize = -1;
                this._emissionRate = this._totalParticles / this._life;
                this._startColor.r = 0.50;
                this._startColor.g = 0.50;
                this._startColor.b = 0.50;
                this._startColor.a = 1.0;
                this._startColorVar.r = 0.5;
                this._startColorVar.g = 0.5;
                this._startColorVar.b = 0.5;
                this._startColorVar.a = 0.5;
                this._endColor.r = 0.0;
                this._endColor.g = 0.0;
                this._endColor.b = 0.0;
                this._endColor.a = 1.0;
                this._endColorVar.r = 0.0;
                this._endColorVar.g = 0.0;
                this._endColorVar.b = 0.0;
                this._endColorVar.a = 0.0;
                this._posVar = new Vec2(0, 0 );
                break;
            }
            case STYLE.METEOR:
            {
                this.initWithTotalParticles(150);
                this._duration = -1;
                this.setEmitterMode('GRAVITY');
                this.setGravity(new Vec2(-200, -200));
                this.setSpeed(-15);
                this.setSpeedVar(5);
                this.setRadialAccel(0);
                this.setRadialAccelVar(0);
                this.setTangentialAccel(0);
                this.setTangentialAccelVar(0);
                this._angle = 90;
                this._angleVar = 360;
                this._life = 2;
                this._lifeVar = 1;
                this._startSize = 60.0;
                this._startSizeVar = 10.0;
                this._endSize = -1;
                this._emissionRate = this._totalParticles / this._life;
                this._startColor.r = 0.2;
                this._startColor.g = 0.4;
                this._startColor.b = 0.7;
                this._startColor.a = 1.0;
                this._startColorVar.r = 0.0;
                this._startColorVar.g = 0.0;
                this._startColorVar.b = 0.2;
                this._startColorVar.a = 0.1;
                this._endColor.r = 0.0;
                this._endColor.g = 0.0;
                this._endColor.b = 0.0;
                this._endColor.a = 1.0;
                this._endColorVar.r = 0.0;
                this._endColorVar.g = 0.0;
                this._endColorVar.b = 0.0;
                this._endColorVar.a = 0.0;
                this._posVar = new Vec2(0, 0 );
                break;
            }
            case STYLE.SPIRAL:
            {
                this.initWithTotalParticles(500);
                this._duration = -1;
                this.setEmitterMode('GRAVITY');
                this.setGravity(new Vec2(0, 0));
                this.setSpeed(-150);
                this.setSpeedVar(0);
                this.setRadialAccel(-380);
                this.setRadialAccelVar(0);
                this.setTangentialAccel(45);
                this.setTangentialAccelVar(0);
                this._angle = 90;
                this._angleVar = 0;
                this._life = 12;
                this._lifeVar = 0;
                this._startSize = 20.0;
                this._startSizeVar = 0.0;
                this._endSize = -1;
                this._emissionRate = this._totalParticles / this._life;
                this._startColor.r = 0.5;
                this._startColor.g = 0.5;
                this._startColor.b = 0.5;
                this._startColor.a = 1.0;
                this._startColorVar.r = 0.5;
                this._startColorVar.g = 0.5;
                this._startColorVar.b = 0.5;
                this._startColorVar.a = 0.0;
                this._endColor.r = 0.5;
                this._endColor.g = 0.5;
                this._endColor.b = 0.5;
                this._endColor.a = 1.0;
                this._endColorVar.r = 0.5;
                this._endColorVar.g = 0.5;
                this._endColorVar.b = 0.5;
                this._endColorVar.a = 0.0;
                this._posVar = new Vec2(0, 0 );
                break;
            }
            case STYLE.EXPLOSION:
            {
                this.initWithTotalParticles(700);
                this._duration = 0.1;
                this.setEmitterMode('GRAVITY');
                this.setGravity(new Vec2(0, 0));
                this.setSpeed(-70);
                this.setSpeedVar(40);
                this.setRadialAccel(0);
                this.setRadialAccelVar(0);
                this.setTangentialAccel(0);
                this.setTangentialAccelVar(0);
                this._angle = 90;
                this._angleVar = 360;
                this._life = 5.0;
                this._lifeVar = 2;
                this._startSize = 15.0;
                this._startSizeVar = 10.0;
                this._endSize = -1;
                this._emissionRate = this._totalParticles / this._duration;
                this._startColor.r = 0.7;
                this._startColor.g = 0.1;
                this._startColor.b = 0.2;
                this._startColor.a = 1.0;
                this._startColorVar.r = 0.5;
                this._startColorVar.g = 0.5;
                this._startColorVar.b = 0.5;
                this._startColorVar.a = 0.0;
                this._endColor.r = 0.5;
                this._endColor.g = 0.5;
                this._endColor.b = 0.5;
                this._endColor.a = 0.0;
                this._endColorVar.r = 0.5;
                this._endColorVar.g = 0.5;
                this._endColorVar.b = 0.5;
                this._endColorVar.a = 0.0;
                this._posVar = new Vec2(0, 0 );
                break;
            }
            case STYLE.SMOKE:
            {
                this.initWithTotalParticles(200);
                this._duration = -1;
                this.setEmitterMode('GRAVITY');
                this.setGravity(new Vec2(0, 0));
                this.setRadialAccel(0);
                this.setRadialAccelVar(0);
                this.setSpeed(-25);
                this.setSpeedVar(10);
                this._angle = 90;
                this._angleVar = 5;
                this._life = 4;
                this._lifeVar = 1;
                this._startSize = 60.0;
                this._startSizeVar = 10.0;
                this._endSize = -1;
                this._emissionRate = this._totalParticles / this._life;
                this._startColor.r = 0.8;
                this._startColor.g = 0.8;
                this._startColor.b = 0.8;
                this._startColor.a = 1.0;
                this._startColorVar.r = 0.02;
                this._startColorVar.g = 0.02;
                this._startColorVar.b = 0.02;
                this._startColorVar.a = 0.0;
                this._endColor.r = 0.0;
                this._endColor.g = 0.0;
                this._endColor.b = 0.0;
                this._endColor.a = 1.0;
                this._endColorVar.r = 0.0;
                this._endColorVar.g = 0.0;
                this._endColorVar.b = 0.0;
                this._endColorVar.a = 0.0;
                this._posVar = new Vec2(20.0, 0.0 );
                break;
            }
            case STYLE.SNOW:
            {
                this.initWithTotalParticles(700);
                this._duration = -1;
                this.setEmitterMode('GRAVITY');
                this.setGravity(new Vec2(0, 1));
                this.setSpeed(-5);
                this.setSpeedVar(1);
                this.setRadialAccel(0);
                this.setRadialAccelVar(1);
                this.setTangentialAccel(0);
                this.setTangentialAccelVar(1);
                this._angle = -90;
                this._angleVar = 5;
                this._life = 45;
                this._lifeVar = 15;
                this._startSize = 10.0;
                this._startSizeVar = 5.0;
                this._endSize = -1;
                this._emissionRate = 10;
                this._startColor.r = 1.0;
                this._startColor.g = 1.0;
                this._startColor.b = 1.0;
                this._startColor.a = 1.0;
                this._startColorVar.r = 0.0;
                this._startColorVar.g = 0.0;
                this._startColorVar.b = 0.0;
                this._startColorVar.a = 0.0;
                this._endColor.r = 1.0;
                this._endColor.g = 1.0;
                this._endColor.b = 1.0;
                this._endColor.a = 0.0;
                this._endColorVar.r = 0.0;
                this._endColorVar.g = 0.0;
                this._endColorVar.b = 0.0;
                this._endColorVar.a = 0.0;
                this._posVar = new Vec2(this.x_, 0.0 );
                break;
            }
            case STYLE.RAIN:
            {
                this.initWithTotalParticles(1000);
                this._duration = -1;
                this.setEmitterMode('GRAVITY');
                this.setGravity(new Vec2(10, 10));
                this.setRadialAccel(0);
                this.setRadialAccelVar(1);
                this.setTangentialAccel(0);
                this.setTangentialAccelVar(1);
                this.setSpeed(-130);
                this.setSpeedVar(30);
                this._angle = -90;
                this._angleVar = 5;
                this._life = 4.5;
                this._lifeVar = 0;
                this._startSize = 4.0;
                this._startSizeVar = 2.0;
                this._endSize = -1;
                this._emissionRate = 20;
                this._startColor.r = 0.7;
                this._startColor.g = 0.8;
                this._startColor.b = 1.0;
                this._startColor.a = 1.0;
                this._startColorVar.r = 0.0;
                this._startColorVar.g = 0.0;
                this._startColorVar.b = 0.0;
                this._startColorVar.a = 0.0;
                this._endColor.r = 0.7;
                this._endColor.g = 0.8;
                this._endColor.b = 1.0;
                this._endColor.a = 0.5;
                this._endColorVar.r = 0.0;
                this._endColorVar.g = 0.0;
                this._endColorVar.b = 0.0;
                this._endColorVar.a = 0.0;
                this._posVar = new Vec2(this.x_, 0.0 );
                break;
            }
            default:
                break;
            }
    }
}
ParticleExample.FIRE = STYLE.FIRE;
ParticleExample.FIRE_WORK = STYLE.FIRE_WORK;
ParticleExample.SUN = STYLE.SUN;
ParticleExample.GALAXY = STYLE.GALAXY;
ParticleExample.FLOWER = STYLE.FLOWER;
ParticleExample.METEOR = STYLE.METEOR;
ParticleExample.SPIRAL = STYLE.SPIRAL;
ParticleExample.EXPLOSION = STYLE.EXPLOSION;
ParticleExample.SMOKE = STYLE.SMOKE;
ParticleExample.SNOW = STYLE.SNOW;
ParticleExample.RAIN = STYLE.RAIN;
