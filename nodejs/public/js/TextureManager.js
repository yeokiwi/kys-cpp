// TextureManager: texture groups addressed by "path" + number, with offsets
// (index.ka / index.txt). Images are fetched lazily from the server in batches;
// sizes and offsets come from the group manifest, so layout code works before
// the pixels have arrived.
import { DEFAULT_RI } from './Color.js';
import { Engine } from './Engine.js';
import { FrameClock } from './FrameClock.js';
import { crand } from './util.js';

const SUB_TEXTURE_COUNT = 10;

export class TextureWarpper {
    constructor(group, num, entry) {
        this.tex = new Array(SUB_TEXTURE_COUNT).fill(null);
        this.tex_white = null;
        this.group_info_ = group;
        this.num_ = num;
        this.dx = entry ? entry[0] : 0;
        this.dy = entry ? entry[1] : 0;
        this.w = entry ? entry[2] : 0;
        this.h = entry ? entry[3] : 0;
        this.sub_ = entry ? entry[4] : -1;
        this.count = this.sub_ > 0 ? this.sub_ : 1;
        this.loaded = false;
        this.ready = false;
        this.prev_show = -1;
        this.waiters_ = null;
    }

    getTexture(i = 0) {
        return this.tex[i];
    }

    setTex(t) {
        this.tex.fill(null);
        this.tex[0] = t;
        this.count = 1;
        this.loaded = true;
        this.ready = true;
        this.w = t.w;
        this.h = t.h;
    }

    // starts loading, drawing simply skips the texture until it has arrived
    load() {
        if (!this.loaded) {
            this.loaded = true;
            if (this.sub_ < 0) {
                this.ready = true;
                this.count = 0;
                return;
            }
            TextureManager.requestImage(this.group_info_, this.num_);
        }
    }

    loadAsync() {
        this.load();
        if (this.ready) {
            return Promise.resolve(this);
        }
        if (!this.waiters_) {
            this.waiters_ = [];
        }
        return new Promise((resolve) => this.waiters_.push(resolve));
    }

    onImage(sub, texture) {
        this.tex[sub < 0 ? 0 : sub] = texture;
        if (sub <= 0 && texture) {
            this.w = texture.w;
            this.h = texture.h;
        }
    }

    onLoaded() {
        this.ready = true;
        if (this.sub_ > 0) {
            let n = 0;
            while (n < SUB_TEXTURE_COUNT && this.tex[n]) {
                n++;
            }
            this.count = n;
        } else {
            this.count = this.tex[0] ? 1 : 0;
        }
        const w = this.waiters_;
        this.waiters_ = null;
        if (w) {
            for (const f of w) {
                f(this);
            }
        }
    }

    createWhiteTexture() {
        if (!this.tex_white && this.tex[0]) {
            this.tex_white = this.tex[0].makeWhite();
        }
    }
}

export class TextureGroup {
    constructor(path) {
        this.path = path;
        this.group_ = [];
        this.inited_ = 0;    // 0: not requested, 1: loading manifest, 2: ready
        this.ext = '.png';
        this.promise_ = null;
    }

    getTextureCount() {
        return this.group_.length;
    }

    init(loadFromPath, loadAll) {
        if (this.inited_) {
            return this.promise_;
        }
        this.inited_ = 1;
        if (!this.path) {
            this.ext = '.png';
            this.group_ = [];
            this.inited_ = 2;
            this.promise_ = Promise.resolve(this);
            return this.promise_;
        }
        const q = new URLSearchParams({ g: this.path });
        if (loadFromPath) {
            q.set('dir', '1');
        }
        this.promise_ = fetch(`/api/texgroup?${q}`)
            .then((r) => (r.ok ? r.json() : { ext: '.png', count: 0, entries: [] }))
            .catch(() => ({ ext: '.png', count: 0, entries: [] }))
            .then((m) => {
                this.ext = m.ext;
                this.group_ = m.entries.map((e, i) => new TextureWarpper(this, i, e));
                this.inited_ = 2;
                if (loadAll) {
                    for (const t of this.group_) {
                        t.load();
                    }
                }
                return this;
            });
        return this.promise_;
    }

    // TextureGroup::getFileContent: a file stored next to the images (directory or zip)
    async getFileContent(filename) {
        const q = new URLSearchParams({ g: this.path, f: filename });
        if (TextureManager.load_from_path_) {
            q.set('dir', '1');
        }
        try {
            const r = await fetch(`/api/groupfile?${q}`);
            return r.ok ? await r.text() : '';
        } catch {
            return '';
        }
    }
}

class TextureManagerImpl {
    constructor() {
        this.map_ = new Map();
        this.load_from_path_ = 0;
        this.load_all_ = 0;
        this.queue_ = new Map();
        this.flush_scheduled_ = false;
        this.inflight_ = 0;
        this.pendingCount_ = 0;
    }

    setLoadFromPath(l) {
        this.load_from_path_ = l;
    }

    setLoadAll(l) {
        this.load_all_ = l;
    }

    getTextureGroup(path) {
        let g = this.map_.get(path);
        if (!g) {
            g = new TextureGroup(path);
            this.map_.set(path, g);
        }
        if (!g.inited_) {
            g.init(this.load_from_path_, this.load_all_);
        }
        return g;
    }

    getTextureGroupCount(path) {
        return this.getTextureGroup(path).group_.length;
    }

    getTexture(path, num) {
        const g = this.getTextureGroup(path);
        if (num < 0 || num >= g.group_.length) {
            return null;
        }
        return g.group_[num];
    }

    // waits until the manifests of the groups are known
    async ensureGroups(paths) {
        await Promise.all(paths.map((p) => this.getTextureGroup(p).promise_));
    }

