// TitleScene: the start screen (TitleScene.cpp)
import { Audio } from './Audio.js';
import { C } from './Color.js';
import { Engine } from './Engine.js';
import { Font } from './Font.js';
import { GameUtil } from './GameUtil.js';
import { InputBox } from './InputBox.js';
import { MainScene } from './MainScene.js';
import { ParticleExample, Vec2 } from './ParticleSystem.js';
import { RandomRole } from './RandomRole.js';
import { Save } from './Save.js';
import { Scene } from './Scene.js';
import { Button, Menu } from './TextBox.js';
import { TextureManager } from './TextureManager.js';
import { UISave } from './UISave.js';
import { playVideo } from './Video.js';

export class TitleScene extends Scene {
    constructor() {
        super();
        this.full_window_ = 1;
        this.battle_mode_ = GameUtil.getInt('game', 'battle_mode');
        this.menu_ = new Menu();
        this.menu_.setPosition(560, 550);
        this.menu_.addChild(new Button(), -180, 0).setTexture('title', 3, 23, 23);
        this.menu_.addChild(new Button(), 20, 0).setTexture('title', 4, 24, 24);
        this.menu_.addChild(new Button(), 220, 0).setTexture('title', 6, 26, 26);
        this.menu_load_ = new UISave();
        this.menu_load_.setPosition(500, 300);
        if (this.battle_mode_ === 2) {
            const pe1 = new ParticleExample();
            pe1.setStyle(ParticleExample.FIRE);
            this.addChild(pe1);
            pe1.setPosition(490, 80);
            pe1.setSize(20, 20);
        } else if (this.battle_mode_ === 3) {
            const pe1 = new ParticleExample();
            pe1.setPosition(Math.trunc(Engine.getWindowWidth() * 0.15), 0);
            pe1.setStyle(ParticleExample.RAIN);
            pe1.setTotalParticles(2000);
            pe1.setPosVar(new Vec2(Engine.getWindowWidth() * 0.85, -50));
            pe1.resetSystem();
            pe1.setEmissionRate(200);
            pe1.setGravity(new Vec2(200, 50));
            this.addChild(pe1);
        }
    }

    static getTitleTextureID(battle_mode) {
        return battle_mode === 2 ? 153 : 154;
    }

    static getTitleTextureY(texture_id) {
        const t = TextureManager.getTexture('title', texture_id);
        if (!t) {
            return 0;
        }
        t.load();
        return Math.trunc((Engine.getUIHeight() - t.h) / 2);
    }

    draw() {
        Engine.fillColor(C(0, 0, 0, 255), 0, 0, Engine.getWindowWidth(), Engine.getWindowHeight());
        const id = TitleScene.getTitleTextureID(this.battle_mode_);
        TextureManager.renderTextureByName('title', id, 0, TitleScene.getTitleTextureY(id));
        Font.draw(GameUtil.VERSION(), 28, 0, 0);
    }

    async dealEvent(e) {
        const r = await this.menu_.run();
        if (r === 0) {
            Engine.gameControllerRumble(50, 50, 500);
            await Save.load(0);
            let name = '';
            const input = new InputBox('請輸入姓名：', 30);
            input.setInputPosition(350, 300);
            input.setActionButtons(true);
            input.setText(Save.getRole(0) ? Save.getRole(0).Name : '');
            await input.run();
            if (input.getResult() >= 0) {
                name = input.getText();
            }
            if (name) {
                const random_role = new RandomRole();
                random_role.setRole(Save.getRole(0));
                random_role.setRoleName(name);
                if ((await random_role.runAtPosition(300, 0)) === 0) {
                    const ms = MainScene.getInstance();
                    ms.setManPosition(Save.MainMapX, Save.MainMapY);
                    ms.setTowards(1);
                    const s = GameUtil.getInt('constant', 'begin_scene', 70);
                    const x = GameUtil.getInt('constant', 'begin_sx', 19);
                    const y = GameUtil.getInt('constant', 'begin_sy', 20);
                    ms.forceEnterSubScene(s, x, y, GameUtil.getInt('constant', 'begin_event', -1));
                    await ms.run();
                }
            }
        }
        if (r === 1) {
            if ((await this.menu_load_.run()) >= 0) {
                await MainScene.getInstance().run();
            }
        }
        if (r === 2) {
            this.setExit(true);
            window.location.reload();
            await new Promise(() => {});
        }
    }

    async onEntrance() {
        await playVideo('movie/1.mp4');
        Audio.playMusic(16);
    }
}
