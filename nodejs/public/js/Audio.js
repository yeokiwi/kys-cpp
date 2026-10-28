// Audio: music, attack/effect sounds and voices with WebAudio (Audio.cpp used
// SDL_mixer). MIDI music is rendered to audio by the server.
import { fileUrl } from './Files.js';
import { format } from './util.js';

class AudioImpl {
    constructor() {
        this.ctx_ = null;
        this.volume_ = 20;
        this.volume_wav_ = 50;
        this.current_music_index_ = -1;
        this.music_positions_ = new Map();
        this.buffers_ = new Map();
        this.music_ = null;    // { num, source, gain, startTime, offset, duration }
        this.voice_ = null;
        this.paused_ = false;
        this.wanted_music_ = -1;
    }

    context() {
        if (!this.ctx_) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) {
                return null;
            }
            this.ctx_ = new AC();
            this.master_ = this.ctx_.createGain();
            this.master_.connect(this.ctx_.destination);
        }
        return this.ctx_;
    }

    // browsers only allow audio after a user gesture
    unlock() {
        const ctx = this.context();
        if (ctx && ctx.state === 'suspended' && !this.paused_) {
            ctx.resume().catch(() => {});
        }
    }

    init() {}

    load(key, url) {
        let p = this.buffers_.get(key);
        if (!p) {
            const ctx = this.context();
            p = fetch(url)
                .then((r) => (r.ok ? r.arrayBuffer() : null))
                .then((b) => (b && ctx ? ctx.decodeAudioData(b) : null))
                .catch(() => null);
            this.buffers_.set(key, p);
        }
        return p;
    }

    saveCurrentMusicPosition() {
        const m = this.music_;
        if (!m || this.current_music_index_ < 0 || !this.ctx_) {
            return;
        }
        let pos = m.offset + (this.ctx_.currentTime - m.startTime);
        if (m.duration > 0) {
            pos %= m.duration;
        }
        if (pos >= 0) {
            this.music_positions_.set(this.current_music_index_, pos);
        }
    }

    playMusic(num) {
        if (num < 0 || num >= 100) {
            return;
        }
        this.saveCurrentMusicPosition();
        this.stopMusic();
        this.current_music_index_ = num;
        this.wanted_music_ = num;
        const ctx = this.context();
        if (!ctx) {
            return;
        }
        this.load(`music${num}`, `/api/music/${num}`).then((buffer) => {
            if (!buffer || this.wanted_music_ !== num) {
                return;
            }
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(this.volume_ / 100, ctx.currentTime + 0.05);
            source.connect(gain).connect(this.master_);
            const offset = this.music_positions_.get(num) || 0;
            source.start(0, offset % buffer.duration);
            this.music_ = { num, source, gain, startTime: ctx.currentTime, offset, duration: buffer.duration };
        });
    }

    stopMusic() {
        this.saveCurrentMusicPosition();
        this.wanted_music_ = -1;
        const m = this.music_;
        this.music_ = null;
        if (m && this.ctx_) {
            const t = this.ctx_.currentTime;
            m.gain.gain.cancelScheduledValues(t);
            m.gain.gain.setValueAtTime(m.gain.gain.value, t);
            m.gain.gain.linearRampToValueAtTime(0, t + 1);
            m.source.stop(t + 1.05);
        }
    }

    pauseMusic() {
        this.paused_ = true;
        this.ctx_?.suspend().catch(() => {});
    }

    resumeMusic() {
        this.paused_ = false;
        this.ctx_?.resume().catch(() => {});
    }

    setVolume(v) {
        this.volume_ = v;
        if (this.music_ && this.ctx_) {
            this.music_.gain.gain.setValueAtTime(v / 100, this.ctx_.currentTime);
        }
    }

    setVolumeWav(v) {
        this.volume_wav_ = v;
    }

    getCurrentMusic() {
        return this.current_music_index_;
    }

    playBuffer(key, url, volume, isVoice = false) {
        const ctx = this.context();
        if (!ctx) {
            return;
        }
        this.load(key, url).then((buffer) => {
            if (!buffer) {
                return;
            }
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            const gain = ctx.createGain();
            // the C++ version sets the track gain from the global wav volume
            gain.gain.value = this.volume_wav_ / 100;
            source.connect(gain).connect(this.master_);
            source.start();
            if (isVoice) {
                this.voice_ = source;
            }
        });
    }

    playASound(num, volume = -1) {
        if (num < 0 || num >= 100) {
            return;
        }
        this.playBuffer(`atk${num}`, fileUrl(format('sound/atk{:02}.wav', num)), volume);
    }

    playESound(num, volume = -1) {
        if (num < 0 || num >= 100) {
            return;
        }
        this.playBuffer(`e${num}`, fileUrl(format('sound/e{:02}.wav', num)), volume);
    }

    stopWav() {
        if (this.voice_) {
            try {
                this.voice_.stop();
            } catch {
                // already stopped
            }
            this.voice_ = null;
        }
    }

    playVoice(voiceId, volume = -1) {
        this.stopWav();
        const key = `voice${voiceId}`;
        if (!this.buffers_.has(key)) {
            const ctx = this.context();
            if (!ctx) {
                return;
            }
            const tryUrl = (u) => fetch(u, { method: 'HEAD' }).then((r) => (r.ok ? u : null)).catch(() => null);
            this.buffers_.set(key, tryUrl(fileUrl(`voice/${voiceId}.mp3`))
                .then((u) => u || tryUrl(fileUrl(`voice/${voiceId}.wav`)))
                .then((u) => (u ? fetch(u).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)) : null))
                .catch(() => null));
        }
        this.playBuffer(key, '', volume, true);
    }
}

export const Audio = new AudioImpl();
Audio.getInstance = () => Audio;
