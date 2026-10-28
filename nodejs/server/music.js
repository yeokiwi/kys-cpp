// Music for the browser. The C++ version plays music/<n>.mid through SDL_mixer's
// FluidSynth decoder with music/mid.sf2, or music/<n>.mp3. Browsers cannot play
// MIDI, so MIDI files are rendered once with the FluidSynth command line tool
// (same synthesizer, same sound font) and cached.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const pending = new Map();

function run(cmd, args) {
    return new Promise((resolve) => {
        let child;
        try {
            child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        } catch {
            resolve(false);
            return;
        }
        let err = '';
        child.stderr.on('data', (d) => {
            err += d;
        });
        child.on('error', () => resolve(false));
        child.on('close', (code) => {
            if (code !== 0 && err) {
                console.log(`${cmd}: ${err.trim().split('\n').slice(-3).join(' | ')}`);
            }
            resolve(code === 0);
        });
    });
}

export class MusicStore {
    constructor(gameDir, cacheDir) {
        this.musicDir = path.join(gameDir, 'music');
        this.cacheDir = path.join(cacheDir, 'music');
        // the game's sound font, else SOUND_FONT, else the system's General MIDI font
        this.soundFonts = [path.join(this.musicDir, 'mid.sf2'), process.env.SOUND_FONT,
            '/usr/share/sounds/sf2/default-GM.sf2', '/usr/share/sounds/sf2/FluidR3_GM.sf2'].filter(Boolean);
    }

    soundFont() {
        return this.soundFonts.find((f) => fs.existsSync(f)) || null;
    }

    // Returns [file, mime] or null.
    async get(num) {
        const mid = path.join(this.musicDir, `${num}.mid`);
        if (fs.existsSync(mid)) {
            const rendered = await this.render(num, mid);
            if (rendered) {
                return rendered;
            }
        }
        const mp3 = path.join(this.musicDir, `${num}.mp3`);
        if (fs.existsSync(mp3)) {
            return [mp3, 'audio/mpeg'];
        }
        return null;
    }

    async render(num, mid) {
        const ogg = path.join(this.cacheDir, `${num}.ogg`);
        const wav = path.join(this.cacheDir, `${num}.wav`);
        const midTime = fs.statSync(mid).mtimeMs;
        for (const [file, mime] of [[ogg, 'audio/ogg'], [wav, 'audio/wav']]) {
            try {
                if (fs.statSync(file).mtimeMs >= midTime) {
                    return [file, mime];
                }
            } catch {
                // not cached yet
            }
        }
        const sf = this.soundFont();
        if (!sf) {
            console.log(`No sound font found (music/mid.sf2 or SOUND_FONT), cannot render ${mid}`);
            return null;
        }
        if (!pending.has(mid)) {
            pending.set(mid, (async () => {
                fs.mkdirSync(this.cacheDir, { recursive: true });
                const tmp = ogg + '.tmp.ogg';
                if (await run('fluidsynth', ['-ni', '-q', '-g', '1.0', '-r', '44100', '-T', 'oga', '-F', tmp, sf, mid])
                    && fs.existsSync(tmp) && fs.statSync(tmp).size > 0) {
                    fs.renameSync(tmp, ogg);
                    return [ogg, 'audio/ogg'];
                }
                fs.rmSync(tmp, { force: true });
                const tmpWav = wav + '.tmp.wav';
                if (await run('fluidsynth', ['-ni', '-q', '-g', '1.0', '-r', '22050', '-T', 'wav', '-F', tmpWav, sf, mid])
                    && fs.existsSync(tmpWav) && fs.statSync(tmpWav).size > 0) {
                    fs.renameSync(tmpWav, wav);
                    return [wav, 'audio/wav'];
                }
                fs.rmSync(tmpWav, { force: true });
                console.log(`Cannot render ${mid}; install fluidsynth or provide music/${num}.mp3`);
                return null;
            })().finally(() => pending.delete(mid)));
        }
        return pending.get(mid);
    }
}
