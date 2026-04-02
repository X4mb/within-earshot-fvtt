import { MODULE_ID } from './constants.js';
import {
  clearAvSessionLog,
  copyAvSessionLogToClipboard,
  getAvSessionLogSnapshot,
} from './avSessionLog.js';
import { ProximitySimplePeerAVClient } from './ProximitySimplePeerAVClient.js';
import { proximityRouter, scheduleProximityRefresh } from './proximityAudioRouter.js';
import { clearVoiceTokenFlagForCurrentUser } from './voiceToken.js';
import {
  getGmVoiceGlobal,
  registerModuleKeybindings,
  registerModuleSettings,
  SETTINGS,
} from './settings.js';
import { getVoiceProfileForActor } from './voiceProfile.js';
import { persistVoiceProfileFlag } from './voiceProfileSet.js';
import type { VoiceProfile } from './voiceProfile.js';
import { registerVoiceTokenKeybinding } from './voiceTokenInput.js';
import {
  destroyVoiceIndicatorLayer,
  redrawVoiceIndicator,
  scheduleVoiceIndicatorRedraw,
} from './voiceIndicatorLayer.js';

const BaseClient = foundry.av.clients.SimplePeerAVClient;

/** Indicator follows the token every frame; gain updates are throttled inside the router. */
let canvasPositionTicker: ((dt?: number) => void) | undefined;

function registerCanvasPositionTicker(): void {
  unregisterCanvasPositionTicker();
  const app = canvas?.app;
  if (!app?.ticker) return;
  canvasPositionTicker = () => {
    if (!canvas?.ready) return;
    redrawVoiceIndicator();
    /** Keep gains aligned with token positions every frame (no artificial 125ms delay). */
    proximityRouter.refreshAllGains();
  };
  /** Run after NORMAL-priority updates (e.g. movement tweens) so positions match the mesh. */
  const afterMove = (PIXI as typeof PIXI & { UPDATE_PRIORITY?: { LOW: number } }).UPDATE_PRIORITY?.LOW ?? -25;
  app.ticker.add(canvasPositionTicker, undefined, afterMove);
}

function unregisterCanvasPositionTicker(): void {
  const app = canvas?.app;
  if (canvasPositionTicker && app?.ticker) app.ticker.remove(canvasPositionTicker);
  canvasPositionTicker = undefined;
}

Hooks.once('init', () => {
  CONFIG.WebRTC.clientClass = ProximitySimplePeerAVClient as typeof BaseClient;
  // Foundry requires keybindings to be registered during init (not ready), or setup throws.
  registerModuleKeybindings();
  registerVoiceTokenKeybinding();
});

Hooks.once('ready', async () => {
  registerModuleSettings();
  await clearVoiceTokenFlagForCurrentUser();

  const H = Hooks as unknown as { on(hook: string, fn: (...args: unknown[]) => void): number };
  H.on('controlObject', () => {
    scheduleProximityRefresh();
    scheduleVoiceIndicatorRedraw();
  });
  H.on('targetToken', () => {
    scheduleProximityRefresh();
    scheduleVoiceIndicatorRedraw();
  });
  H.on('canvasReady', () => {
    scheduleProximityRefresh();
    scheduleVoiceIndicatorRedraw();
    registerCanvasPositionTicker();
  });
  H.on('canvasTearDown', () => {
    unregisterCanvasPositionTicker();
    destroyVoiceIndicatorLayer();
    proximityRouter.detachAll();
  });
  H.on('canvasPan', () => {
    scheduleProximityRefresh();
    scheduleVoiceIndicatorRedraw();
  });
  H.on('updateToken', () => {
    scheduleProximityRefresh();
    scheduleVoiceIndicatorRedraw();
  });
  H.on('moveToken', () => {
    scheduleProximityRefresh();
    scheduleVoiceIndicatorRedraw();
  });
  H.on('rtcSettingsChanged', scheduleProximityRefresh);
  H.on('visibilityRefresh', scheduleProximityRefresh);
  for (const h of ['createWall', 'updateWall', 'deleteWall'] as const) {
    H.on(h, scheduleProximityRefresh);
  }
  H.on('refreshToken', () => {
    scheduleProximityRefresh();
    scheduleVoiceIndicatorRedraw();
  });
  H.on('updateUser', (...args: unknown[]) => {
    const user = args[0] as User;
    const change = args[1] as { flags?: Record<string, Record<string, unknown>> };
    if (change.flags?.[MODULE_ID] !== undefined) {
      scheduleProximityRefresh();
      if (user.id === game.user?.id) scheduleVoiceIndicatorRedraw();
    }
  });
  H.on('updateActor', (...args: unknown[]) => {
    const doc = args[0] as Actor;
    const change = args[1] as Record<string, unknown>;
    const flags = change.flags as Record<string, Record<string, unknown>> | undefined;
    if (flags?.[MODULE_ID]?.voiceProfile) {
      const uid = game.users?.find((u) => u.character?.id === doc.id)?.id;
      if (uid) {
        proximityRouter.updateProfileGainForUser(uid);
        scheduleProximityRefresh();
      }
    }
  });
  window.addEventListener('pointerdown', () => void proximityRouter.ensureResumed(), { once: true });

  async function setVoiceProfileForActor(actor: Actor, profile: VoiceProfile | null): Promise<void> {
    await persistVoiceProfileFlag(actor, profile);
    const uid = game.users?.find((u) => u.character?.id === actor.id)?.id;
    if (uid) {
      proximityRouter.updateProfileGainForUser(uid);
      scheduleProximityRefresh();
    }
  }

  const mod = game.modules?.get(MODULE_ID);
  if (mod)
    (mod as { api?: Record<string, unknown> }).api = {
      getVoiceProfileForActor,
      setVoiceProfileForActor,
      scheduleProximityRefresh,
      getAvSessionLog: getAvSessionLogSnapshot,
      clearAvSessionLog,
      copyAvSessionLogToClipboard,
    };
});

(Hooks as unknown as { on(hook: string, fn: (...args: unknown[]) => void): number }).on(
  'clientSettingChanged',
  (...args: unknown[]) => {
    const [namespace, key] = args as [string, string];
    if (
      namespace === MODULE_ID &&
      (key === SETTINGS.GM_VOICE_GLOBAL ||
        key === SETTINGS.MAX_RANGE ||
        key === SETTINGS.THROUGH_WALL_GAIN ||
        key === SETTINGS.MUTE_UNRESOLVED_SPEAKER)
    )
      scheduleProximityRefresh();
    /** Per-user A/V volume & mute live under core rtc client settings (not always covered by rtcSettingsChanged). */
    if (namespace === 'core' && key === 'rtcClientSettings') scheduleProximityRefresh();
  },
);
