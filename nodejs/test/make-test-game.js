// Generates a small synthetic kys-cpp game directory (placeholder images, maps,
// a new-game save, event scripts and battle data) for automated tests.
// The real game resources are distributed separately from the source code.
//
//   node test/make-test-game.js <output-dir>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { SaveStore } from '../server/saves.js';
import {
    DDATA_LENGTH, FieldInfo, Item, Magic, Role, SDATA_LENGTH, SUBMAP_COORD_COUNT, Shop, SubMapInfo, toTable,
} from '../public/js/Types.js';

const out = path.resolve(process.argv[2] || 'test-game');

// ---------------------------------------------------------------- PNG
function crcTable() {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        t[n] = c >>> 0;
    }
    return t;
}
const CRC = crcTable();
function crc32(buf) {
    let c = 0xffffffff;
    for (const b of buf) {
        c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function png(w, h, pixel) {
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (w * 4 + 1)] = 0;
        for (let x = 0; x < w; x++) {
            const [r, g, b, a] = pixel(x, y);
            const o = y * (w * 4 + 1) + 1 + x * 4;
            raw[o] = r;
            raw[o + 1] = g;
            raw[o + 2] = b;
            raw[o + 3] = a;
        }
    }
    const chunk = (type, data) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(td));
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function hue(i) {
    const h = (i * 47) % 360;
    const f = (n) => {
        const k = (n + h / 60) % 6;
        return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)) * 0.6));
    };
    return [f(5), f(3), f(1)];
}

const rect = (w, h, color, border = [0, 0, 0], alpha = 255) => png(w, h, (x, y) =>
    (x < 2 || y < 2 || x >= w - 2 || y >= h - 2 ? [...border, 255] : [...color, alpha]));

// isometric ground tile 36x18 (one map cell)
const diamond = (color) => png(36, 19, (x, y) => {
    const dx = Math.abs(x - 17.5) / 18;
    const dy = Math.abs(y - 9) / 9.5;
    return dx + dy <= 1 ? [...color, 255] : [0, 0, 0, 0];
});

// a small figure standing on a tile
const figure = (color, w = 30, h = 56) => png(w, h, (x, y) => {
    const cx = w / 2;
    if ((x - cx) ** 2 + (y - 8) ** 2 < 49) {
        return [240, 210, 170, 255];
    }
    if (y > 15 && Math.abs(x - cx) < 10 - (y > 40 ? 3 : 0)) {
        return [...color, 255];
    }
    return [0, 0, 0, 0];
});

function writeGroup(name, images) {
    const dir = path.join(out, 'resource', name);
    fs.mkdirSync(dir, { recursive: true });
    let max = 0;
    const lines = [];
    for (const [num, img] of images) {
        fs.writeFileSync(path.join(dir, `${num}.png`), img.data);
        max = Math.max(max, num);
        if (img.dx || img.dy) {
            lines.push(`${num}: ${img.dx}, ${img.dy}`);
        }
    }
    fs.writeFileSync(path.join(dir, 'index.txt'), lines.join('\n') + '\n');
    return max;
}

fs.mkdirSync(out, { recursive: true });

