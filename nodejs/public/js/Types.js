// Game data types (Types.h / Types.cpp) and the column mapping of the SQLite
// save tables (NewSave.h). Field names are kept identical to the C++ code.
import { GameUtil } from './GameUtil.js';
import { Pointf } from './Point.js';
import { Save } from './Save.js';
import { RandomDouble, clamp, findNumbers } from './util.js';
import { readText } from './Files.js';

export const SUBMAP_COORD_COUNT = 64;
export const SUBMAP_LAYER_COUNT = 6;
export const MAINMAP_COORD_COUNT = 480;
export const SUBMAP_EVENT_COUNT = 200;
export const ITEM_IN_BAG_COUNT = 1000;
export const TEAMMATE_COUNT = 6;
export const ROLE_MAGIC_COUNT = 10;
export const ROLE_TAKING_ITEM_COUNT = 4;
export const MAX_MAGIC_LEVEL = 999;
export const MAX_MAGIC_LEVEL_INDEX = 9;
export const ROLE_INTERNAL_COUNT = 4;
export const SHOP_ITEM_COUNT = 5;
export const INT_MAX = 2147483647;

export const SDATA_LENGTH = 2 * SUBMAP_LAYER_COUNT * SUBMAP_COORD_COUNT * SUBMAP_COORD_COUNT;
export const EVENT_FIELDS = 11;
export const DDATA_LENGTH = 2 * EVENT_FIELDS * SUBMAP_EVENT_COUNT;

// ActType_t / OperationType_t
export const AT = { None: -1, Medcine: 0, Fist: 1, Sword: 2, Knife: 3, Unusual: 4 };
export const OT = { None: -1, Light: 0, Heavy: 1, Long: 2, Slash: 3, Item: 4 };

export class MapSquare {
    constructor(size = 0, ArrayType = null) {
        this.ArrayType = ArrayType;
        if (size) {
            this.resize(size);
        }
    }

    resize(x) {
        this.data_ = this.ArrayType ? new this.ArrayType(x * x) : new Array(x * x).fill(null);
        this.line_ = x;
    }

    data(x, y) {
        return this.data_[x + this.line_ * y];
    }

    data1(i) {
        return this.data_[i];
    }

    set(x, y, v) {
        this.data_[x + this.line_ * y] = v;
    }

    size() {
        return this.line_;
    }

    squareSize() {
        return this.line_ * this.line_;
    }

    setAll(v) {
        this.data_.fill(v);
    }

    copyTo(ms) {
        for (let i = 0; i < this.squareSize(); i++) {
            ms.data_[i] = this.data_[i];
        }
    }

    copyFrom(ms) {
        for (let i = 0; i < this.squareSize(); i++) {
            this.data_[i] = ms.data_[i];
        }
    }
}

// ---------- C struct layouts (for get/set by offset in scripts) ----------
// [name, kind, count]: kind 'i' int, 'a' int array, 'c' char array (bytes), 's' std::string
const ROLE_LAYOUT = [
    ['ID', 'i'], ['HeadID', 'i'], ['IncLife', 'i'], ['UnUse', 'i'], ['Name_hold', 'c', 20], ['Nick_hold', 'c', 20],
    ['Sexual', 'i'], ['Level', 'i'], ['Exp', 'i'], ['HP', 'i'], ['MaxHP', 'i'], ['Hurt', 'i'], ['Poison', 'i'], ['PhysicalPower', 'i'],
    ['ExpForMakeItem', 'i'], ['Equip0', 'i'], ['Equip1', 'i'], ['EquipMagic', 'a', 4], ['EquipMagic2', 'a', 4], ['EquipItem', 'i'],
    ['Frame', 'a', 6], ['MPType', 'i'], ['MP', 'i'], ['MaxMP', 'i'], ['Attack', 'i'], ['Speed', 'i'], ['Defence', 'i'], ['Medicine', 'i'],
    ['UsePoison', 'i'], ['Detoxification', 'i'], ['AntiPoison', 'i'], ['Fist', 'i'], ['Sword', 'i'], ['Knife', 'i'], ['Unusual', 'i'],
    ['HiddenWeapon', 'i'], ['Knowledge', 'i'], ['Morality', 'i'], ['AttackWithPoison', 'i'], ['AttackTwice', 'i'], ['Fame', 'i'], ['IQ', 'i'],
    ['PracticeItem', 'i'], ['ExpForItem', 'i'], ['MagicID', 'a', 10], ['MagicLevel', 'a', 10], ['TakingItem', 'a', 4],
    ['TakingItemCount', 'a', 4], ['InternalID', 'a', 4], ['InternalLevel', 'a', 4], ['Name', 's'], ['Nick', 's'],
];

const ITEM_LAYOUT = [
    ['ID', 'i'], ['Name_hold', 'c', 80], ['Introduction_hold', 'c', 60], ['MagicID', 'i'], ['HiddenWeaponEffectID', 'i'], ['User', 'i'],
    ['EquipType', 'i'], ['ShowIntroduction', 'i'], ['ItemType', 'i'], ['UnKnown5', 'i'], ['UnKnown6', 'i'], ['UnKnown7', 'i'],
    ['AddHP', 'i'], ['AddMaxHP', 'i'], ['AddPoison', 'i'], ['AddPhysicalPower', 'i'], ['ChangeMPType', 'i'], ['AddMP', 'i'], ['AddMaxMP', 'i'],
    ['AddAttack', 'i'], ['AddSpeed', 'i'], ['AddDefence', 'i'], ['AddMedicine', 'i'], ['AddUsePoison', 'i'], ['AddDetoxification', 'i'],
    ['AddAntiPoison', 'i'], ['AddFist', 'i'], ['AddSword', 'i'], ['AddKnife', 'i'], ['AddUnusual', 'i'], ['AddHiddenWeapon', 'i'],
    ['AddKnowledge', 'i'], ['AddMorality', 'i'], ['AddAttackTwice', 'i'], ['AddAttackWithPoison', 'i'], ['OnlySuitableRole', 'i'],
    ['NeedMPType', 'i'], ['NeedMP', 'i'], ['NeedAttack', 'i'], ['NeedSpeed', 'i'], ['NeedUsePoison', 'i'], ['NeedMedicine', 'i'],
    ['NeedDetoxification', 'i'], ['NeedFist', 'i'], ['NeedSword', 'i'], ['NeedKnife', 'i'], ['NeedUnusual', 'i'], ['NeedHiddenWeapon', 'i'],
    ['NeedIQ', 'i'], ['NeedExp', 'i'], ['NeedExpForMakeItem', 'i'], ['NeedMaterial', 'i'], ['MakeItem', 'a', 5], ['MakeItemCount', 'a', 5],
    ['Name', 's'], ['Introduction', 's'],
];

