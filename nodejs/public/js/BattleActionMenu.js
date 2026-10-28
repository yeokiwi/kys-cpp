// BattleActionMenu: the action menu of a battle, with the AI that chooses the
// actions of automatic roles; BattleItemMenu: items usable in a battle
// (BattleMenu.cpp)
import { BATTLEMAP_COORD_COUNT, makeMapSquareInt } from './BattleMap.js';
import { Event } from './Event.js';
import { NodeNormal, NodePress } from './RunNode.js';
import { Save } from './Save.js';
import { MenuText } from './TextBox.js';
import { ROLE_MAGIC_COUNT, ROLE_TAKING_ITEM_COUNT } from './Types.js';
import { UIItem } from './UIItem.js';
import { LOG, format } from './util.js';

function newAIAction() {
    return { Action: 0, point: 0, MoveX: 0, MoveY: 0, ActionX: 0, ActionY: 0, magic: null, item: null };
}

export class BattleItemMenu extends UIItem {
    constructor() {
        super();
        this.setSelectUser(false);
    }

    setRole(r) {
        this.role_ = r;
    }

    getRole() {
        return this.role_;
    }

    addItem(item, count) {
        if (this.role_.Team === 0) {
            Event.getInstance().addItemWithoutHint(item.ID, count);
        } else {
            Event.getInstance().roleAddItem(this.role_.ID, item.ID, count);
        }
    }

    // replaces UIItem::onEntrance like the C++ override
    async onEntrance() {
        if (this.role_ === null) {
            return;
        }
        if (this.role_.isAuto() && this.role_.AI_Item) {
            this.current_item_ = this.role_.AI_Item;
            this.setExit(true);
            this.setVisible(false);
        }
    }

    getAvaliableItems() {
        const type = [...this.force_item_type_][0];
        if (this.role_.Team === 0) {
            this.geItemsByType(type);
        } else {
            this.available_items_ = [];
            for (let i = 0; i < ROLE_TAKING_ITEM_COUNT; i++) {
                const item = Save.getItem(this.role_.TakingItem[i]);
                if (this.getItemDetailType(item) === type) {
                    this.available_items_.push(item);
                }
            }
        }
        return this.available_items_;
    }

    static getAvaliableItems(role, type) {
        const item_menu = new BattleItemMenu();
        item_menu.setRole(role);
        item_menu.setForceItemType([type]);
        return item_menu.getAvaliableItems();
    }
}

export class BattleActionMenu extends MenuText {
    constructor(b) {
        super();
        this.setStrings(['移動', '武學', '用毒', '解毒', '醫療', '暗器', '藥品', '等待', '狀態', '自動', '結束']);
        this.distance_layer_ = makeMapSquareInt(BATTLEMAP_COORD_COUNT);
        this.battle_scene_ = b;
        this.role_ = null;
    }

    text(s) {
        return this.childs_text_.get(s);
    }

    setRole(r) {
        const role = r;
        this.role_ = r;
        this.setVisible(true);
        for (const c of this.childs_) {
            c.setVisible(true);
            c.setState(NodeNormal);
        }
        if (role.Moved || role.PhysicalPower < 10) {
            this.text('移動').setVisible(false);
        }
        if (role.getLearnedMagicCount() <= 0 || role.PhysicalPower < 20) {
            this.text('武學').setVisible(false);
        }
        if (role.UsePoison <= 0 || role.PhysicalPower < 30) {
            this.text('用毒').setVisible(false);
        }
        if (role.Detoxification <= 0 || role.PhysicalPower < 30) {
            this.text('解毒').setVisible(false);
        }
        if (role.Medicine <= 0 || role.PhysicalPower < 10) {
            this.text('醫療').setVisible(false);
        }
        if (role.HiddenWeapon <= 15 || role.PhysicalPower < 10) {
            this.text('暗器').setVisible(false);
        }
        if (role.Competing) {
            this.text('藥品').setVisible(false);
            this.text('暗器').setVisible(false);
        }
        this.text('等待').setVisible(false);
        this.setFontSize(20);
        this.arrange(0, 0, 0, 28);
        if (this.start_ === 0 || !this.getChild(this.active_child_).getVisible()) {
            this.active_child_ = this.findFristVisibleChild();
            this.forceActiveChild();
        }
        if (!role.Moved) {
            role.AI_Action = -1;
        }
    }

    async runAsRole(r) {
        this.setRole(r);
        return await this.run();
    }

