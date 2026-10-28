// GameUtil: the game configuration (config/kysmod.ini) plus a few helpers.
import { INIReader } from './INIReader.js';
import { clamp, sign } from './util.js';

class GameUtilImpl extends INIReader {
    constructor() {
        super();
        this.save_timer_ = null;
    }

    async load() {
        try {
            const r = await fetch('/api/config', { cache: 'no-store' });
            this.loadString(r.ok ? await r.text() : '');
        } catch {
            this.loadString('');
        }
    }

    // GameUtil::saveConfig; writes are coalesced
    saveConfig() {
        if (this.save_timer_) {
            clearTimeout(this.save_timer_);
        }
        this.save_timer_ = setTimeout(() => {
            this.save_timer_ = null;
            fetch('/api/config', { method: 'PUT', body: this.toString(), headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
                .catch(() => {});
        }, 200);
    }

    static VERSION() {
        return '';
    }

    static PATH() {
        return '/game/';
    }

    static sign(v) {
        return sign(v);
    }

    static clamp(v, a, b) {
        return clamp(v, a, b);
    }

    static digit(x) {
        const n = Math.floor(Math.log10(0.5 + Math.abs(x)));
        return x >= 0 ? n : n + 1;
    }
}

export const GameUtil = new GameUtilImpl();
GameUtil.getInstance = () => GameUtil;
GameUtil.VERSION = () => '';
GameUtil.PATH = () => '/game/';
GameUtil.clamp = clamp;
GameUtil.sign = sign;
GameUtil.digit = GameUtilImpl.digit;
