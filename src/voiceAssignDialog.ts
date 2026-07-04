import { getVoiceProfileForActor } from './voiceProfile.js';
import { persistVoiceProfileFlag } from './voiceProfileSet.js';
import { voiceChangerProcessor } from './voiceChangerProcessor.js';
import { voicePreviewer } from './voicePreview.js';
import { getVoiceTokenIdFromUser } from './voiceToken.js';
import type { VoicePreset, VoiceProfile } from './voiceProfile.js';

const PRESETS: { value: VoicePreset; label: string }[] = [
  { value: 'none',      label: 'None (passthrough)' },
  { value: 'deep',      label: 'Deep' },
  { value: 'high',      label: 'High' },
  { value: 'feminine',  label: 'Female (male → female)' },
  { value: 'masculine', label: 'Male (female → male)' },
  { value: 'whisper',   label: 'Whisper' },
  { value: 'custom',    label: 'Custom' },
];

type SliderValues = {
  pitchShift: number;
  eqLowGain: number;
  eqHighGain: number;
  distortion: number;
  echo: number;
};

const SLIDER_DEFAULTS: SliderValues = { pitchShift: 0, eqLowGain: 0, eqHighGain: 0, distortion: 0, echo: 0 };

/**
 * Selecting a preset loads its recipe into the sliders (starting point, then tweak freely).
 * 'custom' keeps whatever is set; 'none' zeroes everything (true passthrough).
 */
const PRESET_RECIPES: Record<VoicePreset, SliderValues | null> = {
  none:    { ...SLIDER_DEFAULTS },
  deep:    { pitchShift: -4, eqLowGain: 6,  eqHighGain: -4, distortion: 0,  echo: 0 },
  high:    { pitchShift: 4,  eqLowGain: -4, eqHighGain: 4,  distortion: 0,  echo: 0 },
  // M→F: raise pitch into the female median range; cut chest resonance hard (a pitched-up voice
  // with male chest weight reads as "small man", not as female); brighten for head-voice timbre.
  feminine: { pitchShift: 4.5, eqLowGain: -8, eqHighGain: 5, distortion: 0, echo: 0 },
  // F→M: mirror — lower pitch, rebuild chest weight, darken the top end.
  masculine: { pitchShift: -4.5, eqLowGain: 7, eqHighGain: -4, distortion: 0, echo: 0 },
  robot:   { pitchShift: 0,  eqLowGain: 0,  eqHighGain: 2,  distortion: 15, echo: 0 },
  whisper: { pitchShift: 0,  eqLowGain: 0,  eqHighGain: 3,  distortion: 0,  echo: 0 },
  custom:  null,
};

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
  const distortion = profile.distortion ?? 0;
  const echo       = profile.echo       ?? 0;

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

  const slider = (name: string, label: string, valId: string, min: number, max: number, step: number, value: number): string => `
      <div class="form-group" style="margin-top:8px">
        <label>${label}: <span id="${valId}">${value}</span></label>
        <input type="range" name="${name}" min="${min}" max="${max}" step="${step}"
               value="${value}" style="width:100%">
      </div>`;

  const content = `
    <form>
      <input type="hidden" name="actorId" value="${actorId}">
      ${muteHint}
      <div class="form-group">
        <label><b>Voice Preset</b></label>
        <select name="preset" style="width:100%">${presetOptions}</select>
        <p class="notes" style="margin:2px 0 0">Presets load starting values into the sliders — tweak from there.</p>
      </div>
      ${slider('pitchShift', 'Pitch shift (semitones)', 'wea-pitch-val', -12, 12, 0.5, pitchShift)}
      ${slider('eqLowGain', 'Bass (dB)', 'wea-low-val', -18, 18, 1, eqLowGain)}
      ${slider('eqHighGain', 'Treble (dB)', 'wea-high-val', -18, 18, 1, eqHighGain)}
      ${slider('distortion', 'Growl (distortion)', 'wea-growl-val', 0, 100, 5, distortion)}
      ${slider('echo', 'Echo (cave/spirit)', 'wea-echo-val', 0, 100, 5, echo)}
      <div class="form-group" style="margin-top:12px; display:flex; gap:6px">
        <button type="button" id="wea-preview-btn" style="flex:1">
          <i class="fas fa-headphones"></i> Preview my voice
        </button>
        <button type="button" id="wea-reset-btn" title="Reset all sliders to 0" style="flex:0 0 auto">
          <i class="fas fa-undo"></i>
        </button>
      </div>
      <p class="notes" style="margin:4px 0 0">
        Hear yourself with these settings, live as you adjust them. Always open mic —
        push-to-talk does not apply here. Use headphones — on speakers the mic picks the
        playback up again.
      </p>
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
      distortion: parseFloat(fd.get('distortion') as string) || 0,
      echo:       parseFloat(fd.get('echo')       as string) || 0,
    };
  };

  new D({
    title: `Assign Voice: ${actorName}`,
    content,
    default: 'save',
    render: (html: JQuery) => {
      const form = html.find('form')[0] as HTMLFormElement;

      const VALUE_LABELS: Record<keyof SliderValues, string> = {
        pitchShift: '#wea-pitch-val',
        eqLowGain:  '#wea-low-val',
        eqHighGain: '#wea-high-val',
        distortion: '#wea-growl-val',
        echo:       '#wea-echo-val',
      };
      const setSlider = (name: keyof SliderValues, value: number): void => {
        html.find(`input[name=${name}]`).val(String(value));
        html.find(VALUE_LABELS[name]).text(String(value));
      };
      for (const name of Object.keys(VALUE_LABELS) as (keyof SliderValues)[]) {
        html.find(`input[name=${name}]`).on('input', function (this: HTMLInputElement) {
          html.find(VALUE_LABELS[name]).text(this.value);
        });
      }

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
      html.find('input[type=range]').on('input change', applyLive);

      // Preset change loads its recipe into the sliders, then applies.
      html.find('select[name=preset]').on('change', function (this: HTMLSelectElement) {
        const recipe = PRESET_RECIPES[this.value as VoicePreset];
        if (recipe) {
          for (const [name, value] of Object.entries(recipe)) {
            setSlider(name as keyof SliderValues, value);
          }
        }
        applyLive();
      });

      html.find('#wea-reset-btn').on('click', () => {
        for (const [name, value] of Object.entries(SLIDER_DEFAULTS)) {
          setSlider(name as keyof SliderValues, value);
        }
        applyLive();
      });

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
      // Recovery net: if something ended the live mic capture (e.g. a device conflict from a
      // second getUserMedia), re-acquire it — otherwise the GM stays silent to players.
      const raw = voiceChangerProcessor.getRawInputStream();
      if (raw && raw.getAudioTracks().length > 0 && raw.getAudioTracks().every((t) => t.readyState === 'ended')) {
        console.warn('[withinearshot] live mic track dead after dialog close — re-acquiring');
        const client = game.webrtc?.client as unknown as
          | { updateLocalStream?: () => Promise<void> }
          | undefined;
        void client?.updateLocalStream?.()?.catch?.(() => { /* */ });
      }
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
