import { MODULE_ID } from './constants.js';

type SettingsAPI = {
  register(namespace: string, key: string, data: Record<string, unknown>): void;
  get(namespace: string, key: string): unknown;
  set(namespace: string, key: string, value: unknown): Promise<unknown>;
};

function s(): SettingsAPI {
  return game.settings as unknown as SettingsAPI;
}

/** Resolve i18n key when module lang is loaded; otherwise show English fallback. */
export function loc(key: string, fallback: string): string {
  const v = game.i18n?.localize(key) ?? key;
  return v === key ? fallback : v;
}

export const SETTINGS = {
  MAX_RANGE: 'maxRange',
  GM_VOICE_GLOBAL: 'gmVoiceGlobal',
  /** 1 = no muffling through walls; 0.05 default (heavy muffling). World scope = GM only. */
  THROUGH_WALL_GAIN: 'throughWallGain',
  /**
   * World (GM): when true, non-GM speakers with no resolvable token on the scene are silent to other
   * players (GM still hears everyone). When false (default), they are heard at full volume until a token exists.
   */
  MUTE_UNRESOLVED_SPEAKER: 'muteUnresolvedSpeaker',
} as const;

export function registerModuleSettings(): void {
  s().register(MODULE_ID, SETTINGS.MAX_RANGE, {
    name: loc(`${MODULE_ID}.SETTINGS.maxRange.name`, 'Maximum range (grid units)'),
    hint: loc(
      `${MODULE_ID}.SETTINGS.maxRange.hint`,
      'Beyond this many grid spaces (Foundry ruler units). One unit = one map cell.',
    ),
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 1, max: 500, step: 1 },
    default: 15,
  });

  s().register(MODULE_ID, SETTINGS.GM_VOICE_GLOBAL, {
    name: loc(`${MODULE_ID}.SETTINGS.gmVoiceGlobal.name`, 'GM voice: full volume everywhere'),
    hint: loc(
      `${MODULE_ID}.SETTINGS.gmVoiceGlobal.hint`,
      'When enabled, the GM is always heard at full volume (no proximity). When disabled, the GM uses token proximity like everyone else.',
    ),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  s().register(MODULE_ID, SETTINGS.THROUGH_WALL_GAIN, {
    name: loc(`${MODULE_ID}.SETTINGS.throughWallGain.name`, 'Voice through walls'),
    hint: loc(
      `${MODULE_ID}.SETTINGS.throughWallGain.hint`,
      'World setting (GM only). How much volume remains after a Normal sound wall. 1 = no muffling; lower = quieter through walls. Limited / Proximity / Distance scale from this.',
    ),
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 0.05, max: 1, step: 0.05 },
    default: 0.05,
  });

  s().register(MODULE_ID, SETTINGS.MUTE_UNRESOLVED_SPEAKER, {
    name: loc(`${MODULE_ID}.SETTINGS.muteUnresolvedSpeaker.name`, 'Mute voice when speaker token unknown'),
    hint: loc(
      `${MODULE_ID}.SETTINGS.muteUnresolvedSpeaker.hint`,
      'When enabled, a player whose speaking position cannot be placed on the map (no character token, etc.) is inaudible to other players; the GM still hears them. When disabled, they are heard at full volume until a token can be resolved (recommended for reliability).',
    ),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

}

/** Must run from the `init` hook only — Foundry forbids registering keybindings after init. */
export function registerModuleKeybindings(): void {
  game.keybindings?.register(MODULE_ID, 'toggleGMVoiceGlobal', {
    name: loc(`${MODULE_ID}.SETTINGS.toggleGMVoiceGlobal.name`, 'Toggle GM voice (global vs token proximity)'),
    hint: loc(
      `${MODULE_ID}.SETTINGS.toggleGMVoiceGlobal.hint`,
      'GM only: switch between global GM voice and token-based proximity.',
    ),
    onDown: () => {
      if (!game.user?.isGM) return;
      void setGmVoiceGlobal(!getGmVoiceGlobal());
    },
  });
}

export function getMaxRange(): number {
  const v = s().get(MODULE_ID, SETTINGS.MAX_RANGE);
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 15;
  return Math.min(500, Math.max(1, n));
}

export function getGmVoiceGlobal(): boolean {
  return s().get(MODULE_ID, SETTINGS.GM_VOICE_GLOBAL) as boolean;
}

export function setGmVoiceGlobal(v: boolean): Promise<unknown> {
  return s().set(MODULE_ID, SETTINGS.GM_VOICE_GLOBAL, v);
}

export function getThroughWallGain(): number {
  const v = s().get(MODULE_ID, SETTINGS.THROUGH_WALL_GAIN);
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0.05;
  return Math.min(1, Math.max(0.05, n));
}

/** When true, missing speaker token doc → mute for non-GM listeners (see proximity router). */
export function getMuteUnresolvedSpeaker(): boolean {
  try {
    return Boolean(s().get(MODULE_ID, SETTINGS.MUTE_UNRESOLVED_SPEAKER));
  } catch {
    return false;
  }
}
