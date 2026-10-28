// DrawNode and DrawableOnCall: small helper nodes (DrawNode.cpp, DrawableOnCall.cpp)
import { Font } from './Font.js';
import { RunNode } from './RunNode.js';
import { TextureManager } from './TextureManager.js';

export class DrawNode extends RunNode {
    constructor() {
        super();
        this.Infos = [];
    }

    clear() {
        this.Infos.length = 0;
    }

    draw() {
        for (const i of this.Infos) {
            if (i.type === 0) {
                Font.draw(i.text, 20, i.x, i.y);
            } else if (i.type === 1) {
                TextureManager.renderTextureByName(i.text, i.num, i.x, i.y);
            }
        }
    }
}

// draws through a user function, optionally handles events through another one
export class DrawableOnCall extends RunNode {
    constructor(draw, dealEvent = null) {
        super();
        this.draw_ = draw;
        this.deal_event_fn_ = dealEvent;
        this.entrance_ = null;
        this.id_ = -1;
    }

    async onEntrance() {
        if (this.entrance_) {
            await this.entrance_();
        }
    }

    setEntrance(f) {
        this.entrance_ = f;
    }

    setDealEventFunction(f) {
        this.deal_event_fn_ = f;
    }

    updateScreenWithID(id) {
        this.id_ = id;
    }

    getID() {
        return this.id_;
    }

    draw() {
        this.draw_(this);
    }

    async dealEvent(e) {
        if (this.deal_event_fn_) {
            await this.deal_event_fn_(this, e);
        }
    }
}
