// Engine: the platform layer (SDL3 in the C++ version), implemented with WebGL2
// and DOM events. Coordinates follow SDL: origin at the top left, y down.
import * as K from './Keys.js';
import { clamp } from './util.js';

const VS = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
in vec4 a_color;
uniform vec4 u_proj;
out vec2 v_uv;
out vec4 v_color;
void main() {
    gl_Position = vec4(a_pos.x * u_proj.x + u_proj.z, a_pos.y * u_proj.y + u_proj.w, 0.0, 1.0);
    v_uv = a_uv;
    v_color = a_color;
}`;

const FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_color;
uniform sampler2D u_tex;
uniform int u_white;
out vec4 outColor;
void main() {
    vec4 c = texture(u_tex, v_uv);
    if (u_white == 1) { c.rgb = vec3(1.0); }
    outColor = c * v_color;
}`;

const MAX_VERTS = 16384;
const FLOATS_PER_VERT = 8;

let textureSerial = 0;

export class Texture {
    constructor(engine, glTex, w, h) {
        this.engine = engine;
        this.gl = glTex;
        this.w = w;
        this.h = h;
        this.color = [255, 255, 255];
        this.alpha = 255;
        this.blend = K.BLENDMODE_BLEND;
        this.white = 0;
        this.fbo = null;
        this.id = ++textureSerial;
        this.linear = true;
    }

    destroy() {
        const gl = this.engine.gl;
        if (this.fbo) {
            gl.deleteFramebuffer(this.fbo);
            this.fbo = null;
        }
        if (this.gl && !this.shared) {
            gl.deleteTexture(this.gl);
        }
        this.gl = null;
    }

    // a texture sharing the pixels but drawn white (Engine::toWhite)
    makeWhite() {
        const t = new Texture(this.engine, this.gl, this.w, this.h);
        t.white = 1;
        t.shared = true;
        return t;
    }
}

class EngineImpl {
    constructor() {
        this.ui_w_ = 1024;
        this.ui_h_ = 640;
        this.base_ui_w_ = 1024;
        this.base_ui_h_ = 640;
        this.rect_ = { x: 0, y: 0, w: 1024, h: 640 };
        this.keep_ratio_ = true;
        this.ratio_x_ = 1;
        this.ratio_y_ = 1;
        this.rotation_ = 0;
        this.tex_ = null;
        this.tex_map_ = new Map();
        this.target_ = null;
        this.render_times_ = 0;
        this.max_texture_size_ = 4096;
        this.texture_top_left_highlight_enabled_ = true;
        this.events_ = [];
        this.keys_ = new Set();
        this.mouse_ = { x: 0, y: 0, buttons: 0 };
        this.start_ = performance.now();
        this.virtual_stick_button_ = new Map();
        this.virtual_stick_axis_ = new Array(6).fill(0);
        this.prev_controller_press_ = 0;
        this.interval_controller_press_ = 0;
        this.pad_prev_ = new Map();
        this.touch_pinch_scale_ = 1;
        this.touch_camera_pan_ = { x: 0, y: 0 };
        this.text_input_ = false;
        this.touches_ = new Map();
        this.inited_ = false;
        this.watchers_ = [];
    }

    // ---------- initialization ----------
    init(canvas, options = {}) {
        if (this.inited_) {
            return 0;
        }
        this.inited_ = true;
        this.canvas = canvas;
        this.texture_top_left_highlight_enabled_ = options.texture_top_left_highlight !== 0;
        const gl = canvas.getContext('webgl2', {
            alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false, depth: false, stencil: false,
        });
        if (!gl) {
            throw new Error('WebGL2 is not available in this browser');
        }
        this.gl = gl;
        this.max_texture_size_ = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        this.initProgram();
        this.resizeCanvas();
        // a 1x1 white texture for fills and untextured geometry
        this.white_ = this.createTextureFromPixels(new Uint8Array([255, 255, 255, 255]), 1, 1);
        this.square_ = this.createRectTexture(100, 100, 0);
        this.createMainTexture(this.ui_w_, this.ui_h_);
        this.installEvents();
        return 0;
    }

