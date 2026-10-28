// ScriptCifa: runs the event scripts with the Cifa interpreter and registers
// the game functions available to them (ScriptCifa.cpp).
import { Cifa, cifaInt } from './Cifa.js';
import { C } from './Color.js';
import { DrawableOnCall } from './DrawNode.js';
import { Engine } from './Engine.js';
import { Event, INSTRUCTS } from './Event.js';
import { readText } from './Files.js';
import { Font } from './Font.js';
import * as K from './Keys.js';
import { Save } from './Save.js';
import { MenuText } from './TextBox.js';
import { FieldInfo, TEAMMATE_COUNT, getField, setField } from './Types.js';
import { textDrawSize } from './util.js';

const GETTERS = {
    Role: (i) => Save.getRole(i),
    Item: (i) => Save.getItem(i),
    Magic: (i) => Save.getMagic(i),
    SubMapInfo: (i) => Save.getSubMapInfo(i),
    Shop: (i) => Save.getShop(i),
};

// get/set a field of a record by its database column name or by its index in the C struct
function cModifier(dataName, args) {
    if (!args.length) {
        return undefined;
    }
    const obj = GETTERS[dataName](cifaInt(args[0]));
    if (!obj) {
        return undefined;
    }
    let name = '';
    let offset = -1;
    if (args.length > 1) {
        if (typeof args[1] === 'number') {
            offset = cifaInt(args[1]);
        } else {
            name = String(args[1]);
        }
    }
    for (const info of FieldInfo[dataName]) {
        if ((name && name === info.name) || (!name && offset >= 0 && offset * 4 === info.offset)) {
            if (args.length === 2) {
                return getField(obj, info);
            }
            if (info.type === 0) {
                setField(obj, info, cifaInt(args[2]));
            } else {
                setField(obj, info, String(args[2] ?? ''));
            }
            break;
        }
    }
    return undefined;
}

let instance = null;

export class ScriptCifa {
    constructor() {
        this.cifa_ = new Cifa();
        this.cache_ = new Map();
        this.p50_32 = { pos: 2147483647, value: 0 };
        this.registerEventFunctions();
    }

    static getInstance() {
        if (!instance) {
            instance = new ScriptCifa();
        }
        return instance;
    }

    async loadEventScript(event_id) {
        if (this.cache_.has(event_id)) {
            return this.cache_.get(event_id);
        }
        let src = await readText(`script/event-cifa/${event_id}.cifa`);
        if (!src) {
            src = await readText(`script/event-cifa/${event_id}.c`);
        }
        let program = null;
        if (src) {
            try {
                program = this.cifa_.compile(src.toLowerCase());
            } catch (e) {
                console.error(`Syntax error in event ${event_id}: ${e.message} at line ${e.line}`);
                program = { error: e };
            }
        }
        this.cache_.set(event_id, program);
        return program;
    }

    // returns 0 on success like ScriptCifa::runScript
    async runEvent(event_id) {
        const program = await this.loadEventScript(event_id);
        if (!program) {
            console.log(`Event ${event_id}: Cifa script not found`);
            return 1;
        }
        if (program.error) {
            return 1;
        }
        this.cifa_.register_vector('x', new Array(0x10000).fill(0));
        const r = await this.cifa_.run(program);
        return r && r.error ? 1 : 0;
    }

    async runScriptString(content) {
        this.cifa_.register_vector('x', new Array(0x10000).fill(0));
        const r = await this.cifa_.run_script(content);
        return r && r.error ? 1 : 0;
    }

