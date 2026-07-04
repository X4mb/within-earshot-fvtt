import type { VoiceProfile, VoicePreset } from './voiceProfile.js';

export interface VoiceChainNodes {
  workletNode: AudioWorkletNode | null;
  filters: AudioNode[];
  ringOsc: OscillatorNode | null;
  outputGain: GainNode;
}

/**
 * Wire source → (preset processing) → outputGain → sink inside ctx and return the created nodes.
 * Shared by the live processor (sink = MediaStreamAudioDestinationNode feeding peers) and the
 * dialog preview (sink = ctx.destination, the GM's own speakers) so both hear the same chain.
 * Callers own teardown via teardownVoiceChain. workletAvailable gates the pitch-shift stage.
 */
export function buildVoiceChain(
  ctx: AudioContext,
  source: AudioNode,
  sink: AudioNode,
  profile: VoiceProfile,
  workletAvailable: boolean,
): VoiceChainNodes {
  const preset: VoicePreset = profile.preset ?? 'none';
  const outputGain = ctx.createGain();
  outputGain.connect(sink);

  const filters: AudioNode[] = [];
  let workletNode: AudioWorkletNode | null = null;
  let ringOsc: OscillatorNode | null = null;

  /** Slider at 0 (or unset) means "use the preset's character" — Deep/High shift by default. */
  const presetDefaultShift = preset === 'deep' ? -4 : preset === 'high' ? 4 : 0;
  const pitchShift = profile.pitchShift || presetDefaultShift;
  const pitchFactor = Math.pow(2, pitchShift / 12);

  let head: AudioNode = source;

  if (preset === 'none') {
    head.connect(outputGain);
    outputGain.gain.value = 1.0;
    return { workletNode: null, filters, ringOsc: null, outputGain };
  }

  // Pitch shift via worklet (skip if preset doesn't use it or worklet failed)
  const wantPitch =
    (preset === 'deep' || preset === 'high' || preset === 'custom') &&
    Math.abs(pitchFactor - 1.0) > 0.001 &&
    workletAvailable;

  if (wantPitch) {
    workletNode = new AudioWorkletNode(ctx, 'withinearshot-pitch-shift', {
      parameterData: { pitchFactor },
    });
    head.connect(workletNode);
    head = workletNode;
    filters.push(workletNode);
  }

  if (preset === 'deep') {
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 200;
    low.gain.value = 3;

    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 6000;
    high.gain.value = -4;

    head.connect(low);
    low.connect(high);
    high.connect(outputGain);
    filters.push(low, high);
    outputGain.gain.value = 1.0;
  } else if (preset === 'high') {
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 300;
    low.gain.value = -3;

    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 3000;
    high.gain.value = 3;

    head.connect(low);
    low.connect(high);
    high.connect(outputGain);
    filters.push(low, high);
    outputGain.gain.value = 1.0;
  } else if (preset === 'robot') {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1000;
    bp.Q.value = 0.8;

    // Ring modulator: multiply signal by oscillator
    const ringGain = ctx.createGain();
    ringGain.gain.value = 0; // oscillator drives this AudioParam

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 60;
    osc.connect(ringGain.gain);
    osc.start();
    ringOsc = osc;

    head.connect(bp);
    bp.connect(ringGain);
    ringGain.connect(outputGain);
    filters.push(bp, ringGain);
    outputGain.gain.value = 0.8;
  } else if (preset === 'whisper') {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4000;

    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 800;
    mid.gain.value = -6;

    head.connect(lp);
    lp.connect(mid);
    mid.connect(outputGain);
    filters.push(lp, mid);
    outputGain.gain.value = 0.35;
  } else {
    // custom
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 200;
    low.gain.value = profile.eqLowGain ?? 0;

    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 6000;
    high.gain.value = profile.eqHighGain ?? 0;

    head.connect(low);
    low.connect(high);
    high.connect(outputGain);
    filters.push(low, high);
    outputGain.gain.value = 1.0;
  }

  return { workletNode, filters, ringOsc, outputGain };
}

export function teardownVoiceChain(chain: VoiceChainNodes | null, source?: AudioNode | null): void {
  if (!chain) return;
  const { workletNode, filters, ringOsc, outputGain } = chain;
  try { ringOsc?.stop(); } catch { /* */ }
  try { ringOsc?.disconnect(); } catch { /* */ }
  for (const node of filters) {
    try { node.disconnect(); } catch { /* */ }
  }
  try { workletNode?.disconnect(); } catch { /* */ }
  try { outputGain.disconnect(); } catch { /* */ }
  try { source?.disconnect(); } catch { /* */ }
}
