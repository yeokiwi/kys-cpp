// Event: the story instructions (Event.cpp). Events run Cifa scripts from
// script/event-cifa/<id>.cifa (or .c), or the original kdef bytecode when
// use_script is 0.
import { Audio } from './Audio.js';
import { C } from './Color.js';
import { csprintf } from './csprintf.js';
import { DrawNode } from './DrawNode.js';
import { Engine } from './Engine.js';
import { readBinary, readText } from './Files.js';
import { GameUtil } from './GameUtil.js';
import { MainScene } from './MainScene.js';
import { RunNode } from './RunNode.js';
import { Save } from './Save.js';
import { SubScene } from './SubScene.js';
import { Talk } from './Talk.js';
import { MenuText, TextBox } from './TextBox.js';
import { TextureManager } from './TextureManager.js';
import {
    ITEM_IN_BAG_COUNT, ROLE_TAKING_ITEM_COUNT, Role, SUBMAP_COORD_COUNT, TEAMMATE_COUNT, getStructInt, setStructInt,
} from './Types.js';
import { K_DOWN, K_LEFT, K_RIGHT, K_UP } from './Keys.js';
import { RandomDouble, clamp, findNumbers, format, sign, splitLines, textDrawSize } from './util.js';

// argument count and kind of every kdef instruction (Event.h, EventMacro.h)
// [name, nargs, returnsBool]
const INSTRUCTS = {
    '-1': ['forceExit', 0, false],
    0: ['blank', 0, false],
    1: ['oldTalk', 3, false],
    2: ['addItem', 2, false],
    3: ['modifyEvent', 13, false],
    4: ['isUsingItem', 1, true],
    5: ['askBattle', 0, true],
    7: ['forceExit', 0, false],
    8: ['changeMainMapMusic', 1, false],
    9: ['askJoin', 0, true],
    10: ['join', 1, false],
    11: ['askRest', 0, true],
    12: ['rest', 0, false],
    13: ['lightScene', 0, false],
    14: ['darkScene', 0, false],
    15: ['dead', 0, false],
    16: ['inTeam', 1, true],
    17: ['setSubMapLayerData', 5, false],
    18: ['haveItemBool', 1, true],
    19: ['oldSetScenePosition', 2, false],
    20: ['teamIsFull', 0, true],
    21: ['leaveTeam', 1, false],
    22: ['zeroAllMP', 0, false],
    23: ['setRoleUsePoison', 2, false],
    24: ['dead', 0, false],
    25: ['subMapViewFromTo', 4, false],
    26: ['add3EventNum', 5, false],
    27: ['playAnimation', 3, false],
    28: ['checkRoleMorality', 3, true],
    29: ['checkRoleAttack', 3, true],
    30: ['walkFromTo', 4, false],
    31: ['checkEnoughMoney', 1, true],
    32: ['addItemWithoutHint', 2, false],
    33: ['oldLearnMagic', 3, false],
    34: ['addIQ', 2, false],
    35: ['setRoleMagic', 4, false],
    36: ['checkRoleSexual', 1, true],
    37: ['addMorality', 1, false],
    38: ['changeSubMapPic', 4, false],
    39: ['openSubMap', 1, false],
    40: ['setTowards', 1, false],
    41: ['roleAddItem', 3, false],
    42: ['checkFemaleInTeam', 0, true],
    43: ['haveItemBool', 1, true],
    44: ['play2Amination', 6, false],
    45: ['addSpeed', 2, false],
    46: ['addMaxMP', 2, false],
    47: ['addAttack', 2, false],
    48: ['addMaxHP', 2, false],
    49: ['setMPType', 2, false],
    50: ['checkHave5Item', 5, true],
    51: ['askSoftStar', 0, false],
    52: ['showMorality', 0, false],
    53: ['showFame', 0, false],
    54: ['openAllSubMap', 0, false],
    55: ['checkEventID', 2, true],
    56: ['addFame', 1, false],
    57: ['breakStoneGate', 0, false],
    58: ['fightForTop', 0, false],
    59: ['allLeave', 0, false],
    60: ['checkSubMapPic', 3, true],
    61: ['check14BooksPlaced', 0, true],
    62: ['backHome', 6, false],
    63: ['setSexual', 2, false],
    64: ['shop', 0, false],
    66: ['playMusic', 1, false],
    67: ['playWave', 1, false],
};
export { INSTRUCTS };

let instance = null;

export class Event {
    constructor() {
        this.talk_contents_ = [];
        this.kdef_ = [];
        this.talk_to_num_ = new Map();
        this.leave_event_0_ = 0;
        this.leave_event_id_ = [];
        this.talk_box_ = new RunNode();
        this.talk_box_up_ = new Talk();
        this.talk_box_down_ = new Talk();
        this.talk_box_.addChild(this.talk_box_up_);
        this.talk_box_.addChild(this.talk_box_down_, 0, 400);
        this.menu2_ = new MenuText();
        this.menu2_.setStrings(['確認', '取消']);
        this.menu2_.setPosition(400, 300);
        this.menu2_.setFontSize(24);
        this.menu2_.setHaveBox(true);
        this.menu2_.arrange(0, 50, 150, 0);
        this.text_box_ = new TextBox();
        this.text_box_.setTextPosition(-20, 100);
        this.event_node_ = new DrawNode();
        this.subscene_ = null;
        this.submap_id_ = -1;
        this.x_ = -1;
        this.y_ = -1;
        this.event_index_ = -1;
        this.item_id_ = -1;
        this.exit_ = false;
        this.use_script_ = 1;
        this.rand_ = new RandomDouble();
        this.x50 = new Int32Array(0x10000);
        this.x50b = new Uint8Array(this.x50.buffer);
        this.layoutEventUI();
    }