const MAGIC_LAYOUT = [
    ['ID', 'i'], ['Name_hold', 'c', 20], ['Unknown', 'a', 5], ['SoundID', 'i'], ['MagicType', 'i'], ['EffectID', 'i'], ['HurtType', 'i'],
    ['AttackAreaType', 'i'], ['NeedMP', 'i'], ['WithPoison', 'i'], ['Attack', 'a', 10], ['SelectDistance', 'a', 10],
    ['AttackDistance', 'a', 10], ['AddMP', 'a', 10], ['HurtMP', 'a', 10], ['Name', 's'],
];

const SUBMAP_LAYOUT = [
    ['ID', 'i'], ['Name_hold', 'c', 20], ['ExitMusic', 'i'], ['EntranceMusic', 'i'], ['JumpSubMap', 'i'], ['EntranceCondition', 'i'],
    ['MainEntranceX1', 'i'], ['MainEntranceY1', 'i'], ['MainEntranceX2', 'i'], ['MainEntranceY2', 'i'], ['EntranceX', 'i'], ['EntranceY', 'i'],
    ['ExitX', 'a', 3], ['ExitY', 'a', 3], ['JumpX', 'i'], ['JumpY', 'i'], ['JumpReturnX', 'i'], ['JumpReturnY', 'i'], ['Name', 's'],
];

const SHOP_LAYOUT = [['ItemID', 'a', 5], ['Total', 'a', 5], ['Price', 'a', 5]];

const BASE_LAYOUT = [
    ['InShip', 'i'], ['InSubMap', 'i'], ['MainMapX', 'i'], ['MainMapY', 'i'], ['SubMapX', 'i'], ['SubMapY', 'i'], ['FaceTowards', 'i'],
    ['ShipX', 'i'], ['ShipY', 'i'], ['ShipX1', 'i'], ['ShipY1', 'i'], ['Encode', 'i'], ['Team', 'a', 6],
];

const ITEMLIST_LAYOUT = [['ItemID', 'i'], ['Count', 'i']];

// byte offset of every int / string slot: { path -> offset }
function layoutOffsets(layout) {
    const map = new Map();
    let off = 0;
    for (const [name, kind, n] of layout) {
        if (kind === 'i') {
            map.set(name, off);
            off += 4;
        } else if (kind === 'a') {
            for (let i = 0; i < n; i++) {
                map.set(`${name}[${i}]`, off);
                off += 4;
            }
        } else if (kind === 'c') {
            off += n;
        }
    }
    off = Math.ceil(off / 8) * 8;
    for (const [name, kind] of layout) {
        if (kind === 's') {
            map.set(name, off);
            off += 32;
        }
    }
    return map;
}

// ---------- database columns (glz::meta) ----------
function arr(prefix, field, n, start = 1) {
    const r = [];
    for (let i = 0; i < n; i++) {
        r.push([`${prefix}${i + start}`, `${field}[${i}]`]);
    }
    return r;
}

const BASE_COLUMNS = [
    ['乘船', 'InShip'], ['子场景内', 'InSubMap'], ['主地图X', 'MainMapX'], ['主地图Y', 'MainMapY'], ['子场景X', 'SubMapX'], ['子场景Y', 'SubMapY'],
    ['面朝方向', 'FaceTowards'], ['船X', 'ShipX'], ['船Y', 'ShipY'], ['船X1', 'ShipX1'], ['船Y1', 'ShipY1'], ['内部编码', 'Encode'],
    ...arr('队友', 'Team', 6),
];

const ITEMLIST_COLUMNS = [['物品编号', 'ItemID'], ['物品数量', 'Count']];

const ROLE_COLUMNS = [
    ['编号', 'ID'], ['头像', 'HeadID'], ['生命成长', 'IncLife'], ['无用', 'UnUse'], ['名字', 'Name'], ['外号', 'Nick'], ['性别', 'Sexual'],
    ['等级', 'Level'], ['经验', 'Exp'], ['生命', 'HP'], ['生命最大值', 'MaxHP'], ['内伤', 'Hurt'], ['中毒', 'Poison'], ['体力', 'PhysicalPower'],
    ['物品修炼点数', 'ExpForMakeItem'], ['武器', 'Equip0'], ['防具', 'Equip1'], ...arr('装备武功', 'EquipMagic', 4),
    ...arr('二组装备武功', 'EquipMagic2', 4), ['装备物品', 'EquipItem'], ['内力性质', 'MPType'], ['内力', 'MP'], ['内力最大值', 'MaxMP'],
    ['攻击力', 'Attack'], ['轻功', 'Speed'], ['防御力', 'Defence'], ['医疗', 'Medicine'], ['用毒', 'UsePoison'], ['解毒', 'Detoxification'],
    ['抗毒', 'AntiPoison'], ['拳掌', 'Fist'], ['御剑', 'Sword'], ['耍刀', 'Knife'], ['特殊', 'Unusual'], ['暗器', 'HiddenWeapon'],
    ['武学常识', 'Knowledge'], ['品德', 'Morality'], ['攻击带毒', 'AttackWithPoison'], ['左右互搏', 'AttackTwice'], ['声望', 'Fame'],
    ['资质', 'IQ'], ['修炼物品', 'PracticeItem'], ['修炼点数', 'ExpForItem'], ...arr('所会武功', 'MagicID', 10), ...arr('武功等级', 'MagicLevel', 10),
    ...arr('携带物品', 'TakingItem', 4), ...arr('携带物品数量', 'TakingItemCount', 4),
];

