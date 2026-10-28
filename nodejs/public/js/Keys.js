// Constants mirroring the SDL3 values used by the C++ engine (Engine.h), so key
// settings stored in kysmod.ini stay compatible.

export const EVENT_FIRST = 0;
export const EVENT_QUIT = 0x100;
export const EVENT_WILL_ENTER_BACKGROUND = 0x103;
export const EVENT_DID_ENTER_BACKGROUND = 0x104;
export const EVENT_WILL_ENTER_FOREGROUND = 0x105;
export const EVENT_DID_ENTER_FOREGROUND = 0x106;
export const EVENT_WINDOW_RESIZED = 0x206;
export const EVENT_WINDOW_PIXEL_SIZE_CHANGED = 0x207;
export const EVENT_WINDOW_MAXIMIZED = 0x20a;
export const EVENT_WINDOW_RESTORED = 0x20b;
export const EVENT_WINDOW_CLOSE_REQUESTED = 0x210;
export const EVENT_KEY_DOWN = 0x300;
export const EVENT_KEY_UP = 0x301;
export const EVENT_TEXT_EDITING = 0x302;
export const EVENT_TEXT_INPUT = 0x303;
export const EVENT_MOUSE_MOTION = 0x400;
export const EVENT_MOUSE_BUTTON_DOWN = 0x401;
export const EVENT_MOUSE_BUTTON_UP = 0x402;
export const EVENT_MOUSE_WHEEL = 0x403;
export const EVENT_GAMEPAD_AXIS_MOTION = 0x650;
export const EVENT_GAMEPAD_BUTTON_DOWN = 0x651;
export const EVENT_GAMEPAD_BUTTON_UP = 0x652;
export const EVENT_GAMEPAD_ADDED = 0x653;
export const EVENT_GAMEPAD_REMOVED = 0x654;
export const EVENT_FINGER_DOWN = 0x700;
export const EVENT_FINGER_UP = 0x701;
export const EVENT_FINGER_MOTION = 0x702;

const S = (n) => (0x40000000 | n) >>> 0;
export const K_UNKNOWN = 0;
export const K_RETURN = 13;
export const K_ESCAPE = 27;
export const K_BACKSPACE = 8;
export const K_TAB = 9;
export const K_SPACE = 32;
export const K_PLUS = 43;
export const K_COMMA = 44;
export const K_MINUS = 45;
export const K_PERIOD = 46;
export const K_EQUALS = 61;
export const K_0 = 48;
export const K_1 = 49;
export const K_2 = 50;
export const K_3 = 51;
export const K_4 = 52;
export const K_5 = 53;
export const K_6 = 54;
export const K_7 = 55;
export const K_8 = 56;
export const K_9 = 57;
export const K_A = 97;
export const K_B = 98;
export const K_C = 99;
export const K_D = 100;
export const K_E = 101;
export const K_F = 102;
export const K_G = 103;
export const K_H = 104;
export const K_I = 105;
export const K_J = 106;
export const K_K = 107;
export const K_L = 108;
export const K_M = 109;
export const K_N = 110;
export const K_O = 111;
export const K_P = 112;
export const K_Q = 113;
export const K_R = 114;
export const K_S = 115;
export const K_T = 116;
export const K_U = 117;
export const K_V = 118;
export const K_W = 119;
export const K_X = 120;
export const K_Y = 121;
export const K_Z = 122;
export const K_DELETE = 127;
export const K_F1 = S(0x3a);
export const K_INSERT = S(0x49);
export const K_HOME = S(0x4a);
export const K_PAGEUP = S(0x4b);
export const K_END = S(0x4d);
export const K_PAGEDOWN = S(0x4e);
export const K_RIGHT = S(0x4f);
export const K_LEFT = S(0x50);
export const K_DOWN = S(0x51);
export const K_UP = S(0x52);
export const K_LCTRL = S(0xe0);
export const K_LSHIFT = S(0xe1);
export const K_LALT = S(0xe2);
export const K_RCTRL = S(0xe4);
export const K_RSHIFT = S(0xe5);
export const K_RALT = S(0xe6);

const CODE_MAP = {
    Enter: K_RETURN,
    NumpadEnter: K_RETURN,
    Escape: K_ESCAPE,
    Backspace: K_BACKSPACE,
    Tab: K_TAB,
    Space: K_SPACE,
    Minus: K_MINUS,
    NumpadSubtract: K_MINUS,
    Equal: K_EQUALS,
    NumpadAdd: K_PLUS,
    Comma: K_COMMA,
    Period: K_PERIOD,
    Delete: K_DELETE,
    Insert: K_INSERT,
    Home: K_HOME,
    End: K_END,
    PageUp: K_PAGEUP,
    PageDown: K_PAGEDOWN,
    ArrowRight: K_RIGHT,
    ArrowLeft: K_LEFT,
    ArrowDown: K_DOWN,
    ArrowUp: K_UP,
    ControlLeft: K_LCTRL,
    ShiftLeft: K_LSHIFT,
    AltLeft: K_LALT,
    ControlRight: K_RCTRL,
    ShiftRight: K_RSHIFT,
    AltRight: K_RALT,
    Slash: 47,
    Semicolon: 59,
    Quote: 39,
    BracketLeft: 91,
    Backslash: 92,
    BracketRight: 93,
    Backquote: 96,
};