    async ensureGroup(path) {
        await this.getTextureGroup(path).promise_;
        return this.map_.get(path);
    }

    // waits until the listed textures are decoded (used before pre-rendering)
    async preload(path, nums) {
        const g = await this.ensureGroup(path);
        const list = [];
        for (const n of nums) {
            const t = g.group_[n];
            if (t) {
                list.push(t.loadAsync());
            }
        }
        await Promise.all(list);
    }

    async preloadAll(path) {
        const g = await this.ensureGroup(path);
        await Promise.all(g.group_.map((t) => t.loadAsync()));
    }

    requestImage(group, num) {
        let set = this.queue_.get(group);
        if (!set) {
            set = new Set();
            this.queue_.set(group, set);
        }
        set.add(num);
        this.pendingCount_++;
        if (!this.flush_scheduled_) {
            this.flush_scheduled_ = true;
            setTimeout(() => this.flushQueue(), 0);
        }
    }

    isLoading() {
        return this.pendingCount_ > 0;
    }

    flushQueue() {
        this.flush_scheduled_ = false;
        const queue = this.queue_;
        this.queue_ = new Map();
        for (const [group, set] of queue) {
            const nums = [...set];
            for (let i = 0; i < nums.length; i += 256) {
                this.fetchBundle(group, nums.slice(i, i + 256));
            }
        }
    }

    async fetchBundle(group, nums) {
        const q = new URLSearchParams({ g: group.path, ids: nums.join(',') });
        if (this.load_from_path_) {
            q.set('dir', '1');
        }
        let buf = null;
        for (let attempt = 0; attempt < 3 && !buf; attempt++) {
            try {
                const r = await fetch(`/api/tex?${q}`);
                if (r.ok) {
                    buf = await r.arrayBuffer();
                }
            } catch {
                await new Promise((res) => setTimeout(res, 300 * (attempt + 1)));
            }
        }
        const decodes = [];
        if (buf) {
            const dv = new DataView(buf);
            const count = dv.getUint32(0, true);
            let p = 4;
            const mime = group.ext === '.webp' ? 'image/webp' : 'image/png';
            for (let i = 0; i < count; i++) {
                const num = dv.getInt32(p, true);
                const sub = dv.getInt32(p + 4, true);
                const len = dv.getUint32(p + 8, true);
                const bytes = new Uint8Array(buf, p + 12, len);
                p += 12 + len;
                decodes.push(createImageBitmap(new Blob([bytes], { type: mime }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
                    .then((bmp) => {
                        const t = Engine.loadImageFromBitmap(bmp);
                        bmp.close?.();
                        group.group_[num]?.onImage(sub, t);
                    })
                    .catch(() => {}));
            }
        }
        await Promise.all(decodes);
        for (const n of nums) {
            group.group_[n]?.onLoaded();
        }
        this.pendingCount_ -= nums.length;
    }

    // TextureManager::renderTexture(tex, x, y, info, w, h)
    renderTexture(tex, x, y, info = DEFAULT_RI, w = -1, h = -1) {
        if (typeof tex === 'string') {
            // renderTexture(path, num, x, y, info, w, h)
            const t = this.getTexture(tex, x);
            this.renderTexture(t, y, info, arguments[4] ?? DEFAULT_RI, arguments[5] ?? -1, arguments[6] ?? -1);
            return;
        }
        if (!tex) {
            return;
        }
        const engine = Engine;
        if (engine.ui_ && !engine.ui_.isExecuting() && engine.getRenderTarget() === engine.getMainTexture()) {
            engine.ui_.drawTexture(tex, x, y, info, w, h);
            return;
        }
        tex.load();
        if (!tex.ready || !tex.tex[0]) {
            return;
        }
        const zx = info.zoom_x ?? 1;
        const zy = info.zoom_y ?? 1;
        let rw = w;
        let rh = h;
        if (rw < 0) {
            rw = Math.trunc(tex.w * zx);
        }
        if (rh < 0) {
            rh = Math.trunc(tex.h * zy);
        }
        let i = 0;
        if (tex.count > 1) {
            const now = FrameClock.getShowTimes();
            if (now === tex.prev_show) {
                i = crand() % tex.count;
            } else {
                i = now % tex.count;
            }
            tex.prev_show = now;
        }
        const t = tex.tex[i] || tex.tex[0];
        const c = info.c || { r: 255, g: 255, b: 255 };
        const alpha = info.alpha ?? 255;
        const angle = info.angle || 0;
        const hasLight = (info.color_v && info.color_v.length) || (info.brightness_v && info.brightness_v.length);
        if (!hasLight) {
            Engine.setColor(t, { r: c.r, g: c.g, b: c.b, a: alpha });
            engine.renderTexture(t, x - tex.dx, y - tex.dy, rw, rh, angle);
        } else {
            Engine.setColor(t, { r: 255, g: 255, b: 255, a: alpha });
            engine.renderTextureLight(t, null, { x: x - tex.dx, y: y - tex.dy, w: rw, h: rh }, info.color_v, info.brightness_v, angle);
        }
        if (info.white) {
            tex.createWhiteTexture();
            if (tex.tex_white) {
                Engine.setColor(tex.tex_white, { r: 255, g: 255, b: 255, a: info.white });
                engine.renderTexture(tex.tex_white, x - tex.dx, y - tex.dy, rw, rh, angle);
            }
        }
    }

    renderTextureByName(path, num, x, y, info = DEFAULT_RI, w = -1, h = -1) {
        this.renderTexture(this.getTexture(path, num), x, y, info, w, h);
    }
}

export const TextureManager = new TextureManagerImpl();
TextureManager.getInstance = () => TextureManager;
