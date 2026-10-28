// Console: secret codes typed with the Tab key (Console.cpp)
import { C, RI } from './Color.js';
import { DrawableOnCall } from './DrawNode.js';
import { Event } from './Event.js';
import { Font } from './Font.js';
import { InputBox, SuperMenuText } from './InputBox.js';
import { MainScene } from './MainScene.js';
import { RunNode } from './RunNode.js';
import { Save } from './Save.js';
import { SubScene } from './SubScene.js';
import { TextBox } from './TextBox.js';
import { TextureManager } from './TextureManager.js';
import { Engine } from './Engine.js';
import { format } from './util.js';

export class Console {
    async run() {
        let code;
        {
            const input = new InputBox('神秘代碼：', 30);
            input.setInputPosition(350, 300);
            await input.run();
            if (input.getResult() >= 0) {
                code = input.getText();
            } else {
                return;
            }
        }
        const splits = code.split(' ').filter((s) => s !== '');
        if (!splits.length) {
            splits.push('');
        }
        if (code === 'menutest') {
            const generated = [];
            for (let i = 0; i < 450; i++) {
                generated.push([i, 'a' + i]);
            }
            const smt = new SuperMenuText('少廢話', 28, generated, 10);
            smt.setInputPosition(180, 80);
            await smt.run();
            console.log('result', smt.getResult());
        } else if (!RunNode.getPointerFromRoot(SubScene) && (code === 'chuansong' || code === 'teleport' || code === 'mache' || code === '')) {
            const locs = [];
            for (const info of Save.getSubMapInfos()) {
                if (info.MainEntranceX1 !== 0 && info.MainEntranceY1 !== 0) {
                    locs.push([info.ID, info.Name + info.ID]);
                }
            }
            const dx = 180;
            const dy = 80;
            const drawScene = (d) => {
                if (d.getID() === -1) {
                    return;
                }
                const scene = Save.getSubMapInfos()[d.getID()];
                const nx = dx + 350;
                const ny = dy + 100;
                const fs = 28;
                TextureManager.renderTextureByName('title', 126, nx, ny, RI(C(192, 192, 192, 255), 255), 400, 400);
                Font.draw(format('{}，{}', scene.Name, scene.ID), fs, nx + 20, ny + 20, C(0, 0, 0, 255));
                Font.draw(format('（{}，{}）', scene.MainEntranceX1, scene.MainEntranceY1), fs, nx + 20, ny + 20 + Math.trunc(fs * 1.5), C(0, 0, 0, 255));
                const man_x = scene.MainEntranceX1;
                const man_y = scene.MainEntranceY1;
                const ms = MainScene.getInstance();
                if (man_x === 0 && man_y === 0) {
                    return;
                }
                const list = [];
                const hw = 2;
                for (let sum = -hw; sum <= hw + 10; sum++) {
                    for (let i = -hw; i <= hw; i++) {
                        const ix = man_x + i + Math.trunc(sum / 2);
                        const iy = man_y - i + (sum - Math.trunc(sum / 2));
                        if (ms.isOutLine(ix, iy)) {
                            continue;
                        }
                        const p = ms.getPositionOnRender(ix, iy, man_x, man_y);
                        p.x += nx - 160;
                        p.y += ny;
                        const tex = ms.building_layer_.data(ix, iy).getTexture();
                        if (tex) {
                            const c = ((ix + iy) - Math.trunc((tex.w + 35) / 36) - Math.trunc((tex.dy - tex.h + 1) / 9)) * 1024 + ix;
                            list.push({ index: 2 * c + 1, t: tex, p });
                        }
                    }
                }
                list.sort((a, b) => a.index - b.index);
                for (const d1 of list) {
                    TextureManager.renderTexture(d1.t, d1.p.x, d1.p.y);
                }
            };
            const doc = new DrawableOnCall(drawScene);
            const smt = new SuperMenuText('可輸入傳送地名，編號或拼音搜索：', 28, locs, 15);
            smt.setInputPosition(dx, dy);
            smt.addDrawableOnCall(doc);
            await smt.run();
            const id = smt.getResult();
            if (id !== -1) {
                const scene = Save.getSubMapInfos()[id];
                MainScene.getInstance().forceEnterSubScene(id, scene.EntranceX, scene.EntranceY);
                MainScene.getInstance().setManPosition(scene.MainEntranceX1, scene.MainEntranceY1);
            }
        } else if (splits.length > 1 && (splits[0] === 'host' || splits[0] === 'client')) {
            const t = new TextBox();
            t.setText('網頁版不支援聯機對戰');
            t.setFontSize(24);
            await t.runAtPosition(Math.trunc(Engine.getUIWidth() / 2) - 120, 300);
        } else if (splits.length > 1 && (splits[0] === 'battle' || splits[0] === 'b')) {
            const k = parseInt(splits[1], 10) || 0;
            await Event.getInstance().tryBattle(k, 0);
        }
    }
}