// ---------------------------------------------------------------- textures
const title = new Map();
const button = (num, color, w = 120, h = 40) => title.set(num, { data: rect(w, h, color) });
button(3, [150, 60, 40]);
button(4, [60, 120, 60]);
button(6, [60, 60, 140]);
button(23, [220, 110, 80]);
button(24, [110, 200, 110]);
button(26, [110, 110, 230]);
title.set(102, { data: rect(250, 90, [40, 40, 40], [200, 170, 90], 200) });
title.set(104, { data: rect(16, 20, [200, 200, 80]) });
title.set(105, { data: rect(16, 20, [200, 200, 80]) });
button(122, [130, 90, 50], 70, 40);
button(124, [90, 130, 50], 70, 40);
button(125, [50, 90, 130], 70, 40);
title.set(126, { data: rect(100, 40, [230, 220, 190], [140, 110, 60], 230) });
title.set(127, { data: rect(80, 80, [90, 90, 90], [200, 200, 200], 180) });
for (const n of [153, 154]) {
    title.set(n, { data: png(1280, 400, (x, y) => [20 + (y >> 2), 30, 60 + (x >> 4), 255]) });
}
title.set(201, { data: png(16, 16, (x, y) => [255, 255, 255, Math.max(0, 255 - ((x - 8) ** 2 + (y - 8) ** 2) * 4)]) });
title.set(203, { data: rect(100, 4, [255, 255, 255]) });
for (const n of [300, 302, 304, 306, 308, 310, 312]) {
    title.set(n, { data: rect(80, 80, hue(n), [255, 255, 255], 160) });
}
title.set(320, { data: png(160, 160, (x, y) => ((x - 80) ** 2 + (y - 80) ** 2 < 6400 ? [200, 200, 200, 120] : [0, 0, 0, 0])) });
writeGroup('title', title);

const heads = new Map();
for (let i = 0; i < 12; i++) {
    heads.set(i, { data: png(150, 180, (x, y) => (x < 3 || y < 3 || x > 146 || y > 176 ? [255, 255, 255, 255] : [...hue(i * 3), 255])) });
}
writeGroup('head', heads);

const items = new Map();
for (let i = 0; i < 200; i++) {
    items.set(i, { data: rect(80, 80, hue(i), [250, 250, 250]) });
}
writeGroup('item', items);

const tileOffset = { dx: 18, dy: 9 };
const figureOffset = { dx: 15, dy: 50 };
const mmap = new Map();
mmap.set(1, { data: diamond([255, 255, 255]), ...tileOffset });
mmap.set(2, { data: diamond([70, 150, 60]), ...tileOffset });
mmap.set(3, { data: diamond([90, 170, 70]), ...tileOffset });
mmap.set(310, { data: diamond([40, 80, 180]), ...tileOffset });
mmap.set(1100, { data: rect(72, 80, [150, 100, 60], [60, 30, 10]), dx: 36, dy: 70 });
for (let t = 0; t < 4; t++) {
    for (let s = 0; s < 7; s++) {
        mmap.set(2501 + t * 7 + s, { data: figure(hue(t), 30, 56 + (s % 2) * 2), ...figureOffset });
    }
    for (let s = 0; s < 6; s++) {
        mmap.set(2529 + t * 6 + s, { data: figure([200, 200, 200]), ...figureOffset });
    }
    for (let s = 0; s < 4; s++) {
        mmap.set(3715 + t * 4 + s, { data: rect(40, 20, [120, 80, 40]), dx: 20, dy: 15 });
    }
}
writeGroup('mmap', mmap);

const smap = new Map();
smap.set(1, { data: diamond([150, 130, 100]), ...tileOffset });
smap.set(2, { data: diamond([130, 110, 90]), ...tileOffset });
smap.set(10, { data: rect(36, 60, [120, 120, 130], [50, 50, 60]), dx: 18, dy: 52 });
smap.set(20, { data: figure([200, 40, 40]), ...figureOffset });
for (let t = 0; t < 4; t++) {
    for (let s = 0; s < 7; s++) {
        smap.set(2501 + t * 7 + s, { data: figure(hue(t)), ...figureOffset });
    }
}
writeGroup('smap', smap);

const cloud = new Map();
for (let i = 0; i < 10; i++) {
    cloud.set(i, { data: png(120, 60, (x, y) => [255, 255, 255, Math.max(0, 120 - (((x - 60) / 60) ** 2 + ((y - 30) / 30) ** 2) * 120) | 0]) });
}
writeGroup('cloud', cloud);

