// Save: all game data (Save.cpp). Slots are stored by the Node.js server in
// the same format as the C++ version (SQLite R data + S/D grp data).
import {
    DDATA_LENGTH, FieldInfo, Item, Magic, ROLE_MAGIC_COUNT, Role, SDATA_LENGTH, Shop, SubMapInfo, fromTable, toTable,
} from './Types.js';

// constants duplicated here because the Save singleton is created while Types.js may still be loading
const ITEM_IN_BAG_COUNT = 1000;
const TEAMMATE_COUNT = 6;

export class ItemList {
    constructor() {
        this.ItemID = -1;
        this.Count = 0;
    }
}

function b64ToBytes(b64) {
    const bin = atob(b64 || '');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i);
    }
    return out;
}

function bytesToB64(bytes) {
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(s);
}

const BASE_KEYS = ['InShip', 'InSubMap', 'MainMapX', 'MainMapY', 'SubMapX', 'SubMapY', 'FaceTowards', 'ShipX', 'ShipY',
    'ShipX1', 'ShipY1', 'Encode'];

class SaveImpl {
    constructor() {
        for (const k of BASE_KEYS) {
            this[k] = 0;
        }
        this.Team = new Array(TEAMMATE_COUNT).fill(-1);
        this.Items = [];
        for (let i = 0; i < ITEM_IN_BAG_COUNT; i++) {
            this.Items.push(new ItemList());
        }
        this.roles_mem_ = [];
        this.magics_mem_ = [];
        this.items_mem_ = [];
        this.submap_infos_mem_ = [];
        this.shops_mem_ = [];
        this.roles_by_name_ = new Map();
        this.items_by_name_ = new Map();
        this.magics_by_name_ = new Map();
        this.submap_infos_by_name_ = new Map();
        this.ZIP_SAVE = 1;
        this.DB_SD = 0;
    }

    setZipSave(v) {
        this.ZIP_SAVE = v;
    }

    async checkSaveFileExist(num) {
        const list = await this.listSaves(Math.max(num, 20));
        return list.some((s) => s.slot === num);
    }

    async listSaves(max = 20) {
        try {
            const r = await fetch(`/api/saves?max=${max}&zip=${this.ZIP_SAVE ? 1 : 0}`, { cache: 'no-store' });
            return r.ok ? await r.json() : [];
        } catch {
            return [];
        }
    }

    // BaseInfo as an object (for the "base" table)
    baseInfo() {
        const b = {};
        for (const k of BASE_KEYS) {
            b[k] = this[k];
        }
        b.Team = this.Team;
        return b;
    }

    async load(num) {
        let data;
        try {
            const r = await fetch(`/api/save/${num}?zip=${this.ZIP_SAVE ? 1 : 0}`, { cache: 'no-store' });
            if (!r.ok) {
                return false;
            }
            data = await r.json();
        } catch {
            return false;
        }
        const t = data.tables || {};
        const base = fromTable(t.base, FieldInfo.Base, () => this.baseInfo(), [this.baseInfo()])[0];
        for (const k of BASE_KEYS) {
            this[k] = base[k];
        }
        fromTable(t.bag, FieldInfo.ItemList, () => new ItemList(), this.Items);
        this.Items.length = ITEM_IN_BAG_COUNT;
        fromTable(t.role, FieldInfo.Role, () => new Role(), this.roles_mem_);
        fromTable(t.item, FieldInfo.Item, () => new Item(), this.items_mem_);
        fromTable(t.submap, FieldInfo.SubMapInfo, () => new SubMapInfo(), this.submap_infos_mem_);
        fromTable(t.magic, FieldInfo.Magic, () => new Magic(), this.magics_mem_);
        fromTable(t.shop, FieldInfo.Shop, () => new Shop(), this.shops_mem_);

        const sdata = b64ToBytes(data.sdata);
        const ddata = b64ToBytes(data.ddata);
        const count = this.submap_infos_mem_.length;
        const sAll = new Uint8Array(count * SDATA_LENGTH);
        const dAll = new Uint8Array(count * DDATA_LENGTH);
        sAll.set(sdata.subarray(0, sAll.length));
        dAll.set(ddata.subarray(0, dAll.length));
        for (let i = 0; i < count; i++) {
            const s = new Int16Array(sAll.buffer.slice(i * SDATA_LENGTH, (i + 1) * SDATA_LENGTH));
            const d = new Int16Array(dAll.buffer.slice(i * DDATA_LENGTH, (i + 1) * DDATA_LENGTH));
            this.submap_infos_mem_[i].setData(s, d);
        }
        this.makeMapsAndRepairID();
        // the server converts uncompressed saves to zip on the next save, like Save::load
        if (this.ZIP_SAVE && !data.zip && num > 0) {
            await this.save(num);
        }
        return true;
    }

