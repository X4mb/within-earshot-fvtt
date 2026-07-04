import { getVoiceProfileForActor } from './voiceProfile.js';
import { persistVoiceProfileFlag } from './voiceProfileSet.js';
import { voiceChangerProcessor } from './voiceChangerProcessor.js';
import { voicePreviewer } from './voicePreview.js';
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

/** True when the GM's live outgoing voice currently uses this actor's profile (pinned token). */
function isLiveVoiceActor(actorId: string): boolean {
  if (!game.user?.isGM || !voiceChangerProcessor.isInitialized()) return false;
  const pinnedId = getVoiceTokenIdFromUser(game.user);
  if (!pinnedId) return false;
  const pinnedDoc = canvas?.scene?.tokens.get(pinnedId);
  return pinnedDoc?.actor?.id === actorId;
}

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

  const canMuteLive = !!game.user?.isGM && voiceChangerProcessor.isInitialized();
  const muteHint = canMuteLive
    ? '<p class="notes" style="margin:0 0 6px"><i class="fas fa-volume-mute"></i> Players cannot hear you while this window is open.</p>'
    : '';

  const content = `
    <form>
      <input type="hidden" name="actorId" value="${actorId}">
      ${muteHint}
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
      <div class="form-group" style="margin-top:12px">
        <button type="button" id="wea-preview-btn" style="width:100%">
          <i class="fas fa-headphones"></i> Preview my voice
        </button>
        <p class="notes" style="margin:4px 0 0">
          Hear yourself with these settings, live as you adjust them. Always open mic —
          push-to-talk does not apply here. Use headphones — on speakers the mic picks the
          playback up again.
        </p>
      </div>
    </form>`;

  const D = Dialog as unknown as new (data: object, options?: object) => { render(force?: boolean): void };

  // Mute the GM's outgoing chain for the whole lifetime of the dialog: settings are applied to
  // the live voice as they change, and players must not hear the tuning happen.
  if (canMuteLive) voiceChangerProcessor.setOutputMuted(true);

  const readProfileFromForm = (form: HTMLFormElement): VoiceProfile => {
    const fd = new FormData(form);
    return {
      preset:     (fd.get('preset')     as VoicePreset) ?? 'none',
      pitchShift: parseFloat(fd.get('pitchShift') as string) || 0,
      eqLowGain:  parseFloat(fd.get('eqLowGain')  as string) || 0,
      eqHighGain: parseFloat(fd.get('eqHighGain') as string) || 0,
    };
  };

  new D({
    title: `Assign Voice: ${actorName}`,
    content,
    default: 'save',
    render: (html: JQuery) => {
      const form = html.find('form')[0] as HTMLFormElement;

      html.find('input[name=pitchShift]').on('input', function (this: HTMLInputElement) {
        html.find('#wea-pitch-val').text(this.value);
      });
      html.find('input[name=eqLowGain]').on('input', function (this: HTMLInputElement) {
        html.find('#wea-low-val').text(this.value);
      });
      html.find('input[name=eqHighGain]').on('input', function (this: HTMLInputElement) {
        html.find('#wea-high-val').text(this.value);
      });

      // Live apply: rebuild the headphone preview and — when this actor is the pinned live
      // voice — the outgoing chain (muted above, so only the GM hears the tuning). Debounced:
      // range inputs fire continuously while dragging and a chain rebuild per event would glitch.
      let applyTimer: number | undefined;
      const applyLive = (): void => {
        window.clearTimeout(applyTimer);
        applyTimer = window.setTimeout(() => {
          const p = readProfileFromForm(form);
          if (voicePreviewer.isActive()) voicePreviewer.update(p);
          if (isLiveVoiceActor(actorId)) {
            void voiceChangerProcessor.applyProfile(p).catch(() => { /* preview keeps running */ });
          }
        }, 120);
      };
      html.find('select[name=preset], input[type=range]').on('input change', applyLive);

      const btn = html.find('#wea-preview-btn');
      const setBtnState = (on: boolean): void => {
        btn.html(
          on
            ? '<i class="fas fa-stop"></i> Stop preview'
            : '<i class="fas fa-headphones"></i> Preview my voice',
        );
      };
      btn.on('click', () => {
        if (voicePreviewer.isActive()) {
          voicePreviewer.stop();
          setBtnState(false);
          return;
        }
        voicePreviewer
          .start(readProfileFromForm(form))
          .then(() => setBtnState(true))
          .catch((err: unknown) => {
            ui.notifications?.warn(`Within Earshot: preview failed — ${String(err)}`);
          });
      });
    },
    close: () => {
      voicePreviewer.stop();
      if (canMuteLive) {
        voiceChangerProcessor.setOutputMuted(false);
        // Re-apply the persisted profile: reverts live tuning on Cancel, and after Save the
        // persisted profile is already the new one, so this is correct either way.
        if (isLiveVoiceActor(actorId)) {
          const stored = game.actors?.get(actorId);
          const saved = stored ? (getVoiceProfileForActor(stored) ?? { preset: 'none' as VoicePreset }) : null;
          if (saved) void voiceChangerProcessor.applyProfile(saved).catch(() => { /* */ });
        }
      }
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
            ...readProfileFromForm(form),
          };

          await persistVoiceProfileFlag(targetActor, newProfile);

          if (isLiveVoiceActor(targetActor.id as string)) {
            void voiceChangerProcessor.applyProfile(newProfile).catch((err: unknown) => {
              ui.notifications?.warn(
                `Within Earshot: could not apply voice — ${String(err)}`,
              );
            });
          }
        },
      },
      cancel: { label: 'Cancel' },
    },
  }).render(true);
}