const ITEM_COLUMNS = [
    ['编号', 'ID'], ['物品名', 'Name'], ['物品说明', 'Introduction'], ['练出武功', 'MagicID'], ['暗器动画编号', 'HiddenWeaponEffectID'],
    ['使用人', 'User'], ['装备类型', 'EquipType'], ['显示物品说明', 'ShowIntroduction'], ['物品类型', 'ItemType'], ['未知5', 'UnKnown5'],
    ['未知6', 'UnKnown6'], ['未知7', 'UnKnown7'], ['加生命', 'AddHP'], ['加生命最大值', 'AddMaxHP'], ['加中毒解毒', 'AddPoison'],
    ['加体力', 'AddPhysicalPower'], ['改变内力性质', 'ChangeMPType'], ['加内力', 'AddMP'], ['加内力最大值', 'AddMaxMP'], ['加攻击力', 'AddAttack'],
    ['加轻功', 'AddSpeed'], ['加防御力', 'AddDefence'], ['加医疗', 'AddMedicine'], ['加使毒', 'AddUsePoison'], ['加解毒', 'AddDetoxification'],
    ['加抗毒', 'AddAntiPoison'], ['加拳掌', 'AddFist'], ['加御剑', 'AddSword'], ['加耍刀', 'AddKnife'], ['加特殊兵器', 'AddUnusual'],
    ['加暗器技巧', 'AddHiddenWeapon'], ['加武学常识', 'AddKnowledge'], ['加品德', 'AddMorality'], ['加左右互搏', 'AddAttackTwice'],
    ['加攻击带毒', 'AddAttackWithPoison'], ['仅修炼人物', 'OnlySuitableRole'], ['需内力性质', 'NeedMPType'], ['需内力', 'NeedMP'],
    ['需攻击力', 'NeedAttack'], ['需轻功', 'NeedSpeed'], ['需用毒', 'NeedUsePoison'], ['需医疗', 'NeedMedicine'], ['需解毒', 'NeedDetoxification'],
    ['需拳掌', 'NeedFist'], ['需御剑', 'NeedSword'], ['需耍刀', 'NeedKnife'], ['需特殊兵器', 'NeedUnusual'], ['需暗器', 'NeedHiddenWeapon'],
    ['需资质', 'NeedIQ'], ['需经验', 'NeedExp'], ['练出物品需经验', 'NeedExpForMakeItem'], ['需材料', 'NeedMaterial'],
    ...arr('练出物品', 'MakeItem', 5), ...arr('练出物品数量', 'MakeItemCount', 5),
];

const SUBMAP_COLUMNS = [
    ['编号', 'ID'], ['名称', 'Name'], ['出门音乐', 'ExitMusic'], ['进门音乐', 'EntranceMusic'], ['跳转场景', 'JumpSubMap'],
    ['进入条件', 'EntranceCondition'], ['外景入口X1', 'MainEntranceX1'], ['外景入口Y1', 'MainEntranceY1'], ['外景入口X2', 'MainEntranceX2'],
    ['外景入口Y2', 'MainEntranceY2'], ['入口X', 'EntranceX'], ['入口Y', 'EntranceY'], ...arr('出口X', 'ExitX', 3), ...arr('出口Y', 'ExitY', 3),
    ['跳转X', 'JumpX'], ['跳转Y', 'JumpY'], ['跳转返还X', 'JumpReturnX'], ['跳转返还Y', 'JumpReturnY'],
];

const MAGIC_COLUMNS = [
    ['编号', 'ID'], ['名称', 'Name'], ...arr('未知', 'Unknown', 5), ['出招音效', 'SoundID'], ['武功类型', 'MagicType'], ['武功动画', 'EffectID'],
    ['伤害类型', 'HurtType'], ['攻击范围类型', 'AttackAreaType'], ['消耗内力', 'NeedMP'], ['敌人中毒', 'WithPoison'], ...arr('威力', 'Attack', 10),
    ...arr('移动范围', 'SelectDistance', 10), ...arr('杀伤范围', 'AttackDistance', 10), ...arr('加内力', 'AddMP', 10), ...arr('杀伤内力', 'HurtMP', 10),
];

const SHOP_COLUMNS = [...arr('物品编号', 'ItemID', 5), ...arr('物品总量', 'Total', 5), ...arr('物品价格', 'Price', 5)];

function getPath(obj, path) {
    const b = path.indexOf('[');
    if (b < 0) {
        return obj[path];
    }
    return obj[path.slice(0, b)][Number(path.slice(b + 1, -1))];
}

function setPath(obj, path, v) {
    const b = path.indexOf('[');
    if (b < 0) {
        obj[path] = v;
        return;
    }
    obj[path.slice(0, b)][Number(path.slice(b + 1, -1))] = v;
}

function buildFieldInfo(columns, layout) {
    const offsets = layoutOffsets(layout);
    const stringFields = new Set(layout.filter((l) => l[1] === 's').map((l) => l[0]));
    return columns.map(([name, path]) => ({
        name,
        path,
        type: stringFields.has(path) ? 2 : 0,
        offset: offsets.get(path) ?? -4,
    }));
}

