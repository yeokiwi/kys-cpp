// Color and TextureRenderInfo helpers (SDL_Color and the aggregate initializers
// used in the C++ code, e.g. `{ ambient_color, 255, 1, 1, 0, 0, color_v, brightness_v }`).

export function C(r, g, b, a = 255) {
    return { r, g, b, a };
}

export const WHITE = Object.freeze(C(255, 255, 255, 255));

export function copyColor(c) {
    return { r: c.r, g: c.g, b: c.b, a: c.a ?? 255 };
}

// TextureManager::RenderInfo, positional like the C++ aggregate
export function RI(c = WHITE, alpha = 255, zoom_x = 1, zoom_y = 1, angle = 0, white = 0, color_v = null, brightness_v = null) {
    return { c, alpha, zoom_x, zoom_y, angle, white, color_v: color_v || [], brightness_v: brightness_v || [] };
}

export const DEFAULT_RI = Object.freeze(RI());

export function fillArray(n, v) {
    return new Array(n).fill(v);
}
