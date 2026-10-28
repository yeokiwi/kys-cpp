// Application: reads the configuration, initializes the engine and the game
// data, then runs the title scene (Application.cpp).
import { Audio } from './Audio.js';
import { DayNightSystem } from './DayNightSystem.js';
import { Engine } from './Engine.js';
import { Event } from './Event.js';
import { Font } from './Font.js';
import { GameUtil } from './GameUtil.js';
import { MainScene } from './MainScene.js';
import { RunNode } from './RunNode.js';
import { Save } from './Save.js';
import { Scene } from './Scene.js';
import { TextureManager } from './TextureManager.js';
import { TitleScene } from './TitleScene.js';
import { Item, Role } from './Types.js';
import { UIKeyConfig } from './UIConfig.js';
import { UISystem } from './UISave.js';
import { VirtualStick } from './VirtualStick.js';

const UI_WIDTH = 1280;
const UI_HEIGHT = 720;

export class Application {
    constructor(canvas) {
        this.canvas = canvas;
    }

    async load() {
        await GameUtil.load();
        const game = GameUtil;
        Engine.setUISize(UI_WIDTH, UI_HEIGHT);
        Engine.init(this.canvas, { texture_top_left_highlight: game.getInt('game', 'texture_top_left_highlight', 1) });
        Engine.setWindowTitle(game.getString('game', 'title', '金庸群侠传 kys-cpp'));
        const render_width = Math.max(1, game.getInt('game', 'render_width', UI_WIDTH));
        const render_height = Math.max(1, game.getInt('game', 'render_height', UI_HEIGHT));
        Engine.createAssistTexture('scene', render_width, render_height);
        Engine.resizeRenderTexturesToWindow();
        this.config();
        await Promise.all([
            Font.init(),
            Role.setLevelUpList(),
            TextureManager.ensureGroups(['title', 'head', 'item', 'mmap', 'smap', 'cloud', 'mmap-earth', 'smap-earth', 'battle-earth']),
        ]);
        await Promise.all([Event.init(), MainScene.init()]);
        // the title screen images are used right away
        await TextureManager.preload('title', [3, 4, 6, 23, 24, 26, 153, 154]);
        RunNode.setQuitHandler(() => UISystem.askExit(1));
        RunNode.setVirtualStick(new VirtualStick());
    }

    config() {
        const game = GameUtil;
        Audio.setVolume(game.getInt('music', 'volume', 50));
        Audio.setVolumeWav(game.getInt('music', 'volumewav', 50));
        Event.getInstance().setUseScript(game.getInt('game', 'use_script', 1));
        Font.setStatMessage(game.getInt('game', 'stat_font', 0));
        Font.setSimplified(game.getInt('game', 'simplified_chinese', 1));
        TextureManager.setLoadFromPath(game.getInt('game', 'png_from_path', 0));
        TextureManager.setLoadAll(game.getInt('game', 'load_all_png', 0));
        UIKeyConfig.readFromString(game.getString('game', 'key', ''));
        Scene.setKeyWalkDealy(game.getInt('game', 'walk_speed', 20));
        // touch screens get the virtual gamepad by default
        const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        RunNode.setUseVirtualStick(game.getInt('game', 'use_virtual_stick', touch ? 1 : 0));
        Scene.setTileScale(game.getInt('game', 'tile_scale', 1));
        RunNode.setRenderMessage(game.getInt('game', 'render_message', 0));
        Save.setZipSave(game.getInt('game', 'zip_save', 1));
        Engine.rumble_enabled_ = game.getInt('game', 'controller_rumble', 1) !== 0;
        Role.setMaxValue();
        Item.setSpecialItems();
    }

    async run() {
        RunNode.addIntoDrawTop(DayNightSystem.getInstance());
        const s = new TitleScene();
        await s.run();
        return 0;
    }
}