export const FieldInfo = {
    Base: buildFieldInfo(BASE_COLUMNS, BASE_LAYOUT),
    ItemList: buildFieldInfo(ITEMLIST_COLUMNS, ITEMLIST_LAYOUT),
    Role: buildFieldInfo(ROLE_COLUMNS, ROLE_LAYOUT),
    Item: buildFieldInfo(ITEM_COLUMNS, ITEM_LAYOUT),
    SubMapInfo: buildFieldInfo(SUBMAP_COLUMNS, SUBMAP_LAYOUT),
    Magic: buildFieldInfo(MAGIC_COLUMNS, MAGIC_LAYOUT),
    Shop: buildFieldInfo(SHOP_COLUMNS, SHOP_LAYOUT),
};

export function getField(obj, info) {
    return getPath(obj, info.path);
}

export function setField(obj, info, v) {
    setPath(obj, info.path, v);
}

// table <-> objects
export function toTable(objects, fields) {
    return {
        columns: fields.map((f) => [f.name, f.type === 2 ? 'text' : 'integer']),
        rows: objects.map((o) => fields.map((f) => getPath(o, f.path))),
    };
}

// NewSave::readValues: matches columns by name, missing columns keep defaults
export function fromTable(table, fields, make, existing = []) {
    const result = existing;
    if (!table) {
        return result;
    }
    const colIndex = new Map(table.columns.map(([n], i) => [n, i]));
    table.rows.forEach((row, k) => {
        if (k >= result.length) {
            result.push(make());
        }
        const o = result[k];
        for (const f of fields) {
            const i = colIndex.get(f.name);
            if (i === undefined) {
                continue;
            }
            const v = row[i];
            if (f.type === 2) {
                setPath(o, f.path, v == null ? '' : String(v));
            } else {
                const n = Math.trunc(Number(v));
                setPath(o, f.path, Number.isFinite(n) ? n | 0 : 0);
            }
        }
    });
    return result;
}

// ---------- RoleSave / Role ----------
function zeros(n) {
    return new Array(n).fill(0);
}

export class Role {
    constructor() {
        // RoleSave
        this.ID = 0;
        this.HeadID = 0;
        this.IncLife = 0;
        this.UnUse = 0;
        this.Sexual = 0;
        this.Level = 0;
        this.Exp = 0;
        this.HP = 0;
        this.MaxHP = 0;
        this.Hurt = 0;
        this.Poison = 0;
        this.PhysicalPower = 0;
        this.ExpForMakeItem = 0;
        this.Equip0 = 0;
        this.Equip1 = 0;
        this.EquipMagic = zeros(4);
        this.EquipMagic2 = zeros(4);
        this.EquipItem = 0;
        this.Frame = zeros(6);
        this.MPType = 0;
        this.MP = 0;
        this.MaxMP = 0;
        this.Attack = 0;
        this.Speed = 0;
        this.Defence = 0;
        this.Medicine = 0;
        this.UsePoison = 0;
        this.Detoxification = 0;
        this.AntiPoison = 0;
        this.Fist = 0;
        this.Sword = 0;
        this.Knife = 0;
        this.Unusual = 0;
        this.HiddenWeapon = 0;
        this.Knowledge = 0;
        this.Morality = 0;
        this.AttackWithPoison = 0;
        this.AttackTwice = 0;
        this.Fame = 0;
        this.IQ = 0;
        this.PracticeItem = 0;
        this.ExpForItem = 0;
        this.MagicID = zeros(ROLE_MAGIC_COUNT);
        this.MagicLevel = zeros(ROLE_MAGIC_COUNT);
        this.TakingItem = zeros(ROLE_TAKING_ITEM_COUNT);
        this.TakingItemCount = zeros(ROLE_TAKING_ITEM_COUNT);
        this.InternalID = zeros(ROLE_INTERNAL_COUNT);
        this.InternalLevel = zeros(ROLE_INTERNAL_COUNT);
        this.Name = '';
        this.Nick = '';
        this.resetBattleFields();
    }

    resetBattleFields() {
        this.Team = 0;
        this.FaceTowards = 0;
        this.Dead = 0;
        this.Step = 0;
        this.Pic = 0;
        this.BattleSpeed = 0;
        this.ExpGot = 0;
        this.Auto = 0;
        this.FightFrame = [-1, 0, 0, 0, 0];
        this.FightingFrame = 0;
        this.Moved = 0;
        this.Acted = 0;
        this.ActTeam = 0;
        this.SelectedMagic = -1;
        this.Progress = 0;
        this.Show = { ShowStrings: [], BattleHurt: 0, ProgressChange: 0, Effect: -1 };
        this.X_ = 0;
        this.Y_ = 0;
        this.prevX_ = 0;
        this.prevY_ = 0;
        this.position_layer_ = null;
        this.AI_Action = 0;
        this.AI_MoveX = 0;
        this.AI_MoveY = 0;
        this.AI_ActionX = 0;
        this.AI_ActionY = 0;
        this.AI_Magic = null;
        this.AI_Item = null;
        this.Network_Action = 0;
        this.Network_MoveX = 0;
        this.Network_MoveY = 0;
        this.Network_ActionX = 0;
        this.Network_ActionY = 0;
        this.Network_Magic = null;
        this.Network_Item = null;
        this.RealID = -1;
        this.Networked = false;
        this.Competing = false;
        this.Pos = new Pointf();
        this.RealTowards = new Pointf();
        this.Velocity = new Pointf();
        this.Acceleration = new Pointf();
        this.HurtFrame = 0;
        this.CoolDown = 0;
        this.Attention = 0;
        this.Invincible = 0;
        this.Frozen = 0;
        this.Shake = 0;
        this.HaveAction = 0;
        this.ActType = -1;
        this.ActFrame = 0;
        this.PreActTimer = 0;
        this.OperationType = -1;
        this.OperationCount = 0;
        this.HurtThisFrame = 0;
        this.FindingWay = 0;
        this.Posture = 0;
        this.Breathless = 0;
        this.UsingMagic = null;
        this.UsingItem = null;
        this.WalkingStep = 0;
        this.Sheild = 0;
    }