    async dealEvent(e) {
        if (this.battle_scene_ === null) {
            return;
        }
        this.battle_scene_.handlePaperCameraInput(e);
        // the AI chooses its action without showing the menu
        if (this.role_.isAuto()) {
            const act = this.autoSelect(this.role_);
            this.setResult(act);
            this.setAllChildState(NodeNormal);
            this.childs_[act].setState(NodePress);
            this.setExit(true);
            this.setVisible(false);
            return;
        }
        await super.dealEvent(e);
    }

    // "0移動", "1武學", "2用毒", "3解毒", "4醫療", "5暗器", "6藥品", "7等待", "8狀態", "9自動", "10結束"
    autoSelect(role) {
        const bs = this.battle_scene_;
        const friends = [];
        const enemies = [];
        for (const r of bs.getBattleRoles()) {
            (r.Team === role.Team ? friends : enemies).push(r);
        }
        const ai_action = [];
        if (role.AI_Action === -1) {
            // a copy of the role used for calculations depending on distances
            const role_temp = role.clone();
            let approach_action = newAIAction();
            let has_approach_action = false;
            role.AI_Action = this.getResultFromString('結束');
            role.AI_MoveX = role.X();
            role.AI_MoveY = role.Y();
            role.AI_ActionX = role.X();
            role.AI_ActionY = role.Y();
            role.AI_Magic = null;
            role.AI_Item = null;
            if (friends.length && enemies.length) {
                bs.calSelectLayer(role, 0, bs.calMoveStep(role));
                // medicine
                let action_text = '藥品';
                if (this.text(action_text).getVisible() && (role.HP < 0.2 * role.MaxHP || role.MP < 0.2 * role.MaxMP
                    || this.role_.PhysicalPower < 0.2 * Save.MaxPhysicalPower)) {
                    const aa = newAIAction();
                    aa.Action = this.getResultFromString(action_text);
                    for (const item of BattleItemMenu.getAvaliableItems(role, 3)) {
                        aa.point = 0;
                        if (item.AddHP > 0) {
                            aa.point += Math.min(item.AddHP, role.MaxHP - role.HP) - Math.trunc(item.AddHP / 10);
                        }
                        if (item.AddMP > 0) {
                            aa.point += Math.trunc(Math.min(item.AddMP, role.MaxMP - role.MP) / 2) - Math.trunc(item.AddMP / 10);
                        } else if (item.AddPhysicalPower > 0) {
                            aa.point += Math.min(item.AddPhysicalPower, Save.MaxPhysicalPower - role.PhysicalPower)
                                - Math.trunc(item.AddPhysicalPower / 10);
                        }
                        if (aa.point > 0) {
                            aa.item = item;
                            aa.point *= 1.5;
                            [aa.MoveX, aa.MoveY] = this.getFarthestToAll(role, enemies, aa.MoveX, aa.MoveY);
                            ai_action.push({ ...aa });
                        }
                    }
                }
                // detoxification, medicine and poison depend on morality
                if (role.Morality > 50) {
                    action_text = '解毒';
                    if (this.text(action_text).getVisible()) {
                        for (const r2 of friends) {
                            if (r2.Poison > 50) {
                                const aa = newAIAction();
                                this.calAIActionNearest(r2, aa);
                                const action_dis = bs.calActionStep(role.Detoxification);
                                if (action_dis >= this.calNeedActionDistance(aa)) {
                                    aa.Action = this.getResultFromString(action_text);
                                    aa.point = r2.Poison;
                                    ai_action.push(aa);
                                }
                            }
                        }
                    }
                    action_text = '醫療';
                    if (this.text(action_text).getVisible()) {
                        for (const r2 of friends) {
                            if (r2.HP < 0.2 * r2.MaxHP) {
                                const aa = newAIAction();
                                this.calAIActionNearest(r2, aa);
                                const action_dis = bs.calActionStep(role.Medicine);
                                if (action_dis >= this.calNeedActionDistance(aa)) {
                                    aa.Action = this.getResultFromString(action_text);
                                    aa.point = r2.Medicine;
                                    ai_action.push(aa);
                                }
                            }
                        }
                    }
                } else {
                    action_text = '用毒';
                    if (this.text(action_text).getVisible()) {
                        const r2 = this.getNearestRole(role, enemies);
                        const aa = newAIAction();
                        this.calAIActionNearest(r2, aa);
                        const action_dis = bs.calActionStep(role.UsePoison);
                        if (action_dis >= this.calNeedActionDistance(aa)) {
                            aa.Action = this.getResultFromString(action_text);
                            aa.point = Math.trunc(Math.min(Save.MaxPosion - r2.Poison, role.UsePoison) / 2);
                            if (r2.HP < 10) {
                                aa.point = 1;
                            }
                            ai_action.push(aa);
                        }
                    }
                }
                // hidden weapons
                action_text = '暗器';
                if (this.text(action_text).getVisible()) {
                    const r2 = this.getNearestRole(role, enemies);
                    const aa = newAIAction();
                    this.calAIActionNearest(r2, aa, role_temp);
                    const action_dis = bs.calActionStep(role.HiddenWeapon);
                    if (action_dis >= this.calNeedActionDistance(aa)) {
                        aa.Action = this.getResultFromString(action_text);
                        for (const item of BattleItemMenu.getAvaliableItems(role, 4)) {
                            aa.point = bs.calHiddenWeaponHurt(role_temp, r2, item);
                            if (aa.point > r2.HP) {
                                aa.point = r2.HP * 1.25;
                            }
                            aa.point *= 0.5;
                            aa.item = item;
                            ai_action.push({ ...aa });
                        }
                    }
                }
                // magic
                action_text = '武學';
                if (this.text(action_text).getVisible()) {
                    const aa = newAIAction();
                    aa.Action = this.getResultFromString(action_text);
                    const r2 = this.getNearestRole(role, enemies);
                    this.calAIActionNearest(r2, aa, role_temp);
                    for (let i = 0; i < ROLE_MAGIC_COUNT; i++) {
                        let max_hurt = -1;
                        const magic = Save.getRoleLearnedMagic(role, i);
                        if (!magic) {
                            continue;
                        }
                        const level_index = role.getRoleMagicLevelIndex(i);
                        aa.ActionX = r2.X();
                        aa.ActionY = r2.Y();
                        bs.calSelectLayerByMagic(aa.MoveX, aa.MoveY, role.Team, magic, level_index);
                        // try every selectable position
                        for (let ix = 0; ix < BATTLEMAP_COORD_COUNT; ix++) {
                            for (let iy = 0; iy < BATTLEMAP_COORD_COUNT; iy++) {
                                if (bs.canSelect(ix, iy)) {
                                    bs.calEffectLayer(aa.MoveX, aa.MoveY, ix, iy, magic, level_index);
                                    const total_hurt = bs.calMagiclHurtAllEnemies(role_temp, magic, true);
                                    if (total_hurt > max_hurt) {
                                        max_hurt = total_hurt;
                                        aa.magic = magic;
                                        aa.ActionX = ix;
                                        aa.ActionY = iy;
                                    }
                                }
                            }
                        }
                        // no target can be hurt
                        if (max_hurt <= 0) {
                            continue;
                        }
                        aa.point = max_hurt;
                        ai_action.push({ ...aa });
                    }
                }
                // without a good action, approach the nearest enemy
                if (!role.Moved) {
                    approach_action.Action = this.getResultFromString('結束');
                    approach_action.MoveX = role.X();
                    approach_action.MoveY = role.Y();
                    approach_action.ActionX = role.X();
                    approach_action.ActionY = role.Y();
                    let approach_point = 0;
                    for (const r2 of enemies) {
                        const aa = newAIAction();
                        aa.MoveX = role.X();
                        aa.MoveY = role.Y();
                        aa.ActionX = r2.X();
                        aa.ActionY = r2.Y();
                        const p = this.getApproachPosition(role, r2);
                        if (!p) {
                            continue;
                        }
                        [aa.MoveX, aa.MoveY] = p;
                        if (aa.MoveX !== role.X() || aa.MoveY !== role.Y()) {
                            const old_dis = bs.calDistance(role.X(), role.Y(), r2.X(), r2.Y());
                            const new_dis = bs.calDistance(aa.MoveX, aa.MoveY, r2.X(), r2.Y());
                            const point = 0.1 + old_dis / (new_dis + 1.0);
                            if (point > approach_point) {
                                approach_point = point;
                                approach_action = { ...aa, Action: this.getResultFromString('結束'), point };
                                has_approach_action = true;
                            }
                        }
                    }
                }
            }
            // the action with the highest score
            let max_point = -1;
            let has_positive_action = false;
            for (const aa of ai_action) {
                const r = Math.random() * 10;
                LOG(format('AI {}: {} {}{}score {:.2f}({:.2f})', role.Name, this.getStringFromResult(aa.Action),
                    aa.item ? aa.item.Name + ' ' : '', aa.magic ? aa.magic.Name + ' ' : '', aa.point, r));
                if (aa.point > 0) {
                    has_positive_action = true;
                }
                const p = aa.point + r;
                if (p > max_point) {
                    max_point = p;
                    this.setAIActionToRole(aa, role);
                }
            }
            if (!has_positive_action && has_approach_action) {
                this.setAIActionToRole(approach_action, role);
            } else if (has_approach_action && role.AI_Action === this.getResultFromString('結束')
                && role.AI_MoveX === role.X() && role.AI_MoveY === role.Y()) {
                this.setAIActionToRole(approach_action, role);
            }
        }
        if (!role.Moved && (role.AI_MoveX !== role.X() || role.AI_MoveY !== role.Y())) {
            return this.getResultFromString('移動');
        }
        return role.AI_Action;
    }

