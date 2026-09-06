/**
 * Must match module.json `id`: keybinding (and thus settings-namespace) registration is validated
 * against the active module id. Test branch uses 'withinearshot-test' so both installs can coexist.
 */
export const MODULE_ID = 'withinearshot-test';

/**
 * i18n namespace for lang/*.json keys. Deliberately decoupled from MODULE_ID (which differs between
 * the live and test builds) so the same language file works on both branches, and uppercase per
 * Foundry convention (e.g. DND5E) to avoid colliding with other packages' top-level keys.
 */
export const I18N_NS = 'WITHINEARSHOT';

/** User flag: scene token id this user speaks from for proximity (null = use default primary token). */
export const FLAG_VOICE_TOKEN_ID = 'voiceTokenId';

/** Single PIXI.Graphics on canvas.tokens for voice source outline (persists across token.refresh). */
export const VOICE_INDICATOR_LAYER = 'withinearshotVoiceIndicator';