    // copies the saved part (RoleSave) of another role
    copySaveFrom(r) {
        for (const f of SAVE_FIELDS) {
            const v = r[f];
            this[f] = Array.isArray(v) ? [...v] : v;
        }
    }

    // `Role r = *role;` in C++: a full copy
    clone() {
        const r = Object.create(Role.prototype);
        for (const [k, v] of Object.entries(this)) {
            if (Array.isArray(v)) {
                r[k] = [...v];
            } else if (v instanceof Pointf) {
                r[k] = v.clone();
            } else if (k === 'Show') {
                r[k] = { ...v, ShowStrings: [...v.ShowStrings] };
            } else {
                r[k] = v;
            }
        }
        return r;
    }

    // a copy of the RoleSave part only (used by battles with copied roles)
    cloneSave() {
        const r = new Role();
        r.copySaveFrom(this);
        return r;
    }

    // Role::resetBattleInfo: keep the RoleSave part, reset battle state
    resetBattleInfo() {
        this.resetBattleFields();
    }

    addShowString(text, color = { r: 255, g: 255, b: 255, a: 255 }, size = 28) {
        this.Show.ShowStrings.push({ Text: text, Color: color, Size: size });
    }

    clearShowStrings() {
        this.Show.ShowStrings.length = 0;
    }

    clearShow() {
        this.Show.ShowStrings.length = 0;
        this.Show.BattleHurt = 0;
        this.Show.ProgressChange = 0;
        this.Show.Effect = -1;
    }

    setRolePositionLayer(l) {
        this.position_layer_ = l;
    }

    setPosition(x, y) {
        if (!this.position_layer_) {
            this.X_ = x;
            this.Y_ = y;
            return;
        }
        if (this.X_ >= 0 && this.Y_ >= 0) {
            this.position_layer_.set(this.X_, this.Y_, null);
        }
        if (x >= 0 && y >= 0) {
            this.position_layer_.set(x, y, this);
        }
        this.X_ = x;
        this.Y_ = y;
    }

    setPositionOnly(x, y) {
        this.X_ = x;
        this.Y_ = y;
    }

    setPrevPosition(x, y) {
        this.prevX_ = x;
        this.prevY_ = y;
    }

    resetPosition() {
        this.setPosition(this.prevX_, this.prevY_);
    }

    X() {
        return this.X_;
    }

    Y() {
        return this.Y_;
    }

    movedDistance() {
        return Math.abs(this.X_ - this.prevX_) + Math.abs(this.Y_ - this.prevY_);
    }

    isAuto() {
        return this.Auto !== 0 || this.Team !== 0;
    }

    getActProperty(type) {
        switch (type) {
        case 0: return this.Medicine;
        case 1: return this.Fist;
        case 2: return this.Sword;
        case 3: return this.Knife;
        case 4: return this.Unusual;
        default: return 0;
        }
    }

    getRoleShowLearnedMagicLevel(i) {
        return this.getRoleMagicLevelIndex(i) + 1;
    }

    getRoleMagicLevelIndex(i) {
        let l = Math.trunc(this.MagicLevel[i] / 100);
        if (l < 0) {
            l = 0;
        }
        if (l > 9) {
            l = 9;
        }
        return l;
    }

    getLearnedMagicCount() {
        let n = 0;
        for (let i = 0; i < ROLE_MAGIC_COUNT; i++) {
            if (this.MagicID[i] > 0) {
                n++;
            }
        }
        return n;
    }

    getMagicLevelIndex(magic) {
        const id = typeof magic === 'number' ? magic : magic.ID;
        for (let i = 0; i < ROLE_MAGIC_COUNT; i++) {
            if (this.MagicID[i] === id) {
                return this.getRoleMagicLevelIndex(i);
            }
        }
        return -1;
    }

    getMagicOfRoleIndex(magic) {
        if (magic) {
            for (let i = 0; i < ROLE_MAGIC_COUNT; i++) {
                if (this.MagicID[i] === magic.ID) {
                    return i;
                }
            }
        }
        return -1;
    }

    getEquipMagicOfRoleIndex(magic) {
        if (magic) {
            for (let i = 0; i < 4; i++) {
                if (this.EquipMagic[i] === magic.ID) {
                    return i;
                }
            }
        }
        return -1;
    }

    getLearnedMagics() {
        const v = [];
        for (let i = 0; i < ROLE_MAGIC_COUNT; i++) {
            const m = Save.getMagic(this.MagicID[i]);
            if (m) {
                v.push(m);
            }
        }
        return v;
    }

    limit() {
        const m = Role.getMaxValue();
        const l = (k, a, b) => {
            this[k] = clamp(this[k], a, b);
        };
        l('Level', 0, m.Level);
        l('Exp', 0, m.Exp);
        l('ExpForItem', 0, m.Exp);
        l('ExpForMakeItem', 0, m.Exp);
        l('Poison', 0, m.Poison);
        l('MaxHP', 0, m.HP);
        l('MaxMP', 0, m.MP);
        l('HP', 0, this.MaxHP);
        l('MP', 0, this.MaxMP);
        l('PhysicalPower', 0, m.PhysicalPower);
        for (const k of ['Attack', 'Defence', 'Speed', 'Medicine', 'UsePoison', 'Detoxification', 'AntiPoison', 'Fist', 'Sword',
            'Knife', 'Unusual', 'HiddenWeapon', 'Knowledge', 'Morality', 'AttackWithPoison', 'Fame', 'IQ']) {
            l(k, 0, m[k]);
        }
        for (let i = 0; i < ROLE_MAGIC_COUNT; i++) {
            this.MagicLevel[i] = clamp(this.MagicLevel[i], 0, MAX_MAGIC_LEVEL);
        }
    }

