import { FLAG_VOICE_TOKEN_ID, MODULE_ID } from './constants.js';
import { loc } from './settings.js';

export function canUserPickVoiceToken(user: User, token: Token): boolean {
  if (user.isGM) return true;
  return token.document.testUserPermission(user, 'OWNER');
}

export function getVoiceTokenIdFromUser(user: User): string | null {
  const v = (user as User & { getFlag(ns: string, key: string): unknown }).getFlag(
    MODULE_ID,
    FLAG_VOICE_TOKEN_ID,
  ) as string | null | undefined;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Scene token document for this user’s voice position (explicit pin, else primary / sole-owned).
 * Uses embedded scene data so the speaker is still resolved when their token is **not visible**
 * to the current client (e.g. behind a wall). Proximity audio must not depend on `token.visible`.
 */
export function getSpeakerTokenDocumentForUser(remoteUser: User): TokenDocument | null {
  const pinId = getVoiceTokenIdFromUser(remoteUser);
  if (pinId && canvas?.scene) {
    const pinned = canvas.scene.tokens.get(pinId);
    if (pinned) return pinned;
  }

  if (!canvas?.scene) return null;

  const actor = remoteUser.character;
  if (actor) {
    const docs = Array.from(canvas.scene.tokens).filter((d) => d.actor?.id === actor.id);
    if (docs.length === 0) return null;
    const owned = docs.filter((d) => d.testUserPermission(remoteUser, 'OWNER'));
    const pool = owned.length > 0 ? owned : docs;
    pool.sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));
    return pool[0] ?? null;
  }

  /** No assigned actor: pick a deterministic owned token (same scene as listener primary fallback). */
  const ownedDocs = Array.from(canvas.scene.tokens).filter((d) => d.testUserPermission(remoteUser, 'OWNER'));
  if (ownedDocs.length === 0) return null;
  ownedDocs.sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));
  return ownedDocs[0] ?? null;
}

/** Prefer {@link getSpeakerTokenDocumentForUser} when you need a position even if `visible` is false. */
export function getSpeakerTokenForUser(remoteUser: User): Token | null {
  const doc = getSpeakerTokenDocumentForUser(remoteUser);
  if (!doc || !canvas?.tokens) return null;
  const sid = doc.id;
  if (!sid) return null;
  return canvas.tokens.get(sid) ?? null;
}

/**
 * Token to draw the local voice ring on. GMs with no pinned voice token (shortcut cleared)
 * use omnipresent voice — no ring. Players always use {@link getSpeakerTokenForUser}.
 */
export function getVoiceSourceTokenForDisplay(user: User): Token | null {
  if (user.isGM && !getVoiceTokenIdFromUser(user)) return null;
  return getSpeakerTokenForUser(user);
}

/** Clear persisted voice-token pin when the world loads so stale ids cannot mute voice or mis-locate audio. */
export async function clearVoiceTokenFlagForCurrentUser(): Promise<void> {
  const user = game.user as (User & { unsetFlag(ns: string, key: string): Promise<User> }) | undefined;
  if (!user?.unsetFlag) return;
  try {
    await user.unsetFlag(MODULE_ID, FLAG_VOICE_TOKEN_ID);
  } catch {
    /* ignore */
  }
}

export async function toggleVoiceTokenForCurrentUser(token: Token): Promise<void> {
  const user = game.user;
  if (!user) return;
  if (!canUserPickVoiceToken(user, token)) {
    ui.notifications?.warn(loc(`${MODULE_ID}.VOICE.cannotPick`, 'You can only set your voice token to a token you own.'));
    return;
  }
  const current = getVoiceTokenIdFromUser(user);
  const next = current === token.id ? null : token.id;
  const u = user as User & {
    unsetFlag(ns: string, key: string): Promise<User>;
    setFlag(ns: string, key: string, v: unknown): Promise<User>;
  };
  try {
    if (next === null) await u.unsetFlag(MODULE_ID, FLAG_VOICE_TOKEN_ID);
    else await u.setFlag(MODULE_ID, FLAG_VOICE_TOKEN_ID, next);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ui.notifications?.error(`Within Earshot: could not save voice token (${msg})`);
    return;
  }
  const name = token.name ?? token.document.name;
  const msg =
    next === null
      ? loc(`${MODULE_ID}.VOICE.cleared`, 'Voice position: automatic (assigned character token).')
      : loc(`${MODULE_ID}.VOICE.set`, 'Voice position: speaking as {name}.').replace('{name}', name);
  ui.notifications?.info(msg);
}
