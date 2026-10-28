// kys-cpp web server: serves the browser game client, the game resources of a
// kys-cpp game directory (mounted at GAME_DIR), save slots and configuration.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { MusicStore } from './music.js';
import { ResourceStore } from './resources.js';
import { SaveStore, runSql } from './saves.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(here, '..', 'public');
const GAME_DIR = path.resolve(process.env.GAME_DIR || path.resolve(here, '..', '..', 'game'));
const SAVE_DIR = path.resolve(process.env.SAVE_DIR || path.join(GAME_DIR, 'save'));
const CONFIG_FILE = path.resolve(process.env.CONFIG_FILE || path.join(GAME_DIR, 'config', 'kysmod.ini'));
const CACHE_DIR = path.resolve(process.env.CACHE_DIR || path.join(process.env.TMPDIR || '/tmp', 'kys-cache'));
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 64 * 1024 * 1024;
// optional HTTP basic authentication for servers reachable from the internet
const AUTH_USER = process.env.AUTH_USER || '';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';

const resources = new ResourceStore(GAME_DIR);
const saves = new SaveStore(SAVE_DIR);
const music = new MusicStore(GAME_DIR, CACHE_DIR);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.ini': 'text/plain; charset=utf-8',
    '.c': 'text/plain; charset=utf-8',
    '.cifa': 'text/plain; charset=utf-8',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.ttc': 'font/collection',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4',
};

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    res.writeHead(status, { 'Content-Type': type, 'Content-Length': buf.length, ...extra });
    res.end(buf);
}

function sendJson(req, res, status, obj) {
    let buf = Buffer.from(JSON.stringify(obj));
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    if (buf.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        buf = zlib.gzipSync(buf, { level: 6 });
        headers['Content-Encoding'] = 'gzip';
    }
    headers['Content-Length'] = buf.length;
    res.writeHead(status, headers);
    res.end(buf);
}

// Resolves a request path inside a base directory, refusing anything outside of it.
function safeJoin(base, rel) {
    let decoded;
    try {
        decoded = decodeURIComponent(rel);
    } catch {
        return null;
    }
    if (decoded.includes('\0')) {
        return null;
    }
    const full = path.resolve(base, '.' + path.posix.normalize('/' + decoded.replace(/\\/g, '/')));
    if (full !== base && !full.startsWith(base + path.sep)) {
        return null;
    }
    return full;
}