    learnMagic(magic) {
        const magic_id = typeof magic === 'number' ? magic : magic ? magic.ID : -1;
        if (magic_id <= 0) {
            return -1;
        }
        let index = -1;
        for (let i = 0; i < ROLE_MAGIC_COUNT; i++) {
            if (this.MagicID[i] === magic_id) {
                if (Math.trunc(this.MagicLevel[i] / 100) < MAX_MAGIC_LEVEL_INDEX) {
                    this.MagicLevel[i] += 100;
                    return 0;
                }
                return -2;
            }
            if (this.MagicID[i] <= 0 && index === -1) {
                index = i;
            }
        }
        if (index < 0) {
            return -3;
        }
        this.MagicID[index] = magic_id;
        this.MagicLevel[index] = 0;
        return 0;
    }

    canUseItem(i) {
        if (!i) {
            return false;
        }
        if (i.ItemType === 0) {
            return false;
        } else if (i.ItemType === 1 || i.ItemType === 2) {
            if (i.MagicID > 0) {
                const level = this.getMagicLevelIndex(i.MagicID);
                if (level >= 0 && level < MAX_MAGIC_LEVEL_INDEX) {
                    return true;
                }
                if (level < 0 && this.getLearnedMagicCount() === ROLE_MAGIC_COUNT) {
                    return false;
                }
                if (level === MAX_MAGIC_LEVEL_INDEX) {
                    return false;
                }
            }
            if (i.ItemType === 2) {
                if ((this.MPType === 0 || this.MPType === 1) && (i.NeedMPType === 0 || i.NeedMPType === 1)) {
                    if (this.MPType !== i.NeedMPType) {
                        return false;
                    }
                }
                if (i.OnlySuitableRole >= 0) {
                    return i.OnlySuitableRole === this.ID;
                }
            }
            const test = (v, need) => {
                if (need > 0 && v < need) {
                    return false;
                }
                if (need < 0 && v > -need) {
                    return false;
                }
                return true;
            };
            return test(this.Attack, i.NeedAttack) && test(this.Speed, i.NeedSpeed) && test(this.Medicine, i.NeedMedicine)
                && test(this.UsePoison, i.NeedUsePoison) && test(this.Detoxification, i.NeedDetoxification)
                && test(this.Fist, i.NeedFist) && test(this.Sword, i.NeedSword) && test(this.Knife, i.NeedKnife)
                && test(this.Unusual, i.NeedUnusual) && test(this.HiddenWeapon, i.NeedHiddenWeapon)
                && test(this.MaxMP, i.NeedMP) && test(this.IQ, i.NeedIQ);
        } else if (i.ItemType === 3) {
            return true;
        } else if (i.ItemType === 4) {
            return true;
        }
        return false;
    }

    useItem(i) {
        if (!i) {
            return;
        }
        this.PhysicalPower += i.AddPhysicalPower;
        this.HP += i.AddHP;
        this.MaxHP += i.AddMaxHP;
        this.MP += i.AddMP;
        this.MaxMP += i.AddMaxMP;
        this.Poison += i.AddPoison;
        this.Medicine += i.AddMedicine;
        this.Detoxification += i.AddDetoxification;
        this.UsePoison += i.AddUsePoison;
        this.Attack += i.AddAttack;
        this.Defence += i.AddDefence;
        this.Speed += i.AddSpeed;
        this.Fist += i.AddFist;
        this.Sword += i.AddSword;
        this.Knife += i.AddKnife;
        this.Unusual += i.AddUnusual;
        this.HiddenWeapon += i.AddHiddenWeapon;
        this.Knowledge += i.AddKnowledge;
        this.Morality += i.AddMorality;
        this.AntiPoison += i.AddAntiPoison;
        this.AttackWithPoison += i.AddAttackWithPoison;
        if (i.ChangeMPType === 2) {
            this.MPType = 2;
        }
        if (i.AddAttackTwice) {
            this.AttackTwice = 1;
        }
        const need = this.getFinishedExpForItem(i);
        if (this.ExpForItem >= need) {
            this.learnMagic(i.MagicID);
            this.ExpForItem -= need;
        }
        this.limit();
    }

    levelUp() {
        this.Exp -= Role.level_up_list()[this.Level - 1];
        this.Level++;
        const rand = new RandomDouble();
        this.PhysicalPower = Role.getMaxValue().PhysicalPower;
        this.MaxHP += this.IncLife * 3 + rand.rand_int(6);
        this.HP = this.MaxHP;
        this.MaxMP += 20 + rand.rand_int(6);
        this.MP = this.MaxMP;
        this.Hurt = 0;
        this.Poison = 0;
        this.Attack += rand.rand_int(7);
        this.Speed += rand.rand_int(7);
        this.Defence += rand.rand_int(7);
        const up = (k, lim, inc) => {
            if (this[k] > lim) {
                this[k] += 1 + rand.rand_int(inc);
            }
        };
        up('Medicine', 0, 3);
        up('Detoxification', 0, 3);
        up('UsePoison', 0, 3);
        up('Fist', 10, 3);
        up('Sword', 10, 3);
        up('Knife', 10, 3);
        up('Unusual', 10, 3);
        up('HiddenWeapon', 10, 3);
        this.limit();
    }