    initProgram() {
        const gl = this.gl;
        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                throw new Error(gl.getShaderInfoLog(s));
            }
            return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(p));
        }
        gl.useProgram(p);
        this.prog_ = p;
        this.u_proj_ = gl.getUniformLocation(p, 'u_proj');
        this.u_white_ = gl.getUniformLocation(p, 'u_white');
        gl.uniform1i(gl.getUniformLocation(p, 'u_tex'), 0);
        this.vao_ = gl.createVertexArray();
        gl.bindVertexArray(this.vao_);
        this.vbo_ = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo_);
        gl.bufferData(gl.ARRAY_BUFFER, MAX_VERTS * FLOATS_PER_VERT * 4, gl.DYNAMIC_DRAW);
        const stride = FLOATS_PER_VERT * 4;
        const loc = (n) => gl.getAttribLocation(p, n);
        gl.enableVertexAttribArray(loc('a_pos'));
        gl.vertexAttribPointer(loc('a_pos'), 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(loc('a_uv'));
        gl.vertexAttribPointer(loc('a_uv'), 2, gl.FLOAT, false, stride, 8);
        gl.enableVertexAttribArray(loc('a_color'));
        gl.vertexAttribPointer(loc('a_color'), 4, gl.FLOAT, false, stride, 16);
        this.ibo_ = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo_);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, MAX_VERTS * 3 * 2, gl.DYNAMIC_DRAW);
        this.verts_ = new Float32Array(MAX_VERTS * FLOATS_PER_VERT);
        this.indices_ = new Uint16Array(MAX_VERTS * 3);
        this.nverts_ = 0;
        this.nindices_ = 0;
        this.batch_tex_ = null;
        this.batch_blend_ = -1;
        this.batch_white_ = 0;
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        this.current_blend_ = -1;
    }

    // ---------- window ----------
    resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
        const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
            return true;
        }
        return false;
    }

    getWindowSize() {
        return [this.canvas.width, this.canvas.height];
    }

    getWindowWidth() {
        return this.canvas.width;
    }

    getWindowHeight() {
        return this.canvas.height;
    }

    setUISize(w, h) {
        this.ui_w_ = w;
        this.ui_h_ = h;
        this.base_ui_w_ = w;
        this.base_ui_h_ = h;
    }

    getUISize() {
        return [this.ui_w_, this.ui_h_];
    }

    getUIWidth() {
        return this.ui_w_;
    }

    getUIHeight() {
        return this.ui_h_;
    }

    getMaxTextureSize() {
        return this.max_texture_size_;
    }

    setWindowTitle(t) {
        document.title = t;
    }

    isFullScreen() {
        return !!document.fullscreenElement;
    }

    setFullScreen(b) {
        if (b && !document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
        } else if (!b && document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
        }
    }

    toggleFullscreen() {
        this.setFullScreen(!this.isFullScreen());
    }

    getPresentWidth() {
        return this.rect_.w;
    }

    getPresentHeight() {
        return this.rect_.h;
    }

    getPresentRect() {
        return [this.rect_.x, this.rect_.y, this.rect_.w, this.rect_.h];
    }

    getDisplayScale() {
        if (this.ui_w_ === 0) {
            return 1;
        }
        return Math.max(1, this.rect_.w / this.ui_w_);
    }

    setKeepRatio(b) {
        return (this.keep_ratio_ = b);
    }

    setRatio(x, y) {
        this.ratio_x_ = x;
        this.ratio_y_ = y;
    }

    setPresentPosition(tex) {
        if (!tex) {
            return;
        }
        const [w_dst, h_dst] = this.getWindowSize();
        const w_src = tex.w * this.ratio_x_;
        const h_src = tex.h * this.ratio_y_;
        if (this.keep_ratio_) {
            if (w_src === 0 || h_src === 0) {
                return;
            }
            const ratio = Math.min(w_dst / w_src, h_dst / h_src);
            this.rect_.x = Math.trunc((w_dst - w_src * ratio) / 2);
            this.rect_.y = Math.trunc((h_dst - h_src * ratio) / 2);
            this.rect_.w = Math.trunc(w_src * ratio);
            this.rect_.h = Math.trunc(h_src * ratio);
        } else {
            this.rect_ = { x: 0, y: 0, w: w_dst, h: h_dst };
        }
    }

    windowToUISpace(wx, wy, clampIt = false) {
        const { x: px, y: py, w: pw, h: ph } = this.rect_;
        if (pw <= 0 || ph <= 0 || this.ui_w_ <= 0 || this.ui_h_ <= 0) {
            return { inside: false, x: 0, y: 0 };
        }
        const inside = wx >= px && wx < px + pw && wy >= py && wy < py + ph;
        if (!inside && !clampIt) {
            return { inside: false, x: 0, y: 0 };
        }
        let cx = wx;
        let cy = wy;
        if (clampIt) {
            cx = clamp(cx, px, px + pw - 1);
            cy = clamp(cy, py, py + ph - 1);
        }
        let ux = Math.trunc(((cx - px) * this.ui_w_) / pw);
        let uy = Math.trunc(((cy - py) * this.ui_h_) / ph);
        ux = clamp(ux, 0, this.ui_w_ - 1);
        uy = clamp(uy, 0, this.ui_h_ - 1);
        return { inside, x: ux, y: uy };
    }

    uiToWindowSpace(ux, uy) {
        const { x: px, y: py, w: pw, h: ph } = this.rect_;
        ux = clamp(ux, 0, this.ui_w_ - 1);
        uy = clamp(uy, 0, this.ui_h_ - 1);
        return [px + Math.trunc((ux * pw) / this.ui_w_), py + Math.trunc((uy * ph) / this.ui_h_)];
    }

    // ---------- textures ----------
    createTextureFromPixels(pixels, w, h) {
        const gl = this.gl;
        this.flush();
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        this.setTexParams(true);
        this.batch_tex_ = null;
        return new Texture(this, t, w, h);
    }

    createTextureFromImage(img) {
        const gl = this.gl;
        this.flush();
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        this.setTexParams(true);
        this.batch_tex_ = null;
        return new Texture(this, t, img.width, img.height);
    }

    setTexParams(linear) {
        const gl = this.gl;
        const f = linear ? gl.LINEAR : gl.NEAREST;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    setTextureScaleNearest(t) {
        this.setTextureScale(t, false);
    }

    setTextureScaleLinear(t) {
        this.setTextureScale(t, true);
    }

    setTextureScale(t, linear) {
        if (!t || !t.gl) {
            return;
        }
        this.flush();
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, t.gl);
        this.setTexParams(linear);
        t.linear = linear;
        this.batch_tex_ = null;
    }

    createRenderedTextureRaw(w, h) {
        w = Math.max(1, Math.min(Math.trunc(w), this.max_texture_size_));
        h = Math.max(1, Math.min(Math.trunc(h), this.max_texture_size_));
        const gl = this.gl;
        this.flush();
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        this.setTexParams(true);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.batch_tex_ = null;
        const tex = new Texture(this, t, w, h);
        tex.fbo = fbo;
        this.bindTarget(this.target_);
        return tex;
    }

    createMainTexture(w, h) {
        this.resetRenderTarget();
        if (this.tex_) {
            this.tex_.destroy();
        }
        this.tex_ = this.createRenderedTextureRaw(w, h);
        this.setPresentPosition(this.tex_);
    }

    getMainTexture() {
        return this.tex_;
    }

    createAssistTexture(name, w, h) {
        const old = this.tex_map_.get(name);
        if (old) {
            if (this.target_ === old) {
                this.setRenderTarget(null);
            }
            old.destroy();
        }
        this.tex_map_.set(name, this.createRenderedTextureRaw(w, h));
    }

    // Engine::createRenderedTexture(name, w, h)
    createRenderedTexture(name, w, h) {
        const old = this.tex_map_.get(name);
        if (old) {
            if (old.w === w && old.h === h) {
                return;
            }
            old.destroy();
        }
        this.tex_map_.set(name, this.createRenderedTextureRaw(w, h));
    }

    getTexture(name) {
        return this.tex_map_.get(name) || null;
    }

    getAssistTextureSize(name) {
        const t = this.tex_map_.get(name);
        return t ? [t.w, t.h] : [0, 0];
    }

    getTextureSize(t) {
        return t ? [t.w, t.h] : [0, 0];
    }

    destroyTexture(t) {
        if (t) {
            this.flush();
            t.destroy();
        }
    }

    resizeRenderTexturesToWindow() {
        if (!this.tex_) {
            return false;
        }
        const [windowW, windowH] = this.getWindowSize();
        if (windowW <= 0 || windowH <= 0) {
            return false;
        }
        const baseUiW = Math.max(1, this.base_ui_w_);
        const baseUiH = Math.max(1, this.base_ui_h_);
        const windowAspect = windowW / windowH;
        const baseAspect = baseUiW / baseUiH;
        let newUiW = baseUiW;
        let newUiH = baseUiH;
        if (windowAspect >= baseAspect) {
            newUiW = Math.max(baseUiW, Math.round(windowAspect * baseUiH));
        } else {
            newUiH = Math.max(baseUiH, Math.round(baseUiW / windowAspect));
        }
        let resized = false;
        if (newUiW !== this.ui_w_ || newUiH !== this.ui_h_) {
            this.ui_w_ = newUiW;
            this.ui_h_ = newUiH;
            this.createMainTexture(this.ui_w_, this.ui_h_);
            resized = true;
        }
        const scene = this.tex_map_.get('scene');
        if (scene) {
            const sceneW = scene.w;
            const sceneH = scene.h;
            const newSceneH = Math.max(1, sceneH > 0 ? sceneH : newUiH);
            const newSceneW = Math.max(1, Math.round((windowW * newSceneH) / windowH));
            if (newSceneW !== sceneW || newSceneH !== sceneH) {
                this.createAssistTexture('scene', newSceneW, newSceneH);
                resized = true;
            }
        }
        this.setPresentPosition(this.tex_);
        return resized;
    }

    static setColor(tex, c) {
        if (!tex) {
            return;
        }
        tex.color = [c.r ?? c[0], c.g ?? c[1], c.b ?? c[2]];
        tex.alpha = c.a ?? c[3] ?? 255;
        tex.blend = K.BLENDMODE_BLEND;
    }

    setColor(tex, c) {
        EngineImpl.setColor(tex, c);
    }

    setTextureAlphaMod(tex, a) {
        if (tex) {
            tex.alpha = a;
        }
    }

    setTextureBlendMode(tex, mode = K.BLENDMODE_BLEND) {
        if (tex) {
            tex.blend = mode;
        }
    }

    getTextureBlendMode(tex) {
        return tex ? tex.blend : K.BLENDMODE_BLEND;
    }

    // ---------- render target ----------
    setRenderTarget(t) {
        if (typeof t === 'string') {
            t = this.tex_map_.get(t) || null;
        }
        if (t === this.target_) {
            return;
        }
        this.flush();
        this.target_ = t;
        this.bindTarget(t);
    }

    bindTarget(t) {
        const gl = this.gl;
        if (t && t.fbo) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
            gl.viewport(0, 0, t.w, t.h);
            // texture rows are stored top-down, so no flip for render targets
            this.proj_ = [2 / t.w, 2 / t.h, -1, -1];
            this.out_w_ = t.w;
            this.out_h_ = t.h;
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            this.proj_ = [2 / this.canvas.width, -2 / this.canvas.height, -1, 1];
            this.out_w_ = this.canvas.width;
            this.out_h_ = this.canvas.height;
        }
        gl.uniform4fv(this.u_proj_, this.proj_);
    }

    getRenderTarget() {
        return this.target_;
    }

    resetRenderTarget() {
        this.setRenderTarget(null);
    }

    setRenderMainTexture() {
        this.setRenderTarget(this.tex_);
    }

    getCurrentRenderOutputSize() {
        return [this.out_w_, this.out_h_];
    }

    renderClear() {
        this.flush();
        const gl = this.gl;
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // ---------- batching ----------
    applyBlend(mode) {
        if (mode === this.current_blend_) {
            return;
        }
        const gl = this.gl;
        this.current_blend_ = mode;
        switch (mode) {
        case K.BLENDMODE_NONE:
            gl.disable(gl.BLEND);
            return;
        case K.BLENDMODE_ADD:
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
            return;
        case K.BLENDMODE_MOD:
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.ZERO, gl.SRC_COLOR, gl.ZERO, gl.ONE);
            return;
        case K.BLENDMODE_MUL:
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
            return;
        case K.BLENDMODE_BLEND_PREMULTIPLIED:
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            return;
        case K.BLENDMODE_ADD_PREMULTIPLIED:
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
            return;
        default:
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }
    }

    flush() {
        if (this.nindices_ === 0) {
            return;
        }
        const gl = this.gl;
        this.applyBlend(this.batch_blend_);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.batch_gl_tex_);
        gl.uniform1i(this.u_white_, this.batch_white_);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo_);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.verts_, 0, this.nverts_ * FLOATS_PER_VERT);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo_);
        gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, this.indices_, 0, this.nindices_);
        gl.drawElements(gl.TRIANGLES, this.nindices_, gl.UNSIGNED_SHORT, 0);
        this.nverts_ = 0;
        this.nindices_ = 0;
    }

    begin(glTex, blend, white, nv, ni) {
        if (glTex !== this.batch_gl_tex_ || blend !== this.batch_blend_ || white !== this.batch_white_
            || this.nverts_ + nv > MAX_VERTS || this.nindices_ + ni > MAX_VERTS * 3) {
            this.flush();
            this.batch_gl_tex_ = glTex;
            this.batch_blend_ = blend;
            this.batch_white_ = white;
        }
        return this.nverts_;
    }

    pushVertex(x, y, u, v, r, g, b, a) {
        const o = this.nverts_ * FLOATS_PER_VERT;
        const d = this.verts_;
        d[o] = x;
        d[o + 1] = y;
        d[o + 2] = u;
        d[o + 3] = v;
        d[o + 4] = r;
        d[o + 5] = g;
        d[o + 6] = b;
        d[o + 7] = a;
        this.nverts_++;
    }

    pushQuad(t, sx, sy, sw, sh, dx, dy, dw, dh, angle, r, g, b, a, blend) {
        const base = this.begin(t.gl, blend, t.white, 4, 6);
        const u0 = sx / t.w;
        const v0 = sy / t.h;
        const u1 = (sx + sw) / t.w;
        const v1 = (sy + sh) / t.h;
        if (angle) {
            const rad = (angle * Math.PI) / 180;
            const c = Math.cos(rad);
            const s = Math.sin(rad);
            const cx = dx + dw / 2;
            const cy = dy + dh / 2;
            const pts = [[dx, dy, u0, v0], [dx + dw, dy, u1, v0], [dx + dw, dy + dh, u1, v1], [dx, dy + dh, u0, v1]];
            for (const [px, py, u, v] of pts) {
                const rx = px - cx;
                const ry = py - cy;
                this.pushVertex(cx + rx * c - ry * s, cy + rx * s + ry * c, u, v, r, g, b, a);
            }
        } else {
            this.pushVertex(dx, dy, u0, v0, r, g, b, a);
            this.pushVertex(dx + dw, dy, u1, v0, r, g, b, a);
            this.pushVertex(dx + dw, dy + dh, u1, v1, r, g, b, a);
            this.pushVertex(dx, dy + dh, u0, v1, r, g, b, a);
        }
        const ix = this.indices_;
        let n = this.nindices_;
        ix[n++] = base;
        ix[n++] = base + 1;
        ix[n++] = base + 2;
        ix[n++] = base + 2;
        ix[n++] = base + 3;
        ix[n++] = base;
        this.nindices_ = n;
        this.render_times_++;
    }

    // ---------- drawing (SDL_Render*) ----------
    // renderTexture(t) / renderTexture(t, x, y, w, h, angle, inPresent) / renderTextureRect(t, src, dst, angle)
    renderTextureFull(t, angle = 0) {
        if (!t) {
            return;
        }
        this.renderTextureRect(t, null, this.rect_, angle);
    }

    renderTexture(t, x, y, w = 0, h = 0, angle = 0, inPresent = 0) {
        if (!t) {
            return;
        }
        if (inPresent === 1) {
            x += this.rect_.x;
            y += this.rect_.y;
        }
        if (w < 0) {
            w = t.w;
        }
        if (h < 0) {
            h = t.h;
        }
        this.renderTextureRect(t, null, { x, y, w, h }, angle);
    }

    renderTextureRect(t, src, dst, angle = 0) {
        if (!t || !t.gl) {
            return;
        }
        if (t === this.target_) {
            return;
        }
        const sx = src ? src.x : 0;
        const sy = src ? src.y : 0;
        const sw = src ? src.w : t.w;
        const sh = src ? src.h : t.h;
        let dx;
        let dy;
        let dw;
        let dh;
        if (dst) {
            dx = dst.x;
            dy = dst.y;
            dw = dst.w;
            dh = dst.h;
        } else {
            dx = 0;
            dy = 0;
            dw = this.out_w_;
            dh = this.out_h_;
        }
        this.pushQuad(t, sx, sy, sw, sh, dx, dy, dw, dh, angle,
            t.color[0] / 255, t.color[1] / 255, t.color[2] / 255, t.alpha / 255, t.blend);
    }

    // vertices: [{x, y, u, v (normalized), r, g, b, a (0..1)}]
    renderGeometry(t, vertices, indices, blend) {
        const tex = t || this.white_;
        if (!tex.gl || tex === this.target_) {
            return;
        }
        const b = blend ?? tex.blend;
        if (vertices.length > MAX_VERTS) {
            return;
        }
        const base = this.begin(tex.gl, b, tex.white, vertices.length, indices.length);
        for (const v of vertices) {
            this.pushVertex(v.x, v.y, v.u, v.v, v.r, v.g, v.b, v.a);
        }
        const ix = this.indices_;
        let n = this.nindices_;
        for (const i of indices) {
            ix[n++] = base + i;
        }
        this.nindices_ = n;
        this.render_times_++;
    }

    // Engine::renderTexture(t, rect0, v, v2): a textured quad with free corners
    renderTextureQuad(t, rect0, v, v2) {
        if (!t || v.length < 4) {
            if (rect0) {
                this.renderTextureRect(t, rect0, rect0);
            } else {
                this.renderTextureFull(t);
            }
            return;
        }
        let src;
        if (v2 && v2.length >= 4) {
            src = v2;
        } else if (rect0) {
            src = [{ x: rect0.x, y: rect0.y }, { x: rect0.x + rect0.w, y: rect0.y },
                { x: rect0.x + rect0.w, y: rect0.y + rect0.h }, { x: rect0.x, y: rect0.y + rect0.h }];
        } else {
            src = [{ x: 0, y: 0 }, { x: t.w, y: 0 }, { x: t.w, y: t.h }, { x: 0, y: t.h }];
        }
        const verts = [];
        for (let i = 0; i < 4; i++) {
            verts.push({ x: v[i].x, y: v[i].y, u: src[i].x / t.w, v: src[i].y / t.h, r: 1, g: 1, b: 1, a: 1 });
        }
        this.renderGeometry(t, verts, [0, 1, 2, 2, 3, 0]);
    }

    renderTextureMesh(t, v, v2, colors, indices, top_left_brightness = 0) {
        if (!v.length || v.length !== v2.length || !indices.length) {
            return;
        }
        const tw = t ? t.w : 1;
        const th = t ? t.h : 1;
        const useColors = colors && colors.length === v.length;
        const verts = v.map((p, i) => {
            const c = useColors ? colors[i] : null;
            return {
                x: p.x, y: p.y, u: v2[i].x / tw, v: v2[i].y / th,
                r: c ? c.r / 255 : 1, g: c ? c.g / 255 : 1, b: c ? c.b / 255 : 1, a: c ? c.a / 255 : 1,
            };
        });
        this.renderGeometry(t, verts, indices);
        if (this.texture_top_left_highlight_enabled_ && top_left_brightness > 0 && t) {
            let minX = v[0].x;
            let maxX = v[0].x;
            let minY = v[0].y;
            let maxY = v[0].y;
            for (const p of v) {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
            }
            const width = Math.max(1, maxX - minX);
            const height = Math.max(1, maxY - minY);
            for (const vert of verts) {
                const lw = (maxX - vert.x) / width;
                const tw2 = (maxY - vert.y) / height;
                const br = top_left_brightness * clamp(lw, 0, 1) * clamp(tw2, 0, 1);
                vert.r = br;
                vert.g = br;
                vert.b = br;
                vert.a = 1;
            }
            this.renderGeometry(t, verts, indices, K.BLENDMODE_ADD);
        }
    }

    // Engine::renderTextureLight: a quad with per-corner colors, plus additive
    // "brightness" passes (used for the lighting of buildings and earth)
    renderTextureLight(t, rect0, rect1, colors, brightness_v = [], angle = 0) {
        if (!t || !rect1 || !t.gl) {
            return;
        }
        let w = rect1.w;
        let h = rect1.h;
        if (w < 0) {
            w = t.w;
        }
        if (h < 0) {
            h = t.h;
        }
        const x0 = rect1.x;
        const y0 = rect1.y;
        const x1 = x0 + w;
        const y1 = y0 + h;
        const tx0 = rect0 ? rect0.x : 0;
        const ty0 = rect0 ? rect0.y : 0;
        const tx1 = tx0 + (rect0 ? rect0.w : t.w);
        const ty1 = ty0 + (rect0 ? rect0.h : t.h);
        // like SDL_RenderGeometry, texture color/alpha modulation is ignored: colors are per vertex
        const col = (i) => {
            const c = colors && colors.length > i ? colors[i] : null;
            if (!c) {
                return [1, 1, 1, 1];
            }
            return [c.r / 255, c.g / 255, c.b / 255, (c.a ?? 255) / 255];
        };
        const verts = [
            { x: x0, y: y0, u: tx0 / t.w, v: ty0 / t.h, c: col(0) },
            { x: x1, y: y0, u: tx1 / t.w, v: ty0 / t.h, c: col(1) },
            { x: x1, y: y1, u: tx1 / t.w, v: ty1 / t.h, c: col(2) },
            { x: x0, y: y1, u: tx0 / t.w, v: ty1 / t.h, c: col(3) },
        ];
        if (angle) {
            const rad = (angle * Math.PI) / 180;
            const c = Math.cos(rad);
            const s = Math.sin(rad);
            const cx = x0 + w * 0.5;
            const cy = y0 + h * 0.5;
            for (const v of verts) {
                const rx = v.x - cx;
                const ry = v.y - cy;
                v.x = cx + rx * c - ry * s;
                v.y = cy + rx * s + ry * c;
            }
        }
        const idx = [0, 1, 2, 2, 3, 0];
        this.renderGeometry(t, verts.map((v) => ({ x: v.x, y: v.y, u: v.u, v: v.v, r: v.c[0], g: v.c[1], b: v.c[2], a: v.c[3] })), idx);
        if (brightness_v && brightness_v.length) {
            const b = [0, 0, 0, 0];
            for (let i = 0; i < 4; i++) {
                if (i < brightness_v.length) {
                    b[i] = Math.max(0, brightness_v[i]);
                }
            }
            if (!this.texture_top_left_highlight_enabled_) {
                b[0] = 0;
            }
            const maxB = Math.max(b[0], b[1], b[2], b[3]);
            const fullPass = Math.floor(maxB);
            const remain = maxB - fullPass;
            const pass = (base) => {
                const vs = verts.map((v, i) => {
                    const k = clamp(b[i] - base, 0, 1);
                    return { x: v.x, y: v.y, u: v.u, v: v.v, r: k, g: k, b: k, a: 1 };
                });
                this.renderGeometry(t, vs, idx, K.BLENDMODE_ADD);
            };
            for (let p = 0; p < fullPass; p++) {
                pass(p);
            }
            if (remain > 0) {
                pass(fullPass);
            }
        }
    }

    fillColor(color, x, y, w, h, blend = K.BLENDMODE_BLEND) {
        if (this.ui_ && !this.ui_.isExecuting() && this.target_ === this.tex_) {
            this.ui_.fillColor(color, x, y, w, h, blend);
            return;
        }
        this.fillColorDirect(color, x, y, w, h, blend);
    }

    fillColorDirect(color, x, y, w, h, blend = K.BLENDMODE_BLEND) {
        if (w < 0 || h < 0) {
            [w, h] = this.getCurrentRenderOutputSize();
        }
        const a = (color.a ?? 255) / 255;
        const base = this.begin(this.white_.gl, blend, 0, 4, 6);
        const r = color.r / 255;
        const g = color.g / 255;
        const b = color.b / 255;
        this.pushVertex(x, y, 0, 0, r, g, b, a);
        this.pushVertex(x + w, y, 1, 0, r, g, b, a);
        this.pushVertex(x + w, y + h, 1, 1, r, g, b, a);
        this.pushVertex(x, y + h, 0, 1, r, g, b, a);
        const ix = this.indices_;
        let n = this.nindices_;
        ix[n++] = base;
        ix[n++] = base + 1;
        ix[n++] = base + 2;
        ix[n++] = base + 2;
        ix[n++] = base + 3;
        ix[n++] = base;
        this.nindices_ = n;
    }

    renderMainTextureToWindow() {
        this.resetRenderTarget();
        this.renderTextureFull(this.tex_);
    }

    renderTextureToMain(name) {
        this.setRenderTarget(this.tex_);
        this.renderTextureRect(this.tex_map_.get(name), null, null);
    }

    renderSquareTexture(rect, color, alpha) {
        const c = { r: color.r, g: color.g, b: color.b, a: alpha };
        if (this.ui_ && !this.ui_.isExecuting() && this.target_ === this.tex_) {
            this.ui_.drawRawTexture(this.square_, rect, c);
            return;
        }
        EngineImpl.setColor(this.square_, c);
        this.renderTextureRect(this.square_, null, rect);
    }

    createRectTexture(w, h, style) {
        const pixels = new Uint8Array(w * h * 4);
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                let a = 255;
                if (style === 0) {
                    a = Math.trunc(100 + 150 * Math.cos(Math.PI * (y / w - 0.5))) & 255;
                }
                const o = (y * w + x) * 4;
                pixels[o] = 255;
                pixels[o + 1] = 255;
                pixels[o + 2] = 255;
                pixels[o + 3] = a;
            }
        }
        return this.createTextureFromPixels(pixels, w, h);
    }

    // Upload a decoded image (ImageBitmap); as_white makes all colors white
    loadImageFromBitmap(bitmap, asWhite = 0) {
        const t = this.createTextureFromImage(bitmap);
        if (asWhite) {
            return t.makeWhite();
        }
        return t;
    }

    // a texture with the given text rendered in white (SDL_ttf blended)
    createTextTexture(fontFamily, text, size) {
        if (!this.text_canvas_) {
            this.text_canvas_ = document.createElement('canvas');
            this.text_ctx_ = this.text_canvas_.getContext('2d', { willReadFrequently: false });
        }
        const ctx = this.text_ctx_;
        const font = `${size}px ${fontFamily}`;
        ctx.font = font;
        const m = ctx.measureText(text);
        const ascent = Math.ceil(m.fontBoundingBoxAscent ?? size * 0.88);
        const descent = Math.ceil(m.fontBoundingBoxDescent ?? size * 0.12);
        const w = Math.max(1, Math.ceil(m.width));
        const h = Math.max(1, ascent + descent);
        const cv = this.text_canvas_;
        if (cv.width < w || cv.height < h) {
            cv.width = Math.max(cv.width, w);
            cv.height = Math.max(cv.height, h);
        }
        ctx.font = font;
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(text, 0, ascent);
        const img = ctx.getImageData(0, 0, w, h);
        const t = this.createTextureFromPixels(new Uint8Array(img.data.buffer), w, h);
        return t;
    }

    renderPresent() {
        this.flush();
    }

    resetRenderTimes(t = 0) {
        this.render_times_ = t;
    }

    getRenderTimes() {
        return this.render_times_;
    }

    setTextureTopLeftHighlightEnabled(b) {
        this.texture_top_left_highlight_enabled_ = b;
    }

    // ---------- time ----------
    static getTicks() {
        return performance.now() - ENGINE_START;
    }

    getTicks() {
        return performance.now() - ENGINE_START;
    }

    // waits for the next displayed frame, at least `ms` milliseconds
    waitFrame(ms) {
        return new Promise((resolve) => {
            const target = performance.now() + Math.max(0, ms);
            if (document.hidden) {
                setTimeout(resolve, Math.max(1, ms));
                return;
            }
            const tick = () => {
                if (performance.now() >= target - 1.5 || document.hidden) {
                    resolve();
                } else {
                    requestAnimationFrame(tick);
                }
            };
            requestAnimationFrame(tick);
        });
    }

    static delay(ms) {
        return new Promise((r) => setTimeout(r, Math.max(0, ms)));
    }

    // ---------- events ----------
    addEventWatch(fn) {
        this.watchers_.push(fn);
    }

    pushEventInternal(e) {
        for (const w of this.watchers_) {
            w(e);
        }
        const q = this.events_;
        // coalesce high frequency events so the one-event-per-frame loop does not lag
        if (q.length && (e.type === K.EVENT_MOUSE_MOTION || e.type === K.EVENT_GAMEPAD_AXIS_MOTION || e.type === K.EVENT_WINDOW_RESIZED)
            && q[q.length - 1].type === e.type) {
            q[q.length - 1] = e;
            return;
        }
        if (q.length > 256) {
            q.shift();
        }
        q.push(e);
    }

    pushEvent(e) {
        this.pushEventInternal(e);
    }

    pollEvent() {
        this.pollGamepads();
        const e = this.events_.shift();
        if (e && (e.type === K.EVENT_WINDOW_RESIZED || e.type === K.EVENT_WINDOW_PIXEL_SIZE_CHANGED)) {
            this.resizeRenderTexturesToWindow();
        }
        return e || null;
    }

    flushEvent() {
        this.events_.length = 0;
    }

    checkKeyPress(key) {
        return this.keys_.has(key);
    }

    checkMouseButtonPress(button) {
        return (this.mouse_.buttons & (1 << (button - 1))) !== 0;
    }

    getMouseState() {
        return [this.mouse_.x, this.mouse_.y];
    }

    getMouseStateInStartWindow() {
        const r = this.windowToUISpace(this.mouse_.x, this.mouse_.y, true);
        return [r.x, r.y];
    }

    setMouseState() {
        // browsers cannot move the pointer
    }

    setMouseStateInStartWindow() {
        // browsers cannot move the pointer
    }

    canvasPoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = this.canvas.width / Math.max(1, rect.width);
        const sy = this.canvas.height / Math.max(1, rect.height);
        return [Math.trunc((e.clientX - rect.left) * sx), Math.trunc((e.clientY - rect.top) * sy)];
    }

    installEvents() {
        const c = this.canvas;
        c.tabIndex = 0;
        const sdlButton = (b) => (b === 0 ? K.BUTTON_LEFT : b === 1 ? K.BUTTON_MIDDLE : b === 2 ? K.BUTTON_RIGHT : b + 1);
        const track = (e, down) => {
            if (e.pointerType !== 'touch') {
                return;
            }
            if (down) {
                const [x, y] = this.canvasPoint(e);
                this.touches_.set(e.pointerId, { x, y });
            } else {
                this.touches_.delete(e.pointerId);
            }
        };
        c.addEventListener('pointermove', (e) => {
            if (this.touches_.has(e.pointerId)) {
                track(e, true);
            }
            const [x, y] = this.canvasPoint(e);
            this.mouse_.x = x;
            this.mouse_.y = y;
            this.pushEventInternal({ type: K.EVENT_MOUSE_MOTION, motion: { x, y }, which: e.pointerType });
        });
        c.addEventListener('pointerdown', (e) => {
            c.focus();
            track(e, true);
            const [x, y] = this.canvasPoint(e);
            this.mouse_.x = x;
            this.mouse_.y = y;
            const button = sdlButton(e.button);
            this.mouse_.buttons |= 1 << (button - 1);
            try {
                c.setPointerCapture(e.pointerId);
            } catch {
                // ignore
            }
            if (e.pointerType === 'touch') {
                this.pushEventInternal({ type: K.EVENT_FINGER_DOWN, tfinger: this.fingerData(e) });
            }
            this.pushEventInternal({ type: K.EVENT_MOUSE_BUTTON_DOWN, button: { button, x, y, clicks: e.detail || 1 }, motion: { x, y }, which: e.pointerType });
            e.preventDefault();
        });
        const up = (e) => {
            track(e, false);
            const [x, y] = this.canvasPoint(e);
            this.mouse_.x = x;
            this.mouse_.y = y;
            const button = sdlButton(e.button);
            this.mouse_.buttons &= ~(1 << (button - 1));
            if (e.pointerType === 'touch') {
                this.pushEventInternal({ type: K.EVENT_FINGER_UP, tfinger: this.fingerData(e) });
            }
            this.pushEventInternal({ type: K.EVENT_MOUSE_BUTTON_UP, button: { button, x, y, clicks: 1 }, motion: { x, y }, which: e.pointerType });
            e.preventDefault();
        };
        c.addEventListener('pointerup', up);
        c.addEventListener('pointercancel', (e) => {
            track(e, false);
            this.mouse_.buttons = 0;
            if (e.pointerType === 'touch') {
                this.pushEventInternal({ type: K.EVENT_FINGER_UP, tfinger: this.fingerData(e) });
            }
        });
        c.addEventListener('contextmenu', (e) => e.preventDefault());
        c.addEventListener('wheel', (e) => {
            const y = e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0;
            const x = e.deltaX < 0 ? -1 : e.deltaX > 0 ? 1 : 0;
            this.pushEventInternal({ type: K.EVENT_MOUSE_WHEEL, wheel: { x, y } });
            e.preventDefault();
        }, { passive: false });
        const isGameKey = (k) => k === K.K_UP || k === K.K_DOWN || k === K.K_LEFT || k === K.K_RIGHT || k === K.K_SPACE
            || k === K.K_TAB || k === K.K_BACKSPACE || k === K.K_PAGEUP || k === K.K_PAGEDOWN || k === K.K_RETURN;
        window.addEventListener('keydown', (e) => {
            if (e.target && e.target.dataset && e.target.dataset.passthrough) {
                return;
            }
            const key = K.keyFromBrowser(e);
            if (key === K.K_UNKNOWN) {
                return;
            }
            if (e.isComposing) {
                return;
            }
            this.keys_.add(key);
            this.pushEventInternal({ type: K.EVENT_KEY_DOWN, key: { key, repeat: e.repeat } });
            if (!this.text_input_ && (isGameKey(key) || e.ctrlKey === false)) {
                if (isGameKey(key) || (key >= 97 && key <= 122)) {
                    e.preventDefault();
                }
            }
            if (this.text_input_ && (key === K.K_RETURN || key === K.K_ESCAPE || key === K.K_TAB)) {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.target && e.target.dataset && e.target.dataset.passthrough) {
                return;
            }
            const key = K.keyFromBrowser(e);
            if (key === K.K_UNKNOWN) {
                return;
            }
            this.keys_.delete(key);
            if (e.isComposing) {
                return;
            }
            this.pushEventInternal({ type: K.EVENT_KEY_UP, key: { key, repeat: false } });
        });
        window.addEventListener('blur', () => {
            this.keys_.clear();
            this.mouse_.buttons = 0;
        });
        document.addEventListener('visibilitychange', () => {
            this.pushEventInternal({ type: document.hidden ? K.EVENT_DID_ENTER_BACKGROUND : K.EVENT_DID_ENTER_FOREGROUND });
        });
        const onResize = () => {
            if (this.resizeCanvas()) {
                this.setPresentPosition(this.tex_);
                this.pushEventInternal({ type: K.EVENT_WINDOW_RESIZED });
            }
        };
        window.addEventListener('resize', onResize);
        new ResizeObserver(onResize).observe(c);
        window.addEventListener('gamepadconnected', () => this.pushEventInternal({ type: K.EVENT_GAMEPAD_ADDED }));
        window.addEventListener('gamepaddisconnected', () => this.pushEventInternal({ type: K.EVENT_GAMEPAD_REMOVED }));

        // hidden input element for text input / IME (SDL_StartTextInput)
        const input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.setAttribute('autocapitalize', 'off');
        input.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:24px;opacity:0;pointer-events:none;z-index:-1;';
        document.body.appendChild(input);
        this.text_input_el_ = input;
        input.addEventListener('compositionupdate', (e) => {
            this.pushEventInternal({ type: K.EVENT_TEXT_EDITING, edit: { text: e.data || '' } });
        });
        input.addEventListener('compositionend', (e) => {
            this.pushEventInternal({ type: K.EVENT_TEXT_EDITING, edit: { text: '' } });
            if (e.data) {
                this.pushEventInternal({ type: K.EVENT_TEXT_INPUT, text: { text: e.data } });
            }
            input.value = '';
        });
        input.addEventListener('input', (e) => {
            if (e.isComposing) {
                return;
            }
            if (input.value) {
                this.pushEventInternal({ type: K.EVENT_TEXT_INPUT, text: { text: input.value } });
            }
            input.value = '';
        });
        input.addEventListener('blur', () => {
            if (this.text_input_) {
                setTimeout(() => this.text_input_ && input.focus(), 0);
            }
        });
    }

    fingerData(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            fingerID: e.pointerId,
            x: (e.clientX - rect.left) / Math.max(1, rect.width),
            y: (e.clientY - rect.top) / Math.max(1, rect.height),
        };
    }

    // active touch points in window (canvas pixel) coordinates
    getTouchPoints() {
        return [...this.touches_.values()];
    }

    startTextInput() {
        this.text_input_ = true;
        this.text_input_el_.value = '';
        this.text_input_el_.focus();
    }

    stopTextInput() {
        this.text_input_ = false;
        this.text_input_el_.blur();
        this.canvas.focus();
    }

    setTextInputArea(x, y) {
        const rect = this.canvas.getBoundingClientRect();
        const [wx, wy] = this.uiToWindowSpace(x, y);
        this.text_input_el_.style.left = `${rect.left + (wx * rect.width) / this.canvas.width}px`;
        this.text_input_el_.style.top = `${rect.top + (wy * rect.height) / this.canvas.height}px`;
    }

    // ---------- gamepads ----------
    pollGamepads() {
        if (!navigator.getGamepads) {
            return;
        }
        const pads = navigator.getGamepads();
        for (const pad of pads) {
            if (!pad) {
                continue;
            }
            let prev = this.pad_prev_.get(pad.index);
            if (!prev) {
                prev = { buttons: [], axes: [] };
                this.pad_prev_.set(pad.index, prev);
            }
            pad.buttons.forEach((b, i) => {
                const sdl = K.STANDARD_TO_SDL_BUTTON[i];
                if (sdl === undefined || sdl < 0) {
                    return;
                }
                const pressed = b.pressed;
                if (pressed !== !!prev.buttons[i]) {
                    this.pushEventInternal({ type: pressed ? K.EVENT_GAMEPAD_BUTTON_DOWN : K.EVENT_GAMEPAD_BUTTON_UP, gbutton: { button: sdl } });
                }
                prev.buttons[i] = pressed;
            });
            const axes = this.padAxes(pad);
            for (let i = 0; i < axes.length; i++) {
                if (Math.abs(axes[i] - (prev.axes[i] || 0)) > 3000) {
                    this.pushEventInternal({ type: K.EVENT_GAMEPAD_AXIS_MOTION, gaxis: { axis: i, value: axes[i] } });
                    prev.axes[i] = axes[i];
                }
            }
        }
    }

    padAxes(pad) {
        const a = pad.axes;
        const v = (x) => clamp(Math.round((x || 0) * 32767), -32768, 32767);
        return [v(a[0]), v(a[1]), v(a[2]), v(a[3]),
            v(pad.buttons[6] ? pad.buttons[6].value : 0), v(pad.buttons[7] ? pad.buttons[7].value : 0)];
    }

    padButtonPressed(key) {
        if (!navigator.getGamepads) {
            return false;
        }
        for (const pad of navigator.getGamepads()) {
            if (!pad) {
                continue;
            }
            const idx = K.STANDARD_TO_SDL_BUTTON.indexOf(key);
            if (idx >= 0 && pad.buttons[idx] && pad.buttons[idx].pressed) {
                this.cur_pad_ = pad;
                return true;
            }
        }
        return false;
    }

    gameControllerGetButton(key) {
        let pressed = false;
        if (this.getTicks() > this.prev_controller_press_ + this.interval_controller_press_) {
            pressed = this.padButtonPressed(key);
            if (!pressed) {
                pressed = (this.virtual_stick_button_.get(key) || 0) !== 0;
            }
            if (pressed) {
                this.prev_controller_press_ = this.getTicks();
            }
            this.interval_controller_press_ = 0;
        }
        return pressed;
    }

    gameControllerGetAxis(axis) {
        if (navigator.getGamepads) {
            for (const pad of navigator.getGamepads()) {
                if (!pad) {
                    continue;
                }
                const v = this.padAxes(pad)[axis] || 0;
                if (v) {
                    this.cur_pad_ = pad;
                    return v;
                }
            }
        }
        return this.virtual_stick_axis_[axis] || 0;
    }

    gameControllerRumble(l, h, time) {
        if (this.rumble_enabled_ === false) {
            return;
        }
        const pad = this.cur_pad_;
        const act = pad && pad.vibrationActuator;
        if (act && act.playEffect) {
            act.playEffect('dual-rumble', { duration: time, strongMagnitude: clamp(l / 100, 0, 1), weakMagnitude: clamp(h / 100, 0, 1) }).catch(() => {});
        }
    }

    setInterValControllerPress(t) {
        this.interval_controller_press_ = t;
    }

    setGameControllerButton(key, value) {
        this.virtual_stick_button_.set(key, value);
    }

    setGameControllerAxis(axis, value) {
        this.virtual_stick_axis_[axis] = value;
    }

    clearGameControllerButton() {
        for (const k of this.virtual_stick_button_.keys()) {
            this.virtual_stick_button_.set(k, 0);
        }
    }

    clearGameControllerAxis() {
        this.virtual_stick_axis_.fill(0);
    }

    checkGameControllers() {}

    setTouchPinchScale(s) {
        this.touch_pinch_scale_ = s;
    }

    consumeTouchPinchScale() {
        const s = this.touch_pinch_scale_;
        this.touch_pinch_scale_ = 1;
        return s;
    }

    setTouchCameraPan(x, y) {
        this.touch_camera_pan_ = { x, y };
    }

    consumeTouchCameraPan() {
        const p = this.touch_camera_pan_;
        this.touch_camera_pan_ = { x: 0, y: 0 };
        return p;
    }
}

const ENGINE_START = performance.now();

export const Engine = new EngineImpl();
Engine.getInstance = () => Engine;
export const getTicks = () => performance.now() - ENGINE_START;
