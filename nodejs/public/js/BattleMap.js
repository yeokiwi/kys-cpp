// BattleMap: battle definitions (war.sta) and the battle field layers
// (warfld.idx/grp) (BattleMap.cpp)
import { readBinary } from './Files.js';
import { MapSquare, TEAMMATE_COUNT } from './Types.js';

export const BATTLE_ROLE_COUNT = 4096;
export const BATTLEMAP_SAVE_LAYER_COUNT = 2;
export const BATTLEMAP_LAYER_COUNT = 8;
export const BATTLEMAP_COORD_COUNT = 64;
export const BATTLE_ENEMY_COUNT = 20;

// MAP_INT ID; char Name[10]; MAP_INT BattleFieldID, Exp, Music; TeamMate, AutoTeamMate, TeamMateX, TeamMateY [6];
// Enemy, EnemyX, EnemyY [20]
const BATTLE_INFO_SIZE = 2 + 10 + 2 * 3 + 2 * TEAMMATE_COUNT * 4 + 2 * BATTLE_ENEMY_COUNT * 3;
const LAYER_SIZE = BATTLEMAP_COORD_COUNT * BATTLEMAP_COORD_COUNT;

let big5 = null;
try {
    big5 = new TextDecoder('big5');
} catch {
    big5 = null;
}

function decodeName(bytes) {
    let end = bytes.indexOf(0);
    if (end < 0) {
        end = bytes.length;
    }
    const b = bytes.subarray(0, end);
    return big5 ? big5.decode(b) : String.fromCharCode(...b);
}

function parseInfo(view, base) {
    let o = base;
    const i16 = () => {
        const v = view.getInt16(o, true);
        o += 2;
        return v;
    };
    const arr = (n) => Array.from({ length: n }, i16);
    const info = { ID: i16() };
    info.Name = decodeName(new Uint8Array(view.buffer, view.byteOffset + o, 10));
    o += 10;
    info.BattleFieldID = i16();
    info.Exp = i16();
    info.Music = i16();
    info.TeamMate = arr(TEAMMATE_COUNT);
    info.AutoTeamMate = arr(TEAMMATE_COUNT);
    info.TeamMateX = arr(TEAMMATE_COUNT);
    info.TeamMateY = arr(TEAMMATE_COUNT);
    info.Enemy = arr(BATTLE_ENEMY_COUNT);
    info.EnemyX = arr(BATTLE_ENEMY_COUNT);
    info.EnemyY = arr(BATTLE_ENEMY_COUNT);
    return info;
}

class BattleMapImpl {
    constructor() {
        this.battle_infos_ = [];
        this.battle_field_data2_ = [];
        this.loaded_ = null;
    }

    load() {
        if (!this.loaded_) {
            this.loaded_ = (async () => {
                const [sta, idx, grp] = await Promise.all([
                    readBinary('resource/war.sta'), readBinary('resource/warfld.idx'), readBinary('resource/warfld.grp')]);
                if (sta) {
                    const view = new DataView(sta);
                    for (let i = 0; i + BATTLE_INFO_SIZE <= sta.byteLength; i += BATTLE_INFO_SIZE) {
                        this.battle_infos_.push(parseInfo(view, i));
                    }
                }
                if (idx && grp) {
                    const ends = new Int32Array(idx, 0, idx.byteLength >> 2);
                    let begin = 0;
                    for (const end of ends) {
                        const data = new Int16Array(BATTLEMAP_SAVE_LAYER_COUNT * LAYER_SIZE);
                        const n = Math.min(data.length, Math.max(0, (Math.min(end, grp.byteLength) - begin) >> 1));
                        data.set(new Int16Array(grp.slice(begin, begin + n * 2)));
                        this.battle_field_data2_.push(data);
                        begin = end;
                    }
                }
            })();
        }
        return this.loaded_;
    }

    getBattleInfo(i) {
        if (i < 0 || i >= this.battle_infos_.length) {
            return null;
        }
        return this.battle_infos_[i];
    }

    copyLayerData(battle_field_id, layer, out) {
        const data = this.battle_field_data2_[battle_field_id];
        if (!data) {
            out.setAll(0);
            return;
        }
        out.data_.set(data.subarray(layer * LAYER_SIZE, (layer + 1) * LAYER_SIZE));
    }
}

export const BattleMap = new BattleMapImpl();
BattleMap.getInstance = () => BattleMap;

export function makeMapSquareInt(size = BATTLEMAP_COORD_COUNT) {
    return new MapSquare(size, Int16Array);
}
