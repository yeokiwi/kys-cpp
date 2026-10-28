// Texture groups: resource/<path>/ (directory) or resource/<path>.zip, exactly as
// TextureManager/TextureGroup in the C++ version. The server builds a manifest
// for each group (count, offsets, image sizes) so the browser knows texture
// sizes before the images themselves have been downloaded.
import fs from 'node:fs';
import path from 'node:path';
import { ZipReader } from './zip.js';

const SUB_TEXTURE_COUNT = 10;

// Same rule as strfunc::findNumbers: the first run of number characters that
// contains a digit.
export function findNumbers(s) {
    const result = [];
    let str = '';
    let haveNum = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        const isNum = (c >= '0' && c <= '9') || c === '.' || c === '-' || c === '+' || c === 'E' || c === 'e';
        if (isNum) {
            str += c;
            if (c >= '0' && c <= '9') {
                haveNum = true;
            }
        }
        if (!isNum || i === s.length - 1) {
            if (str !== '' && haveNum) {
                const v = parseFloat(str);
                result.push(Number.isNaN(v) ? 0 : v);
            }
            str = '';
            haveNum = false;
        }
    }
    return result;
}

export function imageSize(buf) {
    if (!buf || buf.length < 30) {
        return [0, 0];
    }
    // PNG
    if (buf.readUInt32BE(0) === 0x89504e47) {
        return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    }
    // WebP
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
        const chunk = buf.toString('ascii', 12, 16);
        if (chunk === 'VP8 ') {
            return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
        }
        if (chunk === 'VP8L') {
            const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
            const w = 1 + (((b1 & 0x3f) << 8) | b0);
            const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
            return [w, h];
        }
        if (chunk === 'VP8X') {
            const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
            const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
            return [w, h];
        }
    }
    // BMP / JPEG are not used by the game resources.
    return [0, 0];
}

function readImageHeader(file) {
    let fd;
    try {
        fd = fs.openSync(file, 'r');
        const buf = Buffer.alloc(32);
        fs.readSync(fd, buf, 0, 32, 0);
        return imageSize(buf);
    } catch {
        return [0, 0];
    } finally {
        if (fd !== undefined) {
            fs.closeSync(fd);
        }
    }
}

class TextureGroupSource {
    constructor(root, groupPath, loadFromPath) {
        this.groupPath = groupPath;
        this.dir = path.join(root, groupPath);
        this.zip = null;
        if (!loadFromPath) {
            this.zip = ZipReader.open(this.dir + '.zip');
        }
        this.files = new Set();
        if (this.zip) {
            for (const n of this.zip.names()) {
                this.files.add(n);
            }
        } else {
            try {
                for (const n of fs.readdirSync(this.dir)) {
                    this.files.add(n);
                }
            } catch {
                // the group does not exist, it will be empty
            }
        }
        this.manifest = this.buildManifest();
    }

    readFile(name) {
        if (this.zip) {
            try {
                return this.zip.read(name);
            } catch {
                return null;
            }
        }
        if (!this.files.has(name)) {
            return null;
        }
        try {
            return fs.readFileSync(path.join(this.dir, name));
        } catch {
            return null;
        }
    }

    sizeOf(name) {
        if (this.zip) {
            return imageSize(this.readFile(name));
        }
        return readImageHeader(path.join(this.dir, name));
    }