    static getInstance() {
        if (!instance) {
            instance = new Event();
        }
        return instance;
    }

    static async init() {
        const e = Event.getInstance();
        await e.loadEventData();
        return e;
    }

    layoutEventUI() {
        const w = Engine.getUIWidth();
        const h = Engine.getUIHeight();
        this.menu2_.setPosition(Math.trunc(w / 2) - 75, Math.trunc(h / 2) - 50);
        this.talk_box_up_.setPosition(0, 0);
        this.talk_box_down_.setPosition(0, Math.max(0, h - 320));
    }

    async showTextNotice(text) {
        const font_size = 20;
        this.layoutEventUI();
        const w = Engine.getUIWidth();
        const h = Engine.getUIHeight();
        const text_width = Math.trunc((font_size * textDrawSize(text)) / 2);
        this.text_box_.setTexture('', -1);
        this.text_box_.setPosition(Math.trunc(w / 2 - text_width / 2), Math.trunc(h / 2 - font_size / 2));
        this.text_box_.setTextPosition(0, 0);
        this.text_box_.setText(text);
        await this.text_box_.run();
    }

    async loadEventData() {
        const talk = await readText('resource/talkutf8.txt');
        this.talk_contents_ = [];
        this.talk_to_num_.clear();
        if (talk) {
            splitLines(talk).forEach((line, i) => {
                this.talk_contents_.push(line);
                this.talk_to_num_.set(line, i);
            });
        }
        const [idx, grp] = await Promise.all([readBinary('resource/kdef.idx'), readBinary('resource/kdef.grp')]);
        this.kdef_ = [];
        if (idx && grp) {
            const offsets = new Int32Array(idx.slice(0, idx.byteLength & ~3));
            const dv = new DataView(grp);
            let prev = 0;
            for (const end of offsets) {
                const e = [];
                for (let p = prev; p + 1 < end && p + 1 < grp.byteLength; p += 2) {
                    e.push(dv.getInt16(p, true));
                }
                this.kdef_.push(e);
                prev = end;
            }
        }
        const leave = findNumbers(await readText('list/leave.txt'));
        if (leave.length) {
            this.leave_event_0_ = leave[0];
            this.leave_event_id_ = leave.slice(1);
        }
        return false;
    }

    setUseScript(u) {
        this.use_script_ = u;
    }

    isExiting() {
        return this.exit_;
    }

    getTalkContent(id) {
        if (id < 0 || id >= this.talk_contents_.length) {
            return '';
        }
        return this.talk_contents_[id];
    }

    // returns whether the event has been executed
    async callEvent(event_id, subscene = null, submap_id = -1, item_id = -1, event_index = -1, x = -1, y = -1) {
        let ret = true;
        if (this.use_script_ === 0 && (event_id <= 0 || event_id >= this.kdef_.length)) {
            return false;
        }
        this.subscene_ = subscene instanceof SubScene ? subscene : null;
        this.submap_id_ = this.subscene_ ? this.subscene_.getMapInfo().ID : -1;
        this.item_id_ = item_id;
        this.event_index_ = event_index;
        this.x_ = x;
        this.y_ = y;
        this.talk_box_.setExit(false);
        this.talk_box_.setVisible(true);
        RunNode.addIntoDrawTop(this.event_node_);
        RunNode.addIntoDrawTop(this.talk_box_);
        this.exit_ = false;
        try {
            if (this.use_script_) {
                const { ScriptCifa } = await import('./ScriptCifa.js');
                console.log(`Event ${event_id} (${this.event_index_} of current scene)`);
                ret = (await ScriptCifa.getInstance().runEvent(event_id)) === 0;
            } else {
                ret = await this.runKdef(event_id);
            }
        } finally {
            RunNode.removeFromDraw(this.talk_box_);
            this.clearTalkBox();
            RunNode.removeFromDraw(this.event_node_);
            this.event_node_.clear();
            if (this.subscene_) {
                this.subscene_.forceManPic(-1);
            }
            this.exit_ = false;
        }
        return ret;
    }

    async runKdef(event_id) {
        const e = [...this.kdef_[event_id]];
        for (let k = 0; k < 20; k++) {
            e.push(-1);
        }
        let i = 0;
        while (i < e.length && !this.exit_) {
            const code = e[i];
            if (code === 6) {
                if (await this.tryBattle(e[i + 1], e[i + 4])) {
                    i += e[i + 2];
                } else {
                    i += e[i + 3];
                }
                i += 5;
                continue;
            }
            if (code === 50) {
                if (e[i + 1] > 128) {
                    if (this.checkHave5Item(e[i + 1], e[i + 2], e[i + 3], e[i + 4], e[i + 5])) {
                        i += e[i + 6];
                    } else {
                        i += e[i + 7];
                    }
                    i += 8;
                } else {
                    // instruct 50 sub code 32 rewrites the following instruction
                    const ptr = { base: i + 8, code: e };
                    await this.instruct_50e(e[i + 1], e[i + 2], e[i + 3], e[i + 4], e[i + 5], e[i + 6], e[i + 7], ptr);
                    i += 8;
                }
                continue;
            }
            const ins = INSTRUCTS[code];
            if (!ins) {
                i += 1;
                continue;
            }
            const [name, nargs, isBool] = ins;
            const args = e.slice(i + 1, i + 1 + nargs);
            i += nargs + 1;
            const r = await this[name](...args);
            if (isBool) {
                if (r) {
                    i += e[i];
                } else {
                    i += e[i + 1];
                }
                i += 2;
            }
        }
        return true;
    }

    getSubMapRecordFromID(submap_id) {
        let s = Save.getSubMapInfo(submap_id);
        if (!s && this.subscene_) {
            s = this.subscene_.getMapInfo();
        }
        return s;
    }