    setAIActionToRole(aa, role) {
        role.AI_Action = aa.Action;
        role.AI_MoveX = aa.MoveX;
        role.AI_MoveY = aa.MoveY;
        role.AI_ActionX = aa.ActionX;
        role.AI_ActionY = aa.ActionY;
        role.AI_Magic = aa.magic;
        role.AI_Item = aa.item;
    }

    calDistanceLayer(x, y, max_step = 64) {
        this.battle_scene_.calDistanceLayer(x, y, this.distance_layer_, max_step);
    }

    // the selectable position farthest from all the given roles
    getFarthestToAll(role, roles, x, y) {
        const bs = this.battle_scene_;
        let max_dis = 0;
        for (let ix = 0; ix < BATTLEMAP_COORD_COUNT; ix++) {
            for (let iy = 0; iy < BATTLEMAP_COORD_COUNT; iy++) {
                if (bs.canSelect(ix, iy)) {
                    let cur_dis = Math.random();
                    for (const r2 of roles) {
                        cur_dis += bs.calDistance(ix, iy, r2.X(), r2.Y());
                    }
                    if (cur_dis > max_dis) {
                        max_dis = cur_dis;
                        x = ix;
                        y = iy;
                    }
                }
            }
        }
        return [x, y];
    }

    getNearestPosition(x0, y0, x, y) {
        const bs = this.battle_scene_;
        this.calDistanceLayer(x0, y0);
        let min_dis = BATTLEMAP_COORD_COUNT * BATTLEMAP_COORD_COUNT;
        for (let ix = 0; ix < BATTLEMAP_COORD_COUNT; ix++) {
            for (let iy = 0; iy < BATTLEMAP_COORD_COUNT; iy++) {
                if (bs.canSelect(ix, iy)) {
                    const cur_dis = this.distance_layer_.data(ix, iy) + Math.random();
                    if (cur_dis < min_dis) {
                        min_dis = cur_dis;
                        x = ix;
                        y = iy;
                    }
                }
            }
        }
        return [x, y];
    }