// battle: earth/building tiles in 'smap', a fight animation per head, and an effect
for (let h = 0; h < 4; h++) {
    const fight = new Map();
    // 5 actions, frames per direction listed in fightframe.txt
    for (let i = 0; i < 4 * 6; i++) {
        fight.set(i, { data: figure(hue(h * 5 + (i >> 2)), 40, 60), dx: 20, dy: 54 });
    }
    writeGroup(`fight/fight${String(h).padStart(3, '0')}`, fight);
    fs.writeFileSync(path.join(out, 'resource', 'fight', `fight${String(h).padStart(3, '0')}`, 'fightframe.txt'), '0, 2\n1, 2\n2, 2\n');
}
const eft = new Map();
for (let i = 0; i < 6; i++) {
    eft.set(i, { data: png(60, 60, (x, y) => [255, 200 - i * 30, 50, Math.max(0, 230 - ((x - 30) ** 2 + (y - 30) ** 2) / 4) | 0]), dx: 30, dy: 45 });
}
writeGroup('eft/eft000', eft);
writeGroup('eft/eft001', eft);

// ---------------------------------------------------------------- main map
const N = 480;
const layer = () => new Int16Array(N * N);
const earth = layer();
const surface = layer();
const building = layer();
const bx = layer();
const by = layer();
for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
        const i = x + y * N;
        earth[i] = ((x + y) % 7 === 0 ? 3 : 2) * 2;
        if (x > 250 && y > 250 && x < 270 && y < 270) {
            earth[i] = 310 * 2;
        }
    }
}
// a town building with an entrance at (205, 200)
for (const [x, y] of [[206, 200], [207, 201], [210, 205]]) {
    building[x + y * N] = 1100 * 2;
    bx[x + y * N] = x;
    by[x + y * N] = y;
}
for (const [name, data] of [['earth', earth], ['surface', surface], ['building', building], ['buildx', bx], ['buildy', by]]) {
    fs.writeFileSync(path.join(out, 'resource', `${name}.002`), Buffer.from(data.buffer));
}

// ---------------------------------------------------------------- texts and lists
fs.writeFileSync(path.join(out, 'resource', 'talkutf8.txt'), ['你好', '測試對話第一句', '測試對話第二句'].join('\n') + '\n');
fs.writeFileSync(path.join(out, 'resource', 'kdef.idx'), Buffer.from(new Int32Array([4, 12]).buffer));
fs.writeFileSync(path.join(out, 'resource', 'kdef.grp'), Buffer.from(new Int16Array([-1, -1, 1, 1, 0, 0, -1, -1]).buffer));
fs.mkdirSync(path.join(out, 'list'), { recursive: true });
fs.writeFileSync(path.join(out, 'list', 'levelup.txt'), Array.from({ length: 30 }, (_, i) => 50 * (i + 1) * (i + 1)).join('\n'));
fs.writeFileSync(path.join(out, 'list', 'leave.txt'), '950 1\n');
fs.mkdirSync(path.join(out, 'cc'), { recursive: true });
fs.writeFileSync(path.join(out, 'cc', 'TSCharacters.txt'), '測\t测\n試\t试\n對\t对\n話\t话\n個\t个\n');
fs.writeFileSync(path.join(out, 'cc', 'TSPhrases.txt'), '');

fs.mkdirSync(path.join(out, 'config'), { recursive: true });
fs.writeFileSync(path.join(out, 'config', 'kysmod.ini'), `[game]
; generated test configuration
battle_mode = 0
use_script = 1
simplified_chinese = 1
dynamic_day_night = 0
zip_save = 1

[music]
volume = 0
volumewav = 0

[constant]
begin_scene = 0
begin_sx = 10
begin_sy = 14
begin_event = -1
`);

fs.mkdirSync(path.join(out, 'script', 'event-cifa'), { recursive: true });
fs.writeFileSync(path.join(out, 'script', 'event-cifa', '1.cifa'), `// talk and get money
talk("少俠請留步，這裡有些盤纏。", 1, 0);
additem(174, 100);
x[1] = getitemcountinbag(174);
if (x[1] >= 100) { setrole(0, "聲望", 5); }
`);
fs.writeFileSync(path.join(out, 'script', 'event-cifa', '2.cifa'), `if (askbattle()) {
    if (trybattle(0, 0)) { talk("你贏了", 0, 1); } else { talk("你輸了", 0, 1); }
}
`);