    getLeaveEvent(role) {
        const i = this.leave_event_id_.indexOf(role.ID);
        return i >= 0 ? this.leave_event_0_ + 2 * i : -1;
    }

    async callLeaveEvent(role) {
        await this.callEvent(this.getLeaveEvent(role));
    }

    forceExit() {
        this.exit_ = true;
        this.talk_box_up_.setExit(true);
        this.talk_box_down_.setExit(true);
    }

    blank() {}

    async oldTalk(talk_id, head_id, style) {
        if (talk_id < 0 || talk_id >= this.talk_contents_.length) {
            return;
        }
        await this.newTalk(this.talk_contents_[talk_id], head_id, style, -1);
    }

    async newTalk(talk_content, head_id, style, voice) {
        this.layoutEventUI();
        const talk = style % 2 !== 0 ? this.talk_box_down_ : this.talk_box_up_;
        talk.setContent(talk_content);
        talk.setHeadID(head_id);
        if (style === 2 || style === 3) {
            talk.setHeadID(-1);
        }
        if (style === 0 || style === 5) {
            talk.setHeadStyle(0);
        }
        if (style === 4 || style === 1) {
            talk.setHeadStyle(1);
        }
        if (voice >= 0) {
            Audio.playVoice(voice);
        } else if (this.talk_to_num_.has(talk_content)) {
            Audio.playVoice(this.talk_to_num_.get(talk_content));
        }
        await talk.run(false);
    }

    async addItem(item_id, count) {
        await this.addItemWithNotice(item_id, count, '');
    }

    async addItemWithNotice(item_id, count, notice) {
        await this.addItemWithoutHint(item_id, count);
        this.layoutEventUI();
        const font_size = 20;
        const text_gap = 28;
        const item = Save.getItem(item_id);
        const text = format('獲得{}  {}', item ? item.Name : '', count);
        const tex = TextureManager.getTexture('item', item_id);
        const tw = tex ? tex.w : 0;
        const th = tex ? tex.h : 0;
        const text_width = Math.trunc((font_size * textDrawSize(text)) / 2);
        const content_height = th + text_gap + font_size;
        const w = Engine.getUIWidth();
        const h = Engine.getUIHeight();
        this.text_box_.setPosition(Math.trunc(w / 2 - tw / 2), Math.trunc(h / 2 - content_height / 2));
        this.text_box_.setTextPosition(Math.trunc(tw / 2 - text_width / 2), th + text_gap);
        this.text_box_.setText(text);
        this.text_box_.setTexture('item', item_id);
        let notice_box = null;
        if (notice) {
            notice_box = new TextBox();
            notice_box.setText(notice);
            notice_box.setPosition(Math.trunc(w / 2 - (textDrawSize(notice) * font_size) / 4),
                Math.trunc(h / 2 - content_height / 2 - font_size - text_gap));
            this.text_box_.addChild(notice_box);
        }
        await this.text_box_.run();
        if (notice_box) {
            this.text_box_.removeChild(notice_box);
        }
        this.text_box_.setTexture('item', -1);
    }

    modifyEvent(submap_id, event_index, cannotWalk, index, event1, event2, event3, currentPic, endPic, beginPic, picDelay, x, y) {
        if (submap_id < 0) {
            submap_id = this.submap_id_;
        }
        if (submap_id < 0) {
            return;
        }
        if (event_index < 0) {
            event_index = this.event_index_;
        }
        const s = Save.getSubMapInfo(submap_id);
        const e = s ? s.Event(event_index) : null;
        if (!e) {
            return;
        }
        if (cannotWalk >= -1) {
            e.CannotWalk = cannotWalk;
        }
        if (index >= -1) {
            e.Index = index;
        }
        if (event1 >= -1) {
            e.Event1 = event1;
        }
        if (event2 >= -1) {
            e.Event2 = event2;
        }
        if (event3 >= -1) {
            e.Event3 = event3;
        }
        if (currentPic >= -1) {
            e.CurrentPic = currentPic;
        }
        if (endPic >= -1) {
            e.EndPic = endPic;
        }
        if (beginPic >= -1) {
            e.BeginPic = beginPic;
        }
        if (picDelay >= -1) {
            e.PicDelay = picDelay;
        }
        if (x < -1) {
            x = e.X();
        }
        if (y < -1) {
            y = e.Y();
        }
        e.setPosition(x, y, s);
    }

    isUsingItem(item_id) {
        return this.item_id_ === item_id;
    }

    async askBattle() {
        this.layoutEventUI();
        this.menu2_.setText('是否與之過招？');
        return (await this.menu2_.run()) === 0;
    }

    async tryBattle(battle_id, get_exp) {
        let result = 0;
        if (GameUtil.getInt('game', 'battle_debug_win', 0) !== 0) {
            this.clearTalkBox();
            return true;
        }
        const battle_mode = GameUtil.getInt('game', 'battle_mode');
        const expedition33 = GameUtil.getInt('game', 'expedition33', 0) !== 0;
        console.log(`Battle mode: ${battle_mode}`);
        if (battle_mode === 0 || battle_mode === 1) {
            const { BattleScene } = await import('./BattleScene.js');
            const battle = new BattleScene();
            battle.setSemiReal(battle_mode === 1);
            battle.setExpedition33(expedition33);
            battle.setID(battle_id);
            battle.setHaveFailExp(get_exp);
            result = await battle.run();
        } else if (battle_mode === 2) {
            const { BattleSceneHades } = await import('./BattleSceneHades.js');
            const battle = new BattleSceneHades();
            battle.setID(battle_id);
            result = await battle.run();
        } else if (battle_mode === 3) {
            const { BattleSceneSekiro } = await import('./BattleSceneSekiro.js');
            const battle = new BattleSceneSekiro();
            battle.setID(battle_id);
            result = await battle.run();
        }
        this.clearTalkBox();
        return result === 0;
    }