    canLevelUp() {
        if (this.Level >= 1 && this.Level <= Role.getMaxValue().Level) {
            if (this.Exp >= this.getLevelUpExp(this.Level)) {
                return true;
            }
        }
        return false;
    }

    getLevelUpExp(level) {
        if (level <= 0 || level >= Role.getMaxValue().Level) {
            return INT_MAX;
        }
        return Role.level_up_list()[level - 1];
    }

    canFinishedItem() {
        const item = Save.getItem(this.PracticeItem);
        return this.ExpForItem >= this.getFinishedExpForItem(item);
    }

    getFinishedExpForItem(i) {
        if (!i || i.ItemType !== 2 || i.NeedExp < 0) {
            return INT_MAX;
        }
        let multiple = 7 - Math.trunc(this.IQ / 15);
        if (multiple <= 0) {
            multiple = 1;
        }
        if (i.MagicID > 0) {
            const idx = this.getMagicLevelIndex(i.MagicID);
            if (idx === MAX_MAGIC_LEVEL_INDEX) {
                return INT_MAX;
            }
            if (idx > 0) {
                multiple *= idx;
            }
        }
        return i.NeedExp * multiple;
    }

    equip(i) {
        if (!i) {
            return;
        }
        const r0 = Save.getRole(i.User);
        const book = Save.getItem(this.PracticeItem);
        const equip0 = Save.getItem(this.Equip0);
        const equip1 = Save.getItem(this.Equip1);
        if (this === r0) {
            return;
        }
        i.User = this.ID;
        if (i.ItemType === 2) {
            if (book) {
                book.User = -1;
            }
            this.PracticeItem = i.ID;
            if (r0) {
                r0.PracticeItem = -1;
            }
        }
        if (i.ItemType === 1) {
            if (i.EquipType === 0) {
                if (equip0) {
                    equip0.User = -1;
                }
                this.Equip0 = i.ID;
                if (r0) {
                    r0.Equip0 = -1;
                }
            }
            if (i.EquipType === 1) {
                if (equip1) {
                    equip1.User = -1;
                }
                this.Equip1 = i.ID;
                if (r0) {
                    r0.Equip1 = -1;
                }
            }
        }
    }

    medicine(r2) {
        if (!r2) {
            return 0;
        }
        const temp = r2.HP;
        r2.HP += this.Medicine;
        r2.HP = clamp(r2.HP, 0, r2.MaxHP);
        return r2.HP - temp;
    }

    detoxification(r2) {
        if (!r2) {
            return 0;
        }
        const temp = r2.Poison;
        r2.Poison -= Math.trunc(this.Detoxification / 3);
        r2.Poison = clamp(r2.Poison, 0, Role.getMaxValue().Poison);
        return r2.Poison - temp;
    }

    usePoison(r2) {
        if (!r2) {
            return 0;
        }
        const temp = r2.Poison;
        r2.Poison += Math.trunc(this.UsePoison / 3);
        r2.Poison = clamp(r2.Poison, 0, Role.getMaxValue().Poison);
        return r2.Poison - temp;
    }

    static getMaxValue() {
        return MAX_ROLE;
    }

    static level_up_list() {
        return LEVEL_UP_LIST;
    }

    static setMaxValue() {
        const g = GameUtil;
        const set = (k, d) => {
            MAX_ROLE[k] = g.getInt('constant', k, d);
        };
        set('Level', 30);
        set('HP', 999);
        set('MP', 999);
        set('PhysicalPower', 100);
        set('Poison', 100);
        set('Attack', 100);
        set('Defence', 100);
        set('Speed', 100);
        set('Medicine', 100);
        set('UsePoison', 100);
        set('Detoxification', 100);
        set('AntiPoison', 100);
        set('Fist', 100);
        set('Sword', 100);
        set('Knife', 100);
        set('Unusual', 100);
        set('HiddenWeapon', 100);
        set('Knowledge', 100);
        set('Morality', 100);
        set('AttackWithPoison', 100);
        set('Fame', 999);
        set('IQ', 100);
        set('Exp', 99999);
    }

    static async setLevelUpList() {
        const str = await readText('list/levelup.txt');
        LEVEL_UP_LIST.length = 0;
        LEVEL_UP_LIST.push(...findNumbers(str));
        while (LEVEL_UP_LIST.length < MAX_ROLE.Level) {
            LEVEL_UP_LIST.push(60000);
        }
    }
}

const SAVE_FIELDS = ROLE_LAYOUT.filter((l) => l[1] !== 'c').map((l) => l[0]);

const MAX_ROLE = new Role();
const LEVEL_UP_LIST = [];

// ---------- Item ----------
export class Item {
    constructor() {
        for (const [name, kind, n] of ITEM_LAYOUT) {
            if (kind === 'i') {
                this[name] = 0;
            } else if (kind === 'a') {
                this[name] = zeros(n);
            } else if (kind === 's') {
                this[name] = '';
            }
        }
    }

    isCompass() {
        return this.ID === Item.CompassItemID;
    }

    static setSpecialItems() {
        Item.MoneyItemID = GameUtil.getInt('constant', 'MoneyItemID', Item.MoneyItemID);
        Item.CompassItemID = GameUtil.getInt('constant', 'CompassItemID', Item.CompassItemID);
    }
}
Item.MoneyItemID = 174;
Item.CompassItemID = 182;

// ---------- Magic ----------
export class Magic {
    constructor() {
        for (const [name, kind, n] of MAGIC_LAYOUT) {
            if (kind === 'i') {
                this[name] = 0;
            } else if (kind === 'a') {
                this[name] = zeros(n);
            } else if (kind === 's') {
                this[name] = '';
            }
        }
    }

    calNeedMP(level_index) {
        return this.NeedMP * Math.trunc((level_index + 2) / 2);
    }

