import { MODULE_ID } from './constants.js';

/**
 * Per-actor voice settings (Phase 2). `gainMultiplier` is applied before proximity attenuation.
 * Extend this object and the audio router when adding filters / pitch.
 */
export interface VoiceProfile {
  gainMultiplier?: number;
}

export function getVoiceProfileForActor(actor: Actor | null | undefined): VoiceProfile | null {
  if (!actor) return null;
  const data = (actor as Actor & { getFlag(ns: string, key: string): unknown }).getFlag(
    MODULE_ID,
    'voiceProfile',
  );
  if (!data || typeof data !== 'object') return null;
  return data as VoiceProfile;
}