    changeMainMapMusic(music_id) {
        if (this.subscene_) {
            this.subscene_.changeExitMusic(music_id);
        }
    }

    async askJoin() {
        this.layoutEventUI();
        this.menu2_.setText('是否要求加入？');
        return (await this.menu2_.run()) === 0;
    }

    async join(role_id) {
        const team = Save.Team;
        for (let k = 0; k < team.length; k++) {
            if (team[k] < 0) {
                team[k] = role_id;
                const role = Save.getRole(role_id);
                if (role) {
                    for (let i = 0; i < ROLE_TAKING_ITEM_COUNT; i++) {
                        if (role.TakingItem[i] >= 0) {
                            if (role.TakingItemCount[i] === 0) {
                                role.TakingItemCount[i] = 1;
                            }
                            await this.addItem(role.TakingItem[i], role.TakingItemCount[i]);
                            role.TakingItem[i] = -1;
                            role.TakingItemCount[i] = 0;
                        }
                    }
                }
                return;
            }
        }
    }

    async askRest() {
        this.layoutEventUI();
        this.menu2_.setText('請選擇是或否？');
        return (await this.menu2_.run()) === 0;
    }

    rest() {
        for (const r of Save.Team) {
            const role = Save.getRole(r);
            if (role) {
                role.PhysicalPower = Role.getMaxValue().PhysicalPower;
                role.HP = role.MaxHP;
                role.MP = role.MaxMP;
                role.Hurt = 0;
                role.Poison = 0;
            }
        }
    }

    async lightScene() {
        this.clearTalkBox();
        if (this.subscene_) {
            await this.subscene_.lightScene();
        }
    }

    async darkScene() {
        if (this.subscene_) {
            await this.subscene_.darkScene();
        }
    }

    dead() {
        this.menu2_.setText('勝敗乃兵家常事');
        RunNode.exitAll(1);
        this.forceExit();
    }

    inTeam(role_id) {
        return Save.Team.includes(role_id);
    }

    setSubMapLayerData(submap_id, layer, x, y, v) {
        this.getSubMapRecordFromID(submap_id)?.setLayerData(layer, x, y, v);
    }

    haveItemBool(item_id) {
        return Save.getItemCountInBag(item_id) > 0;
    }

    oldSetScenePosition(x, y) {
        if (this.subscene_) {
            this.subscene_.setManViewPosition(x, y);
        }
    }

    teamIsFull() {
        return !Save.Team.some((r) => r < 0);
    }

    leaveTeam(role_id) {
        const team = Save.Team;
        for (let i = 0; i < TEAMMATE_COUNT; i++) {
            if (team[i] === role_id) {
                for (let j = i; j < TEAMMATE_COUNT - 1; j++) {
                    team[j] = team[j + 1];
                }
                team[TEAMMATE_COUNT - 1] = -1;
                break;
            }
        }
    }

    zeroAllMP() {
        for (const r of Save.Team) {
            if (r >= 0 && Save.getRole(r)) {
                Save.getRole(r).MP = 0;
            }
        }
    }

    setRoleUsePoison(role_id, v) {
        const r = Save.getRole(role_id);
        if (r) {
            r.UsePoison = v;
        }
    }

    async subMapViewFromTo(x0, y0, x1, y1) {
        const s = this.subscene_;
        if (!s) {
            return;
        }
        const incx = sign(x1 - x0);
        const incy = sign(y1 - y0);
        if (incx) {
            for (let i = x0; i !== x1; i += incx) {
                s.setViewPosition(i, y0);
                await s.drawAndPresent();
            }
        }
        if (incy) {
            for (let i = y0; i !== y1; i += incy) {
                s.setViewPosition(x1, i);
                await s.drawAndPresent();
            }
        }
        s.setViewPosition(x1, y1);
    }

    add3EventNum(submap_id, event_index, v1, v2, v3) {
        const s = this.getSubMapRecordFromID(submap_id);
        const e = s ? s.Event(event_index) : null;
        if (e) {
            e.Event1 += v1;
            e.Event2 += v2;
            e.Event3 += v3;
        }
    }

    async playAnimation(event_index, begin_pic, end_pic) {
        const s = this.subscene_;
        if (!s) {
            return;
        }
        if (event_index === -1) {
            const inc = sign(end_pic - begin_pic);
            const b = Math.trunc(begin_pic / 2);
            const e2 = Math.trunc(end_pic / 2);
            if (inc) {
                for (let i = b; i !== e2; i += inc) {
                    s.forceManPic(i);
                    await s.drawAndPresent();
                }
            }
            s.forceManPic(e2);
            await s.drawAndPresent();
        } else {
            const e = s.getMapInfo().Event(event_index);
            if (e) {
                const inc = sign(end_pic - begin_pic);
                if (inc) {
                    for (let i = begin_pic; i !== end_pic; i += inc) {
                        e.setPic(i);
                        await s.drawAndPresent();
                    }
                }
                e.setPic(end_pic);
            }
        }
    }

    checkRoleMorality(role_id, low, high) {
        const r = Save.getRole(role_id);
        return !!r && r.Morality >= low && r.Morality <= high;
    }

    checkRoleAttack(role_id, low) {
        const r = Save.getRole(role_id);
        return !!r && r.Attack >= low;
    }

    async walkFromTo(x0, y0, x1, y1) {
        const s = this.subscene_;
        if (!s) {
            return;
        }
        const incx = sign(x1 - x0);
        const incy = sign(y1 - y0);
        if (incx) {
            for (let i = x0; i !== x1; i += incx) {
                s.tryWalk(i, y0);
                s.setTowards(s.calTowards(x0, y0, i, y0));
                await s.drawAndPresent();
            }
        }
        if (incy) {
            for (let i = y0; i !== y1; i += incy) {
                s.tryWalk(x1, i);
                s.setTowards(s.calTowards(x1, y0, x1, i));
                await s.drawAndPresent();
            }
        }
        s.setManViewPosition(x1, y1);
    }

