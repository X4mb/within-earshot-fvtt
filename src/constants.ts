/**
 * Must match module.json `id`: keybinding (and thus settings-namespace) registration is validated
 * against the active module id. Test branch uses 'withinearshot-test' so both installs can coexist.
 */
export const MODULE_ID = 'withinearshot-test';

/** User flag: scene token id this user speaks from for proximity (null = use default primary token). */
export const FLAG_VOICE_TOKEN_ID = 'voiceTokenId';

/** Single PIXI.Graphics on canvas.tokens for voice source outline (persists across token.refresh). */
export const VOICE_INDICATOR_LAYER = 'withinearshotVoiceIndicator';