    calMaxLevelIndexByMP(mp, max_level) {
        max_level = clamp(max_level, 0, MAX_MAGIC_LEVEL_INDEX);
        if (this.NeedMP <= 0) {
            return max_level;
        }
        return clamp(Math.trunc(mp / (this.NeedMP * 2)) * 2 - 1, 0, max_level);
    }
}

// ---------- SubMapEvent: a view over 11 int16 values of the D data ----------
const EVENT_FIELD_NAMES = ['CannotWalk', 'Index', 'Event1', 'Event2', 'Event3', 'CurrentPic', 'EndPic', 'BeginPic', 'PicDelay', 'X_', 'Y_'];

export class SubMapEvent {
    constructor(data, base) {
        this.d_ = data;
        this.b_ = base;
    }

    X() {
        return this.d_[this.b_ + 9];
    }

    Y() {
        return this.d_[this.b_ + 10];
    }

    get(offset) {
        return this.d_[this.b_ + offset];
    }

    set(offset, v) {
        this.d_[this.b_ + offset] = v;
    }

    setPosition(x, y, submap_record) {
        if (x < -1) {
            x = this.X();
        }
        if (y < -1) {
            y = this.Y();
        }
        const index = submap_record.EventIndex(this.X(), this.Y());
        submap_record.setEventIndex(this.X(), this.Y(), -1);
        if (x < 0 || y < 0) {
            this.X_ = -1;
            this.Y_ = -1;
            return;
        }
        this.X_ = x;
        this.Y_ = y;
        submap_record.setEventIndex(x, y, index);
    }

    setPic(pic) {
        this.BeginPic = pic;
        this.CurrentPic = pic;
        this.EndPic = pic;
    }
}
EVENT_FIELD_NAMES.forEach((name, i) => {
    Object.defineProperty(SubMapEvent.prototype, name, {
        get() {
            return this.d_[this.b_ + i];
        },
        set(v) {
            this.d_[this.b_ + i] = v;
        },
    });
});

// ---------- SubMapInfo ----------
const LAYER_SIZE = SUBMAP_COORD_COUNT * SUBMAP_COORD_COUNT;

export class SubMapInfo {
    constructor() {
        for (const [name, kind, n] of SUBMAP_LAYOUT) {
            if (kind === 'i') {
                this[name] = 0;
            } else if (kind === 'a') {
                this[name] = zeros(n);
            } else if (kind === 's') {
                this[name] = '';
            }
        }
        this.setData(new Int16Array(SUBMAP_LAYER_COUNT * LAYER_SIZE), new Int16Array(EVENT_FIELDS * SUBMAP_EVENT_COUNT));
    }

    setData(layers, events) {
        this.layer_data_ = layers;
        this.event_data_ = events;
        this.events_ = [];
        for (let i = 0; i < SUBMAP_EVENT_COUNT; i++) {
            this.events_.push(new SubMapEvent(events, i * EVENT_FIELDS));
        }
    }

    LayerData(layer, x, y) {
        return this.layer_data_[layer * LAYER_SIZE + x + y * SUBMAP_COORD_COUNT];
    }

    setLayerData(layer, x, y, v) {
        this.layer_data_[layer * LAYER_SIZE + x + y * SUBMAP_COORD_COUNT] = v;
    }

    Earth(x, y) {
        return this.LayerData(0, x, y);
    }

    Building(x, y) {
        return this.LayerData(1, x, y);
    }

    Decoration(x, y) {
        return this.LayerData(2, x, y);
    }

    EventIndex(x, y) {
        return this.LayerData(3, x, y);
    }

    setEventIndex(x, y, v) {
        this.setLayerData(3, x, y, v);
    }

    BuildingHeight(x, y) {
        return this.LayerData(4, x, y);
    }

    DecorationHeight(x, y) {
        return this.LayerData(5, x, y);
    }

    // Event(x, y) or Event(i)
    Event(x, y) {
        const i = y === undefined ? x : this.EventIndex(x, y);
        if (i < 0 || i >= SUBMAP_EVENT_COUNT) {
            return null;
        }
        return this.events_[i];
    }
}

// ---------- Shop ----------
export class Shop {
    constructor() {
        this.ItemID = zeros(SHOP_ITEM_COUNT);
        this.Total = zeros(SHOP_ITEM_COUNT);
        this.Price = zeros(SHOP_ITEM_COUNT);
    }
}

// Byte offset -> field path inside the C++ structs, for script/event code that
// addresses save data by offset (instruct_50 16/17 and Get/Set by index).
const OFFSET_MAPS = {
    Role: layoutOffsets(ROLE_LAYOUT),
    Item: layoutOffsets(ITEM_LAYOUT),
    SubMapInfo: layoutOffsets(SUBMAP_LAYOUT),
    Magic: layoutOffsets(MAGIC_LAYOUT),
    Shop: layoutOffsets(SHOP_LAYOUT),
};
const REVERSE_OFFSET_MAPS = {};
for (const [k, m] of Object.entries(OFFSET_MAPS)) {
    REVERSE_OFFSET_MAPS[k] = new Map([...m].map(([path, off]) => [off, path]));
}

export function structFieldAt(type, byteOffset) {
    const m = REVERSE_OFFSET_MAPS[type];
    return m ? m.get(byteOffset) ?? null : null;
}

export function getStructInt(obj, type, byteOffset) {
    const path = structFieldAt(type, byteOffset);
    if (!obj || !path) {
        return 0;
    }
    const v = getPath(obj, path);
    return typeof v === 'number' ? v : 0;
}

export function setStructInt(obj, type, byteOffset, v) {
    const path = structFieldAt(type, byteOffset);
    if (!obj || !path) {
        return;
    }
    if (typeof getPath(obj, path) === 'number') {
        setPath(obj, path, v | 0);
    }
}