function sendFile(req, res, file, cache = 'no-cache') {
    fs.stat(file, (err, st) => {
        if (err || !st.isFile()) {
            send(res, 404, 'Not found');
            return;
        }
        const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
        const headers = {
            'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': cache,
            ETag: etag,
        };
        if (req.headers['if-none-match'] === etag) {
            res.writeHead(304, headers);
            res.end();
            return;
        }
        headers['Content-Length'] = st.size;
        res.writeHead(200, headers);
        if (req.method === 'HEAD') {
            res.end();
            return;
        }
        fs.createReadStream(file).pipe(res);
    });
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (c) => {
            size += c.length;
            if (size > MAX_BODY) {
                reject(new Error('body too large'));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

async function readJson(req) {
    return JSON.parse((await readBody(req)).toString('utf8') || '{}');
}

function intParam(v, def = 0) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
}

function slotParam(v) {
    const n = intParam(v, -1);
    return n >= 0 && n <= 1000 ? n : -1;
}

async function handleApi(req, res, url) {
    const p = url.pathname;
    const q = url.searchParams;

    if (p === '/api/info' && req.method === 'GET') {
        sendJson(req, res, 200, {
            gameDirFound: fs.existsSync(path.join(GAME_DIR, 'resource')),
            configFound: fs.existsSync(CONFIG_FILE),
        });
        return;
    }

    if (p === '/api/config') {
        if (req.method === 'GET') {
            fs.readFile(CONFIG_FILE, (err, data) => {
                send(res, 200, err ? '' : data, 'text/plain; charset=utf-8', { 'Cache-Control': 'no-store' });
            });
            return;
        }
        if (req.method === 'PUT') {
            const body = await readBody(req);
            if (!body.length) {
                send(res, 400, 'empty config');
                return;
            }
            fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
            fs.writeFileSync(CONFIG_FILE + '.tmp', body);
            fs.renameSync(CONFIG_FILE + '.tmp', CONFIG_FILE);
            sendJson(req, res, 200, { ok: true });
            return;
        }
    }

    if (p === '/api/texgroup' && req.method === 'GET') {
        const g = q.get('g');
        if (!ResourceStore.isSafeGroupPath(g)) {
            send(res, 400, 'bad group');
            return;
        }
        sendJson(req, res, 200, resources.group(g, q.get('dir') === '1').manifest);
        return;
    }

    if (p === '/api/tex' && req.method === 'GET') {
        const g = q.get('g');
        if (!ResourceStore.isSafeGroupPath(g)) {
            send(res, 400, 'bad group');
            return;
        }
        const nums = (q.get('ids') || '').split(',').map((s) => intParam(s, -1)).filter((n) => n >= 0).slice(0, 4096);
        send(res, 200, resources.bundle(g, nums, q.get('dir') === '1'), 'application/octet-stream',
            { 'Cache-Control': 'no-cache' });
        return;
    }

    if (p === '/api/groupfile' && req.method === 'GET') {
        const g = q.get('g');
        const f = q.get('f');
        if (!ResourceStore.isSafeGroupPath(g) || !ResourceStore.isSafeGroupPath(f)) {
            send(res, 400, 'bad request');
            return;
        }
        const data = resources.group(g, q.get('dir') === '1').readFile(f);
        if (!data) {
            send(res, 404, 'Not found');
            return;
        }
        send(res, 200, data, MIME[path.extname(f).toLowerCase()] || 'application/octet-stream');
        return;
    }

    if (p.startsWith('/api/music/') && req.method === 'GET') {
        const num = intParam(p.slice('/api/music/'.length), -1);
        if (num < 0 || num > 999) {
            send(res, 400, 'bad music number');
            return;
        }
        const found = await music.get(num);
        if (!found) {
            send(res, 404, 'Not found');
            return;
        }
        sendFile(req, res, found[0], 'no-cache');
        return;
    }

    if (p === '/api/saves' && req.method === 'GET') {
        sendJson(req, res, 200, saves.list(Math.min(intParam(q.get('max'), 20), 1000), q.get('zip') !== '0'));
        return;
    }

    if (p.startsWith('/api/save/')) {
        const num = slotParam(p.slice('/api/save/'.length));
        if (num < 0) {
            send(res, 400, 'bad slot');
            return;
        }
        const zipSave = q.get('zip') !== '0';
        if (req.method === 'GET') {
            const data = saves.load(num, zipSave);
            if (!data) {
                send(res, 404, 'Not found');
                return;
            }
            sendJson(req, res, 200, data);
            return;
        }
        if (req.method === 'PUT') {
            if (num === 0) {
                send(res, 403, 'slot 0 holds the initial game data and cannot be overwritten');
                return;
            }
            saves.save(num, await readJson(req), zipSave);
            sendJson(req, res, 200, { ok: true });
            return;
        }
    }

    if (p === '/api/sql' && req.method === 'POST') {
        const body = await readJson(req);
        const table = runSql(body.table, body.data, body.sql);
        if (!table) {
            send(res, 400, 'bad sql request');
            return;
        }
        sendJson(req, res, 200, table);
        return;
    }

    send(res, 404, 'Not found');
}

function sameText(a, b) {
    const ha = crypto.createHash('sha256').update(a).digest();
    const hb = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
}

function authorized(req) {
    if (!AUTH_PASSWORD) {
        return true;
    }
    const m = /^Basic\s+(\S+)$/i.exec(req.headers.authorization || '');
    if (!m) {
        return false;
    }
    const text = Buffer.from(m[1], 'base64').toString('utf8');
    const i = text.indexOf(':');
    if (i < 0) {
        return false;
    }
    // evaluate both comparisons to keep the timing independent of the user name
    const user_ok = sameText(text.slice(0, i), AUTH_USER);
    const password_ok = sameText(text.slice(i + 1), AUTH_PASSWORD);
    return (!AUTH_USER || user_ok) && password_ok;
}

const server = http.createServer(async (req, res) => {
    let url;
    try {
        url = new URL(req.url, 'http://localhost');
    } catch {
        send(res, 400, 'Bad request');
        return;
    }
    // health check for Docker and load balancers, never protected
    if (url.pathname === '/healthz') {
        send(res, 200, 'ok');
        return;
    }
    if (!authorized(req)) {
        send(res, 401, 'Authentication required', 'text/plain; charset=utf-8', { 'WWW-Authenticate': 'Basic realm="kys-cpp", charset="UTF-8"' });
        return;
    }
    try {
        if (url.pathname.startsWith('/api/')) {
            await handleApi(req, res, url);
            return;
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            send(res, 405, 'Method not allowed');
            return;
        }
        if (url.pathname.startsWith('/game/')) {
            const rel = url.pathname.slice('/game/'.length);
            const file = safeJoin(GAME_DIR, rel);
            // saves are only reachable through /api/save
            if (!file || file.startsWith(SAVE_DIR + path.sep) || file === CONFIG_FILE) {
                send(res, 403, 'Forbidden');
                return;
            }
            sendFile(req, res, file, 'no-cache');
            return;
        }
        let rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const file = safeJoin(PUBLIC_DIR, rel);
        if (!file) {
            send(res, 403, 'Forbidden');
            return;
        }
        sendFile(req, res, file, 'no-cache');
    } catch (e) {
        console.error(e);
        if (!res.headersSent) {
            send(res, 500, 'Internal error');
        } else {
            res.destroy();
        }
    }
});

server.listen(PORT, HOST, () => {
    console.log(`kys-cpp web server listening on http://${HOST}:${PORT}`);
    console.log(`Game directory: ${GAME_DIR}${fs.existsSync(path.join(GAME_DIR, 'resource')) ? '' : ' (WARNING: resource/ not found)'}`);
    console.log(`Save directory: ${SAVE_DIR}`);
    console.log(AUTH_PASSWORD ? 'Password protection enabled' : 'No password protection (set AUTH_PASSWORD to enable it)');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
        server.close();
        process.exit(0);
    });
}
