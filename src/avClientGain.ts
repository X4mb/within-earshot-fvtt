import { pushAvSessionLog } from './avSessionLog.js';

const lastClientState = new Map<string, string>();

/** Call when WebRTC peer disconnects so the next connection logs fresh state. */
export function clearClientGainStateForPeer(userId: string): void {
  lastClientState.delete(userId);
}

/**
 * Foundry stores per-remote-user hearing preferences (volume, mute, block) in client AV settings.
 * Default SimplePeer routes audio through the video element volume; we use Web Audio, so we must apply
 * the same factors on a GainNode.
 *
 * `getUser()` can report `volume: 0` before the A/V dock applies defaults — that silences everyone
 * on our graph. Treat numeric `<= 0` as full (then apply volume when > 0).
 *
 * **Web Audio:** per-user `muted` / `blocked` from the dock often does not match our routed stream
 * (same issue for GMs and players). Apply **volume** only; use **mute all** to silence everyone.
 */
export function getFoundryClientGainForPeer(userId: string): number {
  let tag: string;
  let result: number;

  const settings = game.webrtc?.settings;
  if (!settings) {
    tag = 'no_webrtc_settings';
    result = 1;
  } else if (settings.client.muteAll) {
    tag = 'muteAll';
    result = 0;
  } else {
    const u = settings.getUser(userId);
    if (!u) {
      tag = 'no_user_row';
      result = 1;
    } else {
      const v = u.volume;
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        tag = 'volume_invalid';
        result = 1;
      } else if (v <= 0) {
        tag = 'volume_zero_as_full';
        result = 1;
      } else {
        tag = 'volume';
        result = Math.min(1, Math.max(0, v));
      }
    }
  }

  const sig = `${tag}:${result}`;
  if (lastClientState.get(userId) !== sig) {
    lastClientState.set(userId, sig);
    pushAvSessionLog('clientGain', { userId, tag, result });
  }

  return result;
}
