export const PREFIX_TIMEOUT_MS = 1000;

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

export function isModifierKey(key) {
    return MODIFIER_KEYS.has(key);
}