    checkEnoughMoney(money_count) {
        return Save.getMoneyCountInBag() >= money_count;
    }

    addItemWithoutHint(item_id, count) {
        if (item_id < 0 || count === 0) {
            return;
        }
        const items = Save.Items;
        let pos = items.findIndex((it) => it.ItemID === item_id);
        if (pos >= 0) {
            items[pos].Count += count;
        } else {
            pos = items.findIndex((it) => it.ItemID < 0);
            if (pos >= 0) {
                items[pos].ItemID = item_id;
                items[pos].Count = count;
            }
        }
        if (count < 0) {
            this.arrangeBag();
        }
    }

    async oldLearnMagic(role_id, magic_id, no_display) {
        const r = Save.getRole(role_id);
        const m = Save.getMagic(magic_id);
        if (!r) {
            return;
        }
        r.learnMagic(m);
        if (no_display) {
            return;
        }
        await this.showTextNotice(format('{}習得武學{}', r.Name, m ? m.Name : ''));
    }

    async addProperty(role_id, key, maxKey, value, label) {
        const r = Save.getRole(role_id);
        if (!r) {
            return;
        }
        const v0 = r[key];
        r[key] = clamp(v0 + value, 0, Role.getMaxValue()[maxKey]);
        await this.showTextNotice(format(`{}${label}增加{}`, r.Name, r[key] - v0));
        return r;
    }

    async addIQ(role_id, value) {
        await this.addProperty(role_id, 'IQ', 'IQ', value, '資質');
    }

    setRoleMagic(role_id, magic_index_role, magic_id, level) {
        const r = Save.getRole(role_id);
        if (r && magic_index_role >= 0 && magic_index_role < r.MagicID.length) {
            r.MagicID[magic_index_role] = magic_id;
            r.MagicLevel[magic_index_role] = level;
        }
    }

    checkRoleSexual(sexual) {
        if (sexual <= 255) {
            return Save.getRole(0)?.Sexual === sexual;
        }
        return this.x50[0x7000] === 0;
    }

    addMorality(value) {
        const role = Save.getRole(0);
        if (role) {
            role.Morality = clamp(role.Morality + value, 0, Role.getMaxValue().Morality);
        }
    }

    changeSubMapPic(submap_id, layer, old_pic, new_pic) {
        const s = this.getSubMapRecordFromID(submap_id);
        if (s) {
            for (let i1 = 0; i1 < SUBMAP_COORD_COUNT; i1++) {
                for (let i2 = 0; i2 < SUBMAP_COORD_COUNT; i2++) {
                    if (s.LayerData(layer, i1, i2) === old_pic) {
                        s.setLayerData(layer, i1, i2, new_pic);
                    }
                }
            }
        }
    }

    openSubMap(submap_id) {
        const s = Save.getSubMapInfo(submap_id);
        if (s) {
            s.EntranceCondition = 0;
        }
    }

    setTowards(towards) {
        if (this.subscene_) {
            this.subscene_.towards_ = towards;
            this.subscene_.force_man_pic_ = -1;
        }
    }

    roleAddItem(role_id, item_id, count) {
        if (item_id < 0 || count === 0) {
            return;
        }
        const role = Save.getRole(role_id);
        if (!role) {
            return;
        }
        // the C++ code loops over ROLE_MAGIC_COUNT here, beyond the 4 slots
        let pos = role.TakingItem.indexOf(item_id);
        if (pos >= 0) {
            role.TakingItemCount[pos] += count;
        } else {
            pos = role.TakingItem.findIndex((t) => t < 0);
            if (pos >= 0) {
                role.TakingItem[pos] = item_id;
                role.TakingItemCount[pos] = count;
            }
        }
        const item_count = new Map();
        for (let i = 0; i < ROLE_TAKING_ITEM_COUNT; i++) {
            if (role.TakingItem[i] >= 0 && role.TakingItemCount[i] > 0) {
                item_count.set(role.TakingItem[i], (item_count.get(role.TakingItem[i]) || 0) + role.TakingItemCount[i]);
            }
            role.TakingItem[i] = -1;
            role.TakingItemCount[i] = 0;
        }
        let k = 0;
        for (const [id, c] of [...item_count].sort((a, b) => a[0] - b[0])) {
            role.TakingItem[k] = id;
            role.TakingItemCount[k] = c;
            k++;
        }
    }

    checkFemaleInTeam() {
        return Save.Team.some((r) => r >= 0 && Save.getRole(r)?.Sexual === 1);
    }

    async play2Amination(event_index1, begin_pic1, end_pic1, event_index2, begin_pic2) {
        const s = this.subscene_;
        if (!s) {
            return;
        }
        const e1 = s.getMapInfo().Event(event_index1);
        const e2 = s.getMapInfo().Event(event_index2);
        if (e1 && e2) {
            const inc = sign(end_pic1 - begin_pic1);
            if (inc) {
                for (let i = 0; i !== end_pic1 - begin_pic1; i += inc) {
                    e1.setPic(begin_pic1 + i);
                    e2.setPic(begin_pic2 + i);
                    await s.drawAndPresent();
                }
            }
            e1.setPic(end_pic1);
            e2.setPic(begin_pic2 + end_pic1 - begin_pic1);
        }
    }

