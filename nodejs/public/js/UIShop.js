// UIShop (UIShop.cpp)
import { C, RI } from './Color.js';
import { Engine } from './Engine.js';
import { Event } from './Event.js';
import { Font } from './Font.js';
import * as K from './Keys.js';
import { NodePress } from './RunNode.js';
import { Save } from './Save.js';
import { Button, Menu, MenuText, TextBox } from './TextBox.js';
import { TextureManager } from './TextureManager.js';
import { Item, SHOP_ITEM_COUNT } from './Types.js';
import { format, textDrawSize } from './util.js';

const SHOP_BOX_X = -10;
const SHOP_BOX_Y = -3;
const SHOP_BOX_WIDTH = 620;
const SHOP_BOX_HEIGHT = 270;
const SHOP_MONEY_X = 30;
const SHOP_BUTTON_X = 330;
const SHOP_BUTTON_GAP = 90;
const SHOP_ROW_HEIGHT = 32;
const SHOP_ROW_WIDTH = 600;
const SHOP_PANEL_HEIGHT = 270;
const SHOP_TEXT_COLOR = C(48, 32, 16, 255);
const SHOP_TEXT_ACTIVE_COLOR = C(96, 24, 16, 255);
const SHOP_MONEY_WARNING_COLOR = C(180, 32, 24, 255);

let first_press = 0;

export class UIShop extends Menu {
    constructor() {
        super();
        this.shop_ = null;
        this.plan_buy_ = new Array(SHOP_ITEM_COUNT).fill(0);
        this.buttons_ = [];
        for (let i = 0; i < SHOP_ITEM_COUNT; i++) {
            const text = new Button();
            text.setFontSize(24);
            text.setSize(SHOP_ROW_WIDTH, SHOP_ROW_HEIGHT);
            text.setHaveBox(false);
            text.setTextColor(SHOP_TEXT_COLOR, SHOP_TEXT_ACTIVE_COLOR, SHOP_TEXT_ACTIVE_COLOR);
            this.addChild(text, 0, 30 + SHOP_ROW_HEIGHT * i);
            const left = new Button();
            text.addChild(left, 36 * 12 + 36, 5);
            left.setTexture('title', 104);
            this.buttons_.push(left);
            const right = new Button();
            text.addChild(right, 36 * 12 + 108, 5);
            right.setTexture('title', 105);
            this.buttons_.push(right);
        }
        const by = 30 + SHOP_ROW_HEIGHT * (SHOP_ITEM_COUNT + 1);
        this.button_ok_ = new Button();
        this.button_ok_.setText('確認');
        this.addChild(this.button_ok_, SHOP_BUTTON_X, by);
        this.button_cancel_ = new Button();
        this.button_cancel_.setText('取消');
        this.addChild(this.button_cancel_, SHOP_BUTTON_X + SHOP_BUTTON_GAP, by);
        this.button_clear_ = new Button();
        this.button_clear_.setText('清除');
        this.addChild(this.button_clear_, SHOP_BUTTON_X + SHOP_BUTTON_GAP * 2, by);
    }

    setShopID(id) {
        this.shop_ = Save.getShop(id);
    }

    async onEntrance() {
        this.setPosition(Math.trunc(Engine.getUIWidth() / 2 - SHOP_BOX_WIDTH / 2), Math.trunc(Engine.getUIHeight() / 2 - SHOP_PANEL_HEIGHT / 2));
    }

