// Browser entry point: shows the start screen, then runs the Application.
import { Application } from './Application.js';
import { Audio } from './Audio.js';

const start = document.getElementById('start');
const msg = start.querySelector('.msg');
const hint = start.querySelector('.hint');

function fail(e) {
    console.error(e);
    start.classList.add('error');
    start.style.display = 'flex';
    msg.textContent = `錯誤 Error: ${e && e.message ? e.message : e}`;
}

window.addEventListener('unhandledrejection', (e) => console.error('Unhandled rejection:', e.reason));

async function boot() {
    let info = { gameDirFound: false };
    try {
        info = await (await fetch('/api/info')).json();
    } catch {
        // the server is not reachable
    }
    if (!info.gameDirFound) {
        fail(new Error('Game resources were not found on the server.\nMount a kys-cpp game directory (with resource/, save/, config/ ...) at GAME_DIR.'));
        return;
    }
    const app = new Application(document.getElementById('game'));
    await app.load();
    msg.textContent = '點擊開始 Click to start';
    hint.textContent = '方向鍵/WASD 移動，Enter/空格 確認，Esc/右鍵 選單，Tab 秘密代碼 — Arrows/WASD move, Enter/Space confirm, Esc/right click menu';
    await new Promise((resolve) => {
        const go = () => {
            start.removeEventListener('pointerup', go);
            window.removeEventListener('keyup', go);
            resolve();
        };
        start.addEventListener('pointerup', go);
        window.addEventListener('keyup', go);
    });
    Audio.unlock();
    start.style.display = 'none';
    document.getElementById('game').focus();
    await app.run();
}

boot().catch(fail);