    async play3Amination(event_index1, begin_pic1, end_pic1, event_index2, begin_pic2, event_index3, begin_pic3) {
        const s = this.subscene_;
        if (!s) {
            return;
        }
        const e1 = s.getMapInfo().Event(event_index1);
        const e2 = s.getMapInfo().Event(event_index2);
        // the C++ version uses event_index2 for the third event as well
        const e3 = s.getMapInfo().Event(event_index2);
        if (e1 && e2 && e3) {
            const inc = sign(end_pic1 - begin_pic1);
            if (inc) {
                for (let i = 0; i !== end_pic1 - begin_pic1; i += inc) {
                    e1.setPic(begin_pic1 + i);
                    e2.setPic(begin_pic2 + i);
                    e3.setPic(begin_pic3 + i);
                    await s.drawAndPresent();
                }
            }
            e1.setPic(end_pic1);
            e2.setPic(begin_pic2 + end_pic1 - begin_pic1);
            e3.setPic(begin_pic3 + end_pic1 - begin_pic1);
        }
    }

    async addSpeed(role_id, value) {
        await this.addProperty(role_id, 'Speed', 'Speed', value, '輕功');
    }

    async addMaxMP(role_id, value) {
        const r = Save.getRole(role_id);
        if (!r) {
            return;
        }
        const v0 = r.MaxMP;
        r.MaxMP = clamp(v0 + value, 0, Role.getMaxValue().MP);
        r.MP = clamp(r.MP + value, 0, r.MaxMP);
        await this.showTextNotice(format('{}內力增加{}', r.Name, r.MaxMP - v0));
    }

    async addAttack(role_id, value) {
        await this.addProperty(role_id, 'Attack', 'Attack', value, '武力');
    }

    async addMaxHP(role_id, value) {
        const r = Save.getRole(role_id);
        if (!r) {
            return;
        }
        const v0 = r.MaxHP;
        r.MaxHP = clamp(v0 + value, 0, Role.getMaxValue().HP);
        r.HP = clamp(r.HP + value, 0, r.MaxHP);
        await this.showTextNotice(format('{}生命增加{}', r.Name, r.MaxHP - v0));
    }

    setMPType(role_id, value) {
        const r = Save.getRole(role_id);
        if (r) {
            r.MPType = value;
        }
    }

    checkHave5Item(a, b, c, d, e) {
        return this.haveItemBool(a) && this.haveItemBool(b) && this.haveItemBool(c) && this.haveItemBool(d) && this.haveItemBool(e);
    }

    async askSoftStar() {
        await this.oldTalk(2547 + this.rand_.rand_int(18), 114, 0);
    }

    async showMorality() {
        await this.showTextNotice(format('你的道德指數為{}', Save.getRole(0)?.Morality ?? 0));
    }

    async showFame() {
        await this.showTextNotice(format('你的聲望指數為{}', Save.getRole(0)?.Fame ?? 0));
    }

    openAllSubMap() {
        for (const s of Save.getSubMapInfos()) {
            s.EntranceCondition = 0;
        }
        const set = (i, v) => {
            const s = Save.getSubMapInfo(i);
            if (s) {
                s.EntranceCondition = v;
            }
        };
        set(2, 2);
        set(38, 2);
        set(75, 1);
        set(80, 1);
    }

    checkEventID(event_index, value) {
        return this.subscene_?.getMapInfo().Event(event_index)?.Event1 === value;
    }

    addFame(value) {
        const r = Save.getRole(0);
        if (!r) {
            return;
        }
        r.Fame += value;
        if (r.Fame > 200 && r.Fame - value <= 200) {
            this.modifyEvent(70, 11, 0, 11, 932, -1, -1, 7968, 7968, 7968, 0, 18, 21);
        }
    }

    async breakStoneGate() {
        await this.playAnimation(-1, 3832 * 2, 3844 * 2);
        await this.play3Amination(2, 3845 * 2, 3873 * 2, 3, 3874 * 2, 4, 3903 * 2);
    }

    async fightForTop() {
        const heads = [8, 21, 23, 31, 32, 43, 7, 11, 14, 20, 33, 34, 10, 12, 19, 22, 56, 68, 13, 55, 62, 67, 70, 71, 26, 57, 60, 64, 3, 69];
        for (let i = 0; i < 15; i++) {
            const p = this.rand_.rand_int(2);
            await this.oldTalk(2854 + i * 2 + p, heads[i * 2 + p], this.rand_.rand_int(2) * 4 + this.rand_.rand_int(2));
            if (!(await this.tryBattle(102 + i * 2 + p, 0))) {
                this.dead();
                return;
            }
            await this.darkScene();
            await this.lightScene();
            if (i % 3 === 2) {
                await this.oldTalk(2891, 70, 4);
                this.rest();
                await this.darkScene();
                await this.lightScene();
            }
        }
        for (const t of [2884, 2885, 2886, 2887, 2888]) {
            await this.oldTalk(t, 0, 3);
        }
        await this.oldTalk(2889, 0, 1);
        await this.addItem(0x8f, 1);
    }

    allLeave() {
        for (let i = 1; i < TEAMMATE_COUNT; i++) {
            Save.Team[i] = -1;
        }
    }

    checkSubMapPic(submap_id, event_index, pic) {
        const s = this.getSubMapRecordFromID(submap_id);
        const e = s ? s.Event(event_index) : null;
        return !!e && (e.CurrentPic === pic || e.BeginPic === pic || e.EndPic === pic);
    }

    check14BooksPlaced() {
        const info = this.subscene_?.getMapInfo();
        if (!info) {
            return false;
        }
        for (let i = 11; i <= 24; i++) {
            if (info.Event(i).CurrentPic !== 4664) {
                return false;
            }
        }
        return true;
    }

    async backHome(event_index1, begin_pic1, end_pic1, event_index2, begin_pic2, end_pic2) {
        this.subscene_?.forceManPic(-2);
        await this.play2Amination(event_index1, begin_pic1, end_pic1, event_index2, begin_pic2, end_pic2);
        RunNode.exitAll(1);
        this.forceExit();
    }