// ---------------------------------------------------------------- save 0 (new game)
const roles = [];
for (let i = 0; i < 4; i++) {
    const r = new Role();
    r.ID = i;
    r.HeadID = i;
    r.Name = ['小蝦米', '胡斐', '程靈素', '敵人'][i];
    r.Nick = '';
    r.Level = 1;
    r.MaxHP = r.HP = 100 + i * 20;
    r.MaxMP = r.MP = 50;
    r.PhysicalPower = 90;
    r.Attack = 30;
    r.Defence = 30;
    r.Speed = 30;
    r.Fist = 30;
    r.Sword = 20;
    r.Medicine = i === 2 ? 40 : 0;
    r.IQ = 50;
    r.IncLife = 3;
    r.MagicID[0] = 1;
    r.MagicLevel[0] = 100;
    r.Equip0 = -1;
    r.Equip1 = -1;
    r.PracticeItem = -1;
    r.EquipItem = -1;
    r.TakingItem.fill(-1);
    roles.push(r);
}
const itemsData = [];
for (let i = 0; i < 200; i++) {
    const it = new Item();
    it.ID = i;
    it.Name = i === 174 ? '銀兩' : `物品${i}`;
    it.Introduction = '測試物品';
    it.User = -1;
    it.MagicID = -1;
    it.OnlySuitableRole = -1;
    it.NeedMaterial = -1;
    it.MakeItem.fill(-1);
    it.ItemType = i < 3 ? 3 : 0;
    it.AddHP = i < 3 ? 50 : 0;
    itemsData.push(it);
}
const magics = [];
for (let i = 0; i < 3; i++) {
    const m = new Magic();
    m.ID = i;
    m.Name = ['無', '野球拳', '劍法'][i];
    m.MagicType = 1;
    m.EffectID = i === 2 ? 1 : 0;
    m.AttackAreaType = 0;
    m.NeedMP = 5;
    m.Attack.fill(100);
    m.SelectDistance.fill(1);
    m.AttackDistance.fill(0);
    magics.push(m);
}
const submaps = [];
const sAll = new Uint8Array(2 * SDATA_LENGTH);
const dAll = new Uint8Array(2 * DDATA_LENGTH);
for (let i = 0; i < 2; i++) {
    const s = new SubMapInfo();
    s.ID = i;
    s.Name = ['測試小村', '密室'][i];
    s.ExitMusic = -1;
    s.EntranceMusic = -1;
    s.JumpSubMap = -1;
    s.MainEntranceX1 = i === 0 ? 205 : 0;
    s.MainEntranceY1 = i === 0 ? 200 : 0;
    s.EntranceX = 10;
    s.EntranceY = 14;
    s.ExitX = [10, -1, -1];
    s.ExitY = [15, -1, -1];
    const C = SUBMAP_COORD_COUNT;
    for (let y = 0; y < C; y++) {
        for (let x = 0; x < C; x++) {
            s.setLayerData(0, x, y, ((x + y) % 2 ? 1 : 2) * 2);
            s.setLayerData(3, x, y, -1);
            if (x === 5 || y === 5) {
                s.setLayerData(1, x, y, 10 * 2);
            }
        }
    }
    for (let k = 0; k < 200; k++) {
        const ev = s.Event(k);
        ev.X_ = -1;
        ev.Y_ = -1;
    }
    if (i === 0) {
        // event 0: talk (script 1), event 1: battle (script 2)
        for (const [k, ex, ey, id] of [[0, 12, 12, 1], [1, 8, 12, 2]]) {
            const ev = s.Event(k);
            ev.CannotWalk = 1;
            ev.Index = k;
            ev.Event1 = id;
            ev.CurrentPic = ev.BeginPic = ev.EndPic = 20 * 2;
            ev.X_ = ex;
            ev.Y_ = ey;
            s.setEventIndex(ex, ey, k);
        }
    }
    sAll.set(new Uint8Array(s.layer_data_.buffer), i * SDATA_LENGTH);
    dAll.set(new Uint8Array(s.event_data_.buffer), i * DDATA_LENGTH);
    submaps.push(s);
}
const shops = [];
for (let i = 0; i < 5; i++) {
    const sh = new Shop();
    sh.ItemID = [0, 1, 2, 3, 4];
    sh.Total = [5, 5, 5, 5, 5];
    sh.Price = [10, 20, 30, 40, 50];
    shops.push(sh);
}
const base = {
    InShip: 0, InSubMap: -1, MainMapX: 200, MainMapY: 200, SubMapX: 0, SubMapY: 0, FaceTowards: 0, ShipX: 0, ShipY: 0,
    ShipX1: 0, ShipY1: 0, Encode: 0, Team: [0, 1, -1, -1, -1, -1],
};
const bag = Array.from({ length: 1000 }, (_, i) => (i === 0 ? { ItemID: 0, Count: 3 } : { ItemID: -1, Count: 0 }));
const store = new SaveStore(path.join(out, 'save'));
store.save(0, {
    tables: {
        base: toTable([base], FieldInfo.Base),
        bag: toTable(bag, FieldInfo.ItemList),
        role: toTable(roles, FieldInfo.Role),
        item: toTable(itemsData, FieldInfo.Item),
        submap: toTable(submaps, FieldInfo.SubMapInfo),
        magic: toTable(magics, FieldInfo.Magic),
        shop: toTable(shops, FieldInfo.Shop),
    },
    sdata: Buffer.from(sAll).toString('base64'),
    ddata: Buffer.from(dAll).toString('base64'),
}, false);