    buildManifest() {
        let maxNum = -1;
        let ext = '';
        let mixed = false;
        for (const f of this.files) {
            const dot = f.lastIndexOf('.');
            if (dot < 0) {
                continue;
            }
            const e = f.slice(dot + 1).toLowerCase();
            if (e !== 'png' && e !== 'webp') {
                continue;
            }
            if (!ext) {
                ext = e;
            } else if (ext !== e) {
                mixed = true;
                break;
            }
            const base = path.basename(f).slice(0, path.basename(f).lastIndexOf('.'));
            const nums = findNumbers(base);
            if (nums.length) {
                maxNum = Math.max(maxNum, Math.trunc(nums[0]));
            }
        }
        if (mixed) {
            console.log(`Texture group ${this.groupPath} mixes PNG and WebP files; use one image format per group`);
            return { ext: '.png', count: 0, entries: [] };
        }
        this.ext = '.' + (ext || 'png');
        const count = Math.max(0, maxNum + 1);
        // [dx, dy, w, h, sub]; sub: 0 = main image exists, n > 0 = n sub images, -1 = none
        const entries = [];
        for (let i = 0; i < count; i++) {
            entries.push([0, 0, 0, 0, -1]);
        }
        const indexTxt = this.readFile('index.txt');
        if (indexTxt && indexTxt.length) {
            for (let line of indexTxt.toString('utf8').split('\n')) {
                line = line.replace(/\r/g, '');
                const nums = findNumbers(line).map(Math.trunc);
                if (nums.length >= 3 && nums[0] >= 0 && nums[0] < count) {
                    entries[nums[0]][0] = nums[1];
                    entries[nums[0]][1] = nums[2];
                }
            }
        } else {
            const ka = this.readFile('index.ka');
            if (ka) {
                const n = Math.min(count, Math.floor(ka.length / 4));
                for (let i = 0; i < n; i++) {
                    entries[i][0] = ka.readInt16LE(i * 4);
                    entries[i][1] = ka.readInt16LE(i * 4 + 2);
                }
            }
        }
        for (let i = 0; i < count; i++) {
            const main = `${i}${this.ext}`;
            if (this.files.has(main)) {
                const [w, h] = this.sizeOf(main);
                entries[i][2] = w;
                entries[i][3] = h;
                entries[i][4] = 0;
                continue;
            }
            let sub = 0;
            while (sub < SUB_TEXTURE_COUNT && this.files.has(`${i}_${sub}${this.ext}`)) {
                sub++;
            }
            if (sub > 0) {
                const [w, h] = this.sizeOf(`${i}_0${this.ext}`);
                entries[i][2] = w;
                entries[i][3] = h;
                entries[i][4] = sub;
            }
        }
        if (count > 0) {
            console.log(`Load texture group ${this.zip ? 'from file' : 'from path'}: ${this.groupPath}${this.zip ? '.zip' : ''}, ${count} textures`);
        }
        return { ext: this.ext, count, entries };
    }

    imageFiles(num) {
        const e = this.manifest.entries[num];
        if (!e) {
            return [];
        }
        if (e[4] === 0) {
            return [[-1, `${num}${this.ext}`]];
        }
        const list = [];
        for (let i = 0; i < e[4]; i++) {
            list.push([i, `${num}_${i}${this.ext}`]);
        }
        return list;
    }
}

export class ResourceStore {
    constructor(gameDir) {
        this.gameDir = gameDir;
        this.resourceDir = path.join(gameDir, 'resource');
        this.groups = new Map();
    }

    static isSafeGroupPath(p) {
        return typeof p === 'string' && p.length > 0 && p.length < 256
            && !p.includes('\0') && !p.split(/[\\/]/).some((s) => s === '..' || s === '');
    }

    group(groupPath, loadFromPath = false) {
        const key = `${loadFromPath ? 1 : 0}:${groupPath}`;
        let g = this.groups.get(key);
        if (!g) {
            g = new TextureGroupSource(this.resourceDir, groupPath, loadFromPath);
            this.groups.set(key, g);
        }
        return g;
    }

    // Binary bundle: u32 count, then per image: i32 num, i32 sub, u32 length, bytes.
    bundle(groupPath, nums, loadFromPath) {
        const g = this.group(groupPath, loadFromPath);
        const parts = [];
        let count = 0;
        for (const num of nums) {
            for (const [sub, name] of g.imageFiles(num)) {
                const data = g.readFile(name);
                if (!data) {
                    continue;
                }
                const header = Buffer.alloc(12);
                header.writeInt32LE(num, 0);
                header.writeInt32LE(sub, 4);
                header.writeUInt32LE(data.length, 8);
                parts.push(header, data);
                count++;
            }
        }
        const head = Buffer.alloc(4);
        head.writeUInt32LE(count, 0);
        return Buffer.concat([head, ...parts]);
    }
}