    setSexual(role_id, value) {
        const r = Save.getRole(role_id);
        if (r) {
            r.Sexual = value;
        }
    }

    async shop() {
        await this.oldTalk(0xb9e, 0x6f, 0);
        const { UIShop } = await import('./UIShop.js');
        const shop = new UIShop();
        shop.setShopID(this.rand_.rand_int(5));
        const result = await shop.run();
        if (result >= 0) {
            await this.oldTalk(0xba0, 0x6f, 0);
        }
    }

    playMusic(music_id) {
        Audio.playMusic(music_id);
    }

    playWave(wave_id) {
        Audio.playASound(wave_id);
    }

    arrangeBag() {
        const counts = new Map();
        for (const it of Save.Items) {
            if (it.ItemID >= 0 && it.Count > 0) {
                counts.set(it.ItemID, (counts.get(it.ItemID) || 0) + it.Count);
            }
            it.ItemID = -1;
            it.Count = 0;
        }
        let k = 0;
        for (const [id, c] of [...counts].sort((a, b) => a[0] - b[0])) {
            if (k >= ITEM_IN_BAG_COUNT) {
                break;
            }
            Save.Items[k].ItemID = id;
            Save.Items[k].Count = c;
            k++;
        }
    }

    clearTalkBox() {
        this.talk_box_up_.setContent('');
        this.talk_box_down_.setContent('');
    }

    setTeamMember(index, role_id) {
        if (index >= 0 && index < TEAMMATE_COUNT) {
            Save.Team[index] = role_id;
        }
    }

    getTeamMember(index) {
        return index >= 0 && index < TEAMMATE_COUNT ? Save.getTeamMateID(index) : -1;
    }

    // offset counts int16 values inside the SubMapEvent struct
    setSubMapEventData(submap_id, event_index, offset, value) {
        const e = this.getSubMapRecordFromID(submap_id)?.Event(event_index);
        if (e && offset >= 0 && offset < 11) {
            e.set(offset, value);
        }
    }

    getSubMapEventData(submap_id, event_index, offset) {
        const e = this.getSubMapRecordFromID(submap_id)?.Event(event_index);
        return e && offset >= 0 && offset < 11 ? e.get(offset) : 0;
    }

    getSubMapLayerData(submap_id, layer, x, y) {
        return this.getSubMapRecordFromID(submap_id)?.LayerData(layer, x, y) ?? 0;
    }

    async getEventKey() {
        this.text_box_.setText('');
        this.text_box_.setTexture('', 0);
        const key = await this.text_box_.run();
        this.event_node_.clear();
        return { [K_LEFT]: 154, [K_RIGHT]: 156, [K_UP]: 158, [K_DOWN]: 152 }[key] ?? key;
    }

    drawEventImage(type, image_id, x, y) {
        if (type === 0) {
            this.event_node_.Infos.push({ type: 1, x, y, text: this.submap_id_ < 0 ? 'mmap' : 'smap', num: image_id });
        } else if (type === 1) {
            this.event_node_.Infos.push({ type: 1, x, y, text: 'head', num: image_id });
        }
    }

    async delayEvent(ms) {
        await new Promise((r) => setTimeout(r, Math.max(0, ms)));
    }

    setMainMapPosition(x, y) {
        MainScene.getInstance().setManPosition(x, y);
    }

    // ---- instruction 50 (extended operations on a 64K int scratch memory)
    e_GetValue(bit, t, x) {
        return (t & (1 << bit)) === 0 ? x : this.x50[x & 0xffff];
    }

    getStr(index) {
        const b = this.x50b;
        let p = (index & 0xffff) * 4;
        const start = p;
        while (p < b.length && b[p] !== 0) {
            p++;
        }
        return new TextDecoder().decode(b.subarray(start, p));
    }

    setStr(index, s) {
        const bytes = new TextEncoder().encode(s);
        const start = (index & 0xffff) * 4;
        const n = Math.min(bytes.length, this.x50b.length - start - 1);
        this.x50b.set(bytes.subarray(0, n), start);
        this.x50b[start + n] = 0;
    }

    structOf(type, id) {
        switch (type) {
        case 0: return [Save.getRole(id), 'Role'];
        case 1: return [Save.getItem(id), 'Item'];
        case 2: return [Save.getSubMapInfo(id), 'SubMapInfo'];
        case 3: return [Save.getMagic(id), 'Magic'];
        case 4: return [Save.getShop(id), 'Shop'];
        default: return [null, ''];
        }
    }