// ---------------------------------------------------------------- battle data
// warfld.idx/grp: battle maps (2 layers of 64x64 int16), war.sta: battle definitions
const field = new Int16Array(2 * 64 * 64);
for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
        field[x + y * 64] = ((x + y) % 2 ? 1 : 2) * 2;
    }
}
fs.writeFileSync(path.join(out, 'resource', 'warfld.grp'), Buffer.from(field.buffer));
fs.writeFileSync(path.join(out, 'resource', 'warfld.idx'), Buffer.from(new Int32Array([field.byteLength]).buffer));
// BattleInfo: ID, Name[10], BattleFieldID, Exp, Music, TeamMate[6], AutoTeamMate[6], TeamMateX[6], TeamMateY[6],
// Enemy[20], EnemyX[20], EnemyY[20]
const BATTLE_INFO_SIZE = 186;
const sta = Buffer.alloc(BATTLE_INFO_SIZE * 2);
for (let b = 0; b < 2; b++) {
    const v = [b];
    const name = Buffer.alloc(10);
    name.write(`war${b}`, 'latin1');
    const ints = [0, 100, -1];
    const team = [0, 1, -1, -1, -1, -1];
    const auto = [-1, -1, -1, -1, -1, -1];
    const tx = [30, 31, 0, 0, 0, 0];
    const ty = [30, 32, 0, 0, 0, 0];
    const enemy = Array(20).fill(-1);
    enemy[0] = 3;
    const ex = Array(20).fill(0);
    ex[0] = 34;
    const ey = Array(20).fill(0);
    ey[0] = 31;
    let o = b * BATTLE_INFO_SIZE;
    sta.writeInt16LE(v[0], o);
    name.copy(sta, o + 2);
    o += 12;
    for (const x of [...ints, ...team, ...auto, ...tx, ...ty, ...enemy, ...ex, ...ey]) {
        sta.writeInt16LE(x, o);
        o += 2;
    }
}
fs.writeFileSync(path.join(out, 'resource', 'war.sta'), sta);
// font: any CJK font found on the system (the game ships its own)
for (const f of ['/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']) {
    if (fs.existsSync(f)) {
        fs.mkdirSync(path.join(out, 'font'), { recursive: true });
        fs.copyFileSync(f, path.join(out, 'font', 'chinese.ttf'));
        break;
    }
}
console.log(`Test game written to ${out}`);
