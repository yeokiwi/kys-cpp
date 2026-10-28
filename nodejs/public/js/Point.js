// Point / Pointf and direction helpers (Point.h)

export const Towards_RightUp = 0;
export const Towards_RightDown = 1;
export const Towards_LeftUp = 2;
export const Towards_LeftDown = 3;
export const Towards_None = 4;

export class Pointf {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    clone() {
        return new Pointf(this.x, this.y, this.z);
    }

    set(p) {
        this.x = p.x;
        this.y = p.y;
        this.z = p.z ?? 0;
        return this;
    }

    norm() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    normTo(n) {
        const n1 = this.norm();
        if (n1 !== 0) {
            this.x *= n / n1;
            this.y *= n / n1;
            this.z *= n / n1;
        }
        return this;
    }

    normXYTo(n) {
        const n1 = Math.sqrt(this.x * this.x + this.y * this.y);
        if (n1 !== 0) {
            this.x *= n / n1;
            this.y *= n / n1;
        }
        return this;
    }

    mulSelf(f) {
        this.x *= f;
        this.y *= f;
        this.z *= f;
        return this;
    }

    addSelf(p) {
        this.x += p.x;
        this.y += p.y;
        this.z += p.z ?? 0;
        return this;
    }

    add(p) {
        return new Pointf(this.x + p.x, this.y + p.y, this.z + (p.z ?? 0));
    }

    sub(p) {
        return new Pointf(this.x - p.x, this.y - p.y, this.z - (p.z ?? 0));
    }

    mul(f) {
        return new Pointf(this.x * f, this.y * f, this.z * f);
    }

    neg() {
        return new Pointf(-this.x, -this.y, -this.z);
    }

    rotate(angle) {
        const a = this.getAngle() + angle;
        const n = Math.sqrt(this.x * this.x + this.y * this.y);
        this.x = n * Math.cos(a);
        this.y = n * Math.sin(a);
        return this;
    }

    getAngle() {
        return Math.atan2(this.y, this.x);
    }
}

export class Point {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

export function realTowardsToFaceTowards(t) {
    if (t.x >= 0 && t.y > 0) {
        return Towards_RightDown;
    }
    if (t.x > 0 && t.y <= 0) {
        return Towards_RightUp;
    }
    if (t.x < 0 && t.y >= 0) {
        return Towards_LeftDown;
    }
    if (t.x <= 0 && t.y < 0) {
        return Towards_LeftUp;
    }
    return Towards_None;
}

export function EuclidDis(x, y) {
    if (typeof x === 'object') {
        return Math.sqrt((x.x - y.x) ** 2 + (x.y - y.y) ** 2);
    }
    return Math.sqrt(x * x + y * y);
}