    // returns the position nearer to the target, or null
    getApproachPosition(role, target) {
        if (!role || !target) {
            return null;
        }
        const bs = this.battle_scene_;
        bs.calSelectLayer(role, 0, bs.calMoveStep(role));
        let x = role.X();
        let y = role.Y();
        const old_dis = bs.calDistance(role.X(), role.Y(), target.X(), target.Y());
        let best_dis = old_dis;
        for (let ix = 0; ix < BATTLEMAP_COORD_COUNT; ix++) {
            for (let iy = 0; iy < BATTLEMAP_COORD_COUNT; iy++) {
                if (bs.canSelect(ix, iy)) {
                    const cur_dis = bs.calDistance(ix, iy, target.X(), target.Y());
                    if (cur_dis < best_dis) {
                        best_dis = cur_dis;
                        x = ix;
                        y = iy;
                    }
                }
            }
        }
        return best_dis < old_dis ? [x, y] : null;
    }

    getNearestRole(role, roles) {
        let min_dis = 4096;
        let r2 = null;
        for (const r of roles) {
            const cur_dis = this.battle_scene_.calRoleDistance(role, r);
            if (cur_dis < min_dis) {
                r2 = r;
                min_dis = cur_dis;
            }
        }
        return r2;
    }

    // the movable range must have been calculated
    calAIActionNearest(r2, aa, r_temp = null) {
        [aa.MoveX, aa.MoveY] = this.getNearestPosition(r2.X(), r2.Y(), aa.MoveX, aa.MoveY);
        aa.ActionX = r2.X();
        aa.ActionY = r2.Y();
        if (r_temp) {
            r_temp.setPositionOnly(aa.MoveX, aa.MoveY);
        }
    }

    calNeedActionDistance(aa) {
        return this.battle_scene_.calDistance(aa.MoveX, aa.MoveY, aa.ActionX, aa.ActionY);
    }
}
