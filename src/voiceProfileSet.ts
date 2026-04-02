import { MODULE_ID } from './constants.js';
import type { VoiceProfile } from './voiceProfile.js';

/** Persist `flags[moduleId].voiceProfile` on the actor (no audio refresh; use module API for that). */
export async function persistVoiceProfileFlag(
  actor: Actor,
  profile: VoiceProfile | null,
): Promise<void> {
  const a = actor as Actor & {
    setFlag(ns: string, key: string, v: unknown): Promise<Actor>;
    unsetFlag(ns: string, key: string): Promise<Actor>;
  };
  if (profile === null) await a.unsetFlag(MODULE_ID, 'voiceProfile');
  else await a.setFlag(MODULE_ID, 'voiceProfile', profile);
}