    // code_ptr: { base, code } for the kdef interpreter, or the pending modification of the script binding
    async instruct_50e(code, e1, e2, e3, e4, e5, e6, code_ptr = null) {
        const x50 = this.x50;
        const g = (bit, v) => this.e_GetValue(bit, e1, v);
        let index;
        switch (code) {
        case 0:
            x50[e1] = e2;
            break;
        case 1:
            index = e3 + g(0, e4);
            x50[index] = g(1, e5);
            if (e2) {
                x50[index] &= 0xff;
            }
            break;
        case 2:
            index = e3 + g(0, e4);
            x50[e5] = x50[index];
            if (e2) {
                x50[index] &= 0xff;
            }
            break;
        case 3:
            index = g(0, e5);
            switch (e2) {
            case 0: x50[e3] = x50[e4] + index; break;
            case 1: x50[e3] = x50[e4] - index; break;
            case 2: x50[e3] = Math.imul(x50[e4], index); break;
            case 3: if (index !== 0) { x50[e3] = Math.trunc(x50[e4] / index); } break;
            case 4: if (index !== 0) { x50[e3] = x50[e4] % index; } break;
            case 5: if (index !== 0) { x50[e3] = Math.trunc((x50[e4] >>> 0) / index); } break;
            default: break;
            }
            break;
        case 4: {
            x50[0x7000] = 0;
            index = g(0, e4);
            const v = x50[e3];
            const tests = [v < index, v <= index, v === index, v !== index, v >= index, v > index];
            if (e2 >= 0 && e2 <= 5) {
                if (!tests[e2]) {
                    x50[0x7000] = 1;
                }
            } else if (e2 === 6) {
                x50[0x7000] = 0;
            } else if (e2 === 7) {
                x50[0x7000] = 1;
            }
            break;
        }
        case 5:
            x50.fill(0);
            break;
        case 8:
            index = g(0, e2);
            this.setStr(e3, this.getTalkContent(index));
            break;
        case 9:
            this.setStr(e2, csprintf(this.getStr(e3), [g(0, e4)]));
            break;
        case 10:
            x50[e2] = textDrawSize(this.getStr(e1));
            break;
        case 11:
            this.setStr(e1, this.getStr(e1) + this.getStr(e2));
            break;
        case 12:
            this.setStr(e2, ' '.repeat(Math.max(0, Math.trunc(g(0, e3) / 2))));
            break;
        case 16: {
            const [obj, type] = this.structOf(e2, g(0, e3));
            setStructInt(obj, type, g(1, e4) * 2, g(2, e5));
            break;
        }
        case 17: {
            const [obj, type] = this.structOf(e2, g(0, e3));
            x50[e5] = getStructInt(obj, type, g(1, e4) * 2);
            break;
        }
        case 18:
            Save.Team[g(0, e2)] = g(1, e3);
            break;
        case 19:
            x50[e3] = Save.Team[g(0, e2)] ?? -1;
            break;
        case 20:
            x50[e3] = Save.getItemCountInBag(g(0, e2));
            break;
        case 21:
            this.setSubMapEventData(g(0, e2), g(1, e3), g(2, e4), g(3, e5));
            break;
        case 22:
            x50[e5] = this.getSubMapEventData(g(0, e2), g(1, e3), g(2, e4));
            break;
        case 23:
            Save.getSubMapInfo(g(0, e2))?.setLayerData(g(1, e3), g(2, e4), g(3, e5), g(4, e6));
            break;
        case 24:
            x50[e6] = Save.getSubMapInfo(g(0, e2))?.LayerData(g(1, e3), g(2, e4), g(3, e5)) ?? 0;
            break;
        case 27: {
            const id = g(0, e3);
            const objs = [Save.getRole(id), Save.getItem(id), Save.getSubMapInfo(id), Save.getMagic(id)];
            if (e2 >= 0 && e2 <= 3 && objs[e2]) {
                this.setStr(e4, objs[e2].Name);
            }
            break;
        }
        case 32: {
            const v = g(0, e3);
            if (code_ptr && code_ptr.code) {
                code_ptr.code[code_ptr.base + v] = x50[e2];
            } else if (code_ptr) {
                code_ptr.pos = v;
                code_ptr.value = x50[e2];
            }
            break;
        }
        case 33:
            this.event_node_.Infos.push({ type: 0, x: g(0, e3), y: g(1, e4), text: this.getStr(e2), num: 0 });
            break;
        case 34:
            Engine.fillColor(C(0, 0, 0, 128), g(0, e2), g(1, e3), g(2, e4), g(3, e5));
            break;
        case 35: {
            this.text_box_.setText('');
            this.text_box_.setTexture('', 0);
            const k = await this.text_box_.run();
            this.event_node_.clear();
            x50[e1] = { [K_LEFT]: 154, [K_RIGHT]: 156, [K_UP]: 158, [K_DOWN]: 152 }[k] ?? k;
            break;
        }
        case 36:
            this.talk_box_up_.setContent(this.getStr(e2));
            this.talk_box_up_.setHeadID(-1);
            this.talk_box_up_.setHeadStyle(2);
            x50[0x7000] = await this.talk_box_up_.run();
            break;
        case 37:
            await this.delayEvent(g(0, e2));
            break;
        case 38:
            x50[e3] = this.rand_.rand_int(g(0, e2));
            break;
        case 39:
        case 40: {
            const n = g(0, e2);
            const strs = [];
            for (let i = 0; i < n; i++) {
                strs.push(String(i) + this.getStr(x50[e3 + i]));
            }
            const menu = new MenuText();
            menu.setStrings(strs);
            menu.setPosition(g(1, e5), g(2, e6));
            x50[e4] = (await menu.run()) + 1;
            break;
        }
        case 41: {
            const x = g(0, e3);
            const y = g(1, e4);
            const n = g(2, e5);
            if (e2 === 0) {
                this.event_node_.Infos.push({ type: 1, x, y, text: this.submap_id_ < 0 ? 'mmap' : 'smap', num: n });
            } else if (e2 === 1) {
                this.event_node_.Infos.push({ type: 1, x, y, text: 'head', num: n });
            }
            break;
        }
        case 42:
            MainScene.getInstance().setManPosition(g(0, e2), g(0, e3));
            break;
        case 43:
            x50[0x7100] = g(1, e3);
            x50[0x7101] = g(2, e4);
            x50[0x7102] = g(3, e5);
            x50[0x7103] = g(4, e6);
            await this.callEvent(g(0, e2));
            break;
        case 48:
            for (let i = e1; i < e1 + e2 - 1; i++) {
                console.log(`x50[${i}]=${x50[i]}`);
            }
            break;
        case 52:
            x50[0x7000] = 1;
            if ((Save.getRole(g(0, e2))?.getMagicLevelIndex(g(1, e3)) ?? -2) + 1 >= g(2, e4)) {
                x50[0x7000] = 0;
            }
            break;
        default:
            break;
        }
    }
}

