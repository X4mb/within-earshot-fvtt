import { MODULE_ID } from './constants.js';

export type VoicePreset = 'none' | 'deep' | 'high' | 'robot' | 'whisper' | 'custom';

export interface VoiceProfile {
  gainMultiplier?: number;
  preset?: VoicePreset;
  pitchShift?: number;
  eqLowGain?: number;
  eqHighGain?: number;
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
