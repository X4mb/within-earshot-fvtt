import { MODULE_ID } from './constants.js';
import { loc } from './settings.js';
import { scheduleProximityRefresh } from './proximityAudioRouter.js';
import { scheduleVoiceIndicatorRedraw } from './voiceIndicatorLayer.js';
import { toggleVoiceTokenForCurrentUser } from './voiceToken.js';

/**
 * Must run from `init` (same as other keybindings). Do not add non-Token children to
 * `canvas.tokens.objects` — D&D5e TokenLayer5e only allows Token5e there.
 */
export function registerVoiceTokenKeybinding(): void {
  game.keybindings?.register(MODULE_ID, 'toggleVoiceToken', {
    name: loc(`${MODULE_ID}.SETTINGS.toggleVoiceToken.name`, 'Toggle voice token (selected)'),
    hint: loc(
      `${MODULE_ID}.SETTINGS.toggleVoiceToken.hint`,
      'While controlling a token, toggle whether your voice is positioned at that token (or clear to default).',
    ),
    editable: [{ key: 'KeyV', modifiers: ['CONTROL', 'SHIFT'] }],
    onDown: () => {
      if (!canvas?.ready || !canvas.tokens) return;
      const token = canvas.tokens.controlled[0];
      if (!token) {
        ui.notifications?.warn(
          loc(`${MODULE_ID}.VOICE.needSelection`, 'Select a token first (control it), then press the keybinding.'),
        );
        return;
      }
      void toggleVoiceTokenForCurrentUser(token).then(() => {
        token.refresh();
        scheduleVoiceIndicatorRedraw();
        scheduleProximityRefresh();
      });
    },
  });
}
