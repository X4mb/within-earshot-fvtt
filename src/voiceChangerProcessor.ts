import { PITCH_SHIFT_WORKLET_CODE } from './pitchShiftWorklet.js';
import { pushAvSessionLog } from './avSessionLog.js';
import type { VoiceProfile, VoicePreset } from './voiceProfile.js';

type State = 'uninitialized' | 'initializing' | 'ready' | 'disposed';

interface ActiveChain {
  workletNode: AudioWorkletNode | null;
  filters: AudioNode[];
  ringOsc: OscillatorNode | null;
  outputGain: GainNode;
}

class VoiceChangerProcessor {
  private ctx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private destNode: MediaStreamAudioDestinationNode | null = null;
  private processedStream: MediaStream | null = null;
  private chain: ActiveChain | null = null;
  private state: State = 'uninitialized';
  private workletReady = false;
  private workletFailed = false;
  private pendingProfile: VoiceProfile | null = null;
  private workletBlobUrl: string | null = null;

  isInitialized(): boolean {
    return this.state === 'ready';
  }

  getProcessedStream(): MediaStream | null {
    return this.processedStream;
  }

  /** True when the track is this processor's output (lets callers avoid re-processing it). */
  ownsTrack(track: MediaStreamTrack): boolean {
    return this.processedStream?.getAudioTracks().includes(track) ?? false;
  }

  async initialize(micStream: MediaStream): Promise<void> {
    if (this.state === 'initializing') return;
    // Re-initialization (new mic stream after a device switch) tears down the old graph first.
    if (this.state !== 'uninitialized') this.reset();
    this.state = 'initializing';
    try {
      this.ctx = new AudioContext({ sampleRate: 48000 });
      this.resumeWhenAllowed();

      this.sourceNode = this.ctx.createMediaStreamSource(micStream);
      this.destNode = this.ctx.createMediaStreamDestination();
      this.processedStream = this.destNode.stream;

      await this.ensureWorklet();

      await this.buildChain(this.pendingProfile ?? { preset: 'none' });
      this.pendingProfile = null;

      this.state = 'ready';
      pushAvSessionLog('voiceChanger:initialized', {});
    } catch (err) {
      this.state = 'uninitialized';
      throw err;
    }
  }

  async applyProfile(profile: VoiceProfile | null): Promise<void> {
    if (this.state === 'disposed') return;
    if (this.state !== 'ready') {
      this.pendingProfile = profile;
      return;
    }
    await this.buildChain(profile ?? { preset: 'none' });
    pushAvSessionLog('voiceChanger:applyProfile', { preset: profile?.preset ?? 'none' });
  }

  dispose(): void {
    if (this.state === 'disposed') return;
    this.tearDownChain();
    try { this.sourceNode?.disconnect(); } catch { /* */ }
    try { this.ctx?.close(); } catch { /* */ }
    if (this.workletBlobUrl) {
      URL.revokeObjectURL(this.workletBlobUrl);
      this.workletBlobUrl = null;
    }
    this.ctx = null;
    this.sourceNode = null;
    this.destNode = null;
    this.processedStream = null;
    this.chain = null;
    this.state = 'disposed';
    this.workletReady = false;
    this.workletFailed = false;
    this.pendingProfile = null;
    pushAvSessionLog('voiceChanger:disposed', {});
  }

  reset(): void {
    this.dispose();
    this.state = 'uninitialized';
  }

  /**
   * Never `await ctx.resume()` here: under autoplay policy the promise can stay pending until a
   * user gesture, which would stall the whole A/V connect inside initializeLocalStream.
   */
  private resumeWhenAllowed(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'suspended') return;
    void ctx.resume().catch(() => { /* retried on next gesture */ });
    window.addEventListener(
      'pointerdown',
      () => {
        if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => { /* */ });
      },
      { once: true },
    );
  }

  private async ensureWorklet(): Promise<void> {
    if (this.workletReady || this.workletFailed || !this.ctx) return;
    try {
      const blob = new Blob([PITCH_SHIFT_WORKLET_CODE], { type: 'application/javascript' });
      this.workletBlobUrl = URL.createObjectURL(blob);
      await this.ctx.audioWorklet.addModule(this.workletBlobUrl);
      this.workletReady = true;
    } catch (err) {
      console.warn('[withinearshot] Pitch shift worklet unavailable (CSP or browser issue). EQ-only mode active.', err);
      this.workletFailed = true;
    }
  }

  private async buildChain(profile: VoiceProfile): Promise<void> {
    if (!this.ctx || !this.sourceNode || !this.destNode) return;

    this.tearDownChain();

    const ctx = this.ctx;
    const preset: VoicePreset = profile.preset ?? 'none';
    const outputGain = ctx.createGain();
    outputGain.connect(this.destNode);

    const filters: AudioNode[] = [];
    let workletNode: AudioWorkletNode | null = null;
    let ringOsc: OscillatorNode | null = null;

    /** Slider at 0 (or unset) means "use the preset's character" — Deep/High shift by default. */
    const presetDefaultShift = preset === 'deep' ? -4 : preset === 'high' ? 4 : 0;
    const pitchShift = profile.pitchShift || presetDefaultShift;
    const pitchFactor = Math.pow(2, pitchShift / 12);

    let head: AudioNode = this.sourceNode;

    if (preset === 'none') {
      head.connect(outputGain);
      outputGain.gain.value = 1.0;
      this.chain = { workletNode: null, filters, ringOsc: null, outputGain };
      return;
    }

    // Pitch shift via worklet (skip if preset doesn't use it or worklet failed)
    const wantPitch =
      (preset === 'deep' || preset === 'high' || preset === 'custom') &&
      Math.abs(pitchFactor - 1.0) > 0.001 &&
      this.workletReady;

    if (wantPitch && !this.workletFailed) {
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

    this.chain = { workletNode, filters, ringOsc, outputGain };
  }

  private tearDownChain(): void {
    if (!this.chain) return;
    const { workletNode, filters, ringOsc, outputGain } = this.chain;
    try { ringOsc?.stop(); } catch { /* */ }
    try { ringOsc?.disconnect(); } catch { /* */ }
    for (const node of filters) {
      try { node.disconnect(); } catch { /* */ }
    }
    try { workletNode?.disconnect(); } catch { /* */ }
    try { outputGain.disconnect(); } catch { /* */ }
    try { this.sourceNode?.disconnect(); } catch { /* */ }
    this.chain = null;
  }
}

export const voiceChangerProcessor = new VoiceChangerProcessor();