    collect() {
        const count = this.submap_infos_mem_.length;
        const sAll = new Uint8Array(count * SDATA_LENGTH);
        const dAll = new Uint8Array(count * DDATA_LENGTH);
        for (let i = 0; i < count; i++) {
            const m = this.submap_infos_mem_[i];
            sAll.set(new Uint8Array(m.layer_data_.buffer, m.layer_data_.byteOffset, SDATA_LENGTH), i * SDATA_LENGTH);
            dAll.set(new Uint8Array(m.event_data_.buffer, m.event_data_.byteOffset, DDATA_LENGTH), i * DDATA_LENGTH);
        }
        return {
            tables: {
                base: toTable([this.baseInfo()], FieldInfo.Base),
                bag: toTable(this.Items, FieldInfo.ItemList),
                role: toTable(this.roles_mem_, FieldInfo.Role),
                item: toTable(this.items_mem_, FieldInfo.Item),
                submap: toTable(this.submap_infos_mem_, FieldInfo.SubMapInfo),
                magic: toTable(this.magics_mem_, FieldInfo.Magic),
                shop: toTable(this.shops_mem_, FieldInfo.Shop),
            },
            sdata: bytesToB64(sAll),
            ddata: bytesToB64(dAll),
        };
    }

    async save(num) {
        if (num <= 0) {
            return false;
        }
        try {
            const r = await fetch(`/api/save/${num}?zip=${this.ZIP_SAVE ? 1 : 0}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.collect()),
            });
            return r.ok;
        } catch {
            return false;
        }
    }

    updateAllPtrVector() {}

    getRole(i) {
        if (i < 0 || i >= this.roles_mem_.length) {
            return null;
        }
        return this.roles_mem_[i];
    }

    // 0 is not a valid magic
    getMagic(i) {
        if (i <= 0 || i >= this.magics_mem_.length) {
            return null;
        }
        return this.magics_mem_[i];
    }

    getItem(i) {
        if (i < 0 || i >= this.items_mem_.length) {
            return null;
        }
        return this.items_mem_[i];
    }

    getSubMapInfo(i) {
        if (i < 0 || i >= this.submap_infos_mem_.length) {
            return null;
        }
        return this.submap_infos_mem_[i];
    }

    getShop(i) {
        if (i < 0 || i >= this.shops_mem_.length) {
            return null;
        }
        return this.shops_mem_[i];
    }

    getRoles() {
        return this.roles_mem_;
    }

    getMagics() {
        return this.magics_mem_;
    }

    getItems() {
        return this.items_mem_;
    }

    getSubMapInfos() {
        return this.submap_infos_mem_;
    }

    getShops() {
        return this.shops_mem_;
    }

    getTeamMate(i) {
        if (i < 0 || i >= TEAMMATE_COUNT) {
            return null;
        }
        const r = this.Team[i];
        if (r < 0 || r >= this.roles_mem_.length) {
            return null;
        }
        return this.roles_mem_[r];
    }

    getTeamMateID(i) {
        return this.Team[i];
    }

    getItemByBagIndex(i) {
        if (i < 0 || i >= ITEM_IN_BAG_COUNT) {
            return null;
        }
        const r = this.Items[i].ItemID;
        if (r < 0 || r >= this.items_mem_.length) {
            return null;
        }
        return this.items_mem_[r];
    }

    getItemCountByBagIndex(i) {
        return this.Items[i].Count;
    }

    getItemCountInBag(item) {
        const id = typeof item === 'number' ? item : item.ID;
        for (let i = 0; i < ITEM_IN_BAG_COUNT; i++) {
            const iid = this.Items[i].ItemID;
            if (iid < 0) {
                break;
            }
            if (iid === id) {
                return this.Items[i].Count;
            }
        }
        return 0;
    }

    getMoneyCountInBag() {
        return this.getItemCountInBag(Item.MoneyItemID);
    }

    getAvailableEquipItems() {
        const ret = [];
        for (let i = 0; i < ITEM_IN_BAG_COUNT; i++) {
            const id = this.Items[i].ItemID;
            const count = this.Items[i].Count;
            if (id < 0) {
                break;
            }
            if (count <= 0) {
                continue;
            }
            const item = this.getItem(id);
            if (item && item.ItemType === 4) {
                ret.push([item, count]);
            }
        }
        return ret;
    }

    makeMapsAndRepairID() {
        this.roles_by_name_.clear();
        this.magics_by_name_.clear();
        this.items_by_name_.clear();
        this.submap_infos_by_name_.clear();
        this.roles_mem_.forEach((r, i) => {
            this.roles_by_name_.set(r.Name, r);
            r.ID = i;
        });
        this.magics_mem_.forEach((r, i) => {
            this.magics_by_name_.set(r.Name, r);
            r.ID = i;
        });
        this.items_mem_.forEach((r, i) => {
            this.items_by_name_.set(r.Name, r);
            r.ID = i;
        });
        this.submap_infos_mem_.forEach((r, i) => {
            this.submap_infos_by_name_.set(r.Name, r);
            r.ID = i;
        });
    }

    getRoleByName(name) {
        return this.roles_by_name_.get(name) || null;
    }

    getMagicByName(name) {
        return this.magics_by_name_.get(name) || null;
    }

    getItemByName(name) {
        return this.items_by_name_.get(name) || null;
    }

    getSubMapRecordByName(name) {
        return this.submap_infos_by_name_.get(name) || null;
    }

    getRoleLearnedMagic(r, i) {
        if (i < 0 || i >= ROLE_MAGIC_COUNT) {
            return null;
        }
        return this.getMagic(r.MagicID[i]);
    }

    getRoleLearnedMagicLevelIndex(r, m) {
        for (let i = 0; i < ROLE_MAGIC_COUNT; i++) {
            if (r.MagicID[i] === m.ID) {
                return r.getRoleMagicLevelIndex(i);
            }
        }
        return -1;
    }

    // Save::runSql: only "update <table> ..." statements on one table
    async runSql(cmd) {
        if (!cmd.startsWith('update ')) {
            return;
        }
        const m = /^update\s+(\S+)/.exec(cmd);
        if (!m) {
            return;
        }
        const table = m[1];
        const tables = {
            base: [() => [this.baseInfo()], FieldInfo.Base],
            bag: [() => this.Items, FieldInfo.ItemList],
            role: [() => this.roles_mem_, FieldInfo.Role],
            item: [() => this.items_mem_, FieldInfo.Item],
            submap: [() => this.submap_infos_mem_, FieldInfo.SubMapInfo],
            magic: [() => this.magics_mem_, FieldInfo.Magic],
            shop: [() => this.shops_mem_, FieldInfo.Shop],
        };
        const entry = tables[table];
        if (!entry) {
            return;
        }
        const [get, fields] = entry;
        try {
            const r = await fetch('/api/sql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table, data: toTable(get(), fields), sql: cmd }),
            });
            if (!r.ok) {
                return;
            }
            const result = await r.json();
            if (table === 'base') {
                const b = fromTable(result, fields, () => this.baseInfo(), [this.baseInfo()])[0];
                for (const k of BASE_KEYS) {
                    this[k] = b[k];
                }
            } else {
                fromTable(result, fields, null, get());
                this.makeMapsAndRepairID();
            }
        } catch {
            // ignore network errors, like a failed SQL statement
        }
    }
}

export const Save = new SaveImpl();
Save.getInstance = () => Save;