export function keyFromBrowser(e) {
    const code = e.code || '';
    if (/^Key[A-Z]$/.test(code)) {
        return code.charCodeAt(3) + 32;
    }
    if (/^Digit[0-9]$/.test(code)) {
        return code.charCodeAt(5);
    }
    if (/^Numpad[0-9]$/.test(code)) {
        return code.charCodeAt(6);
    }
    if (/^F([1-9]|1[0-2])$/.test(code)) {
        return S(0x3a + Number(code.slice(1)) - 1);
    }
    if (CODE_MAP[code] !== undefined) {
        return CODE_MAP[code];
    }
    if (e.key && e.key.length === 1) {
        return e.key.toLowerCase().charCodeAt(0);
    }
    return K_UNKNOWN;
}

// SDL_GetKeyName-like names for the key configuration screen
export function keyName(k) {
    for (const [name, v] of Object.entries(CODE_MAP)) {
        if (v === k) {
            return name.replace(/^Arrow/, '').replace(/^Numpad/, '');
        }
    }
    if (k >= 32 && k < 127) {
        return String.fromCharCode(k).toUpperCase();
    }
    if (k >= K_F1 && k < K_F1 + 12) {
        return `F${k - K_F1 + 1}`;
    }
    return '';
}

export const BUTTON_LEFT = 1;
export const BUTTON_MIDDLE = 2;
export const BUTTON_RIGHT = 3;

export const GAMEPAD_BUTTON_INVALID = -1;
export const GAMEPAD_BUTTON_SOUTH = 0;
export const GAMEPAD_BUTTON_EAST = 1;
export const GAMEPAD_BUTTON_WEST = 2;
export const GAMEPAD_BUTTON_NORTH = 3;
export const GAMEPAD_BUTTON_BACK = 4;
export const GAMEPAD_BUTTON_GUIDE = 5;
export const GAMEPAD_BUTTON_START = 6;
export const GAMEPAD_BUTTON_LEFT_STICK = 7;
export const GAMEPAD_BUTTON_RIGHT_STICK = 8;
export const GAMEPAD_BUTTON_LEFT_SHOULDER = 9;
export const GAMEPAD_BUTTON_RIGHT_SHOULDER = 10;
export const GAMEPAD_BUTTON_DPAD_UP = 11;
export const GAMEPAD_BUTTON_DPAD_DOWN = 12;
export const GAMEPAD_BUTTON_DPAD_LEFT = 13;
export const GAMEPAD_BUTTON_DPAD_RIGHT = 14;
export const GAMEPAD_BUTTON_COUNT = 26;

export const GAMEPAD_AXIS_LEFTX = 0;
export const GAMEPAD_AXIS_LEFTY = 1;
export const GAMEPAD_AXIS_RIGHTX = 2;
export const GAMEPAD_AXIS_RIGHTY = 3;
export const GAMEPAD_AXIS_LEFT_TRIGGER = 4;
export const GAMEPAD_AXIS_RIGHT_TRIGGER = 5;
export const GAMEPAD_AXIS_COUNT = 6;

// W3C "standard" gamepad mapping index -> SDL gamepad button
export const STANDARD_TO_SDL_BUTTON = [
    GAMEPAD_BUTTON_SOUTH, GAMEPAD_BUTTON_EAST, GAMEPAD_BUTTON_WEST, GAMEPAD_BUTTON_NORTH,
    GAMEPAD_BUTTON_LEFT_SHOULDER, GAMEPAD_BUTTON_RIGHT_SHOULDER, -1, -1,
    GAMEPAD_BUTTON_BACK, GAMEPAD_BUTTON_START, GAMEPAD_BUTTON_LEFT_STICK, GAMEPAD_BUTTON_RIGHT_STICK,
    GAMEPAD_BUTTON_DPAD_UP, GAMEPAD_BUTTON_DPAD_DOWN, GAMEPAD_BUTTON_DPAD_LEFT, GAMEPAD_BUTTON_DPAD_RIGHT,
    GAMEPAD_BUTTON_GUIDE,
];

export const BLENDMODE_NONE = 0;
export const BLENDMODE_BLEND = 1;
export const BLENDMODE_BLEND_PREMULTIPLIED = 0x10;
export const BLENDMODE_ADD = 2;
export const BLENDMODE_ADD_PREMULTIPLIED = 0x20;
export const BLENDMODE_MOD = 4;
export const BLENDMODE_MUL = 8;

export const ALIGN_LEFT = 0;
export const ALIGN_MIDDLE = 1;
export const ALIGN_RIGHT = 2;