    draw() {
        Engine.fillColor(C(0, 0, 0, 128), 0, 0, -1, -1);
        const x = this.x_;
        const y = this.y_;
        const shop = this.shop_;
        if (!shop) {
            return;
        }
        TextureManager.renderTextureByName('title', 126, x + SHOP_BOX_X, y + SHOP_BOX_Y, RI(C(255, 255, 255, 255), 255), SHOP_BOX_WIDTH, SHOP_BOX_HEIGHT);
        Font.draw('品名             價格    存貨    持有    計劃', 24, x, y, C(200, 150, 50, 255));
        for (let i = 0; i < 5; i++) {
            const item = Save.getItem(shop.ItemID[i]);
            if (!item) {
                continue;
            }
            const count = Save.getItemCountInBag(item.ID);
            let str = item.Name + ' '.repeat(Math.abs(12 - textDrawSize(item.Name)));
            str += format('{:8}{:8}{:8}{:8}', shop.Price[i], shop.Total[i], count, this.plan_buy_[i]);
            this.getChild(i).setText(str);
        }
        const need = this.calNeedMoney();
        Font.draw(format('總計銀兩{:8}', need), 24, x + SHOP_MONEY_X, y + 30 + SHOP_ITEM_COUNT * SHOP_ROW_HEIGHT, SHOP_TEXT_COLOR);
        const money = Save.getMoneyCountInBag();
        Font.draw(format('持有銀兩{:8}', money), 24, x + SHOP_MONEY_X, y + 30 + (SHOP_ITEM_COUNT + 1) * SHOP_ROW_HEIGHT,
            money < need ? SHOP_MONEY_WARNING_COLOR : SHOP_TEXT_COLOR);
    }

    changePlan(index, lr) {
        if (lr === 0) {
            if (this.plan_buy_[index] > 0) {
                this.plan_buy_[index]--;
            }
        } else if (this.plan_buy_[index] < this.shop_.Total[index]) {
            this.plan_buy_[index]++;
        }
    }

    async dealEvent(e) {
        if (e.type === K.EVENT_KEY_DOWN && (e.key.key === K.K_LEFT || e.key.key === K.K_RIGHT) && this.active_child_ < SHOP_ITEM_COUNT) {
            if (first_press === 0 || first_press > 5) {
                this.changePlan(this.active_child_, e.key.key === K.K_LEFT ? 0 : 1);
            }
            first_press++;
        } else {
            await super.dealEvent(e);
        }
        if (e.type === K.EVENT_KEY_UP) {
            first_press = 0;
        }
    }

    async onPressedOK() {
        for (let i = 0; i < SHOP_ITEM_COUNT * 2; i++) {
            if (this.buttons_[i].getState() === NodePress) {
                this.changePlan(Math.trunc(i / 2), i % 2);
            }
        }
        if (this.button_ok_.getState() === NodePress) {
            if (this.calNeedMoney() <= Save.getMoneyCountInBag()) {
                const menu = new MenuText();
                menu.setStrings(['確認', '取消']);
                menu.setPosition(Math.trunc(Engine.getUIWidth() / 2) - 75, Math.trunc(Engine.getUIHeight() / 2) - 50);
                menu.setFontSize(24);
                menu.setHaveBox(true);
                menu.setText('確認購買？');
                menu.arrange(0, 50, 150, 0);
                if ((await menu.run()) === 0) {
                    for (let i = 0; i < SHOP_ITEM_COUNT; i++) {
                        await Event.getInstance().addItemWithoutHint(this.shop_.ItemID[i], this.plan_buy_[i]);
                        this.shop_.Total[i] -= this.plan_buy_[i];
                    }
                    await Event.getInstance().addItemWithoutHint(Item.MoneyItemID, -this.calNeedMoney());
                    this.exitWithResult(0);
                }
            } else {
                const text = new TextBox();
                text.setText('銀兩不足');
                text.setFontSize(24);
                text.setTextColor(SHOP_MONEY_WARNING_COLOR);
                await text.runAtPosition(Math.trunc(Engine.getUIWidth() / 2) - 60, Math.trunc(Engine.getUIHeight() / 2) - 12);
            }
        }
        if (this.button_cancel_.getState() === NodePress) {
            this.exitWithResult(-1);
        }
        if (this.button_clear_.getState() === NodePress) {
            this.plan_buy_.fill(0);
        }
    }

    async onPressedCancel() {
        this.exitWithResult(-1);
    }

    calNeedMoney() {
        let need = 0;
        for (let i = 0; i < SHOP_ITEM_COUNT; i++) {
            need += this.plan_buy_[i] * this.shop_.Price[i];
        }
        return need;
    }
}
