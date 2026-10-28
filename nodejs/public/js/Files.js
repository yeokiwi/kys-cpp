// Access to files of the game directory served by the Node.js server under /game/.
// (GameUtil::PATH() in the C++ version.)

export const PATH = '/game/';

function url(rel) {
    return PATH + rel.split('/').map(encodeURIComponent).join('/');
}

export async function readText(rel) {
    try {
        const r = await fetch(url(rel));
        if (!r.ok) {
            return '';
        }
        return await r.text();
    } catch {
        return '';
    }
}

export async function readBinary(rel) {
    try {
        const r = await fetch(url(rel));
        if (!r.ok) {
            return null;
        }
        return await r.arrayBuffer();
    } catch {
        return null;
    }
}

const existCache = new Map();

export async function exists(rel) {
    if (existCache.has(rel)) {
        return existCache.get(rel);
    }
    let ok = false;
    try {
        const r = await fetch(url(rel), { method: 'HEAD' });
        ok = r.ok;
    } catch {
        ok = false;
    }
    existCache.set(rel, ok);
    return ok;
}

export function fileUrl(rel) {
    return url(rel);
}
