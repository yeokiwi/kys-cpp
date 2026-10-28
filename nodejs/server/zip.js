// Minimal ZIP reader/writer (STORE and DEFLATE), compatible with the archives
// produced and consumed by mlcc's ZipFile2 in the C++ version of the game.
import fs from 'node:fs';
import zlib from 'node:zlib';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

function normalizeName(name) {
    return name.replace(/\\/g, '/');
}

// Reads the whole archive into memory; game resource archives are small enough
// and this keeps lookups trivial.
export class ZipReader {
    constructor(buffer) {
        this.buffer = buffer;
        this.entries = new Map();
        this.parse();
    }

    static open(filename) {
        try {
            return new ZipReader(fs.readFileSync(filename));
        } catch {
            return null;
        }
    }

    parse() {
        const b = this.buffer;
        let end = -1;
        for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
            if (b.readUInt32LE(i) === SIG_END) {
                end = i;
                break;
            }
        }
        if (end < 0) {
            throw new Error('not a zip archive');
        }
        const count = b.readUInt16LE(end + 10);
        let p = b.readUInt32LE(end + 16);
        for (let i = 0; i < count; i++) {
            if (b.readUInt32LE(p) !== SIG_CENTRAL) {
                break;
            }
            const method = b.readUInt16LE(p + 10);
            const compressedSize = b.readUInt32LE(p + 20);
            const size = b.readUInt32LE(p + 24);
            const nameLen = b.readUInt16LE(p + 28);
            const extraLen = b.readUInt16LE(p + 30);
            const commentLen = b.readUInt16LE(p + 32);
            const localOffset = b.readUInt32LE(p + 42);
            const name = normalizeName(b.toString('utf8', p + 46, p + 46 + nameLen));
            this.entries.set(name, { method, compressedSize, size, localOffset });
            p += 46 + nameLen + extraLen + commentLen;
        }
    }

    names() {
        return [...this.entries.keys()];
    }

    has(name) {
        return this.entries.has(normalizeName(name));
    }

    read(name) {
        const e = this.entries.get(normalizeName(name));
        if (!e) {
            return null;
        }
        const b = this.buffer;
        if (b.readUInt32LE(e.localOffset) !== SIG_LOCAL) {
            return null;
        }
        const nameLen = b.readUInt16LE(e.localOffset + 26);
        const extraLen = b.readUInt16LE(e.localOffset + 28);
        const start = e.localOffset + 30 + nameLen + extraLen;
        const data = b.subarray(start, start + e.compressedSize);
        if (e.method === 0) {
            return Buffer.from(data);
        }
        if (e.method === 8) {
            return zlib.inflateRawSync(data);
        }
        throw new Error(`unsupported zip compression method ${e.method}`);
    }
}

export function writeZip(filename, files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const [rawName, content] of files) {
        const name = Buffer.from(normalizeName(rawName), 'utf8');
        const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
        const deflated = zlib.deflateRawSync(data);
        const useDeflate = deflated.length < data.length;
        const stored = useDeflate ? deflated : data;
        const crc = zlib.crc32(data) >>> 0;
        const local = Buffer.alloc(30);
        local.writeUInt32LE(SIG_LOCAL, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);    // UTF-8 names
        local.writeUInt16LE(useDeflate ? 8 : 0, 8);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(stored.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        locals.push(local, name, stored);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(SIG_CENTRAL, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(useDeflate ? 8 : 0, 10);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(stored.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, name);
        offset += 30 + name.length + stored.length;
    }
    const centralSize = centrals.reduce((s, b) => s + b.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(SIG_END, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    const tmp = filename + '.tmp';
    fs.writeFileSync(tmp, Buffer.concat([...locals, ...centrals, end]));
    fs.renameSync(tmp, filename);
}
