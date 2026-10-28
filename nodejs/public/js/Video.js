// Video: the C++ version can play the opening movie with the optional smallpot
// library on Windows. Browsers play MP4 natively; a click or any key skips it.
import { exists, fileUrl } from './Files.js';

export async function playVideo(rel) {
    if (!(await exists(rel))) {
        return 0;
    }
    return new Promise((resolve) => {
        const v = document.createElement('video');
        v.src = fileUrl(rel);
        v.autoplay = true;
        v.playsInline = true;
        v.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;background:#000;object-fit:contain;z-index:10;';
        let done = false;
        const swallowUp = (e) => {
            e.stopPropagation();
            window.removeEventListener('keyup', swallowUp, true);
        };
        const finish = (e) => {
            if (done) {
                return;
            }
            done = true;
            if (e && e.type === 'keydown') {
                e.stopPropagation();
                e.preventDefault();
                window.addEventListener('keyup', swallowUp, true);
            }
            window.removeEventListener('keydown', finish, true);
            v.pause();
            v.remove();
            resolve(0);
        };
        v.addEventListener('ended', finish);
        v.addEventListener('error', finish);
        v.addEventListener('pointerdown', finish);
        window.addEventListener('keydown', finish, true);
        document.body.appendChild(v);
        v.play().catch(finish);
    });
}