    registerEventFunctions() {
        const c = this.cifa_;
        const ev = () => Event.getInstance();
        const reg = (name, f) => c.register_function(name.toLowerCase(), f);
        // functions of Event with int parameters; missing arguments are -1
        const regEvent = (name, method, nargs, isBool) => {
            reg(name, async (args) => {
                const a = [];
                for (let i = 0; i < nargs; i++) {
                    a.push(i < args.length ? cifaInt(args[i]) : -1);
                }
                const r = await ev()[method](...a);
                return isBool ? (r ? 1 : 0) : undefined;
            });
        };
        reg('callevent', async (args) => (args.length ? ((await ev().callEvent(cifaInt(args[0]))) ? 1 : 0) : 0));
        const named = {
            oldTalk: 3, addItem: 2, modifyEvent: 13, isUsingItem: 1, askBattle: 0, tryBattle: 2, forceExit: 0, changeMainMapMusic: 1,
            askJoin: 0, join: 1, askRest: 0, rest: 0, lightScene: 0, darkScene: 0, dead: 0, inTeam: 1, setSubMapLayerData: 5,
            haveItemBool: 1, oldSetScenePosition: 2, teamIsFull: 0, leaveTeam: 1, zeroAllMP: 0, setRoleUsePoison: 2, subMapViewFromTo: 4,
            add3EventNum: 5, playAnimation: 3, checkRoleMorality: 3, checkRoleAttack: 3, walkFromTo: 4, checkEnoughMoney: 1,
            addItemWithoutHint: 2, oldLearnMagic: 3, addIQ: 2, setRoleMagic: 4, checkRoleSexual: 1, addMorality: 1, changeSubMapPic: 4,
            openSubMap: 1, setTowards: 1, roleAddItem: 3, checkFemaleInTeam: 0, play2Amination: 6, play3Amination: 7, addSpeed: 2,
            addMaxMP: 2, addAttack: 2, addMaxHP: 2, setMPType: 2, checkHave5Item: 5, askSoftStar: 0, showMorality: 0, showFame: 0,
            openAllSubMap: 0, checkEventID: 2, addFame: 1, breakStoneGate: 0, fightForTop: 0, allLeave: 0, checkSubMapPic: 3,
            check14BooksPlaced: 0, backHome: 6, setSexual: 2, shop: 0, playMusic: 1, playWave: 1,
        };
        const bools = new Set(['isUsingItem', 'askBattle', 'tryBattle', 'askJoin', 'askRest', 'inTeam', 'haveItemBool', 'teamIsFull',
            'checkRoleMorality', 'checkRoleAttack', 'checkEnoughMoney', 'checkRoleSexual', 'checkFemaleInTeam', 'checkHave5Item',
            'checkEventID', 'checkSubMapPic', 'check14BooksPlaced']);
        for (const [name, nargs] of Object.entries(named)) {
            regEvent(name, name, nargs, bools.has(name));
        }
        for (const [code, [name, nargs, isBool]] of Object.entries(INSTRUCTS)) {
            if (Number(code) >= 0) {
                regEvent(`instruct_${code}`, name, nargs, isBool);
            }
        }
        regEvent('instruct_6', 'tryBattle', 2, true);
        reg('instruct_65', () => undefined);
        reg('instruct_50e', async (args) => {
            const a = [];
            for (let i = 0; i < 7; i++) {
                a.push(i < args.length ? cifaInt(args[i]) : 0);
            }
            await ev().instruct_50e(...a, this.p50_32);
            return undefined;
        });
        const newTalk = async (args) => {
            const iargs = [-1, -1, -1, -1, -1, -1, -1];
            let str = '';
            let i1 = 1;
            for (const a of args) {
                if (typeof a === 'number') {
                    if (i1 < 7) {
                        iargs[i1++] = cifaInt(a);
                    }
                } else if (!str) {
                    str = String(a ?? '');
                }
            }
            await ev().newTalk(str, iargs[1], iargs[2], iargs[3]);
            return undefined;
        };
        reg('newtalk', newTalk);
        reg('talk', newTalk);
        reg('getitemcountinbag', (a) => Save.getItemCountInBag(a.length ? cifaInt(a[0]) : 0));
        reg('autosave', async () => {
            await Save.save(11);
            return undefined;
        });
        reg('runsql', async (a) => {
            if (a.length) {
                await Save.runSql(String(a[0]));
            }
            return undefined;
        });
        for (const [names, data] of [[['getrole', 'setrole'], 'Role'], [['getitem', 'setitem'], 'Item'], [['getmagic', 'setmagic'], 'Magic'],
            [['getsubmapinfo', 'setsubmapinfo'], 'SubMapInfo'], [['getshop', 'setshop'], 'Shop']]) {
            for (const n of names) {
                reg(n, (a) => cModifier(data, a));
            }
        }
        reg('drawrect', (a) => {
            if (a.length >= 4) {
                Engine.fillColor(C(0, 0, 128, 255), cifaInt(a[0]), cifaInt(a[1]), cifaInt(a[2]), cifaInt(a[3]));
            }
            return undefined;
        });
        reg('drawstring', (a) => {
            if (a.length >= 3) {
                Font.draw(String(a[0]), 20, cifaInt(a[1]), cifaInt(a[2]), C(255, 255, 255, 255));
            }
            return undefined;
        });
        reg('showmessage', async (a) => {
            if (a.length < 3) {
                return 0;
            }
            const str = String(a[0]);
            const x = cifaInt(a[1]);
            const y = cifaInt(a[2]);
            const node = new DrawableOnCall(() => Font.drawWithBox(str, 20, x, y, C(255, 255, 255, 255)), (n, e) => {
                if (e.type === K.EVENT_KEY_UP) {
                    const k = e.key.key;
                    n.exitWithResult(k === K.K_Y || k === K.K_SPACE || k === K.K_RETURN ? 1 : 0);
                } else if (e.type === K.EVENT_MOUSE_BUTTON_UP) {
                    if (e.button.button === K.BUTTON_LEFT) {
                        n.exitWithResult(1);
                    } else if (e.button.button === K.BUTTON_RIGHT) {
                        n.exitWithResult(0);
                    }
                }
            });
            return node.run();
        });
        reg('drawlength', (a) => (a.length ? textDrawSize(String(a[0])) : 0));
        reg('gettalk', (a) => ev().getTalkContent(a.length ? cifaInt(a[0]) : 0));
        reg('getitemname', (a) => Save.getItem(a.length ? cifaInt(a[0]) : 0)?.Name ?? '');
        reg('getrolename', (a) => Save.getRole(a.length ? cifaInt(a[0]) : 0)?.Name ?? '');
        reg('getsubmapname', (a) => Save.getSubMapInfo(a.length ? cifaInt(a[0]) : 0)?.Name ?? '');
        reg('getmagicname', (a) => Save.getMagic(a.length ? cifaInt(a[0]) : 0)?.Name ?? '');
        reg('getshopname', () => '');
        reg('getteam', (a) => {
            const i = a.length ? cifaInt(a[0]) : 0;
            return i < 0 || i >= TEAMMATE_COUNT ? -1 : Save.getTeamMateID(i);
        });
        reg('menu', async (a) => {
            if (a.length < 3 || !Array.isArray(a[2])) {
                return 0;
            }
            const arr = a[2];
            const n = a.length >= 4 ? cifaInt(a[3]) : arr.length - 1;
            const items = [];
            for (let i = 1; i <= n && i < arr.length; i++) {
                if (typeof arr[i] === 'string') {
                    items.push(arr[i]);
                }
            }
            if (!items.length) {
                return 0;
            }
            const menu = new MenuText();
            menu.setStrings(items);
            menu.setPosition(cifaInt(a[0]), cifaInt(a[1]));
            return (await menu.run()) + 1;
        });
        reg('getitemamount', (a) => Save.getItemCountInBag(a.length ? cifaInt(a[0]) : 0));
        reg('setteam', (a) => {
            if (a.length >= 2) {
                ev().setTeamMember(cifaInt(a[0]), cifaInt(a[1]));
            }
            return undefined;
        });
        reg('setd', (a) => {
            if (a.length >= 4) {
                ev().setSubMapEventData(cifaInt(a[0]), cifaInt(a[1]), cifaInt(a[2]), cifaInt(a[3]));
            }
            return undefined;
        });
        reg('getd', (a) => (a.length >= 3 ? ev().getSubMapEventData(cifaInt(a[0]), cifaInt(a[1]), cifaInt(a[2])) : 0));
        reg('sets', (a) => {
            if (a.length >= 5) {
                ev().setSubMapLayerData(cifaInt(a[0]), cifaInt(a[1]), cifaInt(a[2]), cifaInt(a[3]), cifaInt(a[4]));
            }
            return undefined;
        });
        reg('gets', (a) => (a.length >= 4 ? ev().getSubMapLayerData(cifaInt(a[0]), cifaInt(a[1]), cifaInt(a[2]), cifaInt(a[3])) : 0));
        reg('getkey', () => ev().getEventKey());
        reg('delay', async (a) => {
            if (a.length) {
                await ev().delayEvent(cifaInt(a[0]));
            }
            return undefined;
        });
        reg('drawmainimage', (a) => {
            if (a.length >= 3) {
                ev().drawEventImage(0, cifaInt(a[0]), cifaInt(a[1]), cifaInt(a[2]));
            }
            return undefined;
        });
        reg('drawheadimage', (a) => {
            if (a.length >= 3) {
                ev().drawEventImage(1, cifaInt(a[0]), cifaInt(a[1]), cifaInt(a[2]));
            }
            return undefined;
        });
        reg('setmainmapposition', (a) => {
            if (a.length >= 2) {
                ev().setMainMapPosition(cifaInt(a[0]), cifaInt(a[1]));
            }
            return undefined;
        });
    }
}
