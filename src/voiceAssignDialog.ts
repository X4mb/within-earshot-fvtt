import { getVoiceProfileForActor } from './voiceProfile.js';
import { persistVoiceProfileFlag } from './voiceProfileSet.js';
import { voiceChangerProcessor } from './voiceChangerProcessor.js';
import { getVoiceTokenIdFromUser } from './voiceToken.js';
import type { VoicePreset, VoiceProfile } from './voiceProfile.js';

const PRESETS: { value: VoicePreset; label: string }[] = [
  { value: 'none',    label: 'None (passthrough)' },
  { value: 'deep',    label: 'Deep' },
  { value: 'high',    label: 'High' },
  { value: 'robot',   label: 'Robot' },
  { value: 'whisper', label: 'Whisper' },
  { value: 'custom',  label: 'Custom' },
];

export function openVoiceAssignDialogForActor(actor: Actor): void {
  const profile = getVoiceProfileForActor(actor) ?? {};
  const currentPreset: VoicePreset = profile.preset ?? 'none';
  const pitchShift = profile.pitchShift ?? 0;
  const eqLowGain  = profile.eqLowGain  ?? 0;
  const eqHighGain = profile.eqHighGain ?? 0;

  const actorId   = (actor as Actor & { id: string }).id;
  const actorName = (actor as Actor & { name: string }).name;

  const presetOptions = PRESETS.map(
    (p) =>
      `<option value="${p.value}"${p.value === currentPreset ? ' selected' : ''}>${p.label}</option>`,
  ).join('');

  const content = `
    <form>
      <input type="hidden" name="actorId" value="${actorId}">
      <div class="form-group">
        <label><b>Voice Preset</b></label>
        <select name="preset" style="width:100%">${presetOptions}</select>
      </div>
      <div class="form-group" style="margin-top:8px">
        <label>Pitch shift (semitones): <span id="wea-pitch-val">${pitchShift}</span></label>
        <input type="range" name="pitchShift" min="-12" max="12" step="0.5"
               value="${pitchShift}" style="width:100%">
      </div>
      <div class="form-group" style="margin-top:8px">
        <label>Low shelf gain (dB): <span id="wea-low-val">${eqLowGain}</span></label>
        <input type="range" name="eqLowGain" min="-18" max="18" step="1"
               value="${eqLowGain}" style="width:100%">
      </div>
      <div class="form-group" style="margin-top:8px">
        <label>High shelf gain (dB): <span id="wea-high-val">${eqHighGain}</span></label>
        <input type="range" name="eqHighGain" min="-18" max="18" step="1"
               value="${eqHighGain}" style="width:100%">
      </div>
    </form>`;

  const D = Dialog as unknown as new (data: object, options?: object) => { render(force?: boolean): void };

  new D({
    title: `Assign Voice: ${actorName}`,
    content,
    default: 'save',
    render: (html: JQuery) => {
      html.find('input[name=pitchShift]').on('input', function (this: HTMLInputElement) {
        html.find('#wea-pitch-val').text(this.value);
      });
      html.find('input[name=eqLowGain]').on('input', function (this: HTMLInputElement) {
        html.find('#wea-low-val').text(this.value);
      });
      html.find('input[name=eqHighGain]').on('input', function (this: HTMLInputElement) {
        html.find('#wea-high-val').text(this.value);
      });
    },
    buttons: {
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: 'Save',
        callback: async (html: JQuery) => {
          const form = html.find('form')[0] as HTMLFormElement;
          const fd = new FormData(form);
          const targetActorId = fd.get('actorId') as string;
          const targetActor = targetActorId ? game.actors?.get(targetActorId) : null;
          if (!targetActor) return;

          // Spread the stored profile first: fields this dialog doesn't edit (gainMultiplier,
          // set via the module API) must survive a save.
          const newProfile: VoiceProfile = {
            ...(getVoiceProfileForActor(targetActor) ?? {}),
            preset:     (fd.get('preset')     as VoicePreset) ?? 'none',
            pitchShift: parseFloat(fd.get('pitchShift') as string) || 0,
            eqLowGain:  parseFloat(fd.get('eqLowGain')  as string) || 0,
            eqHighGain: parseFloat(fd.get('eqHighGain') as string) || 0,
          };

          await persistVoiceProfileFlag(targetActor, newProfile);

          if (game.user?.isGM && voiceChangerProcessor.isInitialized()) {
            const pinnedId = getVoiceTokenIdFromUser(game.user);
            if (pinnedId) {
              const pinnedDoc = canvas?.scene?.tokens.get(pinnedId);
              if (pinnedDoc?.actor?.id === targetActor.id) {
                void voiceChangerProcessor.applyProfile(newProfile).catch((err: unknown) => {
                  ui.notifications?.warn(
                    `Within Earshot: could not apply voice — ${String(err)}`,
                  );
                });
              }
            }
          }
        },
      },
      cancel: { label: 'Cancel' },
    },
  }).render(true);
}
